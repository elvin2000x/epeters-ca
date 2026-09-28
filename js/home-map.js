/* The Rabbit Hole Map: the Constellation (card #356, the phase 2 winner). Loaded by js/home.js the first time Map opens.
   The DOM is a nested list of buttons (centre, one per interest, one per exhibit, Backstage); SVG lines follow them.
   Layout is precomputed from the exhibit list, never a physics sim. Nodes animate with transform and opacity only.
   Wide screens show everything at once; on a phone the interests come first and a tap zooms into one. */
(function(){
  'use strict';
  var ease = function(k){ return 1 - Math.pow(1 - k, 3); };
  var rad = function(d){ return d * Math.PI / 180; };
  var sideFor = function(c, s){ return c > .3 ? 'r' : c < -.3 ? 'l' : s < 0 ? 't' : 'b'; };

  function layout(D, st, W, H){
    var pos = {}, lines = [], lit = st.focus || st.hover, n = D.branches.length;
    var byB = function(id){ return D.exhibits.filter(function(e){ return e.branch === id; }); };
    if (st.wide){
      var cx = W / 2, cy = H / 2, R1x = W * .22, R1y = H * .28, R2 = Math.min(W, H) * .2;
      pos.centre = { x: cx, y: cy, s: 1, o: 1, side: 'b', dim: !!lit };
      D.branches.forEach(function(b, i){
        var a = i * 360 / n, c = Math.cos(rad(a)), s = Math.sin(rad(a));
        var hx = cx + R1x * c, hy = cy + R1y * s, isLit = lit === b.id, dim = !!lit && !isLit, sd = sideFor(c, s);
        pos['b:' + b.id] = { x: hx, y: hy, s: isLit ? 1.15 : 1, o: 1, side: sd === 'r' || sd === 'l' ? (s < 0 ? 't' : 'b') : sd, dim: dim, lit: isLit };
        lines.push(['centre', 'b:' + b.id, b.hue, dim ? .12 : .45]);
        var items = byB(b.id), m = items.length, spread = Math.min(30, 150 / m);
        items.forEach(function(e, j){
          var aa = rad(a + (j - (m - 1) / 2) * spread), ec = Math.cos(aa), es = Math.sin(aa);
          var x = hx + R2 * 1.25 * ec, y = Math.max(34, Math.min(H - 52, hy + R2 * .85 * es));
          pos[e.id] = { x: x, y: y, s: 1, o: 1, side: sideFor(ec, es), dim: dim, lit: isLit };
          lines.push(['b:' + b.id, e.id, b.hue, dim ? .1 : isLit ? .9 : .5]);
        });
      });
      pos.backstage = { x: W - 120, y: H - 36, s: 1, o: 1, side: 'r', dim: !!lit };
      return { pos: pos, lines: lines };
    }
    var cxn = W / 2;
    if (!st.focus){
      var cyn = H * .47, R = Math.min(W * .35, H * .3);
      pos.centre = { x: cxn, y: cyn, s: .9, o: 1, side: 'none' };
      D.branches.forEach(function(b, i){
        var a = rad(-90 + i * 360 / n), hx = cxn + R * Math.cos(a), hy = cyn + R * Math.sin(a);
        pos['b:' + b.id] = { x: hx, y: hy, s: 1, o: 1, side: 'b' };
        lines.push(['centre', 'b:' + b.id, b.hue, .5]);
        byB(b.id).forEach(function(e){ pos[e.id] = { x: hx, y: hy, s: .3, o: 0, on: false, side: 'b' }; });
      });
      pos.backstage = { x: cxn - 40, y: H - 40, s: 1, o: 1, side: 'r' };
      return { pos: pos, lines: lines };
    }
    var items = byB(st.focus), m = items.length, fb = D.branches.filter(function(x){ return x.id === st.focus; })[0];
    pos['b:' + fb.id] = { x: 36, y: 100, s: 1.15, o: 1, side: 'r', lit: true };
    var others = D.branches.filter(function(x){ return x.id !== st.focus; });
    others.forEach(function(o, k){
      var ox = W * (k + .5) / others.length;
      pos['b:' + o.id] = { x: ox, y: H - 46, s: .75, o: .9, side: 'none' };
      byB(o.id).forEach(function(e){ pos[e.id] = { x: ox, y: H - 46, s: .3, o: 0, on: false, side: 'b' }; });
    });
    pos.centre = { x: cxn, y: 100, s: .4, o: 0, on: false, side: 'none' };
    pos.backstage = { x: cxn, y: H - 46, s: .4, o: 0, on: false, side: 'none' };
    var top = 176, step = Math.min(96, (H - top - 130) / Math.max(1, m - 1)), prev = 'b:' + fb.id;
    items.forEach(function(e, j){
      pos[e.id] = { x: m === 1 ? cxn : (j % 2 ? W * .68 : W * .3), y: top + j * step, s: 1.15, o: 1, side: 'b' };
      lines.push([prev, e.id, fb.hue, .7]); prev = e.id;
    });
    return { pos: pos, lines: lines };
  }

  function starfield(canvas){
    var tw = canvas.cloneNode(); tw.classList.add('twinkle'); canvas.after(tw);
    function draw(){
      var r = canvas.getBoundingClientRect(); if (!r.width) return;
      var dpr = Math.min(2, devicePixelRatio || 1), ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#e9eff7';
      [canvas, tw].forEach(function(c, layer){
        c.width = r.width * dpr; c.height = r.height * dpr; var g = c.getContext('2d'); g.scale(dpr, dpr); g.fillStyle = ink;
        var seed = 7 + layer * 101, rnd = function(){ return (seed = (seed * 16807) % 2147483647) / 2147483647; };
        var n = Math.round(r.width * r.height / (layer ? 9000 : 5200));
        for (var i = 0; i < n; i++){ g.globalAlpha = (layer ? .5 : .22) * rnd() + .05; g.beginPath(); g.arc(rnd() * r.width, rnd() * r.height, rnd() * (layer ? 1.3 : .9) + .3, 0, 7); g.fill(); }
      });
    }
    var t; addEventListener('resize', function(){ clearTimeout(t); t = setTimeout(draw, 120); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
    return draw;
  }

  window.RHMapMount = function(stage, api){
    var D = api.D, esc = api.esc;
    stage.classList.add('mapstage');
    stage.innerHTML = '<h2 class="sr">Map of everything on epeters.ca</h2><canvas class="bgc" aria-hidden="true"></canvas><svg class="lines" aria-hidden="true"></svg>' +
      '<div class="navchip" hidden><button type="button">&larr; Back</button></div><ul class="nodes" aria-label="Everything on the map"></ul>';
    var ul = stage.querySelector('.nodes'), svg = stage.querySelector('.lines'), chip = stage.querySelector('.navchip');
    var nodes = {};
    function mk(id, cls, hue, html, label){
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'node ' + cls; b.dataset.id = id; if (hue) b.dataset.hue = hue;
      b.setAttribute('aria-label', label); b.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="lbl" aria-hidden="true">' + html + '</span>';
      nodes[id] = { el: b, x: 0, y: 0, s: 1, o: 0 };
      return b;
    }
    function li(child){ var l = document.createElement('li'); l.appendChild(child); return l; }
    ul.appendChild(li(mk('centre', 'centre', null, '<b>Elvin</b>', 'Elvin Peters: the newsletter and the book')));
    D.branches.forEach(function(b){
      var items = D.exhibits.filter(function(e){ return e.branch === b.id; });
      var l = li(mk('b:' + b.id, 'hub', b.hue, '<b>' + esc(b.name) + '</b><small>' + items.length + '</small>', b.name + ', ' + items.length));
      var sub = document.createElement('ul'); sub.setAttribute('aria-label', b.name);
      items.forEach(function(e){ sub.appendChild(li(mk(e.id, 'leaf' + (e.star ? ' star' : ''), b.hue, '<b>' + esc(e.title) + '</b>', e.title + ', ' + b.name))); });
      l.appendChild(sub); ul.appendChild(l);
    });
    ul.appendChild(li(mk('backstage', 'backnode', null, '<b>Backstage</b>', 'Backstage: private tools')));
    var lineEls = {};
    function lineEl(key){ return lineEls[key] || (lineEls[key] = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'line'))); }

    var state = { focus: null, wide: true, hover: null };
    var W = 0, H = 0, from = null, t0 = 0, dur = 0, raf = 0, entered = false;
    function measure(){
      var r = stage.getBoundingClientRect(); W = r.width; H = r.height;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      state.wide = W >= 860 && H >= 560; stage.classList.toggle('wide', state.wide);
      if (state.wide) chip.hidden = true;
    }
    function snapshot(){ var s = {}; for (var id in nodes){ var n = nodes[id]; s[id] = { x: n.x, y: n.y, s: n.s, o: n.o }; } return s; }
    function render(target, k){
      var e = ease(k);
      for (var id in nodes){
        var n = nodes[id], p = target.pos[id] || { x: W / 2, y: H / 2, s: .2, o: 0, on: false }, f = from && from[id] ? from[id] : p;
        n.x = f.x + (p.x - f.x) * e; n.y = f.y + (p.y - f.y) * e; n.s = f.s + (p.s - f.s) * e; n.o = f.o + (p.o - f.o) * e;
        n.el.style.transform = 'translate3d(' + n.x.toFixed(1) + 'px,' + n.y.toFixed(1) + 'px,0) scale(' + n.s.toFixed(3) + ')';
        n.el.style.opacity = n.o.toFixed(3);
        if (k >= 1 || n.el.dataset.side !== p.side) n.el.dataset.side = p.side || 'r';
        var on = p.on !== false && p.o > .05; n.el.tabIndex = on ? 0 : -1; n.el.style.pointerEvents = on ? 'auto' : 'none';
        n.el.classList.toggle('dim', !!p.dim); n.el.classList.toggle('lit', !!p.lit);
      }
      var seen = {};
      target.lines.forEach(function(l){
        var key = l[0] + '>' + l[1], L = lineEl(key), A = nodes[l[0]], B = nodes[l[1]]; seen[key] = 1;
        L.setAttribute('x1', A.x.toFixed(1)); L.setAttribute('y1', A.y.toFixed(1)); L.setAttribute('x2', B.x.toFixed(1)); L.setAttribute('y2', B.y.toFixed(1));
        L.style.color = 'var(--' + (l[2] || 'gold') + ')';
        L.style.opacity = (Math.min(A.o, B.o) * (l[3] == null ? 1 : l[3])).toFixed(3);
      });
      for (var key in lineEls) if (!seen[key]) lineEls[key].style.opacity = 0;
    }
    function frame(now){
      var k = dur ? Math.min(1, (now - t0) / dur) : 1;
      render(layout(D, state, W, H), k);
      if (k >= 1){ from = null; raf = 0; } else raf = requestAnimationFrame(frame);
    }
    function go(ms){
      from = snapshot(); t0 = performance.now(); dur = api.reduce.matches ? 0 : ms;
      if (!raf) raf = requestAnimationFrame(frame);
    }
    function setFocus(id){
      state.focus = id; stage.classList.toggle('focused', !!id);
      chip.hidden = !(id && !state.wide);
      go(650);
      if (id) setTimeout(function(){
        var first = ul.querySelector('[data-id="b:' + id + '"]').parentNode.querySelector('ul .node');
        (first || nodes['b:' + id].el).focus({ preventScroll: true });
      }, api.reduce.matches ? 0 : 450);
    }
    chip.querySelector('button').addEventListener('click', function(){
      var was = state.focus; setFocus(null);
      if (was) setTimeout(function(){ nodes['b:' + was].el.focus({ preventScroll: true }); }, 60);
    });
    ul.addEventListener('click', function(ev){
      var b = ev.target.closest('.node'); if (!b) return; var id = b.dataset.id;
      if (id === 'centre') api.openCentre();
      else if (id === 'backstage') api.openBackstage();
      else if (id.indexOf('b:') === 0){ if (!state.wide){ var bid = id.slice(2); setFocus(state.focus === bid ? null : bid); } }
      else api.openExhibit(id);
    });
    function hoverOn(ev){
      if (!state.wide) return;
      var b = ev.target.closest('.node'), bid = null;
      if (b){ var id = b.dataset.id; bid = id.indexOf('b:') === 0 ? id.slice(2) : ((D.exhibits.filter(function(e){ return e.id === id; })[0] || {}).branch || null); }
      if (state.hover !== bid){ state.hover = bid; go(0); }
    }
    ul.addEventListener('pointerover', hoverOn); ul.addEventListener('focusin', hoverOn);
    ul.addEventListener('pointerleave', function(){ if (state.hover){ state.hover = null; go(0); } });
    ul.addEventListener('focusout', function(ev){ if (!ul.contains(ev.relatedTarget) && state.hover){ state.hover = null; go(0); } });
    ul.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape' && state.focus){ ev.preventDefault(); chip.querySelector('button').click(); return; }
      if (!/^Arrow/.test(ev.key)) return;
      var cur = ev.target.closest('.node'); if (!cur) return;
      var sibs = [].slice.call(cur.closest('ul').children).map(function(l){ return l.querySelector('.node'); }).filter(function(n){ return n.tabIndex === 0; });
      var i = sibs.indexOf(cur), d = (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') ? 1 : -1;
      if (sibs.length){ ev.preventDefault(); sibs[(i + d + sibs.length) % sibs.length].focus({ preventScroll: true }); }
    });
    var rt; addEventListener('resize', function(){ if (stage.hidden) return; clearTimeout(rt); rt = setTimeout(function(){ measure(); go(250); }, 80); });
    var drawStars = starfield(stage.querySelector('.bgc'));

    return {
      shown: function(){
        measure(); drawStars();
        if (!entered){
          entered = true;
          for (var id in nodes){ var n = nodes[id]; n.x = W / 2; n.y = H / 2; n.s = .3; n.o = 0; }
          go(1150);
        } else go(0);
      }
    };
  };
})();
