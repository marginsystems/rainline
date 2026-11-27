import { BRIDGE } from './bridge.ts';
import { startPlaygama } from './playgama.ts';
import type { PortalSdk } from './portal.ts';

export function startBrowserPlaygama(): Promise<PortalSdk> {
  const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
  return startPlaygama(Reflect.get(window, BRIDGE.global), wait, () => document.hidden);
}
