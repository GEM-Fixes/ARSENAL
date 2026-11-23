// recipe "look at a mod", page side: seven read-only question kinds. xm-pick lists the mods of the game's mods folder (/api/mods) and
// the picked mod; the answer keeps the path and the draft names that mod (nothing is switched). xm-changes reads GET /api/x/files/tree
// (a click shows GET /api/x/files/which in the look pane) and, on a button, POST /api/x/pro/overdiff. xm-clash runs
// POST /api/x/pro/conflicts over the mods you tick, this one last. xm-check runs the check command (streamRun, viewCheck).
// xm-size adds up the tree by kind of file. xm-search runs POST /api/x/files/search. xm-next opens the fixmod and release tasks.
// Nothing is written. Page rules: ES5, no backtick, no dollar-brace, no innerHTML, theme tokens only (shipped as text).
// Author: Imperator_Aug (ARSENAL, ia-00b4b673)
'use strict';
function page() {
  if (!window.TASK || !TASK.kind) return;
  var XM = { tree: {} };
  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
  function xmLook() { return document.querySelector('[data-task-look]'); }
  function xmShow(kids) { var l = xmLook(); if (!l) return; l.textContent = ''; for (var i = 0; i < kids.length; i++) if (kids[i]) l.appendChild(kids[i]); }
  function xmErr(e) { return tx('task.x-mod.k.fail', { m: String((e && (e.text || e.message)) || e || '') }); }
  function xmNorm(p) { return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }
  function xmName(p) { return String(p || '').replace(/[\\\/]+$/, '').split(/[\\\/]/).pop(); }
  function xmMod(st) { var a = st.draft && st.draft.answers && st.draft.answers.pick; return (a && a.path) || (st.draft && st.draft.mod) || ''; }
  function xmSize(n) { n = +n || 0; if (n < 1024) return tx('task.x-mod.k.b', { n: n }); if (n < 1048576) return tx('task.x-mod.k.kb', { n: (n / 1024).toFixed(1) }); return tx('task.x-mod.k.mb', { n: (n / 1048576).toFixed(1) }); }
  // the draft's game (the game the task was started on), else the page's; sent as gid (the routes' ctx.gameId()) when it is not AS64,
  // so a MoW:AS2 or Gates of Hell task reads that game's view and mods; AS64 asks exactly as before. The tree cache key holds it.
  function xmGid(st) { var g = String((st && st.draft && st.draft.game) || (typeof S === 'object' && S && S.gameId) || ''); return g && g !== 'as64' ? g : ''; }
  function xmQ(u, st) { var g = xmGid(st); return g ? u + (u.indexOf('?') < 0 ? '?' : '&') + 'gid=' + enc(g) : u; }
  function xmB(b, st) { var g = xmGid(st); if (g) b.gid = g; return b; }
  function xmTree(mod, st) {
    var ck = xmGid(st) + '|' + mod, c = XM.tree[ck]; if (c && Date.now() - c.t < 60000) return c.p;
    var p = api(xmQ('/api/x/files/tree?mod=' + enc(mod), st)); XM.tree[ck] = { t: Date.now(), p: p };
    p.catch(function () { if (XM.tree[ck] && XM.tree[ck].p === p) delete XM.tree[ck]; });
    return p;
  }
  // search boxes (owner 2026-11-19): an indexed search, a manual Browse and a history list on every box (searchKit in page.js); a
  // stand-in page with no kit keeps the bare box
  function xmKit(inp, o) { return typeof searchKit === 'function' ? searchKit(inp, o) : null; }
  function xmHits(items, s) { var lo = String(s || '').toLowerCase(), a = items.filter(function (x) { return (x.label + ' ' + x.value + ' ' + (x.hint || '')).toLowerCase().indexOf(lo) >= 0; }); return { l: a.slice(0, 30), more: Math.max(0, a.length - 30) }; }
  // the last part of a path (a folder, or a file name with its extension); the game's mods folder ('' with no game folder)
  function xmBase(p) { var s = String(p || '').replace(/[\\\/]+$/, ''); return s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1); }
  function xmModsDir() { return typeof curFolder === 'function' && curFolder() ? join(curFolder(), 'mods') : ''; }
  function xmNoMod(host) { host.appendChild(h('div', { class: 'tk-refuse', text: tx('task.x-mod.k.noMod') })); }
  function xmMine(mod) { return !!S.mod && xmNorm(S.mod) === xmNorm(mod); }
  function xmOpen(link) { TASK.close().then(function () { if (typeof as2Link !== 'function' || !as2Link(link)) toast(tx('task.x-mod.k.nolink')); }); }
  function xmWhich(mod, key, rel, st) {
    if (!key) { xmShow([h('b', { text: rel }), h('div', { class: 'hint', text: tx('task.x-mod.k.noKey') })]); return; }
    xmShow([h('b', { text: rel }), h('div', { class: 'hint', text: tx('task.x-mod.k.looking') })]);
    api(xmQ('/api/x/files/which?mod=' + enc(mod) + '&key=' + enc(key), st)).then(function (r) {
      var kids = [h('b', { text: key }), h('div', { class: 'hint', text: tx('task.x-mod.k.chain') })];
      (r.chain || []).forEach(function (c) { kids.push(h('div', { class: c.winner ? 'xm-win' : '', text: (c.winner ? tx('task.x-mod.k.wins') + '  ' : '') + (c.layer || c.kind || '') + '  ' + (c.container ? xmName(c.container) + ' > ' : '') + (c.entry || c.source || '') })); });
      xmShow(kids);
    }).catch(function (e) { xmShow([h('b', { text: rel }), h('div', { class: 'tk-refuse', text: xmErr(e) })]); });
  }
  // ---- pick
  TASK.kind('xm-pick', {
    draw: function (q, st, host) {
      var say = h('div', { class: 'hint', text: tx('task.x-mod.k.looking') }), flt = h('input', { type: 'search', autocomplete: 'off', 'aria-label': tx('task.x-mod.k.filter'), placeholder: tx('task.x-mod.k.filter'), 'data-xm-filter': '1' });
      var box = h('div', { class: 'tk-src', role: 'radiogroup', 'data-xm-mods': '1' }), list = [];
      st.pick = xmMod(st) || S.mod || ''; st.name = '';
      // which mod to look at (a real choice, any mod, not only the header's: kept). The filter's index: the mods read once below (a pick
      // picks that mod); Browse: the folder picker on disk at the game's mods folder (a pick picks that folder, listed if it was not)
      var items = function () { return list.map(function (m) { return { label: m.label, value: m.folder, hint: [m.label !== m.folder ? m.folder : '', m.mine ? tx('task.x-mod.k.mine') : ''].filter(Boolean).join('  '), m: m }; }); };
      var fk = xmKit(flt, { key: 'task.sk.x-mod.pick', index: function (s, done) { var r = xmHits(items(), s); done(r.l, r.more); },
        browse: { mode: 'dir', view: 'disk', start: function () { return xmModsDir() || S.mod || ''; }, toValue: xmBase },
        onPick: function (v, it, from) {
          if (from === 'browse' && it && it.path) { var p = it.path, m = list.filter(function (x) { return xmNorm(x.path) === xmNorm(p); })[0]; if (!m) { m = { path: p, folder: xmName(p), label: xmName(p) }; list.push(m); } it = { m: m }; }
          if (it && it.m) { st.pick = it.m.path; st.name = it.m.label; } flt.value = v; draw(); } });
      host.appendChild(h('div', { class: 'row' }, [fk ? fk.el : flt])); host.appendChild(say); host.appendChild(box);
      function draw() {
        box.textContent = ''; var w = String(flt.value || '').toLowerCase(), n = 0;
        list.forEach(function (m) {
          if (w && (m.label + ' ' + m.folder).toLowerCase().indexOf(w) < 0 && xmNorm(m.path) !== xmNorm(st.pick)) return;
          if (++n > 60) return;
          var rb = h('input', { type: 'radio', name: 'xmmod', value: m.path, 'data-xm-mod': m.folder });
          rb.checked = xmNorm(m.path) === xmNorm(st.pick); rb.addEventListener('change', function () { st.pick = m.path; st.name = m.label; });
          if (rb.checked) st.name = m.label;
          box.appendChild(h('label', {}, [rb, h('span', { text: ' ' + m.label + '  (' + m.folder + ')' + (m.mine ? '  ' + tx('task.x-mod.k.mine') : '') })]));
        });
        if (n > 60) box.appendChild(h('div', { class: 'hint', text: tx('task.x-mod.k.moreMods', { n: n - 60 }) }));
      }
      flt.addEventListener('input', draw);
      if (S.mod) list.push({ path: S.mod, folder: xmName(S.mod), label: xmName(S.mod), mine: true });
      var dir = typeof curFolder === 'function' && curFolder() ? join(curFolder(), 'mods') : '';
      if (!dir) { say.textContent = tx('task.x-mod.k.noGame'); draw(); return; }
      api(xmQ('/api/mods?dir=' + enc(dir), st)).then(function (r) {
        (r.mods || []).forEach(function (m) { if (xmNorm(m.path) === xmNorm(dir)) return; if (S.mod && xmNorm(m.path) === xmNorm(S.mod)) { list[0].label = m.name || m.folder; return; } list.push({ path: m.path, folder: m.folder, label: m.name || m.folder }); });
        say.textContent = tx('task.x-mod.k.nMods', { n: list.length }); draw();
      }).catch(function (e) { say.textContent = xmErr(e); draw(); });
    },
    value: function (q, st) {
      if (!st.pick) return { ok: false, why: tx('task.x-mod.k.pickOne') };
      if (st.draft) st.draft.mod = st.pick;
      return { ok: true, answer: { src: 'value', value: st.name || xmName(st.pick), path: st.pick } };
    },
  });
  // ---- what it changes
  var STATES = ['override', 'loses', 'new', 'pak', 'inpak', 'unmounted', 'modinfo'];
  TASK.kind('xm-changes', {
    draw: function (q, st, host) {
      var mod = xmMod(st); st.v = '';
      if (!mod) { xmNoMod(host); return; }
      var say = h('div', { class: 'hint', text: tx('task.x-mod.k.looking') }), out = h('div', { 'data-xm-tree': '1' }), deep = h('div', { 'data-xm-diff': '1' });
      host.appendChild(say); host.appendChild(out);
      xmTree(mod, st).then(function (r) {
        var by = {}; (r.files || []).forEach(function (f) { (by[f.state] = by[f.state] || []).push(f); });
        say.textContent = tx('task.x-mod.k.nFiles', { n: (r.files || []).length }) + (r.truncated ? '  ' + tx('task.x-mod.k.trunc') : '');
        st.v = tx('task.x-mod.k.chV', { o: (by.override || []).length, n: (by['new'] || []).length });
        STATES.concat(Object.keys(by).filter(function (k) { return STATES.indexOf(k) < 0; })).forEach(function (s) {
          var fs = by[s]; if (!fs || !fs.length) return;
          var known = STATES.indexOf(s) >= 0, card = h('div', { class: 'tk-card', 'data-xm-state': s }, [h('b', { text: (known ? tx('task.x-mod.k.st.' + s) : s) + '  (' + fs.length + ')' })]);
          fs.slice(0, 15).forEach(function (f) {
            card.appendChild(h('button', { type: 'button', class: 'linkb xm-f', 'data-xm-rel': f.rel, text: f.rel, onclick: function () { xmWhich(mod, f.key, f.rel, st); } }));
          });
          if (fs.length > 15) card.appendChild(h('div', { class: 'hint', text: tx('task.x-mod.k.andMore', { n: fs.length - 15 }) }));
          out.appendChild(card);
        });
        xmShow([h('b', { text: tx('task.x-mod.k.clickFile') })]);
      }).catch(function (e) { say.textContent = xmErr(e); });
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', 'data-xm-overdiff': '1', text: tx('task.x-mod.k.diffGo'), onclick: function () {
        deep.textContent = tx('task.x-mod.k.diffRun');
        api(xmQ('/api/x/pro/overdiff', st), xmB({ mod: mod }, st)).then(function (r) {
          deep.textContent = '';
          if (r.notInGame) { deep.appendChild(h('div', { class: 'tk-refuse', text: tx('task.x-mod.k.notInGame') })); return; }
          var s = r.summary || {};
          ['files', 'changed', 'added', 'removed', 'fullShadow', 'identical', 'opaque', 'deleted'].forEach(function (k) { if (s[k]) deep.appendChild(h('div', { 'data-xm-sum': k, text: tx('task.x-mod.k.d.' + k, { n: s[k] }) })); });
          (r.items || []).filter(function (x) { return x.code !== 'OVR_IDENTICAL'; }).slice(0, 40).forEach(function (x) { deep.appendChild(h('div', { class: 'hint', text: (x.file || '') + '  ' + String(x.msg || x.code || '').slice(0, 200) })); });
          st.v = tx('task.x-mod.k.diffV', { c: s.changed || 0, a: s.added || 0, f: s.files || 0 });
        }).catch(function (e) { deep.textContent = xmErr(e); });
      } })]));
      host.appendChild(deep);
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.v || tx('task.x-mod.k.seen') } }; },
  });
  // ---- clashes with other mods
  TASK.kind('xm-clash', {
    draw: function (q, st, host) {
      var mod = xmMod(st); st.v = '';
      if (!mod) { xmNoMod(host); return; }
      var dir = typeof curFolder === 'function' && curFolder() ? join(curFolder(), 'mods') : '', me = xmName(mod);
      if (!dir || xmNorm(mod).indexOf(xmNorm(dir) + '/') !== 0 || xmNorm(mod).slice(xmNorm(dir).length + 1).indexOf('/') >= 0) { host.appendChild(h('div', { class: 'tk-refuse', 'data-xm-outside': '1', text: tx('task.x-mod.k.outside') })); return; }
      var say = h('div', { class: 'hint', text: tx('task.x-mod.k.looking') }), flt = h('input', { type: 'search', autocomplete: 'off', 'aria-label': tx('task.x-mod.k.filter'), placeholder: tx('task.x-mod.k.filter') });
      var box = h('div', { class: 'xm-ticks', 'data-xm-others': '1' }), out = h('div', { 'data-xm-clashes': '1' }), names = [], on = [];
      // the filter's index: the installed mods with a mod.info (read once below); Browse: the folder picker on disk at the mods folder,
      // the folder name; a pick ticks that mod
      var items = function () { return names.map(function (m) { return { label: m, value: m, hint: on.indexOf(m) >= 0 ? tx('task.x-mod.k.ticked') : '' }; }); };
      var fk = xmKit(flt, { key: 'task.sk.x-mod.clash', index: function (s, done) { var r = xmHits(items(), s); done(r.l, r.more); },
        browse: { mode: 'dir', view: 'disk', start: dir, toValue: xmBase },
        onPick: function (v) { if (names.indexOf(v) >= 0 && on.indexOf(v) < 0) { if (on.length >= 20) toast(tx('task.x-mod.k.max20')); else on.push(v); } flt.value = v; draw(); } });
      host.appendChild(say); host.appendChild(h('div', { class: 'row' }, [fk ? fk.el : flt])); host.appendChild(box);
      function draw() {
        box.textContent = ''; var w = String(flt.value || '').toLowerCase(), n = 0;
        names.forEach(function (m) {
          if (w && m.toLowerCase().indexOf(w) < 0 && on.indexOf(m) < 0) return;
          if (++n > 80) return;
          var c = h('input', { type: 'checkbox', 'data-xm-other': m }); c.checked = on.indexOf(m) >= 0;
          c.addEventListener('change', function () { var i = on.indexOf(m); if (c.checked && i < 0) { if (on.length >= 20) { c.checked = false; toast(tx('task.x-mod.k.max20')); return; } on.push(m); } if (!c.checked && i >= 0) on.splice(i, 1); });
          box.appendChild(h('label', { class: 'chk' }, [c, h('span', { text: ' ' + m })]));
        });
      }
      flt.addEventListener('input', draw);
      api(xmQ('/api/installed', st)).then(function (j) {
        (j.mods || []).forEach(function (m) { if (m.hasInfo && m.name.toLowerCase() !== me.toLowerCase()) names.push(m.name); });
        say.textContent = tx('task.x-mod.k.tickHint', { m: me }); draw();
      }).catch(function (e) { say.textContent = xmErr(e); });
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', 'data-xm-clashgo': '1', text: tx('task.x-mod.k.clashGo'), onclick: function () {
        if (!on.length) { out.textContent = tx('task.x-mod.k.tickOne'); return; }
        out.textContent = tx('task.x-mod.k.clashRun');
        api(xmQ('/api/x/pro/conflicts', st), xmB({ mods: on.concat([me]) }, st)).then(function (r) {
          out.textContent = ''; var s = r.summary || {};
          out.appendChild(h('div', { 'data-xm-clashsum': '1', text: tx('task.x-mod.k.clashSum', { k: s.keys || 0, m: s.modMod || 0, f: s.fileShadow || 0 }) }));
          Object.keys(r.perMod || {}).forEach(function (m) { var p = r.perMod[m]; out.appendChild(h('div', { class: m === me ? 'xm-win' : '', text: tx('task.x-mod.k.perMod', { m: m, w: p.wins, l: p.loses }) })); });
          (r.rows || []).slice(0, 30).forEach(function (x) {
            out.appendChild(h('div', { class: 'tk-card', 'data-xm-row': x.key }, [h('b', { text: x.file + '  ' + x.key }), h('div', { class: 'hint', text: tx('task.x-mod.k.keeps', { m: x.winner }) + '  ' +
              (x.values || []).map(function (v) { return v.src + ' = ' + v.val; }).join(';  ') })]));
          });
          (r.files || []).slice(0, 20).forEach(function (x) { out.appendChild(h('div', { class: 'hint', text: (x.file || '') + '  ' + String(x.msg || '').slice(0, 200) })); });
          st.v = tx('task.x-mod.k.clashV', { k: s.keys || 0, n: on.length });
        }).catch(function (e) { out.textContent = xmErr(e); });
      } })]));
      host.appendChild(out);
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.v || tx('task.x-mod.k.notRun') } }; },
  });
  // ---- what the checker finds
  TASK.kind('xm-check', {
    draw: function (q, st, host) {
      var mod = xmMod(st); st.v = '';
      if (!mod) { xmNoMod(host); return; }
      if (typeof RMT !== 'undefined' && RMT) { host.appendChild(h('div', { class: 'hint', text: tx('task.x-mod.k.remote') })); return; }
      var out = h('div', { 'data-xm-checked': '1' });
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', class: 'primary', 'data-xm-check': '1', text: tx('task.x-mod.k.checkGo'), onclick: function () {
        out.textContent = tx('task.x-mod.k.checkRun');
        streamRun('check', chkIn({ mod: mod }), { line: function () {} }).then(function (end) {
          out.textContent = '';
          if (!end || end.result == null) { out.appendChild(h('div', { class: 'tk-refuse', text: tx('task.x-mod.k.checkFail') })); return; }
          viewCheck(end.result, out); st.v = tx('task.x-mod.k.checkV');
        }).catch(function (e) { out.textContent = xmErr(e); });
      } })]));
      host.appendChild(out);
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.v || tx('task.x-mod.k.notRun') } }; },
  });
  // ---- how big it is
  var TYPES = [['pic', /\.(dds|tga|png|jpg|jpeg|bmp|psd|gif)$/], ['snd', /\.(wav|ogg|mp3)$/], ['mdl', /\.(ply|mdl|anm|vol|mtl|skl)$/], ['map', /\.(mi|mis|map|grs|net|hmp|lnd|mpi)$/],
    ['txt', /\.(lng|txt|str|csv)$/], ['pak', /\.(pak|zip)$/], ['dat', /\.(def|set|ext|inc|sdl|xml|ammo|lua|info|ini|cfg|des|scn)$/]];
  function xmType(rel) { var r = String(rel || '').toLowerCase(); for (var i = 0; i < TYPES.length; i++) if (TYPES[i][1].test(r)) return TYPES[i][0]; return 'other'; }
  TASK.kind('xm-size', {
    draw: function (q, st, host) {
      var mod = xmMod(st); st.v = '';
      if (!mod) { xmNoMod(host); return; }
      var say = h('div', { class: 'hint', text: tx('task.x-mod.k.looking') }), out = h('div', { 'data-xm-size': '1' });
      host.appendChild(say); host.appendChild(out);
      Promise.all([api(xmQ('/api/mod?dir=' + enc(mod), st)).catch(function () { return null; }), xmTree(mod, st)]).then(function (r) {
        var m = r[0], files = (r[1].files || []).filter(function (f) { return f.state !== 'inpak'; }), by = {}, tot = 0;
        files.forEach(function (f) { var t = xmType(f.rel), o = by[t] || (by[t] = { n: 0, b: 0 }); o.n++; o.b += f.size || 0; tot += f.size || 0; });
        var bytes = m && m.bytes ? m.bytes : tot;
        say.textContent = tx('task.x-mod.k.total', { s: xmSize(bytes), n: m && m.files ? m.files : files.length }) + (m && m.truncated ? '  ' + tx('task.x-mod.k.trunc') : '');
        st.v = xmSize(bytes);
        Object.keys(by).sort(function (a, b) { return by[b].b - by[a].b; }).forEach(function (t) {
          out.appendChild(h('div', { 'data-xm-type': t, text: tx('task.x-mod.k.ty.' + t) + ':  ' + xmSize(by[t].b) + '  (' + tx('task.x-mod.k.nF', { n: by[t].n }) + ')' }));
        });
        var big = files.slice().sort(function (a, b) { return (b.size || 0) - (a.size || 0); }).slice(0, 10), kids = [h('b', { text: tx('task.x-mod.k.biggest') })];
        big.forEach(function (f) { kids.push(h('div', { text: xmSize(f.size) + '  ' + f.rel })); });
        xmShow(kids);
      }).catch(function (e) { say.textContent = xmErr(e); });
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.v || tx('task.x-mod.k.seen') } }; },
  });
  // ---- search its files
  TASK.kind('xm-search', {
    draw: function (q, st, host) {
      var mod = xmMod(st); st.v = (st.answer && st.answer.value) || '';
      if (!mod) { xmNoMod(host); return; }
      var inp = h('input', { type: 'search', autocomplete: 'off', 'aria-label': tx('task.x-mod.k.words'), placeholder: tx('task.x-mod.k.words'), 'data-xm-q': '1' }), say = h('div', { class: 'hint' }), out = h('div', { class: 'xm-hits', 'data-xm-hits': '1' });
      if (st.v) inp.value = st.v;
      function run() {
        var w = String(inp.value || '').trim(); if (!w) { say.textContent = tx('task.x-mod.k.words'); return; }
        st.v = w; say.textContent = tx('task.x-mod.k.looking'); out.textContent = '';
        api(xmQ('/api/x/files/search', st), xmB({ mod: mod, q: w, vanilla: false }, st)).then(function (r) {
          var hs = r.hits || [];
          say.textContent = hs.length ? tx('task.x-mod.k.hits', { n: hs.length }) + (r.truncated ? '  ' + tx('task.x-mod.k.trunc') : '') + (xmMine(mod) ? '' : '  ' + tx('task.x-mod.k.notMine')) : tx('task.x-mod.k.noHits');
          hs.slice(0, 80).forEach(function (x) {
            var kids = [h('b', { text: x.rel + ':' + x.line }), h('div', { class: 'hint', text: String(x.text || '').slice(0, 200) })];
            if (xmMine(mod)) kids.push(h('button', { type: 'button', class: 'linkb', 'data-xm-open': x.rel, text: tx('task.x-mod.k.edit'), onclick: function () { xmOpen('ide:' + x.rel + ':' + x.line); } }));
            out.appendChild(h('div', { class: 'tk-card' }, kids));
          });
        }).catch(function (e) { say.textContent = xmErr(e); });
      }
      // the words box: its index is the mod's own file names (the tree, read once and kept a minute), Browse = the file picker on disk at
      // the mod (a pick searches for that file's name with its extension: where the mod names it); history
      var files = null, fItems = function (cb) { if (files) { cb(files); return; } xmTree(mod, st).then(function (r) { files = (r.files || []).filter(function (f) { return f.state !== 'inpak' || f.key; }).map(function (f) { var rel = String(f.rel || ''), i = rel.lastIndexOf('/'); return { label: rel.slice(i + 1), value: rel.slice(i + 1), hint: rel }; }); cb(files); }).catch(function () { cb([]); }); };
      var kit = xmKit(inp, { key: 'task.sk.x-mod.search', index: function (s, done) { fItems(function (l) { var r = xmHits(l, s); done(r.l, r.more); }); },
        browse: { mode: 'file', view: 'disk', start: mod, toValue: xmBase },
        onPick: function (v) { inp.value = v; run(); } });
      // Enter here is Search, not the task window's Next (an Enter the kit used for a row of its list is stopped by the kit)
      inp.addEventListener('keydown', function (e) { if (e._sk) return; if (e.key === 'Enter') { e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); run(); } });
      host.appendChild(h('div', { class: 'row' }, [kit ? kit.el : inp, h('button', { type: 'button', 'data-xm-find': '1', text: tx('task.x-mod.k.find'), onclick: run })]));
      host.appendChild(say); host.appendChild(out);
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.v || tx('task.x-mod.k.noSearch') } }; },
  });
  // ---- what next: fix my mod's problems (fixmod), make a release (release)
  TASK.kind('xm-next', {
    draw: function (q, st, host) {
      var mod = xmMod(st), out = h('div', { class: 'row', 'data-xm-next': '1' }), say = h('div', { class: 'hint' });
      host.appendChild(out); host.appendChild(say);
      if (!mod) { xmNoMod(host); return; }
      api('/api/x/task/catalogue').then(function (c) {
        var by = {}; (c.recipes || []).forEach(function (r) { by[r.id] = r; });
        [['fixmod', 'change', 'task.x-mod.k.fix'], ['release', 'make', 'task.x-mod.k.release']].forEach(function (x) {
          var r = by[x[0]], ready = !!(r && r.built && (r.verbs || []).indexOf(x[1]) >= 0);
          var b = h('button', { type: 'button', class: x[0] === 'fixmod' ? 'primary' : '', 'data-xm-go': x[0], text: tx(x[2]), onclick: function () {
            if (S.mod !== mod) setMod(mod);
            TASK.close().then(function () { TASK.open(x[0], x[1]); });
          } });
          b.disabled = !ready; out.appendChild(b);
          if (!ready) say.textContent = tx('task.x-mod.k.notReady');
        });
        if (S.mod !== mod) say.textContent = (say.textContent ? say.textContent + '  ' : '') + tx('task.x-mod.k.switch', { m: xmName(mod) });
      }).catch(function (e) { say.textContent = xmErr(e); });
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: tx('task.x-mod.k.seen') } }; },
  });
}
module.exports = {
  kinds: ['xm-pick', 'xm-changes', 'xm-clash', 'xm-check', 'xm-size', 'xm-search', 'xm-next'],
  script: '(' + page.toString() + ')();',
  css: '.xm-f{display:block;text-align:left}.xm-win{font-weight:bold;color:var(--ok)}.xm-ticks{display:flex;flex-direction:column;max-height:40vh;overflow:auto}.xm-hits{display:flex;flex-direction:column;gap:2px}',
};
