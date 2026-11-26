// files ext test. Arg: scratch dir. Fixture game + mods made here (no real game, no network). Checks: byte-exact round trip (CRLF, LF,
// BOM, cp1251 comment bytes, no final newline), edit keeps untouched bytes, refusals (game dir, vanilla, GoH, Workshop, paks, escapes,
// links out), restore points + undo, VFS winner chain, tree states, copy into mod, search caps.
// Author: Imperator_Aug (ARSENAL, ia-06bc374f)
const fs = require('fs'), path = require('path');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'filesx-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };

// ---- fixture
const game = path.join(work, 'game'), goh = path.join(work, 'goh'), home = path.join(work, 'home');
// the real AS2 install for the one read-only search at the end: found through lib/games (gamedir) before the fixture env is set
const REAL = process.env.AS2_GAME_REAL || (() => { try { return require('../../../lib/games').install('as64').dir || ''; } catch { return ''; } })();
process.env.GOH_GAME = goh; process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = home;
// the search time budget (8 s) ran out on a loaded machine (searched 70..285 of 300+ files): the fixture searches (and the real search
// at the end, and test-games.js) get 60 s unless the caller set one (lib reads it when it is first loaded, below); the 8 s default the
// GUI uses is checked on a lib loaded with no env, in a child process (search budget lines)
const SEARCH_MS_SET = process.env.ARSENAL_FILES_SEARCH_MS;
if (!SEARCH_MS_SET) process.env.ARSENAL_FILES_SEARCH_MS = '60000';
wr(path.join(game, 'as64.exe'), 'MZ');
wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
const cpComment = Buffer.from([0x3B, 0x20, 0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2]);          // "; Привет" in cp1251
const vanillaDef = Buffer.concat([Buffer.from('{"weapon"\r\n  {damage 10}\r\n  '), cpComment, Buffer.from('\r\n}\r\n')]);
wr(path.join(game, 'resource', 'entity', 'gun.def'), vanillaDef);
wr(path.join(game, 'resource', 'entity', 'only.def'), '{only}\r\n');
wr(path.join(game, 'resource', 'set', 'x.set'), '{x 1}\r\n');
wr(path.join(game, 'mods', 'other', 'mod.info'), '{mod {name "Other"}}\r\n');
wr(path.join(game, 'mods', 'other', 'resource', 'entity', 'gun.def'), '{"weapon" {damage 20}}\r\n');
const mod = path.join(game, 'mods', 'mine');
wr(path.join(mod, 'mod.info'), '{mod {name "Mine"}}\r\n');
const modDef = Buffer.concat([Buffer.from('{"weapon"\r\n  {damage 30}  '), cpComment, Buffer.from('\r\n  ; utf8 коммент\r\n}\r\n')]);
wr(path.join(mod, 'resource', 'entity', 'gun.def'), modDef);
wr(path.join(mod, 'resource', 'entity', 'new.def'), '{brandnew}\r\n');
wr(path.join(mod, 'resource', 'lf.txt.lua'), 'a\nb\nc');                                 // LF, no final newline
wr(path.join(mod, 'resource', 'bom.lng'), Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('{tags}\r\n{"a" "Б"}\r\n')]));
wr(path.join(mod, 'notes.txt'), 'root file\r\n');
wr(path.join(mod, 'resource.pak'), require('../../../lib/zipwrite').zip([['set/p.set', Buffer.from('{p 1}\r\n'), false]]));
wr(path.join(mod, 'resource', 'bin.dds'), Buffer.from([0, 1, 2, 3]));
wr(path.join(home, 'Documents', 'my games', 'men of war - assault squad 2', 'profiles', 'p1', 'options.set'), '{options {mods "other:0"}}\r\n');
const outside = path.join(work, 'dev', 'outmod');
wr(path.join(outside, 'mod.info'), '{mod {name "Out"}}\r\n');
wr(path.join(outside, 'resource', 'set', 'x.set'), '{x 2}\r\n');
const otherDir = path.join(work, 'unpacked');
wr(path.join(otherDir, 'entity', 'z.def'), '{"weapon_zz"}\r\n');
// game pak (deflated entries): pk.set holds the known word on line 3 col 4; ov.set holds it too but the mod overrides ov.set
const zw = require('../../../lib/zipwrite');
wr(path.join(game, 'resource', 'logic.pak'), zw.zip([
  ['set/pk.set', Buffer.from('{pk\r\n  {a 1}\r\n  {paktoken 7}\r\n}\r\n'), true],
  ['set/ov.set', Buffer.from('{ov {paktoken 1}}\r\n'), true],
  ['set/cp.set', Buffer.concat([Buffer.from('{cp}\r\n'), cpComment, Buffer.from(' pakword\r\n')]), false]]));
wr(path.join(mod, 'resource', 'set', 'ov.set'), '{ov {mine 1}}\r\n');
// 300 generated game files (about 40 KB each) for the event-loop test
{ const body = Array.from({ length: 2000 }, (_, i) => '{line ' + i + ' value abcdefgh}').join('\r\n') + '\r\n';
  for (let i = 0; i < 300; i++) wr(path.join(game, 'resource', 'set', 'gen', 'g' + String(i).padStart(3, '0') + '.set'), i === 299 ? body + '{zzqq9}\r\n' : body); }

const ext = require('./index'), lib = require('./lib');
const ctx = { tools: path.join(__dirname, '..', '..', '..'), tmpRoot: work, game: () => game, allowLaunch: false, runTool: async () => ({ code: 1, stdout: '', stderr: 'unused', timedOut: false }) };
const R = ext.routes;
const U = (p, q) => { const u = new URL('http://x' + p); for (const k of Object.keys(q || {})) u.searchParams.set(k, q[k]); return u; };
const get = (name, q) => R['GET /api/x/files/' + name](U('/api/x/files/' + name, q), null, ctx);
const post = (name, b) => R['POST /api/x/files/' + name](U('/api/x/files/' + name), b, ctx);
async function rejects(fn, re, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status >= 400 && re.test(e.message), m + (e ? ' [' + e.message + ']' : ' [no error]')); }

(async () => {
  // ---- byte-exact round trips (lib level)
  for (const [name, buf] of [['crlf+cp1251', modDef], ['vanilla', vanillaDef], ['lf', Buffer.from('a\nb\nc')], ['bom', fs.readFileSync(path.join(mod, 'resource', 'bom.lng'))],
    ['mixed eol', Buffer.from('a\r\nb\nc\r\n')], ['empty', Buffer.alloc(0)], ['one line', Buffer.from('x')]]) {
    const d = lib.decodeBuf(buf), r = lib.rebuild(buf, d.text);
    ok(r.buf.equals(buf) && !r.changed && !r.hunks.length, 'round trip unchanged ' + name);
  }
  // edit value on a line that also has a cp1251 comment: comment bytes stay cp1251, CRLF stays
  {
    const d = lib.decodeBuf(modDef);
    ok(d.cp === 1 && d.crlf === 4, 'decode counts cp1251 line + CRLF');
    const r = lib.rebuild(modDef, d.text.replace('damage 30', 'damage 35'));
    const want = Buffer.concat([Buffer.from('{"weapon"\r\n  {damage 35}  '), cpComment, Buffer.from('\r\n  ; utf8 коммент\r\n}\r\n')]);
    ok(r.buf.equals(want), 'edit keeps cp1251 comment bytes + CRLF');
    ok(r.hunks.length === 1 && r.hunks[0].oldLine === 2, 'one hunk at line 2');
    // insert a line, delete a line
    const r2 = lib.rebuild(modDef, d.text.replace('  ; utf8 коммент\n', '').replace('{"weapon"\n', '{"weapon"\n  {mass 5}\n'));
    const want2 = Buffer.concat([Buffer.from('{"weapon"\r\n  {mass 5}\r\n  {damage 30}  '), cpComment, Buffer.from('\r\n}\r\n')]);
    ok(r2.buf.equals(want2), 'insert gets CRLF, delete drops line, rest byte-exact');
    // typing Cyrillic into the cp1251 line -> warn mixed
    const r3 = lib.rebuild(modDef, d.text.replace('damage 30', 'урон 30'));
    ok(r3.warns.some(w => w.code === 'mixed' && w.line === 2), 'warn on new UTF-8 letters in a cp1251 line');
    ok(r3.buf.includes(cpComment), 'cp1251 comment survives Cyrillic edit');
    // LF file stays LF; no final newline kept
    const lf = Buffer.from('a\nb\nc'), r4 = lib.rebuild(lf, 'a\nB\nc\nd');
    ok(r4.buf.toString() === 'a\nB\nc\nd', 'LF file stays LF');
    // CRLF text from a client is normalised
    ok(lib.rebuild(modDef, d.text.replace(/\n/g, '\r\n')).buf.equals(modDef), 'CRLF from client = same bytes');
  }

  // ---- refusals
  const gunRel = 'resource/entity/gun.def';
  await rejects(() => get('open', { mod: game, rel: gunRel }), /game folder itself/, 'refuse game dir');
  await rejects(() => get('open', { mod: path.join(game, 'resource'), rel: 'entity/gun.def' }), /part of the game install/, 'refuse vanilla resource');
  await rejects(() => get('open', { mod: path.join(game, 'mods'), rel: 'mine/mod.info' }), /part of the game install|look like a mod/, 'refuse mods root');
  await rejects(() => get('open', { mod: path.join(mod, 'resource'), rel: 'entity/gun.def' }), /part of the game install/, 'refuse subfolder of a mod in game');
  wr(path.join(goh, 'mods', 'g', 'mod.info'), '{mod}');
  await rejects(() => get('open', { mod: path.join(goh, 'mods', 'g'), rel: 'mod.info' }), /Gates of Hell/, 'refuse GoH');
  const ws = path.join(work, 'steamapps', 'workshop', 'content', '244450', '123');
  wr(path.join(ws, 'mod.info'), '{mod}');
  await rejects(() => get('open', { mod: ws, rel: 'mod.info' }), /Workshop/, 'refuse Workshop');
  await rejects(() => get('open', { mod, rel: '../other/mod.info' }), /leaves your mod/, 'refuse ..');
  await rejects(() => get('open', { mod, rel: 'C:/x.def' }), /path inside your mod/, 'refuse absolute rel');
  await rejects(() => post('save', { mod, rel: 'resource.pak', text: 'x', write: true }), /packed files/, 'refuse pak edit');
  await rejects(() => get('open', { mod, rel: 'resource/bin.dds' }), /binary/, 'refuse binary');
  await rejects(() => get('open', { mod: 'relative/path', rel: gunRel }), /Pick your mod/, 'refuse relative mod');
  // viewers (ext view) read through lib: a pak may be read (never written), the 415 a viewer falls back on, the exports it reuses
  { let e = null; try { lib.target(mod, 'resource.pak'); } catch (x) { e = x; }
    ok(e && /packed files/.test(e.message) && lib.target(mod, 'resource.pak', { read: true }).rel === 'resource.pak', 'target: a pak refused for edits, allowed with {read:true}'); }
  { let e = null; try { await get('open', { mod, rel: 'resource/bin.dds' }); } catch (x) { e = x; } ok(e && e.status === 415, 'open: a binary file answers 415 (the page opens it in a viewer)'); }
  ok(typeof lib.pakTarget === 'function' && typeof lib.recFile === 'function' && lib.isBinary(Buffer.from([0, 1])) && !lib.isBinary(Buffer.from('{a}')), 'lib exports pakTarget, recFile, isBinary');
  { const p = lib.pakTarget(mod, 'resource.pak:\x3aset/p.set'); ok(p.entry === 'set/p.set' && p.ent && p.ent.size === 7, 'pakTarget: the entry of a mod pak'); }
  { const sc = String(require('./script') || ''); ok(/e\.status===415&&window\.VIEW/.test(sc) && /files\.bytes/.test(sc), 'Files page: a 415 opens the viewer, a pak offers its bytes'); }
  {   // view(v): show('files','undo') opens that inner tab; a caller that only set files.tab before opening is honoured; a view asked before the build too
    const vm = require('vm'), BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck')), { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const L = require('./lang').en, sc = String(require('./script') || '');
    const run = (S, store) => {
      const doc = make(), mem = store || {}, box = { document: doc, window: {}, EXT_SCREENS: {}, S: S, LS: { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } },
        tx: k => L[k] == null ? k : L[k], blkApply: () => {}, show: () => {}, toast: () => {}, api: () => new Promise(() => {}) };
      const F = BC.pageFns(doc); for (const k of BC.NAMES) box[k] = F[k];
      vm.runInNewContext(sc, box);
      const root = doc.createElement('section'); return { root, scr: box.EXT_SCREENS.files(root), mem };
    };
    const on = (R, id) => R.root.all().filter(e => e.tagName === 'BUTTON' && e.attrs.role === 'tab' && e.className === 'primary').map(e => e.textContent).join() === L['files.tab.' + id];
    const A = run({ mod: '', view: {} }); A.scr.refresh();
    ok(typeof A.scr.view === 'function' && on(A, 'tree'), 'Files page: has view(), opens on Files');
    A.scr.view('undo'); A.scr.refresh(); ok(on(A, 'undo') && A.mem['files.tab'] === 'undo', 'Files page: view(undo) then refresh opens Undo');
    A.scr.view('nope'); A.scr.refresh(); ok(on(A, 'undo'), 'Files page: an unknown view changes nothing');
    A.mem['files.tab'] = 'search'; A.scr.refresh(); ok(on(A, 'search'), 'Files page: files.tab set before opening is honoured');
    const B = run({ mod: '', view: { files: 'edit' } }, { 'files.tab': 'tree' }); B.scr.refresh(); ok(on(B, 'edit'), 'Files page: a view asked before the build is honoured');
  }
  {   // searchKit (owner 2026-11-19): the tree filter, the content search and the other-folder box each have Browse, History and an index;
      // the filter draws in the next frame, at most 200 rows and a "show more" button
    const vm = require('vm'), BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck')), { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
    const L = require('./lang').en, sc = String(require('./script') || ''), frames = [], mem = {}, doc = make(), tick = () => new Promise(r => setImmediate(r));
    const tree = { files: [] }; for (let i = 0; i < 450; i++) tree.files.push({ rel: 'resource/set/unit' + i + '.set', state: 'new', size: 10 }); tree.files.push({ rel: 'mod.info', state: 'modinfo', size: 5 });
    const box = { document: doc, window: {}, EXT_SCREENS: {}, S: { mod: 'C:/m', view: {} }, LS: { get: (k, d) => (k in mem ? mem[k] : d), set: (k, v) => { mem[k] = v; } },
      tx: (k, p) => { let s = L[k] == null ? k : L[k]; for (const x in p || {}) s = s.split('{' + x + '}').join(String(p[x])); return s; }, blkApply: () => {}, show: () => {}, toast: () => {},
      pick: (m, s, cb) => cb(m === 'dir' ? 'D:/other' : 'C:/m/resource/set/unit7.set'), gameDir: () => 'C:/g',
      api: u => Promise.resolve(/\/tree\?/.test(u) ? tree : /installed/.test(u) ? { game: 'C:/g', mods: [{ name: 'ma' }] } : {}),
      requestAnimationFrame: f => frames.push(f), setTimeout: f => frames.push(f) };
    const F = BC.pageFns(doc); for (const k of BC.NAMES) box[k] = F[k];
    vm.runInNewContext(BC.kitSrc() + '\n' + sc, box);
    // the kit's Browse goes through searchKit.picker: record each spec and answer like the folder picker would
    const specs = []; box.searchKit.picker = (spec, done) => { specs.push(spec); if (spec.mode === 'dir') done('D:/other', { view: 'disk', path: 'D:/other' });
      else if (spec.view === 'data') done('set/unit4.set', { view: 'data', path: 'set/unit4.set', key: 'resource/set/unit4.set' }); else done('C:/m/resource/set/unit7.set', { view: 'disk', path: 'C:/m/resource/set/unit7.set' }); };
    const flush = () => { let g = 0; while (frames.length && g++ < 20) frames.splice(0).forEach(f => f()); };
    const root = doc.createElement('section'); mem['files.tab'] = 'tree'; const scr = box.EXT_SCREENS.files(root); scr.refresh(); await tick(); flush();
    const kit = k => root.all().find(e => e.className === 'sk' && e.dataset.sk === k);
    const fk = kit('files.filter'), fin = fk && fk.children[0];
    ok(fk && fk.children.map(c => c.tagName).join() === 'INPUT,BUTTON,BUTTON,DIV' && !root.byText(L['files.browse'], 'button'), 'Files tree: the filter is a searchKit box (Browse, History), no second Browse button');
    fin.value = 'unit'; fin.selectionStart = 4; fin.fire('input'); await tick(); flush();
    const links = root.all().filter(e => e.tagName === 'A' && /^resource\/set\/unit/.test(e.textContent)).length;
    ok(links === 200 && root.byText(box.tx('files.more', { n: 250 }), 'button'), 'Files tree: a filter draws at most 200 rows and a show-more button (' + links + ')');
    const dd = fk.children[3], opts = dd.children.filter(c => c.getAttribute('role') === 'option');
    ok(!dd.hidden && opts.length >= 30 && /unit/.test(opts[0].textContent), 'Files tree: typing lists index hits from the tree (' + opts.length + ')');
    fk.children[1].click(); flush();
    ok(fin.value === 'resource/set/unit7.set', 'Files tree: Browse puts the picked file into the filter as its path in the mod (' + fin.value + ')');
    const s0 = specs[specs.length - 1];
    ok(s0 && s0.mode === 'file' && s0.view === 'disk' && s0.start === 'C:/m', 'Files tree: Browse opens the file picker on the mod folder ' + JSON.stringify(s0));
    ok((mem['sk.hist.files.filter'] || []).length >= 1, 'Files tree: the filter remembers what was used (history)');
    mem['files.tab'] = 'search'; scr.refresh(); await tick(); flush();
    const qk = kit('files.q'), ok2 = kit('files.other');
    ok(qk && ok2, 'Files search: the text box and the other-folder box are searchKit boxes');
    const qin = qk.children[0]; qin.value = 'unit4'; qin.selectionStart = 5; qin.fire('input'); await tick(); flush();
    ok(qk.children[3].children.some(c => c.getAttribute('role') === 'option' && /unit4/.test(c.textContent)), 'Files search: the index offers the mod\'s file names');
    qk.children[1].click(); await tick(); flush(); const s1 = specs[specs.length - 1];
    ok(s1 && s1.mode === 'file' && s1.view === 'data' && qin.value === 'unit4', 'Files search: Browse opens the game data view and a picked file searches by its name (' + qin.value + ') ' + JSON.stringify(s1));
    const oin = ok2.children[0]; ok2.children[1].click(); flush(); const s2 = specs[specs.length - 1];
    ok(s2 && s2.mode === 'dir' && s2.view === 'disk' && s2.start === 'C:/m', 'Files search: the other-folder Browse is the folder picker at the mod ' + JSON.stringify(s2));
    ok(oin.value === 'D:/other' && mem['files.other'] === 'D:/other', 'Files search: Browse on the other-folder box picks a folder and keeps it');
    oin.value = 'ma'; oin.selectionStart = 2; oin.fire('input'); await tick(); flush();
    ok(ok2.children[3].children.some(c => c.getAttribute('role') === 'option' && /mods.ma/.test(c.textContent)), 'Files search: the folder index lists the mods in the game');
    ok(BC.checkScreen(root).length === 0, 'Files page with the kits: blocks clean ' + JSON.stringify(BC.checkScreen(root).slice(0, 3)));
  }
  // junction out of the mod (Windows junction needs no admin; skipped if it cannot be made)
  try {
    fs.symlinkSync(path.join(game, 'resource'), path.join(mod, 'resource', 'linkout'), 'junction');
    await rejects(() => post('save', { mod, rel: 'resource/linkout/entity/only.def', text: 'x', write: true }), /out of your mod/, 'refuse link out');
    fs.rmSync(path.join(mod, 'resource', 'linkout'), { recursive: true, force: true });
  } catch (e) { console.log('note: junction test skipped: ' + e.message); }

  // ---- open + save with preview + restore point
  const o = await get('open', { mod, rel: gunRel });
  ok(o.editable && o.eol === 'crlf' && o.cpLines === 1 && o.key === gunRel, 'open mod file editable');
  const edited = o.text.replace('damage 30', 'damage 31');
  const pv = await post('save', { mod, rel: gunRel, base: o.hash, text: edited });
  ok(!pv.written && pv.changed && pv.hunks.length === 1 && fs.readFileSync(path.join(mod, gunRel)).equals(modDef), 'preview writes nothing');
  await rejects(() => post('save', { mod, rel: gunRel, base: 'deadbeef', text: edited, write: true }), /changed on disk/, 'stale base refused (409)');
  const sv = await post('save', { mod, rel: gunRel, base: o.hash, text: edited, write: true });
  const now = fs.readFileSync(path.join(mod, gunRel));
  ok(sv.written && now.includes(cpComment) && now.toString('latin1').includes('damage 31\x7d  ') && now.equals(Buffer.from(modDef.toString('latin1').replace('damage 30', 'damage 31'), 'latin1')), 'save byte-exact except edit');
  const undoDir = lib.undoRoot(mod);
  ok(undoDir === mod + '.arsenal-undo' && !fs.existsSync(path.join(mod, '.arsenal-undo')), 'restore points sit next to the mod, not in it');
  ok(fs.readFileSync(path.join(undoDir, sv.restorePoint, 'files', 'resource', 'entity', 'gun.def')).equals(modDef), 'restore point holds old bytes');
  const same = await post('save', { mod, rel: gunRel, base: sv.hash, text: edited, write: true });
  ok(!same.changed && !same.written, 'no change -> no write');
  // undo list + restore preview + restore
  const ul = await get('undo', { mod });
  ok(ul.list.length === 1 && ul.list[0].rel === gunRel && ul.list[0].action === 'save', 'undo list');
  const rp = await post('restore', { mod, id: ul.list[0].id });
  ok(!rp.written && rp.hunks.length === 1, 'restore preview');
  const rw = await post('restore', { mod, id: ul.list[0].id, write: true });
  ok(rw.written && fs.readFileSync(path.join(mod, gunRel)).equals(modDef), 'restore puts old bytes back');
  ok((await get('undo', { mod })).list.length === 2, 'restore made its own restore point');
  await rejects(() => post('restore', { mod, id: '../../x' }), /pick a restore point/, 'restore id checked');
  {   // a restore point lib/modwrite kept inside the mod (<mod>/.arsenal/undo, the form for a mod in a game's mods folder): listed and restored
    const MW = require('../../../lib/modwrite'), keep = fs.readFileSync(path.join(mod, gunRel));
    const ids = MW.restorePoints(mod, [gunRel], 'test-in-mod');
    const inMod = path.join(mod, '.arsenal', 'undo', ids[0]);   // this mod sits in <game>/mods: lib/modwrite keeps its points inside it
    if (!fs.existsSync(inMod)) { fs.mkdirSync(path.dirname(inMod), { recursive: true }); fs.renameSync(path.join(MW.restoreRoot(mod), ids[0]), inMod); }
    fs.writeFileSync(path.join(mod, gunRel), Buffer.from('changed\r\n', 'latin1'));
    const l2 = await get('undo', { mod }), it = l2.list.find(u => u.id === ids[0]);
    ok(it && it.action === 'test-in-mod' && l2.list.length === 3, 'undo list: a restore point inside the mod (.arsenal/undo) is listed with those beside it');
    const r2 = await post('restore', { mod, id: ids[0], write: true });
    ok(r2.written && fs.readFileSync(path.join(mod, gunRel)).equals(keep), 'restore from <mod>/.arsenal/undo puts the old bytes back');
    fs.rmSync(path.join(mod, '.arsenal'), { recursive: true, force: true });
  }

  // ---- VFS winner chain + tree
  const wh = await get('which', { mod, rel: gunRel });
  ok(wh.winner === 'mine' && wh.chain.length === 3 && wh.chain[0].kind === 'mine' && wh.chain[1].kind === 'othermod' && wh.chain[2].kind === 'vanilla', 'which: mine > other > vanilla');
  ok(wh.notes.includes('not-enabled'), 'which notes my mod not in profile');
  const wo = await get('which', { mod: outside, rel: 'resource/set/x.set' });
  ok(wo.winner === 'mine' && wo.notes.includes('outside') && wo.chain[1].kind === 'vanilla', 'which: outside mod shown on top');
  const wn = await get('which', { mod, rel: 'notes.txt' });
  ok(!wn.mounted && wn.notes.includes('not-mounted'), 'root file not mounted');
  const tr = await get('tree', { mod });
  const st = r => (tr.files.find(f => f.rel === r) || {}).state;
  ok(st(gunRel) === 'override' && st('resource/entity/new.def') === 'new' && st('notes.txt') === 'unmounted' && st('resource.pak') === 'pak' && st('resource.pak:\x3aset/p.set') === 'inpak', 'tree states ' + JSON.stringify(tr.files.map(f => f.rel + '=' + f.state)));
  // GT-03: mod.info is read by the game (never labelled "not read"); other root files still are not
  ok(st('mod.info') === 'modinfo', 'GT-03 tree: mod.info state modinfo, not unmounted (' + st('mod.info') + ')');
  const wmi = await get('which', { mod, rel: 'mod.info' });
  ok(!wmi.mounted && wmi.notes.includes('modinfo') && !wmi.notes.includes('not-mounted'), 'GT-03 which: mod.info note modinfo ' + JSON.stringify(wmi.notes));
  {
    const L = require('./lang');
    ok(!/never|not read/i.test(L.en['files.st.modinfo'] + L.en['files.n.modinfo']) && /mod\.info/.test(L.en['files.n.notmounted']), 'GT-03 texts: mod.info is read by the game');
    const keys = ['files.st.modinfo', 'files.n.modinfo', 'files.n.asenhanced', 'files.n.notenabled', 'files.modLine', 'files.n.dropped'].concat(['enhanced-in-classic', 'classic-in-enhanced', 'version', 'not-installed', 'requires', 'patches'].map(x => 'files.n.dropped' + x.replace(/-/g, '')));
    ok(keys.every(k => ['en', 'ru', 'uk', 'zh'].every(l => typeof L[l][k] === 'string' && L[l][k].length > 5)), 'GT-03/04 keys exist in en, ru, uk, zh');
    const scr = require('./script');
    ok(/'modinfo'/.test(scr) && /files\.modLine/.test(scr) && !/n!=='not-enabled'/.test(scr), 'GT-03/04/15 page: legend has mod.info, tree shows the not-switched-on note, shared mod shown');
  }
  // GT-04: a mod in <game>/mods that is not switched on is shown "as if switched on last" and must not be reported as skipped
  // because of that what-if list: an as64-mode mod (MinGameVersion 3.301) gets as64 mode on, a folder name in capitals is listed in lower case
  wr(path.join(game, 'as64', 'plus', 'mod.info'), '{mod {name "as64+"}}\r\n');
  const enh = path.join(game, 'mods', 'enh');
  wr(path.join(enh, 'mod.info'), '{mod {name "Enh"} {MinGameVersion "3.301"}}\r\n');
  wr(path.join(enh, 'resource', 'entity', 'only.def'), '{enh}\r\n');
  const we = await get('which', { mod: enh, rel: 'resource/entity/only.def' });
  ok(we.winner === 'mine' && we.notes.includes('not-enabled') && we.notes.includes('as-enhanced') && !we.notes.some(x => /^dropped/.test(x)), 'GT-04 as64-mode mod not switched on: shown, not skipped ' + JSON.stringify(we.notes));
  const caps = path.join(game, 'mods', 'CapsMod');
  wr(path.join(caps, 'mod.info'), '{mod {name "Caps"}}\r\n');
  wr(path.join(caps, 'resource', 'entity', 'only.def'), '{caps}\r\n');
  const wc = await get('which', { mod: caps, rel: 'resource/entity/only.def' });
  ok(wc.winner === 'mine' && !wc.notes.some(x => /^dropped/.test(x)), 'GT-04 folder name in capitals: shown, not skipped ' + JSON.stringify(wc.notes));
  const needy = path.join(game, 'mods', 'needy');
  wr(path.join(needy, 'mod.info'), '{mod {name "Needy"} {Require "nothere"}}\r\n');
  wr(path.join(needy, 'resource', 'entity', 'only.def'), '{needy}\r\n');
  const tn = await get('tree', { mod: needy });
  ok(tn.notes.includes('dropped-requires'), 'GT-04 a real skip names its reason (vfs dropReason) ' + JSON.stringify(tn.notes));
  {   // X1 item 2: every skip reason vfs.dropReason gives has a text in four languages that says what to do; mode skips are told apart
    const L = require('./lang'), src = fs.readFileSync(require.resolve('../../../lib/vfs'), 'utf8');
    const reasons = [...new Set((src.slice(src.indexOf('function dropReason')).match(/\['([a-z-]+)', '/g) || []).map(x => x.slice(2, -4)))];
    ok(reasons.length === 6 && reasons.every(r => ['en', 'ru', 'uk', 'zh'].every(l => typeof L[l]['files.n.dropped' + r.replace(/-/g, '')] === 'string')) && reasons.every(r => /What to do/.test(L.en['files.n.dropped' + r.replace(/-/g, '')])), 'X1 skip reasons translated with what to do: ' + reasons.join(','));
    const prof = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2', 'profiles', 'p1', 'options.set'), keep = fs.readFileSync(prof);
    fs.writeFileSync(prof, '{options {mods "other:0" "enh:0"}}\r\n');
    const wx = await get('which', { mod: enh, rel: 'resource/entity/only.def' });
    ok(wx.notes.includes('dropped-enhanced-in-classic'), 'X1 Enhanced mod listed without as64+: reason enhanced-in-classic ' + JSON.stringify(wx.notes));
    fs.writeFileSync(prof, '{options {mods "as64+:0" "other:0" "needy:0"}}\r\n');
    const wy = await get('which', { mod: needy, rel: 'resource/entity/only.def' });
    ok(wy.notes.includes('dropped-classic-in-enhanced'), 'X1 Classic mod listed with as64+: reason classic-in-enhanced ' + JSON.stringify(wy.notes));
    // X1 item 3: a profile saved by a newer game (lastGameVersion = the installed game's version) keeps its mod list
    fs.writeFileSync(prof, keep);
    const sset = path.join(path.dirname(prof), 'settings.set'), vtxt = path.join(game, 'version.txt');
    fs.writeFileSync(sset, '{settings {lastGameVersion "3.270.0"}}\r\n'); fs.writeFileSync(vtxt, '3.270.0\r\n');
    const wv = await get('which', { mod, rel: gunRel });
    ok(wv.chain.some(r => r.kind === 'othermod') && !wv.notes.includes('no-profile'), 'X1 newer game version: profile mods kept ' + JSON.stringify(wv.chain.map(r => r.kind)));
    fs.writeFileSync(sset, '{settings {lastGameVersion "3.250.0"}}\r\n');
    const ww = await get('which', { mod, rel: gunRel });
    ok(!ww.chain.some(r => r.kind === 'othermod'), 'X1 profile from another game version: the game empties the list, shown so ' + JSON.stringify(ww.chain.map(r => r.kind)));
    fs.unlinkSync(sset); fs.unlinkSync(vtxt);
  }
  const pk = await get('open', { mod, rel: 'resource.pak:\x3aset/p.set' });
  ok(pk.editable && !pk.why && pk.inPak === 'resource.pak' && pk.text === '{p 1}\n', 'pak entry of my mod opens editable');
  {
    // save an entry inside the mod's pak: the pak is written again with that entry replaced, every other entry kept byte for byte
    const zw = require('../../../lib/zipwrite'), pakLib = require('../../../lib/pak'), two = path.join(mod, 'two.pak'), rel2 = 'two.pak:\x3aset/a.set';
    const keep = Buffer.concat([Buffer.from('{b}\r\n; '), Buffer.from([0xcf, 0xf0]), Buffer.from('\r\n')]);
    wr(two, zw.zip([['set/a.set', Buffer.from('{a 1}\r\n{b 2}\r\n'), true], ['set/b.set', keep, false], ['set/bin.dds', Buffer.from([0, 1, 2, 3]), true]]));
    const o1 = await get('open', { mod, rel: rel2 });
    const dry = await post('save', { mod, rel: rel2, base: o1.hash, text: '{a 1}\n{b 3}\n' });
    ok(dry.changed && !dry.written && pakLib.read({ file: two }, pakLib.list(two)[0]).toString() === '{a 1}\r\n{b 2}\r\n', 'pak entry save preview writes nothing');
    const sv = await post('save', { mod, rel: rel2, base: o1.hash, text: '{a 1}\n{b 3}\n', write: true });
    const L = pakLib.list(two), rd = i => pakLib.read({ file: two }, L[i]);
    ok(sv.written && sv.pak === 'two.pak' && L.length === 3 && L.map(e => e.name).join() === 'set/a.set,set/b.set,set/bin.dds' && rd(0).toString() === '{a 1}\r\n{b 3}\r\n', 'pak entry saved, CRLF kept ' + JSON.stringify(L.map(e => e.name)));
    ok(rd(1).equals(keep) && rd(2).equals(Buffer.from([0, 1, 2, 3])) && L[0].method === 8 && L[1].method === 0 && !fs.existsSync(two + '.arsenal-tmp'), 'other entries byte-exact, stored/deflated kept, no temp file left');
    await rejects(() => post('save', { mod, rel: rel2, base: o1.hash, text: 'x', write: true }), /changed on disk/, 'pak entry save refuses a stale base');
    await rejects(() => post('save', { mod, rel: 'two.pak:\x3aset/none.set', text: 'x', write: true }), /No such entry/, 'pak entry save refuses a missing entry');
    await rejects(() => post('save', { mod, rel: '../two.pak:\x3aset/a.set', text: 'x', write: true }), /not a pak in your mod|No such pak/, 'pak entry save refuses a pak outside the mod');
    { const vp = await get('open', { mod, path: path.join(mod, 'set', 'a.set') }); ok(vp.rel === rel2 && vp.editable === true, 'a packed file named by its loose path opens as the pak entry (problem list -> Editor)', vp.rel); }
    const ul = await get('undo', { mod }), up = ul.list.find(u => u.rel === rel2);
    ok(up && up.nowExists, 'restore point for the pak entry listed');
    const rs = await post('restore', { mod, id: up.id, write: true });
    ok(rs.written && pakLib.read({ file: two }, pakLib.list(two)[0]).toString() === '{a 1}\r\n{b 2}\r\n' && pakLib.read({ file: two }, pakLib.list(two)[1]).equals(keep), 'restore puts the old entry back into the pak');
    fs.unlinkSync(two);
  }
  // vanilla layer read-only + copy into my mod
  const van = wh.chain[2];
  const vo = await get('open', { mod, key: gunRel, idx: van.idx });
  ok(!vo.editable && vo.text.includes('damage 10'), 'vanilla layer opens read-only');
  const onlyKey = 'resource/entity/only.def';
  const wOnly = await get('which', { mod, key: onlyKey });
  const cpv = await post('copy', { mod, key: onlyKey, idx: wOnly.chain[0].idx });
  ok(!cpv.written && !cpv.exists && !fs.existsSync(path.join(mod, onlyKey)), 'copy preview writes nothing');
  const cw = await post('copy', { mod, key: onlyKey, idx: wOnly.chain[0].idx, write: true });
  ok(cw.written && fs.readFileSync(path.join(mod, onlyKey)).equals(fs.readFileSync(path.join(game, onlyKey))), 'copy byte-exact into mod');
  const ul2 = (await get('undo', { mod })).list.find(x => x.rel === onlyKey);
  ok(ul2 && ul2.existed === false, 'copy restore point records new file');
  const rr = await post('restore', { mod, id: ul2.id });
  ok(rr.removes, 'restore of a new file says it removes it');
  await post('restore', { mod, id: ul2.id, write: true });
  ok(!fs.existsSync(path.join(mod, onlyKey)) && fs.existsSync(path.join(game, onlyKey)), 'undo of copy removes only the mod file');
  await rejects(() => post('copy', { mod: game, key: onlyKey, idx: 0, write: true }), /game folder itself/, 'copy refuses game dir');

  // ---- search
  const s1 = await post('search', { mod, q: 'DAMAGE' });
  ok(s1.hits.some(h => h.rel === gunRel && h.line === 2 && h.root === 'mod'), 'search finds file:line');
  ok(!s1.hits.some(h => h.root !== 'mod'), 'search mod only by default');
  const s2 = await post('search', { mod, q: 'weapon_\\w+', regex: true, other: otherDir, vanilla: true });
  ok(s2.hits.some(h => h.root === 'other' && h.rel === 'entity/z.def'), 'search other folder');
  const s3 = await post('search', { mod, q: 'Привет' });
  ok(s3.hits.some(h => h.rel === gunRel), 'search finds cp1251 text');
  const s4 = await post('search', { mod, q: 'only', caseSens: true, vanilla: true });
  ok(s4.hits.some(h => h.root === 'vanilla' && h.key === 'resource/entity/only.def' && h.layer === 'base' && h.line === 1 && h.col === 2 && !h.file), 'search game loose file by key ' + JSON.stringify(s4.hits));
  ok(!(await post('search', { mod, q: 'damage', vanilla: true })).hits.some(h => h.root === 'vanilla'), 'game copies of a file the mod has are skipped');
  // ---- game search: pak entries, overrides, order, cancel, event loop
  const s5 = await post('search', { mod, q: 'PAKTOKEN', vanilla: true });
  const pkh = s5.hits.find(h => h.key === 'resource/set/pk.set');
  ok(pkh && pkh.layer === 'base' && pkh.pak === 'logic.pak' && pkh.line === 3 && pkh.col === 4 && pkh.text === '{paktoken 7}' && pkh.kind === 'vanilla', 'pak entry hit: key + layer + line/col ' + JSON.stringify(s5.hits));
  ok(!s5.hits.some(h => h.key === 'resource/set/ov.set' || h.rel === 'resource/set/ov.set'), 'mod override hides the game copy hit');
  ok(s5.searched > 300 && s5.files >= s5.searched && s5.truncated === null && !s5.partial, 'searched counted: ' + s5.searched);
  const po = pkh ? await get('open', { mod, key: pkh.key, idx: pkh.idx }) : null;   // no hit: the fail above says why, no crash here
  ok(po && !po.editable && po.text.split('\n')[2].slice(pkh.col - 1).startsWith('paktoken'), 'game hit opens read-only at key/idx, col lands on the word');
  const s6 = await post('search', { mod, q: 'Привет|pakword|abc', regex: true, vanilla: true });
  const i6m = s6.hits.findIndex(h => h.root === 'mod'), i6g = s6.hits.findIndex(h => h.root === 'vanilla');
  ok(i6m === 0 && i6g > 0 && s6.hits.slice(i6g).every(h => h.root === 'vanilla'), 'mod hits first, then game hits');
  const gk = s6.hits.filter(h => h.root === 'vanilla').map(h => h.key);
  ok(gk.every((k, i) => i === 0 || gk[i - 1] <= k), 'game hits sorted by path');
  ok(s6.truncated === 'hits' && s6.hits.length === 500, 'hit cap kept');
  const cph = (await post('search', { mod, q: 'Привет pakword', vanilla: true })).hits.find(h => h.key === 'resource/set/cp.set');
  ok(cph && cph.line === 2 && cph.col === 3,'cp1251 line inside a stored pak entry decoded like openFile');
  // event loop not blocked: interval ticks advance during a search over 300 generated files (regex: full decode of each)
  let ticks = 0; const iv = setInterval(() => ticks++, 1);
  const tl0 = Date.now(), s7 = await post('search', { mod, q: 'zzqq\\d', regex: true, vanilla: true }), tl = Date.now() - tl0;
  clearInterval(iv);
  ok(s7.hits.some(h => h.key === 'resource/set/gen/g299.set' && h.line === 2001) && s7.searched >= 300, 'search over 300 generated files finds the one hit');
  ok(ticks >= 3, 'event loop ticks during search: ' + ticks + ' ticks in ' + tl + ' ms');
  // cancel: a newer search with the same sid answers, the older answers {cancelled:true}; another sid is untouched
  const pA = post('search', { mod, q: 'zzqq\\d', regex: true, vanilla: true, sid: 'page1' });
  const pC = post('search', { mod, q: 'zzqq\\d', regex: true, vanilla: true, sid: 'page2' });
  await new Promise(r => setTimeout(r, 5));
  const pB = post('search', { mod, q: 'paktoken', vanilla: true, sid: 'page1' });
  const [rA, rB, rC] = await Promise.all([pA, pB, pC]);
  ok(rA.cancelled === true && !rA.hits.length, 'older search with same sid cancelled');
  ok(!rB.cancelled && rB.hits.some(h => h.key === 'resource/set/pk.set'), 'newer search answers');
  ok(!rC.cancelled && rC.hits.some(h => h.key === 'resource/set/gen/g299.set'), 'other sid not cancelled');
  {   // JOBS: the footer's Cancel stops a running search through the request's job handle
    let stop = null; const job = { onCancel: f => { stop = f; }, canCancel: false, writes: false };
    const pJ = R['POST /api/x/files/search'](U('/api/x/files/search'), { mod, q: 'zzqq\\d', regex: true, vanilla: true }, Object.assign({}, ctx, { job }));
    await require('../../../lib/test/wait').until(() => typeof stop === 'function', { who: 'files test', what: 'the search handing its job a stop', step: 1 });
    ok(job.canCancel === true && typeof stop === 'function' && !job.writes, 'search: stoppable from the job list, not a write');
    stop(); const rJ = await pJ;
    ok(rJ.cancelled === true && !rJ.hits.length, 'search: stopped from the job list at its next slice');
  }
  await rejects(() => post('search', { mod, q: '(', regex: true }), /not a valid/, 'bad regex refused');
  await rejects(() => post('search', { mod, q: '' }), /Type 1/, 'empty search refused');
  const ho = await get('open', { mod, path: path.join(otherDir, 'entity', 'z.def') });
  ok(!ho.editable && ho.why === 'outside', 'hit outside mod opens read-only');
  const hi = await get('open', { mod, path: path.join(mod, gunRel) });
  ok(hi.editable && hi.rel === gunRel, 'hit inside mod opens editable');

  // ---- explore with no mod: which and open by key read the game as it ships (no profile mods); writes still need a mod
  const nw = await get('which', { key: 'resource/entity/gun.def' });
  ok(nw.mod === null && nw.chain.length === 1 && nw.chain[0].kind === 'vanilla' && nw.winner === 'vanilla' && nw.notes.includes('no-mod'), 'which with no mod: the game alone (the profile mod is left out) [' + JSON.stringify(nw.chain.map(c => c.kind)) + ' ' + nw.notes + ']');
  const nwr = await get('which', { rel: 'resource/set/pk.set' });
  ok(nwr.mounted && nwr.chain.length === 1 && nwr.chain[0].source === 'pak', 'which with no mod reads the game paks');
  const no = await get('open', { key: 'resource/entity/gun.def', idx: 0 });
  ok(!no.editable && /damage 10/.test(no.text), 'open by key with no mod reads the game file, read only');
  // seeded defects: a key that climbs out, writes with no mod, no game folder
  await rejects(() => get('which', { key: 'resource/../../../dev/outmod/resource/set/x.set' }), /"\.\."/, 'which with no mod refuses a key with ..');
  await rejects(() => get('open', { key: 'resource/../../unpacked/entity/z.def', idx: 0 }), /"\.\."/, 'open by key with no mod refuses a key with ..');
  await rejects(() => post('save', { rel: 'resource/set/x.set', text: 'x', write: true }), /Pick your mod/, 'save with no mod is still refused');
  await rejects(() => post('copy', { key: 'resource/entity/gun.def', write: true }), /Pick your mod/, 'copy into a mod with no mod is still refused');
  await rejects(() => post('restore', { id: 'x' }), /Pick your mod/, 'restore with no mod is still refused');
  await rejects(() => R['GET /api/x/files/which'](U('/api/x/files/which', { key: 'resource/entity/gun.def' }), null, Object.assign({}, ctx, { game: () => null })), /Pick your mod/, 'no mod and no game folder: refused as before');
  await rejects(() => get('tree', {}), /Pick your mod/, 'the mod tree still needs a mod');
  // a phone with no mod: the game folder must be one the PC page shows; a path outside the game root is refused
  const under = (p, r) => { const a = path.resolve(p).toLowerCase(), b = path.resolve(r).toLowerCase(); return a === b || a.startsWith(b + path.sep); };
  const phone = Object.assign({}, ctx, { session: { remote: true }, pathOk: p => under(p, game) });
  const pget = (name, q, c) => R['GET /api/x/files/' + name](U('/api/x/files/' + name, q), null, c || phone);
  const pw = await pget('which', { key: 'resource/entity/gun.def' });
  ok(pw.chain.length === 1, 'a phone with no mod reads the game view when the game folder is shown');
  ok(/damage 10/.test((await pget('open', { key: 'resource/entity/gun.def', idx: 0 })).text), 'a phone with no mod opens a game file by key');
  await rejects(() => pget('open', { path: path.join(otherDir, 'entity', 'z.def') }), /View only/, 'a phone with no mod: a path outside the game root is refused');
  await rejects(() => pget('which', { key: 'resource/entity/gun.def' }, Object.assign({}, phone, { pathOk: p => under(p, outside) })), /View only/, 'a phone whose page does not show the game folder gets nothing with no mod');

  // nothing written to game outside mods/mine, GoH untouched
  ok(fs.readFileSync(path.join(game, 'resource', 'entity', 'gun.def')).equals(vanillaDef), 'vanilla untouched');

  // ---- the default budget: a lib loaded with no env (as the GUI loads it) stops a search at 8 s; a bad value falls back to it
  for (const v of [undefined, 'x', '50']) {
    const env = Object.assign({}, process.env); delete env.ARSENAL_FILES_SEARCH_MS; if (v !== undefined) env.ARSENAL_FILES_SEARCH_MS = v;
    const r = require('child_process').spawnSync(process.execPath, ['-e', 'process.stdout.write(String(require(process.argv[1]).SEARCH.ms))', path.join(__dirname, 'lib.js')], { encoding: 'utf8', env });
    ok(r.stdout === '8000', 'search budget with ' + (v === undefined ? 'no env' : 'env ' + v) + ' is 8000 ms (got ' + r.stdout + String(r.stderr || '').slice(0, 200) + ')');
  }
  ok(SEARCH_MS_SET || lib.SEARCH.ms === 60000, 'the fixture searches run with the 60 s test budget');

  // ---- one real search against the real install (read-only; numbers printed, not asserted). It runs with this process's budget
  // (60 s unless the caller set one), so its line names that budget: with the GUI's 8 s it may stop at 'time' on a loaded machine
  const real = REAL;
  if (real && fs.existsSync(path.join(real, 'resource'))) {
    const rctx = Object.assign({}, ctx, { game: () => real });
    let rt = 0, last = Date.now(), gaps = []; const riv = setInterval(() => { rt++; const t = Date.now(); gaps.push(t - last); last = t; }, 5);
    const w0 = Date.now(), rr2 = await R['POST /api/x/files/search'](U('/api/x/files/search'), { mod: outside, q: 't34', vanilla: true }, rctx), wall = Date.now() - w0;
    clearInterval(riv);
    const pk = rr2.hits.filter(h => h.pak).length;
    console.log('real install "t34": searched ' + rr2.searched + ' files, ' + rr2.hits.length + ' hits (' + pk + ' from paks), ' + rr2.ms + ' ms (wall ' + wall + ' ms), budget ' + rr2.caps.ms + ' ms, truncated ' + rr2.truncated + (rr2.partial ? ' partial' : '') + ', ticks ' + rt + ', longest stalls ms ' + gaps.sort((a, b) => b - a).slice(0, 5).join(','));
    if (rr2.hits[0]) console.log('  first game hit: ' + JSON.stringify(rr2.hits.find(h => h.root === 'vanilla')));
    // the budget stopped it: a generous upper bound (a busy PC overruns the last slice; the TIME line keeps the number)
    require('../../../lib/test/wait').time('files test', 'real search over its ' + rr2.caps.ms + ' ms budget by', rr2.ms - rr2.caps.ms);
    ok(!rr2.cancelled && rr2.ms <= rr2.caps.ms + 60000, 'real search ends inside the budget');
  } else console.log('note: real install not found, real search skipped');
  // ---- CACHE (gui README): the tree comes from the shared walk and the store entry the Editor keeps; a write tells the walk
  {
    const mf = require('./modfiles'), k = mf.kit(ctx);
    const t1 = await get('tree', { mod });
    const st = mf.treeState(ctx, mod);
    ok(st.state === 'ready', 'cache: the tree is kept in the store (ide.tree) ' + JSON.stringify(st));
    const t2 = await get('tree', { mod });
    ok(JSON.stringify(t2.files) === JSON.stringify(t1.files) && t2.truncated === t1.truncated, 'cache: the kept tree equals the built one');
    fs.writeFileSync(path.join(mod, 'resource', 'cache-new.txt'), 'x\r\n');
    await k.mt.ensure(mod, { maxAgeMs: 0 });
    ok(mf.treeState(ctx, mod).state === 'stale', 'cache: a file added to the mod makes the kept tree stale');
    const t3 = await get('tree', { mod });
    ok(t3.files.length === t1.files.length + 1 && t3.files.some(x => x.rel === 'resource/cache-new.txt') && mf.treeState(ctx, mod).state === 'ready', 'cache: and the next tree has it and is kept again');
    fs.rmSync(path.join(mod, 'resource', 'cache-new.txt'));
    // save: a preview does not touch the walk, a write does
    const touched = [];
    ctx.modtree = Object.assign({}, k.mt, { touch: m => { touched.push(m); return k.mt.touch(m); } });
    try {
      const rel = 'resource/cache-save.txt';
      fs.writeFileSync(path.join(mod, rel), 'one\r\n');
      const o1 = await get('open', { mod, rel });
      await post('save', { mod, rel, base: o1.hash, text: 'two\r\n' });
      ok(touched.length === 0, 'cache: a save preview does not touch the shared walk');
      const w1 = await post('save', { mod, rel, base: o1.hash, text: 'two\r\n', write: true });
      ok(w1.written && touched.length === 1 && path.resolve(touched[0]) === path.resolve(mod), 'cache: a save that writes calls modtree.touch(mod) ' + JSON.stringify(touched));
      fs.rmSync(path.join(mod, rel));
    } finally { delete ctx.modtree; }
  }
  // ---- SPEED: a server route waits for the shared scan first (lib.vfsWarm), so vfsFor does not walk the mod; the same answer
  {
    const mf = require('./modfiles'), k = mf.kit(ctx), vfsLib = require('../../../lib/vfs'), build = vfsLib.build; let walks = 0;
    const q = { mod, rel: 'resource/set/x.set' }, plainW = await get('which', q);
    lib._reset(); k.mt.touch(mod);
    vfsLib.build = function (o) { if (o && ((o.mods && o.mods.length) || (o.modDirs && o.modDirs.length)) && !(o.listings && o.listings.length)) walks++; return build.apply(this, arguments); };
    ctx.modtree = k.mt;
    try {
      ok(!k.mt.fresh(mod), 'speed: no scan of the mod stands');
      const w = await get('which', q);
      ok(!!k.mt.fresh(mod) && walks === 0, 'speed: which waited for the shared scan, the view came from the listing (' + walks + ' walks)');
      ok(JSON.stringify(w) === JSON.stringify(plainW), 'speed: which answers as before');
      k.mt.touch(mod);
      const w2 = await get('which', q);
      ok(JSON.stringify(w2) === JSON.stringify(plainW) && walks === 0, 'speed: asked again inside 45 s after a touch: the kept view, no wait and no walk');
      await lib.vfsWarm(ctx, path.join(work, 'no-such-mod')); await lib.vfsWarm(ctx, ''); await lib.vfsWarm(null, mod);
      ok(true, 'speed: vfsWarm never throws');
    } finally { vfsLib.build = build; delete ctx.modtree; lib._reset(); }
    k.mt.touch(mod);
    await lib.vfsWarm(ctx, mod);
    ok(!k.mt.fresh(mod), 'speed: vfsWarm does nothing with no ctx.modtree (a tool, a test)');
  }
  // ---- game parity (MoW:AS2, GoH): its own fixture and env in a child process (test-games.js)
  {
    const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, 'test-games.js'), path.join(work, 'games')], { encoding: 'utf8', env: Object.assign({}, process.env, { AS2_GAME_REAL: REAL || '' }) });
    const last = String(r.stdout || '').trim().split('\n').pop();
    if (r.status !== 0) console.log(String(r.stdout || '') + String(r.stderr || ''));
    ok(r.status === 0, 'game parity test (test-games.js): ' + last);
  }
  {   // the in-memory text search (corpus.js): its own test, run here so the files suite covers it
    const r = require('../../../lib/test/wait').spawnSync(process.execPath, [path.join(__dirname, 'corpus.test.js')], { encoding: 'utf8', timeout: 120000 }, 'files test');
    ok(r.status === 0, 'corpus test (corpus.test.js): ' + String(r.stdout + r.stderr).trim().split(/[\r\n]+/).slice(-3).join(' | '));
  }
  console.log(bad ? bad + ' of ' + n + ' failed' : 'files ext ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
