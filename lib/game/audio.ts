export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private engineVoice: {
    master: GainNode;
    lowPass: BiquadFilterNode;
    body: OscillatorNode;
    bite: OscillatorNode;
    windFilter: BiquadFilterNode;
    windGain: GainNode;
    tire: OscillatorNode;
    tireFilter: BiquadFilterNode;
    tireGain: GainNode;
  } | null = null;

  private ersGain: GainNode | null = null;
  private ersOsc: OscillatorNode | null = null;

  private enabled = true;
  private volume = 0.75;
  private lastGear: number | string | null = null;

  public init() {
    if (typeof window === 'undefined') return;
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    try {
      const ctx = new AudioContextClass();
      this.audioCtx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0001;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 16;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.18;

      const lowPass = ctx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 900;
      lowPass.Q.value = 0.7;

      const body = ctx.createOscillator();
      body.type = 'sawtooth';

      const bite = ctx.createOscillator();
      bite.type = 'square';

      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.62;

      const biteGain = ctx.createGain();
      biteGain.gain.value = 0.11;

      // Wind noise buffer
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const noiseData = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 700;

      const windGain = ctx.createGain();
      windGain.gain.value = 0.0001;

      // Tire screech
      const tire = ctx.createOscillator();
      tire.type = 'triangle';

      const tireFilter = ctx.createBiquadFilter();
      tireFilter.type = 'lowpass';
      tireFilter.frequency.value = 1500;

      const tireGain = ctx.createGain();
      tireGain.gain.value = 0.0001;

      // Wiring
      body.connect(bodyGain).connect(lowPass);
      bite.connect(biteGain).connect(lowPass);
      noise.connect(windFilter).connect(windGain).connect(compressor);
      tire.connect(tireFilter).connect(tireGain).connect(compressor);
      lowPass.connect(compressor).connect(master).connect(ctx.destination);

      body.start();
      bite.start();
      noise.start();
      tire.start();

      this.engineVoice = { master, lowPass, body, bite, windFilter, windGain, tire, tireFilter, tireGain };
      master.gain.setTargetAtTime(this.enabled ? 0.12 * this.volume : 0.0001, ctx.currentTime, 0.35);

      // ERS Electric Motor Whine
      const ersOsc = ctx.createOscillator();
      ersOsc.type = 'sine';
      ersOsc.frequency.value = 1450;
      const ersGain = ctx.createGain();
      ersGain.gain.value = 0.0001;
      ersOsc.connect(ersGain).connect(ctx.destination);
      ersOsc.start();
      this.ersOsc = ersOsc;
      this.ersGain = ersGain;
    } catch {
      this.audioCtx = null;
      this.engineVoice = null;
    }
  }

  public updateEngine(rpm: number, throttle: boolean, gear: number | string, active: boolean, speedRatio: number, slip: number) {
    if (!this.audioCtx || !this.engineVoice) return;
    const now = this.audioCtx.currentTime;
    const revs = Math.max(800, rpm || 800);

    this.engineVoice.body.frequency.setTargetAtTime(revs / 10.5, now, 0.045);
    this.engineVoice.bite.frequency.setTargetAtTime(revs / 5.25, now, 0.045);
    this.engineVoice.lowPass.frequency.setTargetAtTime(850 + revs * 0.29 + (throttle ? 850 : 0), now, 0.08);

    const targetGain = this.enabled ? (active ? (throttle ? 0.14 : 0.085) : 0.025) * this.volume : 0.0001;
    this.engineVoice.master.gain.setTargetAtTime(targetGain, now, 0.12);

    const speed = Math.max(0, Math.min(1, speedRatio || 0));
    const scrub = Math.max(0, Math.min(1, slip || 0));

    this.engineVoice.windFilter.frequency.setTargetAtTime(500 + speed * 2100, now, 0.12);
    this.engineVoice.windGain.gain.setTargetAtTime(this.enabled ? speed * 0.055 * this.volume : 0, now, 0.18);

    this.engineVoice.tire.frequency.setTargetAtTime(430 + scrub * 920, now, 0.05);
    const scrubGain = scrub > 0.12 ? Math.min(0.045, (scrub - 0.12) * 0.075) * (this.enabled ? this.volume : 0) : 0.0001;
    this.engineVoice.tireGain.gain.setTargetAtTime(scrubGain, now, 0.1);

    // Gear shift pop
    if (throttle && typeof gear === 'number' && typeof this.lastGear === 'number' && gear > this.lastGear) {
      this.playShiftPop();
    }
    this.lastGear = gear;
  }

  private playShiftPop() {
    if (!this.audioCtx || !this.enabled) return;
    try {
      const now = this.audioCtx.currentTime;
      const shift = this.audioCtx.createOscillator();
      const envelope = this.audioCtx.createGain();
      shift.type = 'triangle';
      shift.frequency.setValueAtTime(145, now);
      shift.frequency.exponentialRampToValueAtTime(58, now + 0.11);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.035 * this.volume, now + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      shift.connect(envelope).connect(this.audioCtx.destination);
      shift.start(now);
      shift.stop(now + 0.14);
    } catch {}
  }

  public updateErs(isBoosting: boolean) {
    if (!this.audioCtx || !this.ersGain || !this.ersOsc) return;
    const now = this.audioCtx.currentTime;
    if (isBoosting && this.enabled) {
      this.ersOsc.frequency.setTargetAtTime(1900, now, 0.18);
      this.ersGain.gain.setTargetAtTime(0.04 * this.volume, now, 0.08);
    } else {
      this.ersOsc.frequency.setTargetAtTime(1450, now, 0.25);
      this.ersGain.gain.setTargetAtTime(0.0001, now, 0.15);
    }
  }

  public playDrsTone(open: boolean) {
    if (!this.audioCtx || !this.enabled) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(open ? 880 : 540, now);
      osc.frequency.setValueAtTime(open ? 1174 : 440, now + 0.06);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.06 * this.volume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } catch {}
  }

  public playBiasTick() {
    if (!this.audioCtx || !this.enabled) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);
      gain.gain.setValueAtTime(0.05 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch {}
  }

  public playPitSound() {
    if (!this.audioCtx || !this.enabled) return;
    try {
      const now = this.audioCtx.currentTime;
      for (let i = 0; i < 4; i++) {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280 + i * 40, now + i * 0.08);
        osc.frequency.exponentialRampToValueAtTime(80, now + i * 0.08 + 0.06);
        gain.gain.setValueAtTime(0.08 * this.volume, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.07);
        osc.connect(gain).connect(this.audioCtx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.08);
      }
    } catch {}
  }

  public toggleAudio(): boolean {
    this.enabled = !this.enabled;
    if (this.engineVoice && this.audioCtx) {
      this.engineVoice.master.gain.setTargetAtTime(
        this.enabled ? 0.12 * this.volume : 0.0001,
        this.audioCtx.currentTime,
        0.1
      );
    }
    return this.enabled;
  }

  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  public isEnabled(): boolean {
    return this.enabled;
  }
}

export const audio = new AudioManager();
