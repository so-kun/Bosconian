// Tests for cosmo-mines and chain detonation.

import { describe, expect, it } from "vitest";
import { Mine, detonateChain, MINE_SCORE } from "../src/game/mine";

describe("Mine", () => {
  it("detects contact within its radius", () => {
    const m = new Mine(100, 100);
    expect(m.overlaps(100, 104, 0)).toBe(true);
    expect(m.overlaps(100, 130, 0)).toBe(false);
    m.alive = false;
    expect(m.overlaps(100, 100, 0)).toBe(false);
  });

  it("chains detonation through neighbouring mines", () => {
    // three mines in a line, each within chain range of the next
    const mines = [new Mine(50, 50), new Mine(78, 50), new Mine(106, 50)];
    const score = detonateChain(mines, 0);
    expect(mines.every((m) => !m.alive)).toBe(true);
    expect(score).toBe(3 * MINE_SCORE);
  });

  it("leaves distant mines intact", () => {
    const mines = [new Mine(50, 50), new Mine(200, 200)];
    const score = detonateChain(mines, 0);
    expect(mines[0]!.alive).toBe(false);
    expect(mines[1]!.alive).toBe(true);
    expect(score).toBe(MINE_SCORE);
  });

  it("detonating an already-dead mine scores nothing", () => {
    const mines = [new Mine(50, 50)];
    mines[0]!.alive = false;
    expect(detonateChain(mines, 0)).toBe(0);
  });
});
