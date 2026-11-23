// recipe "change an old mod to 64-bit", page side: the question kinds "up-out" (the new folder the copy goes into; it becomes the
// task's mod; compile runs upgrade into it at Write) and "up-dir" (an optional folder: typed or picked with the folder picker).
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, no arrow functions, theme tokens only.
// Author: Imperator_Aug (ARSENAL, ia-c8ff9c0e)
'use strict';
/* eslint-disable no-var */
function page() {
  if (!window.TASK || !TASK.kind) return;
  function upAns(st, id) { var a = st.draft && st.draft.answers && st.draft.answers[id]; return a && (a.src === 'value' || a.src === 'exist') ? a.value : null; }
  function upAbs(p) { return /^[A-Za-z]:[\\\/]/.test(p) || /^\\\\/.test(p) || /^\//.test(p); }
  function upSame(a, b) { return String(a).replace(/[\\\/]+$/, '').toLowerCase() === String(b).replace(/[\\\/]+$/, '').toLowerCase(); }
  function upUnder(a, b) { var x = String(a).replace(/\//g, '\\').toLowerCase(), y = String(b).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase() + '\\'; return x.indexOf(y) === 0; }
  // the folder box's index (owner 2026-11-19, searchKit: indexed search, manual Browse, history): the game and Gates of Hell folders
  // the GUI knows and the mods of the game (read once per game folder)
  var UPM = { dir: null, l: null };
  function upKnown(cb) {
    var g = typeof curFolder === 'function' ? curFolder() || '' : '', gh = typeof gohDir === 'function' ? gohDir() || '' : '', base = [];
    if (g) base.push({ label: g, value: g, hint: tx('task.upgrade.k.gGame') }); if (gh) base.push({ label: gh, value: gh, hint: tx('task.upgrade.k.gGoh') });
    var dir = g && typeof join === 'function' ? join(g, 'mods') : ''; if (!dir) { cb(base); return; } if (UPM.dir === dir && UPM.l) { cb(base.concat(UPM.l)); return; }
    api('/api/mods?dir=' + encodeURIComponent(dir)).then(function (r) { UPM = { dir: dir, l: (r.mods || []).filter(function (m) { return m.path && m.folder; }).map(function (m) { return { label: m.path, value: m.path, hint: tx('task.upgrade.k.gMod') }; }) }; cb(base.concat(UPM.l)); }).catch(function () { cb(base); });
  }
  // an optional folder (patch, game folders): empty is fine; a typed one must be a full path; Pick opens the folder picker
  TASK.kind('up-dir', {
    draw: function (q, st, host) {
      st.inp = h('input', { type: 'text', autocomplete: 'off', 'aria-label': tx(q.ask), 'data-up-dir': q.id, placeholder: tx('task.upgrade.k.dirEmpty'), value: st.value || '' });
      var pk = h('button', { type: 'button', 'data-up-dir-pick': q.id, text: tx('task.upgrade.k.dirPick'), onclick: function () {
        if (typeof pick !== 'function') return;
        pick('dir', st.inp.value || '', function (p) { if (p) st.inp.value = p; });
      } });
      var kit = typeof searchKit === 'function' ? searchKit(st.inp, { key: 'task.sk.upgrade.dir',
        index: function (s, done) { upKnown(function (l) { var lo = s.toLowerCase(), a = l.filter(function (x) { return x.value.toLowerCase().indexOf(lo) >= 0; }); done(a.slice(0, 30), Math.max(0, a.length - 30)); }); },
        // Browse = the folder picker on disk at the folder typed (none: the mod); the full path goes into the box
        browse: { mode: 'dir', view: 'disk', start: function () { return String(st.inp.value || '').trim(); } } }) : null;
      if (kit) { kit.browseButton.setAttribute('data-up-dir-pick', q.id); host.appendChild(kit.el); return; }
      host.appendChild(st.inp); host.appendChild(document.createTextNode(' ')); host.appendChild(pk);
    },
    value: function (q, st) {
      var v = String(st.inp && st.inp.value || '').trim().replace(/[\\\/]+$/, '');
      if (v && !upAbs(v)) return { ok: false, why: tx('task.upgrade.k.dirAbs') };
      return { ok: true, answer: { src: 'value', value: v } };
    }
  });
  TASK.kind('up-out', {
    draw: function (q, st, host) {
      // the new folder beside the old mod: name_64, or name_goh for a Gates of Hell copy
      var src = upAns(st, 'src') || '', def = st.value || (src ? String(src).replace(/[\\\/]+$/, '') + (upAns(st, 'to') === 'goh' ? '_goh' : '_64') : '');
      st.inp = h('input', { type: 'text', autocomplete: 'off', 'aria-label': tx(q.ask), 'data-up-out': '1', value: def });
      host.appendChild(st.inp);
      if (src) host.appendChild(h('div', { class: 'hint', text: tx('task.upgrade.k.from', { p: src }) }));
    },
    value: function (q, st) {
      var v = String(st.inp && st.inp.value || '').trim().replace(/[\\\/]+$/, ''), src = upAns(st, 'src') || '';
      if (!v || !upAbs(v)) return { ok: false, why: tx('task.upgrade.k.outAbs') };
      if (src && (upSame(v, src) || upUnder(v, src) || upUnder(src, v))) return { ok: false, why: tx('task.upgrade.k.outIn') };
      if (st.draft) st.draft.mod = v;
      return { ok: true, answer: { src: 'value', value: v } };
    }
  });
}
const script = '(' + page.toString() + ')();';
module.exports = { kinds: ['up-out', 'up-dir'], script, css: '', page };
