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

export type Settings = {
  fontScale: number; // 0.7 to 1.6, default 1.0
};
