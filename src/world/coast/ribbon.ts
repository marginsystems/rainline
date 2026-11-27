import * as THREE from 'three';
import { sampleAt, type Track, type TrackSample } from '../../../sim/track.ts';
import type { Span } from './plan.ts';

export interface Edge {
  readonly lateral: number;
  readonly y: number;
  readonly u: number;
}

export interface BoxPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly size: readonly [number, number, number];
}

export const wholeLap = (track: Track): Span => ({ section: 'coast', from: 0, to: track.samples.length });

export const yawOf = (sample: TrackSample): number => Math.atan2(sample.tx, sample.tz);

export function beside(sample: TrackSample, lateral: number, y: number, size: readonly [number, number, number]): BoxPlacement {
  return { x: sample.x + sample.nx * lateral, y, z: sample.z + sample.nz * lateral, yaw: yawOf(sample), size };
}

export function ribbon(track: Track, span: Span, step: number, edges: readonly Edge[], vScale: number): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const across = edges.length;
  let rows = 0;
  for (let index = span.from; ; index = Math.min(index + step, span.to)) {
    const sample = sampleAt(track, index);
    for (const edge of edges) {
      positions.push(sample.x + sample.nx * edge.lateral, edge.y, sample.z + sample.nz * edge.lateral);
      uvs.push(edge.u, index * track.spacing * vScale);
    }
    rows++;
    if (index >= span.to) break;
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let k = 0; k < across - 1; k++) {
      const i = row * across + k;
      indices.push(i, i + across, i + 1, i + 1, i + across, i + across + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function boxes(placements: readonly BoxPlacement[], material: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, placements.length);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  placements.forEach((placement, i) => {
    rotation.setFromAxisAngle(up, placement.yaw);
    mesh.setMatrixAt(i, matrix.compose(position.set(placement.x, placement.y, placement.z), rotation, scale.set(...placement.size)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}
