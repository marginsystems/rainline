import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mod } from '../../sim/math.ts';
import { sampleAt, type Track } from '../../sim/track.ts';
import { TRAFFIC, type Traffic, type VehicleKind } from '../../sim/traffic.ts';

export const TRAFFIC_LOOK = {
  directory: 'models/traffic',
  models: {
    car: ['sedan', 'wagon', 'hatch', 'pickup', 'taxi', 'police'],
    van: ['van', 'ambulance'],
    truck: ['truck'],
    bus: ['bus'],
  },
  bodyMaterial: 'Body',
  glassMaterial: 'Glass',
  unshadowed: ['Glass', 'Interior'],
  paints: [0xd8d5cc, 0x7d1a1c, 0x1f3a5c, 0x9aa0a6, 0x2c4a3a, 0xc9a227, 0x15171a, 0x8a5a34, 0x6f8fae, 0xb4442c],
  paintRoughness: 0.32,
  glassColour: 0x0d1418,
  glassOpacity: 0.55,
  glassRoughness: 0.08,
  environmentIntensity: 1.5,
} as const;

export interface TrafficView {
  readonly group: THREE.Group;
  readonly glass: readonly THREE.Object3D[];
  update(traffic: Traffic, track: Track): void;
}

interface VehicleModel {
  readonly parts: THREE.InstancedMesh[];
  painted: THREE.InstancedMesh | null;
  count: number;
}

function partsByMaterial(scene: THREE.Object3D): Map<THREE.Material, THREE.BufferGeometry> {
  scene.updateMatrixWorld(true);
  const pieces = new Map<THREE.Material, THREE.BufferGeometry[]>();
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material: THREE.Material | undefined = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!material) return;
    const piece: THREE.BufferGeometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
    const list = pieces.get(material) ?? [];
    list.push(piece);
    pieces.set(material, list);
  });
  const merged = new Map<THREE.Material, THREE.BufferGeometry>();
  for (const [material, list] of pieces) merged.set(material, list.length === 1 && list[0] ? list[0] : mergeGeometries(list));
  return merged;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material): { mesh: THREE.InstancedMesh; painted: boolean } {
  const mesh = new THREE.InstancedMesh(geometry, material, TRAFFIC.count);
  let painted = false;
  if (material instanceof THREE.MeshStandardMaterial) {
    material.envMapIntensity = TRAFFIC_LOOK.environmentIntensity;
    if (material.name === TRAFFIC_LOOK.glassMaterial) {
      material.map = null;
      material.color.set(TRAFFIC_LOOK.glassColour);
      material.transparent = true;
      material.opacity = TRAFFIC_LOOK.glassOpacity;
      material.roughness = TRAFFIC_LOOK.glassRoughness;
      material.depthWrite = false;
    }
    if (material.name === TRAFFIC_LOOK.bodyMaterial && !material.map) {
      material.color.set(0xffffff);
      material.roughness = TRAFFIC_LOOK.paintRoughness;
      painted = true;
    }
  }
  const shadowed = !TRAFFIC_LOOK.unshadowed.some((name) => name === material.name);
  mesh.castShadow = shadowed;
  mesh.receiveShadow = shadowed;
  mesh.frustumCulled = false;
  mesh.count = 0;
  return { mesh, painted };
}

export async function loadTrafficView(): Promise<TrafficView> {
  const group = new THREE.Group();
  const loader = new GLTFLoader();
  const kinds: VehicleKind[] = ['car', 'van', 'truck', 'bus'];
  const looks = new Map<VehicleKind, VehicleModel[]>();
  const glass: THREE.Object3D[] = [];
  for (const kind of kinds) {
    const loaded = await Promise.all(TRAFFIC_LOOK.models[kind].map((name) => loader.loadAsync(`${TRAFFIC_LOOK.directory}/${name}.glb`)));
    looks.set(kind, loaded.map((gltf) => {
      const model: VehicleModel = { parts: [], painted: null, count: 0 };
      for (const [material, geometry] of partsByMaterial(gltf.scene)) {
        const { mesh, painted } = instanced(geometry, material);
        if (painted) model.painted = mesh;
        if (material.name === TRAFFIC_LOOK.glassMaterial) glass.push(mesh);
        model.parts.push(mesh);
        group.add(mesh);
      }
      return model;
    }));
  }
  const paints = TRAFFIC_LOOK.paints.map((colour) => new THREE.Color(colour));
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), roll = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0), forward = new THREE.Vector3(0, 0, 1);

  return {
    group,
    glass,
    update(traffic, track) {
      for (const models of looks.values()) for (const model of models) model.count = 0;
      for (const vehicle of traffic.vehicles) {
        const models = looks.get(vehicle.kind) ?? [];
        const model = models[vehicle.palette % (models.length || 1)];
        if (!model) continue;
        const sample = sampleAt(track, mod(Math.round(vehicle.distance / track.spacing), track.samples.length));
        position.set(sample.x + sample.nx * vehicle.lateral, Math.max(0, vehicle.height), sample.z + sample.nz * vehicle.lateral);
        rotation.setFromAxisAngle(up, Math.atan2(sample.tx, sample.tz) + vehicle.spin).multiply(roll.setFromAxisAngle(forward, -vehicle.roll));
        matrix.compose(position, rotation, scale);
        for (const part of model.parts) part.setMatrixAt(model.count, matrix);
        const paint = paints[Math.floor(vehicle.palette / models.length) % paints.length];
        if (model.painted && paint) model.painted.setColorAt(model.count, paint);
        model.count += 1;
      }
      for (const models of looks.values()) {
        for (const model of models) {
          for (const part of model.parts) {
            part.count = model.count;
            part.instanceMatrix.needsUpdate = true;
          }
          if (model.painted?.instanceColor) model.painted.instanceColor.needsUpdate = true;
        }
      }
    },
  };
}
