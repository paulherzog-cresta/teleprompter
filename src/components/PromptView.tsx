import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import { entryTypeClass } from '../lib/entryStyle';

type Props = {
  entries: Entry[];
  myRole: string | null;
  cursor: number;
  onCursor: (cursor: number) => void;
  onLeaveMode: () => void;
  topSignal: number;
};

/** How far down the screen the reading line sits. */
const ANCHOR_RATIO = 0.38;
const TAP_SLOP = 12;
const TAP_MAX_MS = 600;
const SCROLL_SLOP = 2;
/** A tap landing on a still-gliding list should stop it, not advance. */
const MOMENTUM_GUARD_MS = 150;
const PINCH_OPEN_RATIO = 1.25;
/** A tap fires touchend and then a synthetic click; ignore the second one. */
const SYNTHETIC_CLICK_MS = 700;
/** Long enough that a resize mid-scroll does not yank the page back. */
const REANCHOR_QUIET_MS = 400;
const PERSIST_DEBOUNCE_MS = 400;
/** Roughly how long a smooth scroll runs for. */
const INTENT_WINDOW_MS = 700;

type TouchState = {
  y: number;
  t: number;
  scrollTop: number;
  multi: boolean;
  pinchBase: number | null;
  momentumActive: boolean;
};

function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * The teleprompter: every entry rendered, the reading line pinned at 38%, and
 * the cursor derived from scroll position rather than driving it.
 */
export function PromptView({
  entries,
  myRole,
  cursor,
  onCursor,
  onLeaveMode,
  topSignal,
}: Props) {
  const [current, setCurrent] = useState(() =>
    Math.min(Math.max(0, cursor), Math.max(0, entries.length - 1)),
  );
  const [anchorTop, setAnchorTop] = useState(0);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const offsetsRef = useRef<number[]>([]);
  const anchorRef = useRef(0);
  const currentRef = useRef(current);
  currentRef.current = current;

  const lastScrollAt = useRef(0);
  const lastTouchEnd = useRef(0);
  const touching = useRef(false);
  const touchState = useRef<TouchState | null>(null);
  const rafPending = useRef(false);

  const measure = useCallback(() => {
    const surface = surfaceRef.current;
    const stack = stackRef.current;
    if (!surface || !stack) return;
    const height = surface.clientHeight;
    const anchor = Math.round(height * ANCHOR_RATIO);
    anchorRef.current = anchor;

    // Written straight to the DOM rather than through state, so the offsets
    // read on the next line already include the padding. Going through a
    // render would leave one frame where the two disagree, and a scroll in
    // that frame resolves to the wrong entry.
    stack.style.paddingTop = `${anchor}px`;
    // Enough tail that the last entry can still be pulled up to the anchor.
    stack.style.paddingBottom = `${Math.max(0, height - anchor)}px`;
    surface.style.scrollPaddingTop = `${anchor}px`;

    offsetsRef.current = itemRefs.current.map((el) => el?.offsetTop ?? 0);
    setAnchorTop((previous) => (previous === anchor ? previous : anchor));
  }, []);

  const deriveCurrent = useCallback((scrollTop: number) => {
    const offsets = offsetsRef.current;
    const anchorLine = scrollTop + anchorRef.current + 1;
    let index = 0;
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] <= anchorLine) index = i;
      else break;
    }
    return index;
  }, []);

  /**
   * Where the last tap asked to land. A smooth scroll takes a few hundred ms,
   * and the cursor derived from scroll position lags behind it — so a second
   * tap has to step from the intended entry, not the one still on screen.
   */
  const intent = useRef<{ index: number; at: number } | null>(null);

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const surface = surfaceRef.current;
    const offsets = offsetsRef.current;
    if (!surface || offsets.length === 0) return;
    const clamped = Math.min(offsets.length - 1, Math.max(0, index));
    surface.scrollTo({
      top: Math.max(0, offsets[clamped] - anchorRef.current),
      behavior: smooth ? 'smooth' : 'auto',
    });
    intent.current = { index: clamped, at: Date.now() };
    setCurrent(clamped);
  }, []);

  const step = useCallback(
    (delta: number) => {
      const pending = intent.current;
      const from =
        pending !== null && Date.now() - pending.at < INTENT_WINDOW_MS
          ? pending.index
          : currentRef.current;
      scrollToIndex(from + delta, true);
    },
    [scrollToIndex],
  );

  useLayoutEffect(() => {
    measure();
    scrollToIndex(cursor, false);
    // Runs once: later layout changes go through the ResizeObserver below.

  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    const stack = stackRef.current;
    if (!surface || !stack || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      measure();
      // Re-anchoring mid-scroll would fight the user — and on iOS the URL bar
      // collapsing fires a resize in the middle of exactly that.
      const quiet = !touching.current && Date.now() - lastScrollAt.current > REANCHOR_QUIET_MS;
      if (quiet) scrollToIndex(currentRef.current, false);
    });
    observer.observe(stack);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [measure, scrollToIndex]);

  useEffect(() => {
    const timer = window.setTimeout(() => onCursor(current), PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [current, onCursor]);

  // Seeded with the value at mount so switching modes does not read as a request.
  const lastTopSignal = useRef(topSignal);
  useEffect(() => {
    if (topSignal === lastTopSignal.current) return;
    lastTopSignal.current = topSignal;
    scrollToIndex(0, true);
  }, [topSignal, scrollToIndex]);

  const handleScroll = () => {
    lastScrollAt.current = Date.now();
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const surface = surfaceRef.current;
      if (!surface) return;
      const next = deriveCurrent(surface.scrollTop);
      if (next !== currentRef.current) setCurrent(next);
    });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touching.current = true;
    const surface = surfaceRef.current;
    if (e.touches.length >= 2) {
      touchState.current = {
        y: 0,
        t: 0,
        scrollTop: surface?.scrollTop ?? 0,
        multi: true,
        pinchBase: touchDistance(e.touches),
        momentumActive: false,
      };
      return;
    }
    const touch = e.touches[0];
    touchState.current = {
      y: touch.clientY,
      t: Date.now(),
      scrollTop: surface?.scrollTop ?? 0,
      multi: false,
      pinchBase: null,
      momentumActive: Date.now() - lastScrollAt.current < MOMENTUM_GUARD_MS,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const state = touchState.current;
    if (!state || e.touches.length < 2) return;
    state.multi = true;
    const distance = touchDistance(e.touches);
    if (state.pinchBase === null) {
      state.pinchBase = distance;
      return;
    }
    // Pinching out still works as a shortcut back to the reading view.
    if (distance / state.pinchBase > PINCH_OPEN_RATIO) {
      onLeaveMode();
      touchState.current = null;
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    lastTouchEnd.current = Date.now();
    if (e.touches.length > 0) return; // another finger is still down
    touching.current = false;

    const state = touchState.current;
    touchState.current = null;
    if (!state || state.multi || state.momentumActive) return;

    const surface = surfaceRef.current;
    const touch = e.changedTouches[0];
    if (!surface || !touch) return;

    const fingerMoved = Math.abs(touch.clientY - state.y) > TAP_SLOP;
    const listMoved = Math.abs(surface.scrollTop - state.scrollTop) > SCROLL_SLOP;
    const tooSlow = Date.now() - state.t > TAP_MAX_MS;
    if (fingerMoved || listMoved || tooSlow) return;

    stepFromTap(touch.clientY);
  };

  /** The reading line splits the screen: above it goes back, below goes on. */
  const stepFromTap = (clientY: number) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const lineY = surface.getBoundingClientRect().top + anchorRef.current;
    step(clientY < lineY ? -1 : 1);
  };

  const onClick = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchEnd.current < SYNTHETIC_CLICK_MS) return;
    stepFromTap(e.clientY);
  };

  // Safari answers pinch with its own gesture events, which are more reliable
  // there than reading raw touch points.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onGesture = (event: Event) => {
      event.preventDefault();
      const { scale } = event as Event & { scale?: number };
      if (typeof scale === 'number' && scale > PINCH_OPEN_RATIO) onLeaveMode();
    };
    el.addEventListener('gesturestart', onGesture, { passive: false });
    el.addEventListener('gesturechange', onGesture, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', onGesture);
      el.removeEventListener('gesturechange', onGesture);
    };
  }, [onLeaveMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          step(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          step(-1);
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <>
      {/* Marks the reading line, so it stays findable now that the text moves
          freely past it rather than being clamped to it. */}
      <div className="reader-anchor" style={{ top: anchorTop }} />

      <div
        ref={surfaceRef}
        className="reader-surface"
        onScroll={handleScroll}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touching.current = false;
          touchState.current = null;
        }}
        onClick={onClick}
      >
        <div ref={stackRef} className="reader-stack">
          {entries.map((entry, index) => {
            const distance = Math.abs(index - current);
            const position = distance === 0 ? 'at-current' : distance <= 2 ? 'at-near' : 'at-far';
            return (
              <div
                key={index}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className={`entry ${entryTypeClass(entry, myRole)} ${position}`}
              >
                <div className="entry-body">
                  {entry.kind === 'line' && <span className="entry-role">{entry.role}</span>}
                  <p className="entry-text">{entry.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
