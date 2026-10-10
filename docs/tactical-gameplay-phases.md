# Tactical gameplay, district grounding and mission guidance

Date: 2026-10-07. Branch: `agent/community-foundation`. Local work only; no main merge, cloud deployment, installation or billing change.

## Combat refinement

Grounded stationary shots are tighter than moving shots. Sprinting and airborne fire carry additional dispersion; the crosshair reflects the same stability factors. Existing recoil/recovery, reloads, weapon roles, Shift fire, controller controls and touch Aim remain. Aim assist helps while aiming down sights; Family mode retains assisted hip fire. Damage and enemy caps are not inflated to create artificial action.

## Enemy behavior and reinforcements

Sight observations are staggered at 10 Hz rather than raycasting and broadcasting every rendered frame. Awareness/movement/animation timers still update smoothly. A fresh line-of-sight check gates each shot and melee strike, so cached perception cannot authorize shooting through newly obstructed cover.

Squads communicate the observer's last-known coordinates, not just an awareness flag. Guards start with knowledge of their own location, not the hidden player's spawn. When sight is lost, advancing/flanking/engaging guards investigate the remembered location. Cover, peek, retreat, charge, dash and reload retreat use the remembered threat when sight is unavailable. Nearby loud weapons/vehicles can supply a sampled approximate sound location; quiet movement does not continuously reveal the player's position.

Defend-wave and boss-support reinforcements use existing map entry points, at least eight world units from the player, clear of vehicles/walls/live squad members, and outside the visible forward cone unless occluded. They receive the objective as an approach order and walk into combat. There is no endless retry or unbounded spawn search; if no safe entry is available that reinforcement is skipped. Initial stage squads remain preplaced; this is not a cinematic transport/drop-off system. The existing 24-live-enemy cap is retained, with the pre-existing commander exception.

## District visual grounding

Existing wall/glass/uniform materials use a more restrained concrete, sand and olive palette. Existing instanced road tiles distinguish asphalt from flat pedestrian verges with deterministic colour variation. No additional road meshes, buildings, enemy capacity, asset downloads or raised collision-inconsistent curbs are introduced. Taxi/tricycle/bus colours and distinct landmark layouts remain.

This is a material/readability increment, not photorealism, a geographically accurate Abuja reconstruction, or a completed environment-art overhaul. Higher-quality renderer features are preserved. Draw calls vary with live enemies/effects; unchanged mesh construction is not proof of unchanged frame time.

## Missions and recovery

Each mission-route step explains a concrete tactic: scout approaches, hold cover inside the upload zone, work through marked relays, manage the commander/escorts, and extract in an intact vehicle. The pause screen provides the current actual objective plus optional tactical advice and separately states local save availability. Touch-specific hints do not assume a keyboard. Existing phase triggers, campaign IDs, local snapshots, completion rules and API behavior remain.

## Verification and limitations

Regression tests cover dispersion ordering, bounded perception sampling, nearby squad reports, safe reinforcement selection and advice for every operation stage. The browser QA probe executes real enemy updates to confirm observation followed by last-known-position search, then exercises the real reinforcement spawner. Existing genuine Three.js frames, vehicle entry/driving/destruction, Shift glass breaking, touch Aim, orientation, and exact account-bound local restoration are retained in full QA.

Run `npm test`, `npm run build`, `npm run qa`, `npm run qa:responsive`, and `git diff --check`. The responsive matrix additionally opens the pause tactical plan and verifies that its scrollable panel fits. Screenshots remain ignored under `.codex/artifacts/tactical-phases*.png` and `.codex/artifacts/responsive`.

Chrome DevTools MCP hardware-profile tools are not available in this session. Functional QA uses SwiftShader and must not be reported as an iPad/GPU benchmark. Physical-device aiming, tactical encounter pacing, hardware frame time, thermal behavior and player comprehension remain unverified. Record tester play sessions before further combat tuning or large geometry/enemy increases. No claim of 100,000-user or public-launch readiness is made.

### Final local verification

- `npm test`: 126 passed, zero failures. Local HTTP tests required permission to bind a port; the restricted-sandbox rerun initially failed to start that server, then passed with the necessary local-server permission.
- `npm run build`: passed, cache ID `neon-breach-3bf2d881783a`.
- `npm run qa:responsive`: passed all ten sizes, from 320×568 through 2560×1080, including menus, touch targets, scrolling and the expanded pause tactical plan. Desktop pause is tested with Escape rather than the touch-only handler.
- `npm run qa`: SMOKE GREEN on the final code. Real AI observation/search and reinforcement routing passed; Three.js submitted nonzero draw calls and triangles with the Canvas layer hidden. All three landmark arenas rendered matching layouts. Vehicle entry/exit, driving, sustained-fire destruction, Shift glass breaking, touch Aim, rotation and exact delayed-login checkpoint restoration passed. No uncaught page errors were observed.
- `git diff --check`: passed. Screenshots were written only to ignored artifact paths, including `tactical-phases-final.png` and its arena/mobile variants.

These are automated functional checks, not hardware performance or physical-screen certification. No commit, push, merge, deployment or external service change was performed.
