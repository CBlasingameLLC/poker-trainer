// Node verification harness for ranges.js — requires the real production module
// and asserts grid completeness, spot-check actions, and tier monotonicity
// (wider tiers must be supersets, so a hand never drops out as difficulty
// rises). Run with: node scripts/verify-ranges.js — exits non-zero on failure.

const R = require('../public/js/poker/ranges.js');

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('  ✗ ' + msg); failures++; }
    else { console.log('  ✓ ' + msg); }
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
function C(rank, suit) {
    return { rank, suit, rankVal: RANKS.indexOf(rank) + 2, color: (suit === 'h' || suit === 'd') ? 'red' : 'black' };
}

console.log('ranges.js — grid completeness (169 distinct classes per position)');
R.POSITIONS.forEach(pos => {
    const seen = new Set();
    R.R_DESC.forEach(rowRank => {
        R.R_DESC.forEach(colRank => {
            const cls = R.gridClass(rowRank, colRank);
            seen.add(cls);
            const action = R.getActionForClass(cls, pos, 'intermediate');
            if (action !== 'raise' && action !== 'fold') failures++;
        });
    });
    assert(seen.size === 169, pos + ': grid covers all 169 hand classes (' + seen.size + ')');
});

console.log('\nranges.js — handClass canonicalization');
assert(R.handClass(C('A', 's'), C('A', 'h')) === 'AA', 'pocket aces -> AA');
assert(R.handClass(C('A', 's'), C('K', 's')) === 'AKs', 'AK suited -> AKs');
assert(R.handClass(C('K', 'd'), C('A', 's')) === 'AKo', 'AK offsuit (order-independent) -> AKo');
assert(R.handClass(C('7', 'c'), C('2', 'h')) === '72o', '72 offsuit -> 72o');

console.log('\nranges.js — spot-check actions');
R.POSITIONS.forEach(pos => {
    R.TIERS.forEach(tier => {
        assert(R.getActionForClass('AA', pos, tier) === 'raise', 'AA raises from ' + pos + '/' + tier);
        assert(R.getActionForClass('72o', pos, tier) === 'fold', '72o folds from ' + pos + '/' + tier);
    });
});
assert(R.getActionForClass('AKo', 'UTG', 'beginner') === 'raise', 'AKo opens UTG even at beginner');
assert(R.getActionForClass('54s', 'UTG', 'beginner') === 'fold', '54s folds UTG at beginner');
assert(R.getActionForClass('A2s', 'BTN', 'intermediate') === 'raise', 'A2s opens the button');

console.log('\nranges.js — tier monotonicity (advanced ⊇ intermediate ⊇ beginner)');
R.POSITIONS.forEach(pos => {
    let ok = true;
    R.R_DESC.forEach(rowRank => {
        R.R_DESC.forEach(colRank => {
            const cls = R.gridClass(rowRank, colRank);
            const beg = R.getActionForClass(cls, pos, 'beginner') === 'raise';
            const int = R.getActionForClass(cls, pos, 'intermediate') === 'raise';
            const adv = R.getActionForClass(cls, pos, 'advanced') === 'raise';
            if (beg && !int) { ok = false; }
            if (int && !adv) { ok = false; }
        });
    });
    assert(ok, pos + ': every wider tier keeps all tighter-tier raises');
});

console.log('\nranges.js — dash-range parsing');
(function () {
    const pairRange = R.expandRange('TT-JJ');
    assert(pairRange.has('TT') && pairRange.has('JJ') && !pairRange.has('99') && pairRange.size === 2,
        '"TT-JJ" expands to exactly TT, JJ');
    const suitedRange = R.expandRange('A9s-A2s');
    assert(suitedRange.has('A2s') && suitedRange.has('A9s') && !suitedRange.has('ATs') && suitedRange.size === 8,
        '"A9s-A2s" expands to A2s..A9s (8 hands)');
})();

console.log('\nranges.js — facing-a-raise responses');
R.BUCKETS.forEach(bucket => {
    R.TIERS.forEach(tier => {
        assert(R.getResponseForClass('AA', bucket, tier) === '3bet', 'AA 3-bets vs ' + bucket + '/' + tier);
        assert(R.getResponseForClass('72o', bucket, tier) === 'fold', '72o folds vs ' + bucket + '/' + tier);
    });
});
assert(R.getResponseForClass('KQs', 'early', 'beginner') === 'call', 'KQs calls a tight early open (beginner)');
assert(R.getResponseForClass('AKo', 'early', 'beginner') === '3bet', 'AKo 3-bets vs an early open');

console.log('\nranges.js — response grid completeness + play-range monotonicity');
R.BUCKETS.forEach(bucket => {
    let complete = true, mono = true;
    R.R_DESC.forEach(rowRank => {
        R.R_DESC.forEach(colRank => {
            const cls = R.gridClass(rowRank, colRank);
            const resp = R.getResponseForClass(cls, bucket, 'intermediate');
            if (['3bet', 'call', 'fold'].indexOf(resp) === -1) complete = false;
            // A hand that is played (3bet or call) at a tighter tier must still
            // be played at a wider tier (it may switch 3bet<->call, not fold).
            const played = t => R.getResponseForClass(cls, bucket, t) !== 'fold';
            if (played('beginner') && !played('intermediate')) mono = false;
            if (played('intermediate') && !played('advanced')) mono = false;
        });
    });
    assert(complete, bucket + ': every cell resolves to 3bet/call/fold');
    assert(mono, bucket + ': wider tiers keep every tighter-tier played hand');
});

console.log('\n' + (failures === 0
    ? 'ALL RANGES CHECKS PASSED'
    : failures + ' RANGES CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
