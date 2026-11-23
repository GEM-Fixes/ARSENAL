// T-PATCH: patch-entity compares against the EFFECTIVE file (mod copy first), writes the mod copy. Deterministic, no game.
// Author: Imperator_Aug (ARSENAL, ia-b21db446)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const fx = path.join(__dirname, 'fixture'), G = path.join(fx, 'game'), M = path.join(fx, 'mod');
const tool = path.join(__dirname, '..', 'patch-entity.js');
const rel = 'resource/entity/vehicle/tank/t1/t1.def';
const modf = path.join(M, rel), vanf = path.join(G, rel);
const run = (...a) => { const r = cp.spawnSync(process.execPath, [tool, M, '--game', G, '--entity', 't1', ...a], { encoding: 'utf8' }); return { st: r.status, out: r.stdout + r.stderr }; };
let bad = 0;
const ck = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } };
const rd = f => fs.readFileSync(f);
const van = rd(vanf), start = rd(modf);
const want = s => Buffer.from(s.join('\r\n') + '\r\n', 'latin1');

// GOLD: shadowed def, set to a new value -> mod copy byte-equal to expected; vanilla untouched
let r = run('--set', 'game_entity/mass=6000');
ck(r.st === 0 && Buffer.compare(rd(modf), want(['{game_entity', '\t{mass 6000}', '\t{name "t1"}', '}'])) === 0, 'gold set ' + r.out);
ck(Buffer.compare(rd(vanf), van) === 0, 'vanilla changed');

// RT: set X, then back to the original (5000) -> byte-equal to the start; CRLF kept
fs.writeFileSync(modf, start);
r = run('--set', 'game_entity/mass=7000');
ck(r.st === 0 && /\{mass 7000\}/.test(rd(modf).toString('latin1')), 'rt step1 ' + r.out);
r = run('--set', 'game_entity/mass=5000');
ck(r.st === 0 && Buffer.compare(rd(modf), start) === 0, 'rt back ' + r.out);
ck(!/[^\r]\n/.test(rd(modf).toString('latin1')), 'rt CRLF lost');

// set to the vanilla value while the mod holds another: must write (the reported bug)
r = run('--set', 'game_entity/mass=4000');
ck(r.st === 0 && /PATCH_WROTE/.test(r.out) && /\{mass 4000\}/.test(rd(modf).toString('latin1')), 'set to vanilla value ' + r.out);

// no change: mod value already equals X -> PATCH_NO_CHANGE, nothing written (bytes and mtime)
fs.writeFileSync(modf, start);
const t0 = fs.statSync(modf).mtimeMs;
r = run('--set', 'game_entity/mass=5000');
ck(/PATCH_NO_CHANGE/.test(r.out) && !/PATCH_WROTE/.test(r.out) && Buffer.compare(rd(modf), start) === 0 && fs.statSync(modf).mtimeMs === t0, 'no change ' + r.out);

// GOLD: bare key -> PATCH_KEY_MISSING with a hint naming the root block
r = run('--set', 'mass=1');
ck(r.st === 1 && /PATCH_KEY_MISSING/.test(r.out) && /did you mean game_entity\/mass/.test(r.out), 'bare key ' + r.out);
ck(Buffer.compare(rd(modf), start) === 0, 'bare key wrote');

console.log(bad ? 'shadow FAIL' : 'shadow ok'); process.exit(bad ? 1 : 0);
