import * as THREE from 'three';

export const DEBRIS = {
  capacity: 140,
  gravity: 18,
  bounce: 0.35,
  scrub: 0.68,
  restSpeed: 0.4,
  clearSeconds: 0.45,
  maxPerHit: 14,
  spread: 0.9,
} as const;

interface Piece {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  sx: number; sy: number; sz: number;
  resting: boolean;
}

export class Debris {
  readonly object: THREE.InstancedMesh;
  private readonly pieces: Piece[] = [];
  private next = 0;
  private shrink = 1;
  private clearing = false;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();

  constructor() {
    this.object = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.4 }), DEBRIS.capacity);
    this.object.count = 0;
    this.object.frustumCulled = false;
    this.object.castShadow = true;
  }

  get count(): number {
    return this.pieces.length;
  }

  spawn(x: number, y: number, z: number, awayX: number, awayZ: number, speed: number, count: number, colours: readonly THREE.Color[]): void {
    if (this.clearing) this.finishClear();
    for (let i = 0; i < Math.min(count, DEBRIS.maxPerHit); i++) {
      const angle = Math.atan2(awayX, awayZ) + (Math.random() - 0.5) * 2 * DEBRIS.spread;
      const pace = speed * (0.35 + Math.random() * 0.9);
      const piece: Piece = {
        x, y: y + Math.random() * 0.4, z,
        vx: Math.sin(angle) * pace, vy: 1.5 + Math.random() * speed * 0.45, vz: Math.cos(angle) * pace,
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
        wx: (Math.random() - 0.5) * 18, wy: (Math.random() - 0.5) * 18, wz: (Math.random() - 0.5) * 18,
        sx: 0.08 + Math.random() * 0.3, sy: 0.02 + Math.random() * 0.05, sz: 0.06 + Math.random() * 0.22,
        resting: false,
      };
      const slot = this.pieces.length < DEBRIS.capacity ? this.pieces.length : this.next;
      this.pieces[slot] = piece;
      this.next = (slot + 1) % DEBRIS.capacity;
      const colour = colours[Math.floor(Math.random() * colours.length)];
      if (colour) this.object.setColorAt(slot, colour);
      this.write(slot, piece);
    }
    this.object.count = this.pieces.length;
    if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    this.object.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    if (this.pieces.length > 0) this.clearing = true;
  }

  update(dt: number): void {
    if (this.pieces.length === 0) return;
    if (this.clearing) {
      this.shrink = Math.max(0, this.shrink - dt / DEBRIS.clearSeconds);
      if (this.shrink === 0) {
        this.finishClear();
        return;
      }
    }
    let moved = this.clearing;
    this.pieces.forEach((piece, slot) => {
      if (!piece.resting) {
        moved = true;
        piece.vy -= DEBRIS.gravity * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.z += piece.vz * dt;
        piece.rx += piece.wx * dt;
        piece.ry += piece.wy * dt;
        piece.rz += piece.wz * dt;
        const floor = piece.sy * 0.5 + 0.01;
        if (piece.y < floor) {
          piece.y = floor;
          piece.vy = -piece.vy * DEBRIS.bounce;
          piece.vx *= DEBRIS.scrub;
          piece.vz *= DEBRIS.scrub;
          piece.wx *= DEBRIS.scrub;
          piece.wy *= DEBRIS.scrub;
          piece.wz *= DEBRIS.scrub;
          if (Math.hypot(piece.vx, piece.vy, piece.vz) < DEBRIS.restSpeed) {
            piece.resting = true;
            piece.rx = 0;
            piece.rz = 0;
          }
        }
      }
      if (!piece.resting || this.clearing) this.write(slot, piece);
    });
    if (moved) this.object.instanceMatrix.needsUpdate = true;
  }

  private write(slot: number, piece: Piece): void {
    this.rotation.setFromEuler(this.euler.set(piece.rx, piece.ry, piece.rz));
    this.scale.set(piece.sx, piece.sy, piece.sz).multiplyScalar(this.shrink);
    this.object.setMatrixAt(slot, this.matrix.compose(this.position.set(piece.x, piece.y, piece.z), this.rotation, this.scale));
  }

  private finishClear(): void {
    this.pieces.length = 0;
    this.next = 0;
    this.shrink = 1;
    this.clearing = false;
    this.object.count = 0;
  }
}
