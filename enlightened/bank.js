/* Pass 2 and the wider bank. Every follows item carries a shape the checker must agree with. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EnlightenedBank = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function followsItem(shape, passage, given, conclude, reading) {
    return {
      kind: 'follows', level: 3, pass: 2, shape: shape,
      ask: 'Whenever the reasons are true, does the claim have to be true?',
      passage: passage, given: given, conclude: conclude, reading: reading
    };
  }

  var pairs = [
    ['the alarm rings', 'the shop opens', 'alarm', 'open'],
    ['the tank is empty', 'the mower stops', 'tank', 'mower'],
    ['the gate is locked', 'visitors use the lane', 'gate', 'lane'],
    ['the soup boils', 'the lid rattles', 'soup', 'lid'],
    ['the list is signed', 'the parcel goes out', 'list', 'parcel'],
    ['the lane is icy', 'the bus waits', 'icy', 'bus'],
    ['the lamp is plugged in', 'the desk is lit', 'lamp', 'desk'],
    ['the form is complete', 'the desk sends a card', 'form', 'card']
  ];

  var items = [];

  pairs.forEach(function (row) {
    var a = row[0];
    var b = row[1];
    var pa = row[2];
    var pb = row[3];
    items.push(followsItem('mp', 'If ' + a + ', ' + b + '. ' + cap(a) + '. So ' + b + '.',
      [['if', pa, pb], ['yes', pa]], ['yes', pb],
      'The if-part is among the reasons, so the then-part follows.'));
    items.push(followsItem('ac', 'If ' + a + ', ' + b + '. ' + cap(b) + '. So ' + a + '.',
      [['if', pa, pb], ['yes', pb]], ['yes', pa],
      'The then-part can hold another way. It does not hand you the if-part.'));
    items.push(followsItem('mt', 'If ' + a + ', ' + b + '. It is not the case that ' + b + '. So it is not the case that ' + a + '.',
      [['if', pa, pb], ['no', pb]], ['no', pa],
      'The then-part failed, so the if-part failed with it.'));
    items.push(followsItem('da', 'If ' + a + ', ' + b + '. It is not the case that ' + a + '. So it is not the case that ' + b + '.',
      [['if', pa, pb], ['no', pa]], ['no', pb],
      'Denying the if-part leaves the then-part open.'));
  });

  items.push(followsItem('chain',
    'If the alarm rings, the shop opens. If the shop opens, the till is counted. The alarm rings. So the till is counted.',
    [['if', 'alarm', 'open'], ['if', 'open', 'till'], ['yes', 'alarm']], ['yes', 'till'],
    'The then-part of the first sentence is the if-part of the second.'));
  items.push(followsItem('chain',
    'If the tank is empty, the mower stops. If the mower stops, the lawn stays long. The tank is empty. So the lawn stays long.',
    [['if', 'tank', 'mower'], ['if', 'mower', 'long'], ['yes', 'tank']], ['yes', 'long'],
    'The then-part of the first sentence is the if-part of the second.'));
  items.push(followsItem('chain',
    'If the list is signed, the parcel goes out. If the parcel goes out, the customer gets a note. The list is signed. So the customer gets a note.',
    [['if', 'list', 'parcel'], ['if', 'parcel', 'note'], ['yes', 'list']], ['yes', 'note'],
    'The then-part of the first sentence is the if-part of the second.'));
  items.push(followsItem('chain',
    'If the lane is icy, the bus waits. If the bus waits, the class starts late. The lane is icy. So the class starts late.',
    [['if', 'icy', 'bus'], ['if', 'bus', 'late'], ['yes', 'icy']], ['yes', 'late'],
    'The then-part of the first sentence is the if-part of the second.'));

  items.push(followsItem('and-yes',
    'If the alarm rings and the street is dark, the shop stays shut. The alarm rings. The street is dark. So the shop stays shut.',
    [['if', ['and', 'alarm', 'dark'], 'shut'], ['yes', 'alarm'], ['yes', 'dark']], ['yes', 'shut'],
    'Both parts of the if are in hand, so the then-part follows.'));
  items.push(followsItem('and-half',
    'If the alarm rings and the street is dark, the shop stays shut. The alarm rings. So the shop stays shut.',
    [['if', ['and', 'alarm', 'dark'], 'shut'], ['yes', 'alarm']], ['yes', 'shut'],
    'One part of the joint if is still missing. The street may be light.'));
  items.push(followsItem('and-yes',
    'If the soup boils and the lid is on, the lid rattles. The soup boils. The lid is on. So the lid rattles.',
    [['if', ['and', 'soup', 'lid-on'], 'rattle'], ['yes', 'soup'], ['yes', 'lid-on']], ['yes', 'rattle'],
    'Both parts of the if are in hand, so the then-part follows.'));
  items.push(followsItem('and-half',
    'If the soup boils and the lid is on, the lid rattles. The soup boils. So the lid rattles.',
    [['if', ['and', 'soup', 'lid-on'], 'rattle'], ['yes', 'soup']], ['yes', 'rattle'],
    'The lid may be off. One part of the joint if is missing.'));

  items.push(followsItem('or-yes',
    'The alarm rings or the bell rings. The alarm does not ring. So the bell rings.',
    [['or', 'alarm', 'bell'], ['no', 'alarm']], ['yes', 'bell'],
    'One side is out, so the other side is in.'));
  items.push(followsItem('or-keep',
    'The alarm rings or the bell rings. The alarm rings. So the bell does not ring.',
    [['or', 'alarm', 'bell'], ['yes', 'alarm']], ['no', 'bell'],
    'Having one side does not throw out the other. Both can ring.'));
  items.push(followsItem('or-yes',
    'The parcel goes by van or the parcel goes by bike. The parcel does not go by van. So the parcel goes by bike.',
    [['or', 'van', 'bike'], ['no', 'van']], ['yes', 'bike'],
    'One side is out, so the other side is in.'));
  items.push(followsItem('or-keep',
    'The parcel goes by van or the parcel goes by bike. The parcel goes by van. So the parcel does not go by bike.',
    [['or', 'van', 'bike'], ['yes', 'van']], ['no', 'bike'],
    'Having one side does not throw out the other.'));

  items.push(followsItem('most',
    'Most of the tickets are comps. This is one of the tickets. So this ticket is a comp.',
    [['most', 'tickets', 'comps'], ['is', 'this', 'tickets']], ['is', 'this', 'comps'],
    'Most does not cover the ticket in your hand.'));
  items.push(followsItem('most',
    'Most of the jars in the crate are sealed. This is one of the jars. So this jar is sealed.',
    [['most', 'jars', 'sealed'], ['is', 'this', 'jars']], ['is', 'this', 'sealed'],
    'Most does not cover the jar in your hand.'));
  items.push(followsItem('most',
    'Many of the shifts run late. This is one of the shifts. So this shift runs late.',
    [['most', 'shifts', 'late'], ['is', 'this', 'shifts']], ['is', 'this', 'late'],
    'Many does not cover the shift in front of you.'));
  items.push(followsItem('most',
    'Most passwords on the extra sheet are temporary. This password is on the extra sheet. So this password is temporary.',
    [['most', 'extra', 'temp'], ['is', 'this', 'extra']], ['is', 'this', 'temp'],
    'Most does not cover this one password.'));

  function choice(id, text, job, attrs, miss) {
    return { id: id, text: text, job: job, attrs: attrs, miss: miss || '' };
  }

  items.push({
    kind: 'break', level: 4, pass: 2,
    ask: 'Which case makes the sentence false?',
    claim: { type: 'usually', words: 'People who bring a coat are usually warm.' },
    hit: 'Usually survives a single cold person. No case here makes the sentence false.',
    choices: [
      choice('a', 'Sam brought a coat and is cold.', 'decoy', {}, 'One cold person does not make “usually” false.'),
      choice('b', 'Jo brought no coat and is warm.', 'decoy', {}, 'Jo is outside the group.'),
      choice('c', 'None of these cases makes “usually” false.', 'safe', {}, ''),
      choice('d', 'Ada brought a coat and is warm.', 'decoy', {}, 'Ada fits the usual case.')
    ]
  });
  items.push({
    kind: 'break', level: 4, pass: 2,
    ask: 'Which case makes the sentence false?',
    claim: { type: 'usually', words: 'Late trains on this line are usually locals.' },
    hit: 'A single express does not break “usually.”',
    choices: [
      choice('a', 'The 6:10 is late and is an express.', 'decoy', {}, 'One express does not make “usually” false.'),
      choice('b', 'None of these cases makes “usually” false.', 'safe', {}, ''),
      choice('c', 'The 7:00 is late and is a local.', 'decoy', {}, 'That train fits the usual case.'),
      choice('d', 'The 8:00 is on time.', 'decoy', {}, 'An on-time train is outside the group.')
    ]
  });
  items.push({
    kind: 'break', level: 4, pass: 2,
    ask: 'Which list makes the sentence false?',
    claim: { type: 'atLeast', need: 3, words: 'At least three of these five peaches are soft.' },
    hit: 'Two soft peaches is short of three.',
    choices: [
      choice('a', 'Three of the five are soft.', '', { count: 3 }, 'Three meets “at least three.”'),
      choice('b', 'Four of the five are soft.', '', { count: 4 }, 'Four meets the sentence.'),
      choice('c', 'Five of the five are soft.', '', { count: 5 }, 'Five meets the sentence.'),
      choice('d', 'Two of the five are soft.', '', { count: 2 }, '')
    ]
  });
  items.push({
    kind: 'break', level: 4, pass: 2,
    ask: 'Which list makes the sentence false?',
    claim: { type: 'atLeast', need: 3, words: 'At least three of these five forms came back signed.' },
    hit: 'One signed form is short of three.',
    choices: [
      choice('a', 'One of the five came back signed.', '', { count: 1 }, ''),
      choice('b', 'Three of the five came back signed.', '', { count: 3 }, 'Three meets the sentence.'),
      choice('c', 'All five came back signed.', '', { count: 5 }, 'Five meets the sentence.'),
      choice('d', 'Four of the five came back signed.', '', { count: 4 }, 'Four meets the sentence.')
    ]
  });

  items.push({
    kind: 'gap', level: 1, pass: 2,
    ask: 'What is this paragraph missing?',
    passage: 'Bring a coat. Coats have pockets. Blue is a colour.',
    hit: 'Nothing here says why a coat should be brought. It is not an argument yet.',
    choices: [
      choice('a', 'A reason.', 'gap', null, ''),
      choice('b', 'A second claim.', 'extra', null, 'Another claim would still leave it unsupported.'),
      choice('c', 'A longer aside.', 'extra', null, 'More asides still do no work.'),
      choice('d', 'A title.', 'extra', null, 'A title is not a reason.')
    ]
  });
  items.push({
    kind: 'parts', level: 1, pass: 2, askRole: 'claim',
    ask: 'Which sentence is the claim? It is not at the end.',
    hit: 'The claim is in the middle. The late bus is the reason. The colour is an aside.',
    sentences: [
      { id: 'a', role: 'reason', text: 'The bus is late.', miss: 'That sentence is the reason.' },
      { id: 'b', role: 'claim', text: 'Start the meeting without Sam.', miss: '' },
      { id: 'c', role: 'aside', text: 'The chairs are grey.', miss: 'That sentence does no work here.' }
    ]
  });
  items.push({
    kind: 'parts', level: 1, pass: 2, askRole: 'reason',
    ask: 'Which sentence is the reason? No so, because, or therefore.',
    hit: 'The closed kitchen is the reason. The request is the claim.',
    sentences: [
      { id: 'a', role: 'claim', text: 'Eat at the other counter.', miss: 'That sentence is the claim.' },
      { id: 'b', role: 'aside', text: 'Counters have menus.', miss: 'That sentence does no work here.' },
      { id: 'c', role: 'reason', text: 'This kitchen is closed.', miss: '' }
    ]
  });

  items.push({
    kind: 'bridge', level: 2, pass: 2,
    ask: 'The bridge is a definition. Which sentence is it?',
    passage: 'The fish smells sharp, so don’t buy it.',
    hit: 'Sharp, in this argument, means past eating. That definition is the bridge.',
    choices: [
      choice('a', 'A sharp smell means the fish is past eating.', 'bridge'),
      choice('b', 'The fish smells sharp.', 'reason', null, 'That repeats the reason.'),
      choice('c', 'Don’t buy the fish.', 'claim', null, 'That repeats the claim.'),
      choice('d', 'Fish swim in schools.', 'extra', null, 'That can be true and still do no work.')
    ]
  });
  items.push({
    kind: 'bridge', level: 2, pass: 2,
    ask: 'The bridge is given. Which claim does it support?',
    passage: 'If the gate code changed, the side door is the way in.',
    hit: 'The bridge runs from a changed code to the side door.',
    choices: [
      choice('a', 'Use the side door. The gate code changed.', 'bridge'),
      choice('b', 'The gate code changed because you used the side door.', 'reverse', null, 'That runs the bridge backwards.'),
      choice('c', 'Doors have hinges.', 'extra', null, 'Hinges do no work here.'),
      choice('d', 'The gate code changed.', 'reason', null, 'That is only the reason, with no claim attached.')
    ]
  });

  items.push({
    kind: 'steel', level: 5, pass: 2,
    ask: 'Which restatement is the fair version of the other side?',
    passage: 'Close the pool. Attendance is down.',
    hit: 'The fair version keeps their reason and drops the insult.',
    choices: [
      choice('a', 'They want the pool closed because attendance is down.', 'fair'),
      choice('b', 'They hate swimmers.', 'person', null, 'That replaces their reason with a motive.'),
      choice('c', 'Pools are expensive to build.', 'topic', null, 'That changes the subject.'),
      choice('d', 'Attendance is down, so they must be bad at counting.', 'person', null, 'That adds a jab the speaker did not make.')
    ]
  });
  items.push({
    kind: 'steel', level: 5, pass: 2,
    ask: 'Which restatement is the fair version of the other side?',
    passage: 'Hire another baker. The line is out the door.',
    hit: 'The fair version is their claim plus their reason, in plain words.',
    choices: [
      choice('a', 'They cannot manage a kitchen.', 'person', null, 'That names a failing they did not argue.'),
      choice('b', 'They want another baker because the line is out the door.', 'fair'),
      choice('c', 'Bread is popular in this city.', 'topic', null, 'That is a new topic.'),
      choice('d', 'The line is long because they are slow.', 'person', null, 'That adds a cause they did not give.')
    ]
  });
  items.push({
    kind: 'reply', level: 5, pass: 2, want: 'removes',
    ask: 'Two replies land. Which one removes the reason, rather than only weakening it?',
    passage: 'Print the flyer on yellow paper. Yellow got more replies last time.',
    hit: 'The other offer removes colour as the reason. A smaller sample only weakens it.',
    choices: [
      choice('a', 'Last time you only printed twenty yellow flyers, so the count is thin.', 'weakens', null, 'A thin count weakens the reason. It does not remove it.'),
      choice('b', 'You fuss over colours.', 'person', null, 'That names the person.'),
      choice('c', 'The yellow flyer also carried a half-price offer. The white one did not.', 'removes'),
      choice('d', 'Yellow did get more replies.', 'repeat', null, 'That repeats the reason.')
    ]
  });
  items.push({
    kind: 'reply', level: 5, pass: 2,
    ask: 'The replies come in order. Which one is where the reason drops?',
    passage: 'Skip the north bridge. The sign says it is closed. First reply: the south bridge has a view. Second reply: you worry. Third reply: the sign was left up from yesterday, and the barriers came down this morning.',
    hit: 'The third reply takes the sign out of the argument.',
    choices: [
      choice('a', 'The first reply.', 'topic', null, 'A nicer view does not touch the sign.'),
      choice('b', 'The second reply.', 'person', null, 'That names the person.'),
      choice('c', 'The third reply.', 'hits'),
      choice('d', 'None of them. The sign still stands.', 'repeat', null, 'The third reply says the sign is leftover.')
    ]
  });

  items.push({
    kind: 'reply', level: 3, pass: 2, want: 'facts',
    ask: 'The claim follows. Which card makes the reasons true?',
    passage: 'If the alarm rings, the shop opens. The alarm rings. So the shop opens.',
    hit: 'The card has to make both reasons true: the if-then, and that the alarm did ring.',
    given: [['if', 'alarm', 'open'], ['yes', 'alarm']],
    conclude: ['yes', 'open'],
    choices: [
      choice('a', 'The alarm rang at 8, and the rule on the door is that a ringing alarm opens the shop.', 'facts'),
      choice('b', 'The shop is open.', 'claim', null, 'That repeats the claim. It does not show the reasons.'),
      choice('c', 'The alarm is a loud one.', 'extra', null, 'Loudness does not show that it rang, or what the rule is.'),
      choice('d', 'Shops sell newspapers.', 'extra', null, 'That does no work here.')
    ]
  });

  items.push({
    kind: 'parts', level: 1, pass: 2, askRole: 'claim', source: 'casaubon',
    ask: 'In this public-domain paragraph, which sentence is the claim he is urging?',
    hit: 'He wants you to understand what you are a part of. The neglect is the reason he gives.',
    credit: 'Marcus Aurelius, Meditations, Book 2, section I. Translated by Meric Casaubon, 1634. Project Gutenberg ebook 2680.',
    sentences: [
      { id: 'a', role: 'reason', text: 'Thou hast neglected the day and hour set unto thee.', miss: 'That is the reason he gives for speaking now.' },
      { id: 'b', role: 'claim', text: 'It is high time for thee to understand the true nature of the world, whereof thou art a part, and of its Lord.', miss: '' },
      { id: 'c', role: 'aside', text: 'There is a limit of time appointed unto thee.', miss: 'That sets the scene. The urge is to understand.' }
    ]
  });

  items.push({
    kind: 'parts', level: 1, pass: 2, askRole: 'claim', place: 'job',
    ask: 'Which sentence is the claim?',
    hit: 'They want the shift covered. The call-outs are the reason.',
    sentences: [
      { id: 'a', role: 'aside', text: 'Shifts have names.', miss: 'That sentence does no work here.' },
      { id: 'b', role: 'reason', text: 'Two people called out.', miss: 'That sentence is the reason.' },
      { id: 'c', role: 'claim', text: 'Cover the evening shift.', miss: '' }
    ]
  });
  items.push({
    kind: 'parts', level: 1, pass: 2, askRole: 'reason', place: 'home',
    ask: 'Which sentence is the reason?',
    hit: 'The wet floor is why they want the mat down.',
    sentences: [
      { id: 'a', role: 'claim', text: 'Put the mat by the door.', miss: 'That sentence is the claim.' },
      { id: 'b', role: 'reason', text: 'The floor by the door is wet.', miss: '' },
      { id: 'c', role: 'aside', text: 'Mats come in grey.', miss: 'That sentence does no work here.' }
    ]
  });
  items.push({
    kind: 'reply', level: 5, pass: 2, place: 'job',
    ask: 'Which reply gives a reason to drop the reason?',
    passage: 'Send the invoice today. The client asked for it by Friday, and today is Friday.',
    hit: 'If today is Thursday, the Friday deadline is not a reason to send it today.',
    choices: [
      choice('a', 'Today is Thursday. The Friday they named is tomorrow.', 'hits'),
      choice('b', 'You are slow with invoices.', 'person', null, 'That names the person.'),
      choice('c', 'Invoices have numbers.', 'topic', null, 'A number is a new topic.'),
      choice('d', 'The client did ask for Friday.', 'repeat', null, 'That repeats the reason.')
    ]
  });
  items.push({
    kind: 'reply', level: 5, pass: 2, place: 'home',
    ask: 'Which reply gives a reason to drop the reason?',
    passage: 'Skip the market. The forecast says rain all morning.',
    hit: 'A forecast that was replaced this morning is no longer a reason.',
    choices: [
      choice('a', 'Markets sell fruit.', 'topic', null, 'Fruit is a new topic.'),
      choice('b', 'You dislike rain.', 'person', null, 'That names the person.'),
      choice('c', 'The morning update took the rain out. It says clear until noon.', 'hits'),
      choice('d', 'The forecast did say rain.', 'repeat', null, 'That repeats the reason.')
    ]
  });
  items.push({
    kind: 'bridge', level: 2, pass: 2, place: 'job',
    ask: 'Which sentence is the bridge that was left out?',
    passage: 'Two people called out, so cover the evening shift.',
    hit: 'Call-outs support covering the shift only with that if-then.',
    choices: [
      choice('a', 'Two people called out.', 'reason', null, 'That repeats the reason.'),
      choice('b', 'If two people call out, the evening shift should be covered.', 'bridge'),
      choice('c', 'Cover the evening shift.', 'claim', null, 'That repeats the claim.'),
      choice('d', 'Evening comes after noon.', 'extra', null, 'That can be true and still do no work.')
    ]
  });
  items.push({
    kind: 'bridge', level: 2, pass: 2, place: 'home',
    ask: 'Which sentence is the bridge that was left out?',
    passage: 'The floor by the door is wet, so put the mat down.',
    hit: 'A wet floor supports a mat only with that if-then.',
    choices: [
      choice('a', 'If the floor by the door is wet, the mat should go down.', 'bridge'),
      choice('b', 'If the mat goes down, the floor is wet.', 'reverse', null, 'That runs the link backwards.'),
      choice('c', 'The floor is wet.', 'reason', null, 'That repeats the reason.'),
      choice('d', 'Mats are rectangular.', 'extra', null, 'The shape does no work here.')
    ]
  });

  items.forEach(function (item, i) { item.id = item.id || ('bank-' + i); });

  var replyPrompt = {
    passage: 'We should close the pool. Attendance is down.',
    keywords: ['attendance', 'down', 'heater', 'count', 'month']
  };

  return { items: items, replyPrompt: replyPrompt };
});
