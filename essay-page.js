// essay-page.js: the blog templates (every post and the /blog/ index), shared by build.js.
// Design: BLOG-DESIGN.md (card #361, approved sample 2026-09-28). One look for every post:
// the .ca top bar and footer from chrome.js, a navy title band, a paper article, one
// stylesheet (/css/blog.css). A post brings its words, images and modules, never a colour,
// font, size, <style> block or style= attribute (verify.js fails those).
'use strict';
const CH = require('./chrome.js');

const ORIGIN = 'https://epeters.ca';
const SECTION = 'blog';
const WPM = 230; // read time = prose words / 230, rounded up (BLOG-DESIGN.md section 5)
const LINKEDIN = 'https://www.linkedin.com/in/elvinmpeters';

const GA = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CLZ7N26J1Q"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-CLZ7N26J1Q');</script>
<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','1699232654449762');fbq('track','PageView');</script>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;600&display=swap" rel="stylesheet">`;

// Light for everyone by default; dark only when the reader asks, remembered per browser.
// Runs before paint so a dark-mode reader never sees a light flash.
const MODE_BOOT = `<script>try{if(localStorage.getItem('rh-mode')==='dark')document.documentElement.setAttribute('data-mode','dark')}catch(e){}</script>`;

const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M6 5v14M6 5h9M6 12h7M6 19h9' stroke='%23c9a250' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='19.5' cy='18.6' r='1.9' fill='%23c9a250'/%3E%3C/svg%3E">`;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const showDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const eyebrow = e => e.topic ? `${e.type} · ${e.topic}` : e.type;
const postUrl = e => `${ORIGIN}/blog/${e.slug}/`;
const imgDir = e => `/img/posts/${e.slug}`;

// Prose words: the body minus code, charts and markup.
function wordCount(body) {
  const text = body.replace(/<(pre|svg|script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  return (text.match(/[A-Za-z0-9][A-Za-z0-9'’.,%$-]*/g) || []).length;
}

// Every h2 gets an id from its text, for the table of contents and for links.
function withIds(body) {
  const used = new Set(), h2s = [];
  const html = body.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (m, attrs = '', inner) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, '').trim();
    let id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) {
      const base = text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'section';
      id = base; for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
      attrs = ` id="${id}"` + attrs;
    }
    used.add(id); h2s.push({ id, text });
    return `<h2${attrs}>${inner}</h2>`;
  });
  return { html, h2s };
}

function head({ title, desc, canon, ogImage, ogAlt, type = 'article', extra = '' }) {
  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Elvin Peters</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="Elvin Peters">
<link rel="canonical" href="${canon}">
<meta name="theme-color" content="#0A1524">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="The Rabbit Hole">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${ORIGIN}${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@elvin_peters">
<meta name="twitter:image" content="${ORIGIN}${ogImage}">
${ICON}
${FONTS}
<link rel="stylesheet" href="/css/blog.css">
${MODE_BOOT}${extra}${GA}
</head>
<body>
`;
}

const MOON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const MODE_BTN = `<button class="mode" id="mode" type="button" aria-label="Switch to dark reading mode" aria-pressed="false">${MOON}</button>`;

// The end block: the only call to action. The monthly letter first (the owned lead API,
// the same endpoint and bot-wall as before), then the book. Copy from the approved sample.
function endBlock() {
  const source = CH.newsletterSource(SECTION).replace(/'/g, "\\'");
  return `<section class="endcta" aria-labelledby="endh">
  <div class="endcta-in">
    <div>
      <p class="kicker"><i aria-hidden="true"></i>The monthly letter</p>
      <h2 id="endh">Liked this? Get the next one first.</h2>
      <p>One letter a month with what I built, what it cost and what I measured. The book goes deeper on the frameworks behind all of it.</p>
      <form class="nl" id="nlform" novalidate>
        <input class="hp" type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true">
        <input id="nlemail" type="email" name="email" required placeholder="you@work.com" aria-label="Email address" autocomplete="email">
        <button class="btn" type="submit">Get the monthly letter</button>
      </form>
      <p class="nlmsg" id="nlmsg" role="status"></p>
    </div>
    <div class="acts">
      <a class="btn" href="${esc(CH.utm('https://elvinpeters.com/', 'endcta', SECTION))}">Elvin's book: The Artificial Advantage</a>
      <a class="txt" href="${esc(CH.utm('https://elvinpeters.com/free/', 'endcta', SECTION))}">Get the Free Toolkit →</a>
    </div>
  </div>
</section>
<script>(function(){var f=document.getElementById('nlform'),m=document.getElementById('nlmsg');if(!f)return;f.addEventListener('submit',function(ev){ev.preventDefault();var em=document.getElementById('nlemail');if(!em.value.trim()||!em.checkValidity()){m.textContent='Enter a valid email first.';em.focus();return}m.textContent='One sec…';fetch('https://ultimateaidirectory.com/api/lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:em.value.trim(),source:'${source}',website:f.website.value})}).then(function(r){return r.json().catch(function(){return{}})}).then(function(){m.textContent='Done. Watch your inbox.';f.reset()}).catch(function(){m.textContent='That did not go through. Try again in a minute.'})})})();</script>`;
}

// A post card (related posts and the blog index): the featured image at 800 wide.
function card(e, withDek) {
  return `<li class="rcard">
      <div class="thumb"><img src="${imgDir(e)}/featured-800.webp" alt="" width="800" height="450" loading="lazy"></div>
      <div class="body"><span class="k">${esc(eyebrow(e))}</span><h3><a href="/blog/${e.slug}/">${esc(e.title)}</a></h3>${withDek ? `<p>${esc(e.dek)}</p>` : ''}<span class="m">${showDate(e.published)} · ${e.readmins} min read</span></div>
    </li>`;
}

// Three related posts: same type first (newest first), then the newest of the rest.
function related(e, all) {
  const others = all.filter(o => o.slug !== e.slug).sort((a, b) => b.published.localeCompare(a.published));
  return [...others.filter(o => o.type === e.type), ...others.filter(o => o.type !== e.type)].slice(0, 3);
}

// Posts carry their measured facts as data; the build derives the rest.
function prepare(e, body) {
  const { html, h2s } = withIds(body);
  const words = wordCount(html);
  return Object.assign(e, { body: html, h2s, words, readmins: Math.max(1, Math.ceil(words / WPM)) });
}

const PAGE_JS = `<script>
(function(){
  var root=document.documentElement,post=document.getElementById('post');
  var mb=document.getElementById('mode');
  function sync(){var d=root.getAttribute('data-mode')==='dark';mb.setAttribute('aria-pressed',d);mb.setAttribute('aria-label',d?'Switch to light reading mode':'Switch to dark reading mode')}
  mb.addEventListener('click',function(){var d=root.getAttribute('data-mode')==='dark';if(d)root.removeAttribute('data-mode');else root.setAttribute('data-mode','dark');try{localStorage.setItem('rh-mode',d?'light':'dark')}catch(e){}sync()});
  sync();
  if(!post)return;
  var rail=[].slice.call(document.querySelectorAll('#toc a'));
  if(rail.length&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){rail.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)})}})},{rootMargin:'0px 0px -70% 0px'});[].forEach.call(post.querySelectorAll('h2[id]'),function(h){io.observe(h)})}
  var tp=document.querySelector('.toc-phone');if(tp)tp.addEventListener('click',function(e){if(e.target.closest('a'))this.removeAttribute('open')});
  var bar=document.getElementById('prog'),tick=false;
  function prog(){var r=post.getBoundingClientRect(),t=r.height-innerHeight;bar.style.transform='scaleX('+Math.max(0,Math.min(1,t>0?-r.top/t:1))+')';tick=false}
  if(bar){addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(prog)}},{passive:true});prog()}
  [].forEach.call(document.querySelectorAll('.code'),function(b){var btn=document.createElement('button');btn.type='button';btn.className='copy';btn.textContent='Copy';btn.setAttribute('aria-label','Copy this code');btn.addEventListener('click',function(){var t=b.querySelector('pre').innerText;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){btn.textContent='Copied'},function(){btn.textContent='Select and copy'});setTimeout(function(){btn.textContent='Copy'},1800)});b.appendChild(btn)});
  var cl=document.getElementById('copylink'),url=document.querySelector('link[rel=canonical]').href;
  if(cl)cl.addEventListener('click',function(){(navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(function(){cl.textContent='Link copied'},function(){cl.textContent=url});setTimeout(function(){cl.textContent='Copy link'},2000)});
})();
</script>`;

// One post page: the twelve parts of BLOG-DESIGN.md section 4, top to bottom.
function essayPage(e, all) {
  const canon = postUrl(e), dir = imgDir(e);
  const title = e.seo_title || e.title, desc = e.seo_description || e.dek;
  const modified = e.updated || e.published;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: e.title, description: desc,
    image: [`${ORIGIN}${dir}/featured-1600.webp`, `${ORIGIN}${dir}/og.png`],
    datePublished: e.published, dateModified: modified,
    author: { '@type': 'Person', name: 'Elvin Peters', url: 'https://elvinpeters.com/', sameAs: [LINKEDIN] },
    publisher: { '@type': 'Organization', name: 'The Rabbit Hole', url: `${ORIGIN}/` },
    mainEntityOfPage: canon, wordCount: e.words, timeRequired: `PT${e.readmins}M`, inLanguage: 'en-CA',
  };
  const tags = (Array.isArray(e.tags) ? e.tags : String(e.tags || '').split(',')).map(t => String(t).trim()).filter(Boolean);
  const extra = `
<meta property="article:published_time" content="${e.published}">
<meta property="article:modified_time" content="${modified}">
<meta property="article:author" content="Elvin Peters">
${tags.map(t => `<meta property="article:tag" content="${esc(t)}">`).join('\n')}
<link rel="preload" as="image" href="${dir}/featured-1600.webp" imagesrcset="${dir}/featured-800.webp 800w, ${dir}/featured-1600.webp 1600w" imagesizes="(min-width:1088px) 1040px, 100vw">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
`;

  // Stats open the article when the post has them, then the phone TOC, then the prose.
  let body = e.body.trim(), stats = '';
  const sm = body.match(/^<ul class="stats"[\s\S]*?<\/ul>/);
  if (sm) { stats = sm[0]; body = body.slice(sm[0].length).trim(); }
  const hasToc = e.words > 1500 && e.h2s.length >= 4;
  const tocItems = e.h2s.map(h => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('');
  const shareUrl = encodeURIComponent(canon);

  return head({ title, desc, canon, ogImage: `${dir}/og.png`, ogAlt: e.og_alt, extra }) +
`${CH.bar(SECTION)}
<div class="progress" aria-hidden="true"><i id="prog"></i></div>

<header class="band">
  <div class="band-in">
    <div class="top">
      <p class="crumb"><a href="/blog/">Blog</a><span aria-hidden="true">/</span>${esc(e.type)}</p>
      ${MODE_BTN}
    </div>
    <p class="kicker"><i aria-hidden="true"></i>${esc(eyebrow(e))}</p>
    <h1>${esc(e.title)}</h1>
    <p class="dek">${esc(e.dek)}</p>
    <div class="byline">
      <img src="/img/headshot.jpg" alt="" width="40" height="40">
      <b>Elvin Peters</b><span class="dot" aria-hidden="true">·</span>
      <time datetime="${e.published}">${showDate(e.published)}</time><span class="dot" aria-hidden="true">·</span>
      <span>${e.readmins} min read</span>${e.updated ? `<span class="dot" aria-hidden="true">·</span>
      <span>Updated <time datetime="${e.updated}">${showDate(e.updated)}</time></span>` : ''}
    </div>
  </div>
</header>

<figure class="featured">
  <img src="${dir}/featured-1600.webp" srcset="${dir}/featured-800.webp 800w, ${dir}/featured-1600.webp 1600w" sizes="(min-width:1088px) 1040px, 100vw" width="1600" height="900" alt="${esc(e.featured_alt)}" fetchpriority="high">
  <figcaption>${esc(e.featured_caption)}</figcaption>
</figure>

<div class="layout">
${hasToc ? `  <nav class="toc" aria-label="In this post">
    <p class="toc-label">In this post</p>
    <ol id="toc">${tocItems}</ol>
  </nav>
` : ''}
  <article class="article" id="post">
${stats}
${hasToc ? `    <details class="toc-phone">
      <summary><span class="toc-label">In this post</span></summary>
      <ol id="toc-phone">${tocItems}</ol>
    </details>
` : ''}
${body}

    <aside class="author" aria-label="About the author">
      <img src="/img/headshot.jpg" alt="Elvin Peters" width="72" height="72" loading="lazy">
      <div>
        <div class="nm">Elvin Peters</div>
        <div class="rl">Author of the AI Fluency Series · Toronto</div>
        <p>A marketer who taught himself to build with AI. His book is <a href="${esc(CH.utm('https://elvinpeters.com/', 'author', SECTION))}">The Artificial Advantage</a>.</p>
        <a href="${LINKEDIN}" rel="me noopener" target="_blank">Follow on LinkedIn →</a>
      </div>
    </aside>

    <div class="share" aria-label="Share this post">
      <span class="lab">Share</span>
      <button type="button" id="copylink">Copy link</button>
      <a href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener">LinkedIn</a>
      <a href="https://x.com/intent/post?url=${shareUrl}&amp;text=${encodeURIComponent(e.title)}" target="_blank" rel="noopener">X</a>
    </div>
  </article>
</div>

${endBlock()}

<section class="related" aria-labelledby="relh">
  <h2 id="relh">Keep reading</h2>
  <ul class="cards">
    ${related(e, all).map(o => card(o, false)).join('\n    ')}
  </ul>
</section>

${CH.foot(SECTION)}
${PAGE_JS}
</body>
</html>
`;
}

// The /blog/ index: the same bar, band and footer, then every post as a card, newest first.
const INDEX = {
  title: 'Blog',
  kicker: 'The Rabbit Hole · Blog',
  h1: 'Notes from a workshop of one.',
  dek: 'How I actually build: the harness around the AI, the zero-dependency habit, the tools that let one person ship like a team.',
  desc: 'Posts on building software, games, and a company of one with AI as a co-worker.',
};
function blogIndex(all) {
  const posts = [...all].sort((a, b) => b.published.localeCompare(a.published));
  const canon = `${ORIGIN}/blog/`;
  const ld = { '@context': 'https://schema.org', '@type': 'Blog', name: 'The Rabbit Hole blog', url: canon,
    author: { '@type': 'Person', name: 'Elvin Peters', url: 'https://elvinpeters.com/', sameAs: [LINKEDIN] },
    blogPost: posts.map(e => ({ '@type': 'BlogPosting', headline: e.title, url: postUrl(e), datePublished: e.published })) };
  return head({ title: INDEX.title, desc: INDEX.desc, canon, type: 'website', ogImage: `${imgDir(posts[0])}/og.png`, ogAlt: posts[0].og_alt,
    extra: `\n<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n` }) +
`${CH.bar(SECTION)}

<header class="band index">
  <div class="band-in">
    <div class="top">
      <p class="kicker"><i aria-hidden="true"></i>${esc(INDEX.kicker)}</p>
      ${MODE_BTN}
    </div>
    <h1>${esc(INDEX.h1)}</h1>
    <p class="dek">${esc(INDEX.dek)}</p>
  </div>
</header>

<main class="index-list">
  <ul class="cards">
    ${posts.map(e => card(e, true)).join('\n    ')}
  </ul>
</main>

${endBlock()}
<div class="endspace"></div>

${CH.foot(SECTION)}
${PAGE_JS}
</body>
</html>
`;
}

module.exports = { GA, FONTS, esc, eyebrow, showDate, wordCount, prepare, essayPage, blogIndex };
