/* Pure checks for the bench toys. No prices. No DOM. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BenchMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function net(arrows) {
    var fx = 0;
    var fy = 0;
    (arrows || []).forEach(function (a) {
      if (a.d === 'R') fx += a.n;
      else if (a.d === 'L') fx -= a.n;
      else if (a.d === 'U') fy += a.n;
      else if (a.d === 'D') fy -= a.n;
    });
    return { fx: fx, fy: fy };
  }

  function sameNet(a, b) {
    return a.fx === b.fx && a.fy === b.fy;
  }

  /* Simply supported beam. Loads point down. x is metres from the left pin.
     Shear is the upward push on the left face. Moment is the area under that shear.
     Returns null when the reactions are not whole numbers. */
  function beam(L, loads) {
    var momentArm = 0;
    var down = 0;
    (loads || []).forEach(function (q) {
      momentArm += q.p * q.x;
      down += q.p;
    });
    if (!L || momentArm % L !== 0) return null;
    var Rb = momentArm / L;
    var Ra = down - Rb;
    var marks = [0, L];
    loads.forEach(function (q) { marks.push(q.x); });
    marks = marks.filter(function (x, i, all) { return all.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
    function jump(x) {
      var j = 0;
      if (x === 0) j += Ra;
      if (x === L) j += Rb;
      loads.forEach(function (q) { if (q.x === x) j -= q.p; });
      return j;
    }
    var V = 0;
    var M = 0;
    var segments = [];
    var peak = 0;
    for (var i = 0; i < marks.length - 1; i++) {
      V += jump(marks[i]);
      var x0 = marks[i];
      var x1 = marks[i + 1];
      var m0 = M;
      M += V * (x1 - x0);
      segments.push({ x0: x0, x1: x1, v: V, m0: m0, m1: M });
      if (M > peak) peak = M;
      if (m0 > peak) peak = m0;
    }
    return { Ra: Ra, Rb: Rb, segments: segments, peak: peak, endMoment: M };
  }

  /* Diagonal member at a 3-4-5 slope, up and to the left of the joint.
     T is tension in that member. H is tension in the member to the right.
     load is downward. fx and fy are in fifths of a kilonewton. */
  function joint(T, H, load) {
    return { fx: -4 * T + 5 * H, fy: 3 * T - 5 * load };
  }

  function harmonic(L, f, v) {
    if (!v || (2 * L * f) % v !== 0) return null;
    var n = (2 * L * f) / v;
    if (n < 1 || n !== Math.floor(n)) return null;
    return { n: n, nodes: n + 1, antinodes: n };
  }

  function seesaw(lw, ld, rw, rd) {
    var left = lw * ld;
    var right = rw * rd;
    if (left === right) return 'balance';
    return left > right ? 'left' : 'right';
  }

  function slopeKind(slope) {
    if (slope > 0) return 'pos';
    if (slope < 0) return 'neg';
    return 'zero';
  }

  return {
    net: net,
    sameNet: sameNet,
    beam: beam,
    joint: joint,
    harmonic: harmonic,
    seesaw: seesaw,
    slopeKind: slopeKind
  };
});
