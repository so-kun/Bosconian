// Native Bosconian reimplementation (route c) — original game code.
//
// This does NOT execute the ROM. It reuses the decoded graphics + palette
// (loaded from the user's ROM at runtime via the video pipeline) and the
// 05XX starfield, and implements the game behaviour in TypeScript. This
// first scene establishes the core feel: a free-flying ship over the
// scrolling starfield, firing bullets in its heading — the foundation the
// enemies / bases / formations build on.

import { Starfield } from "../video/starfield";
import { drawDot, drawSprite, SCREEN_H, SCREEN_W, type VideoAssets } from "../video/render";
import { Squadron } from "./enemies";
import { Base, type EnemyBullet } from "./base";

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

  // enemy squadrons (I-type formation fighters)
  private squadron: Squadron;
  enemyBaseSprite = 24; // gfx2 I-type fighter, 8 rotations
  enemyColor = 4;
  private spawnTimer = 90;
  private spawnSeed = 1;
  lives = 3;
  private invuln = 0;

  // enemy bases ("spy ships") and their bullets
  bases: Base[] = [];
  enemyBullets: EnemyBullet[] = [];
  private baseTimer = 60;

  constructor(private assets: VideoAssets) {
    this.starfield.enable(true);
    this.starfield.setActiveSets(0, 2);
    this.squadron = new Squadron({
      screenW: SCREEN_W, screenH: SCREEN_H, playfieldW: 224, count: 5,
    });
  }

  private spawnBase(): void {
    const px = 40 + Math.random() * (224 - 80);
    const py = 30 + Math.random() * (SCREEN_H - 60);
    this.bases.push(new Base(px, py));
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

    // enemy squadrons: spawn, update, collisions
    if (!this.squadron.active) {
      if (this.spawnTimer > 0) this.spawnTimer--;
      else {
        this.squadron.spawn(this.spawnSeed++);
        this.spawnTimer = 150;
      }
    } else {
      this.squadron.update(this.player.x + 8, this.player.y + 8);
    }

    // player bullets vs enemies (16x16 boxes)
    for (const e of this.squadron.enemies) {
      if (!e.alive) continue;
      for (const b of this.bullets) {
        if (b.life <= 0) continue;
        if (b.x >= e.x && b.x < e.x + 16 && b.y >= e.y && b.y < e.y + 16) {
          e.alive = false;
          b.life = 0;
          this.score += e.isLeader ? 200 : 70;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // bases: spawn (keep 1-2 on the field), update, fire
    this.bases = this.bases.filter((b) => !b.destroyed);
    if (this.bases.length < 2) {
      if (this.baseTimer > 0) this.baseTimer--;
      else {
        this.spawnBase();
        this.baseTimer = 240;
      }
    }
    const pcx = this.player.x + 8;
    const pcy = this.player.y + 8;
    for (const b of this.bases) b.update(pcx, pcy, this.enemyBullets);

    // player bullets vs bases
    for (const b of this.bases) {
      for (const bul of this.bullets) {
        if (bul.life <= 0) continue;
        const s = b.hit(bul.x, bul.y);
        if (s > 0) {
          bul.life = 0;
          this.score += s;
        }
      }
    }
    this.bullets = this.bullets.filter((bl) => bl.life > 0);

    // advance enemy bullets
    for (const eb of this.enemyBullets) {
      eb.x += eb.dx;
      eb.y += eb.dy;
      eb.life--;
    }
    this.enemyBullets = this.enemyBullets.filter(
      (eb) => eb.life > 0 && eb.x >= 0 && eb.x < SCREEN_W && eb.y >= 0 && eb.y < SCREEN_H,
    );

    // hazards vs player (enemies, enemy bullets, base bodies)
    if (this.invuln > 0) this.invuln--;
    else if (this.playerHit(pcx, pcy)) {
      this.lives = Math.max(0, this.lives - 1);
      this.invuln = 120;
      this.player.x = (SCREEN_W - 16) / 2;
      this.player.y = (SCREEN_H - 16) / 2;
      this.enemyBullets = [];
    }
  }

  private playerHit(pcx: number, pcy: number): boolean {
    for (const e of this.squadron.enemies) {
      if (e.alive && this.player.x < e.x + 14 && this.player.x + 14 > e.x &&
          this.player.y < e.y + 14 && this.player.y + 14 > e.y) return true;
    }
    for (const eb of this.enemyBullets) {
      if (Math.abs(eb.x - pcx) < 7 && Math.abs(eb.y - pcy) < 7) return true;
    }
    for (const b of this.bases) {
      if (b.overlaps(pcx, pcy, 7)) return true;
    }
    return false;
  }

  render(): Uint8Array {
    const rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3); // black background
    this.starfield.render(rgb, SCREEN_W, this.assets.palette);

    // player bullets: real gfx3 dot shape, bullet colours (palette 28-31)
    const pcol = this.assets.palette.colors[31] ?? [255, 255, 255];
    for (const b of this.bullets) {
      if (this.assets.dots) {
        drawDot(rgb, SCREEN_W, SCREEN_H, this.assets.dots, 0, pcol, Math.round(b.x) - 2, Math.round(b.y) - 2);
      }
    }

    // bases (geometric hexagonal spy ships)
    for (const b of this.bases) b.render(rgb, SCREEN_W, SCREEN_H);

    // enemy bullets: real gfx3 dot shape, a distinct bullet colour
    const ecol = this.assets.palette.colors[29] ?? [255, 170, 40];
    for (const eb of this.enemyBullets) {
      if (this.assets.dots) {
        drawDot(rgb, SCREEN_W, SCREEN_H, this.assets.dots, 2, ecol, Math.round(eb.x) - 2, Math.round(eb.y) - 2);
      }
    }

    // enemies
    if (this.assets.sprites) {
      for (const e of this.squadron.enemies) {
        if (!e.alive) continue;
        drawSprite(
          rgb, SCREEN_W, SCREEN_H, this.assets.sprites, this.assets.palette,
          this.enemyBaseSprite + (e.dir & 7), this.enemyColor, false, false,
          Math.round(e.x), Math.round(e.y),
        );
      }
    }

    // player ship (blink while invulnerable)
    if (this.assets.sprites && (this.invuln === 0 || (this.invuln >> 2) & 1)) {
      const h = this.headings()[this.headingIndex]!;
      drawSprite(
        rgb, SCREEN_W, SCREEN_H, this.assets.sprites, this.assets.palette,
        h.sprite, this.shipColor, h.flipx, h.flipy,
        Math.round(this.player.x), Math.round(this.player.y),
      );
    }

    // HUD: score + lives, using the ROM character font (gfx1)
    this.drawText(rgb, `SCORE ${this.score}`, 1, 1);
    this.drawText(rgb, `SHIPS ${this.lives}`, 1, 2);
    return rgb;
  }

  /** Draw text with the ROM font. Digits 0-9 -> tile 0..9, A-Z -> tile 10..35. */
  private drawText(rgb: Uint8Array, text: string, col: number, row: number): void {
    if (!this.assets.chars.length) return;
    const pal = this.assets.palette;
    const color = 3; // a visible char color set
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      let code = -1;
      if (ch >= "0" && ch <= "9") code = ch.charCodeAt(0) - 48;
      else if (ch >= "A" && ch <= "Z") code = 10 + ch.charCodeAt(0) - 65;
      else if (ch === " ") continue;
      if (code < 0) continue;
      const tile = this.assets.chars[code];
      if (!tile) continue;
      const sx = (col + i) * 8;
      const sy = row * 8;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p = tile[y * 8 + x]!;
          if (p === 0) continue;
          const [r, g, b] = pal.colors[pal.charPen[color * 4 + p]!] ?? [255, 255, 255];
          const px = sx + x;
          const py = sy + y;
          if (px >= 0 && px < SCREEN_W && py >= 0 && py < SCREEN_H) {
            const o = (py * SCREEN_W + px) * 3;
            rgb[o] = r;
            rgb[o + 1] = g;
            rgb[o + 2] = b;
          }
        }
      }
    }
  }
}
