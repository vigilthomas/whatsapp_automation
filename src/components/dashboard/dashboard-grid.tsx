"use client";

/**
 * The dashboard grid (react-grid-layout). Cards are laid out per screen
 * width (lib/dashboard/cards: 12 columns on a desktop down to 2 on a
 * phone). The layout is packed from the visible cards (lib/dashboard/
 * sectors.ts); users can't move or resize cards. Titles follow the
 * filter bar's range, and each card links to its filtered list.
 */
import "react-grid-layout/css/styles.css";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ResponsiveGridLayout, useContainerWidth, type ResponsiveLayouts } from "react-grid-layout";

import { BRAND_ICONS } from "@/lib/branding-icons";
import {
  BREAKPOINTS,
  BREAKPOINT_IDS,
  COLS,
  ROW_HEIGHT,
  cardDef,
  minWidthFor,
  type CardLinkQuery,
  type DashboardLayout,
} from "@/lib/dashboard/cards";
import { CardMetaProvider } from "./card-meta";
import { DashboardCard, type DashboardData } from "./dashboard-cards";

const MARGIN: readonly [number, number] = [16, 16];

export function DashboardGrid({
  layout,
  cards,
  data,
  link,
  titleParams,
  tagFor,
}: {
  layout: DashboardLayout;
  /** Visible cards the user may see (permission-filtered). */
  cards: string[];
  data: DashboardData;
  /** The filter bar's range and branch, carried into each card's link. */
  link: CardLinkQuery;
  /** Filled into card titles: {range} ("today", "this week", …) and {day}. */
  titleParams: { range: string; day: string };
  /** Whose numbers a card shows ("Whole business", "Your bookings"), if worth saying. */
  tagFor: (id: string) => string | undefined;
}) {
  const t = useTranslations("Dashboard");
  const { width, containerRef, mounted } = useContainerWidth();
  const shown = useMemo(() => new Set(cards), [cards]);

  // Positions plus each card's minimum size for that breakpoint.
  const layouts = useMemo(() => {
    const out: ResponsiveLayouts<string> = {};
    for (const bp of BREAKPOINT_IDS) {
      const cols = COLS[bp];
      out[bp] = (layout.layouts[bp] ?? [])
        .filter((it) => shown.has(it.i))
        .map((it) => {
          const def = cardDef(it.i)!;
          return {
            ...it,
            minW: minWidthFor(def, cols),
            minH: def.minH,
          };
        });
    }
    return out;
  }, [layout.layouts, shown]);

  const iconOf = (id: string) => BRAND_ICONS[cardDef(id)!.icon] ?? null;

  return (
    <div ref={containerRef} className="-mx-1 px-1">
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: false }}
          resizeConfig={{ enabled: false }}
        >
          {cards.map((id) => {
            const def = cardDef(id)!;
            const title = t(`cards.${id}`, titleParams);
            const href = def.href?.(link);
            // Number tiles are links as a whole; bigger cards keep their
            // own "View all" link, pointed at the same filtered page.
            const tile = id.startsWith("stat-") || id.startsWith("metric-");
            const body = <DashboardCard id={id} data={data} />;
            return (
              <div key={id} className="relative">
                <CardMetaProvider value={{ title, Icon: iconOf(id), href, tag: tagFor(id) }}>
                  {tile && href ? (
                    <Link
                      href={href}
                      aria-label={title}
                      className="block h-full rounded-2xl transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="h-full">{body}</div>
                  )}
                </CardMetaProvider>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
