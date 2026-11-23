// recipe "look at a mod" test: node x-mod.test.js <scratch>. The page kinds run in a small fake page with fixture replies (the mod
// list, the file tree and which copy wins, the value compare, clashes, the size, a search, the next tasks); files/tree is read for a
// real mod of the game when one is there (read only; else a SKIP note); then the test kit (validation, census coverage with its
// seeded defect, 4 languages, explore steps). PASS is the last line.
// Author: Imperator_Aug (ARSENAL, ia-7cbc9f1a)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const kit = require('../lib/testkit');
const R = require('./x-mod.recipe'), C = require('./x-mod.client'), LANG = require('./x-mod.lang');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-x-mod-')));
fs.mkdirSync(scratch, { recursive: true });
let p = 0, f = 0;
const ok = (c, m, x) => { if (c) p++; else { f++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 800) : '')); } };
const tick = async (n) => { for (let i = 0; i < (n || 4); i++) await new Promise(r => setImmediate(r)); };

function el(tag, attrs, kids) {
  const e = { tag: String(tag).toUpperCase(), tagName: String(tag).toUpperCase(), attrs: {}, kids: [], ev: {}, _t: '', checked: false, value: '', disabled: false };
  e.appendChild = k => { e.kids.push(k); return k; };
  e.addEventListener = (n, fn) => { e.ev[n] = fn; };
  Object.defineProperty(e, 'textContent', { get: () => e._t + e.kids.map(k => k.textContent).join(' '), set: v => { e._t = String(v); e.kids = []; } });
  for (const [k, v] of Object.entries(attrs || {})) { if (k === 'text') e._t = String(v); else if (k === 'onclick') e.ev.click = v; else if (v != null) e.attrs[k] = String(v); }
  for (const k of [].concat(kids || [])) if (k) e.kids.push(k);
  return e;
}
const all = (e, fn, out = []) => { if (fn(e)) out.push(e); for (const k of e.kids || []) all(k, fn, out); return out; };
function pageWith(replies, extra) {
  const kinds = {}, look = el('div'), links = [], calls = [], opened = [];
  const box = Object.assign({
    document: { querySelector: s => (s === '[data-task-look]' ? look : null) },
    TASK: { kind: (n, s) => { kinds[n] = s; return s; }, close: () => Promise.resolve(null), open: (r, v) => { opened.push(r + ':' + v); return Promise.resolve(null); } },
    h: el, tx: (k, o) => k + (o ? JSON.stringify(o) : ''), toast: () => {}, S: { mod: '' }, RMT: false,
    as2Link: l => { links.push(l); return true; }, curFolder: () => 'G:/game', join: (a, b) => a + '/' + b, setMod: m => { box.S.mod = m; },
    api: (u, b) => { calls.push([u, b]); const k = Object.keys(replies).find(x => u.indexOf(x) === 0); return k ? Promise.resolve(JSON.parse(JSON.stringify(replies[k]))) : Promise.reject(new Error('no reply ' + u)); },
    Promise, JSON, Date, String, Number, Object, encodeURIComponent,
  }, extra || {});
  box.window = box; vm.createContext(box);
  vm.runInContext(C.script, box, { filename: 'x-mod.client' });
  return { kinds, look, links, calls, opened, box };
}

(async () => {
  ok(!/=>|`|\$\{|innerHTML/.test(C.script), 'page script is ES5 with no backtick, dollar brace or innerHTML');
  ok(!/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/.test(C.script + C.css), 'page code has no fixed colour');
  const keys = new Set(LANG.map(r => r[0])), used = [...new Set((C.script.match(/'task\.x-mod\.[a-z0-9.]+'/g) || []).map(s => s.slice(1, -1)))];
  const fam = ['override', 'loses', 'new', 'pak', 'inpak', 'unmounted', 'modinfo'].map(s => 'task.x-mod.k.st.' + s)
    .concat(['files', 'changed', 'added', 'removed', 'fullShadow', 'identical', 'opaque', 'deleted'].map(s => 'task.x-mod.k.d.' + s))
    .concat(['pic', 'snd', 'mdl', 'map', 'txt', 'pak', 'dat', 'other'].map(s => 'task.x-mod.k.ty.' + s));
  const want = used.filter(k => !/\.$/.test(k)).concat(fam);
  ok(want.length > 40 && want.every(k => keys.has(k)), 'every string the page uses is in the lang rows', want.filter(k => !keys.has(k)).join(','));
  ok(C.kinds.every(k => /^xm-/.test(k)), 'own kinds carry the xm- prefix');

  const replies = {
    '/api/mods': { mods: [{ folder: 'mods', path: 'G:/game/mods' }, { folder: 'alpha', path: 'G:/game/mods/alpha', name: 'Alpha mod' }, { folder: 'beta', path: 'G:/game/mods/beta', name: 'Beta' }] },
    '/api/x/files/tree': { files: [{ rel: 'mod.info', size: 40, state: 'modinfo', key: null }, { rel: 'resource/set/a.set', size: 300, state: 'override', key: 'resource/set/a.set' },
      { rel: 'resource/sound/x.wav', size: 5000, state: 'new', key: 'resource/sound/x.wav' }, { rel: 'resource/texture/t.dds', size: 90000, state: 'new', key: 'resource/texture/t.dds' }] },
    '/api/x/files/which': { chain: [{ layer: 'game', entry: 'resource/set/a.set' }, { layer: 'alpha', entry: 'resource/set/a.set', winner: true }] },
    '/api/x/pro/overdiff': { summary: { files: 1, changed: 3, added: 1 }, items: [{ code: 'OVR_KEY_CHANGED', file: 'resource/set/a.set', msg: 'cost 10 -> 20' }] },
    '/api/installed': { mods: [{ name: 'alpha', hasInfo: true }, { name: 'beta', hasInfo: true }, { name: 'gamma', hasInfo: false }] },
    '/api/x/pro/conflicts': { summary: { keys: 2, modMod: 1, fileShadow: 0 }, perMod: { beta: { wins: 0, loses: 1 }, alpha: { wins: 1, loses: 0 } }, rows: [{ file: 'set/a.set', key: 'cost', winner: 'alpha', values: [{ src: 'beta', val: '5' }, { src: 'alpha', val: '20' }] }], files: [] },
    '/api/mod': { files: 4, bytes: 95340 },
    '/api/x/files/search': { hits: [{ rel: 'resource/set/a.set', line: 3, text: 'cost 20' }] },
    '/api/x/task/catalogue': { recipes: [{ id: 'fixmod', verbs: ['change'], built: true }, { id: 'release', verbs: ['make'], built: false }] },
  };
  const P = pageWith(replies);
  ok(C.kinds.every(k => P.kinds[k]), 'the seven kinds are added');
  const draft = { id: 'x-mod-1', answers: {}, mod: '' };
  // pick
  let st = { draft }, host = el('div');
  P.kinds['xm-pick'].draw({ id: 'pick' }, st, host); await tick();
  const rs = all(host, e => e.attrs['data-xm-mod'] != null);
  ok(rs.length === 2 && rs.map(r => r.attrs['data-xm-mod']).join() === 'alpha,beta', 'the mods of the mods folder are listed, not the folder itself', rs.map(r => r.attrs['data-xm-mod']).join());
  ok(P.kinds['xm-pick'].value({}, st).ok === false, 'Next without a mod asks for one');
  rs[0].ev.change();
  const pv = P.kinds['xm-pick'].value({}, st);
  ok(pv.ok && pv.answer.path === 'G:/game/mods/alpha' && pv.answer.value === 'Alpha mod' && draft.mod === 'G:/game/mods/alpha', 'the answer keeps the path; the draft names the mod', JSON.stringify(pv));
  ok(P.box.S.mod === '', 'picking a mod to look at does not switch the picked mod');
  draft.answers.pick = pv.answer;
  // changes
  st = { draft }; host = el('div');
  P.kinds['xm-changes'].draw({ id: 'changes' }, st, host); await tick();
  const states = all(host, e => e.attrs['data-xm-state'] != null).map(e => e.attrs['data-xm-state']);
  ok(states[0] === 'override' && states.includes('new') && states.includes('modinfo'), 'files are grouped, game files replaced first', states.join(','));
  all(host, e => e.attrs['data-xm-rel'] === 'resource/set/a.set')[0].ev.click(); await tick();
  ok(/wins/.test(P.look.textContent) && /alpha/.test(P.look.textContent), 'a click shows which copy wins in the look pane', P.look.textContent);
  all(host, e => e.attrs['data-xm-overdiff'])[0].ev.click(); await tick();
  ok(all(host, e => e.attrs['data-xm-sum'] === 'changed').length === 1 && /diffV/.test(P.kinds['xm-changes'].value({}, st).answer.value), 'the value compare runs on the button and says what changed');
  // clash
  st = { draft }; host = el('div');
  P.kinds['xm-clash'].draw({ id: 'clash' }, st, host); await tick();
  const others = all(host, e => e.attrs['data-xm-other'] != null);
  ok(others.length === 1 && others[0].attrs['data-xm-other'] === 'beta' && !others[0].checked, 'other mods with a mod.info are offered, none ticked', others.map(o => o.attrs['data-xm-other']).join());
  all(host, e => e.attrs['data-xm-clashgo'])[0].ev.click(); await tick();
  ok(!P.calls.some(c => c[0] === '/api/x/pro/conflicts'), 'no compare until a mod is ticked');
  others[0].checked = true; others[0].ev.change();
  all(host, e => e.attrs['data-xm-clashgo'])[0].ev.click(); await tick();
  const cc = P.calls.find(c => c[0] === '/api/x/pro/conflicts');
  ok(cc && JSON.stringify(cc[1].mods) === '["beta","alpha"]', 'clashes run with this mod last', cc && JSON.stringify(cc[1]));
  ok(all(host, e => e.attrs['data-xm-row'] === 'cost').length === 1, 'a clashing value is shown with who wins');
  const out = pageWith(replies); const d2 = { id: 'x', answers: { pick: { src: 'value', value: 'far', path: 'D:/elsewhere/far' } } }; host = el('div');
  out.kinds['xm-clash'].draw({}, { draft: d2 }, host); await tick();
  ok(all(host, e => e.attrs['data-xm-outside']).length === 1 && !out.calls.some(c => c[0] === '/api/installed'), 'a mod outside the mods folder is refused for clashes');
  // check
  let ran = null;
  const PC = pageWith(replies, { streamRun: (cmd, inp) => { ran = [cmd, inp]; return Promise.resolve({ code: 0, result: { ok: 1 } }); }, chkIn: o => o, viewCheck: (r, e) => { e.appendChild(el('div', { 'data-view': '1', text: 'shown' })); } });
  st = { draft }; host = el('div');
  PC.kinds['xm-check'].draw({}, st, host); all(host, e => e.attrs['data-xm-check'])[0].ev.click(); await tick();
  ok(ran && ran[0] === 'check' && ran[1].mod === 'G:/game/mods/alpha' && all(host, e => e.attrs['data-view']).length === 1, 'the checker runs on the mod and its result is shown', JSON.stringify(ran));
  // size
  st = { draft }; host = el('div');
  P.kinds['xm-size'].draw({}, st, host); await tick();
  const types = all(host, e => e.attrs['data-xm-type'] != null).map(e => e.attrs['data-xm-type']);
  ok(types[0] === 'pic' && types.includes('snd') && /kb/.test(P.kinds['xm-size'].value({}, st).answer.value), 'sizes add up by kind, biggest kind first', types.join(','));
  ok(/t\.dds/.test(P.look.textContent), 'the biggest files go to the look pane');
  // search
  st = { draft }; host = el('div');
  P.kinds['xm-search'].draw({}, st, host);
  const qi = all(host, e => e.attrs['data-xm-q'])[0]; qi.value = 'cost'; all(host, e => e.attrs['data-xm-find'])[0].ev.click(); await tick();
  ok(/a\.set:3/.test(host.textContent) && all(host, e => e.attrs['data-xm-open'] != null).length === 0 && P.kinds['xm-search'].value({}, st).answer.value === 'cost', 'a search lists the lines; files open only for the picked mod', host.textContent.slice(0, 200));
  // next
  st = { draft }; host = el('div');
  P.kinds['xm-next'].draw({}, st, host); await tick();
  const fx = all(host, e => e.attrs['data-xm-go'] === 'fixmod')[0], rl = all(host, e => e.attrs['data-xm-go'] === 'release')[0];
  ok(fx && !fx.disabled && rl && rl.disabled, 'fixmod is offered, a release not built yet is greyed out');
  fx.ev.click(); await tick();
  ok(P.opened[0] === 'fixmod:change' && P.box.S.mod === 'G:/game/mods/alpha', 'fix my mod picks the mod and opens the fixmod task', P.opened.join(','));

  ok(P.calls.every(c => c[0].indexOf('gid=') < 0 && !(c[1] && c[1].gid)), 'an AS64 task asks every route as before (no gid)', JSON.stringify(P.calls.map(c => c[0])));
  // the draft's game goes to every route (gid in the query, and in the body of a POST): MoW:AS2 and Gates of Hell read their own view
  for (const g of ['goh', 'mowas2']) {
    const PG = pageWith(replies), dg = { id: 'x-mod-' + g, game: g, mod: 'G:/game/mods/alpha', answers: { pick: { src: 'value', value: 'alpha', path: 'G:/game/mods/alpha' } } };
    let hg = el('div'); PG.kinds['xm-pick'].draw({}, { draft: dg }, hg); await tick();
    hg = el('div'); PG.kinds['xm-changes'].draw({}, { draft: dg }, hg); await tick();
    all(hg, e => e.attrs['data-xm-rel'] === 'resource/set/a.set')[0].ev.click(); all(hg, e => e.attrs['data-xm-overdiff'])[0].ev.click(); await tick();
    hg = el('div'); PG.kinds['xm-clash'].draw({}, { draft: dg }, hg); await tick();
    const ot = all(hg, e => e.attrs['data-xm-other'] != null)[0]; ot.checked = true; ot.ev.change(); all(hg, e => e.attrs['data-xm-clashgo'])[0].ev.click(); await tick();
    hg = el('div'); PG.kinds['xm-size'].draw({}, { draft: dg }, hg); await tick();
    hg = el('div'); PG.kinds['xm-search'].draw({}, { draft: dg }, hg); all(hg, e => e.attrs['data-xm-q'])[0].value = 'cost'; all(hg, e => e.attrs['data-xm-find'])[0].ev.click(); await tick();
    const us = PG.calls.map(c => c[0]), bad = PG.calls.filter(c => !/[?&]gid=/.test(c[0]) || (c[1] && c[1].gid !== g)).map(c => c[0]);
    ok(['/api/mods', '/api/x/files/tree', '/api/x/files/which', '/api/x/pro/overdiff', '/api/installed', '/api/x/pro/conflicts', '/api/mod?', '/api/x/files/search'].every(u => us.some(x => x.indexOf(u) === 0)) && !bad.length,
      g + ': every route gets gid=' + g, JSON.stringify(bad) + ' ' + us.join(' '));
    ok(PG.calls.filter(c => c[0].indexOf('/api/x/files/tree') === 0).length === 1, g + ': the tree is read once for the changes and size screens');
  }
  { // one page, the same mod under two games: the tree cache keeps them apart
    const PT = pageWith(replies), m = 'G:/game/mods/alpha', mk = gm => ({ id: 'x' + gm, game: gm, mod: m, answers: { pick: { src: 'value', value: 'alpha', path: m } } });
    PT.kinds['xm-size'].draw({}, { draft: mk('as64') }, el('div')); await tick();
    PT.kinds['xm-size'].draw({}, { draft: mk('mowas2') }, el('div')); await tick();
    ok(PT.calls.filter(c => c[0].indexOf('/api/x/files/tree') === 0).map(c => c[0]).join() === '/api/x/files/tree?mod=G%3A%2Fgame%2Fmods%2Falpha,/api/x/files/tree?mod=G%3A%2Fgame%2Fmods%2Falpha&gid=mowas2', 'the tree cache key holds the game', JSON.stringify(PT.calls.map(c => c[0])));
  }

  // a real mod of the game: files/tree gives the fields the page reads (read only)
  try {
    const game = kit.findGame({}), mods = game ? path.join(game, 'mods') : '';
    const one = mods && fs.existsSync(mods) ? fs.readdirSync(mods).find(n => fs.existsSync(path.join(mods, n, 'mod.info')) && !fs.existsSync(path.join(mods, n, 'mod.pak'))) : null;
    if (!one) console.log('note: SKIP the real mod: no game mods folder');
    else {
      const F = require('../../files'), ctx = kit.ctxFor(scratch, { gameDir: game });
      const tr = await F.routes['GET /api/x/files/tree'](new URL('http://127.0.0.1/?mod=' + encodeURIComponent(path.join(mods, one))), null, ctx);
      ok(Array.isArray(tr.files) && tr.files.length && tr.files.every(x => typeof x.rel === 'string' && typeof x.state === 'string' && 'size' in x && 'key' in x), 'files/tree of ' + one + ' has rel, state, size and key', JSON.stringify(tr.files && tr.files[0]));
    }
  } catch (e) { ok(false, 'files/tree reads a real mod', e.stack); }

  console.log('own checks: ' + p + ' passed, ' + f + ' failed');
  await kit.run(R, LANG, { validate: { kinds: C.kinds }, verb: 'explore', answers: {} }, scratch);
  if (f) { console.log('FAIL'); process.exitCode = 1; }
})().catch(e => { console.log('FAIL crash ' + (e.stack || e)); console.log('FAIL'); process.exitCode = 1; });
