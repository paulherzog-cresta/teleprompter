import { useCallback, useEffect, useRef, useState } from 'react';
import * as Toast from '@radix-ui/react-toast';
import type { Script, Settings as SettingsValue } from './types';
import { Library } from './components/Library';
import { Editor, type EditorDraft } from './components/Editor';
import { Reader } from './components/Reader';
import { Settings } from './components/Settings';
import { Share } from './components/Share';
import { Scan } from './components/Scan';
import {
  HandoffError,
  decodeScript,
  readHandoffFromHash,
  type HandoffScript,
} from './lib/handoff';
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
  | { name: 'share'; id: string }
  | { name: 'scan' }
  | { name: 'settings' };

const NOTICE_MS = 4000;

export default function App() {
  const [scripts, setScripts] = useState<Script[]>(loadScripts);
  const [settings, setSettings] = useState<SettingsValue>(loadSettings);
  const [stack, setStack] = useState<View[]>([{ name: 'library' }]);
  const [notice, setNotice] = useState<string | null>(null);

  const stackRef = useRef(stack);
  stackRef.current = stack;
  const scriptsRef = useRef(scripts);
  scriptsRef.current = scripts;

  const view = stack[stack.length - 1];

  // Each screen gets a history entry so the phone's back gesture leaves the
  // reader instead of leaving the app.
  const push = useCallback((next: View) => {
    setStack((current) => [...current, next]);
    window.history.pushState({ teleprompter: true }, '');
  }, []);

  /** Swap the top screen rather than stacking on it, so back skips it. */
  const replace = useCallback((next: View) => {
    setStack((current) => [...current.slice(0, -1), next]);
    window.history.replaceState({ teleprompter: true }, '');
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


  const importScript = useCallback(
    (incoming: HandoffScript) => {
      const existing = scriptsRef.current.find((script) => script.id === incoming.id);

      if (!existing) {
        setScripts((current) => [
          { ...incoming, cursor: 0, updatedAt: Date.now() },
          ...current.filter((script) => script.id !== incoming.id),
        ]);
        setNotice(`Imported "${incoming.title}" — ${incoming.entries.length} entries.`);
      } else {
        const sameLength = existing.entries.length === incoming.entries.length;
        setScripts((current) =>
          current.map((script) =>
            script.id === incoming.id
              ? {
                  ...script,
                  title: incoming.title,
                  roles: incoming.roles,
                  // A payload with no role picked leaves this device's choice alone.
                  myRole: incoming.myRole ?? script.myRole,
                  entries: incoming.entries,
                  cursor: sameLength
                    ? Math.min(script.cursor, incoming.entries.length - 1)
                    : 0,
                  updatedAt: Date.now(),
                }
              : script,
          ),
        );
        setNotice(
          sameLength
            ? `Updated "${incoming.title}". Reading position kept.`
            : `Updated "${incoming.title}". The entry count changed, so reading position went back to the top.`,
        );
      }

      // Arriving from the scanner, the scan screen is done with — replacing it
      // means back from the reader lands on the library, not the camera.
      const top = stackRef.current[stackRef.current.length - 1];
      const next: View = { name: 'reader', id: incoming.id };
      if (top.name === 'scan') replace(next);
      else push(next);
    },
    [push, replace],
  );

  // A script can arrive as a link as well as a scan — same payload either way.
  useEffect(() => {
    const readHash = () => {
      const encoded = readHandoffFromHash(window.location.hash);
      if (encoded === null) return;
      // Drop it before importing so a refresh does not import a second time.
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
      try {
        importScript(decodeScript(encoded));
      } catch (caught) {
        setNotice(
          caught instanceof HandoffError ? caught.message : 'That link could not be read.',
        );
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, [importScript]);

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

  // Stable identity: the reader debounces its writes, and a callback that
  // changed every render would keep resetting that timer.
  const readerId = view.name === 'reader' ? view.id : null;
  const onReaderCursor = useCallback(
    (cursor: number) => {
      if (readerId === null) return;
      setScripts((current) =>
        current.map((script) => {
          if (script.id !== readerId) return script;
          const clamped = Math.min(script.entries.length - 1, Math.max(0, cursor));
          return clamped === script.cursor ? script : { ...script, cursor: clamped };
        }),
      );
    },
    [readerId],
  );

  const byId = (id: string) => scripts.find((script) => script.id === id) ?? null;

  let screen: React.ReactNode;

  if (view.name === 'reader') {
    const script = byId(view.id);
    screen = script ? (
      <Reader
        script={script}
        mode={settings.mode}
        onMode={(mode) => setSettings((current) => ({ ...current, mode }))}
        // cursor is per device, so moving it never bumps updatedAt.
        onCursor={onReaderCursor}
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
  } else if (view.name === 'share') {
    const script = byId(view.id);
    screen = script ? <Share script={script} onBack={back} /> : null;
  } else if (view.name === 'scan') {
    screen = (
      <Scan
        onImport={importScript}
        onPasteInstead={() => push({ name: 'editor', id: null })}
        onBack={back}
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
        onShare={(id) => push({ name: 'share', id })}
        onDelete={(id) => setScripts(scripts.filter((script) => script.id !== id))}
        onNew={() => push({ name: 'editor', id: null })}
        onScan={() => push({ name: 'scan' })}
        onSettings={() => push({ name: 'settings' })}
      />
    );
  }

  return (
    <Toast.Provider duration={NOTICE_MS} swipeDirection="down">
      {screen}
      <Toast.Root
        // Re-keying makes a second message announce and restart its timer
        // rather than silently replacing the text of the first.
        key={notice}
        className="toast"
        open={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
      >
        <Toast.Description className="toast-description">{notice}</Toast.Description>
        <Toast.Close asChild>
          <button className="icon-button" aria-label="Dismiss">
            ✕
          </button>
        </Toast.Close>
      </Toast.Root>
      <Toast.Viewport className="toast-viewport" />
    </Toast.Provider>
  );
}
