"use client";

/**
 * The dashboard grid (react-grid-layout). Cards are laid out per screen
 * width (lib/dashboard/cards: 12 columns on a desktop down to 2 on a
 * phone). Outside edit mode the grid is fixed and the cards are fully
 * interactive; in edit mode each card gets a drag surface over it, a
 * resize corner and a hide button, so links inside a card can't fire
 * while it's being moved.
 */
import "react-grid-layout/css/styles.css";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { EyeOff, GripVertical } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, type Layout, type ResponsiveLayouts } from "react-grid-layout";

import { BRAND_ICONS } from "@/lib/branding-icons";
import {
  BREAKPOINTS,
  BREAKPOINT_IDS,
  COLS,
  ROW_HEIGHT,
  cardDef,
  minWidthFor,
  type DashboardLayout,
  type DashboardSettings,
  type GridItem,
} from "@/lib/dashboard/cards";
import { cn } from "@/lib/utils";
import { CardMetaProvider } from "./card-meta";
import { DashboardCard, type DashboardData } from "./dashboard-cards";

const MARGIN: readonly [number, number] = [16, 16];

export function DashboardGrid({
  layout,
  cards,
  settings,
  data,
  editing,
  onMove,
  onHide,
}: {
  layout: DashboardLayout;
  /** Visible cards the user may see (permission-filtered). */
  cards: string[];
  settings: DashboardSettings;
  data: DashboardData;
  editing: boolean;
  onMove: (all: Partial<Record<string, readonly GridItem[]>>) => void;
  onHide: (id: string) => void;
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

  const titleOf = (id: string) => settings.cards?.[id]?.title || t(`cards.${id}`);
  const iconOf = (id: string) => BRAND_ICONS[settings.cards?.[id]?.icon || cardDef(id)!.icon] ?? null;

  const onLayoutChange = (_current: Layout, all: ResponsiveLayouts<string>) => {
    if (!editing) return; // the grid also reports on mount and on resize; only user edits are saved
    const plain: Partial<Record<string, GridItem[]>> = {};
    for (const [bp, items] of Object.entries(all)) {
      plain[bp] = (items ?? []).map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    }
    onMove(plain);
  };

  return (
    <div ref={containerRef} className={cn("-mx-1 px-1", editing && "dashboard-editing")}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW_HEIGHT}
          margin={MARGIN}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: editing, cancel: ".dashboard-no-drag", threshold: 4 }}
          resizeConfig={{ enabled: editing, handles: ["se"] }}
          onLayoutChange={onLayoutChange}
        >
          {cards.map((id) => {
            const title = titleOf(id);
            return (
              <div key={id} className="group/card relative">
                <CardMetaProvider value={{ title, Icon: iconOf(id) }}>
                  <div className="h-full">
                    <DashboardCard id={id} data={data} />
                  </div>
                </CardMetaProvider>
                {editing && (
                  <>
                    <div
                      aria-label={t("grid.moveCard", { name: title })}
                      className="absolute inset-0 z-10 flex cursor-move items-start justify-center rounded-2xl bg-primary/[0.03] ring-2 ring-primary/40 ring-inset"
                    >
                      <span className="mt-1.5 flex items-center rounded-full bg-card/90 px-2 py-0.5 text-muted-foreground shadow-xs">
                        <GripVertical className="size-3.5" />
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onHide(id)}
                      aria-label={t("grid.hide", { name: title })}
                      title={t("grid.hide", { name: title })}
                      className="dashboard-no-drag absolute top-2 right-2 z-20 flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs hover:text-destructive"
                    >
                      <EyeOff className="size-3.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
