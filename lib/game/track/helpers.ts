import { track } from './state';

/** True when spline index i lies on the stretch between pit entry and pit exit. */
export function inPitIdxRange(i: number): boolean {
  const pit = track.current.pit;
  return i >= pit.entryIdx || i <= pit.exitIdx;
}

/** True when a point (spline index, signed lateral) lies on the pit-lane asphalt band. */
export function inPitBand(i: number, lateral: number): boolean {
  if (!inPitIdxRange(i)) return false;
  const pit = track.current.pit;
  const l = lateral * pit.side;
  return l >= pit.laneOffset - pit.laneHalfWidth && l <= pit.laneOffset + pit.laneHalfWidth;
}

/** True when spline index idx lies inside any DRS zone of the active track. */
export function isInDrsZone(idx: number): boolean {
  const zones = track.current.drs;
  for (let k = 0; k < zones.length; k++) {
    const z = zones[k];
    if (z.wraps) {
      if (idx >= z.start || idx <= z.end) return true;
    } else if (idx >= z.start && idx <= z.end) return true;
  }
  return false;
}
