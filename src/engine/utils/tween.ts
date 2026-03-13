// src/engine/utils/tween.ts

export type EasingFn = (t: number) => number;

export const easing = {
  linear: (t: number) => t,
  easeInOut: (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  easeOut: (t: number) => 1 - (1 - t) ** 3,
  easeIn: (t: number) => t * t * t,
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
} as const;

export interface TweenConfig {
  from: number;
  to: number;
  duration: number; // seconds
  easing: EasingFn;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}

export class Tween {
  private elapsed = 0;
  private config: TweenConfig;
  public done = false;

  constructor(config: TweenConfig) {
    this.config = config;
  }

  update(dt: number): void {
    if (this.done) return;
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.config.duration, 1);
    const easedT = this.config.easing(t);
    this.config.onUpdate(this.config.from + (this.config.to - this.config.from) * easedT);
    if (t >= 1) {
      this.done = true;
      this.config.onComplete?.();
    }
  }

  cancel(): void {
    this.done = true;
  }
}

export class TweenManager {
  private tweens: Tween[] = [];

  add(config: TweenConfig): Tween {
    const tween = new Tween(config);
    this.tweens.push(tween);
    return tween;
  }

  update(dt: number): void {
    for (const tween of this.tweens) tween.update(dt);
    this.tweens = this.tweens.filter((t) => !t.done);
  }

  clear(): void {
    for (const tween of this.tweens) tween.cancel();
    this.tweens = [];
  }
}
