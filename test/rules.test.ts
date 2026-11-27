import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOTS = ['src', 'sim', 'test', 'tools', 'blender'];
const CODE = /\.(ts|py|css)$/;
const MAX_LINES = 800;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return CODE.test(name) ? [path] : [];
  });
}

const sources = ROOTS.flatMap(files).map((path) => ({ path, lines: readFileSync(path, 'utf8').split('\n') }));
const BLOCK_OPEN = '/' + '*';
const SLASH_COMMENT = new RegExp('^\\s*/' + '/');
const HASH_COMMENT = new RegExp('^\\s*#');
const isLineComment = (path: string, line: string): boolean => (path.endsWith('.py') ? HASH_COMMENT.test(line) : !path.endsWith('.css') && SLASH_COMMENT.test(line));
const BANNED = [new RegExp(':\\s*an' + 'y\\b'), new RegExp('as an' + 'y\\b'), new RegExp('@ts-' + 'ignore'), new RegExp('@ts-' + 'expect-error')];
const NON_NULL = new RegExp('[\\w\\])]' + '!');

test('source files carry no comments', () => {
  for (const { path, lines } of sources) {
    lines.forEach((line, i) => {
      assert.ok(!line.includes(BLOCK_OPEN), `${path}:${i + 1} has a block comment`);
      assert.ok(!isLineComment(path, line), `${path}:${i + 1} has a line comment`);
    });
  }
});

test('typescript avoids escape hatches', () => {
  for (const { path, lines } of sources.filter((source) => source.path.endsWith('.ts'))) {
    lines.forEach((line, i) => {
      for (const pattern of BANNED) assert.ok(!pattern.test(line), `${path}:${i + 1} matches ${pattern}`);
      assert.ok(!NON_NULL.test(line.replace(/!==?/g, '')), `${path}:${i + 1} uses a non-null assertion`);
    });
  }
});

test('shaders never raise a possibly negative number to a power', () => {
  const power = new RegExp('pow\\(\\s*(?!max\\()');
  for (const { path, lines } of sources.filter((source) => source.path.startsWith('src') && !source.path.endsWith('.test.ts'))) {
    lines.forEach((line, i) => assert.ok(!power.test(line), `${path}:${i + 1} calls pow without max(base, 0.0)`));
  }
});

test('no source file grows past the size limit', () => {
  for (const { path, lines } of sources) assert.ok(lines.length <= MAX_LINES, `${path} has ${lines.length} lines`);
});

test('every test file sits beside the file it tests', () => {
  for (const { path } of sources.filter((source) => source.path.endsWith('.test.ts') && !source.path.startsWith('test'))) {
    assert.ok(statSync(path.replace('.test.ts', '.ts')).isFile(), `${path} has no source file`);
  }
});
