import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await mkdir('dist/vendor', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('node_modules/three/build/three.module.min.js', 'dist/vendor/three.module.min.js');
await cp('node_modules/three/build/three.core.min.js', 'dist/vendor/three.core.min.js');
await cp('public/neon-breach.html', 'dist/index.html');
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });

async function minifyEsm(code, label) {
  try {
    const result = await esbuild.transform(code, {
      loader: 'js',
      minify: true,
      format: 'esm',
      target: ['es2020'],
      legalComments: 'none'
    });
    return result.code;
  } catch (error) {
    console.warn(`minify skipped for ${label}:`, error?.message || error);
    return code;
  }
}

const html = await readFile('public/neon-breach.html', 'utf8');
const manifest = await readFile('public/manifest.webmanifest', 'utf8');
const icon = await readFile('public/icon.svg', 'utf8');
let scene3d = await readFile('public/scene3d.js', 'utf8');
let renderUtils = await readFile('public/render-utils.js', 'utf8');
let gameJs = await readFile('public/game.js', 'utf8');
let dataJs = await readFile('public/data.js', 'utf8');
let audioJs = await readFile('public/audio.js', 'utf8');
let serviceWorker = await readFile('public/sw.js', 'utf8');

// Minify hand-wired ES modules in place (filenames unchanged).
gameJs = await minifyEsm(gameJs, 'game.js');
scene3d = await minifyEsm(scene3d, 'scene3d.js');
dataJs = await minifyEsm(dataJs, 'data.js');
audioJs = await minifyEsm(audioJs, 'audio.js');
renderUtils = await minifyEsm(renderUtils, 'render-utils.js');

// Content hash for service worker cache busting (dist only).
const hashSource = [html, gameJs, scene3d, dataJs, audioJs, renderUtils].join('\n');
const buildHash = createHash('sha256').update(hashSource).digest('hex').slice(0, 12);
serviceWorker = serviceWorker.replaceAll('__BUILD_HASH__', buildHash);

await writeFile('dist/game.js', gameJs);
await writeFile('dist/scene3d.js', scene3d);
await writeFile('dist/data.js', dataJs);
await writeFile('dist/audio.js', audioJs);
await writeFile('dist/render-utils.js', renderUtils);
await writeFile('dist/sw.js', serviceWorker);

const threeModule = await readFile('node_modules/three/build/three.module.min.js', 'utf8');
const threeCore = await readFile('node_modules/three/build/three.core.min.js', 'utf8');
const binaryAssets = {};
for (const name of await readdir('public/assets')) {
  if (!name.endsWith('.webp')) continue;
  binaryAssets[`/assets/${name}`] = (await readFile(`public/assets/${name}`)).toString('base64');
}
const campaignSchema = `CREATE TABLE IF NOT EXISTS campaign_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  operation INTEGER NOT NULL DEFAULT 0,
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
// Shared validation rules: tested via node:test, inlined into the worker here.
const campaignRules = (await readFile('server/campaign-rules.mjs', 'utf8')).replaceAll('export ', '');
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
  '/render-utils.js': { body: ${JSON.stringify(renderUtils)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600' },
  '/game.js': { body: ${JSON.stringify(gameJs)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600' },
  '/data.js': { body: ${JSON.stringify(dataJs)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600' },
  '/audio.js': { body: ${JSON.stringify(audioJs)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600' },
  '/vendor/three.module.min.js': { body: ${JSON.stringify(threeModule)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=31536000, immutable' },
  '/vendor/three.core.min.js': { body: ${JSON.stringify(threeCore)}, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=31536000, immutable' }
};

let schemaReady = false;
async function ensureCampaignSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(campaignSchema),
    db.prepare(campaignIndex)
  ]);
  // Databases created before Build 4.1 lack the operation column; ALTER is
  // idempotent-by-catch (fails harmlessly once the column exists).
  try { await db.prepare("ALTER TABLE campaign_records ADD COLUMN operation INTEGER NOT NULL DEFAULT 0").run(); } catch {}
  schemaReady = true;
}

${campaignRules}

async function handleCampaigns(request, env) {
  if (!env?.DB) return Response.json({ error: 'Campaign storage is unavailable.' }, { status: 503 });
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!email) return Response.json({ error: 'Sign in is required to access campaign records.' }, { status: 401 });
  await ensureCampaignSchema(env.DB);

  if (request.method === 'GET') {
    const active = await env.DB.prepare('SELECT * FROM campaign_records WHERE user_email = ? AND status = ? ORDER BY updated_at DESC, id DESC LIMIT 1').bind(email, 'active').first();
    const history = await env.DB.prepare('SELECT * FROM campaign_records WHERE user_email = ? AND status != ? ORDER BY updated_at DESC, id DESC LIMIT 8').bind(email, 'active').all();
    const best = await env.DB.prepare('SELECT COALESCE(MAX(score), 0) AS best_score FROM campaign_records WHERE user_email = ?').bind(email).first();
    const career = await env.DB.prepare("SELECT COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(takedowns), 0) AS takedowns, COALESCE(SUM(roadkills), 0) AS roadkills, COALESCE(SUM(CASE WHEN status = 'victory' THEN 1 ELSE 0 END), 0) AS victories FROM campaign_records WHERE user_email = ?").bind(email).first();
    return Response.json({ active: active || null, records: history.results || [], best_score: Number(best?.best_score || 0), career: { kills: Number(career?.kills || 0), takedowns: Number(career?.takedowns || 0), roadkills: Number(career?.roadkills || 0), victories: Number(career?.victories || 0) } }, { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET, POST' } });
  let payload;
  try { payload = await request.json(); } catch { return Response.json({ error: 'Invalid campaign payload.' }, { status: 400 }); }
  const values = campaignValues(payload || {});
  let id = cleanInteger(payload?.id, 0, 0);
  if (id) {
    await env.DB.prepare('UPDATE campaign_records SET status = ?, operation = ?, difficulty = ?, time_of_day = ?, wave = ?, score = ?, kills = ?, shots = ?, hits = ?, takedowns = ?, roadkills = ?, health = ?, shield = ?, armor = ?, weapon_index = ?, elapsed_seconds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?')
      .bind(values.status, values.operation, values.difficulty, values.timeOfDay, values.wave, values.score, values.kills, values.shots, values.hits, values.takedowns, values.roadkills, values.health, values.shield, values.armor, values.weaponIndex, values.elapsedSeconds, id, email).run();
  } else {
    if (values.status === 'active') await env.DB.prepare("UPDATE campaign_records SET status = 'abandoned', updated_at = CURRENT_TIMESTAMP WHERE user_email = ? AND status = 'active'").bind(email).run();
    const result = await env.DB.prepare('INSERT INTO campaign_records (user_email, status, operation, difficulty, time_of_day, wave, score, kills, shots, hits, takedowns, roadkills, health, shield, armor, weapon_index, elapsed_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(email, values.status, values.operation, values.difficulty, values.timeOfDay, values.wave, values.score, values.kills, values.shots, values.hits, values.takedowns, values.roadkills, values.health, values.shield, values.armor, values.weaponIndex, values.elapsedSeconds).run();
    id = Number(result.meta?.last_row_id || 0);
  }
  const record = id ? await env.DB.prepare('SELECT * FROM campaign_records WHERE id = ? AND user_email = ?').bind(id, email).first() : null;
  if (!record) return Response.json({ error: 'Campaign record was not found.' }, { status: 404 });
  return Response.json({ record }, { status: payload?.id ? 200 : 201, headers: { 'cache-control': 'no-store' } });
}

async function handleLeaderboard(request, env) {
  if (!env?.DB) return Response.json({ error: 'Leaderboard storage is unavailable.' }, { status: 503 });
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: { allow: 'GET' } });
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!email) return Response.json({ error: 'Sign in is required to view the leaderboard.' }, { status: 401 });
  await ensureCampaignSchema(env.DB);
  const rows = await env.DB.prepare(
    "SELECT user_email, MAX(score) AS best_score, SUM(CASE WHEN status = 'victory' THEN 1 ELSE 0 END) AS victories FROM campaign_records GROUP BY user_email ORDER BY best_score DESC, victories DESC LIMIT 10"
  ).all();
  const entries = (rows.results || []).map((row, index) => ({
    rank: index + 1,
    callsign: maskEmail(row.user_email),
    best_score: Number(row.best_score || 0),
    victories: Number(row.victories || 0),
    you: row.user_email === email
  }));
  return Response.json({ entries }, { headers: { 'cache-control': 'no-store' } });
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

    if (url.pathname === '/api/leaderboard') {
      try { return await handleLeaderboard(request, env); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Leaderboard service failed.' }, { status: 500 }); }
    }

    if (url.pathname.startsWith('/api/')) return Response.json({ error: 'API route not found.' }, { status: 404 });

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

console.log(`NEON BREACH deployable build ready in dist/ (sw cache neon-breach-${buildHash})`);
