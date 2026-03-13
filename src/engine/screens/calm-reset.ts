// src/engine/screens/calm-reset.ts
// Passive 5-10s breathing room between mini-games.
// Three rotating variations: Power Up, Stargazing, Flame Rest.
// Now enhanced with ClipManager integration and evolution teasing.
// No interaction required — auto-transitions to hub when complete.

import type { GameScreen, GameContext } from '../screen-manager';
import { DESIGN_WIDTH, DESIGN_HEIGHT, CALM_RESET_DURATION } from '../../config/constants';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { SPRITES } from '../../config/sprites';
import { VoiceSystem } from '../voice';
import { randomRange } from '../utils/math';
import { settings } from '../../state/settings.svelte';
import { session } from '../../state/session.svelte';
import { clipManager } from './hub';

type ResetVariation = 'power-up' | 'stargazing' | 'flame-rest';

// ---------------------------------------------------------------------------
// Stargazing helper: pre-generated star positions for the fade-in effect
// ---------------------------------------------------------------------------
interface FadeStar {
  x: number;
  y: number;
  radius: number;
  revealTime: number; // fraction of duration at which this star appears
}

function generateFadeStars(count: number): FadeStar[] {
  return Array.from({ length: count }, () => ({
    x: randomRange(DESIGN_WIDTH * 0.05, DESIGN_WIDTH * 0.95),
    y: randomRange(DESIGN_HEIGHT * 0.03, DESIGN_HEIGHT * 0.45),
    radius: randomRange(1.5, 4),
    revealTime: randomRange(0.05, 0.7),
  })).sort((a, b) => a.revealTime - b.revealTime);
}

// ---------------------------------------------------------------------------
// Screen Implementation
// ---------------------------------------------------------------------------

export class CalmResetScreen implements GameScreen {
  private bg = new Background(15); // fewer stars — calm feel
  private particles = new ParticlePool();
  private sprite!: SpriteAnimator;
  private voice: VoiceSystem | null = null;
  private variation: ResetVariation = 'power-up';
  private elapsed = 0;
  private duration = 7;
  private showReadyText = false;
  private gameContext!: GameContext;

  // Track which voice lines have been spoken this reset (indices into variation schedule)
  private voiceTriggered: boolean[] = [];

  // Rotation state (persists across enter() calls so we cycle through all three)
  private static variationIndex = 0;

  // Stargazing data
  private fadeStars: FadeStar[] = [];
  private shootingStarTime = 0; // elapsed time when shooting star triggers
  private shootingStarX = 0;
  private shootingStarY = 0;
  private shootingStarAngle = 0;

  // Flame Rest data
  private flameScale = 0; // 0..1 — starts small, grows back

  // Adventure message from just-completed game
  private adventureMessage = 'Great training!';

  // Evolution tease — show a glow/shimmer if close to next evolution
  private showEvoTease = false;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.elapsed = 0;
    this.showReadyText = false;
    this.flameScale = 0;
    this.showEvoTease = false;
    setActivePool(this.particles);
    this.particles.clear();

    // Update sprite to current evolution stage
    const spriteKey = session.evolutionStage === 'megax' ? 'charizard-megax' : session.evolutionStage;
    this.sprite = new SpriteAnimator(SPRITES[spriteKey]);

    // Cache VoiceSystem — only create once
    const audio = (ctx as any).audio;
    if (audio && !this.voice) {
      this.voice = new VoiceSystem(audio);
    }

    // Reset voice triggers for this session
    this.voiceTriggered = [];

    // Rotate through variations
    const variations: ResetVariation[] = ['power-up', 'stargazing', 'flame-rest'];
    this.variation = variations[CalmResetScreen.variationIndex % 3];
    CalmResetScreen.variationIndex++;

    // Duration based on intensity setting
    this.duration = CALM_RESET_DURATION[settings.intensity];

    this.sprite.reset();

    // Capture adventure message before currentGame is cleared
    this.adventureMessage = this.getAdventureMessage();

    // Check if close to next evolution threshold (within 10%) — show tease
    const pct = (session.evolutionMeter / session.evolutionMeterMax) * 100;
    const thresholds = [33, 66, 100];
    for (const t of thresholds) {
      if (pct < t && pct >= t - 10) {
        this.showEvoTease = true;
        break;
      }
    }

    // Play a video clip between games: 40% celebration (reward), 60% calm (breathing room)
    const useCelebration = Math.random() < 0.4;
    const clip = useCelebration
      ? clipManager.pick('celebration')
      : clipManager.pick('calm');
    if (clip) {
      ctx.events.emit({ type: 'play-video', src: clip.src });
    }

    // Variation-specific init
    if (this.variation === 'stargazing') {
      this.fadeStars = generateFadeStars(30);
      this.shootingStarTime = this.duration * randomRange(0.6, 0.75);
      this.shootingStarX = randomRange(DESIGN_WIDTH * 0.1, DESIGN_WIDTH * 0.5);
      this.shootingStarY = randomRange(DESIGN_HEIGHT * 0.05, DESIGN_HEIGHT * 0.2);
      this.shootingStarAngle = randomRange(0.2, 0.6); // shallow diagonal
    }
  }

  update(dt: number): void {
    // Freeze countdown while space is held (extending the calm reset)
    if (!session.resetExtended) {
      this.elapsed += dt;
    }

    this.bg.update(dt);
    this.particles.update(dt);
    this.sprite.update(dt);

    // Show "Ready?" text at 80% through
    if (this.elapsed >= this.duration * 0.8) {
      this.showReadyText = true;
    }

    // Spawn variation-specific particles
    this.spawnVariationParticles(dt);

    // Trigger educational voice reinforcement at scheduled times
    this.triggerVoiceReinforcement();

    // Flame Rest: gradually grow flame scale from 0 -> 1
    if (this.variation === 'flame-rest') {
      const progress = Math.min(this.elapsed / this.duration, 1);
      // Slow start, accelerate near the end (ease-in curve)
      this.flameScale = progress * progress;
    }

    // Evolution tease shimmer particles
    if (this.showEvoTease && Math.random() < 0.2) {
      this.particles.spawn({
        x: DESIGN_WIDTH / 2 + randomRange(-60, 60),
        y: DESIGN_HEIGHT * 0.55 + randomRange(-40, 40),
        vx: randomRange(-10, 10),
        vy: randomRange(-30, -10),
        color: '#FFD700',
        size: randomRange(2, 5),
        lifetime: randomRange(0.6, 1.2),
        drag: 0.97,
        fadeOut: true,
        shrink: true,
      });
    }

    // Auto-transition when done
    if (this.elapsed >= this.duration) {
      this.gameContext.screenManager.goTo('hub');
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.render(ctx);

    // Variation-specific background effects (drawn before Charizard)
    switch (this.variation) {
      case 'power-up':
        this.renderPowerUpGlow(ctx);
        break;
      case 'stargazing':
        this.renderStargazingStars(ctx);
        break;
      case 'flame-rest':
        this.renderFlameRestGlow(ctx);
        break;
    }

    // Evolution tease glow
    if (this.showEvoTease) {
      const teaseAlpha = 0.1 + 0.1 * Math.sin(this.elapsed * 4);
      const teaseGrad = ctx.createRadialGradient(
        DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.55, 20,
        DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.55, 200,
      );
      teaseGrad.addColorStop(0, `rgba(255, 215, 0, ${teaseAlpha})`);
      teaseGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = teaseGrad;
      ctx.beginPath();
      ctx.arc(DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.55, 200, 0, Math.PI * 2);
      ctx.fill();
    }

    // Current evolution sprite centered, resting pose
    const charX = DESIGN_WIDTH / 2;
    const charY = DESIGN_HEIGHT * 0.55;
    const stageScale = session.evolutionStage === 'charmander' ? 5 :
                       session.evolutionStage === 'charmeleon' ? 5.5 :
                       session.evolutionStage === 'charizard' ? 6 : 6;
    this.sprite.render(ctx, charX, charY, stageScale);

    // Particles on top
    this.particles.render(ctx);

    // Variation-specific overlays (shooting star, etc.)
    if (this.variation === 'stargazing') {
      this.renderShootingStar(ctx);
    }

    // Evolution tease text
    if (this.showEvoTease && this.elapsed > 1.5 && this.elapsed < this.duration * 0.75) {
      ctx.save();
      const teaseTextAlpha = 0.6 + 0.3 * Math.sin(this.elapsed * 2);
      ctx.globalAlpha = teaseTextAlpha;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 32px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Almost evolving...!', DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.20);
      ctx.restore();
    }

    // "Ready, [Name]?" text near the end
    if (this.showReadyText) {
      this.renderReadyText(ctx);
    }
  }

  exit(): void {
    this.particles.clear();
    this.voice = null;
  }

  handleClick(_x: number, _y: number): void {
    // Passive screen — no interaction
  }

  handleKey(_key: string): void {
    // Passive screen — no interaction
    // (Space hold is handled externally via session.resetExtended)
  }

  // ---------------------------------------------------------------------------
  // Variation: Power Up — rhythmic blue glow + floating embers
  // ---------------------------------------------------------------------------

  private renderPowerUpGlow(ctx: CanvasRenderingContext2D): void {
    const charX = DESIGN_WIDTH / 2;
    const charY = DESIGN_HEIGHT * 0.55;

    // Pulsing radial blue glow that breathes (bright 2s, dim 2s => 4s cycle)
    const breathCycle = Math.sin(this.elapsed * Math.PI / 2); // full cycle = 4s
    const glowAlpha = 0.08 + 0.14 * (0.5 + 0.5 * breathCycle);
    const glowRadius = 280 + 60 * breathCycle;

    const grad = ctx.createRadialGradient(
      charX, charY, 40,
      charX, charY, glowRadius,
    );
    grad.addColorStop(0, `rgba(55, 177, 226, ${glowAlpha * 1.5})`);
    grad.addColorStop(0.5, `rgba(55, 177, 226, ${glowAlpha})`);
    grad.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(charX, charY, glowRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Variation: Stargazing — stars fade in + shooting star
  // ---------------------------------------------------------------------------

  private renderStargazingStars(ctx: CanvasRenderingContext2D): void {
    const progress = Math.min(this.elapsed / this.duration, 1);

    for (const star of this.fadeStars) {
      if (progress < star.revealTime) continue;

      // Fade in over 0.5s after reveal time
      const timeSinceReveal = (progress - star.revealTime) * this.duration;
      const alpha = Math.min(timeSinceReveal / 0.5, 1);

      // Gentle twinkle
      const twinkle = 0.7 + 0.3 * Math.sin(this.elapsed * 1.5 + star.x * 0.01);

      ctx.globalAlpha = alpha * twinkle;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private renderShootingStar(ctx: CanvasRenderingContext2D): void {
    // Only visible for ~0.6s after trigger time
    const timeSinceTrigger = this.elapsed - this.shootingStarTime;
    if (timeSinceTrigger < 0 || timeSinceTrigger > 0.6) return;

    const t = timeSinceTrigger / 0.6; // 0..1 animation progress
    const speed = 900;
    const dx = Math.cos(this.shootingStarAngle) * speed * timeSinceTrigger;
    const dy = Math.sin(this.shootingStarAngle) * speed * timeSinceTrigger;

    const headX = this.shootingStarX + dx;
    const headY = this.shootingStarY + dy;

    // Trail (blue gradient line behind the head)
    const trailLen = 150;
    const tailX = headX - Math.cos(this.shootingStarAngle) * trailLen;
    const tailY = headY - Math.sin(this.shootingStarAngle) * trailLen;

    const fade = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7; // fade in then out

    ctx.save();
    ctx.globalAlpha = fade;

    // Trail line
    const trailGrad = ctx.createLinearGradient(tailX, tailY, headX, headY);
    trailGrad.addColorStop(0, 'rgba(55, 177, 226, 0)');
    trailGrad.addColorStop(0.6, 'rgba(55, 177, 226, 0.5)');
    trailGrad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');
    ctx.strokeStyle = trailGrad;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();

    // Bright head dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(headX, headY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Variation: Flame Rest — small candle glow that grows back
  // ---------------------------------------------------------------------------

  private renderFlameRestGlow(ctx: CanvasRenderingContext2D): void {
    // Gentle warm glow at tail area that grows with flameScale
    const tailGlowX = DESIGN_WIDTH / 2 - 130 * 0.65; // approximate tail tip at scale 0.65
    const tailGlowY = DESIGN_HEIGHT * 0.55 + 50 * 0.65;

    const baseRadius = 30 + 80 * this.flameScale;
    const alpha = 0.06 + 0.12 * this.flameScale;

    const grad = ctx.createRadialGradient(
      tailGlowX, tailGlowY, 5,
      tailGlowX, tailGlowY, baseRadius,
    );
    grad.addColorStop(0, `rgba(55, 177, 226, ${alpha * 2})`);
    grad.addColorStop(0.5, `rgba(55, 177, 226, ${alpha})`);
    grad.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(tailGlowX, tailGlowY, baseRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Variation-specific particle spawning
  // ---------------------------------------------------------------------------

  private spawnVariationParticles(_dt: number): void {
    const charX = DESIGN_WIDTH / 2;
    const charY = DESIGN_HEIGHT * 0.55;

    switch (this.variation) {
      case 'power-up': {
        // Slow-rising blue ember "firefly" particles
        if (Math.random() < 0.15) {
          this.particles.spawn({
            x: charX + randomRange(-120, 120),
            y: charY + randomRange(-40, 80),
            vx: randomRange(-8, 8),
            vy: randomRange(-40, -15),
            color: ['#37B1E2', '#91CCEC', '#FFFFFF'][Math.floor(Math.random() * 3)],
            size: randomRange(2, 5),
            lifetime: randomRange(2, 4),
            drag: 0.99,
            fadeOut: true,
            shrink: false,
          });
        }
        break;
      }

      case 'stargazing': {
        // Gentle tail flame flicker — very subtle
        if (Math.random() < 0.08) {
          const tailX = charX - 130 * 0.65;
          const tailY = charY + 50 * 0.65;
          this.particles.spawn({
            x: tailX + randomRange(-4, 4),
            y: tailY + randomRange(-3, 3),
            vx: randomRange(-5, 5),
            vy: randomRange(-25, -10),
            color: ['#37B1E2', '#91CCEC'][Math.floor(Math.random() * 2)],
            size: randomRange(2, 4),
            lifetime: randomRange(0.4, 0.9),
            drag: 0.97,
            fadeOut: true,
            shrink: true,
          });
        }
        break;
      }

      case 'flame-rest': {
        // Blue embers in slow spirals — count/size scales with flameScale
        const spawnChance = 0.05 + 0.2 * this.flameScale;
        if (Math.random() < spawnChance) {
          const angle = this.elapsed * 0.5 + randomRange(0, Math.PI * 2);
          const spiralR = randomRange(20, 80);
          const spawnX = charX + Math.cos(angle) * spiralR;
          const spawnY = charY + Math.sin(angle) * spiralR * 0.5;

          // Spiral velocity: tangential drift
          const tangentVx = -Math.sin(angle) * 15;
          const tangentVy = Math.cos(angle) * 8 - 20; // drift upward

          this.particles.spawn({
            x: spawnX,
            y: spawnY,
            vx: tangentVx + randomRange(-5, 5),
            vy: tangentVy + randomRange(-10, 0),
            color: ['#37B1E2', '#91CCEC', '#FFFFFF'][Math.floor(Math.random() * 3)],
            size: randomRange(1.5, 3) + 2 * this.flameScale,
            lifetime: randomRange(1.5, 3),
            drag: 0.98,
            fadeOut: true,
            shrink: true,
          });
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Educational voice reinforcement — soft, whisper-tempo voice cues
  // ---------------------------------------------------------------------------

  /**
   * Each variation has 2-3 scheduled voice lines at specific elapsed-time
   * fractions. Lines are triggered once and tracked via voiceTriggered[].
   */
  private triggerVoiceReinforcement(): void {
    if (!this.voice) return;

    // Build schedule based on current variation
    // Each entry: [timeFraction, text]
    let schedule: [number, string][];

    switch (this.variation) {
      case 'power-up':
        // Slow color naming — name the blue glow
        schedule = [
          [0.20, 'Blue glow'],
          [0.50, 'Blue'],
        ];
        break;

      case 'stargazing':
        // Soft counting of stars as they appear
        schedule = [
          [0.15, 'One star'],
          [0.35, 'Two stars'],
          [0.55, 'Three'],
        ];
        break;

      case 'flame-rest':
        // Size words as the flame grows from small to big
        schedule = [
          [0.25, 'Small flame'],
          [0.60, 'Big flame'],
        ];
        break;

      default:
        return;
    }

    // Check each scheduled voice line
    for (let i = 0; i < schedule.length; i++) {
      if (this.voiceTriggered[i]) continue;
      const [fraction, text] = schedule[i];
      if (this.elapsed >= this.duration * fraction) {
        this.voiceTriggered[i] = true;
        this.voice.narrate(text);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // "Ready, [Name]?" overlay
  // ---------------------------------------------------------------------------

  // Adventure-themed message based on which game was just played
  private getAdventureMessage(): string {
    switch (session.currentGame) {
      case 'flame-colors':      return 'Great gem hunting!';
      case 'fireball-count':    return 'The dragons are happy!';
      case 'evolution-tower':   return 'Nice fortress building!';
      case 'phonics-arena':     return 'Those runes were powerful!';
      case 'evolution-challenge': return 'Evolution knowledge grows!';
      default:                  return 'Great training!';
    }
  }

  private renderReadyText(ctx: CanvasRenderingContext2D): void {
    // Determine whose turn is coming up
    const turn = session.currentTurn;
    let name: string;
    switch (turn) {
      case 'owen':
        name = settings.littleTrainerName;
        break;
      case 'kian':
        name = settings.bigTrainerName;
        break;
      default:
        name = 'Trainers';
    }

    // Fade in (0..1 over 0.5s from when text starts showing)
    const fadeStart = this.duration * 0.8;
    const fadeT = Math.min((this.elapsed - fadeStart) / 0.5, 1);
    const alpha = fadeT;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Adventure-themed message from the game just completed
    ctx.fillStyle = '#91CCEC';
    ctx.font = 'bold 48px Fredoka, Nunito, sans-serif';
    ctx.fillText(this.adventureMessage, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.82);

    // "Ready, [Name]?" below
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Fredoka, Nunito, sans-serif';
    ctx.fillText(`Ready, ${name}?`, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.90);

    ctx.restore();
  }
}
