(function () {
  'use strict';
  var E = window.Enlightened;
  var D = window.EnlightenedItems;
  var B = window.EnlightenedBank;
  var all = D.items.concat(B.items);
  var KEY = 'enlightened-train';

  var home = document.getElementById('home');
  var moves = document.getElementById('moves');
  var homeActions = document.getElementById('home-actions');
  var homeNote = document.getElementById('home-note');
  var play = document.getElementById('play');
  var workshop = document.getElementById('workshop');
  var rules = document.getElementById('rules');
  var progress = document.getElementById('progress');
  var title = document.getElementById('title');
  var ask = document.getElementById('ask');
  var passage = document.getElementById('passage');
  var credit = document.getElementById('credit');
  var copy = document.getElementById('copy');
  var prep = document.getElementById('prep');
  var choices = document.getElementById('choices');
  var meter = document.getElementById('meter');
  var clock = document.getElementById('clock');
  var next = document.getElementById('next');
  var hintBtn = document.getElementById('hint');
  var track = document.getElementById('track');

  var state = load();
  var run = null;
  var locked = false;
  var started = 0;
  var tick = null;

  function load() {
    var blank = { lessons: {}, drills: {}, misses: [], timer: false };
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank;
      var parsed = JSON.parse(raw);
      parsed.lessons = parsed.lessons || {};
      parsed.drills = parsed.drills || {};
      parsed.misses = parsed.misses || [];
      parsed.timer = !!parsed.timer;
      return parsed;
    } catch (e) {
      return blank;
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function lessonOf(level) {
    return D.lessons.filter(function (lesson) { return lesson.level === level; })[0];
  }

  function ruleOf(level) {
    var lesson = lessonOf(level);
    var block = lesson.blocks.filter(function (b) { return b.kind === 'rule'; })[0];
    return block ? block.text : lesson.title;
  }

  function drillsOf(level, pass) {
    return all.filter(function (item) { return item.level === level && (item.pass || 1) === pass; });
  }

  function passDone(level, pass) {
    var list = drillsOf(level, pass);
    if (!list.length) return false;
    return list.every(function (item) {
      var rec = state.drills[item.id];
      return rec && rec.correct;
    });
  }

  function passClean(level, pass) {
    var list = drillsOf(level, pass);
    if (!list.length) return false;
    return list.every(function (item) {
      var rec = state.drills[item.id];
      return rec && rec.correct && rec.firstTry && !rec.assisted;
    });
  }

  function moveOpen(level) {
    if (level === 1) return true;
    return passDone(level - 1, 1);
  }

  function allPass1() {
    return [1, 2, 3, 4, 5].every(function (n) { return passDone(n, 1); });
  }

  function byId(id) {
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function showOnly(which) {
    home.hidden = which !== 'home';
    play.hidden = which !== 'play';
    workshop.hidden = which !== 'workshop';
    rules.hidden = which !== 'rules';
  }

  function stopClock() {
    if (tick) clearInterval(tick);
    tick = null;
    clock.textContent = '';
  }

  function armClock() {
    stopClock();
    if (!state.timer || !run) return;
    started = Date.now();
    clock.textContent = '0s';
    tick = setInterval(function () {
      clock.textContent = Math.floor((Date.now() - started) / 1000) + 's';
    }, 500);
  }

  function paintTrack(level) {
    track.innerHTML = D.lessons.map(function (lesson) {
      var open = moveOpen(lesson.level);
      var cls = lesson.level === level ? 'now' : '';
      return '<span class="' + cls + '">' + esc(lesson.name) + (open ? '' : ' · later') + '</span>';
    }).join('');
  }

  function jobPlain(job) {
    var names = {
      repeat: 'repeating the reason',
      person: 'naming the person',
      topic: 'changing the subject',
      extra: 'adding a sentence that does no work',
      reason: 'picking the reason',
      claim: 'picking the claim',
      reverse: 'running the bridge backwards',
      decoy: 'a case that does not break the sentence',
      weakens: 'only weakening the reason',
      aside: 'an aside'
    };
    return names[job] || 'a near miss';
  }

  function missOrder() {
    var tally = {};
    (state.misses || []).forEach(function (id) {
      var job = (state.drills[id] || {}).missJob || 'other';
      tally[job] = (tally[job] || 0) + 1;
    });
    var ranked = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
    var items = (state.misses || []).map(byId).filter(Boolean);
    items.sort(function (a, b) {
      var ja = (state.drills[a.id] || {}).missJob || 'other';
      var jb = (state.drills[b.id] || {}).missJob || 'other';
      return ranked.indexOf(ja) - ranked.indexOf(jb);
    });
    return { items: items, top: ranked[0] || '', tally: tally };
  }

  function renderHome() {
    run = null;
    locked = false;
    stopClock();
    showOnly('home');
    paintTrack(0);
    moves.innerHTML = D.lessons.map(function (lesson) {
      var open = moveOpen(lesson.level);
      var seen = !!state.lessons[lesson.level];
      var p1 = passDone(lesson.level, 1);
      var p2 = passDone(lesson.level, 2);
      var badge = '';
      if (passClean(lesson.level, 1) && passClean(lesson.level, 2)) badge = 'Clean twice';
      else if (p1 && p2) badge = 'Both passes done';
      else if (p1) badge = 'Pass 1 done';
      var n1 = drillsOf(lesson.level, 1).length;
      var got = drillsOf(lesson.level, 1).filter(function (item) {
        var rec = state.drills[item.id];
        return rec && rec.firstTry && rec.correct && !rec.assisted;
      }).length;
      return '<article class="move' + (open ? '' : ' shut') + '">' +
        '<h2>' + esc(lesson.name) + '</h2>' +
        '<p>' + esc(lesson.title) + '</p>' +
        '<p class="tease">Pass 1: ' + got + ' of ' + n1 + ' first-try clean.</p>' +
        (badge ? '<p class="badge">' + esc(badge) + '</p>' : '') +
        '<p class="actions">' +
        (open
          ? '<button type="button" class="btn" data-act="lesson" data-level="' + lesson.level + '">Read the idea</button>'
          : '<span class="tease">Finish the previous pass first.</span>') +
        (open && seen ? '<button type="button" class="btn" data-act="pass" data-level="' + lesson.level + '" data-pass="1">Pass 1</button>' : '') +
        (open && seen && p1 ? '<button type="button" class="btn" data-act="pass" data-level="' + lesson.level + '" data-pass="2">Pass 2</button>' : '') +
        '</p></article>';
    }).join('');

    var mixed = allPass1();
    var misses = missOrder();
    var buttons = [
      ['daily', 'Today’s drill'],
      ['miss', 'Misses (' + misses.items.length + ')'],
      ['chips', 'Name the pattern'],
      ['build', 'Build an argument'],
      ['reply', 'Write a reply'],
      ['old', 'Casaubon paragraph'],
      ['rules', 'Five rules'],
      ['timer', state.timer ? 'Timer on' : 'Timer off']
    ];
    if (mixed) buttons.splice(2, 0, ['mixed', 'Mixed review']);
    homeActions.innerHTML = buttons.map(function (pair) {
      return '<button type="button" class="btn" data-act="' + pair[0] + '">' + esc(pair[1]) + '</button>';
    }).join('');
    homeNote.textContent = misses.top
      ? 'You miss most often by ' + jobPlain(misses.top) + '. The next move opens when the previous pass 1 is complete.'
      : 'The next move opens when the previous pass 1 is complete. Clean twice is the badge for a first-try on both passes.';
  }

  function buttons(list) {
    choices.innerHTML = '<div class="row">' + list.map(function (choice) {
      return '<button type="button" data-id="' + esc(choice.id) + '">' + esc(choice.text) + '</button>';
    }).join('') + '</div>';
    choices.hidden = false;
  }

  function choiceList(item) {
    if (run && run.chips && item.shape) {
      return E.chipSet(item.shape).map(function (shape) {
        var words = E.shapeWords[shape] || shape;
        return { id: shape, text: words.split('. ')[0] };
      });
    }
    if (item.kind === 'parts') return item.sentences;
    if (item.kind === 'follows') return [{ id: 'yes', text: 'It follows' }, { id: 'no', text: 'It does not follow' }];
    return item.choices;
  }

  function showRuleCard() {
    var level = run.list[0].level;
    var lesson = lessonOf(level);
    locked = false;
    showOnly('play');
    paintTrack(level);
    progress.textContent = run.title;
    title.textContent = 'Say the rule';
    ask.hidden = true;
    passage.hidden = true;
    credit.hidden = true;
    prep.hidden = true;
    copy.hidden = false;
    copy.innerHTML = '<p class="rule">' + esc(ruleOf(level)) + '</p><p class="tease">' + esc(lesson.title) + '</p>';
    choices.hidden = true;
    meter.textContent = '';
    hintBtn.hidden = true;
    next.hidden = false;
    next.textContent = 'Start the drills';
  }

  function showLesson(level) {
    var lesson = lessonOf(level);
    run = { kind: 'lesson', level: level };
    locked = false;
    showOnly('play');
    paintTrack(level);
    progress.textContent = 'Idea ' + level + ' of 5';
    title.textContent = lesson.title;
    ask.hidden = true;
    passage.hidden = true;
    credit.hidden = true;
    prep.hidden = true;
    copy.hidden = false;
    copy.innerHTML = lesson.blocks.map(function (block) {
      return '<p class="' + block.kind + '">' + esc(block.text) + '</p>';
    }).join('');
    choices.hidden = true;
    meter.textContent = '';
    hintBtn.hidden = true;
    next.hidden = false;
    next.textContent = 'Try pass 1';
    stopClock();
  }

  function currentItem() {
    if (!run || run.kind !== 'list') return null;
    var step = run.list[run.at];
    return step && step.item ? step.item : null;
  }

  function showDrill(item) {
    locked = false;
    state.hinted = false;
    showOnly('play');
    paintTrack(run.hideMove ? 0 : item.level);
    var drills = run.list.filter(function (step) { return step.item; });
    var n = 0;
    drills.forEach(function (step, i) { if (step.item === item) n = i + 1; });
    progress.textContent = run.hideMove
      ? ('Mixed ' + n + ' of ' + drills.length)
      : (lessonOf(item.level).name + ' · ' + n + ' of ' + drills.length);
    title.textContent = run.hideMove ? 'Mixed' : lessonOf(item.level).title;
    copy.hidden = true;
    ask.hidden = false;
    ask.textContent = run.chips ? 'Which pattern is this?' : item.ask;
    prep.hidden = !(item.kind === 'follows' && !run.chips);
    prep.textContent = 'Say the claim in a few words, then pick.';
    if (item.passage) {
      passage.hidden = false;
      passage.textContent = item.passage;
    } else if (item.kind === 'parts') {
      passage.hidden = true;
    } else if (item.claim && item.claim.words) {
      passage.hidden = false;
      passage.textContent = item.claim.words;
    } else {
      passage.hidden = true;
    }
    if (item.credit) {
      credit.hidden = false;
      credit.textContent = item.credit;
    } else {
      credit.hidden = true;
    }
    buttons(choiceList(item));
    meter.textContent = '';
    hintBtn.hidden = false;
    next.hidden = true;
    armClock();
  }

  function startList(list, title, opts) {
    opts = opts || {};
    if (!list.length) {
      renderHome();
      homeNote.textContent = 'Nothing in that list yet.';
      return;
    }
    var steps = list.map(function (item) { return { item: item, level: item.level }; });
    if (!opts.skipRule) steps.unshift({ rule: true, level: list[0].level });
    run = {
      kind: 'list',
      list: steps,
      at: 0,
      title: title,
      chips: !!opts.chips,
      hideMove: !!opts.hideMove
    };
    if (steps[0].rule) showRuleCard();
    else showDrill(steps[0].item);
  }

  function grade(item, picked, right, job) {
    var rec = state.drills[item.id] || { tries: 0, firstTry: false, correct: false, assisted: false };
    var fresh = rec.tries === 0;
    rec.tries += 1;
    var seconds = state.timer ? Math.max(1, Math.floor((Date.now() - started) / 1000)) : 0;
    if (seconds) rec.seconds = seconds;
    if (picked === right) {
      rec.correct = true;
      if (fresh && !state.hinted) rec.firstTry = true;
      if (state.hinted) rec.assisted = true;
      state.misses = (state.misses || []).filter(function (id) { return id !== item.id; });
    } else {
      rec.correct = false;
      rec.firstTry = false;
      if (job) rec.missJob = job;
      if ((state.misses || []).indexOf(item.id) === -1) state.misses.push(item.id);
    }
    state.drills[item.id] = rec;
    state.hinted = false;
    save();
  }

  function missFor(item, id) {
    var list = item.kind === 'parts' ? item.sentences : (item.choices || []);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function onPick(id) {
    var item = currentItem();
    if (!item || locked) return;
    var right = run.chips ? item.shape : E.correctId(item);
    var chosen = missFor(item, id);
    var job = chosen && chosen.job ? chosen.job : (chosen && chosen.role ? chosen.role : '');
    grade(item, id, right, job);
    Array.prototype.forEach.call(choices.querySelectorAll('button'), function (btn) {
      btn.disabled = true;
      if (btn.getAttribute('data-id') === id) btn.setAttribute('aria-pressed', 'true');
    });
    if (id === right) {
      locked = true;
      var line = run.chips
        ? (E.shapeWords[item.shape] || '')
        : (item.kind === 'follows' ? item.reading : (item.hit || ''));
      if (!run.chips && item.shape && E.shapeWords[item.shape]) line += ' ' + E.shapeWords[item.shape];
      meter.textContent = line + ' That’s the one.';
      next.hidden = false;
      next.textContent = run.at + 1 >= run.list.length ? 'Desk' : 'Next';
    } else if (run.chips) {
      meter.textContent = 'That pattern does not match these reasons.';
      Array.prototype.forEach.call(choices.querySelectorAll('button'), function (btn) { btn.disabled = false; });
    } else if (item.kind === 'follows') {
      meter.textContent = item.reading;
      Array.prototype.forEach.call(choices.querySelectorAll('button'), function (btn) { btn.disabled = false; });
    } else {
      meter.textContent = (chosen && chosen.miss) || 'Not that one.';
      Array.prototype.forEach.call(choices.querySelectorAll('button'), function (btn) { btn.disabled = false; });
    }
  }

  function advance() {
    if (run && run.kind === 'lesson') {
      state.lessons[run.level] = true;
      save();
      startList(drillsOf(run.level, 1), lessonOf(run.level).name + ' · pass 1');
      return;
    }
    if (!run || run.kind !== 'list') { renderHome(); return; }
    if (run.list[run.at] && run.list[run.at].rule) {
      run.at += 1;
      showDrill(run.list[run.at].item);
      return;
    }
    if (!locked) return;
    run.at += 1;
    if (run.at >= run.list.length) renderHome();
    else if (run.list[run.at].rule) showRuleCard();
    else showDrill(run.list[run.at].item);
  }

  function openPool() {
    return all.filter(function (item) {
      return moveOpen(item.level) && state.lessons[item.level];
    });
  }

  function dailyItem() {
    var pool = openPool();
    if (!pool.length) return null;
    var day = new Date().toISOString().slice(0, 10);
    var s = 0;
    for (var i = 0; i < day.length; i++) s = (s * 33 + day.charCodeAt(i)) >>> 0;
    return pool[s % pool.length];
  }

  function openWorkshop(mode) {
    run = { kind: 'workshop', mode: mode };
    stopClock();
    showOnly('workshop');
    paintTrack(0);
    var build = mode === 'build';
    document.getElementById('work-title').textContent = build ? 'Build an argument' : 'Write a reply';
    document.getElementById('work-help').textContent = build
      ? 'Three sentences. None may repeat another. The bridge starts with if.'
      : 'Answer the reason. At least eight words. A jab that only names the person does not count.';
    document.getElementById('build-fields').hidden = !build;
    document.getElementById('reply-box').hidden = build;
    document.getElementById('reply-passage').textContent = B.replyPrompt.passage;
    document.getElementById('work-meter').textContent = '';
  }

  function checkWorkshop() {
    var box = document.getElementById('work-meter');
    var result = run.mode === 'build'
      ? E.buildCheck(
        document.getElementById('w-claim').value,
        document.getElementById('w-reason').value,
        document.getElementById('w-bridge').value
      )
      : E.replyCheck(document.getElementById('w-reply').value, B.replyPrompt.keywords);
    box.textContent = result.ok ? 'That’s a usable one.' : result.problems.join(' ');
  }

  function showRules() {
    run = null;
    stopClock();
    showOnly('rules');
    paintTrack(0);
    document.getElementById('rules-copy').innerHTML = D.lessons.map(function (lesson) {
      return '<p class="rule"><strong>' + esc(lesson.name) + '.</strong> ' + esc(ruleOf(lesson.level)) + '</p>';
    }).join('');
  }

  function onAct(act, el) {
    if (act === 'lesson') { showLesson(Number(el.getAttribute('data-level'))); return; }
    if (act === 'pass') {
      var level = Number(el.getAttribute('data-level'));
      var pass = Number(el.getAttribute('data-pass'));
      startList(drillsOf(level, pass), lessonOf(level).name + ' · pass ' + pass);
      return;
    }
    if (act === 'daily') {
      var today = dailyItem();
      if (!today) {
        homeNote.textContent = 'Read the first idea, then today’s drill has something to draw from.';
        return;
      }
      startList([today], 'Today', { skipRule: true });
      return;
    }
    if (act === 'miss') {
      var misses = missOrder().items;
      startList(misses, 'Misses', { skipRule: true });
      return;
    }
    if (act === 'mixed') {
      var bag = all.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = bag[i]; bag[i] = bag[j]; bag[j] = t;
      }
      startList(bag.slice(0, 8), 'Mixed', { skipRule: true, hideMove: true });
      return;
    }
    if (act === 'chips') {
      var shaped = openPool().filter(function (item) { return item.kind === 'follows' && item.shape; });
      if (!shaped.length) {
        homeNote.textContent = 'Read Follows first. Pattern names come from moves you have already opened.';
        return;
      }
      startList([shaped[Math.floor(Math.random() * shaped.length)]], 'Name the pattern', { skipRule: true, chips: true });
      return;
    }
    if (act === 'build') { openWorkshop('build'); return; }
    if (act === 'reply') { openWorkshop('reply'); return; }
    if (act === 'old') {
      var old = all.filter(function (item) { return item.source === 'casaubon'; })[0];
      if (old) startList([old], 'Casaubon', { skipRule: true });
      return;
    }
    if (act === 'rules') { showRules(); return; }
    if (act === 'timer') {
      state.timer = !state.timer;
      save();
      renderHome();
    }
  }

  moves.addEventListener('click', function (ev) {
    var el = ev.target.closest('button');
    if (!el) return;
    onAct(el.getAttribute('data-act'), el);
  });
  homeActions.addEventListener('click', function (ev) {
    var el = ev.target.closest('button');
    if (!el) return;
    onAct(el.getAttribute('data-act'), el);
  });
  choices.addEventListener('click', function (ev) {
    var el = ev.target.closest('button');
    if (!el || el.disabled) return;
    onPick(el.getAttribute('data-id'));
  });
  next.addEventListener('click', advance);
  hintBtn.addEventListener('click', function () {
    var item = currentItem();
    if (!item || locked) return;
    state.hinted = true;
    meter.textContent = ruleOf(item.level) + ' Hint counted. A first-try clean pass will not include this one.';
  });
  document.getElementById('desk').addEventListener('click', renderHome);
  document.getElementById('work-desk').addEventListener('click', renderHome);
  document.getElementById('rules-desk').addEventListener('click', renderHome);
  document.getElementById('work-check').addEventListener('click', checkWorkshop);

  renderHome();
})();
