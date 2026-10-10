# Local Firebase verification prerequisites

Checked locally; Java installation was explicitly approved. No production game data was accessed:

- Node.js 24.14.1 is installed.
- Firebase CLI 15.16.0 is installed. Its emulator code requires Java major version 21 or newer.
- Homebrew 6.0.17 is available at `/usr/local/bin/brew`.
- Temurin Java 21.0.12.1+1 is verified at `/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home`, after the user completed the approved Homebrew installation in their terminal.
- Cached Firestore emulator 1.19.8 starts with this Java runtime. A direct JAR invocation bound to localhost and `demo-neon-breach` loaded the deny-all rules. Anonymous REST reads/writes returned 403; a disposable emulator-admin write/read/delete succeeded. The probe was deleted and the emulator was stopped. This is startup/rule-baseline smoke coverage, not SDK adapter, authenticated cross-account or capacity verification. Emulator UI and Auth were not started; no additional binaries were downloaded.
- An isolated local-only configuration exists at `scripts/firebase/emulator.config.json`, with loopback Firestore/Auth ports and deny-all client rules. The approved development packages are installed: `firebase-admin` 14.5.0, `firebase` 12.19.0 and `@firebase/rules-unit-testing` 5.0.2. `npm run test:firebase` uses the cached Firestore JAR directly; it does not start Auth or download binaries.
- The CLI version check emitted an update-cache permission warning. Do not use its suggested recursive ownership change; this is not evidence the application is broken.

## Approval needed

Java and the three development package installations were approved and completed. Further package installations, upgrades or emulator binary downloads require approval. No billing or deployment approval has been given.

After Java is approved and verified, prepare local-only configuration using a demo project ID such as `demo-neon-breach`, loopback-bound emulator ports and isolated test data. Never use the real Firebase project as a fallback when an emulator is unreachable. Add explicit endpoint/demo-project checks before SDK initialization. No billing, deploy commands or production credentials are needed for this test stage.

The prepared configuration is intentionally not `firebase.json` at repository root, has no real-project alias and is not a deployment manifest. Planned full-suite startup uses an explicit `--config scripts/firebase/emulator.config.json --project demo-neon-breach --only firestore,auth`. Do not execute until prerequisite installations/downloads are approved. The cached Firestore smoke test used the JAR directly to avoid CLI auto-downloads; no emulator remains running from this check.

Required emulator transaction/rules verification is recorded below. Main remains untouched until dependency review, full branch review, regression validation and migration/rollback review are complete.

## Real-adapter verification completed

`npm run test:firebase` passed six tests against the cached emulator: racing case-insensitive username claims; atomic rollback; racing save revisions; immutable run/outbox records and duplicate workers after repository recreation; bounded due-job discovery/draining; denied reads/writes for anonymous, own-account and other-account mock-authenticated clients. The current rules deliberately deny all client access; this does not prove any future owner-allowed policy. Real Auth login/token issuance, HTTP authorization, cloud checkpoint upload and live migration are not covered yet.

The harness rejects arguments and an occupied port, fixes the demo project and loopback endpoint, strips unrelated environment configuration from the test subprocess, and shuts down the emulator without exporting data. No production resources are contacted. `firestore.indexes.json` records the pending-job query index for future review; the emulator does not certify production index enforcement or capacity.

Dependency audit after installation reported 18 package findings (7 high, 11 moderate, no critical). These are package-chain findings, not necessarily 18 distinct vulnerabilities. Firebase's development gRPC dependency chain and pre-existing tool/runtime chains require review before merge. No `npm audit fix` or forced downgrade was run.

Production-only audit reported seven findings: two high (`@fastify/busboy`, `image-size`) and five moderate in the Netlify/OpenTelemetry chain. Their reachability in the deployed game has not been established; do not dismiss them merely because emulator tests pass. Both installed lockfile remediation and runtime exposure must be reviewed before any merge recommendation. Existing 118 regression tests and the build pass after installation; whitespace checks and fail-closed runner guards pass. No game code or live storage selection changed in this increment.

Sources: [Firebase local setup](https://firebase.google.com/docs/emulator-suite/install_and_configure), [Firestore emulator guidance](https://firebase.google.com/docs/emulator-suite/connect_firestore), and [Homebrew Temurin 21](https://formulae.brew.sh/cask/temurin@21). Installed CLI source was checked to resolve the Java requirement rather than relying only on general documentation.
