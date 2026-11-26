// T-CRASH test: check flags every seeded crash / silent-disable cause of mkcrash.js and nothing else; the clean twin gets the verdict in words;
// plain one-line errors (gold text) for a missing --game, a mod folder with capitals, a path that is not a mod. run from tools/check/test.
// KNOWN: causes whose rule lives in a tool T-CRASH does not own (milint, binhdr, modinfo): if one misses, it is listed, not failed (fix row).
// Author: Imperator_Aug (ARSENAL, ia-d33c93eb)
const fs = require('fs'), path = require('path'), cp = require('child_process'), registry = require('../../lib/registry');
const here = __dirname, CR = path.join(here, 'cr'), G = path.join(CR, 'game'), CHECK = path.join(here, '..', 'check.js');
const fails = [], known = [];
const fail = m => fails.push(m);
const run = (args) => require('../../lib/test/wait').spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', cwd: here, timeout: 600000 }, 'check crash-test');

cp.execFileSync(process.execPath, [path.join(here, 'mkcrash.js'), CR]);
// edge folders for the plain errors
const put = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
put(path.join(CR, 'CapMod', 'mod.info'), '{Mod\r\n\t{Name "cap"}\r\n\t{MinGameVersion "3.262.1"}\r\n\t{MaxGameVersion "3.262.1"}\r\n}\r\n');
put(path.join(CR, 'notamod', 'readme.txt'), 'not a mod\r\n');
// the stub game holds the environment preset the fixture maps name (refcheck ENV_PRESET_MISSING, VIS-12, reads set/environment)
put(path.join(G, 'resource', 'set', 'environment', 'multi', 'multi_01.set'), '{environment\r\n}\r\n');

// cause -> primary code + the tool that owns it; aliases = other codes the same seeded cause raises (allowed, not "others")
const CAUSES = [
  { cause: 'obstacleID not in obstacles.reg (STR-29)', code: 'CRASH_OBSTACLE_UNKNOWN', tool: 'envcheck', own: true, aliases: ['STR_OBSTACLE_NAME_MISSING'] },
  { cause: 'cell-5 map.net (PORT-70)', code: 'NET_CELL', tool: 'binhdr' },
  { cause: 'missing include in combat.mi', code: 'INCLUDE_MISSING', tool: 'milint', aliases: ['INCLUDE_MISSING'] },
  { cause: 'mod.info with no Min/Max (PORT-48)', code: 'VER_MISSING', tool: 'modinfo', aliases: ['MOD_VERSION'] },
  { cause: 'terrain material without 2 layers (MAP-29)', code: 'CRASH_TERRAIN_LAYERS', tool: 'envcheck', own: true, aliases: ['MAP_MTL_LAYER_COUNT'] },
  { cause: 'captureflag without captureflaga/b clips (MIS-62)', code: 'CRASH_FLAG_CLIPS', tool: 'envcheck', own: true, aliases: ['MAP_CAPTURE_CLIPS'] },
];
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---- seeded mod
const r1 = run([path.join(G, 'mods', 'crash'), '--game', G, '--exe', 'mowas2', '--json', path.join(CR, 'crash.json')]);
const R1 = json(path.join(CR, 'crash.json')), lines1 = r1.stdout.split(/\r?\n/).filter(l => !/^PROGRESS /.test(l));
// a finding merged into another linter's row on the same file:line (check gate.js dedupe) counts for the tool named in its 'also'
const got = R1.findings.flatMap(f => [{ code: f.code, tool: f.tool, sev: f.sev }, ...[...new Set((f.samples || []).flatMap(s => s.also || []))].filter(t => /^[a-z0-9]+$/.test(t)).map(t => ({ code: f.code, tool: t, sev: f.sev, also: true }))]);
const rows = [];
for (const c of CAUSES) {
  const hit = got.find(g => g.code === c.code && g.tool === c.tool);
  rows.push(`${c.cause} | ${c.code} | ${c.tool} | ${hit ? 'yes (' + hit.sev + (hit.also ? ', merged into another linter row' : '') + ')' : 'NO'}`);
  if (!hit) { if (c.own) fail(`${c.cause}: ${c.code} [${c.tool}] not reported`); else known.push(`${c.cause}: ${c.code} [${c.tool}] not reported (tool not owned here: fix row)`); continue; }
  if (hit.sev !== 'crash' && hit.sev !== 'silent') fail(`${c.code}: severity ${hit.sev}, want crash or silent`);
}
const allowed = new Set(CAUSES.flatMap(c => [c.code, ...(c.aliases || [])]));
for (const g of got) if (!allowed.has(g.code)) fail(`unexpected finding ${g.code} [${g.tool}] (${g.sev}) on the seeded mod`);
if (R1.verdicts.mowas2.verdict !== 'REFUSED') fail('PORT-48: verdict ' + R1.verdicts.mowas2.verdict + ', want REFUSED');
if (!/^Known crash pattern found: \d+ crash findings \(CRASH below\)\. Fix them before you play\. The game will not load this mod \(mowas2: /.test(lines1[0])) fail('seeded: first line is not the crash verdict in words: ' + lines1[0]);
if (r1.status !== 1) fail('seeded: exit ' + r1.status + ', want 1');

// ---- clean twin: no crash/silent-disable finding; WARN_MPSYNC_SIZE_ONLY (NET-01, every mod with a .ply/.mtl) is the one expected silent row
const r2 = run([path.join(G, 'mods', 'clean'), '--game', G, '--exe', 'mowas2', '--json', path.join(CR, 'clean.json')]);
const R2 = json(path.join(CR, 'clean.json')), lines2 = r2.stdout.split(/\r?\n/).filter(l => !/^PROGRESS /.test(l));
for (const f of R2.findings) if (f.code !== 'WARN_MPSYNC_SIZE_ONLY') fail(`clean: unexpected finding ${f.code} [${f.tool}]`);
if (lines2[0] !== 'No known crash pattern. This does not mean it works: play it.') fail('clean: first line: ' + lines2[0]);
if (!/^1 finding can silently disable or desync part of the mod \(SILENT below\)\.$/.test(lines2[1])) fail('clean: second line: ' + lines2[1]);
if (r2.status !== 0) fail('clean: exit ' + r2.status);

// ---- plain errors (gold text, stderr, exit 2, no stack / ENOENT / usage dump)
const rel = p => path.relative(here, p).replace(/\\/g, '/');
const GOLD = [
  [[rel(path.join(G, 'mods', 'clean')), '--game', 'cr/no_such_game'], 'Game folder not found: cr/no_such_game. Give --game the folder that holds the game exe (mowas_2.exe or as64.exe).'],
  [['cr/CapMod', '--game', rel(G)], 'The mod folder "CapMod" has capital letters. The game reads mod folder names in lowercase and does not load this one (VFS-12): rename it to "capmod" and run check again.'],
  [['cr/notamod', '--game', rel(G)], 'cr/notamod is not a mod folder: no mod.info, resource/, localization/ or .pak inside. Give the mod folder (the one with mod.info, or with resource/ inside).'],
  [['cr/no_such_mod'], 'Not found: cr/no_such_mod. Give the mod folder (the one with mod.info, or with resource/ inside).'],
  [['cr/game/mowas_2.exe'], 'cr/game/mowas_2.exe is a file, not a mod folder. Give the mod folder (the one with mod.info, or with resource/ inside).'],
];
for (const [args, want] of GOLD) {
  const r = run(args), all = (r.stdout + r.stderr).trim();
  if (all !== want) fail(`plain error for ${args.join(' ')}:\n  got  ${JSON.stringify(all)}\n  want ${JSON.stringify(want)}`);
  if (r.status !== 2) fail(`exit ${r.status} for ${args.join(' ')}, want 2`);
}
// registry ranks the new envcheck codes crash (they start CRASH_)
for (const c of ['CRASH_OBSTACLE_UNKNOWN', 'CRASH_TERRAIN_LAYERS', 'CRASH_FLAG_CLIPS']) if (registry.severity(c) !== 'crash') fail(`registry: ${c} is ${registry.severity(c)}`);

console.log('cause | code | tool | caught');
for (const r of rows) console.log(r);
for (const k of known) console.log('KNOWN ' + k);
for (const f of fails) console.log('FAIL: ' + f);
if (!fails.length) { fs.rmSync(CR, { recursive: true, force: true }); console.log('crash-test PASS'); }
process.exitCode = fails.length ? 1 : 0;
