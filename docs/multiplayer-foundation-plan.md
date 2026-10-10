# Multiplayer foundation: phased plan and implementation status

The campaign remains single-player. A separate local private free-for-all prototype is now implemented and connected to the local Node server: see `private-multiplayer-prototype.md` for the verified path and limitations. Accounts/online counts/shared campaign boards alone are not multiplayer. No match server has been deployed to the cloud; work stays on the development branch and the current budget is $0. The following architecture still describes the larger target, not a claim that every component below is complete.

## First playable slice

The user selected private free-for-all rooms: 2–8 players, kills and respawns. Start on the same local network. Use the three existing Abuja-inspired arenas, a bounded match timer/kill limit, a kill feed, deaths, safe respawn and an end-of-match board. This room size is a design target to test, not a capacity claim. Retain the single-player campaign and its account-bound save format separately.

Suggested subsequent sets: team deathmatch, uplink capture/hold, then objective-based team rounds. Rotate arenas between rounds, not independently for each player: everyone in a match must share the same arena, collision version, objectives and clocks. Respawning selects another valid spawn within that shared arena. Objective missions need PvP-specific rules rather than treating campaign AI phases as multiplayer modes.

## Trust boundary and runtime

- Extract shared movement/collision, weapons and damage rules from the browser simulation. The browser remains the renderer and input adapter. The authoritative match process owns positions, ammo, fire cadence, damage, kills, pickups, match outcomes and respawns.
- Send sequenced, bounded input commands over a WebSocket—not client claims of hits, scores or new positions. Authenticate against the actual account/session service; the existing pilot sessions cannot be assumed to be Firebase Auth tokens. Reject arbitrary account IDs and room/admin privileges supplied by clients.
- Begin with a fixed 20 Hz server simulation and 10–20 Hz snapshots, then measure. Predict the local player's movement, reconcile with acknowledged inputs, and interpolate remote players. Maintain a bounded server history for hit validation; limit rewind and never allow client timestamps to grant unlimited lag compensation.
- Each match has one owner process. Limit rooms, players, message sizes/rates, input backlog and outbound queues. Reject or disconnect abusive/slow clients rather than accumulate unbounded work. Route reconnections to the owner, reserve identity briefly, and stop dead rooms. Expiring joins/reconnects must not duplicate players or scoring.
- Respawn after a short visible countdown. Server checks walls, vehicles, occupancy and nearby enemy sight; brief protection ends on shooting. Death stops input/fire immediately. Player-owned vehicles and shared destructible glass require explicit server ownership and replication before enabling them in PvP; campaign vehicles remain untouched.
- Store profiles, lobby metadata and final verified results in Firebase/server storage, not every movement tick or bullet. Keep multiplayer results distinguishable from current client-reported single-player boards; persist results idempotently after server confirmation.

Firestore does not provide native presence; Firebase documents using Realtime Database presence and an optional Firestore bridge. This is not a substitute for the match simulation: [Firebase presence documentation](https://firebase.google.com/docs/firestore/solutions/presence).

A later hosted WebSocket runtime needs room routing, reconnect and cost planning. Cloud Run supports WebSockets, but request timeouts still apply and affinity is best effort; simply deploying several independent room instances will not synchronize them: [Cloud Run WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets). No hosting choice, paid resource, billing activation or 100,000-user guarantee is made here. A laptop LAN prototype is local-only and unavailable when its host sleeps or shuts down.

## Implementation order and gates

1. Improve and measure the existing 3D client; repeat on the testers' physical devices. Establish render, simulation and networking budgets.
2. Extract deterministic shared rules with tests; keep the campaign adapter working.
3. Implement a local authoritative room service after dependency/runtime approval. Verify join/leave, identity binding, bounds, full rooms and disconnect cleanup.
4. Connect two real browsers. Verify each sees the other's movement, server-confirmed damage, one kill per death and valid respawn. Add prediction/interpolation and network indicators.
5. Test loss, latency/jitter, reconnect, duplicate/stale inputs, speed/fire-rate cheating, slow receivers, match rotation and idempotent results. Test 8-player synthetic rooms locally; do not infer production capacity from them.
6. Add team/objective sets and shared vehicles/destruction only after their server rules are tested. Approve staging hosting costs before exposing internet rooms. Load-test and observe before increasing room count or making scale claims.

No multiplayer button should claim that public matches work until this complete path is real and verified.
