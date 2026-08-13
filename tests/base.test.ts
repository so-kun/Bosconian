// Tests for the enemy base (spy ship) behaviour.

import { describe, expect, it } from "vitest";
import { Base, type EnemyBullet } from "../src/game/base";
import { buildPalette } from "../src/video/palette";
import { BASE_TYPE_A } from "../src/game/baseGfx";
import { SCREEN_H, SCREEN_W, type VideoAssets } from "../src/video/render";

const RADIUS = 18;

function cannonPositions(b: Base): { x: number; y: number }[] {
  return (b.cannons as { angle: number; alive: boolean }[]).map((c) => ({
    x: b.x + Math.cos(c.angle) * RADIUS,
    y: b.y + Math.sin(c.angle) * RADIUS,
  }));
}

describe("Base", () => {
  it("starts with six live cannons and a live core", () => {
    const b = new Base(100, 100);
    expect(b.cannons.length).toBe(6);
    expect(b.cannons.every((c) => c.alive)).toBe(true);
    expect(b.coreAlive).toBe(true);
    expect(b.destroyed).toBe(false);
  });

  it("destroys a cannon when hit and awards points", () => {
    const b = new Base(100, 100);
    const p = cannonPositions(b)[0]!;
    const score = b.hit(p.x, p.y);
    expect(score).toBe(200);
    expect(b.cannons[0]!.alive).toBe(false);
  });

  it("core is invulnerable while cannons remain and it is closed", () => {
    const b = new Base(100, 100);
    // core closed at t=0; hitting the center should do nothing
    expect(b.hit(100, 100)).toBe(0);
    expect(b.coreAlive).toBe(true);
  });

  it("core becomes vulnerable once all cannons are destroyed", () => {
    const b = new Base(100, 100);
    for (const p of cannonPositions(b)) b.hit(p.x, p.y);
    expect(b.cannons.every((c) => !c.alive)).toBe(true);
    const score = b.hit(100, 100);
    expect(score).toBe(1500);
    expect(b.destroyed).toBe(true);
  });

  it("fires enemy bullets at the player over time", () => {
    const b = new Base(100, 100);
    const bullets: EnemyBullet[] = [];
    for (let i = 0; i < 200; i++) b.update(150, 150, bullets);
    expect(bullets.length).toBeGreaterThan(0);
    const bl = bullets[0]!;
    // bullet heads roughly toward the player (down-right from the base)
    expect(bl.dx).toBeGreaterThan(0);
    expect(bl.dy).toBeGreaterThan(0);
  });

  it("core opens on a cycle, exposing it to fire", () => {
    const b = new Base(100, 100);
    let opened = false;
    for (let i = 0; i < 240; i++) {
      b.update(150, 150, []);
      if (b.coreOpen) opened = true;
    }
    expect(opened).toBe(true);
  });

  it("detects overlap with the player body", () => {
    const b = new Base(100, 100);
    expect(b.overlaps(100, 100, 7)).toBe(true);
    expect(b.overlaps(100, 100 + RADIUS + 6, 7)).toBe(true);
    expect(b.overlaps(100, 100 + RADIUS + 40, 7)).toBe(false);
  });

  it("renders the real ROM station tiles centred on the base", () => {
    // mock gfx1: every tile fully opaque with pen 1
    const chars = Array.from({ length: 256 }, () => new Uint8Array(64).fill(1));
    const palette = buildPalette(new Uint8Array(0x260));
    for (let i = 0; i < palette.charPen.length; i++) palette.charPen[i] = 1;
    palette.colors[1] = [0, 200, 0];
    const assets: VideoAssets = { chars, sprites: [], palette };

    const rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    const b = new Base(100, 100);
    b.render(rgb, SCREEN_W, SCREEN_H, assets);

    // the 64x64 tile grid is centred on (100,100); its interior is painted
    const o = (100 * SCREEN_W + 100) * 3;
    expect(rgb[o + 1]).toBeGreaterThan(0);

    // a destroyed base draws nothing
    const rgb2 = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    b.destroyed = true;
    b.render(rgb2, SCREEN_W, SCREEN_H, assets);
    expect(rgb2.every((v) => v === 0)).toBe(true);
  });

  it("uses real ROM tile data (not a hand-drawn shape)", () => {
    // the layout must be the captured ROM grid: 8x8 cells, blanks marked 0x24,
    // and the red core tiles (0xf3) present in the middle rows
    expect(BASE_TYPE_A.codes.length).toBe(64);
    expect(BASE_TYPE_A.attrs.length).toBe(64);
    expect(BASE_TYPE_A.codes).toContain(0xf3); // core
    expect(BASE_TYPE_A.codes.filter((c) => c >= 0xc0 && c <= 0xcf).length).toBeGreaterThan(20); // pods
    expect(BASE_TYPE_A.codes).toContain(0x24); // blanks
  });

  it("blanks a pod where its cannon has been destroyed", () => {
    const chars = Array.from({ length: 256 }, () => new Uint8Array(64).fill(1));
    const palette = buildPalette(new Uint8Array(0x260));
    for (let i = 0; i < palette.charPen.length; i++) palette.charPen[i] = 1;
    palette.colors[1] = [0, 200, 0];
    const assets: VideoAssets = { chars, sprites: [], palette };

    const intact = new Base(100, 100);
    const damaged = new Base(100, 100);
    damaged.cannons[0]!.alive = false;
    const a = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    const d = new Uint8Array(SCREEN_W * SCREEN_H * 3);
    intact.render(a, SCREEN_W, SCREEN_H, assets);
    damaged.render(d, SCREEN_W, SCREEN_H, assets);
    let differs = false;
    for (let i = 0; i < a.length; i++) if (a[i] !== d[i]) { differs = true; break; }
    expect(differs).toBe(true);
  });
});
