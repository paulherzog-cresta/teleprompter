import type { Entry } from '../types';
import { detectDelimiter, parseDelimited } from './delimited';

const DIRECTION_HEADERS = new Set(['direction', 'directions', 'stage direction', 'note', 'notes']);
const RESERVED_HEADERS = new Set(['section']); // reserved now, ignored in v1

const MAX_WARNINGS = 12;

export class ScriptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptParseError';
  }
}

export type ParsedScript = {
  roles: string[];
  entries: Entry[];
  warnings: string[];
};

type Column =
  | { kind: 'role'; role: string }
  | { kind: 'direction' }
  | { kind: 'reserved' }
  | { kind: 'unlabelled' };

const clean = (cell: string | undefined) => (cell ?? '').replace(/\r\n/g, '\n').trim();

export function parseScript(text: string): ParsedScript {
  if (text.trim() === '') {
    throw new ScriptParseError('Nothing to import. Paste your script first.');
  }

  const rows = parseDelimited(text, detectDelimiter(text));
  const headerIndex = rows.findIndex((row) => row.some((cell) => clean(cell) !== ''));
  if (headerIndex === -1) {
    throw new ScriptParseError('No header row found. Row 1 needs your column names.');
  }

  const header = rows[headerIndex];
  const columns: Column[] = [];
  const roles: string[] = [];
  const roleByLowerName = new Map<string, string>();
  const warnings: string[] = [];
  let directionColumns = 0;

  for (const raw of header) {
    const name = clean(raw);
    const lower = name.toLowerCase();

    if (name === '') {
      columns.push({ kind: 'unlabelled' });
    } else if (DIRECTION_HEADERS.has(lower)) {
      directionColumns++;
      columns.push({ kind: 'direction' });
    } else if (RESERVED_HEADERS.has(lower)) {
      columns.push({ kind: 'reserved' });
    } else {
      const existing = roleByLowerName.get(lower);
      if (existing) {
        warnings.push(`Two columns are both named "${name}". They were merged into one role.`);
        columns.push({ kind: 'role', role: existing });
      } else {
        roleByLowerName.set(lower, name);
        roles.push(name);
        columns.push({ kind: 'role', role: name });
      }
    }
  }

  if (directionColumns > 1) {
    warnings.push(
      `Found ${directionColumns} direction columns. The leftmost non-empty one wins on each row.`,
    );
  }

  if (roles.length === 0) {
    const found = header.map(clean).filter((h) => h !== '');
    throw new ScriptParseError(
      found.length > 0
        ? `No role columns found. Every header except Direction and Section is treated as a role, but row 1 only has: ${found.join(', ')}.`
        : 'No role columns found. Row 1 is empty, so there are no column names to read.',
    );
  }

  const entries: Entry[] = [];
  let unlabelledHits = 0;

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    const sheetRow = r + 1; // 1-based, matching the row numbers in the sheet
    if (row.every((cell) => clean(cell) === '')) continue;

    let direction = '';
    const lines: Array<{ role: string; text: string }> = [];
    let sawUnlabelled = false;

    for (let c = 0; c < columns.length; c++) {
      const value = clean(row[c]);
      if (value === '') continue;
      const column = columns[c];

      if (column.kind === 'direction') {
        if (direction === '') direction = value;
      } else if (column.kind === 'role') {
        lines.push({ role: column.role, text: value });
      } else if (column.kind === 'unlabelled') {
        sawUnlabelled = true;
      }
    }

    // Text past the last header cell is data in a column nobody named. Say so
    // rather than dropping it in silence.
    if (row.length > columns.length) {
      for (let c = columns.length; c < row.length; c++) {
        if (clean(row[c]) !== '') sawUnlabelled = true;
      }
    }
    if (sawUnlabelled) {
      unlabelledHits++;
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(`Row ${sheetRow} has text in a column with no header. That text was ignored.`);
      }
    }

    if (lines.length > 1 && warnings.length < MAX_WARNINGS) {
      warnings.push(
        `Row ${sheetRow} has text in ${lines.length} role columns. Both were kept, left to right.`,
      );
    }

    // A direction is a cue you want before you speak, so it goes above the line.
    if (direction !== '') entries.push({ kind: 'direction', text: direction, row: sheetRow });
    for (const line of lines) {
      entries.push({ kind: 'line', role: line.role, text: line.text, row: sheetRow });
    }
  }

  if (unlabelledHits > MAX_WARNINGS) {
    warnings.push(`…and ${unlabelledHits - MAX_WARNINGS} more rows with unheaded text.`);
  }

  if (entries.length === 0) {
    throw new ScriptParseError(
      'No dialogue found below the header row. Row 1 is the header, everything under it is script.',
    );
  }

  return { roles, entries, warnings };
}
