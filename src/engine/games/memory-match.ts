// src/engine/games/memory-match.ts
// Mini-game 6: Memory Match — Working Memory Training
//
// Research: Working memory is the #1 predictor of academic success (Alloway 2009).
// Flipping cards and remembering locations strengthens visual-spatial working memory.
// Cross-game reinforcement: matching colors/shapes/numbers strengthens domain knowledge.
//
// Owen (2.5yo): 2x3 grid (6 cards, 3 pairs), colors content, large cards
// Kian (4yo):   3x4 grid (12 cards, 6 pairs), mixed content (colors, shapes, numbers)
//
// Systems: VoiceSystem, HintLadder, tracker, FlameMeter

import type { GameScreen, GameContext } from '../screen-manager';
import { Background } from '../entities/backgrounds';
import { ParticlePool, setActivePool } from '../entities/particles';
import { SpriteAnimator } from '../entities/sprite-animator';
import { SPRITES } from '../../config/sprites';
import { VoiceSystem } from '../voice';
import { HintLadder } from '../systems/hint-ladder';
import { FlameMeter } from '../entities/flame-meter';
import { tracker } from '../../state/tracker.svelte';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../../config/constants';
import { session } from '../../state/session.svelte';
import { evolutionSpriteKey, evolutionSpriteScale } from '../utils/evolution-sprite';
import { clipManager } from '../screens/hub';
import { primaryColors, allColors } from '../../content/colors';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANNER_DURATION = 1.5;
const CELEBRATE_DURATION = 1.2;
const CARD_FLIP_DURATION = 0.3;
const CARD_SHOW_DURATION = 1.2; // How long mismatched pair stays visible
const VICTORY_DURATION = 2.5;

/** Card dimensions per difficulty */
const CARD_W_OWEN = 200;
const CARD_H_OWEN = 240;
const CARD_W_KIAN = 140;
const CARD_H_KIAN = 170;
const CARD_GAP = 20;
const CARD_BORDER_RADIUS = 16;

/** Grid sizes */
const OWEN_COLS = 3;
const OWEN_ROWS = 2;
const KIAN_COLS = 4;
const KIAN_ROWS = 3;

/** Pokeball colors for card back */
const POKEBALL_RED = '#FF3333';
const POKEBALL_WHITE = '#FFFFFF';
const POKEBALL_DARK = '#333333';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryCard {
  id: number;
  pairId: string;       // matching key
  content: string;       // display text or color name
  domain: string;        // 'color' | 'shape' | 'number'
  hex?: string;          // for color cards
  flipped: boolean;      // currently face-up
  matched: boolean;      // permanently revealed
  x: number;
  y: number;
  w: number;
  h: number;
  flipProgress: number;  // 0 = face-down, 1 = face-up (animates)
}

type GamePhase = 'banner' | 'preview' | 'playing' | 'checking' | 'celebrate' | 'victory' | 'done';

// ---------------------------------------------------------------------------
// Content generators
// ---------------------------------------------------------------------------

interface PairDef { pairId: string; content: string; domain: string; hex?: string }

function generateColorPairs(count: number): PairDef[] {
  const pool = count <= 3 ? primaryColors : allColors;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(c => ({
    pairId: `color-${c.name}`,
    content: c.name,
    domain: 'color',
    hex: c.hex,
  }));
}

function generateMixedPairs(count: number): PairDef[] {
  const pairs: PairDef[] = [];

  // Colors (2 pairs)
  const colors = [...allColors].sort(() => Math.random() - 0.5).slice(0, 2);
  for (const c of colors) {
    pairs.push({ pairId: `color-${c.name}`, content: c.name, domain: 'color', hex: c.hex });
  }

  // Shapes (2 pairs)
  const shapes = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond']
    .sort(() => Math.random() - 0.5).slice(0, 2);
  for (const s of shapes) {
    pairs.push({ pairId: `shape-${s}`, content: s, domain: 'shape' });
  }

  // Numbers (remaining pairs)
  const remaining = count - pairs.length;
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5).slice(0, remaining);
  for (const n of nums) {
    pairs.push({ pairId: `num-${n}`, content: String(n), domain: 'number' });
  }

  return pairs.slice(0, count);
}

// ---------------------------------------------------------------------------
// Memory Match Game
// ---------------------------------------------------------------------------

export class MemoryMatchGame implements GameScreen {
  private bg = new Background(20);
  private particles = new ParticlePool();
  private sprite!: SpriteAnimator;
  private voice: VoiceSystem | null = null;
  private hintLadder: HintLadder | null = null;
  private flameMeter: FlameMeter | null = null;
  private gameContext!: GameContext;

  private phase: GamePhase = 'banner';
  private phaseTimer = 0;
  private cards: MemoryCard[] = [];
  private firstFlipped: MemoryCard | null = null;
  private secondFlipped: MemoryCard | null = null;
  private pairsFound = 0;
  private totalPairs = 0;
  private moves = 0;
  private isOwen = true;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.isOwen = session.currentTurn !== 'kian';
    setActivePool(this.particles);
    this.particles.clear();

    // Sprite
    const spriteKey = evolutionSpriteKey();
    this.sprite = new SpriteAnimator(SPRITES[spriteKey]);

    // Voice & hints
    if (ctx.audio && !this.voice) {
      this.voice = new VoiceSystem(ctx.audio);
    }
    this.hintLadder = new HintLadder();
    this.flameMeter = new FlameMeter();

    // Generate cards
    this.setupBoard();

    // Start with banner
    this.phase = 'banner';
    this.phaseTimer = 0;
    this.pairsFound = 0;
    this.moves = 0;
    this.firstFlipped = null;
    this.secondFlipped = null;

    // Announce whose turn it is
    const turn = session.currentTurn;
    if (turn === 'owen') this.voice?.playAshLine('turn_owen');
    else if (turn === 'kian') this.voice?.playAshLine('turn_kian');

    // Play intro voice
    this.voice?.playAshLine('memory_match');

    // Track domain
    session.recordSkillPractice('memory');
  }

  private setupBoard(): void {
    const cols = this.isOwen ? OWEN_COLS : KIAN_COLS;
    const rows = this.isOwen ? OWEN_ROWS : KIAN_ROWS;
    const cardW = this.isOwen ? CARD_W_OWEN : CARD_W_KIAN;
    const cardH = this.isOwen ? CARD_H_OWEN : CARD_H_KIAN;
    this.totalPairs = (cols * rows) / 2;

    // Generate pairs
    const pairDefs = this.isOwen
      ? generateColorPairs(this.totalPairs)
      : generateMixedPairs(this.totalPairs);

    // Create two cards per pair and shuffle
    const cardData: { pairId: string; content: string; domain: string; hex?: string }[] = [];
    for (const p of pairDefs) {
      cardData.push(p, { ...p });
    }
    // Fisher-Yates shuffle
    for (let i = cardData.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardData[i], cardData[j]] = [cardData[j], cardData[i]];
    }

    // Calculate grid position (centered)
    const gridW = cols * cardW + (cols - 1) * CARD_GAP;
    const gridH = rows * cardH + (rows - 1) * CARD_GAP;
    const startX = (DESIGN_WIDTH - gridW) / 2;
    const startY = (DESIGN_HEIGHT - gridH) / 2 + 40; // slightly below center

    this.cards = cardData.map((data, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        id: i,
        pairId: data.pairId,
        content: data.content,
        domain: data.domain,
        hex: data.hex,
        flipped: false,
        matched: false,
        x: startX + col * (cardW + CARD_GAP),
        y: startY + row * (cardH + CARD_GAP),
        w: cardW,
        h: cardH,
        flipProgress: 0,
      };
    });
  }

  update(dt: number): void {
    this.phaseTimer += dt;
    this.bg.update(dt);
    this.particles.update(dt);
    this.sprite.update(dt);
    this.flameMeter?.update(dt);

    // Animate card flips
    for (const card of this.cards) {
      const target = (card.flipped || card.matched) ? 1 : 0;
      if (card.flipProgress < target) {
        card.flipProgress = Math.min(card.flipProgress + dt / CARD_FLIP_DURATION, 1);
      } else if (card.flipProgress > target) {
        card.flipProgress = Math.max(card.flipProgress - dt / CARD_FLIP_DURATION, 0);
      }
    }

    switch (this.phase) {
      case 'banner':
        if (this.phaseTimer > BANNER_DURATION) {
          this.phase = 'preview';
          this.phaseTimer = 0;
          // Brief preview: show all cards for 2s (Owen) or 1.5s (Kian)
          for (const card of this.cards) card.flipped = true;
        }
        break;

      case 'preview': {
        const previewDuration = this.isOwen ? 2.0 : 1.5;
        if (this.phaseTimer > previewDuration) {
          // Hide all cards
          for (const card of this.cards) card.flipped = false;
          this.phase = 'playing';
          this.phaseTimer = 0;
          tracker.startPromptTimer();
        }
        break;
      }

      case 'checking':
        // Two cards are face up — check after delay
        if (this.phaseTimer > CARD_SHOW_DURATION) {
          this.checkMatch();
        }
        break;

      case 'celebrate':
        if (this.phaseTimer > CELEBRATE_DURATION) {
          // Check if all pairs found
          if (this.pairsFound >= this.totalPairs) {
            this.phase = 'victory';
            this.phaseTimer = 0;
            this.voice?.playAshLine('correct');
            // Big celebration
            this.particles.burst(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 40, '#FFD700', 120, 1.5);
            this.gameContext.audio?.playSynth('evolution-sparkle');
          } else {
            this.phase = 'playing';
            this.phaseTimer = 0;
            tracker.startPromptTimer();
          }
        }
        break;

      case 'victory':
        if (this.phaseTimer > VICTORY_DURATION) {
          this.phase = 'done';
          // Award stars based on efficiency
          const efficiency = this.totalPairs / Math.max(this.moves, 1);
          const stars = efficiency >= 0.8 ? 3 : efficiency >= 0.5 ? 2 : 1;
          session.awardStar(stars);
          this.gameContext.events.emit({ type: 'game-complete' });
        }
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.bg.render(ctx);

    // Sprite in top-right
    const spriteScale = evolutionSpriteScale();
    this.sprite.render(ctx, DESIGN_WIDTH - 200, 150, spriteScale);

    // Title banner during banner phase
    if (this.phase === 'banner') {
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 64px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
      ctx.shadowBlur = 12;
      ctx.fillText('Memory Match!', DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.15);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Cards
    for (const card of this.cards) {
      this.drawCard(ctx, card);
    }

    // Pairs found counter
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 28px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Pairs: ${this.pairsFound}/${this.totalPairs}`, 40, 40);
    ctx.fillText(`Moves: ${this.moves}`, 40, 76);
    ctx.restore();

    // Flame meter
    this.flameMeter?.render(ctx, 40, DESIGN_HEIGHT - 60);

    // Victory message
    if (this.phase === 'victory') {
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 72px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
      ctx.shadowBlur = 20;
      ctx.fillText('ALL MATCHED!', DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.15);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '36px Fredoka, Nunito, sans-serif';
      ctx.fillText(`${this.moves} moves — ${this.getMoveRating()}`, DESIGN_WIDTH / 2, DESIGN_HEIGHT * 0.22);
      ctx.restore();
    }

    this.particles.render(ctx);
  }

  exit(): void {
    this.particles.clear();
    this.hintLadder = null;
  }

  handleClick(x: number, y: number): void {
    if (this.phase !== 'playing') return;

    // Find clicked card
    const clicked = this.cards.find(c =>
      !c.flipped && !c.matched &&
      x >= c.x && x <= c.x + c.w &&
      y >= c.y && y <= c.y + c.h,
    );

    if (!clicked) return;

    // Flip the card
    clicked.flipped = true;
    this.gameContext.audio?.playSynth('button-press');

    if (!this.firstFlipped) {
      // First card of a pair
      this.firstFlipped = clicked;
      this.voice?.playAshLine('memory_match');
    } else {
      // Second card
      this.secondFlipped = clicked;
      this.moves++;
      this.phase = 'checking';
      this.phaseTimer = 0;
    }
  }

  handleKey(_key: string): void {
    // No keyboard interaction for this game
  }

  // ---------------------------------------------------------------------------
  // Match checking
  // ---------------------------------------------------------------------------

  private checkMatch(): void {
    if (!this.firstFlipped || !this.secondFlipped) return;

    const isMatch = this.firstFlipped.pairId === this.secondFlipped.pairId;

    if (isMatch) {
      // Mark as matched
      this.firstFlipped.matched = true;
      this.secondFlipped.matched = true;
      this.pairsFound++;

      // Record correct answers
      tracker.recordAnswer(this.firstFlipped.content, this.firstFlipped.domain, true);
      session.recordAnswer(true);
      session.recordCorrectConcept(this.firstFlipped.domain, this.firstFlipped.content);

      // Streak announcements
      if (tracker.consecutiveCorrect === 3) this.voice?.playAshLine('streak_3');
      else if (tracker.consecutiveCorrect === 5) this.voice?.playAshLine('streak_5');

      // Celebration
      this.voice?.playAshLine('memory_found');
      this.gameContext.audio?.playSynth('correct-chime');
      this.particles.burst(
        (this.firstFlipped.x + this.secondFlipped.x) / 2 + this.firstFlipped.w / 2,
        (this.firstFlipped.y + this.secondFlipped.y) / 2 + this.firstFlipped.h / 2,
        15, '#33CC33', 60, 0.8,
      );

      this.flameMeter?.addCharge(15);
      this.phase = 'celebrate';
      this.phaseTimer = 0;

      // Variable-ratio clip reward (use streak count, not pairs found)
      if (clipManager.shouldShowCelebrationClip(tracker.consecutiveCorrect)) {
        const clip = clipManager.getCelebrationClip();
        if (clip) {
          this.gameContext.events.emit({ type: 'play-video', src: clip.src });
        }
      }
    } else {
      // No match — flip cards back
      this.firstFlipped.flipped = false;
      this.secondFlipped.flipped = false;
      this.gameContext.audio?.playSynth('wrong-buzz');

      this.phase = 'playing';
      this.phaseTimer = 0;
      tracker.startPromptTimer();
    }

    this.firstFlipped = null;
    this.secondFlipped = null;
    clipManager.onPromptComplete();
  }

  // ---------------------------------------------------------------------------
  // Card rendering
  // ---------------------------------------------------------------------------

  private drawCard(ctx: CanvasRenderingContext2D, card: MemoryCard): void {
    ctx.save();

    // Flip animation: scale X from 1→0→1 with face change at midpoint
    const showFace = card.flipProgress > 0.5;
    const scaleX = Math.abs(card.flipProgress - 0.5) * 2; // 1→0→1

    // Transform for flip
    const centerX = card.x + card.w / 2;
    const centerY = card.y + card.h / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(scaleX, 1);
    ctx.translate(-centerX, -centerY);

    if (showFace) {
      // Face-up: show content
      this.drawCardFace(ctx, card);
    } else {
      // Face-down: Pokeball back
      this.drawCardBack(ctx, card);
    }

    // Matched glow
    if (card.matched) {
      ctx.shadowColor = '#33CC33';
      ctx.shadowBlur = 15;
      ctx.strokeStyle = '#33CC33';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(card.x, card.y, card.w, card.h, CARD_BORDER_RADIUS);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  private drawCardBack(ctx: CanvasRenderingContext2D, card: MemoryCard): void {
    // Card background
    ctx.fillStyle = '#1A1A2E';
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.w, card.h, CARD_BORDER_RADIUS);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#37B1E2';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pokeball design
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    const r = Math.min(card.w, card.h) * 0.3;

    // Top half (red)
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0);
    ctx.fillStyle = POKEBALL_RED;
    ctx.fill();

    // Bottom half (white)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI);
    ctx.fillStyle = POKEBALL_WHITE;
    ctx.fill();

    // Center line
    ctx.strokeStyle = POKEBALL_DARK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    // Center button
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = POKEBALL_WHITE;
    ctx.fill();
    ctx.strokeStyle = POKEBALL_DARK;
    ctx.lineWidth = 2;
    ctx.stroke();

    // "?" text
    ctx.fillStyle = 'rgba(55, 177, 226, 0.5)';
    ctx.font = `bold ${r * 0.6}px Fredoka, Nunito, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
  }

  private drawCardFace(ctx: CanvasRenderingContext2D, card: MemoryCard): void {
    // Card background
    ctx.fillStyle = card.matched ? 'rgba(51, 204, 51, 0.15)' : '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(card.x, card.y, card.w, card.h, CARD_BORDER_RADIUS);
    ctx.fill();

    // Border
    ctx.strokeStyle = card.matched ? '#33CC33' : '#CCCCCC';
    ctx.lineWidth = 2;
    ctx.stroke();

    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;

    if (card.domain === 'color' && card.hex) {
      // Color card: big colored circle
      const r = Math.min(card.w, card.h) * 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy - 10, r, 0, Math.PI * 2);
      ctx.fillStyle = card.hex;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Color name below
      ctx.fillStyle = '#333333';
      ctx.font = `bold ${card.w * 0.12}px Fredoka, Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(card.content.toUpperCase(), cx, cy + r + 8);
    } else if (card.domain === 'shape') {
      // Shape card: draw the shape
      this.drawShapeIcon(ctx, card.content, cx, cy - 10, Math.min(card.w, card.h) * 0.28);
      ctx.fillStyle = '#333333';
      ctx.font = `bold ${card.w * 0.11}px Fredoka, Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(card.content.toUpperCase(), cx, cy + Math.min(card.w, card.h) * 0.28 + 8);
    } else {
      // Number card: big number
      ctx.fillStyle = '#37B1E2';
      ctx.font = `bold ${card.w * 0.4}px Fredoka, Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(card.content, cx, cy);
    }
  }

  private drawShapeIcon(
    ctx: CanvasRenderingContext2D,
    shape: string, cx: number, cy: number, size: number,
  ): void {
    ctx.fillStyle = '#FF8833';
    ctx.beginPath();

    switch (shape) {
      case 'circle':
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
        break;
      case 'square':
        ctx.rect(cx - size, cy - size, size * 2, size * 2);
        break;
      case 'triangle':
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + size, cy + size);
        ctx.lineTo(cx - size, cy + size);
        ctx.closePath();
        break;
      case 'star': {
        const spikes = 5;
        const outerR = size;
        const innerR = size * 0.4;
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI / 2) * -1 + (i * Math.PI) / spikes;
          const px = cx + Math.cos(angle) * r;
          const py = cy + Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case 'heart':
        ctx.moveTo(cx, cy + size * 0.6);
        ctx.bezierCurveTo(cx - size * 1.2, cy - size * 0.4, cx - size * 0.4, cy - size, cx, cy - size * 0.4);
        ctx.bezierCurveTo(cx + size * 0.4, cy - size, cx + size * 1.2, cy - size * 0.4, cx, cy + size * 0.6);
        break;
      case 'diamond':
        ctx.moveTo(cx, cy - size);
        ctx.lineTo(cx + size * 0.6, cy);
        ctx.lineTo(cx, cy + size);
        ctx.lineTo(cx - size * 0.6, cy);
        ctx.closePath();
        break;
      default:
        ctx.arc(cx, cy, size, 0, Math.PI * 2);
    }

    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getMoveRating(): string {
    const perfect = this.totalPairs;
    const ratio = this.moves / perfect;
    if (ratio <= 1.5) return 'PERFECT MEMORY!';
    if (ratio <= 2.5) return 'Great memory!';
    if (ratio <= 4) return 'Good job!';
    return 'Keep practicing!';
  }
}
