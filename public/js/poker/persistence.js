// ==========================================
// persistence.js — localStorage wrapper (PK.Storage).
//
// Direct port of the blackjack app's persistence layer so the two trainers
// share one storage discipline: a single schema-versioned, JSON-encoded,
// try/catch-guarded accessor. All persistence (settings, stats, mistake log,
// accuracy history) goes through this file — never touch `localStorage`
// directly from drill-manager.js / render.js / ui-bindings.js.
//
// Everything is scoped under KEY_PREFIX 'junto_poker_' so it can coexist with
// the blackjack app's 'junto_blackjack_' keys on the same origin without
// collision.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    const KEY_PREFIX = 'junto_poker_';
    const SCHEMA_VERSION = 1;

    // Ring-buffer caps (same discipline as the blackjack app).
    const MISTAKE_LOG_CAP = 200;
    const ACCURACY_HISTORY_CAP = 200;

    // Graded modes. `recordDecision` also creates missing buckets on the fly,
    // so this is for a clean default shape / stable ordering, not correctness.
    const MODES = ['handRankings', 'preflop', 'preflopDefense', 'potOdds', 'postflop', 'countOuts', 'targeted'];

    function hasLocalStorage() {
        return typeof localStorage !== 'undefined' && localStorage !== null;
    }

    function defaultSettings() {
        return {
            soundEnabled: false,
            adaptive: true,      // nudge difficulty toward weak spots
            alwaysExplain: false, // show reasoning even on correct answers
            tier: 'beginner',   // last-used manual difficulty
            dailyGoal: 20       // hands per day for the daily-goal ring
        };
    }

    function defaultStatsBucket() {
        const byMode = {};
        MODES.forEach(m => { byMode[m] = { total: 0, correct: 0 }; });
        return {
            startedAt: null,
            decisionsTotal: 0,
            decisionsCorrect: 0,
            byMode: byMode
        };
    }

    const Storage = {
        KEY_PREFIX,
        SCHEMA_VERSION,
        MISTAKE_LOG_CAP,
        ACCURACY_HISTORY_CAP,
        MODES,
        defaultStatsBucket,
        defaultSettings,

        get(key, fallback) {
            if (!hasLocalStorage()) return fallback;
            try {
                const raw = localStorage.getItem(KEY_PREFIX + key);
                if (raw === null || raw === undefined) return fallback;
                const parsed = JSON.parse(raw);
                return parsed === null || parsed === undefined ? fallback : parsed;
            } catch (err) {
                return fallback;
            }
        },

        set(key, value) {
            if (!hasLocalStorage()) return false;
            try {
                localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
                return true;
            } catch (err) {
                return false;
            }
        },

        remove(key) {
            if (!hasLocalStorage()) return false;
            try {
                localStorage.removeItem(KEY_PREFIX + key);
                return true;
            } catch (err) {
                return false;
            }
        },

        // --- Typed accessors ---

        getSettings() {
            return Object.assign(defaultSettings(), this.get('settings', {}));
        },
        setSettings(settings) {
            return this.set('settings', Object.assign(defaultSettings(), settings));
        },

        getSessionStats() {
            return this.get('stats_session', defaultStatsBucket());
        },
        setSessionStats(stats) {
            return this.set('stats_session', stats);
        },

        getLifetimeStats() {
            return this.get('stats_lifetime', defaultStatsBucket());
        },
        setLifetimeStats(stats) {
            return this.set('stats_lifetime', stats);
        },

        getMistakeLog() {
            return this.get('mistake_log', []);
        },
        pushMistake(entry) {
            const log = this.getMistakeLog();
            log.push(entry);
            while (log.length > MISTAKE_LOG_CAP) log.shift();
            this.set('mistake_log', log);
            return log;
        },

        getAccuracyHistory() {
            return this.get('accuracy_history', []);
        },
        pushDecision(entry) {
            const log = this.getAccuracyHistory();
            log.push(entry);
            while (log.length > ACCURACY_HISTORY_CAP) log.shift();
            this.set('accuracy_history', log);
            return log;
        },

        // Streak { current, best } and daily-goal { date, count, dayStreak,
        // lastMetDate } state — shapes owned by progress.js, persisted here.
        getStreak() {
            return this.get('streak', { current: 0, best: 0 });
        },
        setStreak(streak) {
            return this.set('streak', streak);
        },
        getDaily() {
            return this.get('daily', { date: null, count: 0, dayStreak: 0, lastMetDate: null });
        },
        setDaily(daily) {
            return this.set('daily', daily);
        },

        // Wipe everything the "Clear all statistics" control resets.
        clearHistory() {
            this.setLifetimeStats(defaultStatsBucket());
            this.setSessionStats(defaultStatsBucket());
            this.set('mistake_log', []);
            this.set('accuracy_history', []);
            this.setStreak({ current: 0, best: 0 });
            this.setDaily({ date: null, count: 0, dayStreak: 0, lastMetDate: null });
        },

        // Version ladder stub — seeds schema_version so future migrations have
        // something to compare against (identical pattern to the blackjack app).
        migrate() {
            const version = this.get('schema_version', 0);
            if (version < 1) {
                // v1 is the first shape; nothing to migrate yet.
            }
            if (version !== SCHEMA_VERSION) {
                this.set('schema_version', SCHEMA_VERSION);
            }
            return SCHEMA_VERSION;
        }
    };

    PK.Storage = Storage;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Storage;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
