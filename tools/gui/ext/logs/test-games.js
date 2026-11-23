// logs ext test, game parity: MoW:AS2 and Gates of Hell branches of every route, made-up fixtures only (no game, no real install).
// Arg: scratch dir. Run by test.js after its own checks; prints "logs games PASS" or the failures, exit 1 on any.
// Tools the routes start are stood in (logtriage, wouldload, refcheck) and their argument lists recorded; modinfo runs for real.
// Author: Imperator_Aug (ARSENAL, ia-124281e5)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'logsg-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const TOOLS = path.join(__dirname, '..', '..', '..');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const wr = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };

// ---- fixture: one home with the AS2 user dir and the GoH user dir (LocalAppData form, GHVFS-13)
const home = path.join(work, 'home');
const ud = path.join(home, 'Documents', 'my games', 'men of war - assault squad 2');
const gud = path.join(home, 'AppData', 'Local', 'digitalmindsoft', 'gates of hell');
wr(path.join(ud, 'log', 'game.log'), 'Loading...\r\n');
// an AS64 instance-1 log, newer than the main one (mowas_2.exe has no -instance, TST-19: it never writes there)
const ud1 = ud + ' - instance 1';
wr(path.join(ud1, 'log', 'game.log'), 'Loading 1...\r\n');
{ const t = new Date(Date.now() + 60000); fs.utimesSync(path.join(ud1, 'log', 'game.log'), t, t); }
wr(path.join(ud, 'profiles', 'p1', 'options.set'), '{options {mods "newmod:1" "goodmod:1"}}\r\n');
wr(path.join(ud, 'profiles', 'p2', 'options.set'), '{options {mods "as64+:0" "newmod:1"}}\r\n');
wr(path.join(gud, 'log', 'game.log'), '[00:00:00] Scanning mods in x/mods/\r\n[00:00:01] Found 3 available mods\r\n');
wr(path.join(gud, 'log', 'minidumps', 'crash_1.dmp'), 'MDMP');
wr(path.join(gud, 'profiles', '123', 'options.set'), '{options {mods "good_mod:1" "my-mod:1" "oldver:1" "ghost:1"}}\r\n');
wr(path.join(gud, 'profiles', '123', 'settings.set'), '{settings {lastGameVersion "1.067.0"}}\r\n');
// AS2 install: as64.exe marks it, two mods
const game = path.join(work, 'game');
wr(path.join(game, 'as64.exe'), 'MZ');
wr(path.join(game, 'mods', 'goodmod', 'mod.info'), '{Mod {Name "Good"} {MinGameVersion "3.262"} {MaxGameVersion "3.262.1"}}\r\n');
wr(path.join(game, 'mods', 'newmod', 'mod.info'), '{Mod {Name "New"} {MinGameVersion "3.301"}}\r\n');
// GoH install: the exe file (no version block: the version comes from settings.set), mods
const goh = path.join(work, 'goh');
wr(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), 'MZ');
wr(path.join(goh, 'mods', 'good_mod', 'mod.info'), '{mod {name "Good"}}\r\n');
wr(path.join(goh, 'mods', 'my-mod', 'mod.info'), '{mod {name "Dash"}}\r\n');
wr(path.join(goh, 'mods', 'oldver', 'mod.info'), '{mod {name "Old"} {MinGameVersion "1.040"} {MaxGameVersion "1.050"}}\r\n');
wr(path.join(goh, 'mods', 'devmod', 'mod.info'), '{mod {name "Dev"} {MinGameVersion "9.0"} {Tags "develop"}}\r\n');
process.env.AS2_HOME = home;

const X = require('./index'), R = require('./routes'), routes = X.routes;
const ran = [];
let ltLines = [];   // info lines the logtriage stand-in prints (the LOG-20 note case sets them)
// ctx of one game, like gui.js gives every ext route; stand-ins for the tools that do not know --exe yet in this worktree
const mkCtx = gid => ({
  tools: TOOLS, tmpRoot: work, allowLaunch: false, game: () => game,
  gameId: () => gid, exe: () => ({ as64: 'as64', mowas2: 'mowas_2', goh: 'goh' })[gid], kind: () => (gid === 'goh' ? 'goh' : 'as2'),
  gohDir: () => goh, curDir: () => (gid === 'goh' ? goh : game),
  runTool: (tool, entry, args, o = {}) => new Promise(res => {
    ran.push({ tool, args });
    if (tool === 'logtriage') return res({ code: 0, stdout: JSON.stringify({ groups: [{ code: 'LOG_WARN', msg: 'Unknown ability', file: 'game.log', line: 2, count: 1 }], lines: ltLines, header: ['h'] }), stderr: '' });
    if (tool === 'wouldload') { const t = args[args.indexOf('--exe') + 1]; return res({ code: 0, stdout: 'VERSION: accepted on 1.067 (exe): ok\nVERDICT ' + t + ': LOADS_STATIC: nothing found\n', stderr: '' }); }
    if (tool === 'refcheck') return res(args.includes('goh') ? { code: 2, stdout: '', stderr: 'refcheck: not available for GoH: no GoH reference rules (ROW-1)\n' } : { code: 0, stdout: '', stderr: '' });
    const r = cp.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: o.timeoutMs || 60000, env: process.env });
    res({ code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: !!r.error });
  }),
});
const U = q => new URL('http://x/api/x/logs/' + q);
const call = (gid, m, n, q, body) => routes[m + ' /api/x/logs/' + n](U(q || n), body || null, mkCtx(gid));
const last = tool => ran.filter(r => r.tool === tool).pop();
const codes = ws => ws.map(w => w.code);

(async () => {
  // ---- the game of a request: body.target first, else ctx.gameId(); nothing = null (old behaviour)
  ok(R.gidOf(mkCtx('goh'), { target: 'mowas2' }) === 'mowas2' && R.gidOf(mkCtx('goh'), {}) === 'goh' && R.gidOf({}, {}) === null && R.gidOf(null, { target: 'mowas_2' }) === 'mowas2', 'gidOf: target, then ctx, else null');

  // ---- find: AS2 user dir under as64 and mowas2 (shared), the GoH user dir under goh, with its minidumps (GHLOG-36)
  const fa = await call('as64', 'GET', 'find'), fm = await call('mowas2', 'GET', 'find'), fg = await call('goh', 'GET', 'find');
  ok(fa.newest && fa.newest.path.indexOf('assault squad 2') >= 0 && fa.newest.inst === 1 && fa.instances.length === 2 && !fa.skippedInstances, 'find as64: the instance folders as before ' + JSON.stringify(fa.newest));
  ok(fm.newest && fm.newest.inst === 0 && fm.newest.path === path.join(ud, 'log', 'game.log') && fm.instances.length === 1 && fm.skippedInstances === 1, 'find mowas2: only the main log folder (no -instance in mowas_2.exe) ' + JSON.stringify(fm.newest));
  await call('mowas2', 'POST', 'explain', 'explain', {});
  ok(last('logtriage').args[0] === path.join(ud, 'log'), 'explain mowas2: the main log folder, not the AS64 instance-1 log ' + last('logtriage').args[0]);
  ok(fg.game === 'goh' && fg.instances.length === 1 && fg.newest && fg.newest.path.indexOf('gates of hell') >= 0, 'find goh: the GoH user dir ' + JSON.stringify(fg.newest));
  ok(fg.instances[0].dumps.some(d => d.name === 'crash_1.dmp'), 'find goh: minidump listed ' + JSON.stringify(fg.instances[0].dumps));
  const f0 = R.find();
  ok(f0.newest && f0.newest.path === fa.newest.path && f0.game === undefined && f0.instances.length === 2, 'find with no ctx: as before (other exts call logs.find())');

  // ---- explain: logtriage gets --exe only when the game is not as64; GoH gets its install as --game
  await call('as64', 'POST', 'explain', 'explain', {});
  let a = last('logtriage').args;
  ok(!a.includes('--exe') && a[a.indexOf('--game') + 1] === game, 'explain as64: argument list as before ' + a.join(' '));
  await call('mowas2', 'POST', 'explain', 'explain', {});
  a = last('logtriage').args;
  ok(a.join(' ').indexOf('--exe mowas_2') >= 0, 'explain mowas2: --exe mowas_2 ' + a.join(' '));
  // the shared log folder holds an as64.exe log: logtriage's LOG-20 note becomes one plain note on the MoW:AS2 page
  ltLines = ['info: game.log: LOG_NOTE this log was written by as64.exe, not mowas_2.exe: AS64 and MoW:AS2 share one log folder, the last game started wrote it (LOG-20)', 'info: game.log: LOG_NOTE sidecar has no Exception block', '1 findings'];
  const en = await call('mowas2', 'POST', 'explain', 'explain', {});
  const nt = en.results[0].notes;
  ok(nt.length === 1 && nt[0].code === 'LOG_NOTE' && /written by AS64 \(as64\.exe\), not by MoW:AS2 \(mowas_2\.exe\)/.test(nt[0].text) && /share one log folder/.test(nt[0].text) && en.results[0].cards.length === 1, 'explain mowas2: LOG-20 note shown in plain words, other LOG_NOTE lines left out ' + JSON.stringify(nt));
  ltLines = ['info: game.log: LOG_NOTE this is a Gates of Hell log, not a as64.exe one: read with the GoH form'];
  const eh = await call('as64', 'POST', 'explain', 'explain', {});
  ok(eh.results[0].notes.length === 1 && /Gates of Hell log, not one of AS64/.test(eh.results[0].notes[0].text), 'explain as64: a GoH log in the AS2 folder is named ' + JSON.stringify(eh.results[0].notes));
  ltLines = [];
  const e0 = await call('as64', 'POST', 'explain', 'explain', {});
  ok(e0.results[0].notes.length === 0, 'explain as64: no note when the tool prints none');
  const eg = await call('goh', 'POST', 'explain', 'explain', {});
  a = last('logtriage').args;
  ok(a[0].indexOf('gates of hell') >= 0 && a.join(' ').indexOf('--exe goh') >= 0 && a[a.indexOf('--game') + 1] === goh, 'explain goh: GoH log dir, --exe goh, --game <GoH> ' + a.join(' '));
  ok(eg.results[0].cards.length === 1, 'explain goh: cards drawn from the tool answer');

  // ---- dump: GoH crash text (GHLOG-09/10): stamp, code, RIP, registers, error line
  const crash = path.join(work, 'goh_crash.log');
  wr(crash, ['[00:01:02] Mount package x.pak with 3 entries', '[00:01:03] Mod: activate mod good_mod', '[00:01:04] Unknown define "abc" (a.cpp:212) @ [main]',
    '[00:01:04] Application error APP_SDL_ERROR 0x0bad0003', '[00:01:04] RIP=00007ff61a2b3c4d RAX=0000000000000000 RBX=0000000000000001', '[00:01:04] Version 1.067.0 x64'].join('\r\n'));
  const dg = await call('goh', 'POST', 'dump', 'dump', { file: crash });
  ok(dg.hasException && dg.exception.code === 'APP_SDL_ERROR' && dg.exception.codeNum === '0x0bad0003', 'dump goh: code ' + JSON.stringify(dg.exception));
  ok(dg.exception.address === '0x7ff61a2b3c4d' && dg.exception.registers.includes('RAX') && dg.exception.src === 'a.cpp:212' && /Unknown define/.test(dg.exception.message) && dg.exception.thread === 'main', 'dump goh: RIP, registers, error line ' + JSON.stringify(dg.exception));
  ok(dg.plain.some(p => /data \(SDL\) file/.test(p)) && dg.plain.some(p => /BugSplat/.test(p)) && dg.before.some(l => /Mod: activate/.test(l)), 'dump goh: plain words and the lines before ' + JSON.stringify(dg.plain));
  const dn = await call('goh', 'POST', 'dump', 'dump', { file: path.join(gud, 'log', 'game.log') });
  ok(!dn.hasException && /not a crash report/.test(dn.plain[0]), 'dump goh: a normal game.log is not a crash report');
  // a real GoH game.log carries warnings in the error form "(file.cpp:line) @ [thread]": they are not a crash, and not the cause of one
  const warnLine = '[00:00:05] !!! WARNING: Skipping broken shader cache file //shader_cache/dx11.0/06e8.hso (x.cpp:84) @ [main_loop]';
  const wlog = path.join(work, 'goh_warn.log'); wr(wlog, ['[00:00:01] Loading', warnLine, '[00:00:06] Ready'].join('\r\n'));
  const dw = await call('goh', 'POST', 'dump', 'dump', { file: wlog });
  ok(!dw.hasException && /not a crash report/.test(dw.plain[0]), 'dump goh: warning lines alone are not a crash report ' + JSON.stringify(dw.exception));
  const wcr = path.join(work, 'goh_warn_crash.log');
  wr(wcr, ['[00:00:01] Loading', warnLine, '[00:00:06] Ready', '[00:09:00] Can not find entity "x" (b.cpp:120) @ [main]', '[00:09:00] APP_ERROR 0x0bad0001', '[00:09:00] RIP=00007ff600001000 RAX=0'].join('\r\n'));
  const dwc = await call('goh', 'POST', 'dump', 'dump', { file: wcr });
  ok(dwc.hasException && dwc.exception.code === 'APP_ERROR' && dwc.exception.src === 'b.cpp:120' && /Can not find entity/.test(dwc.exception.message), 'dump goh: the error line next to the code, not an earlier warning ' + JSON.stringify(dwc.exception));
  ok(dg.exception.registers.join(',') === 'RAX,RBX', 'dump goh: registers without RIP ' + dg.exception.registers);
  ok(dg.exception.messageInferred && dg.plain.some(p => /nearest error line before the stop/.test(p) && /guess/.test(p)), 'dump goh: the error line is called inferred ' + JSON.stringify(dg.plain));
  // a harmless line in the error form 10 lines above the code is not taken as the cause (real GoH logs print these)
  const far = ['[00:00:01] Incorrect color definition (a.cpp:128) @ [main]'];
  for (let i = 0; i < 9; i++) far.push('[00:00:0' + (i % 9 + 1) + '] Loading part ' + i);
  far.push('[00:05:00] Application error APP_SDL_ERROR 0x0bad0003', '[00:05:00] RIP=00007ff600002000 RAX=0 RBX=1');
  const farf = path.join(work, 'goh_far.log'); wr(farf, far.join('\r\n'));
  const df = await call('goh', 'POST', 'dump', 'dump', { file: farf });
  ok(df.hasException && df.exception.code === 'APP_SDL_ERROR' && df.exception.message === '' && df.exception.src === '' && !df.plain.some(p => /Incorrect color/.test(p)) && df.plain.some(p => /No error line was found/.test(p)) && !df.plain.some(p => /named in the message|message names/.test(p)) && df.plain.some(p => /^Read the lines before the stop/.test(p)),'dump goh: a far error-form line is not the cause ' + JSON.stringify(df.exception) + JSON.stringify(df.plain));
  // two error lines near the code: the one with the code's own stamp wins over a nearer one of another second
  const ss = ['[00:07:00] Can not open "a.mdl" (a.cpp:40) @ [main]', '[00:07:00] Mount package z.pak', '[00:06:59] Failed to delete x.jpg: error 3 (b.cpp:81) @ [io]', '[00:07:00] APP_ERROR 0x0bad0001'];
  const ssf = path.join(work, 'goh_stamp.log'); wr(ssf, ss.join('\r\n'));
  const ds = await call('goh', 'POST', 'dump', 'dump', { file: ssf });
  ok(ds.exception.src === 'a.cpp:40', 'dump goh: the error line with the same stamp wins ' + JSON.stringify(ds.exception));
  const oom = path.join(work, 'goh_oom.txt'); wr(oom, '[00:00:09] Out of memory 0x0bad0004\r\n');
  ok((await call('goh', 'POST', 'dump', 'dump', { file: oom })).exception.code === 'APP_ERROR_OUT_OF_MEMORY', 'dump goh: out of memory code');
  // an AS2 sidecar under GoH keeps the AS2 parser (the Exception block)
  const as2 = path.join(work, 'x.mdmp.log'); wr(as2, 'Build: 1\r\n***** Exception *****\r\nEXCEPTION_ACCESS_VIOLATION at 0x00401000\r\nAt 0x1 (Foo' + '::Bar+0x10, x.cpp:12)\r\n');   // split so the release scrub keeps the frame
  ok((await call('goh', 'POST', 'dump', 'dump', { file: as2 })).exception.kind === 'crash', 'dump goh: an AS2 Exception block is still read');

  // ---- enabled: mowas2 drops the as64+ advice and says a new-mode mod is skipped; goh: GoH profile, name rule, version gate
  const ea = await call('as64', 'GET', 'enabled', 'enabled');
  ok(codes(ea.warnings).includes('NO_AS64PLUS'), 'enabled as64: as64+ advice kept ' + codes(ea.warnings));
  const em = await call('mowas2', 'GET', 'enabled', 'enabled');
  ok(!codes(em.warnings).some(c => /AS64PLUS|WITH_PLUS|PLUS_BELOW/.test(c)) && codes(em.warnings).includes('MOWAS2_NEW_MODE'), 'enabled mowas2: no as64+ advice, new mode skipped ' + codes(em.warnings));
  ok(em.mods.find(m => m.name === 'newmod').mode === 'as64only' && em.target === 'mowas2', 'enabled mowas2: mode as64only');
  const em2 = await call('mowas2', 'GET', 'enabled', 'enabled?options=' + encodeURIComponent(path.join(ud, 'profiles', 'p2', 'options.set')));
  ok(codes(em2.warnings).includes('MOWAS2_NO_PLUS') && !codes(em2.warnings).includes('DOC_MOD_NOT_INSTALLED'), 'enabled mowas2: as64+ in the list is dropped by mowas_2 ' + codes(em2.warnings));
  const ema = await call('as64', 'GET', 'enabled', 'enabled?target=mowas2');
  ok(codes(ema.warnings).includes('MOWAS2_NEW_MODE'), 'enabled: ?target=mowas2 wins over the ctx game');
  const eg2 = await call('goh', 'GET', 'enabled', 'enabled');
  const gw = codes(eg2.warnings);
  ok(eg2.options && eg2.options.indexOf('gates of hell') >= 0 && eg2.game === goh, 'enabled goh: GoH profile and install ' + eg2.options);
  ok(eg2.warnings.some(w => w.code === 'GOH_BAD_NAME' && w.mod === 'my-mod') && eg2.warnings.some(w => w.code === 'GOH_VERSION' && w.mod === 'oldver') && eg2.warnings.some(w => w.code === 'DOC_MOD_NOT_INSTALLED' && w.mod === 'ghost'), 'enabled goh: name rule, version gate, missing folder ' + gw);
  ok(!gw.some(c => /AS64PLUS|WITH_PLUS|PLUS_BELOW|DOC_CAPITALS|MOWAS2/.test(c)) && !eg2.warnings.some(w => w.mod === 'good_mod'), 'enabled goh: no as64+ or AS2 rules, good_mod clean ' + gw);
  // GoH has no capitals rule (GHVFS-27): a mixed-case folder in the list is found (discover keys are lower case)
  wr(path.join(goh, 'mods', 'Cap_Mod', 'mod.info'), '{mod {name "Cap"}}\r\n');
  const capOpt = path.join(work, 'capprof', 'options.set'); wr(capOpt, '{options {mods "Cap_Mod:1"}}\r\n');
  const ec = await call('goh', 'GET', 'enabled', 'enabled?options=' + encodeURIComponent(capOpt));
  ok(ec.mods[0].installed === true && !codes(ec.warnings).includes('DOC_MOD_NOT_INSTALLED'), 'enabled goh: a mixed-case folder is found ' + codes(ec.warnings));
  ok(R.gohGate({ min: '9.0', max: '', tags: 'develop' }, '1.067').ok && !R.gohGate({ min: '1.070', max: '' }, '1.067').ok && R.gohGate({ min: '', max: '' }, '1.067').ok && !R.gohGate({ min: '', max: '1.050' }, '1.067').ok, 'gohGate: develop, Min, open bounds, Max');
  ok(R.gohBadName('my-mod') && R.gohBadName('as64+') && R.gohBadName('my mod') && !R.gohBadName('good_mod.v2'), 'gohBadName: GHVFS-27');

  // ---- modwhy
  let w = await call('mowas2', 'POST', 'modwhy', 'modwhy', { mod: path.join(game, 'mods', 'newmod'), target: 'mowas2' });
  ok(codes(w.reasons).includes('MOWAS2_NEW_MODE') && !codes(w.reasons).some(c => /AS64PLUS|WITH_PLUS/.test(c)), 'modwhy mowas2: new mode skipped, no as64+ reasons ' + codes(w.reasons));
  w = await call('as64', 'POST', 'modwhy', 'modwhy', { mod: path.join(game, 'mods', 'goodmod'), target: 'as64' });
  ok(!codes(w.reasons).includes('MOWAS2_NEW_MODE'), 'modwhy as64: no MoW:AS2 reason');
  await call('mowas2', 'POST', 'modwhy', 'modwhy', { mod: path.join(game, 'mods', 'goodmod'), target: 'mowas2', deep: true });
  ok(last('wouldload').args.join(' ').indexOf('--exe mowas2 --game') >= 0, 'modwhy mowas2 deep: wouldload --exe mowas2');
  w = await call('goh', 'POST', 'modwhy', 'modwhy', { mod: path.join(goh, 'mods', 'my-mod'), target: 'goh', deep: true });
  ok(codes(w.reasons).includes('GOH_BAD_NAME') && !codes(w.reasons).includes('CAPITALS') && w.target === 'goh', 'modwhy goh: folder name rule ' + codes(w.reasons));
  a = last('wouldload').args;
  ok(a.join(' ').indexOf('--exe goh --goh ' + goh) >= 0, 'modwhy goh deep: wouldload --exe goh --goh <GoH> ' + a.join(' '));
  ok(w.verdict && w.verdict.raw.indexOf('LOADS_STATIC') === 0, 'modwhy goh deep: VERDICT goh read ' + JSON.stringify(w.verdict));
  ok(last('modinfo').args.includes('--goh') && last('modinfo').args.includes(goh), 'modwhy goh: modinfo --goh --game <GoH>');
  w = await call('goh', 'POST', 'modwhy', 'modwhy', { mod: path.join(goh, 'mods', 'oldver'), target: 'goh' });
  ok(codes(w.reasons).includes('GOH_VERSION') && w.facts.some(f => f.k === 'Tags'), 'modwhy goh: version gate ' + codes(w.reasons));
  w = await call('goh', 'POST', 'modwhy', 'modwhy', { mod: path.join(goh, 'mods', 'good_mod'), target: 'goh' });
  ok(!w.reasons.some(r => r.level === 'stop') && w.facts.some(f => f.k === 'Enabled'), 'modwhy goh: good_mod has no stop and is enabled ' + JSON.stringify(w.reasons.map(r => r.code)));
  const out = path.join(work, 'outside', 'good_mod2'); wr(path.join(out, 'mod.info'), '{mod {name "x"}}\r\n');
  w = await call('goh', 'POST', 'modwhy', 'modwhy', { mod: out, target: 'goh' });
  const nim = w.reasons.find(r => r.code === 'NOT_IN_MODS');
  ok(nim && nim.level === 'warn' && /does not write into the Gates of Hell folder/.test(nim.fix.join(' ')), 'modwhy goh: outside mods is a warning, ARSENAL does not copy it in');

  // ---- unit chain
  const mod = path.join(work, 'umod');
  wr(path.join(mod, 'mod.info'), '{Mod {Name "U"}}\r\n');
  wr(path.join(mod, 'resource', 'entity', 'vehicle', 'tk1.def'), '{Extension "tk1.mdl"}\r\n');
  wr(path.join(mod, 'resource', 'entity', 'vehicle', 'tk1.mdl'), 'x');
  wr(path.join(mod, 'resource', 'set', 'multiplayer', 'units', 'vehicles_ger.set'), '{"tk1" ("vs" c(60) t(all) s(ger)) {cost 80}}\r\n');
  let u = await call('as64', 'POST', 'unit', 'unit', { mod, unit: 'tk1', target: 'as64' });
  ok(u.exe === 'as64', 'unit as64: vfs view as64 ' + u.exe);
  u = await call('mowas2', 'POST', 'unit', 'unit', { mod, unit: 'tk1', target: 'mowas2', deep: true });
  ok(u.exe === 'mowas_2', 'unit mowas2: vfs view mowas_2 (not the as64 view of the shared install) ' + u.exe);
  a = last('refcheck').args;
  ok(a.join(' ').indexOf('--exe mowas_2') >= 0 && /logs-unit-cache\.mowas2\.json$/.test(a[a.indexOf('--cache') + 1]), 'unit mowas2 deep: refcheck --exe mowas_2, own cache ' + a.join(' '));
  await call('as64', 'POST', 'unit', 'unit', { mod, unit: 'tk1', target: 'as64', deep: true });
  a = last('refcheck').args;
  ok(!a.includes('--exe') && /logs-unit-cache\.json$/.test(a[a.indexOf('--cache') + 1]), 'unit as64 deep: argument list and cache as before');
  // GoH: cards in subfolders, roster_*.set roots, {"name" ("template" ... side(x) ...)}, doctrine (GHGPL-05), no bot.data.lua
  const gm = path.join(work, 'gmod');
  wr(path.join(gm, 'mod.info'), '{mod {name "G"}}\r\n');
  wr(path.join(gm, 'resource', 'entity', '-vehicle', 'car', 'kbw', 'kbw.def'), '{game_entity\r\n\t{extension "kbw.mdl"}\r\n}\r\n');
  wr(path.join(gm, 'resource', 'entity', '-vehicle', 'car', 'kbw', 'kbw.mdl'), 'x');
  wr(path.join(gm, 'resource', 'entity', '-vehicle', 'car', 'kbw', 'kbw.mtl'), 'x');
  wr(path.join(gm, 'resource', 'set', 'multiplayer', 'units', 'roster_conquest.set'), ';sdl\r\n(include "conquest/units_ger.set")\r\n');
  wr(path.join(gm, 'resource', 'set', 'multiplayer', 'units', 'conquest', 'units_ger.set'), ';SDL\r\n; {"kbw" (commented out)}\r\n{"kbw"\r\n\t("vehicle"  period(mid) cd(0) ci(30) side(ger) t(vehicle) b(vehicles) doctrine(blitz) cw(1) cp(1)\r\n\tcost(55))\r\n}\r\n("squad_with3types_conquest" side(ger) period(mid) name(sq_kbw) c1(nco:1))\r\n');
  wr(path.join(gm, 'resource', 'interface', 'scene', 'unit_icon', 'kbw_00.tga'), 'x');
  wr(path.join(gm, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'kbw');
  u = await call('goh', 'POST', 'unit', 'unit', { mod: gm, unit: 'kbw', target: 'goh', deep: true });
  const st = Object.fromEntries(u.steps.map(s => [s.id, s]));
  ok(u.exe === 'goh' && u.game === goh, 'unit goh: vfs view goh on the GoH install ' + u.exe);
  ok(st.def.status === 'ok' && st.model.status === 'ok' && st.card.status === 'ok' && /army "ger", cost 55/.test(st.card.note), 'unit goh: def, model, card ' + JSON.stringify(Object.fromEntries(u.steps.map(s => [s.id, s.status + ' ' + s.note.slice(0, 50)]))));
  ok(st.army.status === 'ok' && st.icon.status === 'ok', 'unit goh: card reached from roster_conquest.set, icon found ' + st.army.note);
  ok(st.doctrine && /doctrine is "blitz"/.test(st.doctrine.note), 'unit goh: doctrine shown (GHGPL-05)');
  ok(st.bot && st.bot.status === 'note' && /GHMIS-66/.test(st.bot.note), 'unit goh: bot.data.lua has no effect on GoH');
  ok(st.refs && st.refs.status === 'note' && /not available for GoH/.test(st.refs.note) && last('refcheck').args.join(' ').indexOf('--exe goh') >= 0, 'unit goh deep: refcheck --exe goh, its refusal shown as a plain line');
  const sq = R.gohCard(fs.readFileSync(path.join(gm, 'resource', 'set', 'multiplayer', 'units', 'conquest', 'units_ger.set'), 'latin1'), 'sq_kbw', 'sq_kbw');
  // a deep check that runs out of time says so in one line (it was silent)
  const slow = Object.assign(mkCtx('goh'), { runTool: () => Promise.resolve({ code: null, stdout: '', stderr: '', timedOut: true }) });
  u = await routes['POST /api/x/logs/unit'](U('unit'), { mod: gm, unit: 'kbw', target: 'goh', deep: true }, slow);
  const rs = u.steps.find(s => s.id === 'refs');
  ok(rs && rs.status === 'note' && /did not finish/.test(rs.note) && u.deep.ran === false, 'unit deep: a timed-out reference check is shown as a note ' + JSON.stringify(rs));
  ok(sq && sq.how === 'squad' && sq.side === 'ger', 'gohCard: squad card name(x) side(x) ' + JSON.stringify(sq));
  const vh = R.gohCard('("squad_vehicle4" side(rus) vehicle(gaz) crew1(a:1))\r\n', 'gaz', 'gaz');
  ok(vh && vh.how === 'vehicle' && vh.side === 'rus', 'gohCard: vehicle of a squad card');
  ok(R.gohCard('; {"zz" ("vehicle" side(ger))}\r\n', 'zz', 'zz') === null, 'gohCard: a card in a comment does not count');

  // ---- client: the page sends its own game folder (curFolder: the GoH install under GoH) and its target
  {
    const FD = require('../units/fakedom'), KIT = require('../../test/blockcheck').kitSrc() + '\n';
    const canned = { enabled: { options: 'o', mods: [], warnings: [] }, modwhy: { facts: [], reasons: [] }, unit: { firstBroken: -1, steps: [{ id: 'doctrine', status: 'note', note: 'n' }] }, find: { instances: [] }, ticklist: { items: [] } };
    const P = FD.runPage('logs', KIT + X.script, X.lang, { route: u => canned[u.split('?')[0].split('/').pop()], S: { mod: 'm' }, env: { fmtBytes: n => n + ' B', gameDir: () => 'AS2DIR', curFolder: () => 'GOHDIR', curGame: () => ({ target: 'goh' }) } });
    const en = X.lang.en, btn = k => P.root.all(c => c.tagName === 'BUTTON' && c.textContent === en[k])[0], settle = async () => { for (let i = 0; i < 4; i++) await FD.settle(); };
    P.screen.focus(); await settle();
    btn('logs.btn.check').click(); await settle();
    btn('logs.btn.why').click(); await settle();
    P.root.all(c => c.tagName === 'INPUT' && c.getAttribute('aria-label') === en['logs.unit.ph'])[0].value = 'kbw'; btn('logs.btn.unit').click(); await settle();
    const s = n => P.sent.filter(x => x.url.indexOf('/logs/' + n) >= 0).pop() || {};
    ok(/game=GOHDIR/.test(s('enabled').url) && /target=goh/.test(s('enabled').url), 'client: enabled sends the GoH folder and target ' + s('enabled').url);
    ok(s('modwhy').body && s('modwhy').body.game === 'GOHDIR' && s('modwhy').body.target === 'goh', 'client: modwhy sends the GoH folder');
    ok(s('unit').body && s('unit').body.game === 'GOHDIR' && s('unit').body.target === 'goh', 'client: unit sends the GoH folder and target');
    ok(P.root.textContent.indexOf(en['logs.st.doctrine']) >= 0, 'client: the doctrine step has its name');
    ok(['en', 'ru', 'uk', 'zh'].every(l => ['logs.st.doctrine', 'logs.en.mode.as64only', 'logs.en.mode.goh-out'].every(k => X.lang[l][k])), 'lang: new keys in four languages');
  }
  console.log(bad ? bad + ' failures (games)' : 'logs games PASS');
  process.exit(bad ? 1 : 0);
})().catch(x => { console.log('FAIL ' + (x.stack || x)); process.exit(1); });
