// Entry point. Phase 0: ROM loading + verification UI.
// Later phases attach the machine (3x Z80 + video + sound) once ROMs verify.

import { loadRomSet, type LoadedRomSet } from "./rom/loader";
import { renderRomReport } from "./ui/romPanel";

const dropZone = document.getElementById("drop-zone")!;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const reportEl = document.getElementById("rom-report")!;

async function handleFiles(files: File[]): Promise<void> {
  const inputs = await Promise.all(
    files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })),
  );
  const result = await loadRomSet(inputs);
  renderRomReport(reportEl, result);
  onRomsLoaded(result);
}

function onRomsLoaded(result: LoadedRomSet): void {
  // Phase 1+ hook: boot the machine when the set is complete.
  if (result.complete) {
    console.log(`ROM set "${result.setName}" verified; machine boot lands in phase 1.`);
  }
}

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) void handleFiles([...fileInput.files]);
});
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer?.files.length) void handleFiles([...e.dataTransfer.files]);
});

// Dev convenience: if roms/bosco.zip is served locally (gitignored), autoload it.
void (async () => {
  try {
    const res = await fetch("roms/bosco.zip");
    if (!res.ok) return;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Vite's dev server returns index.html for missing paths; require zip magic.
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) return;
    const result = await loadRomSet([{ name: "bosco.zip", data: buf }]);
    renderRomReport(reportEl, result);
    onRomsLoaded(result);
  } catch {
    /* no local rom available — user will drag & drop */
  }
})();
