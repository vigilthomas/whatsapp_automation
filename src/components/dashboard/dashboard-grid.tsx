"use client";

/**
 * The dashboard grid (react-grid-layout). Cards are laid out per screen
 * width (lib/dashboard/cards: 12 columns on a desktop down to 2 on a
 * phone). The layout is fixed: dashboard customisation (per-user
 * move/resize/hide, Settings → Dashboard card names and icons) was
 * removed, so every card shows its built-in title and icon.
 */
import "react-grid-layout/css/styles.css";

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
  type DashboardLayout,
} from "@/lib/dashboard/cards";
import { CardMetaProvider } from "./card-meta";
import { DashboardCard, type DashboardData } from "./dashboard-cards";

const MARGIN: readonly [number, number] = [16, 16];

export function DashboardGrid({
  layout,
  cards,
  data,
}: {
  layout: DashboardLayout;
  /** Visible cards the user may see (permission-filtered). */
  cards: string[];
  data: DashboardData;
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
            return (
              <div key={id} className="relative">
                <CardMetaProvider value={{ title: t(`cards.${id}`), Icon: iconOf(id) }}>
                  <div className="h-full">
                    <DashboardCard id={id} data={data} />
                  </div>
                </CardMetaProvider>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
