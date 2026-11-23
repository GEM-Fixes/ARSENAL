// test for tools/cards/cards.js (CARD-1): node tools/cards/cards.test.js
// reads GoH base + Valour (needs both installed); writes nothing.
// 1) 20 sampled cards (seed 67) across classes: each converts, validates clean against the AS2 budgets, hero cards on the special budget
// 2) seeded wrong budgets (hero button on main budget, v5 on special): validate must flag every hero card and every v5 card
// Author: Imperator_Aug (ARSENAL, ia-5c5f279a)
const c = require('./cards.js');
// DOOR-A: GOH_GAME / as2.json goh / Steam, Valour by AS2_WORKSHOP_400750_2537987794 or Steam; either missing: skip, exit 0
const gd = require('../lib/gamedir'), GOH = gd.goh(), VAL = gd.workshop(400750, '2537987794');
if (!GOH || !VAL) { console.log('skip: GoH or Valour (400750/2537987794) not found'); process.exit(0); }
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL ' + msg); } else console.log('ok   ' + msg); };

const gx = c.openGoh(GOH, VAL);
try {
  const all = c.loadCards(gx);
  ok(all.length > 5000, 'loaded ' + all.length + ' GoH cards');
  const pick = c.sample(all, 20, 67);
  ok(pick.length === 20, '20 sampled');
  const classes = new Set(pick.map(c.klass));
  ok(classes.size >= 8, 'classes covered: ' + [...classes].join(' '));
  const conv = pick.map(c.convert);
  ok(conv.every(x => !x.error), 'all 20 convert');
  const text = conv.map(x => x.text).join('\n');
  const v = c.validate(text, c.BUDGETS);
  ok(v.problems.length === 0 && v.cards === 20, 'good budgets: 20 cards, ' + v.problems.length + ' problems');
  ok(conv.filter(x => x.hero).every(x => x.budget === 'hero' && x.button === 'hero'), 'dp cards -> hero button on hero budget');
  ok(conv.filter(x => !x.hero).every(x => x.budget === 'vehicle' && x.button !== 'hero'), 'other cards -> main budget buttons');
  const bad = c.BUDGETS.replace('{buttons "squad1 squad2 v1 v2 v3 v4 v5"}', '{buttons "squad1 squad2 v1 v2 v3 v4 hero"}').replace('{buttons "hero"}', '{buttons "v5"}');
  const vb = c.validate(text, bad);
  const nh = conv.filter(x => x.hero).length, n5 = conv.filter(x => x.button === 'v5').length;
  ok(nh > 0 && n5 > 0 && vb.problems.length === nh + n5, 'wrong budget: ' + vb.problems.length + ' problems = ' + nh + ' hero + ' + n5 + ' v5');
  const noHero = c.validate(text, c.BUDGETS.replace('{buttons "hero"}', '{buttons "x"}'));
  ok(noHero.problems.length === nh, 'hero button in no budget: ' + noHero.problems.length + ' problems');
} finally { gx.close(); }
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
