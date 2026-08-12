// Machine skeleton tests with synthetic ROMs (no original ROM data needed):
// shared RAM visibility across CPUs, LS259 reset gating of sub CPUs,
// vblank IRQ delivery/acknowledge, and the 8-vblank watchdog.

import { describe, expect, it } from "vitest";
import { BoscoMachine } from "../src/machine/bosco";

function rom(bytes: Record<number, number[]>): Uint8Array {
  const r = new Uint8Array(0x4000).fill(0x76); // HALT everywhere by default
  for (const [addr, data] of Object.entries(bytes)) r.set(data, Number(addr));
  return r;
}

const IDLE = rom({}); // halts immediately

describe("BoscoMachine", () => {
  it("holds sub CPUs in reset until misclatch Q3 is set", () => {
    const main = rom({
      0: [
        0x31, 0x00, 0x7c, // LD SP,0x7C00
        0x3e, 0x01, //       LD A,1
        0x32, 0x23, 0x68, // LD (0x6823),A  — release sub/sub2
        0x3e, 0x00, //       LD A,0
        0x32, 0x30, 0x68, // LD (0x6830),A  — watchdog kick
        0x18, 0xf9, //       JR -7 (back to the kick loop)
      ],
    });
    const sub = rom({
      0: [0x3e, 0xaa, 0x32, 0x01, 0x78, 0x76], // LD A,0xAA; LD (0x7801),A; HALT
    });
    const sub2 = rom({
      0: [0x3e, 0xbb, 0x32, 0x02, 0x78, 0x76], // LD A,0xBB; LD (0x7802),A; HALT
    });

    const m = new BoscoMachine({ maincpu: main, sub, sub2 });
    expect(m.subResetLine).toBe(false);
    m.runFrame();
    expect(m.subResetLine).toBe(true);
    expect(m.sharedRam[1]).toBe(0xaa);
    expect(m.sharedRam[2]).toBe(0xbb);
  });

  it("sub CPUs stay dormant when never released", () => {
    const main = rom({
      0: [
        0x3e, 0x00, //       LD A,0
        0x32, 0x30, 0x68, // LD (0x6830),A — kick watchdog
        0x18, 0xf9, //       JR -7
      ],
    });
    const sub = rom({ 0: [0x3e, 0xaa, 0x32, 0x01, 0x78, 0x76] });
    const m = new BoscoMachine({ maincpu: main, sub, sub2: IDLE });
    m.runFrame();
    expect(m.sharedRam[1]).toBe(0);
  });

  it("delivers vblank IRQ once per frame when enabled, ack via misclatch", () => {
    const main = rom({
      0: [
        0x31, 0x00, 0x7c, // LD SP,0x7C00
        0xed, 0x56, //       IM 1
        0x3e, 0x01, //       LD A,1
        0x32, 0x20, 0x68, // LD (0x6820),A — enable IRQ1
        // loop @ 0x0a:
        0x3e, 0x00, //       LD A,0
        0x32, 0x30, 0x68, // LD (0x6830),A — kick watchdog
        0xfb, //             EI
        0x76, //             HALT
        0x18, 0xf7, //       JR 0x0a
      ],
      0x38: [
        0xf5, //             PUSH AF
        0x21, 0x00, 0x78, // LD HL,0x7800
        0x34, //             INC (HL)
        0x3e, 0x00, //       LD A,0
        0x32, 0x20, 0x68, // LD (0x6820),A — clear/ack IRQ
        0x3e, 0x01, //       LD A,1
        0x32, 0x20, 0x68, // LD (0x6820),A — re-enable
        0xf1, //             POP AF
        0xc9, //             RET
      ],
    });
    const m = new BoscoMachine({ maincpu: main, sub: IDLE, sub2: IDLE });
    for (let i = 0; i < 4; i++) m.runFrame();
    expect(m.sharedRam[0]).toBe(4);
    expect(m.watchdogFired).toBe(0);
  });

  it("watchdog resets the machine after 8 unserviced vblanks", () => {
    const main = rom({ 0: [0xf3, 0x76] }); // DI; HALT — never kicks the watchdog
    const m = new BoscoMachine({ maincpu: main, sub: IDLE, sub2: IDLE });
    for (let i = 0; i < 12; i++) m.runFrame();
    expect(m.watchdogFired).toBeGreaterThanOrEqual(1);
  });

  it("DSW bits are readable one switch per address", () => {
    const m = new BoscoMachine({ maincpu: IDLE, sub: IDLE, sub2: IDLE });
    m.dswA = 0b10101010;
    m.dswB = 0b01010101;
    // offset 0: DSWB bit0=1 -> bit0, DSWA bit0=0 -> bit1
    expect(m.memRead(0, 0x6800)).toBe(0b01);
    expect(m.memRead(0, 0x6801)).toBe(0b10);
  });

  it("ROM area ignores writes; videoram and shared RAM accept them", () => {
    const m = new BoscoMachine({ maincpu: IDLE, sub: IDLE, sub2: IDLE });
    m.memWrite(0, 0x1000, 0x12);
    expect(m.memRead(0, 0x1000)).toBe(0x76); // still the HALT fill
    m.memWrite(0, 0x8123, 0x34);
    expect(m.memRead(1, 0x8123)).toBe(0x34); // visible from another CPU
    m.memWrite(2, 0x7abc, 0x56);
    expect(m.memRead(0, 0x7abc)).toBe(0x56);
  });

  it("star control and video latches update machine state", () => {
    const m = new BoscoMachine({ maincpu: IDLE, sub: IDLE, sub2: IDLE });
    expect(m.starClr).toBe(true);
    m.memWrite(0, 0x9840, 0x00);
    expect(m.starClr).toBe(false);
    m.memWrite(0, 0x9810, 0x42);
    m.memWrite(0, 0x9820, 0x24);
    expect(m.scrollX).toBe(0x42);
    expect(m.scrollY).toBe(0x24);
    // flip screen: Q0 inverted (write 0 -> flipped)
    m.memWrite(0, 0x9870, 0);
    expect(m.flipScreen).toBe(true);
    m.memWrite(0, 0x9870, 1);
    expect(m.flipScreen).toBe(false);
  });
});
