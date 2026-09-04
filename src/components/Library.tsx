import { useRef, useState } from 'react';
import type { Script } from '../types';

type Props = {
  scripts: Script[];
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
};

const SWIPE_REVEAL = 50;

export function Library({ scripts, onOpen, onEdit, onDelete, onNew, onSettings }: Props) {
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const confirmDelete = (script: Script) => {
    setSwipedId(null);
    if (window.confirm(`Delete "${script.title}"? This device only — it cannot be undone.`)) {
      onDelete(script.id);
    }
  };

  const sorted = [...scripts].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="screen">
      <header className="app-bar">
        <h1 className="app-bar-title">Scripts</h1>
        <div className="app-bar-actions">
          <button className="button" onClick={onNew}>
            Add script
          </button>
          <button className="icon-button" onClick={onSettings} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      <div className="screen-body">
        {sorted.length === 0 ? (
          <div className="empty">
            <p>No scripts yet.</p>
            <p className="hint">
              Copy a role-play sheet — header row on top, one column per role — and paste it in.
            </p>
            <button className="button button-primary" onClick={onNew}>
              Add your first script
            </button>
          </div>
        ) : (
          <ul className="library-list">
            {sorted.map((script) => {
              const total = script.entries.length;
              const progress = total > 0 ? ((script.cursor + 1) / total) * 100 : 0;
              return (
                <li
                  key={script.id}
                  className={`library-row${swipedId === script.id ? ' is-swiped' : ''}`}
                >
                  <div
                    className="library-row-inner"
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      swipeStart.current = { x: touch.clientX, y: touch.clientY };
                    }}
                    onTouchEnd={(e) => {
                      const start = swipeStart.current;
                      swipeStart.current = null;
                      const touch = e.changedTouches[0];
                      if (!start || !touch) return;
                      const dx = touch.clientX - start.x;
                      const dy = touch.clientY - start.y;
                      if (Math.abs(dx) < Math.abs(dy)) return;
                      if (dx <= -SWIPE_REVEAL) setSwipedId(script.id);
                      else if (dx >= SWIPE_REVEAL) setSwipedId(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      confirmDelete(script);
                    }}
                    onClick={() => {
                      if (swipedId === script.id) setSwipedId(null);
                      else onOpen(script.id);
                    }}
                  >
                    <div className="library-row-main">
                      <span className="library-row-title">{script.title}</span>
                      <span className="library-row-meta">
                        {script.myRole ? `${script.myRole} · ` : 'no role picked · '}
                        {script.cursor > 0 ? `line ${script.cursor + 1} of ${total}` : `${total} entries`}
                      </span>
                    </div>
                    <button
                      className="button button-quiet library-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(script.id);
                      }}
                    >
                      Edit
                    </button>

                    <div className="library-row-progress">
                      <div style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <button className="library-delete" onClick={() => confirmDelete(script)}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
