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
        } else if (tab === 'drills') {
            syncTargetedTile();
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
    }

    function init() {
        els.tabs = Array.from(document.querySelectorAll('.hub-tab'));
        els.panels = Array.from(document.querySelectorAll('.hub-panel'));
        els.tierSegs = Array.from(document.querySelectorAll('#tier-seg .seg'));
        els.chartsScroll = document.getElementById('charts-scroll');
        els.statsScroll = document.getElementById('stats-scroll');
        els.targetedTile = document.getElementById('tile-targeted');
        els.targetedBadge = document.getElementById('targeted-badge');

        els.tabs.forEach(t => t.addEventListener('click', () => selectTab(t.dataset.tab)));
        els.tierSegs.forEach(s => s.addEventListener('click', () => setTier(s.dataset.tier)));

        // Reflect the persisted tier in the segmented control.
        const tier = PK.DrillManager.getTier();
        els.tierSegs.forEach(s => s.classList.toggle('active', s.dataset.tier === tier));

        selectTab('drills');
    }

    PK.Hub = { init, selectTab, syncTargetedTile, setTier, refresh };
})(typeof globalThis !== 'undefined' ? globalThis : this);
