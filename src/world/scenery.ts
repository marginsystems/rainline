import * as THREE from 'three';
import { sampleAt, type Track, type TrackSample } from '../../sim/track.ts';
import { lightConeGeometry, lightConeMaterial } from './light-cone.ts';
import { surfaceUrl, tiledTexture } from './surfaces.ts';
import { bannerTexture, radialGlowTexture } from './textures.ts';
import { TRACK_LOOK } from './track-mesh.ts';

export const SCENERY = {
  lampSpacingMetres: 48,
  lampHeight: 9,
  lampArm: 3.4,
  lampColour: [2.0, 1.5, 0.9],
  startColour: [1.05, 1.05, 1.05],
  lampPoolMetres: 24,
  lampPoolStrength: 0.12,
  lampLightIntensity: 55,
  lampLightReach: 30,
  archSpacingMetres: 210,
  archHeight: 7.5,
  archColours: [[1.5, 1.45, 1.35], [1.8, 1.2, 0.6], [1.3, 1.4, 1.6], [1.8, 1.2, 0.6]],
  lampConeRadius: 5.4,
  lampConeStrength: 0.14,
  overlayHeight: 0.008,
  neonLightIntensity: 2.2,
  neonLightReach: 34,
  neonLightHeight: 2.2,
  neonLightBehindWall: 3,
  groundSize: 2600,
  groundTileMetres: 5,
  groundTint: 0x3f4a3a,
} as const;

export interface Scenery {
  readonly group: THREE.Group;
  readonly overlays: THREE.Object3D[];
  update(x: number, z: number, trackIndex: number): void;
}

interface BoxSpec {
  readonly sample: TrackSample;
  readonly lateral: number;
  readonly y: number;
  readonly scale: readonly [number, number, number];
  readonly colour?: readonly [number, number, number];
}

const yawOf = (sample: TrackSample): number => Math.atan2(sample.tx, sample.tz);

function boxes(specs: readonly BoxSpec[], material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, specs.length);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), colour = new THREE.Color();
  specs.forEach((spec, i) => {
    position.set(spec.sample.x + spec.sample.nx * spec.lateral, spec.y, spec.sample.z + spec.sample.nz * spec.lateral);
    rotation.setFromAxisAngle(up, yawOf(spec.sample));
    scale.set(...spec.scale);
    mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
    if (spec.colour) mesh.setColorAt(i, colour.setRGB(...spec.colour));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export function buildScenery(track: Track): Scenery {
  const group = new THREE.Group();
  const overlays: THREE.Object3D[] = [];
  const metal = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.45, metalness: 0.8 });
  const light = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const wall = track.wallOffset;

  const groundRepeat = SCENERY.groundSize / SCENERY.groundTileMetres;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SCENERY.groundSize, SCENERY.groundSize), new THREE.MeshStandardMaterial({ map: tiledTexture(surfaceUrl('grass', 'diff'), true, groundRepeat, groundRepeat), normalMap: tiledTexture(surfaceUrl('grass', 'nor_gl'), false, groundRepeat, groundRepeat), color: SCENERY.groundTint, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.04, 80);
  ground.receiveShadow = true;
  group.add(ground);

  const structure: BoxSpec[] = [], tubes: BoxSpec[] = [];
  const lampHeads: THREE.Vector3[] = [];
  const pools: BoxSpec[] = [];
  const lampLateral = track.halfWidth + track.kerbWidth + 1.4;
  const lampCount = Math.floor(track.length / SCENERY.lampSpacingMetres);
  for (let i = 0; i < lampCount; i++) {
    const sample = sampleAt(track, Math.round(((i + 0.5) * track.length) / lampCount / track.spacing));
    const side = i % 2 === 0 ? 1 : -1;
    const headLateral = side * (lampLateral - SCENERY.lampArm);
    structure.push({ sample, lateral: side * lampLateral, y: SCENERY.lampHeight / 2, scale: [0.2, SCENERY.lampHeight, 0.2] });
    structure.push({ sample, lateral: side * (lampLateral - SCENERY.lampArm / 2), y: SCENERY.lampHeight, scale: [SCENERY.lampArm + 0.2, 0.14, 0.2] });
    tubes.push({ sample, lateral: headLateral + side * 0.5, y: SCENERY.lampHeight - 0.12, scale: [1.3, 0.1, 0.34], colour: SCENERY.lampColour });
    pools.push({ sample, lateral: headLateral, y: SCENERY.overlayHeight, scale: [SCENERY.lampPoolMetres, 1, SCENERY.lampPoolMetres] });
    lampHeads.push(new THREE.Vector3(sample.x + sample.nx * headLateral, SCENERY.lampHeight - 0.6, sample.z + sample.nz * headLateral));
  }

  const archCount = Math.floor(track.length / SCENERY.archSpacingMetres);
  for (let i = 0; i < archCount; i++) {
    const sample = sampleAt(track, Math.round((i * track.length) / archCount / track.spacing));
    const colour = i === 0 ? SCENERY.startColour : (SCENERY.archColours[i % SCENERY.archColours.length] ?? SCENERY.archColours[0]);
    const h = SCENERY.archHeight;
    structure.push({ sample, lateral: 0, y: h, scale: [wall * 2 + 1.6, 0.55, 0.7] });
    for (const side of [-1, 1]) {
      structure.push({ sample, lateral: side * (wall + 0.55), y: h / 2, scale: [0.55, h, 0.7] });
      tubes.push({ sample, lateral: side * (wall + 0.2), y: h / 2 - 0.2, scale: [0.12, h - 1, 0.12], colour });
    }
    tubes.push({ sample, lateral: 0, y: h - 0.38, scale: [wall * 2, 0.12, 0.12], colour });
  }

  const frames = boxes(structure, metal);
  frames.castShadow = true;
  group.add(frames, boxes(tubes, light));

  const start = sampleAt(track, 0);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(wall * 2, 1.7), new THREE.MeshBasicMaterial({ map: bannerTexture('RAINLINE'), color: new THREE.Color().setRGB(1.1, 1.1, 1.1), side: THREE.DoubleSide }));
  banner.position.set(start.x - start.tx * 0.4, SCENERY.archHeight + 1.2, start.z - start.tz * 0.4);
  banner.rotation.y = yawOf(start) + Math.PI;
  group.add(banner);

  const poolGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolMesh = new THREE.InstancedMesh(poolGeometry, new THREE.MeshBasicMaterial({
    map: radialGlowTexture(), color: new THREE.Color().setRGB(SCENERY.lampColour[0] * SCENERY.lampPoolStrength, SCENERY.lampColour[1] * SCENERY.lampPoolStrength, SCENERY.lampColour[2] * SCENERY.lampPoolStrength),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }), pools.length);
  const matrix = new THREE.Matrix4();
  pools.forEach((pool, i) => {
    matrix.makeScale(pool.scale[0], 1, pool.scale[2]).setPosition(pool.sample.x + pool.sample.nx * pool.lateral, pool.y, pool.sample.z + pool.sample.nz * pool.lateral);
    poolMesh.setMatrixAt(i, matrix);
  });
  poolMesh.instanceMatrix.needsUpdate = true;
  group.add(poolMesh);
  overlays.push(poolMesh);

  const coneHeight = SCENERY.lampHeight - 0.5;
  const cones = new THREE.InstancedMesh(lightConeGeometry(SCENERY.lampConeRadius, coneHeight), lightConeMaterial(SCENERY.lampColour, SCENERY.lampConeStrength), lampHeads.length);
  lampHeads.forEach((head, i) => cones.setMatrixAt(i, matrix.makeTranslation(head.x, head.y + 0.4, head.z)));
  cones.instanceMatrix.needsUpdate = true;
  group.add(cones);
  overlays.push(cones);

  const lamp = new THREE.PointLight(new THREE.Color().setRGB(1, 0.76, 0.5), 0, SCENERY.lampLightReach, 2);
  const neonLeft = new THREE.PointLight(new THREE.Color().setRGB(...TRACK_LOOK.leftNeon), SCENERY.neonLightIntensity, SCENERY.neonLightReach, 1);
  const neonRight = new THREE.PointLight(new THREE.Color().setRGB(...TRACK_LOOK.rightNeon), SCENERY.neonLightIntensity, SCENERY.neonLightReach, 1);
  group.add(lamp, neonLeft, neonRight);

  function update(x: number, z: number, trackIndex: number): void {
    const beside = sampleAt(track, trackIndex);
    const out = wall + SCENERY.neonLightBehindWall;
    neonLeft.position.set(beside.x + beside.nx * out, SCENERY.neonLightHeight, beside.z + beside.nz * out);
    neonRight.position.set(beside.x - beside.nx * out, SCENERY.neonLightHeight, beside.z - beside.nz * out);
    let nearest: THREE.Vector3 | null = null, best = Number.POSITIVE_INFINITY;
    for (const head of lampHeads) {
      const d = (head.x - x) ** 2 + (head.z - z) ** 2;
      if (d < best) { best = d; nearest = head; }
    }
    if (!nearest) return;
    lamp.position.copy(nearest);
    const falloff = Math.max(0, 1 - Math.sqrt(best) / (SCENERY.lampLightReach * 0.8));
    lamp.intensity = SCENERY.lampLightIntensity * falloff * falloff;
  }

  return { group, overlays, update };
}
