// ide ext routes test. Arg: scratch dir. Fixture game + mod + profile + game.log made here (no real game, no network, nothing launched:
// spawn and the Notepad++ module are stubbed). Cases whose sibling part (intel check/nav, cm, npp) is not built yet print SKIPPED.
// Env IDE_BIG, IDE_BIG_BUDGET: the 30,000-file explorer cases (makeEmpty below): skipped with the measured rate on a disk too slow for them.
// Author: Imperator_Aug (ARSENAL, ia-f51fcaf0)
const fs = require('fs'), path = require('path');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'idex-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const skipped = [];
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const skip = (m, why) => { skipped.push(m); console.log('SKIPPED ' + m + ' (' + why + ')'); };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const TOOLS = path.join(__dirname, '..', '..', '..');
const WT = require('../../../lib/test/wait');
// the page build: 400 turns as before, then on by time. Backup, never a hang: after 60 s WAIT on stderr, the checks after it report
const built = async bx => { const t0 = Date.now(); for (let i = 0; !bx.__as2gui; i++) { if (i >= 400 && Date.now() - t0 >= WT.COND_MS) { WT.say('ide test', 'the page build', WT.COND_MS); break; } await new Promise(r => (i < 400 ? setImmediate(r) : setTimeout(r, 5))); } };
const has = rel => fs.existsSync(path.join(TOOLS, rel));
// makeEmpty(dir, n, nm) -> { ok, why, line }: n empty files dir/nm(1..n), written 64 at a time. The first 256 are a probe: on a disk
// where one create costs much (a busy or scanned drive: 0.5 s a file was seen) the projected time for n is over the budget and the
// rest is not written (ok false, why = the rate), so the run says why instead of hanging past the runner's timeout.
// Env: IDE_BIG=0 never writes them (skip), IDE_BIG=1 writes them whatever the rate, IDE_BIG_BUDGET = the budget in seconds (default 240).
async function makeEmpty(dir, n, nm) {
  const env = process.env.IDE_BIG, budget = Math.max(1, +process.env.IDE_BIG_BUDGET || 240) * 1000;
  if (env === '0') return { ok: false, why: 'IDE_BIG=0', line: 'not written (IDE_BIG=0)' };
  let i = 1;
  const run = async upto => { await Promise.all(Array.from({ length: 64 }, async () => { while (i <= upto) { const j = i++; await fs.promises.writeFile(path.join(dir, nm(j)), ''); } })); };
  const probe = Math.min(n, 256), t0 = Date.now();
  await run(probe);
  const per = (Date.now() - t0) / probe, est = Math.round(per * n / 1000);
  const rate = per.toFixed(1) + ' ms a file, ' + n + ' files about ' + est + ' s';
  if (env !== '1' && per * n > budget) return { ok: false, why: 'the disk is too slow: ' + rate + ', over the budget of ' + budget / 1000 + ' s; IDE_BIG=1 writes them anyway, or give a scratch dir on a faster disk', line: rate + ' (not written)' };
  await run(n);
  return { ok: true, line: rate + ', written in ' + Math.round((Date.now() - t0) / 1000) + ' s' };
}

// ---- fixture
const game = path.join(work, 'game'), goh = path.join(work, 'goh'), home = path.join(work, 'home');
process.env.GOH_GAME = goh; process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = home;
wr(path.join(game, 'as64.exe'), 'MZ');
wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
wr(path.join(game, 'resource', 'entity', 'gun.def'), '{"weapon"\r\n  {damage 10}\r\n}\r\n');
wr(path.join(game, 'resource', 'entity', 'only.def'), '{only}\r\n');
wr(path.join(game, 'resource', 'entity', 'sub', 'a.def'), '{a}\r\n');
wr(path.join(game, 'resource', 'entity', 'sub', 'b.def'), '{b}\r\n');
wr(path.join(game, 'resource', 'set', 'x.set'), '{x 1}\r\n');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
wr(path.join(mod, 'resource', 'entity', 'gun.def'), '{"weapon"\r\n  {damage 30}\r\n}\r\n');
wr(path.join(mod, 'resource', 'entity', 'new.def'), '{brandnew}\r\n');
wr(path.join(mod, 'resource.pak'), require('../../../lib/zipwrite').zip([['set/p.set', Buffer.from('{p 1}\r\n'), false]]));
const udir = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2');
wr(path.join(udir, 'profiles', 'p1', 'options.set'), '{options {mods "mine:0"}}\r\n');
const logLines = ['Product: test', '[12:00:01] Unknown ability "boom" (/entity/gun.def, 2)', '[12:00:02] Unknown props "zz" (, 10)'];
for (let i = 0; i < 260; i++) logLines.push('filler ' + i);
wr(path.join(udir, 'log', 'game.log'), logLines.join('\r\n') + '\r\n');

const R = require('./routes');
const ctx = { tools: TOOLS, tmpRoot: path.join(work, 'tmp'), game: () => game, allowLaunch: false,
  runTool: async () => ({ code: 1, stdout: '', stderr: 'unused', timedOut: false }), session: { token: 't', port: 1 } };
const U = (p, q) => { const u = new URL('http://x' + p); for (const k of Object.keys(q || {})) u.searchParams.set(k, q[k]); return u; };
const get = (name, q, c) => R['GET /api/x/ide/' + name](U('/api/x/ide/' + name, q), null, c || ctx);
const post = (name, b, c) => R['POST /api/x/ide/' + name](U('/api/x/ide/' + name), b, c || ctx);
async function rejects(fn, status, re, m) {
  let e = null; try { await fn(); } catch (x) { e = x; }
  ok(e && e.status === status && (!re || re.test(e.message)) && !/\n\s+at /.test(e.message), m + (e ? ' [' + e.status + ' ' + e.message + ']' : ' [no error]'));
}

// ---------------------------------------------------------------- (kit) fake editor and page boot for tools/gui/ext/ide/test-kit.js
// fakeEd(o) -> a stand-in for window.IDE_ED (contract "IDE_ED", the (kit) lines included) that runs in node, records every call and
// keeps each doc as an array of lines. o = { rect:{left,top,right,bottom} (text area in client pixels, default 0,0,800,600),
// lineH (px, default 20), charW (px, default 8), posAt:function(x, y, ed) -> answer (replaces the built-in geometry) }.
//   F = { ready:true, PHRASES:[], made:[ed], create(host, opts) -> ed, compare(host, o) -> { close() }, theme(name), defer:fn }
//   F.defer(fn): how a `change` event is sent after an edit (default: at once; boot() makes it a page timer, as the real 150 ms throttle);
//   ed.flush() sends the changes still waiting at once (as the cm code)
//   ed: every contract call (addDoc, swap, dropDoc, current, text, setText, clean, isClean, marks, applyEdits, goto, cursor, wordAt,
//     focus, theme, fold, find, on, hoverProvider, hints, keys, tabFocus, flush, refresh, destroy, lineCount, line, rect, posAt,
//     autoScroll, gapMarker, fieldSession, inSession, bookmark, flash) plus test helpers:
//     ed.log = [{ fn, args }] (args deep-copied), ed.calls(fn) -> the args lists of that call, ed.doc(id?) -> { id, lines, kind, ro, cur }
//     ed.gap = { gap, state } | null (the gap marker shown), ed.sessions = [{ fields, caret, opts, ended:null|why, ends }],
//     ed.flashes = [[from, to]], ed.scrollTop (px), ed.focused (count), ed.keyMap (from keys())
//     ed.userEdit(edits): a typed change (same as applyEdits, not logged as applyEdits; ends a running field session with 'edit')
//     ed.undo(): back one applyEdits/userEdit step, ends a session with 'undo'; ed.undoDepth() -> steps kept
//     ed.endSession(why): ends the running session as the editor would ('esc', 'click', 'done', ...)
//     ed.emit(ev, data): fire an editor event ('cursor', 'focus', 'change', ...); ed.pointAt(line, 'upper'|'lower') -> { x, y }
//   Sessions end by themselves as the contract says: setText and addDoc of an open id 'reload', swap to another doc and dropDoc of the
//   shown doc 'swap', a new session 'lost'; onEnd(why) runs once. applyEdits follows the cm code (edits sorted bottom up, col 0 = a
//   whole line before `line`, after the last line an append) and is one undo step. Bookmarks move with lines inserted above them.
//   Not modelled here: the cm applyEdits returns false and leaves the text as it was when a filter cancels one of its changes
//   (test-kit.js covers that path with its own override).
function fakeEd(o) {
  o = o || {};
  const F = { ready: true, PHRASES: [], made: [], defer: fn => fn() };
  const R0 = Object.assign({ left: 0, top: 0, right: 800, bottom: 600 }, o.rect || {}), LH = o.lineH || 20, CW = o.charW || 8;
  const copy = v => { try { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); } catch { return String(v); } };
  F.create = function (host, opts) {
    const docs = {}, ev = {}, ed = { log: [], sessions: [], flashes: [], gap: null, scrollTop: 0, focused: 0, keyMap: {}, opts: copy(opts) };
    let cur = null, sess = null, marks = [];
    const L = (fn, args) => ed.log.push({ fn, args: Array.prototype.slice.call(args).map(a => typeof a === 'function' ? '[fn]' : copy(a)) });
    const emit = (name, data) => { for (const fn of (ev[name] || []).slice()) fn(data); };
    const sessEnd = why => { const s = sess; if (!s) return; sess = null; s.ended = why; s.ends++; if (s.opts && typeof s.opts.onEnd === 'function') s.opts.onEnd(why); };
    const split = t => String(t == null ? '' : t).split(/\r\n|\r|\n/);
    // one replace over a line array: [l1, c1] .. [l2, c2] (0-based, clipped) -> text
    const rep = (lines, l1, c1, l2, c2, t) => {
      c1 = Math.min(c1, lines[l1].length); c2 = Math.min(c2, lines[l2].length);
      const parts = (lines[l1].slice(0, c1) + t + lines[l2].slice(c2)).split('\n');
      lines.splice(l1, l2 - l1 + 1, ...parts);
      return { at: l1 + 1, added: parts.length - 1 - (l2 - l1) };
    };
    const apply = (d, edits) => {
      const list = edits.slice().sort((p, q) => (q.line - p.line) || ((q.col || 0) - (p.col || 0)));
      let from = Infinity;
      const moved = r => { if (r.at < from) from = r.at; for (const b of d.bms) if (b.line && (b.line > r.at || (b.line === r.at && r.whole))) b.line = Math.max(1, b.line + r.added); };
      for (const e of list) {
        const t = e.text == null ? '' : String(e.text), last = d.lines.length - 1;
        if (e.col === 0) {
          const at = e.line - 1, nl = /\n$/.test(t) ? t : t + '\n';
          let r;
          if (at > last && d.lines[last] !== '') r = rep(d.lines, last, d.lines[last].length, last, d.lines[last].length, '\n' + t.replace(/\n$/, ''));
          else if (at > last) r = rep(d.lines, last, 0, last, 0, nl);
          else { r = rep(d.lines, Math.max(0, at), 0, Math.max(0, at), 0, nl); r.whole = true; }
          moved(r); continue;
        }
        const ln = Math.max(0, Math.min(e.line - 1, last)), a = Math.max(0, e.col - 1), b = Math.max(a, (e.endCol == null ? e.col : e.endCol) - 1);
        moved(rep(d.lines, ln, a, ln, b, t));
        if (e.dropEol && /^\s*$/.test(d.lines[ln])) {
          if (ln < d.lines.length - 1) d.lines.splice(ln, 1);
          else if (ln > 0) d.lines.splice(ln, 1);
          else d.lines[0] = '';
        }
      }
      return from === Infinity ? 1 : from;
    };
    // a change waits for F.defer (the 150 ms throttle); ed.flush() sends the waiting ones at once, as the cm code does
    const waiting = [];
    const change = (d, from) => { const x = { id: d.id, from }; waiting.push(x); F.defer(() => { const i = waiting.indexOf(x); if (i >= 0) { waiting.splice(i, 1); emit('change', x); } }); };
    const edit = (edits, user) => {
      const d = cur;
      if (!d || !Array.isArray(edits) || !edits.length) return false;
      d.undo.push(d.lines.slice());
      const from = apply(d, edits);
      if (user && sess) sessEnd('edit');
      change(d, from);
      return true;
    };
    Object.assign(ed, {
      addDoc(id, text, kind, ro) { L('addDoc', arguments); const old = docs[id]; if (old && sess) sessEnd('reload');
        docs[id] = { id, lines: split(text), kind, ro: !!ro, clean: split(text).join('\n'), undo: [], cur: { line: 1, col: 1 }, bms: [] };
        if (old && cur === old) cur = docs[id]; return true; },
      swap(id) { L('swap', arguments); const d = docs[id]; if (!d) return false; if (cur !== d) { if (sess) sessEnd('swap'); ed.gap = null; cur = d; } return true; },
      dropDoc(id) { L('dropDoc', arguments); const d = docs[id]; if (!d) return false; if (cur === d) { if (sess) sessEnd('swap'); ed.gap = null; cur = null; } delete docs[id]; return true; },
      current() { return cur ? cur.id : null; },
      text(id) { const d = id == null ? cur : docs[id]; return d ? d.lines.join('\n') : null; },
      setText(id, text) { L('setText', arguments); const d = docs[id]; if (!d) return false; if (sess && cur === d) sessEnd('reload'); d.lines = split(text); d.undo = []; d.clean = d.lines.join('\n'); return true; },
      clean(id) { const d = docs[id]; if (d) d.clean = d.lines.join('\n'); return !!d; },
      isClean(id) { const d = docs[id]; return d ? d.clean === d.lines.join('\n') : true; },
      marks(f) { L('marks', arguments); marks = Array.isArray(f) ? f : []; return marks.length; },
      applyEdits(edits) { L('applyEdits', arguments); return edit(edits, false); },
      goto(line, col) { L('goto', arguments); if (!cur) return false; const n = cur.lines.length, ln = Math.max(1, Math.min(line || 1, n));
        cur.cur = { line: ln, col: Math.max(1, Math.min(col || 1, cur.lines[ln - 1].length + 1)) }; emit('cursor', { id: cur.id, line: cur.cur.line, col: cur.cur.col }); return true; },
      cursor() { return cur ? { line: cur.cur.line, col: cur.cur.col } : { line: 1, col: 1 }; },
      wordAt(p) { if (!cur || !p) return null; const s = cur.lines[(p.line || 1) - 1]; if (s == null) return null; let a = (p.col || 1) - 1, z = a;
        while (a > 0 && /[\w.-]/.test(s[a - 1])) a--; while (z < s.length && /[\w.-]/.test(s[z])) z++; return z > a ? { word: s.slice(a, z), line: p.line, col: a + 1, len: z - a, quoted: false } : null; },
      focus() { ed.focused++; },
      theme(name) { L('theme', arguments); return name; },
      fold(w) { L('fold', arguments); }, find() { L('find', arguments); },
      on(name, fn) { (ev[name] || (ev[name] = [])).push(fn); return ed; },
      hoverProvider(fn) { ed.hover = fn; }, hints(fn) { ed.hintFn = fn; },
      keys(map) { for (const k of Object.keys(map || {})) { if (map[k] == null) delete ed.keyMap[k]; else ed.keyMap[k] = map[k]; } },
      tabFocus() { return false; }, flush() { for (const x of waiting.splice(0)) emit('change', x); }, refresh() {}, destroy() { if (sess) sessEnd('lost'); },
      // (kit) lines, geometry, gap marker, field session, bookmark, flash
      lineCount() { return cur ? cur.lines.length : 0; },
      line(n) { return cur && typeof n === 'number' && n === Math.floor(n) && n >= 1 && n <= cur.lines.length ? cur.lines[n - 1] : null; },
      rect() { return { left: R0.left, top: R0.top, right: R0.right, bottom: R0.bottom }; },
      posAt(x, y) {
        if (typeof o.posAt === 'function') return o.posAt(x, y, ed);
        if (!cur || typeof x !== 'number' || typeof y !== 'number' || x < R0.left || x >= R0.right || y < R0.top || y >= R0.bottom) return null;
        const n = cur.lines.length, py = y - R0.top + ed.scrollTop, row = Math.floor(py / LH);
        if (row >= n) return { line: n, col: cur.lines[n - 1].length + 1, gap: n + 1 };
        const col = Math.max(1, Math.min(Math.floor((x - R0.left) / CW) + 1, cur.lines[row].length + 1));
        return { line: row + 1, col, gap: py - row * LH < LH / 2 ? row + 1 : row + 2 };
      },
      autoScroll(dy) { L('autoScroll', arguments); dy = +dy || 0; const max = Math.max(0, (cur ? cur.lines.length : 0) * LH - (R0.bottom - R0.top));
        const to = Math.max(0, Math.min(max, ed.scrollTop + dy)); if (!dy || to === ed.scrollTop) return false; ed.scrollTop = to; return true; },
      gapMarker(gap, state) { L('gapMarker', arguments); if (gap == null || !cur) { ed.gap = null; return false; }
        ed.gap = { gap: Math.max(1, Math.min(Math.floor(+gap) || 1, cur.lines.length + 1)), state: state === 'no' ? 'no' : 'ok' }; return true; },
      fieldSession(fields, caret, so) {
        L('fieldSession', arguments);
        if (sess) sessEnd('lost');
        if (!cur || cur.ro) return null;
        const list = (fields || []).filter(f => f && f.k !== 'list');
        if (!list.length) { if (caret) cur.cur = { line: caret.line, col: caret.col }; return null; }
        const s = { fields: list, caret: caret || null, opts: so || {}, ended: null, ends: 0 };
        ed.sessions.push(s); sess = s;
        return { end(why) { if (sess === s) sessEnd(why || 'done'); } };
      },
      inSession() { return !!sess; },
      bookmark(line, col) { const d = cur, b = { line: d ? line : 0, col }; if (d) d.bms.push(b);
        return { pos() { return b.line ? { line: b.line, col: b.col } : null; }, clear() { b.line = 0; } }; },
      flash(a, z) { ed.flashes.push([a, z == null ? a : z]); return !!cur; },
      // (inc) include windows: a line widget (moves with lines inserted above, as a bookmark), the include gutter, a linked doc (one
      // buffer: lines, clean mark and undo shared with the source doc), the scroll place
      inline(line, node) { L('inline', [line]); if (!cur || !node) return null; const d = cur, b = { line: Math.max(1, Math.min(Math.floor(+line) || 1, d.lines.length)), col: 1, node, changes: 0 };
        d.bms.push(b); (d.widgets || (d.widgets = [])).push(b); if (host && host.appendChild) host.appendChild(node);
        return { doc: d.id, line() { return b.line || null; }, changed() { b.changes++; },
          clear() { b.line = 0; const i = d.widgets.indexOf(b); if (i >= 0) d.widgets.splice(i, 1); if (node.parentNode) node.parentNode.removeChild(node); } }; },
      incGutter(list, fn) { ed.gut = { doc: cur ? cur.id : null, list: copy(list), fn }; return !!cur; },
      linkDoc(id, src, kind, ro) { L('linkDoc', [id, src && src.id, kind, ro]); const s = src && src.ed && typeof src.ed.doc === 'function' ? src.ed.doc(src.id) : null; if (!s) return false;
        const d = { id, kind, ro: !!ro, cur: { line: 1, col: 1 }, bms: [], linked: s };
        for (const k of ['lines', 'clean', 'undo']) Object.defineProperty(d, k, { get: () => s[k], set: v => { s[k] = v; }, enumerable: true });
        docs[id] = d; return true; },
      view() { return { top: ed.scrollTop, left: 0 }; }, setView(v) { if (v && typeof v.top === 'number') ed.scrollTop = v.top; return !!v; },
      hasFocus() { return false; },
      // test helpers
      calls(fn) { return ed.log.filter(x => x.fn === fn).map(x => x.args); },
      doc(id) { return id == null ? cur : docs[id] || null; },
      userEdit(edits) { return edit(edits, true); },
      undo() { const d = cur; if (!d || !d.undo.length) return false; d.lines = d.undo.pop(); if (sess) sessEnd('undo'); change(d, 1); return true; },
      undoDepth() { return cur ? cur.undo.length : 0; },
      endSession(why) { sessEnd(why || 'esc'); },
      emit,
      pointAt(line, half) { return { x: R0.left + 40, y: R0.top - ed.scrollTop + (line - 1) * LH + (half === 'lower' ? LH * 0.75 : LH * 0.25) }; },
    });
    F.made.push(ed);
    return ed;
  };
  F.compare = () => ({ close() {} });
  F.theme = name => name;
  return F;
}

// boot(o) -> Promise<P>: the whole page (page.js with every ext) in the fake DOM, the fake editor as window.IDE_ED, a fake api, and (unless
// o.show === false) the Editor screen shown with a mod, editor made. o = {
//   remote:bool (LAN Remote phone view: window.AS2CFG.remote), mod:'C:/g/mods/mine', width:1200 (window.innerWidth),
//   ls:{ key: value } (page LS values before the boot, stored as as2gui.<key> JSON), ed: a fakeEd() or its options,
//   files:{ rel: text | { text, editable, why, key } } (answers files/open and files/tree), game:true (the kit route's game flag),
//   lint:function(body) -> answer (default: no findings), api:function(req) -> answer | undefined (default handling) | env.PENDING
//     (never answers) | an Error with .status (error answer); may return a Promise or throw. req = { url, path, q:{}, method, body } }
// Default answers: health, commands, settings, game (none set), GET /api/x/ide/kit (the real route over the real kit data), files/open,
// files/tree, ide/tree (the same files, one page), ide/lint; anything else never answers (as the other page cases here). o.mo: true gives the page a recording
// MutationObserver (P.mos: [{ cb, on:[{t, op}], off }]; nothing fires unless a case calls m.cb).
// P = { bx (the window), doc, sec (the Editor screen), IDE, St (page state), F (the IDE_ED fake), ed() (the made editor or null),
//   store (localStorage Map), ls(key) (parsed page LS value), timers, flush() (runs page timers and waits, 10 rounds), asked (every fetch,
//   as req), posts() (the non-GET ones: the page's own POST /api/settings and the shell's POST ide/lint are among them),
//   writes() (asks that would write: files save, copy, undo, restore, or any POST to the kit route), B(id) (block by id), kids(el), isB(el), open(rel, line?, col?) -> Promise<doc> (IDE.open + flush),
//   check() (blockcheck problems of the Editor screen) }
const PENDING = { pending: true };
async function boot(o) {
  o = o || {};
  const vm = require('vm'), G = path.join(__dirname, '..', '..'), fakedom = require(path.join(G, 'test', 'fakedom'));
  const doc = fakedom.make(), store = new Map(), timers = [], asked = [];
  let tid = 0;
  for (const k of Object.keys(o.ls || {})) store.set('as2gui.' + k, JSON.stringify(o.ls[k]));
  const F = o.ed && typeof o.ed.create === 'function' ? o.ed : fakeEd(o.ed || {});
  const answer = (st, j) => Promise.resolve({ ok: st < 400, status: st, json: () => Promise.resolve(JSON.parse(JSON.stringify(j))), body: null });
  const failA = e => answer((e && e.status) || 500, { error: String((e && e.message) || e) });
  const files = o.files || {}, M = o.mod || 'C:/g/mods/mine';
  const fileOf = rel => { const v = files[rel]; if (v == null) return null; const x = typeof v === 'string' ? { text: v } : v, t = String(x.text || '');
    return { text: t, eol: /\r\n/.test(t) ? 'crlf' : /\n/.test(t) ? 'lf' : 'none', bom: false, cpLines: 0, loneCr: false, lines: t.split('\n').length, size: t.length,
      hash: require('crypto').createHash('sha1').update(t).digest('hex'), editable: x.editable !== false, why: x.editable === false ? (x.why || 'layer') : null,
      rel, key: x.key !== undefined ? x.key : (/^resource\//i.test(rel) ? rel.toLowerCase() : null) }; };
  const kctx = Object.assign({}, ctx, { game: o.game === false ? () => null : ctx.game });
  const deflt = req => {
    const p = req.path, m = req.method;
    if (p === '/api/health') return { ok: true, allowLaunch: false, version: 'test' };
    if (p === '/api/commands') return { commands: require(path.join(G, 'contract')).describe() };
    if (p === '/api/settings') return m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true };
    if (p === '/api/game') return { dir: '', tried: [], ok: false, codes: ['none'] };
    if (p === '/api/x/ide/kit' && m === 'GET') return R['GET /api/x/ide/kit'](U(p, req.q), null, kctx);
    if (p === '/api/x/files/open') { const f = fileOf(req.q.rel); if (!f) throw Object.assign(new Error('No such file in your mod: ' + req.q.rel), { status: 404 }); return f; }
    if (p === '/api/x/files/tree') return { mod: req.q.mod || M, files: Object.keys(files).map(rel => ({ rel, size: String(fileOf(rel).text).length, state: 'new', key: fileOf(rel).key })), truncated: false, notes: [], game: null, undo: '' };
    if (p === '/api/x/ide/tree') { const fl = Object.keys(files).map(rel => ({ rel, size: String(fileOf(rel).text).length, state: 'new', key: fileOf(rel).key }));
      return { mod: req.q.mod || M, files: fl, total: fl.length, off: 0, next: null, ver: 't', done: true, unread: 0, truncated: false, notes: [], game: null, undo: '' }; }
    if (p === '/api/x/ide/lint' && m === 'POST') return typeof o.lint === 'function' ? o.lint(req.body) : { findings: [], fixes: [], multi: [], ms: 0 };
    return PENDING;
  };
  const bx = { document: doc, console, TextDecoder, confirm: () => true, atob: s => Buffer.from(s, 'base64').toString('latin1'), innerWidth: o.width || 1200,
    setTimeout: f => { const id = ++tid; timers.push({ id, f }); return id; }, clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); }, setInterval: () => 0, clearInterval: () => {},
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    IDE_ED: F,
    fetch: (u, init) => {
      const url = String(u), m = (init && init.method) || 'GET', uo = new URL('http://x' + url), q = {};
      for (const [k, v] of uo.searchParams) q[k] = v;
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch { body = init.body; }
      const req = { url, path: uo.pathname, q, method: m, body, jobId: String((init && init.headers && init.headers['x-arsenal-job']) || '') };   // jobId: the id the page gave the request for the job list
      asked.push(req);
      return (async () => {
        let r;
        try { r = o.api ? await o.api(req) : undefined; if (r === undefined) r = await deflt(req); } catch (e) { return failA(e); }
        if (r === PENDING) return new Promise(() => {});
        if (r instanceof Error) return failA(r);
        return answer(200, r);
      })();
    } };
  if (o.remote) bx.AS2CFG = { remote: true };
  // o.mo: a recording MutationObserver (the fake DOM has none). Nothing fires by itself: a case calls m.cb(records) for the ones it wants
  const mos = [];
  if (o.mo) bx.MutationObserver = function (cb) { const m = { cb, on: [], off: false, observe(t, op) { m.on.push({ t, op: op || {} }); }, disconnect() { m.off = true; m.on = []; }, takeRecords() { return []; } }; mos.push(m); return m; };
  F.defer = fn => bx.setTimeout(fn, 150);
  bx.window = bx; vm.createContext(bx);
  vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(require(path.join(G, 'page.js')))[1], bx);
  await built(bx);
  const flush = async () => { for (let i = 0; i < 10; i++) { timers.splice(0).forEach(t => { try { t.f(); } catch { /* page timers */ } }); await new Promise(r => setImmediate(r)); } };
  const St = bx.__as2gui;
  if (o.show !== false) { St.mod = M; bx.as2Link('page:ide'); await flush(); }
  const sec = doc.getElementById('main').children.find(s => s.dataset.id === 'ide');
  const isB = e => !!(e && e.dataset && e.dataset.blk != null), B = id => sec.all().find(e => isB(e) && e.dataset.blk === id);
  const kids = c => c.children.filter(isB).map(b => b.dataset.blk).join();
  return { bx, doc, sec, IDE: bx.IDE, St, F, ed: () => F.made[F.made.length - 1] || null, store, timers, flush, asked, isB, B, kids, mos,
    ls: k => { const v = store.get('as2gui.' + k); try { return v == null ? undefined : JSON.parse(v); } catch { return v; } },
    posts: () => asked.filter(a => a.method !== 'GET'),
    writes: () => asked.filter(a => /^\/api\/x\/files\/(save|copy|undo|restore)$/.test(a.path) || (a.method !== 'GET' && /^\/api\/x\/ide\/kit/.test(a.path))),
    open: async (rel, line, col) => { const d = await bx.IDE.open({ mod: M, rel }, line || 1, col || 1); await flush(); return d; },
    check: () => require(path.join(G, 'test', 'blockcheck')).checkScreen(sec, 'ide') };
}
// the env handed to test-kit.js (see the hook at the end): this file's counters and helpers, the routes over this fixture, the fakes
const kitEnv = () => ({ ok, skip, has, work, TOOLS, G: path.join(__dirname, '..', '..'), IDE_DIR: __dirname,
  scratch: name => { const d = path.join(work, 'kit-' + String(name).replace(/[^a-z0-9_-]/gi, '_')); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); return d; },
  R, ctx, get, post, rejects, U, fakedom: require(path.join(__dirname, '..', '..', 'test', 'fakedom')), vm: require('vm'),
  blockcheck: require(path.join(__dirname, '..', '..', 'test', 'blockcheck')), remote: require('../../remote'),
  kit: async (kind, lang, game) => JSON.parse(JSON.stringify(await get('kit', { kind, lang: lang || 'en' }, game === false ? Object.assign({}, ctx, { game: () => null }) : ctx))),
  fakeEd, boot, PENDING });

(async () => {
  // IDE_ONLY=inc|jump: only that page-case file (a quick run while working on it; the full run is this file without the variable)
  if (process.env.IDE_ONLY) {
    for (const p of String(process.env.IDE_ONLY).split(',')) await require('./test-' + p.replace(/[^a-z0-9-]/g, ''))(kitEnv());
    console.log(bad ? bad + ' of ' + n + ' failed' : 'ide ext ' + n + ' PASS');
    process.exit(bad ? 1 : 0);
  }
  // ---- routes table
  const keys = Object.keys(R);
  for (const k of ['GET /api/x/ide/asset', 'POST /api/x/ide/lint', 'POST /api/x/ide/hover', 'POST /api/x/ide/def', 'POST /api/x/ide/refs', 'POST /api/x/ide/symbols',
    'GET /api/x/ide/words', 'GET /api/x/ide/vdir', 'GET /api/x/ide/log', 'GET /api/x/ide/kit', 'POST /api/x/ide/extopen', 'GET /api/x/ide/npp', 'POST /api/x/ide/npp', 'POST /api/x/ide/inbox', 'GET /api/x/ide/inbox'])
    ok(typeof R[k] === 'function', 'route ' + k);
  ok(keys.every(k => /^(GET|POST) \/api\/x\/ide\//.test(k)), 'only route keys are enumerable');

  // ---- asset
  const cmjs = await get('asset', { f: 'cm.js' }), cmcss = await get('asset', { f: 'cm.css' });
  ok(cmjs.__raw.includes('CodeMirror') && /javascript/.test(cmjs.type), 'asset cm.js');
  ok(cmcss.__raw.length > 100 && /text\/css/.test(cmcss.type), 'asset cm.css');
  const idecss = await get('asset', { f: 'ide.css' });
  ok(typeof idecss.__raw === 'string' && /text\/css/.test(idecss.type), 'asset ide.css (missing parts tolerated)');
  if (has('gui/ext/ide/cm/index.js')) { const j = await get('asset', { f: 'ide.js' }); ok(j.__raw.length > 0 && /javascript/.test(j.type), 'asset ide.js'); }
  else skip('asset ide.js', 'cm part not built');
  await rejects(() => get('asset', { f: '../x.js' }), 404, null, 'asset unknown f -> 404');
  // (kit) the Code Pieces style rides in ide.css once ui/kit.js is there, after the other parts
  if (has('gui/ext/ide/ui/kit.js')) {
    const kcss = String(require('./ui/kit').css || '');
    ok(kcss && idecss.__raw.includes(kcss) && idecss.__raw.indexOf(kcss) >= idecss.__raw.indexOf(String(require('./ui/panels').css || '')), 'asset ide.css carries the kit css (after panels)');
  } else skip('asset ide.css with the kit css', 'kit page part not built');
  ok(/optCss\(\(\) => require\('\.\/ui\/kit'\)\)/.test(fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8')), 'asset ide.css joins ui/kit by a literal require');

  // ---- (kit) GET kit: the Code Pieces catalog. Read only, no mod, 400 on a bad kind or lang, v1 kinds, not open to a phone
  if (has('ide/kit/index.js')) {
    const KIT = require('../../../ide/kit'), KK = require('../../../ide/kit/kinds')().KINDS.map(k => k.id), L = KIT.load();
    // v1 has 16 content groups: every one must load (a lost or broken group is a FAIL here, never a skip of the counts below)
    const G16 = ['ia-start', 'ia-ideas-1', 'ia-ideas-2', 'ia-ideas-3', 'ia-when-1', 'ia-when-2', 'ia-if-1', 'ia-if-2', 'ia-do-1', 'ia-do-2', 'ia-do-3', 'ia-do-4', 'ia-pat', 'ia-adv-1', 'ia-adv-2', 'sdl'];
    ok(L.groups.length === 47 && L.groups.every(g => g.state === 'ok') && G16.every(id => L.groups.some(g => g.id === id && g.state === 'ok')), 'kit: all 47 content groups load (16 of v1, 31 of round 2) ' + L.groups.filter(g => g.state !== 'ok').map(g => g.id + ' ' + g.state).join() + ' (' + L.groups.length + ')');
    const ia = await get('kit', { kind: 'ia-entity', lang: 'en' });
    const pk = ['id', 'sec', 'title', 'titleEn', 'what', 'kinds', 'scope', 'role', 'parts', 'wrap', 'needs', 'event', 'tag', 'short', 'lim', 'src', 'adv', 'task'];
    ok(['v', 'kind', 'lang', 'game', 'sections', 'views', 'pieces', 'words'].every(k => k in ia) && ia.kind === 'ia-entity' && ia.lang === 'en' && ia.game === true && /^[0-9a-f]{6,}$/.test(ia.v), 'kit: answer shape ' + Object.keys(ia).join());
    const secIds = new Set(ia.sections.map(s => s.id));
    ok(ia.sections.length > 0 && ia.sections.every(s => typeof s.id === 'string' && typeof s.title === 'string' && s.title && 'parent' in s && typeof s.order === 'number'), 'kit: sections carry id, parent, title, order');
    const badP = ia.pieces.filter(p => !pk.every(k => k in p) || !secIds.has(p.sec) || !Array.isArray(p.parts) || !p.parts.length || p.wrap !== false || !['V', 'I', 'T'].includes(p.tag) || typeof p.adv !== 'boolean' || !p.title || !p.titleEn);
    ok(ia.pieces.length > 0 && !badP.length, 'kit: every piece has the route shape and a known section ' + badP.slice(0, 3).map(p => p.id).join());
    ok(ia.pieces.every(p => p.parts.every(x => typeof x === 'string' || x.caret === true || (typeof x.f === 'string' && typeof x.k === 'string' && typeof x.label === 'string' && x.label))), 'kit: parts are text, labelled fields and the caret');
    ok(['terrains', 'ables', 'places', 'helperEvents'].every(k => ia.words && k in ia.words), 'kit: words for the planner');
    ok(ia.pieces.every(p => !p.key || (/^resource\/(set|entity|map|properties|interface|script|sound)\//.test(p.key) && p.line >= 1)), 'kit: cites are game data files only, key and line from them');
    ok(JSON.parse(JSON.stringify(ia)).pieces.length === ia.pieces.length, 'kit: the answer is plain JSON');
    // v1 kinds. Data: 391 pieces, 386 of them for interaction files (kinds ia-entity), 5 for any data file (kinds sdl). An sdl piece goes
    // to every kind but bot-lua, except the kinds in its notKinds (a.sdl.macro and n.sdl.define leave out the 3 interaction kinds). So:
    // ia-entity 386 + 3 = 389, ia-terrain 3, ia-terrain-map 3, bot-lua 0 pieces and 0 sections, every other kind 5, 'none' nothing.
    // The sets are taken from load() and the notKinds data; the totals stay literal so a lost file or piece fails.
    const isSdl = p => (p.kinds || []).includes('sdl'), sdlP = L.pieces.filter(isSdl), sdlN = sdlP.length, iaN = L.pieces.filter(p => (p.kinds || []).includes('ia-entity')).length;
    const IAK = ['ia-entity', 'ia-terrain', 'ia-terrain-map'], notIa = sdlP.filter(p => IAK.every(k => (p.notKinds || []).includes(k)));
    ok(L.pieces.length === 1034 && iaN === 491 && sdlN === 8 && notIa.length === 2 && sdlP.every(p => !(p.notKinds || []).length || IAK.every(k => p.notKinds.includes(k)) && p.notKinds.length === 3),
      'kit: loads 1034 pieces (v1 391 + round 2 643), 491 for interaction files and 8 for any data file, 2 of those left out of the 3 interaction kinds (' + [L.pieces.length, iaN, sdlN, notIa.map(p => p.id).join('+')].join(', ') + ')');
    const wantIds = k => L.pieces.filter(p => ((p.kinds || []).includes(k) || (isSdl(p) && k !== 'bot-lua')) && !(p.notKinds || []).includes(k)).map(p => p.id).sort().join();
    const gotIds = a => a.pieces.map(p => p.id).sort().join();
    ok(ia.pieces.length === 497 && gotIds(ia) === wantIds('ia-entity') && ia.pieces.filter(p => p.kinds.includes('sdl')).length === 6 && !ia.pieces.some(p => notIa.some(q => q.id === p.id)),
      'kit: ia-entity gets its 491 pieces + 6 sdl pieces = 497 (' + ia.pieces.length + ')');
    const want = { 'ia-terrain': 35, 'ia-terrain-map': 6, 'bot-lua': 0, lng: 10, mi: 347, mapinfo: 10, stuff: 10, breed: 13, 'entity-def': 163, props: 16 }, wrongK = [];   // round 2: kinds with pieces of their own; the rest get the 8 sdl pieces
    for (const k of KK.filter(x => x !== 'ia-entity')) {
      const a = await get('kit', { kind: k, lang: 'en' }), n = k in want ? want[k] : 8, own = k in want && k !== 'ia-terrain-map';
      if (a.kind !== k || a.pieces.length !== n || gotIds(a) !== wantIds(k) || (!own && (!a.pieces.every(p => p.kinds.includes('sdl') && /^sdl\./.test(p.sec)) || a.sections.some(s => !/^sdl\b/.test(s.id)))) ||
        (k === 'bot-lua' && a.sections.length !== 0) || (IAK.includes(k) && a.pieces.some(p => notIa.some(q => q.id === p.id)))) wrongK.push(k + ':' + a.pieces.length + '/' + a.sections.length);
    }
    ok(KK.length === 17 && !wrongK.length, 'kit: every kind gets its own pieces plus the sdl pieces it may hold, bot-lua none ' + wrongK.join());
    // (round 2) bot-lua and none answer 200 with no pieces and no sections (no throw = 200 from safe())
    const bl = await get('kit', { kind: 'bot-lua', lang: 'en' });
    ok(bl.kind === 'bot-lua' && bl.pieces.length === 0 && bl.sections.length === 0 && Object.keys(bl.views).length === 0, 'kit: kind bot-lua answers with no pieces and no sections');
    const ln = await get('kit', { kind: 'lng', lang: 'en' }); ok(ln.pieces.length === 10, 'kit: another kind (lng) gets its 2 pieces and the 8 sdl pieces');
    const none = await get('kit', { kind: 'none', lang: 'en' });
    ok(none.kind === 'none' && none.pieces.length === 0 && none.sections.length === 0, 'kit: kind none has no pieces');
    // (round 2) T pieces are in the answer, each with adv:true and tag T, so the page can hide them while Advanced is off (ui/kit.js
    // canSee hides adv or tag T; the page side is tested in test-kit.js "kit adv" and "kit pick")
    const tP = ia.pieces.filter(p => p.tag === 'T'), tLoaded = L.pieces.filter(p => p.tag === 'T' && (p.kinds || []).includes('ia-entity'));
    ok(tP.length > 0 && tP.length === tLoaded.length && tP.every(p => p.adv === true), 'kit: every T piece is sent with adv:true (' + tP.length + ', ' + tP.filter(p => !p.adv).map(p => p.id).join() + ')');
    // languages: texts in the asked language, English beside them, the same data hash
    const ru = await get('kit', { kind: 'ia-entity', lang: 'ru' }), byId = new Map(ia.pieces.map(p => [p.id, p]));
    ok(ru.lang === 'ru' && ru.v === ia.v && ru.pieces.length === ia.pieces.length && ru.pieces.every(p => byId.get(p.id) && p.titleEn === byId.get(p.id).title), 'kit: ru answer keeps titleEn = the English title and the same v');
    ok(ru.pieces.filter(p => p.title !== p.titleEn).length > ru.pieces.length / 2, 'kit: ru titles are translated');
    ok((await get('kit', { kind: 'ia-entity', lang: 'en' })).v === ia.v, 'kit: v is stable');
    // read only, no mod: a mod in the query is not needed and not read; no game folder -> game:false, pieces still there
    const ng = await get('kit', { kind: 'ia-entity', lang: 'zh' }, Object.assign({}, ctx, { game: () => null }));
    ok(ng.game === false && ng.pieces.length === ia.pieces.length, 'kit: no game folder -> game false, pieces kept');
    ok((await get('kit', { kind: 'sdl', lang: 'uk', mod: path.join(work, 'no-such-mod') })).pieces.length === sdlN, 'kit: a mod in the query is ignored (no mod needed)');
    // seeded bad queries: each one defect
    for (const [q, m] of [[{ lang: 'en' }, 'no kind'], [{ kind: '', lang: 'en' }, 'empty kind'], [{ kind: 'IA-ENTITY', lang: 'en' }, 'upper case kind'],
      [{ kind: 'a', lang: 'en' }, 'one-letter kind'], [{ kind: '../ia-entity', lang: 'en' }, 'kind with ..'], [{ kind: 'x'.repeat(25), lang: 'en' }, 'kind over 24 characters'],
      [{ kind: '1abc', lang: 'en' }, 'kind starting with a digit'], [{ kind: 'zz-unknown', lang: 'en' }, 'kind that is not a kit kind'], [{ kind: 'all', lang: 'en' }, 'kind all (v1.1)'],
      [{ kind: 'ia-entity' }, 'no lang'], [{ kind: 'ia-entity', lang: 'de' }, 'lang de'], [{ kind: 'ia-entity', lang: 'EN' }, 'lang EN'], [{ kind: 'ia-entity', lang: 'en ' }, 'lang with a space']])
      await rejects(() => get('kit', q), 400, null, 'kit 400: ' + m);
    // not open to a phone: not in the LAN Remote allow list, and the route refuses a remote session itself
    const RM = require('../../remote');
    ok(!RM.ALLOW.has('GET /api/x/ide/kit') && !RM.allowed('GET', '/api/x/ide/kit') && RM.allowed('GET', '/api/x/ide/vdir'), 'kit: not in the phone allow list (remote.js ALLOW)');
    await rejects(() => get('kit', { kind: 'ia-entity', lang: 'en' }, Object.assign({}, ctx, { session: { remote: true }, pathOk: () => true })), 403, /View only/, 'kit: a remote session is refused by the route too');
    // (round 2) the session a phone request gets in gui.js ({ token:'', port, remote:true }): 403 for any kind, before the kit is even loaded
    { let loads = 0; R._setKit(() => { loads++; return KIT; });
      const phone = Object.assign({}, ctx, { session: { token: '', port: 1, remote: true }, pathOk: () => true });
      for (const k of ['ia-entity', 'bot-lua', 'none', 'zz-unknown']) await rejects(() => get('kit', { kind: k, lang: 'en' }, phone), 403, /View only/, 'kit: a phone session gets 403 for kind ' + k);
      ok(loads === 0, 'kit: a phone request never loads the catalog (' + loads + ')');
      R._setKit(null); }
    // the kit module missing -> 501 naming the part; broken -> 500 with one line, no stack
    R._setKit(() => { const e = new Error("Cannot find module '../../../ide/kit'"); e.code = 'MODULE_NOT_FOUND'; throw e; });
    await rejects(() => get('kit', { kind: 'ia-entity', lang: 'en' }), 501, /not built yet \(kit\)/, 'kit: module missing -> 501');
    R._setKit(() => { throw new Error('boom\n    at x'); });
    await rejects(() => get('kit', { kind: 'ia-entity', lang: 'en' }), 500, /kit failed to load: boom/, 'kit: module broken -> 500, message only');
    R._setKit(null);
    ok((await get('kit', { kind: 'sdl', lang: 'en' })).pieces.length === sdlN, 'kit: back to the real module');
  } else skip('kit route', 'tools/ide/kit not built');

  // ---- input checks (no sibling needed)
  await rejects(() => post('lint', { mod, rel: 'resource/entity/gun.def', text: 'x'.repeat(4 * 1024 * 1024 + 1) }), 413, /4 MB/, 'lint text cap 413');
  await rejects(() => post('lint', { mod: game, rel: 'resource/entity/gun.def', text: 'x' }), 400, /game folder/, 'lint refuses game dir as mod');
  await rejects(() => post('lint', { mod, rel: '../x.def', text: 'x' }), 400, /leaves your mod/, 'lint refuses ..');
  await rejects(() => post('hover', { mod, rel: 'resource/entity/gun.def', text: 'x', line: 0, col: 1 }), 400, /line/, 'hover line 0 refused');
  const d1 = R._docOf(ctx, { mod, rel: 'resource/entity/gun.def', text: 'a\r\nb' });
  ok(d1.doc.key === 'resource/entity/gun.def' && d1.doc.text === 'a\nb' && d1.doc.file === path.join(mod, 'resource', 'entity', 'gun.def') && d1.ictx.folder === mod && d1.ictx.gameDir === game && d1.ictx.mods.includes('mine'), 'docOf rel ' + JSON.stringify(d1.ictx));
  const d2 = R._docOf(ctx, { mod, rel: 'resource.pak:\x3aset/p.set', text: '' });
  ok(d2.doc.key === 'resource/set/p.set' && !d2.doc.file, 'docOf pak entry key');
  const d3 = R._docOf(ctx, { mod, key: 'resource/entity/gun.def', idx: 0, text: '' });
  ok(d3.doc.key === 'resource/entity/gun.def', 'docOf layer');

  // ---- lint / symbols (intel parts)
  if (has('ide/intel/check.js')) {
    const broken = '{"weapon"\n  {damage 10\n}\n';
    const l = await post('lint', { mod, rel: 'resource/entity/gun.def', text: broken });
    ok(Array.isArray(l.findings) && l.findings.some(f => f.line >= 1 && f.col >= 1) && Array.isArray(l.fixes) && Array.isArray(l.multi) && typeof l.ms === 'number', 'lint finds the broken brace ' + JSON.stringify(l.findings.slice(0, 2)));
  } else skip('lint broken buffer', 'intel check not built');
  if (has('ide/intel/nav.js')) {
    const s = await post('symbols', { mod, rel: 'resource/entity/gun.def', text: '{"weapon"\n  {damage 10}\n}\n' });
    ok(Array.isArray(s.symbols) && s.symbols.length >= 1 && s.symbols[0].line === 1, 'symbols ' + JSON.stringify(s.symbols));
    const w = await get('words', { mod, kind: 'sdl' });
    ok(Array.isArray(w.words), 'words');
  } else {
    skip('symbols', 'intel nav not built'); skip('words', 'intel nav not built');
    await rejects(() => post('symbols', { mod, rel: 'resource/entity/gun.def', text: '{}' }), 501, /not built/, 'symbols without nav -> 501');
  }

  // ---- vdir
  const v0 = await get('vdir', { mod, dir: '' });
  ok(v0.dir === '' && v0.dirs.includes('entity') && v0.dirs.includes('set') && !v0.truncated, 'vdir root ' + JSON.stringify(v0.dirs));
  const v1 = await get('vdir', { mod, dir: 'entity' });
  const f = nm => v1.files.find(x => x.name === nm) || {};
  ok(JSON.stringify(v1.dirs) === '["sub"]', 'vdir dirs once ' + JSON.stringify(v1.dirs));
  ok(f('gun.def').where === 'mine' && f('only.def').where === 'vanilla' && f('new.def').where === 'mine' && f('only.def').key === 'resource/entity/only.def' && f('only.def').size === 8, 'vdir files ' + JSON.stringify(v1.files));
  const v2 = await get('vdir', { mod, dir: 'resource/set' });
  ok(v2.files.some(x => x.name === 'p.set' && x.where === 'mine') && v2.files.some(x => x.name === 'x.set' && x.where === 'vanilla'), 'vdir set (pak entry + vanilla)');
  await rejects(() => get('vdir', { mod, dir: '../x' }), 400, /\.\./, 'vdir refuses ..');
  // vanilla only: the game's own copy of a file my mod replaces, and no file only my mod has
  const vv = await get('vdir', { mod, dir: 'entity', vanilla: '1' }), vg = vv.files.find(x => x.name === 'gun.def') || {};
  ok(vg.where === 'vanilla' && Number.isInteger(vg.idx) && !vv.files.some(x => x.name === 'new.def') && vv.files.every(x => x.where === 'vanilla'), 'vdir vanilla only ' + JSON.stringify(vv.files));
  const vgo = await require('../files/lib').openFile(ctx, { mod, key: vg.key, idx: vg.idx });
  ok(vgo.text.includes('damage 10') && !vgo.editable, 'vdir vanilla only: the row opens the game copy, not mine');
  // (merged) under=1: only the game files my mod has no copy of (gun.def is mine: left out; only.def stays, read-only, with its pak name field)
  const vu = await get('vdir', { mod, dir: 'entity', vanilla: '1', under: '1' }), vuo = vu.files.find(x => x.name === 'only.def') || {};
  ok(!vu.files.some(x => x.name === 'gun.def' || x.name === 'new.def') && vuo.where === 'vanilla' && Number.isInteger(vuo.idx) && 'pak' in vuo, 'vdir under=1: game files not overwritten ' + JSON.stringify(vu.files));
  const vuOpen = await require('../files/lib').openFile(ctx, { mod, key: vuo.key, idx: vuo.idx });
  ok(!vuOpen.editable, 'merged game row opens read-only');
  const vfu = await get('vfind', { mod, q: 'entity/', vanilla: '1', under: '1' });
  ok(vfu.hits.some(x => x.key === 'resource/entity/only.def') && !vfu.hits.some(x => x.key === 'resource/entity/gun.def'), 'vfind under=1 filter: game files not overwritten only ' + JSON.stringify(vfu.hits.map(x => x.key)));
  // ---- copies: the same file in vanilla, in my mod and in a mod that is installed but not loaded
  wr(path.join(game, 'mods', 'other', 'mod.info'), '{mod {name "Other Mod"}}\r\n');
  wr(path.join(game, 'mods', 'other', 'resource', 'Entity', 'GUN.def'), '{"weapon"\r\n  {damage 99}\r\n}\r\n');
  wr(path.join(game, 'mods', 'nogun', 'resource', 'entity', 'zz.def'), '{zz}\r\n');
  const cp = await get('copies', { mod, key: 'resource/entity/gun.def' }), ck = cp.copies.map(c => c.kind + (c.winner ? '*' : '')).join();
  const off = cp.copies.find(c => c.kind === 'off') || { ref: {} }, mineC = cp.copies.find(c => c.kind === 'mine') || { ref: {} }, vanC = cp.copies.find(c => c.kind === 'vanilla') || { ref: {} };
  ok(cp.key === 'resource/entity/gun.def' && ck === 'mine*,vanilla,off' && !cp.truncated, 'copies: mine, vanilla, mod not loaded ' + ck);
  ok(off.label === 'Other Mod (other)' && fs.readFileSync(off.ref.path, 'utf8').includes('damage 99') && mineC.ref.rel === 'resource/entity/gun.def' && Number.isInteger(vanC.ref.idx) && vanC.ref.key === cp.key, 'copies: refs open the right files ' + JSON.stringify(cp.copies.map(c => c.ref)));
  const cp2 = await get('copies', { mod, rel: 'resource/entity/new.def' });
  ok(cp2.copies.length === 1 && cp2.copies[0].kind === 'mine', 'copies: a file only I have');
  await rejects(() => get('copies', { mod, rel: 'mod.info' }), 400, /does not read/, 'copies refuses a file the game does not read');
  fs.rmSync(path.join(game, 'mods', 'other'), { recursive: true }); fs.rmSync(path.join(game, 'mods', 'nogun'), { recursive: true });
  const vn = await get('vdir', { mod, dir: '' }, Object.assign({}, ctx, { game: () => null }));
  ok(vn.dirs.length === 0 && vn.files.length === 0, 'vdir without game: empty');
  // ---- no mod picked: the read routes answer from the game as it ships; writes and the mod's own files still need a mod
  const nv = await get('vdir', { dir: 'entity' }), nf = nm => nv.files.find(x => x.name === nm) || {};
  ok(nf('gun.def').where === 'vanilla' && nf('only.def').where === 'vanilla' && !nv.files.some(x => x.name === 'new.def') && (nv.notes || []).includes('no-mod'), 'vdir with no mod: the game alone ' + JSON.stringify(nv.files.map(x => x.name + ':' + x.where)));
  ok(!(await get('vdir', { dir: 'set' })).files.some(x => x.name === 'p.set'), 'vdir with no mod: the profile mod (mine) is not in the view');
  const nc = await get('copies', { key: 'resource/entity/gun.def' }), nck = nc.copies.map(c => c.kind + (c.winner ? '*' : '')).join();
  ok(nck === 'vanilla*,off' && nc.copies[1].label === 'mine', 'copies with no mod: the game copy wins, an installed mod is listed as not loaded ' + nck);
  const nd = R._docOf(ctx, { key: 'resource/entity/gun.def', idx: 0 }, true, true);
  ok(nd.mod === null && nd.doc.text.includes('damage 10') && nd.ictx.mods.length === 0 && nd.ictx.vfs && nd.ictx.vfs.files.has('resource/entity/only.def'), 'docOf by key with no mod: the game file and the game index');
  if (has('ide/intel/nav.js')) {
    const ns = await post('symbols', { key: 'resource/entity/gun.def', idx: 0 });
    ok(Array.isArray(ns.symbols) && ns.symbols.length >= 1, 'symbols by key with no mod read the game file');
    const nr = await post('refs', { name: 'weapon' });
    ok(nr && typeof nr === 'object', 'refs by name with no mod answer from the game');
  } else skip('symbols and refs with no mod', 'intel nav not built');
  // seeded defects: a key that climbs out, a mod file or a write with no mod, no game folder
  await rejects(() => post('symbols', { key: 'resource/../../mods/mine/resource/entity/gun.def', idx: 0 }), 400, /\.\./, 'a key with .. is refused with no mod');
  await rejects(() => get('copies', { key: 'resource/../x.def' }), 400, /\.\./, 'copies refuses a key with .. with no mod');
  await rejects(() => get('vdir', { dir: '../..' }), 400, /\.\./, 'vdir refuses .. with no mod');
  await rejects(() => post('lint', { rel: 'resource/entity/gun.def', text: 'x' }), 400, /Pick your mod/, 'a file of the mod (rel) with no mod is refused');
  await rejects(() => post('lint', { rel: 'resource/entity/gun.def', key: 'resource/entity/gun.def', idx: 0, text: 'x' }), 400, /Pick your mod/, 'rel and key with no mod: the rel needs the mod');
  await rejects(() => post('extopen', { app: 'npp', rel: 'resource/entity/gun.def' }), 400, /Pick your mod/, 'extopen of a mod file with no mod is refused');
  const FL = require('../files/lib');
  await rejects(() => FL.save(ctx, { rel: 'resource/entity/gun.def', text: 'x', write: true }), 400, /Pick your mod/, 'save (the editor\'s write) with no mod is refused');
  await rejects(() => FL.copyIn(ctx, { key: 'resource/entity/gun.def', write: true }), 400, /Pick your mod/, 'copy into the mod with no mod is refused');
  await rejects(() => get('vdir', { dir: '' }, Object.assign({}, ctx, { game: () => null })), 400, /Pick your mod/, 'no mod and no game folder: refused as before');
  // a phone with no mod: the game folder must be one the PC page shows
  const inDir = r => p => { const a = path.resolve(p).toLowerCase(), b = path.resolve(r).toLowerCase(); return a === b || a.startsWith(b + path.sep); };
  const gph = Object.assign({}, ctx, { session: { remote: true }, pathOk: inDir(game) }), mph = Object.assign({}, ctx, { session: { remote: true }, pathOk: inDir(mod) });
  ok((await get('vdir', { dir: 'entity' }, gph)).files.some(x => x.name === 'only.def'), 'a phone shown the game folder lists the game with no mod');
  await rejects(() => get('vdir', { dir: 'entity' }, mph), 403, /View only/, 'a phone not shown the game folder gets nothing with no mod');
  await rejects(() => get('copies', { key: 'resource/entity/gun.def' }, mph), 403, /View only/, 'copies on such a phone with no mod -> 403');

  // ---- log
  const lg = await get('log', { mod });
  const ua = lg.findings.find(x => x.code === 'LOG_WARN' && /Unknown ability/.test(x.msg));
  ok(lg.file && /game\.log$/.test(lg.file) && lg.time > 0, 'log file found');
  ok(ua && ua.link === 'key:resource/entity/gun.def:2' && ua.sev === 'warn' && ua.count === 1, 'log finding with link ' + JSON.stringify(lg.findings));
  const up = lg.findings.find(x => /Unknown props/.test(x.msg));
  ok(up && !up.link, 'source-file line gets no link');
  ok(lg.tail.length === 200 && lg.tail[199] === 'filler 259', 'log tail 200 lines');
  const ln = await get('log', {}, Object.assign({}, ctx, { game: () => null }));
  ok(ln.file === null && ln.findings.length === 0 && ln.tail.length === 0, 'log without game: empty');

  // ---- extopen (spawn + npp stubbed)
  const spawned = [], opened = [];
  R._setSpawn((exe, args, o) => { spawned.push({ exe, args, o }); return { unref() {}, on() {} }; });
  R._setNpp({ open: o => { opened.push(o); return { ok: true }; }, status: o => ({ stub: true, o }), plan: o => ({ ok: true, o }), install: o => ({ ok: true, o }), uninstall: o => ({ removed: [], kept: [], o }) });
  const gunMod = path.join(mod, 'resource', 'entity', 'gun.def');
  const e1 = await post('extopen', { mod, rel: 'resource/entity/gun.def', line: 2, col: 3, app: 'explorer' });
  ok(e1.ok && spawned.length === 1 && spawned[0].exe === 'explorer.exe' && spawned[0].args[0] === '/select,' + gunMod && spawned[0].o.shell === false && spawned[0].o.detached === true, 'explorer /select ' + JSON.stringify(spawned));
  // reveal goes through tools/lib/platform on every system: one argv element per path, never a shell string
  R._setPlatform('darwin');
  await post('extopen', { mod, rel: 'resource/entity/gun.def', app: 'explorer' });
  ok(spawned.length === 2 && spawned[1].exe === 'open' && JSON.stringify(spawned[1].args) === JSON.stringify(['-R', gunMod]) && spawned[1].o.shell === false, 'macOS reveal: open -R <file> ' + JSON.stringify(spawned[1]));
  R._setPlatform('linux');
  await post('extopen', { mod, rel: 'resource/entity/gun.def', app: 'explorer' });
  ok(spawned.length === 3 && spawned[2].exe === 'xdg-open' && spawned[2].args.length === 1 && spawned[2].args[0] === path.dirname(gunMod) && spawned[2].o.shell === false, 'Linux reveal: xdg-open <folder> ' + JSON.stringify(spawned[2]));
  await post('extopen', { mod, rel: 'resource/entity', app: 'explorer' });
  ok(spawned.length === 4 && spawned[3].exe === 'xdg-open' && spawned[3].args[0] === path.join(mod, 'resource', 'entity'), 'Linux folder row: xdg-open <folder>');
  R._setPlatform('win32');
  await post('extopen', { mod, rel: 'resource/entity', app: 'explorer' });
  ok(spawned.length === 5 && spawned[4].exe === 'explorer.exe' && spawned[4].args.length === 1 && spawned[4].args[0] === path.join(mod, 'resource', 'entity') && spawned[4].o.detached === true, 'Windows folder row: explorer.exe <folder>');
  R._setPlatform(null); spawned.length = 1;
  const rsrc = fs.readFileSync(path.join(__dirname, 'routes.js'), 'utf8');
  ok(!/explorer\.exe/.test(rsrc.replace(/\/\/[^\n]*/g, '')) && /platform\(\)\.revealInFolder\(f, platOpt\(\)\)/.test(rsrc) && !/shell:\s*true/.test(rsrc), 'routes: reveal only through lib/platform, no shell');
  // (reveal) a pak entry shows the pak itself, and says so
  const ep = await post('extopen', { mod, rel: 'resource.pak:\x3aset/p.set', app: 'explorer' });
  ok(ep.ok && ep.pak === true && ep.file === path.join(mod, 'resource.pak') && spawned.length === 2 && spawned[1].args[0] === '/select,' + path.join(mod, 'resource.pak'), 'explorer on a pak entry reveals the pak ' + JSON.stringify(ep));
  spawned.length = 1;
  // (reveal) path guard: an absolute path outside the mod, the game and the workshop folder is refused, nothing spawned
  const outF = path.join(work, 'outside-reveal.txt'); fs.writeFileSync(outF, 'x');
  await rejects(() => post('extopen', { path: outF, app: 'explorer' }), 403, /outside/, 'explorer refuses a path outside mod and game');
  ok(spawned.length === 1, 'path guard: nothing spawned');
  // (reveal) a phone (LAN Remote) never opens Explorer on the PC
  await rejects(() => post('extopen', { mod, rel: 'resource/entity/gun.def', app: 'explorer' }, Object.assign({}, ctx, { session: Object.assign({}, ctx.session || {}, { remote: true }) })), 403, /phone/, 'explorer refused for a remote session');
  ok(spawned.length === 1, 'remote: nothing spawned');
  await rejects(() => post('extopen', { mod, rel: 'resource/entity/gun.def', app: 'cmd' }), 400, /app/, 'extopen refuses other apps');
  const e2 = await post('extopen', { mod, rel: 'resource/entity/gun.def', line: 2, col: 3, app: 'npp' });
  ok(e2.ok && opened[0].file === gunMod && opened[0].readOnly === false && opened[0].line === 2 && opened[0].col === 3, 'npp mod file editable');
  const e3 = await post('extopen', { mod, rel: 'resource.pak:\x3aset/p.set', app: 'npp' });
  ok(e3.ok && opened[1].readOnly === true && opened[1].file.startsWith(path.join(ctx.tmpRoot, 'ide-view')) && fs.readFileSync(opened[1].file, 'utf8') === '{p 1}\r\n' && /p\.set$/.test(opened[1].file), 'npp pak entry -> read-only view copy');
  const wh = require('../files/lib').which(ctx, { mod, rel: 'resource/entity/gun.def' });
  const van = wh.chain.find(r => r.kind === 'vanilla');
  const e4 = await post('extopen', { mod, key: 'resource/entity/gun.def', idx: van.idx, app: 'npp' });
  ok(e4.ok && opened[2].file === path.join(game, 'resource', 'entity', 'gun.def') && opened[2].readOnly === true, 'npp vanilla loose file read-only in place');
  ok(spawned.length === 1, 'nothing else spawned');

  // ---- npp routes
  const ns = await get('npp');
  ok(ns.stub, 'npp status through the module');
  const np = await post('npp', { action: 'plan' });
  ok(np.ok && np.o.launcher && np.o.launcher.file === process.execPath && /ide\.js$/.test(np.o.launcher.args[0]), 'npp plan gets the launcher');
  await rejects(() => post('npp', { action: 'plan', theme: 'rel.xml' }), 400, /theme/, 'npp theme must be absolute');
  await rejects(() => post('npp', { action: 'plan', theme: path.join(work, 'nope.xml') }), 404, /theme/, 'npp theme must exist');
  await rejects(() => post('npp', { action: 'format' }), 400, /action/, 'npp bad action');
  R._setNpp(null);
  if (has('ide/npp/index.js')) {
    const sd = path.join(work, 'npp-settings'); fs.mkdirSync(sd, { recursive: true });
    R._setNppOpts({ settingsDir: sd, exe: path.join(work, 'no-npp', 'notepad++.exe') });
    const st = await get('npp');
    ok(st && st.settingsDir && Array.isArray(st.problems), 'npp status real module, fake settings ' + JSON.stringify(st).slice(0, 200));
    R._setNppOpts({});
  } else skip('npp status (real module, fake settings)', 'npp part not built');

  // ---- inbox
  const gunVan = path.join(game, 'resource', 'entity', 'only.def');
  await rejects(() => post('inbox', { token: 'x', file: gunMod, line: 1, col: 1 }), 403, null, 'inbox wrong token 403');
  await rejects(() => post('inbox', { token: 't', file: gunMod }, Object.assign({}, ctx, { session: undefined })), 403, null, 'inbox no session 403');
  await rejects(() => post('inbox', { token: 't', file: 'rel.def' }), 400, /file/, 'inbox file must be absolute');
  ok((await get('inbox', {})).items.length === 0, 'inbox empty');
  await post('inbox', { token: 't', file: gunMod, line: 2, col: 4 });
  await post('inbox', { token: 't', file: gunVan, line: 1, col: 1 });
  await post('inbox', { token: 't', file: gunMod, line: 1, col: 1, vanilla: true });
  const ib = await get('inbox', { wait: '1' });
  ok(ib.items.length === 3 && ib.items[0].ref.mod === mod && ib.items[0].ref.rel === 'resource/entity/gun.def' && ib.items[0].line === 2 && ib.items[0].col === 4, 'inbox round trip mod file ' + JSON.stringify(ib.items[0]));
  ok(ib.items[1].ref.path === gunVan && !ib.items[1].ref.mod, 'inbox vanilla file -> path ref ' + JSON.stringify(ib.items[1]));
  ok(ib.items[2].ref.key === 'resource/entity/gun.def' && ib.items[2].ref.idx === van.idx && ib.items[2].ref.mod === mod, 'inbox vanilla:true -> layer ref ' + JSON.stringify(ib.items[2]));
  // hold released early by a post (a hold of 2 min, so "early" is a wide gap a busy PC cannot close)
  R._setHoldMs(120000);
  const t0 = Date.now();
  const held = get('inbox', { wait: '1' });
  setTimeout(() => post('inbox', { token: 't', file: gunMod, line: 5, col: 1 }), 60);
  const hr = await held;
  ok(hr.items.length === 1 && hr.items[0].line === 5 && Date.now() - t0 < 60000, 'inbox hold released early by a post (' + (Date.now() - t0) + ' ms)');
  // two tabs: a new GET never releases an older one; a POST releases both with the same item (the post releases them: a long hold)
  let r1done = false;
  const w1 = get('inbox', { wait: '1' }).then(r => { r1done = true; return r; }), w2 = get('inbox', { wait: '1' });
  await WT.until(() => R._waiters() === 2, { who: 'ide test', what: 'two inbox waiters live' });
  ok(!r1done && R._waiters() === 2, 'new waiter does not release the old one (' + R._waiters() + ' live)');
  const pw = await post('inbox', { token: 't', file: gunMod, line: 7, col: 1 });
  const r1 = await w1, r2 = await w2;
  ok(pw.delivered === 2 && r1.items.length === 1 && r2.items.length === 1 && r1.items[0].line === 7 && r2.items[0].line === 7 && R._waiters() === 0, 'post releases every live waiter with the same items');
  R._setHoldMs(200);
  const w3 = await get('inbox', { wait: '1' });
  ok(w3.items.length === 0, 'lone waiter times out empty');
  // cap 8: the ninth releases the oldest empty
  R._setHoldMs(120000);
  const nine = []; let firstAt = 0; const tc = Date.now();
  for (let i = 0; i < 9; i++) nine.push(get('inbox', { wait: '1' }));
  nine[0].then(() => { firstAt = Date.now() - tc; });
  const f0 = await nine[0];
  ok(f0.items.length === 0 && firstAt < 60000 && R._waiters() === 8, 'waiter cap 8: oldest released empty (' + R._waiters() + ' live, ' + firstAt + ' ms)');
  await post('inbox', { token: 't', file: gunMod, line: 8, col: 1 });
  const rest = await Promise.all(nine.slice(1));
  ok(rest.every(r => r.items.length === 1 && r.items[0].line === 8), 'the 8 live waiters all get the post');
  // a closed connection drops its waiter: the next post stays queued for the next GET
  let closeFn = null;
  const cctx = Object.assign({}, ctx, { onClose: fn => { closeFn = fn; } });
  const dead = get('inbox', { wait: '1' }, cctx);
  await WT.until(() => typeof closeFn === 'function' && R._waiters() === 1, { who: 'ide test', what: 'the inbox waiter with onClose' });
  ok(typeof closeFn === 'function' && R._waiters() === 1, 'inbox GET registers onClose');
  closeFn();
  const dr = await dead;
  ok(R._waiters() === 0 && dr.items.length === 0, 'closed connection drops the waiter');
  const pd = await post('inbox', { token: 't', file: gunMod, line: 9, col: 2 });
  ok(pd.delivered === 0, 'post after close is not handed to the dead response');
  const after = await get('inbox', { wait: '1' }, cctx);
  ok(after.items.length === 1 && after.items[0].line === 9 && after.items[0].col === 2, 'queued item reaches the next GET');
  R._setHoldMs(200);
  // cap 50
  for (let i = 0; i < 60; i++) await post('inbox', { token: 't', file: gunMod, line: i + 1, col: 1 });
  const capped = await get('inbox', {});
  ok(capped.items.length === 50 && capped.items[49].line === 60, 'inbox cap 50 keeps newest');
  const tq = Date.now(); const to = await get('inbox', { wait: '1' });
  ok(to.items.length === 0 && Date.now() - tq < 20000, 'inbox hold times out (' + (Date.now() - tq) + ' ms; the hold is 200 ms, the default 25 s)');

  // ---- inbox: what counts as a mod folder
  const loose = path.join(work, 'loose', 'resource', 'entity', 'x.def'); wr(loose, '{x}\r\n');
  const nomi = path.join(game, 'mods', 'nomi', 'resource', 'entity', 'y.def'); wr(nomi, '{y}\r\n');
  const ia = await post('inbox', { token: 't', file: loose });
  ok(ia.ref.path === loose && !ia.ref.mod, 'inbox: a folder holding resource/ outside mods is not a mod ' + JSON.stringify(ia.ref));
  const ib2 = await post('inbox', { token: 't', file: nomi });
  ok(ib2.ref.mod === path.join(game, 'mods', 'nomi') && ib2.ref.rel === 'resource/entity/y.def', 'inbox: <game>/mods/<name> is a mod without mod.info ' + JSON.stringify(ib2.ref));
  const wl = path.join(work, 'withinfo'); wr(path.join(wl, 'mod.info'), '{mod}\r\n'); wr(path.join(wl, 'resource', 'z.def'), '{z}\r\n');
  const ic = await post('inbox', { token: 't', file: path.join(wl, 'resource', 'z.def') });
  ok(ic.ref.mod === wl && ic.ref.rel === 'resource/z.def', 'inbox: a folder with mod.info outside the game is a mod ' + JSON.stringify(ic.ref));
  await get('inbox', {});

  // ---- log: why it is empty
  ok(ln.why === 'nogame', 'log empty why nogame');
  R._setLogs(() => ({ find: () => ({ newest: null }) }));
  const l2 = await get('log', { mod });
  ok(l2.file === null && l2.why === 'nolog', 'log empty why nolog');
  R._setLogs(() => { const e = new Error('Cannot find module'); e.code = 'MODULE_NOT_FOUND'; throw e; });
  const l3 = await get('log', { mod });
  ok(l3.file === null && l3.why === 'nologs' && l3.findings.length === 0, 'log empty why nologs (logs ext missing)');
  R._setLogs(null);
  ok(!(await get('log', { mod })).why, 'log with a file has no why');

  // ---- extopen: Notepad++ missing is an error answer (the page reports success on any 200)
  R._setNpp({ open: () => ({ ok: false, error: 'Notepad++ was not found' }), status: () => ({}) });
  await rejects(() => post('extopen', { mod, rel: 'resource/entity/gun.def', app: 'npp' }), 404, /Notepad\+\+ was not found/, 'npp missing -> 404 with its message');

  // ---- view copies older than 24 h are swept on the first copy of the process
  const vdir = path.join(ctx.tmpRoot, 'ide-view');
  const oldF = path.join(vdir, 'old.def'), newF = path.join(vdir, 'new.def'), subF = path.join(vdir, 'keep', 'old.def');
  wr(oldF, 'o'); wr(newF, 'n'); wr(subF, 's');
  const past = new Date(Date.now() - 48 * 3600 * 1000);
  fs.utimesSync(oldF, past, past); fs.utimesSync(subF, past, past); fs.chmodSync(oldF, 0o444);
  const opened2 = [];
  R._setNpp({ open: o => { opened2.push(o); return { ok: true }; }, status: () => ({}) });
  R._viewSweep(false);
  await post('extopen', { mod, rel: 'resource.pak:\x3aset/p.set', app: 'npp' });
  ok(!fs.existsSync(oldF) && fs.existsSync(newF) && fs.existsSync(subF) && fs.existsSync(opened2[0].file), 'ide-view sweep: old plain file gone, new file + subfolder kept');
  wr(path.join(vdir, 'old2.def'), 'o'); fs.utimesSync(path.join(vdir, 'old2.def'), past, past);
  await post('extopen', { mod, rel: 'resource.pak:\x3aset/p.set', app: 'npp' });
  ok(fs.existsSync(path.join(vdir, 'old2.def')), 'ide-view sweep runs once per process');
  R._setNpp(null);

  // ---- ictx.vfs: lazy, cached, null on a throw; lint warms the index
  const flib = require('../files/lib'), realVfs = flib.vfsFor;
  let vcalls = 0;
  flib.vfsFor = (...a) => { vcalls++; return realVfs(...a); };
  const ix = R._ictxOf(ctx, mod);
  const dsc = Object.getOwnPropertyDescriptor(ix, 'vfs');
  ok(dsc && typeof dsc.get === 'function' && vcalls === 0, 'ictx.vfs is a lazy getter (not built eagerly)');
  const v1x = ix.vfs, v2x = ix.vfs;
  ok(v1x && v1x.files && v1x.files.has('resource/entity/only.def') && v1x === v2x && vcalls === 1, 'ictx.vfs builds once and caches (' + vcalls + ' calls)');
  flib.vfsFor = () => { throw new Error('boom'); };
  ok(R._ictxOf(ctx, mod).vfs === null, 'ictx.vfs throw -> null');
  flib.vfsFor = realVfs;
  const nvx = R._ictxOf(ctx, null).vfs;
  ok(nvx && nvx.files.has('resource/entity/only.def') && !nvx.files.has('resource/entity/new.def'), 'ictx.vfs without a mod -> the game as it ships (no mods)');
  let warmed = null;
  R._setIntel({ check: () => [], warm: ic2 => { warmed = ic2; } });
  const lw = await post('lint', { mod, rel: 'resource/entity/gun.def', text: '{a}' });
  ok(Array.isArray(lw.findings) && warmed && Object.getOwnPropertyDescriptor(warmed, 'vfs').get, 'lint calls intel warm(ictx) after the answer');
  R._setIntel({ check: () => [], warm: () => { throw new Error('warm broke'); } });
  const lw2 = await post('lint', { mod, rel: 'resource/entity/gun.def', text: '{a}' });
  ok(Array.isArray(lw2.findings), 'a throwing warm does not break lint');
  R._setIntel(null);

  // ---- W5 G6 (source checks of the browser parts; each fails on the old code)
  {
    const core = require('./ui/core').script, expl = require('./ui/explorer').script, pan = require('./ui/panels').script;
    const saveFn = core.slice(core.indexOf('function save(d)'), core.indexOf('function confirmSave'));
    ok(saveFn.length > 0 && !/write:true/.test(saveFn) && /changesView\(d,true\)/.test(saveFn), 'GT-20 Save shows the changes first, never writes itself');
    ok(/function confirmSave\(d,text\)\{[\s\S]{0,200}IDE\.textOf\(d\)!==text/.test(core) && /function writeDoc\(d,text\)[\s\S]{0,300}write:true/.test(core), 'GT-20 write only after confirm, of the text shown');
    ok(/\['changes','file',null,showChanges,canEdit\]/.test(core) && /function noChanges/.test(core), 'GT-20 Show changes enabled for every editable file, always opens a view');
    ok(/genericStep/.test(core) && /ide\.c\.goLine/.test(core) && /ide\.c\.details/.test(core), 'GT-20 Explain drops catch-all steps, offers editor steps, codes in Details');
    ok(/ide\.modinfoCmp/.test(core) && /some\(function\(n\)\{return \/\^dropped\//.test(core), 'GT-03/04 editor: mod.info compare text, dropped-* notes');
    ok(/typeof setMod==='function'\)setMod\(m\)/.test(core) && /ide\.modName/.test(core), 'GT-15 editor shows the shared mod and switches it for a sent file');
    ok(/\.filter\(function\(s\)\{return s!==''\}\)/.test(core), 'GT-39 crumb drops empty path parts');
    const m = /function pj\(a,b\)\{[^\n]*\}/.exec(expl);
    let pj = null; try { pj = m && new Function(m[0] + '; return pj;')(); } catch { pj = null; }
    ok(pj && pj('entity/', 'x.def') === 'entity/x.def' && pj('', 'x') === 'x' && pj('a//b/', '/c') === 'a/b/c' && /label=pj\(p,f\.name\)/.test(expl), 'GT-39 explorer path join: no doubled slash');
    ok(/indexOf\('modinfo'\)<0/.test(pan), 'GT-03 Which panel: no "never reads" line for mod.info');
    const langs = [require('./lang/core'), require('./lang/explorer')].reduce((a, b) => a.concat(b), []);
    const need = ['ide.sv.h', 'ide.sv.lead', 'ide.sv.do', 'ide.sv.doT', 'ide.sv.moved', 'ide.sv.busy', 'ide.c.title', 'ide.c.at', 'ide.c.self', 'ide.c.selfFix', 'ide.c.goLine', 'ide.c.cmp', 'ide.c.find', 'ide.c.details', 'ide.c.code', 'ide.modinfoCmp', 'ide.modName', 'ide.modT', 'ide.st.modinfo', 'ide.x.st.modinfo', 'ide.x.st.modinfo.tip'];
    ok(need.every(k => { const r = langs.find(x => x[0] === k); return r && r.length === 5 && r.slice(1).every(s => typeof s === 'string' && s.length > 1); }), 'G6 strings in en, ru, uk, zh');
  }

  // ---- K5 (PERF.md): the 5 s read of the game log (panel tick "auto") waits while the Editor page or the window is hidden
  // (pollLater, page.js): no log request then; shown again = one read at once and the log drawn as before; unticked while
  // hidden = no read on return. The panels part alone on a stub IDE; a wait of 1 s or more takes 5 ms
  {
    const vm = require('vm'), G = path.join(__dirname, '..', '..'), fakedom = require(path.join(G, 'test', 'fakedom')), BC = require(path.join(G, 'test', 'blockcheck'));
    const POLLSRC = 'var POLLS=[];\n' + ['pageHid', 'pollOn', 'pollLater', 'pollStop', 'pollWake'].map(BC.fnSrc).join('\n');
    const wait = ms => new Promise(r => setTimeout(r, ms)), flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
    const ivs = [];
    for (const how of ['page', 'window']) {
      const doc = fakedom.make(), calls = [], ls = { 'ide.p.tab': 'log' }; let nf = 1;
      doc.visibilityState = 'visible';
      const bx = { document: doc, console, encodeURIComponent, S: { mod: 'C:/m', cur: 'ide' }, IDE: { parts: {}, on: () => {}, emit: () => {}, go: () => {} },
        LS: { get: (k, d) => (k in ls ? ls[k] : d), set: (k, v) => { ls[k] = v; } }, tx: (k, p) => k + (p ? JSON.stringify(p) : ''),
        setTimeout: (f, ms) => setTimeout(f, ms >= 1000 ? 5 : ms), clearTimeout,
        setInterval: (f, ms) => { const t = setInterval(f, ms >= 1000 ? 5 : ms); ivs.push(t); return t; }, clearInterval,
        api: u => { calls.push(u); return Promise.resolve({ file: 'C:/u/game.log', time: 0, findings: Array.from({ length: nf }, (x, i) => ({ sev: 'warn', msg: 'm' + i, code: 'C' + i })), tail: [] }); } };
      const F = BC.pageFns(doc); for (const k of BC.NAMES) bx[k] = F[k];
      vm.runInNewContext(POLLSRC + '\n' + require('./ui/panels').script, bx);
      const host = doc.createElement('div'); bx.IDE.parts.panels(host);
      const lc = () => calls.filter(u => /\/api\/x\/ide\/log\?/.test(u)).length;
      const hide = v => { if (how === 'page') bx.S.cur = v ? 'share' : 'ide'; else { doc.hidden = v; doc.visibilityState = v ? 'hidden' : 'visible'; } };
      const auto = host.all().find(e => e.tagName === 'INPUT' && e.attrs.type === 'checkbox');
      ok(auto && lc() === 0, 'log poll (' + how + '): the log panel with its auto tick, nothing read yet');
      auto.checked = true; auto.fire('change'); await WT.until(() => lc() >= 3 && host.textContent.includes('ide.p.l.count{"n":1}'), { who: 'ide test', what: 'log poll (' + how + '): three reads' });
      ok(lc() >= 3 && host.textContent.includes('ide.p.l.count{"n":1}'), 'log poll (' + how + '): on screen the log is read again and again: ' + lc());
      hide(true); await wait(40); const n1 = lc(); await wait(120);
      ok(lc() === n1, 'log poll (' + how + ' hidden): no log request: ' + n1 + ' -> ' + lc());
      nf = 2; hide(false); bx.pollWake(); await flush();
      ok(lc() === n1 + 1 && host.textContent.includes('ide.p.l.count{"n":2}'), 'log poll (' + how + ' shown again): one read at once and the new log is drawn: ' + n1 + ' -> ' + lc());
      await WT.until(() => lc() > n1 + 1, { who: 'ide test', what: 'log poll (' + how + '): reads go on' }); const n2 = lc();
      ok(n2 > n1 + 1, 'log poll (' + how + '): and it goes on while shown: ' + n2);
      hide(true); await wait(40); const n3 = lc(); auto.checked = false; auto.fire('change'); hide(false); bx.pollWake(); await flush(); await wait(60);
      ok(lc() === n3, 'log poll (' + how + '): unticked while hidden = no read on return: ' + n3 + ' -> ' + lc());
    }
    ivs.forEach(clearInterval);
  }

  // ---- blocks: the whole page in the fake DOM, the Editor screen's blocks, a toolbar redraw after
  // Arrange moved a group, the Editor's own panel toggle
  {
    const vm = require('vm'), G = path.join(__dirname, '..', '..'), fakedom = require(path.join(G, 'test', 'fakedom'));
    const doc = fakedom.make(), store = new Map(), timers = [];
    const resp = o => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(o))), body: null });
    const bx = { document: doc, console, TextDecoder, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, confirm: () => true,
      localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      fetch: (u, o) => { const m = (o && o.method) || 'GET', p = String(u).split('?')[0];
        if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
        if (p === '/api/commands') return resp({ commands: require(path.join(G, 'contract')).describe() });
        if (p === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
        if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
        return new Promise(() => {}); } };
    bx.window = bx; vm.createContext(bx);
    vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(require(path.join(G, 'page.js')))[1], bx);
    await built(bx);
    const sec = doc.getElementById('main').children.find(s => s.dataset.id === 'ide');
    const isB = e => !!(e && e.dataset && e.dataset.blk != null), B = id => sec.all().find(e => isB(e) && e.dataset.blk === id);
    const kids = c => c.children.filter(isB).map(b => b.dataset.blk).join();
    // (kit) the Code Pieces column is the third body child once the kit page part is there (built hidden while ide.kit.open is off)
    const bodyKids = has('gui/ext/ide/ui/kit.js') ? 'explorer,centre,kit' : 'explorer,centre';
    ok(kids(sec) === 'nomod,shell' && kids(B('shell')) === 'body,status' && kids(B('body')) === bodyKids && kids(B('centre')) === 'tb,tb.fav,mid,foot,next,panel' &&
      kids(B('mid')) === 'tabs,crumb,bars,editor' && kids(B('tb')) === 'tb.file,tb.fix,tb.jump,tb.log,tb.other,tb.full', 'blocks: Editor regions and panels ' + kids(B('body')) + ' / ' + kids(B('centre')) + ' / ' + kids(B('tb')));
    if (bodyKids.endsWith('kit')) ok(B('kit').querySelector('.ide-kdrag') && B('kit').querySelector('.ide-kit') && !B('kit').children.some(isB), 'blocks: kit is a leaf block with its splitter and host');
    ok(B('explorer').querySelector('.ide-vdrag') && B('panel').querySelector('.ide-hdrag') && B('editor').querySelector('.ide-ed') && B('tabs').querySelector('.ide-tabs'), 'blocks: splitters ride in their panels, cleared parts are wrapped');
    const X = bx.as2Blocks, bar = b => b.children.find(k => k.classList && k.classList.contains('blkbar')), fx = B('tb.fix');
    // the box button offers only shown containers (blkShown); without a mod the shell is hidden, so show it as a picked mod does
    B('shell').hidden = false; B('nomod').hidden = true;
    X.arrange(true);
    let n = 0; while (fx.parentNode !== B('centre') && n++ < 20) bar(fx).children.find(x => x.dataset.blkact === 'box').click();
    bx.IDE.action('zzBlk', { label: 'ide.a.save', group: 'fix', run() {} }); timers.splice(0).forEach(f => { try { f(); } catch { /* page timers */ } });
    ok(fx.parentNode === B('centre') && sec.all().filter(e => isB(e) && e.dataset.blk === 'tb.fix').length === 1 && fx.querySelector('button[data-act=zzBlk]') && bar(fx), 'blocks: a toolbar redraw refills a moved group in place, bar kept (moved to ' + (fx.parentNode && fx.parentNode.dataset.blk) + ')');
    X.arrange(false);
    const ptog = B('status').children.find(k => k.tagName === 'BUTTON' && !/ide-tabm/.test(k.className));
    ptog.click(); const off = B('panel').hidden; ptog.click();
    ok(off && !B('panel').hidden, 'blocks: the panel toggle hides and shows the panel block');
  }

  // ---- viewer docs (ext view): the whole page in the fake DOM, no CodeMirror; a bytes tab and a test kind's tab opened, switched,
  // remembered, closed, dropped on a mod change; a page kind jumps with no tab; text actions off on a viewer
  {
    const core = require('./ui/core').script;
    ok(/e\.status===415&&opt\.view!==false&&VW\(\)/.test(core) && /return openView\(ref,'hex',0,opt\)/.test(core), 'viewer: a 415 for a name the table does not know opens the bytes tab');
    const vm = require('vm'), G = path.join(__dirname, '..', '..'), fakedom = require(path.join(G, 'test', 'fakedom'));
    const doc = fakedom.make(), store = new Map(), timers = [], asked = [];
    const resp = o => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(o))), body: null });
    const bx = { document: doc, console, TextDecoder, setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: () => {}, setInterval: () => 0, confirm: () => true,
      atob: s => Buffer.from(s, 'base64').toString('latin1'),
      localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      fetch: (u, o) => { const m = (o && o.method) || 'GET', p = String(u).split('?')[0], q = new URL('http://x' + u).searchParams; asked.push(String(u));
        if (p === '/api/health') return resp({ ok: true, allowLaunch: false, version: 'test' });
        if (p === '/api/commands') return resp({ commands: require(path.join(G, 'contract')).describe() });
        if (p === '/api/settings') return resp(m === 'GET' ? { settings: {}, empty: true, file: '' } : { ok: true });
        if (p === '/api/game') return resp({ dir: '', tried: [], ok: false, codes: ['none'] });
        if (p === '/api/x/view/info') { const rel = q.get('rel') || ''; return resp({ name: rel.split('/').pop(), rel, key: 'resource/' + rel.split('/').pop(), size: 4096, where: 'mine', type: 'data', magic: '00', ext: 'zzbin', kind: 'hex', text: false }); }
        if (p === '/api/x/view/hex') return resp({ off: 0, len: 32, size: 4096, b64: Buffer.alloc(32, 0x41).toString('base64') });
        return new Promise(() => {}); } };
    bx.window = bx; vm.createContext(bx);
    vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(require(path.join(G, 'page.js')))[1], bx);
    await built(bx);
    const flush = async () => { for (let i = 0; i < 10; i++) { timers.splice(0).forEach(f => { try { f(); } catch { /* page timers */ } }); await new Promise(r => setImmediate(r)); } };
    const St = bx.__as2gui, IDEo = bx.IDE, V = bx.VIEW, M = 'C:/g/mods/mine';
    ok(V && V.specs.hex && IDEo, 'viewer: VIEW is on the page with the hex kind');
    const ev = { open: 0, hide: 0, show: 0, close: 0 };
    V.reg('zzt', { where: 'tab', exts: ['zzt'], open: (host, it) => { ev.open++; ev.item = it; host.appendChild(doc.createElement('canvas')); return { hide() { ev.hide++; }, show() { ev.show++; }, close() { ev.close++; } }; } });
    let went = 0; V.reg('zzp', { where: 'page', exts: ['zzp'], go: () => { went++; return true; } });
    St.mod = M; bx.as2Link('page:ide'); await flush();
    const sec = doc.getElementById('main').children.find(s => s.dataset.id === 'ide'), vhost = sec.querySelector('.ide-vhost'), edHost = sec.querySelector('.ide-ed');
    const d1 = await IDEo.open({ mod: M, rel: 'resource/a.zzbin' }, 0, 0, { view: 'hex' }); await flush();
    ok(d1 && d1.view === 'hex' && d1.editable === false && d1.kind === 'view' && IDEo.active() === d1 && vhost && !vhost.hidden && edHost.style.visibility === 'hidden', 'viewer: a bytes tab opens without an editor, its host over the text pane');
    ok(d1.vel && d1.vel.querySelector('.vw-hx-sc') && /AAAA/.test(d1.vel.textContent), 'viewer: the hex viewer is drawn in the tab');
    const tabs = sec.querySelector('.ide-tabs');
    ok(tabs.querySelector('.ide-vk') && tabs.querySelector('.ide-vk').textContent === 'Bytes' && /Bytes view, 4\.0 KB/.test(sec.querySelector('.ide-status').textContent), 'viewer: tab mark and status show the kind and size');
    const can = id => { const a = IDEo.actions[id]; return !!a && (!a.when || !!a.when()); };
    const offs = ['save', 'npp', 'next', 'prev', 'explain', 'info', 'line', 'compare', 'side'].filter(can);
    ok(!offs.length && can('copies') && can('which') && can('explorer'), 'viewer: text actions are off, copies/which stay ' + offs.join());
    const d2 = await IDEo.open({ mod: M, rel: 'resource/b.zzt' }); await flush();
    ok(d2 && d2.view === 'zzt' && ev.open === 1 && ev.item.kind === 'zzt' && ev.item.rel === 'resource/b.zzt' && d1.vel.hidden && !d2.vel.hidden, 'viewer: a kind\'s tab by its extension, the other viewer hidden');
    await IDEo.open({ mod: M, rel: 'resource/a.zzbin' }, 0, 0, { view: 'hex' }); await flush();
    ok(IDEo.active() === d1 && ev.hide === 1 && IDEo.docs.length === 2, 'viewer: back to the first tab (no second doc), the other told to hide');
    IDEo.run('back'); await flush();
    ok(IDEo.active() === d2 && ev.show === 1, 'viewer: history goes back to the viewer tab, told to show');
    const ses = JSON.parse(store.get('as2gui.ide.open.' + M.toLowerCase()) || '{}');
    ok(ses.refs && ses.refs.length === 2 && ses.refs[0].view === 'hex' && ses.refs[1].view === 'zzt', 'viewer: the session remembers the viewer kind');
    const r3 = await IDEo.open({ mod: M, rel: 'models/x.zzp' }); await flush();
    ok(r3 === null && went === 1 && IDEo.docs.length === 2, 'viewer: a page kind jumps to its page, no tab');
    ok(IDEo.close(d2) && ev.close === 1 && !d2.vel && IDEo.active() === d1 && !d1.vel.hidden, 'viewer: closing a tab closes its viewer, the next tab shows');
    await IDEo.open({ mod: M, rel: 'resource/c.zzt' }); await flush();
    St.mod = 'C:/g/mods/other'; bx.as2Link('page:ide'); await flush();
    ok(IDEo.docs.length === 0 && ev.close === 2 && vhost.hidden && edHost.style.visibility === '', 'viewer: a mod change closes the viewers, the text pane is back');
    bx.IDE_PENDING = [{ ref: { mod: 'C:/g/mods/other', rel: 'resource/z.zzbin' }, view: 'hex' }]; bx.as2Link('page:mods'); bx.as2Link('page:ide'); await flush();
    ok(IDEo.docs.length === 1 && IDEo.docs[0].view === 'hex', 'viewer: VIEW.open from another page arrives as a pending viewer tab');
  }

  // ---- (kit) the Advanced switch flipped while the kit column is up (ui/core.js advCheck): the tree must follow at once, not at the
  // next cursor move. Away on the Settings page, then back (page refresh); and on the Editor page itself, as the Ctrl+K list does it
  // (LS adv + applyAdv, no page change; the fake DOM has no MutationObserver, so the focus that comes back to the Editor carries it).
  if (has('gui/ext/ide/ui/kit.js') && has('ide/kit/index.js')) {
    const IA = 'resource/set/interaction_entity/mine.inc', cl = (e, c) => !!(e && e.classList && e.classList.contains(c));
    for (const on of [true, false]) {
      const P = await boot({ files: { [IA]: '{"my_unit"\n\t\n}' }, ls: { 'ide.kit.open': true, 'ide.kit.seen': true, adv: on, 'ide.kit.fold': { 'ia.adv': true, 'ia.adv.do': true } } });
      const seen = () => { const a = P.B('kit').all(); return a.some(e => cl(e, 'idk-sec') && e.dataset.sec === 'ia.adv') && a.some(e => cl(e, 'idk-bT')); };
      const none = () => { const a = P.B('kit').all(); return !a.some(e => cl(e, 'idk-sec') && e.dataset.sec === 'ia.adv') && !a.some(e => cl(e, 'idk-bT')) && a.some(e => cl(e, 'idk-sec')); };
      const want = v => (v ? seen() : none()), word = on ? 'off' : 'on';
      await P.open(IA, 2, 1);
      ok(want(on), 'kit Advanced ' + (on ? 'on' : 'off') + ': the tree ' + (on ? 'lists' : 'hides') + ' the Advanced section and T pieces');
      P.store.set('as2gui.adv', JSON.stringify(!on)); if (typeof P.bx.applyAdv === 'function') P.bx.applyAdv(); await P.flush();
      const rt = P.doc.querySelector('section.ide-root') || P.sec; rt.fire('focusin'); await P.flush();
      ok(P.St.cur === 'ide' && want(!on), 'kit Advanced turned ' + word + ' on the Editor page (Ctrl+K list): the tree follows on the focus, no cursor move');
      P.ed().goto(1, 1); await P.flush();   // a cursor move redraws the tree in any case: the next check starts from a tree that is right
      P.bx.as2Link('page:settings'); await P.flush();
      P.store.set('as2gui.adv', JSON.stringify(on));
      P.bx.as2Link('page:ide'); await P.flush();
      ok(want(on), 'kit Advanced turned back ' + (on ? 'on' : 'off') + ' on the Settings page: back in the Editor the tree follows before any cursor move');
    }
  } else skip('kit Advanced switch follows', 'kit not built');

  // ---- (kit, round 2) the same switch with a MutationObserver, as in a real browser: page.js applyAdv toggles body.advon and the
  // Editor's body observer runs advCheck at once. A switch made on the Settings page must not be used up there (the kit cannot draw
  // while another page is up); refreshes add no second observer or listener; the observer lets go once the screen is out of the page;
  // the phone view (no kit column) makes no observer at all.
  if (has('gui/ext/ide/ui/kit.js') && has('ide/kit/index.js')) {
    const IA = 'resource/set/interaction_entity/mine.inc', cl = (e, c) => !!(e && e.classList && e.classList.contains(c));
    for (const on of [true, false]) {
      const P = await boot({ mo: true, files: { [IA]: '{"my_unit"\n\t\n}' }, ls: { 'ide.kit.open': true, 'ide.kit.seen': true, adv: on, 'ide.kit.fold': { 'ia.adv': true, 'ia.adv.do': true } } });
      const seen = () => { const a = P.B('kit').all(); return a.some(e => cl(e, 'idk-sec') && e.dataset.sec === 'ia.adv') && a.some(e => cl(e, 'idk-bT')); };
      const none = () => { const a = P.B('kit').all(); return !a.some(e => cl(e, 'idk-sec') && e.dataset.sec === 'ia.adv') && !a.some(e => cl(e, 'idk-bT')) && a.some(e => cl(e, 'idk-sec')); };
      const want = v => (v ? seen() : none()), tag = 'kit Advanced (observer, ' + (on ? 'on' : 'off') + ' first): ';
      const bodyMos = () => P.mos.filter(m => !m.off && m.on.some(x => x.t === P.doc.body && (x.op.attributeFilter || []).includes('class')));
      const setAdv = async v => { P.store.set('as2gui.adv', JSON.stringify(v)); if (typeof P.bx.applyAdv === 'function') P.bx.applyAdv(); bodyMos().forEach(m => m.cb([{ type: 'attributes', attributeName: 'class', target: P.doc.body }], m)); await P.flush(); };
      const rt = P.doc.querySelector('section.ide-root') || P.sec;
      await P.open(IA, 2, 1);
      ok(want(on) && bodyMos().length === 1, tag + 'one body class observer, the tree right at the start (' + bodyMos().length + ')');
      await setAdv(!on);
      ok(P.St.cur === 'ide' && want(!on), tag + 'switched on the Editor page: the tree follows from the observer alone, no focus, no cursor move');
      P.bx.as2Link('page:settings'); await P.flush();
      await setAdv(on);
      P.bx.as2Link('page:ide'); await P.flush();
      ok(want(on), tag + 'switched on the Settings page (observer fired there): back in the Editor the tree follows');
      const fin = (rt.listeners.focusin || []).length, n0 = P.mos.length;
      for (let i = 0; i < 4; i++) { P.bx.as2Link('page:mods'); await P.flush(); P.bx.as2Link('page:ide'); await P.flush(); }
      P.ed().goto(1, 1); await P.flush();
      ok(bodyMos().length === 1 && P.mos.length === n0 && (rt.listeners.focusin || []).length === fin, tag + 'page refreshes add no observer and no focus listener (' + [bodyMos().length, P.mos.length - n0, (rt.listeners.focusin || []).length - fin].join() + ')');
      // the screen leaves the page (torn down): the next body change disconnects the observer and the kit is not redrawn for it
      const m1 = bodyMos()[0], mark = P.B('kit').all().find(e => cl(e, 'idk-sec'));
      if (mark) mark.__keep = 1;
      const host = P.sec.parentNode; if (host) host.removeChild(P.sec);
      await setAdv(!on);
      ok(m1 && m1.off && !bodyMos().length && !!P.B('kit').all().find(e => e.__keep), tag + 'screen out of the page: the observer disconnects, no redraw');
      if (host) host.appendChild(P.sec);
    }
    const RP = await boot({ mo: true, remote: true, files: { [IA]: '{"my_unit"\n\t\n}' }, ls: { 'ide.kit.open': true, 'ide.kit.seen': true } });
    let threw = null;
    try { RP.store.set('as2gui.adv', 'true'); RP.bx.as2Link('page:mods'); await RP.flush(); RP.bx.as2Link('page:ide'); await RP.flush(); (RP.doc.querySelector('section.ide-root') || RP.sec).fire('focusin'); await RP.flush(); } catch (e) { threw = e; }
    ok(!RP.B('kit') && !RP.mos.some(m => m.on.some(x => x.t === RP.doc.body)) && !threw, 'kit Advanced (observer): the phone view has no kit column and no body observer, refresh and focus run clean ' + (threw ? threw.message : ''));
  } else skip('kit Advanced switch follows a body observer', 'kit not built');

  // ---- (round 2) the next-steps strip a part sets (the kit: Save, Try it, after the lint of the version its insert made) stays until
  // the text or its findings change: a status tick, a second check of the same version and a tab switch away and back leave it (the
  // switch back shows it again); a typed change gives the shell's own strip again. The shell's strip after a save is its own (d.after).
  {
    const A = 'resource/set/interaction_entity/a.inc', O = 'resource/set/interaction_entity/o.inc', cl = (e, c) => !!(e && e.classList && e.classList.contains(c));
    let finds = [];
    const P = await boot({ files: { [A]: '{"my_unit"\n\t\n}', [O]: '{"x"\n}' }, lint: () => ({ findings: finds, fixes: [], multi: [], ms: 0 }) });
    const box = () => P.sec.all().find(e => cl(e, 'ide-next'));
    const btns = () => { const n = box(); return n && !n.hidden ? n.all().filter(e => e.tagName === 'BUTTON') : []; };
    const words = () => btns().map(b => b.textContent).join('|');
    const d = await P.open(A, 2, 1);
    let ran = 0; P.IDE.next([{ label: 'ide.a.save', run() { ran++; } }, { label: 'ide.n.play', run() { ran++; } }]);
    const set = words(), b0 = btns()[0];
    ok(btns().length === 2 && set.length > 0, 'next strip: a part sets two steps (' + set + ')');
    P.IDE.status('tick'); await P.flush();
    ok(words() === set && btns()[0] === b0, 'next strip: a status tick leaves the part strip alone');
    // a second check of the same version: the doc is opened again while its check is due (activate runs lint when the doc is not
    // fresh; ltext cleared here stands for that), the answer has the same findings
    const lv = P.asked.filter(a => a.path === '/api/x/ide/lint').length;
    d.ltext = null; await P.open(A, 2, 1);
    ok(P.asked.filter(a => a.path === '/api/x/ide/lint').length > lv && words() === set && btns()[0] === b0, 'next strip: a second check of the same version leaves it alone (not redrawn)');
    await P.open(O, 1, 1);
    ok(P.IDE.active() !== d && words() !== set, 'next strip: another tab shows its own strip');
    await P.open(A, 2, 1);
    ok(P.IDE.active() === d && words() === set, 'next strip: back on the tab the part strip shows again (' + words() + ')');
    if (btns()[0]) btns()[0].click(); ok(ran === 1, 'next strip: the step shown again still runs');
    finds = [{ line: 2, col: 1, sev: 'warning', code: 'x', msg: 'm' }];
    d.ltext = null; await P.open(A, 2, 1);
    ok(d.findings.length === 1 && words() !== set, 'next strip: new findings for the same text give the shell strip (' + words() + ')');
    finds = [];
    P.IDE.next([{ label: 'ide.a.save', run() {} }]); const set2 = words();
    P.ed().userEdit([{ line: 2, col: 1, text: 'x' }]); await P.flush();
    ok(set2 && words() !== set2, 'next strip: a typed change (new version) gives the shell strip again (' + words() + ')');
  }

  // ---- (explorer, no file maximum) a mod with 30,000 empty files in one folder. The routes give every row, whole (an old caller with
  // no lim) or in pages (stable order, one stamp, the total); the page lists them all but draws only the rows in view, End reaches the
  // last one, nothing says "cut short"; the filter finds hits far past the old 500 and a second keystroke stops the first look; the
  // game view lists the folder and searches it on the server a page at a time; above the scaled height the last row is still reached.
  {
    const NB = 30000, big = path.join(work, 'big'), bigMod = path.join(big, 'mods', 'mine'), zdir = path.join(bigMod, 'resource', 'zbig');
    const cl = (e, c) => !!(e && e.classList && e.classList.contains(c));
    const nm = i => 'u' + String(i).padStart(5, '0') + '.set';
    wr(path.join(big, 'as64.exe'), 'MZ');
    wr(path.join(big, 'resource', 'entity', 'a.def'), '{a}\r\n');
    wr(path.join(bigMod, 'mod.info'), '{mod {name "Mine"}}\r\n');
    fs.mkdirSync(zdir, { recursive: true });
    let t0 = Date.now();
    const made = await makeEmpty(zdir, NB, nm);
    const tMake = Date.now() - t0;
    console.log('nomax fixture: ' + made.line);
    if (!made.ok) { skip('nomax explorer cases (' + NB + ' files)', made.why); fs.rmSync(big, { recursive: true, force: true }); } else {
    const ctx2 = Object.assign({}, ctx, { game: () => big }), g2 = (name, q) => get(name, q, ctx2);
    const want = Array.from({ length: NB }, (_, i) => nm(i + 1));
    ok(typeof R['GET /api/x/ide/tree'] === 'function' && typeof R['GET /api/x/ide/vfind'] === 'function', 'nomax: the tree and vfind routes are there');

    // vdir: whole, then in pages
    t0 = Date.now();
    const vw = await g2('vdir', { mod: bigMod, dir: 'zbig' });
    const tV = Date.now() - t0;
    ok(vw.files.length === NB && vw.total === NB && vw.next === null && vw.truncated === false && vw.files.map(f => f.name).join() === want.join(), 'nomax vdir whole (no lim): every file in order, total ' + vw.files.length + '/' + vw.total);
    {
      const got = [], vers = new Set(), tots = new Set(); let off = 0, ver = null, g = 0;
      do { const r = await g2('vdir', Object.assign({ mod: bigMod, dir: 'zbig', off, lim: 7000 }, ver ? { ver } : {})); ver = r.ver; vers.add(r.ver); tots.add(r.total); got.push(...r.dirs, ...r.files.map(f => f.name)); off = r.next; } while (off != null && g++ < 20);
      ok(got.join() === want.join() && vers.size === 1 && tots.size === 1 && tots.has(NB), 'nomax vdir in pages of 7000: the same rows in the same order, one stamp, total ' + [...tots]);
    }
    const vr = await g2('vdir', { mod: bigMod, dir: '', off: 0, lim: 1 });
    ok(vr.dirs.length + vr.files.length === 1 && vr.total >= 2 && vr.next === 1 && vr.off === 0, 'nomax vdir: a page of one row says where the next starts ' + JSON.stringify([vr.dirs, vr.total, vr.next]));
    await rejects(() => g2('vdir', { mod: bigMod, dir: 'zbig', off: -1, lim: 5 }), 400, /off/, 'nomax vdir: a bad off is refused');

    // tree: whole, then in pages
    t0 = Date.now();
    const tw = await g2('tree', { mod: bigMod });
    const tT = Date.now() - t0, tRels = tw.files.map(f => f.rel);
    ok(tw.files.length === NB + 1 && tw.total === NB + 1 && tw.next === null && tw.done === true && tw.truncated === false && tw.unread === 0 && tRels[0] === 'mod.info' &&
      tRels[1] === 'resource/zbig/' + nm(1) && tRels[NB] === 'resource/zbig/' + nm(NB) && tw.files[1].state === 'new' && tw.files[0].state === 'modinfo', 'nomax tree whole (no lim): ' + tw.files.length + ' rows, total ' + tw.total);
    let tFirst = null;
    {
      const got = [], vers = new Set(); let off = 0, ver = null, g = 0, last = null;
      t0 = Date.now();
      do { const r = await g2('tree', Object.assign({ mod: bigMod, off, lim: 4000 }, ver ? { ver } : {})); if (tFirst == null) tFirst = Date.now() - t0; ver = r.ver; vers.add(r.ver); got.push(...r.files.map(f => f.rel)); last = r; off = r.next; } while (off != null && g++ < 40);
      ok(got.join('|') === tRels.join('|') && vers.size === 1 && last.total === NB + 1 && last.done === true, 'nomax tree in pages of 4000: the same rows in the same order, total on the last page ' + last.total);
    }

    // vfind
    t0 = Date.now();
    const f1 = await g2('vfind', { mod: bigMod, q: 'u1' });
    const tF = Date.now() - t0;
    ok(f1.total === 10000 && f1.hits.length === 10000 && f1.hits[0].name === 'zbig/u10000.set' && f1.hits[9999].name === 'zbig/u19999.set' && f1.hits.every(x => x.where === 'mine') && f1.truncated === false, 'nomax vfind whole (no lim): 10000 hits ' + f1.total);
    const f2 = await g2('vfind', { mod: bigMod, q: 'RESOURCE/ZBIG/U29', off: 500, lim: 500 });
    ok(f2.total === 1000 && f2.hits.length === 500 && f2.off === 500 && f2.next === null && f2.ver && f2.hits[499].key === 'resource/zbig/u29999.set', 'nomax vfind page 2 of a typed path (case and resource/ do not matter) ' + JSON.stringify([f2.total, f2.off, f2.next]));
    const f3 = await g2('vfind', { mod: bigMod, q: 'zbig/u29', off: 0, lim: 500, ver: f2.ver });
    ok(f3.ver === f2.ver && f3.hits.length === 500 && f3.next === 500, 'nomax vfind: page 1 with the stamp comes from the same list');
    await rejects(() => g2('vfind', { mod: bigMod, q: '' }), 400, /q:/, 'nomax vfind: an empty word is refused');
    // (fix pass) a stamp belongs to one list: another folder, or a stamp of a search, gives that folder's own rows under a new stamp
    {
      const vz = await g2('vdir', { mod: bigMod, dir: 'zbig', off: 0, lim: 10 });
      const vx = await g2('vdir', { mod: bigMod, dir: '', off: 1, lim: 5, ver: vz.ver });
      const vy = await g2('vdir', { mod: bigMod, dir: 'zbig', off: 5, lim: 5, ver: f2.ver });
      const vroot = await g2('vdir', { mod: bigMod, dir: '' }), rowsOf = r => r.dirs.concat(r.files.map(f => f.name));
      ok(vx.ver !== vz.ver && vx.total === vroot.total && rowsOf(vx).join() === rowsOf(vroot).slice(1, 6).join() && vy.ver !== f2.ver && vy.files.length === 5 && vy.files[0].name === nm(6),
        'nomax: a stamp of one list never serves another list ' + JSON.stringify([vx.ver !== vz.ver, rowsOf(vx), vy.ver !== f2.ver, vy.files[0] && vy.files[0].name]));
    }
    // the first page of a fresh tree walk answers before the walk ends; while it runs, other folders and filter words asked meanwhile
    // (more lists than the store keeps) do not throw it away, nor a folder still being read
    {
      const tp = await g2('tree', { mod: bigMod, off: 0, lim: 2000 });
      ok(tp.done === false && tp.total === null && tp.next === 2000 && tp.files.length === 2000, 'nomax tree: the first page comes before the walk ends ' + JSON.stringify([tp.done, tp.total, tp.next]));
      const vk = await g2('vdir', { mod: bigMod, dir: 'zbig', off: 0, lim: 1000 });
      for (let i = 0; i < 9; i++) { await g2('vdir', { mod: bigMod, dir: i % 2 ? 'entity' : '', off: 0, lim: 1000 }); await g2('vfind', { mod: bigMod, q: 'u' + (i + 1), off: 0, lim: 500 }); }
      const tp2 = await g2('tree', { mod: bigMod, off: 2000, lim: 2000, ver: tp.ver }), vk2 = await g2('vdir', { mod: bigMod, dir: 'zbig', off: 1000, lim: 1000, ver: vk.ver });
      ok(tp2.ver === tp.ver && tp2.off === 2000 && tp2.files.length === 2000 && tp2.files[0].rel === tRels[2000] && vk2.ver === vk.ver && vk2.files[0].name === nm(1001),
        'nomax: 18 other lists asked meanwhile keep the tree walk and the folder being read (same stamps) ' + JSON.stringify([tp2.ver === tp.ver, vk2.ver === vk.ver]));
    }
    // a mod outside the game folder (not in the index): its loose files are listed without a stat per file, sizes only for the page
    {
      const om = path.join(work, 'outside', 'om');
      wr(path.join(om, 'mod.info'), '{mod {name "Out"}}\r\n'); fs.mkdirSync(path.join(om, 'resource'), { recursive: true });
      // the 30,000 files are moved there for these two asks (a rename, no copy) and moved back after
      const zout = path.join(om, 'resource', 'zout');
      let moved = false; try { fs.renameSync(zdir, zout); moved = true; } catch { moved = false; }
      if (!moved) skip('nomax outside mod timing', 'the folder could not be moved');
      else try {
        // speed guards (no stat per file): 2 s was the budget; a busy PC gets 10 s and one more run before it fails (WT.fast)
        let od = null, of = null;
        const fOd = await WT.fast(async () => { od = await g2('vdir', { mod: om, dir: 'zout', off: 0, lim: 1000 }); }, 10000, { who: 'ide test', what: 'outside mod vdir first page' }), tOd = fOd.ms;
        const fOf = await WT.fast(async () => { of = await g2('vfind', { mod: om, q: 'zout/u29', off: 0, lim: 500 }); }, 10000, { who: 'ide test', what: 'outside mod vfind' }), tOf = fOf.ms;
        ok(od.total === NB && od.files.length === 1000 && od.files[0].name === nm(1) && od.files[0].where === 'mine' && od.files[0].size === 0 && !('_f' in od.files[0]) && fOd.ok,
          'nomax outside mod: vdir first page of ' + od.total + ' loose files in ' + tOd + ' ms, sizes on the page');
        ok(of.total === 1000 && of.hits.length === 500 && of.hits[0].where === 'mine' && of.hits[0].size === 0 && fOf.ok, 'nomax outside mod: vfind over the loose files in ' + tOf + ' ms, total ' + of.total);
        console.log('timing: outside mod vdir first page ' + tOd + ' ms, vfind ' + tOf + ' ms');
      } finally { fs.renameSync(zout, zdir); }
      fs.rmSync(path.join(work, 'outside'), { recursive: true, force: true });
    }
    console.log('timing: make ' + NB + ' files ' + tMake + ' ms; listing: vdir whole ' + tV + ' ms, tree whole ' + tT + ' ms, tree first page ' + tFirst + ' ms; vfind whole ' + tF + ' ms');

    // the page
    const BM = bigMod.replace(/\\/g, '/');
    const bigApi = req => (/^\/api\/x\/ide\/(tree|vdir|vfind)$/.test(req.path) ? R['GET ' + req.path](U(req.path, req.q), null, ctx2) : undefined);
    const lsOpen = { 'ide.x.mode': 'mod', ['ide.x.open.' + BM]: { 'resource/zbig': true }, ['ide.x.gopen.' + BM]: { zbig: true } };
    const page = async o => {
      o = Object.assign({ mod: BM, api: bigApi, ls: lsOpen }, o, { show: false });
      const P = await boot(o);
      P.bx.IDE_XTEST = o.xt || {};
      P.St.mod = o.mod; P.bx.as2Link('page:ide');
      const ex = () => P.B('explorer'), body = () => ex().all().find(e => cl(e, 'idx-body'));
      const X = () => { const r = ex() && ex().all().find(e => cl(e, 'idx')); return (r && r.idxApi) || null; };
      const items = () => body().children.filter(e => cl(e, 'idx-item'));
      return { P, X, st: () => X().state(), ex, body, items, names: () => items().map(e => { const n = e.all().find(x => cl(x, 'idx-name')); return n ? n.textContent : ''; }),
        key: k => body().fire('keydown', { key: k }), filt: () => ex().all().find(e => cl(e, 'idx-filter')) };
    };
    // run the page timers until c() holds; the routes answer on real I/O, so the wait is in time, not in rounds. Backup, never a hang:
    // at least 60 s, then WAIT on stderr and false (the check after it reports what is missing)
    const until = async (P, c, ms) => { const lim = Math.max(ms || 0, WT.COND_MS), end = Date.now() + lim; for (;;) { let v = false; try { v = c(); } catch { v = false; } if (v) return true; if (Date.now() > end) { WT.say('ide test', String(c).slice(0, 120), lim); return false; } await P.flush(); await new Promise(r => setTimeout(r, 1)); } };
    t0 = Date.now();
    const A = await page({});
    await until(A.P, () => A.X() && A.st().rows > 3);
    const tRows = Date.now() - t0;
    await until(A.P, () => A.st().tree && !A.st().tree.more);
    const tAll = Date.now() - t0;
    let s = A.st();
    ok(s.mode === 'mod' && s.rows === NB + 3 && s.tree.files === NB + 1 && s.mounted < 100 && A.items().length < 100 && A.items().length > 10, 'nomax page: the whole mod listed (' + s.rows + ' rows), only ' + A.items().length + ' drawn');
    ok(!A.ex().all().some(e => cl(e, 'idx-warn')) && A.ex().textContent.includes('Files: ' + (NB + 1)), 'nomax page: no "cut short" warning, the count says ' + (NB + 1));
    A.key('End'); await A.P.flush();
    ok(A.st().sel === 'm:mod.info' && A.items().some(e => e.textContent.includes('mod.info')), 'nomax page: End selects and shows the last row ' + A.st().sel);
    A.key('ArrowUp'); await A.P.flush();
    ok(A.st().sel === 'm:resource/zbig/' + nm(NB) && A.names().includes(nm(NB)),'nomax page: the row before it is the last file ' + A.st().sel);
    A.key('Home'); await A.P.flush();
    ok(A.st().sel === 'm:resource' && A.st().geo.a === 0, 'nomax page: Home goes back to the first row');
    A.key('PageDown'); await A.P.flush();
    ok(/^m:resource\/zbig\/u000/.test(A.st().sel), 'nomax page: PageDown moves a screen ' + A.st().sel);

    // the filter over 30,000 names (my mod: in slices on the page)
    t0 = Date.now();
    A.filt().value = 'u1'; A.filt().fire('input', {});
    await until(A.P, () => { const f = A.st().filter; return f && f.w === 'u1' && f.done; });
    const tFilt = Date.now() - t0;
    s = A.st();
    ok(s.flat && s.filter.n === 10000 && s.rows === 10000 && s.mounted < 100 && A.ex().textContent.includes('Matches: 10000'), 'nomax filter: u1 finds 10000 (old cap 500), ' + s.mounted + ' drawn');
    A.key('End'); await A.P.flush();
    ok(A.st().sel === 'm:resource/zbig/u19999.set' && A.names().includes('resource/zbig/u19999.set'),'nomax filter: End reaches hit 10000 ' + A.st().sel);
    // a second keystroke stops the first look (slices of one step, the page timers run one round at a time)
    const XT = A.P.bx.IDE_XTEST, round = () => A.P.timers.splice(0).forEach(t => { try { t.f(); } catch { /* page timers */ } });
    A.filt().value = ''; A.filt().fire('input', {}); await A.P.flush();
    XT.slice = 0;
    A.filt().value = 'u1'; A.filt().fire('input', {}); round();
    const busy = A.ex().all().some(e => cl(e, 'idx-busy') && /Still looking/.test(e.textContent));
    A.filt().value = 'u2'; A.filt().fire('input', {}); round();
    await until(A.P, () => { const f = A.st().filter; return f && f.w === 'u2' && f.done; });
    const js = A.st().jobs, ju1 = js.filter(j => j.w === 'u1').pop(), ju2 = js[js.length - 1];
    ok(busy && ju1 && ju1.dead && !ju1.done && ju1.scanned < NB && ju2.w === 'u2' && ju2.done && ju2.n === 10000 && A.st().rows === 10000, 'nomax filter: "still looking" shows, a new word stops the old look ' + JSON.stringify(ju1) + ' ' + JSON.stringify(ju2));
    delete XT.slice;
    A.filt().value = ''; A.filt().fire('input', {}); await A.P.flush();
    ok(!A.st().flat && A.st().rows === NB + 3, 'nomax filter: cleared, the tree is back');

    // the game view: the 30,000-file folder in pages, then a server search
    A.ex().all().filter(e => cl(e, 'idx-tab'))[1].click();
    await until(A.P, () => { const x = A.st(); return x.mode === 'game' && x.loads === 0 && x.rows >= NB + 2; });
    s = A.st();
    ok(s.mode === 'game' && s.rows === NB + 2 && s.mounted < 100, 'nomax game view: the folder listed whole (' + s.rows + ' rows), ' + s.mounted + ' drawn');
    A.key('End'); await A.P.flush();
    ok(A.st().sel === 'g:resource/zbig/' + nm(NB), 'nomax game view: End reaches the last file ' + A.st().sel);
    A.filt().value = 'u29'; A.filt().fire('input', {});
    await until(A.P, () => { const f = A.st().filter; return f && f.kind === 'g' && f.done; });
    s = A.st();
    const vfa = () => A.P.asked.filter(a => a.path === '/api/x/ide/vfind');
    ok(s.flat && s.filter.n === 1000 && s.rows === 1000 && vfa().length === 1 && vfa()[0].q.lim === '500' && A.ex().textContent.includes('Matches: 1000'), 'nomax game filter: the server finds 1000, one page of 500 asked ' + vfa().length);
    A.key('End');
    await until(A.P, () => A.st().sel === 'g:resource/zbig/u29999.set', 10000);
    ok(A.st().sel === 'g:resource/zbig/u29999.set' && vfa().length === 2 && vfa()[1].q.off === '500' && !!vfa()[1].q.ver,'nomax game filter: End asks the last page and selects its last row ' + A.st().sel);

    // above the scaled height (limpx made small here): the scroll position is scaled, the last row is still reached
    const S2 = await page({ xt: { limpx: 100000 } });
    await until(S2.P, () => S2.X() && S2.st().tree && !S2.st().tree.more && S2.st().rows === NB + 3);
    let g = S2.st().geo;
    ok(g.scaled && g.height === 100000, 'nomax scaled: ' + (NB + 3) * 20 + ' px of rows in a 100000 px scroll ' + JSON.stringify(g));
    S2.key('End'); await S2.P.flush();
    g = S2.st().geo;
    const sp = S2.body().children.filter(e => cl(e, 'idx-sp')).map(e => parseInt(e.style.height, 10) || 0);
    ok(S2.st().sel === 'm:mod.info' && g.b === NB + 3 && S2.body().scrollTop <= 100000 && S2.items().some(e => e.textContent.includes('mod.info')) && sp[0] + (g.b - g.a) * 20 + sp[1] === 100000,
      'nomax scaled: End reaches the last row, the spacers keep the height ' + JSON.stringify([g, sp, S2.body().scrollTop]));
    S2.body().scrollTop = 50000 - 300; S2.body().fire('scroll');
    g = S2.st().geo;
    ok(g.a > 14000 && g.a < 16000 && S2.names().includes(nm(g.a + 10 - 1)),'nomax scaled: half way down shows the middle rows ' + JSON.stringify(g));

    // a server or a phone without the paged route: the page falls back to files/tree
    const FB = await page({ mod: 'C:/g/mods/mine', ls: {}, files: { 'mod.info': '{m}', 'resource/a.set': '{a}' }, api: req => (req.path === '/api/x/ide/tree' ? Object.assign(new Error('not allowed'), { status: 403 }) : undefined) });
    await until(FB.P, () => FB.X() && FB.st().tree);
    ok(FB.st().tree && FB.st().tree.files === 2 && FB.P.asked.some(a => a.path === '/api/x/files/tree'), 'nomax: a refused tree route falls back to files/tree');

    // ---- (Go to file, no file maximum) Ctrl+P lists the mod from the Editor's own paged tree (GET ide/tree), not from files/tree (8000
    // at most): rows show from the first page while the rest is read, a file far past 8000 is found, the box says how many match in all
    // and draws at most 300; the explorer's whole list is used when it holds one (nothing read twice); a refused ide/tree falls back to
    // files/tree; a second keystroke stops the first run
    {
      const ov = Pg => { const o = Pg.P.sec.all().find(e => cl(e, 'ide-ov')); return o && !o.hidden && o.children.length ? o : null; };
      const gInp = Pg => ov(Pg).all().find(e => e.tagName === 'INPUT');
      const gRows = Pg => ov(Pg).all().filter(e => cl(e, 'ide-pick-it'));
      const gLine = Pg => { const l = ov(Pg) && ov(Pg).all().find(e => e.getAttribute('aria-live') === 'polite'); return l ? l.textContent : ''; };
      const gLast = Pg => Pg.P.IDE.goFileState().slice(-1)[0] || null;
      const gType = (Pg, w) => { const i = gInp(Pg); i.value = w; i.fire('input', {}); };
      const fz = (q, s) => { if (s.includes(q)) return true; let j = 0; for (let k = 0; k < s.length && j < q.length; k++) if (s[k] === q[j]) j++; return j === q.length; };
      const far = 'resource/zbig/u29999.set', farAt = tRels.indexOf(far);
      // 1. the explorer shows the game view (it holds no mod list): Go to file reads ide/tree itself; its second page is held back a while
      let hold = null; const held = new Promise(r => { hold = r; });
      const G = await page({ ls: Object.assign({}, lsOpen, { 'ide.x.mode': 'game' }),
        api: async req => { if (req.path === '/api/x/ide/tree' && req.q.off && req.q.off !== '0') await held; return bigApi(req); } });
      await until(G.P, () => G.X() && G.st().mode === 'game');
      const a0 = G.P.asked.length, trees = () => G.P.asked.slice(a0).filter(a => a.path === '/api/x/ide/tree');
      G.P.IDE.run('gofile');
      await until(G.P, () => ov(G) && gLast(G) && gLast(G).n === 2000 && /Still reading/.test(gLine(G)), 10000);
      ok(ov(G) && gRows(G).length === 300 && gLine(G).includes('Still reading the file list: 2000 files so far.') && gLine(G).includes('Matches: 2000. The best 300 are shown') && trees().length === 2 && trees()[0].q.lim === '2000',
        'go to file: rows from the first page show while the rest is read ' + JSON.stringify([gRows(G).length, gLine(G), trees().map(a => a.q)]));
      gType(G, 'u29999'); await G.P.flush();
      ok(gRows(G).length === 0 && !gLast(G).done && !/Nothing matches/.test(ov(G).textContent), 'go to file: a word not in the first page waits for the rest, no "nothing matches" yet');
      hold();
      await until(G.P, () => gLast(G) && gLast(G).w === 'u29999' && gLast(G).done);
      ok(farAt > 8000 && gRows(G).length === 1 && gRows(G)[0].textContent.includes(far) && gLine(G) === 'Matches: 1' && trees().length === 3 && trees()[1].q.off === '2000' && trees()[1].q.ver &&
        trees()[2].q.ver === trees()[1].q.ver && !G.P.asked.some(a => a.path === '/api/x/files/tree'),
        'go to file: ' + far + ' (row ' + farAt + ', past 8000) is found from ide/tree in pages with the stamp, files/tree not asked ' + JSON.stringify(trees().map(a => [a.q.off, a.q.lim, !!a.q.ver])));
      let opened = null; const realOpen = G.P.IDE.open; G.P.IDE.open = ref => { opened = ref; return Promise.resolve(null); };
      gInp(G).fire('keydown', { key: 'Enter' });
      G.P.IDE.open = realOpen;
      ok(opened && opened.rel === far && !ov(G), 'go to file: Enter opens it and closes the box ' + JSON.stringify(opened));
      // a second keystroke stops the first run (slices of 512 names: the first run has done one slice when the second word comes)
      G.P.bx.IDE_XTEST.gfslice = 0;
      G.P.IDE.run('gofile');
      await until(G.P, () => gLast(G) && gLast(G).done);
      ok(gLast(G).n === NB + 1 && gRows(G).length === 300 && gLine(G).includes('Matches: ' + (NB + 1) + '. The best 300') && trees().length === 3, 'go to file: no word lists all ' + (NB + 1) + ' (300 drawn), the list read once is used again');
      gType(G, 'u1');
      gType(G, 'u29999');
      await until(G.P, () => gLast(G).w === 'u29999' && gLast(G).done);
      const runs = G.P.IDE.goFileState(), r1 = runs.filter(r => r.w === 'u1').pop(), r2 = runs[runs.length - 1];
      ok(r1 && r1.dead && !r1.done && r1.scanned === 512 && r2.done && r2.n === 1 && gRows(G).length === 1, 'go to file: a second keystroke stops the first run ' + JSON.stringify([r1, r2]));
      delete G.P.bx.IDE_XTEST.gfslice;
      const want1 = tRels.filter(r => fz('u1', r.toLowerCase())).length;
      gType(G, 'u1');
      await until(G.P, () => gLast(G).w === 'u1' && gLast(G).done);
      ok(gLast(G).n === want1 && gRows(G).length === 300 && gLine(G).includes('Matches: ' + want1 + '.') && gRows(G)[0].textContent.includes('resource/zbig/u1'),
        'go to file: u1 says the true number of matches (' + want1 + '), 300 drawn, the best first ' + (gRows(G)[0] && gRows(G)[0].textContent));
      // 2. the explorer holds the whole list of this mod: Go to file uses it and reads nothing
      const n2 = S2.P.asked.filter(a => /^\/api\/x\/(ide|files)\/tree$/.test(a.path)).length;
      S2.P.IDE.run('gofile'); gType(S2, 'u29999');
      await until(S2.P, () => gLast(S2) && gLast(S2).w === 'u29999' && gLast(S2).done);
      ok(gRows(S2).length === 1 && gRows(S2)[0].textContent.includes(far) && S2.P.asked.filter(a => /^\/api\/x\/(ide|files)\/tree$/.test(a.path)).length === n2, 'go to file: the explorer\'s whole list is used, no tree read again');
      // 3. a server or phone without ide/tree (404): Go to file falls back to files/tree
      const NF = await page({ ls: { 'ide.x.mode': 'game' }, files: { 'mod.info': '{m}', 'resource/a.set': '{a}' },
        api: req => (req.path === '/api/x/ide/tree' ? Object.assign(new Error('no such route'), { status: 404 }) : bigApi(req)) });
      await until(NF.P, () => NF.X() && NF.st().mode === 'game');
      NF.P.IDE.run('gofile');
      await until(NF.P, () => gLast(NF) && gLast(NF).done);
      gType(NF, 'a.set');
      await until(NF.P, () => gLast(NF).w === 'a.set' && gLast(NF).done);
      ok(gRows(NF).length === 1 && gRows(NF)[0].textContent.includes('resource/a.set') && NF.P.asked.filter(a => a.path === '/api/x/ide/tree').length === 1 && NF.P.asked.some(a => a.path === '/api/x/files/tree'),
        'go to file: ide/tree answers 404, files/tree is read instead ' + JSON.stringify(NF.P.asked.filter(a => /tree$/.test(a.path)).map(a => a.path)));
    }

    // ---- (fix pass) the page with made-up paged answers: a list whose stamp changes starts again once, then says so with Try again;
    // an open context menu stays open while pages arrive; '$' is a plain letter in the filter; type-ahead in a filtered list matches
    // the file name; a game folder still arriving is marked busy and counted in the info line; a late answer from before a restart is dropped
    {
      const FM = 'C:/g/mods/mine', fr = rel => ({ rel, size: 1, state: 'new', key: /^resource\//.test(rel) ? rel : null });
      const gf = (name, dir) => ({ name, key: 'resource/' + (dir ? dir + '/' : '') + name, where: 'vanilla', layer: 0, size: 1 });
      const later = () => { let res; const p = new Promise(r => { res = r; }); return { p, go: v => res(v) }; };
      const asks = (Pg, p) => Pg.P.asked.filter(a => a.path === p).map(a => (a.q.off || '0') + (a.q.ver ? '@' + a.q.ver : ''));
      const retryBtn = Pg => Pg.ex().all().find(e => cl(e, 'idx-mini') && e.textContent === 'Try again');
      const xmenuOf = Pg => Pg.P.doc.body.children.find(e => cl(e, 'idx-menu'));
      // 1. the mod tree: every second page answers a new stamp -> one restart (page 0 asked again with no stamp), then 'changed'
      {
        let k = 0;
        const T = await page({ mod: FM, ls: {}, api: req => {
          if (req.path !== '/api/x/ide/tree') return undefined;
          if (!+req.q.off) return { mod: FM, files: [fr('mod.info'), fr('resource/a.set')], total: null, off: 0, next: 2, ver: 'v' + (++k), done: false, unread: 0, notes: [] };
          return { mod: FM, files: [fr('resource/b.set')], total: 3, off: 2, next: null, ver: 'x' + (++k), done: true, unread: 0, notes: [] };
        } });
        await until(T.P, () => T.X() && T.st().tree && T.st().tree.partial === 'changed', 5000);
        ok(asks(T, '/api/x/ide/tree').join() === '0,2@v1,0,2@v3' && T.st().tree.partial === 'changed' && /Files changed while the list was read/.test(T.ex().textContent) && !!retryBtn(T),
          'fix tree: a changed stamp starts the list again once, the second change says so with Try again ' + asks(T, '/api/x/ide/tree').join());
      }
      // 2. the context menu opened while page 2 of the tree is on its way stays open, focus in it, when the page lands; then the filter
      // with '$' and type-ahead by file name over the whole list
      {
        const hold = later();
        const T = await page({ mod: FM, ls: {}, api: req => {
          if (req.path !== '/api/x/ide/tree') return undefined;
          if (!+req.q.off) return { mod: FM, files: [fr('mod.info'), fr('resource/a.set'), fr('resource/zz/b.set')], total: null, off: 0, next: 3, ver: 'T', done: false, unread: 0, notes: [] };
          return hold.p;
        } });
        await until(T.P, () => T.X() && T.st().tree && T.st().tree.files === 3, 5000);
        T.key('Home'); T.key('ArrowDown'); T.key('ContextMenu');
        const m = xmenuOf(T), inMenu = () => { let e = T.P.doc.activeElement; while (e) { if (e === m) return true; e = e.parentNode; } return false; };
        const open1 = !!m && !m.hidden && inMenu();
        hold.go({ mod: FM, files: [fr('resource/b$c.set'), fr('resource/zz/u20001.set')], total: 5, off: 3, next: null, ver: 'T', done: true, unread: 0, notes: [] });
        await until(T.P, () => T.st().tree && !T.st().tree.more, 5000);
        ok(open1 && T.st().tree.files === 5 && !m.hidden && inMenu(), 'fix menu: the explorer menu stays open with its focus while a tree page lands ' + JSON.stringify([open1, !m.hidden, inMenu()]));
        m.fire('keydown', { key: 'Escape' });
        const filt = async w => { T.filt().value = w; T.filt().fire('input', {}); await until(T.P, () => { const f = T.st().filter; return f && f.w === w && f.done; }, 5000); return T.st().filter.n; };
        const nD = await filt('$'), nB = await filt('b$c');
        ok(nD === 1 && nB === 1 && T.names().join() === 'resource/b$c.set', 'fix filter: "$" is a plain letter (' + nD + ' and ' + nB + ' hits)');
        await filt('set');
        T.key('Home'); T.key('u');
        ok(T.st().sel === 'm:resource/zz/u20001.set', 'fix type-ahead: in a filtered list a letter finds the file name, not only the path start ' + T.st().sel);
      }
      // 3. a game folder whose second page answers a new stamp each time: one restart, then the note and Try again in the info line;
      // Try again reads the folder again
      {
        let k = 0;
        const G3 = await page({ mod: FM, ls: { 'ide.x.mode': 'game' }, api: req => {
          if (req.path !== '/api/x/ide/vdir') return undefined;
          if (!+req.q.off) return { dir: '', dirs: ['d1'], files: [], truncated: false, total: 2, off: 0, next: 1, ver: 'g' + (++k) };
          return { dir: '', dirs: [], files: [gf('f.set', '')], truncated: false, total: 2, off: 1, next: null, ver: 'h' + (++k) };
        } });
        await until(G3.P, () => G3.X() && G3.st().loads === 0 && /Files changed while the list was read/.test(G3.ex().textContent), 5000);
        const a1 = asks(G3, '/api/x/ide/vdir').join(), rb = retryBtn(G3);
        ok(a1 === '0,1@g1,0,1@g3' && !!rb, 'fix game folder: a changed stamp starts the folder again once, then the info line says so with Try again ' + a1);
        if (rb) { rb.click(); await G3.P.flush(); }
        ok(asks(G3, '/api/x/ide/vdir').length > 4, 'fix game folder: Try again reads the folder again ' + asks(G3, '/api/x/ide/vdir').join());
      }
      // 4. a game folder still arriving: its row is aria-busy and the info line counts it; both go when the folder is whole
      {
        const hold = later();
        const G4 = await page({ mod: FM, ls: { 'ide.x.mode': 'game', ['ide.x.gopen.' + FM]: { big: true } }, api: req => {
          if (req.path !== '/api/x/ide/vdir') return undefined;
          if (req.q.dir === 'big') return !+req.q.off ? { dir: 'big', dirs: [], files: [gf('f1.set', 'big')], truncated: false, total: 3, off: 0, next: 1, ver: 'B' } : hold.p;
          return { dir: '', dirs: ['big'], files: [gf('top.set', '')], truncated: false, total: 2, off: 0, next: null, ver: 'R' };
        } });
        await until(G4.P, () => G4.X() && G4.st().rows >= 3 && /Still listing this folder: 1 of 3/.test(G4.ex().textContent), 5000);
        const bigRow = () => G4.items().find(e => e.getAttribute('aria-expanded') !== null);
        const busy1 = bigRow() && bigRow().getAttribute('aria-busy'), info1 = /Still listing this folder: 1 of 3/.test(G4.ex().all().find(e => cl(e, 'idx-info')).textContent);
        hold.go({ dir: 'big', dirs: [], files: [gf('f2.set', 'big'), gf('f3.set', 'big')], truncated: false, total: 3, off: 1, next: null, ver: 'B' });
        await until(G4.P, () => G4.st().loads === 0 && G4.st().rows === 5, 5000);
        ok(busy1 === 'true' && info1 && bigRow().getAttribute('aria-busy') !== 'true' && !/Still listing/.test(G4.ex().textContent),
          'fix game folder: a folder still arriving is aria-busy and counted in the info line, both go when it is whole ' + JSON.stringify([busy1, info1, bigRow().getAttribute('aria-busy')]));
      }
      // 5. the game search: page 2 answers a new stamp -> one restart; an answer asked before the restart and landing after it is dropped
      // (no false "changed"); the next change says so with Try again
      {
        const N5 = 2010;
        let k = 0, held = null, restarted = false, changeNext = false;
        const hits = (a, n) => Array.from({ length: n }, (_, i) => gf('u' + String(a + i).padStart(5, '0') + '.set', 'zbig')).map(x => Object.assign(x, { name: 'zbig/' + x.name }));
        const ans = (off, ver) => ({ q: 'u', hits: hits(off, Math.min(500, N5 - off)), total: N5, off, next: off + 500 < N5 ? off + 500 : null, ver, truncated: false });
        const G5 = await page({ mod: FM, ls: { 'ide.x.mode': 'game' }, api: req => {
          if (req.path === '/api/x/ide/vdir') return { dir: '', dirs: ['zbig'], files: [], truncated: false, total: 1, off: 0, next: null, ver: 'R' };
          if (req.path !== '/api/x/ide/vfind') return undefined;
          const off = +req.q.off || 0, v = req.q.ver;
          if (!off) return ans(0, 'F' + (++k));
          if (off === 1500 && !held) { held = later(); return held.p.then(() => ans(off, v)); }   // asked before the restart, lands after it
          if (off === 2000 && !restarted) { restarted = true; return ans(off, 'N' + (++k)); }   // the first change: the search starts again
          return ans(off, changeNext ? 'N' + (++k) : v);
        } });
        await until(G5.P, () => G5.X() && G5.st().loads === 0, 5000);
        G5.filt().value = 'u'; G5.filt().fire('input', {});
        await until(G5.P, () => { const f = G5.st().filter; return f && f.kind === 'g' && f.done; }, 5000);
        G5.key('End');   // rows 1972..2010 in view: page 4 (a new stamp -> restart) and page 3 (held)
        await until(G5.P, () => { const a = asks(G5, '/api/x/ide/vfind'), f = G5.st().filter; return a.filter(x => x === '0').length === 2 && f && f.done && a.includes('2000@F3'); }, 5000);
        if (held) held.go(); await G5.P.flush(); await G5.P.flush();
        const a5 = asks(G5, '/api/x/ide/vfind'), falseWarn = /Files changed while the list was read/.test(G5.ex().textContent);
        ok(!!held && a5[0] === '0' && a5.includes('2000@F1') && a5.includes('1500@F1') && a5.filter(x => x === '0').length === 2 && !falseWarn,
          'fix game search: a changed stamp starts the search again once; an answer from before the restart is dropped ' + a5.join() + ' ' + falseWarn);
        changeNext = true;
        G5.body().scrollTop = 1000 * 20; G5.body().fire('scroll');   // pages 1 and 2, not read yet, now answer a new stamp
        await until(G5.P, () => /Files changed while the list was read/.test(G5.ex().textContent), 5000);
        ok(/Files changed while the list was read/.test(G5.ex().textContent) && !!retryBtn(G5), 'fix game search: the second change says so, with Try again ' + asks(G5, '/api/x/ide/vfind').join());
      }
    }
    console.log('timing: page first rows ' + tRows + ' ms, whole list ' + tAll + ' ms, filter u1 over ' + (NB + 1) + ' names ' + tFilt + ' ms');

    // ---- (integration, 2026-11-14) the shell's toolbar menus, favourites bar and full screen with the explorer's 30,000-file list on one
    // page: one menu open at a time across the two parts, the Esc order, a run from a menu, two favourites kept over a reboot with the
    // same store, full screen on and off twice with the windowed list taking the new height, End and the filter in full screen.
    {
      const W = await page({});
      await until(W.P, () => W.X() && W.st().tree && !W.st().tree.more && W.st().rows === NB + 3);
      const P = W.P, sec = P.sec;
      const mb = g => P.B('tb.' + g).all().find(e => cl(e, 'ide-mb')), menu = g => P.B('tb.' + g).all().find(e => cl(e, 'ide-menu'));
      const item = id => sec.all().find(e => cl(e, 'ide-mi') && e.dataset && e.dataset.act === id) || null;
      const favs = PP => PP.B('tb.fav').all().filter(e => e.dataset && e.dataset.fav).map(e => e.dataset.fav);
      const xmenu = () => P.doc.body.children.find(e => cl(e, 'idx-menu'));
      const ov = () => sec.all().find(e => cl(e, 'ide-ov'));
      const treeRow = () => W.items().find(e => e.getAttribute('role') === 'treeitem');
      // a toolbar menu, then a right click in the explorer: the toolbar menu closes (mousedown outside), the explorer menu opens
      mb('jump').click();
      ok(!menu('jump').hidden && mb('jump').getAttribute('aria-expanded') === 'true', 'walk: the Jump menu opens');
      let r0 = treeRow();
      P.doc.fire('mousedown', { target: r0, button: 2 }); W.body().fire('contextmenu', { target: r0, clientX: 20, clientY: 30 });
      ok(menu('jump').hidden && mb('jump').getAttribute('aria-expanded') === 'false' && xmenu() && !xmenu().hidden, 'walk: a right click in the explorer closes the toolbar menu and opens the explorer menu (one at a time)');
      // a toolbar menu opened while the explorer menu is up: the explorer menu closes
      P.doc.fire('mousedown', { target: mb('file'), button: 0 }); mb('file').click();
      ok(xmenu().hidden && !menu('file').hidden, 'walk: a toolbar menu opened over the explorer menu closes it');
      P.doc.key('Escape');
      ok(menu('file').hidden && P.doc.activeElement === mb('file'), 'walk: Esc closes the toolbar menu, focus back on its button');
      // run an action from a menu: More > Keys (F2) shows the key list; the new keys are listed once each
      mb('other').click(); item('keys').click(); await P.flush();
      const kbd = ov() && !ov().hidden ? ov().all().filter(e => e.tagName === 'KBD').map(e => e.textContent) : [];
      const once = k => kbd.filter(x => x === k).length === 1;
      ok(menu('other').hidden && kbd.length > 10 && once('Alt+Enter') && once('F2') && once('Ctrl+D') && once('Shift+F10') && once('Esc') && kbd.length === new Set(kbd).size,
        'walk: More > Keys runs, the key list shows Alt+Enter, F2, Ctrl+D, Shift+F10 and Esc once each, no row twice ' + kbd.length);
      P.doc.key('Escape'); ok(ov().hidden, 'walk: Esc closes the key list');
      // two favourites: Full screen by the favourites menu (right click), Next log error (registered by the panels part) by Ctrl+D
      const before = favs(P);
      mb('other').click(); item('fullscreen').fire('contextmenu', { clientX: 30, clientY: 40 });
      const cm = sec.all().find(e => cl(e, 'ide-cmenu')), add = cm && cm.children.find(e => e.getAttribute && e.getAttribute('role') === 'menuitem');
      if (add) add.click();
      P.doc.key('Escape');
      mb('log').click(); const nle = item('nextLogError'); if (nle) { nle.focus(); menu('log').fire('keydown', { key: 'd', ctrlKey: true }); }
      P.doc.key('Escape');
      ok(nle && favs(P).join() === before.concat(['fullscreen', 'nextLogError']).join() && P.ls('ide.fav').join() === favs(P).join(), 'walk: two favourites added (one by right click, one by Ctrl+D on a part\'s action) and stored ' + favs(P).join());
      // reboot with the same store: the bar comes back
      const R2 = await boot({ mod: BM, api: bigApi, ls: Object.assign({}, lsOpen, { 'ide.fav': P.ls('ide.fav') }) });
      ok(favs(R2).join() === favs(P).join(), 'walk: after a reboot with the same store the favourites bar is the same ' + favs(R2).join());
      // full screen twice; the explorer list takes the new height each time (layout event), End and the filter work in full screen
      const fsb = P.B('tb.full').all().find(e => cl(e, 'ide-fsb'));
      let fsOk = true, geoOk = true;
      for (let t = 0; t < 2; t++) {
        W.body().clientHeight = 1400; P.B('tb.fav').all().find(e => e.dataset && e.dataset.fav === 'fullscreen').click(); await P.flush();
        const gOn = W.st().geo;
        fsOk = fsOk && P.IDE.full() === true && cl(sec, 'ide-full') && fsb.getAttribute('aria-pressed') === 'true';
        geoOk = geoOk && gOn.view === 1400 && gOn.b - gOn.a >= Math.ceil(1400 / 20) && W.items().length >= 70;
        W.body().clientHeight = 600; fsb.click(); await P.flush();
        const gOff = W.st().geo;
        fsOk = fsOk && P.IDE.full() === false && !cl(sec, 'ide-full') && fsb.getAttribute('aria-pressed') === 'false';
        geoOk = geoOk && gOff.view === 600 && gOff.b - gOff.a < 70;
      }
      ok(fsOk, 'walk: full screen on and off twice (favourite, then the button)');
      ok(geoOk, 'walk: the explorer list draws the rows for the new height after each change ' + JSON.stringify(W.st().geo));
      W.body().clientHeight = 1400; P.IDE.full(true); await P.flush();
      W.key('End'); await P.flush();
      ok(P.IDE.full() === true && W.st().sel === 'm:mod.info' && W.items().some(e => e.textContent.includes('mod.info')), 'walk: End in full screen reaches the last of ' + (NB + 3) + ' rows');
      W.filt().value = 'u2'; W.filt().fire('input', {});
      await until(P, () => { const f = W.st().filter; return f && f.w === 'u2' && f.done; });
      ok(W.st().flat && W.st().filter.n === 10000 && W.st().mounted >= 70 && W.st().mounted < 120, 'walk: the filter in full screen finds 10000, draws the rows of the tall list ' + W.st().mounted);
      // Esc in the filter with text clears it (the explorer's), full screen stays; then the explorer menu takes Esc before full screen
      P.doc.key('Escape', { target: W.filt() });
      ok(P.IDE.full() === true, 'walk: Esc in the filter with text leaves full screen alone');
      W.filt().value = ''; W.filt().fire('input', {}); await P.flush();
      r0 = treeRow(); W.body().fire('contextmenu', { target: r0, clientX: 20, clientY: 30 });
      P.doc.key('Escape');
      ok(P.IDE.full() === true && !xmenu().hidden, 'walk: Esc with the explorer menu open leaves full screen alone (the menu takes it)');
      xmenu().fire('keydown', { key: 'Escape' }); P.doc.key('Escape');
      ok(xmenu().hidden && P.IDE.full() === false, 'walk: the explorer menu closes on its Esc, the next Esc leaves full screen');
    }
    fs.rmSync(big, { recursive: true, force: true });
    }   // made.ok
  }

  // ---- (kit) the Code Pieces page cases: tools/gui/ext/ide/test-kit.js, `module.exports = async function(env){}` (awaited; a throw is
  // FAIL crash). env (kitEnv above) = { ok(cond, msg), skip(msg, why) (this file's counters: every ok counts in the last line), has(rel)
  // (a file under tools/), work (this test's scratch dir), scratch(name) -> a fresh folder under it, TOOLS, G (tools/gui), IDE_DIR,
  // R (these routes), ctx (the fixture: game set, mod at <work>/game/mods/mine), get(name, q, ctx?), post(name, body, ctx?),
  // rejects(fn, status, re, msg), U(path, q) -> URL, fakedom, vm, blockcheck, remote (tools/gui/remote.js), kit(kind, lang, game?) ->
  // a copy of the real route answer, fakeEd(o) (the IDE_ED stand-in), boot(o) -> page P, PENDING }. fakeEd and boot are described at
  // their definitions above. Nothing here is written outside <work>, nothing is launched, no network.
  if (has('gui/ext/ide/test-kit.js')) await require('./test-kit')(kitEnv()); else skip('kit page cases (test-kit.js)', 'kit page part not built');
  if (has('gui/ext/ide/test-shell2.js')) await require('./test-shell2')(kitEnv()); else skip('shell toolbar, favourites, full screen (test-shell2.js)', 'not built');
  // (inc) inline include windows: route + page cases
  if (has('gui/ext/ide/test-inc.js')) await require('./test-inc')(kitEnv()); else skip('include windows (test-inc.js)', 'not built');
  if (has('gui/ext/ide/test-jump.js')) await require('./test-jump')(kitEnv()); else skip('mod-wide problems and jump trail (test-jump.js)', 'not built');
  if (has('gui/ext/ide/test-merged.js')) await require('./test-merged')(kitEnv()); else skip('open file location and game files in My mod (test-merged.js)', 'not built');
  if (has('gui/ext/ide/test-tabs.js')) await require('./test-tabs')(kitEnv()); else skip('close several tabs (test-tabs.js)', 'not built');
  if (has('gui/ext/ide/test-cache.js')) await require('./test-cache')(kitEnv()); else skip('caches in the shared store (test-cache.js)', 'not built');
  if (has('gui/ext/ide/test-joblist.js')) await require('./test-joblist')(kitEnv()); else skip('the Editor in the job list (test-joblist.js)', 'not built');
  // ---- game parity cases (AS64, MoW:AS2, GoH): tools/gui/ext/ide/test-games.js sets process.env and exits, so it runs as a child
  // process on its own fixture under <work>/games; its last line counts as one case here.
  if (has('gui/ext/ide/test-games.js')) {
    const r = WT.spawnSync(process.execPath, [path.join(__dirname, 'test-games.js'), path.join(work, 'games')], { encoding: 'utf8', timeout: 300000 }, 'ide test');
    const out = String(r.stdout || '') + String(r.stderr || ''), last = out.trim().split(/\r?\n/).pop() || '';
    if (r.status !== 0) console.log(out.trim());
    ok(r.status === 0 && /^ide games \d+ PASS$/.test(last), 'game parity cases (test-games.js): ' + last);
  } else skip('game parity cases (test-games.js)', 'not built');

  console.log('skipped: ' + (skipped.length ? skipped.join('; ') : 'none'));
  console.log(bad ? bad + ' of ' + n + ' failed' : 'ide ext ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
