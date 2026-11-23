// --breed mode (COV-MIX2): copy a set/breed file under a new path, --swap edits must match once, an existing target is refused
// Author: Imperator_Aug (ARSENAL, ia-2dad30b7)
const fs = require('fs'), path = require('path'), os = require('os'), { run } = require('../clone-entity.js');
const w = fs.mkdtempSync(path.join(os.tmpdir(), 'clone-breed-')), G = path.join(w, 'game'), M = path.join(G, 'mods', 'm');
const b = path.join(G, 'resource/set/breed/mp/rus/rifle.set');
fs.mkdirSync(path.dirname(b), { recursive: true }); fs.mkdirSync(M, { recursive: true });
fs.writeFileSync(b, '{breed\r\n\t{perks\r\n\t\t{"vision" "mp_soldier"\r\n\t\t}\r\n\t}\r\n}\r\n');
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const codes = r => r.rep.toJSON({ tool: 'x' }).findings.map(f => f.code).join(',');
try {
  let r = run({ gameDir: G, out: M, breed: 'mp/rus/rifle', as: 'mp/rus/blind', swaps: ['"mp_soldier"=>"mp_officer"'] });
  ok(!r.blocked && r.plan.length === 1 && /set\/breed\/mp\/rus\/blind\.set$/.test(r.plan[0].rel), 'clone plan ' + JSON.stringify(r.plan.map(p => p.rel)));
  ok(r.plan[0] && /"mp_officer"/.test(r.plan[0].data.toString('latin1')) && !/mp_soldier/.test(r.plan[0].data.toString('latin1')), 'swap applied');
  r = run({ gameDir: G, out: M, breed: 'mp/rus/rifle', as: 'mp/rus/x', swaps: ['nothere=>y'] });
  ok(r.blocked && codes(r) === 'CLONE_SWAP_COUNT', 'swap miss ' + codes(r));
  r = run({ gameDir: G, out: M, breed: 'mp/rus/rifle', as: 'mp/rus/rifle' });
  ok(r.blocked && codes(r) === 'CLONE_ENTITY_EXISTS', 'exists ' + codes(r));
  r = run({ gameDir: G, out: M, breed: 'mp/rus/none', as: 'mp/rus/y' });
  ok(r.blocked && codes(r) === 'CLONE_BASE_MISSING', 'missing ' + codes(r));
} finally { fs.rmSync(w, { recursive: true, force: true }); }
console.log(bad ? 'breed FAIL' : 'breed ok'); process.exit(bad ? 1 : 0);
