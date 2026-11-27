import { isPortalMode } from './portal/builds.ts';

export const LOCAL_ASSETS = {
  directory: 'local',
  manifest: 'local/manifest.json',
} as const;

export interface LocalManifest {
  readonly sounds: readonly string[];
  readonly cast: readonly string[];
}

export const NO_LOCAL_ASSETS: LocalManifest = { sounds: [], cast: [] };

const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && SAFE_NAME.test(entry));
}

export function parseLocalManifest(value: unknown): LocalManifest {
  if (typeof value !== 'object' || value === null) return NO_LOCAL_ASSETS;
  return { sounds: names(Reflect.get(value, 'sounds')), cast: names(Reflect.get(value, 'cast')) };
}

export const localSoundUrl = (name: string): string => `${LOCAL_ASSETS.directory}/audio/${name}.ogg`;
export const localCastUrl = (file: string): string => `${LOCAL_ASSETS.directory}/models/cast/${file}.glb`;

let pending: Promise<LocalManifest> | null = null;

async function fetchManifest(): Promise<LocalManifest> {
  if (isPortalMode(import.meta.env.MODE)) return NO_LOCAL_ASSETS;
  try {
    const response = await fetch(LOCAL_ASSETS.manifest);
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('json')) return NO_LOCAL_ASSETS;
    return parseLocalManifest(await response.json());
  } catch {
    return NO_LOCAL_ASSETS;
  }
}

export function localAssets(): Promise<LocalManifest> {
  pending ??= fetchManifest();
  return pending;
}
