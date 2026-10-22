/**
 * World units. The sim works in "world units", not metres, and ONE scale applies everywhere: 1 unit = 0.1 m.
 *  - UNITS_PER_M: units per metre (track metadata is authored in metres).
 *  - KMH_PER_UNIT: km/h per (world unit / s) = 3.6 / UNITS_PER_M = 0.36.
 * Until U1 (2026-10-22) physics used 0.37 (1 unit = 0.10278 m for speeds only) while lengths, audio and the camera used 0.1 m;
 * aligning them made displayed speeds ~2.7 % lower for the same motion and Buddh 4611 m long (not 4739 m).
 */
export const UNITS_PER_M = 10;
export const KMH_PER_UNIT = 3.6 / UNITS_PER_M;
/** 1 g in world units/s² (9.81 m/s² × UNITS_PER_M; written out so the camera rig's old literal is unchanged bit for bit). */
export const G_UNITS = 98.1;
