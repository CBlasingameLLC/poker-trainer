// ==========================================
// hand-eval.js — 5-to-7 card Texas Hold'em hand evaluator.
//
// The poker analog of the blackjack app's `hand.js`: a small, pure, DOM-free
// module that scores a poker hand into a *comparable* value so drills can ask
// "which hand wins?" and grade the answer. Best-5-of-7 is found by scoring all
// C(7,5)=21 five-card subsets and taking the max — clarity over cleverness for
// a trainer (this is the same "correctness first, it's cheap" tradeoff the
// blackjack strategy engine makes).
//
// evaluate(cards) -> { category, tiebreakers, name }
//   category:    9 StraightFlush ... 1 HighCard  (higher = stronger)
//   tiebreakers: rank values in priority order (descending significance)
//   name:        human description, e.g. "Full House, Kings full of Tens"
//
// compare(a, b) -> >0 if a beats b, <0 if b beats a, 0 = exact tie.
//
// DOM-free + module.exports for the Node verification harness.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    const CATEGORY_NAMES = {
        9: 'Straight Flush',
        8: 'Four of a Kind',
        7: 'Full House',
        6: 'Flush',
        5: 'Straight',
        4: 'Three of a Kind',
        3: 'Two Pair',
        2: 'One Pair',
        1: 'High Card'
    };

    // rankVal (2..14) -> singular name for descriptions.
    const RANK_NAME = {
        14: 'Ace', 13: 'King', 12: 'Queen', 11: 'Jack', 10: 'Ten',
        9: 'Nine', 8: 'Eight', 7: 'Seven', 6: 'Six', 5: 'Five',
        4: 'Four', 3: 'Three', 2: 'Two'
    };

    function plural(val) { return RANK_NAME[val] + 's'; }

    // Highest straight in a set of rank values, honoring the wheel (A-2-3-4-5).
    // Returns the straight's high card value, or 0 if no straight.
    function straightHighOf(vals) {
        const uniq = Array.from(new Set(vals)).sort((a, b) => b - a);
        for (let i = 0; i + 4 < uniq.length + 1 && i <= uniq.length - 5; i++) {
            if (uniq[i] - uniq[i + 4] === 4) return uniq[i];
        }
        // Wheel: Ace plays low.
        if (uniq.indexOf(14) !== -1 && uniq.indexOf(5) !== -1 &&
            uniq.indexOf(4) !== -1 && uniq.indexOf(3) !== -1 && uniq.indexOf(2) !== -1) {
            return 5;
        }
        return 0;
    }

    // Score exactly 5 cards.
    function evaluate5(cards) {
        const vals = cards.map(c => c.rankVal).sort((a, b) => b - a);
        const suits = cards.map(c => c.suit);
        const isFlush = suits.every(s => s === suits[0]);
        const straightHigh = straightHighOf(vals);
        const isStraight = straightHigh > 0;

        // Count rank multiplicities, then order groups by (count desc, value desc).
        const counts = {};
        vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
        const groups = Object.keys(counts)
            .map(v => [Number(v), counts[v]])
            .sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));
        // For every non-straight category, listing one representative value per
        // group in this order yields exactly the right tiebreak sequence
        // (quad, kicker) / (trip, pair) / (hiPair, loPair, kicker) / etc.
        const groupVals = groups.map(g => g[0]);

        if (isStraight && isFlush) return finalize(9, [straightHigh]);
        if (groups[0][1] === 4)    return finalize(8, groupVals);
        if (groups[0][1] === 3 && groups[1] && groups[1][1] >= 2) return finalize(7, groupVals);
        if (isFlush)               return finalize(6, vals.slice());
        if (isStraight)            return finalize(5, [straightHigh]);
        if (groups[0][1] === 3)    return finalize(4, groupVals);
        if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) return finalize(3, groupVals);
        if (groups[0][1] === 2)    return finalize(2, groupVals);
        return finalize(1, vals.slice());
    }

    function finalize(category, tiebreakers) {
        return { category, tiebreakers, name: describe(category, tiebreakers) };
    }

    function describe(category, t) {
        switch (category) {
            case 9: return t[0] === 14 ? 'Royal Flush' : 'Straight Flush, ' + RANK_NAME[t[0]] + '-high';
            case 8: return 'Four of a Kind, ' + plural(t[0]);
            case 7: return 'Full House, ' + plural(t[0]) + ' full of ' + plural(t[1]);
            case 6: return 'Flush, ' + RANK_NAME[t[0]] + '-high';
            case 5: return 'Straight, ' + RANK_NAME[t[0]] + '-high';
            case 4: return 'Three of a Kind, ' + plural(t[0]);
            case 3: return 'Two Pair, ' + plural(t[0]) + ' and ' + plural(t[1]);
            case 2: return 'Pair of ' + plural(t[0]);
            default: return RANK_NAME[t[0]] + '-high';
        }
    }

    // Generate all k-combinations of an array (used for best-5-of-7).
    function combinations(arr, k) {
        const result = [];
        const combo = [];
        (function pick(start) {
            if (combo.length === k) { result.push(combo.slice()); return; }
            for (let i = start; i < arr.length; i++) {
                combo.push(arr[i]);
                pick(i + 1);
                combo.pop();
            }
        })(0);
        return result;
    }

    function compare(a, b) {
        if (a.category !== b.category) return a.category - b.category;
        const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
        for (let i = 0; i < len; i++) {
            const av = a.tiebreakers[i] || 0;
            const bv = b.tiebreakers[i] || 0;
            if (av !== bv) return av - bv;
        }
        return 0;
    }

    // Evaluate a 5-, 6-, or 7-card hand, returning the best 5-card result.
    function evaluate(cards) {
        if (cards.length === 5) return evaluate5(cards);
        let best = null;
        const combos = combinations(cards, 5);
        for (let i = 0; i < combos.length; i++) {
            const score = evaluate5(combos[i]);
            if (best === null || compare(score, best) > 0) best = score;
        }
        return best;
    }

    const HandEval = {
        CATEGORY_NAMES,
        RANK_NAME,
        straightHighOf,
        evaluate5,
        evaluate,
        compare,
        combinations
    };

    PK.HandEval = HandEval;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HandEval;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
