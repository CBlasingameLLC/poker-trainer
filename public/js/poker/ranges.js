// ==========================================
// ranges.js — preflop starting-hand ranges (SINGLE SOURCE OF TRUTH).
//
// The poker analog of the blackjack app's `strategy-data.js`: one data module
// that BOTH grades the preflop drill AND renders the reference range grids, so
// the chart the user studies can never disagree with the answer key they're
// graded against (the exact lesson the blackjack file headers document after
// their hand-authored charts drifted from the grader).
//
// Model: Raise-First-In (RFI). "You're first to enter the pot from <position>
// — raise or fold?" — the single highest-value concept for a beginner (the #1
// leak is playing too many hands from the wrong seat). Every hand is either in
// the position's opening range ('raise') or not ('fold').
//
// Ranges are stored as compact poker range strings (e.g. "22+, ATs+, KQo") and
// expanded by `expandRange` into the canonical 169 hand classes. Three
// difficulty tiers per position widen the range (beginner = tight & easy to
// remember; advanced = a wider, more modern open). Because grid + grader both
// call `getAction`, they always match.
//
// NOTE: these are simplified *teaching* ranges (roughly 9-max 100bb cash),
// not solver output — deliberately memorable over maximally exploitative.
//
// DOM-free + module.exports for the Node verification harness.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    // Ascending rank chars; 'T' = ten (matches cards.js RANKS and range strings).
    const R = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    // Descending, for grid rows/cols (A in the top-left corner, standard layout).
    const R_DESC = R.slice().reverse();
    const idx = ch => R.indexOf(ch);

    const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB'];
    const POSITION_LABELS = {
        UTG: 'Under the Gun', MP: 'Middle Position', CO: 'Cutoff',
        BTN: 'Button', SB: 'Small Blind'
    };
    const TIERS = ['beginner', 'intermediate', 'advanced'];

    // Raw range strings: [position][tier].
    const RANGE_STRINGS = {
        UTG: {
            beginner:     '99+, AJs+, KQs, AKo',
            intermediate: '77+, ATs+, KTs+, QTs+, JTs, T9s, AJo+, KQo',
            advanced:     '55+, A9s+, KTs+, QTs+, J9s+, T9s, 98s, ATo+, KJo+, QJo'
        },
        MP: {
            beginner:     '88+, ATs+, KJs+, QJs, AJo+, KQo',
            intermediate: '66+, A9s+, KTs+, QTs+, JTs, T9s, 98s, ATo+, KJo+, QJo',
            advanced:     '44+, A7s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, A9o+, KTo+, QTo+, JTo'
        },
        CO: {
            beginner:     '66+, A9s+, KTs+, QTs+, JTs, T9s, AJo+, KQo',
            intermediate: '44+, A5s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, A9o+, KTo+, QTo+, JTo',
            advanced:     '33+, A2s+, K8s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, K9o+, Q9o+, JTo, T9o'
        },
        BTN: {
            beginner:     '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, ATo+, KJo+, QJo',
            intermediate: '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, A7o+, K9o+, Q9o+, J9o+, T9o',
            advanced:     '22+, A2s+, K5s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o'
        },
        SB: {
            beginner:     '44+, A8s+, KTs+, QTs+, JTs, AJo+, KQo',
            intermediate: '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, A8o+, KTo+, QTo+, JTo',
            advanced:     '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A5o+, K9o+, Q9o+, J9o+, T9o'
        }
    };

    // --- Range string expansion ---------------------------------------------

    // Expand a single token ("22+", "ATs+", "KQo", "T9s") into hand classes.
    function expandToken(tok) {
        tok = tok.trim();
        if (!tok) return [];
        const plus = tok.endsWith('+');
        if (plus) tok = tok.slice(0, -1);
        const out = [];

        // Pair, e.g. "77" or "22+".
        if (tok.length === 2 && tok[0] === tok[1]) {
            const start = idx(tok[0]);
            const end = plus ? 12 : start;
            for (let i = start; i <= end; i++) out.push(R[i] + R[i]);
            return out;
        }

        // Suited/offsuit, e.g. "ATs", "KQo", "A2s+".
        const hi = tok[0], lo = tok[1], suf = tok[2]; // suf = 's' | 'o'
        if (plus) {
            for (let i = idx(lo); i < idx(hi); i++) out.push(hi + R[i] + suf);
        } else {
            out.push(hi + lo + suf);
        }
        return out;
    }

    function expandRange(str) {
        const set = new Set();
        str.split(',').forEach(tok => {
            expandToken(tok).forEach(c => set.add(c));
        });
        return set;
    }

    // Precompute every position/tier into a Set for O(1) lookups.
    const RANGES = {};
    POSITIONS.forEach(pos => {
        RANGES[pos] = {};
        TIERS.forEach(tier => {
            RANGES[pos][tier] = expandRange(RANGE_STRINGS[pos][tier]);
        });
    });

    // --- Public API ----------------------------------------------------------

    // Canonical class string for two hole cards: "AA", "AKs", "AKo".
    function handClass(a, b) {
        if (a.rankVal === b.rankVal) return a.rank + a.rank;
        const hi = a.rankVal > b.rankVal ? a : b;
        const lo = a.rankVal > b.rankVal ? b : a;
        return hi.rank + lo.rank + (a.suit === b.suit ? 's' : 'o');
    }

    // The graded answer: 'raise' or 'fold' for an RFI spot.
    function getActionForClass(cls, position, tier) {
        const set = (RANGES[position] && RANGES[position][tier]) || null;
        if (!set) return 'fold';
        return set.has(cls) ? 'raise' : 'fold';
    }

    function getAction(holeCards, position, tier) {
        return getActionForClass(handClass(holeCards[0], holeCards[1]), position, tier);
    }

    // Grid class for a cell at (rowRank, colRank) using the standard layout:
    // upper-right triangle = suited, lower-left = offsuit, diagonal = pairs.
    function gridClass(rowRank, colRank) {
        if (rowRank === colRank) return rowRank + colRank;
        const rowI = R_DESC.indexOf(rowRank); // 0 = A ... 12 = 2
        const colI = R_DESC.indexOf(colRank);
        // Higher rank is the smaller descending index.
        const hi = rowI < colI ? rowRank : colRank;
        const lo = rowI < colI ? colRank : rowRank;
        const suited = colI > rowI; // upper-right of the diagonal
        return hi + lo + (suited ? 's' : 'o');
    }

    const Ranges = {
        POSITIONS,
        POSITION_LABELS,
        TIERS,
        R_DESC,
        RANGE_STRINGS,
        expandRange,
        handClass,
        getAction,
        getActionForClass,
        gridClass
    };

    PK.Ranges = Ranges;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Ranges;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
