import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleAt, type Track } from '../../../sim/track.ts';
import { UNREFLECTED_LAYER } from '../../render/reflection.ts';
import { between, seededRandom } from '../random.ts';
import { surfaceMaps, surfaceUrl, tiledTexture } from '../surfaces.ts';
import { forestOf, type Forest, type TreeSpot } from '../trees.ts';
import { COAST, hillHeight, shoreHeight, stations, type Span } from './plan.ts';
import { beside, boxes, ribbon, type BoxPlacement, type Edge } from './ribbon.ts';
import type { LineSegment } from './thin-line.ts';

export const LAND = {
  groundTileMetres: 5,
  rockTileMetres: 7,
  hillTint: 0x59624f,
  rockTint: 0x6f716d,
  vergeTint: 0x74767a,
  seaColour: 0x232d34,
  seaRoughness: 0.32,
  seaSize: 7000,
  treeEveryMetres: 2.6,
  treeNearest: 4.5,
  treeBandMetres: 150,
  treeSize: [0.85, 1.6],
  treeSink: 0.4,
  poleEveryMetres: 46,
  poleBeyondWall: 2.1,
  poleHeight: 10.4,
  poleRadius: [0.12, 0.17],
  poleColour: 0x4a4038,
  crossarmAt: 9.6,
  crossarmSize: [2.3, 0.12, 0.12],
  wireOffsets: [-1, 0, 1],
  lowWireAt: 7.8,
  wireSag: 0.85,
  wirePieces: 6,
  wireMetres: 0.035,
  wireColour: [0.035, 0.037, 0.04],
} as const;

export interface CoastLand {
  readonly group: THREE.Group;
  readonly forest: Forest;
  readonly wires: LineSegment[];
}

const profile = (wall: number, side: number, points: readonly (readonly [number, number])[], tileMetres: number): Edge[] => {
  let travelled = 0;
  return points.map((point, i) => {
    const before = points[i - 1];
    if (before) travelled += Math.hypot(point[0] - before[0], point[1] - before[1]);
    return { lateral: side * (wall + point[0]), y: point[1], u: travelled / tileMetres };
  });
};

export function buildCoastLand(track: Track, coast: Span): CoastLand {
  const group = new THREE.Group();
  const wall = track.wallOffset;
  const random = seededRandom(53);

  const verge = new THREE.Mesh(
    mergeGeometries([1, -1].map((side) => ribbon(track, coast, 4, [{ lateral: side * (wall - 0.1), y: -0.01, u: 0 }, { lateral: side * (wall + 1.7), y: -0.01, u: 0.6 }], 1 / 3))),
    new THREE.MeshStandardMaterial({ ...surfaceMaps('gravel'), color: LAND.vergeTint, roughness: 1, side: THREE.DoubleSide }),
  );
  verge.receiveShadow = true;
  verge.layers.set(UNREFLECTED_LAYER);

  const hill = new THREE.Mesh(
    ribbon(track, coast, 8, profile(wall, 1, COAST.hill, LAND.groundTileMetres), 1 / LAND.groundTileMetres),
    new THREE.MeshStandardMaterial({ map: tiledTexture(surfaceUrl('grass', 'diff'), true, 1, 1), normalMap: tiledTexture(surfaceUrl('grass', 'nor_gl'), false, 1, 1), color: LAND.hillTint, roughness: 1, side: THREE.DoubleSide }),
  );
  hill.receiveShadow = true;

  const shore = new THREE.Mesh(
    ribbon(track, coast, 8, profile(wall, -1, COAST.shore, LAND.rockTileMetres), 1 / LAND.rockTileMetres),
    new THREE.MeshStandardMaterial({ ...surfaceMaps('rock'), color: LAND.rockTint, roughness: 1, side: THREE.DoubleSide }),
  );
  shore.layers.set(UNREFLECTED_LAYER);

  const sea = new THREE.Mesh(new THREE.PlaneGeometry(LAND.seaSize, LAND.seaSize).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: LAND.seaColour, roughness: LAND.seaRoughness }));
  sea.position.y = COAST.seaLevel;
  sea.layers.set(UNREFLECTED_LAYER);
  group.add(verge, hill, shore, sea);

  const spots: TreeSpot[] = [];
  for (const index of stations(track, coast, LAND.treeEveryMetres, 0)) {
    const sample = sampleAt(track, index);
    const outside = LAND.treeNearest + LAND.treeBandMetres * random() * random();
    const lateral = wall + outside;
    spots.push({ x: sample.x + sample.nx * lateral, y: hillHeight(outside) - LAND.treeSink, z: sample.z + sample.nz * lateral, size: between(random, LAND.treeSize[0], LAND.treeSize[1]) });
  }
  const forest = forestOf(spots, 71);
  group.add(forest.group);

  const wood = new THREE.MeshStandardMaterial({ map: tiledTexture(surfaceUrl('bark', 'diff'), true, 1, 4), normalMap: tiledTexture(surfaceUrl('bark', 'nor_gl'), false, 1, 4), color: LAND.poleColour, roughness: 1 });
  const poleAt = stations(track, coast, LAND.poleEveryMetres, 20);
  const base = shoreHeight(LAND.poleBeyondWall) - 0.5;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(LAND.poleRadius[0], LAND.poleRadius[1], LAND.poleHeight - base, 8), wood, poleAt.length);
  const arms: BoxPlacement[] = [];
  const tops: { x: number; z: number; nx: number; nz: number }[] = [];
  const matrix = new THREE.Matrix4();
  poleAt.forEach((index, i) => {
    const sample = sampleAt(track, index);
    const lateral = -(wall + LAND.poleBeyondWall);
    const x = sample.x + sample.nx * lateral, z = sample.z + sample.nz * lateral;
    poles.setMatrixAt(i, matrix.makeTranslation(x, (LAND.poleHeight + base) / 2, z));
    arms.push(beside(sample, lateral, LAND.crossarmAt, LAND.crossarmSize));
    tops.push({ x, z, nx: sample.nx, nz: sample.nz });
  });
  poles.instanceMatrix.needsUpdate = true;
  poles.frustumCulled = false;
  poles.castShadow = true;
  const crossarms = boxes(arms, wood);
  group.add(poles, crossarms);

  const wires: LineSegment[] = [];
  const strands: readonly (readonly [number, number])[] = [...LAND.wireOffsets.map((offset): [number, number] => [offset, LAND.crossarmAt + 0.12]), [0.2, LAND.lowWireAt]];
  for (let i = 1; i < tops.length; i++) {
    const a = tops[i - 1], b = tops[i];
    if (!a || !b) continue;
    for (const [offset, height] of strands) {
      for (let piece = 0; piece < LAND.wirePieces; piece++) {
        const t0 = piece / LAND.wirePieces, t1 = (piece + 1) / LAND.wirePieces;
        const at = (t: number): [number, number, number] => [
          a.x + a.nx * offset + (b.x + b.nx * offset - a.x - a.nx * offset) * t,
          height - LAND.wireSag * 4 * t * (1 - t),
          a.z + a.nz * offset + (b.z + b.nz * offset - a.z - a.nz * offset) * t,
        ];
        wires.push({ from: at(t0), to: at(t1), width: LAND.wireMetres });
      }
    }
  }
  return { group, forest, wires };
}
