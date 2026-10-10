# Zero-cost backend foundation

Work remains on `agent/community-foundation`. No merge, commit, cloud deployment, billing activation or external load generation is authorized by this implementation. The existing local/pilot backend remains active; no accounts were migrated or discarded.

## Implemented offline

`server/scale-repository.mjs` is an internal server repository, with an injected transactional store and an adapter for a caller-initialized Firestore server SDK. It performs atomic case-insensitive username reservation/account/profile creation with 64 counter shards; compare-and-swap progress metadata; validated UID-bound run acceptance with an atomic outbox; duplicate-safe best-score processing with stable ties; and bounded retry/dead-job state.

`server/scale-worker.mjs` performs one bounded processing pass (default 20 discovered jobs, two concurrent handlers; hard bounds 100/eight). Discovery is an indexed pending/next_at query. Failed jobs do not poison the whole batch, raw exception text is not stored/returned, and an unavailable store does not trigger an infinite loop. This is worker logic, not an already-running cloud worker or task dispatcher. A deployed scheduler/Cloud Tasks identity and reconciliation mechanism are still required later.

All database transaction reads precede writes, consistent with [Firestore transaction requirements](https://firebase.google.com/docs/firestore/manage-data/transactions). Worker effects are transactionally duplicate-safe because [task delivery can repeat](https://docs.cloud.google.com/tasks/docs/common-pitfalls). Tests cover conflicts, rollback, account ownership, object-path/size limits, duplicate acceptance, reordered jobs, dead-job limits, fixed count-read cost, bounded concurrency and adapter delegation.

## Explicit limits

- Unit tests use a deterministic serial transactional harness; the separate `npm run test:firebase` now tests the actual adapter in the cached Firestore emulator. Six emulator tests pass, including transaction conflicts/rollback, duplicate workers and deny-all rules with mock identities. Neither suite proves production IAM, real Auth login, load capacity or 100k readiness.
- Temurin Java 21 and the three Firebase development packages were approved and installed. The repeatable localhost/demo-project harness automatically stops the cached emulator. No additional emulator downloads or cloud connections were made. HTTP authentication integration, checkpoint uploads and migration testing still need implementation before connecting the game.
- Repository methods are internal: an authenticated API must supply the UID, enforce rate/body limits and CSRF, and initialize a least-privilege database connection. Never expose these methods directly with a body-supplied UID.
- Credential hashing remains in the existing account service; this repository accepts only versioned salt/hash records from a trusted server. No Firebase token bridge/session migration is implemented yet.
- Cloud checkpoint upload/decompression/schema verification must occur before progress reference publication. Only metadata conflict/ownership checks are implemented here. No large checkpoint blobs are uploaded.
- Public snapshot publishing, CDN cache configuration, presence sharding, outbox dispatch/reconciliation, TTL cleanup and deployed backups remain to implement and verify. The pilot counts/leaderboard are not silently replaced by these new components.
- Worker atomicity is within a single Firestore transaction. Later external side effects need their own idempotency keys/outbox boundaries.
- Normal and dead job records require retention/cleanup policy; successful/failed job data is not automatically deleted here.

## Next increments, in order

1. Completed: local emulator integration and deny-by-default access tests, using fake identities and no production data.
2. Connect local API adapter under an explicit development-only selector; preserve pilot format/account IDs and test migration rollback. Never switch storage merely because credentials happen to exist.
3. Add private checkpoint upload validation, authenticated save API, and browser-visible save-conflict recovery.
4. Materialized public board/count snapshots and cached reads; server-owned presence aggregation without account scans.
5. Local durable job dispatcher/reconciliation and restart recovery tests; then staging-only worker deployment when funding and infrastructure are approved.
6. Incremental synthetic workload tests, cost measurements and recovery exercises. Neither the memory-store fixture nor a successful emulator run certifies production scale.

Current budget is $0. Free development is not a promise that viral production traffic is free. No cloud resources should be provisioned or billing enabled without explicit approval.

## Verification

`npm test` includes foundation tests without credentials or network. `npm run build` checks existing game bundling. `npm run qa` exercises the currently active pilot game, not the new database adapter. `git diff --check` checks tracked diffs; the new files must also be reviewed before staging. Existing gameplay QA failures must not be presented as backend success.

Latest local verification: 119/119 regular tests and 6/6 Firestore emulator tests passed; build and `git diff --check` passed; full gameplay QA is green. Fixed the outdated mission assertion and reset the glass fixture's ammunition after the preceding destruction test. Resume testing now waits for the real CSS-visible Continue button and authenticated account; campaign loading waits for identity before selecting an account-bound checkpoint. With login deliberately delayed, QA confirmed exact player/vehicle and world/timer restoration, real Three.js frames, Shift glass destruction, mobile controls and no uncaught page errors. The ten-size responsive layout matrix also passes after fixing decorative horizontal overflow. This is functional browser coverage, not hardware performance or 100k capacity proof. See `merge-readiness.md` for the limited milestone recommendation and remaining release gates.
