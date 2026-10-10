# Player conceptual model

The interface applies Don Norman's Design of Everyday Things principles to the player's existing FPS knowledge. The goal is learned, low-effort interaction, not a claim that subconscious behavior has been measured.

## Familiar journey

Main menu → Play → Campaign missions → Mission briefing → Start mission → follow objectives → extract → results. Continue campaign resumes saved progress; Progress shows career history and unlocks. Leaderboard is competitive ranking, not campaign progress. Invite friends shares access to the game/group board, not a finished score.

Preserve WASD movement, mouse look, left-click/R2 shooting, right-click/L2 aiming, R/Square reload, Space/Cross jet jump and Esc/Options pause. Preserve the existing Shift shooting shortcut and Q sprint mapping, but explicitly explain that Shift fires rather than sprints. This is an exception to common FPS habits, not a standard mapping. No controls are remapped in this release.

## Predictable scope and feedback

- A callsign is a public display name, not an authenticated account.
- A party code selects a group leaderboard; it does not start multiplayer or transfer saves.
- A campaign transfer code grants access to progress and must remain private.
- Results first save on the device. Publishing and leaderboard submission are separate operations with separate feedback. Only a successful public-result write changes the action to Share public result.
- Failed publishing preserves local results and exposes score-text sharing and scoreboard downloads. Device ranks never masquerade as public ranks.
- Empty filtered boards explain how to change filters rather than promising a top rank. Online counts describe browser profiles, not verified humans.
- Pause retains Resume/Main menu and hides result-only actions. Recovery should never require restarting a mission just because a community service is unavailable.

These changes improve signifiers, action-to-outcome mappings, visible feedback and recovery without adding work to the render loop. Neon styling and tactical mission names remain; navigation and service states use plain language.

## Verification and unresolved usability questions

Automated browser QA checks navigation labels, code scope, the Shift exception, leaderboard filters, public results, PNG downloads and genuine 3D gameplay separately from compatibility rendering. This checks behavior, not human comprehension.

Before claiming intuitive play, test with new and experienced FPS players and a DualSense user. Without coaching, ask them to start a mission, describe its objective, move/aim/fire/reload/pause, locate their progress, invite a friend and share a result. Ask them to predict what each code shares before using it. Repeat publishing while offline and ask where the score exists and whether its rank is public. Record first-action errors, completion time, accidental Shift fire, recovery and explanation accuracy. Revise confusing steps based on observed behavior; do not invent participant findings.

Future world/story work should keep a persistent current objective, recognizable objective markers and contextual interaction prompts, with progressive disclosure of unfamiliar enemy/mechanic rules. Larger geometry and enemy budgets still require separate hardware-backed performance validation.
