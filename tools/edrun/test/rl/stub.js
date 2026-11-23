// fake edrun for runlist-test: --dry prints HELD for a shooter named "held"; a game writes report.json:
// shooter "good" counts, "bad" doesn't, "flaky" counts on odd runs; ctlpz fails in a game whose out ends g2, so its -rerun passes.
const fs = require('fs'), path = require('path'); const v = process.argv.slice(2), get = k => v[v.indexOf(k) + 1];
const pairs = JSON.parse(fs.readFileSync(get('--pairs'), 'utf8')), out = get('--out');
if (v.includes('--dry')) { for (const p of pairs) if (p.shooter === 'held') console.log('preflight HELD ' + p.name + ': BLOCKED x'); process.exit(0); }
fs.mkdirSync(out, { recursive: true }); const cf = path.join(path.dirname(out), '.count'); const n = fs.existsSync(cf) ? +fs.readFileSync(cf, 'utf8') + 1 : 1; fs.writeFileSync(cf, String(n));
const rows = pairs.map(p => ({ name: p.name, shots: 5, hits: 1, counted: p.name === 'ctlpz' ? !/g2$/.test(out) : p.shooter === 'good' || (p.shooter === 'flaky' && n % 2 === 1) }));
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ pairs: rows, games: [{}] }));
