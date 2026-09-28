/* apps-kit.js — shared chrome for /apps/*. Zero dependencies. */
(function () {
  'use strict';

  var KEY = 'ep-theme';

  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }

  function currentTheme() {
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    if (saved) return saved;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch (e) {}
    applyTheme(next);
    paintButtons();
  }

  function paintButtons() {
    var icon = currentTheme() === 'dark' ? '☀' : '☾';
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (b) {
      b.textContent = icon;
      b.setAttribute('aria-label', 'Switch to ' + (currentTheme() === 'dark' ? 'light' : 'dark') + ' theme');
    });
  }

  // Apply immediately so there is no flash of the wrong theme.
  applyTheme(currentTheme());

  var LOGO = "<svg viewBox='0 0 24 24' width='18' height='18' aria-hidden='true'>" +
    "<path d='M5 19V5h9M5 12h7' stroke='currentColor' stroke-width='2' fill='none' stroke-linecap='round'/>" +
    "<circle cx='18' cy='17' r='2.4' fill='currentColor'/></svg>";

  /* Renders the shared nav into <div data-apps-nav>. `links` is an optional
     JSON array of {label, href} on the element, appended before the CTA. */
  function mountNav(el) {
    var extra = '';
    try {
      var raw = el.getAttribute('data-links');
      if (raw) JSON.parse(raw).forEach(function (l) {
        extra += '<a href="' + l.href + '">' + l.label + '</a>';
      });
    } catch (e) {}

    el.className = 'nav';
    el.innerHTML =
      '<div class="container">' +
        '<a class="brandmark" href="https://elvinpeters.com/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">' +
          '<span class="sig" style="color:var(--gold)">' + LOGO + '</span>' +
          '<span>Elvin M. Peters</span>' +
        '</a>' +
        '<nav class="links">' +
          // The site menu (content/nav.json, 2026-09-27). /newsletter/ works today
          // (it forwards to the homepage signup) and stays right once the page ships.
          '<a href="https://elvinpeters.com/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Home</a>' +
          '<a href="https://elvinpeters.com/free/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Free Toolkit</a>' +
          '<a href="https://elvinpeters.com/newsletter/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Newsletter</a>' +
          '<a href="https://elvinpeters.com/contact/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Contact</a>' +
          extra +
          '<button class="themebtn" data-theme-toggle type="button"></button>' +
          '<a class="cta" href="https://www.amazon.com/dp/B0H4X2S2JD" target="_blank" rel="noopener">Get the book</a>' +
        '</nav>' +
      '</div>';
  }

  function mountFoot(el) {
    el.className = 'foot';
    el.innerHTML =
      '<div class="container">' +
        'Built and hosted by <a href="https://elvinpeters.com/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps" style="color:var(--gold-2)">Elvin M. Peters</a>' +
        ' — Toronto. Free to use, nothing tracked beyond page views, no sign-up. ' +
        '<a href="https://elvinpeters.com/free/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Free Toolkit</a> · <a href="https://elvinpeters.com/newsletter/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Newsletter</a> · ' +
        '<a href="https://elvinpeters.com/contact/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Contact</a> · <a href="https://www.linkedin.com/in/elvinmpeters" target="_blank" rel="noopener">LinkedIn</a> · ' +
        '<a href="https://elvinpeters.com/privacy.html?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps">Privacy</a>' +
      '</div>';
  }

  function boot() {
    var n = document.querySelector('[data-apps-nav]'); if (n) mountNav(n);
    var f = document.querySelector('[data-apps-foot]'); if (f) mountFoot(f);
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-theme-toggle]');
      if (b) toggleTheme();
    });
    paintButtons();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.AppsKit = { applyTheme: applyTheme, currentTheme: currentTheme, toggleTheme: toggleTheme };
})();
