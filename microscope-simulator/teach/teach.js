/* Teacher hub: theme toggle, live copy swap from teach.json, lesson filter, copy link, QR codes, print,
   full URLs on printed worksheets. No network calls beyond teach.json on this same site. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var TEACH = new URL(doc.getAttribute('data-base') || './', location.href); // web/teach/
  var WEB = new URL('../', TEACH);                                          // web/
  var UI = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function t(key, vars) {
    var s = UI[key];
    if (s == null) { var n = $('[data-ui="' + key + '"]'); s = n ? n.textContent : key; return s; }
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }
  function say(msg) { var l = $('#live'); if (!l) return; l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 30); }
  function abs(path) { return new URL(path, WEB).href; }

  /* theme */
  var isDark = function () { return doc.dataset.theme ? doc.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  var themeBtn = $('#theme');
  function syncTheme() { if (themeBtn) themeBtn.setAttribute('aria-pressed', String(isDark())); }
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    doc.dataset.theme = next;
    try { localStorage.setItem('cme-theme', next); } catch (e) { /* private mode */ }
    syncTheme();
  });
  syncTheme();

  /* copy swap: pages already carry the built words; this picks up edits to teach.json before a rebuild */
  fetch(new URL('teach.json', TEACH)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !j.ui) return;
    UI = j.ui;
    $$('[data-ui]').forEach(function (n) {
      var k = n.getAttribute('data-ui'); if (UI[k] == null) return;
      var vars = null; try { vars = JSON.parse(n.getAttribute('data-ui-vars') || 'null'); } catch (e) { vars = null; }
      n.textContent = t(k, vars);
    });
    $$('[data-ui-ph]').forEach(function (n) { var k = n.getAttribute('data-ui-ph'); if (UI[k] != null) n.setAttribute('placeholder', UI[k]); });
    $$('[data-ui-label]').forEach(function (n) { var k = n.getAttribute('data-ui-label'); if (UI[k] != null) n.setAttribute('aria-label', UI[k]); });
    $$('select option[value=""]').forEach(function (o) { if (UI['filter.all']) o.textContent = UI['filter.all']; });
    if (filter) filter.run(true);
  }).catch(function () { /* offline file:// open: built words stay */ });

  /* full URLs printed under worksheet links */
  $$('span.url[data-path]').forEach(function (s) { s.textContent = abs(s.getAttribute('data-path')); });

  /* print */
  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });

  /* copy link */
  function copy(text) {
    var done = function () { say(t('lesson.copied')); };
    var fail = function () { window.prompt(t('lesson.copyFailed'), text); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { legacy(text) ? done() : fail(); });
    } else if (legacy(text)) done(); else fail();
  }
  function legacy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove(); return ok;
  }
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () { copy(abs(b.getAttribute('data-copy'))); });
  });

  /* QR codes, drawn on this device with the vendored qrcode-generator (MIT) */
  var dlg = $('#qrDialog'), lastFocus = null;
  function showQR(url) {
    if (!dlg || typeof window.qrcode !== 'function') { copy(url); return; }
    var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
    var n = qr.getModuleCount(), q = 4, size = n + q * 2, d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    var box = $('#qrBox');
    box.innerHTML = '';
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t('qr.title') + ': ' + url); svg.setAttribute('shape-rendering', 'crispEdges');
    var bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('fill', '#fff');
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000');
    svg.appendChild(bg); svg.appendChild(p); box.appendChild(svg);
    $('#qrUrl').textContent = url;
    lastFocus = document.activeElement;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    $('#qrClose').focus();
  }
  if (dlg) {
    $('#qrClose').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
    dlg.addEventListener('close', function () { if (lastFocus) lastFocus.focus(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }
  $$('[data-qr]').forEach(function (b) { b.addEventListener('click', function () { showQR(abs(b.getAttribute('data-qr'))); }); });
  var pick = $('#qrPick');
  if (pick) {
    $('#qrGo').addEventListener('click', function () { showQR(abs(pick.value)); });
    $('#qrCopy').addEventListener('click', function () { copy(abs(pick.value)); });
  }

  /* lesson filter on the hub, state kept in the address bar (?q=&grade=&topic=&time=) */
  var filter = null;
  var cards = $('#cards');
  if (cards) {
    var q = $('#fq'), g = $('#fgrade'), tp = $('#ftopic'), tm = $('#ftime'), count = $('#fcount'), none = $('#fnone');
    var params = new URLSearchParams(location.search);
    q.value = params.get('q') || '';
    [[g, 'grade'], [tp, 'topic'], [tm, 'time']].forEach(function (pair) {
      var v = params.get(pair[1]) || '';
      if ($$('option', pair[0]).some(function (o) { return o.value === v; })) pair[0].value = v;
    });
    var items = $$('.card', cards), total = items.length, timer = null;
    filter = {
      run: function (quiet) {
        var words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
        var shown = 0;
        items.forEach(function (c) {
          var ok = (!g.value || (' ' + c.dataset.grades + ' ').indexOf(' ' + g.value + ' ') > -1) &&
                   (!tp.value || (' ' + c.dataset.topics + ' ').indexOf(' ' + tp.value + ' ') > -1) &&
                   (!tm.value || c.dataset.time === tm.value) &&
                   words.every(function (w) { return c.dataset.search.indexOf(w) > -1; });
          c.hidden = !ok; if (ok) shown++;
        });
        var msg = t('filter.count', { n: shown, total: total });
        count.textContent = msg;
        none.hidden = shown > 0;
        var p = new URLSearchParams();
        if (q.value.trim()) p.set('q', q.value.trim());
        if (g.value) p.set('grade', g.value);
        if (tp.value) p.set('topic', tp.value);
        if (tm.value) p.set('time', tm.value);
        var s = p.toString();
        try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); } catch (e) { /* file:// */ }
        if (!quiet) { clearTimeout(timer); timer = setTimeout(function () { say(shown ? msg : t('filter.none')); }, 400); }
      }
    };
    q.addEventListener('input', function () { filter.run(); });
    [g, tp, tm].forEach(function (s) { s.addEventListener('change', function () { filter.run(); }); });
    $('#freset').addEventListener('click', function () { q.value = ''; g.value = ''; tp.value = ''; tm.value = ''; filter.run(); q.focus(); });
    filter.run(true);
  }
})();
