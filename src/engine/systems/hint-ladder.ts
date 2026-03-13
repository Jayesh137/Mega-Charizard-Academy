// src/engine/systems/hint-ladder.ts
// 5-level research-backed hint escalation system.
// Based on Vygotsky's ZPD: scaffolding should fade as competence grows.
// Owen gets faster escalation (younger = needs support sooner).
// Kian gets slower escalation (older = more productive struggle time).
//
// Hint levels:
//   0 = Wait (no hints, fresh prompt)
//   1 = Voice repeat (say the concept/prompt again)
//   2 = Visual pulse (correct answer glows/bounces — visual scaffold)
//   3 = Pointer (arrow/gaze points at correct answer — direct scaffold)
//   4 = Auto-complete (show the answer, award partial credit, move on)

import { session } from '../../state/session.svelte';

export type HintLevel = 0 | 1 | 2 | 3 | 4;

interface HintConfig {
  /** Seconds before first timeout hint (L0 → L1) */
  timeoutDelay: number;
  /** Seconds between escalating timeout hints (L1→L2, L2→L3) */
  escalateDelay: number;
  /** Number of misses before visual pulse (→ L2) */
  missesForPulse: number;
  /** Number of misses before pointer (→ L3) */
  missesForPointer: number;
  /** Number of misses before auto-complete (→ L4) */
  autoCompleteAfter: number;
}

const HINT_CONFIGS: Record<string, HintConfig> = {
  owen: {
    timeoutDelay: 4,         // 4 seconds before first repeat
    escalateDelay: 4,        // 4 seconds between escalations
    missesForPulse: 1,       // First miss → glow
    missesForPointer: 2,     // Second miss → pointer
    autoCompleteAfter: 3,    // Third miss → auto-complete
  },
  kian: {
    timeoutDelay: 7,         // 7 seconds before first repeat (more struggle time)
    escalateDelay: 6,        // 6 seconds between escalations
    missesForPulse: 2,       // Second miss → glow
    missesForPointer: 3,     // Third miss → pointer
    autoCompleteAfter: 4,    // Fourth miss → auto-complete
  },
};

// --- Analytics tracking ---
interface HintAnalytics {
  totalPrompts: number;
  hintsUsed: number;        // Prompts where any hint was needed
  autoCompletes: number;    // Prompts that reached L4
  voiceRepeats: number;     // L1 escalations
  visualPulses: number;     // L2 escalations
  pointerHints: number;     // L3 escalations
}

const analytics: Record<string, HintAnalytics> = {
  owen: { totalPrompts: 0, hintsUsed: 0, autoCompletes: 0, voiceRepeats: 0, visualPulses: 0, pointerHints: 0 },
  kian: { totalPrompts: 0, hintsUsed: 0, autoCompletes: 0, voiceRepeats: 0, visualPulses: 0, pointerHints: 0 },
};

export class HintLadder {
  private level: HintLevel = 0;
  private missCount = 0;
  private timeSincePrompt = 0;
  private concept = '';
  private _autoCompleted = false;
  private hintUsedThisPrompt = false;
  private highestLevelThisPrompt: HintLevel = 0;

  get hintLevel(): HintLevel { return this.level; }
  get autoCompleted(): boolean { return this._autoCompleted; }

  /** Start a new prompt — resets hint state */
  startPrompt(concept: string): void {
    // Record previous prompt's analytics before resetting
    if (this.concept && this.hintUsedThisPrompt) {
      const child = this.getChildKey();
      analytics[child].hintsUsed++;
      if (this.highestLevelThisPrompt >= 1) analytics[child].voiceRepeats++;
      if (this.highestLevelThisPrompt >= 2) analytics[child].visualPulses++;
      if (this.highestLevelThisPrompt >= 3) analytics[child].pointerHints++;
      if (this._autoCompleted) analytics[child].autoCompletes++;
    }

    this.level = 0;
    this.missCount = 0;
    this.timeSincePrompt = 0;
    this.concept = concept;
    this._autoCompleted = false;
    this.hintUsedThisPrompt = false;
    this.highestLevelThisPrompt = 0;

    const child = this.getChildKey();
    analytics[child].totalPrompts++;
  }

  /** Call on wrong answer. Returns new hint level. */
  onMiss(): HintLevel {
    this.missCount++;
    const config = this.getConfig();

    if (this.missCount >= config.autoCompleteAfter) {
      this.setLevel(4);
      this._autoCompleted = true;
    } else if (this.missCount >= config.missesForPointer) {
      this.setLevel(3);
    } else if (this.missCount >= config.missesForPulse) {
      this.setLevel(2);
    }

    return this.level;
  }

  /** Call every frame. Returns true if hint level escalated from timeout. */
  update(dt: number): boolean {
    if (this.level >= 4) return false;

    this.timeSincePrompt += dt;
    const config = this.getConfig();
    const prevLevel = this.level;

    // Time-based escalation (independent of miss count)
    const t1 = config.timeoutDelay;
    const t2 = t1 + config.escalateDelay;
    const t3 = t2 + config.escalateDelay;

    if (this.level < 1 && this.timeSincePrompt >= t1) {
      this.setLevel(1);
    }
    if (this.level < 2 && this.timeSincePrompt >= t2) {
      this.setLevel(2);
    }
    if (this.level < 3 && this.timeSincePrompt >= t3) {
      this.setLevel(3);
    }

    return this.level !== prevLevel;
  }

  /** Get analytics for a child */
  static getAnalytics(child: string): HintAnalytics {
    return analytics[child] ?? analytics.owen;
  }

  /** Get hint independence rate (% of prompts solved without any hints) */
  static getIndependenceRate(child: string): number {
    const a = analytics[child] ?? analytics.owen;
    if (a.totalPrompts === 0) return 100;
    return Math.round(((a.totalPrompts - a.hintsUsed) / a.totalPrompts) * 100);
  }

  /** Reset all analytics */
  static resetAnalytics(): void {
    for (const child of ['owen', 'kian']) {
      analytics[child] = { totalPrompts: 0, hintsUsed: 0, autoCompletes: 0, voiceRepeats: 0, visualPulses: 0, pointerHints: 0 };
    }
  }

  private setLevel(level: HintLevel): void {
    if (level > this.level) {
      this.level = level;
      this.hintUsedThisPrompt = true;
      if (level > this.highestLevelThisPrompt) {
        this.highestLevelThisPrompt = level;
      }
    }
  }

  private getConfig(): HintConfig {
    return HINT_CONFIGS[this.getChildKey()];
  }

  private getChildKey(): string {
    const turn = session.currentTurn;
    return turn === 'kian' ? 'kian' : 'owen';
  }
}
