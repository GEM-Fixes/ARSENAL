#!/usr/bin/env node
// Author: Imperator_Aug (ARSENAL, ia-bb3f615c)
'use strict';
// cov.js: edrun report.json folders -> coverage table rows for (COV-1).
// Reads only. Usage:
//   node tools/edrun/cov.js [--reps FILE] [--groups FILE] [--vs V,L|none] [--sessions DIR] FOLDER...
// FOLDER holds report.json, or is a parent whose direct subfolders do.
// --groups FILE: JSON {"stem":"group"} or lines "stem group" (overrides built-in map and reps file).
// --reps FILE: markdown with rep tables (default [gun and infantry reps].
const fs = require('fs'), path = require('path');

const GROUPS_ORDER = ['tank_medium', 'tank_heavy', 'tank_light', 'btr', 'car', 'cannon', 'cannon_mgun', 'mortar', 'squad'];
// Built-in vehicle/gun stem -> group, and b2-edrun.md [I: su76 is tank_medium in b2, tank_light in b4; b4 used].
const BUILTIN = {};
for (const [g, l] of Object.entries({
  tank_medium: 'pz3 pz3m achilles jagdpanther su100 m4a3m hummel ostwind m36 ho-i ho_i t34_0 m4a3_75 chi-ha57 m4a4 pz3_ger2',
  tank_heavy: 'elefant is2 kv1_40 jagdpanzer_iv',
  tank_light: 'bt7a su76 ft17_fin pz2l',
  btr: 'ba11 sdkfz234 sdkfz222 m8grayhound',
  car: 'bedford willysmb blitz3_6 r12 gaz67b',
  cannon: 'pak40 120mm_l50 20mm_flak30 flak38_wheeled zis2 zis3 qf6 pak57 m3cannon m1_57mm',
  cannon_mgun: 'mg42_stan dshk_stan degtyarev_stan vickers_stan mg34_stan',
  mortar: 'sgrw42 type94 m1mortar',
})) for (const s of l.split(' ')) BUILTIN[s] = g;

const stemOf = (s) => String(s || '').replace(/:human$/, '').replace(/\([^)]*\)$/, '');
const isHuman = (s) => /:human$/.test(s) || /\([^)]*\)/.test(s);

function loadReps(file) {
  const m = {};
  if (!file || !fs.existsSync(file)) return m;
  let sec = '';
  for (const ln of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^##/.test(ln)) { sec = ln.toLowerCase(); continue; }
    const c = ln.split('|').map((x) => x.trim());
    if (c.length < 5 || !/^\d+$/.test(c[1])) continue;
    const stem = stemOf(c[2]), desc = c.slice(3).join(' ').toLowerCase();
    let g;
    if (sec.includes('infantry')) g = 'squad';
    else if (desc.includes('cannon_mgun')) g = 'cannon_mgun';
    else if (desc.includes('mortar')) g = 'mortar';
    else if (desc.includes('cannon')) g = 'cannon';
    if (g) m[stem] = g;
  }
  return m;
}
function loadGroups(file) {
  const m = {};
  const t = fs.readFileSync(file, 'utf8');
  if (/^\s*\{/.test(t)) return JSON.parse(t);
  for (const ln of t.split(/\r?\n/)) { const w = ln.trim().split(/\s+/); if (w.length >= 2) m[stemOf(w[0])] = w[1]; }
  return m;
}

function groupOf(map, raw, cls) {
  const s = stemOf(raw);
  if (map[s]) return map[s];
  if (isHuman(raw) || cls === 'human' || cls === 'infantry' || cls === 'squad') return 'squad';
  return null;
}

// Find report.json dirs: folder itself, else direct subfolders.
function findReports(folders) {
  const out = [];
  for (const f of folders) {
    if (fs.existsSync(path.join(f, 'report.json'))) { out.push(f); continue; }
    if (!fs.existsSync(f)) { out.push({ missing: f }); continue; }
    for (const d of fs.readdirSync(f).sort()) {
      const p = path.join(f, d);
      if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'report.json'))) out.push(p);
    }
  }
  return out;
}

const isCtl = (p) => /^(ctl|control)/i.test(p.name);

// Judge one report: returns {valid, why, items:[{kind,group,stem,pass,armed,verdict}]}
function judge(rep, map) {
  const games = rep.games || [];
  const pairs = rep.pairs || [];
  const ctls = pairs.filter(isCtl);
  const res = { valid: true, why: '', items: [], unknown: [] };
  if (!ctls.length) { res.valid = false; res.why = 'no control'; return res; }
  // edrun marks controls and judges each game (void only if all its controls missed); older reports: any failed control voids
  const judged = games.some((g) => g.controls && g.controls.length);
  if (judged ? games.some((g) => g.void) : ctls.some((c) => c.verdict !== 'PASS')) {
    res.valid = false; res.why = 'control ' + ctls.map((c) => c.verdict).join(','); return res;
  }
  if (games.length > 1 && !pairs.some((p) => p.game != null)) {
    res.warn = 'several games, pairs carry no game index: one control judges all';
  }
  const ctlShooter = ctls[0].shooter;
  const marks = Object.assign({}, ...games.map((g) => g.marks || {}));
  const anyArm = Object.keys(marks).some((k) => / arm$/.test(k));
  for (const p of pairs) {
    if (isCtl(p)) continue;
    const dmgIn = p.shooter === ctlShooter;
    const subj = dmgIn ? p.foe : p.shooter;
    const armed = anyArm ? (p.name + ' arm') in marks : (p.order != null || p.kill != null || !!p.verdict);
    const grp = groupOf(map, subj, p.class);
    if (!grp) { res.unknown.push(stemOf(subj)); }
    res.items.push({ kind: dmgIn ? 'in' : 'out', group: grp || '?', stem: stemOf(subj), armed, pass: p.verdict === 'PASS', verdict: p.verdict });
  }
  return res;
}

function build(folders, opt) {
  opt = opt || {};
  const map = Object.assign({}, BUILTIN, loadReps(opt.reps), opt.groups ? loadGroups(opt.groups) : {});
  const root = opt.sessions ? path.resolve(opt.sessions) : null;
  const label = (d) => {
    const a = path.resolve(d);
    if (root && a.startsWith(root + path.sep)) return a.slice(root.length + 1).split(path.sep).join('/');
    return path.basename(path.dirname(a)) + '/' + path.basename(a);
  };
  const cells = {}, void_ = [], notes = [], unknown = new Set(), fails = {};
  const cell = (g, col) => (cells[g] = cells[g] || {})[col] = (cells[g][col] || { ok: 0, n: 0, dirs: new Set() });
  for (const d of findReports(folders)) {
    if (d.missing) { void_.push(label(d.missing) + ': folder missing'); continue; }
    let rep;
    try { rep = JSON.parse(fs.readFileSync(path.join(d, 'report.json'), 'utf8')); }
    catch (e) { void_.push(label(d) + ': unreadable report.json'); continue; }
    const j = judge(rep, map);
    if (!j.valid) { void_.push(label(d) + ': ' + j.why); continue; }
    if (j.warn) notes.push(label(d) + ': ' + j.warn);
    j.unknown.forEach((u) => unknown.add(u));
    for (const it of j.items) {
      const sp = cell(it.group, 'spawn');
      sp.n++; if (it.armed) sp.ok++; sp.dirs.add(label(d));
      if (!it.armed) continue; // fire/damage only for armed pairs
      const c = cell(it.group, it.kind === 'out' ? 'fire' : 'dmg');
      c.n++; if (it.pass) c.ok++; c.dirs.add(label(d));
      if (!it.pass) (fails[it.group] = fails[it.group] || []).push(it.stem + ' ' + (it.kind === 'out' ? 'out' : 'in') + ' ' + it.verdict + ' (' + label(d) + ')');
    }
  }
  return { cells, void: void_, notes, unknown: [...unknown], fails, map };
}

const fmt = (c) => (c ? c.ok + '/' + c.n + ' ' + [...c.dirs].join(',') : '-');
function render(r) {
  const gs = Object.keys(r.cells).sort((a, b) => {
    const ia = GROUPS_ORDER.indexOf(a), ib = GROUPS_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const L = ['| group | spawn | move | fire-out | damage-in | runs |', '|---|---|---|---|---|---|'];
  for (const g of gs) {
    const c = r.cells[g];
    const dirs = new Set(); for (const k of Object.keys(c)) c[k].dirs.forEach((x) => dirs.add(x));
    const sp = c.spawn ? c.spawn.ok + '/' + c.spawn.n : '-';
    L.push('| ' + g + ' | ' + sp + ' | - | ' + fmt(c.fire) + ' | ' + fmt(c.dmg) + ' | ' + [...dirs].join(', ') + ' |');
  }
  return L.join('\n');
}

// Parse PLAN V / L tables: {group:{spawn:[ok,n],fire:[..],dmg:[..]}}
function planTable(planText, letter) {
  const lines = planText.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('**' + letter + ' '));
  const out = {};
  if (start < 0) return out;
  let seen = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('|')) { if (seen) break; continue; }
    seen = true;
    const c = l.split('|').map((x) => x.trim());
    if (!c[1] || c[1] === 'group' || /^-+$/.test(c[1])) continue;
    const g = c[1].replace(/ \(.*$/, '');
    const f = (s) => { const m = /^(\d+)\/(\d+)/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };
    out[g] = { spawn: f(c[2]), fire: f(c[4]), dmg: f(c[5]) };
  }
  return out;
}
function diff(r, planText, letters) {
  const out = [];
  const names = { spawn: 'spawn', fire: 'fire-out', dmg: 'damage-in' };
  for (const L of letters) {
    const t = planTable(planText, L);
    if (!Object.keys(t).length) { out.push(L + ': table not found in PLAN'); continue; }
    for (const g of new Set([...Object.keys(t), ...Object.keys(r.cells)])) {
      for (const k of ['spawn', 'fire', 'dmg']) {
        const mine = r.cells[g] && r.cells[g][k] ? [r.cells[g][k].ok, r.cells[g][k].n] : null;
        const pl = t[g] ? t[g][k] : null;
        if (!mine && !pl) continue;
        if (mine && pl && mine[0] === pl[0] && mine[1] === pl[1]) continue;
        out.push(L + ' ' + g + ' ' + names[k] + ': mine ' + (mine ? mine.join('/') : '-') + ', PLAN ' + (pl ? pl.join('/') : '-'));
      }
    }
  }
  return out;
}

function main(argv) {
  const opt = { reps: path.join(__dirname, '..', '..', 'plan', 'reports', 'reps-b7.md'), vs: 'V,L' };
  const folders = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reps') opt.reps = argv[++i];
    else if (a === '--groups') opt.groups = argv[++i];
    else if (a === '--vs') opt.vs = argv[++i];
    else if (a === '--sessions') opt.sessions = argv[++i];
    else folders.push(a);
  }
  if (!folders.length) { console.error('usage: cov.js [--reps F] [--groups F] [--vs V,L|none] [--sessions DIR] FOLDER...'); return 2; }
  if (!opt.sessions) opt.sessions = path.join(__dirname, '..', '..', '..', 'run', 'sessions');
  const r = build(folders, opt);
  console.log(render(r));
  console.log('\nVoid games (add nothing): ' + (r.void.length ? '' : 'none'));
  r.void.forEach((v) => console.log('  ' + v));
  Object.keys(r.fails).forEach((g) => console.log('Not passed, ' + g + ': ' + r.fails[g].join('; ')));
  if (r.unknown.length) console.log('Unknown stem, group "?": ' + r.unknown.join(', ') + ' (give --groups)');
  r.notes.forEach((n) => console.log('Note: ' + n));
  if (opt.vs !== 'none') {
    const plan = path.join(__dirname, '..', '..', 'plan', 'PLAN.md');
    console.log('\nDifferences from PLAN ' + opt.vs + ' (only cells where either side has data):');
    const d = diff(r, fs.readFileSync(plan, 'utf8'), opt.vs.split(','));
    console.log(d.length ? d.map((x) => '  ' + x).join('\n') : '  none');
  }
  return 0;
}

module.exports = { build, render, judge, planTable, diff, groupOf, loadReps, BUILTIN };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
