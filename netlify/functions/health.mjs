export async function handler() {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ status: 'ok', game: 'NEON BREACH', host: 'netlify' })
  };
}
