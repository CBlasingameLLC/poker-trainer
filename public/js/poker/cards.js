// ==========================================
// cards.js — deck model, card representation, shuffle/draw.
//
// A card is a plain object, never a class (mirrors the sibling blackjack app's
// `shoe.js` philosophy — small, unabstracted, easy to serialize into scenarios
// and the mistake log):
//     { rank:'A'|'K'|...|'2', suit:'s'|'h'|'d'|'c', rankVal:14..2, color:'red'|'black' }
//
// DOM-free. Also `module.exports` so Node verification scripts run this exact
// production code.
// ==========================================

(function (root) {
    'use strict';

    var PK = (typeof window !== 'undefined')
        ? (window.PK = window.PK || {})
        : (root.PK = root.PK || {});

    // Index 0..12 -> rank. rankVal = index + 2 (so '2'=2 ... 'A'=14).
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const SUITS = ['s', 'h', 'd', 'c'];
    const SUIT_GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' }; // ♠ ♥ ♦ ♣
    const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

    function rankValOf(rank) {
        return RANKS.indexOf(rank) + 2;
    }

    function colorOf(suit) {
        return (suit === 'h' || suit === 'd') ? 'red' : 'black';
    }

    function makeCard(rank, suit) {
        return {
            rank: rank,
            suit: suit,
            rankVal: rankValOf(rank),
            color: colorOf(suit)
        };
    }

    // A stable string id like 'As', 'Td', '2c' — used as map keys / dedupe.
    function cardId(card) {
        return card.rank + card.suit;
    }

    function buildDeck() {
        const deck = [];
        for (let s = 0; s < SUITS.length; s++) {
            for (let r = 0; r < RANKS.length; r++) {
                deck.push(makeCard(RANKS[r], SUITS[s]));
            }
        }
        return deck;
    }

    // Fisher–Yates. Accepts an optional rng() in [0,1) for deterministic tests.
    function shuffle(deck, rng) {
        rng = rng || Math.random;
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }
        return deck;
    }

    // A tiny dealer over a freshly shuffled deck. `draw(n)` pops n cards.
    function createDealer(rng) {
        const deck = shuffle(buildDeck(), rng);
        let idx = 0;
        return {
            draw(n) {
                if (n == null) return deck[idx++];
                const out = [];
                for (let i = 0; i < n; i++) out.push(deck[idx++]);
                return out;
            },
            remaining() { return deck.length - idx; }
        };
    }

    const Cards = {
        RANKS,
        SUITS,
        SUIT_GLYPH,
        SUIT_NAME,
        rankValOf,
        colorOf,
        makeCard,
        cardId,
        buildDeck,
        shuffle,
        createDealer
    };

    PK.Cards = Cards;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Cards;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
