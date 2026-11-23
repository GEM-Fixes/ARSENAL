// logtriage in-process API test: check({target, keep: 1, exe}) as the GUI routes call it (p-ide, p-logs), on the made-up fixtures.
// exe 'mowas_2' and the id 'mowas2' give the same LOG-20 note on an as64.exe log; exe 'goh' reads the GoH fixture in the GoH form;
// no exe = the AS64 answer as before. argv: <AS2 log dir> <GoH game.log>
// Author: Imperator_Aug (ARSENAL)
const { check } = require('../logtriage');
const [as2, goh] = process.argv.slice(2);
let bad = 0;
const fail = m => { console.log('FAIL: api ' + m); bad = 1; };
function infos(rep) {
  const buf = [], real = console.log; console.log = s => buf.push(String(s));
  try { rep.print({ showInfo: true }); } finally { console.log = real; }
  return buf.join('\n');
}
const t0 = infos(check({ target: as2, keep: 1 }).rep);
if (/LOG-20\)/.test(t0) && /not as64\.exe/.test(t0)) fail('no exe gained a LOG-20 note');
for (const exe of ['mowas_2', 'mowas2']) {
  const t = infos(check({ target: as2, keep: 1, exe }).rep);
  if (!/LOG_NOTE this log was written by as64\.exe, not mowas_2\.exe: AS64 and MoW:AS2 share one log folder/.test(t)) fail(exe + ': LOG-20 note missing');
}
const g = check({ target: goh, keep: 1, exe: 'goh' });
if (g.sink.game !== 'goh') fail('goh: not read in the GoH form');
const ga = check({ target: goh, keep: 1, exe: 'as64' });
if (!/this is a Gates of Hell log, not a as64\.exe one/.test(infos(ga.rep))) fail('goh log asked as as64: note missing');
if (!bad) console.log('ok api check({target, keep, exe})');
process.exit(bad);
