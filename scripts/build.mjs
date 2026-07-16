import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await mkdir('dist/vendor', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('node_modules/three/build/three.module.min.js', 'dist/vendor/three.module.min.js');
await cp('public/neon-breach.html', 'dist/index.html');
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });

const html = await readFile('public/neon-breach.html', 'utf8');
const manifest = await readFile('public/manifest.webmanifest', 'utf8');
const serviceWorker = await readFile('public/sw.js', 'utf8');
const icon = await readFile('public/icon.svg', 'utf8');
const scene3d = await readFile('public/scene3d.js', 'utf8');
const threeModule = await readFile('node_modules/three/build/three.module.min.js', 'utf8');
const binaryAssets = {};
for (const name of await readdir('public/assets')) {
  if (!name.endsWith('.webp')) continue;
  binaryAssets[`/assets/${name}`] = (await readFile(`public/assets/${name}`)).toString('base64');
}
const campaignSchema = `CREATE TABLE IF NOT EXISTS campaign_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  difficulty TEXT NOT NULL DEFAULT 'operative',
  time_of_day TEXT NOT NULL DEFAULT 'day',
  wave INTEGER NOT NULL DEFAULT 1,
  score INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  shots INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0,
  takedowns INTEGER NOT NULL DEFAULT 0,
  roadkills INTEGER NOT NULL DEFAULT 0,
  health INTEGER NOT NULL DEFAULT 100,
  shield INTEGER NOT NULL DEFAULT 50,
  armor INTEGER NOT NULL DEFAULT 100,
  weapon_index INTEGER NOT NULL DEFAULT 0,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const campaignIndex = `CREATE INDEX IF NOT EXISTS campaign_user_updated_idx ON campaign_records (user_email, updated_at DESC)`;
const worker = `
const html = ${JSON.stringify(html)};
const binaryAssets = ${JSON.stringify(binaryAssets)};
const campaignSchema = ${JSON.stringify(campaignSchema)};
const campaignIndex = ${JSON.stringify(campaignIndex)};
const assets = {
  '/manifest.webmanifest': { body: ${JSON.stringify(manifest)}, type: 'application/manifest+json; charset=utf-8', cache: 'public, max-age=3600' },
  '/sw.js': { body: ${JSON.stringify(serviceWorker)}, type: 'text/javascript; charset=utf-8', cache: 'no-cache' },
  '/icon.svg': { body: ${JSON.stringify(icon)}, type: 'image/svg+xml; charset=utf-8', cache: 'public, max-age=86400' },
  '/scene3d.js': { body: ${JSON.stringify(scene3d)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600' },
  '/vendor/three.module.min.js': { body: ${JSON.stringify(threeModule)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=31536000, immutable' }
};

let schemaReady = false;
async function ensureCampaignSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(campaignSchema),
    db.prepare(campaignIndex)
  ]);
  schemaReady = true;
}

function cleanInteger(value, fallback = 0, min = 0, max = 100000000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function campaignValues(payload) {
  return {
    status: cleanChoice(payload.status, ['active', 'victory', 'failed', 'abandoned'], 'active'),
    difficulty: cleanChoice(payload.difficulty, ['recruit', 'operative', 'nightmare'], 'operative'),
    timeOfDay: cleanChoice(payload.time_of_day, ['day', 'night'], 'day'),
    wave: cleanInteger(payload.wave, 1, 1, 5),
    score: cleanInteger(payload.score),
    kills: cleanInteger(payload.kills, 0, 0, 10000),
    shots: cleanInteger(payload.shots, 0, 0, 100000),
    hits: cleanInteger(payload.hits, 0, 0, 100000),
    takedowns: cleanInteger(payload.takedowns, 0, 0, 10000),
    roadkills: cleanInteger(payload.roadkills, 0, 0, 10000),
    health: cleanInteger(payload.health, 100, 0, 100),
    shield: cleanInteger(payload.shield, 50, 0, 50),
    armor: cleanInteger(payload.armor, 100, 0, 100),
    weaponIndex: cleanInteger(payload.weapon_index, 0, 0, 2),
    elapsedSeconds: cleanInteger(payload.elapsed_seconds, 0, 0, 86400)
  };
}

async function handleCampaigns(request, env) {
  if (!env?.DB) return Response.json({ error: 'Campaign storage is unavailable.' }, { status: 503 });
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!email) return Response.json({ error: 'Sign in is required to access campaign records.' }, { status: 401 });
  await ensureCampaignSchema(env.DB);

  if (request.method === 'GET') {
    const active = await env.DB.prepare('SELECT * FROM campaign_records WHERE user_email = ? AND status = ? ORDER BY updated_at DESC, id DESC LIMIT 1').bind(email, 'active').first();
    const history = await env.DB.prepare('SELECT * FROM campaign_records WHERE user_email = ? AND status != ? ORDER BY updated_at DESC, id DESC LIMIT 8').bind(email, 'active').all();
    const best = await env.DB.prepare('SELECT COALESCE(MAX(score), 0) AS best_score FROM campaign_records WHERE user_email = ?').bind(email).first();
    return Response.json({ active: active || null, records: history.results || [], best_score: Number(best?.best_score || 0) }, { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, POST' } });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid campaign payload.' }, { status: 400 }); }
  const values = campaignValues(payload || {});
  let id = cleanInteger(payload?.id, 0, 0);
  if (id) {
    await env.DB.prepare('UPDATE campaign_records SET status = ?, difficulty = ?, time_of_day = ?, wave = ?, score = ?, kills = ?, shots = ?, hits = ?, takedowns = ?, roadkills = ?, health = ?, shield = ?, armor = ?, weapon_index = ?, elapsed_seconds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?')
      .bind(values.status, values.difficulty, values.timeOfDay, values.wave, values.score, values.kills, values.shots, values.hits, values.takedowns, values.roadkills, values.health, values.shield, values.armor, values.weaponIndex, values.elapsedSeconds, id, email).run();
  } else {
    if (values.status === 'active') await env.DB.prepare("UPDATE campaign_records SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP WHERE user_email = ? AND status = 'active'").bind(email).run();
    const result = await env.DB.prepare('INSERT INTO campaign_records (user_email, status, difficulty, time_of_day, wave, score, kills, shots, hits, takedowns, roadkills, health, shield, armor, weapon_index, elapsed_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(email, values.status, values.difficulty, values.timeOfDay, values.wave, values.score, values.kills, values.shots, values.hits, values.takedowns, values.roadkills, values.health, values.shield, values.armor, values.weaponIndex, values.elapsedSeconds).run();
    id = Number(result.meta?.last_row_id || 0);
  }
  const record = id ? await env.DB.prepare('SELECT * FROM campaign_records WHERE id = ? AND user_email = ?').bind(id, email).first() : null;
  if (!record) return Response.json({ error: 'Campaign record was not found.' }, { status: 404 });
  return Response.json({ record }, { status: payload?.id ? 200 : 201, headers: { 'cache-control': 'no-store' } });
}

const handler = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'ok', game: 'NEON BREACH' });
    }

    if (url.pathname === '/api/campaigns') {
      try { return await handleCampaigns(request, env); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Campaign service failed.' }, { status: 500 }); }
    }

    const asset = assets[url.pathname];
    if (asset) {
      return new Response(asset.body, {
        headers: {
          'content-type': asset.type,
          'cache-control': asset.cache,
          ...(url.pathname === '/sw.js' ? { 'service-worker-allowed': '/' } : {})
        }
      });
    }

    const binary = binaryAssets[url.pathname];
    if (binary) {
      const bytes = Uint8Array.from(atob(binary), char => char.charCodeAt(0));
      return new Response(bytes, {
        headers: {
          'content-type': 'image/webp',
          'cache-control': 'public, max-age=31536000, immutable'
        }
      });
    }

    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin'
      }
    });
  }
};

export default handler;
export const fetch = handler.fetch;
`;

await writeFile('dist/server/index.js', worker.trimStart());

console.log('NEON BREACH deployable build ready in dist/');
