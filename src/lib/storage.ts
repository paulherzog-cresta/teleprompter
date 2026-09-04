import type { Entry, Script, Settings } from '../types';

const NS = 'teleprompter.v1';
const SCRIPTS_KEY = `${NS}.scripts`;
const SETTINGS_KEY = `${NS}.settings`;

export const FONT_SCALE_MIN = 0.7;
export const FONT_SCALE_MAX = 1.6;
export const DEFAULT_SETTINGS: Settings = { fontScale: 1 };

export const clampFontScale = (n: number) =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Number.isFinite(n) ? n : 1));

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isEntry(value: unknown): value is Entry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.text !== 'string' || typeof e.row !== 'number') return false;
  if (e.kind === 'direction') return true;
  return e.kind === 'line' && typeof e.role === 'string';
}

/** Anything that fails the shape check is dropped rather than crashing the app. */
function isScript(value: unknown): value is Script {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    Array.isArray(s.roles) &&
    s.roles.every((r) => typeof r === 'string') &&
    (s.myRole === null || typeof s.myRole === 'string') &&
    Array.isArray(s.entries) &&
    s.entries.every(isEntry) &&
    typeof s.cursor === 'number' &&
    typeof s.updatedAt === 'number'
  );
}

export function loadScripts(): Script[] {
  const value = read(SCRIPTS_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter(isScript).map((script) => ({
    ...script,
    cursor: Math.min(Math.max(0, Math.floor(script.cursor)), Math.max(0, script.entries.length - 1)),
  }));
}

export function saveScripts(scripts: Script[]): boolean {
  return write(SCRIPTS_KEY, scripts);
}

export function loadSettings(): Settings {
  const value = read(SETTINGS_KEY);
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
  const s = value as Record<string, unknown>;
  return { fontScale: clampFontScale(typeof s.fontScale === 'number' ? s.fontScale : 1) };
}

export function saveSettings(settings: Settings): boolean {
  return write(SETTINGS_KEY, settings);
}

export function clearAllScripts(): void {
  try {
    localStorage.removeItem(SCRIPTS_KEY);
  } catch {
    /* nothing to do; the library is already unreadable */
  }
}

export function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
