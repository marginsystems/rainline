import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { createShadowLight, type Sky } from './sky.ts';

export const NIGHT = {
  moonDirection: [0.35, 0.5, -0.8],
  moonDisc: [1.5, 1.6, 1.85],
  moonHalo: 0.2,
  moonColour: 0xc9d4ec,
  moonIntensity: 1.5,
  skyFillColour: 0x76839c,
  groundFillColour: 0x2b2926,
  skyFill: 0.3,
  zenith: [0.004, 0.006, 0.013],
  horizon: [0.035, 0.038, 0.052],
  cityGlow: [0.2, 0.125, 0.07],
  fogColour: 0x0f1218,
  fogDensity: 0.0021,
  environmentIntensity: 2.2,
  environmentUrl: 'hdr/city_night_1k.hdr',
  photoEnvironmentIntensity: 0.035,
  domeRadius: 1450,
  environmentSigma: 0.015,
  shadowHalfExtent: 70,
  shadowDistance: 220,
  exposure: 1.15,
} as const;

const SKY_VERTEX = `varying vec3 vDirection;
void main(){
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = `uniform vec3 uMoon; uniform float uTime; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uDisc; uniform float uHalo;
varying vec3 vDirection;
float skyHash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float skyHash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skyNoise(vec2 p){
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash2(cell), skyHash2(cell + vec2(1.0, 0.0)), f.x), mix(skyHash2(cell + vec2(0.0, 1.0)), skyHash2(cell + vec2(1.0, 1.0)), f.x), f.y);
}
void main(){
  vec3 dir = normalize(vDirection);
  float rise = clamp(dir.y, 0.0, 1.0);
  float low = max(1.0 - rise, 0.0);
  vec3 colour = mix(uZenith, uHorizon, pow(max(low, 0.0), 3.0));
  colour += uGlow * pow(max(low, 0.0), 12.0);
  vec2 drift = dir.xz / max(dir.y + 0.35, 0.05) * 1.6 + vec2(uTime * 0.004, 0.0);
  float cloud = smoothstep(0.5, 0.85, skyNoise(drift) * 0.6 + skyNoise(drift * 2.3 + 7.0) * 0.4) * smoothstep(-0.02, 0.25, dir.y);
  vec3 grid = dir * 220.0;
  vec3 cell = floor(grid);
  float seed = skyHash3(cell);
  float star = step(0.988, seed) * smoothstep(0.4, 0.0, length(fract(grid) - 0.5));
  float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + seed * 4.0) + seed * 60.0);
  colour += vec3(0.9, 0.95, 1.0) * star * twinkle * 4.0 * (1.0 - cloud) * smoothstep(0.03, 0.22, dir.y);
  float angle = acos(clamp(dot(dir, uMoon), -1.0, 1.0));
  float halo = exp(-angle * 9.0);
  colour += vec3(0.75, 0.82, 1.0) * halo * uHalo * (1.0 - cloud * 0.5);
  colour += vec3(0.1, 0.11, 0.16) * cloud * (0.5 + 1.5 * exp(-angle * 3.0));
  float disc = smoothstep(0.034, 0.03, angle);
  float craters = 0.8 + 0.2 * skyNoise(dir.xy * 70.0 + dir.z * 31.0);
  colour += uDisc * disc * craters * (1.0 - cloud * 0.7);
  gl_FragColor = vec4(colour, 1.0);
}`;

export function createNightSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Sky {
  const direction = new THREE.Vector3(...NIGHT.moonDirection).normalize();
  const uniforms = {
    uMoon: { value: direction.clone() },
    uTime: { value: 0 },
    uZenith: { value: new THREE.Vector3(...NIGHT.zenith) },
    uHorizon: { value: new THREE.Vector3(...NIGHT.horizon) },
    uGlow: { value: new THREE.Vector3(...NIGHT.cityGlow) },
    uDisc: { value: new THREE.Vector3(...NIGHT.moonDisc) },
    uHalo: { value: NIGHT.moonHalo },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false });
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const dome = new THREE.Mesh(geometry, material);
  dome.scale.setScalar(NIGHT.domeRadius);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const skyOnly = new THREE.Scene();
  const probe = new THREE.Mesh(geometry, material);
  probe.scale.setScalar(100);
  skyOnly.add(probe);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyOnly, NIGHT.environmentSigma, 1, 400).texture;
  scene.environmentIntensity = NIGHT.environmentIntensity;
  new HDRLoader().load(NIGHT.environmentUrl, (photo) => {
    photo.mapping = THREE.EquirectangularReflectionMapping;
    const previous = scene.environment;
    scene.environment = pmrem.fromEquirectangular(photo).texture;
    scene.environmentIntensity = NIGHT.photoEnvironmentIntensity;
    previous?.dispose();
    photo.dispose();
    pmrem.dispose();
  });
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(NIGHT.fogColour, NIGHT.fogDensity);

  const moon = createShadowLight(scene, { direction: NIGHT.moonDirection, colour: NIGHT.moonColour, intensity: NIGHT.moonIntensity, halfExtent: NIGHT.shadowHalfExtent, distance: NIGHT.shadowDistance });
  scene.add(new THREE.HemisphereLight(NIGHT.skyFillColour, NIGHT.groundFillColour, NIGHT.skyFill));

  return {
    dome,
    exposure: NIGHT.exposure,
    follow: moon.follow,
    update(camera, seconds) {
      dome.position.setFromMatrixPosition(camera.matrixWorld);
      uniforms.uTime.value = seconds;
    },
    setShadowMapSize: moon.setMapSize,
    setShelter() {
      return;
    },
  };
}
