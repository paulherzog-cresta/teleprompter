import { useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import type { Settings as SettingsValue } from '../types';
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from '../lib/storage';
import { wakeLockSupported } from '../lib/useWakeLock';
import { ConfirmDialog } from './ConfirmDialog';

type Props = {
  settings: SettingsValue;
  scriptCount: number;
  onChange: (settings: SettingsValue) => void;
  onClearAll: () => void;
  onBack: () => void;
};

export function Settings({ settings, scriptCount, onChange, onClearAll, onBack }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="screen">
      <header className="app-bar">
        <button className="icon-button" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h1 className="app-bar-title">Settings</h1>
      </header>

      <div className="screen-body">
        <div className="field">
          <span className="field-label">
            Reading view — {Math.round(settings.readScale * 100)}%
          </span>
          <Slider.Root
            className="slider"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.05}
            value={[settings.readScale]}
            onValueChange={([readScale]) => onChange({ ...settings, readScale })}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" aria-label="Reading view text size" />
          </Slider.Root>

          <div className="preview preview-read" style={{ marginTop: 'var(--gap)' }}>
            <div className="entry entry-mine">
              <div className="entry-body">
                <span className="entry-role">You</span>
                <p className="entry-text">This is how your own lines will look.</p>
              </div>
            </div>
            <div className="entry entry-other">
              <div className="entry-body">
                <span className="entry-role">Customer</span>
                <p className="entry-text">And this is the other role.</p>
              </div>
            </div>
            <div className="entry entry-direction">
              <div className="entry-body">
                <p className="entry-text">Pause here, let it land.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">
            Teleprompter — {Math.round(settings.promptScale * 100)}%
          </span>
          <Slider.Root
            className="slider"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.05}
            value={[settings.promptScale]}
            onValueChange={([promptScale]) => onChange({ ...settings, promptScale })}
          >
            <Slider.Track className="slider-track">
              <Slider.Range className="slider-range" />
            </Slider.Track>
            <Slider.Thumb className="slider-thumb" aria-label="Teleprompter text size" />
          </Slider.Root>

          <div className="preview preview-prompt" style={{ marginTop: 'var(--gap)' }}>
            <div className="entry entry-mine">
              <div className="entry-body">
                <span className="entry-role">You</span>
                <p className="entry-text">Sized to glance at.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="field">
          <span className="field-label">This device</span>
          <p className="hint">
            Scripts live in this browser's storage and nowhere else. Nothing is uploaded, and
            editing a script on another device will not update this one.
          </p>
          <p className="hint">
            Screen wake lock: {wakeLockSupported ? 'supported' : 'not supported in this browser'}.
          </p>
          <button
            className="button button-danger"
            style={{ marginTop: 'var(--gap)' }}
            disabled={scriptCount === 0}
            onClick={() => setConfirmClear(true)}
          >
            Clear all scripts
          </button>
        </div>

        <p className="hint version">
          Teleprompter {__APP_VERSION__} · built {__BUILD_DATE__}
        </p>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={`Delete all ${scriptCount} scripts?`}
        description="Every script on this device goes, along with its reading position. This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={() => {
          onClearAll();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
