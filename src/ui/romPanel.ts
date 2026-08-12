// Renders the ROM verification report table.

import type { LoadedRomSet } from "../rom/loader";

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  bad_hash: "ハッシュ不一致",
  missing: "見つかりません",
};

export function renderRomReport(el: HTMLElement, result: LoadedRomSet): void {
  const rows = result.report
    .map(
      (r) => `<tr>
        <td>${r.region}</td>
        <td>${r.expected.file}</td>
        <td>${r.expected.size}</td>
        <td>${r.expected.crc}</td>
        <td class="st-${r.status}">${STATUS_LABEL[r.status] ?? r.status}${
          r.actualCrc ? ` (実際: ${r.actualCrc})` : ""
        }</td>
      </tr>`,
    )
    .join("");

  const summary = result.complete
    ? `<span class="st-ok">✔ ROMセット "${result.setName}" を検証しました — 全ファイル一致</span>`
    : `<span class="st-bad_hash">✖ ROMセット "${result.setName}" は不完全です</span>`;
  const mcu = result.mcusComplete
    ? `<span class="st-ok">✔ カスタムMCUファームウェア 4本 OK</span>`
    : `<span class="st-missing">△ カスタムMCUファームウェアが不足（50xx/51xx/52xx/54xx.bin — フェーズ3で必須）</span>`;

  el.hidden = false;
  el.innerHTML = `
    <p>${summary}<br />${mcu}</p>
    <table>
      <thead><tr><th>領域</th><th>ファイル</th><th>サイズ</th><th>CRC32</th><th>状態</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}
