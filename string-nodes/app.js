(function () {
  'use strict';
  var M = window.BenchMath;
  var V = 24;
  var goals = [2, 3, 4, 5];
  var lengths = [1, 2, 3, 4];
  var freqs = [6, 8, 12, 18, 24];
  var i = 0;
  var L = 2;
  var f = 12;
  var board = document.getElementById('board');
  var ask = document.getElementById('ask');
  var meter = document.getElementById('meter');
  var progress = document.getElementById('progress');
  var choices = document.getElementById('choices');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var lockedBox = document.getElementById('locked');

  function picture(info, reveal) {
    var n = info ? info.n : 0;
    var d = '';
    var dots = '';
    if (n) {
      for (var k = 0; k <= 240; k++) {
        var t = k / 240;
        var x = 40 + t * 560;
        var y = 78 - Math.sin(n * Math.PI * t) * 46;
        d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      }
      for (var j = 0; j <= n; j++) {
        dots += '<circle cx="' + (40 + (j / n) * 560) + '" cy="78" r="5" fill="#8a6412"/>';
      }
    } else {
      d = 'M 40 78 L 600 78';
    }
    var caption = !n ? 'Not a standing wave' : (reveal ? (info.nodes + ' nodes, counting both ends') : 'Count the gold dots, including both ends');
    board.innerHTML = '<svg viewBox="0 0 640 150" role="img" aria-label="A string fixed at both ends">' +
      '<path d="' + d + '" fill="none" stroke="#2450b8" stroke-width="3"/>' + dots +
      '<text x="320" y="132" text-anchor="middle" font-size="15" fill="#142033">' + caption + '</text></svg>';
  }

  function show() {
    progress.textContent = (i + 1) + ' of ' + goals.length;
    ask.textContent = 'Make a standing wave with ' + goals[i] + ' nodes, counting both ends. Wave speed is 24 m/s.';
    choices.innerHTML =
      '<div class="row"><span>Length</span>' + lengths.map(function (n) {
        return '<button type="button" data-l="' + n + '">' + n + ' m</button>';
      }).join('') + '</div>' +
      '<div class="row"><span>Frequency</span>' + freqs.map(function (n) {
        return '<button type="button" data-f="' + n + '">' + n + ' Hz</button>';
      }).join('') + '</div>';
    refresh();
  }

  function refresh() {
    var info = M.harmonic(L, f, V);
    var hit = !!(info && info.nodes === goals[i]);
    picture(info, hit);
    next.hidden = !hit;
    meter.className = 'meter' + (hit ? ' good' : '');
    if (hit) meter.textContent = 'n = 2 × length × frequency ÷ 24 = ' + info.n + '. Nodes = n + 1. That\'s the one.';
    else if (!info) meter.textContent = '2 × ' + L + ' × ' + f + ' does not divide 24 into a whole harmonic.';
    else meter.textContent = 'Count the gold dots, including both ends.';
    Array.prototype.forEach.call(choices.querySelectorAll('button'), function (b) {
      if (b.dataset.l) b.setAttribute('aria-pressed', String(Number(b.dataset.l) === L));
      if (b.dataset.f) b.setAttribute('aria-pressed', String(Number(b.dataset.f) === f));
    });
  }

  choices.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var info = M.harmonic(L, f, V);
    if (info && info.nodes === goals[i]) return;
    if (b.dataset.l) L = Number(b.dataset.l);
    if (b.dataset.f) f = Number(b.dataset.f);
    refresh();
  });

  next.addEventListener('click', function () {
    if (i + 1 >= goals.length) {
      play.hidden = true;
      lockedBox.hidden = false;
      return;
    }
    i += 1;
    show();
  });

  show();
})();
