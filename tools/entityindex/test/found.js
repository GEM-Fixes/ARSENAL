// foundation checks of game parity wave 3 (the entityindex suite is the one test folder of the foundation owner z-found):
//   lib/vfs GoH mounts (GHVFS-04 roots, GHVFS-24 Workshop id mod_<item>, GHVFS-26 / GHVFS-02 version gate with tag develop) on a
//   made-up GoH install, the AS2 forms unchanged on a made-up AS2 install; lib/cli --exe letter case; lib/registry exe flags and games.
//   usage: node found.js <workdir>   (run.sh gives its temp dir; nothing written beside the test)
// Author: Imperator_Aug (ARSENAL, ia-49280bf0)
const fs = require('fs'), path = require('path'), os = require('os');
const W = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'zfound-'));
const T = path.join(__dirname, '..', '..');
const vfs = require(path.join(T, 'lib', 'vfs')), cli = require(path.join(T, 'lib', 'cli')), reg = require(path.join(T, 'lib', 'registry'));
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
const put = (g, k, t) => { const p = path.join(g, k); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const info = (name, lines) => ['{mod', '\t{name "' + name + '"}', ...lines, '}', ''].join('\r\n');

// ---- GoH install (exe is no real PE: game version 1.067, as the vfs reads 1.0.6.7)
const G = path.join(W, 'gohgame'), WS = path.join(W, 'gohws');
fs.rmSync(G, { recursive: true, force: true }); fs.rmSync(WS, { recursive: true, force: true });
put(G, 'binaries/x64/call_to_arms.exe', 'MZ');
put(G, 'resource/entity/base.def', '{game_entity}\r\n');
put(G, 'resource.pak', 'not a zip');                                   // GoH never reads a root resource.pak: no PAK_BAD
put(G, 'localization/x.lng', 'x');                                     // nor localization/
put(G, 'localizations/default/interface/text/a.pot', 'a');
put(G, 'mods/nobounds/mod.info', info('nobounds', []));               // GHVFS-26: no bounds = open
put(G, 'mods/nobounds/resource/entity/nb.def', '{game_entity}\r\n');
put(G, 'mods/dev/mod.info', info('dev', ['\t{tags "no_delete develop"}', '\t{minGameVersion "9.000"}', '\t{maxGameVersion "9.900"}']));
put(G, 'mods/dev/resource/entity/dv.def', '{game_entity}\r\n');
put(G, 'mods/far/mod.info', info('far', ['\t{tags "realism, mod"}', '\t{minGameVersion "9.000"}']));
put(G, 'mods/far/resource/entity/far.def', '{game_entity}\r\n');
put(G, 'mods/inrange/mod.info', info('inrange', ['\t{minGameVersion "1.035"}', '\t{maxGameVersion "1.099"}']));
put(G, 'mods/rootloc/mod.info', info('rootloc', []));
put(G, 'mods/rootloc/localization/y.lng', 'y');
put(G, 'mods/rootloc/resource.pak', 'not a zip');
put(G, 'mods/rootloc/localizations/default/interface/text/b.pot', 'b');
put(WS, '123456/mod.info', info('Some Title', []));
put(WS, '123456/resource/entity/ws.def', '{game_entity}\r\n');
const v = vfs.build({ gameDir: G, exe: 'goh', workshop: WS, mods: ['nobounds', 'dev', 'far', 'inrange', 'rootloc', 'mod_123456'] });
const has = k => v.files.has(k), codes = c => v.problems.filter(p => p.code === c);
if (v.exe !== 'goh') fail('exe goh: ' + v.exe);
if (codes('PAK_BAD').length) fail('GoH must not read a root resource.pak (GHVFS-04): ' + JSON.stringify(codes('PAK_BAD')));
if (has('resource/interface/text/x.lng') || has('resource/interface/text/y.lng')) fail('GoH must not mount a root localization/ (GHVFS-04)');
if (!has('resource/interface/text/a.pot') || !has('resource/interface/text/b.pot')) fail('GoH localizations/default still mounted');
for (const m of ['nobounds', 'dev', 'inrange', 'rootloc', 'mod_123456']) if (!v.mods.includes(m)) fail('GoH mod ' + m + ' should mount: mods ' + v.mods + ' ' + JSON.stringify(codes('MOD_VERSION').concat(codes('MOD_UNKNOWN'))));
if (v.mods.includes('far') || !codes('MOD_VERSION').some(p => /"far"/.test(p.msg))) fail('far (Min 9.000, no develop) must be refused MOD_VERSION');
if (!has('resource/entity/nb.def') || !has('resource/entity/dv.def') || !has('resource/entity/ws.def')) fail('mounted mods give their files');
if (v.mods.includes('some title')) fail('GoH Workshop id must be mod_<item>, not the title (GHVFS-24)');
const ign = codes('MOD_ROOT_IGNORED').map(p => p.where);
if (!ign.some(w => /rootloc\/localization$/.test(w)) || !ign.some(w => /rootloc\/resource\.pak$/.test(w))) fail('mod root localization/ and resource.pak listed MOD_ROOT_IGNORED on GoH: ' + ign);
const found = vfs.discover(G, [], { items: true, workshop: WS });
if (!(found.get('dev').tags || []).includes('develop')) fail('mod record carries tags');
if (!found.has('mod_123456') || found.get('mod_123456').fileId !== '123456') fail('discover: Workshop mod_123456');

// ---- AS2 install: the AS2 forms are unchanged (root localization/ mounted, a mod with no bounds refused, Workshop id = title)
const A = path.join(W, 'as2game'), AW = path.join(W, 'as2ws');
fs.rmSync(A, { recursive: true, force: true }); fs.rmSync(AW, { recursive: true, force: true });
put(A, 'mowas_2.exe', 'MZ');
put(A, 'resource/entity/base.def', '{game_entity}\r\n');
put(A, 'localization/x.lng', 'x');
put(A, 'mods/nobounds/mod.info', info('nobounds', []));
const a = vfs.build({ gameDir: A, exe: 'mowas_2', mods: ['nobounds'] });
if (!a.files.has('resource/interface/text/x.lng')) fail('AS2 root localization/ still mounted');
if (a.mods.includes('nobounds') || !a.problems.some(p => p.code === 'MOD_VERSION')) fail('AS2: a mod with no bounds stays refused');
put(A, 'as64.exe', 'MZ'); put(AW, '777/mod.info', info('Shop Mod', ['\t{minGameVersion "3.301"}']));
const af = vfs.discover(A, [], { plus: true, workshop: AW });
if (!af.has('shop mod') || af.has('mod_777')) fail('as64 Workshop id stays the normalised title: ' + [...af.keys()]);

// ---- lib/cli: --exe ignores letter case (GOH = goh); a bad word still throws
const p1 = cli.parse(['--exe', 'GOH', '--game', G, '--no-rc']), p2 = cli.parse(['--exe', 'MoWAS2', '--game', A, '--no-rc']), p3 = cli.parse(['--exe', 'As64', '--game', A, '--no-rc']);
if (p1.exe !== 'goh' || p2.exe !== 'mowas_2' || p3.exe !== 'as64') fail('cli --exe case: ' + [p1.exe, p2.exe, p3.exe]);
let thrown = ''; try { cli.parse(['--exe', 'mowas_2.exe', '--no-rc']); } catch (e) { thrown = e.message; }
if (!/--exe must be one of/.test(thrown)) fail('cli --exe with an exe file name must throw: ' + thrown);
const p4 = cli.parse(['--exe', 'GoH', '--no-rc'], { values: ['--exe'] });
if (p4.x.exe !== 'GoH' || p4.exe !== 'goh') fail('tool-declared --exe keeps the raw value, o.exe from the game word: ' + [p4.x.exe, p4.exe]);
if (cli.parse(['--game', A, '--no-rc']).exe !== undefined) fail('no --exe: o.exe undefined');

// ---- lib/registry: every tool whose source has its '--exe' option says exe: true; uilint and binhdr serve GoH
for (const t of reg.TOOLS) {
  const src = fs.readFileSync(path.join(T, t.entry), 'utf8');
  const takes = /a === '--exe'|cli\.parse\(/.test(src);
  if (takes && t.exe !== true) fail(t.name + ' takes --exe: exe: true');
  if (!takes && t.exe) fail(t.name + ' has no --exe option but exe: true');
}
for (const n of ['uilint', 'binhdr']) { if (reg.byName(n).games) fail(n + ' has no games limit now'); if (!reg.forDoctor('goh').some(t => t.name === n)) fail(n + ' runs in doctor for goh'); }
if (reg.byName('portdiff').exe) fail('portdiff takes no --exe');
console.log(bad ? `found: ${bad} failed` : 'found ok');
process.exit(bad ? 1 : 0);
