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
import { pickNextGame, resetFocusWeights } from '../systems/focus-weight';
import { HintLadder } from '../systems/hint-ladder';
import { drawStar } from '../utils/draw-helpers';

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
// Game card data for hub display
// ---------------------------------------------------------------------------

interface GameCard {
  name: string;
  subtitle: string;
  icon: 'flame' | 'gem' | 'star' | 'triangle' | 'pokeball';
  color: string;
  key: string;
}

const GAME_CARDS: GameCard[] = [
  {
    name: 'Fireball Math',
    subtitle: 'Counting & Addition',
    icon: 'flame',
    color: '#FF6B35',
    key: 'fireball-count',
  },
  {
    name: 'Color Lab',
    subtitle: 'Colors & Patterns',
    icon: 'gem',
    color: '#9933FF',
    key: 'flame-colors',
  },
  {
    name: 'Phonics Arena',
    subtitle: 'Letters & Reading',
    icon: 'star',
    color: '#37B1E2',
    key: 'phonics-arena',
  },
  {
    name: 'Evolution Tower',
    subtitle: 'Shapes & Patterns',
    icon: 'triangle',
    color: '#33CC33',
    key: 'evolution-tower',
  },
  {
    name: 'Evo Challenge',
    subtitle: 'Sequences & Memory',
    icon: 'pokeball',
    color: '#FF4444',
    key: 'evolution-challenge',
  },
];

// Card layout constants
const CARD_W = 200;
const CARD_H = 160;
const CARD_GAP = 24;
const CARD_ROW_Y = DESIGN_HEIGHT * 0.60;
const CARD_RADIUS = 12;

// ---------------------------------------------------------------------------
// Icon drawing helpers for game cards
// ---------------------------------------------------------------------------

function drawCardIconFlame(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  const grad = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
  grad.addColorStop(0, '#FFD700');
  grad.addColorStop(0.5, '#FF6B35');
  grad.addColorStop(1, '#FF4500');
  ctx.fillStyle = grad;
  ctx.beginPath();
  // Teardrop flame shape
  ctx.moveTo(cx, cy - size);
  ctx.bezierCurveTo(cx + size * 0.8, cy - size * 0.3, cx + size * 0.7, cy + size * 0.5, cx, cy + size);
  ctx.bezierCurveTo(cx - size * 0.7, cy + size * 0.5, cx - size * 0.8, cy - size * 0.3, cx, cy - size);
  ctx.fill();
  // Inner bright core
  const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4);
  innerGrad.addColorStop(0, 'rgba(255, 255, 200, 0.6)');
  innerGrad.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.1, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCardIconGem(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  const grad = ctx.createLinearGradient(cx - size, cy, cx + size, cy);
  grad.addColorStop(0, '#7722CC');
  grad.addColorStop(0.5, '#CC66FF');
  grad.addColorStop(1, '#9933FF');
  ctx.fillStyle = grad;
  ctx.beginPath();
  // Diamond / rhombus
  ctx.moveTo(cx, cy - size);       // top
  ctx.lineTo(cx + size * 0.7, cy); // right
  ctx.lineTo(cx, cy + size);       // bottom
  ctx.lineTo(cx - size * 0.7, cy); // left
  ctx.closePath();
  ctx.fill();
  // Highlight facet
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.7, cy);
  ctx.lineTo(cx, cy - size * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCardIconStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
  grad.addColorStop(0, '#E0F7FF');
  grad.addColorStop(1, '#37B1E2');
  ctx.fillStyle = grad;
  // Re-use the existing drawStar helper
  const innerRadius = size * 0.4;
  const points = 5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? size : innerRadius;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCardIconTriangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  const grad = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
  grad.addColorStop(0, '#66EE66');
  grad.addColorStop(1, '#33CC33');
  ctx.fillStyle = grad;
  ctx.beginPath();
  // Equilateral triangle
  const h = size * Math.sqrt(3) / 2;
  ctx.moveTo(cx, cy - h * 0.7);                        // top
  ctx.lineTo(cx + size * 0.85, cy + h * 0.6);          // bottom-right
  ctx.lineTo(cx - size * 0.85, cy + h * 0.6);          // bottom-left
  ctx.closePath();
  ctx.fill();
  // Inner highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.7);
  ctx.lineTo(cx + size * 0.42, cy);
  ctx.lineTo(cx - size * 0.42, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCardIconPokeball(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  // Top half (red)
  ctx.fillStyle = '#FF4444';
  ctx.beginPath();
  ctx.arc(cx, cy, size, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  // Bottom half (white)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  // Horizontal band
  ctx.fillStyle = '#222222';
  ctx.fillRect(cx - size, cy - size * 0.1, size * 2, size * 0.2);
  // Center circle (outer)
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
  // Center circle (inner)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Outer ring
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Convert hex color like '#FF6B35' to '255, 107, 53' for rgba() strings */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

const CARD_ICON_DRAWERS: Record<GameCard['icon'], (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => void> = {
  flame: drawCardIconFlame,
  gem: drawCardIconGem,
  star: drawCardIconStar,
  triangle: drawCardIconTriangle,
  pokeball: drawCardIconPokeball,
};

// ---------------------------------------------------------------------------
// Hub Screen
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Star milestone thresholds
// ---------------------------------------------------------------------------

const STAR_MILESTONES: { threshold: number; label: string }[] = [
  { threshold: 5,  label: 'Super Trainer!' },
  { threshold: 10, label: 'Mega Trainer!' },
  { threshold: 20, label: 'Champion!' },
  { threshold: 50, label: 'Pokémon Master!' },
];

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
  private timeouts: number[] = [];

  // Button press state
  private buttonPressScale = 1.0;

  // Star display state
  private prevOwenStars = 0;
  private prevKianStars = 0;
  private owenStarPulse = 0;   // pulse animation timer (0 = idle)
  private kianStarPulse = 0;
  private milestoneText = '';
  private milestoneTimer = 0;  // counts up; visible for 2s

  // Track which specific games have been played this session
  private gamesPlayedThisSession = new Set<string>();

  private get audio() { return this.gameContext.audio; }

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.time = 0;
    this.selectionPending = false;
    this.justEvolvedTo = null;
    this.evolveAnimTime = 0;
    this.evolveFlashAlpha = 0;
    this.wingFlutterTimer = 0;
    this.blocked = null;
    this.milestoneText = '';
    this.milestoneTimer = 0;
    this.prevOwenStars = session.owenStars;
    this.prevKianStars = session.kianStars;
    this.owenStarPulse = 0;
    this.kianStarPulse = 0;
    // Reset all session-scoped systems at session start
    if (session.gamesCompleted === 0) {
      this.gamesPlayedThisSession.clear();
      clipManager.reset();
      resetFocusWeights();
      HintLadder.resetAnalytics();
    }

    // Cache VoiceSystem — only create once
    if (ctx.audio && !this.voice) {
      this.voice = new VoiceSystem(ctx.audio);
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

      // Announce limit/cooldown voice lines
      if (this.voice) {
        if (check.reason === 'daily-limit') {
          this.voice.playAshLine('daily_limit');
        } else if (check.reason === 'cooldown') {
          this.voice.playAshLine('timeout_start');
        }
      }
      return;
    }

    // Record gem collection from just-completed game (backward compat)
    if (session.currentGame && !session.gemsCollected.includes(session.currentGame)) {
      session.gemsCollected = [...session.gemsCollected, session.currentGame];
    }

    // Increment games completed when returning from a game
    if (session.currentGame) {
      this.gamesPlayedThisSession.add(session.currentGame);
      session.gamesCompleted++;

      // Check for evolution after game completion
      const evoEvent = evolutionManager.addCharge(0); // meter was already charged during game
      if (evoEvent) {
        this.justEvolvedTo = evoEvent.stage;
        this.evolveAnimTime = 0;
        this.evolveFlashAlpha = 1;
        this.updateSprite();

        // Play evolution clip
        const clip = clipManager.getEvolutionClip(evoEvent.stage);
        if (clip) {
          ctx.events.emit({ type: 'play-video', src: clip.src });
        }

        // Ash evolution line
        if (this.voice) {
          if (evoEvent.stage === 'charmeleon') this.voice.playAshLine('evolution');
          else if (evoEvent.stage === 'charizard') this.voice.ash('evo-charizard');
          else if (evoEvent.stage === 'megax') this.voice.ash('evo-mega');
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

    // Start ambient music
    this.audio?.startMusic();

    // Welcome voice
    if (this.voice) {
      if (session.gamesCompleted === 0) {
        this.voice.playAshLine('iconic');
      } else {
        this.voice.playAshLine('encourage');
      }
    }

    // Session progress announcements
    if (this.voice) {
      if (session.gamesCompleted === 2) {
        this.voice.playAshLine('halfway');
      } else if (session.gamesCompleted === 3) {
        this.voice.playAshLine('almost_done');
      }
    }

    // Check for finale — all 4 games completed
    if (session.gamesCompleted >= 4) {
      // Announce session end
      this.voice?.playAshLine('session_end');
      sessionLimiter.recordSessionEnd();
      this.delay(() => ctx.screenManager.goTo('finale'), 2000);
      return;
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.bg.update(dt);
    this.sprite.update(dt);
    this.particles.update(dt);

    // Squash/stretch on button — spring back to 1.0
    if (this.buttonPressScale < 1.0) {
      this.buttonPressScale = Math.min(1.0, this.buttonPressScale + dt * 4);
    }

    // Evolution flash animation
    if (this.justEvolvedTo) {
      this.evolveAnimTime += dt;
      this.evolveFlashAlpha = Math.max(0, 1 - this.evolveAnimTime / 1.5);
      if (this.evolveAnimTime > 3.0) {
        this.justEvolvedTo = null;
      }
    }

    // Star pulse animations (decay toward 0)
    if (this.owenStarPulse > 0) this.owenStarPulse = Math.max(0, this.owenStarPulse - dt);
    if (this.kianStarPulse > 0) this.kianStarPulse = Math.max(0, this.kianStarPulse - dt);

    // Detect star count changes and trigger pulse + milestone check
    if (session.owenStars !== this.prevOwenStars) {
      this.owenStarPulse = 0.4;
      this.audio?.playSynth('star-collect');
      this.checkMilestone(session.owenStars, this.prevOwenStars, 'Owen');
      this.prevOwenStars = session.owenStars;
    }
    if (session.kianStars !== this.prevKianStars) {
      this.kianStarPulse = 0.4;
      this.audio?.playSynth('star-collect');
      this.checkMilestone(session.kianStars, this.prevKianStars, 'Kian');
      this.prevKianStars = session.kianStars;
    }

    // Milestone text timer
    if (this.milestoneTimer > 0) {
      this.milestoneTimer = Math.max(0, this.milestoneTimer - dt);
    }

    // Check if cooldown has expired (timeout_end)
    if (this.blocked && this.blocked.reason === 'cooldown' && this.blocked.waitUntil && Date.now() >= this.blocked.waitUntil) {
      this.blocked = null;
      this.voice?.playAshLine('timeout_end');
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

    // Star counters (top-left Owen, top-right Kian)
    this.drawStarCounter(ctx, 'Owen', session.owenStars, 60, 190, this.owenStarPulse);
    this.drawStarCounter(ctx, 'Kian', session.kianStars, DESIGN_WIDTH - 60, 190, this.kianStarPulse);

    // Lifetime stars (smaller, below session stars)
    ctx.save();
    ctx.font = '20px Fredoka, Nunito, sans-serif';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.textAlign = 'left';
    ctx.fillText(`Lifetime: ${session.owenLifetimeStars}`, 60, 260);
    ctx.textAlign = 'right';
    ctx.fillText(`Lifetime: ${session.kianLifetimeStars}`, DESIGN_WIDTH - 60, 260);
    ctx.restore();

    // Milestone celebration text (center)
    if (this.milestoneTimer > 0 && this.milestoneText) {
      this.drawMilestoneText(ctx);
    }

    // Evolution meter bar
    this.drawEvolutionMeter(ctx);

    // Game cards (visual info tiles)
    this.drawGameCards(ctx);

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

    // Session progress indicator (4 circles at bottom center)
    this.drawSessionProgress(ctx);

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
    this.audio?.stopMusic();
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    this.particles.clear();
    this.voice = null;
  }

  private delay(fn: () => void, ms: number): void {
    this.timeouts.push(window.setTimeout(fn, ms) as unknown as number);
  }

  handleClick(x: number, y: number): void {
    if (this.selectionPending || this.blocked || this.justEvolvedTo) return;
    if (session.gamesCompleted >= 4) return;

    // Check if click is on the "Start Training!" button
    if (x >= BTN_X && x <= BTN_X + BTN_W && y >= BTN_Y && y <= BTN_Y + BTN_H) {
      this.buttonPressScale = 0.9; // Squash on press
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

    this.audio?.playSynth('button-press');
    this.audio?.playSynth('pop');

    // Particle burst at button
    this.particles.burst(DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2, 30, '#37B1E2', 150, 0.8);
    this.audio?.playSynth('roar');

    // Pick game with focus-area weighting
    const game = pickNextGame(session.gamesCompleted);
    session.currentGame = game;

    // Transition after delay
    this.delay(() => {
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

  private drawGameCards(ctx: CanvasRenderingContext2D): void {
    const totalW = GAME_CARDS.length * CARD_W + (GAME_CARDS.length - 1) * CARD_GAP;
    const startX = DESIGN_WIDTH / 2 - totalW / 2;

    ctx.save();

    for (let i = 0; i < GAME_CARDS.length; i++) {
      const card = GAME_CARDS[i];
      const cardX = startX + i * (CARD_W + CARD_GAP);
      // Gentle bobbing animation — each card has a phase offset
      const bob = Math.sin(this.time * 1.8 + i * 1.25) * 4;
      const cardY = CARD_ROW_Y - CARD_H / 2 + bob;
      const played = this.gamesPlayedThisSession.has(card.key);

      // Card background: dark semi-transparent with colored border
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, CARD_W, CARD_H, CARD_RADIUS);

      // Fill
      ctx.fillStyle = 'rgba(12, 8, 24, 0.75)';
      ctx.fill();

      // Colored border
      ctx.strokeStyle = played ? 'rgba(100, 255, 100, 0.5)' : card.color;
      ctx.lineWidth = played ? 2.5 : 2;
      ctx.stroke();

      // Subtle inner glow along top
      const innerGlow = ctx.createLinearGradient(cardX, cardY, cardX, cardY + CARD_H * 0.5);
      innerGlow.addColorStop(0, `rgba(${hexToRgb(card.color)}, 0.10)`);
      innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, CARD_W, CARD_H * 0.5, [CARD_RADIUS, CARD_RADIUS, 0, 0]);
      ctx.fill();

      ctx.restore();

      // --- Icon area: top half of card ---
      const iconCx = cardX + CARD_W / 2;
      const iconCy = cardY + CARD_H * 0.35;
      const iconSize = 24;

      CARD_ICON_DRAWERS[card.icon](ctx, iconCx, iconCy, iconSize);

      // --- Game name ---
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(card.name, cardX + CARD_W / 2, cardY + CARD_H * 0.64);
      ctx.restore();

      // --- Subtitle ---
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '14px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(card.subtitle, cardX + CARD_W / 2, cardY + CARD_H * 0.80);
      ctx.restore();

      // --- Played checkmark (top-right corner) ---
      if (played) {
        const checkX = cardX + CARD_W - 20;
        const checkY = cardY + 16;
        ctx.save();
        ctx.strokeStyle = '#66FF66';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(checkX - 7, checkY);
        ctx.lineTo(checkX - 2, checkY + 6);
        ctx.lineTo(checkX + 7, checkY - 5);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private drawStartButton(ctx: CanvasRenderingContext2D): void {
    const pulse = 1 + 0.03 * Math.sin(this.time * 3);
    const glowIntensity = 0.3 + 0.2 * Math.sin(this.time * 3);

    ctx.save();
    ctx.translate(DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-DESIGN_WIDTH / 2, -(BTN_Y + BTN_H / 2));

    // Pulsing cyan glow behind button
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 15 + 10 * Math.sin(this.time * 3);

    // Button background
    const grad = ctx.createLinearGradient(BTN_X, BTN_Y, BTN_X, BTN_Y + BTN_H);
    grad.addColorStop(0, '#37B1E2');
    grad.addColorStop(1, '#1A5C8A');
    ctx.fillStyle = grad;
    ctx.globalAlpha = glowIntensity > 0.4 ? 1.0 : 0.95;
    ctx.beginPath();
    ctx.roundRect(BTN_X, BTN_Y, BTN_W, BTN_H, 20);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Button border glow
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

  private drawSessionProgress(ctx: CanvasRenderingContext2D): void {
    const totalGames = 4;
    const circleRadius = 12;
    const spacing = 80;
    const baseY = DESIGN_HEIGHT - 80;
    const startX = DESIGN_WIDTH / 2 - ((totalGames - 1) * spacing) / 2;
    const completed = session.gamesCompleted;
    const currentIdx = completed; // 0-based index of the next game to play

    ctx.save();

    for (let i = 0; i < totalGames; i++) {
      const cx = startX + i * spacing;
      const isCompleted = i < completed;
      const isCurrent = i === currentIdx && completed < totalGames;

      // Pulsing ring for current game
      if (isCurrent) {
        const pulseScale = 1 + 0.2 * Math.sin(this.time * 4);
        const pulseAlpha = 0.4 + 0.3 * Math.sin(this.time * 4);
        ctx.beginPath();
        ctx.arc(cx, baseY, circleRadius * pulseScale + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(55, 177, 226, ${pulseAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      if (isCompleted) {
        // Filled circle with cyan glow
        ctx.shadowColor = '#37B1E2';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#37B1E2';
        ctx.beginPath();
        ctx.arc(cx, baseY, circleRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // White checkmark-like inner dot
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx, baseY, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Empty circle outline
        ctx.fillStyle = 'rgba(20, 15, 40, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, baseY, circleRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = isCurrent ? '#37B1E2' : 'rgba(100, 90, 130, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, baseY, circleRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Label underneath
      ctx.fillStyle = isCompleted ? '#91CCEC' : isCurrent ? '#AAAACC' : '#555566';
      ctx.font = '14px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Game ${i + 1}`, cx, baseY + circleRadius + 18);
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

  // ---------------------------------------------------------------------------
  // Star counter display
  // ---------------------------------------------------------------------------

  private drawStarCounter(
    ctx: CanvasRenderingContext2D,
    name: string,
    count: number,
    anchorX: number,
    anchorY: number,
    pulse: number,
  ): void {
    const isLeft = anchorX < DESIGN_WIDTH / 2;
    const textAlign = isLeft ? 'left' as const : 'right' as const;

    ctx.save();

    // Scale pulse when stars change (0.4 → 0)
    const pulseScale = 1 + 0.15 * Math.sin((pulse / 0.4) * Math.PI);

    // Name label
    ctx.fillStyle = '#CCCCDD';
    ctx.font = 'bold 36px Fredoka, Nunito, sans-serif';
    ctx.textAlign = textAlign;
    ctx.fillText(name, anchorX, anchorY);

    // Star icon + count — positioned below the name
    const starY = anchorY + 40;
    const starIconX = isLeft ? anchorX + 18 : anchorX - 18;

    // Gold glow behind star icon
    ctx.save();
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 12;
    ctx.translate(starIconX, starY);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-starIconX, -starY);
    drawStar(ctx, starIconX, starY, 18, '#FFD700');
    ctx.restore();

    // Count number
    const countX = isLeft ? starIconX + 32 : starIconX - 32;
    ctx.save();
    ctx.translate(countX, starY);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-countX, -starY);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 48px Fredoka, Nunito, sans-serif';
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fillText(String(count), countX, starY);
    ctx.restore();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Milestone celebration text (center of screen)
  // ---------------------------------------------------------------------------

  private drawMilestoneText(ctx: CanvasRenderingContext2D): void {
    // 2s total: 0.3s fade-in, hold, 0.3s fade-out
    const total = 2.0;
    const elapsed = total - this.milestoneTimer;
    let alpha: number;
    if (elapsed < 0.3) {
      alpha = elapsed / 0.3;
    } else if (this.milestoneTimer < 0.3) {
      alpha = this.milestoneTimer / 0.3;
    } else {
      alpha = 1.0;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 64px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 30;
    ctx.fillText(this.milestoneText, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.30);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Check for milestone crossing
  // ---------------------------------------------------------------------------

  private checkMilestone(newCount: number, oldCount: number, childName: string): void {
    for (const m of STAR_MILESTONES) {
      if (newCount >= m.threshold && oldCount < m.threshold) {
        this.milestoneText = `${childName}: ${m.label}`;
        this.milestoneTimer = 2.0;

        // Play victory fanfare for the milestone
        this.audio?.playSynth('victory-fanfare');

        // Play milestone-specific Ash voice line
        const voiceKey =
          m.threshold === 5  ? 'milestone_super' :
          m.threshold === 10 ? 'milestone_mega' :
          m.threshold === 20 ? 'milestone_champion' :
          m.threshold === 50 ? 'milestone_master' :
          null;
        if (voiceKey) {
          // Ensure VoiceSystem exists
          if (this.gameContext.audio && !this.voice) {
            this.voice = new VoiceSystem(this.gameContext.audio);
          }
          this.voice?.playAshLine(voiceKey);
        }

        break; // show only the first crossed milestone
      }
    }
  }
}
