import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PLAYGAMA_BRIDGE, PORTAL_BUILDS, portalBuildOf, type PortalBuild } from '../src/portal/builds.ts';

const PORTAL_CHECK = {
  maxFiles: 1000,
  maxTotalBytes: 200 * 1024 * 1024,
  forbiddenFolder: 'local',
  outsideAddress: /https?:\/\/(?!www\.w3\.org\/)[a-z0-9.-]+\.[a-z]{2,}/gi,
  firstScript: /<script\b[^>]*\ssrc="([^"]*)"/,
} as const;

interface PortalHost {
  readonly addresses: readonly string[];
  readonly files: readonly string[];
  readonly firstScript: string | null;
}

const HOST: Readonly<Record<PortalBuild['mode'], PortalHost>> = {
  [PORTAL_BUILDS.portal.mode]: { addresses: [], files: [], firstScript: null },
  [PORTAL_BUILDS.playgama.mode]: { addresses: [new URL(PLAYGAMA_BRIDGE.script).origin], files: [PLAYGAMA_BRIDGE.config], firstScript: PLAYGAMA_BRIDGE.script },
};

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const build = portalBuildOf(process.argv[2] ?? PORTAL_BUILDS.portal.mode);
if (build === null) {
  console.error(`unknown portal build ${process.argv[2] ?? ''}`);
  process.exit(1);
}
const host = HOST[build.mode];
const files = walk(build.outDir);
const problems: string[] = [];
const total = files.reduce((sum, path) => sum + statSync(path).size, 0);
for (const path of files) {
  const inside = relative(build.outDir, path);
  if (inside.split('/').includes(PORTAL_CHECK.forbiddenFolder)) problems.push(`${inside} is a private asset`);
  if (inside.endsWith('.html')) {
    for (const address of readFileSync(path, 'utf8').match(PORTAL_CHECK.outsideAddress) ?? []) {
      if (!host.addresses.includes(address)) problems.push(`${inside} names ${address}`);
    }
  }
}
for (const file of host.files) if (!existsSync(join(build.outDir, file))) problems.push(`${file} is missing`);
if (host.firstScript !== null) {
  const first = PORTAL_CHECK.firstScript.exec(readFileSync(join(build.outDir, 'index.html'), 'utf8'));
  if (first?.[1] !== host.firstScript) problems.push(`the first script is ${first?.[1] ?? 'missing'}, not ${host.firstScript}`);
}
if (files.length > PORTAL_CHECK.maxFiles) problems.push(`${files.length} files`);
if (total > PORTAL_CHECK.maxTotalBytes) problems.push(`${(total / 1048576).toFixed(1)} MB`);
const zipBytes = statSync(build.zip).size;
console.log(`${build.outDir}: ${files.length} files, ${(total / 1048576).toFixed(1)} MB; ${build.zip}: ${(zipBytes / 1048576).toFixed(1)} MB`);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
