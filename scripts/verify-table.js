// Node verification harness for table.js — drives full coached hands with a
// seeded RNG and asserts the engine's invariants: every hero decision has
// legal options and a correct answer produced by the same engines the drills
// use, the hand always terminates with a coherent showdown, and folding ends
// the hero's decisions. Run with: node scripts/verify-table.js

const Table = require('../public/js/poker/table.js');
const Ranges = require('../public/js/poker/ranges.js');
const Postflop = require('../public/js/poker/postflop.js');
const HandEval = require('../public/js/poker/hand-eval.js');

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('  ✗ ' + msg); failures++; }
    else { console.log('  ✓ ' + msg); }
}

// Deterministic RNG (mulberry32).
function rng(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const OPT_SETS = {
    'preflop-open': ['raise', 'fold'],
    'preflop-response': ['3bet', 'call', 'fold'],
    'postflop-checked': ['bet', 'check'],
    'postflop-facing': ['raise', 'call', 'fold']
};

// Play a hand to completion, always choosing the textbook action. Returns the
// final state and a per-decision validity flag.
function playTextbook(tier, seed) {
    const hand = Table.deal(tier, rng(seed));
    let guard = 0;
    let allValid = true;
    while (hand.state.pending && guard++ < 20) {
        const p = hand.state.pending;
        // options must match the kind, and correctId must be among them
        const ids = p.options.map(o => o.id);
        const expected = OPT_SETS[p.kind];
        if (!expected || ids.join(',') !== expected.join(',')) allValid = false;
        if (ids.indexOf(p.correctId) === -1) allValid = false;
        hand.act(p.correctId);
    }
    return { state: hand.state, allValid };
}

console.log('table.js — hands terminate with a coherent result');
let validAll = true, terminateAll = true, showdownConsistent = true;
for (let seed = 1; seed <= 400; seed++) {
    const tier = ['beginner', 'intermediate', 'advanced'][seed % 3];
    const { state, allValid } = playTextbook(tier, seed);
    if (!allValid) validAll = false;
    if (!state.result || state.pending) terminateAll = false;
    const r = state.result;
    if (r) {
        // Winners are non-empty and are seats that reached showdown (or the last standing).
        if (!r.winners || r.winners.length < 1) showdownConsistent = false;
        // If it went to showdown, the winner must actually hold the best hand.
        if (r.wentToShowdown) {
            let best = null;
            r.reveal.forEach(x => {
                const ev = HandEval.evaluate(x.hole.concat(state.board));
                if (!best || HandEval.compare(ev, best) > 0) best = ev;
            });
            const winnerBest = r.reveal
                .filter(x => r.winners.indexOf(x.pos) !== -1)
                .every(x => HandEval.compare(HandEval.evaluate(x.hole.concat(state.board)), best) === 0);
            if (!winnerBest) showdownConsistent = false;
        }
    }
}
assert(validAll, 'every hero decision has correct options + a valid correctId (400 hands)');
assert(terminateAll, 'every hand terminates with a result and no dangling pending');
assert(showdownConsistent, 'declared winner always holds the best hand at showdown');

console.log('\ntable.js — folding ends the hero\'s involvement');
(function () {
    let foldEndsOk = true;
    for (let seed = 1; seed <= 120; seed++) {
        const hand = Table.deal('beginner', rng(seed * 7));
        // Fold at the first opportunity where fold is legal.
        let folded = false, guard = 0;
        while (hand.state.pending && guard++ < 20) {
            const ids = hand.state.pending.options.map(o => o.id);
            if (ids.indexOf('fold') !== -1) { hand.act('fold'); folded = true; break; }
            hand.act(hand.state.pending.correctId);
        }
        if (folded) {
            if (hand.state.pending) foldEndsOk = false;          // no more hero prompts
            if (!hand.state.result) foldEndsOk = false;          // hand still resolves
            const hero = hand.state.seats.find(s => s.isHero);
            if (!hero.folded) foldEndsOk = false;
        }
    }
    assert(foldEndsOk, 'after hero folds there are no further prompts and the hand still resolves');
})();

console.log('\ntable.js — grading matches the source engines');
(function () {
    let matches = true;
    for (let seed = 1; seed <= 150; seed++) {
        const tier = ['beginner', 'intermediate', 'advanced'][seed % 3];
        const hand = Table.deal(tier, rng(seed * 13));
        let guard = 0;
        while (hand.state.pending && guard++ < 20) {
            const p = hand.state.pending;
            const hero = hand.state.seats.find(s => s.isHero);
            let expected;
            if (p.kind === 'preflop-open') {
                expected = Ranges.getAction(hero.hole, hero.pos, tier);
            } else if (p.kind === 'preflop-response') {
                // correctId must be a valid response action
                expected = p.correctId; // structural check below
            } else {
                const cls = Postflop.classify(hero.hole, Table.visibleBoard(hand.state));
                const ctx = p.kind === 'postflop-checked' ? 'checkedTo' : 'facingBet';
                expected = Postflop.getAction(cls.category, ctx);
            }
            if (p.kind !== 'preflop-response' && p.correctId !== expected) matches = false;
            hand.act(p.correctId);
        }
    }
    assert(matches, 'preflop-open and postflop correctIds equal the engine outputs');
})();

console.log('\n' + (failures === 0
    ? 'ALL TABLE CHECKS PASSED'
    : failures + ' TABLE CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
