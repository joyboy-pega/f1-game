'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/lib/game/store';
import { ControlsPanel } from './ControlsPanel';
import { SettingsPanel } from './SettingsPanel';
import { MODE_NAMES } from './format';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

const TABS = ['Settings', 'Controls'] as const;

/** Pause modal. Opened by Esc/M or the pause button; the world is frozen while it is open. */
export function PauseMenu({ onResume, onRestart, onExitToMenu }: PauseMenuProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Settings');
  const resumeRef = useRef<HTMLButtonElement>(null);
  const mode = useGameStore((s) => s.settings.mode);

  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

  return (
    <div className="m-scrim" role="dialog" aria-modal="true" aria-label="Paused">
      <section className="m-card">
        <header className="m-head">
          <div>
            <div className="m-kicker">{MODE_NAMES[mode]} · Buddh International Circuit</div>
            <h2 className="m-title">Paused</h2>
          </div>
          <button ref={resumeRef} type="button" className="m-btn m-btn-primary" onClick={onResume}>
            Resume <kbd>Esc</kbd>
          </button>
        </header>

        <div className="m-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`m-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="m-body">{tab === 'Settings' ? <SettingsPanel /> : <ControlsPanel />}</div>

        <footer className="m-foot">
          <button type="button" className="m-btn" onClick={onRestart}>
            Restart session
          </button>
          <button type="button" className="m-btn m-btn-danger" onClick={onExitToMenu}>
            Quit to lobby
          </button>
        </footer>
      </section>
    </div>
  );
}
