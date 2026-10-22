export type QualityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface QualitySettings {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  particleDensity: number;
  maxDrawDistance: number;
  postProcessing: boolean;
  foliageDensity: number;
  /** Post stack: 'off' = plain renderer, 'basic' = SMAA + bloom, 'full' = + vignette/grade/speed FX. */
  postTier: 'off' | 'basic' | 'full';
  /** Rain/snow instances around the camera (scaled further by weather). */
  weatherParticles: number;
  /** Ring-buffer length (quad segments) of the shared skid-mark ribbon. */
  skidSegments: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  LOW: {
    level: 'LOW',
    pixelRatio: 0.85,
    shadows: false,
    shadowMapSize: 512,
    particleDensity: 0.35,
    maxDrawDistance: 6000,
    postProcessing: false,
    foliageDensity: 0.4,
    postTier: 'off',
    weatherParticles: 900,
    skidSegments: 1200,
  },
  MEDIUM: {
    level: 'MEDIUM',
    pixelRatio: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 0.7,
    maxDrawDistance: 9000,
    postProcessing: true,
    foliageDensity: 0.75,
    postTier: 'basic',
    weatherParticles: 1800,
    skidSegments: 3000,
  },
  HIGH: {
    level: 'HIGH',
    pixelRatio: 1.15,
    shadows: true,
    shadowMapSize: 1024,
    particleDensity: 1.0,
    maxDrawDistance: 12000,
    postProcessing: true,
    foliageDensity: 1.0,
    postTier: 'full',
    weatherParticles: 2400,
    skidSegments: 5000,
  },
};

export class PerformanceGovernor {
  private currentQuality: QualityLevel = 'MEDIUM';
  private manualOverride: QualityLevel | null = null;
  private fpsHistory: number[] = [];
  private lastEvaluationTime = 0;
  private lowFpsSeconds = 0;
  private highFpsSeconds = 0;
  private currentFps = 60;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('formula_v_quality') as QualityLevel | null;
      if (saved && QUALITY_PRESETS[saved]) {
        this.manualOverride = saved;
        this.currentQuality = saved;
      } else {
        // Detect initial reasonable quality based on device
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
        const cores = navigator.hardwareConcurrency || 4;
        if (isMobile || (mem && mem <= 4) || cores <= 4) {
          this.currentQuality = 'MEDIUM';
        } else {
          this.currentQuality = 'HIGH';
        }
      }
    }
  }

  public recordFrame(dt: number, now: number) {
    if (dt > 0.001) {
      const instantFps = 1 / dt;
      this.fpsHistory.push(instantFps);
      if (this.fpsHistory.length > 60) this.fpsHistory.shift();
    }

    if (now - this.lastEvaluationTime > 1000) {
      if (this.fpsHistory.length > 0) {
        const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
        this.currentFps = Math.round(sum / this.fpsHistory.length);
      }

      this.lastEvaluationTime = now;

      // Only perform automatic adaptation if not manually locked
      if (!this.manualOverride) {
        if (this.currentFps < 42) {
          this.lowFpsSeconds++;
          this.highFpsSeconds = 0;
          if (this.lowFpsSeconds >= 3) {
            this.stepDown();
            this.lowFpsSeconds = 0;
          }
        } else if (this.currentFps > 57) {
          this.highFpsSeconds++;
          this.lowFpsSeconds = 0;
          if (this.highFpsSeconds >= 10) {
            this.stepUp();
            this.highFpsSeconds = 0;
          }
        } else {
          this.lowFpsSeconds = 0;
          this.highFpsSeconds = 0;
        }
      }
    }
  }

  private stepDown() {
    if (this.currentQuality === 'HIGH') {
      this.currentQuality = 'MEDIUM';
    } else if (this.currentQuality === 'MEDIUM') {
      this.currentQuality = 'LOW';
    }
  }

  private stepUp() {
    if (this.currentQuality === 'LOW') {
      this.currentQuality = 'MEDIUM';
    }
  }

  public setQuality(quality: QualityLevel | 'AUTO') {
    if (quality === 'AUTO') {
      this.manualOverride = null;
      if (typeof window !== 'undefined') localStorage.removeItem('formula_v_quality');
    } else {
      this.manualOverride = quality;
      this.currentQuality = quality;
      if (typeof window !== 'undefined') localStorage.setItem('formula_v_quality', quality);
    }
  }

  public getSettings(): QualitySettings {
    return QUALITY_PRESETS[this.currentQuality];
  }

  public getFps(): number {
    return this.currentFps;
  }

  public isManual(): boolean {
    return this.manualOverride !== null;
  }
}

export const performanceGovernor = new PerformanceGovernor();
