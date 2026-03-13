// src/engine/voice.ts
// Centralized educational voice system.
// Implements the Three-Label Rule: prompt label -> action label -> success echo.
// All voice calls go through here for consistency.
// Prefers MP3 files from ASH_LINES config, falls back to Web Speech TTS.

import type { AudioManager } from './audio';
import { ASH_LINES } from '../config/ash-lines';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class VoiceSystem {
  constructor(private audio: AudioManager) {}

  // ---------------------------------------------------------------------------
  // MP3-first playback with TTS fallback
  // ---------------------------------------------------------------------------

  /**
   * Play a voice line by ASH_LINES key (e.g. 'correct', 'turn_owen', 'color_red').
   * Picks a random variation, tries the MP3 file first, falls back to TTS.
   */
  playAshLine(key: string): void {
    const lines = ASH_LINES[key];
    if (!lines || lines.length === 0) {
      // Unknown key — treat as raw text for TTS
      this.audio.speakFallback(key);
      return;
    }
    const line = pick(lines);
    const path = `./audio/voice/ash/${line.file}`;
    this.tryPlayFile(path).then((played) => {
      if (!played) {
        this.audio.speakFallback(line.text);
      }
    });
  }

  /**
   * Attempt to play an audio file through the Web Audio API voice gain node.
   * Returns true if playback started successfully.
   * Returns false if the file doesn't exist or can't be played.
   */
  private async tryPlayFile(path: string): Promise<boolean> {
    try {
      return await this.audio.playVoiceFile(path);
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Three-Label Rule methods (prompt / engage / echo)
  // ---------------------------------------------------------------------------

  /** Prompt label: "Red. Find red!" */
  prompt(concept: string, instruction: string): void {
    this.audio.playVoice(`${concept}. ${instruction}`);
  }

  /** Pre-prompt engagement: "Owen, point!" */
  engage(name: string, action: string): void {
    this.audio.playVoice(`${name}, ${action}!`);
  }

  /** Success echo: "Red! Red flame!" */
  successEcho(concept: string, celebration?: string): void {
    const text = celebration ? `${concept}! ${celebration}` : `${concept}!`;
    this.audio.playVoice(text);
  }

  /** Wrong redirect: "That's blue. Find red!" */
  wrongRedirect(wrongConcept: string, correctConcept: string): void {
    this.audio.playVoice(`That's ${wrongConcept}. Find ${correctConcept}!`);
  }

  // ---------------------------------------------------------------------------
  // Ash reaction methods (now backed by ASH_LINES)
  // ---------------------------------------------------------------------------

  /** Play a random Ash celebration clip */
  ashCorrect(): void {
    this.playAshLine('correct');
  }

  /** Play a random Ash encouragement clip */
  ashWrong(): void {
    this.playAshLine('wrong');
  }

  /** Play a specific Ash clip by key — tries ASH_LINES first, then legacy playVoice */
  ash(key: string): void {
    if (ASH_LINES[key]) {
      this.playAshLine(key);
    } else {
      // Legacy support: pass through to AudioManager's voice map
      this.audio.playVoice(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Cross-game reinforcement
  // ---------------------------------------------------------------------------

  /** Owen reinforcement: echo a color name after any correct answer */
  crossReinforcColor(colorWord: string): void {
    const colorKey = `color_${colorWord.toLowerCase()}`;
    if (ASH_LINES[colorKey]) {
      // Delay slightly so it doesn't overlap the main celebration
      setTimeout(() => this.playAshLine(colorKey), 1200);
    } else {
      setTimeout(() => this.audio.playVoice(`${colorWord}!`), 1200);
    }
  }

  /** Kian reinforcement: echo a letter/sound after any correct answer */
  crossReinforcPhonics(letter: string, sound: string): void {
    const letterKey = `letter_${letter.toLowerCase()}`;
    if (ASH_LINES[letterKey]) {
      setTimeout(() => this.playAshLine(letterKey), 1200);
    } else {
      setTimeout(() => this.audio.playVoice(`${letter}! ${letter} says ${sound}!`), 1200);
    }
  }

  // ---------------------------------------------------------------------------
  // Narration and hints
  // ---------------------------------------------------------------------------

  /** Narration frame for game intro */
  narrate(text: string): void {
    this.audio.playVoice(text);
  }

  /** Hint repeat: just say the concept again */
  hintRepeat(concept: string): void {
    this.audio.playVoice(concept);
  }
}
