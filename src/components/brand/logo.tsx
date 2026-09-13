import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Clinicoro brand mark — an open "C" arc with a plus in the gap, on a
 * teal → green gradient.
 *
 * This is the single source for the mark in the app chrome (sidebar,
 * auth cards). The favicon in `src/app/icon.tsx` renders the same
 * geometry from the constants below, so a change here should be
 * mirrored there — keep the two in sync.
 *
 * Geometry (100×100 viewBox): circle centred at (44,50) r=36, stroke
 * 11 with round caps, open between -50° and +50° on the right; the
 * plus sits centred at (78,50) inside that gap.
 */
export const LOGO_VIEWBOX = "0 0 100 100";
export const LOGO_ARC_PATH = "M67.14 77.58 A36 36 0 1 1 67.14 22.42";
export const LOGO_GRADIENT = { from: "#12A8B9", to: "#22C08F" } as const;

interface LogoProps {
  className?: string;
  /** Accessible name. Pass `""` to mark the image as decorative. */
  title?: string;
}

export function Logo({ className, title = "Clinicoro" }: LogoProps) {
  // Unique per-instance gradient id so several logos on one page
  // (sidebar + a dialog, say) don't collide on the same <defs> id.
  const gradientId = useId();
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={LOGO_GRADIENT.from} />
          <stop offset="1" stopColor={LOGO_GRADIENT.to} />
        </linearGradient>
      </defs>
      <path
        d={LOGO_ARC_PATH}
        stroke={`url(#${gradientId})`}
        strokeWidth="11"
        strokeLinecap="round"
      />
      <rect x="62" y="44.5" width="32" height="11" rx="4" fill={`url(#${gradientId})`} />
      <rect x="72.5" y="34" width="11" height="32" rx="4" fill={`url(#${gradientId})`} />
    </svg>
  );
}
