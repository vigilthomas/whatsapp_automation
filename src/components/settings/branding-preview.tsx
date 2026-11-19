"use client";

import { LayoutDashboard, MessageSquare, CalendarDays } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { isHexColor, logoShapeClass, type Branding } from "@/lib/branding";
import { cn } from "@/lib/utils";

/** Clinicoro's light-mode colours, used where the branding leaves a colour unset. */
const BASE = {
  sidebar_bg: "#FFFFFF",
  sidebar_text: "#627485",
  sidebar_accent: "#0E9F9A",
  title_color: "#0B2740",
  subtitle_color: "#627485",
  theme_primary: "#0B2740",
  theme_text: "#172B3A",
  theme_muted: "#627485",
  theme_bg: "#F4F8FA",
  theme_surface: "#FFFFFF",
  theme_danger: "#B4232B",
};

/** A small picture of the app with the draft branding (ported from the base template's AppPreview). */
export function BrandingPreview({ draft }: { draft: Branding }) {
  const c = (k: keyof typeof BASE) => (isHexColor(draft[k]) ? (draft[k] as string) : BASE[k]);
  const rows = [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: MessageSquare, label: "Inbox" },
    { icon: CalendarDays, label: "Appointments" },
  ];
  return (
    <div
      aria-label="Preview"
      className="flex overflow-hidden rounded-xl border border-border text-[11px] shadow-sm"
      style={{ background: c("theme_bg"), minHeight: 190 }}
    >
      <div className="flex w-[42%] flex-col gap-2 p-3" style={{ background: c("sidebar_bg"), color: c("sidebar_text") }}>
        <div className="flex items-center gap-2">
          {draft.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: or https logo, preview only
            <img src={draft.logo} alt="" className={cn("h-6 w-6", logoShapeClass(draft.logo_shape))} />
          ) : (
            <Logo className="h-6 w-6" title="" />
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <strong className="truncate text-[12px]" style={{ color: c("title_color") }}>{draft.title || "Clinicoro"}</strong>
            <span className="truncate text-[9px]" style={{ color: c("subtitle_color") }}>
              {draft.subtitle || "Your clinic's AI receptionist"}
            </span>
          </span>
        </div>
        {rows.map(({ icon: Icon, label, active }) => (
          <div
            key={label}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1"
            style={active ? { background: `color-mix(in oklab, ${c("sidebar_accent")} 14%, transparent)`, color: c("sidebar_accent") } : undefined}
          >
            <Icon className="size-3" />
            {label}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="rounded-lg p-2.5" style={{ background: c("theme_surface"), color: c("theme_text") }}>
          <strong className="block text-[12px]">Today&apos;s appointments</strong>
          <span style={{ color: c("theme_muted") }}>3 booked · 1 waiting</span>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded px-2 py-0.5 text-white" style={{ background: c("theme_primary") }}>Book</span>
            <span className="rounded px-2 py-0.5 text-white" style={{ background: c("theme_danger") }}>Cancel</span>
          </div>
        </div>
      </div>
    </div>
  );
}
