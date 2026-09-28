#!/usr/bin/env node
/* smoke.js — runs every calculator against defaults, zeros, and extremes.
   Catches throws, NaN, and Infinity before they reach a visitor.
     node smoke.js                                                        */

const { calculators } = require('./data.js');

const CASES = {
  defaults: inp => inp.def,
  zeros:    inp => (inp.type === 'select' ? inp.def : inp.type === 'toggle' ? false : inp.type === 'debtlist' ? [] : 0),
  mins:     inp => (inp.type === 'select' ? inp.def : inp.type === 'toggle' ? false : inp.type === 'debtlist' ? inp.def : (inp.min != null ? inp.min : 0)),
  maxes:    inp => (inp.type === 'select' ? inp.def : inp.type === 'toggle' ? true : inp.type === 'debtlist' ? inp.def : (inp.max != null ? inp.max : 1e7))
};

function scan(node, path, bad) {
  if (typeof node === 'number') {
    if (!Number.isFinite(node)) bad.push(`${path} = ${node}`);
  } else if (Array.isArray(node)) {
    node.forEach((x, i) => scan(x, `${path}[${i}]`, bad));
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) scan(node[k], `${path}.${k}`, bad);
  }
}

let failures = 0, runs = 0;

for (const calc of calculators) {
  // Every select option gets exercised too — that is where branchy code hides.
  const variants = Object.entries(CASES).map(([name, pick]) => {
    const v = {};
    calc.inputs.forEach(inp => { v[inp.id] = JSON.parse(JSON.stringify(pick(inp))); });
    return [name, v];
  });

  for (const inp of calc.inputs.filter(i => i.type === 'select')) {
    for (const opt of inp.options) {
      const v = {};
      calc.inputs.forEach(x => { v[x.id] = JSON.parse(JSON.stringify(x.def)); });
      v[inp.id] = opt.v;
      variants.push([`${inp.id}=${opt.v}`, v]);
    }
  }

  for (const [name, v] of variants) {
    runs++;
    let out;
    try { out = calc.compute(v); }
    catch (e) { console.error(`✕ ${calc.slug} [${name}] threw: ${e.message}`); failures++; continue; }

    const bad = [];
    scan(out, 'out', bad);
    if (bad.length) { console.error(`✕ ${calc.slug} [${name}] non-finite: ${bad.slice(0, 4).join(', ')}`); failures++; continue; }

    if (!out.hero) { console.error(`✕ ${calc.slug} [${name}] produced no hero value`); failures++; continue; }
    if (out.chart && out.chart.series) {
      for (const s of out.chart.series) {
        if (s.values.length !== out.chart.x.length) {
          console.error(`✕ ${calc.slug} [${name}] chart series "${s.name}" has ${s.values.length} points for ${out.chart.x.length} x-values`);
          failures++;
        }
      }
    }
  }
}

console.log(`${failures ? '✕' : '✓'} ${runs - failures}/${runs} passed across ${calculators.length} calculators`);
process.exit(failures ? 1 : 0);
