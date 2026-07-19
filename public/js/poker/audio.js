// ==========================================
// audio.js — tiny Web Audio feedback (PK.Audio), same spirit as the blackjack
// app's audio engine but pared down to two cues: a bright tone for correct, a
// low tone for wrong. Lazily creates the AudioContext on first use (browsers
// require a user gesture) and no-ops if unavailable or disabled in settings.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    let ctx = null;
    function context() {
        if (ctx) return ctx;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) ctx = new AC();
        } catch (e) { ctx = null; }
        return ctx;
    }

    function tone(freq, duration, type) {
        const ac = context();
        if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = type || 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
            osc.connect(gain);
            gain.connect(ac.destination);
            osc.start();
            osc.stop(ac.currentTime + duration);
        } catch (e) { /* ignore */ }
    }

    function correct() { tone(660, 0.16, 'sine'); setTimeout(() => tone(880, 0.16, 'sine'), 90); }
    function wrong() { tone(200, 0.28, 'triangle'); }

    PK.Audio = { correct, wrong };
})(typeof globalThis !== 'undefined' ? globalThis : this);
