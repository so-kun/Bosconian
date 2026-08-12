// Cosmo-mines — original game logic, rendered with the real gfx2 mine sprite.
//
// Bosconian scatters "cosmo-mines" across the field: stationary spore mines
// that kill the player on contact and, when shot, detonate in a chain reaction
// that sets off neighbouring mines. Rendered with gfx2 sprite 40 (the radial
// spore star), blinking, in the green sprite colour bank.

import { drawSprite, type VideoAssets } from "../video/render";

const MINE_SPRITE = 40;
const MINE_COLOR = 7; // green sprite palette bank
const MINE_R = 6; // contact / hit radius
export const MINE_SCORE = 50;
const CHAIN_R = 34; // a detonation sets off mines within this distance

export class Mine {
  x: number;
  y: number;
  alive = true;
  private t: number;

  constructor(x: number, y: number, phase = 0) {
    this.x = x;
    this.y = y;
    this.t = phase;
  }

  update(): void {
    this.t++;
  }

  /** Does a point (e.g. the player centre) touch the mine? */
  overlaps(px: number, py: number, r: number): boolean {
    if (!this.alive) return false;
    return Math.hypot(px - this.x, py - this.y) <= MINE_R + r;
  }

  /** Draw the mine centred on screen position (sx, sy); defaults to the mine's
   *  own coordinates so callers/tests can treat them as screen space. */
  render(rgb: Uint8Array, width: number, height: number, assets: VideoAssets, sx = this.x, sy = this.y): void {
    if (!this.alive || !assets.sprites) return;
    // blink: skip drawing on part of the cycle
    if ((this.t >> 3) % 4 === 3) return;
    drawSprite(
      rgb, width, height, assets.sprites, assets.palette,
      MINE_SPRITE, MINE_COLOR, false, false,
      Math.round(sx) - 8, Math.round(sy) - 8,
    );
  }
}

/**
 * Detonate the mine at `index` and chain to neighbours within CHAIN_R,
 * breadth-first. Returns the total score for every mine set off.
 */
export function detonateChain(mines: Mine[], index: number): number {
  const start = mines[index];
  if (!start || !start.alive) return 0;
  let score = 0;
  const queue: Mine[] = [start];
  start.alive = false;
  while (queue.length) {
    const m = queue.shift()!;
    score += MINE_SCORE;
    for (const other of mines) {
      if (!other.alive) continue;
      if (Math.hypot(other.x - m.x, other.y - m.y) <= CHAIN_R) {
        other.alive = false;
        queue.push(other);
      }
    }
  }
  return score;
}
