// Enemy base ("spy ship") — original game logic + rendering.
//
// The Bosconian base is a hexagonal "molecular" station: six green spherical
// cannon-pods (each with a magenta cap) arranged in a flat-top hexagon around a
// central green reactor core with a red mouth-bar, joined by green struts. It
// is destroyed by shooting the core (which periodically opens) or by destroying
// all six pods; it fires at the player.
//
// The station is drawn to match the arcade reference (green pods + core), with
// each pod tied to a cannon so pods vanish individually as they are shot. (An
// earlier version mistakenly used gfx2 sprites 52-55 — those are actually the
// base *explosion*, not the intact station.)

import { type VideoAssets } from "../video/render";

// palette sampled from the arcade base
const POD_GREEN: [number, number, number] = [64, 200, 72];
const POD_GREEN_DARK: [number, number, number] = [34, 126, 46];
const POD_CAP: [number, number, number] = [180, 92, 208];
const CORE_GREEN: [number, number, number] = [80, 214, 88];
const CORE_RED: [number, number, number] = [224, 52, 44];
const STRUT: [number, number, number] = [46, 150, 56];

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
   *  Rendered procedurally to match the arcade base (assets currently unused). */
  render(rgb: Uint8Array, width: number, height: number, _assets: VideoAssets, sx = this.x, sy = this.y): void {
    if (this.destroyed) return;
    const cx = Math.round(sx);
    const cy = Math.round(sy);
    const plot = (xi: number, yi: number, c: [number, number, number]): void => {
      xi = Math.round(xi); yi = Math.round(yi);
      if (xi < 0 || xi >= width || yi < 0 || yi >= height) return;
      const o = (yi * width + xi) * 3;
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    };
    const line = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number], thick = 1): void => {
      const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t;
        for (let oy = 0; oy < thick; oy++) for (let ox = 0; ox < thick; ox++) plot(px + ox, py + oy, c);
      }
    };
    const podPos = (a: number): [number, number] => [cx + Math.cos(a) * RADIUS, cy + Math.sin(a) * RADIUS];

    // 1) struts: hexagon ring between adjacent live pods + spokes to the core
    for (let i = 0; i < CANNON_COUNT; i++) {
      const a = this.cannons[i]!, b = this.cannons[(i + 1) % CANNON_COUNT]!;
      const pa = podPos(a.angle), pb = podPos(b.angle);
      if (a.alive && b.alive) line(pa[0], pa[1], pb[0], pb[1], STRUT, 2);
      if (a.alive) line(cx, cy, pa[0], pa[1], STRUT, 1);
    }

    // 2) reactor core: green disc + a red mouth-bar (brighter/open when vulnerable)
    const open = this.coreAlive && this.coreVulnerable();
    for (let dy = -CORE_R; dy <= CORE_R; dy++)
      for (let dx = -CORE_R; dx <= CORE_R; dx++) {
        if (dx * dx + dy * dy > CORE_R * CORE_R) continue;
        plot(cx + dx, cy + dy, CORE_GREEN);
      }
    if (this.coreAlive) {
      const barH = open && ((this.coreTimer >> 3) & 1) ? 2 : 1;
      const red: [number, number, number] = open ? [255, 90, 70] : CORE_RED;
      for (let dy = -barH; dy <= barH; dy++)
        for (let dx = -CORE_R; dx <= CORE_R; dx++)
          if (dx * dx <= (CORE_R - 1) * (CORE_R - 1)) plot(cx + dx, cy + dy, red);
    }

    // 3) the six cannon-pods: green sphere + magenta cap; destroyed ones vanish
    //    leaving a dark crater with a flickering ember
    for (const cn of this.cannons) {
      const [pxc, pyc] = podPos(cn.angle);
      const pr = 6;
      if (cn.alive) {
        for (let dy = -pr; dy <= pr; dy++)
          for (let dx = -pr; dx <= pr; dx++) {
            if (dx * dx + dy * dy > pr * pr) continue;
            const col = dy < -2 ? POD_CAP : dy > 2 ? POD_GREEN_DARK : POD_GREEN;
            plot(pxc + dx, pyc + dy, col);
          }
      } else {
        const hot = (this.coreTimer >> 2) & 1;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 > 9) continue;
            plot(pxc + dx, pyc + dy, d2 <= 2 ? (hot ? [255, 210, 80] : [200, 120, 30]) : [10, 10, 14]);
          }
      }
    }
  }
}
