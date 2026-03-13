// src/content/letters.ts

export interface LetterItem {
  letter: string;
  word: string;
  phonicsSound: string;
  icon: string; // key into icon drawing registry
  voiceFile: string;
  starCount: { little: number; big: number };
}

export interface LetterDifficulty {
  includePhonics: boolean;
  includeFirstLetterMatch: boolean;
  autoAdvanceNearClick: boolean; // forgiving click zones for younger kids
}

export const starterLetters: LetterItem[] = [
  { letter: 'C', word: 'Charizard', phonicsSound: 'ch', icon: 'character', voiceFile: 'letter-c', starCount: { little: 5, big: 8 } },
  { letter: 'F', word: 'Fire', phonicsSound: 'ff', icon: 'flame', voiceFile: 'letter-f', starCount: { little: 6, big: 10 } },
  { letter: 'S', word: 'Star', phonicsSound: 'ss', icon: 'star', voiceFile: 'letter-s', starCount: { little: 5, big: 9 } },
  { letter: 'B', word: 'Blue', phonicsSound: 'bb', icon: 'colorBlob', voiceFile: 'letter-b', starCount: { little: 6, big: 10 } },
  { letter: 'M', word: 'Mega', phonicsSound: 'mm', icon: 'star', voiceFile: 'letter-m', starCount: { little: 5, big: 8 } },
  { letter: 'P', word: 'Pikachu', phonicsSound: 'pp', icon: 'flame', voiceFile: 'letter-p', starCount: { little: 5, big: 9 } },
  { letter: 'T', word: 'Thunder', phonicsSound: 'tt', icon: 'star', voiceFile: 'letter-t', starCount: { little: 6, big: 9 } },
  { letter: 'R', word: 'Raichu', phonicsSound: 'rr', icon: 'flame', voiceFile: 'letter-r', starCount: { little: 5, big: 8 } },
  { letter: 'D', word: 'Dragon', phonicsSound: 'dd', icon: 'star', voiceFile: 'letter-d', starCount: { little: 6, big: 10 } },
  { letter: 'A', word: 'Ash', phonicsSound: 'ah', icon: 'character', voiceFile: 'letter-a', starCount: { little: 5, big: 8 } },
];

export const letterDifficulty: Record<'little' | 'big', LetterDifficulty> = {
  little: { includePhonics: false, includeFirstLetterMatch: false, autoAdvanceNearClick: true },
  big: { includePhonics: true, includeFirstLetterMatch: true, autoAdvanceNearClick: false },
};

// ---------------------------------------------------------------------------
// Curved letter paths for Magic Runes (8-15 points per letter, normalised 0-1)
// ---------------------------------------------------------------------------

// Letter paths are traced as dot-to-dot constellations. Stars connect
// sequentially with straight lines, so each path must be a SINGLE continuous
// stroke that produces a recognisable letter shape. For letters with multiple
// strokes (F, B) we route back along the spine so the line retraces.
//
// All coordinates are normalised 0-1 within the letter bounding box.
// More points = smoother curves for Kian; Owen samples a subset.

export const letterPaths: Record<string, { x: number; y: number }[]> = {
  C: [
    // Open curve from top-right, around the left, to bottom-right
    { x: 0.70, y: 0.15 },
    { x: 0.50, y: 0.06 },
    { x: 0.30, y: 0.10 },
    { x: 0.15, y: 0.22 },
    { x: 0.10, y: 0.40 },
    { x: 0.10, y: 0.60 },
    { x: 0.15, y: 0.78 },
    { x: 0.30, y: 0.90 },
    { x: 0.50, y: 0.94 },
    { x: 0.70, y: 0.85 },
  ],
  S: [
    // Smooth S: top-right → curves left → crosses center → curves right → bottom-left
    { x: 0.65, y: 0.12 },
    { x: 0.45, y: 0.06 },
    { x: 0.25, y: 0.12 },
    { x: 0.18, y: 0.25 },
    { x: 0.25, y: 0.38 },
    { x: 0.45, y: 0.48 },
    { x: 0.65, y: 0.58 },
    { x: 0.72, y: 0.72 },
    { x: 0.65, y: 0.85 },
    { x: 0.45, y: 0.92 },
    { x: 0.25, y: 0.88 },
  ],
  B: [
    // Single continuous stroke: down the spine, up around top bump, back to
    // mid-spine, out around bottom bump, back to bottom of spine.
    { x: 0.25, y: 0.08 },  // top of spine
    { x: 0.25, y: 0.28 },  // mid-upper spine
    { x: 0.25, y: 0.48 },  // mid spine
    { x: 0.25, y: 0.68 },  // mid-lower spine
    { x: 0.25, y: 0.92 },  // bottom of spine
    { x: 0.45, y: 0.90 },  // bottom bump starts
    { x: 0.62, y: 0.78 },  // bottom bump peak
    { x: 0.62, y: 0.62 },  // bottom bump ends
    { x: 0.40, y: 0.50 },  // back to mid spine
    { x: 0.62, y: 0.38 },  // top bump starts
    { x: 0.62, y: 0.22 },  // top bump peak
    { x: 0.45, y: 0.10 },  // top bump ends, connects near top of spine
  ],
  F: [
    // Single continuous stroke: bottom of stem → top of stem → across top
    // bar → back to stem junction → across middle bar.
    { x: 0.25, y: 0.92 },  // bottom of stem
    { x: 0.25, y: 0.72 },  // lower stem
    { x: 0.25, y: 0.50 },  // mid stem (middle bar junction)
    { x: 0.25, y: 0.30 },  // upper stem
    { x: 0.25, y: 0.08 },  // top of stem
    { x: 0.45, y: 0.08 },  // top bar middle
    { x: 0.70, y: 0.08 },  // top bar end
    { x: 0.45, y: 0.08 },  // retrace top bar back
    { x: 0.25, y: 0.08 },  // back to stem top
    { x: 0.25, y: 0.30 },  // retrace down to mid area
    { x: 0.25, y: 0.50 },  // mid stem junction
    { x: 0.45, y: 0.50 },  // middle bar middle
    { x: 0.62, y: 0.50 },  // middle bar end
  ],
  M: [
    // Left stroke up, diagonal down to middle, diagonal up, right stroke down
    { x: 0.15, y: 0.92 },  // bottom-left
    { x: 0.15, y: 0.08 },  // top-left
    { x: 0.50, y: 0.55 },  // middle valley
    { x: 0.85, y: 0.08 },  // top-right
    { x: 0.85, y: 0.92 },  // bottom-right
  ],
  P: [
    // Vertical stroke up, then curve right across top and back to middle
    { x: 0.25, y: 0.92 },  // bottom of stem
    { x: 0.25, y: 0.08 },  // top of stem
    { x: 0.50, y: 0.08 },  // top bar starts
    { x: 0.70, y: 0.20 },  // curve out right
    { x: 0.70, y: 0.38 },  // curve down
    { x: 0.25, y: 0.48 },  // back to mid-stem
  ],
  T: [
    // Horizontal stroke across top, vertical stroke down center
    { x: 0.15, y: 0.08 },  // top-left
    { x: 0.50, y: 0.08 },  // top-center (junction)
    { x: 0.85, y: 0.08 },  // top-right
    { x: 0.50, y: 0.08 },  // back to junction
    { x: 0.50, y: 0.50 },  // mid-stem
    { x: 0.50, y: 0.92 },  // bottom of stem
  ],
  R: [
    // Like P but with a diagonal leg from the bump back to bottom-right
    { x: 0.25, y: 0.92 },  // bottom of stem
    { x: 0.25, y: 0.08 },  // top of stem
    { x: 0.50, y: 0.08 },  // top bar starts
    { x: 0.70, y: 0.20 },  // curve out right
    { x: 0.70, y: 0.35 },  // curve down
    { x: 0.25, y: 0.48 },  // back to mid-stem
    { x: 0.70, y: 0.92 },  // diagonal leg to bottom-right
  ],
  D: [
    // Vertical stroke, then curve out right and back
    { x: 0.25, y: 0.08 },  // top of stem
    { x: 0.25, y: 0.50 },  // mid-stem
    { x: 0.25, y: 0.92 },  // bottom of stem
    { x: 0.50, y: 0.92 },  // bottom curve start
    { x: 0.75, y: 0.70 },  // curve out right lower
    { x: 0.75, y: 0.30 },  // curve out right upper
    { x: 0.50, y: 0.08 },  // curve back top
    { x: 0.25, y: 0.08 },  // close at top of stem
  ],
  A: [
    // Diagonal up to peak, diagonal down, horizontal bar in middle
    { x: 0.15, y: 0.92 },  // bottom-left
    { x: 0.50, y: 0.08 },  // peak
    { x: 0.85, y: 0.92 },  // bottom-right
    { x: 0.68, y: 0.52 },  // bar right end
    { x: 0.32, y: 0.52 },  // bar left end
  ],
};

// ---------------------------------------------------------------------------
// Centralised phonics data
// ---------------------------------------------------------------------------

export const PHONICS: Record<string, { sound: string; wrongSound: string; wordExample: string }> = {
  C: { sound: 'Cuh', wrongSound: 'Sss', wordExample: 'Charizard' },
  F: { sound: 'Fff', wrongSound: 'Buh', wordExample: 'Fire' },
  S: { sound: 'Sss', wrongSound: 'Fff', wordExample: 'Star' },
  B: { sound: 'Buh', wrongSound: 'Duh', wordExample: 'Blue' },
  M: { sound: 'Mmm', wrongSound: 'Nnn', wordExample: 'Mega' },
  P: { sound: 'Puh', wrongSound: 'Buh', wordExample: 'Pikachu' },
  T: { sound: 'Tuh', wrongSound: 'Duh', wordExample: 'Thunder' },
  R: { sound: 'Rrr', wrongSound: 'Lll', wordExample: 'Raichu' },
  D: { sound: 'Duh', wrongSound: 'Tuh', wordExample: 'Dragon' },
  A: { sound: 'Ahh', wrongSound: 'Ehh', wordExample: 'Ash' },
};
