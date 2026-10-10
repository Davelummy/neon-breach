# Vehicle presentation

Campaign and multiplayer use the same procedural taxi, keke and bus factory and animation. Vehicle forward is +X. The tyres spin around Z using distance divided by radius; only front steering pivots rotate around Y. Small, bounded body roll and pitch communicate cornering and acceleration without moving collision bodies or lifting wheels off the ground. Brake lights reflect the existing braking state.

The green/white taxi has a sloped bonnet and cabin, separated roof, pillars, door trim, handles, mirrors, rims and rear lights. The yellow keke has a canopy, seats, open sides, front fairing and steerable front wheel. The bus has a sloped windshield, side windows and a door. Static detail is baked by material at construction; each model is under twenty mesh submissions before scene-level shadow passes. There are no new dynamic lights, asset downloads or per-frame geometry/material allocations.

Tests cover footprints, grounded wheels, steering selection, time-based spin, reverse travel, bounded body movement, braking/wreck state and mesh-submission budget. Functional Chrome QA uses software rendering: it does not certify hardware FPS or real iPad/controller behaviour.

These remain stylized procedural models, not photorealistic vehicles. This improves silhouette and motion feedback; authored body meshes, wheel arches, textured interiors, higher-fidelity materials and a properly tuned cockpit/chase camera would be a further production pass. This change does not replace vehicle dynamics with a full suspension or tyre simulation.
