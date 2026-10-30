/* The software shelf. content/shelf.json is the list. An empty list shows one line and no price and no buy button.
   One entry: { "name", "paragraph", "try", "price", "buy", "problem", "thinking", "prompt", "result" }
   price and buy stay blank until the Products screen has them. prompt stays blank when it is not in the files.
   This file is the product template. A filled entry renders on the homepage. It is not a second checkout. */
(function () {
  'use strict';
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var line = function (label, text) {
    if (!text) return '';
    return '<h3>' + esc(label) + '</h3><p>' + esc(text) + '</p>';
  };
  var card = function (item) {
    var buy = item.buy ? '<a class="btn" href="' + esc(item.buy) + '">Buy</a>' : '';
    var price = item.price ? '<p class="price">' + esc(item.price) + '</p>' : '';
    var open = item.try ? '<a class="btn primary" href="' + esc(item.try) + '">Open it</a>' : '';
    var made = line('The problem', item.problem) + line('The thinking', item.thinking) + line('The prompt', item.prompt) + line('The result', item.result);
    return '<article class="shelf-item"><h2>' + esc(item.name || '') + '</h2>' +
      (item.paragraph ? '<p>' + esc(item.paragraph) + '</p>' : '') +
      price + '<p class="actions">' + open + buy + '</p>' +
      (made ? '<div class="made">' + made + '</div>' : '') + '</article>';
  };
  var empty = document.getElementById('shelf-empty');
  var list = document.getElementById('shelf-list');
  fetch('/content/shelf.json').then(function (r) { return r.json(); }).then(function (items) {
    if (!Array.isArray(items) || !items.length) return;
    empty.hidden = true;
    list.innerHTML = items.map(card).join('');
  }).catch(function () {});
})();
