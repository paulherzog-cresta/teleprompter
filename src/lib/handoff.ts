import LZString from 'lz-string';
import type { Entry, Script } from '../types';

export const HANDOFF_VERSION = 1;

/**
 * Bytes of payload per QR. A level-L code tops out near 2.9KB, but a code that
 * dense is miserable to scan from a foot away — this keeps each one around
 * version 22, which reads instantly off a bright laptop screen.
 */
export const CHUNK_DATA_MAX = 900;

const MAX_ENTRIES = 5000;
const MAX_TEXT = 20000;
const MAX_TITLE = 500;

/**
 * `[0, roleIndex, text, rowDelta]` for a line, `[1, text, rowDelta]` for a
 * direction. rowDelta is how far the sheet row advanced from the previous
 * entry — 0 means "same row", which is what keeps a direction attached to the
 * line it belongs with. Storing the delta rather than the row number costs
 * almost nothing after compression.
 */
type LineTuple = [0, number, string, number];
type DirectionTuple = [1, string, number];
type EntryTuple = LineTuple | DirectionTuple;

type Payload = {
  v: number;
  i: string;
  t: string;
  r: string[];
  m: number; // index into r, or -1 for no role picked
  e: EntryTuple[];
};

/** A script as it travels: no cursor, no fontScale. Those stay on the device. */
export type HandoffScript = Pick<Script, 'id' | 'title' | 'roles' | 'myRole' | 'entries'>;

export function encodeScript(script: Script): string {
  let previousRow = script.entries.length > 0 ? script.entries[0].row : 0;

  const e: EntryTuple[] = script.entries.map((entry, index) => {
    const delta = index === 0 ? 0 : Math.max(0, entry.row - previousRow);
    previousRow = entry.row;
    return entry.kind === 'line'
      ? [0, script.roles.indexOf(entry.role), entry.text, delta]
      : [1, entry.text, delta];
  });

  const payload: Payload = {
    v: HANDOFF_VERSION,
    i: script.id,
    t: script.title,
    r: script.roles,
    m: script.myRole === null ? -1 : script.roles.indexOf(script.myRole),
    e,
  };

  return LZString.compressToEncodedURIComponent(JSON.stringify(payload));
}

export class HandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandoffError';
  }
}

const isString = (value: unknown): value is string => typeof value === 'string';

/** Scanned or pasted input is untrusted, so every field is checked. */
export function decodeScript(encoded: string): HandoffScript {
  const json = LZString.decompressFromEncodedURIComponent(encoded);
  if (json === null || json === '') {
    throw new HandoffError('That link or code is not a script. It may have been cut short.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new HandoffError('That script could not be read. It looks damaged.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new HandoffError('That script could not be read.');
  }
  const payload = raw as Record<string, unknown>;

  if (payload.v !== HANDOFF_VERSION) {
    throw new HandoffError(
      `That script was made by a different version of the app (v${String(payload.v)}). Update both devices and try again.`,
    );
  }
  if (!isString(payload.i) || payload.i === '') {
    throw new HandoffError('That script is missing its id.');
  }
  if (!isString(payload.t) || payload.t.length > MAX_TITLE) {
    throw new HandoffError('That script has no usable title.');
  }
  if (!Array.isArray(payload.r) || payload.r.length === 0 || !payload.r.every(isString)) {
    throw new HandoffError('That script has no roles.');
  }
  const roles = payload.r as string[];

  if (
    typeof payload.m !== 'number' ||
    !Number.isInteger(payload.m) ||
    payload.m < -1 ||
    payload.m >= roles.length
  ) {
    throw new HandoffError('That script has an unrecognised role selection.');
  }
  if (!Array.isArray(payload.e) || payload.e.length === 0) {
    throw new HandoffError('That script has no lines.');
  }
  if (payload.e.length > MAX_ENTRIES) {
    throw new HandoffError('That script is too long to import.');
  }

  let row = 1;
  const entries: Entry[] = payload.e.map((item, index) => {
    if (!Array.isArray(item)) throw new HandoffError(`Entry ${index + 1} is malformed.`);

    if (item[0] === 0) {
      const [, roleIndex, text, delta] = item as LineTuple;
      if (
        typeof roleIndex !== 'number' ||
        !Number.isInteger(roleIndex) ||
        roleIndex < 0 ||
        roleIndex >= roles.length
      ) {
        throw new HandoffError(`Entry ${index + 1} points at a role that does not exist.`);
      }
      if (!isString(text) || text.length > MAX_TEXT) {
        throw new HandoffError(`Entry ${index + 1} has unreadable text.`);
      }
      row += typeof delta === 'number' && Number.isFinite(delta) ? Math.max(0, delta) : 1;
      return { kind: 'line', role: roles[roleIndex], text, row };
    }

    if (item[0] === 1) {
      const [, text, delta] = item as DirectionTuple;
      if (!isString(text) || text.length > MAX_TEXT) {
        throw new HandoffError(`Entry ${index + 1} has unreadable text.`);
      }
      row += typeof delta === 'number' && Number.isFinite(delta) ? Math.max(0, delta) : 1;
      return { kind: 'direction', text, row };
    }

    throw new HandoffError(`Entry ${index + 1} is of an unknown kind.`);
  });

  return {
    id: payload.i,
    title: payload.t,
    roles,
    myRole: payload.m === -1 ? null : roles[payload.m],
    entries,
  };
}

/* ---------- links ---------- */

/**
 * A fragment, not a query string, so the script never lands in a server log if
 * the link is opened somewhere unexpected.
 */
export function handoffUrl(encoded: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${encoded}`;
}

export function readHandoffFromHash(hash: string): string | null {
  const match = /^#s=(.+)$/.exec(hash);
  if (!match) return null;
  const value = match[1];
  // Some clients percent-encode a fragment when they rewrite a link.
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/* ---------- chunking ---------- */

export type Chunk = { s: string; c: number; n: number; d: string };

export function newSessionId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function chunkPayload(encoded: string, sessionId: string): string[] {
  const total = Math.max(1, Math.ceil(encoded.length / CHUNK_DATA_MAX));
  const size = Math.ceil(encoded.length / total);
  const chunks: string[] = [];
  for (let i = 0; i < total; i++) {
    const chunk: Chunk = {
      s: sessionId,
      c: i,
      n: total,
      d: encoded.slice(i * size, (i + 1) * size),
    };
    chunks.push(JSON.stringify(chunk));
  }
  return chunks;
}

export function parseChunk(raw: string): Chunk | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const chunk = value as Record<string, unknown>;
  if (
    !isString(chunk.s) ||
    typeof chunk.c !== 'number' ||
    typeof chunk.n !== 'number' ||
    !Number.isInteger(chunk.c) ||
    !Number.isInteger(chunk.n) ||
    chunk.n < 1 ||
    chunk.c < 0 ||
    chunk.c >= chunk.n ||
    !isString(chunk.d)
  ) {
    return null;
  }
  return { s: chunk.s, c: chunk.c, n: chunk.n, d: chunk.d };
}

export type ScannedCode =
  | { kind: 'payload'; encoded: string }
  | { kind: 'chunk'; chunk: Chunk };

/**
 * A scanned code is either a whole handoff link — which is also what a phone's
 * own camera app can open — or one chunk of a script too long to fit in one.
 */
export function readScannedCode(raw: string): ScannedCode | null {
  const hashIndex = raw.indexOf('#s=');
  if (hashIndex !== -1) {
    const encoded = readHandoffFromHash(raw.slice(hashIndex));
    if (encoded !== null) return { kind: 'payload', encoded };
  }
  const chunk = parseChunk(raw);
  return chunk === null ? null : { kind: 'chunk', chunk };
}

export type AssemblyState = { captured: number; total: number; encoded: string | null };

/** Collects chunks as the phone sees them, in whatever order they cycle past. */
export class ChunkAssembler {
  private sessionId: string | null = null;
  private total = 0;
  private parts = new Map<number, string>();

  add(chunk: Chunk): AssemblyState {
    // A different session means the desktop moved on to another script.
    if (chunk.s !== this.sessionId) {
      this.sessionId = chunk.s;
      this.total = chunk.n;
      this.parts = new Map();
    }
    this.parts.set(chunk.c, chunk.d);

    if (this.parts.size < this.total) {
      return { captured: this.parts.size, total: this.total, encoded: null };
    }

    let encoded = '';
    for (let i = 0; i < this.total; i++) {
      const part = this.parts.get(i);
      if (part === undefined) {
        return { captured: this.parts.size, total: this.total, encoded: null };
      }
      encoded += part;
    }
    return { captured: this.parts.size, total: this.total, encoded };
  }

  reset(): void {
    this.sessionId = null;
    this.total = 0;
    this.parts = new Map();
  }
}
