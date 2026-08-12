// Disassembly driver: loads the local (gitignored) ROM, disassembles the
// three Z80 program ROMs using recursive-descent traversal seeded from the
// reset/interrupt vectors, and writes annotated listings + a code/data map
// to analysis/ (also gitignored — never committed).
//
// Usage:
//   npx vite-node tools/disasm/cli.ts [path/to/bosco.zip]
//
// Only the *derived* understanding (docs/disassembly/*.md) and the
// reimplementation code get committed; these raw listings stay local.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRomSet } from "../../src/rom/loader";
import { disasmOne, type DisasmLine, type ReadFn } from "./z80dasm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

interface CpuTarget {
  region: "maincpu" | "sub" | "sub2";
  label: string;
  size: number; // code extent to consider
}

// bosco program ROM extents (bytes actually populated with code)
const CPUS: CpuTarget[] = [
  { region: "maincpu", label: "CPU1 (main)", size: 0x4000 },
  { region: "sub", label: "CPU2 (sub)", size: 0x2000 },
  { region: "sub2", label: "CPU3 (sub2)", size: 0x1000 },
];

// Entry seeds common to this hardware: reset at 0, RST vectors, and NMI at
// 0x66. The Namco task dispatcher is driven by RST 38 (vblank) / NMI.
const SEED_VECTORS = [0x0000, 0x0008, 0x0010, 0x0018, 0x0020, 0x0028, 0x0030, 0x0038, 0x0066];

interface Analysis {
  code: Set<number>; // addresses that begin an instruction reached by traversal
  lines: Map<number, DisasmLine>;
  labels: Set<number>; // branch/call targets -> label candidates
}

function analyze(read: ReadFn, size: number): Analysis {
  const code = new Set<number>();
  const lines = new Map<number, DisasmLine>();
  const labels = new Set<number>();
  const stack: number[] = [];
  const seen = new Set<number>();

  const push = (a: number) => {
    if (a >= 0 && a < size && !seen.has(a)) {
      seen.add(a);
      stack.push(a);
    }
  };
  for (const v of SEED_VECTORS) if (v < size) push(v);

  while (stack.length) {
    let addr = stack.pop()!;
    while (addr >= 0 && addr < size) {
      if (code.has(addr)) break; // already traversed from here
      const line = disasmOne(read, addr);
      code.add(addr);
      lines.set(addr, line);
      if (line.target !== undefined && line.target < size) labels.add(line.target);

      // follow control flow
      if (line.flow === "jump") {
        if (line.target !== undefined) push(line.target);
        break; // unconditional: linear flow stops here
      }
      if (line.flow === "ret" || line.flow === "stop") {
        // RET cc / conditional still falls through; unconditional stops.
        if (line.text === "ret" || line.text === "reti" || line.text === "retn" || line.text === "halt")
          break;
      }
      if (line.flow === "call" || line.flow === "ccall") {
        if (line.target !== undefined) push(line.target);
      }
      if (line.flow === "cjump" && line.target !== undefined) {
        push(line.target);
      }
      if (line.flow === "rst" && line.target !== undefined) push(line.target);
      addr += line.length;
    }
  }
  return { code, lines, labels };
}

function labelName(addr: number): string {
  return `L_${addr.toString(16).padStart(4, "0")}`;
}

function render(cpu: CpuTarget, read: ReadFn, a: Analysis): string {
  const out: string[] = [];
  out.push(`; ${cpu.label} — recursive-descent disassembly (${a.code.size} instrs reached)`);
  out.push(`; region ${cpu.region}, code extent 0x0000-0x${(cpu.size - 1).toString(16)}`);
  out.push("; GENERATED, LOCAL-ONLY — not committed (near-verbatim copyrighted program).");
  out.push("");

  let addr = 0;
  while (addr < cpu.size) {
    if (a.code.has(addr)) {
      const line = a.lines.get(addr)!;
      if (a.labels.has(addr)) out.push(`${labelName(addr)}:`);
      const bytes = line.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      let text = line.text;
      // rewrite known-in-range targets to labels for readability
      if (line.target !== undefined && a.labels.has(line.target)) {
        text = text.replace(/0x[0-9a-f]{4}$/, labelName(line.target));
      }
      out.push(`  ${addr.toString(16).padStart(4, "0")}  ${bytes.padEnd(11)}  ${text}`);
      addr += line.length;
    } else {
      // data byte (not reached by traversal)
      const b = read(addr) & 0xff;
      out.push(`  ${addr.toString(16).padStart(4, "0")}  ${b.toString(16).padStart(2, "0")}           defb 0x${b
        .toString(16)
        .padStart(2, "0")}`);
      addr += 1;
    }
  }
  return out.join("\n");
}

async function main(): Promise<void> {
  const zipPath = process.argv[2] ?? join(ROOT, "roms/bosco.zip");
  const data = new Uint8Array(readFileSync(zipPath));
  const romset = await loadRomSet([{ name: "bosco.zip", data }]);
  if (!romset.complete) {
    console.error(`ROM set incomplete (${romset.setName}); cannot disassemble.`);
    process.exit(1);
  }
  const outDir = join(ROOT, "analysis");
  mkdirSync(outDir, { recursive: true });

  const summary: string[] = [`# Disassembly coverage (${romset.setName})`, ""];
  for (const cpu of CPUS) {
    const region = romset.regions.get(cpu.region)!;
    const read: ReadFn = (x) => region[x & 0xffff] ?? 0xff;
    const a = analyze(read, cpu.size);
    const listing = render(cpu, read, a);
    writeFileSync(join(outDir, `${cpu.region}.asm`), listing);
    const codeBytes = [...a.code].reduce((n, addr) => n + a.lines.get(addr)!.length, 0);
    const pct = ((codeBytes / cpu.size) * 100).toFixed(1);
    summary.push(
      `- **${cpu.label}** (${cpu.region}): ${a.code.size} instructions, ` +
        `${codeBytes}/${cpu.size} bytes = ${pct}% code, ${a.labels.size} branch targets`,
    );
    console.log(`${cpu.region}: ${a.code.size} instrs, ${pct}% code, ${a.labels.size} labels`);
  }
  writeFileSync(join(outDir, "coverage.md"), summary.join("\n") + "\n");
  console.log(`\nListings written to analysis/ (gitignored).`);
}

void main();
