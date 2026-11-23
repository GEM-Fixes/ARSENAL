// TOOLFIX-MIX: a path that matches several blocks is refused (PATCH_AMBIGUOUS) unless indexed; --add with no parent goes into the
// single root block (a 2nd top-level block fails the game: "End of SDL file expected"); several roots need a parent path
// Author: Imperator_Aug (ARSENAL, ia-86e5eae9)
const p = require('../patch-entity.js'), run = (s, e) => p.applyEdit(Buffer.from(s, 'latin1'), e);
const out = r => r.err ? r.err[0] : r.buf.toString();
const cases = [
  ['{blow {opponent {damage 60}} {opponent {damage 40}}}', { op: 'set', path: 'blow/opponent/damage', value: '70' }, 'PATCH_AMBIGUOUS'],
  ['{blow {opponent {damage 60}} {opponent {damage 40}}}', { op: 'set', path: 'blow/opponent[1]/damage', value: '70' }, '{blow {opponent {damage 60}} {opponent {damage 70}}}'],
  ['{a {b 1}}', { op: 'set', path: 'a/b', value: '2' }, '{a {b 2}}'],
  ['{a {b 1}}\r\n{c}', { op: 'add', path: 'x', value: '1' }, 'PATCH_BAD_ARGS']];
let bad = 0;
for (const [s, e, want] of cases) { const got = out(run(s, e)); if (got !== want) { bad++; console.log('FAIL', e.op, e.path, got); } }
// add with no parent: lands inside the one root block, not after it
const a = out(run('{a {b 1}}', { op: 'add', path: 'x', value: '1' }));
if (!/^\{a [\s\S]*\{x 1\}[\s\S]*\}$/.test(a) || /\}\s*\{x/.test(a.replace(/\{b 1\}/, ''))) { bad++; console.log('FAIL add-root', JSON.stringify(a)); }
console.log(bad ? 'fixmix FAIL' : 'fixmix ok'); process.exit(bad ? 1 : 0);
