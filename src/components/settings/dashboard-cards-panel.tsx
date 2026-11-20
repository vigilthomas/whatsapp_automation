"use client";

/**
 * Settings → Dashboard: the template a user starts from, and the name and
 * icon of every dashboard card (app_branding.dashboard, migration 064, see
 * lib/dashboard/cards.ts). Users still arrange their own dashboards; this
 * only sets defaults and wording. Same editors as Branding.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LayoutDashboard, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/ui/section-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useBranding } from "@/hooks/use-branding";
import { BRAND_ICON_KEYS } from "@/lib/branding-icon-keys";
import { BRAND_ICONS } from "@/lib/branding-icons";
import {
  CARDS,
  CARD_TITLE_MAX,
  DASHBOARD_TEMPLATES,
  parseDashboardSettings,
  templateLayout,
  type CardText,
  type DashboardSettings,
} from "@/lib/dashboard/cards";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

export function DashboardCardsPanel() {
  const t = useTranslations("Settings.dashboardCards");
  const tGrid = useTranslations("Dashboard.grid");
  const tCards = useTranslations("Dashboard.cards");
  const { branding, loaded, available, canEdit, hasVocabulary, save } = useBranding();
  const saved = useMemo(() => parseDashboardSettings(branding.dashboard, BRAND_ICON_KEYS), [branding.dashboard]);
  const [draft, setDraft] = useState<DashboardSettings>(saved);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(saved), [saved]);

  const readOnly = !canEdit || !available || !hasVocabulary;
  const clean = parseDashboardSettings(draft, BRAND_ICON_KEYS);
  const dirty = JSON.stringify(clean) !== JSON.stringify(saved);
  const template = draft.template ?? "classic";

  // Classic cards first, then the ones only the modern template starts with.
  const classic = new Set(templateLayout("classic").cards);
  const ordered = [...CARDS].sort((a, b) => Number(!classic.has(a.id)) - Number(!classic.has(b.id)));

  const setCard = (id: string, patch: Partial<CardText>) =>
    setDraft((d) => ({ ...d, cards: { ...d.cards, [id]: { ...d.cards?.[id], ...patch } } }));
  const resetCard = (id: string) =>
    setDraft((d) => {
      const cards = { ...d.cards };
      delete cards[id];
      return { ...d, cards };
    });

  const onSave = async () => {
    setSaving(true);
    const error = await save({ dashboard: clean });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success(t("saved"));
  };

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
        <SectionCard title={t("defaultTemplate")}>
          <p className="mb-3 text-xs text-muted-foreground">{t("defaultTemplateHint")}</p>
          <div role="radiogroup" aria-label={t("defaultTemplate")} className="grid gap-2.5 sm:grid-cols-2">
            {DASHBOARD_TEMPLATES.map((tpl) => {
              const on = tpl === template;
              return (
                <button
                  key={tpl}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={readOnly}
                  onClick={() => setDraft((d) => ({ ...d, template: tpl }))}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    on ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted",
                  )}
                >
                  <LayoutDashboard className="mt-0.5 size-4 text-muted-foreground" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{tGrid(`templates.${tpl}`)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{tGrid(`templateDesc.${tpl}`)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title={t("cards")}>
          <p className="mb-3 text-xs text-muted-foreground">{t("cardsHint")}</p>
          <ul className="divide-y divide-border">
            {ordered.map((card) => {
              const own = draft.cards?.[card.id];
              const fallback = tCards(card.id);
              const iconKey = own?.icon || card.icon;
              const Icon = BRAND_ICONS[iconKey];
              const name = own?.title || fallback;
              return (
                <li key={card.id} className="flex items-center gap-2.5 py-2.5">
                  <Popover>
                    <PopoverTrigger
                      disabled={readOnly}
                      aria-label={t("cardIcon", { name })}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-60"
                    >
                      {Icon && <Icon className="size-4" />}
                    </PopoverTrigger>
                    <PopoverContent className="w-[296px] p-2">
                      <div className="grid grid-cols-7 gap-1">
                        {BRAND_ICON_KEYS.map((key) => {
                          const I = BRAND_ICONS[key];
                          return (
                            <button
                              key={key}
                              type="button"
                              title={key}
                              aria-label={key}
                              onClick={() => setCard(card.id, { icon: key })}
                              className={cn("flex size-9 items-center justify-center rounded-md hover:bg-muted", iconKey === key && "bg-primary-soft text-primary")}
                            >
                              {I && <I className="size-4" />}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Input
                    aria-label={t("cardName", { name: fallback })}
                    maxLength={CARD_TITLE_MAX}
                    disabled={readOnly}
                    placeholder={fallback}
                    value={own?.title ?? ""}
                    onChange={(e) => setCard(card.id, { title: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={readOnly || !own}
                    onClick={() => resetCard(card.id)}
                    aria-label={t("resetCard")}
                    title={t("resetCard")}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                </li>
              );
            })}
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
