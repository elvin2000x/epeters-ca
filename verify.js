// verify.js: the epeters.ca gate. Run after node build.js; exit 1 on any FAIL.
// Checks every built page for the things the move promised (ticket #12 plan, Phases A + D).
'use strict';
const fs = require('fs'), path = require('path');
const DIR = __dirname;
const CH = require('./chrome.js');
const fails = [], notes = [];
const FAIL = (f, m) => fails.push(`${f}: ${m}`);

const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', 'tools']); // tools/: the blog image renderer and its templates, not pages
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
const isStub = f => f.endsWith('.html') && fs.readFileSync(path.join(DIR, f), 'utf8').includes('<!-- ep:moved-stub -->');
const STUBS = ALL.filter(isStub);
const PAGES = ALL.filter(f => f.endsWith('.html') && !CH.NAVC.noChrome.some(p => f.startsWith(p)) && !STUBS.includes(f));
const urlOf = r => `https://epeters.ca/${r.replace(/(^|\/)index\.html$/, '$1')}`;
// Decision 2026-09-25: the Anatomy Sandbox is shared by link and stays noindex.
// 404.html is the not-found page GitHub Pages serves at any missing address (#367).
const NOINDEX_OK = new Set(['projects/anatomy-sandbox/index.html', '404.html']);
const exists = p => {
  const f = path.join(DIR, decodeURI(p.split(/[?#]/)[0]));
  return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
};

for (const f of TEXT) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  // The public address is elvin@elvinpeters.com; epeters.ca mail is private routing.
  if (/elvin@epeters\.ca/i.test(s)) FAIL(f, 'contains elvin@epeters.ca');
  // A moved section still addressed on .com means a missed rewrite.
  const m = s.match(/https?:\/\/(www\.)?elvinpeters\.com\/(writing|essays|play|apps|quiz-ai-risk|quiz-time-waste|quiz-tool-picker|projects|colour)(?=[\/"'?#\s<)\\]|$)/);
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
  if (!canon) { if (f !== '404.html') FAIL(f, 'no canonical'); }
  else if (!canon.startsWith('https://epeters.ca/')) FAIL(f, `canonical off-site: ${canon}`);
  if (f.startsWith('blog/') && f !== 'blog/index.html' && !s.includes(`source:'${CH.newsletterSource('blog')}'`)) FAIL(f, 'newsletter form not tagged ' + CH.newsletterSource('blog'));
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
// essays/ bodies) and the built blog/ pages, plus the 404.
const VOICE = ['index.html', 'content/nav.json', 'content/essays.json',
  '404.html', ...ALL.filter(f => (f.startsWith('essays/') || f.startsWith('blog/')) && f.endsWith('.html'))];
for (const f of VOICE) if (/—/.test(fs.readFileSync(path.join(DIR, f), 'utf8'))) FAIL(f, 'em dash');

// #367: the blog moved from writing/ to blog/. Every old address is a moved stub that
// lands on a real blog/ page in one hop (query + hash kept), and nothing links the old path.
const oldSlugs = ALL.filter(f => f.startsWith('writing/') && f.endsWith('.html'));
for (const f of oldSlugs) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  if (!STUBS.includes(f)) { FAIL(f, 'writing/ page is not a moved stub'); continue; }
  const to = `https://epeters.ca/blog/${f.slice('writing/'.length).replace(/(^|\/)index\.html$/, '$1')}`;
  if (!/<meta name="robots" content="noindex, follow">/.test(s)) FAIL(f, 'stub not noindex, follow');
  if (!s.includes(`<link rel="canonical" href="${to}">`)) FAIL(f, `stub canonical is not ${to}`);
  if (!s.includes(`location.replace('${to}' + location.search + location.hash)`)) FAIL(f, 'stub JS redirect drops ?query or #hash');
  if (!s.includes(`<meta http-equiv="refresh" content="0; url=${to}">`)) FAIL(f, 'stub has no meta refresh');
  if (!exists(to.slice('https://epeters.ca'.length))) FAIL(f, `stub target missing: ${to}`);
}
if (oldSlugs.length < 11) FAIL('writing/', `expected 11 redirect stubs (10 posts + index), found ${oldSlugs.length}`);
for (const f of TEXT) if (!STUBS.includes(f) && /(?:href|src)\s*[=:]\s*\\?["']\/writing\//.test(fs.readFileSync(path.join(DIR, f), 'utf8'))) FAIL(f, 'links /writing/ (use /blog/)');

// #367: the site-styled 404. Served at any depth, so no relative paths; the four doors are there.
{
  const s = fs.readFileSync(path.join(DIR, '404.html'), 'utf8');
  if (!/<meta name="robots" content="noindex/.test(s)) FAIL('404.html', 'not noindex');
  for (const h of ['/', '/blog/', '/play/', '/apps/']) if (!s.includes(`href="${h}"`)) FAIL('404.html', `no link to ${h}`);
  const rel = /\b(?:href|src)="(?!https?:|\/|#|data:|mailto:)([^"]*)"/g; let m;
  while ((m = rel.exec(s))) FAIL('404.html', `relative path ${m[1]} breaks below the root`);
  if (locs.includes('https://epeters.ca/404.html')) FAIL('sitemap.xml', '404.html listed');
}

// #361: one blog template. Posts carry no styles of their own, every image has alt text,
// titles and deks fit search results, and each post ships its featured image, share card,
// read time and valid JSON-LD. BLOG-DESIGN.md is the spec.
{
  const TYPES = new Set(['Field report', 'Playbook', 'Field notes', 'Column']);
  const BODY_CLASSES = new Set(['stats', 'pull', 'foot', 'tbl', 'num', 'fig', 'chart', 'note', 'warn', 'lab', 'code', 'plab', 'prose', 'wrap',
    'list', 'legend', 'k1', 'k2', 'k3', 'km', 's1', 's2', 's3', 'sm', 'l1', 'l2', 'l3', 'lm', 'grid', 'axis', 'ink', 'on', 'bad', 'lbad', 'lbl', 'big']);
  const J = JSON.parse(fs.readFileSync(path.join(DIR, 'content/essays.json'), 'utf8'));
  const posts = (J.posts || J).filter(e => !e.draft);
  const noChrome = s => s.replace(/<!-- ep:ca-(bar|foot) -->[\s\S]*?<!-- \/ep:ca-\1 -->/g, '');
  for (const e of posts) {
    const id = `essays.json ${e.slug}`;
    if (e.title.length > 60) FAIL(id, `title ${e.title.length} characters (60 max)`);
    if (e.dek.length > 155) FAIL(id, `dek ${e.dek.length} characters (155 max)`);
    if (!TYPES.has(e.type)) FAIL(id, `type "${e.type}" is not one of ${[...TYPES].join(', ')}`);
    for (const k of ['featured_alt', 'featured_caption', 'og_alt']) if (!e[k] || e[k] === 'TODO') FAIL(id, `${k} missing`);
    for (const k of ['featured_alt', 'og_alt']) if (e[k] && e[k].length > 125) FAIL(id, `${k} over 125 characters`);
    for (const f of ['featured-1600.webp', 'featured-800.webp', 'og.png', 'image.json'])
      if (!fs.existsSync(path.join(DIR, 'img/posts', e.slug, f))) FAIL(id, `img/posts/${e.slug}/${f} missing (python tools/render_images.py img/posts/${e.slug})`);
    const body = fs.readFileSync(path.join(DIR, e.file), 'utf8');
    if (/<style|\sstyle="/i.test(body)) FAIL(e.file, 'carries its own styles (blog.css is the only stylesheet)');
    if (/<script/i.test(body)) FAIL(e.file, '<script> in a post body (charts are static SVG)');
    for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (!BODY_CLASSES.has(c)) FAIL(e.file, `class "${c}" is not in blog.css`);
    const page = path.join(DIR, 'blog', e.slug, 'index.html');
    if (!fs.existsSync(page)) { FAIL(id, 'not built'); continue; }
    const s = fs.readFileSync(page, 'utf8'), f = `blog/${e.slug}/index.html`;
    if (/<style|\sstyle="/i.test(noChrome(s))) FAIL(f, 'inline styles outside the shared chrome');
    if (!s.includes('href="/css/blog.css"')) FAIL(f, 'does not load /css/blog.css');
    if (!s.includes('<!-- ep:ca-bar -->') || /<nav class="nav"/.test(s)) FAIL(f, 'not on the .ca bar (the old nav.nav header is gone, #342)');
    if (!/\d+ min read/.test(s)) FAIL(f, 'no read time');
    if (!s.includes(`<meta property="og:image" content="https://epeters.ca/img/posts/${e.slug}/og.png">`)) FAIL(f, 'og:image is not its og.png');
    if (!s.includes(`<link rel="canonical" href="https://epeters.ca/blog/${e.slug}/">`)) FAIL(f, 'canonical is not its /blog/ URL');
    if (/[–]/.test(s)) FAIL(f, 'en dash');
    for (const m of s.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) FAIL(f, 'img without alt');
    const ld = [...s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (!ld.length) FAIL(f, 'no JSON-LD');
    for (const m of ld) { try { const o = JSON.parse(m[1]); if (o['@type'] !== 'BlogPosting' || !o.headline || !o.datePublished || !o.image) FAIL(f, 'JSON-LD is not a complete BlogPosting'); } catch (x) { FAIL(f, 'JSON-LD does not parse: ' + x.message); } }
  }
  const idx = fs.readFileSync(path.join(DIR, 'blog/index.html'), 'utf8');
  if (/<style|\sstyle="/i.test(noChrome(idx))) FAIL('blog/index.html', 'inline styles outside the shared chrome');
  if (/<nav class="nav"/.test(idx)) FAIL('blog/index.html', 'old nav.nav header (#342)');
  for (const e of posts) if (!idx.includes(`href="/blog/${e.slug}/"`)) FAIL('blog/index.html', `no card for ${e.slug}`);
}

// #356: the Rabbit Hole homepage. One exhibit list (content/exhibits.json) feeds Story, Map and Scan.
// Link gates: every shown exhibit lands somewhere real and tagged. Denylist gates: the brief's
// "No Google name, no CoachingConnect, no Shutterstock, Flask or doc tool, Justine only on
// Colour Match, and private tools named but never linked."
const EX = JSON.parse(fs.readFileSync(path.join(DIR, 'content', 'exhibits.json'), 'utf8'));
const LIVE_HREFS = [];
{
  const J = 'content/exhibits.json', bIds = new Set(EX.branches.map(b => b.id)), ids = new Set();
  const back = EX.backstage || [];
  if (!back.every(n => typeof n === 'string')) FAIL(J, 'backstage entries must be names only (strings)');
  const backLc = new Set(back.map(n => String(n).toLowerCase()));
  for (const e of EX.exhibits) {
    const at = `${J} ${e.id}`;
    for (const k of ['id', 'branch', 'title', 'kind', ...(e.checked ? ['cta', 'href', 'thumb'] : [])]) if (!e[k] || typeof e[k] !== 'string') FAIL(at, `missing ${k}`);
    if (ids.has(e.id)) FAIL(at, 'duplicate id'); ids.add(e.id);
    if (!bIds.has(e.branch)) FAIL(at, `unknown branch ${e.branch}`);
    if (backLc.has(String(e.title).toLowerCase())) FAIL(at, 'a Backstage tool is linked as an exhibit');
    if (!e.checked) continue; // hidden until checked; '#' placeholders only ever live here
    const h = e.href || '';
    if (h.startsWith('#')) FAIL(at, 'a checked exhibit has a # placeholder href');
    else if (h.startsWith('/')) { if (!exists(h)) FAIL(at, `local href missing: ${h}`); }
    else if (!h.startsWith('https://')) FAIL(at, `external href is not https: ${h}`);
    else {
      LIVE_HREFS.push([at, h]);
      if (/^https:\/\/(www\.)?elvinpeters\.com/.test(h) && !/utm_source=epeters\.ca/.test(h)) FAIL(at, `untagged link to .com: ${h}`);
    }
    if (e.kind === 'game' && !/^https:\/\/play\.elvinpeters\.com\/[^/]+\/$|^\/play\//.test(h)) FAIL(at, `game href is not absolute play.elvinpeters.com or /play/: ${h}`);
    if (!exists(e.thumb)) FAIL(at, `thumb missing: ${e.thumb}`);
    else if (!/\.webp$/.test(e.thumb)) FAIL(at, 'thumb is not WebP');
    const txt = JSON.stringify(e);
    if (/justine/i.test(txt) && e.id !== 'colour') FAIL(at, 'Justine named outside Colour Match');
  }
  if (!EX.exhibits.some(e => e.checked)) FAIL(J, 'no checked exhibits');

  const HOME = ['index.html', J, 'js/home.js', 'js/home-map.js', 'css/home.css'];
  for (const f of HOME) {
    if (!fs.existsSync(path.join(DIR, f))) { FAIL(f, 'home file missing'); continue; }
    let s = fs.readFileSync(path.join(DIR, f), 'utf8');
    if (f === J) { const o = JSON.parse(s); delete o._comment; s = JSON.stringify(o); }
    // Font and analytics hosts are infrastructure, not a named employer.
    s = s.replace(/fonts\.googleapis\.com|fonts\.gstatic\.com|www\.googletagmanager\.com/g, '');
    const deny = s.match(/google|coaching ?connect|shutterstock|flask|document intelligence|docengine|paralegal|api\.elvinpeters\.com\/docs/i);
    if (deny) FAIL(f, `denylisted name: ${deny[0]}`);
    // Private tools are named in Backstage, never linked or addressed.
    const priv = s.match(/(?:qr|admin|studio|hub|mc|mission-control|empire|dashboard)\.elvinpeters\.com|elvinpeters\.com\/(?:record|studio|admin|hub)\b|mission-control|empire-01|:87\d\d/i);
    if (priv) FAIL(f, `private tool addressed: ${priv[0]}`);
    if (f !== J && /justine/i.test(s)) FAIL(f, 'Justine named outside the Colour Match exhibit');
  }
  const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'), hj = fs.readFileSync(path.join(DIR, 'js/home.js'), 'utf8');
  if (!/gtag\('config','G-CLZ7N26J1Q'\)/.test(idx)) FAIL('index.html', 'GA4 G-CLZ7N26J1Q missing');
  if (!hj.includes("'variant_switch'")) FAIL('js/home.js', 'no variant_switch event');
  if (!hj.includes("'newsletter | epeters-home-'")) FAIL('js/home.js', "newsletter source is not 'newsletter | epeters-home-<view>'");
  for (const v of ['story', 'map', 'scan']) if (!new RegExp(`id="v-${v}"`).test(idx)) FAIL('index.html', `no #v-${v} view`);
  if (!/id="sw-story" value="story" checked/.test(idx)) FAIL('index.html', 'Story is not the default view');
  if (!/data-go="map">See everything</.test(idx)) FAIL('index.html', 'no See everything button');
  notes.push(`${EX.exhibits.filter(e => e.checked).length} exhibits shown`);
}

// CNAME only arrives with Phase B (the DNS flip needs Elvin's go).
if (fs.existsSync(path.join(DIR, 'CNAME'))) {
  const c = fs.readFileSync(path.join(DIR, 'CNAME'), 'utf8').trim();
  if (c !== 'epeters.ca') FAIL('CNAME', `expected epeters.ca, found ${c}`); else notes.push('CNAME present (Phase B)');
} else notes.push('CNAME absent (Phase A)');

// --live: every checked external exhibit href answers 200 right now (the `checked` promise).
(async () => {
  if (process.argv.includes('--live')) {
    await Promise.all(LIVE_HREFS.map(async ([at, h]) => {
      try {
        const r = await fetch(h, { redirect: 'follow', headers: { 'user-agent': 'epeters.ca verify' } });
        if (r.status !== 200) FAIL(at, `live ${r.status}: ${h}`);
      } catch (err) { FAIL(at, `live error ${err.message}: ${h}`); }
    }));
    notes.push(`${LIVE_HREFS.length} external hrefs live-checked`);
  }
  console.log(`${PAGES.length} pages, ${locs.length} sitemap locs, ${TEXT.length} text files checked. ${notes.join('; ')}`);
  if (fails.length) { console.log(`FAIL (${fails.length})`); fails.slice(0, 60).forEach(x => console.log('  ' + x)); process.exit(1); }
  console.log('GREEN');
})();
