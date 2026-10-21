// Camera shake shared between FX (producers) and the camera rig (consumer).
// Trauma model: intensity decays over time; camera offset ~ trauma^2 * noise.

let trauma = 0;

/** Add shake, 0..1 (0.15 kerb, 0.4 car contact, 0.8 heavy wall hit). */
export function addCameraShake(amount: number) {
  trauma = Math.min(1, trauma + amount);
}

/** Current shake magnitude (0..1, already squared) and decay; call once per frame from the camera. */
export function consumeCameraShake(dt: number): number {
  const v = trauma * trauma;
  trauma = Math.max(0, trauma - dt * 1.6);
  return v;
}
