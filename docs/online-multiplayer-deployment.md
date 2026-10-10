# Internet multiplayer delivery boundary

## Agreed first mode

Private online free-for-all, 2–8 players, kills and respawns, rotating arenas. Players will join from different networks through the main game's Multiplayer button. This is not PUBG-scale battle royale: no shrinking zone, 100-player lobby, drop sequence or loot economy is included.

Implementation and verification stay local for now. No hosting deployment, billing activation, package installation, paid service or merge is authorized.

## Runtime design already implemented

Browser → same-origin authenticated WebSocket → authoritative Node room process. Clients submit bounded inputs; the server owns movement, damage, cadence, ammo, scores and respawns. Accounts and campaign records remain separate from transient room simulation. High-frequency positions are not written to Firestore. Clients do not exchange peer-to-peer combat authority.

The main game opens a full-screen isolated multiplayer mode using the existing account session. Campaign simulation/rendering suspend while the mode is open, preventing competing gameplay loops. Invites target the main game with `?mode=multiplayer&room=CODE`, pass through signup/login, and never grant authentication by themselves. Leaving closes the socket and returns to the main menu.

The server's optional `NEON_PUBLIC_ORIGIN` must be one exact HTTPS origin, with no path, credentials, query or trailing slash. If omitted, direct HTTP development continues. The configured value drives origin validation and secure account-session cookie naming. Spoofable forwarded headers are ignored. Configuration alone does not create hosting or make a server publicly reachable.

## Before any internet deployment

1. Approve a host and deploy scope separately. An always-running process supporting WebSocket upgrades is required; a static-only site or ordinary request-only function is insufficient for this room loop.
2. Put the application, API and WebSocket route behind one HTTPS origin. TLS termination must forward WebSocket upgrades, Origin and cookies without exposing the backend port. Configure the exact public origin on the backend.
3. Replace pilot file/in-memory account storage with the reviewed durable account/session repository. Verify secure cookie issuance, restart persistence, signup/login throttling and session expiry through the real proxy. The current public-origin test uses local sockets; it does not certify production auth.
4. Keep single-process rooms pinned to their owner. Start with one instance and explicit room/player caps. Horizontal replicas require room ownership/routing; do not randomly distribute sockets between unrelated room processes. Do not autoscale under the assumption that room state is shared.
5. Test two devices on different networks, invalid/expired sessions, duplicate identities, disconnects, slow sockets and a server restart. Add reconnect reservation and clear recovery UX before treating transient disconnections as production-ready.
6. Run eight-client latency/packet-jitter/load tests and hardware-backed device checks. Add rate-limited operational metrics, health/readiness checks and graceful drain/restart behavior. Do not publish usernames, session cookies or room codes in public logs.
7. Evaluate any free host's current sleep behavior, continuous-process availability, WebSocket limits and quotas before proposing it. No provider is selected or claimed to be free/adequate here. A sleeping server can interrupt or discard active matches; Firebase account/database access does not replace an authoritative match worker.

## Honest current status

Local main-game create/join/leave flow, real keyboard/touch movement, synchronized combat and respawn are tested. Internet transport configuration is covered by exact-origin and authenticated-upgrade tests, including rejection of forged forwarded-origin headers. Cross-network matches, physical iPad controls, eight-device load, public deployment, reconnect and production account storage remain unverified or incomplete. Keep the mode labelled as development until these gates pass.
