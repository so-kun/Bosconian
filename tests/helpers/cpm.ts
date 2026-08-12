// Minimal CP/M harness for running .com test binaries (zexdoc/zexall)
// against the Z80 core. Traps BDOS calls at 0x0005 (C=2: console out,
// C=9: print $-terminated string) and treats a jump to 0x0000 as exit.

import { Z80, type Z80Bus } from "../../src/core/z80";

export interface CpmResult {
  output: string;
  cycles: number;
}

export function runCom(program: Uint8Array, maxCycles = 200_000_000_000): CpmResult {
  const mem = new Uint8Array(0x10000);
  mem.set(program, 0x100);
  mem[0] = 0x76; // HALT at warm boot vector (belt and braces)

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
  cpu.pc = 0x100;
  cpu.sp = 0xf000;
  // return address 0 on the stack: RET from the program = exit
  cpu.sp -= 2;
  mem[cpu.sp] = 0;
  mem[cpu.sp + 1] = 0;

  let output = "";
  let cycles = 0;
  while (cycles < maxCycles) {
    if (cpu.pc === 0x0005) {
      // BDOS call
      if (cpu.c === 2) {
        output += String.fromCharCode(cpu.e);
      } else if (cpu.c === 9) {
        let addr = cpu.de;
        for (let i = 0; i < 0x10000; i++) {
          const ch = mem[addr]!;
          if (ch === 0x24 /* '$' */) break;
          output += String.fromCharCode(ch);
          addr = (addr + 1) & 0xffff;
        }
      }
      // simulate RET
      cpu.pc = mem[cpu.sp]! | (mem[cpu.sp + 1]! << 8);
      cpu.sp = (cpu.sp + 2) & 0xffff;
      continue;
    }
    if (cpu.pc === 0x0000) break; // warm boot = exit
    cycles += cpu.step();
  }
  return { output, cycles };
}
