// GUI-EXT mapai test. Arg: scratch dir (unused: nothing is written). Shape, strings, script rules, and the page in the fake DOM: group E
// drawn by the bots script's BOTS_UI.drawGroups, the mod line, blocks by the shared rules. The frame itself is tested in ext/bots/test.js.
// Author: Imperator_Aug (ARSENAL, ia-6caa94c4)
'use strict';
const ID = 'mapai', G = 'E', OTHER = ['group.a', 'group.d'];
const X = require('./index');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
(async () => {
  ok(X.id === ID && X.nav === ID + '.nav' && X.adv === false && !Object.keys(X.routes).length && !Object.keys(X.commands).length, 'shape');
  ok(!/`|\$\{/.test(X.script) && X.script.includes('EXT_SCREENS.' + ID + '=') && X.script.includes("BOTS_UI.drawGroups(root,['" + G + "']"), 'script rules, group ' + G);
  for (const k of Object.keys(X.lang.en)) ok(['ru', 'uk', 'zh'].every(c => X.lang[c][k] && X.lang[c][k] !== X.lang.en[k]), 'four languages: ' + k);
  const B = require('../bots/blkboot');   // puts this page into the ext list when ext/index.js does not list it yet
  const P = await B.boot({ 'as2gui.mod': 'C:/m' }, () => undefined); await P.settle();
  P.ctx.as2Link('page:' + ID); await P.settle();
  const s = P.sec(ID);
  ok(!!s, 'the page is built');
  if (s) {
    const ids = B.ids(s), pr = B.check(s);
    ok(!pr.length, 'blocks: ' + pr.slice(0, 8).join('; '));
    ok(ids.includes('title') && ids.includes('lead') && ids.includes('mod') && ids.includes('group.' + G.toLowerCase()) && !OTHER.some(i => ids.includes(i)), 'title, lead, mod line, group ' + G + ' only: ' + ids.join());
    ok(s.all().some(e => e.tagName === 'H2' && e.textContent === X.lang.en[ID + '.h1']), 'its own title');
    // S8: the task (symptom) list first, each line a button to a card of this page; one line says what the other two pages are for
    const tl = s.all().find(e => e.dataset && e.dataset.blk === 'tasks.list'), tb = tl ? tl.all().filter(e => e.tagName === 'BUTTON') : [];
    ok(tb.length >= 1 && tb.every(b => P.ctx.BOTS_UI.pageOf(b.dataset.task) === ID) && ids.indexOf('tasks') < ids.indexOf('group.' + G.toLowerCase()), 'task list first, every line goes to a card here: ' + tb.map(b => b.dataset.task).join());
    const pl = s.all().find(e => e.dataset && e.dataset.blk === 'pages'), pb = pl ? pl.all().filter(e => e.tagName === 'BUTTON').map(b => b.dataset.page) : [];
    ok(pb.length === 2 && !pb.includes(ID) && pb.includes('bots'), 'the other two pages in one line: ' + pb.join());
    // round 2: every task line points at a block that is drawn on this page (a hidden line counts too: a wrong id fails here)
    const blk = id => s.all().find(e => e.dataset && e.dataset.blk === id);
    const tall = tl ? tl.all().filter(e => e.tagName === 'BUTTON') : [];
    for (const b of tall) ok(!!blk(b.dataset.task), 'task line "' + b.textContent + '" points at ' + b.dataset.task + ', which is drawn here');
    // S10: one card open (the first of the open group), every other card folded to its title and one line
    const cards = s.all().filter(e => e.classList && e.classList.contains('card') && e.dataset.folded != null);
    const open = cards.filter(c => c.dataset.folded === '0');
    ok(cards.length >= 2 && open.length === 1 && open[0] === cards[0], 'S10: only the first card open: ' + cards.map(c => c.dataset.blk + '=' + c.dataset.folded).join());
    ok(cards.filter(c => c.dataset.folded === '1').every(c => { const l = c.all().find(e => e.dataset && e.dataset.foldline); return l && !l.hidden; }), 'S10: a folded card shows its one line');
    // the internals card goes last and folded; the recipes card first
    const ci = cards.map(c => c.dataset.blk);
    ok(ci.indexOf('bots.mission.orders') === 0 && ci[ci.length - 1] === 'bots.mission.teams' && blk('bots.mission.teams').dataset.folded === '1', 'Map scripts: recipes first, "How the page finds each team\'s bot" last and folded: ' + ci.join());
    if (tb[0]) { tb[0].click(); await P.settle(); ok(!s.hidden, 'a task line keeps the page and opens the card'); }
  }
  const P2 = await B.boot({}, () => undefined); await P2.settle(); P2.ctx.as2Link('page:' + ID); await P2.settle();
  const s2 = P2.sec(ID); ok(s2 && B.ids(s2).includes('needmod'), 'no mod: the pick-a-mod line, as on the Bots page');
  { const nmText = sec => { const e = sec && sec.all().find(x => x.dataset && x.dataset.blk === 'needmod'); return e ? e.textContent : null; };
    P2.ctx.as2Link('page:bots'); await P2.settle(); const sb = P2.sec('bots');
    const btn = s2 && s2.all().find(e => e.tagName === 'BUTTON' && e.parentNode && e.parentNode.dataset && e.parentNode.dataset.needmod);
    ok(nmText(s2) && nmText(s2) === nmText(sb) && btn, 'no mod: the same line and button as the Bots page: ' + nmText(s2) + ' | ' + nmText(sb)); }
  console.log(bad ? bad + ' failures' : ID + ' ext PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });
