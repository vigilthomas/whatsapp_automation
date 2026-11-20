'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, MessageSquare, CalendarDays } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { useTheme } from '@/hooks/use-theme';
import {
  DEFAULT_COLORS,
  darkAccent,
  inkOn,
  isHexColor,
  logoShapeClass,
  type Branding,
  type ColorKey,
} from '@/lib/branding';
import { cn } from '@/lib/utils';
import { DEFAULT_APP_NAME } from "@/lib/vocabulary";

/** Clinicoro's dark-mode colours (globals.css). Dark mode keeps these and only takes the main colour. */
const DARK = {
  sidebar_bg: '#0F1D2C',
  sidebar_text: '#8A9AA8',
  title_color: '#E6EDF3',
  subtitle_color: '#8A9AA8',
  theme_text: '#E6EDF3',
  theme_muted: '#8A9AA8',
  theme_bg: '#0B1622',
  theme_surface: '#112233',
  theme_danger: '#F3A097',
};

/**
 * A small picture of the app with the draft branding, in light or dark
 * mode — the same rules as brandingCss(): light mode takes every colour,
 * dark mode keeps the navy look and only takes the main colour (or the
 * sidebar highlight when no main colour is set), lightened to stand out.
 */
export function BrandingPreview({ draft }: { draft: Branding }) {
  const t = useTranslations('Settings.branding');
  const tSidebar = useTranslations('Sidebar');
  const { mode: appMode } = useTheme();
  // Follows the app's mode until someone flips the switch here.
  const [picked, setMode] = useState<'light' | 'dark' | null>(null);
  const mode = picked ?? (appMode === 'dark' ? 'dark' : 'light');

  const light = (k: ColorKey) =>
    isHexColor(draft[k]) ? (draft[k] as string) : DEFAULT_COLORS[k];
  const chosen = isHexColor(draft.theme_primary)
    ? draft.theme_primary
    : isHexColor(draft.sidebar_accent)
      ? draft.sidebar_accent
      : null;
  const accent = darkAccent(chosen ?? '#0E9F9A');
  const c = (k: ColorKey): string => {
    if (mode === 'light') return light(k);
    if (k === 'theme_primary' || k === 'sidebar_accent') return accent;
    return DARK[k];
  };
  const ink = (bg: string) => (mode === 'dark' ? inkOn(bg) : '#FFFFFF');
  const rows = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: MessageSquare, label: 'Inbox' },
    { icon: CalendarDays, label: 'Appointments' },
  ];
  return (
    <div className="space-y-2">
      <div className="border-border inline-flex rounded-lg border p-0.5 text-xs">
        {(['light', 'dark'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              'rounded-md px-2.5 py-1 transition-colors',
              mode === m
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(m === 'light' ? 'previewLight' : 'previewDark')}
          </button>
        ))}
      </div>
      <div
        aria-label="Preview"
        className="border-border flex overflow-hidden rounded-xl border text-[11px] shadow-sm"
        style={{ background: c('theme_bg'), minHeight: 190 }}
      >
        <div
          className="flex w-[42%] flex-col gap-2 p-3"
          style={{ background: c('sidebar_bg'), color: c('sidebar_text') }}
        >
          <div className="flex items-center gap-2">
            {draft.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: or https logo, preview only
              <img
                src={draft.logo}
                alt=""
                className={cn('h-6 w-6', logoShapeClass(draft.logo_shape))}
              />
            ) : (
              <Logo className="h-6 w-6" title="" />
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <strong
                className="truncate text-[12px]"
                style={{ color: c('title_color') }}
              >
                {draft.title || DEFAULT_APP_NAME}
              </strong>
              <span
                className="truncate text-[9px]"
                style={{ color: c('subtitle_color') }}
              >
                {draft.subtitle || tSidebar("tagline")}
              </span>
            </span>
          </div>
          {rows.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1"
              style={
                active
                  ? {
                      background: `color-mix(in oklab, ${c('sidebar_accent')} 14%, transparent)`,
                      color: c('sidebar_accent'),
                    }
                  : undefined
              }
            >
              <Icon className="size-3" />
              {label}
            </div>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div
            className="rounded-lg p-2.5"
            style={{ background: c('theme_surface'), color: c('theme_text') }}
          >
            <strong className="block text-[12px]">
              Today&apos;s appointments
            </strong>
            <span style={{ color: c('theme_muted') }}>
              3 booked · 1 waiting
            </span>
            <div className="mt-2 flex gap-1.5">
              <span
                className="rounded px-2 py-0.5"
                style={{
                  background: c('theme_primary'),
                  color: ink(c('theme_primary')),
                }}
              >
                Book
              </span>
              <span
                className="rounded px-2 py-0.5"
                style={{
                  background: c('theme_danger'),
                  color: ink(c('theme_danger')),
                }}
              >
                Cancel
              </span>
            </div>
          </div>
        </div>
      </div>
      {mode === 'dark' ? (
        <p className="text-muted-foreground text-xs">{t('previewDarkNote')}</p>
      ) : null}
    </div>
  );
}
