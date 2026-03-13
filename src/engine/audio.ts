// src/engine/audio.ts
import type { Intensity } from '../state/types';

const GAIN_PRESETS: Record<Intensity, { sfx: number; voice: number; music: number }> = {
  calm: { sfx: 0.4, voice: 0.8, music: 0.3 },
  normal: { sfx: 0.7, voice: 0.8, music: 0.5 },
  hype: { sfx: 0.9, voice: 0.85, music: 0.6 },
};

class SfxSynthesizer {
  private ctx: AudioContext;
  private output: GainNode;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
  }

  play(name: string): void {
    switch (name) {
      case 'correct-chime': this.chime(); break;
      case 'wrong-bonk': this.bonk(); break;
      case 'whoosh': this.whoosh(); break;
      case 'fireball': this.fireball(); break;
      case 'impact': this.impact(); break;
      case 'roar': this.roar(); break;
      case 'pop': this.pop(); break;
      case 'bubble': this.bubble(); break;
      case 'hatch-crack': this.hatchCrack(); break;
      case 'cheer': this.cheer(); break;
      case 'fire-crackle': this.fireCrackle(); break;
      case 'victory-fanfare': this.victoryFanfare(); break;
      case 'star-collect': this.starCollect(); break;
      case 'level-up': this.levelUp(); break;
      case 'word-complete': this.wordComplete(); break;
      case 'pattern-match': this.patternMatch(); break;
      case 'countdown-tick': this.countdownTick(); break;
      case 'whoosh-up': this.whooshUp(); break;
      case 'merge': this.merge(); break;
      case 'transition-whoosh': this.transitionWhoosh(); break;
      case 'button-press': this.buttonPress(); break;
      case 'confetti-pop': this.confettiPop(); break;
      case 'streak-chime': this.streakChime(); break;
      case 'encouragement-warm': this.encouragementWarm(); break;
      case 'card-flip': this.cardFlip(); break;
      case 'card-match': this.cardMatch(); break;
      case 'card-mismatch': this.cardMismatch(); break;
      case 'power-surge': this.powerSurge(); break;
      case 'mega-celebration': this.megaCelebration(); break;
      case 'combo-hit': this.comboHit(); break;
      case 'session-start': this.sessionStart(); break;
      case 'achievement-unlock': this.achievementUnlock(); break;
      case 'evolution-sparkle': this.evolutionSparkle(); break;
    }
  }

  // --- Helper methods ---

  private tone(freq: number, startTime: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.output);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  private noise(startTime: number, duration: number, volume: number): void {
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    source.connect(gain);
    gain.connect(this.output);
    source.start(startTime);
    source.stop(startTime + duration + 0.05);
  }

  // --- Sound effect methods ---

  /** Two ascending sine tones: C5 then E5 */
  private chime(): void {
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.12, 0.3);        // C5
    this.tone(659, t + 0.12, 0.12, 0.3); // E5
  }

  /** Soft low-pitched boop — gentle enough for young children */
  private bonk(): void {
    const t = this.ctx.currentTime;
    this.tone(200, t, 0.1, 0.15, 'sine');
  }

  /** White noise through a highpass filter sweeping 2000Hz→500Hz over 200ms */
  private whoosh(): void {
    const t = this.ctx.currentTime;
    const duration = 0.2;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.linearRampToValueAtTime(500, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  /** Noise burst (50ms) plus descending sine (800→200Hz over 300ms) */
  private fireball(): void {
    const t = this.ctx.currentTime;
    // Noise burst
    this.noise(t, 0.05, 0.3);
    // Descending sine
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /** Short noise burst (50ms) + low sine thud (80Hz, 100ms) */
  private impact(): void {
    const t = this.ctx.currentTime;
    this.noise(t, 0.05, 0.3);
    this.tone(80, t, 0.1, 0.3);
  }

  /** Layered sawtooth 100Hz + white noise, 500ms, with vibrato (6Hz LFO, depth 20Hz) */
  private roar(): void {
    const t = this.ctx.currentTime;
    const duration = 0.5;

    // Sawtooth oscillator with vibrato
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);

    // LFO for vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 6;
    lfoGain.gain.value = 20;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.25, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(oscGain);
    oscGain.connect(this.output);

    // White noise layer
    this.noise(t, duration, 0.15);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + duration + 0.05);
    osc.stop(t + duration + 0.05);
  }

  /** Very short sine ping (880Hz, 40ms, fast attack/decay) */
  private pop(): void {
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.04, 0.3);
  }

  /** Frequency-modulated sine: 300Hz base with 5Hz modulation depth +/-50Hz, 200ms */
  private bubble(): void {
    const t = this.ctx.currentTime;
    const duration = 0.2;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);

    // FM modulator
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    mod.type = 'sine';
    mod.frequency.value = 5;
    modGain.gain.value = 50;
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.output);

    mod.start(t);
    osc.start(t);
    mod.stop(t + duration + 0.05);
    osc.stop(t + duration + 0.05);
  }

  /** 3 rapid noise crackles: 30ms bursts at 0ms, 60ms, and 120ms offsets */
  private hatchCrack(): void {
    const t = this.ctx.currentTime;
    this.noise(t, 0.03, 0.3);
    this.noise(t + 0.06, 0.03, 0.3);
    this.noise(t + 0.12, 0.03, 0.3);
  }

  /** Three ascending chimes: C5, E5, G5, 80ms each */
  private cheer(): void {
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.08, 0.3);          // C5
    this.tone(659, t + 0.08, 0.08, 0.3);   // E5
    this.tone(784, t + 0.16, 0.08, 0.3);   // G5
  }

  /** Short filtered noise burst (100ms) for ambient fire */
  private fireCrackle(): void {
    const t = this.ctx.currentTime;
    const duration = 0.1;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;
    filter.Q.value = 0.5;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  /** Triumphant 4-note ascending melody: C5→E5→G5→C6 for milestone achievements */
  private victoryFanfare(): void {
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.15, 0.25, 'triangle');          // C5
    this.tone(659, t + 0.13, 0.15, 0.25, 'triangle');   // E5
    this.tone(784, t + 0.26, 0.15, 0.25, 'triangle');   // G5
    this.tone(1047, t + 0.39, 0.25, 0.25, 'triangle');  // C6 held longer
  }

  /** Quick sparkly ping: A6 then C7 for earning a star */
  private starCollect(): void {
    const t = this.ctx.currentTime;
    this.tone(1760, t, 0.06, 0.2);         // A6
    this.tone(2093, t + 0.04, 0.05, 0.15); // C7
  }

  /** Ascending arpeggio with shimmer for evolution events: C4→E4→G4→C5→E5 */
  private levelUp(): void {
    const t = this.ctx.currentTime;
    this.tone(262, t, 0.1, 0.25, 'triangle');         // C4
    this.tone(330, t + 0.1, 0.1, 0.25, 'triangle');   // E4
    this.tone(392, t + 0.2, 0.1, 0.25, 'triangle');   // G4
    this.tone(523, t + 0.3, 0.1, 0.25, 'triangle');   // C5
    this.tone(659, t + 0.4, 0.1, 0.25, 'triangle');   // E5
    // High shimmer that fades over the full arpeggio
    this.tone(2000, t, 0.6, 0.08);
  }

  /** Three quick ascending pops for completing a word: E5→G5→B5 */
  private wordComplete(): void {
    const t = this.ctx.currentTime;
    this.tone(659, t, 0.08, 0.2);          // E5
    this.tone(784, t + 0.1, 0.08, 0.2);    // G5 (+20ms gap)
    this.tone(988, t + 0.2, 0.08, 0.2);    // B5 (+20ms gap)
  }

  /** Click-lock sound: short noise burst + sine for pattern completion */
  private patternMatch(): void {
    const t = this.ctx.currentTime;
    this.noise(t, 0.02, 0.15);
    this.tone(440, t + 0.02, 0.1, 0.2);
  }

  /** Subtle tick: very short sine pop for subitizing countdown */
  private countdownTick(): void {
    const t = this.ctx.currentTime;
    this.tone(600, t, 0.03, 0.1);
  }

  /** Ascending whoosh: noise with highpass sweep UP (500→2000Hz) over 150ms */
  private whooshUp(): void {
    const t = this.ctx.currentTime;
    const duration = 0.15;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.linearRampToValueAtTime(2000, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  /** Two tones converging (400→500Hz + 600→500Hz) with noise burst for merging */
  private merge(): void {
    const t = this.ctx.currentTime;
    const duration = 0.2;

    // Tone sliding up from 400→500Hz
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(400, t);
    osc1.frequency.linearRampToValueAtTime(500, t + duration);
    gain1.gain.setValueAtTime(0.2, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc1.connect(gain1);
    gain1.connect(this.output);
    osc1.start(t);
    osc1.stop(t + duration + 0.05);

    // Tone sliding down from 600→500Hz
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(600, t);
    osc2.frequency.linearRampToValueAtTime(500, t + duration);
    gain2.gain.setValueAtTime(0.2, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc2.connect(gain2);
    gain2.connect(this.output);
    osc2.start(t);
    osc2.stop(t + duration + 0.05);

    // Short noise burst at convergence point
    this.noise(t + duration * 0.8, 0.03, 0.15);
  }

  /** Screen transition whoosh: longer noise sweep (300ms), highpass 1500→400Hz */
  private transitionWhoosh(): void {
    const t = this.ctx.currentTime;
    const duration = 0.3;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1500, t);
    filter.frequency.linearRampToValueAtTime(400, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  /** Satisfying button click: short sine 440Hz + noise burst, 60ms */
  private buttonPress(): void {
    const t = this.ctx.currentTime;
    this.tone(440, t, 0.06, 0.2);
    this.noise(t, 0.02, 0.1);
  }

  /** Celebration confetti: ascending noise burst + high sparkle, 150ms */
  private confettiPop(): void {
    const t = this.ctx.currentTime;
    // Ascending noise burst
    const duration = 0.15;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.linearRampToValueAtTime(3000, t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(t);
    source.stop(t + duration + 0.05);

    // High sparkle tone
    this.tone(2400, t + 0.04, 0.08, 0.12);
  }

  /** Multi-answer streak: ascending 4-note C-E-G-C quick arpeggio, 200ms total */
  private streakChime(): void {
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.06, 0.2, 'triangle');          // C5
    this.tone(659, t + 0.05, 0.06, 0.2, 'triangle');   // E5
    this.tone(784, t + 0.10, 0.06, 0.2, 'triangle');   // G5
    this.tone(1047, t + 0.15, 0.08, 0.25, 'triangle'); // C6
  }

  /** Warm encouraging tone for "almost right": gentle C4-E4, 200ms, low volume */
  private encouragementWarm(): void {
    const t = this.ctx.currentTime;
    this.tone(262, t, 0.2, 0.12);         // C4
    this.tone(330, t + 0.05, 0.18, 0.10); // E4
  }

  /** Quick paper-like flip sound: short noise burst with bandpass, 50ms */
  private cardFlip(): void {
    const t = this.ctx.currentTime;
    const duration = 0.05;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.output);
    source.start(t);
    source.stop(t + duration + 0.05);
  }

  /** Harmonious two-note chord for matching cards: C5+E5 together, 200ms */
  private cardMatch(): void {
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.2, 0.2);  // C5
    this.tone(659, t, 0.2, 0.2);  // E5 (simultaneous = chord)
    this.tone(784, t + 0.1, 0.15, 0.15); // G5 delayed sparkle
  }

  /** Soft descending tone for card mismatch: E4→C4, 150ms */
  private cardMismatch(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);   // E4
    osc.frequency.linearRampToValueAtTime(262, t + 0.15); // → C4
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(this.output);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** Rising oscillator with harmonics for power moments, 400ms */
  private powerSurge(): void {
    const t = this.ctx.currentTime;
    // Base rising sine
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(200, t);
    osc1.frequency.exponentialRampToValueAtTime(800, t + 0.4);
    gain1.gain.setValueAtTime(0.15, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc1.connect(gain1);
    gain1.connect(this.output);
    osc1.start(t);
    osc1.stop(t + 0.45);
    // Harmonic layer
    this.tone(400, t + 0.1, 0.2, 0.1, 'triangle');
    this.tone(600, t + 0.2, 0.15, 0.08, 'triangle');
  }

  /** Extended fanfare with multiple tones for mega reward, 800ms */
  private megaCelebration(): void {
    const t = this.ctx.currentTime;
    // Full arpeggio: C4→E4→G4→C5→E5→G5→C6
    const notes = [262, 330, 392, 523, 659, 784, 1047];
    for (let i = 0; i < notes.length; i++) {
      this.tone(notes[i], t + i * 0.08, 0.12, 0.2, 'triangle');
    }
    // Shimmer overlay
    this.tone(2000, t + 0.2, 0.6, 0.06);
    this.tone(3000, t + 0.3, 0.5, 0.04);
  }

  /** Pitched chime that should be called with rising pitch for combos */
  private comboHit(): void {
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.08, 0.2);  // A5
    this.tone(1320, t + 0.04, 0.06, 0.15); // E6
  }

  /** Warm welcoming tone sequence for session start: C4→E4→G4 slow, 600ms */
  private sessionStart(): void {
    const t = this.ctx.currentTime;
    this.tone(262, t, 0.25, 0.15, 'triangle');
    this.tone(330, t + 0.2, 0.25, 0.15, 'triangle');
    this.tone(392, t + 0.4, 0.3, 0.18, 'triangle');
  }

  /** Special distinctive jingle for achievement unlock: quick ascending + descending */
  private achievementUnlock(): void {
    const t = this.ctx.currentTime;
    this.tone(523, t, 0.08, 0.2, 'triangle');         // C5
    this.tone(659, t + 0.07, 0.08, 0.2, 'triangle');  // E5
    this.tone(784, t + 0.14, 0.08, 0.2, 'triangle');  // G5
    this.tone(1047, t + 0.21, 0.12, 0.25, 'triangle'); // C6
    // Sparkle
    this.tone(1568, t + 0.3, 0.15, 0.1);  // G6
    this.tone(2093, t + 0.35, 0.12, 0.08); // C7
  }

  /** Sparkly ascending shimmer for evolution events */
  private evolutionSparkle(): void {
    const t = this.ctx.currentTime;
    const freqs = [800, 1000, 1200, 1500, 1800, 2200];
    for (let i = 0; i < freqs.length; i++) {
      this.tone(freqs[i], t + i * 0.06, 0.08, 0.1 - i * 0.01);
    }
  }
}

class AmbientMusic {
  private ctx: AudioContext;
  private output: GainNode;
  private playing = false;
  private oscillators: OscillatorNode[] = [];
  private gains: GainNode[] = [];
  private intervalId: number | null = null;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;

    // Create a warm pad sound with 3 oscillators
    // Use a pentatonic scale for child-friendly harmony
    // C4, E4, G4 base chord, slowly shifting
    const baseFreqs = [262, 330, 392]; // C4, E4, G4

    for (const freq of baseFreqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.06, this.ctx.currentTime, 2); // Slow fade in
      osc.connect(gain);
      gain.connect(this.output);
      osc.start();
      this.oscillators.push(osc);
      this.gains.push(gain);
    }

    // Slowly shift chord every 10 seconds
    // Pentatonic: C(262), D(294), E(330), G(392), A(440)
    const chords = [
      [262, 330, 392],  // C major
      [294, 392, 440],  // D suspended
      [330, 392, 523],  // E minor feel
      [262, 330, 440],  // Am7 feel
    ];
    let chordIdx = 0;

    this.intervalId = window.setInterval(() => {
      chordIdx = (chordIdx + 1) % chords.length;
      const chord = chords[chordIdx];
      const now = this.ctx.currentTime;
      for (let i = 0; i < this.oscillators.length && i < chord.length; i++) {
        this.oscillators[i].frequency.setTargetAtTime(chord[i], now, 3); // Very slow transition
      }
    }, 10000) as unknown as number;
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    const now = this.ctx.currentTime;
    for (const gain of this.gains) {
      gain.gain.setTargetAtTime(0, now, 1); // Fade out over ~3s
    }
    // Clean up after fade out
    const oscs = this.oscillators;
    const gns = this.gains;
    this.oscillators = [];
    this.gains = [];
    setTimeout(() => {
      for (const osc of oscs) {
        try { osc.stop(); } catch { /* already stopped */ }
      }
    }, 4000);
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  get isPlaying(): boolean { return this.playing; }
}

export class AudioManager {
  private context: AudioContext;
  private masterGain: GainNode;
  private sfxGain: GainNode;
  private voiceGain: GainNode;
  private musicGain: GainNode;
  private synth: SfxSynthesizer;
  private ambient: AmbientMusic;
  private buffers = new Map<string, AudioBuffer>();
  private voiceMap = new Map<string, string>();
  private _unlocked = false;

  constructor() {
    this.context = new AudioContext();

    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);

    this.sfxGain = this.context.createGain();
    this.sfxGain.connect(this.masterGain);

    this.voiceGain = this.context.createGain();
    this.voiceGain.connect(this.masterGain);

    this.musicGain = this.context.createGain();
    this.musicGain.connect(this.masterGain);

    this.synth = new SfxSynthesizer(this.context, this.sfxGain);
    this.ambient = new AmbientMusic(this.context, this.musicGain);

    this.setIntensity('normal');
    this.registerDefaultVoices();
  }

  get unlocked(): boolean {
    return this._unlocked;
  }

  async unlock(): Promise<void> {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this._unlocked = true;
  }

  async loadBuffer(path: string): Promise<void> {
    if (this.buffers.has(path)) return;
    try {
      const response = await fetch(path);
      if (!response.ok) return; // File doesn't exist yet — skip silently
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.buffers.set(path, audioBuffer);
    } catch {
      // Audio file not available — will fall back to speech synthesis or silence
    }
  }

  /**
   * Load an audio file and play it through the voice gain node.
   * Returns true if playback started successfully, false otherwise.
   */
  async playVoiceFile(path: string): Promise<boolean> {
    try {
      await this.loadBuffer(path);
      const buffer = this.buffers.get(path);
      if (!buffer) return false;

      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.voiceGain);
      source.start();
      return true;
    } catch {
      return false;
    }
  }

  playSfx(path: string, options?: { pitch?: number; volume?: number }): void {
    const buffer = this.buffers.get(path);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    if (options?.pitch) source.playbackRate.value = options.pitch;

    if (options?.volume !== undefined) {
      const gainNode = this.context.createGain();
      gainNode.gain.value = options.volume;
      source.connect(gainNode);
      gainNode.connect(this.sfxGain);
    } else {
      source.connect(this.sfxGain);
    }

    source.start();
  }

  playSynth(name: string): void {
    if (!this._unlocked) return;
    this.synth.play(name);
  }

  startMusic(): void {
    if (!this._unlocked) return;
    this.ambient.start();
  }

  stopMusic(): void {
    this.ambient.stop();
  }

  get musicPlaying(): boolean {
    return this.ambient.isPlaying;
  }

  playVoice(key: string): void {
    const path = this.voiceMap.get(key);
    if (path) {
      const buffer = this.buffers.get(path);
      if (buffer) {
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.voiceGain);
        source.start();
        return;
      }
    }
    // Fallback to speech synthesis
    const text = key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    this.speakFallback(text);
  }

  registerVoice(key: string, path: string): void {
    this.voiceMap.set(key, path);
  }

  setIntensity(level: Intensity): void {
    const preset = GAIN_PRESETS[level];
    this.sfxGain.gain.setTargetAtTime(preset.sfx, this.context.currentTime, 0.1);
    this.voiceGain.gain.setTargetAtTime(preset.voice, this.context.currentTime, 0.1);
    this.musicGain.gain.setTargetAtTime(preset.music, this.context.currentTime, 0.1);
  }

  setSilent(silent: boolean): void {
    this.sfxGain.gain.setTargetAtTime(silent ? 0 : GAIN_PRESETS.normal.sfx, this.context.currentTime, 0.1);
    this.musicGain.gain.setTargetAtTime(silent ? 0 : GAIN_PRESETS.normal.music, this.context.currentTime, 0.1);
    // Voice stays audible in silent mode
    this.voiceGain.gain.setTargetAtTime(silent ? 0.8 : GAIN_PRESETS.normal.voice, this.context.currentTime, 0.1);
  }

  /** Use Web Speech API as a fallback when no audio file is loaded. */
  speakFallback(text: string): void {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.85;   // Slightly slower for kids
    utterance.pitch = 1.1;   // Slightly higher pitch
    utterance.volume = 0.8;
    speechSynthesis.speak(utterance);
  }

  /** Register default voice key-to-file mappings for future TTS clips. */
  registerDefaultVoices(): void {
    const voices = [
      ['turn-owen', '/audio/voice/turn-owen.mp3'],
      ['turn-kian', '/audio/voice/turn-kian.mp3'],
      ['turn-team', '/audio/voice/turn-team.mp3'],
      ['welcome-trainers', '/audio/voice/welcome-trainers.mp3'],
      ['great-training', '/audio/voice/great-training.mp3'],
      // Colors
      ['color-red', '/audio/voice/color-red.mp3'],
      ['color-blue', '/audio/voice/color-blue.mp3'],
      ['color-yellow', '/audio/voice/color-yellow.mp3'],
      ['color-green', '/audio/voice/color-green.mp3'],
      ['color-orange', '/audio/voice/color-orange.mp3'],
      ['color-purple', '/audio/voice/color-purple.mp3'],
      // Numbers
      ['number-1', '/audio/voice/number-1.mp3'],
      ['number-2', '/audio/voice/number-2.mp3'],
      ['number-3', '/audio/voice/number-3.mp3'],
      ['number-4', '/audio/voice/number-4.mp3'],
      ['number-5', '/audio/voice/number-5.mp3'],
      ['number-6', '/audio/voice/number-6.mp3'],
      ['number-7', '/audio/voice/number-7.mp3'],
      // Ash Ketchum voice clips
      ['ash-i-choose-you', '/audio/voice/ash-i-choose-you.mp3'],
      ['ash-great-job', '/audio/voice/ash-great-job.mp3'],
      ['ash-awesome', '/audio/voice/ash-awesome.mp3'],
      ['ash-alright', '/audio/voice/ash-alright.mp3'],
      ['ash-yeah', '/audio/voice/ash-yeah.mp3'],
      ['ash-try-again', '/audio/voice/ash-try-again.mp3'],
      ['ash-not-quite', '/audio/voice/ash-not-quite.mp3'],
      ['ash-owen-turn', '/audio/voice/ash-owen-turn.mp3'],
      ['ash-kian-turn', '/audio/voice/ash-kian-turn.mp3'],
      ['ash-team-turn', '/audio/voice/ash-team-turn.mp3'],
      ['ash-power-gem', '/audio/voice/ash-power-gem.mp3'],
      ['ash-find-color', '/audio/voice/ash-find-color.mp3'],
      ['ash-count-them', '/audio/voice/ash-count-them.mp3'],
      ['ash-match-shape', '/audio/voice/ash-match-shape.mp3'],
      ['ash-trace-letter', '/audio/voice/ash-trace-letter.mp3'],
      ['ash-welcome', '/audio/voice/ash-welcome.mp3'],
      ['ash-amazing', '/audio/voice/ash-amazing.mp3'],
      ['ash-lets-go', '/audio/voice/ash-lets-go.mp3'],
      ['ash-ready', '/audio/voice/ash-ready.mp3'],
    ] as const;
    for (const [key, path] of voices) {
      this.registerVoice(key, path);
    }

    // Legacy key aliases — map old keys to Ash equivalents
    const aliases = [
      ['turn-owen', 'ash-owen-turn'],
      ['turn-kian', 'ash-kian-turn'],
      ['turn-team', 'ash-team-turn'],
    ] as const;
    for (const [legacy, ashKey] of aliases) {
      const ashPath = this.voiceMap.get(ashKey);
      if (ashPath) {
        this.registerVoice(legacy, ashPath);
      }
    }
  }
}
