// src/state/session.svelte.ts
import type { TurnType, ScreenName, GameName, EvolutionStage } from './types';

function createSession() {
  let currentScreen = $state<ScreenName>('loading');
  let currentTurn = $state<TurnType>('owen');
  let turnOverride = $state<TurnType | null>(null);
  let turnsCompleted = $state(0);
  let currentGame = $state<GameName | null>(null);
  let activitiesCompleted = $state(0);
  let gemsCollected = $state<string[]>([]);
  let resetExtended = $state(false);
  let currentFps = $state(60);
  let audioUnlocked = $state(false);
  let assetsLoaded = $state(false);
  let showHints = $state(false);      // uncle assist: highlight correct answer
  let showDebug = $state(false);      // uncle assist: debug overlay
  let flameCharge = $state(0);        // 0-100
  let flameChargeMax = $state(100);
  let lastThreshold = $state(0);      // tracks which threshold was last triggered
  let evolutionStage = $state<EvolutionStage>('charmander');
  let evolutionMeter = $state(0);        // 0-100
  let evolutionMeterMax = $state(100);
  let gamesCompleted = $state(0);         // 0-4 this session
  let owenStars = $state(0);
  let kianStars = $state(0);

  // Learning report tracking
  let sessionStartTime = $state(Date.now());
  let skillsPracticed = $state<Record<string, { owen: number; kian: number }>>({});
  let conceptsCorrect = $state<Record<string, { owen: string[]; kian: string[] }>>({});
  let conceptsStruggled = $state<Record<string, { owen: string[]; kian: string[] }>>({});
  let totalAnswersOwen = $state(0);
  let totalAnswersKian = $state(0);
  let correctAnswersOwen = $state(0);
  let correctAnswersKian = $state(0);

  // Load lifetime stars from localStorage
  let owenLifetimeStars = $state(parseInt(localStorage.getItem('owenLifetimeStars') || '0'));
  let kianLifetimeStars = $state(parseInt(localStorage.getItem('kianLifetimeStars') || '0'));

  function reset() {
    currentScreen = 'loading';
    currentTurn = 'owen';
    turnOverride = null;
    turnsCompleted = 0;
    currentGame = null;
    activitiesCompleted = 0;
    gemsCollected = [];
    resetExtended = false;
    showHints = false;
    showDebug = false;
    flameCharge = 0;
    flameChargeMax = 100;
    lastThreshold = 0;
    evolutionStage = 'charmander';
    evolutionMeter = 0;
    evolutionMeterMax = 100;
    gamesCompleted = 0;
    owenStars = 0;
    kianStars = 0;

    // Reset learning report tracking
    sessionStartTime = Date.now();
    skillsPracticed = {};
    conceptsCorrect = {};
    conceptsStruggled = {};
    totalAnswersOwen = 0;
    totalAnswersKian = 0;
    correctAnswersOwen = 0;
    correctAnswersKian = 0;
  }

  function nextTurn(): TurnType {
    if (turnOverride) {
      const override = turnOverride;
      turnOverride = null;
      return override;
    }
    turnsCompleted++;
    return turnsCompleted % 2 === 1 ? 'owen' : 'kian';
  }

  return {
    get currentScreen() { return currentScreen; },
    set currentScreen(v: ScreenName) { currentScreen = v; },
    get currentTurn() { return currentTurn; },
    set currentTurn(v: TurnType) { currentTurn = v; },
    get turnOverride() { return turnOverride; },
    set turnOverride(v: TurnType | null) { turnOverride = v; },
    get currentGame() { return currentGame; },
    set currentGame(v: GameName | null) { currentGame = v; },
    get activitiesCompleted() { return activitiesCompleted; },
    set activitiesCompleted(v: number) { activitiesCompleted = v; },
    get gemsCollected() { return gemsCollected; },
    set gemsCollected(v: string[]) { gemsCollected = v; },
    get resetExtended() { return resetExtended; },
    set resetExtended(v: boolean) { resetExtended = v; },
    get showHints() { return showHints; },
    set showHints(v: boolean) { showHints = v; },
    get showDebug() { return showDebug; },
    set showDebug(v: boolean) { showDebug = v; },
    get currentFps() { return currentFps; },
    set currentFps(v: number) { currentFps = v; },
    get audioUnlocked() { return audioUnlocked; },
    set audioUnlocked(v: boolean) { audioUnlocked = v; },
    get assetsLoaded() { return assetsLoaded; },
    set assetsLoaded(v: boolean) { assetsLoaded = v; },
    get flameCharge() { return flameCharge; },
    set flameCharge(v: number) { flameCharge = Math.max(0, Math.min(v, flameChargeMax)); },
    get flameChargeMax() { return flameChargeMax; },
    set flameChargeMax(v: number) { flameChargeMax = v; },
    get lastThreshold() { return lastThreshold; },
    set lastThreshold(v: number) { lastThreshold = v; },
    get evolutionStage() { return evolutionStage; },
    set evolutionStage(v: EvolutionStage) { evolutionStage = v; },
    get evolutionMeter() { return evolutionMeter; },
    set evolutionMeter(v: number) { evolutionMeter = Math.max(0, Math.min(v, evolutionMeterMax)); },
    get evolutionMeterMax() { return evolutionMeterMax; },
    set evolutionMeterMax(v: number) { evolutionMeterMax = v; },
    get gamesCompleted() { return gamesCompleted; },
    set gamesCompleted(v: number) { gamesCompleted = Math.max(0, v); },
    get owenStars() { return owenStars; },
    set owenStars(v: number) { owenStars = Math.max(0, v); },
    get kianStars() { return kianStars; },
    set kianStars(v: number) { kianStars = Math.max(0, v); },
    get owenLifetimeStars() { return owenLifetimeStars; },
    get kianLifetimeStars() { return kianLifetimeStars; },
    awardStar(count: number = 1) {
      const turn = this.currentTurn;
      if (turn === 'kian') {
        kianStars += count;
        kianLifetimeStars += count;
        localStorage.setItem('kianLifetimeStars', String(kianLifetimeStars));
      } else {
        owenStars += count; // team turns default to owen
        owenLifetimeStars += count;
        localStorage.setItem('owenLifetimeStars', String(owenLifetimeStars));
      }
    },
    // Learning report getters
    get sessionStartTime() { return sessionStartTime; },
    get skillsPracticed() { return skillsPracticed; },
    get conceptsCorrect() { return conceptsCorrect; },
    get conceptsStruggled() { return conceptsStruggled; },
    get totalAnswersOwen() { return totalAnswersOwen; },
    get totalAnswersKian() { return totalAnswersKian; },
    get correctAnswersOwen() { return correctAnswersOwen; },
    get correctAnswersKian() { return correctAnswersKian; },
    get sessionDurationMinutes(): number {
      return Math.round((Date.now() - sessionStartTime) / 60000);
    },
    get owenAccuracy(): number {
      return totalAnswersOwen === 0 ? 0 : Math.round((correctAnswersOwen / totalAnswersOwen) * 100);
    },
    get kianAccuracy(): number {
      return totalAnswersKian === 0 ? 0 : Math.round((correctAnswersKian / totalAnswersKian) * 100);
    },

    // Learning report methods
    recordSkillPractice(domain: string): void {
      if (!skillsPracticed[domain]) {
        skillsPracticed[domain] = { owen: 0, kian: 0 };
      }
      const turn = currentTurn;
      if (turn === 'kian') {
        skillsPracticed[domain].kian++;
      } else {
        skillsPracticed[domain].owen++;
      }
    },
    recordCorrectConcept(domain: string, concept: string): void {
      if (!conceptsCorrect[domain]) {
        conceptsCorrect[domain] = { owen: [], kian: [] };
      }
      const turn = currentTurn;
      const list = turn === 'kian' ? conceptsCorrect[domain].kian : conceptsCorrect[domain].owen;
      if (!list.includes(concept)) {
        list.push(concept);
      }
    },
    recordStruggledConcept(domain: string, concept: string): void {
      if (!conceptsStruggled[domain]) {
        conceptsStruggled[domain] = { owen: [], kian: [] };
      }
      const turn = currentTurn;
      const list = turn === 'kian' ? conceptsStruggled[domain].kian : conceptsStruggled[domain].owen;
      if (!list.includes(concept)) {
        list.push(concept);
      }
    },
    recordAnswer(correct: boolean): void {
      const turn = currentTurn;
      if (turn === 'kian') {
        totalAnswersKian++;
        if (correct) correctAnswersKian++;
      } else {
        totalAnswersOwen++;
        if (correct) correctAnswersOwen++;
      }
    },

    nextTurn,
    reset,
  };
}

export const session = createSession();
