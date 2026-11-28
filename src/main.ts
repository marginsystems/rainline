import * as THREE from 'three';
import { CAR, createCar, IDLE_INPUT, moveAlongTrack, repairCar, resetToTrack, stepCar, strikeCar, type CarInput } from '../sim/car.ts';
import { createCrowd, kickCrowd, resetCrowd, stepCrowd, type Bonk, type Crowd } from '../sim/crowd.ts';
import { createDriftScore, stepDriftScore } from '../sim/drift-score.ts';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../sim/math.ts';
import { createRace, formatLapTime, stepRace } from '../sim/race.ts';
import { locate, sampleAt } from '../sim/track.ts';
import { bumpRider, createTraffic, kickTraffic, ramTraffic, stepTraffic, TRAFFIC, type Launch, type Rammer, type Traffic } from '../sim/traffic.ts';
import { createAudio, MIX } from './audio/audio.ts';
import { MEME_AIRHORNS, MEME_BOINGS, MEME_CRASHES, MEME_FANFARES, MEME_HORNS, MEME_KICKS, MEME_OUCHES, MEME_VOCALS, MEME_WHISTLES, MEME_WHOOSHES } from './audio/sounds.ts';
import { CAPTURE, captureInput, captureModeOf, captureStartMetres, cruiseInput } from './capture-mode.ts';
import { ChaseCamera } from './camera/chase-camera.ts';
import { ComicPops } from './fx/comic-pops.ts';
import { Debris } from './fx/debris.ts';
import { Particles } from './fx/particles.ts';
import { createRain } from './fx/rain.ts';
import { SkidMarks } from './fx/skid-marks.ts';
import { createHud, type GameMode } from './hud/hud.ts';
import { nextQualityChoice, qualityLabel, type QualityChoice } from './hud/quality-control.ts';
import { createControls } from './input.ts';
import { createTouchControls } from './hud/touch-controls.ts';
import { createQualityGovernor, observeFrame, QUALITY_TIERS, setManualLevel, tierAt } from './render/quality.ts';
import { UNREFLECTED_LAYER } from './render/reflection.ts';
import { createStage } from './render/stage.ts';
import { NO_PORTAL, type PortalSdk } from './portal/portal.ts';
import { startPortal } from './portal/start-portal.ts';
import './styles/hud.css';
import { installSpringVariables, springSeconds, UI_SPRINGS } from './ui-spring.ts';
import { CarDamage } from './world/car-damage.ts';
import { CAR_LOOK, loadCar, type CarVisual } from './world/car-model.ts';
import { buildCityVenue } from './world/city-venue.ts';
import { buildCoastVenue } from './world/coast/venue.ts';
import { radialGlowTexture, smokeTexture } from './world/textures.ts';
import { loadRider, type Rider } from './world/rider.ts';
import { loadRoadsideCast, type RoadsideCast } from './world/roadside-cast.ts';
import { loadTrafficView, type TrafficView } from './world/traffic-view.ts';
import { chooseVenue, VENUE_STORAGE_KEY, venueAddress, venueInfo, VENUES } from './world/venue.ts';

const STEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 8;
const COUNTDOWN_SECONDS = 3;
const METRES_PER_SECOND_TO_KMH = 3.6;
const THUNDER_SECONDS: readonly [number, number] = [22, 55];
const DRY_WETNESS = 0.12;
const CAMERA_WALL_MARGIN = 1;
const PERF_READOUT_SECONDS = 0.5;
const MEME = {
  cheers: ['YEET', 'BONK', 'SEE YA', 'GET DAMMED', 'TIMBER', 'BEAVER KICK'],
  names: { car: 'car', van: 'van', truck: 'truck', bus: 'BUS' },
  bystander: 'BYSTANDER',
  bonks: { kick: ['BONK', 'YEET', 'SEE YA', 'BEAVER KICK'], wreck: ['COLLATERAL'], ridden: ['STRIKE', 'BOWLED'] },
  bumpCooldownSeconds: 0.7,
  confetti: [[3.4, 0.5, 1.6], [3.2, 2.6, 0.3], [0.3, 2.4, 3.4], [0.6, 3.2, 0.7], [3.4, 1.3, 0.2], [2.2, 1, 3.4]],
  confettiPieces: 46,
  confettiCapacity: 600,
  saturation: 1.2,
  popHeight: 3.4,
  vocalChance: 0.45,
  airhornFromCombo: 3,
  fanfareFromCombo: 5,
  whiffPitch: 1.5,
} as const;
const FX = {
  tyreSmokePerSecond: 110,
  dirtPerSecond: 26,
  sprayPerSecond: 16,
  flamesPerSecond: 140,
  wreckSmokePerSecond: 22,
  wreckSmokeFromDamage: 0.45,
  smokeColour: [0.3, 0.3, 0.32],
  dirtColour: [0.24, 0.2, 0.15],
  sprayColour: [0.34, 0.38, 0.46],
  exhaustColour: [0.42, 0.42, 0.46],
  exhaustIdlePerSecond: 7,
  exhaustThrottlePerSecond: 34,
  exhaustAlpha: 0.22,
  exhaustShiftPuffs: 7,
  wreckColour: [0.06, 0.06, 0.07],
  smokeAlpha: 0.3,
  sprayAlpha: 0.07,
  wreckAlpha: 0.4,
  rushBlur: 0.075,
  boostBlur: 0.035,
  aberration: 0.0015,
  rushAberration: 0.0025,
  boostAberration: 0.0015,
  impactSoundFrom: 1.5,
  heavyImpact: 12,
  mediumImpact: 5,
  debrisFromImpact: 7,
  debrisPerImpactSpeed: 0.8,
  debrisSpeedShare: 0.5,
  impactContactHeight: 0.5,
} as const;

function storedVenue(): string | null {
  try {
    return window.localStorage.getItem(VENUE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberVenue(id: string): boolean {
  try {
    window.localStorage.setItem(VENUE_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}

function element<T extends HTMLElement>(selector: string, type: new () => T): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`missing ${selector}`);
  return found;
}

async function boot(): Promise<void> {
  installSpringVariables(document.documentElement.style);
  let portal: PortalSdk = NO_PORTAL;
  const portalStarted = startPortal().then((started) => {
    portal = started;
  });
  const info = venueInfo(chooseVenue(window.location.search, storedVenue()));
  const hud = createHud(element('#hud', HTMLDivElement), { options: VENUES, current: info.id, tagline: info.tagline, kicks: info.id === 'beaver' });
  const stage = createStage(element('#game', HTMLCanvasElement));
  const controls = createControls(window);
  element('#hud', HTMLDivElement).append(createTouchControls(controls, info.id === 'beaver'));
  const audio = createAudio();
  const venue = info.id === 'city' ? buildCityVenue(info, stage) : buildCoastVenue(info, stage);
  const track = venue.track;
  const sky = venue.sky;
  let rider: Rider | null = null;
  let carVisual: CarVisual;
  let trafficView: TrafficView | null = null;
  let cast: RoadsideCast | null = null;
  try {
    rider = info.id === 'beaver' ? await loadRider() : null;
    carVisual = rider ?? await loadCar();
    trafficView = info.traffic === 'none' ? null : await loadTrafficView();
  } catch (error) {
    console.error(error);
    hud.toast('Could not load the models. Reload to try again.', 'bad');
    return;
  }
  const pops = rider ? new ComicPops() : null;
  if (trafficView) {
    stage.scene.add(trafficView.group);
    for (const pane of trafficView.glass) stage.hideFromAo(pane);
  }
  if (pops) {
    stage.scene.add(pops.object);
    stage.hideFromAo(pops.object);
    pops.object.traverse((child) => child.layers.set(UNREFLECTED_LAYER));
    stage.setSaturation(MEME.saturation);
  }
  const anyOf = <T>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];
  const rain = createRain(venue.rainColour);
  const smoke = new Particles({ capacity: 900, map: smokeTexture(), additive: false, gravity: -0.9, drag: 1.2 });
  const sparks = new Particles({ capacity: 500, map: radialGlowTexture(), additive: true, gravity: 9, drag: 0.6 });
  const confetti = new Particles({ capacity: MEME.confettiCapacity, map: radialGlowTexture(), additive: true, gravity: 9, drag: 0.6 });
  const skids = new SkidMarks(carVisual.wheels.length);
  const debris = new Debris();
  for (const object of [rain.object, smoke.object, sparks.object, confetti.object, skids.object]) object.layers.set(UNREFLECTED_LAYER);
  sparks.object.layers.enable(0);
  confetti.object.layers.enable(0);
  stage.scene.add(venue.group, carVisual.root, debris.object, rain.object, skids.object, smoke.object, sparks.object, confetti.object);
  for (const overlay of [...venue.overlays, ...carVisual.overlays, skids.object, smoke.object, sparks.object, confetti.object]) stage.hideFromAo(overlay);

  const camera = new ChaseCamera();
  camera.confine = (position) => {
    const location = locate(track, position.x, position.z, car.trackIndex);
    const over = Math.abs(location.lateral) - (track.wallOffset - CAMERA_WALL_MARGIN);
    if (over <= 0) return 0;
    const sample = sampleAt(track, location.index), side = Math.sign(location.lateral);
    position.x -= sample.nx * side * over;
    position.z -= sample.nz * side * over;
    return over;
  };
  const governor = createQualityGovernor();
  const point = new THREE.Vector3();
  let castRequested = false;
  let crowd: Crowd | null = null;

  function requestCast(): void {
    castRequested = true;
    void loadRoadsideCast().then((loaded) => {
      cast = loaded;
      crowd = createCrowd(loaded.paces, track.wallOffset, car.distance, Math.random);
      stage.scene.add(loaded.group);
      loaded.group.visible = tierAt(governor.level).roadsideCast;
    }).catch((error: unknown) => console.error(error));
  }

  function applyQuality(): void {
    const tier = tierAt(governor.level);
    stage.applyTier(tier);
    sky.setShadowMapSize(tier.shadowMapSize);
    if (rider && tier.roadsideCast && !castRequested) requestCast();
    if (cast) cast.group.visible = tier.roadsideCast;
  }
  function chooseQuality(choice: QualityChoice): void {
    setManualLevel(governor, choice === 'auto' ? null : choice);
    applyQuality();
  }
  chooseQuality(hud.quality);
  hud.onQuality(chooseQuality);

  audio.setVolume(hud.audio.volume, hud.audio.muted);
  hud.onAudio((setting) => audio.setVolume(setting.volume, setting.muted));

  let mode: GameMode = 'boot';
  let car = createCar(track);
  let race = createRace();
  let drift = createDriftScore();
  let previous = { x: car.x, z: car.z, yaw: car.yaw };
  let accumulator = 0;
  let countdown = 0;
  let countdownShown = 0;
  let seconds = 0;
  let rainTarget = 1;
  let rainStrength = 1;
  let thunderIn = lerp(THUNDER_SECONDS[0], THUNDER_SECONDS[1], Math.random());
  let lastThrottle = 0;
  let wasBoosting = false;
  let wasOnRoad = true;
  let smokeDebt = 0;
  let sprayDebt = 0;
  let flameDebt = 0;
  let wreckDebt = 0;
  let exhaustDebt = 0;
  let perfDue = 0;
  const freshTraffic = (): Traffic | null => {
    switch (info.traffic) {
      case 'none':
        return null;
      case 'kicks':
        return createTraffic(car.distance, Math.random);
      case 'ram':
        return createTraffic(car.distance, Math.random, TRAFFIC.lightCount);
    }
  };
  let traffic = freshTraffic();
  let bumpRest = 0;
  let captureKickDue = 0;

  function mend(): void {
    repairCar(car);
    carVisual.damage.repair();
    debris.clear();
  }

  function enterLobby(): void {
    mode = 'lobby';
    car = createCar(track);
    race = createRace();
    drift = createDriftScore();
    traffic = freshTraffic();
    if (crowd) resetCrowd(crowd, car.distance, Math.random);
    previous = { x: car.x, z: car.z, yaw: car.yaw };
    accumulator = 0;
    mend();
    hud.setMode('lobby');
    camera.setMode('orbit', car);
    audio.music('lobby');
    for (let i = 0; i < carVisual.wheels.length; i++) skids.lift(i);
  }

  function startCountdown(): void {
    mode = 'countdown';
    countdown = COUNTDOWN_SECONDS;
    countdownShown = COUNTDOWN_SECONDS + 1;
    hud.setMode('countdown');
    camera.setMode('chase', car);
    audio.play('ui-start');
    audio.play('engine-start', 0.8);
    audio.music(rider ? 'meme' : 'race');
  }

  function advance(): void {
    if (mode === 'boot') {
      audio.unlock();
      audio.play('ui-click');
      enterLobby();
    } else if (mode === 'lobby') startCountdown();
  }

  hud.onStart(advance);
  hud.onTrack((id) => {
    const destination = venueAddress(window.location.pathname, id, rememberVenue(id));
    mode = 'leaving';
    hud.setMode('leaving');
    window.setTimeout(() => window.location.assign(destination), springSeconds(UI_SPRINGS.smooth) * 1000);
  });
  hud.onHover(() => audio.play('ui-hover', 0.5));
  hud.setReady();
  void portalStarted.then(() => portal.ready());
  const capture = captureModeOf(window.location.search);
  if (capture) {
    mode = 'racing';
    hud.setMode('racing');
    const startMetres = captureStartMetres(window.location.search);
    if (startMetres > 0) {
      moveAlongTrack(car, track, startMetres);
      traffic = freshTraffic();
      previous = { x: car.x, z: car.z, yaw: car.yaw };
    }
    camera.setMode('chase', car);
  }

  function burst(pool: Particles, x: number, y: number, z: number, count: number, speed: number, colour: readonly [number, number, number]): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, lift = Math.random();
      pool.spawn({ x, y, z, vx: Math.cos(angle) * speed * Math.random(), vy: lift * speed * 0.7, vz: Math.sin(angle) * speed * Math.random(), life: 0.25 + Math.random() * 0.45, startSize: 0.22, endSize: 0.04, colour, alpha: 1 });
    }
  }

  function crash(): void {
    const impact = car.impact;
    const loudness = MIX.impact * clamp(impact / 16, 0.3, 1);
    audio.play(impact > FX.heavyImpact ? 'impact-heavy' : impact > FX.mediumImpact ? 'impact' : 'impact-light', loudness, 0.9 + Math.random() * 0.2);
    camera.shake(clamp(impact / 16, 0.15, 1));
    const leftX = Math.cos(car.yaw), leftZ = -Math.sin(car.yaw), aheadX = Math.sin(car.yaw), aheadZ = Math.cos(car.yaw);
    const sideways = car.impactNx * leftX + car.impactNz * leftZ, forwards = car.impactNx * aheadX + car.impactNz * aheadZ;
    const contact = CarDamage.contact(sideways, forwards);
    point.set(car.x + contact.x * leftX + contact.z * aheadX, FX.impactContactHeight, car.z + contact.x * leftZ + contact.z * aheadZ);
    burst(sparks, point.x, point.y, point.z, Math.round(clamp(impact * 2, 6, 40)), 4 + impact * 0.4, [3.2, 1.6, 0.4]);
    if (impact <= CAR.damageFreeImpact) return;
    carVisual.damage.hit(sideways, forwards, impact);
    if (impact < FX.debrisFromImpact) return;
    debris.spawn(point.x, point.y, point.z, -car.impactNx, -car.impactNz, impact * FX.debrisSpeedShare, Math.round(impact * FX.debrisPerImpactSpeed), carVisual.debrisColours);
  }

  function cheer(launch: Launch): void {
    drift.total += launch.points;
    const vehicle = launch.vehicle;
    const sample = sampleAt(track, Math.round(vehicle.distance / track.spacing));
    const hitX = sample.x + sample.nx * vehicle.lateral, hitZ = sample.z + sample.nz * vehicle.lateral;
    for (let i = 0; i < MEME.confettiPieces; i++) burst(confetti, hitX, 1.2, hitZ, 1, 12, anyOf(MEME.confetti) ?? MEME.confetti[0]);
    pops?.show(hitX, MEME.popHeight, hitZ);
    const heavy = vehicle.kind === 'bus' || vehicle.kind === 'truck';
    audio.play(heavy ? 'impact-heavy' : 'impact', MIX.impact, 0.9 + Math.random() * 0.3);
    audio.play(anyOf(MEME_KICKS) ?? 'meme-kick-1', 0.9, 0.9 + Math.random() * 0.25);
    audio.play(heavy ? anyOf(MEME_HORNS) ?? 'horn' : 'horn', 0.45, 0.7 + Math.random() * 0.9);
    audio.play((launch.domino ? anyOf(MEME_CRASHES) : anyOf(MEME_WHISTLES)) ?? 'meme-crash', 0.6);
    if (launch.domino) audio.play(anyOf(MEME_BOINGS) ?? 'meme-boing-1', 0.6);
    if (Math.random() < MEME.vocalChance) audio.play(anyOf(MEME_VOCALS) ?? 'meme-vocal-1', 0.7);
    if (launch.combo === MEME.airhornFromCombo) audio.play(anyOf(MEME_AIRHORNS) ?? 'meme-airhorn', 0.7);
    if (launch.combo === MEME.fanfareFromCombo) audio.play(anyOf(MEME_FANFARES) ?? 'meme-fanfare', 0.8);
    camera.shake(heavy ? 0.5 : 0.3);
    hud.driftBanked();
    const word = launch.domino ? 'DOMINO' : MEME.cheers[Math.floor(Math.random() * MEME.cheers.length)] ?? 'YEET';
    hud.toast(`${word}  ${MEME.names[vehicle.kind]}  +${launch.points.toLocaleString('en-US')}${launch.combo > 1 ? `  ×${launch.combo}` : ''}`, launch.combo > 2 || heavy ? 'best' : 'good');
  }

  function cheerBonk(bonk: Bonk): void {
    drift.total += bonk.points;
    const body = bonk.walker.body;
    const sample = sampleAt(track, Math.round(body.position.z / track.spacing));
    const hitX = sample.x + sample.nx * body.position.x, hitZ = sample.z + sample.nz * body.position.x;
    for (let i = 0; i < MEME.confettiPieces / 2; i++) burst(confetti, hitX, body.position.y, hitZ, 1, 10, anyOf(MEME.confetti) ?? MEME.confetti[0]);
    pops?.show(hitX, MEME.popHeight, hitZ);
    audio.play(anyOf(MEME_KICKS) ?? 'meme-kick-1', 0.9, 1 + Math.random() * 0.3);
    audio.play(anyOf(MEME_BOINGS) ?? 'meme-boing-1', 0.6);
    if (Math.random() < MEME.vocalChance) audio.play(anyOf(MEME_VOCALS) ?? 'meme-vocal-1', 0.7);
    if (bonk.combo === MEME.airhornFromCombo) audio.play(anyOf(MEME_AIRHORNS) ?? 'meme-airhorn', 0.7);
    if (bonk.combo === MEME.fanfareFromCombo) audio.play(anyOf(MEME_FANFARES) ?? 'meme-fanfare', 0.8);
    camera.shake(0.2);
    hud.driftBanked();
    const word = anyOf(MEME.bonks[bonk.cause]) ?? 'BONK';
    hud.toast(`${word}  ${MEME.bystander}  +${bonk.points.toLocaleString('en-US')}${bonk.combo > 1 ? `  ×${bonk.combo}` : ''}`, bonk.combo > 2 ? 'best' : 'good');
  }

  const crowdInPlay = (): Crowd | null => (cast?.group.visible ? crowd : null);

  function kick(side: 1 | -1): void {
    if (!rider || !traffic) return;
    rider.kick(side);
    const launch = kickTraffic(traffic, car.distance, car.lateral, side);
    const people = launch ? null : crowdInPlay();
    const bonk = people ? kickCrowd(people, traffic, car, side) : null;
    if (launch) cheer(launch);
    else if (bonk) cheerBonk(bonk);
    else {
      audio.play(anyOf(MEME_WHOOSHES) ?? 'meme-whoosh', 0.6, 0.9 + Math.random() * 0.3);
      audio.play('tyre-chirp', 0.12, MEME.whiffPitch);
    }
  }

  function ram(wrecksOnly: boolean): void {
    if (!traffic) return;
    const along = sampleAt(track, car.trackIndex);
    const rammer: Rammer = { distance: car.distance, lateral: car.lateral, tx: along.tx, tz: along.tz, ...(rider ? TRAFFIC.rammer.rider : TRAFFIC.rammer.car), vx: car.vx, vz: car.vz };
    const hit = ramTraffic(traffic, rammer, wrecksOnly);
    if (!hit) return;
    car.vx = rammer.vx;
    car.vz = rammer.vz;
    strikeCar(car, hit.impact, hit.nx, hit.nz);
  }

  function simulateTraffic(): void {
    if (!traffic) return;
    const launches = stepTraffic(traffic, car.distance, STEP, Math.random, venue.terrain);
    for (const launch of launches) cheer(launch);
    if (info.traffic !== 'kicks') {
      ram(false);
      return;
    }
    const people = crowdInPlay();
    if (people) for (const bonk of stepCrowd(people, traffic, car, STEP, Math.random, venue.terrain)) cheerBonk(bonk);
    ram(true);
    bumpRest = Math.max(0, bumpRest - STEP);
    if (!bumpRider(traffic, car) || bumpRest > 0) return;
    bumpRest = MEME.bumpCooldownSeconds;
    camera.shake(0.45);
    audio.play('impact', MIX.impact, 1.1);
    audio.play(anyOf(MEME_OUCHES) ?? 'meme-ouch', 0.8);
    audio.play('meme-record-scratch', 0.5);
    hud.driftFailed();
    hud.toast('OUCH  mind the traffic', 'bad');
  }

  function simulate(input: CarInput): void {
    previous = { x: car.x, z: car.z, yaw: car.yaw };
    const gearBefore = car.gear;
    stepCar(car, input, track, STEP);
    simulateTraffic();

    if (car.impact > FX.impactSoundFrom) crash();
    if (car.gear > gearBefore) {
      audio.play('gear-shift', 0.45);
      exhaustDebt += FX.exhaustShiftPuffs;
    }
    if (car.boosting && !wasBoosting) {
      audio.play('boost', 0.9);
      camera.shake(0.25);
    }
    if (!car.boosting && wasBoosting) audio.play('boost-end', 0.6);
    wasBoosting = car.boosting;
    if (lastThrottle > 0.7 && input.throttle < 0.2 && car.rpm > 0.6 && car.speed > 18) {
      audio.play('turbo-blowoff', 0.55);
      if (Math.random() < 0.6) {
        audio.play(Math.random() < 0.5 ? 'backfire-1' : 'backfire-2', 0.6, 0.9 + Math.random() * 0.3);
        for (const exhaust of carVisual.exhausts) {
          carVisual.localToWorld(exhaust.x, exhaust.y, exhaust.z, point);
          burst(sparks, point.x, point.y, point.z, 5, 2.5, [3.5, 1.4, 0.3]);
        }
      }
    }
    lastThrottle = input.throttle;
    if (car.onRoad && !wasOnRoad && car.speed > 10) audio.play('splash', 0.5);
    wasOnRoad = car.onRoad;

    const driftEvent = stepDriftScore(drift, car, STEP);
    if (driftEvent?.kind === 'start') audio.play('tyre-chirp', 0.5, 0.9 + Math.random() * 0.2);
    if (driftEvent?.kind === 'combo') audio.play('combo-up', 0.6, 0.9 + driftEvent.multiplier * 0.1);
    if (driftEvent?.kind === 'bank' && driftEvent.points > 0) {
      audio.play('score-bank', 0.7);
      hud.driftBanked();
      hud.toast(`${driftEvent.best ? 'Best drift  ' : ''}+${driftEvent.points.toLocaleString('en-US')}`, driftEvent.best ? 'best' : 'good');
    }
    if (driftEvent?.kind === 'fail' && driftEvent.lost > 0) {
      audio.play('drift-fail', 0.7);
      hud.driftFailed();
      hud.toast('Drift lost', 'bad');
    }

    const raceEvent = stepRace(race, car.distance, track.length, STEP);
    if (raceEvent?.kind === 'lap') {
      const repaired = car.damage > 0 || debris.count > 0;
      mend();
      audio.play(raceEvent.best ? 'best-lap' : 'lap-complete', 0.8);
      hud.toast(`${raceEvent.best ? 'Best lap' : 'Lap'}  ${formatLapTime(raceEvent.seconds)}${repaired ? '  ·  repaired' : ''}`, raceEvent.best ? 'best' : 'good');
    }
  }

  function emit(dt: number, input: CarInput): void {
    const sliding = car.drifting && car.speed > 4 ? clamp((Math.abs(car.slip) - 0.1) * 2.2, 0, 1) : 0;
    const spinning = car.wheelSpin > 0.4 ? 0.6 : 0;
    const smokeRate = car.onRoad ? Math.max(sliding, spinning) * FX.tyreSmokePerSecond : 0;
    const dirtRate = !car.onRoad ? clamp(car.speed / 20, 0, 1) * FX.dirtPerSecond : 0;
    smokeDebt += (smokeRate + dirtRate) * dt;
    sprayDebt += (car.onRoad ? smoothstep(12, 45, car.speed) * FX.sprayPerSecond * rainStrength : 0) * dt;
    const rear = carVisual.wheels.filter((wheel) => wheel.rear);
    carVisual.wheels.forEach((wheel, i) => {
      carVisual.localToWorld(wheel.x, 0.05, wheel.z, point);
      const marking = car.onRoad && car.speed > 3 && (sliding > 0.15 || (wheel.rear && (input.handbrake || spinning > 0)));
      if (marking && mode === 'racing') skids.mark(i, point.x, point.z, wheel.rear ? Math.max(sliding, 0.5) : sliding * 0.8);
      else skids.lift(i);
    });
    const behindRearWheel = (back: number, height: number): void => {
      const wheel = rear[Math.floor(Math.random() * rear.length)];
      if (wheel) carVisual.localToWorld(wheel.x, height, wheel.z - back, point);
    };
    while (smokeDebt >= 1) {
      smokeDebt -= 1;
      behindRearWheel(0.2, 0.2);
      smoke.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: car.vx * 0.34 + (Math.random() - 0.5) * 3, vy: 0.9 + Math.random() * 1.6, vz: car.vz * 0.34 + (Math.random() - 0.5) * 3,
        life: 1.2 + Math.random() * 1.1, startSize: 1.3, endSize: 4.6 + Math.random() * 2,
        colour: car.onRoad ? FX.smokeColour : FX.dirtColour, alpha: FX.smokeAlpha,
      });
    }
    while (sprayDebt >= 1) {
      sprayDebt -= 1;
      behindRearWheel(0.5, 0.15);
      smoke.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: car.vx * 0.55 + (Math.random() - 0.5) * 1.5, vy: 0.8 + Math.random() * 1.2, vz: car.vz * 0.55 + (Math.random() - 0.5) * 1.5,
        life: 0.5 + Math.random() * 0.4, startSize: 0.8, endSize: 2.6, colour: FX.sprayColour, alpha: FX.sprayAlpha,
      });
    }
    wreckDebt += (car.damage > FX.wreckSmokeFromDamage ? car.damage * FX.wreckSmokePerSecond : 0) * dt;
    while (wreckDebt >= 1) {
      wreckDebt -= 1;
      carVisual.localToWorld(CAR_LOOK.hood[0] + (Math.random() - 0.5) * 0.8, CAR_LOOK.hood[1], CAR_LOOK.hood[2], point);
      smoke.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: car.vx * 0.4 + (Math.random() - 0.5), vy: 1.4 + Math.random() * 1.4, vz: car.vz * 0.4 + (Math.random() - 0.5),
        life: 1 + Math.random() * 0.8, startSize: 0.7, endSize: 3.2, colour: FX.wreckColour, alpha: FX.wreckAlpha,
      });
    }
    exhaustDebt += (car.boosting ? 0 : FX.exhaustIdlePerSecond + input.throttle * FX.exhaustThrottlePerSecond) * dt;
    while (exhaustDebt >= 1) {
      exhaustDebt -= 1;
      const pipe = carVisual.exhausts[Math.floor(Math.random() * carVisual.exhausts.length)];
      if (!pipe) break;
      carVisual.localToWorld(pipe.x, pipe.y, pipe.z - 0.1, point);
      const back = 1.2 + Math.random() * 1.6 + input.throttle * 2;
      smoke.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: car.vx * 0.7 - Math.sin(car.yaw) * back + (Math.random() - 0.5) * 0.5, vy: 0.3 + Math.random() * 0.7, vz: car.vz * 0.7 - Math.cos(car.yaw) * back + (Math.random() - 0.5) * 0.5,
        life: 0.5 + Math.random() * 0.5, startSize: 0.22, endSize: 1 + Math.random() * 0.7, colour: FX.exhaustColour, alpha: FX.exhaustAlpha,
      });
    }
    flameDebt += (car.boosting ? FX.flamesPerSecond : 0) * dt;
    while (flameDebt >= 1) {
      flameDebt -= 1;
      const exhaust = carVisual.exhausts[Math.floor(Math.random() * carVisual.exhausts.length)];
      if (!exhaust) break;
      carVisual.localToWorld(exhaust.x, exhaust.y, exhaust.z, point);
      const back = 6 + Math.random() * 5;
      sparks.spawn({
        x: point.x, y: point.y, z: point.z,
        vx: car.vx - Math.sin(car.yaw) * back, vy: (Math.random() - 0.3) * 0.8, vz: car.vz - Math.cos(car.yaw) * back,
        life: 0.1 + Math.random() * 0.12, startSize: 0.55, endSize: 0.1, colour: Math.random() < 0.5 ? [0.5, 1.6, 4] : [4, 1.6, 0.4], alpha: 1,
      });
    }
  }

  function cycleQuality(): void {
    const next = nextQualityChoice(hud.quality, QUALITY_TIERS.length);
    hud.setQuality(next);
    hud.toast(`Graphics  ${qualityLabel(next, QUALITY_TIERS.map((tier) => tier.name))}`, 'good');
  }

  let lastFrame = performance.now();

  function frame(now: number): void {
    const frameMs = now - lastFrame;
    lastFrame = now;
    const dt = Math.min(frameMs / 1000, 0.1);
    const held = portal.paused();
    audio.hold(held);
    if (held) {
      controls.discard();
      requestAnimationFrame(frame);
      return;
    }
    seconds += dt;

    const parked = capture === 'wreck' && seconds > CAPTURE.wreckParkSeconds;
    if (parked) camera.setMode('orbit', car);
    const input = parked ? { ...IDLE_INPUT, brake: car.forwardSpeed > 0.5 ? 1 : 0 } : capture === 'cruise' ? cruiseInput(car.lateral, wrapAngle(car.yaw - Math.atan2(sampleAt(track, car.trackIndex).tx, sampleAt(track, car.trackIndex).tz))) : capture ? captureInput(seconds) : controls.read();
    if (controls.consume('Enter')) advance();
    const escape = controls.consume('Escape'), menu = controls.consume('KeyP');
    if ((escape || menu) && (mode === 'racing' || mode === 'countdown')) {
      audio.play('ui-click');
      enterLobby();
      portal.raceEnded();
    }
    if (controls.consume('KeyM')) hud.toast(hud.toggleMute().muted ? 'Muted' : 'Sound on', 'good');
    if (controls.consume('KeyH')) audio.play('horn', 0.7);
    const kickLeft = controls.consume('KeyZ'), kickRight = controls.consume('KeyC');
    if (mode === 'racing' && kickLeft) kick(1);
    if (mode === 'racing' && kickRight) kick(-1);
    captureKickDue -= dt;
    if (capture && rider && captureKickDue <= 0) {
      captureKickDue = CAPTURE.kickEverySeconds;
      kick(Math.random() < 0.5 ? 1 : -1);
    }
    if (controls.consume('KeyG')) cycleQuality();
    if (controls.consume('KeyT')) {
      rainTarget = rainTarget > 0.5 ? 0 : 1;
      hud.toast(rainTarget > 0.5 ? 'Rain' : 'Clearing up', 'good');
    }
    if (controls.consume('KeyR') && mode === 'racing') {
      resetToTrack(car, track);
      previous = { x: car.x, z: car.z, yaw: car.yaw };
    }

    if (mode === 'countdown') {
      countdown -= dt;
      const shown = Math.ceil(countdown);
      if (shown < countdownShown) {
        countdownShown = shown;
        if (shown > 0) {
          hud.countdown(String(shown));
          audio.play('countdown-beep', 0.7);
        } else {
          hud.countdown('GO');
          audio.play('countdown-go', 0.8);
          mode = 'racing';
          hud.setMode('racing');
        }
      }
    }

    const driving = mode === 'racing' ? input : IDLE_INPUT;
    if (mode === 'racing') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < MAX_STEPS_PER_FRAME) {
        simulate(driving);
        accumulator -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
    }
    const alpha = mode === 'racing' ? accumulator / STEP : 1;
    const x = lerp(previous.x, car.x, alpha), z = lerp(previous.z, car.z, alpha);
    const yaw = previous.yaw + wrapAngle(car.yaw - previous.yaw) * alpha;

    carVisual.place(x, z, yaw);
    const beside = sampleAt(track, car.trackIndex);
    const towardWall = Math.sin(yaw) * beside.nx + Math.cos(yaw) * beside.nz;
    const wallAhead = Math.abs(towardWall) < 0.05 ? Number.POSITIVE_INFINITY : (track.wallOffset - Math.sign(towardWall) * car.lateral) / Math.abs(towardWall);
    carVisual.update(car, driving, wallAhead, dt);
    carVisual.damage.update(dt);
    if (traffic && trafficView) trafficView.update(traffic, track, alpha);
    if (cast?.group.visible && crowd) cast.update(track, crowd, alpha, dt);
    carVisual.root.updateMatrixWorld(true);
    emit(dt, driving);
    smoke.update(dt);
    sparks.update(dt);
    confetti.update(dt);
    debris.update(dt);
    pops?.update(dt, stage.camera.position);

    rainStrength = damp(rainStrength, rainTarget, 0.6, dt);
    venue.road.wetness.value = lerp(DRY_WETNESS, 1, rainStrength);
    thunderIn -= dt * rainStrength;
    if (thunderIn <= 0) {
      thunderIn = lerp(THUNDER_SECONDS[0], THUNDER_SECONDS[1], Math.random());
      audio.play(Math.random() < 0.5 ? 'thunder-1' : 'thunder-2', 0.35 + Math.random() * 0.3);
    }

    sky.follow(x, z);
    const drawn = stage.drawnSize();
    const shelter = venue.update({ x, z, yaw, trackIndex: car.trackIndex, viewportWidth: drawn.width, viewportHeight: drawn.height });
    stage.setExposure(sky.exposure);
    stage.setLensDrops(rainStrength * (1 - shelter));
    const looking = controls.look();
    if (mode === 'racing') camera.turn(looking.pixelsX, looking.pixelsY);
    camera.lookBack(mode === 'racing' && (looking.back || (!rider && looking.backKey)));
    if (mode === 'racing' && car.boosting) camera.shake(dt * 0.9);
    camera.update(stage.camera, car, x, z, yaw, dt);
    stage.camera.updateMatrixWorld();
    sky.update(stage.camera, seconds);
    rain.update(stage.camera, seconds, rainStrength * (1 - shelter));
    const rush = smoothstep(38, CAR.boostTopSpeed, car.speed);
    stage.setLens(rush * FX.rushBlur + (car.boosting ? FX.boostBlur : 0), FX.aberration + rush * FX.rushAberration + (car.boosting ? FX.boostAberration : 0));

    hud.update({
      speedKmh: car.speed * METRES_PER_SECOND_TO_KMH,
      gear: car.gear,
      reversing: car.forwardSpeed < -0.5,
      rpm: car.rpm,
      boost: car.boost,
      boosting: car.boosting,
      damage: car.damage,
      lap: race.lap,
      lapSeconds: race.lapSeconds,
      lastLap: race.lastLap,
      bestLap: race.bestLap,
      driftPoints: drift.current,
      driftMultiplier: drift.multiplier,
      driftActive: drift.active,
      total: drift.total,
      bestDrift: traffic && info.traffic === 'kicks' ? traffic.kicked : drift.best,
    }, dt);

    audio.frame({
      racing: mode === 'racing',
      rpm: car.rpm,
      throttle: driving.throttle,
      speed: car.speed,
      slip: car.slip,
      drifting: car.drifting,
      handbrake: driving.handbrake,
      onRoad: car.onRoad,
      wallContact: car.wallContact && car.speed > 3,
      boosting: car.boosting,
      rain: rainStrength,
    });

    if (observeFrame(governor, frameMs)) applyQuality();
    perfDue -= dt;
    if (perfDue <= 0) {
      perfDue = PERF_READOUT_SECONDS;
      hud.perf(governor.fps, `${governor.auto ? 'Auto ' : ''}${tierAt(governor.level).name}`, drawn.width, drawn.height);
    }
    stage.render(dt);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

void boot();
