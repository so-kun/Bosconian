// Namco 05XX starfield generator.
//
// Reimplemented from the reverse-engineered algorithm documented in MAME
// src/mame/namco/starfield_05xx.cpp (BSD-3-Clause, copyright-holders Robert
// Hildinger). A 16-bit Fibonacci LFSR is clocked once per pixel; a "hit"
// (8 specific bits matching a pattern) places a star whose colour and bank
// come from other LFSR bits. Two of four banks are active per frame, and
// scrolling is done by running/skipping extra LFSR steps in the blanking
// intervals.

import type { Palette } from "./palette";

const HIT_MASK = 0xfa14;
const HIT_VALUE = 0x7800;
const SEED = 0x7fff;
const CYCLES_PER_LINE = 256;
const VISIBLE_LINES = 224;
const PIXEL_WIDTH = 256;

// Bosconian config (galaga.cpp): X offset 0, Y offset 16, X limit 224.
const OFFSET_X = 0;
const OFFSET_Y = 16;
const LIMIT_X = 224;

const SPEED_X_OFFSET = [0, 1, 2, 3, -4, -3, -2, -1];
const PRE_VIS = [22, 23, 22, 23, 19, 20, 20, 22].map((n) => n * CYCLES_PER_LINE);
const POST_VIS = [10, 10, 12, 12, 9, 9, 10, 9].map((n) => n * CYCLES_PER_LINE);

function nextLfsr(lfsr: number): number {
  const bit = ((lfsr >> 0) ^ (lfsr >> 3) ^ (lfsr >> 5) ^ (lfsr >> 10)) & 1;
  return ((lfsr >> 1) | (bit << 15)) & 0xffff;
}

export class Starfield {
  private lfsr = SEED;
  private preVis = 0;
  private postVis = 0;
  private setA = 0;
  private setB = 0;
  enabled = false;

  reset(): void {
    this.lfsr = SEED;
    this.preVis = 0;
    this.postVis = 0;
    this.setA = 0;
    this.setB = 0;
    this.enabled = false;
  }

  enable(on: boolean): void {
    if (!on) this.lfsr = SEED;
    this.enabled = on;
  }

  /** speedX/speedY are 3-bit indices from the star control register. */
  setScrollSpeed(speedX: number, speedY: number): void {
    this.preVis = PRE_VIS[speedY & 7]! + SPEED_X_OFFSET[speedX & 7]!;
    this.postVis = POST_VIS[speedY & 7]!;
  }

  setActiveSets(a: number, b: number): void {
    this.setA = a & 3;
    this.setB = b & 3;
  }

  /**
   * Advance the LFSR for one frame and plot stars into the RGB framebuffer.
   * `rgb` is width*height*3; framebuffer row 0 corresponds to screen line
   * OFFSET_Y. Only plots where a hit's bank is active and x < LIMIT_X.
   */
  render(rgb: Uint8Array, width: number, palette: Palette, flip = false): void {
    if (!this.enabled) return;
    let lfsr = this.lfsr;
    for (let i = this.preVis; i > 0; i--) lfsr = nextLfsr(lfsr);

    for (let y = OFFSET_Y; y < VISIBLE_LINES + OFFSET_Y; y++) {
      const row = y - OFFSET_Y;
      for (let x = OFFSET_X; x < PIXEL_WIDTH + OFFSET_X; x++) {
        if ((lfsr & HIT_MASK) === HIT_VALUE) {
          const starSet = (((lfsr >> 10) & 1) << 1) | ((lfsr >> 8) & 1);
          if ((this.setA === starSet || this.setB === starSet) && x < LIMIT_X) {
            let dx = x;
            if (flip) dx += 64;
            if (dx >= 0 && dx < width && row >= 0 && row < VISIBLE_LINES) {
              let color = (lfsr >> 5) & 0x7;
              color |= (lfsr << 3) & 0x18;
              color |= (lfsr << 2) & 0x20;
              color = ~color & 0x3f;
              const [r, g, b] = palette.colors[32 + color] ?? [0, 0, 0];
              // color 0 is black (invisible star); skip to avoid dark dots
              if (r || g || b) {
                const o = (row * width + dx) * 3;
                rgb[o] = r;
                rgb[o + 1] = g;
                rgb[o + 2] = b;
              }
            }
          }
        }
        lfsr = nextLfsr(lfsr);
      }
    }
    for (let i = this.postVis; i > 0; i--) lfsr = nextLfsr(lfsr);
    this.lfsr = lfsr;
  }
}
