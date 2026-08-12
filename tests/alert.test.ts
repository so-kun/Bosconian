// Tests for the alert-condition state machine.

import { describe, expect, it } from "vitest";
import { AlertSystem } from "../src/game/alert";

describe("AlertSystem", () => {
  it("starts GREEN with no banner", () => {
    const a = new AlertSystem();
    expect(a.condition).toBe("GREEN");
    expect(a.bannerTimer).toBe(0);
    expect(a.aggression()).toBe(1);
  });

  it("escalates GREEN -> YELLOW -> RED with callouts", () => {
    const a = new AlertSystem();
    expect(a.raise("YELLOW", 100)).toBe(true);
    expect(a.condition).toBe("YELLOW");
    expect(a.banner).toBe("ALERT");
    expect(a.raise("RED", 100)).toBe(true);
    expect(a.condition).toBe("RED");
    expect(a.banner).toBe("CONDITION RED");
    expect(a.aggression()).toBe(2);
  });

  it("never lowers the condition via raise()", () => {
    const a = new AlertSystem();
    a.raise("RED", 100);
    expect(a.raise("YELLOW", 100)).toBe(false);
    expect(a.raise("GREEN", 100)).toBe(false);
    expect(a.condition).toBe("RED");
  });

  it("de-escalates one level at a time after the hold expires", () => {
    const a = new AlertSystem();
    a.raise("RED", 3);
    for (let i = 0; i < 3; i++) a.update(); // burn the hold
    a.update(); // steps RED -> YELLOW
    expect(a.condition).toBe("YELLOW");
    for (let i = 0; i < 181; i++) a.update(); // YELLOW hold then step
    expect(a.condition).toBe("GREEN");
  });

  it("refreshing the hold keeps the condition up", () => {
    const a = new AlertSystem();
    a.raise("YELLOW", 2);
    a.update();
    a.raise("YELLOW", 10); // re-provoked; hold refreshed
    for (let i = 0; i < 5; i++) a.update();
    expect(a.condition).toBe("YELLOW");
  });

  it("ticks the banner timer down", () => {
    const a = new AlertSystem();
    a.showBanner("SECTOR CLEARED", [1, 2, 3], 5);
    expect(a.bannerTimer).toBe(5);
    for (let i = 0; i < 5; i++) a.update();
    expect(a.bannerTimer).toBe(0);
  });
});
