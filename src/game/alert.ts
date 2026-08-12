// Bosconian alert-condition system — original game logic.
//
// The arcade escalates a fleet "condition" as the player provokes the sector:
// GREEN (calm) -> YELLOW ("ALERT", spotted) -> RED ("CONDITION RED", the fleet
// scrambles to hunt you). It de-escalates over time when left alone. Higher
// conditions make the enemy more aggressive and are announced with a callout.

export type Condition = "GREEN" | "YELLOW" | "RED";

const ORDER: Condition[] = ["GREEN", "YELLOW", "RED"];

const COLORS: Record<Condition, [number, number, number]> = {
  GREEN: [80, 220, 90],
  YELLOW: [240, 210, 60],
  RED: [255, 60, 50],
};

export class AlertSystem {
  condition: Condition = "GREEN";
  /** Centre-screen callout text and its remaining lifetime (frames). */
  banner = "";
  bannerTimer = 0;
  bannerColor: [number, number, number] = [255, 255, 255];
  /** Frames the current (non-green) condition holds before stepping down. */
  private hold = 0;

  private level(c: Condition = this.condition): number {
    return ORDER.indexOf(c);
  }

  /** Raise to at least `to`; announces a callout on genuine escalation and
   *  refreshes the hold timer so provocation keeps the condition up. */
  raise(to: Condition, holdFrames: number): boolean {
    const escalated = this.level(to) > this.level();
    if (escalated) {
      this.condition = to;
      this.showBanner(to === "RED" ? "CONDITION RED" : "ALERT", COLORS[to]);
    }
    if (this.level(to) >= this.level()) this.hold = Math.max(this.hold, holdFrames);
    return escalated;
  }

  showBanner(text: string, color: [number, number, number] = [255, 255, 255], frames = 100): void {
    this.banner = text;
    this.bannerColor = color;
    this.bannerTimer = frames;
  }

  update(): void {
    if (this.bannerTimer > 0) this.bannerTimer--;
    if (this.condition === "GREEN") return;
    if (this.hold > 0) {
      this.hold--;
      return;
    }
    // step down one level
    this.condition = ORDER[Math.max(0, this.level() - 1)]!;
    this.hold = this.condition === "GREEN" ? 0 : 180;
  }

  /** Enemy aggression multiplier (spawn cadence / fire rate). */
  aggression(): number {
    return this.condition === "RED" ? 2 : this.condition === "YELLOW" ? 1.4 : 1;
  }

  color(): [number, number, number] {
    return COLORS[this.condition];
  }
}
