/* ============================================================================
   dominoes/rules.js — pure double-six dominoes engine (no DOM).
   Shared by index.html (browser), bot_test.js (Node), and server/games/dominoes.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6.
   rng(n) -> uniform int in [0,n): crypto in prod, forced in tests.
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") globalThis.DOMINOES_RULES = M;
})(this, function () {
  "use strict";

  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var tileEq = function (t, u) { return (t[0] === u[0] && t[1] === u[1]) || (t[0] === u[1] && t[1] === u[0]); };

  // ---- pure helpers ----------------------------------------------------------
  function makeSet() {
    var s = [];
    for (var a = 0; a <= 6; a++) for (var b = a; b <= 6; b++) s.push([a, b]);
    return s; // 28 tiles, a<=b
  }
  function pipSum(t) { return t[0] + t[1]; }
  function handPips(h) { return h.reduce(function (n, t) { return n + pipSum(t); }, 0); }
  function isDouble(t) { return t[0] === t[1]; }
  function tileMatchesEnd(t, endVal) { return t[0] === endVal || t[1] === endVal; }
  function otherPip(t, endVal) { return t[0] === endVal ? t[1] : t[0]; } // the pip that becomes the new open end

  function clampPlayers(n) { n = Math.floor(Number(n)); if (!(n >= 2)) return 2; return n > 4 ? 4 : n; }
  function handSizeFor(numPlayers) { return numPlayers <= 2 ? 7 : 5; }

  // legal plays for a hand given the two open ends (or the opening tile when ends===null)
  function legalPlays(hand, ends, opening) {
    var out = [];
    if (ends === null) {
      // opening: only the designated opening tile, played on 'right'
      for (var i = 0; i < hand.length; i++) if (opening && tileEq(hand[i], opening)) out.push({ tile: hand[i], end: "right" });
      return out;
    }
    for (var j = 0; j < hand.length; j++) {
      var t = hand[j];
      if (tileMatchesEnd(t, ends[0])) out.push({ tile: t, end: "left" });
      if (tileMatchesEnd(t, ends[1])) out.push({ tile: t, end: "right" });
    }
    return out;
  }
  function hasLegalPlay(hand, ends, opening) { return legalPlays(hand, ends, opening).length > 0; }

  function chooseOpener(hands) {
    // highest double (6-6 down to 0-0)
    for (var d = 6; d >= 0; d--)
      for (var s = 0; s < hands.length; s++)
        for (var i = 0; i < hands[s].length; i++)
          if (hands[s][i][0] === d && hands[s][i][1] === d) return { seat: s, tile: hands[s][i] };
    // else heaviest single tile (max pipSum; ties -> first seat, first such tile)
    var best = null;
    for (var s2 = 0; s2 < hands.length; s2++)
      for (var k = 0; k < hands[s2].length; k++) {
        var ps = pipSum(hands[s2][k]);
        if (!best || ps > best.ps) best = { seat: s2, tile: hands[s2][k], ps: ps };
      }
    return { seat: best.seat, tile: best.tile };
  }

  function scoreDomino(state, winnerSeat) {
    var pts = 0;
    for (var s = 0; s < state.numPlayers; s++) if (s !== winnerSeat) pts += handPips(state.hands[s]);
    return pts;
  }
  function resolveBlocked(state) {
    var best = null; // lowest handPips wins; tie -> fewest tiles; still tied -> null
    for (var s = 0; s < state.numPlayers; s++) {
      var pips = handPips(state.hands[s]), cnt = state.hands[s].length;
      if (!best) { best = { seat: s, pips: pips, cnt: cnt, tie: false }; continue; }
      if (pips < best.pips || (pips === best.pips && cnt < best.cnt)) best = { seat: s, pips: pips, cnt: cnt, tie: false };
      else if (pips === best.pips && cnt === best.cnt) best.tie = true;
    }
    if (best.tie) return { winner: null, points: 0 };
    var pts = 0;
    for (var s2 = 0; s2 < state.numPlayers; s2++) if (s2 !== best.seat) pts += handPips(state.hands[s2]);
    return { winner: best.seat, points: pts };
  }

  // ---- PROTOCOL §9 contract ---------------------------------------------------
  function shuffle(arr, rng) { // Fisher–Yates via injectable rng
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) { j = rng(i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function createState(options, rng) {
    options = options || {};
    var numPlayers = clampPlayers(options.numPlayers || options.players || 2);
    var variant = options.variant === "block" ? "block" : "draw";
    var target = options.target || 100;
    var deck = shuffle(makeSet(), rng);
    var hs = handSizeFor(numPlayers);
    var hands = [];
    for (var s = 0; s < numPlayers; s++) hands.push(deck.slice(s * hs, s * hs + hs));
    var boneyard = deck.slice(numPlayers * hs);
    var op = chooseOpener(hands);
    return {
      variant: variant, numPlayers: numPlayers,
      hands: hands, boneyard: boneyard,
      layout: [], ends: null,
      turn: op.seat, passes: 0,
      opener: op.seat, openingTile: op.tile,
      scores: (options.scores && options.scores.length === numPlayers) ? options.scores.slice() : new Array(numPlayers).fill(0),
      target: target, over: false, result: null,
    };
  }

  function publicView(state, seat) {
    // own hand full; all other hands -> counts; boneyard -> count
    var counts = state.hands.map(function (h) { return h.length; });
    return {
      variant: state.variant, numPlayers: state.numPlayers,
      yourSeat: (seat === null || seat === undefined) ? null : seat,
      yourHand: (seat === null || seat === undefined) ? [] : state.hands[seat].slice(),
      handCounts: counts,
      boneyardCount: state.boneyard.length,
      layout: state.layout.slice(),
      ends: state.ends ? state.ends.slice() : null,
      opening: state.ends === null ? state.openingTile.slice() : null,
      turn: state.turn, passes: state.passes,
      opener: state.opener,
      scores: state.scores.slice(), target: state.target,
      over: state.over, result: state.result,
    };
  }

  function endHand(next, kind, winner, points) {
    next.over = true;
    var matchOver = false, matchWinner = null;
    if (winner !== null) {
      next.scores[winner] += points;
      if (next.scores[winner] >= next.target) { matchOver = true; matchWinner = winner; }
    }
    next.result = { kind: kind, winner: winner, points: points, matchOver: matchOver, matchWinner: matchWinner };
  }

  function applyMove(state, seat, move, rng) {
    if (state.over) return { ok: false, reason: "game_over" };
    if (seat !== state.turn) return { ok: false, reason: "not_your_turn" };
    if (!move || !move.type) return { ok: false, reason: "bad_move" };
    var next = clone(state), events = [], hand = next.hands[seat];

    if (move.type === "play") {
      if (!move.tile) return { ok: false, reason: "bad_move" };
      // must hold the tile
      var idx = -1;
      for (var i = 0; i < hand.length; i++) if (tileEq(hand[i], move.tile)) { idx = i; break; }
      if (idx < 0) return { ok: false, reason: "not_in_hand" };
      var tile = hand[idx];

      if (next.ends === null) {
        // opening move: only the opening tile, on 'right'
        if (!tileEq(tile, next.openingTile)) return { ok: false, reason: "must_open_with_opener" };
        hand.splice(idx, 1);
        next.layout = [{ tile: tile.slice(), double: isDouble(tile) }];
        next.ends = [tile[0], tile[1]];
      } else {
        var side = move.end === "left" ? 0 : move.end === "right" ? 1 : -1;
        if (side < 0) return { ok: false, reason: "bad_end" };
        var endVal = next.ends[side];
        if (!tileMatchesEnd(tile, endVal)) return { ok: false, reason: "no_match" };
        hand.splice(idx, 1);
        var newEnd = otherPip(tile, endVal);
        var cell = { tile: tile.slice(), double: isDouble(tile) };
        if (side === 0) next.layout.unshift(cell); else next.layout.push(cell);
        next.ends[side] = newEnd;
      }
      next.passes = 0;
      events.push({ type: "played", seat: seat, tile: tile.slice(), end: move.end || "right" });

      if (hand.length === 0) { endHand(next, "domino", seat, scoreDomino(next, seat)); events.push({ type: "handOver", result: next.result }); return { ok: true, state: next, events: events }; }
      next.turn = (seat + 1) % next.numPlayers;
      return { ok: true, state: next, events: events };
    }

    if (move.type === "draw") {
      if (next.variant !== "draw") return { ok: false, reason: "no_draw_in_block" };
      if (next.boneyard.length === 0) return { ok: false, reason: "boneyard_empty" };
      if (hasLegalPlay(hand, next.ends, next.ends === null ? next.openingTile : null)) return { ok: false, reason: "must_play" };
      var drawn = next.boneyard.shift();
      hand.push(drawn);
      // turn + passes unchanged
      events.push({ type: "drew", seat: seat }); // count-only for others; tile is private in the new state
      return { ok: true, state: next, events: events };
    }

    if (move.type === "pass") {
      var opening = next.ends === null ? next.openingTile : null;
      if (hasLegalPlay(hand, next.ends, opening)) return { ok: false, reason: "must_play" };
      if (next.variant === "draw" && next.boneyard.length > 0) return { ok: false, reason: "must_draw" };
      next.passes += 1;
      next.turn = (seat + 1) % next.numPlayers;
      events.push({ type: "passed", seat: seat });
      if (next.passes >= next.numPlayers) {
        var r = resolveBlocked(next);
        endHand(next, r.winner === null ? "draw" : "blocked", r.winner, r.points);
        events.push({ type: "handOver", result: next.result });
      }
      return { ok: true, state: next, events: events };
    }

    return { ok: false, reason: "bad_move" };
  }

  function isTerminal(state) {
    if (!state.over) return null;
    return { over: true, result: state.result, reason: state.result ? state.result.kind : "over" };
  }

  // ---- AI --------------------------------------------------------------------
  function greedyAI(view) {
    var plays = legalPlays(view.yourHand, view.ends, view.opening);
    if (plays.length) {
      // highest pipSum; tie -> doubles first
      plays.sort(function (a, b) {
        var d = pipSum(b.tile) - pipSum(a.tile);
        if (d !== 0) return d;
        return (isDouble(b.tile) ? 1 : 0) - (isDouble(a.tile) ? 1 : 0);
      });
      var p = plays[0];
      return { type: "play", tile: p.tile.slice(), end: p.end };
    }
    if (view.variant === "draw" && view.boneyardCount > 0) return { type: "draw" };
    return { type: "pass" };
  }

  return {
    id: "dominoes", minPlayers: 2, maxPlayers: 4,
    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,
    makeSet: makeSet, pipSum: pipSum, handPips: handPips, tileMatchesEnd: tileMatchesEnd,
    legalPlays: legalPlays, hasLegalPlay: hasLegalPlay, chooseOpener: chooseOpener,
    resolveBlocked: resolveBlocked, scoreDomino: scoreDomino, greedyAI: greedyAI,
    handSizeFor: handSizeFor, clampPlayers: clampPlayers, isDouble: isDouble, otherPip: otherPip,
  };
});
