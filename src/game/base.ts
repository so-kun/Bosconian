// Enemy base ("spy ship") — original game logic, rendered with the real ROM
// station graphic.
//
// The Bosconian base is a hexagonal station: six cannons around a central
// reactor core. It is destroyed by shooting the core (which periodically
// opens) or by destroying all six cannons; it fires at the player.
//
// Rendering uses the real gfx2 sprites: the station body is a 2x2 sprite group
// (codes 52/53/54/55 = TL/TR/BL/BR) drawn in the green sprite colour bank 7 —
// the reactor-star core sits where the four quadrants meet. Sprites 52-55 were
// identified by assembling the gfx2 sprite atlas (see analysis/base_asm.png).

import { drawSprite, type VideoAssets } from "../video/render";

const BASE_TL = 52;
const BASE_TR = 53;
const BASE_BL = 54;
const BASE_BR = 55;
const BASE_COLOR = 7; // green sprite palette bank

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

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    for (let i = 0; i < CANNON_COUNT; i++) {
      this.cannons.push({ angle: (i / CANNON_COUNT) * Math.PI * 2 - Math.PI / 2, alive: true });
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
   *  object's own coordinates so callers/tests can treat them as screen space. */
  render(rgb: Uint8Array, width: number, height: number, assets: VideoAssets, sx = this.x, sy = this.y): void {
    if (this.destroyed || !assets.sprites) return;
    // 2x2 real station sprite group, centred on (sx, sy).
    const left = Math.round(sx) - 16;
    const top = Math.round(sy) - 16;
    const draw = (code: number, ox: number, oy: number): void =>
      drawSprite(rgb, width, height, assets.sprites!, assets.palette, code, BASE_COLOR, false, false, left + ox, top + oy);
    draw(BASE_TL, 0, 0);
    draw(BASE_TR, 16, 0);
    draw(BASE_BL, 0, 16);
    draw(BASE_BR, 16, 16);

    // Reactor highlight: when the core is vulnerable, pulse a bright pen at the
    // centre so the player can read the shootable window.
    if (this.coreAlive && this.coreVulnerable() && ((this.coreTimer >> 3) & 1)) {
      const cx = Math.round(sx);
      const cy = Math.round(sy);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 5) continue;
          const xi = cx + dx;
          const yi = cy + dy;
          if (xi < 0 || xi >= width || yi < 0 || yi >= height) continue;
          const o = (yi * width + xi) * 3;
          rgb[o] = 255;
          rgb[o + 1] = 255;
          rgb[o + 2] = 200;
        }
    }
  }
}
