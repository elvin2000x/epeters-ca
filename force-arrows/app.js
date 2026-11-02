(function () {
  'use strict';
  var M = window.BenchMath;
  var puzzles = [
    { fixed: [], target: { fx: 20, fy: 0 }, ask: 'Make the net force 20 N to the right.' },
    { fixed: [{ d: 'R', n: 10 }], target: { fx: 20, fy: 0 }, ask: 'A 10 N arrow already points right. Make the net 20 N right.' },
    { fixed: [{ d: 'R', n: 20 }], target: { fx: 10, fy: 0 }, ask: 'Bring that arrow down to a net of 10 N right.' },
    { fixed: [{ d: 'U', n: 10 }], target: { fx: 10, fy: 10 }, ask: 'Keep the 10 N up. Add 10 N to the right.' },
    { fixed: [{ d: 'R', n: 10 }, { d: 'L', n: 10 }], target: { fx: 0, fy: 15 }, ask: 'The sideways pair already cancels. Make the net 15 N up.' },
    { fixed: [{ d: 'R', n: 20 }, { d: 'U', n: 20 }], target: { fx: 0, fy: 0 }, ask: 'Cancel both arrows. The net is zero.' },
    { fixed: [{ d: 'L', n: 5 }], target: { fx: -10, fy: 0 }, ask: 'Make the net 10 N to the left.' },
    { fixed: [{ d: 'R', n: 15 }, { d: 'U', n: 5 }], target: { fx: 15, fy: 0 }, ask: 'Leave the 15 N right. Cancel the upward arrow.' },
    { fixed: [{ d: 'U', n: 20 }], target: { fx: 10, fy: 10 }, ask: 'Make the net 10 N right and 10 N up.' },
    { fixed: [{ d: 'R', n: 10 }, { d: 'L', n: 10 }, { d: 'U', n: 10 }], target: { fx: 0, fy: 0 }, ask: 'Cancel the upward arrow. The net is zero.' }
  ];
  var i = 0;
  var added = [];
  var dir = 'R';
  var size = 10;
  var locked = false;
  var board = document.getElementById('board');
  var ask = document.getElementById('ask');
  var meter = document.getElementById('meter');
  var progress = document.getElementById('progress');
  var choices = document.getElementById('choices');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var lockedBox = document.getElementById('locked');

  function words(n) {
    function side(v, pos, neg) {
      if (v > 0) return v + ' N ' + pos;
      if (v < 0) return (-v) + ' N ' + neg;
      return '';
    }
    var x = side(n.fx, 'right', 'left');
    var y = side(n.fy, 'up', 'down');
    if (!x && !y) return 'Net: zero';
    return 'Net: ' + [x, y].filter(Boolean).join(' and ');
  }

  function arrow(a, slot, gold) {
    var len = 28 + a.n * 2;
    var ox = 0;
    var oy = 0;
    if (a.d === 'R' || a.d === 'L') oy = (slot - 1) * 16;
    else ox = (slot - 1) * 16;
    var dx = a.d === 'R' ? len : a.d === 'L' ? -len : 0;
    var dy = a.d === 'D' ? len : a.d === 'U' ? -len : 0;
    var x1 = 200 + ox;
    var y1 = 150 + oy;
    var x2 = x1 + dx;
    var y2 = y1 + dy;
    var color = gold ? '#8a6412' : '#2450b8';
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + color + '" stroke-width="4" marker-end="url(#ah)" />';
  }

  function draw() {
    var p = puzzles[i];
    var slots = { R: 0, L: 0, U: 0, D: 0 };
    var lines = [];
    p.fixed.concat(added).forEach(function (a, idx) {
      slots[a.d] += 1;
      lines.push(arrow(a, slots[a.d], idx >= p.fixed.length));
    });
    board.innerHTML = '<svg viewBox="0 0 400 300" role="img" aria-label="A block and the arrows on it">' +
      '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#142033"/></marker></defs>' +
      lines.join('') +
      '<rect x="176" y="126" width="48" height="48" rx="6" fill="#e6ebf1" stroke="#142033" stroke-width="3"/>' +
      '</svg>';
  }

  function renderChoices() {
    var dirs = [['R', 'Right'], ['L', 'Left'], ['U', 'Up'], ['D', 'Down']];
    var sizes = [5, 10, 15, 20];
    choices.innerHTML =
      '<div class="row"><span>Direction</span>' + dirs.map(function (d) {
        return '<button type="button" data-dir="' + d[0] + '" aria-pressed="' + (dir === d[0]) + '">' + d[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="row"><span>Size</span>' + sizes.map(function (n) {
        return '<button type="button" data-size="' + n + '" aria-pressed="' + (size === n) + '">' + n + ' N</button>';
      }).join('') + '</div>' +
      '<div class="row"><button type="button" id="add">Add arrow</button><button type="button" id="undo">Remove last</button></div>';
  }

  function show() {
    var p = puzzles[i];
    progress.textContent = (i + 1) + ' of ' + puzzles.length;
    ask.textContent = p.ask;
    renderChoices();
    refresh();
  }

  function refresh() {
    var p = puzzles[i];
    var all = p.fixed.concat(added);
    var n = M.net(all);
    draw();
    var hit = M.sameNet(n, p.target);
    meter.className = 'meter' + (hit ? ' good' : '');
    meter.textContent = hit ? words(n) + '. That\'s the one.' : words(n);
    next.hidden = !hit;
    locked = hit;
    var room = all.length >= 4;
    var add = document.getElementById('add');
    if (add) add.disabled = room || hit;
    var undo = document.getElementById('undo');
    if (undo) undo.disabled = !added.length || hit;
  }

  choices.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || locked) return;
    if (b.dataset.dir) dir = b.dataset.dir;
    if (b.dataset.size) size = Number(b.dataset.size);
    if (b.id === 'add') {
      var p = puzzles[i];
      if (p.fixed.length + added.length < 4) added.push({ d: dir, n: size });
    }
    if (b.id === 'undo') added.pop();
    if (b.dataset.dir || b.dataset.size) renderChoices();
    refresh();
  });

  next.addEventListener('click', function () {
    if (i + 1 >= puzzles.length) {
      play.hidden = true;
      lockedBox.hidden = false;
      return;
    }
    i += 1;
    added = [];
    locked = false;
    show();
  });

  show();
})();
