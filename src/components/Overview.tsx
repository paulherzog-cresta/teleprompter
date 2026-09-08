import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Entry } from '../types';
import { entryTypeClass } from '../lib/entryStyle';

type Props = {
  entries: Entry[];
  cursor: number;
  myRole: string | null;
  onJump: (index: number) => void;
  onClose: () => void;
};

export function Overview({ entries, cursor, myRole, onJump, onClose }: Props) {
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      currentRef.current?.scrollIntoView({ block: 'center' }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="overview"
          // Focus would otherwise jump to the first entry and scroll the list
          // away from where the reader actually is.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="overview-bar">
            <Dialog.Title className="overview-title">
              {entries.length} entries · line {cursor + 1}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="Close overview">
                ✕
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="visually-hidden">
            The whole script. Choose an entry to jump to it.
          </Dialog.Description>

          <ol className="overview-list">
            {entries.map((entry, index) => (
              <li key={index}>
                <button
                  ref={index === cursor ? currentRef : undefined}
                  className={`overview-item ${entryTypeClass(entry, myRole)}${
                    index === cursor ? ' is-current' : ''
                  }`}
                  onClick={() => onJump(index)}
                >
                  {entry.kind === 'line' && <span className="overview-role">{entry.role}</span>}
                  <span className="overview-text">{entry.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
