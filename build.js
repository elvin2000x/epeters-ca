// build.js: the epeters.ca build (ticket #12, 2026-09-27). Slim version of the
// elvinpeters.com engine. Run: node build.js   then: node verify.js
//   1. the blog: blog/<slug>/ + blog/ index from content/essays.json (+ essays/ bodies)
//   2. every other page: the footer line (all pages) and the top bar (nav.json barPages),
//      as ep:ca-foot / ep:ca-bar regions, so a rebuild replaces them in place
//   3. a canonical on epeters.ca for any page without one
//   4. sitemap.xml (indexable pages whose canonical is their own URL) + robots.txt
'use strict';
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const ORIGIN = 'https://epeters.ca';
const { mdToHtml } = require('./md.js');
const { prepare, essayPage, blogIndex } = require('./essay-page.js');
const CH = require('./chrome.js');

/* ---- 1. the blog --------------------------------------------------------- */
// One template for every post (BLOG-DESIGN.md, card #361). essays.json holds each post's
// facts (title, dek, type, topic, dates, image text); the body is a file in essays/ (HTML,
// or Markdown when it ends in .md). Read time, h2 ids, the TOC and related posts are derived.
const essaysRaw = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'essays.json'), 'utf8'));
const published = (Array.isArray(essaysRaw) ? essaysRaw : essaysRaw.posts).filter(e => !e.draft).map(e => {
  const src = fs.readFileSync(path.join(DIR, e.file), 'utf8');
  return prepare({ ...e }, e.file.endsWith('.md') ? mdToHtml(src) : src);
});
fs.mkdirSync(path.join(DIR, 'blog'), { recursive: true });
for (const e of published) {
  fs.mkdirSync(path.join(DIR, 'blog', e.slug), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'blog', e.slug, 'index.html'), essayPage(e, published));
}
fs.writeFileSync(path.join(DIR, 'blog', 'index.html'), blogIndex(published));
console.log(`Built ${published.length} posts -> blog/<slug>/ + blog/ index (` +
  published.map(e => `${e.slug} ${e.words}w ${e.readmins}m`).join(', ') + ')');

// The blog lived at writing/ until #367 (Elvin, 2026-09-28: "make it epeters.ca/blog").
// Each old address stays as a redirect stub, the same pattern elvinpeters.com uses for
// the move: noindex,follow, canonical on the new URL, the JS redirect keeps ?query and
// #hash, the meta refresh is the no-JS fallback. Stubs are noindex, so the sitemap skips them.
const stub = to => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- ep:moved-stub -->
<title>This page moved to the blog</title>
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${to}">
<script>location.replace('${to}' + location.search + location.hash);</script>
<meta http-equiv="refresh" content="0; url=${to}">
</head>
<body><p>This page moved. <a href="${to}">Go to the new page</a>.</p></body>
</html>
`;
fs.writeFileSync(path.join(DIR, 'writing', 'index.html'), stub(`${ORIGIN}/blog/`));
for (const e of published) {
  fs.mkdirSync(path.join(DIR, 'writing', e.slug), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'writing', e.slug, 'index.html'), stub(`${ORIGIN}/blog/${e.slug}/`));
}
console.log(`writing/: ${published.length + 1} redirect stubs -> blog/`);

/* ---- 2 + 3. chrome regions and canonicals on the hand-built pages -------- */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', 'content', 'css', 'js', 'img', 'tools']);
function pages(rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...pages(r)); }
    else if (e.name.endsWith('.html')) out.push(r);
  }
  return out;
}
const ALL = pages();
const isInput = r => CH.NAVC.noChrome.some(p => r.startsWith(p));
const urlOf = r => `${ORIGIN}/${r.replace(/(^|\/)index\.html$/, '$1')}`;
const BAR = new Set(CH.NAVC.barPages);

function region(html, name, block, insert) {
  const re = new RegExp(`<!-- ep:${name} -->[\\s\\S]*?<!-- /ep:${name} -->`);
  if (re.test(html)) return html.replace(re, () => block);
  return insert(html, block);
}
let touched = 0;
for (const r of ALL) {
  if (isInput(r) || r.startsWith('writing/') || r.startsWith('blog/')) continue; // blog/ is built above, writing/ is stubs
  const f = path.join(DIR, r), before = fs.readFileSync(f, 'utf8');
  const sec = CH.sectionOf(r);
  let html = region(before, 'ca-foot', CH.foot(sec), (h, b) => {
    const i = h.lastIndexOf('</body>');
    if (i < 0) throw new Error(`${r}: no </body> for the footer line`);
    return h.slice(0, i) + b + '\n' + h.slice(i);
  });
  if (BAR.has(r)) html = region(html, 'ca-bar', CH.bar(sec), (h, b) => h.replace(/<body\b[^>]*>/i, m => m + '\n' + b));
  // 404.html is served at whatever address was missing, so it names no canonical.
  if (r !== '404.html' && !/<link rel="canonical"/i.test(html)) html = html.replace('</head>', () => `<link rel="canonical" href="${urlOf(r)}">\n</head>`);
  if (html !== before) { fs.writeFileSync(f, html); touched++; }
}
console.log(`Chrome + canonicals: ${touched} page(s) updated`);

/* ---- 4. sitemap + robots -------------------------------------------------- */
const locs = [];
for (const r of ALL) {
  if (isInput(r)) continue;
  const html = fs.readFileSync(path.join(DIR, r), 'utf8');
  if (/<meta name="robots" content="[^"]*noindex/i.test(html)) continue;
  const canon = (html.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1];
  if (canon && canon !== urlOf(r)) continue; // a page that names another page as canonical is a duplicate
  locs.push(urlOf(r));
}
locs.sort((a, b) => a.length - b.length || a.localeCompare(b));
fs.writeFileSync(path.join(DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  locs.map(l => `  <url><loc>${l}</loc></url>`).join('\n') + `\n</urlset>\n`);
fs.writeFileSync(path.join(DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
console.log(`sitemap.xml: ${locs.length} locs`);
