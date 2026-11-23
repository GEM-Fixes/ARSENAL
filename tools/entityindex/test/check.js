// entityindex API check against truth.json (cache written by run.sh)
// Author: Imperator_Aug (ARSENAL, ia-d779a1a8)
const ix = require('../index'), path = require('path');
const truth = require('./truth.json');
const idx = ix.load(process.env.EI_CACHE || path.join(__dirname, 'fx.cache.json'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const fail = m => { console.log('FAIL: ' + m); bad++; };
for (const n of ['a', 'b']) {
  const r = idx.byName(n)[0], t = truth[n];
  if (!r) { fail('no entity ' + n); continue; }
  if (!eq(r.inherits, t.inherits)) fail(`${n} inherits ${JSON.stringify(r.inherits)}`);
  if (!eq(r.extenders, t.extenders)) fail(`${n} extenders ${JSON.stringify(r.extenders)}`);
  if (r.model !== t.model) fail(`${n} model ${r.model}`);
  if (r.source !== 'mod') fail(`${n} source ${r.source}`);
  if (t.refs && !eq(r.refs, t.refs)) fail(`${n} refs ${JSON.stringify(r.refs)}`);
}
if (idx.usersOf('weapon', 'W1').length !== 1) fail('usersOf weapon');
if (idx.usersOf('model', 'a.mdl').length !== 2) fail('usersOf model');
const a = idx.byName('a')[0];
if (!eq(a.ev.map(e => e[0]), ['loco', 'strafe'])) fail('ev ' + JSON.stringify(a.ev));
const m = idx.models['resource/entity/a.mdl'];
if (!m || !eq(m.refs, truth.modelRefs)) fail('model refs ' + JSON.stringify(m && m.refs));
if (idx.stuffMatch('w1 bullet').length !== 1 || idx.stuffMatch('w1 nothing').length !== 0) fail('stuffMatch');
if (!idx.tagsOf('resource/set/stuff/gun/w1').has('stackable')) fail('tagsOf from');
// engine FindStuff: file-name tags only; {tag}/{from} tags are not searched, pattern files skipped by default
if (idx.stuffFind('w1').length !== 1 || idx.stuffFind('w1 bullet').length !== 0 || idx.stuffFind('bullet').length !== 0) fail('stuffFind file tags');
if (idx.stuffFind('base pattern').length !== 0 || idx.stuffFind('base pattern', true).length !== 1) fail('stuffFind pattern');
if (!idx.fileTagsOf('resource/set/stuff/gun/base.pattern').has('pattern')) fail('fileTagsOf');
// X3: own block chosen past .presets and a leading include
{ const c1 = idx.stuff['resource/set/stuff/cannon/c1'];
  if (!c1) fail('no stuff cannon/c1');
  else {
    if (c1.from !== 'pattern base') fail('c1 from ' + JSON.stringify(c1.from));
    if (!c1.tags.includes('own') || c1.tags.includes('fromprsets') || c1.tags.includes('frominclude')) fail('c1 tags ' + JSON.stringify(c1.tags));
    if (!eq(c1.refs.map(r => r[1]), ['b'])) fail('c1 refs ' + JSON.stringify(c1.refs));
    if (!idx.tagsOf('resource/set/stuff/cannon/c1').has('stackable')) fail('c1 tagsOf via from');
  }
  if (ix.VERSION < 8) fail('cache VERSION not bumped');
}
{ const ixm = require('../index'); const fake = { items: [{ k: 'BLOCK', n: 1 }, { k: 'MOD', items: [{ k: 'BLOCK', n: 2, disabled: true }, { k: 'BLOCK', n: 3 }] }, { k: 'IDENT' }] };
  if (ixm.kids(fake).map(x => x.n).join() !== '1,2,3' || ixm.kids(fake, { enabledOnly: true }).map(x => x.n).join() !== '1,3' || [...ixm.kidsOf(fake)].length !== 3) fail('kids'); }
console.log(bad ? 'FAIL' : 'ok');
process.exit(bad ? 1 : 0);
