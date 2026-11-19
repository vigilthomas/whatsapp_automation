"use client";

/**
 * DataTable — the one modular table every list in the dashboard uses.
 *
 * What the user can do on any table:
 *   - drag a column header (grip on hover) to reorder columns;
 *   - drag a header's right edge to resize the column;
 *   - open the column menu (sliders icon, top-right of the header) to
 *     show/hide columns, reorder them in a list, and manage the table's
 *     single **preset**: "Save as my preset", "Apply my preset",
 *     "Reset to default".
 * Changes are kept automatically per table and per user (localStorage, see
 * src/lib/table-layout.ts for the rules).
 *
 * Calling convention — the page owns the layout so it can export what's
 * on screen:
 *
 *   const table = useTableLayout("master.branches", columns);
 *   <DataTable table={table} rows={rows} rowKey={(r) => r.id} />
 *   downloadCsv("branches.csv", recordsToCsv(rows, exportColumns(table)));
 *
 * `exportColumns` returns only the visible columns, in the on-screen
 * order, that define `exportValue` — so "Export" exports exactly the
 * columns the user chose to show.
 *
 * `leading` / `trailing` are fixed columns (row checkboxes, row actions):
 * never hidden, moved, resized or exported.
 */
import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bookmark, BookmarkCheck, GripVertical, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { CsvColumn } from "@/lib/master/csv";
import {
  defaultLayout,
  moveColumn,
  normalizeLayout,
  readStored,
  resizeColumn,
  sameLayout,
  storageKey,
  toggleColumn,
  writeStored,
  type LayoutColumn,
  type TableLayout,
} from "@/lib/table-layout";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DEFAULT_WIDTH = 170;
/** Header tint: the theme's main colour mixed into the card colour (opaque, so a pinned cell can use it too). */
const HEAD_BG =
  "bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))] dark:bg-[color-mix(in_oklab,var(--primary)_12%,var(--card))]";
/** The right-hand column (row actions + column menu) stays pinned while the table scrolls sideways. */
const PINNED = "sticky right-0 z-10 shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.25)]";

export interface DataColumn<T> extends LayoutColumn {
  id: string;
  /** Plain text: shown in the header, the column menu and the CSV header row. */
  header: string;
  cell: (row: T, index: number) => React.ReactNode;
  /** CSV value. Columns without one are never exported. */
  exportValue?: (row: T) => string;
  className?: string;
  headClassName?: string;
  align?: "left" | "right" | "center";
}

export interface FixedColumn<T> {
  header?: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  width: number;
  className?: string;
}

export interface TableController<T> {
  id: string;
  columns: DataColumn<T>[];
  layout: TableLayout;
  visibleColumns: DataColumn<T>[];
  move: (id: string, overId: string) => void;
  toggle: (id: string, show: boolean) => void;
  resize: (id: string, width: number) => void;
  reset: () => void;
  savePreset: () => void;
  applyPreset: () => void;
  hasPreset: boolean;
  /** The current layout equals the saved preset. */
  onPreset: boolean;
}

export function useTableLayout<T>(tableId: string, columns: DataColumn<T>[]): TableController<T> {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  // Column defs are often rebuilt each render; key the layout on their ids.
  const signature = columns.map((c) => `${c.id}:${c.hideable === false ? 0 : 1}:${c.defaultHidden ? 1 : 0}`).join("|");
  // Latest column defs for handlers/effects (refreshed after each render,
  // never written during render).
  const colsRef = React.useRef(columns);
  React.useEffect(() => {
    colsRef.current = columns;
  });

  const [layout, setLayout] = React.useState<TableLayout>(() => defaultLayout(columns));
  const [preset, setPreset] = React.useState<TableLayout | null>(null);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);

  // Load after mount (localStorage isn't available during SSR, and reading
  // it in the initial state would mismatch hydration).
  const loadKey = `${tableId}|${userId ?? ""}|${signature}`;
  React.useEffect(() => {
    const cols = colsRef.current;
    const current = readStored(storageKey(tableId, "current", userId));
    const savedPreset = readStored(storageKey(tableId, "preset", userId));
    setPreset(savedPreset ? normalizeLayout(cols, savedPreset) : null);
    setLayout(normalizeLayout(cols, current ?? savedPreset));
    setLoadedFor(loadKey);
  }, [loadKey, tableId, userId]);

  const update = React.useCallback(
    (fn: (l: TableLayout) => TableLayout) => {
      setLayout((prev) => {
        const next = fn(prev);
        if (next !== prev) writeStored(storageKey(tableId, "current", userId), next);
        return next;
      });
    },
    [tableId, userId],
  );

  const byId = React.useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const visibleColumns = layout.order
    .filter((id) => !layout.hidden.includes(id))
    .map((id) => byId.get(id))
    .filter((c): c is DataColumn<T> => !!c);

  return {
    id: tableId,
    columns,
    layout,
    visibleColumns,
    move: (id, overId) => update((l) => moveColumn(l, id, overId)),
    toggle: (id, show) => update((l) => toggleColumn(l, id, show)),
    resize: (id, width) => update((l) => resizeColumn(l, id, width, byId.get(id)?.minWidth)),
    reset: () => update(() => defaultLayout(colsRef.current)),
    savePreset: () => {
      writeStored(storageKey(tableId, "preset", userId), layout);
      setPreset(layout);
      toast.success("Saved as your preset for this table");
    },
    applyPreset: () => {
      if (preset) update(() => normalizeLayout(colsRef.current, preset));
    },
    hasPreset: !!preset,
    onPreset: !!preset && loadedFor === loadKey && sameLayout(preset, layout),
  };
}

/** CSV columns for what's on screen: visible, in display order, exportable only. */
export function exportColumns<T>(table: TableController<T>): CsvColumn<T>[] {
  return table.visibleColumns
    .filter((c) => c.exportValue)
    .map((c) => ({ key: c.id, label: c.header, value: c.exportValue! }));
}

/* ───────────────────────────── Column menu ───────────────────────────── */

function MenuRow<T>({ table, column }: { table: TableController<T>; column: DataColumn<T> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const shown = !table.layout.hidden.includes(column.id);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
        isDragging ? "z-10 bg-muted shadow-sm" : "hover:bg-muted/60",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Move ${column.header}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <label className="flex flex-1 cursor-pointer items-center gap-2 truncate text-popover-foreground">
        <Checkbox
          checked={shown}
          disabled={column.hideable === false}
          onCheckedChange={(c) => table.toggle(column.id, !!c)}
          aria-label={`Show ${column.header}`}
        />
        <span className="truncate">{column.header}</span>
      </label>
    </div>
  );
}

export function ColumnsMenu<T>({ table, className }: { table: TableController<T>; className?: string }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byId = new Map(table.columns.map((c) => [c.id, c]));
  const ordered = table.layout.order.map((id) => byId.get(id)).filter((c): c is DataColumn<T> => !!c);
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) table.move(String(e.active.id), String(e.over.id));
  };
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            title="Columns and preset"
            aria-label="Columns and preset"
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary",
              className,
            )}
          />
        }
      >
        <SlidersHorizontal className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-2">
        <p className="px-1.5 pt-0.5 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Columns
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ordered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {ordered.map((c) => (
                <MenuRow key={c.id} table={table} column={c} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <div className="mt-1 flex flex-col gap-0.5 border-t border-border pt-1.5">
          <p className="px-1.5 pb-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Preset</p>
          <button
            type="button"
            onClick={table.savePreset}
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm text-popover-foreground hover:bg-muted"
          >
            <Bookmark className="size-4 text-muted-foreground" />
            {table.hasPreset ? "Update my preset" : "Save as my preset"}
          </button>
          <button
            type="button"
            onClick={table.applyPreset}
            disabled={!table.hasPreset || table.onPreset}
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm text-popover-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
          >
            <BookmarkCheck className="size-4 text-muted-foreground" />
            {table.onPreset ? "Using my preset" : "Apply my preset"}
          </button>
          <button
            type="button"
            onClick={table.reset}
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm text-popover-foreground hover:bg-muted"
          >
            <RotateCcw className="size-4 text-muted-foreground" />
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ───────────────────────────── Header cell ───────────────────────────── */

function HeaderCell<T>({
  table,
  column,
  width,
  onLiveResize,
}: {
  table: TableController<T>;
  column: DataColumn<T>;
  width: number;
  onLiveResize: (id: string, w: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id });
  const thRef = React.useRef<HTMLTableCellElement | null>(null);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = thRef.current?.getBoundingClientRect().width ?? width;
    let last = startW;
    const move = (ev: PointerEvent) => {
      last = startW + ev.clientX - startX;
      onLiveResize(column.id, last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      onLiveResize(column.id, null);
      table.resize(column.id, last);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <th
      ref={(el) => {
        setNodeRef(el);
        thRef.current = el;
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/th relative h-10 px-3 text-left align-middle text-xs font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase select-none",
        column.align === "right" && "text-right",
        column.align === "center" && "text-center",
        isDragging && "z-20 bg-card opacity-90 shadow-md",
        column.headClassName,
      )}
    >
      <div className={cn("flex items-center gap-1", column.align === "right" && "justify-end")}>
        <button
          type="button"
          className="-ml-1.5 cursor-grab touch-none text-muted-foreground/0 transition-colors group-hover/th:text-muted-foreground hover:text-foreground focus-visible:text-foreground active:cursor-grabbing"
          aria-label={`Move ${column.header} column`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <span className="truncate">{column.header}</span>
      </div>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${column.header} column`}
        onPointerDown={startResize}
        onDoubleClick={() => table.resize(column.id, column.width ?? DEFAULT_WIDTH)}
        className="absolute top-2 right-0 bottom-2 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:right-0.5 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-primary"
      />
    </th>
  );
}

/* ───────────────────────────── Table ───────────────────────────── */

export interface DataTableProps<T> {
  table: TableController<T>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  loading?: boolean;
  /** Shown in the body when there are no rows. */
  empty?: React.ReactNode;
  leading?: FixedColumn<T>;
  trailing?: FixedColumn<T>;
  className?: string;
  /** Rendered under the table inside the card (pagination etc.). */
  footer?: React.ReactNode;
}

export function DataTable<T>({
  table,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  loading,
  empty,
  leading,
  trailing,
  className,
  footer,
}: DataTableProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Width while the user is dragging a resize handle (not saved until release).
  const [live, setLive] = React.useState<{ id: string; w: number } | null>(null);
  const onLiveResize = React.useCallback((id: string, w: number | null) => setLive(w === null ? null : { id, w }), []);

  const cols = table.visibleColumns;
  const widthOf = (c: DataColumn<T>) =>
    live?.id === c.id ? Math.max(c.minWidth ?? 60, live.w) : (table.layout.widths[c.id] ?? c.width ?? DEFAULT_WIDTH);
  const menuWidth = 44;
  const trailingWidth = Math.max(trailing?.width ?? 0, menuWidth);
  const total = (leading?.width ?? 0) + cols.reduce((s, c) => s + widthOf(c), 0) + trailingWidth;
  const span = cols.length + (leading ? 1 : 0) + 1;

  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) table.move(String(e.active.id), String(e.over.id));
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth: total }}>
            <colgroup>
              {leading ? <col style={{ width: leading.width }} /> : null}
              {cols.map((c) => (
                <col key={c.id} style={{ width: widthOf(c) }} />
              ))}
              <col style={{ width: trailingWidth }} />
            </colgroup>
            <thead className={cn("border-b border-border", HEAD_BG)}>
              <tr>
                {leading ? <th className="h-10 px-3 text-left align-middle">{leading.header}</th> : null}
                <SortableContext items={cols.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                  {cols.map((c) => (
                    <HeaderCell key={c.id} table={table} column={c} width={widthOf(c)} onLiveResize={onLiveResize} />
                  ))}
                </SortableContext>
                <th className={cn("h-10 px-2 text-right align-middle", PINNED, HEAD_BG)}>
                  <div className="flex items-center justify-end gap-1">
                    {trailing?.header}
                    <ColumnsMenu table={table} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={span} className="py-12 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-primary" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={span} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {empty ?? "Nothing here yet."}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-border transition-colors last:border-0 hover:bg-primary/[0.04] dark:hover:bg-primary/[0.08]",
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row),
                    )}
                  >
                    {leading ? (
                      <td className={cn("px-3 py-2.5 align-middle", leading.className)} onClick={(e) => e.stopPropagation()}>
                        {leading.cell(row, i)}
                      </td>
                    ) : null}
                    {cols.map((c) => (
                      <td
                        key={c.id}
                        className={cn(
                          "truncate px-3 py-2.5 align-middle text-muted-foreground",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                          c.className,
                        )}
                      >
                        {c.cell(row, i)}
                      </td>
                    ))}
                    <td
                      className={cn("bg-card px-2 py-2 text-right align-middle", PINNED, trailing?.className)}
                      onClick={trailing ? (e) => e.stopPropagation() : undefined}
                    >
                      {trailing?.cell(row, i)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>
      {footer ? <div className="border-t border-border px-3 py-2">{footer}</div> : null}
    </div>
  );
}
