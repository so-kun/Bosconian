// Enemy squadrons (I-type formation fighters) — original game logic.
//
// Bosconian's signature enemy behaviour: a squadron flies in formation, then
// peels off to attack the player; destroying the squadron leader makes the
// rest disperse. This module models that state machine. Sprites/colours come
// from the ROM at runtime (see scene.ts); only the behaviour is coded here.

export type EnemyState = "entering" | "formation" | "attacking" | "dispersing";

export interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number; // 0..7 heading for sprite orientation
  alive: boolean;
  isLeader: boolean;
  slot: number; // formation slot index
  state: EnemyState;
  t: number; // state timer
}

/** velocity -> 8-way direction index (0 = up, clockwise). */
export function velToDir(vx: number, vy: number): number {
  if (vx === 0 && vy === 0) return 0;
  const ang = Math.atan2(vx, -vy); // 0 = up, +clockwise
  let idx = Math.round(ang / (Math.PI / 4)) & 7;
  if (idx < 0) idx += 8;
  return idx;
}

function approach(cur: number, target: number, maxStep: number): number {
  const d = target - cur;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export interface SquadronConfig {
  screenW: number;
  screenH: number;
  count: number;
  playfieldW: number; // enemies stay left of the radar strip
}

export type FormationShape = "vee" | "line" | "column" | "diamond" | "wedge";

const SHAPES: FormationShape[] = ["vee", "line", "column", "diamond", "wedge"];

export class Squadron {
  enemies: Enemy[] = [];
  private cfg: SquadronConfig;
  private center = { x: 0, y: 0 };
  private drift = { x: 0.3, y: 0.2 };
  private formationTimer = 0;
  shape: FormationShape = "vee";
  /** How many ships this squadron spawned, and how many the player shot down —
   *  used by the scene to award a bonus for wiping out a whole formation. */
  spawnedCount = 0;
  killedByPlayer = 0;

  constructor(cfg: SquadronConfig) {
    this.cfg = cfg;
  }

  recordPlayerKill(): void {
    this.killedByPlayer++;
  }

  /** True once every ship the squadron spawned has been shot down (none escaped). */
  fullyCleared(): boolean {
    return this.spawnedCount > 0 && this.killedByPlayer >= this.spawnedCount;
  }

  get active(): boolean {
    return this.enemies.some((e) => e.alive);
  }

  /** Spawn a squadron entering from a screen edge, heading to a formation. */
  spawn(seed: number): void {
    const { screenW, screenH, count } = this.cfg;
    // enter from top or a side depending on seed
    const fromTop = (seed & 1) === 0;
    this.center.x = 40 + ((seed * 53) % (this.cfg.playfieldW - 80));
    this.center.y = 40 + ((seed * 31) % (screenH - 120));
    this.drift.x = ((seed & 2) ? 0.4 : -0.4);
    this.drift.y = ((seed & 4) ? 0.25 : -0.25);
    this.formationTimer = 180 + ((seed * 7) % 120);
    this.shape = SHAPES[seed % SHAPES.length]!;
    this.spawnedCount = count;
    this.killedByPlayer = 0;

    this.enemies = [];
    for (let i = 0; i < count; i++) {
      const ex = fromTop ? this.center.x + (i - count / 2) * 10 : -20 - i * 14;
      const ey = fromTop ? -20 - i * 14 : this.center.y + (i - count / 2) * 10;
      this.enemies.push({
        x: ex, y: ey, vx: 0, vy: 0, dir: 0,
        alive: true, isLeader: i === 0, slot: i,
        state: "entering", t: 0,
      });
    }
  }

  /** Unit slot offset (in formation cells) for the current shape. Slot 0 is the
   *  leader (apex / centre). */
  private slotOffset(slot: number): { x: number; y: number } {
    const n = this.cfg.count;
    const half = (n - 1) / 2;
    const off = slot - half;
    switch (this.shape) {
      case "line": return { x: off, y: 0 };
      case "column": return { x: 0, y: off };
      case "wedge": return { x: off, y: -Math.abs(off) * 0.7 };
      case "diamond": {
        if (slot === 0) return { x: 0, y: 0 };
        const a = ((slot - 1) / Math.max(1, n - 1)) * Math.PI * 2;
        return { x: Math.cos(a) * 1.3, y: Math.sin(a) * 1.3 };
      }
      case "vee":
      default: return { x: off, y: Math.abs(off) * 0.7 };
    }
  }

  /** Formation slot position relative to the drifting centre. */
  private slotPos(slot: number): { x: number; y: number } {
    const o = this.slotOffset(slot);
    const spacing = 16;
    return { x: this.center.x + o.x * spacing, y: this.center.y + o.y * spacing };
  }

  private leaderAlive(): boolean {
    return this.enemies.some((e) => e.alive && e.isLeader);
  }

  update(playerX: number, playerY: number): void {
    // drift formation center, bounce off playfield bounds
    this.center.x += this.drift.x;
    this.center.y += this.drift.y;
    if (this.center.x < 30 || this.center.x > this.cfg.playfieldW - 30) this.drift.x *= -1;
    if (this.center.y < 30 || this.center.y > this.cfg.screenH - 30) this.drift.y *= -1;

    const leaderGone = !this.leaderAlive();
    if (this.formationTimer > 0) this.formationTimer--;

    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t++;

      // leader death disperses everyone still in/entering formation
      if (leaderGone && (e.state === "formation" || e.state === "entering")) {
        e.state = "dispersing";
        e.t = 0;
        const ang = Math.random() * Math.PI * 2;
        e.vx = Math.cos(ang) * 1.6;
        e.vy = Math.sin(ang) * 1.6;
      }

      switch (e.state) {
        case "entering": {
          const slot = this.slotPos(e.slot);
          e.x = approach(e.x, slot.x, 1.6);
          e.y = approach(e.y, slot.y, 1.6);
          e.vx = slot.x - e.x;
          e.vy = slot.y - e.y;
          if (Math.abs(slot.x - e.x) < 1 && Math.abs(slot.y - e.y) < 1) {
            e.state = "formation";
            e.t = 0;
          }
          break;
        }
        case "formation": {
          const slot = this.slotPos(e.slot);
          e.vx = slot.x - e.x;
          e.vy = slot.y - e.y;
          e.x = slot.x;
          e.y = slot.y;
          // after the timer, non-leaders peel off to attack
          if (this.formationTimer === 0 && (!e.isLeader || this.cfg.count === 1)) {
            e.state = "attacking";
            e.t = 0;
          }
          break;
        }
        case "attacking": {
          // steer toward the player
          const dx = playerX - e.x;
          const dy = playerY - e.y;
          const len = Math.hypot(dx, dy) || 1;
          const spd = 1.7;
          e.vx = (dx / len) * spd;
          e.vy = (dy / len) * spd;
          e.x += e.vx;
          e.y += e.vy;
          // once past the player, disperse off-screen
          if (e.t > 240) {
            e.state = "dispersing";
            e.t = 0;
          }
          break;
        }
        case "dispersing": {
          e.x += e.vx;
          e.y += e.vy;
          if (
            e.x < -24 || e.x > this.cfg.screenW + 24 ||
            e.y < -24 || e.y > this.cfg.screenH + 24
          ) {
            e.alive = false;
          }
          break;
        }
      }
      e.dir = velToDir(e.vx, e.vy);
    }
  }
}
