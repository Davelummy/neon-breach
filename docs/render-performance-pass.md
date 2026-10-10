# Render performance pass — 2026-10-07

Local development on `agent/community-foundation`; no commit, push, merge, installation, deployment or billing change.

## Changes and reasons

- The first arena contains 446 opaque wall cells. Shared material/geometry chunks reduce those to 36 instanced wall batches without changing any collision cell, material, height or arena layout. Chunk culling includes its extent, so a near edge is not culled merely because the centre is far away. Glass remains individually breakable.
- Low quality has a hard 331,776-pixel drawing-buffer budget, preserves aspect ratio and caps scale at 0.6. At 1280×720/DPR 1 it draws 768×432 instead of 921×518. Large tablets/ultrawide screens cannot silently multiply low-preset pixel work. Higher presets retain their original scale limits.
- Low retains ordinary transparent glass but avoids the physical transmission scene pass and extra neon/weapon/terminal point lights. Hemisphere/sun/fill lighting, emissive details, glass visibility/destruction and genuine Three.js gameplay remain. Higher presets retain transmission and point lights.
- Distant enemy and vehicle models are not submitted on low; enemy simulation still runs. Currently occupied vehicles remain visible. Animations outside the low render radius are skipped. Nearby opponents/vehicles and all controls remain functional.
- HUD text/status updates are bounded to 20 Hz; simulation, input, camera and aiming continue every frame. Destroy-node frame sets are reused.
- Projectiles share geometry and a bounded weapon-colour material cache instead of allocating geometry/materials per bullet. Expired private enemy/corpse/car/blood models release their GPU geometry/materials once and stop texture polling; shared textures/materials and instanced/supply/particle resources are protected. This closes an identified ownership gap; it is not a claim of exhaustive leak detection.

## Measurements and honest limits

`scripts/qa-render-cost.mjs` uses a temporary regular Chrome profile, explicitly sets CPU rate 1 and no network throttling, requests low quality, verifies WebGL2 and rejects SwiftShader/llvmpipe/software renderers. It enters active gameplay at a repeatable camera location, warms up, measures at least 15 seconds, captures a Chrome trace, then records a separate paused-scene inventory. All output stays in ignored `.codex/artifacts`.

Latest final run: visible regular Chrome; Intel Iris Plus Graphics 645 via ANGLE/Metal; 1280×720 viewport; DPR 1; drawing buffer 768×432; low; 1× CPU; no network throttling; active gameplay for 15,095.8 ms.

| Metric | Final run |
|---|---:|
| Median FPS | 59.88 |
| Median frame time | 16.7 ms |
| p95 frame time | 33.4 ms |
| Worst frame | 100 ms |
| Long tasks | 2 / 150 ms total |
| Active draw calls | 257 |
| Active triangles | 35,976 |
| JS heap movement | -44,266 bytes |

The earlier pre-change hardware-rendered headless run measured 30.03 FPS median, 33.3 ms median / 100 ms p95, with 611–765 active draw calls. Intermediate timing varied substantially. Because the final capture uses visible Chrome and live actors are randomized, this is **not a controlled apples-to-apples FPS improvement claim**. The structural batching and final genuine-3D result are verified independently; paused-scene draw counts must not be presented as active combat counts.

The final run meets the earlier 30 FPS / p95 below 50 ms threshold in this measured scene, but is not lag-free: the worst frame and long tasks remain material. The run is stationary active gameplay, not every encounter, boss, driving route or all-day session. Short-term heap movement is not proof of no leak. Physical iPad/phone behavior, thermal stability, repeated encounter stress and network/device differences still need testing. Do not promise smooth performance on every screen or mark all launch gates complete.

## Verification

Regression tests cover batching identity/height, chunk edge culling, low pixel caps and private-resource disposal protection. Final verification: `npm test` 130/130 passed; `npm run build` passed (cache ID `neon-breach-f8dfeff23ac4`); `npm run qa` SMOKE GREEN; `git diff --check` passed. Gameplay QA verified matching genuine 3D layouts in all three arenas, vehicle entry/driving/destruction, Shift glass breaking, mobile Aim/fire/rotation, mission progression and exact account-bound checkpoint restoration, with no uncaught page errors. Screenshots are ignored under `.codex/artifacts/lag-pass*.png`. Existing campaign/local-save/API behavior and the multiplayer proposal are kept separate. Multiplayer is not implemented by this pass; see `multiplayer-foundation-plan.md`.
