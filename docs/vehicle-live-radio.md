# Vehicle-only live radio and quieter interface

Radio means an actual broadcast stream, not the game's procedural music. The old synthesized station selector is removed from gameplay. Sound effects, command voices and menu music remain separate. On foot, radio is hidden, stopped and makes no stream requests. Vehicle entry attempts the selected approved HTTPS stream; exiting, pausing, returning to the menu or vehicle destruction pauses and detaches its media source. Streams are never cached by the service worker, proxied, downloaded for distribution or recorded. External playback necessarily contacts the station provider.

## Direct-stream discovery (2026-10-06)

Following the requested Danfo-style architecture, **Tune** in a vehicle queries Radio Browser for Nigerian stations, prioritizes Abuja/FCT metadata, and caches station metadata locally for 24 hours. It uses at most three HTTPS mirrors with ten-second deadlines. No directory requests run on the menu or on foot; discovery is explicitly player initiated. HTTPS MP3/AAC streams with broadcaster homepages are accepted; broken entries, HTTP, credentials, local network targets, duplicates and HLS are excluded. Directory data is community supplied, not proof of broadcaster authenticity or game-use permission.

The browser plays the selected broadcast directly, without a proxy, recording, downloading for distribution, ad removal, or synthesized replacement. A broadcaster website link accompanies the selected station. First-use discovery can consume the browser's gesture window: if autoplay is blocked, tap Play after stations load. Selection is remembered, and subsequent vehicle entry resumes the selected station. A valid metadata cache restores stations across refreshes without any menu network requests; after its 24-hour expiry, Tune refreshes it. Leaving while discovery is pending cannot start playback on foot.

Settings disclose that directory providers and broadcasters receive the player's IP when used. This implementation does not claim blanket music licenses or station endorsement. Before public/commercial launch, review selected broadcaster terms and establish a station-owner contact/removal process; no station has been contacted by this change. See [Danfo's published radio approach](https://danfo.horpey.dev/terms.html) and [Radio Browser API documentation](https://docs.radio-browser.info/). `LIVE_STATIONS` remains empty because the live list is discovered, not a bundled authorization claim. The old synthesized preferences are not silently migrated into live stations.

Playback has connecting, playing, buffering, blocked, unavailable, off and unconfigured states. Only a media `playing` event confirms playback. Browser autoplay rejection offers manual Play; failures offer manual retry, never automatic retry storms or a synthesized fallback. Connection and buffering have a bounded 12-second deadline. Station changing, master mute and radio volume are independent of game sound effects. Test HTTPS MP3/AAC support, mixed content, redirections, mobile gesture policies and bandwidth on physical devices before publishing an approved station. Native HLS support varies; no HLS library is installed.

## Permission research

- [SomaFM terms](https://somafm.com/contact/tos.html), reviewed 2026-10-06: explicitly reject new third-party app/game embedding, including noncommercial use. Do not integrate these streams.
- [Radio Browser](https://www.radio-browser.info/): directory metadata is public domain. That does not establish broadcast or music permission for a game.
- [Wazobia Abuja official player](https://www.wazobiafm.com/player/wazobia-fm-abuja/): relevant local candidate, but an official public player is not evidence of game integration permission. Obtain written station authorization covering game embedding, planned commercial use, permitted territories, branding, advertisements and any underlying music limitations. No station has been contacted by this implementation.
- [RadioKing FAQ](https://www.radioking.com/create-radio-faq): a hosted player can be integrated on a site, but hosting does not include music rights. An owned broadcast using expressly cleared tracks is another path, not permission to rebroadcast other stations.
- [Jamendo individual licenses](https://support-licensing.jamendo.com/individual-licenses): offers music licensing categories that include video games. This is a possible path for a station-style playlist of actual recorded songs after reviewing the applicable license and territories, not blanket permission to embed its separate In-Store radio service and not a live Abuja broadcast. No license is purchased and no tracks are downloaded.

## Interface model

Home prioritizes Play, with Leaderboard and a collapsed More group. Conditions and daily challenges are optional briefing details. Settings are grouped into Account, Audio, Sharing and saved progress, and Controls and graphics. Unavailable email verification forms are not exposed as usable controls. All established keyboard/controller paths remain.

Mobile gameplay prioritizes a single mission instruction, compact vitals/ammo and move/look/fire/reload/jump. MORE reveals weapon, aim, sprint, melee, aim-assist and screen controls; these are not removed from the game. Driving hides shooting controls, relabels jump as Boost and shows contextual vehicle exit and radio. Decorative branding, duplicated controller prompts, scoreboard, radar and narrative overlays are suppressed on mobile. These tradeoffs reduce visible clutter but are not evidence of zero cognitive load or proven usability; physical-device and player testing remain required.

Earlier entries in `gameplay-expansion.md` describe the superseded synthesized radio. This document is the current radio behavior.
