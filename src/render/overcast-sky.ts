import * as THREE from 'three';
import { createShadowLight, type Sky } from './sky.ts';

export const OVERCAST = {
  sunDirection: [0.32, 0.78, -0.4],
  horizon: [0.4, 0.435, 0.47],
  zenith: [0.27, 0.3, 0.34],
  cloudContrast: 0.16,
  sunGlow: 0.1,
  sunColour: 0xdfe6ee,
  sunIntensity: 0.85,
  skyFillColour: 0xb9c6d4,
  groundFillColour: 0x4b4a47,
  skyFill: 1.25,
  fogDensity: 0.0042,
  environmentIntensity: 0.85,
  environmentSigma: 0.02,
  domeRadius: 1450,
  shadowHalfExtent: 70,
  shadowDistance: 220,
  exposure: 1.05,
  shelteredLight: 0.05,
  shelteredFog: [0.035, 0.032, 0.03],
  shelteredFogDensity: 0.0014,
  shelteredExposure: 1.0,
} as const;

const SKY_VERTEX = `varying vec3 vDirection;
void main(){
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = `uniform vec3 uSun; uniform float uTime; uniform vec3 uZenith; uniform vec3 uHorizon; uniform float uContrast; uniform float uGlow;
varying vec3 vDirection;
float cloudHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cloudNoise(vec2 p){
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cloudHash(cell), cloudHash(cell + vec2(1.0, 0.0)), f.x), mix(cloudHash(cell + vec2(0.0, 1.0)), cloudHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}
void main(){
  vec3 dir = normalize(vDirection);
  float rise = smoothstep(0.0, 0.55, dir.y);
  vec3 colour = mix(uHorizon, uZenith, rise);
  vec2 drift = dir.xz / max(dir.y + 0.4, 0.08) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
  float cloud = cloudNoise(drift) * 0.5 + cloudNoise(drift * 2.2 + 11.0) * 0.3 + cloudNoise(drift * 4.7 + 3.0) * 0.2;
  colour *= 1.0 + (cloud - 0.5) * 2.0 * uContrast * rise;
  float toSun = max(dot(dir, uSun), 0.0);
  colour += vec3(uGlow) * toSun * toSun * toSun * toSun;
  gl_FragColor = vec4(colour, 1.0);
}`;

export function createOvercastSky(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Sky {
  const uniforms = {
    uSun: { value: new THREE.Vector3(...OVERCAST.sunDirection).normalize() },
    uTime: { value: 0 },
    uZenith: { value: new THREE.Vector3(...OVERCAST.zenith) },
    uHorizon: { value: new THREE.Vector3(...OVERCAST.horizon) },
    uContrast: { value: OVERCAST.cloudContrast },
    uGlow: { value: OVERCAST.sunGlow },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false });
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const dome = new THREE.Mesh(geometry, material);
  dome.scale.setScalar(OVERCAST.domeRadius);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  scene.add(dome);

  const skyOnly = new THREE.Scene();
  const probe = new THREE.Mesh(geometry, material);
  probe.scale.setScalar(100);
  skyOnly.add(probe);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(skyOnly, OVERCAST.environmentSigma, 1, 400).texture;
  scene.environmentIntensity = OVERCAST.environmentIntensity;
  pmrem.dispose();
  scene.background = new THREE.Color(0x000000);
  const openFog = new THREE.Color().setRGB(...OVERCAST.horizon);
  const shelteredFog = new THREE.Color().setRGB(...OVERCAST.shelteredFog);
  const fog = new THREE.FogExp2(openFog.getHex(), OVERCAST.fogDensity);
  fog.color.copy(openFog);
  scene.fog = fog;

  const sun = createShadowLight(scene, { direction: OVERCAST.sunDirection, colour: OVERCAST.sunColour, intensity: OVERCAST.sunIntensity, halfExtent: OVERCAST.shadowHalfExtent, distance: OVERCAST.shadowDistance });
  const fill = new THREE.HemisphereLight(OVERCAST.skyFillColour, OVERCAST.groundFillColour, OVERCAST.skyFill);
  scene.add(fill);

  const sky = {
    dome,
    exposure: OVERCAST.exposure as number,
    follow: sun.follow,
    update(camera: THREE.Camera, seconds: number): void {
      dome.position.setFromMatrixPosition(camera.matrixWorld);
      uniforms.uTime.value = seconds;
    },
    setShadowMapSize: sun.setMapSize,
    setShelter(amount: number): void {
      const open = 1 - amount;
      const light = OVERCAST.shelteredLight + (1 - OVERCAST.shelteredLight) * open;
      sun.light.intensity = OVERCAST.sunIntensity * open;
      fill.intensity = OVERCAST.skyFill * light;
      scene.environmentIntensity = OVERCAST.environmentIntensity * light;
      fog.color.copy(shelteredFog).lerp(openFog, open);
      fog.density = OVERCAST.shelteredFogDensity + (OVERCAST.fogDensity - OVERCAST.shelteredFogDensity) * open;
      sky.exposure = OVERCAST.shelteredExposure + (OVERCAST.exposure - OVERCAST.shelteredExposure) * open;
    },
  };
  return sky;
}
