# Internet multiplayer deployment

## Services and trust boundaries

The campaign, account APIs and multiplayer UI remain on the existing Netlify site. A separate Node WebSocket service runs `npm run start:multiplayer` on Render. The browser connects directly over WSS; Netlify is not used as a WebSocket proxy.

The player first authenticates on the main game. A same-origin, rate-limited POST to `/api/multiplayer/ticket` exchanges the HttpOnly session for a 90-second, HMAC-signed, single-use match ticket. The login cookie is never forwarded to Render. The ticket is kept in memory and sent as a WebSocket subprotocol, not in a URL or localStorage. The server checks the exact production Origin, signature, issuer, expiry, nonce, and current Netlify session before accepting it. Session validation is repeated approximately once per minute; a revoked session is closed no later than the next validation cycle, normally within 75 seconds. Local logout also immediately closes that client's match connection.

The Render service exposes only a public health response and the authenticated match socket. Authentication requests go only to the configured HTTPS game origin, do not follow redirects, and have a five-second timeout. Failed validation denies access. Health responses contain no player information. No secrets are committed or logged by these modules.

## Configuration

Netlify production Functions environment:

Deployment gate (2026-10-15): this site's Free plan rejected Functions-only environment scopes with HTTP 403. Do not upgrade or silently broaden the signing key to build/runtime/post-processing scopes. The owner must approve an alternative trust boundary before provisioning the service or calling the release operational. No signing value belongs in this document or the repository.

- `NEON_MATCH_SERVER_URL`: the actual WSS service URL ending in `/api/multiplayer/socket`.
- `NEON_MATCH_SECRET`: a cryptographically random, private signing value of at least 32 bytes, shared only with the match service. Never place it in build output or a public client setting.

Render Free service environment:

- `NODE_VERSION=24`
- `NEON_APP_ORIGIN=https://neon-breach-fps.netlify.app`
- `NEON_MATCH_SECRET`: the same signing value, stored privately through the provider's environment controls.

Use the existing Git repository and `main` for auto-deploys. Build command: `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`. Start command: `npm run start:multiplayer`. Port comes from the platform's `PORT` setting. Health path: `/health`. `render.yaml` describes the Free, Frankfurt deployment; no database or paid disk is required for temporary rooms.

The frontend waits for a valid JSON health response before requesting a fresh ticket. Cold-start requests have a bounded deadline and a manual retry path, not an infinite polling or reconnection loop. Unconfigured deployment variables produce a JSON 503 and do not silently substitute local-only gameplay.

## Pilot limits

Rooms support 2–8 players, server-owned movement/hits/kills, respawns, rotating arenas and vehicles. The single process caps connections at 64 and applies the existing room, message, payload and backpressure limits. These are safety bounds, not a capacity certification. Rooms and scores for the active match are memory-only and disappear on restart; persistent campaign progress stays separate.

Render Free instances sleep after 15 minutes without inbound traffic and can take about a minute to wake. The workspace shares 750 free instance hours across its free services, and bandwidth/build limits also apply. Existing services in the same workspace share that allowance. Free hosting is a small pilot, not a 100,000-player or uninterrupted-production guarantee. Do not add payment details, upgrade the plan or enable paid resources without the owner's approval. Provider details: https://render.com/docs/free and https://render.com/docs/websocket.

## Release checks

Run `npm test`, `npm run test:firebase`, `npm run build`, `npm run qa`, `npm run qa:responsive`, `npm run qa:multiplayer` and `git diff --check`. Local socket tests cover real ticket-authenticated two-player room joins, forged/replayed/expired tickets, CSRF, session revocation, bounded issuance and unavailable auth. Browser tests validate the existing same-origin development service; production WSS, Netlify packaging and two independent internet clients must also be checked after deployment. Software-rendered functional QA is not hardware FPS certification.
