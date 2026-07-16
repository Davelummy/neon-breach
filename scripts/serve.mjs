import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { resolveStaticPath } from './static-path.mjs';

const root = join(process.cwd(), existsSync('dist/index.html') ? 'dist' : 'public');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const types = { '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8', '.webp': 'image/webp' };

function json(response, status, body, extra = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  response.end(JSON.stringify(body));
}

// In dev (serving from public/) the vendored three.js only exists in
// node_modules; the production build copies it into dist/vendor/.
const vendorFiles = {
  '/vendor/three.module.min.js': join(process.cwd(), 'node_modules', 'three', 'build', 'three.module.min.js'),
  // three's minified module build is split in two; the entry imports ./three.core.min.js
  '/vendor/three.core.min.js': join(process.cwd(), 'node_modules', 'three', 'build', 'three.core.min.js')
};

createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/health') return json(response, 200, { status: 'ok', game: 'NEON BREACH' });
  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/campaigns') return json(response, 503, { error: 'Campaign storage is unavailable in the local server.' });
    if (pathname === '/api/leaderboard') return json(response, 503, { error: 'Leaderboard storage is unavailable in the local server.' });
    return json(response, 404, { error: 'API route not found.' });
  }
  const fallback = existsSync(join(root, 'index.html')) ? 'index.html' : 'neon-breach.html';
  const vendor = vendorFiles[pathname];
  const resolved = (vendor && existsSync(vendor)) ? vendor : resolveStaticPath(root, pathname);
  const safePath = resolved && existsSync(resolved) ? resolved : join(root, fallback);
  response.setHeader('Content-Type', types[extname(safePath)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-cache');
  createReadStream(safePath).pipe(response);
}).listen(port, host, () => console.log(`NEON BREACH ready at http://${host}:${port}`));
