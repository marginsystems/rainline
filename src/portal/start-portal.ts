import { NO_PORTAL, type PortalSdk } from './portal.ts';

export function startPortal(): Promise<PortalSdk> {
  return import.meta.env.MODE === 'playgama' ? import('./playgama-browser.ts').then((found) => found.startBrowserPlaygama()) : Promise.resolve(NO_PORTAL);
}
