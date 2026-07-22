// ==========================================
// hub.js — bottom-nav tab state + the difficulty selector (PK.Hub).
//
// Owns ONLY navigation/state for the hub, never drill logic (the same
// separation the blackjack app enforces between hub.js and game logic).
// Switching to Charts/Stats lazily (re-)renders them; the Practice tab
// re-syncs the self-gating Targeted Practice tile.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    let els = {};
    let activeTab = 'drills';

    function selectTab(tab) {
        activeTab = tab;
        els.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        els.panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tab));

        if (tab === 'charts') {
            PK.ReferenceRender.render(els.chartsScroll, PK.DrillManager.getTier());
        } else if (tab === 'stats') {
            PK.StatsRender.render(els.statsScroll);
        } else if (tab === 'learn') {
            PK.LearnRender.render(els.learnScroll);
        } else if (tab === 'drills') {
            syncTargetedTile();
            renderDailyCard();
        }
    }

    // Daily-goal ring + streak line on the Practice tab. Circumference of an
    // r=19 circle is ~119.4; we reveal a fraction of it via strokeDashoffset.
    const RING_CIRCUM = 2 * Math.PI * 19;
    function renderDailyCard() {
        const snap = PK.DrillManager.progressSnapshot();
        const count = snap.daily && snap.daily.date === PK.Progress.todayStr() ? snap.daily.count : 0;
        const goal = snap.goal;
        const frac = Math.max(0, Math.min(1, goal ? count / goal : 0));

        els.dailyCount.textContent = count;
        els.dailyGoal.textContent = goal;
        els.dailyRingFill.style.strokeDasharray = RING_CIRCUM.toFixed(1);
        els.dailyRingFill.style.strokeDashoffset = (RING_CIRCUM * (1 - frac)).toFixed(1);
        els.dailyRingLabel.textContent = Math.round(frac * 100) + '%';
        els.dailyCard.classList.toggle('daily-card--done', frac >= 1);

        const ds = snap.dayStreak;
        if (frac >= 1) {
            els.dailyStreakLine.textContent = ds > 1
                ? ('Goal met — ' + ds + '-day streak! 🔥')
                : 'Daily goal met — nice! 🔥';
        } else if (ds > 0) {
            els.dailyStreakLine.textContent = ds + '-day streak 🔥 — keep it alive today';
        } else {
            els.dailyStreakLine.textContent = 'Play a hand to start your day streak 🔥';
        }
    }

    // Self-gating Targeted Practice tile (mirrors the blackjack app's
    // syncTargetedTile: disabled with a "Locked" badge until misses exist).
    function syncTargetedTile() {
        const n = PK.Scenarios.targetedCount(PK.Storage.getMistakeLog());
        if (n > 0) {
            els.targetedTile.disabled = false;
            els.targetedBadge.textContent = n + ' logged';
        } else {
            els.targetedTile.disabled = true;
            els.targetedBadge.textContent = 'Locked';
        }
    }

    function setTier(tier) {
        PK.DrillManager.setTier(tier);
        els.tierSegs.forEach(s => s.classList.toggle('active', s.dataset.tier === tier));
        // Keep the range grids in sync if the Charts tab is showing.
        if (activeTab === 'charts') {
            PK.ReferenceRender.render(els.chartsScroll, tier);
        }
    }

    function refresh() {
        syncTargetedTile();
        renderDailyCard();
    }

    function init() {
        els.tabs = Array.from(document.querySelectorAll('.hub-tab'));
        els.panels = Array.from(document.querySelectorAll('.hub-panel'));
        els.tierSegs = Array.from(document.querySelectorAll('#tier-seg .seg'));
        els.chartsScroll = document.getElementById('charts-scroll');
        els.statsScroll = document.getElementById('stats-scroll');
        els.learnScroll = document.getElementById('learn-scroll');
        els.targetedTile = document.getElementById('tile-targeted');
        els.targetedBadge = document.getElementById('targeted-badge');
        els.dailyCard = document.getElementById('daily-card');
        els.dailyCount = document.getElementById('daily-count');
        els.dailyGoal = document.getElementById('daily-goal');
        els.dailyRingFill = document.getElementById('daily-ring-fill');
        els.dailyRingLabel = document.getElementById('daily-ring-label');
        els.dailyStreakLine = document.getElementById('daily-streak-line');

        els.tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
        els.tierSegs.forEach(s => s.addEventListener('click', () => setTier(s.dataset.tier)));

        // Reflect the persisted tier in the segmented control.
        const tier = PK.DrillManager.getTier();
        els.tierSegs.forEach(s => s.classList.toggle('active', s.dataset.tier === tier));

        selectTab('drills');
    }

    PK.Hub = { init, selectTab, syncTargetedTile, setTier, refresh, renderDailyCard };
})(typeof globalThis !== 'undefined' ? globalThis : this);
