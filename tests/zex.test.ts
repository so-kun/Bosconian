// zexdoc / zexall instruction exerciser (Frank D. Cringle) against the Z80
// core. These compare CRCs of flag/register outcomes captured from a real
// Zilog Z80 — the strongest correctness signal available.
//
// The binaries are fetched by tools/fetch-testroms.sh (not committed).
// Runtime is minutes (tens of billions of T-states), so these only run when
// the fixtures exist AND `ZEX=1` (zexdoc) / `ZEX=all` (zexdoc+zexall) is set:
//   ZEX=all npx vitest run tests/zex.test.ts

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCom } from "./helpers/cpm";

const FIXTURES = join(__dirname, "fixtures");
const ZEX = process.env["ZEX"];

function zexPath(name: string): string {
  return join(FIXTURES, name);
}

describe.skipIf(!ZEX || !existsSync(zexPath("zexdoc.com")))("zex exercisers", () => {
  it("zexdoc: all documented-flag tests pass", { timeout: 3_600_000 }, () => {
    const { output } = runCom(new Uint8Array(readFileSync(zexPath("zexdoc.com"))));
    console.log(output);
    expect(output).toContain("Tests complete");
    expect(output).not.toContain("ERROR");
  });

  it.skipIf(ZEX !== "all")("zexall: undocumented-flag tests pass", { timeout: 3_600_000 }, () => {
    const { output } = runCom(new Uint8Array(readFileSync(zexPath("zexall.com"))));
    console.log(output);
    expect(output).toContain("Tests complete");
    expect(output).not.toContain("ERROR");
  });
});
