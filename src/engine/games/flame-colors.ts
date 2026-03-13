// src/engine/games/flame-colors.ts
// Mini-game 1: Dragon Gem Hunt — Color Recognition, Mixing, Shade, Pattern & Sorting
//
// MCX sprite hovers in the top-right corner. Colored gem targets appear on screen.
// Voice says "Red. Find red!" — player taps the matching gem.
// Educational voice follows the Three-Label Rule throughout.
//
// Modes:
//   'find'     — classic color recognition (tap the named gem)
//   'mixing'   — two gems merge to reveal a secondary color, kid picks result
//   'shade'    — light/dark shade variants shown, kid picks the named shade
//   'pattern'  — what-color-comes-next sequence (ABAB, AABB, ABC)
//   'sorting'  — find ALL gems of one color (Owen only, categorization)
//   'object'   — "What color is the banana?" real-world association (Owen only)
//   'spelling' — "Spell RED" letter-by-letter spelling (Kian only)
//
// Owen (2.5yo): 2 choices, primary colors, 200px gems, stable positions, glow hints
//   promptIndex % 7: 0=find, 1=object, 2=mixing, 3=shade, 4=pattern, 5=sorting, 6=find
// Kian (4yo):   3-4 choices, extended palette, 160px gems, gentle drift, speed rounds
//   promptIndex % 6: 0=find, 1=find, 2=mixing, 3=shade, 4=pattern, 5=spelling
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
import {
  primaryColors,
  allColors,
  colorDifficulty,
  colorMixing,
  colorShades,
  colorPatterns,
  colorObjects,
  colorWords,
  type ColorItem,
  type ColorMixPair,
  type ColorPattern,
  type ColorObject,
} from '../../content/colors';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  PROMPTS_PER_ROUND,
} from '../../config/constants';
import { session } from '../../state/session.svelte';
import { settings } from '../../state/settings.svelte';
import { randomRange } from '../utils/math';
import { evolutionSpriteKey, evolutionSpriteScale } from '../utils/evolution-sprite';
import { clipManager } from '../screens/hub';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROMPTS_TOTAL = PROMPTS_PER_ROUND.flameColors; // 5
const BANNER_DURATION = 1.5;
const ENGAGE_DURATION = 1.0;
const CELEBRATE_DURATION = 1.2;

/** MCX sprite position (top-right corner, centered in visible area) */
const SPRITE_X = DESIGN_WIDTH - 260;
const SPRITE_Y = 180;

/** Gem radius per difficulty */
const GEM_RADIUS_OWEN = 100; // 200px diameter
const GEM_RADIUS_KIAN = 80;  // 160px diameter

/** Success echo celebrations */
const SUCCESS_ECHOES = ['flame!', 'gem!', 'power!'];

/** Mixing animation timing */
const MIXING_MERGE_DURATION = 1.5;  // seconds for gems to slide together
const MIXING_FLASH_DURATION = 0.3;  // flash/burst overlay
const MIXING_REVEAL_DURATION = 0.5; // result gem scale-in

/** Choice button dimensions (mixing, shade & pattern modes) */
const BTN_W = 280;
const BTN_H = 100;

/** Pattern mode: circle diameter + spacing */
const PATTERN_CIRCLE_R = 40;   // 80px diameter
const PATTERN_GAP = 160;       // space between circle centers

/** Sorting mode: collection zone dimensions */
const SORT_ZONE_X = 140;       // center of collection zone
const SORT_ZONE_Y = 540;       // center Y
const SORT_ZONE_W = 220;
const SORT_ZONE_H = 500;
const SORT_SLIDE_DURATION = 0.5; // seconds for gem to slide into zone

/** Spelling mode: letter button dimensions */
const LETTER_BTN_SIZE = 120;    // square button
const LETTER_BTN_GAP = 24;     // gap between letter buttons

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GemTarget {
  x: number;
  y: number;
  color: string;       // hex
  colorName: string;
  radius: number;
  alive: boolean;
  dimmed: boolean;
  bobPhase: number;
  sparklePhase: number;
  vx: number;          // drift velocity (0 for Owen)
  vy: number;
}

/** Choice button for mixing and shade modes */
interface ChoiceButton {
  label: string;
  colorHex: string;    // fill color for the gem swatch
  correct: boolean;
  x: number;
  y: number;
  shakeTimer: number;
}

type PromptMode = 'find' | 'mixing' | 'shade' | 'pattern' | 'sorting' | 'object' | 'spelling';

type GamePhase =
  | 'banner'
  | 'engage'
  | 'prompt'
  | 'play'
  | 'mixing-animate'   // gems sliding together
  | 'mixing-flash'     // merge burst
  | 'mixing-reveal'    // result gem appears, then choice
  | 'celebrate'
  | 'next';

/** A letter button for spelling mode */
interface LetterButton {
  letter: string;
  x: number;
  y: number;
  correct: boolean;      // is this the next expected letter?
  pressed: boolean;      // already tapped correctly?
  shakeTimer: number;
  scaleAnim: number;     // 0→1 pop-in on correct tap
}

/** A gem in sorting mode with slide-animation state */
interface SortingGem extends GemTarget {
  isTarget: boolean;      // should be collected?
  collected: boolean;     // already in collection zone?
  slideTimer: number;     // 0..SORT_SLIDE_DURATION while sliding
  slideStartX: number;    // original X when slide started
  slideStartY: number;    // original Y when slide started
  slotIndex: number;      // stacking position in collection zone
}

// ---------------------------------------------------------------------------
// FlameColorsGame (Dragon Gem Hunt)
// ---------------------------------------------------------------------------

export class FlameColorsGame implements GameScreen {
  // New systems
  private bg = new Background(20, 'volcanic-cave');
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
  private gems: GemTarget[] = [];
  private currentColor: ColorItem | null = null;
  private promptIndex = 0;
  private consecutiveCorrect = 0;
  private inputLocked = true;
  private lastColorName = '';

  // Mode state
  private mode: PromptMode = 'find';

  // Mixing state
  private mixPair: ColorMixPair | null = null;
  private mixGemA: GemTarget | null = null;
  private mixGemB: GemTarget | null = null;
  private mixResultGem: GemTarget | null = null;
  private mixStartAx = 0;
  private mixStartBx = 0;
  private mixCenterX = 0;
  private mixCenterY = 0;
  private mixFlashAlpha = 0;
  private mixResultScale = 0;

  // Shade state
  private shadeTarget: 'light' | 'dark' = 'light';
  private shadeBaseColor = '';

  // Choice buttons (used in mixing, shade & pattern modes)
  private choices: ChoiceButton[] = [];
  private choiceAnswered = false;
  private choiceFlashTimer = 0;

  // Pattern mode state
  private patternData: ColorPattern | null = null;
  private patternAnswerScale = 0;         // 0→1.1→1.0 reveal animation
  private patternAnswerRevealing = false;

  // Sorting mode state
  private sortingGems: SortingGem[] = [];
  private sortingTargetColor = '';         // e.g. 'red'
  private sortingTargetHex = '';
  private sortingTargetTotal = 0;          // how many target gems exist
  private sortingCollected = 0;            // how many collected so far
  private sortingWrongTaps = 0;            // wrong-tap counter for scoring

  // Object mode state (Owen: real-world color associations)
  private objectData: ColorObject | null = null;

  // Spelling mode state (Kian: spell color words letter by letter)
  private spellingWord = '';               // e.g. 'RED'
  private spellingIndex = 0;              // next letter index to tap
  private letterButtons: LetterButton[] = [];
  private spellingComplete = false;

  // Audio shortcut
  private get audio() { return this.gameContext.audio; }

  // Difficulty helpers
  private get isOwen(): boolean { return session.currentTurn === 'owen'; }
  private get difficulty() {
    return this.isOwen ? colorDifficulty.little : colorDifficulty.big;
  }

  // -----------------------------------------------------------------------
  // Mode selection
  // -----------------------------------------------------------------------

  /**
   * Decide mode for current promptIndex.
   *
   * Owen (little) — cycle of 7:
   *   0=find, 1=object, 2=mixing, 3=shade, 4=pattern, 5=sorting, 6=find
   *
   * Kian (big) — cycle of 6:
   *   0=find, 1=find, 2=mixing, 3=shade, 4=pattern, 5=spelling
   */
  private pickMode(): PromptMode {
    if (this.isOwen) {
      const slot = this.promptIndex % 7;
      if (slot === 1) return 'object';
      if (slot === 2) return 'mixing';
      if (slot === 3) return 'shade';
      if (slot === 4) return 'pattern';
      if (slot === 5) return 'sorting';
      return 'find';
    } else {
      const slot = this.promptIndex % 6;
      if (slot === 2) return 'mixing';
      if (slot === 3) return 'shade';
      if (slot === 4) return 'pattern';
      if (slot === 5) return 'spelling';
      return 'find';
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    setActivePool(this.particles);
    this.particles.clear();
    this.promptIndex = 0;
    this.consecutiveCorrect = 0;
    this.lastColorName = '';
    this.inputLocked = true;

    // Dynamic corner sprite for current evolution stage
    this.sprite = new SpriteAnimator(SPRITES[evolutionSpriteKey()]);
    this.spriteScale = evolutionSpriteScale();

    // Create voice system
    if (this.audio) {
      this.voice = new VoiceSystem(this.audio);
    }

    // Start first prompt cycle
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
  // Phase transitions
  // -----------------------------------------------------------------------

  private startBanner(): void {
    if (this.promptIndex >= PROMPTS_TOTAL) {
      this.endRound();
      return;
    }

    // Alternate turns
    const turn = session.nextTurn();
    session.currentTurn = turn;

    // Announce whose turn it is
    if (turn === 'owen') this.voice?.playAshLine('turn_owen');
    else if (turn === 'kian') this.voice?.playAshLine('turn_kian');

    this.phase = 'banner';
    this.phaseTimer = 0;
    this.inputLocked = true;
    this.gems = [];
    this.choices = [];
    this.choiceAnswered = false;
    this.choiceFlashTimer = 0;
    this.mixPair = null;
    this.mixGemA = null;
    this.mixGemB = null;
    this.mixResultGem = null;
    this.mixFlashAlpha = 0;
    this.mixResultScale = 0;

    // Reset pattern state
    this.patternData = null;
    this.patternAnswerScale = 0;
    this.patternAnswerRevealing = false;

    // Reset sorting state
    this.sortingGems = [];
    this.sortingTargetColor = '';
    this.sortingTargetHex = '';
    this.sortingCollected = 0;
    this.sortingWrongTaps = 0;
    this.sortingTargetTotal = 0;

    // Reset object mode state
    this.objectData = null;

    // Reset spelling mode state
    this.spellingWord = '';
    this.spellingIndex = 0;
    this.letterButtons = [];
    this.spellingComplete = false;

    // Show banner overlay
    this.gameContext.events.emit({ type: 'show-banner', turn });

    // Narrate intro on first prompt
    if (this.promptIndex === 0) {
      this.voice?.narrate('Help tune my flame!');
    }
  }

  private startEngage(): void {
    this.phase = 'engage';
    this.phaseTimer = 0;

    this.gameContext.events.emit({ type: 'hide-banner' });

    // Pre-prompt engagement (Three-Label Rule step 1)
    const name = this.isOwen ? settings.littleTrainerName : settings.bigTrainerName;
    const action = this.isOwen ? 'point' : 'find it';
    this.voice?.engage(name, action);
  }

  private startPrompt(): void {
    this.mode = this.pickMode();

    if (this.mode === 'mixing') {
      this.startMixingAnimate();
    } else if (this.mode === 'shade') {
      this.startShadePrompt();
    } else if (this.mode === 'pattern') {
      this.startPatternPrompt();
    } else if (this.mode === 'sorting') {
      this.startSortingPrompt();
    } else if (this.mode === 'object') {
      this.startObjectPrompt();
    } else if (this.mode === 'spelling') {
      this.startSpellingPrompt();
    } else {
      this.startFindPrompt();
    }
  }

  // ===================== FIND MODE (original) =============================

  private startFindPrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;
    tracker.startPromptTimer();

    // Pick target color
    this.pickColor();
    this.createGems();

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.currentColor!.name);

    // Ash voice prompt: "Find the RED one!" (MP3-first, TTS fallback)
    const colorName = this.currentColor!.name;
    this.voice?.playAshLine(`color_${colorName.toLowerCase()}`);

    // SFX pop
    this.audio?.playSynth('pop');

    // Transition to play phase after voice finishes (~0.8s)
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, 800);
  }

  private startPlay(): void {
    this.phase = 'play';
    this.phaseTimer = 0;
    this.inputLocked = false;
  }

  // ===================== MIXING MODE ======================================

  private startMixingAnimate(): void {
    this.phase = 'mixing-animate';
    this.phaseTimer = 0;
    this.inputLocked = true;
    tracker.startPromptTimer();

    // Pick a random mixing pair
    const pair = colorMixing[Math.floor(Math.random() * colorMixing.length)];
    this.mixPair = pair;

    // Look up hex colors for the pair
    const colorA = allColors.find(c => c.name === pair.a) ?? primaryColors[0];
    const colorB = allColors.find(c => c.name === pair.b) ?? primaryColors[1];
    const colorResult = allColors.find(c => c.name === pair.result) ?? allColors[0];

    // Set current color to the result (for celebration particles, etc.)
    this.currentColor = colorResult;

    const radius = this.isOwen ? GEM_RADIUS_OWEN : GEM_RADIUS_KIAN;
    this.mixCenterX = DESIGN_WIDTH / 2;
    this.mixCenterY = DESIGN_HEIGHT * 0.4;

    // Start positions: left and right
    this.mixStartAx = this.mixCenterX - 300;
    this.mixStartBx = this.mixCenterX + 300;

    this.mixGemA = this.makeGemFromHex(colorA.hex, colorA.name, radius);
    this.mixGemA.x = this.mixStartAx;
    this.mixGemA.y = this.mixCenterY;

    this.mixGemB = this.makeGemFromHex(colorB.hex, colorB.name, radius);
    this.mixGemB.x = this.mixStartBx;
    this.mixGemB.y = this.mixCenterY;

    this.mixResultGem = this.makeGemFromHex(colorResult.hex, colorResult.name, radius);
    this.mixResultGem.x = this.mixCenterX;
    this.mixResultGem.y = this.mixCenterY;

    this.mixFlashAlpha = 0;
    this.mixResultScale = 0;

    // Voice: "Blue and yellow make...?"
    this.voice?.narrate(`${pair.a} and ${pair.b} make...?`);

    this.audio?.playSynth('pop');
  }

  private startMixingFlash(): void {
    this.phase = 'mixing-flash';
    this.phaseTimer = 0;
    this.mixFlashAlpha = 1.0;

    // Big particle burst at merge point in result color
    const resultHex = this.mixResultGem?.color ?? '#ffffff';
    this.particles.burst(this.mixCenterX, this.mixCenterY, 60, resultHex, 250, 1.2);
    this.particles.burst(this.mixCenterX, this.mixCenterY, 30, '#ffffff', 150, 0.6);

    // Additional colored sparks from source colors
    if (this.mixGemA) {
      this.particles.burst(this.mixCenterX, this.mixCenterY, 15, this.mixGemA.color, 120, 0.8);
    }
    if (this.mixGemB) {
      this.particles.burst(this.mixCenterX, this.mixCenterY, 15, this.mixGemB.color, 120, 0.8);
    }

    this.audio?.playSynth('correct-chime');
  }

  private startMixingReveal(): void {
    this.phase = 'mixing-reveal';
    this.phaseTimer = 0;
    this.mixResultScale = 0;
  }

  private startMixingChoice(): void {
    this.phase = 'play';
    this.phaseTimer = 0;
    this.inputLocked = false;
    this.choiceAnswered = false;
    this.choiceFlashTimer = 0;

    const pair = this.mixPair!;
    const resultColor = allColors.find(c => c.name === pair.result) ?? allColors[0];

    // Build choices: correct result + distractors
    const choiceCount = this.isOwen ? 2 : 3;
    this.choices = [];

    // Correct choice
    this.choices.push({
      label: resultColor.name.toUpperCase(),
      colorHex: resultColor.hex,
      correct: true,
      x: 0, y: 0,
      shakeTimer: 0,
    });

    // Wrong choices: pick from colors that are NOT the result or source colors
    const wrongPool = allColors.filter(
      c => c.name !== pair.result && c.name !== pair.a && c.name !== pair.b,
    );
    const shuffledWrong = [...wrongPool].sort(() => Math.random() - 0.5);
    for (let i = 0; i < choiceCount - 1 && i < shuffledWrong.length; i++) {
      this.choices.push({
        label: shuffledWrong[i].name.toUpperCase(),
        colorHex: shuffledWrong[i].hex,
        correct: false,
        x: 0, y: 0,
        shakeTimer: 0,
      });
    }

    // Shuffle
    this.choices.sort(() => Math.random() - 0.5);

    // Position choices at bottom
    this.positionChoices();

    // Initialize hint ladder for the result color
    this.hintLadder.startPrompt(pair.result);

    // Voice: "What color did we make?"
    this.voice?.narrate('What color did we make?');
  }

  // ===================== SHADE MODE =======================================

  private startShadePrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;
    tracker.startPromptTimer();

    // Pick a base color that has shade definitions
    const shadeColorNames = Object.keys(colorShades);
    // Filter by difficulty: Owen = primary only, Kian = all
    const available = this.isOwen
      ? shadeColorNames.filter(n => primaryColors.some(p => p.name === n))
      : shadeColorNames;

    this.shadeBaseColor = available[Math.floor(Math.random() * available.length)];
    this.shadeTarget = Math.random() < 0.5 ? 'light' : 'dark';

    const shades = colorShades[this.shadeBaseColor];
    const correctHex = this.shadeTarget === 'light' ? shades.light : shades.dark;
    const wrongHex = this.shadeTarget === 'light' ? shades.dark : shades.light;

    // Set currentColor for celebration particles
    const baseColorItem = allColors.find(c => c.name === this.shadeBaseColor);
    this.currentColor = baseColorItem ?? primaryColors[0];

    // Build gem targets for shade matching (gems, not buttons)
    const radius = this.isOwen ? GEM_RADIUS_OWEN : GEM_RADIUS_KIAN;
    this.gems = [];

    // Correct shade gem
    const correctLabel = `${this.shadeTarget} ${this.shadeBaseColor}`;
    this.gems.push(this.makeGemFromHex(correctHex, correctLabel, radius));

    // Wrong shade gem
    const wrongLabel = `${this.shadeTarget === 'light' ? 'dark' : 'light'} ${this.shadeBaseColor}`;
    this.gems.push(this.makeGemFromHex(wrongHex, wrongLabel, radius));

    // Kian: add a third distractor (a different color entirely)
    if (!this.isOwen) {
      const distractors = allColors.filter(c => c.name !== this.shadeBaseColor);
      const distractor = distractors[Math.floor(Math.random() * distractors.length)];
      this.gems.push(this.makeGemFromHex(distractor.hex, distractor.name, radius));
    }

    // Shuffle and position
    this.gems.sort(() => Math.random() - 0.5);
    this.positionGems();

    // Initialize hint ladder
    this.hintLadder.startPrompt(correctLabel);

    // Voice prompt
    const shadeWord = this.shadeTarget.toUpperCase();
    this.voice?.narrate(`Find the ${shadeWord} ${this.shadeBaseColor}!`);
    this.audio?.playSynth('pop');

    // Transition to play
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, 800);
  }

  // ===================== PATTERN MODE =====================================

  private startPatternPrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;
    tracker.startPromptTimer();

    // Pick a pattern — Owen: only primary-color patterns; Kian: all
    const available = this.isOwen
      ? colorPatterns.filter(p =>
          p.sequence.every(c => primaryColors.some(pc => pc.name === c)) &&
          primaryColors.some(pc => pc.name === p.answer),
        )
      : colorPatterns;

    this.patternData = available[Math.floor(Math.random() * available.length)];
    this.patternAnswerScale = 0;
    this.patternAnswerRevealing = false;

    // Set currentColor for celebration particles
    const answerItem = allColors.find(c => c.name === this.patternData!.answer);
    this.currentColor = answerItem ?? primaryColors[0];

    // Build choice buttons: correct answer + distractors
    const choiceCount = this.isOwen ? 2 : 3;
    this.choices = [];
    this.choiceAnswered = false;
    this.choiceFlashTimer = 0;

    // Correct choice
    this.choices.push({
      label: this.patternData.answer.toUpperCase(),
      colorHex: this.currentColor.hex,
      correct: true,
      x: 0, y: 0,
      shakeTimer: 0,
    });

    // Wrong choices: colors not in the answer
    const wrongPool = (this.isOwen ? primaryColors : allColors).filter(
      c => c.name !== this.patternData!.answer,
    );
    const shuffledWrong = [...wrongPool].sort(() => Math.random() - 0.5);
    for (let i = 0; i < choiceCount - 1 && i < shuffledWrong.length; i++) {
      this.choices.push({
        label: shuffledWrong[i].name.toUpperCase(),
        colorHex: shuffledWrong[i].hex,
        correct: false,
        x: 0, y: 0,
        shakeTimer: 0,
      });
    }

    // Shuffle & position
    this.choices.sort(() => Math.random() - 0.5);
    this.positionChoices();

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.patternData.answer);

    // Ash voice: "Color pattern!" intro
    this.voice?.playAshLine('color_pattern');

    // Voice: "What color comes next?"
    this.voice?.narrate('What color comes next?');
    this.audio?.playSynth('pop');

    // Transition to play
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, 800);
  }

  private handlePatternChoiceClick(x: number, y: number): void {
    if (this.choiceAnswered) return;

    for (const choice of this.choices) {
      if (!this.isChoiceHit(choice, x, y)) continue;

      if (choice.correct) {
        this.choiceAnswered = true;
        this.inputLocked = true;

        const answerName = this.patternData!.answer;
        tracker.recordAnswer(answerName, 'color', true);

        const hinted = this.hintLadder.hintLevel > 0;
        this.flameMeter.addCharge(hinted ? 1 : 2);
        this.consecutiveCorrect++;

        this.audio?.playSynth('correct-chime');
        this.audio?.playSynth('pattern-match');
        this.audio?.playSynth('star-collect');
        session.awardStar(1);
        session.recordAnswer(true);
        session.recordSkillPractice('Colors');
        session.recordCorrectConcept('Colors', answerName);
        this.voice?.ashCorrect();
        this.voice?.crossReinforcColor(answerName);

        // Animate the answer circle filling in
        this.patternAnswerRevealing = true;
        this.patternAnswerScale = 0;

        // Particles at the choice button
        this.particles.burst(
          choice.x + BTN_W / 2, choice.y + BTN_H / 2,
          30, choice.colorHex, 150, 0.8,
        );
      } else {
        const answerName = this.patternData!.answer;
        tracker.recordAnswer(answerName, 'color', false);
        this.consecutiveCorrect = 0;

        this.audio?.playSynth('wrong-bonk');
        session.recordAnswer(false);
        choice.shakeTimer = 0.4;
        this.voice?.ashWrong();

        this.hintLadder.onMiss();

        this.particles.burst(
          choice.x + BTN_W / 2, choice.y + BTN_H / 2,
          6, '#ff6666', 40, 0.3,
        );

        if (this.hintLadder.autoCompleted) {
          this.autoCompletePattern();
        }
      }
      return;
    }
  }

  private autoCompletePattern(): void {
    this.choiceAnswered = true;
    this.inputLocked = true;

    const answerName = this.patternData?.answer ?? '';
    tracker.recordAnswer(answerName, 'color', false);
    this.flameMeter.addCharge(0.5);
    session.recordStruggledConcept('Colors', answerName);
    this.audio?.playSynth('pop');

    this.patternAnswerRevealing = true;
    this.patternAnswerScale = 0;

    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }
  }

  // ===================== SORTING MODE (Owen only) ==========================

  private startSortingPrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;
    tracker.startPromptTimer();

    // Pick two primary colors
    const shuffledColors = [...primaryColors].sort(() => Math.random() - 0.5);
    const targetItem = shuffledColors[0];
    const otherItem = shuffledColors[1];

    this.sortingTargetColor = targetItem.name;
    this.sortingTargetHex = targetItem.hex;
    this.currentColor = targetItem;

    // Create 5 gems: 3 target + 2 other
    const radius = GEM_RADIUS_OWEN;
    this.sortingGems = [];
    this.sortingCollected = 0;
    this.sortingWrongTaps = 0;
    this.sortingTargetTotal = 3;

    for (let i = 0; i < 3; i++) {
      this.sortingGems.push(this.makeSortingGem(targetItem, radius, true));
    }
    for (let i = 0; i < 2; i++) {
      this.sortingGems.push(this.makeSortingGem(otherItem, radius, false));
    }

    // Shuffle and scatter in center/right area
    this.sortingGems.sort(() => Math.random() - 0.5);
    this.positionSortingGems();

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.sortingTargetColor);

    // Ash voice: "Color sort!" intro
    this.voice?.playAshLine('color_sort');

    // Voice: "Find ALL the RED ones!"
    this.voice?.narrate(`Find ALL the ${targetItem.name} ones!`);
    this.audio?.playSynth('pop');

    // Transition to play
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, 800);
  }

  private makeSortingGem(item: ColorItem, radius: number, isTarget: boolean): SortingGem {
    return {
      x: 0, y: 0,
      color: item.hex,
      colorName: item.name,
      radius,
      alive: true,
      dimmed: false,
      bobPhase: randomRange(0, Math.PI * 2),
      sparklePhase: randomRange(0, Math.PI * 2),
      vx: 0,
      vy: 0,
      isTarget,
      collected: false,
      slideTimer: 0,
      slideStartX: 0,
      slideStartY: 0,
      slotIndex: 0,
    };
  }

  private positionSortingGems(): void {
    // Scatter gems in center/right area (leave left side for collection zone)
    const areaLeft = 400;
    const areaRight = DESIGN_WIDTH - 200;
    const areaTop = DESIGN_HEIGHT * 0.25;
    const areaBottom = DESIGN_HEIGHT * 0.75;

    // Use fixed slots to avoid overlap
    const slots = [
      { x: 600,  y: 350 },
      { x: 1000, y: 300 },
      { x: 1400, y: 380 },
      { x: 800,  y: 620 },
      { x: 1200, y: 650 },
    ];

    for (let i = 0; i < this.sortingGems.length; i++) {
      const gem = this.sortingGems[i];
      const slot = slots[i % slots.length];
      gem.x = slot.x + randomRange(-60, 60);
      gem.y = slot.y + randomRange(-40, 40);
      // Clamp to valid area
      gem.x = Math.max(areaLeft, Math.min(areaRight, gem.x));
      gem.y = Math.max(areaTop, Math.min(areaBottom, gem.y));
    }
  }

  private handleSortingClick(x: number, y: number): void {
    for (const gem of this.sortingGems) {
      if (gem.collected || !gem.alive) continue;
      if (!this.isGemHit(gem, x, y)) continue;

      if (gem.isTarget) {
        // Correct tap: collect this gem
        gem.collected = true;
        gem.slideStartX = gem.x;
        gem.slideStartY = gem.y;
        gem.slideTimer = 0;
        gem.slotIndex = this.sortingCollected;
        this.sortingCollected++;

        this.audio?.playSynth('correct-chime');
        this.audio?.playSynth('whoosh-up');
        this.audio?.playSynth('star-collect');
        session.awardStar(1);
        this.particles.burst(gem.x, gem.y, 25, gem.color, 150, 0.8);
        this.particles.burst(gem.x, gem.y, 10, '#ffffff', 80, 0.4);

        // Check if all targets collected
        if (this.sortingCollected >= this.sortingTargetTotal) {
          this.inputLocked = true;

          // Score based on wrong taps
          const charge = this.sortingWrongTaps === 0 ? 3
            : this.sortingWrongTaps <= 2 ? 2 : 1;
          this.flameMeter.addCharge(charge);
          this.consecutiveCorrect++;

          tracker.recordAnswer(this.sortingTargetColor, 'color', true);
          session.recordAnswer(true);
          session.recordSkillPractice('Colors');
          session.recordCorrectConcept('Colors', this.sortingTargetColor);

          // Ash voice: "Sort complete!" celebration
          this.voice?.playAshLine('color_sort_complete');

          this.voice?.ashCorrect();
          this.delay(() => {
            this.voice?.narrate(
              `You found all the ${this.sortingTargetColor} ones! Amazing!`,
            );
          }, 600);
          this.voice?.crossReinforcColor(this.sortingTargetColor);

          // Delay celebrate to let slide animation finish
          this.delay(() => {
            this.startCelebrate();
          }, SORT_SLIDE_DURATION * 1000 + 200);
        }
      } else {
        // Wrong color tapped
        this.sortingWrongTaps++;
        gem.dimmed = true;

        this.audio?.playSynth('wrong-bonk');
        session.recordAnswer(false);
        this.voice?.ashWrong();

        // Gentle shake: temporarily offset (handled in render via shakeTimer reuse)
        // We just mark it dimmed and let the hint ladder escalate
        this.hintLadder.onMiss();

        this.particles.burst(gem.x, gem.y, 6, '#ff6666', 40, 0.3);

        if (this.hintLadder.autoCompleted) {
          this.autoCompleteSorting();
        }
      }
      return;
    }
  }

  private autoCompleteSorting(): void {
    this.inputLocked = true;

    // Collect all remaining target gems
    for (const gem of this.sortingGems) {
      if (gem.isTarget && !gem.collected) {
        gem.collected = true;
        gem.slideStartX = gem.x;
        gem.slideStartY = gem.y;
        gem.slideTimer = 0;
        gem.slotIndex = this.sortingCollected;
        this.sortingCollected++;
      }
    }

    tracker.recordAnswer(this.sortingTargetColor, 'color', false);
    this.flameMeter.addCharge(0.5);
    session.recordStruggledConcept('Colors', this.sortingTargetColor);
    this.audio?.playSynth('pop');

    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }

    this.delay(() => {
      this.startCelebrate();
    }, SORT_SLIDE_DURATION * 1000 + 200);
  }

  // ===================== OBJECT MODE (Owen: real-world associations) =======

  private startObjectPrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;
    tracker.startPromptTimer();

    // Pick an object from primary-color objects (Owen's level)
    const primaryNames = primaryColors.map(c => c.name);
    const available = colorObjects.filter(o => primaryNames.includes(o.color));
    this.objectData = available[Math.floor(Math.random() * available.length)];

    // Set currentColor for celebration particles
    const colorItem = primaryColors.find(c => c.name === this.objectData!.color);
    this.currentColor = colorItem ?? primaryColors[0];

    // Build 2 gem choices: correct color + one distractor
    const radius = GEM_RADIUS_OWEN;
    this.gems = [];

    // Correct gem
    this.gems.push(this.makeGem(this.currentColor, radius));

    // Wrong gem: a different primary color
    const wrongPool = primaryColors.filter(c => c.name !== this.objectData!.color);
    const wrongItem = wrongPool[Math.floor(Math.random() * wrongPool.length)];
    this.gems.push(this.makeGem(wrongItem, radius));

    // Shuffle and position
    this.gems.sort(() => Math.random() - 0.5);
    this.positionGems();

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.objectData.color);

    // Ash object mode announcement
    this.voice?.playAshLine('color_object');

    // Voice: "What color is the banana?"
    this.voice?.narrate(`What color is the ${this.objectData.name}?`);
    this.audio?.playSynth('pop');

    // Transition to play
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, 800);
  }

  private handleObjectClick(x: number, y: number): void {
    if (!this.objectData) return;

    for (const gem of this.gems) {
      if (!gem.alive || gem.dimmed) continue;
      if (!this.isGemHit(gem, x, y)) continue;

      if (gem.colorName === this.objectData.color) {
        const hinted = this.hintLadder.hintLevel > 0;
        this.handleCorrect(gem, hinted);
      } else {
        this.handleWrong(gem);
      }
      return;
    }
  }

  // ===================== SPELLING MODE (Kian: spell color words) =========

  private startSpellingPrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;
    tracker.startPromptTimer();

    // Pick a random color word
    this.spellingWord = colorWords[Math.floor(Math.random() * colorWords.length)];
    this.spellingIndex = 0;
    this.spellingComplete = false;

    // Set currentColor for celebration particles
    const colorItem = allColors.find(
      c => c.name.toUpperCase() === this.spellingWord,
    );
    this.currentColor = colorItem ?? primaryColors[0];

    // Build letter buttons: the correct letters of the word + some distractors
    this.letterButtons = [];
    const wordLetters = this.spellingWord.split('');

    // Distractor letters: pick 2 random letters NOT in the word
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const distractorPool = alphabet
      .split('')
      .filter(l => !wordLetters.includes(l));
    const shuffledDistractors = [...distractorPool].sort(() => Math.random() - 0.5);
    const distractorCount = Math.min(2, shuffledDistractors.length);

    // Create all buttons (word letters + distractors), shuffled
    const allLetters: { letter: string; isWordLetter: boolean }[] = [];
    for (const l of wordLetters) {
      allLetters.push({ letter: l, isWordLetter: true });
    }
    for (let i = 0; i < distractorCount; i++) {
      allLetters.push({ letter: shuffledDistractors[i], isWordLetter: false });
    }
    allLetters.sort(() => Math.random() - 0.5);

    // Create LetterButton objects
    for (const item of allLetters) {
      this.letterButtons.push({
        letter: item.letter,
        x: 0,
        y: 0,
        correct: false,  // dynamically determined based on current spelling index
        pressed: false,
        shakeTimer: 0,
        scaleAnim: 0,
      });
    }

    // Position the letter buttons
    this.positionLetterButtons();

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.spellingWord);

    // Voice: "Spell RED!"
    this.voice?.narrate(`Spell ${this.spellingWord}!`);
    this.audio?.playSynth('pop');

    // Transition to play
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, 800);
  }

  private positionLetterButtons(): void {
    const count = this.letterButtons.length;
    const totalW = count * LETTER_BTN_SIZE + (count - 1) * LETTER_BTN_GAP;
    const startX = (DESIGN_WIDTH - totalW) / 2;
    const y = DESIGN_HEIGHT * 0.65;

    for (let i = 0; i < count; i++) {
      this.letterButtons[i].x = startX + i * (LETTER_BTN_SIZE + LETTER_BTN_GAP);
      this.letterButtons[i].y = y;
    }
  }

  private isLetterButtonHit(btn: LetterButton, x: number, y: number): boolean {
    return x >= btn.x && x <= btn.x + LETTER_BTN_SIZE &&
           y >= btn.y && y <= btn.y + LETTER_BTN_SIZE;
  }

  private handleSpellingClick(x: number, y: number): void {
    if (this.spellingComplete) return;

    const expectedLetter = this.spellingWord[this.spellingIndex];

    for (const btn of this.letterButtons) {
      if (btn.pressed) continue;
      if (!this.isLetterButtonHit(btn, x, y)) continue;

      if (btn.letter === expectedLetter) {
        // Correct letter tapped
        btn.pressed = true;
        btn.scaleAnim = 0;
        this.spellingIndex++;

        this.audio?.playSynth('correct-chime');
        this.particles.burst(
          btn.x + LETTER_BTN_SIZE / 2,
          btn.y + LETTER_BTN_SIZE / 2,
          15, this.currentColor?.hex ?? '#ffffff', 100, 0.6,
        );

        // Check if word is complete
        if (this.spellingIndex >= this.spellingWord.length) {
          this.spellingComplete = true;
          this.inputLocked = true;

          tracker.recordAnswer(this.spellingWord, 'color', true);

          const hinted = this.hintLadder.hintLevel > 0;
          this.flameMeter.addCharge(hinted ? 1 : 3);
          this.consecutiveCorrect++;

          this.audio?.playSynth('star-collect');
          session.awardStar(1);
          session.recordAnswer(true);
          session.recordSkillPractice('Colors');
          session.recordCorrectConcept('Colors', this.spellingWord.toLowerCase());
          this.voice?.ashCorrect();
          this.voice?.crossReinforcColor(this.spellingWord.toLowerCase());

          // Big celebration burst
          this.particles.burst(
            DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.4,
            50, this.currentColor?.hex ?? '#ffffff', 200, 1.0,
          );
          this.particles.burst(
            DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.4,
            20, '#ffffff', 120, 0.5,
          );

          this.delay(() => {
            this.startCelebrate();
          }, 400);
        }
      } else {
        // Wrong letter
        btn.shakeTimer = 0.4;
        this.audio?.playSynth('wrong-bonk');
        session.recordAnswer(false);
        this.voice?.ashWrong();

        this.hintLadder.onMiss();

        this.particles.burst(
          btn.x + LETTER_BTN_SIZE / 2,
          btn.y + LETTER_BTN_SIZE / 2,
          6, '#ff6666', 40, 0.3,
        );

        if (this.hintLadder.autoCompleted) {
          this.autoCompleteSpelling();
        }
      }
      return;
    }
  }

  private autoCompleteSpelling(): void {
    this.spellingComplete = true;
    this.inputLocked = true;

    // Mark remaining letters as pressed
    for (const btn of this.letterButtons) {
      if (!btn.pressed && this.spellingWord.includes(btn.letter)) {
        btn.pressed = true;
        btn.scaleAnim = 0;
      }
    }
    this.spellingIndex = this.spellingWord.length;

    tracker.recordAnswer(this.spellingWord, 'color', false);
    this.flameMeter.addCharge(0.5);
    session.recordStruggledConcept('Colors', this.spellingWord.toLowerCase());
    this.audio?.playSynth('pop');

    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }

    this.delay(() => {
      this.startCelebrate();
    }, 600);
  }

  private updateSpellingPlay(dt: number): void {
    // Update shake timers
    for (const btn of this.letterButtons) {
      if (btn.shakeTimer > 0) {
        btn.shakeTimer = Math.max(0, btn.shakeTimer - dt);
      }
      // Scale-in animation for pressed letters
      if (btn.pressed && btn.scaleAnim < 1) {
        btn.scaleAnim = Math.min(1, btn.scaleAnim + dt / 0.25);
      }
    }

    // Hint escalation
    if (!this.spellingComplete) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1) {
        const nextLetter = this.spellingWord[this.spellingIndex] ?? '';
        this.voice?.hintRepeat(nextLetter);
      }
      if (this.hintLadder.autoCompleted && !this.spellingComplete) {
        this.autoCompleteSpelling();
      }
    }
  }

  // -----------------------------------------------------------------------
  // Celebrate / Next / End
  // -----------------------------------------------------------------------

  private startCelebrate(): void {
    this.phase = 'celebrate';
    this.phaseTimer = 0;
    this.inputLocked = true;

    // Track prompt completion for clip spacing
    clipManager.onPromptComplete();

    // Celebration event for overlay
    this.gameContext.events.emit({
      type: 'celebration',
      intensity: 'normal',
    });
  }

  private startNext(): void {
    this.phase = 'next';
    this.promptIndex++;

    // Check if more prompts or end
    if (this.promptIndex >= PROMPTS_TOTAL) {
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
  // Color & gem creation
  // -----------------------------------------------------------------------

  private pickColor(): void {
    const available = this.difficulty.useSet === 'primary' ? primaryColors : allColors;

    // Check for spaced repetition concepts
    const repeats = tracker.getRepeatConcepts('color');
    let pick: ColorItem | undefined;

    if (repeats.length > 0) {
      // Try to revisit a previously-missed color
      pick = available.find(c => repeats.includes(c.name));
      if (pick) {
        tracker.markRepeated(pick.name, 'color');
      }
    }

    if (!pick) {
      // Pick random, avoiding repeat of last color
      const pool = available.length > 1
        ? available.filter(c => c.name !== this.lastColorName)
        : available;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }

    this.currentColor = pick;
    this.lastColorName = pick.name;
  }

  private createGems(): void {
    const diff = this.difficulty;
    const available = diff.useSet === 'primary' ? primaryColors : allColors;
    this.gems = [];

    const radius = this.isOwen ? GEM_RADIUS_OWEN : GEM_RADIUS_KIAN;

    // Correct gem
    this.gems.push(this.makeGem(this.currentColor!, radius));

    // Wrong gems
    const wrongPool = available.filter(c => c.name !== this.currentColor!.name);
    const shuffled = [...wrongPool].sort(() => Math.random() - 0.5);
    const wrongCount = diff.targetCount - 1;
    for (let i = 0; i < wrongCount; i++) {
      const wrong = shuffled[i % shuffled.length];
      this.gems.push(this.makeGem(wrong, radius));
    }

    // Shuffle so correct isn't always first
    this.gems.sort(() => Math.random() - 0.5);

    // Position gems
    this.positionGems();
  }

  private makeGem(item: ColorItem, radius: number): GemTarget {
    const driftSpeed = this.isOwen ? 0 : this.difficulty.driftSpeed * 0.3;
    return {
      x: 0, y: 0,
      color: item.hex,
      colorName: item.name,
      radius,
      alive: true,
      dimmed: false,
      bobPhase: randomRange(0, Math.PI * 2),
      sparklePhase: randomRange(0, Math.PI * 2),
      vx: randomRange(-driftSpeed, driftSpeed),
      vy: randomRange(-driftSpeed * 0.5, driftSpeed * 0.5),
    };
  }

  /** Create a gem from a raw hex + name (for mixing/shade where we bypass ColorItem) */
  private makeGemFromHex(hex: string, name: string, radius: number): GemTarget {
    const driftSpeed = this.isOwen ? 0 : this.difficulty.driftSpeed * 0.3;
    return {
      x: 0, y: 0,
      color: hex,
      colorName: name,
      radius,
      alive: true,
      dimmed: false,
      bobPhase: randomRange(0, Math.PI * 2),
      sparklePhase: randomRange(0, Math.PI * 2),
      vx: randomRange(-driftSpeed, driftSpeed),
      vy: randomRange(-driftSpeed * 0.5, driftSpeed * 0.5),
    };
  }

  private positionGems(): void {
    const count = this.gems.length;
    // Center gems in the lower 2/3 of the screen, spread horizontally
    const centerY = DESIGN_HEIGHT * 0.55;
    const totalWidth = (count - 1) * 400;
    const startX = (DESIGN_WIDTH - totalWidth) / 2;

    for (let i = 0; i < count; i++) {
      const gem = this.gems[i];
      if (count <= 2) {
        // Owen: 2 gems, 400px apart, centered
        gem.x = DESIGN_WIDTH / 2 + (i === 0 ? -200 : 200);
        gem.y = centerY;
      } else {
        // Kian: spread evenly
        gem.x = startX + i * 400;
        gem.y = centerY + randomRange(-40, 40);
      }
    }
  }

  /** Position choice buttons at the bottom of the screen */
  private positionChoices(): void {
    const count = this.choices.length;
    const gap = 40;
    const totalW = count * BTN_W + (count - 1) * gap;
    const startX = (DESIGN_WIDTH - totalW) / 2;
    const y = DESIGN_HEIGHT * 0.82;

    for (let i = 0; i < count; i++) {
      this.choices[i].x = startX + i * (BTN_W + gap);
      this.choices[i].y = y;
    }
  }

  // -----------------------------------------------------------------------
  // Hit detection
  // -----------------------------------------------------------------------

  private isGemHit(gem: GemTarget, x: number, y: number): boolean {
    const dx = x - gem.x;
    const dy = y - gem.y;
    // Generous hit area: radius + 25px
    return dx * dx + dy * dy <= (gem.radius + 25) * (gem.radius + 25);
  }

  private isChoiceHit(choice: ChoiceButton, x: number, y: number): boolean {
    return x >= choice.x && x <= choice.x + BTN_W &&
           y >= choice.y && y <= choice.y + BTN_H;
  }

  // -----------------------------------------------------------------------
  // Correct / Wrong / Auto-complete (find mode)
  // -----------------------------------------------------------------------

  private handleCorrect(gem: GemTarget, hinted: boolean): void {
    this.inputLocked = true;
    gem.alive = false;

    const colorName = gem.colorName;

    // Record in tracker
    tracker.recordAnswer(colorName, 'color', true);

    // FlameMeter charge
    const charge = hinted ? 1 : 2;
    this.flameMeter.addCharge(charge);

    // Consecutive correct tracking (for Kian speed rounds)
    this.consecutiveCorrect++;

    // Streak announcements
    if (tracker.consecutiveCorrect === 3) this.voice?.playAshLine('streak_3');
    else if (tracker.consecutiveCorrect === 5) this.voice?.playAshLine('streak_5');

    // Audio
    this.audio?.playSynth('correct-chime');
    this.audio?.playSynth('star-collect');
    session.awardStar(1);
    session.recordAnswer(true);
    session.recordSkillPractice('Colors');
    session.recordCorrectConcept('Colors', colorName);

    // Ash celebration: "YEAH! That's it!" / "AWESOME!" etc.
    this.voice?.ashCorrect();

    // Cross-game reinforcement: echo the color name after a delay
    this.voice?.crossReinforcColor(colorName);

    // Particles: colored burst at gem position
    this.particles.burst(gem.x, gem.y, 40, gem.color, 200, 1.0);
    // White core burst
    this.particles.burst(gem.x, gem.y, 15, '#ffffff', 120, 0.5);

    this.startCelebrate();
  }

  private handleWrong(gem: GemTarget): void {
    const colorName = this.currentColor!.name;

    // Record in tracker
    tracker.recordAnswer(colorName, 'color', false);

    // Reset consecutive correct
    this.consecutiveCorrect = 0;

    // Dim the wrong gem visually
    gem.dimmed = true;

    // Audio
    this.audio?.playSynth('wrong-bonk');
    session.recordAnswer(false);

    // Ash encouragement: "Not quite! Try again!" / "Almost! Keep looking!"
    this.voice?.ashWrong();

    // Escalate hint ladder
    const newLevel = this.hintLadder.onMiss();

    // Check for auto-complete
    if (this.hintLadder.autoCompleted) {
      this.autoComplete();
    }
  }

  private autoComplete(): void {
    if (this.mode === 'mixing') {
      this.autoCompleteMixing();
      return;
    }
    if (this.mode === 'pattern') {
      this.autoCompletePattern();
      return;
    }
    if (this.mode === 'sorting') {
      this.autoCompleteSorting();
      return;
    }
    if (this.mode === 'spelling') {
      this.autoCompleteSpelling();
      return;
    }

    let correctGem: GemTarget | undefined;
    if (this.mode === 'shade') {
      correctGem = this.gems.find(g => g.colorName === `${this.shadeTarget} ${this.shadeBaseColor}` && g.alive);
    } else if (this.mode === 'object') {
      correctGem = this.gems.find(g => g.colorName === this.objectData?.color && g.alive);
    } else {
      correctGem = this.gems.find(g => g.colorName === this.currentColor?.name && g.alive);
    }

    if (!correctGem) return;

    // Record as auto-complete (child did not answer correctly)
    tracker.recordAnswer(this.currentColor!.name, 'color', false);
    this.flameMeter.addCharge(0.5);
    session.recordStruggledConcept('Colors', this.currentColor!.name);

    correctGem.alive = false;

    // Gentler celebration with encouragement clip
    this.audio?.playSynth('pop');
    this.voice?.ashCorrect();
    this.particles.burst(correctGem.x, correctGem.y, 20, correctGem.color, 120, 0.8);

    // Play encouragement video clip (Ash determined, Charizard shakes off)
    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }

    this.startCelebrate();
  }

  // -----------------------------------------------------------------------
  // Correct / Wrong for mixing choice buttons
  // -----------------------------------------------------------------------

  private handleMixingChoiceClick(x: number, y: number): void {
    if (this.choiceAnswered) return;

    for (const choice of this.choices) {
      if (!this.isChoiceHit(choice, x, y)) continue;

      if (choice.correct) {
        this.choiceAnswered = true;
        this.choiceFlashTimer = 1.0;
        this.inputLocked = true;

        const resultName = this.mixPair!.result;
        tracker.recordAnswer(resultName, 'color', true);
        this.flameMeter.addCharge(2);
        this.consecutiveCorrect++;

        this.audio?.playSynth('correct-chime');
        this.audio?.playSynth('star-collect');
        session.awardStar(1);
        session.recordAnswer(true);
        session.recordSkillPractice('Colors');
        session.recordCorrectConcept('Colors', resultName);
        this.voice?.ashCorrect();

        // Celebratory voice: "GREEN! We made green!"
        this.delay(() => {
          this.voice?.narrate(`${resultName.toUpperCase()}! We made ${resultName}!`);
        }, 600);

        // Cross-game reinforcement
        this.voice?.crossReinforcColor(resultName);

        this.particles.burst(
          choice.x + BTN_W / 2, choice.y + BTN_H / 2,
          30, choice.colorHex, 150, 0.8,
        );
      } else {
        const resultName = this.mixPair!.result;
        tracker.recordAnswer(resultName, 'color', false);
        this.consecutiveCorrect = 0;

        this.audio?.playSynth('wrong-bonk');
        session.recordAnswer(false);
        choice.shakeTimer = 0.4;
        this.voice?.ashWrong();

        this.hintLadder.onMiss();

        this.particles.burst(
          choice.x + BTN_W / 2, choice.y + BTN_H / 2,
          6, '#ff6666', 40, 0.3,
        );

        if (this.hintLadder.autoCompleted) {
          this.autoCompleteMixing();
        }
      }
      return;
    }
  }

  private autoCompleteMixing(): void {
    this.choiceAnswered = true;
    this.choiceFlashTimer = 1.0;
    this.inputLocked = true;

    const resultName = this.mixPair?.result ?? '';
    tracker.recordAnswer(resultName, 'color', false);
    this.flameMeter.addCharge(0.5);
    session.recordStruggledConcept('Colors', resultName);
    this.audio?.playSynth('pop');

    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }
  }

  // -----------------------------------------------------------------------
  // Correct / Wrong for shade mode (uses gem tapping, like find mode)
  // -----------------------------------------------------------------------

  private handleShadeClick(x: number, y: number): void {
    for (const gem of this.gems) {
      if (!gem.alive || gem.dimmed) continue;
      if (!this.isGemHit(gem, x, y)) continue;

      const correctLabel = `${this.shadeTarget} ${this.shadeBaseColor}`;
      if (gem.colorName === correctLabel) {
        const hinted = this.hintLadder.hintLevel > 0;
        this.handleCorrect(gem, hinted);
      } else {
        this.handleWrong(gem);
      }
      return;
    }
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  update(dt: number): void {
    this.bg.update(dt);
    this.particles.update(dt);
    this.sprite.update(dt);
    this.flameMeter.update(dt);
    this.phaseTimer += dt;

    switch (this.phase) {
      case 'banner':
        if (this.phaseTimer >= BANNER_DURATION) {
          this.startEngage();
        }
        break;

      case 'engage':
        if (this.phaseTimer >= ENGAGE_DURATION) {
          this.startPrompt();
        }
        break;

      case 'prompt':
        this.updateGems(dt);
        break;

      case 'play':
        if (this.mode === 'mixing') {
          this.updateMixingChoice(dt);
        } else if (this.mode === 'pattern') {
          this.updatePatternPlay(dt);
        } else if (this.mode === 'sorting') {
          this.updateSortingPlay(dt);
        } else if (this.mode === 'spelling') {
          this.updateSpellingPlay(dt);
        } else {
          // 'find', 'shade', 'object' all use gems + hints
          this.updateGems(dt);
          this.updateHints(dt);
        }
        break;

      case 'mixing-animate':
        this.updateMixingAnimate(dt);
        break;

      case 'mixing-flash':
        this.updateMixingFlash(dt);
        break;

      case 'mixing-reveal':
        this.updateMixingReveal(dt);
        break;

      case 'celebrate':
        this.updateCelebrate(dt);
        break;
    }
  }

  private updateGems(dt: number): void {
    for (const gem of this.gems) {
      if (!gem.alive) continue;

      // Bob animation
      gem.bobPhase += dt * 1.5;
      gem.sparklePhase += dt * 2.0;

      // Drift (Kian only — Owen has vx/vy = 0)
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;

      // Bounce off screen edges
      const margin = gem.radius + 30;
      const left = margin;
      const right = DESIGN_WIDTH - margin;
      const top = DESIGN_HEIGHT * 0.2;
      const bottom = DESIGN_HEIGHT * 0.85;

      if (gem.x < left) { gem.x = left; gem.vx = Math.abs(gem.vx); }
      if (gem.x > right) { gem.x = right; gem.vx = -Math.abs(gem.vx); }
      if (gem.y < top) { gem.y = top; gem.vy = Math.abs(gem.vy); }
      if (gem.y > bottom) { gem.y = bottom; gem.vy = -Math.abs(gem.vy); }
    }
  }

  private updateHints(dt: number): void {
    const escalated = this.hintLadder.update(dt);

    if (escalated) {
      const level = this.hintLadder.hintLevel;

      // Level 1: voice repeat
      if (level === 1 && this.currentColor) {
        if (this.mode === 'shade') {
          this.voice?.hintRepeat(`${this.shadeTarget} ${this.shadeBaseColor}`);
        } else {
          this.voice?.hintRepeat(this.currentColor.name);
        }
      }
    }

    // Check auto-complete from timeout escalation
    if (this.hintLadder.autoCompleted && !this.inputLocked) {
      this.inputLocked = true;
      this.autoComplete();
    }
  }

  // ===================== Mixing animation updates =========================

  private updateMixingAnimate(dt: number): void {
    if (!this.mixGemA || !this.mixGemB) return;

    // Lerp gems toward center
    const t = Math.min(this.phaseTimer / MIXING_MERGE_DURATION, 1.0);
    // Ease-in-out: smoothstep
    const s = t * t * (3 - 2 * t);

    this.mixGemA.x = this.mixStartAx + (this.mixCenterX - this.mixStartAx) * s;
    this.mixGemB.x = this.mixStartBx + (this.mixCenterX - this.mixStartBx) * s;

    // Bob animation on source gems
    this.mixGemA.bobPhase += dt * 1.5;
    this.mixGemA.sparklePhase += dt * 2.0;
    this.mixGemB.bobPhase += dt * 1.5;
    this.mixGemB.sparklePhase += dt * 2.0;

    // Trailing particles as gems move
    if (Math.random() < 0.4) {
      this.particles.spawn({
        x: this.mixGemA.x + randomRange(-20, 20),
        y: this.mixGemA.y + randomRange(-20, 20),
        vx: randomRange(-20, 20),
        vy: randomRange(-40, -10),
        color: this.mixGemA.color,
        size: randomRange(2, 5),
        lifetime: randomRange(0.3, 0.6),
        drag: 0.95,
        fadeOut: true,
        shrink: true,
      });
    }
    if (Math.random() < 0.4) {
      this.particles.spawn({
        x: this.mixGemB.x + randomRange(-20, 20),
        y: this.mixGemB.y + randomRange(-20, 20),
        vx: randomRange(-20, 20),
        vy: randomRange(-40, -10),
        color: this.mixGemB.color,
        size: randomRange(2, 5),
        lifetime: randomRange(0.3, 0.6),
        drag: 0.95,
        fadeOut: true,
        shrink: true,
      });
    }

    if (this.phaseTimer >= MIXING_MERGE_DURATION) {
      this.startMixingFlash();
    }
  }

  private updateMixingFlash(dt: number): void {
    this.mixFlashAlpha = Math.max(0, 1.0 - this.phaseTimer / MIXING_FLASH_DURATION);

    if (this.phaseTimer >= MIXING_FLASH_DURATION) {
      this.startMixingReveal();
    }
  }

  private updateMixingReveal(dt: number): void {
    // Scale result gem in with bounce
    const t = Math.min(this.phaseTimer / MIXING_REVEAL_DURATION, 1.0);
    // Overshoot ease: goes to ~1.15 then settles
    const overshoot = 1 + 0.15 * Math.sin(t * Math.PI);
    this.mixResultScale = t * overshoot;

    if (this.mixResultGem) {
      this.mixResultGem.bobPhase += dt * 1.5;
      this.mixResultGem.sparklePhase += dt * 2.0;
    }

    if (this.phaseTimer >= MIXING_REVEAL_DURATION) {
      this.startMixingChoice();
    }
  }

  private updateMixingChoice(dt: number): void {
    // Update shake timers
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

    // Hint escalation
    if (!this.choiceAnswered) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1) {
        this.voice?.hintRepeat(this.mixPair?.result ?? '');
      }
      if (this.hintLadder.autoCompleted && !this.choiceAnswered) {
        this.autoCompleteMixing();
      }
    }

    // Keep result gem bobbing
    if (this.mixResultGem) {
      this.mixResultGem.bobPhase += dt * 1.5;
      this.mixResultGem.sparklePhase += dt * 2.0;
    }
  }

  // ===================== Pattern update ====================================

  private updatePatternPlay(dt: number): void {
    // Shake timers on choice buttons
    for (const choice of this.choices) {
      if (choice.shakeTimer > 0) {
        choice.shakeTimer = Math.max(0, choice.shakeTimer - dt);
      }
    }

    // Answer reveal animation
    if (this.patternAnswerRevealing) {
      this.patternAnswerScale = Math.min(
        this.patternAnswerScale + dt / 0.4,  // 0.4s reveal
        1.1,
      );
      // Settle from 1.1 → 1.0
      if (this.patternAnswerScale >= 1.1) {
        this.patternAnswerScale = 1.0;
        this.patternAnswerRevealing = false;
        // Particles at the answer circle position
        const circleCount = this.patternData!.sequence.length + 1;
        const totalW = (circleCount - 1) * PATTERN_GAP;
        const answerX = (DESIGN_WIDTH - totalW) / 2 + (circleCount - 1) * PATTERN_GAP;
        const answerY = DESIGN_HEIGHT * 0.4;
        this.particles.burst(answerX, answerY, 35, this.currentColor?.hex ?? '#ffffff', 180, 1.0);
        this.particles.burst(answerX, answerY, 15, '#ffffff', 100, 0.5);

        // Transition to celebrate
        this.delay(() => {
          this.startCelebrate();
        }, 400);
      }
    }

    // Hint escalation
    if (!this.choiceAnswered) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1) {
        this.voice?.hintRepeat(this.patternData?.answer ?? '');
      }
      if (this.hintLadder.autoCompleted && !this.choiceAnswered) {
        this.autoCompletePattern();
      }
    }
  }

  // ===================== Sorting update ====================================

  private updateSortingPlay(dt: number): void {
    // Update slide animations for collected gems
    for (const gem of this.sortingGems) {
      if (gem.collected && gem.slideTimer < SORT_SLIDE_DURATION) {
        gem.slideTimer += dt;
        const t = Math.min(gem.slideTimer / SORT_SLIDE_DURATION, 1.0);
        // Smoothstep
        const s = t * t * (3 - 2 * t);

        // Slide toward collection zone slot
        const destX = SORT_ZONE_X;
        const destY = SORT_ZONE_Y - SORT_ZONE_H / 2 + 80 + gem.slotIndex * 130;

        gem.x = gem.slideStartX + (destX - gem.slideStartX) * s;
        gem.y = gem.slideStartY + (destY - gem.slideStartY) * s;
        gem.radius = GEM_RADIUS_OWEN + (60 - GEM_RADIUS_OWEN) * s; // shrink to 60px radius in zone
      }
    }

    // Bob animation for uncollected gems
    for (const gem of this.sortingGems) {
      if (!gem.collected) {
        gem.bobPhase += dt * 1.5;
        gem.sparklePhase += dt * 2.0;
      }
    }

    // Hint escalation
    if (!this.inputLocked) {
      const escalated = this.hintLadder.update(dt);
      if (escalated && this.hintLadder.hintLevel === 1) {
        this.voice?.hintRepeat(this.sortingTargetColor);
      }
      if (this.hintLadder.autoCompleted) {
        this.autoCompleteSorting();
      }
    }
  }

  private updateCelebrate(dt: number): void {
    // Ambient celebration sparks
    const celebColor = this.currentColor?.hex ?? '#37B1E2';
    if (Math.random() < 0.3) {
      this.particles.spawn({
        x: randomRange(200, DESIGN_WIDTH - 200),
        y: randomRange(200, DESIGN_HEIGHT - 200),
        vx: randomRange(-30, 30),
        vy: randomRange(-60, -20),
        color: celebColor,
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
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    // Background
    this.bg.render(ctx);

    // Dim background during interactive phases
    const dimPhases: GamePhase[] = ['play', 'prompt', 'mixing-animate', 'mixing-flash', 'mixing-reveal'];
    if (dimPhases.includes(this.phase)) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();
    }

    // MCX sprite in top-right corner
    this.sprite.render(ctx, SPRITE_X, SPRITE_Y, this.spriteScale);

    // Warm glow behind sprite
    const glowGrad = ctx.createRadialGradient(SPRITE_X, SPRITE_Y, 20, SPRITE_X, SPRITE_Y, 200);
    glowGrad.addColorStop(0, 'rgba(55, 177, 226, 0.12)');
    glowGrad.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(SPRITE_X - 200, SPRITE_Y - 200, 400, 400);

    // Mode-specific rendering
    if (this.mode === 'mixing' && (
      this.phase === 'mixing-animate' ||
      this.phase === 'mixing-flash' ||
      this.phase === 'mixing-reveal' ||
      this.phase === 'play' ||
      this.phase === 'celebrate'
    )) {
      this.renderMixing(ctx);
    } else if (this.mode === 'pattern' && (this.phase === 'prompt' || this.phase === 'play' || this.phase === 'celebrate')) {
      this.renderPattern(ctx);
    } else if (this.mode === 'sorting' && (this.phase === 'prompt' || this.phase === 'play' || this.phase === 'celebrate')) {
      this.renderSorting(ctx);
    } else if (this.mode === 'spelling' && (this.phase === 'prompt' || this.phase === 'play' || this.phase === 'celebrate')) {
      this.renderSpelling(ctx);
    } else {
      // Draw gem targets (find, shade, or object mode)
      for (const gem of this.gems) {
        if (!gem.alive) continue;
        this.renderGem(ctx, gem);
      }

      // Object mode: show object name above gems
      if (this.mode === 'object' && this.objectData &&
        (this.phase === 'prompt' || this.phase === 'play')) {
        this.renderObjectLabel(ctx);
      }

      // Hint level 3: draw line from sprite toward correct target
      if (this.phase === 'play' && this.hintLadder.hintLevel >= 3) {
        let correctGem: GemTarget | undefined;
        if (this.mode === 'shade') {
          const label = `${this.shadeTarget} ${this.shadeBaseColor}`;
          correctGem = this.gems.find(g => g.colorName === label && g.alive);
        } else if (this.mode === 'object') {
          correctGem = this.gems.find(g => g.colorName === this.objectData?.color && g.alive);
        } else {
          correctGem = this.gems.find(g => g.colorName === this.currentColor?.name && g.alive);
        }
        if (correctGem) {
          this.renderHintLine(ctx, correctGem);
        }
      }
    }

    // Particles
    this.particles.render(ctx);

    // Flame meter at top
    this.flameMeter.render(ctx);

    // Label text (during prompt/play phases)
    if (this.phase === 'prompt' || this.phase === 'play') {
      this.renderModeLabel(ctx);
    }

    // Banner text during banner/engage phases
    if (this.phase === 'banner' || this.phase === 'engage') {
      this.renderPhaseText(ctx);
    }
  }

  // ===================== Mixing render ====================================

  private renderMixing(ctx: CanvasRenderingContext2D): void {
    // Render source gems (only during animate phase, fade out after)
    if (this.phase === 'mixing-animate') {
      if (this.mixGemA) this.renderGem(ctx, this.mixGemA);
      if (this.mixGemB) this.renderGem(ctx, this.mixGemB);

      // Label: "blue + yellow = ?"
      this.renderMixingLabel(ctx);
    }

    // Flash overlay
    if (this.phase === 'mixing-flash' && this.mixFlashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.mixFlashAlpha * 0.6;
      ctx.fillStyle = this.mixResultGem?.color ?? '#ffffff';
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();
    }

    // Result gem (during reveal, play, celebrate)
    if (
      this.mixResultGem &&
      (this.phase === 'mixing-reveal' || this.phase === 'play' || this.phase === 'celebrate')
    ) {
      ctx.save();
      const scale = this.phase === 'mixing-reveal' ? this.mixResultScale : 1;
      if (scale > 0.01) {
        ctx.translate(this.mixResultGem.x, this.mixResultGem.y);
        ctx.scale(scale, scale);
        ctx.translate(-this.mixResultGem.x, -this.mixResultGem.y);
        this.renderGem(ctx, this.mixResultGem);
      }
      ctx.restore();
    }

    // Choice buttons (during play phase in mixing mode)
    if (this.phase === 'play' && this.mode === 'mixing') {
      this.renderChoiceButtons(ctx);
    }
  }

  private renderMixingLabel(ctx: CanvasRenderingContext2D): void {
    if (!this.mixPair) return;

    const x = DESIGN_WIDTH / 2;
    const y = DESIGN_HEIGHT * 0.15;
    const text = `${this.mixPair.a} + ${this.mixPair.b} = ?`;

    ctx.save();
    ctx.font = 'bold 72px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(text, x, y);

    ctx.restore();
  }

  // ===================== Choice button rendering ==========================

  private renderChoiceButtons(ctx: CanvasRenderingContext2D): void {
    // Question text
    ctx.save();
    ctx.font = 'bold 52px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';

    const question = this.mode === 'pattern'
      ? 'What color comes next?'
      : 'What color did we make?';
    const questionY = DESIGN_HEIGHT * 0.72;
    ctx.strokeText(question, DESIGN_WIDTH / 2, questionY);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(question, DESIGN_WIDTH / 2, questionY);
    ctx.restore();

    // Buttons
    for (const choice of this.choices) {
      const highlighted = this.choiceAnswered && choice.correct && this.choiceFlashTimer > 0;

      // Hint level 2+: glow on correct choice
      const isCorrectHint = choice.correct &&
        !this.choiceAnswered &&
        this.hintLadder.hintLevel >= 2;

      ctx.save();

      // Shake offset
      let shakeX = 0;
      if (choice.shakeTimer > 0) {
        shakeX = Math.sin(choice.shakeTimer * 40) * 8 * (choice.shakeTimer / 0.4);
      }

      const dx = choice.x + shakeX;
      const dy = choice.y;

      // Hint glow
      if (isCorrectHint) {
        ctx.save();
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 25;
        ctx.strokeStyle = '#37B1E2';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(dx - 4, dy - 4, BTN_W + 8, BTN_H + 8, 20);
        ctx.stroke();
        ctx.restore();
      }

      // Button background — use color swatch
      const bgColor = highlighted ? '#FFD700' : 'rgba(20, 20, 50, 0.85)';
      ctx.fillStyle = bgColor;
      ctx.beginPath();
      ctx.roundRect(dx, dy, BTN_W, BTN_H, 16);
      ctx.fill();

      // Color swatch circle on the left side of button
      const swatchR = 26;
      const swatchX = dx + 50;
      const swatchY = dy + BTN_H / 2;
      ctx.fillStyle = choice.colorHex;
      ctx.beginPath();
      ctx.arc(swatchX, swatchY, swatchR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.darkenColor(choice.colorHex, 0.5);
      ctx.lineWidth = 3;
      ctx.stroke();

      // Button border
      ctx.strokeStyle = highlighted ? '#FFFFFF' : 'rgba(55, 177, 226, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(dx, dy, BTN_W, BTN_H, 16);
      ctx.stroke();

      // Button text
      ctx.fillStyle = highlighted ? '#000000' : '#FFFFFF';
      ctx.font = 'bold 44px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(choice.label, dx + BTN_W / 2 + 20, dy + BTN_H / 2);

      ctx.restore();
    }
  }

  // ===================== Pattern render ====================================

  private renderPattern(ctx: CanvasRenderingContext2D): void {
    if (!this.patternData) return;

    const seq = this.patternData.sequence;
    const circleCount = seq.length + 1; // 4 pattern + 1 answer slot
    const totalW = (circleCount - 1) * PATTERN_GAP;
    const startX = (DESIGN_WIDTH - totalW) / 2;
    const y = DESIGN_HEIGHT * 0.4;
    const r = PATTERN_CIRCLE_R;

    // Draw the 4 sequence circles
    for (let i = 0; i < seq.length; i++) {
      const cx = startX + i * PATTERN_GAP;
      const colorItem = allColors.find(c => c.name === seq[i]);
      const hex = colorItem?.hex ?? '#888888';

      // Outer glow
      const glow = ctx.createRadialGradient(cx, y, 0, cx, y, r * 1.5);
      glow.addColorStop(0, hex + '88');
      glow.addColorStop(1, hex + '00');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Main circle with gradient
      const grad = ctx.createRadialGradient(cx - r * 0.15, y - r * 0.15, 0, cx, y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, '#ffffffcc');
      grad.addColorStop(0.6, hex);
      grad.addColorStop(1, this.darkenColor(hex, 0.5));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, y, r, 0, Math.PI * 2);
      ctx.fill();

      // Outline
      ctx.strokeStyle = this.darkenColor(hex, 0.3);
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    // Draw the "?" answer slot
    const answerX = startX + seq.length * PATTERN_GAP;

    if (this.choiceAnswered && this.patternAnswerScale > 0) {
      // Reveal: fill with answer color, scaled
      const answerHex = this.currentColor?.hex ?? '#ffffff';
      const scale = this.patternAnswerScale;

      ctx.save();
      ctx.translate(answerX, y);
      ctx.scale(scale, scale);
      ctx.translate(-answerX, -y);

      // Glow
      const glow = ctx.createRadialGradient(answerX, y, 0, answerX, y, r * 1.5);
      glow.addColorStop(0, answerHex + '88');
      glow.addColorStop(1, answerHex + '00');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(answerX, y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createRadialGradient(answerX - r * 0.15, y - r * 0.15, 0, answerX, y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, '#ffffffcc');
      grad.addColorStop(0.6, answerHex);
      grad.addColorStop(1, this.darkenColor(answerHex, 0.5));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(answerX, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = this.darkenColor(answerHex, 0.3);
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.restore();
    } else {
      // Dashed circle outline with "?"
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(answerX, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Question mark
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', answerX, y);
      ctx.restore();
    }

    // Choice buttons below (during play phase)
    if (this.phase === 'play') {
      this.renderChoiceButtons(ctx);
    }
  }

  // ===================== Sorting render ====================================

  private renderSorting(ctx: CanvasRenderingContext2D): void {
    // Collection zone (left side basket)
    ctx.save();
    const zoneLeft = SORT_ZONE_X - SORT_ZONE_W / 2;
    const zoneTop = SORT_ZONE_Y - SORT_ZONE_H / 2;

    // Basket background
    ctx.fillStyle = 'rgba(20, 20, 50, 0.6)';
    ctx.beginPath();
    ctx.roundRect(zoneLeft, zoneTop, SORT_ZONE_W, SORT_ZONE_H, 20);
    ctx.fill();

    // Basket border — colored to match target
    ctx.strokeStyle = this.sortingTargetHex + 'aa';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(zoneLeft, zoneTop, SORT_ZONE_W, SORT_ZONE_H, 20);
    ctx.stroke();

    // Glow behind basket
    const basketGlow = ctx.createRadialGradient(
      SORT_ZONE_X, SORT_ZONE_Y, 20,
      SORT_ZONE_X, SORT_ZONE_Y, SORT_ZONE_W,
    );
    basketGlow.addColorStop(0, this.sortingTargetHex + '22');
    basketGlow.addColorStop(1, this.sortingTargetHex + '00');
    ctx.fillStyle = basketGlow;
    ctx.fillRect(zoneLeft - 40, zoneTop - 40, SORT_ZONE_W + 80, SORT_ZONE_H + 80);

    ctx.restore();

    // Progress text above collection zone
    ctx.save();
    ctx.font = 'bold 36px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    const progressText = `${this.sortingCollected}/${this.sortingTargetTotal} found!`;
    ctx.strokeText(progressText, SORT_ZONE_X, zoneTop - 30);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(progressText, SORT_ZONE_X, zoneTop - 30);
    ctx.restore();

    // Draw all sorting gems (collected ones slide into zone, uncollected bob in place)
    for (const gem of this.sortingGems) {
      if (!gem.alive) continue;
      this.renderGem(ctx, gem);
    }

    // Hint level 2+: glow on uncollected target gems
    if (this.phase === 'play' && this.hintLadder.hintLevel >= 2) {
      for (const gem of this.sortingGems) {
        if (gem.isTarget && !gem.collected && gem.alive) {
          const yOffset = Math.sin(gem.bobPhase) * 6;
          const pulse = 1 + Math.sin(gem.bobPhase * 3) * 0.15;
          ctx.save();
          ctx.shadowColor = '#37B1E2';
          ctx.shadowBlur = 30 * pulse;
          const haloGrad = ctx.createRadialGradient(
            gem.x, gem.y + yOffset, gem.radius * 0.5,
            gem.x, gem.y + yOffset, gem.radius * 1.8,
          );
          haloGrad.addColorStop(0, '#37B1E2' + '66');
          haloGrad.addColorStop(1, '#37B1E2' + '00');
          ctx.fillStyle = haloGrad;
          ctx.beginPath();
          ctx.arc(gem.x, gem.y + yOffset, gem.radius * 1.8 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Hint level 3: draw lines from sprite to uncollected target gems
    if (this.phase === 'play' && this.hintLadder.hintLevel >= 3) {
      for (const gem of this.sortingGems) {
        if (gem.isTarget && !gem.collected && gem.alive) {
          this.renderHintLine(ctx, gem);
        }
      }
    }
  }

  // ===================== Object mode render ================================

  private renderObjectLabel(ctx: CanvasRenderingContext2D): void {
    if (!this.objectData) return;

    const x = DESIGN_WIDTH / 2;
    const y = DESIGN_HEIGHT * 0.30;

    // Object name in large friendly text
    ctx.save();
    ctx.font = 'bold 84px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(this.objectData.name, x, y);

    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
    ctx.shadowBlur = 15;
    ctx.fillText(this.objectData.name, x, y);

    ctx.restore();
  }

  // ===================== Spelling mode render ================================

  private renderSpelling(ctx: CanvasRenderingContext2D): void {
    // Show the word being spelled at the top
    const wordX = DESIGN_WIDTH / 2;
    const wordY = DESIGN_HEIGHT * 0.22;
    const colorHex = this.currentColor?.hex ?? '#ffffff';

    ctx.save();
    ctx.font = 'bold 96px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Draw each letter of the word with colored/grey states
    const letters = this.spellingWord.split('');
    const letterSpacing = 100;
    const totalW = (letters.length - 1) * letterSpacing;
    const startLetterX = wordX - totalW / 2;

    for (let i = 0; i < letters.length; i++) {
      const lx = startLetterX + i * letterSpacing;
      const filled = i < this.spellingIndex;

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeText(letters[i], lx, wordY);

      if (filled) {
        ctx.fillStyle = colorHex;
        ctx.shadowColor = colorHex + '80';
        ctx.shadowBlur = 15;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 0;
      }
      ctx.fillText(letters[i], lx, wordY);
    }

    ctx.restore();

    // Progress indicator: underline slots
    ctx.save();
    for (let i = 0; i < letters.length; i++) {
      const lx = startLetterX + i * letterSpacing;
      const filled = i < this.spellingIndex;

      ctx.strokeStyle = filled ? colorHex : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = filled ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(lx - 30, wordY + 55);
      ctx.lineTo(lx + 30, wordY + 55);
      ctx.stroke();
    }
    ctx.restore();

    // Render letter buttons (during play phase)
    if (this.phase === 'play' || this.phase === 'prompt') {
      for (const btn of this.letterButtons) {
        const highlighted = btn.pressed;
        const expectedLetter = this.spellingWord[this.spellingIndex];

        // Hint level 2+: glow on the next correct letter button
        const isNextCorrectHint = !btn.pressed &&
          btn.letter === expectedLetter &&
          !this.spellingComplete &&
          this.hintLadder.hintLevel >= 2;

        ctx.save();

        // Shake offset
        let shakeX = 0;
        if (btn.shakeTimer > 0) {
          shakeX = Math.sin(btn.shakeTimer * 40) * 8 * (btn.shakeTimer / 0.4);
        }

        const bx = btn.x + shakeX;
        const by = btn.y;

        // Hint glow
        if (isNextCorrectHint) {
          ctx.save();
          ctx.shadowColor = '#37B1E2';
          ctx.shadowBlur = 25;
          ctx.strokeStyle = '#37B1E2';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(bx - 4, by - 4, LETTER_BTN_SIZE + 8, LETTER_BTN_SIZE + 8, 20);
          ctx.stroke();
          ctx.restore();
        }

        // Button background
        const bgColor = highlighted
          ? colorHex
          : 'rgba(20, 20, 50, 0.85)';
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(bx, by, LETTER_BTN_SIZE, LETTER_BTN_SIZE, 16);
        ctx.fill();

        // Button border
        ctx.strokeStyle = highlighted ? '#ffffff' : 'rgba(55, 177, 226, 0.6)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(bx, by, LETTER_BTN_SIZE, LETTER_BTN_SIZE, 16);
        ctx.stroke();

        // Letter text
        ctx.fillStyle = highlighted ? '#000000' : '#ffffff';
        ctx.font = 'bold 56px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Scale animation for correct taps
        if (highlighted && btn.scaleAnim < 1) {
          const s = 1 + 0.15 * Math.sin(btn.scaleAnim * Math.PI);
          ctx.translate(bx + LETTER_BTN_SIZE / 2, by + LETTER_BTN_SIZE / 2);
          ctx.scale(s, s);
          ctx.translate(-(bx + LETTER_BTN_SIZE / 2), -(by + LETTER_BTN_SIZE / 2));
        }

        ctx.fillText(btn.letter, bx + LETTER_BTN_SIZE / 2, by + LETTER_BTN_SIZE / 2);

        ctx.restore();
      }
    }

    // Hint level 3: draw line from sprite to the next correct letter button
    if (this.phase === 'play' && this.hintLadder.hintLevel >= 3 && !this.spellingComplete) {
      const expectedLetter = this.spellingWord[this.spellingIndex];
      const targetBtn = this.letterButtons.find(
        b => !b.pressed && b.letter === expectedLetter,
      );
      if (targetBtn) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#37B1E2';
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(SPRITE_X, SPRITE_Y + 60);
        ctx.lineTo(
          targetBtn.x + LETTER_BTN_SIZE / 2,
          targetBtn.y + LETTER_BTN_SIZE / 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }
  }

  // ===================== Common rendering =================================

  private renderGem(ctx: CanvasRenderingContext2D, gem: GemTarget): void {
    ctx.save();

    if (gem.dimmed) {
      ctx.globalAlpha = 0.35;
    }

    const yOffset = Math.sin(gem.bobPhase) * 6;
    const gx = gem.x;
    const gy = gem.y + yOffset;
    const r = gem.radius;

    // Hint level 2+: pulsing glow on correct gem (find/shade/object modes)
    let isCorrect = false;
    if (this.mode === 'shade') {
      isCorrect = gem.colorName === `${this.shadeTarget} ${this.shadeBaseColor}`;
    } else if (this.mode === 'object') {
      isCorrect = gem.colorName === this.objectData?.color;
    } else if (this.mode === 'find') {
      isCorrect = gem.colorName === this.currentColor?.name;
    }
    const hintGlow = isCorrect && this.hintLadder.hintLevel >= 2 && this.phase === 'play';

    if (hintGlow) {
      const pulse = 1 + Math.sin(gem.bobPhase * 3) * 0.15;
      // Bright glow halo
      ctx.save();
      ctx.shadowColor = '#37B1E2';
      ctx.shadowBlur = 30 * pulse;
      const haloGrad = ctx.createRadialGradient(gx, gy, r * 0.5, gx, gy, r * 1.8);
      haloGrad.addColorStop(0, '#37B1E2' + '66');
      haloGrad.addColorStop(1, '#37B1E2' + '00');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(gx, gy, r * 1.8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Outer glow
    const outerGlow = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 1.6);
    outerGlow.addColorStop(0, gem.color + 'aa');
    outerGlow.addColorStop(0.5, gem.color + '44');
    outerGlow.addColorStop(1, gem.color + '00');
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(gx, gy, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Main body gradient
    const bodyGrad = ctx.createRadialGradient(gx - r * 0.15, gy - r * 0.15, 0, gx, gy, r);
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(0.2, '#ffffffcc');
    bodyGrad.addColorStop(0.6, gem.color);
    bodyGrad.addColorStop(1, this.darkenColor(gem.color, 0.5));
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();

    // Specular highlight
    const specGrad = ctx.createRadialGradient(gx - r * 0.25, gy - r * 0.25, 0, gx - r * 0.15, gy - r * 0.15, r * 0.5);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();

    // Sparkles
    const sparkleCount = 5;
    for (let i = 0; i < sparkleCount; i++) {
      const angle = gem.sparklePhase + (i / sparkleCount) * Math.PI * 2;
      const dist = r * 0.7;
      const sx = gx + Math.cos(angle) * dist;
      const sy = gy + Math.sin(angle) * dist;
      const size = 3 + Math.sin(gem.sparklePhase * 3 + i * 1.2) * 1.5;
      const alpha = 0.5 + Math.sin(gem.sparklePhase * 2 + i * 0.8) * 0.3;

      ctx.save();
      ctx.globalAlpha = (gem.dimmed ? 0.35 : 1) * alpha;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Thick outline for chunky silhouette style
    ctx.strokeStyle = this.darkenColor(gem.color, 0.3);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  private renderHintLine(ctx: CanvasRenderingContext2D, gem: GemTarget): void {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#37B1E2';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(SPRITE_X, SPRITE_Y + 60);
    ctx.lineTo(gem.x, gem.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private renderModeLabel(ctx: CanvasRenderingContext2D): void {
    const x = DESIGN_WIDTH / 2;
    const y = DESIGN_HEIGHT * 0.15;
    let text = '';

    if (this.mode === 'find' && this.currentColor) {
      text = `Find ${this.currentColor.name}!`;
    } else if (this.mode === 'shade') {
      text = `Find the ${this.shadeTarget.toUpperCase()} ${this.shadeBaseColor}!`;
    } else if (this.mode === 'mixing' && this.phase === 'play') {
      text = 'What color did we make?';
    } else if (this.mode === 'pattern') {
      text = 'What color comes next?';
    } else if (this.mode === 'sorting') {
      text = `Find ALL the ${this.sortingTargetColor} ones!`;
    } else if (this.mode === 'object' && this.objectData) {
      text = `What color is the ${this.objectData.name}?`;
    } else if (this.mode === 'spelling') {
      text = `Spell ${this.spellingWord}!`;
    } else {
      return;
    }

    ctx.save();
    ctx.font = 'bold 72px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline for readability
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);

    // White fill (no color hint)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(text, x, y);

    ctx.restore();
  }

  private renderPhaseText(ctx: CanvasRenderingContext2D): void {
    // Simple centered text during engage phase
    if (this.phase !== 'engage') return;

    const name = this.isOwen ? settings.littleTrainerName : settings.bigTrainerName;
    const text = `${name}, ${this.isOwen ? 'point!' : 'find it!'}`;

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

  /** Darken a hex color by a factor (0 = black, 1 = original) */
  private darkenColor(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return '#' + [
      Math.round(r * factor),
      Math.round(g * factor),
      Math.round(b * factor),
    ].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  // -----------------------------------------------------------------------
  // Input
  // -----------------------------------------------------------------------

  handleClick(x: number, y: number): void {
    if (this.inputLocked) return;

    if (this.phase === 'play' && this.mode === 'mixing') {
      this.handleMixingChoiceClick(x, y);
      return;
    }

    if (this.phase === 'play' && this.mode === 'shade') {
      this.handleShadeClick(x, y);
      return;
    }

    if (this.phase === 'play' && this.mode === 'pattern') {
      this.handlePatternChoiceClick(x, y);
      return;
    }

    if (this.phase === 'play' && this.mode === 'sorting') {
      this.handleSortingClick(x, y);
      return;
    }

    if (this.phase === 'play' && this.mode === 'object') {
      this.handleObjectClick(x, y);
      return;
    }

    if (this.phase === 'play' && this.mode === 'spelling') {
      this.handleSpellingClick(x, y);
      return;
    }

    if (this.phase !== 'play') return;

    // Find mode: tap gems
    for (const gem of this.gems) {
      if (!gem.alive || gem.dimmed) continue;
      if (this.isGemHit(gem, x, y)) {
        if (gem.colorName === this.currentColor?.name) {
          const hinted = this.hintLadder.hintLevel > 0;
          this.handleCorrect(gem, hinted);
        } else {
          this.handleWrong(gem);
        }
        return;
      }
    }
  }

  handleKey(key: string): void {
    if (key === 'Escape') {
      this.gameContext.screenManager.goTo('hub');
    }
  }
}
