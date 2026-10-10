# Player accounts and expanded arenas

## Current product contract

Every new player creates a server-backed account with a unique, case-insensitive username (3–16 ASCII letters, digits or underscores) and a password/passphrase (8–128 characters). Email is optional. Usernames are reserved indefinitely, even without email, as requested; there is no inactivity recycling or rename endpoint. Verification adds a permanent ownership marker rather than making an unverified name available for takeover.

The browser receives a persistent 30-day HttpOnly, SameSite=Strict cookie. HTTPS uses the Secure, host-only cookie prefix. Returning to the same host/browser restores login; another device requires the username/password. Passwords and session tokens are not stored in localStorage. Passwords are versioned salted scrypt hashes (new records: N=2^15, r=8, p=3, the OWASP 32-MiB alternative; initial N=2^17 records remain readable); the server stores hashes of opaque session tokens. Signup uniqueness uses conditional creation. Login attempts have bounded account/IP slots and hashing concurrency. Mutating requests require same-origin JSON. Public responses omit email, password hashes and session secrets.

Local development stores records in ignored `.data/community`, with private directory/file permissions for new writes. Netlify uses a strongly consistent private Blobs store. Authentication isn't supported by the legacy generated SQL worker deployment; use the local or Netlify backend. Existing campaign transfer codes, local saves and client-reported score validation remain separate from authentication. Signed-in score submissions use the server's username, not a client-selected alias; unauthenticated submissions cannot impersonate a reserved username. Legacy submissions for unregistered names remain accepted. Login is not a promise of cross-device campaign synchronization or authoritative anti-cheat.

## Optional email: deferred by the user

The server supports authenticated, expiring single-use verification proofs and an immutable verified-owner record. Tests inject a fake delivery adapter and check proof/replay/ownership behavior. The user explicitly deferred email delivery; both email forms are disabled and marked coming later. Neither local nor Netlify currently configures a sender. API requests return an explicit unavailable message and never falsely verify a typed address. Connecting a trusted transactional-email provider and verified sender is still required before enabling these controls. No emails are sent during tests; no provider credentials are added or inspected.

Email-based password reset and account deletion/export are not implemented. Players without recovery must keep their password. This is a tested development/pilot account foundation, not a security-audited public-launch identity service. Before public launch: configure HTTPS and email delivery/recovery; add gateway abuse limits and breached-password checks; migrate account/presence counts to indexed storage; expire old session/rate-limit/proof records; review privacy/retention and deletion policy; independently security-test deployed redirects and storage permissions. Do not use a real reused password over the unencrypted HTTP LAN preview.

Security approach follows [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html); this is not a claim of comprehensive compliance.

## Expanded arenas

Each arena has a 48×48 collision grid, four times the old 24×24 footprint. Connected wide outer roads run through centres 12, 24 and 36, with clear junctions. City Gate has commercial blocks; Millennium Park uses hedge/garden pockets; Jabi has lake-edge strips and boardwalk dressing. The existing west-side interiors remain to preserve stairs and legacy routes. These are larger fictional district blockouts, not geographically accurate Abuja maps.

Operation objectives, squads, relays and extraction beacons spread across the new districts. The building phase keeps its original interior; other phases use arena-specific district ordering. Spawn placement avoids blocked cells and separates live squad members by at least three units where a valid position exists. Patrol targets stay within their home region. Enemy counts are unchanged. Extra taxis serve the outer roads. Radar drawing only traverses cells within its visible range.

Unit tests check roads, map sealing, mission/relay reachability, separation, reservations, hashing, cookie flags, sessions, logout, CSRF, limits and email proof. Browser QA checks actual Three.js rendering, signup, returning sessions, vehicle entry/driving, fences and all layouts. SwiftShader browser QA is not hardware FPS evidence. The enlarged maps still need hardware-backed profiling and human route/playability testing before being called performance-ready.
