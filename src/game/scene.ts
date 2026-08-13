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
import { WORLD_W, WORLD_H, wrap, wrapDelta, nearestImage, wrapDist } from "./world";

const PLAYFIELD_W = 224; // left playfield width; right strip is the radar
const VIEW_CX = PLAYFIELD_W / 2; // ship is pinned to the centre of the play window
const VIEW_CY = SCREEN_H / 2;

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
  | "blastOff"
  | "extend"
  | "gameOver";

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
  // player position is in WORLD coordinates (top-left of the 16x16 ship); the
  // ship is drawn pinned to the centre of the play window and the world scrolls
  // under it. Starts at the centre of the wrapping world.
  player = { x: WORLD_W / 2 - 8, y: WORLD_H / 2 - 8 };
  headingIndex = 0; // 0 = up
  bullets: Bullet[] = [];
  private firePrev = false;
  private fireCooldown = 0;
  score = 0;

  /** Base player-ship sprite in gfx2. Bosconian's ship uses several rotation
   *  tiles; we pick a base and derive orientations with flips for now. */
  shipBaseSprite = 0;
  // sprite colour bank 9 = the authentic Bosconian fighter: a white/silver hull
  // with a red cockpit line and orange accents (row 2, col 2 of the sprite
  // colour-bank grid; bank 1 was red, bank 13 too blue).
  shipColor = 9;
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

  // session state: title -> playing -> gameover (-> title/playing on restart)
  state: "title" | "playing" | "gameover" = "title";
  highScore = 20000; // Bosconian's default high-score line
  private nextExtend = 15000; // first bonus ship at 15k, then every 50k
  private tick = 0; // free-running counter for blink timing

  /** Sound-cue queue drained by the runner each frame. */
  readonly sfx: SfxEvent[] = [];
  private emit(ev: SfxEvent): void {
    this.sfx.push(ev);
  }

  // --- world <-> screen (ship pinned to view centre) ------------------------
  private toScreenX(wx: number): number {
    return wrapDelta(wx - (this.player.x + 8), WORLD_W) + VIEW_CX;
  }
  private toScreenY(wy: number): number {
    return wrapDelta(wy - (this.player.y + 8), WORLD_H) + VIEW_CY;
  }
  /** Is a world point within the visible play window (plus margin)? */
  private onView(wx: number, wy: number, margin = 12): boolean {
    const sx = this.toScreenX(wx);
    const sy = this.toScreenY(wy);
    return sx >= -margin && sx < PLAYFIELD_W + margin && sy >= -margin && sy < SCREEN_H + margin;
  }

  constructor(private assets: VideoAssets) {
    this.starfield.enable(true);
    this.starfield.setActiveSets(0, 2);
    this.squadron = new Squadron({
      screenW: SCREEN_W, screenH: SCREEN_H, playfieldW: 224, count: 5,
    });
    this.scatterMines();
    // start on the title screen; blast-off plays when the game actually begins
  }

  /** Start (or restart) a fresh game from the title / game-over screen. */
  resetGame(): void {
    this.player = { x: WORLD_W / 2 - 8, y: WORLD_H / 2 - 8 };
    this.headingIndex = 0;
    this.bullets = [];
    this.fireCooldown = 0;
    this.score = 0;
    this.lives = 3;
    this.invuln = 0;
    this.spawnTimer = 90;
    this.bases = [];
    this.enemyBullets = [];
    this.baseTimer = 60;
    this.alert = new AlertSystem();
    this.sector = 1;
    this.basesPerSector = 6;
    this.basesClearedThisSector = 0;
    this.mines = [];
    this.nextExtend = 15000;
    this.state = "playing";
    this.squadron = new Squadron({ screenW: SCREEN_W, screenH: SCREEN_H, playfieldW: 224, count: 5 });
    this.scatterMines();
    this.emit("blastOff");
  }

  private spawnBase(): void {
    // place somewhere in the world, but not right on top of the ship
    let wx = 0, wy = 0;
    for (let tries = 0; tries < 30; tries++) {
      wx = Math.random() * WORLD_W;
      wy = Math.random() * WORLD_H;
      if (wrapDist(wx, wy, this.player.x + 8, this.player.y + 8) > 140) break;
    }
    this.bases.push(new Base(wx, wy));
  }

  /** Scatter cosmo-mines in a couple of clusters (so chain detonations pay
   *  off), keeping clear of the player's central spawn. Deterministic per
   *  sector via a small LCG. */
  scatterMines(clusters = 2, perCluster = 4): void {
    let s = (this.mineSeed++ * 2654435761) >>> 0;
    const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const cx0 = this.player.x + 8;
    const cy0 = this.player.y + 8;
    for (let k = 0; k < clusters; k++) {
      let gx = 0, gy = 0;
      for (let tries = 0; tries < 20; tries++) {
        gx = rnd() * WORLD_W;
        gy = rnd() * WORLD_H;
        if (wrapDist(gx, gy, cx0, cy0) > 120) break; // away from ship
      }
      for (let i = 0; i < perCluster; i++) {
        const mx = wrap(gx + (rnd() - 0.5) * 40, WORLD_W);
        const my = wrap(gy + (rnd() - 0.5) * 40, WORLD_H);
        this.mines.push(new Mine(mx, my, Math.floor(rnd() * 32)));
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
    this.tick++;

    // title / game-over: freeze the field; a fire press starts a fresh game.
    // Drift the starfield so the attract screen isn't static.
    if (this.state !== "playing") {
      this.starfield.setScrollSpeed(0, 2);
      if (c.fire && !this.firePrev) this.resetGame();
      this.firePrev = c.fire;
      return;
    }

    const speed = 1.4;
    const x = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    const y = (c.down ? 1 : 0) - (c.up ? 1 : 0);
    this.headingIndex = this.inputToHeading(c);

    // alert condition decays / advances its banner each frame
    this.alert.update();

    // move ship through the wrapping world (the view scrolls under it)
    this.player.x = wrap(this.player.x + x * speed, WORLD_W);
    this.player.y = wrap(this.player.y + y * speed, WORLD_H);

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
    this.bullets = this.bullets.filter((b) => b.life > 0 && this.onView(b.x, b.y));

    // enemy squadrons live in screen space and home on the pinned ship centre
    if (!this.squadron.active) {
      if (this.spawnTimer > 0) this.spawnTimer--;
      else {
        this.squadron.spawn(this.spawnSeed++);
        // higher alert conditions scramble squadrons sooner
        this.spawnTimer = Math.round(150 / this.alert.aggression());
      }
    } else {
      this.squadron.update(VIEW_CX, VIEW_CY);
    }

    // player bullets vs enemies (16x16 boxes) — bullets are world-space, so
    // test them in screen space where the enemies live
    const squadronWasActive = this.squadron.active;
    for (const e of this.squadron.enemies) {
      if (!e.alive) continue;
      for (const b of this.bullets) {
        if (b.life <= 0) continue;
        const bsx = this.toScreenX(b.x);
        const bsy = this.toScreenY(b.y);
        if (bsx >= e.x && bsx < e.x + 16 && bsy >= e.y && bsy < e.y + 16) {
          e.alive = false;
          b.life = 0;
          this.score += e.isLeader ? 200 : 70;
          this.squadron.recordPlayerKill();
          this.emit("explosion");
          break;
        }
      }
    }
    // wiping out an entire formation (none escaped) pays a bonus
    if (squadronWasActive && !this.squadron.active && this.squadron.fullyCleared()) {
      this.score += 1000;
      this.alert.showBanner("FORMATION", [255, 220, 120], 90);
      this.emit("sectorClear");
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // bases: keep several spread across the world (the radar guides you to
    // them), update, fire. World-space bullets are matched against each base
    // through the nearest wrapped image so hits work across the seam.
    this.bases = this.bases.filter((b) => !b.destroyed);
    if (this.bases.length < 4) {
      if (this.baseTimer > 0) this.baseTimer--;
      else {
        this.spawnBase();
        this.baseTimer = 150;
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
        const s = b.hit(nearestImage(bul.x, b.x, WORLD_W), nearestImage(bul.y, b.y, WORLD_H));
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
      const idx = this.mines.findIndex((m) =>
        m.overlaps(nearestImage(bul.x, m.x, WORLD_W), nearestImage(bul.y, m.y, WORLD_H), 1));
      if (idx >= 0) {
        bul.life = 0;
        this.score += detonateChain(this.mines, idx);
        this.emit("mineExplode");
      }
    }
    this.mines = this.mines.filter((m) => m.alive);
    this.bullets = this.bullets.filter((bl) => bl.life > 0);

    // advance enemy bullets (world-space); cull once they leave the view
    for (const eb of this.enemyBullets) {
      eb.x += eb.dx;
      eb.y += eb.dy;
      eb.life--;
    }
    this.enemyBullets = this.enemyBullets.filter((eb) => eb.life > 0 && this.onView(eb.x, eb.y));

    // extend: award a bonus ship when crossing each score threshold. Resolved
    // before the hazard check so a life earned this frame counts before a death.
    while (this.score >= this.nextExtend) {
      this.lives++;
      this.emit("extend");
      this.alert.showBanner("EXTRA SHIP", [120, 255, 160], 100);
      this.nextExtend += 50000;
    }

    // hazards vs player (enemies, enemy bullets, base bodies, mines)
    if (this.invuln > 0) this.invuln--;
    else if (this.playerHit(pcx, pcy)) {
      this.lives = Math.max(0, this.lives - 1);
      this.emit("playerHit");
      this.invuln = 120;
      this.enemyBullets = [];
      if (this.lives === 0) {
        this.state = "gameover";
        this.highScore = Math.max(this.highScore, this.score);
        this.emit("gameOver");
      }
    }
  }

  private playerHit(pcx: number, pcy: number): boolean {
    // ship is pinned to the view centre; enemies live in screen space
    const shipL = VIEW_CX - 8;
    const shipT = VIEW_CY - 8;
    for (const e of this.squadron.enemies) {
      if (e.alive && shipL < e.x + 14 && shipL + 14 > e.x &&
          shipT < e.y + 14 && shipT + 14 > e.y) return true;
    }
    // enemy bullets are world-space; compare at the ship's screen centre
    for (const eb of this.enemyBullets) {
      if (Math.abs(this.toScreenX(eb.x) - VIEW_CX) < 7 && Math.abs(this.toScreenY(eb.y) - VIEW_CY) < 7) return true;
    }
    // bases / mines are world-space; wrap-aware distance to the ship
    for (const b of this.bases) {
      if (!b.destroyed && wrapDist(b.x, b.y, pcx, pcy) <= 18 + 7) return true;
    }
    for (const m of this.mines) {
      if (m.alive && wrapDist(m.x, m.y, pcx, pcy) <= 6 + 6) return true;
    }
    return false;
  }

  render(): Uint8Array {
    const rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3); // black background
    this.starfield.render(rgb, SCREEN_W, this.assets.palette);

    // title / attract screen: clean starfield + title over the whole frame
    if (this.state === "title") {
      this.drawTitle(rgb);
      return rgb;
    }

    // player bullets: real gfx3 dot shape, bullet colours (world -> screen)
    const pcol = this.assets.palette.colors[31] ?? [255, 255, 255];
    for (const b of this.bullets) {
      if (!this.assets.dots || !this.onView(b.x, b.y, 4)) continue;
      drawDot(rgb, SCREEN_W, SCREEN_H, this.assets.dots, 0, pcol,
        Math.round(this.toScreenX(b.x)) - 2, Math.round(this.toScreenY(b.y)) - 2);
    }

    // cosmo-mines (real gfx2 spore sprite) — world -> screen, culled
    for (const m of this.mines) {
      if (!this.onView(m.x, m.y)) continue;
      m.render(rgb, SCREEN_W, SCREEN_H, this.assets, this.toScreenX(m.x), this.toScreenY(m.y));
    }

    // bases (real gfx2 station sprites 52-55) — world -> screen, culled
    for (const b of this.bases) {
      if (!this.onView(b.x, b.y, 20)) continue;
      b.render(rgb, SCREEN_W, SCREEN_H, this.assets, this.toScreenX(b.x), this.toScreenY(b.y));
    }

    // enemy bullets: real gfx3 dot shape (world -> screen)
    const ecol = this.assets.palette.colors[29] ?? [255, 170, 40];
    for (const eb of this.enemyBullets) {
      if (!this.assets.dots || !this.onView(eb.x, eb.y, 4)) continue;
      drawDot(rgb, SCREEN_W, SCREEN_H, this.assets.dots, 2, ecol,
        Math.round(this.toScreenX(eb.x)) - 2, Math.round(this.toScreenY(eb.y)) - 2);
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

    // player ship — pinned to the view centre (blink while invulnerable)
    if (this.assets.sprites && (this.invuln === 0 || (this.invuln >> 2) & 1)) {
      const h = this.headings()[this.headingIndex]!;
      drawSprite(
        rgb, SCREEN_W, SCREEN_H, this.assets.sprites, this.assets.palette,
        h.sprite, this.shipColor, h.flipx, h.flipy,
        VIEW_CX - 8, VIEW_CY - 8,
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

    // game-over overlay
    if (this.state === "gameover") {
      this.drawTextCentered(rgb, "GAME OVER", 100, [255, 80, 80]);
      if ((this.tick >> 4) & 1) this.drawTextCentered(rgb, "PRESS FIRE", 120, [220, 220, 220]);
    }
    return rgb;
  }

  /** Title / attract screen. */
  private drawTitle(rgb: Uint8Array): void {
    this.drawTextCentered(rgb, "BOSCONIAN", 48, [90, 200, 255], 2);
    this.drawTextCentered(rgb, "BLAST OFF THE SPY BASES", 84, [180, 180, 200]);
    this.drawTextCentered(rgb, `HIGH SCORE  ${this.highScore}`, 112, [240, 210, 90]);
    if ((this.tick >> 4) & 1) this.drawTextCentered(rgb, "PRESS FIRE TO START", 150, [255, 255, 255]);
    this.drawTextCentered(rgb, "ROUTE C REIMPLEMENTATION", 196, [90, 110, 140]);
  }

  /** Bosconian's right-side radar: a top-down scope centred on the ship,
   *  showing nearby world objects (bases, mines, enemies) as blips with the
   *  ship fixed at the centre. Wrap-aware, so it works across the world seam. */
  private drawRadar(rgb: Uint8Array): void {
    const rx0 = 228, ry0 = 44, rw = 56, rh = 168;
    const cx = rx0 + rw / 2, cy = ry0 + rh / 2;
    const range = 420; // world units shown from centre to each edge
    const pcx = this.player.x + 8, pcy = this.player.y + 8;
    const rx = (wx: number): number => cx + (wrapDelta(wx - pcx, WORLD_W) / range) * (rw / 2);
    const ry = (wy: number): number => cy + (wrapDelta(wy - pcy, WORLD_H) / range) * (rh / 2);
    const put = (x: number, y: number, c: [number, number, number], r = 0): void => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xi = Math.round(x) + dx;
          const yi = Math.round(y) + dy;
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
    // mines (dim yellow), bases (green), enemies (blue), ship (white centre)
    for (const m of this.mines) if (m.alive) put(rx(m.x), ry(m.y), [150, 140, 40], 0);
    for (const b of this.bases) if (!b.destroyed) put(rx(b.x), ry(b.y), [80, 230, 80], 1);
    for (const e of this.squadron.enemies) {
      // enemies live in screen space; their offset from the ship centre is a
      // world-space delta directly (1px screen == 1px world near the centre)
      if (e.alive) put(cx + ((e.x + 8 - VIEW_CX) / range) * (rw / 2), cy + ((e.y + 8 - VIEW_CY) / range) * (rh / 2), [110, 160, 255], 0);
    }
    put(cx, cy, [255, 255, 255], 1);
  }

  /** Draw text with the ROM font at pixel position (px0, py0). Digits 0-9 ->
   *  tile 0..9, A-Z -> tile 10..35. An explicit rgb overrides the char pen. */
  private drawTextPx(rgb: Uint8Array, text: string, px0: number, py0: number, rgbOverride?: [number, number, number], scale = 1): void {
    if (!this.assets.chars.length) return;
    const pal = this.assets.palette;
    const color = 3; // a visible char color set
    let cx = px0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === " ") { cx += 8 * scale; continue; }
      let code = -1;
      if (ch >= "0" && ch <= "9") code = ch.charCodeAt(0) - 48;
      else if (ch >= "A" && ch <= "Z") code = 10 + ch.charCodeAt(0) - 65;
      if (code < 0) { cx += 8 * scale; continue; }
      const tile = this.assets.chars[code];
      if (!tile) { cx += 8 * scale; continue; }
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p = tile[y * 8 + x]!;
          if (p === 0) continue;
          const [r, g, b] = rgbOverride ?? pal.colors[pal.charPen[color * 4 + p]!] ?? [255, 255, 255];
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cx + x * scale + sx;
              const py = py0 + y * scale + sy;
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
      cx += 8 * scale;
    }
  }

  /** Tile-grid convenience wrapper (col/row are 8px cells). */
  private drawText(rgb: Uint8Array, text: string, col: number, row: number, rgbOverride?: [number, number, number]): void {
    this.drawTextPx(rgb, text, col * 8, row * 8, rgbOverride);
  }

  /** Horizontally centre text within the playfield (0..PLAYFIELD_W). */
  private drawTextCentered(rgb: Uint8Array, text: string, py: number, rgbOverride?: [number, number, number], scale = 1): void {
    const px0 = Math.round((PLAYFIELD_W - text.length * 8 * scale) / 2);
    this.drawTextPx(rgb, text, px0, py, rgbOverride, scale);
  }
}
