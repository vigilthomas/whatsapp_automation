"use client";

/**
 * Settings → Clinic: weekly opening hours, holidays and closed periods
 * (migration 060, src/lib/clinic/settings.ts).
 *
 * Access control module `settings-clinic`: View puts it in the rail, Read
 * opens it, Edit saves. By default only owners without a role and the super
 * admin have it. Without Edit the settings page wraps this in a disabled
 * fieldset, so every control here is read-only automatically.
 *
 * The appointment dialog and the WhatsApp booking assistant follow what is
 * saved here (no slots on a closed day, only times inside the hours).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "@/components/ui/section-card";
import { DateInput, TimeInput } from "@/components/ui/date-time-input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  CLINIC_LIMITS,
  DEFAULT_CLINIC_SETTINGS,
  WEEKDAYS,
  minutesOf,
  parseClinicSettings,
  type ClinicSettings,
  type DayHours,
  type Weekday,
} from "@/lib/clinic/settings";
import { cn } from "@/lib/utils";
import { SettingsPanelHead } from "./settings-panel-head";

/** Monday first, the way clinics read a week. */
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const newId = () => Math.random().toString(36).slice(2, 10);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function ClinicPanel() {
  const t = useTranslations("Settings.clinic");
  const confirm = useConfirm();
  const [saved, setSaved] = useState<ClinicSettings>(DEFAULT_CLINIC_SETTINGS);
  const [draft, setDraft] = useState<ClinicSettings>(DEFAULT_CLINIC_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/clinic-settings", { cache: "no-store" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!active) return;
        if (!ok) {
          toast.error(d.error ?? t("loadFailed"));
          return;
        }
        const s = parseClinicSettings(d.settings);
        setSaved(s);
        setDraft(s);
        setAvailable(d.available !== false);
      })
      .catch(() => active && toast.error(t("loadFailed")))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [t]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const setDay = (w: Weekday, patch: Partial<DayHours>) =>
    setDraft((d) => ({ ...d, hours: { ...d.hours, [w]: { ...d.hours[w], ...patch } } }));
  /** Copy Monday's hours to every other open weekday. */
  const copyMonday = () =>
    setDraft((d) => ({
      ...d,
      hours: Object.fromEntries(
        WEEKDAYS.map((w) => [w, w === 1 || !d.hours[w].open ? d.hours[w] : { ...d.hours[1], open: true }]),
      ) as ClinicSettings["hours"],
    }));

  const badDays = WEEKDAYS.filter((w) => draft.hours[w].open && minutesOf(draft.hours[w].end) <= minutesOf(draft.hours[w].start));

  async function save() {
    if (badDays.length) {
      toast.error(t("endBeforeStart"));
      return;
    }
    if (!(await confirm({ title: t("saveTitle"), description: t("saveDesc"), confirmLabel: t("save") }))) return;
    setSaving(true);
    try {
      const res = await fetch("/api/clinic-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? t("saveFailed"));
        return;
      }
      const s = parseClinicSettings(d.settings);
      setSaved(s);
      setDraft(s);
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const weekdayName = (w: Weekday) =>
    // 2023-01-01 was a Sunday, so day w of that week has weekday w.
    new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(2023, 0, 1 + w));

  return (
    <section className="max-w-4xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title={t("title")}
        description={t("description")}
        action={
          <>
            <Button type="button" variant="outline" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
              {t("discard")}
            </Button>
            <Button type="button" disabled={!dirty || saving || loading} onClick={() => void save()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t("saving") : t("save")}
            </Button>
          </>
        }
      />
      {!available && (
        <p className="mb-4 rounded-lg border border-warn-fg/30 bg-warn-bg px-3.5 py-2.5 text-sm text-warn-fg">{t("notReady")}</p>
      )}

      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("loading")}
        </p>
      ) : (
        <div className="space-y-4">
          <SectionCard
            title={t("hours")}
            action={
              <Button type="button" size="sm" variant="ghost" onClick={copyMonday}>
                {t("copyMonday")}
              </Button>
            }
          >
            <p className="text-xs text-muted-foreground">{t("hoursHint")}</p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {WEEK_ORDER.map((w) => {
                const h = draft.hours[w];
                const bad = badDays.includes(w);
                return (
                  <li key={w} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <label className="flex w-40 items-center gap-2.5 text-sm font-medium text-foreground">
                      <Switch
                        checked={h.open}
                        onCheckedChange={(open: boolean) => setDay(w, { open })}
                        aria-label={t("openOn", { day: weekdayName(w) })}
                      />
                      {weekdayName(w)}
                    </label>
                    {h.open ? (
                      <span className="flex items-center gap-2 text-sm">
                        <TimeInput
                          value={h.start}
                          onChange={(e) => setDay(w, { start: e.target.value })}
                          aria-label={t("opensAt", { day: weekdayName(w) })}
                          className={cn("h-9 w-28", bad && "border-destructive")}
                          required
                        />
                        <span className="text-muted-foreground">–</span>
                        <TimeInput
                          value={h.end}
                          onChange={(e) => setDay(w, { end: e.target.value })}
                          aria-label={t("closesAt", { day: weekdayName(w) })}
                          className={cn("h-9 w-28", bad && "border-destructive")}
                          required
                        />
                        {bad && <span className="text-xs text-destructive">{t("endBeforeStart")}</span>}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("closed")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          <SectionCard
            title={t("holidays")}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draft.holidays.length >= CLINIC_LIMITS.holidays}
                onClick={() =>
                  setDraft((d) => ({ ...d, holidays: [...d.holidays, { id: newId(), date: today(), name: "", yearly: false }] }))
                }
              >
                <Plus className="size-4" /> {t("addHoliday")}
              </Button>
            }
          >
            <p className="text-xs text-muted-foreground">{t("holidaysHint")}</p>
            {draft.holidays.length === 0 ? (
              <Empty text={t("noHolidays")} />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {draft.holidays.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
                    <DateInput
                      value={h.date}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, holidays: d.holidays.map((x) => (x.id === h.id ? { ...x, date: e.target.value } : x)) }))
                      }
                      aria-label={t("holidayDate")}
                      className="h-9 w-40"
                      required
                    />
                    <Input
                      value={h.name}
                      maxLength={CLINIC_LIMITS.nameLength}
                      placeholder={t("holidayName")}
                      aria-label={t("holidayName")}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, holidays: d.holidays.map((x) => (x.id === h.id ? { ...x, name: e.target.value } : x)) }))
                      }
                      className="h-9 min-w-0 flex-1 basis-40"
                    />
                    <label className="flex items-center gap-2 text-xs whitespace-nowrap text-muted-foreground">
                      <Switch
                        checked={h.yearly}
                        onCheckedChange={(yearly: boolean) =>
                          setDraft((d) => ({ ...d, holidays: d.holidays.map((x) => (x.id === h.id ? { ...x, yearly } : x)) }))
                        }
                      />
                      {t("yearly")}
                    </label>
                    <RemoveButton
                      label={t("remove")}
                      onClick={() => setDraft((d) => ({ ...d, holidays: d.holidays.filter((x) => x.id !== h.id) }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title={t("closures")}
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={draft.closures.length >= CLINIC_LIMITS.closures}
                onClick={() =>
                  setDraft((d) => ({ ...d, closures: [...d.closures, { id: newId(), from: today(), to: today(), reason: "" }] }))
                }
              >
                <Plus className="size-4" /> {t("addClosure")}
              </Button>
            }
          >
            <p className="text-xs text-muted-foreground">{t("closuresHint")}</p>
            {draft.closures.length === 0 ? (
              <Empty text={t("noClosures")} />
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {draft.closures.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
                    <DateInput
                      value={c.from}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          // Moving the start past the end drags the end along.
                          closures: d.closures.map((x) =>
                            x.id === c.id ? { ...x, from: e.target.value, to: x.to < e.target.value ? e.target.value : x.to } : x,
                          ),
                        }))
                      }
                      aria-label={t("closedFrom")}
                      className="h-9 w-40"
                      required
                    />
                    <span className="text-sm text-muted-foreground">{t("to")}</span>
                    <DateInput
                      value={c.to}
                      min={c.from}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, closures: d.closures.map((x) => (x.id === c.id ? { ...x, to: e.target.value } : x)) }))
                      }
                      aria-label={t("closedTo")}
                      className="h-9 w-40"
                      required
                    />
                    <Input
                      value={c.reason}
                      maxLength={CLINIC_LIMITS.nameLength}
                      placeholder={t("reason")}
                      aria-label={t("reason")}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, closures: d.closures.map((x) => (x.id === c.id ? { ...x, reason: e.target.value } : x)) }))
                      }
                      className="h-9 min-w-0 flex-1 basis-40"
                    />
                    <RemoveButton
                      label={t("remove")}
                      onClick={() => setDraft((d) => ({ ...d, closures: d.closures.filter((x) => x.id !== c.id) }))}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
      <CalendarOff className="size-4" /> {text}
    </p>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={onClick} className="size-9 text-muted-foreground hover:text-destructive">
      <Trash2 className="size-4" />
    </Button>
  );
}
