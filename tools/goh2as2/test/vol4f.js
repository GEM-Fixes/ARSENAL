// VOL-4F: a file named only behind a ; comment is no reference. Invented fixtures. Seeded defect: the same names live must still refuse, or the check is off, not fixed. run via run.sh.
// Author: Imperator_Aug (ARSENAL, ia-1a26545e)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const FP = require('../fitpass.js');
const root = path.join(__dirname, 'fixture', 'vol4f');
fs.rmSync(root, { recursive: true, force: true });
const put = (rel, data) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data.replace(/\r?\n/g, '\r\n'), 'latin1'); };
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'vol4f: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 500))); if (!good) fail++; };

// ---- fileCheck alone
const check = (dir, mdl) => { put(`${dir}/resource/entity/u/u.mdl`, mdl); return FP.fileCheck({ outDir: path.join(root, dir), mdlKey: 'resource/entity/u/u.mdl', defKey: 'resource/entity/u/u.def', vf: null, implicitAnms: () => [] }).map(m => m.key); };
t('a commented-out ext is not missing', check('a', '{model "u"\n  ;{Extension "/properties/nothere.ext"}\n  ;  {Extension "/properties/nothere_vol.ext"}\n}\n').length === 0);
t('seeded defect: the same ext live is missing', check('b', '{model "u"\n  {Extension "/properties/nothere.ext"}\n}\n').join() === 'resource/properties/nothere.ext');
t('a live name before a trailing comment still counts', check('c', '{Extension "/properties/live.ext"} ; {Extension "/properties/dead.ext"}\n').join() === 'resource/properties/live.ext');
t('a ; inside a string opens no comment', check('d', '{note "a;b"} {Extension "/properties/after.ext"}\n').join() === 'resource/properties/after.ext');
t('an open string ends at its line, so a comment on the next line is one', check('e', '{note "open\n; {Extension "/properties/dead.ext"}\n').length === 0);

// ---- the whole build: goh2as2 --donor, exit code
put('goh/resource/entity/r7/r7.def', '{game_entity\n  {Extension "r7.mdl"}\n}\n');
put('goh/resource/entity/r7/r7.mdl', '{model "r7"\n  ;{Extension "/properties/nowhere.ext"}\n  {bone "basis"}\n}\n');
put('goh/resource/entity/r8/r8.def', '{game_entity\n  {Extension "r8.mdl"}\n}\n');
put('goh/resource/entity/r8/r8.mdl', '{model "r8"\n  {Extension "/properties/nowhere.ext"}\n  {bone "basis"}\n}\n');
put('as2/resource/entity/v7/v7.def', '{game_entity\n  {Extension "v7.mdl"}\n}\n');
put('as2/resource/entity/v7/v7.mdl', '{model "v7"}\n');
const tool = path.join(__dirname, '..', 'goh2as2.js');
const run = (e, o) => cp.spawnSync(process.execPath, [tool, '--goh', path.join(root, 'goh'), '--game', path.join(root, 'as2'), '--exe', 'mowas_2', '--no-keylint', '--no-rc', '--entity', e, '--donor', 'v7', '--rep-key', '--out', path.join(root, o)], { encoding: 'utf8' });
const r7 = run('r7', 'o7'), r8 = run('r8', 'o8');
t('build with the comment exits 0', r7.status === 0, r7.stdout + r7.stderr);
t('seeded defect: build with the live name refuses, ERR_DONOR_FILE_MISSING', r8.status !== 0 && /ERR_DONOR_FILE_MISSING/.test(r8.stdout + r8.stderr), r8.stdout + r8.stderr);
if (fail) { console.log('FAIL vol4f ' + fail); process.exit(1); }
console.log('vol4f: pass');
