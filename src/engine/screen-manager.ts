// src/engine/screen-manager.ts
import type { EventEmitter } from './events';
import type { TweenManager } from './utils/tween';
import type { AudioManager } from './audio';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/constants';

export interface GameScreen {
  enter(ctx: GameContext): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  exit(): void;
  handleClick(x: number, y: number): void;
  handleKey(key: string): void;
}

export interface GameContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  events: EventEmitter;
  tweens: TweenManager;
  screenManager: ScreenManager;
  audio?: AudioManager;
}

export class ScreenManager {
  private currentScreen: GameScreen | null = null;
  private screens = new Map<string, GameScreen>();
  private gameContext: GameContext;

  // Fade-to-black transition state
  private transitioning = false;
  private transitionAlpha = 0;
  private transitionPhase: 'out' | 'in' = 'out';
  private pendingScreen: string | null = null;
  private static readonly TRANSITION_DURATION = 0.3; // seconds per phase

  constructor(context: GameContext) {
    this.gameContext = context;
  }

  register(name: string, screen: GameScreen): void {
    this.screens.set(name, screen);
  }

  goTo(name: string): void {
    // Ignore if already transitioning
    if (this.transitioning) return;

    // If no current screen, instant swap (first load)
    if (!this.currentScreen) {
      this._swapScreen(name);
      return;
    }

    // Start fade-to-black transition
    this.transitioning = true;
    this.transitionAlpha = 0;
    this.transitionPhase = 'out';
    this.pendingScreen = name;
  }

  private _swapScreen(name: string): void {
    if (this.currentScreen) {
      this.currentScreen.exit();
    }

    // Clear all DOM overlays on screen transition to prevent stale content
    this.gameContext.events.emit({ type: 'hide-prompt' });
    this.gameContext.events.emit({ type: 'hide-banner' });
    this.gameContext.events.emit({ type: 'hide-subtitle' });

    const screen = this.screens.get(name);
    if (!screen) throw new Error(`Screen "${name}" not registered`);
    this.currentScreen = screen;
    this.currentScreen.enter(this.gameContext);
    this.gameContext.events.emit({ type: 'screen-changed', screen: name });
  }

  update(dt: number): void {
    this.gameContext.tweens.update(dt);
    this.currentScreen?.update(dt);

    // Animate fade transition
    if (this.transitioning) {
      const speed = 1 / ScreenManager.TRANSITION_DURATION;
      if (this.transitionPhase === 'out') {
        this.transitionAlpha += dt * speed;
        if (this.transitionAlpha >= 1) {
          this.transitionAlpha = 1;
          // Swap screen at full black
          if (this.pendingScreen) {
            this._swapScreen(this.pendingScreen);
            this.pendingScreen = null;
          }
          this.transitionPhase = 'in';
        }
      } else {
        // Phase 'in': fade from black
        this.transitionAlpha -= dt * speed;
        if (this.transitionAlpha <= 0) {
          this.transitionAlpha = 0;
          this.transitioning = false;
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.currentScreen?.render(ctx);

    // Draw fade-to-black overlay during transition
    if (this.transitioning && this.transitionAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.transitionAlpha;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      ctx.restore();
    }
  }

  handleClick(x: number, y: number): void {
    if (this.transitioning) return;
    this.currentScreen?.handleClick(x, y);
  }

  handleKey(key: string): void {
    if (this.transitioning) return;
    this.currentScreen?.handleKey(key);
  }
}
