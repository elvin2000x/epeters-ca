// Vitamins and minerals (Builder I). Everything shown comes from nutrients.json (words, facts, amounts) and
// sources.json (who said it). The address hash picks a nutrient (#iron); no hash shows the full list.
// 3D models load only when a nutrient is opened, and every fact is readable without them.
import { bindTheme } from '../common.js';
import { mountViewer } from './viewer.js';

const $ = (s, r = document) => r.querySelector(s);
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};

let D, UI, SRC = [], SRCNUM = {}, STRUCTS = null, viewer = null;
const state = { kind: 'all', job: '', food: '', site: '' };
const label = {};

bindTheme($('#theme'));
start();

async function start() {
  try {
    const [d, s] = await Promise.all([
      fetch('nutrients.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch('sources.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    ]);
    D = d; UI = d.ui; SRC = s.sources;
  } catch (e) {
    console.error(e);
    $('#loadFail').hidden = false;
    return;
  }
  SRC.forEach((x, i) => { SRCNUM[x.id] = i + 1; });
  for (const k of ['jobs', 'sites', 'foods']) { label[k] = {}; for (const x of D[k]) label[k][x.id] = x.label; }
  for (const n of document.querySelectorAll('[data-ui]')) { const t = UI[n.dataset.ui]; if (t) n.textContent = t; }
  $('#theme').textContent = UI['theme'] || $('#theme').textContent;
  buildFilters();
  buildMap();
  buildTable();
  buildLearn();
  buildSources();
  renderList();
  route(false);
  window.addEventListener('hashchange', () => route(true));
}

// ---------- sentences with source numbers ----------
function cites(ids) {
  return (ids || []).map((id) => h('a', { class: 'cite', href: '#src-' + id, 'aria-label': fill(UI['cite'] || 'Source {n}', { n: SRCNUM[id] }), onclick: jumpToSource }, String(SRCNUM[id] || '?')));
}
function jumpToSource(e) {
  e.preventDefault();
  const id = e.currentTarget.getAttribute('href').slice(1);
  const li = document.getElementById(id);
  if (!li) return;
  li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  li.focus({ preventScroll: true });
}
const sentence = (o) => [o.t, ' ', ...cites(o.s)];
const para = (arr) => (arr || []).map((o) => h('p', {}, ...sentence(o)));

// ---------- filters and list ----------
function buildFilters() {
  const opts = (sel, list) => {
    sel.append(h('option', { value: '' }, UI['filter.any']));
    for (const x of list) sel.append(h('option', { value: x.id }, x.label));
  };
  opts($('#fJob'), D.jobs); opts($('#fFood'), D.foods); opts($('#fSite'), D.sites);
  for (const b of document.querySelectorAll('.chip[data-kind]')) {
    b.addEventListener('click', () => { state.kind = b.dataset.kind; renderList(); });
  }
  $('#fJob').addEventListener('change', (e) => { state.job = e.target.value; renderList(); });
  $('#fFood').addEventListener('change', (e) => { state.food = e.target.value; renderList(); });
  $('#fSite').addEventListener('change', (e) => { state.site = e.target.value; renderList(); });
  $('#fClear').addEventListener('click', () => { Object.assign(state, { kind: 'all', job: '', food: '', site: '' }); renderList(); });
}

const matches = (n) => (state.kind === 'all' || n.kind === state.kind)
  && (!state.job || n.jobs.includes(state.job))
  && (!state.food || n.foods.includes(state.food))
  && (!state.site || n.sites.includes(state.site));

function kindTag(n) {
  return n.kind === 'vitamin'
    ? UI[n.soluble === 'fat' ? 'soluble.fat' : 'soluble.water']
    : fill(UI['mineral.tag'], { sym: n.symbol });
}

function renderList() {
  for (const b of document.querySelectorAll('.chip[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === state.kind));
  $('#fJob').value = state.job; $('#fFood').value = state.food; $('#fSite').value = state.site;
  const shown = D.nutrients.filter(matches);
  const ul = $('#cards');
  ul.textContent = '';
  for (const n of shown) {
    ul.append(h('li', {}, h('a', { class: 'ncard ' + n.kind, href: '#' + n.id },
      h('span', { class: 'nm' }, n.name),
      h('span', { class: 'alt' }, n.kind === 'vitamin' ? n.alt : n.symbol),
      h('span', { class: 'sh' }, n.short),
      h('ul', { class: 'tags' },
        h('li', { class: 'tag kind-' + n.kind }, kindTag(n)),
        n.jobs.map((j) => h('li', { class: 'tag' }, label.jobs[j]))))));
  }
  $('#count').textContent = fill(UI.count, { n: shown.length });
  $('#none').hidden = shown.length > 0;
  paintMap(shown, null);
}

// ---------- body map ----------
const SPOTS = {
  brain: [100, 26], eyes: [86, 42], thyroid: [100, 78], blood: [114, 112], gut: [100, 160],
  muscles: [52, 140], bones: [82, 268], skin: [150, 196], cells: [122, 236],
};
function buildMap() {
  const svg = $('#bodySvg');
  const NS = 'http://www.w3.org/2000/svg';
  const shape = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  svg.append(
    shape('circle', { class: 'shape', cx: 100, cy: 36, r: 26 }),
    shape('rect', { class: 'shape', x: 90, y: 60, width: 20, height: 18, rx: 4 }),
    shape('path', { class: 'shape', d: 'M62 82 Q100 72 138 82 L142 200 Q100 210 58 200 Z' }),
    shape('path', { class: 'shape', d: 'M62 84 L40 180 L50 184 L72 104 Z' }),
    shape('path', { class: 'shape', d: 'M138 84 L160 180 L150 184 L128 104 Z' }),
    shape('path', { class: 'shape', d: 'M66 200 L74 320 L94 320 L98 208 Z' }),
    shape('path', { class: 'shape', d: 'M134 200 L126 320 L106 320 L102 208 Z' }),
  );
  for (const s of D.sites) {
    const [x, y] = SPOTS[s.id] || [100, 300];
    const c = shape('circle', { class: 'spot', cx: x, cy: y, r: 8, 'data-site': s.id });
    c.addEventListener('click', () => pickSite(s.id));
    svg.append(c);
  }
  const ul = $('#siteList');
  for (const s of D.sites) {
    ul.append(h('li', {}, h('button', { type: 'button', class: 'sitebtn', 'data-site': s.id, 'aria-pressed': 'false', onclick: () => pickSite(s.id) },
      h('span', {}, s.label), h('span', { class: 'n' }, ''))));
  }
}
function pickSite(id) {
  state.site = state.site === id ? '' : id;
  if (location.hash.length > 1) { history.pushState(null, '', location.pathname + location.search); route(false); }
  renderList();
  const n = D.nutrients.filter(matches).length;
  $('#mapPicked').textContent = state.site ? fill(UI['map.picked'], { site: label.sites[state.site], n }) : '';
}
function paintMap(list, one) {
  const used = {};
  for (const n of list) for (const s of n.sites) used[s] = (used[s] || 0) + 1;
  for (const c of document.querySelectorAll('#bodySvg .spot')) {
    c.classList.toggle('on', !!used[c.dataset.site]);
    c.classList.toggle('picked', !one && state.site === c.dataset.site);
  }
  for (const b of document.querySelectorAll('.sitebtn')) {
    const k = b.dataset.site;
    b.classList.toggle('on', !!used[k]);
    b.setAttribute('aria-pressed', String(!one && state.site === k));
    $('.n', b).textContent = one ? (used[k] ? '✓' : '') : String(used[k] || 0);
  }
  $('#mapHead').textContent = one ? fill(UI['map.showing'], { name: one.name }) : UI['map.showingAll'];
}

// ---------- amounts ----------
const amtText = (a, v) => (v == null ? UI['amt.notSet'] : `${v} ${a.unit}`);
function buildTable() {
  const t = $('#amountTable');
  t.append(h('caption', {}, UI['table.caption'], ' ', ...cites(['nasem-2019-dri'])));
  t.append(h('thead', {}, h('tr', {},
    h('th', { scope: 'col' }, UI['amt.nutrient']), h('th', { scope: 'col' }, UI['amt.male']),
    h('th', { scope: 'col' }, UI['amt.female']), h('th', { scope: 'col' }, UI['amt.type']), h('th', { scope: 'col' }, UI['amt.ul']))));
  const tb = h('tbody');
  for (const n of D.nutrients) {
    const a = n.amount;
    tb.append(h('tr', {},
      h('th', { scope: 'row' }, h('a', { href: '#' + n.id }, n.name)),
      h('td', {}, amtText(a, a.m)), h('td', {}, amtText(a, a.f)), h('td', {}, a.type),
      h('td', {}, a.ul || UI['amt.notSet'])));
  }
  t.append(tb);
  const info = $('#amountsInfo');
  for (const o of D.amountsInfo) info.append(h('li', {}, ...sentence(o)));
}

// ---------- learn layer ----------
function buildLearn() {
  const L = D.learn;
  for (const o of L.keyIdeas) $('#ideas').append(h('li', {}, ...sentence(o)));
  for (const m of L.misconceptions) {
    $('#myths').append(h('li', {},
      h('p', { class: 'm' }, h('b', {}, UI['learn.myth']), ' ', m.myth),
      h('p', { class: 't' }, h('b', {}, UI['learn.truth']), ' ', m.truth, ' ', ...cites(m.s))));
  }
  for (const v of L.vocab) $('#words').append(h('dt', {}, v.term), h('dd', {}, v.definition, ' ', ...cites(v.s)));
}
function buildSources() {
  const ol = $('#sourceList');
  for (const s of SRC) {
    ol.append(h('li', { id: 'src-' + s.id, tabindex: '-1' },
      h('a', { href: s.url, rel: 'noopener noreferrer', target: '_blank' }, s.title),
      s.licence ? ` (${s.licence})` : ''));
  }
}

// ---------- one nutrient ----------
function linkFor(l, n) {
  const map = {
    element: ['../elements/#' + l.id, fill(UI['link.element'], { name: l.label || n.name })],
    molecule: ['../molecules/#' + l.id, fill(UI['link.molecule'], { name: l.label })],
    cell: ['../cells/#' + l.id, fill(UI['link.cell'], { name: l.label })],
    process: ['../processes/#' + l.id, fill(UI['link.process'], { name: l.label })],
    page: ['../' + l.id + '/', fill(UI['link.page'], { name: l.label })],
    nutrient: ['#' + l.id, l.label],
  };
  const [href, text] = map[l.type] || ['#', l.label];
  return h('li', {}, h('a', { href }, text));
}

function section(title, kids, cls = '') {
  return h('section', { class: 'card ' + cls }, h('h3', {}, title), kids);
}

async function showStructure(host, code) {
  if (viewer) { viewer.destroy(); viewer = null; }
  host.textContent = '';
  host.append(h('p', { class: 'small' }, UI['v.loading']));
  try {
    if (!STRUCTS) STRUCTS = (await fetch('data/structures.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })).structures;
    const s = STRUCTS[code];
    if (!s) throw new Error('missing ' + code);
    viewer = mountViewer(host, s, UI);
  } catch (e) {
    console.warn(e);
    host.textContent = '';
    host.append(h('p', { class: 'small' }, UI['v.failed']));
  }
}

function renderDetail(n) {
  const art = $('#detail');
  art.textContent = '';
  const i = D.nutrients.indexOf(n);
  const prev = D.nutrients[(i - 1 + D.nutrients.length) % D.nutrients.length];
  const next = D.nutrients[(i + 1) % D.nutrients.length];
  art.append(h('nav', { class: 'dnav', 'aria-label': n.name },
    h('a', { href: '#', onclick: (e) => { e.preventDefault(); history.pushState(null, '', location.pathname + location.search); route(true); } }, '← ', UI['d.back']),
    h('span', { class: 'sp' }),
    h('a', { href: '#' + prev.id, 'aria-label': UI['d.prev'] + ': ' + prev.name }, UI['d.prev']),
    h('a', { href: '#' + next.id, 'aria-label': UI['d.next'] + ': ' + next.name }, UI['d.next'])));

  art.append(h('header', { class: 'dhead' },
    h('h2', { id: 'dTitle', tabindex: '-1' }, n.name),
    h('p', { class: 'alt' }, n.kind === 'vitamin' ? n.alt : n.symbol),
    h('p', { class: 'sh' }, n.short),
    h('ul', { class: 'tags' },
      h('li', { class: 'tag kind-' + n.kind }, kindTag(n)),
      n.jobs.map((j) => h('li', { class: 'tag' }, label.jobs[j])))));

  const grid = h('div', { class: 'dgrid' });
  // molecule
  const mol = h('section', { class: 'card viewer' }, h('h3', {}, UI['d.molecule']));
  if (n.structures.length) {
    const host = h('div');
    if (n.structures.length > 1) {
      const pick = h('div', { class: 'vpick', role: 'group', 'aria-label': UI['v.pick'] });
      n.structures.forEach((st, k) => {
        const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(k === 0) }, st.label);
        b.addEventListener('click', () => {
          for (const x of pick.children) x.setAttribute('aria-pressed', String(x === b));
          showStructure(host, st.code);
        });
        pick.append(b);
      });
      mol.append(pick);
    } else {
      mol.append(h('p', { class: 'small' }, n.structures[0].label, ' ', ...cites(n.structures[0].s)));
    }
    mol.append(host);
    showStructure(host, n.structures[0].code);
  } else {
    mol.append(h('p', {}, UI['d.noMolecule']));
  }
  grid.append(mol);
  grid.append(section(UI['d.what'], para(n.what)));
  grid.append(section(UI['d.how'], para(n.how), 'dfull prose'));
  grid.append(section(UI['d.lack'], para(n.lack), 'prose'));
  grid.append(section(UI['d.tooMuch'], para(n.tooMuch), 'prose'));
  if (n.history && n.history.length) grid.append(section(UI['d.history'], para(n.history), 'dfull prose'));
  grid.append(section(UI['d.foods'], [...para(n.foodText), h('ul', { class: 'tags' }, n.foods.map((f) => h('li', { class: 'tag' }, label.foods[f])))], 'prose'));

  const a = n.amount;
  const amt = section(UI['d.amount'], [
    h('table', { class: 'amt' },
      h('caption', { class: 'sr-only' }, UI['d.amount']),
      h('tbody', {},
        h('tr', {}, h('th', { scope: 'row' }, UI['amt.male']), h('td', {}, amtText(a, a.m), ' ', UI['amt.perDay'])),
        h('tr', {}, h('th', { scope: 'row' }, UI['amt.female']), h('td', {}, amtText(a, a.f), ' ', UI['amt.perDay'])),
        h('tr', {}, h('th', { scope: 'row' }, UI['amt.type']), h('td', {}, a.type)),
        h('tr', {}, h('th', { scope: 'row' }, UI['amt.ul']), h('td', {}, a.ul || UI['amt.notSet'])))),
    a.note ? h('p', { class: 'small' }, a.note, ' ', ...cites(a.s)) : h('p', { class: 'small' }, ...cites(a.s)),
    h('p', { class: 'small' }, UI['notice.text']),
  ]);
  grid.append(amt);
  grid.append(section(UI['d.where'], h('ul', { class: 'tags' }, n.sites.map((s) => h('li', { class: 'tag' }, label.sites[s])))));
  if (n.links.length) grid.append(section(UI['d.links'], h('ul', { class: 'linklist' }, n.links.map((l) => linkFor(l, n)))));

  // sources used by this nutrient
  const used = new Set();
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (Array.isArray(v.s)) v.s.forEach((x) => used.add(x)); Object.values(v).forEach(walk); } };
  walk(n);
  const list = [...used].sort((x, y) => (SRCNUM[x] || 0) - (SRCNUM[y] || 0));
  grid.append(section(UI['d.sources'], h('ol', { class: 'srcmini' }, list.map((id) => {
    const s = SRC[SRCNUM[id] - 1];
    return h('li', { value: String(SRCNUM[id]) }, s ? h('a', { href: s.url, rel: 'noopener noreferrer', target: '_blank' }, s.title) : id);
  })), 'dfull'));
  art.append(grid);
  paintMap([n], n);
}

function route(fromUser) {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id.startsWith('src-')) return;
  const n = id ? D.nutrients.find((x) => x.id === id) : null;
  if (viewer) { viewer.destroy(); viewer = null; }
  if (n) {
    $('#detail').hidden = false;
    $('#hub').hidden = true; $('#hub2').hidden = true;
    renderDetail(n);
    document.title = n.name + ': ' + UI['page.docTitle'];
    window.scrollTo(0, 0);
    $('#dTitle').focus({ preventScroll: true });
    return;
  }
  $('#detail').hidden = true; $('#detail').textContent = '';
  $('#hub').hidden = false; $('#hub2').hidden = false;
  document.title = UI['page.docTitle'];
  renderList();
  if (id) $('#count').textContent = UI.notFound;
  if (fromUser) $('#browse').focus();
}
