import {accountUser} from './accounts.js';
export async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000), headers: { accept: 'application/json', ...options.headers } });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Service unavailable');
  const data = await response.json();
  if (data.available === false) throw new Error('Service unavailable');
  return data;
}

let memoryId;
export function createPublicId() {
  // getRandomValues also works on HTTP LAN hosts, unlike randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function playerId() {
  if (memoryId) return memoryId;
  try { memoryId = localStorage.getItem('neon-breach-public-profile'); } catch {}
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memoryId || '')) {
    memoryId = createPublicId();
    try { localStorage.setItem('neon-breach-public-profile', memoryId); } catch {}
  }
  return memoryId;
}

export function startCommunity(refreshRanks) {
  if(window.__neonCommunityStarted){window.__neonCommunityRefresh?.();return;}
  window.__neonCommunityStarted=true;
  let inFlight = false;
  let failures = 0;
  let ticks = 0;
  async function tick() {
    if (document.hidden || inFlight || !accountUser()) return;
    // Back off after failures; never retry a failed score submission here.
    if (++ticks % Math.min(8, 2 ** failures)) return;
    inFlight = true;
    const status = document.getElementById('communityStatus');
    try {
      await fetchJson('/api/auth/heartbeat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
      const data = await fetchJson('/api/auth/stats');
      if (status) status.textContent = `${Number(data.total_players).toLocaleString()} registered players · ${Number(data.online_players).toLocaleString()} online`;
      failures = 0;
    } catch {
      failures = Math.min(3, failures + 1);
      if (status) status.textContent = 'Player counts unavailable';
    } finally { inFlight = false; }
  }
  let timer;
  window.__neonCommunityRefresh=()=>{failures=0;ticks=0;tick();};
  const schedule = () => { clearInterval(timer); timer = setInterval(() => {
    tick();
    if (!document.hidden && document.getElementById('screenRanks')?.classList.contains('active')) refreshRanks();
  }, 30000); };
  schedule();
  addEventListener('pagehide', () => clearInterval(timer), { once: true });
  addEventListener('pageshow', event => { if (event.persisted) schedule(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  tick();
}

export async function publishResult(entry) {
  const data = await fetchJson('/api/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...entry, run_id: createPublicId() }) });
  return data.result;
}

export function resultUrl(result) {
  const url = new URL('/results.html', location.origin);
  url.searchParams.set('id', result.id);
  return url.href;
}

export function downloadScorecard(result) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630;
  const context = canvas.getContext('2d');
  context.fillStyle = '#07131c'; context.fillRect(0, 0, 1200, 630);
  context.strokeStyle = '#31f5db'; context.lineWidth = 4; context.strokeRect(30, 30, 1140, 570);
  context.fillStyle = '#31f5db'; context.font = 'bold 48px sans-serif'; context.fillText('NEON BREACH', 70, 105);
  context.fillStyle = '#ffffff'; context.font = 'bold 38px sans-serif'; context.fillText(String(result.callsign).slice(0, 16), 70, 180);
  context.font = 'bold 100px sans-serif'; context.fillText(Number(result.score).toLocaleString(), 70, 310);
  context.font = '28px sans-serif'; context.fillText(`${result.victory ? 'MISSION WON' : 'MISSION FAILED'} · ${String(result.difficulty).toUpperCase()} · GRADE ${result.grade}`, 70, 385);
  context.fillText(`${result.kills} eliminations · ${result.elapsed_seconds}s`, 70, 440);
  context.fillStyle = '#a2b9c8'; context.font = '22px sans-serif'; context.fillText('Client-reported result · Can you beat this run?', 70, 535);
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'neon-breach-score.png'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
