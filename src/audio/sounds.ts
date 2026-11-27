import { localSoundUrl } from '../local-assets.ts';

export const LOOP_SOUNDS = [
  'engine-loop', 'engine-idle-loop', 'engine-low-loop', 'engine-mid-loop', 'engine-high-loop', 'skid-loop', 'skid-loop-2', 'rain-loop', 'rain-heavy-loop',
  'wind-loop', 'road-wet-loop', 'gravel-loop', 'scrape-loop', 'nitro-loop',
] as const;

export const SHOT_SOUNDS = [
  'impact', 'impact-heavy', 'impact-light', 'boost', 'boost-end', 'engine-start', 'gear-shift', 'turbo-blowoff', 'backfire-1', 'backfire-2', 'tyre-chirp', 'splash',
  'thunder-1', 'thunder-2', 'ui-hover', 'ui-click', 'ui-start', 'countdown-beep', 'countdown-go', 'lap-complete', 'best-lap', 'score-bank', 'combo-up', 'drift-fail', 'horn',
  'meme-kick-1', 'meme-kick-2', 'meme-kick-3', 'meme-kick-4', 'meme-kick-5', 'meme-kick-6', 'meme-kick-7', 'meme-kick-8',
  'meme-whoosh', 'meme-whoosh-2', 'meme-whoosh-3', 'meme-slide-whistle', 'meme-slide-whistle-2', 'meme-slide-whistle-3', 'meme-airhorn', 'meme-airhorn-2',
  'meme-vocal-1', 'meme-vocal-2', 'meme-vocal-3', 'meme-vocal-4', 'meme-vocal-5', 'meme-vocal-6', 'meme-vocal-7', 'meme-vocal-8', 'meme-vocal-9',
  'meme-bus-horn', 'meme-horn-2', 'meme-horn-3', 'meme-horn-4', 'meme-ouch', 'meme-ouch-2', 'meme-ouch-3', 'meme-crash', 'meme-crash-2', 'meme-crash-3',
  'meme-fanfare', 'meme-fanfare-2', 'meme-record-scratch', 'meme-boing-1', 'meme-boing-2',
] as const;

export const MUSIC_SOUNDS = ['lobby-music', 'race-music-1', 'race-music-2', 'music-loop', 'meme-music-loop', 'meme-music-loop-2', 'meme-music-loop-3'] as const;

export type LoopSound = (typeof LOOP_SOUNDS)[number];
export type ShotSound = (typeof SHOT_SOUNDS)[number];
export type MusicSound = (typeof MUSIC_SOUNDS)[number];
export type SoundName = LoopSound | ShotSound | MusicSound;

export const ALL_SOUNDS: readonly SoundName[] = [...LOOP_SOUNDS, ...SHOT_SOUNDS, ...MUSIC_SOUNDS];

export const FALLBACK_SOUNDS: Partial<Record<SoundName, string>> = {
  'engine-loop': 'audio/fallback/engine.ogg',
  'skid-loop': 'audio/fallback/skid.ogg',
  impact: 'audio/fallback/impact.ogg',
};

export const soundUrl = (name: SoundName): string => `audio/${name}.ogg`;

export function soundUrls(name: SoundName, local: readonly string[]): string[] {
  const fallback = FALLBACK_SOUNDS[name];
  return [...(local.includes(name) ? [localSoundUrl(name)] : []), soundUrl(name), ...(fallback ? [fallback] : [])];
}

export const ENGINE_LAYERS: readonly { readonly name: LoopSound; readonly centre: number }[] = [
  { name: 'engine-idle-loop', centre: 0.2 },
  { name: 'engine-low-loop', centre: 0.42 },
  { name: 'engine-mid-loop', centre: 0.66 },
  { name: 'engine-high-loop', centre: 0.9 },
];

export const LOBBY_MUSIC: readonly MusicSound[] = ['lobby-music', 'music-loop'];
export const RACE_MUSIC: readonly MusicSound[] = ['race-music-1', 'race-music-2', 'music-loop'];
export const MEME_MUSIC: readonly MusicSound[] = ['meme-music-loop', 'meme-music-loop-2', 'meme-music-loop-3'];
export const MEME_KICKS: readonly ShotSound[] = ['meme-kick-1', 'meme-kick-2', 'meme-kick-3', 'meme-kick-4', 'meme-kick-5', 'meme-kick-6', 'meme-kick-7', 'meme-kick-8'];
export const MEME_VOCALS: readonly ShotSound[] = ['meme-vocal-1', 'meme-vocal-2', 'meme-vocal-3', 'meme-vocal-4', 'meme-vocal-5', 'meme-vocal-6', 'meme-vocal-7', 'meme-vocal-8', 'meme-vocal-9'];
export const MEME_WHOOSHES: readonly ShotSound[] = ['meme-whoosh', 'meme-whoosh-2', 'meme-whoosh-3'];
export const MEME_WHISTLES: readonly ShotSound[] = ['meme-slide-whistle', 'meme-slide-whistle-2', 'meme-slide-whistle-3'];
export const MEME_HORNS: readonly ShotSound[] = ['meme-bus-horn', 'meme-horn-2', 'meme-horn-3', 'meme-horn-4'];
export const MEME_CRASHES: readonly ShotSound[] = ['meme-crash', 'meme-crash-2', 'meme-crash-3'];
export const MEME_OUCHES: readonly ShotSound[] = ['meme-ouch', 'meme-ouch-2', 'meme-ouch-3'];
export const MEME_AIRHORNS: readonly ShotSound[] = ['meme-airhorn', 'meme-airhorn-2'];
export const MEME_FANFARES: readonly ShotSound[] = ['meme-fanfare', 'meme-fanfare-2'];
export const MEME_BOINGS: readonly ShotSound[] = ['meme-boing-1', 'meme-boing-2'];

export interface EngineMix {
  readonly name: LoopSound;
  readonly volume: number;
  readonly rate: number;
}

const LAYER_WIDTH = 0.3;

export function engineMix(rpm: number, available: readonly LoopSound[]): EngineMix[] {
  const layers = ENGINE_LAYERS.filter((layer) => available.includes(layer.name));
  if (layers.length < 2) return available.includes('engine-loop') ? [{ name: 'engine-loop', volume: 1, rate: 0.55 + rpm * 1.45 }] : [];
  const lowest = layers[0], highest = layers[layers.length - 1];
  const weights = layers.map((layer) => {
    if (layer === lowest && rpm <= layer.centre) return 1;
    if (layer === highest && rpm >= layer.centre) return 1;
    return Math.max(0, 1 - Math.abs(rpm - layer.centre) / LAYER_WIDTH);
  });
  const norm = Math.sqrt(weights.reduce((sum, weight) => sum + weight * weight, 0)) || 1;
  return layers.map((layer, i) => ({ name: layer.name, volume: (weights[i] ?? 0) / norm, rate: Math.min(1.5, Math.max(0.7, 1 + (rpm - layer.centre) * 1.1)) }));
}
