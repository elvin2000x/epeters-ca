#!/usr/bin/env node
/* ==========================================================================
   build.js — generates a static, indexable page per calculator.

   The app itself is client-side, but every calculator gets its own real URL
   with its own title, description, breadcrumb and FAQ schema baked into the
   HTML. That is the whole point: search engines index the page, the engine
   renders the tool.

     node build.js

   Re-run after editing data.js. Generated directories are safe to delete.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BASE = 'https://epeters.ca/apps/calculators';
const { calculators, categories } = require('./data.js');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HEAD_COMMON = `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 19V5h9M5 12h7' stroke='%23c9a250' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3Ccircle cx='18' cy='17' r='2.4' fill='%23c9a250'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/apps/_kit/apps-kit.css">
<link rel="stylesheet" href="/apps/calculators/style.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CLZ7N26J1Q"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-CLZ7N26J1Q');</script>`.trim();

const SCRIPTS = `
<script src="/apps/_kit/apps-kit.js"></script>
<script src="/apps/calculators/data.js"></script>
<script src="/apps/calculators/app.js"></script>`.trim();

function page({ title, desc, canonical, extraHead = '', slug = null, h1, lede, crumb }) {
  return `<!doctype html>
<html lang="en">
<head>
${HEAD_COMMON}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:creator" content="@elvin_peters">
${extraHead}
</head>
<body>
<div data-apps-nav data-links='[{"label":"Calculators","href":"/apps/calculators/"}]'></div>

<main class="container">
  <p class="crumb">${crumb}</p>
  <header class="calc-head">
    <span class="eyebrow">Free tool · no sign-up</span>
    <h1>${esc(h1)}</h1>
    <p class="lede">${esc(lede)}</p>
  </header>
  <div id="calc-root"></div>
</main>

<div data-apps-foot></div>
${slug ? `<script>window.CALC_SLUG=${JSON.stringify(slug)};</script>` : ''}
${SCRIPTS}
</body>
</html>
`;
}

function ld(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

/* ---------------- per-calculator pages ---------------- */

let written = 0;
for (const c of calculators) {
  const url = `${BASE}/${c.slug}/`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: c.name,
        url,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD' },
        author: { '@type': 'Person', name: 'Elvin M. Peters', url: 'https://elvinpeters.com/' }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Apps', item: 'https://epeters.ca/apps/' },
          { '@type': 'ListItem', position: 2, name: 'Calculators', item: `${BASE}/` },
          { '@type': 'ListItem', position: 3, name: c.short, item: url }
        ]
      }
    ]
  };
  if (c.faq && c.faq.length) {
    schema['@graph'].push({
      '@type': 'FAQPage',
      mainEntity: c.faq.map(q => ({
        '@type': 'Question', name: q.q,
        acceptedAnswer: { '@type': 'Answer', text: q.a }
      }))
    });
  }

  const html = page({
    title: `${c.name} | Elvin M. Peters`,
    desc: c.seoDesc || c.blurb,
    canonical: url,
    extraHead: ld(schema),
    slug: c.slug,
    h1: c.name,
    lede: c.blurb,
    crumb: `<a href="/apps/">Apps</a> › <a href="/apps/calculators/">Calculators</a> › ${esc(c.short)}`
  });

  const dir = path.join(ROOT, c.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  written++;
}

/* ---------------- the calculator index ---------------- */

const indexSchema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      name: 'Free Financial Calculators',
      url: `${BASE}/`,
      about: categories.map(c => c.id),
      author: { '@type': 'Person', name: 'Elvin M. Peters', url: 'https://elvinpeters.com/' }
    },
    {
      '@type': 'ItemList',
      itemListElement: calculators.map((c, i) => ({
        '@type': 'ListItem', position: i + 1, name: c.name, url: `${BASE}/${c.slug}/`
      }))
    }
  ]
};

fs.writeFileSync(path.join(ROOT, 'index.html'), page({
  title: `Free Canadian Financial Calculators (${calculators.length} tools) | Elvin M. Peters`,
  desc: `${calculators.length} free calculators for Canadian mortgages, debt payoff, investing and marketing ROI. Real Canadian math — semi-annual compounding, the stress test, and Toronto land transfer tax. No sign-up.`,
  canonical: `${BASE}/`,
  extraHead: ld(indexSchema),
  h1: 'Calculators that use the real math',
  lede: 'Most calculators online quietly use American formulas or hide their assumptions. These do neither — Canadian mortgages compound semi-annually here, the stress test is the actual OSFI rule, and every tool shows its working. Free, no sign-up, and each result is a shareable link.',
  crumb: `<a href="/apps/">Apps</a> › Calculators`
}));

/* ---------------- sitemap fragment ---------------- */

const today = process.argv[2] || new Date().toISOString().slice(0, 10);
const urls = [`${BASE}/`, ...calculators.map(c => `${BASE}/${c.slug}/`)];
fs.writeFileSync(path.join(ROOT, 'sitemap-fragment.xml'),
  urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`).join('\n') + '\n');

console.log(`✓ ${written} calculator pages + index + sitemap fragment`);
console.log(`  categories: ${categories.map(c => c.id).join(', ')}`);
