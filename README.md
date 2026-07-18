# NEON BREACH

A playable 3D browser FPS with a three-operation campaign, six enemy archetypes with tactical squad AI, multi-phase boss fights, weapon and perk progression, vehicles, controller support, cloud campaign saves, a global leaderboard, and adaptive audio.

## Play

**Host for family & friends (recommended):** see **[DEPLOY-NETLIFY.md](./DEPLOY-NETLIFY.md)** — one public link, shared world leaderboard.

```bash
npm install
npm run build
npx netlify-cli deploy --prod   # after netlify login / init
```

**Local:**

```bash
npm run dev
# open the Network URL printed in the terminal for same-Wi‑Fi play
```

## Campaign operations

Pick an operation from the mission command panel. Each runs five phases and ends in a vehicle extraction.

1. **FIRST STRIKE** — Infiltrate the district, breach the data center, defend the uplink, eliminate Commander Voss, extract north.
2. **NIGHT RAPTOR** — Cross the plaza after dark, climb the comm tower, hold it while the scrambler cycles, silence Raptor Actual, run the southern corridor.
3. **IRON HARVEST** — Push to the northern depot, drain the foundry core under siege, reach the vault, destroy the command titan Warden-6, burn for the northeast beacon.

Every commander is a multi-phase boss: wounding it past each threshold triggers reinforcements and rage escalations.

## Enemies

| Archetype | Role |
|---|---|
| WRAITH | Fast flanker with combat dashes |
| SPECTER | Mid-range support, wide strafes |
| TITAN | Heavy assault, charges when it sees you |
| STALKER | Rusher — closes distance and mauls in melee |
| RAVEN | Sniper — precise, deadly, keeps its range |
| WARDEN | Shielded — frontal kinetic barrier; flank it or use the finisher |

## Progression

Career stats accumulate across all cloud-saved runs and unlock:

- **NX-7 ARC MARKSMAN** rifle — 50 career eliminations
- **REINFORCED PLATING** (+20 max armor) — win any operation
- **AEGIS CAPACITOR** (+15 max shield) — 8 career finishers
- **EXTENDED MAGAZINES** (+35% reserve ammo) — 120 career eliminations

A global leaderboard ranks operatives by best score (emails are masked).

## Controls

### PS5 controller

- Left stick: Move
- Right stick: Look
- L2: Aim
- R2: Fire
- L1: Toggle auto-lock
- R1 or D-pad: Change weapon
- Square: Reload
- X: Jump / jet assist / vehicle boost
- Triangle: Enter or exit vehicle
- R3: Close-range finisher

### Keyboard and mouse

- W/A/S/D: Move
- Mouse: Look and aim
- Shift or left mouse: Fire
- Right mouse: Aim down sights
- Q: Sprint
- Space: Jump / jet assist
- R: Reload
- 1–4 or mouse wheel: Change weapon
- E: Enter or exit vehicle
- F: Close-range finisher
- T: Toggle auto-lock
- M: Toggle audio

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173`.

For a production build:

```bash
npm run build
npm start
```

## Testing

```bash
npm test       # node:test suite — mission/enemy data invariants, save validation, path safety
npm run qa     # headless gameplay smoke (chrome-headless-shell)
npm run verify # test + qa
```

Full local matrix (manual + automated): [`docs/local-test-plan.md`](docs/local-test-plan.md)  
Roadmap to 10/10: [`docs/ten-out-of-ten-plan.md`](docs/ten-out-of-ten-plan.md)

### Gameplay systems (Build 5.0)

- Boss phase **abilities** + mid-fight pulses: shockwave / cloak / slam
- **Destroy** stage (vault relays) + 3D relay markers
- **Role silhouette FX** (sniper glint, shield arc, dash trail, charge ring)
- **Op-specific rules** (`OP_RULES`): Night Raptor forced night + stealth, Iron Harvest vehicle stage + layout patches, First Strike open routes
- **Finisher camera** with letterbox (longer for commanders)
- **Medals** + career rack; **Daily challenge** modifiers (UTC seed)
- Expanded **perks**, combat hitstop, multi-step tutorial

## Technology

- JavaScript and WebGL (ES modules, no bundler)
- Three.js with a hand-rolled bloom/vignette post pipeline and adaptive quality scaling (auto-tunes pixel ratio and effects to the device's frame budget)
- Data-driven missions, enemy archetypes, and progression (`public/data.js`)
- Procedural 3D characters, weapons, vehicles, buildings, and effects
- Web Audio API
- Gamepad API with PS5 mapping
- Progressive Web App support (offline-capable)
- D1/Drizzle campaign persistence with server-side score plausibility validation

## Status

Friends-and-family release. The game is playable and shareable, but it is not presented as a finished AAA commercial release.
