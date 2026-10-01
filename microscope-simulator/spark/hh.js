// Hodgkin-Huxley (1952) squid giant axon model, integrated live. Pure module, no DOM, runs in the browser and in node.
// Constants (see sources.json): conductances, capacitance and reversal potentials from Hodgkin and Huxley 1952 as
// transcribed in the Physiome CellML model (hh-cellml); voltages here are absolute mV with depolarisation positive and
// rest at -65 mV, the convention of NEURON's hh.mod (hh-mod), whose rate functions are used exactly as written there.
// Temperature 6.3 C (hh-mod), so the temperature factor is 1. Units: mV, ms, mS/cm2, uF/cm2, uA/cm2.

export const HH = {
  rest: -65,            // hh-mod: shifted to a resting potential of -65 mV
  cm: 1,                // uF/cm2 (hh-cellml Cm = 1)
  gNa: 120, gK: 36, gL: 0.3,   // mS/cm2 (hh-cellml; hh-mod 0.12, 0.036, 0.0003 S/cm2)
  eNa: -65 + 115,       // hh-cellml: E_Na = E_R + 115 mV  -> +50 mV
  eK: -65 - 12,         // hh-cellml: E_K = E_R - 12 mV    -> -77 mV
  eL: -65 + 10.613,     // hh-cellml: E_L = E_R + 10.613 mV -> -54.387 mV
  celsius: 6.3,
};

// x / (exp(x / y) - 1) with the 0/0 limit handled, as hh-mod's vtrap
function vtrap(x, y) { return Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / (Math.exp(x / y) - 1); }

export function rates(v) {
  return {
    am: 0.1 * vtrap(-(v + 40), 10), bm: 4 * Math.exp(-(v + 65) / 18),
    ah: 0.07 * Math.exp(-(v + 65) / 20), bh: 1 / (Math.exp(-(v + 35) / 10) + 1),
    an: 0.01 * vtrap(-(v + 55), 10), bn: 0.125 * Math.exp(-(v + 65) / 80),
  };
}

export function steady(v) {
  const r = rates(v);
  return { m: r.am / (r.am + r.bm), h: r.ah / (r.ah + r.bh), n: r.an / (r.an + r.bn) };
}

// The model state. stim(t) returns the injected current (uA/cm2) at time t.
export function createCell() {
  const s0 = steady(HH.rest);
  const c = { t: 0, v: HH.rest, m: s0.m, h: s0.h, n: s0.n, iNa: 0, iK: 0, iL: 0, iStim: 0, pulses: [] };
  c.reset = () => { const s = steady(HH.rest); Object.assign(c, { t: 0, v: HH.rest, m: s.m, h: s.h, n: s.n, pulses: [] }); currents(c); };
  // A square current pulse of amp uA/cm2 lasting dur ms, starting now
  c.pulse = (amp, dur) => { c.pulses.push({ t0: c.t, t1: c.t + dur, amp }); };
  c.stimAt = (t) => { let i = 0; for (const p of c.pulses) if (t >= p.t0 && t < p.t1) i += p.amp; return i; };
  c.step = (dt) => { stepRK4(c, dt); c.pulses = c.pulses.filter((p) => p.t1 > c.t - 1); };
  c.advance = (ms, dt = 0.01) => { const n = Math.max(1, Math.round(ms / dt)); for (let i = 0; i < n; i++) c.step(ms / n); };
  currents(c);
  return c;
}

function deriv(v, m, h, n, iStim) {
  const r = rates(v);
  const iNa = HH.gNa * m * m * m * h * (v - HH.eNa);
  const iK = HH.gK * n * n * n * n * (v - HH.eK);
  const iL = HH.gL * (v - HH.eL);
  return [(iStim - iNa - iK - iL) / HH.cm, r.am * (1 - m) - r.bm * m, r.ah * (1 - h) - r.bh * h, r.an * (1 - n) - r.bn * n];
}

function stepRK4(c, dt) {
  const i0 = c.stimAt(c.t), i1 = c.stimAt(c.t + dt / 2), i2 = c.stimAt(c.t + dt);
  const y = [c.v, c.m, c.h, c.n];
  const k1 = deriv(y[0], y[1], y[2], y[3], i0);
  const y2 = y.map((x, i) => x + dt / 2 * k1[i]);
  const k2 = deriv(y2[0], y2[1], y2[2], y2[3], i1);
  const y3 = y.map((x, i) => x + dt / 2 * k2[i]);
  const k3 = deriv(y3[0], y3[1], y3[2], y3[3], i1);
  const y4 = y.map((x, i) => x + dt * k3[i]);
  const k4 = deriv(y4[0], y4[1], y4[2], y4[3], i2);
  const out = y.map((x, i) => x + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  c.v = out[0]; c.m = clamp01(out[1]); c.h = clamp01(out[2]); c.n = clamp01(out[3]); c.t += dt;
  currents(c);
}

function currents(c) {
  c.gNaNow = HH.gNa * c.m ** 3 * c.h;          // mS/cm2
  c.gKNow = HH.gK * c.n ** 4;
  c.iNa = c.gNaNow * (c.v - HH.eNa);            // negative = sodium flowing in
  c.iK = c.gKNow * (c.v - HH.eK);               // positive = potassium flowing out
  c.iL = HH.gL * (c.v - HH.eL);
  c.iStim = c.stimAt(c.t);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Resting potential from concentrations (Nernst for one ion, Goldman-Hodgkin-Katz for Na and K together).
// R and F are the CODATA values (nist-r, nist-f). tC in Celsius. Returns mV.
export const R_GAS = 8.314462618, FARADAY = 96485.33212;
export const rtf = (tC) => 1000 * R_GAS * (tC + 273.15) / FARADAY;
export const nernst = (out, inside, z, tC) => rtf(tC) / z * Math.log(out / inside);
export const goldman = (kOut, kIn, naOut, naIn, ratio, tC) => rtf(tC) * Math.log((kOut + ratio * naOut) / (kIn + ratio * naIn));
// The Na:K permeability ratio that puts the Goldman voltage at target mV
export function ratioFor(target, kOut, kIn, naOut, naIn, tC) {
  const e = Math.exp(target / rtf(tC));
  return (e * kIn - kOut) / (naOut - e * naIn);
}
