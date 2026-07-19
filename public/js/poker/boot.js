// ==========================================
// boot.js — startup sequence (runs on window 'load', after all deferred
// modules have attached to PK). Mirrors the blackjack app's boot.js: migrate
// storage, initialize the manager, wire the view + controller + hub, register
// the service worker, then reveal the hub and fade the splash.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    function boot() {
        PK.Storage.migrate();
        PK.DrillManager.init();
        PK.Render.init();
        PK.UI.init();
        PK.Hub.init();

        // Offline support — the one thing we add over the blackjack app.
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => { /* offline is best-effort */ });
        }

        const splash = document.getElementById('boot-splash');
        const menu = document.getElementById('main-menu');
        menu.classList.remove('hidden');
        setTimeout(() => { if (splash) splash.classList.add('hidden'); }, 450);
    }

    window.addEventListener('load', boot);
})(typeof globalThis !== 'undefined' ? globalThis : this);
