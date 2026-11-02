/* Lessons and drills. Worked examples in the lessons are not reused as drills.
   Follows-items store the pattern. The checker, not this file, decides yes or no. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EnlightenedItems = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var lessons = [
    {
      level: 1,
      name: 'Parts',
      title: 'Claim and reason',
      blocks: [
        { kind: 'rule', text: 'An argument asks you to accept one sentence because of another. The claim is the sentence they want accepted. The reason is the support.' },
        { kind: 'work', text: '“Take the alley. The main road is closed.” The claim is “Take the alley.” The reason is “The main road is closed.”' },
        { kind: 'work', text: '“I like alleys” sits beside those two and supports nothing.' },
        { kind: 'tease', text: 'The first drills ask you to point at the claim, or at the reason.' }
      ]
    },
    {
      level: 2,
      name: 'Bridge',
      title: 'The skipped step',
      blocks: [
        { kind: 'rule', text: 'The reason reaches the claim only when a bridge sentence is true. Speakers usually leave that sentence out.' },
        { kind: 'work', text: '“The main road is closed, so take the alley.” The bridge is “If the main road is closed, the alley is the way.”' },
        { kind: 'work', text: 'Repeating “the main road is closed” only repeats the reason. Repeating “take the alley” only repeats the claim.' },
        { kind: 'work', text: 'So, because, and since often mark a reason. So can also mean and then, which is a sequence.' },
        { kind: 'tease', text: 'The next drills ask for the bridge.' }
      ]
    },
    {
      level: 3,
      name: 'Follows',
      title: 'Follows, before true',
      blocks: [
        { kind: 'rule', text: 'Follows means: whenever the reasons are true, the claim is true. You can settle that before anyone checks the facts.' },
        { kind: 'work', text: '“If the oven is on, the kitchen is warm. The oven is on. So the kitchen is warm.” Whenever those reasons are true, the claim is true.' },
        { kind: 'work', text: '“The kitchen is warm, so the oven is on.” A toaster can warm a kitchen. The reason can hold while the claim fails.' },
        { kind: 'tease', text: 'The next drills ask only whether the claim follows.' }
      ]
    },
    {
      level: 4,
      name: 'One case',
      title: 'One case is enough',
      blocks: [
        { kind: 'rule', text: 'A sentence that says every is false as soon as one case has the first property and lacks the second. A sentence that says no is false as soon as one case has both.' },
        { kind: 'work', text: '“Every bird in this yard flies.” A penguin standing in this yard makes that sentence false. A bat overhead does not, because the sentence never mentioned bats.' },
        { kind: 'tease', text: 'Pick the case that makes the general sentence false.' }
      ]
    },
    {
      level: 5,
      name: 'Reply',
      title: 'A reply that lands',
      blocks: [
        { kind: 'rule', text: 'A reply lands when it gives a reason to drop the reason. A jab at the person, a new topic, or a repeat leaves the reason standing.' },
        { kind: 'work', text: '“Close the stand. Sales are down.” A landing reply: “Sales are down because the street was closed for three days, and the week before was the usual count.”' },
        { kind: 'work', text: '“You don’t like the stand” names the person. “Street food is trendy” changes the subject.' },
        { kind: 'tease', text: 'Pick the reply that hits the reason.' }
      ]
    }
  ];

  var items = [
    {
      kind: 'parts', level: 1, askRole: 'claim',
      ask: 'Which sentence is the claim?',
      hit: 'They want the coat brought. The wind is only the reason.',
      sentences: [
        { id: 'a', role: 'claim', text: 'Bring a coat.', miss: '' },
        { id: 'b', role: 'reason', text: 'The wind is up.', miss: 'That sentence is the reason. The claim is what they want you to do.' },
        { id: 'c', role: 'aside', text: 'I like coats.', miss: 'That sentence does no work. Liking coats is not why, and it is not the request.' }
      ]
    },
    {
      kind: 'parts', level: 1, askRole: 'reason',
      ask: 'Which sentence is the reason?',
      hit: 'The late report is why they want the meeting moved.',
      sentences: [
        { id: 'a', role: 'reason', text: 'The report is late.', miss: '' },
        { id: 'b', role: 'claim', text: 'Move the meeting.', miss: 'That sentence is the claim. The reason is the support.' },
        { id: 'c', role: 'aside', text: 'The meeting room is blue.', miss: 'The colour of the room supports nothing here.' }
      ]
    },
    {
      kind: 'parts', level: 1, askRole: 'claim',
      ask: 'Which sentence is the claim?',
      hit: 'The request is to leave the fish. The smell is the reason.',
      sentences: [
        { id: 'a', role: 'reason', text: 'It smells sharp.', miss: 'That sentence is the reason.' },
        { id: 'b', role: 'aside', text: 'Fish is a food.', miss: 'That sentence does no work in this argument.' },
        { id: 'c', role: 'claim', text: 'Don’t buy the fish.', miss: '' }
      ]
    },
    {
      kind: 'parts', level: 1, askRole: 'reason',
      ask: 'Which sentence is the reason?',
      hit: 'The changed code is why they want the side door used.',
      sentences: [
        { id: 'a', role: 'claim', text: 'Use the side door.', miss: 'That sentence is the claim.' },
        { id: 'b', role: 'reason', text: 'The gate code changed.', miss: '' },
        { id: 'c', role: 'aside', text: 'Side doors are doors.', miss: 'That sentence does no work here.' }
      ]
    },
    {
      kind: 'parts', level: 1, askRole: 'claim',
      ask: 'Which sentence is the claim?',
      hit: 'They want a second shift hired. The orders are the reason.',
      sentences: [
        { id: 'a', role: 'aside', text: 'Shifts have names.', miss: 'That sentence does no work here.' },
        { id: 'b', role: 'claim', text: 'Hire a second shift.', miss: '' },
        { id: 'c', role: 'reason', text: 'Orders are past what one shift can pack.', miss: 'That sentence is the reason.' }
      ]
    },
    {
      kind: 'parts', level: 1, askRole: 'reason',
      ask: 'Which sentence is the reason?',
      hit: 'The flood is why they want the picnic cancelled.',
      sentences: [
        { id: 'a', role: 'claim', text: 'Cancel the picnic.', miss: 'That sentence is the claim.' },
        { id: 'b', role: 'aside', text: 'Picnics are outdoors.', miss: 'That sentence does no work here.' },
        { id: 'c', role: 'reason', text: 'The field is flooded.', miss: '' }
      ]
    },
    {
      kind: 'bridge', level: 2,
      ask: 'Which sentence is the bridge that was left out?',
      passage: 'The field is flooded, so cancel the picnic.',
      hit: 'The flood supports cancelling only if a flooded field means the picnic should be cancelled.',
      choices: [
        { id: 'a', job: 'reason', text: 'The field is flooded.', miss: 'That repeats the reason. The bridge connects the reason to the claim.' },
        { id: 'b', job: 'bridge', text: 'If the field is flooded, the picnic should be cancelled.', miss: '' },
        { id: 'c', job: 'claim', text: 'The picnic should be cancelled.', miss: 'That repeats the claim.' },
        { id: 'd', job: 'extra', text: 'Picnics often include watermelon.', miss: 'That sentence can be true and still do no work here.' }
      ]
    },
    {
      kind: 'bridge', level: 2,
      ask: 'Which sentence is the bridge that was left out?',
      passage: 'Orders are past what one shift can pack, so hire a second shift.',
      hit: 'The packed-out shift supports hiring only with that if-then.',
      choices: [
        { id: 'a', job: 'extra', text: 'Shifts start at seven.', miss: 'The start time does not connect these two sentences.' },
        { id: 'b', job: 'claim', text: 'A second shift should be hired.', miss: 'That repeats the claim.' },
        { id: 'c', job: 'bridge', text: 'If one shift cannot pack the orders, a second shift should be hired.', miss: '' },
        { id: 'd', job: 'reason', text: 'One shift cannot pack the orders.', miss: 'That repeats the reason.' }
      ]
    },
    {
      kind: 'bridge', level: 2,
      ask: 'Which sentence is the bridge that was left out?',
      passage: 'The wind is up, so bring a coat.',
      hit: 'Wind supports a coat only if wind is a reason to bring one.',
      choices: [
        { id: 'a', job: 'bridge', text: 'If the wind is up, you should bring a coat.', miss: '' },
        { id: 'b', job: 'reverse', text: 'If you bring a coat, the wind is up.', miss: 'That runs the if-then backwards. The reason is the wind, and the claim is the coat.' },
        { id: 'c', job: 'reason', text: 'The wind is up.', miss: 'That repeats the reason.' },
        { id: 'd', job: 'extra', text: 'Coats have pockets.', miss: 'Pockets do no work here.' }
      ]
    },
    {
      kind: 'bridge', level: 2,
      ask: 'Which sentence is the bridge that was left out?',
      passage: 'The gate code changed, so use the side door.',
      hit: 'A new code supports the side door only with that link.',
      choices: [
        { id: 'a', job: 'extra', text: 'Doors have hinges.', miss: 'Hinges do no work here.' },
        { id: 'b', job: 'bridge', text: 'If the gate code changed, the side door is the way in.', miss: '' },
        { id: 'c', job: 'reverse', text: 'If you use the side door, the gate code changed.', miss: 'That runs the link backwards.' },
        { id: 'd', job: 'claim', text: 'Use the side door.', miss: 'That repeats the claim.' }
      ]
    },
    {
      kind: 'bridge', level: 2,
      ask: 'Which sentence is the bridge that was left out?',
      passage: 'The fish smells sharp, so don’t buy it.',
      hit: 'A sharp smell supports leaving it only if a sharp smell means you should not buy.',
      choices: [
        { id: 'a', job: 'reason', text: 'The fish smells sharp.', miss: 'That repeats the reason.' },
        { id: 'b', job: 'extra', text: 'Fish swim.', miss: 'That can be true and still do no work here.' },
        { id: 'c', job: 'claim', text: 'Don’t buy the fish.', miss: 'That repeats the claim.' },
        { id: 'd', job: 'bridge', text: 'If fish smells sharp, you should not buy it.', miss: '' }
      ]
    },
    {
      kind: 'bridge', level: 2,
      ask: 'Which sentence is the bridge that was left out?',
      passage: 'The report is late, so move the meeting.',
      hit: 'A late report supports moving the meeting only with that if-then.',
      choices: [
        { id: 'a', job: 'bridge', text: 'If the report is late, the meeting should be moved.', miss: '' },
        { id: 'b', job: 'extra', text: 'Meetings have agendas.', miss: 'An agenda does no work here.' },
        { id: 'c', job: 'reason', text: 'The report is late.', miss: 'That repeats the reason.' },
        { id: 'd', job: 'reverse', text: 'If the meeting is moved, the report is late.', miss: 'That runs the link backwards.' }
      ]
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'If the bus is late, Sam walks. The bus is late. So Sam walks.',
      given: [['if', 'bus-late', 'sam-walks'], ['yes', 'bus-late']],
      conclude: ['yes', 'sam-walks'],
      reading: 'The if-part is among the reasons, so the then-part follows.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'If the bus is late, Sam walks. Sam walks. So the bus is late.',
      given: [['if', 'bus-late', 'sam-walks'], ['yes', 'sam-walks']],
      conclude: ['yes', 'bus-late'],
      reading: 'Sam can walk while the bus is on time. The then-part does not give you the if-part.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'If the invoice was paid, the light is green. The light is not green. So the invoice was not paid.',
      given: [['if', 'paid', 'green'], ['no', 'green']],
      conclude: ['no', 'paid'],
      reading: 'The then-part failed, so the if-part failed with it.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'If the invoice was paid, the light is green. The invoice was not paid. So the light is not green.',
      given: [['if', 'paid', 'green'], ['no', 'paid']],
      conclude: ['no', 'green'],
      reading: 'The light can still be green for another reason. Denying the if-part leaves the then-part open.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'Every metal in this box conducts. This key is a metal in this box. So this key conducts.',
      given: [['all', 'box-metal', 'conducts'], ['is', 'key', 'box-metal']],
      conclude: ['is', 'key', 'conducts'],
      reading: 'The key is in the group the word every covers, so the trait follows.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'Every metal in this box conducts. This key conducts. So this key is a metal in this box.',
      given: [['all', 'box-metal', 'conducts'], ['is', 'key', 'conducts']],
      conclude: ['is', 'key', 'box-metal'],
      reading: 'A conducting key can sit outside the box. The trait does not prove membership.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'Some of the tickets are comps. This is one of the tickets. So this ticket is a comp.',
      given: [['some', 'tickets', 'comps'], ['is', 'this', 'tickets']],
      conclude: ['is', 'this', 'comps'],
      reading: 'Some of the tickets are comps, and this one can still be paid. The word some does not cover the ticket in your hand.'
    },
    {
      kind: 'follows', level: 3,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: 'No solvent in the cupboard is water. This bottle is a solvent in the cupboard. So this bottle is not water.',
      given: [['none', 'cupboard-solvent', 'water'], ['is', 'bottle', 'cupboard-solvent']],
      conclude: ['isnt', 'bottle', 'water'],
      reading: 'The bottle is in the group that the word no excludes from water.'
    },
    {
      kind: 'break', level: 4,
      ask: 'Which case makes the sentence false?',
      claim: { type: 'all', subject: 'dog', property: 'kind', words: 'Everyone who owns a dog is kind.' },
      hit: 'Sam has the subject and lacks the trait. That one case makes “everyone” false.',
      choices: [
        { id: 'a', text: 'Sam owns a dog and kicked a stranger.', attrs: { dog: true, kind: false }, miss: '' },
        { id: 'b', text: 'Jo has no dog and is kind.', attrs: { dog: false, kind: true }, miss: 'Jo is outside the group. The sentence never mentioned people without dogs.' },
        { id: 'c', text: 'Ada has no dog and is rude.', attrs: { dog: false, kind: false }, miss: 'Ada is outside the group. Rudeness there leaves the sentence standing.' },
        { id: 'd', text: 'Mia owns a dog and volunteers on Saturdays.', attrs: { dog: true, kind: true }, miss: 'Mia fits the sentence. A fitting case cannot break “everyone.”' }
      ]
    },
    {
      kind: 'break', level: 4,
      ask: 'Which case makes the sentence false?',
      claim: { type: 'all', subject: 'late', property: 'local', words: 'Every late train on this board is a local.' },
      hit: 'The 6:10 is late and is not a local. “Every” fails on that one.',
      choices: [
        { id: 'a', text: 'The 6:40 is on time and is an express.', attrs: { late: false, local: false }, miss: 'An on-time train is outside the group.' },
        { id: 'b', text: 'The 6:10 is late and is an express.', attrs: { late: true, local: false }, miss: '' },
        { id: 'c', text: 'The 7:00 is late and is a local.', attrs: { late: true, local: true }, miss: 'That train fits the sentence.' },
        { id: 'd', text: 'The 7:20 is on time and is a local.', attrs: { late: false, local: true }, miss: 'An on-time local is outside the group the sentence talks about.' }
      ]
    },
    {
      kind: 'break', level: 4,
      ask: 'Which case makes the sentence false?',
      claim: { type: 'none', subject: 'monday', forbidden: 'past', words: 'No Monday meeting runs past noon.' },
      hit: 'A Monday meeting that runs past noon is the pair “no” forbids.',
      choices: [
        { id: 'a', text: 'Tuesday’s budget meeting runs until 2.', attrs: { monday: false, past: true }, miss: 'Tuesday is outside the group.' },
        { id: 'b', text: 'Monday’s stand-up ends at 9:30.', attrs: { monday: true, past: false }, miss: 'That Monday meeting keeps the sentence true.' },
        { id: 'c', text: 'Monday’s design review runs until 1.', attrs: { monday: true, past: true }, miss: '' },
        { id: 'd', text: 'Friday’s review ends at 11.', attrs: { monday: false, past: false }, miss: 'Friday is outside the group.' }
      ]
    },
    {
      kind: 'break', level: 4,
      ask: 'Which case makes the sentence false?',
      claim: { type: 'all', subject: 'finished', property: 'reply', words: 'Anyone who finished the form got a reply.' },
      hit: 'Cam finished the form and got no reply. One missing reply breaks “anyone.”',
      choices: [
        { id: 'a', text: 'Ned never opened the form and got no reply.', attrs: { finished: false, reply: false }, miss: 'Ned is outside the group. The sentence is about people who finished.' },
        { id: 'b', text: 'Cam finished the form and got no reply.', attrs: { finished: true, reply: false }, miss: '' },
        { id: 'c', text: 'Rae finished the form and got a reply the same day.', attrs: { finished: true, reply: true }, miss: 'Rae fits the sentence.' },
        { id: 'd', text: 'Sol left the form blank and still got a note.', attrs: { finished: false, reply: true }, miss: 'Sol is outside the group. An extra note there leaves “anyone who finished” standing.' }
      ]
    },
    {
      kind: 'break', level: 4,
      ask: 'Which case makes the sentence false?',
      claim: { type: 'all', subject: 'ripe', property: 'soft', words: 'All of the ripe peaches in this bowl are soft.' },
      hit: 'A ripe hard peach in the bowl is enough.',
      choices: [
        { id: 'a', text: 'A green peach in the bowl is hard.', attrs: { ripe: false, soft: false }, miss: 'A green peach is outside the group.' },
        { id: 'b', text: 'A ripe peach in the bowl gives under a thumb.', attrs: { ripe: true, soft: true }, miss: 'That peach fits the sentence.' },
        { id: 'c', text: 'A hard peach is on the counter, outside the bowl.', attrs: { ripe: false, soft: false }, miss: 'The sentence is about ripe peaches in this bowl. A counter peach is outside that group.' },
        { id: 'd', text: 'A ripe peach in the bowl is hard.', attrs: { ripe: true, soft: false }, miss: '' }
      ]
    },
    {
      kind: 'break', level: 4,
      ask: 'Which case makes the sentence false?',
      claim: { type: 'all', subject: 'listed', property: 'eight', words: 'Every password on this list is eight characters.' },
      hit: '“river” is on the list and has five characters.',
      choices: [
        { id: 'a', text: '“paperstar” is eight characters and is not on the list.', attrs: { listed: false, eight: true }, miss: 'A password off the list is outside the group.' },
        { id: 'b', text: '“stonewall” is on the list and is eight characters.', attrs: { listed: true, eight: true }, miss: 'That password fits the sentence.' },
        { id: 'c', text: '“river” is on the list and has five characters.', attrs: { listed: true, eight: false }, miss: '' },
        { id: 'd', text: '“hi” has two characters and is not on the list.', attrs: { listed: false, eight: false }, miss: 'A short password off the list is outside the group.' }
      ]
    },
    {
      kind: 'reply', level: 5,
      ask: 'Which reply gives a reason to drop the reason?',
      passage: 'We should close the pool. Attendance is down.',
      hit: 'The attendance count has another explanation, so “attendance is down” no longer supports closing.',
      choices: [
        { id: 'a', job: 'person', text: 'You never swim.', miss: 'That names the person. The attendance count is untouched.' },
        { id: 'b', job: 'hits', text: 'Attendance is down because the heater has been broken for a month. The count was fine before that.', miss: '' },
        { id: 'c', job: 'topic', text: 'Pools cost a lot to build.', miss: 'Building cost is a new topic. It does not touch this reason.' },
        { id: 'd', job: 'repeat', text: 'Yes, attendance is down.', miss: 'That repeats the reason and leaves it standing.' }
      ]
    },
    {
      kind: 'reply', level: 5,
      ask: 'Which reply gives a reason to drop the reason?',
      passage: 'We should hire another baker. The line is out the door.',
      hit: 'The line has another cause, so it stops being a reason to hire.',
      choices: [
        { id: 'a', job: 'repeat', text: 'The line is long.', miss: 'That repeats the reason.' },
        { id: 'b', job: 'person', text: 'You are bad at scheduling.', miss: 'That names the person.' },
        { id: 'c', job: 'hits', text: 'The line is out the door because the card reader is down, and the order count is the usual one.', miss: '' },
        { id: 'd', job: 'topic', text: 'Bread is popular in this city.', miss: 'Popularity is a new topic here.' }
      ]
    },
    {
      kind: 'reply', level: 5,
      ask: 'Which reply gives a reason to drop the reason?',
      passage: 'Skip the north bridge. The sign says it is closed.',
      hit: 'If the sign is for yesterday’s closure, the sign stops being a reason to skip the bridge today.',
      choices: [
        { id: 'a', job: 'topic', text: 'South bridges have a nicer view.', miss: 'The view is a new topic.' },
        { id: 'b', job: 'hits', text: 'That sign was left up from yesterday. The crew took the barriers down this morning.', miss: '' },
        { id: 'c', job: 'person', text: 'You worry too much.', miss: 'That names the person.' },
        { id: 'd', job: 'repeat', text: 'The sign does say closed.', miss: 'That repeats the reason.' }
      ]
    },
    {
      kind: 'reply', level: 5,
      ask: 'Which reply gives a reason to drop the reason?',
      passage: 'Print the flyer on yellow paper. Yellow got more replies last time.',
      hit: 'Last time the yellow flyer also had a different offer, so the colour is not yet the reason.',
      choices: [
        { id: 'a', job: 'hits', text: 'The yellow flyer last time also carried a half-price offer. The white one did not. The replies may have been about the offer.', miss: '' },
        { id: 'b', job: 'person', text: 'You always fuss over colours.', miss: 'That names the person.' },
        { id: 'c', job: 'topic', text: 'Paper prices went up.', miss: 'Price is a new topic beside this reason.' },
        { id: 'd', job: 'repeat', text: 'Yellow did get more replies.', miss: 'That repeats the reason.' }
      ]
    },
    {
      kind: 'reply', level: 5,
      ask: 'Which reply gives a reason to drop the reason?',
      passage: 'Move the exam to Friday. The room is free on Friday.',
      hit: 'A free room stops being a reason if Friday is already promised to someone else.',
      choices: [
        { id: 'a', job: 'topic', text: 'Exams are stressful.', miss: 'Stress is a new topic here.' },
        { id: 'b', job: 'repeat', text: 'The room is free on Friday.', miss: 'That repeats the reason.' },
        { id: 'c', job: 'person', text: 'You dislike Thursdays.', miss: 'That names the person.' },
        { id: 'd', job: 'hits', text: 'The calendar mark is wrong. Friday’s room is already booked for the choir.', miss: '' }
      ]
    },
    {
      kind: 'reply', level: 5,
      ask: 'Which reply gives a reason to drop the reason?',
      passage: 'Buy the used van. It has lower kilometres than the other one.',
      hit: 'Lower kilometres stop mattering if the odometer was replaced and the history is longer.',
      choices: [
        { id: 'a', job: 'person', text: 'You know nothing about vans.', miss: 'That names the person.' },
        { id: 'b', job: 'hits', text: 'The odometer was replaced at 40,000 km, and the shop record shows 190,000 before that.', miss: '' },
        { id: 'c', job: 'repeat', text: 'It does show fewer kilometres.', miss: 'That repeats the reason.' },
        { id: 'd', job: 'topic', text: 'Vans are useful for moving house.', miss: 'Usefulness is a new topic beside this reason.' }
      ]
    }
  ];

  var coreShapes = ['mp', 'ac', 'mt', 'da', 'all-yes', 'all-back', 'some', 'none'];
  var shapeAt = 0;
  items.forEach(function (item, i) {
    item.id = item.id || ('core-' + i);
    item.pass = item.pass || 1;
    if (item.kind === 'follows') item.shape = coreShapes[shapeAt++];
  });

  return { lessons: lessons, items: items };
});
