// ==========================================
// scenarios.js — fabricates graded drill scenarios per (mode, tier), plus the
// weakness-driven "Targeted Practice" picker.
//
// The poker analog of the blackjack app's `_fabricate*` hand builders and its
// weighted `_pickTargetedScenario`. Every scenario is a self-contained plain
// data object (no functions) so it can be logged to the mistake log and later
// replayed verbatim by Targeted Practice:
//
//   {
//     mode:        'handRankings'|'preflop'|'potOdds',
//     scenarioKey: string,            // stable key -> targeted weighting buckets
//     tier:        'beginner'|'intermediate'|'advanced',
//     prompt:      string,            // rendered as textContent (no HTML)
//     context:     [{label, value}],  // small mono readouts
//     cards:       { community:[], hands:[{label, cards:[...]}] } | null,
//     answers:     [{id, label}],
//     correctId:   string,
//     explain:     string             // shown in the feedback banner
//   }
//
// Difficulty tiers change WHICH scenarios are served (clear-cut vs. marginal),
// never the correctness of the answer — the same design the blackjack drills
// use (fabricate to force the target skill, not to change the rule).
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var Cards    = PK.Cards    || (typeof require !== 'undefined' && require('./cards.js'));
    var HandEval = PK.HandEval || (typeof require !== 'undefined' && require('./hand-eval.js'));
    var Ranges   = PK.Ranges   || (typeof require !== 'undefined' && require('./ranges.js'));
    var Odds     = PK.Odds     || (typeof require !== 'undefined' && require('./odds.js'));
    var Postflop = PK.Postflop || (typeof require !== 'undefined' && require('./postflop.js'));

    const MAX_TRIES = 60;

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // ---- Hand Rankings: "which hand wins at showdown?" ---------------------
    function buildHandRankings(tier) {
        let last = null;
        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            const d = Cards.createDealer();
            const community = d.draw(5);
            const holeA = d.draw(2);
            const holeB = d.draw(2);
            const evA = HandEval.evaluate(community.concat(holeA));
            const evB = HandEval.evaluate(community.concat(holeB));
            const cmp = HandEval.compare(evA, evB);
            const catDiff = Math.abs(evA.category - evB.category);
            const isTie = cmp === 0;

            const scen = makeRankingScenario(tier, community, holeA, holeB, evA, evB, cmp);
            last = scen;

            if (tier === 'beginner' && (isTie || catDiff < 2)) continue;      // clear winner
            if (tier === 'advanced' && evA.category !== evB.category) continue; // kicker battles
            return scen;
        }
        return last;
    }

    function makeRankingScenario(tier, community, holeA, holeB, evA, evB, cmp) {
        const correctId = cmp > 0 ? 'A' : (cmp < 0 ? 'B' : 'split');
        const winner = correctId === 'split'
            ? 'The pot is split.'
            : 'Hand ' + correctId + ' wins.';
        const lo = Math.min(evA.category, evB.category);
        const hi = Math.max(evA.category, evB.category);
        return {
            mode: 'handRankings',
            scenarioKey: 'handRankings:' + lo + '-' + hi,
            tier: tier,
            prompt: 'Which hand wins at showdown?',
            context: [],
            cards: {
                community: community,
                hands: [
                    { label: 'Hand A', cards: holeA },
                    { label: 'Hand B', cards: holeB }
                ]
            },
            answers: [
                { id: 'A', label: 'Hand A' },
                { id: 'B', label: 'Hand B' },
                { id: 'split', label: 'Split' }
            ],
            correctId: correctId,
            explain: 'Hand A: ' + evA.name + '. Hand B: ' + evB.name + '. ' + winner
        };
    }

    // ---- Preflop: raise-first-in from a random seat ------------------------
    function buildPreflop(tier) {
        let last = null;
        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            const d = Cards.createDealer();
            const hole = d.draw(2);
            const position = pick(Ranges.POSITIONS);
            const cls = Ranges.handClass(hole[0], hole[1]);
            const begA = Ranges.getActionForClass(cls, position, 'beginner');
            const advA = Ranges.getActionForClass(cls, position, 'advanced');

            last = makePreflopScenario(tier, position, cls, hole);

            if (tier === 'beginner') {
                // Clear-cut only: strong (raise even in the tight range) or
                // trash (fold even in the wide range).
                const clear = (begA === 'raise') || (advA === 'fold');
                if (!clear) continue;
            } else if (tier === 'advanced') {
                // Prefer the marginal band where tight/wide ranges disagree.
                if (begA === advA && Math.random() < 0.6) continue;
            }
            return last;
        }
        return last;
    }

    function makePreflopScenario(tier, position, cls, hole) {
        const correct = Ranges.getActionForClass(cls, position, tier);
        return {
            mode: 'preflop',
            scenarioKey: 'preflop:' + position + ':' + cls,
            tier: tier,
            prompt: "You're first to act from " + Ranges.POSITION_LABELS[position] +
                    ' (' + position + '). Open-raise or fold?',
            context: [
                { label: 'Position', value: position },
                { label: 'Hand', value: cls }
            ],
            cards: {
                community: [],
                hands: [{ label: 'Your hand', cards: hole }]
            },
            answers: [
                { id: 'raise', label: 'Raise' },
                { id: 'fold', label: 'Fold' }
            ],
            correctId: correct,
            explain: cls + ' from ' + position + ' is ' +
                     (correct === 'raise' ? 'inside' : 'outside') +
                     ' the ' + tier + ' opening range, so the play is to ' +
                     correct.toUpperCase() + '.'
        };
    }

    // ---- Pot Odds: is calling profitable? ----------------------------------
    const POT_SIZES = [20, 30, 40, 50, 60, 80, 100, 120, 150, 200];
    const BET_FRACS = [0.33, 0.5, 0.66, 0.75, 1];

    function buildPotOdds(tier) {
        let last = null;
        for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
            const draw = pick(Odds.DRAWS);
            const street = tier === 'beginner' ? 'turn' : pick(['flop', 'turn']);
            const pot = pick(POT_SIZES);
            const call = Math.max(5, Math.round(pot * pick(BET_FRACS)));
            const equity = Odds.exactEquity(draw.outs, street);
            const be = Odds.breakEvenEquity(call, pot);
            const margin = equity - be;
            const absM = Math.abs(margin);

            last = makePotOddsScenario(tier, draw, street, pot, call, equity, be, margin);

            if (tier === 'beginner' && absM < 12) continue;
            if (tier === 'intermediate' && (absM < 4 || absM > 25)) continue;
            if (tier === 'advanced' && absM > 6) continue;
            return last;
        }
        return last;
    }

    function makePotOddsScenario(tier, draw, street, pot, call, equity, be, margin) {
        const correct = margin >= 0 ? 'call' : 'fold';
        const ruleN = street === 'flop' ? '4' : '2';
        return {
            mode: 'potOdds',
            scenarioKey: 'potOdds:' + draw.name,
            tier: tier,
            prompt: 'You have a ' + draw.name + ' (' + draw.outs + ' outs) on the ' +
                    street + '. Is calling profitable?',
            context: [
                { label: 'Pot', value: String(pot) },
                { label: 'To call', value: String(call) },
                { label: 'Outs', value: String(draw.outs) },
                { label: 'Street', value: street }
            ],
            cards: null,
            answers: [
                { id: 'call', label: 'Call' },
                { id: 'fold', label: 'Fold' }
            ],
            correctId: correct,
            explain: 'Pot odds: you risk ' + call + ' to win ' + (pot + call) +
                     ', so you need ' + be.toFixed(0) + '% equity. With ' + draw.outs +
                     ' outs on the ' + street + ' your equity is ~' + equity.toFixed(0) +
                     '% (rule of ' + ruleN + '). ' +
                     (correct === 'call'
                        ? 'Equity beats the price — call.'
                        : 'Not enough equity — fold.')
        };
    }

    // ---- Postflop: bet/check or raise/call/fold on flop and turn -----------
    // Tier gates WHICH hand categories get served (clear-cut for beginners,
    // marginal for advanced), never the rule itself — Postflop.getAction is
    // the single answer key for grader and cheat sheet alike.
    const POSTFLOP_TIER_CATEGORIES = {
        beginner:     ['monster', 'strong', 'air'],
        intermediate: ['monster', 'strong', 'strongDraw', 'weakDraw', 'air'],
        advanced:     ['monster', 'strong', 'strongDraw', 'marginal', 'weakDraw', 'air']
    };

    // Random deals are ~80% air, which would make a dull drill — so, like the
    // blackjack fabricators, pick the TARGET category first (uniform over the
    // tier's list) and deal until the classifier produces it. Rare categories
    // (strong ≈3% of deals) need the higher try budget; on exhaustion the last
    // deal is served, which is still a validly graded scenario.
    const POSTFLOP_DEAL_TRIES = 400;

    function buildPostflop(tier) {
        const allowed = POSTFLOP_TIER_CATEGORIES[tier] || POSTFLOP_TIER_CATEGORIES.beginner;
        const target = pick(allowed);
        let last = null;
        for (let attempt = 0; attempt < POSTFLOP_DEAL_TRIES; attempt++) {
            const d = Cards.createDealer();
            const hole = d.draw(2);
            const isTurn = tier === 'advanced' && Math.random() < 0.5;
            const board = d.draw(isTurn ? 4 : 3);
            const result = Postflop.classify(hole, board);

            last = makePostflopScenario(tier, hole, board, result, isTurn);
            if (result.category !== target) continue;
            return last;
        }
        return last;
    }

    function makePostflopScenario(tier, hole, board, result, isTurn) {
        const context = pick(Postflop.CONTEXTS);
        const street = isTurn ? 'turn' : 'flop';
        const correct = Postflop.getAction(result.category, context);
        const info = Postflop.CATEGORY_INFO[result.category];

        const situation = context === 'checkedTo'
            ? 'Your opponent checks to you'
            : 'Your opponent bets about half the pot';
        const holding = result.made && result.draw
            ? result.made + ' with ' + result.draw
            : (result.made || result.draw || 'no pair and no draw');

        return {
            mode: 'postflop',
            scenarioKey: 'postflop:' + result.category + ':' + context,
            tier: tier,
            prompt: situation + ' on the ' + street + ". What's your move?",
            context: [
                { label: 'Street', value: street },
                { label: 'Facing', value: context === 'checkedTo' ? 'a check' : 'a bet' }
            ],
            cards: {
                community: board,
                hands: [{ label: 'Your hand', cards: hole }]
            },
            answers: context === 'checkedTo'
                ? [{ id: 'bet', label: 'Bet' }, { id: 'check', label: 'Check' }]
                : [{ id: 'raise', label: 'Raise' }, { id: 'call', label: 'Call' }, { id: 'fold', label: 'Fold' }],
            correctId: correct,
            explain: 'You have ' + holding + ' — ' + info.short.toLowerCase() +
                     ' territory. ' + info.why
        };
    }

    // ---- Dispatch + Targeted picker ----------------------------------------
    function generate(mode, tier) {
        switch (mode) {
            case 'handRankings': return buildHandRankings(tier);
            case 'preflop':      return buildPreflop(tier);
            case 'potOdds':      return buildPotOdds(tier);
            case 'postflop':     return buildPostflop(tier);
            default:             return buildHandRankings(tier);
        }
    }

    // Weighted resurfacing of logged mistakes: each repeat of a scenarioKey
    // adds weight, so the hands you miss most come back most often (mirrors the
    // blackjack weighted `_pickTargetedScenario`). Returns a fresh clone of a
    // stored scenario, or null when nothing eligible is logged. An optional
    // `modeFilter` restricts to one drill mode — used by the adaptive setting to
    // slip a weak-spot spot into a normal same-mode session.
    function pickTargeted(mistakeLog, modeFilter) {
        let eligible = (mistakeLog || []).filter(e => e && e.scenario && e.scenarioKey);
        if (modeFilter) eligible = eligible.filter(e => e.mode === modeFilter);
        if (!eligible.length) return null;

        const freq = {};
        eligible.forEach(e => { freq[e.scenarioKey] = (freq[e.scenarioKey] || 0) + 1; });

        const weights = eligible.map(e => freq[e.scenarioKey]);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let chosen = eligible[eligible.length - 1];
        for (let i = 0; i < eligible.length; i++) {
            r -= weights[i];
            if (r <= 0) { chosen = eligible[i]; break; }
        }

        const clone = JSON.parse(JSON.stringify(chosen.scenario));
        clone._targeted = true;
        return clone;
    }

    // Count of distinct logged mistakes eligible for Targeted Practice.
    function targetedCount(mistakeLog) {
        return (mistakeLog || []).filter(e => e && e.scenario && e.scenarioKey).length;
    }

    const Scenarios = {
        generate,
        pickTargeted,
        targetedCount,
        // exposed for testing / reuse
        buildHandRankings,
        buildPreflop,
        buildPotOdds,
        buildPostflop
    };

    PK.Scenarios = Scenarios;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Scenarios;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
