/** Track data contract (PLAN-v3 §4.1). Metadata is in METRES of arc length, never spline indices. */

export interface DrsZoneMeta {
  /** Stable id / label used by the HUD and track dev page. (Added to the §4.1 sketch: the HUD needs a name.) */
  id: number;
  name: string;
  detectionM: number;
  startM: number;
  endM: number;
}

export interface PitMeta {
  /** +1: pit lane on the +normal side of the centreline. */
  side: 1 | -1;
  entryM: number;
  exitM: number;
  boxStartM: number;
  boxEndM: number;
  speedLimitKmh: number;
}

/** Placeholder for G3 (grandstands, buildings, tree density, barrier types per arc-length range). */
export interface SceneryPlan {
  treeDensity?: number;
}

export interface TrackMeta {
  id: string;
  /** Display name (place names OK; no F1/FOM trademarks or logos). */
  name: string;
  country: string;
  /** Official length; imported centrelines are scaled to it. Buddh (T1) keeps its authored length until T2. */
  lengthM: number;
  direction: 'cw' | 'ccw';
  widthM: number | [sM: number, widthM: number][];
  elevation?: [sM: number, hM: number][];
  camber?: [sM: number, radians: number][];
  /** Arc length of the S1/S2 and S2/S3 boundaries. */
  sectorsM: [number, number];
  drsZones: DrsZoneMeta[];
  pit: PitMeta;
  gridSlotSpacingM: number;
  sunAzimuthDeg?: number;
  scenery: SceneryPlan;
}

/** DRS zone as spline indices (derived from DrsZoneMeta at build time). */
export interface DrsZoneIdx {
  id: number;
  name: string;
  /** Detection point: just before the zone start. */
  detectIdx: number;
  start: number;
  end: number;
  /** The zone crosses the start/finish line (end < start). */
  wraps: boolean;
}

/** Pit lane as spline indices plus lateral offsets (world units from the centreline). */
export interface PitIdx {
  side: 1 | -1;
  entryIdx: number;
  exitIdx: number;
  boxStartIdx: number;
  boxEndIdx: number;
  laneOffset: number;
  laneHalfWidth: number;
  wallOffset: number;
  garageOffset: number;
  speedLimitKmh: number;
}

/** Derived once per track; immutable afterwards. All lengths in world units. */
export interface TrackRuntime {
  meta: TrackMeta;
  /** Number of spline points. */
  N: number;
  px: Float64Array;
  py: Float64Array;
  /** Elevation (world units). All zero until T2/T3. */
  pz: Float64Array;
  tx: Float64Array;
  ty: Float64Array;
  nx: Float64Array;
  ny: Float64Array;
  halfWidth: Float32Array;
  camber: Float32Array;
  grade: Float32Array;
  curvature: Float32Array;
  smoothCurvature: Float32Array;
  /** Distance from point i to i + 1. */
  segLen: Float32Array;
  /** Float32 on purpose: Buddh's golden race was recorded with Float32 arc lengths (T1 must stay bit-identical). */
  cumulativeS: Float32Array;
  length: number;
  sectorIdx: [number, number];
  drs: DrsZoneIdx[];
  pit: PitIdx;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}
