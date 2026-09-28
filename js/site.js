/* site.js — shared chrome behavior: persistent theme + accessible mobile menu.
   Zero dependencies. Load at the end of <head> (no defer) so the saved theme
   applies before first paint. The book page ([data-theme="book"]) never
   theme-flips and renders no toggle. */
(function () {
  'use strict';

  var root = document.documentElement;
  var KEY = 'ep-theme'; // same key apps/_kit/apps-kit.js already persists

  // Sales pages carry data-theme-lock (Rule 34, 2026-09-27): they stay light and a
  // saved "dark" from another page must not flip them. Same treatment as the book.
  var isBook = root.getAttribute('data-theme') === 'book' || root.hasAttribute('data-theme-lock');

  /* ---------------- theme ---------------- */

  function savedTheme() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function currentTheme() {
    var saved = savedTheme();
    if (saved === 'light' || saved === 'dark') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(t) {
    if (isBook) return;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  }
  function toggleTheme() {
    if (isBook) return;
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    applyTheme(next);
    paintToggles();
  }
  function paintToggles() {
    var dark = currentTheme() === 'dark';
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = dark ? '☀' : '☾';
      btns[i].setAttribute('aria-label', 'Switch to ' + (dark ? 'light' : 'dark') + ' theme');
    }
  }

  // Apply persisted theme immediately (before paint; script runs in <head>).
  if (!isBook && savedTheme()) applyTheme(savedTheme());

  /* ---------------- mobile menu ---------------- */

  function buildMenu() {
    var nav = document.querySelector('.nav');
    var links = nav && (nav.querySelector('.links') || nav.querySelector('.lk'));
    if (!nav || !links) return;
    if (nav.querySelector('.navburger')) return; // never double-build

    var burger = document.createElement('button');
    burger.className = 'navburger';
    burger.type = 'button';
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-controls', 'site-menu');
    burger.setAttribute('aria-label', 'Open menu');
    burger.innerHTML = '☰';

    var drawer = document.createElement('nav');
    drawer.className = 'navdrawer';
    drawer.id = 'site-menu';
    drawer.setAttribute('aria-label', 'Site menu');

    var overlay = document.createElement('div');
    overlay.className = 'navoverlay';

    // Drawer content mirrors this page's own nav: CTA first (as a pill),
    // then every other link in order. Buttons (theme toggle) are skipped —
    // the toggle stays in the bar on site pages.
    var anchors = links.querySelectorAll('a');
    var cta = null, rest = [], i, a;
    for (i = 0; i < anchors.length; i++) {
      a = anchors[i];
      if (!cta && a.className.indexOf('cta') > -1) { cta = a; } else { rest.push(a); }
    }
    if (cta) drawer.appendChild(cloneLink(cta));
    for (i = 0; i < rest.length; i++) drawer.appendChild(cloneLink(rest[i]));

    var inner = nav.querySelector('.container') || nav.querySelector('.in') || nav;
    inner.appendChild(burger);
    document.body.appendChild(drawer);
    document.body.appendChild(overlay);

    function cloneLink(el) {
      var c = document.createElement('a');
      c.href = el.getAttribute('href');
      c.textContent = (el.getAttribute('data-nav-label') || el.textContent).replace(/\s+/g, ' ').trim();
      if (el.className.indexOf('cta') > -1) c.className = 'cta';
      // Services dropdown children are plain anchors inside .links, so the
      // drawer picks them up for free. Tag them so they read as nested.
      if (el.className.indexOf('navdd-i') > -1) c.className = 'sub';
      if (el.getAttribute('target')) c.setAttribute('target', el.getAttribute('target'));
      if (el.getAttribute('rel')) c.setAttribute('rel', el.getAttribute('rel'));
      return c;
    }

    var open = false;
    function setOpen(next) {
      open = next;
      drawer.className = 'navdrawer' + (open ? ' open' : '');
      overlay.className = 'navoverlay' + (open ? ' open' : '');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      burger.innerHTML = open ? '✕' : '☰';
      if (open) {
        var first = drawer.querySelector('a');
        if (first) first.focus();
      } else {
        burger.focus();
      }
    }

    burger.addEventListener('click', function () { setOpen(!open); });
    overlay.addEventListener('click', function () { if (open) setOpen(false); });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setOpen(false); // navigating
    });
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'Tab') {
        // Focus trap: cycle within the drawer while open.
        var items = drawer.querySelectorAll('a');
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener('resize', function () {
      if (open && window.innerWidth > 920) setOpen(false);
    });
  }

  /* ---------------- boot ---------------- */

  function boot() {
    // On apps-kit pages the kit owns theme toggling; double-binding would
    // flip twice per tap. site.js only contributes the mobile drawer there.
    var kitOwnsTheme = !!window.AppsKit;
    buildMenu();
    if (!document.querySelector('.navburger')) setTimeout(buildMenu, 120); // kit injects its nav late
    if (!kitOwnsTheme) {
      document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-theme-toggle]');
        if (b) toggleTheme();
      });
      paintToggles();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.SiteChrome = { toggleTheme: toggleTheme, currentTheme: currentTheme };
})();

/* ---------------------------------------------------------------------------
   Inline email capture. One handler for every .oi-form on any page.
   Lived inline in book.html, which is why the three money pages had no working
   capture: /system/ had only an exit-intent popup bound to mouseout with
   clientY <= 0 (an event that never fires on a touchscreen), and /claude/ and
   /content-machine/ had nothing at all. Each form carries its own data-source
   so the lead DB shows which page and which position converts.
   --------------------------------------------------------------------------- */
(function () {
  function wire(f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var box = f.closest('.optin');
      var input = f.querySelector('input[type=email]');
      var msg = box && box.querySelector('.oi-msg');
      var note = box && box.querySelector('.oi-note');
      var btn = f.querySelector('button');
      var email = input ? input.value.trim() : '';
      if (!email || !msg) return;
      btn.disabled = true;
      function failWith(text) {
        btn.disabled = false;
        msg.style.color = 'var(--warn)';
        msg.textContent = text;
        msg.style.display = 'block';
      }
      fetch('https://ultimateaidirectory.com/api/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          source: f.dataset.source,
          website: f.website ? f.website.value : ''
        })
      }).then(function (r) { return r.json(); }).then(function (r) {
        if (!r.success) return failWith(r.error || 'Something went wrong. Try again in a moment.');
        f.style.display = 'none';
        if (note) note.style.display = 'none';
        msg.style.color = '';
        msg.textContent = msg.dataset.success;
        /* Same email, better moment: when the form names its asset, hand the
           file over right now instead of only saying "check your inbox". The
           book page's newsletter form already worked this way; the shared
           component did not, so the better experience was the unstandardised
           one. */
        if (f.dataset.magnet) {
          msg.textContent = msg.textContent + ' ';
          var dl = document.createElement('a');
          dl.href = f.dataset.magnet;
          dl.setAttribute('download', '');
          dl.textContent = f.dataset.magnetLabel || 'Download it now →';
          dl.style.cssText = 'color:var(--accent-ink);font-weight:700;border-bottom:1px solid var(--accent)';
          msg.appendChild(dl);
        }
        msg.style.display = 'block';
        try { fbq('track', 'Lead', { content_name: f.dataset.source }); } catch (e) {}
        try { gtag('event', 'generate_lead', { method: f.dataset.source }); } catch (e) {}
      }).catch(function () { failWith('Network hiccup. Try again.'); });
    });
  }
  function bootOptins() { document.querySelectorAll('.oi-form').forEach(wire); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOptins);
  else bootOptins();
})();
