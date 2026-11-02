(function () {
  'use strict';
  var M = window.BenchMath;
  var puzzles = [
    { lw: 20, ld: 2, ask: '20 N sits 2 m left of the fulcrum. Balance the plank.' },
    { lw: 30, ld: 2, ask: '30 N sits 2 m left. Balance the plank.' },
    { lw: 10, ld: 3, ask: '10 N sits 3 m left. Balance the plank.' },
    { lw: 40, ld: 1, ask: '40 N sits 1 m left. Balance the plank.' },
    { lw: 20, ld: 3, ask: '20 N sits 3 m left. Balance the plank.' },
    { lw: 10, ld: 1, ask: '10 N sits 1 m left. Balance the plank.' },
    { lw: 40, ld: 2, ask: '40 N sits 2 m left. Balance the plank.' },
    { lw: 30, ld: 1, ask: '30 N sits 1 m left. Balance the plank.' }
  ];
  var weights = [10, 20, 30, 40];
  var dists = [1, 2, 3];
  var i = 0;
  var rw = null;
  var rd = null;
  var board = document.getElementById('board');
  var ask = document.getElementById('ask');
  var meter = document.getElementById('meter');
  var progress = document.getElementById('progress');
  var choices = document.getElementById('choices');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var lockedBox = document.getElementById('locked');

  function draw(tilt) {
    var p = puzzles[i];
    var rx = rw ? 250 + rd * 40 : 300;
    var right = rw ? '<rect x="' + (rx - 16) + '" y="78" width="32" height="22" fill="#8a6412"/><text x="' + rx + '" y="74" text-anchor="middle" font-size="14">' + rw + ' N</text>' : '';
    board.innerHTML = '<svg viewBox="0 0 520 220" role="img" aria-label="A plank on a fulcrum">' +
      '<g transform="rotate(' + tilt + ' 260 120)">' +
      '<rect x="70" y="108" width="380" height="12" rx="4" fill="#142033"/>' +
      '<rect x="' + (260 - p.ld * 40 - 16) + '" y="78" width="32" height="22" fill="#2450b8"/>' +
      '<text x="' + (260 - p.ld * 40) + '" y="74" text-anchor="middle" font-size="14">' + p.lw + ' N</text>' +
      right +
      '</g>' +
      '<polygon points="260,128 240,168 280,168" fill="#0e1a2b"/>' +
      '</svg>';
  }

  function show() {
    var p = puzzles[i];
    progress.textContent = (i + 1) + ' of ' + puzzles.length;
    ask.textContent = p.ask;
    rw = null;
    rd = null;
    choices.innerHTML =
      '<div class="row"><span>Right-hand weight</span>' + weights.map(function (n) {
        return '<button type="button" data-w="' + n + '">' + n + ' N</button>';
      }).join('') + '</div>' +
      '<div class="row"><span>Metres from the fulcrum</span>' + dists.map(function (n) {
        return '<button type="button" data-d="' + n + '">' + n + ' m</button>';
      }).join('') + '</div>';
    refresh();
  }

  function refresh() {
    var p = puzzles[i];
    var state = rw && rd ? M.seesaw(p.lw, p.ld, rw, rd) : null;
    var tilt = state === 'left' ? -8 : state === 'right' ? 8 : 0;
    draw(tilt);
    next.hidden = state !== 'balance';
    meter.className = 'meter' + (state === 'balance' ? ' good' : state ? ' bad' : '');
    if (!state) meter.textContent = 'Torque is weight times metres. Pick a weight and a distance.';
    else if (state === 'balance') meter.textContent = (p.lw * p.ld) + ' N·m each side. It balances.';
    else meter.textContent = 'It tips to the ' + state + '. ' + (p.lw * p.ld) + ' N·m on the left, ' + (rw * rd) + ' N·m on the right.';
    Array.prototype.forEach.call(choices.querySelectorAll('button'), function (b) {
      if (b.dataset.w) b.setAttribute('aria-pressed', String(Number(b.dataset.w) === rw));
      if (b.dataset.d) b.setAttribute('aria-pressed', String(Number(b.dataset.d) === rd));
    });
  }

  choices.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.w) rw = Number(b.dataset.w);
    if (b.dataset.d) rd = Number(b.dataset.d);
    refresh();
  });

  next.addEventListener('click', function () {
    if (i + 1 >= puzzles.length) {
      play.hidden = true;
      lockedBox.hidden = false;
      return;
    }
    i += 1;
    show();
  });

  show();
})();
