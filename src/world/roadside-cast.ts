import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { baseOf, poseAt, vec, type Pose } from '../../sim/body.ts';
import type { Crowd } from '../../sim/crowd.ts';
import { frameAlong, type Track, type TrackFrame } from '../../sim/track.ts';
import { localAssets, localCastUrl } from '../local-assets.ts';

export const CAST = {
  performers: [
    { file: 'granny-skate', metresPerSecond: 7.5, facesRoad: false, board: true, scale: 1 },
    { file: 'clown-chicken', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.9 },
    { file: 'vegas-twist', metresPerSecond: 0, facesRoad: true, board: false, scale: 1 },
    { file: 'pumpkin-swagger', metresPerSecond: 1.5, facesRoad: false, board: false, scale: 0.95 },
    { file: 'zombie-thriller', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.9 },
    { file: 'mutant-macarena', metresPerSecond: 0, facesRoad: true, board: false, scale: 1.1 },
    { file: 'boss-twerk', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.95 },
    { file: 'ninja-breakdance', metresPerSecond: 0, facesRoad: true, board: false, scale: 1 },
    { file: 'vampire-gangnam', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.9 },
    { file: 'alien-robot', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.95 },
    { file: 'demon-samba', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.9 },
    { file: 'swat-belly', metresPerSecond: 0, facesRoad: true, board: false, scale: 1 },
    { file: 'guard-jacks', metresPerSecond: 0, facesRoad: true, board: false, scale: 0.85 },
    { file: 'doozy-run', metresPerSecond: 5.5, facesRoad: false, board: false, scale: 1 },
  ],
  copiesEach: 1,
  boardSize: [0.24, 0.03, 0.82],
  boardHeight: 0.11,
  boardColour: 0xc2412d,
  wheelColour: 0xf2efe6,
  environmentIntensity: 1.5,
} as const;

interface Performer {
  readonly object: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly facesRoad: boolean;
}

export interface RoadsideCast {
  readonly group: THREE.Group;
  readonly paces: readonly number[];
  update(track: Track, crowd: Crowd, alpha: number, dt: number): void;
}

function skateboard(): THREE.Group {
  const board = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(...CAST.boardSize), new THREE.MeshStandardMaterial({ color: CAST.boardColour, roughness: 0.6 }));
  deck.position.y = CAST.boardHeight;
  deck.castShadow = true;
  board.add(deck);
  const rubber = new THREE.MeshStandardMaterial({ color: CAST.wheelColour, roughness: 0.5 });
  for (const x of [-0.09, 0.09]) {
    for (const z of [-0.28, 0.28]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10).rotateZ(Math.PI / 2), rubber);
      wheel.position.set(x, 0.045, z);
      board.add(wheel);
    }
  }
  return board;
}

export async function loadRoadsideCast(): Promise<RoadsideCast> {
  const group = new THREE.Group();
  const loader = new GLTFLoader();
  const performers: Performer[] = [];
  const paces: number[] = [];
  const local = (await localAssets()).cast;
  const files = await Promise.all(
    CAST.performers.map((performer) =>
      !local.includes(performer.file) ? Promise.resolve(null) : loader.loadAsync(localCastUrl(performer.file)).catch((error: unknown) => {
        console.warn(`roadside performer ${performer.file} failed to load`, error);
        return null;
      }),
    ),
  );
  files.forEach((file, kind) => {
    const spec = CAST.performers[kind];
    const clip = file?.animations[0];
    if (!file || !spec || !clip) return;
    for (let copy = 0; copy < CAST.copiesEach; copy++) {
      const body = cloneSkinned(file.scene);
      body.scale.setScalar(spec.scale);
      body.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = true;
        child.frustumCulled = false;
        const materials: THREE.Material[] = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = CAST.environmentIntensity;
      });
      const object = new THREE.Group();
      object.add(body);
      if (spec.board) object.add(skateboard());
      const mixer = new THREE.AnimationMixer(body);
      const action = mixer.clipAction(clip);
      action.time = Math.random() * clip.duration;
      action.play();
      group.add(object);
      performers.push({ object, mixer, facesRoad: spec.facesRoad });
      paces.push(spec.metresPerSecond);
    }
  });
  const pose: Pose = { position: vec(0, 0, 0), rotation: { x: 0, y: 0, z: 0, w: 1 } };
  const frame: TrackFrame = { x: 0, z: 0, tx: 0, tz: 1, nx: 1, nz: 0 };
  const up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion(), facing = new THREE.Quaternion();

  return {
    group,
    paces,
    update(track, crowd, alpha, dt) {
      performers.forEach((performer, index) => {
        const walker = crowd.walkers[index];
        performer.object.visible = walker !== undefined;
        if (!walker) return;
        poseAt(walker.body, alpha, pose);
        const base = baseOf(pose, walker.body.half);
        frameAlong(track, base.z, frame);
        performer.object.position.set(frame.x + frame.nx * base.x, base.y, frame.z + frame.nz * base.x);
        facing.setFromAxisAngle(up, performer.facesRoad ? -walker.side * Math.PI / 2 : 0);
        performer.object.quaternion.setFromAxisAngle(up, Math.atan2(frame.tx, frame.tz)).multiply(tilt.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w)).multiply(facing);
        performer.mixer.update(dt);
      });
    },
  };
}
