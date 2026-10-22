/**
 * World units. The sim works in "world units", not metres.
 *  - UNITS_PER_M: the plan's nominal scale (1 unit = 0.1 m). Used for track metadata, which is authored in metres.
 *  - KMH_PER_UNIT: km/h per (world unit / s). physics.ts has always used 0.37, which makes 1 unit = 0.10278 m for speeds.
 *    PLAN-v3 §4.1 proposes 0.36 (exactly 0.1 m); that is a deliberate ~3 % change to displayed speed and to every speed limit,
 *    so it is deferred to a behaviour-changing task (T2/V2) to keep T1's golden hash bit-identical (§12.2 decision).
 */
export const UNITS_PER_M = 10;
export const KMH_PER_UNIT = 0.37;
/** 1 g in world units/s² (9.81 m/s² × UNITS_PER_M; written out so the camera rig's old literal is unchanged bit for bit). */
export const G_UNITS = 98.1;
