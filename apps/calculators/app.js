/* ==========================================================================
   app.js — the calculator engine.
   Renders any definition from data.js: form, results, charts, tables, FAQ.
   State lives in the URL query string so every result is a shareable link.
   Zero dependencies.
   ========================================================================== */

(function () {
  'use strict';

  var DATA = window.CALC_DATA;
  var ALL = DATA.calculators;

  /* --------------------------------------------------------------------
     Chart palette. Both ramps were run through the six-check validator
     (lightness band, chroma floor, CVD separation, normal-vision floor,
     contrast) against their own surface. Dark is chosen, not flipped.
     Hues are assigned in fixed order and never cycled.
     -------------------------------------------------------------------- */
  var PALETTE = {
    light: ['#9c761f', '#1c6ea8', '#8a4f7d'],
    dark:  ['#bc8a28', '#2f92d8', '#a85f9e']
  };
  function series_colors() {
    return PALETTE[(window.AppsKit && AppsKit.currentTheme()) === 'light' ? 'light' : 'dark'];
  }
  function ink(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ---------------- formatting ---------------- */

  var FMT = {
    money: function (n) { return sign(n) + '$' + abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    money0: function (n) { return sign(n) + '$' + Math.round(abs(n)).toLocaleString('en-CA'); },
    pct: function (n) { return round(n, 2).toLocaleString('en-CA') + '%'; },
    pct2: function (n) { return round(n, 2).toLocaleString('en-CA') + '%'; },
    num: function (n) { return round(n, 6).toLocaleString('en-CA'); },
    int: function (n) { return Math.round(n).toLocaleString('en-CA'); },
    ratio: function (n) { return round(n, 1).toLocaleString('en-CA') + ' : 1'; },
    dec1: function (n) { return round(n, 1).toLocaleString('en-CA'); },
    x: function (n) { return round(n, 2).toLocaleString('en-CA') + '×'; },
    months: function (m) {
      var y = Math.floor(m / 12), mo = Math.round(m % 12);
      if (mo === 12) { y++; mo = 0; }
      return ((y ? y + ' yr ' : '') + (mo ? mo + ' mo' : (y ? '' : '0 mo'))).trim();
    },
    text: function (_, row) { return row && row.text != null ? row.text : '—'; }
  };
  function fmt(kind, value, row) { return (FMT[kind] || FMT.num)(value, row); }
  function sign(n) { return n < 0 ? '−' : ''; }
  function abs(n) { return Math.abs(n); }
  function round(n, d) { var p = Math.pow(10, d); return Math.round(n * p) / p; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------------- input state <-> URL ---------------- */

  function defaults(def) {
    var v = {};
    def.inputs.forEach(function (inp) {
      v[inp.id] = inp.type === 'debtlist' ? JSON.parse(JSON.stringify(inp.def)) : inp.def;
    });
    return v;
  }

  function readURL(def, v) {
    var q = new URLSearchParams(location.search);
    def.inputs.forEach(function (inp) {
      if (!q.has(inp.id)) return;
      var raw = q.get(inp.id);
      if (inp.type === 'toggle') v[inp.id] = raw === '1' || raw === 'true';
      else if (inp.type === 'select') { if ((inp.options || []).some(function (o) { return o.v === raw; })) v[inp.id] = raw; }
      else if (inp.type === 'debtlist') { try { var p = JSON.parse(raw); if (Array.isArray(p)) v[inp.id] = p; } catch (e) {} }
      else { var n = parseFloat(raw); if (isFinite(n)) v[inp.id] = n; }
    });
    return v;
  }

  function writeURL(def, v) {
    // Keep campaign tags (utm_*, gclid, fbclid) and the #hash: GA4 and ads attribution
    // read them, and a shared link should land on the same anchor (#342 Gate 3).
    var q = new URLSearchParams();
    new URLSearchParams(location.search).forEach(function (val, key) {
      if (/^(utm_|gclid$|fbclid$)/.test(key)) q.set(key, val);
    });
    def.inputs.forEach(function (inp) {
      var val = v[inp.id];
      if (inp.type === 'debtlist') { q.set(inp.id, JSON.stringify(val)); return; }
      if (val === inp.def) return;                 // keep links short
      q.set(inp.id, inp.type === 'toggle' ? (val ? '1' : '0') : val);
    });
    var s = q.toString();
    history.replaceState(null, '', (s ? '?' + s : location.pathname) + location.hash);
  }

  /* ---------------- form ---------------- */

  function renderForm(def, v, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'calc-form';

    def.inputs.forEach(function (inp) {
      var field = document.createElement('div');
      field.className = 'field' + (inp.type === 'toggle' ? ' field-toggle' : '');

      if (inp.type === 'toggle') {
        var id = 'f_' + inp.id;
        field.innerHTML =
          '<label class="switch" for="' + id + '">' +
            '<input type="checkbox" id="' + id + '"' + (v[inp.id] ? ' checked' : '') + '>' +
            '<span class="track"><span class="thumb"></span></span>' +
            '<span class="switch-label">' + esc(inp.label) + '</span>' +
          '</label>';
        field.querySelector('input').addEventListener('change', function (e) {
          v[inp.id] = e.target.checked; onChange();
        });

      } else if (inp.type === 'select') {
        field.innerHTML = '<label for="f_' + inp.id + '">' + esc(inp.label) + '</label>' +
          '<select id="f_' + inp.id + '">' + inp.options.map(function (o) {
            return '<option value="' + esc(o.v) + '"' + (o.v === v[inp.id] ? ' selected' : '') + '>' + esc(o.l) + '</option>';
          }).join('') + '</select>' +
          (inp.hint ? '<p class="hint">' + esc(inp.hint) + '</p>' : '');
        field.querySelector('select').addEventListener('change', function (e) {
          v[inp.id] = e.target.value; onChange();
        });

      } else if (inp.type === 'debtlist') {
        field.className = 'field field-debts';
        field.innerHTML = '<label>' + esc(inp.label) + '</label><div class="debts"></div>' +
          '<button type="button" class="btn addrow">+ Add a debt</button>';
        var host = field.querySelector('.debts');
        var paint = function () {
          host.innerHTML =
            '<div class="debt-head"><span>Name</span><span>Balance</span><span>Rate %</span><span>Min / mo</span><span></span></div>' +
            v[inp.id].map(function (d, k) {
              return '<div class="debt-row" data-k="' + k + '">' +
                '<input type="text" value="' + esc(d.name) + '" data-f="name" aria-label="Debt name">' +
                '<input type="number" value="' + d.balance + '" data-f="balance" min="0" step="100" aria-label="Balance">' +
                '<input type="number" value="' + d.rate + '" data-f="rate" min="0" step="0.01" aria-label="Interest rate">' +
                '<input type="number" value="' + d.min + '" data-f="min" min="0" step="10" aria-label="Minimum payment">' +
                '<button type="button" class="del" data-k="' + k + '" aria-label="Remove ' + esc(d.name) + '">×</button>' +
              '</div>';
            }).join('');
        };
        paint();
        host.addEventListener('input', function (e) {
          var row = e.target.closest('.debt-row'); if (!row) return;
          var k = +row.dataset.k, f = e.target.dataset.f;
          v[inp.id][k][f] = f === 'name' ? e.target.value : parseFloat(e.target.value) || 0;
          onChange();
        });
        host.addEventListener('click', function (e) {
          if (!e.target.classList.contains('del')) return;
          v[inp.id].splice(+e.target.dataset.k, 1); paint(); onChange();
        });
        field.querySelector('.addrow').addEventListener('click', function () {
          v[inp.id].push({ name: 'New debt', balance: 5000, rate: 12, min: 100 }); paint(); onChange();
        });

      } else {
        var unit = inp.type === 'money' ? '$' : inp.type === 'pct' ? '%' : (inp.unit || '');
        var step = inp.step != null ? inp.step : (inp.type === 'int' ? 1 : 'any');
        field.innerHTML =
          '<label for="f_' + inp.id + '">' + esc(inp.label) + '</label>' +
          '<div class="inputwrap' + (inp.type === 'money' ? ' has-prefix' : unit ? ' has-suffix' : '') + '">' +
            (inp.type === 'money' ? '<span class="affix pre">$</span>' : '') +
            '<input type="number" id="f_' + inp.id + '" value="' + v[inp.id] + '"' +
              (inp.min != null ? ' min="' + inp.min + '"' : '') +
              (inp.max != null ? ' max="' + inp.max + '"' : '') +
              ' step="' + step + '" inputmode="decimal">' +
            (inp.type !== 'money' && unit ? '<span class="affix suf">' + esc(unit) + '</span>' : '') +
          '</div>' +
          (inp.hint ? '<p class="hint">' + esc(inp.hint) + '</p>' : '');
        field.querySelector('input').addEventListener('input', function (e) {
          var n = parseFloat(e.target.value);
          v[inp.id] = isFinite(n) ? n : 0;
          onChange();
        });
      }
      wrap.appendChild(field);
    });

    var actions = document.createElement('div');
    actions.className = 'form-actions';
    actions.innerHTML =
      '<button type="button" class="btn" data-act="copy">Copy link to this result</button>' +
      '<button type="button" class="btn" data-act="reset">Reset</button>';
    actions.addEventListener('click', function (e) {
      var a = e.target.dataset.act;
      if (a === 'copy') {
        navigator.clipboard.writeText(location.href).then(function () {
          e.target.textContent = 'Link copied';
          setTimeout(function () { e.target.textContent = 'Copy link to this result'; }, 1800);
        });
      } else if (a === 'reset') {
        history.replaceState(null, '', location.pathname);
        location.reload();
      }
    });
    wrap.appendChild(actions);
    return wrap;
  }

  /* ---------------- charts (canvas 2D, zero deps) ---------------- */

  function niceCeil(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / mag;
    var step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * mag;
  }

  function renderChart(spec) {
    var host = document.createElement('figure');
    host.className = 'chart';
    var colors = series_colors();

    if (spec.type === 'funnel') return renderFunnel(spec, colors);

    var multi = spec.series.length > 1;
    host.innerHTML =
      '<figcaption>' +
        '<span class="chart-title">' + esc(spec.title) + '</span>' +
        (multi ? '<span class="legend">' + spec.series.map(function (s, k) {
          return '<span class="lg"><i style="background:' + colors[k % colors.length] + '"></i>' + esc(s.name) + '</span>';
        }).join('') + '</span>' : '') +
      '</figcaption>' +
      '<div class="canvas-wrap"><canvas></canvas><div class="tip" hidden></div></div>' +
      '<button type="button" class="tablebtn" aria-expanded="false">Show as a table</button>' +
      '<div class="charttable" hidden></div>';

    var canvas = host.querySelector('canvas');
    var tip = host.querySelector('.tip');
    var hover = -1;

    function draw() {
      var wrap = canvas.parentElement;
      var W = wrap.clientWidth, H = Math.max(200, Math.min(340, Math.round(W * 0.46)));
      var dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      var c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      var cols = series_colors();
      var gridCol = ink('--line');
      var textCol = ink('--muted');
      var surface = ink('--panel');

      // y domain
      var n = spec.x.length;
      var tops = [];
      for (var k = 0; k < n; k++) {
        var t = 0;
        spec.series.forEach(function (s) { t = spec.stacked ? t + (s.values[k] || 0) : Math.max(t, s.values[k] || 0); });
        tops.push(t);
      }
      var yMax = niceCeil(Math.max.apply(null, tops.concat([1])));

      var padL = 62, padR = 12, padT = 12, padB = 26;
      var pw = W - padL - padR, ph = H - padT - padB;
      var X = function (k) { return padL + (n === 1 ? pw / 2 : pw * k / (n - 1)); };
      var Y = function (val) { return padT + ph - ph * (val / yMax); };

      // recessive grid + y labels
      c.font = '11px ' + ink('--sans').replace(/^,/, '');
      c.textAlign = 'right'; c.textBaseline = 'middle';
      for (var g = 0; g <= 4; g++) {
        var val = yMax * g / 4, y = Y(val);
        c.strokeStyle = gridCol; c.globalAlpha = g === 0 ? .9 : .35; c.lineWidth = 1;
        c.beginPath(); c.moveTo(padL, y + .5); c.lineTo(W - padR, y + .5); c.stroke();
        c.globalAlpha = 1; c.fillStyle = textCol;
        c.fillText(fmt(spec.yFmt || 'num', val), padL - 8, y);
      }

      // x labels — thinned so they never collide
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = textCol;
      var everyX = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 54))));
      for (var k2 = 0; k2 < n; k2 += everyX) c.fillText(String(spec.x[k2]), X(k2), H - padB + 7);

      // marks
      if (spec.type === 'area' && spec.stacked) {
        var base = new Array(n).fill(0);
        spec.series.forEach(function (s, si) {
          var top = s.values.map(function (val, k) { return base[k] + (val || 0); });
          c.beginPath();
          c.moveTo(X(0), Y(top[0]));
          for (var k = 1; k < n; k++) c.lineTo(X(k), Y(top[k]));
          for (var k3 = n - 1; k3 >= 0; k3--) c.lineTo(X(k3), Y(base[k3]));
          c.closePath();
          c.fillStyle = cols[si % cols.length]; c.globalAlpha = .82; c.fill(); c.globalAlpha = 1;
          // 2px surface gap between stacked segments
          c.strokeStyle = surface; c.lineWidth = 2; c.beginPath();
          c.moveTo(X(0), Y(top[0]));
          for (var k4 = 1; k4 < n; k4++) c.lineTo(X(k4), Y(top[k4]));
          c.stroke();
          base = top;
        });
      } else {
        spec.series.forEach(function (s, si) {
          var col = cols[si % cols.length];
          if (spec.type === 'area') {
            c.beginPath(); c.moveTo(X(0), Y(0));
            for (var k = 0; k < n; k++) c.lineTo(X(k), Y(s.values[k] || 0));
            c.lineTo(X(n - 1), Y(0)); c.closePath();
            c.fillStyle = col; c.globalAlpha = si === 0 ? .18 : .10; c.fill(); c.globalAlpha = 1;
          }
          c.beginPath();
          for (var k5 = 0; k5 < n; k5++) {
            var px = X(k5), py = Y(s.values[k5] || 0);
            k5 ? c.lineTo(px, py) : c.moveTo(px, py);
          }
          c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
        });
      }

      // hover crosshair + markers, with a 2px surface ring so they stay legible
      if (hover >= 0 && hover < n) {
        c.strokeStyle = textCol; c.globalAlpha = .45; c.lineWidth = 1;
        c.beginPath(); c.moveTo(X(hover) + .5, padT); c.lineTo(X(hover) + .5, padT + ph); c.stroke();
        c.globalAlpha = 1;
        var acc = 0;
        spec.series.forEach(function (s, si) {
          var val = spec.stacked ? (acc += (s.values[hover] || 0)) : (s.values[hover] || 0);
          c.beginPath(); c.arc(X(hover), Y(val), 5, 0, 6.2832);
          c.fillStyle = cols[si % cols.length]; c.fill();
          c.strokeStyle = surface; c.lineWidth = 2; c.stroke();
        });
      }

      canvas._X = X; canvas._n = n; canvas._padL = padL; canvas._pw = pw;
    }

    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      var x = e.clientX - r.left;
      var n = canvas._n, padL = canvas._padL, pw = canvas._pw;
      var k = n === 1 ? 0 : Math.round((x - padL) / pw * (n - 1));
      k = Math.max(0, Math.min(n - 1, k));
      if (k !== hover) { hover = k; draw(); }
      tip.hidden = false;
      tip.innerHTML = '<b>' + esc(spec.xLabel || '') + ' ' + esc(spec.x[k]) + '</b>' +
        spec.series.map(function (s, si) {
          return '<span><i style="background:' + series_colors()[si % 3] + '"></i>' +
            esc(s.name) + '<em>' + fmt(spec.yFmt || 'num', s.values[k] || 0) + '</em></span>';
        }).join('');
      var tw = tip.offsetWidth;
      tip.style.left = Math.max(4, Math.min(r.width - tw - 4, canvas._X(k) - tw / 2)) + 'px';
    }
    function onLeave() { hover = -1; tip.hidden = true; draw(); }

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    canvas.addEventListener('touchmove', function (e) { onMove(e.touches[0]); }, { passive: true });
    canvas.addEventListener('touchend', onLeave);

    // Table view — identity is never color-alone, and the data is always readable.
    var btn = host.querySelector('.tablebtn'), tbl = host.querySelector('.charttable');
    btn.addEventListener('click', function () {
      var open = tbl.hidden;
      tbl.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide the table' : 'Show as a table';
      if (open && !tbl.innerHTML) {
        tbl.innerHTML = '<table><thead><tr><th>' + esc(spec.xLabel || '') + '</th>' +
          spec.series.map(function (s) { return '<th>' + esc(s.name) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + spec.x.map(function (xv, k) {
            return '<tr><td>' + esc(xv) + '</td>' + spec.series.map(function (s) {
              return '<td class="tnum">' + fmt(spec.yFmt || 'num', s.values[k] || 0) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table>';
      }
    });

    // A ResizeObserver fires once on observe and again on every resize, so it
    // handles both first paint and reflow — and unlike requestAnimationFrame it
    // still runs when the tab is in the background.
    host._redraw = draw;
    new ResizeObserver(function () { draw(); }).observe(host.querySelector('.canvas-wrap'));
    return host;
  }

  function renderFunnel(spec, colors) {
    var host = document.createElement('figure');
    host.className = 'chart chart-funnel';
    var max = Math.max.apply(null, spec.steps.map(function (s) { return Math.abs(s.value); }).concat([1]));
    host.innerHTML = '<figcaption><span class="chart-title">' + esc(spec.title) + '</span></figcaption>' +
      '<div class="funnel">' + spec.steps.map(function (s, k) {
        var w = Math.max(2, Math.abs(s.value) / max * 100);
        var val = fmt(spec.fmt || 'dec1', s.value);
        var drop = k > 0 && spec.steps[k - 1].value > 0
          ? ' <span class="drop">' + round(s.value / spec.steps[k - 1].value * 100, 1) + '% of previous</span>' : '';
        return '<div class="frow">' +
          '<span class="fname">' + esc(s.name) + '</span>' +
          '<span class="fbar"><i style="width:' + w + '%;background:' + colors[k % colors.length] + '"></i></span>' +
          '<span class="fval tnum">' + val + drop + '</span>' +
        '</div>';
      }).join('') + '</div>';
    return host;
  }

  /* ---------------- results ---------------- */

  function renderResults(def, out) {
    var box = document.createElement('div');
    box.className = 'calc-results';

    var h = out.hero || {};
    var heroVal = h.fmt === 'text' ? esc(h.text || '—') : fmt(h.fmt, h.value, h);
    box.innerHTML =
      '<div class="hero">' +
        '<span class="hero-label">' + esc(h.label || '') + '</span>' +
        '<span class="hero-value tnum">' + heroVal + '</span>' +
        (h.unit ? '<span class="hero-unit">' + esc(h.unit) + '</span>' : '') +
      '</div>';

    (out.warnings || []).forEach(function (w) {
      var n = document.createElement('p');
      n.className = 'note note-' + w.level;
      n.innerHTML = '<span class="note-icon" aria-hidden="true">' + (w.level === 'bad' ? '✕' : '!') + '</span>' +
        '<span><b class="sr">' + (w.level === 'bad' ? 'Error: ' : 'Warning: ') + '</b>' + esc(w.text) + '</span>';
      box.appendChild(n);
    });

    if ((out.stats || []).length) {
      var grid = document.createElement('div');
      grid.className = 'stats';
      grid.innerHTML = out.stats.map(function (s) {
        var val = s.fmt === 'text' ? esc(s.text || '—') : fmt(s.fmt, s.value, s);
        var cls = s.good ? ' is-good' : s.bad ? ' is-bad' : '';
        return '<div class="stat' + cls + '">' +
          '<span class="stat-label">' + esc(s.label) + '</span>' +
          '<span class="stat-value tnum">' + val + (s.unit ? ' <small>' + esc(s.unit) + '</small>' : '') + '</span>' +
          (s.note ? '<span class="stat-note">' + esc(s.note) + '</span>' : '') +
        '</div>';
      }).join('');
      box.appendChild(grid);
    }

    if (out.chart) box.appendChild(renderChart(out.chart));

    if (out.table && out.table.rows && out.table.rows.length) {
      var t = document.createElement('div');
      t.className = 'datatable';
      t.innerHTML = '<h3>' + esc(out.table.title) + '</h3>' +
        '<div class="scroll"><table><thead><tr>' +
          out.table.cols.map(function (cn) { return '<th>' + esc(cn) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
          out.table.rows.map(function (r) {
            return '<tr>' + r.map(function (cell, k) {
              var f = out.table.fmts[k];
              return '<td class="' + (f === 'text' ? '' : 'tnum') + '">' +
                (f === 'text' ? esc(cell) : fmt(f, cell)) + '</td>';
            }).join('') + '</tr>';
          }).join('') +
        '</tbody></table></div>';
      box.appendChild(t);
    }

    return box;
  }

  /* ---------------- page assembly ---------------- */

  function renderCalculator(def, mount) {
    var v = readURL(def, defaults(def));
    var results = document.createElement('div');
    var pending = false;

    // Coalesce bursts of input into one recompute per tick. setTimeout rather
    // than requestAnimationFrame, so results still render in a background tab.
    function recompute() {
      if (pending) return;
      pending = true;
      setTimeout(function () {
        pending = false;
        writeURL(def, v);
        var out;
        try { out = def.compute(v); }
        catch (err) {
          results.innerHTML = '<p class="note note-bad"><span class="note-icon">✕</span>' +
            '<span>Those inputs do not produce a result. Try adjusting them.</span></p>';
          return;
        }
        results.replaceChildren(renderResults(def, out));
      }, 0);
    }

    var layout = document.createElement('div');
    layout.className = 'calc-layout';
    var left = document.createElement('div');
    left.className = 'panel calc-panel';
    left.appendChild(renderForm(def, v, recompute));
    layout.appendChild(left);
    layout.appendChild(results);
    mount.appendChild(layout);

    // Assumptions — stated openly rather than buried in a disclaimer.
    if (def.assumptions && def.assumptions.length) {
      var a = document.createElement('section');
      a.className = 'prose';
      a.innerHTML = '<h2>What this assumes</h2><ul class="assumptions">' +
        def.assumptions.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      mount.appendChild(a);
    }

    if (def.faq && def.faq.length) {
      var f = document.createElement('section');
      f.className = 'prose';
      f.innerHTML = '<h2>Questions people actually ask</h2>' +
        def.faq.map(function (q) {
          return '<details class="faq"><summary>' + esc(q.q) + '</summary><p>' + esc(q.a) + '</p></details>';
        }).join('');
      mount.appendChild(f);
    }

    // Related — same category first, then anything featured.
    var related = ALL.filter(function (c) { return c.slug !== def.slug; })
      .sort(function (a2, b) {
        var sa = (a2.cat === def.cat ? 2 : 0) + (a2.featured ? 1 : 0);
        var sb = (b.cat === def.cat ? 2 : 0) + (b.featured ? 1 : 0);
        return sb - sa;
      }).slice(0, 4);
    var r = document.createElement('section');
    r.className = 'prose';
    r.innerHTML = '<h2>Related calculators</h2><div class="grid">' +
      related.map(function (c) {
        return '<a class="card" href="/apps/calculators/' + c.slug + '/">' +
          '<span class="tag">' + esc(c.cat) + '</span>' +
          '<h3>' + esc(c.short) + '</h3>' +
          '<p class="muted">' + esc(c.blurb) + '</p></a>';
      }).join('') + '</div>';
    mount.appendChild(r);

    window.addEventListener('ep-theme-change', function () {
      mount.querySelectorAll('.chart').forEach(function (ch) { if (ch._redraw) ch._redraw(); });
    });

    recompute();
  }

  /* ---------------- index page ---------------- */

  function renderIndex(mount) {
    var q = '';
    var search = document.createElement('div');
    search.className = 'calc-search';
    search.innerHTML = '<label class="sr" for="csearch">Search calculators</label>' +
      '<input type="text" id="csearch" placeholder="Search ' + ALL.length + ' calculators — mortgage, debt, ROI…" autocomplete="off">';
    mount.appendChild(search);

    var list = document.createElement('div');
    mount.appendChild(list);

    function paint() {
      var term = q.trim().toLowerCase();
      var hits = ALL.filter(function (c) {
        return !term || (c.name + ' ' + c.short + ' ' + c.cat + ' ' + c.blurb).toLowerCase().indexOf(term) >= 0;
      });
      if (!hits.length) {
        list.innerHTML = '<p class="muted" style="padding:40px 0">Nothing matches “' + esc(q) + '”. ' +
          '<a href="https://elvinpeters.com/services/?utm_source=epeters.ca&utm_medium=link&utm_campaign=apps" style="color:var(--gold-2)">Tell me what you need</a> and I will build it.</p>';
        return;
      }
      list.innerHTML = DATA.categories.map(function (cat) {
        var inCat = hits.filter(function (c) { return c.cat === cat.id; });
        if (!inCat.length) return '';
        return '<section class="catsec"><h2>' + esc(cat.id) + '</h2>' +
          '<p class="muted catblurb">' + esc(cat.blurb) + '</p><div class="grid">' +
          inCat.map(function (c) {
            return '<a class="card" href="/apps/calculators/' + c.slug + '/">' +
              (c.featured ? '<span class="tag">Popular</span>' : '') +
              '<h3>' + esc(c.short) + '</h3>' +
              '<p class="muted">' + esc(c.blurb) + '</p>' +
              '<span class="cardgo">Open →</span></a>';
          }).join('') + '</div></section>';
      }).join('');
    }
    search.querySelector('input').addEventListener('input', function (e) { q = e.target.value; paint(); });
    paint();
  }

  /* ---------------- boot ---------------- */

  function boot() {
    var mount = document.getElementById('calc-root');
    if (!mount) return;
    var slug = window.CALC_SLUG;
    if (!slug) return renderIndex(mount);
    var def = ALL.filter(function (c) { return c.slug === slug; })[0];
    if (!def) { mount.innerHTML = '<p class="muted">That calculator has moved. <a href="/apps/calculators/">See all calculators</a>.</p>'; return; }
    renderCalculator(def, mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Repaint charts when the theme flips — dark is a selected palette, not a filter.
  var mo = new MutationObserver(function () { window.dispatchEvent(new Event('ep-theme-change')); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
