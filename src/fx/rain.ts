import * as THREE from 'three';

export const RAIN = {
  drops: 9000,
  box: [70, 34, 70],
  fall: [-3.5, -26, 1.5],
  streakSeconds: 0.03,
  opacity: 0.34,
} as const;

export interface Rain {
  readonly object: THREE.LineSegments;
  update(camera: THREE.Camera, seconds: number, strength: number): void;
}

export function createRain(colour: readonly [number, number, number]): Rain {
  const positions = new Float32Array(RAIN.drops * 6);
  const ends = new Float32Array(RAIN.drops * 2);
  const seeds = new Float32Array(RAIN.drops * 2);
  for (let i = 0; i < RAIN.drops; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random(), seed = Math.random();
    positions.set([x, y, z, x, y, z], i * 6);
    ends.set([0, 1], i * 2);
    seeds.set([seed, seed], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uTime: { value: 0 },
    uCamera: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(...RAIN.box) },
    uFall: { value: new THREE.Vector3(...RAIN.fall) },
    uStreak: { value: RAIN.streakSeconds },
    uOpacity: { value: RAIN.opacity as number },
    uColour: { value: new THREE.Color().setRGB(...colour) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float aEnd; attribute float aSeed;
uniform float uTime; uniform vec3 uCamera; uniform vec3 uBox; uniform vec3 uFall; uniform float uStreak;
varying float vAlpha;
void main(){
  vec3 fall = uFall * (0.8 + 0.4 * aSeed);
  vec3 drop = position * uBox + fall * uTime;
  vec3 world = uCamera + mod(drop - uCamera + uBox * 0.5, uBox) - uBox * 0.5;
  world -= fall * uStreak * aEnd;
  float reach = length(world.xz - uCamera.xz);
  vAlpha = (1.0 - aEnd * 0.8) * smoothstep(uBox.x * 0.5, uBox.x * 0.3, reach);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uColour; varying float vAlpha;
void main(){ gl_FragColor = vec4(uColour, vAlpha * uOpacity); }`,
  });
  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  return {
    object,
    update(camera, seconds, strength) {
      uniforms.uTime.value = seconds;
      uniforms.uCamera.value.setFromMatrixPosition(camera.matrixWorld);
      uniforms.uOpacity.value = RAIN.opacity * strength;
      object.visible = strength > 0.01;
    },
  };
}
