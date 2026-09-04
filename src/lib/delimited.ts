export type Delimiter = '\t' | ',';

/**
 * Compare tab and comma counts in the first record. Counting ignores anything
 * inside quotes, so a header like `Agent,"Customer, angry"` still reads as CSV
 * rather than being thrown off by the quoted comma.
 */
export function detectDelimiter(text: string): Delimiter {
  let tabs = 0;
  let commas = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') i++;
        else inQuotes = false;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === '\n' || ch === '\r') break;
    if (ch === '\t') tabs++;
    else if (ch === ',') commas++;
  }

  // Sheets pastes are tab separated, so a tie goes to tab.
  if (tabs > 0 && tabs >= commas) return '\t';
  if (commas > 0) return ',';
  return '\t';
}

/**
 * RFC 4180 style parser: quoted fields, embedded newlines, and `""` escapes.
 * Google Sheets quotes any cell containing a line break, and demo dialogue is
 * full of them, so splitting on the delimiter is not an option.
 */
export function parseDelimited(input: string, delimiter: Delimiter): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    // A quote only opens a quoted field at the start of that field. Anywhere
    // else it is literal, which keeps stray quotes in dialogue from derailing
    // the rest of the paste.
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === '\r') {
      endRow();
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // A trailing newline already closed the last record; anything left is a
  // partial one that still needs flushing.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}
