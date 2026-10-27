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

/** Tiers from cheapest to most expensive. */
const TIER_ORDER: QualityLevel[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * Render-resolution floor as a fraction of the tier's pixelRatio. Resolution is the first lever (PLAN-v3 G7):
 * tuned so the image is visibly softer but still readable at the floor; features are only dropped after
 * the floor has held for GOVERNOR.declineHoldMs.
 */
export const DPR_FLOOR_RATIO = 0.6;

/** pixelRatio for a tier at PerformanceMonitor `factor` in [0, 1] (1 = the tier's full resolution). */
export function dprFor(level: QualityLevel, factor: number): number {
  const f = factor < 0 ? 0 : factor > 1 ? 1 : factor;
  return QUALITY_PRESETS[level].pixelRatio * (DPR_FLOOR_RATIO + (1 - DPR_FLOOR_RATIO) * f);
}

/** Tier-change policy (PLAN-v3 S3). Times in ms; all values are tuned, not measured. */
export const GOVERNOR = {
  /** ignore the load-time hitch (shader compiles, lazy chunks) after the Canvas mounts */
  warmupMs: 5000,
  /** resolution must sit on its floor this long before a tier is dropped */
  declineHoldMs: 5000,
  /** resolution must sit at its ceiling this long before a tier is restored */
  inclineHoldMs: 20000,
  /** never change tier more often than this */
  minTierGapMs: 30000,
  /** this many up/down reversals within flipWindowMs = oscillating borderline GPU: stop adapting, settle on MEDIUM */
  flipLimit: 3,
  flipWindowMs: 60000,
};

/** Device-based starting tier (the old constructor logic, now side-effect free). */
export function detectInitialQuality(): QualityLevel {
  if (typeof window === 'undefined') return 'MEDIUM';
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency || 4;
  return isMobile || (mem && mem <= 4) || cores <= 4 ? 'MEDIUM' : 'HIGH';
}

const LEGACY_QUALITY_KEY = 'formula_v_quality';

/**
 * One-time migration of the old standalone localStorage key into `settings.quality` (the single source of truth).
 * Returns the migrated tier, or null if there was nothing valid to migrate. Always removes the key.
 */
export function migrateLegacyQualityKey(storage: Pick<Storage, 'getItem' | 'removeItem'>): QualityLevel | null {
  try {
    const saved = storage.getItem(LEGACY_QUALITY_KEY);
    if (saved === null) return null;
    storage.removeItem(LEGACY_QUALITY_KEY);
    return saved === 'LOW' || saved === 'MEDIUM' || saved === 'HIGH' ? saved : null;
  } catch (err) {
    console.warn('Failed to migrate legacy quality key', err);
    return null;
  }
}

/**
 * Owns the effective tier. AUTO adapts it from PerformanceMonitor signals (see AdaptiveQuality.tsx); a manual
 * choice pins it. Pure logic with an injectable clock so it can be unit-tested; no storage, no React.
 */
export class PerformanceGovernor {
  private currentQuality: QualityLevel = 'MEDIUM';
  private manual: QualityLevel | null = null;
  private ceiling: QualityLevel = 'MEDIUM';
  private floorSince: number | null = null;
  private ceilingSince: number | null = null;
  private lastTierChange = -Infinity;
  private lastDirection: 1 | -1 | 0 = 0;
  private flips = 0;
  private flipWindowStart = 0;
  private lockedFlag = false;

  constructor(initial: QualityLevel = detectInitialQuality()) {
    this.currentQuality = initial;
    this.ceiling = initial;
  }

  /** Apply the user's `settings.quality`: a tier pins it, 'AUTO' hands control back to adaptation. */
  public setQuality(choice: QualityLevel | 'AUTO', initial: QualityLevel = detectInitialQuality()) {
    this.floorSince = this.ceilingSince = null;
    this.lastDirection = 0;
    this.flips = 0;
    this.flipWindowStart = 0;
    this.lockedFlag = false;
    if (choice === 'AUTO') {
      this.manual = null;
      this.currentQuality = initial;
      this.ceiling = initial;
    } else {
      this.manual = choice;
      this.currentQuality = choice;
      this.ceiling = choice;
    }
  }

  public getSettings(): QualitySettings {
    return QUALITY_PRESETS[this.currentQuality];
  }

  public isAuto(): boolean {
    return this.manual === null;
  }

  /** True once oscillation was detected: adaptation has stopped. */
  public isLocked(): boolean {
    return this.lockedFlag;
  }

  private noteDirection(dir: 1 | -1, now: number): boolean {
    if (this.lastDirection !== 0 && dir !== this.lastDirection) {
      // Reversals only count while they cluster; an occasional dip and recovery must not lock the governor.
      if (now - this.flipWindowStart > GOVERNOR.flipWindowMs) {
        this.flips = 0;
        this.flipWindowStart = now;
      }
      this.flips++;
    }
    this.lastDirection = dir;
    if (this.flips >= GOVERNOR.flipLimit && !this.lockedFlag) {
      this.lockedFlag = true;
      if (this.currentQuality === 'HIGH') this.currentQuality = 'MEDIUM';
      return true;
    }
    return false;
  }

  private change(to: QualityLevel, now: number): QualityLevel {
    this.currentQuality = to;
    this.lastTierChange = now;
    this.floorSince = this.ceilingSince = null;
    return to;
  }

  /**
   * PerformanceMonitor reported a decline. `factor` is its resolution factor AFTER the decline.
   * Returns the new tier when one is dropped (and, on oscillation lock, the settled tier), else null.
   */
  public noteDecline(factor: number, now: number): QualityLevel | null {
    if (this.manual !== null || this.lockedFlag) return null;
    this.ceilingSince = null;
    if (this.noteDirection(-1, now)) return this.currentQuality;
    if (factor > 0) {
      this.floorSince = null;
      return null;
    }
    if (this.floorSince === null) this.floorSince = now;
    const idx = TIER_ORDER.indexOf(this.currentQuality);
    if (idx > 0 && now - this.floorSince >= GOVERNOR.declineHoldMs && now - this.lastTierChange >= GOVERNOR.minTierGapMs) {
      return this.change(TIER_ORDER[idx - 1], now);
    }
    return null;
  }

  /** PerformanceMonitor reported an incline (see noteDecline). Restores a tier the governor dropped, never above the start tier. */
  public noteIncline(factor: number, now: number): QualityLevel | null {
    if (this.manual !== null || this.lockedFlag) return null;
    this.floorSince = null;
    if (this.noteDirection(1, now)) return this.currentQuality;
    if (factor < 1) {
      this.ceilingSince = null;
      return null;
    }
    if (this.ceilingSince === null) this.ceilingSince = now;
    const idx = TIER_ORDER.indexOf(this.currentQuality);
    if (
      idx < TIER_ORDER.indexOf(this.ceiling) &&
      now - this.ceilingSince >= GOVERNOR.inclineHoldMs &&
      now - this.lastTierChange >= GOVERNOR.minTierGapMs
    ) {
      return this.change(TIER_ORDER[idx + 1], now);
    }
    return null;
  }
}

export const performanceGovernor = new PerformanceGovernor();
