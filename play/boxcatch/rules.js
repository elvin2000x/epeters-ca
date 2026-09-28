/* ============================================================================
   boxcatch/rules.js — pure line-and-box engine (no DOM, no PK, injectable rng).
   Shared by index.html (browser), bot_test.js (Node), and server/games/boxcatch.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6.

   Geometry (all plain numbers in plain arrays — the state is JSON over the wire):
     horizontal edge (r,c): r in [0, rows], c in [0, cols)   index = r*cols + c
     vertical   edge (r,c): r in [0, rows), c in [0, cols]   index = r*(cols+1) + c
     box            (r,c): r in [0, rows), c in [0, cols)    index = r*cols + c
     box (r,c) is bounded by h(r,c) top · h(r+1,c) bottom · v(r,c) left · v(r,c+1) right

   THE RULE THAT DEFINES THIS GAME: a move that completes 1 or 2 boxes claims them
   and leaves `turn` UNCHANGED (the mover goes again, `chain` grows). Only a
   zero-capture move rotates the turn. Transports must take `turn` from the state
   returned by applyMove and never compute "next seat" themselves.

   rng(n) -> uniform int in [0,n): crypto in prod, forced in tests. The only random
   decision in the game is the starting seat (plus AI tie-breaks). No Math.random().
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") { globalThis.BOXCATCH_RULES = M; globalThis.BOXCATCH = M; }
})(this, function () {
  "use strict";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function int(v) { var n = Number(v); return isFinite(n) ? Math.floor(n) : NaN; }

  /* ------------------------------------------------------ geometry helpers -- */
  function edgeCount(cols, rows) { return (rows + 1) * cols + rows * (cols + 1); }
  function hIndex(cols, r, c) { return r * cols + c; }
  function vIndex(cols, r, c) { return r * (cols + 1) + c; }
  function boxIndex(cols, r, c) { return r * cols + c; }
  function boxRC(cols, bi) { return { r: Math.floor(bi / cols), c: bi % cols }; }

  // top, bottom, left, right — the four sides of a box, in that fixed order.
  function boxEdges(cols, rows, bi) {
    var p = boxRC(cols, bi);
    return [
      { dir: "h", r: p.r, c: p.c },
      { dir: "h", r: p.r + 1, c: p.c },
      { dir: "v", r: p.r, c: p.c },
      { dir: "v", r: p.r, c: p.c + 1 }
    ];
  }

  // the 1 (border) or 2 (interior) boxes an edge belongs to.
  function boxesTouching(cols, rows, dir, r, c) {
    r = int(r); c = int(c);
    var out = [];
    if (dir === "h") {
      if (!(c >= 0 && c < cols)) return out;
      if (r - 1 >= 0 && r - 1 < rows) out.push(boxIndex(cols, r - 1, c));
      if (r >= 0 && r < rows) out.push(boxIndex(cols, r, c));
    } else if (dir === "v") {
      if (!(r >= 0 && r < rows)) return out;
      if (c - 1 >= 0 && c - 1 < cols) out.push(boxIndex(cols, r, c - 1));
      if (c >= 0 && c < cols) out.push(boxIndex(cols, r, c));
    }
    return out;
  }

  function inRange(cols, rows, dir, r, c) {
    r = int(r); c = int(c);
    if (!isFinite(r) || !isFinite(c)) return false;
    if (dir === "h") return r >= 0 && r <= rows && c >= 0 && c < cols;
    if (dir === "v") return r >= 0 && r < rows && c >= 0 && c <= cols;
    return false;
  }

  /* --------------------------------------------------------- board helpers --
     Every one of these accepts a `state` OR a `publicView` — the view is a shaped
     passthrough, so the renderer, the AI and the engine share the same code. */
  function edgeDrawn(b, dir, r, c) {
    r = int(r); c = int(c);
    if (!inRange(b.cols, b.rows, dir, r, c)) return false;
    return (dir === "h" ? b.h[hIndex(b.cols, r, c)] : b.v[vIndex(b.cols, r, c)]) === 1;
  }
  function setEdge(b, dir, r, c, val) {
    if (dir === "h") b.h[hIndex(b.cols, r, c)] = val; else b.v[vIndex(b.cols, r, c)] = val;
  }
  function boxSides(b, bi) {
    var e = boxEdges(b.cols, b.rows, bi), n = 0, i;
    for (i = 0; i < 4; i++) if (edgeDrawn(b, e[i].dir, e[i].r, e[i].c)) n++;
    return n;
  }

  // canonical order: every horizontal edge by index, then every vertical edge by index.
  function legalMoves(b) {
    var out = [], r, c;
    for (r = 0; r <= b.rows; r++) for (c = 0; c < b.cols; c++)
      if (b.h[hIndex(b.cols, r, c)] !== 1) out.push({ type: "line", dir: "h", r: r, c: c });
    for (r = 0; r < b.rows; r++) for (c = 0; c <= b.cols; c++)
      if (b.v[vIndex(b.cols, r, c)] !== 1) out.push({ type: "line", dir: "v", r: r, c: c });
    return out;
  }

  function isLegalEdge(b, move) {
    if (!move || (move.type != null && move.type !== "line")) return false;
    if (move.dir !== "h" && move.dir !== "v") return false;
    var r = int(move.r), c = int(move.c);
    if (!inRange(b.cols, b.rows, move.dir, r, c)) return false;
    return !edgeDrawn(b, move.dir, r, c);
  }

  // boxes that would reach four sides if `move` were played now (0, 1 or 2).
  function boxesCompletedBy(b, move) {
    if (!isLegalEdge(b, move)) return [];
    var t = boxesTouching(b.cols, b.rows, move.dir, int(move.r), int(move.c)), out = [], i;
    for (i = 0; i < t.length; i++) if (boxSides(b, t[i]) === 3) out.push(t[i]);
    return out;
  }

  function scores(b) {
    var n = b.numPlayers, s = [], i;
    for (i = 0; i < n; i++) s.push(0);
    for (i = 0; i < b.owners.length; i++) { var o = b.owners[i]; if (o >= 0 && o < n) s[o]++; }
    return s;
  }
  function leaders(b) {
    var s = scores(b), best = -1, out = [], i;
    for (i = 0; i < s.length; i++) if (s[i] > best) best = s[i];
    for (i = 0; i < s.length; i++) if (s[i] === best) out.push(i);
    return out;
  }

  function sidesArray(b) {
    var n = b.cols * b.rows, a = new Array(n), i;
    for (i = 0; i < n; i++) a[i] = boxSides(b, i);
    return a;
  }

  // legal moves after which NO box on the board sits on exactly 3 drawn sides.
  function safeMoves(b) {
    var sides = sidesArray(b), threes = 0, i, j;
    for (i = 0; i < sides.length; i++) if (sides[i] === 3) threes++;
    var ms = legalMoves(b), out = [];
    for (i = 0; i < ms.length; i++) {
      var t = boxesTouching(b.cols, b.rows, ms[i].dir, ms[i].r, ms[i].c), after = threes;
      for (j = 0; j < t.length; j++) {
        var s = sides[t[j]];
        if (s === 3) after--; else if (s === 2) after++;
      }
      if (after === 0) out.push(ms[i]);
    }
    return out;
  }

  // boxes a pure-greedy opponent takes in the cascade immediately after `move`.
  // Deterministic: it always plays the first capturing move in canonical order.
  function sacrificeCost(b, move) {
    if (!isLegalEdge(b, move)) return 0;
    var w = { cols: b.cols, rows: b.rows, h: b.h.slice(), v: b.v.slice() };
    setEdge(w, move.dir, int(move.r), int(move.c), 1);
    var cost = 0, guard = w.h.length + w.v.length + 2;
    while (guard-- > 0) {
      var ms = legalMoves(w), hit = null, k;
      for (k = 0; k < ms.length; k++) {
        var d = boxesCompletedBy(w, ms[k]);
        if (d.length) { hit = { m: ms[k], n: d.length }; break; }
      }
      if (!hit) break;
      setEdge(w, hit.m.dir, hit.m.r, hit.m.c, 1);
      cost += hit.n;
    }
    return cost;
  }

  /* ---------------------------------------------------------------- config -- */
  function clampPlayers(n) { n = int(n); if (!(n >= 2)) return 2; return n > 6 ? 6 : n; }
  function clampGrid(n) { n = int(n); if (!(n >= 3)) return 3; return n > 9 ? 9 : n; }
  // createState accepts 1..9 so tiny boards (2x1) stay constructible for tests and
  // edge cases; anything outside that, or non-numeric, falls back through clampGrid
  // / the 6x6 default. The UI only ever offers the documented 3..9 range.
  function gridOpt(v, def) {
    var n = Number(v);
    if (!isFinite(n)) return def;
    n = Math.floor(n);
    if (n < 1 || n > 9) return clampGrid(n);
    return n;
  }

  /* --------------------------------------------------- PROTOCOL §9 contract -- */
  function createState(options, rng) {
    options = options || {};
    var cols = gridOpt(options.cols, 6), rows = gridOpt(options.rows, 6);
    var raw = options.numPlayers != null ? options.numPlayers
      : (options.players != null ? options.players : 2);
    var numPlayers = clampPlayers(raw);
    var nh = (rows + 1) * cols, nv = rows * (cols + 1), nb = cols * rows;
    var h = [], v = [], owners = [], sc = [], i;
    for (i = 0; i < nh; i++) h.push(0);
    for (i = 0; i < nv; i++) v.push(0);
    for (i = 0; i < nb; i++) owners.push(-1);
    for (i = 0; i < numPlayers; i++) sc.push(0);

    var start;
    if (options.startSeat != null && isFinite(Number(options.startSeat))) {
      start = Math.floor(Number(options.startSeat));
      if (!(start >= 0 && start < numPlayers)) start = 0;
    } else {
      start = (typeof rng === "function") ? rng(numPlayers) : 0;   // never Math.random()
    }

    return {
      cols: cols, rows: rows, numPlayers: numPlayers,
      h: h, v: v, owners: owners, scores: sc,
      turn: start, startSeat: start, chain: 0,
      edgesLeft: nh + nv, moveCount: 0,
      lastMove: null, over: false, result: null
    };
  }

  // Perfect information: a shaped DEEP COPY passthrough + yourSeat. Nothing to
  // redact — but the copy is mandatory so no caller can mutate authoritative state.
  function publicView(state, seat) {
    return {
      cols: state.cols, rows: state.rows, numPlayers: state.numPlayers,
      h: state.h.slice(), v: state.v.slice(),
      owners: state.owners.slice(), scores: state.scores.slice(),
      turn: state.turn, startSeat: state.startSeat, chain: state.chain,
      edgesLeft: state.edgesLeft, moveCount: state.moveCount,
      lastMove: state.lastMove ? clone(state.lastMove) : null,
      over: state.over, result: state.result ? clone(state.result) : null,
      yourSeat: (seat === null || seat === undefined) ? null : seat
    };
  }

  function applyMove(state, seat, move, rng) {   // eslint-disable-line no-unused-vars
    if (state.over) return { ok: false, reason: "game_over" };
    if (int(seat) !== state.turn) return { ok: false, reason: "not_your_turn" };
    if (!move || move.type !== "line" || (move.dir !== "h" && move.dir !== "v"))
      return { ok: false, reason: "bad_move" };
    var r = int(move.r), c = int(move.c);
    if (!inRange(state.cols, state.rows, move.dir, r, c)) return { ok: false, reason: "out_of_range" };
    if (edgeDrawn(state, move.dir, r, c)) return { ok: false, reason: "edge_taken" };

    var mover = state.turn;
    var done = boxesCompletedBy(state, { type: "line", dir: move.dir, r: r, c: c });
    var next = clone(state), i;

    setEdge(next, move.dir, r, c, 1);
    next.edgesLeft -= 1;
    next.moveCount += 1;

    var events = [{ type: "line", seat: mover, dir: move.dir, r: r, c: c, boxes: done.slice() }];
    for (i = 0; i < done.length; i++) { next.owners[done[i]] = mover; next.scores[mover] += 1; }

    if (done.length > 0) {
      next.chain += done.length;                       // THE EXTRA TURN: `turn` untouched
      events.push({ type: "claimed", seat: mover, boxes: done.slice(), chain: next.chain });
    } else {
      next.chain = 0;
      next.turn = (mover + 1) % next.numPlayers;
      events.push({ type: "turn", seat: next.turn });
    }
    next.lastMove = { seat: mover, dir: move.dir, r: r, c: c, boxes: done.slice() };

    if (next.edgesLeft === 0) {
      next.over = true;
      var win = leaders(next);
      next.result = {
        kind: win.length === 1 ? "win" : "draw",
        winner: win.length === 1 ? win[0] : null,
        winners: win,
        scores: next.scores.slice(),
        boxes: next.cols * next.rows
      };
      events.push({ type: "gameOver", result: next.result });
    }
    return { ok: true, state: next, events: events };
  }

  function isTerminal(state) {
    if (!state.over) return null;
    return { over: true, result: state.result, reason: state.result ? state.result.kind : "over" };
  }

  /* -------------------------------------------------------------------- AI -- */
  function pick(arr, rng) {
    if (!arr.length) return null;
    if (typeof rng === "function") return arr[rng(arr.length)];
    return arr[0];
  }

  // "Chainer": take the most boxes -> play safe -> cheapest sacrifice. rng only breaks ties.
  function boxAI(view, rng) {
    var ms = legalMoves(view);
    if (!ms.length) return null;
    var best = 0, caps = [], i, n;
    for (i = 0; i < ms.length; i++) {
      n = boxesCompletedBy(view, ms[i]).length;
      if (n > best) { best = n; caps = [ms[i]]; }
      else if (n > 0 && n === best) caps.push(ms[i]);
    }
    if (caps.length) return pick(caps, rng);

    var safe = safeMoves(view);
    if (safe.length) return pick(safe, rng);

    var min = Infinity, cheap = [];
    for (i = 0; i < ms.length; i++) {
      var cost = sacrificeCost(view, ms[i]);
      if (cost < min) { min = cost; cheap = [ms[i]]; }
      else if (cost === min) cheap.push(ms[i]);
    }
    return pick(cheap, rng);
  }

  function randomAI(view, rng) {
    var ms = legalMoves(view);
    if (!ms.length) return null;
    return pick(ms, rng);
  }

  return {
    id: "boxcatch", minPlayers: 2, maxPlayers: 6,
    // PROTOCOL §9 contract
    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,
    // geometry
    edgeCount: edgeCount, hIndex: hIndex, vIndex: vIndex, boxIndex: boxIndex, boxRC: boxRC,
    boxEdges: boxEdges, boxesTouching: boxesTouching, inRange: inRange,
    // board (state OR view)
    edgeDrawn: edgeDrawn, boxSides: boxSides, legalMoves: legalMoves, isLegalEdge: isLegalEdge,
    boxesCompletedBy: boxesCompletedBy, scores: scores, leaders: leaders,
    safeMoves: safeMoves, sacrificeCost: sacrificeCost, sidesArray: sidesArray,
    // config + AI
    clampPlayers: clampPlayers, clampGrid: clampGrid, boxAI: boxAI, randomAI: randomAI
  };
});
