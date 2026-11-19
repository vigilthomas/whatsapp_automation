/**
 * The crop box for an uploaded logo (Settings → Branding). Everything is in the
 * image's own pixels; the dialog converts pointer moves into these units.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Corner = "nw" | "ne" | "sw" | "se";

export const MIN_CROP = 16;
export const CROP_OUTPUT_MAX = 512;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** A centred box covering 90% of the image (a square when `square`). */
export function initialCrop(imgW: number, imgH: number, square: boolean): Rect {
  const w = Math.round((square ? Math.min(imgW, imgH) : imgW) * 0.9);
  const h = Math.round((square ? Math.min(imgW, imgH) : imgH) * 0.9);
  return { x: Math.round((imgW - w) / 2), y: Math.round((imgH - h) / 2), w, h };
}

/** The box moved by (dx, dy), kept inside the image. */
export function moveCrop(r: Rect, dx: number, dy: number, imgW: number, imgH: number): Rect {
  return { ...r, x: clamp(r.x + dx, 0, imgW - r.w), y: clamp(r.y + dy, 0, imgH - r.h) };
}

/** The box with one corner dragged by (dx, dy); the opposite corner stays where it is. */
export function resizeCrop(r: Rect, corner: Corner, dx: number, dy: number, imgW: number, imgH: number, square: boolean): Rect {
  const west = corner === "nw" || corner === "sw";
  const north = corner === "nw" || corner === "ne";
  // The fixed corner, and how much room there is from it towards the dragged one.
  const fx = west ? r.x + r.w : r.x;
  const fy = north ? r.y + r.h : r.y;
  const roomW = west ? fx : imgW - fx;
  const roomH = north ? fy : imgH - fy;
  let w = r.w + (west ? -dx : dx);
  let h = r.h + (north ? -dy : dy);
  if (square) {
    const side = clamp(Math.max(w, h), MIN_CROP, Math.min(roomW, roomH));
    w = h = side;
  } else {
    w = clamp(w, MIN_CROP, roomW);
    h = clamp(h, MIN_CROP, roomH);
  }
  return { x: west ? fx - w : fx, y: north ? fy - h : fy, w, h };
}

/** Pixel size of the saved logo: the crop scaled down to fit `max` on its longer side. */
export function cropOutputSize(w: number, h: number, max = CROP_OUTPUT_MAX): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
