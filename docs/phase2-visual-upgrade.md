# Phase 2: Three.js visual upgrade

The standalone campaign renderer now uses a gradient sky, local sun shadows,
and environment reflections. Gameplay rules, input mappings, accounts and
payments are unchanged by this work.

## Rendering budgets

| Active quality | Lighting and grounding |
| --- | --- |
| 0 | Gradient sky, original hemisphere fill, one pooled contact-shadow draw. No real shadow maps, PMREM lighting, transmission or bloom. |
| 1 | Camera-following 512px sun shadow map, cached PMREM environment and reduced hemisphere fill. Shadows refresh after 1.5 units of camera movement or at 2 Hz for moving actors. |
| 2 | 1024px sun shadow map on desktop (512px with coarse input), per-frame shadow updates, environment lighting and the existing bloom pass. |

Sun focus is snapped along the light's right/up axes to 32 / map-size units.
The shadow frustum spans ±16 units and moves around the player rather than
covering the origin corner of the 48×48 map.

The sky uses one sphere inside the 80-unit camera range, with a sun/moon disc
and horizon haze. It draws after opaque geometry with depth testing, so covered
pixels do not pay for unnecessary sky shading. Day, night and NVG use separate
palettes. Ordinary night does not enable NVG.

PMREM uses the installed Three.js 0.180 core implementation; no addons or assets
are downloaded. Each palette is generated once at 128px (64px for coarse input).
The cache has three possible entries and is not regenerated per frame.
Dropping to quality zero removes environment lighting, and dropping below
quality two disposes the bloom render targets.

Guns, metal trim, vehicle paint and rims have revised roughness/metalness.
Enemy chest/visor accents emit more light without adding PointLights.
Low contact shadows share one radial texture and one InstancedMesh with a fixed
96-instance budget; they follow visible grounded enemies and vehicles.

Review also corrected adaptive visibility: world/actor distance limits now
follow the active quality level, including an automatic drop to zero. Returning
to a higher quality restores geometry while retaining broken-glass and layout
visibility rules. The low pixel budget and reusable frame sets remain intact.

SSAO was not added. Forced higher settings remain expensive on the Intel audit
GPU, so adaptive fallback remains enabled during ordinary play.

## Local evidence

Run npm run qa:visual for day/night/NVG at all quality levels. The script also
checks the far-district shadow position, palette-cache bounds, visibility
transitions, actual world draw calls before post-processing, and browser errors.
Use --low-only or --mobile for isolated low-preset checks; --baseline captures
only the earlier low renderer. Screenshots and JSON live under the ignored
.codex/artifacts/phase2 directory.

The measurements are short local rendering samples, not physical-phone
certification or a controlled AI workload benchmark. Forced-quality screenshots
test the visual paths; they are not a recommendation to disable adaptive quality.

## Interaction regression found during validation

The documented multiplayer taxi-entry failure repeated twice. A regression test
reproduced a server input-loss case: when a press and release both arrived before
the next simulation tick, storing only the latest input discarded the tap.
The match now retains one pending interaction edge until the tick consumes it.
Holding the button does not repeat entry/exit, stale sequence numbers are still
rejected, and spawn resets clear the pending action. No input schema, identity,
speed, damage or vehicle-ownership rules changed.

## Validation on 2026-10-18

All required local checks passed on the final source:
npm test (185 tests), npm run build, git diff --check, npm run qa,
npm run qa:guest, npm run qa:responsive (ten sizes), and npm run qa:multiplayer.
Visual QA also passed every day/night/NVG quality combination, shadow-follow
and environment-cache checks, plus isolated low and touch-viewport runs.
The multiplayer suite passed after the lost-tap fix.

GPU: Intel Iris Plus Graphics 645 through ANGLE/Metal, WebGL2, DPR 1.
Desktop viewport: 1280×720; low drawing buffer: 768×432.
The desktop samples are three seconds per palette after settling.

| Low preset | Before median FPS | After median FPS | Before p95 ms | After p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Day | 59.9 | 59.9 | 33.4 | 50.0 |
| Night | 59.9 | 59.9 | 50.0 | 16.8 |
| NVG | 59.9 | 59.9 | 50.1 | 50.0 |

The two new low-preset draws add about 542 triangles at the matched camera.
Enemy positions and active counts vary, so these are observations rather than
proof of a p95 improvement. Frame-time spikes still reach about 50 ms.
Normal-preset fallback to quality zero now also uses the low visibility budget;
the fixed-camera world submissions dropped from roughly 483–522 to 196.

A separate 844×390 touch-viewport run, with four seconds of warm-up and six
seconds of measurement per palette, returned 59.9 median FPS in all three modes.
Its drawing buffer was 506×234; p95 was 16.8 ms day/night and 49.9 ms NVG.
This is touch emulation on the Intel GPU, not a physical-phone measurement.

Forced quality 1 measured 12–20 median FPS and forced quality 2 measured 15–20
on this machine. Higher settings are still expensive; the adaptive fallback is
required. The sky/contact-shadow budget is preserved at quality zero rather than
claiming that every quality level meets a 30 FPS target.

No dependencies were installed. The .git pointer and node_modules .nosync
symlink were preserved. QA screenshots and measurements remain ignored.
