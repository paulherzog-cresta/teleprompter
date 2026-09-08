import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  ChunkAssembler,
  HandoffError,
  decodeScript,
  readScannedCode,
  type HandoffScript,
} from '../lib/handoff';

type Props = {
  onImport: (script: HandoffScript) => void;
  onPasteInstead: () => void;
  onBack: () => void;
};

type Status =
  | { kind: 'starting' }
  | { kind: 'scanning' }
  | { kind: 'blocked'; message: string };

export function Scan({ onImport, onPasteInstead, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'starting' });
  const [progress, setProgress] = useState({ captured: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  // Held in a ref so a re-render of the parent never restarts the camera.
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let done = false;
    const assembler = new ChunkAssembler();

    const stop = () => {
      done = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const tick = () => {
      if (done) return;
      frame = requestAnimationFrame(tick);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width === 0 || height === 0) return;

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      context.drawImage(video, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const found = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' });
      if (!found) return;

      // A single code carries the whole link; a split one carries a chunk.
      const scanned = readScannedCode(found.data);
      if (scanned === null) return;

      let encoded: string;
      if (scanned.kind === 'payload') {
        encoded = scanned.encoded;
        setProgress({ captured: 1, total: 1 });
      } else {
        const state = assembler.add(scanned.chunk);
        setProgress({ captured: state.captured, total: state.total });
        if (state.encoded === null) return;
        encoded = state.encoded;
      }

      try {
        const script = decodeScript(encoded);
        stop();
        onImportRef.current(script);
      } catch (caught) {
        assembler.reset();
        setProgress({ captured: 0, total: 0 });
        setError(
          caught instanceof HandoffError
            ? caught.message
            : 'That code could not be read. Try again, or use the link instead.',
        );
      }
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus({
          kind: 'blocked',
          message:
            'This browser will not open the camera here. That usually means the page is not on HTTPS.',
        });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (done) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus({ kind: 'scanning' });
        frame = requestAnimationFrame(tick);
      } catch (caught) {
        const name = caught instanceof Error ? caught.name : '';
        setStatus({
          kind: 'blocked',
          message:
            name === 'NotAllowedError'
              ? 'Camera access was declined. Allow it in your browser settings, or paste the link instead.'
              : name === 'NotFoundError'
                ? 'No camera found on this device.'
                : 'The camera could not be started.',
        });
      }
    };

    void start();
    return stop;
  }, []);

  return (
    <div className="screen">
      <header className="app-bar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1 className="app-bar-title">Scan</h1>
      </header>

      <div className="screen-body">
        {status.kind === 'blocked' ? (
          <div className="empty">
            <p>{status.message}</p>
            <button className="button button-primary" onClick={onPasteInstead}>
              Paste a script instead
            </button>
          </div>
        ) : (
          <div className="scan stack">
            <div className="scan-frame">
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} hidden />
            </div>

            <p className="scan-status" role="status">
              {progress.total === 0
                ? status.kind === 'starting'
                  ? 'Starting the camera…'
                  : 'Point at the code on your laptop.'
                : progress.captured >= progress.total
                  ? 'Assembling…'
                  : `${progress.captured} of ${progress.total} captured — keep holding steady.`}
            </p>

            {progress.total > 1 && (
              <div className="share-dots" aria-hidden="true">
                {Array.from({ length: progress.total }, (_, i) => (
                  <span key={i} className={i < progress.captured ? 'is-active' : undefined} />
                ))}
              </div>
            )}

            {error !== null && <div className="banner banner-error">{error}</div>}

            <p className="hint">
              A long script cycles through several codes. Hold the phone still and they will all
              come round — there is nothing to tap on either screen.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
