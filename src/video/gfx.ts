// Graphics ROM decoding, following MAME's gfx_layout model.
//
// A gfx_layout describes how packed ROM bits map to pixels: for pixel (x,y)
// of tile n, the value of plane p is the bit at
//   n*charincrement + planeoffset[p] + yoffset[y] + xoffset[x]
// counted MSB-first within each byte. The decoded tiles are indexed pixel
// values (0..2^planes-1) that later index the palette.
//
// Layout constants are transcribed from MAME src/mame/namco/galaga.cpp
// (BSD-3-Clause) — factual hardware layout, not game content.

export interface GfxLayout {
  width: number;
  height: number;
  planeOffsets: number[]; // bit offset of each bitplane
  xOffsets: number[]; // length === width
  yOffsets: number[]; // length === height
  charIncrement: number; // bits per tile
}

function step(start: number, count: number, delta: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i * delta);
}

// gfx1: 8x8 2bpp characters (charlayout_2bpp)
export const CHAR_LAYOUT: GfxLayout = {
  width: 8,
  height: 8,
  planeOffsets: [0, 4],
  xOffsets: [...step(8 * 8, 4, 1), ...step(0, 4, 1)],
  yOffsets: step(0, 8, 8),
  charIncrement: 16 * 8,
};

// gfx2: 16x16 2bpp sprites (spritelayout_bosco)
export const SPRITE_LAYOUT: GfxLayout = {
  width: 16,
  height: 16,
  planeOffsets: [0, 4],
  xOffsets: [
    ...step(8 * 8, 4, 1),
    ...step(16 * 8, 4, 1),
    ...step(24 * 8, 4, 1),
    ...step(0, 4, 1),
  ],
  yOffsets: [...step(0, 8, 8), ...step(32 * 8, 8, 8)],
  charIncrement: 64 * 8,
};

// gfx3: 4x4 radar dots (dotlayout) — 3 planes (2 color + 1 transparency)
export const DOT_LAYOUT: GfxLayout = {
  width: 4,
  height: 4,
  planeOffsets: [5, 6, 7],
  xOffsets: step(0, 4, 8),
  yOffsets: step(0, 4, 32),
  charIncrement: 16 * 8,
};

function bitAt(data: Uint8Array, bitIndex: number): number {
  const byte = data[bitIndex >> 3] ?? 0;
  return (byte >> (7 - (bitIndex & 7))) & 1;
}

/** Decode a gfx region into `count` tiles, each a width*height Uint8Array of
 * pixel values. `count` defaults to as many whole tiles as the data holds. */
export function decodeGfx(data: Uint8Array, layout: GfxLayout, count?: number): Uint8Array[] {
  const n = count ?? Math.floor((data.length * 8) / layout.charIncrement);
  const tiles: Uint8Array[] = [];
  for (let t = 0; t < n; t++) {
    const base = t * layout.charIncrement;
    const px = new Uint8Array(layout.width * layout.height);
    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        let v = 0;
        for (let p = 0; p < layout.planeOffsets.length; p++) {
          v |= bitAt(data, base + layout.planeOffsets[p]! + layout.yOffsets[y]! + layout.xOffsets[x]!) << p;
        }
        px[y * layout.width + x] = v;
      }
    }
    tiles.push(px);
  }
  return tiles;
}
