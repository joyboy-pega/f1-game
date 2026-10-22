import { TRACK_CONTROL_POINTS } from '../trackPoints';
import type { TrackMeta } from '../track/types';

/**
 * Buddh circuit (the game's original track). Metadata values were converted from the old spline-index constants
 * (constants.ts: SECTOR_BOUNDS, PIT_LANE, DRS_CONFIG.zones) using that spline's arc length, at 1 unit = 0.1 m;
 * the old index is noted beside each. `buildTrack` converts them back to the SAME indices (asserted in track.test.ts).
 * Length/width/elevation are unchanged here; T2 rescales to the real 5.125 km and adds width and elevation.
 */
export const buddhMeta: TrackMeta = {
  id: 'buddh',
  name: 'Buddh Circuit',
  country: 'India',
  // 46 110.9 world units at UNITS_PER_M = 10. (The S6 probe's 4739 m used 0.10278 m/unit from the 0.37 speed factor; the two
  // scales disagree by 2.8 %, see units.ts.) The real circuit is 5125 m: T2 rescales.
  lengthM: 4611.092,
  direction: 'cw',
  widthM: 13, // TW = 130 world units
  sectorsM: [672.297, 2714.018], // idx 280, 1130
  drsZones: [
    { id: 1, name: 'ZONE 1 · MAIN STRAIGHT', detectionM: 4130.731, startM: 4226.767, endM: 192.298 }, // idx 1720 / 1760 / 80
    { id: 2, name: 'ZONE 2 · BACK STRAIGHT', detectionM: 696.304, startM: 792.441, endM: 1705.492 }, // idx 290 / 330 / 710
  ],
  pit: {
    side: 1, // +normal is the outside of the circuit on the main straight
    entryM: 4298.766, // idx 1790
    exitM: 240.35, // idx 100
    boxStartM: 4358.799, // idx 1815
    boxEndM: 4575.085, // idx 1905
    speedLimitKmh: 80,
  },
  gridSlotSpacingM: 9.61, // gridSlotIndex() spaces slots 4 spline indices apart: 4 x (4611.1 m / 1920 points); T2 sets the F1 value (8 m)
  scenery: {},
};

export const buddhControlPoints: [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i < TRACK_CONTROL_POINTS.length; i += 2) pts.push([TRACK_CONTROL_POINTS[i], TRACK_CONTROL_POINTS[i + 1]]);
  return pts;
})();
