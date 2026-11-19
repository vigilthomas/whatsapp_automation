"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { List, RotateCcw, SendHorizontal } from "lucide-react";

import {
  continueBooking,
  startBooking,
  type BookDoctor,
  type BookService,
  type BookingDeps,
  type BookingState,
  type Reply,
  type StepResult,
} from "@/lib/booking/engine";
import type { BookingConfig } from "@/lib/booking/settings";

type Line = { from: "bot"; reply: Reply } | { from: "me"; text: string } | { from: "note"; text: string };

const SAMPLE_SERVICES: BookService[] = [
  { id: "s1", name: "Consultation", duration_min: 30 },
  { id: "s2", name: "Follow-up", duration_min: 15 },
];
const SAMPLE_DOCTORS: BookDoctor[] = [
  { id: "d1", name: "Dr Asha", branch_id: null },
  { id: "d2", name: "Dr Ravi", branch_id: null },
];

/** WhatsApp's *bold* → <strong>. */
function rich(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
    part.startsWith("*") && part.endsWith("*") && part.length > 2 ? <strong key={i}>{part.slice(1, -1)}</strong> : part,
  );
}

/**
 * Live preview of the booking assistant: runs the real conversation engine
 * in the browser against the settings being edited, with this clinic's
 * services and doctors. Nothing is sent or saved, and existing
 * appointments are ignored, so every time inside opening hours shows free.
 */
export function BookingPreview({ config }: { config: BookingConfig }) {
  const t = useTranslations("Booking.preview");
  const [services, setServices] = useState<BookService[] | null>(null);
  const [doctors, setDoctors] = useState<BookDoctor[] | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [state, setState] = useState<BookingState | null>(null);
  const [openList, setOpenList] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [run, setRun] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  // This clinic's services and doctors (samples when they can't be read).
  useEffect(() => {
    const load = async <T,>(url: string, pick: (r: Record<string, unknown>) => T, fallback: T[]) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return fallback;
        const data = (await res.json()) as { records?: Record<string, unknown>[] };
        const rows = (data.records ?? []).filter((r) => r.is_active !== false).map(pick);
        return rows;
      } catch {
        return fallback;
      }
    };
    void load("/api/master/services", (r) => ({ id: String(r.id), name: String(r.name), duration_min: Number(r.duration_min) || 30 }), SAMPLE_SERVICES).then(setServices);
    void load("/api/master/doctors", (r) => ({ id: String(r.id), name: String(r.name), branch_id: null }), SAMPLE_DOCTORS).then(setDoctors);
  }, []);

  const configKey = JSON.stringify(config);
  const deps = useMemo<BookingDeps | null>(() => {
    if (!services || !doctors) return null;
    return {
      config: JSON.parse(configKey) as BookingConfig,
      services,
      doctors,
      contactName: null,
      now: new Date(),
      busy: async () => [],
      book: async () => "ok",
    };
  }, [configKey, services, doctors]);

  const show = (r: StepResult, extra: Line[] = []) => {
    setState(r.state);
    setOpenList(null);
    setLines((l) => [...l, ...extra, ...r.replies.map((reply) => ({ from: "bot" as const, reply }))]);
    if (!r.state) setLines((l) => [...l, { from: "note", text: t("ended") }]);
  };

  // Restart whenever the settings change (debounced while typing).
  useEffect(() => {
    if (!deps) return;
    const timer = setTimeout(() => {
      setLines([{ from: "me", text: deps.config.keywords[0] ?? "book" }]);
      setState(null);
      void startBooking(deps).then((r) => show(r));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, run]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines, openList]);

  const answer = async (input: { text?: string; replyId?: string }, shown: string) => {
    if (!deps || !state) return;
    const r = await continueBooking(state, input, deps);
    show(r, [{ from: "me", text: shown }]);
  };

  const last = lines.length - 1;

  return (
    <div className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{t("title")}</div>
          <div className="text-[11px] text-muted-foreground">{t("hint")}</div>
        </div>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="size-3.5" /> {t("restart")}
        </button>
      </div>

      <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] px-3 py-4 dark:bg-[#0b141a]">
        {lines.map((line, i) => {
          if (line.from === "note") {
            return (
              <div key={i} className="flex justify-center">
                <span className="rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-[#54656f] dark:bg-[#182229] dark:text-[#8696a0]">
                  {line.text}
                </span>
              </div>
            );
          }
          if (line.from === "me") {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-[13px] whitespace-pre-wrap text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">
                  {line.text}
                </div>
              </div>
            );
          }
          const r = line.reply;
          const active = i === last && !!state;
          const body = r.kind === "text" ? r.text : r.body;
          return (
            <div key={i} className="flex max-w-[85%] flex-col gap-0.5">
              <div className="rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 text-[13px] whitespace-pre-wrap text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]">
                {rich(body)}
              </div>
              {r.kind === "buttons"
                ? r.buttons.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      disabled={!active}
                      onClick={() => void answer({ replyId: b.id }, b.title)}
                      className="rounded-lg bg-white py-1.5 text-[13px] font-medium text-[#008069] enabled:hover:bg-[#f5f6f6] disabled:opacity-60 dark:bg-[#202c33] dark:text-[#00a884]"
                    >
                      {b.title}
                    </button>
                  ))
                : null}
              {r.kind === "list" ? (
                <>
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => setOpenList(openList === i ? null : i)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-[13px] font-medium text-[#008069] enabled:hover:bg-[#f5f6f6] disabled:opacity-60 dark:bg-[#202c33] dark:text-[#00a884]"
                  >
                    <List className="size-3.5" /> {r.button}
                  </button>
                  {openList === i && active ? (
                    <div className="mt-1 overflow-hidden rounded-lg bg-white dark:bg-[#202c33]">
                      {r.rows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => void answer({ replyId: row.id }, row.title)}
                          className="block w-full border-b border-black/5 px-3 py-2 text-left last:border-0 hover:bg-[#f5f6f6] dark:border-white/5 dark:hover:bg-[#2a3942]"
                        >
                          <div className="text-[13px] text-[#111b21] dark:text-[#e9edef]">{row.title}</div>
                          {row.description ? (
                            <div className="text-[11px] text-[#667781] dark:text-[#8696a0]">{row.description}</div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
        {!deps ? <div className="text-center text-xs text-muted-foreground">{t("loading")}</div> : null}
      </div>

      <form
        className="flex items-center gap-2 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          if (!state) {
            setRun((n) => n + 1);
            return;
          }
          void answer({ text }, text);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={state ? t("typeAnswer") : t("typeToRestart")}
          className="h-9 min-w-0 flex-1 rounded-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t("typeAnswer")}
        />
        <button
          type="submit"
          className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-label={t("send")}
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </div>
  );
}
