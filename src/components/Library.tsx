import { useRef, useState } from 'react';
import type { Script } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  scripts: Script[];
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onShare: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onScan: () => void;
  onSettings: () => void;
};

const SWIPE_REVEAL = 50;

export function Library({
  scripts,
  onOpen,
  onEdit,
  onShare,
  onDelete,
  onNew,
  onScan,
  onSettings,
}: Props) {
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Script | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const askDelete = (script: Script) => {
    setSwipedId(null);
    setPendingDelete(script);
  };

  const sorted = [...scripts].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="screen">
      <header className="app-bar">
        <h1 className="app-bar-title">Scripts</h1>
        <div className="app-bar-actions">
          {/* Scanning is the phone's way in; authoring is the laptop's. */}
          <button className="button narrow-only" onClick={onScan}>
            Scan
          </button>
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
              Copy a role-play sheet — header row on top, one column per role — and paste it in, or
              drop the exported CSV straight onto the box.
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
                      askDelete(script);
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
                        {script.cursor > 0
                          ? `line ${script.cursor + 1} of ${total}`
                          : `${total} entries`}
                      </span>
                    </div>

                    {/* Wide screens only. On touch these live behind the swipe. */}
                    <div className="library-row-actions">
                      <button
                        className="button button-quiet"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShare(script.id);
                        }}
                      >
                        Send to phone
                      </button>
                      <button
                        className="button button-quiet"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(script.id);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="button button-quiet button-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          askDelete(script);
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    <div className="library-row-progress">
                      <div style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <button className="library-delete" onClick={() => askDelete(script)}>
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete "${pendingDelete?.title ?? ''}"?`}
        description="This removes it from this device only, and cannot be undone. If the script came from a link or a QR code, you can bring it back the same way."
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
