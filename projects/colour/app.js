/* Colour Match page: quiz onboarding -> selfie -> profile.
   The quiz answers travel with the photo as hints; the photo decides, the answers break ties. */
(function () {
  'use strict';
  const API = window.CM_API || ((location.pathname.replace(/\/[^/]*$/, '') || '') + '/api');
  const $ = (id) => document.getElementById(id);
  const steps = ['welcome', 'quiz', 'upload', 'result'];
  function show(id) { steps.forEach((s) => ($(s).hidden = s !== id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  /* ---------- Quiz ---------- */
  const QUIZ = [
    { key: 'veins', title: 'Look at the veins on the inside of your wrist.', help: 'Daylight helps. Pick the closest.', opts: [
      ['blue', 'Blue or purple', 'cool'], ['green', 'Green', 'warm'], ['mixed', 'A bit of both', 'neutral'], ['unsure', 'Hard to tell', null]] },
    { key: 'jewellery', title: 'Which metal makes your skin look healthier?', help: 'Hold a silver and a gold piece near your face if you can.', opts: [
      ['silver', 'Silver', 'cool'], ['gold', 'Gold', 'warm'], ['both', 'Both look fine', 'neutral']] },
    { key: 'sun', title: 'What does the sun do to your skin?', help: 'Think of a normal summer, no sunscreen for an hour.', opts: [
      ['burn', 'Burns, stays pale', 'cool'], ['burnthen', 'Burns first, then tans', 'neutral'], ['tan', 'Tans easily', 'warm'], ['deep', 'Rarely changes, deep skin', 'deep']] },
    { key: 'hair', title: 'Your natural hair colour, before any dye.', help: 'Childhood photos are the honest answer.', opts: [
      ['ash', 'Ash blonde or light brown, no gold', 'cool'], ['golden', 'Golden blonde, red or auburn', 'warm'], ['brown', 'Medium to dark brown', null], ['black', 'Black or very dark', 'deep']] },
    { key: 'eyes', title: 'Your eye colour.', help: 'The overall impression, not the flecks.', opts: [
      ['blue', 'Blue or grey', 'cool'], ['green', 'Green or hazel', 'warm'], ['amber', 'Light brown or amber', 'warm'], ['dark', 'Dark brown or black', 'deep']] },
    { key: 'compliments', title: 'Which colours get you compliments?', help: 'Optional. Go with your gut.', opts: [
      ['jewel', 'Cool jewel tones: emerald, sapphire, fuchsia', 'cool'], ['earth', 'Warm earth tones: rust, olive, camel', 'warm'], ['soft', 'Soft dusty shades: rose, sage, taupe', 'soft'], ['bright', 'Bright clear colours: red, cobalt, white', 'bright']] }
  ];
  const answers = {};
  let qi = 0;
  $('qtotal').textContent = String(QUIZ.length);

  function guessSoFar() {
    let cool = 0, warm = 0, deep = 0;
    QUIZ.forEach((q) => {
      const a = answers[q.key]; if (!a) return;
      const tag = (q.opts.find((o) => o[0] === a) || [])[2];
      if (tag === 'cool') cool++; else if (tag === 'warm') warm++; else if (tag === 'deep') deep++;
    });
    const undertone = cool === warm ? (cool ? 'neutral' : null) : cool > warm ? 'cool' : 'warm';
    return { undertone: undertone, depth: deep >= 2 ? 'deep' : deep === 1 ? 'medium' : null, cool: cool, warm: warm };
  }
  function renderQ() {
    const q = QUIZ[qi];
    $('qnum').textContent = 'Question ' + (qi + 1);
    $('qtitle').textContent = q.title; $('qhelp').textContent = q.help;
    $('bar').style.width = Math.round((qi / QUIZ.length) * 100) + '%';
    $('qopts').innerHTML = q.opts.map((o) => '<button type="button" class="opt' + (answers[q.key] === o[0] ? ' on' : '') + '" role="radio" aria-checked="' + (answers[q.key] === o[0]) + '" data-v="' + o[0] + '">' + o[1] + '</button>').join('');
    $('back').textContent = qi === 0 ? 'Back to start' : 'Back';
    const g = guessSoFar();
    $('guess').textContent = g.undertone ? 'Leaning ' + g.undertone + (g.depth ? ', ' + g.depth + ' depth' : '') : '';
  }
  $('qopts').addEventListener('click', (e) => {
    const b = e.target.closest('.opt'); if (!b) return;
    answers[QUIZ[qi].key] = b.dataset.v;
    b.classList.add('on');
    setTimeout(() => { if (qi < QUIZ.length - 1) { qi++; renderQ(); } else finishQuiz(); }, 180);
  });
  $('back').addEventListener('click', () => { if (qi === 0) show('welcome'); else { qi--; renderQ(); } });
  $('start').addEventListener('click', () => { qi = 0; renderQ(); show('quiz'); });
  $('skipquiz').addEventListener('click', () => { $('quizsum').textContent = 'No quiz answers, the photo does all the work.'; show('upload'); });
  $('redo').addEventListener('click', () => { qi = 0; renderQ(); show('quiz'); });
  function finishQuiz() {
    const g = guessSoFar();
    $('quizsum').textContent = g.undertone
      ? 'From your answers we lean ' + g.undertone + (g.depth ? ' with ' + g.depth + ' depth' : '') + '. The photo confirms or corrects that.'
      : 'Your answers were mixed, which is common. The photo decides.';
    show('upload');
  }

  /* ---------- Selfie ---------- */
  const file = $('file'), go = $('go'), status = $('status'), preview = $('preview'), drop = document.querySelector('.drop');
  let dataUrl = null;
  function say(msg, err) { status.textContent = msg || ''; status.classList.toggle('err', !!err); }
  function shrink(f) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        const max = 1024, s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image we can read')); };
      img.src = url;
    });
  }
  async function pick(f) {
    if (!f) return;
    try {
      dataUrl = await shrink(f);
      preview.src = dataUrl; preview.hidden = false;
      go.disabled = false; say('Ready. Photo shrunk to ' + Math.round(dataUrl.length * 0.75 / 1024) + ' KB before upload.');
    } catch (e) { dataUrl = null; go.disabled = true; say(e.message, true); }
  }
  file.addEventListener('change', () => pick(file.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => pick(e.dataTransfer.files[0]));

  $('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dataUrl) return;
    go.disabled = true; say('Reading your colouring. This takes about ten seconds.');
    try {
      const r = await fetch(API + '/analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: dataUrl, hints: answers }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Something went wrong');
      render(j.profile);
      say(j.cached ? 'We had seen this photo before, so this is the saved result.' : '');
      history.replaceState(null, '', '?t=' + j.profile.token);
    } catch (err) { say(err.message, true); go.disabled = false; }
  });

  /* ---------- Result ---------- */
  function swatch(s) { return '<div class="sw"><div class="chip" style="background:' + s.hex + '"></div><div class="n">' + esc(s.name) + '</div><div class="h">' + s.hex + '</div></div>'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function list(a) { return (a || []).map(esc).join(', '); }
  function render(p) {
    $('season').textContent = p.season;
    $('summary').textContent = p.summary;
    $('undertone').textContent = p.undertone; $('contrast').textContent = p.contrast; $('depth').textContent = p.depth; $('jewellery').textContent = p.jewellery;
    $('confidence').textContent = Math.round(p.confidence * 100) + '%';
    $('lowconf').hidden = p.confidence >= 0.6;
    const g = guessSoFar();
    $('agree').textContent = g.undertone ? (g.undertone === p.undertone ? 'Your quiz answers pointed the same way (' + g.undertone + ').' : 'Your quiz answers leaned ' + g.undertone + '; the photo says ' + p.undertone + '. Photos win, but a daylight retake settles it.') : '';
    $('best').innerHTML = p.best.map(swatch).join('');
    $('neutrals').innerHTML = p.neutrals.map(swatch).join('');
    $('avoid').innerHTML = p.avoid.map(swatch).join('');
    const m = p.makeup || {};
    $('makeup').innerHTML =
      '<p><b>Foundation undertone:</b> ' + esc(m.foundation_undertone) + '</p>' +
      '<p><b>Lips:</b> ' + list(m.lip) + '</p><p><b>Blush:</b> ' + list(m.blush) + '</p><p><b>Eyes:</b> ' + list(m.eye) + '</p>' +
      '<p><b>Skip:</b> ' + esc(m.avoid) + '</p>';
    $('token').textContent = p.token;
    currentToken = p.token;
    const paid = !!p.paid;
    $('unlock').classList.toggle('paid', paid);
    $('unlock-title').textContent = paid ? 'Extension unlocked' : 'Unlock the shopping extension';
    $('unlock-text').textContent = paid ? 'This key works in the Colour Match extension. Paste it in the popup and open any Sephora, H&M or Zara page.' : 'Your palette above is free. The extension that marks shades on Sephora, H&M and Zara is $19 once, or $4 a month if you would rather try it.';
    $('unlock-status').textContent = (new URLSearchParams(location.search).get('paid') === '1' && !paid) ? 'Payment received, unlocking now. Reload in a few seconds if this line does not change.' : '';
    const link = location.origin + location.pathname + '?t=' + p.token;
    $('plink').textContent = link; $('plink').href = link;
    $('json').textContent = JSON.stringify(p, null, 2);
    show('result');
  }
  let currentToken = null;
  async function buy(plan) {
    if (!currentToken) return;
    $('unlock-status').textContent = 'Opening secure checkout';
    try {
      const r = await fetch(API + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: currentToken, plan: plan }) });
      const j = await r.json();
      if (j.ok && j.url) { location.href = j.url; return; }
      $('unlock-status').textContent = j.already ? 'Already unlocked.' : (j.error || 'Checkout is unavailable right now.');
    } catch (e) { $('unlock-status').textContent = e.message; }
  }
  $('buy-once').addEventListener('click', () => buy('once'));
  $('buy-monthly').addEventListener('click', () => buy('monthly'));
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('token').textContent); $('copy').textContent = 'Copied'; setTimeout(() => ($('copy').textContent = 'Copy'), 1500); } catch (e) { /* select manually */ }
  });
  $('again').addEventListener('click', () => { history.replaceState(null, '', location.pathname); show('welcome'); });

  // Deep link: ?t=<token> reloads a saved profile (no Gemini call).
  const t = new URLSearchParams(location.search).get('t');
  if (t) {
    fetch(API + '/profile', { headers: { Authorization: 'Bearer ' + t } }).then((r) => r.json()).then((j) => { if (j.ok) render(j.profile); else { show('welcome'); } }).catch(() => show('welcome'));
  }
})();
