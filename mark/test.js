var assert = require('assert');
var fs = require('fs');
var path = require('path');
var book = JSON.parse(fs.readFileSync(path.join(__dirname, 'gospel.json'), 'utf8'));
var old = JSON.parse(fs.readFileSync(path.join(__dirname, 'chapter1.json'), 'utf8'));
var counts = [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20];
assert.strictEqual(book.chapters.length, 16);
book.chapters.forEach(function (ch, i) {
  assert.strictEqual(ch.verses.length, counts[i], 'chapter ' + ch.n);
  assert.strictEqual(ch.verses[0].n, 1);
  assert.strictEqual(ch.verses[ch.verses.length - 1].n, counts[i]);
  var blob = JSON.stringify(ch);
  assert.ok(blob.indexOf('Frequently Asked') === -1);
  assert.ok(blob.indexOf('notemark') === -1);
});
assert.deepStrictEqual(book.chapters[0].verses, old.verses);
console.log('mark chapters ok', book.chapters.length);
