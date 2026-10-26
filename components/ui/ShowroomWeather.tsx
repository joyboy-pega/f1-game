'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { WeatherType } from '@/lib/game/gameState';

const RAIN_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    float boxW = 120.0;
    float boxH = 55.0;
    float boxD = 120.0;

    // Continuous downward loop
    float y = mod(aSeed.y * boxH - uTime * 60.0, boxH);
    float x = (aSeed.x - 0.5) * boxW;
    float z = (aSeed.z - 0.5) * boxD;

    // Billboard vectors from view matrix
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 streakDir = normalize(vec3(0.08, -1.0, 0.03));

    vec3 worldPos = vec3(x, y, z);
    worldPos += camRight * (position.x * 0.16) + streakDir * (position.y * 2.4);

    // Fade smoothly near top and bottom
    vFade = smoothstep(0.0, 3.5, y) * smoothstep(boxH, boxH - 4.0, y);
    vUv = position.xy + 0.5;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const RAIN_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vFade;

  void main() {
    float d = abs(vUv.x * 2.0 - 1.0);
    float core = 1.0 - pow(d, 2.0);
    float fadeY = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
    float a = max(0.0, core * fadeY) * 0.48 * vFade;
    if (a < 0.01) discard;

    gl_FragColor = vec4(0.85, 0.92, 1.0, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RIPPLE_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    float boxW = 90.0;
    float boxD = 90.0;
    float x = (aSeed.x - 0.5) * boxW;
    float z = (aSeed.z - 0.5) * boxD;

    // Ripple expands and fades
    float progress = fract(aSeed.y + uTime * 1.6);
    float radius = 0.2 + progress * 1.5;
    vAlpha = (1.0 - progress) * smoothstep(0.0, 0.15, progress) * 0.38;

    vec3 worldPos = vec3(x + position.x * radius, 0.02, z + position.y * radius);
    vUv = position.xy + 0.5;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const RIPPLE_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float r = length(c);
    float ring = smoothstep(0.7, 0.88, r) * (1.0 - smoothstep(0.92, 1.0, r));
    float a = ring * vAlpha;
    if (a < 0.01) discard;

    gl_FragColor = vec4(0.85, 0.92, 1.0, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SNOW_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    float boxW = 120.0;
    float boxH = 50.0;
    float boxD = 120.0;

    float y = mod(aSeed.y * boxH - uTime * 10.0, boxH);
    // Drifting flutter
    float swirlX = sin(uTime * 1.4 + aSeed.w * 6.283) * 3.4;
    float swirlZ = cos(uTime * 1.1 + aSeed.w * 6.283) * 3.4;
    float x = (aSeed.x - 0.5) * boxW + swirlX;
    float z = (aSeed.z - 0.5) * boxD + swirlZ;

    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    float size = 0.32 + aSeed.z * 0.42;
    vec3 worldPos = vec3(x, y, z) + camRight * (position.x * size) + camUp * (position.y * size);

    vFade = smoothstep(0.0, 2.5, y) * smoothstep(boxH, boxH - 3.5, y);
    vUv = position.xy + 0.5;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const SNOW_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float r = length(c);
    float a = smoothstep(1.0, 0.25, r) * 0.88 * vFade;
    if (a < 0.01) discard;

    gl_FragColor = vec4(0.96, 0.98, 1.0, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createInstancedGeometry(count: number, isPlaneXZ = false) {
  const quad = isPlaneXZ ? new THREE.PlaneGeometry(1, 1) : new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.getAttribute('position'));
  g.instanceCount = count;
  const seed = new Float32Array(count * 4);
  let s = 19;
  for (let i = 0; i < seed.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    seed[i] = (s >>> 8) / 16777216;
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  return g;
}

export function ShowroomWeather({ weather }: { weather?: WeatherType }) {
  const rainTimeRef = useRef({ value: 0 });
  const snowTimeRef = useRef({ value: 0 });

  const rainGeom = useMemo(() => (weather === 'rain' ? createInstancedGeometry(550) : null), [weather]);
  const rippleGeom = useMemo(() => (weather === 'rain' ? createInstancedGeometry(70, true) : null), [weather]);
  const snowGeom = useMemo(() => (weather === 'snow' ? createInstancedGeometry(420) : null), [weather]);

  const rainMat = useMemo(() => {
    if (weather !== 'rain') return null;
    return new THREE.ShaderMaterial({
      uniforms: { uTime: rainTimeRef.current },
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
  }, [weather]);

  const rippleMat = useMemo(() => {
    if (weather !== 'rain') return null;
    return new THREE.ShaderMaterial({
      uniforms: { uTime: rainTimeRef.current },
      vertexShader: RIPPLE_VERT,
      fragmentShader: RIPPLE_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
  }, [weather]);

  const snowMat = useMemo(() => {
    if (weather !== 'snow') return null;
    return new THREE.ShaderMaterial({
      uniforms: { uTime: snowTimeRef.current },
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
  }, [weather]);

  useEffect(() => {
    return () => {
      rainGeom?.dispose();
      rippleGeom?.dispose();
      snowGeom?.dispose();
      rainMat?.dispose();
      rippleMat?.dispose();
      snowMat?.dispose();
    };
  }, [rainGeom, rippleGeom, snowGeom, rainMat, rippleMat, snowMat]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    if (weather === 'rain') {
      rainTimeRef.current.value += d;
    } else if (weather === 'snow') {
      snowTimeRef.current.value += d;
    }
  });

  if (weather === 'rain' && rainGeom && rainMat && rippleGeom && rippleMat) {
    return (
      <group name="showroom-weather-rain">
        <mesh geometry={rainGeom} material={rainMat} frustumCulled={false} renderOrder={10} />
        <mesh geometry={rippleGeom} material={rippleMat} frustumCulled={false} renderOrder={8} />
      </group>
    );
  }

  if (weather === 'snow' && snowGeom && snowMat) {
    return (
      <group name="showroom-weather-snow">
        <mesh geometry={snowGeom} material={snowMat} frustumCulled={false} renderOrder={10} />
      </group>
    );
  }

  return null;
}
