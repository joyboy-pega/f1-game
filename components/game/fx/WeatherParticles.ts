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
  uniform vec3 uCam;
  uniform vec3 uCamVel;
  uniform vec3 uBox;
  uniform float uFall;
  uniform float uShutter;
  uniform float uSwirl;
  uniform float uMinWidth;
  uniform float uWidthPerDist;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vec3 p0 = aSeed.xyz * uBox + vec3(0.0, -uFall * uTime, 0.0);
    p0.xz += uSwirl * vec2(sin(uTime * 0.7 + aSeed.w * 6.28), cos(uTime * 0.55 + aSeed.w * 9.0));
    vec3 rel = mod(p0 - uCam + 0.5 * uBox, uBox) - 0.5 * uBox;
    vec3 head = uCam + rel;
    vec3 rv = vec3(0.0, -uFall, 0.0) - uCamVel;
    float rl = length(rv);
    vec3 tail = head - rv * min(uShutter, 40.0 / max(rl, 0.001));
    vec4 a = viewMatrix * vec4(head, 1.0);
    vec4 b = viewMatrix * vec4(tail, 1.0);
    float t = position.y + 0.5;
    vec3 m = mix(a.xyz, b.xyz, t);
    vec3 axis = b.xyz - a.xyz;
    vec3 side = cross(axis, m);
    float sl = length(side);
    side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
    float dist = length(m);
    float width = max(uMinWidth, uWidthPerDist * dist) * (0.7 + 0.6 * aSeed.w);
    m += side * position.x * width;
    // Near-camera drops would smear across the whole screen; fade them and the far fringe of the box.
    vFade = smoothstep(6.0, 30.0, dist) * (1.0 - smoothstep(0.38, 0.5, length(rel.xz / uBox.xz)));
    if (m.z > -0.6) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vUv = position.xy + 0.5;
    vSeed = aSeed.w;
    gl_Position = projectionMatrix * vec4(m, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uRain;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float across = 1.0 - abs(c.x);
    float along = 1.0 - pow(abs(c.y), 3.0);
    // Rain is brighter at the leading end (uv.y = 0 is the drop head); flakes are uniform soft capsules.
    float grad = mix(1.0, mix(1.0, 0.25, vUv.y), uRain);
    float a = pow(across, 1.4) * along * grad * uAlpha * vFade;
    if (a < 0.004) discard;
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
    this.baseColor = rain ? new THREE.Color(0.72, 0.8, 0.92) : new THREE.Color(1, 1, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: fxTime,
        uCam: { value: new THREE.Vector3() },
        uCamVel: { value: this.camVel },
        uBox: { value: rain ? new THREE.Vector3(420, 220, 420) : new THREE.Vector3(360, 200, 360) },
        uFall: { value: rain ? 95 : 22 },
        uShutter: { value: rain ? 0.028 : 0.014 },
        uSwirl: { value: rain ? 0 : 14 },
        uMinWidth: { value: rain ? 0.05 : 0.35 },
        uWidthPerDist: { value: rain ? 0.0016 : 0.0032 },
        uColor: { value: rain ? new THREE.Color(0.72, 0.8, 0.92) : new THREE.Color(1, 1, 1) },
        uAlpha: { value: rain ? 0.34 : 0.85 },
        uRain: { value: rain ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  update(dt: number, cam: THREE.Vector3, light: number) {
    const u = this.material.uniforms;
    (u.uCam.value as THREE.Vector3).copy(cam);
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
    // Night dims the drops (they would otherwise glow white against a black sky); floodlights keep a floor.
    (u.uColor.value as THREE.Color).copy(this.baseColor).multiplyScalar(Math.max(0.45, light));
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
