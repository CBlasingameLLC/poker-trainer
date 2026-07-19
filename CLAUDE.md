# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server on :5173 (add -- --host for LAN/containers)
npm run verify         # All Node correctness harnesses (hand-eval, ranges, postflop)
node scripts/verify-hand-eval.js   # Run a single harness (each exits non-zero on failure)
npm run build          # Static build -> dist/ (what Vercel and Capacitor consume)
npm run preview        # Serve the production build
npm run build:cap      # Build + npx cap sync (ios/ and android/ are generated, git-ignored)
node scripts/make-icons.mjs        # Regenerate PWA icons via headless Chromium
```

There is no test runner, linter, or formatter. Correctness lives in `scripts/verify-*.js`,
which `require()` the real production modules — never a copy. When you change game logic,
extend the matching harness (or add a new one and chain it into the `verify` script).

Deployment: Vercel auto-deploys `main` (auto-detected Vite, output `dist/`). No vercel.json
is needed — single page, no client-side routes.

## Architecture

Zero-framework vanilla JS PWA, deliberately unbundled: Vite only copies `public/` into
`dist/`. All app code is ordered `<script defer>` IIFE modules in `index.html`, each
attaching to the shared `window.PK` namespace. **Load order in index.html is a dependency
graph** — logic modules first (cards → hand-eval → ranges → odds → postflop → persistence →
scenarios → drill-manager), presentation after, `boot.js` last.

This app is a companion to `CBlasingameLLC/blackjack-app` (namespace `BJ`) and deliberately
mirrors its patterns and its "Modern Noir" CSS token set. Keep the two visually consistent.

### Rules that span multiple files

- **Dual-export DOM-free core.** `cards.js`, `hand-eval.js`, `ranges.js`, `odds.js`,
  `postflop.js`, `persistence.js`, `scenarios.js` never touch `document` and also
  `module.exports` themselves so the Node harnesses execute production code. Keep new
  logic modules in this shape. (`package.json` has no `"type": "module"` for exactly this
  reason — the harnesses use `require()`.)

- **Single source of truth for answers.** `ranges.js` (preflop), `postflop.js` (postflop
  decision table), and `odds.js` both *grade the drills* (via `scenarios.js`) and *render
  the Charts tab* (via `reference-render.js`). Never hand-author chart content; always
  derive it from these modules so reference and grader cannot drift.

- **MVC via an appending event bus.** `drill-manager.js` owns all drill state and is the
  only stats write path (`_recordDecision`). It emits `scenario` / `graded` / `empty`
  events; `render.js` (view) and `ui-bindings.js` (controller) both subscribe —
  `subscribe()` appends, never replaces. `hub.js` owns tab navigation only, never game
  logic.

- **All persistence through `PK.Storage`** (`persistence.js`): `junto_poker_` key prefix,
  JSON + try/catch, ring-buffer caps (200), schema version with a `migrate()` ladder.
  Never touch `localStorage` directly. Shape changes require a new `SCHEMA_VERSION` and a
  ladder step.

- **Scenarios are plain JSON data** (no functions). A miss logs the whole scenario into
  the mistake log; Targeted Practice weighted-picks by `scenarioKey` frequency and replays
  the stored clone verbatim. `scenarioKey` granularity therefore defines the weak-spot
  buckets — choose keys that aggregate meaningfully (e.g. `postflop:<category>:<context>`).

- **Fabricate, don't just deal.** Random deals are dominated by uninteresting hands
  (~80% air postflop), so builders pick a target (category, marginal preflop band, pot-odds
  margin) first and re-deal until it hits. Difficulty tiers gate *which scenarios are
  served*, never the correctness rule. Ranges must stay tier-monotonic (wider tiers are
  supersets — enforced by `verify-ranges.js`).

- **Offline is a hard constraint.** No CDN, no runtime fetches, no chart libraries —
  fonts are self-hosted, icons are unicode/inline. Any added/renamed app file must be
  added to both `index.html` and the `APP_SHELL` list in `public/sw.js`, and **any change
  to shipped files needs a `CACHE_VERSION` bump in `sw.js`** or installed users keep the
  old version.

### Adding a new drill mode (touchpoint checklist)

`scenarios.js` (builder + `generate` dispatch) · `persistence.js` `MODES` ·
`stats-render.js` `MODE_LABELS` + `friendlyKey` · `ui-bindings.js` `MODE_TITLES` ·
`index.html` (tile + any new script tag) · `poker.css` (tile tint) · `sw.js` (precache +
version bump) · a `scripts/verify-*.js` harness chained into `npm run verify`.

### Content philosophy

Strategy content (ranges, postflop table) is simplified **teaching** material — memorable
over maximally exploitative (≈9-max 100bb cash assumptions). Keep explanations in that
register; this is a beginner trainer, not a solver.
