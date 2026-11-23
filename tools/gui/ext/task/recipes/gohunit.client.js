// recipe "make a unit from Gates of Hell", page side: the question kinds "goh-dir" (the Gates of Hell folder: prefilled from the GUI's
// GoH setting, a Pick button and a check through POST /api/x/task/r/gohunit/dir, in plain words), "goh-donor" (the donor list from GET /api/x/goh/donors, or
// a typed name), "goh-ask" (the out of line values from POST /api/x/task/r/gohunit/scan, one per screen: scale, translated or donor,
// and "the rest of this class") and "goh-stage" (POST /api/x/task/r/gohunit/stage: the chain into the task's scratch folder).
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, no arrow functions, theme tokens only.
// Author: Imperator_Aug (ARSENAL, ia-f8c038a6)
'use strict';
/* eslint-disable no-var */
function page() {
  if (!window.TASK || !TASK.kind) return;
  var GNAME = /^[A-Za-z0-9_.\-]{1,80}$/;
  function ghAns(st, id) { var a = st.draft && st.draft.answers && st.draft.answers[id]; return a && (a.src === 'value' || a.src === 'exist') ? a.value : null; }
  function ghErr(box, e) { if (TASK.stopped(box, e)) return; box.textContent = ''; box.appendChild(h('div', { class: 'tk-refuse', role: 'alert', text: String((e && (e.text || e.message)) || e) })); }
  // the Gates of Hell folder, asked first: the unit list and the donors are read from it
  // search boxes (owner 2026-11-19: an indexed search, a manual Browse and a history list on every box; searchKit in page.js). A
  // stand-in page with no kit keeps the bare box
  function ghKit(inp, o) { return typeof searchKit === 'function' ? searchKit(inp, o) : null; }
  function ghHits(l, s) { var lo = String(s || '').toLowerCase(), a = l.filter(function (x) { return (x.label + ' ' + (x.hint || '')).toLowerCase().indexOf(lo) >= 0; }); return { l: a.slice(0, 30), more: Math.max(0, a.length - 30) }; }
  // the vanilla donor pool of the AS2 folder (GET /api/x/goh/names, read once per folder): the donor box's index
  var GHN = {};
  function ghNames(adir, cb) { var k = adir || '-', c = GHN[k]; if (c && c.l) { cb(c.l); return; } if (c) { c.w.push(cb); return; } c = GHN[k] = { l: null, w: [cb] };
    api('/api/x/goh/names?kind=donors' + (adir ? '&game=' + encodeURIComponent(adir) : '')).then(function (r) { c.l = (r.items || []).map(function (x) { return { label: x.name, value: x.name, hint: (x.sub || '') + (x.cal ? ' ' + x.cal + ' mm' : '') }; }); var w = c.w; c.w = []; w.forEach(function (f) { f(c.l); }); })
      .catch(function () { delete GHN[k]; var w = c.w; c.w = []; w.forEach(function (f) { f([]); }); }); }
  var DIRWHY = { empty: 1, notAbs: 1, missing: 1, noResource: 1 };
  function ghDirSay(box, r) {
    box.textContent = '';
    var ok = r && r.ok, key = ok ? 'task.gohunit.k.dirOk' : 'task.gohunit.k.dir.' + (r && DIRWHY[r.why] ? r.why : 'missing');
    box.appendChild(h('div', { class: ok ? 'tk-card' : 'tk-refuse', role: ok ? 'status' : 'alert', 'data-goh-dir-say': ok ? 'ok' : (r && r.why) || 'missing', text: tx(key) }));
  }
  function ghDirCheck(st) {
    var p = String(st.inp.value || '').trim();
    st.say.textContent = tx('task.gohunit.k.dirLooking');
    return api('/api/x/task/r/gohunit/dir', { dir: p }).then(function (r) {
      st.checked = p; st.res = r; if (r && r.ok && r.dir) { st.inp.value = r.dir; st.checked = r.dir; }
      ghDirSay(st.say, r); return r;
    }).catch(function (e) { ghErr(st.say, e); return null; });
  }
  TASK.kind('goh-dir', {
    draw: function (q, st, host) {
      var a = st.draft && st.draft.answers && st.draft.answers[q.id], mine = a && a.src === 'value' ? a.value : '';
      var gui = typeof gohDir === 'function' ? (gohDir() || '') : '';
      st.inp = h('input', { type: 'text', autocomplete: 'off', 'data-goh-dir': '1', 'aria-label': tx(q.ask), placeholder: tx('task.gohunit.k.dir.empty'), value: mine || gui || st.value || '' });
      st.say = h('div', { class: 'hint', 'aria-live': 'polite' });
      st.res = null; st.checked = null;
      st.inp.addEventListener('input', function () { st.res = null; st.checked = null; st.say.textContent = ''; });
      // the folder box (the GoH install, not the mod: kept): its index is the GUI's GoH setting and this task's answer, Browse = the folder
      // picker on disk at the folder typed (the full path into the box), history
      var dk = ghKit(st.inp, { key: 'task.sk.gohunit.dir',
        index: function (s, done) { var l = []; [gui, mine].forEach(function (p) { if (p && !l.some(function (x) { return x.value === p; })) l.push({ label: p, value: p, hint: p === gui ? tx('task.gohunit.k.dirGui') : '' }); }); var r = ghHits(l, s); done(r.l, r.more); },
        browse: { mode: 'dir', view: 'disk', start: function () { return String(st.inp.value || '').trim(); } },
        onPick: function (v) { st.inp.value = v; st.res = null; st.checked = null; ghDirCheck(st); } });
      if (dk) dk.browseButton.setAttribute('data-goh-dir-pick', '1');
      var pk = h('button', { type: 'button', 'data-goh-dir-pick': '1', text: tx('task.gohunit.k.dirPick'), onclick: function () {
        if (typeof pick !== 'function') return;
        pick('dir', st.inp.value || '', function (p) { if (p) { st.inp.value = p; ghDirCheck(st); } });
      } });
      var ck = h('button', { type: 'button', 'data-goh-dir-check': '1', text: tx('task.gohunit.k.dirCheck'), onclick: function () { ghDirCheck(st); } });
      host.appendChild(dk ? dk.el : st.inp); host.appendChild(h('div', { class: 'tk-row' }, dk ? [ck] : [pk, document.createTextNode(' '), ck])); host.appendChild(st.say);
      if (st.inp.value) ghDirCheck(st);
    },
    value: function (q, st) {
      var p = String((st.inp && st.inp.value) || '').trim();
      if (!p) return { ok: false, why: tx('task.gohunit.k.dir.empty') };
      if (!/^([A-Za-z]:[\\\/]|[\\\/]{2}|\/)/.test(p)) return { ok: false, why: tx('task.gohunit.k.dir.notAbs') };
      // the check ran on this text and said no: say why here, not at the stage step
      if (st.res && st.checked === p && !st.res.ok) return { ok: false, why: tx('task.gohunit.k.dir.' + (DIRWHY[st.res.why] ? st.res.why : 'missing')) };
      return { ok: true, answer: { src: 'value', value: p } };
    }
  });
  TASK.kind('goh-donor', {
    draw: function (q, st, host) {
      var unit = ghAns(st, 'unit') || '', gdir = ghAns(st, 'goh_dir') || '', adir = ghAns(st, 'game_dir') || '', list = h('div', { class: 'tk-src', 'data-goh-donors': '1' }), msg = h('div', { class: 'hint', text: tx('task.gohunit.k.donorLooking') });
      st.pick = st.value || '';
      st.inp = h('input', { type: 'text', autocomplete: 'off', 'aria-label': tx('task.gohunit.k.donorOwn'), placeholder: tx('task.gohunit.k.donorOwn'), 'data-goh-donor-own': '1', value: st.pick });
      st.inp.addEventListener('input', function () { st.pick = String(st.inp.value || '').trim(); });
      // the own-name box: the suggested donors first, then the vanilla pool of the AS2 folder (read once); Browse = the file picker over
      // the game data at entity/ (.def files; the base name is the donor name [I]); history
      var sug = [], dk = ghKit(st.inp, { key: 'task.sk.gohunit.donor',
        index: function (s, done) { ghNames(adir, function (l) { var lo = s.toLowerCase(), a = sug.filter(function (x) { return x.toLowerCase().indexOf(lo) >= 0; }).map(function (x) { return { label: x, value: x, hint: tx('task.gohunit.k.donorSug') }; }), r = ghHits(l.filter(function (x) { return sug.indexOf(x.value) < 0; }), s); done(a.concat(r.l), r.more); }); },
        browse: { mode: 'file', view: 'data', start: 'entity', exts: ['def'], toValue: function (p, e) { var b = String((e && e.name) || p || '').split(/[\\\/]/).pop(), i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; } },
        onPick: function (v) { st.inp.value = v; st.pick = v; var rs = list.querySelectorAll ? list.querySelectorAll('input') : []; for (var i = 0; i < rs.length; i++) rs[i].checked = rs[i].value === v; } });
      host.appendChild(msg); host.appendChild(list); host.appendChild(dk ? dk.el : st.inp);
      if (!unit) { msg.textContent = tx('task.gohunit.k.noUnit'); return; }
      // the donors are read from the folders the first group picked (the GoH page's own setting when they are empty)
      api('/api/x/goh/donors?unit=' + encodeURIComponent(unit) + (gdir ? '&goh=' + encodeURIComponent(gdir) : '') + (adir ? '&game=' + encodeURIComponent(adir) : '')).then(function (r) {
        msg.textContent = (r.donors || []).length ? tx('task.gohunit.k.donorFound', { c: r.cls || '?', f: r.confidence || '' }) : (r.unplaced || tx('task.gohunit.k.donorNone'));
        sug = (r.donors || []).map(function (x) { return x.stem; });
        (r.donors || []).forEach(function (x, i) {
          var rb = h('input', { type: 'radio', name: 'ghdonor', value: x.stem, 'data-goh-donor': x.stem });
          rb.checked = st.pick ? st.pick === x.stem : i === 0;
          if (rb.checked) { st.pick = x.stem; st.inp.value = x.stem; }
          rb.addEventListener('change', function () { st.pick = x.stem; st.inp.value = x.stem; });
          list.appendChild(h('label', {}, [rb, h('b', { text: ' ' + x.stem }), h('span', { class: 'hint', text: '  ' + (x.why || []).join(', ') })]));
        });
      }).catch(function (e) { msg.textContent = String((e && (e.text || e.message)) || e); });
    },
    value: function (q, st) {
      var v = String(st.pick || '').trim();
      if (!GNAME.test(v)) return { ok: false, why: tx('task.gohunit.k.donorBad'), limit: 'PORT-46' };
      return { ok: true, answer: { src: 'value', value: v } };
    }
  });
  function ghQ(st) {
    var box = st.box, qs = st.qs || [], i = st.i, x = qs[i];
    box.textContent = '';
    if (!qs.length) { box.appendChild(h('div', { class: 'tk-card', 'data-goh-noq': '1', text: tx(st.none === 'no_translate' ? 'task.gohunit.k.noAskOff' : 'task.gohunit.k.noAsk') })); return; }
    var a = st.answers[x.id] || { choice: x.def || 'scale', rest: false };
    st.answers[x.id] = a;
    box.appendChild(h('div', { class: 'hint', 'data-goh-at': String(i + 1), text: tx('task.gohunit.k.qAt', { i: i + 1, n: qs.length }) }));
    var rg = x.range ? tx('task.gohunit.k.range', { a: x.range.p5, b: x.range.p95 }) : '';
    box.appendChild(h('div', { class: 'tk-card', 'data-goh-q': x.id }, [
      h('b', { text: x.key + '  (' + (x.class || '') + ', ' + tx(x.stage === 'engine' ? 'task.gohunit.k.stEngine' : 'task.gohunit.k.stScale') + ')' }),
      h('div', { text: tx('task.gohunit.k.nums', { g: x.goh, t: x.translated, s: x.scaled, d: x.donor }) }),
      rg ? h('div', { class: 'hint', text: rg }) : null
    ].filter(Boolean)));
    var rows = ['scale', 'translated', 'donor'].map(function (c) {
      var rb = h('input', { type: 'radio', name: 'ghq', value: c, 'data-goh-choice': c });
      rb.checked = a.choice === c;
      rb.addEventListener('change', function () { a.choice = c; });
      return h('label', {}, [rb, h('span', { text: ' ' + tx('task.gohunit.k.c.' + c, { s: x.scaled, t: x.translated, d: x.donor }) })]);
    });
    box.appendChild(h('div', { class: 'tk-src' }, rows));
    var cb = h('input', { type: 'checkbox', 'data-goh-rest': '1' });
    cb.checked = !!a.rest;
    cb.addEventListener('change', function () { a.rest = cb.checked; });
    box.appendChild(h('label', {}, [cb, h('span', { text: ' ' + tx('task.gohunit.k.rest', { c: x.class || '' }) })]));
    var prev = h('button', { type: 'button', 'data-goh-prev': '1', text: tx('task.gohunit.k.prev'), onclick: function () { st.i = Math.max(0, st.i - 1); ghQ(st); } });
    var next = h('button', { type: 'button', 'data-goh-next': '1', text: tx('task.gohunit.k.next'), onclick: function () { st.i = Math.min(qs.length - 1, st.i + 1); ghQ(st); } });
    prev.disabled = i === 0; next.disabled = i >= qs.length - 1;
    box.appendChild(h('div', { class: 'row' }, [prev, next]));
  }
  function ghScan(st) {
    st.box.textContent = tx('task.gohunit.k.asking');
    return api('/api/x/task/r/gohunit/scan', { draft: st.draft }, TASK.job()).then(function (r) {
      if (!r || !r.ok) { st.res = null; ghErr(st.box, tx('task.gohunit.k.scanFail', { c: r && r.code != null ? r.code : '?' })); return null; }
      st.res = r; st.qs = r.questions || []; st.none = r.none || ''; st.i = 0; ghQ(st); return r;
    }).catch(function (e) { st.res = null; ghErr(st.box, e); return null; });
  }
  TASK.kind('goh-ask', {
    draw: function (q, st, host) {
      var old = st.answer && st.answer.src === 'value' && st.answer.value;
      st.box = h('div', { 'data-goh-ask': '1' }); st.answers = {}; st.i = 0;
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', 'data-goh-rescan': '1', text: tx('task.gohunit.k.again'), onclick: function () { ghScan(st); } })]));
      host.appendChild(st.box);
      if (old && old.sig && old.questions) {
        st.res = old; st.qs = old.questions; st.none = old.none || '';
        for (var k in (old.answers || {})) if (Object.prototype.hasOwnProperty.call(old.answers, k)) st.answers[k] = { choice: old.answers[k].choice, rest: !!old.answers[k].rest };
        ghQ(st);
      } else ghScan(st);
    },
    value: function (q, st) {
      function pick(r) {
        if (!r || !r.ok) return { ok: false, why: tx('task.gohunit.k.noScan') };
        var ans = {}, qs = st.qs || [];
        for (var i = 0; i < qs.length; i++) { var a = st.answers[qs[i].id] || { choice: qs[i].def || 'scale', rest: false }; ans[qs[i].id] = { choice: a.choice, rest: !!a.rest }; }
        return { ok: true, answer: { src: 'value', value: { sig: r.sig, n: qs.length, none: r.none || '', questions: qs, answers: ans } } };
      }
      if (st.res) return pick(st.res);
      return ghScan(st).then(pick);
    }
  });
  function ghShow(box, r) {
    box.textContent = '';
    if (!r) return;
    if (!r.ok) { box.appendChild(h('div', { class: 'tk-refuse', role: 'alert', text: r.error || tx('task.gohunit.k.makeFail') })); (r.lines || []).forEach(function (l) { box.appendChild(h('div', { class: 'hint', text: l })); }); return; }
    box.appendChild(h('div', { class: 'tk-card', 'data-goh-done': '1', text: tx('task.gohunit.k.done', { n: r.files, k: Math.round((r.bytes || 0) / 1024) }) }));
    if (!r.defMade) box.appendChild(h('div', { class: 'tk-refuse', text: tx('task.gohunit.k.noDef') }));
    (r.errors || []).forEach(function (l) { box.appendChild(h('div', { class: 'tk-refuse', text: l })); });
    (r.steps || []).forEach(function (l) { box.appendChild(h('div', { class: 'hint', text: l })); });
  }
  function ghRun(st) {
    st.box.textContent = tx('task.gohunit.k.making');
    return api('/api/x/task/r/gohunit/stage', { draft: st.draft }, TASK.job()).then(function (r) { st.res = r; ghShow(st.box, r); return r; })
      .catch(function (e) { st.res = null; ghErr(st.box, e); return null; });
  }
  TASK.kind('goh-stage', {
    draw: function (q, st, host) {
      st.box = h('div', { 'data-goh-stage': '1' });
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', class: 'primary', 'data-goh-run': '1', text: tx('task.gohunit.k.run'), onclick: function () { ghRun(st); } })]));
      host.appendChild(st.box);
      if (st.answer && st.answer.src === 'value' && st.answer.value) st.box.appendChild(h('div', { class: 'hint', text: tx('task.gohunit.k.before', { n: st.answer.value.files || 0 }) }));
    },
    value: function (q, st) {
      function pick(r) { return r && r.ok ? { ok: true, answer: { src: 'value', value: { sig: r.sig, files: r.files } } } : { ok: false, why: (r && r.error) || tx('task.gohunit.k.makeFail') }; }
      if (st.res) return pick(st.res);
      return ghRun(st).then(pick);
    }
  });
}
const script = '(' + page.toString() + ')();';
module.exports = { kinds: ['goh-dir', 'goh-donor', 'goh-ask', 'goh-stage'], script, css: '', page };
