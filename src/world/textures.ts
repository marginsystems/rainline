import * as THREE from 'three';
import { seededRandom } from './random.ts';
import { SURFACES } from './surfaces.ts';

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2d canvas is unavailable');
  return { canvas, context };
}

function textureOf(canvas: HTMLCanvasElement, colour: boolean): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  if (colour) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function radialGlowTexture(): THREE.CanvasTexture {
  const { canvas, context } = canvasOf(128, 128);
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return textureOf(canvas, false);
}

export function smokeTexture(): THREE.CanvasTexture {
  const size = 128;
  const { canvas, context } = canvasOf(size, size);
  const random = seededRandom(41);
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2, reach = random() * size * 0.2;
    const x = size / 2 + Math.cos(angle) * reach, y = size / 2 + Math.sin(angle) * reach;
    const radius = size * (0.2 + random() * 0.12);
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return textureOf(canvas, false);
}

export function headlightBeamTexture(): THREE.CanvasTexture {
  const width = 128, height = 256;
  const { canvas, context } = canvasOf(width, height);
  for (const centre of [0.36, 0.64]) {
    context.save();
    context.translate(width * centre, height * 0.98);
    context.scale(0.2, 1);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, height * 0.95);
    gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.28)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(-width * 4, -height, width * 8, height);
    context.restore();
  }
  context.globalCompositeOperation = 'destination-in';
  const start = context.createLinearGradient(0, height, 0, height * 0.86);
  start.addColorStop(0, 'rgba(255,255,255,0)');
  start.addColorStop(1, 'rgba(255,255,255,1)');
  context.fillStyle = start;
  context.fillRect(0, 0, width, height);
  const sides = context.createLinearGradient(0, 0, width, 0);
  sides.addColorStop(0, 'rgba(255,255,255,0)');
  sides.addColorStop(0.2, 'rgba(255,255,255,1)');
  sides.addColorStop(0.8, 'rgba(255,255,255,1)');
  sides.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = sides;
  context.fillRect(0, 0, width, height);
  return textureOf(canvas, false);
}

export function edgeGlowTexture(): THREE.CanvasTexture {
  const { canvas, context } = canvasOf(64, 4);
  const gradient = context.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 4);
  return textureOf(canvas, false);
}

export const KERB_PAINT = {
  white: '#b0b0a8',
  red: '#8e241e',
} as const;

export function kerbPaintTexture(): THREE.CanvasTexture {
  const { canvas, context } = canvasOf(4, 64);
  context.fillStyle = KERB_PAINT.white;
  context.fillRect(0, 0, 4, 32);
  context.fillStyle = KERB_PAINT.red;
  context.fillRect(0, 32, 4, 32);
  const texture = textureOf(canvas, true);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = SURFACES.anisotropy;
  return texture;
}

export function checkerTexture(columns: number, rows: number): THREE.CanvasTexture {
  const cell = 16;
  const { canvas, context } = canvasOf(columns * cell, rows * cell);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? '#f2f2f2' : '#0b0b0d';
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const texture = textureOf(canvas, true);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

export function bannerTexture(text: string): THREE.CanvasTexture {
  const { canvas, context } = canvasOf(1024, 128);
  context.fillStyle = '#07080c';
  context.fillRect(0, 0, 1024, 128);
  for (let x = 0; x < 6; x++) {
    for (let y = 0; y < 4; y++) {
      if ((x + y) % 2 === 0) continue;
      context.fillStyle = '#f4f4f4';
      context.fillRect(x * 32, y * 32, 32, 32);
      context.fillRect(1024 - (x + 1) * 32, y * 32, 32, 32);
    }
  }
  context.fillStyle = '#ffffff';
  context.font = 'italic 900 84px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 512, 68);
  return textureOf(canvas, true);
}

export const FOLIAGE_PAINT = {
  frondSize: [256, 512],
  frondTwigs: 26,
  frondNeedlesPerTwig: 46,
  frondSeed: 61,
  needleGreens: [[20, 46, 26], [28, 60, 32], [36, 74, 40], [46, 84, 44]],
  twigColour: 'rgb(38,28,20)',
  underColour: 'rgba(16,36,22,0.96)',
  leafSize: 256,
  leafCount: 340,
  leafSeed: 67,
  leafGreens: [[24, 50, 22], [34, 66, 28], [46, 82, 34], [60, 94, 40], [72, 100, 46]],
} as const;

const rgb = (colour: readonly number[], shade: number): string => `rgb(${Math.round((colour[0] ?? 0) * shade)},${Math.round((colour[1] ?? 0) * shade)},${Math.round((colour[2] ?? 0) * shade)})`;

function mipped(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

export function pineFrondTexture(): THREE.CanvasTexture {
  const [width, height] = FOLIAGE_PAINT.frondSize;
  const { canvas, context } = canvasOf(width, height);
  const random = seededRandom(FOLIAGE_PAINT.frondSeed);
  const twigs: { x: number; y: number; dx: number; dy: number; length: number }[] = [{ x: width / 2, y: height, dx: 0, dy: -1, length: height * 0.97 }];
  for (let i = 0; i < FOLIAGE_PAINT.frondTwigs; i++) {
    const p = (i + 0.5) / FOLIAGE_PAINT.frondTwigs;
    const sign = i % 2 === 0 ? 1 : -1;
    const angle = 0.75 + random() * 0.3;
    twigs.push({ x: width / 2, y: height * (1 - p * 0.94), dx: Math.sin(angle) * sign, dy: -Math.cos(angle), length: width * 0.56 * (1 - p * 0.7) * (0.8 + random() * 0.3) });
  }
  context.lineCap = 'round';
  for (const twig of twigs) {
    context.strokeStyle = FOLIAGE_PAINT.underColour;
    context.lineWidth = 15;
    context.beginPath();
    context.moveTo(twig.x, twig.y);
    context.lineTo(twig.x + twig.dx * twig.length, twig.y + twig.dy * twig.length);
    context.stroke();
  }
  for (const twig of twigs) {
    context.strokeStyle = FOLIAGE_PAINT.twigColour;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(twig.x, twig.y);
    context.lineTo(twig.x + twig.dx * twig.length, twig.y + twig.dy * twig.length);
    context.stroke();
    const needles = Math.round(FOLIAGE_PAINT.frondNeedlesPerTwig * (twig.length / (width * 0.5)));
    for (let n = 0; n < needles; n++) {
      const at = random() * twig.length;
      const x = twig.x + twig.dx * at, y = twig.y + twig.dy * at;
      const swing = (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
      const cos = Math.cos(swing), sin = Math.sin(swing);
      const reach = 9 + random() * 9;
      const colour = FOLIAGE_PAINT.needleGreens[Math.floor(random() * FOLIAGE_PAINT.needleGreens.length)] ?? FOLIAGE_PAINT.needleGreens[0];
      context.strokeStyle = rgb(colour, 0.8 + random() * 0.4);
      context.lineWidth = 1.6 + random();
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + (twig.dx * cos - twig.dy * sin) * reach, y + (twig.dx * sin + twig.dy * cos) * reach);
      context.stroke();
    }
  }
  return mipped(textureOf(canvas, true));
}

export function leafClusterTexture(): THREE.CanvasTexture {
  const size = FOLIAGE_PAINT.leafSize;
  const { canvas, context } = canvasOf(size, size);
  const random = seededRandom(FOLIAGE_PAINT.leafSeed);
  for (let i = 0; i < FOLIAGE_PAINT.leafCount; i++) {
    const depth = i / FOLIAGE_PAINT.leafCount;
    const angle = random() * Math.PI * 2, reach = Math.sqrt(random()) * size * 0.43;
    const colour = FOLIAGE_PAINT.leafGreens[Math.floor(random() * FOLIAGE_PAINT.leafGreens.length)] ?? FOLIAGE_PAINT.leafGreens[0];
    context.save();
    context.translate(size / 2 + Math.cos(angle) * reach, size / 2 + Math.sin(angle) * reach);
    context.rotate(random() * Math.PI);
    context.fillStyle = rgb(colour, 0.45 + depth * 0.7);
    context.beginPath();
    context.ellipse(0, 0, 7 + random() * 6, 3.5 + random() * 3, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  return mipped(textureOf(canvas, true));
}
