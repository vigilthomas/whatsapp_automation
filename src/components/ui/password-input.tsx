"use client";

/**
 * PasswordInput — the app's password field: `Input` plus an eye button
 * that shows / hides what was typed. Use it for every password (and
 * secret key) field; a test fails on a raw `type="password"` outside
 * components/ui. Takes every `Input` prop except `type`.
 */
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  const t = useTranslations("PasswordInput");
  const [shown, setShown] = React.useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className={cn("pr-9", className)} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t("hide") : t("show")}
        aria-pressed={shown}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        {shown ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
      </button>
    </div>
  );
}
