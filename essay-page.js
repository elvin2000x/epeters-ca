// essay-page.js: the blog post page template, shared by build.js (the real build)
// and Site Studio (the instant preview while writing), so both render the same page.
// epeters.ca copy (ticket #12, 2026-09-27), derived from the elvinpeters.com template:
// indexable (no noindex), canonical + og on epeters.ca, The Rabbit Hole menu and footer
// line from chrome.js, and the end CTA points back to elvinpeters.com with UTM tags.
'use strict';

const GA = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CLZ7N26J1Q"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-CLZ7N26J1Q');</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1699232654449762');fbq('track','PageView');</script>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">`;

const CSS = `
:root{--bg:#e6ebf1;--bg-2:#dde4ec;--panel:#ffffff;--panel-2:#f3f6fa;--line:#c3cedd;--line-soft:#d3dce8;--ink:#0e1a2b;--ink-2:#3d4d63;--muted:#4f6076;--gold:#9c761f;--gold-2:#7a5a12;--cyan:#1c6ea8;--glow:rgba(156,118,31,.14);--shadow:0 18px 40px -24px rgba(14,26,43,.45);--serif:'EB Garamond',Georgia,'Times New Roman',serif;--sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0a1524;--bg-2:#060d18;--panel:#1b2c45;--panel-2:#131f33;--line:#2b405c;--line-soft:#223351;--ink:#e9eff7;--ink-2:#b7c6d9;--muted:#8ba2bd;--gold:#c9a250;--gold-2:#e0bd6b;--cyan:#4fb3f0;--glow:rgba(201,162,80,.16);--shadow:0 24px 50px -28px rgba(0,0,0,.7)}}
:root[data-theme="light"]{--bg:#e6ebf1;--bg-2:#dde4ec;--panel:#ffffff;--panel-2:#f3f6fa;--line:#c3cedd;--line-soft:#d3dce8;--ink:#0e1a2b;--ink-2:#3d4d63;--muted:#4f6076;--gold:#9c761f;--gold-2:#7a5a12;--cyan:#1c6ea8;--shadow:0 18px 40px -24px rgba(14,26,43,.45)}
:root[data-theme="dark"]{--bg:#0a1524;--bg-2:#060d18;--panel:#1b2c45;--panel-2:#131f33;--line:#2b405c;--line-soft:#223351;--ink:#e9eff7;--ink-2:#b7c6d9;--muted:#8ba2bd;--gold:#c9a250;--gold-2:#e0bd6b;--cyan:#4fb3f0;--shadow:0 24px 50px -28px rgba(0,0,0,.7)}
*{box-sizing:border-box}html,body{margin:0}
body{background:linear-gradient(180deg,var(--bg),var(--bg-2));color:var(--ink);font-family:var(--sans);line-height:1.7;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.nav{position:sticky;top:0;z-index:40;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--bg) 80%,transparent);border-bottom:1px solid var(--line-soft)}
.nav .in{max-width:1120px;margin:0 auto;padding:0 24px;height:64px;display:flex;align-items:center;gap:20px}
.brandmark{display:flex;align-items:center;gap:11px;font-family:var(--serif);font-size:18px}
.brandmark .sig{width:32px;height:32px;border:1px solid var(--line);border-radius:9px;display:grid;place-items:center;background:var(--panel)}
.nav .lk{margin-left:auto;display:flex;gap:24px;align-items:center}
.nav .lk a{font-size:14px;color:var(--ink-2)}.nav .lk a:hover{color:var(--ink)}
.themebtn{width:44px;height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:none;border:1px solid var(--line);border-radius:10px;color:var(--ink-2);cursor:pointer;font-size:15px;line-height:1}
.nav .lk a.cta{border:1px solid var(--gold);color:var(--gold-2);padding:11px 16px;border-radius:999px;font-weight:600;display:inline-flex;align-items:center;min-height:44px}
.eyebrow{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-2);font-weight:600}
article{max-width:720px;margin:0 auto;padding:44px 24px 40px}
.arthead .cover{width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:16px;border:1px solid var(--line);box-shadow:var(--shadow);margin-bottom:26px}
article h1{font-family:var(--serif);font-weight:400;font-size:clamp(2rem,4.6vw,3rem);line-height:1.08;letter-spacing:-.015em;margin:14px 0 0;text-wrap:balance}
.dek{font-size:1.2rem;color:var(--ink-2);margin:16px 0 0;font-family:var(--serif);font-style:italic}
.byline{display:flex;gap:14px;align-items:center;margin:22px 0 0;padding-bottom:26px;border-bottom:1px solid var(--line-soft);font-size:14px;color:var(--muted)}
.byline b{color:var(--ink-2);font-weight:600}
.body{font-size:18px;color:var(--ink)}
.body h2{font-family:var(--serif);font-weight:600;font-size:1.6rem;letter-spacing:-.01em;margin:38px 0 12px;line-height:1.2}
.body p{margin:0 0 20px}
.body ul{margin:0 0 20px;padding-left:22px}.body li{margin:0 0 8px}
.body blockquote{margin:26px 0;padding:4px 0 4px 22px;border-left:3px solid var(--gold);font-family:var(--serif);font-style:italic;font-size:1.25rem;color:var(--ink-2)}
.body strong{color:var(--ink);font-weight:700}
.body code{font-family:ui-monospace,Consolas,monospace;font-size:.9em;background:var(--panel-2);border:1px solid var(--line-soft);border-radius:5px;padding:1px 6px}
.endcta{max-width:720px;margin:10px auto 0;padding:0 24px}
.endcta .card{background:linear-gradient(160deg,var(--panel),var(--panel-2));border:1px solid var(--line);border-radius:16px;padding:28px;text-align:center}
.endcta h3{font-family:var(--serif);font-weight:400;font-size:1.6rem;margin:0}
.endcta p{color:var(--ink-2);margin:10px 0 18px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px;border:1px solid transparent;cursor:pointer;font-family:var(--sans);background:transparent}
.btn.primary{background:linear-gradient(135deg,var(--gold),var(--gold-2));color:#1b1304}
.btn.ghost{border-color:var(--line);color:var(--ink);min-height:44px}
.backlink{display:inline-flex;gap:8px;align-items:center;color:var(--muted);font-size:14px;margin-bottom:8px}
footer{border-top:1px solid var(--line-soft);padding:30px 24px;color:var(--muted);font-size:13px;margin-top:56px}
footer .in{max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{padding:10px 4px;margin:-10px -4px}
footer a:hover{color:var(--gold-2)}
:focus-visible{outline:2px solid var(--gold-2);outline-offset:3px;border-radius:4px}
@media(max-width:640px){.nav .lk a:not(.cta){display:none}}
`;

// The menu and footer come from content/nav.json via chrome.js, the same config the
// rest of epeters.ca uses. The pill slot (the only link left on a phone before the
// drawer opens) is the monthly letter on elvinpeters.com: the site's one job (Rule 68).
const CH = require('./chrome.js');
const NAVC = CH.NAVC;
const X = l => (l.ext ? ' target="_blank" rel="noopener"' : '');
const LETTER = NAVC.footer.links[NAVC.footer.links.length - 1];
const NAV = `<nav class="nav"><div class="in">
  <a class="brandmark" href="/"><span class="sig"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 5v14M6 5h9M6 12h7M6 19h9" stroke="var(--gold)" stroke-width="2" stroke-linecap="round"/><circle cx="19.5" cy="18.6" r="1.9" fill="var(--gold)"/></svg></span>${CH.esc(NAVC.brand.label)}</a>
  <div class="lk">${NAVC.menu.map(l => `<a href="${l.href}"${X(l)}>${l.label}</a>`).join('')}<a class="cta" href="${CH.esc(CH.utm(LETTER.href, 'nav', 'blog'))}">${CH.esc(LETTER.label)}</a></div>
</div></nav>`;

const FOOT = CH.foot('blog');

const THEME = `<script>(function(){var r=document.documentElement;document.addEventListener('click',function(e){if(e.target.closest('#tg')){var d=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');r.setAttribute('data-theme',d==='dark'?'light':'dark')}})})();</script>`;

const NLCSS = `
.nlrow{display:flex;gap:10px;max-width:440px;margin:18px auto 0;flex-wrap:wrap;justify-content:center}
.nlrow input{flex:1;min-width:210px;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font-size:16px;font-family:var(--sans)}
.nlmsg{font-size:14px;color:var(--muted);margin:10px 0 0;min-height:18px}
.ctarow{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px}
`;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function head(title, desc, ogimg, canon){
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Elvin Peters</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="https://epeters.ca${ogimg}"><meta property="og:url" content="${canon}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:creator" content="@elvin_peters">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 5v14M6 5h9M6 12h7M6 19h9' stroke='%23c9a250' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='19.5' cy='18.6' r='1.9' fill='%23c9a250'/%3E%3C/svg%3E">
${GA}${FONTS}<style>${CSS}${NLCSS}</style><link rel="stylesheet" href="/css/nav-drawer.css"><script src="/js/site.js"></script></head><body>`;
}

// End-of-post CTA: book first, services second, owned newsletter capture third.
// Posts to the owned lead API (same pattern + bot-wall as the homepage form).
const ENDCTA = `<section class="endcta"><div class="card">
<h3>Liked this? The book goes deeper.</h3>
<p>The Artificial Advantage: the frameworks behind everything here, written for professionals, not programmers.</p>
<div class="ctarow"><a class="btn primary" href="${CH.utm('https://elvinpeters.com/', 'endcta', 'blog')}">Read The Artificial Advantage</a><a class="btn ghost" href="${CH.utm('https://elvinpeters.com/free/', 'endcta', 'blog')}">Get the Free Toolkit</a></div>
<form id="nlform" class="nlrow" novalidate><input type="text" name="website" value="" style="position:absolute;left:-5000px" tabindex="-1" autocomplete="off" aria-hidden="true"><input id="nlemail" type="email" name="email" required placeholder="you@work.com" aria-label="Email address"><button class="btn ghost" type="submit">Get the newsletter</button></form>
<p class="nlmsg" id="nlmsg"></p>
<script>(function(){var f=document.getElementById('nlform'),m=document.getElementById('nlmsg');if(!f)return;f.addEventListener('submit',function(ev){ev.preventDefault();var em=document.getElementById('nlemail').value.trim();if(!em){m.textContent='Enter your email first.';return}m.textContent='One sec…';fetch('https://ultimateaidirectory.com/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em,source:${JSON.stringify(CH.newsletterSource('blog')).replace(/"/g, "'")},website:f.website.value})}).then(function(r){return r.json().catch(function(){return{}})}).then(function(){m.textContent='Done. Watch your inbox.';f.reset()}).catch(function(){m.textContent='That did not go through. Try again in a minute.'})})})();</script>
</div></section>`;

// The blog post design system. Spec: BLOG-DESIGN-SYSTEM.md (canonical 2026-08-07).
// Shell, type, neutrals and the shared module library live in css/post.css and are
// scoped under .trp; each post file carries only its own modules. Every post ships
// fixed dark and opens on type, never a hero photograph.
const POSTCSS = `<link rel="stylesheet" href="/css/post.css">`;

// One post page. Body is already HTML: a hand-coded file, raw HTML, or Markdown
// rendered by md.js. Optional fields (seo_title, seo_description, tags) change the
// page only when set, so posts that never use them build exactly as before.
function essayPage(e, body){
  const canon = `https://epeters.ca/blog/${e.slug}/`;
  const img = `/img/${e.image}`;
  const og = e.og ? `/img/${e.og}` : img;
  const title = e.seo_title || e.title, desc = e.seo_description || e.dek;
  const accent = e.accent || 'amber';
  let page;
  if(e.custom){
    // Custom-bodied post: the body file brings its own post-specific styles,
    // markup and scripts. build.js supplies head, nav, CTA, footer, analytics.
    page = head(title, desc, og, canon) + NAV + body + ENDCTA + FOOT + THEME + `</body></html>`;
  } else {
    // Standard post: the design system's shell and header pattern wrapped around
    // the essay's own HTML. Content is never rewritten here, only skinned.
    page = head(title, desc, og, canon) + NAV +
    `<div class="trp accent-${accent}"><div class="wrap">`+
      `<div class="col"><a class="trp-back" href="/blog/">&larr; Blog</a></div>`+
      `<header class="col" style="padding-top:26px">`+
        `<div class="eyebrow">${esc(e.kicker||'Playbook')}</div>`+
        `<h1>${esc(e.title)}</h1>`+
        `<p class="dek">${esc(e.dek)}</p>`+
        `<div class="byline">Elvin Peters${e.date?' &middot; '+esc(e.date):''} &middot; ${e.readmins||8} min read</div>`+
      `</header>`+
      `<div class="col">${body}</div>`+
    `</div></div>`+
    ENDCTA +
    FOOT + THEME + `</body></html>`;
  }
  const tags = (Array.isArray(e.tags) ? e.tags : String(e.tags || '').split(','))
    .map(t => String(t).trim()).filter(Boolean);
  const tagMeta = tags.map(t => `<meta property="article:tag" content="${esc(t).replace(/"/g, '&quot;')}">`).join('');
  // Every post ships fixed dark, and loads the shared post stylesheet.
  return page.replace('<html lang="en">', '<html lang="en" data-theme="dark">')
             .replace('</head>', () => tagMeta + POSTCSS + '</head>');
}

module.exports = { GA, FONTS, CSS, NAV, FOOT, THEME, NLCSS, ENDCTA, POSTCSS, esc, head, essayPage };
