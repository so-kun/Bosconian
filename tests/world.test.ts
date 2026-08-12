// Tests for the toroidal world geometry helpers.

import { describe, expect, it } from "vitest";
import { WORLD_W, wrap, wrapDelta, nearestImage, wrapDist } from "../src/game/world";

describe("world geometry", () => {
  it("wraps coordinates into [0, size)", () => {
    expect(wrap(-1, 100)).toBe(99);
    expect(wrap(105, 100)).toBe(5);
    expect(wrap(50, 100)).toBe(50);
  });

  it("returns the shortest signed offset across the seam", () => {
    expect(wrapDelta(10, 1000)).toBe(10);
    expect(wrapDelta(-10, 1000)).toBe(-10);
    // 995 forward is really 5 backward on a 1000-ring
    expect(wrapDelta(995, 1000)).toBe(-5);
  });

  it("re-images a point next to a reference across the seam", () => {
    // ref near 0, value near the far edge -> nearest image is negative
    expect(nearestImage(WORLD_W - 3, 5, WORLD_W)).toBe(-3);
  });

  it("measures wrap-aware distance across the seam as small", () => {
    // two points either side of the x seam are actually close
    const d = wrapDist(2, 500, WORLD_W - 2, 500);
    expect(d).toBeCloseTo(4, 5);
  });
});
