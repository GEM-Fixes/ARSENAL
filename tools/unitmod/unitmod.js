#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-a980ce22)
'use strict';
// unitmod: build a list of GoH units (goh2as2 --donor, then donorfit --fit) and overlay them into ONE mod folder.
//   node tools/unitmod/unitmod.js --list pick.json --goh DIR --base H --game G --work DIR --mod DIR
//        [--tools DIR] [--jobs 4] [--limit N] [--no-overlay] [--max-mb 3000] [--exe as64|mowas_2|mowas2]
// --exe: the AS2 build, passed to goh2as2 and donorfit; mod.info range of that build (mowas_2: 3.262.0..3.262.1; default: as64.exe
//   in --game -> 3.301 as before, else the mowas_2 range). --exe goh is refused (exit 2: GoH is the source).
// list rows: {rep, class, donor}. Each unit builds to <work>/<class>/<rep>, outside the game: goh2as2 refuses --out inside an
// install, so the overlay is a separate copy. A failed unit is a result, listed in <work>/build.json, not a stop.
// Overlay: first writer keeps a path; a later unit with different bytes is listed as a conflict, never overwritten.
// Why: SWEEP-0A/B (w67) stopped on one build call per unit and no way into G/mods.
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parse(argv) {
  const o = { jobs: 4, maxMb: 3000, tools: path.resolve(__dirname, '..') };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--no-overlay') o.noOverlay = true;
    else if (k === '--list') o.list = argv[++i];
    else if (k === '--goh') o.goh = argv[++i];
    else if (k === '--base') o.base = argv[++i];
    else if (k === '--game') o.game = argv[++i];
    else if (k === '--work') o.work = argv[++i];
    else if (k === '--mod') o.mod = argv[++i];
    else if (k === '--tools') o.tools = path.resolve(argv[++i]);
    else if (k === '--jobs') o.jobs = +argv[++i];
    else if (k === '--limit') o.limit = +argv[++i];
    else if (k === '--max-mb') o.maxMb = +argv[++i];
    else if (k === '--exe') o.exe = require('../goh2as2/target').exeArg('unitmod', argv[++i]);
    else throw new Error('unknown arg ' + k);
  }
  return o;
}

function run(cmd, args, cwd) {
  return new Promise(res => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    p.on('error', e => res({ code: -1, out: String(e) }));
    p.on('exit', code => res({ code, out }));
  });
}

function walk(dir, base = dir, acc = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f, base, acc); else acc.push(path.relative(base, f).replace(/\\/g, '/'));
  }
  return acc;
}

function findDef(root, rep) {
  const want = rep.toLowerCase() + '.def';
  const e = path.join(root, 'resource', 'entity');
  if (!fs.existsSync(e)) return null;
  return walk(e).map(f => path.join(e, f)).find(f => path.basename(f).toLowerCase() === want) || null;
}

// the two child argument lists; --exe goes on only when given (the AS64 lists stay as they were)
const exeFlag = o => require('../goh2as2/target').exeFlag(o.exe);
const buildArgs = (u, o, out) => [path.join(o.tools, 'goh2as2', 'goh2as2.js'), '-q', '--goh', o.goh, '--base', o.base, '--game', o.game, ...exeFlag(o), '--entity', u.rep, '--donor', u.donor,
  '--rep-key', '--pull-props', '--mtl-fallback', '--match-weapon', '--out', out];
const fitArgs = (u, o, out, def) => [path.join(o.tools, 'donorfit', 'donorfit.js'), def, '--game', o.game, ...exeFlag(o), '--moddir', out, '--rep', u.rep, '--fit', '--write', '--in-place'];

async function buildOne(u, o) {
  const out = path.resolve(o.work, u.class, u.rep);
  const r = { rep: u.rep, class: u.class, donor: u.donor, out };
  const b = await run(process.execPath, buildArgs(u, o, out), path.dirname(o.tools));
  r.buildCode = b.code; r.buildTail = b.out.trim().split(/\r?\n/).slice(-3).join(' | ').slice(0, 400);
  const def = b.code === 0 ? findDef(out, u.rep) : null;
  if (!def) { r.status = 'BUILD_FAIL'; return r; }
  const f = await run(process.execPath, fitArgs(u, o, out, def), path.dirname(o.tools));
  r.fitCode = f.code;
  const verdict = /PASS-INCOMPLETE|PASS|FAIL/.exec(f.out.trim().split(/\r?\n/).pop());
  r.fit = verdict ? verdict[0] : 'NONE';
  r.fitTail = f.out.trim().split(/\r?\n/).slice(-2).join(' | ').slice(0, 300);
  r.status = r.fit === 'PASS' || r.fit === 'PASS-INCOMPLETE' ? r.fit : 'FIT_FAIL';
  return r;
}

// overlay one built folder into mod; returns {copied, same, conflicts, bytes}
function overlay(from, mod) {
  const res = { copied: 0, same: 0, conflicts: [], bytes: 0 };
  const root = path.join(from, 'resource');
  if (!fs.existsSync(root)) return res;
  for (const rel of walk(root)) {
    const s = path.join(root, rel), t = path.join(mod, 'resource', rel);
    if (fs.existsSync(t)) {
      if (fs.readFileSync(s).equals(fs.readFileSync(t))) res.same++; else res.conflicts.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.copyFileSync(s, t);
    res.copied++; res.bytes += fs.statSync(t).size;
  }
  return res;
}

// target 'as64' (default, MinGameVersion 3.301, as before) | 'mowas2' (3.262.0..3.262.1): goh2as2/target.js
function writeModInfo(mod, target) {
  const f = path.join(mod, 'mod.info');
  if (fs.existsSync(f)) return;
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(f, ['{Mod', ` {Name "${path.basename(mod)}"}`, ...require('../goh2as2/target').modInfoLines(target || 'as64'), '}', ''].join('\r\n'), 'latin1');
}

async function main() {
  const o = parse(process.argv.slice(2));
  for (const k of ['list', 'goh', 'base', 'game', 'work', 'mod']) if (!o[k]) { console.error('missing --' + k); process.exit(2); }
  const modAbs = path.resolve(o.mod);
  if (!/[\\/]mods[\\/][^\\/]+$/.test(modAbs)) { console.error('--mod must be a folder directly under a mods folder'); process.exit(2); }
  let list = JSON.parse(fs.readFileSync(o.list, 'utf8')).filter(u => u.donor);
  if (o.limit) list = list.slice(0, o.limit);
  fs.mkdirSync(o.work, { recursive: true });
  const rows = []; let next = 0;
  const save = () => fs.writeFileSync(path.join(o.work, 'build.json'), JSON.stringify(rows, null, 1));
  await Promise.all(Array.from({ length: o.jobs }, async () => {
    while (next < list.length) {
      const u = list[next++];
      const r = await buildOne(u, o);
      rows.push(r); save();
      console.log(`${rows.length}/${list.length} ${r.rep} ${r.status}`);
    }
  }));
  const tally = {}; for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1;
  console.log('built', JSON.stringify(tally));
  if (!o.noOverlay) {
    writeModInfo(modAbs, require('../goh2as2/target').targetOf(o.exe, o.game));
    const sum = { copied: 0, same: 0, conflicts: [], bytes: 0 };
    for (const r of rows.filter(x => x.status === 'PASS' || x.status === 'PASS-INCOMPLETE')) {
      if (sum.bytes > o.maxMb * 1048576) { r.overlay = 'OVER_SIZE'; continue; }
      const x = overlay(r.out, modAbs);
      r.overlay = 'ok'; r.conflicts = x.conflicts;
      sum.copied += x.copied; sum.same += x.same; sum.bytes += x.bytes; sum.conflicts.push(...x.conflicts.map(c => r.rep + ':' + c));
    }
    save();
    fs.writeFileSync(path.join(o.work, 'overlay.json'), JSON.stringify(sum, null, 1));
    console.log(`overlay copied ${sum.copied} same ${sum.same} conflicts ${sum.conflicts.length} ${(sum.bytes / 1048576).toFixed(0)} MiB`);
  }
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { overlay, findDef, writeModInfo, parse, buildArgs, fitArgs };
