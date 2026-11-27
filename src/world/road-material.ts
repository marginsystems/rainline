import * as THREE from 'three';
import { finiteRgb } from '../render/lens-pass.ts';
import type { PlanarReflection } from '../render/reflection.ts';
import { surfaceMaps } from './surfaces.ts';

export const ROAD = {
  tileMetres: 6,
  tint: 0x6c717c,
  environmentIntensity: 0.5,
} as const;

const ROAD_PARS = `uniform sampler2D tReflection;
uniform float uWetness;
uniform float uMirror;
uniform float uMirrorGain;
varying vec4 vReflectionCoord;
varying vec3 vRoadWorld;
float roadHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float roadNoise(vec2 p){
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(roadHash(cell), roadHash(cell + vec2(1.0, 0.0)), f.x), mix(roadHash(cell + vec2(0.0, 1.0)), roadHash(cell + vec2(1.0, 1.0)), f.x), f.y);
}
float roadPuddle(vec2 p){
  float n = roadNoise(p * 0.09) * 0.6 + roadNoise(p * 0.23 + 17.0) * 0.3 + roadNoise(p * 0.61) * 0.1;
  return smoothstep(0.5, 0.64, n);
}`;

const ROAD_REFLECTION = `vec3 roadView = normalize(cameraPosition - vRoadWorld);
float roadFresnel = 0.03 + 0.97 * pow(max(1.0 - clamp(roadView.y, 0.0, 1.0), 0.0), 5.0);
vec2 roadRipple = (texture2D(normalMap, vNormalMapUv).xy * 2.0 - 1.0) * mix(0.03, 0.004, puddle);
vec4 roadCoord = vReflectionCoord;
roadCoord.xy += roadRipple * roadCoord.w;
vec3 roadSample = textureLod(tReflection, roadCoord.xy / max(roadCoord.w, 0.0001), mix(3.5, 0.0, puddle)).rgb;
vec3 roadMirror = ${finiteRgb('roadSample')};
outgoingLight += roadMirror * roadFresnel * mix(0.45, 1.0, puddle) * uWetness * uMirror * uMirrorGain;`;

export interface RoadSurface {
  readonly material: THREE.MeshStandardMaterial;
  readonly wetness: THREE.IUniform<number>;
}

export function createRoadSurface(reflection: PlanarReflection, mirrorGain: number = 1): RoadSurface {
  const wetness: THREE.IUniform<number> = { value: 1 };
  const material = new THREE.MeshStandardMaterial({
    ...surfaceMaps('asphalt'),
    color: ROAD.tint,
    roughness: 1,
    metalness: 0,
    envMapIntensity: ROAD.environmentIntensity,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms['tReflection'] = { value: reflection.target.texture };
    shader.uniforms['uReflectionMatrix'] = { value: reflection.textureMatrix };
    shader.uniforms['uWetness'] = wetness;
    shader.uniforms['uMirror'] = reflection.strength;
    shader.uniforms['uMirrorGain'] = { value: mirrorGain };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflectionMatrix;\nvarying vec4 vReflectionCoord;\nvarying vec3 vRoadWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 roadWorld = modelMatrix * vec4(transformed, 1.0);\nvRoadWorld = roadWorld.xyz;\nvReflectionCoord = uReflectionMatrix * roadWorld;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROAD_PARS}`)
      .replace('#include <map_fragment>', 'float puddle = roadPuddle(vRoadWorld.xz) * uWetness;\n#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0 - 0.25 * uWetness, 0.45, puddle);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, roughnessFactor * 0.6, uWetness), 0.16, puddle);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, puddle * 0.9));')
      .replace('#include <opaque_fragment>', `${ROAD_REFLECTION}\n#include <opaque_fragment>`);
  };
  return { material, wetness };
}
