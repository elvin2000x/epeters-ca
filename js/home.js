/* The Rabbit Hole homepage (card #356): the Story / Map / Scan switcher, the Scan dashboard and the exhibit sheet.
   One list feeds every view: /content/exhibits.json. The Map code (js/home-map.js) loads only when Map is first opened.
   View pick on load: the #hash, then the remembered pick ('rh-view', saved only on a tap), then Story. */
(function(){
  'use strict';
  var VIEWS = ['story', 'map', 'scan'];
  var $ = function(s, r){ return (r || document).querySelector(s); };
  var esc = function(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var store = {
    get: function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  };
  /* GA4 G-CLZ7N26J1Q is configured in the page head. */
  var track = function(name, params){ try { if (window.gtag) gtag('event', name, params); } catch(e){} };

  var current = 'story', D = null, mapApi = null, mapLoading = null, scanBuilt = false;
  var dataP = fetch('/content/exhibits.json').then(function(r){ return r.json(); }).then(function(j){
    j.branches = j.branches.filter(function(b){ return j.exhibits.some(function(e){ return e.branch === b.id && e.checked; }); });
    j.exhibits = j.exhibits.filter(function(e){ return e.checked; });
    return (D = j);
  });
  var branch = function(id){ return D.branches.filter(function(b){ return b.id === id; })[0]; };
  var exhibit = function(id){ return D.exhibits.filter(function(e){ return e.id === id; })[0]; };

  /* ---------- newsletter + book (COPY.md, The Bottom) ---------- */
  var NL = { h: 'The Owner-Operator', line: 'My newsletter on AI, marketing and systems for people who run the whole show themselves, with the next question I\'m digging into.', btn: 'Send me the next one' };
  var BOOK = { h: 'Start where I started.', btn: 'Get the book' };
  var nlSource = function(){ return 'newsletter | epeters-home-' + current; };
  var uid = 0;
  function nlForm(){
    var id = 'rh-em-' + (++uid);
    return '<form class="rh-form" novalidate data-nl><input class="hp" type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<label class="sr" for="' + id + '">Email address</label><input id="' + id + '" type="email" name="email" autocomplete="email" required placeholder="you@work.com">' +
      '<button class="btn primary" type="submit">' + esc(NL.btn) + '</button></form><p class="rh-msg" aria-live="polite"></p>';
  }
  function bookBlock(tag){
    var b = exhibit('book');
    return '<' + tag + '>' + esc(BOOK.h) + '</' + tag + '><p>' + esc(b.line) + '</p><div class="acts"><a class="btn" href="' + esc(b.href) + '">' + esc(BOOK.btn) + '</a></div>';
  }
  document.addEventListener('submit', function(ev){
    var f = ev.target.closest('form[data-nl]'); if (!f) return;
    ev.preventDefault();
    var m = f.nextElementSibling, em = f.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){ m.textContent = 'Enter your email first.'; f.email.focus(); return; }
    m.textContent = 'One sec…';
    fetch('https://ultimateaidirectory.com/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: em, source: nlSource(), website: f.website.value }) })
      .then(function(r){ if (!r.ok) throw new Error(r.status); m.textContent = 'Done. Watch your inbox.'; f.reset(); track('newsletter_signup', { view: current }); })
      .catch(function(){ m.textContent = 'That did not go through. Try again in a minute.'; });
  });

  /* ---------- sheet ---------- */
  var sheet = $('.rh-sheet'), scrim = $('.rh-scrim'), lastFocus = null, onClose = null;
  function openSheet(html, hue, closeCb){
    lastFocus = document.activeElement; onClose = closeCb || null;
    sheet.innerHTML = '<button class="x" type="button" aria-label="Close">&times;</button>' + html;
    if (hue) sheet.setAttribute('data-hue', hue); else sheet.removeAttribute('data-hue');
    sheet.hidden = false; sheet.scrollTop = 0;
    requestAnimationFrame(function(){ sheet.classList.add('on'); scrim.classList.add('on'); });
    var f = sheet.querySelector('a[href], button:not(.x), input[type=email]');
    (f || $('.x', sheet)).focus({ preventScroll: true });
  }
  function closeSheet(){
    if (sheet.hidden) return;
    sheet.classList.remove('on'); scrim.classList.remove('on');
    setTimeout(function(){ if (!sheet.classList.contains('on')) sheet.hidden = true; }, reduce.matches ? 0 : 380);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    if (onClose) onClose();
  }
  sheet.addEventListener('click', function(ev){ if (ev.target.closest('.x')) closeSheet(); });
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function(ev){
    if (sheet.hidden) return;
    if (ev.key === 'Escape'){ ev.preventDefault(); closeSheet(); return; }
    if (ev.key === 'Tab'){
      var f = [].slice.call(sheet.querySelectorAll('a[href], button, input:not([tabindex="-1"])'));
      if (!f.length) return;
      if (ev.shiftKey && document.activeElement === f[0]){ ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && document.activeElement === f[f.length - 1]){ ev.preventDefault(); f[0].focus(); }
    }
  });
  function tagHtml(b){ return '<span class="tag" data-hue="' + b.hue + '"><i></i>' + esc(b.name) + '</span>'; }
  function openExhibit(id, closeCb){
    var e = exhibit(id), b = branch(e.branch);
    var body = e.kind === 'newsletter' ? nlForm()
      : '<div class="acts"><a class="btn primary" href="' + esc(e.href) + '">' + esc(e.cta) + ' <span aria-hidden="true">&rarr;</span></a></div>';
    openSheet(
      (e.thumb ? '<img class="shot" src="' + esc(e.thumb) + '" alt="" width="480" height="300">' : '') +
      '<div class="sm">' + tagHtml(b) + '</div><h2 id="rh-sheet-h">' + esc(e.title) + '</h2>' +
      (e.line ? '<p>' + esc(e.line) + '</p>' : '') + body, b.hue, closeCb);
    track('exhibit_open', { id: id, view: current });
  }
  function openCentre(closeCb){
    openSheet('<div class="sm"><span class="tag"><i></i>Elvin Peters</span></div><h2 id="rh-sheet-h">' + esc(NL.h) + '</h2><p>' + esc(NL.line) + '</p>' + nlForm() + bookBlock('h3'), null, closeCb);
    track('exhibit_open', { id: 'centre', view: current });
  }
  function openBackstage(closeCb){
    openSheet('<div class="sm"><span class="tag" style="--c:var(--muted)"><i></i>Private</span></div><h2 id="rh-sheet-h">Backstage</h2>' +
      '<ul class="bs">' + D.backstage.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>', null, closeCb);
  }

  /* ---------- Scan ---------- */
  var LOCK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
  function buildScan(root){
    var counts = {}; D.exhibits.forEach(function(e){ counts[e.branch] = (counts[e.branch] || 0) + 1; });
    root.innerHTML = '<div class="scan">' +
      '<div class="scan-head"><h2>Every exhibit on one screen</h2>' +
      '<p class="stats"><span><b data-count="' + D.exhibits.length + '">' + D.exhibits.length + '</b>exhibits</span><span><b data-count="' + D.branches.length + '">' + D.branches.length + '</b>interests</span></p></div>' +
      '<div class="filters" role="toolbar" aria-label="Filter"><button type="button" aria-pressed="true" data-f="all">All <small>' + D.exhibits.length + '</small></button>' +
      D.branches.map(function(b){ return '<button type="button" aria-pressed="false" data-f="' + b.id + '" data-hue="' + b.hue + '"><i></i>' + esc(b.name) + ' <small>' + counts[b.id] + '</small></button>'; }).join('') + '</div>' +
      '<ul class="grid">' +
      D.exhibits.map(function(e, i){ var b = branch(e.branch);
        return '<li data-b="' + b.id + '"><a class="card enter' + (e.star ? ' star' : '') + '" style="--i:' + i + '" data-hue="' + b.hue + '" data-id="' + e.id + '" href="' + esc(e.href) + '">' +
          '<img class="thumb" src="' + esc(e.thumb) + '" alt="" width="480" height="300" loading="lazy" decoding="async">' +
          '<div class="body"><h3>' + esc(e.title) + '</h3>' + (e.line ? '<p>' + esc(e.line) + '</p>' : '') + '<span class="foot"><i></i>' + esc(b.name) + '</span></div></a></li>'; }).join('') +
      '<li data-b="backstage"><button type="button" class="card back enter" style="--i:' + D.exhibits.length + '" data-back><span class="body"><span class="lock" aria-hidden="true">' + LOCK + '</span><span class="bh">Backstage</span><span class="foot"><i></i>' + D.backstage.length + ' private tools</span></span></button></li>' +
      '</ul>' +
      '<div class="scan-foot"><div><h3>' + esc(NL.h) + '</h3><p>' + esc(NL.line) + '</p>' + nlForm() + '</div><div>' + bookBlock('h3') + '</div></div></div>';
    var grid = $('.grid', root), filters = $('.filters', root);
    grid.addEventListener('click', function(ev){
      if (ev.target.closest('[data-back]')){ openBackstage(); return; }
      var c = ev.target.closest('.card[data-id]'); if (c) track('exhibit_open', { id: c.dataset.id, view: 'scan' });
    });
    filters.addEventListener('click', function(ev){
      var f = ev.target.closest('button'); if (!f) return;
      [].forEach.call(filters.children, function(x){ x.setAttribute('aria-pressed', String(x === f)); });
      var items = [].slice.call(grid.children), first = new Map(items.map(function(li){ return [li, li.getBoundingClientRect()]; }));
      items.forEach(function(li){ li.firstChild.classList.remove('enter'); li.hidden = !(f.dataset.f === 'all' || li.dataset.b === f.dataset.f); });
      track('scan_filter', { branch: f.dataset.f });
      if (reduce.matches) return;
      items.filter(function(li){ return !li.hidden; }).forEach(function(li){
        var a = first.get(li), b = li.getBoundingClientRect();
        if (!a.width){ li.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); return; }
        var dx = a.left - b.left, dy = a.top - b.top;
        if (dx || dy) li.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    });
  }
  function replayScan(root){
    [].forEach.call(root.querySelectorAll('.grid > li'), function(li){ li.hidden = false; var c = li.firstChild; c.classList.remove('enter'); void c.offsetWidth; c.classList.add('enter'); });
    [].forEach.call(root.querySelectorAll('.filters button'), function(x, i){ x.setAttribute('aria-pressed', String(i === 0)); });
    if (reduce.matches) return;
    [].forEach.call(root.querySelectorAll('[data-count]'), function(b){
      var n = +b.dataset.count, t0 = performance.now();
      var step = function(t){ var k = Math.min(1, (t - t0) / 700); b.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  /* ---------- Map (loaded on demand) ---------- */
  function loadMap(){
    return mapLoading || (mapLoading = new Promise(function(ok, no){
      var s = document.createElement('script'); s.src = '/js/home-map.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s);
    }).then(function(){ mapApi = window.RHMapMount($('#v-map'), { D: D, branch: branch, esc: esc, reduce: reduce, openExhibit: openExhibit, openCentre: openCentre, openBackstage: openBackstage }); }));
  }

  /* ---------- views + switcher ---------- */
  var sw = $('.rh-switch'), pill = $('.pill', sw);
  function placePill(){
    var on = sw.querySelector('input:checked + label'); if (!on) return;
    pill.style.width = on.offsetWidth + 'px'; pill.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  function setView(v, how){
    var from = current; current = v;
    VIEWS.forEach(function(k){ $('#v-' + k).hidden = k !== v; });
    $('#sw-' + v).checked = true; placePill();
    if (how){
      store.set('rh-view', v);
      track('variant_switch', { from: from, to: v, via: how });
      try { history.replaceState(null, '', '#' + v); } catch(e){}
      window.scrollTo(0, 0);
    }
    if (v !== 'story') dataP.then(function(){
      if (current !== v) return;
      if (v === 'scan'){ if (!scanBuilt){ buildScan($('#v-scan')); scanBuilt = true; } replayScan($('#v-scan')); }
      if (v === 'map') loadMap().then(function(){ if (current === 'map') mapApi.shown(); });
    }).catch(function(){ setView('story'); });
  }
  sw.addEventListener('change', function(ev){ setView(ev.target.value, 'switcher'); });
  document.addEventListener('click', function(ev){
    var g = ev.target.closest('[data-go]'); if (!g) return;
    ev.preventDefault(); setView(g.dataset.go, 'button');
    if (g.dataset.go === 'map') dataP.then(loadMap).then(function(){ var c = document.querySelector('#v-map .node.centre'); if (c) setTimeout(function(){ c.focus({ preventScroll: true }); }, reduce.matches ? 0 : 700); });
  });
  addEventListener('resize', placePill);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placePill);

  /* A #hash that names a view picks it; a #hash that names something in the Story (the bar's /#quizzes) opens the Story there. */
  function fromHash(isNav){
    var h = decodeURIComponent((location.hash || '').slice(1));
    if (VIEWS.indexOf(h) >= 0){ if (h !== current) setView(h, isNav ? 'link' : null); return true; }
    var t = h && document.getElementById(h);
    if (t && $('#v-story').contains(t)){ if (current !== 'story') setView('story'); t.scrollIntoView(); return true; }
    return false;
  }
  addEventListener('hashchange', function(){ fromHash(true); });
  var src = 'hash';
  if (!fromHash(false)){
    var saved = store.get('rh-view');
    if (VIEWS.indexOf(saved) >= 0){ src = 'saved'; if (saved !== 'story') setView(saved); } else src = 'default';
  }
  placePill();
  track('variant_view', { view: current, source: src });
})();
