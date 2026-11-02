/* Checked argument moves. No DOM.
   "Follows" is a forward pass: if-then with the if-part, if-then with the then-part denied,
   every, and none. Affirming the then-part, denying the if-part, and "some" never fire. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Enlightened = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function key(stmt) {
    return JSON.stringify(stmt);
  }

  function closure(given) {
    var has = {};
    (given || []).forEach(function (stmt) { has[key(stmt)] = stmt; });
    var guard = 0;
    var changed = true;
    while (changed && guard < 24) {
      guard += 1;
      changed = false;
      var list = Object.keys(has).map(function (k) { return has[k]; });
      list.forEach(function (stmt) {
        if (stmt[0] === 'if') {
          var p = stmt[1];
          var q = stmt[2];
          if (has[key(['yes', p])] && !has[key(['yes', q])]) {
            has[key(['yes', q])] = ['yes', q];
            changed = true;
          }
          if (has[key(['no', q])] && !has[key(['no', p])]) {
            has[key(['no', p])] = ['no', p];
            changed = true;
          }
        }
        if (stmt[0] === 'all' || stmt[0] === 'none') {
          var group = stmt[1];
          var trait = stmt[2];
          list.forEach(function (fact) {
            if (fact[0] !== 'is' || fact[2] !== group) return;
            var add = stmt[0] === 'all' ? ['is', fact[1], trait] : ['isnt', fact[1], trait];
            if (!has[key(add)]) {
              has[key(add)] = add;
              changed = true;
            }
          });
        }
      });
    }
    return has;
  }

  function follows(given, conclude) {
    return !!closure(given)[key(conclude)];
  }

  /* An "every" sentence breaks on one case that has the subject and lacks the trait.
     A "no" sentence breaks on one case that has the subject and has the forbidden trait. */
  function breaks(claim, attrs) {
    if (!claim || !attrs) return false;
    if (claim.type === 'all') return attrs[claim.subject] === true && attrs[claim.property] === false;
    if (claim.type === 'none') return attrs[claim.subject] === true && attrs[claim.forbidden] === true;
    return false;
  }

  function correctId(item) {
    if (item.kind === 'follows') return follows(item.given, item.conclude) ? 'yes' : 'no';
    if (item.kind === 'parts') {
      var hit = item.sentences.filter(function (s) { return s.role === item.askRole; });
      if (hit.length !== 1) return null;
      return hit[0].id;
    }
    if (item.kind === 'bridge') {
      var bridges = item.choices.filter(function (c) { return c.job === 'bridge'; });
      if (bridges.length !== 1) return null;
      return bridges[0].id;
    }
    if (item.kind === 'break') {
      var bad = item.choices.filter(function (c) { return breaks(item.claim, c.attrs); });
      if (bad.length !== 1) return null;
      return bad[0].id;
    }
    if (item.kind === 'reply') {
      var lands = item.choices.filter(function (c) { return c.job === 'hits'; });
      if (lands.length !== 1) return null;
      return lands[0].id;
    }
    return null;
  }

  function track(lessons, items) {
    var seq = [];
    lessons.forEach(function (lesson) {
      seq.push({ type: 'lesson', lesson: lesson });
      items.forEach(function (item) {
        if (item.level === lesson.level) seq.push({ type: 'drill', item: item });
      });
    });
    return seq;
  }

  return {
    closure: closure,
    follows: follows,
    breaks: breaks,
    correctId: correctId,
    track: track
  };
});
