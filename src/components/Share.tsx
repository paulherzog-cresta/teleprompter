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

type Plan =
  /** The whole link in one code, which the phone's own camera app can open. */
  | { mode: 'link'; codes: string[]; version: number }
  /** Too long for one code, so it goes as chunks the in-app scanner reassembles. */
  | { mode: 'chunks'; codes: string[]; version: null };

export function Share({ script, onBack }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { encoded, url, plan } = useMemo(() => {
    const value = encodeScript(script);
    const link = handoffUrl(value);

    let next: Plan;
    try {
      // Throws when the link is past what a single level-L code can hold.
      const probe = QRCode.create(link, { errorCorrectionLevel: 'L' });
      next = { mode: 'link', codes: [link], version: probe.version };
    } catch {
      next = { mode: 'chunks', codes: chunkPayload(value, newSessionId()), version: null };
    }
    return { encoded: value, url: link, plan: next };
  }, [script]);

  // A denser code needs more pixels to stay readable from a foot away.
  const pixels = Math.min(460, Math.max(320, (plan.version ?? 26) * 13));

  useEffect(() => setIndex(0), [plan]);

  useEffect(() => {
    if (plan.codes.length <= 1) return;
    const timer = window.setInterval(
      () => setIndex((previous) => (previous + 1) % plan.codes.length),
      CYCLE_MS,
    );
    return () => window.clearInterval(timer);
  }, [plan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const data = plan.codes[index];
    if (!canvas || data === undefined) return;
    QRCode.toCanvas(canvas, data, {
      errorCorrectionLevel: 'L',
      margin: 2,
      width: pixels,
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => setError('This script is too long to put in a QR code. Use the link instead.'));
  }, [plan, index, pixels]);

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
            <canvas ref={canvasRef} style={{ width: pixels, height: pixels }} />
          </div>

          {plan.mode === 'link' ? (
            <>
              <p className="share-status">
                Point your phone's camera at this. Tap the link it offers.
              </p>
              <p className="hint">
                Your normal camera app works — there is nothing to open in the teleprompter first.
              </p>
            </>
          ) : (
            <>
              <p className="share-status">
                Too long for one code — showing {index + 1} of {plan.codes.length}, on a loop.
              </p>
              <div className="share-dots" aria-hidden="true">
                {plan.codes.map((_, i) => (
                  <span key={i} className={i === index ? 'is-active' : undefined} />
                ))}
              </div>
              <div className="banner banner-warn banner-block">
                A split code is not a link, so your camera app cannot read it. On the phone, open
                the teleprompter, tap <strong>Scan</strong>, and hold it here — or just copy the
                link below and send it to yourself.
              </div>
            </>
          )}

          <p className="hint">
            {script.title} · {script.entries.length} entries · {sizeKb} KB ·{' '}
            {plan.mode === 'link' ? 'one code' : `${plan.codes.length} codes`}
          </p>

          {error !== null && <div className="banner banner-error">{error}</div>}

          <div className="share-link">
            <button className="button button-primary" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
          </div>

          <p className="hint">
            The whole script rides in the part of the link after the <code>#</code>, which browsers
            never send to a server. Sending it over Slack is how you get a script to someone else.
          </p>
        </div>
      </div>
    </div>
  );
}
