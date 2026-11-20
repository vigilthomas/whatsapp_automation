"use client";

/**
 * Settings → Business type: what this install calls its business,
 * customers, staff and bookings (app_branding.vocabulary, migration 064,
 * see src/lib/vocabulary.ts).
 *
 * Picking a sector fills in its words; each word can then be changed.
 * Every screen, the WhatsApp booking replies and the AI assistant use
 * these words, so one codebase reads right for a clinic, a salon or an
 * agency. Same editors as Branding (the install's owners/admins and the
 * super admin, `can_edit_branding`).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useBranding } from "@/hooks/use-branding";
import {
  SECTORS,
  TERM_KEYS,
  TERM_MAX,
  defaultSector,
  fillTerms,
  parseVocabulary,
  presetTerms,
  resolveTerms,
  type Sector,
  type TermKey,
  type Vocabulary,
} from "@/lib/vocabulary";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

export function BusinessTypePanel() {
  const t = useTranslations("Settings.business");
  const locale = useLocale();
  const confirm = useConfirm();
  const { branding, loaded, available, canEdit, hasVocabulary, save } = useBranding();
  const saved = useMemo(() => parseVocabulary(branding.vocabulary), [branding.vocabulary]);
  const [draft, setDraft] = useState<Vocabulary>(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(saved), [saved]);

  const sector: Sector = draft.sector ?? defaultSector();
  const preset = presetTerms(sector, locale);
  const words = resolveTerms(draft, locale);
  const readOnly = !canEdit || !available || !hasVocabulary;
  const clean = parseVocabulary(draft);
  const dirty = JSON.stringify(clean) !== JSON.stringify(saved);

  const pickSector = (s: Sector) => setDraft({ sector: s });
  const setWord = (key: TermKey, form: "one" | "many", value: string) =>
    setDraft((d) => ({
      ...d,
      sector: d.sector ?? sector,
      terms: { ...d.terms, [key]: { ...d.terms?.[key], [form]: value } },
    }));

  const onSave = async () => {
    const ok = await confirm({ title: t("saveTitle"), description: t("saveDesc"), confirmLabel: t("save") });
    if (!ok) return;
    setSaving(true);
    const error = await save({ vocabulary: clean });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success(t("saved"));
  };

  // A few real sentences from the app, so the choice can be judged in
  // context. They're written as [[!word]] in the messages so the app-wide
  // filler leaves them alone; here they're filled with the unsaved words.
  const examples = (["example1", "example2", "example3"] as const).map((k) =>
    fillTerms(String(t.raw(k)).replaceAll("[[!", "[["), words, branding.title || undefined),
  );

  return (
    <section className="max-w-4xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      {loaded && available && !hasVocabulary && (
        <p className="mb-4 rounded-lg border border-warn-fg/30 bg-warn-bg px-3.5 py-2.5 text-sm text-warn-fg">{t("notReady")}</p>
      )}
      {available && !canEdit && (
        <p className="mb-4 rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">{t("readOnly")}</p>
      )}

      <div className="space-y-5">
        <SectionCard title={t("sector")}>
          <p className="mb-3 text-xs text-muted-foreground">{t("sectorHint")}</p>
          <div role="radiogroup" aria-label={t("sector")} className="grid gap-2.5 sm:grid-cols-4">
            {SECTORS.map((s) => {
              const on = s === sector;
              const p = presetTerms(s, locale);
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={readOnly}
                  onClick={() => pickSector(s)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    on ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted",
                  )}
                >
                  <span className="block text-sm font-semibold text-foreground">{t(`sectors.${s}`)}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {p.customer.many} · {p.staff.many} · {p.booking.many}
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title={t("words")}>
          <p className="mb-3 text-xs text-muted-foreground">{t("wordsHint")}</p>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-[140px_1fr_1fr]">
            <span className="hidden sm:block" />
            <span className="hidden text-xs font-semibold text-muted-foreground sm:block">{t("singular")}</span>
            <span className="hidden text-xs font-semibold text-muted-foreground sm:block">{t("plural")}</span>
            {TERM_KEYS.map((key) => (
              <div key={key} className="contents">
                <Label className="self-center text-sm">{t(`terms.${key}`)}</Label>
                <Input
                  aria-label={`${t(`terms.${key}`)} — ${t("singular")}`}
                  maxLength={TERM_MAX}
                  disabled={readOnly}
                  placeholder={preset[key].one}
                  value={draft.terms?.[key]?.one ?? ""}
                  onChange={(e) => setWord(key, "one", e.target.value)}
                />
                <Input
                  aria-label={`${t(`terms.${key}`)} — ${t("plural")}`}
                  maxLength={TERM_MAX}
                  disabled={readOnly}
                  placeholder={draft.terms?.[key]?.one || preset[key].many}
                  value={draft.terms?.[key]?.many ?? ""}
                  onChange={(e) => setWord(key, "many", e.target.value)}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("preview")}>
          <ul className="space-y-1.5 text-sm text-foreground">
            {examples.map((e) => (
              <li key={e} className="rounded-lg bg-muted px-3 py-2">
                {e}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={readOnly || !dirty || saving} onClick={onSave}>
              {saving ? t("saving") : t("save")}
            </Button>
            <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
              {t("discard")}
            </Button>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
