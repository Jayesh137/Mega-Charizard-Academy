// src/engine/screens/finale.ts
// Enhanced victory finale with ClipManager integration.
// Plays finale clip, MCX sprite flies across, shows session summary with star review,
// achievement message, and styled "TRAIN AGAIN!" button.

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
import { tracker, type DomainSummary } from '../../state/tracker.svelte';
import { clipManager, evolutionManager } from './hub';
import { drawStar } from '../utils/draw-helpers';

// ---------------------------------------------------------------------------
// Evolution stage display names
// ---------------------------------------------------------------------------

const EVOLUTION_DISPLAY_NAMES: Record<string, string> = {
  charmander: 'Charmander',
  charmeleon: 'Charmeleon',
  charizard: 'Charizard',
  megax: 'Mega Charizard X',
};

// ---------------------------------------------------------------------------
// Rounded rect helper (fill + optional stroke)
// ---------------------------------------------------------------------------

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Button dimensions for "TRAIN AGAIN!"
// ---------------------------------------------------------------------------

const BTN_W = 400;
const BTN_H = 60;
const BTN_X = DESIGN_WIDTH / 2 - BTN_W / 2;
const BTN_Y = DESIGN_HEIGHT * 0.88;

// ---------------------------------------------------------------------------
// Summary panel dimensions
// ---------------------------------------------------------------------------

const PANEL_W = 900;
const PANEL_H = 480;
const PANEL_X = DESIGN_WIDTH / 2 - PANEL_W / 2;
const PANEL_Y = DESIGN_HEIGHT * 0.38;

// ---------------------------------------------------------------------------
// Achievement message thresholds
// ---------------------------------------------------------------------------

function getAchievementMessage(totalStars: number): string {
  if (totalStars > 30) return 'INCREDIBLE! You\'re the very best!';
  if (totalStars >= 16) return 'SUPER trainers in training!';
  if (totalStars >= 6) return 'Great training session!';
  return 'Keep training, young trainers!';
}

// ---------------------------------------------------------------------------
// Finale Screen
// ---------------------------------------------------------------------------

export class FinaleScreen implements GameScreen {
  private bg = new Background(60); // many stars for celebratory feel
  private particles = new ParticlePool();
  private mcxSprite = new SpriteAnimator(SPRITES['charizard-megax']);
  private elapsed = 0;
  private spriteX = -300; // start offscreen left
  private showPlayAgain = false;
  private showSummary = false;
  private gameContext!: GameContext;
  private voice: VoiceSystem | null = null;

  // Snapshot session stats on enter (before any reset)
  private owenStars = 0;
  private kianStars = 0;
  private gamesPlayed = 0;
  private evolutionStageName = '';
  private sessionMinutes = 0;
  private owenAccuracy = 0;
  private kianAccuracy = 0;
  private skillsList: string[] = [];
  private conceptsMastered: string[] = [];
  private conceptsToReview: string[] = [];
  private owenDomains: DomainSummary[] = [];
  private kianDomains: DomainSummary[] = [];
  private homeSuggestions: string[] = [];

  // Star pop-in animation tracking
  private starPopTimers: { owen: number; kian: number } = { owen: 0, kian: 0 };
  private summaryFadeStart = 3.0; // when summary panel begins to fade in

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
    this.showSummary = false;
    setActivePool(this.particles);
    this.particles.clear();

    // Snapshot session stats
    this.owenStars = session.owenStars;
    this.kianStars = session.kianStars;
    this.gamesPlayed = session.gamesCompleted;
    this.evolutionStageName =
      EVOLUTION_DISPLAY_NAMES[session.evolutionStage] || 'Charmander';

    // Snapshot learning report data
    this.sessionMinutes = session.sessionDurationMinutes;
    this.owenAccuracy = session.owenAccuracy;
    this.kianAccuracy = session.kianAccuracy;
    this.skillsList = Object.keys(session.skillsPracticed);
    // Collect mastered/struggled concepts across all domains
    const mastered: string[] = [];
    const struggled: string[] = [];
    for (const [, val] of Object.entries(session.conceptsCorrect)) {
      mastered.push(...val.owen, ...val.kian);
    }
    for (const [, val] of Object.entries(session.conceptsStruggled)) {
      struggled.push(...val.owen, ...val.kian);
    }
    this.conceptsMastered = [...new Set(mastered)].slice(0, 6);
    this.conceptsToReview = [...new Set(struggled)].slice(0, 4);

    // Capture domain-level summaries from enhanced tracker
    this.owenDomains = tracker.getDomainSummaries('owen');
    this.kianDomains = tracker.getDomainSummaries('kian');

    // Generate home practice suggestions based on ZPD
    this.homeSuggestions = this.generateHomeSuggestions();

    // Persist session data to settings for longitudinal tracking
    tracker.persistToSettings();
    settings.addSessionHistory({
      date: new Date().toISOString(),
      durationMinutes: this.sessionMinutes,
      owenAccuracy: this.owenAccuracy,
      kianAccuracy: this.kianAccuracy,
      gamesPlayed: this.skillsList,
      owenStars: this.owenStars,
      kianStars: this.kianStars,
      skillsPracticed: this.skillsList,
    });

    // Reset star pop timers
    this.starPopTimers = { owen: 0, kian: 0 };

    // Play finale clip from ClipManager
    const finaleClip = clipManager.pick('finale');
    if (finaleClip) {
      ctx.events.emit({ type: 'play-video', src: finaleClip.src });
    }

    // Cache VoiceSystem — only create once
    if (ctx.audio && !this.voice) {
      this.voice = new VoiceSystem(ctx.audio);
    }

    // Start ambient music
    ctx.audio?.startMusic();

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

    // Show summary panel at 3s
    if (this.elapsed > this.summaryFadeStart) {
      this.showSummary = true;
    }

    // Show "TRAIN AGAIN!" button after 6s
    if (this.elapsed > 6) {
      this.showPlayAgain = true;
    }

    // Star pop-in particle bursts (triggered once per star, up to 10 visual)
    if (this.showSummary) {
      const summaryElapsed = this.elapsed - this.summaryFadeStart;
      const popInterval = 0.25; // seconds between each star pop
      const owenVisual = Math.min(this.owenStars, 5);
      const kianVisual = Math.min(this.kianStars, 5);

      // Owen stars pop-in bursts
      const prevOwenPops = this.starPopTimers.owen;
      const currOwenPops = Math.min(
        Math.floor((summaryElapsed - 0.5) / popInterval),
        owenVisual,
      );
      if (currOwenPops > prevOwenPops && currOwenPops > 0) {
        this.starPopTimers.owen = currOwenPops;
        // Gold burst at the star position
        const starBaseX = PANEL_X + PANEL_W * 0.25 - ((owenVisual - 1) * 30) / 2;
        const burstSX = starBaseX + (currOwenPops - 1) * 30;
        this.particles.burst(burstSX, PANEL_Y + 180, 8, '#FFD700', 40, 0.6);
      }

      // Kian stars pop-in bursts
      const prevKianPops = this.starPopTimers.kian;
      const currKianPops = Math.min(
        Math.floor((summaryElapsed - 0.5) / popInterval),
        kianVisual,
      );
      if (currKianPops > prevKianPops && currKianPops > 0) {
        this.starPopTimers.kian = currKianPops;
        const starBaseX = PANEL_X + PANEL_W * 0.75 - ((kianVisual - 1) * 30) / 2;
        const burstSX = starBaseX + (currKianPops - 1) * 30;
        this.particles.burst(burstSX, PANEL_Y + 180, 8, '#FFD700', 40, 0.6);
      }
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
    ctx.fillText('AMAZING TRAINING!', DESIGN_WIDTH / 2 + 3, DESIGN_HEIGHT * 0.08 + 3);

    // Title
    ctx.fillStyle = theme.palette.ui.bannerGold;
    ctx.fillText('AMAZING TRAINING!', DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.08);

    // "You're the best!" with trainer names
    const littleName = settings.littleTrainerName;
    const bigName = settings.bigTrainerName;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 34px Fredoka, Nunito, sans-serif';
    ctx.fillText(
      `${littleName} & ${bigName} — You're the best!`,
      DESIGN_WIDTH / 2,
      DESIGN_HEIGHT * 0.15,
    );
    ctx.restore();

    // --- Evolution stage showcase (compact, below title) ---
    this.drawEvolutionShowcase(ctx);

    // --- Session Summary Panel ---
    if (this.showSummary) {
      this.drawSummaryPanel(ctx);
    }

    // --- "TRAIN AGAIN!" styled button ---
    if (this.showPlayAgain) {
      this.drawTrainAgainButton(ctx);
    }
  }

  exit(): void {
    this.particles.clear();
    this.voice = null;
  }

  handleClick(x: number, y: number): void {
    if (this.showPlayAgain) {
      // Check if click is on the "TRAIN AGAIN!" button
      if (x >= BTN_X && x <= BTN_X + BTN_W && y >= BTN_Y && y <= BTN_Y + BTN_H) {
        this.gameContext.audio?.playSynth('button-press');
        session.reset();
        evolutionManager.reset();
        clipManager.reset();
        this.gameContext.screenManager.goTo('hub');
      }
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
  // Evolution stage showcase — compact row above the summary panel
  // ---------------------------------------------------------------------------

  private drawEvolutionShowcase(ctx: CanvasRenderingContext2D): void {
    const y = DESIGN_HEIGHT * 0.30;
    const spacing = DESIGN_WIDTH / 5;
    const scales = [3, 3.5, 4, 4.5];

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
        ctx.font = 'bold 30px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u2192', (x + spacing * i) / 2, y);
      }

      // Sprite
      this.stageSprites[i].render(ctx, x, y - 10, scales[i]);

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.stageNames[i], x, y + 40);

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Session Summary Panel
  // ---------------------------------------------------------------------------

  private drawSummaryPanel(ctx: CanvasRenderingContext2D): void {
    const summaryElapsed = this.elapsed - this.summaryFadeStart;
    const panelAlpha = Math.min(summaryElapsed / 0.8, 1); // fade in over 0.8s

    ctx.save();
    ctx.globalAlpha = panelAlpha;

    // Semi-transparent dark panel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    fillRoundedRect(ctx, PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);

    // Subtle border
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 20);
    ctx.stroke();

    // "SESSION SUMMARY" header
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.fillText('SESSION SUMMARY', DESIGN_WIDTH / 2, PANEL_Y + 18);
    ctx.shadowBlur = 0;

    // Divider line below header
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + 40, PANEL_Y + 65);
    ctx.lineTo(PANEL_X + PANEL_W - 40, PANEL_Y + 65);
    ctx.stroke();

    // --- Two columns: Owen (left) and Kian (right) ---
    const littleName = settings.littleTrainerName;
    const bigName = settings.bigTrainerName;
    const leftCenterX = PANEL_X + PANEL_W * 0.25;
    const rightCenterX = PANEL_X + PANEL_W * 0.75;

    // Vertical divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + PANEL_W / 2, PANEL_Y + 75);
    ctx.lineTo(PANEL_X + PANEL_W / 2, PANEL_Y + 280);
    ctx.stroke();

    // Owen's section
    this.drawTrainerSection(ctx, littleName, this.owenStars, leftCenterX, summaryElapsed);

    // Kian's section
    this.drawTrainerSection(ctx, bigName, this.kianStars, rightCenterX, summaryElapsed);

    // --- Games Played + Duration row ---
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '24px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const durationText = this.sessionMinutes > 0 ? ` (${this.sessionMinutes} min)` : '';
    ctx.fillText(`Games Played: ${this.gamesPlayed}${durationText}`, DESIGN_WIDTH / 2, PANEL_Y + 230);

    // --- Domain accuracy bars (Owen) ---
    let barY = PANEL_Y + 248;
    this.drawDomainBars(ctx, this.owenDomains, this.owenAccuracy, littleName, leftCenterX, barY);

    // --- Domain accuracy bars (Kian) ---
    this.drawDomainBars(ctx, this.kianDomains, this.kianAccuracy, bigName, rightCenterX, barY);

    // --- Evolution stage row ---
    ctx.fillStyle = '#91CCEC';
    ctx.font = 'bold 22px Fredoka, Nunito, sans-serif';
    ctx.fillText(`Evolution: ${this.evolutionStageName}!`, DESIGN_WIDTH / 2, PANEL_Y + 340);

    // --- Home suggestions ---
    if (this.homeSuggestions.length > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '16px Fredoka, Nunito, sans-serif';
      ctx.fillText('Practice at Home:', DESIGN_WIDTH / 2, PANEL_Y + 368);
      ctx.fillStyle = '#FFB347';
      ctx.font = '15px Fredoka, Nunito, sans-serif';
      const sugText = this.homeSuggestions.slice(0, 2).join('  •  ');
      ctx.fillText(sugText, DESIGN_WIDTH / 2, PANEL_Y + 388);
    }

    // --- Achievement message ---
    const totalStars = this.owenStars + this.kianStars;
    const message = getAchievementMessage(totalStars);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px Fredoka, Nunito, sans-serif';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.3)';
    ctx.shadowBlur = 8;
    ctx.fillText(`"${message}"`, DESIGN_WIDTH / 2, PANEL_Y + 420);
    ctx.shadowBlur = 0;

    // --- AAP-aligned time note ---
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '13px Fredoka, Nunito, sans-serif';
    const aapNote = this.sessionMinutes <= 15
      ? `${this.sessionMinutes}min session — within AAP guidelines`
      : `${this.sessionMinutes}min session — consider shorter next time (AAP: <15min/session)`;
    ctx.fillText(aapNote, DESIGN_WIDTH / 2, PANEL_Y + 450);

    // --- Research citation ---
    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.font = '12px Fredoka, Nunito, sans-serif';
    ctx.fillText('Adaptive difficulty via Zone of Proximal Development (Vygotsky)', DESIGN_WIDTH / 2, PANEL_Y + 468);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Draw a single trainer's section in the summary panel
  // ---------------------------------------------------------------------------

  private drawTrainerSection(
    ctx: CanvasRenderingContext2D,
    name: string,
    starCount: number,
    centerX: number,
    summaryElapsed: number,
  ): void {
    // Name
    ctx.fillStyle = '#CCCCDD';
    ctx.font = 'bold 28px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, centerX, PANEL_Y + 78);

    // Star count number (large)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 42px Fredoka, Nunito, sans-serif';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fillText(String(starCount), centerX, PANEL_Y + 112);
    ctx.shadowBlur = 0;

    // "Stars" label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '20px Fredoka, Nunito, sans-serif';
    ctx.fillText('Stars', centerX, PANEL_Y + 158);

    // Star icons — pop in one by one, max 5 visible, then "+ N more"
    const visualMax = 5;
    const visibleStars = Math.min(starCount, visualMax);
    const popInterval = 0.25;
    const starsToShow = Math.min(
      Math.floor((summaryElapsed - 0.5) / popInterval),
      visibleStars,
    );

    if (starsToShow > 0) {
      const starRowY = PANEL_Y + 194;
      const starSpacing = 30;
      const starRowStartX = centerX - ((visibleStars - 1) * starSpacing) / 2;

      for (let i = 0; i < starsToShow; i++) {
        const sx = starRowStartX + i * starSpacing;
        // Pop scale animation for the newest star
        const popAge = summaryElapsed - 0.5 - i * popInterval;
        const popScale = popAge < 0.15
          ? 1 + 0.4 * Math.sin((popAge / 0.15) * Math.PI)
          : 1;

        ctx.save();
        ctx.translate(sx, starRowY);
        ctx.scale(popScale, popScale);
        ctx.translate(-sx, -starRowY);

        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 6;
        drawStar(ctx, sx, starRowY, 12, '#FFD700');
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // "+ N more" text if more than 5 stars
      if (starCount > visualMax && starsToShow >= visualMax) {
        const moreX = starRowStartX + visibleStars * starSpacing + 10;
        ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
        ctx.font = 'bold 18px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${starCount - visualMax} more`, moreX, starRowY);
        ctx.textAlign = 'center'; // reset
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Domain accuracy bars for a child
  // ---------------------------------------------------------------------------

  private drawDomainBars(
    ctx: CanvasRenderingContext2D,
    domains: DomainSummary[],
    overallAccuracy: number,
    name: string,
    centerX: number,
    startY: number,
  ): void {
    const barW = 140;
    const barH = 12;

    // Overall accuracy
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '18px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${name}: ${overallAccuracy}%`, centerX, startY - 8);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    fillRoundedRect(ctx, centerX - barW / 2, startY + 4, barW, barH, 6);
    ctx.fillStyle = overallAccuracy >= 70 ? '#33CC33' : overallAccuracy >= 40 ? '#FFD700' : '#FF6B6B';
    fillRoundedRect(ctx, centerX - barW / 2, startY + 4, barW * Math.min(overallAccuracy / 100, 1), barH, 6);

    // Domain mini-bars
    if (domains.length > 0) {
      const miniBarW = 80;
      const miniBarH = 8;
      let dy = startY + 24;
      const domainLabels: Record<string, string> = { color: 'Colors', number: 'Maths', letter: 'Letters', shape: 'Shapes' };

      for (const d of domains.slice(0, 4)) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '13px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(domainLabels[d.domain] || d.domain, centerX - miniBarW / 2 - 4, dy + 4);

        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        fillRoundedRect(ctx, centerX - miniBarW / 2 + 30, dy, miniBarW, miniBarH, 4);

        const barColor = d.zpd === 'too-easy' ? '#37B1E2' : d.zpd === 'too-hard' ? '#FF6B6B' : '#33CC33';
        ctx.fillStyle = barColor;
        fillRoundedRect(ctx, centerX - miniBarW / 2 + 30, dy, miniBarW * Math.min(d.accuracy / 100, 1), miniBarH, 4);

        dy += 16;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Generate home practice suggestions based on domain performance
  // ---------------------------------------------------------------------------

  private generateHomeSuggestions(): string[] {
    const suggestions: string[] = [];
    const allDomains = [...this.owenDomains, ...this.kianDomains];

    const struggling = allDomains.filter(d => d.zpd === 'too-hard' || d.accuracy < 50);
    const inZpd = allDomains.filter(d => d.zpd === 'zpd' && d.accuracy < 70);

    for (const d of struggling) {
      if (d.domain === 'color') suggestions.push('Point out colors during walks and meals');
      if (d.domain === 'number') suggestions.push('Count objects together at home (toys, steps, snacks)');
      if (d.domain === 'letter') suggestions.push('Read together and point out letters on signs');
      if (d.domain === 'shape') suggestions.push('Find shapes around the house (clock=circle, door=rectangle)');
    }
    for (const d of inZpd) {
      if (d.domain === 'number' && !suggestions.some(s => s.includes('Count'))) {
        suggestions.push('Practice finger counting during play time');
      }
    }

    if (suggestions.length === 0) suggestions.push('Great progress! Keep playing and exploring together');
    return [...new Set(suggestions)];
  }

  // ---------------------------------------------------------------------------
  // Styled "TRAIN AGAIN!" button with breathing glow
  // ---------------------------------------------------------------------------

  private drawTrainAgainButton(ctx: CanvasRenderingContext2D): void {
    const buttonElapsed = this.elapsed - 6;
    const fadeIn = Math.min(buttonElapsed / 0.5, 1);
    const pulse = 1 + 0.03 * Math.sin(this.elapsed * 3);
    const glowIntensity = 0.3 + 0.2 * Math.sin(this.elapsed * 3);

    ctx.save();
    ctx.globalAlpha = fadeIn;

    // Pulse scale
    ctx.translate(DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-DESIGN_WIDTH / 2, -(BTN_Y + BTN_H / 2));

    // Pulsing cyan glow behind button
    ctx.shadowColor = '#37B1E2';
    ctx.shadowBlur = 15 + 10 * Math.sin(this.elapsed * 3);

    // Button background
    const grad = ctx.createLinearGradient(BTN_X, BTN_Y, BTN_X, BTN_Y + BTN_H);
    grad.addColorStop(0, '#37B1E2');
    grad.addColorStop(1, '#1A5C8A');
    ctx.fillStyle = grad;
    ctx.globalAlpha = fadeIn * (glowIntensity > 0.4 ? 1.0 : 0.95);
    ctx.beginPath();
    ctx.roundRect(BTN_X, BTN_Y, BTN_W, BTN_H, 16);
    ctx.fill();

    // Button border glow
    ctx.globalAlpha = fadeIn;
    ctx.strokeStyle = '#91CCEC';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Button text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TRAIN AGAIN!', DESIGN_WIDTH / 2, BTN_Y + BTN_H / 2);

    ctx.restore();
  }
}
