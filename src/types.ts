export type Entry =
  | { kind: 'line'; role: string; text: string; row: number }
  | { kind: 'direction'; text: string; row: number };

export type Script = {
  id: string; // stable across devices, travels in the handoff payload
  title: string;
  roles: string[];
  myRole: string | null;
  entries: Entry[];
  cursor: number; // index into entries, per device
  updatedAt: number;
};

/**
 * 'read' is the clean full-script view and the default. 'prompt' is the
 * anchored teleprompter with a fixed reading line.
 */
export type ReadingMode = 'read' | 'prompt';

export type Settings = {
  // Separate scales: reading and glancing want different sizes.
  readScale: number; // 0.7 to 1.6, default 1.0
  promptScale: number; // 0.7 to 1.6, default 1.0
  mode: ReadingMode;
};
