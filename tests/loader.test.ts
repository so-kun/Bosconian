import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { collectEntries, identifySet, loadRomSet } from "../src/rom/loader";
import { ROM_SETS } from "../src/rom/romdb";

// We cannot ship real ROM data, so these tests exercise the loader's logic
// paths with synthetic files: wrong-content files under correct names must be
// reported as bad_hash, absent files as missing, and zip extraction must work.

function dummy(size: number, seed: number): Uint8Array {
  const d = new Uint8Array(size);
  for (let i = 0; i < size; i++) d[i] = (i * 7 + seed) & 0xff;
  return d;
}

describe("collectEntries", () => {
  it("extracts zip archives and computes CRCs", () => {
    const zip = zipSync({ "a.bin": dummy(16, 1), "sub/b.bin": dummy(32, 2) });
    const entries = collectEntries([{ name: "test.zip", data: zip }]);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name).sort()).toEqual(["a.bin", "sub/b.bin"]);
    expect(entries[0]!.crc).toMatch(/^[0-9a-f]{8}$/);
  });

  it("passes through raw (non-zip) files", () => {
    const entries = collectEntries([{ name: "bos1-1.1d", data: dummy(256, 3) }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("bos1-1.1d");
  });
});

describe("loadRomSet", () => {
  it("reports every expected file as missing for an empty input", async () => {
    const result = await loadRomSet([], "bosco");
    expect(result.complete).toBe(false);
    expect(result.mcusComplete).toBe(false);
    const expectedCount = ROM_SETS.bosco.reduce((n, r) => n + r.roms.length, 0);
    const missing = result.report.filter((r) => r.status === "missing");
    expect(missing.length).toBe(expectedCount + 4); // + 4 MCU firmware images
  });

  it("reports name-matched files with wrong content as bad_hash", async () => {
    const zip = zipSync({ "bos5_1.3p": dummy(4096, 9) });
    const result = await loadRomSet([{ name: "bosco.zip", data: zip }], "bosco");
    const entry = result.report.find((r) => r.expected.file === "bos5_1.3p")!;
    expect(entry.status).toBe("bad_hash");
    expect(entry.actualCrc).toMatch(/^[0-9a-f]{8}$/);
    expect(result.complete).toBe(false);
  });

  it("assembles regions at region size regardless of completeness", async () => {
    const result = await loadRomSet([], "bosco");
    expect(result.regions.get("maincpu")!.length).toBe(0x10000);
    expect(result.regions.get("52xx")!.length).toBe(0x3000);
    expect(result.regions.get("proms")!.length).toBe(0x260);
  });

  it("identifySet defaults to bosco when nothing matches", () => {
    expect(identifySet([])).toBe("bosco");
  });
});

describe("romdb integrity", () => {
  it("all six revisions define 19 rom files across their regions", () => {
    for (const regions of Object.values(ROM_SETS)) {
      const count = regions.reduce((n, r) => n + r.roms.length, 0);
      expect(count).toBe(19);
    }
  });

  it("program regions cover 28KB across three CPUs", () => {
    const prog = ROM_SETS.bosco
      .filter((r) => ["maincpu", "sub", "sub2"].includes(r.name))
      .reduce((n, r) => n + r.roms.reduce((m, f) => m + f.size, 0), 0);
    expect(prog).toBe(7 * 4096);
  });

  it("every rom entry fits inside its region", () => {
    for (const regions of Object.values(ROM_SETS)) {
      for (const region of regions) {
        for (const rom of region.roms) {
          expect(rom.offset + rom.size).toBeLessThanOrEqual(region.size);
        }
      }
    }
  });
});
