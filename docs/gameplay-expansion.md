# Gameplay expansion: supplies, loadout, direction and radio

## Implemented slice

- Health, ammo and gun caches are placed on open cells near each phase target (bounded to 24 live pickups). Supply shapes distinguish medkits, cartridge boxes and gun caches; proximity text explains the action. Walk over supplies on foot to collect. Full resources leave medkits/ammo behind. Enemy drops persist 45 seconds rather than 15.
- Gun caches equip the marked weapon and refill its magazine. Daily weapon locks are respected. Existing unlocked-weapon cycling remains; this is a starting-weapon picker, not a two-slot inventory redesign.
- KX-5 SMG trades damage and accuracy for rate of fire. MG-60 LMG trades reload time and handling for magazine capacity. Existing weapon indices, unlocks, controls and campaign saves remain compatible. Keys 5/6 add access without changing keys 1–4.
- Mission guidance stays in the HUD: required action, relative direction, distance, hold countdown and relay count. Direction points toward the target, not a computed navigable route through walls. The radar and world marker remain important.
- Gameplay radio offers Tactical score, Capital Pulse and Dusk FM plus Off and independent music volume. These are original procedural compositions, not commercial recordings or live Nigerian radio broadcasts. Command speech ducks the music bus. Gunfire retains its separate mix and SMG/LMG reports differ. A compressor limits excessive layered audio peaks.

The Norman design model is recognition → action → visible outcome: identify the medkit/ammo/gun, see what walking over it does, and get a truthful amount/equipment confirmation. Persistent mission text reduces reliance on remembering a transient command message. Automated tests do not establish player comprehension or perceived audio quality; test these on headphones, speakers, mobile and controller with actual players.

## Abuja world: approved fictional district direction

The approved direction is fictional Abuja-inspired districts, not geographic replication. The first visual blockout adds an Aso Rock-inspired outcrop, a gold dome/four-minaret skyline, a peaked civic silhouette, instanced office towers and trees outside the existing combat boundary. It uses original procedural geometry with no new lights, background shadows, downloaded models or map datasets. The skyline draws on the [Nigeria Park Service's Abuja landmark list](https://nigeriaparkservice.gov.ng/blog/2023/11/17/nigeria-national-parks-service-brochure/) and the [FCDA's planned-city account](https://fcda.gov.ng/the-history-of-abuja/).

The mission menu now separately selects City Gate Approach, Millennium Park or Jabi Lake Waterfront. Each changes the playable central layout, cover placement, ground palette and in-arena landmark dressing: gate pillars and overhead arches; garden hedges and a fountain; or boardwalk decking and a waterfront shelter. Millennium Park's garden and fountain direction draws on the [FCTA park description](https://www.fcta.gov.ng/ova_por/millennium-park-abuja/). These are fictional combat blockouts, not accurate geographic replicas. The outer buildings and mission anchors remain shared within the 24×24 footprint; this is not yet three completely separate large maps or a finished Abuja city.

Fence landing uses the same height data as Three.js, and small barriers/crates/planters/benches share explicit collision and rendering footprints. Arena boundary walls remain impassable even while airborne. Overhead decoration and skyline silhouettes are not all climbable surfaces; lake dressing does not implement swimming.

Vehicles now include three green-and-white Abuja-style taxis and two yellow tricycles, with distinct Three.js models. Approach on foot and press E, PS5 Triangle or the visible Enter button; use the same action to exit. Entry checks proximity and line of sight. Exit searches clear positions around the vehicle and refuses an obstructed exit. This is vehicle entry/driving, not an animated hinged-door system. Keyboard and touch interactions have automated browser coverage; a physical PS5 controller still needs human testing.

Local campaign saves and the Netlify campaign record retain the arena selection with validation and a City Gate default for older saves. The legacy generated SQL-worker storage does not persist this extra field yet. Scores remain grouped by operation rather than arena. Hardware performance must be measured again before increasing detail or enemy budgets. Real sacred/civic landmarks remain distant contextual silhouettes, not copied combat interiors.

The subsequent [expanded-arena and account pass](player-accounts.md) increases all arenas to 48×48 with driving corridors and district-based mission routes. The 24×24 limitation above describes the earlier landmark blockout, not the current collision grid.

## Radio content: original synthesis approved

Gameplay radio now uses its own bounded timer rather than the simulation's clamped frame delta, so low rendering FPS does not stretch the rhythm. Pause/end/menu transitions stop the timer; resume restarts it. A separate music boost makes the original synthesized stations audible, and speech ducks the bus once rather than reducing both note and bus gains. Browser QA checks a running audio context, advancing beats and nonzero music-bus samples; listening on the target device is still needed for subjective mix quality.

## Destruction and encounter expansion

Player bullets now collide with oriented taxi/tricycle bodies. Depleted vehicle health triggers synthesized explosion audio, capped debris, distance-based collateral damage and bounded chain reactions. A charred wreck remains visible and solid. Glass breaks from player bullets, enemy projectiles and unobstructed nearby blasts; broken panes remain removed from rendering and collision. Vehicle cover blocks shots to enemies behind it.

Each mission squad and its scheduled defence reinforcements gain up to three spaced-out guards. Ordinary enemies are capped at 24 live actors; a required commander is exempt so the objective cannot silently disappear. Reinforcements use the existing finite mission wave schedule, not an endless spawn timer. Destroying every extraction vehicle produces an explicit failed operation rather than an unwinnable waiting state. Hardware-backed performance after this encounter increase has not been measured.

## Mobile orientation and controls

Portrait is playable rather than hidden behind a forced rotate overlay. The menu offers landscape/fullscreen or staying in portrait; the in-game SCREEN button requests fullscreen and landscape when browser APIs permit it. Unsupported or denied requests explain physical rotation and device rotation lock. Fullscreen exit unlocks orientation; the installed-app manifest allows either orientation.

The touch HUD has reachable 44px-or-larger controls, separate move/look areas, gun switching and melee. Layouts account for safe-area insets, and turning the phone clears held touch input while preserving the mission and normalized camera pitch. Phone comms live inside the mission panel; redundant keyboard/controller hints are omitted and the portrait weapon is smaller. Transient messages use elapsed UI time rather than slow simulation frames.

Menus now allow native touch scrolling and browser zoom; gameplay gesture regions still prevent unwanted scrolling. Vehicle boarding responds on pointer press rather than delayed click so moving thumbs cannot hide the button before action. The boarding area is 1.6 world units from the oriented body (was 1.2), with existing wall/cover/height restrictions retained. A nearby destroyed vehicle shows a disabled explanation rather than silently disappearing from interaction UI. Portrait and landscape touch entry/exit are checked separately; E and controller actions still use the same boarding logic.

QA uses Chrome device emulation at 390×844 and 844×390 to check actual touch targets, weapon switching, gameplay continuity and rotation during held fire. Fullscreen/lock success and denial are also covered by unit tests. This does not establish performance, browser API availability or comfort on a physical iPhone/Android device; those still need device testing. Browser limitations follow the [Screen Orientation API documentation](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).

External music needs approved, rights-cleared files or streams. No external radio endpoint, downloader or paid generation has been added. Live stations also need browser-compatible stream/CORS behavior, failure and offline handling, bandwidth budgeting and a decision about how they interrupt combat cues. Do not assume a public stream authorizes redistribution inside a game.

### Vehicle radio and Abuja street grounding

Every intact taxi, yellow keke and Capital City bus can be boarded during any active mission phase. Boarding explicitly wakes the browser audio context and restarts the original synthesized radio clock; the radio panel becomes labelled Vehicle Radio. Saved station, mute and volume preferences are respected, including Off. Muted sound and zero radio volume are shown instead of claiming playback. The on-foot score and station controls remain available. New players default to Capital Pulse. Destroyed wrecks cannot be boarded; repair is not implemented.

The bus has a separate 3D model and compatibility sprite, with shared immutable body bounds for interaction, driving collision and gunfire. Road surfaces and markings use two instanced draws rebuilt only on layout changes. Green district and bus-stop signs, a rounded granite-inspired skyline and different district ground treatments improve orientation without obstructing driving corridors. The districts are fictional: road placement, bus livery and landmark sizes are not accurate geographical reconstructions. Planning references are the [FCDA](https://fcda.gov.ng/) and [FCTA City Gate overview](https://www.fcta.gov.ng/ova_por/abuja-city-gate/).

Automated checks cover every fleet vehicle boarding/exiting, bus entry during extraction, and an actual nonzero Web Audio radio signal in the bus and keke, including recovery from a suspended context. Browser QA is functional emulation, not a physical-device audibility study or hardware FPS benchmark.
