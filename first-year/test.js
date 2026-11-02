var assert = require('assert');
var D = require('./doors.js');
assert.strictEqual(D.doors.length, 6);
var seen = {};
D.doors.forEach(function (door) {
  assert.ok(!seen[door.id]);
  seen[door.id] = true;
  if (door.linkOnly) {
    assert.ok(!door.choices);
    assert.ok(door.note);
    return;
  }
  assert.strictEqual(door.choices.length, 3);
  assert.ok(D.correctId(door));
  door.choices.forEach(function (c) {
    if (c.id !== D.correctId(door)) assert.ok(c.miss, door.id);
  });
});
assert.strictEqual(D.doors.map(function (d) { return d.id; }).join(','), 'mind,ethics,logic,religion,knowledge,aesthetics');
console.log('first-year doors ok');
