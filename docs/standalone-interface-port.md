# Standalone interface improvements

This branch selectively ports the Vatar preview's non-commercial improvements
onto origin/main. It does not merge the Vatar branch.

## Included

- A short Play / Continue / New campaign home flow and a dedicated Loadout screen.
- Lightweight weapon thumbnails, with on-demand rotatable 3D inspection.
- Visual weapon selection in mission preparation, collection, and the district armory.
- Primary-button drag-to-look when pointer lock is denied (including trackpads).
- Vehicle-only radio tuning from N, and a visible Play control when radio is off.
- Existing accounts, logout, multiplayer, leaderboards, cloud/local saves and controls.
- Guest campaign play with device-local saves, earned credits and weapon unlocks.
- Account prompts for online features and transfer of guest progress on signup.
- Stored leaderboard rows are checked against score and kill-rate limits.
- Real weapon comparison statistics, unlock progress and compact briefing strips.
- Short-screen account forms, font fallbacks and pause-menu alignment fixes.

## Intentionally excluded

No Vatar SDK, platform identity, test badge, purchase verification, paid pack,
entitlement, checkout, webhook, or payment endpoint is included.
The original six weapons and earned-credit progression remain unchanged.
“Buy” in the district armory still means credits earned in gameplay, not money.

## Verification

Run npm test, npm run build, npm run qa, npm run qa:guest, npm run qa:responsive,
npm run qa:multiplayer, and git diff --check.
The smoke suite checks 3D inspection, persisted visual selection, denied-pointer-lock
drag and release, campaign rendering, saved progress, radio gates and controller input.
Responsive QA includes the new Loadout screen at ten viewport sizes.
Guest QA checks account prompts, local-only campaign storage, completion,
score publication after signup and migration of guest credits and progress.

Browser automation is functional coverage, not hardware FPS certification or proof
that every physical phone/tablet/controller behaves identically.
Vatar's deployed review build is unchanged. Publishing the standalone build is a
separate release step.

## Local merge validation — 2026-10-18

- npm test: 181 passed, zero failures.
- npm run build: passed; service-worker cache 18384a1281a1.
- npm run qa: passed, including actual WebGL rendering, mission victory and score publication.
- npm run qa:guest: passed, including guest account prompts, local-only saves and signup migration.
- npm run qa:responsive: passed at ten sizes, from 320×568 to 2560×1080.
- npm run qa:multiplayer: passed on rerun. The first attempt timed out confirming
  taxi entry; the check now reports the player, vehicle and menu state on failure.
- git diff --check: passed.
- SHA-256 comparison of 159 repository files found no exact duplicate files.

Review also closed the guest leaderboard-navigation gap, explicitly kept guest
campaigns away from cloud storage, and rejected invalid stored elapsed times.
Build output, QA screenshots, local account data and dependencies remain ignored.
This validation does not publish a release or certify internet load capacity.
