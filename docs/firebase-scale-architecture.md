# NEON BREACH FPS: viral-launch backend design

Status: proposed architecture, not provisioned, deployed or capacity-certified. Target: 100,000 concurrently active accounts in independent local gameplay, not 100,000 players in one multiplayer world. Firebase project: `gen-lang-client-0460687014`, display name NEON BREACH FPS. Existing applications and data must be preserved.

Current approved infrastructure spend: $0. Development stays on the feature branch; paid services, billing and deployment require separate approval. See [offline implementation status](zero-cost-backend-foundation.md) for the first transaction/worker increment and its unimplemented integration boundaries.

## Product and trust contract

- Username + password signup; email optional and verification still deferred. Case-insensitive usernames remain reserved indefinitely. Preserve existing account IDs and password-version compatibility during migration. Do not manufacture email addresses to fit email/password authentication.
- Browser gameplay, rendering and exact local checkpoints stay independent of the backend. Offline play is permitted for already-onboarded players; first signup requires the server. Show local-only versus cloud-synced saves honestly.
- Public leaderboards contain only approved public fields. Password hashes, emails, session tokens, transfer codes, private saves and presence identities never appear in public responses or logs.
- Scores remain client-reported until stronger run validation exists. Schema checks and rate limits do not make a client-run game cheat-proof. No prizes or paid competitive rankings based on this trust level.
- Total players means completed registered accounts, not visits. Online means unique authenticated account IDs with a live or recently confirmed session, not tabs. Publish measurement timestamp, freshness and approximate status.

## Recommended components

| Concern | Proposed service | Boundary |
| --- | --- | --- |
| Game files | Existing CDN, versioned immutable assets | No frame-by-frame server traffic; separate asset delivery from APIs |
| Accounts, usernames, progress metadata, accepted results | Cloud Firestore | Indexed durable records, transactions, no full scans on request paths |
| API and username/password authentication | Separate Cloud Run API and auth services | Same-origin API gateway; auth CPU/memory isolated from saves and public reads |
| Firebase identity | Firebase Authentication custom-token bridge | Server validates existing username/password; Firebase supplies identity tokens for presence; do not assume this removes password-hashing cost |
| Full cloud checkpoint objects | Private Cloud Storage | Size-capped, versioned objects referenced by Firestore; do not put large world arrays in indexed documents |
| Presence | Sharded Firebase Realtime Database | Native connection/disconnect handling; private per-account sessions, no public root listeners |
| Background processing | Cloud Tasks + authenticated Cloud Run worker | Bounded retries/concurrency; durable, idempotent jobs rather than a permanent browser-dependent worker |
| Public leaderboard/count pages | Materialized snapshots + CDN caching | Freshness timestamp; last-good snapshot on outages; no scans or one listener per user on a hot score document |

Service/region choices, shard count, instance limits and spending limits require staging measurements and budget approval. Do not overwrite existing Firebase rules, hosting or default database. Prefer isolated named game resources and least-privilege service accounts. Use a separately approved staging project for destructive tests and load generation.

## Durable model and access

Proposed isolated collection prefix: `nb_*` (not currently created).

- `nb_usernames/{sha256(normalizedName)}`: unique reservation -> UID, created time, ownership state. Claim reservation, private account and public profile in one Firestore transaction. Hashing spreads document keys; it is not username secrecy. Anonymous clients cannot list or read reservations directly.
- `nb_accounts/{uid}`: private versioned credentials and lifecycle state. Server-only access; immutable UID. Store salts/hashes, never plaintext passwords. Separate from the public profile.
- `nb_profiles/{uid}`: public username and cosmetic fields. Reject client writes to ownership, roles, totals and ranking fields.
- `nb_sessions/{tokenDigest}`: server-owned session expiry/revocation records for HttpOnly cookie sessions. Check expiry at authorization time; TTL cleanup is not the authorization check. Never log bearer values.
- `nb_progress/{uid}/slots/{slot}`: revision, schema version, build/arena identifiers, bounded summary and checkpoint object reference. UID from authentication, never request body.
- `nb_runs/{randomRunId}`: immutable accepted run envelope, UID, season, verification label, server receipt time and idempotency key. Authenticated access and bounded retention.
- `nb_jobs/{jobId}`: durable outbox status created atomically with a run or other job-producing mutation. Contains references and non-secret payloads, not passwords/tokens.
- `nb_boardEntries/{season_uid}`: per-player best accepted entry, ordered score index with deterministic ties; no shared global board rewrite per submission. Exempt unused fields from indexes; review hot/sequential timestamp indexes before scale-up.
- `nb_publicSnapshots/{boardId}`: top 100 and public counters, generated on a bounded schedule. Only worker updates, cache at the edge. An indexed bounded query is allowed during snapshot production, never a full collection scan.
- `nb_counterShards/{kind_shard}`: idempotently updated registered-account totals. Fold into snapshots; do not increment one global document on every signup.

Private checkpoint objects: `nb-checkpoints/{uid}/{slot}/{revision}.json.gz`, application cap proposed at 256 KiB compressed and 1 MiB decompressed, with stricter normal payload budget measured in staging. Validate decompression size, schema, finite numbers, object depth and game version before accepting a reference. Never execute supplied content. Delete superseded revisions only after reference publication and a recovery grace period.

Default-deny database/storage rules. API uses workload identity and narrowly scoped service accounts, not checked-in credential files. Worker identity cannot read password records. Verify cookie origin/CSRF protections and short-lived token audience/signature/expiry; Firebase Admin bypasses rules, so server authorization tests remain mandatory.

## Request and worker behavior

### Authentication

Keep existing 8–128-character password contract pending independent security review. Keep memory-hard hashing and old hash verification; rehash old versions only after successful login. Run a measured bounded hash pool in the dedicated auth service. Never increase request concurrency beyond its memory/CPU capacity. Distributed gateway/account/IP abuse limits replace per-process-only admission control. Use generic login errors and bounded 429 + Retry-After with visible UX; no browser retry loop on credentials. Account recovery remains an explicit launch blocker until a no-email recovery design is approved.

Firebase custom authentication bridges a successful server login to a UID; it does not replace this username-password service. Migrate existing IDs carefully: some legacy IDs may not be in Firebase Auth. Reconcile/provision identity idempotently and test partial failures rather than creating two conflicting sources of account ownership.

### Saves

Always save locally first. Upload only dirty state, debounce/coalesce, jitter periodic uploads and prioritize explicit pause/mission completion. Proposed periodic upper frequency: one dirty save per 120 seconds; measure actual payload and adjust against budget. Hidden/page-close uploads are best effort, not guaranteed. Retry only transient errors with exponential backoff and jitter, a bounded attempt/deadline budget and explicit local-only state. Stop on authentication, schema and permanent route/content-type failures.

Upload private checkpoint revision, then atomically publish its metadata reference using expected prior revision. Conflict returns 409 with a choice to keep this device's save or load the newer cloud save; never silently overwrite another device's progress. Two tabs coordinate locally where supported; server revision checks are still required. Run cleanup asynchronously. Local world state is not authoritative proof of scores.

### Results and leaderboard workers

Validate identity, body size, score bounds and idempotency before accepting a result. Create run + outbox in one transaction, return 202 with submission ID/status. An outbox dispatcher retries task enqueue; an independent reconciliation sweep catches missed enqueues. Cloud Tasks delivery may repeat: transactionally update best entry and processing marker once per run. Task-name deduplication is not sufficient correctness protection. Mark completed only after durable writes; isolate poison jobs after bounded retries and alert operators.

Separate queues for result aggregation, checkpoint cleanup and later email delivery. Auth/login never waits on these queues. Worker endpoints require Google-issued service identity; no publicly callable job endpoints. Set queue dispatch rate, max concurrent jobs, service instance caps and retry age from measured datastore headroom. No infinite self-enqueue loops. Reconciliation scans bounded indexed pending ranges, with pagination and age/rate caps.

Top-100 snapshots refresh on a controlled cadence, initially 30 seconds. Public reads use shared CDN caching, jittered refresh and stale-while-revalidate. Private account responses never use public caching. Public scorecards use stable immutable IDs and can be cached separately; don't disclose UID or private campaign keys.

### Presence

Assign each account deterministically to a presence shard and expose only its own session path. Establish `onDisconnect` before online status. Track multiple tabs/devices under the UID and count the account once. Do not accept arbitrary clients incrementing a public count. Ignore/expire stale sessions using server timestamps and reconciliation; logout and disconnect races must be tested. Aggregate shard counts into a timestamped public snapshot; tolerate short staleness rather than synchronously synchronizing a global counter per connection.

Initial planning assumption: eight shards, with one account connection reused per device and heartbeats no faster than 60 seconds when required. Native disconnect presence reduces dependence on polling. Shard count is provisional, not provisioned: test connection churn, per-shard write rate, function/event throughput, account deduplication and bandwidth before approving it. Reconnect storms require randomized exponential delays. Do not replicate every heartbeat into Firestore.

## Capacity envelope: planning assumptions, not measurements

| Workload | Planning case at 100,000 active accounts | Consequence |
| --- | --- | --- |
| Public count/board refresh | Every 30 seconds: about 3,333 client requests/s | CDN hits must avoid equivalent origin reads; test cache cold starts and origin shielding |
| Dirty cloud saves | 30% dirty at 120 seconds: about 250 uploads/s; all dirty: about 833/s | At 64 KiB compressed: about 15.6 / 52.1 MiB/s ingress respectively, excluding overhead; payload budget matters |
| Presence heartbeat | Every 60 seconds: about 1,667 writes/s plus joins/leaves | One RTDB instance is not the write-rate plan; shard and budget churn separately |
| First-time signup burst | 100,000 over ten minutes: about 167/s; over 100 seconds: 1,000/s | Benchmark hashing, username transactions and Auth quota; waiting/admission control required when over capacity |
| Result submissions | 100,000 runs finishing over ten minutes: about 167/s | Queue absorbs burst; eventual ranking update is visibly pending |

100,000 active accounts does not equal 100,000 simultaneous HTTP requests or exactly 100,000 database connections. Extra tabs, reconnects and devices add load. Traffic totals above are averages, not safe peak limits. Include at least a separately tested 2x short-lived non-auth burst and a cache/presence reconnect storm. A cold 100,000-signup arrival in one second is outside the launch promise; serve a bounded waiting/admission flow rather than overloading hashing or accepting undurable registrations.

RTDB documents 200,000 simultaneous connections for a database with plan-specific restrictions, but also approximately 1,000 writes/s and other bandwidth/event limits. Firestore advises gradual 500/50/5 ramp-up into new collections. Provider limits are ceilings, not evidence this application can operate at them. Free-tier quotas are not a credible 100k-concurrent budget. Verify plan and quota increases with the provider before testing.

## Reliability and release gates

Proposed SLOs to confirm with budget: non-auth API p95 under 500 ms, p99 under 2 s; admitted signup/login p95 under 3 s; less than 0.5% unexpected 5xx; top-board freshness under 60 s; presence freshness under 90 s. Report rejected/admitted auth requests and end-to-end signup waiting time separately, not hidden inside a low 5xx rate. Backend slowness must not reduce local gameplay FPS.

1. **Isolation and schema:** inventory existing project metadata, choose region and isolated resources, agree cost ceilings. No existing rules/app/hosting replacement. Verify access tests deny cross-account reads/writes and secret exposure.
2. **Emulator-first durable core:** transactional username races, credential compatibility, UID-bound saves, idempotent results/outbox, rule tests and failure injection. No cloud capacity claims from emulators.
3. **Staging API/workers:** least-privilege deploy, gateway limits, durable retries, backpressure, health probes, backups and approved budget. Confirm database/worker quotas. Every mutation has a recoverable partial-failure path.
4. **Migration rehearsal:** export pilot data privately, map existing IDs/reservations, copy with checksum/count reconciliation, rehearse cutover and rollback. No password plaintext, no dual writable ownership stores, no accidental username release. Do not modify or inspect unrelated fintech data.
5. **Load validation:** gradual 1k/10k/25k/50k/100k sessions, separate signup mix, 60-minute soak at target, churn and 2x burst cases. Use distributed generators, record their capacity, actual achieved sessions/RPS and cost. Never test third-party radio streams or production without separate authorization.
6. **Recovery:** worker crash/duplicate task, database throttling, cold cache, expired cookies, stale save revisions, disconnect storms and region outage exercise. Restore backup into isolated staging and measure recovery. Proposed RPO <=15 min and RTO <=60 min are requirements to verify, not guarantees.
7. **Controlled launch:** staged access, kill switches for signup/cloud saves/presence, stable offline play and last-good boards. Approve expansion only after SLO/cost gates pass. Existing game deployments remain untouched until rollout approval.

Metrics: auth queue wait/hash latency/pool use; request p95/p99/429/5xx; database operations/hotspots; cache hit ratio/origin misses; queue age/retries/dead letters; save conflicts/payload bytes; presence connections/churn/staleness; CDN egress and spend. Log event IDs and route/status, never credentials or checkpoint bodies. Budget alerts are not hard spending caps: add service/queue caps, quota controls and operational kill switches, and document residual billing exposure.

## Decisions needed before provisioning

Monthly baseline budget and maximum one-day spike budget; deployment/database region (compare Nigerian user latency with price and residency); allowed signup waiting window; no-email account recovery; staging project approval. Existing Firebase project's billing, databases and quota capacity have not been verified by this design document.

## Sources reviewed

- [Firestore scaling guidance](https://firebase.google.com/docs/firestore/best-practices)
- [Firestore quotas](https://firebase.google.com/docs/firestore/quotas)
- [Firebase custom authentication](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Firebase Authentication limits](https://firebase.google.com/docs/auth/limits)
- [Firebase presence pattern](https://firebase.google.com/docs/firestore/solutions/presence)
- [RTDB limits](https://firebase.google.com/docs/database/usage/limits) and [sharding](https://firebase.google.com/docs/database/usage/sharding)
- [Cloud Tasks delivery and idempotency](https://docs.cloud.google.com/tasks/docs/dual-overview)
- [Cloud Run scaling limits](https://docs.cloud.google.com/run/docs/configuring/max-instances)
