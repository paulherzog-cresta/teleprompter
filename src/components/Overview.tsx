import { useEffect, useRef } from 'react';
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
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="overview" role="dialog" aria-label="Script overview">
      <div className="overview-bar">
        <span className="overview-title">
          {entries.length} entries · line {cursor + 1}
        </span>
        <button className="icon-button" onClick={onClose} aria-label="Close overview">
          ✕
        </button>
      </div>

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
              {entry.kind === 'line' && entry.role !== myRole && (
                <span className="overview-role">{entry.role}</span>
              )}
              <span className="overview-text">{entry.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
