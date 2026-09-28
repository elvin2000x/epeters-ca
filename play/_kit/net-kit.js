/* ============================================================================
   net-kit.js — the Play Factory multiplayer client (globals: Net, LocalNet).
   Implements play/_kit/net-kit.md against server/PROTOCOL.md. Board games only.
   Net = online (authoritative server). LocalNet = hotseat + vs-AI (no socket),
   running the SAME rules.js in-tab so the game renderer is mode-agnostic.
   ========================================================================== */
(function (w) {
  "use strict";
  if (w.Net) return;

  function Emitter() { this._h = {}; }
  Emitter.prototype.on = function (t, fn) { (this._h[t] || (this._h[t] = [])).push(fn); return this; };
  Emitter.prototype.off = function (t, fn) { var a = this._h[t]; if (a) this._h[t] = a.filter(function (f) { return f !== fn; }); return this; };
  Emitter.prototype.emit = function (t, d) { (this._h[t] || []).slice().forEach(function (f) { try { f(d); } catch (e) { console.error(e); } }); };

  // The realtime server runs on exactly ONE host. These files can be served from
  // several places (play.elvinpeters.com, elvinpeters.com/play/, a local server), so
  // pin the endpoint instead of deriving it from location — otherwise a page served
  // from elvinpeters.com would dial wss://elvinpeters.com/rt, which does not exist.
  function defaultUrl() {
    try {
      var h = location.hostname;
      if (h === "127.0.0.1" || h === "localhost") return "ws://127.0.0.1:8810";
      return "wss://play.elvinpeters.com/rt";
    } catch (e) { return "wss://play.elvinpeters.com/rt"; }
  }
  function uuid() { return (w.crypto && crypto.randomUUID) ? crypto.randomUUID() : "p-" + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function playerId() { var k = "play.playerId", v = null; try { v = localStorage.getItem(k); if (!v) { v = uuid(); localStorage.setItem(k, v); } } catch (e) { v = uuid(); } return v; }

  /* ------------------------------------------------------------- Net (online) */
  function Net(opts) {
    Emitter.call(this);
    opts = opts || {};
    this.gameId = opts.gameId;
    this.rules = opts.rules;
    this.name = opts.name || "Guest";
    this.url = opts.url || defaultUrl();
    this.playerId = playerId();
    this.roomId = null; this.seat = null; this.isSpectator = false;
    this.players = []; this.state = null; this.connected = false; this.inviteUrl = null;
    this._ws = null; this._lastSeq = 0; this._retry = 0; this._alive = false; this._pingT = null;
    this._wantResume = null; // {roomId} to auto-resume after reconnect
    this._helloAcked = false;
    // restore resume target from a prior session
    try { var r = JSON.parse(localStorage.getItem("play." + this.gameId + ".room") || "null"); if (r && r.roomId) this._wantResume = r; } catch (e) {}
    var self = this;
    this._onOnline = function () { if (!self.connected) self.connect(); };
    this._onVis = function () { if (document.visibilityState === "visible" && !self.connected) self.connect(); };
  }
  Net.prototype = Object.create(Emitter.prototype);
  Net.prototype.isLocal = false;

  Net.prototype.connect = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var ws;
      try { ws = new WebSocket(self.url); } catch (e) { reject(e); return; }
      self._ws = ws; self._helloAcked = false;
      var settled = false;
      ws.onopen = function () {
        self.connected = true; self._retry = 0; self._alive = true;
        self._sendRaw("hello", { playerId: self.playerId, name: self.name, gameId: self.gameId });
        self._startPing();
        w.addEventListener("online", self._onOnline);
        document.addEventListener("visibilitychange", self._onVis);
      };
      ws.onmessage = function (ev) {
        var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
        self._alive = true;
        var d = msg.data || {};
        switch (msg.t) {
          case "welcome":
            self.playerId = d.playerId || self.playerId; self._helloAcked = true;
            self.emit("ready", { playerId: self.playerId });
            if (self._wantResume && self._wantResume.roomId) self._sendRaw("resume", { roomId: self._wantResume.roomId, playerId: self.playerId, lastSeq: self._lastSeq });
            if (!settled) { settled = true; resolve(); }
            break;
          case "roomCreated":
            self.roomId = d.roomId; self.seat = d.seat; self.isSpectator = false; self.inviteUrl = d.inviteUrl;
            self._persistRoom();
            self.emit("room", { roomId: d.roomId, seat: d.seat, inviteUrl: d.inviteUrl });
            break;
          case "joined":
            self.roomId = d.roomId; self.seat = d.seat; self.isSpectator = !!d.isSpectator;
            self.players = d.players || self.players;
            if (!self.inviteUrl && d.roomId) self.inviteUrl = self._inviteFor(d.roomId);
            self._persistRoom();
            self.emit("room", { roomId: d.roomId, seat: d.seat, inviteUrl: self.inviteUrl });
            self.emit("presence", { players: self.players, spectators: d.spectators || 0 });
            break;
          case "state":
            self.state = d.game; self._lastSeq = d.seq || self._lastSeq; self.players = d.players || self.players;
            self.emit("state", { state: d.game, turn: d.turn, seq: d.seq });
            break;
          case "moved":
            self._lastSeq = d.seq || self._lastSeq;
            self.emit("move", { by: d.by, move: d.move, turn: d.turn, seq: d.seq, events: d.events || [] });
            break;
          case "rejected": self.emit("rejected", { reason: d.reason, move: d.move }); break;
          case "presence": self.players = d.players || self.players; self.emit("presence", { players: self.players, spectators: d.spectators || 0 }); break;
          case "chat": self.emit("chat", d); break;
          case "gameOver": self.emit("gameOver", { result: d.result, reason: d.reason }); break;
          case "lobby": self.lobby = d; self.emit("lobby", d); break;
          case "lobbyChat": self.emit("lobbyChat", d); break;
          case "tableCreated": self.emit("tableCreated", d); break;
          case "pong": break;
          case "error": self.emit("error", { code: d.code, message: d.message }); if (!settled && (d.code === "not_found")) { /* keep resolved */ } break;
        }
      };
      ws.onclose = function () {
        self.connected = false; self._stopPing();
        self.emit("closed", { willRetry: true });
        self._scheduleReconnect();
        if (!settled) { settled = true; resolve(); } // resolve anyway; reconnect handles the rest
      };
      ws.onerror = function () { /* onclose will follow */ };
    });
  };

  Net.prototype._scheduleReconnect = function () {
    var self = this;
    if (self._closedByUser) return;
    var delay = Math.min(15000, 500 * Math.pow(2, self._retry++));
    self.emit("reconnecting", { attempt: self._retry });
    setTimeout(function () { if (!self.connected && !self._closedByUser) self.connect().then(function () { self.emit("reconnected", {}); }); }, delay);
  };
  Net.prototype._startPing = function () { var self = this; self._stopPing(); self._pingT = setInterval(function () { self._sendRaw("ping", {}); }, 25000); };
  Net.prototype._stopPing = function () { if (this._pingT) { clearInterval(this._pingT); this._pingT = null; } };
  Net.prototype._sendRaw = function (t, data) { if (this._ws && this._ws.readyState === 1) { try { this._ws.send(JSON.stringify({ t: t, roomId: this.roomId, data: data || {} })); } catch (e) {} } };
  Net.prototype._persistRoom = function () { try { localStorage.setItem("play." + this.gameId + ".room", JSON.stringify({ roomId: this.roomId, seat: this.seat })); } catch (e) {} };
  Net.prototype._inviteFor = function (code) { try { var base = (location.origin + location.pathname).replace(/[?#].*$/, ""); return base + "?r=" + code; } catch (e) { return null; } };

  Net.prototype.createRoom = function (opts) {
    var self = this;
    return new Promise(function (resolve) {
      function onRoom(r) { self.off("room", onRoom); resolve({ roomId: r.roomId, inviteUrl: r.inviteUrl || self.inviteUrl, seat: r.seat }); }
      self.on("room", onRoom);
      self._sendRaw("create", { gameId: self.gameId, options: (opts && opts.options) || opts || {} });
    });
  };
  Net.prototype.joinRoom = function (code, opts) {
    var self = this;
    self._wantResume = null; // explicit join overrides stale resume
    return new Promise(function (resolve) {
      function onRoom(r) { self.off("room", onRoom); resolve(r); }
      self.on("room", onRoom);
      self._sendRaw("join", { roomId: (code || "").toUpperCase(), asSpectator: !!(opts && opts.asSpectator) });
    });
  };
  Net.prototype.autoJoinFromUrl = function () {
    try {
      var u = new URL(location.href);
      var code = u.searchParams.get("r") || (u.hash.match(/r=([A-Za-z0-9]+)/) || [])[1];
      if (!code) return false;
      var spec = u.searchParams.get("spectate") === "1";
      var self = this;
      this.connect().then(function () { self.joinRoom(code, { asSpectator: spec }); });
      return true;
    } catch (e) { return false; }
  };
  /* ---- lobby: the friends hangout that opens game tables ---- */
  Net.prototype.joinLobby = function (lobbyId, name) {
    var self = this;
    if (name) self.name = name;
    return new Promise(function (res) {
      function onLob(d) { self.off("lobby", onLob); res(d); }
      self.on("lobby", onLob);
      self._sendRaw("lobbyJoin", { lobbyId: lobbyId || "MAIN", name: self.name });
    });
  };
  Net.prototype.leaveLobby = function () { this._sendRaw("lobbyLeave", {}); };
  Net.prototype.createTable = function (gameId, options) {
    var self = this;
    return new Promise(function (res) {
      function onT(d) { self.off("tableCreated", onT); res(d); }
      self.on("tableCreated", onT);
      self._sendRaw("tableCreate", { gameId: gameId, options: options || {} });
    });
  };
  Net.prototype.lobbySay = function (text) { this._sendRaw("lobbyChat", { text: text }); };

  Net.prototype.sendMove = function (move) { this._sendRaw("move", move); };
  // realtime games: fire-and-forget intent (direction, action). Server keeps the
  // latest per seat and consumes it on the next authoritative tick.
  Net.prototype.sendInput = function (input) { this._sendRaw("input", input); };
  Net.prototype.chat = function (text) { this._sendRaw("chat", { text: text }); };
  Net.prototype.rematch = function () { this._sendRaw("rematch", {}); };
  Net.prototype.leave = function () { this._sendRaw("leave", {}); try { localStorage.removeItem("play." + this.gameId + ".room"); } catch (e) {} this.roomId = null; this.seat = null; };
  Net.prototype.disconnect = function () { this._closedByUser = true; this._stopPing(); try { this._ws && this._ws.close(); } catch (e) {} w.removeEventListener("online", this._onOnline); document.removeEventListener("visibilitychange", this._onVis); };
  Net.prototype.copyInvite = function () { var u = this.inviteUrl || ""; try { return navigator.clipboard.writeText(u); } catch (e) { return Promise.reject(e); } };
  Net.prototype.qrDataUrl = function () { return Promise.resolve(null); }; // QR is a follow-up; UI shows code + link + copy/share
  Net.prototype.share = function () { var u = this.inviteUrl || ""; if (navigator.share) return navigator.share({ title: "Join my game", url: u }); return this.copyInvite(); };

  /* ------------------------------------------------- LocalNet (offline) */
  // Same surface as Net; runs rules.js in-tab. mode: 'hotseat' | 'ai'.
  function LocalNet(opts) {
    Emitter.call(this);
    opts = opts || {};
    this.gameId = opts.gameId; this.rules = opts.rules;
    this.mode = opts.mode || "hotseat"; this.seats = opts.seats || 2;
    this.ai = opts.ai || null; this.aiSeat = opts.aiSeat != null ? opts.aiSeat : 1;
    this.options = opts.options || {};
    this.rng = opts.rng || (w.PK ? PK.rand.int : function (n) { return Math.floor(Math.random() * n); });
    this.roomId = null; this.isSpectator = false; this.inviteUrl = null; this.connected = false;
    this.seat = 0; // in hotseat, "seat" tracks the active local seat for view purposes
    this.state = null; this._raw = null;
    this.players = [];
  }
  LocalNet.prototype = Object.create(Emitter.prototype);
  LocalNet.prototype.isLocal = true;

  LocalNet.prototype._np = function () { return this.rules.clampPlayers ? this.rules.clampPlayers(this.mode === "ai" ? 2 : this.seats) : (this.mode === "ai" ? 2 : this.seats); };
  LocalNet.prototype.connect = function () {
    var self = this;
    return new Promise(function (resolve) {
      var np = self._np();
      var opts = Object.assign({}, self.options, { numPlayers: np, players: np });
      self._raw = self.rules.createState(opts, self.rng);
      self.players = Array.from({ length: np }, function (_, i) { return { seat: i, name: self.mode === "ai" && i === self.aiSeat ? "Computer" : "Player " + (i + 1), status: "active" }; });
      self.connected = true;
      self._stopLocalLoop();          // a rematch restarts the world cleanly
      self._emitState();
      self.emit("presence", { players: self.players, spectators: 0 });
      resolve();
      if (self.rules.realtime) self._startLocalLoop(); else self._maybeAI();
    });
  };

  /* realtime offline driver: same tick contract the server runs (rules.tick) */
  LocalNet.prototype.sendInput = function (input, seat) {
    if (!this._inputs) this._inputs = {};
    this._inputs[seat != null ? seat : (this.mode === "ai" ? (1 - this.aiSeat) : 0)] = input;
  };
  LocalNet.prototype._stopLocalLoop = function () { if (this._loop) { clearInterval(this._loop); this._loop = null; } };
  LocalNet.prototype._startLocalLoop = function () {
    var self = this;
    if (self._loop || !self.rules.realtime) return;
    self._inputs = {};
    var hz = self.rules.tickRate || 15;
    self._loop = setInterval(function () {
      try {
        Object.keys(self._inputs).forEach(function (k) {
          var r = self.rules.applyInput(self._raw, +k, self._inputs[k]); if (r) self._raw = r;
        });
        self._inputs = {};
        if (self.mode === "ai" && self.ai) {                      // bots steer every tick
          var mv = self.ai(self.rules.publicView(self._raw, self.aiSeat));
          if (mv) { var r2 = self.rules.applyInput(self._raw, self.aiSeat, mv); if (r2) self._raw = r2; }
        }
        var res = self.rules.tick(self._raw, self.rng);
        if (res && res.state) self._raw = res.state;
        self._emitState();
        var term = self.rules.isTerminal(self._raw);
        if (term && term.over) self._stopLocalLoop();
      } catch (e) { self._stopLocalLoop(); }
    }, Math.round(1000 / hz));
  };
  LocalNet.prototype._viewSeat = function () { return this._raw.turn; }; // hotseat: the mover sees the board; UI curtains between turns
  LocalNet.prototype._emitState = function () {
    // AI mode: always render the HUMAN's hand (never leak the computer's).
    // Hotseat: render the current mover's hand (a "pass the device" curtain hides it between turns).
    // Realtime: there is no "turn" — render from the local player's seat.
    var viewSeat = this.rules.realtime ? (this.mode === "ai" ? (1 - this.aiSeat) : 0)
                 : (this.mode === "ai" ? (1 - this.aiSeat) : this._raw.turn);
    this.seat = viewSeat;
    this.state = this.rules.publicView(this._raw, this._raw.over ? null : viewSeat);
    this.emit("state", { state: this.state, turn: this._raw.turn, seq: 0 });
    var term = this.rules.isTerminal(this._raw);
    if (term && term.over) this.emit("gameOver", { result: term.result, reason: term.reason });
  };
  LocalNet.prototype.sendMove = function (move) {
    if (!this._raw || this._raw.over) return;
    var seat = this._raw.turn;
    var res = this.rules.applyMove(this._raw, seat, move, this.rng);
    if (!res.ok) { this.emit("rejected", { reason: res.reason, move: move }); return; }
    this._raw = res.state;
    this.emit("move", { by: seat, move: move, turn: this._raw.turn, seq: 0, events: res.events || [] });
    this._emitState();
    this._maybeAI();
  };
  LocalNet.prototype._maybeAI = function () {
    var self = this;
    if (self.mode !== "ai" || !self.ai || self._raw.over) return;
    if (self._raw.turn !== self.aiSeat) return;
    setTimeout(function () {
      if (self._raw.over || self._raw.turn !== self.aiSeat) return;
      var mv = self.ai(self.rules.publicView(self._raw, self.aiSeat));
      self.sendMove(mv);
    }, 550);
  };
  // online-only methods degrade to no-ops
  LocalNet.prototype.createRoom = function () { return Promise.resolve({ roomId: null, inviteUrl: null, seat: 0 }); };
  LocalNet.prototype.joinRoom = function () { return Promise.resolve({}); };
  LocalNet.prototype.autoJoinFromUrl = function () { return false; };
  LocalNet.prototype.chat = function () {}; LocalNet.prototype.rematch = function () { this.connect(); };
  LocalNet.prototype.leave = function () {}; LocalNet.prototype.disconnect = function () {};
  LocalNet.prototype.copyInvite = function () { return Promise.resolve(); };
  LocalNet.prototype.qrDataUrl = function () { return Promise.resolve(null); };
  LocalNet.prototype.share = function () { return Promise.resolve(); };

  w.Net = Net; w.LocalNet = LocalNet;
})(window);
