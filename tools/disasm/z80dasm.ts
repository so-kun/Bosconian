// Z80 disassembler used to analyse Bosconian's program ROMs.
//
// Table-driven decode using the standard x/y/z/p/q opcode decomposition
// (see z80.info "Decoding Z80 opcodes"). Handles the CB/ED/DD/FD/DDCB/FDCB
// prefixes, undocumented instructions (SLL, IXH/IXL, DDCB register copy),
// and reports control-flow kind + branch target so a caller can build a
// code/data map and follow call graphs.
//
// This is original code (no ROM content). It emits mnemonics from bytes it
// is given; the bytes themselves come from the user's locally-supplied ROM
// and are never committed.

export type Flow =
  | "normal"
  | "jump" // unconditional JP/JR/JP (HL)
  | "cjump" // conditional JP/JR/DJNZ
  | "call" // unconditional CALL
  | "ccall" // conditional CALL
  | "ret" // RET/RETI/RETN (incl. conditional)
  | "rst" // RST n
  | "stop"; // HALT

export interface DisasmLine {
  addr: number;
  length: number;
  bytes: number[];
  text: string;
  /** absolute branch/call target where statically known */
  target?: number;
  flow: Flow;
}

export type ReadFn = (addr: number) => number;

const R = ["b", "c", "d", "e", "h", "l", "(hl)", "a"];
const RP = ["bc", "de", "hl", "sp"];
const RP2 = ["bc", "de", "hl", "af"];
const CC = ["nz", "z", "nc", "c", "po", "pe", "p", "m"];
const ALU = ["add a,", "adc a,", "sub", "sbc a,", "and", "xor", "or", "cp"];
const ROT = ["rlc", "rrc", "rl", "rr", "sla", "sra", "sll", "srl"];
const IM = ["0", "0", "1", "2", "0", "0", "1", "2"];
// block-instruction names indexed [z][y-4]
const BLI: Record<number, string[]> = {
  0: ["ldi", "ldd", "ldir", "lddr"],
  1: ["cpi", "cpd", "cpir", "cpdr"],
  2: ["ini", "ind", "inir", "indr"],
  3: ["outi", "outd", "otir", "otdr"],
};

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const hex4 = (n: number) => n.toString(16).padStart(4, "0");
const sb = (n: number) => (n << 24) >> 24; // sign-extend byte

/** ALU mnemonic with a trailing space where it takes an operand. */
function alu(y: number, operand: string): string {
  const m = ALU[y]!;
  return m.endsWith(",") ? `${m}${operand}` : `${m} ${operand}`;
}

/**
 * Disassemble one instruction at `addr`. `read` supplies bytes (masked to
 * 16-bit space by the caller if needed). Never throws on unknown encodings —
 * emits `defb` so a linear sweep always makes progress.
 */
export function disasmOne(read: ReadFn, addr: number): DisasmLine {
  const start = addr;
  let p = addr;
  const next = () => read(p++ & 0xffff) & 0xff;

  let idx: "" | "ix" | "iy" = "";
  let op = next();
  if (op === 0xdd) {
    idx = "ix";
    op = next();
  } else if (op === 0xfd) {
    idx = "iy";
    op = next();
  }

  const finish = (text: string, flow: Flow = "normal", target?: number): DisasmLine => {
    const length = (p - start) & 0xffff || 1;
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) bytes.push(read((start + i) & 0xffff) & 0xff);
    return { addr: start, length, bytes, text, target, flow };
  };

  // register name honoring index substitution; hasMem = instruction also has
  // an (idx+d) memory operand, in which case h/l stay un-indexed.
  const rname = (i: number, hasMem: boolean): string => {
    if (idx && !hasMem) {
      if (i === 4) return `${idx}h`;
      if (i === 5) return `${idx}l`;
    }
    return R[i]!;
  };
  const hlname = () => (idx ? idx : "hl");
  // read an (idx+d) operand string and consume the displacement byte
  const memOperand = (): string => {
    if (!idx) return "(hl)";
    const d = sb(next());
    const sign = d < 0 ? "-" : "+";
    return `(${idx}${sign}0x${hex2(Math.abs(d))})`;
  };

  const imm8 = () => next();
  const imm16 = () => {
    const lo = next();
    return lo | (next() << 8);
  };

  if (op === 0xcb) {
    // For DDCB/FDCB the displacement byte precedes the CB opcode byte.
    let mem = "";
    if (idx) {
      const d = sb(next());
      const sign = d < 0 ? "-" : "+";
      mem = `(${idx}${sign}0x${hex2(Math.abs(d))})`;
    }
    const cb = next();
    const cx = cb >> 6;
    const cy = (cb >> 3) & 7;
    const cz = cb & 7;
    const targ = idx ? mem : R[cz]!;
    const copy = idx && cz !== 6 ? ` -> ${R[cz]!}` : ""; // undocumented reg copy
    if (cx === 0) return finish(`${ROT[cy]!} ${targ}${copy}`);
    if (cx === 1) return finish(`bit ${cy},${idx ? mem : R[cz]!}`);
    if (cx === 2) return finish(`res ${cy},${targ}${copy}`);
    return finish(`set ${cy},${targ}${copy}`);
  }

  if (op === 0xed) {
    idx = ""; // ED cancels any DD/FD prefix
    return disasmED(next, finish);
  }

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const q = y & 1;
  const pp = y >> 1;

  if (x === 0) {
    switch (z) {
      case 0:
        if (y === 0) return finish("nop");
        if (y === 1) return finish("ex af,af'");
        if (y === 2) {
          const d = sb(imm8());
          const t = (p + d) & 0xffff;
          return finish(`djnz 0x${hex4(t)}`, "cjump", t);
        }
        if (y === 3) {
          const d = sb(imm8());
          const t = (p + d) & 0xffff;
          return finish(`jr 0x${hex4(t)}`, "jump", t);
        }
        {
          const d = sb(imm8());
          const t = (p + d) & 0xffff;
          return finish(`jr ${CC[y - 4]},0x${hex4(t)}`, "cjump", t);
        }
      case 1:
        if (q === 0) {
          const nn = imm16();
          const rp = pp === 2 ? hlname() : RP[pp]!;
          return finish(`ld ${rp},0x${hex4(nn)}`);
        }
        return finish(`add ${hlname()},${pp === 2 ? hlname() : RP[pp]!}`);
      case 2:
        if (q === 0) {
          if (pp === 0) return finish("ld (bc),a");
          if (pp === 1) return finish("ld (de),a");
          if (pp === 2) {
            const nn = imm16();
            return finish(`ld (0x${hex4(nn)}),${hlname()}`);
          }
          const nn = imm16();
          return finish(`ld (0x${hex4(nn)}),a`);
        }
        if (pp === 0) return finish("ld a,(bc)");
        if (pp === 1) return finish("ld a,(de)");
        if (pp === 2) {
          const nn = imm16();
          return finish(`ld ${hlname()},(0x${hex4(nn)})`);
        }
        {
          const nn = imm16();
          return finish(`ld a,(0x${hex4(nn)})`);
        }
      case 3:
        return finish(
          `${q === 0 ? "inc" : "dec"} ${pp === 2 ? hlname() : RP[pp]!}`,
        );
      case 4:
      case 5: {
        const mnem = z === 4 ? "inc" : "dec";
        if (y === 6) return finish(`${mnem} ${memOperand()}`);
        return finish(`${mnem} ${rname(y, false)}`);
      }
      case 6: {
        if (y === 6) {
          const dst = memOperand();
          const n = imm8();
          return finish(`ld ${dst},0x${hex2(n)}`);
        }
        const n = imm8();
        return finish(`ld ${rname(y, false)},0x${hex2(n)}`);
      }
      default: {
        const names = ["rlca", "rrca", "rla", "rra", "daa", "cpl", "scf", "ccf"];
        return finish(names[y]!);
      }
    }
  }

  if (x === 1) {
    if (y === 6 && z === 6) return finish("halt", "stop");
    if (z === 6) {
      // LD r,(idx+d): register side stays un-indexed
      const src = memOperand();
      return finish(`ld ${R[y]!},${src}`);
    }
    if (y === 6) {
      const dst = memOperand();
      return finish(`ld ${dst},${R[z]!}`);
    }
    return finish(`ld ${rname(y, false)},${rname(z, false)}`);
  }

  if (x === 2) {
    if (z === 6) return finish(alu(y, memOperand()));
    return finish(alu(y, rname(z, false)));
  }

  // x === 3
  switch (z) {
    case 0:
      return finish(`ret ${CC[y]}`, "ret");
    case 1:
      if (q === 0) return finish(`pop ${pp === 2 ? hlname() : RP2[pp]!}`);
      if (pp === 0) return finish("ret", "ret");
      if (pp === 1) return finish("exx");
      if (pp === 2) return finish(`jp (${hlname()})`, "jump");
      return finish(`ld sp,${hlname()}`);
    case 2: {
      const nn = imm16();
      return finish(`jp ${CC[y]},0x${hex4(nn)}`, "cjump", nn);
    }
    case 3:
      if (y === 0) {
        const nn = imm16();
        return finish(`jp 0x${hex4(nn)}`, "jump", nn);
      }
      if (y === 2) {
        const n = imm8();
        return finish(`out (0x${hex2(n)}),a`);
      }
      if (y === 3) {
        const n = imm8();
        return finish(`in a,(0x${hex2(n)})`);
      }
      if (y === 4) return finish(`ex (sp),${hlname()}`);
      if (y === 5) return finish("ex de,hl");
      if (y === 6) return finish("di");
      return finish("ei");
    case 4: {
      const nn = imm16();
      return finish(`call ${CC[y]},0x${hex4(nn)}`, "ccall", nn);
    }
    case 5:
      if (q === 0) return finish(`push ${pp === 2 ? hlname() : RP2[pp]!}`);
      if (pp === 0) {
        const nn = imm16();
        return finish(`call 0x${hex4(nn)}`, "call", nn);
      }
      // pp 1/3 are DD/FD (handled at top); pp 2 is ED (handled above)
      return finish("defb 0x" + hex2(op));
    case 6: {
      const n = imm8();
      return finish(alu(y, `0x${hex2(n)}`));
    }
    default: {
      const t = y * 8;
      return finish(`rst 0x${hex2(t)}`, "rst", t);
    }
  }
}

// ED prefix
function disasmED(
  next: () => number,
  finish: (text: string, flow?: Flow, target?: number) => DisasmLine,
): DisasmLine {
  const op = next();
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const q = y & 1;
  const pp = y >> 1;
  const imm16 = () => {
    const lo = next();
    return lo | (next() << 8);
  };

  if (x === 1) {
    switch (z) {
      case 0:
        return finish(y === 6 ? "in (c)" : `in ${R[y]!},(c)`);
      case 1:
        return finish(y === 6 ? "out (c),0" : `out (c),${R[y]!}`);
      case 2:
        return finish(`${q === 0 ? "sbc" : "adc"} hl,${RP[pp]!}`);
      case 3: {
        const nn = imm16();
        return q === 0
          ? finish(`ld (0x${hex4(nn)}),${RP[pp]!}`)
          : finish(`ld ${RP[pp]!},(0x${hex4(nn)})`);
      }
      case 4:
        return finish("neg");
      case 5:
        return finish(y === 1 ? "reti" : "retn", "ret");
      case 6:
        return finish(`im ${IM[y]!}`);
      default: {
        const names = ["ld i,a", "ld r,a", "ld a,i", "ld a,r", "rrd", "rld", "nop", "nop"];
        return finish(names[y]!);
      }
    }
  }
  if (x === 2 && z <= 3 && y >= 4) {
    return finish(BLI[z]![y - 4]!, z === 2 || z === 3 ? "normal" : "normal");
  }
  return finish(`defb 0xed,0x${hex2(op)}`);
}

/**
 * Linear sweep from `org` for `len` bytes. This is a first-pass listing; a
 * proper code/data separation needs a recursive-traversal pass seeded from
 * entry points and the RST/interrupt vectors (see cli.ts).
 */
export function disasmRange(read: ReadFn, org: number, len: number): DisasmLine[] {
  const out: DisasmLine[] = [];
  let addr = org;
  const end = org + len;
  while (addr < end) {
    const line = disasmOne(read, addr);
    out.push(line);
    addr += line.length;
  }
  return out;
}
