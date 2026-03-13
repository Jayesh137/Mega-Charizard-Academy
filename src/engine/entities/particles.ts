// src/engine/entities/particles.ts
import { MAX_PARTICLES } from '../../config/constants';
import { randomRange } from '../utils/math';

export interface ParticleConfig {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  color: string;
  size: number;
  lifetime: number;
  gravity?: number;
  drag?: number;
  fadeOut?: boolean;
  shrink?: boolean;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  initialSize: number;
  lifetime: number;
  maxLifetime: number;
  gravity: number;
  drag: number;
  fadeOut: boolean;
  shrink: boolean;
}

// Module-level active pool reference for adaptive performance tuning
let activePool: ParticlePool | null = null;

export function setActivePool(pool: ParticlePool): void {
  activePool = pool;
}

export function getActivePool(): ParticlePool | null {
  return activePool;
}

export class ParticlePool {
  private particles: Particle[];
  private activeCount = 0;
  public spawnRateMultiplier = 1.0;

  constructor() {
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0,
      color: '#fff', size: 4, initialSize: 4,
      lifetime: 0, maxLifetime: 1,
      gravity: 0, drag: 0.98, fadeOut: true, shrink: false,
    }));
  }

  spawn(config: ParticleConfig): void {
    if (Math.random() > this.spawnRateMultiplier) return;
    if (this.activeCount >= MAX_PARTICLES) this.killOldest();

    const p = this.particles.find((p) => !p.active);
    if (!p) return;

    p.active = true;
    p.x = config.x;
    p.y = config.y;
    p.vx = config.vx ?? 0;
    p.vy = config.vy ?? 0;
    p.color = config.color;
    p.size = config.size;
    p.initialSize = config.size;
    p.lifetime = config.lifetime;
    p.maxLifetime = config.lifetime;
    p.gravity = config.gravity ?? 0;
    p.drag = config.drag ?? 0.98;
    p.fadeOut = config.fadeOut ?? true;
    p.shrink = config.shrink ?? false;
    this.activeCount++;
  }

  /** Spawn multiple particles in a radial burst. */
  burst(x: number, y: number, count: number, color: string, speed: number, lifetime: number): void {
    for (let i = 0; i < count; i++) {
      const angle = randomRange(0, Math.PI * 2);
      const spd = randomRange(speed * 0.5, speed);
      this.spawn({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color, size: randomRange(2, 6), lifetime,
        gravity: 50, drag: 0.96, fadeOut: true, shrink: true,
      });
    }
  }

  /** Spawn celebration confetti — colored rectangles that flutter down */
  confetti(x: number, y: number, count: number): void {
    const colors = ['#FFD700', '#FF6B35', '#37B1E2', '#91CCEC', '#FF4444', '#33CC33', '#9933FF', '#FFFFFF'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 200;
      this.spawn({
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.5) * 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 150, // Initial upward burst
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 5,
        lifetime: 1.5 + Math.random() * 1.0,
        gravity: 200,  // Flutter down
        drag: 0.96,
        fadeOut: true,
        shrink: false,  // Confetti doesn't shrink
      });
    }
  }

  /** Star burst: golden particles fly outward in a star pattern */
  starBurst(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const speed = 120 + Math.random() * 80;
      this.spawn({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: i % 3 === 0 ? '#FFD700' : i % 3 === 1 ? '#FFFFFF' : '#FFE066',
        size: 3 + Math.random() * 4,
        lifetime: 0.6 + Math.random() * 0.4,
        gravity: 30,
        drag: 0.94,
        fadeOut: true,
        shrink: true,
      });
    }
  }

  /** Spawn flame-style particles drifting upward. */
  flame(x: number, y: number, count: number, colors: string[], spread: number): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + randomRange(-spread, spread),
        y: y + randomRange(-spread * 0.5, 0),
        vx: randomRange(-10, 10),
        vy: randomRange(-80, -30),
        color: colors[Math.floor(Math.random() * colors.length)],
        size: randomRange(2, 8),
        lifetime: randomRange(0.3, 0.8),
        drag: 0.95, fadeOut: true, shrink: true,
      });
    }
  }

  update(dt: number): void {
    this.activeCount = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.lifetime -= dt;
      if (p.lifetime <= 0) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.shrink) {
        p.size = p.initialSize * (p.lifetime / p.maxLifetime);
      }
      this.activeCount++;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      const alpha = p.fadeOut ? p.lifetime / p.maxLifetime : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(p.size, 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.particles) p.active = false;
    this.activeCount = 0;
  }

  private killOldest(): void {
    let oldest: Particle | null = null;
    let lowestLifetime = Infinity;
    for (const p of this.particles) {
      if (p.active && p.lifetime < lowestLifetime) {
        oldest = p;
        lowestLifetime = p.lifetime;
      }
    }
    if (oldest) oldest.active = false;
  }

  get count(): number {
    return this.activeCount;
  }
}
