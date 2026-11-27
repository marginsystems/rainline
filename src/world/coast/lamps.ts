import * as THREE from 'three';
import { sampleAt, type Track } from '../../../sim/track.ts';
import { UNREFLECTED_LAYER } from '../../render/reflection.ts';
import { lightConeGeometry, lightConeMaterial } from '../light-cone.ts';
import { radialGlowTexture } from '../textures.ts';
import { beside, boxes, type BoxPlacement } from './ribbon.ts';

export const STREET_LAMP = {
  height: 9.5,
  postMetres: 0.18,
  armMetres: 3.6,
  headSize: [1.2, 0.12, 0.36],
  colour: [3.4, 2.1, 0.8],
  postColour: 0x3a3d40,
  poolMetres: 26,
  poolStrength: 0.085,
  poolHeight: 0.008,
  coneRadius: 5,
  coneStrength: 0.1,
} as const;

export interface LampSpot {
  readonly index: number;
  readonly lateral: number;
  readonly base: number;
}

export interface StreetLamps {
  readonly group: THREE.Group;
  readonly overlays: THREE.Object3D[];
}

export function buildStreetLamps(track: Track, spots: readonly LampSpot[]): StreetLamps {
  const group = new THREE.Group();
  const posts: BoxPlacement[] = [], heads: BoxPlacement[] = [];
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: radialGlowTexture(), color: new THREE.Color().setRGB(STREET_LAMP.colour[0] * STREET_LAMP.poolStrength, STREET_LAMP.colour[1] * STREET_LAMP.poolStrength, STREET_LAMP.colour[2] * STREET_LAMP.poolStrength),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }), spots.length);
  const cones = new THREE.InstancedMesh(lightConeGeometry(STREET_LAMP.coneRadius, STREET_LAMP.height), lightConeMaterial(STREET_LAMP.colour, STREET_LAMP.coneStrength), spots.length);
  const matrix = new THREE.Matrix4();
  spots.forEach((spot, i) => {
    const sample = sampleAt(track, spot.index);
    const inward = -Math.sign(spot.lateral);
    const headAt = spot.lateral + inward * STREET_LAMP.armMetres;
    const tall = STREET_LAMP.height - spot.base;
    posts.push(beside(sample, spot.lateral, spot.base + tall / 2, [STREET_LAMP.postMetres, tall, STREET_LAMP.postMetres]));
    posts.push(beside(sample, spot.lateral + (inward * STREET_LAMP.armMetres) / 2, STREET_LAMP.height, [STREET_LAMP.armMetres + STREET_LAMP.postMetres, 0.12, STREET_LAMP.postMetres]));
    heads.push(beside(sample, headAt, STREET_LAMP.height - 0.12, STREET_LAMP.headSize));
    const x = sample.x + sample.nx * headAt, z = sample.z + sample.nz * headAt;
    pools.setMatrixAt(i, matrix.makeScale(STREET_LAMP.poolMetres, 1, STREET_LAMP.poolMetres).setPosition(x, STREET_LAMP.poolHeight, z));
    cones.setMatrixAt(i, matrix.makeTranslation(x, STREET_LAMP.height - 0.2, z));
  });
  for (const overlay of [pools, cones]) {
    overlay.instanceMatrix.needsUpdate = true;
    overlay.frustumCulled = false;
    overlay.layers.set(UNREFLECTED_LAYER);
  }
  const frames = boxes(posts, new THREE.MeshStandardMaterial({ color: STREET_LAMP.postColour, metalness: 0.6, roughness: 0.55 }));
  frames.castShadow = true;
  const lit = boxes(heads, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...STREET_LAMP.colour) }));
  group.add(frames, lit, pools, cones);
  return { group, overlays: [pools, cones] };
}
