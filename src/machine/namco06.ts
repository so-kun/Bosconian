// Namco 06XX bus interface (HLE).
//
// The 06XX multiplexes up to four custom chips onto one CPU bus. Behaviour
// modelled from MAME src/mame/namco/namco06.cpp (BSD-3-Clause):
//   control register: bits[3:0] = chip selects (active high),
//                     bit[4] = R/!W (1 = read), bits[7:5] = clock divider.
//   data read  = AND of read() from all selected chips.
//   data write = write() to all selected chips.
// In read mode with a non-zero divider the chip pulses /NMI on the
// controlling CPU so its handler can clock bytes out one per NMI. We model
// that by asking the machine to fire an NMI every `nmiPeriod` CPU cycles
// while a read transfer is active; the CPU ends the transfer by writing a
// control value with divider bits clear (e.g. 0x10).

export interface Namco06Chip {
  read(): number;
  write(value: number): void;
  /** chip select edge (true = asserted); lets a chip reset its sequence */
  select?(active: boolean): void;
}

export class Namco06 {
  private control = 0;
  private chips: (Namco06Chip | null)[] = [null, null, null, null];
  private nmiCycleAccum = 0;

  /** CPU cycles between NMI pulses while a read transfer is active. */
  constructor(readonly nmiPeriod = 64) {}

  attach(slot: number, chip: Namco06Chip): void {
    this.chips[slot] = chip;
  }

  reset(): void {
    this.control = 0;
    this.nmiCycleAccum = 0;
  }

  ctrlR(): number {
    return this.control;
  }

  ctrlW(value: number): void {
    this.control = value & 0xff;
    this.nmiCycleAccum = 0;
    // notify selected chips of the select edge (reset their read/write seq)
    const active = (this.control & 0xe0) !== 0;
    for (let i = 0; i < 4; i++) {
      const sel = ((this.control >> i) & 1) === 1 && active;
      this.chips[i]?.select?.(sel);
    }
  }

  dataR(): number {
    if ((this.control & 0x10) === 0) return 0xff; // read in write mode
    let result = 0xff;
    for (let i = 0; i < 4; i++) {
      if (((this.control >> i) & 1) === 1 && this.chips[i]) result &= this.chips[i]!.read();
    }
    return result & 0xff;
  }

  dataW(value: number): void {
    if ((this.control & 0x10) !== 0) return; // write in read mode
    for (let i = 0; i < 4; i++) {
      if (((this.control >> i) & 1) === 1) this.chips[i]?.write(value & 0xff);
    }
  }

  /** true while a read transfer is active (divider set + read mode). */
  private readActive(): boolean {
    return (this.control & 0xe0) !== 0 && (this.control & 0x10) !== 0;
  }

  /**
   * Advance the NMI timer by `cycles`. Returns true when an NMI pulse to the
   * controlling CPU is due. The machine calls this after each controlling-CPU
   * instruction and fires cpu.nmi() on true.
   */
  tick(cycles: number): boolean {
    if (!this.readActive()) {
      this.nmiCycleAccum = 0;
      return false;
    }
    this.nmiCycleAccum += cycles;
    if (this.nmiCycleAccum >= this.nmiPeriod) {
      this.nmiCycleAccum -= this.nmiPeriod;
      return true;
    }
    return false;
  }
}
