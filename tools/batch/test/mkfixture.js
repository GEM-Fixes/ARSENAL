// batch fixture: fixture/limits (rows2scn input), fixture/drafts (reviewed drafts: one good, one lint-bad, one manual)
// Author: Imperator_Aug (ARSENAL, ia-18c33a0a)
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'fixture');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'limits'), { recursive: true });
const rows = [
  'ZZ-01 | unit scale | `g_unitsPerMeter` is 20 | wrong distances | [T] src',
  'ZZ-02 | reload | `ed_reloadInteractions` console command | silent | [T] src',
  'ZZ-04 | pak order | loose file shadows pak copy | wrong file | [T] src',
  'ZZ-05 | visual | camera rotates with hull in game | unreliable | [T] in game',
  'ZZ-07 | verified row | `g_other_var` x | y | [V] src',
];
fs.writeFileSync(path.join(dir, 'limits', 'ZZ.md'), '# ZZ\n' + rows.join('\n') + '\n');
const dd = path.join(dir, 'drafts');
fs.mkdirSync(path.join(dd, 'mods', 'zd-01'), { recursive: true });
fs.writeFileSync(path.join(dd, 'mods', 'zd-01', 'mod.info'), 'x\n');
const base = { mode: 'menu', params: {}, mods: [], steps: [], verdict: [] };
fs.writeFileSync(path.join(dd, 'zd-01.json'), JSON.stringify(Object.assign({}, base, { name: 'zd-01', rows: ['ZZ-09'], mods: ['zd-01'], fixture: ['zd-01'], verdict: [{ log: 'hello', want: true }] }), null, 1));
fs.writeFileSync(path.join(dd, 'zd-bad.json'), JSON.stringify(Object.assign({}, base, { name: 'zd-bad', rows: ['ZZ-10'] }), null, 1));   // negative-only: lint fail
fs.writeFileSync(path.join(dd, 'zd-man.json'), JSON.stringify(Object.assign({}, base, { name: 'zd-man', rows: ['ZZ-11'], manual: 'look at it', verdict: [{ log: 'x', want: true }] }), null, 1));
