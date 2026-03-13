// src/content/counting.ts

export interface CountingDifficulty {
  minNumber: number;
  maxNumber: number;
  pillarsMatchCount: boolean; // true = exact pillars, false = more pillars than needed
}

export const countingDifficulty: Record<'little' | 'big', CountingDifficulty> = {
  little: { minNumber: 1, maxNumber: 3, pillarsMatchCount: true },
  big: { minNumber: 1, maxNumber: 7, pillarsMatchCount: false },
};

// ---------------------------------------------------------------------------
// Addition mode difficulty (Kian)
// ---------------------------------------------------------------------------

export interface AdditionDifficulty {
  maxSum: number;
  addends: [number, number][];
}

export const additionDifficulty: AdditionDifficulty = {
  maxSum: 5,
  addends: [[1, 1], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [2, 3], [3, 2]],
};

// ---------------------------------------------------------------------------
// Subitizing mode patterns (Owen)
// ---------------------------------------------------------------------------

export interface SubitizingPattern {
  count: number;
  /** Offsets from center in design-space units */
  positions: { dx: number; dy: number }[];
}

/**
 * Dice-style dot patterns for 1-3.
 * Positions are offsets from a center point, spaced for easy recognition.
 */
export const subitizingPatterns: SubitizingPattern[] = [
  // 1: single center dot
  { count: 1, positions: [{ dx: 0, dy: 0 }] },
  // 2: side by side
  { count: 2, positions: [{ dx: -60, dy: 0 }, { dx: 60, dy: 0 }] },
  // 3: triangle (like dice)
  { count: 3, positions: [{ dx: 0, dy: -50 }, { dx: -55, dy: 40 }, { dx: 55, dy: 40 }] },
];

// ---------------------------------------------------------------------------
// Number bonds (Kian)
// ---------------------------------------------------------------------------

export interface NumberBond {
  whole: number;
  partA: number;
  partB: number;
}

export const numberBonds: NumberBond[] = [
  { whole: 2, partA: 1, partB: 1 },
  { whole: 3, partA: 1, partB: 2 },
  { whole: 3, partA: 2, partB: 1 },
  { whole: 4, partA: 1, partB: 3 },
  { whole: 4, partA: 2, partB: 2 },
  { whole: 4, partA: 3, partB: 1 },
  { whole: 5, partA: 1, partB: 4 },
  { whole: 5, partA: 2, partB: 3 },
  { whole: 5, partA: 3, partB: 2 },
  { whole: 5, partA: 4, partB: 1 },
];

// ---------------------------------------------------------------------------
// Comparison mode (Kian)
// ---------------------------------------------------------------------------

export interface ComparisonPair {
  a: number;
  b: number;
  answer: 'more' | 'less' | 'same';
}

export const comparisonPairs: ComparisonPair[] = [
  { a: 3, b: 1, answer: 'more' },
  { a: 1, b: 4, answer: 'less' },
  { a: 2, b: 2, answer: 'same' },
  { a: 5, b: 2, answer: 'more' },
  { a: 1, b: 3, answer: 'less' },
  { a: 4, b: 4, answer: 'same' },
  { a: 3, b: 5, answer: 'less' },
  { a: 2, b: 1, answer: 'more' },
  { a: 3, b: 3, answer: 'same' },
  { a: 1, b: 5, answer: 'less' },
];

// Voice file: `number-${n}` maps to /audio/voice/prompts/number-1.mp3, etc.
export function getNumberVoiceFile(n: number): string {
  return `number-${n}`;
}
