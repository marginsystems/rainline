import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mod } from '../../sim/math.ts';
import { sampleAt, type Track } from '../../sim/track.ts';
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
  shoulderBeyondWall: -0.75,
  spawnAhead: [90, 520],
  firstSpawnAhead: [25, 520],
  dropBehind: 45,
  boardSize: [0.24, 0.03, 0.82],
  boardHeight: 0.11,
  boardColour: 0xc2412d,
  wheelColour: 0xf2efe6,
  environmentIntensity: 1.5,
} as const;

interface Performer {
  readonly object: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly metresPerSecond: number;
  readonly facesRoad: boolean;
  distance: number;
  side: number;
}

export interface RoadsideCast {
  readonly group: THREE.Group;
  reset(riderDistance: number): void;
  update(track: Track, riderDistance: number, dt: number): void;
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

export async function loadRoadsideCast(track: Track): Promise<RoadsideCast> {
  const group = new THREE.Group();
  const loader = new GLTFLoader();
  const performers: Performer[] = [];
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
      performers.push({ object, mixer, metresPerSecond: spec.metresPerSecond, facesRoad: spec.facesRoad, distance: 0, side: 1 });
    }
  });
  const shoulder = track.wallOffset + CAST.shoulderBeyondWall;

  function place(performer: Performer, riderDistance: number, range: readonly [number, number]): void {
    performer.distance = riderDistance + range[0] + (range[1] - range[0]) * Math.random();
    performer.side = Math.random() < 0.5 ? -1 : 1;
  }

  return {
    group,
    reset(riderDistance) {
      for (const performer of performers) place(performer, riderDistance, CAST.firstSpawnAhead);
    },
    update(liveTrack, riderDistance, dt) {
      for (const performer of performers) {
        performer.distance += performer.metresPerSecond * dt;
        const ahead = performer.distance - riderDistance;
        if (ahead < -CAST.dropBehind || ahead > CAST.spawnAhead[1] * 1.4) place(performer, riderDistance, CAST.spawnAhead);
        const sample = sampleAt(liveTrack, mod(Math.round(performer.distance / liveTrack.spacing), liveTrack.samples.length));
        const lateral = performer.side * shoulder;
        performer.object.position.set(sample.x + sample.nx * lateral, 0, sample.z + sample.nz * lateral);
        const along = Math.atan2(sample.tx, sample.tz);
        performer.object.rotation.y = performer.facesRoad ? along - performer.side * Math.PI / 2 : along;
        performer.mixer.update(dt);
      }
    },
  };
}
