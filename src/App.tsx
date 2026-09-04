import { useCallback, useEffect, useRef, useState } from 'react';
import type { Script, Settings as SettingsValue } from './types';
import { Library } from './components/Library';
import { Editor, type EditorDraft } from './components/Editor';
import { Reader } from './components/Reader';
import { Settings } from './components/Settings';
import {
  clearAllScripts,
  loadScripts,
  loadSettings,
  newId,
  saveScripts,
  saveSettings,
} from './lib/storage';

type View =
  | { name: 'library' }
  | { name: 'editor'; id: string | null }
  | { name: 'reader'; id: string }
  | { name: 'settings' };

const NOTICE_MS = 4000;

export default function App() {
  const [scripts, setScripts] = useState<Script[]>(loadScripts);
  const [settings, setSettings] = useState<SettingsValue>(loadSettings);
  const [stack, setStack] = useState<View[]>([{ name: 'library' }]);
  const [notice, setNotice] = useState<string | null>(null);

  const stackRef = useRef(stack);
  stackRef.current = stack;
  const view = stack[stack.length - 1];

  // Each screen gets a history entry so the phone's back gesture leaves the
  // reader instead of leaving the app.
  const push = useCallback((next: View) => {
    setStack((current) => [...current, next]);
    window.history.pushState({ teleprompter: true }, '');
  }, []);

  const back = useCallback(() => {
    if (stackRef.current.length > 1) window.history.back();
  }, []);

  useEffect(() => {
    const onPopState = () =>
      setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const firstScriptsRender = useRef(true);
  useEffect(() => {
    if (firstScriptsRender.current) {
      firstScriptsRender.current = false;
      return;
    }
    if (!saveScripts(scripts)) {
      setNotice('Could not save to this device. Storage may be full or blocked.');
    }
  }, [scripts]);

  const firstSettingsRender = useRef(true);
  useEffect(() => {
    if (firstSettingsRender.current) {
      firstSettingsRender.current = false;
      return;
    }
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale));
  }, [settings.fontScale]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const saveDraft = (draft: EditorDraft, id: string | null) => {
    if (id === null) {
      const script: Script = {
        id: newId(),
        title: draft.title,
        roles: draft.roles,
        myRole: draft.myRole,
        entries: draft.entries,
        cursor: 0,
        updatedAt: Date.now(),
      };
      setScripts([script, ...scripts]);
      setNotice(`Saved "${script.title}" — ${script.entries.length} entries.`);
    } else {
      const existing = scripts.find((script) => script.id === id);
      const keepCursor = existing !== undefined && existing.entries.length === draft.entries.length;
      setScripts(
        scripts.map((script) =>
          script.id === id
            ? {
                ...script,
                title: draft.title,
                roles: draft.roles,
                myRole: draft.myRole,
                entries: draft.entries,
                cursor: keepCursor ? Math.min(script.cursor, draft.entries.length - 1) : 0,
                updatedAt: Date.now(),
              }
            : script,
        ),
      );
      setNotice(
        keepCursor
          ? 'Saved. Reading position kept.'
          : 'Saved. The entry count changed, so reading position went back to the top.',
      );
    }
    back();
  };

  const patchScript = (id: string, patch: Partial<Script>) =>
    setScripts((current) =>
      current.map((script) => (script.id === id ? { ...script, ...patch } : script)),
    );

  const setCursor = (id: string, next: (cursor: number, total: number) => number) =>
    setScripts((current) =>
      current.map((script) => {
        if (script.id !== id) return script;
        const total = script.entries.length;
        const cursor = Math.min(total - 1, Math.max(0, next(script.cursor, total)));
        return cursor === script.cursor ? script : { ...script, cursor };
      }),
    );

  const byId = (id: string) => scripts.find((script) => script.id === id) ?? null;

  let screen: React.ReactNode;

  if (view.name === 'reader') {
    const script = byId(view.id);
    screen = script ? (
      <Reader
        script={script}
        // cursor is per device, so moving it never bumps updatedAt.
        onMove={(delta) => setCursor(script.id, (cursor) => cursor + delta)}
        onJump={(index) => setCursor(script.id, () => index)}
        onPickRole={(myRole) => patchScript(script.id, { myRole, updatedAt: Date.now() })}
        onExit={back}
      />
    ) : null;
  } else if (view.name === 'editor') {
    screen = (
      <Editor
        script={view.id === null ? null : byId(view.id)}
        onSave={(draft) => saveDraft(draft, view.id)}
        onCancel={back}
      />
    );
  } else if (view.name === 'settings') {
    screen = (
      <Settings
        settings={settings}
        scriptCount={scripts.length}
        onChange={setSettings}
        onClearAll={() => {
          clearAllScripts();
          setScripts([]);
          setNotice('All scripts deleted from this device.');
        }}
        onBack={back}
      />
    );
  }

  if (!screen) {
    screen = (
      <Library
        scripts={scripts}
        onOpen={(id) => push({ name: 'reader', id })}
        onEdit={(id) => push({ name: 'editor', id })}
        onDelete={(id) => setScripts(scripts.filter((script) => script.id !== id))}
        onNew={() => push({ name: 'editor', id: null })}
        onSettings={() => push({ name: 'settings' })}
      />
    );
  }

  return (
    <>
      {screen}
      {notice !== null && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </>
  );
}
