// ==========================================
// sw.js — service worker for offline support.
//
// This is the one thing the poker app adds over its blackjack sibling (which
// ships no service worker). Strategy: precache the full app shell on install
// (everything is local — no CDN — so the whole app can be cached), then serve
// cache-first with a network fallback that also fills the cache for anything
// not precached. Bump CACHE_VERSION to roll out new assets.
// ==========================================

const CACHE_VERSION = 'poker-trainer-v7';
const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/base.css',
    '/css/poker.css',
    '/fonts/inter-var.woff2',
    '/fonts/playfair-var.woff2',
    '/icons/poker-icon-192.png',
    '/icons/poker-icon-512.png',
    '/js/poker/cards.js',
    '/js/poker/hand-eval.js',
    '/js/poker/ranges.js',
    '/js/poker/odds.js',
    '/js/poker/postflop.js',
    '/js/poker/progress.js',
    '/js/poker/table.js',
    '/js/poker/persistence.js',
    '/js/poker/scenarios.js',
    '/js/poker/drill-manager.js',
    '/js/poker/audio.js',
    '/js/poker/render.js',
    '/js/poker/reference-render.js',
    '/js/poker/stats-render.js',
    '/js/poker/learn-render.js',
    '/js/poker/table-render.js',
    '/js/poker/ui-bindings.js',
    '/js/poker/hub.js',
    '/js/poker/boot.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    event.respondWith(
        caches.match(req).then(cached => {
            if (cached) return cached;
            return fetch(req).then(res => {
                // Cache successful, same-origin responses for next time.
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
                }
                return res;
            }).catch(() => {
                // Offline navigation fallback -> the app shell.
                if (req.mode === 'navigate') return caches.match('/index.html');
            });
        })
    );
});
