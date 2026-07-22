// Node verification harness for postflop.js — requires the real production
// module and asserts the classifier over known hole+board spots plus decision
// table completeness. Run with: node scripts/verify-postflop.js
// Exits non-zero on any failure.

const PF = require('../public/js/poker/postflop.js');

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('  ✗ ' + msg); failures++; }
    else { console.log('  ✓ ' + msg); }
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
function C(rank, suit) {
    return { rank, suit, rankVal: RANKS.indexOf(rank) + 2, color: (suit === 'h' || suit === 'd') ? 'red' : 'black' };
}
function hand(str) { return str.trim().split(/\s+/).map(t => C(t[0], t[1])); }
function cat(holeStr, boardStr) { return PF.classify(hand(holeStr), hand(boardStr)).category; }

console.log('postflop.js — monsters');
assert(cat('7h 7d', '7s Kd 2h') === 'monster', 'set of sevens -> monster');
assert(cat('Ah Kd', 'Ks Kc 2h') === 'monster', 'trips (K + paired board) -> monster');
assert(cat('Kd Qd', 'Kh Qs 3c') === 'monster', 'two pair K+Q -> monster');
assert(cat('Th 9h', '8s 7d 6c') === 'monster', 'made straight -> monster');
assert(cat('Ah 4h', 'Kh 9h 2h') === 'monster', 'made flush -> monster');

console.log('\npostflop.js — strong made hands');
assert(cat('Ah Ad', 'Kh 8c 2d') === 'strong', 'overpair aces -> strong');
assert(cat('As Ks', 'Ah 7d 2c') === 'strong', 'top pair top kicker -> strong');
assert(cat('Kh Jd', 'Ks 8c 3d') === 'strong', 'top pair J kicker -> strong');

console.log('\npostflop.js — marginal made hands');
assert(cat('5h 5d', 'Kh 8c 2d') === 'marginal', 'underpair 55 -> marginal');
assert(cat('Kh 7d', 'Ks 8c 3d') === 'marginal', 'top pair weak kicker -> marginal');
assert(cat('Ah 8d', 'Ks 8c 3d') === 'marginal', 'middle pair -> marginal');

console.log('\npostflop.js — strong draws');
assert(cat('Ac 4c', '9c 6c 2h') === 'strongDraw', 'flush draw -> strongDraw');
assert(cat('9s 8s', '7h 6d 2c') === 'strongDraw', 'open-ended straight draw -> strongDraw');
assert(cat('9h 8h', '9s 5h 2h') === 'strongDraw', 'marginal pair + flush draw upgrades -> strongDraw');
assert(cat('Jh Th', '9h 8c 2h') === 'strongDraw', 'flush draw + OESD combo -> strongDraw');

console.log('\npostflop.js — weak draws');
assert(cat('Jh Td', '8s 7c 2h') === 'weakDraw', 'gutshot (needs a 9) -> weakDraw');
assert(cat('Ah Kd', '8s 6c 2h') === 'weakDraw', 'two overcards -> weakDraw');

console.log('\npostflop.js — air');
assert(cat('2c 3d', 'Kh Qd 7s') === 'air', 'unconnected low cards -> air');
assert(cat('Jc 4d', 'Kh Q8 7s'.replace('Q8', 'Qd')) === 'air', 'one overcard only, no draw -> air');

console.log('\npostflop.js — board pairs do not inflate the classification');
assert(cat('5c 4d', 'Kh Ks 9c') === 'air', 'board pair without hole participation is not your pair');
assert(cat('9h 8h', 'Kh Ks 9c') === 'marginal', 'board pair + your low pair stays marginal');

console.log('\npostflop.js — turn boards (4 cards)');
assert(cat('Ah Ad', 'Kh 8c 2d 4s') === 'strong', 'overpair on the turn -> strong');
assert(cat('Ac 4c', '9c 6c 2h 8d') === 'strongDraw', 'flush draw on the turn -> strongDraw');
assert(cat('Th 9h', '8s 7d 6c 2h') === 'monster', 'made straight on the turn -> monster');

console.log('\npostflop.js — draw out counts (Count-the-Outs)');
function outs(holeStr, boardStr) { return PF.countDrawOuts(hand(holeStr), hand(boardStr)); }
assert(outs('Ac 4c', '9c 6c 2h') === 9, 'flush draw -> 9 outs');
assert(outs('9s 8s', '7h 6d 2c') === 8, 'open-ended straight draw -> 8 outs');
assert(outs('Jh Td', '8s 7c 2h') === 4, 'gutshot (needs a 9) -> 4 outs');
assert(outs('Ah Kh', 'Qh Jh 2c') === 12, 'flush draw + gutshot (broadway) -> 12 outs');
assert(outs('9h 8h', '7h 6h 2c') === 15, 'flush draw + open-ender -> 15 outs');
assert(outs('Kh Qd', 'Ks 8c 3d') === 0, 'top pair, no draw -> 0 outs');
assert(outs('Th 9h', '8s 7d 6c') === 0, 'already a made straight -> 0 draw outs');
assert(PF.describeDraw(hand('Ac 4c'), hand('9c 6c 2h')).label === 'a flush draw',
    'describeDraw labels a flush draw');

console.log('\npostflop.js — decision table completeness');
PF.CATEGORIES.forEach(c => {
    PF.CONTEXTS.forEach(ctx => {
        const a = PF.getAction(c, ctx);
        const allowed = ctx === 'checkedTo' ? ['bet', 'check'] : ['raise', 'call', 'fold'];
        assert(allowed.indexOf(a) !== -1, c + '/' + ctx + ' -> ' + a);
    });
});

console.log('\n' + (failures === 0
    ? 'ALL POSTFLOP CHECKS PASSED'
    : failures + ' POSTFLOP CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
