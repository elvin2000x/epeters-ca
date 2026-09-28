// import-from-com.js: copies the sections that moved off elvinpeters.com (ticket #12)
// from a .com checkout into this repo and rewrites their links for their new home.
// Re-runnable: run it again after the .com repo changes, then node build.js.
//   node scripts/import-from-com.js <path to the .com checkout>
//
// What it does to every copied text file:
//   1. https://elvinpeters.com/<moved section>  ->  https://epeters.ca/<section>
//      (/colour/ lands at /projects/colour/, Elvin's call 2026-09-27)
//   2. a root-relative link to a page that did NOT move (/, /free/, /contact/ ...)
//      becomes an absolute https://elvinpeters.com link, because on epeters.ca it
//      would 404
//   3. every <a> link to elvinpeters.com gets UTM tags (plan blindspot 1), so the
//      traffic .ca sends back to .com shows up in GA4
//   4. noindex comes off (these pages become indexable here), except KEEP_NOINDEX
// Only the shared assets the moved pages reference are copied (ASSETS).
'use strict';
const fs = require('fs'), path = require('path');

const SRC = path.resolve(process.argv[2] || '');
const DEST = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(SRC, 'CNAME'))) { console.error('usage: node scripts/import-from-com.js <.com checkout>'); process.exit(1); }
// Once .com carries the redirect stubs (scripts/epca-stubs.js there), this repo is the
// source of truth for these sections and has its own fixes (play-kit mount, game scopes).
// Importing again would copy stubs over real pages, so it refuses.
if (fs.readFileSync(path.join(SRC, 'play', 'index.html'), 'utf8').includes('ep:moved-stub')) {
  console.error('That checkout already has the moved-section stubs: epeters-ca owns these pages now. Edit them here.');
  process.exit(1);
}

// source folder -> folder on epeters.ca
const MOVED = {
  'writing': 'writing', 'play': 'play', 'apps': 'apps',
  'quiz-ai-risk': 'quiz-ai-risk', 'quiz-time-waste': 'quiz-time-waste',
  'quiz-tool-picker': 'quiz-tool-picker', 'projects': 'projects', 'colour': 'projects/colour',
};
// Shared files the moved pages load (found by a reference scan of every moved page,
// essay-page.js and css/post.css on 2026-09-27). verify.js fails any local src/href
// that is missing, so a new reference on .com shows up there.
const ASSETS = [
  '.nojekyll', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png',
  'css/site.css', 'css/nav-drawer.css', 'css/contact-modal.css',
  'js/site.js', 'js/contact-modal.js', 'img/og.jpg',
];
// The Anatomy Sandbox is shared by link and kept noindex (decision 2026-09-25); the
// move does not change that.
const KEEP_NOINDEX = new Set(['projects/anatomy-sandbox/index.html']);
// Generated on this site by build.js from content/essays.json, so never copied.
const SKIP = f => /\.bak/.test(f) || f === 'writing/_homepage_cards.html' || /^writing\/.+/.test(f);

const TEXT = /\.(html|js|css|json|xml|txt|md)$/i;
const UTM = sec => `utm_source=epeters.ca&utm_medium=link&utm_campaign=${sec}`;
const section = dest => { const s = dest.split('/')[0]; return s === 'essays' ? 'writing' : s.startsWith('quiz') ? 'quizzes' : s; };
const mapPath = p => { // '/colour/x' -> '/projects/colour/x' (for moved sections only)
  const seg = p.replace(/^\//, '').split('/')[0];
  return MOVED[seg] ? '/' + MOVED[seg] + p.slice(1 + seg.length) : p;
};
const SEC_RE = Object.keys(MOVED).sort((a, b) => b.length - a.length).join('|');

// A root-relative path exists on epeters.ca if it is a copied file or a folder with an index.
const existsHere = p => {
  const f = path.join(DEST, decodeURI(p.split(/[?#]/)[0]));
  return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
};
const isMovedPath = p => new RegExp(`^/(${SEC_RE})(/|$)`).test(p);

function rewrite(txt, dest) {
  const sec = section(dest);
  // 1. absolute .com URLs of moved sections
  txt = txt.replace(new RegExp(`https?://(?:www\\.)?elvinpeters\\.com/(${SEC_RE})(?=[/"'?#\\s<)\\\\]|$)`, 'g'),
    (m, s) => 'https://epeters.ca/' + MOVED[s]);
  // root-relative /colour/ in attributes and JS strings
  txt = txt.replace(/(["'`(=])\/colour\//g, '$1/projects/colour/');
  // 2. root-relative links (href attributes and JS `href: '...'`) to pages that stayed on .com
  txt = txt.replace(/(href\s*[=:]\s*\\?["'])(\/(?!\/)[^"'\\\s]*)/g, (m, pre, p) => {
    // "/" on a copied page always meant the brand home (the book), never this site's home.
    if (p !== '/' && (isMovedPath(p) || existsHere(p))) return m;
    return pre + 'https://elvinpeters.com' + p;
  });
  // 3. UTM on every <a> (and JS href:) link to elvinpeters.com
  txt = txt.replace(/((?:<a\b[^>]*?href=|href\s*:\s*)\\?["'])(https?:\/\/(?:www\.)?elvinpeters\.com[^"'\\\s]*)/g, (m, pre, u) => {
    if (/utm_source=/.test(u)) return m;
    const [base, hash] = u.split('#');
    const withSlash = /^https?:\/\/(?:www\.)?elvinpeters\.com$/.test(base) ? base + '/' : base;
    return pre + withSlash + (withSlash.includes('?') ? '&' : '?') + UTM(sec) + (hash ? '#' + hash : '');
  });
  // 4. noindex off
  if (!KEEP_NOINDEX.has(dest)) txt = txt.replace(/[ \t]*<meta name="robots" content="noindex[^"]*">\r?\n?/gi, '');
  return txt;
}

// Pass 1: copy files verbatim so existsHere() can see the whole site; pass 2: rewrite.
const copied = [];
for (const [src, dst] of Object.entries(MOVED)) {
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(SRC, src, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { walk(r); continue; }
      const from = src + '/' + r, to = dst + '/' + r;
      if (SKIP(from)) continue;
      fs.mkdirSync(path.dirname(path.join(DEST, to)), { recursive: true });
      fs.copyFileSync(path.join(SRC, from), path.join(DEST, to));
      copied.push(to);
    }
  };
  walk('');
}
for (const a of ASSETS) {
  fs.mkdirSync(path.dirname(path.join(DEST, a)), { recursive: true });
  fs.copyFileSync(path.join(SRC, a), path.join(DEST, a));
}
// The blog is not imported any more: since #361 (2026-09-28) epeters-ca owns it (content/essays.json,
// essays/, md.js, css/blog.css, img/posts/), so a re-run never overwrites the one-template blog.

let changed = 0;
for (const f of copied) {
  if (!TEXT.test(f)) continue;
  const p = path.join(DEST, f), before = fs.readFileSync(p, 'utf8'), after = rewrite(before, f);
  if (after !== before) { fs.writeFileSync(p, after); changed++; }
}
console.log(`Imported ${copied.length} files + ${ASSETS.length} assets from ${SRC}; rewrote links in ${changed}.`);
