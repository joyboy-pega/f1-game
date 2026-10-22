import { describe, expect, it } from 'vitest';
import {
  DPR_FLOOR_RATIO,
  GOVERNOR,
  PerformanceGovernor,
  QUALITY_PRESETS,
  dprFor,
  migrateLegacyQualityKey,
} from './performance';

const S = 1000;

describe('dprFor', () => {
  it('maps factor 1 to the tier resolution and factor 0 to the floor, clamped', () => {
    expect(dprFor('HIGH', 1)).toBeCloseTo(QUALITY_PRESETS.HIGH.pixelRatio);
    expect(dprFor('HIGH', 0)).toBeCloseTo(QUALITY_PRESETS.HIGH.pixelRatio * DPR_FLOOR_RATIO);
    expect(dprFor('MEDIUM', 0.5)).toBeCloseTo(QUALITY_PRESETS.MEDIUM.pixelRatio * (DPR_FLOOR_RATIO + (1 - DPR_FLOOR_RATIO) * 0.5));
    expect(dprFor('LOW', 7)).toBeCloseTo(QUALITY_PRESETS.LOW.pixelRatio);
    expect(dprFor('LOW', -2)).toBeCloseTo(QUALITY_PRESETS.LOW.pixelRatio * DPR_FLOOR_RATIO);
  });
});

describe('PerformanceGovernor (AUTO)', () => {
  it('only drops a tier after resolution has sat on its floor for declineHoldMs', () => {
    const g = new PerformanceGovernor('HIGH');
    expect(g.noteDecline(0.4, 0)).toBeNull(); // resolution still above the floor
    expect(g.noteDecline(0, 10 * S)).toBeNull(); // floor reached: timer starts
    expect(g.noteDecline(0, 10 * S + GOVERNOR.declineHoldMs - 1)).toBeNull();
    expect(g.noteDecline(0, 10 * S + GOVERNOR.declineHoldMs)).toBe('MEDIUM');
    expect(g.getSettings().level).toBe('MEDIUM');
  });

  it('never changes tier twice within minTierGapMs', () => {
    const g = new PerformanceGovernor('HIGH');
    g.noteDecline(0, 0);
    expect(g.noteDecline(0, GOVERNOR.declineHoldMs)).toBe('MEDIUM');
    // floor again for the full hold, but the previous change is too recent
    g.noteDecline(0, GOVERNOR.declineHoldMs + 1);
    expect(g.noteDecline(0, GOVERNOR.declineHoldMs * 2 + 2)).toBeNull();
    // after the gap the next drop is allowed
    const t = GOVERNOR.declineHoldMs + GOVERNOR.minTierGapMs;
    expect(g.noteDecline(0, t)).toBe('LOW');
  });

  it('does not drop below LOW', () => {
    const g = new PerformanceGovernor('LOW');
    g.noteDecline(0, 0);
    expect(g.noteDecline(0, 60 * S)).toBeNull();
  });

  it('restores a dropped tier only after the long incline hold, and never above the starting tier', () => {
    const g = new PerformanceGovernor('HIGH');
    g.noteDecline(0, 0);
    expect(g.noteDecline(0, GOVERNOR.declineHoldMs)).toBe('MEDIUM');
    const t0 = 100 * S;
    expect(g.noteIncline(1, t0)).toBeNull();
    expect(g.noteIncline(1, t0 + GOVERNOR.inclineHoldMs - 1)).toBeNull();
    expect(g.noteIncline(1, t0 + GOVERNOR.inclineHoldMs)).toBe('HIGH');
    // at the ceiling already: nothing further
    expect(g.noteIncline(1, t0 + 200 * S)).toBeNull();

    const m = new PerformanceGovernor('MEDIUM');
    m.noteIncline(1, 0);
    expect(m.noteIncline(1, 120 * S)).toBeNull();
  });

  it('a manual tier pins everything', () => {
    const g = new PerformanceGovernor('HIGH');
    g.setQuality('LOW');
    expect(g.isAuto()).toBe(false);
    g.noteDecline(0, 0);
    expect(g.noteDecline(0, 60 * S)).toBeNull();
    expect(g.noteIncline(1, 120 * S)).toBeNull();
    expect(g.getSettings().level).toBe('LOW');
    g.setQuality('AUTO', 'MEDIUM');
    expect(g.isAuto()).toBe(true);
    expect(g.getSettings().level).toBe('MEDIUM');
  });

  it('an oscillating borderline GPU locks on MEDIUM instead of flapping (the old MEDIUM<->LOW loop)', () => {
    const g = new PerformanceGovernor('HIGH');
    let changes = 0;
    let t = 0;
    // alternate decline / incline every 2.5 s (one PerformanceMonitor evaluation) for 5 minutes
    for (let i = 0; i < 120; i++) {
      t += 2.5 * S;
      const r = i % 2 === 0 ? g.noteDecline(0.5, t) : g.noteIncline(0.5, t);
      if (r) changes++;
    }
    expect(g.isLocked()).toBe(true);
    expect(g.getSettings().level).toBe('MEDIUM');
    expect(changes).toBe(1); // exactly one settle, no more flapping
  });

  it('occasional dip-and-recover spread over minutes does not lock', () => {
    const g = new PerformanceGovernor('HIGH');
    let t = 0;
    for (let i = 0; i < 6; i++) {
      t += GOVERNOR.flipWindowMs + 5 * S;
      g.noteDecline(0.8, t);
      g.noteIncline(1, t + 2.5 * S);
    }
    expect(g.isLocked()).toBe(false);
  });
});

describe('migrateLegacyQualityKey', () => {
  const fake = (value: string | null) => {
    const store = new Map<string, string>(value === null ? [] : [['formula_v_quality', value]]);
    return { store, api: { getItem: (k: string) => store.get(k) ?? null, removeItem: (k: string) => void store.delete(k) } };
  };

  it('returns a valid tier and deletes the key', () => {
    const f = fake('HIGH');
    expect(migrateLegacyQualityKey(f.api)).toBe('HIGH');
    expect(f.store.has('formula_v_quality')).toBe(false);
  });

  it('deletes a garbage value and returns null', () => {
    const f = fake('ULTRA');
    expect(migrateLegacyQualityKey(f.api)).toBeNull();
    expect(f.store.has('formula_v_quality')).toBe(false);
  });

  it('returns null when absent, and when storage throws', () => {
    expect(migrateLegacyQualityKey(fake(null).api)).toBeNull();
    const boom = { getItem: () => { throw new Error('denied'); }, removeItem: () => {} };
    expect(migrateLegacyQualityKey(boom)).toBeNull();
  });
});
