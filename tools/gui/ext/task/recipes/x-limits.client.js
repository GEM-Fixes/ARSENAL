// recipe "what is possible", page side: three read-only question kinds. xx-limits and xx-guides read the recipe's own route
// GET /api/x/task/r/x-limits/find (limits rows / guide sections ranked by the words of the question); xx-words filters
// GET /api/x/help/glossary. Each draws its answer into the question area and the clicked row into the look pane; Next moves on and
// nothing is written. A link (lim:ID, docs:path#line) saves and closes the task, then opens through as2Link.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, theme tokens only (the function below is shipped as text).
// Author: Imperator_Aug (ARSENAL, ia-4f5b3361)
'use strict';
function page() {
  if (!window.TASK || !TASK.kind) return;
  function xxLook() { return document.querySelector('[data-task-look]'); }
  function xxQ(st) { var a = st.draft && st.draft.answers && st.draft.answers.question; return a && a.src === 'value' ? String(a.value || '') : ''; }
  function xxGo(link) { TASK.close().then(function () { if (typeof as2Link !== 'function' || !as2Link(link)) toast(tx('task.x-limits.k.nolink')); }); }
  function xxErr(e) { return tx('task.x-limits.k.fail', { m: String((e && (e.text || e.message)) || e || '') }); }
  function xxShow(el, kids) { var l = xxLook(); if (!l) return; l.textContent = ''; for (var i = 0; i < kids.length; i++) if (kids[i]) l.appendChild(kids[i]); }
  function xxRow(r) {
    return [h('b', { text: r.subject + '  (' + r.id + ')' }),
      h('div', { class: 'xx-l' }, [h('span', { class: 'hint', text: tx('task.x-limits.k.what') + ' ' }), h('span', { text: r.limit })]),
      h('div', { class: 'xx-l' }, [h('span', { class: 'hint', text: tx('task.x-limits.k.means') + ' ' }), h('span', { text: r.effect })]),
      r.tag ? h('div', { class: 'hint', text: tx('task.x-limits.k.tag.' + r.tag) }) : null,
      r.checker ? h('div', { class: 'hint', text: tx('task.x-limits.k.chk') }) : null,
      r.goh ? h('div', { class: 'hint', text: tx('task.x-limits.k.gohRow') }) : null,
      h('div', { class: 'row' }, [h('button', { type: 'button', class: 'linkb', 'data-xx-lim': r.id, text: tx('task.x-limits.k.open', { id: r.id }), onclick: function () { xxGo(r.goh ? 'docs:' + r.file + '#' + r.line : 'lim:' + r.id); } })])];
  }
  // the draft's game (the game the task was started on), else the page's
  function xxGame(st) { return String((st.draft && st.draft.game) || (typeof S === 'object' && S && S.gameId) || ''); }
  function xxList(host, st, what) {
    var q = xxQ(st), out = h('div', { class: 'xx-res', 'data-xx-res': what }), say = h('div', { class: 'hint', text: tx('task.x-limits.k.looking') });
    host.appendChild(say); host.appendChild(out); st.n = 0;
    if (!q) { say.textContent = tx('task.x-limits.k.noq'); return; }
    var g = xxGame(st);
    api('/api/x/task/r/x-limits/find?what=' + what + '&q=' + encodeURIComponent(q) + (g ? '&game=' + encodeURIComponent(g) : '')).then(function (r) {
      st.n = r.total || 0;
      if (r.nofiles) { say.textContent = tx('task.x-limits.k.nofiles'); return; }
      say.textContent = (r.words && r.words.length ? tx('task.x-limits.k.words', { w: r.words.join(', ') }) + '  ' : '') +
        (r.total ? tx('task.x-limits.k.found', { n: r.total }) + (r.total > r.results.length ? '  ' + tx('task.x-limits.k.more', { n: r.results.length }) : '') : tx(what === 'guide' ? 'task.x-limits.k.gnone' : 'task.x-limits.k.none')) +
        (r.game === 'goh' ? '  ' + tx(r.goh ? 'task.x-limits.k.goh' : 'task.x-limits.k.nogoh') : '');
      (r.results || []).forEach(function (x, i) {
        var card;
        if (what === 'guide') {
          var link = 'docs:' + x.p + '#' + x.line;
          card = h('div', { class: 'tk-card', 'data-xx-guide': x.p }, [h('b', { text: x.title + (x.h ? '  >  ' + x.h : '') }), x.snip ? h('div', { class: 'hint', text: x.snip }) : null,
            h('div', { class: 'row' }, [h('button', { type: 'button', class: 'linkb', 'data-xx-doc': link, text: tx('task.x-limits.k.openG'), onclick: function () { xxGo(link); } })])]);
          card.addEventListener('click', function (e) { if (e.target && e.target.tagName === 'BUTTON') return; xxShow(null, [h('b', { text: x.title }), h('div', { text: x.h }), h('div', { class: 'hint', text: x.snip })]); });
        } else {
          card = h('div', { class: 'tk-card', 'data-xx-row': x.id }, xxRow(x));
          card.addEventListener('click', function (e) { if (e.target && e.target.tagName === 'BUTTON') return; xxShow(null, xxRow(x)); });
        }
        out.appendChild(card);
        if (i === 0) xxShow(null, what === 'guide' ? [h('b', { text: x.title }), h('div', { text: x.h }), h('div', { class: 'hint', text: x.snip })] : xxRow(x));
      });
    }).catch(function (e) { say.textContent = xxErr(e); });
  }
  function xxVal(st) { return { ok: true, answer: { src: 'value', value: st.n || 0 } }; }
  TASK.kind('xx-limits', { draw: function (q, st, host) { xxList(host, st, 'limits'); }, value: function (q, st) { return xxVal(st); } });
  TASK.kind('xx-guides', { draw: function (q, st, host) { xxList(host, st, 'guide'); }, value: function (q, st) { return xxVal(st); } });
  TASK.kind('xx-words', {
    draw: function (q, st, host) {
      var text = xxQ(st).toLowerCase(), say = h('div', { class: 'hint', text: tx('task.x-limits.k.looking') }), out = h('div', { class: 'xx-res', 'data-xx-words': '1' });
      host.appendChild(say); host.appendChild(out); st.n = 0;
      var ws = text.split(/[\s,.;:!?()"']+/).filter(function (w) { return w.length > 2; });
      api('/api/x/help/glossary?lang=' + encodeURIComponent(typeof LANG === 'string' ? LANG : 'en')).then(function (r) {
        var got = (r.terms || []).filter(function (t) {
          var n = String(t.t || '').toLowerCase(); if (!n) return false;
          if (text.indexOf(n) >= 0) return true;
          for (var i = 0; i < ws.length; i++) if (n === ws[i] || n.indexOf(ws[i]) === 0 || ws[i].indexOf(n) === 0) return true;
          return false;
        }).slice(0, 25);
        st.n = got.length;
        say.textContent = got.length ? tx('task.x-limits.k.wfound', { n: got.length }) : tx('task.x-limits.k.wnone');
        got.forEach(function (t, i) {
          var card = h('div', { class: 'tk-card', 'data-xx-term': t.t }, [h('b', { text: t.t }), h('div', { text: t.d })]);
          card.addEventListener('click', function () { xxShow(null, [h('b', { text: t.t }), h('div', { text: t.d })]); });
          out.appendChild(card);
          if (i === 0) xxShow(null, [h('b', { text: t.t }), h('div', { text: t.d })]);
        });
      }).catch(function (e) { say.textContent = xxErr(e); });
    },
    value: function (q, st) { return xxVal(st); },
  });
}
module.exports = {
  kinds: ['xx-limits', 'xx-guides', 'xx-words'],
  script: '(' + page.toString() + ')();',
  css: '.xx-res{display:flex;flex-direction:column;gap:2px}.xx-l{margin:2px 0}',
};
