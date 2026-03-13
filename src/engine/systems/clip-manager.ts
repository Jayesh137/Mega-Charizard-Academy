// src/engine/systems/clip-manager.ts
// Smart video clip selection with cooldowns, priority queuing, and variable-ratio triggers.
// Research: Variable-ratio reinforcement (clips as rewards) is most resistant to extinction.

import { CLIPS, type ClipCategory, type ClipDef } from '../../config/clips';

/** How many prompts between potential clip triggers (minimum gap) */
const MIN_GAP_BETWEEN_CLIPS = 3;

/** Variable-ratio chance of triggering a celebration clip on correct answer */
const CELEBRATION_CLIP_CHANCE = 0.12; // ~12% of correct answers → clip reward

/** Category priority for contextual selection */
const CATEGORY_WEIGHTS: Record<ClipCategory, number> = {
  celebration: 5,
  calm: 3,
  encouragement: 3,
  evolution: 10,   // Evolution clips are special — always play when triggered
  intro: 2,
  finale: 8,
  fun: 2,
};

interface ClipHistory {
  id: string;
  timestamp: number;
  category: ClipCategory;
}

export class ClipManager {
  private playedThisSession = new Set<string>();
  private lastPlayedId = '';
  private clipHistory: ClipHistory[] = [];
  private promptsSinceLastClip = 0;
  private totalClipsPlayed = 0;

  /**
   * Get a clip from a category using smart selection.
   * Prefers unseen clips, avoids consecutive repeats, respects cooldowns.
   */
  pick(category: ClipCategory, evolutionStage?: string): ClipDef | null {
    let pool = CLIPS.filter(c => c.category === category);
    if (evolutionStage) {
      pool = pool.filter(c => c.evolutionStage === evolutionStage);
    }
    if (pool.length === 0) return null;

    // Prefer unseen clips (novelty is engaging)
    const unseen = pool.filter(c => !this.playedThisSession.has(c.id));
    const candidates = unseen.length > 0 ? unseen : pool;

    // Avoid consecutive repeat
    const filtered = candidates.length > 1
      ? candidates.filter(c => c.id !== this.lastPlayedId)
      : candidates;

    // Cooldown: avoid recently played clips (within last 5)
    const recentIds = this.clipHistory.slice(-5).map(h => h.id);
    const cooledDown = filtered.filter(c => !recentIds.includes(c.id));
    const finalPool = cooledDown.length > 0 ? cooledDown : filtered;

    // Weighted random: longer clips have slightly lower weight (less interruption)
    const weights = finalPool.map(c => Math.max(1, 6 - c.duration));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;
    let picked = finalPool[0];
    for (let i = 0; i < finalPool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { picked = finalPool[i]; break; }
    }

    this.recordPlay(picked);
    return picked;
  }

  /**
   * Should we show a celebration clip right now?
   * Variable-ratio: not every correct answer, but unpredictable timing.
   */
  shouldShowCelebrationClip(consecutiveCorrect: number): boolean {
    // Must have minimum gap since last clip
    if (this.promptsSinceLastClip < MIN_GAP_BETWEEN_CLIPS) return false;

    // Streaks increase chance (variable-ratio with streak boost)
    let chance = CELEBRATION_CLIP_CHANCE;
    if (consecutiveCorrect >= 5) chance *= 2.5;  // Big streak = much more likely
    else if (consecutiveCorrect >= 3) chance *= 1.5;

    return Math.random() < chance;
  }

  /** Get the best celebration clip for current context */
  getCelebrationClip(): ClipDef | null {
    return this.pick('celebration');
  }

  /** Get a calm/transition clip */
  getCalmClip(): ClipDef | null {
    return this.pick('calm');
  }

  /** Get an encouragement clip (for struggles) */
  getEncouragementClip(): ClipDef | null {
    return this.pick('encouragement');
  }

  /** Get evolution clip for a specific stage transition */
  getEvolutionClip(stage: string): ClipDef | null {
    return this.pick('evolution', stage);
  }

  /** Get a fun/bonus clip */
  getFunClip(): ClipDef | null {
    return this.pick('fun');
  }

  /** Increment prompt counter (call after each game prompt) */
  onPromptComplete(): void {
    this.promptsSinceLastClip++;
  }

  /** Get session clip analytics */
  get sessionStats() {
    return {
      totalClipsPlayed: this.totalClipsPlayed,
      uniqueClipsSeen: this.playedThisSession.size,
      clipHistory: [...this.clipHistory],
    };
  }

  /** Reset for new session */
  reset(): void {
    this.playedThisSession.clear();
    this.lastPlayedId = '';
    this.clipHistory = [];
    this.promptsSinceLastClip = 0;
    this.totalClipsPlayed = 0;
  }

  private recordPlay(clip: ClipDef): void {
    this.playedThisSession.add(clip.id);
    this.lastPlayedId = clip.id;
    this.promptsSinceLastClip = 0;
    this.totalClipsPlayed++;
    this.clipHistory.push({
      id: clip.id,
      timestamp: Date.now(),
      category: clip.category,
    });
  }
}
