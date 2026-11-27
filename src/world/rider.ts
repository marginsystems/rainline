import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CarInput, CarState } from '../../sim/car.ts';
import { clamp, damp } from '../../sim/math.ts';
import { CarDamage } from './car-damage.ts';
import type { CarVisual } from './car-model.ts';

export const RIDER = {
  bikeUrl: 'models/rider/motorcycle.glb',
  bikeScale: 1,
  characterUrl: 'models/rider/shiba.glb',
  characterScale: 0.016,
  rideClip: 'Ride',
  seat: [0, 1.0, -0.42],
  hipBone: 'pelvis_jnt6_04',
  thighBones: ['R_shoulder_jnt115_0111', 'L_shoulder_jnt105_0101'],
  shinBones: ['R_elbow_jnt116_0112', 'L_elbow_jnt106_0102'],
  wheelRadius: 0.32,
  frontWheelZ: 0.8,
  rearWheelZ: -0.71,
  leanPerLateralAccel: 0.03,
  maxLean: 0.62,
  steerAngle: 0.4,
  kickSwing: 1.4,
  kickStraighten: 0,
  kickDecay: 4.5,
  kickLeanAway: 0.2,
  kickBodyTilt: 0.5,
  environmentIntensity: 1.6,
  debris: [0x1f4fa8, 0x2a2c30, 0x8d8f94],
} as const;

export interface Rider extends CarVisual {
  kick(side: 1 | -1): void;
}

export async function loadRider(): Promise<Rider> {
  const loader = new GLTFLoader();
  const [bikeFile, characterFile] = await Promise.all([loader.loadAsync(RIDER.bikeUrl), loader.loadAsync(RIDER.characterUrl)]);
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);

  const bike = bikeFile.scene;
  bike.scale.setScalar(RIDER.bikeScale);
  const character = characterFile.scene;
  character.scale.setScalar(RIDER.characterScale);
  for (const model of [bike, character]) {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = RIDER.environmentIntensity;
    });
  }
  const frontWheel = bike.getObjectByName('wheel-front') ?? new THREE.Group();
  const rearWheel = bike.getObjectByName('wheel-back') ?? new THREE.Group();
  const fork = bike.getObjectByName('fork') ?? new THREE.Group();

  const seated = new THREE.Group();
  seated.add(character);
  lean.add(bike, seated);

  const mixer = new THREE.AnimationMixer(character);
  const clip = characterFile.animations.find((candidate) => candidate.name === RIDER.rideClip) ?? characterFile.animations[0];
  if (clip) mixer.clipAction(clip).play();
  mixer.update(0);
  root.updateMatrixWorld(true);
  const hips = character.getObjectByName(RIDER.hipBone);
  if (hips) {
    const at = hips.getWorldPosition(new THREE.Vector3());
    character.position.set(-at.x, -at.y, -at.z);
    seated.position.set(...RIDER.seat);
  }
  const thighs = RIDER.thighBones.map((name) => character.getObjectByName(name) ?? null);
  const shins = RIDER.shinBones.map((name) => character.getObjectByName(name) ?? null);

  const kicks = [0, 0];
  let leaning = 0;
  const forward = new THREE.Vector3(), swing = new THREE.Quaternion(), parentTurn = new THREE.Quaternion(), straight = new THREE.Quaternion();

  return {
    root,
    overlays: [],
    damage: new CarDamage(new THREE.Group()),
    wheels: [{ x: 0, z: RIDER.frontWheelZ, rear: false }, { x: 0, z: RIDER.rearWheelZ, rear: true }],
    exhausts: [new THREE.Vector3(0.2, 0.45, -1.2)],
    debrisColours: RIDER.debris.map((colour) => new THREE.Color(colour)),
    place(x, z, yaw) {
      root.position.set(x, 0, z);
      root.rotation.y = yaw;
    },
    kick(side) {
      kicks[side > 0 ? 1 : 0] = 1;
    },
    update(car: CarState, _input: CarInput, _wallAheadMetres: number, dt: number) {
      const kickLean = ((kicks[1] ?? 0) - (kicks[0] ?? 0)) * RIDER.kickLeanAway;
      leaning = damp(leaning, clamp(car.latAccel * RIDER.leanPerLateralAccel, -RIDER.maxLean, RIDER.maxLean), 8, dt);
      lean.rotation.z = -leaning + kickLean;
      seated.rotation.z = ((kicks[1] ?? 0) - (kicks[0] ?? 0)) * RIDER.kickBodyTilt;
      fork.rotation.y = car.steer * RIDER.steerAngle;
      const turn = (car.forwardSpeed / RIDER.wheelRadius) * dt;
      frontWheel.rotation.x += turn;
      rearWheel.rotation.x += turn + car.wheelSpin * dt * 30;
      mixer.update(dt);
      root.getWorldDirection(forward);
      kicks.forEach((amount, i) => {
        const thigh = thighs[i], shin = shins[i];
        if (amount > 0 && thigh?.parent) {
          swing.setFromAxisAngle(forward, (i === 0 ? -1 : 1) * amount * RIDER.kickSwing);
          thigh.parent.getWorldQuaternion(parentTurn);
          thigh.quaternion.premultiply(parentTurn).premultiply(swing).premultiply(parentTurn.invert());
          if (shin) shin.quaternion.slerp(straight, amount * RIDER.kickStraighten);
        }
        const next = damp(amount, 0, RIDER.kickDecay, dt);
        kicks[i] = next < 0.01 ? 0 : next;
      });
    },
    localToWorld(x, y, z, out) {
      return root.localToWorld(out.set(x, y, z));
    },
  };
}
