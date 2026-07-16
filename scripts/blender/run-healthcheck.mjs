import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLENDER_BINARY = '/Applications/Blender.app/Contents/MacOS/Blender';
const HEALTHCHECK_SCRIPT = fileURLToPath(new URL('./healthcheck.py', import.meta.url));
const REPOSITORY_ROOT = resolve(dirname(HEALTHCHECK_SCRIPT), '../..');
const BLENDER_ARGUMENTS = Object.freeze([
  '--background',
  '--factory-startup',
  '--disable-autoexec',
  '--python',
  HEALTHCHECK_SCRIPT
]);
const CHILD_ENVIRONMENT = Object.freeze({ LANG: 'C', LC_ALL: 'C' });

if (process.argv.length !== 2) {
  console.error('blender:check accepts no arguments.');
  process.exit(64);
}

if (!existsSync(BLENDER_BINARY)) {
  console.error('Blender was not found at the approved application path.');
  process.exit(1);
}

const result = spawnSync(BLENDER_BINARY, BLENDER_ARGUMENTS, {
  cwd: REPOSITORY_ROOT,
  env: CHILD_ENVIRONMENT,
  shell: false,
  stdio: 'inherit',
  timeout: 120_000
});

if (result.error) {
  console.error(`Blender healthcheck failed to start: ${result.error.code || result.error.name}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`Blender healthcheck stopped by signal: ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
