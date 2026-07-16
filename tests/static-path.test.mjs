import test from 'node:test';
import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { resolveStaticPath } from '../scripts/static-path.mjs';

const root = join(sep, 'srv', 'app', 'public');

test('root path maps to index.html', () => {
  assert.equal(resolveStaticPath(root, '/'), join(root, 'index.html'));
});

test('normal asset paths resolve inside root', () => {
  assert.equal(resolveStaticPath(root, '/assets/scout.webp'), join(root, 'assets', 'scout.webp'));
});

test('dot-dot traversal is rejected', () => {
  assert.equal(resolveStaticPath(root, '/../secrets.txt'), null);
  assert.equal(resolveStaticPath(root, '/a/../../secrets.txt'), null);
  assert.equal(resolveStaticPath(root, '/../../../../etc/passwd'), null);
});

test('sibling directory sharing the root prefix is rejected', () => {
  // /srv/app/public-evil starts with /srv/app/public but is outside root.
  assert.equal(resolveStaticPath(root, '/../public-evil/index.html'), null);
});

test('exact root resolves (directory itself, later fails existsSync as a file)', () => {
  assert.equal(resolveStaticPath(root, '/.'), root);
});
