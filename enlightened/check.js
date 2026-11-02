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

  function holds(has, part) {
    if (typeof part === 'string') return !!has[key(['yes', part])];
    if (Array.isArray(part) && part[0] === 'and') return holds(has, part[1]) && holds(has, part[2]);
    return false;
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
          if (holds(has, p) && typeof q === 'string' && !has[key(['yes', q])]) {
            has[key(['yes', q])] = ['yes', q];
            changed = true;
          }
          if (typeof p === 'string' && typeof q === 'string' && has[key(['no', q])] && !has[key(['no', p])]) {
            has[key(['no', p])] = ['no', p];
            changed = true;
          }
        }
        if (stmt[0] === 'or') {
          var left = stmt[1];
          var right = stmt[2];
          if (has[key(['no', left])] && !has[key(['yes', right])]) {
            has[key(['yes', right])] = ['yes', right];
            changed = true;
          }
          if (has[key(['no', right])] && !has[key(['yes', left])]) {
            has[key(['yes', left])] = ['yes', left];
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
    if (claim.type === 'atLeast') return Number(attrs.count) < Number(claim.need);
    if (claim.type === 'usually') return false;
    return false;
  }

  var shapeHolds = {
    mp: true, mt: true, 'all-yes': true, none: true, chain: true, 'and-yes': true, 'or-yes': true,
    ac: false, da: false, 'all-back': false, some: false, most: false, 'and-half': false, 'or-keep': false
  };

  var shapeWords = {
    mp: 'Using the if-part. School name: modus ponens.',
    ac: 'Reading the if-then backwards. School name: affirming the consequent.',
    mt: 'The then-part failed, so the if-part failed. School name: modus tollens.',
    da: 'Denying the if-part leaves the then-part open. School name: denying the antecedent.',
    'all-yes': 'The case is in the group, so it has the trait.',
    'all-back': 'Having the trait does not put the case in the group.',
    some: 'Some does not cover the one in your hand.',
    most: 'Most does not cover the one in your hand.',
    none: 'None in the group excludes the trait.',
    chain: 'The then-part became the if-part of the next sentence.',
    'and-yes': 'Both parts of the if are in hand.',
    'and-half': 'One part of a joint if is still missing.',
    'or-yes': 'One side is out, so the other side is in.',
    'or-keep': 'Having one side does not throw out the other.'
  };

  function shapeAgrees(item) {
    if (!item.shape) return true;
    if (!Object.prototype.hasOwnProperty.call(shapeHolds, item.shape)) return false;
    return shapeHolds[item.shape] === follows(item.given, item.conclude);
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
    if (item.kind === 'break' && item.claim && (item.claim.type === 'usually' || item.claim.type === 'most')) {
      var any = item.choices.some(function (c) { return breaks(item.claim, c.attrs); });
      var safe = item.choices.filter(function (c) { return c.job === 'safe'; });
      if (any || safe.length !== 1) return null;
      return safe[0].id;
    }
    if (item.kind === 'break') {
      var bad = item.choices.filter(function (c) { return breaks(item.claim, c.attrs); });
      if (bad.length !== 1) return null;
      return bad[0].id;
    }
    if (item.kind === 'reply' || item.kind === 'steel' || item.kind === 'gap') {
      var want = item.want || (item.kind === 'steel' ? 'fair' : item.kind === 'gap' ? 'gap' : 'hits');
      var lands = item.choices.filter(function (c) { return c.job === want; });
      if (lands.length !== 1) return null;
      return lands[0].id;
    }
    return null;
  }

  function buildCheck(claim, reason, bridge) {
    var c = String(claim || '').trim();
    var r = String(reason || '').trim();
    var b = String(bridge || '').trim();
    var problems = [];
    if (c.length < 8) problems.push('The claim needs a full sentence.');
    if (r.length < 8) problems.push('The reason needs a full sentence.');
    if (b.length < 8) problems.push('The bridge needs a full sentence.');
    if (c && r && c.toLowerCase() === r.toLowerCase()) problems.push('The reason repeats the claim.');
    if (b && c && b.toLowerCase() === c.toLowerCase()) problems.push('The bridge repeats the claim.');
    if (b && r && b.toLowerCase() === r.toLowerCase()) problems.push('The bridge repeats the reason.');
    if (b && !/^if\b/i.test(b)) problems.push('Start the bridge with if.');
    return { ok: problems.length === 0, problems: problems };
  }

  function replyCheck(text, keywords) {
    var t = String(text || '').trim();
    var words = t.split(/\s+/).filter(Boolean);
    var problems = [];
    if (words.length < 8) problems.push('Say it in at least eight words.');
    var low = t.toLowerCase();
    var hit = (keywords || []).some(function (word) { return low.indexOf(String(word).toLowerCase()) !== -1; });
    if (!hit) problems.push('Use the words of the reason you are answering.');
    if (/^\s*you (never|always|are|know nothing|worry|dislike)\b/i.test(t)) problems.push('That names the person. Answer the reason.');
    return { ok: problems.length === 0, problems: problems };
  }

  function chipSet(shape) {
    var family = {
      mp: ['mp', 'ac', 'mt', 'da'],
      ac: ['mp', 'ac', 'mt', 'da'],
      mt: ['mp', 'ac', 'mt', 'da'],
      da: ['mp', 'ac', 'mt', 'da'],
      'all-yes': ['all-yes', 'all-back', 'some', 'none'],
      'all-back': ['all-yes', 'all-back', 'some', 'none'],
      some: ['all-yes', 'all-back', 'some', 'most'],
      most: ['all-yes', 'some', 'most', 'none'],
      none: ['all-yes', 'all-back', 'some', 'none'],
      chain: ['chain', 'mp', 'ac', 'and-half'],
      'and-yes': ['and-yes', 'and-half', 'mp', 'or-yes'],
      'and-half': ['and-yes', 'and-half', 'mp', 'or-keep'],
      'or-yes': ['or-yes', 'or-keep', 'mt', 'and-yes'],
      'or-keep': ['or-yes', 'or-keep', 'ac', 'and-half']
    };
    return family[shape] || ['mp', 'ac', 'mt', 'da'];
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
    track: track,
    shapeAgrees: shapeAgrees,
    shapeWords: shapeWords,
    shapeHolds: shapeHolds,
    buildCheck: buildCheck,
    replyCheck: replyCheck,
    chipSet: chipSet
  };
});
