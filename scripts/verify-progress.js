// Node verification harness for progress.js — requires the real production
// module and asserts streak transitions, daily rollover, day-streak
// continuation/reset, and the "met goal exactly once" signal.
// Run with: node scripts/verify-progress.js — exits non-zero on any failure.

const P = require('../public/js/poker/progress.js');

let failures = 0;
function assert(cond, msg) {
    if (!cond) { console.error('  ✗ ' + msg); failures++; }
    else { console.log('  ✓ ' + msg); }
}
function eq(a, b, msg) { assert(JSON.stringify(a) === JSON.stringify(b), msg + '  (got ' + JSON.stringify(a) + ')'); }

console.log('progress.js — streaks');
let s = P.defaultStreak();
s = P.nextStreak(s, true);  eq(s, { current: 1, best: 1 }, 'first correct -> 1/1');
s = P.nextStreak(s, true);  eq(s, { current: 2, best: 2 }, 'second correct -> 2/2');
s = P.nextStreak(s, false); eq(s, { current: 0, best: 2 }, 'miss resets current, keeps best');
s = P.nextStreak(s, true);  eq(s, { current: 1, best: 2 }, 'rebuild does not lower best');

console.log('\nprogress.js — date helpers');
assert(P.shiftDate('2026-03-01', -1) === '2026-02-28', 'shiftDate crosses month boundary');
assert(P.shiftDate('2026-01-01', -1) === '2025-12-31', 'shiftDate crosses year boundary');
assert(P.dateStr(new Date('2026-07-19T12:00:00')) === '2026-07-19', 'dateStr formats YYYY-MM-DD');

console.log('\nprogress.js — daily rollover');
let d = P.defaultDaily();
let r = P.recordDaily(d, 3, '2026-07-19');
eq(r.daily.count, 1, 'first decision today -> count 1');
assert(r.metNow === false, 'goal of 3 not met at count 1');
r = P.recordDaily(r.daily, 3, '2026-07-19');
r = P.recordDaily(r.daily, 3, '2026-07-19');
assert(r.daily.count === 3 && r.metNow === true, 'count reaches 3 -> metNow true, dayStreak 1');
assert(r.daily.dayStreak === 1, 'first met day -> dayStreak 1');
r = P.recordDaily(r.daily, 3, '2026-07-19');
assert(r.daily.count === 4 && r.metNow === false, 'further decisions same day do not re-fire metNow');

console.log('\nprogress.js — day-streak continuation');
// Next day, meet the goal again -> streak extends to 2.
let day2 = P.recordDaily(r.daily, 3, '2026-07-20');
day2 = P.recordDaily(day2.daily, 3, '2026-07-20');
day2 = P.recordDaily(day2.daily, 3, '2026-07-20');
assert(day2.daily.count === 3, 'count reset on the new day then climbed to 3');
assert(day2.daily.dayStreak === 2 && day2.metNow === true, 'consecutive day extends dayStreak to 2');

console.log('\nprogress.js — day-streak reset after a gap');
// Skip a day: last met 2026-07-20, now practice 2026-07-22 -> streak restarts at 1.
let gap = P.recordDaily(day2.daily, 3, '2026-07-22');
gap = P.recordDaily(gap.daily, 3, '2026-07-22');
gap = P.recordDaily(gap.daily, 3, '2026-07-22');
assert(gap.daily.dayStreak === 1, 'a skipped day resets dayStreak to 1');

console.log('\nprogress.js — activeDayStreak (display-only staleness)');
assert(P.activeDayStreak(gap.daily, '2026-07-22') === 1, 'streak is live on the day it was met');
assert(P.activeDayStreak(gap.daily, '2026-07-23') === 1, 'still live the next day (grace)');
assert(P.activeDayStreak(gap.daily, '2026-07-25') === 0, 'reads as 0 once two+ days lapse');

console.log('\n' + (failures === 0
    ? 'ALL PROGRESS CHECKS PASSED'
    : failures + ' PROGRESS CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
