import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleAt, type Track, type TrackSample } from '../../sim/track.ts';
import { UNREFLECTED_LAYER, type PlanarReflection } from '../render/reflection.ts';
import { createRoadSurface, ROAD, type RoadSurface } from './road-material.ts';
import { surfaceMaps } from './surfaces.ts';
import { checkerTexture, edgeGlowTexture, kerbPaintTexture } from './textures.ts';

interface Edge {
  readonly lateral: number;
  readonly y: number;
  readonly u: number;
}

interface StripOptions {
  readonly step: number;
  readonly vScale: number;
  readonly include?: (sample: TrackSample) => boolean;
}

export const TRACK_LOOK = {
  wallHeight: 1.05,
  wallThickness: 0.45,
  neonLow: 0.72,
  neonHigh: 0.98,
  overlayHeight: 0.005,
  neonGlowReach: 5.5,
  leftNeon: [0.46, 0.41, 0.33],
  rightNeon: [0.46, 0.41, 0.33],
  neonGlowStrength: 0.12,
  paintColour: 0xb9bab4,
  paintRoughness: 0.6,
  kerbRoughness: 0.62,
  kerbNormalRepeat: [0.5, 1.6],
  kerbNormalScale: 0.9,
  runoffTint: 0x8a8d92,
  runoffRepeat: [1, 1],
  wallTint: 0xa9aaa6,
  wallRepeat: [1, 1],
  wallNormalScale: 1.4,
  lineWidth: 0.18,
  lineInset: 0.4,
  dashMetres: 6,
  kerbRise: 0.07,
  kerbStripeMetres: 5,
} as const;

function strip(track: Track, a: Edge, b: Edge, options: StripOptions): THREE.BufferGeometry {
  const rows = Math.ceil(track.samples.length / options.step);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const wrapped = row === rows;
    const sample = sampleAt(track, wrapped ? 0 : row * options.step);
    const v = (wrapped ? track.length : sample.s) * options.vScale;
    for (const edge of [a, b]) {
      positions.push(sample.x + sample.nx * edge.lateral, edge.y, sample.z + sample.nz * edge.lateral);
      uvs.push(edge.u, v);
    }
    if (row === rows) continue;
    if (options.include && !options.include(sample)) continue;
    const i = row * 2;
    indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mirrored(track: Track, a: Edge, b: Edge, options: StripOptions): THREE.BufferGeometry {
  const left = strip(track, a, b, options);
  const right = strip(track, { ...b, lateral: -b.lateral }, { ...a, lateral: -a.lateral }, options);
  return mergeGeometries([left, right]);
}

export interface TrackMeshes {
  readonly group: THREE.Group;
  readonly overlays: THREE.Object3D[];
  readonly road: RoadSurface;
}

export function buildTrackMeshes(track: Track, reflection: PlanarReflection): TrackMeshes {
  const group = new THREE.Group();
  const overlays: THREE.Object3D[] = [];
  const hw = track.halfWidth, kerbOuter = hw + track.kerbWidth, wall = track.wallOffset;

  const road = createRoadSurface(reflection);
  const roadMesh = new THREE.Mesh(strip(track, { lateral: -hw, y: 0, u: -hw / ROAD.tileMetres }, { lateral: hw, y: 0, u: hw / ROAD.tileMetres }, { step: 1, vScale: 1 / ROAD.tileMetres }), road.material);
  roadMesh.receiveShadow = true;
  roadMesh.layers.set(UNREFLECTED_LAYER);
  group.add(roadMesh);

  const paint = new THREE.MeshStandardMaterial({ color: TRACK_LOOK.paintColour, roughness: TRACK_LOOK.paintRoughness, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const lineInner = hw - TRACK_LOOK.lineInset - TRACK_LOOK.lineWidth;
  const edgeLines = mirrored(track, { lateral: lineInner, y: TRACK_LOOK.overlayHeight, u: 0 }, { lateral: lineInner + TRACK_LOOK.lineWidth, y: TRACK_LOOK.overlayHeight, u: 1 }, { step: 1, vScale: 1 });
  const dashes = strip(track, { lateral: -TRACK_LOOK.lineWidth / 2, y: TRACK_LOOK.overlayHeight, u: 0 }, { lateral: TRACK_LOOK.lineWidth / 2, y: TRACK_LOOK.overlayHeight, u: 1 }, {
    step: 1, vScale: 1, include: (sample) => Math.floor(sample.s / TRACK_LOOK.dashMetres) % 3 === 0,
  });
  const lines = new THREE.Mesh(mergeGeometries([edgeLines, dashes]), paint);
  lines.receiveShadow = true;
  group.add(lines);
  overlays.push(lines);

  const kerbs = new THREE.Mesh(
    mirrored(track, { lateral: hw, y: 0.004, u: 0 }, { lateral: kerbOuter, y: TRACK_LOOK.kerbRise, u: 1 }, { step: 1, vScale: 1 / TRACK_LOOK.kerbStripeMetres }),
    new THREE.MeshStandardMaterial({
      ...surfaceMaps('concrete', TRACK_LOOK.kerbNormalRepeat[0], TRACK_LOOK.kerbNormalRepeat[1]),
      map: kerbPaintTexture(),
      normalScale: new THREE.Vector2(TRACK_LOOK.kerbNormalScale, TRACK_LOOK.kerbNormalScale),
      roughness: TRACK_LOOK.kerbRoughness,
    }),
  );
  kerbs.receiveShadow = true;
  group.add(kerbs);

  const runoff = new THREE.Mesh(
    mirrored(track, { lateral: kerbOuter, y: TRACK_LOOK.kerbRise, u: 0 }, { lateral: wall, y: 0, u: 1.5 }, { step: 2, vScale: 1 / 3 }),
    new THREE.MeshStandardMaterial({ ...surfaceMaps('gravel', TRACK_LOOK.runoffRepeat[0], TRACK_LOOK.runoffRepeat[1]), color: TRACK_LOOK.runoffTint, roughness: 1 }),
  );
  runoff.receiveShadow = true;
  group.add(runoff);

  const top = TRACK_LOOK.wallHeight, back = wall + TRACK_LOOK.wallThickness;
  const walls = new THREE.Mesh(
    mergeGeometries([
      mirrored(track, { lateral: wall, y: 0, u: 0 }, { lateral: wall, y: top, u: 0.35 }, { step: 2, vScale: 1 / 3 }),
      mirrored(track, { lateral: wall, y: top, u: 0.35 }, { lateral: back, y: top, u: 0.5 }, { step: 2, vScale: 1 / 3 }),
      mirrored(track, { lateral: back, y: top, u: 0.5 }, { lateral: back, y: 0, u: 0.85 }, { step: 2, vScale: 1 / 3 }),
    ]),
    new THREE.MeshStandardMaterial({ ...surfaceMaps('concrete', TRACK_LOOK.wallRepeat[0], TRACK_LOOK.wallRepeat[1]), color: TRACK_LOOK.wallTint, roughness: 1, normalScale: new THREE.Vector2(TRACK_LOOK.wallNormalScale, TRACK_LOOK.wallNormalScale), side: THREE.DoubleSide }),
  );
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const glowMap = edgeGlowTexture();
  const sides: { sign: number; colour: readonly [number, number, number] }[] = [{ sign: 1, colour: TRACK_LOOK.leftNeon }, { sign: -1, colour: TRACK_LOOK.rightNeon }];
  for (const { sign, colour } of sides) {
    const face = sign * (wall - 0.03);
    const low: Edge = { lateral: face, y: TRACK_LOOK.neonLow, u: 0 }, high: Edge = { lateral: face, y: TRACK_LOOK.neonHigh, u: 1 };
    const neon = new THREE.Mesh(strip(track, low, high, { step: 2, vScale: 1 }), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...colour), side: THREE.DoubleSide }));
    group.add(neon);
    const near: Edge = { lateral: sign * (wall - 0.05), y: TRACK_LOOK.overlayHeight, u: 0 }, far: Edge = { lateral: sign * (wall - TRACK_LOOK.neonGlowReach), y: TRACK_LOOK.overlayHeight, u: 1 };
    const glow = new THREE.Mesh(
      sign > 0 ? strip(track, far, near, { step: 2, vScale: 1 }) : strip(track, near, far, { step: 2, vScale: 1 }),
      new THREE.MeshBasicMaterial({ map: glowMap, color: new THREE.Color().setRGB(colour[0] * TRACK_LOOK.neonGlowStrength, colour[1] * TRACK_LOOK.neonGlowStrength, colour[2] * TRACK_LOOK.neonGlowStrength), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    );
    group.add(glow);
    overlays.push(glow);
  }

  const start = sampleAt(track, 0);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 2), new THREE.MeshStandardMaterial({ map: checkerTexture(32, 4), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  line.rotation.set(-Math.PI / 2, Math.atan2(start.tx, start.tz), 0, 'YXZ');
  line.position.set(start.x, TRACK_LOOK.overlayHeight, start.z);
  line.receiveShadow = true;
  group.add(line);
  overlays.push(line);

  return { group, overlays, road };
}
