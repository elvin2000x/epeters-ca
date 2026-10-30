/* Circuit math and drawings for the resistor puzzles.
   The hit test uses exact fractions. A second tray value must not land on the target. */
(function (root) {
  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      var t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }
  function fr(n, d) {
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function add(a, b) { return fr(a.n * b.d + b.n * a.d, a.d * b.d); }
  function mul(a, b) { return fr(a.n * b.n, a.d * b.d); }
  function divf(a, b) { return fr(a.n * b.d, a.d * b.n); }
  function par(a, b) { return divf(mul(a, b), add(a, b)); }
  function n(v) { return fr(v, 1); }

  function quantity(puzzle, ohms) {
    var v = puzzle.voltage_v;
    var f = puzzle.fixed_ohm;
    var r = ohms;
    var kind = puzzle.target_kind;
    if (puzzle.shape === "single") return { kind: kind, q: fr(1000 * v, r) };
    if (puzzle.shape === "series2") return { kind: kind, q: fr(1000 * v, f[0] + r) };
    if (puzzle.shape === "series3") return { kind: kind, q: fr(1000 * v, f[0] + f[1] + r) };
    if (puzzle.shape === "divider") return { kind: kind, q: fr(v * r, f[0] + r) };
    if (puzzle.shape === "parallel_total") {
      return { kind: kind, q: add(fr(1000 * v, f[0]), fr(1000 * v, r)) };
    }
    if (puzzle.shape === "parallel_branch") return { kind: kind, q: fr(1000 * v, r) };
    var rp = par(n(f[1]), n(r));
    var i = divf(n(v), add(n(f[0]), rp));
    var vp = mul(i, rp);
    if (puzzle.shape === "mixed_total") return { kind: kind, q: mul(i, n(1000)) };
    if (puzzle.shape === "mixed_voltage") return { kind: kind, q: vp };
    if (puzzle.shape === "mixed_branch") return { kind: kind, q: mul(divf(vp, n(r)), n(1000)) };
    throw new Error(puzzle.shape);
  }

  function exactValue(puzzle, ohms) {
    var got = quantity(puzzle, ohms).q;
    if (got.d !== 1) return null;
    return got.n;
  }

  function isHit(puzzle, ohms) {
    return exactValue(puzzle, ohms) === puzzle.target;
  }

  function formatQuantity(q, unit) {
    if (q.d === 1) return q.n + " " + unit;
    var shown = (q.n / q.d).toFixed(2);
    return shown + " " + unit;
  }

  function unitFor(kind) {
    return kind.indexOf("voltage") === 0 ? "V" : "mA";
  }

  function formatReading(puzzle, ohms) {
    var got = quantity(puzzle, ohms);
    return formatQuantity(got.q, unitFor(got.kind));
  }

  var LESSONS = [
    {
      n: 1,
      title: "One resistor",
      blocks: [
        { picture: { shape: "single", voltage_v: 12, fixed_ohm: [], target_kind: "current" }, chosen: 30 },
        { rule: "Current = voltage \u00F7 resistance" },
        { work: "12 V \u00F7 30 \u03A9 = 0.4 A" },
        { work: "0.4 A = 400 mA" },
        { tease: "Next, the resistors sit in a row. You add the ohms before you divide." }
      ]
    },
    {
      n: 2,
      title: "In a row",
      blocks: [
        { picture: { shape: "series2", voltage_v: 12, fixed_ohm: [10], target_kind: "current" }, chosen: 20 },
        { rule: "Ohms in a row add. Current = voltage \u00F7 that sum." },
        { work: "10 \u03A9 + 20 \u03A9 = 30 \u03A9" },
        { work: "12 V \u00F7 30 \u03A9 = 0.4 A = 400 mA" },
        { rule: "Three in a row is the same addition." },
        { work: "10 + 10 + 20 = 40 \u03A9" },
        { work: "12 V \u00F7 40 \u03A9 = 0.3 A = 300 mA" },
        { picture: { shape: "divider", voltage_v: 12, fixed_ohm: [10], target_kind: "voltage_blank" }, chosen: 20 },
        { rule: "The blank's share of the voltage is its ohms divided by the total ohms, times the battery." },
        { work: "20 \u00F7 30 \u00D7 12 V = 8 V" },
        { tease: "Next the wire splits. Each branch gets the full 12 V, and the branch currents add. After that, a pair sits beside one resistor." }
      ]
    },
    {
      n: 3,
      title: "The wire splits",
      blocks: [
        { picture: { shape: "parallel_total", voltage_v: 12, fixed_ohm: [20], target_kind: "current_total" }, chosen: 30 },
        { rule: "Each branch gets the full battery voltage. Branch current = 12 V \u00F7 that branch." },
        { work: "12 \u00F7 20 \u03A9 = 0.6 A = 600 mA" },
        { work: "12 \u00F7 30 \u03A9 = 0.4 A = 400 mA" },
        { work: "Total = 600 + 400 = 1000 mA" },
        { rule: "One branch does not change the other. 12 \u00F7 30 \u03A9 is still 400 mA." },
        { picture: { shape: "mixed_total", voltage_v: 12, fixed_ohm: [10, 20], target_kind: "current_total" }, chosen: 20 },
        { rule: "A pair after one resistor: combine the pair first." },
        { work: "(20 \u00D7 20) \u00F7 (20 + 20) = 10 \u03A9" },
        { work: "10 \u03A9 in series + 10 \u03A9 = 20 \u03A9" },
        { work: "12 V \u00F7 20 \u03A9 = 0.6 A = 600 mA" },
        { work: "Voltage on the pair = 0.6 A \u00D7 10 \u03A9 = 6 V" },
        { work: "Current in one branch of the pair = 6 V \u00F7 20 \u03A9 = 300 mA" },
        { tease: "The last puzzles ask for those three readings, in that order." }
      ]
    }
  ];

  function lessonBefore(level, prevLevel) {
    if (level === 1 && prevLevel == null) return LESSONS[0];
    if (level === 2 && (prevLevel == null || prevLevel < 2)) return LESSONS[1];
    if (level === 5 && (prevLevel == null || prevLevel < 5)) return LESSONS[2];
    return null;
  }

  function targetSentence(puzzle) {
    var t = puzzle.target;
    if (puzzle.target_kind === "current") return "Make the current " + t + " mA.";
    if (puzzle.target_kind === "current_total") return "Make the total current " + t + " mA.";
    if (puzzle.target_kind === "current_blank") return "Make the current in the blank " + t + " mA.";
    if (puzzle.target_kind === "voltage_blank") return "Make the voltage across the blank " + t + " V.";
    if (puzzle.target_kind === "voltage_pair") return "Make the voltage across the pair " + t + " V.";
    return "";
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function box(x, y, label, blank) {
    var w = 84, h = 40;
    return '<rect x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h +
      '" rx="5" class="' + (blank ? "blank" : "part") + '"/>' +
      '<text x="' + x + '" y="' + (y + 6) + '" text-anchor="middle" class="val">' + esc(label) + "</text>";
  }

  function meter(x, y, letter) {
    return '<circle cx="' + x + '" cy="' + y + '" r="16" class="meter"/>' +
      '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" class="meter-t">' + letter + "</text>";
  }

  function battery(x, y, volts) {
    return '<line x1="' + x + '" y1="' + (y - 46) + '" x2="' + x + '" y2="' + (y - 12) + '" class="wire"/>' +
      '<line x1="' + (x - 16) + '" y1="' + (y - 12) + '" x2="' + (x + 16) + '" y2="' + (y - 12) + '" class="plate"/>' +
      '<line x1="' + (x - 9) + '" y1="' + (y + 8) + '" x2="' + (x + 9) + '" y2="' + (y + 8) + '" class="wire"/>' +
      '<line x1="' + x + '" y1="' + (y + 8) + '" x2="' + x + '" y2="' + (y + 46) + '" class="wire"/>' +
      '<text x="' + (x + 22) + '" y="' + (y + 4) + '" class="vlab">' + volts + " V</text>";
  }

  function labelOf(ohm, chosen, isBlank) {
    if (!isBlank) return ohm + " \u03A9";
    if (chosen) return chosen + " \u03A9";
    return "?";
  }

  function draw(puzzle, chosen) {
    var f = puzzle.fixed_ohm;
    var shape = puzzle.shape;
    var letter = puzzle.target_kind.indexOf("voltage") === 0 ? "V" : "A";
    var blank = function (ohm) { return labelOf(ohm, chosen, true); };
    var fixed = function (ohm) { return labelOf(ohm, chosen, false); };
    var body = "";
    if (shape === "single") {
      body =
        '<line x1="70" y1="78" x2="250" y2="78" class="wire"/>' +
        box(292, 78, blank(), true) +
        '<line x1="334" y1="78" x2="560" y2="78" class="wire"/>' +
        '<line x1="560" y1="78" x2="560" y2="242" class="wire"/>' +
        '<line x1="560" y1="242" x2="360" y2="242" class="wire"/>' +
        meter(328, 242, letter) +
        '<line x1="312" y1="242" x2="70" y2="242" class="wire"/>' +
        '<line x1="70" y1="242" x2="70" y2="200" class="wire"/>' +
        '<line x1="70" y1="78" x2="70" y2="108" class="wire"/>' +
        battery(70, 154, puzzle.voltage_v);
    } else if (shape === "series2" || shape === "divider") {
      body =
        '<line x1="64" y1="78" x2="150" y2="78" class="wire"/>' +
        box(192, 78, fixed(f[0]), false) +
        '<line x1="234" y1="78" x2="300" y2="78" class="wire"/>' +
        box(342, 78, blank(), true) +
        '<line x1="384" y1="78" x2="560" y2="78" class="wire"/>' +
        '<line x1="560" y1="78" x2="560" y2="250" class="wire"/>' +
        '<line x1="64" y1="250" x2="64" y2="200" class="wire"/>' +
        '<line x1="64" y1="78" x2="64" y2="108" class="wire"/>' +
        battery(64, 154, puzzle.voltage_v);
      if (shape === "series2") {
        body += '<line x1="560" y1="250" x2="400" y2="250" class="wire"/>' +
          meter(368, 250, letter) +
          '<line x1="352" y1="250" x2="64" y2="250" class="wire"/>';
      } else {
        body += '<line x1="560" y1="250" x2="64" y2="250" class="wire"/>';
        body +=
          '<line x1="300" y1="98" x2="300" y2="168" class="probe"/>' +
          '<line x1="384" y1="98" x2="384" y2="168" class="probe"/>' +
          '<line x1="300" y1="168" x2="326" y2="168" class="probe"/>' +
          '<line x1="358" y1="168" x2="384" y2="168" class="probe"/>' +
          meter(342, 168, letter);
      }
    } else if (shape === "series3") {
      body =
        '<line x1="48" y1="78" x2="92" y2="78" class="wire"/>' +
        box(134, 78, fixed(f[0]), false) +
        '<line x1="176" y1="78" x2="214" y2="78" class="wire"/>' +
        box(256, 78, fixed(f[1]), false) +
        '<line x1="298" y1="78" x2="336" y2="78" class="wire"/>' +
        box(378, 78, blank(), true) +
        '<line x1="420" y1="78" x2="560" y2="78" class="wire"/>' +
        '<line x1="560" y1="78" x2="560" y2="242" class="wire"/>' +
        '<line x1="560" y1="242" x2="360" y2="242" class="wire"/>' +
        meter(328, 242, letter) +
        '<line x1="312" y1="242" x2="48" y2="242" class="wire"/>' +
        '<line x1="48" y1="242" x2="48" y2="200" class="wire"/>' +
        '<line x1="48" y1="78" x2="48" y2="108" class="wire"/>' +
        battery(48, 154, puzzle.voltage_v);
    } else if (shape === "parallel_total" || shape === "parallel_branch") {
      body =
        '<line x1="78" y1="70" x2="200" y2="70" class="wire"/>' +
        box(242, 70, fixed(f[0]), false) +
        '<line x1="284" y1="70" x2="500" y2="70" class="wire"/>' +
        '<line x1="78" y1="250" x2="200" y2="250" class="wire"/>' +
        box(242, 250, blank(), true) +
        '<line x1="78" y1="70" x2="78" y2="114" class="wire"/>' +
        '<line x1="78" y1="250" x2="78" y2="206" class="wire"/>' +
        battery(78, 160, puzzle.voltage_v);
      if (shape === "parallel_total") {
        body +=
          '<line x1="284" y1="250" x2="500" y2="250" class="wire"/>' +
          '<line x1="500" y1="70" x2="500" y2="144" class="wire"/>' +
          meter(500, 160, letter) +
          '<line x1="500" y1="176" x2="500" y2="250" class="wire"/>';
      } else {
        body +=
          '<line x1="500" y1="70" x2="500" y2="250" class="wire"/>' +
          '<line x1="284" y1="250" x2="400" y2="250" class="wire"/>' +
          meter(432, 250, letter) +
          '<line x1="448" y1="250" x2="500" y2="250" class="wire"/>';
      }
    } else {
      body =
        '<line x1="48" y1="72" x2="86" y2="72" class="wire"/>' +
        box(128, 72, fixed(f[0]), false) +
        '<line x1="170" y1="72" x2="210" y2="72" class="wire"/>' +
        '<line x1="210" y1="72" x2="210" y2="200" class="wire"/>' +
        '<line x1="210" y1="72" x2="250" y2="72" class="wire"/>' +
        box(292, 72, fixed(f[1]), false) +
        '<line x1="334" y1="72" x2="400" y2="72" class="wire"/>' +
        '<line x1="210" y1="200" x2="250" y2="200" class="wire"/>' +
        box(292, 200, blank(), true) +
        '<line x1="48" y1="72" x2="48" y2="108" class="wire"/>' +
        '<line x1="48" y1="250" x2="48" y2="200" class="wire"/>' +
        battery(48, 154, puzzle.voltage_v);
      if (shape === "mixed_branch") {
        body +=
          '<line x1="400" y1="72" x2="400" y2="184" class="wire"/>' +
          '<line x1="400" y1="216" x2="400" y2="250" class="wire"/>' +
          '<line x1="334" y1="200" x2="368" y2="200" class="wire"/>' +
          meter(384, 200, letter) +
          '<line x1="400" y1="250" x2="48" y2="250" class="wire"/>';
      } else if (shape === "mixed_total") {
        body +=
          '<line x1="400" y1="72" x2="400" y2="250" class="wire"/>' +
          '<line x1="334" y1="200" x2="400" y2="200" class="wire"/>' +
          meter(230, 250, letter) +
          '<line x1="400" y1="250" x2="246" y2="250" class="wire"/>' +
          '<line x1="214" y1="250" x2="48" y2="250" class="wire"/>';
      } else {
        body +=
          '<line x1="400" y1="72" x2="400" y2="250" class="wire"/>' +
          '<line x1="334" y1="200" x2="400" y2="200" class="wire"/>' +
          '<line x1="400" y1="250" x2="48" y2="250" class="wire"/>' +
          '<line x1="210" y1="100" x2="210" y2="128" class="probe"/>' +
          '<line x1="400" y1="100" x2="400" y2="128" class="probe"/>' +
          '<line x1="210" y1="128" x2="274" y2="128" class="probe"/>' +
          '<line x1="306" y1="128" x2="400" y2="128" class="probe"/>' +
          meter(290, 128, letter);
      }
    }
    return '<svg viewBox="0 0 620 310" role="img" aria-hidden="true">' + body + "</svg>";
  }

  var api = {
    isHit: isHit,
    formatReading: formatReading,
    lessonBefore: lessonBefore,
    targetSentence: targetSentence,
    draw: draw
  };
  root.Resistor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : global);
