// ==========================================
// render.js — the drill-screen view (PK.Render).
//
// Subscribes to PK.DrillManager's event bus and paints the drill screen:
// prompt, context readouts, the card board, answer buttons, and the graded
// feedback banner. Mirrors the blackjack render/manager split — this file owns
// the DOM; the manager owns state and never touches `document`.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var Cards = PK.Cards;

    let els = {};

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function displayRank(rank) { return rank === 'T' ? '10' : rank; }

    function cardEl(card, delayIndex) {
        const glyph = Cards.SUIT_GLYPH[card.suit];
        const d = el('div', 'pcard ' + card.color);
        if (delayIndex != null) d.style.animationDelay = (delayIndex * 45) + 'ms';
        d.appendChild(el('div', 'pcard__corner', displayRank(card.rank) + glyph));
        d.appendChild(el('div', 'pcard__pip', glyph));
        d.appendChild(el('div', 'pcard__corner pcard__corner--br', displayRank(card.rank) + glyph));
        return d;
    }

    function cardRow(cards, startIndex) {
        const row = el('div', 'card-row');
        cards.forEach((c, i) => row.appendChild(cardEl(c, (startIndex || 0) + i)));
        return row;
    }

    function buildBoard(cards) {
        els.board.innerHTML = '';
        if (!cards) return;

        let idx = 0;
        if (cards.community && cards.community.length) {
            const grp = el('div', 'hand-group');
            grp.appendChild(el('span', 'hand-group__label', 'Community'));
            grp.appendChild(cardRow(cards.community, idx));
            idx += cards.community.length;
            els.board.appendChild(grp);
        }
        (cards.hands || []).forEach(hand => {
            const grp = el('div', 'hand-group');
            grp.appendChild(el('span', 'hand-group__label', hand.label));
            grp.appendChild(cardRow(hand.cards, idx));
            idx += hand.cards.length;
            els.board.appendChild(grp);
        });
    }

    function buildContext(context) {
        els.context.innerHTML = '';
        (context || []).forEach(c => {
            const item = el('span');
            item.innerHTML = c.label + ' <b>' + escapeHtml(c.value) + '</b>';
            els.context.appendChild(item);
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"]/g, ch => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
        ));
    }

    function buildAnswers(scenario) {
        els.answers.innerHTML = '';
        scenario.answers.forEach(a => {
            const btn = el('button', 'button', a.label);
            btn.dataset.id = a.id;
            btn.addEventListener('click', () => PK.DrillManager.answer(a.id));
            els.answers.appendChild(btn);
        });
    }

    function onScenario(scenario) {
        els.prompt.textContent = scenario.prompt;
        buildContext(scenario.context);
        buildBoard(scenario.cards);
        buildAnswers(scenario);
        els.feedback.classList.add('hidden');
        els.feedback.classList.remove('correct', 'wrong');
        updateAccuracy();
    }

    function onGraded(payload) {
        const { scenario, selectedId, correct } = payload;

        // Highlight buttons: correct answer green, a wrong pick red, disable all.
        Array.from(els.answers.children).forEach(btn => {
            const id = btn.dataset.id;
            if (id === scenario.correctId) btn.classList.add('is-correct');
            else if (id === selectedId) btn.classList.add('is-wrong');
            btn.disabled = true;
        });

        const settings = PK.Storage.getSettings();
        els.feedback.classList.remove('hidden');
        els.feedback.classList.add(correct ? 'correct' : 'wrong');
        els.verdict.textContent = correct ? 'Correct' : 'Not quite';
        // Show the explanation on a miss, or when the user opted into always-explain.
        els.detail.textContent = (!correct || settings.alwaysExplain) ? scenario.explain : '';

        // Swap the dock for a Next CTA.
        els.answers.innerHTML = '';
        const next = el('button', 'button button--primary', 'Next hand ›');
        next.addEventListener('click', () => PK.DrillManager.nextScenario());
        els.answers.appendChild(next);

        if (settings.soundEnabled && PK.Audio) {
            correct ? PK.Audio.correct() : PK.Audio.wrong();
        }
        updateAccuracy();
    }

    function updateAccuracy() {
        const acc = PK.DrillManager.sessionAccuracy();
        els.accuracy.textContent = acc == null ? 'Session —' : ('Session ' + acc + '%');
    }

    function init() {
        els = {
            prompt: document.getElementById('drill-prompt'),
            context: document.getElementById('drill-context'),
            board: document.getElementById('drill-board'),
            answers: document.getElementById('answer-grid'),
            feedback: document.getElementById('drill-feedback'),
            verdict: document.getElementById('feedback-verdict'),
            detail: document.getElementById('feedback-detail'),
            accuracy: document.getElementById('drill-accuracy')
        };
        PK.DrillManager.subscribe((evt, payload) => {
            if (evt === 'scenario') onScenario(payload);
            else if (evt === 'graded') onGraded(payload);
        });
    }

    PK.Render = { init };
})(typeof globalThis !== 'undefined' ? globalThis : this);
