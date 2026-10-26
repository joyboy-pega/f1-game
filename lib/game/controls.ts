import { DEFAULT_INPUT_SETTINGS, type GameSettings, type InputSettings } from './gameState';

export interface ControlState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  analogSteer: boolean; // true when steer comes from a stick (less smoothing)
  handbrake: boolean;
  ersBoost: boolean;
  lookBack: boolean;
  drsToggleRequested: boolean;
  compoundCycleRequested: boolean;
  brakeBiasUp: boolean;
  brakeBiasDown: boolean;
  pitStopRequested: boolean;
  cameraCycleRequested: boolean;
  resetRequested: boolean;
  menuToggleRequested: boolean;
  telemetryToggleRequested: boolean;
}

export type ControlTrigger =
  | 'drsToggleRequested'
  | 'compoundCycleRequested'
  | 'brakeBiasUp'
  | 'brakeBiasDown'
  | 'pitStopRequested'
  | 'cameraCycleRequested'
  | 'resetRequested'
  | 'menuToggleRequested'
  | 'telemetryToggleRequested';

export type ControlHold = 'throttle' | 'brake' | 'steerLeft' | 'steerRight' | 'handbrake' | 'ersBoost' | 'lookBack';

export const NEUTRAL_CONTROLS: Readonly<ControlState> = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
  analogSteer: false,
  handbrake: false,
  ersBoost: false,
  lookBack: false,
  drsToggleRequested: false,
  compoundCycleRequested: false,
  brakeBiasUp: false,
  brakeBiasDown: false,
  pitStopRequested: false,
  cameraCycleRequested: false,
  resetRequested: false,
  menuToggleRequested: false,
  telemetryToggleRequested: false,
});

export const DEFAULT_KEY_TRIGGERS: Record<string, ControlTrigger> = {
  KeyF: 'drsToggleRequested',
  KeyE: 'drsToggleRequested',
  KeyC: 'cameraCycleRequested',
  KeyR: 'resetRequested',
  Escape: 'menuToggleRequested',
  KeyM: 'menuToggleRequested',
  KeyP: 'pitStopRequested', // toggle 'box this lap'
  KeyO: 'compoundCycleRequested', // choose tyre for the next stop
  KeyT: 'telemetryToggleRequested',
  BracketRight: 'brakeBiasUp',
  BracketLeft: 'brakeBiasDown',
};

export const DEFAULT_KEY_HOLDS: Record<ControlHold, string[]> = {
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  steerLeft: ['ArrowLeft', 'KeyA'],
  steerRight: ['ArrowRight', 'KeyD'],
  handbrake: ['Space'],
  ersBoost: ['ShiftLeft', 'ShiftRight'],
  lookBack: ['KeyB'],
};

// Standard Gamepad mapping (Xbox layout names)
export const DEFAULT_PAD_TRIGGERS: [number, ControlTrigger][] = [
  [0, 'drsToggleRequested'], // A
  [3, 'cameraCycleRequested'], // Y
  [9, 'menuToggleRequested'], // Start
  [8, 'telemetryToggleRequested'], // Back / View
  [5, 'brakeBiasUp'], // RB
  [4, 'brakeBiasDown'], // LB
  [13, 'pitStopRequested'], // D-pad down
  [12, 'resetRequested'], // D-pad up
  [15, 'compoundCycleRequested'], // D-pad right
];

export const DEFAULT_PAD_BUTTONS: Record<string, number> = {
  drsToggleRequested: 0,
  handbrake: 1,
  ersBoost: 2,
  cameraCycleRequested: 3,
  brakeBiasDown: 4,
  brakeBiasUp: 5,
  brake: 6,
  throttle: 7,
  telemetryToggleRequested: 8,
  menuToggleRequested: 9,
  lookBack: 10,
  resetRequested: 12,
  pitStopRequested: 13,
  compoundCycleRequested: 15,
};

/**
 * Deadzone + non-linearity curve for joystick/axis input.
 * |val| <= deadzone -> 0
 * Otherwise normalized [deadzone, 1] mapped by pow(norm, linearity).
 */
export function applyDeadzoneAndCurve(val: number, deadzone: number, linearity: number): number {
  const abs = Math.abs(val);
  if (abs <= deadzone) return 0;
  const clamped = Math.min(1, Math.max(0, (abs - deadzone) / (1 - deadzone)));
  const curved = Math.pow(clamped, Math.max(1, linearity));
  return Math.sign(val) * curved;
}

/**
 * Trigger deadzone mapping for analogue triggers (e.g. 0..1).
 */
export function applyTriggerDeadzone(val: number, deadzone: number): number {
  if (val <= deadzone) return 0;
  return Math.min(1, Math.max(0, (val - deadzone) / (1 - deadzone)));
}

/**
 * Normalises an analog pedal axis (-1..1 or 0..1) to 0..1 with inversion and deadzone.
 */
export function readPedalAxis(raw: number, inverted: boolean, deadzone: number): number {
  let norm = (raw + 1) * 0.5;
  if (inverted) norm = 1 - norm;
  return applyTriggerDeadzone(norm, deadzone);
}

/**
 * Ramp a single scalar toward target at attackRate or returnRate.
 */
export function rampScalar(current: number, target: number, attackRate: number, returnRate: number, dt: number): number {
  if (target > current) {
    const rate = current < 0 ? returnRate : attackRate;
    return Math.min(target, current + rate * dt);
  } else if (target < current) {
    const rate = current > 0 ? returnRate : attackRate;
    return Math.max(target, current - rate * dt);
  }
  return current;
}

/**
 * Speed-sensitive steering max lock factor.
 * At 0 km/h: returns 1.0.
 * At high speeds: falls smoothly with 1 / (1 + (speed / 85) * speedSensitivity), clamped to minimum 0.22.
 */
export function calculateSpeedSensitiveLock(speedKmh: number, speedSensitivity: number = 1.0): number {
  const v = Math.max(0, Math.abs(speedKmh));
  const factor = 1.0 / (1.0 + (v / 85) * Math.max(0.2, speedSensitivity));
  return Math.max(0.22, Math.min(1.0, factor));
}

/**
 * Dynamic keyboard steering step.
 * Returns new steer value (-1..1).
 * Attack: moving away from 0. Takes ~0.22s (rate ~4.54 / s * steerRate).
 * Return: moving toward 0. Takes ~0.10s (rate ~10.0 / s * returnRate).
 */
export function stepKeyboardSteer(
  current: number,
  targetDir: number, // -1, 0, or 1
  speedKmh: number,
  dt: number,
  steerRate: number = 1.0,
  returnRate: number = 1.0,
  speedSensitivity: number = 1.0
): number {
  const maxLock = calculateSpeedSensitiveLock(speedKmh, speedSensitivity);
  const target = targetDir * maxLock;
  const attackSpeed = 4.54 * Math.max(0.2, steerRate);
  const returnSpeed = 10.0 * Math.max(0.2, returnRate);
  return rampScalar(current, target, attackSpeed, returnSpeed, dt);
}

export class ControlsManager {
  private keys: Record<string, boolean> = {};
  private touch: Partial<Record<ControlHold, boolean>> = {};
  private triggers = new Set<ControlTrigger>();
  private padPrev: boolean[] = [];
  private listenersAttached = false;
  private state: ControlState = { ...NEUTRAL_CONTROLS };
  public gamepadConnected = false;

  // Keyboard smooth ramps
  private kbThrottle = 0;
  private kbBrake = 0;
  private kbSteer = 0;

  // Input configuration & remappings
  public inputSettings: InputSettings = { ...DEFAULT_INPUT_SETTINGS };

  constructor() {
    if (typeof window !== 'undefined') this.attachListeners();
  }

  public updateSettings(patch: Partial<GameSettings> | { input?: Partial<InputSettings> }) {
    if ('input' in patch && patch.input) {
      this.inputSettings = { ...this.inputSettings, ...patch.input };
    }
  }

  public resetRamps() {
    this.kbThrottle = 0;
    this.kbBrake = 0;
    this.kbSteer = 0;
  }

  public attachListeners() {
    if (this.listenersAttached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.listenersAttached = true;
  }

  public detachListeners() {
    if (!this.listenersAttached || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.keys = {};
    this.touch = {};
    this.triggers.clear();
    this.listenersAttached = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();

    // Check trigger activation (custom or default)
    if (!this.keys[e.code]) {
      const trigger = this.resolveTriggerFromKey(e.code);
      if (trigger) this.triggers.add(trigger);
    }
    this.keys[e.code] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onBlur = () => {
    this.keys = {};
    this.touch = {};
    this.resetRamps();
  };

  private resolveTriggerFromKey(code: string): ControlTrigger | null {
    // Check custom mappings first
    const custom = this.inputSettings.customKeys;
    for (const [action, customCode] of Object.entries(custom)) {
      if (customCode === code) {
        if (action === 'drs') return 'drsToggleRequested';
        if (action === 'camera') return 'cameraCycleRequested';
        if (action === 'reset') return 'resetRequested';
        if (action === 'menu') return 'menuToggleRequested';
        if (action === 'pit') return 'pitStopRequested';
        if (action === 'compound') return 'compoundCycleRequested';
        if (action === 'telemetry') return 'telemetryToggleRequested';
        if (action === 'biasUp') return 'brakeBiasUp';
        if (action === 'biasDown') return 'brakeBiasDown';
      }
    }
    return DEFAULT_KEY_TRIGGERS[code] ?? null;
  }

  private isHoldActive(hold: ControlHold): boolean {
    if (this.touch[hold]) return true;
    const custom = this.inputSettings.customKeys[hold];
    if (custom && this.keys[custom]) return true;
    const defaults = DEFAULT_KEY_HOLDS[hold];
    if (defaults) {
      for (let i = 0; i < defaults.length; i++) {
        if (this.keys[defaults[i]]) return true;
      }
    }
    return false;
  }

  /** Mobile / on-screen buttons. */
  public setVirtualHold(control: ControlHold, active: boolean) {
    this.touch[control] = active;
  }

  public fireTrigger(trigger: ControlTrigger) {
    this.triggers.add(trigger);
  }

  public readGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /**
   * Poll once per frame. Triggers are consumed (edge-fired once).
   * @param dt Frame delta in seconds (clamped to 0.1s max). Defaults to 1/60s.
   * @param speedKmh Current player vehicle speed in km/h for speed-sensitive steering.
   */
  public poll(dt?: number, speedKmh?: number): ControlState {
    const s = this.state;
    const delta = typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
    const cfg = this.inputSettings;

    // 1. Raw Keyboard / touch requests
    const rawKbThrottle = this.isHoldActive('throttle');
    const rawKbBrake = this.isHoldActive('brake');
    const rawKbSteerRight = this.isHoldActive('steerRight');
    const rawKbSteerLeft = this.isHoldActive('steerLeft');
    const rawKbDir = (rawKbSteerRight ? 1 : 0) - (rawKbSteerLeft ? 1 : 0);

    // 2. Progressive Ramps for keyboard
    // Throttle: 0 -> 1 in ~0.25s (rate 4.0/s); release in ~0.08s (rate 12.5/s)
    this.kbThrottle = rampScalar(this.kbThrottle, rawKbThrottle ? 1 : 0, 4.0, 12.5, delta);
    // Brake: 0 -> 1 in ~0.12s (rate 8.33/s); release in ~0.06s (rate 16.67/s)
    this.kbBrake = rampScalar(this.kbBrake, rawKbBrake ? 1 : 0, 8.33, 16.67, delta);
    // Speed-sensitive steering with asymmetric return
    this.kbSteer = stepKeyboardSteer(
      this.kbSteer,
      rawKbDir,
      speedKmh ?? 0,
      delta,
      cfg.keyboardSteerRate,
      cfg.keyboardReturnRate,
      cfg.keyboardSteeringSpeed
    );

    // 3. Gamepad & Wheel input
    let padThrottle = 0;
    let padBrake = 0;
    let padSteer = 0;
    let padHandbrake = false;
    let padErs = false;
    let padLookBack = false;

    const pad = this.readGamepad();
    this.gamepadConnected = !!pad;
    if (pad) {
      // Steer axis
      const steerAxisIdx = cfg.steerAxis ?? 0;
      let rawAx = pad.axes[steerAxisIdx] ?? 0;
      if (cfg.invertSteerAxis) rawAx = -rawAx;
      padSteer = applyDeadzoneAndCurve(rawAx, cfg.gamepadDeadzone, cfg.gamepadLinearity);

      // Throttle (pedal axis or button)
      if (cfg.throttleAxis >= 0) {
        const rawThAxis = pad.axes[cfg.throttleAxis] ?? 0;
        padThrottle = readPedalAxis(rawThAxis, cfg.invertThrottleAxis, cfg.gamepadTriggerDeadzone);
      } else {
        const thBtn = cfg.customButtons['throttle'] ?? DEFAULT_PAD_BUTTONS.throttle;
        const rawThBtn = pad.buttons[thBtn]?.value ?? 0;
        padThrottle = applyTriggerDeadzone(rawThBtn, cfg.gamepadTriggerDeadzone);
      }

      // Brake (pedal axis or button)
      if (cfg.brakeAxis >= 0) {
        const rawBrAxis = pad.axes[cfg.brakeAxis] ?? 0;
        padBrake = readPedalAxis(rawBrAxis, cfg.invertBrakeAxis, cfg.gamepadTriggerDeadzone);
      } else {
        const brBtn = cfg.customButtons['brake'] ?? DEFAULT_PAD_BUTTONS.brake;
        const rawBrBtn = pad.buttons[brBtn]?.value ?? 0;
        padBrake = applyTriggerDeadzone(rawBrBtn, cfg.gamepadTriggerDeadzone);
      }

      // Digital holds
      const hbBtn = cfg.customButtons['handbrake'] ?? DEFAULT_PAD_BUTTONS.handbrake;
      padHandbrake = !!pad.buttons[hbBtn]?.pressed;
      const ersBtn = cfg.customButtons['ersBoost'] ?? DEFAULT_PAD_BUTTONS.ersBoost;
      padErs = !!pad.buttons[ersBtn]?.pressed;
      const lbBtn = cfg.customButtons['lookBack'] ?? DEFAULT_PAD_BUTTONS.lookBack;
      padLookBack = !!pad.buttons[lbBtn]?.pressed || (pad.axes[3] ?? 0) > 0.6;

      // Triggers
      for (const [btnIdx, defaultTrigger] of DEFAULT_PAD_TRIGGERS) {
        // Allow custom button override if defined
        const activeBtn = cfg.customButtons[defaultTrigger] ?? btnIdx;
        const pressed = !!pad.buttons[activeBtn]?.pressed;
        if (pressed && !this.padPrev[activeBtn]) this.triggers.add(defaultTrigger);
        this.padPrev[activeBtn] = pressed;
      }
    }

    // 4. Combine Keyboard & Gamepad/Wheel
    const useAnalogSteer = rawKbDir === 0 && Math.abs(padSteer) > 0;
    s.throttle = Math.max(this.kbThrottle, padThrottle);
    s.brake = Math.max(this.kbBrake, padBrake);
    s.steer = useAnalogSteer ? padSteer : this.kbSteer;
    s.analogSteer = useAnalogSteer;
    s.handbrake = !!(this.isHoldActive('handbrake') || padHandbrake);
    s.ersBoost = !!(this.isHoldActive('ersBoost') || padErs);
    s.lookBack = !!(this.isHoldActive('lookBack') || padLookBack);

    // 5. Triggers
    s.drsToggleRequested = this.triggers.has('drsToggleRequested');
    s.compoundCycleRequested = this.triggers.has('compoundCycleRequested');
    s.brakeBiasUp = this.triggers.has('brakeBiasUp');
    s.brakeBiasDown = this.triggers.has('brakeBiasDown');
    s.pitStopRequested = this.triggers.has('pitStopRequested');
    s.cameraCycleRequested = this.triggers.has('cameraCycleRequested');
    s.resetRequested = this.triggers.has('resetRequested');
    s.menuToggleRequested = this.triggers.has('menuToggleRequested');
    s.telemetryToggleRequested = this.triggers.has('telemetryToggleRequested');
    this.triggers.clear();

    return s;
  }
}

export const controls = new ControlsManager();
