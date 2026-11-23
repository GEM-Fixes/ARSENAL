// ide ext, game parity test (brief: the Editor routes and page parts under AS64, MoW:AS2 and GoH.
// Arg: scratch dir. Made-up fixture only: an AS2 install (as64.exe + mowas_2.exe) and a GoH install side by side in a fake Steam
// library, a GoH Workshop item, a GoH user folder with a stamped game.log. Nothing launched, no network, no real install read.
//   node tools/gui/ext/ide/test-games.js <scratch>
// Cases: ictx exe/game/gameDir per game (AS64 unchanged), list and mod caches keyed by game, same file elsewhere (GoH mods folder,
// Workshop app 400750, mod_<item> names, AS2 folders not mixed in), game log (GoH user folder, the other game's log marked),
// Notepad++ jump back (<GoH>/mods/<name> counts as a mod folder), Code Pieces catalog options, the page's call() sending the game,
// the Editor's .pot/.po kind and the po colour mode, the panel and explorer keys per game.
// Author: Imperator_Aug (ARSENAL, ia-242bce26)
const fs = require('fs'), path = require('path'), vm = require('vm');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'idegames-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };

// ---- fixture: <work>/lib/steamapps/{common/as2, common/goh, workshop/content/{244450,400750}}
const lib = path.join(work, 'lib', 'steamapps');
const game = path.join(lib, 'common', 'as2'), goh = path.join(lib, 'common', 'goh'), home = path.join(work, 'home');
process.env.GOH_GAME = goh; process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = home;
wr(path.join(game, 'as64.exe'), 'MZ'); wr(path.join(game, 'mowas_2.exe'), 'MZ');
wr(path.join(game, 'resource', 'entity', 'gun.def'), '{"weapon"\r\n  {damage 10}\r\n}\r\n');
wr(path.join(game, 'resource', 'set', 'x.set'), '{x 1}\r\n');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
wr(path.join(mod, 'resource', 'entity', 'gun.def'), '{"weapon"\r\n  {damage 30}\r\n}\r\n');
wr(path.join(game, 'mods', 'as2other', 'resource', 'entity', 'gun.def'), '{"weapon" {damage 2}}\r\n');
wr(path.join(lib, 'workshop', 'content', '244450', '111', 'resource', 'entity', 'gun.def'), '{"weapon" {damage 3}}\r\n');
wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
wr(path.join(goh, 'resource', 'entity', 'gun.def'), '{"weapon"\r\n  {damage 11}\r\n}\r\n');
wr(path.join(goh, 'mods', 'gohmod', 'mod.info'), '{mod\r\n\t{name "Goh Mod"}\r\n}\r\n');
wr(path.join(goh, 'mods', 'gohmod', 'resource', 'entity', 'gun.def'), '{"weapon" {damage 12}}\r\n');
wr(path.join(goh, 'mods', 'bare', 'resource', 'entity', 'x.def'), '{x}\r\n');
wr(path.join(lib, 'workshop', 'content', '400750', '2537', 'mod.info'), '{mod\r\n\t{name "valour"}\r\n}\r\n');
wr(path.join(lib, 'workshop', 'content', '400750', '2537', 'resource', 'entity', 'gun.def'), '{"weapon" {damage 13}}\r\n');
wr(path.join(lib, 'workshop', 'content', '400750', '2537', 'localizations', 'default', 'interface', 'text', 'units.pot'), 'msgid "a"\r\nmsgstr "b"\r\n');
const udir = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2');
wr(path.join(udir, 'profiles', 'p1', 'options.set'), '{options {mods "mine:0"}}\r\n');
const as2log = path.join(udir, 'log', 'game.log');
wr(as2log, ['Product: test', 'CMD: "x:/as2/as64.exe" -no_intro', '[12:00:01] Unknown ability "boom" (/entity/gun.def, 2)'].join('\r\n') + '\r\n');
const gohLog = path.join(home, 'Documents', 'My Games', 'Gates of Hell', 'log', 'game.log');
wr(gohLog, ['[00:00:00] Steam Application ID: 400750', '[00:00:00] Scanning mods in x:/goh/mods/', '[00:00:01] Found 1 available mods',
  '[00:00:02] Unknown ability "zap" (/entity/gun.def, 2)'].join('\r\n') + '\r\n');

const R = require('./routes');
const mkCtx = id => {
  const c = { tools: path.join(__dirname, '..', '..', '..'), tmpRoot: path.join(work, 'tmp'), game: () => game, allowLaunch: false,
    session: { token: 't', port: 1 } };
  if (id) {
    const exe = { as64: 'as64', mowas2: 'mowas_2', goh: 'goh' }[id];
    Object.assign(c, { gameId: () => id, exe: () => exe, kind: () => (id === 'goh' ? 'goh' : 'as2'), gohDir: () => goh, curDir: () => (id === 'goh' ? goh : game) });
  }
  return c;
};
const old = mkCtx(null), A64 = mkCtx('as64'), M2 = mkCtx('mowas2'), G = mkCtx('goh');
const U = (p, q) => { const u = new URL('http://x' + p); for (const k of Object.keys(q || {})) u.searchParams.set(k, q[k]); return u; };
const get = (name, q, c) => R['GET /api/x/ide/' + name](U('/api/x/ide/' + name, q), null, c);
const post = (name, b, c) => R['POST /api/x/ide/' + name](U('/api/x/ide/' + name), b, c);
const norm = p => String(p).replace(/\\/g, '/').toLowerCase();

(async () => {
  // ---- ictx: exe and game for MoW:AS2 and GoH, nothing new for AS64 (no game sent, or as64 sent)
  for (const [c, nm] of [[old, 'no game sent'], [A64, 'as64']]) {
    const ix = R._ictxOf(c, mod);
    ok(!('exe' in ix) && !('game' in ix) && ix.gameDir === game && ix.folder === mod, 'ictx AS64 (' + nm + ') unchanged: ' + JSON.stringify(Object.keys(ix)));
  }
  const im = R._ictxOf(M2, mod);
  ok(im.exe === 'mowas_2' && im.game === 'mowas2' && im.gameDir === game, 'ictx MoW:AS2: exe mowas_2, game mowas2, the AS2 install');
  const ig = R._ictxOf(G, null);
  ok(ig.exe === 'goh' && ig.game === 'goh' && norm(ig.gameDir) === norm(goh), 'ictx GoH: exe goh, gameDir = the GoH install (keylint takes vocab.goh.json from it)');
  const ib = R._ictxOf(Object.assign(mkCtx('mowas2'), { exe: () => 'mowas2' }), null);
  ok(ib.exe === 'mowas_2', 'ictx: ctx.exe() "mowas2" read as the vfs exe mowas_2');

  // ---- lists are kept per game: a stamp from the AS64 list is not used for the MoW:AS2 one
  const a = await get('vdir', { dir: 'entity', lim: '10' }, A64);
  const b = await get('vdir', { dir: 'entity', lim: '10', ver: a.ver }, M2);
  const a2 = await get('vdir', { dir: 'entity', lim: '10', ver: a.ver }, A64);
  ok(a.ver && b.ver && a.ver !== b.ver && a2.ver === a.ver, 'vdir list stamp per game (as64 ' + a.ver + ', mowas2 ' + b.ver + ', as64 again ' + a2.ver + ')');
  const f1 = await get('vfind', { q: 'gun', lim: '10' }, A64), f2 = await get('vfind', { q: 'gun', lim: '10', ver: f1.ver }, M2);
  ok(f1.ver !== f2.ver && f2.hits.some(h => h.key === 'resource/entity/gun.def'), 'vfind list stamp per game, MoW:AS2 answers');
  // the same game view for both games (files/lib vfsFor stubbed): only the game in the list key keeps the AS64 list from the MoW:AS2 answer
  const flib = require('../files/lib'), vfsOrig = flib.vfsFor, modsOrig = flib.modsFor;
  flib.vfsFor = (c, m) => vfsOrig(c === M2 ? A64 : c, m);
  try {
    const s1 = await get('vdir', { dir: 'entity', lim: '10' }, A64), s2 = await get('vdir', { dir: 'entity', lim: '10', ver: s1.ver }, M2);
    ok(s1.ver && s2.ver && s1.ver !== s2.ver, 'vdir: one game view, the AS64 list is not reused for MoW:AS2 (list key carries the game)');
    const v1 = await get('vfind', { q: 'gun', lim: '10' }, A64), v2 = await get('vfind', { q: 'gun', lim: '10', ver: v1.ver }, M2);
    ok(v1.ver && v2.ver && v1.ver !== v2.ver, 'vfind: one game view, the AS64 list is not reused for MoW:AS2 (list key carries the game)');
    const t1 = await get('tree', { mod, lim: '20' }, A64), t2 = await get('tree', { mod, lim: '20', ver: t1.ver }, M2);
    ok(t1.ver && t2.ver && t1.ver !== t2.ver, 'tree: one game view, the AS64 walk is not reused for MoW:AS2 (list key carries the game; ' + t1.ver + ' / ' + t2.ver + ')');
  } finally { flib.vfsFor = vfsOrig; }
  // the mods cache: AS64 and MoW:AS2 share the install folder, so only the game in the key keeps their answers apart
  let modsN = 0; flib.modsFor = (c, m) => { modsN++; return modsOrig(c, m); };
  try {
    R._reset();
    const S = require('../files/modfiles').kit(A64).S;
    S.clear('ide.mods');   // the answers the calls above left in the shared store
    R._ictxOf(A64, mod); R._ictxOf(M2, mod); R._ictxOf(A64, mod); R._ictxOf(M2, mod);
    ok(modsN === 2, 'mods cache kept per game: modsFor called once for AS64 and once for MoW:AS2 (' + modsN + ' calls)');
    // CACHE: the list is in the shared store too, so a new process (memory dropped) does not ask again; a changed mod.info does
    R._reset();
    const l1 = R._ictxOf(A64, mod).mods; R._ictxOf(M2, mod);
    ok(modsN === 2 && Array.isArray(l1), 'mods cache: after a restart the store answers, modsFor is not called (' + modsN + ' calls)');
    const mi = path.join(mod, 'mod.info'), miOld = fs.readFileSync(mi);
    fs.writeFileSync(mi, Buffer.concat([miOld, Buffer.from([13, 10])]));
    try { R._ictxOf(A64, mod); ok(modsN === 3, 'mods cache: a changed mod.info asks modsFor again (' + modsN + ' calls)'); }
    finally { fs.writeFileSync(mi, miOld); }
  } finally { flib.modsFor = modsOrig; }

  // ---- same file elsewhere
  const cA = await get('copies', { key: 'resource/entity/gun.def' }, A64);
  const lA = cA.copies.filter(x => x.kind === 'off').map(x => x.label);
  ok(lA.includes('as2other') && lA.includes('111') && !lA.some(l => /goh|valour|2537/i.test(l)), 'copies AS64: AS2 mods and Workshop 244450 only: ' + lA.join(', '));
  const cM = await get('copies', { key: 'resource/entity/gun.def' }, M2);
  ok(JSON.stringify(cM.copies.filter(x => x.kind === 'off').map(x => x.label)) === JSON.stringify(lA), 'copies MoW:AS2: the same folders as AS64 (one install)');
  const cG = await get('copies', { key: 'resource/entity/gun.def' }, G);
  const offG = cG.copies.filter(x => x.kind === 'off'), lG = offG.map(x => x.label);
  ok(lG.includes('Goh Mod (gohmod)') && lG.includes('valour (mod_2537)') && !lG.includes('as2other') && !lG.includes('111'),
    'copies GoH: <GoH>/mods and Workshop 400750 named mod_<item>, no AS2 folder: ' + lG.join(', '));
  ok(offG.every(x => x.ref && x.ref.path && norm(x.ref.path).startsWith(norm(lib))), 'copies GoH: each a read-only path ref');
  const cT = await get('copies', { key: 'resource/interface/text/units.pot' }, G).catch(e => ({ err: e.message }));
  ok(cT.err ? /does not read/.test(cT.err) : true, 'copies GoH text key: answered or the plain "not read" line (' + (cT.err || 'ok') + ')');

  // ---- game log
  // the logs ext gets the page's ctx (logs.find(url, ctx)); under GoH its answer is used only when it says game 'goh'
  const seenCtx = [];
  R._setLogs(() => ({ find: (u, c) => { seenCtx.push(c); return c === G ? { game: 'goh', newest: { path: gohLog, mtimeMs: 2 } } : { game: c && c.gameId ? c.gameId() : undefined, newest: { path: as2log, mtimeMs: 1 } }; } }));
  const gF = await get('log', {}, G), gFm = await get('log', {}, M2);
  ok(seenCtx[0] === G && seenCtx[1] === M2, 'log: logs.find is handed the page ctx (GoH, MoW:AS2)');
  ok(norm(gF.file) === norm(gohLog) && gFm.file === as2log, 'log: the logs ext answer for GoH (game goh) and MoW:AS2 is used');
  R._setLogs(() => ({ find: () => ({ newest: { path: as2log, mtimeMs: 1 } }) }));
  const gA = await get('log', {}, A64);
  ok(gA.file === as2log && !gA.logOf, 'log AS64: the AS2 log, written by as64: not marked');
  const gM = await get('log', {}, M2);
  ok(gM.file === as2log && gM.logOf === 'as64', 'log MoW:AS2: the shared log is marked as the AS64 one (logOf ' + gM.logOf + ')');
  const gG = await get('log', {}, G);
  ok(norm(gG.file) === norm(gohLog) && gG.tail.some(l => /Found 1 available mods/.test(l)), 'log GoH: the GoH user folder log, never the AS2 one: ' + gG.file);
  const gGo = await get('log', {}, Object.assign(mkCtx('goh'), { curDir: () => null, gohDir: () => null }));
  ok(gGo.why === 'nogame', 'log GoH with no GoH install: nogame');
  fs.renameSync(gohLog, gohLog + '.x');
  ok((await get('log', {}, G)).why === 'nolog', 'log GoH with no GoH log yet: nolog (the AS2 log is not shown instead)');
  fs.renameSync(gohLog + '.x', gohLog);
  // no Documents GoH folder at all: the LocalAppData fallback stays inside the test home (never the real user's GoH log)
  const gohUser = path.dirname(path.dirname(gohLog));
  fs.renameSync(gohUser, gohUser + '.x');
  try {
    const gN = await get('log', {}, G);
    ok(gN.why === 'nolog' && !(gN.file && !norm(gN.file).startsWith(norm(home))), 'log GoH with no GoH user folder: nolog, the search stays inside the home (' + (gN.file || gN.why) + ')');
  } finally { fs.renameSync(gohUser + '.x', gohUser); }
  R._setLogs(null);

  // ---- Notepad++ jump back: <GoH>/mods/<name> is a mod folder under GoH (files/lib decides whether it may be read)
  ok(R._modDirOf(G, path.join(goh, 'mods', 'bare')) === true, 'modDirOf GoH: <GoH>/mods/<name> with no mod.info counts');
  ok(R._modDirOf(A64, path.join(goh, 'mods', 'bare')) === false, 'modDirOf AS64: a GoH mods folder does not count (as before)');
  ok(R._modDirOf(A64, path.join(game, 'mods', 'as2other')) === true && R._modDirOf(G, path.join(game, 'mods', 'as2other')) === true, 'modDirOf: <AS2>/mods/<name> still counts');
  const ib2 = await post('inbox', { token: 't', file: path.join(goh, 'mods', 'bare', 'resource', 'entity', 'x.def') }, G);
  ok(ib2.ok && ib2.ref && (ib2.ref.rel || ib2.ref.path), 'inbox GoH mod file: a mod ref or the plain read-only path ' + JSON.stringify(ib2.ref));
  await get('inbox', {}, G);

  // ---- Code Pieces catalog options
  let seen = null; R._setKit(() => ({ catalog: (k, l, o) => { seen = o; return { v: 1, kind: k }; } }));
  await get('kit', { kind: 'ia-entity', lang: 'en' }, old);
  ok(JSON.stringify(seen) === '{"game":true}', 'kit AS64: catalog options as before ' + JSON.stringify(seen));
  await get('kit', { kind: 'ia-entity', lang: 'en' }, M2);
  ok(seen.game === true && seen.gameId === 'mowas2', 'kit MoW:AS2: gameId mowas2');
  await get('kit', { kind: 'ia-entity', lang: 'en' }, G);
  ok(seen.game === true && seen.gameId === 'goh', 'kit GoH: gameId goh, game set from the GoH install');
  R._setKit(() => ({ catalog: (k, l, o) => ({ v: 1, kind: k, pieces: [], hidden: o.gameId === 'goh' ? [{ id: 'p.x', words: ['zz'] }] : undefined }) }));
  const kh = await get('kit', { kind: 'ia-entity', lang: 'en' }, G);
  ok(Array.isArray(kh.hidden) && kh.hidden.length === 1 && kh.hidden[0].id === 'p.x', 'kit GoH: the catalog hidden list reaches the page');
  R._setKit(null);
  {
    const kt0 = fs.readFileSync(path.join(__dirname, 'ui', 'kit.js'), 'utf8');
    ok(/if\(a\.hidden&&a\.hidden\.length\)stEl\.appendChild\(note\(T\('hiddenN',\{n:a\.hidden\.length\}\)/.test(kt0), 'kit.js: the hidden pieces are named in one plain line');
    const LK = require('./lang/kit'), rows = LK.filter(r => /^ide\.kit\.hiddenN(\.1)?$/.test(r[0]));
    ok(rows.length === 2 && rows.every(r => r.length === 5 && r.slice(1).every(s => s && s.indexOf('{n}') >= 0)), 'lang kit: hiddenN and hiddenN.1 in en ru uk zh with {n}');
  }

  // ---- page: call() sends the game the way page api() does
  const core = fs.readFileSync(path.join(__dirname, 'ui', 'core.js'), 'utf8');
  const src = core;
  const piece = re => { const m = re.exec(src); return m ? m[0] : ''; };
  const ghSrc = piece(/function gh\(o\)\{[^\n]*\}/), callSrc = piece(/function call\(url,body,opt\)\{[\s\S]*?\n   throw e\}return j\}\)\}\)\}\r?\n/);   // call() to its last line (the job list: opt, the stopped flag)
  let sent = null;
  const sb = { gameHdr: o => Object.assign(o, { 'x-arsenal-game': 'goh', 'x-arsenal-goh': 'x' }), tx: k => k,
    fetch: (u, o) => { sent = o; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); } };
  vm.createContext(sb);
  try { vm.runInContext(ghSrc + '\n' + callSrc, sb); } catch (e) { ok(false, 'core.js call() loads: ' + e.message); }
  if (sb.call) {
    await sb.call('/api/x/ide/vdir?dir=');
    ok(sent && sent.headers && sent.headers['x-arsenal-game'] === 'goh', 'core.js call() GET sends x-arsenal-game');
    await sb.call('/api/x/ide/lint', { text: '' });
    ok(sent.headers['x-arsenal-game'] === 'goh' && sent.headers['content-type'] === 'application/json' && sent.method === 'POST', 'core.js call() POST sends the game and the JSON type');
    delete sb.gameHdr; await sb.call('/api/x/ide/vdir'); ok(sent && sent.headers && !sent.headers['x-arsenal-game'], 'core.js call() without page gameHdr: no header, no throw');
  } else ok(false, 'core.js call() found');
  ok(/if\(ext==='po'\|\|ext==='pot'\)return 'po'/.test(core) && !/ dl pot '/.test(core), 'core.js kindOf: .po and .pot are the po kind (not sdl)');
  ok(/d\.kind==='po'/.test(/function lintable\(d\)[^\n]*/.exec(core)[0]), 'core.js lintable: po buffers are checked while typing');
  ok(/function sesKey\(m\)\{var g=gidNow\(\);return 'ide\.open\.'\+\(g==='as64'\?'':g\+'\.'\)\+low\(m\)\}/.test(core), 'core.js open files remembered per game (AS64 key as before)');
  ok(/gidNow\(\)!==GSEEN/.test(core) && /var k=gidNow\(\)\+'\|'/.test(core), 'core.js: a game switch reads the Editor again; word lists per game');
  const ex = fs.readFileSync(path.join(__dirname, 'ui', 'explorer.js'), 'utf8');
  ok(/LASTMOD!==modKey\(\)/.test(ex) && /function modKey\(\)/.test(ex), 'explorer.js: game tree and Go to file read again per game');
  const kt = fs.readFileSync(path.join(__dirname, 'ui', 'kit.js'), 'utf8');
  ok(/function akey\(k\)\{[^\n]*S\.gameId/.test(kt), 'kit.js: one catalog per game');

  // ---- the po colour mode (cm/modes.src.js) through a small CodeMirror stand-in
  const modes = {};
  const CM = { defineMode: (nm, f) => { modes[nm] = f; } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'cm', 'modes.src.js'), 'utf8') + '\nideModes(CM, {atoms: []});', { CM });
  ok(typeof modes.po === 'function', 'modes: po defined');
  const Stream = s => ({ string: s, pos: 0, start: 0,
    sol() { return this.pos === 0; }, eol() { return this.pos >= this.string.length; }, peek() { return this.string.charAt(this.pos) || undefined; },
    next() { return this.pos < this.string.length ? this.string.charAt(this.pos++) : undefined; },
    eatSpace() { const p = this.pos; while (/\s/.test(this.string.charAt(this.pos))) this.pos++; return this.pos > p; },
    skipToEnd() { this.pos = this.string.length; }, current() { return this.string.slice(this.start, this.pos); },
    match(re) { const m = re.exec(this.string.slice(this.pos)); if (!m || m.index !== 0) return null; this.pos += m[0].length; return m; } });
  const run = (mode, lines) => {
    const out = [], st = mode.startState();
    for (const l of lines) {
      const s = Stream(l), toks = [];
      if (!l && mode.blankLine) mode.blankLine(st);
      let guard = 0;
      while (!s.eol() && guard++ < 500) { s.start = s.pos; const t = mode.token(s, st); if (s.pos === s.start) { ok(false, 'po mode made no progress at ' + l); break; } toks.push([s.current(), t]); }
      out.push(toks);
    }
    return out;
  };
  if (modes.po) {
    const po = modes.po({ indentUnit: 4 });
    const t = run(po, ['#, fuzzy', '# a note', 'msgctxt "announce_discord"', 'msgid ""', '"Language: en\\n"', 'msgstr[1] "{tag}x"', 'msgid "open', 'junk']);
    const at = (li, txt) => (t[li].find(x => x[0] === txt) || [])[1];
    ok(t[0][0][1] === 'meta' && t[1][0][1] === 'comment', 'po: #, flags meta, # comment');
    ok(at(2, 'msgctxt') === 'keyword' && at(3, 'msgid') === 'keyword' && at(5, 'msgstr[1]') === 'keyword', 'po: msgctxt msgid msgstr[n] keywords');
    ok(t[4].some(x => x[0] === '\\n' && /strsub/.test(x[1])) && t[5].some(x => x[0] === '{tag}' && /strsub/.test(x[1])), 'po: escapes and {tags} inside strings');
    ok(t[6].some(x => x[1] === 'error') && t[7][0][1] === 'error', 'po: an unclosed string and a stray word are errors');
    ok(po.lineComment === '#', 'po: line comment #');
  }
  const eds = fs.readFileSync(path.join(__dirname, 'cm', 'editor.src.js'), 'utf8');
  ok(/MODES = \{[^}]*po: 'po'/.test(eds), 'editor.src.js: the po kind uses the po mode');

  console.log(bad ? bad + ' of ' + n + ' failed' : 'ide games ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
