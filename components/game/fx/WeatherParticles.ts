import * as THREE from 'three';
import { fxTime } from './ParticlePool';

/**
 * Rain streaks / snow flakes in a box that follows the camera. Every drop is a stretched
 * camera-facing quad; its position (wrapped into the box) and streak direction (relative velocity of
 * drop vs. camera, so streaks lean with your speed) are computed entirely in the vertex shader.
 */

const VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uCamVel;
  uniform float uFall;
  uniform float uShutter;
  uniform float uSwirl;
  uniform float uRain;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    // 3D depth in front of the camera: 6.0 to 20.0 units
    float dist = 6.0 + aSeed.z * 14.0;
    float z = -dist;

    // Frustum half-extents at distance dist (FOV ~65 deg)
    float halfH = dist * 0.62;
    float halfW = dist * 0.84;

    // Faster fall cycle for rain, gentler drift for snow
    float fallRate = (uRain > 0.5) ? 1.5 : 0.45;
    float yCycle = fract(aSeed.y + uTime * fallRate);
    float y = (1.0 - yCycle * 2.0) * halfH;

    // Wind swirl and horizontal spread
    float swirl = uSwirl * sin(uTime * 1.5 + aSeed.w * 6.283) * ((uRain > 0.5) ? 0.08 : 0.75);
    float x = (aSeed.x * 2.0 - 1.0) * halfW + swirl;

    // Streak orientation: slight natural wind tilt + camera motion
    float windTilt = (uRain > 0.5) ? (0.09 * sin(uTime * 0.4) + 0.05) : 0.0;
    vec2 dir = normalize(vec2(windTilt, 1.0));
    vec2 perp = vec2(-dir.y, dir.x);

    // Stretched fine needle streak for rain, round soft flake for snow
    float w = (uRain > 0.5) ? (0.0022 * dist + 0.022) : (0.015 * dist + 0.08);
    float len = (uRain > 0.5) ? (0.045 * dist + 0.55) : w;

    vec4 mvPos = vec4(x, y, z, 1.0);
    mvPos.xy += dir * (position.y * len) + perp * (position.x * w);

    float edgeY = smoothstep(0.0, 0.05, yCycle) * (1.0 - smoothstep(0.95, 1.0, yCycle));
    float edgeZ = smoothstep(6.0, 8.0, dist) * (1.0 - smoothstep(18.0, 20.0, dist));
    vFade = edgeY * edgeZ;

    vUv = position.xy + 0.5;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uRain;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    
    // Rain: aerodynamic streak with bright core
    float rainAcross = 1.0 - pow(abs(c.x), 2.0);
    float rainAlong = 1.0 - pow(abs(c.y), 2.5);
    float rainAlpha = max(0.0, rainAcross * rainAlong);

    // Snow: fluffy round snowflake
    float r = length(c);
    float snowAlpha = smoothstep(1.0, 0.2, r);

    float a = mix(snowAlpha, rainAlpha, uRain) * uAlpha * vFade;
    if (a < 0.01) discard;

    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class WeatherParticles {
  readonly mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.InstancedBufferGeometry;
  private prevCam = new THREE.Vector3();
  private camVel = new THREE.Vector3();
  private first = true;
  private baseColor: THREE.Color;

  constructor(kind: 'rain' | 'snow', count: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.instanceCount = count;
    const seed = new Float32Array(count * 4);
    let s = 7;
    for (let i = 0; i < seed.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      seed[i] = (s >>> 8) / 16777216;
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    this.geometry = g;
    const rain = kind === 'rain';
    this.baseColor = rain ? new THREE.Color(0.85, 0.92, 1.0) : new THREE.Color(1, 1, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: fxTime,
        uCamVel: { value: this.camVel },
        uFall: { value: rain ? 130 : 22 },
        uShutter: { value: rain ? 0.048 : 0.015 },
        uSwirl: { value: rain ? 1.5 : 14.0 },
        uMinWidth: { value: rain ? 0.32 : 0.65 },
        uWidthPerDist: { value: rain ? 0.016 : 0.025 },
        uColor: { value: this.baseColor.clone() },
        uAlpha: { value: rain ? 0.38 : 0.85 },
        uRain: { value: rain ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  update(dt: number, cam: THREE.Vector3, light: number) {
    const u = this.material.uniforms;
    if (this.first) {
      this.prevCam.copy(cam);
      this.first = false;
    }
    if (dt > 1e-4) {
      // Smoothed camera velocity: raw per-frame deltas jitter with shake / interpolation.
      const k = Math.min(1, dt * 12);
      this.camVel.x += ((cam.x - this.prevCam.x) / dt - this.camVel.x) * k;
      this.camVel.y += ((cam.y - this.prevCam.y) / dt - this.camVel.y) * k;
      this.camVel.z += ((cam.z - this.prevCam.z) / dt - this.camVel.z) * k;
    }
    this.prevCam.copy(cam);
    // Keep a solid brightness floor so particles catch the light against dark/rainy skies
    (u.uColor.value as THREE.Color).copy(this.baseColor).multiplyScalar(Math.max(0.65, light));
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
