import { formatLapTime } from '../../sim/race.ts';
import { springEasing, springSeconds, stepSpring, UI_SPRINGS, type SpringState } from '../ui-spring.ts';
import { QUALITY_TIERS } from '../render/quality.ts';
import { createAudioControl, type AudioSetting } from './audio-control.ts';
import { createQualityControl, defaultQuality, type QualityChoice } from './quality-control.ts';
import { createSwapText } from './swap-text.ts';
import { createTrackPicker, type TrackOption } from './track-picker.ts';

export type GameMode = 'boot' | 'lobby' | 'countdown' | 'racing' | 'leaving';

export interface HudTracks {
  readonly options: readonly TrackOption[];
  readonly current: string;
  readonly tagline: string;
  readonly kicks: boolean;
}
export type ToastTone = 'good' | 'best' | 'bad';

export interface HudView {
  readonly speedKmh: number;
  readonly gear: number;
  readonly reversing: boolean;
  readonly rpm: number;
  readonly boost: number;
  readonly boosting: boolean;
  readonly damage: number;
  readonly lap: number;
  readonly lapSeconds: number;
  readonly lastLap: number | null;
  readonly bestLap: number | null;
  readonly driftPoints: number;
  readonly driftMultiplier: number;
  readonly driftActive: boolean;
  readonly total: number;
  readonly bestDrift: number;
}

export interface Hud {
  setMode(mode: GameMode): void;
  setReady(): void;
  onStart(handler: () => void): void;
  onHover(handler: () => void): void;
  onTrack(handler: (id: string) => void): void;
  update(view: HudView, dt: number): void;
  countdown(text: string): void;
  toast(text: string, tone: ToastTone): void;
  driftBanked(): void;
  driftFailed(): void;
  readonly audio: AudioSetting;
  onAudio(handler: (setting: AudioSetting) => void): void;
  toggleMute(): AudioSetting;
  readonly quality: QualityChoice;
  onQuality(handler: (choice: QualityChoice) => void): void;
  setQuality(choice: QualityChoice): void;
  perf(fps: number, quality: string, width: number, height: number): void;
}

const KEYS: readonly (readonly [string, string])[] = [
  ['W / ↑', 'Throttle'], ['S / ↓', 'Brake'], ['A D / ← →', 'Steer'], ['Space', 'Handbrake'],
  ['Shift', 'Nitro'], ['Mouse', 'Look around'], ['R', 'Reset'], ['T', 'Weather'], ['M', 'Mute'], ['H', 'Horn'], ['G', 'Graphics'], ['Esc / P', 'Lobby'],
];

const LOOK_BACK_KEYS: readonly (readonly [string, string])[] = [['Right click / C', 'Look back']];
const KICK_KEYS: readonly (readonly [string, string])[] = [['Z', 'Kick left'], ['C', 'Kick right'], ['Right click', 'Look back']];

const TOAST_SECONDS = 2.2;
const COUNTDOWN_SECONDS = 0.9;
const TEXT_SECONDS = 1 / 30;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text) element.textContent = text;
  return element;
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function createHud(root: HTMLElement, tracks: HudTracks): Hud {
  root.className = 'hud';
  root.dataset['mode'] = 'boot';

  const shade = make('div', 'shade');
  const lobby = make('section', 'lobby');
  const start = make('button', 'start');
  start.type = 'button';
  start.disabled = true;
  const startLabel = createSwapText('start-label', 'Loading');
  start.append(startLabel.element);
  const keys = make('ul', 'keys');
  for (const [key, action] of [...KEYS, ...(tracks.kicks ? KICK_KEYS : LOOK_BACK_KEYS)]) {
    const item = document.createElement('li');
    item.append(make('b', '', key), action);
    keys.append(item);
  }
  const picker = createTrackPicker(tracks.options, tracks.current);
  lobby.append(make('h1', 'title', 'RAINLINE'), make('p', 'tagline', tracks.tagline), picker.element, start, keys);
  const curtain = make('div', 'curtain');

  const lap = make('div', 'panel lap');
  const lapNumber = createSwapText('lap-number', '1');
  const lapHead = make('div', 'label', 'Lap ');
  lapHead.append(lapNumber.element);
  const lapNow = make('div', 'now', formatLapTime(0));
  const lapRows = make('div', 'rows');
  const lapLast = createSwapText('lap-time', formatLapTime(null)), lapBest = createSwapText('lap-time', formatLapTime(null));
  lapRows.append(make('span', '', 'Last'), lapLast.element, make('span', '', 'Best'), lapBest.element);
  lap.append(lapHead, lapNow, lapRows);

  const score = make('div', 'panel score');
  const total = make('div', 'total', '0');
  const bestLabel = tracks.kicks ? 'Kicked' : 'Best drift';
  const bestDrift = createSwapText('best', `${bestLabel} 0`);
  if (tracks.kicks) root.dataset['meme'] = 'on';
  score.append(make('div', 'label', 'Score'), total, bestDrift.element);

  const drift = make('div', 'drift');
  const driftPoints = make('div', 'points', '0');
  const driftMulti = createSwapText('multi', '×1');
  drift.append(make('div', 'label', 'Drift'), driftPoints, driftMulti.element);

  const toast = createSwapText('toast');
  const countdown = createSwapText('countdown');

  const speedo = make('div', 'panel speedo');
  const speedRow = make('div', 'row');
  const gear = createSwapText('gear', '1');
  const speed = make('div', 'speed', '0');
  speedRow.append(gear.element, speed, make('div', 'label', 'km/h'));
  const rpmBar = make('div', 'bar rpm'), rpmFill = make('i', '');
  rpmBar.append(rpmFill);
  const boostBar = make('div', 'bar boost'), boostFill = make('i', '');
  boostBar.append(boostFill);
  const damageBar = make('div', 'bar damage'), damageFill = make('i', '');
  damageBar.append(damageFill);
  speedo.append(speedRow, rpmBar, make('div', 'label', 'Nitro'), boostBar, make('div', 'label', 'Damage'), damageBar);

  const audio = createAudioControl(localStorageOrNull());
  const quality = createQualityControl(localStorageOrNull(), QUALITY_TIERS.map((tier) => tier.name), defaultQuality(window.matchMedia('(pointer: coarse)').matches));
  audio.element.append(quality.element);
  const perf = make('div', 'perf');
  const perfFps = make('span', 'fps', '-- fps');
  const perfQuality = createSwapText('quality', '');
  const perfSize = make('span', 'size', '');
  perf.append(perfFps, perfQuality.element, perfSize);

  root.append(shade, lobby, lap, score, drift, toast.element, countdown.element, speedo, audio.element, perf, curtain);

  const totalSpring: SpringState = { x: 0, v: 0 };
  let toastTimer = 0, countdownTimer = 0, textDue = 0;
  let mode: GameMode = 'boot';

  const pulse = (element: HTMLElement, frames: Keyframe[]): void => {
    element.animate(frames, { duration: springSeconds(UI_SPRINGS.bouncy) * 1000, easing: springEasing(UI_SPRINGS.bouncy) });
  };

  return {
    setMode(next) {
      mode = next;
      root.dataset['mode'] = next;
      if (next === 'lobby') startLabel.set('Drive');
    },
    setReady() {
      start.disabled = false;
      startLabel.set('Enter');
    },
    onStart(handler) {
      start.addEventListener('click', () => {
        start.blur();
        handler();
      });
    },
    onHover(handler) {
      start.addEventListener('pointerenter', handler);
    },
    onTrack(handler) { picker.onChange(handler); },
    update(view, dt) {
      stepSpring(totalSpring, view.total, UI_SPRINGS.smooth, dt);
      rpmFill.style.transform = `scaleX(${view.rpm.toFixed(3)})`;
      boostFill.style.transform = `scaleX(${view.boost.toFixed(3)})`;
      damageFill.style.transform = `scaleX(${view.damage.toFixed(3)})`;
      textDue -= dt;
      if (textDue > 0) return;
      textDue = TEXT_SECONDS;
      speed.textContent = String(Math.round(view.speedKmh));
      gear.set(view.reversing ? 'R' : String(view.gear + 1));
      boostBar.classList.toggle('firing', view.boosting);
      lapNumber.set(String(Math.max(1, view.lap)));
      lapNow.textContent = formatLapTime(view.lapSeconds);
      lapLast.set(formatLapTime(view.lastLap));
      lapBest.set(formatLapTime(view.bestLap));
      total.textContent = Math.max(0, Math.round(totalSpring.x)).toLocaleString('en-US');
      bestDrift.set(`${bestLabel} ${view.bestDrift.toLocaleString('en-US')}`);
      drift.classList.toggle('on', view.driftActive && mode === 'racing');
      if (view.driftActive) {
        driftPoints.textContent = Math.round(view.driftPoints).toLocaleString('en-US');
        driftMulti.set(`×${view.driftMultiplier}`);
      }
    },
    countdown(text) {
      countdown.set(text);
      window.clearTimeout(countdownTimer);
      countdownTimer = window.setTimeout(() => countdown.set(''), COUNTDOWN_SECONDS * 1000);
    },
    toast(text, tone) {
      toast.element.dataset['tone'] = tone;
      toast.set(text);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.set(''), TOAST_SECONDS * 1000);
    },
    driftBanked() {
      pulse(total, [{ transform: 'scale(1.35)', color: '#7dffb0' }, { transform: 'scale(1)', color: '#f3f6fb' }]);
    },
    driftFailed() {
      pulse(score, [{ transform: 'translateX(-12px)' }, { transform: 'translateX(0)' }]);
    },
    get audio() { return audio.setting; },
    onAudio(handler) { audio.onChange(handler); },
    toggleMute() { return audio.toggleMute(); },
    get quality() { return quality.choice; },
    onQuality(handler) { quality.onChange(handler); },
    setQuality(choice) { quality.set(choice); },
    perf(fps, quality, width, height) {
      perfFps.textContent = `${Math.round(fps)} fps`;
      perfQuality.set(quality);
      perfSize.textContent = `${width}×${height}`;
    },
  };
}
