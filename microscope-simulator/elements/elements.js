// Periodic table page. Data: ../data/elements.json (names, weights, descriptions), ../data/element-extras.json
// (electron configuration and shells from RSC, category and properties from PubChem), ../data/links.json (which
// molecules contain which elements, built by tools/build_links.py from the structure files). Words for the D1
// features are keyed placeholders in ../data/copy-links.json.
// URL: #C or #6 opens a card. ?mol=atp lights a molecule's elements, ?life=1 the elements of life,
// ?colour=block|category, ?view=3d, ?prop=radius. All of these combine, e.g. ?mol=hemoglobin#Fe
import { $, el, loadCopy, bindTheme } from '../common.js';

bindTheme($('#theme'));
const copy = await loadCopy('../');
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }
let DATA, X, L, CK = {};
try {
  [DATA, X, L, CK] = await Promise.all([getJSON('../data/elements.json'), getJSON('../data/element-extras.json'), getJSON('../data/links.json'), getJSON('../data/copy-links.json').catch(() => ({}))]);
} catch (e) {
  $('#table').replaceChildren(el('p', { text: 'The element data did not load. Please reload the page.' }));
  throw e;
}
// keyed words: T(name, {var: value}) fills {var}; the page keeps its built-in words if the file is missing a key
const T = (k, v = {}) => String(CK[k] ?? k).replace(/\{(\w+)\}/g, (m, n) => (v[n] ?? m));
for (const n of document.querySelectorAll('[data-ck]')) if (CK[n.dataset.ck]) n.textContent = CK[n.dataset.ck];

const ELS = DATA.elements, SRC = DATA.sources;
const byZ = new Map(ELS.map((e) => [e.z, e]));
const bySym = new Map(ELS.map((e) => [e.symbol, e]));
const MOLS = L.molecules, ELMOL = L.elements;
const CATS = X.categories;
const catIdx = (e) => Math.max(0, CATS.indexOf(X.elements[e.symbol]?.category));
const fmt = (n) => Number(n).toLocaleString('en');

/* ---------- state, read from the URL ---------- */
const qs = new URLSearchParams(location.search);
const h = decodeURIComponent(location.hash.slice(1)); // read before writeURL() runs
const state = {
  colour: qs.get('colour') === 'block' ? 'block' : 'category',
  life: qs.get('life') === '1',
  mol: MOLS[qs.get('mol')] ? qs.get('mol') : '',
  view: qs.get('view') === '3d' ? '3d' : 'table',
  prop: X.properties[qs.get('prop')] ? qs.get('prop') : 'radius',
  z: null,
};
function writeURL() {
  const p = new URLSearchParams();
  if (state.mol) p.set('mol', state.mol);
  if (state.life && !state.mol) p.set('life', '1');
  if (state.colour !== 'category') p.set('colour', state.colour);
  if (state.view === '3d') { p.set('view', '3d'); if (state.prop !== 'radius') p.set('prop', state.prop); }
  const q = p.toString();
  const sym = state.z ? '#' + byZ.get(state.z).symbol : '';
  history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + sym);
}

/* ---------- numbers strip (all computed from links.json) ---------- */
const totalAtoms = Object.values(MOLS).reduce((a, m) => a + m.atoms, 0);
const totalC = Object.values(MOLS).reduce((a, m) => a + (m.elements.C || 0), 0);
$('#stats').append(
  el('li', {}, el('b', { text: T('pt.statUsed', { used: L.totals.elementsUsed, total: L.totals.elementsInTable }) }), el('span', { text: T('pt.statUsedSub') })),
  el('li', {}, el('b', { text: T('pt.statMols', { mols: L.totals.molecules }) }), el('span', { text: T('pt.statMolsSub') })),
  el('li', {}, el('b', { text: T('pt.statAtoms', { atoms: fmt(totalAtoms) }) }), el('span', { text: T('pt.statAtomsSub', { carbon: fmt(totalC) }) })),
);

/* ---------- layout: 7 periods x 18 groups, plus the lanthanoid and actinoid rows ---------- */
const ROWS = [];
for (let p = 1; p <= 7; p++) ROWS.push(new Array(18).fill(null));
const fRow = { lanthanoids: new Array(18).fill(null), actinoids: new Array(18).fill(null) };
const fCount = { lanthanoids: 0, actinoids: 0 };
for (const e of ELS) {
  if (e.group) ROWS[e.period - 1][e.group - 1] = e;
  else if (fRow[e.series]) fRow[e.series][2 + fCount[e.series]++] = e;
}
ROWS[5][2] = { ph: 'lanthanoids' };
ROWS[6][2] = { ph: 'actinoids' };
const range = (s) => { const z = ELS.filter((e) => e.series === s).map((e) => e.z); return [Math.min(...z), Math.max(...z)]; };

const grid = [];
const buttons = new Map();
const baseLabel = (e) => `${e.name}, ${e.symbol}, element ${e.z}, ${X.elements[e.symbol]?.category || e.block + '-block'}`;
function cellFor(item, r, c) {
  if (!item) return el('td');
  if (item.ph) {
    // Series marker styled as a real tile in the series colour (Ln and An are the shared symbols for the two series); tapping it opens the first element of the row below.
    const [a, b] = range(item.ph);
    const first = ELS.find((e) => e.z === a);
    return el('td', { class: 'ph' }, el('button', { class: `el ph-tile b-${first.block}`, type: 'button', tabindex: '-1', 'data-z': a,
      'aria-label': `${item.ph}, elements ${a} to ${b}, shown in the row below`, title: `${item.ph}, elements ${a} to ${b}, shown in the row below`,
      style: `--cat: var(--c${catIdx(first)}); --d: ${((r + c) * 0.014).toFixed(3)}s` },
    el('span', { class: 'n', text: `${a} to ${b}`, 'aria-hidden': 'true' }),
    el('span', { class: 's', text: item.ph === 'lanthanoids' ? 'Ln' : 'An', 'aria-hidden': 'true' })));
  }
  const b = el('button', { class: `el b-${item.block}`, type: 'button', tabindex: '-1', 'aria-label': baseLabel(item), 'aria-pressed': 'false', 'data-z': item.z,
    style: `--cat: var(--c${catIdx(item)}); --d: ${((r + c) * 0.014).toFixed(3)}s` },
  el('span', { class: 'n', text: String(item.z), 'aria-hidden': 'true' }), el('span', { class: 's', text: item.symbol, 'aria-hidden': 'true' }),
  el('span', { class: 'nm', text: item.name, 'aria-hidden': 'true' }), el('span', { class: 'ct', 'aria-hidden': 'true' }));
  buttons.set(item.z, b);
  return el('td', {}, b);
}
const table = el('table', { class: 'pt', role: 'grid', 'aria-labelledby': 'ptCaption', 'aria-describedby': 'keyHelp' });
table.append(el('caption', { class: 'sr-only', id: 'ptCaption', text: 'Periodic table of the 118 elements. Rows are periods 1 to 7, columns are groups 1 to 18. The lanthanoids and actinoids are in the last two rows.' }));
const head = el('tr', {}, el('td'));
for (let g = 1; g <= 18; g++) head.append(el('th', { scope: 'col', text: String(g), 'aria-label': 'Group ' + g }));
table.append(el('thead', {}, head));
const body = el('tbody');
const addRow = (name, short, items) => {
  const r = grid.length;
  const tr = el('tr', {}, el('th', { scope: 'row', text: short, 'aria-label': name }));
  items.forEach((it, c) => tr.append(cellFor(it, r, c)));
  body.append(tr);
  grid.push(items.map((it) => (it && !it.ph ? it.z : null)));
};
ROWS.forEach((row, i) => addRow('Period ' + (i + 1), String(i + 1), row));
body.append(el('tr', { 'aria-hidden': 'true' }, el('td', { class: 'gap', colspan: '19' })));
addRow('Lanthanoids, period 6', '6', fRow.lanthanoids);
addRow('Actinoids, period 7', '7', fRow.actinoids);
table.append(body);
$('#table').replaceChildren(table);

/* ---------- roving tabindex: one element in the tab order, arrows move it ---------- */
const pos = new Map();
grid.forEach((row, r) => row.forEach((z, c) => { if (z) pos.set(z, [r, c]); }));
let current = 1;
function focusZ(z, opts = {}) {
  const b = buttons.get(z);
  if (!b) return;
  buttons.get(current)?.setAttribute('tabindex', '-1');
  b.setAttribute('tabindex', '0');
  current = z;
  if (opts.focus !== false) b.focus({ preventScroll: false });
}
buttons.get(1).setAttribute('tabindex', '0');
function move(z, dr, dc) {
  const [r, c] = pos.get(z);
  if (dc) { for (let cc = c + dc; cc >= 0 && cc < 18; cc += dc) if (grid[r][cc]) return grid[r][cc]; return z; }
  for (let rr = r + dr; rr >= 0 && rr < grid.length; rr += dr) {
    let best = null, bestD = 99;
    grid[rr].forEach((zz, cc) => { if (zz && Math.abs(cc - c) < bestD) { best = zz; bestD = Math.abs(cc - c); } });
    if (best) return best;
  }
  return z;
}
function keyMove(z, ev) {
  const [r] = pos.get(z);
  const row = grid[r].filter(Boolean);
  switch (ev.key) {
    case 'ArrowRight': return move(z, 0, 1);
    case 'ArrowLeft': return move(z, 0, -1);
    case 'ArrowDown': return move(z, 1, 0);
    case 'ArrowUp': return move(z, -1, 0);
    case 'Home': return ev.ctrlKey ? 1 : row[0];
    case 'End': return ev.ctrlKey ? 118 : row[row.length - 1];
    case 'PageDown': return Math.min(118, z + 10);
    case 'PageUp': return Math.max(1, z - 10);
    default: return null;
  }
}
table.addEventListener('keydown', (ev) => {
  const b = ev.target.closest('button.el');
  if (!b) return;
  const next = keyMove(+b.dataset.z, ev);
  if (next == null) return;
  ev.preventDefault();
  focusZ(next);
});
table.addEventListener('click', (ev) => {
  const b = ev.target.closest('button.el');
  if (!b) return;
  const z = +b.dataset.z;
  focusZ(z, { focus: false });
  openCard(z, { scroll: ev.detail > 0 });
});

/* ---------- colour, Elements of life, molecule light-up ---------- */
function renderLegend() {
  const cat = state.colour === 'category';
  $('#legendTitle').textContent = cat ? T('pt.legendCategory') : (copy['table.legend'] || T('pt.legendBlock'));
  $('#legend').replaceChildren(...(cat
    ? CATS.map((c, i) => el('li', {}, el('i', { style: `background:var(--c${i})` }), c))
    : ['s', 'p', 'd', 'f'].map((b) => el('li', {}, el('i', { style: `background:var(--blk-${b})` }), `${b}-block`))));
}
function setColour(c) {
  state.colour = c;
  table.classList.toggle('by-cat', c === 'category');
  table.classList.toggle('by-block', c === 'block');
  for (const b of document.querySelectorAll('#colSeg button')) b.setAttribute('aria-checked', String(b.dataset.col === c));
  renderLegend();
  land?.recolour();
  writeURL();
}
// lit: Map symbol -> badge text (or null for no highlight)
function litMap() {
  if (state.mol) return new Map(Object.entries(MOLS[state.mol].elements).map(([s, n]) => [s, { badge: n > 999 ? Math.round(n / 1000) + 'k' : String(n), say: T('pt.inMol', { count: fmt(n), name: MOLS[state.mol].name }) }]));
  if (state.life) return new Map(Object.entries(ELMOL).map(([s, list]) => [s, { badge: String(list.length), say: T('pt.inMols', { n: list.length }) }]));
  return null;
}
function applyLight() {
  const lit = litMap();
  table.classList.toggle('dim', !!lit);
  for (const [z, b] of buttons) {
    const e = byZ.get(z), hit = lit?.get(e.symbol);
    b.classList.toggle('lit', !!hit);
    b.querySelector('.ct').textContent = hit ? hit.badge : '';
    b.setAttribute('aria-label', baseLabel(e) + (hit ? `, ${hit.say}` : ''));
  }
  $('#lifeBtn').setAttribute('aria-pressed', String(state.life && !state.mol));
  $('#molSel').value = state.mol;
  const msg = $('#modeMsg');
  if (state.mol) {
    const m = MOLS[state.mol];
    const list = Object.entries(m.elements).map(([s, n]) => `${bySym.get(s)?.name || s} ${fmt(n)}`).join(', ');
    msg.replaceChildren(T('pt.molOn', { name: m.name, n: Object.keys(m.elements).length, list }), ' ',
      el('a', { href: m.href, text: T('pt.molLink', { name: m.name }) }));
  } else if (state.life) {
    msg.textContent = T('pt.lifeOn', { n: Object.keys(ELMOL).length, mols: L.totals.molecules });
  } else msg.textContent = '';
  land?.light(lit);
  writeURL();
}
$('#lifeBtn').addEventListener('click', () => { const on = !(state.life && !state.mol); state.life = on; state.mol = ''; applyLight(); });
const sel = $('#molSel');
for (const [g, label] of [['small', T('pt.groupSmall')], ['big', T('pt.groupBig')]]) {
  const og = el('optgroup', { label });
  for (const [id, m] of Object.entries(MOLS)) if (m.group === g) og.append(el('option', { value: id, text: m.name }));
  sel.append(og);
}
sel.addEventListener('change', () => { state.mol = sel.value; if (state.mol) state.life = false; applyLight(); });
for (const b of document.querySelectorAll('#colSeg button')) b.addEventListener('click', () => setColour(b.dataset.col));
segKeys($('#colSeg'));

/* radio groups: arrow keys move the choice (one tab stop per group) */
function segKeys(group) {
  const sync = () => { for (const b of group.querySelectorAll('[role=radio]')) b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1; };
  group.addEventListener('keydown', (ev) => {
    const bs = [...group.querySelectorAll('[role=radio]')];
    const i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[ev.key];
    if (!d) return;
    ev.preventDefault();
    const n = bs[(i + d + bs.length) % bs.length];
    n.click(); n.focus();
  });
  new MutationObserver(sync).observe(group, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
  sync();
}

/* ---------- the element card ---------- */
const card = $('#card');
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, a = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
function bohr(e, shells) {
  const svg = sv('svg', { viewBox: '-80 -80 160 160', class: 'bohr', role: 'img', 'aria-label': T('card.shellsAlt', { name: e.name, list: shells.map((k, i) => `${k} in shell ${i + 1}`).join(', ') }) });
  const defs = sv('defs');
  const g = sv('radialGradient', { id: 'halo' });
  g.append(sv('stop', { offset: '0', 'stop-color': 'var(--accent)', 'stop-opacity': '0.28' }), sv('stop', { offset: '1', 'stop-color': 'var(--accent)', 'stop-opacity': '0' }));
  defs.append(g);
  svg.append(defs, sv('circle', { class: 'halo', r: '30' }));
  const n = shells.length, rMin = 24, rMax = 76;
  const still = reduceMotion();
  shells.forEach((count, i) => {
    const r = n === 1 ? 38 : rMin + (i * (rMax - rMin)) / (n - 1);
    svg.append(sv('circle', { class: 'ring', r: r.toFixed(1) }));
    const grp = sv('g');
    const er = count > 24 ? 2.2 : count > 12 ? 2.7 : 3.3;
    for (let k = 0; k < count; k++) {
      const a = (2 * Math.PI * k) / count + i * 0.6;
      grp.append(sv('circle', { class: 'e', r: String(er), cx: (r * Math.cos(a)).toFixed(2), cy: (r * Math.sin(a)).toFixed(2) }));
    }
    if (!still) {
      const dur = (5 + i * 2.6).toFixed(1) + 's';
      const dir = i % 2 ? '-360 0 0' : '360 0 0';
      grp.append(sv('animateTransform', { attributeName: 'transform', type: 'rotate', from: '0 0 0', to: dir, dur, repeatCount: 'indefinite' }));
    }
    svg.append(grp);
  });
  svg.append(sv('circle', { class: 'nuc', r: '15' }));
  const t = sv('text', { class: 'nt' }); t.textContent = e.symbol; svg.append(t);
  return svg;
}
// shells that do not add up to Z are never drawn: the nucleus with its proton count stands in, and the caption says why
const shellsOk = (e, x) => Array.isArray(x.shells) && x.shells.reduce((a, b) => a + b, 0) === e.z;
function protonsOnly(e) {
  const svg = sv('svg', { viewBox: '-80 -80 160 160', class: 'bohr', role: 'img', 'aria-label': T('card.protonsAlt', { name: e.name, z: e.z }) });
  svg.append(sv('circle', { class: 'nuc', r: '30' }));
  const t = sv('text', { class: 'nt' }); t.textContent = ` p+`; svg.append(t);
  return svg;
}
function configNode(cf) {
  const dd = el('dd');
  if (cf.core) dd.append(`[${cf.core}] `);
  cf.orbitals.forEach(([o, k], i) => { dd.append(o, el('sup', { text: String(k) })); if (i < cf.orbitals.length - 1) dd.append(' '); });
  return dd;
}
function srcLine(e) {
  const p = el('p', { class: 'src' });
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', text });
  p.append(T('card.sources') + ': ', link(e.page, copy['table.readMore'] || 'Read more on the RSC page'), '. ');
  const w = SRC['ciaaw-2024'];
  if (w) p.append('Atomic weight: ', link(w.url, 'IUPAC CIAAW 2024'), '. ');
  p.append(T('card.category') + ': ', link(X.sources.pubchem.url, T('card.categorySrc')), '.');
  return p;
}
function foundChips(e) {
  const list = ELMOL[e.symbol] || [];
  if (!list.length) return [el('p', { class: 'empty', text: T('card.foundNone', { name: e.name }) })];
  return [el('ul', { class: 'found' }, ...list.map(({ molecule, count }) => {
    const m = MOLS[molecule];
    return el('li', {}, el('a', { class: 'fchip', href: `${m.href}?el=${e.symbol}`, 'aria-label': T('card.foundChipLabel', { count: fmt(count), element: e.name.toLowerCase(), name: m.name }) },
      el('img', { src: `../molecules/thumbs/${molecule}.webp`, alt: '', loading: 'lazy', width: '32', height: '32' }),
      el('span', {}, el('b', { text: e.symbol }), el('span', { class: 'x', text: ` x ${fmt(count)} ` }), T('card.foundIn', { name: m.short }))));
  }))];
}

/* the 3D atom from ../atom/atom.js (another builder). links.json says whether it is there (tools/build_links.py),
   so the page never probes for a missing file. One viewer is mounted once into a host element that moves from card
   to card; it falls back to the Bohr diagram with no WebGL or if it fails. */
const hasWebGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
let atomUse = !!L.atomViewer && hasWebGL, atomHost = null, atomInst = null;
function atomNode(e, x) {
  if (!atomUse) return el('div', { class: 'atomslot' }, shellsOk(e, x) ? bohr(e, x.shells) : protonsOnly(e));
  if (!atomHost) atomHost = el('div', { class: 'atomhost' });
  (async () => {
    try {
      if (!atomInst) {
        const mod = await import('../atom/atom.js');
        atomInst = mod.mount(atomHost, e.z, { mode: 'orbital', ui: false, info: false });
        await atomInst.ready;
      } else atomInst.setElement(e.z);
    } catch (err) {
      console.warn('3D atom did not start, using the Bohr diagram', err);
      atomUse = false;
      if (state.z === e.z) atomHost.replaceWith(el('div', { class: 'atomslot' }, shellsOk(e, x) ? bohr(e, x.shells) : protonsOnly(e)));
    }
  })();
  return atomHost;
}

function openCard(z, opts = {}) {
  const e = byZ.get(z);
  if (!e) return;
  state.z = z;
  for (const [zz, b] of buttons) b.setAttribute('aria-pressed', String(zz === z));
  const x = X.elements[e.symbol] || {};
  const where = e.group ? String(e.group) : `none (${e.series})`;
  const dl = el('dl', {},
    el('dt', { text: 'Atomic weight' }), el('dd', { text: e.weight || 'none given (no standard value)' }),
    el('dt', { text: T('card.category') }), el('dd', { text: x.category || T('card.notGiven') }),
    el('dt', { text: 'Group' }), el('dd', { text: where }),
    el('dt', { text: 'Period' }), el('dd', { text: String(e.period) }),
    el('dt', { text: 'Block' }), el('dd', { text: e.block }));
  if (x.config) dl.append(el('dt', { text: T('card.config') }), configNode(x.config));
  const kids = [
    el('div', { class: 'head' },
      el('div', { class: 'tile', style: `background: var(--c${catIdx(e)})`, 'aria-hidden': 'true' }, el('span', { class: 'n', text: String(e.z) }), el('span', { class: 's', text: e.symbol })),
      el('div', {}, el('h2', { id: 'cardTitle', text: e.name }), el('p', { class: 'sub', text: `Symbol ${e.symbol}, element ${e.z}` }))),
  ];
  const pic = atomNode(e, x);
  if (pic) {
    const cap = el('p', { class: 'cap' });
    if (!shellsOk(e, x)) cap.append(T('card.noShells', { z: e.z }));
    else cap.append(el('b', { text: x.shells.join(' · ') }), T('card.shells') + '. ' + T('card.shellsNote'));
    if (L.atomViewer) cap.append(' ', el('a', { href: `../atom/#${e.symbol}`, text: T('card.atom3d') }));
    kids.push(el('div', { class: 'viz' + (atomUse ? ' wide' : '') }, pic, cap));
  }
  kids.push(dl, el('p', { class: 'desc', text: e.description }), el('h3', { text: T('card.found') }), ...foundChips(e), srcLine(e));
  card.classList.remove('fresh');
  card.replaceChildren(...kids);
  void card.offsetWidth;
  card.classList.add('fresh');
  land?.select(z);
  writeURL();
  if (opts.scroll && !matchMedia('(min-width: 1280px)').matches) card.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

/* ---------- find ---------- */
function findOne(q) {
  q = q.trim().toLowerCase();
  if (!q) return null;
  if (/^\d+$/.test(q)) return byZ.get(+q) || null;
  return ELS.find((e) => e.symbol.toLowerCase() === q) || ELS.find((e) => e.name.toLowerCase() === q) || ELS.find((e) => e.name.toLowerCase().startsWith(q)) || null;
}
$('#findForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const e = findOne($('#find').value);
  $('#findMsg').textContent = e ? `Showing ${e.name}.` : 'No element matches that. Try a name like carbon, a symbol like Fe, or a number from 1 to 118.';
  if (e) { focusZ(e.z, { focus: false }); openCard(e.z, { scroll: true }); buttons.get(e.z).scrollIntoView({ block: 'nearest', inline: 'center' }); }
});

/* ---------- 3D landscape (loaded on first use) ---------- */
let land = null, landLoading = null;
const propSeg = $('#propSeg');
for (const [k, p] of Object.entries(X.properties)) {
  propSeg.append(el('button', { type: 'button', role: 'radio', 'aria-checked': String(k === state.prop), 'data-prop': k, text: p.label.replace(/ \(.*\)$/, '') }));
}
segKeys(propSeg);
propSeg.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-prop]');
  if (!b) return;
  state.prop = b.dataset.prop;
  for (const x of propSeg.querySelectorAll('[data-prop]')) x.setAttribute('aria-checked', String(x === b));
  land?.setProp(state.prop);
  writeURL();
});
async function setView(v) {
  state.view = v;
  for (const b of document.querySelectorAll('#viewSeg button')) b.setAttribute('aria-checked', String(b.dataset.view === v));
  const is3d = v === '3d';
  $('#land').hidden = !is3d;
  $('#table').hidden = is3d;
  $('#keyHelp').hidden = is3d;
  writeURL();
  if (!is3d) return;
  const msg = $('#landMsg');
  if (!hasWebGL) { msg.textContent = T('land.noWebgl'); msg.hidden = false; return; }
  if (land) { land.resize(); return; }
  msg.textContent = T('land.loading'); msg.hidden = false;
  try {
    landLoading ??= import('./landscape.js');
    const mod = await landLoading;
    land = mod.createLandscape({
      stage: $('#landStage'), tip: $('#landTip'), legend: $('#landLegend'), X, ELS, grid, pos, T, fmt,
      onPick: (z, o = {}) => { focusZ(z, { focus: false }); openCard(z, { scroll: o.scroll !== false }); },
      keyMove,
    });
    land.setProp(state.prop, { instant: true });
    land.recolour();
    land.light(litMap());
    if (state.z) land.select(state.z);
    msg.hidden = true;
  } catch (err) {
    console.error(err);
    msg.textContent = T('land.failed'); msg.hidden = false;
  }
}
for (const b of document.querySelectorAll('#viewSeg button')) b.addEventListener('click', () => setView(b.dataset.view));
segKeys($('#viewSeg'));

/* ---------- footer credits + deep link ---------- */
const credits = { ...SRC, pubchem: X.sources.pubchem };
$('#foot').append(...Object.values(credits).map((s) => el('p', {}, s.cite + ' ', el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.url.replace(/^https:\/\//, '') }), ` Read ${s.read}. ${s.used_for}`)),
  el('p', { text: T('pt.footNote') }));
setColour(state.colour);
applyLight();

const start = h ? (/^\d+$/.test(h) ? byZ.get(+h) : ELS.find((e) => e.symbol.toLowerCase() === h.toLowerCase())) : null;
if (start) { focusZ(start.z, { focus: false }); openCard(start.z); }
// on narrow screens the table scrolls sideways: bring the opened (or first lit) element into view, without moving the page
{
  const sc = $('#table'), lit = table.querySelector('.el.lit');
  const target = (state.mol || state.life) && lit && !start ? lit : buttons.get(state.z || 0) || lit;
  if (target && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, target.closest('td').offsetLeft - sc.clientWidth / 2 + 24);
}
if (state.view === '3d') setView('3d');
window.addEventListener('hashchange', () => {
  const s = decodeURIComponent(location.hash.slice(1));
  const e = /^\d+$/.test(s) ? byZ.get(+s) : ELS.find((x) => x.symbol.toLowerCase() === s.toLowerCase());
  if (e && e.z !== state.z) { focusZ(e.z, { focus: false }); openCard(e.z); }
});
window.__pt = { openCard, focusZ, count: buttons.size, state, get land() { return land; }, applyLight, setView };
