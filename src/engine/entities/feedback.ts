// src/engine/entities/feedback.ts
// Reusable answer feedback system — shows "GREAT!", "Try again!", "Look here!" with particles

import { ParticlePool } from './particles';
import { session } from '../../state/session.svelte';

export class FeedbackSystem {
  private particles: ParticlePool;
  private feedbackText = '';
  private feedbackAlpha = 0;
  private feedbackScale = 0;
  private feedbackX = 0;
  private feedbackY = 0;
  private feedbackColor = '#FFD700';
  private feedbackTimer = 0;

  constructor(particles: ParticlePool) {
    this.particles = particles;
  }

  /** Show correct answer feedback at position — 20% chance of super celebration */
  correct(x: number, y: number): void {
    const isSuper = Math.random() < 0.2;
    const messages = isSuper
      ? ['SUPER!', 'AMAZING!', 'WOW!', 'INCREDIBLE!']
      : ['GREAT!', 'YES!', 'AWESOME!', 'NICE!'];
    this.feedbackText = messages[Math.floor(Math.random() * messages.length)];
    this.feedbackColor = isSuper ? '#FF6B35' : '#FFD700';
    this.feedbackAlpha = 1;
    this.feedbackScale = 0.3;
    this.feedbackX = x;
    this.feedbackY = y;
    this.feedbackTimer = 0;
    // Gold/orange particle burst — bigger for super celebrations
    const burstCount = isSuper ? 50 : 25;
    const whiteCount = isSuper ? 25 : 15;
    this.particles.burst(x, y, burstCount, this.feedbackColor, 200, 1.0);
    this.particles.burst(x, y, whiteCount, '#ffffff', 120, 0.5);

    // Award stars: 2 for super celebration, 1 for normal
    const starCount = isSuper ? 2 : 1;
    session.awardStar(starCount);

    // Star particle effect near the star counter position
    // Owen is top-left (~80, 230), Kian is top-right (~1840, 230)
    const isKian = session.currentTurn === 'kian';
    const starX = isKian ? 1840 : 80;
    const starY = 230;
    const starParticleCount = 3 + Math.floor(Math.random() * 3); // 3-5
    this.particles.burst(starX, starY, starParticleCount, '#FFD700', 60, 0.6);
  }

  /** Show wrong answer feedback at position */
  wrong(x: number, y: number): void {
    const texts = ['Try again!', 'Not quite!', 'Hmm...'];
    this.feedbackText = texts[Math.floor(Math.random() * texts.length)];
    this.feedbackColor = '#FF6B6B';
    this.feedbackAlpha = 1;
    this.feedbackScale = 0.3;
    this.feedbackX = x;
    this.feedbackY = y;
    this.feedbackTimer = 0;
    // Small red burst (gentle, not punishing)
    this.particles.burst(x, y, 8, '#FF6B6B', 60, 0.4);
  }

  /** Show hint feedback — draw attention to the correct answer */
  hint(x: number, y: number): void {
    this.feedbackText = 'Look here!';
    this.feedbackColor = '#37B1E2';
    this.feedbackAlpha = 1;
    this.feedbackScale = 0.3;
    this.feedbackX = x;
    this.feedbackY = y;
    this.feedbackTimer = 0;
    // Blue glow particles
    this.particles.burst(x, y, 10, '#37B1E2', 80, 1.0);
  }

  /** Show auto-complete feedback (gentler celebration) */
  autoComplete(x: number, y: number): void {
    this.feedbackText = 'There it is!';
    this.feedbackColor = '#91CCEC';
    this.feedbackAlpha = 1;
    this.feedbackScale = 0.3;
    this.feedbackX = x;
    this.feedbackY = y;
    this.feedbackTimer = 0;
    this.particles.burst(x, y, 12, '#91CCEC', 100, 0.6);
  }

  /** Call every frame with delta time */
  update(dt: number): void {
    if (this.feedbackAlpha <= 0) return;
    this.feedbackTimer += dt;
    // Scale up quickly with a spring-like bounce
    this.feedbackScale = Math.min(1.0, this.feedbackScale + dt * 5);
    // Start fading after 0.8 seconds
    if (this.feedbackTimer > 0.8) {
      this.feedbackAlpha = Math.max(0, this.feedbackAlpha - dt * 2.5);
    }
  }

  /** Render the feedback text overlay — call in your game's render method */
  render(ctx: CanvasRenderingContext2D): void {
    if (this.feedbackAlpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.feedbackAlpha;

    const fontSize = Math.round(72 * this.feedbackScale);
    ctx.font = `bold ${fontSize}px Fredoka, Fredoka, Nunito, sans-serif, sans-serif`;
    ctx.fillStyle = this.feedbackColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text outline for readability (dark outline behind colored text)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(this.feedbackText, this.feedbackX, this.feedbackY);

    // Main text with glow
    ctx.shadowColor = this.feedbackColor;
    ctx.shadowBlur = 20;
    ctx.fillText(this.feedbackText, this.feedbackX, this.feedbackY);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  /** Whether the feedback is currently visible */
  get active(): boolean {
    return this.feedbackAlpha > 0;
  }

  /** Reset/clear any active feedback */
  clear(): void {
    this.feedbackAlpha = 0;
    this.feedbackTimer = 0;
  }
}
