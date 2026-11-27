import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PORTAL_CHECK = {
  directory: 'dist-portal',
  zip: 'rainline-portal.zip',
  maxFiles: 1000,
  maxTotalBytes: 200 * 1024 * 1024,
  forbiddenFolder: 'local',
  outsideAddress: /https?:\/\/(?!www\.w3\.org\/)[a-z0-9.-]+\.[a-z]{2,}/gi,
} as const;

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(PORTAL_CHECK.directory);
const problems: string[] = [];
const total = files.reduce((sum, path) => sum + statSync(path).size, 0);
for (const path of files) {
  const inside = relative(PORTAL_CHECK.directory, path);
  if (inside.split('/').includes(PORTAL_CHECK.forbiddenFolder)) problems.push(`${inside} is a private asset`);
  if (inside.endsWith('.html')) {
    for (const address of readFileSync(path, 'utf8').match(PORTAL_CHECK.outsideAddress) ?? []) problems.push(`${inside} names ${address}`);
  }
}
if (files.length > PORTAL_CHECK.maxFiles) problems.push(`${files.length} files`);
if (total > PORTAL_CHECK.maxTotalBytes) problems.push(`${(total / 1048576).toFixed(1)} MB`);
const zipBytes = statSync(PORTAL_CHECK.zip).size;
console.log(`${PORTAL_CHECK.directory}: ${files.length} files, ${(total / 1048576).toFixed(1)} MB; ${PORTAL_CHECK.zip}: ${(zipBytes / 1048576).toFixed(1)} MB`);
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
