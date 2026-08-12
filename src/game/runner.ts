// Drives the native GameScene: keyboard -> controls, fixed-timestep update,
// canvas blit. Separate from the ROM emulator (src/emulator.ts) — this is the
// route-(c) reimplementation running its own logic.

import { SCREEN_H, SCREEN_W, type VideoAssets } from "../video/render";
import { GameScene, type Controls } from "./scene";

export class GameRunner {
  readonly scene: GameScene;
  private ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private controls: Controls = { up: false, down: false, left: false, right: false, fire: false };
  private raf = 0;
  private running = false;
  private detach: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, assets: VideoAssets) {
    this.scene = new GameScene(assets);
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.image = ctx.createImageData(SCREEN_W, SCREEN_H);
  }

  private blit(): void {
    const rgb = this.scene.render();
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
    this.scene.update(this.controls);
    this.blit();
    this.raf = requestAnimationFrame(this.loop);
  };

  attachKeyboard(target: Window | HTMLElement = window): void {
    const set = (e: KeyboardEvent, down: boolean): void => {
      switch (e.code) {
        case "ArrowUp": case "KeyW": this.controls.up = down; break;
        case "ArrowDown": case "KeyS": this.controls.down = down; break;
        case "ArrowLeft": case "KeyA": this.controls.left = down; break;
        case "ArrowRight": case "KeyD": this.controls.right = down; break;
        case "Space": case "ControlLeft": this.controls.fire = down; break;
        default: return;
      }
      e.preventDefault();
    };
    const kd = (e: Event): void => set(e as KeyboardEvent, true);
    const ku = (e: Event): void => set(e as KeyboardEvent, false);
    target.addEventListener("keydown", kd);
    target.addEventListener("keyup", ku);
    this.detach = () => {
      target.removeEventListener("keydown", kd);
      target.removeEventListener("keyup", ku);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.detach?.();
    this.detach = null;
  }
}
