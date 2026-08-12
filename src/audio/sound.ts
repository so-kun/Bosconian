// Procedural sound engine for the native game. No external audio assets: SFX
// are synthesised with the Web Audio API and the voice callouts use the
// browser SpeechSynthesis API, so nothing needs to ship in the repo. Degrades
// silently where those APIs are unavailable (e.g. under test in node).

import type { SfxEvent } from "../game/scene";

type Ctor = typeof AudioContext;

export class SoundEngine {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private lastVoice = 0; // debounce overlapping callouts

  /** Create/resume the AudioContext. Must be called from a user gesture. */
  resume(): void {
    if (!this.enabled) return;
    if (!this.ac) {
      const AC: Ctor | undefined =
        (globalThis as { AudioContext?: Ctor; webkitAudioContext?: Ctor }).AudioContext ??
        (globalThis as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.28;
      this.master.connect(this.ac.destination);
    }
    if (this.ac.state === "suspended") void this.ac.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.28 : 0;
  }

  /** Play a queued cue. */
  play(ev: SfxEvent): void {
    if (!this.enabled) return;
    switch (ev) {
      case "fire": this.blip(720, 0.06, "square", 0.5); break;
      case "explosion": this.noise(0.18, 900); break;
      case "mineExplode": this.noise(0.28, 1600); this.blip(120, 0.2, "sawtooth", 0.6); break;
      case "baseExplode": this.noise(0.5, 2200); this.sweep(300, 40, 0.5); break;
      case "playerHit": this.sweep(500, 60, 0.6, "sawtooth"); this.noise(0.35, 800); break;
      case "alertYellow": this.warble(660, 0.35); this.voice("Alert"); break;
      case "alertRed": this.warble(920, 0.5); this.voice("Condition red"); break;
      case "sectorClear": this.jingle(); this.voice("Sector cleared"); break;
      case "blastOff": this.sweep(200, 900, 0.5, "square"); this.voice("Blast off"); break;
    }
  }

  // --- synthesis primitives -------------------------------------------------

  private env(): { ac: AudioContext; master: GainNode } | null {
    if (!this.ac || !this.master) return null;
    return { ac: this.ac, master: this.master };
  }

  private blip(freq: number, dur: number, type: OscillatorType = "square", gain = 0.5): void {
    const e = this.env(); if (!e) return;
    const { ac, master } = e;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g); g.connect(master);
    osc.start(); osc.stop(ac.currentTime + dur);
  }

  private sweep(from: number, to: number, dur: number, type: OscillatorType = "sine"): void {
    const e = this.env(); if (!e) return;
    const { ac, master } = e;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ac.currentTime + dur);
    g.gain.setValueAtTime(0.5, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g); g.connect(master);
    osc.start(); osc.stop(ac.currentTime + dur);
  }

  private warble(freq: number, dur: number): void {
    const e = this.env(); if (!e) return;
    const { ac, master } = e;
    const osc = ac.createOscillator();
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    const g = ac.createGain();
    osc.type = "square"; osc.frequency.value = freq;
    lfo.frequency.value = 14; lfoGain.gain.value = 80;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    g.gain.setValueAtTime(0.4, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g); g.connect(master);
    osc.start(); lfo.start();
    osc.stop(ac.currentTime + dur); lfo.stop(ac.currentTime + dur);
  }

  private noise(dur: number, cutoff: number): void {
    const e = this.env(); if (!e) return;
    const { ac, master } = e;
    const frames = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, frames, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = cutoff;
    const g = ac.createGain(); g.gain.value = 0.7;
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start();
  }

  private jingle(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.blip(n, 0.12, "square", 0.45), i * 90));
  }

  private voice(text: string): void {
    const now = Date.now();
    if (now - this.lastVoice < 350) return; // avoid stacking callouts
    this.lastVoice = now;
    const synth = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    const Utter = (globalThis as { SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance })
      .SpeechSynthesisUtterance;
    if (!synth || !Utter) return;
    const u = new Utter(text);
    u.rate = 0.95; u.pitch = 0.6; u.volume = 0.9;
    synth.speak(u);
  }
}
