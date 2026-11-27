import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleAt, type Track } from '../../../sim/track.ts';
import { UNREFLECTED_LAYER, type PlanarReflection } from '../../render/reflection.ts';
import { createRoadSurface, ROAD, type RoadSurface } from '../road-material.ts';
import { stations, type Span } from './plan.ts';
import { beside, boxes, ribbon, wholeLap, type BoxPlacement } from './ribbon.ts';

export const HIGHWAY = {
  pavedBeyondWall: -0.05,
  overlayHeight: 0.005,
  mirrorGain: 0.5,
  white: 0xb4b5b0,
  yellow: 0xb08a1c,
  paintRoughness: 0.55,
  lineWidth: 0.15,
  edgeLineInset: 0.35,
  centreGap: 0.14,
  laneLineAt: 3.7,
  dashMetres: 3,
  dashEveryMetres: 12,
  railLow: 0.46,
  railRise: 0.085,
  railDepth: 0.07,
  railColour: 0x878c91,
  railMetalness: 0.7,
  railRoughness: 0.48,
  postEveryMetres: 4,
  postSize: [0.11, 0.82, 0.15],
  postBehind: 0.1,
} as const;

export interface HighwayRoad {
  readonly group: THREE.Group;
  readonly overlays: THREE.Object3D[];
  readonly road: RoadSurface;
}

const line = (track: Track, span: Span, centre: number): THREE.BufferGeometry => ribbon(track, span, 2, [
  { lateral: centre - HIGHWAY.lineWidth / 2, y: HIGHWAY.overlayHeight, u: 0 },
  { lateral: centre + HIGHWAY.lineWidth / 2, y: HIGHWAY.overlayHeight, u: 1 },
], 1);

const paint = (colour: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color: colour, roughness: HIGHWAY.paintRoughness, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

export function buildHighwayRoad(track: Track, reflection: PlanarReflection): HighwayRoad {
  const group = new THREE.Group();
  const lap = wholeLap(track);
  const paved = track.wallOffset + HIGHWAY.pavedBeyondWall;
  const road = createRoadSurface(reflection, HIGHWAY.mirrorGain);
  const surface = new THREE.Mesh(ribbon(track, lap, 2, [{ lateral: -paved, y: 0, u: -paved / ROAD.tileMetres }, { lateral: paved, y: 0, u: paved / ROAD.tileMetres }], 1 / ROAD.tileMetres), road.material);
  surface.receiveShadow = true;
  surface.layers.set(UNREFLECTED_LAYER);
  group.add(surface);

  const edge = track.halfWidth - HIGHWAY.edgeLineInset;
  const dashes: THREE.BufferGeometry[] = [];
  const dashSamples = Math.round(HIGHWAY.dashMetres / track.spacing), everySamples = Math.round(HIGHWAY.dashEveryMetres / track.spacing);
  for (let from = 0; from + dashSamples < track.samples.length; from += everySamples) {
    const dash: Span = { section: 'coast', from, to: from + dashSamples };
    dashes.push(line(track, dash, HIGHWAY.laneLineAt), line(track, dash, -HIGHWAY.laneLineAt));
  }
  const white = new THREE.Mesh(mergeGeometries([line(track, lap, edge), line(track, lap, -edge), ...dashes]), paint(HIGHWAY.white));
  const yellow = new THREE.Mesh(mergeGeometries([line(track, lap, HIGHWAY.centreGap), line(track, lap, -HIGHWAY.centreGap)]), paint(HIGHWAY.yellow));
  for (const marking of [white, yellow]) {
    marking.receiveShadow = true;
    group.add(marking);
  }
  return { group, overlays: [white, yellow], road };
}

export function buildGuardrails(track: Track, spans: readonly Span[]): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: HIGHWAY.railColour, metalness: HIGHWAY.railMetalness, roughness: HIGHWAY.railRoughness, side: THREE.DoubleSide });
  const rails: THREE.BufferGeometry[] = [];
  const posts: BoxPlacement[] = [];
  for (const span of spans) {
    for (const side of [-1, 1]) {
      const face = side * track.wallOffset;
      const dent = side * (track.wallOffset - HIGHWAY.railDepth);
      rails.push(ribbon(track, span, 4, [0, 1, 2, 3, 4].map((k) => ({ lateral: k % 2 === 0 ? face : dent, y: HIGHWAY.railLow + k * HIGHWAY.railRise, u: k / 4 })), 1));
      for (const index of stations(track, span, HIGHWAY.postEveryMetres, 1)) {
        posts.push(beside(sampleAt(track, index), side * (track.wallOffset + HIGHWAY.postBehind), HIGHWAY.postSize[1] / 2, HIGHWAY.postSize));
      }
    }
  }
  const rail = new THREE.Mesh(mergeGeometries(rails), metal);
  rail.castShadow = true;
  rail.receiveShadow = true;
  const uprights = boxes(posts, metal);
  uprights.castShadow = true;
  group.add(rail, uprights);
  return group;
}
