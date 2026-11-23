// recipe "what went wrong in the last run" test: node x-log.test.js <scratch>. The page kinds run in a small fake page with fixture
// replies (an error with an Editor link from the ide log, one from its own place, one with none; the fix steps and the limits row);
// the explain and find routes are read on this PC when a game log is there (read only; else a SKIP note); then the test kit
// (validation, census coverage with its seeded defect, 4 languages, explore steps). PASS is the last line.
// Author: Imperator_Aug (ARSENAL, ia-0ff46818)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const kit = require('../lib/testkit');
const R = require('./x-log.recipe'), C = require('./x-log.client'), LANG = require('./x-log.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-x-log-')));
fs.mkdirSync(scratch, { recursive: true });
let p = 0, f = 0;
const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
const tick = () => new Promise(r => setImmediate(r));

// a tiny page: elements are {tag, attrs, kids, text}; enough for h(), appendChild, textContent and a click
function el(tag, attrs, kids) {
  const e = { tag: String(tag).toUpperCase(), tagName: String(tag).toUpperCase(), attrs: {}, kids: [], ev: {}, _t: '', checked: false };
  e.appendChild = k => { e.kids.push(k); return k; };
  e.addEventListener = (n, fn) => { e.ev[n] = fn; };
  Object.defineProperty(e, 'textContent', { get: () => e._t + e.kids.map(k => k.textContent).join(' '), set: v => { e._t = String(v); e.kids = []; } });
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'text') e._t = String(v); else if (k === 'onclick') e.ev.click = v; else if (v != null) e.attrs[k] = String(v); }
  for (const k of [].concat(kids || [])) if (k) e.kids.push(k);
  return e;
}
const all = (e, fn, out = []) => { if (fn(e)) out.push(e); for (const k of e.kids || []) all(k, fn, out); return out; };
function pageWith(replies) {
  const kinds = {}, look = el('div'), links = [], calls = [], bodies = [];
  const box = {
    window: null, document: { querySelector: s => (s === '[data-task-look]' ? look : null) },
    TASK: { kind: (n, s) => { kinds[n] = s; return s; }, close: () => Promise.resolve(null) },
    h: el, tx: (k, o) => k + (o ? JSON.stringify(o) : ''), toast: () => {}, S: { mod: '' },
    as2Link: l => { links.push(l); return true; },
    api: (u, b) => { calls.push(u); bodies.push(b); const k = Object.keys(replies).find(x => u.indexOf(x) === 0); return k ? Promise.resolve(JSON.parse(JSON.stringify(replies[k]))) : Promise.reject(new Error('no reply ' + u)); },
    Promise, JSON, Date, String, Number, Object, encodeURIComponent,
  };
  box.window = box; vm.createContext(box);
  vm.runInContext(C.script, box, { filename: 'x-log.client' });
  return { kinds, look, links, calls, bodies, box };
}

(async () => {
  // ---- static: the page code rules, every string the page asks for exists
  ok(!/=>|`|\$\{|innerHTML/.test(C.script), 'page script is ES5 with no backtick, dollar brace or innerHTML');
  ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(C.script + C.css), 'page code has no fixed colour');
  const keys = new Set(LANG.map(r => r[0])), used = [...new Set((C.script.match(/'task\.x-log\.[a-z0-9.]+'/g) || []).map(s => s.slice(1, -1)))];
  const lv = ['stop', 'crash', 'warn', 'note'].map(x => 'task.x-log.k.lv.' + x);
  ok(used.length > 10 && used.concat(lv).every(k => keys.has(k) || /\.$/.test(k)), 'every string the page uses is in the lang rows', used.concat(lv).filter(k => !keys.has(k) && !/\.$/.test(k)).join(','));
  ok(C.kinds.every(k => /^xl-/.test(k)), 'own kinds carry the xl- prefix');

  // ---- the kinds in a small page
  const replies = {
    '/api/x/logs/find': { newest: { inst: 1, mtimeMs: 1 }, instances: [{ inst: 0, files: [] }, { inst: 1, files: [{ name: 'game.log', mtimeMs: 5 }], dumps: [{}] }] },
    '/api/x/logs/explain': { results: [{ header: ['v3.301'], tests: ['Spawn it'], notes: [], cards: [
      { code: 'LOG_WARN', level: 'warn', title: 'A warning', what: 'w', fix: ['look'], msg: 'Using bump', where: '/entity/-vehicle/btr/x/x.def/x_d.mdl', file: 'game.prev.log', line: 363 },
      { code: 'LOG_SCRIPT_ERROR', level: 'stop', title: 'Stopped', what: 'w', fix: ['open it', 'fix it'], msg: 'Block terminator expected!', where: '', file: 'C:/l/game.log', line: 309, row: 'LOG-06' },
      { code: 'LOG_CRASH', level: 'stop', title: 'Crash', what: 'w', fix: ['see'], msg: 'ACCESS', where: '', file: 'x.mdmp.log', line: 3 }] }] },
    '/api/x/ide/log': { file: 'D:/x/log/game.log', findings: [{ code: 'LOG_SCRIPT_ERROR', msg: 'other words', logLine: 309, link: 'key:resource/set/a.set:12' }] },
  };
  const P = pageWith(replies);
  ok(['xl-run', 'xl-errors', 'xl-todo'].every(k => P.kinds[k]), 'the three kinds are added');
  const draft = { id: 'x-log-1', answers: {} };
  const st = { draft, answer: null };
  let host = el('div');
  P.kinds['xl-run'].draw({ id: 'run' }, st, host); await tick(); await tick();
  const radios = all(host, e => e.attrs['data-xl-inst'] != null);
  ok(radios.length === 1 && radios[0].attrs['data-xl-inst'] === '1' && st.pick === 1, 'only log folders with files are listed, the newest picked', JSON.stringify(radios.map(r => r.attrs)));
  const v = P.kinds['xl-run'].value({ id: 'run' }, st);
  ok(v.ok && v.answer.src === 'value' && v.answer.inst === 1, 'the run answer keeps the folder', JSON.stringify(v));
  draft.answers.run = v.answer;
  const st2 = { draft }; host = el('div');
  P.kinds['xl-errors'].draw({ id: 'errors' }, st2, host); for (let i = 0; i < 4; i++) await tick();
  const cards = all(host, e => e.attrs['data-xl-code'] != null);
  ok(cards.length === 3 && cards[0].attrs['data-xl-code'] !== 'LOG_WARN', 'three cards, the ones that stopped the game first', cards.map(c => c.attrs['data-xl-code']).join(','));
  const edits = all(host, e => e.attrs['data-xl-edit'] != null).map(e => e.attrs['data-xl-edit']);
  ok(edits.includes('key:resource/set/a.set:12'), 'an error gets the Editor link of the ide log (same code and log line)', edits.join(' | '));
  ok(edits.includes('key:resource/entity/-vehicle/btr/x/x.def'), 'an error with a game place gets a key link cut at the first file', edits.join(' | '));
  ok(edits.length === 2, 'an engine place (Actor::...) gets no link', edits.join(' | '));
  ok(all(host, e => e.attrs['data-xl-log'] === '309').length === 1 && all(host, e => e.attrs['data-xl-log'] === '3').length === 0, 'a game.log line can be shown in the log; a crash report line cannot');
  ok(P.kinds['xl-errors'].value({}, st2).answer.value === 3, 'the errors answer counts the cards');
  const ed = all(host, e => e.attrs['data-xl-edit'] === 'key:resource/set/a.set:12')[0];
  ed.ev.click(); await tick(); await tick();
  ok(P.links[0] === 'key:resource/set/a.set:12', 'Open in the Editor closes the task and opens the link', P.links.join(','));
  const before = P.calls.filter(u => u.indexOf('/api/x/logs/explain') === 0).length;
  const st3 = { draft }; host = el('div');
  P.kinds['xl-todo'].draw({ id: 'todo' }, st3, host); for (let i = 0; i < 4; i++) await tick();
  ok(P.calls.filter(u => u.indexOf('/api/x/logs/explain') === 0).length === before, 'the log is read once for both screens');
  ok(all(host, e => e.attrs['data-xl-lim'] === 'LOG-06').length === 1 && st3.n === 4, 'the fix steps and the limits row are listed', st3.n);
  ok(/Spawn it/.test(P.look.textContent), 'the tests go to the look pane', P.look.textContent);
  ok(P.calls.every(u => u.indexOf('gid=') < 0) && P.bodies.every(b => !b || b.gid === undefined), 'an AS64 task asks the routes as before (no gid)', P.calls.join(' '));

  // ---- the draft's game goes to the routes: Gates of Hell (its own user folder, GHVFS-13) and MoW:AS2 send gid in the query and body
  for (const g of ['goh', 'mowas2']) {
    const PG = pageWith(replies), dg = { id: 'x-log-' + g, game: g, answers: {} };
    let hg = el('div'); PG.kinds['xl-run'].draw({ id: 'run' }, { draft: dg }, hg); await tick(); await tick();
    ok(PG.calls[0] === '/api/x/logs/find?gid=' + g, g + ': logs/find carries gid', PG.calls.join(' '));
    dg.answers.run = { src: 'value', inst: 1 };
    hg = el('div'); PG.kinds['xl-errors'].draw({ id: 'errors' }, { draft: dg }, hg); for (let i = 0; i < 4; i++) await tick();
    const ei = PG.calls.findIndex(u => u.indexOf('/api/x/logs/explain') === 0);
    ok(PG.calls[ei] === '/api/x/logs/explain?gid=' + g && PG.bodies[ei].gid === g && PG.bodies[ei].inst === 1, g + ': logs/explain carries gid in the query and body', JSON.stringify([PG.calls, PG.bodies]));
    ok(PG.calls.some(u => u === '/api/x/ide/log?mod=&gid=' + g), g + ': ide/log carries gid', PG.calls.join(' '));
  }
  // no draft game: the page's own game (S.gameId)
  { const PS = pageWith(replies); PS.box.S.gameId = 'goh'; const hs = el('div'); PS.kinds['xl-run'].draw({ id: 'run' }, { draft: { id: 'd', answers: {} } }, hs); await tick();
    ok(PS.calls[0] === '/api/x/logs/find?gid=goh', 'no draft game: the page game is sent', PS.calls.join(' ')); }

  // ---- the routes the page reads, on this PC (read only)
  try {
    const L = require('../../logs/routes'), ctx = kit.ctxFor(scratch, { gameDir: kit.findGame({}) });
    const fd = await L.routes['GET /api/x/logs/find'](new URL('http://127.0.0.1/api/x/logs/find'), null, ctx);
    if (!fd.newest) console.log('note: SKIP the real log: no game.log on this PC');
    else {
      ok(Array.isArray(fd.instances) && fd.instances.every(i => Number.isInteger(i.inst) && Array.isArray(i.files)), 'logs/find gives instances with files');
      const ex = await L.routes['POST /api/x/logs/explain'](new URL('http://127.0.0.1/api/x/logs/explain'), { inst: fd.newest.inst }, ctx);
      const cs = [].concat(...ex.results.map(r => r.cards || []));
      ok(Array.isArray(ex.results) && cs.every(c => c.code && c.level && c.title && Array.isArray(c.fix) && 'msg' in c && 'where' in c && 'file' in c && 'line' in c), 'logs/explain cards have the fields the page reads (' + cs.length + ' cards)', JSON.stringify(cs[0]));
    }
  } catch (e) { ok(false, 'the log routes read', e.stack); }

  console.log('own checks: ' + p + ' passed, ' + f + ' failed');
  await kit.run(R, LANG, { validate: { kinds: C.kinds }, verb: 'explore', answers: {} }, scratch);
  if (f) { console.log('FAIL'); process.exitCode = 1; }
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); console.log('FAIL'); process.exitCode = 1; });
