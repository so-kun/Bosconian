// Namco 51XX I/O + coin/credit chip (HLE).
//
// The real 51XX is an MB8843 MCU. We reimplement its documented behaviour
// (command set from MAME src/mame/namco/namco51.cpp, BSD-3-Clause) rather
// than run the firmware:
//   00: nop
//   01 +4 args: set coinage
//   02: credit mode (+ enable start buttons)
//   03: disable joystick remapping
//   04: enable joystick remapping
//   05: switch mode (return raw input ports)
//
// The main CPU reads the chip one byte per 06XX-driven NMI. In credit mode
// the byte sequence is: [credits(BCD), start/coin status, P1 joy, P2 joy].
// In switch mode it returns the raw input nibbles.

import type { Namco06Chip } from "./namco06";

export interface InputState {
  // active-high logical "pressed"; converted to the hardware's active-low ports
  p1: { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean };
  p2: { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean };
  coin1: boolean;
  coin2: boolean;
  start1: boolean;
  start2: boolean;
  service: boolean;
}

export function makeInputState(): InputState {
  return {
    p1: { up: false, down: false, left: false, right: false, fire: false },
    p2: { up: false, down: false, left: false, right: false, fire: false },
    coin1: false,
    coin2: false,
    start1: false,
    start2: false,
    service: false,
  };
}

const CREDIT_MODE = 2;
const SWITCH_MODE = 5;

// 8-way joystick bit -> direction code (0 = centered, 1..8 clockwise from up)
function joyDir(up: boolean, right: boolean, down: boolean, left: boolean): number {
  if (up && right) return 2;
  if (right && down) return 4;
  if (down && left) return 6;
  if (left && up) return 8;
  if (up) return 1;
  if (right) return 3;
  if (down) return 5;
  if (left) return 7;
  return 0;
}

export class Namco51 implements Namco06Chip {
  private mode = SWITCH_MODE;
  private remap = true;
  private readIndex = 0;
  private coinageArgs: number[] = [];
  private expectCoinageArgs = 0;

  credits = 0;
  private coin1Prev = false;
  private coin2Prev = false;
  private start1Prev = false;
  private start2Prev = false;

  constructor(private input: InputState) {}

  reset(): void {
    this.mode = SWITCH_MODE;
    this.remap = true;
    this.readIndex = 0;
    this.credits = 0;
    this.expectCoinageArgs = 0;
  }

  select(active: boolean): void {
    // a new transfer starts the read sequence over
    if (active) this.readIndex = 0;
  }

  write(value: number): void {
    if (this.expectCoinageArgs > 0) {
      this.coinageArgs.push(value & 0xff);
      this.expectCoinageArgs--;
      return;
    }
    const cmd = value & 0x07;
    switch (cmd) {
      case 0x01:
        this.expectCoinageArgs = 4;
        this.coinageArgs = [];
        break;
      case CREDIT_MODE:
        this.mode = CREDIT_MODE;
        this.readIndex = 0;
        break;
      case 0x03:
        this.remap = false;
        break;
      case 0x04:
        this.remap = true;
        break;
      case SWITCH_MODE:
        this.mode = SWITCH_MODE;
        this.readIndex = 0;
        break;
      default:
        break; // nop
    }
  }

  /** Call once per frame (vblank) to process coin/start edges. */
  vblank(): void {
    const i = this.input;
    // coin edges add credits (fixed 1-coin-1-credit HLE; coinage args ignored)
    if (i.coin1 && !this.coin1Prev && this.credits < 99) this.credits++;
    if (i.coin2 && !this.coin2Prev && this.credits < 99) this.credits++;
    this.coin1Prev = i.coin1;
    this.coin2Prev = i.coin2;
    // start consumes a credit (1 for start1, 2 for start2 if available)
    if (i.start1 && !this.start1Prev && this.credits >= 1) this.credits--;
    else if (i.start2 && !this.start2Prev && this.credits >= 2) this.credits -= 2;
    this.start1Prev = i.start1;
    this.start2Prev = i.start2;
  }

  private in0(): number {
    // IN0 active-low: bit0 up,1 right,2 down,3 left (P1), 4-7 P2
    const p = this.input.p1;
    const q = this.input.p2;
    let v = 0;
    if (p.up) v |= 0x01;
    if (p.right) v |= 0x02;
    if (p.down) v |= 0x04;
    if (p.left) v |= 0x08;
    if (q.up) v |= 0x10;
    if (q.right) v |= 0x20;
    if (q.down) v |= 0x40;
    if (q.left) v |= 0x80;
    return (~v) & 0xff; // active low
  }

  private in1(): number {
    // IN1 active-low: bit0 fire1,1 fire2,2 start1,3 start2,4 coin1,5 coin2,6 service
    const i = this.input;
    let v = 0;
    if (i.p1.fire) v |= 0x01;
    if (i.p2.fire) v |= 0x02;
    if (i.start1) v |= 0x04;
    if (i.start2) v |= 0x08;
    if (i.coin1) v |= 0x10;
    if (i.coin2) v |= 0x20;
    if (i.service) v |= 0x40;
    return (~v) & 0xff;
  }

  read(): number {
    if (this.mode === SWITCH_MODE) {
      // raw input nibbles: [IN0 lo, IN0 hi, IN1 lo, IN1 hi]
      const seq = [this.in0() & 0x0f, (this.in0() >> 4) & 0x0f, this.in1() & 0x0f, (this.in1() >> 4) & 0x0f];
      const v = seq[this.readIndex % 4] ?? 0x0f;
      this.readIndex++;
      return v;
    }
    // credit mode: [creditsBCD, start/coin, P1 joy, P2 joy]
    let v: number;
    switch (this.readIndex) {
      case 0:
        v = ((Math.floor(this.credits / 10) % 10) << 4) | (this.credits % 10);
        break;
      case 1: {
        // start buttons (active high here): bit0 start1, bit1 start2
        const i = this.input;
        v = (i.start1 ? 0x01 : 0) | (i.start2 ? 0x02 : 0);
        break;
      }
      case 2: {
        const p = this.input.p1;
        v = this.remap ? joyDir(p.up, p.right, p.down, p.left) : (this.in0() & 0x0f);
        break;
      }
      default: {
        const q = this.input.p2;
        v = this.remap ? joyDir(q.up, q.right, q.down, q.left) : ((this.in0() >> 4) & 0x0f);
        break;
      }
    }
    this.readIndex++;
    return v & 0xff;
  }
}
