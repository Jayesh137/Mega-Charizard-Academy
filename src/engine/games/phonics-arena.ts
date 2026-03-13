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
import { starterLetters, letterPaths, PHONICS, type LetterItem } from '../../content/letters';
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

type GamePhase =
  | 'banner'
  | 'engage'
  | 'show-letter'
  | 'choice'
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

  // Audio shortcut
  private get audio() { return this.gameContext.audio; }

  // Difficulty helpers
  private get isOwen(): boolean { return session.currentTurn === 'owen'; }

  /** Kian phonics: every other prompt starting at index 1 (0-indexed) */
  private get isPhonicsRound(): boolean {
    return !this.isOwen && this.promptIndex % 2 === 1;
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
    this.particles.clear();
    this.gameContext.events.emit({ type: 'hide-banner' });
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
    setTimeout(() => {
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

    // Ambient blue embers near the constellation during show-letter and choice
    if (
      (this.phase === 'show-letter' || this.phase === 'choice') &&
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
        // Track auto-complete as correct (spaced repetition still re-surfaces)
        const concept = this.isPhonicsRound
          ? PHONICS[this.currentLetter!.letter]?.sound ?? this.currentLetter!.letter
          : this.currentLetter!.letter;
        tracker.recordAnswer(concept, 'letter', true);

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

    // Dim background during show-letter/choice to highlight stars
    if (this.phase === 'show-letter' || this.phase === 'choice') {
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
  }

  handleKey(key: string): void {
    if (key === 'Escape') {
      this.gameContext.screenManager.goTo('hub');
    }
  }
}
