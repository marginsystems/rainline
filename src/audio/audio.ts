import { localAssets } from '../local-assets.ts';
import { ALL_SOUNDS, engineMix, LOBBY_MUSIC, LOOP_SOUNDS, MEME_MUSIC, RACE_MUSIC, soundUrls, type LoopSound, type MusicSound, type ShotSound, type SoundName } from './sounds.ts';

export const MIX = {
  master: 0.85,
  music: 0.42,
  engine: 0.5,
  skid: 0.55,
  rain: 0.3,
  wind: 0.5,
  road: 0.35,
  gravel: 0.6,
  scrape: 0.32,
  nitro: 0.6,
  impact: 0.3,
  lobbyEngine: 0.22,
  musicFadeSeconds: 0.5,
  smoothing: 0.06,
} as const;

export type MusicMood = 'lobby' | 'race' | 'meme' | 'off';

export interface AudioFrame {
  readonly racing: boolean;
  readonly rpm: number;
  readonly throttle: number;
  readonly speed: number;
  readonly slip: number;
  readonly drifting: boolean;
  readonly handbrake: boolean;
  readonly onRoad: boolean;
  readonly wallContact: boolean;
  readonly boosting: boolean;
  readonly rain: number;
}

export interface GameAudio {
  unlock(): void;
  frame(frame: AudioFrame): void;
  play(name: ShotSound, volume?: number, rate?: number): void;
  music(mood: MusicMood): void;
  setVolume(volume: number, muted: boolean): void;
  hold(held: boolean): void;
}

interface LoopVoice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

interface Rig {
  readonly context: AudioContext;
  readonly sfx: GainNode;
  readonly ambience: GainNode;
  readonly music: GainNode;
  readonly master: GainNode;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function createAudio(): GameAudio {
  const buffers = new Map<SoundName, AudioBuffer>();
  const loops = new Map<LoopSound, LoopVoice>();
  const lastPlayed = new Map<ShotSound, number>();
  let rig: Rig | null = null;
  let loaded = false;
  let mood: MusicMood = 'off';
  let volume = 1;
  let muted = false;
  let held = false;
  let playing: { readonly name: MusicSound; readonly voice: LoopVoice } | null = null;
  let raceTurn = 0;

  async function load(context: AudioContext, name: SoundName, local: readonly string[]): Promise<void> {
    for (const url of soundUrls(name, local)) {
      try {
        const response = await fetch(url);
        if (!response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) continue;
        buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
        return;
      } catch {
        continue;
      }
    }
  }

  function startLoop(active: Rig, name: LoopSound | MusicSound, bus: GainNode): LoopVoice | null {
    const buffer = buffers.get(name);
    if (!buffer) return null;
    const source = active.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = active.context.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(bus);
    source.start();
    return { source, gain };
  }

  function setLoop(name: LoopSound, volume: number, rate = 1): void {
    const voice = loops.get(name);
    if (!voice || !rig) return;
    const now = rig.context.currentTime;
    voice.gain.gain.setTargetAtTime(volume, now, MIX.smoothing);
    voice.source.playbackRate.setTargetAtTime(rate, now, MIX.smoothing);
  }

  function applyMusic(): void {
    if (!rig || !loaded) return;
    const active = rig;
    const candidates = mood === 'lobby' ? LOBBY_MUSIC : mood === 'race' ? RACE_MUSIC : mood === 'meme' ? MEME_MUSIC : [];
    const available = candidates.filter((name) => buffers.has(name));
    const wanted = available.length > 0 ? available[mood === 'race' || mood === 'meme' ? raceTurn % available.length : 0] ?? null : null;
    if (playing && playing.name === wanted) return;
    const now = active.context.currentTime;
    if (playing) {
      const old = playing.voice;
      old.gain.gain.setTargetAtTime(0, now, MIX.musicFadeSeconds);
      old.source.stop(now + MIX.musicFadeSeconds * 6);
      playing = null;
    }
    if (!wanted) return;
    const voice = startLoop(active, wanted, active.music);
    if (!voice) return;
    voice.gain.gain.setTargetAtTime(1, now, MIX.musicFadeSeconds);
    playing = { name: wanted, voice };
  }

  function settle(context: AudioContext): void {
    void (document.hidden || held ? context.suspend() : context.resume());
  }

  async function boot(active: Rig): Promise<void> {
    const local = (await localAssets()).sounds;
    await Promise.all(ALL_SOUNDS.map((name) => load(active.context, name, local)));
    for (const name of LOOP_SOUNDS) {
      const voice = startLoop(active, name, name === 'rain-loop' || name === 'rain-heavy-loop' || name === 'wind-loop' ? active.ambience : active.sfx);
      if (voice) loops.set(name, voice);
    }
    loaded = true;
    applyMusic();
  }

  return {
    unlock() {
      if (rig) {
        settle(rig.context);
        return;
      }
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = muted ? 0 : MIX.master * volume;
      const compressor = context.createDynamicsCompressor();
      master.connect(compressor).connect(context.destination);
      const bus = (volume: number): GainNode => {
        const gain = context.createGain();
        gain.gain.value = volume;
        gain.connect(master);
        return gain;
      };
      rig = { context, sfx: bus(1), ambience: bus(1), music: bus(MIX.music), master };
      document.addEventListener('visibilitychange', () => settle(context));
      settle(context);
      void boot(rig);
    },
    frame(frame) {
      if (!rig || !loaded) return;
      const available = LOOP_SOUNDS.filter((name) => loops.has(name));
      const speed01 = clamp01(frame.speed / 70);
      const engineVolume = frame.racing ? MIX.engine * (0.35 + 0.45 * frame.throttle + 0.2 * frame.rpm) : MIX.engine * MIX.lobbyEngine;
      const mix = engineMix(frame.racing ? frame.rpm : 0.2, available);
      for (const layer of LOOP_SOUNDS.filter((name) => name.startsWith('engine'))) {
        const part = mix.find((entry) => entry.name === layer);
        setLoop(layer, part ? part.volume * engineVolume : 0, part ? part.rate : 1);
      }
      const sliding = frame.racing && frame.drifting && frame.onRoad ? clamp01((Math.abs(frame.slip) - 0.1) * 2.2) * clamp01(frame.speed / 14) : 0;
      const deep = clamp01((Math.abs(frame.slip) - 0.45) * 3) * (loops.has('skid-loop-2') ? 1 : 0);
      setLoop('skid-loop', MIX.skid * sliding * (1 - deep * 0.7), 0.9 + speed01 * 0.3);
      setLoop('skid-loop-2', MIX.skid * sliding * deep, 0.9 + speed01 * 0.25);
      setLoop('rain-loop', MIX.rain * frame.rain);
      setLoop('rain-heavy-loop', MIX.rain * 0.5 * frame.rain);
      setLoop('wind-loop', MIX.wind * speed01 * speed01, 0.8 + speed01 * 0.5);
      setLoop('road-wet-loop', frame.onRoad ? MIX.road * speed01 * frame.rain : 0, 0.8 + speed01 * 0.5);
      setLoop('gravel-loop', !frame.onRoad ? MIX.gravel * clamp01(frame.speed / 20) : 0, 0.8 + speed01 * 0.6);
      setLoop('scrape-loop', frame.wallContact ? MIX.scrape * clamp01(frame.speed / 15) : 0, 0.8 + speed01 * 0.5);
      setLoop('nitro-loop', frame.boosting ? MIX.nitro : 0);
    },
    play(name, volume = 1, rate = 1) {
      const buffer = buffers.get(name);
      if (!rig || !buffer) return;
      const now = rig.context.currentTime;
      if (now - (lastPlayed.get(name) ?? -1) < 0.08) return;
      lastPlayed.set(name, now);
      const source = rig.context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = rig.context.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(name.startsWith('thunder') ? rig.ambience : rig.sfx);
      source.start();
    },
    music(next) {
      if ((next === 'race' || next === 'meme') && mood !== next) raceTurn++;
      mood = next;
      applyMusic();
    },
    setVolume(nextVolume, nextMuted) {
      volume = clamp01(nextVolume);
      muted = nextMuted;
      if (rig) rig.master.gain.setTargetAtTime(muted ? 0 : MIX.master * volume, rig.context.currentTime, MIX.smoothing);
    },
    hold(next) {
      if (next === held) return;
      held = next;
      if (rig) settle(rig.context);
    },
  };
}
