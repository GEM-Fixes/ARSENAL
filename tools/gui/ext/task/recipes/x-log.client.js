// recipe "what went wrong in the last run", page side: three read-only question kinds. xl-run lists the log folders of
// GET /api/x/logs/find (newest first picked); xl-errors shows the cards of POST /api/x/logs/explain for that folder in plain words,
// each with the file and line it points at: the link of GET /api/x/ide/log for the same error (code and log line, else code and
// message), else the error's own place turned into a game key; "Open in the Editor" saves and closes the task and opens the link
// through as2Link. xl-todo lists the fix steps, the limits row and the tests of each error. Nothing is written.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML, theme tokens only (the function below is shipped as text).
// Author: Imperator_Aug (ARSENAL, ia-c4702405)
'use strict';
function page() {
  if (!window.TASK || !TASK.kind) return;
  var XL = { k: '', p: null };
  function xlLook() { return document.querySelector('[data-task-look]'); }
  function xlShow(kids) { var l = xlLook(); if (!l) return; l.textContent = ''; for (var i = 0; i < kids.length; i++) if (kids[i]) l.appendChild(kids[i]); }
  function xlGo(link) { TASK.close().then(function () { if (typeof as2Link !== 'function' || !as2Link(link)) toast(tx('task.x-log.k.nolink')); }); }
  function xlErr(e) { return tx('task.x-log.k.fail', { m: String((e && (e.text || e.message)) || e || '') }); }
  function xlTime(ms) { try { return new Date(ms).toLocaleString(); } catch (e) { return String(ms); } }
  function xlBase(p) { return String(p || '').replace(/\\/g, '/').split('/').pop().toLowerCase(); }
  // a place of the game ("/entity/-vehicle/x/x.def/y.mdl") -> key:resource/entity/-vehicle/x/x.def (the first part with a file type)
  function xlKey(where) {
    var p = String(where || '').replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase(), segs, i;
    if (!p || /\.(cpp|h|hpp|inl)$/.test(p) || p.indexOf(':') >= 0) return null;
    segs = p.split('/');
    for (i = 0; i < segs.length; i++) if (/\.[a-z0-9_]+$/.test(segs[i])) break;
    if (i >= segs.length) return null;
    p = segs.slice(0, i + 1).join('/');
    return 'key:' + (p.indexOf('resource/') === 0 ? p : 'resource/' + p);
  }
  function xlMerge(ex, il) {
    var byLine = {}, byMsg = {}, same = xlBase(il && il.file), out = { cards: [], tests: [], notes: [], header: [] };
    ((il && il.findings) || []).forEach(function (f) { if (!f.link) return; byLine[f.code + '|' + f.logLine] = f.link; if (!byMsg[f.code + '|' + f.msg]) byMsg[f.code + '|' + f.msg] = f.link; });
    ((ex && ex.results) || []).forEach(function (r) {
      if (!out.header.length) out.header = r.header || [];
      (r.tests || []).forEach(function (t) { if (out.tests.indexOf(t) < 0) out.tests.push(t); });
      (r.notes || []).forEach(function (t) { var s = typeof t === 'string' ? t : (t && (t.text || t.msg)) || ''; if (s && out.notes.indexOf(s) < 0) out.notes.push(s); });
      (r.cards || []).forEach(function (c) {
        var link = (same && xlBase(c.file) === same && byLine[c.code + '|' + c.line]) || byMsg[c.code + '|' + c.msg] || xlKey(c.where);
        out.cards.push({ code: c.code, level: c.level || 'note', title: c.title || c.code, what: c.what || '', fix: c.fix || [], msg: c.msg || '', where: c.where || '',
          file: c.file || '', line: c.line || 0, count: c.count || 1, row: c.row || '', detail: c.detail || '', link: link || null });
      });
    });
    var rank = { stop: 0, crash: 0, warn: 1, note: 2 };
    out.cards.sort(function (a, b) { return (rank[a.level] == null ? 3 : rank[a.level]) - (rank[b.level] == null ? 3 : rank[b.level]); });
    return out;
  }
  // the draft's game (the game the task was started on), else the page's; sent as gid (ctx.gameId() of the routes) when it is not
  // AS64, so a MoW:AS2 or Gates of Hell task reads that game's own log folder (GoH: its user folder, GHVFS-13); AS64 asks as before
  function xlGid(st) { var g = String((st && st.draft && st.draft.game) || (typeof S === 'object' && S && S.gameId) || ''); return g && g !== 'as64' ? g : ''; }
  function xlQ(u, st) { var g = xlGid(st); return g ? u + (u.indexOf('?') < 0 ? '?' : '&') + 'gid=' + encodeURIComponent(g) : u; }
  function xlInst(st) { var a = st.draft && st.draft.answers && st.draft.answers.run; return a && a.inst != null ? a.inst : null; }
  function xlLoad(st) {
    var inst = xlInst(st), mod = (st.draft && st.draft.mod) || S.mod || '', gid = xlGid(st), k = (st.draft && st.draft.id) + '|' + inst + '|' + mod + '|' + gid;
    if (XL.k === k && XL.p) return XL.p;
    var b = {}; if (inst != null) b.inst = inst; if (mod) b.mod = mod; if (gid) b.gid = gid;
    XL.k = k;
    XL.p = Promise.all([api(xlQ('/api/x/logs/explain', st), b), api(xlQ('/api/x/ide/log?mod=' + encodeURIComponent(mod), st)).catch(function () { return { findings: [] }; })])
      .then(function (r) { return xlMerge(r[0], r[1]); });
    XL.p.catch(function () { XL.k = ''; XL.p = null; });
    return XL.p;
  }
  function xlLink(c) {
    var row = h('div', { class: 'row' });
    if (c.link) {
      row.appendChild(h('span', { class: 'hint', text: tx('task.x-log.k.points', { f: c.link.replace(/^[a-z]+:/, '') }) }));
      row.appendChild(h('button', { type: 'button', class: 'linkb', 'data-xl-edit': c.link, text: tx('task.x-log.k.edit'), onclick: function () { xlGo(c.link); } }));
    } else row.appendChild(h('span', { class: 'hint', text: tx('task.x-log.k.nopoint') }));
    if (c.line && /(^|[\\/])game(\.prev)?\.log$/i.test(c.file)) row.appendChild(h('button', { type: 'button', class: 'linkb', 'data-xl-log': String(c.line), text: tx('task.x-log.k.logline'), onclick: function () { xlGo('log:' + c.line); } }));
    return row;
  }
  function xlCard(c, full) {
    var kids = [h('div', {}, [h('span', { class: 'xl-lv xl-' + c.level, text: tx('task.x-log.k.lv.' + (/^(stop|crash|warn|note)$/.test(c.level) ? c.level : 'note')) }), h('b', { text: '  ' + c.title }),
      c.count > 1 ? h('span', { class: 'hint', text: '  ' + tx('task.x-log.k.times', { n: c.count }) }) : null]),
      c.what ? h('div', { text: c.what }) : null,
      c.msg ? h('div', { class: 'hint', text: tx('task.x-log.k.says') + ' ' + c.msg }) : null,
      c.where ? h('div', { class: 'hint', text: tx('task.x-log.k.where', { w: c.where }) }) : null,
      xlLink(c)];
    if (full) {
      if (c.file) kids.push(h('div', { class: 'hint', text: tx('task.x-log.k.from', { f: xlBase(c.file), l: c.line }) }));
      if (c.detail) kids.push(h('pre', { class: 'xl-pre', text: c.detail }));
    }
    return kids;
  }
  function xlSide(m) {
    var side = [];
    if (m.tests.length) { side.push(h('b', { text: tx('task.x-log.k.tests') })); m.tests.forEach(function (t) { side.push(h('div', { text: t })); }); }
    if (m.notes.length) { side.push(h('b', { text: tx('task.x-log.k.notes') })); m.notes.slice(0, 10).forEach(function (t) { side.push(h('div', { class: 'hint', text: t })); }); }
    return side;
  }
  TASK.kind('xl-run', {
    draw: function (q, st, host) {
      var say = h('div', { class: 'hint', text: tx('task.x-log.k.looking') }), box = h('div', { class: 'tk-src', role: 'radiogroup', 'data-xl-runs': '1' });
      host.appendChild(say); host.appendChild(box); st.pick = xlInst(st); st.list = [];
      api(xlQ('/api/x/logs/find', st)).then(function (r) {
        var its = (r.instances || []).filter(function (x) { return x.files && x.files.length; });
        st.list = its;
        if (!its.length) { say.textContent = tx('task.x-log.k.nolog'); return; }
        if (st.pick == null || !its.some(function (x) { return x.inst === st.pick; })) st.pick = r.newest ? r.newest.inst : its[0].inst;
        say.textContent = r.newest ? tx('task.x-log.k.when', { t: xlTime(r.newest.mtimeMs) }) : '';
        its.forEach(function (it) {
          var last = 0; it.files.forEach(function (f) { if (f.mtimeMs > last) last = f.mtimeMs; });
          var rb = h('input', { type: 'radio', name: 'xlrun', value: String(it.inst), 'data-xl-inst': String(it.inst) });
          rb.checked = it.inst === st.pick; rb.addEventListener('change', function () { st.pick = it.inst; });
          box.appendChild(h('label', {}, [rb, h('span', { text: ' ' + tx('task.x-log.k.inst', { i: it.inst }) + (r.newest && r.newest.inst === it.inst ? '  ' + tx('task.x-log.k.newest') : '') + '  ' + xlTime(last) + '  ' +
            tx('task.x-log.k.files', { n: it.files.length }) + ((it.dumps || []).length ? '  ' + tx('task.x-log.k.dumps', { n: it.dumps.length }) : '') })]));
        });
        xlShow([h('b', { text: tx('task.x-log.k.where2') }), h('div', { class: 'hint', text: tx('task.x-log.k.whereT') })]);
      }).catch(function (e) { say.textContent = xlErr(e); });
    },
    value: function (q, st) {
      if (st.pick == null) return { ok: true, answer: { src: 'value', value: tx('task.x-log.k.noneV') } };
      var it = null; (st.list || []).forEach(function (x) { if (x.inst === st.pick) it = x; });
      var last = 0; if (it) it.files.forEach(function (f) { if (f.mtimeMs > last) last = f.mtimeMs; });
      return { ok: true, answer: { src: 'value', value: tx('task.x-log.k.runV', { i: st.pick, t: last ? xlTime(last) : '' }), inst: st.pick } };
    },
  });
  TASK.kind('xl-errors', {
    draw: function (q, st, host) {
      var say = h('div', { class: 'hint', text: tx('task.x-log.k.reading') }), out = h('div', { class: 'xl-res', 'data-xl-cards': '1' });
      host.appendChild(say); host.appendChild(out); st.n = 0;
      xlLoad(st).then(function (m) {
        st.n = m.cards.length;
        if (m.header.length) xlShow([h('b', { text: tx('task.x-log.k.head') })].concat(m.header.map(function (l) { return h('div', { class: 'hint', text: String(l) }); })));
        if (!m.cards.length) { say.textContent = tx('task.x-log.k.none'); return; }
        var stop = m.cards.filter(function (c) { return c.level === 'stop' || c.level === 'crash'; }).length, warn = m.cards.filter(function (c) { return c.level === 'warn'; }).length;
        say.textContent = tx('task.x-log.k.sum', { n: m.cards.length, s: stop, w: warn });
        m.cards.slice(0, 60).forEach(function (c) {
          var card = h('div', { class: 'tk-card', 'data-xl-code': c.code }, xlCard(c, false));
          card.addEventListener('click', function (e) { if (e.target && e.target.tagName === 'BUTTON') return; xlShow(xlCard(c, true)); });
          out.appendChild(card);
        });
      }).catch(function (e) { say.textContent = xlErr(e); });
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.n || 0 } }; },
  });
  TASK.kind('xl-todo', {
    draw: function (q, st, host) {
      var say = h('div', { class: 'hint', text: tx('task.x-log.k.reading') }), out = h('div', { class: 'xl-res', 'data-xl-todo': '1' });
      host.appendChild(say); host.appendChild(out); st.n = 0;
      xlLoad(st).then(function (m) {
        var seen = {}, list = m.cards.filter(function (c) { var k = c.code + '|' + c.msg; if (seen[k] || c.level === 'note') return false; seen[k] = 1; return true; });
        say.textContent = list.length ? '' : tx('task.x-log.k.none');
        list.slice(0, 40).forEach(function (c) {
          var kids = [h('b', { text: c.title }), c.msg ? h('div', { class: 'hint', text: c.msg }) : null, h('div', { class: 'tk-gt', text: tx('task.x-log.k.fix') })];
          (c.fix || []).forEach(function (s, i) { st.n++; kids.push(h('div', { text: (i + 1) + '. ' + s })); });
          var row = h('div', { class: 'row' });
          if (c.link) row.appendChild(h('button', { type: 'button', class: 'linkb', 'data-xl-edit': c.link, text: tx('task.x-log.k.edit'), onclick: function () { xlGo(c.link); } }));
          if (c.row) row.appendChild(h('button', { type: 'button', class: 'linkb', 'data-xl-lim': c.row, text: tx('task.x-log.k.lim', { id: c.row }), onclick: function () { xlGo('lim:' + c.row); } }));
          kids.push(row);
          out.appendChild(h('div', { class: 'tk-card', 'data-xl-fix': c.code }, kids));
        });
        var side = xlSide(m);
        if (side.length) { xlShow(side); out.appendChild(h('div', { class: 'tk-card', 'data-xl-tests': '1' }, xlSide(m))); }
      }).catch(function (e) { say.textContent = xlErr(e); });
    },
    value: function (q, st) { return { ok: true, answer: { src: 'value', value: st.n || 0 } }; },
  });
}
module.exports = {
  kinds: ['xl-run', 'xl-errors', 'xl-todo'],
  script: '(' + page.toString() + ')();',
  css: '.xl-res{display:flex;flex-direction:column;gap:2px}.xl-lv{font-size:12px;border:1px solid var(--line);border-radius:3px;padding:0 4px}' +
    '.xl-stop,.xl-crash{color:var(--err);border-color:var(--err)}.xl-warn{color:var(--warnfg)}.xl-note{color:var(--hint)}.xl-pre{font-size:12px;white-space:pre-wrap;margin:4px 0}',
  _t: { page },
};
