/* ============================================================================
   fourfall/rules.js — pure four-in-a-row-on-a-gravity-grid engine. No DOM, no PK.
   Shared by index.html (browser), bot_test.js (Node), and server/games/fourfall.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6.

   Geometry pinned (SPEC §5/§6):
     • cols=7, rows=6, connect=4 -> 42 cells. idx = row*cols + col.
     • ROW 0 IS THE BOTTOM ROW (gravity's natural origin). The renderer flips.
     • A cell holds -1 (empty), 0 (seat 0) or 1 (seat 1).
     • heights[c] = discs in column c = the row index the next disc lands on.
     • Win = `connect` or more of one seat in a line: h, v, d1 (col+1,row+1) or
       d2 (col+1,row-1). Bounds are checked in 2-D (col/row), NEVER by raw index
       arithmetic — a 1-D i±1 walk wraps row edges and reports phantom wins.
     • Draw = every cell filled with no line. A win beats a full board.
     • Match = first to `target` game-wins; draws score nothing; the opening seat
       flips every game (moving first is a real edge on this board).

   rng(n) -> uniform int in [0,n): crypto in prod, forced in tests. The ONLY
   randomness is (a) the game-1 opening coin toss and (b) AI tie-breaking.
   The engine is parameterised on cols/rows/connect (clamped) so it is provably
   general; only the 7x6 connect:4 board ships in the UI.
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") {
    globalThis.FOURFALL_RULES = M;
    globalThis.FOURFALL = M;            // convenience alias
  }
})(this, function () {
  "use strict";

  var CONFIG = {
    cols: 7, rows: 6, connect: 4, target: 3,
    depths: { easy: 1, medium: 4, hard: 6 },
    limits: { cols: [4, 12], rows: [4, 12], connect: [3, 6], target: [1, 9] }
  };

  var EMPTY = -1;
  var WIN_SCORE = 1e6;
  var INF = Infinity;

  // h, v, d1 (up-right), d2 (down-right). Order matters: findWin and scanWin
  // both report the first direction in THIS order, so they can never disagree.
  var DIRS = [
    { k: "h", dc: 1, dr: 0 },
    { k: "v", dc: 0, dr: 1 },
    { k: "d1", dc: 1, dr: 1 },
    { k: "d2", dc: 1, dr: -1 }
  ];

  /* ------------------------------------------------------------- utilities */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function toInt(v) {
    if (typeof v === "number" && isFinite(v)) return Math.floor(v);
    if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) return Math.floor(Number(v));
    return null;
  }
  function clampOpt(v, range, dflt) {
    var n = toInt(v);
    if (n === null) return dflt;
    return n < range[0] ? range[0] : n > range[1] ? range[1] : n;
  }
  function isSeat(s) { return s === 0 || s === 1; }
  // A column index must be a genuine integer in range — '3', 3.5, null all fail.
  function isColIndex(v, cols) {
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 0 && v < cols;
  }
  function cfgOf(c) {
    c = c || {};
    return {
      cols: toInt(c.cols) || CONFIG.cols,
      rows: toInt(c.rows) || CONFIG.rows,
      connect: toInt(c.connect) || CONFIG.connect
    };
  }
  function clampPlayers() { return 2; }   // always exactly two seats

  /* ------------------------------------------------- geometry + board helpers */
  function createBoard(cols, rows) {
    cols = toInt(cols) || CONFIG.cols;
    rows = toInt(rows) || CONFIG.rows;
    var b = new Array(cols * rows);
    for (var i = 0; i < b.length; i++) b[i] = EMPTY;
    return b;
  }
  function idx(col, row, cols) { return row * (toInt(cols) || CONFIG.cols) + col; }
  function colOf(i, cols) { cols = toInt(cols) || CONFIG.cols; return i % cols; }
  function rowOf(i, cols) { cols = toInt(cols) || CONFIG.cols; return Math.floor(i / cols); }

  function dropRow(board, col, cols, rows) {
    cols = toInt(cols) || CONFIG.cols;
    rows = toInt(rows) || Math.floor(board.length / cols);
    if (!isColIndex(col, cols)) return -1;
    for (var r = 0; r < rows; r++) if (board[r * cols + col] === EMPTY) return r;
    return -1;
  }
  function boardFull(board) {
    for (var i = 0; i < board.length; i++) if (board[i] === EMPTY) return false;
    return true;
  }
  function heightsOf(board, cols, rows) {
    cols = toInt(cols) || CONFIG.cols;
    rows = toInt(rows) || Math.floor(board.length / cols);
    var h = [];
    for (var c = 0; c < cols; c++) {
      var n = 0;
      for (var r = 0; r < rows; r++) if (board[r * cols + c] !== EMPTY) n = r + 1;
      h.push(n);
    }
    return h;
  }
  function legalCols(state) {
    var out = [];
    for (var c = 0; c < state.cols; c++) if (state.heights[c] < state.rows) out.push(c);
    return out;
  }
  function isLegalCol(state, col) {
    return isColIndex(col, state.cols) && state.heights[col] < state.rows;
  }
  // centre-out column order: 3,2,4,1,5,0,6 for 7 columns (better alpha-beta pruning)
  var _order = {};
  function centreOrder(cols) {
    if (_order[cols]) return _order[cols];
    var mid = (cols - 1) / 2, a = [];
    for (var c = 0; c < cols; c++) a.push(c);
    a.sort(function (x, y) {
      var d = Math.abs(x - mid) - Math.abs(y - mid);
      return d !== 0 ? d : x - y;
    });
    _order[cols] = a;
    return a;
  }

  /* --------------------------------------------------------- win detection */
  // Incremental: scan only the four ray-pairs through cell `i`. 2-D bounds.
  function findWin(board, i, cfg) {
    var C = cfgOf(cfg), cols = C.cols, rows = C.rows, need = C.connect;
    if (!(i >= 0 && i < board.length)) return null;
    var seat = board[i];
    if (!isSeat(seat)) return null;
    var c0 = i % cols, r0 = (i - c0) / cols;
    for (var d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d].dc, dr = DIRS[d].dr, line = [i], c, r;
      c = c0 + dc; r = r0 + dr;
      while (c >= 0 && c < cols && r >= 0 && r < rows && board[r * cols + c] === seat) {
        line.push(r * cols + c); c += dc; r += dr;
      }
      c = c0 - dc; r = r0 - dr;
      while (c >= 0 && c < cols && r >= 0 && r < rows && board[r * cols + c] === seat) {
        line.unshift(r * cols + c); c -= dc; r -= dr;
      }
      if (line.length >= need) return { seat: seat, line: line, dir: DIRS[d].k };
    }
    return null;
  }

  // Brute-force oracle: every run start, every direction. Same direction order as
  // findWin so the two agree cell-for-cell on any legally reachable position.
  function scanWin(board, cfg) {
    var C = cfgOf(cfg), cols = C.cols, rows = C.rows, need = C.connect;
    for (var d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d].dc, dr = DIRS[d].dr;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var seat = board[r * cols + c];
        if (!isSeat(seat)) continue;
        var pc = c - dc, pr = r - dr;
        if (pc >= 0 && pc < cols && pr >= 0 && pr < rows && board[pr * cols + pc] === seat) continue;
        var line = [], cc = c, rr = r;
        while (cc >= 0 && cc < cols && rr >= 0 && rr < rows && board[rr * cols + cc] === seat) {
          line.push(rr * cols + cc); cc += dc; rr += dr;
        }
        if (line.length >= need) return { seat: seat, line: line, dir: DIRS[d].k };
      }
    }
    return null;
  }

  // The column that completes `connect` for `seat` right now, centre-out, else -1.
  function immediateWinCol(board, seat, cfg) {
    var C = cfgOf(cfg), b = board.slice(), order = centreOrder(C.cols);
    for (var k = 0; k < order.length; k++) {
      var col = order[k], r = dropRow(b, col, C.cols, C.rows);
      if (r < 0) continue;
      var i = r * C.cols + col;
      b[i] = seat;
      var w = findWin(b, i, C);
      b[i] = EMPTY;
      if (w) return col;
    }
    return -1;
  }

  /* --------------------------------------------- PROTOCOL §9: state lifecycle */
  function createState(options, rng) {
    options = options || {};
    rng = typeof rng === "function" ? rng : function () { return 0; };
    var L = CONFIG.limits;
    var cols = clampOpt(options.cols, L.cols, CONFIG.cols);
    var rows = clampOpt(options.rows, L.rows, CONFIG.rows);
    var connect = clampOpt(options.connect, L.connect, CONFIG.connect);
    if (connect > cols) connect = cols;
    if (connect > rows) connect = rows;
    var target = clampOpt(options.target, L.target, CONFIG.target);

    var startSeat = isSeat(options.startSeat) ? options.startSeat : (rng(2) === 0 ? 0 : 1);

    // continuation fields, so a match can carry its scoreline into the next game
    var scores = [0, 0];
    if (Array.isArray(options.scores) && options.scores.length === 2) {
      scores = [Math.max(0, toInt(options.scores[0]) || 0), Math.max(0, toInt(options.scores[1]) || 0)];
    }
    var draws = Math.max(0, toInt(options.draws) || 0);
    var gameNo = Math.max(1, toInt(options.gameNo) || 1);

    return {
      cols: cols, rows: rows, connect: connect,
      board: createBoard(cols, rows),
      heights: new Array(cols).fill(0),
      turn: startSeat,
      startSeat: startSeat,
      moves: [],
      lastDrop: null,
      scores: scores,
      draws: draws,
      gameNo: gameNo,
      target: target,
      over: false,
      result: null
    };
  }

  // Perfect information: no redaction is possible or needed. This is a SHAPED
  // PASSTHROUGH — a deep copy of the whole state plus `you`, and nothing else.
  // It still must exist and still must deep-copy: PROTOCOL §9 calls it before
  // every `state` send, and the copy stops a caller ever holding a live
  // reference to canonical state. (Any per-seat difference here would be a bug.)
  function publicView(state, seat) {
    var v = clone(state);
    v.you = isSeat(seat) ? seat : null;
    return v;
  }

  function settleMatch(n, winner) {
    n.scores[winner] += 1;
    if (n.scores[winner] >= n.target) { n.result.matchOver = true; n.result.matchWinner = winner; }
  }

  function applyMove(state, seat, move, rng) {   // eslint-disable-line no-unused-vars
    // rejection order is pinned by SPEC §6 and asserted by bot_test
    if (state.over) return { ok: false, reason: "game_over" };
    if (!isSeat(seat)) return { ok: false, reason: "not_a_player" };
    var type = move && move.type;
    if (type !== "drop" && type !== "resign") return { ok: false, reason: "bad_move" };

    var n, events;

    if (type === "resign") {
      // deliberately accepted OUT OF TURN — you may concede while waiting
      n = clone(state);
      n.over = true;
      n.result = { kind: "resign", winner: 1 - seat, line: null, dir: null, matchOver: false, matchWinner: null };
      settleMatch(n, 1 - seat);
      events = [{ type: "resigned", seat: seat }, { type: "gameOver", result: n.result }];
      return { ok: true, state: n, events: events };
    }

    if (seat !== state.turn) return { ok: false, reason: "not_your_turn" };
    var col = move.col;
    if (!isColIndex(col, state.cols)) return { ok: false, reason: "bad_column" };
    if (state.heights[col] >= state.rows) return { ok: false, reason: "column_full" };

    n = clone(state);
    var row = n.heights[col];
    var i = row * n.cols + col;
    n.board[i] = seat;
    n.heights[col] = row + 1;
    n.moves.push(col);
    n.lastDrop = { col: col, row: row, idx: i, seat: seat };
    events = [{ type: "dropped", seat: seat, col: col, row: row, idx: i }];

    var win = findWin(n.board, i, n);
    if (win) {                                   // a win beats a full board
      n.over = true;
      n.result = { kind: "win", winner: seat, line: win.line.slice(), dir: win.dir, matchOver: false, matchWinner: null };
      settleMatch(n, seat);
      events.push({ type: "gameOver", result: n.result });
    } else if (boardFull(n.board)) {
      n.over = true;
      n.draws += 1;
      n.result = { kind: "draw", winner: null, line: null, dir: null, matchOver: false, matchWinner: null };
      events.push({ type: "gameOver", result: n.result });
    } else {
      n.turn = 1 - seat;
    }
    return { ok: true, state: n, events: events };
  }

  function isTerminal(state) {
    if (!state || !state.over) return null;
    var kind = state.result ? state.result.kind : null;
    var reason = kind === "win" ? "four" : kind === "draw" ? "full" : kind === "resign" ? "resign" : "over";
    return { over: true, result: state.result, reason: reason };
  }

  /* ------------------------------------------------------------- match flow */
  function nextGame(state) {
    var n = clone(state);
    if (state.result && state.result.matchOver) return n;   // no-op guard: offer "New match" instead
    n.board = createBoard(n.cols, n.rows);
    n.heights = new Array(n.cols).fill(0);
    n.moves = [];
    n.lastDrop = null;
    n.over = false;
    n.result = null;
    n.gameNo = (n.gameNo || 1) + 1;
    n.startSeat = 1 - n.startSeat;      // moving first alternates every game
    n.turn = n.startSeat;
    return n;
  }

  /* ------------------------------------------------------------------- AI --- */
  // Windowed heuristic. Pre-computed window tables keep the depth-6 search fast.
  var _windows = {}, _weights = {};
  function windowsFor(C) {
    var k = C.cols + "x" + C.rows + "x" + C.connect;
    if (_windows[k]) return _windows[k];
    var out = [], need = C.connect;
    for (var d = 0; d < DIRS.length; d++) {
      var dc = DIRS[d].dc, dr = DIRS[d].dr;
      for (var r = 0; r < C.rows; r++) for (var c = 0; c < C.cols; c++) {
        var ec = c + (need - 1) * dc, er = r + (need - 1) * dr;
        if (ec < 0 || ec >= C.cols || er < 0 || er >= C.rows) continue;
        var win = [];
        for (var n = 0; n < need; n++) win.push((r + n * dr) * C.cols + (c + n * dc));
        out.push(win);
      }
    }
    _windows[k] = out;
    return out;
  }
  function weightsFor(C) {
    var k = C.cols + "x" + C.rows;
    if (_weights[k]) return _weights[k];
    var mid = (C.cols - 1) / 2, w = new Array(C.cols * C.rows);
    for (var r = 0; r < C.rows; r++) for (var c = 0; c < C.cols; c++) {
      var dist = Math.abs(c - mid);
      w[r * C.cols + c] = dist < 0.5 ? 6 : dist < 1.5 ? 3 : 0;
    }
    _weights[k] = w;
    return w;
  }

  function evaluate(board, seat, cfg) {
    var C = cfgOf(cfg), opp = 1 - seat, s = 0;
    var wins = windowsFor(C), need = C.connect, i, j;
    for (i = 0; i < wins.length; i++) {
      var win = wins[i], mine = 0, theirs = 0, empty = 0;
      for (j = 0; j < need; j++) {
        var v = board[win[j]];
        if (v === seat) mine++;
        else if (v === opp) theirs++;
        else empty++;
      }
      if (mine === need) s += 100000;
      else if (theirs === need) s -= 100000;
      else if (mine === need - 1 && empty === 1) s += 50;
      else if (mine === need - 2 && empty === 2) s += 10;
      else if (theirs === need - 1 && empty === 1) s -= 80;   // defence weighted above offence
      else if (theirs === need - 2 && empty === 2) s -= 10;
    }
    var w = weightsFor(C);
    for (i = 0; i < board.length; i++) {
      if (board[i] === seat) s += w[i];
      else if (board[i] === opp) s -= w[i];
    }
    return s;
  }

  // Negamax + alpha-beta on a scratch board (make/undo). `seat` is to move.
  // A win found at depth `ply` scores WIN_SCORE - ply, so the engine prefers
  // faster wins and slower losses. A full board scores 0.
  function negamax(b, h, seat, depth, alpha, beta, C, ply, order) {
    if (depth <= 0) return evaluate(b, seat, C);
    var best = -INF, any = false;
    for (var k = 0; k < order.length; k++) {
      var col = order[k], r = h[col];
      if (r >= C.rows) continue;
      any = true;
      var i = r * C.cols + col;
      b[i] = seat; h[col] = r + 1;
      var v;
      if (findWin(b, i, C)) v = WIN_SCORE - ply;
      else v = -negamax(b, h, 1 - seat, depth - 1, -beta, -alpha, C, ply + 1, order);
      b[i] = EMPTY; h[col] = r;
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return any ? best : 0;                       // no legal column = full board = draw
  }

  function aiMove(view, opts, rng) {
    opts = opts || {};
    rng = typeof rng === "function" ? rng : function () { return 0; };
    var C = cfgOf(view);
    var board = (view.board || []).slice();
    var heights = (view.heights ? view.heights.slice() : heightsOf(board, C.cols, C.rows));
    var me = isSeat(view.turn) ? view.turn : (isSeat(view.you) ? view.you : 0);
    var opp = 1 - me;
    var full = centreOrder(C.cols);
    var order = full.filter(function (c) { return heights[c] < C.rows; });
    if (!order.length) return { type: "drop", col: full[0] };   // defensive: board full

    // 1. forced moves, before any search, at every tier
    var w = immediateWinCol(board, me, C);
    if (w >= 0) return { type: "drop", col: w };
    var blk = immediateWinCol(board, opp, C);
    if (blk >= 0) return { type: "drop", col: blk };

    // 2. search — hard depth cap per tier (the game is solved; unbounded = joyless)
    var depth = CONFIG.depths[opts.difficulty] || CONFIG.depths.medium;
    var centreBonus = weightsFor(C);            // row 0 of the table === the per-column weight
    var scored = [];
    for (var k = 0; k < order.length; k++) {
      var col = order[k], r = heights[col], i = r * C.cols + col;
      board[i] = me; heights[col] = r + 1;
      var v;
      if (findWin(board, i, C)) v = WIN_SCORE;
      else v = -negamax(board, heights, opp, depth - 1, -INF, INF, C, 1, full) + centreBonus[col];
      board[i] = EMPTY; heights[col] = r;
      scored.push({ col: col, v: v });
    }

    // 3. tie-break with the injectable rng (equal positions vary game to game)
    if (opts.difficulty === "easy") {
      var top = scored.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
      return { type: "drop", col: top[rng(top.length)].col };
    }
    var best = -INF;
    for (var m = 0; m < scored.length; m++) if (scored[m].v > best) best = scored[m].v;
    var bucket = scored.filter(function (s) { return s.v >= best - 1; }).map(function (s) { return s.col; });
    return { type: "drop", col: bucket.length > 1 ? bucket[rng(bucket.length)] : bucket[0] };
  }

  /* ------------------------------------------------ test / debug helpers ---- */
  // lines are TOP ROW FIRST. '.' empty, 'x' seat 0, 'o' seat 1.
  function parseBoard(lines, cfg) {
    if (!Array.isArray(lines) || !lines.length) throw new Error("parseBoard: no lines");
    var rows = lines.length, cols = String(lines[0]).length;
    if (cols < 1) throw new Error("parseBoard: empty row");
    var connect = (cfg && toInt(cfg.connect)) || Math.min(CONFIG.connect, cols, rows);
    var board = createBoard(cols, rows), li, c, r;
    for (li = 0; li < rows; li++) {
      var s = String(lines[li]);
      if (s.length !== cols) throw new Error("parseBoard: ragged row " + li);
      r = rows - 1 - li;                                   // top line = highest row
      for (c = 0; c < cols; c++) {
        var ch = s.charAt(c), val;
        if (ch === "." || ch === " " || ch === "_") val = EMPTY;
        else if (ch === "x" || ch === "X") val = 0;
        else if (ch === "o" || ch === "O") val = 1;
        else throw new Error("parseBoard: bad character '" + ch + "'");
        board[r * cols + c] = val;
      }
    }
    var heights = [], nx = 0, no = 0;
    for (c = 0; c < cols; c++) {
      var h = 0, sawEmpty = false;
      for (r = 0; r < rows; r++) {
        var v = board[r * cols + c];
        if (v === EMPTY) { sawEmpty = true; continue; }
        if (sawEmpty) throw new Error("parseBoard: floating disc in column " + c);
        h = r + 1;
        if (v === 0) nx++; else no++;
      }
      heights.push(h);
    }
    if (Math.abs(nx - no) > 1) throw new Error("parseBoard: illegal disc count (" + nx + " vs " + no + ")");
    return { board: board, heights: heights, cols: cols, rows: rows, connect: connect };
  }

  function renderAscii(board, cfg) {
    var cols = (cfg && toInt(cfg.cols)) || CONFIG.cols;
    var rows = (cfg && toInt(cfg.rows)) || Math.floor(board.length / cols);
    var out = [];
    for (var li = 0; li < rows; li++) {
      var r = rows - 1 - li, s = "";
      for (var c = 0; c < cols; c++) {
        var v = board[r * cols + c];
        s += v === 0 ? "x" : v === 1 ? "o" : ".";
      }
      out.push(s);
    }
    return out;
  }

  return {
    id: "fourfall", minPlayers: 2, maxPlayers: 2, CONFIG: CONFIG,
    // PROTOCOL §9 contract
    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,
    // geometry + board helpers
    createBoard: createBoard, idx: idx, colOf: colOf, rowOf: rowOf,
    dropRow: dropRow, boardFull: boardFull, heightsOf: heightsOf,
    legalCols: legalCols, isLegalCol: isLegalCol, centreOrder: centreOrder,
    // win detection
    findWin: findWin, scanWin: scanWin, immediateWinCol: immediateWinCol,
    // match flow
    nextGame: nextGame,
    // AI
    evaluate: evaluate, aiMove: aiMove,
    // test/debug helpers
    parseBoard: parseBoard, renderAscii: renderAscii, clone: clone, clampPlayers: clampPlayers
  };
});
