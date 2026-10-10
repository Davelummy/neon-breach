import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) throw new Error('This test command accepts no arguments');
const root = fileURLToPath(new URL('../../', import.meta.url));
const jar = join(homedir(), '.cache/firebase/emulators/cloud-firestore-emulator-v1.19.8.jar');
const rules = join(root, 'scripts/firebase/firestore.rules');
await access(jar); await access(rules);
// Refuse to reuse or reset another running emulator/service.
await new Promise((resolve, reject) => {
  const probe = createServer(); probe.once('error', () => reject(new Error('Local test port 8088 is already in use')));
  probe.listen(8088, '127.0.0.1', () => probe.close(resolve));
});
let java, tests;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill('SIGTERM');
  });
}
const signal = () => { tests?.kill('SIGTERM'); java?.kill('SIGTERM'); };
process.once('SIGINT', signal); process.once('SIGTERM', signal);
try {
  java = spawn('/usr/bin/java', ['-jar', jar, '--host', '127.0.0.1', '--port', '8088',
    '--project_id', 'demo-neon-breach', '--single_project_mode', 'true', '--single_project_mode_error', 'true', '--rules', rules],
  { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Cached emulator startup timed out')), 30000);
    let output = '';
    const read = chunk => { output = (output + chunk).slice(-8000); if (output.includes('Dev App Server is now running')) { clearTimeout(timer); resolve(); } };
    java.stdout.on('data', read); java.stderr.on('data', read);
    java.once('error', () => { clearTimeout(timer); reject(new Error('Java emulator could not start')); });
    java.once('exit', code => { clearTimeout(timer); reject(new Error(`Java emulator exited before tests (${code})`)); });
  });
  console.log('Cached Firestore emulator ready: localhost / demo-neon-breach');
  tests = spawn(process.execPath, ['--test', 'tests/firebase/integration.test.mjs'], { cwd: root,
    env: { PATH: process.env.PATH, HOME: homedir(), FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088',
      GCLOUD_PROJECT: 'demo-neon-breach', FIREBASE_TEST_DEMO: '1' }, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { tests.kill('SIGTERM'); }, 120000);
    tests.once('error', error => { clearTimeout(timer); reject(error); });
    tests.once('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });
} finally {
  await stop(tests); await stop(java);
  console.log('Local test emulator stopped; no data exported or deployed');
}
