# Vehicle, save, mission and launch-capacity pass

## Implemented

- Taxi/tricycle/bus hull integrity is 450/300/800, with the existing plating bonus added. Bullet damage to hull is 30% of damage to people; collision and blast damage remain separate. At baseline close-range rifle damage a taxi needs about 56 hits rather than four. This is a gameplay tuning target, not a physical vehicle simulation.
- Roadkills use swept, expanded oriented vehicle bounds, forward or reverse. Parked/slow cars, spawning or airborne enemies and repeated contact within 650 ms cannot generate damage. This avoids tunnelling at lower frame rates and makes bus/taxi noses count as part of the vehicle.
- Local v2 checkpoints preserve player/weapon state, exact position and occupied vehicle, enemies and their AI/reload state, projectiles, supplies, mission timers, relay destruction, broken glass, corpses and effects. Saving happens synchronously before cloud checks, including while another save is pending. Hidden tabs pause; pagehide also saves. Continue restores the snapshot without respawning squads or restarting the phase. Held inputs are reset for safe return.
- Snapshots are account-bound, schema/version and arena/operation checked, bounded and finite. Old/incompatible saves fall back to a clearly labelled phase checkpoint. They are local to the browser/host: no promise of exact cross-device/cloud resume. Browser storage rejection/quota failure is surfaced; never claim persistence succeeded when it failed. Client snapshots are not authoritative anti-cheat records and contain no passwords/session cookies.
- Briefing explains campaign stakes and offers the ordered mission route. In-game guidance shows phase number, explicit action, direction and distance. Targets reuse their coordinate arrays. Guards have directional unalerted vision rather than omnidirectional awareness, with close-range/noise/alert exceptions. Their existing cover, flanking, bursts and reloading remain. Human rigs have less emissive armor, restrained strides, idle breathing and a wounded posture; these remain procedural stylized models, not photoreal assets.
- Narrow/short screens, safe areas, dynamic viewport height and reduced-motion presentation are handled. The responsive matrix checks ten viewport sizes; these checks do not prove every physical device works. No realistic universal guarantee is made.

## 100,000 simultaneous players: NOT supported or verified yet

The local/Netlify Blobs account store is a pilot implementation. Password hashing is memory-hard and bounded to one operation per service instance; signup bursts can receive 429 rather than overload the process. Public counts previously scanned every account and read presence individually. They now coalesce concurrent requests, cache for 15 seconds and refuse scans beyond 250 accounts or four seconds instead of doing unbounded work. On large datasets counts are explicitly unavailable, not partial totals disguised as exact numbers. This safety guard is not the production scaling solution.

The target requires a separately provisioned production architecture and budget:

1. Indexed durable account/session database with transactional username uniqueness and session expiry; retain username/password onboarding and optional email. No weakening password hashing for speed.
2. Distributed gateway rate limits and bounded authentication worker capacity; measured password-hashing throughput, admission control and clear retry-after UX. Distinguish 100k arrivals in one second from 100k arrivals over a launch window.
3. TTL-based presence store and aggregate counters/read models; no account scans per client poll. Cache public statistics and leaderboard pages centrally. Jitter polling to avoid synchronized bursts.
4. CDN-hosted game assets, compression and versioned caching; profiles/checkpoints/scoreboards need bounded indexed writes. Real-time gameplay currently runs on each device, not a shared multiplayer simulation.
5. Staging-only incremental load tests: 1k, 10k, 25k, 50k, then 100k simulated concurrent clients. Test signup/login separately from active players and static assets. Agree on a signup-completion window, p95/p99 API latency, error/admission rates and maximum cost before the test. Never run this load against production or third-party radio streams.
6. Independent security review, capacity alarms, backup/restore rehearsal and rollout limits before claiming launch readiness.

No managed database, paid infrastructure, telemetry provider, real credentials, external load test, deployment or commit is created by this pass. Architecture provisioning waits for hosting/budget approval. The synthetic 100k-account unit fixture proves the scan guard is bounded, **not** that 100k users can onboard without lag.

## Verification

Run `npm test`, `npm run build`, `npm run qa`, `node scripts/qa-responsive.mjs`, and `git diff --check`. QA must show genuine Three.js frames, durable vehicle destruction, roadkills, and exact local pause/quit/reload/Continue restoration. Responsive artifacts are ignored under `.codex/artifacts/responsive`. Test matrix layout uses explicit compatibility rendering only to isolate CSS; it is never 3D performance evidence. Validate real-device Safari/Chrome, gamepad and hardware FPS separately.
