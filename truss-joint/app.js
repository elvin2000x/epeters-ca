(function () {
  'use strict';
  var M = window.BenchMath;
  var joints = [
    { load: 15, tTray: [15, 25, 40], hTray: [10, 20, 30], ask: 'The load is 15 kN down. Choose the two tensions.' },
    { load: 30, tTray: [25, 40, 50], hTray: [20, 40, 60], ask: 'The load is 30 kN down. Choose the two tensions.' },
    { load: 9, tTray: [9, 15, 25], hTray: [12, 15, 20], ask: 'The load is 9 kN down. Choose the two tensions.' },
    { load: 21, tTray: [21, 35, 45], hTray: [20, 28, 35], ask: 'The load is 21 kN down. Choose the two tensions.' }
  ];
  var i = 0;
  var T = null;
  var H = null;
  var board = document.getElementById('board');
  var ask = document.getElementById('ask');
  var meter = document.getElementById('meter');
  var progress = document.getElementById('progress');
  var choices = document.getElementById('choices');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var lockedBox = document.getElementById('locked');

  function draw() {
    var tLabel = T == null ? '?' : T + ' kN';
    var hLabel = H == null ? '?' : H + ' kN';
    board.innerHTML = '<svg viewBox="0 0 460 280" role="img" aria-label="One joint, two members, and a downward load">' +
      '<line x1="220" y1="150" x2="400" y2="150" stroke="#142033" stroke-width="4"/>' +
      '<line x1="220" y1="150" x2="60" y2="30" stroke="#142033" stroke-width="4"/>' +
      '<line x1="220" y1="150" x2="220" y2="230" stroke="#8a6412" stroke-width="3"/>' +
      '<polygon points="212,214 228,214 220,230" fill="#8a6412"/>' +
      '<circle cx="220" cy="150" r="7" fill="#2450b8"/>' +
      '<text x="300" y="142" text-anchor="middle" font-size="15">H ' + hLabel + '</text>' +
      '<text x="110" y="78" font-size="15">T ' + tLabel + '</text>' +
      '<text x="236" y="210" font-size="15">' + joints[i].load + ' kN</text>' +
      '<text x="230" y="262" font-size="13" fill="#55667d">3-4-5 slope. Tension pulls the joint toward each member.</text>' +
      '</svg>';
  }

  function side(v, pos, neg) {
    if (!v) return '';
    return Math.abs(v) + ' kN ' + (v > 0 ? pos : neg);
  }

  function show() {
    T = null;
    H = null;
    var q = joints[i];
    progress.textContent = (i + 1) + ' of ' + joints.length;
    ask.textContent = q.ask;
    choices.innerHTML =
      '<div class="row"><span>Diagonal tension T</span>' + q.tTray.map(function (n) {
        return '<button type="button" data-t="' + n + '">' + n + ' kN</button>';
      }).join('') + '</div>' +
      '<div class="row"><span>Horizontal tension H</span>' + q.hTray.map(function (n) {
        return '<button type="button" data-h="' + n + '">' + n + ' kN</button>';
      }).join('') + '</div>';
    refresh();
  }

  function refresh() {
    draw();
    var hit = false;
    if (T == null || H == null) {
      meter.className = 'meter';
      meter.textContent = 'Vertical part of T is 3/5 of T. Horizontal part is 4/5 of T.';
    } else {
      var j = M.joint(T, H, joints[i].load);
      hit = j.fx === 0 && j.fy === 0;
      meter.className = 'meter' + (hit ? ' good' : ' bad');
      if (hit) meter.textContent = 'Both leftover forces are zero. That\'s the one.';
      else {
        var bits = [side(j.fx / 5, 'right', 'left'), side(j.fy / 5, 'up', 'down')].filter(Boolean);
        meter.textContent = 'Leftover ' + bits.join(' and ') + '.';
      }
    }
    next.hidden = !hit;
    Array.prototype.forEach.call(choices.querySelectorAll('button'), function (b) {
      if (b.dataset.t) b.setAttribute('aria-pressed', String(Number(b.dataset.t) === T));
      if (b.dataset.h) b.setAttribute('aria-pressed', String(Number(b.dataset.h) === H));
    });
  }

  choices.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (T != null && H != null && M.joint(T, H, joints[i].load).fx === 0 && M.joint(T, H, joints[i].load).fy === 0) return;
    if (b.dataset.t) T = Number(b.dataset.t);
    if (b.dataset.h) H = Number(b.dataset.h);
    refresh();
  });

  next.addEventListener('click', function () {
    if (i + 1 >= joints.length) {
      play.hidden = true;
      lockedBox.hidden = false;
      return;
    }
    i += 1;
    show();
  });

  show();
})();
