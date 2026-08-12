import { describe, expect, it } from "vitest";
import { crc32Hex, sha1Hex } from "../src/rom/crc32";

describe("crc32", () => {
  it("matches known answer for '123456789'", () => {
    const data = new TextEncoder().encode("123456789");
    expect(crc32Hex(data)).toBe("cbf43926"); // standard CRC-32 check value
  });

  it("matches known answer for empty input", () => {
    expect(crc32Hex(new Uint8Array(0))).toBe("00000000");
  });

  it("matches zip CRC convention for 'The quick brown fox jumps over the lazy dog'", () => {
    const data = new TextEncoder().encode("The quick brown fox jumps over the lazy dog");
    expect(crc32Hex(data)).toBe("414fa339");
  });
});

describe("sha1", () => {
  it("matches known answer for 'abc'", async () => {
    const data = new TextEncoder().encode("abc");
    expect(await sha1Hex(data)).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  });
});
