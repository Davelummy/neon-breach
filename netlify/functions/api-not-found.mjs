export default () => Response.json({ error: 'API route not found.' }, { status: 404, headers: { 'cache-control': 'no-store' } });
