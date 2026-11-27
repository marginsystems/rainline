import type * as THREE from 'three';

export interface LensShader {
  readonly uniforms: { [name: string]: THREE.IUniform };
  readonly vertexShader: string;
  readonly fragmentShader: string;
}

export const LENS_BLUR = 'uBlur';
export const LENS_ABERRATION = 'uAberration';
export const LENS_VIGNETTE = 'uVignette';
export const LENS_SATURATION = 'uSaturation';
export const LENS_GRAIN = 'uGrain';
export const LENS_TIME = 'uTime';
export const LENS_DROPS = 'uDrops';
export const LENS_DROP_SECONDS = 'uDropSeconds';
export const LENS_ASPECT = 'uAspect';
export const LENS_DROPLETS = {
  largeCells: 5,
  smallCells: 11,
  refraction: 0.05,
  rimDarkening: 0.16,
  highlight: 0.05,
  centreShare: 0.15,
  presentShare: 0.42,
} as const;
export const GRADE = {
  saturation: 0.82,
  grain: 0.07,
  grainSeedWrapSeconds: 97,
} as const;
export const HDR_CEILING = 16;
export const BLOOM_TEXEL_READ = 'vec4 texel = texture2D( tDiffuse, vUv );';
export const finiteChannel = (channel: string, ceiling: number): string => `( ${channel} >= 0.0 ? min( ${channel}, ${ceiling.toFixed(1)} ) : 0.0 )`;
export const finiteRgb = (name: string, ceiling: number = HDR_CEILING): string => `vec3( ${finiteChannel(`${name}.r`, ceiling)}, ${finiteChannel(`${name}.g`, ceiling)}, ${finiteChannel(`${name}.b`, ceiling)} )`;
export const BLOOM_FINITE_GUARD = `texel = vec4( ${finiteRgb('texel')}, ${finiteChannel('texel.a', 1)} );`;

export function guardedHighPass(fragmentShader: string): string {
  if (fragmentShader.includes(BLOOM_FINITE_GUARD)) return fragmentShader;
  if (!fragmentShader.includes(BLOOM_TEXEL_READ)) throw new Error('the bloom high pass no longer reads tDiffuse into texel');
  return fragmentShader.replace(BLOOM_TEXEL_READ, `${BLOOM_TEXEL_READ}\n${BLOOM_FINITE_GUARD}`);
}

export function createLensShader(): LensShader {
  return {
    uniforms: { tDiffuse: { value: null }, [LENS_BLUR]: { value: 0 }, [LENS_ABERRATION]: { value: 0.0015 }, [LENS_VIGNETTE]: { value: 0.5 }, [LENS_SATURATION]: { value: GRADE.saturation }, [LENS_GRAIN]: { value: GRADE.grain }, [LENS_TIME]: { value: 0 }, [LENS_DROPS]: { value: 0 }, [LENS_DROP_SECONDS]: { value: 0 }, [LENS_ASPECT]: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur; uniform float uAberration; uniform float uVignette; uniform float uSaturation; uniform float uGrain; uniform float uTime; uniform float uDrops; uniform float uDropSeconds; uniform float uAspect; varying vec2 vUv;
float dropHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 dropLayer(vec2 uv, float cells, float seed){
  vec2 grid = vec2(uv.x * uAspect, uv.y) * cells;
  vec2 cell = floor(grid);
  float age = uDropSeconds * (0.04 + 0.07 * dropHash(cell + seed)) + dropHash(cell * 1.7 + seed);
  float cycle = floor(age);
  float life = fract(age);
  float present = step(${(1 - LENS_DROPLETS.presentShare).toFixed(2)}, dropHash(cell * 3.3 + cycle + seed + 9.0));
  vec2 centre = 0.28 + 0.44 * vec2(dropHash(cell + cycle * 7.3 + seed), dropHash(cell * 2.1 + cycle * 3.1 + seed + 5.0));
  float radius = mix(0.05, 0.17, dropHash(cell + cycle + seed + 13.0));
  vec2 offset = (fract(grid) - centre) * vec2(1.0, 0.85) / radius;
  float fade = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.75, 1.0, life));
  return vec3(offset, (1.0 - smoothstep(0.7, 1.0, length(offset))) * present * fade);
}
vec3 lensTap(vec2 uv){
  vec3 tap = texture2D(tDiffuse, uv).rgb;
  return ${finiteRgb('tap')};
}
void main(){
  float reach = length(vUv - 0.5);
  vec3 largeDrop = dropLayer(vUv, ${LENS_DROPLETS.largeCells.toFixed(1)}, 0.0);
  vec3 smallDrop = dropLayer(vUv, ${LENS_DROPLETS.smallCells.toFixed(1)}, 31.0);
  vec3 drop = largeDrop.z > smallDrop.z ? largeDrop : smallDrop;
  float wet = drop.z * uDrops * mix(${LENS_DROPLETS.centreShare.toFixed(2)}, 1.0, smoothstep(0.12, 0.6, reach));
  vec2 fromCentre = vUv - drop.xy * wet * ${LENS_DROPLETS.refraction.toFixed(3)} - 0.5;
  vec3 colour = vec3(0.0);
  float total = 0.0;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  for (int i = 0; i < 8; i++) {
    float t = (float(i) + jitter) / 8.0;
    float weight = 1.0 - t * 0.5;
    colour += lensTap(0.5 + fromCentre * (1.0 - uBlur * (1.0 - wet) * t * reach)) * weight;
    total += weight;
  }
  colour /= total;
  vec2 shift = fromCentre * reach * uAberration;
  colour.r = mix(colour.r, lensTap(0.5 + fromCentre + shift).r, 0.5);
  colour.b = mix(colour.b, lensTap(0.5 + fromCentre - shift).b, 0.5);
  colour *= 1.0 - ${LENS_DROPLETS.rimDarkening.toFixed(2)} * wet * smoothstep(0.45, 1.0, length(drop.xy));
  colour += ${LENS_DROPLETS.highlight.toFixed(2)} * wet * (1.0 - smoothstep(0.0, 0.35, length(drop.xy - vec2(-0.3, 0.35))));
  colour *= mix(1.0, 1.0 - smoothstep(0.3, 0.95, reach), uVignette);
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  colour = max(mix(vec3(luma), colour, uSaturation), 0.0);
  float grain = fract(sin(dot(gl_FragCoord.xy + uTime * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  colour *= 1.0 + grain * uGrain;
  gl_FragColor = vec4(colour, 1.0);
}`,
  };
}
