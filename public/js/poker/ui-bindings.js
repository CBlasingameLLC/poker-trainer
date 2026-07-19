// ==========================================
// ui-bindings.js — the controller (PK.UI).
//
// Wires DOM controls to state: drill tiles start a drill and swap to the drill
// screen; the back button returns to the hub; settings checkboxes and "Clear
// history" persist through PK.Storage. Screen switching is manual class
// toggling between #main-menu and #drill-container (no router), the same
// approach as the blackjack app.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    const MODE_TITLES = {
        handRankings: 'Hand Rankings',
        preflop: 'Preflop Ranges',
        potOdds: 'Pot Odds',
        postflop: 'Postflop Decisions',
        targeted: 'Targeted Practice'
    };

    let menu, drill, title;

    function byId(id) { return document.getElementById(id); }

    function showDrill(mode) {
        title.textContent = MODE_TITLES[mode] || 'Drill';
        menu.classList.add('hidden');
        drill.classList.add('active');
        PK.DrillManager.start(mode);
    }

    function showHub() {
        drill.classList.remove('active');
        menu.classList.remove('hidden');
        PK.Hub.refresh();
    }

    function bindCheckbox(id, key) {
        const box = byId(id);
        const settings = PK.Storage.getSettings();
        box.checked = !!settings[key];
        box.addEventListener('change', () => {
            const s = PK.Storage.getSettings();
            s[key] = box.checked;
            PK.Storage.setSettings(s);
        });
    }

    function init() {
        menu = byId('main-menu');
        drill = byId('drill-container');
        title = byId('drill-title');

        document.querySelectorAll('.tile[data-mode]').forEach(tile => {
            tile.addEventListener('click', () => {
                if (tile.disabled) return;
                showDrill(tile.dataset.mode);
            });
        });

        byId('btn-drill-back').addEventListener('click', showHub);

        bindCheckbox('set-sound', 'soundEnabled');
        bindCheckbox('set-adaptive', 'adaptive');
        bindCheckbox('set-explain', 'alwaysExplain');

        byId('btn-clear-history').addEventListener('click', () => {
            const ok = window.confirm('Clear all statistics and mistake history? This cannot be undone.');
            if (!ok) return;
            PK.Storage.clearHistory();
            PK.StatsRender.render(byId('stats-scroll'));
            PK.Hub.syncTargetedTile();
        });

        // Safety net: if Targeted Practice is entered with nothing logged, bail
        // back to the hub (the tile is normally gated, so this rarely fires).
        PK.DrillManager.subscribe(evt => { if (evt === 'empty') showHub(); });
    }

    PK.UI = { init, showHub, showDrill };
})(typeof globalThis !== 'undefined' ? globalThis : this);
