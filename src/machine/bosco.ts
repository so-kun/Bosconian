// Bosconian machine: 3x Z80 @ 3.072 MHz on a shared memory map, LS259
// latches, watchdog, vblank IRQs and the scanline-timed NMI for the third
// CPU. Custom chips (06XX/50XX/51XX/52XX/54XX) arrive in phase 3; for now
// the 06XX windows are stubbed so CPU1 can run.
//
// Reference: MAME src/mame/namco/galaga.cpp (BSD-3-Clause, Nicola Salmoria
// and others) — bosco_map, bosco(machine_config), galaga_state IRQ helpers.

import { Z80, type Z80Bus } from "../core/z80";
import { Namco06 } from "./namco06";
import { Namco51, makeInputState, type InputState } from "./namco51";

export const MASTER_CLOCK = 18_432_000;
export const CPU_CLOCK = MASTER_CLOCK / 6; // 3.072 MHz
export const PIXEL_CLOCK = MASTER_CLOCK / 3; // 6.144 MHz
export const HTOTAL = 384;
export const VTOTAL = 264;
export const VBSTART = 224 + 16; // first vblank line (visible: 16..239)
export const FRAME_RATE = PIXEL_CLOCK / (HTOTAL * VTOTAL); // 60.606 Hz
/** CPU cycles per scanline: 3.072e6 / (6.144e6/384) = 192 */
export const CYCLES_PER_LINE = CPU_CLOCK / (PIXEL_CLOCK / HTOTAL);

export type CpuId = 0 | 1 | 2; // main, sub, sub2

export interface BoscoIO {
  /** 06XX #0 (maincpu side): data / control read+write. Stubbed until phase 3. */
  n06xx0DataR(): number;
  n06xx0DataW(v: number): void;
  n06xx0CtrlR(): number;
  n06xx0CtrlW(v: number): void;
  /** 06XX #1 (subcpu side) */
  n06xx1DataR(): number;
  n06xx1DataW(v: number): void;
  n06xx1CtrlR(): number;
  n06xx1CtrlW(v: number): void;
  /** WSG sound register write (0x6800-0x681f) */
  soundW(offset: number, v: number): void;
  /** video latch (LS259 at 1B, 0x9870-0x9877) */
  videoLatchW(bit: number, v: number): void;
}

/** Default stub IO: keeps CPU1 from hanging on 06XX access. */
export function nullIO(): BoscoIO {
  return {
    n06xx0DataR: () => 0xff,
    n06xx0DataW: () => {},
    n06xx0CtrlR: () => 0x10,
    n06xx0CtrlW: () => {},
    n06xx1DataR: () => 0xff,
    n06xx1DataW: () => {},
    n06xx1CtrlR: () => 0x10,
    n06xx1CtrlW: () => {},
    soundW: () => {},
    videoLatchW: () => {},
  };
}

class CpuBus implements Z80Bus {
  constructor(
    private machine: BoscoMachine,
    private id: CpuId,
  ) {}

  read8(addr: number): number {
    return this.machine.memRead(this.id, addr);
  }
  write8(addr: number, value: number): void {
    this.machine.memWrite(this.id, addr, value);
  }
  ioRead(): number {
    return 0xff; // no I/O-mapped devices on this board
  }
  ioWrite(): void {}
}

export class BoscoMachine {
  cpus: [Z80, Z80, Z80];
  roms: [Uint8Array, Uint8Array, Uint8Array];
  sharedRam = new Uint8Array(0x800);
  videoRam = new Uint8Array(0x1000);
  radarAttr = new Uint8Array(0x10);
  starControl = new Uint8Array(8);

  // LS259 misclatch state (3C on CPU board)
  mainIrqMask = false;
  subIrqMask = false;
  sub2NmiMask = false;
  subResetLine = false; // Q3: false = sub CPUs held in reset

  scrollX = 0;
  scrollY = 0;
  starClr = true; // cleared (starfield off) until first write to 0x9840
  flipScreen = false;

  // watchdog: reset by writes to 0x6830; expires after 8 vblanks
  private watchdogCounter = 0;
  watchdogFired = 0; // statistics: number of watchdog resets

  dswA = 0xf7; // factory-ish defaults (see galaga.cpp INPUT_PORTS bosco)
  dswB = 0x97;

  scanline = 0;
  frame = 0;

  /** optional per-instruction trace hook (phase 5/6 trace-compare) */
  onTrace: ((cpu: CpuId, pc: number) => void) | null = null;
  /** optional I/O access hook for debugging (addr in 0x6800-0x91ff) */
  onIoAccess: ((kind: "r" | "w", addr: number, value: number) => void) | null = null;

  // Custom-chip bus interfaces and the 51XX I/O chip (HLE).
  input: InputState = makeInputState();
  n06xx0: Namco06; // maincpu side: 51XX (slot0), 50XX_1 (slot2), 54XX (slot3)
  n06xx1: Namco06; // subcpu side: 50XX_2 (slot0), 52XX (slot1)
  n51xx: Namco51;

  constructor(
    roms: { maincpu: Uint8Array; sub: Uint8Array; sub2: Uint8Array },
    public io: BoscoIO = nullIO(),
  ) {
    this.roms = [roms.maincpu, roms.sub, roms.sub2];
    this.cpus = [
      new Z80(new CpuBus(this, 0)),
      new Z80(new CpuBus(this, 1)),
      new Z80(new CpuBus(this, 2)),
    ];
    // 06XX clocks: _0 = MASTER/6/64, _1 = MASTER/6/512 -> NMI periods 64/512.
    this.n06xx0 = new Namco06(64);
    this.n06xx1 = new Namco06(512);
    this.n51xx = new Namco51(this.input);
    this.n06xx0.attach(0, this.n51xx);
    this.reset();
  }

  reset(): void {
    for (const cpu of this.cpus) cpu.reset();
    this.mainIrqMask = false;
    this.subIrqMask = false;
    this.sub2NmiMask = false;
    this.subResetLine = false;
    this.starClr = true;
    this.watchdogCounter = 0;
    this.scanline = 0;
    this.sharedRam.fill(0);
    this.n06xx0.reset();
    this.n06xx1.reset();
    this.n51xx.reset();
    // videoRam deliberately left as-is: real DRAM keeps garbage across resets
  }

  // ---- shared memory map (identical for all three CPUs) -------------------
  memRead(id: CpuId, addr: number): number {
    addr &= 0xffff;
    if (addr < 0x4000) {
      return this.roms[id][addr] ?? 0xff;
    }
    if (this.onIoAccess && addr >= 0x6800 && addr < 0x9200) this.onIoAccess("r", addr, 0);
    if (addr >= 0x6800 && addr <= 0x6807) {
      // DSW: bit0 from DSWB, bit1 from DSWA, one switch per address
      const bit0 = (this.dswB >> (addr & 7)) & 1;
      const bit1 = (this.dswA >> (addr & 7)) & 1;
      return bit0 | (bit1 << 1);
    }
    if (addr >= 0x7000 && addr <= 0x70ff) return this.n06xx0.dataR();
    if (addr === 0x7100) return this.n06xx0.ctrlR();
    if (addr >= 0x7800 && addr <= 0x7fff) return this.sharedRam[addr & 0x7ff]!;
    if (addr >= 0x8000 && addr <= 0x8fff) return this.videoRam[addr & 0xfff]!;
    if (addr >= 0x9000 && addr <= 0x90ff) return this.n06xx1.dataR();
    if (addr === 0x9100) return this.n06xx1.ctrlR();
    return 0xff;
  }

  memWrite(id: CpuId, addr: number, v: number): void {
    addr &= 0xffff;
    if (addr < 0x4000) return; // ROM (nopw)
    if (addr >= 0x6800 && addr <= 0x681f) {
      this.io.soundW(addr & 0x1f, v);
      return;
    }
    if (addr >= 0x6820 && addr <= 0x6827) {
      this.misclatchW(addr & 7, v & 1);
      return;
    }
    if (addr === 0x6830) {
      this.watchdogCounter = 0;
      return;
    }
    if (addr >= 0x7000 && addr <= 0x70ff) {
      this.n06xx0.dataW(v);
      return;
    }
    if (addr === 0x7100) {
      this.n06xx0.ctrlW(v);
      return;
    }
    if (addr >= 0x7800 && addr <= 0x7fff) {
      this.sharedRam[addr & 0x7ff] = v;
      return;
    }
    if (addr >= 0x8000 && addr <= 0x8fff) {
      this.videoRam[addr & 0xfff] = v;
      return;
    }
    if (addr >= 0x9000 && addr <= 0x90ff) {
      this.n06xx1.dataW(v);
      return;
    }
    if (addr === 0x9100) {
      this.n06xx1.ctrlW(v);
      return;
    }
    if (addr >= 0x9800 && addr <= 0x980f) {
      this.radarAttr[addr & 0x0f] = v;
      return;
    }
    if (addr === 0x9810) {
      this.scrollX = v;
      return;
    }
    if (addr === 0x9820) {
      this.scrollY = v;
      return;
    }
    if (addr >= 0x9830 && addr <= 0x9837) {
      this.starControl[addr & 7] = v;
      return;
    }
    if (addr === 0x9840) {
      this.starClr = false; // any write turns the starfield on
      return;
    }
    if (addr >= 0x9870 && addr <= 0x9877) {
      this.videolatchW(addr & 7, v & 1);
      return;
    }
  }

  // LS259 3C (CPU board): Q0..Q3
  private misclatchW(bit: number, state: number): void {
    switch (bit) {
      case 0: // IRQ1 enable / clear
        this.mainIrqMask = state !== 0;
        if (!this.mainIrqMask) this.cpus[0].intLine = false;
        break;
      case 1: // IRQ2 enable / clear
        this.subIrqMask = state !== 0;
        if (!this.subIrqMask) this.cpus[1].intLine = false;
        break;
      case 2: // NMI on (note inverted sense: nmion_w does mask = !state)
        this.sub2NmiMask = state === 0;
        break;
      case 3: {
        // sub + sub2 reset (inverted: 0 = hold in reset). Also resets
        // 50xx_1/51xx/54xx (phase 3).
        const release = state !== 0;
        if (release && !this.subResetLine) {
          this.cpus[1].reset();
          this.cpus[2].reset();
        }
        this.subResetLine = release;
        break;
      }
      default:
        break;
    }
  }

  // LS259 1B (video board): Q0 = flip (inverted), Q4/Q5 = star bank, Q7 = 50xx_2/52xx reset
  private videolatchW(bit: number, state: number): void {
    if (bit === 0) this.flipScreen = state === 0;
    this.io.videoLatchW(bit, state);
  }

  // ---- scheduling ----------------------------------------------------------
  /**
   * Run one scanline worth of CPU time (192 cycles per CPU), interleaved in
   * small slices to approximate MAME's 6 kHz quantum. Then advance video
   * timing (vblank IRQ at line 240, CPU3 NMI at lines 64/192, watchdog).
   */
  runScanline(): void {
    const target = CYCLES_PER_LINE;
    const ran = [0, 0, 0];
    let progress = true;
    while (progress) {
      progress = false;
      for (let id = 0 as CpuId; id < 3; id++) {
        if (id > 0 && !this.subResetLine) continue; // held in reset
        if (ran[id]! < target) {
          if (this.onTrace) this.onTrace(id as CpuId, this.cpus[id]!.pc);
          const cycles = this.cpus[id]!.step();
          ran[id]! += cycles;
          // 06XX drives /NMI on its controlling CPU to clock read transfers:
          // _0 -> maincpu (cpu0), _1 -> subcpu (cpu1).
          if (id === 0 && this.n06xx0.tick(cycles)) this.cpus[0].nmi();
          if (id === 1 && this.n06xx1.tick(cycles)) this.cpus[1].nmi();
          progress = true;
        }
      }
    }

    // CPU3 NMI at scanlines 64 and 192 (galaga_state::cpu3_interrupt_callback)
    if ((this.scanline === 64 || this.scanline === 192) && this.sub2NmiMask && this.subResetLine) {
      this.cpus[2].nmi();
    }

    this.scanline++;
    if (this.scanline === VBSTART) {
      // vblank start: level-triggered INT on main/sub when enabled
      if (this.mainIrqMask) this.cpus[0].intLine = true;
      if (this.subIrqMask) this.cpus[1].intLine = true;
      // 51XX processes coin/credit edges once per frame
      this.n51xx.vblank();
      // watchdog counts vblanks; 8 misses reset the whole machine
      if (++this.watchdogCounter > 8) {
        this.watchdogFired++;
        this.reset();
      }
    }
    if (this.scanline >= VTOTAL) {
      this.scanline = 0;
      this.frame++;
    }
  }

  runFrame(): void {
    const start = this.frame;
    while (this.frame === start) this.runScanline();
  }
}
