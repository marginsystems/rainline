import * as THREE from 'three';

export interface Sky {
  readonly dome: THREE.Mesh;
  readonly exposure: number;
  follow(x: number, z: number): void;
  update(camera: THREE.Camera, seconds: number): void;
  setShadowMapSize(size: number): void;
  setShelter(amount: number): void;
}

export interface ShadowLightOptions {
  readonly direction: readonly [number, number, number];
  readonly colour: number;
  readonly intensity: number;
  readonly halfExtent: number;
  readonly distance: number;
}

export interface ShadowLight {
  readonly light: THREE.DirectionalLight;
  readonly direction: THREE.Vector3;
  follow(x: number, z: number): void;
  setMapSize(size: number): void;
}

export const SHADOW = {
  defaultMapSize: 2048,
  bias: -0.0004,
  normalBias: 0.05,
  near: 1,
} as const;

export function createShadowLight(scene: THREE.Scene, options: ShadowLightOptions): ShadowLight {
  const direction = new THREE.Vector3(...options.direction).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const light = new THREE.DirectionalLight(options.colour, options.intensity);
  light.castShadow = true;
  light.shadow.camera.left = -options.halfExtent;
  light.shadow.camera.right = options.halfExtent;
  light.shadow.camera.top = options.halfExtent;
  light.shadow.camera.bottom = -options.halfExtent;
  light.shadow.camera.near = SHADOW.near;
  light.shadow.camera.far = options.distance * 2;
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = SHADOW.bias;
  light.shadow.normalBias = SHADOW.normalBias;
  scene.add(light, light.target);

  let texel = (options.halfExtent * 2) / SHADOW.defaultMapSize;
  const focus = new THREE.Vector3();
  const snapped = new THREE.Vector3();

  return {
    light,
    direction,
    follow(x, z) {
      focus.set(x, 0, z);
      const across = Math.round(focus.dot(right) / texel) * texel;
      const along = Math.round(focus.dot(up) / texel) * texel;
      snapped.copy(right).multiplyScalar(across).addScaledVector(up, along).addScaledVector(direction, focus.dot(direction));
      light.target.position.copy(snapped);
      light.position.copy(snapped).addScaledVector(direction, options.distance);
    },
    setMapSize(size) {
      light.castShadow = size > 0;
      if (size <= 0 || light.shadow.mapSize.x === size) return;
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
      texel = (options.halfExtent * 2) / size;
    },
  };
}
