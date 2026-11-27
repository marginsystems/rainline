export const PORTAL_BUILDS = {
  portal: { mode: 'portal', outDir: 'dist-portal', zip: 'rainline-portal.zip' },
  playgama: { mode: 'playgama', outDir: 'dist-playgama', zip: 'rainline-playgama.zip' },
} as const;

export type PortalBuild = (typeof PORTAL_BUILDS)[keyof typeof PORTAL_BUILDS];

export const PLAYGAMA_BRIDGE = {
  script: 'https://bridge.playgama.com/v2/stable/playgama-bridge.js',
  config: 'playgama-bridge-config.json',
  settings: { advertisement: { interstitial: { preloadOnStart: true } } },
} as const;

const CHARSET = /<meta charset="[^"]*"\s*\/?>/;

export function portalBuildOf(mode: string): PortalBuild | null {
  return Object.values(PORTAL_BUILDS).find((build) => build.mode === mode) ?? null;
}

export const isPortalMode = (mode: string): boolean => portalBuildOf(mode) !== null;

export function withFirstScript(html: string, script: string): string {
  const charset = CHARSET.exec(html);
  if (charset === null) throw new Error('the page has no charset meta to put the host script after');
  const at = charset.index + charset[0].length;
  return `${html.slice(0, at)}<script src="${script}"></script>${html.slice(at)}`;
}

export const bridgeConfigText = (): string => `${JSON.stringify(PLAYGAMA_BRIDGE.settings, null, 2)}\n`;
