import type { Entry } from '../types';

/** Your lines, someone else's lines, and directions each get their own weight. */
export function entryTypeClass(entry: Entry, myRole: string | null): string {
  if (entry.kind === 'direction') return 'entry-direction';
  return entry.role === myRole ? 'entry-mine' : 'entry-other';
}
