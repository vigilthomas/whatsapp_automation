import { describe, expect, it } from "vitest";
import { MIN_CROP, cropOutputSize, initialCrop, moveCrop, resizeCrop } from "./logo-crop";

describe("logo crop selection", () => {
  it("starts centred: a square for circle/rounded, nearly the whole image otherwise", () => {
    expect(initialCrop(400, 200, true)).toEqual({ x: 110, y: 10, w: 180, h: 180 });
    expect(initialCrop(400, 200, false)).toEqual({ x: 20, y: 10, w: 360, h: 180 });
  });

  it("moving stays inside the image", () => {
    const r = { x: 10, y: 10, w: 100, h: 100 };
    expect(moveCrop(r, -50, 500, 400, 200)).toEqual({ x: 0, y: 100, w: 100, h: 100 });
    expect(moveCrop(r, 30, 20, 400, 200)).toEqual({ x: 40, y: 30, w: 100, h: 100 });
  });

  it("dragging a corner keeps the opposite corner still and stays inside the image", () => {
    const r = { x: 100, y: 50, w: 100, h: 100 };
    expect(resizeCrop(r, "se", 50, 20, 400, 200, false)).toEqual({ x: 100, y: 50, w: 150, h: 120 });
    expect(resizeCrop(r, "nw", -500, -500, 400, 200, false)).toEqual({ x: 0, y: 0, w: 200, h: 150 });
    // Square: both sides follow the larger move, and the image edge limits it.
    expect(resizeCrop(r, "se", 50, 10, 400, 200, true)).toEqual({ x: 100, y: 50, w: 150, h: 150 });
    expect(resizeCrop(r, "se", 300, 300, 400, 200, true)).toEqual({ x: 100, y: 50, w: 150, h: 150 });
    expect(resizeCrop(r, "ne", 20, 0, 400, 200, true)).toEqual({ x: 100, y: 30, w: 120, h: 120 });
  });

  it("never shrinks below the minimum or flips inside out", () => {
    const r = { x: 100, y: 50, w: 100, h: 100 };
    const out = resizeCrop(r, "se", -300, -300, 400, 200, false);
    expect(out).toEqual({ x: 100, y: 50, w: MIN_CROP, h: MIN_CROP });
  });

  it("saved logo is at most 512 px on its longer side", () => {
    expect(cropOutputSize(1000, 500)).toEqual({ width: 512, height: 256 });
    expect(cropOutputSize(120, 80)).toEqual({ width: 120, height: 80 });
    expect(cropOutputSize(10.6, 10.4)).toEqual({ width: 11, height: 10 });
  });
});
