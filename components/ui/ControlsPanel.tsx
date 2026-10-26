'use client';

import React, { useEffect, useState } from 'react';
import { Field, Key, Seg, Slider, Switch } from './kit';
import { useGameStore } from '@/lib/game/store';
import { DEFAULT_INPUT_SETTINGS, type InputSettings } from '@/lib/game/gameState';
import {
  controls,
  DEFAULT_KEY_HOLDS,
  DEFAULT_KEY_TRIGGERS,
  DEFAULT_PAD_BUTTONS,
  type ControlHold,
  type ControlTrigger,
} from '@/lib/game/controls';

interface ActionItem {
  id: string;
  name: string;
  category: 'driving' | 'car' | 'system';
  isHold: boolean;
  defaultKey: string;
  defaultPad: string;
}

const ACTIONS: ActionItem[] = [
  { id: 'throttle', name: 'Throttle / Accelerate', category: 'driving', isHold: true, defaultKey: 'W / ↑', defaultPad: 'RT (Btn 7)' },
  { id: 'brake', name: 'Brake / Reverse', category: 'driving', isHold: true, defaultKey: 'S / ↓', defaultPad: 'LT (Btn 6)' },
  { id: 'steerLeft', name: 'Steer Left', category: 'driving', isHold: true, defaultKey: 'A / ←', defaultPad: 'Left Stick ←' },
  { id: 'steerRight', name: 'Steer Right', category: 'driving', isHold: true, defaultKey: 'D / →', defaultPad: 'Left Stick →' },
  { id: 'handbrake', name: 'Handbrake', category: 'driving', isHold: true, defaultKey: 'Space', defaultPad: 'B (Btn 1)' },
  { id: 'ersBoost', name: 'ERS Boost (Overtake)', category: 'driving', isHold: true, defaultKey: 'Shift', defaultPad: 'X (Btn 2)' },
  { id: 'lookBack', name: 'Look Behind', category: 'driving', isHold: true, defaultKey: 'B', defaultPad: 'L3 / Stick ↓' },
  { id: 'drs', name: 'DRS Wing Toggle', category: 'car', isHold: false, defaultKey: 'F / E', defaultPad: 'A (Btn 0)' },
  { id: 'biasUp', name: 'Brake Bias Forward (+)', category: 'car', isHold: false, defaultKey: ']', defaultPad: 'RB (Btn 5)' },
  { id: 'biasDown', name: 'Brake Bias Rearward (-)', category: 'car', isHold: false, defaultKey: '[', defaultPad: 'LB (Btn 4)' },
  { id: 'pit', name: 'Box This Lap (Pit Call)', category: 'car', isHold: false, defaultKey: 'P', defaultPad: 'D-Pad ↓' },
  { id: 'compound', name: 'Next Pit Tyre Compound', category: 'car', isHold: false, defaultKey: 'O', defaultPad: 'D-Pad →' },
  { id: 'camera', name: 'Cycle Camera View', category: 'system', isHold: false, defaultKey: 'C', defaultPad: 'Y (Btn 3)' },
  { id: 'reset', name: 'Reset Car to Track', category: 'system', isHold: false, defaultKey: 'R', defaultPad: 'D-Pad ↑' },
  { id: 'telemetry', name: 'Toggle Telemetry Drawer', category: 'system', isHold: false, defaultKey: 'T', defaultPad: 'View / Back' },
  { id: 'menu', name: 'Pause / Menu', category: 'system', isHold: false, defaultKey: 'Esc / M', defaultPad: 'Menu / Start' },
];

function formatKeyCode(code: string): string {
  if (!code) return 'None';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Escape') return 'Esc';
  return code;
}

export function ControlsPanel() {
  const settings = useGameStore((s) => s.settings.input ?? DEFAULT_INPUT_SETTINGS);
  const setSettings = useGameStore((s) => s.setSettings);
  const [activeTab, setActiveTab] = useState<'bindings' | 'calibration'>('bindings');
  const [listeningAction, setListeningAction] = useState<{ id: string; target: 'key' | 'pad' } | null>(null);
  const [padInfo, setPadInfo] = useState<{ name: string; steer: number; throttle: number; brake: number } | null>(null);

  // Poll live gamepad status for visual diagnostics
  useEffect(() => {
    let animId: number;
    const pollPad = () => {
      const pad = controls.readGamepad();
      if (pad) {
        const steerAxis = settings.steerAxis ?? 0;
        const steer = pad.axes[steerAxis] ?? 0;
        let th = 0;
        let br = 0;
        if (settings.throttleAxis >= 0) {
          th = (pad.axes[settings.throttleAxis] + 1) * 0.5;
        } else {
          const btn = settings.customButtons['throttle'] ?? DEFAULT_PAD_BUTTONS.throttle;
          th = pad.buttons[btn]?.value ?? 0;
        }
        if (settings.brakeAxis >= 0) {
          br = (pad.axes[settings.brakeAxis] + 1) * 0.5;
        } else {
          const btn = settings.customButtons['brake'] ?? DEFAULT_PAD_BUTTONS.brake;
          br = pad.buttons[btn]?.value ?? 0;
        }
        setPadInfo({ name: pad.id, steer, throttle: th, brake: br });
      } else {
        setPadInfo(null);
      }
      animId = requestAnimationFrame(pollPad);
    };
    animId = requestAnimationFrame(pollPad);
    return () => cancelAnimationFrame(animId);
  }, [settings]);

  // Listener for keyboard/gamepad capture during remapping
  useEffect(() => {
    if (!listeningAction) return;

    if (listeningAction.target === 'key') {
      const handleKeyDown = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          setListeningAction(null);
          return;
        }
        const updated = {
          ...settings,
          customKeys: {
            ...settings.customKeys,
            [listeningAction.id]: e.code,
          },
        };
        setSettings({ input: updated });
        setListeningAction(null);
      };

      window.addEventListener('keydown', handleKeyDown, { capture: true, once: true });
      return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    } else {
      // Gamepad button capture loop
      let raf: number;
      const scanPad = () => {
        const pad = controls.readGamepad();
        if (pad) {
          for (let i = 0; i < pad.buttons.length; i++) {
            if (pad.buttons[i]?.pressed) {
              const updated = {
                ...settings,
                customButtons: {
                  ...settings.customButtons,
                  [listeningAction.id]: i,
                },
              };
              setSettings({ input: updated });
              setListeningAction(null);
              return;
            }
          }
        }
        raf = requestAnimationFrame(scanPad);
      };
      raf = requestAnimationFrame(scanPad);
      return () => cancelAnimationFrame(raf);
    }
  }, [listeningAction, settings, setSettings]);

  const updateInput = (patch: Partial<InputSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings({ input: updated });
  };

  const resetAllToDefaults = () => {
    setSettings({ input: { ...DEFAULT_INPUT_SETTINGS } });
  };

  return (
    <div className="k-ctl" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sub tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--ink-4)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('bindings')}
          className="k-tab"
          aria-selected={activeTab === 'bindings'}
          style={{ cursor: 'pointer', padding: '6px 14px', fontSize: '13px' }}
        >
          <span>Key &amp; Controller Bindings</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('calibration')}
          className="k-tab"
          aria-selected={activeTab === 'calibration'}
          style={{ cursor: 'pointer', padding: '6px 14px', fontSize: '13px' }}
        >
          <span>Gamepad &amp; Wheel Tuning</span>
        </button>
      </div>

      {/* Active remapping listener prompt */}
      {listeningAction && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--ink-3)',
            border: '2px solid var(--lime)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <b style={{ color: 'var(--lime)', display: 'block', fontSize: '13px' }}>
              REMAP: {ACTIONS.find((a) => a.id === listeningAction.id)?.name}
            </b>
            <span style={{ fontSize: '12px', color: 'var(--ink-mute)' }}>
              {listeningAction.target === 'key'
                ? 'Press any keyboard key to bind (or Esc to cancel)...'
                : 'Press any controller button to bind...'}
            </span>
          </div>
          <button
            type="button"
            className="m-btn"
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={() => setListeningAction(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Controller live diagnostic telemetry banner */}
      <div
        style={{
          background: 'var(--ink-3)',
          border: '1px solid var(--ink-4)',
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Controller Hardware
          </span>
          <span
            style={{
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: padInfo ? 'var(--lime)' : 'var(--ink-mute)',
            }}
          >
            {padInfo ? `● CONNECTED (${padInfo.name.slice(0, 32)})` : '○ NO GAMEPAD DETECTED'}
          </span>
        </div>
        {padInfo && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '11px' }}>
            <div>
              <span style={{ color: 'var(--ink-mute)', display: 'block' }}>Steer Axis</span>
              <div style={{ height: '6px', background: 'var(--ink-4)', position: 'relative', marginTop: '4px' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${((padInfo.steer + 1) / 2) * 100}%`,
                    width: '4px',
                    background: 'var(--lime)',
                    transform: 'translateX(-50%)',
                  }}
                />
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--ink-mute)', display: 'block' }}>Throttle</span>
              <div style={{ height: '6px', background: 'var(--ink-4)', position: 'relative', marginTop: '4px' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${Math.min(100, Math.max(0, padInfo.throttle * 100))}%`,
                    background: 'var(--lime)',
                  }}
                />
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--ink-mute)', display: 'block' }}>Brake</span>
              <div style={{ height: '6px', background: 'var(--ink-4)', position: 'relative', marginTop: '4px' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${Math.min(100, Math.max(0, padInfo.brake * 100))}%`,
                    background: 'var(--orange)',
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'bindings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="k-section-title" style={{ margin: 0 }}>Action Remappings</h3>
            <button
              type="button"
              className="m-btn"
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={resetAllToDefaults}
            >
              Reset to Defaults
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--ink-4)', color: 'var(--ink-mute)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Action</th>
                  <th style={{ padding: '8px' }}>Keyboard Key</th>
                  <th style={{ padding: '8px' }}>Controller Button</th>
                </tr>
              </thead>
              <tbody>
                {ACTIONS.map((action) => {
                  const customKey = settings.customKeys[action.id];
                  const customBtn = settings.customButtons[action.id];
                  const keyDisplay = customKey ? formatKeyCode(customKey) : action.defaultKey;
                  const padDisplay =
                    customBtn !== undefined ? `Btn ${customBtn}` : action.defaultPad;

                  return (
                    <tr
                      key={action.id}
                      style={{
                        borderBottom: '1px solid var(--ink-4)',
                        background: listeningAction?.id === action.id ? 'var(--ink-3)' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px', fontWeight: 600 }}>{action.name}</td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Key>{keyDisplay}</Key>
                          <button
                            type="button"
                            className="m-btn"
                            style={{ padding: '2px 8px', fontSize: '10px' }}
                            onClick={() => setListeningAction({ id: action.id, target: 'key' })}
                          >
                            Remap
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--lime)' }}>
                            {padDisplay}
                          </span>
                          <button
                            type="button"
                            className="m-btn"
                            style={{ padding: '2px 8px', fontSize: '10px' }}
                            onClick={() => setListeningAction({ id: action.id, target: 'pad' })}
                          >
                            Remap
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'calibration' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 className="k-section-title">Gamepad Stick &amp; Wheel Deadzones</h3>
          <Field
            label="Stick Deadzone"
            value={`${Math.round(settings.gamepadDeadzone * 100)}%`}
            hint="Prevents drift around stick centre"
          >
            <Slider
              label="Gamepad Deadzone"
              min={0.01}
              max={0.25}
              step={0.01}
              value={settings.gamepadDeadzone}
              onChange={(v) => updateInput({ gamepadDeadzone: v })}
            />
          </Field>
          <Field
            label="Response Curve (Linearity)"
            value={`${settings.gamepadLinearity.toFixed(1)}x`}
            hint="1.0 = linear, 1.4 = progressive, 2.0+ = ultra fine precision around centre"
          >
            <Slider
              label="Stick Response Curve"
              min={1.0}
              max={2.5}
              step={0.1}
              value={settings.gamepadLinearity}
              onChange={(v) => updateInput({ gamepadLinearity: v })}
            />
          </Field>
          <Field
            label="Trigger Deadzone"
            value={`${Math.round(settings.gamepadTriggerDeadzone * 100)}%`}
            hint="Trigger and pedal deadband before braking or throttle begins"
          >
            <Slider
              label="Trigger Deadzone"
              min={0.01}
              max={0.20}
              step={0.01}
              value={settings.gamepadTriggerDeadzone}
              onChange={(v) => updateInput({ gamepadTriggerDeadzone: v })}
            />
          </Field>

          <h3 className="k-section-title">Axis &amp; Pedal Inversion (Wheels)</h3>
          <Field label="Invert Steering Axis">
            <Switch
              label="Invert Steering Axis"
              checked={settings.invertSteerAxis}
              onChange={(v) => updateInput({ invertSteerAxis: v })}
            />
          </Field>
          <Field label="Invert Throttle Axis">
            <Switch
              label="Invert Throttle Axis"
              checked={settings.invertThrottleAxis}
              onChange={(v) => updateInput({ invertThrottleAxis: v })}
            />
          </Field>
          <Field label="Invert Brake Axis">
            <Switch
              label="Invert Brake Axis"
              checked={settings.invertBrakeAxis}
              onChange={(v) => updateInput({ invertBrakeAxis: v })}
            />
          </Field>
          <Field
            label="Throttle Input Mode"
            hint="Choose Trigger (standard gamepads) or dedicated pedal axis for racing wheels"
          >
            <Seg
              label="Throttle Source"
              value={settings.throttleAxis}
              options={[
                { value: -1, label: 'Trigger (RT)' },
                { value: 1, label: 'Pedal Axis 1' },
                { value: 2, label: 'Pedal Axis 2' },
                { value: 5, label: 'Pedal Axis 5' },
              ]}
              onChange={(v) => updateInput({ throttleAxis: v })}
            />
          </Field>
          <Field
            label="Brake Input Mode"
            hint="Choose Trigger (standard gamepads) or dedicated pedal axis for racing wheels"
          >
            <Seg
              label="Brake Source"
              value={settings.brakeAxis}
              options={[
                { value: -1, label: 'Trigger (LT)' },
                { value: 2, label: 'Pedal Axis 2' },
                { value: 3, label: 'Pedal Axis 3' },
                { value: 4, label: 'Pedal Axis 4' },
              ]}
              onChange={(v) => updateInput({ brakeAxis: v })}
            />
          </Field>

          <h3 className="k-section-title">Keyboard Feel &amp; Speed Sensitivity</h3>
          <Field
            label="Speed-Sensitive Steering"
            value={`${settings.keyboardSteeringSpeed.toFixed(2)}x`}
            hint="Gradually reduces maximum keyboard lock at high speed to prevent snap spinouts"
          >
            <Slider
              label="Keyboard Steering Speed Sensitivity"
              min={0.5}
              max={1.8}
              step={0.05}
              value={settings.keyboardSteeringSpeed}
              onChange={(v) => updateInput({ keyboardSteeringSpeed: v })}
            />
          </Field>
          <Field
            label="Keyboard Steer Attack Rate"
            value={`${settings.keyboardSteerRate.toFixed(2)}x`}
            hint="Speed at which steering wheel turns into corners when holding keys"
          >
            <Slider
              label="Keyboard Steer Attack Rate"
              min={0.5}
              max={1.8}
              step={0.05}
              value={settings.keyboardSteerRate}
              onChange={(v) => updateInput({ keyboardSteerRate: v })}
            />
          </Field>
          <Field
            label="Keyboard Steer Return Rate"
            value={`${settings.keyboardReturnRate.toFixed(2)}x`}
            hint="Speed at which steering wheel snaps back to centre when keys are released"
          >
            <Slider
              label="Keyboard Steer Return Rate"
              min={0.5}
              max={2.0}
              step={0.05}
              value={settings.keyboardReturnRate}
              onChange={(v) => updateInput({ keyboardReturnRate: v })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
