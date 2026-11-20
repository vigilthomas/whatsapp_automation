"use client";

/**
 * The frame around the sign-in, sign-up and reset-password cards, in the
 * layout chosen under Settings → Branding → Lockscreen (migration 059):
 *
 *   classic    the card centred on the page background (the original look)
 *   split      a coloured brand panel (logo, clinic name, tagline) beside the
 *              card; on phones the panel shrinks to a header above it
 *   spotlight  the card floating on a full-screen gradient of the clinic's
 *              primary colour, the logo and name above it
 *
 * Colours come from the theme tokens, so the clinic's own Page colours
 * (Branding) flow through; nothing here is hard-coded per clinic. The
 * pages only swap their outer wrapper for this, so each keeps its own card.
 * `preview` draws a miniature for the Branding picker without the
 * full-screen height.
 *
 * Split and spotlight already show the logo outside the card, so a card
 * puts its own logo in `<AuthCardLogo />`, which only draws in classic —
 * otherwise the page would show it twice.
 */
import { createContext, useContext, type ReactNode } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { useBranding } from "@/hooks/use-branding";
import { lockscreenOf, type Lockscreen } from "@/lib/branding";
import { cn } from "@/lib/utils";

const DEFAULT_NAME = "Clinicoro";

const AuthLayoutContext = createContext<Lockscreen>("classic");

/** The card's own logo: only in the classic layout, where nothing else shows one. */
export function AuthCardLogo() {
  if (useContext(AuthLayoutContext) !== "classic") return null;
  return (
    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
      <BrandMark className="h-8 w-8" />
    </div>
  );
}

export function AuthShell({ children, layout }: { children: ReactNode; layout?: Lockscreen }) {
  const { branding } = useBranding();
  const chosen = layout ?? lockscreenOf(branding);
  const name = branding.title || DEFAULT_NAME;
  const tagline = branding.subtitle;
  return (
    <AuthLayoutContext.Provider value={chosen}>
      <Frame layout={chosen} name={name} tagline={tagline}>
        {children}
      </Frame>
    </AuthLayoutContext.Provider>
  );
}

function Frame({
  children,
  layout: chosen,
  name,
  tagline,
}: {
  children: ReactNode;
  layout: Lockscreen;
  name: string;
  tagline: string | null | undefined;
}) {

  if (chosen === "split") {
    return (
      <div className="flex min-h-screen flex-col bg-background lg:flex-row">
        <aside className="relative flex flex-col justify-between overflow-hidden bg-primary px-6 py-6 text-primary-foreground lg:w-[44%] lg:px-12 lg:py-12">
          {/* Soft rings for depth; purely decorative. */}
          <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border-[48px] border-primary-foreground/10" />
          <div aria-hidden className="pointer-events-none absolute -top-16 -left-16 size-56 rounded-full bg-primary-foreground/10" />
          <div className="relative flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm">
              <BrandMark className="size-8" />
            </span>
            <span className="font-heading text-lg font-semibold">{name}</span>
          </div>
          <div className="relative hidden max-w-md lg:block">
            <p className="font-heading text-4xl leading-tight font-semibold">{name}</p>
            {tagline && <p className="mt-3 text-lg text-primary-foreground/80">{tagline}</p>}
          </div>
          <p className="relative hidden text-xs text-primary-foreground/60 lg:block">© {new Date().getFullYear()} {name}</p>
        </aside>
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    );
  }

  if (chosen === "spotlight") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-primary px-4 py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--primary-foreground) 22%, transparent), transparent 70%), radial-gradient(50% 40% at 100% 100%, color-mix(in oklab, black 35%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mb-6 flex flex-col items-center gap-3 text-center text-primary-foreground">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white p-2 shadow-lg">
            <BrandMark className="size-11" />
          </span>
          <div>
            <p className="font-heading text-2xl font-semibold">{name}</p>
            {tagline && <p className="text-sm text-primary-foreground/75">{tagline}</p>}
          </div>
        </div>
        <div className="relative w-full max-w-md [&>*]:shadow-2xl">{children}</div>
      </div>
    );
  }

  return <div className="flex min-h-screen items-center justify-center bg-background px-4">{children}</div>;
}

/** A miniature of each layout for the Branding picker: shapes only, in the live theme colours. */
export function LockscreenThumb({ layout, className }: { layout: Lockscreen; className?: string }) {
  const card = <span className="block h-[46%] w-[38%] rounded-[4px] border border-border bg-card shadow-sm" />;
  return (
    <span aria-hidden className={cn("flex aspect-[16/10] w-full overflow-hidden rounded-lg border border-border", className)}>
      {layout === "split" ? (
        <>
          <span className="flex w-[42%] flex-col justify-between bg-primary p-2">
            <span className="size-3 rounded-[3px] bg-primary-foreground/90" />
            <span className="block h-1.5 w-3/4 rounded bg-primary-foreground/70" />
          </span>
          <span className="flex flex-1 items-center justify-center bg-background">
            <span className="block h-[46%] w-[66%] rounded-[4px] border border-border bg-card shadow-sm" />
          </span>
        </>
      ) : layout === "spotlight" ? (
        <span className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-primary">
          <span className="size-3 rounded-[3px] bg-primary-foreground/90" />
          {card}
        </span>
      ) : (
        <span className="flex flex-1 items-center justify-center bg-background">{card}</span>
      )}
    </span>
  );
}
