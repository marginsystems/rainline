export interface PortalSdk {
  ready(): void;
  raceEnded(): void;
  paused(): boolean;
}

export const NO_PORTAL: PortalSdk = {
  ready: () => undefined,
  raceEnded: () => undefined,
  paused: () => false,
};
