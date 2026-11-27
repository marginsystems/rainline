import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createLensShader, GRADE, guardedHighPass, LENS_ABERRATION, LENS_ASPECT, LENS_BLUR, LENS_DROPS, LENS_DROP_SECONDS, LENS_SATURATION, LENS_TIME } from './lens-pass.ts';
import { budgetedPixelRatio, START_LEVEL, tierAt, type QualityTier } from './quality.ts';
import { PlanarReflection, REFLECTED_LAYER, UNREFLECTED_LAYER } from './reflection.ts';

export const RENDER = {
  exposure: 1.15,
  near: 0.3,
  far: 1600,
  bloomStrength: 0.42,
  bloomRadius: 0.7,
  bloomThreshold: 1.0,
  aoIntensity: 0.9,
  aoScale: 0.5,
  aoSamples: 8,
  aoDenoiseSamples: 8,
} as const;

class SceneAoPass extends GTAOPass {
  readonly hidden: THREE.Object3D[] = [];

  override render(...args: Parameters<GTAOPass['render']>): void {
    const shown = this.hidden.filter((object) => object.visible);
    for (const object of shown) object.visible = false;
    super.render(...args);
    for (const object of shown) object.visible = true;
  }

  override setSize(width: number, height: number): void {
    super.setSize(Math.max(2, Math.round(width * RENDER.aoScale)), Math.max(2, Math.round(height * RENDER.aoScale)));
  }
}

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly reflection: PlanarReflection;
  hideFromAo(object: THREE.Object3D): void;
  setLens(blur: number, aberration: number): void;
  setLensDrops(amount: number): void;
  setExposure(exposure: number): void;
  setSaturation(saturation: number): void;
  applyTier(tier: QualityTier): void;
  drawnSize(): { width: number; height: number };
  render(deltaSeconds: number): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDER.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, RENDER.near, RENDER.far);
  camera.layers.enable(REFLECTED_LAYER);
  camera.layers.enable(UNREFLECTED_LAYER);
  scene.add(camera);

  let tier = tierAt(START_LEVEL);
  const reflection = new PlanarReflection();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: tier.msaaSamples }));
  composer.addPass(new RenderPass(scene, camera));
  const ao = new SceneAoPass(scene, camera, 2, 2);
  ao.blendIntensity = RENDER.aoIntensity;
  ao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.4, thickness: 1.6, scale: 1.25, samples: RENDER.aoSamples, screenSpaceRadius: false });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1.5, rings: 2, samples: RENDER.aoDenoiseSamples });
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), RENDER.bloomStrength, RENDER.bloomRadius, RENDER.bloomThreshold);
  bloom.materialHighPassFilter.fragmentShader = guardedHighPass(bloom.materialHighPassFilter.fragmentShader);
  bloom.materialHighPassFilter.needsUpdate = true;
  composer.addPass(bloom);
  const lens = new ShaderPass(createLensShader());
  composer.addPass(lens);
  composer.addPass(new OutputPass());

  let pixelRatio = 1;
  let gradeSeconds = 0;
  let dropSeconds = 0;

  const setLensUniform = (name: string, value: number): void => {
    const uniform = lens.uniforms[name];
    if (uniform) uniform.value = value;
  };

  function resize(): void {
    const width = window.innerWidth, height = window.innerHeight;
    pixelRatio = budgetedPixelRatio(tier, window.devicePixelRatio, width, height);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    reflection.setSize(width * pixelRatio * Math.max(tier.reflectionScale, 0.05), height * pixelRatio * Math.max(tier.reflectionScale, 0.05));
    setLensUniform(LENS_ASPECT, width / height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function applyTier(next: QualityTier): void {
    tier = next;
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      if (target.samples === next.msaaSamples) continue;
      target.samples = next.msaaSamples;
      target.dispose();
    }
    ao.enabled = next.ambientOcclusion;
    bloom.enabled = next.bloom;
    reflection.strength.value = next.reflectionScale > 0 ? 1 : 0;
    resize();
  }

  applyTier(tier);
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    reflection,
    hideFromAo(object) { ao.hidden.push(object); },
    setLens(blur, aberration) {
      setLensUniform(LENS_BLUR, blur);
      setLensUniform(LENS_ABERRATION, aberration);
    },
    setLensDrops(amount) { setLensUniform(LENS_DROPS, amount); },
    setExposure(exposure) { renderer.toneMappingExposure = exposure; },
    setSaturation(saturation) { setLensUniform(LENS_SATURATION, saturation); },
    applyTier,
    drawnSize() {
      return { width: Math.round(window.innerWidth * pixelRatio), height: Math.round(window.innerHeight * pixelRatio) };
    },
    render(deltaSeconds) {
      camera.updateMatrixWorld();
      gradeSeconds = (gradeSeconds + deltaSeconds) % GRADE.grainSeedWrapSeconds;
      setLensUniform(LENS_TIME, gradeSeconds);
      dropSeconds += deltaSeconds;
      setLensUniform(LENS_DROP_SECONDS, dropSeconds);
      renderer.shadowMap.needsUpdate = true;
      if (tier.reflectionScale > 0) reflection.update(renderer, scene, camera);
      composer.render(deltaSeconds);
    },
  };
}
