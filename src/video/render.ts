// Framebuffer rendering for the Bosconian video hardware.
//
// Composition order per MAME src/mame/namco/bosco.cpp screen_update_bosco:
//   clear -> starfield -> sprites -> bg tilemap -> fg (radar) tilemap ->
//   bullets/dots -> radar 3px left shift.
// Starfield/sprites/bullets land in later steps; this module currently
// composites the two character tilemaps, which is all the power-on
// self-test and menus use.

import type { BoscoMachine } from "../machine/bosco";
import type { Palette } from "./palette";

export const SCREEN_W = 288;
export const SCREEN_H = 224;
const BG_COLS = 28; // visible playfield width in tiles (28*8 = 224px)

export interface VideoAssets {
  chars: Uint8Array[]; // decoded 8x8 char tiles (gfx1)
  sprites?: Uint8Array[]; // decoded 16x16 sprite tiles (gfx2)
  dots?: Uint8Array[]; // decoded 4x4 dot/bullet tiles (gfx3)
  palette: Palette;
}

/** Draw a 4x4 dot (gfx3) at (sx,sy) with an explicit RGB colour. Non-zero
 *  pixel values are drawn; value 0 is transparent. */
export function drawDot(
  rgb: Uint8Array,
  width: number,
  height: number,
  dots: Uint8Array[],
  code: number,
  color: [number, number, number],
  sx: number,
  sy: number,
): void {
  const tile = dots[code % dots.length];
  if (!tile) return;
  for (let y = 0; y < 4; y++) {
    const py = sy + y;
    if (py < 0 || py >= height) continue;
    for (let x = 0; x < 4; x++) {
      const px = sx + x;
      if (px < 0 || px >= width) continue;
      if (tile[y * 4 + x] === 0) continue;
      const o = (py * width + px) * 3;
      rgb[o] = color[0];
      rgb[o + 1] = color[1];
      rgb[o + 2] = color[2];
    }
  }
}

/**
 * Draw a 16x16 sprite (gfx2) into an RGB framebuffer using the sprite pen
 * table. Pixel value 0 (and any pen mapping to indirect 0x0f) is transparent.
 */
export function drawSprite(
  rgb: Uint8Array,
  width: number,
  height: number,
  sprites: Uint8Array[],
  palette: Palette,
  code: number,
  color: number,
  flipx: boolean,
  flipy: boolean,
  sx: number,
  sy: number,
): void {
  const tile = sprites[code % sprites.length];
  if (!tile) return;
  const base = color * 4;
  for (let y = 0; y < 16; y++) {
    const py = sy + y;
    if (py < 0 || py >= height) continue;
    const ty = flipy ? 15 - y : y;
    for (let x = 0; x < 16; x++) {
      const px = sx + x;
      if (px < 0 || px >= width) continue;
      const tx = flipx ? 15 - x : x;
      const pix = tile[ty * 16 + tx]!;
      if (pix === 0) continue; // transparent
      const indirect = palette.spritePen[base + pix]!;
      if (indirect === 0x0f) continue; // transparent pen
      const [r, g, b] = palette.colors[indirect] ?? [0, 0, 0];
      const o = (py * width + px) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
}

function putTile(
  rgb: Uint8Array,
  W: number,
  chars: Uint8Array[],
  palette: Palette,
  code: number,
  color: number,
  flipx: boolean,
  flipy: boolean,
  sx: number,
  sy: number,
  clipMinX: number,
  clipMaxX: number,
): void {
  const tile = chars[code & (chars.length - 1)];
  if (!tile) return;
  const base = color * 4;
  for (let y = 0; y < 8; y++) {
    const py = sy + y;
    if (py < 0 || py >= SCREEN_H) continue;
    const ty = flipy ? 7 - y : y;
    for (let x = 0; x < 8; x++) {
      const px = sx + x;
      if (px < clipMinX || px > clipMaxX || px < 0 || px >= W) continue;
      const tx = flipx ? 7 - x : x;
      const pix = tile[ty * 8 + tx]!;
      const coreIdx = palette.charPen[base + pix]!;
      const [r, g, b] = palette.colors[coreIdx]!;
      const o = (py * W + px) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
}

/**
 * Render the full 288x224 frame (tilemap layers only for now).
 * bg = playfield (left 28 cols), fg = radar strip (right).
 */
export function renderFrame(m: BoscoMachine, a: VideoAssets): Uint8Array {
  const rgb = new Uint8Array(SCREEN_W * SCREEN_H * 3);
  // background: core color 16 (char pen base) is typically black; clear to it
  const [br, bg_, bb] = a.palette.colors[16] ?? [0, 0, 0];
  for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
    rgb[i * 3] = br;
    rgb[i * 3 + 1] = bg_;
    rgb[i * 3 + 2] = bb;
  }

  const vram = m.videoRam;
  const scrollX = m.scrollX & 0xff;
  const scrollY = m.scrollY & 0xff;

  // bg tilemap 32x32, TILEMAP_SCAN_ROWS, clipped to left playfield
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 32; col++) {
      const idx = row * 32 + col;
      const code = vram[0x400 + idx]!;
      const attr = vram[0xc00 + idx]!;
      const color = attr & 0x3f;
      const flipx = ((attr >> 6) & 1) === 0; // TILE_FLIPX default (see notes)
      const flipy = ((attr >> 7) & 1) === 1;
      const sx = (col * 8 - scrollX) & 0xff;
      const sy = (row * 8 - scrollY) & 0xff;
      putTile(rgb, SCREEN_W, a.chars, a.palette, code, color, flipx, flipy, sx, sy, 0, BG_COLS * 8 - 1);
    }
  }

  // fg (radar) tilemap 8x32, mapper col + row*32, clipped to right strip
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 8; col++) {
      const idx = col + row * 32;
      const code = vram[0x000 + idx]!;
      const attr = vram[0x800 + idx]!;
      const color = attr & 0x3f;
      const flipx = ((attr >> 6) & 1) === 0;
      const flipy = ((attr >> 7) & 1) === 1;
      const sx = BG_COLS * 8 + col * 8;
      const sy = row * 8;
      putTile(rgb, SCREEN_W, a.chars, a.palette, code, color, flipx, flipy, sx, sy, BG_COLS * 8, SCREEN_W - 1);
    }
  }

  return rgb;
}

/** Debug view: the entire 32x32 bg tilemap as 256x256 (no clip/scroll). */
export function renderBgFull(m: BoscoMachine, a: VideoAssets): Uint8Array {
  const W = 256;
  const rgb = new Uint8Array(W * 256 * 3);
  const vram = m.videoRam;
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 32; col++) {
      const idx = row * 32 + col;
      const code = vram[0x400 + idx]!;
      const attr = vram[0xc00 + idx]!;
      const color = attr & 0x3f;
      const flipx = ((attr >> 6) & 1) === 0;
      const flipy = ((attr >> 7) & 1) === 1;
      putTileTo(rgb, W, 256, a, code, color, flipx, flipy, col * 8, row * 8);
    }
  }
  return rgb;
}

function putTileTo(
  rgb: Uint8Array,
  W: number,
  H: number,
  a: VideoAssets,
  code: number,
  color: number,
  flipx: boolean,
  flipy: boolean,
  sx: number,
  sy: number,
): void {
  const tile = a.chars[code & (a.chars.length - 1)];
  if (!tile) return;
  const base = color * 4;
  for (let y = 0; y < 8; y++) {
    const py = sy + y;
    if (py < 0 || py >= H) continue;
    const ty = flipy ? 7 - y : y;
    for (let x = 0; x < 8; x++) {
      const px = sx + x;
      if (px < 0 || px >= W) continue;
      const tx = flipx ? 7 - x : x;
      const pix = tile[ty * 8 + tx]!;
      const [r, g, b] = a.palette.colors[a.palette.charPen[base + pix]!]!;
      const o = (py * W + px) * 3;
      rgb[o] = r;
      rgb[o + 1] = g;
      rgb[o + 2] = b;
    }
  }
}
