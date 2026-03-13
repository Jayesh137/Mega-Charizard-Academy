// src/engine/input.ts
import { settings } from '../state/settings.svelte';
import { session } from '../state/session.svelte';

export type HotkeyAction = () => void;

let settingsToggleCallback: (() => void) | null = null;
let timeoutToggleCb: (() => void) | null = null;
let overrideCb: (() => void) | null = null;
let parentDashboardCb: (() => void) | null = null;

export function registerSettingsToggle(cb: () => void): void {
  settingsToggleCallback = cb;
}

export function registerTimeoutToggle(cb: () => void): void {
  timeoutToggleCb = cb;
}

export function registerOverride(cb: () => void): void {
  overrideCb = cb;
}

export function registerParentDashboard(cb: () => void): void {
  parentDashboardCb = cb;
}

const hotkeys: Record<string, HotkeyAction> = {
  '1': () => { settings.intensity = 'calm'; },
  '2': () => { settings.intensity = 'normal'; },
  '3': () => { settings.intensity = 'hype'; },
  '0': () => { settings.silentMode = !settings.silentMode; },
  'l': () => { session.turnOverride = 'owen'; },
  'b': () => { session.turnOverride = 'kian'; },
  't': () => { timeoutToggleCb?.(); },
  'h': () => { session.showHints = !session.showHints; },
  'd': () => { session.showDebug = !session.showDebug; },
  'f': () => toggleFullscreen(),
  'g': () => { settingsToggleCallback?.(); },
  'p': () => { parentDashboardCb?.(); },
};

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

export function handleHotkey(key: string): boolean {
  const action = hotkeys[key.toLowerCase()];
  if (action) {
    action();
    return true;
  }
  return false;
}

// Space hold detection for calm reset extension
let spaceHeld = false;

// U+O override: hold both keys for 3 seconds
let uKeyDown = false;
let oKeyDown = false;
let overrideTimer = 0;
let overrideInterval: ReturnType<typeof setInterval> | null = null;

const OVERRIDE_HOLD_MS = 3000;
const OVERRIDE_TICK_MS = 100;

function startOverrideCheck(): void {
  if (overrideInterval) return;
  overrideTimer = 0;
  overrideInterval = setInterval(() => {
    if (uKeyDown && oKeyDown) {
      overrideTimer += OVERRIDE_TICK_MS;
      if (overrideTimer >= OVERRIDE_HOLD_MS) {
        overrideCb?.();
        clearOverrideCheck();
      }
    } else {
      clearOverrideCheck();
    }
  }, OVERRIDE_TICK_MS);
}

function clearOverrideCheck(): void {
  if (overrideInterval) {
    clearInterval(overrideInterval);
    overrideInterval = null;
  }
  overrideTimer = 0;
}

export function onKeyDown(key: string): void {
  if (key === ' ' && !spaceHeld) {
    spaceHeld = true;
    session.resetExtended = true;
  }

  const k = key.toLowerCase();
  if (k === 'u') {
    uKeyDown = true;
    if (oKeyDown) startOverrideCheck();
  }
  if (k === 'o') {
    oKeyDown = true;
    if (uKeyDown) startOverrideCheck();
  }
}

export function onKeyUp(key: string): void {
  if (key === ' ') {
    spaceHeld = false;
    session.resetExtended = false;
  }

  const k = key.toLowerCase();
  if (k === 'u') {
    uKeyDown = false;
    clearOverrideCheck();
  }
  if (k === 'o') {
    oKeyDown = false;
    clearOverrideCheck();
  }
}
