/* Original drills for the six doors. Nothing here is copied from the Rebus books. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FirstYear = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var series = 'https://forum.rebus.community/t/project-summary/618';
  var doors = [
    {
      id: 'mind',
      name: 'Philosophy of mind',
      book: 'https://press.rebus.community/intro-to-phil-of-mind/',
      series: series,
      ask: 'The lamp is on, so someone is in the room. Which sentence is the claim?',
      choices: [
        { id: 'a', text: 'Someone is in the room.', miss: '' },
        { id: 'b', text: 'The lamp is on.', miss: 'That is the reason.' },
        { id: 'c', text: 'Lamps use bulbs.', miss: 'A bulb does no work in this argument.' }
      ]
    },
    {
      id: 'ethics',
      name: 'Ethics',
      book: 'https://press.rebus.community/intro-to-phil-ethics/',
      series: series,
      ask: 'Keep the extra change, because the cashier miscounted. Which sentence is the claim?',
      choices: [
        { id: 'a', text: 'The cashier miscounted.', miss: 'That is the reason.' },
        { id: 'b', text: 'Keep the extra change.', miss: '' },
        { id: 'c', text: 'Coins are round.', miss: 'The shape of a coin does no work here.' }
      ]
    },
    {
      id: 'logic',
      name: 'Logic',
      book: 'https://press.rebus.community/intro-to-phil-logic/',
      series: series,
      practice: '/enlightened/',
      ask: 'The gate is locked. If the gate is locked, visitors use the lane. Which sentence follows?',
      choices: [
        { id: 'a', text: 'Visitors use the lane.', miss: '' },
        { id: 'b', text: 'The gate was never built.', miss: 'That denies the reason. The then-part is the one that follows.' },
        { id: 'c', text: 'Lanes have gravel.', miss: 'Gravel can be true and still do no work here.' }
      ]
    },
    {
      id: 'religion',
      name: 'Philosophy of religion',
      series: series,
      linkOnly: true,
      note: 'This door is only the series link. The license page for this volume did not load, so nothing from the book is copied here.'
    },
    {
      id: 'knowledge',
      name: 'Epistemology',
      book: 'https://press.rebus.community/intro-to-phil-epistemology/',
      series: series,
      ask: 'I saw the lamp on. So the lamp is on. Which sentence is the reason?',
      choices: [
        { id: 'a', text: 'The lamp is on.', miss: 'That is the claim.' },
        { id: 'b', text: 'I saw the lamp on.', miss: '' },
        { id: 'c', text: 'Rooms have lamps.', miss: 'That can be true and still do no work here.' }
      ]
    },
    {
      id: 'aesthetics',
      name: 'Aesthetics',
      book: 'https://press.rebus.community/intro-to-phil-aesthetics/',
      series: series,
      ask: 'Keep the song in the set. People stayed through it. Which sentence is the claim?',
      choices: [
        { id: 'a', text: 'People stayed through it.', miss: 'That is the reason.' },
        { id: 'b', text: 'Songs have verses.', miss: 'Verses do no work in this argument.' },
        { id: 'c', text: 'Keep the song in the set.', miss: '' }
      ]
    }
  ];

  function correctId(door) {
    if (!door.choices) return null;
    var hits = door.choices.filter(function (c) { return !c.miss; });
    return hits.length === 1 ? hits[0].id : null;
  }

  return { doors: doors, series: series, correctId: correctId };
});
