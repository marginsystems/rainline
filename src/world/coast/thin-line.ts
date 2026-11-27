import * as THREE from 'three';

export const THIN_LINE = {
  minPixels: 1.25,
} as const;

export interface LineSegment {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly width: number;
}

const LINE_VERTEX = `#include <common>
#include <fog_pars_vertex>
attribute vec3 aOther; attribute float aSide; attribute float aWidth;
uniform vec2 uViewport; uniform float uMinPixels;
varying float vCover;
void main(){
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec4 here = projectionMatrix * mvPosition;
  vec4 there = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);
  vec2 along = (there.xy / max(there.w, 0.0001) - here.xy / max(here.w, 0.0001)) * uViewport;
  vec2 across = vec2(-along.y, along.x) / max(length(along), 0.0001);
  float pixels = aWidth * projectionMatrix[1][1] * uViewport.y * 0.5 / max(here.w, 0.0001);
  float shown = max(pixels, uMinPixels);
  vCover = pixels / shown;
  here.xy += across * aSide * shown / uViewport * here.w;
  gl_Position = min(here.w, there.w) > 0.0 ? here : vec4(0.0, 0.0, 2.0, 1.0);
  #include <fog_vertex>
}`;

const LINE_FRAGMENT = `#include <common>
#include <fog_pars_fragment>
uniform vec3 uColour;
varying float vCover;
void main(){
  gl_FragColor = vec4(uColour, clamp(vCover, 0.0, 1.0));
  #include <fog_fragment>
}`;

export interface ThinLines {
  readonly mesh: THREE.Mesh;
  setViewport(width: number, height: number): void;
}

export function thinLines(segments: readonly LineSegment[], colour: readonly [number, number, number]): ThinLines {
  const positions: number[] = [], others: number[] = [], sides: number[] = [], widths: number[] = [], indices: number[] = [];
  segments.forEach((segment, i) => {
    positions.push(...segment.from, ...segment.from, ...segment.to, ...segment.to);
    others.push(...segment.to, ...segment.to, ...segment.from, ...segment.from);
    sides.push(1, -1, -1, 1);
    widths.push(segment.width, segment.width, segment.width, segment.width);
    const first = i * 4;
    indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aOther', new THREE.Float32BufferAttribute(others, 3));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('aWidth', new THREE.Float32BufferAttribute(widths, 1));
  geometry.setIndex(indices);
  const viewport = new THREE.Vector2(1920, 1080);
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uViewport: { value: viewport }, uMinPixels: { value: THIN_LINE.minPixels }, uColour: { value: new THREE.Vector3(...colour) } }]),
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    setViewport(width, height) {
      const uniform = material.uniforms['uViewport'];
      if (uniform) uniform.value = viewport.set(width, height);
    },
  };
}
