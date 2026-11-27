import * as THREE from 'three';
import { locate, type Track } from '../../sim/track.ts';
import { between, seededRandom, type Random } from './random.ts';
import { bannerTexture } from './textures.ts';

export const SKYLINE = {
  towers: 230,
  centre: [-10, 70],
  innerRadius: 440,
  outerRadius: 900,
  trackClearance: 125,
  windowMetres: [2.4, 3.2],
  litShare: 0.2,
  officeFloorBoost: 2.4,
  officeShare: 0.45,
  darkFloorShare: 0.3,
  wall: [0.013, 0.014, 0.018],
  wallSpread: 0.7,
  glass: [0.012, 0.017, 0.027],
  streetGlow: [0.06, 0.038, 0.018],
  streetGlowMetres: 30,
  windowGain: 1.05,
  crownGain: 1,
  crownMetres: 1.8,
  crownColours: [[0.5, 0.45, 0.36], [0.32, 0.36, 0.44], [0.6, 0.42, 0.22], [0.14, 0.14, 0.15], [0.14, 0.14, 0.15]],
  beaconColour: [3.2, 0.25, 0.2],
  beaconMetres: 3,
  spireMetres: 3,
  setbackShare: 0.72,
  topShare: 0.5,
  spireShare: 0.35,
  billboards: 12,
  billboardSize: [34, 13],
  billboardGain: 2.6,
  billboardWords: ['KALDERA', 'RAINLINE', 'NOVA', 'DRIFT 24H'],
} as const;

export interface TowerBox {
  readonly x: number;
  readonly z: number;
  readonly base: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly yaw: number;
  readonly seed: number;
  readonly crown: readonly [number, number, number];
}

const TOWER_VERTEX = `#include <common>
#include <fog_pars_vertex>
attribute float aSeed; attribute vec3 aCrown;
varying vec2 vWindow; varying float vSeed; varying float vRoof; varying float vRise; varying float vBelowTop; varying float vAboveBase; varying vec3 vCrown;
void main(){
  vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec2 face = abs(normal.x) > 0.5 ? size.zy : size.xy;
  vWindow = uv * face / vec2(${SKYLINE.windowMetres[0].toFixed(2)}, ${SKYLINE.windowMetres[1].toFixed(2)});
  vRoof = abs(normal.y);
  vRise = uv.y;
  vBelowTop = (1.0 - uv.y) * size.y;
  vAboveBase = (instanceMatrix * vec4(position, 1.0)).y;
  vSeed = aSeed;
  vCrown = aCrown;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WARM_DIM = 'vec3(1.0, 0.6, 0.28)';
const WARM_BRIGHT = 'vec3(1.0, 0.85, 0.64)';
const COOL_OFFICE = 'vec3(0.74, 0.87, 1.0)';

const TOWER_FRAGMENT = `#include <common>
#include <fog_pars_fragment>
uniform vec3 uWall; uniform vec3 uGlass; uniform vec3 uStreetGlow; uniform float uStreetGlowMetres; uniform float uWallSpread;
uniform float uLit; uniform float uOfficeBoost; uniform float uOfficeShare; uniform float uDarkFloors; uniform float uGain; uniform float uCrownGain; uniform float uCrownMetres;
varying vec2 vWindow; varying float vSeed; varying float vRoof; varying float vRise; varying float vBelowTop; varying float vAboveBase; varying vec3 vCrown;
float towerHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main(){
  vec2 cell = floor(vWindow), f = fract(vWindow);
  vec2 soft = fwidth(vWindow) * 1.2;
  float office = step(1.0 - uOfficeShare, towerHash(vec2(vSeed * 91.0, 3.0)));
  float floorSeed = towerHash(vec2(cell.y * 3.1, vSeed * 13.0));
  float floorOn = step(uDarkFloors, floorSeed);
  float share = uLit * mix(1.0, uOfficeBoost, office * step(0.62, floorSeed));
  float lit = step(1.0 - share, towerHash(cell + vSeed * 31.0)) * floorOn;
  float across = smoothstep(0.1 - soft.x, 0.1 + soft.x, f.x) * smoothstep(0.9 + soft.x, 0.9 - soft.x, f.x);
  float up = smoothstep(0.22 - soft.y, 0.22 + soft.y, f.y) * smoothstep(0.82 + soft.y, 0.82 - soft.y, f.y);
  float pane = across * up;
  vec3 warm = mix(${WARM_DIM}, ${WARM_BRIGHT}, towerHash(cell.yx + vSeed * 7.0));
  vec3 tint = mix(warm, ${COOL_OFFICE}, office * 0.85);
  float level = 0.12 + 1.1 * pow(max(towerHash(cell * 1.7 + 3.0), 0.0), 2.0);
  float blind = mix(1.0, 0.35, step(0.5, towerHash(cell * 2.3 + vSeed)) * smoothstep(0.45, 0.6, f.y));
  vec3 panes = tint * lit * pane * level * blind;
  vec3 blurred = mix(${WARM_BRIGHT}, ${COOL_OFFICE}, office * 0.85) * share * (1.0 - uDarkFloors) * 0.3;
  float detail = 1.0 - smoothstep(0.3, 0.8, max(soft.x, soft.y));
  vec3 wall = uWall * (1.0 + uWallSpread * (towerHash(vec2(vSeed * 17.0, 9.0)) - 0.5)) * (1.25 - 0.5 * vRise);
  wall += uStreetGlow * exp(-max(vAboveBase, 0.0) / uStreetGlowMetres) * (1.0 - vRoof);
  vec3 glass = uGlass * (0.5 + vRise) * pane * (1.0 - lit) * detail * (1.0 - vRoof);
  vec3 colour = wall + glass + mix(blurred, panes, detail) * uGain * (1.0 - vRoof);
  float crown = (1.0 - smoothstep(uCrownMetres - 0.2, uCrownMetres + 0.2, vBelowTop)) * (1.0 - vRoof);
  colour += vCrown * uCrownGain * crown;
  gl_FragColor = vec4(colour, 1.0);
  #include <fog_fragment>
}`;

function stack(random: Random, x: number, z: number, yaw: number, height: number, width: number, depth: number): TowerBox[] {
  const seed = random();
  const crown = SKYLINE.crownColours[Math.floor(random() * SKYLINE.crownColours.length)] ?? SKYLINE.crownColours[0];
  const dark: readonly [number, number, number] = [0, 0, 0];
  const setback = random() < SKYLINE.setbackShare, top = setback && random() < SKYLINE.topShare;
  const first = setback ? height * between(random, 0.5, 0.74) : height;
  const second = top ? height * between(random, 0.82, 0.93) : height;
  const boxes: TowerBox[] = [{ x, z, base: 0, width, depth, height: first, yaw, seed, crown: setback ? crown : dark }];
  if (setback) boxes.push({ x, z, base: first, width: width * 0.78, depth: depth * 0.78, height: second - first, yaw, seed: seed + 0.37, crown: top ? dark : crown });
  if (top) boxes.push({ x, z, base: second, width: width * 0.5, depth: depth * 0.5, height: height - second, yaw, seed: seed + 0.71, crown });
  return boxes;
}

export interface SkylinePlan {
  readonly boxes: TowerBox[];
  readonly spires: { x: number; z: number; base: number; height: number }[];
  readonly billboards: { x: number; z: number; y: number; yaw: number }[];
}

export function planSkyline(track: Track): SkylinePlan {
  const random = seededRandom(97);
  const plan: SkylinePlan = { boxes: [], spires: [], billboards: [] };
  let towers = 0;
  for (let attempt = 0; attempt < SKYLINE.towers * 8 && towers < SKYLINE.towers; attempt++) {
    const angle = random() * Math.PI * 2;
    const far = random();
    const radius = SKYLINE.innerRadius + (SKYLINE.outerRadius - SKYLINE.innerRadius) * far;
    const x = SKYLINE.centre[0] + Math.cos(angle) * radius, z = SKYLINE.centre[1] + Math.sin(angle) * radius;
    if (Math.abs(locate(track, x, z, null).lateral) < SKYLINE.trackClearance) continue;
    const height = between(random, 45, 115) + far * between(random, 20, 200);
    const width = between(random, 24, 48), depth = between(random, 24, 48);
    const signed = far < 0.25 && plan.billboards.length < SKYLINE.billboards;
    const facing = Math.atan2(SKYLINE.centre[0] - x, SKYLINE.centre[1] - z);
    const yaw = signed ? facing : random() * Math.PI;
    plan.boxes.push(...stack(random, x, z, yaw, height, width, depth));
    if (signed) plan.billboards.push({ x: x + Math.sin(facing) * (depth / 2 + 0.8), z: z + Math.cos(facing) * (depth / 2 + 0.8), y: Math.min(height * 0.5, 46), yaw: facing });
    if (height > 150 && random() < SKYLINE.spireShare) plan.spires.push({ x, z, base: height, height: between(random, 18, 44) });
    towers++;
  }
  return plan;
}

export function buildSkyline(track: Track): THREE.Group {
  const plan = planSkyline(track);
  const group = new THREE.Group();
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uWall: { value: new THREE.Vector3(...SKYLINE.wall) }, uLit: { value: SKYLINE.litShare }, uDarkFloors: { value: SKYLINE.darkFloorShare },
      uGain: { value: SKYLINE.windowGain }, uCrownGain: { value: SKYLINE.crownGain }, uCrownMetres: { value: SKYLINE.crownMetres },
      uGlass: { value: new THREE.Vector3(...SKYLINE.glass) }, uStreetGlow: { value: new THREE.Vector3(...SKYLINE.streetGlow) }, uStreetGlowMetres: { value: SKYLINE.streetGlowMetres },
      uWallSpread: { value: SKYLINE.wallSpread }, uOfficeBoost: { value: SKYLINE.officeFloorBoost }, uOfficeShare: { value: SKYLINE.officeShare },
    }]),
    vertexShader: TOWER_VERTEX,
    fragmentShader: TOWER_FRAGMENT,
    fog: true,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const seeds = new Float32Array(plan.boxes.length), crowns = new Float32Array(plan.boxes.length * 3);
  const towers = new THREE.InstancedMesh(geometry, material, plan.boxes.length);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  plan.boxes.forEach((box, i) => {
    rotation.setFromAxisAngle(up, box.yaw);
    towers.setMatrixAt(i, matrix.compose(position.set(box.x, box.base + box.height / 2, box.z), rotation, scale.set(box.width, box.height, box.depth)));
    seeds[i] = box.seed;
    crowns.set(box.crown, i * 3);
  });
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aCrown', new THREE.InstancedBufferAttribute(crowns, 3));
  towers.instanceMatrix.needsUpdate = true;
  towers.frustumCulled = false;

  const metal = new THREE.MeshBasicMaterial({ color: 0x06070c });
  const spires = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), metal, plan.spires.length);
  const beacons = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...SKYLINE.beaconColour) }), plan.spires.length);
  rotation.identity();
  plan.spires.forEach((spire, i) => {
    spires.setMatrixAt(i, matrix.compose(position.set(spire.x, spire.base + spire.height / 2, spire.z), rotation, scale.set(SKYLINE.spireMetres, spire.height, SKYLINE.spireMetres)));
    beacons.setMatrixAt(i, matrix.compose(position.set(spire.x, spire.base + spire.height + SKYLINE.beaconMetres / 2, spire.z), rotation, scale.setScalar(SKYLINE.beaconMetres)));
  });
  spires.frustumCulled = false;
  beacons.frustumCulled = false;
  group.add(towers, spires, beacons);

  const board = new THREE.PlaneGeometry(...SKYLINE.billboardSize);
  const tints: readonly (readonly [number, number, number])[] = SKYLINE.crownColours;
  plan.billboards.forEach((billboard, i) => {
    const tint = tints[i % tints.length] ?? tints[0];
    const word = SKYLINE.billboardWords[i % SKYLINE.billboardWords.length] ?? 'RAINLINE';
    const sign = new THREE.Mesh(board, new THREE.MeshBasicMaterial({ map: bannerTexture(word), color: new THREE.Color().setRGB((tint?.[0] ?? 1) * SKYLINE.billboardGain * 0.5, (tint?.[1] ?? 1) * SKYLINE.billboardGain * 0.5, (tint?.[2] ?? 1) * SKYLINE.billboardGain * 0.5) }));
    sign.position.set(billboard.x, billboard.y, billboard.z);
    sign.rotation.y = billboard.yaw;
    group.add(sign);
  });
  return group;
}
