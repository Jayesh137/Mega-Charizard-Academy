// src/state/settings.svelte.ts
import type { Intensity } from './types';

const STORAGE_KEY = 'mca-settings';

/** Per-child mastery level for a concept */
export type MasteryLevel = 'learning' | 'practicing' | 'mastered';

/** Session history entry for longitudinal tracking */
export interface SessionHistoryEntry {
  date: string;                // ISO date
  durationMinutes: number;
  owenAccuracy: number;        // 0-100
  kianAccuracy: number;        // 0-100
  gamesPlayed: string[];
  owenStars: number;
  kianStars: number;
  skillsPracticed: string[];
}

/** Concept mastery entry */
export interface ConceptMasteryEntry {
  concept: string;
  domain: string;
  level: MasteryLevel;
  attempts: number;
  lastAccuracy: number;        // 0-100
  lastSeen: string;            // ISO date
}

interface PersistedSettings {
  littleTrainerName: string;
  bigTrainerName: string;
  intensity: Intensity;
  silentMode: boolean;
  showSubtitles: boolean;
  isFirstVisit: boolean;
  shapesUnlocked: string[];
  roundsCompleted: number;
  sessionsToday: number;
  lastSessionEnd: number;
  dailyResetDate: string;
  // --- New longitudinal tracking fields ---
  totalPlayTimeMinutes: number;
  sessionHistory: SessionHistoryEntry[];
  owenMastery: ConceptMasteryEntry[];
  kianMastery: ConceptMasteryEntry[];
  lettersLearned: number;
  numbersLearned: number;
  colorsLearned: number;
  shapesLearned: number;
  lastPlayedDate: string;
  playStreak: number;          // Consecutive days played
  totalPlayTimeToday: number;  // Minutes played today (resets daily)
}

function loadFromStorage(): PersistedSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults for backwards compatibility
      return { ...getDefaults(), ...parsed };
    }
  } catch { /* ignore */ }
  return getDefaults();
}

function getDefaults(): PersistedSettings {
  return {
    littleTrainerName: 'Owen',
    bigTrainerName: 'Kian',
    intensity: 'normal',
    silentMode: false,
    showSubtitles: false,
    isFirstVisit: true,
    shapesUnlocked: ['circle', 'square', 'triangle'],
    roundsCompleted: 0,
    sessionsToday: 0,
    lastSessionEnd: 0,
    dailyResetDate: '',
    totalPlayTimeMinutes: 0,
    sessionHistory: [],
    owenMastery: [],
    kianMastery: [],
    lettersLearned: 0,
    numbersLearned: 0,
    colorsLearned: 0,
    shapesLearned: 0,
    lastPlayedDate: '',
    playStreak: 0,
    totalPlayTimeToday: 0,
  };
}

function createSettings() {
  const initial = loadFromStorage();

  let littleTrainerName = $state(initial.littleTrainerName);
  let bigTrainerName = $state(initial.bigTrainerName);
  let intensity = $state<Intensity>(initial.intensity);
  let silentMode = $state(initial.silentMode);
  let showSubtitles = $state(initial.showSubtitles);
  let isFirstVisit = $state(initial.isFirstVisit);
  let shapesUnlocked = $state(initial.shapesUnlocked);
  let roundsCompleted = $state(initial.roundsCompleted);
  let sessionsToday = $state(initial.sessionsToday);
  let lastSessionEnd = $state(initial.lastSessionEnd);
  let dailyResetDate = $state(initial.dailyResetDate);
  let totalPlayTimeMinutes = $state(initial.totalPlayTimeMinutes);
  let sessionHistory = $state<SessionHistoryEntry[]>(initial.sessionHistory);
  let owenMastery = $state<ConceptMasteryEntry[]>(initial.owenMastery);
  let kianMastery = $state<ConceptMasteryEntry[]>(initial.kianMastery);
  let lettersLearned = $state(initial.lettersLearned);
  let numbersLearned = $state(initial.numbersLearned);
  let colorsLearned = $state(initial.colorsLearned);
  let shapesLearned = $state(initial.shapesLearned);
  let lastPlayedDate = $state(initial.lastPlayedDate);
  let playStreak = $state(initial.playStreak);
  let totalPlayTimeToday = $state(initial.totalPlayTimeToday);

  function persist() {
    const data: PersistedSettings = {
      littleTrainerName, bigTrainerName, intensity,
      silentMode, showSubtitles, isFirstVisit,
      shapesUnlocked, roundsCompleted,
      sessionsToday, lastSessionEnd, dailyResetDate,
      totalPlayTimeMinutes, sessionHistory,
      owenMastery, kianMastery,
      lettersLearned, numbersLearned, colorsLearned, shapesLearned,
      lastPlayedDate, playStreak, totalPlayTimeToday,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  return {
    get littleTrainerName() { return littleTrainerName; },
    set littleTrainerName(v: string) { littleTrainerName = v; persist(); },
    get bigTrainerName() { return bigTrainerName; },
    set bigTrainerName(v: string) { bigTrainerName = v; persist(); },
    get intensity() { return intensity; },
    set intensity(v: Intensity) { intensity = v; persist(); },
    get silentMode() { return silentMode; },
    set silentMode(v: boolean) { silentMode = v; persist(); },
    get showSubtitles() { return showSubtitles; },
    set showSubtitles(v: boolean) { showSubtitles = v; persist(); },
    get isFirstVisit() { return isFirstVisit; },
    set isFirstVisit(v: boolean) { isFirstVisit = v; persist(); },
    get shapesUnlocked() { return shapesUnlocked; },
    set shapesUnlocked(v: string[]) { shapesUnlocked = v; persist(); },
    get roundsCompleted() { return roundsCompleted; },
    set roundsCompleted(v: number) { roundsCompleted = v; persist(); },
    get sessionsToday() { return sessionsToday; },
    set sessionsToday(v: number) { sessionsToday = v; persist(); },
    get lastSessionEnd() { return lastSessionEnd; },
    set lastSessionEnd(v: number) { lastSessionEnd = v; persist(); },
    get dailyResetDate() { return dailyResetDate; },
    set dailyResetDate(v: string) { dailyResetDate = v; persist(); },
    get totalPlayTimeMinutes() { return totalPlayTimeMinutes; },
    set totalPlayTimeMinutes(v: number) { totalPlayTimeMinutes = v; persist(); },
    get sessionHistory() { return sessionHistory; },
    set sessionHistory(v: SessionHistoryEntry[]) { sessionHistory = v; persist(); },
    get owenMastery() { return owenMastery; },
    set owenMastery(v: ConceptMasteryEntry[]) { owenMastery = v; persist(); },
    get kianMastery() { return kianMastery; },
    set kianMastery(v: ConceptMasteryEntry[]) { kianMastery = v; persist(); },
    get lettersLearned() { return lettersLearned; },
    set lettersLearned(v: number) { lettersLearned = v; persist(); },
    get numbersLearned() { return numbersLearned; },
    set numbersLearned(v: number) { numbersLearned = v; persist(); },
    get colorsLearned() { return colorsLearned; },
    set colorsLearned(v: number) { colorsLearned = v; persist(); },
    get shapesLearned() { return shapesLearned; },
    set shapesLearned(v: number) { shapesLearned = v; persist(); },
    get lastPlayedDate() { return lastPlayedDate; },
    set lastPlayedDate(v: string) { lastPlayedDate = v; persist(); },
    get playStreak() { return playStreak; },
    set playStreak(v: number) { playStreak = v; persist(); },
    get totalPlayTimeToday() { return totalPlayTimeToday; },
    set totalPlayTimeToday(v: number) { totalPlayTimeToday = v; persist(); },

    /** Record a completed session in history (keep last 20) */
    addSessionHistory(entry: SessionHistoryEntry): void {
      sessionHistory = [...sessionHistory.slice(-19), entry];
      totalPlayTimeMinutes += entry.durationMinutes;

      // Update play streak
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (lastPlayedDate === yesterday) {
        playStreak++;
      } else if (lastPlayedDate !== today) {
        playStreak = 1;
      }
      lastPlayedDate = today;

      // Update daily play time
      totalPlayTimeToday += entry.durationMinutes;

      persist();
    },

    /** Update mastery for a child's concept */
    updateMastery(child: 'owen' | 'kian', concept: string, domain: string, accuracy: number): void {
      const list = child === 'owen' ? owenMastery : kianMastery;
      const existing = list.find(m => m.concept === concept && m.domain === domain);
      const today = new Date().toISOString().split('T')[0];

      let level: MasteryLevel;
      if (accuracy >= 90) level = 'mastered';
      else if (accuracy >= 60) level = 'practicing';
      else level = 'learning';

      if (existing) {
        existing.level = level;
        existing.attempts++;
        existing.lastAccuracy = accuracy;
        existing.lastSeen = today;
      } else {
        list.push({ concept, domain, level, attempts: 1, lastAccuracy: accuracy, lastSeen: today });
      }

      if (child === 'owen') owenMastery = [...list];
      else kianMastery = [...list];

      // Update learned counts
      colorsLearned = owenMastery.filter(m => m.domain === 'color' && m.level !== 'learning').length
        + kianMastery.filter(m => m.domain === 'color' && m.level !== 'learning').length;
      numbersLearned = owenMastery.filter(m => m.domain === 'number' && m.level !== 'learning').length
        + kianMastery.filter(m => m.domain === 'number' && m.level !== 'learning').length;
      lettersLearned = owenMastery.filter(m => m.domain === 'letter' && m.level !== 'learning').length
        + kianMastery.filter(m => m.domain === 'letter' && m.level !== 'learning').length;
      shapesLearned = owenMastery.filter(m => m.domain === 'shape' && m.level !== 'learning').length
        + kianMastery.filter(m => m.domain === 'shape' && m.level !== 'learning').length;

      persist();
    },

    /** Get mastery grid for a child (for parent dashboard) */
    getMasteryGrid(child: 'owen' | 'kian'): ConceptMasteryEntry[] {
      return child === 'owen' ? [...owenMastery] : [...kianMastery];
    },
  };
}

export const settings = createSettings();
