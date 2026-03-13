// src/engine/games/evolution-tower.ts
// Mini-game 3: Evolution Tower — Shape Recognition + Size Comparison
//
// Two visual modes alternate between prompts:
//   Shape Forge: "Find the circle!" — match the target shape
//   Size Training: "Find the BIG one!" — pick the bigger/smaller shape
//
// Owen (2.5yo): circle/square/triangle, 2 choices, no rotation, 5 prompts
// Kian (4yo):   + diamond/star/hexagon, 3-4 choices, NOT prompts after 3 correct
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
  shapes,
  shapeDifficulty,
  shapePatterns,
  type ShapeItem,
  type ShapePattern,
} from '../../content/shapes';
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

const PROMPTS_TOTAL = PROMPTS_PER_ROUND.evolutionTower; // 5
const BANNER_DURATION = 1.5;
const ENGAGE_DURATION = 1.0;
const PROMPT_PREVIEW = 1.0;     // target shape preview before choices appear
const CELEBRATE_DURATION = 1.2;

/** MCX sprite position (top-right, centered in visible area) */
const SPRITE_X = DESIGN_WIDTH - 260;
const SPRITE_Y = 180;

/** Shape drawing constants */
const SHAPE_FILL = '#37B1E2';
const SHAPE_FILL_LIGHT = '#91CCEC';
const SHAPE_OUTLINE = '#000000';
const SHAPE_LINE_WIDTH = 5;

/** Choice card sizes */
const CHOICE_SIZE = 150;
const CHOICE_Y = DESIGN_HEIGHT * 0.55;

/** Size mode: obvious difference */
const BIG_SIZE = 150;
const SMALL_SIZE = 60;

/** Pattern mode layout */
const PATTERN_SHAPE_SIZE = 100;
const PATTERN_SPACING = 180;
const PATTERN_Y = DESIGN_HEIGHT * 0.35;

/** Combo mode colors */
const COMBO_COLORS: { name: string; hex: string }[] = [
  { name: 'red', hex: '#ff3333' },
  { name: 'blue', hex: '#3377ff' },
  { name: 'yellow', hex: '#ffdd00' },
  { name: 'green', hex: '#33cc33' },
];

/** Success echo celebrations */
const SHAPE_ECHOES = ['forged!', 'power!', 'strong!'];
const MCX_TIEINS: Record<string, string> = {
  triangle: '-- like wings!',
  star: '-- like a power star!',
  diamond: '-- like a gem!',
  circle: '-- like a fireball!',
  square: '-- like a fortress block!',
  hexagon: '-- like dragon scales!',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShapeChoice {
  shapeName: string;
  x: number;
  y: number;
  size: number;       // display size
  hitRadius: number;  // generous hit area
  bobPhase: number;
  alive: boolean;
  dimmed: boolean;
  isCorrect: boolean;
  fillColor?: string; // combo mode: specific fill color
}

type PromptMode = 'shape' | 'size' | 'pattern' | 'combo';

type GamePhase = 'banner' | 'engage' | 'prompt' | 'play' | 'celebrate' | 'next';

// ---------------------------------------------------------------------------
// Shape Drawing
// ---------------------------------------------------------------------------

function drawShape(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  stroke = SHAPE_OUTLINE,
  lineWidth = SHAPE_LINE_WIDTH,
): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  const r = size / 2;

  switch (name) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case 'square': {
      const rr = Math.min(10, r * 0.15);
      ctx.beginPath();
      ctx.roundRect(x - r, y - r, size, size, rr);
      ctx.fill();
      ctx.stroke();
      break;
    }

    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.75, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.75, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'star':
      drawStar(ctx, x, y, 5, r, r * 0.42);
      ctx.fill();
      ctx.stroke();
      break;

    case 'hexagon':
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'heart':
      drawHeart(ctx, x, y, size);
      ctx.fill();
      ctx.stroke();
      break;

    case 'oval':
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    default:
      // Fallback: circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
  }
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  points: number, outerR: number, innerR: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const rad = i % 2 === 0 ? outerR : innerR;
    const px = cx + Math.cos(angle) * rad;
    const py = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawHeart(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
): void {
  const s = size * 0.28;
  const topY = cy - s * 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 1.5);
  ctx.bezierCurveTo(cx - s * 2.2, cy + s * 0.2, cx - s * 2.0, topY - s, cx, topY);
  ctx.bezierCurveTo(cx + s * 2.0, topY - s, cx + s * 2.2, cy + s * 0.2, cx, cy + s * 1.5);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// EvolutionTowerGame
// ---------------------------------------------------------------------------

export class EvolutionTowerGame implements GameScreen {
  // New systems
  private bg = new Background(20, 'forge');
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
  private time = 0;
  private choices: ShapeChoice[] = [];
  private promptIndex = 0;
  private consecutiveCorrect = 0;
  private inputLocked = true;

  // Current prompt state
  private promptMode: PromptMode = 'shape';
  private targetShapeName = '';
  private targetLabel = '';          // spoken concept: "circle" or "big"
  private sizePromptText = '';       // "Find the BIG one!" or "Find the SMALL one!"
  private lastShapeName = '';        // avoid immediate repeats
  private isNegativePrompt = false;  // Kian: "Which is NOT a triangle?"

  // Pattern mode state (Kian only)
  private patternSequence: string[] = [];
  private patternAnswer = '';
  private patternAnswerRevealed = false;
  private patternRevealScale = 0;   // animates 0→1 on correct

  // Combo mode state (Kian only)
  private comboTargetColor = '';
  private comboTargetHex = '';

  // Audio shortcut
  private get audio(): any { return (this.gameContext as any).audio; }

  // Difficulty helpers
  private get isOwen(): boolean { return session.currentTurn === 'owen'; }
  private get difficulty() {
    return this.isOwen ? shapeDifficulty.little : shapeDifficulty.big;
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
    this.lastShapeName = '';
    this.inputLocked = true;
    this.time = 0;

    // Dynamic corner sprite for current evolution stage
    this.sprite = new SpriteAnimator(SPRITES[evolutionSpriteKey()]);
    this.spriteScale = evolutionSpriteScale();

    if (this.audio) {
      this.voice = new VoiceSystem(this.audio);
    }

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

    this.phase = 'banner';
    this.phaseTimer = 0;
    this.inputLocked = true;
    this.choices = [];
    this.isNegativePrompt = false;

    this.gameContext.events.emit({ type: 'show-banner', turn });

    if (this.promptIndex === 0) {
      this.voice?.narrate('Forge some shapes!');
    }
  }

  private startEngage(): void {
    this.phase = 'engage';
    this.phaseTimer = 0;

    this.gameContext.events.emit({ type: 'hide-banner' });

    // Three-Label Rule step 1: engagement
    const name = this.isOwen ? settings.littleTrainerName : settings.bigTrainerName;
    const action = this.isOwen ? 'point' : 'find it';
    this.voice?.engage(name, action);
  }

  private startPrompt(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;

    // Mode rotation:
    // Owen: alternates shape (even) / size (odd)
    // Kian: 0=shape, 1=size, 2=shape, 3=pattern, 4=combo (mod 5)
    if (this.isOwen) {
      this.promptMode = this.promptIndex % 2 === 0 ? 'shape' : 'size';
    } else {
      const mod = this.promptIndex % 5;
      if (mod === 3) this.promptMode = 'pattern';
      else if (mod === 4) this.promptMode = 'combo';
      else if (mod === 1) this.promptMode = 'size';
      else this.promptMode = 'shape';
    }

    // Kian negative prompts after 3 consecutive correct (shape mode only)
    if (!this.isOwen && this.consecutiveCorrect >= 3 && this.promptMode === 'shape') {
      this.isNegativePrompt = true;
    } else {
      this.isNegativePrompt = false;
    }

    if (this.promptMode === 'pattern') {
      this.setupPatternPrompt();
    } else if (this.promptMode === 'combo') {
      this.setupComboPrompt();
    } else if (this.promptMode === 'shape') {
      this.setupShapePrompt();
    } else {
      this.setupSizePrompt();
    }

    // Initialize hint ladder
    this.hintLadder.startPrompt(this.targetLabel);

    // SFX pop
    this.audio?.playSynth('pop');

    // Transition to play phase after preview period
    this.delay(() => {
      if (this.phase === 'prompt') {
        this.startPlay();
      }
    }, PROMPT_PREVIEW * 1000);
  }

  private startPlay(): void {
    this.phase = 'play';
    this.phaseTimer = 0;
    this.inputLocked = false;
  }

  private startCelebrate(): void {
    this.phase = 'celebrate';
    this.phaseTimer = 0;
    this.inputLocked = true;

    this.gameContext.events.emit({ type: 'celebration', intensity: 'normal' });
  }

  private startNext(): void {
    this.phase = 'next';
    this.promptIndex++;

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
  // Prompt Setup
  // -----------------------------------------------------------------------

  private getAvailableShapes(): ShapeItem[] {
    const diff = this.difficulty;
    return shapes.filter(s => diff.availableShapes.includes(s.name));
  }

  private pickShape(): ShapeItem {
    const available = this.getAvailableShapes();

    // Check spaced repetition
    const repeats = tracker.getRepeatConcepts('shape');
    let pick: ShapeItem | undefined;

    if (repeats.length > 0) {
      pick = available.find(s => repeats.includes(s.name));
      if (pick) tracker.markRepeated(pick.name, 'shape');
    }

    if (!pick) {
      const pool = available.length > 1
        ? available.filter(s => s.name !== this.lastShapeName)
        : available;
      pick = pool[Math.floor(Math.random() * pool.length)];
    }

    this.lastShapeName = pick.name;
    return pick;
  }

  private setupShapePrompt(): void {
    const target = this.pickShape();
    this.targetShapeName = target.name;

    if (this.isNegativePrompt) {
      // "Which is NOT a triangle?" -- the target is the one to avoid
      this.targetLabel = target.name;
      this.voice?.prompt(target.name, `Which is NOT a ${target.name}?`);
    } else {
      this.targetLabel = target.name;
      // Ash voice prompt: "Find the CIRCLE!" (MP3-first, TTS fallback)
      this.voice?.playAshLine(`shape_${target.name.toLowerCase()}`);
    }

    this.createShapeChoices();
  }

  private setupSizePrompt(): void {
    const shape = this.pickShape();
    this.targetShapeName = shape.name;

    const askBig = Math.random() < 0.5;
    this.targetLabel = askBig ? 'big' : 'small';
    this.sizePromptText = askBig ? 'Find the BIG one!' : 'Find the SMALL one!';

    // Three-Label Rule step 2
    const label = askBig ? 'Big' : 'Small';
    this.voice?.prompt(label, this.sizePromptText);

    this.createSizeChoices(shape.name, askBig);
  }

  private setupPatternPrompt(): void {
    const pattern = shapePatterns[Math.floor(Math.random() * shapePatterns.length)];
    this.patternSequence = pattern.sequence;
    this.patternAnswer = pattern.answer;
    this.patternAnswerRevealed = false;
    this.patternRevealScale = 0;
    this.targetShapeName = pattern.answer;
    this.targetLabel = pattern.answer;

    // Ash voice: pattern recognition prompt
    this.voice?.playAshLine('shape_pattern');

    // Voice: "What comes next?"
    this.voice?.prompt(pattern.answer, 'What comes next?');

    this.createPatternChoices(pattern);
  }

  private setupComboPrompt(): void {
    const shape = this.pickShape();
    const color = COMBO_COLORS[Math.floor(Math.random() * COMBO_COLORS.length)];

    this.targetShapeName = shape.name;
    this.comboTargetColor = color.name;
    this.comboTargetHex = color.hex;
    this.targetLabel = `${color.name} ${shape.name}`;

    // Ash voice: shape+color combo prompt
    this.voice?.playAshLine('shape_combo');

    // Voice: "Find the BLUE circle!"
    this.voice?.prompt(
      this.targetLabel,
      `Find the ${color.name.toUpperCase()} ${shape.name}!`,
    );

    this.createComboChoices(shape.name, color);
  }

  // -----------------------------------------------------------------------
  // Choice Creation
  // -----------------------------------------------------------------------

  private createShapeChoices(): void {
    const diff = this.difficulty;
    const available = this.getAvailableShapes();
    const count = diff.choiceCount;
    this.choices = [];

    if (this.isNegativePrompt) {
      // For NOT prompts: one correct (different shape), rest are the target
      const wrongPool = available.filter(s => s.name !== this.targetShapeName);
      const correctShape = wrongPool[Math.floor(Math.random() * wrongPool.length)];

      // The correct answer is the one that is NOT the target
      this.choices.push(this.makeChoice(correctShape.name, CHOICE_SIZE, true));

      // Fill rest with the target shape
      for (let i = 1; i < count; i++) {
        this.choices.push(this.makeChoice(this.targetShapeName, CHOICE_SIZE, false));
      }
    } else {
      // Normal prompt: one correct, rest wrong
      this.choices.push(this.makeChoice(this.targetShapeName, CHOICE_SIZE, true));

      const wrongPool = available.filter(s => s.name !== this.targetShapeName);
      const shuffled = [...wrongPool].sort(() => Math.random() - 0.5);
      for (let i = 0; i < count - 1 && i < shuffled.length; i++) {
        this.choices.push(this.makeChoice(shuffled[i].name, CHOICE_SIZE, false));
      }
    }

    // Shuffle
    this.choices.sort(() => Math.random() - 0.5);

    // Position horizontally
    this.positionChoices();
  }

  private createSizeChoices(shapeName: string, askBig: boolean): void {
    this.choices = [];

    if (this.isOwen) {
      // Owen: 2 choices — big vs small (very obvious difference)
      this.choices.push(this.makeChoice(shapeName, BIG_SIZE, askBig));
      this.choices.push(this.makeChoice(shapeName, SMALL_SIZE, !askBig));
    } else {
      // Kian: 3 choices — small / medium / big
      const medSize = (BIG_SIZE + SMALL_SIZE) / 2;
      this.choices.push(this.makeChoice(shapeName, BIG_SIZE, askBig));
      this.choices.push(this.makeChoice(shapeName, medSize, false));
      this.choices.push(this.makeChoice(shapeName, SMALL_SIZE, !askBig));
    }

    // Shuffle
    this.choices.sort(() => Math.random() - 0.5);
    this.positionChoices();
  }

  private createPatternChoices(pattern: ShapePattern): void {
    this.choices = [];

    // Correct answer
    this.choices.push(this.makeChoice(pattern.answer, CHOICE_SIZE, true));

    // 2 wrong distractors: pick shapes from the sequence that aren't the answer
    const uniqueInSeq = [...new Set(pattern.sequence)].filter(s => s !== pattern.answer);
    const available = this.getAvailableShapes().map(s => s.name).filter(s => s !== pattern.answer);
    const wrongPool = uniqueInSeq.length > 0 ? uniqueInSeq : available;
    const shuffled = [...wrongPool].sort(() => Math.random() - 0.5);

    for (let i = 0; i < 2 && i < shuffled.length; i++) {
      this.choices.push(this.makeChoice(shuffled[i], CHOICE_SIZE, false));
    }

    // Shuffle and position below the pattern row
    this.choices.sort(() => Math.random() - 0.5);
    this.positionChoicesAt(DESIGN_HEIGHT * 0.68);
  }

  private createComboChoices(
    targetShape: string,
    targetColor: { name: string; hex: string },
  ): void {
    this.choices = [];

    // Correct: right shape + right color
    const correct = this.makeChoice(targetShape, CHOICE_SIZE, true);
    correct.fillColor = targetColor.hex;
    this.choices.push(correct);

    // Distractor 1: right color, wrong shape
    const wrongShapePool = this.getAvailableShapes()
      .map(s => s.name)
      .filter(s => s !== targetShape);
    const wrongShape = wrongShapePool[Math.floor(Math.random() * wrongShapePool.length)];
    const d1 = this.makeChoice(wrongShape, CHOICE_SIZE, false);
    d1.fillColor = targetColor.hex;
    this.choices.push(d1);

    // Distractor 2: right shape, wrong color
    const wrongColorPool = COMBO_COLORS.filter(c => c.name !== targetColor.name);
    const wrongColor = wrongColorPool[Math.floor(Math.random() * wrongColorPool.length)];
    const d2 = this.makeChoice(targetShape, CHOICE_SIZE, false);
    d2.fillColor = wrongColor.hex;
    this.choices.push(d2);

    // Shuffle and position
    this.choices.sort(() => Math.random() - 0.5);
    this.positionChoices();
  }

  private makeChoice(shapeName: string, size: number, isCorrect: boolean): ShapeChoice {
    return {
      shapeName,
      x: 0,
      y: CHOICE_Y,
      size,
      hitRadius: Math.max(size / 2 + 25, 80),
      bobPhase: randomRange(0, Math.PI * 2),
      alive: true,
      dimmed: false,
      isCorrect,
    };
  }

  private positionChoices(): void {
    this.positionChoicesAt(CHOICE_Y);
  }

  private positionChoicesAt(baseY: number): void {
    const count = this.choices.length;
    const spacing = 350;
    const totalWidth = (count - 1) * spacing;
    const startX = (DESIGN_WIDTH - totalWidth) / 2;

    for (let i = 0; i < count; i++) {
      this.choices[i].x = startX + i * spacing;
      this.choices[i].y = baseY + randomRange(-20, 20);
    }
  }

  // -----------------------------------------------------------------------
  // Correct / Wrong / Auto-complete
  // -----------------------------------------------------------------------

  private handleCorrect(choice: ShapeChoice, hinted: boolean): void {
    this.inputLocked = true;
    choice.alive = false;

    const concept = this.promptMode === 'combo'
      ? this.targetLabel
      : this.promptMode === 'pattern'
        ? this.patternAnswer
        : this.promptMode === 'shape'
          ? choice.shapeName
          : this.targetLabel;

    // Record in tracker
    tracker.recordAnswer(concept, 'shape', true);

    // FlameMeter charge
    this.flameMeter.addCharge(hinted ? 1 : 2);

    // Consecutive correct tracking
    this.consecutiveCorrect++;

    // Audio
    this.audio?.playSynth('correct-chime');
    this.audio?.playSynth('star-collect');
    session.awardStar(1);

    // Pattern mode: satisfying click for matching the pattern
    if (this.promptMode === 'pattern') {
      this.audio?.playSynth('pattern-match');
    }

    // Ash celebration: "YEAH! That's it!" / "AWESOME!" etc.
    this.voice?.ashCorrect();

    // Cross-game shape reinforcement
    this.voice?.crossReinforcShape(choice.shapeName);

    // Pattern mode: reveal answer in the "?" slot
    if (this.promptMode === 'pattern') {
      this.patternAnswerRevealed = true;
      this.patternRevealScale = 0;
    }

    // Combo mode celebration with both attributes
    if (this.promptMode === 'combo') {
      this.voice?.successEcho(this.targetLabel, 'Amazing!');
    }

    // Particles: burst at choice position
    const burstColor = choice.fillColor ?? SHAPE_FILL;
    this.particles.burst(choice.x, choice.y, 40, burstColor, 200, 1.0);
    this.particles.burst(choice.x, choice.y, 15, '#ffffff', 120, 0.5);

    this.startCelebrate();
  }

  private handleWrong(choice: ShapeChoice): void {
    const concept = this.promptMode === 'shape'
      ? this.targetShapeName
      : this.targetLabel;

    // Record in tracker
    tracker.recordAnswer(concept, 'shape', false);

    // Reset consecutive
    this.consecutiveCorrect = 0;

    // Dim wrong choice
    choice.dimmed = true;

    // Audio
    this.audio?.playSynth('wrong-bonk');

    // Ash encouragement: "Not quite! Try again!" / "Almost! Keep looking!"
    this.voice?.ashWrong();

    // Escalate hints
    const newLevel = this.hintLadder.onMiss();

    if (this.hintLadder.autoCompleted) {
      this.autoComplete();
    }
  }

  private autoComplete(): void {
    const correct = this.choices.find(c => c.isCorrect && c.alive);
    if (!correct) return;

    tracker.recordAnswer(this.targetLabel, 'shape', false);
    this.flameMeter.addCharge(0.5);

    correct.alive = false;

    this.audio?.playSynth('pop');
    this.voice?.ashCorrect();
    this.particles.burst(correct.x, correct.y, 20, SHAPE_FILL, 120, 0.8);

    // Play encouragement video clip
    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }

    this.startCelebrate();
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
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
        this.updateChoices(dt);
        break;

      case 'play':
        this.updateChoices(dt);
        this.updateHints(dt);
        break;

      case 'celebrate':
        // Animate pattern answer reveal (spring: 0→1 over 0.3s)
        if (this.patternAnswerRevealed && this.patternRevealScale < 1) {
          this.patternRevealScale = Math.min(1, this.patternRevealScale + dt / 0.3);
        }
        // Ambient celebration sparks
        if (Math.random() < 0.3) {
          this.particles.spawn({
            x: randomRange(200, DESIGN_WIDTH - 200),
            y: randomRange(200, DESIGN_HEIGHT - 200),
            vx: randomRange(-30, 30),
            vy: randomRange(-60, -20),
            color: SHAPE_FILL,
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
  }

  private updateChoices(dt: number): void {
    for (const c of this.choices) {
      if (!c.alive) continue;
      c.bobPhase += dt * 1.5;
    }
  }

  private updateHints(dt: number): void {
    const escalated = this.hintLadder.update(dt);

    if (escalated) {
      const level = this.hintLadder.hintLevel;
      if (level === 1) {
        this.voice?.hintRepeat(this.targetLabel);
      }
    }

    if (this.hintLadder.autoCompleted && !this.inputLocked) {
      this.inputLocked = true;
      this.autoComplete();
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  render(ctx: CanvasRenderingContext2D): void {
    // Background
    this.bg.render(ctx);

    // Dim background during play/prompt to highlight choices
    if (this.phase === 'play' || this.phase === 'prompt') {
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

    // Target shape preview (shown large and centered during prompt phase)
    // Not shown for pattern/combo modes (they have their own layout)
    if (this.phase === 'prompt' && this.promptMode !== 'pattern' && this.promptMode !== 'combo') {
      this.renderTargetPreview(ctx);
    }

    // Pattern mode: draw the sequence row
    if (this.promptMode === 'pattern' && (this.phase === 'prompt' || this.phase === 'play' || this.phase === 'celebrate')) {
      this.renderPatternSequence(ctx);
    }

    // Draw shape choices
    for (const c of this.choices) {
      if (!c.alive) continue;
      this.renderChoice(ctx, c);
    }

    // Hint level 3: draw line from sprite toward correct target
    if (this.phase === 'play' && this.hintLadder.hintLevel >= 3) {
      const correct = this.choices.find(c => c.isCorrect && c.alive);
      if (correct) this.renderHintLine(ctx, correct);
    }

    // Particles
    this.particles.render(ctx);

    // Flame meter at top
    this.flameMeter.render(ctx);

    // Prompt label text
    if (this.phase === 'prompt' || this.phase === 'play') {
      this.renderPromptLabel(ctx);
    }

    // Banner/engage phase text
    if (this.phase === 'banner' || this.phase === 'engage') {
      this.renderPhaseText(ctx);
    }
  }

  private renderTargetPreview(ctx: CanvasRenderingContext2D): void {
    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT * 0.38;
    const previewSize = 200;

    // Soft glow behind preview
    ctx.save();
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 40;
    ctx.globalAlpha = 0.8;
    drawShape(ctx, this.targetShapeName, cx, cy, previewSize, SHAPE_FILL_LIGHT, SHAPE_OUTLINE, 6);
    ctx.restore();
  }

  private renderPatternSequence(ctx: CanvasRenderingContext2D): void {
    const count = this.patternSequence.length + 1; // 4 shapes + "?" slot
    const totalWidth = (count - 1) * PATTERN_SPACING;
    const startX = (DESIGN_WIDTH - totalWidth) / 2;

    for (let i = 0; i < this.patternSequence.length; i++) {
      const sx = startX + i * PATTERN_SPACING;

      // Soft card behind each pattern shape
      ctx.save();
      ctx.fillStyle = 'rgba(26, 34, 68, 0.7)';
      ctx.beginPath();
      ctx.roundRect(
        sx - PATTERN_SHAPE_SIZE * 0.6,
        PATTERN_Y - PATTERN_SHAPE_SIZE * 0.6,
        PATTERN_SHAPE_SIZE * 1.2,
        PATTERN_SHAPE_SIZE * 1.2,
        12,
      );
      ctx.fill();
      ctx.restore();

      drawShape(
        ctx,
        this.patternSequence[i],
        sx,
        PATTERN_Y,
        PATTERN_SHAPE_SIZE,
        SHAPE_FILL,
        SHAPE_OUTLINE,
        4,
      );
    }

    // "?" slot (5th position)
    const qx = startX + this.patternSequence.length * PATTERN_SPACING;

    if (this.patternAnswerRevealed && this.patternRevealScale > 0) {
      // Animate the answer shape scaling in with a spring overshoot
      const t = this.patternRevealScale;
      // Simple spring: overshoot to 1.15 then settle to 1.0
      const spring = t < 0.7
        ? (t / 0.7) * 1.15
        : 1.15 - 0.15 * ((t - 0.7) / 0.3);
      const drawSize = PATTERN_SHAPE_SIZE * spring;

      ctx.save();
      ctx.shadowColor = '#37B1E2';
      ctx.shadowBlur = 20;
      drawShape(ctx, this.patternAnswer, qx, PATTERN_Y, drawSize, SHAPE_FILL, SHAPE_OUTLINE, 4);
      ctx.restore();
    } else {
      // Dashed outline placeholder with "?"
      ctx.save();
      ctx.strokeStyle = '#91CCEC';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.roundRect(
        qx - PATTERN_SHAPE_SIZE * 0.6,
        PATTERN_Y - PATTERN_SHAPE_SIZE * 0.6,
        PATTERN_SHAPE_SIZE * 1.2,
        PATTERN_SHAPE_SIZE * 1.2,
        12,
      );
      ctx.stroke();
      ctx.setLineDash([]);

      // "?" text
      ctx.fillStyle = '#91CCEC';
      ctx.font = 'bold 64px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', qx, PATTERN_Y);
      ctx.restore();
    }
  }

  private renderChoice(ctx: CanvasRenderingContext2D, c: ShapeChoice): void {
    ctx.save();

    if (c.dimmed) {
      ctx.globalAlpha = 0.35;
    }

    const bob = Math.sin(c.bobPhase) * 6;
    const cx = c.x;
    const cy = c.y + bob;

    // Hint level 2+: pulsing glow on correct choice
    const isCorrect = c.isCorrect;
    const hintGlow = isCorrect && this.hintLadder.hintLevel >= 2 && this.phase === 'play';

    if (hintGlow) {
      const pulse = 1 + Math.sin(c.bobPhase * 3) * 0.15;
      ctx.save();
      ctx.shadowColor = '#37B1E2';
      ctx.shadowBlur = 30 * pulse;
      const haloGrad = ctx.createRadialGradient(cx, cy, c.size * 0.3, cx, cy, c.size * 1.2);
      haloGrad.addColorStop(0, 'rgba(55, 177, 226, 0.4)');
      haloGrad.addColorStop(1, 'rgba(55, 177, 226, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, c.size * 1.2 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Card background (rounded rect behind the shape)
    const cardSize = Math.max(c.size + 40, 130);
    const half = cardSize / 2;
    const cardColor = hintGlow ? '#1a3a6e' : '#1a2244';
    const borderColor = hintGlow ? '#91CCEC' : '#3a4a6e';

    ctx.fillStyle = cardColor;
    ctx.beginPath();
    ctx.roundRect(cx - half, cy - half, cardSize, cardSize, 16);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(cx - half, cy - half, cardSize, cardSize, 16);
    ctx.stroke();

    // The shape itself
    const fill = c.fillColor
      ? c.fillColor
      : this.promptMode === 'size'
        ? (c.size >= BIG_SIZE ? SHAPE_FILL : SHAPE_FILL_LIGHT)
        : SHAPE_FILL;
    drawShape(ctx, c.shapeName, cx, cy, c.size * 0.75, fill, SHAPE_OUTLINE, 4);

    // Label below shape (shape mode only — size mode has no text hint)
    // Combo mode: show color + shape label on each card
    if (this.promptMode === 'combo') {
      const colorName = COMBO_COLORS.find(clr => clr.hex === c.fillColor)?.name ?? '';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${colorName} ${c.shapeName}`.toUpperCase(), cx, cy + half - 14);
    } else if (this.promptMode === 'shape') {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.shapeName.toUpperCase(), cx, cy + half - 14);
    }

    ctx.restore();
  }

  private renderHintLine(ctx: CanvasRenderingContext2D, target: ShapeChoice): void {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#37B1E2';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(SPRITE_X, SPRITE_Y + 60);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private renderPromptLabel(ctx: CanvasRenderingContext2D): void {
    const x = DESIGN_WIDTH / 2;
    const y = DESIGN_HEIGHT * 0.15;

    let text: string;
    if (this.promptMode === 'pattern') {
      text = 'What comes next?';
    } else if (this.promptMode === 'combo') {
      text = `Find the ${this.comboTargetColor.toUpperCase()} ${this.targetShapeName}!`;
    } else if (this.promptMode === 'size') {
      text = this.sizePromptText;
    } else if (this.isNegativePrompt) {
      text = `Which is NOT a ${this.targetShapeName}?`;
    } else {
      text = `Find the ${this.targetShapeName}!`;
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

    // Fill
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.5)';
    ctx.shadowBlur = 20;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private renderPhaseText(ctx: CanvasRenderingContext2D): void {
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

  // -----------------------------------------------------------------------
  // Input
  // -----------------------------------------------------------------------

  handleClick(x: number, y: number): void {
    if (this.phase !== 'play' || this.inputLocked) return;

    for (const c of this.choices) {
      if (!c.alive || c.dimmed) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= c.hitRadius * c.hitRadius) {
        if (c.isCorrect) {
          const hinted = this.hintLadder.hintLevel > 0;
          this.handleCorrect(c, hinted);
        } else {
          this.handleWrong(c);
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
