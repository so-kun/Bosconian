// Native Bosconian reimplementation (route c) — original game code.
//
// This does NOT execute the ROM. It reuses the decoded graphics + palette
// (loaded from the user's ROM at runtime via the video pipeline) and the
// 05XX starfield, and implements the game behaviour in TypeScript. This
// first scene establishes the core feel: a free-flying ship over the
// scrolling starfield, firing bullets in its heading — the foundation the
// enemies / bases / formations build on.

import { Starfield } from "../video/starfield";
import { drawSprite, SCREEN_H, SCREEN_W, type VideoAssets } from "../video/render";

export interface Controls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
}

interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
}

// Eight headings, clockwise from up. Each maps to a ship sprite orientation
// (base sprite + flip flags) and a bullet velocity.
interface Heading {
  dx: number;
  dy: number;
  sprite: number;
  flipx: boolean;
  flipy: boolean;
}

export class GameScene {
  starfield = new Starfield();
  player = { x: (SCREEN_W - 16) / 2, y: (SCREEN_H - 16) / 2 };
  headingIndex = 0; // 0 = up
  bullets: Bullet[] = [];
  private firePrev = false;
  private fireCooldown = 0;
  score = 0;

  /** Base player-ship sprite in gfx2. Bosconian's ship uses several rotation
   *  tiles; we pick a base and derive orientations with flips for now. */
  shipBaseSprite = 0;
  shipColor = 1;
  bulletColor = 1;

  constructor(private assets: VideoAssets) {
    this.starfield.enable(true);
    this.starfield.setActiveSets(0, 2);
  }

  private headings(): Heading[] {
    const s = this.shipBaseSprite;
    // 8 directions; flips give 4 mirrored pairs from 3 base tiles (N, NE, E).
    return [
      { dx: 0, dy: -1, sprite: s, flipx: false, flipy: false }, // up
      { dx: 1, dy: -1, sprite: s + 1, flipx: false, flipy: false }, // up-right
      { dx: 1, dy: 0, sprite: s + 2, flipx: false, flipy: false }, // right
      { dx: 1, dy: 1, sprite: s + 1, flipx: false, flipy: true }, // down-right
      { dx: 0, dy: 1, sprite: s, flipx: false, flipy: true }, // down
      { dx: -1, dy: 1, sprite: s + 1, flipx: true, flipy: true }, // down-left
      { dx: -1, dy: 0, sprite: s + 2, flipx: true, flipy: false }, // left
      { dx: -1, dy: -1, sprite: s + 1, flipx: true, flipy: false }, // up-left
    ];
  }

  private inputToHeading(c: Controls): number {
    const x = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const y = (c.down ? 1 : 0) - (c.up ? 1 : 0);
    if (x === 0 && y === 0) return this.headingIndex; // keep last
    // map (x,y) to one of 8 indices (clockwise from up)
    const table: Record<string, number> = {
      "0,-1": 0, "1,-1": 1, "1,0": 2, "1,1": 3,
      "0,1": 4, "-1,1": 5, "-1,0": 6, "-1,-1": 7,
    };
    return table[`${x},${y}`] ?? this.headingIndex;
  }

  update(c: Controls): void {
    const speed = 1.4;
    const x = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const y = (c.down ? 1 : 0) - (c.up ? 1 : 0);
    this.headingIndex = this.inputToHeading(c);

    // move ship (clamped to screen); world-scroll feel via the starfield
    this.player.x = Math.max(0, Math.min(SCREEN_W - 16, this.player.x + x * speed));
    this.player.y = Math.max(0, Math.min(SCREEN_H - 16, this.player.y + y * speed));

    // scroll the starfield opposite to travel for the flying illusion
    const sx = x > 0 ? 3 : x < 0 ? 4 : 0;
    const sy = y > 0 ? 3 : y < 0 ? 4 : 0;
    this.starfield.setScrollSpeed(sx, sy);

    // fire
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (c.fire && !this.firePrev && this.fireCooldown === 0) {
      const h = this.headings()[this.headingIndex]!;
      this.bullets.push({
        x: this.player.x + 8 + h.dx * 8,
        y: this.player.y + 8 + h.dy * 8,
        dx: h.dx * 4,
        dy: h.dy * 4,
        life: 60,
      });
      this.fireCooldown = 8;
    }
    this.firePrev = c.fire;

    // advance bullets
    for (const b of this.bullets) {
      b.x += b.dx;
      b.y += b.dy;
      b.life--;
    }
    this.bullets = this.bullets.filter(
      (b) => b.life > 0 && b.x >= 0 && b.x < SCREEN_W && b.y >= 0 && b.y < SCREEN_H,
    );
  }

  render(): Uint8Array {
    const rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3); // black background
    this.starfield.render(rgb, SCREEN_W, this.assets.palette);

    // bullets (small bright dots)
    const [br, bg, bb] = this.assets.palette.colors[31] ?? [255, 255, 255];
    for (const b of this.bullets) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const px = Math.round(b.x) + dx;
          const py = Math.round(b.y) + dy;
          if (px >= 0 && px < SCREEN_W && py >= 0 && py < SCREEN_H) {
            const o = (py * SCREEN_W + px) * 3;
            rgb[o] = br;
            rgb[o + 1] = bg;
            rgb[o + 2] = bb;
          }
        }
      }
    }

    // player ship
    if (this.assets.sprites) {
      const h = this.headings()[this.headingIndex]!;
      drawSprite(
        rgb, SCREEN_W, SCREEN_H, this.assets.sprites, this.assets.palette,
        h.sprite, this.shipColor, h.flipx, h.flipy,
        Math.round(this.player.x), Math.round(this.player.y),
      );
    }
    return rgb;
  }
}
