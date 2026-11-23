#!/usr/bin/env node
// install: copy scenario fixture mods into <game>/mods/. DRY by default (prints the plan); copies only with --write.
//   node tools/testrun/scenarios/install.js --game <dir> [--scenario a.json,b.json] [--write] [--force]
// scenario json fields used: fixture:[folder names under scenarios/mods/], prepare:[{argv:[..]}]
//   fixture dir entries named `<x>.zipsrc/` are zipped (lib/zipwrite) into `<x>` in the mod (resource.pak, 1.pat)
//   prepare argv: run after the copy, cwd = src dir, tokens {game} {mods} (= <game>/mods); a leading `node` runs this node
//   --overlay (with --as): all fixtures of all listed scenarios go into the first --as folder; the first one's mod.info stands (testrun --overlap)
//   --as <folder>[,folder2..]: stage fixture i of the chosen scenario into <game>/mods/<folder i> (test mod folders from tools/lib/testfolders.js: e2e_test..e2e_test8; testrun checks the list, this script does not; e.g.
//     e2e_test) instead of its own name; testrun --stage-as uses it and rewrites the scenario's mods list to match
// never touches anything outside <game>/mods/<fixture folder, or its --as folder>; an existing folder is refused unless --force (then replaced)
// Author: Imperator_Aug (ARSENAL, ia-e5b29a80)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const HERE = __dirname, SRC = path.resolve(HERE, '..', '..', '..');
const zipwrite = require('../../lib/zipwrite');

function loadScenarios(only) {
  const files = (only && only.length ? only : fs.readdirSync(HERE).filter(f => /\.json$/i.test(f))).map(f => (path.isAbsolute(f) || fs.existsSync(f) ? f : path.join(HERE, f)));
  return files.map(f => ({ file: f, sc: JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) }));
}

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// one fixture folder -> [{op:'copy', from, to} | {op:'zip', dir, to}]
// fixture dir: beside the scenario file first (batch drafts), then scenarios/mods
function fixtureOps(name, dest, file) {
  const root = [file && path.join(path.dirname(file), 'mods', name), path.join(HERE, 'mods', name)].filter(Boolean).find(p => fs.existsSync(p)), ops = [];
  if (!root) return { ops, err: 'fixture mod missing: scenarios/mods/' + name };
  const top = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory() && /\.zipsrc$/.test(e.name)) ops.push({ op: 'zip', dir: path.join(dir, e.name), to: path.join(dest, r.replace(/\.zipsrc$/, '')) });
      else if (e.isDirectory()) top(path.join(dir, e.name), r);
      else ops.push({ op: 'copy', from: path.join(dir, e.name), to: path.join(dest, r) });
    }
  };
  top(root, '');
  return { ops };
}

function plan(game, list, as, overlay) {
  const out = [], errs = [], seen = new Set(), al = as ? as.split(',').filter(Boolean) : null;
  for (const { file, sc } of list) {
    for (const name of sc.fixture || []) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (al && !overlay && seen.size > al.length) { errs.push(path.basename(file) + ': --as names ' + al.length + ' folder(s), scenario set has more fixtures'); continue; }
      const dest = path.join(game, 'mods', al ? al[overlay ? 0 : seen.size - 1] : name), r = fixtureOps(name, dest, file);
      if (overlay && seen.size > 1) r.ops = r.ops.filter(op => path.relative(dest, op.to).toLowerCase() !== 'mod.info');
      if (r.err) errs.push(path.basename(file) + ': ' + r.err);
      out.push({ scenario: path.basename(file), name, dest, ops: r.ops });
    }
  }
  // under --as a prepare step follows the fixture ({mods}/<fixture>, --mods <fixture>), else it writes an unapproved <game>/mods/<fixture>
  const folderOf = new Map(al ? out.map((m, i) => [m.name, al[overlay ? 0 : i]]) : []);
  const reFolder = a => a.replace(/^\{mods\}\/([^/]+)/, (m, n) => '{mods}/' + (folderOf.get(n) || n));
  const reList = a => a.split(',').map(n => folderOf.get(n) || n).join(',');
  const prep = [];
  for (const { file, sc } of list) for (const p of sc.prepare || []) prep.push({ scenario: path.basename(file), argv: p.argv.map((a, i) => (p.argv[i - 1] === '--mods' ? reList(a) : reFolder(a)).replace(/\{game\}/g, game).replace(/\{mods\}/g, path.join(game, 'mods'))) });
  return { out, prep, errs };
}

function main(argv) {
  const o = { write: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--game') o.game = argv[++i]; else if (argv[i] === '--write') o.write = true; else if (argv[i] === '--force') o.force = true; else if (argv[i] === '--as') o.as = argv[++i]; else if (argv[i] === '--overlay') o.overlay = true;
    else if (argv[i] === '--scenario') o.only = (argv[++i] || '').split(',').filter(Boolean); else { console.error('unknown arg ' + argv[i]); return 2; }
  }
  if (!o.game) { console.error('usage: install.js --game <dir> [--scenario a.json,b.json] [--as folder] [--write] [--force]'); return 2; }
  const game = path.resolve(o.game), p = plan(game, loadScenarios(o.only), o.as, o.overlay);
  console.log(o.write ? 'install (WRITE)' : 'install plan (dry: nothing written; add --write)');
  for (const e of p.errs) console.log('ERROR ' + e);
  for (const m of p.out) {
    const exists = fs.existsSync(m.dest);
    console.log(`mod ${m.name} -> ${m.dest}  [${m.scenario}]${exists ? (o.force ? '  (exists: replaced)' : '  (EXISTS: refused without --force)') : ''}`);
    for (const op of m.ops) console.log(`   ${op.op} ${path.relative(HERE, op.from || op.dir).replace(/\\/g, '/')} -> ${path.relative(game, op.to).replace(/\\/g, '/')}`);
  }
  for (const q of p.prep) console.log(`prepare [${q.scenario}] ${q.argv.join(' ')}`);
  if (p.errs.length) return 1;
  if (!o.write) return 0;
  const cleared = new Set();
  for (const m of p.out) {
    if (fs.existsSync(m.dest) && !cleared.has(m.dest)) { if (!o.force) { console.error('refused: ' + m.dest + ' exists (--force)'); return 1; } fs.rmSync(m.dest, { recursive: true, force: true }); }
    cleared.add(m.dest);
    for (const op of m.ops) {
      fs.mkdirSync(path.dirname(op.to), { recursive: true });
      if (op.op === 'copy') fs.copyFileSync(op.from, op.to);
      else zipwrite.writeZip(op.to, walk(op.dir).map(f => [path.relative(op.dir, f).replace(/\\/g, '/'), fs.readFileSync(f), true]));
    }
  }
  for (const q of p.prep) {
    const [cmd, ...args] = q.argv;
    const r = cp.spawnSync(cmd === 'node' ? process.execPath : cmd, args, { cwd: SRC, stdio: 'inherit' });
    if (r.status !== 0) { console.error('prepare failed: ' + q.argv.join(' ')); return 1; }
  }
  return 0;
}

module.exports = { loadScenarios, plan, fixtureOps, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
