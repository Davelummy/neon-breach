import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function commandExists(command) {
  return spawnSync('sh', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
    stdio: 'pipe'
  }).status === 0;
}

function anyPath(paths) {
  return paths.some((path) => existsSync(path));
}

function mark(value) {
  return value ? 'READY' : 'MISSING';
}

const checks = [
  ['Node.js', commandExists('node')],
  ['npm/npx', commandExists('npm') && commandExists('npx')],
  ['uv/uvx', commandExists('uv') && commandExists('uvx')],
  [
    'Google Chrome',
    commandExists('google-chrome') ||
      commandExists('chromium') ||
      anyPath([
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ])
  ],
  [
    'Blender',
    commandExists('blender') ||
      anyPath(['/Applications/Blender.app/Contents/MacOS/Blender'])
  ],
  ['Docker', commandExists('docker')],
  ['MESHY_API_KEY', Boolean(process.env.MESHY_API_KEY)],
  ['ELEVENLABS_API_KEY', Boolean(process.env.ELEVENLABS_API_KEY)],
  ['BrowserStack credentials', Boolean(process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY)],
  ['SonarQube credentials', Boolean(process.env.SONARQUBE_TOKEN && process.env.SONARQUBE_ORG)]
];

const width = Math.max(...checks.map(([label]) => label.length));
console.log('NEON BREACH MCP prerequisite check\n');
for (const [label, ready] of checks) {
  console.log(`${label.padEnd(width)}  ${mark(ready)}`);
}

console.log('\nMissing account credentials are expected until their MCP is activated.');
console.log('OAuth servers (Sentry and PostHog) are authenticated inside Codex.');
