// ==========================================
// progress.js — streak + daily-goal transition logic (pure, DOM-free).
//
// The gamification math lives here as pure functions so drill-manager (the
// single stats write path) can call it and the Node harness can verify it —
// same dual-export discipline as cards/hand-eval/ranges/odds/postflop.
//
//   streak  = consecutive CORRECT decisions (any mode). Breaks to 0 on a miss.
//   daily   = practice volume today vs. the user's goal, plus a day-streak of
//             consecutive calendar days the goal was met. Daily counts EVERY
//             decision (right or wrong) — it rewards showing up, not accuracy.
//
// All date reasoning is passed in as 'YYYY-MM-DD' strings so the functions
// stay pure and testable; `todayStr`/`shiftDate` are the only clock touch and
// are themselves deterministic given a Date.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    // --- Date helpers (local time; 'YYYY-MM-DD') ----------------------------
    function dateStr(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }
    function todayStr(now) {
        return dateStr(now || new Date());
    }
    // Shift a 'YYYY-MM-DD' by n days (noon anchor avoids DST/parse edges).
    function shiftDate(str, n) {
        const d = new Date(str + 'T12:00:00');
        d.setDate(d.getDate() + n);
        return dateStr(d);
    }

    // --- Streak -------------------------------------------------------------
    function defaultStreak() { return { current: 0, best: 0 }; }

    function nextStreak(streak, correct) {
        const s = streak || defaultStreak();
        const current = correct ? s.current + 1 : 0;
        const best = Math.max(s.best || 0, current);
        return { current, best };
    }

    // --- Daily goal ---------------------------------------------------------
    function defaultDaily() {
        return { date: null, count: 0, dayStreak: 0, lastMetDate: null };
    }

    // Roll the day over if `today` differs from the stored date: today's count
    // resets, but dayStreak / lastMetDate are preserved (they span days).
    function rollDaily(daily, today) {
        const d = Object.assign(defaultDaily(), daily || {});
        if (d.date !== today) {
            d.date = today;
            d.count = 0;
        }
        return d;
    }

    // Record one decision toward today's goal. Returns a NEW daily object plus
    // `metNow` = true only on the decision that first crosses the goal today
    // (so the UI can celebrate exactly once).
    function recordDaily(daily, goal, today) {
        const d = rollDaily(daily, today);
        const before = d.count;
        d.count = before + 1;

        let metNow = false;
        if (d.count >= goal && d.lastMetDate !== today) {
            // Extend the day-streak if yesterday's goal was met, else restart.
            d.dayStreak = (d.lastMetDate === shiftDate(today, -1)) ? d.dayStreak + 1 : 1;
            d.lastMetDate = today;
            metNow = true;
        }
        return { daily: d, metNow };
    }

    // Has the day-streak gone cold? (goal not met yesterday or today = broken).
    // Used only for display, so a stale streak reads as 0 without a write.
    function activeDayStreak(daily, today) {
        if (!daily || !daily.lastMetDate) return 0;
        if (daily.lastMetDate === today || daily.lastMetDate === shiftDate(today, -1)) {
            return daily.dayStreak || 0;
        }
        return 0;
    }

    const Progress = {
        dateStr,
        todayStr,
        shiftDate,
        defaultStreak,
        nextStreak,
        defaultDaily,
        rollDaily,
        recordDaily,
        activeDayStreak
    };

    PK.Progress = Progress;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Progress;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
