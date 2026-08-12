// Headless runner: boots the local (gitignored) ROM in the emulator, runs to
// a given frame, and writes a PNG of the rendered screen. Used to verify the
// video/machine pipeline without a browser.
//
//   npx vite-node tools/run-headless.ts [frames] [out.png] [path/to/bosco.zip]
//
// The ROM is user-supplied and never committed; output PNGs are renders of
// copyrighted artwork and must stay under analysis/ (gitignored).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMachine, buildAssets } from "../src/emulator";
import { loadRomSet } from "../src/rom/loader";
import { renderFrame, SCREEN_H, SCREEN_W } from "../src/video/render";
import { encodePNG, scale } from "./png";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main(): Promise<void> {
  const frames = Number(process.argv[2] ?? 900);
  const out = process.argv[3] ?? join(ROOT, "analysis/screen.png");
  const zip = process.argv[4] ?? join(ROOT, "roms/bosco.zip");

  const rs = await loadRomSet([{ name: "bosco.zip", data: new Uint8Array(readFileSync(zip)) }]);
  if (!rs.complete) {
    console.error(`ROM set incomplete (${rs.setName}); cannot run.`);
    process.exit(1);
  }
  const machine = createMachine(rs);
  const assets = buildAssets(rs);
  for (let f = 0; f < frames; f++) machine.runFrame();

  const rgb = renderFrame(machine, assets);
  const s = scale(rgb, SCREEN_W, SCREEN_H, 2);
  writeFileSync(out, encodePNG(s.data, s.width, s.height));
  console.log(`ran ${frames} frames, wrote ${out}`);
}

void main();
