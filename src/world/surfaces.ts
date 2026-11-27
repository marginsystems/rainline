import * as THREE from 'three';

export const SURFACES = {
  anisotropy: 16,
  directory: 'textures',
} as const;

export type SurfaceName = 'asphalt' | 'concrete' | 'gravel' | 'grass' | 'bark' | 'tiles' | 'rock';

export interface SurfaceMaps {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
  readonly roughnessMap: THREE.Texture;
}

export const surfaceUrl = (name: SurfaceName, kind: 'diff' | 'nor_gl' | 'rough'): string => `${SURFACES.directory}/${name}_${kind}.jpg`;

const loader = new THREE.TextureLoader();

export function tiledTexture(url: string, colour: boolean, repeatU: number, repeatV: number): THREE.Texture {
  const texture = loader.load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatU, repeatV);
  texture.anisotropy = SURFACES.anisotropy;
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function surfaceMaps(name: SurfaceName, repeatU: number = 1, repeatV: number = repeatU): SurfaceMaps {
  return {
    map: tiledTexture(surfaceUrl(name, 'diff'), true, repeatU, repeatV),
    normalMap: tiledTexture(surfaceUrl(name, 'nor_gl'), false, repeatU, repeatV),
    roughnessMap: tiledTexture(surfaceUrl(name, 'rough'), false, repeatU, repeatV),
  };
}
