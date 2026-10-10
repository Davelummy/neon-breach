import { fetchJson, downloadScorecard } from './community.js';
async function loadResult() {
try {
  const id = new URLSearchParams(location.search).get('id');
  const { result } = await fetchJson(`/api/results?id=${encodeURIComponent(id || '')}`);
  document.getElementById('callsign').textContent = result.callsign;
  document.getElementById('score').textContent = Number(result.score).toLocaleString();
  document.getElementById('details').textContent = `${result.victory ? 'Mission won' : 'Mission failed'} · ${result.difficulty} · ${result.kills} eliminations · ${result.elapsed_seconds}s · Grade ${result.grade}`;
  document.getElementById('download').addEventListener('click', () => downloadScorecard(result));
  document.getElementById('result').hidden = false;
  document.getElementById('status').textContent = 'Challenge this score.';
} catch {
  document.getElementById('status').textContent = 'This result is unavailable. Check the link or try again later.';
}
}
loadResult();
