/* ============================================================================
   play-kit.js — the Play Factory shared runtime (global: window.PK)
   Zero-dependency. Browser-only (bot_test.js never loads this; app logic must
   only touch PK inside `if(!HEADLESS)`).  API + rationale: play-kit.md
   ========================================================================== */
(function (w, d) {
  "use strict";
  if (w.PK) return;
  var PK = {};
  w.PK = PK;

  /* ---------------------------------------------------------------- store */
  var store = {
    get: function (k, def) {
      try { var v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  PK.store = store;

  /* ----------------------------------------------------- fairness (crypto) */
  // Uniform int in [0, n) via rejection sampling (eliminates modulo bias).
  function randInt(n) {
    n = Math.floor(n);
    if (n <= 0) throw new RangeError("PK.rand.int needs n > 0");
    if (n === 1) return 0;
    var max = 0x100000000, limit = max - (max % n), buf = new Uint32Array(1), x;
    do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
    return x % n;
  }
  PK.rand = {
    int: randInt,
    float: function () { var b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 0x100000000; },
    bool: function () { return randInt(2) === 0; },
    pick: function (arr) { return arr[randInt(arr.length)]; },
    // Fisher–Yates (returns a new shuffled array; does not mutate input)
    shuffle: function (arr) {
      var a = arr.slice(), i, j, t;
      for (i = a.length - 1; i > 0; i--) { j = randInt(i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
  };

  /* ------------------------------------------------------------- theme */
  var THEME_KEY = "pk.theme";
  PK.theme = {
    get: function () { return store.get(THEME_KEY, "system"); },
    set: function (mode) {
      store.set(THEME_KEY, mode);
      if (mode === "system") d.documentElement.removeAttribute("data-theme");
      else d.documentElement.setAttribute("data-theme", mode);
      syncThemeColor();
    }
  };
  function syncThemeColor() {
    // keep the mobile browser chrome in step with the surface
    var m = d.querySelector('meta[name="theme-color"]');
    if (!m) { m = d.createElement("meta"); m.name = "theme-color"; d.head.appendChild(m); }
    m.content = getComputedStyle(d.documentElement).getPropertyValue("--pk-bg").trim() || "#F4F1EA";
  }

  /* ------------------------------------------------------------- motion */
  var MOTION_KEY = "pk.motion"; // "auto" | "reduce"
  PK.motion = {
    get pref() { return store.get(MOTION_KEY, "auto"); },
    set: function (mode) {
      store.set(MOTION_KEY, mode);
      if (mode === "reduce") d.documentElement.setAttribute("data-motion", "reduce");
      else d.documentElement.removeAttribute("data-motion");
    },
    get reduced() {
      if (this.pref === "reduce") return true;
      return w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
  };

  /* ------------------------------------------------------------- sound */
  // Fully synthesized WebAudio. Zero files. Mute is first-class + persisted.
  var SND_KEY = "pk.sound", ctx = null, master = null;
  function ac() {
    if (!ctx) {
      var AC = w.AudioContext || w.webkitAudioContext; if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.32; master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, t0, dur, type, gain, glideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.3, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(t0, dur, gain, hp, lp) {
    var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
    for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var g = ctx.createGain(); g.gain.value = gain || 0.2;
    var node = src;
    if (hp) { var f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { var f2 = ctx.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = lp; node.connect(f2); node = f2; }
    node.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur);
  }
  var RECIPES = {
    tick:       function (t) { tone(1200, t, 0.05, "triangle", 0.22); },
    click:      function (t) { tone(880, t, 0.04, "square", 0.15); },
    coinFlip:   function (t) { noise(t, 0.22, 0.10, 400, 3000); },
    coinLand:   function (t) { tone(760, t, 0.20, "sine", 0.30); tone(930, t + 0.01, 0.18, "sine", 0.18); },
    diceClack:  function (t, o) { var p = (o && o.pitch) || 1; noise(t, 0.06, 0.18, 1800); tone(180 * p, t, 0.07, "sine", 0.22); },
    strawReveal:function (t) { noise(t, 0.14, 0.10, 900, 6000); },
    cardFlip:   function (t) { noise(t, 0.09, 0.10, 1200); tone(660, t + 0.03, 0.05, "triangle", 0.12); },
    timerTick:  function (t) { tone(520, t, 0.05, "sine", 0.14); },
    win:        function (t) { [523.25, 659.25, 783.99].forEach(function (f, i) { tone(f, t + i * 0.11, 0.28, "triangle", 0.26); }); },
    lose:       function (t) { tone(320, t, 0.32, "sine", 0.26, 150); },
    reveal:     function (t) { tone(440, t, 0.10, "triangle", 0.16); tone(660, t + 0.06, 0.16, "triangle", 0.2); }
  };
  PK.sound = {
    get enabled() { return store.get(SND_KEY, true); },
    set enabled(v) { store.set(SND_KEY, !!v); reflectMute(); },
    toggle: function () { this.enabled = !this.enabled; return this.enabled; },
    play: function (name, opts) {
      if (!this.enabled) return;
      var c = ac(); if (!c || !RECIPES[name]) return;
      try { RECIPES[name](c.currentTime + 0.001, opts); } catch (e) {}
    }
  };

  /* ------------------------------------------------------------- haptics */
  PK.buzz = function (ms) { if (PK.sound.enabled && navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch (e) {} } };

  /* ------------------------------------------------------------- announce */
  var liveEl = null;
  PK.announce = function (text, assertive) {
    if (!liveEl) return;
    liveEl.setAttribute("aria-live", assertive ? "assertive" : "polite");
    liveEl.textContent = ""; // reset so identical repeats re-announce
    w.requestAnimationFrame(function () { liveEl.textContent = text; });
  };

  /* ------------------------------------------------------------- toast */
  var toastEl = null, toastT = null;
  PK.toast = function (msg, ms) {
    if (!toastEl) { toastEl = d.createElement("div"); toastEl.className = "pk-toast"; d.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, ms || 1800);
  };

  /* ------------------------------------------------------------- icons */
  var I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'
  };
  var muteBtn = null;
  function reflectMute() { if (muteBtn) { var on = PK.sound.enabled; muteBtn.innerHTML = on ? I.sound : I.muted; muteBtn.setAttribute("aria-label", on ? "Mute sound" : "Unmute sound"); muteBtn.setAttribute("aria-pressed", String(!on)); } }

  /* ------------------------------------------------------------- settings sheet */
  var perAppSlot = null, sheetBackdrop = null, lastFocus = null;
  PK.settings = {
    register: function (node) { pendingSlot = node; if (perAppSlot) { perAppSlot.innerHTML = ""; perAppSlot.appendChild(node); } },
    open: function () { openSheet(); }
  };
  var pendingSlot = null;
  function buildSheet() {
    sheetBackdrop = d.createElement("div"); sheetBackdrop.className = "pk-sheet-backdrop";
    sheetBackdrop.innerHTML =
      '<div class="pk-sheet" role="dialog" aria-modal="true" aria-label="Settings">' +
        '<h2>Settings</h2>' +
        '<div class="pk-setting"><label>Theme<small>Match your device or force one</small></label>' +
          '<div class="pk-seg" id="pk-seg-theme">' +
            '<button data-v="system">Auto</button><button data-v="light">Light</button><button data-v="dark">Dark</button>' +
          '</div></div>' +
        '<div class="pk-setting"><label for="pk-sw-sound">Sound<small>Clicks, pings, feedback</small></label>' +
          '<span class="pk-switch"><input type="checkbox" id="pk-sw-sound"><span></span></span></div>' +
        '<div class="pk-setting"><label for="pk-sw-motion">Reduce motion<small>Skip spins &amp; flips</small></label>' +
          '<span class="pk-switch"><input type="checkbox" id="pk-sw-motion"><span></span></span></div>' +
        '<div id="pk-app-slot"></div>' +
        '<p class="pk-subtle" style="margin-top:16px">How random works: every result uses your device’s cryptographic random generator, decided before the animation — provably unbiased.</p>' +
        '<button class="pk-btn pk-btn--ghost" id="pk-sheet-close" style="width:100%;margin-top:16px">Done</button>' +
      '</div>';
    d.body.appendChild(sheetBackdrop);
    perAppSlot = sheetBackdrop.querySelector("#pk-app-slot");
    if (pendingSlot) PK.settings.register(pendingSlot);

    sheetBackdrop.addEventListener("click", function (e) { if (e.target === sheetBackdrop) closeSheet(); });
    sheetBackdrop.querySelector("#pk-sheet-close").addEventListener("click", closeSheet);

    var seg = sheetBackdrop.querySelector("#pk-seg-theme");
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; PK.theme.set(b.dataset.v); paintSeg(); });
    function paintSeg() { var cur = PK.theme.get(); seg.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === cur)); }); }
    paintSeg();

    var sSound = sheetBackdrop.querySelector("#pk-sw-sound"); sSound.checked = PK.sound.enabled;
    sSound.addEventListener("change", function () { PK.sound.enabled = sSound.checked; if (sSound.checked) PK.sound.play("click"); });
    var sMotion = sheetBackdrop.querySelector("#pk-sw-motion"); sMotion.checked = PK.motion.pref === "reduce";
    sMotion.addEventListener("change", function () { PK.motion.set(sMotion.checked ? "reduce" : "auto"); });

    sheetBackdrop.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { closeSheet(); return; }
      if (e.key === "Tab") { trapTab(e, sheetBackdrop.querySelector(".pk-sheet")); }
    });
  }
  function openSheet() {
    if (!sheetBackdrop) buildSheet();
    lastFocus = d.activeElement;
    sheetBackdrop.classList.add("is-open");
    var f = sheetBackdrop.querySelector("button,input,[tabindex]"); if (f) f.focus();
  }
  function closeSheet() { if (!sheetBackdrop) return; sheetBackdrop.classList.remove("is-open"); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function trapTab(e, root) {
    var f = root.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])');
    if (!f.length) return; var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ------------------------------------------------------------- app shell */
  // PK.app({ title, slug, accent, hubHref, board, action:{label,onFire,key} })
  // Builds the shell into <body>, returns { stage, actions, primary, root }.
  PK.app = function (cfg) {
    cfg = cfg || {};
    // apply stored prefs before first paint of chrome
    PK.theme.set(PK.theme.get());
    if (PK.motion.pref === "reduce") d.documentElement.setAttribute("data-motion", "reduce");
    if (cfg.accent) d.documentElement.setAttribute("data-accent", cfg.accent);
    if (cfg.title) d.title = cfg.title + (cfg.suite === false ? "" : " · Playhouse");

    var root = d.createElement("div"); root.className = "pk-app"; if (cfg.board) root.setAttribute("data-board", "");
    root.innerHTML =
      '<header class="pk-header">' +
        '<a class="pk-icon-btn" id="pk-back" href="' + (cfg.hubHref || "..") + '" aria-label="Back to hub">' + I.back + '</a>' +
        '<h1 class="pk-title">' + (cfg.title || "") + '</h1>' +
        '<button class="pk-icon-btn" id="pk-mute" aria-label="Mute sound"></button>' +
        '<button class="pk-icon-btn" id="pk-settings" aria-label="Settings">' + I.gear + '</button>' +
      '</header>' +
      '<main class="pk-stage" id="pk-stage" tabindex="-1"></main>' +
      '<div class="pk-actions" id="pk-actions"></div>' +
      '<div class="pk-sr" id="pk-live" aria-live="polite" role="status"></div>';
    d.body.appendChild(root);
    liveEl = root.querySelector("#pk-live");

    muteBtn = root.querySelector("#pk-mute"); muteBtn.addEventListener("click", function () { PK.sound.toggle(); reflectMute(); if (PK.sound.enabled) PK.sound.play("click"); }); reflectMute();
    root.querySelector("#pk-settings").addEventListener("click", openSheet);

    var stage = root.querySelector("#pk-stage"), actions = root.querySelector("#pk-actions"), primary = null;
    if (cfg.action) {
      primary = d.createElement("button"); primary.className = "pk-btn"; primary.id = "pk-primary";
      primary.textContent = cfg.action.label || "Go";
      primary.addEventListener("click", function () { cfg.action.onFire && cfg.action.onFire(); });
      actions.appendChild(primary);
      // Space / Enter anywhere (unless typing) fires the primary action
      var key = cfg.action.key === undefined ? " " : cfg.action.key;
      d.addEventListener("keydown", function (e) {
        var tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable) return;
        if (e.key === key || (key === " " && e.code === "Space")) {
          if (e.target.closest && e.target.closest(".pk-sheet-backdrop.is-open")) return;
          e.preventDefault(); if (!primary.disabled) primary.click();
        }
      });
    }
    syncThemeColor();
    return { root: root, stage: stage, actions: actions, primary: primary };
  };

  /* tiny DOM helper (optional convenience) */
  PK.el = function (tag, props, kids) {
    var e = d.createElement(tag); props = props || {};
    for (var k in props) {
      if (k === "class") e.className = props[k];
      else if (k === "html") e.innerHTML = props[k];
      else if (k === "text") e.textContent = props[k];
      else if (k.slice(0, 2) === "on" && typeof props[k] === "function") e.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else if (props[k] != null) e.setAttribute(k, props[k]);
    }
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? d.createTextNode(c) : c); });
    return e;
  };

})(window, document);
