// Minimal PNG encoder (truecolor RGB, 8-bit) for headless framebuffer dumps.
// Uses fflate for the zlib/deflate stream and the project's CRC-32.

import { zlibSync } from "fflate";
import { crc32 } from "../src/rom/crc32";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
  const body = new Uint8Array(4 + data.length);
  body.set(typeBytes, 0);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(8 + data.length, crc32(body));
  return out;
}

/** rgb: length width*height*3, row-major. Returns a complete PNG file. */
export function encodePNG(rgb: Uint8Array, width: number, height: number): Uint8Array {
  // add a filter byte (0 = none) at the start of every scanline
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const idat = zlibSync(raw, { level: 6 });

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  // 10,11,12 = compression/filter/interlace = 0

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Nearest-neighbor integer upscale, for viewing small arcade framebuffers. */
export function scale(rgb: Uint8Array, w: number, h: number, factor: number): {
  data: Uint8Array;
  width: number;
  height: number;
} {
  const W = w * factor;
  const H = h * factor;
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    const sy = (y / factor) | 0;
    for (let x = 0; x < W; x++) {
      const sx = (x / factor) | 0;
      const s = (sy * w + sx) * 3;
      const d = (y * W + x) * 3;
      out[d] = rgb[s]!;
      out[d + 1] = rgb[s + 1]!;
      out[d + 2] = rgb[s + 2]!;
    }
  }
  return { data: out, width: W, height: H };
}
