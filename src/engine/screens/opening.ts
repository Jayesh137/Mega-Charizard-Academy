// src/engine/screens/opening.ts
// Opening screen: uses ClipManager for intro clip rotation.
// First visit: plays a random intro clip, falls back to sprite sequence.
// Return visits: skip straight to hub.

import type { GameScreen, GameContext } from '../screen-manager';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { SPRITES } from '../../config/sprites';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../../config/constants';
import { settings } from '../../state/settings.svelte';
import { clipManager } from './hub';

type Phase = 'video' | 'charmander' | 'charmeleon' | 'charizard' | 'flash' | 'megax' | 'title' | 'done';

// Total duration: charmander(2) + charmeleon(2) + charizard(2) + flash(0.5) + megax(3) + title(2) = 11.5s
const TOTAL_DURATION = 11.5;

export class OpeningScreen implements GameScreen {
  private bg = new Background();
  private particles = new ParticlePool();
  private gameContext!: GameContext;
  private phase: Phase = 'video';
  private phaseTime = 0;
  private totalElapsed = 0;
  private flashAlpha = 0;
  private timeouts: number[] = [];

  // Screen shake
  private shakeOffsetX = 0;
  private shakeOffsetY = 0;
  private shakeIntensity = 0;

  // Glow ring for Mega X phase
  private glowRingRadius = 0;
  private glowRingAlpha = 0;

  // Label animation
  private labelSlideOffset = 0;
  private labelAlpha = 0;

  // Title animation
  private titleScale = 0;
  private academyOffsetY = 0;
  private subtitleAlpha = 0;

  // Sound trigger flags to prevent repeats
  private soundsPlayed = new Set<string>();

  // Sprites for fallback animation
  private sprites: Record<string, SpriteAnimator> = {
    charmander: new SpriteAnimator(SPRITES.charmander),
    charmeleon: new SpriteAnimator(SPRITES.charmeleon),
    charizard: new SpriteAnimator(SPRITES.charizard),
    megax: new SpriteAnimator(SPRITES['charizard-megax']),
  };

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.phaseTime = 0;
    this.totalElapsed = 0;
    this.flashAlpha = 0;
    this.shakeOffsetX = 0;
    this.shakeOffsetY = 0;
    this.shakeIntensity = 0;
    this.glowRingRadius = 0;
    this.glowRingAlpha = 0;
    this.labelSlideOffset = 0;
    this.labelAlpha = 0;
    this.titleScale = 0;
    this.academyOffsetY = 0;
    this.subtitleAlpha = 0;
    this.soundsPlayed.clear();
    setActivePool(this.particles);
    this.particles.clear();

    // Return visits: skip to hub
    if (!settings.isFirstVisit) {
      ctx.screenManager.goTo('hub');
      return;
    }

    // First visit: pick a random intro clip via ClipManager
    this.phase = 'video';
    const introClip = clipManager.pick('intro');
    if (introClip) {
      ctx.events.emit({ type: 'play-video', src: introClip.src, onEnd: 'hub' });
    } else {
      // No clips available — start sprite fallback immediately
      this.phase = 'charmander';
      this.phaseTime = 0;
    }

    // If video doesn't play (file missing), start sprite fallback after 500ms
    this.delay(() => {
      if (this.phase === 'video') {
        this.phase = 'charmander';
        this.phaseTime = 0;
      }
    }, 500);

    settings.isFirstVisit = false;
  }

  update(dt: number): void {
    if (this.phase === 'video' || this.phase === 'done') return;

    this.phaseTime += dt;
    this.totalElapsed += dt;
    this.bg.update(dt);
    this.particles.update(dt);

    // Update all sprites
    for (const sprite of Object.values(this.sprites)) {
      sprite.update(dt);
    }

    // Decay screen shake
    if (this.shakeIntensity > 0) {
      this.shakeIntensity *= 0.9;
      this.shakeOffsetX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      if (this.shakeIntensity < 0.1) {
        this.shakeIntensity = 0;
        this.shakeOffsetX = 0;
        this.shakeOffsetY = 0;
      }
    }

    const cx = DESIGN_WIDTH / 2;

    // Phase-specific updates
    switch (this.phase) {
      case 'charmander': {
        // Fade-in label from left
        const t = Math.min(this.phaseTime / 0.5, 1);
        this.labelSlideOffset = (1 - t) * -200;
        this.labelAlpha = t;

        // Sound: fire-crackle on appear
        this.playOnce('charmander-sound', 'fire-crackle');

        // Orange flame particles below sprite
        if (Math.random() < 0.3) {
          this.particles.flame(
            cx + (Math.random() - 0.5) * 120,
            DESIGN_HEIGHT * 0.65,
            1,
            ['#FF8C00', '#FF6600', '#FFA500', '#FFD700'],
            20,
          );
        }

        if (this.phaseTime >= 2.0) {
          // Burst on transition
          this.particles.burst(cx, DESIGN_HEIGHT * 0.5, 20, '#FF6600', 200, 0.6);
          this.playOnce('charmeleon-transition', 'fireball');
          this.phase = 'charmeleon';
          this.phaseTime = 0;
        }
        break;
      }

      case 'charmeleon': {
        // Slide label from right
        const t = Math.min(this.phaseTime / 0.5, 1);
        this.labelSlideOffset = (1 - t) * 200;
        this.labelAlpha = t;

        // More intense particles
        if (Math.random() < 0.4) {
          this.particles.flame(
            cx + (Math.random() - 0.5) * 150,
            DESIGN_HEIGHT * 0.65,
            1,
            ['#FF4500', '#FF6600', '#FF8C00', '#FFD700'],
            25,
          );
        }

        if (this.phaseTime >= 2.0) {
          // Bigger burst on transition
          this.particles.burst(cx, DESIGN_HEIGHT * 0.5, 30, '#FF4500', 250, 0.7);
          this.playOnce('charizard-transition', 'fireball');
          this.phase = 'charizard';
          this.phaseTime = 0;
        }
        break;
      }

      case 'charizard': {
        // Slide label from left
        const t = Math.min(this.phaseTime / 0.5, 1);
        this.labelSlideOffset = (1 - t) * -200;
        this.labelAlpha = t;

        // Sound: roar on appear
        this.playOnce('charizard-roar', 'roar');

        // Screen shake
        if (this.phaseTime < 0.5) {
          this.shakeIntensity = 3;
        }

        // Intense rapid flame particles
        if (Math.random() < 0.5) {
          this.particles.flame(
            cx + (Math.random() - 0.5) * 200,
            DESIGN_HEIGHT * 0.6,
            2,
            ['#FF2200', '#FF4500', '#FF6600', '#FFD700'],
            30,
          );
        }

        if (this.phaseTime >= 2.0) {
          this.playOnce('flash-impact', 'impact');
          this.phase = 'flash';
          this.phaseTime = 0;
          this.flashAlpha = 1;
        }
        break;
      }

      case 'flash': {
        this.flashAlpha = 1 - this.phaseTime / 0.5;

        // Burst of white/gold particles from center
        if (this.phaseTime < 0.1) {
          this.particles.burst(cx, DESIGN_HEIGHT * 0.5, 50, '#FFFFFF', 350, 0.8);
          this.particles.burst(cx, DESIGN_HEIGHT * 0.5, 25, '#FFD700', 300, 0.7);
        }

        if (this.phaseTime >= 0.5) {
          this.playOnce('megax-appear', 'level-up');
          this.phase = 'megax';
          this.phaseTime = 0;
          this.glowRingRadius = 0;
          this.glowRingAlpha = 1;
        }
        break;
      }

      case 'megax': {
        // Pulsing cyan glow ring expands outward
        this.glowRingRadius += dt * 200;
        this.glowRingAlpha = Math.max(0, 1 - this.glowRingRadius / 500);

        // Reset ring periodically for pulsing effect
        if (this.glowRingRadius > 500) {
          this.glowRingRadius = 0;
          this.glowRingAlpha = 1;
        }

        // Blue flame particles from "wings" (left and right of sprite)
        if (Math.random() < 0.5) {
          // Left wing
          this.particles.flame(
            cx - 120 + (Math.random() - 0.5) * 40,
            DESIGN_HEIGHT * 0.45,
            1,
            ['#37B1E2', '#00BFFF', '#E0F7FF', '#FFFFFF'],
            15,
          );
          // Right wing
          this.particles.flame(
            cx + 120 + (Math.random() - 0.5) * 40,
            DESIGN_HEIGHT * 0.45,
            1,
            ['#37B1E2', '#00BFFF', '#E0F7FF', '#FFFFFF'],
            15,
          );
        }

        // Central blue flame
        if (Math.random() < 0.3) {
          this.particles.flame(
            cx + (Math.random() - 0.5) * 100,
            DESIGN_HEIGHT * 0.6,
            1,
            ['#37B1E2', '#E0F7FF', '#FFFFFF'],
            20,
          );
        }

        if (this.phaseTime >= 3.0) {
          this.playOnce('title-cheer', 'cheer');
          this.phase = 'title';
          this.phaseTime = 0;
          this.titleScale = 0;
          this.academyOffsetY = 80;
          this.subtitleAlpha = 0;
        }
        break;
      }

      case 'title': {
        // Spring overshoot for MEGA CHARIZARD text: scales from 0 to ~1.15 then settles to 1
        const t = Math.min(this.phaseTime / 0.6, 1);
        if (t < 1) {
          // Spring curve: overshoot to 1.15, settle to 1
          this.titleScale = t * (1 + 0.15 * Math.sin(t * Math.PI));
        } else {
          this.titleScale = 1;
        }

        // ACADEMY slides up
        const slideT = Math.min(Math.max((this.phaseTime - 0.3) / 0.5, 0), 1);
        this.academyOffsetY = (1 - slideT) * 80;

        // Subtitle fades in
        this.subtitleAlpha = Math.min(Math.max((this.phaseTime - 0.8) / 0.7, 0), 0.6);

        // Gold particle shower from top
        if (Math.random() < 0.4) {
          this.particles.spawn({
            x: Math.random() * DESIGN_WIDTH,
            y: -10,
            vx: (Math.random() - 0.5) * 40,
            vy: 80 + Math.random() * 120,
            color: ['#FFD700', '#FFC107', '#FFEB3B', '#FFA000'][Math.floor(Math.random() * 4)],
            size: 2 + Math.random() * 4,
            lifetime: 1.5 + Math.random() * 1.0,
            gravity: 30,
            drag: 0.99,
            fadeOut: true,
            shrink: true,
          });
        }

        // Blue flame particles continue
        if (Math.random() < 0.2) {
          this.particles.flame(
            cx + (Math.random() - 0.5) * 200,
            DESIGN_HEIGHT * 0.65,
            1,
            ['#37B1E2', '#E0F7FF', '#FFFFFF'],
            25,
          );
        }

        if (this.phaseTime >= 2.0) {
          this.phase = 'done';
          this.gameContext.screenManager.goTo('hub');
        }
        break;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.render(ctx);

    if (this.phase === 'video' || this.phase === 'done') return; // Video overlay handles rendering

    // Apply screen shake
    ctx.save();
    if (this.shakeIntensity > 0) {
      ctx.translate(this.shakeOffsetX, this.shakeOffsetY);
    }

    const cx = DESIGN_WIDTH / 2;
    const cy = DESIGN_HEIGHT * 0.5;

    // Draw current evolution stage
    switch (this.phase) {
      case 'charmander': {
        // Warm orange glow behind sprite
        const fadeIn = Math.min(this.phaseTime / 0.5, 1);
        this.drawGlow(ctx, cx, cy, 120, `rgba(255, 140, 0, ${0.3 * fadeIn})`);
        ctx.save();
        ctx.globalAlpha = fadeIn;
        this.sprites.charmander.render(ctx, cx, cy, 8);
        ctx.restore();
        this.drawLabelAnimated(ctx, 'Charmander', this.labelSlideOffset, this.labelAlpha);
        break;
      }

      case 'charmeleon': {
        // Red/orange glow — more intense
        this.drawGlow(ctx, cx, cy, 150, 'rgba(255, 69, 0, 0.35)');
        this.sprites.charmeleon.render(ctx, cx, cy, 9);
        this.drawLabelAnimated(ctx, 'Charmeleon', this.labelSlideOffset, this.labelAlpha);
        break;
      }

      case 'charizard': {
        // Intense orange-red glow
        this.drawGlow(ctx, cx, cy, 180, 'rgba(255, 34, 0, 0.4)');
        this.sprites.charizard.render(ctx, cx, cy, 10);
        this.drawLabelAnimated(ctx, 'Charizard', this.labelSlideOffset, this.labelAlpha);
        break;
      }

      case 'flash':
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, this.flashAlpha)})`;
        ctx.fillRect(-10, -10, DESIGN_WIDTH + 20, DESIGN_HEIGHT + 20); // Extra to cover shake offset
        ctx.restore();
        break;

      case 'megax': {
        // Blue flame glow behind sprite
        this.drawGlow(ctx, cx, cy, 200, 'rgba(55, 177, 226, 0.4)');

        // Pulsing cyan glow ring
        if (this.glowRingAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = this.glowRingAlpha * 0.5;
          ctx.strokeStyle = '#00FFFF';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, this.glowRingRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        this.sprites.megax.render(ctx, cx, cy, 10);
        break;
      }

      case 'title': {
        // Blue glow persists
        this.drawGlow(ctx, cx, cy, 200, 'rgba(55, 177, 226, 0.35)');
        this.sprites.megax.render(ctx, cx, cy, 10);
        this.drawTitleAnimated(ctx);
        break;
      }
    }

    this.particles.render(ctx);

    // Restore from screen shake
    ctx.restore();

    // Progress bar at very bottom (drawn outside shake transform)
    this.drawProgressBar(ctx);

    // Skip hint
    if (this.phaseTime > 1.0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Tap to skip', DESIGN_WIDTH - 60, DESIGN_HEIGHT - 40);
      ctx.restore();
    }
  }

  /** Radial glow behind the sprite. */
  private drawGlow(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    radius: number,
    color: string,
  ): void {
    ctx.save();
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Label with slide and fade animation. */
  private drawLabelAnimated(
    ctx: CanvasRenderingContext2D,
    name: string,
    offsetX: number,
    alpha: number,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.8)';
    ctx.shadowBlur = 20;
    ctx.fillText(name, DESIGN_WIDTH / 2 + offsetX, DESIGN_HEIGHT * 0.8);
    ctx.restore();
  }

  /** Animated title with spring scale, slide-up ACADEMY, and subtitle fade. */
  private drawTitleAnimated(ctx: CanvasRenderingContext2D): void {
    const cx = DESIGN_WIDTH / 2;

    // "MEGA CHARIZARD" with spring scale
    ctx.save();
    ctx.translate(cx, DESIGN_HEIGHT * 0.25);
    ctx.scale(this.titleScale, this.titleScale);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.8)';
    ctx.shadowBlur = 30;
    ctx.fillText('MEGA CHARIZARD', 0, 0);
    ctx.restore();

    // "ACADEMY" slides up from below
    const academyAlpha = Math.min(Math.max((this.phaseTime - 0.3) / 0.5, 0), 1);
    ctx.save();
    ctx.globalAlpha = academyAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 80px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(55, 177, 226, 0.8)';
    ctx.shadowBlur = 30;
    ctx.fillText('ACADEMY', cx, DESIGN_HEIGHT * 0.35 + this.academyOffsetY);
    ctx.restore();

    // Subtitle "Owen & Kian's Training" fades in
    if (this.subtitleAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.subtitleAlpha;
      ctx.fillStyle = '#E0F7FF';
      ctx.font = '36px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(55, 177, 226, 0.5)';
      ctx.shadowBlur = 15;
      ctx.fillText("Owen & Kian's Training", cx, DESIGN_HEIGHT * 0.43);
      ctx.restore();
    }
  }

  /** Thin progress bar at the bottom of the screen. */
  private drawProgressBar(ctx: CanvasRenderingContext2D): void {
    const progress = Math.min(this.totalElapsed / TOTAL_DURATION, 1);
    const barHeight = 4;
    const barY = DESIGN_HEIGHT - barHeight;

    // Background track
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, barY, DESIGN_WIDTH, barHeight);

    // Filled portion — cyan
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#00FFFF';
    ctx.fillRect(0, barY, DESIGN_WIDTH * progress, barHeight);
    ctx.restore();
  }

  /** Play a synth sound exactly once per opening sequence. */
  private playOnce(id: string, synthName: string): void {
    if (this.soundsPlayed.has(id)) return;
    this.soundsPlayed.add(id);
    this.gameContext.audio?.playSynth(synthName);
  }

  exit(): void {
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    this.particles.clear();
  }

  private delay(fn: () => void, ms: number): void {
    this.timeouts.push(window.setTimeout(fn, ms) as unknown as number);
  }

  handleClick(_x: number, _y: number): void {
    // Skip to hub on click during sprite fallback
    if (this.phase !== 'video' && this.phase !== 'done') {
      this.phase = 'done';
      this.gameContext.screenManager.goTo('hub');
    }
  }

  handleKey(_key: string): void {
    // Skip to hub on any key during sprite fallback
    if (this.phase !== 'video' && this.phase !== 'done') {
      this.phase = 'done';
      this.gameContext.screenManager.goTo('hub');
    }
  }
}
