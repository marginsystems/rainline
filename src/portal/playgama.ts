import { BRIDGE, startBridge, type Bridge } from './bridge.ts';
import { NO_PORTAL, type PortalSdk } from './portal.ts';

export const PLAYGAMA = {
  startWaitMs: 8000,
} as const;

export type Wait = (ms: number) => Promise<void>;

function quietly(work: () => void): void {
  try {
    work();
  } catch {
    return;
  }
}

export function playgamaSdk(bridge: Bridge, hidden: () => boolean): PortalSdk {
  let platformPaused = false;
  let adOpen = false;
  let readySent = false;
  bridge.onPause((paused) => {
    platformPaused = paused;
  });
  bridge.onInterstitial((state) => {
    adOpen = state === 'opened';
  });
  return {
    paused: () => platformPaused || adOpen,
    ready() {
      if (readySent) return;
      readySent = true;
      quietly(() => bridge.sendMessage(BRIDGE.ready));
    },
    raceEnded() {
      if (hidden() || adOpen || platformPaused) return;
      quietly(() => bridge.showInterstitial());
    },
  };
}

export async function startPlaygama(root: unknown, wait: Wait, hidden: () => boolean): Promise<PortalSdk> {
  const starting = startBridge(root).catch((): null => null);
  const bridge = await Promise.race([starting, wait(PLAYGAMA.startWaitMs).then((): null => null)]);
  return bridge === null ? NO_PORTAL : playgamaSdk(bridge, hidden);
}
