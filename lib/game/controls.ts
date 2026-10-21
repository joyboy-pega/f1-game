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

const KEY_TRIGGERS: Record<string, ControlTrigger> = {
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

// Standard Gamepad mapping (Xbox layout names)
const PAD_TRIGGERS: [number, ControlTrigger][] = [
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

const STICK_DEADZONE = 0.08;

export class ControlsManager {
  private keys: Record<string, boolean> = {};
  private touch: Partial<Record<ControlHold, boolean>> = {};
  private triggers = new Set<ControlTrigger>();
  private padPrev: boolean[] = [];
  private listenersAttached = false;
  private state: ControlState = { ...NEUTRAL_CONTROLS };
  public gamepadConnected = false;

  constructor() {
    if (typeof window !== 'undefined') this.attachListeners();
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
    if (!this.keys[e.code] && KEY_TRIGGERS[e.code]) this.triggers.add(KEY_TRIGGERS[e.code]);
    this.keys[e.code] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onBlur = () => {
    this.keys = {};
    this.touch = {};
  };

  /** Mobile / on-screen buttons. */
  public setVirtualHold(control: ControlHold, active: boolean) {
    this.touch[control] = active;
  }

  public fireTrigger(trigger: ControlTrigger) {
    this.triggers.add(trigger);
  }

  private readGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Poll once per frame. Triggers are consumed (edge-fired once). */
  public poll(): ControlState {
    const k = this.keys;
    const t = this.touch;
    const s = this.state;

    const kbThrottle = k.ArrowUp || k.KeyW || t.throttle ? 1 : 0;
    const kbBrake = k.ArrowDown || k.KeyS || t.brake ? 1 : 0;
    const kbSteer = (k.ArrowRight || k.KeyD || t.steerRight ? 1 : 0) - (k.ArrowLeft || k.KeyA || t.steerLeft ? 1 : 0);

    let padThrottle = 0;
    let padBrake = 0;
    let padSteer = 0;
    let padHandbrake = false;
    let padErs = false;
    let padLookBack = false;

    const pad = this.readGamepad();
    this.gamepadConnected = !!pad;
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      padSteer = Math.abs(ax) < STICK_DEADZONE ? 0 : Math.sign(ax) * ((Math.abs(ax) - STICK_DEADZONE) / (1 - STICK_DEADZONE));
      // Slight non-linearity for fine control around centre
      padSteer = Math.sign(padSteer) * Math.pow(Math.abs(padSteer), 1.4);
      padThrottle = pad.buttons[7]?.value ?? 0;
      padBrake = pad.buttons[6]?.value ?? 0;
      padHandbrake = !!pad.buttons[1]?.pressed;
      padErs = !!pad.buttons[2]?.pressed;
      padLookBack = !!pad.buttons[10]?.pressed || (pad.axes[3] ?? 0) > 0.6;
      for (const [btn, trig] of PAD_TRIGGERS) {
        const pressed = !!pad.buttons[btn]?.pressed;
        if (pressed && !this.padPrev[btn]) this.triggers.add(trig);
        this.padPrev[btn] = pressed;
      }
    }

    const useAnalogSteer = kbSteer === 0 && padSteer !== 0;
    s.throttle = Math.max(kbThrottle, padThrottle);
    s.brake = Math.max(kbBrake, padBrake);
    s.steer = useAnalogSteer ? padSteer : kbSteer;
    s.analogSteer = useAnalogSteer;
    s.handbrake = !!(k.Space || t.handbrake || padHandbrake);
    s.ersBoost = !!(k.ShiftLeft || k.ShiftRight || t.ersBoost || padErs);
    s.lookBack = !!(k.KeyB || t.lookBack || padLookBack);

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
