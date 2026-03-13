// src/engine/games/fireball-count.ts
// Fireball Count — counting game with instant click feedback.
//
// Players click flame targets to count up to the target number.
// Each click IMMEDIATELY lights a pip and voices the count. No waiting.
//
// Owen (little): numbers 1-3, exact targets, slow rhythmic counting, 5 prompts
//   - Alternates: count mode (odd prompts) / subitizing mode (even prompts)
// Kian (big):    numbers 1-7, extra targets possible, overshoot is educational, 7 prompts
//   - Alternates: count mode (odd prompts) / addition mode (even prompts)

import type { GameScreen, GameContext } from '../screen-manager';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { VoiceSystem } from '../voice';
import { HintLadder } from '../systems/hint-ladder';
import { FlameMeter } from '../entities/flame-meter';
import { tracker } from '../../state/tracker.svelte';
import { countingDifficulty, additionDifficulty, subitizingPatterns } from '../../content/counting';
import { randomInt, randomRange } from '../utils/math';
import {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  FONT,
} from '../../config/constants';
import { SPRITES } from '../../config/sprites';
import { session } from '../../state/session.svelte';
import { settings } from '../../state/settings.svelte';
import { evolutionSpriteKey, evolutionSpriteScale } from '../utils/evolution-sprite';
import { clipManager } from '../screens/hub';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANNER_DURATION = 1.5;
const ENGAGE_DURATION = 1.0;
const PROMPT_DURATION = 1.2;
const CELEBRATE_DURATION = 1.2;
const OVERSHOOT_PAUSE = 1.5;

const OWEN_PROMPTS = 5;
const KIAN_PROMPTS = 7;

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

const FLAME_COLORS = ['#37B1E2', '#91CCEC', '#FFFFFF'];
const CELEBRATION_COLORS = ['#FFD700', '#FF6B35', '#91CCEC', '#37B1E2'];

// Target layout
const TARGET_ROW_Y = 580;
const TARGET_RADIUS = 50;
const PIP_Y = 740;
const PIP_RADIUS = 16;
const PIP_SPACING = 48;

// Addition mode layout
const ADDITION_GROUP_GAP = 200;   // gap between left and right groups
const ADDITION_MERGE_DURATION = 0.8; // seconds for groups to slide together

// Subitizing mode
const SUBITIZE_FLASH_DURATION = 1.5;   // seconds dots are visible
const SUBITIZE_DOT_RADIUS = 45;
const SUBITIZE_BUTTON_WIDTH = 160;
const SUBITIZE_BUTTON_HEIGHT = 120;
const SUBITIZE_BUTTON_Y = 700;
const SUBITIZE_BUTTON_SPACING = 200;

// MCX sprite position (top-right corner)
const SPRITE_X = DESIGN_WIDTH - 160;
const SPRITE_Y = 160;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlameTarget {
  x: number;
  y: number;
  /** Original x position before merge animation (addition mode) */
  originX: number;
  /** Destination x after merge (addition mode) */
  destX: number;
  clicked: boolean;
  pulsePhase: number;
  hintGlow: boolean;
  /** Which addend group: 0 = left, 1 = right (addition mode only) */
  group: number;
}

type PromptMode = 'count' | 'addition' | 'subitize';
type GamePhase =
  | 'banner' | 'engage' | 'prompt' | 'play' | 'celebrate'
  | 'next' | 'overshoot' | 'complete'
  | 'addition-merge'      // animation: two groups slide together
  | 'subitize-flash'      // dots are visible
  | 'subitize-ask';       // dots hidden, choice buttons shown

interface SubitizeButton {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  correct: boolean;
}

// ---------------------------------------------------------------------------
// FireballCountGame
// ---------------------------------------------------------------------------

export class FireballCountGame implements GameScreen {
  // Systems
  private bg = new Background(30, 'arena');
  private particles = new ParticlePool();
  private sprite!: SpriteAnimator;
  private spriteScale = 3;
  private voice!: VoiceSystem;
  private hints = new HintLadder();
  private flameMeter = new FlameMeter();
  private gameContext!: GameContext;

  // Game state
  private phase: GamePhase = 'banner';
  private phaseTimer = 0;
  private totalTime = 0;
  private targetNumber = 0;
  private clickCount = 0;
  private promptIndex = 0;
  private totalPrompts = 0;
  private difficulty: 'little' | 'big' = 'little';
  private hintedThisPrompt = false;

  // Mode tracking
  private mode: PromptMode = 'count';
  private kianPromptCount = 0;   // how many prompts Kian has had (for alternation)
  private owenPromptCount = 0;   // how many prompts Owen has had (for alternation)

  // Addition mode state
  private addendA = 0;
  private addendB = 0;
  private additionMergeProgress = 0; // 0..1
  private additionEquationText = '';
  private additionComplete = false;

  // Subitizing mode state
  private subitizeCount = 0;
  private subitizeButtons: SubitizeButton[] = [];
  private subitizeDots: { x: number; y: number }[] = [];
  private subitizeAnswered = false;
  private subitizeCorrect = false;

  // Visual state
  private targets: FlameTarget[] = [];
  private pipFills: boolean[] = [];
  private numberScale = 1;
  private numberGlowPhase = 0;

  // Banner
  private bannerName = '';
  private bannerAlpha = 0;

  // Overshoot text
  private overshootText = '';
  private overshootAlpha = 0;

  // Audio helper
  private get audio(): any {
    return this.gameContext.audio;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    setActivePool(this.particles);
    this.particles.clear();
    this.totalTime = 0;
    this.promptIndex = 0;
    this.kianPromptCount = 0;
    this.owenPromptCount = 0;

    // Dynamic corner sprite for current evolution stage
    this.sprite = new SpriteAnimator(SPRITES[evolutionSpriteKey()]);
    this.spriteScale = evolutionSpriteScale();

    // Init voice system (audio may not be available yet)
    if (this.audio) {
      this.voice = new VoiceSystem(this.audio);
    }

    // Determine difficulty from current turn
    const turn = session.currentTurn;
    this.difficulty = turn === 'kian' ? 'big' : 'little';
    this.bannerName = turn === 'kian' ? settings.bigTrainerName : settings.littleTrainerName;
    this.totalPrompts = turn === 'kian' ? KIAN_PROMPTS : OWEN_PROMPTS;

    this.startBanner();
  }

  update(dt: number): void {
    this.totalTime += dt;
    this.phaseTimer += dt;
    this.bg.update(dt);
    this.sprite.update(dt);
    this.particles.update(dt);
    this.flameMeter.update(dt);
    this.numberGlowPhase += dt;

    // Fade overshoot text
    if (this.overshootAlpha > 0 && this.phase !== 'overshoot') {
      this.overshootAlpha -= dt * 0.8;
    }

    // Update target pulse animations
    for (const t of this.targets) {
      t.pulsePhase += dt * 3;
    }

    // Phase logic
    switch (this.phase) {
      case 'banner':
        this.updateBanner();
        break;
      case 'engage':
        if (this.phaseTimer >= ENGAGE_DURATION) {
          this.startPromptPhase();
        }
        break;
      case 'prompt':
        if (this.phaseTimer >= PROMPT_DURATION) {
          if (this.mode === 'addition') {
            this.startAdditionMerge();
          } else if (this.mode === 'subitize') {
            this.startSubitizeFlash();
          } else {
            this.startPlayPhase();
          }
        }
        break;
      case 'addition-merge':
        this.updateAdditionMerge(dt);
        break;
      case 'subitize-flash':
        if (this.phaseTimer >= SUBITIZE_FLASH_DURATION) {
          this.startSubitizeAsk();
        }
        break;
      case 'subitize-ask':
        this.updatePlay(dt);
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'celebrate':
        this.updateCelebrate(dt);
        break;
      case 'overshoot':
        if (this.phaseTimer >= OVERSHOOT_PAUSE) {
          this.resetForRetry();
        }
        break;
      case 'next':
        this.advancePrompt();
        break;
      case 'complete':
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Background
    this.bg.render(ctx);

    // Flame meter bar at top
    this.flameMeter.render(ctx);

    // MCX sprite top-right
    this.sprite.render(ctx, SPRITE_X, SPRITE_Y, this.spriteScale);

    // Game UI (not during banner/complete)
    if (this.phase !== 'banner' && this.phase !== 'complete') {
      if (this.mode === 'subitize') {
        this.renderSubitizing(ctx);
      } else {
        if (this.mode === 'addition') {
          this.renderEquation(ctx);
        } else {
          this.renderTargetNumber(ctx);
        }
        this.renderFlameTargets(ctx);
        if (this.phase !== 'addition-merge' || this.additionMergeProgress >= 1) {
          this.renderPips(ctx);
        }
      }
    }

    // Particles
    this.particles.render(ctx);

    // Banner overlay
    if (this.phase === 'banner') {
      this.renderBanner(ctx);
    }

    // Celebration overlay
    if (this.phase === 'celebrate') {
      this.renderCelebration(ctx);
    }

    // Overshoot text
    if (this.overshootAlpha > 0) {
      this.renderOvershoot(ctx);
    }

    ctx.restore();
  }

  exit(): void {
    this.particles.clear();
  }

  handleClick(x: number, y: number): void {
    // Subitizing ask phase: check button clicks
    if (this.phase === 'subitize-ask' && !this.subitizeAnswered) {
      for (const btn of this.subitizeButtons) {
        if (
          x >= btn.x - btn.w / 2 && x <= btn.x + btn.w / 2 &&
          y >= btn.y - btn.h / 2 && y <= btn.y + btn.h / 2
        ) {
          this.onSubitizeAnswer(btn);
          return;
        }
      }
      return;
    }

    if (this.phase !== 'play') return;

    // Check if any unclicked target was hit
    for (const target of this.targets) {
      if (target.clicked) continue;
      const dx = x - target.x;
      const dy = y - target.y;
      if (dx * dx + dy * dy <= (TARGET_RADIUS + 20) * (TARGET_RADIUS + 20)) {
        this.onTargetClick(target);
        return;
      }
    }
  }

  handleKey(key: string): void {
    // Subitizing: number keys for answer
    if (this.phase === 'subitize-ask' && !this.subitizeAnswered) {
      const num = parseInt(key);
      if (!isNaN(num)) {
        const btn = this.subitizeButtons.find(b => b.value === num);
        if (btn) {
          this.onSubitizeAnswer(btn);
          return;
        }
      }
    }

    // Space/Enter clicks the next available target
    if ((key === ' ' || key === 'Enter') && this.phase === 'play') {
      const nextTarget = this.targets.find(t => !t.clicked);
      if (nextTarget) {
        this.onTargetClick(nextTarget);
      }
    }
    if (key === 'Escape') {
      this.gameContext.screenManager.goTo('hub');
    }
  }

  // ---------------------------------------------------------------------------
  // Mode selection
  // ---------------------------------------------------------------------------

  /** Determine the prompt mode based on who is playing and which prompt they are on */
  private pickMode(): PromptMode {
    if (this.difficulty === 'big') {
      // Kian: alternate count / addition on each of his prompts
      this.kianPromptCount++;
      return this.kianPromptCount % 2 === 0 ? 'addition' : 'count';
    } else {
      // Owen: alternate count / subitize on each of his prompts
      this.owenPromptCount++;
      return this.owenPromptCount % 2 === 0 ? 'subitize' : 'count';
    }
  }

  // ---------------------------------------------------------------------------
  // Phase: Banner
  // ---------------------------------------------------------------------------

  private startBanner(): void {
    this.phase = 'banner';
    this.phaseTimer = 0;
    this.bannerAlpha = 0;

    // Narration
    this.voice?.narrate('Charge the right number!');
  }

  private updateBanner(): void {
    const t = this.phaseTimer / BANNER_DURATION;
    if (t < 0.3) {
      this.bannerAlpha = t / 0.3;
    } else if (t < 0.8) {
      this.bannerAlpha = 1;
    } else {
      this.bannerAlpha = 1 - (t - 0.8) / 0.2;
    }

    if (this.phaseTimer >= BANNER_DURATION) {
      this.startEngagePhase();
    }
  }

  private renderBanner(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = this.bannerAlpha;

    // Overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Banner bar
    const bannerY = DESIGN_HEIGHT * 0.4;
    const bannerH = 140;
    const bannerColor = this.difficulty === 'little' ? '#F08030' : '#1a3a6e';

    ctx.fillStyle = bannerColor;
    ctx.fillRect(0, bannerY, DESIGN_WIDTH, bannerH);

    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${FONT.bannerName}px Fredoka, Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FIREBALL COUNT', DESIGN_WIDTH / 2, bannerY + bannerH * 0.42);

    // Sub text
    ctx.font = `bold ${FONT.bannerRole}px Fredoka, Nunito, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`${this.bannerName}'s Turn!`, DESIGN_WIDTH / 2, bannerY + bannerH * 0.75);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Phase: Engage
  // ---------------------------------------------------------------------------

  private startEngagePhase(): void {
    this.phase = 'engage';
    this.phaseTimer = 0;

    const name = this.bannerName;
    const action = this.difficulty === 'little' ? 'point' : 'count';
    this.voice?.engage(name, action);
  }

  // ---------------------------------------------------------------------------
  // Phase: Prompt
  // ---------------------------------------------------------------------------

  private startPromptPhase(): void {
    this.phase = 'prompt';
    this.phaseTimer = 0;

    // Determine mode for this prompt
    this.mode = this.pickMode();

    if (this.mode === 'addition') {
      this.startAdditionPrompt();
    } else if (this.mode === 'subitize') {
      this.startSubitizePrompt();
    } else {
      this.startCountPrompt();
    }
  }

  // -- Count prompt (original behavior) --

  private startCountPrompt(): void {
    // Generate target number
    const diff = countingDifficulty[this.difficulty];
    const adj = tracker.getDifficultyAdjustment();
    let minN = diff.minNumber;
    let maxN = diff.maxNumber;

    // Adjust range based on tracker
    if (adj > 0 && maxN < 7) maxN = Math.min(maxN + 1, 7);
    if (adj < 0 && maxN > 2) maxN = Math.max(maxN - 1, 2);

    // Check for spaced repetition concepts
    const repeats = tracker.getRepeatConcepts('number');
    if (repeats.length > 0) {
      const repeatNum = parseInt(repeats[0]);
      if (repeatNum >= minN && repeatNum <= maxN) {
        this.targetNumber = repeatNum;
        tracker.markRepeated(repeats[0], 'number');
      } else {
        this.targetNumber = randomInt(minN, maxN);
      }
    } else {
      this.targetNumber = randomInt(minN, maxN);
    }

    this.clickCount = 0;
    this.hintedThisPrompt = false;
    this.pipFills = Array(this.targetNumber).fill(false);
    this.numberScale = 1;
    this.additionComplete = false;

    // Create targets
    this.createCountTargets();

    // Start hint ladder
    this.hints.startPrompt(String(this.targetNumber));

    // Ash voice prompt: "Count to THREE!" (MP3-first, TTS fallback)
    this.voice?.playAshLine(`number_${this.targetNumber}`);

    // SFX
    this.audio?.playSynth('pop');
  }

  private createCountTargets(): void {
    const diff = countingDifficulty[this.difficulty];
    let count: number;

    if (diff.pillarsMatchCount) {
      // Owen: exact targets
      count = this.targetNumber;
    } else {
      // Kian: extra targets (2-3 more)
      count = Math.min(this.targetNumber + randomInt(2, 3), 9);
    }

    // Lay out targets in a row centered on screen
    const totalWidth = (count - 1) * (TARGET_RADIUS * 2 + 30);
    const startX = (DESIGN_WIDTH - totalWidth) / 2;

    this.targets = [];
    for (let i = 0; i < count; i++) {
      const xPos = startX + i * (TARGET_RADIUS * 2 + 30);
      this.targets.push({
        x: xPos,
        y: TARGET_ROW_Y,
        originX: xPos,
        destX: xPos,
        clicked: false,
        pulsePhase: randomRange(0, Math.PI * 2),
        hintGlow: false,
        group: 0,
      });
    }
  }

  // -- Addition prompt (Kian) --

  private startAdditionPrompt(): void {
    // Pick addends, try to use repeat concepts from tracker
    const repeats = tracker.getRepeatConcepts('number');
    let pair: [number, number] | null = null;

    if (repeats.length > 0) {
      const repeatNum = parseInt(repeats[0]);
      // Find an addend pair that sums to the repeat concept
      const matching = additionDifficulty.addends.filter(
        ([a, b]) => a + b === repeatNum,
      );
      if (matching.length > 0) {
        pair = matching[randomInt(0, matching.length - 1)] as [number, number];
        tracker.markRepeated(repeats[0], 'number');
      }
    }

    if (!pair) {
      const idx = randomInt(0, additionDifficulty.addends.length - 1);
      pair = additionDifficulty.addends[idx] as [number, number];
    }

    this.addendA = pair[0];
    this.addendB = pair[1];
    this.targetNumber = this.addendA + this.addendB;

    this.clickCount = 0;
    this.hintedThisPrompt = false;
    this.pipFills = Array(this.targetNumber).fill(false);
    this.numberScale = 1;
    this.additionMergeProgress = 0;
    this.additionComplete = false;

    // Build equation text
    this.additionEquationText = `${this.addendA} + ${this.addendB} = ?`;

    // Create two groups of targets
    this.createAdditionTargets();

    // Start hint ladder
    this.hints.startPrompt(`${this.addendA}+${this.addendB}`);

    // Voice: "Two plus one!"
    const wordA = NUMBER_WORDS[this.addendA] || String(this.addendA);
    const wordB = NUMBER_WORDS[this.addendB] || String(this.addendB);
    this.audio?.speakFallback(`${wordA} plus ${wordB}!`);

    // SFX
    this.audio?.playSynth('pop');
  }

  private createAdditionTargets(): void {
    const total = this.addendA + this.addendB;
    const spacing = TARGET_RADIUS * 2 + 30;

    // Calculate layout: left group, gap, right group
    const leftWidth = (this.addendA - 1) * spacing;
    const rightWidth = (this.addendB - 1) * spacing;
    const fullWidth = leftWidth + ADDITION_GROUP_GAP + rightWidth;
    const baseX = (DESIGN_WIDTH - fullWidth) / 2;

    // Merged layout: all targets in a single centered row
    const mergedTotalWidth = (total - 1) * spacing;
    const mergedStartX = (DESIGN_WIDTH - mergedTotalWidth) / 2;

    this.targets = [];
    let mergedIdx = 0;

    // Left group (addendA targets)
    for (let i = 0; i < this.addendA; i++) {
      const originX = baseX + i * spacing;
      const destX = mergedStartX + mergedIdx * spacing;
      this.targets.push({
        x: originX,
        y: TARGET_ROW_Y,
        originX,
        destX,
        clicked: false,
        pulsePhase: randomRange(0, Math.PI * 2),
        hintGlow: false,
        group: 0,
      });
      mergedIdx++;
    }

    // Right group (addendB targets)
    for (let i = 0; i < this.addendB; i++) {
      const originX = baseX + leftWidth + ADDITION_GROUP_GAP + i * spacing;
      const destX = mergedStartX + mergedIdx * spacing;
      this.targets.push({
        x: originX,
        y: TARGET_ROW_Y,
        originX,
        destX,
        clicked: false,
        pulsePhase: randomRange(0, Math.PI * 2),
        hintGlow: false,
        group: 1,
      });
      mergedIdx++;
    }
  }

  // -- Subitizing prompt (Owen) --

  private startSubitizePrompt(): void {
    // Pick a count 1-3
    this.subitizeCount = randomInt(1, 3);
    this.targetNumber = this.subitizeCount;
    this.subitizeAnswered = false;
    this.subitizeCorrect = false;
    this.hintedThisPrompt = false;

    // Get the dice pattern
    const pattern = subitizingPatterns[this.subitizeCount - 1];
    const centerX = DESIGN_WIDTH / 2;
    const centerY = TARGET_ROW_Y;
    this.subitizeDots = pattern.positions.map(p => ({
      x: centerX + p.dx,
      y: centerY + p.dy,
    }));

    // Build choice buttons (2-3 options including the correct one)
    this.buildSubitizeButtons();

    // Start hint ladder
    this.hints.startPrompt(String(this.subitizeCount));

    // Voice: "How many?"
    this.audio?.speakFallback('How many?');

    // SFX
    this.audio?.playSynth('pop');
  }

  private buildSubitizeButtons(): void {
    // Always include the correct answer plus 1-2 wrong ones
    const choices = new Set<number>();
    choices.add(this.subitizeCount);

    // Add wrong answers (1-3 range, different from correct)
    while (choices.size < 3) {
      const wrong = randomInt(1, 3);
      choices.add(wrong);
    }

    const sorted = Array.from(choices).sort((a, b) => a - b);
    const totalWidth = (sorted.length - 1) * SUBITIZE_BUTTON_SPACING;
    const startX = DESIGN_WIDTH / 2 - totalWidth / 2;

    this.subitizeButtons = sorted.map((value, i) => ({
      x: startX + i * SUBITIZE_BUTTON_SPACING,
      y: SUBITIZE_BUTTON_Y,
      w: SUBITIZE_BUTTON_WIDTH,
      h: SUBITIZE_BUTTON_HEIGHT,
      value,
      correct: value === this.subitizeCount,
    }));
  }

  // ---------------------------------------------------------------------------
  // Phase: Addition Merge (animation)
  // ---------------------------------------------------------------------------

  private startAdditionMerge(): void {
    this.phase = 'addition-merge';
    this.phaseTimer = 0;
    this.additionMergeProgress = 0;
  }

  private updateAdditionMerge(dt: number): void {
    this.additionMergeProgress = Math.min(
      this.phaseTimer / ADDITION_MERGE_DURATION,
      1,
    );

    // Ease-out cubic
    const t = 1 - Math.pow(1 - this.additionMergeProgress, 3);

    // Lerp target positions
    for (const target of this.targets) {
      target.x = target.originX + (target.destX - target.originX) * t;
    }

    if (this.additionMergeProgress >= 1) {
      // Snap to final positions
      for (const target of this.targets) {
        target.x = target.destX;
      }

      // Small burst at merge point
      this.particles.burst(
        DESIGN_WIDTH / 2, TARGET_ROW_Y, 12, '#91CCEC', 100, 0.5,
      );
      this.audio?.playSynth('correct-chime');

      // Now go to play phase for counting
      this.startPlayPhase();
    }
  }

  // ---------------------------------------------------------------------------
  // Phase: Subitize Flash / Ask
  // ---------------------------------------------------------------------------

  private startSubitizeFlash(): void {
    this.phase = 'subitize-flash';
    this.phaseTimer = 0;
  }

  private startSubitizeAsk(): void {
    this.phase = 'subitize-ask';
    this.phaseTimer = 0;

    // Re-prompt with voice
    this.audio?.speakFallback('How many?');
  }

  private onSubitizeAnswer(btn: SubitizeButton): void {
    this.subitizeAnswered = true;
    this.subitizeCorrect = btn.correct;

    if (btn.correct) {
      // Record success
      tracker.recordAnswer(String(this.subitizeCount), 'number', !this.hintedThisPrompt);

      // Flame meter
      if (this.hintedThisPrompt) {
        this.flameMeter.addCharge(1);
      } else {
        this.flameMeter.addCharge(2);
      }

      // Voice + SFX
      const word = NUMBER_WORDS[this.subitizeCount] || String(this.subitizeCount);
      this.audio?.speakFallback(`${word}! Yes!`);
      this.audio?.playSynth('correct-chime');

      // Particle burst on each dot position
      for (const dot of this.subitizeDots) {
        this.particles.burst(dot.x, dot.y, 6, '#37B1E2', 80, 0.5);
      }

      // Celebrate after short pause
      setTimeout(() => {
        this.startCelebrate();
      }, 400);
    } else {
      // Wrong
      this.hintedThisPrompt = true;
      tracker.recordAnswer(String(this.subitizeCount), 'number', false);
      this.audio?.playSynth('wrong-bonk');
      this.voice?.ashWrong();
      this.hints.onMiss();

      if (this.hints.autoCompleted) {
        // Auto-complete: reveal answer
        this.subitizeCorrect = true;
        this.subitizeAnswered = true;
        const word = NUMBER_WORDS[this.subitizeCount] || String(this.subitizeCount);
        this.audio?.speakFallback(`It was ${word}!`);
        this.flameMeter.addCharge(0.5);

        const encClip = clipManager.pick('encouragement');
        if (encClip) {
          this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
        }

        setTimeout(() => {
          this.startCelebrate();
        }, 600);
      } else {
        // Let them try again after a pause
        this.subitizeAnswered = false;
        // Brief flash of the dots again as a hint
        this.phase = 'subitize-flash';
        this.phaseTimer = 0;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase: Play
  // ---------------------------------------------------------------------------

  private startPlayPhase(): void {
    this.phase = 'play';
    this.phaseTimer = 0;
  }

  private updatePlay(dt: number): void {
    // Update hint ladder (timeout-based hints)
    const escalated = this.hints.update(dt);
    if (escalated) {
      this.hintedThisPrompt = true;
      const level = this.hints.hintLevel;

      if (level === 1) {
        // Voice repeat
        if (this.mode === 'addition') {
          const wordA = NUMBER_WORDS[this.addendA] || String(this.addendA);
          const wordB = NUMBER_WORDS[this.addendB] || String(this.addendB);
          this.audio?.speakFallback(`${wordA} plus ${wordB}!`);
        } else if (this.mode === 'subitize') {
          this.audio?.speakFallback('How many?');
        } else {
          const word = NUMBER_WORDS[this.targetNumber] || String(this.targetNumber);
          this.voice?.hintRepeat(word);
        }
      } else if (level >= 2) {
        // Visual glow on unclicked targets (count/addition modes)
        if (this.mode !== 'subitize') {
          for (const t of this.targets) {
            if (!t.clicked) {
              t.hintGlow = true;
            }
          }
        }
      }

      // Auto-complete at level 4
      if (this.hints.autoCompleted) {
        this.autoComplete();
      }
    }
  }

  private onTargetClick(target: FlameTarget): void {
    // Mark target as clicked
    target.clicked = true;
    this.clickCount++;

    // Check for overshoot (Kian only, in count mode)
    if (this.clickCount > this.targetNumber) {
      if (this.difficulty === 'little' || this.mode === 'addition') {
        // Owen or addition mode: undo — shouldn't happen since exact targets
        target.clicked = false;
        this.clickCount--;
        return;
      }
      this.handleOvershoot();
      return;
    }

    // INSTANT feedback: light pip
    this.pipFills[this.clickCount - 1] = true;

    // INSTANT voice: say the count number
    const countWord = NUMBER_WORDS[this.clickCount];
    if (countWord) {
      this.audio?.speakFallback(countWord + '!');
    }

    // SFX: correct chime for each click
    this.audio?.playSynth('correct-chime');

    // Particle burst on target
    this.particles.burst(target.x, target.y, 8, '#37B1E2', 100, 0.5);

    // Check if count matches target
    if (this.clickCount === this.targetNumber) {
      // Record success
      const correct = !this.hintedThisPrompt;
      const concept = this.mode === 'addition'
        ? `${this.addendA}+${this.addendB}`
        : String(this.targetNumber);
      tracker.recordAnswer(concept, 'number', correct);

      // Flame meter charge
      if (this.hints.autoCompleted) {
        this.flameMeter.addCharge(0.5);
      } else if (this.hintedThisPrompt) {
        this.flameMeter.addCharge(1);
      } else {
        // Addition mode gets a bigger charge (it's harder!)
        this.flameMeter.addCharge(this.mode === 'addition' ? 3 : 2);
      }

      // Update equation for addition mode
      if (this.mode === 'addition') {
        this.additionComplete = true;
        this.additionEquationText = `${this.addendA} + ${this.addendB} = ${this.targetNumber}!`;
      }

      // Short pause then celebrate
      setTimeout(() => {
        this.startCelebrate();
      }, 300);
    }
  }

  // ---------------------------------------------------------------------------
  // Overshoot (Kian)
  // ---------------------------------------------------------------------------

  private handleOvershoot(): void {
    this.phase = 'overshoot';
    this.phaseTimer = 0;

    // Audio: wrong bonk
    this.audio?.playSynth('wrong-bonk');

    // Ash encouragement: "Not quite! Try again!" / "Almost! Keep looking!"
    this.voice?.ashWrong();

    // Show overshoot text
    this.overshootText = `Oops! We needed ${NUMBER_WORDS[this.targetNumber]}!`;
    this.overshootAlpha = 1;

    // Record as incorrect
    tracker.recordAnswer(String(this.targetNumber), 'number', false);

    // Hint escalation
    this.hints.onMiss();
    this.hintedThisPrompt = true;
  }

  private resetForRetry(): void {
    // Reset click state for another attempt
    this.clickCount = 0;
    this.pipFills = Array(this.targetNumber).fill(false);
    for (const t of this.targets) {
      t.clicked = false;
    }
    this.phase = 'play';
    this.phaseTimer = 0;

    // Ash voice re-prompt
    if (this.mode === 'addition') {
      const wordA = NUMBER_WORDS[this.addendA] || String(this.addendA);
      const wordB = NUMBER_WORDS[this.addendB] || String(this.addendB);
      this.audio?.speakFallback(`${wordA} plus ${wordB}!`);
    } else {
      this.voice?.playAshLine(`number_${this.targetNumber}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-complete
  // ---------------------------------------------------------------------------

  private autoComplete(): void {
    if (this.mode === 'subitize') {
      // Handled in onSubitizeAnswer
      return;
    }

    // Click all remaining targets automatically
    for (const t of this.targets) {
      if (!t.clicked && this.clickCount < this.targetNumber) {
        t.clicked = true;
        this.clickCount++;
        if (this.clickCount - 1 < this.pipFills.length) {
          this.pipFills[this.clickCount - 1] = true;
        }
        this.particles.burst(t.x, t.y, 5, '#91CCEC', 60, 0.4);
      }
    }

    // Record as auto-completed
    const concept = this.mode === 'addition'
      ? `${this.addendA}+${this.addendB}`
      : String(this.targetNumber);
    tracker.recordAnswer(concept, 'number', false);
    this.flameMeter.addCharge(0.5);

    // Update equation for addition mode
    if (this.mode === 'addition') {
      this.additionComplete = true;
      this.additionEquationText = `${this.addendA} + ${this.addendB} = ${this.targetNumber}!`;
    }

    // Play encouragement video clip
    const encClip = clipManager.pick('encouragement');
    if (encClip) {
      this.gameContext.events.emit({ type: 'play-video', src: encClip.src });
    }

    // Celebrate with reduced fanfare
    setTimeout(() => {
      this.startCelebrate();
    }, 300);
  }

  // ---------------------------------------------------------------------------
  // Phase: Celebrate
  // ---------------------------------------------------------------------------

  private startCelebrate(): void {
    this.phase = 'celebrate';
    this.phaseTimer = 0;

    // Ash celebration: "YEAH! That's it!" / "AWESOME!" etc.
    this.voice?.ashCorrect();

    // SFX
    this.audio?.playSynth('cheer');

    // Particle burst — bigger for addition mode
    const burstCount = this.mode === 'addition' ? 50 : 30;
    for (let i = 0; i < burstCount; i++) {
      const x = randomRange(DESIGN_WIDTH * 0.2, DESIGN_WIDTH * 0.8);
      const y = randomRange(DESIGN_HEIGHT * 0.2, DESIGN_HEIGHT * 0.5);
      this.particles.burst(
        x, y, 3,
        CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
        120, 0.8,
      );
    }
  }

  private updateCelebrate(dt: number): void {
    // Ongoing celebration sparks
    if (Math.random() < 0.3) {
      this.particles.burst(
        randomRange(DESIGN_WIDTH * 0.1, DESIGN_WIDTH * 0.9),
        randomRange(DESIGN_HEIGHT * 0.1, DESIGN_HEIGHT * 0.4),
        2,
        CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
        80, 0.6,
      );
    }

    if (this.phaseTimer >= CELEBRATE_DURATION) {
      this.phase = 'next';
    }
  }

  private renderCelebration(ctx: CanvasRenderingContext2D): void {
    const t = Math.min(this.phaseTimer / 0.3, 1);
    const scale = 0.5 + 0.5 * t;
    const alpha = this.phaseTimer < CELEBRATE_DURATION * 0.8
      ? 1
      : 1 - (this.phaseTimer - CELEBRATE_DURATION * 0.8) / (CELEBRATE_DURATION * 0.2);

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textX = DESIGN_WIDTH / 2;
    const textY = DESIGN_HEIGHT * 0.35;

    if (this.mode === 'addition' && this.additionComplete) {
      // Show completed equation: "2 + 1 = 3!"
      const eqText = `${this.addendA} + ${this.addendB} = ${this.targetNumber}!`;
      const eqSize = Math.round(80 * scale);

      // Glow
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 40;
      ctx.font = `bold ${eqSize}px Fredoka, Nunito, sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.fillText(eqText, textX, textY - 50);
      ctx.restore();

      // Solid text
      ctx.font = `bold ${eqSize}px Fredoka, Nunito, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(eqText, textX, textY - 50);

      // "GREAT!" below
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 30;
      ctx.font = `bold ${Math.round(72 * scale)}px Fredoka, Nunito, sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.fillText('GREAT!', textX, textY + 40);
      ctx.restore();

      ctx.font = `bold ${Math.round(72 * scale)}px Fredoka, Nunito, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('GREAT!', textX, textY + 40);
    } else {
      // Standard celebration
      // Glow
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 40;
      ctx.font = `bold ${Math.round(96 * scale)}px Fredoka, Nunito, sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.fillText('GREAT!', textX, textY);
      ctx.restore();

      // Solid text
      ctx.font = `bold ${Math.round(96 * scale)}px Fredoka, Nunito, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('GREAT!', textX, textY);
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Phase: Next / End
  // ---------------------------------------------------------------------------

  private advancePrompt(): void {
    this.promptIndex++;
    if (this.promptIndex >= this.totalPrompts) {
      this.endRound();
    } else {
      // Alternate turns
      session.currentTurn = session.nextTurn();
      this.difficulty = session.currentTurn === 'kian' ? 'big' : 'little';
      this.bannerName = session.currentTurn === 'kian'
        ? settings.bigTrainerName
        : settings.littleTrainerName;
      this.totalPrompts = session.currentTurn === 'kian' ? KIAN_PROMPTS : OWEN_PROMPTS;

      this.startEngagePhase();
    }
  }

  private endRound(): void {
    this.phase = 'complete';
    this.phaseTimer = 0;

    session.activitiesCompleted++;
    session.currentScreen = 'calm-reset';

    setTimeout(() => {
      this.gameContext.screenManager.goTo('calm-reset');
    }, 500);
  }

  // ---------------------------------------------------------------------------
  // Rendering: Target Number Display (count mode)
  // ---------------------------------------------------------------------------

  private renderTargetNumber(ctx: CanvasRenderingContext2D): void {
    const numX = DESIGN_WIDTH / 2;
    const numY = 160;

    ctx.save();

    // Pulsing glow
    const pulse = 0.7 + 0.3 * Math.sin(this.numberGlowPhase * 3);
    const glowSize = 100 * pulse * this.numberScale;

    ctx.save();
    ctx.globalAlpha = 0.3 * this.numberScale;
    const numGlow = ctx.createRadialGradient(numX, numY, 10, numX, numY, glowSize);
    numGlow.addColorStop(0, '#37B1E2');
    numGlow.addColorStop(0.5, 'rgba(55, 177, 226, 0.3)');
    numGlow.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = numGlow;
    ctx.beginPath();
    ctx.arc(numX, numY, glowSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Number text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(numX, numY);
    ctx.scale(this.numberScale, this.numberScale);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = `bold ${FONT.numberPrompt}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(String(this.targetNumber), 3, 3);

    // Main text with blue-white glow
    ctx.save();
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 25 * pulse;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${FONT.numberPrompt}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(String(this.targetNumber), 0, 0);
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Rendering: Equation Display (addition mode)
  // ---------------------------------------------------------------------------

  private renderEquation(ctx: CanvasRenderingContext2D): void {
    const eqX = DESIGN_WIDTH / 2;
    const eqY = 160;

    ctx.save();

    // Pulsing glow
    const pulse = 0.7 + 0.3 * Math.sin(this.numberGlowPhase * 3);
    const glowSize = 120 * pulse;

    ctx.save();
    ctx.globalAlpha = 0.25;
    const glow = ctx.createRadialGradient(eqX, eqY, 10, eqX, eqY, glowSize);
    glow.addColorStop(0, '#37B1E2');
    glow.addColorStop(0.5, 'rgba(55, 177, 226, 0.3)');
    glow.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(eqX, eqY, glowSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Equation text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const fontSize = 100;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = `bold ${fontSize}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(this.additionEquationText, eqX + 3, eqY + 3);

    // Main text with glow
    ctx.save();
    ctx.shadowColor = this.additionComplete ? '#FFD700' : '#37B1E2';
    ctx.shadowBlur = 25 * pulse;
    ctx.fillStyle = this.additionComplete ? '#FFD700' : '#FFFFFF';
    ctx.font = `bold ${fontSize}px Fredoka, Nunito, sans-serif`;
    ctx.fillText(this.additionEquationText, eqX, eqY);
    ctx.restore();

    // "+" label between groups during prompt/merge
    if (this.phase === 'prompt' || this.phase === 'addition-merge') {
      const plusY = TARGET_ROW_Y;
      const plusAlpha = this.phase === 'addition-merge'
        ? Math.max(0, 1 - this.additionMergeProgress * 2)
        : 1;

      ctx.save();
      ctx.globalAlpha = plusAlpha * 0.8;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 80px Fredoka, Nunito, sans-serif';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 15;
      ctx.fillText('+', DESIGN_WIDTH / 2, plusY);
      ctx.restore();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Rendering: Subitizing mode
  // ---------------------------------------------------------------------------

  private renderSubitizing(ctx: CanvasRenderingContext2D): void {
    // Title: "How many?"
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 72px Fredoka, Nunito, sans-serif';

    const titleY = 140;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillText('How many?', DESIGN_WIDTH / 2 + 3, titleY + 3);
    ctx.save();
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('How many?', DESIGN_WIDTH / 2, titleY);
    ctx.restore();
    ctx.restore();

    // Dots: visible during flash phase, hidden during ask
    const showDots = this.phase === 'subitize-flash' || this.phase === 'prompt' || this.subitizeAnswered;

    if (showDots) {
      for (const dot of this.subitizeDots) {
        ctx.save();

        const pulse = 1 + 0.04 * Math.sin(this.numberGlowPhase * 3);
        const r = SUBITIZE_DOT_RADIUS * pulse;

        // Outer glow
        ctx.save();
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 20;

        const grad = ctx.createRadialGradient(
          dot.x, dot.y - r * 0.2, r * 0.1,
          dot.x, dot.y, r,
        );
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, '#91CCEC');
        grad.addColorStop(0.7, '#37B1E2');
        grad.addColorStop(1, '#1a5fc4');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Inner flame icon
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(dot.x, dot.y - r * 0.5);
        ctx.quadraticCurveTo(dot.x + r * 0.25, dot.y - r * 0.1, dot.x + r * 0.15, dot.y + r * 0.2);
        ctx.quadraticCurveTo(dot.x, dot.y + r * 0.05, dot.x - r * 0.15, dot.y + r * 0.2);
        ctx.quadraticCurveTo(dot.x - r * 0.25, dot.y - r * 0.1, dot.x, dot.y - r * 0.5);
        ctx.fill();
        ctx.restore();

        // Outline
        ctx.strokeStyle = '#0d2d5e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }

      // Flash phase: show countdown indicator (subtle fading ring)
      if (this.phase === 'subitize-flash') {
        const remaining = SUBITIZE_FLASH_DURATION - this.phaseTimer;
        const ringAlpha = remaining / SUBITIZE_FLASH_DURATION;
        ctx.save();
        ctx.globalAlpha = ringAlpha * 0.4;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        const ringRadius = 140;
        ctx.beginPath();
        ctx.arc(DESIGN_WIDTH / 2, TARGET_ROW_Y, ringRadius, 0, Math.PI * 2 * ringAlpha);
        ctx.stroke();
        ctx.restore();
      }
    } else if (this.phase === 'subitize-ask') {
      // Dots hidden — show "?" placeholders
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 120px Fredoka, Nunito, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillText('?', DESIGN_WIDTH / 2, TARGET_ROW_Y);
      ctx.restore();
    }

    // Choice buttons (during ask phase or after answer)
    if (this.phase === 'subitize-ask' || (this.phase === 'celebrate' && this.mode === 'subitize')) {
      for (const btn of this.subitizeButtons) {
        ctx.save();

        const highlighted = this.subitizeAnswered && btn.correct;
        const isWrong = this.subitizeAnswered && !btn.correct;

        // Button background
        const radius = 20;
        const bx = btn.x - btn.w / 2;
        const by = btn.y - btn.h / 2;

        ctx.beginPath();
        ctx.moveTo(bx + radius, by);
        ctx.lineTo(bx + btn.w - radius, by);
        ctx.quadraticCurveTo(bx + btn.w, by, bx + btn.w, by + radius);
        ctx.lineTo(bx + btn.w, by + btn.h - radius);
        ctx.quadraticCurveTo(bx + btn.w, by + btn.h, bx + btn.w - radius, by + btn.h);
        ctx.lineTo(bx + radius, by + btn.h);
        ctx.quadraticCurveTo(bx, by + btn.h, bx, by + btn.h - radius);
        ctx.lineTo(bx, by + radius);
        ctx.quadraticCurveTo(bx, by, bx + radius, by);
        ctx.closePath();

        if (highlighted) {
          ctx.fillStyle = '#37B1E2';
          ctx.shadowColor = '#37B1E2';
          ctx.shadowBlur = 25;
        } else if (isWrong) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#444455';
        } else {
          ctx.fillStyle = '#1a3a6e';
          ctx.shadowColor = 'rgba(55, 177, 226, 0.3)';
          ctx.shadowBlur = 10;
        }
        ctx.fill();

        // Border
        ctx.strokeStyle = highlighted ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = highlighted ? 4 : 3;
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Number text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `bold 64px Fredoka, Nunito, sans-serif`;
        ctx.fillStyle = highlighted ? '#FFFFFF' : isWrong ? '#666677' : '#FFFFFF';
        ctx.fillText(String(btn.value), btn.x, btn.y);

        ctx.restore();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: Flame Targets
  // ---------------------------------------------------------------------------

  private renderFlameTargets(ctx: CanvasRenderingContext2D): void {
    for (const target of this.targets) {
      ctx.save();

      const pulse = 1 + 0.05 * Math.sin(target.pulsePhase);
      const r = TARGET_RADIUS * pulse;

      if (target.clicked) {
        // Clicked: dimmed, smaller
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#555566';
        ctx.beginPath();
        ctx.arc(target.x, target.y, r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Hint glow ring
        if (target.hintGlow) {
          ctx.save();
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 4 + 2 * Math.sin(target.pulsePhase * 2);
          ctx.shadowColor = '#FFD700';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(target.x, target.y, r + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Outer glow
        ctx.save();
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 20;

        // Body gradient: blue flame circle
        const grad = ctx.createRadialGradient(
          target.x, target.y - r * 0.2, r * 0.1,
          target.x, target.y, r,
        );
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, '#91CCEC');
        grad.addColorStop(0.7, '#37B1E2');
        grad.addColorStop(1, '#1a5fc4');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Inner flame icon: simple upward flame shape
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(target.x, target.y - r * 0.5);
        ctx.quadraticCurveTo(target.x + r * 0.25, target.y - r * 0.1, target.x + r * 0.15, target.y + r * 0.2);
        ctx.quadraticCurveTo(target.x, target.y + r * 0.05, target.x - r * 0.15, target.y + r * 0.2);
        ctx.quadraticCurveTo(target.x - r * 0.25, target.y - r * 0.1, target.x, target.y - r * 0.5);
        ctx.fill();
        ctx.restore();

        // Thick outline for chunky silhouette style
        ctx.strokeStyle = '#0d2d5e';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(target.x, target.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: Count Pips
  // ---------------------------------------------------------------------------

  private renderPips(ctx: CanvasRenderingContext2D): void {
    const pipCount = this.targetNumber;
    const startX = DESIGN_WIDTH / 2 - ((pipCount - 1) * PIP_SPACING) / 2;

    for (let i = 0; i < pipCount; i++) {
      const px = startX + i * PIP_SPACING;
      const filled = this.pipFills[i];

      ctx.save();

      if (filled) {
        // Filled pip: bright blue with glow
        ctx.save();
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#37B1E2';
        ctx.beginPath();
        ctx.arc(px, PIP_Y, PIP_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // White center
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(px, PIP_Y, PIP_RADIUS * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Empty pip: grey outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(px, PIP_Y, PIP_RADIUS, 0, Math.PI * 2);
        ctx.stroke();

        // Dim inner
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        ctx.arc(px, PIP_Y, PIP_RADIUS - 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: Overshoot Text
  // ---------------------------------------------------------------------------

  private renderOvershoot(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.overshootAlpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px Fredoka, Nunito, sans-serif';

    const y = DESIGN_HEIGHT * 0.35;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(this.overshootText, DESIGN_WIDTH / 2 + 3, y + 3);

    // Red text
    ctx.fillStyle = '#ff6666';
    ctx.fillText(this.overshootText, DESIGN_WIDTH / 2, y);

    ctx.restore();
  }
}
