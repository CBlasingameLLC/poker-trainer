// ==========================================
// learn-render.js — the Learn tab (PK.LearnRender.render(container)).
//
// Beginner primers so someone who has never played can start cold: how a hand
// plays out, what positions mean, the betting actions, a glossary, and the
// hand-ranking order (that last list is built from PK.HandEval.CATEGORY_NAMES
// so it can't drift from the grader). Pure prose is held inline here — the
// "derive from a module" rule only binds graded content, and Learn is
// explanatory, not graded.
//
// Rendered as native <details> accordions (accessible, no JS needed to toggle).
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    var HandEval = PK.HandEval;

    // Each lesson: { icon, title, summary, blocks:[ p | steps | terms ] }.
    const LESSONS = [
        {
            icon: '🃏', title: 'How a hand plays out', open: true,
            summary: 'The four betting rounds, deal to showdown.',
            blocks: [
                { type: 'steps', items: [
                    { label: 'Preflop', text: "Each player gets two hidden 'hole' cards. The two seats left of the dealer post forced bets — the small and big blind — so there's something to play for. Betting starts left of the big blind." },
                    { label: 'Flop', text: 'Three shared community cards are dealt face-up, then a betting round.' },
                    { label: 'Turn', text: 'A fourth community card, then another betting round.' },
                    { label: 'River', text: 'The fifth and final community card, then the last betting round.' },
                    { label: 'Showdown', text: 'If two or more players remain, hands are revealed. Your best five-card hand out of the seven available (your two plus the five community cards) wins the pot.' }
                ] }
            ]
        },
        {
            icon: '🪑', title: 'Position — where you sit',
            summary: 'Acting later means more information. Position is power.',
            blocks: [
                { type: 'p', text: 'Play tighter (fewer hands) from early seats and looser (more hands) from late seats — exactly what the Preflop Ranges drill trains.' },
                { type: 'terms', items: [
                    { term: 'Small Blind (SB)', text: 'A forced half-size bet, immediately left of the dealer button.' },
                    { term: 'Big Blind (BB)', text: 'The full forced bet. You already have chips in, so you defend it more often.' },
                    { term: 'Under the Gun (UTG)', text: 'First to act preflop — the tightest seat, open only strong hands.' },
                    { term: 'Middle Position (MP)', text: 'A few seats along; you can open a bit wider.' },
                    { term: 'Cutoff / Button (CO / BTN)', text: 'The best seats — you act last after the flop, so you open the widest.' }
                ] }
            ]
        },
        {
            icon: '🎬', title: 'Your options on each turn',
            summary: 'The five things you can do when the action reaches you.',
            blocks: [
                { type: 'terms', items: [
                    { term: 'Fold', text: 'Give up the hand and forfeit any chips already in the pot.' },
                    { term: 'Check', text: 'Pass the action without betting — only allowed if no one has bet yet this round.' },
                    { term: 'Call', text: 'Match the current bet to stay in the hand.' },
                    { term: 'Bet', text: 'Put chips in when no one else has this round.' },
                    { term: 'Raise', text: "Increase the amount over someone else's bet." }
                ] }
            ]
        },
        {
            icon: '📖', title: 'Words to know',
            summary: 'The vocabulary the drills use.',
            blocks: [
                { type: 'terms', items: [
                    { term: 'Pot', text: "All the chips wagered so far — what you're playing to win." },
                    { term: 'Outs', text: 'Cards still in the deck that improve you to the likely best hand.' },
                    { term: 'Pot odds', text: 'The price of a call compared to the size of the pot. Weigh it against your chance of hitting.' },
                    { term: 'Equity', text: 'Your share of the pot — roughly your chance to win the hand right now.' },
                    { term: 'Made hand', text: 'A completed hand (a pair or better) that is good as-is.' },
                    { term: 'Draw', text: 'An incomplete hand one card away from a straight or flush.' },
                    { term: 'Value bet', text: 'Betting a strong hand to get called by worse hands.' },
                    { term: 'Bluff', text: 'Betting a weak hand to make better hands fold.' },
                    { term: 'Semi-bluff', text: 'Betting a draw — you can win now if they fold, or later if you hit.' },
                    { term: 'Kicker', text: 'A side card that breaks ties between otherwise equal hands.' },
                    { term: 'The nuts', text: 'The best possible hand on the current board.' },
                    { term: 'Range', text: 'All the hands someone could hold, not a single guess.' }
                ] }
            ]
        }
    ];

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function buildBlock(block) {
        if (block.type === 'p') {
            return el('p', 'learn-p', block.text);
        }
        if (block.type === 'steps') {
            const ol = el('ol', 'learn-steps');
            block.items.forEach(it => {
                const li = el('li', 'learn-step');
                li.appendChild(el('span', 'learn-step__label', it.label));
                li.appendChild(el('span', 'learn-step__text', it.text));
                ol.appendChild(li);
            });
            return ol;
        }
        // terms
        const dl = el('dl', 'learn-terms');
        block.items.forEach(it => {
            dl.appendChild(el('dt', 'learn-term', it.term));
            dl.appendChild(el('dd', 'learn-def', it.text));
        });
        return dl;
    }

    function buildLesson(lesson) {
        const details = el('details', 'learn-item');
        if (lesson.open) details.open = true;
        const summary = el('summary', 'learn-summary');
        summary.appendChild(el('span', 'learn-summary__icon', lesson.icon));
        const head = el('span', 'learn-summary__head');
        head.appendChild(el('span', 'learn-summary__title', lesson.title));
        head.appendChild(el('span', 'learn-summary__sub', lesson.summary));
        summary.appendChild(head);
        summary.appendChild(el('span', 'learn-summary__chev', '›'));
        details.appendChild(summary);

        const body = el('div', 'learn-body');
        lesson.blocks.forEach(b => body.appendChild(buildBlock(b)));
        details.appendChild(body);
        return details;
    }

    // Hand-ranking order, built from the grader's own category names so Learn
    // and the drills never disagree on what beats what.
    function buildRankingLesson() {
        const details = el('details', 'learn-item');
        const summary = el('summary', 'learn-summary');
        summary.appendChild(el('span', 'learn-summary__icon', '🏆'));
        const head = el('span', 'learn-summary__head');
        head.appendChild(el('span', 'learn-summary__title', 'What beats what'));
        head.appendChild(el('span', 'learn-summary__sub', 'Hand strength, best to worst.'));
        summary.appendChild(head);
        summary.appendChild(el('span', 'learn-summary__chev', '›'));
        details.appendChild(summary);

        const body = el('div', 'learn-body');
        const ol = el('ol', 'learn-rank');
        for (let cat = 9; cat >= 1; cat--) {
            ol.appendChild(el('li', 'learn-rank__item', HandEval.CATEGORY_NAMES[cat]));
        }
        body.appendChild(ol);
        body.appendChild(el('p', 'learn-p', 'The Charts tab shows each of these with an example hand.'));
        details.appendChild(body);
        return details;
    }

    let built = false;
    function render(container) {
        if (!container || built) return;
        built = true;
        container.appendChild(el('h2', 'panel-title', 'Learn'));
        container.appendChild(el('p', 'panel-sub', 'New to poker? Start here, then head to Practice.'));
        LESSONS.forEach(l => container.appendChild(buildLesson(l)));
        container.appendChild(buildRankingLesson());
    }

    PK.LearnRender = { render };
})(typeof globalThis !== 'undefined' ? globalThis : this);
