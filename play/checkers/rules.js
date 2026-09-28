/* ============================================================================
   checkers/rules.js — pure English-draughts (American checkers) engine. No DOM.
   Shared by index.html (browser), bot_test.js (Node), and server/games/checkers.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6.

   Rules pinned (WCDF English draughts):
     • 8x8, dark squares only, PDN numbering 1..32, 12 men a side.
     • BLACK (seat 0) moves first. Black men move DOWN (row 0 -> row 7, promote 29-32).
       White men move UP (row 7 -> row 0, promote 1-4).
     • Forced captures are MANDATORY (any-capture rule: must jump, your choice which,
       NOT obliged to the longest chain).
     • Multi-jumps are ONE move; only maximal chains per branch are legal.
     • CROWN ENDS THE TURN — a man landing on its back rank is crowned and stops,
       even mid-chain, even if a further jump exists.
     • SHORT kings (one square, any diagonal). No flying kings.
     • Win: opponent has no pieces, or no legal move. Draw: 80 quiet plies (40 per
       side with no capture / no man move / no promotion), or threefold repetition.

   rng(n) -> uniform int in [0,n). The game itself is fully deterministic — rng is
   threaded only for PROTOCOL signature compliance and AI tie-breaking.
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") globalThis.CHECKERS_RULES = M;
})(this, function () {
  "use strict";

  /* ---------------------------------------------------- board numbering ---- */
  // Playable = dark squares where (row+col)%2===1, numbered left->right, top->bottom.
  var SQ_RC = [null];            // SQ_RC[sq] = {r,c}   (sq 1..32)
  var RC_SQ = [];                // RC_SQ[r][c] = sq or 0 (light square)
  (function () {
    var n = 0;
    for (var r = 0; r < 8; r++) {
      RC_SQ.push([]);
      for (var c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) { n++; RC_SQ[r].push(n); SQ_RC[n] = { r: r, c: c }; }
        else RC_SQ[r].push(0);
      }
    }
  })();

  function sqToRC(sq) { sq = Number(sq); return (sq >= 1 && sq <= 32) ? { r: SQ_RC[sq].r, c: SQ_RC[sq].c } : null; }
  function rcToSq(r, c) { if (!(r >= 0 && r <= 7 && c >= 0 && c <= 7)) return null; var s = RC_SQ[r][c]; return s || null; }

  var DIR_B = [[1, -1], [1, 1]];                      // black men: forward = down
  var DIR_W = [[-1, -1], [-1, 1]];                    // white men: forward = up
  var DIR_K = [[1, -1], [1, 1], [-1, -1], [-1, 1]];   // kings: all four
  var PROMO_ROW = { b: 7, w: 0 };
  var CENTER = { 14: 1, 15: 1, 18: 1, 19: 1 };
  var DRAW_PLIES = 80; // 40 moves per side

  function other(color) { return color === "b" ? "w" : "b"; }
  // seat 0 = Black, seat 1 = White. A colour is also accepted as a seat token because
  // net-kit's LocalNet passes `state.turn` straight through as the seat.
  function colorOfSeat(seat) {
    if (seat === 0 || seat === "0") return "b";
    if (seat === 1 || seat === "1") return "w";
    if (seat === "b" || seat === "w") return seat;
    return null;
  }
  function seatOfColor(color) { return color === "b" ? 0 : color === "w" ? 1 : null; }
  function isPromoSq(color, sq) { return SQ_RC[sq].r === PROMO_ROW[color]; }
  function dirsFor(color, king) { return king ? DIR_K : (color === "b" ? DIR_B : DIR_W); }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function clampPlayers() { return 2; }

  /* ------------------------------------------------------- state builders -- */
  function emptyBoard() { var b = new Array(32); for (var i = 0; i < 32; i++) b[i] = null; return b; }

  function emptyState(turn) {
    return { board: emptyBoard(), turn: turn === "w" ? "w" : "b", ply: 0, quiet: 0, history: [], winner: null, reason: null, over: false };
  }

  // Test/debug helper: place pieces from a spec, e.g. place(st, {b:[11], W:[18,20]})
  //   lowercase key = man ('b'/'w'), uppercase key = king ('B'/'W').
  function place(state, spec) {
    Object.keys(spec || {}).forEach(function (k) {
      var color = k.toLowerCase() === "b" ? "b" : "w";
      var king = k === k.toUpperCase();
      (spec[k] || []).forEach(function (sq) { state.board[sq - 1] = { color: color, king: king }; });
    });
    return state;
  }

  function createState(options, rng) {   // eslint-disable-line no-unused-vars
    var st = emptyState("b");            // Black moves first (opposite of chess)
    for (var s = 1; s <= 12; s++) st.board[s - 1] = { color: "b", king: false };
    for (var t = 21; t <= 32; t++) st.board[t - 1] = { color: "w", king: false };
    return st;
  }

  function publicView(state, seat) {
    // Perfect-information game: nothing to redact. Shaped passthrough clone.
    var v = clone(state);
    v.yourSeat = (seat === null || seat === undefined) ? null : seat;
    v.yourColor = colorOfSeat(v.yourSeat);
    v.turnSeat = seatOfColor(state.turn);
    v.counts = pieceCounts(state);
    return v;
  }

  function pieceCounts(state) {
    var out = { b: 0, w: 0, bk: 0, wk: 0 };
    for (var i = 0; i < 32; i++) {
      var p = state.board[i]; if (!p) continue;
      out[p.color]++; if (p.king) out[p.color + "k"]++;
    }
    return out;
  }

  function posKey(state) {
    var s = "";
    for (var i = 0; i < 32; i++) {
      var p = state.board[i];
      s += p ? (p.color === "b" ? (p.king ? "B" : "b") : (p.king ? "W" : "w")) : ".";
    }
    return s + state.turn;
  }

  /* ---------------------------------------------------- move generation ---- */
  function mkMove(from, path, caps, promo) {
    return { from: from, to: path[path.length - 1], path: path.slice(), captures: caps.slice(), promo: !!promo };
  }

  // Recurse the jump chain from `sq`. `bd` has the moving piece LIFTED off its origin;
  // already-jumped pieces stay on the board (they block landings and can't be re-jumped)
  // per WCDF "jumped pieces are removed after the move is complete".
  function extendJumps(bd, sq, color, king, caps, path, out) {
    var rc = SQ_RC[sq], dirs = dirsFor(color, king), found = false;
    for (var i = 0; i < dirs.length; i++) {
      var dr = dirs[i][0], dc = dirs[i][1];
      var msq = rcToSq(rc.r + dr, rc.c + dc); if (!msq) continue;
      var lsq = rcToSq(rc.r + 2 * dr, rc.c + 2 * dc); if (!lsq) continue;
      var mid = bd[msq - 1];
      if (!mid || mid.color === color) continue;      // must jump an ENEMY piece
      if (caps.indexOf(msq) >= 0) continue;           // never jump the same piece twice
      if (bd[lsq - 1] !== null) continue;             // landing square must be empty
      found = true;
      var nc = caps.concat([msq]), np = path.concat([lsq]);
      if (!king && isPromoSq(color, lsq)) {
        out.push(mkMove(path[0], np, nc, true));      // CROWN ENDS THE TURN — stop here
      } else {
        var more = extendJumps(bd, lsq, color, king, nc, np, out);
        if (!more) out.push(mkMove(path[0], np, nc, false)); // maximal chain only
      }
    }
    return found;
  }

  function jumpsFrom(board, from) {
    var p = board[from - 1];
    if (!p) return [];
    var bd = board.slice();
    bd[from - 1] = null;                              // lift the mover
    var out = [];
    extendJumps(bd, from, p.color, p.king, [], [from], out);
    return out;
  }

  function slidesFrom(board, from) {
    var p = board[from - 1];
    if (!p) return [];
    var rc = SQ_RC[from], dirs = dirsFor(p.color, p.king), out = [];
    for (var i = 0; i < dirs.length; i++) {
      var t = rcToSq(rc.r + dirs[i][0], rc.c + dirs[i][1]);
      if (!t || board[t - 1] !== null) continue;
      out.push(mkMove(from, [from, t], [], !p.king && isPromoSq(p.color, t)));
    }
    return out;
  }

  // Core generator over a {board, turn} shape. FORCED-CAPTURE filtered.
  function genMoves(st) {
    var board = st.board, turn = st.turn, jumps = [], slides = [], i, p;
    for (i = 1; i <= 32; i++) {
      p = board[i - 1];
      if (!p || p.color !== turn) continue;
      var js = jumpsFrom(board, i);
      if (js.length) { jumps = jumps.concat(js); }
    }
    if (jumps.length) return jumps;                   // must jump
    for (i = 1; i <= 32; i++) {
      p = board[i - 1];
      if (!p || p.color !== turn) continue;
      slides = slides.concat(slidesFrom(board, i));
    }
    return slides;
  }

  function legalMoves(state) { return genMoves(state); }
  function legalMovesFrom(state, sq) {
    sq = Number(sq);
    return genMoves(state).filter(function (m) { return m.from === sq; });
  }
  function hasCapture(state) {
    var ms = genMoves(state);
    return ms.length > 0 && ms[0].captures.length > 0;
  }

  /* ------------------------------------------------------------- applying -- */
  // Light apply on {board, turn, quiet} — used by the search (cells are immutable,
  // so a shallow board copy is a safe new state).
  function step(st, mv) {
    var b = st.board.slice();
    var p = b[mv.from - 1];
    b[mv.from - 1] = null;
    for (var i = 0; i < mv.captures.length; i++) b[mv.captures[i] - 1] = null;
    b[mv.to - 1] = mv.promo ? { color: p.color, king: true } : p;
    var progress = mv.captures.length > 0 || !p.king || mv.promo;
    return { board: b, turn: other(st.turn), quiet: progress ? 0 : (st.quiet | 0) + 1 };
  }

  function applyMoveRaw(state, move) {
    var p = state.board[move.from - 1];
    var lite = step({ board: state.board, turn: state.turn, quiet: state.quiet | 0 }, move);
    var hist = Array.isArray(state.history) ? state.history.slice() : [];
    if (!hist.length) hist.push(posKey(state));   // seed with the pre-move position for threefold
    var next = {
      board: lite.board,
      turn: lite.turn,
      ply: (state.ply | 0) + 1,
      quiet: lite.quiet,
      history: hist,
      winner: null, reason: null, over: false,
      last: { from: move.from, to: move.to, path: move.path.slice(), captures: move.captures.slice(), promo: !!move.promo, color: p ? p.color : null }
    };
    next.history.push(posKey(next));
    var term = isTerminal(next);
    if (term && term.over) { next.over = true; next.winner = term.result; next.reason = term.reason; }
    return next;
  }

  function moveKey(from, path) { return from + ":" + path.join(","); }

  function matchMove(legal, move) {
    if (!move) return null;
    var from = Number(move.from);
    if (!(from >= 1 && from <= 32)) return null;
    var path = Array.isArray(move.path) ? move.path.map(Number) : null;
    if (path && path.length) {
      if (path[0] !== from) path = [from].concat(path);   // tolerate landings-only paths
      if (path.some(function (s) { return !(s >= 1 && s <= 32); })) return null;
      var key = moveKey(from, path);
      for (var i = 0; i < legal.length; i++) if (moveKey(legal[i].from, legal[i].path) === key) return legal[i];
      return null;
    }
    var to = Number(move.to);
    if (!(to >= 1 && to <= 32)) return null;
    var cands = legal.filter(function (m) { return m.from === from && m.to === to; });
    return cands.length === 1 ? cands[0] : null;        // ambiguous chains must be explicit
  }

  function applyMove(state, seat, move, rng) {   // eslint-disable-line no-unused-vars
    if (state.over) return { ok: false, reason: "game-over" };
    var t0 = isTerminal(state);
    if (t0 && t0.over) return { ok: false, reason: "game-over" };
    var color = colorOfSeat(seat);
    if (color === null) return { ok: false, reason: "not-your-turn" };
    if (move && move.type === "resign") return resign(state, seat);   // legal on either turn
    if (color !== state.turn) return { ok: false, reason: "not-your-turn" };
    var legal = genMoves(state);
    var chosen = matchMove(legal, move);
    if (!chosen) return { ok: false, reason: "illegal" };

    var next = applyMoveRaw(state, chosen);
    var events = [{
      type: "moved", seat: seat, color: color,
      from: chosen.from, to: chosen.to, path: chosen.path.slice(),
      captures: chosen.captures.slice(), promo: !!chosen.promo
    }];
    chosen.captures.forEach(function (sq) { events.push({ type: "captured", square: sq, color: other(color) }); });
    if (chosen.promo) events.push({ type: "crowned", square: chosen.to, color: color });
    if (next.over) events.push({ type: "gameOver", result: next.winner, reason: next.reason });
    return { ok: true, state: next, events: events };
  }

  function isTerminal(state) {
    if (state.over) return { over: true, result: state.winner, reason: state.reason };
    var turn = state.turn, foe = other(turn), mine = 0, theirs = 0;
    for (var i = 0; i < 32; i++) {
      var p = state.board[i]; if (!p) continue;
      if (p.color === turn) mine++; else theirs++;
    }
    if (mine === 0) return { over: true, result: foe, reason: "no-pieces" };
    if (theirs === 0) return { over: true, result: turn, reason: "no-pieces" };
    if (genMoves(state).length === 0) return { over: true, result: foe, reason: "no-moves" };
    if ((state.quiet | 0) >= DRAW_PLIES) return { over: true, result: "draw", reason: "40-move" };
    if (Array.isArray(state.history) && state.history.length) {
      var k = state.history[state.history.length - 1], n = 0;
      for (var j = 0; j < state.history.length; j++) if (state.history[j] === k) n++;
      if (n >= 3) return { over: true, result: "draw", reason: "threefold" };
    }
    return { over: false };
  }

  // Resignation is a state transform, not a board move (used by the Resign button).
  function resign(state, seat) {
    var color = colorOfSeat(seat);
    if (color === null) return { ok: false, reason: "bad-seat" };
    var next = clone(state);
    next.over = true; next.winner = other(color); next.reason = "resign";
    return { ok: true, state: next, events: [{ type: "gameOver", result: next.winner, reason: "resign" }] };
  }

  /* -------------------------------------------------------------- the AI --- */
  var WIN = 100000, INF = 1e9;

  function orderMoves(ms) {
    return ms.slice().sort(function (a, b) {
      var d = b.captures.length - a.captures.length;
      if (d) return d;
      return (b.promo ? 1 : 0) - (a.promo ? 1 : 0);
    });
  }

  // Static eval from WHITE's perspective, then flipped to the side to move.
  function evaluate(st, mobility) {
    var s = 0;
    for (var i = 0; i < 32; i++) {
      var p = st.board[i]; if (!p) continue;
      var rc = SQ_RC[i + 1], sq = i + 1;
      var v = p.king ? 160 : 100;
      if (!p.king) {
        v += (p.color === "b" ? rc.r : 7 - rc.r) * 6;                                  // advancement
        if ((p.color === "b" && rc.r === 0) || (p.color === "w" && rc.r === 7)) v += 8; // back-rank guard
        if (rc.c === 0 || rc.c === 7) v += 2;                                           // safe edge men
      }
      if (CENTER[sq]) v += 4;
      s += p.color === "w" ? v : -v;
    }
    s += (st.turn === "w" ? 1 : -1) * 2 * mobility;                                      // mobility
    return st.turn === "w" ? s : -s;
  }

  function negamax(st, depth, alpha, beta) {
    var moves = genMoves(st);
    if (!moves.length) return -(WIN + depth);          // no move => the side to move loses
    if (st.quiet >= DRAW_PLIES) return 0;
    if (depth <= 0) return evaluate(st, moves.length);
    moves = orderMoves(moves);
    var best = -INF;
    for (var i = 0; i < moves.length; i++) {
      var v = -negamax(step(st, moves[i]), depth - 1, -beta, -alpha);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function bestMove(state, depth, rng) {
    depth = Math.max(1, Math.min(12, depth | 0 || 4));
    var st = { board: state.board, turn: state.turn, quiet: state.quiet | 0 };
    var moves = orderMoves(genMoves(st));
    if (!moves.length) return null;
    if (moves.length === 1) return moves[0];
    var best = -INF, bucket = [];
    for (var i = 0; i < moves.length; i++) {
      var window = best === -INF ? -INF : best - 1;
      var v = -negamax(step(st, moves[i]), depth - 1, -INF, -window);
      if (v > best) { best = v; bucket = [moves[i]]; }
      else if (v === best) bucket.push(moves[i]);
    }
    if (bucket.length > 1 && typeof rng === "function") return bucket[rng(bucket.length)];
    return bucket[0];
  }

  function depthFor(difficulty) {
    return { easy: 2, medium: 4, hard: 6, expert: 8 }[difficulty] || 4;
  }

  /* ----------------------------------------------------------- notation ---- */
  function describeMove(mv, color) {
    var who = color === "b" ? "Black" : "White";
    var txt = who + " " + mv.from + (mv.captures.length ? "×" : "–") + mv.path.slice(1).join("×");
    if (mv.captures.length) txt += " (" + mv.captures.length + " captured)";
    if (mv.promo) txt += ", kings on " + mv.to;
    return txt;
  }

  return {
    id: "checkers", minPlayers: 2, maxPlayers: 2,
    // PROTOCOL §9 contract
    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,
    // pure helpers (UI + AI + tests)
    legalMoves: legalMoves, legalMovesFrom: legalMovesFrom, applyMoveRaw: applyMoveRaw,
    clone: clone, bestMove: bestMove, sqToRC: sqToRC, rcToSq: rcToSq,
    // extras
    emptyState: emptyState, place: place, posKey: posKey, pieceCounts: pieceCounts,
    hasCapture: hasCapture, jumpsFrom: jumpsFrom, slidesFrom: slidesFrom,
    resign: resign, depthFor: depthFor, describeMove: describeMove, evaluate: evaluate,
    colorOfSeat: colorOfSeat, seatOfColor: seatOfColor, other: other, clampPlayers: clampPlayers,
    DRAW_PLIES: DRAW_PLIES,
  };
});
