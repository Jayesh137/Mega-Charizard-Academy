// src/engine/systems/session-limiter.ts
// Session time management with AAP compliance, engagement tracking, and gradual wind-down.
// Research: AAP recommends < 1 hour screen time for ages 2-5, with active adult participation.
// Research: Gradual session endings are better for emotional regulation than abrupt stops.

import { settings } from '../../state/settings.svelte';

const TIMEOUT_DURATION = 3 * 60;         // 3 minutes rest in seconds
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours between sessions
const MAX_SESSIONS_PER_DAY = 4;
const DAILY_RESET_HOUR = 6;              // 6:00 AM
const AAP_MAX_MINUTES = 60;              // AAP guideline: max 1 hour/day for ages 2-5
const SESSION_WARNING_MINUTES = 12;      // Warn at 12 minutes (2-minute warning before typical end)
const SESSION_MAX_MINUTES = 15;          // Hard cap per session

/** Engagement tracking */
interface EngagementPulse {
  correctRate: number;       // Recent accuracy (0-1)
  responseTimeTrend: 'fast' | 'normal' | 'slow';
  missStreak: number;        // Current consecutive misses
  promptsAnswered: number;   // Total prompts this session
}

/** Session quality metrics for parent report */
export interface SessionQuality {
  engagementLevel: 'high' | 'medium' | 'low';
  focusScore: number;          // 0-100
  aapCompliant: boolean;
  minutesPlayed: number;
  minutesRemaining: number;
  sessionsToday: number;
  maxSessionsPerDay: number;
  recommendation: string;
}

export class SessionLimiter {
  private _timedOut = false;
  private _timeoutRemaining = 0;
  private sessionStartTime = Date.now();
  private engagement: EngagementPulse = {
    correctRate: 1,
    responseTimeTrend: 'normal',
    missStreak: 0,
    promptsAnswered: 0,
  };
  private responseTimes: number[] = [];
  private windingDown = false;

  get timedOut(): boolean { return this._timedOut; }
  get timeoutRemaining(): number { return this._timeoutRemaining; }
  get timeoutRemainingFormatted(): string {
    const m = Math.floor(this._timeoutRemaining / 60);
    const s = Math.floor(this._timeoutRemaining % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  get isWindingDown(): boolean { return this.windingDown; }

  /** Get minutes elapsed this session */
  get minutesElapsed(): number {
    return Math.round((Date.now() - this.sessionStartTime) / 60000);
  }

  /** Get total minutes played today (including this session) */
  get totalMinutesToday(): number {
    return (settings.totalPlayTimeToday ?? 0) + this.minutesElapsed;
  }

  checkDailyReset(): void {
    const today = new Date();
    const resetDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (today.getHours() >= DAILY_RESET_HOUR && settings.dailyResetDate !== resetDate) {
      settings.sessionsToday = 0;
      settings.dailyResetDate = resetDate;
    }
  }

  canStartSession(): { allowed: boolean; reason?: string; waitUntil?: number } {
    this.checkDailyReset();
    if (settings.sessionsToday >= MAX_SESSIONS_PER_DAY) {
      return { allowed: false, reason: 'daily-limit' };
    }
    const elapsed = Date.now() - settings.lastSessionEnd;
    if (settings.lastSessionEnd > 0 && elapsed < COOLDOWN_MS) {
      return { allowed: false, reason: 'cooldown', waitUntil: settings.lastSessionEnd + COOLDOWN_MS };
    }
    // Check AAP total daily limit
    if (this.totalMinutesToday >= AAP_MAX_MINUTES) {
      return { allowed: false, reason: 'aap-daily-limit' };
    }
    return { allowed: true };
  }

  /** Start tracking a new session */
  startSession(): void {
    this.sessionStartTime = Date.now();
    this.windingDown = false;
    this.engagement = {
      correctRate: 1,
      responseTimeTrend: 'normal',
      missStreak: 0,
      promptsAnswered: 0,
    };
    this.responseTimes = [];
  }

  recordSessionEnd(): void {
    settings.sessionsToday++;
    settings.lastSessionEnd = Date.now();
  }

  /** Record an answer for engagement tracking */
  recordAnswer(correct: boolean, responseTimeMs: number): void {
    this.engagement.promptsAnswered++;
    this.responseTimes.push(responseTimeMs);

    if (correct) {
      this.engagement.missStreak = 0;
    } else {
      this.engagement.missStreak++;
    }

    // Calculate rolling correct rate (last 10 answers)
    const recentCount = Math.min(10, this.engagement.promptsAnswered);
    // Track in a simple way — we just need the trend
    if (correct) {
      this.engagement.correctRate = this.engagement.correctRate * 0.8 + 0.2;
    } else {
      this.engagement.correctRate = this.engagement.correctRate * 0.8;
    }

    // Response time trend (last 5 answers)
    const recent = this.responseTimes.slice(-5);
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (avgRecent < 3000) {
      this.engagement.responseTimeTrend = 'fast';
    } else if (avgRecent > 8000) {
      this.engagement.responseTimeTrend = 'slow';
    } else {
      this.engagement.responseTimeTrend = 'normal';
    }
  }

  /** Should we start winding down? */
  shouldWindDown(): boolean {
    if (this.windingDown) return true;

    // Time-based wind-down
    if (this.minutesElapsed >= SESSION_WARNING_MINUTES) {
      this.windingDown = true;
      return true;
    }

    // Engagement-based wind-down (child seems tired/unfocused)
    if (this.engagement.promptsAnswered >= 10 &&
        this.engagement.correctRate < 0.3 &&
        this.engagement.responseTimeTrend === 'slow') {
      this.windingDown = true;
      return true;
    }

    return false;
  }

  /** Should we force-end the session? */
  shouldForceEnd(): boolean {
    return this.minutesElapsed >= SESSION_MAX_MINUTES;
  }

  /** Get comprehensive session quality metrics */
  getSessionQuality(): SessionQuality {
    const minutesPlayed = this.minutesElapsed;

    // Focus score: combination of accuracy and response speed
    let focusScore = Math.round(this.engagement.correctRate * 100);
    if (this.engagement.responseTimeTrend === 'fast') focusScore = Math.min(100, focusScore + 10);
    if (this.engagement.responseTimeTrend === 'slow') focusScore = Math.max(0, focusScore - 15);

    // Engagement level
    let engagementLevel: 'high' | 'medium' | 'low';
    if (focusScore >= 70) engagementLevel = 'high';
    else if (focusScore >= 40) engagementLevel = 'medium';
    else engagementLevel = 'low';

    // AAP compliance
    const aapCompliant = this.totalMinutesToday <= AAP_MAX_MINUTES;

    // Recommendation
    let recommendation: string;
    if (minutesPlayed < 5) {
      recommendation = 'Great start! Aim for 10-15 minutes of focused play.';
    } else if (engagementLevel === 'high' && minutesPlayed < 12) {
      recommendation = 'Excellent focus! This is a great learning session.';
    } else if (engagementLevel === 'low') {
      recommendation = 'Consider a break — learning works best in short, focused bursts.';
    } else if (!aapCompliant) {
      recommendation = 'Daily screen time limit reached. Great job today — see you tomorrow!';
    } else {
      recommendation = 'Good session! Regular short sessions are better than long ones.';
    }

    return {
      engagementLevel,
      focusScore,
      aapCompliant,
      minutesPlayed,
      minutesRemaining: Math.max(0, SESSION_MAX_MINUTES - minutesPlayed),
      sessionsToday: settings.sessionsToday,
      maxSessionsPerDay: MAX_SESSIONS_PER_DAY,
      recommendation,
    };
  }

  startTimeout(): void {
    this._timedOut = true;
    this._timeoutRemaining = TIMEOUT_DURATION;
  }

  endTimeout(): void {
    this._timedOut = false;
    this._timeoutRemaining = 0;
  }

  toggleTimeout(): void {
    if (this._timedOut) this.endTimeout();
    else this.startTimeout();
  }

  update(dt: number): boolean {
    if (!this._timedOut) return false;
    this._timeoutRemaining -= dt;
    if (this._timeoutRemaining <= 0) {
      this._timedOut = false;
      this._timeoutRemaining = 0;
      return true;
    }
    return false;
  }

  override(): void {
    this.endTimeout();
    settings.sessionsToday = 0;
    settings.lastSessionEnd = 0;
  }
}
