// Video module tests using synthetic data (no ROM content required).

import { describe, expect, it } from "vitest";
import { decodeGfx, CHAR_LAYOUT, SPRITE_LAYOUT, DOT_LAYOUT, type GfxLayout } from "../src/video/gfx";
import { buildPalette } from "../src/video/palette";

describe("decodeGfx", () => {
  it("extracts bits MSB-first for a simple 1bpp linear layout", () => {
    // 8x8, 1 plane, linear: row r byte = data[r], bit x = MSB-first
    const layout: GfxLayout = {
      width: 8,
      height: 8,
      planeOffsets: [0],
      xOffsets: [0, 1, 2, 3, 4, 5, 6, 7],
      yOffsets: [0, 8, 16, 24, 32, 40, 48, 56],
      charIncrement: 64,
    };
    const data = new Uint8Array([0b10000001, 0xff, 0, 0, 0, 0, 0, 0]);
    const [tile] = decodeGfx(data, layout, 1);
    expect(tile!.slice(0, 8)).toEqual(Uint8Array.from([1, 0, 0, 0, 0, 0, 0, 1]));
    expect(tile!.slice(8, 16)).toEqual(Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1]));
  });

  it("combines two bitplanes into 2bpp values", () => {
    // plane0 at bit 0, plane1 at bit 8: pixel value = p0 | (p1<<1)
    const layout: GfxLayout = {
      width: 2,
      height: 1,
      planeOffsets: [0, 8],
      xOffsets: [0, 1],
      yOffsets: [0],
      charIncrement: 16,
    };
    // byte0 = plane0 for the two pixels (bits 7,6), byte1 = plane1
    const data = new Uint8Array([0b10000000, 0b01000000]);
    const [tile] = decodeGfx(data, layout, 1);
    // pixel0: p0=1,p1=0 -> 1 ; pixel1: p0=0,p1=1 -> 2
    expect([...tile!]).toEqual([1, 2]);
  });

  it("produces the expected tile counts for bosco layouts", () => {
    expect(decodeGfx(new Uint8Array(0x1000), CHAR_LAYOUT).length).toBe(256);
    expect(decodeGfx(new Uint8Array(0x1000), SPRITE_LAYOUT).length).toBe(64);
    expect(decodeGfx(new Uint8Array(0x100), DOT_LAYOUT, 8).length).toBe(8);
    expect(decodeGfx(new Uint8Array(0x1000), CHAR_LAYOUT)[0]!.length).toBe(64);
    expect(decodeGfx(new Uint8Array(0x1000), SPRITE_LAYOUT)[0]!.length).toBe(256);
  });
});

describe("buildPalette", () => {
  it("resolves primary colors from resistor-weighted bits", () => {
    const proms = new Uint8Array(0x260);
    proms[0] = 0x07; // R bits 0,1,2 all on -> full red
    proms[1] = 0x38; // G bits 3,4,5 -> full green
    proms[2] = 0xc0; // B bits 6,7 -> full blue
    const pal = buildPalette(proms);
    expect(pal.colors[0]).toEqual([255, 0, 0]);
    expect(pal.colors[1]).toEqual([0, 255, 0]);
    expect(pal.colors[2]).toEqual([0, 0, 255]);
    expect(pal.colors.length).toBe(96); // 32 core + 64 star
  });

  it("builds char/sprite pen tables from the lookup PROM", () => {
    const proms = new Uint8Array(0x260);
    proms[0x20 + 5] = 0x3a; // lookup[5] = 0x3a
    const pal = buildPalette(proms);
    expect(pal.charPen[5]).toBe((0x3a & 0x0f) | 0x10); // 0x1a
    expect(pal.spritePen[5]).toBe(0x3a & 0x0f); // 0x0a
  });
});
