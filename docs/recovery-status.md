# Campaign and multiplayer recovery — 2026-10-10

The recovery branch is `agent/recover-community-foundation`, based on main commit `9f862a7c13eb18c1c97edf095789dd10e8499cb2`.

The missing working directory was `/private/tmp/neon-breach-rebuild`. Its source was reconstructed from 636 successful recorded file changes affecting 94 files in Codex session `019f6b49-4024-7441-8342-a34867c3d948`. All recorded hunks applied without conflicts. Failed patch attempts were not replayed, and no historical commands or JavaScript were executed.

Recovered areas include campaign districts and missions; tactical, responsive and controller interfaces; pickups and loadouts; vehicle damage, driving and presentation; civilian routes and the armory; radio controls; accounts and returning sessions; campaign checkpoint/local saves; community results and leaderboards; Firebase backend/emulator foundations; multiplayer rooms, movement, combat, vehicles, respawns, invitations and logout; and their tests and documentation.

The npm-generated Firebase dependency entries were separately restored from the final recorded package manifest. The lockfile was regenerated offline, without package installation or install scripts, and retains Firebase 12.19.0, firebase-admin 14.5.0 and rules-unit-testing 5.0.2.

## Original preservation verification (2026-10-10)

- Full `npm test`: 169 passed, zero failed. The first cold run had one server startup timeout; that test and the subsequent full suite passed.
- `npm run build`: passed. Cache fingerprint `neon-breach-329fbcee2c2c` matches the last recorded build before the temporary folder disappeared.
- `git diff --check`: passed.
- Fresh browser campaign/multiplayer/responsive QA: pending. The existing browser dependency import stalled before the browser or game server launched.
- Fresh Firebase emulator integration: pending dependency installation approval; Firebase test packages are not currently installed in this checkout.

This is a recovered-source preservation snapshot, not a release or production readiness certification. No deployment, main-branch merge, or cleanup has been performed. Historical QA results are not substitutes for fresh tests.

## Recovery copies and limitations

A second source copy and per-file SHA-256 manifest are retained under the Codex visualization recovery directory for this session, outside this checkout. Runtime files and generated artifacts under the former ignored `.codex` directory were not recovered. That includes local pilot account/session databases, not source code. Browser-local saves and any remote Firebase data require separate verification and have not been modified.

Keep both source copies until fresh QA and human review approve the recovery. Remove redundant files only after identifying their purpose and confirming that they are not the sole surviving copy.

## Release preparation update (2026-10-15)

The original Documents checkout's Git metadata and dependencies became iCloud dataless placeholders. They were not overwritten or reinitialized. A persistent release checkout was cloned outside iCloud under the Codex visualization directory. Its restored 95-file snapshot was verified against the independent SHA-256 manifest and Git tree `230106814f25717979875e2a1826d4944797ab51`; the original recovery commit `8484fa40f4d9796f082032d116b944c65d7b789e` was preserved exactly.

With the owner's installation approval, lockfile dependencies were restored with lifecycle scripts disabled. Fresh checks passed: 174 unit/integration tests, production build, six Firestore emulator tests, campaign Three.js functional QA, two-player browser multiplayer QA, and ten responsive layout sizes. Responsive QA now bounds browser shutdown so a completed assertion run cannot hang indefinitely. These are functional checks, not new hardware-backed FPS or physical-device certification.

Internet-mode code adds a separate WSS service, short-lived single-use tickets, session revalidation and fail-closed configuration. The owner approved a Render Free Frankfurt pilot. Authentication to the correct existing Netlify site was confirmed, including its GitHub `main` linkage. Production rollout remains blocked: Netlify rejected Functions-only secret scoping as a paid feature. Broader Free-plan environment scopes were not applied because they require explicit security approval. No paid plan, Render service, main-branch merge or main push was performed at this checkpoint. Do not mark internet deployment verified until its hosted two-client check passes.

The owner subsequently approved the standard private Free-plan environment setting, accepting access by authorized admins and build/deployment stages. Both required production settings were configured without printing their values. Building with the actual signing value available and scanning all 57 published files found zero matches. The approved Render Free Frankfurt service was created at `https://neon-breach-match.onrender.com`; hosted validation remains pending the release rollout. Netlify's local deployment state is ignored and must never be committed.
