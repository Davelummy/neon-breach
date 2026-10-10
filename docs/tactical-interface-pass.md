# Tactical interface — first implementation pass

Date: 2026-10-07. Branch: `agent/community-foundation`. No merge or deployment.

## Direction and sequence

Tester feedback is broad: more believable overall and more tactical. The observed devices were iPads, but the product remains responsive across phones, tablets, computers and controller input. No physical-device usability or speed result is inferred from this feedback.

1. Implement and verify combat information hierarchy and touch ergonomics (this pass).
2. Observe testers approaching an objective, finding cover, aiming and reloading. Tune recoil, movement accuracy, damage feedback and encounter readability from recorded failures; preserve established controls.
3. Improve squad searching/flanking and visible reinforcements with bounded updates and repeatable encounters. More tension is not simply more enemies.
4. Ground Abuja streets with consistent dimensions, roads, sidewalks and landmarks. Profile genuine hardware WebGL before increasing geometry or enemy budgets.
5. Connect purposeful approach/objective/extraction missions and test route choices. Do not remove jet flight, shields or existing campaign features silently.

## Implemented behavior

- Tactical combat display is the default, with objective, vitals, weapon/ammunition, reload/supply warnings and vehicle hull/boost feedback. Desktop score/radar and decorative combat counters no longer dominate the screen. Full display remains selectable; difficulty and mechanics do not change.
- Primary touch AIM sits beside Fire and Reload. It is not hidden behind MORE. Jump/flight, weapon selection, melee, sprint, aim assist, fullscreen, keyboard/mouse and controller paths remain.
- Touch control visibility can be adjusted from 60–100%. Active controls stay opaque. This is visibility adjustment, not freely draggable control placement.
- Interface choices persist locally with guarded storage access. Corrupt, unavailable or full storage never prevents play.
- Health values remain visible on touch screens; vehicle and ammunition states use plain language instead of camera/auto-lock jargon. New status text only changes when its meaning changes.
- The short-landscape vehicle prompt is moved away from the jump/aim/fire controls. Essential touch targets are checked for actual hit testing and mutual overlap, not only screen bounds.
- Safe-area and viewport rules remain. Interface layouts follow screen size/input capabilities, not device brand. No new backend, external dependency or telemetry is added.

## Design rationale and validation boundary

The Norman design skill informed recognition-based labels, stable control mappings, essential status feedback and reversible Full/Tactical preferences. Tester comments are not evidence that every proposed visual/AI change will improve realism. Automated layout tests cannot establish player comprehension, physical-iPad heat/performance, gamepad ergonomics or universal responsiveness.

Run `npm test`, `npm run build`, `npm run qa:responsive`, `npm run qa`, and `git diff --check`. Responsive screenshots remain ignored under `.codex/artifacts/responsive`; layout tests deliberately use compatibility mode, while gameplay smoke separately proves nonzero genuine Three.js frames. Neither is a hardware FPS benchmark.

Current automated results: 121 unit tests passed; build and diff whitespace validation passed; all ten responsive sizes passed with primary touch hit-testing and overlap checks. The matrix includes phone portrait/landscape, tablets, desktop and ultrawide. The short-landscape nearby-vehicle overlay was found by the stronger hit test and corrected before the passing rerun.

Full gameplay QA also passed, including persisted Tactical/Full selection, real primary touch Aim toggling, all three genuine 3D arenas, vehicle controls, Shift shooting/glass destruction, rotation, exact local resume and no uncaught page errors. Captures are under `.codex/artifacts/tactical-ui*.png`. Physical-device and human testing remain outstanding.
