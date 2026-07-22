// ==========================================
// drill-manager.js — DOM-free state machine (PK.DrillManager).
//
// The poker analog of the blackjack app's `game-manager.js`: the single owner
// of drill state and the ONLY write path to stats (`_recordDecision`). It never
// touches `document`; it talks to the UI through a multi-subscriber event bus,
// exactly like the blackjack manager (subscribe() APPENDS listeners so both
// render.js and ui-bindings.js receive every event).
//
// Events emitted:
//   'scenario' (scenario)                     — a new question is ready
//   'graded'   ({scenario, selectedId, correct}) — an answer was graded
//   'empty'    ()                             — Targeted Practice has nothing
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var Scenarios = PK.Scenarios;
    var Storage = PK.Storage;
    var Progress = PK.Progress;

    const subscribers = [];
    let state = { mode: null, tier: 'beginner', scenario: null, answered: false };
    let sessionStats = null;

    function subscribe(cb) { if (typeof cb === 'function') subscribers.push(cb); }
    function emit(evt, payload) {
        subscribers.forEach(cb => { try { cb(evt, payload); } catch (e) { /* isolate */ } });
    }

    function init() {
        const settings = Storage.getSettings();
        state.tier = settings.tier || 'beginner';
        sessionStats = Storage.defaultStatsBucket();
        sessionStats.startedAt = Date.now();
        Storage.setSessionStats(sessionStats);
    }

    function setTier(tier) {
        state.tier = tier;
        const settings = Storage.getSettings();
        settings.tier = tier;
        Storage.setSettings(settings);
    }
    function getTier() { return state.tier; }
    function getState() { return state; }

    function start(mode) {
        state.mode = mode;
        nextScenario();
    }

    function nextScenario() {
        let scenario;
        if (state.mode === 'targeted') {
            scenario = Scenarios.pickTargeted(Storage.getMistakeLog());
            if (!scenario) { emit('empty'); return; }
        } else {
            // Adaptive difficulty: with the setting on, occasionally slip in a
            // weighted weak-spot of the SAME mode instead of a fresh scenario,
            // so normal practice drifts toward what the user keeps missing.
            const settings = Storage.getSettings();
            if (settings.adaptive && Math.random() < 0.35) {
                scenario = Scenarios.pickTargeted(Storage.getMistakeLog(), state.mode);
            }
            if (!scenario) scenario = Scenarios.generate(state.mode, state.tier);
        }
        state.scenario = scenario;
        state.answered = false;
        emit('scenario', scenario);
    }

    function answer(selectedId) {
        if (state.answered || !state.scenario) return;
        const scenario = state.scenario;
        const correct = selectedId === scenario.correctId;
        state.answered = true;

        // Record under the active drill mode ('targeted' counts as its own
        // bucket); a missed targeted question still logs its ORIGINAL scenario
        // (scenario.mode) so the weighted pool keeps feeding itself.
        const progress = _recordDecision(state.mode, correct);
        if (!correct) logMistake(scenario, selectedId);

        emit('graded', { scenario, selectedId, correct, progress });
        emit('progress', progress);
    }

    // The single stats write path (mirrors blackjack `_recordDecision`).
    // Also advances the streak + daily-goal state (progress.js) and returns a
    // snapshot the UI uses to animate the streak pill / daily ring.
    function _recordDecision(mode, correct) {
        bump(sessionStats, mode, correct);
        Storage.setSessionStats(sessionStats);

        const lifetime = Storage.getLifetimeStats();
        bump(lifetime, mode, correct);
        Storage.setLifetimeStats(lifetime);

        Storage.pushDecision({ t: Date.now(), correct: !!correct, mode });

        const today = Progress.todayStr();
        const streak = Progress.nextStreak(Storage.getStreak(), correct);
        Storage.setStreak(streak);

        const goal = Storage.getSettings().dailyGoal || 20;
        const daily = Progress.recordDaily(Storage.getDaily(), goal, today);
        Storage.setDaily(daily.daily);

        return {
            streak: streak,
            streakUp: correct && streak.current > 1,
            streakBroken: !correct,
            daily: daily.daily,
            dayStreak: Progress.activeDayStreak(daily.daily, today),
            goal: goal,
            goalMetNow: daily.metNow
        };
    }

    function bump(bucket, mode, correct) {
        bucket.decisionsTotal++;
        if (correct) bucket.decisionsCorrect++;
        if (!bucket.byMode[mode]) bucket.byMode[mode] = { total: 0, correct: 0 };
        bucket.byMode[mode].total++;
        if (correct) bucket.byMode[mode].correct++;
    }

    function labelOf(scenario, id) {
        const a = scenario.answers.find(x => x.id === id);
        return a ? a.label : id;
    }

    function logMistake(scenario, selectedId) {
        Storage.pushMistake({
            timestamp: Date.now(),
            mode: scenario.mode,
            scenarioKey: scenario.scenarioKey,
            prompt: scenario.prompt,
            yourAnswer: labelOf(scenario, selectedId),
            correctAnswer: labelOf(scenario, scenario.correctId),
            scenario: scenario
        });
    }

    function sessionAccuracy() {
        if (!sessionStats || !sessionStats.decisionsTotal) return null;
        return Math.round((sessionStats.decisionsCorrect / sessionStats.decisionsTotal) * 100);
    }

    // Current streak + daily snapshot for the UI, without recording a decision.
    function progressSnapshot() {
        const today = Progress.todayStr();
        const daily = Storage.getDaily();
        return {
            streak: Storage.getStreak(),
            daily: daily,
            dayStreak: Progress.activeDayStreak(daily, today),
            goal: Storage.getSettings().dailyGoal || 20
        };
    }

    PK.DrillManager = {
        subscribe,
        init,
        start,
        nextScenario,
        answer,
        setTier,
        getTier,
        getState,
        sessionAccuracy,
        progressSnapshot
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
