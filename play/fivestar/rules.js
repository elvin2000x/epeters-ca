/* ============================================================================
   fivestar/rules.js — pure five-dice scorecard engine (no DOM, no PK).
   Shared by index.html (browser), bot_test.js (Node), and server/games/fivestar.js.
   Satisfies the PROTOCOL §9 contract + the pure helpers in SPEC §6.1.

   The card is the Scandinavian scheme, pinned in SPEC §6.4:
     • 15 categories: 6 upper (Ones..Sixes) + 9 lower.
     • Upper bonus: 50 points at 63+ (inclusive).
     • Small Straight = exactly {1,2,3,4,5} = 15. Large Straight = exactly {2,3,4,5,6} = 20.
     • One Pair / Two Pairs / Three of a Kind / Four of a Kind score the SUM of the
       counting dice only, taking the highest qualifying face.
     • Full House = 3 of one face + 2 of a different face, scoring the sum of all five.
     • Five Star (all five equal) = 50. No extra bonus, no joker rule.
   Those values are the identity of this card — never "correct" them toward any
   commercial variant.

   rng(n) -> uniform int in [0,n): crypto in prod, forced in tests.
   A die is rng(6) + 1 — pinned, so n => 0 yields all 1s and n => n-1 yields all 6s.
   ========================================================================== */
(function (root, factory) {
  var M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  if (typeof globalThis !== "undefined") { globalThis.FIVESTAR_RULES = M; globalThis.FIVESTAR = M; }
})(this, function () {
  "use strict";

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ------------------------------------------------------------ constants */
  var UPPER = ["ones", "twos", "threes", "fours", "fives", "sixes"];
  var LOWER = ["onePair", "twoPairs", "threeKind", "fourKind",
               "smallStraight", "largeStraight", "fullHouse", "chance", "fivestar"];
  var CATEGORIES = UPPER.concat(LOWER);

  var LABELS = {
    ones: "Ones", twos: "Twos", threes: "Threes", fours: "Fours", fives: "Fives", sixes: "Sixes",
    onePair: "One Pair", twoPairs: "Two Pairs", threeKind: "Three of a Kind",
    fourKind: "Four of a Kind", smallStraight: "Small Straight", largeStraight: "Large Straight",
    fullHouse: "Full House", chance: "Chance", fivestar: "Five Star"
  };

  var DICE_COUNT = 5;
  var ROLLS_PER_TURN = 3;
  var BONUS_THRESHOLD = 63;
  var BONUS_POINTS = 50;
  var SMALL_STRAIGHT_POINTS = 15;
  var LARGE_STRAIGHT_POINTS = 20;
  var FIVESTAR_POINTS = 50;
  var MIN_PLAYERS = 2, MAX_PLAYERS = 6;

  var CATEGORY_MAX = {
    ones: 5, twos: 10, threes: 15, fours: 20, fives: 25, sixes: 30,
    onePair: 12, twoPairs: 22, threeKind: 18, fourKind: 24,
    smallStraight: SMALL_STRAIGHT_POINTS, largeStraight: LARGE_STRAIGHT_POINTS,
    fullHouse: 28, chance: 30, fivestar: FIVESTAR_POINTS
  };
  var MAX_POSSIBLE = (function () {
    var t = BONUS_POINTS;
    for (var i = 0; i < CATEGORIES.length; i++) t += CATEGORY_MAX[CATEGORIES[i]];
    return t;                                   // 105 + 219 + 50 = 374
  })();

  // Sacrifice the rarest rows first; never burn `chance` or a high upper row on a scratch.
  var SCRATCH_ORDER = ["fivestar", "largeStraight", "smallStraight", "twoPairs", "fourKind",
                       "ones", "onePair", "twos", "threeKind", "fullHouse",
                       "threes", "fours", "fives", "sixes", "chance"];

  /* ------------------------------------------------------------- dice ---- */
  function rollDice(count, rng) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(rng(6) + 1);
    return out;
  }
  function rerollDice(dice, held, rng) {
    var out = [];
    for (var i = 0; i < dice.length; i++) out.push(held && held[i] ? dice[i] : rng(6) + 1);
    return out;
  }
  function counts(dice) {
    var c = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < dice.length; i++) { var v = Math.floor(dice[i]); if (v >= 1 && v <= 6) c[v - 1]++; }
    return c;
  }
  function total(dice) { var s = 0; for (var i = 0; i < dice.length; i++) s += Math.floor(dice[i]); return s; }
  function highestWithAtLeast(c, n) { for (var v = 6; v >= 1; v--) if (c[v - 1] >= n) return v; return 0; }

  /* ---------------------------------------------------------- scoring ---- */
  function scoreCategory(category, dice) {
    if (!dice || !dice.length) return 0;
    var c = counts(dice), i, v, w;

    i = UPPER.indexOf(category);
    if (i >= 0) return (i + 1) * c[i];          // sum of the dice showing that face

    switch (category) {
      case "onePair":
        v = highestWithAtLeast(c, 2);
        return v ? 2 * v : 0;
      case "twoPairs":
        v = 0; w = 0;                            // two DISTINCT faces, each showing at least twice
        for (var f = 6; f >= 1; f--) {
          if (c[f - 1] >= 2) { if (!v) v = f; else if (!w) { w = f; break; } }
        }
        return (v && w) ? 2 * v + 2 * w : 0;
      case "threeKind":
        v = highestWithAtLeast(c, 3);
        return v ? 3 * v : 0;
      case "fourKind":
        v = highestWithAtLeast(c, 4);
        return v ? 4 * v : 0;
      case "smallStraight":                      // exactly {1,2,3,4,5}
        return (c[0] === 1 && c[1] === 1 && c[2] === 1 && c[3] === 1 && c[4] === 1 && c[5] === 0)
          ? SMALL_STRAIGHT_POINTS : 0;
      case "largeStraight":                      // exactly {2,3,4,5,6}
        return (c[1] === 1 && c[2] === 1 && c[3] === 1 && c[4] === 1 && c[5] === 1 && c[0] === 0)
          ? LARGE_STRAIGHT_POINTS : 0;
      case "fullHouse":                          // exactly 3 + 2 of DIFFERENT faces
        var three = 0, two = 0;
        for (var g = 1; g <= 6; g++) {
          if (c[g - 1] === 3) three = g;
          else if (c[g - 1] === 2) two = g;
        }
        return (three && two) ? total(dice) : 0;
      case "chance":
        return total(dice);
      case "fivestar":
        for (var h = 1; h <= 6; h++) if (c[h - 1] === DICE_COUNT) return FIVESTAR_POINTS;
        return 0;
      default:
        return 0;
    }
  }

  function scoresForAll(dice) {
    var out = {};
    for (var i = 0; i < CATEGORIES.length; i++) out[CATEGORIES[i]] = scoreCategory(CATEGORIES[i], dice);
    return out;
  }

  /* ------------------------------------------------------------ sheets --- */
  function newSheet() {
    var s = {};
    for (var i = 0; i < CATEGORIES.length; i++) s[CATEGORIES[i]] = null;
    return s;
  }
  function openCategories(sheet) {
    var out = [];
    for (var i = 0; i < CATEGORIES.length; i++) if (sheet[CATEGORIES[i]] === null || sheet[CATEGORIES[i]] === undefined) out.push(CATEGORIES[i]);
    return out;
  }
  function sheetComplete(sheet) { return openCategories(sheet).length === 0; }
  function upperSum(sheet) {
    var t = 0;
    for (var i = 0; i < UPPER.length; i++) t += sheet[UPPER[i]] || 0;
    return t;
  }
  function bonusFor(sheet) { return upperSum(sheet) >= BONUS_THRESHOLD ? BONUS_POINTS : 0; }
  function lowerSum(sheet) {
    var t = 0;
    for (var i = 0; i < LOWER.length; i++) t += sheet[LOWER[i]] || 0;
    return t;
  }
  function grandTotal(sheet) { return upperSum(sheet) + bonusFor(sheet) + lowerSum(sheet); }

  // How far above/below "three of each face" the FILLED upper rows are (par talk).
  function parDelta(sheet) {
    var d = 0;
    for (var i = 0; i < UPPER.length; i++) {
      var v = sheet[UPPER[i]];
      if (v === null || v === undefined) continue;
      d += v - 3 * (i + 1);
    }
    return d;
  }

  function clampPlayers(n) {
    n = Math.floor(Number(n));
    if (!(n >= MIN_PLAYERS)) return MIN_PLAYERS;
    return n > MAX_PLAYERS ? MAX_PLAYERS : n;
  }

  function standings(state) {
    var rows = [];
    for (var s = 0; s < state.numPlayers; s++) {
      rows.push({ seat: s, total: grandTotal(state.sheets[s]), upper: upperSum(state.sheets[s]), bonus: bonusFor(state.sheets[s]) });
    }
    rows.sort(function (a, b) { return b.total - a.total || a.seat - b.seat; });
    return rows;
  }

  /* ------------------------------------------- PROTOCOL §9 contract ------ */
  function createState(options, rng) {          // eslint-disable-line no-unused-vars
    options = options || {};
    var numPlayers = clampPlayers(options.numPlayers || options.players || MIN_PLAYERS);
    var firstSeat = Math.floor(Number(options.firstSeat));
    if (!(firstSeat >= 0 && firstSeat < numPlayers)) firstSeat = 0;
    var sheets = [];
    for (var s = 0; s < numPlayers; s++) sheets.push(newSheet());
    return {
      numPlayers: numPlayers,
      firstSeat: firstSeat,
      turn: firstSeat,
      round: 1,
      dice: null,
      held: [false, false, false, false, false],
      rollsLeft: ROLLS_PER_TURN,
      sheets: sheets,
      log: [],
      over: false,
      result: null
    };
  }

  // Perfect information: nothing to redact. A DEEP-COPIED, shaped passthrough (+ yourSeat).
  // Never return `state` itself — the copy is what stops a server handing out a live reference.
  function publicView(state, seat) {
    var v = {
      numPlayers: state.numPlayers,
      firstSeat: state.firstSeat,
      turn: state.turn,
      round: state.round,
      dice: state.dice ? state.dice.slice() : null,
      held: state.held.slice(),
      rollsLeft: state.rollsLeft,
      sheets: clone(state.sheets),
      log: clone(state.log),
      over: state.over,
      result: state.result ? clone(state.result) : null
    };
    v.yourSeat = (seat === null || seat === undefined) ? null : seat;
    return v;
  }

  function validHeldMask(h) {
    if (!Array.isArray(h) || h.length !== DICE_COUNT) return false;
    for (var i = 0; i < DICE_COUNT; i++) if (typeof h[i] !== "boolean") return false;
    return true;
  }

  function finalize(next) {
    var totals = [], uppers = [], bonuses = [], s;
    for (s = 0; s < next.numPlayers; s++) {
      uppers.push(upperSum(next.sheets[s]));
      bonuses.push(bonusFor(next.sheets[s]));
      totals.push(grandTotal(next.sheets[s]));
    }
    var best = -1;
    for (s = 0; s < totals.length; s++) if (totals[s] > best) best = totals[s];
    var winners = [];
    for (s = 0; s < totals.length; s++) if (totals[s] === best) winners.push(s);
    next.over = true;
    next.result = {
      kind: "complete", totals: totals, uppers: uppers, bonuses: bonuses,
      winner: winners.length === 1 ? winners[0] : null, winners: winners
    };
  }

  function applyMove(state, seat, move, rng) {
    if (state.over) return { ok: false, reason: "game_over" };
    if (seat !== state.turn) return { ok: false, reason: "not_your_turn" };
    if (!move || !move.type) return { ok: false, reason: "bad_move" };

    var next, events = [], i;

    if (move.type === "roll") {
      if (state.rollsLeft <= 0) return { ok: false, reason: "no_rolls_left" };
      next = clone(state);
      var rolled = [];
      if (next.dice === null) {                 // first roll of the turn ignores any stale mask
        next.held = [false, false, false, false, false];
        next.dice = rollDice(DICE_COUNT, rng);
        for (i = 0; i < DICE_COUNT; i++) rolled.push(i);
      } else {
        for (i = 0; i < DICE_COUNT; i++) if (!next.held[i]) rolled.push(i);
        next.dice = rerollDice(next.dice, next.held, rng);
      }
      next.rollsLeft -= 1;
      events.push({ type: "rolled", seat: seat, dice: next.dice.slice(), rolled: rolled, rollsLeft: next.rollsLeft });
      return { ok: true, state: next, events: events };
    }

    if (move.type === "hold") {
      if (state.dice === null) return { ok: false, reason: "must_roll" };
      if (state.rollsLeft <= 0) return { ok: false, reason: "no_rolls_left" };
      if (!validHeldMask(move.held)) return { ok: false, reason: "bad_move" };
      next = clone(state);
      next.held = move.held.slice();
      events.push({ type: "held", seat: seat, held: next.held.slice() });
      return { ok: true, state: next, events: events };
    }

    if (move.type === "score") {
      if (state.dice === null) return { ok: false, reason: "must_roll" };
      if (CATEGORIES.indexOf(move.category) < 0) return { ok: false, reason: "bad_category" };
      if (state.sheets[seat][move.category] !== null && state.sheets[seat][move.category] !== undefined) {
        return { ok: false, reason: "category_used" };
      }
      next = clone(state);
      var dice = next.dice.slice();
      var value = scoreCategory(move.category, dice);
      var upperBefore = upperSum(next.sheets[seat]);
      next.sheets[seat][move.category] = value;
      var entry = { seat: seat, category: move.category, value: value, dice: dice, round: next.round };
      if (move.auto) entry.auto = true;
      next.log.push(entry);
      events.push({ type: "scored", seat: seat, category: move.category, value: value, dice: dice, round: next.round, auto: !!move.auto });
      if (upperBefore < BONUS_THRESHOLD && upperSum(next.sheets[seat]) >= BONUS_THRESHOLD) {
        events.push({ type: "bonus", seat: seat, upper: upperSum(next.sheets[seat]), points: BONUS_POINTS });
      }
      if (value === FIVESTAR_POINTS && move.category === "fivestar") events.push({ type: "fivestar", seat: seat });

      // end of turn
      next.dice = null;
      next.held = [false, false, false, false, false];
      next.rollsLeft = ROLLS_PER_TURN;
      next.turn = (seat + 1) % next.numPlayers;
      if (next.turn === next.firstSeat) next.round = Math.min(next.round + 1, 15);

      var allDone = true;
      for (i = 0; i < next.numPlayers; i++) if (!sheetComplete(next.sheets[i])) { allDone = false; break; }
      if (allDone) {
        finalize(next);
        events.push({ type: "gameOver", result: next.result });
      }
      return { ok: true, state: next, events: events };
    }

    return { ok: false, reason: "bad_move" };
  }

  function isTerminal(state) {
    if (!state.over) return null;
    return { over: true, result: state.result, reason: "complete" };
  }

  /* ---------------------------------------------------------------- AI --- */
  // chooseHold — pinned precedence (SPEC §6.7). Pure, deterministic, no rng,
  // never mutates its arguments.
  function chooseHold(dice, sheet) {
    var mask = [false, false, false, false, false], i;
    if (!dice || dice.length !== DICE_COUNT) return mask;
    var c = counts(dice);

    // 1. largest count m, highest face v achieving it
    var m = 0, v = 0;
    for (var f = 1; f <= 6; f++) {
      if (c[f - 1] > m) { m = c[f - 1]; v = f; }
      else if (c[f - 1] === m && c[f - 1] > 0 && f > v) v = f;   // tie -> higher face
    }

    // 2. three or more of a kind: keep them
    if (m >= 3) {
      for (i = 0; i < DICE_COUNT; i++) if (dice[i] === v) mask[i] = true;
      return mask;
    }

    // 3. straight draw (only while a straight row is still open)
    var straightOpen = (sheet && (sheet.smallStraight === null || sheet.smallStraight === undefined)) ||
                       (sheet && (sheet.largeStraight === null || sheet.largeStraight === undefined));
    if (straightOpen) {
      var run = longestRun(c);
      if (run && run.length >= 4) {
        for (var k = 0; k < run.length; k++) {
          for (i = 0; i < DICE_COUNT; i++) {
            if (dice[i] === run[k] && !mask[i]) { mask[i] = true; break; }   // one die per face
          }
        }
        return mask;
      }
    }

    // 4. a pair: keep it
    if (m === 2) {
      for (i = 0; i < DICE_COUNT; i++) if (dice[i] === v) mask[i] = true;
      return mask;
    }

    // 5. nothing to build on: keep the big faces if a row can still use them
    var bigOpen = !!sheet && (
      sheet.fives === null || sheet.fives === undefined ||
      sheet.sixes === null || sheet.sixes === undefined ||
      sheet.chance === null || sheet.chance === undefined);
    if (bigOpen) for (i = 0; i < DICE_COUNT; i++) if (dice[i] >= 5) mask[i] = true;
    return mask;
  }

  // longest consecutive run of distinct faces present; ties -> the highest run.
  function longestRun(c) {
    var best = null, cur = [];
    for (var f = 1; f <= 6; f++) {
      if (c[f - 1] > 0) {
        cur.push(f);
        if (!best || cur.length >= best.length) best = cur.slice();   // >= keeps the highest on a tie
      } else cur = [];
    }
    return best;
  }

  function bestCategory(dice, sheet) {
    var sc = scoresForAll(dice), open = openCategories(sheet), i, k;
    if (!open.length) return null;
    var bestKey = null, bestVal = -1;
    for (i = 0; i < open.length; i++) {
      k = open[i];
      if (sc[k] > bestVal) { bestVal = sc[k]; bestKey = k; }        // ties -> CATEGORIES order
    }
    if (bestVal > 0) return bestKey;
    return scratchCategory(sheet);                                   // forced scratch
  }

  function scratchCategory(sheet) {
    for (var i = 0; i < SCRATCH_ORDER.length; i++) {
      var k = SCRATCH_ORDER[i];
      if (sheet[k] === null || sheet[k] === undefined) return k;
    }
    return null;
  }

  function sameMask(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (!!a[i] !== !!b[i]) return false;
    return true;
  }

  function fivestarAI(view) {
    var sheet = view.sheets[view.turn];
    if (view.rollsLeft >= ROLLS_PER_TURN || view.dice === null) return { type: "roll" };
    if (view.rollsLeft > 0) {
      var want = chooseHold(view.dice, sheet);
      if (!sameMask(want, view.held)) return { type: "hold", held: want };
      var all = true;
      for (var i = 0; i < want.length; i++) if (!want[i]) { all = false; break; }
      if (all) return { type: "score", category: bestCategory(view.dice, sheet) };
      return { type: "roll" };
    }
    return { type: "score", category: bestCategory(view.dice, sheet) };
  }

  // The server's grace-timeout auto-play (and the UI's "play it for me" escape).
  function autoScratch(view) {
    var sheet = view.sheets[view.turn];
    return { type: "score", category: scratchCategory(sheet), auto: true };
  }

  return {
    id: "fivestar", minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS,

    // PROTOCOL §9 contract
    createState: createState, publicView: publicView, applyMove: applyMove, isTerminal: isTerminal,

    // constants
    CATEGORIES: CATEGORIES, UPPER: UPPER, LOWER: LOWER, LABELS: LABELS,
    DICE_COUNT: DICE_COUNT, ROLLS_PER_TURN: ROLLS_PER_TURN,
    BONUS_THRESHOLD: BONUS_THRESHOLD, BONUS_POINTS: BONUS_POINTS,
    SMALL_STRAIGHT_POINTS: SMALL_STRAIGHT_POINTS, LARGE_STRAIGHT_POINTS: LARGE_STRAIGHT_POINTS,
    FIVESTAR_POINTS: FIVESTAR_POINTS, CATEGORY_MAX: CATEGORY_MAX, MAX_POSSIBLE: MAX_POSSIBLE,
    SCRATCH_ORDER: SCRATCH_ORDER,

    // pure helpers
    rollDice: rollDice, rerollDice: rerollDice, counts: counts, total: total,
    scoreCategory: scoreCategory, scoresForAll: scoresForAll,
    openCategories: openCategories, upperSum: upperSum, bonusFor: bonusFor,
    lowerSum: lowerSum, grandTotal: grandTotal, parDelta: parDelta,
    sheetComplete: sheetComplete, newSheet: newSheet, clampPlayers: clampPlayers,
    standings: standings, clone: clone,

    // AI
    fivestarAI: fivestarAI, chooseHold: chooseHold, bestCategory: bestCategory,
    scratchCategory: scratchCategory, autoScratch: autoScratch
  };
});
