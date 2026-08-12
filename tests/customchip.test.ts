// Unit tests for the 06XX bus and 51XX I/O HLE (no ROM needed).

import { describe, expect, it } from "vitest";
import { Namco06, type Namco06Chip } from "../src/machine/namco06";
import { Namco51, makeInputState } from "../src/machine/namco51";

function stubChip(readVal: number): Namco06Chip & { written: number[] } {
  return { written: [], read: () => readVal, write(v) { this.written.push(v); } };
}

describe("Namco06", () => {
  it("routes reads as AND of selected chips in read mode", () => {
    const bus = new Namco06();
    bus.attach(0, stubChip(0xf0));
    bus.attach(1, stubChip(0x3c));
    bus.ctrlW(0x13); // chipsel 0+1, read mode (bit4), divider bits set
    expect(bus.dataR()).toBe(0xf0 & 0x3c);
  });

  it("routes writes to selected chips in write mode", () => {
    const bus = new Namco06();
    const c = stubChip(0xff);
    bus.attach(2, c);
    bus.ctrlW(0x04); // chipsel 2, write mode
    bus.dataW(0x5a);
    expect(c.written).toEqual([0x5a]);
  });

  it("read in write mode returns 0xff; write in read mode is ignored", () => {
    const bus = new Namco06();
    const c = stubChip(0x11);
    bus.attach(0, c);
    bus.ctrlW(0x01); // chipsel0, write mode
    expect(bus.dataR()).toBe(0xff);
    bus.ctrlW(0x31); // chipsel0, read mode
    bus.dataW(0x99);
    expect(c.written).toEqual([]);
  });

  it("pulses NMI on a cadence only while a read transfer is active", () => {
    const bus = new Namco06(64);
    bus.attach(0, stubChip(0));
    bus.ctrlW(0x31); // read mode, divider set
    let pulses = 0;
    for (let i = 0; i < 10; i++) if (bus.tick(20)) pulses++; // 200 cycles / 64
    expect(pulses).toBe(3);
    bus.ctrlW(0x10); // divider bits clear -> idle
    let more = 0;
    for (let i = 0; i < 10; i++) if (bus.tick(20)) more++;
    expect(more).toBe(0);
  });
});

describe("Namco51", () => {
  it("switch mode returns the raw input nibbles (active-low)", () => {
    const input = makeInputState();
    const chip = new Namco51(input);
    chip.write(0x05); // switch mode
    chip.select(true);
    // no input pressed -> all bits high
    expect([chip.read(), chip.read(), chip.read(), chip.read()]).toEqual([0x0f, 0x0f, 0x0f, 0x0f]);
    // press P1 up (IN0 bit0) -> first nibble low bit0 clears
    input.p1.up = true;
    chip.select(true);
    expect(chip.read()).toBe(0x0e);
  });

  it("credit mode reports credits in BCD and increments on coin edges", () => {
    const input = makeInputState();
    const chip = new Namco51(input);
    chip.write(0x02); // credit mode
    chip.select(true);
    expect(chip.read()).toBe(0); // 0 credits
    input.coin1 = true;
    chip.vblank(); // rising edge -> +1 credit
    input.coin1 = false;
    chip.vblank();
    input.coin1 = true;
    chip.vblank(); // another edge -> +1
    expect(chip.credits).toBe(2);
    chip.select(true);
    expect(chip.read()).toBe(0x02); // BCD 2
  });

  it("start button consumes a credit", () => {
    const input = makeInputState();
    const chip = new Namco51(input);
    chip.write(0x02);
    input.coin1 = true;
    chip.vblank();
    expect(chip.credits).toBe(1);
    input.coin1 = false;
    input.start1 = true;
    chip.vblank();
    expect(chip.credits).toBe(0);
  });

  it("reports joystick direction in remap mode", () => {
    const input = makeInputState();
    const chip = new Namco51(input);
    chip.write(0x02); // credit mode
    chip.write(0x04); // enable remap
    input.p1.up = true;
    input.p1.right = true;
    chip.select(true);
    chip.read(); // credits
    chip.read(); // start/coin
    expect(chip.read()).toBe(2); // up+right -> dir 2
  });
});
