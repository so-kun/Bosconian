// ROM set loader: takes user-provided zip file(s), identifies the Bosconian
// ROM set revision, verifies every file against the MAME CRC32/SHA1 database,
// and assembles the memory regions the machine will use.
//
// ROM images are never bundled with this project; the user supplies them.
// Matching is CRC-first so merged/renamed sets still load, with filename as a
// fallback for identifying *bad* (mismatching) dumps to report.

import { unzipSync } from "fflate";
import { crc32Hex, sha1Hex } from "./crc32";
import { MCU_ROMS, ROM_SETS, type RomFile, type RomRegion, type RomSetName } from "./romdb";

export type RomFileStatus = "ok" | "bad_hash" | "missing";

export interface RomFileReport {
  region: string;
  expected: RomFile;
  status: RomFileStatus;
  /** name of the archive entry that supplied the data (if any) */
  foundAs?: string;
  /** actual CRC when status is bad_hash */
  actualCrc?: string;
}

export interface LoadedRomSet {
  setName: RomSetName;
  /** region name -> assembled contents (region-sized, ROMs at their offsets) */
  regions: Map<string, Uint8Array>;
  /** MCU firmware, keyed "50xx" | "51xx" | "52xx" | "54xx" */
  mcuRoms: Map<string, Uint8Array>;
  report: RomFileReport[];
  complete: boolean;
  /** true when every MCU firmware image was found */
  mcusComplete: boolean;
}

interface Entry {
  name: string;
  data: Uint8Array;
  crc: string;
}

/** Flatten one or more zips / raw files into candidate entries keyed by CRC. */
export function collectEntries(files: { name: string; data: Uint8Array }[]): Entry[] {
  const entries: Entry[] = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith(".zip")) {
      const unzipped = unzipSync(f.data);
      for (const [name, data] of Object.entries(unzipped)) {
        if (data.length > 0) entries.push({ name, data, crc: crc32Hex(data) });
      }
    } else {
      entries.push({ name: f.name, data: f.data, crc: crc32Hex(f.data) });
    }
  }
  return entries;
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1]!.toLowerCase();
}

function findEntry(entries: Entry[], want: RomFile): { entry: Entry; hashOk: boolean } | undefined {
  // CRC match wins regardless of name (merged sets rename files freely).
  const byCrc = entries.find((e) => e.crc === want.crc && e.data.length === want.size);
  if (byCrc) return { entry: byCrc, hashOk: true };
  // Fallback: name match lets us report a bad dump instead of "missing".
  const byName = entries.find((e) => baseName(e.name) === want.file.toLowerCase());
  if (byName) return { entry: byName, hashOk: false };
  return undefined;
}

/** Score how many of a set's ROMs are present, to pick the best revision. */
function scoreSet(entries: Entry[], regions: RomRegion[]): number {
  let score = 0;
  for (const region of regions) {
    for (const rom of region.roms) {
      if (entries.some((e) => e.crc === rom.crc && e.data.length === rom.size)) score++;
    }
  }
  return score;
}

export function identifySet(entries: Entry[]): RomSetName {
  let best: RomSetName = "bosco";
  let bestScore = -1;
  for (const name of Object.keys(ROM_SETS) as RomSetName[]) {
    const s = scoreSet(entries, ROM_SETS[name]);
    if (s > bestScore) {
      best = name;
      bestScore = s;
    }
  }
  return best;
}

export async function loadRomSet(
  files: { name: string; data: Uint8Array }[],
  forcedSet?: RomSetName,
): Promise<LoadedRomSet> {
  const entries = collectEntries(files);
  const setName = forcedSet ?? identifySet(entries);
  const regions = new Map<string, Uint8Array>();
  const report: RomFileReport[] = [];
  let complete = true;

  for (const region of ROM_SETS[setName]) {
    const buf = new Uint8Array(region.size).fill(0xff);
    for (const rom of region.roms) {
      const found = findEntry(entries, rom);
      if (!found) {
        report.push({ region: region.name, expected: rom, status: "missing" });
        complete = false;
        continue;
      }
      buf.set(found.entry.data.subarray(0, rom.size), rom.offset);
      if (found.hashOk) {
        // Belt and braces: verify SHA1 too (CRC32 collisions are cheap to forge).
        const sha = await sha1Hex(found.entry.data);
        const ok = sha === rom.sha1;
        report.push({
          region: region.name,
          expected: rom,
          status: ok ? "ok" : "bad_hash",
          foundAs: found.entry.name,
          actualCrc: ok ? undefined : found.entry.crc,
        });
        if (!ok) complete = false;
      } else {
        report.push({
          region: region.name,
          expected: rom,
          status: "bad_hash",
          foundAs: found.entry.name,
          actualCrc: found.entry.crc,
        });
        complete = false;
      }
    }
    regions.set(region.name, buf);
  }

  const mcuRoms = new Map<string, Uint8Array>();
  let mcusComplete = true;
  for (const [dev, rom] of Object.entries(MCU_ROMS)) {
    const found = findEntry(entries, rom);
    if (found && found.hashOk) {
      mcuRoms.set(dev, found.entry.data.subarray(0, rom.size));
      report.push({ region: `mcu:${dev}`, expected: rom, status: "ok", foundAs: found.entry.name });
    } else {
      report.push({
        region: `mcu:${dev}`,
        expected: rom,
        status: found ? "bad_hash" : "missing",
        foundAs: found?.entry.name,
        actualCrc: found?.entry.crc,
      });
      mcusComplete = false;
    }
  }

  return { setName, regions, mcuRoms, report, complete, mcusComplete };
}
