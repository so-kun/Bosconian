#!/usr/bin/env python3
"""Generate src/rom/romdb.ts from MAME sources.

Usage:
    python3 tools/gen-romdb.py <path-to-mame-src>

Reads ROM_START blocks for the bosco* sets from src/mame/namco/galaga.cpp and
the MCU firmware definitions from src/mame/namco/namco5{0,1,2,4}.cpp, then
emits a TypeScript module with file names, sizes, offsets, CRC32 and SHA1.

MAME's galaga.cpp / namco5x.cpp are BSD-3-Clause (copyright-holders:
Nicola Salmoria and others); only factual ROM metadata is extracted here.
"""
import json
import re
import sys
from datetime import date
from pathlib import Path

SETS = ["bosco", "bosco3", "bosco1", "bosco1o", "boscomd", "boscomdo"]
MCUS = {"50xx": "namco50.cpp", "51xx": "namco51.cpp", "52xx": "namco52.cpp",
        "54xx": "namco54.cpp"}

RE_REGION = re.compile(r'ROM_REGION\( *(0x[0-9a-fA-F]+), *"([^"]+)"')
RE_LOAD = re.compile(
    r'ROM_LOAD\( *"([^"]+)", *(0x[0-9a-fA-F]+), *(0x[0-9a-fA-F]+),'
    r' *CRC\(([0-9a-fA-F]+)\) *SHA1\(([0-9a-fA-F]+)\)')


def parse_set(src: str, name: str):
    m = re.search(r'ROM_START\( *%s *\)(.*?)ROM_END' % re.escape(name), src, re.S)
    if not m:
        raise SystemExit(f"ROM_START({name}) not found")
    regions, cur = [], None
    for line in m.group(1).splitlines():
        rm = RE_REGION.search(line)
        if rm:
            cur = {"name": rm.group(2), "size": int(rm.group(1), 16), "roms": []}
            regions.append(cur)
            continue
        lm = RE_LOAD.search(line)
        if lm and cur is not None:
            cur["roms"].append({
                "file": lm.group(1), "offset": int(lm.group(2), 16),
                "size": int(lm.group(3), 16),
                "crc": lm.group(4), "sha1": lm.group(5)})
    return regions


def main():
    mame = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("mame")
    namco = mame / "src/mame/namco"
    galaga = (namco / "galaga.cpp").read_text()
    sets = {name: parse_set(galaga, name) for name in SETS}
    mcus = {}
    for dev, fname in MCUS.items():
        lm = RE_LOAD.search((namco / fname).read_text())
        mcus[dev] = {"file": lm.group(1), "offset": 0, "size": int(lm.group(3), 16),
                     "crc": lm.group(4), "sha1": lm.group(5)}

    db = {"sets": sets, "mcuRoms": mcus}
    out = Path(__file__).resolve().parent.parent / "src/rom/romdb.ts"
    out.write_text(
        "// GENERATED FILE — do not edit by hand. Regenerate with tools/gen-romdb.py.\n"
        "// Source of truth: mamedev/mame src/mame/namco/galaga.cpp and\n"
        "// namco50/51/52/54.cpp (BSD-3-Clause, copyright-holders: Nicola Salmoria\n"
        f"// and others). Extracted {date.today().isoformat()}.\n\n"
        "export interface RomFile {\n"
        "  file: string;\n"
        "  offset: number;\n"
        "  size: number;\n"
        "  crc: string; // CRC32, lowercase hex, no 0x\n"
        "  sha1: string;\n"
        "}\n\n"
        "export interface RomRegion {\n"
        "  name: string;\n"
        "  size: number;\n"
        "  roms: RomFile[];\n"
        "}\n\n"
        "export type RomSetName =\n  " +
        " |\n  ".join(json.dumps(s) for s in SETS) + ";\n\n"
        "export const ROM_SETS: Record<RomSetName, RomRegion[]> = " +
        json.dumps(sets, indent=2) + ";\n\n"
        "export const MCU_ROMS: Record<string, RomFile> = " +
        json.dumps(mcus, indent=2) + ";\n")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
