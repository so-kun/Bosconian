// Browser-side emulator driver: builds the machine and video assets from a
// verified ROM set, runs frames on requestAnimationFrame, and blits the
// rendered framebuffer to a canvas. This is what makes the page show the
// real power-on sequence (RAM OK / ROM OK / attract) by executing the ROM.

import { BoscoMachine } from "./machine/bosco";
import type { LoadedRomSet } from "./rom/loader";
import { CHAR_LAYOUT, DOT_LAYOUT, SPRITE_LAYOUT, decodeGfx } from "./video/gfx";
import { buildPalette } from "./video/palette";
import { renderFrame, SCREEN_H, SCREEN_W, type VideoAssets } from "./video/render";

export function buildAssets(rs: LoadedRomSet): VideoAssets {
  const gfx1 = rs.regions.get("gfx1")!;
  const gfx2 = rs.regions.get("gfx2")!;
  const gfx3 = rs.regions.get("gfx3")!;
  const proms = rs.regions.get("proms")!;
  return {
    chars: decodeGfx(gfx1.subarray(0, 0x1000), CHAR_LAYOUT),
    sprites: decodeGfx(gfx2.subarray(0, 0x1000), SPRITE_LAYOUT),
    dots: decodeGfx(gfx3.subarray(0, 0x100), DOT_LAYOUT, 8),
    palette: buildPalette(proms),
  };
}

export function createMachine(rs: LoadedRomSet): BoscoMachine {
  return new BoscoMachine({
    maincpu: rs.regions.get("maincpu")!.subarray(0, 0x4000),
    sub: rs.regions.get("sub")!.subarray(0, 0x4000),
    sub2: rs.regions.get("sub2")!.subarray(0, 0x4000),
  });
}

export class Emulator {
  readonly machine: BoscoMachine;
  private assets: VideoAssets;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private raf = 0;
  private running = false;

  /** frames of accelerated boot to skip the long RAM/ROM self-test wait */
  fastBootFrames = 0;

  constructor(canvas: HTMLCanvasElement, rs: LoadedRomSet) {
    this.machine = createMachine(rs);
    this.assets = buildAssets(rs);
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.image = ctx.createImageData(SCREEN_W, SCREEN_H);
  }

  /** Run N frames without rendering (used to fast-forward the boot test). */
  warmUp(frames: number): void {
    for (let i = 0; i < frames; i++) this.machine.runFrame();
  }

  private renderToCanvas(): void {
    const rgb = renderFrame(this.machine, this.assets);
    const out = this.image.data;
    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
      out[i * 4] = rgb[i * 3]!;
      out[i * 4 + 1] = rgb[i * 3 + 1]!;
      out[i * 4 + 2] = rgb[i * 3 + 2]!;
      out[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.image, 0, 0);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.machine.runFrame();
    this.renderToCanvas();
    this.raf = requestAnimationFrame(this.loop);
  };

  start(): void {
    if (this.running) return;
    if (this.fastBootFrames > 0) {
      this.warmUp(this.fastBootFrames);
      this.fastBootFrames = 0;
    }
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  /** Wire keyboard controls to the machine's input state. */
  attachKeyboard(target: Window | HTMLElement = window): () => void {
    const input = this.machine.input;
    const set = (e: KeyboardEvent, down: boolean): void => {
      switch (e.code) {
        case "ArrowUp": case "KeyW": input.p1.up = down; break;
        case "ArrowDown": case "KeyS": input.p1.down = down; break;
        case "ArrowLeft": case "KeyA": input.p1.left = down; break;
        case "ArrowRight": case "KeyD": input.p1.right = down; break;
        case "Space": case "ControlLeft": input.p1.fire = down; break;
        case "Digit5": input.coin1 = down; break;
        case "Digit1": input.start1 = down; break;
        case "Digit2": input.start2 = down; break;
        default: return;
      }
      e.preventDefault();
    };
    const kd = (e: Event): void => set(e as KeyboardEvent, true);
    const ku = (e: Event): void => set(e as KeyboardEvent, false);
    target.addEventListener("keydown", kd);
    target.addEventListener("keyup", ku);
    return () => {
      target.removeEventListener("keydown", kd);
      target.removeEventListener("keyup", ku);
    };
  }
}
