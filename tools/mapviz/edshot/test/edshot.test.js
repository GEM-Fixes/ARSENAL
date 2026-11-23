// edshot test (MV-EDC): preflight refusals with an injected process list, the stat walker on a tree with links and a
// cycle, the change check, the move-out of a run's files (fake installs only), picture import, the CLI in process
// ('shot' and 'calibrate' not built) and a source scan (the process list only through lib/platform; no other process
// call; no uidrive, modswitch, edrun, as2 play). Each run works in a fresh folder inside the scratch dir.
// Runs nothing outside this process and moves only files it made under its scratch dir. Real installs: preflight only.
// usage: node tools/mapviz/edshot/test/edshot.test.js [scratch dir]
// Author: Imperator_Aug (ARSENAL, ia-23bd487f)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

// a fresh folder inside the scratch dir every run, so a second run with the same scratch dir starts clean
const BASE = path.resolve(process.argv[2] || os.tmpdir());
fs.mkdirSync(BASE, { recursive: true });
const W = fs.mkdtempSync(path.join(BASE, 'mapviz-edshot-'));
process.env.ARSENAL_CACHE = path.join(W, 'cache');
process.on('uncaughtException', e => {
  console.log('FAIL mapviz edshot: unexpected ' + (e && e.code ? e.code + ' ' : '') + (e && e.message ? e.message : String(e)));
  if (process.env.MAPVIZ_DEBUG && e && e.stack) console.log(e.stack);
  process.exit(1);
});

const DIR = path.resolve(__dirname, '..');
const ed = require(path.join(DIR, 'index.js'));
const cli = require(path.join(DIR, 'edshot.js'));
const png = require(path.join(DIR, '..', 'lib', 'raster', 'png.js'));
const gridfile = require(path.join(DIR, '..', 'lib', 'raster', 'gridfile.js'));

let pass = 0, fail = 0;
function ok(c, what) { if (c) pass++; else { fail++; console.log('FAIL mapviz edshot: ' + what); } }
function throwsCode(fn, code, what) {
  try { fn(); ok(false, what + ' (no throw)'); return null; } catch (e) { ok(e.code === code, what + ' (got ' + e.code + ': ' + e.message + ')'); return e; }
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function put(f, data) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; }
const has = f => { try { fs.lstatSync(f); return true; } catch (e) { return false; } };
const row = (name, pid) => '"' + name + '","' + (pid || 4242) + '","Console","1","12,345 K"';
const procs = (...names) => ({ tasklist: () => names.map((n, i) => row(n, 100 + i)).join('\r\n') + '\r\n' });
const NONE = procs();
const SAFE_ENV = { env: {} };

// ---- fake installs (scratch only) ----
const STEAM = path.join(W, 'steam'), AS64 = path.join(W, 'as64build'), GOH = path.join(W, 'goh'), PROF = path.join(W, 'profile');
put(path.join(STEAM, 'mowas_2.exe'), ''); put(path.join(STEAM, 'mowas_2_ed.exe'), '');
put(path.join(STEAM, 'resource', 'map.pak'), 'PK-fake');
put(path.join(STEAM, 'resource', 'set', 'a.set'), '{a}\r\n');
put(path.join(STEAM, 'mods', 'm1', 'file.txt'), 'abcdef');
put(path.join(AS64, 'as64_ed.exe'), ''); put(path.join(AS64, 'as64.exe'), '');
put(path.join(GOH, 'binaries', 'x64', 'call_to_arms_ed.exe'), ''); put(path.join(GOH, 'resource', 'x.pak'), 'PK');
put(path.join(PROF, 'log', 'game.log'), 'old log');
put(path.join(PROF, 'profiles', '123', 'options.set'), '{mods}');
put(path.join(PROF, 'profiles', '123', 'editor_desktop.set'), '{d}');
put(path.join(PROF, 'shader_cache', 's.bin'), 'x');
let links = true;
for (const n of ['resource', 'mods']) {
  try { fs.symlinkSync(path.join(STEAM, n), path.join(AS64, n), 'junction'); } catch (e) { links = false; console.log('skip directory links: ' + (e.code || e.message)); }
}

// ---- 1. preflight refusals ----
{
  const r = ed.preflight({ exe: 'as64_ed', root: AS64, instance: 1 }, Object.assign({}, NONE, SAFE_ENV));
  ok(r.ok && r.refuse.length === 0, 'as64_ed instance 1, nothing running: ok (' + r.refuse + ')');
  ok(ed.RUN_FILES.every(n => r.absent[n] === true), 'every run file recorded absent');
  ok(r.v === 1 && typeof r.at === 'number' && Array.isArray(r.seen) && r.seen.includes('as64_ed.exe'), 'record has v, at and the names seen');
  ok(!r.notes.some(n => n.code === 'EDSHOT_EXE_ABSENT'), 'the editor exe is found');
}
for (const inst of [0, undefined, 1.5, -2]) {
  const r = ed.preflight({ exe: 'as64_ed', root: AS64, instance: inst }, Object.assign({}, NONE, SAFE_ENV));
  ok(!r.ok && r.refuse.includes('EDSHOT_INSTANCE0'), 'as64_ed instance ' + inst + ': EDSHOT_INSTANCE0');
}
{
  const r = ed.preflight({ exe: 'mowas_2_ed', root: STEAM }, Object.assign({}, NONE, SAFE_ENV));
  ok(r.ok, 'mowas_2_ed needs no instance');
  const r2 = ed.preflight({ exe: 'mowas_2_ed', root: STEAM, instance: 3 }, Object.assign({}, NONE, SAFE_ENV));
  ok(r2.ok && r2.notes.some(n => n.code === 'EDSHOT_NO_INSTANCE'), 'mowas_2_ed with an instance: a note, no refusal');
}
const TABLE = [
  ['as64_ed', AS64, ['as64.exe', 'as64_ed.exe', 'mowas_2_ed.exe', 'call_to_arms_ed.exe'], ['mowas_2.exe', 'call_to_arms.exe', 'explorer.exe']],
  ['mowas_2_ed', STEAM, ['mowas_2.exe', 'mowas_2_ed.exe', 'as64.exe', 'as64_ed.exe', 'call_to_arms_ed.exe'], ['call_to_arms.exe', 'steam.exe']],
  ['goh_ed', GOH, ['call_to_arms.exe', 'call_to_arms_ed.exe', 'call_to_arms_server.exe', 'as64_ed.exe', 'mowas_2_ed.exe'], ['mowas_2.exe', 'as64.exe']],
];
for (const [exe, root, blocks, free] of TABLE) {
  for (const b of blocks) {
    const r = ed.preflight({ exe, root, instance: 2 }, Object.assign({}, procs('svchost.exe', b.toUpperCase()), SAFE_ENV));
    ok(!r.ok && r.refuse.includes('EDSHOT_RUNNING') && r.running.includes(b), exe + ' refused while ' + b + ' runs');
  }
  const r = ed.preflight({ exe, root, instance: 2 }, Object.assign({}, procs(...free), SAFE_ENV));
  ok(r.ok, exe + ' not refused by ' + free.join(', ') + ' (' + r.refuse + ')');
}
{
  const r = ed.preflight({ exe: 'goh_ed', root: GOH }, { tasklist: () => null, env: {} });
  ok(!r.ok && r.refuse.includes('EDSHOT_RUNNING') && r.notes.some(n => n.code === 'EDSHOT_NO_PROCESS_LIST'), 'no process list: refused (fail closed)');
  const r2 = ed.preflight({ exe: 'goh_ed', root: GOH }, { tasklist: () => 'INFO: garbage line\r\n', env: {} });
  ok(r2.ok, 'a list with no rows of interest: ok');
}
{
  // the real call goes through tools/lib/platform processList; its runner seam (spawn) stands in for tasklist here
  const calls = [];
  const runner = res => (file, args, o) => { calls.push({ file, args, o }); if (res instanceof Error) throw res; return res; };
  const closed = (res, what) => {
    const r = ed.preflight({ exe: 'mowas_2_ed', root: STEAM }, { spawn: runner(res), env: {} });
    ok(!r.ok && r.refuse.includes('EDSHOT_RUNNING') && r.notes.some(n => n.code === 'EDSHOT_NO_PROCESS_LIST'), what + ': refused (fail closed) (' + r.refuse + ')');
  };
  closed(new Error('tasklist failed'), 'the process list call throws (seeded)');
  closed({ status: 1, stdout: '' }, 'tasklist exits 1');
  closed({ status: 0, stdout: '' }, 'tasklist prints no rows');
  closed({ status: null, signal: 'SIGTERM', stdout: row('x.exe') }, 'tasklist killed by its time limit');
  ok(ed.processList({ spawn: runner(new Error('x')) }) === null, 'processList: null when the call fails');
  const r = ed.preflight({ exe: 'mowas_2_ed', root: STEAM }, { spawn: runner({ status: 0, stdout: row('svchost.exe') + '\r\n' + row('MoWAS_2.exe') + '\r\n' }), env: {} });
  ok(!r.ok && r.running.join() === 'mowas_2.exe', 'a list from the runner is read (' + r.running + ')');
  const last = calls[calls.length - 1];
  if (process.platform === 'win32') ok(last && last.file === 'tasklist' && last.args.join(' ').toLowerCase() === '/fo csv /nh' && last.o && last.o.shell === false, 'the call is tasklist /fo csv /nh, no shell');
}
for (const n of ed.RUN_FILES) {
  const f = put(path.join(AS64, n), 'x');
  const r = ed.preflight({ exe: 'as64_ed', root: AS64, instance: 1 }, Object.assign({}, NONE, SAFE_ENV));
  ok(!r.ok && r.refuse.includes('EDSHOT_FILE_PRESENT') && r.absent[n] === false && ed.RUN_FILES.filter(m => m !== n).every(m => r.absent[m]), n + ' present: EDSHOT_FILE_PRESENT, only it marked present');
  fs.unlinkSync(f);
}
{
  const pf = path.join(W, 'pf'), root = path.join(pf, 'Game');
  put(path.join(root, 'mowas_2_ed.exe'), '');
  const before = fs.readdirSync(root).sort().join('|');
  const r = ed.preflight({ exe: 'mowas_2_ed', root }, Object.assign({}, NONE, { env: { ProgramFiles: pf } }));
  ok(!r.ok && r.refuse.includes('EDSHOT_NOT_WRITABLE'), 'folder under Program Files: EDSHOT_NOT_WRITABLE');
  ok(fs.readdirSync(root).sort().join('|') === before, 'the writable check made no file');
  const r2 = ed.preflight({ exe: 'mowas_2_ed', root, instance: 0 }, Object.assign({}, procs('mowas_2.exe'), { env: { ProgramFiles: pf } }));
  ok(['EDSHOT_RUNNING', 'EDSHOT_NOT_WRITABLE'].every(c => r2.refuse.includes(c)), 'several refusals are all listed');
  // the default Steam library sits under Program Files (x86): a note, not a refusal
  const pf86 = path.join(W, 'pf86'), sroot = path.join(pf86, 'Steam', 'steamapps', 'common', 'Game');
  put(path.join(sroot, 'mowas_2_ed.exe'), '');
  const r3 = ed.preflight({ exe: 'mowas_2_ed', root: sroot }, Object.assign({}, NONE, { env: { 'ProgramFiles(x86)': pf86 } }));
  ok(r3.ok && r3.notes.some(n => n.code === 'EDSHOT_MAYBE_UNWRITABLE'), 'Steam library under Program Files (x86): ok with a note (' + r3.refuse + ')');
  const oroot = path.join(pf86, 'Other', 'Game2');
  put(path.join(oroot, 'mowas_2_ed.exe'), '');
  const r4 = ed.preflight({ exe: 'mowas_2_ed', root: oroot }, Object.assign({}, NONE, { env: { 'ProgramFiles(x86)': pf86 } }));
  ok(!r4.ok && r4.refuse.includes('EDSHOT_NOT_WRITABLE'), 'other folder under Program Files (x86): refused');
  const win = path.join(W, 'winroot'), wroot = path.join(win, 'steamapps', 'common', 'Game');
  put(path.join(wroot, 'mowas_2_ed.exe'), '');
  const r5 = ed.preflight({ exe: 'mowas_2_ed', root: wroot }, Object.assign({}, NONE, { env: { SystemRoot: win } }));
  ok(!r5.ok && r5.refuse.includes('EDSHOT_NOT_WRITABLE'), 'under the Windows folder: refused, Steam path or not');
}
{
  const r = ed.preflight({ exe: 'as64_ed', root: AS64, instance: 1, profile: path.join(W, 'nope') }, Object.assign({}, NONE, SAFE_ENV));
  ok(r.ok && r.notes.some(n => n.code === 'EDSHOT_PROFILE_ABSENT'), 'a missing profile folder is a note');
  const r2 = ed.preflight({ exe: 'goh_ed', root: STEAM }, Object.assign({}, NONE, SAFE_ENV));
  ok(r2.notes.some(n => n.code === 'EDSHOT_EXE_ABSENT'), 'the editor exe missing in the folder is a note');
}
throwsCode(() => ed.preflight({ exe: 'mowas_2', root: STEAM }, NONE), 'MV_USAGE', 'a game exe is not an editor: MV_USAGE');
throwsCode(() => ed.preflight({ exe: 'goh_ed', root: path.join(W, 'nowhere') }, NONE), 'MV_NOT_FOUND', 'no folder: MV_NOT_FOUND');
ok(ed.parseTasklist(row('Mowas_2.exe') + '\n"x y.exe","12","Services","0","1 K"').join('|') === 'mowas_2.exe|x y.exe', 'tasklist CSV parsed, names lower case');

// ---- 2. walk ----
{
  const T = path.join(W, 'tree'), OUT = path.join(W, 'outside');
  put(path.join(T, 'a.txt'), '12345'); put(path.join(T, 'sub', 'b.bin'), Buffer.alloc(300)); put(path.join(T, 'sub', 'deep', 'c.txt'), 'c');
  put(path.join(OUT, 'x.txt'), 'xyz'); put(path.join(OUT, 'inner', 'y.txt'), 'y');
  const l = ed.walk(T);
  const m = new Map(l.map(e => [e.rel, e]));
  ok(m.get('a.txt').size === 5 && !m.get('a.txt').dir && m.get('a.txt').mtimeMs > 0, 'walk: file size, time, not a folder');
  ok(m.get('sub').dir && m.get('sub/b.bin').size === 300 && m.has('sub/deep/c.txt'), 'walk: subfolders, sizes, forward slashes');
  ok(l.map(e => e.rel).join('|') === 'a.txt|sub|sub/b.bin|sub/deep|sub/deep/c.txt', 'walk: sorted, depth first (' + l.map(e => e.rel).join('|') + ')');
  ok(ed.walk(T, { skip: ['sub/deep'] }).every(e => !e.rel.startsWith('sub/deep')), 'walk: skip leaves out a folder and what is in it');
  if (links) {
    let made = true;
    try {
      fs.symlinkSync(T, path.join(T, 'sub', 'loop'), 'junction');
      fs.symlinkSync(OUT, path.join(T, 'ext'), 'junction');
      fs.symlinkSync(OUT, path.join(T, 'ext2'), 'junction');
      fs.symlinkSync(path.join(T, 'sub'), path.join(T, 'dup'), 'junction');
      fs.symlinkSync(T, path.join(OUT, 'back'), 'junction');
    } catch (e) { made = false; console.log('skip walk links: ' + (e.code || e.message)); }
    if (made) {
      const t0 = Date.now();
      const L = ed.walk(T), M = new Map(L.map(e => [e.rel, e]));
      ok(Date.now() - t0 < 5000 && L.length < 100, 'walk with a cycle ends (' + L.length + ' entries)');
      ok(M.get('sub/loop').link && M.get('sub/loop').dir && !M.get('sub/loop').followed && M.get('sub/loop').why === 'inside' && !L.some(e => e.rel.startsWith('sub/loop/')), 'link back to the root: listed, not followed');
      ok(M.get('ext').followed && M.get('ext/x.txt').size === 3 && M.has('ext/inner/y.txt'), 'link out of the tree: followed');
      ok(M.get('ext2').link && !M.get('ext2').followed && M.get('ext2').why === 'seen', 'second link to the same folder: followed once');
      ok(M.get('dup').why === 'inside' && !M.has('dup/b.bin'), 'link to a folder inside the tree: not walked twice');
      ok(M.get('ext/back').why === 'inside' && !L.some(e => e.rel.startsWith('ext/back/')), 'link from outside back in: no loop');
      const N = ed.walk(T, { links: false });
      ok(N.find(e => e.rel === 'ext').why === 'off' && !N.some(e => e.rel.startsWith('ext/')), 'links:false lists links, follows none');
      const C = ed.walk(path.join(T, 'sub'));
      ok(C.find(e => e.rel === 'loop').why === 'cycle', 'link to an ancestor of the root: a cycle, not followed');
      if (links) {
        const A = ed.walk(AS64);
        ok(A.some(e => e.rel === 'resource/set/a.set') && A.some(e => e.rel === 'mods/m1/file.txt'), 'AS64 build folder: walk goes through resource and mods links');
      }
    }
  }
  throwsCode(() => ed.walk(path.join(W, 'nothing')), 'MV_NOT_FOUND', 'walk of a missing folder: MV_NOT_FOUND');
}

// ---- 3. diff ----
{
  const exInst = ed.expectedFor({ scope: 'install' }), exProf = ed.expectedFor({ scope: 'profile' });
  ok(exInst.join('|') === 'minimap_render.png|minimap_render.png.temp|dialogs.txt', 'install list = the three run files');
  ok(['log/**', 'shader_cache/**', 'profiles/*/options.set', 'profiles/*/options.set.modswitch.bak', 'profiles/*/settings.set', 'profiles/*/options.set.temp'].every(p => exProf.includes(p)), 'profile list holds design 8');
  ok(ed.expectedFor({ scope: 'profile', route: 'console' }).includes('**/*.png') && !exProf.includes('**/*.png'), 'console route adds the GoH PNG');
  ok(ed.expectedFor({ scope: 'profile', bak: 'edshot-r1.bak' }).includes('profiles/*/edshot-r1.bak'), 'a per-run backup name is added');
  throwsCode(() => ed.expectedFor({ scope: 'profile', bak: '../x' }), 'MV_USAGE', 'bad backup name refused');

  const root = links ? AS64 : STEAM;
  const same = put(path.join(STEAM, 'resource', 'same.txt'), 'aaaa'), sub2 = path.dirname(put(path.join(STEAM, 'resource', 'sub2', 'z.txt'), 'z'));
  const bi = ed.walk(root), bp = ed.walk(PROF);
  const keep = path.join(STEAM, 'mods', 'm1', 'file.txt'), st = fs.statSync(keep);
  put(path.join(root, 'minimap_render.png'), 'png');
  put(path.join(STEAM, 'resource', 'new.txt'), 'new');
  put(path.join(STEAM, 'resource', 'set', 'a.set'), '{a b c}\r\n');
  fs.writeFileSync(keep, 'ABCDEF'); fs.utimesSync(keep, st.atimeMs / 1000, st.mtimeMs / 1000);
  // a rewrite that keeps the size but moves the time, and a folder whose only change is its time
  const later = Date.now() / 1000 + 5;
  fs.writeFileSync(same, 'bbbb'); fs.utimesSync(same, later, later);
  fs.utimesSync(sub2, later, later);
  const ai = ed.walk(root);
  const di = ed.diff(bi, ai, exInst);
  ok(di.added.some(e => e.rel === 'minimap_render.png') && !di.unexpected.some(u => u.rel === 'minimap_render.png'), 'install: the run file is an expected change');
  const want = ['resource/new.txt', 'resource/set/a.set'];
  ok(want.every(r => di.unexpected.some(u => u.rel === r)), 'install: new file and changed file inside resource are unexpected (' + JSON.stringify(di.unexpected) + ')');
  const ch = rel => di.changed.find(c => c.rel === rel), un = rel => di.unexpected.find(u => u.rel === rel);
  ok(ch('resource/same.txt') && ch('resource/same.txt').what.join() === 'time' && un('resource/same.txt'), 'install: a file whose only change is its time is changed (time) and unexpected');
  ok(ch('resource/sub2') && ch('resource/sub2').what.join() === 'time' && un('resource/sub2'), 'install: a folder whose only change is its time, under no expected parent, is unexpected');
  ok(un('resource') && un('resource').what.join() === 'time', 'install: resource/ moved its time with the new name in it: off the list');
  want.push('resource', 'resource/same.txt', 'resource/sub2');
  ok(!di.changed.some(c => c.rel === 'mods/m1/file.txt') && !di.unexpected.some(u => u.rel === 'mods/m1/file.txt'), 'a rewrite in mods/ that kept size and time is not seen');
  ok(di.limits.some(l => /size and time/.test(l) && /mods/.test(l)), 'the diff says that such a rewrite is not seen');
  fs.unlinkSync(path.join(root, 'minimap_render.png'));
  ok(ed.diff(bi, ed.walk(root), exInst).unexpected.every(u => want.includes(u.rel)), 'install after the run file is gone: only the two planted changes');

  sleep(30);
  put(path.join(PROF, 'log', 'game.log'), 'new log, longer');
  put(path.join(PROF, 'log', 'minidump.dmp'), 'dump');
  put(path.join(PROF, 'profiles', '123', 'options.set'), '{mods "a:0"}');
  const tmp = put(path.join(PROF, 'profiles', '123', 'scratch.tmp'), 't'); fs.unlinkSync(tmp);
  put(path.join(PROF, 'profiles', '123', 'editor_desktop.set'), '{desk changed}');
  put(path.join(PROF, 'profiles', '123', 'options.set.modswitch.bak'), '{mods}');
  const dp = ed.diff(bp, ed.walk(PROF), exProf);
  ok(dp.unexpected.length === 1 && dp.unexpected[0].rel === 'profiles/123/editor_desktop.set', 'profile: only the file off the list is unexpected (' + JSON.stringify(dp.unexpected) + ')');
  ok(dp.added.some(e => e.rel === 'log/minidump.dmp') && dp.changed.some(c => c.rel === 'log/game.log' && c.what.includes('size')), 'profile: expected changes are still listed');
  const dp2 = ed.diff(bp, ed.walk(PROF), []);
  ok(dp2.unexpected.some(u => u.rel === 'log/game.log'), 'with an empty expected list every change is unexpected');
  throwsCode(() => ed.diff({ rel: 'x' }, [], []), 'MV_USAGE', 'diff of a non-list: MV_USAGE (seeded)');
  throwsCode(() => ed.diff([{ name: 'x' }], [], []), 'MV_USAGE', 'diff of entries without rel: MV_USAGE (seeded)');
}

// ---- 4. moveout (fake install folders under the scratch dir only) ----
function fakeRoot(name) { const r = path.join(W, 'mo', name); put(path.join(r, 'as64_ed.exe'), ''); put(path.join(r, 'keep.txt'), 'keep'); return r; }
const IO = Object.assign({}, NONE, SAFE_ENV);
function refusedWith(fn, code, what) {
  try { fn(); ok(false, what + ' (not refused)'); return null; } catch (e) {
    ok(e.code === 'MV_REFUSED' && e.detail && e.detail.refused.some(r => r.code === code), what + ' (got ' + e.code + ' ' + JSON.stringify(e.detail && e.detail.refused) + ')');
    return e;
  }
}
{
  const R = fakeRoot('ok'), D = path.join(W, 'runs', 'ok');
  const rec = ed.preflight({ exe: 'as64_ed', root: R, instance: 1 }, IO);
  ok(rec.ok, 'move-out: preflight ok');
  sleep(20);
  put(path.join(R, 'minimap_render.png'), 'PNGDATA'); put(path.join(R, 'minimap_render.png.temp'), 'TMP');
  const before = fs.readdirSync(R).sort();
  const moved = ed.moveout(R, D, rec, IO);
  ok(moved.map(m => m.name).join('|') === 'minimap_render.png|minimap_render.png.temp', 'moved exactly the two run files that appeared');
  ok(!has(path.join(R, 'minimap_render.png')) && !has(path.join(R, 'minimap_render.png.temp')) && fs.readFileSync(path.join(D, 'minimap_render.png'), 'utf8') === 'PNGDATA', 'they are in the run folder, gone from the working folder');
  ok(fs.readdirSync(R).sort().join('|') === before.filter(n => !/^minimap_render/.test(n)).join('|'), 'nothing else in the working folder moved');
  ok(ed.moveout(R, D, rec, IO).length === 0, 'a second move-out finds nothing to move');
}
{
  const R = fakeRoot('present');
  put(path.join(R, 'dialogs.txt'), 'owner file');
  const rec = ed.preflight({ exe: 'as64_ed', root: R, instance: 1 }, IO);
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'present'), rec, IO), 'EDSHOT_RECORD', 'a refused preflight allows no move-out');
  ok(has(path.join(R, 'dialogs.txt')), 'the file that was there stays');
  // seeded defect 1: the record lies (dialogs.txt marked absent, but it was there; the names seen still say so)
  const lie = JSON.parse(JSON.stringify(rec)); lie.ok = true; lie.refuse = []; lie.absent['dialogs.txt'] = true;
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'lie1'), lie, IO), 'EDSHOT_NOT_OURS', 'lying record (absent flag): refused');
  ok(has(path.join(R, 'dialogs.txt')) && !has(path.join(W, 'runs', 'lie1', 'dialogs.txt')), 'lying record: the file stays in place');
  // seeded defect 2: the record lies in both fields; the file is older than the preflight
  sleep(ed.TIME_SLACK_MS + 300);
  const rec2 = ed.preflight({ exe: 'as64_ed', root: R, instance: 1 }, IO);
  const lie2 = JSON.parse(JSON.stringify(rec2)); lie2.ok = true; lie2.refuse = []; lie2.absent['dialogs.txt'] = true; lie2.seen = lie2.seen.filter(n => n !== 'dialogs.txt');
  put(path.join(R, 'minimap_render.png'), 'ours');
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'lie2'), lie2, IO), 'EDSHOT_NOT_OURS', 'lying record (absent and seen): refused by the file time');
  ok(has(path.join(R, 'dialogs.txt')) && has(path.join(R, 'minimap_render.png')), 'a record that does not hold up moves nothing at all');
}
{
  // NTFS tunneling: a run file made again within ~15 s of the last move-out gets the old file's creation time. Times
  // checked are modification times, so the second run's file is still moved
  const R = fakeRoot('tunnel');
  const shot = (rec, text) => {
    sleep(20);
    const tmp = put(path.join(R, 'minimap_render.png.temp'), text);
    fs.renameSync(tmp, path.join(R, 'minimap_render.png'));
  };
  const rec1 = ed.preflight({ exe: 'as64_ed', root: R, instance: 1 }, IO);
  shot(rec1, 'first');
  const m1 = ed.moveout(R, path.join(W, 'runs', 'tun1'), rec1, IO);
  ok(m1.map(m => m.name).join() === 'minimap_render.png', 'tunneling run 1: the PNG moved');
  sleep(ed.TIME_SLACK_MS + 300);
  const rec2 = ed.preflight({ exe: 'as64_ed', root: R, instance: 1 }, IO);
  shot(rec2, 'second');
  const st2 = fs.statSync(path.join(R, 'minimap_render.png'));
  const tunneled = st2.birthtimeMs > 0 && st2.birthtimeMs < rec2.at - ed.TIME_SLACK_MS;
  let m2 = null;
  try { m2 = ed.moveout(R, path.join(W, 'runs', 'tun2'), rec2, IO); } catch (e) { m2 = e; }
  ok(Array.isArray(m2) && m2.length === 1 && fs.readFileSync(path.join(W, 'runs', 'tun2', 'minimap_render.png'), 'utf8') === 'second',
    'tunneling run 2 (creation time ' + (tunneled ? 'tunneled' : 'not tunneled on this file system') + '): the new PNG moved (' + (m2 && m2.message) + ')');
}
{
  const R = fakeRoot('checks');
  const rec = ed.preflight({ exe: 'as64_ed', root: R, instance: 1 }, IO);
  sleep(20);
  put(path.join(R, 'minimap_render.png'), 'P');
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'x1'), rec.absent, IO), 'EDSHOT_RECORD', 'a bare absent list is not a record');
  refusedWith(() => ed.moveout(fakeRoot('other'), path.join(W, 'runs', 'x2'), rec, IO), 'EDSHOT_RECORD', 'record of another folder');
  refusedWith(() => ed.moveout(R, path.join(R, 'sub'), rec, IO), 'EDSHOT_RECORD', 'run folder inside the working folder');
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'x3'), rec, Object.assign({}, procs('as64_ed.exe'), SAFE_ENV)), 'EDSHOT_RUNNING', 'editor still running: refused');
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'x3'), rec, { tasklist: () => null }), 'EDSHOT_RUNNING', 'no process list at move-out: refused');
  ok(has(path.join(R, 'minimap_render.png')), 'refused move-outs leave the file');
  // the target cannot be written: the run folder would sit under a file
  const blocker = put(path.join(W, 'blocker.txt'), 'b');
  refusedWith(() => ed.moveout(R, path.join(blocker, 'run'), rec, IO), 'EDSHOT_TARGET_UNWRITABLE', 'run folder cannot be made');
  ok(has(path.join(R, 'minimap_render.png')), 'unwritable target: the file stays');
  const D = put(path.join(W, 'runs', 'taken', 'minimap_render.png'), 'old') && path.join(W, 'runs', 'taken');
  refusedWith(() => ed.moveout(R, D, rec, IO), 'EDSHOT_TARGET_EXISTS', 'run folder already holds the name');
  ok(fs.readFileSync(path.join(D, 'minimap_render.png'), 'utf8') === 'old' && has(path.join(R, 'minimap_render.png')), 'nothing overwritten');
  // another drive: rename fails with EXDEV, copy then remove
  const xio = Object.assign({}, IO, { rename: () => { const e = new Error('cross-device'); e.code = 'EXDEV'; throw e; } });
  const mv2 = ed.moveout(R, path.join(W, 'runs', 'xdev'), rec, xio);
  ok(mv2.length === 1 && !has(path.join(R, 'minimap_render.png')) && fs.readFileSync(path.join(W, 'runs', 'xdev', 'minimap_render.png'), 'utf8') === 'P', 'EXDEV: copied and removed');
  fs.mkdirSync(path.join(R, 'dialogs.txt'));
  refusedWith(() => ed.moveout(R, path.join(W, 'runs', 'x4'), rec, IO), 'EDSHOT_NOT_FILE', 'a run file that is a folder is left');
}

// ---- 5. importPicture ----
function pic(w, h, f) { const rgba = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set(f(x, y), (y * w + x) * 4); return png.encode({ w, h, rgba }); }
const DOC = { v: 1, game: 'mowas2', key: 'multi/mv_fixture', stack: { mods: [], hash: '0123456789abcdef' }, boxes: { world: [-600, -440, 600, 440] } };
{
  const f = put(path.join(W, 'p64.png'), pic(64, 64, (x, y) => (y < 32 ? [255, 0, 0, 255] : [0, 0, 255, 255])));
  const g = ed.importPicture(f, DOC);
  ok(g.name === 'pic.edshot' && g.etype === 'rgba8' && g.sample === 'cell', 'import: name, etype, sample');
  ok(g.cell === 1200 / 64 && g.w === 64 && g.h === Math.round(880 / (1200 / 64)) && g.h === 47, 'import: square pixels, w = 64, h = 47 (' + g.w + 'x' + g.h + ' cell ' + g.cell + ')');
  ok(g.ox === -600 && g.oy === -440 && g.data.length === g.w * g.h * 4 && g.data instanceof Uint8ClampedArray, 'import: origin = the world box corner');
  ok(g.data[0] === 255 && g.data[2] === 0 && g.data[(g.h - 1) * g.w * 4 + 2] === 255, 'import: file row 0 is grid row 0 (no flip)');
  const mid = Math.floor(g.h / 2) * g.w * 4;
  ok(g.data[mid] > 0 && g.data[mid + 2] > 0 && g.data[mid + 3] === 255, 'import: the row across the edge is a box blend');
  const ras = ed._rasterLib();
  if (ras) {
    const src = png.decode(fs.readFileSync(f));
    const sg = ras.make({ name: 'x', w: src.w, h: src.h, cell: 1, etype: 'rgba8' }); sg.data.set(src.rgba);
    const want = ras.resample(sg, g.w, g.h, 'box').data;
    ok(g.meta.resample === 'raster' && Buffer.compare(Buffer.from(g.data), Buffer.from(want)) === 0, 'import: same bytes as raster resample box');
  } else {
    console.log('skip raster box resample: lib/raster is not built yet (the own box filter stands in)');
    ok(g.meta.resample === 'edshot', 'import: the own box filter stands in while raster is absent');
  }
  const enc = gridfile.decode(gridfile.encode(g));
  ok(enc.w === g.w && enc.name === 'pic.edshot', 'import: the grid round-trips through gridfile');
  const s = ed.sidecar(g, DOC, 'T');
  ok(s.v === 1 && s.layer === 'pic.edshot' && s.rowOrder === 'minY-first' && s.box.join() === '-600,-440,600,440' && s.target === 'mowas2' && s.stackHash === '0123456789abcdef' && s.made === 'T' && s.cell === g.cell, 'sidecar fields');
}
{
  // a PNG already at the box's aspect: same bytes
  const f = put(path.join(W, 'p_id.png'), pic(64, 47, (x, y) => [x * 4, y * 5, (x + y) & 255, 255]));
  const g = ed.importPicture(f, DOC), src = png.decode(fs.readFileSync(f));
  ok(g.w === 64 && g.h === 47 && Buffer.compare(Buffer.from(g.data), Buffer.from(src.rgba)) === 0, 'import at the right aspect keeps every byte');
  // non-square PNG over a square box: one axis grows
  const f2 = put(path.join(W, 'p_wide.png'), pic(32, 16, (x, y) => [x * 8, y * 16, 7, 255]));
  const g2 = ed.importPicture(f2, { boxes: { world: [0, 0, 100, 100] } });
  ok(g2.w === 32 && g2.h === 32 && g2.cell === 100 / 32, 'import: 32x16 over a square box gives 32x32');
  ok(g2.data[0] === 0 && g2.data[1] === 0 && g2.data[(31 * 32 + 31) * 4 + 1] === 240, 'import: stretched rows keep their values at the ends');
  // straight alpha: a transparent pixel's colour does not bleed
  const f3 = put(path.join(W, 'p_alpha.png'), pic(4, 2, (x) => (x % 2 ? [255, 255, 255, 0] : [0, 100, 0, 255])));
  const g3 = ed.importPicture(f3, { boxes: { world: [0, 0, 200, 200] } });
  ok(g3.w === 4 && g3.h === 4, 'import: 4x2 over a square box gives 4x4');
  const f4 = put(path.join(W, 'p_alpha2.png'), pic(4, 4, (x) => (x % 2 ? [255, 255, 255, 0] : [0, 100, 0, 255])));
  const g4 = ed.importPicture(f4, { boxes: { world: [0, 0, 200, 100] } });
  ok(g4.w === 4 && g4.h === 2, 'import: 4x4 over a 2:1 box gives 4x2');
  const g5 = ed.importPicture(put(path.join(W, 'p_alpha3.png'), pic(4, 1, (x) => (x % 2 ? [255, 255, 255, 0] : [0, 100, 0, 255]))), { boxes: { world: [0, 0, 400, 200] } });
  ok(g5.w === 4 && g5.h === 2, 'import: 4x1 over a 2:1 box: 4x2');
  const half = ed._resampleBox(new Uint8ClampedArray([0, 100, 0, 255, 255, 255, 255, 0]), 2, 1, 1, 1);
  ok(half[0] === 0 && half[1] === 100 && half[2] === 0 && half[3] === 128, 'resample premultiplies: no white from a clear pixel (' + Array.from(half) + ')');
  throwsCode(() => ed.importPicture(put(path.join(W, 'bad.png'), Buffer.from('not a png at all')), DOC), 'MV_USAGE', 'corrupt PNG refused (seeded)');
  throwsCode(() => ed.importPicture(f, { boxes: { world: [10, 0, 0, 10] } }), 'MV_USAGE', 'inverted world box refused (seeded)');
  throwsCode(() => ed.importPicture(f, {}), 'MV_USAGE', 'document without boxes refused');
  throwsCode(() => ed.importPicture(path.join(W, 'none.png'), DOC), 'MV_NOT_FOUND', 'missing picture: MV_NOT_FOUND');
}

// ---- 6. the CLI, in process ----
function cl(args, io) {
  const out = [], err = [];
  const code = cli.run(args, Object.assign({ out: s => out.push(s), err: s => err.push(s) }, io || {}));
  return { code, out: out.join(''), err: err.join('') };
}
{
  const s = cl(['shot']);
  ok(s.code === 4 && /not built/.test(s.err) && /^mapviz edshot: /.test(s.err), 'shot: not built, exit 4');
  const c = cl(['calibrate', '--json']);
  let j = null; try { j = JSON.parse(c.out); } catch (e) { j = null; }
  ok(c.code === 4 && j && j.error.code === 'MV_NOT_BUILT', 'calibrate --json: MV_NOT_BUILT, exit 4');
  const h = cl(['--help']);
  ok(h.code === 0 && ['preflight', 'walk', 'diff', 'moveout', 'import', 'shot', 'calibrate'].every(k => h.out.includes('  ' + k + ' ')), 'help lists every command');
  ok(cl([]).code === 0, 'no arguments: help, exit 0');
  ok(cl(['nope']).code === 2, 'unknown command: exit 2');
  ok(cl(['preflight', '--exe', 'as64_ed', '--root', AS64, '--bogus']).code === 2, 'unknown flag: exit 2');
  ok(cl(['preflight', '--exe', 'as64_ed', '--root', AS64, '--instance', '1', '--run', '../x'], IO).code === 2, 'bad run id: exit 2 (seeded)');
  ok(Object.keys(cli.commands).join() === 'preflight,walk,diff,moveout,import,shot,calibrate' && cli.version === ed.VERSION, 'command table and version');

  const R = fakeRoot('cli');
  const p = cl(['preflight', '--exe', 'as64_ed', '--root', R, '--instance', '2', '--run', 'r1', '--json'], IO);
  const runDir = path.join(process.env.ARSENAL_CACHE, 'mapviz', 'runs', 'r1');
  ok(p.code === 0 && JSON.parse(p.out).ok === true && has(path.join(runDir, 'preflight.json')), 'CLI preflight writes the record into <cache>/runs/<id>');
  ok(cl(['preflight', '--exe', 'as64_ed', '--root', R, '--instance', '2', '--run', 'r1'], IO).code === 2, 'a run id is used once');
  ok(cl(['preflight', '--exe', 'as64_ed', '--root', R, '--instance', '0'], IO).code === 6, 'CLI preflight refused: exit 6');
  ok(cl(['walk', '--root', R, '--run', 'r1', '--label', 'before'], IO).code === 0 && has(path.join(runDir, 'walk-before.json')), 'CLI walk keeps the list');
  sleep(20);
  put(path.join(R, 'minimap_render.png'), 'P'); put(path.join(R, 'stray.txt'), 's');
  ok(cl(['walk', '--root', R, '--run', 'r1', '--label', 'after'], IO).code === 0, 'CLI walk after');
  const d = cl(['diff', '--run', 'r1', '--json'], IO);
  const dj = JSON.parse(d.out);
  ok(d.code === 1 && dj.unexpected.length === 1 && dj.unexpected[0].rel === 'stray.txt' && /not covered/.test(d.err), 'CLI diff: exit 1, the stray file named, the limit said');
  const m = cl(['moveout', '--run', 'r1', '--json'], IO);
  ok(m.code === 0 && JSON.parse(m.out).moved.length === 1 && has(path.join(runDir, 'minimap_render.png')) && has(path.join(runDir, 'moveout.json')), 'CLI moveout: moved into the run folder');
  fs.unlinkSync(path.join(R, 'stray.txt'));
  put(path.join(R, 'minimap_render.png'), 'again');
  const m2 = cl(['moveout', '--run', 'r1', '--json'], IO);
  ok(m2.code === 6 && JSON.parse(m2.out).error.code === 'MV_REFUSED', 'CLI moveout refused (name taken): exit 6');
  const docDir = path.join(W, 'docdir'); put(path.join(docDir, 'mapdoc.json'), JSON.stringify(DOC));
  const outDir = path.join(W, 'imp');
  const im = cl(['import', '--file', path.join(W, 'p64.png'), '--in', docDir, '--out', outDir, '--json'], IO);
  ok(im.code === 0 && ['pic.edshot.mvg', 'pic.edshot.json', 'reads.json'].every(n => has(path.join(outDir, n))), 'CLI import writes the grid, the sidecar and reads.json');
  const gg = gridfile.read(path.join(outDir, 'pic.edshot.mvg'));
  ok(gg.w === 64 && gg.h === 47 && gg.etype === 'rgba8', 'CLI import grid reads back');
  const rj = JSON.parse(fs.readFileSync(path.join(outDir, 'reads.json'), 'utf8'));
  ok(rj.v === 1 && rj.inputs.length === 2 && rj.inputs.every(i => i.kind === 'loose' && i.size > 0), 'reads.json lists the picture and the document');
  ok(cl(['import', '--file', path.join(W, 'p64.png'), '--in', path.join(W, 'empty-in'), '--out', outDir], IO).code === 2, 'import with no document: exit 2');
  ok(cl(['import', '--file', path.join(W, 'p64.png'), '--in', docDir, '--out', STEAM], IO).code === 6, 'import --out inside an install: refused');
  ok(cl(['preflight', '--exe', 'mowas_2_ed'], IO).code === 2, 'preflight without --root: exit 2 (no folder lookup)');
  // the document from mapkit (--target, --map): reads.json carries the map files mapkit read, not only the picture
  if (!has(path.join(DIR, '..', 'lib', 'mapkit', 'index.js'))) console.log('skip import --target: lib/mapkit is not built yet');
  else {
    const fx = require(path.join(DIR, '..', 'test', 'fxmake.js')).make(path.join(W, 'fx'), { form: 'as2' });
    const out2 = path.join(W, 'imp2');
    const t = cl(['import', '--file', path.join(W, 'p64.png'), '--target', fx.target, '--game', fx.gameDir, '--map', fx.map, '--out', out2, '--json'], IO);
    ok(t.code === 0, 'import --target --map: exit 0 (' + t.code + ' ' + t.err.trim() + ')');
    let rj2 = null; try { rj2 = JSON.parse(fs.readFileSync(path.join(out2, 'reads.json'), 'utf8')); } catch (e) { rj2 = null; }
    const game = path.resolve(fx.gameDir).toLowerCase();
    ok(rj2 && rj2.inputs.some(i => path.resolve(i.file) === path.join(W, 'p64.png')) && rj2.inputs.some(i => path.resolve(i.file).toLowerCase().startsWith(game) && typeof i.size === 'number'),
      'import --target: reads.json lists the picture and the map files read (' + (rj2 ? rj2.inputs.map(i => i.kind + ' ' + path.basename(i.file)).join(', ') : 'none') + ')');
  }
}

// ---- 7. source scan ----
{
  const files = [];
  (function list(d) { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) list(f); else if (/\.js$/.test(n)) files.push(f); } })(DIR);
  ok(files.length >= 3, 'source scan found the files');
  // process access: no file of the part names the child process module; no call named like a process call (exec alone
  // excepted: RegExp.exec); the process list comes only through tools/lib/platform processList, once, in index.js
  const CPNAME = 'child' + '_process';
  const NAMES = ['sp' + 'awn', 'sp' + 'awnSync', 'ex' + 'ecSync', 'ex' + 'ecFile', 'ex' + 'ecFileSync', 'fo' + 'rk'];
  const GENERIC = new RegExp('\\b(' + NAMES.join('|') + ')\\s*\\(', 'g');
  const BANNED = new RegExp('require\\(\\s*[\'"][^\'"]*(?:' + ['ui' + 'drive', 'mod' + 'switch', 'ed' + 'run', 'as2/as2', 'as2/fl' + 'ow', 'tools/as2'].join('|') + ')', 'i');
  const LOOKUP = new RegExp('require\\(\\s*[\'"][^\'"]*(?:' + ['game' + 'dir', 'win' + 'reg'].join('|') + ')', 'i');
  function scan(name, src) {
    let m; const bad = [];
    if (src.includes(CPNAME)) bad.push('names the process module');
    GENERIC.lastIndex = 0;
    while ((m = GENERIC.exec(src))) bad.push(m[0]);
    if (BANNED.test(src)) bad.push('requires uidrive, modswitch, edrun or as2 play');
    if (name !== 'edshot.test.js' && LOOKUP.test(src)) bad.push('requires gamedir or winreg itself (a lookup may run reg)');
    return bad;
  }
  // seeded: planted sources the scan must catch
  const P = "const cp = require('" + CPNAME + "');\n";
  ok(scan('index.js', P + 'cp.' + 'sp' + "awnSync('as64_ed.exe', []);").length > 0, 'scan catches a process call (seeded)');
  ok(scan('index.js', P + 'cp.' + 'ex' + "ecFileSync('tasklist', ['/FO', 'CSV', '/NH']);").length > 0, 'scan catches a direct tasklist call too');
  ok(scan('edshot.js', P).length === 1, 'scan catches the process module');
  ok(scan('index.js', 'const { ' + 'sp' + 'awn: s } = x; s' + '(1);').length === 0 && scan('index.js', 'x.' + 'sp' + 'awn(1);').length === 1, 'scan catches a method call named like a process call');
  ok(scan('index.js', "require('../../" + 'ui' + "drive/uidrive');").length === 1, 'scan catches a uidrive require');
  ok(scan('edshot.js', "require('../../lib/" + 'game' + "dir');").length === 1, 'scan catches a gamedir require in the part');
  ok(scan('index.js', "platform.processList({}); /x/.ex" + 'ec(s);').length === 0, 'scan passes platform processList and RegExp exec');
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const bad = scan(path.basename(f), src);
    ok(!bad.length, path.basename(f) + ': no process module, no process call; no uidrive, modswitch, edrun or as2 play (' + bad.join('; ') + ')');
    ok(!/[^\x00-\x7f]/.test(src) && !/\r/.test(src), path.basename(f) + ': ASCII and LF');
  }
  const own = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');
  ok(/require\('\.\.\/\.\.\/lib\/platform'\)/.test(own) && (own.match(/platform\.processList\(/g) || []).length === 1, 'one process call in the part: platform processList in index.js');
  ok(!/platform\.processList\(/.test(fs.readFileSync(path.join(DIR, 'edshot.js'), 'utf8')), 'edshot.js reads no process list itself');
  ok(!new RegExp('require\\([^)]*edshot').test(fs.readFileSync(path.join(DIR, '..', 'mapviz.js'), 'utf8')), 'mapviz.js does not load edshot');
}

// ---- 8. real installs: preflight only (read-only: process list and stat) ----
if (process.env.MAPVIZ_NO_GAME === '1') console.log('skip real installs: MAPVIZ_NO_GAME=1');
else {
  const gd = require(path.join(DIR, '..', '..', 'lib', 'gamedir.js'));
  const as2 = (gd.resolve({}) || {}).dir, goh = gd.goh();
  const real = [['mowas_2_ed', as2 && fs.existsSync(path.join(as2, 'resource', 'map.pak')) ? as2 : null, 'MoW:AS2'],
    ['goh_ed', goh && fs.existsSync(path.join(goh, 'resource', 'map', 'multi.pak')) ? goh : null, 'GoH']];
  if (process.env.MAPVIZ_AS64_DIR) real.push(['as64_ed', process.env.MAPVIZ_AS64_DIR, 'AS64 build']);
  else console.log('skip AS64 build folder: no MAPVIZ_AS64_DIR');
  for (const [exe, root, name] of real) {
    if (!root) { console.log('skip ' + name + ': no ' + name + ' install'); continue; }
    const r = ed.preflight({ exe, root, instance: 1 });
    ok(r.v === 1 && typeof r.ok === 'boolean' && ed.RUN_FILES.every(n => typeof r.absent[n] === 'boolean'), name + ' preflight answers');
    console.log('real ' + name + ' preflight: ' + (r.ok ? 'ok' : 'refused ' + r.refuse.join(',')) + '; absent ' + ed.RUN_FILES.map(n => n + '=' + r.absent[n]).join(' '));
  }
}

if (fail) { console.log(fail + ' failed, ' + pass + ' passed'); process.exit(1); }
console.log('PASS mapviz edshot (' + pass + ')');
