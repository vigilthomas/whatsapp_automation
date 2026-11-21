"use client";

/**
 * What the dashboard grid tells the card inside a slot: the title and
 * icon to show (see lib/dashboard/cards.ts) and that it sits in a sized grid
 * cell, so it should fill the cell's height and scroll inside.
 *
 * Cards read it with `useCardMeta()` and fall back to their own title
 * and icon when rendered outside the grid. Titles come from the card
 * catalogue (Dashboard.cards.*), with the chosen date range filled in.
 */
import { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react";

export interface CardMeta {
  title: string;
  Icon: LucideIcon | null;
  /** Where the card's "View all" goes (dashboard range + branch applied). */
  href?: string;
  /**
   * Small label next to the title saying whose numbers these are:
   * "Whole business" on cards data scope can't narrow, "Your bookings" /
   * "Your branch" on booking cards when the viewer's scope isn't All.
   */
  tag?: string;
}

const CardMetaContext = createContext<CardMeta | null>(null);

export const CardMetaProvider = CardMetaContext.Provider;

export function useCardMeta(): CardMeta | null {
  return useContext(CardMetaContext);
}

/** The card's icon next to its title, when the grid gave one. */
export function CardTitleIcon({ className = "size-4 text-muted-foreground" }: { className?: string }) {
  const meta = useCardMeta();
  if (!meta?.Icon) return null;
  const Icon = meta.Icon;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}

/** The card's whose-numbers tag, when the grid gave one. */
export function CardTag() {
  const meta = useCardMeta();
  if (!meta?.tag) return null;
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap text-muted-foreground">
      {meta.tag}
    </span>
  );
}
