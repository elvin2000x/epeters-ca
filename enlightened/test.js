var E = require('./check.js');
var D = require('./items.js');
var assert = require('assert');

assert.strictEqual(E.follows([['if', 'bus-late', 'sam-walks'], ['yes', 'bus-late']], ['yes', 'sam-walks']), true);
assert.strictEqual(E.follows([['if', 'bus-late', 'sam-walks'], ['yes', 'sam-walks']], ['yes', 'bus-late']), false);
assert.strictEqual(E.follows([['if', 'paid', 'green'], ['no', 'green']], ['no', 'paid']), true);
assert.strictEqual(E.follows([['if', 'paid', 'green'], ['no', 'paid']], ['no', 'green']), false);
assert.strictEqual(E.follows([['all', 'box-metal', 'conducts'], ['is', 'key', 'box-metal']], ['is', 'key', 'conducts']), true);
assert.strictEqual(E.follows([['all', 'box-metal', 'conducts'], ['is', 'key', 'conducts']], ['is', 'key', 'box-metal']), false);
assert.strictEqual(E.follows([['some', 'tickets', 'comps'], ['is', 'this', 'tickets']], ['is', 'this', 'comps']), false);
assert.strictEqual(E.follows([['none', 'cupboard-solvent', 'water'], ['is', 'bottle', 'cupboard-solvent']], ['isnt', 'bottle', 'water']), true);
assert.strictEqual(E.follows([['if', 'p', 'q'], ['if', 'q', 'r'], ['yes', 'p']], ['yes', 'r']), true);

assert.strictEqual(E.breaks({ type: 'all', subject: 'dog', property: 'kind' }, { dog: true, kind: false }), true);
assert.strictEqual(E.breaks({ type: 'all', subject: 'dog', property: 'kind' }, { dog: false, kind: false }), false);
assert.strictEqual(E.breaks({ type: 'none', subject: 'monday', forbidden: 'past' }, { monday: true, past: true }), true);
assert.strictEqual(E.breaks({ type: 'none', subject: 'monday', forbidden: 'past' }, { monday: true, past: false }), false);

var seq = E.track(D.lessons, D.items);
assert.strictEqual(D.lessons.length, 5);
assert.strictEqual(D.items.length, 32);
assert.strictEqual(seq.length, 37);
assert.strictEqual(seq[0].type, 'lesson');
assert.strictEqual(seq[36].type, 'drill');

var seen = {};
D.items.forEach(function (item, index) {
  var id = E.correctId(item);
  assert.ok(id, 'item ' + index + ' has one correct choice');
  if (item.kind === 'follows') {
    assert.ok(item.reading);
    assert.ok(!item.given.some(function (stmt) { return JSON.stringify(stmt) === JSON.stringify(item.conclude); }));
  }
  if (item.kind === 'parts') {
    assert.strictEqual(item.sentences.length, 3);
    item.sentences.forEach(function (s) {
      if (s.id !== id) assert.ok(s.miss, 'miss line');
    });
  } else if (item.kind !== 'follows') {
    item.choices.forEach(function (c) {
      if (c.id !== id) assert.ok(c.miss, item.kind + ' miss');
    });
  }
  var blob = JSON.stringify(item);
  assert.ok(blob.indexOf('Take the alley') === -1);
  assert.ok(blob.indexOf('oven is on') === -1);
  assert.ok(blob.indexOf('penguin') === -1);
  assert.ok(blob.indexOf('Close the stand') === -1);
  seen[item.level] = (seen[item.level] || 0) + 1;
});
assert.deepStrictEqual(seen, { 1: 6, 2: 6, 3: 8, 4: 6, 5: 6 });

var peach = D.items.filter(function (item) { return item.claim && item.claim.words.indexOf('peaches') !== -1; })[0];
assert.strictEqual(E.correctId(peach), 'd');
var counter = peach.choices.filter(function (c) { return c.text.indexOf('counter') !== -1; })[0];
assert.strictEqual(E.breaks(peach.claim, counter.attrs), false);

console.log('enlightened checks ok', seq.length, 'steps');
