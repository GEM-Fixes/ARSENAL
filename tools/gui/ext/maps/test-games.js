// GUI-EXT maps, game parity test (2026-11-14): the routes for MoW:AS2 and GoH. Arg: scratch dir. No game, no network: a made-up AS2
// game folder and a made-up GoH install (binaries/x64/call_to_arms.exe + loose resource/), a stand-in tool runner that records each
// tool's argument list (the tools' own --exe is their builders' part; the pair is run together by the checkers).
// Checks: AS64 argument lists unchanged; MoW:AS2 tools get --exe mowas_2 and the jobs and caches are apart; GoH: list from the GoH file
// set (<mode>.info, .pot titles), picture and copy with --exe goh and --target goh, .pot lobby title, bots in a GoH mode card, the mod
// folder outside the GoH install, a mode the map lacks through mission-clone --exe goh (o.gid of the Missions page wins), a new .pot in
// CRLF written by the real lng-add --exe goh (the one tool run for real, on the made-up folders), MC_NEEDS_MANUAL as a warning when the
// route answers ok, the captureflag pre-check in the MoW:AS2 view, a tool refusal (exit 2) shown as its one line; the page
// shows the GoH mode list and editor steps and reloads its list when the game changes.
// Author: Imperator_Aug (ARSENAL, ia-e83cc089)
const fs = require('fs'), path = require('path');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'maps-games-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), R = X.routes, t = X._t, L = X.lang;
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const put = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const failsWith = async (p, key, m) => { let e = null; try { await p(); } catch (x) { e = x; } ok(e && e.status === 400 && e.message === key, m + ' (' + (e && e.message) + ')'); };
const U = q => ({ searchParams: new URLSearchParams(q) });
const wait = async f => { let l = await f(); for (let i = 0; i < 100 && l.state === 'running'; i++) { await new Promise(r => setTimeout(r, 50)); l = await f(); } return l; };

// ---- made-up AS2 install (as64.exe beside resource/) and GoH install
const as2 = path.join(work, 'as2'); put(path.join(as2, 'as64.exe'), '');
for (const m of ['a1', 'b2']) put(path.join(as2, 'resource', 'map', 'multi', m, 'map.net'), Buffer.from([0x0a, 0x02, 0, 0]));   // AS2 map.net head
const mod2 = path.join(as2, 'mods', 'm2'); fs.mkdirSync(mod2, { recursive: true });
const goh = path.join(work, 'goh_install');
put(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
const net = Buffer.from([0x05, 0x02, 0, 0, 0, 0, 0, 0]);   // GoH map.net: cell 5, v2 (GHMAP-06); the list only looks for the file
const info = n => '{game\n  {maxPlayers ' + n + '}\n}\n';
put(path.join(goh, 'resource', 'map', 'multi', '1v1_t', 'map.net'), net);
put(path.join(goh, 'resource', 'map', 'multi', '1v1_t', 'battle_zones.info'), info(2));
put(path.join(goh, 'resource', 'map', 'multi', '1v1_t', 'battle_zones.mi'), '{mission}\n');
put(path.join(goh, 'resource', 'map', 'multi', '1v1_t', 'frontlines.info'), info(2));   // no frontlines.mi: not a mode of the map
put(path.join(goh, 'resource', 'map', 'multi', '0_frontlines', '2v2_n', 'map.net'), net);
put(path.join(goh, 'resource', 'map', 'multi', '0_frontlines', '2v2_n', 'frontlines.info'), info(4));
put(path.join(goh, 'resource', 'map', 'multi', '0_frontlines', '2v2_n', 'frontlines.mi'), '{mission}\n');
put(path.join(goh, 'resource', 'map', 'multi', 'half', 'battle_zones.info'), info(2));   // no map.net: not a map
put(path.join(goh, 'resource', 'interface', 'text', 'mission.pot'), '#, fuzzy\nmsgid ""\nmsgstr ""\n"Language: en\\n"\n\nmsgctxt "mission/multi/1v1_t/name"\nmsgid "Test Field <c(7e5be4)>[Talvisota]"\nmsgstr ""\n\nmsgctxt "mission/multi/0_frontlines/2v2_n/name"\nmsgid "North"\nmsgstr "Nord \\"N\\""\n');
put(path.join(goh, 'resource', 'set', 'multiplayer', 'games', 'battle_zones.set'), '{game\n\t{settings\n\t\t{x 1}\n\t}\n}\n');
fs.mkdirSync(path.join(goh, 'mods', 'inside'), { recursive: true });
const gmod = path.join(work, 'goh_mods', 'my_goh'); fs.mkdirSync(gmod, { recursive: true });

// ---- stand-in runner: records [tool, args]; answers per tool
const calls = [];
let answer = {};
const cp = require('child_process');
const runTool = async (tool, entry, args) => {
  calls.push([tool, args.slice()]);
  const a = answer[tool];
  if (tool === 'lng-add' && a === undefined) {   // the real lng-add (the title writer), on the made-up folders only
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', '..', '..', entry)].concat(args), { encoding: 'utf8' });
    return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: false };
  }
  const r = typeof a === 'function' ? a(args) : a;
  if (tool === 'mapview' && (!r || r.code === 0)) { const i = args.indexOf('--svg'); if (i >= 0) put(args[i + 1], '<svg>' + (args.includes('--exe') ? args[args.indexOf('--exe') + 1] : 'as64') + '</svg>'); }
  return Object.assign({ code: 0, stdout: '', stderr: '', timedOut: false }, r || {});
};
const mk = (gid, extra) => Object.assign({ game: () => as2, tmpRoot: path.join(work, 'tmp'), runTool,
  gameId: () => gid, gohDir: () => goh, curDir: () => (gid === 'goh' ? goh : as2) }, extra || {});
const opt = (a, k) => (a.indexOf(k) < 0 ? null : a[a.indexOf(k) + 1]);
const last = tool => { for (let i = calls.length - 1; i >= 0; i--) if (calls[i][0] === tool) return calls[i][1]; return null; };
const REFUSE = row => ({ code: 2, stderr: 'milint: not available for GoH: GoH mission forms are not read yet (' + row + ')\n' });

(async () => {
  // ---- helpers
  ok(t.gidOf({}) === 'as64' && t.gidOf(mk('mowas2')) === 'mowas2' && t.gidOf(mk('goh')) === 'goh' && t.gidOf(mk('zz')) === 'as64', 'gidOf: the page game, unknown or none = as64');
  ok(t.exeArgs(mk('as64')).length === 0 && t.exeArgs(mk('mowas2')).join(' ') === '--exe mowas_2' && t.exeArgs(mk('goh')).join(' ') === '--exe goh', 'exeArgs: none for as64');
  ok(t.modesFor(mk('goh')).includes('frontlines') && !t.modesFor(mk('goh')).includes('combat') && t.modesFor(mk('mowas2')).join() === t.MODES.join(), 'mode lists per kind');
  ok(t.naLine({ code: 2, stderr: 'x\nmilint: not available for GoH: why (GHMIS-54)\n' }) === 'milint: not available for GoH: why (GHMIS-54)' && t.naLine({ code: 1, stderr: 'milint: not available for GoH: w' }) === null && t.naLine({ code: 2, stderr: 'usage' }) === null, 'naLine: only exit 2 with the plain line');

  // ---- AS64: argument lists as before (no --exe)
  answer = { 'mission-clone': { stdout: 'map/multi/a1: combat\n' }, milint: { stdout: '' } };
  const c64 = mk('as64');
  let l = await wait(() => R['GET /api/x/maps/list'](U(''), null, c64));
  ok(l.state === 'done' && JSON.stringify(last('mission-clone')) === JSON.stringify(['--game', as2, '--list']), 'AS64 list: mission-clone --game G --list, unchanged ' + JSON.stringify(last('mission-clone')));
  await R['POST /api/x/maps/check'](null, { mod: mod2 }, c64);
  ok(JSON.stringify(last('milint')) === JSON.stringify([mod2, '--game', as2]), 'AS64 check: milint <mod> --game G, unchanged');
  ok(t.needGame(c64) === as2, 'AS64 needGame = the AS2 install');

  // ---- MoW:AS2: --exe mowas_2 to every tool that reads game data; own list job and cache
  answer = { 'mission-clone': a => ({ stdout: a.includes('--map') ? 'map/multi/a1: combat battle_zones\n' : 'map/multi/a1: combat\nmap/multi/b2: battle_zones\n' }), milint: { stdout: '' }, 'map-clone': { stdout: 'info: map/multi/my_a: MAPCLONE_COPIED 3 files planned\n' }, 'place-entity': { stdout: '' } };
  const cm = mk('mowas2');
  ok(t.needGame(cm) === as2, 'MoW:AS2 needGame = the shared AS2 install');
  l = await wait(() => R['GET /api/x/maps/list'](U(''), null, cm));
  ok(l.state === 'done' && l.maps.length === 2 && last('mission-clone').slice(-2).join(' ') === '--exe mowas_2', 'MoW:AS2 list: own job, mission-clone --exe mowas_2 ' + JSON.stringify(last('mission-clone')));
  const l64 = await R['GET /api/x/maps/list'](U(''), null, c64);
  ok(l64.state === 'done' && l64.maps.length === 1, 'AS64 list kept apart from the MoW:AS2 one (job and cache key carry the game)');
  const pm = await R['GET /api/x/maps/picture'](U('map=map/multi/a1'), null, cm);
  ok(pm.svg === '<svg>mowas_2</svg>' && last('mapview').slice(-2).join(' ') === '--exe mowas_2', 'MoW:AS2 picture: mapview --exe mowas_2');
  const p64 = await R['GET /api/x/maps/picture'](U('map=map/multi/a1'), null, c64);
  ok(p64.svg === '<svg>as64</svg>' && !last('mapview').includes('--exe'), 'AS64 picture: own cache file, no --exe');
  const cl = await R['POST /api/x/maps/clone'](null, { mod: mod2, map: 'map/multi/a1', name: 'my_a', title: 'My A', mode: 'keep', write: false }, cm);
  const mc = last('map-clone');
  ok(cl.ok && mc[mc.indexOf('--target') + 1] === 'mowas2' && mc.join(' ').includes('--exe mowas_2'), 'MoW:AS2 clone: map-clone --target mowas2 (no target sent) --exe mowas_2 ' + JSON.stringify(mc));
  await R['POST /api/x/maps/clone'](null, { mod: mod2, map: 'map/multi/a1', name: 'my_a', mode: 'keep', write: false, target: 'as64' }, cm);
  ok(last('map-clone')[last('map-clone').indexOf('--target') + 1] === 'as64', 'a target the page sends wins (as before)');
  await R['POST /api/x/maps/clone'](null, { mod: mod2, map: 'map/multi/a1', name: 'my_a', mode: 'captureflag', write: false }, cm);
  ok((last('mission-clone') || []).join(' ').includes('--exe mowas_2') && last('mission-clone').includes('--to'), 'MoW:AS2 add a mode: mission-clone --exe mowas_2');
  // captureflag pre-check (MIS-62) reads through map.recipe readKey in the game's own view (exe mowas_2 for MoW:AS2), for both AS2 games
  put(path.join(mod2, 'resource', 'map', 'multi', 'nc', 'map'), '{map {clips {"other"}}}\n');
  put(path.join(mod2, 'resource', 'map', 'multi', 'yc', 'map'), '{map {clips {"captureflaga"} {"captureflagb"}}}\n');
  const nMc0 = calls.filter(c => c[0] === 'mission-clone').length;
  const cf64 = await t.addMode(c64, { game: as2, mod: mod2, map: 'map/multi/nc', to: 'captureflag', modes: ['combat'] });
  ok(!cf64.ok && cf64.findings[0].code === 'MC_NO_CAPTURE_CLIPS' && calls.filter(c => c[0] === 'mission-clone').length === nMc0, 'AS64 captureflag pre-check: no clips refused before mission-clone');
  const cfm = await t.addMode(cm, { game: as2, mod: mod2, map: 'map/multi/nc', to: 'captureflag', modes: ['combat'] });
  ok(!cfm.ok && cfm.findings[0].code === 'MC_NO_CAPTURE_CLIPS' && calls.filter(c => c[0] === 'mission-clone').length === nMc0, 'MoW:AS2 captureflag pre-check: no clips refused before mission-clone, as on AS64 ' + JSON.stringify(cfm));
  const cfy = await t.addMode(cm, { game: as2, mod: mod2, map: 'map/multi/yc', to: 'captureflag', modes: ['combat'] });
  ok(cfy.ok && calls.filter(c => c[0] === 'mission-clone').length === nMc0 + 1 && last('mission-clone').join(' ').includes('--exe mowas_2'), 'MoW:AS2 captureflag with both clips: on to mission-clone --exe mowas_2');
  // readKey's exe picks the MoW:AS2 view: a map only under as64/core (mounted for as64.exe alone) is not seen for MoW:AS2
  const MR = require('../task/recipes/map.recipe')._t;
  put(path.join(as2, 'as64', 'core', 'resource', 'map', 'multi', 'oc', 'map'), '{map {clips {"other"}}}\n');
  const vc = MR.readKey(as2, '', 'resource/map/multi/oc/map', [], undefined), vm2 = MR.readKey(as2, '', 'resource/map/multi/oc/map', [], 'mowas_2');
  ok(vm2 === null, 'readKey with exe mowas_2: no as64/core file in the MoW:AS2 view (as64 view: ' + (vc ? 'seen' : 'not seen') + ')');
  fs.rmSync(path.join(mod2, 'resource'), { recursive: true, force: true });
  answer['place-entity'] = { code: null, timedOut: true };
  const pto = await R['POST /api/x/maps/place'](null, { mod: mod2, map: 'map/multi/a1', entity: 'crate', x: '1', y: '2', write: false }, cm);
  ok(!pto.ok && pto.say.length === 1 && pto.say[0].k === 'maps.s.placetimeout', 'place timed out: a plain line, not a bare failure ' + JSON.stringify(pto.say));
  answer['place-entity'] = { stdout: '' };
  await R['POST /api/x/maps/place'](null, { mod: mod2, map: 'map/multi/a1', entity: 'crate', x: '1', y: '2', write: false }, cm);
  ok(last('place-entity').join(' ').includes('--exe mowas_2'), 'MoW:AS2 place: place-entity --exe mowas_2');
  const ckm = await R['POST /api/x/maps/check'](null, { mod: mod2 }, cm);
  ok(ckm.check.ran && last('milint').join(' ') === [mod2, '--game', as2, '--exe', 'mowas_2'].join(' '), 'MoW:AS2 check: milint --exe mowas_2');
  ok(t.safeMod(mod2, cm) === path.resolve(mod2), 'MoW:AS2 safeMod: <AS2>/mods/<mod> as for AS64');

  // ---- GoH: the folder, the mod folder rule
  const cg = mk('goh');
  ok(t.needGame(cg) === goh, 'GoH needGame = the GoH install (ctx.curDir)');
  await failsWith(async () => t.needGame(mk('goh', { curDir: () => null, gohDir: () => null })), 'maps.e.nogoh', 'GoH without its folder: a key the page translates');
  await failsWith(async () => t.safeMod(path.join(goh, 'mods', 'inside'), cg), 'maps.e.gohinstall', 'GoH: a folder inside the GoH install refused');
  ok(t.safeMod(gmod, cg) === path.resolve(gmod), 'GoH: a GoH mod folder outside the install is taken');
  await failsWith(async () => t.safeMod(path.join(work, 'nope'), cg), 'maps.e.nofolder', 'GoH: a missing folder refused');

  // ---- GoH list: from the GoH file set, no mission-clone run
  const nMc = calls.filter(c => c[0] === 'mission-clone').length;
  l = await wait(() => R['GET /api/x/maps/list'](U(''), null, cg));
  const lt = l.maps && l.maps.find(m => m.key === 'map/multi/1v1_t'), ln = l.maps && l.maps.find(m => m.key === 'map/multi/0_frontlines/2v2_n');
  ok(l.state === 'done' && l.maps.length === 2 && calls.filter(c => c[0] === 'mission-clone').length === nMc, 'GoH list: two maps (no map.net = no map), no mission-clone run ' + JSON.stringify(l.maps || l));
  ok(lt && lt.name === 'Test Field [Talvisota]' && lt.players === 2 && lt.modes.join() === 'battle_zones' && lt.copy === true, 'GoH list: .pot title without colour tags, players from <mode>.info, modes = .info with .mi ' + JSON.stringify(lt));
  ok(ln && ln.name === 'Nord "N"' && ln.players === 4 && ln.modes.join() === 'frontlines' && ln.folder === '2v2_n', 'GoH list: a map in a sub-folder, msgstr wins over msgid ' + JSON.stringify(ln));
  ok((await R['GET /api/x/maps/list'](U(''), null, c64)).maps.length === 1, 'the AS64 list is not the GoH one');
  ok((await t.modesOf(cg, goh, 'map/multi/1v1_t')).join() === 'battle_zones', 'GoH modesOf from the list');
  ok(t.listGoh(goh, { only: 'map/multi/0_frontlines/2v2_n' }).map(m => m.modes.join()).join() === 'frontlines', 'GoH modes of one map without the list');

  // ---- GoH picture and copy
  const pg = await R['GET /api/x/maps/picture'](U('map=map/multi/1v1_t'), null, cg);
  const mv = last('mapview');
  ok(pg.svg === '<svg>goh</svg>' && mv[mv.indexOf('--game') + 1] === goh && mv.join(' ').includes('--exe goh') && mv[mv.indexOf('--map') + 1] === 'multi/1v1_t', 'GoH picture: mapview --game <GoH> --exe goh ' + JSON.stringify(mv));
  answer['map-clone'] = { stdout: 'info: map/multi/my_t: MAPCLONE_COPIED 4 files planned\n' };
  answer.milint = REFUSE('GHMIS-54');
  const gpre = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t', title: 'My "T"', mode: 'keep', bots: true, write: false, target: 'as64' }, cg);
  const gm = last('map-clone');
  ok(gpre.ok && gm[gm.indexOf('--game') + 1] === goh && gm[gm.indexOf('--target') + 1] === 'goh' && gm.join(' ').includes('--exe goh') && gm.includes('--plan'), 'GoH clone preview: map-clone --game <GoH> --target goh --exe goh --plan ' + JSON.stringify(gm));
  ok(gpre.say.some(s => s.k === 'maps.s.willtitle' && s.p.key === 'mission/multi/my_t/name') && gpre.bots && gpre.bots[0].mode === 'battle_zones' && gpre.bots[0].state === 'added', 'GoH preview: title key and bots in battle_zones ' + JSON.stringify(gpre.bots));
  ok(!fs.existsSync(path.join(gmod, 'resource')), 'GoH preview writes nothing');
  ok(!fs.existsSync(path.join(gmod, 'localizations')), 'GoH preview writes no title file');
  answer['map-clone'] = { stdout: 'info: map/multi/my_t: MAPCLONE_COPIED 4 files written\n' };
  const nLng = calls.filter(c => c[0] === 'lng-add').length;
  const gw = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t', title: 'My "T"', mode: 'keep', bots: true, write: true }, cg);
  const potF = path.join(gmod, 'localizations', 'default', 'interface', 'text', 'mission', 'multi', 'my_t.pot');   // GHLOC-01, where map-clone writes too
  ok(!fs.existsSync(path.join(gmod, 'resource', 'interface')), 'GoH title not under resource/interface (shadowed by localizations/default there)');
  const pot = fs.existsSync(potF) ? fs.readFileSync(potF, 'utf8') : '';
  const la = last('lng-add') || [];
  ok(calls.filter(c => c[0] === 'lng-add').length === nLng + 1 && la[0] === gmod && opt(la, '--file') === 'mission/multi/my_t.pot' && opt(la, '--key') === 'mission/multi/my_t/name' && opt(la, '--exe') === 'goh' && opt(la, '--game') === goh && la.includes('--force'), 'GoH write: the title through lng-add --exe goh --game <GoH> --file mission/<map>.pot --force ' + JSON.stringify(la));
  ok(gw.ok && /msgctxt "mission\/multi\/my_t\/name"\r\nmsgid "My \\"T\\""\r\nmsgstr ""\r\n/.test(pot) && /charset=UTF-8/.test(pot) && !/[^\r]\n/.test(pot) && pot.startsWith('#, fuzzy\r\n'), 'GoH write: lobby title as a new CRLF .pot file (no .lng) ' + JSON.stringify(gw.say) + JSON.stringify(gw.findings));
  ok(t.potTitles(pot, {})['map/multi/my_t'] === 'My "T"', 'GoH: the list reader reads the written title back');
  const card = path.join(gmod, 'resource', 'set', 'multiplayer', 'games', 'battle_zones.set');
  ok(fs.existsSync(card) && /\{enableBots\}/.test(fs.readFileSync(card, 'latin1')), 'GoH write: {enableBots} in the mod copy of battle_zones.set');
  ok(gw.check && gw.check.na === 'milint: not available for GoH: GoH mission forms are not read yet (GHMIS-54)' && !gw.check.ran && last('milint').join(' ').includes('--exe goh'), 'GoH check after the write: milint --exe goh; its refusal shown as one line ' + JSON.stringify(gw.check));
  await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t', title: 'Second', mode: 'keep', write: true }, cg);
  const pot2 = fs.readFileSync(potF, 'utf8');
  ok((pot2.match(/msgctxt/g) || []).length === 1 && /msgid "Second"\r\n/.test(pot2) && !/[^\r]\n/.test(pot2), 'GoH: a second write replaces the title entry (CRLF kept)');
  // map-clone --target goh has already written its own title file (CRLF, "[clone] <vanilla name>"): the user's title replaces that entry
  const mcPot = path.join(gmod, 'localizations', 'default', 'interface', 'text', 'mission', 'multi', 'my_c.pot');
  answer['map-clone'] = a => { if (!a.includes('--plan')) put(mcPot, '﻿msgid ""\r\nmsgstr ""\r\n"Content-Type: text/plain; charset=UTF-8\\n"\r\n\r\nmsgctxt "mission/multi/my_c/name"\r\nmsgid "[clone] Test Field <c(7e5be4)>[Talvisota]"\r\nmsgstr ""\r\n'); return { stdout: 'info: map/multi/my_c: MAPCLONE_COPIED 4 files written\n' }; };
  const gwc = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_c', title: 'Mine', mode: 'keep', write: true }, cg);
  const pc = fs.readFileSync(mcPot, 'utf8');
  ok(gwc.ok && (pc.match(/msgctxt/g) || []).length === 1 && /msgctxt "mission\/multi\/my_c\/name"\r\nmsgid "Mine"\r\nmsgstr ""\r\n$/.test(pc) && !/\[clone\]/.test(pc) && pc.charCodeAt(0) === 0xFEFF && !/[^\r]\n/.test(pc), 'GoH: the title replaces the map-clone entry in its file (CRLF and BOM kept) ' + JSON.stringify(pc));
  answer['map-clone'] = { stdout: 'info: map/multi/my_t: MAPCLONE_COPIED 4 files written\n' };
  ok(JSON.stringify(t.titleArgs(c64, as2, mod2, 'multi/q', 'Q')) === JSON.stringify([mod2, '--file', 'mission/multi/q.lng', '--key', 'mission/multi/q/name', '--text', 'Q', '--force']), 'titleArgs AS64: the lng-add argument list as before');
  ok(t.titleArgs(cm, as2, mod2, 'multi/q', 'Q').slice(-4).join(' ') === '--exe mowas_2 --game ' + as2 && t.titleArgs(cm, as2, mod2, 'multi/q', 'Q')[2] === 'mission/multi/q.lng', 'titleArgs MoW:AS2: .lng with --exe mowas_2 --game <AS2>');
  // lng-add refuses (writeguard, exit 2): its one line on the page, not a bare "could not be saved"
  answer['lng-add'] = { code: 2, stderr: 'lng-add: refusing to write inside the Gates of Hell install\n' };
  const gref = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_r', title: 'R', mode: 'keep', write: true }, cg);
  ok(!gref.ok && gref.say.some(s => s.k === 'maps.s.na' && /refusing to write inside/.test(s.p.why)) && !gref.say.some(s => s.k === 'maps.s.titlefail'), 'GoH: an lng-add refusal (exit 2) shown as its line ' + JSON.stringify(gref.say));
  delete answer['lng-add'];
  ok(t.botsFor(goh, gmod + '_x', ['battle_zones'], false)[0].state === 'added', 'botsFor on a GoH install without exe reads the GoH card (Game Modes page)');

  // ---- GoH: a mode the map lacks (mission-clone --exe goh), a mode GoH does not have, a tool that refuses
  // the real mission-clone --exe goh: a pair outside the battle_zones family = exit 1 + MC_NEEDS_MANUAL (an error-level line, as on AS2:
  // the flags are the user's, GHMAP-03); a pair inside the family = exit 0 (battle_zones from armored_warfare)
  answer['mission-clone'] = a => (opt(a, '--from') === 'armored_warfare' ? { stdout: '' } : { code: 1, stdout: 'map/multi/1v1_t/frontlines.mi: MC_NEEDS_MANUAL frontlines: GoH battle_zones -> frontlines: copied verbatim\n' });
  const gmode = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t2', mode: 'frontlines', flags: '5', write: false }, cg);
  const gmc = last('mission-clone');
  ok(!last('map-clone').includes('--only-mode') && opt(gmc, '--game') === goh && opt(gmc, '--exe') === 'goh' && opt(gmc, '--from') === 'battle_zones' && opt(gmc, '--to') === 'frontlines' && opt(gmc, '--map') === 'map/multi/1v1_t' && gmc.includes('--dry-run') && !gmc.includes('--flags'), 'GoH clone preview, a mode the map lacks: mission-clone --game <GoH> --exe goh --from battle_zones --dry-run, no AS2 --flags ' + JSON.stringify(gmc));
  ok(gmode.ok && gmode.say.some(s => s.k === 'maps.s.gohwillmode') && !gmode.say.some(s => s.k === 'maps.s.modefail') && gmode.say.some(s => s.k === 'maps.s.willtitle') && gmode.findings.some(f => f.code === 'MC_NEEDS_MANUAL' && f.sev === 'warn') && !gmode.findings.some(f => f.sev === 'error'), 'GoH preview, MC_NEEDS_MANUAL only (exit 1): the mode is made with a manual flag step, the manual line reaches the page, the title follows ' + JSON.stringify(gmode));
  // the same on a write: the copy goes on to the .pot title, the bots and the check (it used to stop after mission-clone, half done)
  answer['mission-clone'] = { code: 1, stdout: 'resource/map/multi/my_t3/ammunition.mi: MC_NEEDS_MANUAL ammunition: GoH battle_zones -> ammunition: copied verbatim\n' };
  const nMil = calls.filter(c => c[0] === 'milint').length;
  const gmodeW = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t3', title: 'Three', mode: 'ammunition', write: true }, cg);
  const pot3 = path.join(gmod, 'localizations', 'default', 'interface', 'text', 'mission', 'multi', 'my_t3.pot');
  ok(gmodeW.ok && gmodeW.say.some(s => s.k === 'maps.s.gohmodemade') && fs.existsSync(pot3) && /msgid "Three"/.test(fs.readFileSync(pot3, 'utf8')) && calls.filter(c => c[0] === 'milint').length > nMil && gmodeW.findings.some(f => f.code === 'MC_NEEDS_MANUAL' && f.sev === 'warn') && !gmodeW.findings.some(f => f.sev === 'error'), 'GoH write (ok: no finding of sev error, the manual step a warning), MC_NEEDS_MANUAL only: mode made, .pot title written, milint ran ' + JSON.stringify(gmodeW.say));
  answer['mission-clone'] = { code: 1, stdout: 'resource/map/multi/my_t3/ammunition.mi: MC_NEEDS_MANUAL x\nresource/map/multi/my_t3/ammunition.mi: MC_BAD_SOURCE y\n' };
  const gmodeF = await t.addMode(cg, { game: goh, mod: gmod, map: 'map/multi/1v1_t', to: 'ammunition', modes: ['battle_zones'] });
  ok(!gmodeF.ok && gmodeF.say.some(s => s.k === 'maps.s.modefail'), 'GoH addMode: another error next to MC_NEEDS_MANUAL still fails');
  answer['mission-clone'] = a => (opt(a, '--from') === 'armored_warfare' ? { stdout: '' } : { code: 1, stdout: 'map/multi/1v1_t/frontlines.mi: MC_NEEDS_MANUAL frontlines: GoH battle_zones -> frontlines: copied verbatim\n' });
  const gmw = await t.addMode(cg, { game: goh, mod: gmod, map: 'map/multi/my_t2', srcMap: 'map/multi/1v1_t', to: 'battle_zones', from: 'armored_warfare', modes: ['armored_warfare'], write: true });
  const gmcw = last('mission-clone');
  ok(gmw.ok && gmw.say[0].k === 'maps.s.modemade' && opt(gmcw, '--map') === 'map/multi/my_t2' && opt(gmcw, '--src-map') === 'map/multi/1v1_t' && opt(gmcw, '--out') === gmod && !gmcw.includes('--dry-run'), 'GoH write inside the battle_zones family: made, into the copy (--map <new> --src-map <vanilla>) ' + JSON.stringify(gmcw));
  answer['mission-clone'] = { code: 2, stderr: 'mission-clone: not available for GoH: MC_GOH_NO_MODE combat is not a GoH game mode: use battle_zones or frontlines (goh-game-mode-registry)\n' };
  const gna = await t.addMode(cg, { game: goh, mod: gmod, map: 'map/multi/1v1_t', to: 'frontlines', modes: ['battle_zones'] });
  ok(!gna.ok && gna.say[0].k === 'maps.s.na' && /MC_GOH_NO_MODE/.test(gna.say[0].p.why), 'GoH addMode: a mission-clone refusal (exit 2) shown as its one line');
  answer['mission-clone'] = { stdout: '' };
  const kept = await R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t3', mode: 'battle_zones', write: false }, cg);
  ok(kept.ok && last('map-clone').join(' ').includes('--only-mode battle_zones'), 'GoH: a mode the map has is copied alone (--only-mode)');
  await failsWith(() => R['POST /api/x/maps/clone'](null, { mod: gmod, map: 'map/multi/1v1_t', name: 'my_t4', mode: 'combat', write: false }, cg), 'maps.e.mode', 'GoH: combat is not a GoH mode');
  // the Missions page names the game in o.gid (and o.exe): it wins over the route ctx
  await t.addMode(c64, { game: goh, mod: gmod, map: 'map/multi/1v1_t', to: 'ammunition', modes: ['frontlines', 'battle_zones'], gid: 'goh', exe: 'goh' });
  ok(opt(last('mission-clone'), '--exe') === 'goh' && opt(last('mission-clone'), '--from') === 'frontlines', 'addMode o.gid goh: --exe goh, from = the first GoH mode of the map');
  await t.addMode(c64, { game: as2, mod: mod2, map: 'map/multi/a1', to: 'battle_zones', modes: ['combat'], gid: 'mowas2', exe: 'mowas_2' });
  ok(opt(last('mission-clone'), '--exe') === 'mowas_2', 'addMode o.gid mowas2: --exe mowas_2');
  await t.addMode(c64, { game: as2, mod: mod2, map: 'map/multi/a1', to: 'battle_zones', modes: ['combat'] });
  ok(!last('mission-clone').includes('--exe'), 'addMode as64 (no o.gid): no --exe, as before');
  answer['place-entity'] = { code: 2, stderr: 'place-entity: not available for GoH: a made-up refusal line\n' };
  const gp = await R['POST /api/x/maps/place'](null, { mod: gmod, map: 'map/multi/1v1_t', entity: 'crate', x: '1', y: '2', write: false }, cg);
  ok(!gp.ok && gp.say[0].k === 'maps.s.na' && /not available for GoH/.test(gp.say[0].p.why) && last('place-entity').join(' ').includes('--exe goh') && gp.units.join() === '20,40', 'GoH place: --exe goh, the tool refusal as one line ' + JSON.stringify(gp));
  answer['place-entity'] = { stdout: 'Would write ...\n' };
  const gpv = await R['POST /api/x/maps/place'](null, { mod: gmod, map: 'map/multi/1v1_t', entity: 'crate', x: '1', y: '2', write: false }, cg);
  ok(gpv.ok && gpv.say.some(s => s.k === 'maps.s.gohscale') && last('place-entity').includes('--dry-run'), 'GoH place preview: runs, says the GoH scale line ' + JSON.stringify(gpv.say));
  // GoH write (scale 20 units per metre [I], 2026-11-23): place-entity runs without --dry-run; the tool's restore point is said
  answer['place-entity'] = { stdout: 'wrote resource/map/multi/1v1_t/map (new) uid 0x14004 (read back: in place; restore point 20261123-010203-004)\n' };
  const gpw = await R['POST /api/x/maps/place'](null, { mod: gmod, map: 'map/multi/1v1_t', entity: 'crate', x: '1', y: '2', dir: '90', write: true }, cg);
  const gpwa = last('place-entity');
  ok(gpw.ok && !gpwa.includes('--dry-run') && opt(gpwa, '--exe') === 'goh' && opt(gpwa, '--pos') === '20,40' && opt(gpwa, '--dir') === '90' && gpw.say.some(s => s.k === 'maps.s.gohscale') && gpw.say.some(s => s.k === 'maps.s.placed') && gpw.say.some(s => s.k === 'maps.s.gohundo' && s.p.id === '20261123-010203-004') && gpw.restore === '20261123-010203-004', 'GoH place write: runs the tool (no --dry-run, --exe goh, units 20,40), says the scale, the place and the restore point ' + JSON.stringify(gpw.say));
  answer['place-entity'] = { code: 1, stdout: 'resource/map/multi/1v1_t/map: PLACE_READBACK uid 0x14004 found 0 times in the written map (want 1) (the write was undone)\n' };
  const gpr = await R['POST /api/x/maps/place'](null, { mod: gmod, map: 'map/multi/1v1_t', entity: 'crate', x: '1', y: '2', write: true }, cg);
  ok(!gpr.ok && gpr.findings.some(f => f.code === 'PLACE_READBACK' && f.sev === 'error') && !gpr.say.some(s => s.k === 'maps.s.placed'), 'GoH place write: a failed read back is an error, nothing said as placed');
  answer['place-entity'] = { stdout: 'Would write ...\n' };
  const ppv = await R['POST /api/x/maps/place'](null, { mod: mod2, map: 'map/multi/a1', entity: 'crate', x: '1', y: '2', write: false }, cm);
  ok(ppv.ok && !ppv.say.some(s => s.k === 'maps.s.gohscale'), 'MoW:AS2 place preview: no GoH scale line');
  const gck = await R['POST /api/x/maps/check'](null, { mod: gmod }, cg);
  ok(gck.check.na && /GHMIS-54/.test(gck.check.na), 'GoH check card: milint refusal shown');
  for (const k of ['maps.e.nogoh', 'maps.e.gohinstall', 'maps.s.na', 'maps.mode.goh', 'maps.test.goh', 'maps.ed.goh.s1', 'maps.ed.goh.s2', 'maps.ed.goh.note', 'maps.s.gohscale', 'maps.s.gohundo', 'maps.s.placetimeout'])
    ok(['en', 'ru', 'uk', 'zh'].every(g => L[g][k]), 'lang key in 4 languages: ' + k);

  // ---- the page: GoH mode lists, editor steps, test hint, list again when the game changes, refusal line in the check card
  const vm = require('vm');
  const { make } = require(path.join(__dirname, '..', '..', 'test', 'fakedom'));
  const BC = require(path.join(__dirname, '..', '..', 'test', 'blockcheck'));
  const G = { as64: { id: 'as64', kind: 'as2', target: 'as64', name: 'AS64' }, goh: { id: 'goh', kind: 'goh', target: 'goh', name: 'GoH' } };
  let cur = 'as64';
  const doc = make(), pcalls = [];
  const LIST = { as64: { state: 'done', maps: [{ key: 'map/multi/a1', folder: 'a1', name: 'A1', players: 2, modes: ['combat'], mod: '', mods: [], copy: true }] },
    goh: { state: 'done', maps: [{ key: 'map/multi/1v1_t', folder: '1v1_t', name: 'Test Field', players: 2, modes: ['battle_zones'], mod: '', mods: [], copy: true }] } };
  const box = {
    document: doc, EXT_SCREENS: {}, S: { mod: gmod }, window: {}, curGame: () => G[cur],
    tx: (k, p) => { const s = L.en[k]; return s == null ? k : s.replace(/\{(\w+)\}/g, (a, b) => (p && p[b] != null ? String(p[b]) : a)); },
    toast: () => {}, show: () => {}, pick: () => {}, setTimeout, clearTimeout, setMod: () => {},
    api: (u, b) => { pcalls.push([u, cur]); return Promise.resolve(u.startsWith('/api/x/maps/list') ? LIST[cur] : u === '/api/x/maps/check' ? { check: { ran: false, na: 'milint: not available for GoH: w (GHMIS-54)', count: 0, findings: [] } } : { svg: null }); },
  };
  box.LS = { m: {}, get(k, d) { return k in this.m ? this.m[k] : d; }, set(k, v) { this.m[k] = v; } };
  const F = BC.pageFns(doc); for (const n of BC.NAMES) box[n] = F[n];
  vm.runInNewContext(BC.kitSrc() + '\n' + X.script, box);   // the page's real searchKit (page.js)
  const rootEl = doc.createElement('section'); rootEl.setAttribute('data-id', 'maps');
  const scr = box.EXT_SCREENS.maps(rootEl);
  const tick = () => new Promise(r => setTimeout(r, 0));
  const all = (e, f, o = []) => { for (const c of e.children) { if (f(c)) o.push(c); all(c, f, o); } return o; };
  const tag = (e, tg) => all(e, c => c.tagName === tg);
  const sels = () => tag(rootEl, 'SELECT'), optsOf = s => tag(s, 'OPTION').map(o => o.getAttribute('value'));
  scr.focus(); await tick(); await tick();
  ok(rootEl.textContent.includes('A1') && optsOf(sels()[2]).join() === 'keep,combat,battle_zones,captureflag' && rootEl.textContent.includes(L.en['maps.ed.s2']), 'page under AS64: AS2 modes, AS2 editor steps');
  cur = 'goh'; scr.refresh(); scr.focus(); await tick(); await tick();
  ok(pcalls.filter(c => c[0].startsWith('/api/x/maps/list')).map(c => c[1]).join() === 'as64,goh', 'page: the list is asked again after the game changed ' + JSON.stringify(pcalls));
  ok(rootEl.textContent.includes('Test Field') && !rootEl.textContent.includes('A1'), 'page: the GoH list replaces the AS64 one');
  ok(optsOf(sels()[2]).join() === 'keep,frontlines,battle_zones,campaign_capture_the_flag,ammunition,evacuation,cooperative' && optsOf(sels()[1]).includes('frontlines') && !optsOf(sels()[1]).includes('combat'), 'page under GoH: GoH mode lists (filter and copy)');
  ok(rootEl.textContent.includes(L.en['maps.ed.goh.s2']) && rootEl.textContent.includes(L.en['maps.ed.goh.note']) && !rootEl.textContent.includes(L.en['maps.ed.s2']), 'page under GoH: editor steps through the launcher (GHED-10)');
  sels()[2].value = 'ammunition'; sels()[2].fire('change');
  ok(rootEl.textContent.includes(L.en['maps.mode.goh'].replace('{mode}', 'ammunition')), 'page under GoH: a GoH mode gets the plain help line');
  tag(rootEl, 'BUTTON').find(b => b.textContent === L.en['maps.check.run']).click(); await tick(); await tick();
  ok(rootEl.textContent.includes('milint: not available for GoH: w (GHMIS-54)'), 'page: the check card shows a tool refusal as its line');
  const pr = BC.checkScreen(rootEl, 'maps');
  ok(!pr.length, 'page blocks under GoH:\n  ' + pr.slice(0, 10).join('\n  '));
  console.log(bad ? 'FAIL ' + bad : 'PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + e.stack); process.exit(1); });
