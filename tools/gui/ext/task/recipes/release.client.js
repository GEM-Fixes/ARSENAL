// recipe "make a release", page side: the question kinds "rel-gate" (POST /api/x/task/r/release/check: the new mod.info and picture
// in staging, the Share page's release check, one line per item; a fail stops the task) and "rel-card" (the play card for a list of
// mods, POST /api/x/share/card, read only; a Copy button). Page rules: ES5, no backtick, no dollar-brace, no innerHTML, no arrow
// functions, theme tokens only. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-1a253bf3)
'use strict';
/* eslint-disable no-var */
function page() {
  if (!window.TASK || !TASK.kind) return;
  var ITEMS = ['info', 'range', 'name', 'desc', 'version', 'preview', 'previewOld', 'junk', 'goh', 'pack', 'check'];
  var FOLDER = /^[^\\\/:*?"<>|]{1,120}$/;
  function rlErr(box, e) { if (TASK.stopped(box, e)) return; box.textContent = ''; box.appendChild(h('div', { class: 'tk-refuse', role: 'alert', text: String((e && (e.text || e.message)) || e) })); }
  // the way out of a red line: the question that sets it (a step of this task), the Mod files page, or the fixmod task (change).
  // A button that leaves the window saves the task first (TASK.close); Continue on its row comes back here and draw runs the check again.
  var TOQ = { info: 'name', name: 'name', desc: 'desc', version: 'version_kind', range: 'range', preview: 'preview' };
  var TOFILES = { previewOld: 1, junk: 1, goh: 1, pack: 1 };
  function rlGoQ(qid) {
    // GoH asks the range as range_goh: a line goes to the question this game asks
    var s0 = TASK.state() || {}, has = function (id) { return (s0.steps || []).some(function (x) { return x.id === 'q:' + id; }); };
    if (!has(qid) && has(qid + '_goh')) qid = qid + '_goh';
    var b = document.querySelector('[data-step="q:' + qid + '"]');
    if (b) { b.click(); return; }
    var s = TASK.state(), at = -1;
    for (var i = 0; i < (s.steps || []).length; i++) if (s.steps[i].id === 'q:' + qid) at = i;
    for (var n = s.at - at; at >= 0 && n > 0; n--) TASK.back();
  }
  // Mod Files may be missing from a game's pages (INGAME): read the current game's pages at click time (a game switch
  // rebuilds INGAME), and test the gate before TASK.close, so a refused click keeps the task window open and never switches the game.
  function rlHasFiles() { return typeof INGAME === 'object' && !!INGAME && !!INGAME.files; }
  function rlFilesOn() { return typeof refOn !== 'function' || refOn('files'); }
  function rlFiles() {
    if (!rlHasFiles()) { toast(tx('task.release.k.byHand')); return; }
    if (!rlFilesOn()) { toast(tx('task.release.k.filesAdv')); return; }
    TASK.close().then(function () { try { LS.set('files.tab', 'tree'); } catch (e) { /* the page opens on its last tab */ } if (typeof as2Link !== 'function' || !as2Link('page:files')) toast(tx('task.release.k.filesAdv')); });
  }
  function rlFix() { TASK.close().then(function () { TASK.open('fixmod', 'change'); }); }
  function rlOut(it) {
    var b = function (key, fn, mark) { return h('button', { type: 'button', class: 'linkb', 'data-rel-to': mark, text: tx(key), onclick: fn }); };
    if (TOQ[it.id]) return b('task.release.k.toQ', function () { rlGoQ(TOQ[it.id]); }, 'q:' + TOQ[it.id]);
    if (it.id === 'check') return b('task.release.k.toFix', rlFix, 'fixmod');
    // no Mod Files page in this game: no button, a plain line that says to remove the file in the mod folder by hand
    // (not on a pack row: a packing finding is not always a file to remove, its own lines say what to do)
    if (TOFILES[it.id]) return rlHasFiles() ? b('task.release.k.toFiles', rlFiles, 'files') : it.id === 'pack' ? null : h('span', { class: 'hint', 'data-rel-to': 'hand', text: tx('task.release.k.byHand') });
    return null;
  }
  function rlShow(st) {
    var box = st.box, r = st.res;
    box.textContent = '';
    if (!r) return;
    if (!r.ok) { box.appendChild(h('div', { class: 'tk-refuse', role: 'alert', text: tx('task.release.k.pic.' + (r.why === 'big' ? 'big' : 'type')) })); return; }
    box.appendChild(h('div', { class: r.ready ? 'tk-card' : 'tk-refuse', 'data-rel-ready': r.ready ? '1' : '0', text: r.ready ? tx('task.release.k.ready', { w: r.warns }) : tx('task.release.k.notReady', { n: r.fails }) }));
    if (!r.ready || r.warns) box.appendChild(h('div', { class: 'hint', 'data-rel-howback': '1', text: tx('task.release.k.howBack') }));
    box.appendChild(h('div', { class: 'hint', text: tx('task.release.k.version', { a: r.old || tx('task.release.k.noVersion'), b: r.next }) }));
    if (r.nameChanged) box.appendChild(h('div', { class: 'tk-refuse', text: tx('task.release.k.nameChanged') }));
    (r.items || []).forEach(function (it) {
      var label = ITEMS.indexOf(it.id) >= 0 ? tx('task.release.k.i.' + it.id) : it.id;
      var row = h('div', { class: it.status === 'fail' ? 'tk-refuse' : 'hint', 'data-rel-item': it.id, 'data-rel-status': it.status }, [
        h('b', { text: tx('task.release.k.s.' + (['pass', 'warn', 'fail', 'skip'].indexOf(it.status) >= 0 ? it.status : 'skip')) + '  ' }),
        h('span', { text: label + (it.detail ? ': ' + it.detail : '') })
      ]);
      var to = it.status === 'fail' || it.status === 'warn' ? rlOut(it) : null;
      if (to) { row.appendChild(document.createTextNode('  ')); row.appendChild(to); }
      box.appendChild(row);
      if (it.id === 'goh' && it.status === 'fail') box.appendChild(h('div', { class: 'hint', text: '    ' + tx('task.release.k.gohWhy') }));
      (it.plain || []).slice(0, 8).forEach(function (l) { box.appendChild(h('div', { class: 'hint', text: '    ' + l })); });
    });
  }
  function rlCheck(st) {
    st.box.textContent = tx('task.release.k.checking');
    return api('/api/x/task/r/release/check', { draft: st.draft }, TASK.job()).then(function (r) { st.res = r; rlShow(st); return r; })
      .catch(function (e) { st.res = null; rlErr(st.box, e); return null; });
  }
  TASK.kind('rel-gate', {
    draw: function (q, st, host) {
      st.box = h('div', { 'data-rel-gate': '1' });
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', class: 'primary', 'data-rel-run': '1', text: tx('task.release.k.run'), onclick: function () { rlCheck(st); } })]));
      host.appendChild(st.box);
      rlCheck(st);
    },
    value: function (q, st) {
      function pick(r) {
        if (!r) return { ok: false, why: tx('task.release.k.noCheck') };
        if (!r.ok) return { ok: false, why: tx('task.release.k.pic.' + (r.why === 'big' ? 'big' : 'type')) };
        if (!r.ready) return { ok: false, why: tx('task.release.k.notReady', { n: r.fails }) };
        return { ok: true, answer: { src: 'value', value: { sig: r.sig, ready: true, fails: 0, warns: r.warns, next: r.next } } };
      }
      if (st.res) return pick(st.res);
      return rlCheck(st).then(pick);
    }
  });
  TASK.kind('rel-card', {
    draw: function (q, st, host) {
      var v = st.value || {}, mods = [].concat(v.mods || []);
      st.mods = mods;
      var inp = h('textarea', { rows: '4', 'data-rel-mods': '1', 'aria-label': tx('task.release.k.mods'), placeholder: tx('task.release.k.mods') });
      inp.value = mods.join('\n');
      var out = h('textarea', { readonly: 'readonly', rows: '8', 'data-rel-card': '1', 'aria-label': tx('task.release.k.card') });
      var msg = h('div', { class: 'hint' });
      inp.addEventListener('input', function () { st.mods = String(inp.value || '').split(/[\r\n]+/).map(function (s) { return s.trim(); }).filter(Boolean); });
      var make = h('button', { type: 'button', class: 'primary', 'data-rel-make': '1', text: tx('task.release.k.make'), onclick: function () {
        msg.textContent = tx('task.release.k.making');
        api('/api/x/share/card', { mods: st.mods }).then(function (r) {
          out.value = r.text || ''; msg.textContent = r.missing && r.missing.length ? tx('task.release.k.missing', { m: r.missing.join(', ') }) : '';
        }).catch(function (e) { msg.textContent = String((e && (e.text || e.message)) || e); });
      } });
      var copy = h('button', { type: 'button', 'data-rel-copy': '1', text: tx('task.release.k.copy'), onclick: function () {
        try { if (navigator.clipboard && out.value) navigator.clipboard.writeText(out.value).then(function () { toast(tx('task.release.k.copied')); }); } catch (e) { out.select(); }
      } });
      // Add a mod (owner 2026-11-19, searchKit: indexed search, manual Browse, history): the installed mods, read once; a pick adds its
      // folder as a new line; Browse = the folder picker on disk at the mods folder (the game's, else the one the mod is in), the folder
      // name. A stand-in page with no kit has the list box alone
      var modsDir = function () { var g = typeof curFolder === 'function' ? curFolder() : ''; if (g) return join(g, 'mods'); return String(S.mod || '').replace(/[\\\/]+$/, '').replace(/[\\\/][^\\\/]*$/, ''); };
      var mods0 = null, mItems = function (cb) { if (mods0) { cb(mods0); return; } api('/api/installed').then(function (j) { mods0 = (j.mods || []).filter(function (m) { return m && m.name; }).map(function (m) { return { label: m.name, value: m.name }; }); cb(mods0); }).catch(function () { cb([]); }); };
      var add = h('input', { type: 'search', autocomplete: 'off', 'data-rel-add': '1', 'aria-label': tx('task.release.k.add'), placeholder: tx('task.release.k.add') });
      var kit = typeof searchKit === 'function' ? searchKit(add, { key: 'task.sk.release.mods',
        index: function (s, done) { mItems(function (l) { var lo = s.toLowerCase(), a = l.filter(function (x) { return x.value.toLowerCase().indexOf(lo) >= 0; }); done(a.slice(0, 30), Math.max(0, a.length - 30)); }); },
        browse: { mode: 'dir', view: 'disk', start: modsDir, toValue: function (p) { var s = String(p || '').replace(/[\\\/]+$/, ''); return s.slice(Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')) + 1); } },
        onPick: function (v) { v = String(v || '').trim(); add.value = ''; if (!v || st.mods.indexOf(v) >= 0) return; st.mods.push(v); inp.value = st.mods.join('\n'); } }) : null;
      host.appendChild(inp);
      if (kit) host.appendChild(h('div', { class: 'row' }, [kit.el]));
      host.appendChild(h('div', { class: 'row' }, [make, copy]));
      host.appendChild(msg);
      host.appendChild(out);
    },
    value: function (q, st) {
      var m = st.mods || [];
      for (var i = 0; i < m.length; i++) if (!FOLDER.test(m[i])) return { ok: false, why: tx('task.release.k.badMod', { m: m[i] }) };
      return { ok: true, answer: { src: 'value', value: { mods: m.slice(0, 40) } } };
    }
  });
}
const script = '(' + page.toString() + ')();';
module.exports = { kinds: ['rel-gate', 'rel-card'], script, css: '', page };
