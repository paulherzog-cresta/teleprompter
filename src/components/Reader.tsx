import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { ReadingMode, Script } from '../types';
import { useWakeLock } from '../lib/useWakeLock';
import { PromptView } from './PromptView';
import { ReadView } from './ReadView';

type Props = {
  script: Script;
  mode: ReadingMode;
  onMode: (mode: ReadingMode) => void;
  onCursor: (cursor: number) => void;
  onPickRole: (role: string) => void;
  onExit: () => void;
};

export function Reader({ script, mode, onMode, onCursor, onPickRole, onExit }: Props) {
  const { entries, myRole } = script;
  // Asked once on entry. Dismissing leaves the script readable, just unhighlighted.
  const [rolePromptOpen, setRolePromptOpen] = useState(script.myRole === null);
  const [barHeight, setBarHeight] = useState(0);
  const barRef = useRef<HTMLElement>(null);

  // Held for the whole time the reader is on screen, in either mode.
  useWakeLock(true);

  // Read mode pads its content by the bar height, so text never sits beneath it.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const update = () => setBarHeight(bar.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const [progressIndex, setProgressIndex] = useState(script.cursor);
  const handleCursor = useCallback(
    (cursor: number) => {
      setProgressIndex(cursor);
      onCursor(cursor);
    },
    [onCursor],
  );

  const toRead = useCallback(() => onMode('read'), [onMode]);
  const toPrompt = useCallback(() => onMode('prompt'), [onMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
      else if (e.key === 'm' || e.key === 'M') onMode(mode === 'read' ? 'prompt' : 'read');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const progress = entries.length > 0 ? ((progressIndex + 1) / entries.length) * 100 : 0;

  return (
    <div className={`reader reader-${mode}`}>
      <div className="reader-progress">
        <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <header className="reader-bar" ref={barRef}>
        <button className="icon-button" onClick={onExit} aria-label="Back to library">
          ‹
        </button>
        <span className="reader-bar-title">{script.title}</span>
        <ToggleGroup.Root
          className="segmented"
          type="single"
          value={mode}
          aria-label="Reading mode"
          onValueChange={(next) => {
            // Radix clears the value when you press the active item; keep it.
            if (next === 'read' || next === 'prompt') onMode(next);
          }}
        >
          <ToggleGroup.Item className="segmented-item" value="read">
            Read
          </ToggleGroup.Item>
          <ToggleGroup.Item className="segmented-item" value="prompt">
            Prompt
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </header>

      {mode === 'prompt' ? (
        <PromptView
          key={`prompt-${script.id}`}
          entries={entries}
          myRole={myRole}
          cursor={script.cursor}
          onCursor={handleCursor}
          onLeaveMode={toRead}
        />
      ) : (
        <ReadView
          key={`read-${script.id}`}
          entries={entries}
          myRole={myRole}
          cursor={script.cursor}
          onCursor={handleCursor}
          onLeaveMode={toPrompt}
          topInset={barHeight}
        />
      )}

      <Dialog.Root open={rolePromptOpen} onOpenChange={setRolePromptOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title className="dialog-title">Which one are you?</Dialog.Title>
            <Dialog.Description className="dialog-description">
              Your lines get the brightest text and your name in colour.
            </Dialog.Description>
            <div className="role-options">
              {script.roles.map((role) => (
                <button
                  key={role}
                  className="role-option"
                  onClick={() => {
                    onPickRole(role);
                    setRolePromptOpen(false);
                  }}
                >
                  {role}
                </button>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
