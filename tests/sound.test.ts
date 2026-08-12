// Tests for sound-cue emission and the audio engine's graceful degradation.

import { describe, expect, it } from "vitest";
import { SoundEngine } from "../src/audio/sound";
import type { SfxEvent } from "../src/game/scene";

describe("SoundEngine", () => {
  it("no-ops without Web Audio (node) instead of throwing", () => {
    const s = new SoundEngine();
    expect(() => s.resume()).not.toThrow();
    const events: SfxEvent[] = [
      "fire", "explosion", "baseExplode", "mineExplode", "playerHit",
      "alertYellow", "alertRed", "sectorClear", "blastOff",
    ];
    for (const ev of events) expect(() => s.play(ev)).not.toThrow();
  });

  it("respects the enabled flag", () => {
    const s = new SoundEngine();
    s.setEnabled(false);
    expect(s.enabled).toBe(false);
    expect(() => s.play("fire")).not.toThrow();
    s.setEnabled(true);
    expect(s.enabled).toBe(true);
  });
});
