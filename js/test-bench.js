var M = require('./bench-math.js');
var assert = require('assert');

assert.deepStrictEqual(M.net([{ d: 'R', n: 20 }, { d: 'L', n: 10 }, { d: 'U', n: 5 }]), { fx: 10, fy: 5 });
assert.strictEqual(M.sameNet(M.net([{ d: 'R', n: 10 }, { d: 'L', n: 10 }]), { fx: 0, fy: 0 }), true);

var b = M.beam(6, [{ x: 2, p: 12 }, { x: 4, p: 12 }]);
assert.strictEqual(b.Ra, 12);
assert.strictEqual(b.Rb, 12);
assert.strictEqual(b.peak, 24);
assert.strictEqual(b.endMoment, 0);
assert.deepStrictEqual(b.segments.map(function (s) { return s.v; }), [12, 0, -12]);

var b2 = M.beam(10, [{ x: 4, p: 10 }, { x: 6, p: 10 }]);
assert.strictEqual(b2.peak, 40);
assert.strictEqual(b2.endMoment, 0);

var b3 = M.beam(8, [{ x: 2, p: 16 }, { x: 6, p: 8 }]);
assert.strictEqual(b3.Ra, 14);
assert.strictEqual(b3.Rb, 10);
assert.strictEqual(b3.peak, 28);
assert.strictEqual(b3.endMoment, 0);

assert.deepStrictEqual(M.joint(25, 20, 15), { fx: 0, fy: 0 });
assert.deepStrictEqual(M.joint(50, 40, 30), { fx: 0, fy: 0 });
assert.notDeepStrictEqual(M.joint(15, 20, 15), { fx: 0, fy: 0 });

assert.deepStrictEqual(M.harmonic(2, 12, 24), { n: 2, nodes: 3, antinodes: 2 });
assert.strictEqual(M.harmonic(2, 10, 24), null);
assert.deepStrictEqual(M.harmonic(1, 12, 24), { n: 1, nodes: 2, antinodes: 1 });

assert.strictEqual(M.seesaw(20, 2, 40, 1), 'balance');
assert.strictEqual(M.seesaw(30, 2, 20, 2), 'left');
assert.strictEqual(M.seesaw(10, 1, 40, 1), 'right');

assert.strictEqual(M.beam(8, [{ x: 2, p: 10 }, { x: 6, p: 10 }]).peak, 20);
assert.strictEqual(M.joint(15, 12, 9).fy, 0);
assert.strictEqual(M.joint(15, 12, 9).fx, 0);
assert.strictEqual(M.joint(35, 28, 21).fx, 0);
assert.strictEqual(M.joint(35, 28, 21).fy, 0);
assert.strictEqual(M.slopeKind(0), 'zero');
assert.strictEqual(M.slopeKind(-1), 'neg');

console.log('bench math ok');
