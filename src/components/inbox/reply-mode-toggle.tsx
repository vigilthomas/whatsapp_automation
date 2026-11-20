"use client";

/**
 * Human / Bot switch in the chat header (migration 061).
 *
 * Bot: the AI assistant answers this chat from the clinic's facts and hands
 * it back to staff when it doesn't know (the switch then flips to Human
 * by itself and shows why). Human: staff reply; the assistant stays quiet.
 *
 * Access control module `ai-assistant`: without View the switch isn't shown
 * at all; without Edit it shows the mode but can't be flipped. The routes
 * behind it enforce the same rule.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bot, Info, Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Mode = "bot" | "human";

export function ReplyModeToggle({ conversationId }: { conversationId: string }) {
  const t = useTranslations("Inbox.aiMode");
  const { can, profileLoading } = useAuth();
  const visible = !profileLoading && can("ai-assistant", "view");
  const editable = !profileLoading && can("ai-assistant", "edit");
  const [mode, setMode] = useState<Mode | null>(null);
  const [ready, setReady] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/conversations/${conversationId}/ai-mode`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setMode(null);
      return;
    }
    const d = await res.json();
    setMode(d.mode === "bot" ? "bot" : "human");
    setReady(!!d.ai_ready);
    setSummary(d.handoff_summary ?? null);
  }, [conversationId]);

  useEffect(() => {
    if (!visible) return;
    setMode(null);
    void load();
    // The assistant can hand a chat over at any moment; look again now and then.
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [visible, load]);

  if (!visible || mode === null) return null;

  const pick = async (next: Mode) => {
    if (next === mode || !editable) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/ai-mode`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? t("failed"));
        return;
      }
      setMode(d.mode === "bot" ? "bot" : "human");
      setSummary(d.handoff_summary ?? null);
      setReady(!!d.ai_ready);
      toast.success(next === "bot" ? t("nowBot") : t("nowHuman"));
    } finally {
      setSaving(false);
    }
  };

  const option = (value: Mode, Icon: typeof Bot, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      disabled={!editable || saving}
      onClick={() => void pick(value)}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-colors disabled:cursor-default",
        mode === value
          ? value === "bot"
            ? "bg-primary text-primary-foreground"
            : "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );

  const note = !ready ? t("notReady") : mode === "human" && summary ? t("handedOff", { reason: summary }) : null;

  return (
    <div className="flex items-center gap-1">
      <div
        role="radiogroup"
        aria-label={t("label")}
        title={editable ? t("hint") : t("readOnly")}
        className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
      >
        {option("human", UserRound, t("human"))}
        {option("bot", Bot, t("bot"))}
        {saving && <Loader2 className="mx-1 size-3 animate-spin text-muted-foreground" />}
      </div>
      {note && (
        <Popover>
          <PopoverTrigger
            aria-label={t("why")}
            className={cn("inline-flex size-6 items-center justify-center rounded-md hover:bg-muted", ready ? "text-warn-fg" : "text-muted-foreground")}
          >
            <Info className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 text-xs">
            <p className="text-foreground">{note}</p>
            {!ready && (
              <Link href="/settings?tab=ai" className="mt-2 inline-block font-medium text-primary hover:underline">
                {t("openSettings")}
              </Link>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
