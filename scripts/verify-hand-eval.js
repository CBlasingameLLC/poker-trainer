// Node verification harness for hand-eval.js — requires the real production
// module (same pattern as the blackjack app's verify-* scripts) and asserts a
// battery of known poker comparisons. Run with: node scripts/verify-hand-eval.js
// Exits non-zero on any failure.

const HE = require('../public/js/poker/hand-eval.js');

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('  ✗ ' + msg); failures++; }
    else { console.log('  ✓ ' + msg); }
}

// Card helpers.
function C(rank, suit) {
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    return { rank, suit, rankVal: RANKS.indexOf(rank) + 2, color: (suit === 'h' || suit === 'd') ? 'red' : 'black' };
}
function hand(str) {
    // "As Ks Qs Js Ts" -> array of cards
    return str.trim().split(/\s+/).map(t => C(t[0], t[1]));
}
function evalStr(str) { return HE.evaluate(hand(str)); }

console.log('hand-eval.js — category detection');
assert(evalStr('As Ks Qs Js Ts').category === 9, 'royal flush -> straight flush (9)');
assert(evalStr('9h 8h 7h 6h 5h').category === 9, '9-high straight flush (9)');
assert(evalStr('Ah Ad Ac As Kd').category === 8, 'four of a kind (8)');
assert(evalStr('Kh Kd Kc 7s 7d').category === 7, 'full house (7)');
assert(evalStr('Ah Jh 8h 5h 2h').category === 6, 'flush (6)');
assert(evalStr('8s 7d 6c 5h 4s').category === 5, 'straight (5)');
assert(evalStr('Ah 2d 3c 4s 5h').category === 5, 'wheel A-2-3-4-5 straight (5)');
assert(evalStr('Qc Qd Qh 9s 4d').category === 4, 'three of a kind (4)');
assert(evalStr('Js Jd 6c 6h Ad').category === 3, 'two pair (3)');
assert(evalStr('Th Tc Kd 8s 3h').category === 2, 'one pair (2)');
assert(evalStr('Ad Qs 9h 6c 4s').category === 1, 'high card (1)');

console.log('\nhand-eval.js — ordering (compare)');
function beats(a, b, label) {
    assert(HE.compare(evalStr(a), evalStr(b)) > 0, label);
}
beats('As Ks Qs Js Ts', 'Ah Ad Ac As Kd', 'straight flush > quads');
beats('Ah Ad Ac As Kd', 'Kh Kd Kc 7s 7d', 'quads > full house');
beats('Kh Kd Kc 7s 7d', 'Ah Jh 8h 5h 2h', 'full house > flush');
beats('Ah Jh 8h 5h 2h', '8s 7d 6c 5h 4s', 'flush > straight');
beats('8s 7d 6c 5h 4s', 'Qc Qd Qh 9s 4d', 'straight > trips');
beats('Qc Qd Qh 9s 4d', 'Js Jd 6c 6h Ad', 'trips > two pair');
beats('Js Jd 6c 6h Ad', 'Th Tc Kd 8s 3h', 'two pair > one pair');
beats('Th Tc Kd 8s 3h', 'Ad Qs 9h 6c 4s', 'one pair > high card');

console.log('\nhand-eval.js — tiebreakers & kickers');
beats('Ah Ad Ac As Kd', 'Kh Kd Kc Ks Ad', 'quad aces > quad kings');
beats('Ah Ad 5c 5s Qd', 'Ah Ad 5c 5s Jd', 'same two pair, better kicker wins');
beats('Ah Kh Qh Jh 9h', 'Kd Qd Jd Td 8d', 'ace-high flush > king-high flush');
assert(HE.compare(evalStr('8s 7d 6c 5h 4s'), evalStr('8h 7s 6d 5c 4h')) === 0, 'identical straights tie');

console.log('\nhand-eval.js — best-5-of-7 selection');
// 7 cards: board makes a flush, one hole card completes a higher flush.
const seven = hand('Ah Kh 2h 7h 9h 3s 4d'); // 5 hearts -> A-high flush
assert(HE.evaluate(seven).category === 6, '7-card: picks the flush');
// 7 cards where trips + pair exists on board -> full house
const boat = hand('Qs Qd Qh 5c 5h 2s 7d');
assert(HE.evaluate(boat).category === 7, '7-card: finds the full house');
// wheel using 7 cards
const wheel7 = hand('Ah 2d 3c 4s 5h Kd Qc');
assert(HE.evaluate(wheel7).category === 5 && HE.evaluate(wheel7).tiebreakers[0] === 5,
    '7-card: wheel straight, 5-high');

console.log('\n' + (failures === 0
    ? 'ALL HAND-EVAL CHECKS PASSED'
    : failures + ' HAND-EVAL CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
