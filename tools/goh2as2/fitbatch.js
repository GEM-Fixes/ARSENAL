#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-757ef909)
'use strict';
// fitbatch (XLATE-5): rebuild a list of {rep, donor} units with goh2as2 --donor and the donorfit verdict, concurrent. Same flags as tools/unitmod, no overlay, no mod folder.
//   node tools/goh2as2/fitbatch.js --list units.json --goh DIR --base DIR --game DIR --work DIR [--jobs 4] [--exe as64|mowas_2] [-- extra goh2as2 flags]
// each unit builds to <work>/<rep>; a row of <work>/fitbatch.json per unit: { rep, donor, buildCode, buildLast, fit: PASS|PASS-INCOMPLETE|FAIL|NONE, left: [..donorfit misses after --fit --write] }
// the last line is a tally: "fitbatch: N units, P pass, I pass-incomplete, F fit-fail, B build-fail"
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const argv = process.argv.slice(2), o = { jobs: 4 }, extra = [];
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--') { extra.push(...argv.slice(i + 1)); break; }
  else if (k === '--list') o.list = argv[++i]; else if (k === '--goh') o.goh = argv[++i]; else if (k === '--base') o.base = argv[++i];
  else if (k === '--no-fit') o.noFit = true;   // FXE-2: no donorfit --fit --write after the build: the output is what goh2as2 alone wrote
  else if (k === '--game') o.game = argv[++i]; else if (k === '--work') o.work = argv[++i]; else if (k === '--jobs') o.jobs = +argv[++i]; else if (k === '--exe') o.exe = argv[++i];
  else { console.error('fitbatch: unknown arg ' + k); process.exit(2); }
}
for (const k of ['list', 'goh', 'base', 'game', 'work']) if (!o[k]) { console.error('fitbatch: missing --' + k); process.exit(2); }
const tools = path.resolve(__dirname, '..');
const run = (args, cwd) => new Promise(res => { let out = ''; const p = spawn(process.execPath, args, { cwd }); p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d); p.on('error', e => res({ code: -1, out: String(e) })); p.on('exit', code => res({ code, out })); });
function findDef(root, rep) {
  const want = rep.toLowerCase() + '.def', e = path.join(root, 'resource', 'entity'); let hit = null;
  (function walk(d) { if (hit) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of es) { const f = path.join(d, x.name); if (x.isDirectory()) walk(f); else if (x.name.toLowerCase() === want) { hit = f; return; } } })(e);
  return hit;
}
async function one(u) {
  const out = path.resolve(o.work, u.rep), r = { rep: u.rep, donor: u.donor };
  fs.rmSync(out, { recursive: true, force: true });
  const b = await run([path.join(tools, 'goh2as2', 'goh2as2.js'), '-q', '--goh', o.goh, '--base', o.base, '--game', o.game, ...(o.exe ? ['--exe', o.exe] : []), '--entity', u.rep, '--donor', u.donor,
    '--rep-key', '--pull-props', '--mtl-fallback', '--match-weapon', '--no-keylint', '--no-rc', ...extra, '--out', out], path.dirname(tools));
  r.buildCode = b.code; r.buildLast = b.out.trim().split(/\r?\n/).pop().slice(0, 300);
  // FXE-2: what the build itself left, before any donorfit --fit (a leftover bone-block is an engine fatal at load)
  r.buildLeft = b.out.split(/\r?\n/).filter(l => /WARN_XLATE_FIT_LEFT|ERR_[A-Z_]+|WARN_DONOR_|SEAT_MAP|XLATE_FIT_APPLIED.*bone-block/.test(l) && !/^info:.*XLATE_FIT_APPLIED(?!.*bone-block)/.test(l)).map(l => l.replace(/^.*?(WARN_|ERR_|SEAT_MAP|XLATE_)/, '$1').slice(0, 220));
  const def = b.code === 0 ? findDef(out, u.rep) : null;
  if (!def) { r.fit = 'BUILD_FAIL'; return r; }
  if (o.noFit) { r.fit = r.buildLeft.some(l => /^WARN_XLATE_FIT_LEFT.*(bone-block|LinkBone|door|DF_)/.test(l)) ? 'LEFT' : 'BUILT'; return r; }
  const f = await run([path.join(tools, 'donorfit', 'donorfit.js'), def, '--game', o.game, ...(o.exe ? ['--exe', o.exe] : []), '--moddir', out, '--rep', u.rep, '--fit', '--write', '--in-place'], path.dirname(tools));
  const lines = f.out.trim().split(/\r?\n/), v = /PASS-INCOMPLETE|PASS|FAIL/.exec(lines[lines.length - 1]);
  r.fit = v ? v[0] : 'NONE'; r.left = lines.filter(l => /^MISS /.test(l)).map(l => l.slice(0, 200));
  if (r.fit === 'FAIL' && !r.left.length) r.left = lines.slice(-3);
  return r;
}
(async () => {
  const list = JSON.parse(fs.readFileSync(o.list, 'utf8')).filter(u => u.donor);
  fs.mkdirSync(o.work, { recursive: true });
  const rows = []; let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, o.jobs) }, async () => { while (next < list.length) { const u = list[next++]; const r = await one(u); rows.push(r); console.log(`${r.fit.padEnd(15)} ${u.rep} (donor ${u.donor})${r.left && r.left.length ? ' ' + r.left.length + ' left: ' + r.left[0] : ''}`); } }));
  rows.sort((a, b) => a.rep.localeCompare(b.rep));
  fs.writeFileSync(path.join(o.work, 'fitbatch.json'), JSON.stringify(rows, null, 1));
  const n = k => rows.filter(r => r.fit === k).length;
  console.log(`fitbatch: ${rows.length} units, ${n('PASS')} pass, ${n('PASS-INCOMPLETE')} pass-incomplete, ${rows.filter(r => r.fit === 'FAIL' || r.fit === 'NONE').length} fit-fail, ${n('BUILD_FAIL')} build-fail`);
})();
