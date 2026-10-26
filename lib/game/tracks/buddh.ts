import { TRACK_CONTROL_POINTS } from '../trackPoints';
import type { TrackMeta } from '../track/types';

/**
 * Buddh circuit (PLAN-v3 §4.2 T2).
 * Rescaled to official length 5125 m (from legacy 4611.092 m).
 * Includes variable track width (16 m default, 18 m pit straight),
 * authenticated 14 m elevation profile (uphill into T1/T3, drop down back straight, banked T10-T11),
 * and +5° inward camber on the multi-apex Turns 10-11 bowl.
 */
const UNCALIBRATED_LENGTH_M = 4611.092;
const OFFICIAL_LENGTH_M = 5125.0;
const SCALE_5125 = OFFICIAL_LENGTH_M / UNCALIBRATED_LENGTH_M;

export const buddhMeta: TrackMeta = {
  id: 'buddh',
  name: 'Buddh Circuit',
  country: 'India',
  lengthM: OFFICIAL_LENGTH_M,
  direction: 'cw',
  // Width keyframes (§4.2 T2): 18m on pit straight & through T1, 16m default around the circuit
  widthM: [
    [0, 18],
    [850, 18], // 18m through main straight and Turn 1
    [1100, 16], // Tapers to 16m on approach to Turn 3
    [1300, 16],
    [4800, 16],
    [5050, 18],
    [OFFICIAL_LENGTH_M, 18],
  ],
  // Elevation keyframes (§4.2 T2): ~14m total elevation change
  elevation: [
    [0, 0.0], // Start/finish line baseline
    [500, 4.0], // Uphill approach to Turn 1 (source: official Buddh circuit topography)
    [800, 10.0], // Turn 1 crest (~+10 m)
    [1050, 11.5], // Rise to Turn 3
    [1300, 14.0], // Turn 3 summit (+14 m, circuit apex)
    [1850, -2.0], // Back straight dip (known -14m drop from T3 down 1.06 km back straight)
    [2550, 0.0], // Turn 4 hairpin braking zone
    [3100, 5.0], // Turn 5-7 chicane crest (approximate rolling terrain)
    [3650, 2.0], // Turn 8-9 valley
    [4150, -3.0], // Turn 10-11 bowl descent (known descending banked corner)
    [4550, -1.0], // Turn 11 exit
    [4850, 2.5], // Turn 13-14 rise (approximate)
    [OFFICIAL_LENGTH_M, 0.0], // Return to baseline at finish line
  ],
  // Camber keyframes (§4.2 T2): T10–T11 banking ~ +4–6° (+0.087 rad) toward inside, ramped over 60 m
  camber: [
    [0, 0],
    [4050, 0], // 60m ramp before Turn 10
    [4110, 0.087], // Turn 10 entry (+5° inward banking)
    [4500, 0.087], // Turn 11 exit
    [4560, 0], // 60m ramp-out
    [OFFICIAL_LENGTH_M, 0],
  ],
  sectorsM: [672.297 * SCALE_5125, 2714.018 * SCALE_5125],
  drsZones: [
    { id: 1, name: 'ZONE 1 · MAIN STRAIGHT', detectionM: 4130.731 * SCALE_5125, startM: 4226.767 * SCALE_5125, endM: 192.298 * SCALE_5125 },
    { id: 2, name: 'ZONE 2 · BACK STRAIGHT', detectionM: 696.304 * SCALE_5125, startM: 792.441 * SCALE_5125, endM: 1705.492 * SCALE_5125 },
  ],
  pit: {
    side: 1,
    entryM: 4298.766 * SCALE_5125,
    exitM: 240.35 * SCALE_5125,
    boxStartM: 4358.799 * SCALE_5125,
    boxEndM: 4575.085 * SCALE_5125,
    speedLimitKmh: 80,
  },
  gridSlotSpacingM: 8.0, // Standard F1 8m grid slot spacing
  scenery: {},
};

export const buddhControlPoints: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i < TRACK_CONTROL_POINTS.length; i += 2) {
    pts.push([TRACK_CONTROL_POINTS[i] * SCALE_5125, TRACK_CONTROL_POINTS[i + 1] * SCALE_5125]);
  }
  return pts;
})();
