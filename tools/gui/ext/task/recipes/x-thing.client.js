// recipe "look at a thing", page side: fourteen read-only question kinds. xt-find looks things up by words (GET /api/x/task/lookup:
// entity, gun, map, sound, model, picture) or picks a file with the file picker (searchKit Browse). xt-look shows it: the viewers (VIEW.mount
// in the look pane), the Models page (VIEW.modelGo), the map picture (GET /api/x/maps/picture), the gun sounds (GET /api/x/art/sound).
// xt-numbers: POST /api/x/units/stats, POST /api/x/models/armor/shells, GET /api/x/maps/list, view sound/plan, picture/info, font/info,
// model/owner. xt-compare: the same against another one. xt-pierce: the best shell against every vehicle (POST /api/x/units/search).
// xt-onmap: GET /api/x/task/r/x-thing/entities. xt-files: GET /api/x/art/unit, art/sound, ide/vdir. xt-used: POST /api/x/ide/refs
// (+ model/owner). xt-wins: GET /api/x/files/which + GET /api/x/ide/copies. xt-modchg: copies + POST /api/x/units/compare. xt-next:
// the make/change tasks of the catalogue, the base found with that task's own lookup. xt-price, xt-balance: POST /api/x/balance/table
// (read only). Nothing is written. Viewers opened here close when the screen changes or the question is left (TASK.kind leave).
// No mod picked: the game is explored as it ships (files/lib readMod). What a mod changed and the make/change tasks stay mod-only; a
// route that still refuses with no mod (the Editor's vdir, copies, refs) is asked anyway and its refusal shown as "needs a mod".
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, theme tokens only (shipped as text).
// Author: Imperator_Aug (ARSENAL, ia-e3e52e73)
'use strict';
function page() {
  if (!window.TASK || !TASK.kind) return;
  var XT = { hd: [], gen: 0, stats: {}, shells: {}, copies: {}, bal: {} };
  var LK = { unit: 'entity', gun: 'gun', map: 'map', sound: 'sound', model: 'model', picture: 'picture' };
  // Browse per kind (owner 2026-11-19: "browse should always be a file directory browse"): the file picker over the game data (the mod
  // on top) where that kind lives [I: the vanilla layout]. f: a pick of that kind is the thing itself (its file); else the pick's base
  // name (a map: its folder path) is looked up and the result for it chosen when it comes
  var XBR = { unit: { start: 'entity', exts: ['def', 'set', 'ext'] }, gun: { start: 'set/stuff' }, map: { mode: 'dir', start: 'map' },
    sound: { start: 'sound', exts: ['wav', 'ogg'], f: 1 }, model: { start: 'entity', exts: ['mdl', 'ply'], f: 1 }, picture: { start: 'interface', exts: ['dds', 'tga', 'png', 'bmp', 'jpg', 'fnt'], f: 1 } };
  var ITEMS = ['grenade', 'explosive', 'med', 'capacity', 'content', 'head', 'body', 'special', 'melee'];
  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
  function T(k, o) { return tx('task.x-thing.k.' + k, o); }
  function xtErr(e) { return T('fail', { m: String((e && (e.text || e.message)) || e || '') }); }
  function xtLook() { return document.querySelector('[data-task-look]'); }
  function xtClose() { var a = XT.hd; XT.hd = []; for (var i = 0; i < a.length; i++) { try { a[i].close(); } catch (e) { /* gone */ } } }
  function xtShow(kids) { var l = xtLook(); if (!l) return null; xtClose(); l.textContent = ''; for (var i = 0; i < kids.length; i++) if (kids[i]) l.appendChild(kids[i]); return l; }
  // leave (README Changes 35): the question is left or the window closes; the viewers end (sound stops, the 3D view ends) and the
  // retries of this screen stop
  function xtLeave() { XT.gen++; xtClose(); }
  function xtReg(name, spec) { spec.leave = xtLeave; return TASK.kind(name, spec); }
  function xtAns(st, id) { return st.draft && st.draft.answers ? st.draft.answers[id] : null; }
  function xtKind(st) { var a = xtAns(st, 'kind'); return a && (a.src === 'value' || a.src === 'exist') ? String(a.value) : ''; }
  function xtThing(st) { var a = xtAns(st, 'thing'), k = xtKind(st); return a && a.src === 'exist' && a.of === k ? a : null; }
  function xtMod(st) { return (st.draft && st.draft.mod) || S.mod || ''; }
  function xtBase(p) { return String(p || '').split('/').pop(); }
  function xtStem(p) { return xtBase(p).replace(/\.[^.]*$/, ''); }
  function xtDir(p) { var s = String(p || ''); return s.slice(0, s.lastIndexOf('/')); }
  function xtRefuse(host, k) { host.appendChild(h('div', { class: 'tk-refuse', text: T(k || 'noThing') })); }
  // the readers of a mod's layered view (files/lib checkMod) need a mod: without one the screen says so and shows the rest
  function xtNoMod(st, host) { if (xtMod(st)) return false; host.appendChild(h('div', { class: 'hint', 'data-xt-nomod': '1', text: T('needMod') })); return true; }
  // the screens on a route that may still want a mod (the Editor's ide/vdir, ide/copies, ide/refs) ask it anyway and say "needs a mod"
  // only when it refuses with no mod picked: once the route reads the game alone, the screen works by itself
  function xtModRefused(st, e) { return !xtMod(st) && !!e && e.status === 400; }
  function xtNoModEl() { return h('div', { class: 'hint', 'data-xt-nomod': '1', text: T('needMod') }); }
  function xtRow(k, v) { return h('div', { class: 'xt-row' }, [h('span', { class: 'xt-k', text: T(k) }), h('span', { text: v == null || v === '' ? '-' : String(v) })]); }
  function xtRows(host, rows) { for (var i = 0; i < rows.length; i++) if (rows[i][1] != null && rows[i][1] !== '') host.appendChild(xtRow(rows[i][0], rows[i][1])); }
  function xtYes(b) { return T(b ? 'n.yes' : 'n.no'); }
  function xtArm(a) { return a ? [a.front, a.side, a.rear, a.top].join(' / ') : ''; }
  // a button that leaves the task (the Editor, the Models page, a viewer's own page): the task is saved and closes, then the place
  // opens and a toast says how to come back; fn says whether the place opened
  function xtAway(fn) { TASK.close().then(function () { toast(fn() ? T('saved') : T('nolink')); }); }
  function xtGo(link) { xtAway(function () { return typeof as2Link === 'function' && as2Link(link); }); }
  // the Models page takes what the viewers take (VIEW.item): when it cannot take this ref the task stays open and says so
  function xtModel(ref, name) { if (typeof VIEW !== 'undefined' && VIEW.item && !VIEW.item(ref, name, 'model')) { toast(T('needMod')); return; } xtAway(function () { return typeof VIEW !== 'undefined' && VIEW.modelGo && VIEW.modelGo(ref, name); }); }
  // a file in the look pane: a viewer when it has one that fits a box, else a button that opens it where it belongs
  function xtView(ref, name) {
    var l = xtShow([h('b', { text: name || ref.key || '' })]); if (!l) return;
    var V = typeof VIEW !== 'undefined' ? VIEW : null, k = V && V.kindOf ? V.kindOf(name, ref.key) : null, s = k && V.spec ? V.spec(k) : null;
    if (s && s.where === 'tab' && V.mount) { XT.hd.push(V.mount(l, ref, name)); return; }
    l.appendChild(h('div', { class: 'hint', text: T('noView') }));
    l.appendChild(h('button', { type: 'button', text: T('open'), title: T('closes'), 'data-xt-open': ref.key || '', onclick: function () { xtAway(function () { return V && V.open(ref, name); }); } }));
    l.appendChild(h('div', { class: 'hint', text: T('closes') }));
  }
  function xtFileBtn(key, label) { return h('button', { type: 'button', class: 'xt-f', 'data-xt-file': key, text: label || xtBase(key), onclick: function () { xtView({ key: key }, xtBase(key)); } }); }
  function xtCached(box, k, make) { var c = box[k]; if (c) return c; var p = make(); box[k] = p; p.catch(function () { if (box[k] === p) delete box[k]; }); return p; }
  function xtStats(mod, id) { return xtCached(XT.stats, mod + '|' + id, function () { return api('/api/x/units/stats', { id: id, mod: mod }); }); }
  function xtShells(mod, id) { return xtCached(XT.shells, mod + '|' + id, function () { return api('/api/x/models/armor/shells', { weapon: id, mod: mod }); }); }
  // penetration [[range, mm], ...] at a range: straight lines between the points, 0 past the last
  function xtPen(arr, r) {
    if (!arr || !arr.length) return 0; if (r <= arr[0][0]) return arr[0][1];
    for (var i = 1; i < arr.length; i++) if (r <= arr[i][0]) { var a = arr[i - 1], b = arr[i]; return Math.round(a[1] + (b[1] - a[1]) * (r - a[0]) / ((b[0] - a[0]) || 1)); }
    return 0;
  }
  function xtBest(sh) { var best = null; (sh && sh.shells || []).forEach(function (s) { var p = s.penetration && s.penetration.length ? s.penetration[0][1] : 0; if (!best || p > best.p) best = { s: s, p: p }; }); return best ? best.s : null; }
  // the file the game reads for the thing (a promise of a key or '')
  function xtKey(st) {
    var t = xtThing(st), k = xtKind(st); if (!t) return Promise.resolve('');
    if (k === 'unit') return xtStats(xtMod(st), t.value).then(function (s) { return s.def || ''; });
    if (k === 'map') return Promise.resolve('resource/' + t.value + '/map');
    return Promise.resolve((t.ref && t.ref.key) || '');
  }
  function xtWord(t, k) { if (k === 'map') return xtBase(t.value); if (k === 'unit' || k === 'gun') return t.value; return xtStem(t.ref && t.ref.key || t.value); }

  // ---- find: words or browse
  // the words box (owner 2026-11-19: every search box has an indexed search, a manual Browse and a history list; searchKit in page.js):
  // the hits are asked a short pause after each key, and the kit's index rows come from those same answers (no second call per key,
  // an answer for older words dropped; an empty box gets the first answer). Browse: the file picker at the kind's folder (XBR); a file
  // kind's pick is picked at once, a unit, gun or map is looked up by the pick's name and chosen when the answer has it.
  // History key task.sk.x-thing.<kind>. A stand-in page with no kit keeps the bare box
  function xtSearch(st, host, kind, onPick, sel) {
    var inp = h('input', { type: 'search', autocomplete: 'off', placeholder: T('words'), 'aria-label': T('words'), 'data-xt-words': '1' });
    var say = h('div', { class: 'hint' }), box = h('div', { class: 'xt-hits', 'data-xt-hits': '1' }), gen = XT.gen, tries = 0;
    // a lookup with nothing to pick may say why and what to do (a lang key or words); a result with the id ? is a message line
    function words(s, p) { s = String(s == null ? '' : s); return /^[a-z][\w-]*(\.[\w-]+)+$/.test(s) ? tx(s, p) : s; }
    var last = null, pend = null, flying = null, tm = null, due = false, shown = { rs: [], more: 0 }, pb = null;
    function item(r) { var id = String(r.id == null ? '' : r.id), nm = r.name && r.name !== id ? String(r.name) : id; return { label: nm, value: id, hint: [nm !== id ? id : '', r.sub || ''].filter(Boolean).join('  '), r: r }; }
    function list(rs, more) {
      shown = { rs: rs, more: more };
      box.textContent = '';
      rs.forEach(function (r) {
        var on = sel() && sel().value === r.id;
        box.appendChild(h('button', { type: 'button', class: 'xt-hit' + (on ? ' xt-on' : ''), 'data-xt-hit': r.id, text: (r.name && r.name !== r.id ? r.name + '  (' + r.id + ')' : r.id) + (r.sub ? '  ' + r.sub : ''), onclick: function () { onPick(r); list(rs, more); } }));
      });
      if (more) say.textContent = T('more', { n: more });
    }
    function lookUrl(w) { return '/api/x/task/lookup?kind=' + enc(LK[kind]) + '&q=' + enc(w) + '&mod=' + enc(xtMod(st)) + '&recipe=x-thing&limit=60'; }
    var seq = 0;
    function run() {
      if (gen !== XT.gen) return;
      if (tm) { clearTimeout(tm); tm = null; } due = false;
      var w = String(inp.value || '').trim(), my = ++seq; flying = w; say.textContent = T('looking'); box.textContent = '';
      api(lookUrl(w)).then(function (r) {
        if (gen !== XT.gen || my !== seq) return;
        if (r.state === 'running' && tries++ < 40) { say.textContent = T('wait'); setTimeout(run, 1500); return; }
        var rs = (r.results || []).filter(function (x) { return x && x.id !== '?'; }), msgs = (r.results || []).filter(function (x) { return x && x.id === '?'; });
        say.textContent = rs.length ? '' : r.why ? '' : msgs.length ? msgs.map(function (m) { return words(m.name); }).join(' ') : (r.didYouMean ? T('mean', { w: r.didYouMean }) : T('none'));
        // a Browse pick looked up: its result is chosen (the same file, else the same id or name)
        if (pb && pb.w === w) { var b = pb, lo = function (v) { return String(v == null ? '' : v).toLowerCase(); }; pb = null;
          var hit = b.key ? rs.filter(function (x) { return x.ref && x.ref.key && lo(x.ref.key) === lo(b.key); })[0] : null;
          if (!hit) hit = rs.filter(function (x) { return lo(x.id) === lo(w) || lo(x.name) === lo(w); })[0]; if (hit) onPick(hit); }
        list(rs, r.more ? (r.total - rs.length) : 0);
        if (!rs.length && r.why) { box.appendChild(h('div', { class: 'xt-warn', 'data-xt-why': '1', text: words(r.why, r.params) })); if (r['do']) box.appendChild(h('div', { class: 'hint', 'data-xt-do': '1', text: words(r['do'], r.params) })); }
        if (r.state !== 'running') { flying = null; last = { q: w, items: rs.map(item), more: r.more ? (r.total - rs.length) : 0 }; if (pend && pend.q === w) { var p = pend; pend = null; p.done(last.items, last.more); } }
      }).catch(function (e) { if (gen === XT.gen && my === seq) { flying = null; say.textContent = xtErr(e); } });
    }
    function soon() { if (tm) clearTimeout(tm); due = true; tm = setTimeout(function () { tm = null; if (due) run(); }, 350); }
    inp.addEventListener('input', soon);
    var ui = { box: box, say: say, run: run, inp: inp }, xb = XBR[kind] || {};
    var ko = { key: 'task.sk.x-thing.' + kind,
      index: function (s, done) { if (last && last.q === s) { done(last.items, last.more); return; } pend = { q: s, done: done }; if (!due && flying !== s) soon(); },
      browse: { mode: xb.mode === 'dir' ? 'dir' : 'file', view: 'data', start: xb.start || '', exts: xb.exts || null,
        toValue: function (p, e) { var g = String((e && e.path) || p || '').replace(/[\\\/]+$/, '').replace(/\\/g, '/').replace(/^resource\//i, ''); return xb.mode === 'dir' ? g : xb.f ? xtBase(g) : xtStem(g); } },
      onPick: function (v, it, from) {
        if (it && it.r) { onPick(it.r); list(shown.rs, shown.more); return; }
        if (from === 'browse' && xb.f && it && it.key) { inp.value = v; onPick({ id: it.key, name: it.name || xtBase(it.key), ref: { key: it.key }, sub: xtDir(it.key).slice(9), where: it.where || '' }); list(shown.rs, shown.more); return; }
        inp.value = v; pb = from === 'browse' ? { w: String(v).trim(), key: it && it.key ? it.key : '' } : null; run(); } };
    var kit = typeof searchKit === 'function' ? searchKit(inp, ko) : null;
    if (kit) kit.browseButton.setAttribute('data-xt-browse', '1');
    // Enter here is Find, not the task window's Next (an Enter the kit used for a row of its list is stopped by the kit)
    inp.addEventListener('keydown', function (e) { if (e._sk) return; if (e.key === 'Enter') { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); run(); } });
    var row = h('div', { class: 'row' }, [kit ? kit.el : inp, h('button', { type: 'button', class: 'primary', 'data-xt-find': '1', text: T('find'), onclick: run })]);
    host.appendChild(row); host.appendChild(say); host.appendChild(box);
    ui.row = row; ui.kit = kit; return ui;
  }
  // ---- what kind: one of six, a unit picked to start with (Next works at once)
  var KINDS = ['unit', 'gun', 'map', 'sound', 'model', 'picture'];
  xtReg('xt-kind', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var a = st.answer && (st.answer.src === 'value' || st.answer.src === 'exist') ? String(st.answer.value) : '';
      st.kind = KINDS.indexOf(a) >= 0 ? a : 'unit';
      var box = h('div', { class: 'tk-src', role: 'radiogroup', 'data-xt-kinds': '1' });
      KINDS.forEach(function (k) {
        var r = h('input', { type: 'radio', name: 'xtkind', value: k, 'data-xt-kind': k });
        r.checked = k === st.kind; r.addEventListener('change', function () { st.kind = k; });
        box.appendChild(h('label', {}, [r, h('span', { text: ' ' + tx('task.x-thing.v.kind.' + k) })]));
      });
      host.appendChild(box);
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: KINDS.indexOf(st.kind) >= 0 ? st.kind : 'unit' } }; },
  });
  xtReg('xt-find', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var kind = xtKind(st); if (!kind) { xtRefuse(host, 'noKind'); return; }
      var a = st.answer && st.answer.src === 'exist' && st.answer.of === kind ? st.answer : xtThing(st);
      st.pick = a ? { id: a.value, name: a.name, ref: a.ref, sub: a.sub, where: a.where } : null;
      var got = h('div', { class: 'xt-got', 'data-xt-got': '1', text: st.pick ? T('picked', { n: st.pick.name || st.pick.id }) : '' });
      host.appendChild(got);
      function pick(r) { st.pick = r; got.textContent = T('picked', { n: r.name || r.id }); }
      host.appendChild(h('div', { class: 'hint', 'data-xt-eg': kind, text: T('eg.' + kind) }));
      var ui = xtSearch(st, host, kind, pick, function () { return st.pick ? { value: st.pick.id } : null; });
      ui.run();   // with no words: the first ones of this kind, so a player sees names before typing
    },
    value: function (q, st) {
      var p = st.pick, kind = xtKind(st); if (!p) return { ok: false, why: T('pickOne') };
      var sub = String(p.sub || ''), ans = { src: 'exist', value: p.id, name: p.name || p.id, ref: p.ref || null, sub: sub, where: p.where || '', of: kind };
      if (kind === 'unit') ans.unit = sub.split(' ')[0] || 'vehicle';
      return { ok: true, answer: ans };
    },
  });

  // ---- look
  xtReg('xt-look', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), k = xtKind(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-look': k });
      host.appendChild(h('b', { text: t.name })); host.appendChild(say); host.appendChild(box);
      function fail(e) { say.textContent = xtErr(e); }
      if (k === 'unit') api('/api/x/art/unit?mod=' + enc(mod) + '&name=' + enc(t.value)).then(function (r) {
        say.textContent = r.found ? '' : T('nofiles'); var first = null;
        (r.groups || []).forEach(function (g) {
          if (g.role !== 'icon' && g.role !== 'texture' && g.role !== 'model') return;
          box.appendChild(h('div', { class: 'xt-k', text: T('f.role.' + g.role) }));
          g.files.slice(0, 8).forEach(function (f) {
            if (g.role === 'model') box.appendChild(h('button', { type: 'button', class: 'primary', title: T('closes'), 'data-xt-3d': f.key, text: T('models'), onclick: function () { xtModel({ key: f.key }, xtBase(f.key)); } }));
            else { box.appendChild(xtFileBtn(f.key)); if (!first) first = f.key; }
          });
        });
        if (first) xtView({ key: first }, xtBase(first));
      }).catch(fail);
      else if (k === 'gun') api('/api/x/art/sound?mod=' + enc(mod) + '&weapon=' + enc(t.value)).then(function (r) {
        var first = null; say.textContent = (r.sounds || []).length ? T('l.snd') : T('nofiles');
        (r.sounds || []).forEach(function (s) {
          box.appendChild(h('div', { class: 'xt-k', text: (s.kind || '') + '  ' + (s.name || '') }));
          (s.files || []).slice(0, 8).forEach(function (f) { box.appendChild(xtFileBtn(f)); if (!first) first = f; });
        });
        if (first) xtView({ key: first }, xtBase(first));
      }).catch(fail);
      else if (k === 'map') {
        var pv = 'resource/' + t.value + '/preview.dds';
        box.appendChild(h('button', { type: 'button', 'data-xt-file': pv, text: T('l.preview'), onclick: function () { xtView({ key: pv }, 'preview.dds'); } }));
        api('/api/x/maps/picture?map=' + enc(t.value)).then(function (r) {
          if (!r.svg) { say.textContent = T('l.nopic'); return; }
          say.textContent = T('l.pic');
          box.appendChild(h('img', { class: 'xt-map', alt: t.name, 'data-xt-svg': '1', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg) }));
        }).catch(fail);
        xtView({ key: pv }, 'preview.dds');
      } else if (k === 'model') {
        say.textContent = '';
        box.appendChild(h('button', { type: 'button', class: 'primary', title: T('closes'), 'data-xt-3d': t.ref.key, text: T('models'), onclick: function () { xtModel(t.ref, t.name); } }));
        xtView(t.ref, t.name);
      } else { say.textContent = ''; xtView(t.ref, t.name); }
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- numbers
  function xtUnitRows(s) {
    var g = s.gun || {};
    return [['n.name', s.name], ['n.kind', s.kind], ['n.army', s.army], ['n.cost', s.cost], ['n.level', s.level], ['n.buy', xtYes(s.buyable)], ['n.speed', s.speed], ['n.mass', s.mass],
      ['n.crew', s.crew], ['n.armor', xtArm(s.armor)], ['n.gun', g.weapon], ['n.damage', g.damage], ['n.pen', g.pen], ['n.reload', g.reload], ['n.range', g.range], ['n.def', s.def]];
  }
  function xtShellRows(s) {
    return [['n.shell', s.ammo], ['n.skind', s.kind], ['n.cal', s.calibre], ['n.near', s.penetration && s.penetration.length ? s.penetration[0][1] : ''],
      ['n.far', xtPen(s.penetration, s.aimRange || 0)], ['n.aim', s.aimRange], ['n.max', s.maxRange]];
  }
  xtReg('xt-numbers', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), k = xtKind(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-nums': k }), key = t.ref && t.ref.key;
      host.appendChild(h('b', { text: t.name })); host.appendChild(say); host.appendChild(box);
      function fail(e) { say.textContent = xtErr(e); }
      if (k === 'unit') xtStats(mod, t.value).then(function (s) { say.textContent = ''; xtRows(box, xtUnitRows(s)); }).catch(fail);
      else if (k === 'gun') xtShells(mod, t.value).then(function (r) {
        say.textContent = (r.shells || []).length ? '' : T('n.noshell');
        (r.shells || []).forEach(function (s) { var c = h('div', { class: 'xt-card' }); xtRows(c, xtShellRows(s)); box.appendChild(c); });
      }).catch(fail);
      else if (k === 'map') api('/api/x/maps/list').then(function (r) {
        var m = null; (r.maps || []).forEach(function (x) { if (x.key === t.value) m = x; });
        if (!m) { say.textContent = r.state === 'running' ? T('wait') : T('nofiles'); return; }
        say.textContent = ''; xtRows(box, [['n.name', m.name], ['n.folder', m.key], ['n.players', m.players], ['n.modes', (m.modes || []).join(', ')], ['n.mods', (m.mods || []).join(', ') || m.mod || T('n.game')]]);
      }).catch(fail);
      else if (k === 'sound') api('/api/x/view/sound/plan?mod=' + enc(mod) + '&key=' + enc(key)).then(function (r) {
        var hd = r.header || {}, rs = r.plan && r.plan.resolve, n = rs && rs.files ? rs.files.length : 0;
        say.textContent = ''; xtRows(box, [['n.codec', [r.kind, hd.codec].filter(Boolean).join(' ')], ['n.ch', hd.channels], ['n.rate', hd.rate], ['n.secs', hd.seconds != null ? (+hd.seconds).toFixed(2) : ''], ['n.size', r.size]]);
        if (n > 1) box.appendChild(h('div', { class: 'hint', text: T('l.vars', { n: n }) }));
      }).catch(fail);
      else if (k === 'picture' && /\.fnt$/.test(key || '')) api('/api/x/view/font/info?mod=' + enc(mod) + '&key=' + enc(key)).then(function (r) {
        var fi = r.info || {}, fc = r.common || {};
        say.textContent = '';
        xtRows(box, [['n.name', fi.name || (r.font && r.font.name)], ['n.fsize', fi.fontSize != null ? Math.abs(fi.fontSize) : ''], ['n.chars', r.chars ? r.chars.length : ''],
          ['n.line', fc.lineHeight], ['n.pages', r.pages ? r.pages.length : ''], ['n.size', r.size]]);
        (r.pageFiles || []).forEach(function (p) { if (!p.ref) box.appendChild(h('div', { class: 'xt-warn', text: T('n.nopage', { n: p.name || p.stem || '' }) })); });
      }).catch(fail);
      else if (k === 'picture') api('/api/x/view/picture/info?mod=' + enc(mod) + '&key=' + enc(key)).then(function (r) {
        say.textContent = r.error ? xtErr(r.error) : '';
        xtRows(box, [['n.fmt', r.format || r.type], ['n.wh', r.width ? r.width + ' x ' + r.height : ''], ['n.mips', r.mips], ['n.alpha', r.alpha], ['n.size', r.size]]);
        (r.notes || []).forEach(function (n) { box.appendChild(h('div', { class: n.level === 'warn' ? 'xt-warn' : 'hint', text: n.msg || n.code })); });
      }).catch(fail);
      else if (k === 'model') api('/api/x/view/model/owner?mod=' + enc(mod) + '&key=' + enc(key)).then(function (r) {
        say.textContent = r.note || '';
        xtRows(box, [['n.model', r.target], ['n.part', r.sel && r.sel.bone], ['n.where', r.where], ['n.pak', r.inPak]]);
      }).catch(fail);
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- compare (units, guns)
  xtReg('xt-compare', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), k = xtKind(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      var a = st.answer && st.answer.src === 'value' && st.answer.other ? st.answer : null;
      st.other = a ? { id: a.other, name: a.value } : null;
      host.appendChild(h('div', { class: 'hint', text: T('c.skip') }));
      var side = h('div', { class: 'xt-list', 'data-xt-side': '1' });
      function show() {
        side.textContent = ''; if (!st.other) return;
        var A = k === 'unit' ? xtStats(mod, t.value) : xtShells(mod, t.value), B = k === 'unit' ? xtStats(mod, st.other.id) : xtShells(mod, st.other.id);
        Promise.all([A, B]).then(function (r) {
          var ra, rb;
          if (k === 'unit') { ra = xtUnitRows(r[0]); rb = xtUnitRows(r[1]); }
          else { var sa = xtBest(r[0]), sb = xtBest(r[1]); ra = sa ? xtShellRows(sa) : []; rb = sb ? xtShellRows(sb) : []; if (!sa || !sb) side.appendChild(h('div', { class: 'hint', text: T('n.noshell') })); }
          side.appendChild(h('div', { class: 'xt-row xt-3' }, [h('span', { class: 'xt-k', text: '' }), h('b', { text: t.name }), h('b', { text: st.other.name || st.other.id })]));
          var by = {}; rb.forEach(function (x) { by[x[0]] = x[1]; });
          ra.forEach(function (x) {
            var va = x[1] == null ? '' : String(x[1]), vb = by[x[0]] == null ? '' : String(by[x[0]]);
            if (va === '' && vb === '') return;
            side.appendChild(h('div', { class: 'xt-row xt-3' + (va !== vb ? ' xt-diff' : '') }, [h('span', { class: 'xt-k', text: T(x[0]) }), h('span', { text: va || '-' }), h('span', { text: vb || '-' })]));
          });
        }).catch(function (e) { side.appendChild(h('div', { class: 'tk-refuse', text: xtErr(e) })); });
      }
      xtSearch(st, host, k, function (r) { st.other = { id: r.id, name: r.name || r.id }; show(); }, function () { return st.other ? { value: st.other.id } : null; });
      host.appendChild(side); show();
    },
    value: function (q, st) { var o = st.other; return { ok: true, answer: { src: 'value', value: o ? (o.name || o.id) : T('c.none'), other: o ? o.id : '' } }; },
  });

  // ---- what a gun pierces
  xtReg('xt-pierce', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-pierce': '1' });
      host.appendChild(say); host.appendChild(box);
      Promise.all([xtShells(mod, t.value), api('/api/x/units/search', { q: '', all: true, kind: 'vehicle', limit: 1000, mod: mod })]).then(function (r) {
        var s = xtBest(r[0]); if (!s) { say.textContent = T('n.noshell'); return; }
        var near = s.penetration[0][1], far = xtPen(s.penetration, s.aimRange || 0), vs = (r[1].results || []).filter(function (v) { return v.armor && v.armor.front != null; });
        var a = 0, b = 0; vs.forEach(function (v) { if (v.armor.front <= near) a++; if (v.armor.front <= far) b++; });
        say.textContent = '';
        box.appendChild(h('div', { class: 'xt-k', text: T('p.shell', { s: s.ammo, near: near, far: far }) }));
        box.appendChild(h('div', { 'data-xt-sum': a + '/' + b + '/' + vs.length, text: T('p.sum', { a: a, b: b, n: vs.length }) }));
        box.appendChild(h('div', { class: 'xt-warn', text: T('p.slope') }));
        box.appendChild(h('div', { class: 'xt-k', text: T('p.list') }));
        vs.filter(function (v) { return v.armor.front > near; }).sort(function (x, y) { return y.armor.front - x.armor.front; }).slice(0, 30).forEach(function (v) {
          box.appendChild(h('div', { class: 'xt-row', 'data-xt-tank': v.id }, [h('span', { text: v.name || v.id }), h('span', { text: xtArm(v.armor) + '  ' + T(v.armor.side <= near ? 'p.side' : 'p.noside') })]));
        });
      }).catch(function (e) { say.textContent = xtErr(e); });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- what stands on a map
  xtReg('xt-onmap', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st); if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-onmap': '1' });
      host.appendChild(say); host.appendChild(box);
      api('/api/x/task/r/x-thing/entities?map=' + enc(t.value) + '&mod=' + enc(xtMod(st))).then(function (r) {
        if (!r.total) { say.textContent = T('o.none'); return; }
        say.textContent = T('o.sum', { n: r.total, k: r.kinds }) + '  ' + T('o.files') + (r.files || []).join(', ');
        (r.defs || []).forEach(function (d) { box.appendChild(h('div', { class: 'xt-row', 'data-xt-def': d.def }, [h('span', { text: d.def }), h('span', { text: String(d.n) })])); });
        if (r.more) box.appendChild(h('div', { class: 'hint', text: T('more', { n: r.kinds - r.defs.length }) }));
      }).catch(function (e) { say.textContent = xtErr(e); });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- the files it is made of
  xtReg('xt-files', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), k = xtKind(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-files': k });
      host.appendChild(say); host.appendChild(box);
      function fail(e) { say.textContent = xtErr(e); }
      function folder(d) {
        api('/api/x/ide/vdir?mod=' + enc(mod) + '&dir=' + enc(d)).then(function (r) {
          say.textContent = (r.files || []).length ? T('f.folder') + '  resource/' + (r.dir || d) : T('nofiles');
          (r.files || []).slice(0, 80).forEach(function (f) { box.appendChild(xtFileBtn(f.key, f.name + (f.where && f.where !== 'vanilla' ? '  (' + f.where + ')' : ''))); });
          (r.dirs || []).forEach(function (x) { box.appendChild(h('div', { class: 'hint', text: x + '/' })); });
        }).catch(function (e) { if (xtModRefused(st, e)) { say.textContent = ''; box.appendChild(xtNoModEl()); } else fail(e); });
      }
      if (k === 'unit') api('/api/x/art/unit?mod=' + enc(mod) + '&name=' + enc(t.value)).then(function (r) {
        say.textContent = r.found ? '' : T('nofiles');
        (r.groups || []).forEach(function (g) {
          box.appendChild(h('div', { class: 'xt-k', text: T('f.role.' + g.role) + '  (' + g.files.length + ')' }));
          g.files.slice(0, 40).forEach(function (f) { box.appendChild(xtFileBtn(f.key, xtBase(f.key) + (f.inMod ? '  (' + T('f.inmod') + ')' : ''))); });
        });
      }).catch(fail);
      else if (k === 'gun') api('/api/x/art/sound?mod=' + enc(mod) + '&weapon=' + enc(t.value)).then(function (r) {
        say.textContent = '';
        box.appendChild(h('div', { class: 'xt-k', text: T('f.stuff') }));
        (r.stuffFiles || [t.ref && t.ref.key]).forEach(function (f) { if (f) box.appendChild(xtFileBtn(f, f.slice(9))); });
        box.appendChild(h('div', { class: 'xt-k', text: T('f.sounds') }));
        (r.sounds || []).forEach(function (s) { (s.files || []).forEach(function (f) { box.appendChild(xtFileBtn(f, f.slice(9))); }); });
      }).catch(fail);
      else if (k === 'map') folder(t.value);
      else folder(xtDir((t.ref && t.ref.key) || '').replace(/^resource\//, ''));
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- where it is used
  xtReg('xt-used', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), k = xtKind(st), mod = xtMod(st), gen = XT.gen, tries = 0; if (!t) { xtRefuse(host); return; }
      var name = xtWord(t, k), say = h('div', { class: 'hint', text: T('looking') }), own = h('div', { class: 'xt-list' }), box = h('div', { class: 'xt-list', 'data-xt-used': name });
      host.appendChild(h('b', { text: name })); host.appendChild(own); host.appendChild(say); host.appendChild(box);
      if ((k === 'model' || k === 'picture') && t.ref && t.ref.key) api('/api/x/view/model/owner?mod=' + enc(mod) + '&key=' + enc(t.ref.key)).then(function (r) {
        if (!r.found || !r.target) return;
        own.appendChild(h('div', { class: 'xt-k', text: T('u.owner') }));
        (r.candidates && r.candidates.length ? r.candidates : [{ target: r.target }]).slice(0, 10).forEach(function (c) {
          own.appendChild(h('button', { type: 'button', class: 'xt-f', title: T('closes'), 'data-xt-owner': c.target, text: c.target === t.ref.key ? c.target + '  (' + T('u.self') + ')' : c.target, onclick: function () { xtModel({ key: c.target }, xtBase(c.target)); } }));
        });
      }).catch(function () { /* no owner: the refs still show */ });
      function run() {
        if (gen !== XT.gen) return;
        api('/api/x/ide/refs', { mod: mod, name: name }).then(function (r) {
          if (gen !== XT.gen) return;
          if (r.building && tries++ < 20) { say.textContent = T('u.building'); setTimeout(run, 1500); return; }
          // a scan cut short (truncated) is not "no file names it"; the line says why it stopped (r.why from ide/intel/nav.js:
          // 'time' or 'abort' = out of time, 'hits' = the hit cap, 'files' = the file cap, 'error' = it failed part way)
          var hs = r.hits || []; say.textContent = hs.length ? T('u.sum', { n: hs.length }) : r.truncated ? '' : T('u.none');
          var cut = r.why === 'error' ? 'u.fail' : r.why === 'hits' && hs.length ? 'u.cap' : r.why === 'hits' || r.why === 'files' ? 'u.capfiles' : hs.length ? 'u.cutsome' : 'u.cut';
          if (r.truncated) box.appendChild(h('div', { class: 'hint', 'data-xt-cut': r.why || '1', text: T(cut, { n: hs.length }) }));
          hs.slice(0, 60).forEach(function (x) {
            box.appendChild(h('div', { class: 'xt-hitrow' }, [
              h('button', { type: 'button', class: 'xt-f', title: T('closes'), 'data-xt-link': x.link, text: String(x.link || '').replace(/^key:resource\//, '') + (x.where ? '  (' + x.where + ')' : ''), onclick: function () { xtGo(x.link); } }),
              h('div', { class: 'xt-code', text: String(x.text || '').slice(0, 200) })]));
          });
        }).catch(function (e) { if (gen !== XT.gen) return; if (xtModRefused(st, e)) { say.textContent = ''; box.appendChild(xtNoModEl()); } else say.textContent = xtErr(e); });
      }
      run();
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- which file wins and why; what a mod changed
  function xtCopies(st) {
    var mod = xtMod(st);
    return xtKey(st).then(function (key) {
      if (!key) return { key: '', which: null, copies: null };
      var ck = mod + '|' + key;
      return xtCached(XT.copies, ck, function () {
        return Promise.all([api('/api/x/files/which?mod=' + enc(mod) + '&key=' + enc(key)).catch(function (e) { return { error: e }; }),
          api('/api/x/ide/copies?mod=' + enc(mod) + '&key=' + enc(key)).catch(function (e) { return { error: e }; })]).then(function (r) {
          if (r[0].error || r[1].error) delete XT.copies[ck];   // a refusal is asked again next time (the route may open meanwhile)
          return { key: key, which: r[0], copies: r[1] };
        });
      });
    });
  }
  xtReg('xt-wins', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      if (!xtThing(st)) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-wins': '1' });
      host.appendChild(say); host.appendChild(box);
      xtCopies(st).then(function (r) {
        if (!r.key) { say.textContent = T('nofiles'); return; }
        say.textContent = T('w.why');
        box.appendChild(h('div', { class: 'xt-k', text: T('w.key') }));
        box.appendChild(xtFileBtn(r.key, r.key));
        var cs = r.copies && r.copies.copies;
        if (cs && cs.length) cs.forEach(function (c) {
          box.appendChild(h('div', { class: 'xt-row' + (c.winner ? ' xt-win' : ''), 'data-xt-copy': c.kind }, [h('span', { text: (c.winner ? T('w.wins') + '  ' : '') + T('w.kind.' + (/^(vanilla|mine|othermod|off|deleted)$/.test(c.kind) ? c.kind : 'othermod')) + '  ' + (c.label || '') }), h('span', { class: 'xt-code', text: c.where || '' })]));
        });
        else ((r.which && r.which.chain) || []).forEach(function (c) {
          box.appendChild(h('div', { class: 'xt-row' + (c.winner ? ' xt-win' : ''), 'data-xt-copy': c.kind }, [h('span', { text: (c.winner ? T('w.wins') + '  ' : '') + T('w.kind.' + (/^(vanilla|mine|othermod|off|deleted)$/.test(c.kind) ? c.kind : 'othermod')) + '  ' + (c.layer || '') }), h('span', { class: 'xt-code', text: (c.container ? xtBase(c.container) + ' > ' : '') + (c.entry || '') })]));
        });
        if (r.copies && r.copies.error && !(r.which && r.which.chain)) box.appendChild(xtModRefused(st, r.copies.error) ? xtNoModEl() : h('div', { class: 'tk-refuse', text: xtErr(r.copies.error) }));
      }).catch(function (e) { say.textContent = xtErr(e); });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });
  xtReg('xt-modchg', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), k = xtKind(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      if (xtNoMod(st, host)) return;
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-modchg': '1' });
      host.appendChild(say); host.appendChild(box);
      xtCopies(st).then(function (r) {
        var cs = (r.copies && r.copies.copies) || [], mine = cs.filter(function (c) { return c.kind === 'mine'; }), other = cs.filter(function (c) { return c.kind === 'othermod' || c.kind === 'off'; });
        say.textContent = '';
        box.appendChild(h('div', { 'data-xt-mine': mine.length ? '1' : '0', text: mine.length ? T('m.mine') : T('m.none') }));
        if (other.length) box.appendChild(h('div', { 'data-xt-other': String(other.length), text: T('m.other', { n: other.map(function (c) { return c.label; }).join(', ') }) }));
      }).catch(function (e) { say.textContent = xtErr(e); });
      if (k === 'unit') api('/api/x/units/compare', { mod: mod }).then(function (r) {
        var row = null; (r.rows || []).forEach(function (x) { if (x.id === t.value) row = x; });
        if (!row) return;
        if (row.status === 'new') { box.appendChild(h('div', { 'data-xt-unit': 'new', text: T('m.new') })); return; }
        box.appendChild(h('div', { class: 'xt-k', 'data-xt-unit': 'changed', text: T('m.unit') }));
        [['cost', 'n.cost'], ['level', 'n.level'], ['charge', 'n.charge'], ['fore', 'n.fore'], ['crew', 'n.crew'], ['armor', 'n.armor']].forEach(function (f) {
          var v = row[f[0]]; if (!v) return; var a = f[0] === 'armor' ? xtArm(v[0]) : v[0], b = f[0] === 'armor' ? xtArm(v[1]) : v[1];
          if (String(a) === String(b)) return;
          box.appendChild(h('div', { class: 'xt-row xt-3 xt-diff' }, [h('span', { class: 'xt-k', text: T(f[1]) }), h('span', { text: a == null || a === '' ? '-' : String(a) }), h('span', { text: b == null || b === '' ? '-' : String(b) })]));
        });
      }).catch(function () { /* the copies still say it */ });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- price and balance: the balance sheet (every buyable unit as one row; read only, no mod reads the game as it ships)
  function xtBal(mod) { return xtCached(XT.bal, mod, function () { return api('/api/x/balance/table', { mod: mod }); }); }
  function xtSign(v) { return v == null ? '' : (v > 0 ? '+' : '') + v + ' %'; }
  function xtNm(x) { return x.name && x.name !== x.id ? x.name + '  (' + x.id + ')' : x.id; }
  xtReg('xt-price', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), mod = xtMod(st), gen = XT.gen; if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-price': '1' });
      host.appendChild(h('b', { text: t.name })); host.appendChild(say); host.appendChild(box);
      xtBal(mod).then(function (r) {
        if (gen !== XT.gen) return;
        var rs = r.rows || [], id = String(t.value), mine = rs.filter(function (x) { return x.id === id || String(x.id).indexOf(id + '(') === 0; });
        if (!mine.length) { say.textContent = T('pr.none'); return; }
        say.textContent = T('pr.why');
        mine.forEach(function (u) {
          var c = h('div', { class: 'xt-card', 'data-xt-prow': u.id });
          xtRows(c, [['pr.army', u.army], ['pr.cls', u.cls], ['n.cost', u.cost], ['pr.fit', u.fit], ['pr.off', xtSign(u.off)], ['n.level', u.rank], ['n.charge', u.charge], ['pr.res', u.res]]);
          var same = rs.filter(function (x) { return x.army === u.army && x.cls === u.cls && x.cost != null; }).sort(function (a, b) { return a.cost - b.cost; }), at = same.indexOf(u);
          c.appendChild(h('div', { 'data-xt-place': (at + 1) + '/' + same.length, text: T('pr.place', { i: at + 1, n: same.length, c: u.cls, a: u.army }) }));
          (r.odd || []).forEach(function (o) { if (o.id === u.id) c.appendChild(h('div', { class: 'xt-warn', 'data-xt-odd': o.code, text: o.text })); });
          c.appendChild(h('div', { class: 'xt-k', text: T('pr.list') }));
          same.slice(0, 40).forEach(function (x) {
            c.appendChild(h('div', { class: 'xt-row' + (x === u ? ' xt-win' : ''), 'data-xt-same': x.id }, [h('span', { text: xtNm(x) }), h('span', { text: x.cost + (x.fit != null ? '  (' + T('pr.fit') + ' ' + x.fit + ')' : '') })]));
          });
          box.appendChild(c);
        });
      }).catch(function (e) { if (gen === XT.gen) say.textContent = xtErr(e); });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });
  xtReg('xt-balance', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), mod = xtMod(st), gen = XT.gen; if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-balance': '1' });
      host.appendChild(h('b', { text: t.name })); host.appendChild(say); host.appendChild(box);
      Promise.all([xtBal(mod), xtShells(mod, t.value).catch(function () { return null; })]).then(function (r) {
        if (gen !== XT.gen) return;
        var rs = r[0].rows || [], id = String(t.value), on = rs.filter(function (x) { return x.gun === id; }), best = xtBest(r[1]);
        var cal = (on.length && on[0].cal) || (best && best.calibre) || null;
        say.textContent = '';
        box.appendChild(h('div', { class: 'xt-k', 'data-xt-users': String(on.length), text: on.length ? T('bl.users', { n: on.length }) : T('bl.nobody') }));
        on.slice(0, 40).forEach(function (x) { box.appendChild(h('div', { class: 'xt-row' }, [h('span', { text: xtNm(x) }), h('span', { text: x.army + '  ' + x.cost })])); });
        if (cal == null) { box.appendChild(h('div', { class: 'hint', text: T('bl.nocal') })); return; }
        var by = {}, peers = [];
        rs.forEach(function (x) {
          if (x.cal !== cal || !x.gun) return; var p = by[x.gun];
          if (!p) { p = by[x.gun] = { gun: x.gun, pen: x.pen, dmg: x.dmg, reload: x.reload, range: x.range, n: 0, cost: x.cost }; peers.push(p); }
          p.n++; if (x.cost != null && (p.cost == null || x.cost < p.cost)) p.cost = x.cost;
        });
        if (!by[id]) peers.push({ gun: id, pen: on.length ? on[0].pen : (best && best.penetration && best.penetration.length ? best.penetration[0][1] : null), n: 0 });
        peers.sort(function (a, b) { return (b.pen || 0) - (a.pen || 0); });
        box.appendChild(h('div', { class: 'xt-k', 'data-xt-cal': String(cal), text: T('bl.peers', { c: cal, n: peers.length }) }));
        peers.slice(0, 40).forEach(function (p) {
          box.appendChild(h('div', { class: 'xt-row' + (p.gun === id ? ' xt-win' : ''), 'data-xt-peer': p.gun }, [h('span', { text: p.gun }),
            h('span', { text: T('bl.row', { pen: p.pen == null ? '-' : p.pen, dmg: p.dmg == null ? '-' : p.dmg, rl: p.reload == null ? '-' : p.reload, n: p.n }) })]));
        });
      }).catch(function (e) { if (gen === XT.gen) say.textContent = xtErr(e); });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });

  // ---- make one like this / change this: the matching tasks, the base found by that task's own lookup
  function xtTargets(st) {
    var t = xtThing(st), k = xtKind(st), w = xtWord(t, k);
    if (k === 'unit') return Promise.resolve([[t.unit || 'vehicle', w], ['skin', w], ['icon', w]]);
    if (k === 'gun') return xtShells(xtMod(st), t.value).then(function (r) {
      var s = xtBest(r), out = [['gun', w]]; if (s) out.push(['ammo', s.ammo]); if (ITEMS.indexOf(String(t.sub || '')) >= 0) out.push(['item', w]); return out;
    }, function () { return [['gun', w]]; });
    if (k === 'map') return Promise.resolve([['map', w]]);
    if (k === 'sound') return Promise.resolve([['sound', String(t.ref && t.ref.key || '').replace(/^resource\/sound\//, '').replace(/\.[^.\/]*$/, '')]]);
    if (k === 'model') return Promise.resolve([['model', w]]);
    var pf = xtBase(xtDir(t.ref && t.ref.key));
    return Promise.resolve([['skin', pf], ['icon', pf]]);
  }
  function xtFindBase(rid, word, mod) {
    return api('/api/x/task/recipe?id=' + enc(rid)).then(function (r) {
      var lk = r && r.base && r.base.lookup; if (!lk || !word) return null;
      return api('/api/x/task/lookup?kind=' + enc(lk) + '&recipe=' + enc(rid) + '&q=' + enc(word) + '&mod=' + enc(mod) + '&limit=20').then(function (l) {
        var rs = l.results || [], lw = String(word).toLowerCase(), hit = null;
        rs.forEach(function (x) {
          if (hit) return; var id = String(x.id || '').toLowerCase(), nm = String(x.name || '').toLowerCase(), key = String(x.ref && x.ref.key || '').toLowerCase();
          if (id === lw || nm === lw || key.slice(-lw.length - 1) === '/' + lw) hit = x;
        });
        return hit || rs[0] || null;
      });
    }).catch(function () { return null; });
  }
  xtReg('xt-next', {
    draw: function (q, st, host) {
      XT.gen++; xtClose();
      var t = xtThing(st), mod = xtMod(st); if (!t) { xtRefuse(host); return; }
      var say = h('div', { class: 'hint', text: T('looking') }), box = h('div', { class: 'xt-list', 'data-xt-next': '1' });
      host.appendChild(say); host.appendChild(box);
      Promise.all([api('/api/x/task/catalogue'), xtTargets(st)]).then(function (r) {
        var by = {}; (r[0].recipes || []).forEach(function (x) { by[x.id] = x; });
        say.textContent = '';
        return Promise.all(r[1].map(function (tg) {
          var rc = by[tg[0]], ready = !!(rc && rc.built);
          var row = h('div', { class: 'xt-next', 'data-xt-rid': tg[0] }); box.appendChild(row);
          if (!ready) { row.appendChild(h('div', { class: 'hint', text: T('x.notReady', { t: rc ? tx(rc.title) : tg[0] }) })); return null; }
          if ((rc.needs || []).indexOf('picked') >= 0 && !S.mod) { row.appendChild(h('div', { class: 'hint', 'data-xt-nomod': '1', text: T('x.needMod', { t: tx(rc.title) }) })); return null; }
          return xtFindBase(tg[0], tg[1], mod).then(function (base) {
            ['make', 'change'].forEach(function (verb) {
              if ((rc.verbs || []).indexOf(verb) < 0) return;
              row.appendChild(h('button', { type: 'button', class: verb === 'make' ? 'primary' : '', 'data-xt-go': tg[0] + ':' + verb, 'data-xt-base': base ? String(base.id) : '', text: T('x.' + verb, { t: tx(rc.title) }), onclick: function () {
                TASK.close().then(function () { TASK.open(tg[0], verb, base ? { base: base } : {}); });
              } }));
            });
            if (!base) row.appendChild(h('div', { class: 'hint', text: T('x.nobase') }));
          });
        }));
      }).catch(function (e) { say.textContent = xtErr(e); });
    },
    value: function () { return { ok: true, answer: { src: 'value', value: T('seen') } }; },
  });
}
module.exports = {
  kinds: ['xt-kind', 'xt-find', 'xt-look', 'xt-numbers', 'xt-compare', 'xt-price', 'xt-balance', 'xt-pierce', 'xt-onmap', 'xt-files', 'xt-used', 'xt-wins', 'xt-modchg', 'xt-next'],
  script: '(' + page.toString() + ')();',
  css: '.xt-hits,.xt-list{display:flex;flex-direction:column;gap:2px;max-height:46vh;overflow:auto}.xt-hit,.xt-f{display:block;text-align:left}.xt-on{background:var(--sel)}' +
    '.xt-got{font-weight:bold}.xt-row{display:grid;grid-template-columns:minmax(10em,1fr) 2fr;gap:8px;border-bottom:1px solid var(--line)}.xt-3{grid-template-columns:minmax(10em,1fr) 1fr 1fr}' +
    '.xt-k{color:var(--hint)}.xt-diff{background:var(--soft)}.xt-win{font-weight:bold;color:var(--ok)}.xt-warn{color:var(--warnfg)}.xt-card{border:1px solid var(--line);padding:4px;margin:2px 0}' +
    '.xt-code{font-family:monospace;color:var(--hint);white-space:pre-wrap;word-break:break-all}.xt-map{max-width:100%;border:1px solid var(--line)}.xt-next{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
};
