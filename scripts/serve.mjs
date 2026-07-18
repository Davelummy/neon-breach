import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { resolveStaticPath } from './static-path.mjs';
import {
  sanitizePartyCode,
  validateScoreEntry,
  upsertEntry,
  rankBoard
} from '../server/leaderboard-rules.mjs';

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
    'Access-Control-Allow-Headers': 'content-type, accept, x-neon-profile',
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

// —— Party leaderboard (file-backed LAN; mirrors Netlify rules) ——
const dataDir = join(process.cwd(), '.data');

function ensureDataDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
}

function boardFile(party) {
  const code = sanitizePartyCode(party);
  return join(dataDir, code ? `leaderboard-party-${code}.json` : 'leaderboard.json');
}

function loadBoard(party) {
  try {
    ensureDataDir();
    const path = boardFile(party);
    if (!existsSync(path)) return [];
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveBoard(party, entries) {
  ensureDataDir();
  writeFileSync(boardFile(party), JSON.stringify(entries, null, 0), 'utf8');
}

async function handleLeaderboard(request, response, url) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, accept'
    });
    return response.end();
  }

  if (request.method === 'GET') {
    const party = sanitizePartyCode(url.searchParams.get('party') || '');
    const opRaw = url.searchParams.get('operation');
    const operation =
      opRaw === null || opRaw === '' || opRaw === 'all' ? null : Math.floor(Number(opRaw));
    const board = loadBoard(party);
    const entries = rankBoard(board, {
      operation: Number.isFinite(operation) ? operation : null
    });
    return json(response, 200, {
      available: true,
      source: 'party',
      entries,
      count: entries.length,
      party: party || null
    });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = JSON.parse((await readBody(request)) || '{}');
    } catch {
      return json(response, 400, { error: 'Invalid JSON body.' });
    }
    const validated = validateScoreEntry(body);
    if (!validated.ok) return json(response, 400, { error: validated.error });
    const entry = validated.entry;
    const board = upsertEntry(loadBoard(entry.party), entry);
    saveBoard(entry.party, board);
    // Rank on the unfiltered board the client renders (matches Netlify function).
    const ranked = rankBoard(board, { operation: null });
    const mine = ranked.find(
      row => row.callsign === entry.callsign && row.best_score === entry.score
    );
    return json(response, 200, {
      available: true,
      source: 'party',
      ok: true,
      rank: mine?.rank ?? null,
      entries: ranked,
      party: entry.party || null
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
      const url = new URL(request.url, 'http://localhost');
      if (pathname === '/api/campaigns') {
        return json(response, 200, {
          available: false,
          error: 'Campaign cloud is optional — progress is saved on this device.'
        });
      }
      if (pathname === '/api/leaderboard') return handleLeaderboard(request, response, url);
      if (pathname === '/api/telemetry') {
        // Local no-op — production Netlify function aggregates anonymously.
        return json(response, 202, { ok: true, local: true });
      }
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
