// files ext, game parity test (run by ./test.js in a child process; also alone). Arg: scratch dir. Made-up fixture only: one AS2
// install (as64.exe + mowas_2.exe, as64/core, as64/plus), one GoH install (binaries/x64/call_to_arms.exe, localizations), a GoH
// profile under a fake home, a GoH Workshop item and a GoH mod outside the install. No real game, no network, nothing started.
// Checks: MoW:AS2 sees the AS2 install without as64/core and as64+ (vfs exe mowas_2) and never shares a cached view with AS64;
// GoH reads the GoH install, profile and text language; a mod inside the GoH install or a GoH Workshop item is read only (why 'goh',
// note 'goh-ro'), its writes refused with a plain line; a GoH mod outside the install is read and written; AS64 is unchanged.
// Author: Imperator_Aug (ARSENAL, ia-12c27661)
const fs = require('fs'), path = require('path');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'filesg-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
let bad = 0, n = 0;
const ok = (c, m, more) => { n++; if (!c) { bad++; console.log('FAIL ' + m + (more ? ' ' + more : '')); } };
const wr = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };

// ---- fixture
const as2 = path.join(work, 'steamapps', 'common', 'as2'), goh = path.join(work, 'steamapps', 'common', 'goh'), home = path.join(work, 'home');
process.env.GOH_GAME = goh; process.env.AS2_GAME = as2; process.env.AS2_NO_STEAM = '1'; process.env.AS2_HOME = home; delete process.env.ARSENAL_ADVANCED;
wr(path.join(as2, 'as64.exe'), 'MZ'); wr(path.join(as2, 'mowas_2.exe'), 'MZ');
wr(path.join(as2, 'resource', 'entity', 'gun.def'), '{as2 vanilla}\r\n');
wr(path.join(as2, 'as64', 'core', 'resource', 'entity', 'core.def'), '{as64 core only}\r\n');
wr(path.join(as2, 'as64', 'plus', 'mod.info'), '{mod {name "as64+"}}\r\n');
const amod = path.join(as2, 'mods', 'mine');
wr(path.join(amod, 'mod.info'), '{mod {name "Mine"} {MinGameVersion "3.301"}}\r\n');
wr(path.join(amod, 'resource', 'entity', 'gun.def'), '{mine}\r\n');
// a mod made for MoW:AS2 (both bounds, 3.262 in range) and one with MinGameVersion and no Max (as <AS2>/mods/ai3_t ships)
const m2mod = path.join(as2, 'mods', 'mine2');
wr(path.join(m2mod, 'mod.info'), '{mod {name "Mine2"} {MinGameVersion "3.260"} {MaxGameVersion "3.262"}}\r\n');
wr(path.join(m2mod, 'resource', 'entity', 'gun.def'), '{mine2}\r\n');
const nomax = path.join(as2, 'mods', 'nomax');
wr(path.join(nomax, 'mod.info'), '{mod {name "NoMax"} {MinGameVersion "3.260"}}\r\n');
wr(path.join(nomax, 'resource', 'entity', 'gun.def'), '{nomax}\r\n');
wr(path.join(home, 'Documents', 'my games', 'men of war - assault squad 2', 'profiles', 'p1', 'options.set'), '{options {mods}}\r\n');

wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
wr(path.join(goh, 'resource', 'entity', 'gun.def'), '{goh vanilla}\r\n');
wr(path.join(goh, 'resource', 'entity', 'gohonly.def'), '{gohonly gohword}\r\n');
wr(path.join(goh, 'localizations', 'default', 'interface', 'text', 'units.pot'), 'msgid "a"\r\nmsgstr "vanilla"\r\n');
const gmod = path.join(goh, 'mods', 'gm');
wr(path.join(gmod, 'mod.info'), '{mod {name "Gm"} {MinGameVersion "1.0"} {MaxGameVersion "any"}}\r\n');
wr(path.join(gmod, 'resource', 'entity', 'gun.def'), '{gm}\r\n');
wr(path.join(gmod, 'localizations', 'default', 'interface', 'text', 'units.pot'), 'msgstr "gm default"\r\n');
wr(path.join(gmod, 'localizations', 'ger', 'interface', 'text', 'units.pot'), 'msgstr "gm ger"\r\n');
wr(path.join(gmod, 'localizations', 'fra', 'interface', 'text', 'units.pot'), 'msgstr "gm fra"\r\n');
wr(path.join(gmod, 'resource', 'entity', 'sub.pak'), require('../../../lib/zipwrite').zip([['sub/in.def', Buffer.from('{in}\r\n'), false]]));
// GoH profile (GHVFS-13): LocalAppData under the fake home; mods list and the text language (GHLOC-04 profile option)
wr(path.join(home, 'AppData', 'Local', 'digitalmindsoft', 'gates of hell', 'profiles', '1', 'options.set'), '{options\r\n\t{mods "gm:0"}\r\n\t{game\r\n\t\t{language "ger"}\r\n\t}\r\n}\r\n');
const item = path.join(work, 'steamapps', 'workshop', 'content', '400750', '777');
wr(path.join(item, 'mod.info'), '{mod {name "Item"}}\r\n');
wr(path.join(item, 'resource', 'entity', 'ws.def'), '{ws}\r\n');
// a GoH Workshop item that ships only paks, as real items do: resource/<name>.pak keyed at resource/, one entry over a GoH game file
const pitem = path.join(work, 'steamapps', 'workshop', 'content', '400750', '779');
wr(path.join(pitem, 'mod.info'), '{mod {name "Pak item"}}\r\n');
wr(path.join(pitem, 'resource', 'britain.pak'), require('../../../lib/zipwrite').zip([['sound/eng/folder.set', Buffer.from('{pakset}\r\n'), false], ['entity/gun.def', Buffer.from('{pak gun}\r\n'), false]]));
// a GoH Workshop item that ships one key twice: loose resource/entity/twice.def and inside resource/entity/zz.pak (sorts after it)
const titem = path.join(work, 'steamapps', 'workshop', 'content', '400750', '780');
wr(path.join(titem, 'mod.info'), '{mod {name "Twice"}}\r\n');
wr(path.join(titem, 'resource', 'entity', 'twice.def'), '{twice loose}\r\n');
wr(path.join(titem, 'resource', 'entity', 'zz.pak'), require('../../../lib/zipwrite').zip([['twice.def', Buffer.from('{twice pak}\r\n'), false]]));
const as2item = path.join(work, 'steamapps', 'workshop', 'content', '244450', '888');
wr(path.join(as2item, 'mod.info'), '{mod {name "Old"}}\r\n');
const gout = path.join(work, 'dev', 'gohout');
wr(path.join(gout, 'mod.info'), '{mod {name "Out"}}\r\n');
wr(path.join(gout, 'resource', 'entity', 'gun.def'), '{gohout}\r\n');
wr(path.join(gout, 'localizations', 'default', 'interface', 'text', 'units.pot'), 'msgstr "out"\r\n');

const ext = require('./index'), lib = require('./lib');
const T = { as64: ['as64', 'as2'], mowas2: ['mowas_2', 'as2'], goh: ['goh', 'goh'] };
const base = { tools: path.join(__dirname, '..', '..', '..'), tmpRoot: work, game: () => as2, allowLaunch: false, runTool: async () => ({ code: 1 }) };
// the ctx gui.js gives an ext route (gameId, exe, kind, gohDir, curDir); null = an old ctx with no game functions (AS64)
const mk = gid => (gid ? Object.assign({}, base, { gameId: () => gid, exe: () => T[gid][0], kind: () => T[gid][1], gohDir: () => goh, curDir: () => (gid === 'goh' ? goh : as2) }) : base);
const R = ext.routes;
const U = (p, q) => { const u = new URL('http://x' + p); for (const k of Object.keys(q || {})) u.searchParams.set(k, q[k]); return u; };
const get = (gid, name, q) => R['GET /api/x/files/' + name](U('/api/x/files/' + name, q), null, mk(gid));
const post = (gid, name, b) => R['POST /api/x/files/' + name](U('/api/x/files/' + name), b, mk(gid));
async function rejects(fn, re, m) { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status >= 400 && re.test(e.message), m, e ? '[' + e.message + ']' : '[no error]'); }

(async () => {
  // ---- helpers
  ok(lib.gidOf(null) === 'as64' && lib.gidOf(base) === 'as64' && lib.gidOf(mk('mowas2')) === 'mowas2' && lib.gidOf(mk('goh')) === 'goh' && lib.gidOf({ gameId: () => 'x' }) === 'as64', 'gidOf: as64 unless mowas2 or goh');
  // a lib's own ctx with ctx.exe() and no game id (task GM.view, ide routes): the game is taken by its exe; a game id still wins
  const xc = x => Object.assign({}, base, { exe: () => x, curDir: () => (x === 'goh' ? goh : as2) });
  ok(lib.gidOf(xc('mowas_2')) === 'mowas2' && lib.gidOf(xc('mowas2')) === 'mowas2' && lib.gidOf(xc('goh')) === 'goh' && lib.gidOf(xc('as64')) === 'as64' && lib.gidOf(xc('zz')) === 'as64' && lib.gidOf(Object.assign(xc('goh'), { gameId: () => 'mowas2' })) === 'mowas2', 'gidOf: ctx.exe() when no game id');
  ok(lib.vfsFor(xc('mowas_2'), m2mod).v.exe === 'mowas_2' && lib.vfsFor(xc('goh'), null).v.exe === 'goh' && lib.gameOf(xc('goh')) === goh, 'vfsFor: an exe-only ctx gets that game\'s view (curDir under GoH)');
  ok(lib.exeOf(mk('mowas2')) === 'mowas_2' && lib.exeOf(mk('goh')) === 'goh' && lib.exeOf(base) === 'as64', 'exeOf: the vfs exe');
  ok(lib.gameOf(mk('goh')) === goh && lib.gameOf(mk('mowas2')) === as2 && lib.gameOf(base) === as2, 'gameOf: GoH install under goh, else the AS2 install');

  // ---- AS64 unchanged: an old ctx and as64 named give the same answers
  const a0 = await get(null, 'which', { mod: amod, rel: 'resource/entity/gun.def' }), a1 = await get('as64', 'which', { mod: amod, rel: 'resource/entity/gun.def' });
  ok(JSON.stringify(a0) === JSON.stringify(a1) && a0.winner === 'mine' && a0.notes.includes('as-enhanced'), 'AS64: old ctx = as64 ctx, as64+ mode shown', JSON.stringify(a0.notes));
  const c64 = await get('as64', 'which', { key: 'resource/entity/core.def' });
  ok(c64.chain.length === 1 && c64.winner === 'vanilla' && /as64\/core/.test(c64.chain[0].layer + c64.chain[0].container), 'AS64 sees as64/core', JSON.stringify(c64.chain));

  // ---- MoW:AS2 (1:1 with AS64, its own exe)
  const cm = await get('mowas2', 'which', { key: 'resource/entity/core.def' });
  ok(cm.chain.length === 0 && !cm.winner, 'MoW:AS2: no as64/core in its view', JSON.stringify(cm.chain));
  const wm = await get('mowas2', 'which', { mod: m2mod, rel: 'resource/entity/gun.def' });
  ok(wm.winner === 'mine' && wm.chain.length === 2 && wm.chain[1].kind === 'vanilla' && !wm.notes.includes('as-enhanced') && wm.notes.includes('not-enabled') && !wm.notes.some(x => /^dropped/.test(x)), 'MoW:AS2: mod over vanilla, no as64+ mode', JSON.stringify(wm.notes));
  ok(lib.vfsFor(mk('mowas2'), m2mod).v.exe === 'mowas_2' && lib.vfsFor(mk('as64'), m2mod).v.exe === 'as64' && lib.vfsFor(mk('mowas2'), m2mod).v !== lib.vfsFor(mk('as64'), m2mod).v, 'MoW:AS2 and AS64 never share a cached view');
  const c64b = await get('as64', 'which', { key: 'resource/entity/core.def' });
  ok(c64b.chain.length === 1, 'AS64 after MoW:AS2 still sees as64/core (cache keyed by game)');
  const tm = await get('mowas2', 'tree', { mod: m2mod });
  ok(tm.files.some(f => f.rel === 'resource/entity/gun.def' && f.state === 'override'), 'MoW:AS2: tree states');
  const om = await get('mowas2', 'open', { mod: m2mod, rel: 'resource/entity/gun.def' });
  ok(om.editable === true, 'MoW:AS2: a mod file opens editable');
  const sm = await post('mowas2', 'save', { mod: m2mod, rel: 'resource/entity/gun.def', base: om.hash, text: '{mine2 2}\n', write: true });
  ok(sm.written && fs.readFileSync(path.join(m2mod, 'resource', 'entity', 'gun.def'), 'latin1') === '{mine2 2}\r\n', 'MoW:AS2: save into <AS2>/mods/<mod> as under AS64');
  const um = await get('mowas2', 'undo', { mod: m2mod });
  ok(um.list.length === 1, 'MoW:AS2: restore point listed');
  const sr = await post('mowas2', 'search', { mod: m2mod, q: 'as64 core only', vanilla: true });
  ok(!sr.hits.some(h => h.root === 'vanilla'), 'MoW:AS2: game search never shows as64/core files');
  ok(lib.modsFor(mk('mowas2'), m2mod).join() === 'mine2' && lib.modsFor(mk('as64'), amod).join() === 'as64+,mine', 'modsFor: the editor\'s mod list per game', lib.modsFor(mk('as64'), amod).join());
  // MoW:AS2 legacy range rule (VFS-48, PORT-48): MinGameVersion with no Max, or a Min above 3.262, = the game skips the mod
  for (const [m, what] of [[nomax, 'Min and no Max'], [amod, 'Min 3.301 (an AS64 Enhanced mod)']]) {
    const wd = await get('mowas2', 'which', { mod: m, rel: 'resource/entity/gun.def' });
    ok(wd.winner === 'vanilla' && wd.notes.includes('dropped-version') && !wd.notes.includes('not-enabled') && !wd.chain.some(r => r.kind === 'mine'), 'MoW:AS2: a mod with ' + what + ' is left out (dropped-version)', JSON.stringify(wd));
    ok((await get('mowas2', 'tree', { mod: m })).files.find(f => f.rel === 'resource/entity/gun.def').state === 'loses', 'MoW:AS2: its files lose in the tree (' + what + ')');
  }
  ok(lib.modsFor(mk('mowas2'), nomax).join() === '' && lib.modsFor(mk('as64'), nomax).join() === 'nomax', 'modsFor: the skipped mod is not in the MoW:AS2 list; AS64 as before');
  const wn64 = await get('as64', 'which', { mod: nomax, rel: 'resource/entity/gun.def' });
  ok(wn64.winner === 'mine' && !wn64.notes.includes('dropped-version'), 'AS64: the same mod shown as before (no version check here)', JSON.stringify(wn64.notes));

  // ---- GoH: a mod in <GoH>/mods read only
  const tg = await get('goh', 'tree', { mod: gmod });
  const tk = r => (tg.files.find(f => f.rel === r) || {});
  ok(tg.notes.includes('goh-ro') && !tg.notes.includes('not-enabled') && !tg.notes.includes('no-profile'), 'GoH tree: read only note, mod found switched on in the GoH profile', JSON.stringify(tg.notes));
  ok(tk('localizations/default/interface/text/units.pot').key === 'resource/interface/text/units.pot' && tk('localizations/ger/interface/text/units.pot').key === 'resource/interface/text/units.pot' && tk('localizations/fra/interface/text/units.pot').state === 'unmounted', 'GoH tree: default and the chosen language are read, another language is not', JSON.stringify(tg.files));
  ok(tk('resource/entity/gun.def').state === 'override' && tk('resource/entity/sub.pak:\x3asub/in.def').key === 'resource/entity/sub/in.def', 'GoH tree: override state, a pak under resource/ keyed at its folder', JSON.stringify(tk('resource/entity/sub.pak:\x3asub/in.def')));
  const wg = await get('goh', 'which', { mod: gmod, rel: 'resource/entity/gun.def' });
  ok(wg.winner === 'mine' && wg.chain.length === 2 && wg.chain[1].kind === 'vanilla' && wg.game === goh, 'GoH which: mod over GoH vanilla', JSON.stringify(wg));
  const wl = await get('goh', 'which', { mod: gmod, rel: 'localizations/ger/interface/text/units.pot' });
  ok(wl.key === 'resource/interface/text/units.pot' && wl.winner === 'mine' && /ger/.test(wl.chain[0].entry + wl.chain[0].container), 'GoH which: the chosen language layer wins (GHLOC-01)', JSON.stringify(wl.chain));
  const v = lib.vfsFor(mk('goh'), gmod);
  ok(v.v.exe === 'goh' && v.lang === 'ger' && v.gid === 'goh', 'GoH vfs: exe goh, language from the profile');
  const og = await get('goh', 'open', { mod: gmod, rel: 'resource/entity/gun.def' });
  ok(og.editable === false && og.why === 'goh' && og.text === '{gm}\n', 'GoH: a file of a mod inside the GoH install opens read only (why goh)');
  const op = await get('goh', 'open', { mod: gmod, rel: 'resource/entity/sub.pak:\x3asub/in.def' });
  ok(op.editable === false && op.why === 'goh', 'GoH: an entry of that mod\'s pak opens read only');
  await rejects(() => post('goh', 'save', { mod: gmod, rel: 'resource/entity/gun.def', text: 'x', write: true }), /switch on Advanced under Tools & Settings/, 'GoH: save into <GoH>/mods refused with the plain line (Advanced off)');
  await rejects(() => post('goh', 'save', { mod: gmod, rel: 'resource/entity/gun.def', text: 'x' }), /switch on Advanced under Tools & Settings/, 'GoH: save preview refused too');
  await rejects(() => post('goh', 'copy', { mod: gmod, key: 'resource/entity/gohonly.def', idx: 0, write: true }), /switch on Advanced under Tools & Settings/, 'GoH: copy into <GoH>/mods refused');
  await rejects(() => post('goh', 'restore', { mod: gmod, id: '20260101-000000-000' }), /switch on Advanced under Tools & Settings/, 'GoH: restore into <GoH>/mods refused');
  ok((await get('goh', 'undo', { mod: gmod })).list.length === 0, 'GoH: restore point list reads');
  ok(fs.readFileSync(path.join(gmod, 'resource', 'entity', 'gun.def'), 'latin1') === '{gm}\r\n', 'GoH mod untouched');
  // owner 2026-11-15: with Advanced on (Tools & Settings -> ARSENAL_ADVANCED=1) a mod in <GoH>/mods that ARSENAL did not make may be written; preview only here
  process.env.ARSENAL_ADVANCED = '1';
  try { const pv = await post('goh', 'save', { mod: gmod, rel: 'resource/entity/gun.def', text: 'x' }); ok(pv && !pv.error, 'GoH: save preview into <GoH>/mods passes with Advanced on', JSON.stringify(pv).slice(0, 200)); }
  catch (e) { ok(false, 'GoH: save preview into <GoH>/mods passes with Advanced on', e.message); }
  finally { delete process.env.ARSENAL_ADVANCED; }
  ok(fs.readFileSync(path.join(gmod, 'resource', 'entity', 'gun.def'), 'latin1') === '{gm}\r\n', 'GoH mod untouched by the preview');
  const sg = await post('goh', 'search', { mod: gmod, q: 'gohword', vanilla: true });
  ok(sg.hits.some(h => h.root === 'vanilla' && h.key === 'resource/entity/gohonly.def'), 'GoH search: the GoH game files', JSON.stringify(sg.hits));
  const sg2 = await post('goh', 'search', { mod: gmod, q: 'vanilla', vanilla: true });
  ok(!sg2.hits.some(h => h.root === 'vanilla' && h.key === 'resource/interface/text/units.pot') && !sg2.hits.some(h => /as2 vanilla/.test(h.text)), 'GoH search: a game text the mod replaces in a language folder is skipped; no AS2 file', JSON.stringify(sg2.hits));
  // ---- GoH refusals that stay
  await rejects(() => get('goh', 'tree', { mod: goh }), /part of the Gates of Hell install/, 'GoH: the install itself is not a mod');
  await rejects(() => get('goh', 'tree', { mod: path.join(goh, 'resource') }), /part of the Gates of Hell install/, 'GoH: vanilla data is not a mod');
  await rejects(() => get('goh', 'tree', { mod: path.join(gmod, 'resource') }), /part of the Gates of Hell install/, 'GoH: a folder inside a mod is not the mod');
  await rejects(() => get('as64', 'tree', { mod: gmod }), /belongs to Gates of Hell/, 'AS64 page: a GoH mod refused as before');
  await rejects(() => get('mowas2', 'tree', { mod: gmod }), /belongs to Gates of Hell/, 'MoW:AS2 page: a GoH mod refused');
  // ---- GoH Workshop item: read in place
  const ti = await get('goh', 'tree', { mod: item });
  ok(ti.notes.includes('goh-ro') && ti.files.some(f => f.rel === 'resource/entity/ws.def'), 'GoH Workshop item: tree read only', JSON.stringify(ti.notes));
  const oi = await get('goh', 'open', { mod: item, rel: 'resource/entity/ws.def' });
  ok(!oi.editable && oi.why === 'goh', 'GoH Workshop item: open read only');
  await rejects(() => post('goh', 'save', { mod: item, rel: 'resource/entity/ws.def', text: 'x', write: true }), /Workshop/, 'GoH Workshop item: no save');
  await rejects(() => get('goh', 'tree', { mod: path.join(item, 'resource') }), /Workshop item folder itself/, 'GoH Workshop: a folder inside an item is not the mod');
  await rejects(() => get('goh', 'tree', { mod: as2item }), /Workshop/, 'GoH page: an AS2 Workshop item refused');
  await rejects(() => get('as64', 'tree', { mod: item }), /Workshop/, 'AS64 page: a GoH Workshop item refused as before');
  // a pak-only Workshop item: which finds its pak entries (the item is mounted as a folder layer on top)
  const tp = await get('goh', 'tree', { mod: pitem });
  const pk = (tp.files.find(f => f.rel === 'resource/britain.pak:\x3asound/eng/folder.set') || {}).key;
  ok(pk === 'resource/sound/eng/folder.set', 'GoH pak-only Workshop item: tree keys a pak entry at resource/', JSON.stringify(tp.files));
  const wp = await get('goh', 'which', { mod: pitem, key: pk });
  ok(wp.winner === 'mine' && wp.chain.length === 1 && wp.chain[0].source === 'pak' && /britain\.pak$/.test(wp.chain[0].container) && wp.notes.includes('goh-ro'), 'GoH pak-only Workshop item: which shows the item\'s pak entry', JSON.stringify(wp));
  const wp2 = await get('goh', 'which', { mod: pitem, key: 'resource/entity/gun.def' });
  ok(wp2.winner === 'mine' && wp2.chain.length === 3 && wp2.chain[0].source === 'pak' && wp2.chain[1].kind === 'othermod' && wp2.chain[2].kind === 'vanilla', 'GoH pak-only Workshop item: its pak entry over the switched-on mod and the GoH game file', JSON.stringify(wp2.chain));
  const opk = await get('goh', 'open', { mod: pitem, key: 'resource/entity/gun.def', idx: 2 });
  ok(/pak gun/.test(opk.text) && !opk.editable, 'GoH pak-only Workshop item: the pak layer opens read only by key', JSON.stringify(opk));
  ok((await get('goh', 'which', { mod: pitem, key: 'resource/entity/gohonly.def' })).winner === 'vanilla', 'GoH pak-only Workshop item: a file it does not ship stays vanilla');
  // Workshop items switched on in the GoH profile: still one layer, 'this mod', on top (not a listed 'othermod' layer as well)
  const gprof = path.join(home, 'AppData', 'Local', 'digitalmindsoft', 'gates of hell', 'profiles', '1', 'options.set'), gprof0 = fs.readFileSync(gprof);
  // the real GoH list form: mod_<item number> (GHVFS-24 [V]); vfs mounts such an entry as a listed mod 'mod_779' unless it is taken out
  wr(gprof, '{options\r\n\t{mods "gm:0" "mod_779:0" "mod_777:0"}\r\n\t{game\r\n\t\t{language "ger"}\r\n\t}\r\n}\r\n');
  const we = await get('goh', 'which', { mod: pitem, key: 'resource/entity/gun.def' });
  ok(we.winner === 'mine' && !we.chain.some(r => /mod_779/.test(r.layer || '')) && we.chain.length === 3 && we.chain[0].source === 'pak' && we.chain[0].kind === 'mine' && we.chain[1].kind === 'othermod' && we.chain[2].kind === 'vanilla' && we.notes.includes('shown-on-top'), 'GoH Workshop item switched on: its pak entry wins as this mod', JSON.stringify(we));
  const wi = await get('goh', 'which', { mod: item, rel: 'resource/entity/ws.def' });
  ok(wi.winner === 'mine' && wi.chain.length === 1 && wi.chain[0].kind === 'mine', 'GoH Workshop item switched on: its loose file shown once', JSON.stringify(wi.chain));
  ok((await get('goh', 'tree', { mod: item })).files.find(f => f.rel === 'resource/entity/ws.def').state === 'new', 'GoH Workshop item switched on: a file only it ships is new, not override');
  ok(!(await get('goh', 'which', { mod: gmod, rel: 'resource/entity/gun.def' })).notes.includes('shown-on-top'), 'GoH: a mod in <GoH>/mods keeps its list place');
  fs.writeFileSync(gprof, gprof0);
  // one key twice in an item (loose, then a pak that sorts after it in the same folder): the engine's order, the pak wins
  const wt = await get('goh', 'which', { mod: titem, key: 'resource/entity/twice.def' });
  ok(wt.chain.length === 2 && wt.chain[0].source === 'pak' && wt.chain[0].winner && wt.chain[1].source === 'loose' && !wt.chain[1].winner && wt.chain.every(r => r.kind === 'mine'), 'GoH item with a key twice: the later pak wins, as vfs mounts it', JSON.stringify(wt.chain));
  const ot = await get('goh', 'open', { mod: titem, key: 'resource/entity/twice.def', idx: wt.chain[0].idx });
  ok(/twice pak/.test(ot.text), 'GoH item with a key twice: the winner row opens the pak text', JSON.stringify(ot.text));
  // ---- GoH mod outside the install: read and written like an AS2 mod outside the game
  const to = await get('goh', 'tree', { mod: gout });
  ok(to.notes.includes('outside') && !to.notes.includes('goh-ro') && (to.files.find(f => f.rel === 'localizations/default/interface/text/units.pot') || {}).key === 'resource/interface/text/units.pot', 'GoH outside mod: tree, language folder keyed', JSON.stringify(to));
  const wo = await get('goh', 'which', { mod: gout, rel: 'localizations/default/interface/text/units.pot' });
  ok(wo.winner === 'mine' && wo.chain.length >= 2, 'GoH outside mod: its language file shown on top of the game', JSON.stringify(wo.chain));
  const oo = await get('goh', 'open', { mod: gout, rel: 'resource/entity/gun.def' });
  ok(oo.editable === true, 'GoH outside mod: opens editable');
  const so = await post('goh', 'save', { mod: gout, rel: 'resource/entity/gun.def', base: oo.hash, text: '{gohout 2}\n', write: true });
  ok(so.written && fs.readFileSync(path.join(gout, 'resource', 'entity', 'gun.def'), 'latin1') === '{gohout 2}\r\n', 'GoH outside mod: save byte-exact (CRLF kept)');
  const co = await post('goh', 'copy', { mod: gout, key: 'resource/entity/gohonly.def', idx: 0, write: true });
  ok(co.written && fs.readFileSync(path.join(gout, 'resource', 'entity', 'gohonly.def'), 'latin1') === '{gohonly gohword}\r\n', 'GoH outside mod: copy a GoH game file in');
  const wco = await get('goh', 'which', { mod: gout, key: 'resource/entity/gohonly.def' });
  ok(wco.winner === 'mine' && wco.chain.length === 2 && wco.chain[0].kind === 'mine' && wco.chain[1].kind === 'vanilla', 'GoH outside mod: the copied file wins at once (cached view built again)', JSON.stringify(wco.chain));
  fs.unlinkSync(path.join(gout, 'resource', 'entity', 'gohonly.def'));
  ok((await get('goh', 'which', { mod: gout, key: 'resource/entity/gohonly.def' })).winner === 'vanilla', 'GoH outside mod: a removed file is gone from the chain at once');
  // ---- GoH with no mod: the GoH game as it ships
  const ng = await get('goh', 'which', { key: 'resource/entity/gun.def' });
  ok(ng.chain.length === 1 && ng.winner === 'vanilla' && ng.game === goh, 'GoH no mod: the GoH game file', JSON.stringify(ng));
  const no = await get('goh', 'open', { key: 'resource/entity/gun.def', idx: 0 });
  ok(/goh vanilla/.test(no.text) && !no.editable, 'GoH no mod: open by key reads the GoH copy');
  // ---- page texts and page
  const L = require('./lang');
  ok(['files.n.gohro', 'files.ed.ro.goh'].every(k => ['en', 'ru', 'uk', 'zh'].every(l => typeof L[l][k] === 'string' && L[l][k].length > 20)), 'GoH read only texts in en, ru, uk, zh');
  ok(/function modKey\(\)\{return String\(S\.mod\|\|''\)\+'\|'\+String\(S\.gameId/.test(require('./script')), 'page: tree and open file are kept per mod and game');
  ok(fs.readFileSync(path.join(as2, 'resource', 'entity', 'gun.def'), 'latin1') === '{as2 vanilla}\r\n' && fs.readFileSync(path.join(goh, 'resource', 'entity', 'gun.def'), 'latin1') === '{goh vanilla}\r\n', 'game files untouched');
  console.log(bad ? bad + ' of ' + n + ' failed' : 'files ext game parity ' + n + ' PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
