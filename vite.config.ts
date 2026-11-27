import { cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { bridgeConfigText, PLAYGAMA_BRIDGE, PORTAL_BUILDS, portalBuildOf, withFirstScript } from './src/portal/builds.ts';

const PORTAL = {
  privateFolder: 'local',
  siteOnly: ['og.jpg'],
  siteOnlyTags: /\s*<meta (property="og:|name="twitter:)[^>]*>/g,
} as const;

function shipped(portal: boolean, source: string): boolean {
  const parts = source.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1] ?? '';
  if (parts.some((part) => part.startsWith('.'))) return false;
  if (parts.includes(PORTAL.privateFolder)) return !portal && !name.endsWith('.md');
  return !portal || !PORTAL.siteOnly.some((file) => file === name);
}

function copyPublic(portal: boolean, playgama: boolean, outDir: string): Plugin {
  return {
    name: 'copy-public',
    apply: 'build',
    writeBundle() {
      cpSync('public', outDir, { recursive: true, filter: (source) => shipped(portal, source) });
      if (playgama) writeFileSync(join(outDir, PLAYGAMA_BRIDGE.config), bridgeConfigText());
    },
    transformIndexHtml(html) {
      const page = portal ? html.replace(PORTAL.siteOnlyTags, '') : html;
      return playgama ? withFirstScript(page, PLAYGAMA_BRIDGE.script) : page;
    },
  };
}

export default defineConfig(({ mode }) => {
  const build = portalBuildOf(mode);
  const outDir = build ? build.outDir : 'dist';
  return {
    base: './',
    server: { port: 5183, open: false },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      outDir,
      copyPublicDir: false,
    },
    plugins: [copyPublic(build !== null, build?.mode === PORTAL_BUILDS.playgama.mode, outDir)],
  };
});
