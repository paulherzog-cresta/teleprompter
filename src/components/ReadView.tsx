import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import { entryTypeClass } from '../lib/entryStyle';

type Props = {
  entries: Entry[];
  myRole: string | null;
  cursor: number;
  onCursor: (cursor: number) => void;
  onLeaveMode: () => void;
  /** Height of the top bar, so nothing is read from underneath it. */
  topInset: number;
  topSignal: number;
};

const PINCH_CLOSE_RATIO = 0.8;
const PERSIST_DEBOUNCE_MS = 400;
/** Clearance under the bar, so a line scrolled to rests just below it. */
const READING_OFFSET = 12;

function touchDistance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * The clean reading view and the default: the whole script at a comfortable
 * size, scrolled normally, nothing dimmed. Position is still tracked quietly so
 * the library progress stays honest and prompt mode picks up where you left off.
 */
export function ReadView({
  entries,
  myRole,
  cursor,
  onCursor,
  onLeaveMode,
  topInset,
  topSignal,
}: Props) {
  const [current, setCurrent] = useState(() =>
    Math.min(Math.max(0, cursor), Math.max(0, entries.length - 1)),
  );

  const surfaceRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const offsetsRef = useRef<number[]>([]);
  const currentRef = useRef(current);
  currentRef.current = current;
  const rafPending = useRef(false);
  const pinchBase = useRef<number | null>(null);

  // The bar is opaque and overlays the top of the scroller, so the reading
  // position sits below it — otherwise a line scrolled to hides behind it.
  const readingOffsetRef = useRef(0);
  readingOffsetRef.current = topInset + READING_OFFSET;

  const measure = useCallback(() => {
    offsetsRef.current = itemRefs.current.map((el) => el?.offsetTop ?? 0);
  }, []);

  const scrollToIndex = useCallback((index: number, smooth = false) => {
    const surface = surfaceRef.current;
    const offsets = offsetsRef.current;
    if (!surface || offsets.length === 0) return;
    const clamped = Math.min(offsets.length - 1, Math.max(0, index));
    surface.scrollTo({
      top: Math.max(0, offsets[clamped] - readingOffsetRef.current),
      behavior: smooth ? 'smooth' : 'auto',
    });
    setCurrent(clamped);
  }, []);

  useLayoutEffect(() => {
    measure();
    scrollToIndex(cursor);

  }, []);

  // Seeded with the value at mount so switching modes does not read as a request.
  const lastTopSignal = useRef(topSignal);
  useEffect(() => {
    if (topSignal === lastTopSignal.current) return;
    lastTopSignal.current = topSignal;
    scrollToIndex(0, true);
  }, [topSignal, scrollToIndex]);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(stack);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const timer = window.setTimeout(() => onCursor(current), PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [current, onCursor]);

  const handleScroll = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      const surface = surfaceRef.current;
      if (!surface) return;
      const line = surface.scrollTop + readingOffsetRef.current + 1;
      const offsets = offsetsRef.current;
      let next = 0;
      for (let i = 0; i < offsets.length; i++) {
        if (offsets[i] <= line) next = i;
        else break;
      }
      if (next !== currentRef.current) setCurrent(next);
    });
  };

  // Pinching in is the shortcut into prompt mode, mirroring pinch-out back.
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return;
    const distance = touchDistance(e.touches);
    if (pinchBase.current === null) {
      pinchBase.current = distance;
      return;
    }
    if (distance / pinchBase.current < PINCH_CLOSE_RATIO) {
      pinchBase.current = null;
      onLeaveMode();
    }
  };

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const onGesture = (event: Event) => {
      event.preventDefault();
      const { scale } = event as Event & { scale?: number };
      if (typeof scale === 'number' && scale > 0 && scale < PINCH_CLOSE_RATIO) onLeaveMode();
    };
    el.addEventListener('gesturestart', onGesture, { passive: false });
    el.addEventListener('gesturechange', onGesture, { passive: false });
    return () => {
      el.removeEventListener('gesturestart', onGesture);
      el.removeEventListener('gesturechange', onGesture);
    };
  }, [onLeaveMode]);

  return (
    <div
      ref={surfaceRef}
      className="readview"
      onScroll={handleScroll}
      onTouchMove={onTouchMove}
      onTouchEnd={() => {
        pinchBase.current = null;
      }}
    >
      <div ref={stackRef} className="readview-stack" style={{ paddingTop: topInset + 12 }}>
        {entries.map((entry, index) => {
          // Tapping a spoken line runs it up to the reading position. Directions
          // are cues, not somewhere you would want to move to.
          const tappable = entry.kind === 'line';
          return (
            <div
              key={index}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className={`entry ${entryTypeClass(entry, myRole)}${tappable ? ' is-tappable' : ''}`}
              onClick={
                tappable
                  ? () => {
                      // Do not hijack the click that ends a text selection.
                      if (window.getSelection()?.toString()) return;
                      scrollToIndex(index, true);
                    }
                  : undefined
              }
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
  );
}
