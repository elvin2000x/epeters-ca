/* demo-data.js: everything the Record Studio demo needs instead of a server.
 *
 * Card #530. Loaded before app.js. Exposes window.DEMO:
 *   api(path, opts)  answers every call app.js makes, from memory (resets on reload)
 *   Recorder         replays a timed caption script in place of mic + WebSocket
 *   download(fmt)    builds Word / Text / Markdown / SRT / VTT / JSON in the browser
 *   showGdoc(args)   previews the two-tab Google Doc in the page
 *   audioUrl(sec)    a silent WAV made in the page, so the player and seek work
 * No fetch, no XHR, no WebSocket, no microphone. The page CSP sets connect-src 'none'.
 *
 * The sample interview is SYNTHETIC: invented people and an invented co-op.
 * COPY holds every word that is new to the demo. Approved by Elvin via
 * COPYWRITER MAIN 2026-10-01 (Brain/04 Marketing and PR/deliverables/record-demo-530/LINES.md).
 */
(() => {
  'use strict';

  /* ---------------- new words (approved 2026-10-01) ---------------- */
  const COPY = {
    badge: 'Demo',
    banner: 'Watch a made-up interview become a transcript and summary. Nothing is recorded.',
    only: "This needs the full app's server, so it's off here.",
    mic: 'off in the demo',
    scriptEnd: 'Now press Stop & transcribe to get the transcript and summary.',
    gdocNote: 'Preview only. In the full app, one click makes this a real Google Doc.',
    audioNote: 'The player works. The sample is silent.',
    close: 'Close',
    sampleTitle: 'Bike co-op interview (sample)',
  };

  /* ---------------- the sample interview (synthetic; approved Script B) ---------------- */
  // spk S1 = the reporter, S2 = the guest. Times are seconds.
  const SCRIPT = [
    ['S1', 0.8, 'Daniel, thanks for making the time. How did the co-op start?'],
    ['S2', 6.8, 'Thanks, Maya. It started in a church basement in 2019. Six of us had tools but no shop. We opened two nights a week and fixed whatever rolled in.'],
    ['S1', 20.0, 'What does a repair night look like now?'],
    ['S2', 24.8, 'Busy. About forty bikes a night, most with a flat. You fix your own bike, and a volunteer talks you through it.'],
    ['S1', 35.2, 'Why teach people instead of fixing the bike for them?'],
    ['S2', 40.8, "Because a flat tire at seven in the morning shouldn't cost someone a shift. If you can fix it yourself, you get to work on time."],
    ['S1', 52.8, 'You open a second shop in the spring. What has to happen first?'],
    ['S2', 59.6, 'Two things. A lease we can afford, and twelve more volunteers who can teach.'],
    ['S1', 66.8, 'Last question. Where should a new volunteer start?'],
    ['S2', 71.6, "Come by on a Tuesday, bring a bike that needs work, and stay for an hour. That's how almost every one of us started."],
  ];
  const WPS = 2.5; // speaking rate, words per second
  const SEGMENTS = SCRIPT.map(([spk, t0, text]) => {
    const w = text.split(/\s+/);
    const t1 = +(t0 + w.length / WPS).toFixed(2);
    const step = (t1 - t0) / w.length;
    return { spk, t0, t1, text, words: w.map((x, i) => ({ w: x, s: +(t0 + i * step).toFixed(2), e: +(t0 + (i + 1) * step).toFixed(2) })) };
  });
  const DURATION = Math.ceil(SEGMENTS[SEGMENTS.length - 1].t1 + 1.5);
  const SPEAKERS = { S1: { name: 'Maya Chen' }, S2: { name: '', guess: 'Daniel Osei' } };
  const SUMMARY = {
    summary: 'A reporter asks how a bike repair co-op began and what it needs for a second shop.',
    keyPoints: [
      'Six people with tools but no shop started it in a church basement in 2019.',
      'It sees about forty bikes a night, most with a flat.',
      'Riders fix their own bikes while a volunteer talks them through it.',
      'A second shop opens in the spring. First it needs a lease it can afford and twelve more volunteers who can teach.',
    ],
    quotes: [
      { quote: "A flat tire at seven in the morning shouldn't cost someone a shift.", speaker: 'Daniel Osei', time: '00:40' },
      { quote: 'Come by on a Tuesday, bring a bike that needs work, and stay for an hour.', speaker: 'Daniel Osei', time: '01:11' },
    ],
    actionItems: [
      'Confirm the 2019 start date and the names of the six founders.',
      'Ask for the address and opening date of the second shop.',
      'Get the details a new volunteer needs to sign up.',
    ],
    topics: ['Bike repair', 'Volunteers', 'Teaching', 'Second shop'],
  };
  const ENGINE = { live: 'gemini-3.5-transcribe-live', batch: 'gemini-3.5-transcribe' };

  /* ---------------- in-memory store ---------------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const now = Date.now();
  const USER = { id: 'u1', name: 'Demo user', email: 'demo@example.com', role: 'admin' };
  let settings = { languageCodes: [], vocabulary: ['Maya Chen', 'Daniel Osei'], mode: 'VERBATIM', noiseSuppression: true };
  let nextId = 2, nextMarker = 1;
  const wordCount = (segs) => segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const recs = new Map(); // id -> { rec, markers, utterances, final, procStart }

  function addReady(id, title, ageMs) {
    const t = now - ageMs;
    recs.set(id, {
      rec: {
        id, title, status: 'ready', source: 'live', created_at: t, started_at: t, duration_s: DURATION, live_seconds: DURATION,
        word_count: wordCount(SEGMENTS), speaker_count: 2, owner_name: USER.name, mine: true, parts: 0,
        speakers: clone(SPEAKERS), summary: clone(SUMMARY), notes: '', share_token: null, google_doc_url: null,
      },
      markers: [{ id: 'm' + nextMarker++, t: 41, text: 'Best quote' }],
      utterances: SEGMENTS.map((s, i) => ({ seq: i, t0: s.t0, text: s.text })),
      final: { segments: clone(SEGMENTS), engine: ENGINE, source: 'archive', windows: 1, duration: DURATION },
    });
  }
  addReady('sample1', COPY.sampleTitle, 26 * 3600 * 1000);

  const PHASES = [['processing', 0], ['transcribing', 1600], ['summarizing', 3600], ['ready', 5400]];
  function tick(entry) {
    if (entry.rec.status !== 'processing') return null;
    const el = Date.now() - entry.procStart;
    let phase = PHASES[0][0];
    for (const [p, at] of PHASES) if (el >= at) phase = p;
    if (phase === 'ready') {
      const r = entry.rec;
      r.status = 'ready'; r.duration_s = DURATION; // the canned transcript is always the full sample
      r.word_count = wordCount(SEGMENTS); r.speaker_count = 2;
      if (!r.summary) r.summary = clone(SUMMARY);
      if (!r.speakers || !Object.keys(r.speakers).length) r.speakers = clone(SPEAKERS);
      entry.final = { segments: clone(SEGMENTS), engine: ENGINE, source: 'archive', windows: 1, duration: DURATION };
      return null;
    }
    return { phase, detail: phase === 'transcribing' ? '1 window' : '' };
  }

  function fail(msg, status) { const e = new Error(msg); e.status = status || 400; throw e; }
  const demoOnly = () => fail(COPY.only, 403);

  function listRecs(q) {
    q = (q || '').toLowerCase();
    const out = [];
    for (const e of recs.values()) {
      tick(e);
      const hay = [e.rec.title, e.rec.notes, ...(e.final ? e.final.segments.map((s) => s.text) : [])].join(' ').toLowerCase();
      if (!q || hay.includes(q)) out.push(clone(e.rec));
    }
    return out.sort((a, b) => b.created_at - a.created_at);
  }

  /* ---------------- the fake API ---------------- */
  async function api(path, opts) {
    await new Promise((r) => setTimeout(r, 120)); // feel of a round trip
    const method = (opts.method || (opts.body != null ? 'POST' : 'GET')).toUpperCase();
    const body = opts.body || {};
    const [p, qs] = path.split('?');
    const params = new URLSearchParams(qs || '');
    let m;

    if (p === '/api/me') return { user: USER, settings, gemini: true };
    if (p === '/api/me/settings' && method === 'PUT') {
      const split = (v, re) => (Array.isArray(v) ? v : String(v || '').split(re)).map((x) => x.trim()).filter(Boolean);
      settings = { languageCodes: split(body.languageCodes, /,/), vocabulary: split(body.vocabulary, /\n/), mode: body.mode, noiseSuppression: !!body.noiseSuppression };
      return { settings };
    }
    if (p === '/api/me/password') return demoOnly();
    if (p === '/api/logout') return demoOnly();
    if (p === '/api/admin/stats') {
      const all = listRecs();
      return { recordings: all.length, seconds: all.reduce((n, r) => n + (r.duration_s || 0), 0) + 6.4 * 3600, users: 3, live: 0, diskFree: 0 };
    }
    if (p === '/api/users') {
      if (method !== 'GET') return demoOnly();
      return { users: [
        { id: 'u1', name: USER.name, email: USER.email, role: 'admin', last_login_at: now, disabled: false },
        { id: 'u2', name: 'Sam Rivera', email: 'sam@example.com', role: 'member', last_login_at: now - 3 * 86400000, disabled: false },
        { id: 'u3', name: 'Priya Nair', email: 'priya@example.com', role: 'member', last_login_at: null, disabled: false },
      ] };
    }
    if (/^\/api\/users\//.test(p)) return demoOnly();

    if ((m = /^\/api\/share\/([A-Za-z0-9]+)$/.exec(p))) {
      const e = [...recs.values()].find((x) => x.rec.share_token === m[1]) || recs.get('sample1');
      if (!e || !e.final) fail('Not found', 404);
      return { title: e.rec.title, started_at: e.rec.started_at, duration_s: e.rec.duration_s, summary: e.rec.summary, speakers: e.rec.speakers, segments: e.final.segments };
    }

    if (p === '/api/recordings') {
      if (method === 'GET') return { recordings: listRecs(params.get('q')) };
      if (body.source === 'upload') return demoOnly();
      const id = 'rec' + nextId++;
      const rec = { id, title: String(body.title || '').trim().slice(0, 140), status: 'draft', source: 'live', created_at: Date.now(), started_at: null,
        duration_s: 0, live_seconds: 0, word_count: 0, speaker_count: 0, owner_name: USER.name, mine: true, parts: 0,
        speakers: {}, summary: null, notes: '', share_token: null, google_doc_url: null };
      recs.set(id, { rec, markers: [], utterances: [], final: null });
      return { recording: clone(rec) };
    }

    if (!(m = /^\/api\/recordings\/([A-Za-z0-9]+)(\/.*)?$/.exec(p))) fail('Not found', 404);
    const e = recs.get(m[1]);
    if (!e) fail('Recording not found', 404);
    const sub = m[2] || '';
    const r = e.rec;

    if (sub === '') {
      if (method === 'GET') { const phase = tick(e); return { recording: clone(r), markers: clone(e.markers), phase }; }
      if (method === 'DELETE') { recs.delete(r.id); return { ok: true }; }
      if (method === 'PATCH') {
        if (body.title != null) r.title = String(body.title).slice(0, 140);
        if (body.notes != null) r.notes = String(body.notes);
        if (body.speakers) for (const [k, v] of Object.entries(body.speakers)) r.speakers[k] = Object.assign({}, r.speakers[k], v);
        return { recording: clone(r) };
      }
    }
    if (sub === '/utterances') return { utterances: clone(e.utterances) };
    if (sub === '/transcript') { if (!e.final) fail('Transcript not ready', 409); return clone(e.final); }
    if (sub === '/stop') { r.status = 'processing'; e.procStart = Date.now(); if (!r.started_at) r.started_at = r.created_at; return { ok: true }; }
    if (sub === '/reprocess') { r.status = 'processing'; e.procStart = Date.now(); return { ok: true }; }
    if (sub === '/markers' && method === 'POST') { const mk = { id: 'm' + nextMarker++, t: body.t || 0, text: body.text || '' }; e.markers.push(mk); return { marker: mk }; }
    if ((m = /^\/markers\/(\w+)$/.exec(sub))) { const mk = e.markers.find((x) => x.id === m[1]); if (mk) mk.text = String(body.text || ''); return { marker: mk }; }
    if (sub === '/summary') { r.summary = Object.assign({}, r.summary, body); return { recording: clone(r) }; }
    if (sub === '/segments') { for (const ed of body.edits || []) { const s = e.final.segments[ed.i]; if (s) { if (ed.text != null) s.text = ed.text; if (ed.spk) s.spk = ed.spk; } } return { ok: true }; }
    if (sub === '/share') {
      if (method === 'DELETE') { r.share_token = null; return { ok: true }; }
      r.share_token = 'demo' + r.id; return { share_token: r.share_token };
    }
    if (sub === '/google-doc') { await new Promise((ok) => setTimeout(ok, 900)); r.google_doc_url = '#demo-doc'; return { url: r.google_doc_url }; }
    return demoOnly();
  }

  /* ---------------- toast + badge ---------------- */
  function toast(msg, ms) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), ms || 3200);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = () => `<span class="pill gold demo-badge" title="${esc(COPY.banner)}">${esc(COPY.badge)}</span>`;
  const banner = () => `<div class="demo-banner" role="note">${esc(COPY.banner)}</div>`;

  /* ---------------- the caption replay (stands in for mic + WebSocket) ---------------- */
  class Recorder {
    constructor(rec, settings, ui) {
      this.rec = rec; this.ui = ui; this.running = false; this.level = 0;
      this.uploadQueue = []; this.uploadFailures = 0; this.uploadedBytes = 0; this.archiveError = null;
      this.entry = recs.get(rec.id);
      this.startClock = rec.live_seconds || 0; this.t0 = 0; this.seq = this.entry ? this.entry.utterances.length : 0;
      this.timers = [];
    }
    get elapsed() { return this.running ? this.startClock + (performance.now() - this.t0) / 1000 : this.startClock; }
    async start() {
      await new Promise((r) => setTimeout(r, 400));
      this.running = true; this.t0 = performance.now();
      if (this.entry) { this.entry.rec.status = 'recording'; this.entry.rec.started_at = this.entry.rec.started_at || Date.now(); }
      this.ui.onLive('connecting');
      this.timers.push(setTimeout(() => this.running && this.ui.onLive('live'), 700));
      // Script times are relative to the moment Start is pressed.
      const base = this.startClock;
      let si = 0, wi = 0, finalDone = -1;
      this.loop = setInterval(() => {
        const t = this.elapsed - base;
        const s = SEGMENTS[si];
        if (!s) {
          this.level = 0.01 + Math.random() * 0.02;
          if (!this.endNoted && t > SEGMENTS[SEGMENTS.length - 1].t1 + 2) { this.endNoted = true; toast(COPY.scriptEnd, 6000); }
          return;
        }
        if (t >= s.t0) {
          const n = Math.min(s.words.length, s.words.filter((w) => w.s <= t).length);
          if (n !== wi && n > 0) { wi = n; this.ui.onInterim(s.words.slice(0, n).map((w) => w.w).join(' '), base + s.t0); }
          this.level = 0.15 + Math.random() * 0.45;
          if (t >= s.t1 + 0.35 && finalDone < si) {
            finalDone = si;
            const u = { seq: this.seq++, t0: base + s.t0, text: s.text };
            if (this.entry) this.entry.utterances.push(u);
            this.ui.onFinal(u); si++; wi = 0;
          }
        } else this.level = 0.01 + Math.random() * 0.03;
      }, 90);
      this.archive = setInterval(() => { this.uploadedBytes += 80000; this.ui.onArchive(); }, 5000); // 128 kbps chunks
      this.ui.onArchive();
    }
    marker(text) {
      const mk = { id: 'm' + nextMarker++, t: this.elapsed, text: text || '' };
      if (this.entry) this.entry.markers.push(mk);
      this.ui.onMarker(mk);
    }
    async stop() {
      if (!this.running) return 0;
      const secs = this.elapsed;
      this.running = false;
      clearInterval(this.loop); clearInterval(this.archive); this.timers.forEach(clearTimeout);
      if (this.entry) this.entry.rec.live_seconds = secs;
      this.startClock = secs;
      this.ui.onLive('stopped');
      await new Promise((r) => setTimeout(r, 500));
      return 0;
    }
  }

  /* ---------------- silent audio for the player ---------------- */
  const audioCache = {};
  function audioUrl(sec) {
    sec = Math.max(1, Math.ceil(sec || DURATION));
    if (audioCache[sec]) return audioCache[sec];
    const rate = 8000, n = rate * sec, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128); // 8-bit silence
    return (audioCache[sec] = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  }

  /* ---------------- exports (browser port of record-studio lib/exports.js) ---------------- */
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  function fmtClock(sec) { sec = Math.max(0, Math.floor(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; }
  function fmtSrt(sec, sep) { sec = Math.max(0, sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000); return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`; }
  function fmtDuration(sec) { sec = Math.round(sec || 0); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`; }
  function speakerName(spk, speakers) { const s = speakers && speakers[spk]; if (s && s.name) return s.name; return `Speaker ${String(spk).replace(/^S/, '')}`; }
  function meta(rec, final) { const d = new Date(rec.started_at || rec.created_at), p = (n) => String(n).padStart(2, '0'); const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; return { title: rec.title || 'Untitled recording', date, duration: fmtDuration(final.duration || rec.duration_s) }; }

  function toTxt(a) {
    const m = meta(a.rec, a.final);
    const lines = [m.title, `Recorded ${m.date} · ${m.duration} · ${a.final.segments.length} segments`, ''];
    for (const seg of a.final.segments) lines.push(`[${fmtClock(seg.t0)}] ${speakerName(seg.spk, a.speakers)}: ${seg.text}`);
    return lines.join('\n') + '\n';
  }
  function toMd(a) {
    const m = meta(a.rec, a.final), summary = a.summary, out = [`# ${m.title}`, '', `Recorded ${m.date} · ${m.duration}`, ''];
    if (summary) {
      out.push('## Summary', '', summary.summary || '', '');
      if (summary.keyPoints && summary.keyPoints.length) { out.push('### Key points', ''); for (const k of summary.keyPoints) out.push(`- ${k}`); out.push(''); }
      if (summary.quotes && summary.quotes.length) { out.push('### Quotes', ''); for (const q of summary.quotes) out.push(`> "${q.quote}" (${q.speaker}, ${q.time})`, ''); }
      if (summary.actionItems && summary.actionItems.length) { out.push('### Follow-ups', ''); for (const x of summary.actionItems) out.push(`- [ ] ${x}`); out.push(''); }
    }
    if (a.markers && a.markers.length) { out.push('## Flagged moments', ''); for (const mk of a.markers) out.push(`- ${fmtClock(mk.t)} ${mk.text || '(flagged)'}`); out.push(''); }
    if (a.rec.notes) out.push('## Notes', '', a.rec.notes, '');
    out.push('## Transcript', '');
    for (const seg of a.final.segments) out.push(`**${speakerName(seg.spk, a.speakers)}** \`${fmtClock(seg.t0)}\`  `, seg.text, '');
    return out.join('\n');
  }
  function cues(a, maxSec = 7, maxChars = 90) {
    const out = [];
    for (const seg of a.final.segments) {
      const name = speakerName(seg.spk, a.speakers);
      const words = seg.words && seg.words.length ? seg.words : [{ w: seg.text, s: seg.t0, e: seg.t1 }];
      let cur = [], start = null;
      const flush = () => { if (!cur.length) return; out.push({ t0: start, t1: cur[cur.length - 1].e, text: `${name}: ${cur.map((x) => x.w).join(' ')}` }); cur = []; start = null; };
      for (const w of words) {
        if (start == null) start = w.s;
        const len = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
        if (cur.length && (w.e - start > maxSec || len > maxChars)) { flush(); start = w.s; }
        cur.push(w);
      }
      flush();
    }
    return out;
  }
  const toSrt = (a) => cues(a).map((c, i) => `${i + 1}\n${fmtSrt(c.t0, ',')} --> ${fmtSrt(Math.max(c.t1, c.t0 + 0.5), ',')}\n${c.text}\n`).join('\n') + '\n';
  const toVtt = (a) => 'WEBVTT\n\n' + cues(a).map((c) => `${fmtSrt(c.t0, '.')} --> ${fmtSrt(Math.max(c.t1, c.t0 + 0.5), '.')}\n${c.text}\n`).join('\n') + '\n';
  function toJson(a) {
    const m = meta(a.rec, a.final);
    return JSON.stringify({
      id: a.rec.id, title: m.title, recordedOn: m.date, durationSeconds: a.final.duration || a.rec.duration_s,
      engine: a.final.engine, speakers: a.speakers, summary: a.summary || null, markers: a.markers || [],
      segments: a.final.segments.map((s) => ({ speaker: s.spk, speakerName: speakerName(s.spk, a.speakers), start: s.t0, end: s.t1, text: s.text, words: s.words })),
    }, null, 2);
  }

  // ZIP with stored (uncompressed) entries: valid for Word, no compressor needed in the browser.
  const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  function zip(entries) {
    const enc = new TextEncoder(), d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const parts = [], central = []; let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name), data = enc.encode(e.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const cdLen = central.reduce((n, x) => n + (x.byteLength || x.length), 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, entries.length, true); eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdLen, true); eocd.setUint32(16, offset, true);
    return new Blob([...parts, ...central, eocd.buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const x = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function run(text, o) { o = o || {}; const p = []; if (o.bold) p.push('<w:b/>'); if (o.italic) p.push('<w:i/>'); if (o.color) p.push(`<w:color w:val="${o.color}"/>`); if (o.size) p.push(`<w:sz w:val="${o.size}"/>`); return `<w:r>${p.length ? `<w:rPr>${p.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r>`; }
  function para(runs, o) { o = o || {}; const p = []; if (o.style) p.push(`<w:pStyle w:val="${o.style}"/>`); if (o.spacingAfter != null) p.push(`<w:spacing w:after="${o.spacingAfter}"/>`); return `<w:p>${p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''}${Array.isArray(runs) ? runs.join('') : runs}</w:p>`; }
  function toDocx(a) {
    const m = meta(a.rec, a.final), summary = a.summary, body = [];
    body.push(para(run(m.title), { style: 'Title' }));
    body.push(para(run(`Recorded ${m.date} · ${m.duration} · ${a.final.segments.length} segments`, { color: '6B7280' }), { spacingAfter: 240 }));
    if (summary) {
      body.push(para(run('Summary'), { style: 'Heading1' }), para(run(summary.summary || ''), { spacingAfter: 160 }));
      if (summary.keyPoints && summary.keyPoints.length) { body.push(para(run('Key points'), { style: 'Heading2' })); for (const k of summary.keyPoints) body.push(para(run('• ' + k), { spacingAfter: 60 })); }
      if (summary.quotes && summary.quotes.length) { body.push(para(run('Quotes'), { style: 'Heading2' })); for (const q of summary.quotes) body.push(para([run(`"${q.quote}"`, { italic: true }), run(`  (${q.speaker}, ${q.time})`, { color: '6B7280' })], { spacingAfter: 100 })); }
      if (summary.actionItems && summary.actionItems.length) { body.push(para(run('Follow-ups'), { style: 'Heading2' })); for (const i of summary.actionItems) body.push(para(run('☐ ' + i), { spacingAfter: 60 })); }
    }
    if (a.markers && a.markers.length) { body.push(para(run('Flagged moments'), { style: 'Heading1' })); for (const mk of a.markers) body.push(para([run(fmtClock(mk.t) + '  ', { bold: true }), run(mk.text || '(flagged)')], { spacingAfter: 60 })); }
    if (a.rec.notes) { body.push(para(run('Notes'), { style: 'Heading1' })); for (const line of String(a.rec.notes).split(/\r?\n/)) body.push(para(run(line), { spacingAfter: 60 })); }
    body.push(para(run('Transcript'), { style: 'Heading1' }));
    for (const seg of a.final.segments) {
      body.push(para([run(speakerName(seg.spk, a.speakers), { bold: true }), run(`  ${fmtClock(seg.t0)}`, { color: '9C761F', size: 18 })], { spacingAfter: 20 }));
      body.push(para(run(seg.text), { spacingAfter: 160 }));
    }
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    return zip([
      { name: '[Content_Types].xml', data: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
      { name: '_rels/.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
      { name: 'word/document.xml', data: head + `<w:document xmlns:w="${W}"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>` },
      { name: 'word/_rels/document.xml.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'word/styles.xml', data: head + `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:color w:val="0E1A2B"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:sz w:val="30"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>` },
      { name: 'docProps/core.xml', data: head + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(m.title)}</dc:title><dc:creator>Record Studio</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>` },
    ]);
  }

  const FORMATS = {
    txt: ['text/plain;charset=utf-8', toTxt], md: ['text/markdown;charset=utf-8', toMd], srt: ['application/x-subrip;charset=utf-8', toSrt],
    vtt: ['text/vtt;charset=utf-8', toVtt], json: ['application/json;charset=utf-8', toJson], docx: [null, toDocx],
  };
  function download(fmt, a) {
    const f = FORMATS[fmt];
    if (!f) return only();
    const out = f[1](a);
    const blob = out instanceof Blob ? out : new Blob([out], { type: f[0] });
    const name = `${(a.rec.title || 'recording').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'recording'}.${fmt}`;
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------------- Google Doc preview (same two tabs as lib/gdocs.js) ---------------- */
  function showGdoc(a) {
    const m = meta(a.rec, a.final), s = a.summary;
    const li = (arr) => `<ul>${arr.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    let sum = `<h1 class="gd-title">${esc(m.title)}</h1><p class="gd-sub">Recorded ${esc(m.date)} · ${Math.round((a.final.duration || a.rec.duration_s) / 60)} min · ${a.final.segments.length} segments</p><h2>Summary</h2>`;
    if (s) {
      sum += `<p>${esc(s.summary || '')}</p>`;
      if (s.keyPoints && s.keyPoints.length) sum += `<h3>Key points</h3>${li(s.keyPoints)}`;
      if (s.quotes && s.quotes.length) sum += `<h3>Quotes</h3>${li(s.quotes.map((q) => `"${q.quote}" (${q.speaker}, ${q.time})`))}`;
      if (s.actionItems && s.actionItems.length) sum += `<h3>Follow-ups</h3>${li(s.actionItems)}`;
      if (s.topics && s.topics.length) sum += `<h3>Topics</h3><p>${esc(s.topics.join(', '))}</p>`;
    } else sum += '<p>No summary was generated for this recording.</p>';
    if (a.markers && a.markers.length) sum += `<h3>Flagged moments</h3>${li(a.markers.map((mk) => `${fmtClock(mk.t)} ${mk.text || '(flagged)'}`))}`;
    if (a.rec.notes) sum += `<h3>Notes</h3><p>${esc(a.rec.notes)}</p>`;
    const tr = '<h2>Transcript</h2>' + a.final.segments.map((g) => `<h4>${esc(speakerName(g.spk, a.speakers))} · ${fmtClock(g.t0)}</h4><p>${esc(g.text)}</p>`).join('');
    const wrap = document.createElement('div');
    wrap.className = 'gd-overlay';
    wrap.innerHTML = `<div class="gd-win" role="dialog" aria-modal="true" aria-label="${esc(m.title)} · transcript">
      <div class="gd-bar"><span class="gd-icon" aria-hidden="true"></span><b class="gd-name">${esc(m.title)} · transcript</b><button class="btn sm" data-close>${esc(COPY.close)}</button></div>
      <div class="gd-note">${esc(COPY.gdocNote)}</div>
      <div class="gd-body"><nav class="gd-tabs" role="tablist"><button role="tab" aria-selected="true" data-tab="0">Summary</button><button role="tab" aria-selected="false" data-tab="1">Transcript</button></nav>
      <article class="gd-page"><div data-pane="0">${sum}</div><div data-pane="1" hidden>${tr}</div></article></div></div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.onclick = (e) => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close();
      const t = e.target.closest('[data-tab]'); if (!t) return;
      wrap.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b === t)));
      wrap.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
      wrap.querySelector('.gd-page').scrollTop = 0;
    };
    wrap.querySelector('[data-close]').focus();
  }

  function only() { toast(COPY.only); }

  window.DEMO = { COPY, api, Recorder, audioUrl, download, showGdoc, only, badge, banner };
})();
