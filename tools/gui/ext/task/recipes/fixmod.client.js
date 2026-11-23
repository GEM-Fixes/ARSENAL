// recipe "fix my mod's problems", page side: the question kinds "fix-scan" (POST /api/x/task/r/fixmod/scan: check and fix plan, read
// only) and "fix-walk" (one problem per screen: the plain words card from GET /api/explain, the one click fix where a fixer exists,
// the place in the Editor; on Next it makes the picked fixes through POST /api/x/task/r/fixmod/stage into the task's scratch folder).
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, no arrow functions, theme tokens only.
// Author: Imperator_Aug (ARSENAL, ia-d2ba2c7f)
'use strict';
/* eslint-disable no-var */
function page() {
  if (!window.TASK || !TASK.kind) return;
  function fxErr(box, e) { if (TASK.stopped(box, e)) return; box.textContent = ''; box.appendChild(h('div', { class: 'tk-refuse', role: 'alert', text: String((e && (e.text || e.message)) || e) })); }
  // leave the task window for another page: TASK.close saves the task first (its own toast says how to come back), then the page opens
  function fxOut(go) { TASK.close().then(function () { return go(); }); }
  function fxToCheck() { return h('button', { type: 'button', class: 'linkb', 'data-fix-tocheck': '1', text: tx('task.fixmod.k.toCheck'), onclick: function () { fxOut(function () { return typeof as2Link === 'function' && as2Link('page:check'); }); } }); }
  function fxLines(box, lines) { (lines || []).forEach(function (l) { box.appendChild(h('div', { class: 'hint', 'data-fix-line': '1', text: l })); }); }
  function fxScanShow(box, r) {
    box.textContent = '';
    if (!r) return;
    var c = r.check || {}, v = c.verdict || 'unfinished';
    box.appendChild(h('div', { class: 'tk-card', 'data-fix-verdict': v, text: tx('task.fixmod.k.v.' + (v === 'ok' || v === 'crash' || v === 'refused' ? v : 'unfinished')) }));
    (c.plain || []).slice(0, 8).forEach(function (l) { box.appendChild(h('div', { class: 'hint', text: l })); });
    if (r.goh) box.appendChild(h('div', { class: 'hint', text: tx('task.fixmod.k.goh') }));
    else if (!r.fixRan) { box.appendChild(h('div', { class: 'tk-refuse', 'data-fix-fail': '1', text: tx('task.fixmod.k.fixFail') })); fxLines(box, r.fixLines); box.appendChild(h('div', { class: 'row' }, [fxToCheck()])); }
    var n = 0; (r.safe || []).forEach(function (s) { n += s.n; });
    box.appendChild(h('div', { 'data-fix-counts': '1', text: tx('task.fixmod.k.counts', { s: n, r: (r.items || []).length }) }));
  }
  function fxScan(st, box) {
    box.textContent = tx('task.fixmod.k.scanning');
    return api('/api/x/task/r/fixmod/scan', { draft: st.draft }, TASK.job()).then(function (r) { st.res = r; fxScanShow(box, r); return r; })
      .catch(function (e) { st.res = null; fxErr(box, e); return null; });
  }
  TASK.kind('fix-scan', {
    draw: function (q, st, host) {
      var box = h('div', { 'data-fix-scan': '1' });
      st.box = box;
      host.appendChild(h('div', { class: 'row' }, [h('button', { type: 'button', class: 'primary', 'data-fix-run': '1', text: tx('task.fixmod.k.scan'), onclick: function () { fxScan(st, box); } })]));
      host.appendChild(box);
      if (st.answer && st.answer.src === 'value' && st.answer.value && st.answer.value.sig) { st.res = st.answer.value; fxScanShow(box, st.res); }
      else fxScan(st, box);
    },
    value: function (q, st) {
      function pick(r) { return r && r.ok ? { ok: true, answer: { src: 'value', value: r } } : { ok: false, why: tx('task.fixmod.k.noScan') }; }
      if (st.res) return pick(st.res);
      return fxScan(st, st.box).then(pick);
    }
  });
  function fxScanOf(st) { var a = st.draft && st.draft.answers && st.draft.answers.scan; return a && a.value ? a.value : { items: [], safe: [] }; }
  function fxEdit(st, s) {
    var mod = st.draft && st.draft.mod, f = s.file || '', abs = /^[A-Za-z]:[\\\/]/.test(f) || /^\//.test(f);
    var ref = abs ? { mod: mod, path: f } : { mod: mod, rel: f };
    TASK.close().then(function () { if (typeof as2Edit !== 'function' || !as2Edit(ref, s.line || 0, 0)) toast(tx('task.fixmod.k.noEditor')); });
  }
  function fxDraw(st) {
    var box = st.box, items = st.items, i = st.i, it = items[i];
    box.textContent = '';
    if (!it) { box.appendChild(h('div', { class: 'tk-card', 'data-fix-none': '1', text: tx('task.fixmod.k.nothing') })); return; }
    var card = st.cards[it.code] || null;
    box.appendChild(h('div', { class: 'hint', 'data-fix-at': String(i + 1), text: tx('task.fixmod.k.at', { i: i + 1, n: items.length, c: it.n }) }));
    var kids = [h('b', { text: card && card.what ? card.what : (it.fix ? tx('task.fixmod.f.' + it.fix) : it.code) })];
    if (card && card.impact) kids.push(h('div', { class: 'hint', text: card.impact }));
    if (card && card.why) kids.push(h('div', { text: card.why }));
    if (card && card.fix && card.fix.length) kids.push(h('ol', {}, card.fix.slice(0, 6).map(function (l) { return h('li', { text: l }); })));
    if (it.code) kids.push(h('div', { class: 'hint', 'data-fix-code': '1', text: it.code }));
    // a limit is a small "why" link (the Docs page), not part of the text
    if (card && card.limits && card.limits.length) kids.push(h('div', { class: 'row' }, card.limits.slice(0, 3).map(function (id) {
      return h('button', { type: 'button', class: 'linkb', 'data-fix-lim': String(id), text: tx('task.q.limit', { id: id }), onclick: function () { fxOut(function () { return typeof as2Link === 'function' && as2Link('lim:' + id); }); } });
    })));
    box.appendChild(h('div', { class: 'tk-card', 'data-fix-card': it.code || it.fix }, kids));
    (it.samples || []).forEach(function (s) {
      var row = [h('span', { text: (s.file || '') + (s.line ? ':' + s.line : '') + (s.msg ? '  ' + s.msg : '') })];
      if (s.file) row.push(h('button', { type: 'button', class: 'linkb', 'data-fix-edit': '1', text: tx('task.fixmod.k.edit'), onclick: function () { fxEdit(st, s); } }));
      box.appendChild(h('div', { class: 'row' }, row));
    });
    if (it.fix) {
      var on = st.picks[it.id] === 'fix';
      var mk = function (val, key) {
        var r = h('input', { type: 'radio', name: 'fxpick', value: val, 'data-fix-pick': val });
        r.checked = val === 'fix' ? on : !on;
        r.addEventListener('change', function () { st.picks[it.id] = val; });
        return h('label', {}, [r, h('span', { text: ' ' + tx(key, { f: tx('task.fixmod.f.' + it.fix) }) })]);
      };
      box.appendChild(h('div', { class: 'tk-src' }, [mk('fix', 'task.fixmod.k.doFix'), mk('leave', 'task.fixmod.k.leave')]));
    } else box.appendChild(h('div', { class: 'hint', text: tx('task.fixmod.k.byHand') }));
    var prev = h('button', { type: 'button', 'data-fix-prev': '1', text: tx('task.fixmod.k.prev'), onclick: function () { st.i = Math.max(0, st.i - 1); fxDraw(st); } });
    var next = h('button', { type: 'button', 'data-fix-next': '1', text: tx('task.fixmod.k.next', { n: Math.min(items.length, i + 2) }), onclick: function () { st.i = Math.min(items.length - 1, st.i + 1); fxDraw(st); } });
    prev.disabled = i === 0; next.disabled = i >= items.length - 1;
    box.appendChild(h('div', { class: 'row' }, [prev, next]));
    if ((it.samples || []).some(function (s) { return !!s.file; })) box.appendChild(h('div', { class: 'hint', text: tx('task.fixmod.k.editHint') }));
    // the main Next of the window makes the fixes: say so above it
    box.appendChild(h('div', { class: 'tk-card', 'data-fix-mainnext': '1', text: tx('task.fixmod.k.mainNext') }));
  }
  TASK.kind('fix-walk', {
    draw: function (q, st, host) {
      var scan = fxScanOf(st), old = st.answer && st.answer.value && st.answer.value.picks;
      st.items = scan.items || []; st.i = 0; st.cards = {}; st.picks = {};
      if (old) for (var k in old) if (Object.prototype.hasOwnProperty.call(old, k)) st.picks[k] = old[k];
      st.box = h('div', { 'data-fix-walk': '1' });
      st.out = h('div', { 'data-fix-staged': '1' });
      host.appendChild(st.box); host.appendChild(st.out);
      var codes = [];
      st.items.forEach(function (it) { if (it.code && codes.indexOf(it.code) < 0) codes.push(it.code); });
      fxDraw(st);
      if (codes.length) api('/api/explain?codes=' + encodeURIComponent(codes.slice(0, 300).join(',')) + '&lang=' + encodeURIComponent(typeof LANG === 'string' ? LANG : 'en'))
        .then(function (j) { st.cards = (j && j.cards) || {}; fxDraw(st); }).catch(function () { /* the codes still show */ });
    },
    value: function (q, st) {
      var d = JSON.parse(JSON.stringify(st.draft || {}));
      d.answers = d.answers || {};
      d.answers.walk = { src: 'value', value: { picks: st.picks } };
      st.out.textContent = tx('task.fixmod.k.making');
      return api('/api/x/task/r/fixmod/stage', { draft: d }, TASK.job()).then(function (r) {
        st.out.textContent = '';
        if (!r || !r.ok) { st.out.appendChild(h('div', { class: 'tk-refuse', 'data-fix-makefail': '1', text: tx('task.fixmod.k.makeFail') })); fxLines(st.out, r && r.lines); st.out.appendChild(h('div', { class: 'row' }, [fxToCheck()])); return { ok: false, why: tx('task.fixmod.k.makeFail') }; }
        return { ok: true, answer: { src: 'value', value: { picks: st.picks, sig: r.sig, files: r.files } } };
      }).catch(function (e) { fxErr(st.out, e); if (e && e.cancelled) return { ok: false, stopped: true }; return { ok: false, why: String((e && (e.text || e.message)) || e) }; });
    }
  });
  // the expert values (one per line, file:path=value); Next makes the fixes again when they change what the walk made
  TASK.kind('fix-sets', {
    draw: function (q, st, host) {
      var v = st.answer && st.answer.src === 'value' ? st.answer.value : st.value;
      st.ta = h('textarea', { rows: '4', 'data-fix-sets': '1', 'aria-label': tx(q.ask), placeholder: tx('task.fixmod.k.setsPh') });
      st.ta.value = [].concat(v || []).join('\n');
      st.out = h('div', { 'data-fix-staged': '1' });
      host.appendChild(st.ta); host.appendChild(st.out);
    },
    value: function (q, st) {
      var lines = String(st.ta.value || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean), re = /^[^:]+:[^=]+=.*$/;
      for (var i = 0; i < lines.length; i++) if (!re.test(lines[i])) return { ok: false, why: tx('task.fixmod.k.setsBad', { l: lines[i] }) };
      var d = JSON.parse(JSON.stringify(st.draft || {}));
      d.answers = d.answers || {};
      d.answers.sets = { src: 'value', value: lines };
      st.out.textContent = tx('task.fixmod.k.making');
      return api('/api/x/task/r/fixmod/stage', { draft: d, same: true }, TASK.job()).then(function (r) {
        st.out.textContent = '';
        if (!r || !r.ok) { st.out.appendChild(h('div', { class: 'tk-refuse', 'data-fix-makefail': '1', text: tx('task.fixmod.k.makeFail') })); fxLines(st.out, r && r.lines); st.out.appendChild(h('div', { class: 'row' }, [fxToCheck()])); return { ok: false, why: tx('task.fixmod.k.makeFail') }; }
        if (r.same && lines.length) toast(tx('task.fixmod.k.same'));
        return { ok: true, answer: { src: 'value', value: lines } };
      }).catch(function (e) { fxErr(st.out, e); if (e && e.cancelled) return { ok: false, stopped: true }; return { ok: false, why: String((e && (e.text || e.message)) || e) }; });
    }
  });
}
const script = '(' + page.toString() + ')();';
module.exports = { kinds: ['fix-scan', 'fix-walk', 'fix-sets'], script, css: '', page };
