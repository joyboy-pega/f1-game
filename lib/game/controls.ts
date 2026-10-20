export interface ControlState {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  ersBoost: boolean;
  drsToggleRequested: boolean;
  brakeBiasUp: boolean;
  brakeBiasDown: boolean;
  pitStopRequested: boolean;
  cameraCycleRequested: boolean;
  resetRequested: boolean;
  menuToggleRequested: boolean;
  telemetryToggleRequested: boolean;
}

export class ControlsManager {
  private keys: Record<string, boolean> = {};
  private touchState: Partial<ControlState> = {};
  private listenersAttached = false;

  // Single-fire trigger flags
  private drsFlag = false;
  private cameraFlag = false;
  private resetFlag = false;
  private menuFlag = false;
  private pitFlag = false;
  private telemetryFlag = false;
  private biasUpFlag = false;
  private biasDownFlag = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.attachListeners();
    }
  }

  public attachListeners() {
    if (this.listenersAttached || typeof window === 'undefined') return;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.listenersAttached = true;
  }

  public detachListeners() {
    if (!this.listenersAttached || typeof window === 'undefined') return;

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.keys = {};
    this.listenersAttached = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Prevent scrolling with arrows/space during game
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    if (!this.keys[e.code]) {
      // Key press events (single triggers)
      if (e.code === 'KeyF' || e.code === 'KeyE') this.drsFlag = true;
      if (e.code === 'KeyC') this.cameraFlag = true;
      if (e.code === 'KeyR') this.resetFlag = true;
      if (e.code === 'Escape' || e.code === 'KeyM') this.menuFlag = true;
      if (e.code === 'KeyP') this.pitFlag = true;
      if (e.code === 'KeyT') this.telemetryFlag = true;
      if (e.code === 'BracketRight') this.biasUpFlag = true;
      if (e.code === 'BracketLeft') this.biasDownFlag = true;
    }

    this.keys[e.code] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  // Mobile / Virtual Button hooks
  public setVirtualControl(control: keyof ControlState, active: boolean) {
    this.touchState[control] = active;
    if (active) {
      if (control === 'drsToggleRequested') this.drsFlag = true;
      if (control === 'cameraCycleRequested') this.cameraFlag = true;
      if (control === 'resetRequested') this.resetFlag = true;
      if (control === 'menuToggleRequested') this.menuFlag = true;
      if (control === 'pitStopRequested') this.pitFlag = true;
      if (control === 'telemetryToggleRequested') this.telemetryFlag = true;
      if (control === 'brakeBiasUp') this.biasUpFlag = true;
      if (control === 'brakeBiasDown') this.biasDownFlag = true;
    }
  }

  public poll(): ControlState {
    const k = this.keys;
    const t = this.touchState;

    const throttle = !!(k.ArrowUp || k.KeyW || t.throttle);
    const brake = !!(k.ArrowDown || k.KeyS || t.brake);
    const steerLeft = !!(k.ArrowLeft || k.KeyA || t.steerLeft);
    const steerRight = !!(k.ArrowRight || k.KeyD || t.steerRight);
    const handbrake = !!(k.Space || t.handbrake);
    const ersBoost = !!(k.ShiftLeft || k.ShiftRight || t.ersBoost);

    // Consume single triggers
    const drsToggleRequested = this.drsFlag;
    this.drsFlag = false;

    const cameraCycleRequested = this.cameraFlag;
    this.cameraFlag = false;

    const resetRequested = this.resetFlag;
    this.resetFlag = false;

    const menuToggleRequested = this.menuFlag;
    this.menuFlag = false;

    const pitStopRequested = this.pitFlag;
    this.pitFlag = false;

    const telemetryToggleRequested = this.telemetryFlag;
    this.telemetryFlag = false;

    const brakeBiasUp = this.biasUpFlag;
    this.biasUpFlag = false;

    const brakeBiasDown = this.biasDownFlag;
    this.biasDownFlag = false;

    return {
      throttle,
      brake,
      steerLeft,
      steerRight,
      handbrake,
      ersBoost,
      drsToggleRequested,
      brakeBiasUp,
      brakeBiasDown,
      pitStopRequested,
      cameraCycleRequested,
      resetRequested,
      menuToggleRequested,
      telemetryToggleRequested,
    };
  }
}

export const controls = new ControlsManager();
