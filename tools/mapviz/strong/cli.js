// strong cli (MV-STR): `node tools/mapviz/mapviz.js strong <command> [flags]` (rules.md 6.6).
//   points  COMMON --map K --kind k [--mode M] [--phase n] [--side a|b|both] [--seed n] [--in D]... --out D [--json]
//           strong.<kind>.json, the strong.<side>.<kind>.* and strong.contact.<kind> grids, reads.json.
//           Exit 0; 1 when a cap was hit or inputs were degraded (listed); 3 not found.
//   checks  COMMON --map K [--mode M] [--phase n] [--in D]... --out D [--json]
//           strong.checks.json ({v:1, kind:'vector', name:'strong.checks', phase, items, notes}), reads.json. Exit 0; 3.
//   presets [--json]   PRESETS and APPLIES
// Every input absent from --in is computed here through its owner (note STRONG_INPUT_COMPUTED).
// --progress stages: read, frame, candidates, factors, refine, classify, ensemble, fair, checks, write.
// Author: Imperator_Aug (ARSENAL, ia-c966f041)
'use strict';
const path = require('path');

const COMMON = '--target T [--game G] [--mods a,b] [--mod-dir D]';
const SPEC = {};
function mv() { return require('../mapviz'); }
const json = x => JSON.stringify(x) + '\n';
const out = s => process.stdout.write(s);

function srcFn(o) {
  return () => require('../lib/mapkit').source({ target: o.target, game: o.game, mods: o.mods, modDirs: o.modDirs });
}
function need(o, what) {
  const M = mv();
  if (!o.target) throw new M.MvError('MV_USAGE', '--target as64|mowas2|goh is needed');
  if (!o.map) throw new M.MvError('MV_USAGE', '--map <map key> is needed');
  if (!o.out) throw new M.MvError('MV_USAGE', '--out <folder> is needed for strong ' + what);
  if (o.phase !== undefined && !(Number.isInteger(o.phase) && o.phase >= 0 && o.phase <= 99)) throw new M.MvError('MV_USAGE', '--phase must be an integer 0..99, got ' + o.phase);
}
function writeReads(dir, I) {
  const M = mv();
  M.writeAtomic(path.join(dir, 'reads.json'), json({ v: 1, inputs: I.src ? I.src.reads() : [] }));
}
function outDir(o) { return mv().checkOut(o.out, { game: o.game, target: o.target }); }
function inputsOf(o, P) {
  const S = require('./index');
  P.stage('read', 1);
  const I = S.inputs(o.in || [], { target: o.target, map: o.map, mode: o.mode, phase: o.phase, kind: o.kind, srcFn: srcFn(o) });
  return I;
}

function cmdPoints(o) {
  const M = mv(), S = require('./index'), gf = require('../lib/raster/gridfile');
  need(o, 'points');
  if (!S.KINDS.includes(o.kind)) throw new M.MvError('MV_USAGE', '--kind inf|mg|at|tank is needed for strong points, got ' + o.kind);
  o.side = o.side || 'both';
  const dir = outDir(o);
  const P = M.progress(o);
  const I = inputsOf(o, P);
  const r = S.run(I, { kind: o.kind, side: o.side, seed: o.seed, ensemble: 8, stage: n => P.stage(n, 0), tick: () => P.step() });
  P.stage('write', r.grids.length + 2);
  const files = [];
  for (const g of r.grids) { gf.write(path.join(dir, g.name + '.mvg'), g); files.push(g.name + '.mvg'); P.step(); }
  const jf = 'strong.' + o.kind + '.json';
  M.writeAtomic(path.join(dir, jf), json(r.json)); files.push(jf); P.step();
  writeReads(dir, I); files.push('reads.json'); P.step();
  const j = r.json, degraded = j.notes.filter(n => n.code === 'STRONG_DEGRADED');
  const sum = { v: 1, map: j.map, mode: j.mode, phase: j.phase, kind: o.kind, side: o.side, seed: j.seed, files, candidates: j.candidates.length,
    labels: j.labels, caps: j.caps, notes: j.notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('strong points of ' + j.map + ' (' + j.mode + ', phase ' + j.phase + ') for ' + o.kind + ', side ' + o.side + ': ' + j.candidates.length + ' candidates, ' +
      j.labels.length + ' labels, enemy ground d ' + j.frame.d + ' s, contact cells ' + j.frame.contactCells + '\n');
    for (const id of j.labels) { const c = j.candidates.find(x => x.id === id); out('  ' + id + ' ' + c.label + ' score ' + c.score + ' at ' + c.x + ', ' + c.y + '\n'); }
    for (const c of j.checks) out('check ' + c.code + ' ' + c.flag + ' side ' + c.side + ' ' + c.value + '\n');
    for (const n of j.notes) out('note ' + n.code + ': ' + n.msg + '\n');
  }
  return j.caps.hit || degraded.length ? M.EXIT.FINDINGS : 0;
}

function cmdChecks(o) {
  const M = mv(), S = require('./index');
  need(o, 'checks');
  const dir = outDir(o);
  const P = M.progress(o);
  const I = inputsOf(o, P);
  P.stage('checks', 0);
  const items = S.checks(I, { tick: () => P.step() });
  P.stage('write', 2);
  M.writeAtomic(path.join(dir, 'strong.checks.json'), json({ v: 1, kind: 'vector', name: 'strong.checks', phase: I.phase, items, notes: I.notes })); P.step();
  writeReads(dir, I); P.step();
  const sum = { v: 1, map: I.map, mode: I.mode, phase: I.phase, files: ['strong.checks.json', 'reads.json'], items: items.length, notes: I.notes };
  if (o.json) out(json(sum));
  else if (!o.q) {
    out('strong checks of ' + I.map + ' (' + I.mode + ', phase ' + I.phase + '): ' + items.length + ' items\n');
    for (const c of items) out('  ' + c.code + [c.side && 'side ' + c.side, c.unit, c.flag, c.file, c.value !== undefined && 'value ' + c.value].filter(Boolean).map(s => ' ' + s).join('') + '\n');
    for (const n of I.notes) out('note ' + n.code + ': ' + n.msg + '\n');
  }
  return 0;
}

function cmdPresets(o) {
  const S = require('./index');
  if (o.json) out(json({ v: 1, presets: S.PRESETS, applies: S.APPLIES }));
  else {
    for (const k of Object.keys(S.PRESETS)) out(k + ': ' + Object.keys(S.PRESETS[k]).map(f => f + ' ' + S.PRESETS[k][f]).join(', ') + '\n');
    for (const k of Object.keys(S.APPLIES)) out('applies ' + k + ': ' + S.APPLIES[k].join(' ') + '\n');
  }
  return 0;
}

const RUN = { points: cmdPoints, checks: cmdChecks, presets: cmdPresets };

module.exports = {
  part: 'strong',
  version: 1,
  summary: 'strong points (factors, classifiers, fairness) of a unit kind and the map checks',
  commands: {
    points: { args: COMMON + ' --map K --kind k [--mode M] [--phase n] [--side a|b|both] [--seed n] [--in D] --out D [--json]', summary: 'strong.<kind>.json and the strong layers' },
    checks: { args: COMMON + ' --map K [--mode M] [--phase n] [--in D] --out D [--json]', summary: 'strong.checks.json' },
    presets: { args: '[--json]', summary: 'the weight presets and the factors of each kind' },
  },
  run(argv) {
    const M = mv();
    const cmd = argv[0];
    if (!RUN[cmd]) throw new M.MvError('MV_USAGE', 'no strong command ' + cmd);
    const o = M.parseArgs(argv.slice(1), SPEC);
    if (o.pos.length) throw new M.MvError('MV_USAGE', 'unexpected argument ' + o.pos[0]);
    return RUN[cmd](o);
  },
};
