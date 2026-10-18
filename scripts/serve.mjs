import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { resolveStaticPath } from './static-path.mjs';
import { createCommunityService } from '../server/community-service.mjs';
import { createAccountService } from '../server/account-service.mjs';
import { attachMultiplayer } from '../server/multiplayer-service.mjs';
import {
  sanitizePartyCode,
  validateScoreEntry,
  upsertEntry,
  rankBoard,
  periodBoardKeys
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
const devCacheStamp = Date.now().toString(36);
// Bind all interfaces by default so family/friends on LAN can join.
const host = process.env.HOST || '0.0.0.0';

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg'
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
  return join(dataDir, party ? `leaderboard-party-${encodeURIComponent(party)}.json` : 'leaderboard.json');
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
    const period = url.searchParams.get('period') || 'all';
    const difficulty = url.searchParams.get('difficulty');
    const board = periodBoardKeys(party, period).flatMap(loadBoard);
    const entries = rankBoard(board, {
      operation: Number.isFinite(operation) ? operation : null, period, difficulty
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
    const identity=await accounts.scoreIdentity(new Request(new URL(request.url,`http://${request.headers.host}`),{headers:request.headers}),body.callsign);
    if(!identity.allowed)return json(response,403,{error:'Sign in to post scores.'});
    body.callsign=identity.callsign;
    const validated = validateScoreEntry(body);
    if (!validated.ok) return json(response, 400, { error: validated.error });
    const entry = { ...validated.entry, at: Date.now() };
    const board = upsertEntry(loadBoard(entry.party), entry);
    saveBoard(entry.party, board);
    const dailyKey = periodBoardKeys(entry.party, 'daily', entry.at)[0];
    saveBoard(dailyKey, upsertEntry(loadBoard(dailyKey), entry));
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

// Local adapter for public results and browser-profile presence.
const communityDir = join(dataDir, 'community');
const localCommunityStore = {
  async delete(key) {
    const { unlinkSync } = await import('node:fs');
    try { unlinkSync(join(communityDir, encodeURIComponent(key))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  },
  async get(key) {
    try { return JSON.parse(readFileSync(join(communityDir, encodeURIComponent(key)), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  async setJSON(key, value, options = {}) {
    mkdirSync(communityDir, { recursive: true,mode:0o700 });
    chmodSync(communityDir,0o700);
    try {
      writeFileSync(join(communityDir, encodeURIComponent(key)), JSON.stringify(value), { flag: options.onlyIfNew ? 'wx' : 'w',mode:0o600 });
      return { modified: true };
    } catch (error) { if (error.code === 'EEXIST') return { modified: false }; throw error; }
  },
  async *list({ prefix }) {
    const { readdirSync } = await import('node:fs');
    const files = existsSync(communityDir) ? readdirSync(communityDir) : [];
    yield { blobs: files.map(decodeURIComponent).filter(key => key.startsWith(prefix)).map(key => ({ key })) };
  }
};
const accounts=createAccountService(localCommunityStore);
const handleCommunity = createCommunityService(localCommunityStore,Date.now,{scoreIdentity:accounts.scoreIdentity});

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

const server=createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/health') return json(response, 200, { status: 'ok', game: 'NEON BREACH' });
    if(pathname==='/api/multiplayer')return json(response,200,multiplayer);

    if (pathname.startsWith('/api/')) {
      const url = new URL(request.url, 'http://localhost');
      if(pathname.startsWith('/api/auth/')){
        const accountUrl=new URL(request.url,process.env.NEON_PUBLIC_ORIGIN||`http://${request.headers.host}`);
        const body=request.method==='POST'?await readBody(request):undefined;
        const result=await accounts.handle(new Request(accountUrl,{method:request.method,headers:request.headers,...(body!==undefined?{body}:{})}),request.socket.remoteAddress||'local');
        response.writeHead(result.status,Object.fromEntries(result.headers));return response.end(await result.text());
      }
      if (pathname === '/api/community' || pathname === '/api/results') {
        let body;
        if (request.method === 'POST') body = await readBody(request);
        const result = await handleCommunity(new Request(url, { method: request.method, headers: request.headers, ...(body !== undefined ? { body } : {}) }));
        response.writeHead(result.status, Object.fromEntries(result.headers));
        return response.end(await result.text());
      }
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
    // Unbuilt sw.js still has the placeholder; give each dev run its own cache so stale entries are purged.
    if (pathname === '/sw.js' && root.endsWith('public')) return response.end(readFileSync(safePath, 'utf8').replaceAll('__BUILD_HASH__', `dev-${devCacheStamp}`));
    createReadStream(safePath).pipe(response);
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'Server error' });
  }
});
const multiplayer=attachMultiplayer(server,accounts,{publicOrigin:process.env.NEON_PUBLIC_ORIGIN});
server.listen(port, host, () => {
  const from = root.endsWith('dist') ? 'dist (production build)' : 'public (live source)';
  console.log(`NEON BREACH ready  [serving ${from}]`);
  console.log(`  Local:   http://127.0.0.1:${port}`);
  for (const ip of lanAddresses()) {
    console.log(`  Network: http://${ip}:${port}  ← share this with family / friends`);
  }
  console.log('  Party leaderboard: POST/GET /api/leaderboard (stored in .data/leaderboard.json)');
});
