import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { locate, sampleAt, type Track } from '../../sim/track.ts';
import { UNREFLECTED_LAYER } from '../render/reflection.ts';
import { between, seededRandom, type Random } from './random.ts';
import { surfaceUrl, tiledTexture } from './surfaces.ts';
import { leafClusterTexture, pineFrondTexture } from './textures.ts';

export const TREES = {
  count: 820,
  bandMetres: 85,
  clearance: 3.5,
  sinkMetres: -0.1,
  maxLean: 0.07,
  tintSpread: 0.3,
  trunkSegments: 7,
  trunkShade: 0.62,
  barkRepeat: [2, 5],
  frondRoll: 0.5,
  frondWidthShare: 0.72,
  frondInnerShade: 0.42,
  frondUpNormal: 0.8,
  lowDroop: 0.4,
  topRise: 0.3,
  tuftCards: 3,
  tuftShare: 0.17,
  leafCardsPerCluster: 11,
  leafInnerShade: 0.5,
  leafNormalFloor: 0.2,
  foliageAlphaTest: 0.38,
  foliageRoughness: 0.88,
  foliageTint: 0xdfe8d6,
} as const;

interface PineShape {
  readonly height: number;
  readonly radius: number;
  readonly bare: number;
  readonly levels: number;
  readonly whorl: number;
}

export const PINES: readonly PineShape[] = [
  { height: 15, radius: 3, bare: 1.6, levels: 13, whorl: 7 },
  { height: 10, radius: 3.4, bare: 1, levels: 9, whorl: 7 },
  { height: 5.5, radius: 2, bare: 0.5, levels: 6, whorl: 6 },
  { height: 13, radius: 2.6, bare: 6.5, levels: 7, whorl: 6 },
  { height: 12, radius: 2.3, bare: 2.2, levels: 11, whorl: 6 },
];

export const BROADLEAF_KINDS = 2;

export type FoliageKind = 'needle' | 'leaf';

export interface TreeKind {
  readonly foliageKind: FoliageKind;
  readonly trunk: THREE.BufferGeometry;
  readonly foliage: THREE.BufferGeometry;
}

class Cards {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colours: number[] = [];
  private readonly indices: number[] = [];

  add(origin: THREE.Vector3, along: THREE.Vector3, side: THREE.Vector3, normal: THREE.Vector3, innerShade: number, outerShade: number): void {
    const first = this.positions.length / 3;
    const corners: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [-1, 1], [1, 1]];
    for (const [u, v] of corners) {
      this.positions.push(origin.x + side.x * u + along.x * v, origin.y + side.y * u + along.y * v, origin.z + side.z * u + along.z * v);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push((u + 1) / 2, v);
      const shade = v === 0 ? innerShade : outerShade;
      this.colours.push(shade, shade, shade);
    }
    this.indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

function shaded(geometry: THREE.BufferGeometry, shade: number): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(shade), 3));
  return geometry;
}

function limb(from: THREE.Vector3, to: THREE.Vector3, radiusFrom: number, radiusTo: number): THREE.BufferGeometry {
  const span = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radiusTo, radiusFrom, span.length(), TREES.trunkSegments, 1, true);
  geometry.translate(0, span.length() / 2, 0);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize()));
  geometry.translate(from.x, from.y, from.z);
  return shaded(geometry, TREES.trunkShade);
}

function pine(random: Random, shape: PineShape): TreeKind {
  const trunk = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, shape.height * 0.96, 0), shape.height * 0.022 + 0.06, 0.03);
  const cards = new Cards();
  const crown = shape.height - shape.bare;
  const origin = new THREE.Vector3(), along = new THREE.Vector3(), side = new THREE.Vector3(), lift = new THREE.Vector3(), blade = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let level = 0; level < shape.levels; level++) {
    const t = level / Math.max(1, shape.levels - 1);
    const y = shape.bare + crown * t * (1 - TREES.tuftShare);
    const count = Math.max(3, Math.round(shape.whorl * (1 - 0.4 * t)));
    const phase = random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = phase + ((i + between(random, -0.25, 0.25)) / count) * Math.PI * 2;
      const reach = shape.radius * (1 - 0.8 * t) * between(random, 0.8, 1.15);
      const droop = TREES.lowDroop + (-TREES.topRise - TREES.lowDroop) * t + between(random, -0.1, 0.1);
      along.set(Math.cos(angle) * Math.cos(droop), -Math.sin(droop), Math.sin(angle) * Math.cos(droop));
      side.set(-Math.sin(angle), 0, Math.cos(angle));
      lift.crossVectors(side, along).normalize();
      if (lift.y < 0) lift.negate();
      normal.copy(along).multiplyScalar(0.6).add(new THREE.Vector3(0, TREES.frondUpNormal, 0)).normalize();
      origin.set(0, y + between(random, -0.15, 0.15), 0);
      const shade = between(random, 0.78, 1.08);
      for (const roll of [TREES.frondRoll, -TREES.frondRoll]) {
        blade.copy(side).multiplyScalar(Math.cos(roll)).addScaledVector(lift, Math.sin(roll)).multiplyScalar(reach * TREES.frondWidthShare * 0.5);
        cards.add(origin, along.clone().multiplyScalar(reach), blade, normal, shade * TREES.frondInnerShade, shade);
      }
    }
  }
  const tuft = crown * TREES.tuftShare * 1.6;
  for (let i = 0; i < TREES.tuftCards; i++) {
    const angle = (i / TREES.tuftCards) * Math.PI + random();
    side.set(Math.cos(angle), 0, Math.sin(angle));
    normal.set(-side.z * 0.5, TREES.frondUpNormal, side.x * 0.5).normalize();
    cards.add(origin.set(0, shape.height - tuft, 0), along.set(0, tuft, 0), side.clone().multiplyScalar(tuft * 0.3), normal, TREES.frondInnerShade, 1);
  }
  return { foliageKind: 'needle', trunk, foliage: cards.build() };
}

function broadleaf(random: Random): TreeKind {
  const height = between(random, 3.4, 5.2);
  const top = new THREE.Vector3(between(random, -0.2, 0.2), height, between(random, -0.2, 0.2));
  const wood = [limb(new THREE.Vector3(0, 0, 0), top, between(random, 0.24, 0.36), 0.16)];
  const cards = new Cards();
  const clusters = 5 + Math.floor(random() * 3);
  const centre = new THREE.Vector3(), out = new THREE.Vector3(), along = new THREE.Vector3(), side = new THREE.Vector3(), normal = new THREE.Vector3(), origin = new THREE.Vector3();
  const crownCentre = new THREE.Vector3(0, height + 2, 0);
  for (let c = 0; c < clusters; c++) {
    const angle = (c / clusters) * Math.PI * 2 + random();
    const spread = c === 0 ? 0 : between(random, 1.2, 2.3);
    centre.set(Math.cos(angle) * spread, height + between(random, 1, 3.4), Math.sin(angle) * spread);
    wood.push(limb(top, centre, 0.13, 0.04));
    const size = between(random, 1.5, 2.2);
    for (let i = 0; i < TREES.leafCardsPerCluster; i++) {
      out.set(between(random, -1, 1), between(random, -0.7, 1), between(random, -1, 1)).normalize();
      along.set(between(random, -1, 1), between(random, -1, 1), between(random, -1, 1));
      side.crossVectors(out, along).normalize();
      along.crossVectors(side, out).normalize();
      const reach = size * between(random, 0.75, 1.15);
      origin.copy(centre).addScaledVector(out, size * 0.55).addScaledVector(along, -reach / 2);
      normal.copy(origin).addScaledVector(along, reach / 2).sub(crownCentre).normalize();
      normal.y = Math.max(normal.y, TREES.leafNormalFloor);
      normal.normalize();
      const shade = between(random, 0.75, 1.1) * (out.y < -0.2 ? TREES.leafInnerShade + 0.2 : 1);
      cards.add(origin, along.clone().multiplyScalar(reach), side.clone().multiplyScalar(reach / 2), normal, shade, shade);
    }
  }
  return { foliageKind: 'leaf', trunk: mergeGeometries(wood), foliage: cards.build() };
}

export function treeKinds(seed: number): TreeKind[] {
  const random = seededRandom(seed);
  const kinds = PINES.map((shape) => pine(random, shape));
  for (let i = 0; i < BROADLEAF_KINDS; i++) kinds.push(broadleaf(random));
  return kinds;
}

export interface Forest {
  readonly group: THREE.Group;
  readonly foliage: THREE.Object3D[];
}

export interface TreeSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
}

export function circuitTreeSpots(track: Track): TreeSpot[] {
  const random = seededRandom(7);
  const spots: TreeSpot[] = [];
  const clearance = track.wallOffset + TREES.clearance;
  for (let attempt = 0; attempt < TREES.count * 6 && spots.length < TREES.count; attempt++) {
    const sample = sampleAt(track, Math.floor(random() * track.samples.length));
    const lateral = (random() < 0.5 ? -1 : 1) * between(random, clearance, clearance + TREES.bandMetres * random());
    const x = sample.x + sample.nx * lateral, z = sample.z + sample.nz * lateral;
    if (Math.abs(locate(track, x, z, null).lateral) < clearance) continue;
    spots.push({ x, y: TREES.sinkMetres, z, size: between(random, 0.7, 1.45) });
  }
  return spots;
}

export function forestOf(spots: readonly TreeSpot[], seed: number): Forest {
  const random = seededRandom(seed);
  const group = new THREE.Group();
  const foliage: THREE.Object3D[] = [];
  const kinds = treeKinds(19);
  const bark = new THREE.MeshStandardMaterial({
    map: tiledTexture(surfaceUrl('bark', 'diff'), true, TREES.barkRepeat[0], TREES.barkRepeat[1]),
    normalMap: tiledTexture(surfaceUrl('bark', 'nor_gl'), false, TREES.barkRepeat[0], TREES.barkRepeat[1]),
    vertexColors: true,
    roughness: 1,
  });
  const leaves = (map: THREE.Texture): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
    map, color: TREES.foliageTint, vertexColors: true, roughness: TREES.foliageRoughness, side: THREE.DoubleSide, alphaTest: TREES.foliageAlphaTest, alphaToCoverage: true,
  });
  const materials: Record<FoliageKind, THREE.MeshStandardMaterial> = { needle: leaves(pineFrondTexture()), leaf: leaves(leafClusterTexture()) };
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), lean = new THREE.Euler(), tint = new THREE.Color();
  kinds.forEach((kind, kindIndex) => {
    const mine = spots.filter((_spot, i) => i % kinds.length === kindIndex);
    const trunks = new THREE.InstancedMesh(kind.trunk, bark, mine.length);
    const crowns = new THREE.InstancedMesh(kind.foliage, materials[kind.foliageKind], mine.length);
    mine.forEach((spot, i) => {
      rotation.setFromEuler(lean.set(between(random, -TREES.maxLean, TREES.maxLean), random() * Math.PI * 2, between(random, -TREES.maxLean, TREES.maxLean)));
      matrix.compose(position.set(spot.x, spot.y, spot.z), rotation, scale.set(spot.size * between(random, 0.85, 1.2), spot.size * between(random, 0.85, 1.3), spot.size * between(random, 0.85, 1.2)));
      trunks.setMatrixAt(i, matrix);
      crowns.setMatrixAt(i, matrix);
      const shade = 1 - TREES.tintSpread / 2 + TREES.tintSpread * random();
      crowns.setColorAt(i, tint.setRGB(shade * between(random, 0.9, 1.1), shade, shade * between(random, 0.85, 1.1)));
    });
    for (const mesh of [trunks, crowns]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    crowns.layers.set(UNREFLECTED_LAYER);
    foliage.push(crowns);
  });
  return { group, foliage };
}

export const plantTrees = (track: Track): Forest => forestOf(circuitTreeSpots(track), 7);
