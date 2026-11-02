(function () {
  'use strict';
  var M = window.BenchMath;
  var graphs = [
    { slopes: [1, 0, -1], ask: 'Forward, stop, then back. Mark the velocity of each piece.' },
    { slopes: [0, 2, 2], ask: 'The position stays put, then rises. Mark each piece.' },
    { slopes: [-1, -1, 0], ask: 'Coming back, then still. Mark each piece.' },
    { slopes: [1, -2, 0], ask: 'Out, back past the start, then still. Mark each piece.' }
  ];
  var names = ['First piece', 'Second piece', 'Third piece'];
  var kinds = [['pos', 'Forward'], ['zero', 'Still'], ['neg', 'Back']];
  var i = 0;
  var picks = [null, null, null];
  var board = document.getElementById('board');
  var ask = document.getElementById('ask');
  var meter = document.getElementById('meter');
  var progress = document.getElementById('progress');
  var choices = document.getElementById('choices');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var lockedBox = document.getElementById('locked');

  function picture(showVelocity) {
    var slopes = graphs[i].slopes;
    var pts = [{ x: 0, p: 0 }];
    var p = 0;
    var min = 0;
    var max = 0;
    slopes.forEach(function (s, n) {
      p += s;
      if (p < min) min = p;
      if (p > max) max = p;
      pts.push({ x: n + 1, p: p });
    });
    var span = Math.max(max - min, 1);
    function Y(pos) { return 28 + ((max - pos) / span) * 120; }
    var d = pts.map(function (pt, n) {
      var x = 36 + pt.x * 150;
      return (n ? 'L' : 'M') + x + ' ' + Y(pt.p);
    }).join(' ');
    var vel = '';
    if (showVelocity) {
      slopes.forEach(function (s, n) {
        var x = 36 + n * 150;
        var h = s * 18;
        var y = h < 0 ? 200 : 200 - h;
        vel += '<rect x="' + (x + 20) + '" y="' + y + '" width="110" height="' + Math.max(Math.abs(h), 2) + '" fill="#2450b8" opacity="0.85"/>';
      });
      vel += '<text x="270" y="248" text-anchor="middle" font-size="14" fill="#55667d">Velocity under the same three pieces</text>';
    }
    board.innerHTML = '<svg viewBox="0 0 540 260" role="img" aria-label="Position against time">' +
      '<line x1="36" y1="20" x2="36" y2="190" stroke="#c3cedd"/>' +
      '<line x1="36" y1="110" x2="510" y2="110" stroke="#c3cedd"/>' +
      '<path d="' + d + '" fill="none" stroke="#142033" stroke-width="3"/>' +
      '<text x="20" y="16" font-size="13" fill="#55667d">position</text>' +
      '<text x="470" y="128" font-size="13" fill="#55667d">time</text>' + vel + '</svg>';
  }

  function ready() {
    return picks.every(function (p, n) { return p === M.slopeKind(graphs[i].slopes[n]); });
  }

  function show() {
    picks = [null, null, null];
    progress.textContent = (i + 1) + ' of ' + graphs.length;
    ask.textContent = graphs[i].ask;
    choices.innerHTML = names.map(function (name, n) {
      return '<div class="row"><span>' + name + '</span>' + kinds.map(function (k) {
        return '<button type="button" data-i="' + n + '" data-k="' + k[0] + '">' + k[1] + '</button>';
      }).join('') + '</div>';
    }).join('');
    refresh();
  }

  function refresh() {
    var hit = ready();
    picture(hit);
    next.hidden = !hit;
    meter.className = 'meter' + (hit ? ' good' : '');
    if (hit) meter.textContent = 'The slope of position is the velocity. That\'s the one.';
    else if (picks.some(Boolean)) meter.textContent = 'Forward means the line rises. Back means it falls. Still is flat.';
    else meter.textContent = 'Mark each piece.';
    Array.prototype.forEach.call(choices.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(picks[Number(b.dataset.i)] === b.dataset.k));
    });
  }

  choices.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || ready()) return;
    picks[Number(b.dataset.i)] = b.dataset.k;
    refresh();
  });

  next.addEventListener('click', function () {
    if (i + 1 >= graphs.length) {
      play.hidden = true;
      lockedBox.hidden = false;
      return;
    }
    i += 1;
    show();
  });

  show();
})();
