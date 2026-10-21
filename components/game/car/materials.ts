import * as THREE from 'three';
import { getGlowMap } from './wheels';

/** Materials shared by every car (module-level singletons). */
let shared: {
  carbon: THREE.MeshPhysicalMaterial;
  tyre: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  lamp: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
} | null = null;

export function getSharedMaterials() {
  if (shared) return shared;
  shared = {
    carbon: new THREE.MeshPhysicalMaterial({
      color: '#17191e',
      roughness: 0.38,
      metalness: 0.35,
      clearcoat: 0.8,
      clearcoatRoughness: 0.12,
    }),
    tyre: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#07090d',
      roughness: 0.05,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    lamp: new THREE.MeshStandardMaterial({ color: '#dfe9ff', emissive: '#bcd4ff', emissiveIntensity: 1.4, roughness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#c9ccd2', metalness: 0.9, roughness: 0.25 }),
  };
  return shared;
}

/** Per-car materials that animate (brake-disc glow, tail light). Created once per car. */
export function createCarMaterials() {
  const mk = () =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.55,
      roughness: 0.38,
      emissive: new THREE.Color('#ff5a12'),
      emissiveMap: getGlowMap(),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });
  return {
    rimFront: mk(),
    rimRear: mk(),
    brakeLight: new THREE.MeshStandardMaterial({
      color: '#3a0000',
      roughness: 0.25,
      emissive: new THREE.Color('#ff1a00'),
      emissiveIntensity: 0.15,
    }),
  };
}
