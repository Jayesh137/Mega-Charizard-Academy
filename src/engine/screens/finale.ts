// src/engine/screens/finale.ts
// Enhanced victory finale with ClipManager integration.
// Plays finale clip, MCX sprite flies across, shows all 4 evolution stages.
// "AMAZING TRAINING, TRAINERS!" title, then "Play Again?" prompt after ~5s.

import type { GameScreen, GameContext } from '../screen-manager';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../../config/constants';
import { theme } from '../../config/theme';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { SPRITES } from '../../config/sprites';
import { VoiceSystem } from '../voice';
import { randomRange } from '../utils/math';
import { settings } from '../../state/settings.svelte';
import { session } from '../../state/session.svelte';
import { clipManager, evolutionManager } from './hub';

export class FinaleScreen implements GameScreen {
  private bg = new Background(60); // many stars for celebratory feel
  private particles = new ParticlePool();
  private mcxSprite = new SpriteAnimator(SPRITES['charizard-megax']);
  private elapsed = 0;
  private spriteX = -300; // start offscreen left
  private showPlayAgain = false;
  private gameContext!: GameContext;
  private voice: VoiceSystem | null = null;

  // Evolution stage sprites for the showcase
  private stageSprites: SpriteAnimator[] = [
    new SpriteAnimator(SPRITES.charmander),
    new SpriteAnimator(SPRITES.charmeleon),
    new SpriteAnimator(SPRITES.charizard),
    new SpriteAnimator(SPRITES['charizard-megax']),
  ];
  private stageNames = ['Charmander', 'Charmeleon', 'Charizard', 'Mega Charizard X'];

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.elapsed = 0;
    this.spriteX = -300;
    this.showPlayAgain = false;
    setActivePool(this.particles);
    this.particles.clear();

    // Play finale clip from ClipManager
    const finaleClip = clipManager.pick('finale');
    if (finaleClip) {
      ctx.events.emit({ type: 'play-video', src: finaleClip.src });
    }

    // Cache VoiceSystem — only create once
    const audio = (ctx as any).audio;
    if (audio && !this.voice) {
      this.voice = new VoiceSystem(audio);
    }

    // Play Ash celebration line
    if (this.voice) {
      this.voice.playAshLine('correct');
      // Delayed iconic line
      const v = this.voice;
      setTimeout(() => v.playAshLine('iconic'), 2000);
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.bg.update(dt);
    this.particles.update(dt);
    this.mcxSprite.update(dt);

    // Update all stage sprites
    for (const s of this.stageSprites) {
      s.update(dt);
    }

    // MCX sprite flies across the screen
    this.spriteX += 200 * dt;

    // Spawn trailing BLUE flame particles behind sprite (MCX blue fire)
    if (this.spriteX < DESIGN_WIDTH + 300) {
      this.particles.flame(
        this.spriteX - 100,
        DESIGN_HEIGHT * 0.28,
        3,
        ['#37B1E2', '#91CCEC', '#5ED4FC', '#FFFFFF'],
        60,
      );
    }

    // Celebration burst particles periodically — blue + gold theme
    if (Math.random() < 0.1) {
      const burstX = randomRange(DESIGN_WIDTH * 0.05, DESIGN_WIDTH * 0.95);
      const burstY = randomRange(DESIGN_HEIGHT * 0.05, DESIGN_HEIGHT * 0.5);
      const colors = [
        '#37B1E2',   // MCX blue
        '#91CCEC',   // light blue
        '#5ED4FC',   // cyan blue
        '#FFD700',   // gold
      ];
      this.particles.burst(
        burstX, burstY, 5,
        colors[Math.floor(Math.random() * colors.length)],
        80, 1.0,
      );
    }

    // Show "Play Again?" prompt after 5 seconds
    if (this.elapsed > 5) {
      this.showPlayAgain = true;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.render(ctx);

    // Blue celebratory glow behind the flight path (MCX blue flames)
    const glowY = DESIGN_HEIGHT * 0.28;
    const glowGrad = ctx.createRadialGradient(
      DESIGN_WIDTH / 2, glowY, 50,
      DESIGN_WIDTH / 2, glowY, 500,
    );
    glowGrad.addColorStop(0, 'rgba(55, 177, 226, 0.18)');
    glowGrad.addColorStop(0.5, 'rgba(94, 212, 252, 0.08)');
    glowGrad.addColorStop(1, 'rgba(55, 177, 226, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Draw MCX sprite flying across with a gentle sine-wave bob
    const spriteY = DESIGN_HEIGHT * 0.28 + Math.sin(this.elapsed * 2) * 20;
    this.mcxSprite.render(ctx, this.spriteX, spriteY, 8);

    // Particles on top of sprite
    this.particles.render(ctx);

    // --- Title text ---
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title shadow for depth
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = 'bold 68px Fredoka, Nunito, sans-serif';
    ctx.fillText('AMAZING TRAINING!', DESIGN_WIDTH / 2 + 3, DESIGN_HEIGHT * 0.48 + 3);

    // Title
    ctx.fillStyle = theme.palette.ui.bannerGold;
    ctx.fillText('AMAZING TRAINING!', DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.48);

    // "You're the best!" with trainer names
    const littleName = settings.littleTrainerName;
    const bigName = settings.bigTrainerName;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 34px Fredoka, Nunito, sans-serif';
    ctx.fillText(`${littleName} & ${bigName} — You're the best!`, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.55);
    ctx.restore();

    // --- Evolution stage showcase ---
    this.drawEvolutionShowcase(ctx);

    // "Play Again?" prompt (pulses gently)
    if (this.showPlayAgain) {
      const pulseAlpha = 0.5 + 0.5 * Math.sin(this.elapsed * 3);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${pulseAlpha})`;
      ctx.font = 'bold 30px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click anywhere to play again', DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.92);
      ctx.restore();
    }
  }

  exit(): void {
    this.particles.clear();
    this.voice = null;
  }

  handleClick(_x: number, _y: number): void {
    if (this.showPlayAgain) {
      session.reset();
      evolutionManager.reset();
      clipManager.reset();
      this.gameContext.screenManager.goTo('hub');
    }
  }

  handleKey(_key: string): void {
    if (this.showPlayAgain) {
      session.reset();
      evolutionManager.reset();
      clipManager.reset();
      this.gameContext.screenManager.goTo('hub');
    }
  }

  // ---------------------------------------------------------------------------
  // Evolution stage showcase — shows all 4 stages in a row
  // ---------------------------------------------------------------------------

  private drawEvolutionShowcase(ctx: CanvasRenderingContext2D): void {
    const y = DESIGN_HEIGHT * 0.72;
    const spacing = DESIGN_WIDTH / 5;
    const scales = [4, 4.5, 5, 5.5];

    // Reveal stages one by one
    for (let i = 0; i < 4; i++) {
      const revealTime = 1.5 + i * 0.8;
      if (this.elapsed < revealTime) continue;

      const x = spacing * (i + 1);
      const fadeIn = Math.min((this.elapsed - revealTime) / 0.5, 1);

      ctx.save();
      ctx.globalAlpha = fadeIn;

      // Arrow between stages
      if (i > 0) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 36px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u2192', (x + spacing * i) / 2, y);
      }

      // Sprite
      this.stageSprites[i].render(ctx, x, y - 10, scales[i]);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.stageNames[i], x, y + 50);

      ctx.restore();
    }
  }
}
