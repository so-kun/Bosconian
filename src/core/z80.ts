// Z80 CPU core.
//
// Full documented + undocumented instruction set (SLL, IXH/IXL/IYH/IYL,
// DDCB result copy), undocumented flags (X/Y bits 3/5, MEMPTR/WZ effects on
// BIT n,(HL)), R refresh register, IM 0/1/2, NMI, EI delay, HALT.
// Verified against the zexdoc/zexall instruction exercisers (see
// tests/ and tools/fetch-testroms.sh).
//
// Instruction-stepped with standard cycle counts; fine enough for the
// Bosconian board, which MAME itself runs with a 6000 Hz quantum.

export interface Z80Bus {
  read8(addr: number): number;
  write8(addr: number, value: number): void;
  ioRead(port: number): number; // 16-bit port on the bus
  ioWrite(port: number, value: number): void;
}

// Flag bits
const FC = 0x01; // carry
const FN = 0x02; // add/subtract
const FP = 0x04; // parity/overflow
const FX = 0x08; // undocumented (bit 3 of result)
const FH = 0x10; // half carry
const FY = 0x20; // undocumented (bit 5 of result)
const FZ = 0x40; // zero
const FS = 0x80; // sign

const FXY = FX | FY;

// S, Z, X, Y and parity for every byte value
const SZP = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  let p = v;
  p ^= p >> 4;
  p ^= p >> 2;
  p ^= p >> 1;
  SZP[v] = (v & (FS | FXY)) | (v === 0 ? FZ : 0) | (p & 1 ? 0 : FP);
}

export class Z80 {
  // 8-bit registers
  a = 0xff;
  f = 0xff;
  b = 0;
  c = 0;
  d = 0;
  e = 0;
  h = 0;
  l = 0;
  a_ = 0;
  f_ = 0;
  b_ = 0;
  c_ = 0;
  d_ = 0;
  e_ = 0;
  h_ = 0;
  l_ = 0;
  ix = 0;
  iy = 0;
  sp = 0xffff;
  pc = 0;
  i = 0;
  r = 0;
  wz = 0; // MEMPTR
  iff1 = false;
  iff2 = false;
  im = 0;
  halted = false;
  /** true right after EI: interrupts are not sampled until the next instruction */
  eiDelay = false;

  /** level-triggered maskable interrupt line */
  intLine = false;
  /** data bus value supplied during interrupt acknowledge (IM0/IM2 vector) */
  irqVector = 0xff;
  private nmiPending = false;

  constructor(private bus: Z80Bus) {}

  reset(): void {
    this.pc = 0;
    this.sp = 0xffff;
    this.a = 0xff;
    this.f = 0xff;
    this.i = 0;
    this.r = 0;
    this.im = 0;
    this.iff1 = this.iff2 = false;
    this.halted = false;
    this.eiDelay = false;
    this.intLine = false;
    this.nmiPending = false;
    this.wz = 0;
  }

  nmi(): void {
    this.nmiPending = true;
  }

  // ---- register pair helpers -------------------------------------------
  get bc(): number {
    return (this.b << 8) | this.c;
  }
  set bc(v: number) {
    this.b = (v >> 8) & 0xff;
    this.c = v & 0xff;
  }
  get de(): number {
    return (this.d << 8) | this.e;
  }
  set de(v: number) {
    this.d = (v >> 8) & 0xff;
    this.e = v & 0xff;
  }
  get hl(): number {
    return (this.h << 8) | this.l;
  }
  set hl(v: number) {
    this.h = (v >> 8) & 0xff;
    this.l = v & 0xff;
  }
  get af(): number {
    return (this.a << 8) | this.f;
  }
  set af(v: number) {
    this.a = (v >> 8) & 0xff;
    this.f = v & 0xff;
  }

  // ---- memory helpers ---------------------------------------------------
  private rd(addr: number): number {
    return this.bus.read8(addr & 0xffff) & 0xff;
  }
  private wr(addr: number, v: number): void {
    this.bus.write8(addr & 0xffff, v & 0xff);
  }
  private rd16(addr: number): number {
    return this.rd(addr) | (this.rd(addr + 1) << 8);
  }
  private wr16(addr: number, v: number): void {
    this.wr(addr, v & 0xff);
    this.wr(addr + 1, (v >> 8) & 0xff);
  }
  private fetch(): number {
    const v = this.rd(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }
  private fetch16(): number {
    const lo = this.fetch();
    return lo | (this.fetch() << 8);
  }
  private push16(v: number): void {
    this.sp = (this.sp - 2) & 0xffff;
    this.wr16(this.sp, v);
  }
  private pop16(): number {
    const v = this.rd16(this.sp);
    this.sp = (this.sp + 2) & 0xffff;
    return v;
  }
  private incR(): void {
    this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f);
  }

  // ---- ALU helpers ------------------------------------------------------
  private add8(v: number, carry: number): void {
    const a = this.a;
    const res = a + v + carry;
    const r8 = res & 0xff;
    this.f =
      (r8 & (FS | FXY)) |
      (r8 === 0 ? FZ : 0) |
      ((a ^ v ^ r8) & FH) |
      ((((a ^ v ^ 0xff) & (a ^ r8)) >> 5) & FP) |
      (res > 0xff ? FC : 0);
    this.a = r8;
  }

  private sub8(v: number, carry: number, keepA = false): number {
    const a = this.a;
    const res = a - v - carry;
    const r8 = res & 0xff;
    this.f =
      (r8 & (FS | FXY)) |
      (r8 === 0 ? FZ : 0) |
      ((a ^ v ^ r8) & FH) |
      ((((a ^ r8) & (a ^ v)) >> 5) & FP) |
      FN |
      (res < 0 ? FC : 0);
    if (!keepA) this.a = r8;
    return r8;
  }

  private and8(v: number): void {
    this.a &= v;
    this.f = SZP[this.a]! | FH;
  }
  private or8(v: number): void {
    this.a |= v;
    this.f = SZP[this.a]!;
  }
  private xor8(v: number): void {
    this.a ^= v;
    this.f = SZP[this.a]!;
  }

  private inc8v(v: number): number {
    const r8 = (v + 1) & 0xff;
    this.f =
      (this.f & FC) |
      (r8 & (FS | FXY)) |
      (r8 === 0 ? FZ : 0) |
      ((r8 & 0x0f) === 0 ? FH : 0) |
      (r8 === 0x80 ? FP : 0);
    return r8;
  }
  private dec8v(v: number): number {
    const r8 = (v - 1) & 0xff;
    this.f =
      (this.f & FC) |
      (r8 & (FS | FXY)) |
      (r8 === 0 ? FZ : 0) |
      ((r8 & 0x0f) === 0x0f ? FH : 0) |
      (r8 === 0x7f ? FP : 0) |
      FN;
    return r8;
  }

  private add16(x: number, y: number): number {
    this.wz = (x + 1) & 0xffff;
    const res = x + y;
    this.f =
      (this.f & (FS | FZ | FP)) |
      (((x ^ y ^ res) >> 8) & FH) |
      ((res >> 8) & FXY) |
      (res > 0xffff ? FC : 0);
    return res & 0xffff;
  }

  private adc16(y: number): void {
    const x = this.hl;
    this.wz = (x + 1) & 0xffff;
    const res = x + y + (this.f & FC);
    const r16 = res & 0xffff;
    this.f =
      ((r16 >> 8) & (FS | FXY)) |
      (r16 === 0 ? FZ : 0) |
      (((x ^ y ^ r16) >> 8) & FH) |
      ((((x ^ r16) & (y ^ r16 ^ 0xffff)) >> 13) & FP) |
      (res > 0xffff ? FC : 0);
    this.hl = r16;
  }

  private sbc16(y: number): void {
    const x = this.hl;
    this.wz = (x + 1) & 0xffff;
    const res = x - y - (this.f & FC);
    const r16 = res & 0xffff;
    this.f =
      ((r16 >> 8) & (FS | FXY)) |
      (r16 === 0 ? FZ : 0) |
      (((x ^ y ^ r16) >> 8) & FH) |
      ((((x ^ r16) & (x ^ y)) >> 13) & FP) |
      FN |
      (res < 0 ? FC : 0);
    this.hl = r16;
  }

  // CB-prefix rotate/shift helpers (full flags)
  private rot(op: number, v: number): number {
    let r8: number;
    let c: number;
    switch (op) {
      case 0: // RLC
        c = v >> 7;
        r8 = ((v << 1) | c) & 0xff;
        break;
      case 1: // RRC
        c = v & 1;
        r8 = ((v >> 1) | (c << 7)) & 0xff;
        break;
      case 2: // RL
        c = v >> 7;
        r8 = ((v << 1) | (this.f & FC)) & 0xff;
        break;
      case 3: // RR
        c = v & 1;
        r8 = ((v >> 1) | ((this.f & FC) << 7)) & 0xff;
        break;
      case 4: // SLA
        c = v >> 7;
        r8 = (v << 1) & 0xff;
        break;
      case 5: // SRA
        c = v & 1;
        r8 = ((v >> 1) | (v & 0x80)) & 0xff;
        break;
      case 6: // SLL (undocumented: shifts in 1)
        c = v >> 7;
        r8 = ((v << 1) | 1) & 0xff;
        break;
      default: // SRL
        c = v & 1;
        r8 = v >> 1;
        break;
    }
    this.f = SZP[r8]! | (c ? FC : 0);
    return r8;
  }

  private daa(): void {
    let a = this.a;
    let adjust = 0;
    let carry = this.f & FC;
    if ((this.f & FH) !== 0 || (a & 0x0f) > 9) adjust = 0x06;
    if (carry !== 0 || a > 0x99) {
      adjust |= 0x60;
      carry = FC;
    }
    const h = this.f & FN ? ((this.f & FH) !== 0 && (a & 0x0f) < 6 ? FH : 0) : (a & 0x0f) > 9 ? FH : 0;
    a = this.f & FN ? (a - adjust) & 0xff : (a + adjust) & 0xff;
    this.f = SZP[a]! | (this.f & FN) | h | carry;
    this.a = a;
  }

  // ---- condition codes ----------------------------------------------------
  private cond(cc: number): boolean {
    switch (cc) {
      case 0:
        return (this.f & FZ) === 0; // NZ
      case 1:
        return (this.f & FZ) !== 0; // Z
      case 2:
        return (this.f & FC) === 0; // NC
      case 3:
        return (this.f & FC) !== 0; // C
      case 4:
        return (this.f & FP) === 0; // PO
      case 5:
        return (this.f & FP) !== 0; // PE
      case 6:
        return (this.f & FS) === 0; // P
      default:
        return (this.f & FS) !== 0; // M
    }
  }

  // ---- register access by index (0=B..7=A), respecting DD/FD prefix ------
  // prefix: 0 = none, 1 = DD (IX), 2 = FD (IY)
  private getReg(idx: number, prefix: number): number {
    switch (idx) {
      case 0:
        return this.b;
      case 1:
        return this.c;
      case 2:
        return this.d;
      case 3:
        return this.e;
      case 4:
        return prefix === 1 ? this.ix >> 8 : prefix === 2 ? this.iy >> 8 : this.h;
      case 5:
        return prefix === 1 ? this.ix & 0xff : prefix === 2 ? this.iy & 0xff : this.l;
      default:
        return this.a;
    }
  }
  private setReg(idx: number, prefix: number, v: number): void {
    switch (idx) {
      case 0:
        this.b = v;
        break;
      case 1:
        this.c = v;
        break;
      case 2:
        this.d = v;
        break;
      case 3:
        this.e = v;
        break;
      case 4:
        if (prefix === 1) this.ix = (this.ix & 0xff) | (v << 8);
        else if (prefix === 2) this.iy = (this.iy & 0xff) | (v << 8);
        else this.h = v;
        break;
      case 5:
        if (prefix === 1) this.ix = (this.ix & 0xff00) | v;
        else if (prefix === 2) this.iy = (this.iy & 0xff00) | v;
        else this.l = v;
        break;
      default:
        this.a = v;
        break;
    }
  }

  private getPair(idx: number, prefix: number): number {
    switch (idx) {
      case 0:
        return this.bc;
      case 1:
        return this.de;
      case 2:
        return prefix === 1 ? this.ix : prefix === 2 ? this.iy : this.hl;
      default:
        return this.sp;
    }
  }
  private setPair(idx: number, prefix: number, v: number): void {
    switch (idx) {
      case 0:
        this.bc = v;
        break;
      case 1:
        this.de = v;
        break;
      case 2:
        if (prefix === 1) this.ix = v;
        else if (prefix === 2) this.iy = v;
        else this.hl = v;
        break;
      default:
        this.sp = v;
        break;
    }
  }

  // ---- interrupt handling -------------------------------------------------
  /** Check and take pending interrupts. Returns cycles consumed (0 if none). */
  private checkInterrupts(): number {
    if (this.nmiPending) {
      this.nmiPending = false;
      this.halted = false;
      this.iff1 = false;
      this.incR();
      this.push16(this.pc);
      this.pc = 0x66;
      this.wz = 0x66;
      return 11;
    }
    if (this.intLine && this.iff1 && !this.eiDelay) {
      this.halted = false;
      this.iff1 = this.iff2 = false;
      this.incR();
      if (this.im === 2) {
        this.push16(this.pc);
        const addr = (this.i << 8) | this.irqVector;
        this.pc = this.rd16(addr);
        this.wz = this.pc;
        return 19;
      }
      // IM 0 with 0xff on the bus behaves like RST 38h; IM 1 is RST 38h.
      this.push16(this.pc);
      this.pc = 0x38;
      this.wz = 0x38;
      return 13;
    }
    return 0;
  }

  /** Execute one instruction (or take an interrupt). Returns cycles. */
  step(): number {
    const icycles = this.checkInterrupts();
    if (icycles > 0) return icycles;
    this.eiDelay = false;
    if (this.halted) {
      this.incR();
      return 4;
    }
    this.incR();
    return this.execute(this.fetch(), 0);
  }

  // ---- main decode ---------------------------------------------------------
  private execute(op: number, prefix: number): number {
    // 0x40..0x7f: LD r,r' / HALT
    if (op >= 0x40 && op <= 0x7f) {
      if (op === 0x76) {
        this.halted = true;
        return 4;
      }
      const dst = (op >> 3) & 7;
      const src = op & 7;
      if (src === 6) {
        // LD r,(HL) / LD r,(IX+d) — dst uses the *unprefixed* register
        if (prefix === 0) {
          this.setReg(dst, 0, this.rd(this.hl));
          return 7;
        }
        const addr = this.indexedAddr(prefix);
        this.setReg(dst, 0, this.rd(addr));
        return 19;
      }
      if (dst === 6) {
        if (prefix === 0) {
          this.wr(this.hl, this.getReg(src, 0));
          return 7;
        }
        const addr = this.indexedAddr(prefix);
        this.wr(addr, this.getReg(src, 0));
        return 19;
      }
      this.setReg(dst, prefix, this.getReg(src, prefix));
      return 4;
    }

    // 0x80..0xbf: ALU A,r
    if (op >= 0x80 && op <= 0xbf) {
      const aluOp = (op >> 3) & 7;
      const src = op & 7;
      let v: number;
      let cycles = 4;
      if (src === 6) {
        if (prefix === 0) {
          v = this.rd(this.hl);
          cycles = 7;
        } else {
          v = this.rd(this.indexedAddr(prefix));
          cycles = 19;
        }
      } else {
        v = this.getReg(src, prefix);
      }
      this.alu(aluOp, v);
      return cycles;
    }

    switch (op) {
      // --- 0x00-0x3f ---
      case 0x00:
        return 4; // NOP
      case 0x01:
      case 0x11:
      case 0x21:
      case 0x31: {
        this.setPair((op >> 4) & 3, prefix, this.fetch16());
        return prefix ? 14 : 10;
      }
      case 0x02:
        this.wr(this.bc, this.a);
        this.wz = ((this.bc + 1) & 0xff) | (this.a << 8);
        return 7;
      case 0x12:
        this.wr(this.de, this.a);
        this.wz = ((this.de + 1) & 0xff) | (this.a << 8);
        return 7;
      case 0x0a:
        this.a = this.rd(this.bc);
        this.wz = (this.bc + 1) & 0xffff;
        return 7;
      case 0x1a:
        this.a = this.rd(this.de);
        this.wz = (this.de + 1) & 0xffff;
        return 7;
      case 0x22: {
        const addr = this.fetch16();
        this.wr16(addr, this.getPair(2, prefix));
        this.wz = (addr + 1) & 0xffff;
        return prefix ? 20 : 16;
      }
      case 0x2a: {
        const addr = this.fetch16();
        this.setPair(2, prefix, this.rd16(addr));
        this.wz = (addr + 1) & 0xffff;
        return prefix ? 20 : 16;
      }
      case 0x32: {
        const addr = this.fetch16();
        this.wr(addr, this.a);
        this.wz = ((addr + 1) & 0xff) | (this.a << 8);
        return 13;
      }
      case 0x3a: {
        const addr = this.fetch16();
        this.a = this.rd(addr);
        this.wz = (addr + 1) & 0xffff;
        return 13;
      }
      case 0x03:
      case 0x13:
      case 0x23:
      case 0x33: {
        const p = (op >> 4) & 3;
        this.setPair(p, prefix, (this.getPair(p, prefix) + 1) & 0xffff);
        return prefix ? 10 : 6;
      }
      case 0x0b:
      case 0x1b:
      case 0x2b:
      case 0x3b: {
        const p = (op >> 4) & 3;
        this.setPair(p, prefix, (this.getPair(p, prefix) - 1) & 0xffff);
        return prefix ? 10 : 6;
      }
      case 0x04:
      case 0x0c:
      case 0x14:
      case 0x1c:
      case 0x24:
      case 0x2c:
      case 0x3c: {
        const idx = (op >> 3) & 7;
        this.setReg(idx, prefix, this.inc8v(this.getReg(idx, prefix)));
        return prefix ? 8 : 4;
      }
      case 0x34: {
        if (prefix === 0) {
          this.wr(this.hl, this.inc8v(this.rd(this.hl)));
          return 11;
        }
        const addr = this.indexedAddr(prefix);
        this.wr(addr, this.inc8v(this.rd(addr)));
        return 23;
      }
      case 0x05:
      case 0x0d:
      case 0x15:
      case 0x1d:
      case 0x25:
      case 0x2d:
      case 0x3d: {
        const idx = (op >> 3) & 7;
        this.setReg(idx, prefix, this.dec8v(this.getReg(idx, prefix)));
        return prefix ? 8 : 4;
      }
      case 0x35: {
        if (prefix === 0) {
          this.wr(this.hl, this.dec8v(this.rd(this.hl)));
          return 11;
        }
        const addr = this.indexedAddr(prefix);
        this.wr(addr, this.dec8v(this.rd(addr)));
        return 23;
      }
      case 0x06:
      case 0x0e:
      case 0x16:
      case 0x1e:
      case 0x26:
      case 0x2e:
      case 0x3e: {
        const idx = (op >> 3) & 7;
        this.setReg(idx, prefix, this.fetch());
        return prefix ? 11 : 7;
      }
      case 0x36: {
        if (prefix === 0) {
          this.wr(this.hl, this.fetch());
          return 10;
        }
        const addr = this.indexedAddr(prefix);
        this.wr(addr, this.fetch());
        return 19;
      }
      case 0x07: {
        // RLCA
        const c = this.a >> 7;
        this.a = ((this.a << 1) | c) & 0xff;
        this.f = (this.f & (FS | FZ | FP)) | (this.a & FXY) | (c ? FC : 0);
        return 4;
      }
      case 0x0f: {
        // RRCA
        const c = this.a & 1;
        this.a = ((this.a >> 1) | (c << 7)) & 0xff;
        this.f = (this.f & (FS | FZ | FP)) | (this.a & FXY) | (c ? FC : 0);
        return 4;
      }
      case 0x17: {
        // RLA
        const c = this.a >> 7;
        this.a = ((this.a << 1) | (this.f & FC)) & 0xff;
        this.f = (this.f & (FS | FZ | FP)) | (this.a & FXY) | (c ? FC : 0);
        return 4;
      }
      case 0x1f: {
        // RRA
        const c = this.a & 1;
        this.a = ((this.a >> 1) | ((this.f & FC) << 7)) & 0xff;
        this.f = (this.f & (FS | FZ | FP)) | (this.a & FXY) | (c ? FC : 0);
        return 4;
      }
      case 0x08: {
        // EX AF,AF'
        const t = this.af;
        this.af = (this.a_ << 8) | this.f_;
        this.a_ = (t >> 8) & 0xff;
        this.f_ = t & 0xff;
        return 4;
      }
      case 0x09:
      case 0x19:
      case 0x29:
      case 0x39: {
        const y = this.getPair((op >> 4) & 3, prefix);
        this.setPair(2, prefix, this.add16(this.getPair(2, prefix), y));
        return prefix ? 15 : 11;
      }
      case 0x10: {
        // DJNZ
        const d = this.fetch();
        this.b = (this.b - 1) & 0xff;
        if (this.b !== 0) {
          this.pc = (this.pc + ((d << 24) >> 24)) & 0xffff;
          this.wz = this.pc;
          return 13;
        }
        return 8;
      }
      case 0x18: {
        // JR
        const d = this.fetch();
        this.pc = (this.pc + ((d << 24) >> 24)) & 0xffff;
        this.wz = this.pc;
        return 12;
      }
      case 0x20:
      case 0x28:
      case 0x30:
      case 0x38: {
        // JR cc
        const d = this.fetch();
        if (this.cond((op >> 3) & 3)) {
          this.pc = (this.pc + ((d << 24) >> 24)) & 0xffff;
          this.wz = this.pc;
          return 12;
        }
        return 7;
      }
      case 0x27:
        this.daa();
        return 4;
      case 0x2f: // CPL
        this.a ^= 0xff;
        this.f = (this.f & (FS | FZ | FP | FC)) | FH | FN | (this.a & FXY);
        return 4;
      case 0x37: // SCF
        this.f = (this.f & (FS | FZ | FP)) | FC | (this.a & FXY);
        return 4;
      case 0x3f: // CCF
        this.f =
          ((this.f & (FS | FZ | FP | FC)) ^ FC) | ((this.f & FC) !== 0 ? FH : 0) | (this.a & FXY);
        return 4;

      // --- 0xc0-0xff ---
      case 0xc0:
      case 0xc8:
      case 0xd0:
      case 0xd8:
      case 0xe0:
      case 0xe8:
      case 0xf0:
      case 0xf8: {
        // RET cc
        if (this.cond((op >> 3) & 7)) {
          this.pc = this.pop16();
          this.wz = this.pc;
          return 11;
        }
        return 5;
      }
      case 0xc9:
        this.pc = this.pop16();
        this.wz = this.pc;
        return 10;
      case 0xc1:
      case 0xd1:
      case 0xe1: {
        this.setPair((op >> 4) & 3, prefix, this.pop16());
        return prefix ? 14 : 10;
      }
      case 0xf1:
        this.af = this.pop16();
        return 10;
      case 0xc5:
      case 0xd5:
      case 0xe5: {
        this.push16(this.getPair((op >> 4) & 3, prefix));
        return prefix ? 15 : 11;
      }
      case 0xf5:
        this.push16(this.af);
        return 11;
      case 0xc2:
      case 0xca:
      case 0xd2:
      case 0xda:
      case 0xe2:
      case 0xea:
      case 0xf2:
      case 0xfa: {
        // JP cc,nn
        const addr = this.fetch16();
        this.wz = addr;
        if (this.cond((op >> 3) & 7)) this.pc = addr;
        return 10;
      }
      case 0xc3:
        this.pc = this.fetch16();
        this.wz = this.pc;
        return 10;
      case 0xc4:
      case 0xcc:
      case 0xd4:
      case 0xdc:
      case 0xe4:
      case 0xec:
      case 0xf4:
      case 0xfc: {
        // CALL cc,nn
        const addr = this.fetch16();
        this.wz = addr;
        if (this.cond((op >> 3) & 7)) {
          this.push16(this.pc);
          this.pc = addr;
          return 17;
        }
        return 10;
      }
      case 0xcd: {
        const addr = this.fetch16();
        this.wz = addr;
        this.push16(this.pc);
        this.pc = addr;
        return 17;
      }
      case 0xc6:
      case 0xce:
      case 0xd6:
      case 0xde:
      case 0xe6:
      case 0xee:
      case 0xf6:
      case 0xfe: {
        this.alu((op >> 3) & 7, this.fetch());
        return 7;
      }
      case 0xc7:
      case 0xcf:
      case 0xd7:
      case 0xdf:
      case 0xe7:
      case 0xef:
      case 0xf7:
      case 0xff: {
        // RST
        this.push16(this.pc);
        this.pc = op & 0x38;
        this.wz = this.pc;
        return 11;
      }
      case 0xd3: {
        // OUT (n),A
        const n = this.fetch();
        const port = n | (this.a << 8);
        this.bus.ioWrite(port, this.a);
        this.wz = ((n + 1) & 0xff) | (this.a << 8);
        return 11;
      }
      case 0xdb: {
        // IN A,(n)
        const n = this.fetch();
        const port = n | (this.a << 8);
        this.a = this.bus.ioRead(port) & 0xff;
        this.wz = (port + 1) & 0xffff;
        return 11;
      }
      case 0xd9: {
        // EXX
        let t = this.bc;
        this.bc = (this.b_ << 8) | this.c_;
        this.b_ = (t >> 8) & 0xff;
        this.c_ = t & 0xff;
        t = this.de;
        this.de = (this.d_ << 8) | this.e_;
        this.d_ = (t >> 8) & 0xff;
        this.e_ = t & 0xff;
        t = this.hl;
        this.hl = (this.h_ << 8) | this.l_;
        this.h_ = (t >> 8) & 0xff;
        this.l_ = t & 0xff;
        return 4;
      }
      case 0xe3: {
        // EX (SP),HL / IX / IY
        const t = this.rd16(this.sp);
        this.wr16(this.sp, this.getPair(2, prefix));
        this.setPair(2, prefix, t);
        this.wz = t;
        return prefix ? 23 : 19;
      }
      case 0xe9:
        this.pc = this.getPair(2, prefix);
        return prefix ? 8 : 4;
      case 0xeb: {
        // EX DE,HL (not affected by DD/FD)
        const t = this.de;
        this.de = this.hl;
        this.hl = t;
        return 4;
      }
      case 0xf3:
        this.iff1 = this.iff2 = false;
        return 4;
      case 0xfb:
        this.iff1 = this.iff2 = true;
        this.eiDelay = true;
        return 4;
      case 0xf9:
        this.sp = this.getPair(2, prefix);
        return prefix ? 10 : 6;

      case 0xcb:
        return prefix === 0 ? this.executeCB() : this.executeDDCB(prefix);
      case 0xdd:
        this.incR();
        return 4 + this.execute(this.fetch(), 1);
      case 0xfd:
        this.incR();
        return 4 + this.execute(this.fetch(), 2);
      case 0xed:
        this.incR();
        return this.executeED();

      default:
        return 4;
    }
  }

  private alu(op: number, v: number): void {
    switch (op) {
      case 0:
        this.add8(v, 0);
        break;
      case 1:
        this.add8(v, this.f & FC);
        break;
      case 2:
        this.sub8(v, 0);
        break;
      case 3:
        this.sub8(v, this.f & FC);
        break;
      case 4:
        this.and8(v);
        break;
      case 5:
        this.xor8(v);
        break;
      case 6:
        this.or8(v);
        break;
      default: {
        // CP: X/Y come from the *operand*, not the result
        this.sub8(v, 0, true);
        this.f = (this.f & ~FXY) | (v & FXY);
        break;
      }
    }
  }

  private indexedAddr(prefix: number): number {
    const d = (this.fetch() << 24) >> 24;
    const base = prefix === 1 ? this.ix : this.iy;
    const addr = (base + d) & 0xffff;
    this.wz = addr;
    return addr;
  }

  // ---- CB prefix -----------------------------------------------------------
  private executeCB(): number {
    this.incR();
    const op = this.fetch();
    const kind = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    if (kind === 0) {
      // rotate/shift
      if (z === 6) {
        this.wr(this.hl, this.rot(y, this.rd(this.hl)));
        return 15;
      }
      this.setReg(z, 0, this.rot(y, this.getReg(z, 0)));
      return 8;
    }
    if (kind === 1) {
      // BIT y,r
      const v = z === 6 ? this.rd(this.hl) : this.getReg(z, 0);
      const t = v & (1 << y);
      this.f =
        (this.f & FC) |
        FH |
        (t === 0 ? FZ | FP : 0) |
        (t & FS) |
        (z === 6 ? (this.wz >> 8) & FXY : v & FXY);
      return z === 6 ? 12 : 8;
    }
    // RES/SET
    const mask = 1 << y;
    if (z === 6) {
      const v = this.rd(this.hl);
      this.wr(this.hl, kind === 2 ? v & ~mask : v | mask);
      return 15;
    }
    const v = this.getReg(z, 0);
    this.setReg(z, 0, kind === 2 ? v & ~mask : v | mask);
    return 8;
  }

  // DD CB d op — displacement comes *before* the opcode
  private executeDDCB(prefix: number): number {
    const addr = this.indexedAddr(prefix);
    const op = this.fetch();
    const kind = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    if (kind === 1) {
      // BIT y,(IX+d) — X/Y from high byte of the effective address
      const v = this.rd(addr);
      const t = v & (1 << y);
      this.f = (this.f & FC) | FH | (t === 0 ? FZ | FP : 0) | (t & FS) | ((addr >> 8) & FXY);
      return 16;
    }
    let v = this.rd(addr);
    if (kind === 0) v = this.rot(y, v);
    else if (kind === 2) v = v & ~(1 << y);
    else v = v | (1 << y);
    this.wr(addr, v);
    if (z !== 6) this.setReg(z, 0, v); // undocumented: result copied to register
    return 19;
  }

  // ---- ED prefix -----------------------------------------------------------
  private executeED(): number {
    const op = this.fetch();
    switch (op) {
      case 0x40:
      case 0x48:
      case 0x50:
      case 0x58:
      case 0x60:
      case 0x68:
      case 0x70:
      case 0x78: {
        // IN r,(C) — ED70 = IN (C) (flags only)
        const v = this.bus.ioRead(this.bc) & 0xff;
        this.wz = (this.bc + 1) & 0xffff;
        if (op !== 0x70) this.setReg((op >> 3) & 7, 0, v);
        this.f = (this.f & FC) | SZP[v]!;
        return 12;
      }
      case 0x41:
      case 0x49:
      case 0x51:
      case 0x59:
      case 0x61:
      case 0x69:
      case 0x71:
      case 0x79: {
        // OUT (C),r — ED71 = OUT (C),0
        const v = op === 0x71 ? 0 : this.getReg((op >> 3) & 7, 0);
        this.bus.ioWrite(this.bc, v);
        this.wz = (this.bc + 1) & 0xffff;
        return 12;
      }
      case 0x42:
      case 0x52:
      case 0x62:
      case 0x72:
        this.sbc16(this.getPair((op >> 4) & 3, 0));
        return 15;
      case 0x4a:
      case 0x5a:
      case 0x6a:
      case 0x7a:
        this.adc16(this.getPair((op >> 4) & 3, 0));
        return 15;
      case 0x43:
      case 0x53:
      case 0x63:
      case 0x73: {
        const addr = this.fetch16();
        this.wr16(addr, this.getPair((op >> 4) & 3, 0));
        this.wz = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x4b:
      case 0x5b:
      case 0x6b:
      case 0x7b: {
        const addr = this.fetch16();
        this.setPair((op >> 4) & 3, 0, this.rd16(addr));
        this.wz = (addr + 1) & 0xffff;
        return 20;
      }
      case 0x44:
      case 0x4c:
      case 0x54:
      case 0x5c:
      case 0x64:
      case 0x6c:
      case 0x74:
      case 0x7c: {
        // NEG
        const a = this.a;
        this.a = 0;
        this.sub8(a, 0);
        return 8;
      }
      case 0x45:
      case 0x55:
      case 0x65:
      case 0x75:
      case 0x4d:
      case 0x5d:
      case 0x6d:
      case 0x7d: {
        // RETN / RETI
        this.iff1 = this.iff2;
        this.pc = this.pop16();
        this.wz = this.pc;
        return 14;
      }
      case 0x46:
      case 0x4e:
      case 0x66:
      case 0x6e:
        this.im = 0;
        return 8;
      case 0x56:
      case 0x76:
        this.im = 1;
        return 8;
      case 0x5e:
      case 0x7e:
        this.im = 2;
        return 8;
      case 0x47:
        this.i = this.a;
        return 9;
      case 0x4f:
        this.r = this.a;
        return 9;
      case 0x57: // LD A,I
        this.a = this.i;
        this.f = (this.f & FC) | (this.a & (FS | FXY)) | (this.a === 0 ? FZ : 0) | (this.iff2 ? FP : 0);
        return 9;
      case 0x5f: // LD A,R
        this.a = this.r;
        this.f = (this.f & FC) | (this.a & (FS | FXY)) | (this.a === 0 ? FZ : 0) | (this.iff2 ? FP : 0);
        return 9;
      case 0x67: {
        // RRD
        const v = this.rd(this.hl);
        this.wr(this.hl, ((this.a << 4) | (v >> 4)) & 0xff);
        this.a = (this.a & 0xf0) | (v & 0x0f);
        this.f = (this.f & FC) | SZP[this.a]!;
        this.wz = (this.hl + 1) & 0xffff;
        return 18;
      }
      case 0x6f: {
        // RLD
        const v = this.rd(this.hl);
        this.wr(this.hl, ((v << 4) | (this.a & 0x0f)) & 0xff);
        this.a = (this.a & 0xf0) | (v >> 4);
        this.f = (this.f & FC) | SZP[this.a]!;
        this.wz = (this.hl + 1) & 0xffff;
        return 18;
      }

      // block transfer / search / io
      case 0xa0:
        return this.ldx(1, false);
      case 0xa8:
        return this.ldx(-1, false);
      case 0xb0:
        return this.ldx(1, true);
      case 0xb8:
        return this.ldx(-1, true);
      case 0xa1:
        return this.cpx(1, false);
      case 0xa9:
        return this.cpx(-1, false);
      case 0xb1:
        return this.cpx(1, true);
      case 0xb9:
        return this.cpx(-1, true);
      case 0xa2:
        return this.inx(1, false);
      case 0xaa:
        return this.inx(-1, false);
      case 0xb2:
        return this.inx(1, true);
      case 0xba:
        return this.inx(-1, true);
      case 0xa3:
        return this.outx(1, false);
      case 0xab:
        return this.outx(-1, false);
      case 0xb3:
        return this.outx(1, true);
      case 0xbb:
        return this.outx(-1, true);

      default:
        return 8; // invalid ED = 2x NOP
    }
  }

  private ldx(dir: number, repeat: number | boolean): number {
    const v = this.rd(this.hl);
    this.wr(this.de, v);
    this.hl = (this.hl + dir) & 0xffff;
    this.de = (this.de + dir) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    const n = (v + this.a) & 0xff;
    this.f =
      (this.f & (FS | FZ | FC)) |
      (this.bc !== 0 ? FP : 0) |
      (n & FX) |
      ((n & 0x02) !== 0 ? FY : 0);
    if (repeat && this.bc !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.wz = (this.pc + 1) & 0xffff;
      return 21;
    }
    return 16;
  }

  private cpx(dir: number, repeat: number | boolean): number {
    const v = this.rd(this.hl);
    const res = (this.a - v) & 0xff;
    const hf = (this.a ^ v ^ res) & FH;
    this.hl = (this.hl + dir) & 0xffff;
    this.bc = (this.bc - 1) & 0xffff;
    this.wz = (this.wz + dir) & 0xffff;
    const n = (res - (hf !== 0 ? 1 : 0)) & 0xff;
    this.f =
      (this.f & FC) |
      FN |
      (res & FS) |
      (res === 0 ? FZ : 0) |
      hf |
      (this.bc !== 0 ? FP : 0) |
      (n & FX) |
      ((n & 0x02) !== 0 ? FY : 0);
    if (repeat && this.bc !== 0 && res !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      this.wz = (this.pc + 1) & 0xffff;
      return 21;
    }
    return 16;
  }

  private inx(dir: number, repeat: number | boolean): number {
    const v = this.bus.ioRead(this.bc) & 0xff;
    this.wz = (this.bc + dir) & 0xffff;
    this.wr(this.hl, v);
    this.b = (this.b - 1) & 0xff;
    this.hl = (this.hl + dir) & 0xffff;
    const k = v + ((this.c + dir) & 0xff);
    this.f =
      (this.b & (FS | FXY)) |
      (this.b === 0 ? FZ : 0) |
      ((v & 0x80) !== 0 ? FN : 0) |
      (k > 0xff ? FH | FC : 0) |
      (SZP[(k & 7) ^ this.b]! & FP);
    if (repeat && this.b !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      return 21;
    }
    return 16;
  }

  private outx(dir: number, repeat: number | boolean): number {
    const v = this.rd(this.hl);
    this.b = (this.b - 1) & 0xff;
    this.bus.ioWrite(this.bc, v);
    this.hl = (this.hl + dir) & 0xffff;
    this.wz = (this.bc + dir) & 0xffff;
    const k = v + this.l;
    this.f =
      (this.b & (FS | FXY)) |
      (this.b === 0 ? FZ : 0) |
      ((v & 0x80) !== 0 ? FN : 0) |
      (k > 0xff ? FH | FC : 0) |
      (SZP[(k & 7) ^ this.b]! & FP);
    if (repeat && this.b !== 0) {
      this.pc = (this.pc - 2) & 0xffff;
      return 21;
    }
    return 16;
  }
}
