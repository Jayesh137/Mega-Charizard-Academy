# V5 Research-Driven Upgrade Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Mega Charizard Academy into a research-optimal, parent-impressing, enterprise-quality educational game using evidence from developmental psychology, educational research, and game design science.

**Architecture:** Upgrade all 5 skeletal systems to full implementations, expand content data with research-backed educational progressions, add a new Memory Match game mode, build longitudinal progress tracking with parent-facing analytics, and enhance game juice with variable-ratio reward scheduling.

**Tech Stack:** Svelte 5 (Runes), TypeScript, HTML5 Canvas, Web Audio API

---

## Research Foundation

### Sources Applied

1. **APA 2025**: Finger counting is a stepping stone to higher math (ages 4-6.5 → better addition by 7)
2. **Stanford DREME**: Pairing gestures with speech reinforces number sense
3. **Cluster RCT (Tandfonline 2021)**: Personalized adaptive games accelerate early math
4. **UoW 2026**: Board games boost math skills significantly
5. **Vygotsky ZPD**: Adaptive scaffolding must keep children in their zone of proximal development
6. **Variable-ratio reinforcement**: Most resistant to extinction, best for sustaining engagement
7. **Spaced repetition + interleaving**: Distributing practice over time with mixed problem types maximizes retention
8. **AAP Guidelines**: < 1 hour screen time for ages 2-5, with active adult participation
9. **NN/g Children's UX**: 2cm x 2cm minimum touch targets, 64px spacing, symbol-first UI
10. **Pale color palettes (2025)**: Higher achievement scores vs vivid designs
11. **Constructive feedback research**: Different voice types affect retention and emotional reactions
12. **Conceptual subitizing**: Dice/domino patterns help children subitize 4-6, supporting decomposition (2+2=4, 3+3=6)

---

## Phase 1: System Upgrades (skeletal → full implementations)

### Task 1: Upgrade Focus Weight System
**Files:** Modify `src/engine/systems/focus-weight.ts`

Currently 37 lines with static pools. Upgrade to:
- Dynamic weighting based on tracker performance data
- Interleave different skills (don't repeat same game twice in a row)
- Prioritize games where child is struggling
- Apply spaced repetition: revisit weak games after a gap
- Track which games each child has played this session

### Task 2: Upgrade Hint Ladder System
**Files:** Modify `src/engine/systems/hint-ladder.ts`

Currently 81 lines. Upgrade to:
- 5 distinct hint levels with clear escalation:
  - L0: Wait (fresh prompt, no hints)
  - L1: Voice repeat (say the prompt again)
  - L2: Visual pulse (correct answer glows/bounces)
  - L3: Pointer arrow (arrow points at correct answer)
  - L4: Auto-complete (show the answer, move on)
- Track hint usage per child for learning analytics
- Different escalation speeds: Owen (faster), Kian (slower)
- Emit events for visual hint rendering in game screens

### Task 3: Upgrade Evolution Manager
**Files:** Modify `src/engine/systems/evolution-manager.ts`

Currently 62 lines. Upgrade to:
- Variable charge amounts based on question difficulty
- Bonus charge for streaks (3+ correct = 1.5x charge)
- Emit typed evolution events with animation data
- Track evolution history for session report
- Combo multiplier that builds over consecutive correct answers

### Task 4: Upgrade Clip Manager
**Files:** Modify `src/engine/systems/clip-manager.ts`

Currently 35 lines. Upgrade to:
- Priority queue based on context (celebration level, streak count)
- Clip cooldown system (don't repeat within N clips)
- Category-specific selection strategies (celebration = rarer = more exciting)
- Variable-ratio clip triggers (not every correct answer, but unpredictable timing)
- Track clips shown for session analytics

### Task 5: Upgrade Session Limiter
**Files:** Modify `src/engine/systems/session-limiter.ts`

Currently 78 lines. Upgrade to:
- Engagement pulse tracking (correct rate, response time trends)
- Warning system at 80% of session time
- Gradual wind-down mode (fewer prompts, more celebration)
- Break suggestions based on engagement drop
- Session quality score (for parent report)
- AAP compliance tracking (time used vs recommended)

**Commit after Phase 1**

---

## Phase 2: Content Expansion

### Task 6: Expand Color Content
**Files:** Modify `src/content/colors.ts`

Add:
- 4 new colors: pink (#FF69B4), brown (#8B4513), white (#FFFFFF), black (#333333)
- Real-world color associations: {color: 'yellow', objects: ['banana', 'sun', 'Pikachu']}
- Color families for sorting: warm (red, orange, yellow) vs cool (blue, green, purple)
- More color patterns: ABCA, ABBC, growing complexity
- Color memory pairs for Memory Match game

### Task 7: Expand Counting Content
**Files:** Modify `src/content/counting.ts`

Add:
- Subitizing patterns for 6 (domino 3+3, dice 6)
- Ten-frames (2x5 grid patterns for numbers 1-10)
- Number words: mapping digit to word text ("THREE")
- More addition pairs up to sum of 10
- Doubles facts: 1+1, 2+2, 3+3, 4+4, 5+5
- Near-doubles: 2+3, 3+4, 4+5
- Number bonds for 8, 9, 10
- More comparison pairs with visual variety

### Task 8: Expand Letter/Phonics Content
**Files:** Modify `src/content/letters.ts`

Add:
- 6 new letters: E, G, H, I, N, O (bringing total to 16)
- Letter paths for all new letters
- More CVC words with short-E vowel: BED, RED, PEN, TEN, HEN, MET, SET, PET
- More CVC words with short-I: BIG, DIG, PIG, SIT, HIT, BIT, TIP, RIP
- Rhyme groups for -ED, -EN, -IG, -IT, -IP families
- Sight words for Kian: THE, AND, IS, IT, IN, A
- Pokemon-themed word associations for new letters

### Task 9: Expand Shape Content
**Files:** Modify `src/content/shapes.ts`

Add:
- 3 new shapes: rectangle, pentagon, crescent
- Shape properties: {sides: 3, name: 'triangle', canRoll: false}
- More pattern sequences including new shapes
- Shape-color combinations for compound challenges

### Task 10: Expand Voice Lines
**Files:** Modify `src/config/ash-lines.ts`

Add voice line definitions for:
- New color prompts (pink, brown, white, black)
- New letter prompts (E, G, H, I, N, O)
- Number words ("That's THREE!")
- Ten-frame prompts
- Doubles celebration ("Double FIVE! That's TEN!")
- New shape prompts (rectangle, pentagon, crescent)
- Sight word prompts
- Memory match prompts
- More celebration variety (total 12 correct reactions)
- More encouragement variety (total 8 wrong reactions)
- Streak announcements ("THREE in a row!")
- Session progress ("Halfway there!")

### Task 11: Expand Video Clips
**Files:** Modify `src/config/clips.ts`

Add clip definitions for:
- More Charizard battles (vs Entei, vs Blaziken, vs Dragonite, vs Magmar)
- Charizard training montage moments
- More calm clips (Charizard Charicific Valley, Charmander campfire extended)
- Pikachu celebration clips for variety
- Team Rocket moments (comic relief between games)
- More evolution clips (Bulbasaur/Squirtle chains)
- Ash badge celebration moments

**Commit after Phase 2**

---

## Phase 3: Adaptive Tracker Enhancement

### Task 12: Enhanced Tracker with Longitudinal History
**Files:** Modify `src/state/tracker.svelte.ts`, `src/state/settings.svelte.ts`

Upgrade tracker to:
- Store session history in localStorage (last 10 sessions)
- Per-child skill progression: {domain, accuracy, trend}
- Response time tracking (time from prompt to answer)
- Mastery levels per concept: learning → practicing → mastered
- ZPD estimation based on accuracy + response time
- Export data for parent report

### Task 13: Add Progress Persistence
**Files:** Modify `src/state/settings.svelte.ts`

Add to persisted settings:
- sessionHistory: last 10 sessions with stats
- conceptMastery: per-child, per-concept mastery levels
- totalPlayTime: cumulative minutes
- lettersLearned, numbersLearned, colorsLearned counts
- lastPlayedDate for tracking streaks

**Commit after Phase 3**

---

## Phase 4: Parent-Impressing Features

### Task 14: Enhanced Learning Report in Finale
**Files:** Modify `src/engine/screens/finale.ts`

Upgrade the finale screen to show:
- Visual accuracy bars per child (animated fill)
- Skills practiced with star ratings
- Concepts mastered vs still learning
- Session duration (with AAP guideline note)
- Research citations explaining why each game helps
- "What to practice at home" suggestions
- Comparison to last session (if available)
- Beautiful canvas-rendered report cards

### Task 15: Parent Dashboard Hotkey
**Files:** Create `src/engine/screens/parent-dashboard.ts`, modify `src/engine/input.ts`, `src/state/types.ts`

Press 'D' for parent dashboard showing:
- Longitudinal progress charts (last 10 sessions)
- Per-child mastery grids (color-coded: red→yellow→green)
- Research methodology explanation
- Time played vs AAP guidelines
- Recommendation engine: "Focus on X next session"
- Exportable summary (copy to clipboard)

**Commit after Phase 4**

---

## Phase 5: New Game Mode — Memory Match

### Task 16: Memory Match Game
**Files:** Create `src/engine/games/memory-match.ts`, modify `src/state/types.ts`, `src/engine/systems/focus-weight.ts`

Research basis: Working memory is the #1 predictor of academic success.

Memory Match game:
- Grid of face-down cards (2x3 for Owen, 3x4 for Kian)
- Cards show colors, numbers, shapes, or Pokemon
- Flip two cards per turn, find matching pairs
- Canvas-rendered card flip animation
- Tracks working memory improvement over sessions
- Pokemon-themed card backs (Pokeball pattern)
- Sound effects: card flip, match found, no match
- Cross-game reinforcement (matching colors reinforces color knowledge)
- Difficulty scales: fewer cards → more cards, basic → complex content

**Commit after Phase 5**

---

## Phase 6: Game Juice & Variable-Ratio Rewards

### Task 17: Variable-Ratio Reward System
**Files:** Create `src/engine/systems/reward-scheduler.ts`

Implement research-backed variable-ratio reinforcement:
- Not every correct answer gets the same celebration
- Small reward (chime + star): 60% of correct answers
- Medium reward (celebration + voice clip): 25%
- Big reward (video clip + confetti + screen effects): 10%
- Mega reward (evolution charge + full celebration): 5%
- Streak bonuses scale up the reward tier
- First correct answer after struggle always gets medium+

### Task 18: Enhanced Celebration System
**Files:** Modify `src/components/CelebrationOverlay.svelte`, `src/engine/entities/particles.ts`

Add:
- Confetti particle type (multi-colored rectangles that flutter)
- Star burst animation (stars fly out from center)
- Screen flash with Pokemon-themed colors
- Streak counter display ("3 in a row!")
- Combo text animation ("SUPER!", "MEGA!", "ULTRA!")
- Variable screen shake intensity based on reward tier
- Celebration messages expand to 24 (from 16)

### Task 19: Enhanced SFX
**Files:** Modify `src/engine/audio.ts`

Add new synthesized sounds:
- card-flip: Quick paper flip sound
- card-match: Harmonious two-note chord
- card-mismatch: Soft descending tone
- power-surge: Rising oscillator with harmonics
- mega-celebration: Extended fanfare with multiple instruments
- combo-hit: Pitched chime that rises with combo count
- session-start: Warm welcoming tone sequence
- achievement-unlock: Special distinctive jingle

**Commit after Phase 6**

---

## Phase 7: Educational Optimization

### Task 20: Optimize Game Cycles Based on Research
**Files:** Modify all game files in `src/engine/games/`

Apply research findings to each game:

**Fireball Count (Math):**
- Owen: count (1-3) → subitize (dice patterns) → ten-frame recognition
- Kian: count (1-10) → addition (fingers visual) → doubles → number bonds → comparison
- Add ten-frame visual mode (2x5 grid, research-backed for number sense)
- Finger counting hand visual persists longer (research: 37%→77% improvement)

**Flame Colors:**
- Owen: find color → color objects ("What color is the banana?") → sorting → memory
- Kian: find → mixing → shades → patterns → color words ("spell RED")
- Add real-world object associations per color

**Phonics Arena:**
- Owen: letter recognition → letter sounds (minimal)
- Kian: letter → phonics → CVC words → sight words → rhyming
- Add vowel sounds (short A, E, I) as separate sub-mode
- Scaffold CVC: show word → sound out → build from letters

**Evolution Tower (Shapes):**
- Owen: shape recognition → big/small comparison
- Kian: shape → size → pattern → combo → properties ("How many sides?")
- Add shape properties mode for Kian

**Evolution Challenge:**
- Both: recognition → ordering → reverse (what evolves INTO X?)
- Add all 4 chains: Charmander, Pikachu, Bulbasaur, Squirtle
- Add "type matchup" bonus questions for Kian

**Commit after Phase 7**

---

## Verification

After all phases:
1. Run `npm run check` — zero errors
2. Run `npm run build` — clean build
3. Manual test: full session flow (loading → opening → hub → games → finale)
4. Verify parent dashboard (press D)
5. Verify session limiter and timeout still work
6. Verify both children's adaptive difficulty works correctly
