// verify.js: the epeters.ca gate. Run after node build.js; exit 1 on any FAIL.
// Checks every built page for the things the move promised (ticket #12 plan, Phases A + D).
'use strict';
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const CH = require('./chrome.js');
const fails = [], notes = [];
const FAIL = (f, m) => fails.push(`${f}: ${m}`);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts']);
function files(rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(DIR, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...files(r)); } else out.push(r);
  }
  return out;
}
const ALL = files();
// Build code is not served content (md.js carries example paths in its comments).
const TEXT = ALL.filter(f => /\.(html|js|css|json|xml|txt)$/.test(f) && !['verify.js', 'build.js', 'chrome.js', 'md.js'].includes(f));
const PAGES = ALL.filter(f => f.endsWith('.html') && !CH.NAVC.noChrome.some(p => f.startsWith(p)));
const urlOf = r => `https://epeters.ca/${r.replace(/(^|\/)index\.html$/, '$1')}`;
// Decision 2026-09-25: the Anatomy Sandbox is shared by link and stays noindex.
const NOINDEX_OK = new Set(['projects/anatomy-sandbox/index.html']);
const exists = p => {
  const f = path.join(DIR, decodeURI(p.split(/[?#]/)[0]));
  return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
};

for (const f of TEXT) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  // The public address is elvin@elvinpeters.com; epeters.ca mail is private routing.
  if (/elvin@epeters\.ca/i.test(s)) FAIL(f, 'contains elvin@epeters.ca');
  // A moved section still addressed on .com means a missed rewrite.
  const m = s.match(/https?:\/\/(www\.)?elvinpeters\.com\/(writing|essays|play|apps|quiz|quiz-ai-risk|quiz-time-waste|quiz-tool-picker|projects|colour)(?=[\/"'?#\s<)\\]|$)/);
  if (m) FAIL(f, `links a moved section on .com: ${m[0]}`);
  // Every link back to elvinpeters.com is UTM-tagged (plan blindspot 1).
  const re = /(?:<a\b[^>]*?href=|href\s*:\s*)\\?["'](https?:\/\/(?:www\.)?elvinpeters\.com[^"'\\\s]*)/g; let a;
  while ((a = re.exec(s))) if (!/utm_source=epeters\.ca/.test(a[1])) FAIL(f, `untagged link to .com: ${a[1]}`);
  // Every root-relative href/src resolves on this site.
  const lr = /(?:\b(?:href|src)\s*[=:]\s*\\?["']|url\(\s*["']?)(\/(?!\/)[^"'\\\s)]*)/g; let l;
  while ((l = lr.exec(s))) if (!l[1].includes('${') && !exists(l[1])) FAIL(f, `broken local link ${l[1]}`);
}

for (const f of PAGES) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  const foot = (s.match(/<!-- ep:ca-foot -->([\s\S]*?)<!-- \/ep:ca-foot -->/) || [])[1];
  if (!foot) FAIL(f, 'no footer line');
  else for (const l of CH.NAVC.footer.links) if (!foot.includes(CH.esc(CH.utm(l.href, 'footer', CH.sectionOf(f))))) FAIL(f, `footer missing ${l.label}`);
  if (CH.NAVC.barPages.includes(f) && !/<!-- ep:ca-bar -->/.test(s)) FAIL(f, 'no top bar');
  const noindex = /<meta name="robots" content="[^"]*noindex/i.test(s);
  if (noindex && !NOINDEX_OK.has(f)) FAIL(f, 'noindex (pages on epeters.ca are indexable)');
  const canon = (s.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1];
  if (!canon) FAIL(f, 'no canonical');
  else if (!canon.startsWith('https://epeters.ca/')) FAIL(f, `canonical off-site: ${canon}`);
  if (f.startsWith('writing/') && f !== 'writing/index.html' && !s.includes(`source:'${CH.newsletterSource('writing')}'`)) FAIL(f, 'newsletter form not tagged ' + CH.newsletterSource('writing'));
}

// Sitemap: every loc is a real, indexable page on this site; the calculators are in it.
const sm = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => x[1]);
const byUrl = new Map(PAGES.map(p => [urlOf(p), p]));
for (const l of locs) {
  const p = byUrl.get(l);
  if (!p) FAIL('sitemap.xml', `loc is not a page: ${l}`);
  else if (/<meta name="robots" content="[^"]*noindex/i.test(fs.readFileSync(path.join(DIR, p), 'utf8'))) FAIL('sitemap.xml', `noindex page listed: ${l}`);
}
const calc = locs.filter(l => l.includes('/apps/calculators/')).length;
if (calc !== 12) FAIL('sitemap.xml', `expected 12 calculator locs, found ${calc}`);
if (!/Sitemap: https:\/\/epeters\.ca\/sitemap\.xml/.test(fs.readFileSync(path.join(DIR, 'robots.txt'), 'utf8'))) FAIL('robots.txt', 'no sitemap line');

// Own copy stays in voice (Rule 02): no em dashes in the home page or the chrome.
// The blog moved here from .com, so its voice check moved with it: the source (essays.json,
// essays/ bodies) and the built writing/ pages.
const VOICE = ['index.html', 'content/nav.json', 'content/essays.json',
  ...ALL.filter(f => (f.startsWith('essays/') || f.startsWith('writing/')) && f.endsWith('.html'))];
for (const f of VOICE) if (/—/.test(fs.readFileSync(path.join(DIR, f), 'utf8'))) FAIL(f, 'em dash');

// CNAME only arrives with Phase B (the DNS flip needs Elvin's go).
if (fs.existsSync(path.join(DIR, 'CNAME'))) {
  const c = fs.readFileSync(path.join(DIR, 'CNAME'), 'utf8').trim();
  if (c !== 'epeters.ca') FAIL('CNAME', `expected epeters.ca, found ${c}`); else notes.push('CNAME present (Phase B)');
} else notes.push('CNAME absent (Phase A)');

console.log(`${PAGES.length} pages, ${locs.length} sitemap locs, ${TEXT.length} text files checked. ${notes.join('; ')}`);
if (fails.length) { console.log(`FAIL (${fails.length})`); fails.slice(0, 60).forEach(x => console.log('  ' + x)); process.exit(1); }
console.log('GREEN');
