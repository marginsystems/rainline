import * as THREE from 'three';

export const DAMAGE = {
  radius: 1.35,
  depthPerImpactSpeed: 0.011,
  minDepth: 0.03,
  maxDepth: 0.2,
  maxDent: 0.34,
  sag: 0.25,
  repairRate: 7,
  repairedWithin: 0.002,
  halfWidth: 0.85,
  halfLength: 2.16,
  foldsPerMetre: 9,
} as const;

interface Panel {
  readonly attribute: THREE.BufferAttribute;
  readonly geometry: THREE.BufferGeometry;
  readonly rest: Float32Array;
}

const fold = (x: number, y: number, z: number): number => 0.5 + 0.5 * Math.sin(x * DAMAGE.foldsPerMetre + z * 7.3 + y * 5.1) * Math.sin(z * DAMAGE.foldsPerMetre * 1.3 - x * 4.1 + y * 3.3);

export class CarDamage {
  private readonly panels: Panel[] = [];
  private dented = false;
  private repairing = false;

  constructor(body: THREE.Object3D) {
    body.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const attribute = child.geometry.getAttribute('position');
      if (!(attribute instanceof THREE.BufferAttribute)) return;
      attribute.setUsage(THREE.DynamicDrawUsage);
      this.panels.push({ attribute, geometry: child.geometry, rest: Float32Array.from(attribute.array) });
    });
  }

  static contact(directionX: number, directionZ: number): { x: number; z: number } {
    const reach = Math.min(DAMAGE.halfWidth / Math.max(Math.abs(directionX), 1e-4), DAMAGE.halfLength / Math.max(Math.abs(directionZ), 1e-4));
    return { x: directionX * reach, z: directionZ * reach };
  }

  hit(directionX: number, directionZ: number, impactSpeed: number): void {
    const centre = CarDamage.contact(directionX, directionZ);
    const depth = Math.min(DAMAGE.maxDepth, Math.max(DAMAGE.minDepth, impactSpeed * DAMAGE.depthPerImpactSpeed));
    for (const panel of this.panels) {
      const array = panel.attribute.array, rest = panel.rest;
      let touched = false;
      for (let i = 0; i < panel.attribute.count; i++) {
        const o = i * 3;
        const x = array[o] ?? 0, y = array[o + 1] ?? 0, z = array[o + 2] ?? 0;
        const reach = Math.hypot(x - centre.x, z - centre.z);
        if (reach >= DAMAGE.radius) continue;
        const weight = (1 - reach / DAMAGE.radius) ** 2;
        const crease = fold(rest[o] ?? 0, rest[o + 1] ?? 0, rest[o + 2] ?? 0);
        const push = depth * weight * (0.45 + 1.1 * crease);
        let dx = x - directionX * push - (rest[o] ?? 0);
        let dy = y - push * DAMAGE.sag * (1 - crease) - (rest[o + 1] ?? 0);
        let dz = z - directionZ * push - (rest[o + 2] ?? 0);
        const dent = Math.hypot(dx, dy, dz);
        if (dent > DAMAGE.maxDent) {
          const scale = DAMAGE.maxDent / dent;
          dx *= scale; dy *= scale; dz *= scale;
        }
        array[o] = (rest[o] ?? 0) + dx;
        array[o + 1] = (rest[o + 1] ?? 0) + dy;
        array[o + 2] = (rest[o + 2] ?? 0) + dz;
        touched = true;
      }
      if (!touched) continue;
      panel.attribute.needsUpdate = true;
      panel.geometry.computeVertexNormals();
    }
    this.dented = true;
    this.repairing = false;
  }

  repair(): void {
    this.repairing = this.dented;
  }

  update(dt: number): void {
    if (!this.repairing) return;
    const blend = 1 - Math.exp(-DAMAGE.repairRate * dt);
    let furthest = 0;
    for (const panel of this.panels) {
      const array = panel.attribute.array, rest = panel.rest;
      for (let i = 0; i < array.length; i++) {
        const gap = (rest[i] ?? 0) - (array[i] ?? 0);
        if (gap === 0) continue;
        furthest = Math.max(furthest, Math.abs(gap));
        array[i] = (array[i] ?? 0) + gap * blend;
      }
      panel.attribute.needsUpdate = true;
    }
    if (furthest > DAMAGE.repairedWithin) return;
    for (const panel of this.panels) {
      panel.attribute.array.set(panel.rest);
      panel.attribute.needsUpdate = true;
      panel.geometry.computeVertexNormals();
    }
    this.repairing = false;
    this.dented = false;
  }
}
