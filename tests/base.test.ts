// Tests for the enemy base (spy ship) behaviour.

import { describe, expect, it } from "vitest";
import { Base, type EnemyBullet } from "../src/game/base";

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
});
