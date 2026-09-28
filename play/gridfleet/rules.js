/* ============================================================================
   gridfleet/rules.js — pure naval grid-guessing engine (no DOM, no PK).
   Shared by index.html (browser), bot_test.js (Node) and server/games/gridfleet.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6/§6a/§6b.

   rng(n) -> uniform int in [0,n): crypto in prod, forced in tests. Never Math.random.

   THE ONE INVARIANT: state.boards[s].ships is the only private data in the game.
   publicView(state, seat) exists to protect exactly that field — an entry for a
   board that is not yours (and not revealed) carries id/name/len/sunk and NOTHING
   positional, not even derived or encoded.
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") {
    globalThis.GRIDFLEET_RULES = M;
    globalThis.GRIDFLEET = M; // convenience alias
  }
})(this, function () {
  "use strict";

  /* ------------------------------------------------------------ constants */
  var SIZE = 10;

  var FLEET = Object.freeze([
    Object.freeze({ id: "flagship", name: "Flagship", len: 5 }),
    Object.freeze({ id: "cruiser",  name: "Cruiser",  len: 4 }),
    Object.freeze({ id: "frigate",  name: "Frigate",  len: 3 }),
    Object.freeze({ id: "corvette", name: "Corvette", len: 3 }),
    Object.freeze({ id: "cutter",   name: "Cutter",   len: 2 })
  ]);

  var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function key(r, c) { return r + "," + c; }
  function specFor(id) {
    for (var i = 0; i < FLEET.length; i++) if (FLEET[i].id === id) return FLEET[i];
    return null;
  }
  function totalCells() {
    var n = 0;
    for (var i = 0; i < FLEET.length; i++) n += FLEET[i].len;
    return n; // 17
  }

  /* ------------------------------------------------- geometry / placement */
  function inBounds(r, c) {
    return typeof r === "number" && typeof c === "number" &&
      isFinite(r) && isFinite(c) && r === Math.floor(r) && c === Math.floor(c) &&
      r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function lenOf(ship) {
    if (ship && typeof ship.len === "number") return ship.len;
    var s = specFor(ship && ship.id);
    return s ? s.len : 0;
  }

  // (r,c) is the BOW (topmost / leftmost cell); 'h' extends +c, 'v' extends +r.
  function cellsFor(ship) {
    var n = lenOf(ship), out = [], i;
    for (i = 0; i < n; i++) {
      if (ship.dir === "v") out.push([ship.r + i, ship.c]);
      else out.push([ship.r, ship.c + i]);
    }
    return out;
  }

  // Checked IN THIS ORDER so the reason is deterministic (SPEC §6):
  // bad_fleet -> bad_dir -> out_of_bounds -> overlap -> touching
  function validatePlacement(ships, opts) {
    opts = opts || {};
    var allowTouching = opts.allowTouching === undefined ? true : !!opts.allowTouching;
    var i, j, cs;

    if (!Array.isArray(ships) || ships.length !== FLEET.length) return { ok: false, reason: "bad_fleet" };
    var seen = {};
    for (i = 0; i < ships.length; i++) {
      var s = ships[i];
      if (!s || typeof s !== "object") return { ok: false, reason: "bad_fleet" };
      var spec = specFor(s.id);
      if (!spec) return { ok: false, reason: "bad_fleet" };
      if (seen[s.id] === true) return { ok: false, reason: "bad_fleet" };
      seen[s.id] = true;
      if (s.len !== undefined && s.len !== null && s.len !== spec.len) return { ok: false, reason: "bad_fleet" };
    }

    for (i = 0; i < ships.length; i++) if (ships[i].dir !== "h" && ships[i].dir !== "v") return { ok: false, reason: "bad_dir" };

    for (i = 0; i < ships.length; i++) {
      cs = cellsFor(ships[i]);
      for (j = 0; j < cs.length; j++) if (!inBounds(cs[j][0], cs[j][1])) return { ok: false, reason: "out_of_bounds" };
    }

    var occ = {};
    for (i = 0; i < ships.length; i++) {
      cs = cellsFor(ships[i]);
      for (j = 0; j < cs.length; j++) {
        var k = key(cs[j][0], cs[j][1]);
        if (occ[k] !== undefined) return { ok: false, reason: "overlap" };
        occ[k] = i;
      }
    }

    if (!allowTouching) {
      for (i = 0; i < ships.length; i++) {
        cs = cellsFor(ships[i]);
        for (j = 0; j < cs.length; j++) {
          for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
            var nb = occ[key(cs[j][0] + dr, cs[j][1] + dc)];
            if (nb !== undefined && nb !== i) return { ok: false, reason: "touching" };
          }
        }
      }
    }
    return { ok: true };
  }

  // Does `ship` fit against the already-occupied map? (occ: "r,c" -> shipId)
  function fits(ship, occ, allowTouching) {
    var cs = cellsFor(ship), i, dr, dc;
    for (i = 0; i < cs.length; i++) {
      var r = cs[i][0], c = cs[i][1];
      if (!inBounds(r, c)) return false;
      if (occ[key(r, c)] !== undefined) return false;
      if (!allowTouching) {
        for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
          if (occ[key(r + dr, c + dc)] !== undefined) return false;
        }
      }
    }
    return true;
  }

  // All legal (r,c,dir) placements for one ship spec against the current occupancy.
  function candidatesFor(spec, occ, allowTouching) {
    var out = [], dirs = ["h", "v"], d, r, c;
    for (d = 0; d < dirs.length; d++) {
      var dir = dirs[d];
      var maxR = dir === "v" ? SIZE - spec.len : SIZE - 1;
      var maxC = dir === "h" ? SIZE - spec.len : SIZE - 1;
      for (r = 0; r <= maxR; r++) for (c = 0; c <= maxC; c++) {
        var ship = { id: spec.id, len: spec.len, r: r, c: c, dir: dir };
        if (fits(ship, occ, allowTouching)) out.push(ship);
      }
    }
    return out;
  }

  // Longest-first, choosing uniformly among the ship's LEGAL placements (a
  // bounded, provably-terminating form of "retry until legal"): a degenerate rng
  // can never spin, and a dead end restarts the whole layout.
  function randomPlacement(rng, opts) {
    opts = opts || {};
    var allowTouching = opts.allowTouching === undefined ? true : !!opts.allowTouching;
    var order = FLEET.slice().sort(function (a, b) { return b.len - a.len; });
    var pick = typeof rng === "function" ? rng : function () { return 0; };

    for (var attempt = 0; attempt < 200; attempt++) {
      var occ = {}, placed = {}, dead = false;
      for (var i = 0; i < order.length; i++) {
        var cands = candidatesFor(order[i], occ, allowTouching);
        if (!cands.length) { dead = true; break; }
        var idx = pick(cands.length);
        if (!(idx >= 0 && idx < cands.length)) idx = 0;
        var ship = cands[idx];
        placed[ship.id] = ship;
        var cs = cellsFor(ship);
        for (var j = 0; j < cs.length; j++) occ[key(cs[j][0], cs[j][1])] = ship.id;
      }
      if (!dead) {
        return FLEET.map(function (spec) {
          var p = placed[spec.id];
          return { id: p.id, len: p.len, r: p.r, c: p.c, dir: p.dir };
        });
      }
    }
    throw new Error("randomPlacement: no legal layout found");
  }

  function shipAt(ships, r, c) {
    if (!Array.isArray(ships)) return null;
    for (var i = 0; i < ships.length; i++) {
      var cs = cellsFor(ships[i]);
      for (var j = 0; j < cs.length; j++) if (cs[j][0] === r && cs[j][1] === c) return ships[i];
    }
    return null;
  }
  function isSunk(ship) {
    if (!ship || !Array.isArray(ship.hits) || !ship.hits.length) return false;
    for (var i = 0; i < ship.hits.length; i++) if (!ship.hits[i]) return false;
    return true;
  }
  function shipsRemaining(ships) {
    if (!Array.isArray(ships)) return 0;
    var n = 0;
    for (var i = 0; i < ships.length; i++) if (!isSunk(ships[i])) n++;
    return n;
  }
  function fleetDestroyed(ships) {
    if (!Array.isArray(ships) || !ships.length) return false;
    return shipsRemaining(ships) === 0;
  }

  /* --------------------------------------------------------- firing helpers */
  function shotsAllowed(state, seat) {
    if (!state || !state.variant || !state.variant.salvo) return 1;
    return shipsRemaining(state.boards[seat].ships);
  }

  function alreadyFired(state, seat, r, c) {
    var inc = state.boards[1 - seat].incoming || [];
    for (var i = 0; i < inc.length; i++) if (inc[i].r === r && inc[i].c === c) return true;
    return false;
  }

  // Resolves one shot against the DEFENDER's board, marking the hit in place.
  function resolveShot(board, r, c) {
    var ships = (board && board.ships) || [];
    for (var i = 0; i < ships.length; i++) {
      var cs = cellsFor(ships[i]);
      for (var j = 0; j < cs.length; j++) {
        if (cs[j][0] === r && cs[j][1] === c) {
          if (!Array.isArray(ships[i].hits)) {
            ships[i].hits = [];
            for (var h = 0; h < lenOf(ships[i]); h++) ships[i].hits.push(false);
          }
          ships[i].hits[j] = true;
          return { result: "hit", shipId: ships[i].id, sunk: isSunk(ships[i]) ? ships[i].id : null };
        }
      }
    }
    return { result: "miss", shipId: null, sunk: null };
  }

  function stats(state, seat) {
    var inc = state.boards[1 - seat].incoming || [];
    var hits = 0;
    for (var i = 0; i < inc.length; i++) if (inc[i].result === "hit") hits++;
    return { shots: inc.length, hits: hits, accuracy: inc.length ? hits / inc.length : 0 };
  }

  /* --------------------------------------------- PROTOCOL §9: createState */
  function createState(options, rng) {
    options = options || {};
    var src = options.variant && typeof options.variant === "object" ? options.variant : options;
    var pick = typeof rng === "function" ? rng : function () { return 0; };
    return {
      phase: "placing",
      size: SIZE,
      variant: {
        salvo: !!src.salvo,
        allowTouching: src.allowTouching === undefined ? true : !!src.allowTouching
      },
      boards: [
        { ships: null, incoming: [] },
        { ships: null, incoming: [] }
      ],
      ready: [false, false],
      first: pick(2) === 1 ? 1 : 0,
      turn: null,
      turnNo: 0,
      over: false,
      result: null
    };
  }

  /* ---------------------------------------------- PROTOCOL §9: publicView */
  function publicView(state, seat) {
    var mySeat = (seat === 0 || seat === 1) ? seat : null;
    var revealed = state.phase === "over";

    var boards = [0, 1].map(function (s) {
      var b = state.boards[s];
      var show = revealed || s === mySeat;
      var byId = {};
      if (Array.isArray(b.ships)) for (var i = 0; i < b.ships.length; i++) byId[b.ships[i].id] = b.ships[i];

      var fleet = FLEET.map(function (spec) {
        var ship = byId[spec.id];
        // PUBLIC, always: id / name / len / sunk. Nothing else, ever, unless
        // this board belongs to the recipient or the game is over.
        var entry = { id: spec.id, name: spec.name, len: spec.len, sunk: ship ? isSunk(ship) : false };
        if (show && ship) {
          entry.r = ship.r; entry.c = ship.c; entry.dir = ship.dir; entry.hits = ship.hits.slice();
        }
        return entry;
      });

      var inc = (b.incoming || []).map(function (e) {
        return { r: e.r, c: e.c, result: e.result, sunk: e.sunk };
      });
      var cellsHit = 0;
      for (var k = 0; k < inc.length; k++) if (inc[k].result === "hit") cellsHit++;

      return {
        seat: s,
        fleet: fleet,
        incoming: inc,
        shipsRemaining: Array.isArray(b.ships) ? shipsRemaining(b.ships) : FLEET.length,
        cellsHit: cellsHit
      };
    });

    return {
      phase: state.phase,
      size: state.size,
      variant: { salvo: !!state.variant.salvo, allowTouching: !!state.variant.allowTouching },
      fleetSpec: FLEET.map(function (s) { return { id: s.id, name: s.name, len: s.len }; }),
      yourSeat: mySeat,
      turn: state.turn,
      first: state.first,
      turnNo: state.turnNo,
      ready: state.ready.slice(),
      over: state.over,
      result: state.result ? { winner: state.result.winner, reason: state.result.reason } : null,
      revealed: revealed,
      shotsAllowed: (state.phase === "firing" && (state.turn === 0 || state.turn === 1))
        ? shotsAllowed(state, state.turn) : 0,
      boards: boards
    };
  }

  /* ----------------------------------------------- PROTOCOL §9: applyMove */
  function normalizeShots(move) {
    if (Array.isArray(move.shots)) {
      var out = [];
      for (var i = 0; i < move.shots.length; i++) {
        var s = move.shots[i];
        if (!s || typeof s !== "object") return null;
        out.push({ r: s.r, c: s.c });
      }
      return out;
    }
    if (move.r !== undefined || move.c !== undefined) return [{ r: move.r, c: move.c }];
    return null;
  }

  function applyMove(state, seat, move, rng) {
    if (!state) return { ok: false, reason: "bad_move" };
    if (state.over || state.phase === "over") return { ok: false, reason: "game_over" };
    if (seat !== 0 && seat !== 1) return { ok: false, reason: "bad_move" };
    if (!move || typeof move !== "object" || typeof move.type !== "string") return { ok: false, reason: "bad_move" };

    /* ---- resign: legal in placing and firing, from either seat ---- */
    if (move.type === "resign") {
      var rs = clone(state);
      rs.phase = "over"; rs.over = true; rs.turn = null;
      rs.result = { winner: 1 - seat, reason: "resign" };
      return { ok: true, state: rs, events: [{ type: "gameOver", winner: 1 - seat, reason: "resign" }] };
    }

    /* ---- place: atomic, order-independent, no placing turn order ---- */
    if (move.type === "place") {
      if (state.phase !== "placing") return { ok: false, reason: "not_placing_phase" };
      if (state.ready[seat]) return { ok: false, reason: "already_placed" };

      var ships;
      if (move.random === true) {
        ships = randomPlacement(rng, state.variant);
      } else {
        ships = move.ships;
        var v = validatePlacement(ships, state.variant);
        if (!v.ok) return { ok: false, reason: v.reason };
      }

      var np = clone(state), events = [];
      np.boards[seat].ships = ships.map(function (s) {
        var L = lenOf(s), hits = [];
        for (var i = 0; i < L; i++) hits.push(false);
        return { id: s.id, len: L, r: s.r, c: s.c, dir: s.dir, hits: hits };
      });
      np.ready[seat] = true;
      events.push({ type: "placed", seat: seat }); // seat index and NOTHING else

      if (np.ready[0] && np.ready[1]) {
        np.phase = "firing";
        np.turn = np.first;
        events.push({ type: "phase", phase: "firing", turn: np.turn });
      }
      return { ok: true, state: np, events: events };
    }

    /* ---- fire ---- */
    if (move.type === "fire") {
      if (state.phase !== "firing") return { ok: false, reason: "not_firing_phase" };
      if (seat !== state.turn) return { ok: false, reason: "not_your_turn" };

      var shots = normalizeShots(move);
      if (shots === null) return { ok: false, reason: "bad_move" };
      if (shots.length !== shotsAllowed(state, seat)) return { ok: false, reason: "bad_shot_count" };

      var i2;
      for (i2 = 0; i2 < shots.length; i2++) if (!inBounds(shots[i2].r, shots[i2].c)) return { ok: false, reason: "out_of_bounds" };
      for (i2 = 0; i2 < shots.length; i2++) if (alreadyFired(state, seat, shots[i2].r, shots[i2].c)) return { ok: false, reason: "already_fired" };
      var seenShot = {};
      for (i2 = 0; i2 < shots.length; i2++) {
        var sk = key(shots[i2].r, shots[i2].c);
        if (seenShot[sk] === true) return { ok: false, reason: "duplicate_shot" };
        seenShot[sk] = true;
      }

      // Every shot resolves, in order, even if an earlier one destroys the last
      // enemy ship. Terminal is checked once, after the whole salvo.
      var nf = clone(state), ev = [], def = 1 - seat, board = nf.boards[def];
      for (i2 = 0; i2 < shots.length; i2++) {
        var res = resolveShot(board, shots[i2].r, shots[i2].c);
        board.incoming.push({ r: shots[i2].r, c: shots[i2].c, result: res.result, sunk: res.sunk });
        ev.push({ type: "shot", seat: seat, r: shots[i2].r, c: shots[i2].c, result: res.result, sunk: res.sunk });
        if (res.sunk) {
          var sp = specFor(res.sunk);
          ev.push({ type: "sunk", seat: def, shipId: res.sunk, name: sp ? sp.name : res.sunk });
        }
      }
      nf.turnNo += 1;
      if (fleetDestroyed(board.ships)) {
        nf.phase = "over"; nf.over = true; nf.turn = null;
        nf.result = { winner: seat, reason: "fleet_destroyed" };
        ev.push({ type: "gameOver", winner: seat, reason: "fleet_destroyed" });
      } else {
        nf.turn = 1 - seat;
      }
      return { ok: true, state: nf, events: ev };
    }

    return { ok: false, reason: "bad_move" };
  }

  /* --------------------------------------------- PROTOCOL §9: isTerminal */
  function isTerminal(state) {
    if (!state || state.phase !== "over") return null;
    return { over: true, result: state.result, reason: state.result ? state.result.reason : "over" };
  }

  /* ------------------------------------------------------------------ AI */
  // Everything below reads ONLY a publicView — the bot plays on exactly the
  // information a human at the same seat has.

  function aiPlaceFleet(rng, opts) { return randomPlacement(rng, opts); }

  // Hit cells that cannot be fully explained by ships already announced sunk.
  // Conservative by design (SPEC §6b): over-targeting is legal, under-targeting
  // would only make the bot weaker. Never touches anything but the view.
  function liveHitCells(view, myShots) {
    var hitSet = {}, hits = [], i;
    for (i = 0; i < myShots.length; i++) {
      if (myShots[i].result === "hit") { hits.push([myShots[i].r, myShots[i].c]); hitSet[key(myShots[i].r, myShots[i].c)] = true; }
    }
    if (!hits.length) return [];

    var compOf = {}, comps = [], id = 0;
    for (i = 0; i < hits.length; i++) {
      var k0 = key(hits[i][0], hits[i][1]);
      if (compOf[k0] !== undefined) continue;
      var stack = [hits[i]], cells = [];
      compOf[k0] = id;
      while (stack.length) {
        var cur = stack.pop();
        cells.push(cur);
        for (var d = 0; d < ORTHO.length; d++) {
          var nr = cur[0] + ORTHO[d][0], nc = cur[1] + ORTHO[d][1], nk = key(nr, nc);
          if (hitSet[nk] === true && compOf[nk] === undefined) { compOf[nk] = id; stack.push([nr, nc]); }
        }
      }
      comps.push(cells); id++;
    }

    var lens = {};
    (view.fleetSpec || FLEET).forEach(function (s) { lens[s.id] = s.len; });
    var accounted = comps.map(function () { return 0; });
    for (i = 0; i < myShots.length; i++) {
      if (!myShots[i].sunk) continue;
      var ci = compOf[key(myShots[i].r, myShots[i].c)];
      if (ci !== undefined) accounted[ci] += (lens[myShots[i].sunk] || 0);
    }

    var live = [];
    for (i = 0; i < comps.length; i++) if (comps[i].length > accounted[i]) live = live.concat(comps[i]);
    return live;
  }

  function targetCandidates(live, firedMap, size) {
    if (!live.length) return [];
    var liveSet = {}, i, d;
    for (i = 0; i < live.length; i++) liveSet[key(live[i][0], live[i][1])] = true;

    var ends = [], adj = [], seenE = {}, seenA = {};
    function offer(list, seen, r, c) {
      if (!(r >= 0 && r < size && c >= 0 && c < size)) return;
      var k = key(r, c);
      if (firedMap[k] === true || seen[k] === true) return;
      seen[k] = true; list.push([r, c]);
    }

    for (i = 0; i < live.length; i++) {
      var r0 = live[i][0], c0 = live[i][1];
      // a horizontal partner -> extend the run at both ends
      if (liveSet[key(r0, c0 + 1)] === true || liveSet[key(r0, c0 - 1)] === true) {
        var cA = c0; while (liveSet[key(r0, cA - 1)] === true) cA--;
        var cB = c0; while (liveSet[key(r0, cB + 1)] === true) cB++;
        offer(ends, seenE, r0, cA - 1); offer(ends, seenE, r0, cB + 1);
      }
      // a vertical partner
      if (liveSet[key(r0 + 1, c0)] === true || liveSet[key(r0 - 1, c0)] === true) {
        var rA = r0; while (liveSet[key(rA - 1, c0)] === true) rA--;
        var rB = r0; while (liveSet[key(rB + 1, c0)] === true) rB++;
        offer(ends, seenE, rA - 1, c0); offer(ends, seenE, rB + 1, c0);
      }
      for (d = 0; d < ORTHO.length; d++) offer(adj, seenA, r0 + ORTHO[d][0], c0 + ORTHO[d][1]);
    }
    return ends.length ? ends : adj;
  }

  function huntPool(firedMap, size, parity) {
    var pool = [], r, c;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) {
      if (firedMap[key(r, c)] === true) continue;
      if (parity && (r + c) % 2 !== 0) continue;
      pool.push([r, c]);
    }
    return pool;
  }

  function aiMove(view, rng, level) {
    level = level === "casual" ? "casual" : "sharp";
    var pick = typeof rng === "function" ? rng : function () { return 0; };
    var me = (view.yourSeat === 0 || view.yourSeat === 1) ? view.yourSeat : 0;

    if (view.phase === "placing" || !view.ready[me]) {
      var layout = aiPlaceFleet(pick, view.variant || {});
      return { type: "place", ships: layout.map(function (s) { return { id: s.id, r: s.r, c: s.c, dir: s.dir }; }) };
    }

    var size = view.size || SIZE;
    var enemy = 1 - me;
    var myShots = (view.boards[enemy].incoming || []).slice(); // shots I have fired
    var firedMap = {}, i;
    for (i = 0; i < myShots.length; i++) firedMap[key(myShots[i].r, myShots[i].c)] = true;

    // one shot per surviving ship of MY OWN fleet when salvo is on (all public)
    var need = 1;
    if (view.variant && view.variant.salvo) {
      need = 0;
      var mine = view.boards[me].fleet || [];
      for (i = 0; i < mine.length; i++) if (!mine[i].sunk) need++;
    }
    if (need < 1) need = 1;

    var live = liveHitCells(view, myShots);
    var shots = [];
    for (var n = 0; n < need; n++) {
      var cands = targetCandidates(live, firedMap, size);
      if (!cands.length) {
        cands = huntPool(firedMap, size, level === "sharp");
        if (!cands.length) cands = huntPool(firedMap, size, false);
      }
      if (!cands.length) break; // board exhausted (unreachable in a live game)
      var idx = pick(cands.length);
      if (!(idx >= 0 && idx < cands.length)) idx = 0;
      var cell = cands[idx];
      firedMap[key(cell[0], cell[1])] = true;
      shots.push({ r: cell[0], c: cell[1] });
    }
    return { type: "fire", shots: shots };
  }

  /* --------------------------------------------------------------- export */
  return {
    id: "gridfleet", minPlayers: 2, maxPlayers: 2,

    // PROTOCOL §9
    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,

    // constants
    SIZE: SIZE, FLEET: FLEET, totalCells: totalCells,

    // geometry / placement
    inBounds: inBounds, cellsFor: cellsFor, validatePlacement: validatePlacement,
    randomPlacement: randomPlacement, shipAt: shipAt, isSunk: isSunk,
    fleetDestroyed: fleetDestroyed, shipsRemaining: shipsRemaining,

    // firing
    shotsAllowed: shotsAllowed, alreadyFired: alreadyFired, resolveShot: resolveShot, stats: stats,

    // AI
    aiPlaceFleet: aiPlaceFleet, aiMove: aiMove
  };
});
