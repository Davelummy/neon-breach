import { join, normalize, sep } from 'node:path';

// Resolve a URL pathname to an absolute file path strictly inside root, or
// null when the request escapes it (e.g. /../ or a /rootEvil sibling prefix).
export function resolveStaticPath(root, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const path = normalize(join(root, requested));
  return path === root || path.startsWith(root + sep) ? path : null;
}
