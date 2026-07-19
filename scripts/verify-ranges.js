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

console.log('\n' + (failures === 0
    ? 'ALL RANGES CHECKS PASSED'
    : failures + ' RANGES CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
