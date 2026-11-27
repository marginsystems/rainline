import * as THREE from 'three';

export interface ParticleSpawn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  readonly life: number;
  readonly startSize: number;
  readonly endSize: number;
  readonly colour: readonly [number, number, number];
  readonly alpha: number;
}

export interface ParticleOptions {
  readonly capacity: number;
  readonly map: THREE.Texture;
  readonly additive: boolean;
  readonly gravity: number;
  readonly drag: number;
}

const STRIDE = 15;

export class Particles {
  readonly object: THREE.Mesh;
  private readonly state: Float32Array;
  private readonly centres: THREE.InstancedBufferAttribute;
  private readonly colours: THREE.InstancedBufferAttribute;
  private readonly shapes: THREE.InstancedBufferAttribute;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly options: ParticleOptions;
  private alive = 0;

  constructor(options: ParticleOptions) {
    this.options = options;
    this.state = new Float32Array(options.capacity * STRIDE);
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setIndex(quad.getIndex());
    this.geometry.setAttribute('position', quad.getAttribute('position'));
    this.geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.centres = new THREE.InstancedBufferAttribute(new Float32Array(options.capacity * 3), 3);
    this.colours = new THREE.InstancedBufferAttribute(new Float32Array(options.capacity * 4), 4);
    this.shapes = new THREE.InstancedBufferAttribute(new Float32Array(options.capacity * 2), 2);
    for (const attribute of [this.centres, this.colours, this.shapes]) attribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aCentre', this.centres);
    this.geometry.setAttribute('aColour', this.colours);
    this.geometry.setAttribute('aShape', this.shapes);
    this.geometry.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: options.map } },
      transparent: true,
      depthWrite: false,
      blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 aCentre; attribute vec4 aColour; attribute vec2 aShape;
varying vec2 vUv; varying vec4 vColour;
void main(){
  vec4 view = modelViewMatrix * vec4(aCentre, 1.0);
  float c = cos(aShape.y), s = sin(aShape.y);
  view.xy += vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aShape.x;
  gl_Position = projectionMatrix * view;
  vUv = uv;
  vColour = aColour;
}`,
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying vec4 vColour;
void main(){
  vec4 texel = texture2D(uMap, vUv);
  gl_FragColor = vec4(vColour.rgb * texel.rgb, vColour.a * texel.a);
}`,
    });
    this.object = new THREE.Mesh(this.geometry, material);
    this.object.frustumCulled = false;
  }

  spawn(p: ParticleSpawn): void {
    if (this.alive >= this.options.capacity) return;
    this.state.set([p.x, p.y, p.z, p.vx, p.vy, p.vz, 0, p.life, p.startSize, p.endSize, p.colour[0], p.colour[1], p.colour[2], p.alpha, Math.random() * Math.PI * 2], this.alive * STRIDE);
    this.alive++;
  }

  update(dt: number): void {
    const s = this.state, centres = this.centres.array, colours = this.colours.array, shapes = this.shapes.array;
    const drag = Math.exp(-this.options.drag * dt);
    const at = (index: number): number => s[index] ?? 0;
    let write = 0;
    for (let read = 0; read < this.alive; read++) {
      const r = read * STRIDE;
      const age = at(r + 6) + dt, life = at(r + 7);
      if (age >= life) continue;
      const vx = at(r + 3) * drag, vy = (at(r + 4) - this.options.gravity * dt) * drag, vz = at(r + 5) * drag;
      const x = at(r) + vx * dt, y = Math.max(0.05, at(r + 1) + vy * dt), z = at(r + 2) + vz * dt;
      const startSize = at(r + 8), endSize = at(r + 9), red = at(r + 10), green = at(r + 11), blue = at(r + 12), alpha = at(r + 13), spin = at(r + 14);
      s.set([x, y, z, vx, vy, vz, age, life, startSize, endSize, red, green, blue, alpha, spin], write * STRIDE);
      const t = age / life;
      centres.set([x, y, z], write * 3);
      colours.set([red, green, blue, alpha * (1 - t) * Math.min(1, t * 12)], write * 4);
      shapes.set([startSize + (endSize - startSize) * t, spin + t * 0.8], write * 2);
      write++;
    }
    this.alive = write;
    this.geometry.instanceCount = write;
    this.centres.needsUpdate = true;
    this.colours.needsUpdate = true;
    this.shapes.needsUpdate = true;
  }
}
