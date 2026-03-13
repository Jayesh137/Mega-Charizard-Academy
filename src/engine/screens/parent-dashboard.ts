// src/engine/screens/parent-dashboard.ts
// Parent-facing analytics dashboard (press 'P' from hub).
// Shows longitudinal progress, mastery grids, AAP compliance,
// and actionable recommendations.
// Research: Parental engagement with data drives better outcomes (NAEYC 2024).

import type { GameScreen, GameContext } from '../screen-manager';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../../config/constants';
import { settings, type ConceptMasteryEntry, type SessionHistoryEntry } from '../../state/settings.svelte';
import { tracker } from '../../state/tracker.svelte';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MARGIN = 60;
const COL_W = (DESIGN_WIDTH - MARGIN * 3) / 2;
const HEADER_H = 80;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function masteryColor(level: string): string {
  if (level === 'mastered') return '#33CC33';
  if (level === 'practicing') return '#FFD700';
  return '#FF6B6B';
}

// ---------------------------------------------------------------------------
// ParentDashboardScreen
// ---------------------------------------------------------------------------

export class ParentDashboardScreen implements GameScreen {
  private gameContext!: GameContext;
  private scrollY = 0;
  private previousScreen = '';

  enter(ctx: GameContext): void {
    this.gameContext = ctx;
    this.scrollY = 0;
  }

  update(_dt: number): void {
    // Static screen — no animation needed
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Dark background
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    ctx.save();
    ctx.translate(0, -this.scrollY);

    // Header
    this.drawHeader(ctx);

    // Left column: Owen
    this.drawChildColumn(ctx, 'owen', settings.littleTrainerName, MARGIN, HEADER_H + 20);

    // Right column: Kian
    this.drawChildColumn(ctx, 'kian', settings.bigTrainerName, MARGIN * 2 + COL_W, HEADER_H + 20);

    // Bottom: session history + recommendations
    this.drawSessionHistory(ctx, MARGIN, 680);
    this.drawRecommendations(ctx, MARGIN * 2 + COL_W, 680);

    // Footer
    this.drawFooter(ctx);

    ctx.restore();
  }

  exit(): void {}

  handleClick(_x: number, _y: number): void {
    // Press any key or click to return
    this.goBack();
  }

  handleKey(key: string): void {
    if (key === 'ArrowDown') {
      this.scrollY = Math.min(this.scrollY + 100, 200);
    } else if (key === 'ArrowUp') {
      this.scrollY = Math.max(this.scrollY - 100, 0);
    } else {
      this.goBack();
    }
  }

  setPreviousScreen(screen: string): void {
    this.previousScreen = screen;
  }

  private goBack(): void {
    this.gameContext.screenManager.goTo(this.previousScreen || 'hub');
  }

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  private drawHeader(ctx: CanvasRenderingContext2D): void {
    // Title bar
    ctx.fillStyle = 'rgba(55, 177, 226, 0.15)';
    fillRoundedRect(ctx, 0, 0, DESIGN_WIDTH, HEADER_H, 0);

    ctx.fillStyle = '#37B1E2';
    ctx.font = 'bold 38px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Parent Dashboard — Mega Charizard Academy', DESIGN_WIDTH / 2, HEADER_H / 2);

    // Subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '16px Fredoka, Nunito, sans-serif';
    const streak = settings.playStreak;
    const totalMin = settings.totalPlayTimeMinutes;
    ctx.fillText(
      `Total play time: ${totalMin}min  |  Play streak: ${streak} day${streak !== 1 ? 's' : ''}  |  Press any key to return`,
      DESIGN_WIDTH / 2, HEADER_H - 8,
    );
  }

  // ---------------------------------------------------------------------------
  // Child column: mastery grid + current session domains
  // ---------------------------------------------------------------------------

  private drawChildColumn(
    ctx: CanvasRenderingContext2D,
    child: 'owen' | 'kian',
    name: string,
    x: number,
    y: number,
  ): void {
    // Column background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    fillRoundedRect(ctx, x, y, COL_W, 560, 16);

    // Name header
    ctx.fillStyle = child === 'owen' ? '#FF8833' : '#37B1E2';
    ctx.font = 'bold 30px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name, x + COL_W / 2, y + 14);

    // Overall stats
    const accuracy = tracker.getChildAccuracy(child);
    const maxStreak = tracker.getChildMaxStreak(child);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '20px Fredoka, Nunito, sans-serif';
    ctx.fillText(`Session Accuracy: ${accuracy}%  |  Best Streak: ${maxStreak}`, x + COL_W / 2, y + 52);

    // Mastery grid
    const mastery = settings.getMasteryGrid(child);
    this.drawMasteryGrid(ctx, mastery, x + 20, y + 86, COL_W - 40);

    // Current session domains
    const domains = tracker.getDomainSummaries(child);
    if (domains.length > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = 'bold 18px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('This Session:', x + 20, y + 370);

      let dy = y + 396;
      for (const d of domains) {
        const label = d.domain.charAt(0).toUpperCase() + d.domain.slice(1);
        const zpdLabel = d.zpd === 'too-easy' ? 'Ready for harder!' : d.zpd === 'too-hard' ? 'Needs support' : 'In ZPD';
        const zpdColor = d.zpd === 'too-easy' ? '#37B1E2' : d.zpd === 'too-hard' ? '#FF6B6B' : '#33CC33';

        // Domain name + accuracy bar
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '16px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${label}: ${d.accuracy}% (${d.totalAttempts} Qs)`, x + 24, dy);

        // Mini bar
        const barX = x + 240;
        const barW = COL_W - 340;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        fillRoundedRect(ctx, barX, dy - 8, barW, 10, 5);
        ctx.fillStyle = zpdColor;
        fillRoundedRect(ctx, barX, dy - 8, barW * Math.min(d.accuracy / 100, 1), 10, 5);

        // ZPD badge
        ctx.fillStyle = zpdColor;
        ctx.font = '13px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(zpdLabel, x + COL_W - 24, dy);

        dy += 28;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Mastery grid — color-coded concept cells
  // ---------------------------------------------------------------------------

  private drawMasteryGrid(
    ctx: CanvasRenderingContext2D,
    mastery: ConceptMasteryEntry[],
    x: number, y: number, w: number,
  ): void {
    if (mastery.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '16px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No mastery data yet — play more sessions!', x + w / 2, y + 30);
      return;
    }

    // Group by domain
    const domains = new Map<string, ConceptMasteryEntry[]>();
    for (const m of mastery) {
      const list = domains.get(m.domain) ?? [];
      list.push(m);
      domains.set(m.domain, list);
    }

    let dy = y;
    const cellW = 70;
    const cellH = 28;
    const gap = 4;

    for (const [domain, entries] of domains) {
      // Domain label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = 'bold 15px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(domain.charAt(0).toUpperCase() + domain.slice(1), x, dy + 14);
      dy += 22;

      // Concept cells
      let cx = x;
      for (const entry of entries) {
        if (cx + cellW > x + w) {
          cx = x;
          dy += cellH + gap;
        }

        ctx.fillStyle = masteryColor(entry.level);
        ctx.globalAlpha = 0.25;
        fillRoundedRect(ctx, cx, dy, cellW, cellH, 6);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = masteryColor(entry.level);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(cx, dy, cellW, cellH, 6);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '13px Fredoka, Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.concept, cx + cellW / 2, dy + cellH / 2);

        cx += cellW + gap;
      }

      dy += cellH + gap + 6;
    }
  }

  // ---------------------------------------------------------------------------
  // Session history (last 10 sessions)
  // ---------------------------------------------------------------------------

  private drawSessionHistory(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
  ): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    fillRoundedRect(ctx, x, y, COL_W, 320, 16);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 22px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Session History', x + COL_W / 2, y + 12);

    const history = settings.sessionHistory;
    if (history.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '16px Fredoka, Nunito, sans-serif';
      ctx.fillText('No session history yet', x + COL_W / 2, y + 60);
      return;
    }

    // Mini bar chart of accuracies over time
    const chartX = x + 40;
    const chartY = y + 50;
    const chartW = COL_W - 80;
    const chartH = 120;
    const barGap = 8;
    const maxBars = Math.min(history.length, 10);
    const barW = (chartW - barGap * (maxBars - 1)) / maxBars;
    const recent = history.slice(-maxBars);

    // Chart axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY + chartH);
    ctx.lineTo(chartX + chartW, chartY + chartH);
    ctx.stroke();

    for (let i = 0; i < recent.length; i++) {
      const entry: SessionHistoryEntry = recent[i];
      const bx = chartX + i * (barW + barGap);
      const avgAcc = Math.round((entry.owenAccuracy + entry.kianAccuracy) / 2);
      const bh = (avgAcc / 100) * chartH;

      // Bar
      const barColor = avgAcc >= 70 ? '#33CC33' : avgAcc >= 40 ? '#FFD700' : '#FF6B6B';
      ctx.fillStyle = barColor;
      ctx.globalAlpha = 0.6;
      fillRoundedRect(ctx, bx, chartY + chartH - bh, barW, bh, 4);
      ctx.globalAlpha = 1;

      // Accuracy label on bar
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${avgAcc}%`, bx + barW / 2, chartY + chartH - bh - 12);

      // Date label below
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '11px Fredoka, Nunito, sans-serif';
      const dateStr = entry.date.split('T')[0].slice(5); // MM-DD
      ctx.fillText(dateStr, bx + barW / 2, chartY + chartH + 14);
    }

    // Legend
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '13px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Average accuracy per session', x + COL_W / 2, chartY + chartH + 36);

    // Stars trend
    const totalStars = recent.reduce((sum, e) => sum + e.owenStars + e.kianStars, 0);
    ctx.fillStyle = '#FFD700';
    ctx.font = '16px Fredoka, Nunito, sans-serif';
    ctx.fillText(`Total Stars Earned: ${totalStars}`, x + COL_W / 2, y + 260);

    // AAP compliance
    const todayMin = settings.totalPlayTimeToday;
    const aapColor = todayMin <= 60 ? '#33CC33' : '#FF6B6B';
    ctx.fillStyle = aapColor;
    ctx.font = '15px Fredoka, Nunito, sans-serif';
    ctx.fillText(
      `Today: ${todayMin}min / 60min AAP guideline`,
      x + COL_W / 2, y + 288,
    );
  }

  // ---------------------------------------------------------------------------
  // Recommendations
  // ---------------------------------------------------------------------------

  private drawRecommendations(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
  ): void {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    fillRoundedRect(ctx, x, y, COL_W, 320, 16);

    ctx.fillStyle = '#37B1E2';
    ctx.font = 'bold 22px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Recommendations', x + COL_W / 2, y + 12);

    const recs = this.generateRecommendations();
    let dy = y + 50;

    for (const rec of recs) {
      // Bullet
      ctx.fillStyle = rec.color;
      ctx.beginPath();
      ctx.arc(x + 30, dy + 6, 5, 0, Math.PI * 2);
      ctx.fill();

      // Text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '16px Fredoka, Nunito, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(rec.text, x + 45, dy + 10);
      dy += 32;
    }

    // Research methodology
    dy = y + 240;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '13px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Research-backed methodology:', x + COL_W / 2, dy);
    dy += 18;
    const methods = [
      'Vygotsky ZPD — adaptive difficulty keeps children in their learning zone',
      'Variable-ratio reinforcement — unpredictable rewards sustain engagement',
      'Spaced repetition — missed concepts revisited after a gap',
      'AAP guidelines — session limits protect developing attention spans',
    ];
    for (const m of methods) {
      ctx.fillText(m, x + COL_W / 2, dy);
      dy += 16;
    }
  }

  private generateRecommendations(): { text: string; color: string }[] {
    const recs: { text: string; color: string }[] = [];

    // Check mastery grids for both children
    for (const child of ['owen', 'kian'] as const) {
      const name = child === 'owen' ? settings.littleTrainerName : settings.bigTrainerName;
      const mastery = settings.getMasteryGrid(child);
      const learning = mastery.filter(m => m.level === 'learning');
      const mastered = mastery.filter(m => m.level === 'mastered');

      if (learning.length > 0) {
        const concepts = learning.slice(0, 3).map(m => m.concept).join(', ');
        recs.push({ text: `${name} needs more practice with: ${concepts}`, color: '#FFB347' });
      }
      if (mastered.length >= 5) {
        recs.push({ text: `${name} has mastered ${mastered.length} concepts — try harder modes!`, color: '#33CC33' });
      }
    }

    // Session frequency
    if (settings.playStreak >= 3) {
      recs.push({ text: `${settings.playStreak}-day streak! Consistency builds strong foundations`, color: '#37B1E2' });
    } else if (settings.playStreak === 0) {
      recs.push({ text: 'Try to play daily — short consistent sessions beat long infrequent ones', color: '#FFD700' });
    }

    // AAP compliance
    if (settings.totalPlayTimeToday > 45) {
      recs.push({ text: 'Consider a break — AAP recommends <1 hour screen time for ages 2-5', color: '#FF6B6B' });
    }

    if (recs.length === 0) {
      recs.push({ text: 'Keep exploring! Every session builds foundations for school readiness', color: '#33CC33' });
    }

    return recs.slice(0, 6);
  }

  // ---------------------------------------------------------------------------
  // Footer
  // ---------------------------------------------------------------------------

  private drawFooter(ctx: CanvasRenderingContext2D): void {
    const y = DESIGN_HEIGHT + 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.font = '13px Fredoka, Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Mega Charizard Academy — Research-backed early learning through play',
      DESIGN_WIDTH / 2, y,
    );
  }
}
