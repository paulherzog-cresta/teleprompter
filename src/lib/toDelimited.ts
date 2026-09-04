import type { Script } from '../types';

const needsQuoting = (value: string) => /[\t\n\r"]/.test(value);
const quote = (value: string) => (needsQuoting(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * Rebuild a tab separated sheet from a parsed script. The raw paste is not kept
 * anywhere, so editing an existing script means round-tripping it back through
 * the same shape it came in as.
 */
export function scriptToTsv(script: Script): string {
  const hasDirections = script.entries.some((entry) => entry.kind === 'direction');
  const header = hasDirections ? [...script.roles, 'Direction'] : [...script.roles];

  const lines: string[] = [header.map(quote).join('\t')];
  let index = 0;

  while (index < script.entries.length) {
    const row = script.entries[index].row;
    const cells = new Map<string, string>();
    let direction = '';

    // Entries that shared a sheet row were emitted together, so they are still
    // adjacent here.
    while (index < script.entries.length && script.entries[index].row === row) {
      const entry = script.entries[index];
      if (entry.kind === 'direction') {
        direction = direction === '' ? entry.text : `${direction}\n${entry.text}`;
      } else {
        const existing = cells.get(entry.role);
        cells.set(entry.role, existing ? `${existing}\n${entry.text}` : entry.text);
      }
      index++;
    }

    const record = script.roles.map((role) => quote(cells.get(role) ?? ''));
    if (hasDirections) record.push(quote(direction));
    lines.push(record.join('\t'));
  }

  return lines.join('\n');
}
