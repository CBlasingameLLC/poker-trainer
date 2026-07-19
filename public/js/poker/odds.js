// ==========================================
// odds.js — pot odds & equity math (pure functions).
//
// Drives the Pot Odds drill and the pot-odds reference table. Everything here
// is a plain function of numbers so it's trivially testable and DOM-free
// (module.exports for the Node harness), mirroring how the blackjack app keeps
// its count/strategy math in pure modules.
//
// Core beginner lesson: compare the price of a call (pot odds) to your chance
// of hitting (equity from outs). Call when equity > pot-odds break-even.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    // Break-even equity % needed to call: call / (pot + call), as a percentage.
    // `pot` is the pot size BEFORE you put your call in.
    function breakEvenEquity(callAmount, pot) {
        if (callAmount <= 0) return 0;
        return (callAmount / (pot + callAmount)) * 100;
    }

    // "X to 1" phrasing of the pot odds, e.g. pot 100 / call 50 -> 2 (2:1).
    function potOddsRatio(callAmount, pot) {
        if (callAmount <= 0) return Infinity;
        return pot / callAmount;
    }

    // Rule of 2 and 4: quick equity estimate from outs.
    //   'flop'  (two cards to come) -> outs * 4
    //   'turn'  (one card to come)  -> outs * 2
    // Capped at a sensible ceiling; the ~*4 rule overshoots for many outs.
    function equityFromOuts(outs, street) {
        const raw = street === 'flop' ? outs * 4 : outs * 2;
        return Math.min(raw, 95);
    }

    // Exact drawing equity (hypergeometric) for hitting at least one out, used
    // by the reference table so the "true" column doesn't rely on the estimate.
    //   street 'flop' = 2 cards to come from 47 unseen; 'turn' = 1 from 46.
    function exactEquity(outs, street) {
        if (street === 'turn') {
            return (outs / 46) * 100;
        }
        // flop: 1 - P(miss both)
        const missBoth = ((47 - outs) / 47) * ((46 - outs) / 46);
        return (1 - missBoth) * 100;
    }

    // The graded decision: is calling profitable?  true = call, false = fold.
    function isProfitableCall(equityPct, callAmount, pot) {
        return equityPct >= breakEvenEquity(callAmount, pot);
    }

    // Common draws -> outs, for scenario prompts and the reference table.
    const DRAWS = [
        { name: 'Gutshot straight draw', outs: 4 },
        { name: 'Two overcards', outs: 6 },
        { name: 'Open-ended straight draw', outs: 8 },
        { name: 'Flush draw', outs: 9 },
        { name: 'Flush draw + gutshot', outs: 12 },
        { name: 'Open-ended + flush draw', outs: 15 }
    ];

    const Odds = {
        breakEvenEquity,
        potOddsRatio,
        equityFromOuts,
        exactEquity,
        isProfitableCall,
        DRAWS
    };

    PK.Odds = Odds;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Odds;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
