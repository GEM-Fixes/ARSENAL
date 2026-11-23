#!/usr/bin/env node
// overlap: which queue scenarios can share one game launch. used by testrun --overlap and batch plan.
// usage: node tools/testrun/overlap.js <dir|a.json,b.json> [--json]
// A launch is shared when: same mode/params/players/other mods; at most one member changes game state (it goes last);
// fixtures overlay into one stage folder with no path collision. Any FAIL in a shared launch is re-run alone by the queue,
// so a verdict never rests on another test's fixture. Launches run side by side up to workers and stage folders (no fixture = no folder).
// Author: Imperator_Aug (ARSENAL, ia-e8f54344)
const fs = require('fs'), path = require('path');

const HERE = path.join(__dirname, 'scenarios');
// commands that only read: anything else counts as changing game state
const READONLY = /^(exec\b|mp_maps\b|mp_status\b|mp_state\b|mp_slots\b|mp_userUnits\b|mp_checkCompetitive\b|mp_checkCaptureFlag\b|mod_list\b)/;
// fixture paths every member would feel: multiplayer rules, bot script
const GLOBAL_PATH = /^resource\/(set\/multiplayer|script\/multiplayer)\//i;
const EXC = '***** Exception *****';

const walk = (d, r = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  const p = r ? r + '/' + e.name : e.name;
  if (/\.zipsrc$/.test(e.name)) return [p.replace(/\.zipsrc$/, '')];
  return e.isDirectory() ? walk(path.join(d, e.name), p) : [p];
});
function fixtureRoot(name, file) {
  return [file && path.join(path.dirname(file), 'mods', name), path.join(HERE, 'mods', name)].filter(Boolean).find(p => fs.existsSync(p)) || null;
}
const regexOf = s => { try { return new RegExp(s); } catch { return null; } };
const literal = s => String(s).replace(/\\([^A-Za-z0-9])/g, '$1');

// scenario -> what it touches. solo = reason it cannot share a launch
function footprint(sc, file) {
  const fp = { name: sc.name || path.basename(file || '', '.json'), solo: null, stateful: false, fixture: sc.fixture || [], files: [], version: null, pos: [], neg: [] };
  const solo = why => { fp.solo = fp.solo || why; };
  const verdict = sc.verdict || [], steps = sc.steps || [];
  if (sc.manual) solo('manual');
  if (sc.overlap === false) solo('overlap:false');
  if (sc.prepare) solo('prepare step edits its fixture');
  if (verdict.some(v => v.exit !== undefined)) solo('checks process exit');
  if (verdict.some(v => v.event !== undefined)) solo('checks a pipe event');
  for (const v of verdict) if (v.log !== undefined) (v.want === false ? fp.neg : fp.pos).push(v.log);
  if (fp.pos.some(p => { const r = regexOf(p); return r && r.test(EXC); })) solo('expects an exception');
  for (const st of steps) {
    if (st.cmd !== undefined && /^(q|quit|exit)\b/.test(st.cmd)) solo('quits the game');
    if (st.cmd !== undefined && !READONLY.test(st.cmd)) fp.stateful = true;
    if (typeof st.wait === 'string' || st.wait_stage) fp.stateful = true;
  }
  if (fp.fixture.length > 1) solo(`needs ${fp.fixture.length} mod folders in order`);
  if ((sc.mods || []).some(m => /:[1-9]\d*$/.test(m))) solo('patch count on its mod');
  for (const name of fp.fixture) {
    const root = fixtureRoot(name, file);
    if (!root) { solo('fixture not found: ' + name); continue; }
    const files = walk(root);
    if (files.some(f => /^\d+\.pat$/i.test(f))) solo('ships a patch');
    const g = files.find(f => GLOBAL_PATH.test(f));
    if (g) solo('global file ' + g);
    const mi = path.join(root, 'mod.info');
    if (fs.existsSync(mi)) {
      const t = fs.readFileSync(mi, 'latin1');
      const keys = [...t.matchAll(/(?:^|\{)\s*([A-Za-z_]\w*)/gm)].map(m => m[1].toLowerCase()).filter(k => k !== 'mod');
      if (keys.some(k => k !== 'name' && k !== 'mingameversion')) solo('mod.info has more than Name and MinGameVersion');
      fp.version = (/MinGameVersion\s+"?([^"\s}]*)/i.exec(t) || [])[1] || null;
    }
    fp.files.push(...files.filter(f => f.toLowerCase() !== 'mod.info').map(f => f.toLowerCase()));
  }
  return fp;
}
function keyOf(sc) {
  const fx = sc.fixture || [], params = Object.assign({}, sc.params, sc.mission ? { mission: sc.mission } : {}, sc.map ? { map: sc.map } : {});
  const sorted = Object.keys(params).sort().map(k => [k, params[k]]);
  const g = sc.game && sc.game !== 'as64' ? [sc.game] : [];   // scenarios of different games never share a launch
  return JSON.stringify([sc.mode || 'menu', (sc.mods || []).filter(m => !fx.includes(m.replace(/:\d+$/, ''))), sorted, sc.players || null, ...g]);
}
// why fp cannot join group g, or null
function conflict(g, fp) {
  if (fp.stateful && g.fps.some(x => x.stateful)) return 'two members change game state';
  if (fp.fixture.length) {
    if (g.version && fp.version && g.version !== fp.version) return 'different MinGameVersion';
    const clash = fp.files.find(f => g.files.has(f));
    if (clash) return 'both ship ' + clash;
  }
  for (const x of g.fps) {
    if (x.pos.some(p => fp.pos.includes(p))) return "same positive log check: one could pass on the other's output";
    for (const [a, b] of [[x, fp], [fp, x]]) for (const n of a.neg) {
      const r = regexOf(n);
      if (r && b.pos.some(p => r.test(literal(p)))) return `${b.name} logs what ${a.name} forbids`;
    }
  }
  return null;
}
// items [{name, file, sc}] -> groups [{key, items, overlap, need, solo}]; input order kept, a state-changing member last
function plan(items) {
  const groups = [], blocked = [];
  for (const it of items) {
    const fp = footprint(it.sc, it.file), key = keyOf(it.sc), entry = { it, fp };
    const fresh = solo => ({ key, entries: [entry], fps: [fp], files: new Set(fp.files), version: fp.version, solo });
    if (fp.solo) { groups.push(fresh(fp.solo)); continue; }
    let home = null;
    for (const g of groups.filter(x => !x.solo && x.key === key)) {
      const c = conflict(g, fp);
      if (!c) { home = g; break; }
      blocked.push({ a: g.entries[0].it.name, b: it.name, why: c });
    }
    if (!home) { groups.push(fresh(null)); continue; }
    home.entries.push(entry); home.fps.push(fp);
    fp.files.forEach(f => home.files.add(f));
    home.version = home.version || fp.version;
  }
  const out = groups.map(g => {
    const es = [...g.entries.filter(e => !e.fp.stateful), ...g.entries.filter(e => e.fp.stateful)], n = es.length;
    const fixtures = es.flatMap(e => e.fp.fixture);
    return { key: g.key, items: es.map(e => e.it), overlap: n > 1, need: n > 1 ? (fixtures.length ? 1 : 0) : fixtures.length, solo: g.solo };
  });
  out.blocked = blocked;
  return out;
}

function loadFiles(spec) {
  const files = [];
  for (const p of spec.split(',').filter(Boolean)) {
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) if (/\.json$/i.test(f)) files.push(path.join(p, f)); }
    else files.push(p);
  }
  return files.map(file => { const sc = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); return { file, name: sc.name || path.basename(file, '.json'), sc }; });
}
function main(argv) {
  const spec = argv.find(a => !a.startsWith('--'));
  if (!spec) { console.error('usage: overlap.js <dir|a.json,b.json> [--json]'); return 2; }
  const items = loadFiles(spec), manual = items.filter(i => i.sc.manual), run = items.filter(i => !i.sc.manual), g = plan(run);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ scenarios: run.length, manual: manual.length, launches: g.length, groups: g.map(x => ({ names: x.items.map(i => i.name), need: x.need, solo: x.solo })), blocked: g.blocked }, null, 1));
    return 0;
  }
  g.forEach((x, i) => console.log(`launch ${i + 1}: ${x.items.map(y => y.name).join(' + ')}  [${x.need} folder(s)]${x.solo ? '  solo: ' + x.solo : ''}`));
  for (const b of g.blocked) console.log(`kept apart: ${b.a} / ${b.b}: ${b.why}`);
  if (manual.length) console.log('manual, never launched: ' + manual.map(m => m.name).join(', '));
  console.log(`${run.length} scenario(s): ${g.length} launch(es), ${run.length} without overlap`);
  return 0;
}
if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { footprint, keyOf, plan, fixtureRoot };
