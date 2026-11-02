(function () {
  'use strict';
  var E = window.Enlightened;
  var D = window.EnlightenedItems;
  var seq = E.track(D.lessons, D.items);
  var key = 'enlightened-at';
  var at = 0;
  try { at = Math.max(0, Math.min(seq.length, Number(localStorage.getItem(key) || 0))); } catch (e) { at = 0; }

  var progress = document.getElementById('progress');
  var title = document.getElementById('title');
  var ask = document.getElementById('ask');
  var passage = document.getElementById('passage');
  var copy = document.getElementById('copy');
  var choices = document.getElementById('choices');
  var meter = document.getElementById('meter');
  var next = document.getElementById('next');
  var play = document.getElementById('play');
  var done = document.getElementById('locked');
  var track = document.getElementById('track');
  var locked = false;

  function save() {
    try { localStorage.setItem(key, String(at)); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function levelCount(level) {
    return D.items.filter(function (item) { return item.level === level; }).length;
  }

  function levelIndex(item) {
    var n = 0;
    for (var i = 0; i < D.items.length; i++) {
      if (D.items[i].level !== item.level) continue;
      n += 1;
      if (D.items[i] === item) return n;
    }
    return n;
  }

  function paintTrack(level) {
    track.innerHTML = D.lessons.map(function (lesson) {
      return '<span class="' + (lesson.level === level ? 'now' : '') + '">' + esc(lesson.name) + '</span>';
    }).join('');
  }

  function buttons(list) {
    choices.innerHTML = '<div class="row">' + list.map(function (choice) {
      return '<button type="button" data-id="' + esc(choice.id) + '">' + esc(choice.text) + '</button>';
    }).join('') + '</div>';
    choices.hidden = false;
  }

  function showLesson(lesson) {
    locked = false;
    paintTrack(lesson.level);
    progress.textContent = 'Idea ' + lesson.level + ' of ' + D.lessons.length;
    title.textContent = lesson.title;
    ask.hidden = true;
    passage.hidden = true;
    copy.hidden = false;
    copy.innerHTML = lesson.blocks.map(function (block) {
      return '<p class="' + block.kind + '">' + esc(block.text) + '</p>';
    }).join('');
    choices.hidden = true;
    meter.textContent = '';
    next.hidden = false;
    next.textContent = 'Try it';
  }

  function choiceList(item) {
    if (item.kind === 'parts') return item.sentences;
    if (item.kind === 'follows') {
      return [{ id: 'yes', text: 'It follows' }, { id: 'no', text: 'It does not follow' }];
    }
    return item.choices;
  }

  function missFor(item, id) {
    if (item.kind === 'follows') return item.reading;
    var list = item.kind === 'parts' ? item.sentences : item.choices;
    var found = list.filter(function (choice) { return choice.id === id; })[0];
    return found && found.miss ? found.miss : 'Try another.';
  }

  function showDrill(item) {
    locked = false;
    var lesson = D.lessons.filter(function (row) { return row.level === item.level; })[0];
    paintTrack(item.level);
    progress.textContent = levelIndex(item) + ' of ' + levelCount(item.level);
    title.textContent = lesson.name;
    ask.hidden = false;
    ask.textContent = item.ask;
    if (item.passage || (item.claim && item.claim.words)) {
      passage.hidden = false;
      passage.textContent = item.passage || item.claim.words;
    } else {
      passage.hidden = true;
    }
    copy.hidden = true;
    buttons(choiceList(item));
    meter.className = 'meter';
    meter.textContent = 'Pick one.';
    next.hidden = true;
  }

  function show() {
    if (at >= seq.length) {
      play.hidden = true;
      done.hidden = false;
      paintTrack(0);
      return;
    }
    play.hidden = false;
    done.hidden = true;
    var step = seq[at];
    if (step.type === 'lesson') showLesson(step.lesson);
    else showDrill(step.item);
  }

  choices.addEventListener('click', function (e) {
    var button = e.target.closest('button');
    if (!button || locked) return;
    var step = seq[at];
    if (!step || step.type !== 'drill') return;
    var item = step.item;
    var id = button.getAttribute('data-id');
    var right = E.correctId(item);
    if (id === right) {
      locked = true;
      meter.className = 'meter good';
      var line = item.kind === 'follows' ? item.reading : item.hit;
      meter.textContent = line + ' That\'s the one.';
      Array.prototype.forEach.call(choices.querySelectorAll('button'), function (node) {
        node.disabled = true;
      });
      next.hidden = false;
      next.textContent = at + 1 >= seq.length ? 'Finish' : (seq[at + 1].type === 'lesson' ? 'Next idea' : 'Next');
    } else {
      meter.className = 'meter bad';
      meter.textContent = missFor(item, id);
    }
  });

  next.addEventListener('click', function () {
    at += 1;
    save();
    show();
  });

  document.getElementById('again').addEventListener('click', function () {
    at = 0;
    save();
    show();
  });

  show();
})();
