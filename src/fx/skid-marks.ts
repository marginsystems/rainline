import * as THREE from 'three';

export const SKID = {
  segments: 3600,
  width: 0.3,
  height: 0.004,
  minStep: 0.25,
  opacity: 0.62,
} as const;

interface Trail {
  x: number;
  z: number;
  leftX: number;
  leftZ: number;
  rightX: number;
  rightZ: number;
  alpha: number;
  drawing: boolean;
}

export class SkidMarks {
  readonly object: THREE.Mesh;
  private readonly positions: THREE.BufferAttribute;
  private readonly colours: THREE.BufferAttribute;
  private readonly trails: Trail[] = [];
  private next = 0;

  constructor(wheels: number) {
    const geometry = new THREE.BufferGeometry();
    this.positions = new THREE.BufferAttribute(new Float32Array(SKID.segments * 4 * 3), 3);
    this.colours = new THREE.BufferAttribute(new Float32Array(SKID.segments * 4 * 4), 4);
    this.positions.setUsage(THREE.DynamicDrawUsage);
    this.colours.setUsage(THREE.DynamicDrawUsage);
    const indices: number[] = [];
    for (let i = 0; i < SKID.segments; i++) indices.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colours);
    geometry.setIndex(indices);
    this.object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
    this.object.frustumCulled = false;
    for (let i = 0; i < wheels; i++) this.trails.push({ x: 0, z: 0, leftX: 0, leftZ: 0, rightX: 0, rightZ: 0, alpha: 0, drawing: false });
  }

  lift(wheel: number): void {
    const trail = this.trails[wheel];
    if (trail) trail.drawing = false;
  }

  mark(wheel: number, x: number, z: number, strength: number): void {
    const trail = this.trails[wheel];
    if (!trail) return;
    const alpha = Math.min(1, strength) * SKID.opacity;
    if (!trail.drawing) {
      Object.assign(trail, { x, z, leftX: x, leftZ: z, rightX: x, rightZ: z, alpha: 0, drawing: true });
      return;
    }
    const dx = x - trail.x, dz = z - trail.z;
    const step = Math.hypot(dx, dz);
    if (step < SKID.minStep) return;
    const sideX = (-dz / step) * SKID.width * 0.5, sideZ = (dx / step) * SKID.width * 0.5;
    const leftX = x + sideX, leftZ = z + sideZ, rightX = x - sideX, rightZ = z - sideZ;
    const i = this.next;
    this.next = (this.next + 1) % SKID.segments;
    this.positions.array.set([trail.leftX, SKID.height, trail.leftZ, trail.rightX, SKID.height, trail.rightZ, leftX, SKID.height, leftZ, rightX, SKID.height, rightZ], i * 12);
    this.colours.array.set([0, 0, 0, trail.alpha, 0, 0, 0, trail.alpha, 0, 0, 0, alpha, 0, 0, 0, alpha], i * 16);
    this.positions.addUpdateRange(i * 12, 12);
    this.colours.addUpdateRange(i * 16, 16);
    this.positions.needsUpdate = true;
    this.colours.needsUpdate = true;
    Object.assign(trail, { x, z, leftX, leftZ, rightX, rightZ, alpha });
  }
}
