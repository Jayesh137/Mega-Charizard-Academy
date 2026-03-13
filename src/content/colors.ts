// src/content/colors.ts

export interface ColorItem {
  name: string;
  hex: string;
  voiceFile: string;
}

export interface ColorDifficulty {
  targetCount: number;
  useSet: 'primary' | 'both';
  showHint: boolean;
  driftSpeed: number; // pixels per second in design space
}

export const primaryColors: ColorItem[] = [
  { name: 'red', hex: '#ff3333', voiceFile: 'color-red' },
  { name: 'blue', hex: '#3377ff', voiceFile: 'color-blue' },
  { name: 'yellow', hex: '#ffdd00', voiceFile: 'color-yellow' },
];

export const extendedColors: ColorItem[] = [
  { name: 'green', hex: '#33cc33', voiceFile: 'color-green' },
  { name: 'orange', hex: '#ff8833', voiceFile: 'color-orange' },
  { name: 'purple', hex: '#9933ff', voiceFile: 'color-purple' },
];

export const allColors = [...primaryColors, ...extendedColors];

export const colorDifficulty: Record<'little' | 'big', ColorDifficulty> = {
  little: { targetCount: 2, useSet: 'primary', showHint: true, driftSpeed: 20 },
  big: { targetCount: 4, useSet: 'both', showHint: false, driftSpeed: 40 },
};

// ---------------------------------------------------------------------------
// Color mixing pairs (primary → secondary discovery)
// ---------------------------------------------------------------------------

export interface ColorMixPair {
  a: string;       // first primary color name
  b: string;       // second primary color name
  result: string;  // resulting secondary color name
}

export const colorMixing: ColorMixPair[] = [
  { a: 'blue', b: 'yellow', result: 'green' },
  { a: 'red', b: 'yellow', result: 'orange' },
  { a: 'red', b: 'blue', result: 'purple' },
];

// ---------------------------------------------------------------------------
// Color shades (light / dark variants for shade matching)
// ---------------------------------------------------------------------------

export interface ColorShade {
  light: string;  // hex
  dark: string;   // hex
}

export const colorShades: Record<string, ColorShade> = {
  red:    { light: '#ff6666', dark: '#cc0000' },
  blue:   { light: '#6699ff', dark: '#0033cc' },
  yellow: { light: '#ffff66', dark: '#ccaa00' },
  green:  { light: '#66ff66', dark: '#009900' },
  orange: { light: '#ffaa66', dark: '#cc6600' },
  purple: { light: '#cc66ff', dark: '#6600cc' },
};

// ---------------------------------------------------------------------------
// Color patterns (what-comes-next sequences)
// ---------------------------------------------------------------------------

export interface ColorPattern {
  sequence: string[];  // color names (4 shown + answer is next)
  answer: string;      // correct next color
}

export const colorPatterns: ColorPattern[] = [
  // ABAB patterns (both kids)
  { sequence: ['red', 'blue', 'red', 'blue'], answer: 'red' },
  { sequence: ['yellow', 'red', 'yellow', 'red'], answer: 'yellow' },
  { sequence: ['blue', 'yellow', 'blue', 'yellow'], answer: 'blue' },
  { sequence: ['red', 'yellow', 'red', 'yellow'], answer: 'red' },
  { sequence: ['blue', 'red', 'blue', 'red'], answer: 'blue' },
  // AABB patterns (both kids)
  { sequence: ['red', 'red', 'blue', 'blue'], answer: 'red' },
  { sequence: ['yellow', 'yellow', 'red', 'red'], answer: 'yellow' },
  { sequence: ['blue', 'blue', 'yellow', 'yellow'], answer: 'blue' },
  // ABC patterns (Kian only — filtered by caller)
  { sequence: ['red', 'blue', 'yellow', 'red'], answer: 'blue' },
  { sequence: ['blue', 'green', 'orange', 'blue'], answer: 'green' },
  { sequence: ['purple', 'red', 'yellow', 'purple'], answer: 'red' },
];
