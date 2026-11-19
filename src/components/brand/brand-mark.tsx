"use client";

import { Logo } from "@/components/brand/logo";
import { useBranding } from "@/hooks/use-branding";
import { logoShapeClass } from "@/lib/branding";
import { cn } from "@/lib/utils";

/**
 * The clinic's logo (Settings → Branding) in the same box as the Clinicoro
 * mark, or the Clinicoro mark when none is set. Use this instead of <Logo>
 * in the app chrome and on the sign-in pages.
 */
export function BrandMark({ className, title = "" }: { className?: string; title?: string }) {
  const { branding } = useBranding();
  if (!branding.logo) return <Logo className={className} title={title} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data: URLs and any https host; next/image can't optimise these
    <img
      src={branding.logo}
      alt={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", logoShapeClass(branding.logo_shape), className)}
    />
  );
}
