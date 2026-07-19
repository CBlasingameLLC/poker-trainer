// ==========================================
// reference-render.js — the Charts tab (PK.ReferenceRender.render(container, tier)).
//
// Every chart is built FROM the same modules that grade the drills — hand
// categories from PK.HandEval, preflop grids from PK.Ranges.getActionForClass,
// the pot-odds table from PK.Odds — so the reference can never disagree with
// the answer key. This is the blackjack app's "charts rendered from
// strategy-data, never hand-authored" rule, applied to poker.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var HandEval = PK.HandEval;
    var Ranges = PK.Ranges;
    var Odds = PK.Odds;

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    // Example hands for the ranking cheat sheet (category -> display).
    const RANK_EXAMPLES = {
        9: ['A♠ K♠ Q♠ J♠ T♠', 'spade'],
        8: ['9♣ 9♦ 9♥ 9♠ K♦', 'mixed'],
        7: ['K♠ K♦ K♥ 7♣ 7♦', 'mixed'],
        6: ['A♥ J♥ 8♥ 5♥ 2♥', 'heart'],
        5: ['8♠ 7♦ 6♣ 5♥ 4♠', 'mixed'],
        4: ['Q♣ Q♦ Q♥ 9♠ 4♦', 'mixed'],
        3: ['J♠ J♦ 6♣ 6♥ A♠', 'mixed'],
        2: ['T♥ T♣ K♦ 8♠ 3♥', 'mixed'],
        1: ['A♦ Q♠ 9♥ 6♣ 4♠', 'mixed']
    };

    function buildRankings() {
        const block = el('div', 'ref-block');
        block.appendChild(el('h3', null, 'Hand rankings (strongest first)'));
        const table = el('div', 'rank-table');
        for (let cat = 9; cat >= 1; cat--) {
            const row = el('div', 'rank-row');
            row.appendChild(el('span', 'rank-row__num', String(10 - cat)));
            row.appendChild(el('span', 'rank-row__name', HandEval.CATEGORY_NAMES[cat]));
            const ex = el('span', 'rank-row__ex');
            ex.innerHTML = colorizeCards(RANK_EXAMPLES[cat][0]);
            row.appendChild(ex);
            table.appendChild(row);
        }
        block.appendChild(table);
        return block;
    }

    // Wrap red suits (hearts/diamonds) in a colored span for the examples.
    function colorizeCards(str) {
        return str.replace(/[♥♦]/g, m => '<span class="ex-red">' + m + '</span>');
    }

    function buildRangeGrids(tier) {
        const block = el('div', 'ref-block');
        block.appendChild(el('h3', null, 'Preflop opening ranges — ' + capitalize(tier)));
        block.appendChild(el('p', 'panel-sub',
            'Raise-first-in: you\'re first into the pot. Green = raise, grey = fold. ' +
            'Rows/columns are ranks A→2; suited hands sit above the diagonal.'));

        Ranges.POSITIONS.forEach(pos => {
            const posBlock = el('div', 'ref-block');
            posBlock.appendChild(el('h3', null,
                Ranges.POSITION_LABELS[pos] + ' (' + pos + ')'));
            const wrap = el('div', 'range-grid-wrap');
            const grid = el('div', 'range-grid');
            Ranges.R_DESC.forEach(rowRank => {
                Ranges.R_DESC.forEach(colRank => {
                    const cls = Ranges.gridClass(rowRank, colRank);
                    const action = Ranges.getActionForClass(cls, pos, tier);
                    const cell = el('div', 'rg-cell ' + (action === 'raise' ? 'rg-raise' : 'rg-fold'), cls);
                    grid.appendChild(cell);
                });
            });
            wrap.appendChild(grid);
            posBlock.appendChild(wrap);
            block.appendChild(posBlock);
        });

        const legend = el('div', 'rg-legend');
        legend.innerHTML =
            '<span><span class="rg-swatch rg-raise"></span>Raise</span>' +
            '<span><span class="rg-swatch rg-fold"></span>Fold</span>';
        block.appendChild(legend);
        return block;
    }

    function buildPotOdds() {
        const block = el('div', 'ref-block');
        block.appendChild(el('h3', null, 'Equity from outs (rule of 2 & 4)'));

        const table = el('table', 'odds-table');
        table.innerHTML =
            '<tr><th>Draw</th><th>Outs</th><th>Flop→River</th><th>Turn→River</th></tr>';
        Odds.DRAWS.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + d.name + '</td>' +
                '<td>' + d.outs + '</td>' +
                '<td>' + Odds.exactEquity(d.outs, 'flop').toFixed(0) + '%</td>' +
                '<td>' + Odds.exactEquity(d.outs, 'turn').toFixed(0) + '%</td>';
            table.appendChild(tr);
        });
        block.appendChild(table);

        block.appendChild(el('h3', null, 'Pot odds — equity you need to call'));
        const table2 = el('table', 'odds-table');
        table2.innerHTML = '<tr><th>Bet size</th><th>Pot odds</th><th>Equity needed</th></tr>';
        const bets = [
            { label: '¼ pot', frac: 0.25 },
            { label: '⅓ pot', frac: 0.33 },
            { label: '½ pot', frac: 0.5 },
            { label: '⅔ pot', frac: 0.66 },
            { label: '¾ pot', frac: 0.75 },
            { label: 'Pot', frac: 1 }
        ];
        bets.forEach(b => {
            const pot = 100;
            const call = pot * b.frac;
            const be = Odds.breakEvenEquity(call, pot);
            const ratio = Odds.potOddsRatio(call, pot);
            const tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + b.label + '</td>' +
                '<td>' + ratio.toFixed(1) + ' : 1</td>' +
                '<td>' + be.toFixed(0) + '%</td>';
            table2.appendChild(tr);
        });
        block.appendChild(table2);
        return block;
    }

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    let lastTier = null;
    function render(container, tier) {
        if (!container) return;
        // The rankings + pot-odds sections are tier-independent; only the range
        // grids change with tier. Re-render fully for simplicity (cheap enough).
        lastTier = tier;
        // Preserve the panel heading/intro that lives in the HTML.
        const heading = container.querySelector('.panel-title');
        const intro = container.querySelector('.panel-sub');
        container.innerHTML = '';
        if (heading) container.appendChild(heading);
        if (intro) container.appendChild(intro);
        container.appendChild(buildRangeGrids(tier));
        container.appendChild(buildRankings());
        container.appendChild(buildPotOdds());
    }

    PK.ReferenceRender = { render, currentTier: () => lastTier };
})(typeof globalThis !== 'undefined' ? globalThis : this);
