// Unit tests for the Z80 core: hand-assembled programs with known results.
// The heavyweight verification is zexdoc/zexall (tests/zex.test.ts).

import { describe, expect, it } from "vitest";
import { Z80, type Z80Bus } from "../src/core/z80";

function makeCpu(program: number[]): { cpu: Z80; mem: Uint8Array } {
  const mem = new Uint8Array(0x10000);
  mem.set(program, 0);
  const bus: Z80Bus = {
    read8: (a) => mem[a]!,
    write8: (a, v) => {
      mem[a] = v;
    },
    ioRead: () => 0xff,
    ioWrite: () => {},
  };
  const cpu = new Z80(bus);
  cpu.reset();
  return { cpu, mem };
}

function run(cpu: Z80, steps: number): void {
  for (let i = 0; i < steps; i++) cpu.step();
}

describe("Z80 basics", () => {
  it("LD/ADD/flags", () => {
    // LD A,0x3E; ADD A,0x22 -> 0x60
    const { cpu } = makeCpu([0x3e, 0x3e, 0xc6, 0x22]);
    run(cpu, 2);
    expect(cpu.a).toBe(0x60);
    expect(cpu.f & 0x01).toBe(0); // no carry
    expect(cpu.f & 0x10).toBe(0x10); // half carry (0xe+0x2)
  });

  it("ADD overflow sets PV and sign", () => {
    // LD A,0x7f; ADD A,1 -> 0x80, PV set, S set
    const { cpu } = makeCpu([0x3e, 0x7f, 0xc6, 0x01]);
    run(cpu, 2);
    expect(cpu.a).toBe(0x80);
    expect(cpu.f & 0x04).toBe(0x04); // PV
    expect(cpu.f & 0x80).toBe(0x80); // S
  });

  it("SUB borrow and zero", () => {
    // LD A,5; SUB 5 -> 0, Z set, N set, no C
    const { cpu } = makeCpu([0x3e, 0x05, 0xd6, 0x05]);
    run(cpu, 2);
    expect(cpu.a).toBe(0);
    expect(cpu.f & 0x40).toBe(0x40);
    expect(cpu.f & 0x02).toBe(0x02);
    expect(cpu.f & 0x01).toBe(0);
  });

  it("DAA after BCD add", () => {
    // LD A,0x15; ADD A,0x27; DAA -> 0x42
    const { cpu } = makeCpu([0x3e, 0x15, 0xc6, 0x27, 0x27]);
    run(cpu, 3);
    expect(cpu.a).toBe(0x42);
  });

  it("16-bit ops, stack, EX", () => {
    // LD HL,0x1234; PUSH HL; POP DE; EX DE,HL
    const { cpu } = makeCpu([0x21, 0x34, 0x12, 0xe5, 0xd1, 0xeb]);
    cpu.sp = 0x8000;
    run(cpu, 4);
    expect(cpu.de).toBe(0x1234);
    expect(cpu.hl).toBe(0x1234);
  });

  it("DJNZ loop", () => {
    // LD B,3; loop: INC A; DJNZ loop
    const { cpu } = makeCpu([0x06, 0x03, 0x3c, 0x10, 0xfd]);
    cpu.a = 0; // A powers up as 0xff on a real Z80
    run(cpu, 7);
    expect(cpu.a).toBe(3);
    expect(cpu.b).toBe(0);
  });

  it("LDIR block copy", () => {
    // LD HL,0x100; LD DE,0x200; LD BC,3; LDIR
    const { cpu, mem } = makeCpu([0x21, 0x00, 0x01, 0x11, 0x00, 0x02, 0x01, 0x03, 0x00, 0xed, 0xb0]);
    mem.set([0xaa, 0xbb, 0xcc], 0x100);
    run(cpu, 6);
    expect([...mem.subarray(0x200, 0x203)]).toEqual([0xaa, 0xbb, 0xcc]);
    expect(cpu.bc).toBe(0);
    expect(cpu.f & 0x04).toBe(0); // PV cleared when BC reaches 0
  });

  it("CB bit ops and undocumented SLL", () => {
    // LD A,0x40; CB BIT 6,A (Z clear); LD B,0x81; CB SLL B -> 0x03, C=1
    const { cpu } = makeCpu([0x3e, 0x40, 0xcb, 0x77, 0x06, 0x81, 0xcb, 0x30]);
    run(cpu, 4);
    expect(cpu.f & 0x40).toBe(0); // BIT 6 of 0x40 set -> Z clear... (checked mid-run)
    expect(cpu.b).toBe(0x03);
    expect(cpu.f & 0x01).toBe(0x01);
  });

  it("IX displacement and DDCB", () => {
    // LD IX,0x300; LD (IX+2),0x5A; DDCB SET 0,(IX+2) -> 0x5B
    const { cpu, mem } = makeCpu([
      0xdd, 0x21, 0x00, 0x03, 0xdd, 0x36, 0x02, 0x5a, 0xdd, 0xcb, 0x02, 0xc6,
    ]);
    run(cpu, 3);
    expect(mem[0x302]).toBe(0x5b);
  });

  it("ADC HL,rr overflow flag", () => {
    // LD HL,0x7fff; LD BC,1; OR A (clear carry); ADC HL,BC -> 0x8000, PV set
    const { cpu } = makeCpu([0x21, 0xff, 0x7f, 0x01, 0x01, 0x00, 0xb7, 0xed, 0x4a]);
    run(cpu, 4);
    expect(cpu.hl).toBe(0x8000);
    expect(cpu.f & 0x04).toBe(0x04); // PV overflow
    expect(cpu.f & 0x80).toBe(0x80); // S
    expect(cpu.f & 0x01).toBe(0); // no carry
  });

  it("SBC HL,rr overflow and borrow", () => {
    // LD HL,0x8000; LD DE,1; OR A; SBC HL,DE -> 0x7fff, PV set, no borrow
    const { cpu } = makeCpu([0x21, 0x00, 0x80, 0x11, 0x01, 0x00, 0xb7, 0xed, 0x52]);
    run(cpu, 4);
    expect(cpu.hl).toBe(0x7fff);
    expect(cpu.f & 0x04).toBe(0x04);
    expect(cpu.f & 0x01).toBe(0);
    expect(cpu.f & 0x02).toBe(0x02); // N
  });

  it("IM1 interrupt: pushes PC and jumps to 0x38", () => {
    // EI; NOP; NOP ... INT arrives
    const { cpu, mem } = makeCpu([0xfb, 0x00, 0x00, 0x00]);
    mem[0x38] = 0x76; // HALT at ISR
    cpu.sp = 0x8000;
    cpu.im = 1;
    run(cpu, 1); // EI
    cpu.intLine = true;
    run(cpu, 1); // EI delay: this executes the NOP at 1
    expect(cpu.pc).toBe(2);
    run(cpu, 1); // now the interrupt is taken
    expect(cpu.pc).toBe(0x38);
    expect(cpu.iff1).toBe(false);
    expect(mem[0x7ffe]! | (mem[0x7fff]! << 8)).toBe(0x0002);
  });

  it("NMI jumps to 0x66 preserving IFF2", () => {
    const { cpu } = makeCpu([0xfb, 0x00, 0x00]);
    cpu.sp = 0x8000;
    run(cpu, 2); // EI; NOP
    cpu.nmi();
    run(cpu, 1);
    expect(cpu.pc).toBe(0x66);
    expect(cpu.iff1).toBe(false);
    expect(cpu.iff2).toBe(true);
  });

  it("HALT waits and resumes on interrupt", () => {
    const { cpu, mem } = makeCpu([0xfb, 0x76, 0x00]);
    mem[0x38] = 0xc9; // RET from ISR
    cpu.im = 1;
    cpu.sp = 0x8000;
    run(cpu, 3); // EI; HALT; halted-step
    expect(cpu.halted).toBe(true);
    cpu.intLine = true;
    run(cpu, 1); // take INT
    expect(cpu.halted).toBe(false);
    expect(cpu.pc).toBe(0x38);
    cpu.intLine = false;
    run(cpu, 1); // RET back to after HALT
    expect(cpu.pc).toBe(0x02);
  });
});
