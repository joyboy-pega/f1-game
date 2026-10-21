import * as THREE from 'three';

/**
 * GPU-simulated particle pool: one InstancedBufferGeometry (camera-facing quad) = one draw call.
 * The CPU only writes spawn data into a ring buffer; position/size/fade are analytic functions of
 * (uTime - spawnTime) evaluated in the vertex shader, so there is no per-frame particle loop and
 * no per-frame allocation. Dead / unspawned slots collapse to a clipped vertex.
 */

/** Shared effect clock (seconds). Advanced by <Effects/>; frozen while paused. */
export const fxTime = { value: 0 };

let noiseTex: THREE.DataTexture | null = null;
/** Tiling RGBA noise used for cheap soft-edged smoke shapes. */
export function getNoiseTexture(): THREE.DataTexture {
  if (noiseTex) return noiseTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  // Deterministic LCG so screenshots are reproducible.
  let s = 1337;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = s >>> 24;
  }
  noiseTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

const COMMON_VERT_HEAD = /* glsl */ `
  attribute vec4 aPosT;    // xyz spawn position, w spawn time
  attribute vec4 aVelL;    // xyz initial velocity, w lifetime
  attribute vec4 aParams;  // x size0 / width, y size1 / length mult, z alpha, w seed
  attribute vec4 aColor;   // rgb colour, a linear drag
  uniform float uTime;
  uniform vec3 uGravity;
  varying vec2 vUv;
  varying float vAge;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSeed;
`;

const COMMON_POS = /* glsl */ `
  float age = uTime - aPosT.w;
  float life = aVelL.w;
  float u = age / life;
  if (age < 0.0 || u >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float k = max(aColor.a, 0.0001);
  vec3 wp = aPosT.xyz + aVelL.xyz * ((1.0 - exp(-k * age)) / k) + 0.5 * uGravity * age * age;
  vUv = position.xy + 0.5;
  vAge = u;
  vAlpha = aParams.z;
  vColor = aColor.rgb;
  vSeed = aParams.w;
`;

const SMOKE_VERT = /* glsl */ `
  ${COMMON_VERT_HEAD}
  #include <fog_pars_vertex>
  void main() {
    ${COMMON_POS}
    float size = mix(aParams.x, aParams.y, 1.0 - (1.0 - u) * (1.0 - u));
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    mvPosition.xy += position.xy * size;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SMOKE_FRAG = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uLight;
  varying vec2 vUv;
  varying float vAge;
  varying float vAlpha;
  varying vec3 vColor;
  varying float vSeed;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    // Per-particle rotated noise lookup -> ragged, billowy edge that slowly churns.
    float ang = vSeed * 6.2831 + vAge * 0.9;
    float ca = cos(ang), sa = sin(ang);
    vec2 q = mat2(ca, -sa, sa, ca) * c;
    float n1 = texture2D(uNoise, q * 0.35 + vec2(vSeed * 7.3, vSeed * 3.1)).r;
    float n2 = texture2D(uNoise, q * 0.9 + vec2(vSeed * 1.7, vAge * 0.15)).g;
    float n = n1 * 0.62 + n2 * 0.38;
    float body = 1.0 - smoothstep(0.15, 1.0, sqrt(r2) + (n - 0.5) * 0.7);
    float fadeIn = smoothstep(0.0, 0.07, vAge);
    float fadeOut = 1.0 - smoothstep(0.25, 1.0, vAge);
    float a = body * fadeIn * fadeOut * vAlpha;
    if (a < 0.004) discard;
    // Slightly darker core gives volume without any lighting.
    vec3 col = vColor * uLight * (0.8 + 0.2 * n);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const SPARK_VERT = /* glsl */ `
  ${COMMON_VERT_HEAD}
  varying float vSpeed;
  #include <fog_pars_vertex>
  void main() {
    ${COMMON_POS}
    vec3 vel = aVelL.xyz * exp(-k * age) + uGravity * age;
    float speed = length(vel);
    vec3 dirV = (viewMatrix * vec4(vel / max(speed, 0.001), 0.0)).xyz;
    vec2 d2 = dirV.xy;
    float l2 = length(d2);
    d2 = l2 > 0.001 ? d2 / l2 : vec2(0.0, 1.0);
    float len = clamp(speed * 0.045 * aParams.y, 0.8, 34.0) * max(l2, 0.3);
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    mvPosition.xy += d2 * position.y * len + vec2(-d2.y, d2.x) * position.x * aParams.x;
    vSpeed = speed;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const SPARK_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vAge;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = vUv * 2.0 - 1.0;
    // Thin hot core, soft halo, brighter at the head (uv.y = 1 is the leading end after the +0.5 shift).
    float across = 1.0 - smoothstep(0.0, 1.0, abs(c.x));
    float along = (1.0 - smoothstep(0.55, 1.0, abs(c.y))) * mix(0.35, 1.0, vUv.y);
    float core = pow(across, 3.0) * along;
    float a = (core + 0.25 * across * along) * (1.0 - vAge * vAge) * vAlpha;
    if (a < 0.01) discard;
    // HDR colour (>1) so the bloom pass picks it up; cools toward red as it ages.
    vec3 col = mix(vColor, vColor * vec3(1.0, 0.45, 0.15), vAge) * (1.0 + core * 1.5);
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export type PoolKind = 'smoke' | 'spark';

export class ParticlePool {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly capacity: number;
  private geometry: THREE.InstancedBufferGeometry;
  private posT: THREE.InstancedBufferAttribute;
  private velL: THREE.InstancedBufferAttribute;
  private params: THREE.InstancedBufferAttribute;
  private color: THREE.InstancedBufferAttribute;
  private head = 0;
  private lo = Infinity;
  private hi = -1;
  private wrapped = false;

  constructor(kind: PoolKind, capacity: number, gravity: THREE.Vector3, renderOrder = 6) {
    this.capacity = capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    g.instanceCount = capacity;
    const mk = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.posT = mk();
    this.velL = mk();
    this.params = mk();
    this.color = mk();
    for (let i = 0; i < capacity; i++) this.posT.array[i * 4 + 3] = -1e6;
    this.posT.needsUpdate = true;
    g.setAttribute('aPosT', this.posT);
    g.setAttribute('aVelL', this.velL);
    g.setAttribute('aParams', this.params);
    g.setAttribute('aColor', this.color);
    this.geometry = g;

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uNoise: { value: null }, uLight: { value: 1 } },
    ]);
    uniforms.uTime = fxTime;
    uniforms.uGravity = { value: gravity };
    uniforms.uNoise.value = getNoiseTexture();

    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: kind === 'smoke' ? SMOKE_VERT : SPARK_VERT,
      fragmentShader: kind === 'smoke' ? SMOKE_FRAG : SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: true,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  setLight(v: number) {
    this.material.uniforms.uLight.value = v;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number, alpha: number, seed: number,
    r: number, g: number, b: number, drag: number,
  ) {
    const i = this.head;
    const o = i * 4;
    const p = this.posT.array as Float32Array;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = fxTime.value;
    const v = this.velL.array as Float32Array;
    v[o] = vx; v[o + 1] = vy; v[o + 2] = vz; v[o + 3] = life;
    const q = this.params.array as Float32Array;
    q[o] = s0; q[o + 1] = s1; q[o + 2] = alpha; q[o + 3] = seed;
    const c = this.color.array as Float32Array;
    c[o] = r; c[o + 1] = g; c[o + 2] = b; c[o + 3] = drag;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
    this.head = i + 1;
    if (this.head >= this.capacity) {
      this.head = 0;
      this.wrapped = true;
    }
  }

  /** Upload only the slots written since the last flush. Call once per frame. */
  flush() {
    if (this.hi < 0) return;
    let lo = this.lo;
    let hi = this.hi;
    if (this.wrapped) { lo = 0; hi = this.capacity - 1; }
    const attrs = [this.posT, this.velL, this.params, this.color];
    for (const a of attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(lo * 4, (hi - lo + 1) * 4);
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
