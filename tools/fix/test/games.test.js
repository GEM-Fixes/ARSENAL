// fix test: the three games (game parity 2026-11-14). made-up fixtures in a temp dir, nothing of a real install.
//   MoW:AS2: --target mowas2 / --exe mowas_2 mounts with exe mowas_2 (no as64/core), staged without as64.exe; CLI checks of --exe/--target
//   GoH: mod.info range = GoH version (develop tag, commented lines, open bounds), folder name rule, .pot merge, --target goh plan on a fixture
// Author: Imperator_Aug (ARSENAL, ia-7c1f0e52)
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ctxm = require('../lib/ctx'), modinfo = require('../lib/modinfo'), lng = require('../lib/lng');
const FIX = path.join(__dirname, '..', 'fix.js');
let bad = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log('ASSERT ' + m); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'fixgames-'));
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const run = args => { const r = cp.spawnSync(process.execPath, [FIX, ...args], { encoding: 'utf8' }); return { rc: r.status, o: (r.stdout || '') + (r.stderr || '') }; };
const CL = '{Mod\r\n\t{Name "mm"}\r\n\t{Desc "d"}\r\n\t{MinGameVersion "3.262.0"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n';
try {
  // ---- AS2 folder shared by AS64 and MoW:AS2: as64.exe + mowas_2.exe, as64/core holds one file only the as64 view has
  const G = path.join(T, 'as2');
  put(path.join(G, 'as64.exe'), 'stub'); put(path.join(G, 'mowas_2.exe'), 'stub');
  put(path.join(G, 'resource', 'entity', 'base.def'), '{entity}\r\n');
  put(path.join(G, 'as64', 'core', 'resource', 'entity', 'core_only.def'), '{entity}\r\n');
  put(path.join(G, 'mods', 'mm', 'mod.info'), CL);
  put(path.join(G, 'mods', 'mm', 'resource', 'entity', 'm.def'), '{entity}\r\n');
  const OUTSIDE = path.join(T, 'elsewhere', 'mo'); put(path.join(OUTSIDE, 'mod.info'), CL.replace('"mm"', '"mo"'));
  const K = 'resource/entity/core_only.def';
  let c = ctxm.open(path.join(G, 'mods', 'mm'), G, {});
  try { ok(c.v && c.vb.files.has(K) && !c.exe, 'no exe: the as64 view (as64/core) as before'); ok(!c.note, 'no exe: no staging for a mod under mods: ' + c.note); } finally { c.cleanup(); }
  for (const exe of ['mowas_2', 'mowas2']) {
    c = ctxm.open(path.join(G, 'mods', 'mm'), G, { exe });
    try {
      ok(c.v && !c.vb.files.has(K) && c.vb.files.has('resource/entity/base.def'), exe + ': base without as64/core');
      ok(c.exe === 'mowas_2' && /MoW:AS2/.test(c.note), exe + ': staged note ' + c.note);
      ok(!fs.existsSync(path.join(c.game, 'as64.exe')) && fs.existsSync(path.join(c.game, 'mowas_2.exe')), exe + ': staged dir keeps mowas_2.exe, drops as64.exe');
      ok(c.v.files.has('resource/entity/m.def') && c.mineOf(c.v.files.get('resource/entity/m.def')), exe + ': mod mounted');
    } finally { c.cleanup(); }
    ok(!fs.existsSync(c.game), exe + ': staged dir removed');
  }
  c = ctxm.open(OUTSIDE, G, { exe: 'mowas_2' });
  try { ok(c.v && !c.vb.files.has(K), 'mowas_2, mod outside mods: base without as64/core'); } finally { c.cleanup(); }
  c = ctxm.open(path.join(G, 'mods', 'mm'), G, { exe: 'as64' });
  try { ok(c.v && c.vb.files.has(K) && !c.note, '--exe as64: the as64 view, no staging'); } finally { c.cleanup(); }
  ok(fs.existsSync(path.join(G, 'as64.exe')) && fs.readFileSync(path.join(G, 'mods', 'mm', 'mod.info'), 'latin1') === CL, 'fixture game untouched');

  // ---- CLI: game words
  let r = run([path.join(G, 'mods', 'mm'), 'plan', '--game', G, '--exe', 'mowas_2', '--target', 'as64']);
  ok(r.rc === 2 && /does not load on mowas_2\.exe/.test(r.o), 'mowas_2 + target as64 refused: ' + r.o.slice(0, 200));
  r = run([path.join(G, 'mods', 'mm'), 'plan', '--game', G, '--target', 'goh']);
  ok(r.rc === 2 && /is not a GoH install/.test(r.o), 'target goh on the AS2 folder refused: ' + r.o.slice(0, 200));
  {   // --target goh, no --game, no GoH install found: one plain line, never the AS2 fallback
    const env = Object.assign({}, process.env, { AS2_NO_STEAM: '1' }); delete env.GOH_GAME;
    const q = cp.spawnSync(process.execPath, [FIX, path.join(G, 'mods', 'mm'), 'plan', '--target', 'goh'], { encoding: 'utf8', env, cwd: T });
    const qo = (q.stdout || '') + (q.stderr || '');
    ok(q.status === 2 && /no GoH install found/.test(qo) && !/is not a GoH install/.test(qo), 'goh with no install: plain line, no AS2 fallback: ' + qo.slice(0, 200));
  }
  // exe reaches vfs.build: with staging off, only the exe option can drop as64/core from the base
  c = ctxm.open(path.join(G, 'mods', 'mm'), G, { exe: 'mowas_2', stage: false });
  try { ok(c.v && !c.vb.files.has(K) && c.vb.files.has('resource/entity/base.def'), 'mowas_2, stage off: exe handed to vfs (no as64/core)'); } finally { c.cleanup(); }
  // FIX_REFCHECK_FAILED names a required mod that cannot load on this game, not the mod's own range
  const gate = require('../lib/gate');
  let w = gate.refWhy({ id: 'b9' }, 'x jaben_as64 MOD_VERSION: mod "jaben_as64" unsupported on 3.262.1 (Min "3.301" Max ""); skipped', { min: '3.262.0' });
  ok(/requires "jaben_as64", which does not load on game version 3\.262\.1/.test(w) && !/fix that, then run fix again/.test(w), 'refWhy: dep named: ' + w);
  w = gate.refWhy({ id: 'b9' }, 'mod "b9" unsupported on 3.262.1 (Min "3.301" Max "")', { min: '3.262.0' });
  ok(/mod\.info version range is wrong/.test(w), 'refWhy: own range: ' + w);
  w = gate.refWhy({ id: 'b9' }, 'other', null);
  ok(/usually a mod\.info the game refuses/.test(w), 'refWhy: no fixedInfo as before');
  // wave 3: own mod named but the modinfo fixer found the range fine -> the gates disagree (GoH develop tag), not "a mod.info the game refuses"
  w = gate.refWhy({ id: 'robz', exe: 'goh', info: { tags: 'no_delete develop' } }, 'MOD_VERSION: mod "robz" unsupported on GoH 1.067 (Min "1.105" Max "1.400"); skipped', null);
  ok(/version gate refused this mod on 1\.067/.test(w) && /tag develop lets GoH load it at any version, GHVFS-02/.test(w) && !/usually a mod\.info the game refuses/.test(w), 'refWhy: GoH develop, own range fine: ' + w);
  w = gate.refWhy({ id: 'b9', exe: 'mowas_2', info: {} }, 'mod "b9" unsupported on 3.262.1 (Min "3.262.0" Max "3.262.1")', null);
  ok(/the two gates disagree/.test(w) && !/tag develop/.test(w), 'refWhy: own named, no fixedInfo, not GoH: ' + w);
  // every MOD_VERSION line is read, past 200 characters, and a blocked dep wins over the own-mod line
  const long = 'entityindex: ' + 'x'.repeat(250) + ' mod "b9" unsupported on 3.262.1 (Min "3.301" Max ""); mod "jaben_as64" unsupported on 3.262.1 (Min "3.301" Max "")';
  w = gate.refWhy({ id: 'b9' }, long, { min: '3.262.0' });
  ok(/requires "jaben_as64"/.test(w), 'refWhy: dep after the own line and past 200 chars: ' + w.slice(0, 120));
  const vl = gate.versionLines({ id: 'B9' }, long);
  ok(vl.all.length === 2 && vl.own && vl.own.id === 'b9' && vl.dep && vl.dep.id === 'jaben_as64', 'versionLines: ' + JSON.stringify(vl));
  {   // refcheck gets --exe when the fix names a game, none as before; errFull keeps the whole text
    const Cm = require('../../modmove/lib/common'), keep = Cm.runTool, seen = [];
    Cm.runTool = (t, a) => { seen.push(a); return { out: '', err: 'e'.repeat(300) }; };
    try {
      const r1 = gate.refcheck({ game: 'g', list: ['m'], exe: 'mowas_2' }, null, {}), r2 = gate.refcheck({ game: 'g', list: ['m'], exe: null }, null, {});
      ok(seen[0].join(' ').endsWith('--exe mowas_2') && !seen[1].includes('--exe'), 'refcheck --exe: ' + JSON.stringify(seen));
      ok(r1.err.length === 200 && r1.errFull.length === 300 && !r2.ok, 'refcheck errFull');
      Cm.runTool = () => ({ out: '', err: '', status: null, error: { code: 'ETIMEDOUT' } });
      const r3 = gate.refcheck({ game: 'g', list: ['m'] }, null, {}), w3 = gate.refWhy({ id: 'm' }, r3.errFull, null);
      ok(!r3.ok && r3.err === 'refcheck did not finish (ETIMEDOUT)' && /did not finish \(ETIMEDOUT\); rerun fix, or pass --cache/.test(w3) && !/mod\.info/.test(w3), 'refcheck killed: ' + w3);
      Cm.runTool = () => ({ out: '', err: '', status: 3 });
      ok(gate.refcheck({ game: 'g', list: ['m'] }, null, {}).err === 'refcheck did not finish (exit 3)', 'refcheck silent exit');
      // a crash after some output: exit 1, a node stack on stderr, no findings line -> did not finish, the Error: line quoted, mod.info not blamed
      Cm.runTool = () => ({ out: 'loading\n', err: 'C:\\x\\refcheck.js:12\n  foo.bar();\n      ^\n\nTypeError: Cannot read properties of undefined (reading \'bar\')\n    at Object.<anonymous> (C:\\x\\refcheck.js:12:7)\n', status: 1 });
      const r4 = gate.refcheck({ game: 'g', list: ['m'] }, null, {}), w4 = gate.refWhy({ id: 'm' }, r4.errFull, { min: '3.262.0' });
      ok(!r4.ok && /^refcheck did not finish \(TypeError: Cannot read properties of undefined reading 'bar'\)$/.test(r4.err), 'refcheck crash: ' + r4.err);
      ok(/the path checker did not finish \(TypeError: Cannot read/.test(w4) && !/mod\.info/.test(w4), 'refcheck crash: refWhy does not blame the mod.info: ' + w4);
      // killed by a signal after some output (runTool may pass r.signal; status null without it)
      Cm.runTool = () => ({ out: 'part\n', err: '', status: null, signal: 'SIGTERM' });
      ok(gate.refcheck({ game: 'g', list: ['m'] }, null, {}).err === 'refcheck did not finish (signal SIGTERM)', 'refcheck signal');
      Cm.runTool = () => ({ out: 'part\n', err: '', status: null });
      ok(gate.refcheck({ game: 'g', list: ['m'] }, null, {}).err === 'refcheck did not finish (killed)', 'refcheck status null, no signal field');
      // refcheck's own refusal (exit 3, named mod(s) + MOD_VERSION) still reaches refWhy whole
      const refuse = 'entityindex: named mod(s) did not mount, refusing to index vanilla instead:\n  b9\n    MOD_VERSION: mod "b9" unsupported on 3.262.1 (Min "3.301" Max "")\nrefcheck: the game skips the mod for its mod.info version range\n';
      Cm.runTool = () => ({ out: '', err: refuse, status: 3 });
      const r5 = gate.refcheck({ game: 'g', list: ['b9'] }, null, {});
      ok(!r5.ok && r5.errFull === refuse && /mod\.info version range is wrong/.test(gate.refWhy({ id: 'b9' }, r5.errFull, { min: '3.262.0' })), 'refcheck own refusal: refWhy path as before: ' + r5.err.slice(0, 80));
      // gate.run: the reason is not doubled ('refcheck did not finish: refcheck did not finish (...)')
      Cm.runTool = () => ({ out: '', err: '', status: null, error: { code: 'ETIMEDOUT' } });
      const gk = 'resource/entity/m.def', gout = path.join(T, 'gateout');
      put(path.join(gout, gk), '{entity}\r\n');
      const gb = gate.run({ game: G, list: ['mm'], id: 'mm' }, [{ key: gk, before: '{entity}\r\n', after: '{entity}\r\n', lines: new Set() }], gout, { lintBefore: [], refBefore: { ok: true, list: [] } });
      ok(gb.get(gk) === 'refcheck did not finish (ETIMEDOUT)', 'gate.run reason once: ' + gb.get(gk));
      Cm.runTool = () => ({ out: '', err: 'other text', status: 3 });
      const gb2 = gate.run({ game: G, list: ['mm'], id: 'mm' }, [{ key: gk, before: '{entity}\r\n', after: '{entity}\r\n', lines: new Set() }], gout, { lintBefore: [], refBefore: { ok: true, list: [] } });
      ok(gb2.get(gk) === 'refcheck did not finish (other text)', 'gate.run: failed exit with no refusal line: ' + gb2.get(gk));
    } finally { Cm.runTool = keep; }
  }
  r = run([path.join(G, 'mods', 'mm'), 'plan', '--game', G, '--exe', 'goh', '--target', 'classic']);
  ok(r.rc === 2 && /--exe goh takes --target goh/.test(r.o), 'exe goh + classic refused');
  r = run([path.join(G, 'mods', 'mm'), 'plan', '--game', G, '--exe', 'nope']);
  ok(r.rc === 2 && /--exe: as64, mowas_2/.test(r.o), 'bad --exe refused');
  r = run(['--help']);
  ok(r.rc === 0 && /--target as64\|classic\|mowas2\|goh/.test(r.o) && /--exe as64\|mowas_2\|mowas2\|goh/.test(r.o), 'usage lists the games');
  r = run([path.join(G, 'mods', 'mm'), 'plan', '--game', G, '--target', 'mowas2', '--only', 'modinfo']);
  ok(r.rc === 0 && /MoW:AS2/.test(r.o) && /mod\.info version range already fits/.test(r.o) && /without as64\.exe/.test(r.o), 'target mowas2 plan: ' + r.o.split('\n').slice(0, 4).join(' | '));
  r = run([path.join(G, 'mods', 'mm'), 'plan', '--game', G, '--only', 'modinfo']);
  ok(r.rc === 0 && !/MoW:AS2|GoH/.test(r.o.split('\n')[0]) && !/NOTE:/.test(r.o), 'no game named: as before: ' + r.o.split('\n')[0]);
  {   // MoW:AS2: a mod with an as64 range that requires an as64-only mod: mod.info.fixed is written, and the line says the dep still blocks it
    put(path.join(G, 'mods', 'dep64', 'mod.info'), '{Mod\r\n\t{Name "dep64"}\r\n\t{MinGameVersion "3.301"}\r\n}\r\n');
    put(path.join(G, 'mods', 'dep64', 'resource', 'entity', 'd.def'), '{entity}\r\n');
    put(path.join(G, 'mods', 'needs64', 'mod.info'), '{Mod\r\n\t{Name "needs64"}\r\n\t{MinGameVersion "3.301"}\r\n\t{Require "dep64"}\r\n}\r\n');
    put(path.join(G, 'mods', 'needs64', 'resource', 'entity', 'n.def'), '{entity}\r\n');
    r = run([path.join(G, 'mods', 'needs64'), 'plan', '--game', G, '--target', 'mowas2', '--only', 'modinfo,repoint']);
    const ml = r.o.split('\n').find(l => /^modinfo:/.test(l)) || '';
    ok(/MinGameVersion "3\.301" does not fit/.test(ml) && /NOTE: the required mod "dep64" does not load on/.test(ml) && /FIX_MODINFO_DEP_BLOCKED/.test(r.o) && /requires "dep64"/.test(r.o), 'mowas2 dep blocked: ' + ml + ' || ' + r.o.split('\n').filter(l => /REFCHECK|DEP_BLOCKED/.test(l)).join(' | ').slice(0, 400));
    fs.rmSync(path.join(G, 'mods', 'dep64'), { recursive: true }); fs.rmSync(path.join(G, 'mods', 'needs64'), { recursive: true });
  }

  // ---- GoH mod.info rule (unit)
  const TPL = '; comment\r\n{mod\r\n\t{name "Template"}\r\n\t;{tags "develop"}\r\n\t; {maxGameVersion "9.9"}\r\n\t{minGameVersion "1.500"}\r\n\t{maxGameVersion "1.510"}\r\n}\r\n';
  const mk = (name, text) => { const d = path.join(T, 'mi', name); put(path.join(d, 'mod.info'), text); return d; };
  let p = modinfo.plan(mk('tpl', TPL), 'goh', { version: '1.067' });
  const a = p.edits[0] && p.edits[0].after.toString('latin1');
  ok(a && /\t\{minGameVersion "1\.067"\}\r\n\t\{maxGameVersion "1\.067"\}\r\n/.test(a) && a.includes(';{tags "develop"}') && a.includes('; {maxGameVersion "9.9"}'), 'goh: 1.500-1.510 set to 1.067, comments untouched: ' + JSON.stringify(a));
  ok(p.edits[0] && p.edits[0].info.min === '1.067' && p.edits[0].info.max === '1.067', 'goh: info range');
  ok(!modinfo.plan(mk('dev', TPL.replace(';{tags', '{tags')), 'goh', { version: '1.067' }).edits.length, 'goh: tag develop = any version');
  ok(!modinfo.plan(mk('open', '{mod\r\n\t{name "x"}\r\n}\r\n'), 'goh', { version: '1.067' }).edits.length, 'goh: no bounds = open (GHVFS-26)');
  ok(!modinfo.plan(mk('minonly', '{mod\r\n\t{minGameVersion "1.060"}\r\n}\r\n'), 'goh', { version: '1.067' }).edits.length, 'goh: Min below, no Max = fits');
  p = modinfo.plan(mk('as2', CL), 'goh', { version: '1.067' });
  ok(p.edits.length && /MinGameVersion "3\.262\.0" does not fit GoH 1\.067/.test(p.edits[0].why.join()), 'goh: an AS2 range is rewritten');
  p = modinfo.plan(mk('nover', CL), 'goh', {});
  ok(!p.edits.length && p.cant[0] && p.cant[0].code === 'FIX_MODINFO_GOH_VERSION', 'goh: no version -> refusal');
  ok(!modinfo.plan(mk('cl', CL), 'mowas2').edits.length && modinfo.plan(mk('cl2', CL), 'as64').edits.length === 1, 'as2 targets as before');
  ok(modinfo.folderOk('my_mod.v2') === null && /a space/.test(modinfo.folderOk('my mod')) && /"-"/.test(modinfo.folderOk('my-mod')) && /"\+"/.test(modinfo.folderOk('as64+')), 'GoH folder name rule');

  // ---- .pot merge (unit)
  const H = '#, fuzzy\r\nmsgid ""\r\nmsgstr ""\r\n"Language: en\\n"\r\n';
  const base = Buffer.from(H + '\r\nmsgctxt "a"\r\nmsgid "A"\r\nmsgstr ""\r\n\r\n#. note\r\nmsgctxt "b"\r\nmsgid "B"\r\nmsgstr ""\r\n\r\nmsgctxt "C"\r\nmsgid "C"\r\nmsgstr ""\r\n');
  const mod = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(H + '\r\nmsgctxt "a"\r\nmsgid "Mine"\r\nmsgstr ""\r\n')]);
  const m = lng.mergePot(mod, base), mt = m.buf && m.buf.toString('utf8');
  ok(m.added === 2 && m.buf[0] === 0xEF && mt.includes('msgid "Mine"') && !mt.includes('msgid "A"') && mt.includes('#. note\r\nmsgctxt "b"') && mt.includes('msgctxt "C"') && !/[^\r]\n/.test(mt), 'pot merge: ' + JSON.stringify(mt));
  ok(lng.check({ kind: 'lng', pot: true, before: mod, after: m.buf, base }) === null, 'pot gate passes');
  ok(/vanilla key b still missing/.test(lng.check({ kind: 'lng', pot: true, before: mod, after: mod, base }) || ''), 'pot gate catches a missing key');
  ok(lng.mergePot(m.buf, base).same, 'pot merge twice: nothing left');

  // ---- GoH fixture install (stub exe: version from --game-version)
  const GH = path.join(T, 'goh');
  put(path.join(GH, 'binaries', 'x64', 'call_to_arms.exe'), 'stub');
  put(path.join(GH, 'resource', 'entity', 'g.def'), '{entity}\r\n');
  put(path.join(GH, 'localizations', 'default', 'interface', 'text', 'main.pot'), base);
  const gm = path.join(GH, 'mods', 'gm');
  put(path.join(gm, 'mod.info'), TPL);
  put(path.join(gm, 'localizations', 'default', 'interface', 'text', 'main.pot'), mod);
  c = ctxm.open(gm, GH, { exe: 'goh' });
  try {
    ok(c.v && c.exe === 'goh' && c.vb.files.has('resource/interface/text/main.pot'), 'goh ctx: mounted, base .pot at resource/interface/text: ' + c.reason);
    const lp = lng.plan(c);
    ok(lp.edits.length === 1 && lp.edits[0].out === 'localizations/default/interface/text/main.pot' && lp.edits[0].added === 2, 'goh lng plan: ' + JSON.stringify(lp.edits.map(e => [e.out, e.added])) + JSON.stringify(lp.cant));
  } finally { c.cleanup(); }
  {   // GoH sound repoint: the value is below sound/weapon/shot/ (fireSound) or sound/weapon/reload/ (reloadSound), a folder ends in "/"; outside it: refused
    put(path.join(GH, 'resource', 'sound', 'weapon', 'shot', 'new', 'old_gun', 'a.wav'), 'RIFF');
    put(path.join(GH, 'resource', 'sound', 'other', 'rl', 'b.wav'), 'RIFF');
    const rp = path.join(GH, 'mods', 'rp'); put(path.join(rp, 'mod.info'), TPL.replace(';{tags', '{tags'));
    put(path.join(rp, 'resource', 'set', 'stuff', 'w.set'), '{gun\r\n\t{fireSound "old_gun/"}\r\n\t{reloadSound "rl/"}\r\n}\r\n');
    const cr = ctxm.open(rp, GH, { exe: 'goh' });
    try {
      const F = [{ file: 'resource/set/stuff/w.set', line: 2, code: 'REF_SOUND_MISSING', msg: 'fireSound "old_gun/": no .wav file' }, { file: 'resource/set/stuff/w.set', line: 3, code: 'REF_SOUND_MISSING', msg: 'reloadSound "rl/": no .wav file' }];
      const p = require('../lib/edits').repoint(cr, F), a = p.edits[0] && p.edits[0].after.toString('latin1');
      ok(a === '{gun\r\n\t{fireSound "new/old_gun/"}\r\n\t{reloadSound "rl/"}\r\n}\r\n' && p.cant.length === 1 && /outside resource\/sound\/weapon\/reload/.test(p.cant[0].msg), 'goh sound repoint: ' + JSON.stringify(a) + JSON.stringify(p.cant));
    } finally { cr.cleanup(); }
  }
  const OUT = path.join(T, 'outs', 'gm_fix');
  r = run([gm, 'apply', '--game', GH, '--target', 'goh', '--game-version', '1.067', '--only', 'modinfo,lng', '--out', OUT]);
  ok(r.rc === 0 && fs.existsSync(path.join(OUT, 'localizations', 'default', 'interface', 'text', 'main.pot')) && fs.existsSync(path.join(OUT, 'mod.info.fixed')), 'goh apply: patch files: ' + r.o.split('\n').filter(l => /CHANGED|FIX_|VERDICT|lng:|modinfo/.test(l)).join(' | '));
  const pmi = fs.existsSync(path.join(OUT, 'mod.info')) ? fs.readFileSync(path.join(OUT, 'mod.info'), 'latin1') : '';
  ok(/MinGameVersion "1\.067"/.test(pmi) && /MaxGameVersion "1\.067"/.test(pmi) && /Require "gm"/.test(pmi) && /mod\.info: GoH range/.test(r.o), 'goh patch mod.info: ' + JSON.stringify(pmi));
  ok(fs.readFileSync(path.join(gm, 'mod.info'), 'latin1') === TPL, 'goh source untouched');
  {   // GoH apply goes through lib/modwrite: restore point per file first (beside an --out outside a game: <out>.arsenal-undo), marker, writes
    const pts = d => { try { return fs.readdirSync(d).map(id => JSON.parse(fs.readFileSync(path.join(d, id, 'restore-point.json'), 'utf8'))); } catch (e) { return []; } };
    let p = pts(OUT + '.arsenal-undo');
    ok(p.length === 3 && p.every(x => !x.existed) && p.some(x => x.rel === 'mod.info') && /restore points: 3 in /.test(r.o) && fs.existsSync(path.join(OUT, '.arsenal-made')), 'goh apply: 3 restore points (new files), marker: ' + JSON.stringify(p.map(x => x.rel)));
    const IN = path.join(GH, 'mods', 'gm_fix2'), J = path.join(T, 'r.json');
    r = run([gm, 'apply', '--game', GH, '--target', 'goh', '--game-version', '1.067', '--only', 'modinfo,lng', '--out', IN]);
    ok(r.rc === 0 && fs.existsSync(path.join(IN, '.arsenal-made')) && pts(path.join(IN, '.arsenal', 'undo')).length === 3 && !fs.existsSync(IN + '.arsenal-undo'), 'goh apply into <GoH>/mods/<new>: points inside the patch, no folder beside it: ' + r.o.split('\n').filter(l => /restore|REFUSED/.test(l)).join(' | '));
    r = run([gm, 'apply', '--game', GH, '--target', 'goh', '--game-version', '1.067', '--only', 'modinfo', '--out', IN, '--json', J]);   // rerun: the marker lets it in; main.pot of the last run removed
    p = pts(path.join(IN, '.arsenal', 'undo'));
    const R = fs.existsSync(J) ? JSON.parse(fs.readFileSync(J, 'utf8')) : {};
    ok(r.rc === 0 && !fs.existsSync(path.join(IN, 'localizations', 'default', 'interface', 'text', 'main.pot')) && p.length === 6 && p.filter(x => x.existed).length === 3 && R.restore && R.restore.n === 3 && R.restore.removed === 1, 'goh rerun: points of the replaced and removed files first: ' + JSON.stringify(R.restore) + ' ' + r.o.split('\n').filter(l => /restore|REFUSED/.test(l)).join(' | '));
    const q = p.find(x => x.existed && /main\.pot$/.test(x.rel));
    ok(q && fs.existsSync(path.join(IN, '.arsenal', 'undo', q.id, 'files', ...q.rel.split('/'))), 'goh rerun: the removed file is kept in its restore point');
    r = run([gm, 'plan', '--game', GH, '--game-version', '1.067', '--json', J]);
    ok((JSON.parse(fs.readFileSync(J, 'utf8')).gohSkipped || []).some(x => x.kind === 'botkeys' && /GHMIS-66/.test(x.why)) && !(JSON.parse(fs.readFileSync(J, 'utf8')).gohSkipped || []).some(x => /^(enc|lngdup|syntax)$/.test(x.kind)), 'goh plan json: gohSkipped with reasons, enc / lngdup / syntax run');
    // asread on GoH (GOH_PART): the stray ")" and a repeat of the same text are removed; a repeat with another value is left (which copy GoH keeps is not proven)
    const pm = path.join(GH, 'mods', 'pm'); put(path.join(pm, 'mod.info'), TPL.replace(';{tags', '{tags'));   // tag develop: mounts on any version
    put(path.join(pm, 'resource', 'set', 'pm_own.set'), '{root\r\n\t{a 1}\r\n\t{a 2}\r\n}\r\n)\r\n');
    r = run([pm, 'plan', '--game', GH, '--target', 'goh', '--game-version', '1.067', '--only', 'asread', '--json', J]);
    const A = fs.existsSync(J) ? JSON.parse(fs.readFileSync(J, 'utf8')) : {}, ch = (A.changed || []).find(x => /pm_own\.set$/.test(x.file));
    ok(ch && (ch.targets || []).length === 1 && /PAREN_STRAY/.test(ch.targets[0].code) && !/KEY_REPEAT/.test(ch.detail) && (A.gohPart || []).some(x => x.kind === 'asread') && /asread: on GoH KEY_REPEAT only where both copies are the same/.test(r.o), 'goh asread: stray ")" only: ' + JSON.stringify(A.changed) + ' ' + r.o.split('\n').filter(l => /asread|FIX_/.test(l)).join(' | '));
  }
  {
    // GoH syntax: a bare diffuse is quoted; {tags "a" "b"} is left (GoH reads each string as a tag). GoH lngdup: the LATER copy is removed (first wins)
    const sm = path.join(GH, 'mods', 'sm'); put(path.join(sm, 'mod.info'), TPL.replace(';{tags', '{tags'));
    put(path.join(sm, 'resource', 'entity', 'sx', 'sx.mtl'), '{material "bump"\r\n\t{diffuse sx_tex}\r\n}\r\n');
    put(path.join(sm, 'resource', 'entity', 'sx', 'sx.def'), '{game_entity\r\n\t{tags "a" "b"}\r\n}\r\n');
    put(path.join(sm, 'localizations', 'default', 'interface', 'text', 'sm.lng'), '{tags\r\n\t{"k1" "first"}\r\n\t{"k2" "two"}\r\n\t{"k1" "second"}\r\n}\r\n');
    const SO = path.join(GH, 'mods', 'sm_fix');
    r = run([sm, 'apply', '--game', GH, '--target', 'goh', '--game-version', '1.067', '--only', 'syntax,lngdup', '--out', SO]);
    const mt = path.join(SO, 'resource', 'entity', 'sx', 'sx.mtl'), lf = path.join(SO, 'localizations', 'default', 'interface', 'text', 'sm.lng');
    ok(fs.existsSync(mt) && fs.readFileSync(mt, 'latin1') === '{material "bump"\r\n\t{diffuse "sx_tex"}\r\n}\r\n' && !fs.existsSync(path.join(SO, 'resource', 'entity', 'sx', 'sx.def')), 'goh syntax: diffuse quoted, tags left: ' + r.o.split('\n').filter(l => /syntax|FIX_/.test(l)).join(' | '));
    ok(fs.existsSync(lf) && fs.readFileSync(lf, 'utf8') === '{tags\r\n\t{"k1" "first"}\r\n\t{"k2" "two"}\r\n}\r\n', 'goh lngdup: the later copy removed, first kept: ' + (fs.existsSync(lf) ? JSON.stringify(fs.readFileSync(lf, 'utf8')) : r.o.split('\n').filter(l => /lngdup|FIX_/.test(l)).join(' | ')));
  }
  {   // KEY_REPEAT rule on GoH: the same text is emptied, another value is left
    const KR = require('../lib/textfix').RULES.KEY_REPEAT, w1 = ['{root', '\t{a 1}', '\t{a 2}', '}'], w2 = ['{root', '\t{a 1}', '\t{a  1}', '}'];
    const r1 = KR.fix({ k: 'a' }, w1[2], { key: 'x.set', line: 3, work: w1, goh: true }), r2 = KR.fix({ k: 'a' }, w2[2], { key: 'x.set', line: 3, work: w2, goh: true });
    const r3 = KR.fix({ k: 'a' }, w1[2], { key: 'x.set', line: 3, work: w1, goh: false });
    ok(r1.no === 'ambiguous' && /which copy GoH keeps/.test(r1.msg) && r2.blank && r2.blank[0] === 2 && r3.blank && r3.blank[0] === 2, 'KEY_REPEAT on GoH: same text emptied, other value left; AS2 as before: ' + JSON.stringify([r1, r2, r3]));
  }
  r = run([gm, 'plan', '--game', GH, '--game-version', '1.067']);   // the GoH folder alone names the game; default fixers
  ok(/\(game .*GoH\)/.test(r.o) && !/enc: not run for GoH/.test(r.o) && /botkeys: not run for GoH: GoH has no bot\.data\.lua \(GHMIS-66\)/.test(r.o) && !/lngdup: not run for GoH/.test(r.o) && /stubmtl: not run for GoH/.test(r.o) && /syntax: on GoH only MTL_DIFFUSE_BARE/.test(r.o) && !/quarantine: not run/.test(r.o), 'goh plan from the folder: skip lines: ' + r.o.split('\n').filter(l => /not run|game/.test(l)).join(' | '));
  const bm = path.join(GH, 'mods', 'g-m'); put(path.join(bm, 'mod.info'), TPL);
  r = run([bm, 'plan', '--exe', 'goh', '--game', GH, '--game-version', '1.067', '--only', 'modinfo']);
  ok(/FIX_GOH_FOLDER_NAME/.test(r.o) && /GHVFS-27/.test(r.o), 'goh folder name finding: ' + r.o.split('\n').filter(l => /FOLDER/.test(l)).join(' | '));
  r = run([gm, 'apply', '--exe', 'goh', '--game', GH, '--game-version', '1.067', '--only', 'modinfo', '--out', path.join(T, 'outs', 'gm-fix')]);
  ok(r.rc === 2 && /FIX_OUT_REFUSED .*patch folder name "gm-fix"/.test(r.o) && !fs.existsSync(path.join(T, 'outs', 'gm-fix')), '--out with a bad GoH name refused: ' + r.o.split('\n').filter(l => /REFUSED/.test(l)).join(' | '));
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log(bad ? `games: ${bad} of ${n} failed` : `games: all ${n} held`);
process.exitCode = bad ? 1 : 0;
