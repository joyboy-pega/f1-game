import * as THREE from 'three';
import { fxTime } from './ParticlePool';

/**
 * Realistic 3D rain streaks & snowflakes in a volume following the camera in world space.
 * Apparent streak direction and length are computed from the relative velocity of the drops
 * against the camera/car velocity (so at 300 km/h streaks rush towards the cockpit in 3D).
 */

const VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uCamPos;
  uniform vec3 uCamVel;
  uniform float uRain;
  uniform float uFall;
  uniform vec3 uBox;
  varying vec2 vUv;
  varying float vFade;

  void main() {
    vec3 halfBox = uBox * 0.5;

    // Instance spawn seed in box
    vec3 spawn = (aSeed.xyz - 0.5) * uBox;

    // Continuous downward motion
    float fallDist = uTime * uFall;
    spawn.y -= fallDist;

    // For snow: swirling wind turbulence
    if (uRain < 0.5) {
      spawn.x += sin(uTime * 1.5 + aSeed.w * 6.283) * 2.8;
      spawn.z += cos(uTime * 1.2 + aSeed.w * 6.283) * 2.8;
    }

    // Wrap around camera in world space (double modulo ensures non-negative wrapping in ANGLE/HLSL)
    vec3 rel = spawn - uCamPos;
    vec3 wrapped = mod(mod(rel + halfBox, uBox) + uBox, uBox) - halfBox;
    vec3 worldPos = uCamPos + wrapped;

    // Ground fade (particles splash / fade as they approach the ground)
    float groundFade = smoothstep(0.15, 1.8, worldPos.y);

    // Box boundary fade so particles fade in/out invisibly at the volume edges
    vec3 edge = abs(wrapped) / halfBox;
    float boxFade = (1.0 - smoothstep(0.72, 1.0, edge.x)) *
                    (1.0 - smoothstep(0.78, 1.0, edge.y)) *
                    (1.0 - smoothstep(0.72, 1.0, edge.z));

    float dist = length(wrapped);
    // Near lens fade: don't clip through camera near plane
    float nearFade = smoothstep(1.6, 3.8, dist);
    vFade = groundFade * boxFade * nearFade;

    // Apparent relative velocity: drops falling + camera/car motion
    vec3 dropVel = vec3(0.9 * sin(uTime * 0.4), -uFall, 0.6 * cos(uTime * 0.35));
    vec3 relVel = dropVel - uCamVel;
    float relSpeed = length(relVel);
    vec3 streakDir = normalize(relVel);

    // Camera billboard vector
    vec3 toCam = normalize(uCamPos - worldPos);
    vec3 side = cross(streakDir, toCam);
    float sideLen = length(side);
    if (sideLen < 0.05) {
      side = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    } else {
      side = side / sideLen;
    }

    if (uRain > 0.5) {
      // Dynamic motion-blurred rain streak stretching with relative speed
      float len = clamp(relSpeed * 0.026, 0.95, 4.4);
      float width = clamp(0.036 + dist * 0.0018, 0.032, 0.092);
      worldPos += streakDir * (position.y * len) + side * (position.x * width);
    } else {
      // Round fluffy snowflakes facing the camera
      vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      float size = 0.28 + aSeed.z * 0.26;
      worldPos += camRight * (position.x * size) + camUp * (position.y * size);
    }

    vUv = position.xy + 0.5;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
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
    float rainAlong = 1.0 - pow(abs(c.y), 2.2);
    float rainAlpha = max(0.0, rainAcross * rainAlong);

    // Snow: fluffy round snowflake
    float r = length(c);
    float snowAlpha = smoothstep(1.0, 0.2, r);

    float a = mix(snowAlpha, rainAlpha, uRain) * uAlpha * vFade;
    if (a < 0.015) discard;

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
  private camPos = new THREE.Vector3();
  private first = true;
  private baseColor: THREE.Color;

  constructor(kind: 'rain' | 'snow', count: number) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.instanceCount = count;
    const seed = new Float32Array(count * 4);
    let s = 17;
    for (let i = 0; i < seed.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      seed[i] = (s >>> 8) / 16777216;
    }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    this.geometry = g;
    const rain = kind === 'rain';
    this.baseColor = rain ? new THREE.Color(0.86, 0.93, 1.0) : new THREE.Color(0.98, 0.99, 1.0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: fxTime,
        uCamPos: { value: this.camPos },
        uCamVel: { value: this.camVel },
        uFall: { value: rain ? 52.0 : 8.5 },
        uBox: { value: new THREE.Vector3(120.0, 48.0, 120.0) },
        uColor: { value: this.baseColor.clone() },
        uAlpha: { value: rain ? 0.46 : 0.88 },
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
    (u.uCamPos.value as THREE.Vector3).copy(cam);
    if (this.first) {
      this.prevCam.copy(cam);
      this.first = false;
    }
    if (dt > 1e-4) {
      // Smoothed camera velocity for realistic aerodynamic streak tilting
      const k = Math.min(1, dt * 14);
      this.camVel.x += ((cam.x - this.prevCam.x) / dt - this.camVel.x) * k;
      this.camVel.y += ((cam.y - this.prevCam.y) / dt - this.camVel.y) * k;
      this.camVel.z += ((cam.z - this.prevCam.z) / dt - this.camVel.z) * k;
    }
    this.prevCam.copy(cam);
    (u.uCamVel.value as THREE.Vector3).copy(this.camVel);
    // Keep solid brightness floor so particles catch the light against overcast skies
    (u.uColor.value as THREE.Color).copy(this.baseColor).multiplyScalar(Math.max(0.65, light));
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
