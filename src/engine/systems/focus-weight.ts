// src/engine/systems/focus-weight.ts
// Research-backed game selection: interleaving, spaced repetition, ZPD-aware weighting.
// Owen (little): colors + counting emphasis (age 2.5)
// Kian (big): phonics + math emphasis (age 4)

import { session } from '../../state/session.svelte';
import { tracker } from '../../state/tracker.svelte';
import type { GameName } from '../../state/types';

/** Per-child weights for each game. Higher = more likely to be selected. */
interface GameWeights {
  'flame-colors': number;
  'fireball-count': number;
  'evolution-tower': number;
  'phonics-arena': number;
  'evolution-challenge': number;
  'memory-match': number;
}

const BASE_WEIGHTS_OWEN: GameWeights = {
  'flame-colors': 3,       // Primary focus: colors
  'fireball-count': 2,     // Secondary: counting basics
  'evolution-tower': 2,    // Shapes are good for spatial reasoning
  'phonics-arena': 1,      // Letter recognition at this age
  'evolution-challenge': 1, // Fun variety
  'memory-match': 2,       // Working memory development
};

const BASE_WEIGHTS_KIAN: GameWeights = {
  'flame-colors': 1,       // Knows colors — maintenance
  'fireball-count': 3,     // Primary focus: math + addition
  'evolution-tower': 2,    // Shapes + patterns
  'phonics-arena': 3,      // Primary focus: reading readiness
  'evolution-challenge': 1, // Fun variety
  'memory-match': 2,       // Working memory development
};

/** Games played this session, per child */
const sessionHistory = {
  owen: [] as GameName[],
  kian: [] as GameName[],
};

/** Get the recent games for the active child */
function getChildHistory(): GameName[] {
  return session.currentTurn === 'kian' ? sessionHistory.kian : sessionHistory.owen;
}

/** Record a game as played */
export function recordGamePlayed(game: GameName): void {
  const history = session.currentTurn === 'kian' ? sessionHistory.kian : sessionHistory.owen;
  history.push(game);
}

/** Reset session history */
export function resetFocusWeights(): void {
  sessionHistory.owen = [];
  sessionHistory.kian = [];
}

/** Pick the next game using weighted random selection with research-backed adjustments */
export function pickNextGame(gamesCompleted: number): GameName {
  // Every 3rd game (index 2, 5, 8...) is evolution-challenge for variety
  if (gamesCompleted > 0 && gamesCompleted % 3 === 2) return 'evolution-challenge';

  const isOwen = session.currentTurn === 'owen' || session.currentTurn === 'team';
  const baseWeights = isOwen ? { ...BASE_WEIGHTS_OWEN } : { ...BASE_WEIGHTS_KIAN };
  const history = getChildHistory();

  // --- Research adjustment 1: Don't repeat the same game consecutively ---
  // Interleaving improves retention vs blocked practice (MIT Open Learning)
  const lastGame = history[history.length - 1];
  if (lastGame && lastGame in baseWeights) {
    (baseWeights as Record<string, number>)[lastGame] *= 0.15; // Heavy penalty
  }

  // Also penalize second-to-last to avoid ABAB patterns
  const secondLast = history[history.length - 2];
  if (secondLast && secondLast in baseWeights) {
    (baseWeights as Record<string, number>)[secondLast] *= 0.5;
  }

  // --- Research adjustment 2: Boost games where child is struggling ---
  // ZPD: push gently into zone of proximal development
  const adj = tracker.getDifficultyAdjustment();
  if (adj <= -1) {
    // Struggling — boost easier/familiar games, reduce challenging ones
    if (isOwen) {
      baseWeights['flame-colors'] *= 1.5;  // Stick with strengths
      baseWeights['phonics-arena'] *= 0.5; // Reduce harder content
    } else {
      baseWeights['fireball-count'] *= 1.3; // More practice on math
      baseWeights['evolution-challenge'] *= 0.5;
    }
  } else if (adj >= 1) {
    // Doing great — introduce more variety and challenge
    baseWeights['evolution-challenge'] *= 1.5;
    baseWeights['memory-match'] *= 1.3;
  }

  // --- Research adjustment 3: Spaced repetition for weak domains ---
  // If a child missed concepts in a domain, boost that game after a gap
  const repeatColors = tracker.getRepeatConcepts('color');
  const repeatNumbers = tracker.getRepeatConcepts('number');
  const repeatLetters = tracker.getRepeatConcepts('letter');
  const repeatShapes = tracker.getRepeatConcepts('shape');

  if (repeatColors.length > 0) baseWeights['flame-colors'] *= 1.4;
  if (repeatNumbers.length > 0) baseWeights['fireball-count'] *= 1.4;
  if (repeatLetters.length > 0) baseWeights['phonics-arena'] *= 1.4;
  if (repeatShapes.length > 0) baseWeights['evolution-tower'] *= 1.4;

  // --- Weighted random selection ---
  const games = Object.entries(baseWeights) as [GameName, number][];
  const totalWeight = games.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (const [game, weight] of games) {
    roll -= weight;
    if (roll <= 0) return game;
  }

  // Fallback (should never reach here)
  return games[0][0];
}
