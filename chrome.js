// chrome.js: the epeters.ca top bar and footer line, rendered from content/nav.json.
// Shared by build.js (hand-built pages) and essay-page.js (the blog) so they match.
// Both blocks carry their own solid background and scoped styles, so they read the
// same on a light quiz page, a dark game or the blog (Rule 34 legibility).
'use strict';
const fs = require('fs'), path = require('path');
const NAVC = JSON.parse(fs.readFileSync(path.join(__dirname, 'content', 'nav.json'), 'utf8'));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// UTM-tag a link to elvinpeters.com (plan blindspot 1: every .ca -> .com link is tagged).
function utm(href, medium, section) {
  if (!/^https?:\/\/(www\.)?elvinpeters\.com/.test(href) || /utm_source=/.test(href)) return href;
  const q = NAVC.utm.replace('{medium}', medium).replace('{section}', section);
  const [base, hash] = href.split('#');
  return base + (base.includes('?') ? '&' : '?') + q + (hash ? '#' + hash : '');
}

// Which section a page belongs to, from its path ('quiz-ai-risk/index.html' -> 'quizzes').
function sectionOf(rel) {
  const s = rel.split('/')[0];
  if (!rel.includes('/')) return 'home';
  return s === 'essays' ? 'writing' : s.startsWith('quiz') ? 'quizzes' : s;
}

const BAR_CSS = `.rhbar{background:#0a1524;border-bottom:1px solid #2b405c;font:500 14px/1.4 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;position:relative;z-index:50}` +
  `.rhbar .rhin{max-width:1120px;margin:0 auto;padding:0 16px;min-height:52px;display:flex;align-items:center;gap:6px 18px;flex-wrap:wrap}` +
  `.rhbar a{color:#b7c6d9;text-decoration:none;padding:13px 2px;display:inline-block}.rhbar a:hover{color:#e0bd6b}` +
  `.rhbar .rhbrand{color:#e0bd6b;font-family:'EB Garamond',Georgia,serif;font-size:18px;margin-right:auto}` +
  `.rhbar .rhlk{display:flex;gap:16px;flex-wrap:wrap}.rhbar a:focus-visible,.rhfoot a:focus-visible{outline:2px solid #e0bd6b;outline-offset:2px}`;

function bar(section) {
  return `<!-- ep:ca-bar --><style>${BAR_CSS}</style><nav class="rhbar" aria-label="The Rabbit Hole"><div class="rhin">` +
    `<a class="rhbrand" href="${esc(NAVC.brand.href)}">${esc(NAVC.brand.label)}</a><span class="rhlk">` +
    NAVC.menu.map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('') +
    `</span></div></nav><!-- /ep:ca-bar -->`;
}

const FOOT_CSS = `.rhfoot{background:#0a1524;border-top:1px solid #2b405c;color:#b7c6d9;font:400 14px/1.6 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;padding:18px 16px;text-align:center;clear:both}` +
  `.rhfoot a{color:#e0bd6b;text-decoration:underline;text-underline-offset:3px;display:inline-block;padding:12px 4px}.rhfoot .rhsep{padding:0 6px;color:#8ba2bd}`;

function foot(section) {
  const f = NAVC.footer;
  return `<!-- ep:ca-foot --><style>${FOOT_CSS}</style><footer class="rhfoot"><span>${esc(f.lead)}</span><span class="rhsep">&middot;</span>` +
    f.links.map(l => `<a href="${esc(utm(l.href, 'footer', section))}">${esc(l.label)}</a>`).join('<span class="rhsep">&middot;</span>') +
    `</footer><!-- /ep:ca-foot -->`;
}

const newsletterSource = section => NAVC.newsletterSource.replace('{section}', section);

module.exports = { NAVC, esc, utm, sectionOf, bar, foot, newsletterSource };
