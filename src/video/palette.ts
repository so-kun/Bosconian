// Palette construction from the Bosconian color PROMs.
//
// Algorithm from MAME src/mame/namco/bosco.cpp (BSD-3-Clause). The board uses
// resistor-weighted DACs: R = 1000/470/220 ohm. We model each color channel
// as a normalized sum of the conductances of its "on" bits, scaled to 0..255
// (equivalent to MAME's compute_resistor_weights with no pull-up/down for the
// core colors, and a 1000-ohm pull-down term for the star colors).
//
// PROM region layout (proms, 0x260 bytes):
//   0x000..0x01f  bos1-6.6b  palette (32 x 8-bit)
//   0x020..0x11f  bos1-5.4m  color lookup table (256 bytes)

export interface Palette {
  /** 32 core colors + 64 star colors, each [r,g,b] */
  colors: [number, number, number][];
  /** char pen (0..255) -> core color index (16..31) */
  charPen: Uint8Array;
  /** sprite pen (0..255) -> core color index (0..15); 0x0f means transparent */
  spritePen: Uint8Array;
}

function weights(resistances: number[], pulldown = 0): number[] {
  const g = resistances.map((r) => 1 / r);
  let denom = g.reduce((a, b) => a + b, 0);
  if (pulldown > 0) denom += 1 / pulldown;
  return g.map((gi) => (gi / denom) * 255);
}

function combine(w: number[], bits: number[]): number {
  let v = 0;
  for (let i = 0; i < w.length; i++) v += bits[i] ? w[i]! : 0;
  return Math.round(v);
}

export function buildPalette(proms: Uint8Array): Palette {
  const colors: [number, number, number][] = [];

  const rw = weights([1000, 470, 220]);
  const bw = weights([470, 220]);

  // core 32 colors from palette PROM
  for (let i = 0; i < 32; i++) {
    const c = proms[i] ?? 0;
    const r = combine(rw, [(c >> 0) & 1, (c >> 1) & 1, (c >> 2) & 1]);
    const g = combine(rw, [(c >> 3) & 1, (c >> 4) & 1, (c >> 5) & 1]);
    const b = combine(bw, [(c >> 6) & 1, (c >> 7) & 1]);
    colors.push([r, g, b]);
  }

  // 64 star colors (computed from index bits; low bit is pulled down via 1000)
  const rsw = weights([470, 220], 1000);
  const bsw = weights([470, 220]);
  for (let i = 0; i < 64; i++) {
    const r = combine(rsw, [(i >> 0) & 1, (i >> 1) & 1]);
    const g = combine(rsw, [(i >> 2) & 1, (i >> 3) & 1]);
    const b = combine(bsw, [(i >> 4) & 1, (i >> 5) & 1]);
    colors.push([r, g, b]);
  }

  // lookup table (256 bytes) at proms offset 0x20
  const charPen = new Uint8Array(256);
  const spritePen = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const lut = proms[0x20 + i] ?? 0;
    charPen[i] = (lut & 0x0f) | 0x10; // chars use core colors 16..31
    spritePen[i] = lut & 0x0f; // sprites use core colors 0..15 (0x0f = transparent)
  }

  return { colors, charPen, spritePen };
}
