/* ============================================================================
   liars-cup/rules.js — pure hidden-dice bluffing engine (no DOM, no PK).
   Shared by index.html (browser), bot_test.js (Node), and server/games/liars-cup.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6.
   rng(n) -> uniform int in [0,n): crypto in prod, forced in tests. Never Math.random().

   HIDDEN INFORMATION: publicView() is built by WHITELIST CONSTRUCTION. There is no
   code path that copies `state.dice` into a view except `reveal.dice`, which is
   public by design (the one moment per round the whole table is known).
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") {
    globalThis.LIARS_CUP_RULES = M;
    globalThis.LIARSCUP = M;           // short browser alias
  }
})(this, function () {
  "use strict";

  var DICE_PER_PLAYER = 5;
  var MIN_PLAYERS = 2, MAX_PLAYERS = 6;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function isInt(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v; }

  /* ---------------------------------------------------------- pure helpers */

  function clampPlayers(n) {
    n = Math.floor(Number(n));
    if (!(n >= MIN_PLAYERS)) return MIN_PLAYERS;
    return n > MAX_PLAYERS ? MAX_PLAYERS : n;
  }

  // rollDice(3, n => 0) -> [1,1,1];  rollDice(3, n => n-1) -> [6,6,6]
  function rollDice(count, rng) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(rng(6) + 1);
    return out;
  }

  function aliveSeats(state) {
    var out = [];
    for (var s = 0; s < state.alive.length; s++) if (state.alive[s]) out.push(s);
    return out;
  }

  function nextActiveSeat(state, from) {
    var n = state.alive.length;
    for (var i = 1; i <= n; i++) {
      var s = (((from + i) % n) + n) % n;
      if (state.alive[s]) return s;
    }
    return from;                       // defensive: no alive seat (never in a live game)
  }

  // every ALIVE seat's dice, flattened
  function collectDice(state) {
    var out = [];
    for (var s = 0; s < state.dice.length; s++) {
      if (!state.alive[s]) continue;
      for (var i = 0; i < state.dice[s].length; i++) out.push(state.dice[s][i]);
    }
    return out;
  }

  // ones are wild for every face EXCEPT ones themselves (a 1 never double-counts)
  function countFace(dice, face, wildOnes) {
    var c = 0;
    for (var i = 0; i < dice.length; i++) {
      var d = dice[i];
      if (d === face) c++;
      else if (wildOnes && face !== 1 && d === 1) c++;
    }
    return c;
  }

  function totalDice(state) {
    var t = 0;
    for (var s = 0; s < state.diceCount.length; s++) if (state.alive[s]) t += state.diceCount[s];
    return t;
  }

  function bidShapeOk(bid) {
    if (!bid || typeof bid !== "object") return false;
    if (!isInt(bid.quantity) || bid.quantity < 1) return false;
    if (!isInt(bid.face) || bid.face < 1 || bid.face > 6) return false;
    return true;
  }

  /* Bid ordering — the whole game. opts = { wildOnes, totalDice }.
     wildOnes === false  -> plain lexicographic (quantity, then face).
     wildOnes === true   -> four transitions:
       nonAce -> nonAce : q > pq   or (q === pq and f > pf)
       nonAce -> ace    : q >= ceil(pq / 2)      (ones HALVE, rounded up)
       ace    -> ace    : q > pq
       ace    -> nonAce : q >= 2*pq + 1          (leaving ones DOUBLES + 1)          */
  function isBidLegal(prev, next, opts) {
    opts = opts || {};
    var wild = opts.wildOnes !== false;
    var cap = (opts.totalDice === null || opts.totalDice === undefined) ? Infinity : opts.totalDice;
    if (!bidShapeOk(next)) return false;
    if (next.quantity > cap) return false;
    if (prev === null || prev === undefined) return true;      // opening bid
    var pq = prev.quantity, pf = prev.face, q = next.quantity, f = next.face;
    if (!wild) return q > pq || (q === pq && f > pf);
    if (pf !== 1 && f !== 1) return q > pq || (q === pq && f > pf);
    if (pf !== 1 && f === 1) return q >= Math.ceil(pq / 2);
    if (pf === 1 && f === 1) return q > pq;
    return q >= 2 * pq + 1;
  }

  // Every shape-valid raise. May legitimately be EMPTY -> dudo is the only legal move.
  function legalBids(prev, opts) {
    opts = opts || {};
    var cap = (opts.totalDice === null || opts.totalDice === undefined) ? 0 : opts.totalDice;
    var out = [];
    for (var q = 1; q <= cap; q++) {
      for (var f = 1; f <= 6; f++) {
        var b = { quantity: q, face: f };
        if (isBidLegal(prev, b, opts)) out.push(b);
      }
    }
    return out;
  }

  // Smallest legal quantity for `face`, or null when that face has no legal raise. (UI helper.)
  function minQuantityFor(prev, face, opts) {
    opts = opts || {};
    var cap = (opts.totalDice === null || opts.totalDice === undefined) ? 0 : opts.totalDice;
    for (var q = 1; q <= cap; q++) if (isBidLegal(prev, { quantity: q, face: face }, opts)) return q;
    return null;
  }

  function resolveChallenge(state) {
    var bid = state.bid;
    var actual = countFace(collectDice(state), bid.face, state.wildOnes);
    var bidMet = actual >= bid.quantity;
    var challengerSeat = state.turn;
    var bidderSeat = bid.seat;
    return {
      actual: actual, bidMet: bidMet,
      bidderSeat: bidderSeat, challengerSeat: challengerSeat,
      loserSeat: bidMet ? challengerSeat : bidderSeat
    };
  }

  /* --------------------------------------------- PROTOCOL §9: createState */

  function createState(options, rng) {
    options = options || {};
    var raw = options.numPlayers !== null && options.numPlayers !== undefined ? options.numPlayers
      : (options.players !== null && options.players !== undefined ? options.players : 4);
    var numPlayers = clampPlayers(raw);
    var v = options.variant || {};
    var variant = {
      wildOnes: v.wildOnes === undefined ? true : !!v.wildOnes,
      obliga: !!v.obliga,
      paloCiego: !!v.paloCiego
    };
    var dice = [], diceCount = [], alive = [];
    for (var s = 0; s < numPlayers; s++) {
      dice.push(rollDice(DICE_PER_PLAYER, rng));
      diceCount.push(DICE_PER_PLAYER);
      alive.push(true);
    }
    return {
      numPlayers: numPlayers, dicePerPlayer: DICE_PER_PLAYER, variant: variant,
      dice: dice, diceCount: diceCount, alive: alive,
      phase: "bidding", round: 1,
      wildOnes: variant.wildOnes, obligaRound: false, blindSeats: [],
      bid: null, history: [], turn: 0, starter: 0,
      reveal: null, over: false, result: null
    };
  }

  /* ---------------------------------------------- PROTOCOL §7: publicView */

  function publicView(state, seat) {
    var isPlayer = (seat !== null && seat !== undefined && seat >= 0 && seat < state.numPlayers);
    var blindList = state.blindSeats ? state.blindSeats.slice() : [];
    var blind = isPlayer && blindList.indexOf(seat) >= 0;

    // ONLY this seat's own dice ever reach the view, and only while it is alive + sighted.
    var mine = [];
    if (isPlayer && state.alive[seat] && !blind) {
      var own = state.dice[seat] || [];
      for (var i = 0; i < own.length; i++) mine.push(own[i]);
    }

    // The reveal is public by design — the one broadcast of the whole table, per round.
    var rev = null;
    if (state.reveal) {
      var r = state.reveal, rd = [];
      for (var s = 0; s < r.dice.length; s++) rd.push(r.dice[s].slice());
      rev = {
        bid: { seat: r.bid.seat, quantity: r.bid.quantity, face: r.bid.face },
        actual: r.actual, bidMet: r.bidMet, wildOnes: r.wildOnes,
        bidderSeat: r.bidderSeat, challengerSeat: r.challengerSeat,
        loserSeat: r.loserSeat, eliminated: r.eliminated, dice: rd
      };
    }

    var hist = [];
    for (var h = 0; h < state.history.length; h++) {
      var b = state.history[h];
      hist.push({ seat: b.seat, quantity: b.quantity, face: b.face });
    }

    return {
      numPlayers: state.numPlayers,
      dicePerPlayer: state.dicePerPlayer,
      variant: {
        wildOnes: state.variant.wildOnes, obliga: state.variant.obliga, paloCiego: state.variant.paloCiego
      },
      yourSeat: isPlayer ? seat : null,
      yourDice: mine,
      blind: !!blind,
      alive: isPlayer ? !!state.alive[seat] : false,   // YOUR aliveness
      aliveFlags: state.alive.slice(),                 // per-seat, public (counts already imply it)
      diceCounts: state.diceCount.slice(),
      totalDice: totalDice(state),
      phase: state.phase, round: state.round,
      wildOnes: state.wildOnes, obligaRound: !!state.obligaRound,
      blindSeats: blindList,
      bid: state.bid ? { seat: state.bid.seat, quantity: state.bid.quantity, face: state.bid.face } : null,
      history: hist,
      turn: state.turn, starter: state.starter,
      reveal: rev,                                     // null while bidding; the whole table at reveal
      over: !!state.over,
      result: state.result ? { winner: state.result.winner, reason: state.result.reason } : null
    };
  }

  /* ------------------------------------------------ PROTOCOL §9: applyMove */

  function applyMove(state, seat, move, rng) {
    if (state.over) return { ok: false, reason: "game_over" };
    if (!move || !move.type) return { ok: false, reason: "bad_move" };
    var type = move.type;

    /* ---------------------------------------------------------------- bid */
    if (type === "bid") {
      if (state.phase !== "bidding") return { ok: false, reason: "wrong_phase" };
      if (!state.alive[seat]) return { ok: false, reason: "eliminated" };
      if (seat !== state.turn) return { ok: false, reason: "not_your_turn" };
      var cand = { quantity: move.quantity, face: move.face };
      if (!bidShapeOk(cand)) return { ok: false, reason: "bad_move" };
      var total = totalDice(state);
      if (!isBidLegal(state.bid, cand, { wildOnes: state.wildOnes, totalDice: total })) {
        return { ok: false, reason: "bid_too_low" };
      }
      var nb = clone(state);
      var entry = { seat: seat, quantity: cand.quantity, face: cand.face };
      nb.bid = { seat: seat, quantity: cand.quantity, face: cand.face };
      nb.history.push(entry);
      nb.turn = nextActiveSeat(nb, seat);
      return {
        ok: true, state: nb,
        events: [{ type: "bid", seat: seat, quantity: cand.quantity, face: cand.face }]
      };
    }

    /* --------------------------------------------------------------- dudo */
    if (type === "dudo") {
      if (state.phase !== "bidding") return { ok: false, reason: "wrong_phase" };
      if (!state.alive[seat]) return { ok: false, reason: "eliminated" };
      if (seat !== state.turn) return { ok: false, reason: "not_your_turn" };
      if (!state.bid) return { ok: false, reason: "no_bid" };
      if (seat === state.bid.seat) return { ok: false, reason: "own_bid" };

      var res = resolveChallenge(state);
      var nd = clone(state);
      var snapshot = [];                       // every seat's dice AS THEY WERE at the challenge
      for (var s = 0; s < state.dice.length; s++) snapshot.push(state.dice[s].slice());

      var loser = res.loserSeat;
      nd.dice[loser].pop();
      nd.diceCount[loser] = nd.dice[loser].length;
      var eliminated = null;
      if (nd.diceCount[loser] === 0) { nd.alive[loser] = false; eliminated = loser; }

      nd.reveal = {
        bid: { seat: state.bid.seat, quantity: state.bid.quantity, face: state.bid.face },
        actual: res.actual, bidMet: res.bidMet, wildOnes: state.wildOnes,
        bidderSeat: res.bidderSeat, challengerSeat: res.challengerSeat,
        loserSeat: loser, eliminated: eliminated, dice: snapshot
      };
      nd.phase = "reveal";
      // Park `turn` on the seat that will OPEN the next round (always alive), so the
      // reveal-acknowledging {type:'next'} has an obvious, legal sender in every driver.
      nd.turn = nd.alive[loser] ? loser : nextActiveSeat(nd, loser);

      var evs = [{
        type: "revealed", bid: nd.reveal.bid, actual: res.actual, bidMet: res.bidMet,
        loserSeat: loser, eliminated: eliminated
      }];
      if (eliminated !== null) evs.push({ type: "eliminated", seat: eliminated });

      var still = aliveSeats(nd);
      if (still.length <= 1) {
        nd.phase = "over"; nd.over = true;
        nd.result = { winner: still.length ? still[0] : null, reason: "last_standing" };
        evs.push({ type: "gameOver", winner: nd.result.winner });
      }
      return { ok: true, state: nd, events: evs };
    }

    /* --------------------------------------------------------------- next */
    if (type === "next") {
      if (state.phase !== "reveal") return { ok: false, reason: "wrong_phase" };
      if (!state.alive[seat]) return { ok: false, reason: "eliminated" };

      var nx = clone(state);
      var lost = state.reveal.loserSeat;
      var starter = state.alive[lost] ? lost : nextActiveSeat(state, lost);

      // Obliga: the die just lost took a seat from 2 dice to exactly 1 -> ones stop
      // being wild for exactly this one round.
      var obliga = !!(state.variant.obliga && state.alive[lost] && state.diceCount[lost] === 1);

      nx.round = state.round + 1;
      nx.bid = null;
      nx.history = [];
      nx.reveal = null;
      nx.phase = "bidding";
      nx.starter = starter;
      nx.turn = starter;
      nx.obligaRound = obliga;
      nx.wildOnes = obliga ? false : state.variant.wildOnes;

      for (var t = 0; t < nx.numPlayers; t++) {
        nx.dice[t] = nx.alive[t] ? rollDice(nx.diceCount[t], rng) : [];
        nx.diceCount[t] = nx.dice[t].length;
      }

      // Palo ciego: every alive seat down to its final die plays blind (publicView hides
      // that die from its OWN owner).
      var blinds = [];
      if (state.variant.paloCiego) {
        for (var u = 0; u < nx.numPlayers; u++) if (nx.alive[u] && nx.diceCount[u] === 1) blinds.push(u);
      }
      nx.blindSeats = blinds;

      return {
        ok: true, state: nx,
        events: [{
          type: "round", round: nx.round, starter: starter,
          obligaRound: nx.obligaRound, wildOnes: nx.wildOnes
        }]
      };
    }

    return { ok: false, reason: "bad_move" };
  }

  function isTerminal(state) {
    if (!state.over) return null;
    return {
      over: true,
      result: state.result ? { winner: state.result.winner, reason: state.result.reason } : null,
      reason: state.result ? state.result.reason : "over"
    };
  }

  /* ------------------------------------------------- AI: probability, no search */

  function bidAI(view, rng) {
    rng = rng || function () { return 0; };
    var mine = view.yourDice || [];                 // [] when blind (palo ciego) or eliminated
    var total = view.totalDice;
    var unknown = Math.max(0, total - mine.length);
    var wild = !!view.wildOnes;
    var opts = { wildOnes: wild, totalDice: total };

    function expected(f) {
      var p = (wild && f !== 1) ? 2 / 6 : 1 / 6;
      return countFace(mine, f, wild) + unknown * p;
    }
    function held(f) { return countFace(mine, f, false); }
    function clampQ(q) { return Math.min(total, Math.max(1, q)); }

    /* ---- opening: never dudo ---- */
    if (!view.bid) {
      var bestF = 1, bestScore = -Infinity, bestHeld = -1;
      for (var f = 1; f <= 6; f++) {
        var e = expected(f), h = held(f);
        if (e > bestScore + 1e-9 ||
           (Math.abs(e - bestScore) < 1e-9 && (h > bestHeld || (h === bestHeld && rng(2) === 0)))) {
          bestScore = e; bestF = f; bestHeld = h;
        }
      }
      return { type: "bid", quantity: clampQ(Math.max(1, Math.round(expected(bestF) - 0.5))), face: bestF };
    }

    /* ---- a bid stands ---- */
    var lb = legalBids(view.bid, opts);
    if (!lb.length) return { type: "dudo" };                 // ladder exhausted -> dudo is forced

    var slack = expected(view.bid.face) - view.bid.quantity;
    if (slack < -1.0) return { type: "dudo" };               // the bid outran the table

    // cheapest raise on the face with the best expected-vs-cost margin
    var best = null;
    for (var i = 0; i < lb.length; i++) {
      var b = lb[i], sc = expected(b.face) - b.quantity;
      if (!best || sc > best.sc + 1e-9 || (Math.abs(sc - best.sc) < 1e-9 && b.quantity < best.b.quantity)) {
        best = { b: b, sc: sc };
      }
    }

    // small rng-driven bluff: sometimes raise on a face we hold none of, so we are not readable
    if (rng(6) === 0) {
      var bluffs = [];
      for (var j = 0; j < lb.length; j++) {
        if (held(lb[j].face) === 0 && lb[j].quantity <= best.b.quantity + 2) bluffs.push(lb[j]);
      }
      if (bluffs.length) { var pick = bluffs[rng(bluffs.length)]; return { type: "bid", quantity: pick.quantity, face: pick.face }; }
    }

    return { type: "bid", quantity: best.b.quantity, face: best.b.face };
  }

  /* ------------------------------------------------------------------ exports */
  return {
    id: "liars-cup", minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS,
    DICE_PER_PLAYER: DICE_PER_PLAYER,

    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,

    clampPlayers: clampPlayers, rollDice: rollDice, collectDice: collectDice,
    countFace: countFace, totalDice: totalDice,
    isBidLegal: isBidLegal, legalBids: legalBids, minQuantityFor: minQuantityFor,
    resolveChallenge: resolveChallenge, aliveSeats: aliveSeats, nextActiveSeat: nextActiveSeat,
    bidAI: bidAI
  };
});
