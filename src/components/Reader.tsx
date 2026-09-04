import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Script } from '../types';
import { useWakeLock } from '../lib/useWakeLock';
import { entryTypeClass } from '../lib/entryStyle';
import { Overview } from './Overview';

type Props = {
  script: Script;
  /** Relative so a burst of taps still lands one step each, ahead of any re-render. */
  onMove: (delta: number) => void;
  onJump: (index: number) => void;
  onPickRole: (role: string) => void;
  onExit: () => void;
};

const SWIPE_DISTANCE = 40;
const TAP_SLOP = 12;
const TAP_MAX_MS = 600;
const PINCH_OPEN_RATIO = 1.25;
/** A tap fires touchend and then a synthetic click; ignore the second one. */
const SYNTHETIC_CLICK_MS = 700;

type Gesture = { x: number; y: number; t: number; pinchBase: number | null; multi: boolean };

function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function Reader({ script, onMove, onJump, onPickRole, onExit }: Props) {
  const { entries, cursor, myRole } = script;
  const [overviewOpen, setOverviewOpen] = useState(false);

  // Held for the whole time the reader is on screen, overview included.
  useWakeLock(true);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // Every entry is rendered, and the whole stack slides so the current one
  // lands on the anchor line. Keeping the DOM stable is what lets the movement
  // animate instead of jumping.
  const [offset, setOffset] = useState(0);

  const measure = useCallback(() => {
    const el = itemRefs.current[cursorRef.current];
    if (el) setOffset(el.offsetTop);
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, cursor, entries]);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(stack);
    return () => observer.disconnect();
  }, [measure]);

  const move = useCallback((delta: number) => onMove(delta), [onMove]);

  const gesture = useRef<Gesture | null>(null);
  const lastTouchEnd = useRef(0);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      gesture.current = { x: 0, y: 0, t: 0, pinchBase: touchDistance(e.touches), multi: true };
      return;
    }
    const touch = e.touches[0];
    gesture.current = {
      x: touch.clientX,
      y: touch.clientY,
      t: Date.now(),
      pinchBase: null,
      multi: false,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g || e.touches.length < 2) return;
    g.multi = true;
    const distance = touchDistance(e.touches);
    if (g.pinchBase === null) {
      g.pinchBase = distance;
      return;
    }
    if (distance / g.pinchBase > PINCH_OPEN_RATIO) {
      setOverviewOpen(true);
      gesture.current = null;
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    lastTouchEnd.current = Date.now();
    if (e.touches.length > 0) return; // still mid-gesture with another finger down
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.multi) return;

    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - g.x;
    const dy = touch.clientY - g.y;

    if (Math.abs(dy) >= SWIPE_DISTANCE && Math.abs(dy) > Math.abs(dx)) {
      move(dy < 0 ? 1 : -1);
      return;
    }
    if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && Date.now() - g.t < TAP_MAX_MS) {
      move(1);
    }
  };

  const onClick = () => {
    if (Date.now() - lastTouchEnd.current < SYNTHETIC_CLICK_MS) return;
    move(1);
  };

  // Safari answers pinch with its own gesture events, which are more reliable
  // there than reading raw touch points.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onGesture = (event: Event) => {
      event.preventDefault();
      const { scale } = event as Event & { scale?: number };
      if (typeof scale === 'number' && scale > PINCH_OPEN_RATIO) setOverviewOpen(true);
    };
    el.addEventListener('gesturestart', onGesture, { passive: false });
    el.addEventListener('gesturechange', onGesture, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', onGesture);
      el.removeEventListener('gesturechange', onGesture);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (overviewOpen) {
        if (e.key === 'Escape') setOverviewOpen(false);
        return;
      }
      switch (e.key) {
        case ' ':
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          move(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          move(-1);
          break;
        case 'Escape':
          onExit();
          break;
        case 'o':
        case 'O':
          setOverviewOpen(true);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const progress = ((cursor + 1) / entries.length) * 100;

  return (
    <div className="reader">
      <div className="reader-progress">
        <div className="reader-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <header className="reader-bar">
        <button className="icon-button" onClick={onExit} aria-label="Back to library">
          ‹
        </button>
        <span className="reader-bar-title">{script.title}</span>
        <button
          className="icon-button"
          onClick={() => setOverviewOpen(true)}
          aria-label="Script overview"
        >
          ☰
        </button>
      </header>

      <div
        ref={surfaceRef}
        className="reader-surface"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          gesture.current = null;
        }}
        onClick={onClick}
      >
        <div
          ref={stackRef}
          className="reader-stack"
          style={{ transform: `translateY(${-offset}px)` }}
        >
          {entries.map((entry, index) => {
            const distance = index - cursor;
            const position =
              distance === 0
                ? 'at-current'
                : distance === 1
                  ? 'at-next'
                  : distance === 2
                    ? 'at-next-2'
                    : distance === -1
                      ? 'at-prev'
                      : 'at-far';
            return (
              <div
                key={index}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={`entry ${entryTypeClass(entry, myRole)} ${position}`}
              >
                {entry.kind === 'line' && entry.role !== myRole && (
                  <span className="entry-role">{entry.role}</span>
                )}
                <p className="entry-text">{entry.text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {overviewOpen && (
        <Overview
          entries={entries}
          cursor={cursor}
          myRole={myRole}
          onJump={(index) => {
            onJump(index);
            setOverviewOpen(false);
          }}
          onClose={() => setOverviewOpen(false)}
        />
      )}

      {myRole === null && script.roles.length > 0 && (
        <div className="role-prompt" role="dialog" aria-label="Pick your role">
          <div className="role-prompt-card">
            <h2>Which one are you?</h2>
            <p className="hint">Your lines get the brightest, largest text.</p>
            <div className="role-options">
              {script.roles.map((role) => (
                <button key={role} className="role-option" onClick={() => onPickRole(role)}>
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
