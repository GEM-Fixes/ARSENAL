// armorsim --exe test: AS64 and MoW:AS2 share one install. The synthetic game holds as64.exe, mowas_2.exe, a tank `tk` (turret
// front 50 mm) and an as64/core copy of its def with turret front 90 mm. No exe or exe as64: the as64 view (90); exe mowas_2 or
// mowas2: no as64/core (50). armordata.openSource keeps one source per exe; sim.open, sim.openDoc (exe from the call or the document),
// edit and the CLI carry --exe; GoH is
// refused with one plain line (armour simulator AS2 and the 64-bit build only, owner decision 2026-11-10); shottable names the
// editor of the game in the owner's steps (as64_ed.exe, mowas_2_ed.exe). No game data, temp dir only.
// Author: Imperator_Aug (ARSENAL, ia-87dc81ad)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const sim = require('../sim'), ed = require('../edit'), ad = require('../armordata'), CLI = require('../armorsim'), ST = require('../ingame/shottable');

let n = 0, fails = 0;
function ok(name, cond, info) { n++; if (!cond) { fails++; console.log('FAIL ' + name + (info !== undefined ? ': ' + JSON.stringify(info) : '')); } }
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });
const GOH = 'not available for GoH: the armour simulator is for MoW:AS2 and the 64-bit build only (owner decision 2026-11-10, plan/decisions.md SOEdit)';

const fx = fs.mkdtempSync(path.join(os.tmpdir(), 'armorsim-exe-'));
const game = path.join(fx, 'game'), mod = path.join(fx, 'mod');
const W = (rel, text) => { const f = path.join(game, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); };
const def = mm => `{game_entity\n\t{props "steel"}\n\t{volume "turret"\n\t\t{thickness 40 {front ${mm}}}\n\t}\n\t{Extension "tk.mdl"}\n}\n`;
try {
  fs.mkdirSync(mod, { recursive: true });
  W('as64.exe', 'MZ'); W('mowas_2.exe', 'MZ');
  W('resource/entity/vehicle/tk/tk.def', def(50));
  W('as64/core/resource/entity/vehicle/tk/tk.def', def(90));
  W('resource/entity/vehicle/tk/tk.mdl', '{Skeleton\n\t{bone "basis"\n\t\t{bone "turret"}\n\t}\n}\n{Volume "turret"\n\t{Box 40 40 20}\n\t{Bone "turret"}\n}\n');
  W('resource/set/material.set', '{materials\n\t{"steel"\n\t\t{steelEquivalent 1}\n\t}\n}\n');
  const front = o => { const A = ad.vehicleArmor('tk', o); return A && A.volumes.turret.thickness.front; };

  // armordata: one source per exe, the as64/core def only for as64
  eq('armordata no exe: as64 view', front({ game }), 90);
  eq('armordata exe as64', front({ game, exe: 'as64' }), 90);
  eq('armordata exe mowas_2: no as64/core', front({ game, exe: 'mowas_2' }), 50);
  eq('armordata exe mowas2 (GUI id) = mowas_2', front({ game, exe: 'mowas2' }), 50);
  ok('armordata: separate cached sources', ad.openSource({ game }) !== ad.openSource({ game, exe: 'mowas_2' }) && ad.openSource({ game, exe: 'mowas_2' }) === ad.openSource({ game, exe: 'mowas2' }));
  eq('armordata source exe', [ad.openSource({ game }).v.exe, ad.openSource({ game, exe: 'mowas_2' }).v.exe], ['as64', 'mowas_2']);

  // sim.open carries exe into its opts (table, shot, effects read through ctx.opts)
  const c1 = sim.open('tk', { game, exe: 'mowas_2' });
  ok('sim.open exe mowas_2', !c1.error, c1.error);
  eq('sim.open exe mowas_2: turret front', c1.armor && c1.armor.volumes.turret.thickness.front, 50);
  eq('sim.open opts.exe', c1.opts && c1.opts.exe, 'mowas_2');
  const c0 = sim.open('tk', { game });
  eq('sim.open no exe: as before', [c0.armor && c0.armor.volumes.turret.thickness.front, c0.opts && 'exe' in c0.opts], [90, false]);
  ok('sim.open exe goh refused', /^armorsim: not available for GoH/.test(sim.open('tk', { game, exe: 'goh' }).error || ''));

  // openDoc (the open model in the editor): exe from o or from the document reaches the base source and open(); goh stops
  // with the plain line before any source is opened
  {
    const doc = ex => Object.assign({ mod, files: new Map(), scene: () => c1.scene }, ex ? { exe: ex } : {});
    const seen = [], o0 = ad.openSource;
    ad.openSource = q => { seen.push(q.src ? 'src' : (q.exe || null)); return o0(q); };
    let d;
    try {
      d = sim.openDoc(doc(), { unit: 'tk', game, exe: 'mowas_2' });
      eq('openDoc o.exe mowas_2: front 50, opts.exe', [d.error, d.armor && d.armor.volumes.turret.thickness.front, d.opts && d.opts.exe], [undefined, 50, 'mowas_2']);
      eq('openDoc o.exe mowas_2: base source of mowas_2', seen[0], 'mowas_2');
      seen.length = 0; d = sim.openDoc(doc('mowas2'), { unit: 'tk', game });
      eq('openDoc doc.exe mowas2 (GUI id): front 50, opts.exe mowas_2', [d.error, d.armor && d.armor.volumes.turret.thickness.front, d.opts && d.opts.exe, seen[0]], [undefined, 50, 'mowas_2', 'mowas_2']);
      seen.length = 0; d = sim.openDoc(doc(), { unit: 'tk', game });
      eq('openDoc no exe: as before (90, no opts.exe)', [d.error, d.armor && d.armor.volumes.turret.thickness.front, d.opts && 'exe' in d.opts, seen[0]], [undefined, 90, false, null]);
      seen.length = 0; d = sim.openDoc(doc(), { unit: 'tk', game, exe: 'goh' });
      eq('openDoc o.exe goh: plain line, no source opened', [d.error, seen.length], ['armorsim: ' + GOH, 0]);
      seen.length = 0; d = sim.openDoc(doc('goh'), { unit: 'tk', game });
      eq('openDoc doc.exe goh: plain line, no source opened', [d.error, seen.length], ['armorsim: ' + GOH, 0]);
    } finally { ad.openSource = o0; }
  }

  // edit: exe goes to the source it reads; goh refused before anything is read or written
  const r = ed.edit('tk', { volume: 'turret', side: 'front', mm: 70, out: mod, dry: true, game, exe: 'mowas_2' });
  ok('edit exe mowas_2 dry', r.ok, r.reason);
  ok('edit exe mowas_2: before = the vanilla 50', r.changes.some(ch => /50/.test(String(ch.before))), r.changes);
  const g = ed.edit('tk', { volume: 'turret', side: 'front', mm: 70, out: mod, dry: true, game, exe: 'goh' });
  eq('edit exe goh refused', [g.ok, g.refused, g.reason], [false, true, 'armorsim: ' + GOH]);

  // command line
  const run = (main, args) => { const out = [], err = []; const w1 = process.stdout.write, w2 = process.stderr.write;
    process.stdout.write = s => { out.push(String(s)); return true; }; process.stderr.write = s => { err.push(String(s)); return true; };
    let code; try { code = main(args); } finally { process.stdout.write = w1; process.stderr.write = w2; } return { code, out: out.join(''), err: err.join('') }; };
  let x = run(CLI.main, ['table', 'tk', '--game', game, '--exe', 'mowas_2', '--json']);
  eq('cli table --exe mowas_2', [x.code, JSON.parse(x.out).rows.find(rw => rw.name === 'turret').sides[0].mm], [0, 50]);
  x = run(CLI.main, ['table', 'tk', '--game', game, '--json']);
  eq('cli table no exe: as before', [x.code, JSON.parse(x.out).rows.find(rw => rw.name === 'turret').sides[0].mm], [0, 90]);
  x = run(CLI.main, ['table', 'tk', '--game', game, '--exe', 'goh']);
  eq('cli --exe goh: one line, exit 2', [x.code, x.err], [2, 'armorsim: ' + GOH + '\n']);
  x = run(CLI.main, ['table', 'tk', '--game', game, '--exe', 'mow3']);
  eq('cli --exe bad word: usage, exit 2', x.code, 2);

  // shottable: the editor of the game in the steps; goh refused
  const T = { unit: 'tk', rangeM: 100, samples: 1, seed: 1, waitS: 5, game, folder: null, missingAims: [], shellNotes: [], rows: [] };
  ok('shottable steps: as64_ed.exe by default', ST.planMd(T).includes('(as64_ed.exe -edit multi/'));
  ok('shottable steps: mowas_2_ed.exe for MoW:AS2', ST.planMd(Object.assign({}, T, { exe: 'mowas_2' })).includes('(mowas_2_ed.exe -edit multi/'));
} catch (e) { fails++; console.log('FAIL threw ' + (e.stack || e.message)); }
// shottable main is not exported: run its CLI
{
  const cp = require('child_process'), f = path.join(__dirname, '..', 'ingame', 'shottable.js');
  const r = cp.spawnSync(process.execPath, [f, 'plan', 'tk', '--game', game, '--weapons', 'x', '--range', '100', '--out', path.join(fx, 'st'), '--exe', 'goh'], { encoding: 'utf8' });
  eq('shottable --exe goh: one line, exit 2', [r.status, r.stderr], [2, 'shottable: ' + GOH + '\n']);
  const r2 = cp.spawnSync(process.execPath, [f, 'plan', 'tk', '--game', game, '--weapons', 'x', '--range', '100', '--out', path.join(fx, 'st'), '--exe', 'mow3'], { encoding: 'utf8' });
  eq('shottable --exe bad word: exit 2', r2.status, 2);
}
try { fs.rmSync(fx, { recursive: true, force: true }); } catch (e) { /* temp */ }
console.log(`armorsim exe: ${n - fails}/${n} ok`);
if (fails) { console.log('FAIL'); process.exit(1); }
