import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Script } from '../types';
import { chunkPayload, encodeScript, handoffUrl, newSessionId } from '../lib/handoff';

type Props = {
  script: Script;
  onBack: () => void;
};

/** Slow enough to catch, fast enough that three codes take under five seconds. */
const CYCLE_MS = 1500;
const QR_PIXELS = 320;

export function Share({ script, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { encoded, chunks, url } = useMemo(() => {
    const value = encodeScript(script);
    return {
      encoded: value,
      chunks: chunkPayload(value, newSessionId()),
      url: handoffUrl(value),
    };
  }, [script]);

  useEffect(() => setIndex(0), [chunks]);

  useEffect(() => {
    if (chunks.length <= 1) return;
    const timer = window.setInterval(
      () => setIndex((previous) => (previous + 1) % chunks.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(timer);
  }, [chunks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const data = chunks[index];
    if (!canvas || data === undefined) return;
    QRCode.toCanvas(canvas, data, {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: QR_PIXELS,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => setError('This script is too long to put in a QR code. Use the link instead.'));
  }, [chunks, index]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not reach the clipboard. Select the link below and copy it by hand.');
    }
  };

  const sizeKb = (encoded.length / 1024).toFixed(1);

  return (
    <div className="screen">
      <header className="app-bar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1 className="app-bar-title">Send to phone</h1>
      </header>

      <div className="screen-body">
        <div className="share">
          <div className="share-qr">
            <canvas ref={canvasRef} width={QR_PIXELS} height={QR_PIXELS} />
          </div>

          <p className="share-status">
            {chunks.length === 1 ? (
              <>Point your phone at this code.</>
            ) : (
              <>
                Showing {index + 1} of {chunks.length} — hold your phone steady, it loops.
              </>
            )}
          </p>

          {chunks.length > 1 && (
            <div className="share-dots" aria-hidden="true">
              {chunks.map((_, i) => (
                <span key={i} className={i === index ? 'is-active' : undefined} />
              ))}
            </div>
          )}

          <p className="hint">
            {script.title} · {script.entries.length} entries · {sizeKb} KB compressed ·{' '}
            {chunks.length === 1 ? 'one code' : `${chunks.length} codes`}
          </p>

          {error !== null && <div className="banner banner-error">{error}</div>}

          <div className="share-link">
            <button className="button button-primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
          </div>

          <p className="hint">
            The link carries the whole script in the part after the <code>#</code>, which never
            reaches a server. Sending it over Slack is how you get a script to someone else, and how
            you skip the QR entirely when a script is long.
          </p>
        </div>
      </div>
    </div>
  );
}
