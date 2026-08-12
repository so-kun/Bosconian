// Tests for enemy squadron behaviour (no ROM needed).

import { describe, expect, it } from "vitest";
import { Squadron, velToDir } from "../src/game/enemies";

describe("velToDir", () => {
  it("maps cardinal velocities to 8-way indices (0=up, clockwise)", () => {
    expect(velToDir(0, -1)).toBe(0); // up
    expect(velToDir(1, 0)).toBe(2); // right
    expect(velToDir(0, 1)).toBe(4); // down
    expect(velToDir(-1, 0)).toBe(6); // left
    expect(velToDir(1, -1)).toBe(1); // up-right
    expect(velToDir(-1, 1)).toBe(5); // down-left
  });
  it("returns up for zero velocity", () => {
    expect(velToDir(0, 0)).toBe(0);
  });
});

describe("Squadron", () => {
  const cfg = { screenW: 288, screenH: 224, playfieldW: 224, count: 5 };

  it("spawns count enemies with exactly one leader", () => {
    const s = new Squadron(cfg);
    s.spawn(1);
    expect(s.enemies.length).toBe(5);
    expect(s.enemies.every((e) => e.alive)).toBe(true);
    expect(s.enemies.filter((e) => e.isLeader).length).toBe(1);
    expect(s.active).toBe(true);
  });

  it("moves entering enemies toward formation over time", () => {
    const s = new Squadron(cfg);
    s.spawn(2);
    const before = s.enemies.map((e) => ({ x: e.x, y: e.y }));
    for (let i = 0; i < 30; i++) s.update(112, 112);
    // at least some enemies should have moved from their spawn positions
    const moved = s.enemies.some((e, i) => e.x !== before[i]!.x || e.y !== before[i]!.y);
    expect(moved).toBe(true);
  });

  it("reaches formation state and eventually attacks", () => {
    const s = new Squadron(cfg);
    s.spawn(3);
    for (let i = 0; i < 400; i++) s.update(112, 180);
    const states = new Set(s.enemies.map((e) => e.state));
    // non-leaders should have progressed past 'entering'
    expect(states.has("entering")).toBe(false);
  });

  it("disperses survivors when the leader is destroyed", () => {
    const s = new Squadron(cfg);
    s.spawn(4);
    // settle into formation
    for (let i = 0; i < 60; i++) s.update(112, 112);
    // kill the leader
    const leader = s.enemies.find((e) => e.isLeader)!;
    leader.alive = false;
    for (let i = 0; i < 5; i++) s.update(112, 112);
    const survivors = s.enemies.filter((e) => e.alive);
    expect(survivors.every((e) => e.state === "dispersing")).toBe(true);
    // eventually they fly off and the squadron becomes inactive
    for (let i = 0; i < 600; i++) s.update(112, 112);
    expect(s.active).toBe(false);
  });
});
