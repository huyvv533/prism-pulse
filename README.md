# ⚡ Prism Pulse — Daily Optical Logic & Laser Fusion Game for Reddit

**Prism Pulse** (`prism-pulse-daily`) is a bite-sized daily optical logic puzzle built natively on **Reddit’s Developer Platform (`Devvit Web`)** for **Reddit’s Game of the Day Hackathon 2026**.

- **Live Playable Demo Post on Reddit (`r/PrismPulseGame`):** https://www.reddit.com/r/PrismPulseGame/comments/1y72mjf/prism_pulse_331_20261127_can_you_hit_par_8/
- **Reddit Developer App Listing:** https://developers.reddit.com/apps/prism-pulse-daily
- **Public Source Repository:** https://github.com/huyvv533/prism-pulse

Every UTC day (`YYYY-MM-DD`), every Redditor around the world receives the exact same **5×5 optical circuit**—complete with an exhaustively verified **global minimum move count (`Par`)**—and competes for the daily subreddit leaderboard, consecutive daily streaks, and spoiler-free Emoji Grid bragging rights in the comment thread.

---

## 🎮 How to Play

1. **Launch From the Feed:** Tap **`Play Daily #N →`** directly inside the inline Reddit post card (`splash.html`) to expand the interactive 5×5 optical board (`game.html`).
2. **Inspect the Emitters & Target Beacons:**
   - Glowing perimeter **Laser Emitters** (`↓`, `↑`, `→`, `←`) fire beams of **🔵 Azure** or **🟡 Solar** light into the grid.
   - Fixed **Target Beacons** on the board require a specific light signature to ignite:
     - **🔵 `AZR` Beacon:** Satisfied by pure **Azure** light (`🔵` only).
     - **🟡 `SLR` Beacon:** Satisfied by pure **Solar** light (`🟡` only).
     - **🟢 `🔵+🟡` Emerald Fusion Beacon:** Satisfied only when **both** an **Azure** beam and a **Solar** beam intersect through that same beacon!
3. **Tap Optical Tiles to Rotate (`1 Tap = 1 Move`):**
   - **Silver Mirror (`/` ↔ `\`):** Reflects any incoming laser beam by `90°`.
   - **Chromatic Prism (`⇄`):** Reflects any incoming laser beam by `90°` **and flips its color** between **🔵 Azure** and **🟡 Solar**.
   - **Purple T-Splitter (`┬`, `┤`, `┴`, `├`):** Light entering any of its **3 open purple channels** splits out the other 2 open channels; its flat dark back-stop bar blocks light.
   - **Obsidian Blocker:** Fixed opaque crystal that absorbs beams—route your lasers around it!
4. **Hit Optimal `Par` & Share to Reddit Comments:**
   - **⭐⭐⭐ Prism Grandmaster:** Ignite all beacons within **`Par` moves** with **no Hints**.
   - **⭐⭐ Optical Architect:** Solve within `Par + 3` moves (or within `Par` using `💡 Align 1 Tile`).
   - **⭐ Beam Explorer:** Solve in `> Par + 3` moves (tap **`↺ Reset Board`** anytime to optimize your score!).
   - Once solved, click **`💬 Share Grid to Comments`** to post a **spoiler-free 5×5 Emoji Beam Card** straight into the Reddit post’s comment thread (without revealing mirror angles!).
5. **7-Day Playable Archive:** Open **`🏆 Ranks`** in the top bar to view the live Top 10 Daily Leaderboard, check your career streak, or play any of the previous 6 daily editions!

---

## 🏗️ Technical Architecture (`Devvit Web`)

- **Inline Feed Card (`src/client/splash.tsx`):** Lightweight React 19 + Tailwind CSS 4 splash view displaying today’s edition number, `Par` target, live community solve count, current `#1` leader, and personal solve badge right inside the Reddit feed.
- **Interactive Optical Engine (`src/shared/puzzle.ts`):**
  - Deterministic `Mulberry32` seeded puzzle synthesizer keyed by UTC date (`YYYY-MM-DD`).
  - Cycle-safe real-time 2D raytracer (`tracePuzzle`) supporting reflections, 2-way splits, chromatic `🔵↔🟡` shifts, and `🔵+🟡=🟢` optical fusion.
  - Exhaustive state-space solver (`findGlobalOptimalSolution`) proving 100% solvability and computing the exact mathematically minimal `Par` moves in `<1.5 ms` per board.
- **Anti-Cheat Hono Server & Redis Persistence (`src/server/routes/api.ts`):**
  - Re-simulates submitted `orientations` on the server via `tracePuzzle` before awarding points or recording leaderboard ranks.
  - Stores daily sorted-set leaderboards (`prism:lb:<YYYY-MM-DD>`), persistent player streaks (`prism:user:<username>:stats`), and idempotent 1-click comment shares (`reddit.submitComment`) in **Devvit Redis**.
- **Zero-Asset Procedural Web Audio (`src/client/sound.ts`):** Synthesizes crisp pentatonic triangle/sine chimes on rotation, beacon lock, and puzzle victory using native Web Audio oscillators (with instant `🔊/🔇` mute toggle).

---

## 🧪 Local Verification & Deployment Commands

```bash
# Run TDD unit test suite (60-day puzzle solvability + loop safety + streak math)
npm run test:unit

# Type-check client, server, and shared TypeScript bundles
npm run test:types

# Run ESLint across client, server, and shared code
npm run lint

# Build production client (dist/client) and server (dist/server/index.cjs) bundles
npm run build

# Authenticate & upload to Reddit Developer Platform
npx devvit login
npx devvit upload
```
