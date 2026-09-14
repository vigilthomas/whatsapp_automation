"use client";

import { useEffect, useState } from "react";

export interface AiStatus {
  /** Master switch on the AI Agents page. */
  active: boolean;
  /** Auto-reply to inbound WhatsApp is on. */
  autoReply: boolean;
  loaded: boolean;
}

/**
 * Lightweight read of the account's AI configuration for the chrome —
 * the sidebar's "AI Receptionist · Online" card and the dashboard's
 * receptionist panel. One fetch per mount, no realtime: the status
 * only changes when someone saves the AI Agents page.
 */
export function useAiStatus(): AiStatus {
  const [status, setStatus] = useState<AiStatus>({
    active: false,
    autoReply: false,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setStatus({
          active: !!data?.is_active,
          autoReply: !!data?.auto_reply_enabled,
          loaded: true,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus((s) => ({ ...s, loaded: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
