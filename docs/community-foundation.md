# Community foundation

This foundation extends the existing Netlify leaderboard. The later [player-account and district expansion](player-accounts.md) adds signup and registered-account counts; the browser-profile API below is retained as a legacy interface, not the current player counter. Payments and multiplayer combat remain absent.

- The ranks screen refreshes every 30 seconds while visible. Daily boards use UTC days; weekly boards cover today plus the previous six UTC days. Daily partitions retain recent scores even when a player's old best is higher. Historical scores have no daily partitions and appear only on all-time boards.
- Cloud ranks never include device-only scores. When cloud storage fails, the board explicitly shows device results.
- Score bounds are plausibility checks, not authoritative anti-cheat. Public result pages and PNG scoreboards say client-reported. Result records are immutable, public, and identified by random IDs. They exclude campaign transfer codes, party codes, and browser-profile IDs.
- Player totals count random browser profiles created since this feature launched, not people, visits, authenticated accounts, or historical players. Clearing storage or changing browsers creates a new profile. Tabs share a profile; online means a visible client sent a heartbeat in the preceding 90 seconds. Bots can inflate these unauthenticated counts.
- Heartbeats run outside the gameplay loop every 30 seconds, stop in hidden tabs, and back off to four minutes after failures. Score/result writes do not retry automatically. All API requests have an eight-second timeout and require JSON content types.
- Local development persists records under ignored `.data/community`. Netlify uses the `neon-breach-community` Blobs store. Legacy presence statistics are cached for 30 seconds and have a shared 1,000-key/four-second scan budget across profiles and recent presence. Exceeding the budget returns JSON 503, never an incomplete total. For a large audience migrate counts/presence to indexed storage before scaling. Each heartbeat removes the profile's previous minute-bucket record; abandoned profiles retain their last expired record, excluded from counts.
- Public results are permanent server records. PNGs are downloadable, but dynamic social preview images are not part of this release. Cloudflare/OpenAI worker builds serve the result-page assets but return JSON 404 for the new community APIs; the supported backend for this release is Netlify or the local server.

Next: district loading and geometry budgets; one new district with measured frame-time targets; a connected campaign chapter with new objectives. Monetization is deferred until those releases are verified.

## Verification

Run `npm test`, `npm run build`, `npm run qa`, and `git diff --check`. QA uses installed Chrome on macOS, or a cached headless shell elsewhere; `CHROME_PATH` can select an executable. It exercises genuine 3D low quality and explicit Canvas compatibility separately, plus public results and PNG downloads. QA enables SwiftShader for portability and is not a hardware performance benchmark. Record a separate hardware-backed trace before expanding world geometry or enemy budgets.
