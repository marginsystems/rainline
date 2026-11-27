import { cpSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const PORTAL = {
  mode: 'portal',
  outDir: 'dist-portal',
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

function copyPublic(portal: boolean, outDir: string): Plugin {
  return {
    name: 'copy-public',
    apply: 'build',
    writeBundle() {
      cpSync('public', outDir, { recursive: true, filter: (source) => shipped(portal, source) });
    },
    transformIndexHtml(html) {
      return portal ? html.replace(PORTAL.siteOnlyTags, '') : html;
    },
  };
}

export default defineConfig(({ mode }) => {
  const portal = mode === PORTAL.mode;
  const outDir = portal ? PORTAL.outDir : 'dist';
  return {
    base: './',
    server: { port: 5183, open: false },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      outDir,
      copyPublicDir: false,
    },
    plugins: [copyPublic(portal, outDir)],
  };
});
