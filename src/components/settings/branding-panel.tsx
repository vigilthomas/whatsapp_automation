"use client";

/**
 * Settings → Branding: the clinic's name, logo, sidebar colours and page
 * colours. Ported from the base template's Access control → Branding
 * (presets, colour rows, preview, "use default colours", confirm on save).
 * A colour left at "Default" keeps Clinicoro's own value.
 */
import { SectionCard } from "@/components/ui/section-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Crop, ImageUp, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useBranding } from "@/hooks/use-branding";
import { buttonText, checkLogoFile, checkLogoUrl, sniffImage, COLOR_KEYS, DEFAULT_COLORS, isHexColor, LOCKSCREENS, lockscreenOf, TITLE_MAX, type Branding, type ColorKey } from "@/lib/branding";
import { LockscreenThumb } from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";
import { BrandingPreview } from "./branding-preview";
import { LogoCropDialog } from "./logo-crop-dialog";
import { LogoShapePicker } from "./logo-shape-picker";
import { SettingsPanelHead } from "./settings-panel-head";
import { DEFAULT_APP_NAME } from "@/lib/vocabulary";

const SIDEBAR_KEYS: ColorKey[] = ["sidebar_bg", "sidebar_text", "sidebar_accent", "title_color", "subtitle_color"];
const PAGE_KEYS: ColorKey[] = ["theme_primary", "theme_button_text", "theme_text", "theme_muted", "theme_bg", "theme_surface", "theme_danger"];

type Preset = { name: string; values: Partial<Record<ColorKey, string | null>> };
const nulls = (keys: ColorKey[]) => Object.fromEntries(keys.map((k) => [k, null]));

// The base template's presets, plus "Clinicoro" (= every colour left at default).
const SIDEBAR_PRESETS: Preset[] = [
  { name: DEFAULT_APP_NAME, values: nulls(SIDEBAR_KEYS) },
  { name: "Midnight", values: { sidebar_bg: "#0F172A", sidebar_text: "#FFFFFF", sidebar_accent: "#6366F1", title_color: "#FFFFFF", subtitle_color: "#B8976D" } },
  { name: "Forest", values: { sidebar_bg: "#0B3B2E", sidebar_text: "#F0FDF4", sidebar_accent: "#16A34A", title_color: "#FFFFFF", subtitle_color: "#FBBF24" } },
  { name: "Maroon", values: { sidebar_bg: "#4A0E1C", sidebar_text: "#FFF1F2", sidebar_accent: "#E11D48", title_color: "#FFFFFF", subtitle_color: "#FCD34D" } },
  { name: "Ocean", values: { sidebar_bg: "#0C4A6E", sidebar_text: "#F0F9FF", sidebar_accent: "#0EA5E9", title_color: "#FFFFFF", subtitle_color: "#7DD3FC" } },
  { name: "Charcoal", values: { sidebar_bg: "#1F2937", sidebar_text: "#F9FAFB", sidebar_accent: "#F59E0B", title_color: "#FFFFFF", subtitle_color: "#F59E0B" } },
  { name: "Light", values: { sidebar_bg: "#FFFFFF", sidebar_text: "#0F172A", sidebar_accent: "#4F46E5", title_color: "#0F172A", subtitle_color: "#B8976D" } },
];
// A preset resets the button text to automatic (null) so it never keeps a
// colour picked for a different main colour.
const PAGE_PRESETS: Preset[] = [
  { name: DEFAULT_APP_NAME, values: nulls(PAGE_KEYS) },
  { name: "Indigo", values: { theme_primary: "#6366F1", theme_text: "#0F172A", theme_muted: "#64748B", theme_bg: "#F1F5F9", theme_surface: "#FFFFFF", theme_danger: "#EF4444" } },
  { name: "Teal", values: { theme_primary: "#0D9488", theme_text: "#0F172A", theme_muted: "#5B6B7A", theme_bg: "#EEF6F5", theme_surface: "#FFFFFF", theme_danger: "#DC2626" } },
  { name: "Emerald", values: { theme_primary: "#059669", theme_text: "#052E16", theme_muted: "#4B6358", theme_bg: "#F0F7F2", theme_surface: "#FFFFFF", theme_danger: "#DC2626" } },
  { name: "Ocean", values: { theme_primary: "#0284C7", theme_text: "#0C1A2B", theme_muted: "#56708A", theme_bg: "#EFF6FB", theme_surface: "#FFFFFF", theme_danger: "#E11D48" } },
  { name: "Rose", values: { theme_primary: "#E11D48", theme_text: "#1F1416", theme_muted: "#7A5F66", theme_bg: "#FBF2F4", theme_surface: "#FFFFFF", theme_danger: "#B91C1C" } },
  { name: "Amber", values: { theme_primary: "#B45309", theme_text: "#1C1917", theme_muted: "#78716C", theme_bg: "#FAF7F2", theme_surface: "#FFFFFF", theme_danger: "#DC2626" } },
  { name: "Graphite", values: { theme_primary: "#334155", theme_text: "#0B0F14", theme_muted: "#64748B", theme_bg: "#F3F4F6", theme_surface: "#FFFFFF", theme_danger: "#DC2626" } },
].map((p) => ({ ...p, values: { theme_button_text: null, ...p.values } }));

const EDITABLE = ["title", "subtitle", "logo", "logo_shape", "lockscreen", ...COLOR_KEYS] as const;
type Editable = (typeof EDITABLE)[number];

const cleanText = (v: string | null) => (v && v.trim() ? v.trim().slice(0, TITLE_MAX) : null);

export function BrandingPanel() {
  const t = useTranslations("Settings.branding");
  const tSidebar = useTranslations("Sidebar");
  const { branding, loaded, available, canEdit, save } = useBranding();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Branding>(branding);
  const [logoLink, setLogoLink] = useState("");
  /** An uploaded image waiting in the crop dialog. */
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readOnly = !canEdit || !available;

  // Start from the saved branding once it has loaded.
  const [startedFrom, setStartedFrom] = useState(branding);
  if (startedFrom !== branding && !saving) {
    setStartedFrom(branding);
    setDraft(branding);
  }

  const changed = useMemo(
    () => EDITABLE.filter((k) => (k === "title" || k === "subtitle" ? cleanText(draft[k]) : draft[k]) !== branding[k]),
    [draft, branding],
  );
  const dirty = changed.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (k: Editable, v: string | null) => setDraft((d) => ({ ...d, [k]: v }));
  const applyPreset = (p: Preset) => setDraft((d) => ({ ...d, ...p.values }));
  const presetActive = (p: Preset) => Object.entries(p.values).every(([k, v]) => (draft[k as ColorKey] ?? null) === v);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkLogoFile(file);
    if (problem) return toast.error(problem);
    // The type comes from the file name; check the bytes so a renamed PDF can't be saved as the logo.
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (sniffImage(head) !== file.type) return toast.error(t("logoNotImage"));
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  };
  const useLink = () => {
    const problem = checkLogoUrl(logoLink);
    if (problem) return toast.error(problem);
    set("logo", logoLink.trim());
    setLogoLink("");
  };

  const useDefaults = async () => {
    if (await confirm({ title: t("defaultsTitle"), description: t("defaultsDesc"), confirmLabel: t("defaults") })) {
      setDraft((d) => ({ ...d, ...nulls([...COLOR_KEYS]) }));
    }
  };

  const onSave = async () => {
    const names = changed.map((k) => (k === "title" ? t("name") : k === "subtitle" ? t("subtitle") : k === "logo" ? t("logo") : k === "logo_shape" ? t("logoShape") : k === "lockscreen" ? t("lockscreen") : t(`fields.${k}`)));
    if (!(await confirm({ title: t("saveTitle"), description: `${t("saveDesc")} (${names.join(", ")})`, confirmLabel: t("save") }))) return;
    setSaving(true);
    const patch = Object.fromEntries(
      changed.map((k) => [k, k === "title" || k === "subtitle" ? cleanText(draft[k]) : draft[k]]),
    ) as Partial<Branding>;
    const error = await save(patch);
    setSaving(false);
    if (error) toast.error(error);
    else toast.success(t("saved"));
  };

  const colourRows = (keys: ColorKey[]) => (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {keys.map((k) => {
        const value = draft[k];
        // Empty = Clinicoro's own colour; show it rather than a blank swatch.
        const fallback = k === "theme_button_text" ? buttonText({ ...draft, theme_button_text: null }) : DEFAULT_COLORS[k];
        const shown = isHexColor(value) ? value : fallback;
        return (
          <div key={k} className="flex items-center gap-3 px-3.5 py-2.5">
            <Label htmlFor={`brand-${k}`} className="flex flex-1 flex-col items-start gap-0.5">
              <span className="text-sm font-medium text-foreground">{t(`fields.${k}`)}</span>
              <span className="text-xs font-normal text-muted-foreground">{t(`hints.${k}`)}</span>
            </Label>
            <span
              className="relative size-8 shrink-0 overflow-hidden rounded-md border border-border"
              style={{ background: shown }}
              title={isHexColor(value) ? value : t("defaultColour", { hex: fallback })}
            >
              <input
                type="color"
                aria-label={t(`fields.${k}`)}
                disabled={readOnly}
                value={shown.toLowerCase()}
                onChange={(e) => set(k, e.target.value.toUpperCase())}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
            <Input
              id={`brand-${k}`}
              className="w-[104px] font-mono text-xs uppercase"
              placeholder={fallback}
              maxLength={7}
              disabled={readOnly}
              value={value ?? ""}
              aria-invalid={value !== null && !isHexColor(value)}
              onChange={(e) => {
                const v = e.target.value.trim();
                set(k, v ? (v.startsWith("#") ? v : `#${v}`).toUpperCase() : null);
              }}
            />
          </div>
        );
      })}
    </div>
  );

  const presetRow = (presets: Preset[]) => (
    <div className="flex flex-wrap gap-2">
      {presets.map((p) => (
        <button
          key={p.name}
          type="button"
          disabled={readOnly}
          onClick={() => applyPreset(p)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60",
            presetActive(p) ? "border-primary bg-primary-soft text-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  );

  const section = (value: string, title: string, content: ReactNode) => (
    <AccordionItem value={value} className="rounded-xl border border-border bg-card px-5 text-card-foreground shadow-xs not-last:border-b">
      <AccordionTrigger className="py-4 text-sm font-semibold text-foreground hover:no-underline">{title}</AccordionTrigger>
      <AccordionContent className="space-y-3 pb-5">{content}</AccordionContent>
    </AccordionItem>
  );

  const invalid = COLOR_KEYS.some((k) => draft[k] !== null && !isHexColor(draft[k]));

  return (
    <section className="max-w-5xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead title={t("title")} description={t("description")} />
      {loaded && !available && (
        <p className="mb-4 rounded-lg border border-warn-fg/30 bg-warn-bg px-3.5 py-2.5 text-sm text-warn-fg">{t("notReady")}</p>
      )}
      {available && !canEdit && (
        <p className="mb-4 rounded-lg border border-border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">{t("readOnly")}</p>
      )}

      {/* Preview first, full width, so every change below is visible
          without scrolling back up. Save / Discard / Defaults sit with it. */}
      <SectionCard title={t("preview")} className="mb-5">
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,420px)_1fr]">
          <BrandingPreview draft={draft} />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={readOnly || !dirty || invalid || saving} onClick={onSave}>
                {saving ? t("saving") : t("save")}
              </Button>
              <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(branding)}>
                {t("discard")}
              </Button>
              <Button type="button" variant="ghost" disabled={readOnly} onClick={useDefaults}>
                <RotateCcw className="size-4" /> {t("defaults")}
              </Button>
            </div>
            {dirty && <p className="text-xs text-warn-fg">{t("unsaved")}</p>}
          </div>
        </div>
      </SectionCard>

      {/* Every section collapses; several can be open at once. */}
      <Accordion multiple defaultValue={["identity"]} className="gap-3">
        {section("identity", t("identity"), <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="brand-title">{t("name")}</Label>
                <Input id="brand-title" maxLength={TITLE_MAX} placeholder={DEFAULT_APP_NAME} disabled={readOnly}
                  value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="brand-subtitle">{t("subtitle")}</Label>
                <Input id="brand-subtitle" maxLength={TITLE_MAX} placeholder={tSidebar("tagline")} disabled={readOnly}
                  value={draft.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("logo")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden"
                  onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => fileRef.current?.click()}>
                  <ImageUp className="size-4" /> {t("upload")}
                </Button>
                <Input className="h-8 max-w-xs text-sm" placeholder={t("logoLink")} disabled={readOnly}
                  value={logoLink} onChange={(e) => setLogoLink(e.target.value)} />
                <Button type="button" variant="ghost" size="sm" disabled={readOnly || !logoLink.trim()} onClick={useLink}>
                  {t("useLink")}
                </Button>
                {draft.logo?.startsWith("data:") && (
                  <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => setCropSrc(draft.logo)}>
                    <Crop className="size-4" /> {t("crop")}
                  </Button>
                )}
                {draft.logo && (
                  <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => set("logo", null)}>
                    <X className="size-4" /> {t("removeLogo")}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("logoShape")}</Label>
              <div>
                <LogoShapePicker value={draft.logo_shape} disabled={readOnly} onChange={(v) => set("logo_shape", v)} />
              </div>
            </div>
          </>)}
        {section("lockscreen", t("lockscreen"), <>
            <p className="text-xs text-muted-foreground">{t("lockscreenHint")}</p>
            <div role="radiogroup" aria-label={t("lockscreen")} className="grid gap-3 sm:grid-cols-3">
              {LOCKSCREENS.map((l) => {
                const on = lockscreenOf(draft) === l;
                return (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={readOnly}
                    onClick={() => set("lockscreen", l)}
                    className={cn(
                      "flex flex-col gap-2 rounded-xl border p-2.5 text-left transition-colors disabled:opacity-60",
                      on ? "border-primary bg-primary-soft ring-2 ring-primary/30" : "border-border hover:bg-muted",
                    )}
                  >
                    <LockscreenThumb layout={l} />
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{t(`lockscreens.${l}.name`)}</span>
                      <span className="block text-xs text-muted-foreground">{t(`lockscreens.${l}.desc`)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>)}
        {section("sidebar", t("sidebar"), <>
            {presetRow(SIDEBAR_PRESETS)}
            {colourRows(SIDEBAR_KEYS)}
          </>)}
        {section("page", t("page"), <>
            {presetRow(PAGE_PRESETS)}
            {colourRows(PAGE_KEYS)}
          </>)}
      </Accordion>
      <LogoCropDialog
        src={cropSrc}
        shape={draft.logo_shape}
        onShape={(v) => set("logo_shape", v)}
        onCancel={() => setCropSrc(null)}
        onDone={(url) => {
          set("logo", url);
          setCropSrc(null);
        }}
      />
    </section>
  );
}
