"use client";

import { TimeInput } from '@/components/ui/date-time-input';
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  CalendarCheck,
  ChevronDown,
  GripVertical,
  Loader2,
  LockKeyhole,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DurationInput } from "@/components/ui/duration-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BookingPreview } from "@/components/automations/booking-preview";
import {
  BEFORE_DATETIME,
  DEFAULT_CONFIG,
  LIMITS,
  QUESTION_TYPES,
  TEXTS,
  WEEKDAYS,
  normaliseSteps,
  type BookingConfig,
  type BookingQuestion,
  type QuestionType,
  type TextKey,
  type Weekday,
} from "@/lib/booking/settings";

const ZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Seoul", "Europe/London", "America/New_York", "UTC"];
// Monday first, the way clinics read a week.
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

const TEXT_GROUPS: { id: string; keys: TextKey[] }[] = [
  { id: "start", keys: ["welcome", "btnBook", "btnCheck"] },
  { id: "service", keys: ["askService", "listService", "serviceMinutes"] },
  { id: "doctor", keys: ["askDoctor", "listDoctor", "anyDoctor", "anyDoctorName"] },
  {
    id: "datetime",
    keys: ["askDay", "listDay", "dayFreeCount", "askTime", "listTime", "laterTimes", "bufferNote", "noTimes", "btnChangeChoice", "dayFull", "timeTaken"],
  },
  { id: "check", keys: ["checked", "btnBookTime", "btnDone", "done"] },
  { id: "questions", keys: ["askName", "btnYes", "btnNo", "btnSkip", "listChoose"] },
  { id: "summary", keys: ["summary", "lblService", "lblDoctor", "lblWhen", "lblPatient", "btnConfirm", "btnChange", "btnCancel"] },
  { id: "end", keys: ["confirmed", "arriveEarly", "cancelled", "pleaseChoose"] },
];

const placeholdersOf = (key: TextKey) => [...TEXTS[key].default.matchAll(/\{(\w+)\}/g)].map((m) => `{${m[1]}}`);

/** A row that can be dragged by its handle. */
function SortableRow({ id, disabled, children }: { id: string; disabled?: boolean; children: (handle: ReactNode) => ReactNode }) {
  const t = useTranslations("Booking");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-80")}
    >
      {children(
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          aria-label={t("dragToReorder")}
          className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-40"
        >
          <GripVertical className="size-4" />
        </button>,
      )}
    </div>
  );
}

/** Words typed as "a, b, c". */
const splitWords = (s: string) =>
  s
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean);

/**
 * Booking assistant settings: a ready-made WhatsApp bot that books
 * appointments. Everything the customer sees can be changed here: which
 * steps run and in what order, the clinic's own questions (text, yes/no or
 * a list of choices), opening hours, and every message and button label.
 * The preview on the right runs the real conversation as you edit.
 */
export function BookingSettings() {
  const t = useTranslations("Booking");
  const { can } = useAuth();
  const confirm = useConfirm();
  const editable = can("automations", "edit");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<BookingConfig>(DEFAULT_CONFIG);
  const [keywordsText, setKeywordsText] = useState(DEFAULT_CONFIG.keywords.join(", "));
  const [cancelText, setCancelText] = useState(DEFAULT_CONFIG.cancelWords.join(", "));
  const [saved, setSaved] = useState<string>("");
  const [history, setHistory] = useState<BookingConfig[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>("start");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const snapshot = (e: boolean, c: BookingConfig, k: string, x: string) => JSON.stringify({ e, c, k, x });
  const dirty = !loading && snapshot(enabled, config, keywordsText, cancelText) !== saved;

  // What the preview runs: the edits so far, with the word lists applied.
  const live: BookingConfig = {
    ...config,
    keywords: splitWords(keywordsText).length ? splitWords(keywordsText) : config.keywords,
    cancelWords: splitWords(cancelText).map((w) => w.toLowerCase()),
  };

  const apply = (e: boolean, c: BookingConfig) => {
    const k = c.keywords.join(", ");
    const x = c.cancelWords.join(", ");
    setEnabled(e);
    setConfig(c);
    setKeywordsText(k);
    setCancelText(x);
    setHistory([]);
    setSaved(snapshot(e, c, k, x));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/booking/settings", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? t("loadFailed"));
        if (!cancelled) apply(!!data.enabled, data.config as BookingConfig);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : t("loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Every config change goes through here so Undo can step back. */
  const change = (next: BookingConfig | ((c: BookingConfig) => BookingConfig)) =>
    setConfig((c) => {
      const value = typeof next === "function" ? next(c) : next;
      if (JSON.stringify(value) !== JSON.stringify(c)) setHistory((h) => [...h.slice(-49), c]);
      return value;
    });

  const set = <K extends keyof BookingConfig>(key: K, value: BookingConfig[K]) => change((c) => ({ ...c, [key]: value }));

  const setDay = (w: Weekday, patch: Partial<BookingConfig["hours"][Weekday]>) =>
    change((c) => ({ ...c, hours: { ...c.hours, [w]: { ...c.hours[w], ...patch } } }));

  const setText = (key: TextKey, value: string) => change((c) => ({ ...c, texts: { ...c.texts, [key]: value } }));

  const setQuestion = (id: string, patch: Partial<BookingQuestion>) =>
    set(
      "questions",
      config.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    );

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setConfig(prev);
  };

  const discard = () => {
    const prev = JSON.parse(saved) as { e: boolean; c: BookingConfig; k: string; x: string };
    setEnabled(prev.e);
    setConfig(prev.c);
    setKeywordsText(prev.k);
    setCancelText(prev.x);
    setHistory([]);
  };

  const moveStep = (e: DragEndEvent) => {
    const from = config.steps.findIndex((s) => s.id === e.active.id);
    const to = e.over ? config.steps.findIndex((s) => s.id === e.over!.id) : -1;
    if (from < 0 || to < 0 || from === to) return;
    const moved = arrayMove(config.steps, from, to);
    const fixed = normaliseSteps(moved);
    if (JSON.stringify(fixed.map((s) => s.id)) !== JSON.stringify(moved.map((s) => s.id))) toast.info(t("stepsOrderFixed"));
    set("steps", fixed);
  };

  const moveQuestion = (e: DragEndEvent) => {
    const from = config.questions.findIndex((q) => q.id === e.active.id);
    const to = e.over ? config.questions.findIndex((q) => q.id === e.over!.id) : -1;
    if (from < 0 || to < 0 || from === to) return;
    set("questions", arrayMove(config.questions, from, to));
  };

  async function save() {
    const keywords = splitWords(keywordsText);
    if (enabled && keywords.length === 0) {
      toast.error(t("needKeyword"));
      return;
    }
    const bad = WEEKDAYS.find((w) => config.hours[w].open && config.hours[w].end <= config.hours[w].start);
    if (bad !== undefined) {
      toast.error(t("badHours", { day: t(`days.${bad}`) }));
      return;
    }
    const emptyChoice = config.questions.find((q) => q.type === "choice" && q.options.filter((o) => o.trim()).length === 0);
    if (emptyChoice) {
      toast.error(t("needOptions", { question: emptyChoice.text || "…" }));
      return;
    }
    const ok = await confirm({
      title: t("confirmTitle"),
      description: enabled ? t("confirmOn") : t("confirmOff"),
      confirmLabel: t("save"),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await fetch("/api/booking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, config: { ...config, keywords, cancelWords: splitWords(cancelText) } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? t("saveFailed"));
      apply(!!data.enabled, data.config as BookingConfig);
      toast.success(t("saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  const number = (key: "slotMinutes" | "daysAhead" | "minNoticeMinutes", label: string, hint: string) => {
    const { min, max } = LIMITS[key];
    if (key !== "daysAhead") {
      // A length of time: hours + minutes boxes.
      return (
        <div className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          <DurationInput
            id={key}
            value={config[key]}
            maxHours={Math.floor(max / 60)}
            onChange={(v) => set(key, Math.min(max, Math.max(min, v)))}
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        <Input
          id={key}
          type="number"
          min={min}
          max={max}
          value={config[key]}
          onChange={(e) => set(key, Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        />
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    );
  };

  const toggleRow = (title: string, hint: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={(v: boolean) => onChange(v)} aria-label={title} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/automations"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {t("back")}
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <CalendarCheck className="size-6 text-primary" /> {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={undo} disabled={history.length === 0 || saving}>
              <Undo2 className="size-4" /> {t("undo")}
            </Button>
            <Button variant="outline" onClick={discard} disabled={!dirty || saving}>
              <RotateCcw className="size-4" /> {t("discard")}
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t("save")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <fieldset disabled={!editable || saving} className="min-w-0 space-y-6">
          {/* On / off + how it starts and stops */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{t("onTitle")}</CardTitle>
                  <CardDescription className="mt-1">{enabled ? t("onDesc") : t("offDesc")}</CardDescription>
                </div>
                <Switch checked={enabled} onCheckedChange={(v: boolean) => setEnabled(v)} aria-label={t("onTitle")} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="keywords">{t("keywords")}</Label>
                <Input id="keywords" value={keywordsText} onChange={(e) => setKeywordsText(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cancelWords">{t("cancelWords")}</Label>
                <Input id="cancelWords" value={cancelText} onChange={(e) => setCancelText(e.target.value)} />
                <p className="text-xs text-muted-foreground">{t("cancelWordsHint")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Steps */}
          <Card>
            <CardHeader>
              <CardTitle>{t("stepsTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("stepsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {toggleRow(t("offerCheck"), t("offerCheckHint"), config.offerCheck, (v) => set("offerCheck", v))}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={moveStep}>
                <SortableContext items={config.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {config.steps.map((step, i) => (
                      <SortableRow key={step.id} id={step.id} disabled={!editable}>
                        {(handle) => (
                          <div className="flex items-center gap-2 bg-card px-2 py-2.5">
                            {handle}
                            <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                            <div className="min-w-0 flex-1">
                              <div className={cn("text-sm font-medium", step.enabled ? "text-foreground" : "text-muted-foreground")}>
                                {t(`steps.${step.id}`)}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {t(`stepsHint.${step.id}`)}
                                {BEFORE_DATETIME.includes(step.id) ? ` ${t("beforeDatetime")}` : ""}
                              </p>
                            </div>
                            {step.id === "datetime" ? (
                              <LockKeyhole className="mr-2 size-4 text-muted-foreground" aria-label={t("alwaysOn")} />
                            ) : (
                              <Switch
                                checked={step.enabled}
                                onCheckedChange={(v: boolean) =>
                                  set(
                                    "steps",
                                    config.steps.map((s) => (s.id === step.id ? { ...s, enabled: v } : s)),
                                  )
                                }
                                aria-label={t(`steps.${step.id}`)}
                              />
                            )}
                          </div>
                        )}
                      </SortableRow>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {!config.steps.find((s) => s.id === "service")?.enabled ? (
                <div className="space-y-1.5 sm:max-w-sm">
                  <Label htmlFor="defaultService">{t("defaultService")}</Label>
                  <Input
                    id="defaultService"
                    value={config.defaultService}
                    maxLength={80}
                    onChange={(e) => set("defaultService", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">{t("defaultServiceHint")}</p>
                </div>
              ) : null}
              {toggleRow(t("confirmStep"), t("confirmStepHint"), config.confirmStep, (v) => set("confirmStep", v))}
            </CardContent>
          </Card>

          {/* Questions */}
          <Card>
            <CardHeader>
              <CardTitle>{t("questionsTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("questionsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={moveQuestion}>
                <SortableContext items={config.questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                  {config.questions.map((q, i) => (
                    <SortableRow key={q.id} id={q.id} disabled={!editable || config.questions.length < 2}>
                      {(handle) => (
                        <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                          <div className="flex items-center gap-2">
                            {handle}
                            <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                            <Input
                              value={q.text}
                              maxLength={LIMITS.questionLength}
                              placeholder={t("questionPlaceholder")}
                              onChange={(e) => setQuestion(q.id, { text: e.target.value })}
                              aria-label={t("questionN", { n: i + 1 })}
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => set("questions", config.questions.filter((x) => x.id !== q.id))}
                              aria-label={t("removeQuestion")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 pl-14">
                            <div className="inline-flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={t("questionType")}>
                              {QUESTION_TYPES.map((type: QuestionType) => (
                                <button
                                  key={type}
                                  type="button"
                                  role="radio"
                                  aria-checked={q.type === type}
                                  onClick={() => setQuestion(q.id, { type })}
                                  className={cn(
                                    "rounded-md px-2.5 py-1 text-xs font-medium",
                                    q.type === type ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                                  )}
                                >
                                  {t(`types.${type}`)}
                                </button>
                              ))}
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <Switch
                                checked={q.required}
                                onCheckedChange={(v: boolean) => setQuestion(q.id, { required: v })}
                                aria-label={t("required")}
                              />
                              {q.required ? t("required") : t("optional")}
                            </label>
                          </div>
                          {q.type === "choice" ? (
                            <div className="space-y-2 pl-14">
                              {q.options.map((o, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  <Input
                                    value={o}
                                    maxLength={LIMITS.optionLength}
                                    placeholder={t("optionN", { n: oi + 1 })}
                                    onChange={(e) =>
                                      setQuestion(q.id, { options: q.options.map((x, xi) => (xi === oi ? e.target.value : x)) })
                                    }
                                    className="h-9"
                                    aria-label={t("optionN", { n: oi + 1 })}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setQuestion(q.id, { options: q.options.filter((_, xi) => xi !== oi) })}
                                    aria-label={t("removeOption")}
                                  >
                                    <X className="size-4" />
                                  </Button>
                                </div>
                              ))}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={q.options.length >= (q.required ? LIMITS.options : LIMITS.options - 1)}
                                onClick={() => setQuestion(q.id, { options: [...q.options, ""] })}
                              >
                                <Plus className="size-4" /> {t("addOption")}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
              <Button
                variant="outline"
                size="sm"
                disabled={config.questions.length >= LIMITS.questions}
                onClick={() =>
                  set("questions", [
                    ...config.questions,
                    { id: `q${Date.now().toString(36)}`, text: "", type: "text", options: [], required: true },
                  ])
                }
              >
                <Plus className="size-4" /> {t("addQuestion")}
              </Button>
            </CardContent>
          </Card>

          {/* Hours */}
          <Card>
            <CardHeader>
              <CardTitle>{t("hoursTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("hoursDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="timezone">{t("timezone")}</Label>
                <Input
                  id="timezone"
                  list="booking-zones"
                  value={config.timezone}
                  onChange={(e) => set("timezone", e.target.value.trim())}
                />
                <datalist id="booking-zones">
                  {ZONES.map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {WEEK_ORDER.map((w) => {
                  const h = config.hours[w];
                  return (
                    <div key={w} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="w-24 text-sm font-medium text-foreground">{t(`days.${w}`)}</span>
                      <Switch
                        checked={h.open}
                        onCheckedChange={(v: boolean) => setDay(w, { open: v })}
                        aria-label={t("openOn", { day: t(`days.${w}`) })}
                      />
                      {h.open ? (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          <TimeInput
                            value={h.start}
                            onChange={(e) => setDay(w, { start: e.target.value })}
                            className="h-9 w-32"
                            aria-label={t("opens", { day: t(`days.${w}`) })}
                          />
                          {t("to")}
                          <TimeInput
                            value={h.end}
                            onChange={(e) => setDay(w, { end: e.target.value })}
                            className="h-9 w-32"
                            aria-label={t("closes", { day: t(`days.${w}`) })}
                          />
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t("closed")}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {number("slotMinutes", t("slotMinutes"), t("slotMinutesHint"))}
                {number("daysAhead", t("daysAhead"), t("daysAheadHint"))}
                {number("minNoticeMinutes", t("minNotice"), t("minNoticeHint"))}
              </div>
            </CardContent>
          </Card>

          {/* Every text */}
          <Card>
            <CardHeader>
              <CardTitle>{t("textsTitle")}</CardTitle>
              <CardDescription className="mt-1">{t("textsDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {TEXT_GROUPS.map((group) => {
                const open = openGroup === group.id;
                const changed = group.keys.filter((k) => config.texts[k] !== TEXTS[k].default).length;
                return (
                  <div key={group.id} className="rounded-xl border border-border">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenGroup(open ? null : group.id)}
                      className={cn("flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50", open && "border-b border-border")}
                    >
                      <span className="text-sm font-semibold text-foreground">{t(`textGroups.${group.id}`)}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {changed ? t("changedCount", { count: changed }) : t("textCount", { count: group.keys.length })}
                      </span>
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                    </button>
                    {open ? (
                      <div className="space-y-4 p-4">
                        {group.keys.map((key) => {
                          const spec = TEXTS[key];
                          const long = spec.max > 100;
                          const isDefault = config.texts[key] === spec.default;
                          const vars = placeholdersOf(key);
                          return (
                            <div key={key} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <Label htmlFor={`text-${key}`}>{t(`texts.${key}`)}</Label>
                                <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                                  {config.texts[key].length}/{spec.max}
                                </span>
                                {!isDefault ? (
                                  <button
                                    type="button"
                                    onClick={() => setText(key, spec.default)}
                                    className="text-[11px] font-medium text-primary hover:underline"
                                  >
                                    {t("resetText")}
                                  </button>
                                ) : null}
                              </div>
                              {long ? (
                                <Textarea
                                  id={`text-${key}`}
                                  rows={key === "confirmed" ? 4 : 2}
                                  maxLength={spec.max}
                                  value={config.texts[key]}
                                  onChange={(e) => setText(key, e.target.value)}
                                />
                              ) : (
                                <Input
                                  id={`text-${key}`}
                                  maxLength={spec.max}
                                  value={config.texts[key]}
                                  onChange={(e) => setText(key, e.target.value)}
                                />
                              )}
                              {vars.length ? (
                                <p className="text-xs text-muted-foreground">
                                  {t("usesPlaceholders")} <span className="font-mono">{vars.join(" ")}</span>
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </fieldset>

        <div className="xl:sticky xl:top-0">
          <BookingPreview config={live} />
        </div>
      </div>
    </div>
  );
}

