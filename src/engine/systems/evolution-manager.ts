// src/engine/systems/evolution-manager.ts
// Manages the evolution meter that tracks session progress.
// Evolution = Charmander → Charmeleon → Charizard → Mega Charizard X
// Charge accumulates from correct answers, with bonuses for streaks and difficulty.

import { session } from '../../state/session.svelte';
import { tracker } from '../../state/tracker.svelte';
import type { EvolutionStage } from '../../state/types';

const THRESHOLDS: { stage: EvolutionStage; at: number }[] = [
  { stage: 'charmeleon', at: 33 },
  { stage: 'charizard', at: 66 },
  { stage: 'megax', at: 100 },
];

/** Base charge amounts per answer type */
const CHARGE = {
  correct: 3,              // Base charge for correct answer
  correctStreak3: 5,       // 3+ streak bonus
  correctStreak5: 7,       // 5+ streak — research: sustained focus deserves big reward
  autoComplete: 1,         // Partial credit for auto-completed prompts
  wrongPenalty: 0,         // No penalty — never punish learning attempts
  bonusDifficult: 2,       // Extra charge for hard questions (Kian additions, CVC words)
} as const;

/** Evolution event data for animations/audio */
export interface EvolutionEvent {
  stage: EvolutionStage;
  fromStage: EvolutionStage;
  meterPercent: number;
}

/** History entry for session report */
interface EvolutionHistoryEntry {
  stage: EvolutionStage;
  timestamp: number;
  gamesCompleted: number;
}

export class EvolutionManager {
  private lastStage: EvolutionStage = 'charmander';
  private comboMultiplier = 1.0;
  private history: EvolutionHistoryEntry[] = [];

  /** Add charge for a correct answer. Returns EvolutionEvent if evolution triggered. */
  addCorrectCharge(isDifficult = false): EvolutionEvent | null {
    let amount: number = CHARGE.correct;

    // Streak bonuses (research: variable-ratio reinforcement)
    if (tracker.consecutiveCorrect >= 5) {
      amount = CHARGE.correctStreak5;
    } else if (tracker.consecutiveCorrect >= 3) {
      amount = CHARGE.correctStreak3;
    }

    // Difficulty bonus
    if (isDifficult) {
      amount += CHARGE.bonusDifficult;
    }

    // Combo multiplier builds over sustained correct answers
    this.comboMultiplier = Math.min(2.0, 1.0 + tracker.consecutiveCorrect * 0.1);
    amount = Math.round(amount * this.comboMultiplier);

    return this.addCharge(amount);
  }

  /** Add charge for auto-completed prompt (partial credit) */
  addAutoCompleteCharge(): EvolutionEvent | null {
    this.comboMultiplier = 1.0; // Reset combo on auto-complete
    return this.addCharge(CHARGE.autoComplete);
  }

  /** Raw charge addition. Returns EvolutionEvent if evolution triggered. */
  addCharge(amount: number): EvolutionEvent | null {
    session.evolutionMeter = Math.min(
      session.evolutionMeter + amount,
      session.evolutionMeterMax,
    );
    const pct = (session.evolutionMeter / session.evolutionMeterMax) * 100;

    for (const t of THRESHOLDS) {
      if (pct >= t.at && this.lastStage !== t.stage && this.stageIndex(t.stage) > this.stageIndex(this.lastStage)) {
        const fromStage = this.lastStage;
        this.lastStage = t.stage;
        session.evolutionStage = t.stage;

        // Record in history
        this.history.push({
          stage: t.stage,
          timestamp: Date.now(),
          gamesCompleted: session.gamesCompleted,
        });

        return {
          stage: t.stage,
          fromStage,
          meterPercent: pct,
        };
      }
    }
    return null;
  }

  /** Get current meter percentage (0-100) */
  get meterPercent(): number {
    return (session.evolutionMeter / session.evolutionMeterMax) * 100;
  }

  /** Get sprite key for current evolution stage */
  get spriteKey(): string {
    switch (session.evolutionStage) {
      case 'charmander': return 'charmander';
      case 'charmeleon': return 'charmeleon';
      case 'charizard': return 'charizard';
      case 'megax': return 'charizard-megax';
    }
  }

  /** Get sprite scale — earlier stages are smaller */
  get spriteScale(): number {
    switch (session.evolutionStage) {
      case 'charmander': return 2;
      case 'charmeleon': return 2.5;
      case 'charizard': return 3;
      case 'megax': return 3;
    }
  }

  /** Get current combo multiplier */
  get combo(): number {
    return this.comboMultiplier;
  }

  /** Get evolution history for session report */
  get evolutionHistory(): EvolutionHistoryEntry[] {
    return [...this.history];
  }

  /** Get a motivational message based on current stage */
  get stageMessage(): string {
    switch (session.evolutionStage) {
      case 'charmander': return 'Keep going! Charmander is warming up!';
      case 'charmeleon': return 'Charmeleon is getting stronger!';
      case 'charizard': return 'Charizard is ready to fly!';
      case 'megax': return 'MEGA CHARIZARD X! Maximum power!';
    }
  }

  reset(): void {
    this.lastStage = 'charmander';
    this.comboMultiplier = 1.0;
    this.history = [];
    session.evolutionStage = 'charmander';
    session.evolutionMeter = 0;
    session.gamesCompleted = 0;
  }

  private stageIndex(stage: EvolutionStage): number {
    const order: EvolutionStage[] = ['charmander', 'charmeleon', 'charizard', 'megax'];
    return order.indexOf(stage);
  }
}
