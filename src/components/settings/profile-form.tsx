'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Upload, Trash2, Mail, CircleAlert } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoCropDialog } from '@/components/settings/logo-crop-dialog';
import { Crop } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { checkLogoUrl } from '@/lib/branding';
import { SettingsPanelHead } from './settings-panel-head';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

// Rough email shape check — the real validator is Supabase Auth, which
// rejects anything malformed when we call updateUser({ email }). We
// just want to stop obvious typos before making a network call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ProfileForm() {
  const t = useTranslations('Settings.profile');
  const tRoles = useTranslations('Settings.roles');
  const { user, profile, refreshProfile, accountRole, isSuperAdmin } = useAuth();
  const supabase = createClient();
  // The Role (designation, migration 043) the user was given in Users.
  // Read here rather than from `profile.role`: that column is the legacy
  // free-text field from 001, defaults to 'user' for everyone and is never
  // used for access. `undefined` = still loading, `null` = no role.
  const [designationName, setDesignationName] = useState<string | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  // The picked photo as a data: URL, kept so it can be (re)cropped — the same
  // crop dialog as Workspace → Branding, locked to a circle like the avatar.
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  // A photo from a link (https://…), staged until Save — same as Branding's logo link.
  const [avatarLink, setAvatarLink] = useState('');
  const [linkedAvatar, setLinkedAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [emailChangePending, setEmailChangePending] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    createClient()
      .from('profiles')
      .select('designation:designations(name)')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        const d = (data as { designation: { name: string } | { name: string }[] | null } | null)?.designation;
        const name = Array.isArray(d) ? d[0]?.name : d?.name;
        // A failed lookup (e.g. 043 not applied) reads as "no role".
        setDesignationName(error ? null : (name ?? null));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Seed form state once the profile loads.
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setEmail(profile.email ?? '');
  }, [profile]);

  // Cleanup object URLs to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const currentAvatar =
    previewUrl ?? linkedAvatar ?? (!removeAvatar ? profile?.avatar_url ?? null : null);

  const onUseLink = () => {
    const problem = checkLogoUrl(avatarLink);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(null);
    setPreviewUrl(null);
    setLinkedAvatar(avatarLink.trim());
    setAvatarLink('');
    setRemoveAvatar(false);
  };

  const initial = (fullName || profile?.full_name || profile?.email || 'U')
    .charAt(0)
    .toUpperCase();

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-picked
    if (!file) return;

    if (!ALLOWED_MIME.has(file.type)) {
      toast.error(t('unsupportedImage'), {
        description: t('unsupportedImageDesc'),
      });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t('imageTooLarge'), {
        description: t('imageTooLargeDesc'),
      });
      return;
    }

    // Crop first; the cropped image becomes the pending upload.
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setCropSource(reader.result);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  /** Use a cropped (or whole) data: URL as the photo to upload on save. */
  const onCropped = async (dataUrl: string) => {
    setCropOpen(false);
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type.split('/')[1] || 'png';
    const file = new File([blob], `avatar.${ext}`, { type: blob.type || 'image/png' });
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t('imageTooLarge'), { description: t('imageTooLargeDesc') });
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(file);
    setPreviewUrl(URL.createObjectURL(file));
    setLinkedAvatar(null);
    setRemoveAvatar(false);
  };

  const onRemoveAvatar = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingAvatar(null);
    setPreviewUrl(null);
    setCropSource(null);
    setLinkedAvatar(null);
    setRemoveAvatar(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast.error(t('nameRequired'));
      return;
    }
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      toast.error(t('invalidEmail'));
      return;
    }

    setSaving(true);
    try {
      let nextAvatarUrl: string | null = profile.avatar_url ?? null;

      // Upload a newly-staged image, if any.
      if (pendingAvatar) {
        const ext =
          pendingAvatar.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${user.id}/avatar-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, pendingAvatar, {
            cacheControl: '3600',
            upsert: true,
            contentType: pendingAvatar.type,
          });
        if (uploadError) {
          throw new Error(t('uploadFailed', { message: uploadError.message }));
        }
        const {
          data: { publicUrl },
        } = supabase.storage.from('avatars').getPublicUrl(path);
        nextAvatarUrl = publicUrl;
      } else if (linkedAvatar) {
        nextAvatarUrl = linkedAvatar;
      } else if (removeAvatar) {
        nextAvatarUrl = null;
      }

      // Persist name + avatar to profiles.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: trimmedName,
          avatar_url: nextAvatarUrl,
        })
        .eq('user_id', user.id);
      if (updateError) {
        throw new Error(t('saveFailed', { message: updateError.message }));
      }

      // Email change goes through Supabase Auth, which emails a
      // confirmation to both the old and new addresses. We don't
      // touch profiles.email — Supabase will push the change there
      // after the user clicks the link (handled by the handle_new_user
      // trigger pattern in production deployments).
      let emailSent = false;
      if (trimmedEmail.toLowerCase() !== profile.email.toLowerCase()) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: trimmedEmail,
        });
        if (emailError) {
          // Partial success: name/avatar saved but email didn't.
          toast.success(t('profileSaved'));
          toast.error(t('emailChangeFailed', { message: emailError.message }));
          setSaving(false);
          await refreshProfile();
          return;
        }
        emailSent = true;
      }

      setEmailChangePending(emailSent);
      setPendingAvatar(null);
      setPreviewUrl(null);
      setLinkedAvatar(null);
      setRemoveAvatar(false);
      await refreshProfile();

      toast.success(
        emailSent
          ? t('profileSavedEmailCheck')
          : t('profileSaved'),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    !!profile &&
    (fullName.trim() !== (profile.full_name ?? '') ||
      email.trim().toLowerCase() !== (profile.email ?? '').toLowerCase() ||
      pendingAvatar !== null ||
      linkedAvatar !== null ||
      removeAvatar);

  const joined = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '—';

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
      />
      <form onSubmit={onSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-6">
          {/* Avatar row */}
          <div className="flex flex-wrap items-center gap-5">
            <Avatar size="lg" className="size-16">
              {currentAvatar ? (
                <AvatarImage src={currentAvatar} alt={fullName || 'Avatar'} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-base text-primary">
                {initial}
              </AvatarFallback>
            </Avatar>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
              >
                <Upload className="size-4" />
                {currentAvatar ? t('changePhoto') : t('uploadPhoto')}
              </Button>
              {cropSource && pendingAvatar && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCropOpen(true)}
                  disabled={saving}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Crop className="size-4" />
                  Crop
                </Button>
              )}
              {currentAvatar && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onRemoveAvatar}
                  disabled={saving}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="size-4" />
                  {t('remove')}
                </Button>
              )}
              <div className="flex w-full flex-wrap items-center gap-2">
                <Input
                  className="h-8 max-w-xs text-sm"
                  placeholder={t('photoLink')}
                  value={avatarLink}
                  onChange={(e) => setAvatarLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (avatarLink.trim()) onUseLink();
                    }
                  }}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onUseLink}
                  disabled={saving || !avatarLink.trim()}
                >
                  {t('useLink')}
                </Button>
              </div>
              <p className="w-full text-xs text-muted-foreground">
                {t('photoHint')}
              </p>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="profile-full-name" className="text-foreground">
              {t('displayName')}
            </Label>
            <Input
              id="profile-full-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ada Lovelace"
              maxLength={120}
              disabled={saving}
              required
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="profile-email" className="text-foreground">
              {t('email')}
            </Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              required
            />
            {emailChangePending && (
              <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <Mail className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {t.rich('emailChangeHint', { 
                    oldEmail: profile?.email || '', 
                    newEmail: email,
                    bold: (chunks: React.ReactNode) => <strong>{chunks}</strong>
                  })}
                </span>
              </p>
            )}
          </div>

          {/* Read-only block */}
          <div className="rounded-lg border border-border bg-muted p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('accountDetails')}
            </p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">{t('designation')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {isSuperAdmin
                    ? t('superAdmin')
                    : designationName === undefined
                      ? '—'
                      : (designationName ?? t('noDesignation'))}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('role')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {isSuperAdmin ? tRoles('owner') : accountRole ? tRoles(accountRole) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('joined')}</dt>
                <dd className="mt-0.5 text-foreground">{joined}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t('userId')}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                  {user?.id ?? '—'}
                </dd>
              </div>
            </dl>
          </div>

          {!profile && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlert className="size-4" />
              {t('loading')}
            </p>
          )}

        </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !dirty || !profile}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('saveChanges')
            )}
          </Button>
        </div>
      </form>
      <LogoCropDialog
        src={cropOpen ? cropSource : null}
        shape="circle"
        fixedShape
        title="Crop your photo"
        onCancel={() => setCropOpen(false)}
        onDone={(url) => void onCropped(url)}
      />
    </section>
  );
}
