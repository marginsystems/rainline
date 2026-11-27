import * as THREE from 'three';

export const REFLECTED_LAYER = 0;
export const UNREFLECTED_LAYER = 1;
export const REFLECTION_MSAA_SAMPLES = 4;

export class PlanarReflection {
  readonly target: THREE.WebGLRenderTarget;
  readonly textureMatrix = new THREE.Matrix4();
  readonly strength: THREE.IUniform<number> = { value: 1 };
  private readonly mirrored = new THREE.PerspectiveCamera();
  private readonly eye = new THREE.Vector3();
  private readonly rotation = new THREE.Matrix4();
  private readonly ahead = new THREE.Vector3();

  constructor() {
    this.target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, samples: REFLECTION_MSAA_SAMPLES });
    this.mirrored.layers.set(REFLECTED_LAYER);
  }

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(2, Math.floor(width)), Math.max(2, Math.floor(height)));
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    if (this.eye.y <= 0) return;
    this.rotation.extractRotation(camera.matrixWorld);
    this.ahead.set(0, 0, -1).applyMatrix4(this.rotation).add(this.eye);
    const mirrored = this.mirrored;
    mirrored.position.set(this.eye.x, -this.eye.y, this.eye.z);
    mirrored.up.set(0, 1, 0).applyMatrix4(this.rotation);
    mirrored.up.y *= -1;
    mirrored.lookAt(this.ahead.x, -this.ahead.y, this.ahead.z);
    mirrored.near = camera.near;
    mirrored.far = camera.far;
    mirrored.updateMatrixWorld();
    mirrored.projectionMatrix.copy(camera.projectionMatrix);
    mirrored.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirrored.projectionMatrix).multiply(mirrored.matrixWorldInverse);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, mirrored);
    renderer.setRenderTarget(previous);
  }
}
