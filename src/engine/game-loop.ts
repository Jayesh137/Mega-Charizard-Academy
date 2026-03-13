// src/engine/game-loop.ts
import { MAX_FRAME_DT, FPS_THRESHOLD_MEDIUM, FPS_THRESHOLD_LOW, DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/constants';
import { session } from '../state/session.svelte';
import { getActivePool } from './entities/particles';
import type { ScreenManager } from './screen-manager';

export class GameLoop {
  private running = false;
  private lastTime = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  public screenManager!: ScreenManager;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
  ) {}

  start(): void {
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.tick(t));
  }

  stop(): void {
    this.running = false;
  }

  private tick(now: number): void {
    if (!this.running) return;

    const dt = Math.min((now - this.lastTime) / 1000, MAX_FRAME_DT);
    this.lastTime = now;

    // FPS tracking
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      session.currentFps = this.frameCount;

      // Adaptive particle reduction based on measured FPS
      const pool = getActivePool();
      if (pool) {
        if (this.frameCount >= FPS_THRESHOLD_MEDIUM) {
          pool.spawnRateMultiplier = 1.0;
        } else if (this.frameCount >= FPS_THRESHOLD_LOW) {
          pool.spawnRateMultiplier = 0.5;
        } else {
          pool.spawnRateMultiplier = 0.25;
        }
      }

      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Clear
    this.ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // Update + render current screen
    this.screenManager.update(dt);
    this.screenManager.render(this.ctx);

    requestAnimationFrame((t) => this.tick(t));
  }

  handleClick(x: number, y: number): void {
    this.screenManager.handleClick(x, y);
  }

  handleKey(key: string): void {
    this.screenManager.handleKey(key);
  }
}
