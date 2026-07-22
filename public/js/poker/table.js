// ==========================================
// table.js — coached full-hand engine (PK.Table), DOM-free + verifiable.
//
// Deals a 6-handed hand (seats ARE the six taught positions: UTG, MP, CO, BTN,
// SB, BB), then drives it deal-to-showdown. Bots decide with the SAME engines
// the trainer teaches — PK.Ranges (preflop open + response) and PK.Postflop
// (classify -> decision table) — so nothing here invents new strategy. The
// driver pauses whenever it's the hero's turn (state.pending) and resumes on
// act(); every hero decision is graded against those same engines.
//
// Deliberate simplifications (this is a coached trainer, not a cash-game
// engine): a single bet per street, no bot re-raises, single-pass betting,
// abstract pot in big blinds (display only). Grading, not chips, is the point.
//
// Deterministic given an rng, so scripts/verify-table.js can assert decision
// contexts, correct actions, and the showdown winner.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var Cards    = PK.Cards    || (typeof require !== 'undefined' && require('./cards.js'));
    var HandEval = PK.HandEval || (typeof require !== 'undefined' && require('./hand-eval.js'));
    var Ranges   = PK.Ranges   || (typeof require !== 'undefined' && require('./ranges.js'));
    var Postflop = PK.Postflop || (typeof require !== 'undefined' && require('./postflop.js'));

    const PREFLOP_ORDER = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    const POSTFLOP_ORDER = ['SB', 'BB', 'UTG', 'MP', 'CO', 'BTN'];
    const BOT_TIER = 'intermediate'; // bots always play a sensible baseline

    function bucketOf(pos) {
        return (pos === 'UTG' || pos === 'MP') ? 'early' : 'late';
    }
    function seatByPos(state, pos) { return state.seats.find(s => s.pos === pos); }
    function activeSeats(state) { return state.seats.filter(s => !s.folded); }

    function visibleBoard(state) {
        if (state.street === 'flop') return state.board.slice(0, 3);
        if (state.street === 'turn') return state.board.slice(0, 4);
        if (state.street === 'river') return state.board.slice(0, 5);
        return [];
    }

    function log(state, seat, text) {
        state.log.push({ pos: seat.pos, isHero: seat.isHero, street: state.street, text });
    }

    // --- Deal ---------------------------------------------------------------
    function deal(tier, rng) {
        rng = rng || Math.random;
        tier = tier || 'beginner';
        const dealer = Cards.createDealer(rng);
        const heroPos = PREFLOP_ORDER[Math.floor(rng() * PREFLOP_ORDER.length)];
        const seats = PREFLOP_ORDER.map(pos => ({
            pos: pos,
            isHero: pos === heroPos,
            hole: dealer.draw(2),
            folded: false,
            invested: 0
        }));
        const board = dealer.draw(5);
        const state = {
            tier, heroPos, seats, board,
            street: 'preflop',
            pot: 1.5,                 // SB + BB posted
            log: [], decisions: [],
            pending: null, result: null,
            _i: 0, _aggressor: null   // preflop cursor + current raiser
        };
        seatByPos(state, 'SB').invested = 0.5;
        seatByPos(state, 'BB').invested = 1;
        drive(state);
        return controller(state);
    }

    // --- Controller ---------------------------------------------------------
    function controller(state) {
        return {
            state: state,
            // Hero submits an action id for the current pending decision.
            act(actionId) {
                if (!state.pending) return state;
                applyHeroAction(state, actionId);
                state.pending = null;
                drive(state);
                return state;
            }
        };
    }

    // Advance bots/streets until the hero must decide or the hand ends.
    function drive(state) {
        while (!state.pending && !state.result) {
            if (state.street === 'preflop') stepPreflop(state);
            else stepPostflop(state);
        }
    }

    // --- Preflop ------------------------------------------------------------
    function stepPreflop(state) {
        const order = PREFLOP_ORDER.map(p => seatByPos(state, p));
        while (state._i < order.length) {
            const seat = order[state._i];
            if (seat.folded) { state._i++; continue; }
            if (seat.isHero) {
                // BB with no raise checks for free — not a decision worth grading.
                if (state._aggressor === null && seat.pos === 'BB') {
                    log(state, seat, 'You check'); state._i++; continue;
                }
                state.pending = heroPreflopDecision(state, seat); return;
            }
            botPreflopAct(state, seat);
            state._i++;
        }
        endPreflop(state);
    }

    function heroPreflopDecision(state, seat) {
        const cls = Ranges.handClass(seat.hole[0], seat.hole[1]);
        if (state._aggressor === null) {
            // Open or fold (BB with no raise just checks — handled if reached).
            const correct = Ranges.getAction(seat.hole, seat.pos, state.tier);
            return {
                kind: 'preflop-open',
                prompt: "You're first in from " + seat.pos + '. Open-raise or fold?',
                context: [{ label: 'Position', value: seat.pos }, { label: 'Hand', value: cls }],
                options: [{ id: 'raise', label: 'Raise' }, { id: 'fold', label: 'Fold' }],
                correctId: correct,
                explain: cls + ' from ' + seat.pos + ' is a ' + correct.toUpperCase() +
                         ' as a first-in open.'
            };
        }
        const bucket = bucketOf(state._aggressor.pos);
        const correct = Ranges.getResponse(seat.hole, bucket, state.tier);
        return {
            kind: 'preflop-response',
            prompt: state._aggressor.pos + ' raised. Facing the open from ' + seat.pos +
                    ' — 3-bet, call, or fold?',
            context: [{ label: 'Vs', value: state._aggressor.pos }, { label: 'Hand', value: cls }],
            options: [{ id: '3bet', label: '3-Bet' }, { id: 'call', label: 'Call' }, { id: 'fold', label: 'Fold' }],
            correctId: correct,
            explain: cls + ' vs ' + (bucket === 'early' ? 'an' : 'a') + ' ' +
                     Ranges.BUCKET_LABELS[bucket] + ' open plays as ' +
                     (correct === '3bet' ? 'a 3-BET' : correct === 'call' ? 'a CALL' : 'a FOLD') + '.'
        };
    }

    function botPreflopAct(state, seat) {
        const cls = Ranges.handClass(seat.hole[0], seat.hole[1]);
        if (state._aggressor === null) {
            const act = Ranges.getAction(seat.hole, seat.pos, BOT_TIER);
            if (act === 'raise') {
                state._aggressor = seat; seat.invested = 3; state.pot += 3;
                log(state, seat, seat.pos + ' raises');
            } else if (seat.pos === 'BB') {
                log(state, seat, 'BB checks');           // BB sees a free flop
            } else {
                seat.folded = true; log(state, seat, seat.pos + ' folds');
            }
        } else {
            const resp = Ranges.getResponse(seat.hole, bucketOf(state._aggressor.pos), BOT_TIER);
            // Bots never re-raise (bounded tree): 3-bet worthy hands just call.
            if (resp === 'fold') { seat.folded = true; log(state, seat, seat.pos + ' folds'); }
            else { seat.invested = 3; state.pot += 3; log(state, seat, seat.pos + ' calls'); }
        }
    }

    function applyHeroAction(state, actionId) {
        const seat = seatByPos(state, state.heroPos);
        const pending = state.pending;
        const correct = actionId === pending.correctId;
        state.decisions.push({
            street: state.street, kind: pending.kind, chosen: actionId,
            correctId: pending.correctId, correct: correct,
            prompt: pending.prompt, explain: pending.explain,
            scenarioKey: pending.kind + ':' + actionId,
            options: pending.options
        });

        if (actionId === 'fold') {
            seat.folded = true; log(state, seat, 'You fold');
        } else if (state.street === 'preflop') {
            if (actionId === 'raise' || actionId === '3bet') {
                state._aggressor = seat; seat.invested = actionId === '3bet' ? 9 : 3;
                state.pot += seat.invested; log(state, seat, actionId === '3bet' ? 'You 3-bet' : 'You raise');
            } else { // call
                seat.invested = 3; state.pot += 3; log(state, seat, 'You call');
            }
            state._i++; // move past hero for the rest of the preflop pass
        } else {
            // postflop hero action
            if (actionId === 'bet' || actionId === 'raise') {
                state._bettor = seat; state.pot += Math.max(1, Math.round(state.pot * 0.6));
                log(state, seat, actionId === 'raise' ? 'You raise' : 'You bet');
            } else { // call / check
                if (state._bettor) { state.pot += Math.max(1, Math.round(state.pot * 0.4)); log(state, seat, 'You call'); }
                else log(state, seat, 'You check');
            }
            state._i++;
        }
    }

    function endPreflop(state) {
        if (activeSeats(state).length < 2) { showdown(state); return; }
        beginStreet(state, 'flop');
    }

    // --- Postflop -----------------------------------------------------------
    function beginStreet(state, street) {
        state.street = street;
        state._i = 0;
        state._bettor = null;
        stepPostflop(state);
    }

    function stepPostflop(state) {
        const order = POSTFLOP_ORDER.map(p => seatByPos(state, p));
        while (state._i < order.length) {
            const seat = order[state._i];
            if (seat.folded) { state._i++; continue; }
            if (seat.isHero) { state.pending = heroPostflopDecision(state, seat); return; }
            botPostflopAct(state, seat);
            state._i++;
        }
        endStreet(state);
    }

    function heroPostflopDecision(state, seat) {
        const board = visibleBoard(state);
        const cls = Postflop.classify(seat.hole, board);
        if (!state._bettor) {
            const correct = Postflop.getAction(cls.category, 'checkedTo');
            return {
                kind: 'postflop-checked',
                prompt: 'Checked to you on the ' + state.street + '. Bet or check?',
                context: [{ label: 'Street', value: state.street }],
                options: [{ id: 'bet', label: 'Bet' }, { id: 'check', label: 'Check' }],
                correctId: correct,
                explain: heroHandBlurb(cls) + Postflop.CATEGORY_INFO[cls.category].why
            };
        }
        const correct = Postflop.getAction(cls.category, 'facingBet');
        return {
            kind: 'postflop-facing',
            prompt: state._bettor.pos + ' bets the ' + state.street + '. Raise, call, or fold?',
            context: [{ label: 'Street', value: state.street }, { label: 'Vs', value: state._bettor.pos }],
            options: [{ id: 'raise', label: 'Raise' }, { id: 'call', label: 'Call' }, { id: 'fold', label: 'Fold' }],
            correctId: correct,
            explain: heroHandBlurb(cls) + Postflop.CATEGORY_INFO[cls.category].why
        };
    }

    function heroHandBlurb(cls) {
        const held = cls.made && cls.draw ? (cls.made + ' with ' + cls.draw)
            : (cls.made || cls.draw || 'no pair and no draw');
        return 'You have ' + held + ' (' + Postflop.CATEGORY_INFO[cls.category].short.toLowerCase() + '). ';
    }

    function botPostflopAct(state, seat) {
        const cls = Postflop.classify(seat.hole, visibleBoard(state));
        if (!state._bettor) {
            const act = Postflop.getAction(cls.category, 'checkedTo');
            if (act === 'bet') {
                state._bettor = seat; state.pot += Math.max(1, Math.round(state.pot * 0.6));
                log(state, seat, seat.pos + ' bets');
            } else log(state, seat, seat.pos + ' checks');
        } else {
            const act = Postflop.getAction(cls.category, 'facingBet');
            if (act === 'fold') { seat.folded = true; log(state, seat, seat.pos + ' folds'); }
            else { state.pot += Math.max(1, Math.round(state.pot * 0.4)); log(state, seat, seat.pos + ' calls'); }
        }
    }

    function endStreet(state) {
        if (activeSeats(state).length < 2) { showdown(state); return; }
        if (state.street === 'flop') beginStreet(state, 'turn');
        else if (state.street === 'turn') beginStreet(state, 'river');
        else showdown(state);
    }

    // --- Showdown -----------------------------------------------------------
    function showdown(state) {
        const remaining = activeSeats(state);
        let winners = [];
        if (remaining.length === 1) {
            winners = remaining;
        } else {
            let best = null;
            remaining.forEach(seat => {
                seat._ev = HandEval.evaluate(seat.hole.concat(state.board));
                if (!best || HandEval.compare(seat._ev, best) > 0) best = seat._ev;
            });
            winners = remaining.filter(s => HandEval.compare(s._ev, best) === 0);
        }
        const hero = seatByPos(state, state.heroPos);
        const heroWon = winners.indexOf(hero) !== -1;
        const correctCount = state.decisions.filter(d => d.correct).length;

        state.street = 'done';
        state.result = {
            winners: winners.map(w => w.pos),
            heroWon: heroWon,
            heroFolded: hero.folded,
            wentToShowdown: remaining.length > 1,
            reveal: remaining.map(s => ({
                pos: s.pos, isHero: s.isHero, hole: s.hole,
                hand: HandEval.evaluate(s.hole.concat(state.board)).name
            })),
            decisionsTotal: state.decisions.length,
            decisionsCorrect: correctCount
        };
    }

    const Table = {
        deal,
        PREFLOP_ORDER,
        POSTFLOP_ORDER,
        bucketOf,
        visibleBoard
    };

    PK.Table = Table;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Table;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
