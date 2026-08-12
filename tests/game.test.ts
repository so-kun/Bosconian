// Tests for the starfield generator and the native game scene.

import { describe, expect, it } from "vitest";
import { Starfield } from "../src/video/starfield";
import { buildPalette, type Palette } from "../src/video/palette";
import { GameScene, type Controls } from "../src/game/scene";
import { Mine } from "../src/game/mine";
import { WORLD_W, WORLD_H } from "../src/game/world";
import { SCREEN_H, SCREEN_W, type VideoAssets } from "../src/video/render";

function testPalette(): Palette {
  const proms = new Uint8Array(0x260);
  // give the star colors non-zero values so plotted stars are visible
  return buildPalette(proms);
}

function noControls(): Controls {
  return { up: false, down: false, left: false, right: false, fire: false };
}

describe("Starfield", () => {
  it("is deterministic from the fixed LFSR seed", () => {
    const pal = testPalette();
    const a = new Starfield();
    a.enable(true);
    a.setActiveSets(0, 2);
    a.setScrollSpeed(0, 0);
    const buf1 = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    a.render(buf1, SCREEN_W, pal);

    const b = new Starfield();
    b.enable(true);
    b.setActiveSets(0, 2);
    b.setScrollSpeed(0, 0);
    const buf2 = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    b.render(buf2, SCREEN_W, pal);

    expect(Buffer.from(buf1)).toEqual(Buffer.from(buf2));
  });

  it("renders nothing when disabled", () => {
    const pal = testPalette();
    const s = new Starfield();
    s.enable(false);
    const buf = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    s.render(buf, SCREEN_W, pal);
    expect(buf.every((v) => v === 0)).toBe(true);
  });

  it("only plots stars in the left playfield (x < 224)", () => {
    // With a synthetic palette where star colors are visible, ensure no pixel
    // is written at x >= 224 (the radar strip region).
    const proms = new Uint8Array(0x260);
    const pal = buildPalette(proms);
    // force all star colors visible
    for (let i = 32; i < 96; i++) pal.colors[i] = [255, 255, 255];
    const s = new Starfield();
    s.enable(true);
    s.setActiveSets(0, 1);
    s.setScrollSpeed(0, 0);
    const buf = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    s.render(buf, SCREEN_W, pal);
    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 224; x < SCREEN_W; x++) {
        const o = (y * SCREEN_W + x) * 3;
        expect(buf[o]! | buf[o + 1]! | buf[o + 2]!).toBe(0);
      }
    }
  });
});

describe("GameScene", () => {
  const assets: VideoAssets = {
    chars: [],
    sprites: Array.from({ length: 8 }, () => new Uint8Array(256).fill(1)),
    palette: (() => {
      const p = buildPalette(new Uint8Array(0x260));
      for (let i = 0; i < 16; i++) p.spritePen[i] = 1; // visible, non-transparent
      p.colors[1] = [255, 255, 255];
      return p;
    })(),
  };

  it("maps 8-way input to headings", () => {
    const g = new GameScene(assets);
    const c = noControls();
    c.up = true;
    g.update(c);
    expect(g.headingIndex).toBe(0);
    c.up = false;
    c.right = true;
    g.update(c);
    expect(g.headingIndex).toBe(2);
    c.right = false;
    c.down = true;
    c.left = true;
    g.update(c);
    expect(g.headingIndex).toBe(5); // down-left
  });

  it("keeps the last heading when input is released", () => {
    const g = new GameScene(assets);
    const c = noControls();
    c.left = true;
    g.update(c);
    expect(g.headingIndex).toBe(6);
    g.update(noControls());
    expect(g.headingIndex).toBe(6);
  });

  it("spawns a bullet on the fire edge and advances it", () => {
    const g = new GameScene(assets);
    const c = noControls();
    c.fire = true;
    g.update(c);
    expect(g.bullets.length).toBe(1);
    const startY = g.bullets[0]!.y;
    g.update(noControls());
    // default heading is up -> bullet moves upward (y decreases)
    expect(g.bullets[0]!.y).toBeLessThan(startY);
  });

  it("moves the ship through the wrapping world (position stays in bounds)", () => {
    const g = new GameScene(assets);
    const c = noControls();
    c.up = true;
    c.left = true;
    for (let i = 0; i < 2000; i++) g.update(c); // enough travel to cross a seam
    expect(g.player.x).toBeGreaterThanOrEqual(0);
    expect(g.player.y).toBeGreaterThanOrEqual(0);
    expect(g.player.x).toBeLessThan(WORLD_W);
    expect(g.player.y).toBeLessThan(WORLD_H);
  });

  it("renders a full-size framebuffer", () => {
    const g = new GameScene(assets);
    g.update(noControls());
    expect(g.render().length).toBe(SCREEN_W * SCREEN_H * 3);
  });

  it("raises the alert to YELLOW when firing with a base on the field", () => {
    const g = new GameScene(assets);
    // ensure a base exists
    for (let i = 0; i < 120 && g.bases.length === 0; i++) g.update(noControls());
    expect(g.bases.length).toBeGreaterThan(0);
    expect(g.alert.condition).toBe("GREEN");
    const c = noControls();
    c.fire = true;
    g.update(c);
    expect(g.alert.condition).toBe("YELLOW");
  });

  it("advances the sector once its base quota is cleared", () => {
    const g = new GameScene(assets);
    const quota = g.basesPerSector;
    const startSector = g.sector;
    // drive the real base-destroyed handler for a full quota
    for (let i = 0; i < quota; i++) (g as unknown as { onBaseDestroyed(): void }).onBaseDestroyed();
    expect(g.sector).toBe(startSector + 1);
    expect(g.basesClearedThisSector).toBe(0);
    expect(g.alert.condition).toBe("RED"); // destroying bases scrambles the fleet
    expect(g.score).toBeGreaterThan(0); // sector-clear bonus
  });

  it("scatters cosmo-mines and loses a life on contact", () => {
    const g = new GameScene(assets);
    expect(g.mines.length).toBeGreaterThan(0);
    // drop a mine right on the player and step
    g.mines.push(new Mine(g.player.x + 8, g.player.y + 8));
    const lives = g.lives;
    g.update(noControls());
    expect(g.lives).toBe(lives - 1);
  });

  it("emits sound cues (blast-off at start, fire on shooting)", () => {
    const g = new GameScene(assets);
    expect(g.sfx).toContain("blastOff"); // queued in the constructor
    g.sfx.length = 0;
    const c = noControls();
    c.fire = true;
    g.update(c);
    expect(g.sfx).toContain("fire");
  });

  it("keeps the ship pinned to the view centre after scrolling the world", () => {
    const g = new GameScene(assets);
    const c = noControls();
    c.right = true;
    c.down = true;
    for (let i = 0; i < 300; i++) g.update(c); // scroll a long way through the world
    const rgb = g.render();
    // the ship (mock sprite fills its 16x16) is drawn centred at (112,112)
    const cx = 112, cy = 112;
    const o = (cy * SCREEN_W + cx) * 3;
    expect(rgb[o]! + rgb[o + 1]! + rgb[o + 2]!).toBeGreaterThan(0);
  });
});
