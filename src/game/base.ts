// Enemy base ("spy ship") — original game logic + geometric rendering.
//
// The Bosconian base is a hexagonal station: six cannons around a central
// core. It is destroyed by shooting the core (which periodically opens) or by
// destroying all six cannons; it fires at the player. The real game draws the
// base from bg tilemap fragments; here it is drawn geometrically (recognizable
// and functional) until tile-accurate structure data is reconstructed.

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

  render(rgb: Uint8Array, width: number, height: number): void {
    if (this.destroyed) return;
    const plot = (x: number, y: number, r: number, g: number, b: number): void => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || xi >= width || yi < 0 || yi >= height) return;
      const o = (yi * width + xi) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    };
    // hexagonal frame: line segments between adjacent alive cannons
    for (let i = 0; i < CANNON_COUNT; i++) {
      const a = this.cannons[i]!;
      const bC = this.cannons[(i + 1) % CANNON_COUNT]!;
      if (!a.alive && !bC.alive) continue;
      const pa = this.cannonPos(a);
      const pb = this.cannonPos(bC);
      const steps = 12;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        plot(pa.x + (pb.x - pa.x) * t, pa.y + (pb.y - pa.y) * t, 30, 150, 40);
      }
    }
    // cannon pods
    for (const c of this.cannons) {
      if (!c.alive) continue;
      const p = this.cannonPos(c);
      for (let dy = -CANNON_R; dy <= CANNON_R; dy++)
        for (let dx = -CANNON_R; dx <= CANNON_R; dx++)
          if (dx * dx + dy * dy <= CANNON_R * CANNON_R) plot(p.x + dx, p.y + dy, 60, 220, 70);
    }
    // core: red, brighter/larger when open (vulnerable)
    if (this.coreAlive) {
      const open = this.coreVulnerable();
      const cr = open ? CORE_R : CORE_R - 2;
      const [r, g, b] = open ? [255, 90, 70] : [170, 40, 30];
      for (let dy = -cr; dy <= cr; dy++)
        for (let dx = -cr; dx <= cr; dx++)
          if (dx * dx + dy * dy <= cr * cr) plot(this.x + dx, this.y + dy, r, g, b);
    }
  }
}
