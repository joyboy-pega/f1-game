import * as THREE from 'three';
import { fxTime } from './ParticlePool';

const STRIDE = 12; // per-wheel trail state
const MIN_STEP = 6; // world units between ribbon vertices (~0.6 m)
const MAX_STEP = 70; // larger jumps = teleport / reset: start a new trail

const VERT = /* glsl */ `
  attribute vec3 aInfo; // x alpha, y spawn time, z 0..1 across the ribbon
  uniform float uTime;
  varying float vAlpha;
  varying float vSide;
  #include <fog_pars_vertex>
  void main() {
    float age = uTime - aInfo.y;
    // Marks survive a long time, then fade out so the ring buffer never "pops".
    vAlpha = aInfo.x * (1.0 - smoothstep(90.0, 210.0, age));
    vSide = aInfo.z;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vSide;
  #include <fog_pars_fragment>
  void main() {
    float edge = smoothstep(0.0, 0.3, vSide) * smoothstep(0.0, 0.3, 1.0 - vSide);
    float a = vAlpha * edge;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.012, 0.012, 0.016, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * Skid marks for every wheel of every car as ribbon quads in one shared ring buffer
 * (one draw call). Old segments are overwritten oldest-first and fade with age.
 */
export class SkidTrails {
  readonly mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private pos: THREE.BufferAttribute;
  private info: THREE.BufferAttribute;
  private material: THREE.ShaderMaterial;
  private trails: Float32Array;
  private head = 0;
  private lo = Infinity;
  private hi = -1;
  private wrapped = false;

  constructor(private segments: number, slots: number) {
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(segments * 12), 3);
    this.info = new THREE.BufferAttribute(new Float32Array(segments * 12), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.info.setUsage(THREE.DynamicDrawUsage);
    const index = new Uint16Array(segments * 6);
    for (let s = 0; s < segments; s++) {
      const v = s * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], s * 6);
    }
    g.setAttribute('position', this.pos);
    g.setAttribute('aInfo', this.info);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry = g;
    this.trails = new Float32Array(slots * STRIDE);

    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
    uniforms.uTime = fxTime;
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      fog: true,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Feed one wheel for this frame. `intensity` 0..1 (0 / false lifts the pen). */
  update(slot: number, active: boolean, wx: number, wy: number, wz: number, halfWidth: number, intensity: number) {
    const t = this.trails;
    const o = slot * STRIDE;
    if (!active || intensity <= 0.02) {
      t[o] = 0;
      return;
    }
    if (t[o] === 0) {
      t[o] = 1; t[o + 1] = wx; t[o + 2] = wz; t[o + 3] = 0; t[o + 8] = 0; t[o + 9] = wy;
      return;
    }
    const dx = wx - t[o + 1];
    const dz = wz - t[o + 2];
    const d2 = dx * dx + dz * dz;
    if (d2 < MIN_STEP * MIN_STEP) return;
    if (d2 > MAX_STEP * MAX_STEP) {
      t[o + 1] = wx; t[o + 2] = wz; t[o + 3] = 0; t[o + 8] = 0; t[o + 9] = wy;
      return;
    }
    const d = Math.sqrt(d2);
    // Ribbon width is perpendicular to the wheel's *travel*, so slides don't twist the strip.
    const px = (-dz / d) * halfWidth;
    const pz = (dx / d) * halfWidth;
    if (t[o + 3] === 0) {
      t[o + 4] = t[o + 1] + px; t[o + 5] = t[o + 2] + pz;
      t[o + 6] = t[o + 1] - px; t[o + 7] = t[o + 2] - pz;
      t[o + 10] = t[o + 9]; // ply
      t[o + 11] = t[o + 9]; // pry
    }
    const nlx = wx + px, nlz = wz + pz, nrx = wx - px, nrz = wz - pz;
    const a0 = t[o + 8];
    // Ease the opacity in so marks start as a tapered scuff instead of a hard block.
    const a1 = Math.min(intensity, a0 + 0.35);
    this.writeSegment(t[o + 4], t[o + 10], t[o + 5], t[o + 6], t[o + 11], t[o + 7], nlx, wy, nlz, nrx, wy, nrz, a0, a1);
    t[o + 1] = wx; t[o + 2] = wz; t[o + 3] = 1;
    t[o + 4] = nlx; t[o + 5] = nlz; t[o + 6] = nrx; t[o + 7] = nrz;
    t[o + 8] = a1;
    t[o + 9] = wy;
    t[o + 10] = wy;
    t[o + 11] = wy;
  }

  private writeSegment(
    plx: number, ply: number, plz: number,
    prx: number, pry: number, prz: number,
    nlx: number, nly: number, nlz: number,
    nrx: number, nry: number, nrz: number,
    a0: number, a1: number,
  ) {
    const s = this.head;
    const p = this.pos.array as Float32Array;
    const n = this.info.array as Float32Array;
    const o = s * 12;
    const now = fxTime.value;
    p[o + 0] = plx; p[o + 1] = ply; p[o + 2] = plz;
    p[o + 3] = prx; p[o + 4] = pry; p[o + 5] = prz;
    p[o + 6] = nlx; p[o + 7] = nly; p[o + 8] = nlz;
    p[o + 9] = nrx; p[o + 10] = nry; p[o + 11] = nrz;
    n[o] = a0; n[o + 1] = now; n[o + 2] = 0;
    n[o + 3] = a0; n[o + 4] = now; n[o + 5] = 1;
    n[o + 6] = a1; n[o + 7] = now; n[o + 8] = 0;
    n[o + 9] = a1; n[o + 10] = now; n[o + 11] = 1;
    if (s < this.lo) this.lo = s;
    if (s > this.hi) this.hi = s;
    this.head = s + 1;
    if (this.head >= this.segments) {
      this.head = 0;
      this.wrapped = true;
    }
  }

  flush() {
    if (this.hi < 0) return;
    let lo = this.lo;
    let hi = this.hi;
    if (this.wrapped) { lo = 0; hi = this.segments - 1; }
    for (const a of [this.pos, this.info]) {
      a.clearUpdateRanges();
      a.addUpdateRange(lo * 12, (hi - lo + 1) * 12);
      a.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -1;
    this.wrapped = false;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
