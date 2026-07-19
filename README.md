# Poker Trainer

A free, gamified **Texas Hold'em (No-Limit)** trainer PWA — a companion to the
Blackjack Pro trainer, sharing its "Modern Noir" look and its statistics engine.
Learn poker through **targeted practice** and **personal statistics**, entirely
on-device (no account, no server).

## What it does

Three drills, each with **Beginner / Intermediate / Advanced** difficulty plus an
adaptive weak-spot mode:

- **Hand Rankings** — a full showdown is dealt (community + two hands); pick the
  winner. Learn the pecking order and how boards play out.
- **Preflop Ranges** — raise-first-in decisions from every seat (UTG → SB). The
  #1 beginner leak: which hands to open from which position.
- **Pot Odds** — is the call profitable? Compare the price of a call to your
  equity from outs (rule of 2 & 4).
- **Postflop Decisions** — real flop/turn spots: classify your hand (monster,
  strong, strong draw, marginal, weak draw, air) and bet, check, raise, call,
  or fold. Advanced tier mixes in turn boards and marginal hands.
- **Targeted Practice** — re-drills the exact spots you miss most, weighted by
  how often you miss them. Unlocks once you've logged a mistake.

**Stats** track lifetime accuracy, per-drill accuracy, an accuracy trend, your
weak spots, and a recent-miss log. **Charts** render cheat sheets (hand
rankings, per-position range grids, pot-odds tables) from the *same* data that
grades the drills, so the reference can never disagree with the answer key.

## Tech

Zero-framework vanilla JS: ordered `<script defer>` IIFE modules on a single
`window.PK` namespace. Vite only produces a static `dist/` for Capacitor. Plain
hand-written CSS with a shared token set, self-hosted variable fonts, a
schema-versioned `localStorage` wrapper, and a service worker for full offline
support. Wrappable in Capacitor (`com.juntopress.poker`).

```
public/js/poker/
  cards.js hand-eval.js ranges.js odds.js postflop.js   # pure, DOM-free logic
  scenarios.js drill-manager.js             # fabricate + grade + record
  render.js reference-render.js stats-render.js
  ui-bindings.js hub.js boot.js audio.js
  persistence.js                            # PK.Storage (junto_poker_ keys)
```

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm run verify         # Node harness: hand-eval + ranges correctness
npm run build          # -> dist/
npm run build:cap      # build + npx cap sync
node scripts/make-icons.mjs   # regenerate PWA icons
```

The DOM-free logic modules are verified by `scripts/verify-*.js`, which `require`
the real production files (category ordering, best-5-of-7, wheel straights,
kickers; 169-cell grid completeness, tier monotonicity, spot-check actions).

> The preflop ranges are simplified **teaching** ranges (≈9-max 100bb cash),
> chosen to be memorable over maximally exploitative.
