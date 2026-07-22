// ==========================================
// postflop.js — postflop hand classification + decision table
// (SINGLE SOURCE OF TRUTH, like ranges.js is for preflop).
//
// Teaching model: classify your hand on the flop/turn into one of six
// categories, then apply one memorable rule per category. Both the drill
// grader (scenarios.js) and the Charts cheat sheet (reference-render.js) read
// from CATEGORY_INFO, so the chart can never disagree with the answer key.
//
//   monster     two pair or better            -> bet / raise
//   strong      top pair (good kicker) / overpair -> bet / call
//   strongDraw  8+ outs (flush draw, OESD)    -> bet (semi-bluff) / call
//   marginal    middle-bottom pair, weak top pair, underpair -> check / call
//   weakDraw    gutshot or two overcards      -> check / fold
//   air         no pair, no draw              -> check / fold
//
// A marginal made hand that ALSO holds a strong draw upgrades to strongDraw
// (the semi-bluff rule). These are simplified teaching heuristics for
// heads-up, single-raised pots — memorable over maximally exploitative,
// same philosophy as the preflop ranges.
//
// DOM-free + module.exports for the Node verification harness.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var HandEval = PK.HandEval || (typeof require !== 'undefined' && require('./hand-eval.js'));

    // Category -> label, short name, action per context, and the why.
    // Contexts: 'checkedTo' (opponent checks; bet or check) and
    //           'facingBet' (opponent bets; raise, call, or fold).
    const CATEGORY_INFO = {
        monster: {
            label: 'Monster — two pair or better',
            short: 'Monster',
            checkedTo: 'bet',
            facingBet: 'raise',
            why: 'Big hands want a big pot. Bet when checked to, raise when bet into.'
        },
        strong: {
            label: 'Strong — top pair (good kicker) or overpair',
            short: 'Strong hand',
            checkedTo: 'bet',
            facingBet: 'call',
            why: 'Bet one pair for value, but just call raises — one pair rarely wants a huge pot.'
        },
        strongDraw: {
            label: 'Strong draw — 8+ outs (flush draw, open-ended)',
            short: 'Strong draw',
            checkedTo: 'bet',
            facingBet: 'call',
            why: 'Semi-bluff big draws: you win when they fold AND when you hit. Call bets — the equity is there.'
        },
        marginal: {
            label: 'Marginal — middle/bottom pair, weak top pair, underpair',
            short: 'Marginal hand',
            checkedTo: 'check',
            facingBet: 'call',
            why: 'Keep the pot small with medium-strength hands: check, and call a single bet as a bluff-catcher.'
        },
        weakDraw: {
            label: 'Weak draw — gutshot or two overcards',
            short: 'Weak draw',
            checkedTo: 'check',
            facingBet: 'fold',
            why: 'Too few outs to pay for. Take free cards when you can, fold to bets.'
        },
        air: {
            label: 'Air — no pair, no draw',
            short: 'Air',
            checkedTo: 'check',
            facingBet: 'fold',
            why: "No pair, no draw, no reason to put money in. Check and fold."
        }
    };
    const CATEGORIES = ['monster', 'strong', 'strongDraw', 'marginal', 'weakDraw', 'air'];
    const CONTEXTS = ['checkedTo', 'facingBet'];

    function getAction(category, context) {
        const info = CATEGORY_INFO[category];
        return info ? info[context] : 'check';
    }

    // --- Draw detection ------------------------------------------------------

    // Flush draw: exactly 4 of one suit among hole+board, at least one from
    // the hole (a board-only draw isn't *your* draw).
    function hasFlushDraw(hole, board) {
        const suits = {};
        hole.concat(board).forEach(c => { suits[c.suit] = (suits[c.suit] || 0) + 1; });
        return Object.keys(suits).some(s =>
            suits[s] === 4 && hole.some(h => h.suit === s));
    }

    // Straight draws: slide every 5-rank straight window over the combined
    // ranks; a window with exactly one rank missing is completable. Two or
    // more distinct completing ranks = open-ended/double-gutter (8 outs);
    // exactly one = gutshot (4 outs). At least one hole card must sit inside
    // a qualifying window. Returns 'oesd' | 'gutshot' | null.
    function straightDrawType(hole, board) {
        const all = hole.concat(board);
        const have = new Set(all.map(c => c.rankVal));
        const holeVals = new Set(hole.map(c => c.rankVal));
        const completing = new Set();
        // Window lows 1..10; rank 1 stands for the wheel ace.
        for (let low = 1; low <= 10; low++) {
            const window = [low, low + 1, low + 2, low + 3, low + 4]
                .map(v => (v === 1 ? 14 : v));
            const missing = window.filter(v => !have.has(v));
            if (missing.length !== 1) continue;
            if (!window.some(v => v !== missing[0] && holeVals.has(v))) continue;
            completing.add(missing[0]);
        }
        if (completing.size >= 2) return 'oesd';
        if (completing.size === 1) return 'gutshot';
        return null;
    }

    // --- Out counting (for the Count-the-Outs drill) ------------------------

    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const SUITS = ['s', 'h', 'd', 'c'];

    // Exact count of unseen cards that complete a STRAIGHT or FLUSH on the next
    // card — i.e. the outs to a straight/flush draw. Brute-forces the 52-card
    // deck minus what's visible, so combo draws (flush + straight = up to 15)
    // and overlaps are counted correctly without special-casing. Returns 0 if
    // the hand is already a straight or better (not a draw).
    function countDrawOuts(hole, board) {
        const known = hole.concat(board);
        const current = HandEval.evaluate(known);
        if (current.category >= 5) return 0;
        const seen = new Set(known.map(c => c.rank + c.suit));
        let outs = 0;
        for (let r = 0; r < RANKS.length; r++) {
            for (let s = 0; s < SUITS.length; s++) {
                const id = RANKS[r] + SUITS[s];
                if (seen.has(id)) continue;
                const card = {
                    rank: RANKS[r], suit: SUITS[s],
                    rankVal: r + 2,
                    color: (SUITS[s] === 'h' || SUITS[s] === 'd') ? 'red' : 'black'
                };
                const ev = HandEval.evaluate(known.concat([card]));
                if (ev.category >= 5) outs++;
            }
        }
        return outs;
    }

    // Human label + breakdown for the draw the player holds, for the Count-Outs
    // explanation. Pairs the detection helpers with the exact count.
    function describeDraw(hole, board) {
        const outs = countDrawOuts(hole, board);
        const flush = hasFlushDraw(hole, board);
        const straight = straightDrawType(hole, board);
        let label, why;
        if (flush && straight === 'oesd') {
            label = 'a flush draw plus an open-ended straight draw';
            why = 'the monster draw — 9 flush outs plus the straight outs that are a different suit';
        } else if (flush && straight === 'gutshot') {
            label = 'a flush draw plus a gutshot';
            why = '9 flush outs plus the gap-filling straight cards that are a different suit';
        } else if (flush) {
            label = 'a flush draw';
            why = '13 cards of your suit minus the 4 you can already see';
        } else if (straight === 'oesd') {
            label = 'an open-ended straight draw';
            why = 'either end completes it — 2 ranks x 4 suits';
        } else if (straight === 'gutshot') {
            label = 'a gutshot straight draw';
            why = 'one rank fills the gap — 1 rank x 4 suits';
        } else {
            label = 'no straight or flush draw';
            why = 'nothing to draw to';
        }
        return { outs, label, why };
    }

    // --- Classification ------------------------------------------------------

    // classify(hole, board) -> { category, made, draw }
    //   hole: 2 cards; board: 3 (flop) or 4 (turn) cards.
    //   made/draw are human labels for the explanation string.
    function classify(hole, board) {
        const ev = HandEval.evaluate(hole.concat(board));
        const boardVals = board.map(c => c.rankVal);
        const topBoard = Math.max.apply(null, boardVals);
        const pocketPair = hole[0].rankVal === hole[1].rankVal;
        const matches = hole.map(h => boardVals.filter(v => v === h.rankVal).length);

        // Made straight or better always uses a hole card (a 3-4 card board
        // can't complete a 5-card hand alone).
        if (ev.category >= 5) {
            return { category: 'monster', made: ev.name, draw: null };
        }

        // Trips / set — require hole participation (a board-dealt pair or
        // trips that ignores your hand doesn't make you a monster).
        if (ev.category === 4) {
            const set = pocketPair && matches[0] > 0;
            const trips = matches.some(m => m >= 2);
            if (set || trips) {
                return { category: 'monster', made: set ? 'a set' : 'trips', draw: null };
            }
        }

        // Two pair with both hole cards pairing distinct board ranks.
        if (ev.category >= 3 && !pocketPair &&
            matches[0] > 0 && matches[1] > 0 &&
            hole[0].rankVal !== hole[1].rankVal) {
            return { category: 'monster', made: 'two pair', draw: null };
        }

        // Pair-level made strength (computed from participation, not ev, so a
        // paired board can't inflate it).
        let madeTier = null;  // 'strong' | 'marginal' | null
        let madeLabel = null;
        if (pocketPair) {
            if (hole[0].rankVal > topBoard) {
                madeTier = 'strong'; madeLabel = 'an overpair';
            } else if (matches[0] === 0) {
                madeTier = 'marginal'; madeLabel = 'an underpair';
            }
        } else if (matches[0] > 0 || matches[1] > 0) {
            const pairedIdx = matches[0] > 0 ? 0 : 1;
            const kicker = hole[1 - pairedIdx];
            if (hole[pairedIdx].rankVal === topBoard) {
                if (kicker.rankVal >= 11) {
                    madeTier = 'strong'; madeLabel = 'top pair, good kicker';
                } else {
                    madeTier = 'marginal'; madeLabel = 'top pair, weak kicker';
                }
            } else {
                madeTier = 'marginal'; madeLabel = 'middle or bottom pair';
            }
        }

        if (madeTier === 'strong') {
            return { category: 'strong', made: madeLabel, draw: null };
        }

        // Draws (also the semi-bluff upgrade for marginal made hands).
        const flushDraw = hasFlushDraw(hole, board);
        const straightDraw = straightDrawType(hole, board);
        if (flushDraw || straightDraw === 'oesd') {
            const drawLabel = flushDraw
                ? (straightDraw ? 'a flush draw plus a straight draw' : 'a flush draw')
                : 'an open-ended straight draw';
            return { category: 'strongDraw', made: madeLabel, draw: drawLabel };
        }

        if (madeTier === 'marginal') {
            return { category: 'marginal', made: madeLabel, draw: null };
        }

        if (straightDraw === 'gutshot') {
            return { category: 'weakDraw', made: null, draw: 'a gutshot straight draw' };
        }
        const overcards = hole[0].rankVal > topBoard && hole[1].rankVal > topBoard;
        if (overcards) {
            return { category: 'weakDraw', made: null, draw: 'two overcards' };
        }

        return { category: 'air', made: null, draw: null };
    }

    const Postflop = {
        CATEGORIES,
        CONTEXTS,
        CATEGORY_INFO,
        getAction,
        classify,
        hasFlushDraw,
        straightDrawType,
        countDrawOuts,
        describeDraw
    };

    PK.Postflop = Postflop;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Postflop;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
