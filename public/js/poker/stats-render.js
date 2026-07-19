// ==========================================
// stats-render.js — the Stats tab (PK.StatsRender.render(container)).
//
// Hand-rolled DOM + SVG, no chart library — the same deliberate choice as the
// blackjack app's stats-render.js (offline PWA, no bundler for app code).
// Reads everything from PK.Storage. Sections:
//   1. Lifetime accuracy headline
//   2. Per-mode accuracy bars (worst-first)
//   3. Rolling-accuracy SVG trend (window 10, needs >= 10 decisions)
//   4. Weak spots — most-missed scenario categories (the poker analog of the
//      blackjack mistake heatmap)
//   5. Recent mistakes list
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var HandEval = PK.HandEval;

    const TREND_WINDOW = 10;
    const WEAKSPOT_CAP = 6;
    const RECENT_CAP = 12;

    const MODE_LABELS = {
        handRankings: 'Hand Rankings',
        preflop: 'Preflop Ranges',
        potOdds: 'Pot Odds',
        targeted: 'Targeted'
    };

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function pct(correct, total) {
        return total > 0 ? Math.round((correct / total) * 100) : 0;
    }

    function barClass(p) {
        return p >= 90 ? 'bar--good' : (p >= 70 ? 'bar--mid' : 'bar--bad');
    }

    // ---- Friendly label for a scenarioKey (weak spots + mistake rows) -------
    function friendlyKey(key) {
        const parts = key.split(':');
        if (parts[0] === 'handRankings') {
            const cats = (parts[1] || '').split('-');
            const a = HandEval && HandEval.CATEGORY_NAMES[cats[0]] || cats[0];
            const b = HandEval && HandEval.CATEGORY_NAMES[cats[1]] || cats[1];
            return 'Rankings: ' + a + ' vs ' + b;
        }
        if (parts[0] === 'preflop') {
            return 'Preflop: ' + parts[2] + ' from ' + parts[1];
        }
        if (parts[0] === 'potOdds') {
            return 'Pot odds: ' + parts.slice(1).join(':');
        }
        return key;
    }

    // ---- Sections -----------------------------------------------------------
    function buildHeadline(lifetime) {
        const section = el('div', 'stats-section');
        const p = pct(lifetime.decisionsCorrect, lifetime.decisionsTotal);
        const headline = el('div', 'stats-headline');
        headline.appendChild(el('span', 'stats-headline__value', p + '%'));
        headline.appendChild(el('span', 'stats-headline__note',
            lifetime.decisionsCorrect + ' / ' + lifetime.decisionsTotal + ' decisions correct'));
        section.appendChild(el('h2', 'panel-title', 'Your Stats'));
        section.appendChild(el('p', 'panel-sub', 'Lifetime accuracy across every drill.'));
        section.appendChild(headline);
        return section;
    }

    function buildBars(lifetime) {
        const section = el('div', 'stats-section');
        section.appendChild(el('div', 'stats-section-title', 'Accuracy by drill'));

        const rows = Object.keys(lifetime.byMode)
            .map(mode => {
                const b = lifetime.byMode[mode];
                return { mode, total: b.total, correct: b.correct, p: pct(b.correct, b.total) };
            })
            .filter(r => r.total > 0)
            .sort((a, b) => a.p - b.p); // worst first

        if (!rows.length) {
            section.appendChild(el('p', 'stats-empty',
                'No decisions yet — play a drill and your accuracy shows up here.'));
            return section;
        }

        const chart = el('div', 'bar-chart');
        rows.forEach(r => {
            const row = el('div', 'bar-row');
            row.appendChild(el('span', 'bar-row__label', MODE_LABELS[r.mode] || r.mode));
            const track = el('div', 'bar-row__track');
            const fill = el('div', 'bar-row__fill ' + barClass(r.p));
            fill.style.width = r.p + '%';
            track.appendChild(fill);
            row.appendChild(track);
            row.appendChild(el('span', 'bar-row__value', r.p + '%'));
            chart.appendChild(row);
        });
        section.appendChild(chart);
        return section;
    }

    function buildTrend(history) {
        const section = el('div', 'stats-section');
        section.appendChild(el('div', 'stats-section-title', 'Accuracy trend'));

        if (history.length < TREND_WINDOW) {
            section.appendChild(el('p', 'stats-empty',
                'Need ' + TREND_WINDOW + ' decisions to chart a trend (you have ' +
                history.length + ').'));
            return section;
        }

        // Rolling average of the last N decisions, one point per decision.
        const points = [];
        for (let i = TREND_WINDOW - 1; i < history.length; i++) {
            let sum = 0;
            for (let j = i - TREND_WINDOW + 1; j <= i; j++) sum += history[j].correct ? 1 : 0;
            points.push(sum / TREND_WINDOW);
        }

        const W = 300, H = 90, pad = 6;
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.setAttribute('class', 'trend-svg');
        svg.setAttribute('preserveAspectRatio', 'none');

        const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
        const y = v => pad + (1 - v) * (H - pad * 2);
        let d = '';
        points.forEach((v, i) => {
            d += (i === 0 ? 'M' : 'L') + (pad + i * stepX).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
        });
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', d.trim());
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#e3c16f');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        section.appendChild(svg);

        const first = Math.round(points[0] * 100);
        const lastP = Math.round(points[points.length - 1] * 100);
        const delta = lastP - first;
        const cap = el('div', 'trend-caption');
        cap.innerHTML = 'Rolling ' + TREND_WINDOW + '-decision average: ' + lastP + '% ' +
            (delta === 0 ? '(flat)'
                : delta > 0 ? '<span class="up">▲ ' + delta + '</span>'
                : '<span class="down">▼ ' + Math.abs(delta) + '</span>');
        section.appendChild(cap);
        return section;
    }

    function buildWeakSpots(log) {
        const section = el('div', 'stats-section');
        section.appendChild(el('div', 'stats-section-title', 'Weak spots'));

        if (!log.length) {
            section.appendChild(el('p', 'stats-empty', 'No misses logged yet. Nice.'));
            return section;
        }

        const freq = {};
        log.forEach(e => {
            if (!e.scenarioKey) return;
            freq[e.scenarioKey] = (freq[e.scenarioKey] || 0) + 1;
        });
        const ranked = Object.keys(freq)
            .map(k => ({ key: k, n: freq[k] }))
            .sort((a, b) => b.n - a.n)
            .slice(0, WEAKSPOT_CAP);

        const max = ranked.length ? ranked[0].n : 1;
        const chart = el('div', 'bar-chart');
        ranked.forEach(r => {
            const row = el('div', 'bar-row');
            row.appendChild(el('span', 'bar-row__label', friendlyKey(r.key)));
            const track = el('div', 'bar-row__track');
            const fill = el('div', 'bar-row__fill bar--bad');
            fill.style.width = Math.round((r.n / max) * 100) + '%';
            track.appendChild(fill);
            row.appendChild(track);
            row.appendChild(el('span', 'bar-row__value', r.n + '×'));
            chart.appendChild(row);
        });
        section.appendChild(chart);
        section.appendChild(el('p', 'stats-note',
            'Targeted Practice re-drills these most-missed spots more often.'));
        return section;
    }

    function buildRecent(log) {
        const section = el('div', 'stats-section');
        section.appendChild(el('div', 'stats-section-title', 'Recent misses'));

        if (!log.length) {
            section.appendChild(el('p', 'stats-empty', 'Nothing logged.'));
            return section;
        }

        const list = el('div', 'stats-mistake-list');
        log.slice(-RECENT_CAP).reverse().forEach(e => {
            const row = el('div', 'stats-mistake-row');
            const top = el('div', 'stats-mistake-top');
            top.appendChild(el('span', 'stats-mistake-mode', MODE_LABELS[e.mode] || e.mode));
            const when = e.timestamp ? new Date(e.timestamp) : null;
            if (when) {
                top.appendChild(el('span', 'stats-mistake-time',
                    when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
            }
            row.appendChild(top);
            row.appendChild(el('div', 'stats-mistake-prompt', e.prompt || ''));
            const ans = el('div', 'stats-mistake-ans');
            ans.innerHTML = 'You: <span class="miss">' + (e.yourAnswer || '?') +
                '</span> · Correct: <span class="right">' + (e.correctAnswer || '?') + '</span>';
            row.appendChild(ans);
            list.appendChild(row);
        });
        section.appendChild(list);
        return section;
    }

    function render(container) {
        if (!container) return;
        container.innerHTML = '';

        const lifetime = PK.Storage.getLifetimeStats();
        const history = PK.Storage.getAccuracyHistory();
        const log = PK.Storage.getMistakeLog();

        container.appendChild(buildHeadline(lifetime));
        container.appendChild(buildBars(lifetime));
        container.appendChild(buildTrend(history));
        container.appendChild(buildWeakSpots(log));
        container.appendChild(buildRecent(log));
    }

    PK.StatsRender = { render, friendlyKey, MODE_LABELS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
