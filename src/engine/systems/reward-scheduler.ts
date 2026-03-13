// src/engine/systems/reward-scheduler.ts
// Variable-ratio reward scheduling based on reinforcement learning research.
// Research: Variable-ratio schedules produce the highest response rates
// and are most resistant to extinction (Simply Psychology, 2024).
// Research: Player-centered variable-ratio scheduling increases enjoyment (IJSG, 2016).

import { tracker } from '../../state/tracker.svelte';

export type RewardTier = 'small' | 'medium' | 'big' | 'mega';

export interface RewardDecision {
  tier: RewardTier;
  showClip: boolean;
  showConfetti: boolean;
  screenShake: boolean;
  celebrationMessage: string;
  soundEffect: string;
}

/** Reward probabilities per tier (must sum to 1.0) */
const BASE_PROBABILITIES: Record<RewardTier, number> = {
  small: 0.55,    // Quick chime + star (majority of correct answers)
  medium: 0.25,   // Celebration voice + particles
  big: 0.12,      // Video clip + confetti burst
  mega: 0.08,     // Full celebration: evolution charge + confetti + screen effects
};

/** Celebration messages grouped by tier */
const MESSAGES: Record<RewardTier, string[]> = {
  small: [
    'Nice!', 'Got it!', 'Yes!', 'Right!', 'Correct!',
    'Good eye!', 'Sharp!', 'Boom!', 'Nailed it!', 'Sweet!',
  ],
  medium: [
    'AWESOME!', 'FANTASTIC!', 'BRILLIANT!', 'SUPERB!',
    'AMAZING!', 'WONDERFUL!', 'EXCELLENT!', 'WAY TO GO!',
  ],
  big: [
    'INCREDIBLE TRAINER!', 'SUPER EFFECTIVE!', 'CRITICAL HIT!',
    'POWER SURGE!', 'YOU\'RE ON FIRE!', 'MEGA POWER!',
  ],
  mega: [
    'LEGENDARY!!!', 'MEGA EVOLUTION POWER!!!', 'ULTRA TRAINER!!!',
    'CHAMPION MATERIAL!!!', 'THE VERY BEST!!!',
  ],
};

/** Sound effects per tier */
const SOUNDS: Record<RewardTier, string> = {
  small: 'correct-chime',
  medium: 'star-collect',
  big: 'victory-fanfare',
  mega: 'level-up',
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class RewardScheduler {
  private lastTier: RewardTier = 'small';
  private smallStreak = 0; // How many 'small' in a row

  /**
   * Determine what reward to give for a correct answer.
   * Uses variable-ratio scheduling with streak/struggle adjustments.
   */
  decide(): RewardDecision {
    const streak = tracker.consecutiveCorrect;
    const wasStruggling = tracker.consecutiveMisses > 0; // Just broke a miss streak

    // Adjust probabilities based on context
    const probs = { ...BASE_PROBABILITIES };

    // --- Streak boost: longer streaks → bigger rewards more likely ---
    if (streak >= 5) {
      probs.mega *= 3;
      probs.big *= 2;
      probs.small *= 0.3;
    } else if (streak >= 3) {
      probs.big *= 2;
      probs.medium *= 1.5;
      probs.small *= 0.5;
    }

    // --- First correct after struggling → always medium+ (encouragement) ---
    if (wasStruggling) {
      probs.small = 0;
      probs.medium *= 2;
    }

    // --- Anti-monotony: too many 'small' in a row → boost bigger ---
    if (this.smallStreak >= 3) {
      probs.medium *= 2;
      probs.big *= 1.5;
      probs.small *= 0.3;
    }

    // --- Normalize probabilities ---
    const total = probs.small + probs.medium + probs.big + probs.mega;
    let roll = Math.random() * total;

    let tier: RewardTier = 'small';
    for (const t of ['small', 'medium', 'big', 'mega'] as RewardTier[]) {
      roll -= probs[t];
      if (roll <= 0) { tier = t; break; }
    }

    // Track small streak
    if (tier === 'small') {
      this.smallStreak++;
    } else {
      this.smallStreak = 0;
    }
    this.lastTier = tier;

    return {
      tier,
      showClip: tier === 'big' || tier === 'mega',
      showConfetti: tier === 'big' || tier === 'mega',
      screenShake: tier === 'mega',
      celebrationMessage: pick(MESSAGES[tier]),
      soundEffect: SOUNDS[tier],
    };
  }

  /** Get a wrong-answer response (always gentle, encouraging) */
  decideWrong(): { message: string; soundEffect: string; showEncouragement: boolean } {
    const messages = [
      'Try again!', 'Almost!', 'Not quite!', 'Keep looking!',
      'So close!', 'Hmm, try another!', 'You got this!', 'One more try!',
    ];

    // Show encouragement clip after 2+ consecutive misses
    const showEncouragement = tracker.consecutiveMisses >= 2;

    return {
      message: pick(messages),
      soundEffect: 'wrong-bonk',
      showEncouragement,
    };
  }

  /** Get reward tier distribution info (for analytics) */
  get lastRewardTier(): RewardTier { return this.lastTier; }

  reset(): void {
    this.lastTier = 'small';
    this.smallStreak = 0;
  }
}
