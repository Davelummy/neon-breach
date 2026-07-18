# Deploy NEON BREACH on Netlify

Share one public link. Family and friends play from anywhere — scores hit the same **world party board**.

## Option A — Dashboard (easiest)

1. Push this project to **GitHub** (if it isn’t already).
2. Go to [https://app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**.
3. Pick the repo.
4. Build settings (auto-filled from `netlify.toml`):
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
   - **Functions directory:** `netlify/functions`
5. Click **Deploy site**.
6. When it’s live, copy the URL (e.g. `https://neon-breach-xxxx.netlify.app`).
7. **Text that link to family.**

That’s it. No database to create — the leaderboard uses **Netlify Blobs**.

### Optional: custom domain

Site settings → **Domain management** → add `breach.yourfamily.com` (or similar).

---

## Option B — CLI

```bash
cd ~/neon-breach
npm install
npm run build

# first time only
npx netlify-cli login
npx netlify-cli init   # link or create a site

# ship
npm run netlify:deploy
# or:
npx netlify-cli deploy --prod
```

---

## What friends do

1. Open your Netlify link on phone or laptop.
2. **Click to start** (unlocks sound).
3. Set a **callsign** on the welcome screen.
4. Play on **Family** or **Recruit** if new.
5. Finish a run → score posts to **Ranks** (world board).

Everyone with the link shares the **same** leaderboard.

---

## What works on Netlify

| Feature | Status |
|--------|--------|
| Full 3D game | ✅ |
| Party / world leaderboard | ✅ Netlify Blobs |
| Callsign + share score | ✅ |
| Campaign cloud save | Local device only (fine for family) |
| DualSense / keyboard / touch | ✅ |

---

## After you change the game

```bash
npm run netlify:deploy
```

Or push to GitHub if continuous deploy is enabled — Netlify rebuilds automatically.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Old version after deploy | Hard refresh **Cmd+Shift+R** (service worker cache) |
| Ranks empty | Play a run; check Functions logs in Netlify |
| Blank page | Confirm publish dir is `dist` and build succeeded |
| 404 on `/api/leaderboard` | Confirm `netlify/functions` is deployed and redirects in `netlify.toml` |

---

## Local vs Netlify

| | Local `npm run dev` | Netlify |
|--|---------------------|---------|
| Who can play | Same Wi‑Fi (LAN URL) | Anyone with the link |
| Leaderboard | `.data/leaderboard.json` | Netlify Blobs (world) |

For a weekend party at home, LAN is fine. For **send a link to anyone**, use Netlify.
