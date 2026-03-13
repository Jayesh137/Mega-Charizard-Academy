// src/engine/games/phonics-arena.ts
// Mini-game 4: Phonics Arena — Letter Recognition & Phonics via Star Constellations
//
// Night sky with glowing star constellations forming letters.
// Stars appear one by one and connect automatically (no tracing).
// Kids choose what letter or what sound it makes.
//
// Owen (2.5yo): "What letter is this?" — 2 large letter choices (one correct,
//               one wrong). No phonics. 4 prompts per round.
// Kian (4yo):   Alternates between letter recognition and phonics.
//               Index 0 = letter, 1 = phonics, 2 = letter, 3 = phonics...
//               2 choices per question. 4 prompts per round.
//
// Systems: SpriteAnimator, VoiceSystem, HintLadder, tracker, FlameMeter

import type { GameScreen, GameContext } from '../screen-manager';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { SPRITES } from '../../config/sprites';
import { VoiceSystem } from '../voice';
import { HintLadder } from '../systems/hint-ladder';
import { FlameMeter } from '../entities/flame-meter';
import { tracker } from '../../state/tracker.svelte';
import { starterLetters, letterPaths, PHONICS, cvcWords, rhymeGroups, type LetterItem, type CVCWord, type RhymeGroup } from '../../content/letters';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  PROMPTS_PER_ROUND,
} from '../../config/constants';
import { session } from '../../state/session.svelte';
import { settings } from '../../state/settings.svelte';
import { randomRange } from '../utils/math';
import { theme } from '../../config/theme';
import { evolutionSpriteKey, evolutionSpriteScale } from '../utils/evolution-sprite';
import { clipManager } from '../screens/hub';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANNER_DURATION = 1.5;
const ENGAGE_DURATION = 1.0;
const SHOW_LETTER_DURATION = 3.0; // Constellation auto-draws over ~3s
const CELEBRATE_DURATION = 1.5;

/** MCX sprite position (top-right corner, centered in visible area) */
const SPRITE_X = DESIGN_WIDTH - 260;
const SPRITE_Y = 180;

/** Letter bounding box in design space */
const LETTER_BOX = {
  x: DESIGN_WIDTH * 0.25,
  y: DESIGN_HEIGHT * 0.18,
  w: DESIGN_WIDTH * 0.5,
  h: DESIGN_HEIGHT * 0.6,
} as const;

/** Blue fire palette */
const FIRE_COLORS = ['#FFFFFF', '#91CCEC', '#37B1E2', '#5ED4FC'];

/** Choice button dimensions */
const BTN_W = 360;
const BTN_H = 110;

/** Stagger delay between star appearances (seconds) */
const STAR_STAGGER = 0.25;

/** Word building mode constants */
const SLOT_SIZE = 120;
const SLOT_GAP = 20;
const TILE_SIZE = 100;
const TILE_GAP = 24;
const TILE_ANIM_DURATION = 0.3;
const WORD_CELEBRATE_DURATION = 2.0;

/** Rhyme mode constants */
const RHYME_BTN_W = 320;
const RHYME_BTN_H = 100;
const RHYME_CELEBRATE_DURATION = 2.0;


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConstellationStar {
  x: number;
  y: number;
  appeared: boolean;
  pulseOffset: number;
  scale: number; // pop-in animation 0..1
}

interface ChoiceButton {
  label: string;
  correct: boolean;
  x: number;
  y: number;
  shakeTimer: number; // > 0 while shaking from wrong answer
}

/** A draggable letter tile for word building mode */
interface WordTile {
  letter: string;
  x: number;
  y: number;
  originX: number; // original position for reset
  originY: number;
  placed: boolean;
  shakeTimer: number;
  /** Animation progress for sliding into slot (0 = at origin, 1 = in slot) */
  animProgress: number;
  /** Target slot position for animation */
  targetX: number;
  targetY: number;
}

/** A choice button for rhyming mode */
interface RhymeChoice {
  word: string;
  correct: boolean;
  x: number;
  y: number;
  shakeTimer: number;
}

type PromptMode = 'letter' | 'phonics' | 'word' | 'rhyme';

type GamePhase =
  | 'banner'
  | 'engage'
  | 'show-letter'
  | 'choice'
  | 'word-build'
  | 'word-celebrate'
  | 'rhyme-choice'
  | 'rhyme-celebrate'
  | 'celebrate'
  | 'next';

// ---------------------------------------------------------------------------
// PhonicsArenaGame
// ---------------------------------------------------------------------------

export class PhonicsArenaGame implements GameScreen {
  // Systems
  private bg = new Background(80, 'mountain-night');
  private particles = new ParticlePool();
  private sprite!: SpriteAnimator;
  private spriteScale = 3;
  private hintLadder = new HintLadder();
  private flameMeter = new FlameMeter();
  private voice!: VoiceSystem;
  private gameContext!: GameContext;
  private timeouts: number[] = [];

  // Game state
  private phase: GamePhase = 'banner';
  private phaseTimer = 0;
  private totalTime = 0;
  private promptIndex = 0;
  private promptsTotal = 4;
  private inputLocked = true;

  // Per-letter state
  private currentLetter: LetterItem | null = null;
  private stars: ConstellationStar[] = [];

  // Choice state
  private choices: ChoiceButton[] = [];
  private choiceAnswered = false;
  private choiceFlashTimer = 0;

  // Word building state
  private mode: PromptMode = 'letter';
  private currentWord: CVCWord | null = null;
  private wordTiles: WordTile[] = [];
  private nextLetterIndex = 0; // which letter in the word to place next
  private wordUsedIndices: number[] = []; // track used cvcWords indices to avoid repeats
  private wordAnimating = false; // true while a tile is sliding into a slot

  // Rhyme mode state
  private rhymeTarget = ''; // the word displayed at top (e.g., "CAT")
  private rhymeFamily = ''; // the family suffix (e.g., "-AT")
  private rhymeChoices: RhymeChoice[] = [];
  private rhymeAnswered = false;
  private rhymeFlashTimer = 0;

  // Audio shortcut
  private get audio() { return this.gameContext.audio; }

  // Difficulty helpers
  private get isOwen(): boolean { return session.currentTurn === 'owen'; }

  /** Determine the current prompt mode based on difficulty and promptIndex */
  private get currentMode(): PromptMode {
    if (this.isOwen) return 'letter';
    // Kian rotation: letter (0) -> phonics (1) -> word (2) -> rhyme (3) -> letter (4) -> ...
    const m = this.promptIndex % 4;
    if (m === 0) return 'letter';
    if (m === 1) return 'phonics';
    if (m === 2) return 'word';
    return 'rhyme';
  }

  /** Whether current prompt is rhyming mode */
  private get isRhymeRound(): boolean {
    return this.mode === 'rhyme';
  }

  /** Kian phonics: every 3rd prompt starting at index 1 (for Kian) */
  private get isPhonicsRound(): boolean {
    return this.mode === 'phonics';
  }

  /** Whether current prompt is word building mode */
  private get isWordRound(): boolean {
    return this.mode === 'word';
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    setActivePool(this.particles);
    this.particles.clear();
    this.promptIndex = 0;
    this.inputLocked = true;
    this.totalTime = 0;

    // Dynamic corner sprite for current evolution stage
    this.sprite = new SpriteAnimator(SPRITES[evolutionSpriteKey()]);
    this.spriteScale = evolutionSpriteScale();

    if (this.audio) {
      this.voice = new VoiceSystem(this.audio);
    }

    this.promptsTotal = PROMPTS_PER_ROUND.phonicsArena;

    this.startBanner();
  }

  exit(): void {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    this.particles.clear();
    this.gameContext.events.emit({ type: 'hide-banner' });
  }

  private delay(fn: () => void, ms: number): void {
    this.timeouts.push(window.setTimeout(fn, ms) as unknown as number);
  }

  // -----------------------------------------------------------------------
  // Phase: Banner
  // -----------------------------------------------------------------------

  private startBanner(): void {
    if (this.promptIndex >= this.promptsTotal) {
      this.endRound();
      return;
    }

    // Alternate turns
    const turn = session.nextTurn();
    session.currentTurn = turn;

    this.phase = 'banner';
    this.phaseTimer = 0;
    this.inputLocked = true;
    this.stars = [];
    this.choices = [];
    this.wordTiles = [];
    this.currentWord = null;
    this.nextLetterIndex = 0;
    this.wordAnimating = false;
    this.rhymeTarget = '';
    this.rhymeFamily = '';
    this.rhymeChoices = [];
    this.rhymeAnswered = false;
    this.rhymeFlashTimer = 0;

    // Set mode for this prompt
    this.mode = this.currentMode;

    this.gameContext.events.emit({ type: 'show-banner', turn });

    if (this.promptIndex === 0) {
      this.voice?.narrate('Name the magic rune!');
    }
  }

  // -----------------------------------------------------------------------
  // Phase: Engage
  // -----------------------------------------------------------------------

  private startEngage(): void {
    this.phase = 'engage';
    this.phaseTimer = 0;

    this.gameContext.events.emit({ type: 'hide-banner' });

    // Three-Label Rule step 1: engagement
    const name = this.isOwen ? settings.littleTrainerName : settings.bigTrainerName;
    const action = this.isOwen ? 'point' : 'choose';
    this.voice?.engage(name, action);
  }

  // -----------------------------------------------------------------------
  // Phase: Show Letter (constellation auto-draws)
  // -----------------------------------------------------------------------

  private startShowLetter(): void {
    // Word building mode skips the constellation and goes straight to word-build
    if (this.isWordRound) {
      this.startWordBuild();
      return;
    }

    // Rhyme mode skips the constellation and goes straight to rhyme-choice
    if (this.isRhymeRound) {
      this.startRhymeChoice();
      return;
    }

    this.phase = 'show-letter';
    this.phaseTimer = 0;

    // Pick letter (cycle through starterLetters)
    this.currentLetter = starterLetters[this.promptIndex % starterLetters.length];

    // Check for spaced repetition first
    const repeats = tracker.getRepeatConcepts('letter');
    if (repeats.length > 0) {
      const found = starterLetters.find(l => repeats.includes(l.letter));
      if (found) {
        this.currentLetter = found;
        tracker.markRepeated(found.letter, 'letter');
      }
    }

    // Build star positions for this letter
    this.buildStars();

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.currentLetter.letter);

    this.audio?.playSynth('pop');
  }

  private buildStars(): void {
    const letter = this.currentLetter!.letter;
    const fullPath = letterPaths[letter];
    if (!fullPath) return;

    // Star count based on difficulty, using LetterItem starCount
    const starCount = this.isOwen
      ? (this.currentLetter!.starCount.little)
      : (this.currentLetter!.starCount.big);

    // Evenly sample points from the full path
    const step = Math.max(1, Math.floor(fullPath.length / starCount));
    const sampled: { x: number; y: number }[] = [];
    for (let i = 0; i < fullPath.length && sampled.length < starCount; i += step) {
      sampled.push(fullPath[i]);
    }
    // Ensure we have exactly starCount (pad with last if needed)
    while (sampled.length < starCount && fullPath.length > 0) {
      sampled.push(fullPath[fullPath.length - 1]);
    }

    // Convert normalised coordinates to canvas positions
    this.stars = sampled.map((sp) => ({
      x: LETTER_BOX.x + sp.x * LETTER_BOX.w,
      y: LETTER_BOX.y + sp.y * LETTER_BOX.h,
      appeared: false,
      pulseOffset: Math.random() * Math.PI * 2,
      scale: 0,
    }));
  }

  // -----------------------------------------------------------------------
  // Phase: Choice (letter or phonics question)
  // -----------------------------------------------------------------------

  private startChoice(): void {
    this.phase = 'choice';
    this.phaseTimer = 0;
    this.inputLocked = false;
    this.choiceAnswered = false;
    this.choiceFlashTimer = 0;

    const letter = this.currentLetter!.letter;

    if (this.isPhonicsRound) {
      // Phonics question: "What sound does this make?"
      const phonicsData = PHONICS[letter];
      if (!phonicsData) {
        // No phonics data, skip to next
        this.startNext();
        return;
      }

      // Ash voice: "What sound does C make? Cuh!" (MP3-first, TTS fallback)
      this.voice?.playAshLine(`phonics_${letter.toLowerCase()}`);

      // Build 2 choices: correct sound + wrong sound
      const correctChoice: ChoiceButton = {
        label: phonicsData.sound,
        correct: true,
        x: 0,
        y: 0,
        shakeTimer: 0,
      };
      const wrongChoice: ChoiceButton = {
        label: phonicsData.wrongSound,
        correct: false,
        x: 0,
        y: 0,
        shakeTimer: 0,
      };

      // Shuffle order
      this.choices = Math.random() < 0.5
        ? [correctChoice, wrongChoice]
        : [wrongChoice, correctChoice];
    } else {
      // Ash voice: "What letter is this? C! C for Charizard!" (MP3-first, TTS fallback)
      this.voice?.playAshLine(`letter_${letter.toLowerCase()}`);

      // Pick a wrong letter from starterLetters
      const wrongPool = starterLetters.filter(l => l.letter !== letter);
      const wrongLetter = wrongPool[Math.floor(Math.random() * wrongPool.length)];

      const correctChoice: ChoiceButton = {
        label: letter,
        correct: true,
        x: 0,
        y: 0,
        shakeTimer: 0,
      };
      const wrongChoice: ChoiceButton = {
        label: wrongLetter.letter,
        correct: false,
        x: 0,
        y: 0,
        shakeTimer: 0,
      };

      // Shuffle order
      this.choices = Math.random() < 0.5
        ? [correctChoice, wrongChoice]
        : [wrongChoice, correctChoice];
    }

    // Position choices in lower third
    const centerY = DESIGN_HEIGHT * 0.82;
    const gap = 60;
    const totalW = 2 * BTN_W + gap;
    const startX = (DESIGN_WIDTH - totalW) / 2;

    for (let i = 0; i < this.choices.length; i++) {
      this.choices[i].x = startX + i * (BTN_W + gap);
      this.choices[i].y = centerY;
    }

    this.hintLadder.startPrompt(
      this.isPhonicsRound ? PHONICS[letter]?.sound ?? letter : letter,
    );
  }

  private handleChoiceClick(x: number, y: number): void {
    if (this.choiceAnswered) return;

    for (const choice of this.choices) {
      if (
        x >= choice.x && x <= choice.x + BTN_W &&
        y >= choice.y && y <= choice.y + BTN_H
      ) {
        if (choice.correct) {
          // Correct answer!
          this.choiceAnswered = true;
          this.choiceFlashTimer = 1.0;

          // Track correct answer — use sound concept for phonics, letter for recognition
          const correctConcept = this.isPhonicsRound
            ? PHONICS[this.currentLetter!.letter]?.sound ?? this.currentLetter!.letter
            : this.currentLetter!.letter;
          tracker.recordAnswer(correctConcept, 'letter', true);
          this.flameMeter.addCharge(2);

          this.audio?.playSynth('correct-chime');
          this.audio?.playSynth('star-collect');
          session.awardStar(1);

          // Ash celebration: "YEAH! That's it!" / "AWESOME!" etc.
          this.voice?.ashCorrect();

          // Cross-game reinforcement: echo the letter/phonics after a delay
          if (this.isPhonicsRound) {
            const phonicsData = PHONICS[this.currentLetter!.letter];
            if (phonicsData) {
              this.voice?.crossReinforcPhonics(this.currentLetter!.letter, phonicsData.sound);
            }
          } else {
            this.voice?.crossReinforcPhonics(this.currentLetter!.letter, '');
          }

          this.particles.burst(
            choice.x + BTN_W / 2,
            choice.y + BTN_H / 2,
            30, theme.palette.celebration.gold, 150, 0.8,
          );
        } else {
          // Wrong answer — track under sound concept for phonics, letter for recognition
          const wrongConcept = this.isPhonicsRound
            ? PHONICS[this.currentLetter!.letter]?.sound ?? this.currentLetter!.letter
            : this.currentLetter!.letter;
          tracker.recordAnswer(wrongConcept, 'letter', false);
          this.audio?.playSynth('wrong-bonk');

          // Shake the wrong button
          choice.shakeTimer = 0.4;

          // Ash encouragement: "Not quite! Try again!" / "Almost! Keep looking!"
          this.voice?.ashWrong();

          this.hintLadder.onMiss();

          this.particles.burst(
            choice.x + BTN_W / 2,
            choice.y + BTN_H / 2,
            6, theme.palette.ui.incorrect, 40, 0.3,
          );

          // Check auto-complete
          if (this.hintLadder.autoCompleted) {
            this.choiceAnswered = true;
            this.choiceFlashTimer = 1.0;
            this.flameMeter.addCharge(0.5);
            this.audio?.playSynth('pop');

            // Play encouragement video clip
            const encClip = clipManager.pick('encouragement');
            if (encClip) {
              this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
            }
          }
        }
        return;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase: Word Build (CVC word building — Kian only)
  // -----------------------------------------------------------------------

  private startWordBuild(): void {
    this.phase = 'word-build';
    this.phaseTimer = 0;
    this.inputLocked = false;
    this.nextLetterIndex = 0;
    this.wordAnimating = false;

    // Pick a CVC word, avoiding recent repeats
    const available = cvcWords
      .map((w, i) => ({ w, i }))
      .filter(({ i }) => !this.wordUsedIndices.includes(i));

    const pool = available.length > 0 ? available : cvcWords.map((w, i) => ({ w, i }));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.currentWord = pick.w;
    this.wordUsedIndices.push(pick.i);
    // Keep only last 6 to allow re-use eventually
    if (this.wordUsedIndices.length > 6) {
      this.wordUsedIndices.shift();
    }

    // Ash voice: "Word build!" intro
    this.voice?.playAshLine('word_build');

    // Voice: "Let's build a word! Can you spell CAT?"
    this.voice?.narrate(`Let's build a word! Can you spell ${this.currentWord.word}?`);

    // Build letter tiles: 3 correct + 2 distractors = 5 tiles
    const correctLetters = [...this.currentWord.letters];
    const distractorPool = starterLetters
      .map(l => l.letter)
      .filter(l => !correctLetters.includes(l));

    // Pick 2 unique distractors
    const distractors: string[] = [];
    const shuffledPool = [...distractorPool].sort(() => Math.random() - 0.5);
    for (const d of shuffledPool) {
      if (distractors.length >= 2) break;
      distractors.push(d);
    }

    // Combine and shuffle all tiles
    const allLetters = [...correctLetters, ...distractors];
    for (let i = allLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allLetters[i], allLetters[j]] = [allLetters[j], allLetters[i]];
    }

    // Position tiles in an arc above the slots
    const tileCount = allLetters.length;
    const arcCenterX = DESIGN_WIDTH / 2;
    const arcCenterY = DESIGN_HEIGHT * 0.38;
    const arcSpread = (tileCount - 1) * (TILE_SIZE + TILE_GAP);
    const arcStartX = arcCenterX - arcSpread / 2;

    this.wordTiles = allLetters.map((letter, i) => {
      const tx = arcStartX + i * (TILE_SIZE + TILE_GAP);
      // Slight arc curve: middle tiles higher
      const arcOffset = Math.abs(i - (tileCount - 1) / 2) * 15;
      const ty = arcCenterY + arcOffset;
      return {
        letter,
        x: tx,
        y: ty,
        originX: tx,
        originY: ty,
        placed: false,
        shakeTimer: 0,
        animProgress: 0,
        targetX: 0,
        targetY: 0,
      };
    });

    // Initialize hint ladder for word building
    this.hintLadder.startPrompt(this.currentWord.letters[0]);

    this.audio?.playSynth('pop');
  }

  /** Get the slot positions for the 3 letter slots */
  private getSlotPositions(): { x: number; y: number }[] {
    const slotCount = 3;
    const totalW = slotCount * SLOT_SIZE + (slotCount - 1) * SLOT_GAP;
    const startX = (DESIGN_WIDTH - totalW) / 2;
    const slotY = DESIGN_HEIGHT * 0.62;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < slotCount; i++) {
      positions.push({
        x: startX + i * (SLOT_SIZE + SLOT_GAP),
        y: slotY,
      });
    }
    return positions;
  }

  private handleWordBuildClick(x: number, y: number): void {
    if (!this.currentWord || this.wordAnimating) return;
    if (this.nextLetterIndex >= this.currentWord.letters.length) return;

    const expectedLetter = this.currentWord.letters[this.nextLetterIndex];

    for (const tile of this.wordTiles) {
      if (tile.placed) continue;

      // Hit test on tile
      if (
        x >= tile.x && x <= tile.x + TILE_SIZE &&
        y >= tile.y && y <= tile.y + TILE_SIZE
      ) {
        if (tile.letter === expectedLetter) {
          // Correct letter tapped!
          this.placeCorrectTile(tile);
        } else {
          // Wrong letter
          tile.shakeTimer = 0.4;
          this.audio?.playSynth('wrong-bonk');
          this.voice?.ashWrong();
          this.hintLadder.onMiss();

          this.particles.burst(
            tile.x + TILE_SIZE / 2,
            tile.y + TILE_SIZE / 2,
            6, theme.palette.ui.incorrect, 40, 0.3,
          );

          // Check auto-complete from hint ladder
          if (this.hintLadder.autoCompleted) {
            this.autoPlaceRemainingLetters();
          }
        }
        return;
      }
    }
  }

  private placeCorrectTile(tile: WordTile): void {
    const slots = this.getSlotPositions();
    const targetSlot = slots[this.nextLetterIndex];

    tile.placed = true;
    tile.targetX = targetSlot.x + (SLOT_SIZE - TILE_SIZE) / 2;
    tile.targetY = targetSlot.y + (SLOT_SIZE - TILE_SIZE) / 2;
    tile.animProgress = 0;
    this.wordAnimating = true;

    // Voice says the sound
    const phonicsData = PHONICS[tile.letter];
    if (phonicsData) {
      this.voice?.hintRepeat(phonicsData.sound);
    }

    this.audio?.playSynth('correct-chime');
    this.audio?.playSynth('whoosh-up');
    this.audio?.playSynth('pattern-match');
    this.audio?.playSynth('star-collect');
    session.awardStar(1);

    // Particle burst at tile
    this.particles.burst(
      tile.x + TILE_SIZE / 2,
      tile.y + TILE_SIZE / 2,
      20, '#37B1E2', 100, 0.6,
    );

    this.nextLetterIndex++;

    // Reset hint ladder for next letter (if more letters remain)
    if (this.currentWord && this.nextLetterIndex < this.currentWord.letters.length) {
      this.hintLadder.startPrompt(this.currentWord.letters[this.nextLetterIndex]);
    }
  }

  private autoPlaceRemainingLetters(): void {
    if (!this.currentWord) return;

    // Place remaining letters one at a time with staggered delays
    const remaining = this.currentWord.letters.length - this.nextLetterIndex;
    for (let i = 0; i < remaining; i++) {
      this.delay(() => {
        if (!this.currentWord) return;
        const letter = this.currentWord.letters[this.nextLetterIndex];
        const tile = this.wordTiles.find(t => !t.placed && t.letter === letter);
        if (tile) {
          this.placeCorrectTile(tile);
        }
      }, i * 400);
    }

    // Play encouragement video clip
    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }
  }

  private startWordCelebrate(): void {
    this.phase = 'word-celebrate';
    this.phaseTimer = 0;
    this.inputLocked = true;

    if (!this.currentWord) return;

    // Ash voice: "Word complete!" celebration
    this.voice?.playAshLine('word_complete');

    // Word-complete ascending pops sound effect
    this.audio?.playSynth('word-complete');

    // Voice blends the word: "Cuh Ah Tuh... Cat!"
    this.voice?.narrate(this.currentWord.voiceBlend);

    // Ash celebration
    this.voice?.ashCorrect();

    // Track correct answer
    tracker.recordAnswer(this.currentWord.word, 'letter', true);

    // Flame charge: 3 for unassisted, 2 with hints, 1 on auto-complete
    const hintLevel = this.hintLadder.hintLevel;
    if (this.hintLadder.autoCompleted) {
      this.flameMeter.addCharge(1);
    } else if (hintLevel >= 1) {
      this.flameMeter.addCharge(2);
    } else {
      this.flameMeter.addCharge(3);
    }

    this.gameContext.events.emit({ type: 'celebration', intensity: 'normal' });

    // Big particle burst across the slot area
    const slots = this.getSlotPositions();
    for (const slot of slots) {
      this.particles.burst(
        slot.x + SLOT_SIZE / 2,
        slot.y + SLOT_SIZE / 2,
        20, theme.palette.celebration.gold, 120, 0.8,
      );
    }

    // Cross-game reinforcement: echo the word letters
    if (this.currentWord.letters[0]) {
      this.voice?.crossReinforcPhonics(this.currentWord.letters[0], '');
    }
  }

  // -----------------------------------------------------------------------
  // Phase: Rhyme Choice (rhyme awareness — Kian only)
  // -----------------------------------------------------------------------

  private startRhymeChoice(): void {
    this.phase = 'rhyme-choice';
    this.phaseTimer = 0;
    this.inputLocked = false;
    this.rhymeAnswered = false;
    this.rhymeFlashTimer = 0;

    // Pick a random rhyme group with at least 2 words
    const validGroups = rhymeGroups.filter(g => g.words.length >= 2);
    const group = validGroups[Math.floor(Math.random() * validGroups.length)];
    this.rhymeFamily = group.family;

    // Pick a target word from the group
    const targetIdx = Math.floor(Math.random() * group.words.length);
    this.rhymeTarget = group.words[targetIdx];

    // Pick a correct answer (different word from the same group)
    const sameFamily = group.words.filter(w => w !== this.rhymeTarget);
    const correctWord = sameFamily[Math.floor(Math.random() * sameFamily.length)];

    // Pick 2 distractors from DIFFERENT rhyme groups
    const otherGroups = rhymeGroups.filter(g => g.family !== group.family);
    const distractors: string[] = [];
    const shuffledOther = [...otherGroups].sort(() => Math.random() - 0.5);
    for (const og of shuffledOther) {
      if (distractors.length >= 2) break;
      const pick = og.words[Math.floor(Math.random() * og.words.length)];
      distractors.push(pick);
    }

    // Build 3 choices: 1 correct + 2 distractors
    const allChoices: RhymeChoice[] = [
      { word: correctWord, correct: true, x: 0, y: 0, shakeTimer: 0 },
      ...distractors.map(d => ({ word: d, correct: false, x: 0, y: 0, shakeTimer: 0 })),
    ];

    // Shuffle choices
    for (let i = allChoices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allChoices[i], allChoices[j]] = [allChoices[j], allChoices[i]];
    }

    // Position 3 choice buttons horizontally in lower third
    const centerY = DESIGN_HEIGHT * 0.78;
    const gap = 40;
    const totalW = allChoices.length * RHYME_BTN_W + (allChoices.length - 1) * gap;
    const startX = (DESIGN_WIDTH - totalW) / 2;

    for (let i = 0; i < allChoices.length; i++) {
      allChoices[i].x = startX + i * (RHYME_BTN_W + gap);
      allChoices[i].y = centerY;
    }

    this.rhymeChoices = allChoices;

    // Voice: "Which word rhymes with CAT?"
    this.voice?.narrate(`Which word rhymes with ${this.rhymeTarget}?`);

    // Initialize hint ladder
    this.hintLadder.startPrompt(correctWord);

    this.audio?.playSynth('pop');
  }

  private handleRhymeClick(x: number, y: number): void {
    if (this.rhymeAnswered) return;

    for (const choice of this.rhymeChoices) {
      if (
        x >= choice.x && x <= choice.x + RHYME_BTN_W &&
        y >= choice.y && y <= choice.y + RHYME_BTN_H
      ) {
        if (choice.correct) {
          // Correct answer!
          this.rhymeAnswered = true;
          this.rhymeFlashTimer = 1.0;

          tracker.recordAnswer(`rhyme_${this.rhymeFamily}`, 'letter', true);
          this.flameMeter.addCharge(2);

          this.audio?.playSynth('correct-chime');
          this.audio?.playSynth('star-collect');
          session.awardStar(1);

          // Ash celebration
          this.voice?.ashCorrect();

          // Voice: "CAT and BAT rhyme! AT! AT!"
          const suffix = this.rhymeFamily.replace('-', '');
          this.voice?.narrate(
            `${this.rhymeTarget} and ${choice.word} rhyme! ${suffix}! ${suffix}!`,
          );

          this.particles.burst(
            choice.x + RHYME_BTN_W / 2,
            choice.y + RHYME_BTN_H / 2,
            30, theme.palette.celebration.gold, 150, 0.8,
          );
        } else {
          // Wrong answer
          tracker.recordAnswer(`rhyme_${this.rhymeFamily}`, 'letter', false);
          this.audio?.playSynth('wrong-bonk');

          choice.shakeTimer = 0.4;
          this.voice?.ashWrong();
          this.hintLadder.onMiss();

          this.particles.burst(
            choice.x + RHYME_BTN_W / 2,
            choice.y + RHYME_BTN_H / 2,
            6, theme.palette.ui.incorrect, 40, 0.3,
          );

          // Check auto-complete
          if (this.hintLadder.autoCompleted) {
            this.rhymeAnswered = true;
            this.rhymeFlashTimer = 1.0;
            this.flameMeter.addCharge(0.5);
            this.audio?.playSynth('pop');

            const suffix = this.rhymeFamily.replace('-', '');
            this.voice?.narrate(
              `${this.rhymeTarget} and ${this.rhymeChoices.find(c => c.correct)!.word} rhyme! ${suffix}! ${suffix}!`,
            );

            // Play encouragement video clip
            const encClip = clipManager.pick('encouragement');
            if (encClip) {
              this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
            }
          }
        }
        return;
      }
    }
  }

  private startRhymeCelebrate(): void {
    this.phase = 'rhyme-celebrate';
    this.phaseTimer = 0;
    this.inputLocked = true;

    this.gameContext.events.emit({ type: 'celebration', intensity: 'normal' });

    // Flame charge: 3 unassisted, 2 hinted, 1 auto-complete
    const hintLevel = this.hintLadder.hintLevel;
    if (!this.hintLadder.autoCompleted && hintLevel === 0) {
      this.flameMeter.addCharge(1); // bonus on top of the 2 from correct click
    }

    // Big particle burst
    for (let i = 0; i < 20; i++) {
      const bx = randomRange(300, DESIGN_WIDTH - 300);
      const by = randomRange(200, DESIGN_HEIGHT - 200);
      this.particles.burst(bx, by, 3,
        FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)], 80, 0.7);
    }
  }

  private updateRhymeChoice(dt: number): void {
    // Update shake timers on buttons
    for (const choice of this.rhymeChoices) {
      if (choice.shakeTimer > 0) {
        choice.shakeTimer = Math.max(0, choice.shakeTimer - dt);
      }
    }

    // Flash timer for correct answer highlight
    if (this.rhymeFlashTimer > 0) {
      this.rhymeFlashTimer -= dt;
      if (this.rhymeFlashTimer <= 0) {
        this.startRhymeCelebrate();
      }
    }

    // Hint escalation during rhyme choice
    if (!this.rhymeAnswered) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1) {
        // Hint level 1: voice repeats which word rhymes
        const correctWord = this.rhymeChoices.find(c => c.correct)?.word ?? '';
        this.voice?.hintRepeat(correctWord);
      }
      if (this.hintLadder.autoCompleted && !this.rhymeAnswered) {
        this.rhymeAnswered = true;
        this.rhymeFlashTimer = 1.0;
        this.flameMeter.addCharge(0.5);
        this.audio?.playSynth('pop');

        tracker.recordAnswer(`rhyme_${this.rhymeFamily}`, 'letter', false);

        const suffix = this.rhymeFamily.replace('-', '');
        this.voice?.narrate(
          `${this.rhymeTarget} and ${this.rhymeChoices.find(c => c.correct)!.word} rhyme! ${suffix}! ${suffix}!`,
        );

        // Play encouragement video clip
        const encClip = clipManager.pick('encouragement');
        if (encClip) {
          this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
        }
      }
    }
  }

  private updateWordBuild(dt: number): void {
    // Update tile shake timers
    for (const tile of this.wordTiles) {
      if (tile.shakeTimer > 0) {
        tile.shakeTimer = Math.max(0, tile.shakeTimer - dt);
      }
    }

    // Animate placed tiles sliding into slots
    let animating = false;
    for (const tile of this.wordTiles) {
      if (tile.placed && tile.animProgress < 1) {
        tile.animProgress = Math.min(1, tile.animProgress + dt / TILE_ANIM_DURATION);
        // Ease-out interpolation
        const t = 1 - Math.pow(1 - tile.animProgress, 3);
        tile.x = tile.originX + (tile.targetX - tile.originX) * t;
        tile.y = tile.originY + (tile.targetY - tile.originY) * t;
        animating = true;
      }
    }
    this.wordAnimating = animating;

    // Check if all letters are placed and animation is done
    if (
      this.currentWord &&
      this.nextLetterIndex >= this.currentWord.letters.length &&
      !this.wordAnimating
    ) {
      this.startWordCelebrate();
      return;
    }

    // Hint escalation during word building
    if (!this.wordAnimating && this.currentWord && this.nextLetterIndex < this.currentWord.letters.length) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1 && this.currentWord) {
        // Hint level 1: voice repeats the next letter sound
        const nextLetter = this.currentWord.letters[this.nextLetterIndex];
        const pd = PHONICS[nextLetter];
        if (pd) this.voice?.hintRepeat(pd.sound);
      }
      if (this.hintLadder.autoCompleted) {
        this.autoPlaceRemainingLetters();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase: Celebrate
  // -----------------------------------------------------------------------

  private startCelebrate(): void {
    this.phase = 'celebrate';
    this.phaseTimer = 0;
    this.inputLocked = true;

    this.gameContext.events.emit({ type: 'celebration', intensity: 'normal' });

    // Big particle burst across constellation area
    for (let i = 0; i < 25; i++) {
      const bx = randomRange(LETTER_BOX.x, LETTER_BOX.x + LETTER_BOX.w);
      const by = randomRange(LETTER_BOX.y, LETTER_BOX.y + LETTER_BOX.h);
      this.particles.burst(bx, by, 3,
        FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)], 80, 0.7);
    }
  }

  // -----------------------------------------------------------------------
  // Phase: Next / End
  // -----------------------------------------------------------------------

  private startNext(): void {
    this.phase = 'next';
    this.promptIndex++;

    if (this.promptIndex >= this.promptsTotal) {
      this.endRound();
    } else {
      this.startBanner();
    }
  }

  private endRound(): void {
    session.activitiesCompleted++;
    session.currentScreen = 'calm-reset';
    this.delay(() => {
      this.gameContext.screenManager.goTo('calm-reset');
    }, 500);
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  update(dt: number): void {
    this.totalTime += dt;
    this.phaseTimer += dt;
    this.bg.update(dt);
    this.particles.update(dt);
    this.sprite.update(dt);
    this.flameMeter.update(dt);

    switch (this.phase) {
      case 'banner':
        if (this.phaseTimer >= BANNER_DURATION) this.startEngage();
        break;

      case 'engage':
        if (this.phaseTimer >= ENGAGE_DURATION) this.startShowLetter();
        break;

      case 'show-letter':
        this.updateShowLetter(dt);
        if (this.phaseTimer >= SHOW_LETTER_DURATION) this.startChoice();
        break;

      case 'choice':
        this.updateChoice(dt);
        break;

      case 'word-build':
        this.updateWordBuild(dt);
        break;

      case 'word-celebrate':
        // Ambient celebration sparks during word celebrate
        if (Math.random() < 0.3) {
          this.particles.spawn({
            x: randomRange(200, DESIGN_WIDTH - 200),
            y: randomRange(200, DESIGN_HEIGHT - 200),
            vx: randomRange(-30, 30),
            vy: randomRange(-60, -20),
            color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
            size: randomRange(2, 6),
            lifetime: randomRange(0.3, 0.7),
            drag: 0.96,
            fadeOut: true,
            shrink: true,
          });
        }
        if (this.phaseTimer >= WORD_CELEBRATE_DURATION) {
          this.startNext();
        }
        break;

      case 'rhyme-choice':
        this.updateRhymeChoice(dt);
        break;

      case 'rhyme-celebrate':
        // Ambient celebration sparks during rhyme celebrate
        if (Math.random() < 0.3) {
          this.particles.spawn({
            x: randomRange(200, DESIGN_WIDTH - 200),
            y: randomRange(200, DESIGN_HEIGHT - 200),
            vx: randomRange(-30, 30),
            vy: randomRange(-60, -20),
            color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
            size: randomRange(2, 6),
            lifetime: randomRange(0.3, 0.7),
            drag: 0.96,
            fadeOut: true,
            shrink: true,
          });
        }
        if (this.phaseTimer >= RHYME_CELEBRATE_DURATION) {
          this.startNext();
        }
        break;

      case 'celebrate':
        // Ambient celebration sparks
        if (Math.random() < 0.3) {
          this.particles.spawn({
            x: randomRange(200, DESIGN_WIDTH - 200),
            y: randomRange(200, DESIGN_HEIGHT - 200),
            vx: randomRange(-30, 30),
            vy: randomRange(-60, -20),
            color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
            size: randomRange(2, 6),
            lifetime: randomRange(0.3, 0.7),
            drag: 0.96,
            fadeOut: true,
            shrink: true,
          });
        }
        if (this.phaseTimer >= CELEBRATE_DURATION) {
          this.startNext();
        }
        break;
    }

    // Ambient blue embers near the constellation during show-letter, choice, word-build, and rhyme-choice
    if (
      (this.phase === 'show-letter' || this.phase === 'choice' || this.phase === 'word-build' || this.phase === 'rhyme-choice') &&
      Math.random() < 0.1
    ) {
      this.particles.spawn({
        x: LETTER_BOX.x + randomRange(0, LETTER_BOX.w),
        y: LETTER_BOX.y + randomRange(0, LETTER_BOX.h),
        vx: randomRange(-10, 10),
        vy: randomRange(-40, -15),
        color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        size: randomRange(1.5, 4),
        lifetime: randomRange(0.4, 1.0),
        drag: 0.97,
        fadeOut: true,
        shrink: true,
      });
    }
  }

  private updateShowLetter(dt: number): void {
    // Stars appear one by one with staggered timing
    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      const appearTime = i * STAR_STAGGER;

      if (this.phaseTimer >= appearTime && !star.appeared) {
        star.appeared = true;
        star.scale = 0;

        // Particle burst when star appears
        this.particles.burst(star.x, star.y, 10, '#37B1E2', 80, 0.5);
        this.particles.burst(star.x, star.y, 5, '#FFFFFF', 40, 0.3);

        this.audio?.playSynth('pop');
      }

      // Animate scale toward 1 for appeared stars
      if (star.appeared && star.scale < 1) {
        star.scale = Math.min(1, star.scale + dt * 4);
      }
    }
  }

  private updateChoice(dt: number): void {
    // Update shake timers on buttons
    for (const choice of this.choices) {
      if (choice.shakeTimer > 0) {
        choice.shakeTimer = Math.max(0, choice.shakeTimer - dt);
      }
    }

    // Flash timer for correct answer highlight
    if (this.choiceFlashTimer > 0) {
      this.choiceFlashTimer -= dt;
      if (this.choiceFlashTimer <= 0) {
        this.startCelebrate();
      }
    }

    // Hint escalation during choice
    if (!this.choiceAnswered) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1 && this.currentLetter) {
        if (this.isPhonicsRound) {
          const pd = PHONICS[this.currentLetter.letter];
          if (pd) this.voice?.hintRepeat(pd.sound);
        } else {
          this.voice?.hintRepeat(this.currentLetter.letter);
        }
      }
      if (this.hintLadder.autoCompleted && !this.choiceAnswered) {
        this.choiceAnswered = true;
        this.choiceFlashTimer = 1.0;
        this.flameMeter.addCharge(0.5);
        this.audio?.playSynth('pop');
        // Track auto-complete as incorrect (child did not answer; spaced repetition will re-surface)
        const concept = this.isPhonicsRound
          ? PHONICS[this.currentLetter!.letter]?.sound ?? this.currentLetter!.letter
          : this.currentLetter!.letter;
        tracker.recordAnswer(concept, 'letter', false);

        // Play encouragement video clip
        const encClip = clipManager.pick('encouragement');
        if (encClip) {
          this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    // Night sky background
    this.bg.render(ctx);

    // Extra dark overlay for deeper night sky
    ctx.fillStyle = 'rgba(0, 0, 20, 0.3)';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Dim background during show-letter/choice/word-build/rhyme to highlight stars
    if (this.phase === 'show-letter' || this.phase === 'choice' || this.phase === 'word-build' || this.phase === 'word-celebrate' || this.phase === 'rhyme-choice' || this.phase === 'rhyme-celebrate') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    }

    // Atmospheric glow behind constellation area
    this.renderAtmosphericGlow(ctx);

    // MCX sprite in top-right corner
    this.sprite.render(ctx, SPRITE_X, SPRITE_Y, this.spriteScale);

    // Warm glow behind sprite
    const glowGrad = ctx.createRadialGradient(SPRITE_X, SPRITE_Y, 20, SPRITE_X, SPRITE_Y, 200);
    glowGrad.addColorStop(0, 'rgba(55, 177, 226, 0.12)');
    glowGrad.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(SPRITE_X - 200, SPRITE_Y - 200, 400, 400);

    // Letter silhouette (faint background letter)
    if (
      this.currentLetter &&
      (this.phase === 'show-letter' || this.phase === 'choice' || this.phase === 'celebrate')
    ) {
      this.renderLetterSilhouette(ctx);
    }

    // Connecting lines between appeared stars
    this.renderConnectingLines(ctx);

    // Stars
    this.renderStars(ctx);

    // Particles
    this.particles.render(ctx);

    // Flame meter at top
    this.flameMeter.render(ctx);

    // Letter title during constellation / choice
    if (
      this.currentLetter &&
      (this.phase === 'show-letter' || this.phase === 'choice' || this.phase === 'celebrate')
    ) {
      this.renderLetterTitle(ctx);
    }

    // Phase-specific overlays
    if (this.phase === 'engage') {
      this.renderEngageText(ctx);
    }

    if (this.phase === 'choice') {
      this.renderChoiceUI(ctx);
    }

    if (this.phase === 'word-build' || this.phase === 'word-celebrate') {
      this.renderWordBuildUI(ctx);
    }

    if (this.phase === 'word-celebrate') {
      this.renderWordCelebration(ctx);
    }

    if (this.phase === 'rhyme-choice' || this.phase === 'rhyme-celebrate') {
      this.renderRhymeUI(ctx);
    }

    if (this.phase === 'rhyme-celebrate') {
      this.renderRhymeCelebration(ctx);
    }

    if (this.phase === 'celebrate') {
      this.renderCelebration(ctx);
    }

    // Progress dots
    if (this.phase !== 'banner' && this.phase !== 'next') {
      this.renderProgress(ctx);
    }
  }

  // -----------------------------------------------------------------------
  // Render: Atmospheric Glow
  // -----------------------------------------------------------------------

  private renderAtmosphericGlow(ctx: CanvasRenderingContext2D): void {
    const cx = LETTER_BOX.x + LETTER_BOX.w / 2;
    const cy = LETTER_BOX.y + LETTER_BOX.h / 2;
    const atmoGlow = ctx.createRadialGradient(cx, cy, 50, cx, cy, LETTER_BOX.w * 0.8);
    atmoGlow.addColorStop(0, 'rgba(55, 177, 226, 0.06)');
    atmoGlow.addColorStop(0.5, 'rgba(55, 177, 226, 0.02)');
    atmoGlow.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = atmoGlow;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
  }

  // -----------------------------------------------------------------------
  // Render: Letter Silhouette (large font, faint)
  // -----------------------------------------------------------------------

  private renderLetterSilhouette(ctx: CanvasRenderingContext2D): void {
    if (!this.currentLetter) return;

    const cx = LETTER_BOX.x + LETTER_BOX.w / 2;
    const cy = LETTER_BOX.y + LETTER_BOX.h / 2;

    // Determine opacity based on phase
    let alpha = 0.15;
    if (this.phase === 'show-letter') {
      // Fade in during show-letter
      alpha = Math.min(this.phaseTimer / 0.5, 1) * 0.15;
    } else if (this.phase === 'celebrate') {
      // Bright during celebration
      alpha = 0.4;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#37B1E2';
    ctx.font = 'bold 500px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow glow for silhouette effect
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 40;
    ctx.fillText(this.currentLetter.letter, cx, cy + 20);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Connecting Lines (blue fire trails)
  // -----------------------------------------------------------------------

  private renderConnectingLines(ctx: CanvasRenderingContext2D): void {
    for (let i = 1; i < this.stars.length; i++) {
      if (!this.stars[i].appeared) break;
      const prev = this.stars[i - 1];
      const cur = this.stars[i];

      if (!prev.appeared) continue;

      // Animate line drawing: fade in as current star scales up
      const lineAlpha = Math.min(cur.scale, 1);

      ctx.save();

      // Outer glow
      ctx.globalAlpha = 0.3 * lineAlpha;
      ctx.strokeStyle = '#37B1E2';
      ctx.lineWidth = 18;
      ctx.shadowColor = '#37B1E2';
      ctx.shadowBlur = 25;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();

      // Core line
      ctx.globalAlpha = 0.7 * lineAlpha;
      ctx.strokeStyle = '#91CCEC';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#FFFFFF';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();

      // White-hot center
      ctx.globalAlpha = 0.9 * lineAlpha;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();

      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Render: Stars
  // -----------------------------------------------------------------------

  private renderStars(ctx: CanvasRenderingContext2D): void {
    const starDiameter = 55;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      if (!star.appeared || star.scale <= 0) continue;

      const s = star.scale;

      ctx.save();
      ctx.translate(star.x, star.y);
      ctx.scale(s, s);

      const pulse = 1 + 0.1 * Math.sin(this.totalTime * 3 + star.pulseOffset);
      const bodyR = (starDiameter / 2) * pulse;

      // Outer glow halo
      const glowR = bodyR + 25;
      const outerGlow = ctx.createRadialGradient(0, 0, bodyR * 0.5, 0, 0, glowR);
      outerGlow.addColorStop(0, 'rgba(94, 212, 252, 0.4)');
      outerGlow.addColorStop(0.5, 'rgba(55, 177, 226, 0.2)');
      outerGlow.addColorStop(1, 'rgba(55, 177, 226, 0)');
      ctx.fillStyle = outerGlow;
      ctx.beginPath();
      ctx.arc(0, 0, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Star body
      const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, bodyR);
      bodyGrad.addColorStop(0, '#FFFFFF');
      bodyGrad.addColorStop(0.4, '#5ED4FC');
      bodyGrad.addColorStop(1, '#37B1E2');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, bodyR, 0, Math.PI * 2);
      ctx.fill();

      // Cross-glint sparkle
      const glintLen = bodyR * 1.4 * pulse;
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -glintLen); ctx.lineTo(0, glintLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-glintLen, 0); ctx.lineTo(glintLen, 0);
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Render: Letter Title
  // -----------------------------------------------------------------------

  private renderLetterTitle(ctx: CanvasRenderingContext2D): void {
    if (!this.currentLetter) return;

    const x = DESIGN_WIDTH / 2;
    const y = 80;
    const pulse = 0.7 + 0.3 * Math.sin(this.totalTime * 2.5);

    ctx.save();

    // Glow behind text
    ctx.save();
    ctx.globalAlpha = 0.3 * pulse;
    const glow = ctx.createRadialGradient(x, y, 10, x, y, 120);
    glow.addColorStop(0, '#37B1E2');
    glow.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Letter text
    ctx.save();
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 25 * pulse;
    ctx.font = 'bold 96px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(this.currentLetter.letter, x, y);
    ctx.fillText(this.currentLetter.letter, x, y);
    ctx.restore();

    // Word below
    ctx.font = 'bold 40px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(145, 204, 236, 0.8)';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    const subtitle = `${this.currentLetter.letter} is for ${this.currentLetter.word}`;
    ctx.strokeText(subtitle, x, y + 55);
    ctx.fillText(subtitle, x, y + 55);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Engage Text
  // -----------------------------------------------------------------------

  private renderEngageText(ctx: CanvasRenderingContext2D): void {
    const name = this.isOwen ? settings.littleTrainerName : settings.bigTrainerName;
    const action = this.isOwen ? 'point!' : 'choose!';
    const text = `${name}, ${action}`;

    ctx.save();
    ctx.font = 'bold 64px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(text, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.45);
    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Choice UI (letter or phonics buttons)
  // -----------------------------------------------------------------------

  private renderChoiceUI(ctx: CanvasRenderingContext2D): void {
    if (!this.currentLetter) return;

    // Question text
    ctx.save();
    ctx.font = 'bold 52px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';

    const question = this.isPhonicsRound
      ? `What sound does "${this.currentLetter.letter}" make?`
      : `What letter is this?`;

    const questionY = DESIGN_HEIGHT * 0.72;
    ctx.strokeText(question, DESIGN_WIDTH / 2, questionY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(question, DESIGN_WIDTH / 2, questionY);
    ctx.restore();

    // Choice buttons
    for (const choice of this.choices) {
      const highlighted = this.choiceAnswered && choice.correct && this.choiceFlashTimer > 0;
      const bgColor = highlighted ? theme.palette.celebration.gold : 'rgba(20, 20, 50, 0.85)';
      const borderColor = highlighted ? '#FFFFFF' : 'rgba(55, 177, 226, 0.6)';

      // Hint level 2+: glow on correct choice
      const isCorrectHint = choice.correct &&
        !this.choiceAnswered &&
        this.hintLadder.hintLevel >= 2;

      ctx.save();

      // Apply shake offset for wrong answer feedback
      let shakeOffsetX = 0;
      if (choice.shakeTimer > 0) {
        shakeOffsetX = Math.sin(choice.shakeTimer * 40) * 8 * (choice.shakeTimer / 0.4);
      }

      const drawX = choice.x + shakeOffsetX;
      const drawY = choice.y;

      // Hint glow behind correct button
      if (isCorrectHint) {
        const hintPulse = 1 + Math.sin(this.totalTime * 5) * 0.15;
        ctx.save();
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 25 * hintPulse;
        ctx.strokeStyle = '#37B1E2';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(drawX - 4, drawY - 4, BTN_W + 8, BTN_H + 8, 20);
        ctx.stroke();
        ctx.restore();
      }

      // Button background
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, BTN_W, BTN_H, 16);
      ctx.fill();

      // Button border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, BTN_W, BTN_H, 16);
      ctx.stroke();

      // Button text
      ctx.fillStyle = highlighted ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 56px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(choice.label, drawX + BTN_W / 2, drawY + BTN_H / 2);

      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Render: Celebration
  // -----------------------------------------------------------------------

  private renderCelebration(ctx: CanvasRenderingContext2D): void {
    const t = Math.min(this.phaseTimer / 0.3, 1);
    const scale = 0.5 + 0.5 * t; // simple ease
    const fadeStart = CELEBRATE_DURATION * 0.75;
    const alpha = this.phaseTimer < fadeStart
      ? 1
      : 1 - (this.phaseTimer - fadeStart) / (CELEBRATE_DURATION - fadeStart);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textX = DESIGN_WIDTH / 2;
    const textY = DESIGN_HEIGHT * 0.35;

    // Glow
    ctx.save();
    ctx.shadowColor = theme.palette.celebration.gold;
    ctx.shadowBlur = 40;
    ctx.font = `bold ${Math.round(96 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = theme.palette.celebration.gold;
    ctx.fillText('GREAT!', textX, textY);
    ctx.restore();

    // Solid text
    ctx.font = `bold ${Math.round(96 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('GREAT!', textX, textY);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Word Build UI
  // -----------------------------------------------------------------------

  private renderWordBuildUI(ctx: CanvasRenderingContext2D): void {
    if (!this.currentWord) return;

    // Title: the word to build
    ctx.save();
    ctx.font = 'bold 56px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';

    const titleText = `Spell: ${this.currentWord.word}`;
    const titleY = DESIGN_HEIGHT * 0.14;
    ctx.strokeText(titleText, DESIGN_WIDTH / 2, titleY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(titleText, DESIGN_WIDTH / 2, titleY);
    ctx.restore();

    // Draw letter slots (empty boxes)
    const slots = this.getSlotPositions();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const isFilled = i < this.nextLetterIndex;
      const isNext = i === this.nextLetterIndex && this.phase === 'word-build';

      ctx.save();

      // Slot background
      ctx.fillStyle = isFilled
        ? 'rgba(55, 177, 226, 0.15)'
        : 'rgba(10, 10, 30, 0.7)';
      ctx.beginPath();
      ctx.roundRect(slot.x, slot.y, SLOT_SIZE, SLOT_SIZE, 14);
      ctx.fill();

      // Slot border — pulsing cyan for next slot, static for others
      if (isNext) {
        const pulse = 0.5 + 0.5 * Math.sin(this.totalTime * 4);
        ctx.strokeStyle = `rgba(55, 177, 226, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 12 * pulse;
      } else {
        ctx.strokeStyle = isFilled ? '#37B1E2' : 'rgba(55, 177, 226, 0.4)';
        ctx.lineWidth = 3;
      }
      ctx.beginPath();
      ctx.roundRect(slot.x, slot.y, SLOT_SIZE, SLOT_SIZE, 14);
      ctx.stroke();

      // Dash placeholder for empty unfilled slots
      if (!isFilled) {
        ctx.fillStyle = 'rgba(55, 177, 226, 0.3)';
        ctx.font = 'bold 60px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', slot.x + SLOT_SIZE / 2, slot.y + SLOT_SIZE / 2);
      }

      ctx.restore();
    }

    // Draw letter tiles (unplaced ones at original positions, placed ones at animated positions)
    for (const tile of this.wordTiles) {
      if (tile.placed && tile.animProgress >= 1) {
        // Render placed tile in slot with constellation blue glow
        this.renderPlacedTile(ctx, tile);
      } else if (tile.placed) {
        // Render animating tile
        this.renderAnimatingTile(ctx, tile);
      } else {
        // Render available tile
        this.renderAvailableTile(ctx, tile);
      }
    }

    // Hint level 3: dashed arrow from MCX to correct next tile
    if (
      this.phase === 'word-build' &&
      !this.wordAnimating &&
      this.hintLadder.hintLevel >= 3 &&
      this.currentWord &&
      this.nextLetterIndex < this.currentWord.letters.length
    ) {
      const nextLetter = this.currentWord.letters[this.nextLetterIndex];
      const hintTile = this.wordTiles.find(t => !t.placed && t.letter === nextLetter);
      if (hintTile) {
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = '#37B1E2';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(this.totalTime * 4);
        ctx.beginPath();
        ctx.moveTo(SPRITE_X, SPRITE_Y + 60);
        ctx.lineTo(hintTile.x + TILE_SIZE / 2, hintTile.y + TILE_SIZE / 2);
        ctx.stroke();

        // Arrow head
        const dx = hintTile.x + TILE_SIZE / 2 - SPRITE_X;
        const dy = hintTile.y + TILE_SIZE / 2 - (SPRITE_Y + 60);
        const angle = Math.atan2(dy, dx);
        const headLen = 16;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(hintTile.x + TILE_SIZE / 2, hintTile.y + TILE_SIZE / 2);
        ctx.lineTo(
          hintTile.x + TILE_SIZE / 2 - headLen * Math.cos(angle - 0.4),
          hintTile.y + TILE_SIZE / 2 - headLen * Math.sin(angle - 0.4),
        );
        ctx.moveTo(hintTile.x + TILE_SIZE / 2, hintTile.y + TILE_SIZE / 2);
        ctx.lineTo(
          hintTile.x + TILE_SIZE / 2 - headLen * Math.cos(angle + 0.4),
          hintTile.y + TILE_SIZE / 2 - headLen * Math.sin(angle + 0.4),
        );
        ctx.stroke();

        ctx.restore();
      }
    }
  }

  private renderAvailableTile(ctx: CanvasRenderingContext2D, tile: WordTile): void {
    ctx.save();

    // Apply shake offset
    let shakeOffsetX = 0;
    if (tile.shakeTimer > 0) {
      shakeOffsetX = Math.sin(tile.shakeTimer * 40) * 8 * (tile.shakeTimer / 0.4);
    }

    const drawX = tile.x + shakeOffsetX;
    const drawY = tile.y;

    // Hint level 2+: pulsing cyan glow on correct next letter
    if (
      this.currentWord &&
      this.nextLetterIndex < this.currentWord.letters.length &&
      tile.letter === this.currentWord.letters[this.nextLetterIndex] &&
      this.hintLadder.hintLevel >= 2
    ) {
      const pulse = 1 + Math.sin(this.totalTime * 5) * 0.15;
      ctx.shadowColor = '#37B1E2';
      ctx.shadowBlur = 20 * pulse;
      ctx.strokeStyle = '#37B1E2';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(drawX - 4, drawY - 4, TILE_SIZE + 8, TILE_SIZE + 8, 16);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Tile background — fire-themed gradient
    const grad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + TILE_SIZE);
    grad.addColorStop(0, '#FF6B35');
    grad.addColorStop(0.5, '#F08030');
    grad.addColorStop(1, '#D45137');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, TILE_SIZE, TILE_SIZE, 12);
    ctx.fill();

    // Tile border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(drawX, drawY, TILE_SIZE, TILE_SIZE, 12);
    ctx.stroke();

    // Letter text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 60px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(tile.letter, drawX + TILE_SIZE / 2, drawY + TILE_SIZE / 2);

    ctx.restore();
  }

  private renderAnimatingTile(ctx: CanvasRenderingContext2D, tile: WordTile): void {
    ctx.save();

    // Tile is mid-animation — render at current interpolated position
    const grad = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + TILE_SIZE);
    grad.addColorStop(0, '#5ED4FC');
    grad.addColorStop(0.5, '#37B1E2');
    grad.addColorStop(1, '#1A5C8A');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.roundRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE, 12);
    ctx.fill();

    // Letter text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 60px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 3;
    ctx.fillText(tile.letter, tile.x + TILE_SIZE / 2, tile.y + TILE_SIZE / 2);

    ctx.restore();
  }

  private renderPlacedTile(ctx: CanvasRenderingContext2D, tile: WordTile): void {
    ctx.save();

    // Placed tile with constellation blue glow
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 12;

    const grad = ctx.createLinearGradient(tile.x, tile.y, tile.x, tile.y + TILE_SIZE);
    grad.addColorStop(0, '#5ED4FC');
    grad.addColorStop(0.5, '#37B1E2');
    grad.addColorStop(1, '#1A5C8A');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE, 12);
    ctx.fill();

    // Bright border
    ctx.strokeStyle = '#91CCEC';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(tile.x, tile.y, TILE_SIZE, TILE_SIZE, 12);
    ctx.stroke();

    // Letter text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 60px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 3;
    ctx.fillText(tile.letter, tile.x + TILE_SIZE / 2, tile.y + TILE_SIZE / 2);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Word Celebration
  // -----------------------------------------------------------------------

  private renderWordCelebration(ctx: CanvasRenderingContext2D): void {
    if (!this.currentWord) return;

    const t = Math.min(this.phaseTimer / 0.4, 1);
    // Scale: 1.0 -> 1.3 -> 1.0
    const scaleT = t < 0.5 ? t * 2 : 2 - t * 2;
    const scale = 1.0 + 0.3 * scaleT;

    const fadeStart = WORD_CELEBRATE_DURATION * 0.75;
    const alpha = this.phaseTimer < fadeStart
      ? 1
      : 1 - (this.phaseTimer - fadeStart) / (WORD_CELEBRATE_DURATION - fadeStart);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textX = DESIGN_WIDTH / 2;
    const textY = DESIGN_HEIGHT * 0.28;

    // Gold glow
    ctx.save();
    ctx.shadowColor = theme.palette.celebration.gold;
    ctx.shadowBlur = 40;
    ctx.font = `bold ${Math.round(120 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = theme.palette.celebration.gold;
    ctx.fillText(this.currentWord.word, textX, textY);
    ctx.restore();

    // Solid white text on top
    ctx.font = `bold ${Math.round(120 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(this.currentWord.word, textX, textY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(this.currentWord.word, textX, textY);

    // "GREAT!" subtitle
    ctx.font = `bold ${Math.round(64 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = theme.palette.celebration.gold;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText('GREAT!', textX, textY + 80 * scale);
    ctx.fillText('GREAT!', textX, textY + 80 * scale);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Rhyme UI
  // -----------------------------------------------------------------------

  private renderRhymeUI(ctx: CanvasRenderingContext2D): void {
    if (!this.rhymeTarget) return;

    const centerX = DESIGN_WIDTH / 2;

    // "Rhymes with:" label
    ctx.save();
    ctx.font = 'bold 44px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(145, 204, 236, 0.9)';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    const labelY = DESIGN_HEIGHT * 0.22;
    ctx.strokeText('Rhymes with:', centerX, labelY);
    ctx.fillText('Rhymes with:', centerX, labelY);
    ctx.restore();

    // Target word displayed large (64px, gold) at center-top
    ctx.save();
    const targetY = DESIGN_HEIGHT * 0.34;
    const pulse = 0.8 + 0.2 * Math.sin(this.totalTime * 2.5);

    // Gold glow behind target word
    ctx.save();
    ctx.globalAlpha = 0.4 * pulse;
    const glow = ctx.createRadialGradient(centerX, targetY, 10, centerX, targetY, 160);
    glow.addColorStop(0, theme.palette.celebration.gold);
    glow.addColorStop(1, 'rgba(255, 200, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(centerX, targetY, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Target word text
    ctx.shadowColor = theme.palette.celebration.gold;
    ctx.shadowBlur = 25 * pulse;
    ctx.font = 'bold 96px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(this.rhymeTarget, centerX, targetY);
    ctx.fillStyle = theme.palette.celebration.gold;
    ctx.fillText(this.rhymeTarget, centerX, targetY);
    ctx.restore();

    // "Which word rhymes?" question text
    ctx.save();
    ctx.font = 'bold 48px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    const questionY = DESIGN_HEIGHT * 0.54;
    ctx.strokeText('Which word rhymes?', centerX, questionY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Which word rhymes?', centerX, questionY);
    ctx.restore();

    // Choice buttons
    for (const choice of this.rhymeChoices) {
      const highlighted = this.rhymeAnswered && choice.correct && this.rhymeFlashTimer > 0;
      const bgColor = highlighted ? theme.palette.celebration.gold : 'rgba(20, 20, 50, 0.85)';
      const borderColor = highlighted ? '#FFFFFF' : 'rgba(55, 177, 226, 0.6)';

      // Hint level 2+: glow on correct choice
      const isCorrectHint = choice.correct &&
        !this.rhymeAnswered &&
        this.hintLadder.hintLevel >= 2;

      ctx.save();

      // Apply shake offset for wrong answer feedback
      let shakeOffsetX = 0;
      if (choice.shakeTimer > 0) {
        shakeOffsetX = Math.sin(choice.shakeTimer * 40) * 8 * (choice.shakeTimer / 0.4);
      }

      const drawX = choice.x + shakeOffsetX;
      const drawY = choice.y;

      // Hint glow behind correct button
      if (isCorrectHint) {
        const hintPulse = 1 + Math.sin(this.totalTime * 5) * 0.15;
        ctx.save();
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 25 * hintPulse;
        ctx.strokeStyle = '#37B1E2';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(drawX - 4, drawY - 4, RHYME_BTN_W + 8, RHYME_BTN_H + 8, 20);
        ctx.stroke();
        ctx.restore();
      }

      // Button background
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, RHYME_BTN_W, RHYME_BTN_H, 16);
      ctx.fill();

      // Button border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(drawX, drawY, RHYME_BTN_W, RHYME_BTN_H, 16);
      ctx.stroke();

      // Button text
      ctx.fillStyle = highlighted ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 52px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(choice.word, drawX + RHYME_BTN_W / 2, drawY + RHYME_BTN_H / 2);

      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Render: Rhyme Celebration
  // -----------------------------------------------------------------------

  private renderRhymeCelebration(ctx: CanvasRenderingContext2D): void {
    const t = Math.min(this.phaseTimer / 0.4, 1);
    const scaleT = t < 0.5 ? t * 2 : 2 - t * 2;
    const scale = 1.0 + 0.3 * scaleT;

    const fadeStart = RHYME_CELEBRATE_DURATION * 0.75;
    const alpha = this.phaseTimer < fadeStart
      ? 1
      : 1 - (this.phaseTimer - fadeStart) / (RHYME_CELEBRATE_DURATION - fadeStart);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textX = DESIGN_WIDTH / 2;
    const textY = DESIGN_HEIGHT * 0.48;

    // Family suffix large
    const suffix = this.rhymeFamily;
    ctx.save();
    ctx.shadowColor = theme.palette.celebration.gold;
    ctx.shadowBlur = 40;
    ctx.font = `bold ${Math.round(96 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = theme.palette.celebration.gold;
    ctx.fillText(suffix, textX, textY);
    ctx.restore();

    // White text on top
    ctx.font = `bold ${Math.round(96 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeText(suffix, textX, textY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(suffix, textX, textY);

    // "THEY RHYME!" subtitle
    ctx.font = `bold ${Math.round(56 * scale)}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = theme.palette.celebration.gold;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText('THEY RHYME!', textX, textY + 70 * scale);
    ctx.fillText('THEY RHYME!', textX, textY + 70 * scale);

    ctx.restore();
  }

  // -----------------------------------------------------------------------
  // Render: Progress Dots
  // -----------------------------------------------------------------------

  private renderProgress(ctx: CanvasRenderingContext2D): void {
    const total = this.promptsTotal;
    const completed = this.promptIndex;
    const dotR = 10;
    const spacing = 36;
    const startX = DESIGN_WIDTH / 2 - ((total - 1) * spacing) / 2;
    const y = DESIGN_HEIGHT - 50;

    for (let i = 0; i < total; i++) {
      const dx = startX + i * spacing;
      const isCurrent = i === completed;

      ctx.save();

      if (i < completed) {
        ctx.fillStyle = '#37B1E2';
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(dx, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      } else if (isCurrent) {
        const pulse = 0.5 + 0.5 * Math.sin(this.totalTime * 3);
        ctx.strokeStyle = `rgba(94, 212, 252, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(dx, y, dotR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(55, 177, 226, ${0.3 + pulse * 0.2})`;
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.arc(dx, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // -----------------------------------------------------------------------
  // Input
  // -----------------------------------------------------------------------

  handleClick(x: number, y: number): void {
    if (this.phase === 'choice' && !this.inputLocked) {
      this.handleChoiceClick(x, y);
      return;
    }
    if (this.phase === 'word-build' && !this.inputLocked) {
      this.handleWordBuildClick(x, y);
      return;
    }
    if (this.phase === 'rhyme-choice' && !this.inputLocked) {
      this.handleRhymeClick(x, y);
      return;
    }
  }

  handleKey(key: string): void {
    if (key === 'Escape') {
      this.gameContext.screenManager.goTo('hub');
    }
  }
}
