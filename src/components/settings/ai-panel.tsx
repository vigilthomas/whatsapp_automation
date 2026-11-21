"use client";

/**
 * Settings → AI assistant: the clinic's own AI provider and key, what the
 * assistant should know beyond the clinic facts, and who gets chats it
 * can't answer. Saved to ai_configs (029/033) via /api/ai/settings.
 *
 * Access control module `ai-assistant`: View/Read show this section, Edit
 * (plus an owner/admin role) saves it. The same module decides who sees the
 * Human / Bot switch in the inbox, so switching the module off for a role
 * removes the feature for everyone holding it.
 *
 * The assistant already knows the clinic's name, hours, holidays, services
 * and doctors; the instructions box is for everything else (prices,
 * parking, payment, tone).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/ui/section-card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { MAX_INSTRUCTIONS } from "@/lib/ai-chat/model";
import { AI_PROVIDERS, DEFAULT_MODELS, OLLAMA_DEFAULT_URL, PROVIDERS, isAiProvider, type AiProvider } from "@/lib/ai-chat/provider";
import { SettingsPanelHead } from "./settings-panel-head";

interface Form {
  provider: AiProvider;
  model: string;
  api_key: string;
  has_key: boolean;
  /** Server address, for a self-hosted provider (Ollama). */
  base_url: string | null;
  system_prompt: string;
  is_active: boolean;
  auto_reply_enabled: boolean;
  max_replies: number;
  handoff_agent_id: string | null;
}

const BLANK: Form = {
  provider: "anthropic",
  model: DEFAULT_MODELS.anthropic,
  api_key: "",
  has_key: false,
  base_url: null,
  system_prompt: "",
  is_active: false,
  auto_reply_enabled: false,
  max_replies: 5,
  handoff_agent_id: null,
};

const comparable = (f: Form) => JSON.stringify({ ...f, has_key: undefined });

export function AiPanel() {
  const t = useTranslations("Settings.ai");
  const confirm = useConfirm();
  const [saved, setSaved] = useState<Form>(BLANK);
  const [form, setForm] = useState<Form>(BLANK);
  const [members, setMembers] = useState<{ user_id: string; full_name: string | null; email?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, m] = await Promise.all([
          fetch("/api/ai/settings", { cache: "no-store" }).then((r) => r.json().then((d) => ({ ok: r.ok, d }))),
          fetch("/api/account/members", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { members: [] })),
        ]);
        if (!active) return;
        if (!s.ok) {
          toast.error(s.d.error ?? t("loadFailed"));
          return;
        }
        const f: Form = { ...BLANK, ...s.d, provider: isAiProvider(s.d.provider) ? s.d.provider : "anthropic", api_key: "" };
        setSaved(f);
        setForm(f);
        setMembers(Array.isArray(m.members) ? m.members : []);
      } catch {
        if (active) toast.error(t("loadFailed"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  const dirty = useMemo(() => comparable(form) !== comparable(saved), [form, saved]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const info = PROVIDERS[form.provider];
  const selfHosted = !info.baseUrl;

  async function save() {
    if (form.is_active && info.needsKey && !form.has_key && !form.api_key.trim()) {
      toast.error(t("keyNeeded"));
      return;
    }
    if (!(await confirm({ title: t("saveTitle"), description: t("saveDesc"), confirmLabel: t("save") }))) return;
    setSaving(true);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? t("saveFailed"));
        return;
      }
      const f: Form = { ...BLANK, ...d, provider: isAiProvider(d.provider) ? d.provider : "anthropic", api_key: "" };
      setSaved(f);
      setForm(f);
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-3xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          <>
            <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setForm(saved)}>
              {t("discard")}
            </Button>
            <Button type="button" disabled={!dirty || saving || loading} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t("saving") : t("save")}
            </Button>
          </>
        }
      />

      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("loading")}
        </p>
      ) : (
        <div className="space-y-4">
          <SectionCard>
            <label className="flex items-start gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v: boolean) => set("is_active", v)} aria-label={t("active")} />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Bot className="size-4 text-primary" /> {t("active")}
                </span>
                <span className="block text-xs text-muted-foreground">{t("activeHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-3">
              <Switch
                checked={form.auto_reply_enabled}
                onCheckedChange={(v: boolean) => set("auto_reply_enabled", v)}
                aria-label={t("newChatsBot")}
              />
              <span>
                <span className="block text-sm font-semibold text-foreground">{t("newChatsBot")}</span>
                <span className="block text-xs text-muted-foreground">{t("newChatsBotHint")}</span>
              </span>
            </label>
          </SectionCard>

          <SectionCard title={t("provider")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-provider">{t("provider")}</Label>
                <NativeSelect
                  id="ai-provider"
                  value={form.provider}
                  onChange={(e) => {
                    const p = e.target.value as AiProvider;
                    setForm((f) => ({
                      ...f,
                      provider: p,
                      model: f.model === DEFAULT_MODELS[f.provider] ? DEFAULT_MODELS[p] : f.model,
                      base_url: !PROVIDERS[p].baseUrl ? f.base_url || OLLAMA_DEFAULT_URL : f.base_url,
                    }));
                  }}
                  className="h-10 w-full"
                >
                  {AI_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {t(`providers.${p}`)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-model">{t("model")}</Label>
                <Input id="ai-model" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder={DEFAULT_MODELS[form.provider]} />
              </div>
            </div>
            {selfHosted && (
              <div className="space-y-1.5">
                <Label htmlFor="ai-base-url">{t("baseUrl")}</Label>
                <Input
                  id="ai-base-url"
                  inputMode="url"
                  autoComplete="off"
                  value={form.base_url ?? ""}
                  onChange={(e) => set("base_url", e.target.value)}
                  placeholder={OLLAMA_DEFAULT_URL}
                />
                <p className="text-xs text-muted-foreground">{t("baseUrlHint")}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ai-key" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5" /> {info.needsKey ? t("apiKey") : t("apiKeyOptional")}
              </Label>
              <PasswordInput
                id="ai-key"
                autoComplete="off"
                value={form.api_key}
                onChange={(e) => set("api_key", e.target.value)}
                placeholder={form.has_key ? t("keySaved") : t("keyPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{info.needsKey ? t("keyHint") : t("keyHintLocal")}</p>
            </div>
          </SectionCard>

          <SectionCard title={t("knowledge")}>
            <p className="text-xs text-muted-foreground">{t("knowledgeHint")}</p>
            <Textarea
              rows={7}
              maxLength={MAX_INSTRUCTIONS}
              value={form.system_prompt}
              onChange={(e) => set("system_prompt", e.target.value)}
              placeholder={t("instructionsPlaceholder")}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {form.system_prompt.length} / {MAX_INSTRUCTIONS}
            </p>
          </SectionCard>

          <SectionCard title={t("handoff")}>
            <p className="text-xs text-muted-foreground">{t("handoffHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-handoff">{t("handoffTo")}</Label>
                <NativeSelect
                  id="ai-handoff"
                  value={form.handoff_agent_id ?? ""}
                  onChange={(e) => set("handoff_agent_id", e.target.value || null)}
                  className="h-10 w-full"
                >
                  <option value="">{t("handoffAssigned")}</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email || m.user_id}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-max">{t("maxReplies")}</Label>
                <Input
                  id="ai-max"
                  type="number"
                  min={1}
                  max={20}
                  value={form.max_replies}
                  onChange={(e) => set("max_replies", Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                />
              </div>
            </div>
          </SectionCard>
        </div>
      )}
    </section>
  );
}
