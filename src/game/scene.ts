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
import { AlertSystem } from "./alert";
import { Mine, detonateChain } from "./mine";

const PLAYFIELD_W = 224; // left playfield width; right strip is the radar

export interface Controls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  fire: boolean;
}

/** Sound cues the scene emits each frame; the (browser-only) runner drains
 *  and plays them, keeping the scene itself audio-free and node-testable. */
export type SfxEvent =
  | "fire"
  | "explosion"
  | "baseExplode"
  | "mineExplode"
  | "playerHit"
  | "alertYellow"
  | "alertRed"
  | "sectorClear"
  | "blastOff";

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

  // alert condition + sector-clear mission loop
  alert = new AlertSystem();
  sector = 1;
  basesPerSector = 6;
  basesClearedThisSector = 0;

  // cosmo-mines (stationary chain-detonating hazards)
  mines: Mine[] = [];
  private mineSeed = 1;

  /** Sound-cue queue drained by the runner each frame. */
  readonly sfx: SfxEvent[] = [];
  private emit(ev: SfxEvent): void {
    this.sfx.push(ev);
  }

  constructor(private assets: VideoAssets) {
    this.starfield.enable(true);
    this.starfield.setActiveSets(0, 2);
    this.squadron = new Squadron({
      screenW: SCREEN_W, screenH: SCREEN_H, playfieldW: 224, count: 5,
    });
    this.scatterMines();
    this.emit("blastOff"); // launch voice cue on the first drained frame
  }

  private spawnBase(): void {
    const px = 40 + Math.random() * (224 - 80);
    const py = 30 + Math.random() * (SCREEN_H - 60);
    this.bases.push(new Base(px, py));
  }

  /** Scatter cosmo-mines in a couple of clusters (so chain detonations pay
   *  off), keeping clear of the player's central spawn. Deterministic per
   *  sector via a small LCG. */
  scatterMines(clusters = 2, perCluster = 4): void {
    let s = (this.mineSeed++ * 2654435761) >>> 0;
    const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const cx0 = SCREEN_W / 2;
    const cy0 = SCREEN_H / 2;
    for (let k = 0; k < clusters; k++) {
      let gx = 0, gy = 0;
      for (let tries = 0; tries < 20; tries++) {
        gx = 30 + rnd() * (PLAYFIELD_W - 60);
        gy = 30 + rnd() * (SCREEN_H - 60);
        if (Math.hypot(gx - cx0, gy - cy0) > 48) break; // away from spawn
      }
      for (let i = 0; i < perCluster; i++) {
        const mx = gx + (rnd() - 0.5) * 40;
        const my = gy + (rnd() - 0.5) * 40;
        this.mines.push(new Mine(
          Math.max(16, Math.min(PLAYFIELD_W - 16, mx)),
          Math.max(16, Math.min(SCREEN_H - 16, my)),
          Math.floor(rnd() * 32),
        ));
      }
    }
  }

  /** A base ("spy ship") was destroyed: the fleet scrambles (CONDITION RED)
   *  and the sector's objective count advances; clearing the quota completes
   *  the sector. */
  private onBaseDestroyed(): void {
    this.emit("baseExplode");
    if (this.alert.raise("RED", 360)) this.emit("alertRed");
    if (!this.squadron.active) this.squadron.spawn(this.spawnSeed++); // immediate assault
    this.basesClearedThisSector++;
    if (this.basesClearedThisSector >= this.basesPerSector) {
      this.sector++;
      this.basesClearedThisSector = 0;
      this.score += 1000 * (this.sector - 1); // sector-clear bonus
      this.basesPerSector = Math.min(12, this.basesPerSector + 1); // ramp difficulty
      this.alert.showBanner("SECTOR CLEARED", [120, 220, 255], 140);
      this.scatterMines(2 + Math.min(3, this.sector - 1)); // more mines each sector
      this.emit("sectorClear");
    }
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

    // alert condition decays / advances its banner each frame
    this.alert.update();

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
      this.emit("fire");
      // firing with a base on the field gets you spotted -> ALERT (yellow)
      if (this.bases.length > 0 && this.alert.raise("YELLOW", 240)) this.emit("alertYellow");
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
        // higher alert conditions scramble squadrons sooner
        this.spawnTimer = Math.round(150 / this.alert.aggression());
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
          this.emit("explosion");
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
    const beforeFire = this.enemyBullets.length;
    for (const b of this.bases) b.update(pcx, pcy, this.enemyBullets);
    // a base opening fire raises the alert to at least YELLOW
    if (this.enemyBullets.length > beforeFire && this.alert.raise("YELLOW", 240)) this.emit("alertYellow");

    // player bullets vs bases
    for (const b of this.bases) {
      for (const bul of this.bullets) {
        if (bul.life <= 0) continue;
        const s = b.hit(bul.x, bul.y);
        if (s > 0) {
          bul.life = 0;
          this.score += s;
          if (b.destroyed) this.onBaseDestroyed();
        }
      }
    }
    this.bullets = this.bullets.filter((bl) => bl.life > 0);

    // cosmo-mines: blink, then player bullets detonate them (with chaining)
    for (const m of this.mines) m.update();
    for (const bul of this.bullets) {
      if (bul.life <= 0) continue;
      const idx = this.mines.findIndex((m) => m.overlaps(bul.x, bul.y, 1));
      if (idx >= 0) {
        bul.life = 0;
        this.score += detonateChain(this.mines, idx);
        this.emit("mineExplode");
      }
    }
    this.mines = this.mines.filter((m) => m.alive);
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
      this.emit("playerHit");
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
    for (const m of this.mines) {
      if (m.overlaps(pcx, pcy, 6)) return true;
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

    // cosmo-mines (real gfx2 spore sprite)
    for (const m of this.mines) m.render(rgb, SCREEN_W, SCREEN_H, this.assets);

    // bases (real gfx2 station sprites 52-55)
    for (const b of this.bases) b.render(rgb, SCREEN_W, SCREEN_H, this.assets);

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

    // radar (right strip) — iconic Bosconian scope of the playfield
    this.drawRadar(rgb);

    // HUD: score + lives + sector + alert condition, using the ROM font
    this.drawText(rgb, `SCORE ${this.score}`, 1, 1);
    this.drawText(rgb, `SHIPS ${this.lives}`, 1, 2);
    this.drawText(rgb, `SECTOR ${this.sector}`, 1, 25);
    this.drawText(rgb, `COND ${this.alert.condition}`, 15, 25, this.alert.color());

    // centre-screen alert callout ("ALERT" / "CONDITION RED" / "SECTOR CLEARED")
    if (this.alert.bannerTimer > 0 && (this.alert.bannerTimer >> 3) & 1) {
      this.drawTextCentered(rgb, this.alert.banner, 96, this.alert.bannerColor);
    }
    return rgb;
  }

  /** Bosconian's right-side radar: a scaled top-down scope of the playfield
   *  showing the player, bases and enemies as blips. */
  private drawRadar(rgb: Uint8Array): void {
    const PF = 224; // playfield extent (world = screen for now)
    const rx0 = 228;
    const ry0 = 44;
    const rw = 56;
    const rh = 168;
    const px = (wx: number): number => rx0 + Math.round((wx / PF) * rw);
    const py = (wy: number): number => ry0 + Math.round((wy / SCREEN_H) * rh);
    const put = (x: number, y: number, c: [number, number, number], r = 0): void => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xi = x + dx;
          const yi = y + dy;
          if (xi < rx0 - 1 || xi > rx0 + rw + 1 || yi < ry0 - 1 || yi > ry0 + rh + 1) continue;
          if (xi < 0 || xi >= SCREEN_W || yi < 0 || yi >= SCREEN_H) continue;
          const o = (yi * SCREEN_W + xi) * 3;
          rgb[o] = c[0];
          rgb[o + 1] = c[1];
          rgb[o + 2] = c[2];
        }
    };
    const frame: [number, number, number] = [40, 120, 40];
    for (let x = rx0 - 1; x <= rx0 + rw + 1; x++) {
      put(x, ry0 - 1, frame);
      put(x, ry0 + rh + 1, frame);
    }
    for (let y = ry0 - 1; y <= ry0 + rh + 1; y++) {
      put(rx0 - 1, y, frame);
      put(rx0 + rw + 1, y, frame);
    }
    // mines (dim yellow), bases (green), enemies (blue), player (white)
    for (const m of this.mines) if (m.alive) put(px(m.x), py(m.y), [150, 140, 40], 0);
    for (const b of this.bases) if (!b.destroyed) put(px(b.x), py(b.y), [80, 230, 80], 1);
    for (const e of this.squadron.enemies) if (e.alive) put(px(e.x), py(e.y), [110, 160, 255], 0);
    put(px(this.player.x + 8), py(this.player.y + 8), [255, 255, 255], 1);
  }

  /** Draw text with the ROM font at pixel position (px0, py0). Digits 0-9 ->
   *  tile 0..9, A-Z -> tile 10..35. An explicit rgb overrides the char pen. */
  private drawTextPx(rgb: Uint8Array, text: string, px0: number, py0: number, rgbOverride?: [number, number, number]): void {
    if (!this.assets.chars.length) return;
    const pal = this.assets.palette;
    const color = 3; // a visible char color set
    let cx = px0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === " ") { cx += 8; continue; }
      let code = -1;
      if (ch >= "0" && ch <= "9") code = ch.charCodeAt(0) - 48;
      else if (ch >= "A" && ch <= "Z") code = 10 + ch.charCodeAt(0) - 65;
      if (code < 0) { cx += 8; continue; }
      const tile = this.assets.chars[code];
      if (!tile) { cx += 8; continue; }
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p = tile[y * 8 + x]!;
          if (p === 0) continue;
          const [r, g, b] = rgbOverride ?? pal.colors[pal.charPen[color * 4 + p]!] ?? [255, 255, 255];
          const px = cx + x;
          const py = py0 + y;
          if (px >= 0 && px < SCREEN_W && py >= 0 && py < SCREEN_H) {
            const o = (py * SCREEN_W + px) * 3;
            rgb[o] = r;
            rgb[o + 1] = g;
            rgb[o + 2] = b;
          }
        }
      }
      cx += 8;
    }
  }

  /** Tile-grid convenience wrapper (col/row are 8px cells). */
  private drawText(rgb: Uint8Array, text: string, col: number, row: number, rgbOverride?: [number, number, number]): void {
    this.drawTextPx(rgb, text, col * 8, row * 8, rgbOverride);
  }

  /** Horizontally centre text within the playfield (0..PLAYFIELD_W). */
  private drawTextCentered(rgb: Uint8Array, text: string, py: number, rgbOverride?: [number, number, number]): void {
    const px0 = Math.round((PLAYFIELD_W - text.length * 8) / 2);
    this.drawTextPx(rgb, text, px0, py, rgbOverride);
  }
}
