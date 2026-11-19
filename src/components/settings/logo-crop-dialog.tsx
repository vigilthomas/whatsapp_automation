"use client";

/**
 * Crop an uploaded logo before it's used (Settings → Branding). Drag the box to
 * move it, drag a corner to resize it; arrow keys move it, Shift + arrows resize
 * it. For the circle and rounded shapes the box is square and drawn in that
 * shape. The result is saved as an image of at most 512 px.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LogoShape } from "@/lib/branding";
import { cropOutputSize, initialCrop, moveCrop, resizeCrop, type Corner, type Rect } from "@/lib/logo-crop";
import { cn } from "@/lib/utils";
import { LogoShapePicker } from "./logo-shape-picker";

const VIEW_W = 440;
const VIEW_H = 320;
/** Under the database's 700,000-character limit for an uploaded logo. */
const DATA_URL_MAX = 690_000;

type Drag = { kind: "move" | Corner; startX: number; startY: number; from: Rect };

export function LogoCropDialog({
  src,
  shape,
  onShape,
  onCancel,
  onDone,
}: {
  /** The image to crop (a data: URL), or null when the dialog is closed. */
  src: string | null;
  shape: LogoShape | null;
  onShape: (s: LogoShape) => void;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const t = useTranslations("Settings.branding");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const drag = useRef<Drag | null>(null);
  const square = shape === "circle" || shape === "rounded";

  // Load the image to learn its size.
  useEffect(() => {
    if (!src) return;
    let active = true;
    const el = new Image();
    el.onload = () => {
      if (active) setImg(el);
    };
    el.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  const loaded = img && img.src === src ? img : null;
  const w = loaded?.naturalWidth ?? 0;
  const h = loaded?.naturalHeight ?? 0;

  // A fresh box for each image, and a square one when the shape needs it.
  const [boxFor, setBoxFor] = useState<string>("");
  const key = loaded ? `${src}|${square}` : "";
  if (key && key !== boxFor) {
    setBoxFor(key);
    setRect(initialCrop(w, h, square));
  }

  const scale = w && h ? Math.min(VIEW_W / w, VIEW_H / h) : 1;
  const box = rect ?? { x: 0, y: 0, w: 0, h: 0 };

  const start = (kind: Drag["kind"]) => (e: ReactPointerEvent) => {
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind, startX: e.clientX, startY: e.clientY, from: rect };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    setRect(d.kind === "move" ? moveCrop(d.from, dx, dy, w, h) : resizeCrop(d.from, d.kind, dx, dy, w, h, square));
  };
  const stop = () => {
    drag.current = null;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!rect) return;
    const step = Math.max(1, Math.round(4 / scale));
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setRect(e.shiftKey ? resizeCrop(rect, "se", d[0], d[1], w, h, square) : moveCrop(rect, d[0], d[1], w, h));
  };

  const apply = () => {
    if (!loaded || !rect) return;
    const out = cropOutputSize(rect.w, rect.h);
    const canvas = document.createElement("canvas");
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return onDone(src!);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(loaded, rect.x, rect.y, rect.w, rect.h, 0, 0, out.width, out.height);
    let url = canvas.toDataURL("image/png");
    // Photos can be large as PNG: WebP keeps transparency and is much smaller.
    if (url.length > DATA_URL_MAX) url = canvas.toDataURL("image/webp", 0.9);
    if (url.length > DATA_URL_MAX) url = canvas.toDataURL("image/jpeg", 0.85);
    onDone(url);
  };

  const shapeClass = shape === "circle" ? "rounded-full" : shape === "rounded" ? "rounded-[22%]" : "";
  const corners: Corner[] = ["nw", "ne", "sw", "se"];

  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-[488px]">
        <DialogHeader>
          <DialogTitle>{t("cropTitle")}</DialogTitle>
          <DialogDescription>{t("cropDesc")}</DialogDescription>
        </DialogHeader>

        <LogoShapePicker value={shape} onChange={onShape} />

        <div className="flex justify-center rounded-lg bg-[repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2">
          {loaded ? (
            <div
              className="relative touch-none select-none overflow-hidden"
              style={{ width: w * scale, height: h * scale }}
              onPointerMove={onMove}
              onPointerUp={stop}
              onPointerCancel={stop}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL being cropped */}
              <img src={src!} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full" />
              <div
                role="group"
                aria-roledescription="crop box"
                tabIndex={0}
                aria-label={`${t("cropBox")}: ${Math.round(box.w)} × ${Math.round(box.h)} px`}
                onKeyDown={onKey}
                onPointerDown={start("move")}
                className={cn(
                  "absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] outline-none focus-visible:border-primary",
                  shapeClass,
                )}
                style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale }}
              />
              {corners.map((c) => (
                <span
                  key={c}
                  aria-hidden
                  onPointerDown={start(c)}
                  className={cn(
                    "absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/30 bg-white shadow",
                    c === "nw" || c === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
                  )}
                  style={{
                    left: (box.x + (c === "ne" || c === "se" ? box.w : 0)) * scale,
                    top: (box.y + (c === "sw" || c === "se" ? box.h : 0)) * scale,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-40 items-center text-xs text-muted-foreground">{t("cropLoading")}</div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("cropKeys")}</p>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>{t("cropCancel")}</Button>
          <Button type="button" variant="outline" disabled={!loaded} onClick={() => onDone(src!)}>{t("cropWhole")}</Button>
          <Button type="button" disabled={!loaded || !rect} onClick={apply}>{t("cropApply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
