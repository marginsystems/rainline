import * as THREE from 'three';
import { stepSpring, UI_SPRINGS, type SpringState } from '../ui-spring.ts';

export const COMIC = {
  words: ['BONK', 'POW', 'YEET', 'WHAM', 'BOOP', 'KAPOW'],
  shout: String.fromCharCode(33),
  fills: ['#ffd23f', '#ff5fa2', '#3ddcff', '#7dff6a', '#ff8a3d', '#c08bff'],
  ink: '#16121f',
  textureSize: 512,
  spikes: 14,
  pool: 8,
  metres: 4.6,
  largestShareOfDistance: 0.28,
  seconds: 0.85,
  fadeFrom: 0.55,
  riseMetresPerSecond: 3.2,
  tiltRadians: 0.28,
  brightness: 1.25,
} as const;

interface Pop {
  readonly sprite: THREE.Sprite;
  readonly scale: SpringState;
  age: number;
}

function wordTexture(word: string, fill: string): THREE.CanvasTexture {
  const size = COMIC.textureSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2d canvas is unavailable');
  context.translate(size / 2, size / 2);
  context.beginPath();
  for (let i = 0; i < COMIC.spikes * 2; i++) {
    const angle = (i / (COMIC.spikes * 2)) * Math.PI * 2;
    const reach = size * (i % 2 === 0 ? 0.47 : 0.33);
    context.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = size * 0.025;
  context.lineJoin = 'round';
  context.strokeStyle = COMIC.ink;
  context.stroke();
  context.rotate(-0.12);
  context.font = `italic 900 ${Math.round(size * (word.length > 5 ? 0.15 : 0.19))}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = size * 0.035;
  context.strokeStyle = '#ffffff';
  context.strokeText(word, 0, 0);
  context.fillStyle = COMIC.ink;
  context.fillText(word, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class ComicPops {
  readonly object = new THREE.Group();
  private readonly pops: Pop[] = [];
  private readonly textures: THREE.CanvasTexture[];
  private next = 0;

  constructor() {
    this.textures = COMIC.words.map((word, i) => wordTexture(`${word}${COMIC.shout}`, COMIC.fills[i % COMIC.fills.length] ?? '#ffffff'));
    for (let i = 0; i < COMIC.pool; i++) {
      const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false, color: new THREE.Color().setScalar(COMIC.brightness) });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.object.add(sprite);
      this.pops.push({ sprite, scale: { x: 0, v: 0 }, age: COMIC.seconds });
    }
  }

  show(x: number, y: number, z: number): void {
    const pop = this.pops[this.next];
    this.next = (this.next + 1) % this.pops.length;
    if (!pop) return;
    pop.sprite.material.map = this.textures[Math.floor(Math.random() * this.textures.length)] ?? null;
    pop.sprite.material.rotation = (Math.random() - 0.5) * 2 * COMIC.tiltRadians;
    pop.sprite.material.opacity = 1;
    pop.sprite.material.needsUpdate = true;
    pop.sprite.position.set(x, y, z);
    pop.sprite.visible = true;
    pop.scale.x = 0;
    pop.scale.v = 0;
    pop.age = 0;
  }

  update(dt: number, viewer: THREE.Vector3): void {
    for (const pop of this.pops) {
      if (!pop.sprite.visible) continue;
      pop.age += dt;
      stepSpring(pop.scale, Math.min(COMIC.metres, pop.sprite.position.distanceTo(viewer) * COMIC.largestShareOfDistance), UI_SPRINGS.bouncy, dt);
      pop.sprite.scale.setScalar(Math.max(0.01, pop.scale.x));
      pop.sprite.position.y += COMIC.riseMetresPerSecond * dt;
      const fade = (pop.age / COMIC.seconds - COMIC.fadeFrom) / (1 - COMIC.fadeFrom);
      pop.sprite.material.opacity = 1 - Math.min(1, Math.max(0, fade));
      if (pop.age >= COMIC.seconds) pop.sprite.visible = false;
    }
  }
}
