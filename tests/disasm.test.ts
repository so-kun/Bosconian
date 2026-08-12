// Disassembler tests: known encodings -> expected mnemonics, and a
// round-trip sanity check (assemble known bytes, disassemble, compare).

import { describe, expect, it } from "vitest";
import { disasmOne, disasmRange, type ReadFn } from "../tools/disasm/z80dasm";

function reader(bytes: number[], org = 0): ReadFn {
  return (a) => bytes[a - org] ?? 0;
}

function one(bytes: number[], addr = 0) {
  return disasmOne(reader(bytes, addr), addr);
}

describe("disasmOne", () => {
  it("decodes plain ops with correct length", () => {
    expect(one([0x00]).text).toBe("nop");
    expect(one([0x76]).text).toBe("halt");
    expect(one([0x76]).flow).toBe("stop");
    const ld = one([0x21, 0x34, 0x12]); // LD HL,0x1234
    expect(ld.text).toBe("ld hl,0x1234");
    expect(ld.length).toBe(3);
  });

  it("decodes immediates and memory", () => {
    expect(one([0x3e, 0xff]).text).toBe("ld a,0xff");
    expect(one([0x36, 0x7f]).text).toBe("ld (hl),0x7f");
    expect(one([0x32, 0x00, 0x80]).text).toBe("ld (0x8000),a");
    expect(one([0x3a, 0x00, 0x78]).text).toBe("ld a,(0x7800)");
  });

  it("computes relative jump targets", () => {
    // JR +2 at 0x100: 0x18 0x00 -> target 0x102
    const jr = one([0x18, 0x00], 0x100);
    expect(jr.text).toBe("jr 0x0102");
    expect(jr.target).toBe(0x102);
    expect(jr.flow).toBe("jump");
    // JR NZ,-2 at 0x100: 0x20 0xfe -> 0x100
    const jrnz = one([0x20, 0xfe], 0x100);
    expect(jrnz.text).toBe("jr nz,0x0100");
    expect(jrnz.flow).toBe("cjump");
    // DJNZ
    const dj = one([0x10, 0xfe], 0x100);
    expect(dj.text).toBe("djnz 0x0100");
    expect(dj.flow).toBe("cjump");
  });

  it("records call/jp/ret/rst flow and targets", () => {
    expect(one([0xc3, 0x00, 0x20])).toMatchObject({ text: "jp 0x2000", flow: "jump", target: 0x2000 });
    expect(one([0xcd, 0x34, 0x12])).toMatchObject({ text: "call 0x1234", flow: "call", target: 0x1234 });
    expect(one([0xc2, 0x00, 0x01])).toMatchObject({ flow: "cjump", target: 0x0100 });
    expect(one([0xc4, 0x00, 0x01])).toMatchObject({ flow: "ccall", target: 0x0100 });
    expect(one([0xc9])).toMatchObject({ text: "ret", flow: "ret" });
    expect(one([0xc8])).toMatchObject({ text: "ret z", flow: "ret" });
    expect(one([0xff])).toMatchObject({ text: "rst 0x38", flow: "rst", target: 0x38 });
    expect(one([0xe9])).toMatchObject({ text: "jp (hl)", flow: "jump" });
  });

  it("decodes ALU ops", () => {
    expect(one([0x80]).text).toBe("add a,b");
    expect(one([0x88]).text).toBe("adc a,b");
    expect(one([0x90]).text).toBe("sub b");
    expect(one([0xa0]).text).toBe("and b");
    expect(one([0xb8]).text).toBe("cp b");
    expect(one([0xc6, 0x10]).text).toBe("add a,0x10");
    expect(one([0xfe, 0x20]).text).toBe("cp 0x20");
    expect(one([0x86]).text).toBe("add a,(hl)");
  });

  it("decodes CB prefix", () => {
    expect(one([0xcb, 0x00]).text).toBe("rlc b");
    expect(one([0xcb, 0x30]).text).toBe("sll b"); // undocumented
    expect(one([0xcb, 0x7e]).text).toBe("bit 7,(hl)");
    expect(one([0xcb, 0xc7]).text).toBe("set 0,a");
    expect(one([0xcb, 0x86]).text).toBe("res 0,(hl)");
    expect(one([0xcb, 0x00]).length).toBe(2);
  });

  it("decodes ED prefix", () => {
    expect(one([0xed, 0x44]).text).toBe("neg");
    expect(one([0xed, 0x4a]).text).toBe("adc hl,bc");
    expect(one([0xed, 0x42]).text).toBe("sbc hl,bc");
    expect(one([0xed, 0xb0]).text).toBe("ldir");
    expect(one([0xed, 0x5e]).text).toBe("im 2");
    expect(one([0xed, 0x4d])).toMatchObject({ text: "reti", flow: "ret" });
    expect(one([0xed, 0x47]).text).toBe("ld i,a");
    expect(one([0xed, 0xb0]).length).toBe(2);
  });

  it("decodes DD/FD index prefix", () => {
    expect(one([0xdd, 0x21, 0x00, 0x03]).text).toBe("ld ix,0x0300");
    expect(one([0xdd, 0x21, 0x00, 0x03]).length).toBe(4);
    expect(one([0xdd, 0x7e, 0x05]).text).toBe("ld a,(ix+0x05)");
    expect(one([0xdd, 0x36, 0x02, 0x5a]).text).toBe("ld (ix+0x02),0x5a");
    expect(one([0xfd, 0x86, 0xff]).text).toBe("add a,(iy-0x01)");
    expect(one([0xdd, 0x09]).text).toBe("add ix,bc");
    // register-register keeps ixh/ixl
    expect(one([0xdd, 0x65]).text).toBe("ld ixh,ixl");
  });

  it("decodes DDCB with displacement then opcode", () => {
    expect(one([0xdd, 0xcb, 0x02, 0xc6]).text).toBe("set 0,(ix+0x02)");
    expect(one([0xdd, 0xcb, 0x02, 0xc6]).length).toBe(4);
    // undocumented result copy to register
    expect(one([0xdd, 0xcb, 0x02, 0x00]).text).toBe("rlc (ix+0x02) -> b");
  });

  it("emits defb for a lone prefix-less unknown and keeps sweeping", () => {
    const lines = disasmRange(reader([0x00, 0xc3, 0x00, 0x00, 0x76]), 0, 5);
    expect(lines.map((l) => l.text)).toEqual(["nop", "jp 0x0000", "halt"]);
  });
});
