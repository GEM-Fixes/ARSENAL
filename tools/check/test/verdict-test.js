#!/usr/bin/env node
// verdict-test (W5 G5): GT-01 a mod in a folder named "mods" that is not a game's is checked against the real game (overlay), not
// against its parent folder; GT-02 one overall result counts crash rows even when the wouldload verdict says LOADS_STATIC; GT-18
// --plain prints plain lines only (no codes, no limit ids), --raw keeps the report; GT-04 lib/vfs dropReason names why a mod is left out.
// needs fx/game from mkfixture (run.sh makes it). temp files under os.tmpdir() only.
// Author: Imperator_Aug (ARSENAL, ia-fe983e99)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const CHK = path.join(__dirname, '..', 'check.js'), G = path.join(__dirname, 'fx', 'game');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL: ' + m); } };
const run = (args, env) => { const r = cp.spawnSync(process.execPath, [CHK, ...args], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...(env || {}) } }); return { rc: r.status, o: r.stdout || '', e: r.stderr || '' }; };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'check-g5-'));
try {
  // GT-01: <tmp>/play/mods/fresh, no --game, the game found through AS2_GAME. old code: "MODE in-place" against <tmp>/play (no game data:
  // FONT_MAIN10_MISSING, no exe: version judged as 3.262.1), while wouldload read the real game
  const m = path.join(T, 'play', 'mods', 'fresh');
  fs.mkdirSync(path.join(m, 'resource', 'interface'), { recursive: true });
  fs.mkdirSync(path.join(m, 'resource', 'entity'), { recursive: true });
  fs.writeFileSync(path.join(m, 'mod.info'), '{Mod\r\n\t{Name "fresh"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
  // a small game of our own: mowas_2.exe + the default font the engine needs (fx/game has no font, so uilint would flag it there)
  const g32 = path.join(T, 'g32'), fd = path.join(g32, 'resource', 'interface', 'font');
  fs.mkdirSync(fd, { recursive: true }); fs.mkdirSync(path.join(g32, 'mods'), { recursive: true }); fs.writeFileSync(path.join(g32, 'mowas_2.exe'), '');
  fs.writeFileSync(path.join(fd, 'main10.font'), '{font_atlas\r\n\t{name "main"}\r\n\t{size 10}\r\n}\r\n');
  const env = { AS2_GAME: g32, AS2_NO_STEAM: '1' };
  const a = run([m, '--exe', 'mowas2', '--json', path.join(T, 'a.json')], env);
  ok(/^MODE outside-mods: overlay/m.test(a.o), 'GT-01: a "mods" folder outside the game was checked in place:\n' + a.o);
  ok(!/FONT_MAIN10_MISSING|MOD_VERSION/.test(a.o), 'GT-01: false crash or version finding on an empty fresh mod:\n' + a.o);
  // the same mod with --game (the Ready to share command line) gives the same verdict lines and findings
  const b = run([m, '--exe', 'mowas2', '--game', g32]);
  const vl = s => s.split(/\r?\n/).filter(l => /^(VERDICT |  [A-Z_]+ x\d)/.test(l)).join('\n');
  ok(vl(a.o) === vl(b.o) && vl(a.o), 'GT-02: no --game and --game differ:\n' + vl(a.o) + '\n---\n' + vl(b.o));
  // in place under a real game folder without --game: wouldload and doctor read that game (READ line mounted)
  const c = run([path.join(G, 'mods', 'm1'), '--exe', 'mowas2', '--only', 'modinfo'], { AS2_GAME: path.join(T, 'nogame'), AS2_NO_STEAM: '1' });
  ok(/^MODE in-place/m.test(c.o) && /^READ mowas2: \d+ mod files/m.test(c.o) && !/^READ mowas2: .*NOT mounted/m.test(c.o), 'in place without --game: wouldload did not read the same game:\n' + c.o + c.e);

  // GT-02: m1 has one crash row while the mowas2 verdict says LOADS_STATIC: overall = crash, in --json and in --plain line 1
  const pj = path.join(T, 'p.json');
  const p = run([path.join(G, 'mods', 'm1'), '--game', G, '--exe', 'mowas2', '--plain', '--json', pj]);
  let R = {}; try { R = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { /* checked below */ }
  ok(R.overall && R.overall.verdict === 'crash' && R.overall.crash >= 1 && R.overall.target === 'mowas2', 'GT-02: overall is not crash: ' + JSON.stringify(R.overall));
  ok(R.verdicts && R.verdicts.mowas2 && R.verdicts.mowas2.verdict === 'LOADS_STATIC', 'fixture: mowas2 verdict changed: ' + JSON.stringify(R.verdicts));
  // GT-18: plain lines only, first = overall, one line per finding row, no codes / limit ids / tags / PROGRESS / VERDICT
  const pl = p.o.split(/\r?\n/).filter(Boolean);
  ok(pl[0] && /^Not ready for the original 32-bit game: 1 problem that can crash the game\./.test(pl[0]), 'GT-18: first plain line: ' + pl[0]);
  ok(pl.length === (R.plain || []).length && pl.every((l, i) => l === R.plain[i]), 'GT-18: --plain stdout differs from json plain');
  ok(pl.filter(l => /^(Can crash the game|Silently ignored by the game|Can split a multiplayer match|Worth a look|Looks or reads wrong|Note): .+ \(\d+ places?(, first: [^)]+)?\)\./.test(l)).length === (R.findings || []).length, 'GT-18: not one line per finding:\n' + pl.join('\n'));
  const jargon = pl.filter(l => /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b(?!UTF-)[A-Z]{2,8}-\d+\b|\[[VIT]\b|^(PROGRESS|VERDICT|READ|MODE|NOTE)\b|\.cpp:\d/.test(l.replace(/, first: [^)]+\)/, ')')));
  ok(!jargon.length, 'GT-18: codes or ids in plain lines:\n' + jargon.join('\n'));
  ok(pl.some(l => /^Can crash the game: /.test(l)), 'GT-18: the crash row has no plain line');
  const pr = run([path.join(G, 'mods', 'm1'), '--game', G, '--exe', 'mowas2', '--plain', '--raw']);
  const at = pr.o.indexOf('--- full report ---');
  ok(at > 0 && /^VERDICT mowas2: /m.test(pr.o.slice(at)) && pr.o.slice(0, at).trim() === pl.join('\n'), 'GT-18: --raw does not keep the full report after the plain lines');
  ok(/--plain/.test(run(['--help']).o), 'GT-18: --plain not in the usage text');

  // GT-04: lib/vfs dropReason: an Enhanced mod in a list without as64+ is left out for that reason, in plain words
  const g = path.join(T, 'g64');
  const mi = (d, min, max) => { fs.mkdirSync(path.join(d, 'resource'), { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), `{Mod\r\n\t{Name "x"}\r\n\t{MinGameVersion "${min}"}\r\n${max ? `\t{MaxGameVersion "${max}"}\r\n` : ''}}\r\n`); };
  fs.mkdirSync(path.join(g, 'resource'), { recursive: true }); fs.writeFileSync(path.join(g, 'as64.exe'), '');
  mi(path.join(g, 'as64', 'plus'), '3.301'); mi(path.join(g, 'mods', 'e'), '3.301'); mi(path.join(g, 'mods', 'c'), '3.262.1', '3.262.1');
  const vfs = require('../../lib/vfs');
  ok(typeof vfs.dropReason === 'function', 'GT-04: lib/vfs has no dropReason');
  if (typeof vfs.dropReason === 'function') {
    const v1 = vfs.build({ gameDir: g, mods: ['c', 'e'], disableVersionControl: true }), d1 = vfs.dropReason(v1, 'e');
    ok(d1 && d1.code === 'MOD_MODE' && d1.reason === 'enhanced-in-classic' && /as64\+/.test(d1.text) && !/eMod|MOD_/.test(d1.text), 'GT-04: enhanced mod in a Classic list: ' + JSON.stringify(d1));
    ok(vfs.dropReason(v1, 'c') === null, 'GT-04: an applied mod has a drop reason');
    const v2 = vfs.build({ gameDir: g, mods: ['as64+', 'e'], disableVersionControl: true });
    ok(vfs.dropReason(v2, 'e') === null && v2.mods.includes('e'), 'GT-04: enhanced mod with as64+ is left out: ' + JSON.stringify(v2.mods));
  }
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log(bad ? `verdict-test: ${bad} FAIL` : 'verdict-test: PASS');
process.exitCode = bad ? 1 : 0;
