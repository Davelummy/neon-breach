# Neon Breach → 10/10 Plan

Status as of Phase 1 (2026-07-17): **friends-and-family playable → identity pass started**.

## Definition of 10/10

A 10/10 Neon Breach is a browser FPS that:

1. **Feels premium in combat** (readable enemies, hitstop, weapon identity, audio).
2. **Makes each operation play differently** (rules, layout, mid-mission vehicle, stealth).
3. **Has memorable bosses** (unique verbs, not just HP + speed mult).
4. **Rewards returns** (build-style perks, medals, per-op leaderboards).
5. **Ships with proof** (unit tests + headless QA + local checklist green).

Not in scope for 10/10: multiplayer, photoreal assets, ten new campaigns.

---

## Phase status

| Phase | Goal | Status |
|---|---|---|
| **0** | Baseline green (`npm test`, local serve) | Done |
| **1** | Identity foundations (boss verbs, destroy stage, perks, juice, night stealth, tutorial beats) | **Done** |
| **2** | Combat readability + enemy silhouettes/FX | **Done** |
| **3** | Op differentiation (Night stealth rules, Iron vehicle mid, map variants) | **Done** |
| **4** | Boss polish + finisher camera | **Done** |
| **5** | Meta/replay (medals, daily challenge) | **Done** |
| **6** | Production hardening (tests, build, README) | **Done** |

---

## Phase 1 (shipped) — what changed

### Data (`public/data.js`)
- New stage type: **`destroy`** (Iron Harvest `SWEEP` → vault relays).
- Boss phases declare **`ability`**: `shockwave` | `cloak` | `slam`.
- Expanded career **perks**: Afterburner Cell, Finisher Protocol, Interceptor Plating.
- Exported `STAGE_TYPES`, `BOSS_ABILITIES` for tests/engine parity.

### Engine (`public/game.js`)
- `destroy` mission loop + shootable relay nodes.
- `fireBossAbility()` on phase thresholds.
- Cloak reduces damage while active; shockwave knockback; slam AoE.
- Hitstop on crits/kills/finishers.
- Night quiet movement lowers detection range / awareness build.
- Multi-step First Strike tutorial comms.
- Perk apply for jet recharge, finisher heal, vehicle hull.
- QA bridge: `damageNearestRelay`, `triggerBossPhase`, destroy/ability snapshot fields.

### Tests
- Destroy stage + boss ability invariants.
- Perk ladder shape.
- Campaign uses every stage type.

---

## Phase 2 — Combat readability (next)

**Files:** `scene3d.js`, `audio.js`, `game.js`

1. Role silhouette FX: Raven laser glint, Warden shield arc mesh, Stalker dash trail, Titan charge telegraph.
2. Distinct kill/crit audio stingers per weapon (extend `AudioSystem.shoot` / `hit`).
3. Soft target markers for destroy relays in 3D (emissive pillars from `destroyNodes` frame field).
4. HUD chip: live relay count during destroy stages.

**Verify:** `npm test`; manual First Strike + Iron Harvest destroy phase; `npm run qa`.

---

## Phase 3 — Op differentiation

1. **Night Raptor:** optional force-night default; detection cones; silent pistol bonus at night.
2. **Iron Harvest:** mid-mission vehicle segment (stage type flag `requireVehicle` or mid extract-style chase).
3. **First Strike:** longer sightlines day bias; more Specter/Titan mix (data only).
4. Optional second map layout via `mapLayouts[op.id]` without breaking 24×24 collision tests.

**Verify:** data tests for new fields; play each op on Recruit end-to-end.

---

## Phase 4 — Boss polish

1. Ability cooldowns mid-phase (not only on threshold).
2. Finisher camera: short locked orbit already has slowMo — extend for commanders.
3. Unique announce VO strings already present — add particle color identity per ability.

**Verify:** `triggerBossPhase` via QA for all three ops; manual nightmare HVT.

---

## Phase 5 — Meta / replay

1. Medals: no damage, full chain 8, vehicle-only kills, speed clear.
2. Local best-per-op scores in `localStorage`.
3. Daily modifier seed (no jet / shotgun only / double stalkers) from date hash.
4. Leaderboard query filter by operation when cloud API available.

**Verify:** unit tests for medal evaluation pure functions; manual arsenal/career UI.

---

## Phase 6 — Ship checklist

1. `npm test` + `npm run qa` + `npm run build`.
2. Manual matrix in `docs/local-test-plan.md` all green.
3. README: new stage type, abilities, perks, test commands.
4. Version bump Build number in menu copy if present.

---

## Architecture rules (do not break)

- **Data-driven missions** stay in `data.js`; engine only understands stage types + ability verbs.
- Operations remain **exactly 5 stages** (campaign persistence / wave clamp).
- Squad coordinates must stay on open cells (`tests/data.test.mjs`).
- Local server has no real campaign DB — QA must not require cloud.
- Prefer additive fields on boss phases / stages over rewrites of `updateMission`.

---

## Success metrics (playtest)

| Metric | Target |
|---|---|
| New player completes First Strike without quitting | ≥70% friends-and-family |
| Can name each boss’s special move after one fight | Yes |
| Iron Harvest feels different from First Strike | Yes in post-play survey |
| `npm test` + `npm run qa` | Always green before share |
| Session “one more run” rate | Subjective; watch for perk chase |

---

## Out of order / anti-goals

- Do not add multiplayer before Phase 5.
- Do not rewrite Three.js post stack unless quality tier is broken.
- Do not add a 6th stage without migration for `wave` 1–5 clamps.
- Do not invent API methods in campaign worker without updating `campaign-rules.mjs`.
