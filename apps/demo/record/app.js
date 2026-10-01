/* Record Studio — the app. Vanilla JS, hash router, one file.
 *
 * PUBLIC DEMO COPY (card #530). Source: coding/record-studio/public/app.js.
 * Every screen and label is the real app's; the patches below (search "DEMO:")
 * swap the server for window.DEMO (demo-data.js), so this page makes no network
 * calls: no API, no WebSocket, no microphone. The page CSP sets connect-src 'none'.
 */
(() => {
  'use strict';

  /* ---------------- config ---------------- */
  // DEMO: no API base, no WebSocket, no audio worklet.
  const DEMO = window.DEMO;
  const HOME = location.pathname.replace(/\/index\.html$/, '/');

  /* ---------------- utils ---------------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (sec) => { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
  const dur = (sec) => { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`; };
  const fmtDate = (ts) => ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const bytes = (n) => n > 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const parseTime = (s) => { const p = String(s || '').split(':').map(Number); if (p.some(isNaN)) return 0; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0] || 0; };

  let toastTimer = null;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }

  // DEMO: answered in the page by demo-data.js; nothing leaves the browser.
  async function api(path, opts) {
    return DEMO.api(path, opts || {});
  }

  /* ---------------- state ---------------- */
  const state = { user: null, settings: {}, gemini: true, booted: false, recorder: null, view: null, pollTimer: null };
  const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0e1a2b"/><rect x="24" y="12" width="16" height="28" rx="8" fill="#c9a24a"/><path d="M18 30a14 14 0 0 0 28 0" fill="none" stroke="#c9a24a" stroke-width="4" stroke-linecap="round"/><path d="M32 44v8M24 52h16" stroke="#c9a24a" stroke-width="4" stroke-linecap="round"/></svg>';

  /* ---------------- shell ---------------- */
  function shell(content, active) {
    const admin = state.user && state.user.role === 'admin';
    return `
    <header class="topbar"><div class="topbar-inner">
      <a class="brand" href="#/">${LOGO}<span>Record Studio</span></a>${DEMO.badge()}
      <nav class="nav">
        <a href="#/" class="${active === 'home' ? 'active' : ''}">Recordings</a>
        <a href="#/settings" class="${active === 'settings' ? 'active' : ''}">Settings</a>
        ${admin ? `<a href="#/users" class="${active === 'users' ? 'active' : ''}">Team</a>` : ''}
      </nav>
      <span class="spacer"></span>
      <span class="userchip"><span class="small">${esc(state.user.name || state.user.email)}</span><button class="btn sm ghost" id="logout">Sign out</button></span>
    </div></header>
    <main class="main">${DEMO.banner()}${content}</main>
    <footer class="foot">Record Studio · audio and transcripts stay on your own server</footer>`;
  }

  function mount(html) {
    stopPolling();
    $('#app').innerHTML = html;
    const lo = $('#logout');
    if (lo) lo.onclick = () => DEMO.only(); // DEMO: the demo has no sign-in to leave
  }

  function stopPolling() { if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; } }

  /* ---------------- login ---------------- */
  function loginView(msg) {
    $('#app').innerHTML = `
    <div class="login-wrap"><form class="login card" id="loginForm">
      <div class="brand">${LOGO}<span>Record Studio</span></div>
      <p class="tagline">Record the interview. Read it as it happens.</p>
      ${msg ? `<div class="error">${esc(msg)}</div>` : ''}
      <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required autofocus></div>
      <div class="field"><label for="password">Password</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary" style="width:100%" type="submit">Sign in</button>
    </form></div>`;
    $('#loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#loginForm button'); btn.disabled = true;
      try {
        const r = await api('/api/login', { body: { email: $('#email').value, password: $('#password').value }, allow401: true });
        state.user = r.user; state.settings = r.settings || {};
        render();
      } catch (err) { loginView(err.message); }
    };
  }

  /* ---------------- dashboard ---------------- */
  async function dashboardView() {
    const __t = state.renderToken;
    if (__t !== state.renderToken) return;
    mount(shell(`<div class="empty">Loading…</div>`, 'home'));
    const admin = state.user.role === 'admin';
    let recs = [], stats = null;
    try {
      const r = await api('/api/recordings' + (admin ? '?all=1' : ''));
      recs = r.recordings;
      if (admin) stats = await api('/api/admin/stats').catch(() => null);
    } catch (e) { toast(e.message); }

    const rows = (list) => list.length ? list.map(rowHtml).join('') : `<div class="empty">No recordings yet. Start one above.</div>`;
    if (__t !== state.renderToken) return;
    mount(shell(`
      <div class="hero"><div><h1>Recordings</h1><p>Hit start, put the phone or laptop on the table, and ask your questions. The words appear as they are spoken; the full transcript, speakers and summary land a minute after you stop.</p></div></div>
      ${!state.gemini ? `<div class="error">Transcription is not configured on the server (no Gemini key). Recording still works, transcripts will not.</div>` : ''}
      <div class="card">
        <form class="newrec" id="newForm">
          <input class="input" id="newTitle" placeholder="Title, e.g. Interview with the CFO (optional)" maxlength="140" autocomplete="off">
          <button class="btn primary" type="submit">● Start a new recording</button>
          <button class="btn" type="button" id="uploadBtn">Upload an audio file</button>
        </form>
        <div id="uploadZone" class="hidden" style="margin-top:14px">
          <div class="dropzone" id="drop">Drop an audio file here or click to choose (mp3, m4a, wav, webm, ogg, up to 500 MB)</div>
          <input type="file" id="fileInput" accept="audio/*,video/webm,video/mp4" class="hidden">
          <div id="uploadProgress" class="hidden"><div class="small muted" id="uploadText"></div><div class="bar"><i id="uploadBar"></i></div></div>
        </div>
      </div>
      ${stats ? `<div class="stats" style="margin-top:20px">
        <div class="stat"><div class="n">${stats.recordings}</div><div class="l">Recordings</div></div>
        <div class="stat"><div class="n">${Math.round(stats.seconds / 3600 * 10) / 10}</div><div class="l">Hours recorded</div></div>
        <div class="stat"><div class="n">${stats.users}</div><div class="l">Team members</div></div>
        <div class="stat"><div class="n">${stats.live}</div><div class="l">Live now</div></div>
        <div class="stat"><div class="n">${stats.diskFree ? Math.round(stats.diskFree / 1e9) + ' GB' : '—'}</div><div class="l">Disk free</div></div>
      </div>` : ''}
      <div class="toolbar"><input class="input" id="search" placeholder="Search titles, transcripts and notes" autocomplete="off"><span class="small muted" id="count">${recs.length} recording${recs.length === 1 ? '' : 's'}</span></div>
      <div class="list" id="list">${rows(recs)}</div>
    `, 'home'));

    $('#newForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#newForm button[type=submit]'); btn.disabled = true;
      try {
        const r = await api('/api/recordings', { body: { title: $('#newTitle').value, source: 'live' } });
        location.hash = `#/rec/${r.recording.id}?start=1`;
      } catch (err) { toast(err.message); btn.disabled = false; }
    };
    $('#uploadBtn').onclick = () => { $('#uploadZone').classList.toggle('hidden'); };
    const drop = $('#drop'), fileInput = $('#fileInput');
    // DEMO: no file is opened or read; the dropzone shows the demo note instead.
    drop.onclick = () => DEMO.only();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); DEMO.only(); };
    fileInput.onchange = () => { fileInput.value = ''; DEMO.only(); };

    let searchTimer = null;
    $('#search').oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          const q = $('#search').value.trim();
          const r = await api('/api/recordings?q=' + encodeURIComponent(q) + (admin ? '&all=1' : ''));
          $('#list').innerHTML = rows(r.recordings);
          $('#count').textContent = `${r.recordings.length} recording${r.recordings.length === 1 ? '' : 's'}`;
        } catch (e) { toast(e.message); }
      }, 250);
    };
  }

  function statusPill(r) {
    const map = { recording: ['rec', 'Recording'], processing: ['info', 'Processing'], ready: ['ok', 'Ready'], failed: ['rec', 'Failed'], draft: ['', 'Not started'], interrupted: ['gold', 'Interrupted'], uploading: ['info', 'Uploading'] };
    const [cls, label] = map[r.status] || ['', r.status];
    return `<span class="pill ${cls}">${cls === 'rec' && r.status === 'recording' ? '<i class="dot"></i>' : ''}${label}</span>`;
  }
  function rowHtml(r) {
    const meta = [fmtDate(r.started_at || r.created_at)];
    if (r.duration_s) meta.push(dur(r.duration_s)); else if (r.live_seconds) meta.push(dur(r.live_seconds));
    if (r.word_count) meta.push(`${r.word_count.toLocaleString()} words`);
    if (r.speaker_count) meta.push(`${r.speaker_count} speaker${r.speaker_count === 1 ? '' : 's'}`);
    if (r.source === 'upload') meta.push('uploaded');
    const owner = r.owner_name ? `<span class="pill ${r.mine ? 'gold' : 'info'}" title="Recorded by">${esc(r.mine ? 'Me' : r.owner_name)}</span> ` : '';
    return `<a class="row" href="#/rec/${r.id}"><div><div class="title">${esc(r.title || 'Untitled recording')}</div><div class="meta">${meta.map(esc).join('<span>·</span>')}</div></div><div class="pills">${owner}${statusPill(r)}</div></a>`;
  }

  /* ---------------- upload + recorder engine ---------------- */
  // DEMO: uploadFile and the Recorder class (microphone, WebSocket, chunk upload)
  // are replaced by a player that replays a timed caption script (demo-data.js).
  const Recorder = DEMO.Recorder;

  /* ---------------- recording view ---------------- */
  async function recordingView(id, params) {
    const __t = state.renderToken;
    if (__t !== state.renderToken) return;
    mount(shell(`<div class="empty">Loading…</div>`, 'home'));
    let data;
    try { data = await api(`/api/recordings/${id}`); }
    catch (e) { return mount(shell(`<div class="card"><h2>Not found</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back</a></div>`, 'home')); }
    const rec = data.recording;
    if (['draft', 'recording', 'interrupted'].includes(rec.status) && !rec.live) return recorderUI(rec, data, params.get('start') === '1');
    if (rec.status === 'recording' && rec.live) return recorderUI(rec, data, false, true);
    if (rec.status === 'processing' || rec.status === 'uploading') return processingUI(rec, data);
    if (rec.status === 'ready') return resultUI(rec, data);
    if (rec.status === 'failed') return failedUI(rec, data);
    return mount(shell(`<div class="card">Unknown status ${esc(rec.status)}</div>`, 'home'));
  }

  function headHtml(rec, pills) {
    return `<div class="rec-head">
      <div><a class="small muted" href="#/">← Recordings</a><h1 class="inline-edit" id="title" contenteditable="true" spellcheck="false" data-placeholder="Untitled recording">${esc(rec.title || 'Untitled recording')}</h1><div class="small muted">${esc(fmtDate(rec.started_at || rec.created_at))}${rec.duration_s ? ' · ' + esc(dur(rec.duration_s)) : ''}</div></div>
      <div class="pills">${pills || ''}</div></div>`;
  }
  function wireTitle(rec) {
    const t = $('#title');
    if (!t) return;
    t.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } };
    t.onblur = async () => {
      const title = t.textContent.trim().slice(0, 140);
      if (title === (rec.title || 'Untitled recording') || (!title && !rec.title)) { if (!title) t.textContent = 'Untitled recording'; return; }
      try { const r = await api(`/api/recordings/${rec.id}`, { method: 'PATCH', body: { title } }); rec.title = r.recording.title; if (!title) t.textContent = 'Untitled recording'; toast('Title saved'); } catch (e) { toast(e.message); }
    };
  }

  function uttHtml(u, seekable) {
    return `<div class="utt" data-seq="${u.seq}"><span class="t" ${seekable ? `data-t="${u.t0}"` : ''}>${clock(u.t0)}</span><span class="x">${esc(u.text)}</span></div>`;
  }
  function markerHtml(m) {
    return `<div class="utt marker" data-mid="${m.id}"><span class="t">${clock(m.t)}</span><span class="x">⚑ ${esc(m.text || 'Flagged moment')}</span></div>`;
  }

  async function recorderUI(rec, data, autostart, liveElsewhere) {
    const __t = state.renderToken;
    let utts = [];
    try { utts = (await api(`/api/recordings/${rec.id}/utterances`)).utterances; } catch {}
    const markers = data.markers || [];
    const interrupted = rec.status === 'interrupted' || (rec.status === 'recording' && !rec.live);
    if (__t !== state.renderToken) return;
    mount(shell(`
      ${headHtml(rec, `<span class="pill" id="pillState">${interrupted ? 'Interrupted' : 'Ready to record'}</span>`)}
      ${liveElsewhere ? `<div class="notice">This recording is live in another tab or device. Starting here will take over the live stream.</div>` : ''}
      ${interrupted ? `<div class="notice">This recording was interrupted (a reload or a lost connection). Press the button to keep recording into the same session, or finish it now to get the transcript of what you have.</div>` : ''}
      <div class="split">
        <div class="card stage">
          <button class="recbtn" id="recBtn" aria-label="Start recording" title="Start recording"><span class="core"></span></button>
          <div class="timer" id="timer">${clock(rec.live_seconds || 0)}</div>
          <div class="meter"><i id="meter"></i></div>
          <div class="status-list">
            <div class="status-item" id="stMic"><b>Microphone</b><span class="v">${interrupted ? 'paused' : 'off'}</span></div>
            <div class="status-item" id="stLive"><b>Live captions</b><span class="v">idle</span></div>
            <div class="status-item" id="stArchive"><b>Saving audio</b><span class="v">idle</span></div>
          </div>
          <div class="btn-row" style="justify-content:center">
            <button class="btn" id="markBtn" disabled title="Flag this moment (M)">⚑ Flag moment</button>
            <button class="btn primary hidden" id="stopBtn">■ Stop &amp; transcribe</button>
            ${interrupted ? `<button class="btn" id="finishBtn">Finish without more recording</button>` : ''}
          </div>
          <p class="small muted" style="margin:14px 0 0">Keep this tab open while recording. Audio is saved to the server every five seconds, so a dropped connection or a dead battery loses at most a few seconds.</p>
        </div>
        <div class="card">
          <div class="rec-head" style="margin-bottom:6px"><h3>Live transcript</h3><span class="small muted" id="wordCount"></span></div>
          <div class="transcript" id="transcript">
            ${utts.map((u) => uttHtml(u)).join('')}
            ${markers.map(markerHtml).join('')}
            <div class="utt interim hidden" id="interim"><span class="t"></span><span class="x"></span></div>
            ${!utts.length ? `<div class="empty" id="emptyHint">Words will appear here a second or two after they are spoken.</div>` : ''}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:18px"><h3>Notes</h3><textarea class="input" id="notes" placeholder="Questions to ask, names to check, anything you want next to the transcript. Saved automatically.">${esc(rec.notes || '')}</textarea></div>
    `, 'home'));
    wireTitle(rec);
    wireNotes(rec);

    const tEl = $('#transcript'), interimEl = $('#interim');
    const seen = new Set(utts.map((u) => u.seq));
    const ui = {
      onInterim(text, t0) {
        interimEl.classList.remove('hidden');
        $('.t', interimEl).textContent = clock(t0);
        $('.x', interimEl).textContent = text;
        const hint = $('#emptyHint'); if (hint) hint.remove();
        tEl.scrollTop = tEl.scrollHeight;
      },
      onFinal(u) {
        if (seen.has(u.seq)) return; seen.add(u.seq);
        interimEl.classList.add('hidden');
        interimEl.insertAdjacentHTML('beforebegin', uttHtml(u));
        const hint = $('#emptyHint'); if (hint) hint.remove();
        const words = $$('.utt:not(.interim):not(.marker) .x', tEl).reduce((n, el) => n + el.textContent.split(/\s+/).filter(Boolean).length, 0);
        $('#wordCount').textContent = `${words.toLocaleString()} words`;
        tEl.scrollTop = tEl.scrollHeight;
      },
      onMarker(m) { interimEl.insertAdjacentHTML('beforebegin', markerHtml(m)); tEl.scrollTop = tEl.scrollHeight; toast('Moment flagged at ' + clock(m.t)); },
      onLive(s, msg) {
        const el = $('#stLive .v');
        const map = { connecting: 'connecting…', live: 'on', reconnecting: 'reconnecting…', error: 'error' + (msg ? ': ' + msg : ''), stopped: 'off' };
        el.textContent = map[s] || s;
        $('#stLive').classList.toggle('warn', s === 'error' || s === 'reconnecting');
      },
      onArchive() {
        const r = state.recorder; if (!r) return;
        const el = $('#stArchive .v');
        if (r.archiveError) { el.textContent = r.archiveError; $('#stArchive').classList.add('warn'); return; }
        const pending = r.uploadQueue.length;
        el.textContent = pending > 1 ? `${pending} chunks waiting (${bytes(r.uploadedBytes)} saved)` : `${bytes(r.uploadedBytes)} saved`;
        $('#stArchive').classList.toggle('warn', r.uploadFailures > 2);
      },
      requestStop() { $('#stopBtn').click(); },
    };

    const recBtn = $('#recBtn'), stopBtn = $('#stopBtn'), markBtn = $('#markBtn');
    let timerId = null;
    async function begin() {
      recBtn.disabled = true;
      $('#stMic .v').textContent = DEMO.COPY.mic; // DEMO: the microphone is never opened
      try {
        const settings = Object.assign({}, state.settings, rec.settings || {});
        const r = new Recorder(rec, settings, ui);
        state.recorder = r;
        await r.start();
        recBtn.classList.add('on'); recBtn.disabled = false; recBtn.setAttribute('aria-label', 'Recording');
        stopBtn.classList.remove('hidden'); markBtn.disabled = false;
        const fb = $('#finishBtn'); if (fb) fb.classList.add('hidden');
        $('#pillState').outerHTML = `<span class="pill rec" id="pillState"><i class="dot"></i>Recording</span>`;
        $('#stMic .v').textContent = DEMO.COPY.mic;
        timerId = setInterval(() => {
          $('#timer').textContent = clock(r.elapsed);
          $('#meter').style.width = `${Math.min(100, Math.round(Math.sqrt(r.level) * 100))}%`;
          r.level *= 0.6;
        }, 100);
      } catch (e) {
        recBtn.disabled = false; state.recorder = null;
        $('#stMic .v').textContent = 'blocked';
        toast(e.name === 'NotAllowedError' ? 'Microphone permission was refused. Allow it in the browser and try again.' : e.message, 6000);
      }
    }
    async function finish() {
      const r = state.recorder;
      stopBtn.disabled = true; recBtn.disabled = true; markBtn.disabled = true;
      stopBtn.textContent = 'Finishing…';
      clearInterval(timerId);
      let left = 0;
      if (r) { left = await r.stop(); state.recorder = null; }
      if (left) toast(`${left} audio chunk(s) could not be uploaded; the live stream copy will be used.`, 6000);
      try {
        await api(`/api/recordings/${rec.id}/stop`, { method: 'POST', body: {} });
        location.hash = `#/rec/${rec.id}`;
        render();
      } catch (e) { toast(e.message, 6000); stopBtn.disabled = false; stopBtn.textContent = '■ Stop & transcribe'; }
    }
    recBtn.onclick = () => { if (state.recorder && state.recorder.running) { if (confirm('Stop recording and build the transcript?')) finish(); } else begin(); };
    stopBtn.onclick = () => { if (confirm('Stop recording and build the transcript?')) finish(); };
    markBtn.onclick = () => { if (state.recorder) state.recorder.marker(''); };
    const fb = $('#finishBtn'); if (fb) fb.onclick = finish;
    document.onkeydown = (e) => { if (e.key.toLowerCase() === 'm' && !/input|textarea/i.test(e.target.tagName) && !e.target.isContentEditable && state.recorder) { e.preventDefault(); state.recorder.marker(''); } };
    if (autostart) begin();
  }

  function wireNotes(rec) {
    const n = $('#notes'); if (!n) return;
    let t = null;
    const save = async () => { try { await api(`/api/recordings/${rec.id}`, { method: 'PATCH', body: { notes: n.value } }); rec.notes = n.value; } catch (e) { toast(e.message); } };
    n.oninput = () => { clearTimeout(t); t = setTimeout(save, 1200); };
    n.onblur = () => { clearTimeout(t); if (n.value !== (rec.notes || '')) save(); };
  }

  async function processingUI(rec, data) {
    const __t = state.renderToken;
    let utts = [];
    try { utts = (await api(`/api/recordings/${rec.id}/utterances`)).utterances; } catch {}
    const phaseText = (p) => {
      if (!p) return rec.status === 'uploading' ? 'Upload in progress…' : 'Queued for processing…';
      const m = { processing: 'Building the master audio', transcribing: 'Transcribing with speaker detection', summarizing: 'Writing the summary and pulling quotes', ready: 'Done', failed: 'Failed' };
      return (m[p.phase] || p.phase) + (p.detail ? ` (${p.detail})` : '');
    };
    if (__t !== state.renderToken) return;
    mount(shell(`
      ${headHtml(rec, `<span class="pill info">Processing</span>`)}
      <div class="progress"><div class="spinner"></div><div><b>Turning the recording into a transcript.</b><div class="small" id="phase">${esc(phaseText(data.phase))}</div><div class="small">About a minute per half hour of audio. You can leave this page; it will be ready when you come back.</div></div></div>
      <div class="card" style="margin-top:18px"><h3>Live transcript (draft)</h3><div class="transcript">${utts.length ? utts.map((u) => uttHtml(u)).join('') : '<div class="empty">No live captions were captured for this recording.</div>'}</div></div>
    `, 'home'));
    wireTitle(rec);
    state.pollTimer = setInterval(async () => {
      try {
        const d = await api(`/api/recordings/${rec.id}`);
        const el = $('#phase'); if (el) el.textContent = phaseText(d.phase);
        if (d.recording.status !== 'processing' && d.recording.status !== 'uploading') { stopPolling(); render(); }
      } catch {}
    }, 3000);
  }

  function failedUI(rec, data) {
    const __t = state.renderToken;
    if (__t !== state.renderToken) return;
    mount(shell(`
      ${headHtml(rec, `<span class="pill rec">Failed</span>`)}
      <div class="error"><b>Processing failed.</b> ${esc(rec.error || 'Unknown error')}</div>
      <div class="btn-row"><button class="btn primary" id="retry">Try again</button><button class="btn danger" id="del">Delete recording</button></div>
    `, 'home'));
    wireTitle(rec);
    $('#retry').onclick = async () => { try { await api(`/api/recordings/${rec.id}/reprocess`, { method: 'POST', body: {} }); render(); } catch (e) { toast(e.message); } };
    $('#del').onclick = () => deleteRec(rec);
  }

  async function deleteRec(rec) {
    if (!confirm(`Delete "${rec.title || 'Untitled recording'}" and its audio? This cannot be undone.`)) return;
    try { await api(`/api/recordings/${rec.id}`, { method: 'DELETE' }); location.hash = '#/'; } catch (e) { toast(e.message); }
  }

  /* ---------------- result view ---------------- */
  const SPK_COLORS = 6;
  function spkClass(spk) { const n = parseInt(String(spk).replace(/\D/g, ''), 10) || 1; return `spk-${((n - 1) % SPK_COLORS) + 1}`; }
  function spkName(spk, speakers) { const s = speakers && speakers[spk]; if (s && s.name) return s.name; return `Speaker ${String(spk).replace(/\D/g, '')}`; }

  async function resultUI(rec, data) {
    const __t = state.renderToken;
    let final;
    try { final = await api(`/api/recordings/${rec.id}/transcript`); }
    catch (e) { return mount(shell(`<div class="card"><h2>${esc(rec.title)}</h2><div class="error">${esc(e.message)}</div></div>`, 'home')); }
    const speakers = rec.speakers || {};
    const summary = rec.summary && !rec.summary.error ? rec.summary : null;
    const labels = []; for (const s of final.segments) if (!labels.includes(s.spk)) labels.push(s.spk);
    const audioUrl = DEMO.audioUrl(final.duration); // DEMO: silent placeholder audio made in the page
    const shareUrl = (t) => `${location.origin}${HOME}#/share/${t}`;
    // DEMO: exports are built in the browser from the sample, same formats as lib/exports.js.
    const exportBtn = (f, label) => `<button class="btn sm" data-export="${f}">${label}</button>`;

    if (__t !== state.renderToken) return;

    mount(shell(`
      ${headHtml(rec, `<span class="pill ok">Ready</span><span class="pill">${labels.length} speaker${labels.length === 1 ? '' : 's'}</span><span class="pill">${(rec.word_count || 0).toLocaleString()} words</span>`)}
      <div class="player"><audio id="audio" controls preload="metadata" src="${audioUrl}"></audio><div class="small muted">${esc(DEMO.COPY.audioNote)}</div></div>
      <div class="split" style="grid-template-columns:1fr 380px">
        <div>
          ${summary ? `<div class="card summary">
            <div class="rec-head" style="margin-bottom:6px"><div class="label">Summary</div><span class="small muted">Click any text to edit. Saves when you click away.</span></div>
            <p class="editable" id="sumText" contenteditable="true" spellcheck="true">${esc(summary.summary)}</p>
            <div class="label">Key points</div><ul class="editable" id="sumPoints" contenteditable="true">${(summary.keyPoints || []).map((k) => `<li>${esc(k)}</li>`).join('') || '<li></li>'}</ul>
            ${summary.quotes && summary.quotes.length ? `<div class="label">Quotes</div>${summary.quotes.map((q) => `<div class="quote" data-t="${parseTime(q.time)}"><div class="q">“${esc(q.quote)}”</div><div class="who">${esc(q.speaker)} · ${esc(q.time)}</div></div>`).join('')}` : ''}
            <div class="label">Follow-ups</div><ul class="editable" id="sumActions" contenteditable="true">${(summary.actionItems || []).map((a) => `<li>${esc(a)}</li>`).join('') || '<li></li>'}</ul>
            ${summary.topics && summary.topics.length ? `<div class="label">Topics</div><div class="chips">${summary.topics.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>` : (rec.summary && rec.summary.error ? `<div class="notice">Summary unavailable: ${esc(rec.summary.error)}. Use “Process again” to retry.</div>` : '')}
          <div class="card" ${summary ? 'style="margin-top:18px"' : ''}>
            <div class="rec-head" style="margin-bottom:8px"><div><h3>Transcript</h3><span class="small muted">Click a line to fix words; change the speaker from the dropdown. Every export follows your edits.</span></div><input class="input" id="find" placeholder="Find in transcript" style="max-width:260px;min-height:40px"></div>
            <div class="transcript" id="segments" style="max-height:none">${final.segments.map((s, i) => segHtml(s, i, speakers, labels)).join('')}</div>
          </div>
        </div>
        <div>
          <div class="card"><h3>Speakers</h3><p class="small muted">Name them once; every export updates.</p>
            <div class="speakers" style="grid-template-columns:1fr">${labels.map((l) => `<label class="speaker ${spkClass(l)}"><span class="swatch"></span><input class="input" data-spk="${l}" value="${esc((speakers[l] && speakers[l].name) || '')}" placeholder="${esc((speakers[l] && speakers[l].guess) ? 'Maybe: ' + speakers[l].guess : 'Speaker ' + l.replace(/\D/g, ''))}" style="min-height:40px"></label>`).join('')}</div>
          </div>
          <div class="card"><h3>Export</h3><div class="exports" id="gdocBox">${rec.google_doc_url ? `<button class="btn sm primary" id="gdocOpen">Open Google Doc</button><button class="btn sm" id="gdocRedo">Re-create Google Doc</button>` : `<button class="btn sm primary" id="gdocMake">Google Doc (2 tabs)</button>`}</div><div class="exports" id="exportBox" style="margin-top:8px">${exportBtn('docx', 'Word')}${exportBtn('txt', 'Text')}${exportBtn('md', 'Markdown')}${exportBtn('srt', 'SRT')}${exportBtn('vtt', 'VTT')}${exportBtn('json', 'JSON')}${exportBtn('mp3', 'MP3 audio')}</div></div>
          <div class="card"><h3>Flagged moments</h3><div class="markers" id="markers">${(data.markers || []).length ? data.markers.map(markerRow).join('') : '<div class="small muted">None flagged during the recording.</div>'}</div></div>
          <div class="card"><h3>Notes</h3><textarea class="input" id="notes" placeholder="Saved automatically.">${esc(rec.notes || '')}</textarea></div>
          <div class="card"><h3>Share</h3><p class="small muted">A read-only link with the audio, summary and transcript. Anyone with the link can open it; turn it off any time.</p>
            <div id="shareBox">${rec.share_token ? `<input class="input" readonly value="${esc(shareUrl(rec.share_token))}" id="shareLink" style="margin-bottom:10px"><div class="btn-row"><button class="btn sm" id="copyShare">Copy link</button><button class="btn sm danger" id="shareOff">Turn off</button></div>` : `<button class="btn sm" id="shareOn">Create share link</button>`}</div>
          </div>
          <div class="card"><h3>Housekeeping</h3><p class="small muted">Engine: ${esc(final.engine && final.engine.batch)} · audio from ${esc(final.source)} · ${final.windows} window${final.windows === 1 ? '' : 's'}</p>
            <div class="btn-row"><button class="btn sm" id="reprocess">Process again</button><button class="btn sm danger" id="del">Delete</button></div></div>
        </div>
      </div>
    `, 'home'));
    wireTitle(rec); wireNotes(rec);

    const audio = $('#audio');
    const seek = (t) => { if (!Number.isFinite(t)) return; audio.currentTime = Math.max(0, t); audio.play().catch(() => {}); };
    $('#segments').onclick = (e) => { const t = e.target.closest('[data-t]'); if (t) seek(parseFloat(t.dataset.t)); };
    $$('.quote').forEach((q) => { q.onclick = () => seek(parseFloat(q.dataset.t)); });
    $('#markers').onclick = (e) => { const t = e.target.closest('.t[data-t]'); if (t) seek(parseFloat(t.dataset.t)); };
    let lastActive = null;
    audio.ontimeupdate = () => {
      const t = audio.currentTime;
      const segs = final.segments; let idx = -1;
      for (let i = 0; i < segs.length; i++) { if (segs[i].t0 <= t + 0.2) idx = i; else break; }
      if (idx !== lastActive) { if (lastActive != null) { const p = $(`.seg[data-i="${lastActive}"]`); if (p) p.classList.remove('active'); } const el = $(`.seg[data-i="${idx}"]`); if (el) el.classList.add('active'); lastActive = idx; }
    };
    $$('input[data-spk]').forEach((inp) => {
      let t = null;
      inp.oninput = () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const body = { speakers: {} }; body.speakers[inp.dataset.spk] = { name: inp.value };
          try {
            const r = await api(`/api/recordings/${rec.id}`, { method: 'PATCH', body });
            rec.speakers = r.recording.speakers;
            $$(`.spk-sel option[value="${inp.dataset.spk}"]`).forEach((el) => { el.textContent = spkName(inp.dataset.spk, rec.speakers); });
          } catch (e) { toast(e.message); }
        }, 500);
      };
    });
    $('#find').oninput = () => {
      const q = $('#find').value.trim().toLowerCase();
      $$('.seg').forEach((el) => { el.style.display = !q || el.textContent.toLowerCase().includes(q) ? '' : 'none'; });
    };
    $('#markers').oninput = (e) => {
      const inp = e.target.closest('input[data-mid]'); if (!inp) return;
      clearTimeout(inp._t);
      inp._t = setTimeout(() => api(`/api/recordings/${rec.id}/markers/${inp.dataset.mid}`, { method: 'PATCH', body: { text: inp.value } }).catch((err) => toast(err.message)), 600);
    };
    const wireShare = () => {
      const on = $('#shareOn'), off = $('#shareOff'), copy = $('#copyShare');
      if (on) on.onclick = async () => { try { const r = await api(`/api/recordings/${rec.id}/share`, { method: 'POST', body: {} }); rec.share_token = r.share_token; $('#shareBox').innerHTML = `<input class="input" readonly value="${esc(shareUrl(r.share_token))}" id="shareLink" style="margin-bottom:10px"><div class="btn-row"><button class="btn sm" id="copyShare">Copy link</button><button class="btn sm danger" id="shareOff">Turn off</button></div>`; wireShare(); } catch (e) { toast(e.message); } };
      if (off) off.onclick = async () => { try { await api(`/api/recordings/${rec.id}/share`, { method: 'DELETE' }); rec.share_token = null; $('#shareBox').innerHTML = `<button class="btn sm" id="shareOn">Create share link</button>`; wireShare(); } catch (e) { toast(e.message); } };
      if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText($('#shareLink').value); toast('Link copied'); } catch { $('#shareLink').select(); } };
    };
    wireShare();
    // ---- editing: summary
    const saveSummary = async (body) => { try { const r = await api(`/api/recordings/${rec.id}/summary`, { method: 'PATCH', body }); rec.summary = r.recording.summary; toast('Saved'); } catch (e) { toast(e.message); } };
    const liTexts = (ul) => $$('li', ul).map((li) => li.textContent.trim()).filter(Boolean);
    const st = $('#sumText'); if (st) st.onblur = () => { const v = st.textContent.trim(); if (v !== (rec.summary.summary || '')) saveSummary({ summary: v }); };
    const sp = $('#sumPoints'); if (sp) sp.onblur = () => { const v = liTexts(sp); if (JSON.stringify(v) !== JSON.stringify(rec.summary.keyPoints || [])) saveSummary({ keyPoints: v }); };
    const sa = $('#sumActions'); if (sa) sa.onblur = () => { const v = liTexts(sa); if (JSON.stringify(v) !== JSON.stringify(rec.summary.actionItems || [])) saveSummary({ actionItems: v }); };
    // ---- editing: transcript lines + speakers
    const saveSegments = async (edits) => {
      try { await api(`/api/recordings/${rec.id}/segments`, { method: 'PATCH', body: { edits } }); toast('Saved'); }
      catch (e) { toast(e.message); }
    };
    $('#segments').addEventListener('focusout', (e) => {
      const x = e.target.closest('.x[contenteditable]'); if (!x) return;
      const seg = x.closest('.seg'); const i = parseInt(seg.dataset.i, 10);
      const v = x.textContent.replace(/\s+/g, ' ').trim();
      if (v && v !== final.segments[i].text) { final.segments[i].text = v; saveSegments([{ i, text: v }]); }
      else if (!v) x.textContent = final.segments[i].text;
    });
    $('#segments').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.closest('.x[contenteditable]')) { e.preventDefault(); e.target.blur(); } });
    $('#segments').addEventListener('change', (e) => {
      const sel = e.target.closest('.spk-sel'); if (!sel) return;
      const i = parseInt(sel.dataset.i, 10); const seg = sel.closest('.seg');
      final.segments[i].spk = sel.value; seg.dataset.spk = sel.value;
      seg.className = `seg ${spkClass(sel.value)}`;
      saveSegments([{ i, spk: sel.value }]);
    });
    // ---- Google Doc
    // DEMO: the Google Doc opens as an in-page preview of the same two tabs lib/gdocs.js writes.
    const docArgs = () => ({ rec, final, speakers: rec.speakers || {}, summary: rec.summary && !rec.summary.error ? rec.summary : null, markers: data.markers || [] });
    const wireGdoc = () => {
      const op = $('#gdocOpen'); if (op) op.onclick = () => DEMO.showGdoc(docArgs());
      const mk = $('#gdocMake') || $('#gdocRedo'); if (!mk) return;
      mk.onclick = async () => {
        mk.disabled = true; mk.textContent = 'Creating in Google Docs…';
        try {
          const r = await api(`/api/recordings/${rec.id}/google-doc`, { method: 'POST', body: {} });
          rec.google_doc_url = r.url;
          $('#gdocBox').innerHTML = `<button class="btn sm primary" id="gdocOpen">Open Google Doc</button><button class="btn sm" id="gdocRedo">Re-create Google Doc</button>`;
          wireGdoc(); DEMO.showGdoc(docArgs());
        } catch (e) { toast(e.message, 7000); mk.disabled = false; mk.textContent = rec.google_doc_url ? 'Re-create Google Doc' : 'Google Doc (2 tabs)'; }
      };
    };
    wireGdoc();
    $('#exportBox').onclick = (e) => { const b = e.target.closest('[data-export]'); if (b) DEMO.download(b.dataset.export, docArgs()); };
    $('#reprocess').onclick = async () => { if (!confirm('Run transcription and summary again? Speaker names are kept.')) return; try { await api(`/api/recordings/${rec.id}/reprocess`, { method: 'POST', body: {} }); render(); } catch (e) { toast(e.message); } };
    $('#del').onclick = () => deleteRec(rec);
  }

  function segHtml(s, i, speakers, labels) {
    const who = labels && labels.length
      ? `<select class="spk-sel n" data-i="${i}" aria-label="Speaker">${labels.map((l) => `<option value="${l}" ${l === s.spk ? 'selected' : ''}>${esc(spkName(l, speakers))}</option>`).join('')}</select>`
      : `<span class="n">${esc(spkName(s.spk, speakers))}</span>`;
    return `<div class="seg ${spkClass(s.spk)}" data-i="${i}" data-spk="${s.spk}"><div class="who">${who}<span class="t" data-t="${s.t0}">${clock(s.t0)}</span></div><div class="x" ${labels ? 'contenteditable="true" spellcheck="true"' : ''}>${esc(s.text)}</div></div>`;
  }
  function markerRow(m) {
    return `<div class="marker-row"><span class="t" data-t="${m.t}">${clock(m.t)}</span><input class="input" data-mid="${m.id}" value="${esc(m.text || '')}" placeholder="What happened here?"></div>`;
  }

  /* ---------------- share view (public) ---------------- */
  async function shareView(token) {
    const __t = state.renderToken;
    stopPolling();
    $('#app').innerHTML = `<div class="main"><div class="empty">Loading…</div></div>`;
    let d;
    try { d = await api(`/api/share/${encodeURIComponent(token)}`, { allow401: true }); }
    catch (e) { return $('#app').innerHTML = `<div class="login-wrap"><div class="login card"><div class="brand">${LOGO}<span>Record Studio</span></div><p class="tagline">This link is not available.</p></div></div>`; }
    const s = d.summary && !d.summary.error ? d.summary : null;
    $('#app').innerHTML = `
      <header class="topbar"><div class="topbar-inner"><span class="brand">${LOGO}<span>Record Studio</span></span>${DEMO.badge()}<span class="spacer"></span><span class="pill">Shared transcript</span></div></header>
      <main class="main">${DEMO.banner()}
        <div class="rec-head"><div><h1>${esc(d.title || 'Untitled recording')}</h1><div class="small muted">${esc(fmtDate(d.started_at))} · ${esc(dur(d.duration_s))}</div></div></div>
        <div class="player"><audio id="audio" controls preload="metadata" src="${DEMO.audioUrl(d.duration_s)}"></audio></div>
        ${s ? `<div class="card summary"><div class="label">Summary</div><p>${esc(s.summary)}</p>${s.keyPoints && s.keyPoints.length ? `<div class="label">Key points</div><ul>${s.keyPoints.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}${s.quotes && s.quotes.length ? `<div class="label">Quotes</div>${s.quotes.map((q) => `<div class="quote" data-t="${parseTime(q.time)}"><div class="q">“${esc(q.quote)}”</div><div class="who">${esc(q.speaker)} · ${esc(q.time)}</div></div>`).join('')}` : ''}</div>` : ''}
        <div class="card" style="margin-top:18px"><h3>Transcript</h3><div class="transcript" id="segments" style="max-height:none">${d.segments.map((seg, i) => segHtml(seg, i, d.speakers)).join('')}</div></div>
      </main>
      <footer class="foot">Recorded and transcribed with Record Studio</footer>`;
    const audio = $('#audio');
    const seek = (t) => { audio.currentTime = Math.max(0, t); audio.play().catch(() => {}); };
    $('#segments').onclick = (e) => { const t = e.target.closest('[data-t]'); if (t) seek(parseFloat(t.dataset.t)); };
    $$('.quote').forEach((q) => { q.onclick = () => seek(parseFloat(q.dataset.t)); });
  }

  /* ---------------- settings ---------------- */
  function settingsView() {
    const __t = state.renderToken;
    const s = state.settings || {};
    if (__t !== state.renderToken) return;
    mount(shell(`
      <h1>Settings</h1>
      <div class="grid-2" style="margin-top:18px">
        <form class="card" id="setForm"><h3>Transcription defaults</h3><p class="small muted">Applied to every new recording you start.</p>
          <div class="field"><label for="langs">Languages</label><input class="input" id="langs" value="${esc((s.languageCodes || []).join(', '))}" placeholder="Leave empty to auto-detect, or en-US, fr-CA"><div class="hint">BCP-47 codes, comma separated. Empty means auto-detect (85+ languages, code-switching included).</div></div>
          <div class="field"><label for="vocab">Custom vocabulary</label><textarea class="input" id="vocab" placeholder="One term per line: names, companies, products, jargon">${esc((s.vocabulary || []).join('\n'))}</textarea><div class="hint">Up to 300 terms bias the live captions toward the right spelling. Names of the people you interview are the best entries.</div></div>
          <div class="field"><label for="mode">Live caption style</label><select class="input" id="mode"><option value="VERBATIM" ${s.mode !== 'SMART' ? 'selected' : ''}>Verbatim (every um and repeat)</option><option value="SMART" ${s.mode === 'SMART' ? 'selected' : ''}>Smart (fillers removed, cleaner reading)</option></select></div>
          <div class="field"><label><input type="checkbox" id="ns" ${s.noiseSuppression !== false ? 'checked' : ''}> Browser noise suppression on the microphone</label><div class="hint">Turn off for a quiet studio; keep on in cafés and offices.</div></div>
          <button class="btn primary" type="submit">Save defaults</button>
        </form>
        <form class="card" id="pwForm"><h3>Password</h3>
          <div class="field"><label for="cur">Current password</label><input class="input" id="cur" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="next">New password</label><input class="input" id="next" type="password" autocomplete="new-password" minlength="10" required><div class="hint">At least 10 characters. Other sessions are signed out.</div></div>
          <button class="btn" type="submit">Change password</button>
        </form>
      </div>
      <div class="card" style="margin-top:18px"><h3>How it works</h3>
        <p class="small">While you record, 16 kHz audio streams to the server and on to Google’s live transcription model, which returns words within a second. In parallel the browser saves a high quality copy of the audio to the server every five seconds. When you stop, the server rebuilds the audio, sends it to the batch transcription model for speaker detection and word timing, then asks a language model for the summary and quotes. Audio and transcripts live on the server; nothing is kept by Google after the call.</p>
        <p class="small muted">Shortcuts: <span class="kbd">M</span> flags a moment while recording.</p>
      </div>
    `, 'settings'));
    $('#setForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/me/settings', { method: 'PUT', body: { languageCodes: $('#langs').value, vocabulary: $('#vocab').value, mode: $('#mode').value, noiseSuppression: $('#ns').checked } });
        state.settings = r.settings; toast('Defaults saved');
      } catch (err) { toast(err.message); }
    };
    $('#pwForm').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/api/me/password', { method: 'PUT', body: { current: $('#cur').value, next: $('#next').value } }); toast('Password changed'); $('#pwForm').reset(); }
      catch (err) { toast(err.message); }
    };
  }

  /* ---------------- users (admin) ---------------- */
  async function usersView() {
    const __t = state.renderToken;
    if (state.user.role !== 'admin') { location.hash = '#/'; return; }
    if (__t !== state.renderToken) return;
    mount(shell(`<div class="empty">Loading…</div>`, 'users'));
    let users = [];
    try { users = (await api('/api/users')).users; } catch (e) { toast(e.message); }
    const row = (u) => `<tr data-id="${u.id}"><td><b>${esc(u.name || '')}</b><div class="small muted">${esc(u.email)}</div></td><td>${esc(u.role)}</td><td class="small muted">${esc(fmtDate(u.last_login_at)) || 'never'}</td><td>${u.disabled ? '<span class="pill rec">Disabled</span>' : '<span class="pill ok">Active</span>'}</td><td><div class="btn-row"><button class="btn sm" data-act="pw">Reset password</button><button class="btn sm" data-act="toggle">${u.disabled ? 'Enable' : 'Disable'}</button><button class="btn sm danger" data-act="del">Delete</button></div></td></tr>`;
    if (__t !== state.renderToken) return;
    mount(shell(`
      <h1>Team</h1>
      <div class="card" style="margin-top:18px"><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody id="rows">${users.map(row).join('')}</tbody></table></div></div>
      <form class="card" id="addForm"><h3>Add a person</h3>
        <div class="grid-2"><div class="field"><label for="uEmail">Email</label><input class="input" id="uEmail" type="email" required></div><div class="field"><label for="uName">Name</label><input class="input" id="uName"></div></div>
        <div class="grid-2"><div class="field"><label for="uRole">Role</label><select class="input" id="uRole"><option value="member">Member (own recordings only)</option><option value="admin">Admin (everything)</option></select></div><div class="field"><label for="uPw">Password</label><input class="input" id="uPw" placeholder="Leave empty to generate one" autocomplete="new-password"></div></div>
        <button class="btn primary" type="submit">Create account</button>
        <div id="created" class="success hidden" style="margin-top:14px"></div>
      </form>
    `, 'users'));
    $('#addForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('/api/users', { body: { email: $('#uEmail').value, name: $('#uName').value, role: $('#uRole').value, password: $('#uPw').value } });
        $('#rows').insertAdjacentHTML('beforeend', row(r.user));
        const c = $('#created'); c.classList.remove('hidden'); c.innerHTML = `Account created. Send these once, then they change it in Settings:<br><span class="kbd">${esc(r.user.email)}</span> / <span class="kbd">${esc(r.password)}</span>`;
        $('#addForm').reset();
      } catch (err) { toast(err.message); }
    };
    $('#rows').onclick = async (e) => {
      const btn = e.target.closest('button[data-act]'); if (!btn) return;
      const tr = btn.closest('tr'); const id = tr.dataset.id; const u = users.find((x) => x.id === id) || {};
      try {
        if (btn.dataset.act === 'pw') {
          return DEMO.only(); // DEMO: no password prompt in the public demo
        } else if (btn.dataset.act === 'toggle') {
          const r = await api(`/api/users/${id}`, { method: 'PATCH', body: { disabled: !u.disabled } });
          Object.assign(u, r.user); tr.outerHTML = row(u);
        } else if (btn.dataset.act === 'del') {
          if (!confirm(`Delete ${u.email} and ALL their recordings? This cannot be undone.`)) return;
          await api(`/api/users/${id}`, { method: 'DELETE' }); tr.remove();
        }
      } catch (err) { toast(err.message); }
    };
  }

  /* ---------------- router ---------------- */
  let renderSeq = 0;
  async function render() {
    state.renderToken = ++renderSeq;
    const hash = location.hash || '#/';
    const shareMatch = /^#\/share\/([A-Za-z0-9]+)/.exec(hash) || /\/share\/([A-Za-z0-9]+)/.exec(location.pathname);
    if (shareMatch) return shareView(shareMatch[1]);
    if (state.recorder && state.recorder.running) {
      if (!confirm('A recording is running. Leave this page and stop it?')) { history.back(); return; }
      await state.recorder.stop(); state.recorder = null;
    }
    if (!state.user) return loginView();
    const [path, qs] = hash.slice(1).split('?');
    const params = new URLSearchParams(qs || '');
    const m = /^\/rec\/([A-Za-z0-9]+)/.exec(path);
    if (m) return recordingView(m[1], params);
    if (path === '/settings') return settingsView();
    if (path === '/users') return usersView();
    return dashboardView();
  }

  async function boot() {
    try {
      const me = await api('/api/me', { allow401: true });
      state.user = me.user; state.settings = me.settings || {}; state.gemini = me.gemini !== false;
    } catch (e) { state.user = null; if (e.status && e.status !== 401) toast('Server unreachable: ' + e.message, 6000); }
    state.booted = true;
    window.addEventListener('hashchange', render);
    render();
  }
  boot();
})();
