# Merge readiness — community foundation

> Release preparation update, 2026-10-15: fresh recovery checks now pass with 174 tests, six Firebase emulator tests, campaign QA, multiplayer QA and all ten responsive layouts. See `recovery-status.md` for current evidence and `internet-multiplayer.md` for the new internet-mode implementation. Hosted rollout remains blocked on approved private signing-key configuration; no new hardware FPS certification or 100,000-player claim is made. The older review below is retained as historical context.

Branch: `agent/community-foundation`. Review date: 2026-10-06.

## Scope and recommendation

This is a playable development/pilot milestone, not a public viral-launch certification. Keep main, production deployment and billing untouched until the owner approves release. The new Firestore repository and worker are tested foundations, not the active game backend. Merging their source does not migrate accounts or start a worker.

Gameplay includes three expanded Abuja-inspired fictional arenas, mission guidance, loadouts and supplies, taxi/tricycle/bus entry and driving, sustained vehicle destruction, shattered glass, vehicle-only real-stream radio controls, responsive menus/touch controls, account onboarding, public result pages/PNG scoreboards, and exact account-bound local resume. External radio availability and permission are not guaranteed.

## Verified locally

- `npm test`: 119 passing tests, zero failures.
- `npm run test:firebase`: six passing real localhost Firestore emulator tests; emulator stopped afterward. Expected permission-denied logs prove deny-all client rules. No live Firebase project/data access.
- `npm run build`: deployable asset build succeeds.
- `npm run qa`: functional genuine Three.js gameplay, nonzero draw calls/triangles, visible 3D canvas with the Canvas layer hidden; compatibility separately tested. Includes vehicle/fence/pickup/mission flows, mobile orientation and exact delayed-login checkpoint restoration, no uncaught page errors.
- `npm run qa:responsive`: ten menu/gameplay-control layout sizes pass: 320×568, 360×640, 390×844, 568×320, 844×390, 768×1024, 1024×768, 1280×720, 1920×1080 and 2560×1080. Uses explicit compatibility mode to isolate layout; not 3D speed evidence.
- `git diff --check`: passes. Generated screenshots/build/test data remain ignored and are not staged.

Latest fixes bound legacy community count scans, remove menu ornament-induced horizontal overflow, await identity after responsive emulation reloads, and use the actual pointer event for mobile pause QA. Approved busboy/image-size patches are installed. Production audit has zero high/critical and five moderate dependency-chain findings; the complete development audit still has five high and eleven moderate findings. See `dependency-security-review.md` for exposure and remediation constraints. Do not represent this as a clean security audit.

## Release gates that are still open

1. Hardware-backed profiling of the expanded worlds on the target GPU. SwiftShader smoke frames/FPS are not acceptance measurements; no fresh 30 FPS/p95 certification is made.
2. Physical-device Safari/Chrome, gamepad and human mission-route/playability testing. Viewport emulation cannot prove every device.
3. Production identity security/recovery, distributed abuse protection, retention/expiry and privacy/deletion policies. Use disposable passwords on HTTP LAN previews.
4. Explicit local-only Firestore API integration and migration/rollback testing before any cloud switch; then bounded checkpoint uploads, cached read models, dispatch/reconciliation and recovery exercises. Current pilot storage cannot handle 100,000 concurrent signups.
5. Resolve remaining production dependency risk or explicitly accept it after independent review; verify actual Netlify deployment packaging and routes in a non-production preview before release.
6. Broadcaster terms/permission review and removal process before public/commercial live-radio distribution. Directory listing alone is not permission.

## Next appropriate step

Review the cumulative branch diff and merge this limited development milestone only if the above scope/limitations are acceptable. Do not deploy it as a 100,000-player launch. Continue with an explicitly selected emulator-backed API adapter and migration tests at zero infrastructure cost; no credentials-driven automatic backend switch or paid workers.
