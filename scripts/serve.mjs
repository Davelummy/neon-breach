import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), existsSync('dist/index.html') ? 'dist' : 'public');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const types = { '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8' };

createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const fallback = existsSync(join(root, 'index.html')) ? 'index.html' : 'neon-breach.html';
  const path = normalize(join(root, requested));
  const safePath = path.startsWith(root) && existsSync(path) ? path : join(root, fallback);
  response.setHeader('Content-Type', types[extname(safePath)] || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-cache');
  createReadStream(safePath).pipe(response);
}).listen(port, host, () => console.log(`NEON BREACH ready at http://${host}:${port}`));
