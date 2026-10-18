// Procedural Web Audio Synthesizer for Frostplow: Cozy Alpine Brigade
// 100% procedural oscillators & filtered noise — zero external audio file dependencies.

const PENTATONIC_FREQS = [
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.00, // G4
  440.00, // A4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  783.99, // G5
  880.00, // A5
  1046.50, // C6
  1174.66, // D6
  1318.51, // E6
  1567.98, // G6
  1760.00, // A6
];

class CozySynthEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private lastPlowSoundAt: number = 0;
  private plowNoteCounter: number = 0;
  private noiseBuffer: AudioBuffer | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (!this.noiseBuffer && this.ctx) {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.35);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        // Soft pink-ish snow brush noise
        data[i] = (lastOut + 0.08 * white) / 1.08;
        lastOut = data[i];
      }
      this.noiseBuffer = buffer;
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMuted(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  // Light / medium snow-clearing musical chime + soft brush swoosh
  public playSnowPlowChime(comboMultiplier: number, heavyDrift: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = performance.now();
    // Rate limit so plowing 15 tiles in one frame sounds like a fast harp glissando, not clipping
    if (now - this.lastPlowSoundAt < 52) return;
    this.lastPlowSoundAt = now;

    const t = ctx.currentTime;
    const baseIdx = Math.min(
      PENTATONIC_FREQS.length - 1,
      Math.max(0, (comboMultiplier - 1) * 2 + (this.plowNoteCounter % 3))
    );
    this.plowNoteCounter = (this.plowNoteCounter + 1) % 5;

    const jitter = 1 + (Math.random() - 0.5) * 0.03;
    const freq = PENTATONIC_FREQS[baseIdx] * jitter;

    // Warm electric piano / celesta tone
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq * (heavyDrift ? 0.5 : 2.0), t);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(heavyDrift ? 0.14 : 0.05, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(heavyDrift ? 0.16 : 0.11, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + (heavyDrift ? 0.24 : 0.17));

    osc.connect(gain);
    subOsc.connect(subGain);
    subGain.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    subOsc.start(t);
    osc.stop(t + 0.26);
    subOsc.stop(t + 0.26);

    // Subtle snow brush whisper
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(heavyDrift ? 650 : 1200, t);
      filter.Q.setValueAtTime(1.4, t);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.045, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.1);
    }
  }

  // Heavy packed ice block shatter
  public playIceShatter(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Punchy low thud
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(145, t);
    bass.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    bassGain.gain.setValueAtTime(0.24, t);
    bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    bass.connect(bassGain);
    bassGain.connect(ctx.destination);
    bass.start(t);
    bass.stop(t + 0.21);

    // Crystalline high sparkle
    const crystalNotes = [1046.5, 1318.5, 1567.98];
    crystalNotes.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * (1 + (Math.random() - 0.5) * 0.04), t + idx * 0.025);
      g.gain.setValueAtTime(0.08, t + idx * 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.025 + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + idx * 0.025);
      osc.stop(t + idx * 0.025 + 0.19);
    });
  }

  // Cozy cabin driveway liberated chord!
  public playCabinLiberated(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Warm Cmaj9 arpeggio
    const chord = [261.63, 329.63, 392.00, 493.88, 587.33, 783.99];
    chord.forEach((freq, i) => {
      const start = t + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }

  // Upgrade purchased sound
  public playUpgradePurchased(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const notes = [392.0, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const start = t + idx * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, start);

      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.09, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  // Turbo Boost / Salt Ram activation
  public playBoostDash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(290, t + 0.22);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + 0.22);

    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Hot Cocoa pickup sound
  public playCocoaPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, i) => {
      const start = t + i * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }

  // Hazard bump / snow boulder impact
  public playHazardBump(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.linearRampToValueAtTime(65, t + 0.25);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(520, t);

    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // Stage Clear Fanfare
  public playStageClearFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    const melody = [
      { f: 523.25, d: 0.0, len: 0.18 },
      { f: 659.25, d: 0.14, len: 0.18 },
      { f: 783.99, d: 0.28, len: 0.22 },
      { f: 1046.5, d: 0.45, len: 0.65 },
    ];
    melody.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, t + n.d);
      gain.gain.setValueAtTime(0.16, t + n.d);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.d + n.len);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + n.d);
      osc.stop(t + n.d + n.len + 0.02);
    });
  }
}

export const synthAudio = new CozySynthEngine();
