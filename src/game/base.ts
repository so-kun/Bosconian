// Enemy base ("spy ship") — original game logic, drawn with the REAL ROM
// graphics.
//
// The Bosconian base is a hexagonal "molecular" station: six spherical
// cannon-pods around a central reactor core, joined by struts. It is destroyed
// by shooting the core (which periodically opens) or by destroying all six
// pods; it fires at the player.
//
// The artwork is not hand-drawn: src/game/baseGfx.ts holds the exact tile codes
// and colour attributes the game's own base-draw routine (sub CPU 0x03d6)
// writes into the tilemap, captured by executing that routine directly in the
// Z80 core. Tiles come from gfx1 and colours from the real colour PROM, so what
// is drawn here is what the hardware draws.
//
// (Two earlier attempts were wrong and are recorded for honesty: gfx2 sprites
// 52-55 are the base *explosion*, and the later procedural pod drawing was a
// hand-drawn approximation.)

import { type VideoAssets } from "../video/render";
import { BASE_BLANK_TILE, BASE_COLS, BASE_ROWS, BASE_TYPE_A, type BaseGfx } from "./baseGfx";

export interface EnemyBullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
}

interface Cannon {
  angle: number; // radians around the core
  alive: boolean;
}

const CANNON_COUNT = 6;
const RADIUS = 18; // core-to-cannon distance
const CANNON_R = 4; // cannon hit radius
const CORE_R = 6; // core hit radius

export class Base {
  x: number;
  y: number;
  cannons: Cannon[] = [];
  coreAlive = true;
  coreOpen = false;
  destroyed = false;
  private coreTimer = 0;
  private fireTimer = 60;
  /** Which real ROM station graphic this base uses. */
  gfx: BaseGfx = BASE_TYPE_A;

  constructor(x: number, y: number, gfx: BaseGfx = BASE_TYPE_A) {
    this.x = x;
    this.y = y;
    this.gfx = gfx;
    // flat-top hexagon: two pods up, two down, one each side (matches arcade)
    for (let i = 0; i < CANNON_COUNT; i++) {
      this.cannons.push({ angle: (i / CANNON_COUNT) * Math.PI * 2 - Math.PI / 3, alive: true });
    }
  }

  private cannonPos(c: Cannon): { x: number; y: number } {
    return { x: this.x + Math.cos(c.angle) * RADIUS, y: this.y + Math.sin(c.angle) * RADIUS };
  }

  private aliveCannons(): number {
    return this.cannons.filter((c) => c.alive).length;
  }

  /** Core is vulnerable when it has opened, or once all cannons are gone. */
  private coreVulnerable(): boolean {
    return this.coreOpen || this.aliveCannons() === 0;
  }

  update(playerX: number, playerY: number, enemyBullets: EnemyBullet[]): void {
    if (this.destroyed) return;

    // core opens/closes on a cycle (the "mouth")
    this.coreTimer++;
    const phase = this.coreTimer % 240;
    this.coreOpen = phase >= 160; // open ~1/3 of the cycle

    // fire from a random alive cannon toward the player
    if (this.fireTimer > 0) this.fireTimer--;
    else {
      const alive = this.cannons.filter((c) => c.alive);
      if (alive.length) {
        const c = alive[Math.floor(Math.random() * alive.length)]!;
        const p = this.cannonPos(c);
        const dx = playerX - p.x;
        const dy = playerY - p.y;
        const len = Math.hypot(dx, dy) || 1;
        const spd = 1.6;
        enemyBullets.push({ x: p.x, y: p.y, dx: (dx / len) * spd, dy: (dy / len) * spd, life: 200 });
      }
      this.fireTimer = 70 + Math.floor(Math.random() * 40);
    }
  }

  /**
   * Test a player bullet against the base. Returns the score awarded and
   * updates state (destroys a cannon / the core). 0 = no hit.
   */
  hit(bx: number, by: number): number {
    if (this.destroyed) return 0;
    // cannons first
    for (const c of this.cannons) {
      if (!c.alive) continue;
      const p = this.cannonPos(c);
      if (Math.hypot(bx - p.x, by - p.y) <= CANNON_R + 1) {
        c.alive = false;
        return 200;
      }
    }
    // core (only when vulnerable)
    if (this.coreAlive && this.coreVulnerable()) {
      if (Math.hypot(bx - this.x, by - this.y) <= CORE_R + 1) {
        this.coreAlive = false;
        this.destroyed = true;
        return 1500;
      }
    }
    return 0;
  }

  /** Does a point (e.g. the player) overlap the base body? */
  overlaps(px: number, py: number, r: number): boolean {
    if (this.destroyed) return false;
    return Math.hypot(px - this.x, py - this.y) <= RADIUS + r;
  }

  /** Draw the station centred on the given screen position (sx, sy). In the
   *  wrapping world the scene supplies the on-screen centre; default to the
   *  object's own coordinates so callers/tests can treat them as screen space.
   *
   *  Draws the real ROM tile grid (see baseGfx.ts): 8x8 tiles of 8x8 px through
   *  the real character palette. A destroyed cannon blanks the tiles of its pod
   *  quadrant and leaves a flickering ember, so the station visibly loses a gun.
   */
  render(rgb: Uint8Array, width: number, height: number, assets: VideoAssets, sx = this.x, sy = this.y): void {
    if (this.destroyed || !assets.chars.length) return;
    const gfx: BaseGfx = this.gfx;
    const pal = assets.palette;
    const left = Math.round(sx) - (BASE_COLS * 8) / 2;
    const top = Math.round(sy) - (BASE_ROWS * 8) / 2;

    // which pods are gone -> blank the tiles nearest that pod
    const deadCentres: [number, number][] = [];
    for (const cn of this.cannons) {
      if (cn.alive) continue;
      deadCentres.push([
        (BASE_COLS * 8) / 2 + Math.cos(cn.angle) * RADIUS,
        (BASE_ROWS * 8) / 2 + Math.sin(cn.angle) * RADIUS,
      ]);
    }

    for (let r = 0; r < BASE_ROWS; r++) {
      for (let c = 0; c < BASE_COLS; c++) {
        const idx = r * BASE_COLS + c;
        const code = gfx.codes[idx]!;
        if (code === BASE_BLANK_TILE) continue;
        // skip tiles belonging to a destroyed pod
        const tcx = c * 8 + 4, tcy = r * 8 + 4;
        let dead = false;
        for (const [dx0, dy0] of deadCentres) {
          if (Math.hypot(tcx - dx0, tcy - dy0) < 10) { dead = true; break; }
        }
        if (dead) continue;
        const tile = assets.chars[code];
        if (!tile) continue;
        const attr = gfx.attrs[idx]!;
        const base = (attr & 0x3f) * 4;
        const fx = (attr >> 6) & 1, fy = (attr >> 7) & 1;
        for (let y = 0; y < 8; y++) {
          const py = top + r * 8 + y;
          if (py < 0 || py >= height) continue;
          for (let x = 0; x < 8; x++) {
            const px = left + c * 8 + x;
            if (px < 0 || px >= width) continue;
            const p = tile[(fy ? 7 - y : y) * 8 + (fx ? 7 - x : x)]!;
            if (p === 0) continue; // transparent
            const col = pal.colors[pal.charPen[base + p]!];
            if (!col) continue;
            const o = (py * width + px) * 3;
            rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
          }
        }
      }
    }

    // embers where pods were destroyed
    if ((this.coreTimer >> 2) & 1) {
      for (const [dx0, dy0] of deadCentres) {
        const ex = Math.round(left + dx0), ey = Math.round(top + dy0);
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xi = ex + dx, yi = ey + dy;
            if (xi < 0 || xi >= width || yi < 0 || yi >= height) continue;
            const o = (yi * width + xi) * 3;
            rgb[o] = 255; rgb[o + 1] = 200; rgb[o + 2] = 60;
          }
      }
    }
  }
}
