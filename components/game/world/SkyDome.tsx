'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Lighting } from '@/lib/game/visuals/lighting';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;

const FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uCloud; uniform float uStars; uniform float uTime; uniform float uSunDisc;
uniform float uNight;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uGround, smoothstep(0.0, -0.08, h));

  float sd = max(dot(d, uSunDir), 0.0);
  float glow = pow(sd, 6.0) * 0.28 + pow(sd, 48.0) * 0.55;
  col += uSunColor * glow * (1.0 - uCloud * 0.75) * (1.0 - uNight * 0.8);
  col += uSunColor * smoothstep(0.9993, 0.9998, sd) * 14.0 * uSunDisc * (1.0 - uCloud * 0.9);

  // Analytic aerial perspective: forward-scattering sun haze across horizon (PLAN-v3 §7 G4)
  float forwardScatter = pow(sd, 3.5);
  vec3 aerialHaze = uSunColor * forwardScatter * 0.24 * (1.0 - uNight * 0.9) * (1.0 - smoothstep(0.0, 0.35, h));
  col += aerialHaze;

  // stars
  if (uStars > 0.01 && h > 0.0) {
    vec3 sp = d * 260.0;
    vec3 id = floor(sp);
    vec3 fr = fract(sp) - 0.5;
    float r = hash3(id);
    float star = step(0.985, r) * smoothstep(0.35, 0.0, length(fr));
    col += vec3(0.85, 0.9, 1.0) * star * uStars * (0.6 + 0.8 * hash3(id + 3.1)) * smoothstep(0.0, 0.2, h) * (1.0 - uCloud * 0.9);
  }

  // clouds on a flat layer (2 octaves: base cumulus + high-altitude cirrus)
  if (uCloud > 0.02 && h > 0.0) {
    vec2 uv = d.xz / (h + 0.18) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
    float n = fbm(uv);
    vec2 uv2 = d.xz / (h + 0.26) * 2.6 - vec2(uTime * 0.002, uTime * 0.003);
    float n2 = fbm(uv2);
    n = mix(n, n2, 0.28);
    float cover = smoothstep(1.0 - uCloud * 0.85 - 0.12, 1.0 - uCloud * 0.85 + 0.25, n);
    cover *= smoothstep(0.0, 0.14, h);
    vec3 lit = mix(uHorizon, vec3(1.0), 0.55) * (1.0 - uNight * 0.92);
    vec3 shade = mix(uHorizon, uZenith, 0.5) * (0.65 - uNight * 0.3);
    float sunSide = pow(sd, 3.0);
    vec3 cc = mix(shade, lit + uSunColor * 0.3 * sunSide, clamp(1.0 - n * 0.9 + sunSide * 0.3, 0.0, 1.0));
    cc = mix(cc, shade * 0.85, smoothstep(0.6, 1.0, uCloud) * 0.7);
    col = mix(col, cc, cover);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface Props {
  lighting: Lighting;
  /** Follow the active camera (true in the main scene, false inside the env capture). */
  follow?: boolean;
}

/** Gradient sky with sun glow/disc, procedural stars and clouds. One draw call, no textures. */
export function SkyDome({ lighting: L, follow = true }: Props) {
  const mesh = useRef<THREE.Mesh>(null);
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uCloud: { value: 0 },
      uStars: { value: 0 },
      uTime: { value: 0 },
      uSunDisc: { value: 1 },
      uNight: { value: 0 },
    }),
    []
  );
  useEffect(() => {
    uniforms.uZenith.value.set(L.skyZenith);
    uniforms.uHorizon.value.set(L.skyHorizon);
    uniforms.uGround.value.set(L.skyGround);
    uniforms.uSunDir.value.set(...L.sunDir);
    uniforms.uSunColor.value.set(L.sunColor);
    uniforms.uCloud.value = L.cloudCover;
    uniforms.uStars.value = L.starIntensity;
    uniforms.uSunDisc.value = L.sunVisible ? 1 : 0;
    uniforms.uNight.value = L.nightFactor;
  }, [L, uniforms]);

  useFrame(({ camera, clock }) => {
    uniforms.uTime.value = clock.elapsedTime;
    if (follow && mesh.current) mesh.current.position.copy(camera.position);
  });

  return (
    <mesh ref={mesh} renderOrder={-1000} frustumCulled={false} scale={6000}>
      <sphereGeometry args={[1, 40, 20]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        depthTest={false}
        fog={false}
      />
    </mesh>
  );
}
