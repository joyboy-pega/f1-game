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
  float h = clamp(d.y, 0.0, 1.0);

  // 1. Physically-inspired atmospheric Rayleigh & ozone scattering gradient
  float rayleigh = 1.0 - exp(-h * 2.8);
  vec3 ozone = vec3(0.015, 0.025, 0.06) * (1.0 - uNight);
  vec3 skyGradient = mix(uHorizon, uZenith - ozone, rayleigh);

  // Warm golden/amber Rayleigh horizon glow
  float horizonGlow = exp(-h * 9.5) * (1.0 - uNight * 0.85);
  vec3 warmHorizon = mix(uHorizon, uSunColor * 0.95, 0.32);
  vec3 col = mix(skyGradient, warmHorizon, horizonGlow * 0.42);
  col = mix(col, uGround, smoothstep(0.0, -0.06, d.y));

  // 2. Twilight "Belt of Venus" arch opposite low sun
  if (uSunDir.y < 0.45 && uNight < 0.8) {
    float antiSun = max(dot(d, vec3(-uSunDir.x, 0.0, -uSunDir.z)), 0.0);
    float venusBand = smoothstep(0.01, 0.08, h) * smoothstep(0.24, 0.08, h) * pow(antiSun, 2.2);
    vec3 venusColor = vec3(0.90, 0.52, 0.64) * (0.42 - uSunDir.y * 0.55);
    col += max(venusColor, vec3(0.0)) * venusBand * (1.0 - uCloud * 0.7);
  }

  // 3. Multi-tiered solar disc, atmospheric corona, and forward glare
  float sd = max(dot(d, uSunDir), 0.0);
  float wideGlare = pow(sd, 3.5) * 0.32 + pow(sd, 14.0) * 0.42;
  float corona = pow(sd, 96.0) * 0.85 + pow(sd, 512.0) * 1.8;
  float discDist = 1.0 - sd;
  float sunDiscMask = smoothstep(0.00065, 0.00018, discDist) * uSunDisc;
  float limb = 0.72 + 0.28 * pow(smoothstep(0.00065, 0.0, discDist), 0.5);

  vec3 sunTotal = uSunColor * (wideGlare + corona) * (1.0 - uCloud * 0.8) * (1.0 - uNight * 0.9);
  sunTotal += (uSunColor * 16.0 + vec3(1.2)) * sunDiscMask * limb * (1.0 - uCloud * 0.92);
  col += sunTotal;

  // Forward-scattering atmospheric haze near horizon
  float forwardScatter = pow(sd, 3.5);
  vec3 aerialHaze = uSunColor * forwardScatter * 0.28 * (1.0 - uNight * 0.9) * (1.0 - smoothstep(0.0, 0.32, h));
  col += aerialHaze;

  // 4. Night sky: twinkling multi-colored stars & celestial Milky Way dust lane
  if (uStars > 0.01 && h > 0.0) {
    vec3 sp = d * 280.0;
    vec3 id = floor(sp);
    vec3 fr = fract(sp) - 0.5;
    float r = hash3(id);
    float starTwinkle = 0.72 + 0.28 * sin(uTime * 3.5 + r * 62.8);
    float star = step(0.984, r) * smoothstep(0.36, 0.0, length(fr)) * starTwinkle;

    // Star color temperature (blue, amber, white)
    float spec = hash3(id + 11.7);
    vec3 starColor = spec < 0.28 ? vec3(0.78, 0.89, 1.0) : (spec < 0.52 ? vec3(1.0, 0.88, 0.72) : vec3(0.96, 0.97, 1.0));
    col += starColor * star * uStars * (0.6 + 0.9 * hash3(id + 3.1)) * smoothstep(0.0, 0.16, h) * (1.0 - uCloud * 0.9);

    // Subtle Milky Way band
    vec3 mwDir = normalize(vec3(d.x * 0.8 - d.z * 0.6, d.y, d.x * 0.6 + d.z * 0.8));
    float galLat = abs(mwDir.x);
    if (galLat < 0.38) {
      float galMask = smoothstep(0.38, 0.04, galLat) * smoothstep(0.08, 0.5, h);
      float galDust = fbm(mwDir.yz * 8.0) * 0.5 + fbm(mwDir.yz * 16.0) * 0.25;
      vec3 galColor = vec3(0.18, 0.24, 0.35) * (galDust + 0.35);
      col += galColor * galMask * uStars * 0.55 * (1.0 - uCloud * 0.95);
    }
  }

  // 5. High-fidelity volumetric clouds with domain-warped swirls and silver linings
  if (uCloud > 0.015 && h > 0.005) {
    float invH = 1.0 / (h + 0.16);
    vec2 wind = vec2(uTime * 0.0032, uTime * 0.0012);
    vec2 cUv = d.xz * invH * 1.35 + wind;

    // Domain warping for turbulent billowy cloud structure
    vec2 warp = vec2(vnoise(cUv), vnoise(cUv + vec2(4.3, 1.7)));
    float n1 = fbm(cUv + warp * 0.45);

    // High wispy cirrus streaks layer
    vec2 cirrusUv = d.xz / (h + 0.42) * 2.8 - vec2(uTime * 0.0016, uTime * 0.0022);
    float cirrus = pow(fbm(cirrusUv), 2.2) * 0.45;

    float density = mix(n1, cirrus, 0.22);
    float cloudThreshold = 1.0 - uCloud * 0.82;
    float cloudCover = smoothstep(cloudThreshold - 0.14, cloudThreshold + 0.22, density);
    cloudCover *= smoothstep(0.005, 0.14, h);

    // Silver lining around backlit cloud edges when viewing toward the sun
    float silverLining = pow(sd, 4.5) * smoothstep(0.12, 0.6, cloudCover) * (1.0 - smoothstep(0.65, 0.95, cloudCover));
    vec3 cloudSunLit = mix(vec3(0.96, 0.97, 1.0), uSunColor * 1.25, 0.42) * (1.0 - uNight * 0.92);
    vec3 cloudShadow = mix(uZenith * 0.62, uHorizon * 0.72, 0.5) * (0.75 - uNight * 0.35);

    // 3D normal-bump lighting for cloud depth
    float eps = 0.04;
    float nRight = fbm(cUv + vec2(eps, 0.0) + warp * 0.45);
    float nUp = fbm(cUv + vec2(0.0, eps) + warp * 0.45);
    float bump = clamp((density - (nRight + nUp) * 0.5) * 4.8, -0.35, 0.55);

    vec3 cloudCol = mix(cloudShadow, cloudSunLit + bump * 0.28, clamp(density * 1.2 + sd * 0.35, 0.0, 1.0));
    cloudCol += uSunColor * silverLining * 1.6 * (1.0 - uNight);

    // Overcast / rain moodiness
    cloudCol = mix(cloudCol, cloudShadow * 0.7, smoothstep(0.72, 1.0, uCloud));
    col = mix(col, cloudCol, cloudCover);
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
      <sphereGeometry args={[1, 64, 32]} />
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
