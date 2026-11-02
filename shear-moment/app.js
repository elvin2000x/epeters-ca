(function () {
  'use strict';
  var M = window.BenchMath;
  var quiz = [
    { L: 6, loads: [{ x: 2, p: 12 }, { x: 4, p: 12 }], decoys: [12, 30, 16] },
    { L: 10, loads: [{ x: 4, p: 10 }, { x: 6, p: 10 }], decoys: [20, 46, 32] },
    { L: 8, loads: [{ x: 2, p: 16 }, { x: 6, p: 8 }], decoys: [14, 34, 20] },
    { L: 8, loads: [{ x: 2, p: 10 }, { x: 6, p: 10 }], decoys: [10, 26, 12] }
  ];
  var mode = 'slide';
  var qi = 0;
  var slideX = 6;
  var board = document.getElementById('board');
  var ask = document.getElementById('ask');
  var meter = document.getElementById('meter');
  var progress = document.getElementById('progress');
  var choices = document.getElementById('choices');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var lockedBox = document.getElementById('locked');

  function tri(x, y) {
    return '<polygon points="' + x + ',' + y + ' ' + (x - 12) + ',' + (y + 22) + ' ' + (x + 12) + ',' + (y + 22) + '" fill="#0e1a2b"/>';
  }

  function draw(result, L, loads, showPeak) {
    var x0 = 56;
    var x1 = 600;
    var beamY = 70;
    function X(x) { return x0 + (x / L) * (x1 - x0); }
    var maxV = 1;
    var maxM = 1;
    result.segments.forEach(function (s) {
      maxV = Math.max(maxV, Math.abs(s.v));
      maxM = Math.max(maxM, Math.abs(s.m0), Math.abs(s.m1));
    });
    var shearY = 200;
    var momY = 340;
    var parts = [
      '<line x1="' + x0 + '" y1="' + beamY + '" x2="' + x1 + '" y2="' + beamY + '" stroke="#142033" stroke-width="4"/>',
      tri(x0, beamY),
      tri(x1, beamY),
      '<text x="' + x0 + '" y="' + (beamY + 40) + '" text-anchor="middle" font-size="13">' + result.Ra + ' kN</text>',
      '<text x="' + x1 + '" y="' + (beamY + 40) + '" text-anchor="middle" font-size="13">' + result.Rb + ' kN</text>'
    ];
    loads.forEach(function (q) {
      var x = X(q.x);
      parts.push('<line x1="' + x + '" y1="' + (beamY - 46) + '" x2="' + x + '" y2="' + (beamY - 8) + '" stroke="#8a6412" stroke-width="3"/>');
      parts.push('<polygon points="' + (x - 6) + ',' + (beamY - 16) + ' ' + (x + 6) + ',' + (beamY - 16) + ' ' + x + ',' + (beamY - 4) + '" fill="#8a6412"/>');
      parts.push('<text x="' + x + '" y="' + (beamY - 52) + '" text-anchor="middle" font-size="14">' + q.p + ' kN</text>');
    });
    parts.push('<line x1="' + x0 + '" y1="' + shearY + '" x2="' + x1 + '" y2="' + shearY + '" stroke="#c3cedd"/>');
    var d = '';
    result.segments.forEach(function (s, n) {
      var y = shearY - s.v * (62 / maxV);
      var a = X(s.x0);
      var b = X(s.x1);
      if (n === 0) d += 'M ' + a + ' ' + shearY + ' ';
      d += 'L ' + a + ' ' + y + ' L ' + b + ' ' + y + ' ';
      parts.push('<text x="' + ((a + b) / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="13" fill="#2450b8">' + s.v + '</text>');
    });
    d += 'L ' + X(L) + ' ' + shearY;
    parts.push('<path d="' + d + '" fill="none" stroke="#2450b8" stroke-width="3"/>');
    parts.push('<text x="8" y="150" font-size="13" fill="#55667d">Shear</text>');
    parts.push('<line x1="' + x0 + '" y1="' + momY + '" x2="' + x1 + '" y2="' + momY + '" stroke="#c3cedd"/>');
    var md = 'M ' + X(0) + ' ' + momY;
    result.segments.forEach(function (s) {
      md += ' L ' + X(s.x0) + ' ' + (momY - s.m0 * (78 / maxM));
      md += ' L ' + X(s.x1) + ' ' + (momY - s.m1 * (78 / maxM));
    });
    parts.push('<path d="' + md + '" fill="none" stroke="#0a7553" stroke-width="3"/>');
    parts.push('<text x="8" y="286" font-size="13" fill="#55667d">Moment</text>');
    if (showPeak) parts.push('<text x="320" y="420" text-anchor="middle" font-size="16">Peak moment ' + result.peak + ' kN·m</text>');
    board.innerHTML = '<svg viewBox="0 0 640 440" role="img" aria-label="A beam with shear and moment diagrams">' + parts.join('') + '</svg>';
  }

  function slideLoads() {
    return [{ x: 4, p: 10 }, { x: slideX, p: 10 }];
  }

  function showSlide() {
    progress.textContent = 'The picture';
    ask.textContent = 'A 10 m beam. Both loads are 10 kN. Slide the second load and watch the diagrams.';
    var result = M.beam(10, slideLoads());
    draw(result, 10, slideLoads(), true);
    choices.innerHTML = '<label class="slide">Second load at <strong id="at">' + slideX + ' m</strong><input id="slider" type="range" min="5" max="9" step="1" value="' + slideX + '"></label><p class="actions"><button type="button" class="btn primary" id="to-quiz">Read four peaks</button></p>';
    meter.className = 'meter';
    meter.textContent = 'Left support ' + result.Ra + ' kN. Right support ' + result.Rb + ' kN. The peak is the biggest area under the shear.';
    next.hidden = true;
    document.getElementById('slider').addEventListener('input', function (e) {
      slideX = Number(e.target.value);
      document.getElementById('at').textContent = slideX + ' m';
      var again = M.beam(10, slideLoads());
      draw(again, 10, slideLoads(), true);
      meter.textContent = 'Left support ' + again.Ra + ' kN. Right support ' + again.Rb + ' kN. The peak is the biggest area under the shear.';
    });
    document.getElementById('to-quiz').addEventListener('click', function () {
      mode = 'quiz';
      qi = 0;
      showQuiz();
    });
  }

  function showQuiz() {
    var q = quiz[qi];
    var result = M.beam(q.L, q.loads);
    progress.textContent = (qi + 1) + ' of ' + quiz.length;
    ask.textContent = 'What is the peak moment, in kN·m? The shear numbers are on the diagram. The moment number is not.';
    draw(result, q.L, q.loads, false);
    var options = [result.peak].concat(q.decoys).sort(function (a, b) { return a - b; });
    choices.innerHTML = '<div class="row"><span>Peak moment</span>' + options.map(function (n) {
      return '<button type="button" data-n="' + n + '">' + n + '</button>';
    }).join('') + '</div>';
    meter.className = 'meter';
    meter.textContent = 'Area under the shear, from the left end to the highest point.';
    next.hidden = true;
  }

  choices.addEventListener('click', function (e) {
    if (mode !== 'quiz') return;
    var b = e.target.closest('button');
    if (!b || !b.dataset.n) return;
    var result = M.beam(quiz[qi].L, quiz[qi].loads);
    var n = Number(b.dataset.n);
    if (n === result.peak) {
      meter.className = 'meter good';
      meter.textContent = result.peak + ' kN·m. That\'s the one.';
      next.hidden = false;
      Array.prototype.forEach.call(choices.querySelectorAll('button'), function (btn) { btn.disabled = true; });
    } else {
      meter.className = 'meter bad';
      meter.textContent = n + ' is not the peak. Use the shear numbers on the diagram.';
    }
  });

  next.addEventListener('click', function () {
    if (qi + 1 >= quiz.length) {
      play.hidden = true;
      lockedBox.hidden = false;
      return;
    }
    qi += 1;
    showQuiz();
  });

  showSlide();
})();
