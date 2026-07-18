export default async () =>
  new Response(JSON.stringify({ status: 'ok', game: 'NEON BREACH', host: 'netlify' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

export const config = { path: '/health' };
