// Codon wheel puzzle for the DNA to protein explainer. The student picks the three letters of each codon
// (which lights the path on the wheel), then chooses the amino acid at the end of that path.
// The standard genetic code (OpenStax Biology 2e 15.1, Figure 15.4), in U C A G order for each letter.
const BASES = 'UCAG';
const CODE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
export const translate = (codon) => CODE[BASES.indexOf(codon[0]) * 16 + BASES.indexOf(codon[1]) * 4 + BASES.indexOf(codon[2])];

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const h = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); }
  for (const c of kids) if (c != null) n.append(c);
  return n;
};
const R1 = 38, R2 = 72, R3 = 104, R4 = 152;
const rad = (deg) => (deg - 90) * Math.PI / 180; // 0 degrees = top, clockwise
function sector(r0, r1, a0, a1) {
  const p = (r, a) => `${(r * Math.cos(rad(a))).toFixed(2)} ${(r * Math.sin(rad(a))).toFixed(2)}`;
  const large = a1 - a0 > 180 ? 1 : 0;
  if (r0 <= 0) return `M0 0 L${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} Z`;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}
function placeText(r, deg) { const a = rad(deg); return { x: (r * Math.cos(a)).toFixed(2), y: (r * Math.sin(a)).toFixed(2) }; }

export function mountCodon(root, { fmt, AA, puzzles }) {
  const name3 = (aa) => AA[aa][0];
  const full = (aa) => (aa === '*' ? AA['*'][1] : `${AA[aa][0]} (${AA[aa][1]})`);
  let pz = 0, codons = [], ci = 0, picked = [], phase = 'letters', chain = [];

  // wheel
  const svg = sv('svg', { viewBox: '-156 -156 312 312', class: 'wheel', role: 'img', 'aria-label': fmt('codon.wheelAlt') });
  const g1 = sv('g'), g2 = sv('g'), g3 = sv('g'), g4 = sv('g');
  svg.append(sv('circle', { r: R4, class: 'aaband' }), g4, g3, g2, g1);
  const seg1 = [], seg2 = [], seg3 = [], aaText = [];
  for (let i = 0; i < 4; i++) {
    const a0 = i * 90, b = BASES[i];
    const p = sv('path', { d: sector(0, R1, a0, a0 + 90), class: `seg b${b}` }); g1.append(p); seg1.push(p);
    const t = placeText(R1 * 0.58, a0 + 45); g1.append(sv('text', { x: t.x, y: t.y, class: 'blet', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 15 }, b));
    for (let j = 0; j < 4; j++) {
      const c0 = a0 + j * 22.5, b2 = BASES[j];
      const p2 = sv('path', { d: sector(R1, R2, c0, c0 + 22.5), class: `seg b${b2}` }); g2.append(p2); seg2.push(p2);
      const t2 = placeText((R1 + R2) / 2, c0 + 11.25); g2.append(sv('text', { x: t2.x, y: t2.y, class: 'blet', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 10 }, b2));
      for (let k = 0; k < 4; k++) {
        const d0 = c0 + k * 5.625, b3 = BASES[k];
        const p3 = sv('path', { d: sector(R2, R3, d0, d0 + 5.625), class: `seg b${b3}` }); g3.append(p3); seg3.push(p3);
        const t3 = placeText((R2 + R3) / 2, d0 + 2.8125); g3.append(sv('text', { x: t3.x, y: t3.y, class: 'blet', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 6.5 }, b3));
      }
    }
  }
  // amino acid labels: runs of codons that code for the same thing share one label
  let run = 0;
  for (let i = 1; i <= 64; i++) {
    const sameRun = i < 64 && CODE[i] === CODE[run] && Math.floor(i / 4) === Math.floor(run / 4);
    if (sameRun) continue;
    const deg = ((run + i) / 2) * 5.625, flip = deg > 180, rm = (R3 + R4) / 2;
    const t = sv('text', { class: 'aa', 'text-anchor': 'middle', 'dominant-baseline': 'central', transform: `rotate(${(flip ? deg + 90 : deg - 90).toFixed(2)}) translate(${flip ? -rm : rm} 0)` }, name3(CODE[run]));
    t.dataset.from = run; t.dataset.to = i - 1;
    g4.append(t); aaText.push(t);
    const a = rad(run * 5.625);
    g4.append(sv('line', { x1: (R3 * Math.cos(a)).toFixed(2), y1: (R3 * Math.sin(a)).toFixed(2), x2: (R4 * Math.cos(a)).toFixed(2), y2: (R4 * Math.sin(a)).toFixed(2), stroke: 'currentColor', 'stroke-opacity': 0.25, 'stroke-width': 0.8 }));
    run = i;
  }

  // controls
  const mrnaRow = h('div', { class: 'mrna-row', 'aria-label': fmt('codon.mrna') });
  const fbk = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
  const prompt = h('p', { class: 'small', style: 'margin:0 0 6px' });
  const sets = [];
  const pickers = h('div', { class: 'pickers' });
  ['codon.first', 'codon.second', 'codon.third'].forEach((key, i) => {
    const bset = h('div', { class: 'bset' });
    for (const b of BASES) bset.append(h('button', { type: 'button', 'data-b': b, 'aria-pressed': 'false', onclick: () => pickLetter(i, b) }, b));
    const fsx = h('fieldset', {}, h('legend', { text: fmt(key) }), bset);
    sets.push(bset); pickers.append(fsx);
  });
  const answers = h('div', { class: 'answers', role: 'group' });
  const chainP = h('p', { class: 'chain' });
  const newBtn = h('button', { type: 'button', class: 'choice', onclick: () => start((pz + 1) % puzzles.length) }, fmt('codon.new'));
  // text table
  const table = h('table', { class: 'codetable' }, h('caption', { text: fmt('codon.tableCaption') }));
  const thead = h('tr', {}, h('th', { scope: 'col', text: '1 \\ 2' }));
  for (const b of BASES) thead.append(h('th', { scope: 'col', text: b }));
  table.append(h('thead', {}, thead));
  const tb = h('tbody');
  for (const a of BASES) {
    const tr = h('tr', {}, h('th', { scope: 'row', text: a }));
    for (const b of BASES) {
      const td = h('td');
      for (const c of BASES) { const cod = a + b + c, aa = translate(cod); td.append(h('div', { text: `${cod} ${aa === '*' ? fmt('codon.stopName') : name3(aa)}` })); }
      tr.append(td);
    }
    tb.append(tr);
  }
  table.append(tb);

  root.replaceChildren(
    h('h2', { text: fmt('codon.title') }),
    h('p', { class: 'intro', text: fmt('codon.intro') }),
    mrnaRow,
    h('div', { class: 'wheelwrap' }, svg, h('div', {}, prompt, pickers, fbk, answers, chainP, newBtn)),
    h('details', {}, h('summary', { text: fmt('codon.table') }), h('div', { class: 'tablewrap' }, table)),
    h('p', { class: 'small', style: 'margin:8px 0 0', text: fmt('codon.source') })
  );

  function paintWheel() {
    const [a, b, c] = picked.map((x) => BASES.indexOf(x));
    seg1.forEach((p, i) => { p.classList.toggle('dimmed', a != null && i !== a); p.classList.toggle('hl', i === a); });
    seg2.forEach((p, i) => {
      const on = b != null && i === a * 4 + b, inPath = a != null && Math.floor(i / 4) === a;
      p.classList.toggle('dimmed', (a != null && !inPath) || (b != null && !on)); p.classList.toggle('hl', on);
    });
    seg3.forEach((p, i) => {
      const on = c != null && i === a * 16 + b * 4 + c;
      const inPath = a != null && (b == null ? Math.floor(i / 16) === a : Math.floor(i / 4) === a * 4 + b);
      p.classList.toggle('dimmed', (a != null && !inPath) || (c != null && !on)); p.classList.toggle('hl', on);
    });
    const idx = c != null ? a * 16 + b * 4 + c : null;
    aaText.forEach((t) => t.classList.toggle('hl-aa', idx != null && idx >= +t.dataset.from && idx <= +t.dataset.to));
  }
  function paint() {
    mrnaRow.replaceChildren(...codons.map((cd, i) => h('span', { class: 'cd' + (i === ci && phase !== 'done' ? ' now' : '') + (i < ci || phase === 'done' ? ' done' : '') }, cd)));
    sets.forEach((bset, i) => {
      for (const btn of bset.children) {
        btn.disabled = phase !== 'letters' || i !== picked.length;
        btn.setAttribute('aria-pressed', String(picked[i] === btn.dataset.b));
      }
    });
    const cod = codons[ci];
    prompt.textContent = phase === 'done' ? '' : phase === 'letters' ? fmt('codon.pick', { n: ci + 1, total: codons.length, codon: cod }) : fmt('codon.choose', { codon: cod });
    chainP.textContent = chain.length ? `${fmt('codon.protein')}: ${chain.join(' - ')}` : '';
    paintWheel();
  }
  function pickLetter(i, b) {
    if (phase !== 'letters' || i !== picked.length) return;
    const cod = codons[ci];
    if (cod[i] !== b) { fbk.className = 'feedback'; fbk.textContent = fmt('codon.wrongLetter', { i: i + 1, codon: cod, b }); return; }
    picked.push(b); fbk.textContent = '';
    if (picked.length === 3) { phase = 'answer'; buildAnswers(); }
    paint();
    const nextBtn = phase === 'letters' ? sets[picked.length]?.querySelector('button:not(:disabled)') : answers.querySelector('button');
    nextBtn?.focus();
  }
  function buildAnswers() {
    const right = translate(codons[ci]);
    const pool = Object.keys(AA).filter((k) => k !== right);
    const opts = [right];
    let seed = (pz + 1) * 31 + ci * 7;
    while (opts.length < 4) { seed = (seed * 16807) % 2147483647; const k = pool[seed % pool.length]; if (!opts.includes(k)) opts.push(k); }
    opts.sort((x, y) => ((x.charCodeAt(0) * 7 + ci) % 11) - ((y.charCodeAt(0) * 7 + ci) % 11));
    answers.replaceChildren(...opts.map((k) => h('button', { type: 'button', class: 'choice', onclick: (e) => answer(k, e.currentTarget) }, full(k))));
  }
  function answer(k, btn) {
    const cod = codons[ci], right = translate(cod);
    if (k !== right) { fbk.className = 'feedback'; fbk.textContent = fmt('codon.wrong', { codon: cod }); btn.disabled = true; return; }
    fbk.className = 'feedback ok';
    answers.replaceChildren();
    if (right === '*') {
      phase = 'done';
      fbk.textContent = fmt('codon.rightStop', { codon: cod }) + ' ' + fmt('codon.done', { chain: chain.join(' - ') });
      paint(); newBtn.focus(); return;
    }
    fbk.textContent = fmt('codon.right', { codon: cod, aa: full(right) });
    chain.push(name3(right)); ci++; picked = []; phase = 'letters';
    paint();
    sets[0].querySelector('button:not(:disabled)')?.focus();
  }
  function start(i) {
    pz = i; codons = puzzles[i].split(/\s+/); ci = 0; picked = []; phase = 'letters'; chain = [];
    fbk.textContent = ''; fbk.className = 'feedback'; answers.replaceChildren(); paint();
  }
  start(0);
}
