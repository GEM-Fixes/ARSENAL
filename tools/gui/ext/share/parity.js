// Share routes under the three games (game parity, 2026-11-14). Made-up fixtures only: an AS2 folder with as64.exe and mowas_2.exe,
// a GoH folder with binaries/x64/call_to_arms.exe, GoH mods in and outside it. Tool runs are stubbed and their arguments recorded, so
// this checks what each route hands to which tool for which game; the tools' own --exe / --goh halves are tested by their builders.
// Nothing is started; writes go only into the scratch dir given. Called by test.js.
// Author: Imperator_Aug (ARSENAL, ia-c6dc1db4)
'use strict';
const fs = require('fs'), path = require('path');
const mod = require('./index'), T = require('./routes')._t, L = require('./lang'), SC = require('./script');
const R = n => mod.routes[n];
const U = q => new URL('http://x/?' + q);

module.exports = async function run(work, ok) {
  const rej = async (p, re, m) => { try { await p; ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' [' + e.message.slice(0, 80) + ']'); } };
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
  const w = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  // ---- AS2 fixture: both exes in one folder (the shared install), as64+ and two mods
  const as2 = path.join(work, 'as2game');
  w(path.join(as2, 'as64.exe'), 'x'); w(path.join(as2, 'mowas_2.exe'), 'x'); w(path.join(as2, 'resource', 'x.pak'), 'x');
  for (const [n, nm] of [['ma', 'Mod A'], ['mb', 'Mod B']]) w(path.join(as2, 'mods', n, 'mod.info'), '{mod\r\n\t{Name "' + nm + '"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
  // as64+ is the built-in mod at as64/plus, as on the real install (the engine drops a mods/as64+ folder, VFS-47)
  w(path.join(as2, 'as64', 'plus', 'mod.info'), '{mod\r\n\t{Name "AS64 Plus"}\r\n\t{Version "2.1"}\r\n}\r\n');
  const calls = [];
  const runTool = async (tool, entry, args) => {
    calls.push({ tool, args: args.slice() });
    if (tool === 'modinfo' && modinfoOut) return { code: 0, stdout: modinfoOut, stderr: '' };
    // modswitch: an array = the profile's entries, answered as the --json line when asked; a string = the old "active:" text only
    if (tool === 'modswitch') { const pm = ctxProfileMods || ['ma:0', 'as64+:0', 'mb:0'];
      if (Array.isArray(pm) && args.includes('--json')) return { code: 0, stdout: JSON.stringify({ profile: 'p', game: 'x', active: pm.map(e => ({ entry: e, folder: e.replace(/:\d+$/, ''), installed: true })), problems: [] }) + '\n', stderr: '' };
      return { code: 0, stdout: 'profile: p\nactive:  ' + (Array.isArray(pm) ? (pm.length ? pm.join(' ') : '(none)') : pm) + '\n', stderr: '' }; }
    if (tool === 'check') { const j = args.indexOf('--json'); const tg = args.includes('goh') ? 'goh' : args.includes('mowas2') ? 'mowas2' : 'as64';
      fs.writeFileSync(args[j + 1], JSON.stringify({ target: tg, overall: { target: tg, verdict: 'ok', crash: 0, silent: 0, text: 'ok' }, plain: ['ok'] })); return { code: 0, stdout: '', stderr: '' }; }
    // conflicts is asked once, with --fmt json: the stub turns its report lines into the JSON line (plus the items a test sets)
    if (tool === 'conflicts') return { code: 0, stdout: args.includes('json') ? JSON.stringify({ order: [], modDirs: [], files: 0, items: conflictsItems.concat(conflictsOut.split('\n').map(l => /^(info: )?(.*?): ([A-Z_0-9]+) (.*)$/.exec(l)).filter(Boolean).map(m => ({ level: m[1] ? 'info' : 'warn', file: m[2], line: 0, code: m[3], msg: m[4], d: {} }))) }) + '\n' : conflictsOut, stderr: '' };
    return { code: 0, stdout: '', stderr: '' };
  };
  let ctxProfileMods = '', modinfoOut = '', conflictsOut = '', conflictsItems = [];
  const mk = (id, extra) => Object.assign({ tools: path.resolve(__dirname, '..', '..', '..'), tmpRoot: work, allowLaunch: false, runTool,
    game: () => as2, gameId: () => id, exe: () => require('../../../lib/games').exeOf(id), kind: () => require('../../../lib/games').kindOf(id),
    gohDir: () => null, curDir: () => as2 }, extra || {});
  const as64 = mk('as64'), mw = mk('mowas2');
  const last = (tool) => { for (let i = calls.length - 1; i >= 0; i--) if (calls[i].tool === tool) return calls[i].args; return null; };
  const has = (a, ...xs) => !!a && xs.every((x, i) => a.indexOf(xs[0]) >= 0 && a[a.indexOf(xs[0]) + i] === x);

  // ===== MoW:AS2 (1:1 with AS64; tools get the game)
  let r = await R('GET /api/x/share/info')(U('mod=' + encodeURIComponent(path.join(as2, 'mods', 'ma'))), null, mw);
  ok(Object.keys(r.ranges).join() === 'classic' && r.range === 'classic' && r.gid === 'mowas2', 'mowas2 About: only the Classic range offered (' + Object.keys(r.ranges) + ')');
  r = await R('GET /api/x/share/info')(U('mod=' + encodeURIComponent(path.join(as2, 'mods', 'ma'))), null, as64);
  ok(Object.keys(r.ranges).join() === 'classic,enhanced' && r.range === 'classic' && !('gid' in r), 'as64 About: both ranges, answer as before');
  r = await R('POST /api/x/share/gate')(null, { mod: path.join(as2, 'mods', 'ma') }, mw);
  ok(has(last('check'), '--target', 'mowas2'), 'mowas2 release check: check --target mowas2 (the same target as Mods > Check and the CLI)');
  ok(has(last('check'), '--exe', 'mowas2') && has(last('check'), '--game', as2) && r.items.find(i => i.id === 'check').target === 'mowas2', 'mowas2 release check: check --exe mowas2 (' + last('check').slice(1).join(' ') + ')');
  ok(!last('packer').includes('--goh') && has(last('modinfo'), '--exe', 'mowas_2') && !r.items.some(i => i.id === 'folder'), 'mowas2 release check: modinfo --exe mowas_2, packer as on AS64, no GoH folder row');
  modinfoOut = 'info: ' + path.join(as2, 'mods', 'ma', 'mod.info') + ':5: GOH_DEVELOP tags has "develop": GoH skips the version check for this mod (GHVFS-02)\n0 findings\n';
  r = await R('POST /api/x/share/gate')(null, { mod: path.join(as2, 'mods', 'ma'), deep: false }, mw);
  ok(r.items.find(i => i.id === 'info').status === 'pass' && r.items.find(i => i.id === 'range').status === 'pass', 'release check: an info: line of modinfo is a note, not a blocker (info row passes)');
  modinfoOut = '';
  await R('POST /api/x/share/gate')(null, { mod: path.join(as2, 'mods', 'ma') }, as64);
  ok(last('modinfo').length === 1, 'as64 release check: modinfo gets the mod folder only (as before)');
  ok(!last('check').includes('--exe') && last('check').slice(1).join(' ').startsWith('--fast --game ' + as2 + ' -q --json'), 'as64 release check: check arguments unchanged');
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, mw);
  const ov = calls.filter(c => c.tool === 'overdiff').slice(-1)[0];
  ok(calls.filter(c => c.tool === 'conflicts').slice(-1).every(c => has(c.args, '--exe', 'mowas_2') && has(c.args, '--fmt', 'json')) && (!ov || has(ov.args, '--exe', 'mowas_2')), 'mowas2 mods together: conflicts (one run, --fmt json) and overdiff get --exe mowas_2');
  await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, as64);
  ok(calls.filter(c => c.tool === 'conflicts').slice(-1).every(c => !c.args.includes('--exe')), 'as64 mods together: no --exe (as before)');
  ctxProfileMods = ['ma:0', 'as64+:0', 'mb:0'];
  r = await R('POST /api/x/share/card')(null, {}, mw);
  ok(r.exe === 'mowas_2.exe' && /^Game: mowas_2\.exe/m.test(r.text) && r.order.join() === 'ma,mb' && /as64\+ is left out/.test(r.text) && !/as64\+ \(not installed/.test(r.text) && has(last('modswitch'), '--exe', 'mowas_2') && last('modswitch').includes('--json'), 'mowas2 play card: names mowas_2.exe, as64+ left out with a plain line, modswitch --exe mowas_2 (' + r.exe + ' ' + r.order + ')');
  ok(calls.filter(c => c.tool === 'mpsync').length === 0 || calls.filter(c => c.tool === 'mpsync').slice(-1)[0].args.includes('mowas_2'), 'mowas2 play card: mpsync (when there) gets --exe mowas_2');
  r = await R('POST /api/x/share/card')(null, {}, as64);
  ok(r.exe === 'as64.exe' && r.order[0] === 'as64+' && !last('modswitch').includes('--exe') && last('modswitch').join(' ') === '--game ' + as2 + ' --json', 'as64 play card: as64.exe, as64+ first, modswitch --game <AS2> --json (no --exe)');
  ok(!r.missing.length && r.mods[0].name === 'AS64 Plus' && r.mods[0].version === '2.1' && /^1\. AS64 Plus 2\.1 \[folder as64\+\]$/m.test(r.text) && !/not installed/.test(r.text), 'as64 play card: the built-in as64+ read from as64/plus, not missing (' + r.missing + ')');
  ctxProfileMods = 'as64+:0';
  await rej(R('POST /api/x/share/card')(null, {}, mw), /as64\+ is left out: .*VFS-47.*No other mod/, 'mowas2 play card: a list of only as64+ gives the VFS-47 line, not "pick the mods"');
  await rej(R('POST /api/x/share/card')(null, { mods: ['as64+'] }, mw), /as64\+ is left out/, 'mowas2 play card: picked only as64+ gives the VFS-47 line');
  // mods together under MoW:AS2: 3.301-only mods are left out by the version gate (conflicts info VFS_MOD_VERSION): one plain line
  const mma = path.join(as2, 'mods', 'ma').replace(/\\/g, '/'), mmb = path.join(as2, 'mods', 'mb').replace(/\\/g, '/');
  conflictsOut = 'info: ' + mma + ': VFS_MOD_VERSION mod "ma" unsupported on 3.262.1 (Min "3.301" Max ""); skipped\ninfo: ' + mmb + ': VFS_MOD_VERSION mod "mb" unsupported on 3.262.1 (Min "3.301" Max ""); skipped\n0 findings\n0 shared files\n';
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, mw);
  ok(r.skipped && r.skipped.map(s => s.mod).join() === 'ma,mb' && r.compared === 0 && !r.clean && !r.files.length && /Left out by this game.*ma, mb.*nothing is compared/.test(r.skippedText), 'mowas2 mods together: 3.301-only mods named as left out, not "no clashes" (' + JSON.stringify(r.skipped && r.skipped.map(s => s.mod)) + ')');
  conflictsOut = 'info: ' + mma + ': VFS_MOD_VERSION mod "ma" unsupported on 3.262.1 (Min "3.301" Max ""); skipped\n0 findings\n';
  w(path.join(as2, 'mods', 'mc', 'mod.info'), '{mod\r\n\t{Name "Mod C"}\r\n}\r\n');
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb', 'mc'] }, mw);
  ok(r.compared === 2 && r.clean && !r.files.length && !/nothing is compared/.test(r.skippedText), 'mowas2 mods together: one left out, the other two compared');
  ok(r.winner === 'mc', 'mowas2 mods together: the first mod left out, the last mod still wins (' + r.winner + ')');
  const mmc = path.join(as2, 'mods', 'mc').replace(/\\/g, '/');
  conflictsOut = 'info: ' + mmc + ': VFS_MOD_VERSION mod "MC" unsupported on 3.262.1 (Min "3.301" Max ""); skipped\n0 findings\n';
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb', 'mc'] }, mw);
  ok(r.compared === 2 && r.winner === 'mb' && r.order.join() === 'ma,mb,mc', 'mowas2 mods together: the last mod left out by the version gate, the winner is the last mod the game loads (' + r.winner + ')');
  // the value table and the groups come from the JSON items: one value row, grouped by kind with the most harmful kind first
  conflictsOut = '';
  conflictsItems = [
    { level: 'warn', file: 'set/a.set', line: 3, code: 'WARN_CONFLICT_MOD_MOD', msg: 'x', d: { key: '{x}', values: [{ src: 'vanilla', val: '1' }, { src: 'ma', val: '2' }, { src: 'mb', val: '3' }], winner: 'mb', losers: ['ma'] } },
    { level: 'warn', file: 'set/a.set', line: 5, code: 'CONFLICT_ENTRY_LOST', msg: 'x', d: { key: 'card "c"', values: [], winner: 'mb', losers: ['ma'] } },
    { level: 'warn', file: 'interface/text/#b.lng', line: 2, code: 'CONFLICT_LNG_KEY_CROSS', msg: 'x', d: { key: 'k', values: [{ src: 'ma', val: '"A"' }, { src: 'mb', val: '"B"' }], winner: 'mb', loser: 'ma', other: 'interface/text/#a.lng', otherLine: 2 } },
    { level: 'warn', file: 'entity/b/foo.def', line: 1, code: 'CONFLICT_ENTITY_NAME_DUP', msg: 'x', d: { key: 'foo', winner: 'ma', loser: 'mb', other: 'entity/a/foo.def' } },
    { level: 'info', file: 'set/a.set', line: 1, code: 'CONFLICT_PATCHED', msg: 'x', d: {} },
  ];
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, as64);
  ok(r.valueRows === 1 && r.clashes.length === 1 && r.clashes[0].key === '{x}' && !('skipped' in r), 'mods together: the value row is read from the JSON items, as64 answer has no skipped field');
  ok(r.groups.map(g => g.kind).join() === 'entity,lost,value,textcross' && r.total === 4 && r.decided === 1, 'mods together: clashes grouped by kind, most harmful first (' + r.groups.map(g => g.kind + ':' + g.count) + ')');
  { const e = r.groups[0].items[0], l = r.groups[1].items[0], t = r.groups[3].items[0];
    ok(e.winner === 'ma' && e.loser === 'mb' && e.fix.hand && !e.fix.patch && e.fix.last === 'ma' && e.other === 'entity/a/foo.def', 'guided fix: an entity name twin is hand work (rename); the other order puts the mod that is kept now last');
    ok(l.fix.patch === 'merge' && l.fix.last === 'ma' && l.winner === 'mb' && l.keys[0].key === 'card "c"', 'guided fix: a lost entry can go into a patch mod that keeps both');
    ok(t.fix.patch === 'text' && !t.fix.last && t.keys[0].values.length === 2 && t.otherLine === 2, 'guided fix: a text key in two files gets a text pick'); }
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, mk('goh', { gohDir: () => as2 }));
  { const t = r.groups.find(g => g.kind === 'textcross'); ok(t && !t.items[0].fix.patch && t.items[0].fix.hand, 'guided fix under GoH: no text pick (the first copy of a key wins there), hand work said'); }
  conflictsItems = [];
  w(path.join(as2, 'mods', 'robz 1.31.0', 'mod.info'), '{mod\r\n\t{Name "Robz"}\r\n}\r\n');
  ctxProfileMods = ['robz 1.31.0:1', 'ma:0'];
  r = await R('POST /api/x/share/card')(null, {}, as64);
  ok(r.order.join() === 'robz 1.31.0,ma' && !r.missing.length, 'play card: a mod folder with a space in its name is one mod, read from modswitch --json (' + r.order.join('|') + ')');
  ctxProfileMods = 'robz 1.31.0:1 ma:0';   // a modswitch that prints no JSON line: the active: text line, read as before
  r = await R('POST /api/x/share/card')(null, {}, as64);
  ok(r.order.join() === 'robz 1.31.0,ma' && !r.missing.length, 'play card: no JSON line, the active: text line read as before (' + r.order.join('|') + ')');
  ok(T.activeOf('noise {x\n{"profile":"p","active":[{"entry":"a b:1","folder":"a b"},{"entry":"c:0"}]}\n', as2).join('|') === 'a b|c' && T.activeOf('{"active":[]}', as2).length === 0, 'play card: activeOf reads the JSON line (folder, else the entry without :N), an empty list stays empty');
  ok(T.activeList('x y:0', as2).join('|') === 'x|y', 'play card: words that are no installed folder stay one mod each');
  r = await R('GET /api/x/share/uploader')(U(''), null, mw);
  ok(r.game === 'as2' && r.gameName === 'Assault Squad 2' && r.appid === '244450', 'mowas2 uploader: the label names MoW:AS2 on its own folder (' + r.gameName + ')');
  r = await R('GET /api/x/share/uploader')(U(''), null, as64);
  ok(r.game === 'as64' && /64-bit/.test(r.gameName), 'as64 uploader: label as before');
  ctxProfileMods = '(none)';
  await rej(R('POST /api/x/share/card')(null, {}, as64), /no mods in the list/, 'empty profile: asks to pick mods (not a "(none)" mod)');
  ctxProfileMods = [];
  await rej(R('POST /api/x/share/card')(null, {}, as64), /no mods in the list/, 'empty profile (--json, active []): asks to pick mods');
  r = await R('POST /api/x/share/updated')(null, { mod: path.join(as2, 'mods', 'ma') }, mw);
  ok(has(last('release-check'), '--as2', as2) && has(last('release-check'), '--exe', 'mowas_2') && has(last('release-check'), '--to', 'mowas2') && !('readsAs64' in r) && !/as64\.exe/.test(r.text), 'mowas2 game updated: --as2 --exe mowas_2 (mowas_2.exe checked itself), replan --to mowas2, no "reads as64.exe" line');
  await R('POST /api/x/share/updated')(null, {}, mw);
  ok(last('release-check').join(' ') === '--no-upstream --as2 ' + as2 + ' --exe mowas_2', 'mowas2 game updated, no mod: --no-upstream --as2 <AS2> --exe mowas_2');
  r = await R('POST /api/x/share/updated')(null, { mod: path.join(as2, 'mods', 'ma') }, as64);
  ok(!last('release-check').includes('--to') && !last('release-check').includes('--exe') && !('readsAs64' in r) && !/^MoW:AS2/.test(r.text), 'as64 game updated: arguments as before (no --exe)');
  await R('POST /api/x/share/updated')(null, {}, as64);
  ok(last('release-check').join(' ') === '--no-upstream --as2 ' + as2, 'as64 game updated, no mod: --no-upstream --as2 <AS2>, as before');

  // ===== GoH
  const goh = path.join(work, 'Call to Arms - Gates of Hell');
  w(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'not a real exe');
  w(path.join(goh, 'binaries', 'x64', 'steam_api64.dll'), 'the GoH dll');
  w(path.join(goh, 'resource', 'entity.pak'), 'x');
  const ginfo = '{mod\r\n\t; name of your mod\r\n\t{name "In Game"}\r\n\t{tags "no_delete"}\r\n\t{desc "d"}\r\n\t{minGameVersion "1.067"}\r\n}\r\n';
  w(path.join(goh, 'mods', 'ingame', 'mod.info'), ginfo);
  w(path.join(goh, 'mods', 'other_mod', 'mod.info'), ginfo.replace('In Game', 'Other'));
  const own = path.join(work, 'mygoh', 'my_mod');   // a GoH mod folder of the user's own, outside the install
  w(path.join(own, 'mod.info'), ginfo.replace('In Game', 'Mine'));
  w(path.join(own, 'resource', 'set', 'a.set'), '{x 1}\r\n');
  const bad = path.join(work, 'mygoh', 'my-mod'); w(path.join(bad, 'mod.info'), ginfo);
  const gc = mk('goh', { gohDir: () => goh, curDir: () => goh, gohProfiles: () => [path.join(work, 'gohuser', 'profiles', '1', 'options.set')] });
  r = await R('GET /api/x/share/mods')(U(''), null, gc);
  ok(r.gid === 'goh' && r.game === goh.replace(/\\/g, '/') && r.mods.map(m => m.folder).join() === 'ingame,other_mod' && r.mods[0].name === 'In Game' && r.mods[0].min === '1.067', 'goh mod list: <GoH>/mods, lowercase keys read');
  r = await R('GET /api/x/share/info')(U('mod=' + encodeURIComponent(own)), null, gc);
  ok(r.gid === 'goh' && Object.keys(r.ranges).join() === 'goh' && r.ranges.goh.min === '1.067' && r.ranges.goh.max === '' && r.range === 'goh', 'goh About: one range, the exe version (fallback 1.067) with an open end (' + JSON.stringify(r.ranges) + ')');
  ok(r.tags === 'no_delete' && r.develop === false && r.other.length === 0 && r.fields.Name === 'Mine', 'goh About: Tags read as a key of its own, develop off');
  ok(T.rangeKind({ MinGameVersion: '1.067', MaxGameVersion: '1.08' }, r.ranges) === 'custom' && T.rangeKind({}, r.ranges) === 'none', 'goh range kinds: own min + open end = goh, else custom');
  // preview, then write on the user's own folder: develop added, other tag kept, key spelling kept, Max left out
  let p = await R('POST /api/x/share/info')(null, { mod: own, fields: { Name: 'Mine 2', MinGameVersion: '1.067', MaxGameVersion: '' }, develop: true }, gc);
  ok(!p.wrote && p.changes.map(c => c.key).join() === 'Name,Tags' && p.changes[1].to === 'no_delete develop', 'goh About preview: name and develop tag, nothing written (' + JSON.stringify(p.changes) + ')');
  p = await R('POST /api/x/share/info')(null, { mod: own, fields: { Name: 'Mine 2', MinGameVersion: '1.067', MaxGameVersion: '' }, develop: true, write: true }, gc);
  let txt = fs.readFileSync(path.join(own, 'mod.info'), 'latin1');
  ok(p.wrote && /\{name "Mine 2"\}/.test(txt) && /\{tags "no_delete develop"\}/.test(txt) && /; name of your mod/.test(txt) && !/\{Name /.test(txt) && !/maxGameVersion/i.test(txt) && txt.endsWith('}\r\n'), 'goh About write: key spelling kept, comment kept, tag added, no Max (open end)');
  p = await R('POST /api/x/share/info')(null, { mod: own, fields: { MinGameVersion: '1.067', MaxGameVersion: '1.099' }, develop: false, write: true }, gc);
  txt = fs.readFileSync(path.join(own, 'mod.info'), 'latin1');
  ok(/\{tags "no_delete"\}/.test(txt) && /\t\{maxGameVersion "1\.099"\}\r\n\}/.test(txt), 'goh About write: develop dropped, a new Max spelled as the GoH template');
  p = await R('POST /api/x/share/info')(null, { mod: own, fields: { MinGameVersion: '', MaxGameVersion: '' }, write: true }, gc);
  txt = fs.readFileSync(path.join(own, 'mod.info'), 'latin1');
  ok(!/GameVersion/i.test(txt) && p.changes.length === 2, 'goh About write: both bounds may be left out (GoH: each optional)');
  const before = fs.readFileSync(path.join(goh, 'mods', 'ingame', 'mod.info'), 'latin1');
  await rej(R('POST /api/x/share/info')(null, { mod: path.join(goh, 'mods', 'ingame'), fields: { Name: 'X' }, write: true }, gc), /Gates of Hell/, 'goh About write inside the GoH install: the writeguard refusal');
  await rej(R('POST /api/x/share/version')(null, { mod: path.join(goh, 'mods', 'ingame'), kind: 'minor', write: true }, gc), /Gates of Hell/, 'goh new version inside the GoH install: refused');
  ok(fs.readFileSync(path.join(goh, 'mods', 'ingame', 'mod.info'), 'latin1') === before, 'nothing written into the GoH install');
  p = await R('POST /api/x/share/version')(null, { mod: own, kind: 'minor', write: true }, gc);
  ok(p.wrote && p.next === '1.0' && /\t\{Version "1\.0"\}\r\n\}/.test(fs.readFileSync(path.join(own, 'mod.info'), 'latin1')), 'goh new version on the own folder: Version line written');
  // release check
  r = await R('POST /api/x/share/gate')(null, { mod: own }, gc);
  ok(has(last('modinfo'), '--goh') && has(last('modinfo'), '--game', goh), 'goh release check: modinfo --goh --game <GoH> (' + last('modinfo').slice(1).join(' ') + ')');
  ok(has(last('check'), '--target', 'goh'), 'goh release check: check --target goh');
  ok(has(last('check'), '--exe', 'goh') && has(last('check'), '--goh', goh) && !last('check').includes('--game') && r.items.find(i => i.id === 'check').target === 'goh', 'goh release check: check --exe goh --goh <GoH>');
  ok(has(last('packer'), '--goh') && r.items.find(i => i.id === 'folder').status === 'pass', 'goh release check: packer --goh, folder name row passes');
  r = await R('POST /api/x/share/gate')(null, { mod: bad, deep: false }, gc);
  ok(r.items.find(i => i.id === 'folder').status === 'fail' && !r.ready, 'goh release check: a folder name with - fails (GoH skips it)');
  ok(T.gohBadFolder('my mod') && T.gohBadFolder('as64+') && T.gohBadFolder('mé') && !T.gohBadFolder('mod_123') && !T.gohBadFolder('My.Mod_2'), 'goh folder name rule');
  r = await R('GET /api/x/share/info')(U('mod=' + encodeURIComponent(bad)), null, gc);
  ok(r.warns.includes('goh_folder'), 'goh About: folder name warning');
  // package and Workshop copy
  await R('POST /api/x/share/package')(null, { mod: own }, gc);
  ok(has(last('packer'), '--goh') && has(last('packer'), '--dry'), 'goh package plan: packer --goh');
  // Pack for speed is the packer default: box on = no flag, box off = --no-speed, on every game (GoH keeps --goh)
  await R('POST /api/x/share/package')(null, { mod: own, speed: false }, gc);
  ok(has(last('packer'), '--goh') && has(last('packer'), '--no-speed') && has(last('packer'), '--dry'), 'goh package plan without the box: packer --goh --no-speed');
  for (const [c, nm] of [[as64, 'as64'], [mw, 'mowas2']]) {
    await R('POST /api/x/share/package')(null, { mod: mma, speed: true }, c);
    ok(!has(last('packer'), '--no-speed') && !has(last('packer'), '--goh'), nm + ' package plan for speed: the packer default, no --no-speed');
    await R('POST /api/x/share/package')(null, { mod: mma, speed: false }, c);
    ok(has(last('packer'), '--no-speed'), nm + ' package plan without the box: --no-speed');
  }
  const po = await R('POST /api/x/share/package')(null, { mod: own, out: path.join(goh, 'out'), write: true }, gc);
  ok(po.refused && !fs.existsSync(path.join(goh, 'out')), 'goh package into the GoH install refused (' + (po.refused && po.refused.key) + ')');
  const wo = path.join(work, 'wsout');
  r = await R('POST /api/x/share/workshop')(null, { mod: own, out: wo, write: true }, gc);
  ok(r.wrote && fs.existsSync(path.join(wo, 'my_mod', 'mod.info')), 'goh Workshop clean copy outside the install');
  await rej(R('POST /api/x/share/workshop')(null, { mod: own, out: path.join(goh, 'ws'), write: true }, gc), /refused/, 'goh Workshop copy into the GoH install refused');
  // the uploader: default folder = the GoH install, binaries/x64, Steam id 400750, the dll there kept
  r = await R('GET /api/x/share/uploader')(U(''), null, gc);
  ok(r.game === 'goh' && /binaries\/x64$/.test(r.dir) && r.appid === '400750' && r.steps.find(s => s.file === 'steam_api64.dll').action === 'keep' && !fs.existsSync(path.join(goh, 'binaries', 'x64', 'workshop_gui.exe')), 'goh uploader status: the GoH install by default, binaries/x64, dll kept, nothing written');
  if (r.hasPackage) {
    r = await R('POST /api/x/share/uploader')(null, { act: 'install', confirm: true }, gc);
    ok(r.installed && fs.readFileSync(path.join(goh, 'binaries', 'x64', 'steam_api64.dll'), 'utf8') === 'the GoH dll' && fs.readFileSync(path.join(goh, 'binaries', 'x64', 'steam_appid.txt'), 'utf8') === '400750', 'goh uploader install (fixture): the one allowed write, dll never overwritten, appid 400750');
  }
  // play together: the GoH profile, call_to_arms.exe, version line, no lobby size check
  ctxProfileMods = ['ingame:0', 'other_mod'];
  const before2 = calls.length;
  r = await R('POST /api/x/share/card')(null, {}, gc);
  ok(has(last('modswitch'), '--game', goh) && has(last('modswitch'), '--profile', path.join(work, 'gohuser', 'profiles', '1', 'options.set')) && has(last('modswitch'), '--exe', 'goh') && last('modswitch').includes('--json'), 'goh play card: modswitch --exe goh --json on the GoH install with the GoH profile');
  ok(r.exe === 'call_to_arms.exe' && /^Game: call_to_arms\.exe/m.test(r.text) && /same game version/.test(r.text) && r.order.join() === 'ingame,other_mod' && r.syncNa === true && !calls.slice(before2).some(c => c.tool === 'mpsync'), 'goh play card: call_to_arms.exe, version rule, lobby check left out with the plain line');
  const nMs = calls.filter(c => c.tool === 'modswitch').length;
  await rej(R('POST /api/x/share/card')(null, {}, Object.assign({}, gc, { gohProfiles: () => [] })), /no mods in the list/, 'goh play card: no GoH profile = the user ticks the mods');
  ok(calls.filter(c => c.tool === 'modswitch').length === nMs, 'goh play card: modswitch is not run without the GoH profile (it would read the AS2 one)');
  await rej(R('POST /api/x/share/card')(null, {}, Object.assign({}, gc, { gohProfiles: () => ['a', 'b'] })), /no mods in the list/, 'goh play card: two profiles = the user ticks the mods');
  // mods together and game updated
  await R('POST /api/x/share/clashes')(null, { mods: ['ingame', 'other_mod'] }, gc);
  ok(calls.filter(c => c.tool === 'conflicts').slice(-1).every(c => has(c.args, '--game', goh) && has(c.args, '--exe', 'goh') && has(c.args, '--fmt', 'json')), 'goh mods together: conflicts on the GoH install, --exe goh');
  await R('POST /api/x/share/updated')(null, { mod: own }, gc);
  ok(has(last('release-check'), '--goh', goh) && has(last('release-check'), '--exe', 'goh') && !last('release-check').includes('--as2') && has(last('release-check'), '--to', 'goh'), 'goh game updated: release-check --goh <GoH> --exe goh, replan --to goh');
  await R('POST /api/x/share/updated')(null, {}, gc);
  ok(last('release-check').join(' ') === '--no-upstream --goh ' + goh + ' --exe goh', 'goh game updated, no mod: --goh <GoH> --exe goh (the GoH exe only)');
  // page and words: GoH range, develop, help lines and the plain line in four languages
  const keys = ['range.goh', 'range.noneGoh', 'range.helpGoh', 'range.develop', 'range.developH', 'gate.i.folder', 'ws.gohTags', 'play.gohSync', 'tog.skipped', 'tog.fewer'];
  ok(keys.every(k => ['en', 'ru', 'uk', 'zh'].every(l => typeof L[l]['share.' + k] === 'string' && L[l]['share.' + k].length > 3)) && ['en', 'ru', 'uk', 'zh'].every(l => /\{min\}/.test(L[l]['share.range.goh'])), 'GoH texts in en, ru, uk, zh');
  ok(/r\.gid==='goh'/.test(SC) && /b\.develop=dev\.checked/.test(SC) && /x\.syncNa/.test(SC) && /'na\.line'/.test(SC) && /GID\(\)==='goh'/.test(SC) && /S\.mod\+'\|'\+GID\(\)/.test(SC) && /x\.skipped/.test(SC) && /T\('tog\.skipped'/.test(SC), 'page: ranges of the page game, develop box, plain line in the card, sections rebuilt per game');
};
