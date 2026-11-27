import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CarInput, CarState } from '../../sim/car.ts';
import { clamp, damp } from '../../sim/math.ts';
import { UNREFLECTED_LAYER } from '../render/reflection.ts';
import { CarDamage } from './car-damage.ts';
import { lightConeGeometry, lightConeMaterial } from './light-cone.ts';
import { headlightBeamTexture, radialGlowTexture } from './textures.ts';

export const CAR_LOOK = {
  url: 'models/car.glb',
  steerAngle: 0.52,
  rollPerLateralAccel: 0.0032,
  maxRoll: 0.075,
  pitchPerAccel: 0.0022,
  maxPitch: 0.05,
  wheelspinSpeed: 14,
  environmentIntensity: 2.6,
  headlightEmissive: 5,
  tailEmissive: 1.3,
  brakeEmissive: 6,
  tailColour: [1, 0.012, 0.004],
  roughnessFloor: 0.32,
  glassRoughnessFloor: 0.14,
  coatRoughnessFloor: 0.2,
  headlampIntensity: 40,
  headlampReach: 80,
  headlampDecay: 1,
  headlampAngle: 0.24,
  headlampPenumbra: 0.8,
  headlampAim: [0.6, 0.55, 30],
  headlampX: 0.52,
  headlampY: 0.79,
  headlampZ: 2.3,
  headlampNearWallMetres: 6,
  headlampNearWallShare: 0.12,
  beamConeLength: 15,
  beamConeRadius: 1.9,
  beamConeStrength: 0.12,
  overlayHeight: 0.006,
  beamSize: [9, 24],
  beamColour: [1, 0.93, 0.8],
  beamOpacity: 0.36,
  beamStartZ: 2.2,
  brakeGlowIntensity: 7,
  brakeGlowBehind: 3.7,
  underglow: [0.08, 1.1, 1.9],
  underglowSize: [3.6, 6],
  underglowOpacity: 0,
  fallbackWheelRadius: 0.31,
  fallbackExhausts: [[-0.44, 0.19, -2.2], [0.44, 0.19, -2.2]],
  fallbackPaint: 0xc8bea4,
  hood: [0, 0.82, 1.35],
} as const;

interface Wheel {
  readonly pivot: THREE.Object3D;
  readonly spin: THREE.Object3D;
  readonly front: boolean;
}

export interface WheelPoint {
  readonly x: number;
  readonly z: number;
  readonly rear: boolean;
}

export interface CarVisual {
  readonly root: THREE.Group;
  readonly overlays: THREE.Object3D[];
  readonly damage: CarDamage;
  readonly wheels: readonly WheelPoint[];
  readonly exhausts: readonly THREE.Vector3[];
  readonly debrisColours: readonly THREE.Color[];
  update(car: CarState, input: CarInput, wallAheadMetres: number, dt: number): void;
  place(x: number, z: number, yaw: number): void;
  localToWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3;
}

function standardMaterials(object: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const found = new Set<THREE.MeshStandardMaterial>();
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) found.add(material);
  });
  return [...found];
}

export async function loadCar(): Promise<CarVisual> {
  const gltf = await new GLTFLoader().loadAsync(CAR_LOOK.url);
  const root = new THREE.Group();
  const chassis = new THREE.Group();
  root.add(chassis);
  const wheels: Wheel[] = [];
  const exhausts: THREE.Vector3[] = [];
  for (const node of [...gltf.scene.children]) {
    if (node.name.startsWith('Wheel')) {
      const spin = node.children.find((child) => child.name.endsWith('_Spin')) ?? node;
      wheels.push({ pivot: node, spin, front: node.position.z > 0 });
      root.add(node);
    } else if (node.name.startsWith('Exhaust')) exhausts.push(node.position.clone());
    else chassis.add(node);
  }
  if (exhausts.length === 0) for (const point of CAR_LOOK.fallbackExhausts) exhausts.push(new THREE.Vector3(...point));
  const wheelRadius = wheels[0]?.pivot.position.y ?? CAR_LOOK.fallbackWheelRadius;

  const materials = standardMaterials(root);
  const named = (name: string): THREE.MeshStandardMaterial[] => materials.filter((material) => material.name === name);
  for (const material of materials) {
    material.envMapIntensity = CAR_LOOK.environmentIntensity;
    material.roughness = Math.max(material.roughness, material.name === 'Glass' ? CAR_LOOK.glassRoughnessFloor : CAR_LOOK.roughnessFloor);
    if (material instanceof THREE.MeshPhysicalMaterial) material.clearcoatRoughness = Math.max(material.clearcoatRoughness, CAR_LOOK.coatRoughnessFloor);
  }
  for (const material of named('Headlight')) {
    material.emissive.setRGB(1, 0.95, 0.85);
    material.emissiveIntensity = CAR_LOOK.headlightEmissive;
  }
  const tails = named('Taillight');
  for (const material of tails) material.emissive.setRGB(...CAR_LOOK.tailColour);
  const paint = named('Paint')[0]?.color.clone() ?? new THREE.Color(CAR_LOOK.fallbackPaint);

  const lamps: THREE.SpotLight[] = [];
  const cones: THREE.Mesh[] = [];
  const coneGeometry = lightConeGeometry(CAR_LOOK.beamConeRadius, CAR_LOOK.beamConeLength).rotateX(-Math.PI / 2);
  const coneMaterial = lightConeMaterial(CAR_LOOK.beamColour, CAR_LOOK.beamConeStrength);
  for (const side of [-1, 1]) {
    const lamp = new THREE.SpotLight(0xfff1d6, CAR_LOOK.headlampIntensity, CAR_LOOK.headlampReach, CAR_LOOK.headlampAngle, CAR_LOOK.headlampPenumbra, CAR_LOOK.headlampDecay);
    lamp.position.set(side * CAR_LOOK.headlampX, CAR_LOOK.headlampY, CAR_LOOK.headlampZ);
    lamp.target.position.set(side * CAR_LOOK.headlampAim[0], CAR_LOOK.headlampAim[1], CAR_LOOK.headlampAim[2]);
    root.add(lamp, lamp.target);
    lamps.push(lamp);
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.position.set(side * CAR_LOOK.headlampX, CAR_LOOK.headlampY, CAR_LOOK.headlampZ - 0.3);
    cone.rotation.x = 0.03;
    cone.layers.set(UNREFLECTED_LAYER);
    root.add(cone);
    cones.push(cone);
  }
  const brakeGlow = new THREE.PointLight(0xff2010, 0, 9, 2);
  brakeGlow.position.set(0, 0.9, -CAR_LOOK.brakeGlowBehind);
  chassis.add(brakeGlow);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(...CAR_LOOK.underglowSize).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: radialGlowTexture(), color: new THREE.Color().setRGB(...CAR_LOOK.underglow), transparent: true, opacity: CAR_LOOK.underglowOpacity, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  );
  glow.position.y = CAR_LOOK.overlayHeight;
  glow.layers.set(UNREFLECTED_LAYER);
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(...CAR_LOOK.beamSize).rotateX(-Math.PI / 2).rotateY(Math.PI),
    new THREE.MeshBasicMaterial({ map: headlightBeamTexture(), color: new THREE.Color().setRGB(...CAR_LOOK.beamColour), transparent: true, opacity: CAR_LOOK.beamOpacity, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }),
  );
  beam.position.set(0, CAR_LOOK.overlayHeight, CAR_LOOK.beamStartZ + CAR_LOOK.beamSize[1] / 2);
  beam.layers.set(UNREFLECTED_LAYER);
  root.add(glow, beam);

  let roll = 0, pitch = 0, brakeLevel = 0;

  return {
    root,
    overlays: [glow, beam, ...cones],
    damage: new CarDamage(chassis),
    wheels: wheels.map((wheel) => ({ x: wheel.pivot.position.x, z: wheel.pivot.position.z, rear: !wheel.front })),
    exhausts,
    debrisColours: [paint, paint, new THREE.Color(0x0b0b0e), new THREE.Color(0x2a2d33)],
    place(x, z, yaw) {
      root.position.set(x, 0, z);
      root.rotation.y = yaw;
    },
    update(car, input, wallAheadMetres, dt) {
      const open = clamp(wallAheadMetres / CAR_LOOK.headlampNearWallMetres, CAR_LOOK.headlampNearWallShare, 1);
      for (const lamp of lamps) lamp.intensity = CAR_LOOK.headlampIntensity * open;
      roll = damp(roll, clamp(car.latAccel * CAR_LOOK.rollPerLateralAccel, -CAR_LOOK.maxRoll, CAR_LOOK.maxRoll), 7, dt);
      pitch = damp(pitch, clamp(-car.longAccel * CAR_LOOK.pitchPerAccel, -CAR_LOOK.maxPitch, CAR_LOOK.maxPitch), 7, dt);
      chassis.rotation.set(pitch, 0, roll);
      chassis.position.y = Math.abs(roll) * 0.25;
      const rolling = car.forwardSpeed / wheelRadius;
      const driven = (car.forwardSpeed + car.wheelSpin * CAR_LOOK.wheelspinSpeed) / wheelRadius;
      for (const wheel of wheels) {
        if (wheel.front) wheel.pivot.rotation.y = car.steer * CAR_LOOK.steerAngle;
        const locked = !wheel.front && input.handbrake;
        wheel.spin.rotation.x += (locked ? 0 : wheel.front ? rolling : driven) * dt;
      }
      const braking = input.brake > 0.05 || input.handbrake ? 1 : 0;
      brakeLevel = damp(brakeLevel, braking, 18, dt);
      for (const material of tails) material.emissiveIntensity = CAR_LOOK.tailEmissive + (CAR_LOOK.brakeEmissive - CAR_LOOK.tailEmissive) * brakeLevel;
      brakeGlow.intensity = CAR_LOOK.brakeGlowIntensity * brakeLevel;
    },
    localToWorld(x, y, z, out) {
      return root.localToWorld(out.set(x, y, z));
    },
  };
}
