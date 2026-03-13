// src/engine/screens/hub.ts
// Evolution Journey Hub — shows current evolution stage, evolution meter,
// and "Start Training!" button. Replaces old gem-collection hub.

import type { GameScreen, GameContext } from '../screen-manager';
import type { EvolutionStage } from '../../state/types';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { SPRITES } from '../../config/sprites';
import { VoiceSystem } from '../voice';
import { session } from '../../state/session.svelte';
import { settings } from '../../state/settings.svelte';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../../config/constants';
import { EvolutionManager } from '../systems/evolution-manager';
import { SessionLimiter } from '../systems/session-limiter';
import { ClipManager } from '../systems/clip-manager';
import { pickNextGame } from '../systems/focus-weight';

// ---------------------------------------------------------------------------
// Shared singleton instances (persist across screen transitions)
// ---------------------------------------------------------------------------

const evolutionManager = new EvolutionManager();
const sessionLimiter = new SessionLimiter();
const clipManager = new ClipManager();

// Export so other screens can access them
export { evolutionManager, sessionLimiter, clipManager };

// ---------------------------------------------------------------------------
// Game sequence — determines which game plays at each slot
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Evolution stage display names
// ---------------------------------------------------------------------------

const STAGE_NAMES: Record<EvolutionStage, string> = {
  charmander: 'Charmander',
  charmeleon: 'Charmeleon',
  charizard: 'Charizard',
  megax: 'Mega Charizard X',
};

// ---------------------------------------------------------------------------
// Button dimensions
// ---------------------------------------------------------------------------

const BTN_W = 400;
const BTN_H = 90;
const BTN_X = DESIGN_WIDTH / 2 - BTN_W / 2;
const BTN_Y = DESIGN_HEIGHT * 0.78;

// ---------------------------------------------------------------------------
// Hub Screen
// ---------------------------------------------------------------------------

export class HubScreen implements GameScreen {
  private bg = new Background();
  private particles = new ParticlePool();
  private sprite!: SpriteAnimator;
  private time = 0;
  private gameContext!: GameContext;
  private selectionPending = false;
  private justEvolvedTo: EvolutionStage | null = null;
  private evolveAnimTime = 0;
  private evolveFlashAlpha = 0;
  private wingFlutterTimer = 0;
  private blocked: { reason: string; waitUntil?: number } | null = null;
  private voice: VoiceSystem | null = null;

  private get audio(): any { return (this.gameContext as any).audio; }

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.time = 0;
    this.selectionPending = false;
    this.justEvolvedTo = null;
    this.evolveAnimTime = 0;
    this.evolveFlashAlpha = 0;
    this.wingFlutterTimer = 0;
    this.blocked = null;
    // Cache VoiceSystem — only create once
    const audio = (ctx as any).audio;
    if (audio && !this.voice) {
      this.voice = new VoiceSystem(audio);
    }
    setActivePool(this.particles);
    this.particles.clear();

    // Update sprite to current evolution stage
    this.updateSprite();

    // Check session limits
    const check = sessionLimiter.canStartSession();
    if (!check.allowed) {
      this.blocked = { reason: check.reason!, waitUntil: check.waitUntil };
      // Emit session-blocked event for overlay
      ctx.events.emit({ type: 'session-blocked', reason: check.reason!, waitUntil: check.waitUntil });
      return;
    }

    // Record gem collection from just-completed game (backward compat)
    if (session.currentGame && !session.gemsCollected.includes(session.currentGame)) {
      session.gemsCollected = [...session.gemsCollected, session.currentGame];
    }

    // Increment games completed when returning from a game
    if (session.currentGame) {
      session.gamesCompleted++;

      // Check for evolution after game completion
      const evo = evolutionManager.addCharge(0); // meter was already charged during game
      if (evo) {
        this.justEvolvedTo = evo;
        this.evolveAnimTime = 0;
        this.evolveFlashAlpha = 1;
        this.updateSprite();

        // Play evolution clip
        const clip = clipManager.getEvolutionClip(evo);
        if (clip) {
          ctx.events.emit({ type: 'play-video', src: clip.src });
        }

        // Ash evolution line
        if (this.voice) {
          if (evo === 'charmeleon') this.voice.playAshLine('evolution');
          else if (evo === 'charizard') this.voice.ash('evo-charizard');
          else if (evo === 'megax') this.voice.ash('evo-mega');
        }

        this.audio?.playSynth('cheer');
      } else {
        // Play celebration clip for game completion (no evolution)
        const celebClip = clipManager.pick('celebration');
        if (celebClip) {
          ctx.events.emit({ type: 'play-video', src: celebClip.src });
        }
        this.audio?.playSynth('cheer');
      }
    }

    session.currentGame = null;

    // Welcome voice
    if (this.voice) {
      if (session.gamesCompleted === 0) {
        this.voice.playAshLine('iconic');
      } else {
        this.voice.playAshLine('encourage');
      }
    }

    // Check for finale — all 4 games completed
    if (session.gamesCompleted >= 4) {
      sessionLimiter.recordSessionEnd();
      setTimeout(() => ctx.screenManager.goTo('finale'), 2000);
      return;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.bg.update(dt);
    this.sprite.update(dt);
    this.particles.update(dt);

    // Evolution flash animation
    if (this.justEvolvedTo) {
      this.evolveAnimTime += dt;
      this.evolveFlashAlpha = Math.max(0, 1 - this.evolveAnimTime / 1.5);
      if (this.evolveAnimTime > 3.0) {
        this.justEvolvedTo = null;
      }
    }

    // Ambient flame particles — intensity based on evolution stage
    const stageIdx = this.stageIndex(session.evolutionStage);
    const flameRate = 0.10 + stageIdx * 0.08;
    if (Math.random() < flameRate) {
      const flameColors = stageIdx >= 3
        ? ['#37B1E2', '#E0F7FF', '#FFFFFF', '#1A5C8A']
        : ['#FF6B35', '#FFD700', '#FF4500', '#FFA500'];
      this.particles.flame(
        DESIGN_WIDTH * 0.5, DESIGN_HEIGHT * 0.48, 1,
        flameColors,
        25 + stageIdx * 10,
      );
    }

    // Extra flame effects at higher evolution stages
    if (stageIdx >= 2) {
      this.wingFlutterTimer += dt;
      if (this.wingFlutterTimer > 2.5 - stageIdx * 0.5) {
        this.wingFlutterTimer = 0;
        const burstColors = stageIdx >= 3
          ? ['#37B1E2', '#E0F7FF', '#FFFFFF']
          : ['#FF6B35', '#FFD700', '#FFFFFF'];
        this.particles.flame(
          DESIGN_WIDTH * 0.5 + (Math.random() - 0.5) * 40,
          DESIGN_HEIGHT * 0.38, 1, burstColors, 35,
        );
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.render(ctx);

    const stage = session.evolutionStage;
    const stageIdx = this.stageIndex(stage);

    // Warm glow behind sprite — color and intensity scale with evolution
    const glowIntensity = 0.10 + stageIdx * 0.05;
    const glowColor = stageIdx >= 3 ? '55, 177, 226' : '240, 128, 48';
    const glowGrad = ctx.createRadialGradient(
      DESIGN_WIDTH * 0.5, DESIGN_HEIGHT * 0.48, 40,
      DESIGN_WIDTH * 0.5, DESIGN_HEIGHT * 0.48, 320 + stageIdx * 40,
    );
    glowGrad.addColorStop(0, `rgba(${glowColor}, ${glowIntensity * 1.5})`);
    glowGrad.addColorStop(0.6, `rgba(${glowColor}, ${glowIntensity * 0.4})`);
    glowGrad.addColorStop(1, `rgba(${glowColor}, 0)`);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Draw mountain/perch
    this.drawMountain(ctx);

    // Draw evolution sprite centered
    const spriteScale = 5 + stageIdx;
    this.sprite.render(ctx, DESIGN_WIDTH * 0.5, DESIGN_HEIGHT * 0.48, spriteScale);

    this.particles.render(ctx);

    // Title
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = stageIdx >= 3 ? 'rgba(55, 177, 226, 0.6)' : 'rgba(240, 128, 48, 0.6)';
    ctx.shadowBlur = 20;
    ctx.fillText('MEGA CHARIZARD ACADEMY', DESIGN_WIDTH / 2, 100);
    ctx.restore();

    // Evolution stage name
    ctx.save();
    ctx.fillStyle = stageIdx >= 3 ? '#91CCEC' : '#FFD700';
    ctx.font = 'bold 42px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(STAGE_NAMES[stage], DESIGN_WIDTH / 2, 155);
    ctx.restore();

    // Evolution meter bar
    this.drawEvolutionMeter(ctx);

    // Session progress
    ctx.save();
    ctx.fillStyle = '#8888aa';
    ctx.font = '22px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Game ${session.gamesCompleted + 1} of 4  |  Session ${settings.sessionsToday + 1} of 4`,
      DESIGN_WIDTH - 40, DESIGN_HEIGHT - 30,
    );
    ctx.restore();

    // "Start Training!" button (or "blocked" message)
    if (this.blocked) {
      this.drawBlockedMessage(ctx);
    } else if (!this.justEvolvedTo && session.gamesCompleted < 4) {
      this.drawStartButton(ctx);
    }

    // Evolution flash overlay
    if (this.justEvolvedTo && this.evolveFlashAlpha > 0) {
      this.drawEvolutionFlash(ctx);
    }
  }

  exit(): void {
    this.particles.clear();
    this.voice = null;
  }

  handleClick(x: number, y: number): void {
    if (this.selectionPending || this.blocked || this.justEvolvedTo) return;
    if (session.gamesCompleted >= 4) return;

    // Check if click is on the "Start Training!" button
    if (x >= BTN_X && x <= BTN_X + BTN_W && y >= BTN_Y && y <= BTN_Y + BTN_H) {
      this.startNextGame();
    }
  }

  handleKey(_key: string): void {
    // Hotkeys handled centrally in GameCanvas
  }

  // ---------------------------------------------------------------------------
  // Start next game
  // ---------------------------------------------------------------------------

  private startNextGame(): void {
    if (this.selectionPending) return;
    this.selectionPending = true;

    this.audio?.playSynth('pop');

    // Particle burst at button
    this.particles.burst(DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2, 30, '#37B1E2', 150, 0.8);
    this.audio?.playSynth('roar');

    // Pick game with focus-area weighting
    const game = pickNextGame(session.gamesCompleted);
    session.currentGame = game;

    // Transition after delay
    setTimeout(() => {
      session.currentScreen = game;
      this.gameContext.screenManager.goTo(game);
    }, 800);
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------

  private updateSprite(): void {
    const key = session.evolutionStage === 'megax' ? 'charizard-megax' : session.evolutionStage;
    this.sprite = new SpriteAnimator(SPRITES[key]);
  }

  private stageIndex(stage: EvolutionStage): number {
    const order: EvolutionStage[] = ['charmander', 'charmeleon', 'charizard', 'megax'];
    return order.indexOf(stage);
  }

  private drawMountain(ctx: CanvasRenderingContext2D): void {
    const mx = DESIGN_WIDTH * 0.5;
    const baseY = DESIGN_HEIGHT * 0.85;
    const peakY = DESIGN_HEIGHT * 0.35;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(mx - 320, baseY);
    ctx.bezierCurveTo(mx - 250, baseY - 120, mx - 160, peakY + 80, mx - 40, peakY);
    ctx.bezierCurveTo(mx, peakY - 10, mx + 40, peakY, mx + 40, peakY);
    ctx.bezierCurveTo(mx + 160, peakY + 80, mx + 250, baseY - 120, mx + 320, baseY);
    ctx.closePath();

    const mtnGrad = ctx.createLinearGradient(mx, peakY, mx, baseY);
    mtnGrad.addColorStop(0, '#1a0f2e');
    mtnGrad.addColorStop(0.4, '#140a22');
    mtnGrad.addColorStop(1, '#0a0614');
    ctx.fillStyle = mtnGrad;
    ctx.fill();

    // Lava glow at peak
    const lavaGrad = ctx.createRadialGradient(mx, peakY + 30, 5, mx, peakY + 30, 60);
    lavaGrad.addColorStop(0, 'rgba(255, 100, 30, 0.3)');
    lavaGrad.addColorStop(1, 'rgba(255, 60, 10, 0)');
    ctx.fillStyle = lavaGrad;
    ctx.beginPath();
    ctx.arc(mx, peakY + 30, 60, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawEvolutionMeter(ctx: CanvasRenderingContext2D): void {
    const meterY = DESIGN_HEIGHT * 0.70;
    const meterW = 500;
    const meterH = 24;
    const meterX = DESIGN_WIDTH / 2 - meterW / 2;
    const pct = (session.evolutionMeter / session.evolutionMeterMax) * 100;
    const stage = session.evolutionStage;
    const stageIdx = this.stageIndex(stage);

    // Background bar
    ctx.save();
    ctx.fillStyle = 'rgba(20, 15, 40, 0.7)';
    ctx.beginPath();
    ctx.roundRect(meterX - 6, meterY - 6, meterW + 12, meterH + 12, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(55, 177, 226, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Filled portion
    const fillW = (pct / 100) * meterW;
    if (fillW > 0) {
      const fillGrad = ctx.createLinearGradient(meterX, meterY, meterX + fillW, meterY);
      fillGrad.addColorStop(0, '#FF6B35');
      fillGrad.addColorStop(0.33, '#FFD700');
      fillGrad.addColorStop(0.66, '#37B1E2');
      fillGrad.addColorStop(1, '#91CCEC');
      ctx.fillStyle = fillGrad;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, fillW, meterH, 10);
      ctx.fill();
    }

    // Threshold markers at 33%, 66%, 100%
    const thresholds = [33, 66, 100];
    const thresholdLabels = ['Charmeleon', 'Charizard', 'Mega X'];
    for (let i = 0; i < thresholds.length; i++) {
      const tx = meterX + (thresholds[i] / 100) * meterW;
      const passed = pct >= thresholds[i];

      ctx.strokeStyle = passed ? '#FFD700' : 'rgba(100, 90, 130, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, meterY - 4);
      ctx.lineTo(tx, meterY + meterH + 4);
      ctx.stroke();

      // Small label above
      ctx.fillStyle = passed ? '#FFD700' : '#666688';
      ctx.font = '14px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(thresholdLabels[i], tx, meterY - 14);
    }

    // "Evolution Meter" label
    ctx.fillStyle = '#aaaacc';
    ctx.font = 'bold 18px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EVOLUTION METER', DESIGN_WIDTH / 2, meterY + meterH + 28);

    ctx.restore();
  }

  private drawStartButton(ctx: CanvasRenderingContext2D): void {
    const pulse = 1 + 0.03 * Math.sin(this.time * 3);

    ctx.save();
    ctx.translate(DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-DESIGN_WIDTH / 2, -(BTN_Y + BTN_H / 2));

    // Button background
    const grad = ctx.createLinearGradient(BTN_X, BTN_Y, BTN_X, BTN_Y + BTN_H);
    grad.addColorStop(0, '#37B1E2');
    grad.addColorStop(1, '#1A5C8A');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(BTN_X, BTN_Y, BTN_W, BTN_H, 20);
    ctx.fill();

    // Button border glow
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#91CCEC';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Start Training!', DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2);

    ctx.restore();
  }

  private drawBlockedMessage(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';

    if (this.blocked!.reason === 'daily-limit') {
      ctx.fillStyle = '#91CCEC';
      ctx.font = 'bold 36px Fredoka, Nunito, sans-serif';
      ctx.fillText('See you tomorrow, trainers!', DESIGN_WIDTH / 2, BTN_Y + 20);
      ctx.fillStyle = '#8888aa';
      ctx.font = '24px Fredoka, Nunito, sans-serif';
      ctx.fillText('Charizard gave it everything today!', DESIGN_WIDTH / 2, BTN_Y + 60);
    } else if (this.blocked!.reason === 'cooldown') {
      const until = this.blocked!.waitUntil!;
      const d = new Date(until);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      ctx.fillStyle = '#91CCEC';
      ctx.font = 'bold 36px Fredoka, Nunito, sans-serif';
      ctx.fillText('Charizard is resting!', DESIGN_WIDTH / 2, BTN_Y + 20);
      ctx.fillStyle = '#8888aa';
      ctx.font = '24px Fredoka, Nunito, sans-serif';
      ctx.fillText(`Come back at ${timeStr}`, DESIGN_WIDTH / 2, BTN_Y + 60);
    }

    ctx.restore();
  }

  private drawEvolutionFlash(ctx: CanvasRenderingContext2D): void {
    if (!this.justEvolvedTo) return;

    const t = this.evolveAnimTime;

    // White flash
    if (t < 0.5) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = this.evolveFlashAlpha * 0.4;
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();
    }

    // "EVOLUTION!" text
    if (t < 2.5) {
      const textAlpha = t < 0.3 ? t / 0.3 : t > 2.0 ? (2.5 - t) / 0.5 : 1.0;
      ctx.save();
      ctx.globalAlpha = textAlpha;
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 72px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 30;
      ctx.fillText(`${STAGE_NAMES[this.justEvolvedTo]}!`, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.25);
      ctx.restore();
    }
  }
}
