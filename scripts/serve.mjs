import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { resolveStaticPath } from './static-path.mjs';

// Prefer public/ for local play so source edits apply immediately.
// Production: SERVE_DIST=1 npm start   or   node scripts/serve.mjs --dist
const useDist = process.env.SERVE_DIST === '1' || process.argv.includes('--dist');
const root = join(
  process.cwd(),
  useDist && existsSync('dist/index.html')
    ? 'dist'
    : existsSync(join(process.cwd(), 'public', 'neon-breach.html')) || existsSync(join(process.cwd(), 'public', 'game.js'))
      ? 'public'
      : existsSync('dist/index.html') ? 'dist' : 'public'
);
const port = Number(process.env.PORT || 4173);
// Bind all interfaces by default so family/friends on LAN can join.
const host = process.env.HOST || '0.0.0.0';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8'
};

function json(response, status, body, extra = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, accept',
    ...extra
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', c => {
      chunks.push(c);
      if (Buffer.concat(chunks).length > 32_000) {
        reject(new Error('payload too large'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

// —— Party leaderboard (file-backed, works out of the box on LAN) ——
const dataDir = join(process.cwd(), '.data');
const boardPath = join(dataDir, 'leaderboard.json');
const MAX_BOARD = 40;

function ensureBoardFile() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(boardPath)) writeFileSync(boardPath, '[]', 'utf8');
}

function loadBoard() {
  try {
    ensureBoardFile();
    const raw = JSON.parse(readFileSync(boardPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveBoard(entries) {
  ensureBoardFile();
  writeFileSync(boardPath, JSON.stringify(entries.slice(0, MAX_BOARD), null, 0), 'utf8');
}

function sanitizeCallsign(value) {
  const clean = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9_\- ]/g, '')
    .trim()
    .slice(0, 16);
  return clean.length >= 2 ? clean : 'OPERATIVE';
}

function rankedEntries(board) {
  return board
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || Number(b.at || 0) - Number(a.at || 0))
    .slice(0, 25)
    .map((entry, index) => ({
      rank: index + 1,
      callsign: entry.callsign,
      best_score: Number(entry.score || 0),
      score: Number(entry.score || 0),
      kills: Number(entry.kills || 0),
      grade: entry.grade || '—',
      victory: !!entry.victory,
      operation: entry.operation ?? 0,
      difficulty: entry.difficulty || 'operative',
      time_of_day: entry.time_of_day || 'day',
      victories: entry.victory ? 1 : 0,
      at: entry.at || 0,
      you: false
    }));
}

async function handleLeaderboard(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, accept'
    });
    return response.end();
  }

  if (request.method === 'GET') {
    const entries = rankedEntries(loadBoard());
    return json(response, 200, {
      available: true,
      source: 'party',
      entries,
      count: entries.length
    });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = JSON.parse(await readBody(request) || '{}');
    } catch {
      return json(response, 400, { error: 'Invalid JSON body.' });
    }
    const score = Math.max(0, Math.min(9_999_999, Math.floor(Number(body.score) || 0)));
    if (score <= 0) return json(response, 400, { error: 'Score must be positive.' });

    const entry = {
      callsign: sanitizeCallsign(body.callsign),
      score,
      kills: Math.max(0, Math.min(9999, Math.floor(Number(body.kills) || 0))),
      grade: String(body.grade || '—').slice(0, 2).toUpperCase(),
      victory: !!body.victory,
      operation: Math.max(0, Math.min(9, Math.floor(Number(body.operation) || 0))),
      difficulty: ['recruit', 'operative', 'nightmare'].includes(body.difficulty) ? body.difficulty : 'operative',
      time_of_day: body.time_of_day === 'night' ? 'night' : 'day',
      at: Date.now()
    };

    const board = loadBoard();
    board.push(entry);
    board.sort((a, b) => b.score - a.score || b.at - a.at);
    saveBoard(board.slice(0, MAX_BOARD));

    const ranked = rankedEntries(board);
    const mine = ranked.findIndex(
      row => row.callsign === entry.callsign && row.best_score === entry.score && Math.abs((row.at || 0) - entry.at) < 5
    );

    return json(response, 200, {
      available: true,
      source: 'party',
      ok: true,
      rank: mine >= 0 ? mine + 1 : null,
      entries: ranked
    });
  }

  return json(response, 405, { error: 'Method not allowed.' });
}

// In dev (serving from public/) the vendored three.js only exists in
// node_modules; the production build copies it into dist/vendor/.
const vendorFiles = {
  '/vendor/three.module.min.js': join(process.cwd(), 'node_modules', 'three', 'build', 'three.module.min.js'),
  '/vendor/three.core.min.js': join(process.cwd(), 'node_modules', 'three', 'build', 'three.core.min.js')
};

function lanAddresses() {
  const nets = networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/health') return json(response, 200, { status: 'ok', game: 'NEON BREACH' });

    if (pathname.startsWith('/api/')) {
      if (pathname === '/api/campaigns') {
        return json(response, 200, {
          available: false,
          error: 'Campaign cloud is optional — progress is saved on this device.'
        });
      }
      if (pathname === '/api/leaderboard') return handleLeaderboard(request, response);
      return json(response, 404, { error: 'API route not found.' });
    }

    const fallback = existsSync(join(root, 'index.html')) ? 'index.html' : 'neon-breach.html';
    const vendor = vendorFiles[pathname];
    const resolved = vendor && existsSync(vendor) ? vendor : resolveStaticPath(root, pathname);
    const safePath = resolved && existsSync(resolved) ? resolved : join(root, fallback);
    response.setHeader('Content-Type', types[extname(safePath)] || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-cache');
    createReadStream(safePath).pipe(response);
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'Server error' });
  }
}).listen(port, host, () => {
  const from = root.endsWith('dist') ? 'dist (production build)' : 'public (live source)';
  console.log(`NEON BREACH ready  [serving ${from}]`);
  console.log(`  Local:   http://127.0.0.1:${port}`);
  for (const ip of lanAddresses()) {
    console.log(`  Network: http://${ip}:${port}  ← share this with family / friends`);
  }
  console.log('  Party leaderboard: POST/GET /api/leaderboard (stored in .data/leaderboard.json)');
});
