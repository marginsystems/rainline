import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const PRIVATE_FOLDER = join('public', 'local');
const NOT_ASSETS = new Set(['.DS_Store']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (path === PRIVATE_FOLDER || NOT_ASSETS.has(name)) return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const listed = new Set([...readFileSync('ASSETS.md', 'utf8').matchAll(/`(public\/[^`]+\.[a-z0-9]+)`/g)].map((match) => match[1]));

test('every shipped file has a row in ASSETS.md', () => {
  for (const path of files('public')) assert.ok(listed.has(path), `${path} is not in ASSETS.md`);
});

test('ASSETS.md lists no file that is not shipped', () => {
  const shipped = new Set(files('public'));
  for (const path of listed) assert.ok(shipped.has(path ?? ''), `${path} is in ASSETS.md but not in public/`);
});
