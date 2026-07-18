# Neon Breach — Local Test Plan

Use this plan to prove the game before sharing a build. Everything runs on a laptop; no cloud D1 required.

## 0. Prerequisites

```bash
cd ~/neon-breach
npm install
```

Optional for headless QA:

- Chrome headless shell under `~/.cache/puppeteer/chrome-headless-shell/`  
  (if missing, `npm run qa` exits 0 with `SKIP`)

---

## 1. Automated suite (must be green)

### 1.1 Unit + static tests

```bash
npm test
```

**Expect:** all tests pass (currently 35+).

Covers:

- Map seal / spawns / stair zones  
- Operations (5 stages, extract last)  
- Stage types including **destroy**  
- Boss abilities on HVT phases  
- Perk ladder  
- Campaign score validation  
- Path safety for static server  

### 1.2 Headless gameplay smoke

```bash
npm run qa
```

**Expect:** `PASS` lines for menu boot, deploy, enemies, stage advance, jet, 3D renderer.

If `SKIP: chrome-headless-shell not found`, install puppeteer chrome shell or run manual sections only.

### 1.3 Production build smoke

```bash
npm run build
npm start
# open http://127.0.0.1:4173
```

**Expect:** game loads from `dist/`, Three.js from `/vendor/`, no console red errors on boot.

Dev (source) server:

```bash
npm run dev
# http://127.0.0.1:4173  (public/ + node_modules three)
```

### 1.4 Health endpoint

```bash
curl -s http://127.0.0.1:4173/health
# {"status":"ok","game":"NEON BREACH"}
```

Local campaign/leaderboard APIs intentionally return `available: false`.

---

## 2. Manual play matrix (core loop)

Use **Recruit** for first pass, **Operative** for second.

| # | Scenario | Steps | Pass criteria |
|---|---|---|---|
| M1 | Boot & menu | Open game, open arsenal, pick difficulty, day/night | No errors; UI responds |
| M2 | First Strike full | Deploy op 1, complete all 5 phases | Tutorial comms fire; extract wins |
| M3 | Destroy stage | Iron Harvest → Vault Keys | 3 relays damageable by fire; phase advances when all dead |
| M4 | Boss shockwave | First Strike HVT Voss | Phase II/III announce; knockback if close |
| M5 | Boss cloak | Night Raptor HVT | Damage reduced while cloaked; message shown |
| M6 | Boss slam | Iron Harvest Warden-6 | Slam pulse + screen shake |
| M7 | Vehicle extract | Any op extract | Enter interceptor, boost, beacon win |
| M8 | Finisher | Melee weak enemy | Slow-mo, +175, optional heal if perk unlocked |
| M9 | Night stealth | Night + walk without shooting | Enemies slower to lock; gunfire spikes alert |
| M10 | Pause / resume | Pause mid-run, resume | Progress retained locally |
| M11 | Failure | Die on purpose | Fail modal; can return to title |
| M12 | Low quality | `?quality=low` | Playable; reduced effects |
| M13 | Compat | `?renderer=compat` | Canvas fallback path works |
| M14 | Touch (if mobile) | Coarse pointer | Virtual stick + fire/ADS/jet |
| M15 | Gamepad | DualSense if available | Move/look/fire/reload/vehicle/finisher |

---

## 3. QA bridge checks (browser console)

Start with query flag:

```text
http://127.0.0.1:4173/?qa
```

Deploy a run, then in DevTools:

```js
// Snapshot
window.__NEON_QA__.snapshot()

// God mode + skip waits
window.__NEON_QA__.setInvulnerable(true)
window.__NEON_QA__.skipWait()

// Jump stages
window.__NEON_QA__.completePhase()  // x4 to extraction

// Destroy relays (Iron Harvest stage)
window.__NEON_QA__.setOperation(2)  // menu only
// after deploy on destroy stage:
window.__NEON_QA__.damageNearestRelay(90)

// Boss phase ability
window.__NEON_QA__.setMissionStage(3) // HVT on many ops
window.__NEON_QA__.triggerBossPhase()
window.__NEON_QA__.snapshot().commanderAbility

// Physics
window.__NEON_QA__.teleport(11.5, 18.5)
window.__NEON_QA__.setFlight(true)
```

**Pass:** no thrown errors; snapshot fields `destroyLive`, `commanderAbility`, `tutorialStep` update as expected.

---

## 4. Regression checklist after each phase

- [ ] `npm test` green  
- [ ] `npm run qa` green or SKIP documented  
- [ ] First Strike Recruit clear  
- [ ] Iron Harvest destroy stage clear  
- [ ] Each boss ability fires once per threshold  
- [ ] Extract still requires vehicle + beacon  
- [ ] Career perks still render in arsenal UI  
- [ ] No new console errors on boot  

---

## 5. Suggested daily command block

```bash
cd ~/neon-breach
npm test && npm run qa && npm run build
npm run dev
```

Then run **M2 + M3 + M4** from the manual matrix (~15 minutes).

---

## 6. Known local limitations

| Feature | Local behavior |
|---|---|
| Cloud campaign save | Falls back to `localStorage` |
| Leaderboard | `available: false` JSON stub |
| Free Grok / external tools | N/A |

Do not treat local leaderboard emptiness as a product bug.

---

## 7. Sign-off

| Role | Date | Notes |
|---|---|---|
| Dev | | `npm test` ___  manual M1–M10 ___ |
| Playtest friend | | fun? stuck points? |
| Ship | | build # / commit |

When Phase 1–6 of `docs/ten-out-of-ten-plan.md` are complete **and** this checklist is fully green, Neon Breach is ready to call **10/10 for its scope** (premium browser campaign FPS, not AAA console).
