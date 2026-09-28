/* ===========================================================================
   CONTACT MODAL — the replacement for the "Book a call" buttons
   ---------------------------------------------------------------------------
   Any element carrying data-contact opens a full contact form in a dialog.
   The attribute's value is the SUBJECT STEM: it is prefilled into the subject
   box with the caret parked at the end, so the visitor finishes the sentence
   instead of facing an empty field.

     <button class="btn primary" data-contact="Speaking at ">Get in touch</button>

   Optional data-contact-source overrides the value sent as `source`; it
   defaults to the first path segment of the page, which is the service slug.

   BACKEND NOTE. lead_server.py whitelists name, email, phone, city, budget,
   message, source, timestamp and ip, and rebuilds the record from exactly
   those keys. A `subject` field would be accepted by the request and then
   silently dropped. So the subject rides at the top of `message`, where it
   reaches the notification email and the leads dashboard intact, and the page
   is tagged into `source`. Nothing here needs a backend change.
   =========================================================================== */
(function () {
  'use strict';

  var ENDPOINT = 'https://ultimateaidirectory.com/api/lead';
  var dlg = null, form = null, opener = null, sending = false;

  function pageSlug() {
    var seg = location.pathname.split('/').filter(Boolean);
    return seg.length ? seg[seg.length - 1].replace(/\.html$/, '') : 'home';
  }

  function build() {
    dlg = document.createElement('div');
    dlg.className = 'cmodal';
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'cmodal-h');
    dlg.innerHTML =
      '<div class="cmodal-back" data-close></div>' +
      '<div class="cmodal-card" role="document">' +
        '<button class="cmodal-x" type="button" data-close aria-label="Close">&times;</button>' +
        '<h2 id="cmodal-h">Send me a note</h2>' +
        '<p class="cmodal-dek">It comes straight to my inbox and I reply personally, usually within one business day.</p>' +
        '<form class="cmodal-form" novalidate>' +
          '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="field"><label for="cm-subject">Subject</label>' +
            '<input id="cm-subject" name="subject" type="text" maxlength="160" required></div>' +
          '<div class="field"><label for="cm-name">Your name</label>' +
            '<input id="cm-name" name="name" type="text" autocomplete="name" maxlength="120" required placeholder="Jane Rivera"></div>' +
          '<div class="field"><label for="cm-email">Your email</label>' +
            '<input id="cm-email" name="email" type="email" autocomplete="email" maxlength="200" required placeholder="you@company.com"></div>' +
          '<div class="field"><label for="cm-msg">Details</label>' +
            '<textarea id="cm-msg" name="message" maxlength="2000" required rows="5" placeholder="Roughly when, roughly how many people, and what you want them to walk away with."></textarea></div>' +
          '<button class="btn primary cmodal-send" type="submit">Send it</button>' +
          '<p class="cmodal-msg" role="status" aria-live="polite"></p>' +
          '<p class="cmodal-fine">Your message and email go to me and nowhere else. No list, no sharing, no automated follow-up.</p>' +
        '</form>' +
        '<div class="cmodal-done" hidden>' +
          '<div class="cmodal-tick" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" width="30" height="30"><path d="M4 12.5l5.2 5.2L20 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '</div>' +
          '<h3>Message sent</h3>' +
          '<p class="cmodal-done-p"></p>' +
          '<button class="btn ghost" type="button" data-close>Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    form = dlg.querySelector('.cmodal-form');

    dlg.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) close();
    });
    form.addEventListener('submit', submit);
    return dlg;
  }

  function open(stem, source, trigger) {
    if (!dlg) build();
    opener = trigger || null;

    form.hidden = false;
    dlg.querySelector('.cmodal-done').hidden = true;
    dlg.querySelector('.cmodal-msg').textContent = '';
    dlg.querySelector('.cmodal-msg').className = 'cmodal-msg';
    var send = dlg.querySelector('.cmodal-send');
    send.disabled = false; send.textContent = 'Send it';
    sending = false;
    form.reset();

    var subj = dlg.querySelector('#cm-subject');
    subj.value = stem || '';
    form.dataset.source = source || pageSlug();

    dlg.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);

    // Caret to the end of the stem, so they type where the sentence stops.
    subj.focus();
    try { subj.setSelectionRange(subj.value.length, subj.value.length); } catch (e) {}
  }

  function close() {
    if (!dlg) return;
    dlg.classList.remove('open');
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    if (opener && opener.focus) opener.focus();
    opener = null;
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    // Focus trap: the dialog is the whole world while it is open.
    var items = dlg.querySelectorAll('button, input, textarea, a[href]');
    var live = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].offsetParent !== null && !items[i].disabled) live.push(items[i]);
    }
    if (!live.length) return;
    var first = live[0], last = live[live.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function say(ok, text) {
    var el = dlg.querySelector('.cmodal-msg');
    el.className = 'cmodal-msg ' + (ok ? 'ok' : 'err');
    el.textContent = text;
  }

  function submit(e) {
    e.preventDefault();
    if (sending) return;

    var subject = form.subject.value.trim();
    var name    = form.name.value.trim();
    var email   = form.email.value.trim();
    var msg     = form.message.value.trim();

    if (!subject) { say(false, 'Add a subject so I know what this is about.'); form.subject.focus(); return; }
    if (!name)    { say(false, 'I need a name to reply to.'); form.name.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say(false, 'That email address does not look right.'); form.email.focus(); return; }
    if (!msg)     { say(false, 'Add a line or two of detail.'); form.message.focus(); return; }

    var send = dlg.querySelector('.cmodal-send');
    sending = true; send.disabled = true; send.textContent = 'Sending';
    say(true, '');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // subject rides inside message: the backend drops unknown keys.
      body: JSON.stringify({
        name: name,
        email: email,
        message: 'Subject: ' + subject + '\n\n' + msg,
        source: 'site:' + form.dataset.source,
        website: form.website.value
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (r) {
      if (!r || !r.success) throw new Error((r && r.error) || 'rejected');
      form.hidden = true;
      var done = dlg.querySelector('.cmodal-done');
      done.querySelector('.cmodal-done-p').textContent =
        'Thanks ' + name.split(' ')[0] + '. It is in my inbox and I will reply to ' + email + ', usually within one business day.';
      done.hidden = false;
      done.querySelector('button').focus();
      if (window.fbq) fbq('track', 'Contact');
      if (window.gtag) gtag('event', 'generate_lead', { method: 'contact_modal', service: form.dataset.source });
    })
    .catch(function () {
      sending = false; send.disabled = false; send.textContent = 'Send it';
      say(false, 'That did not go through. Email me directly at elvin@elvinpeters.com and I will pick it up.');
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-contact]');
    if (!t) return;
    e.preventDefault();
    open(t.getAttribute('data-contact'), t.getAttribute('data-contact-source'), t);
  });

  window.contactModal = { open: open, close: close };
})();
