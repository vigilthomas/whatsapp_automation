"use client";

/**
 * What the dashboard grid tells the card inside a slot: the title and
 * icon to show (Settings → Dashboard can rename any card and change its
 * icon; see lib/dashboard/cards.ts) and that it sits in a sized grid
 * cell, so it should fill the cell's height and scroll inside.
 *
 * Cards read it with `useCardMeta()` and fall back to their own title
 * and icon when rendered outside the grid.
 */
import { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react";

export interface CardMeta {
  title: string;
  Icon: LucideIcon | null;
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
