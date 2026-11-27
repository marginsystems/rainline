import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sampleAt, type Track } from '../../../sim/track.ts';
import { surfaceMaps, surfaceUrl, tiledTexture } from '../surfaces.ts';
import { COAST, type Span } from './plan.ts';
import { ribbon, yawOf, type Edge } from './ribbon.ts';

export const TUNNEL = {
  wallBeyondKerb: 1.05,
  kerbHeight: 0.28,
  skirtHeight: 1.25,
  tileTop: 5.3,
  ceiling: 6.7,
  tileMetres: 2.4,
  tileTint: 0xb9b4a6,
  skirtColour: 0x26282b,
  ceilingColour: 0x2c2e30,
  kerbTint: 0x8d8f8c,
  stripeLow: 3.05,
  stripeHigh: 3.4,
  stripeColour: 0xa86a12,
  stripeInset: 0.02,
  lightAt: 6.2,
  lightWidth: 0.42,
  lightColour: [2.3, 2.35, 2.4],
  portalLeft: 130,
  portalRight: 85,
  portalBase: 13,
  portalHump: 27,
  portalHumpWidth: 60,
  portalSteps: 22,
  portalTileMetres: 9,
  portalTint: 0x9a9d96,
  carLightIntensity: 34,
  carLightReach: 60,
  carLightColour: 0xfff0dc,
  carLightHeight: 5.4,
  carLightAhead: 16,
  ambientColour: 0xffe9cf,
  ambientIntensity: 0.3,
} as const;

export interface Tunnels {
  readonly group: THREE.Group;
  readonly lights: THREE.Object3D[];
  follow(x: number, z: number, yaw: number, shelter: number): void;
}

const flat = (lateralA: number, yA: number, lateralB: number, yB: number, metres: number): Edge[] => [
  { lateral: lateralA, y: yA, u: 0 },
  { lateral: lateralB, y: yB, u: Math.hypot(lateralB - lateralA, yB - yA) / metres },
];

function portal(track: Track, index: number, wall: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-TUNNEL.portalRight, COAST.seaLevel - 2);
  for (let step = 0; step <= TUNNEL.portalSteps; step++) {
    const lateral = -TUNNEL.portalRight + ((TUNNEL.portalLeft + TUNNEL.portalRight) * step) / TUNNEL.portalSteps;
    const hump = Math.exp(-((lateral / TUNNEL.portalHumpWidth) ** 2));
    shape.lineTo(lateral, TUNNEL.portalBase + TUNNEL.portalHump * hump + Math.max(0, lateral) * 0.12);
  }
  shape.lineTo(TUNNEL.portalLeft, COAST.seaLevel - 2);
  const mouth = new THREE.Path();
  mouth.moveTo(-wall, -1);
  mouth.lineTo(wall, -1);
  mouth.lineTo(wall, TUNNEL.ceiling);
  mouth.lineTo(-wall, TUNNEL.ceiling);
  shape.holes.push(mouth);
  const geometry = new THREE.ShapeGeometry(shape);
  const sample = sampleAt(track, index);
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(yawOf(sample)).setPosition(sample.x, 0, sample.z));
  return geometry;
}

export function buildTunnels(track: Track, tunnels: readonly Span[]): Tunnels {
  const group = new THREE.Group();
  const kerb = track.wallOffset - 0.05, wall = kerb + TUNNEL.wallBeyondKerb;
  const tiles: THREE.BufferGeometry[] = [], skirts: THREE.BufferGeometry[] = [], ceilings: THREE.BufferGeometry[] = [], kerbs: THREE.BufferGeometry[] = [], stripes: THREE.BufferGeometry[] = [], lamps: THREE.BufferGeometry[] = [], portals: THREE.BufferGeometry[] = [];
  for (const span of tunnels) {
    for (const side of [-1, 1]) {
      const face = side * wall;
      kerbs.push(ribbon(track, span, 3, flat(side * kerb, 0, side * kerb, TUNNEL.kerbHeight, 2), 1 / 2), ribbon(track, span, 3, flat(side * kerb, TUNNEL.kerbHeight, face, TUNNEL.kerbHeight, 2), 1 / 2));
      skirts.push(ribbon(track, span, 3, flat(face, 0, face, TUNNEL.skirtHeight, 2), 1 / 2));
      tiles.push(ribbon(track, span, 3, flat(face, TUNNEL.skirtHeight, face, TUNNEL.tileTop, TUNNEL.tileMetres), 1 / TUNNEL.tileMetres));
      ceilings.push(ribbon(track, span, 3, flat(face, TUNNEL.tileTop, face, TUNNEL.ceiling, 2), 1 / 2));
      stripes.push(ribbon(track, span, 3, flat(side * (wall - TUNNEL.stripeInset), TUNNEL.stripeLow, side * (wall - TUNNEL.stripeInset), TUNNEL.stripeHigh, 1), 1));
      const lightFace = side * (wall - 0.03);
      lamps.push(ribbon(track, span, 3, flat(lightFace, TUNNEL.lightAt, lightFace, TUNNEL.lightAt + TUNNEL.lightWidth, 1), 1));
    }
    ceilings.push(ribbon(track, span, 3, flat(-wall, TUNNEL.ceiling, wall, TUNNEL.ceiling, 2), 1 / 2));
    portals.push(portal(track, span.from, wall), portal(track, span.to, wall));
  }
  const shell = (geometries: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  };
  const concreteNormal = tiledTexture(surfaceUrl('concrete', 'nor_gl'), false, 1, 1);
  const tiled = shell(tiles, new THREE.MeshStandardMaterial({ ...surfaceMaps('tiles'), color: TUNNEL.tileTint, roughness: 1, side: THREE.DoubleSide }));
  const skirt = shell(skirts, new THREE.MeshStandardMaterial({ color: TUNNEL.skirtColour, normalMap: concreteNormal, roughness: 0.8, side: THREE.DoubleSide }));
  const roof = shell(ceilings, new THREE.MeshStandardMaterial({ color: TUNNEL.ceilingColour, normalMap: concreteNormal, roughness: 0.95, side: THREE.DoubleSide }));
  const walkway = shell(kerbs, new THREE.MeshStandardMaterial({ ...surfaceMaps('concrete'), color: TUNNEL.kerbTint, roughness: 1, side: THREE.DoubleSide }));
  const stripe = shell(stripes, new THREE.MeshStandardMaterial({ color: TUNNEL.stripeColour, roughness: 0.5, side: THREE.DoubleSide }));
  stripe.castShadow = false;
  const strip = new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...TUNNEL.lightColour), side: THREE.DoubleSide }));
  const rockRepeat = 1 / TUNNEL.portalTileMetres;
  const headland = new THREE.Mesh(mergeGeometries(portals), new THREE.MeshStandardMaterial({
    map: tiledTexture(surfaceUrl('rock', 'diff'), true, rockRepeat, rockRepeat),
    normalMap: tiledTexture(surfaceUrl('rock', 'nor_gl'), false, rockRepeat, rockRepeat),
    color: TUNNEL.portalTint, roughness: 1, side: THREE.DoubleSide,
  }));
  group.add(tiled, skirt, roof, walkway, stripe, strip, headland);

  const ahead = new THREE.PointLight(TUNNEL.carLightColour, 0, TUNNEL.carLightReach, 1.6);
  const behind = new THREE.PointLight(TUNNEL.carLightColour, 0, TUNNEL.carLightReach, 1.6);
  const ambient = new THREE.AmbientLight(TUNNEL.ambientColour, 0);
  group.add(ahead, behind, ambient);

  return {
    group,
    lights: [strip],
    follow(x, z, yaw, shelter) {
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      ahead.position.set(x + sin * TUNNEL.carLightAhead, TUNNEL.carLightHeight, z + cos * TUNNEL.carLightAhead);
      behind.position.set(x - sin * TUNNEL.carLightAhead, TUNNEL.carLightHeight, z - cos * TUNNEL.carLightAhead);
      ahead.intensity = TUNNEL.carLightIntensity * shelter;
      behind.intensity = TUNNEL.carLightIntensity * shelter;
      ambient.intensity = TUNNEL.ambientIntensity * shelter;
    },
  };
}
