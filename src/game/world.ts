// Toroidal (wrapping) world geometry for the scrolling playfield.
//
// The world is much larger than the screen and wraps on both axes. The ship is
// held at the centre of the play window and the world scrolls under it; static
// objects (bases, mines) and world-space projectiles are transformed to screen
// coordinates through the shortest wrapped offset from the ship.

export const WORLD_W = 1024;
export const WORLD_H = 1024;

/** Wrap a coordinate into [0, size). */
export function wrap(v: number, size: number): number {
  return ((v % size) + size) % size;
}

/** Shortest signed offset from a to b on a ring of circumference `size`
 *  (result in [-size/2, size/2)). */
export function wrapDelta(d: number, size: number): number {
  const w = wrap(d, size);
  return w >= size / 2 ? w - size : w;
}

/** Re-express `v` as the image of itself nearest to `ref` (for wrap-aware
 *  distance / collision against a plain Euclidean test). */
export function nearestImage(v: number, ref: number, size: number): number {
  return ref + wrapDelta(v - ref, size);
}

/** Wrap-aware distance between two world points. */
export function wrapDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = wrapDelta(ax - bx, WORLD_W);
  const dy = wrapDelta(ay - by, WORLD_H);
  return Math.hypot(dx, dy);
}
