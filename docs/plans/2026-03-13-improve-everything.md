# Improve Everything — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Systematically fix all bugs, remove dead code, improve code quality, expand educational content, add screen transitions, and polish the entire game.

**Architecture:** Incremental improvements across 7 phases. Each phase is independent and committable. No structural rewrites — improve what exists.

**Tech Stack:** Svelte 5 (Runes) + TypeScript + HTML5 Canvas + Web Audio API

---

## Phase 1: Bug Fixes (Critical)

### Task 1.1: Fix undefined `word` variable in fireball-count overshoot

**Files:**
- Modify: `src/engine/games/fireball-count.ts:527`

**Step 1:** Fix the bug — replace undefined `word` with `NUMBER_WORDS[this.targetNumber]`

At line 527, change:
```typescript
this.overshootText = `Oops! We needed ${word}!`;
```
to:
```typescript
this.overshootText = `Oops! We needed ${NUMBER_WORDS[this.targetNumber]}!`;
```

Verify `NUMBER_WORDS` is already imported/available in scope (it's defined at the top of the file).

**Step 2:** Run `npx tsc --noEmit` to verify no TypeScript errors.

**Step 3:** Commit: `fix: use NUMBER_WORDS for overshoot text in fireball-count`

---

### Task 1.2: Fix game-loop hardcoded canvas dimensions

**Files:**
- Modify: `src/engine/game-loop.ts:58`

**Step 1:** At line 58, change:
```typescript
this.ctx.clearRect(0, 0, 1920, 1080);
```
to:
```typescript
this.ctx.clearRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
```

Ensure `DESIGN_WIDTH` and `DESIGN_HEIGHT` are imported from `../config/constants`. Check the existing imports at top of file — add to the import if not already there.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `fix: use DESIGN_WIDTH/HEIGHT constants in game loop canvas clear`

---

### Task 1.3: Fix voice.ts bypassing Web Audio API gain nodes

**Files:**
- Modify: `src/engine/voice.ts`

**Step 1:** The `tryPlayFile` method at ~line 45 creates `new Audio(path)` which bypasses the AudioManager's gain nodes. Refactor to use the AudioManager instead:

Replace the `tryPlayFile` method:
```typescript
private async tryPlayFile(path: string): Promise<boolean> {
  try {
    const audio = new Audio(path);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}
```

with:
```typescript
private async tryPlayFile(path: string): Promise<boolean> {
  try {
    await this.audio.loadBuffer(path);
    this.audio.playSfx(path, { volume: 1.0 });
    return true;
  } catch {
    return false;
  }
}
```

Note: Check that `this.audio` reference exists and has `loadBuffer`/`playSfx` methods. The AudioManager is passed in constructor. The voice gain node will handle volume. If `playSfx` doesn't route through voice gain, use `playVoice` path instead — check audio.ts to pick the right method that routes through the voice gain node.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Test by running `npm run dev` and verifying Ash voice lines still play.

**Step 4:** Commit: `fix: route voice playback through Web Audio API gain nodes`

---

## Phase 2: Dead Code & Cleanup

### Task 2.1: Remove dead videos.ts

**Files:**
- Delete: `src/config/videos.ts`

**Step 1:** Verify no imports reference this file:
```bash
grep -r "videos" src/ --include="*.ts" --include="*.svelte"
```
Confirm only `videos.ts` itself appears (no imports from other files). If any imports exist, remove them too.

**Step 2:** Delete the file.

**Step 3:** Run `npx tsc --noEmit`.

**Step 4:** Commit: `chore: remove dead videos.ts (superseded by clips.ts)`

---

### Task 2.2: Fix ScreenName type — remove unused 'game' variant

**Files:**
- Modify: `src/state/types.ts`

**Step 1:** Check if `'game'` is used anywhere:
```bash
grep -rn "'game'" src/ --include="*.ts" --include="*.svelte"
```

If `'game'` is only in the type definition and never used as a value, remove it. Change:
```typescript
export type ScreenName = 'loading' | 'opening' | 'hub' | 'game' | 'calm-reset' | 'finale';
```
to:
```typescript
export type ScreenName = 'loading' | 'opening' | 'hub' | 'calm-reset' | 'finale'
  | GameName;  // games register under their own names
```

If `'game'` IS used as a value somewhere, keep it and add the GameName union too. Import GameName if needed.

**Step 2:** Run `npx tsc --noEmit` and fix any type errors.

**Step 3:** Commit: `chore: fix ScreenName type to include actual game names`

---

## Phase 3: Per-Child Adaptive Tracking

### Task 3.1: Add per-child tracker separation

**Files:**
- Modify: `src/state/tracker.svelte.ts`

**Step 1:** Refactor the tracker to maintain separate state per child. The current `createTracker()` returns a single global tracker. Change to store per-child data:

Add a child-keyed wrapper around the existing logic:
```typescript
function createChildTracker() {
  // ... existing rolling window, concepts map, promptCounter logic (move here)
}

function createTracker() {
  let trackers: Record<string, ReturnType<typeof createChildTracker>> = {
    owen: createChildTracker(),
    kian: createChildTracker(),
  };

  function getActive(): ReturnType<typeof createChildTracker> {
    const turn = session.currentTurn;
    const key = turn === 'team' ? 'owen' : turn; // team defaults to owen
    return trackers[key];
  }

  return {
    recordAnswer(concept: string, domain: string, correct: boolean) {
      getActive().recordAnswer(concept, domain, correct);
    },
    getDifficultyAdjustment(): number {
      return getActive().getDifficultyAdjustment();
    },
    getRepeatConcepts(domain: string): string[] {
      return getActive().getRepeatConcepts(domain);
    },
    markRepeated(concept: string, domain: string) {
      getActive().markRepeated(concept, domain);
    },
    get recentCorrectRate(): number {
      return getActive().recentCorrectRate;
    },
    reset() {
      trackers.owen = createChildTracker();
      trackers.kian = createChildTracker();
    },
  };
}
```

The public API stays identical — callers don't change. The tracker internally routes to the correct child based on `session.currentTurn`.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `feat: per-child adaptive difficulty tracking`

---

## Phase 4: Expand Educational Content

### Task 4.1: Expand phonics to 10 letters with data in content/letters.ts

**Files:**
- Modify: `src/content/letters.ts`
- Modify: `src/engine/games/phonics-arena.ts`

**Step 1:** Add 6 more letters to `starterLetters` in `content/letters.ts`. Choose letters that are phonetically distinct and useful for 2-4 year olds:

```typescript
// Add after existing 4 letters:
{ letter: 'M', word: 'Mega', phonicsSound: 'mm', icon: 'star', voiceFile: 'letter-m', starCount: { little: 5, big: 8 } },
{ letter: 'P', word: 'Pikachu', phonicsSound: 'pp', icon: 'flame', voiceFile: 'letter-p', starCount: { little: 5, big: 9 } },
{ letter: 'T', word: 'Thunder', phonicsSound: 'tt', icon: 'star', voiceFile: 'letter-t', starCount: { little: 6, big: 9 } },
{ letter: 'R', word: 'Raichu', phonicsSound: 'rr', icon: 'flame', voiceFile: 'letter-r', starCount: { little: 5, big: 8 } },
{ letter: 'D', word: 'Dragon', phonicsSound: 'dd', icon: 'star', voiceFile: 'letter-d', starCount: { little: 6, big: 10 } },
{ letter: 'A', word: 'Ash', phonicsSound: 'ah', icon: 'character', voiceFile: 'letter-a', starCount: { little: 5, big: 8 } },
```

**Step 2:** Add letter constellation paths for M, P, T, R, D, A in the `letterPaths` export. Design simple, recognizable strokes using normalized (0-1) coordinates. Keep paths simple (5-8 points per letter):

```typescript
M: [
  { x: 0.15, y: 0.9 }, { x: 0.15, y: 0.1 }, { x: 0.5, y: 0.55 },
  { x: 0.85, y: 0.1 }, { x: 0.85, y: 0.9 },
],
P: [
  { x: 0.2, y: 0.9 }, { x: 0.2, y: 0.1 }, { x: 0.7, y: 0.1 },
  { x: 0.8, y: 0.25 }, { x: 0.7, y: 0.45 }, { x: 0.2, y: 0.45 },
],
T: [
  { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.1 },
  { x: 0.5, y: 0.9 },
],
R: [
  { x: 0.2, y: 0.9 }, { x: 0.2, y: 0.1 }, { x: 0.7, y: 0.1 },
  { x: 0.8, y: 0.25 }, { x: 0.7, y: 0.45 }, { x: 0.2, y: 0.45 },
  { x: 0.8, y: 0.9 },
],
D: [
  { x: 0.2, y: 0.9 }, { x: 0.2, y: 0.1 }, { x: 0.6, y: 0.1 },
  { x: 0.85, y: 0.5 }, { x: 0.6, y: 0.9 }, { x: 0.2, y: 0.9 },
],
A: [
  { x: 0.1, y: 0.9 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.9 },
  { x: 0.7, y: 0.55 }, { x: 0.3, y: 0.55 },
],
```

**Step 3:** Move hardcoded PHONICS data from phonics-arena.ts (lines 70-75) into content/letters.ts. Add a `phonicsData` field to `LetterItem` or create a separate export:

```typescript
export const PHONICS: Record<string, { sound: string; wrongSound: string; wordExample: string }> = {
  C: { sound: 'Cuh', wrongSound: 'Sss', wordExample: 'Charizard' },
  F: { sound: 'Fff', wrongSound: 'Buh', wordExample: 'Fire' },
  S: { sound: 'Sss', wrongSound: 'Fff', wordExample: 'Star' },
  B: { sound: 'Buh', wrongSound: 'Duh', wordExample: 'Blue' },
  M: { sound: 'Mmm', wrongSound: 'Nnn', wordExample: 'Mega' },
  P: { sound: 'Puh', wrongSound: 'Buh', wordExample: 'Pikachu' },
  T: { sound: 'Tuh', wrongSound: 'Duh', wordExample: 'Thunder' },
  R: { sound: 'Rrr', wrongSound: 'Lll', wordExample: 'Raichu' },
  D: { sound: 'Duh', wrongSound: 'Tuh', wordExample: 'Dragon' },
  A: { sound: 'Ahh', wrongSound: 'Ehh', wordExample: 'Ash' },
};
```

**Step 4:** Update phonics-arena.ts to import `PHONICS` and `starterLetters` from `content/letters.ts` instead of using the hardcoded local constant. Remove the local PHONICS definition (lines 70-75).

**Step 5:** Run `npx tsc --noEmit`.

**Step 6:** Commit: `feat: expand phonics to 10 letters, centralize phonics data`

---

### Task 4.2: Add Ash voice line entries for new letters

**Files:**
- Modify: `src/config/ash-lines.ts`

**Step 1:** Add voice line entries for the 6 new letters. These will use TTS fallback since MP3s don't exist yet — the system handles this gracefully:

```typescript
// Add to ASH_LINES:
letter_m: [{ id: 'letter-m-1', text: "M! M for Mega!", file: 'letter-m-1.mp3', category: 'letter' }],
letter_p: [{ id: 'letter-p-1', text: "P! P for Pikachu!", file: 'letter-p-1.mp3', category: 'letter' }],
letter_t: [{ id: 'letter-t-1', text: "T! T for Thunder!", file: 'letter-t-1.mp3', category: 'letter' }],
letter_r: [{ id: 'letter-r-1', text: "R! R for Raichu!", file: 'letter-r-1.mp3', category: 'letter' }],
letter_d: [{ id: 'letter-d-1', text: "D! D for Dragon!", file: 'letter-d-1.mp3', category: 'letter' }],
letter_a: [{ id: 'letter-a-1', text: "A! A for Ash!", file: 'letter-a-1.mp3', category: 'letter' }],
phonics_m: [{ id: 'phonics-m-1', text: "Mmm! Like Mega!", file: 'phonics-m-1.mp3', category: 'letter' }],
phonics_p: [{ id: 'phonics-p-1', text: "Puh! Like Pikachu!", file: 'phonics-p-1.mp3', category: 'letter' }],
phonics_t: [{ id: 'phonics-t-1', text: "Tuh! Like Thunder!", file: 'phonics-t-1.mp3', category: 'letter' }],
phonics_r: [{ id: 'phonics-r-1', text: "Rrr! Like Raichu!", file: 'phonics-r-1.mp3', category: 'letter' }],
phonics_d: [{ id: 'phonics-d-1', text: "Duh! Like Dragon!", file: 'phonics-d-1.mp3', category: 'letter' }],
phonics_a: [{ id: 'phonics-a-1', text: "Ahh! Like Ash!", file: 'phonics-a-1.mp3', category: 'letter' }],
```

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `feat: add Ash voice line entries for 6 new letters`

---

### Task 4.3: Add shape voice lines for heart and oval

**Files:**
- Modify: `src/config/ash-lines.ts`

**Step 1:** The shapes content includes heart and oval but ash-lines only has entries for circle, square, triangle, star, diamond, hexagon. Add:

```typescript
shape_heart: [{ id: 'shape-heart-1', text: "Heart! Find the heart!", file: 'shape-heart-1.mp3', category: 'shape' }],
shape_oval: [{ id: 'shape-oval-1', text: "Oval! Find the oval!", file: 'shape-oval-1.mp3', category: 'shape' }],
```

**Step 2:** Commit: `feat: add Ash voice lines for heart and oval shapes`

---

## Phase 5: Screen Transitions

### Task 5.1: Add fade transition support to ScreenManager

**Files:**
- Modify: `src/engine/screen-manager.ts`

**Step 1:** Add a simple crossfade transition. The ScreenManager should render a black overlay that fades in, swap the screen, then fade out. Add transition state:

```typescript
private transitioning = false;
private transitionAlpha = 0;
private transitionPhase: 'out' | 'in' = 'out';
private pendingScreen: string | null = null;
private transitionDuration = 0.3; // seconds per phase (0.3s fade out + 0.3s fade in = 0.6s total)
```

**Step 2:** Modify `goTo()` to trigger transition instead of instant swap:

```typescript
goTo(name: string) {
  if (this.transitioning) return;
  if (!this.currentScreen) {
    // First screen — no transition needed
    this._swapScreen(name);
    return;
  }
  this.transitioning = true;
  this.transitionPhase = 'out';
  this.transitionAlpha = 0;
  this.pendingScreen = name;
}

private _swapScreen(name: string) {
  if (this.currentScreen) this.currentScreen.exit();
  this.events.emit({ type: 'hide-prompt' });
  this.events.emit({ type: 'hide-banner' });
  this.events.emit({ type: 'hide-subtitle' });
  const screen = this.screens.get(name);
  if (!screen) return;
  this.currentScreen = screen;
  screen.enter(this.gameContext);
  this.events.emit({ type: 'screen-changed', screen: name });
}
```

**Step 3:** Update `update()` to handle transition timing:

```typescript
update(dt: number) {
  this.tweens.update(dt);

  if (this.transitioning) {
    const speed = 1 / this.transitionDuration;
    if (this.transitionPhase === 'out') {
      this.transitionAlpha = Math.min(1, this.transitionAlpha + dt * speed);
      if (this.transitionAlpha >= 1) {
        this._swapScreen(this.pendingScreen!);
        this.transitionPhase = 'in';
      }
    } else {
      this.transitionAlpha = Math.max(0, this.transitionAlpha - dt * speed);
      if (this.transitionAlpha <= 0) {
        this.transitioning = false;
        this.pendingScreen = null;
      }
    }
  }

  if (this.currentScreen) this.currentScreen.update(dt);
}
```

**Step 4:** Update `render()` to draw transition overlay:

```typescript
render(ctx: CanvasRenderingContext2D) {
  if (this.currentScreen) this.currentScreen.render(ctx);

  if (this.transitioning && this.transitionAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = this.transitionAlpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.restore();
  }
}
```

Import `DESIGN_WIDTH`, `DESIGN_HEIGHT` from constants.

**Step 5:** Run `npx tsc --noEmit`.

**Step 6:** Run `npm run dev` and verify transitions work between screens.

**Step 7:** Commit: `feat: add fade-to-black screen transitions`

---

### Task 5.2: Add tween cancellation support

**Files:**
- Modify: `src/engine/utils/tween.ts`

**Step 1:** Add a `cancel()` method to the `Tween` class so games can stop animations on screen exit:

```typescript
cancel() {
  this.done = true;
}
```

**Step 2:** Add `cancelAll` convenience to TweenManager (alias for `clear` but more semantic):

No change needed — `clear()` already exists. But ensure `clear()` properly marks tweens as done before clearing:

```typescript
clear() {
  for (const t of this.tweens) t.done = true;
  this.tweens = [];
}
```

**Step 3:** Run `npx tsc --noEmit`.

**Step 4:** Commit: `feat: add tween cancellation support`

---

## Phase 6: Code Quality & Polish

### Task 6.1: Add validation guards to session state

**Files:**
- Modify: `src/state/session.svelte.ts`

**Step 1:** Add clamping to the setters that need bounds protection:

For `flameCharge` setter:
```typescript
set flameCharge(v: number) { flameCharge = Math.max(0, Math.min(v, flameChargeMax)); }
```

For `evolutionMeter` setter:
```typescript
set evolutionMeter(v: number) { evolutionMeter = Math.max(0, Math.min(v, evolutionMeterMax)); }
```

For `missCount` setter:
```typescript
set missCount(v: number) { missCount = Math.max(0, v); }
```

For `gamesCompleted` setter:
```typescript
set gamesCompleted(v: number) { gamesCompleted = Math.max(0, v); }
```

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `fix: add validation guards to session state setters`

---

### Task 6.2: Cache VoiceSystem instance in hub screen

**Files:**
- Modify: `src/engine/screens/hub.ts`

**Step 1:** Find where `new VoiceSystem(audio)` is called multiple times (likely in a `getVoice()` helper). Cache it as a class property:

```typescript
private voice: VoiceSystem | null = null;

private getVoice(): VoiceSystem | null {
  if (!this.gameContext?.audio) return null;
  if (!this.voice) {
    this.voice = new VoiceSystem(this.gameContext.audio);
  }
  return this.voice;
}
```

Clear on exit:
```typescript
exit() {
  this.voice = null;
  // ... existing cleanup
}
```

**Step 2:** Apply same pattern to any other screens that create VoiceSystem per-call (check calm-reset.ts, finale.ts).

**Step 3:** Run `npx tsc --noEmit`.

**Step 4:** Commit: `perf: cache VoiceSystem instances instead of recreating per call`

---

### Task 6.3: Add resize listener for responsive canvas

**Files:**
- Modify: `src/components/GameCanvas.svelte`

**Step 1:** Find the `onMount` section. There should already be a resize handler or at least `setupCanvas` call. Ensure there's a proper debounced resize listener:

```typescript
let resizeTimer: number;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    setupCanvas(canvasEl);
  }, 150);
}
window.addEventListener('resize', handleResize);
```

And in cleanup:
```typescript
window.removeEventListener('resize', handleResize);
```

If a resize listener already exists, verify it debounces properly and calls `setupCanvas`.

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `fix: add debounced window resize handler for canvas`

---

### Task 6.4: Improve ScreenManager circular reference

**Files:**
- Modify: `src/engine/screen-manager.ts`
- Modify: `src/components/GameCanvas.svelte`

**Step 1:** Instead of the fragile `(screenManager as any).gameContext.screenManager = screenManager` pattern in GameCanvas, pass `screenManager` via a setter:

In `screen-manager.ts`, add:
```typescript
setScreenManagerRef(sm: ScreenManager) {
  this.gameContext.screenManager = sm;
}
```

In `GameCanvas.svelte`, replace the `as any` cast with:
```typescript
screenManager.setScreenManagerRef(screenManager);
```

**Step 2:** Run `npx tsc --noEmit`.

**Step 3:** Commit: `refactor: clean up ScreenManager circular reference with setter`

---

## Phase 7: Visual Polish

### Task 7.1: Add particle trail to screen transitions

**Files:**
- Modify: `src/engine/screen-manager.ts`

**Step 1:** During the fade transition, spawn subtle blue particles from the center for visual flair. This requires access to the particle pool. In the `update()` transition logic, during the 'out' phase:

```typescript
if (this.transitioning && this.transitionPhase === 'out' && this.transitionAlpha > 0.3) {
  const pool = getActivePool();
  if (pool && Math.random() < 0.4) {
    pool.spawn({
      x: DESIGN_WIDTH / 2 + (Math.random() - 0.5) * 400,
      y: DESIGN_HEIGHT / 2 + (Math.random() - 0.5) * 200,
      vx: (Math.random() - 0.5) * 60,
      vy: -20 - Math.random() * 40,
      color: '#37B1E2',
      size: 2 + Math.random() * 3,
      lifetime: 0.6 + Math.random() * 0.4,
      gravity: 0,
      drag: 0.98,
      fadeOut: true,
      shrink: true,
    });
  }
}
```

Import `getActivePool` from particles and `DESIGN_WIDTH`/`DESIGN_HEIGHT` from constants.

**Step 2:** Render particles ABOVE the transition overlay so they're visible:

```typescript
render(ctx: CanvasRenderingContext2D) {
  if (this.currentScreen) this.currentScreen.render(ctx);

  if (this.transitioning && this.transitionAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = this.transitionAlpha;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    ctx.restore();

    // Particles render on top of fade
    const pool = getActivePool();
    if (pool) pool.render(ctx);
  }
}
```

**Step 3:** Run `npx tsc --noEmit`.

**Step 4:** Commit: `polish: add particle effects during screen transitions`

---

### Task 7.2: Improve celebration overlay with more dynamic effects

**Files:**
- Modify: `src/components/CelebrationOverlay.svelte`

**Step 1:** Enhance the hype celebration with a gold radial burst effect. Update the CSS keyframes:

Replace the existing `flashHype` animation with a more dramatic version:
```css
@keyframes flashHype {
  0% { background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.5), rgba(255,255,255,0.4)); opacity: 1; }
  30% { background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.3), rgba(255,107,53,0.2)); opacity: 0.8; }
  60% { background: radial-gradient(circle at 50% 50%, rgba(255,215,0,0.15), transparent); opacity: 0.5; }
  100% { background: transparent; opacity: 0; }
}
```

**Step 2:** Commit: `polish: enhance hype celebration with radial gold burst`

---

### Task 7.3: Add pulsing glow to hub "Start Training" button

**Files:**
- Modify: `src/engine/screens/hub.ts`

**Step 1:** Find the "Start Training!" button rendering. Enhance with a breathing glow effect that draws attention:

Add a pulsing shadow behind the button using the existing `time` accumulator:
```typescript
const glowIntensity = 0.3 + 0.2 * Math.sin(time * 3);
ctx.shadowColor = '#37B1E2';
ctx.shadowBlur = 15 + 10 * Math.sin(time * 3);
```

Ensure shadow is cleared after drawing: `ctx.shadowBlur = 0;`

**Step 2:** Commit: `polish: add breathing glow to hub Start Training button`

---

## Execution Order

1. **Phase 1** (Tasks 1.1-1.3): Bug fixes — do first, each is independent
2. **Phase 2** (Tasks 2.1-2.2): Dead code cleanup — independent of Phase 1
3. **Phase 3** (Task 3.1): Per-child tracking — independent
4. **Phase 4** (Tasks 4.1-4.3): Content expansion — independent
5. **Phase 5** (Tasks 5.1-5.2): Screen transitions — independent
6. **Phase 6** (Tasks 6.1-6.4): Code quality — independent of each other
7. **Phase 7** (Tasks 7.1-7.3): Visual polish — Task 7.1 depends on 5.1

**Parallelizable groups:**
- Phase 1 (all 3 tasks) can run in parallel
- Phase 2 (both tasks) can run in parallel
- Phase 4 (Tasks 4.1-4.3) are sequential (4.2 and 4.3 depend on 4.1's structure)
- Phase 6 (all 4 tasks) can run in parallel
- Phase 7 (all 3 tasks) can run in parallel (7.1 after 5.1 done)
