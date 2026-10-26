import { sectorOf } from './race';
import type { EventBus } from './events';
import type { WorldCar } from './types';
import { type WeatherType } from '../constants';
import { wetnessFor } from './tyres';

export interface WeatherKeyframe {
  /** Race time in seconds. */
  time: number;
  /** Rain intensity from 0 (bone dry) to 1 (monsoon). */
  rainIntensity: number;
}

export interface WeatherState {
  rainIntensity: number;
  sectorWetness: [number, number, number];
  sectorDryLine: [number, number, number];
  trackWetness: number;
}

/**
 * Dynamic Weather System (PLAN-v3 §8 R7).
 * Manages rain timeline, fast wetting, slow drying, dry racing lines,
 * moving weather fronts across marshal sectors, and tyre crossover thresholds.
 */
export class WeatherManager {
  readonly state: WeatherState = {
    rainIntensity: 0,
    sectorWetness: [0, 0, 0],
    sectorDryLine: [0, 0, 0],
    trackWetness: 0,
  };

  isDynamic = false;
  keyframes: WeatherKeyframe[] = [];
  private lastCrossover = -1; // 0 = slicks, 1 = inters, 2 = wets

  reset(isDynamic = false, initialWeather: WeatherType = 'sunny', seed?: number) {
    this.isDynamic = isDynamic;
    const base = initialWeather === 'dynamic' ? 0 : wetnessFor(initialWeather);
    this.state.rainIntensity = initialWeather === 'rain' ? 0.7 : 0;
    this.state.sectorWetness = [base, base, base];
    this.state.sectorDryLine = [0, 0, 0];
    this.state.trackWetness = base;
    this.lastCrossover = base > 0.6 ? 2 : base > 0.15 ? 1 : 0;
    this.keyframes = [];

    if (isDynamic) {
      this.generateTimeline(seed ?? 42, initialWeather);
    }
  }

  generateTimeline(seed: number, initialWeather: WeatherType) {
    const s = Math.abs(seed);
    const rainStartsAt = 60 + (s % 120);
    const rainPeak = 0.6 + ((s * 31) % 40) / 100;
    const rainDuration = 120 + ((s * 17) % 180);

    if (initialWeather === 'rain') {
      this.keyframes = [
        { time: 0, rainIntensity: 0.75 },
        { time: 150, rainIntensity: 0.8 },
        { time: 250, rainIntensity: 0.1 },
        { time: 400, rainIntensity: 0 },
      ];
    } else {
      this.keyframes = [
        { time: 0, rainIntensity: 0 },
        { time: rainStartsAt, rainIntensity: 0 },
        { time: rainStartsAt + 25, rainIntensity: rainPeak },
        { time: rainStartsAt + rainDuration, rainIntensity: rainPeak },
        { time: rainStartsAt + rainDuration + 30, rainIntensity: 0 },
        { time: rainStartsAt + rainDuration + 200, rainIntensity: 0 },
      ];
    }
  }

  setKeyframes(kf: WeatherKeyframe[]) {
    this.isDynamic = true;
    this.keyframes = [...kf].sort((a, b) => a.time - b.time);
  }

  setRainIntensity(intensity: number) {
    this.isDynamic = true;
    this.state.rainIntensity = Math.max(0, Math.min(1, intensity));
  }

  getRainIntensityAt(raceTime: number): number {
    if (this.keyframes.length === 0) return this.state.rainIntensity;
    if (raceTime <= this.keyframes[0].time) return this.keyframes[0].rainIntensity;
    const last = this.keyframes[this.keyframes.length - 1];
    if (raceTime >= last.time) return last.rainIntensity;

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      const k0 = this.keyframes[i];
      const k1 = this.keyframes[i + 1];
      if (raceTime >= k0.time && raceTime <= k1.time) {
        const span = k1.time - k0.time;
        if (span <= 0.001) return k1.rainIntensity;
        const frac = (raceTime - k0.time) / span;
        return k0.rainIntensity + frac * (k1.rainIntensity - k0.rainIntensity);
      }
    }
    return this.state.rainIntensity;
  }

  update(dt: number, cars: WorldCar[], events: EventBus, raceTime: number) {
    if (!this.isDynamic) return;

    const targetRain = this.getRainIntensityAt(raceTime);
    this.state.rainIntensity = targetRain;

    // Moving rain front delay across sectors: S0 gets it immediately, S1 +5s, S2 +10s
    const delays = [0, 5, 10];
    const WET_RATE = 0.06; // Track wets fast (in ~15-20s)
    const DRY_RATE = 0.012; // Track dries slower (~80s)

    for (let sec = 0; sec < 3; sec++) {
      const secRain = this.getRainIntensityAt(Math.max(0, raceTime - delays[sec]));
      const currentWet = this.state.sectorWetness[sec];

      if (secRain > currentWet) {
        // Wetting fast
        const dw = Math.max(0.035 * dt, (secRain - currentWet) * WET_RATE * dt * 8);
        this.state.sectorWetness[sec] = Math.min(secRain, currentWet + dw);
      } else {
        // Drying slower
        const dw = DRY_RATE * dt;
        this.state.sectorWetness[sec] = Math.max(secRain, currentWet - dw);
      }

      // Dry line formation: cars running on the racing line displace water
      let carsOnLine = 0;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (c.inPit || c.timing.finished) continue;
        if (sectorOf(c.timing.lastS) === sec) {
          // If close to racing line (|lateral| < 16)
          if (Math.abs(c.lateral) < 16) {
            carsOnLine++;
          }
        }
      }

      if (this.state.sectorWetness[sec] > 0.05 && carsOnLine > 0) {
        // Cars disperse standing water, forming a dry line
        this.state.sectorDryLine[sec] = Math.min(0.65, this.state.sectorDryLine[sec] + 0.005 * carsOnLine * dt);
      }

      // Heavy rain washes away dry line
      if (secRain > 0.35) {
        this.state.sectorDryLine[sec] = Math.max(0, this.state.sectorDryLine[sec] - 0.08 * dt);
      } else if (this.state.sectorWetness[sec] < 0.05) {
        this.state.sectorDryLine[sec] = 0;
      }
    }

    // Circuit average
    this.state.trackWetness = (this.state.sectorWetness[0] + this.state.sectorWetness[1] + this.state.sectorWetness[2]) / 3;

    // Crossover thresholds (slicks < 0.15, inters 0.15..0.65, wets > 0.65)
    const avg = this.state.trackWetness;
    let crossover = 0;
    if (avg >= 0.65) crossover = 2; // Wet
    else if (avg >= 0.18) crossover = 1; // Inter

    if (crossover !== this.lastCrossover) {
      this.lastCrossover = crossover;
    }
  }

  getCarWetness(car: WorldCar, defaultWetness: number): number {
    if (!this.isDynamic) return defaultWetness;
    const sec = sectorOf(car.timing.lastS);
    const base = this.state.sectorWetness[sec];
    const dryLine = this.state.sectorDryLine[sec];
    if (dryLine > 0 && Math.abs(car.lateral) < 16) {
      // Benefit from dry line: up to 45% less wetness on the rubbered line
      return Math.max(0, base * (1 - dryLine * 0.45));
    }
    return base;
  }

  getTrackWetness(defaultWetness: number): number {
    if (!this.isDynamic) return defaultWetness;
    return this.state.trackWetness;
  }
}
