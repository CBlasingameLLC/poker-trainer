// ==========================================
// table-render.js — the Play-a-Hand table screen (PK.TableRender).
//
// Drives PK.Table (the coached engine) and paints a 6-handed table: seats
// around an oval, the board, the pot, an action log, and the hero's action
// buttons. Each hero decision is graded by the engine and recorded through
// PK.DrillManager.recordPlayDecision so full-hand play feeds stats, streaks,
// and Targeted Practice like every other drill. View-only; the engine owns
// all game state.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var Cards = PK.Cards;
    var Table = PK.Table;

    let els = {};
    let hand = null;   // current PK.Table controller
    let menu = null;

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function displayRank(r) { return r === 'T' ? '10' : r; }

    // mod: 'mini' (seat cards) | 'board' (community). Pip shown except on mini.
    function cardEl(card, mod) {
        const glyph = Cards.SUIT_GLYPH[card.suit];
        const modClass = mod === 'mini' ? ' pcard--mini' : (mod === 'board' ? ' pcard--board' : '');
        const d = el('div', 'pcard ' + card.color + modClass);
        d.appendChild(el('div', 'pcard__corner', displayRank(card.rank) + glyph));
        if (mod !== 'mini') d.appendChild(el('div', 'pcard__pip', glyph));
        d.appendChild(el('div', 'pcard__corner pcard__corner--br', displayRank(card.rank) + glyph));
        return d;
    }
    function faceDownEl() { return el('div', 'pcard pcard--mini placeholder'); }

    // Latest action text for a seat (for the floating chip under each seat).
    function lastActionFor(state, pos) {
        for (let i = state.log.length - 1; i >= 0; i--) {
            if (state.log[i].pos === pos) return state.log[i].text;
        }
        return '';
    }

    function renderSeats(state) {
        els.seats.innerHTML = '';
        const heroIdx = Table.PREFLOP_ORDER.indexOf(state.heroPos);
        // Rotate so the hero sits at slot 0 (bottom); others clockwise.
        const order = Table.PREFLOP_ORDER.slice(heroIdx).concat(Table.PREFLOP_ORDER.slice(0, heroIdx));
        const revealMap = {};
        if (state.result) state.result.reveal.forEach(r => { revealMap[r.pos] = r; });

        order.forEach((pos, slot) => {
            const seat = state.seats.find(s => s.pos === pos);
            const node = el('div', 'table-seat seat-slot-' + slot);
            if (seat.isHero) node.classList.add('table-seat--hero');
            if (seat.folded) node.classList.add('table-seat--folded');
            if (state.result && state.result.winners.indexOf(pos) !== -1) node.classList.add('table-seat--winner');
            if (state.pending && seat.isHero) node.classList.add('table-seat--acting');

            node.appendChild(el('span', 'table-seat__pos', pos + (seat.isHero ? ' (you)' : '')));

            const cards = el('div', 'table-seat__cards');
            if (!seat.folded) {
                if (seat.isHero || revealMap[pos]) {
                    (seat.hole).forEach(c => cards.appendChild(cardEl(c, 'mini')));
                } else {
                    cards.appendChild(faceDownEl());
                    cards.appendChild(faceDownEl());
                }
            }
            node.appendChild(cards);

            const action = lastActionFor(state, pos);
            if (action) node.appendChild(el('span', 'table-seat__action', action.replace(/^You /, '')));
            if (revealMap[pos]) node.appendChild(el('span', 'table-seat__hand', revealMap[pos].hand));
            els.seats.appendChild(node);
        });
    }

    function renderBoard(state) {
        els.board.innerHTML = '';
        const shown = state.result ? state.board : Table.visibleBoard(state);
        shown.forEach(c => els.board.appendChild(cardEl(c, 'board')));
        els.pot.textContent = 'Pot ' + (Math.round(state.pot * 10) / 10) + ' BB';
    }

    function renderLog(state) {
        els.log.innerHTML = '';
        state.log.slice(-5).forEach(entry => {
            const line = el('div', 'table-log__line' + (entry.isHero ? ' table-log__line--hero' : ''), entry.text);
            els.log.appendChild(line);
        });
    }

    function renderPending(state) {
        const p = state.pending;
        els.prompt.textContent = p.prompt;
        els.actions.innerHTML = '';
        p.options.forEach(opt => {
            const btn = el('button', 'button', opt.label);
            btn.addEventListener('click', () => onHeroAction(opt.id));
            els.actions.appendChild(btn);
        });
    }

    function onHeroAction(actionId) {
        const p = hand.state.pending;
        const labelOf = id => (p.options.find(o => o.id === id) || {}).label || id;
        const correct = actionId === p.correctId;
        const info = {
            correct: correct,
            kind: p.kind,
            prompt: p.prompt,
            yourAnswer: labelOf(actionId),
            correctAnswer: labelOf(p.correctId)
        };
        hand.act(actionId); // advances engine; appends the graded decision

        const progress = PK.DrillManager.recordPlayDecision(info);
        updateStreak(progress);

        // Feedback for the decision just made.
        const decided = hand.state.decisions[hand.state.decisions.length - 1];
        els.feedback.classList.remove('hidden', 'correct', 'wrong');
        els.feedback.classList.add(correct ? 'correct' : 'wrong');
        els.verdict.textContent = correct ? 'Correct' : 'Not quite — ' + info.correctAnswer;
        els.detail.textContent = decided ? decided.explain : '';

        if (PK.Storage.getSettings().soundEnabled && PK.Audio) {
            correct ? PK.Audio.correct() : PK.Audio.wrong();
        }
        render();
    }

    function renderResult(state) {
        const r = state.result;
        const won = r.heroWon;
        els.feedback.classList.remove('hidden');
        // Keep the last decision's verdict colour but show the hand outcome below.
        const winnerTxt = r.winners.length > 1 ? 'Split pot' : (r.winners[0] + ' wins');
        let headline;
        if (r.heroFolded) headline = 'You folded. ' + winnerTxt + '.';
        else if (won) headline = r.winners.length > 1 ? 'You chop the pot.' : 'You win the pot! 🏆';
        else headline = winnerTxt + '. You lose this one.';

        els.prompt.textContent = headline + '   ·   ' +
            r.decisionsCorrect + '/' + r.decisionsTotal + ' decisions textbook';

        els.actions.innerHTML = '';
        const next = el('button', 'button button--primary', 'Next hand ›');
        next.addEventListener('click', () => start(PK.DrillManager.getTier()));
        els.actions.appendChild(next);
    }

    function render() {
        const state = hand.state;
        renderSeats(state);
        renderBoard(state);
        renderLog(state);
        if (state.pending) {
            renderPending(state);
        } else if (state.result) {
            renderResult(state);
        }
    }

    function updateStreak(progress) {
        const n = progress && progress.streak ? progress.streak.current : 0;
        els.streakN.textContent = n;
        els.streak.classList.toggle('streak-pill--zero', n === 0);
        els.streak.classList.remove('streak-pill--up', 'streak-pill--break');
        const anim = progress && progress.streakBroken ? 'streak-pill--break'
            : (progress && progress.streakUp ? 'streak-pill--up' : null);
        if (anim) { void els.streak.offsetWidth; els.streak.classList.add(anim); }
    }

    function start(tier) {
        hand = Table.deal(tier || 'beginner');
        els.feedback.classList.add('hidden');
        els.feedback.classList.remove('correct', 'wrong');
        els.verdict.textContent = '';
        els.detail.textContent = '';
        const snap = PK.DrillManager.progressSnapshot();
        els.streakN.textContent = snap.streak.current;
        els.streak.classList.toggle('streak-pill--zero', snap.streak.current === 0);
        show();
        render();
    }

    function show() {
        menu.classList.add('hidden');
        els.container.classList.add('active');
    }
    function exit() {
        els.container.classList.remove('active');
        menu.classList.remove('hidden');
        PK.Hub.refresh();
    }

    function init() {
        menu = document.getElementById('main-menu');
        els = {
            container: document.getElementById('table-container'),
            seats: document.getElementById('table-seats'),
            board: document.getElementById('table-board'),
            pot: document.getElementById('table-pot'),
            log: document.getElementById('table-log'),
            prompt: document.getElementById('table-prompt'),
            feedback: document.getElementById('table-feedback'),
            verdict: document.getElementById('table-verdict'),
            detail: document.getElementById('table-detail'),
            actions: document.getElementById('table-actions'),
            streak: document.getElementById('table-streak'),
            streakN: document.getElementById('table-streak-n')
        };
        document.getElementById('btn-table-back').addEventListener('click', exit);
        document.getElementById('btn-play-hand').addEventListener('click', () => start(PK.DrillManager.getTier()));
    }

    PK.TableRender = { init, start, exit };
})(typeof globalThis !== 'undefined' ? globalThis : this);
