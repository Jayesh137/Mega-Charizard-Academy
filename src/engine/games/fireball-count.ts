// src/engine/games/fireball-count.ts
// Fireball Count — counting game with instant click feedback.
//
// Players click flame targets to count up to the target number.
// Each click IMMEDIATELY lights a pip and voices the count. No waiting.
//
// Owen (little): numbers 1-3, exact targets, slow rhythmic counting, 5 prompts
// Kian (big):    numbers 1-7, extra targets possible, overshoot is educational, 7 prompts

import type { GameScreen, GameContext } from '../screen-manager';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { VoiceSystem } from '../voice';
import { HintLadder } from '../systems/hint-ladder';
import { FlameMeter } from '../entities/flame-meter';
import { tracker } from '../../state/tracker.svelte';
import { countingDifficulty } from '../../content/counting';
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

// MCX sprite position (top-right corner)
const SPRITE_X = DESIGN_WIDTH - 160;
const SPRITE_Y = 160;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlameTarget {
  x: number;
  y: number;
  clicked: boolean;
  pulsePhase: number;
  hintGlow: boolean;
}

type GamePhase = 'banner' | 'engage' | 'prompt' | 'play' | 'celebrate' | 'next' | 'overshoot' | 'complete';

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
          this.startPlayPhase();
        }
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
      this.renderTargetNumber(ctx);
      this.renderFlameTargets(ctx);
      this.renderPips(ctx);
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

    // Create targets
    this.createTargets();

    // Start hint ladder
    this.hints.startPrompt(String(this.targetNumber));

    // Ash voice prompt: "Count to THREE!" (MP3-first, TTS fallback)
    this.voice?.playAshLine(`number_${this.targetNumber}`);

    // SFX
    this.audio?.playSynth('pop');
  }

  private createTargets(): void {
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
      this.targets.push({
        x: startX + i * (TARGET_RADIUS * 2 + 30),
        y: TARGET_ROW_Y,
        clicked: false,
        pulsePhase: randomRange(0, Math.PI * 2),
        hintGlow: false,
      });
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
        const word = NUMBER_WORDS[this.targetNumber] || String(this.targetNumber);
        this.voice?.hintRepeat(word);
      } else if (level >= 2) {
        // Visual glow on unclicked targets
        for (const t of this.targets) {
          if (!t.clicked) {
            t.hintGlow = true;
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

    // Check for overshoot (Kian only)
    if (this.clickCount > this.targetNumber) {
      if (this.difficulty === 'little') {
        // Owen: undo — shouldn't happen since exact targets
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
      tracker.recordAnswer(String(this.targetNumber), 'number', correct);

      // Flame meter charge
      if (this.hints.autoCompleted) {
        this.flameMeter.addCharge(0.5);
      } else if (this.hintedThisPrompt) {
        this.flameMeter.addCharge(1);
      } else {
        this.flameMeter.addCharge(2);
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

    // Ash voice re-prompt: "Count to THREE!"
    this.voice?.playAshLine(`number_${this.targetNumber}`);
  }

  // ---------------------------------------------------------------------------
  // Auto-complete
  // ---------------------------------------------------------------------------

  private autoComplete(): void {
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
    tracker.recordAnswer(String(this.targetNumber), 'number', false);
    this.flameMeter.addCharge(0.5);

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

    // Big particle burst
    for (let i = 0; i < 30; i++) {
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
  // Rendering: Target Number Display
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
