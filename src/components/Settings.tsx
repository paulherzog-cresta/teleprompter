import type { Settings as SettingsValue } from '../types';
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from '../lib/storage';
import { wakeLockSupported } from '../lib/useWakeLock';

type Props = {
  settings: SettingsValue;
  scriptCount: number;
  onChange: (settings: SettingsValue) => void;
  onClearAll: () => void;
  onBack: () => void;
};

export function Settings({ settings, scriptCount, onChange, onClearAll, onBack }: Props) {
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
          <span className="field-label">Text size — {Math.round(settings.fontScale * 100)}%</span>
          <input
            className="slider"
            type="range"
            min={FONT_SCALE_MIN}
            max={FONT_SCALE_MAX}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => onChange({ ...settings, fontScale: Number(e.target.value) })}
          />
          <div className="preview">
            <div className="entry entry-mine">
              <p className="entry-text">This is how your own lines will look.</p>
            </div>
            <div className="entry entry-other">
              <span className="entry-role">Customer</span>
              <p className="entry-text">And this is the other role.</p>
            </div>
            <div className="entry entry-direction">
              <p className="entry-text">Pause here, let it land.</p>
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
            disabled={scriptCount === 0}
            onClick={() => {
              if (
                window.confirm(
                  `Delete all ${scriptCount} scripts on this device? This cannot be undone.`,
                )
              ) {
                onClearAll();
              }
            }}
          >
            Clear all scripts
          </button>
        </div>

        <p className="hint version">
          Teleprompter {__APP_VERSION__} · built {__BUILD_DATE__}
        </p>
      </div>
    </div>
  );
}
