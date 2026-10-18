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

## Multiplayer foundation — online free-for-all target

Run `PORT=4176 npm run dev`, open the main game, sign in and select **Multiplayer · Create / join room**. Create a private day/night room and share its code/invite. The free-for-all supports 2–8 players, campaign-paced walking and sprinting, shared taxis/kekes/buses, server-owned hits/kills and timed respawns. Each round lasts 180 elapsed seconds while at least two players are present. It ends on a frozen results screen, ranked by kills then fewer deaths; equal scores/deaths are a draw. Only the host can explicitly start the next arena (Cross/A or the button); host ownership passes to another player if they leave. There is no automatic endless rotation. Options/Escape stops your inputs during active play, not the live match. Keyboard, touch and simulated standard-controller controls are covered by browser tests. Use throwaway passwords over local HTTP.

Multiplayer reuses campaign gunfire, directional enemy shots, jet ignition/thrust, footsteps, vehicle, damage and ambient audio. Server-confirmed, wall-clipped bullet tracers use a bounded 64-slot visual pool; they do not change hitscan damage rules. Sound follows browser activation/mute rules and stops when hidden, disconnected or finished. Campaign mission selection and the multiplayer lobby offer real 3D arena previews with day/night lighting. Preview contexts render on demand and are disposed before gameplay. Run `npm run qa:arena-preview` for layout/lighting/resource-lifecycle checks; physical-device listening remains a separate test.

Internet play uses the same main-menu interface, with a separate authenticated WSS match service and short-lived, single-use tickets from the Netlify account API. See [internet multiplayer deployment](docs/internet-multiplayer.md) for configuration, security boundaries and Free-plan pilot limits. Rooms/results are memory-only; this is not public-launch or load-certified. Run `npm run qa:multiplayer` for the main-menu, movement and two-browser combat test. Daily QA shortens only the final round-expiry wait to eight seconds through an isolated loopback test-child IPC preload; production servers have no short-round setting or endpoint. Run `npm run qa:multiplayer:release` before the final push: it omits that preload and exercises the real 180-second round. Server timer catch-up is capped at 0.25 seconds per tick after a stall.

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
- R1, Triangle or D-pad left/right: Change weapon
- Square: Reload · hold beside a vehicle to drive it (or to use the armory)
- Circle: Crouch · while sprinting, slide
- X: Jump / jet assist
- R3: Close-range finisher

Driving: left stick steers and drives, R2 accelerates, L2 brakes, X boosts,
D-pad left/right changes radio station, up tunes/plays, down turns the radio off; L1/R1 lowers/raises radio volume,
Circle gets out.

Vehicle radio keeps one media element primed by your first click, tap or key press;
subsequent station, playback and volume controls work from the pad. D-pad up also
retries unavailable/blocked playback. Browser-level sound denial cannot be bypassed:
if prompted, press Enter or Play once to grant audio permission. Radio stops on exit
or pause; discovery and stream failures do not trigger an automatic retry loop.

### Keyboard and mouse

- W/A/S/D: Move
- Mouse: Look and aim
- Shift or left mouse: Fire
- Right mouse: Aim down sights
- Q: Sprint
- Space: Jump / jet assist
- R: Reload
- 1–4 or mouse wheel: Change weapon
- E: Drive or exit a vehicle (N tunes / changes the vehicle radio)
- C (toggle) or Ctrl (hold): Crouch · while sprinting, slide
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
- **Op-specific rules** (`OP_RULES`): Night Raptor stealth, Iron Harvest vehicle stage + layout patches, First Strike open routes; day/night remains player-selectable, separately from night vision.
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
