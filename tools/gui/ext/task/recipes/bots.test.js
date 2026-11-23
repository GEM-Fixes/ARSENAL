// recipe "bots" test: node bots.test.js <scratch>. Direct checks first, one per novice hazard: the unit questions wait for a yes to
// adding a unit, the unit is picked, Repeat is asked only for a named wave (its own number changes nothing, a wave with no Repeat line
// takes only 1), the fighting style starts at keep, the preset is picked from the chosen file, the timer share is one number, the groups
// and helps of every army say so, no limit ids or old page names in the prose, "against people" in every language, and Review names this
// army's buy line apart from the files every army shares. Then fixture drafts on stock armies, written for real into scratch mods and
// read back: (1) rus bots buy the m3 first, hard bots get 1.5 command points and wait the full card timers, the 100 point standard preset
// starts at 200 manpower, the guards style, then the doctrine check (bots, gen and doctrine pages); (2) the competitive presets file: its
// 100 point preset starts at 250 and its rules grow in 1800 s; (3) a reset of both files with the test presets file; (4) a cooldown
// change with a reset of the difficulties is refused; (5) the own stock bot file route plans a buy (dry run).
// Author: Imperator_Aug (ARSENAL, ia-d7adbc09)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-bots-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./bots.recipe'), L = require('./bots.lang'), PL = require('./prices.lang'), PR = require('./prices.recipe');
const G = 'resource/set/multiplayer/games/', BD = 'resource/script/multiplayer/bot.data.lua';
const rd = (mod, rel) => { try { return fs.readFileSync(path.join(mod, rel), 'latin1'); } catch (e) { return ''; } };
const callsOf = (res, route) => (res.calls || []).filter(x => x.route === route);

(async () => {
  let fails = 0, passes = 0;
  const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } else passes++; };
  const Q = id => { for (const g of R.groups) for (const q of g.q) if (q.id === id) return q; return null; };
  const row = k => L.find(x => x[0] === k) || [], en = k => row(k)[1] || '';
  const buy = R.groups.find(g => g.id === 'buy');
  ok(buy.q[0].id === 'addunit' && buy.q.slice(1).every(q => q.when && q.when.addunit === true), 'every unit question waits for a yes to adding a unit');
  ok(JSON.stringify(Q('unit').picker.sources) === '["exist"]', 'the unit is picked, never kept or typed');
  ok(JSON.stringify(Q('repeat').when.stage) === '[1,2,3,4,5,6,7,8]', 'Repeat is asked only when a wave is named');
  ok(Q('persona').limits.values[0] === 'keep' && ['profile', 'mindbase', 'scale'].every(id => Array.isArray(Q(id).when.persona) && !Q(id).when.persona.includes('keep')), 'the style starts with keep and its questions wait for a style');
  ok(Q('pname').kind === 'thing' && Q('pname').picker.lookup === 'preset' && !/presets_all/.test(en('task.bots.h.pname')), 'the preset is picked from the chosen file, the help names no file');
  ok(LEVELS().every(l => Q('botcharge_' + l).kind === 'number'), 'the bot timer share is one number');
  ok(JSON.stringify([Q('growtime').limits.min, Q('growtime').limits.max]) === JSON.stringify([PRQ('growtime').limits.min, PRQ('growtime').limits.max]) && en('task.bots.h.growtime').includes('In seconds, from 60 to 7200; 1500 is 25 minutes. Longer means slower money.') && (PL.find(x => x[0] === 'task.prices.h.growtime') || [])[1].includes('In seconds, from 60 to 7200; 1500 is 25 minutes. Longer means slower money.'), 'grow time has one range and one wording in bots and prices');
  for (const g of ['level', 'preset', 'mind']) { const t = R.groups.find(x => x.id === g).title; ok(/every army/.test(en(t)) && R.groups.find(x => x.id === g).essential === false, g + ': the group title says every army', en(t)); }
  ok(/this army only/i.test(en('task.bots.g.buy')), 'the buy group says this army only');
  for (const g of ['level', 'preset', 'mind']) for (const q of R.groups.find(x => x.id === g).q) ok(/^This changes every army/.test(en(q.help)), q.id + ': the help says every army', en(q.help));
  ok(!L.some(r => r.slice(1).some(s => /\bMIS-\d+|\b(bots|units|maps|doctrine|logs|art|files|help|fix) page\b/.test(s))), 'no limit ids or old page names in the prose');
  ok(R.test === 'task.bots.test' && /skirmish/.test(en('task.bots.test')) && /Read Game\.log/.test(en('task.bots.test')), 'the Test step says how to see what bots buy in a skirmish');
  ok(['priority', 'botcp_hard', 'botcharge_hard', 'repeat', 'growtime', 'bonuscp', 'scale'].every(id => Array.isArray(Q(id).limits.usual)), 'soft ranges on the numbers that have a usual range');
  ok(/When the bot plays against people/.test(en('task.bots.h.botcp')) && /В игре против людей/.test(row('task.bots.h.botcp')[2]) && /У грі проти людей/.test(row('task.bots.h.botcp')[3]) && /对战真人时/.test(row('task.bots.h.botcp')[4]), '"against people" in en, ru, uk and zh');
  ok(!L.some(r => /мода(?![а-яієїґ])/.test(r[3])), 'uk says моду');
  ok(/restore point/.test(en('task.bots.h.reset')) && /ARSENAL/.test(en('task.bots.h.stage')), 'reset names the restore point, the stage help names no page');
  const gameDir = kit.findGame({}), dctx = kit.ctxFor(path.join(scratch, 'direct'), { gameDir });
  if (!gameDir) console.log('note: SKIP direct game checks: no game folder');
  else {
    const vals = await R.values(dctx, { id: 'rus' }, {});
    ok(vals.addunit === false && vals.persona === 'keep', 'values: no unit added and the style kept by default', JSON.stringify(vals));
    ok(LEVELS().every(l => vals['botcharge_' + l] === undefined || typeof vals['botcharge_' + l] === 'number'), 'values: the timer share is a number or keep');
    const ps = await R.lookups.preset(dctx, '', {});
    ok(ps.some(p => p.id === 's:standard_100_all' && /Standard, 100 points/.test(p.name)), 'the presets lookup names s:standard_100_all "Standard, 100 points"', JSON.stringify(ps.slice(0, 3)));
    const mod = path.join(scratch, 'direct', 'mods', 'bots_direct'); fs.mkdirSync(mod, { recursive: true });
    const asA = x => (x && typeof x === 'object' && x.src ? x : { src: 'value', value: x });
    const comp = (answers, m, base) => { const a = {}; for (const [k, x] of Object.entries(answers)) a[k] = asA(x); return CP.compile(dctx, D.save(dctx, { id: D.newId('bots'), recipe: 'bots', verb: 'change', game: 'as64', mod: m || mod, base: { id: base || 'rus' }, answers: a, kept: [], state: 'open' }), { bots: R }); };
    const refuse = async (answers, re, m, md) => { let e = null; try { await comp(answers, md); } catch (x) { e = x; } ok(e && re.test(e.message), m, e ? e.message : 'no refusal'); };
    const m3 = { src: 'exist', value: 'm3', name: 'm3' };
    await refuse({ addunit: true }, /answer No to adding a unit/, 'a yes to adding a unit with no unit is refused');
    const no = await comp({ addunit: false, unit: m3, minincome: 300, repeat: 3, stage: 2 });
    ok(!callsOf(no, 'POST /api/x/bots/buyfirst').length, 'no to adding a unit buys nothing, whatever the hidden questions hold');
    const same = await comp({ addunit: true, unit: m3, cls: 'Vehicle', stage: 2, repeat: 1 });
    const sb = callsOf(same, 'POST /api/x/bots/buyfirst')[0];
    ok(sb && sb.body.repeat === undefined && sb.body.stage === 2, 'Repeat equal to the wave\'s own number changes nothing', JSON.stringify(sb && sb.body));
    ok(same.notes.some(n => /^Only rus: one buy line/.test(n)) && !same.notes.some(n => /^Every army/.test(n)), 'Review: a buy is this army only', JSON.stringify(same.notes));
    const wide = await comp({ start: 200, diff: 'hard', botcp_hard: 1.5 });
    const ev = wide.notes.find(n => /^Every army \(/.test(n)) || '';
    ok(/\bger\b/.test(ev) && /\brus\b/.test(ev) && /bots_generic\.inc/.test(ev) && /presets_all\.inc/.test(ev), 'Review names every army and both shared files', ev);
    ok(!callsOf(wide, 'POST /api/x/doctrine/gen').length && !callsOf(wide, 'POST /api/x/doctrine/check').length, 'the style left at keep writes and checks nothing');
    const ch = await comp({ diff: 'hard', botcharge_hard: 0.5 });
    const row0 = ch.gen && ch.gen.ops[0] && ch.gen.ops[0].rows[0];
    ok(row0 && row0.value === '"*=0.5"' && row0.path === 'hard/chargeFactors/value', 'a timer share of 0.5 is written as *=0.5', JSON.stringify(row0));
    // a wave with no Repeat line: a mod whose bot.data.lua has none
    const nr = path.join(scratch, 'direct', 'mods', 'bots_norepeat'); fs.mkdirSync(path.dirname(path.join(nr, BD)), { recursive: true });
    const L2 = require('../../bots/lib'); let src = '';
    try { src = fs.readFileSync(path.join(gameDir, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1'); } catch (e) { src = ''; }
    // the game's own list through the vfs (it sits in a pak); a seed buy is the last resort: a buy of a unit the bots already buy writes no copy
    if (!src) src = L2.gameText({ game: () => gameDir }, 'script/multiplayer/bot.data.lua') || '';
    if (!src) { const w = await kit.run(R, L, { verb: 'change', base: { id: 'rus' }, answers: { addunit: true, unit: m3, cls: 'Vehicle', first: true }, write: true }, path.join(scratch, 'seed')); const ms = path.join(scratch, 'seed', 'mods'); const d = fs.readdirSync(ms)[0]; src = rd(path.join(ms, d), BD); ok(w.fails === 0, 'a seed buy writes bot.data.lua'); }
    fs.writeFileSync(path.join(nr, BD), src.replace(/[ \t]*Repeat\s*=\s*\d+\s*,?[ \t]*\r?\n?/g, ''), 'latin1');
    const seeded = L2.buys({ game: () => gameDir }, nr).stages;
    ok(seeded.length > 1 && seeded[1].repeat == null, 'the seeded bot list has its waves and no Repeat line', seeded.length + ' stages');
    await refuse({ addunit: true, unit: m3, cls: 'Vehicle', stage: 2, repeat: 3 }, /no Repeat line/, 'Repeat on a wave with no Repeat line is refused in plain words', nr);
    const one = await comp({ addunit: true, unit: m3, cls: 'Vehicle', stage: 2, repeat: 1 }, nr);
    ok(callsOf(one, 'POST /api/x/bots/buyfirst')[0].body.repeat === undefined, 'Repeat 1 on a wave with no Repeat line changes nothing');
  }
  console.log('direct: ' + passes + ' passed, ' + fails + ' failed');
  const a = await kit.run(R, L, {
    verb: 'change', base: { id: 'rus' },
    answers: Object.assign({ addunit: true, unit: { src: 'exist', value: 'm3', name: 'm3' }, cls: 'Vehicle', first: true, diff: 'hard', botcp_hard: 1.5, botcharge_hard: 1, start: 200, persona: 'su-1944-guards', minincome: 300, minteam: 2, stage: 1, repeat: 2 }),
    planFiles: [G + 'bots_generic.inc'], write: true,
    after: (mod, res, ok) => {
      const bd = rd(mod, BD), bg = rd(mod, G + 'bots_generic.inc');
      ok(/"m3"/.test(bd), 'bot.data.lua in the mod buys the m3', bd.slice(0, 300));
      ok(/1000\.0/.test(bd), 'the m3 row comes first (priority 1000.0)');
      ok(/hard[\s\S]*?\{\s*cp\s+1\.50\s*\}/.test(bg), 'hard bots get 1.50 command points', bg.slice(0, 400));
      ok(/\{hard[\s\S]*?chargeFactors\s*\{\s*value\s+"\*=1"/.test(bg), 'hard bots wait the full card timers', bg.slice(0, 600));
      ok(/\{easy[\s\S]*?chargeFactors\s*\{\s*value\s+"\*=0"/.test(bg), 'easy bots keep the game\'s timers (*=0)');
      ok(/"standard_all"\s+start\(200\)/.test(rd(mod, G + 'presets_all.inc')), 'the 100 point standard preset starts at 200', (/s:standard_100_all.*/.exec(rd(mod, G + 'presets_all.inc')) || [''])[0]);
      const b = callsOf(res, 'POST /api/x/bots/buyfirst');
      ok(b.length === 1 && b[0].result && b[0].result.ok === true, 'the buy first route says ok', JSON.stringify(b[0] && b[0].result).slice(0, 400));
      ok(/min_income\s*=\s*300/.test(bd), 'the m3 row waits for 300 income (min_income)', (/.*"m3".*/.exec(bd) || [''])[0]);
      ok(/min_team\s*=\s*2/.test(bd), 'the m3 row waits for a team of 2 (min_team)');
      ok(/Repeat\s*=\s*2\b/.test(bd), 'the first buy wave runs twice (Repeat 2)', (/.*Repeat.*/.exec(bd) || [''])[0]);
      const chk = callsOf(res, 'POST /api/x/doctrine/check');
      ok(chk.length === 1 && chk[0].result && chk[0].result.errors === 0, 'the doctrine check after the style finds no errors', JSON.stringify(chk[0] && chk[0].result).slice(0, 400));
    },
  }, path.join(scratch, 'change'));
  const c = await kit.run(R, L, {
    verb: 'change', base: { id: 'ger' },
    answers: { pfile: 'presets_competitive.inc', pname: { src: 'exist', value: 's:standard_100_competitive' }, start: 250, growtime: 1800 }, write: true,
    after: (mod, res, ok) => {
      const p = rd(mod, G + 'presets_competitive.inc');
      ok(/"standard_competitive"\s+start\(250\)/.test(p), 'the competitive 100 point preset starts at 250', (/s:standard_100_competitive[\s\S]{0,200}/.exec(p) || [''])[0]);
      ok(/define\s+"standard_competitive"[\s\S]*?growTime\s+1800/.test(p), 'the competitive standard rules grow in 1800 s');
      ok(!fs.existsSync(path.join(mod, G + 'presets_all.inc')), 'presets_all.inc is not touched');
    },
  }, path.join(scratch, 'competitive'));
  const b = await kit.run(R, L, {
    verb: 'change', base: { id: 'ger' }, answers: { reset: 'both', pfile: 'presets_test.inc' }, write: true,
    after: (mod, res, ok) => {
      const files = callsOf(res, 'POST /api/x/bots/reset').map(x => x.result && x.result.file).join(',');
      ok(files === 'bots_generic.inc,presets_test.inc', 'the reset puts back bots_generic.inc and the test presets file', files);
    },
  }, path.join(scratch, 'reset'));
  // a cooldown change with a reset of the difficulties: the reset would run after the gen op and undo it
  let why = '';
  try {
    const ans = { reset: { src: 'value', value: 'both' }, botcharge_hard: { src: 'value', value: 1 } };
    await R.compile({}, { base: { id: 'rus' }, mod: path.join(scratch, 'none'), gameDir: null, values: { botcharge_hard: 0 },
      answer: id => ans[id] || null, value: id => (ans[id] ? ans[id].value : undefined), kept: id => !ans[id] });
  } catch (e) { why = e.message; }
  // the own route: a buy that starts from another bot file (botrecipe --stock), dry run into an empty mod
  let stockOk = false, stockSay = '';
  try {
    const mods = path.join(scratch, 'change', 'mods');
    const lua = fs.readdirSync(mods).map(d => path.join(mods, d, BD)).find(p => fs.existsSync(p)) || '';
    const smod = path.join(scratch, 'stockmod'); fs.mkdirSync(smod, { recursive: true });
    const ctx = kit.ctxFor(path.join(scratch, 'stockctx'), { gameDir: kit.findGame({}) });
    const r = await R.routes['POST /api/x/task/r/bots/buy'](null, { mod: smod, unit: 'm3', cls: 'Vehicle', army: 'rus', priority: 2, stockFile: lua, write: false }, ctx);
    stockSay = (r.say || []).join(' | ').slice(0, 400); stockOk = r.ok === true && r.stock === true && !fs.existsSync(path.join(smod, 'resource'));
  } catch (e) { stockSay = e.stack || e.message; }
  console.log((stockOk ? 'ok' : 'FAIL') + ' the stock bot file route plans a buy and writes nothing: ' + stockSay);
  // JOBS: the footer's Cancel kills botrecipe (ctx.runTool answers cancelled): the route says stopped, not a failed buy
  let stopOk = false, stopSay = '';
  try {
    const mods = path.join(scratch, 'change', 'mods');
    const lua = fs.readdirSync(mods).map(d => path.join(mods, d, BD)).find(p => fs.existsSync(p)) || '';
    const smod = path.join(scratch, 'stockmod'), sj = { cancelled: false, writes: false };
    const ctx = Object.assign(kit.ctxFor(path.join(scratch, 'stockctx'), { gameDir: kit.findGame({}) }), { job: sj, runTool: async () => { sj.cancelled = true; return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; } });
    const r = await R.routes['POST /api/x/task/r/bots/buy'](null, { mod: smod, unit: 'm3', cls: 'Vehicle', army: 'rus', priority: 2, stockFile: lua, write: false }, ctx);
    stopSay = JSON.stringify(r).slice(0, 300); stopOk = r.stopped === true && r.ok === false && r.wrote === false && sj.writes === false && !fs.existsSync(path.join(smod, 'resource'));
  } catch (e) { stopSay = e.stack || e.message; }
  console.log((stopOk ? 'ok' : 'FAIL') + ' the stock bot file route stopped from the job list says stopped and writes nothing: ' + stopSay);
  const refused = /reset of the difficulties/.test(why);
  console.log((refused ? 'ok' : 'FAIL') + ' a cooldown change with a reset of the difficulties is refused: ' + why);
  console.log('bots: direct ' + passes + '/' + (passes + fails) + ', change ' + a.passes + '/' + (a.passes + a.fails) + ', competitive ' + c.passes + '/' + (c.passes + c.fails) + ', reset ' + b.passes + '/' + (b.passes + b.fails) + ', own checks ' + ((refused ? 1 : 0) + (stockOk ? 1 : 0)) + '/2');
  const bad = fails + a.fails + b.fails + c.fails || !refused || !stockOk || !stopOk;
  console.log(bad ? 'FAIL' : 'PASS');
  if (bad) process.exitCode = 1;
})();
function LEVELS() { return ['easy', 'normal', 'hard', 'heroic']; }
function PRQ(id) { for (const g of PR.groups) for (const q of g.q) if (q.id === id) return q; return null; }
