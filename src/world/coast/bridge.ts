import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleAt, type Track } from '../../../sim/track.ts';
import { surfaceMaps, surfaceUrl, tiledTexture } from '../surfaces.ts';
import { cableHeight, COAST, stations, type Span } from './plan.ts';
import { beside, boxes, ribbon, type BoxPlacement } from './ribbon.ts';
import type { LineSegment } from './thin-line.ts';

export const BRIDGE = {
  kerbHeight: 0.25,
  walkEdge: 12.7,
  fasciaDepth: 2.6,
  walkTint: 0x8b8d8a,
  railAt: 12.55,
  railHeights: [0.5, 0.82, 1.14],
  railMetres: 0.07,
  railPieceMetres: 12,
  postEveryMetres: 3,
  postSize: [0.1, 1.2, 0.1],
  steelColour: 0x4b565c,
  steelRoughness: 0.7,
  legAt: 15.2,
  legSize: [3.4, 0, 4.4],
  beamHeights: [-5, 30, 68, 104],
  beamSize: [0, 5, 3.8],
  cableAt: 13.6,
  cableMetres: 0.62,
  cablePieceMetres: 10,
  hangerEveryMetres: 13,
  hangerMetres: 0.085,
  hangerFrom: 1.15,
  lineColour: [0.07, 0.085, 0.095],
} as const;

export interface Bridge {
  readonly group: THREE.Group;
  readonly lines: LineSegment[];
}

export function buildBridge(track: Track, span: Span): Bridge {
  const group = new THREE.Group();
  const kerb = track.wallOffset - 0.05;
  const walks: THREE.BufferGeometry[] = [];
  const posts: BoxPlacement[] = [];
  const lines: LineSegment[] = [];
  for (const side of [-1, 1]) {
    walks.push(
      ribbon(track, span, 6, [{ lateral: side * kerb, y: 0, u: 0 }, { lateral: side * kerb, y: BRIDGE.kerbHeight, u: 0.1 }], 1 / 3),
      ribbon(track, span, 6, [{ lateral: side * kerb, y: BRIDGE.kerbHeight, u: 0 }, { lateral: side * BRIDGE.walkEdge, y: BRIDGE.kerbHeight, u: 1 }], 1 / 3),
      ribbon(track, span, 6, [{ lateral: side * BRIDGE.walkEdge, y: BRIDGE.kerbHeight, u: 0 }, { lateral: side * BRIDGE.walkEdge, y: BRIDGE.kerbHeight - BRIDGE.fasciaDepth, u: 0.8 }], 1 / 3),
    );
    for (const index of stations(track, span, BRIDGE.postEveryMetres, 0)) posts.push(beside(sampleAt(track, index), side * BRIDGE.railAt, BRIDGE.kerbHeight + BRIDGE.postSize[1] / 2, BRIDGE.postSize));
    const along = (everyMetres: number, lateral: number, heightAt: (x: number) => number, width: number): void => {
      const marks = stations(track, span, everyMetres, 0);
      for (let i = 1; i < marks.length; i++) {
        const a = sampleAt(track, marks[i - 1] ?? 0), b = sampleAt(track, marks[i] ?? 0);
        lines.push({
          from: [a.x + a.nx * lateral, heightAt(a.x), a.z + a.nz * lateral],
          to: [b.x + b.nx * lateral, heightAt(b.x), b.z + b.nz * lateral],
          width,
        });
      }
    };
    for (const height of BRIDGE.railHeights) along(BRIDGE.railPieceMetres, side * BRIDGE.railAt, () => BRIDGE.kerbHeight + height, BRIDGE.railMetres);
    along(BRIDGE.cablePieceMetres, side * BRIDGE.cableAt, cableHeight, BRIDGE.cableMetres);
    for (const index of stations(track, span, BRIDGE.hangerEveryMetres, 4)) {
      const sample = sampleAt(track, index);
      const top = cableHeight(sample.x);
      if (top < BRIDGE.hangerFrom + 1.5) continue;
      const x = sample.x + sample.nx * side * BRIDGE.cableAt, z = sample.z + sample.nz * side * BRIDGE.cableAt;
      lines.push({ from: [x, BRIDGE.hangerFrom, z], to: [x, top, z], width: BRIDGE.hangerMetres });
    }
  }
  const deck = new THREE.Mesh(mergeGeometries(walks), new THREE.MeshStandardMaterial({ ...surfaceMaps('concrete'), color: BRIDGE.walkTint, roughness: 1, side: THREE.DoubleSide }));
  deck.receiveShadow = true;
  const steel = new THREE.MeshStandardMaterial({ color: BRIDGE.steelColour, normalMap: tiledTexture(surfaceUrl('concrete', 'nor_gl'), false, 1, 1), roughness: BRIDGE.steelRoughness, metalness: 0.3 });
  const uprights = boxes(posts, steel);
  uprights.castShadow = true;

  const frames: BoxPlacement[] = [];
  const legHeight = COAST.towerTop + 4 - COAST.seaLevel;
  for (const towerX of [-COAST.towerAtX, COAST.towerAtX]) {
    let nearest = span.from, best = Number.POSITIVE_INFINITY;
    for (let index = span.from; index < span.to; index++) {
      const off = Math.abs(sampleAt(track, index).x - towerX);
      if (off < best) { best = off; nearest = index; }
    }
    const sample = sampleAt(track, nearest);
    for (const side of [-1, 1]) frames.push(beside(sample, side * BRIDGE.legAt, COAST.seaLevel + legHeight / 2, [BRIDGE.legSize[0], legHeight, BRIDGE.legSize[2]]));
    for (const height of BRIDGE.beamHeights) frames.push(beside(sample, 0, height, [BRIDGE.legAt * 2, BRIDGE.beamSize[1], BRIDGE.beamSize[2]]));
  }
  group.add(deck, uprights, boxes(frames, steel));
  return { group, lines };
}
