"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * App-wide confirmation modal.
 *
 * Every consequential action — delete, save an edit, change a status,
 * reassign a role — asks first, through this one component, instead of
 * `window.confirm`. Usage from any component under the dashboard shell:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: t("deleteTitle"), tone: "danger" }))) return;
 *
 * `confirm()` resolves true on Confirm, false on Cancel / Esc / backdrop.
 * Only one prompt is open at a time; a second call while one is pending
 * resolves the first as cancelled.
 */
export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button destructively (deletes, cancels). */
  tone?: "default" | "danger";
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Confirm");
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
    setBusy(false);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        // A prompt already up → it loses; the newest question wins.
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(opts);
      }),
    [],
  );

  const danger = options?.tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent className="sm:max-w-md">
          {options && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {danger ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                      <AlertTriangle className="size-4" />
                    </span>
                  ) : null}
                  {options.title}
                </DialogTitle>
                {options.description ? (
                  <DialogDescription>{options.description}</DialogDescription>
                ) : (
                  <DialogDescription>{t("defaultDescription")}</DialogDescription>
                )}
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => settle(false)} disabled={busy}>
                  {options.cancelLabel ?? t("cancel")}
                </Button>
                <Button
                  type="button"
                  autoFocus
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    settle(true);
                  }}
                  className={cn(
                    danger &&
                      "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500",
                  )}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {options.confirmLabel ?? (danger ? t("confirmDanger") : t("confirm"))}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * The confirm function. Outside a provider (tests, stray renders) it
 * falls back to the native dialog so the action still asks.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return ctx ?? (async (o) => window.confirm(o.title));
}
