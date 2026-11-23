// recipe "army" test: node army.test.js <scratch>. Direct checks first, one per novice hazard: an own flag picture is PNG, TGA or
// GIF by name at upload and goes through the flag route (a picture it cannot read is refused in the plan), cards are picked
// (lookups by army; a typed card no army has is refused), a new army needs its own name and a card, groups need cards and a
// target, the money tabs keep every tab cards use, the mode wide unitset and unit limits are left to the mission task. Then two
// fixture drafts on the stock army rus: make (a new army fin, number 7, allies, an uploaded PNG flag, a card picked from ger,
// written into a scratch mod and read back; then a bots buy for fin, written into the buy list gen made from its cards, read back) and change
// (name, number, flag, a card added and two taken off, a card moved to a group and tab, the side name and an uploaded side
// picture, written, names read back from the mod's .lng files). Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-3e10150e)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const kit = require('../lib/testkit'), D = require('../lib/draft'), CP = require('../lib/compile');
const A = require('../../../../artport/artport');
const scratch = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'task-army-')));
fs.mkdirSync(scratch, { recursive: true });
const R = require('./army.recipe'), L = require('./army.lang');
const rd = (mod, rel) => { try { return fs.readFileSync(path.join(mod, rel), 'latin1'); } catch (e) { return ''; } };
// every .lng file of the mod as text (UTF-16 with a BOM, else UTF-8): the gen text finish writes the army and side names there
const lngs = mod => { const out = []; const walk = d => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.lng$/i.test(e.name)) { const b = fs.readFileSync(p); out.push({ rel: path.relative(mod, p), t: b[0] === 0xff && b[1] === 0xfe ? b.slice(2).toString('utf16le') : b.toString('utf8') }); } } }; walk(mod); return out; };
// key mp/army/fin is written as nested tags {"mp" {"army" {"fin" "Finland"}}}: the parent tags and then the leaf with its text
const hasText = (mod, key, text) => lngs(mod).some(f => { const p = key.split('/'), leaf = p.pop(); return p.every(x => f.t.includes('"' + x + '"')) && new RegExp('\\{\\s*"' + leaf + '"\\s+"' + text + '"', 'i').test(f.t); });
// a picture of w x h staged for a draft (PNG through artport)
const png = (file, w, h) => { const rgba = Buffer.alloc(w * h * 4); for (let i = 0; i < w * h; i++) { rgba[i * 4] = 200; rgba[i * 4 + 1] = i % 255; rgba[i * 4 + 2] = 40; rgba[i * 4 + 3] = 255; } fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, A.encodePng({ w, h, rgba })); };
const tgaSize = p => { try { const b = fs.readFileSync(p); return b[2] + '/' + b.readUInt16LE(12) + 'x' + b.readUInt16LE(14); } catch (e) { return 'none'; } };
const ex = (value, extra) => Object.assign({ src: 'exist', value }, extra || {});
const list = (...items) => ({ src: 'list', items });
const FLAGS = 'resource/interface/pages/multi/';

let makeMod = '';
(async () => {
  const gameDir = kit.findGame({}), dctx = kit.ctxFor(path.join(scratch, 'direct'), { gameDir });
  let fails = 0, passes = 0;
  const ok = (c, m, x) => { if (!c) { fails++; console.log('FAIL ' + m + (x !== undefined ? '\n  ' + String(x).slice(0, 600) : '')); } else passes++; };
  const Q = id => { for (const g of R.groups) for (const q of g.q) if (q.id === id) return q; return null; };
  // upload and Review agree: the flag questions take PNG, TGA and GIF by name only (no jpg or dds sneaks in), and say so
  for (const id of ['flag', 'sideflag']) ok(JSON.stringify(Q(id).picker.kinds) === '[".png",".tga",".gif"]', id + ': the upload takes .png, .tga and .gif only', JSON.stringify(Q(id).picker.kinds));
  const en = k => (L.find(r => r[0] === k) || [])[1] || '';
  ok(/PNG, TGA or GIF/.test(en('task.army.h.flag')) && /32 by 16/.test(en('task.army.h.flag')), 'flag help names the formats and the stock size in pixels', en('task.army.h.flag'));
  ok(!Q('armyid').limits.unit, 'the army number shows no unit word');
  // the upload refuses a picture the flag route cannot convert (a 16 bit or interlaced PNG), so it never passes upload to fail later
  {
    const good = A.encodePng({ w: 4, h: 2, rgba: Buffer.alloc(32, 200) }), deep = Buffer.from(good), lace = Buffer.from(good); deep[24] = 16; lace[28] = 1;
    for (const id of ['flag', 'sideflag']) {
      const ck = Q(id).picker.check;
      ok(typeof ck === 'function' && ck({ name: 'f.png', bytes: good }) == null, id + ': a plain PNG passes the upload check');
      ok(ck({ name: 'f.png', bytes: deep }) === 'task.army.e.flag' && ck({ name: 'f.png', bytes: lace }) === 'task.army.e.flag' && ck({ name: 'f.tga', bytes: Buffer.alloc(30) }) === 'task.army.e.flag', id + ': a 16 bit or interlaced PNG and a broken TGA are refused at upload');
    }
    ok(/^[A-Z]/.test(en('task.army.e.flag')) && /8 bits/.test(en('task.army.e.flag')), 'the upload refusal says what to save instead');
  }
  ok(R.title.make === 'task.army.t' && R.title.change === 'task.army.tc' && en('task.army.tc') && R.test === 'task.army.test' && /lobby/.test(en('task.army.test')) && /buy menu/.test(en('task.army.test')) && /bot/.test(en('task.army.test')), 'a title per verb and a Test step text (lobby, buy menu, bots)');
  for (const r of L) ok(!/\b(bots|units|maps|doctrine|logs|art|files|help|fix) page\b/.test(r[1]), r[0] + ': page names as the GUI shows them', r[1]);
  ok(!Q('unitset') && !Q('unitlimits') && R.kept.some(k => k[0] === 'unitlimits') && R.kept.some(k => k[0] === 'unitset.tags'), 'unitset and unit limits (every army) are left to the mission task');
  ok(/every army/.test(en('task.army.q.budgetbuttons')) && /money/.test(en('task.army.q.budgetbuttons')), 'the money tabs question says money and every army', en('task.army.q.budgetbuttons'));
  ok(R.groups.find(g => g.essential).q.map(q => q.id).join() === 'tag,title,alliance,flag,firstunits,gohfirst', 'the essential group holds what a first time user must answer (gohfirst: GoH only)', R.groups.find(g => g.essential).q.map(q => q.id).join());
  for (const id of ['firstunits', 'unitlist']) ok(Q(id).picker.sources[0] === 'exist' && Q(id).picker.lookup === 'card', id + ': a new line starts as a picked card');
  ok(Q('unitremove').picker.sources[0] === 'exist' && Q('unitremove').picker.lookup === 'own', 'unitremove: a line is picked from the army\'s own cards');
  if (!gameDir) console.log('note: SKIP direct game checks: no game folder');
  else {
    const mod = path.join(scratch, 'direct', 'mods', 'army_direct'); fs.mkdirSync(mod, { recursive: true });
    const save = (verb, answers, base) => D.save(dctx, { id: D.newId('army'), recipe: 'army', verb, game: 'as64', mod, base: { id: base || 'rus' }, answers, kept: [], state: 'open' });
    const v = x => ({ src: 'value', value: x });
    const refuse = async (verb, answers, re, m) => { let e = null; try { await CP.compile(dctx, save(verb, answers), { army: R }); } catch (x) { e = x; } ok(e && re.test(e.message), m, e ? e.message : 'no refusal'); };
    const vm = await R.values(dctx, { id: 'rus' }, { verb: 'make' });
    ok(vm.title === undefined && vm.armyid >= 6, 'values: a new army gets no copied name and a free number', JSON.stringify(vm));
    const fin = { tag: v('fin'), title: v('Finland'), alliance: v('allies') };
    await refuse('make', Object.assign({}, fin, { firstunits: list() }), /at least one/, 'a new army with no card is refused');
    await refuse('make', Object.assign({}, fin, { title: v('') , firstunits: list(ex('pz4h')) }), /name players see/, 'a new army with no name is refused');
    const rusName = R._read.textOf(R._read.reader(gameDir, mod), 'mp/army/rus');
    if (rusName) await refuse('make', Object.assign({}, fin, { title: v(rusName), firstunits: list(ex('pz4h')) }), /already called/, 'a new army named like a stock one is refused');
    await refuse('make', Object.assign({}, fin, { firstunits: list(v('t34_85m')) }), /No army has a vehicle card/, 'a typed card no army has is refused');
    await refuse('make', Object.assign({}, fin, { armyid: v(0), firstunits: list(ex('pz4h')) }), /6 to 99/, 'a new army number below 6 is refused');
    await refuse('change', { groupcards: list(ex('m72')) }, /Pick the cooldown group or the buy tab/, 'cards to move with no group or tab are refused');
    await refuse('change', { cardgroup: ex('b2') }, /Pick the cards/, 'a group with no cards to move is refused');
    await refuse('change', { budgetbuttons: v('squad1 squad2 v1 v2 v3 v4') }, /v5/, 'money tabs that leave out a tab cards use are refused');
    await refuse('change', { unitremove: list(ex('pz4h')) }, /has no card pz4h/, 'taking off a card the army does not have is refused');
    await refuse('change', { unitlist: list(ex('m72')) }, /already has card m72/, 'adding a card the army has is refused');
    const c1 = await CP.compile(dctx, save('change', { groupcards: list(ex('smgs(rus)')), cardgroup: ex('squad_2') }), { army: R });
    const sq = ((c1.gen && c1.gen.ops) || []).find(o => o.op === 'squad');
    ok(sq && sq.change === true && sq.name === 'smgs' && sq.fields.g === 'squad_2', 'a squad moved to a group is a squad change op', JSON.stringify(c1.gen));
    const c2 = await CP.compile(dctx, save('change', { flag: { src: 'file', staged: ['x.png'] } }), { army: R });
    const call = (c2.calls || [])[0];
    ok(call && call.route === 'POST /api/x/task/r/army/flag' && call.body.size === '32x16' && call.body.to === FLAGS + 'flag_rus.tga', 'a PNG flag is a flag route call at the stock size, no refusal', JSON.stringify(c2.calls));
    // lookups: cards to add are other armies' vehicles (not rus's own); own cards and groups of rus
    const dch = save('change', {});
    const lc = await R.lookups.card(dctx, 'pz4h', { mod, draft: dch.id || dch });
    ok(lc.some(x => x.id === 'pz4h' && x.ref.army === 'ger') && !lc.some(x => x.ref.army === 'rus'), 'card lookup: ger pz4h, no rus card', JSON.stringify(lc.slice(0, 3)));
    const lo = await R.lookups.own(dctx, '', { mod, draft: dch.id || dch });
    ok(lo.some(x => x.id === 'home_guards(rus)') && lo.some(x => x.id === 'm72' && /group/.test(x.sub)), 'own lookup: rus squads and vehicles with tab and group', JSON.stringify(lo.slice(0, 2)));
    const lg = await R.lookups.group(dctx, '', { mod, draft: dch.id || dch });
    ok(lg.length > 1 && lg.every(x => /^\d+: /.test(x.sub)), 'group lookup: each group with its cards', JSON.stringify(lg.slice(0, 2)));
    // the flag route: a picture it cannot read is refused in the dry run (the plan), with plain words
    const sid = 'army-direct-flag', st = D.stageDir(dctx, sid); fs.mkdirSync(st, { recursive: true });
    fs.writeFileSync(path.join(st, 'bad.png'), Buffer.from('not a picture at all'));
    let e = null; try { await R.routes['POST /api/x/task/r/army/flag']('', { mod, draft: sid, name: 'bad.png', to: FLAGS + 'flag_rus.tga', size: '32x16', write: false }, dctx); } catch (x) { e = x; }
    ok(e && /could not be read/.test(e.message), 'flag route: an unreadable picture is refused before writing', e ? e.message : 'no refusal');
    png(path.join(st, 'big.png'), 300, 200);
    const r = await R.routes['POST /api/x/task/r/army/flag']('', { mod, draft: sid, name: 'big.png', to: FLAGS + 'flag_rus.tga', size: '32x16', write: false }, dctx);
    ok(r.ok && !fs.existsSync(path.join(mod, FLAGS, 'flag_rus.tga')), 'flag route dry: converts a 300x200 PNG and writes nothing', JSON.stringify(r));
    // JOBS: a write is marked on the request; the footer's Cancel kills the converter: nothing is written
    const sj = { cancelled: false, writes: false };
    const rs = await R.routes['POST /api/x/task/r/army/flag']('', { mod, draft: sid, name: 'big.png', to: FLAGS + 'flag_rus.tga', size: '32x16', write: true },
      Object.assign({}, dctx, { job: sj, runTool: async () => { sj.cancelled = true; return { code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }; } }));
    ok(rs && rs.stopped === true && rs.ok === false && sj.writes === true && !fs.existsSync(path.join(mod, FLAGS, 'flag_rus.tga')), 'flag route stopped: marked as a write, nothing written, no error thrown', JSON.stringify(rs));
  }
  console.log(fails ? 'FAIL (direct checks ' + fails + ')' : 'PASS (direct checks ' + passes + ')');

  // the make fixture: an uploaded 300x200 PNG flag becomes a 32x16 TGA
  const mid = 'army-test-make';
  png(path.join(D.stageDir({ tmpRoot: path.join(scratch, 'make', 'tmp') }, mid), 'fin.png'), 300, 200);
  const a = await kit.run(R, L, {
    id: mid, verb: 'make', base: { id: 'rus' }, modInfo: true,
    answers: { tag: 'fin', title: 'Finland', armyid: 7, alliance: 'allies', flag: { src: 'file', staged: ['fin.png'] }, firstunits: list(ex('pz4h', { ref: { army: 'ger' } })) },
    planFiles: ['resource/set/multiplayer/armies/fin.set', 'resource/set/multiplayer/units/vehicles_fin.set', FLAGS + 'flag_fin.tga'],
    write: true,
    after: (mod, res, ok) => {
      const t = rd(mod, 'resource/set/multiplayer/armies/fin.set');
      ok(/\{\s*id\s+7\s*\}/.test(t), 'fin.set has id 7', t);
      ok(/mp\/army\/fin/.test(t), 'fin.set names its title text', t);
      ok(/flag_fin/.test(t), 'fin.set shows its own flag', t);
      ok(/"fin"/.test(rd(mod, 'resource/set/multiplayer/games/preset_alliances.inc')), 'fin is on the allies side');
      ok(/vehicles_fin\.set/.test(rd(mod, 'resource/set/multiplayer/units/vehicles.set')), 'vehicles.set includes the new list');
      ok(tgaSize(path.join(mod, FLAGS, 'flag_fin.tga')) === '2/32x16', 'the uploaded PNG flag is a 32x16 TGA in the mod', tgaSize(path.join(mod, FLAGS, 'flag_fin.tga')));
      ok(hasText(mod, 'mp/army/fin', 'Finland'), 'a .lng file of the mod names mp/army/fin Finland', lngs(mod).map(f => f.rel).join(', '));
      const vf = rd(mod, 'resource/set/multiplayer/units/vehicles_fin.set');
      ok(/\{\s*"pz4h"[^\r\n]*\bs\(fin\)/.test(vf), 'the new army has the pz4h card picked from ger, sold as fin', vf.slice(0, 400));
      makeMod = mod;
    },
  }, path.join(scratch, 'make'));
  const cid = 'army-test-change';
  png(path.join(D.stageDir({ tmpRoot: path.join(scratch, 'change', 'tmp') }, cid), 'side.png'), 64, 64);
  const b = await kit.run(R, L, {
    id: cid, verb: 'change', base: { id: 'rus' },
    answers: {
      title: 'Red Army', armyid: 9, flag: { src: 'exist', value: 'usa', name: 'flag_usa' },
      unitlist: list(ex('pz4h')), unitremove: list(ex('home_guards(rus)'), ex('gaz67b')),
      groupcards: list(ex('m72')), cardgroup: ex('b2'), cardtab: ex('v2'),
      sidename: 'SOVIET BLOC', sideflag: { src: 'file', staged: ['side.png'] },
    },
    planFiles: ['resource/set/multiplayer/armies/rus.set', 'resource/set/multiplayer/units/vehicles_rus.set', FLAGS + 'flag_rus.tga', FLAGS + 'flag_allies.tga', 'resource/set/multiplayer/units/squads.set'],
    write: true,
    after: (mod, res, ok) => {
      ok(/\{\s*id\s+9\s*\}/.test(rd(mod, 'resource/set/multiplayer/armies/rus.set')), 'rus.set has the new id 9');
      const v = rd(mod, 'resource/set/multiplayer/units/vehicles_rus.set');
      ok(/\{\s*"pz4h"/.test(v), 'the pz4h card is in the rus list');
      ok(/\{\s*"m72"[^\r\n]*\bg\(b2\)[^\r\n]*\bb\(v2\)/.test(v), 'm72 is in group b2 on tab v2', (/\{\s*"m72".*/.exec(v) || [''])[0]);
      ok(/\{\s*"gaz67b"[\s\S]{0,400}?\{\s*remove\s*\}/.test(v), 'gaz67b is taken off with {remove}', (/\{\s*"gaz67b"[\s\S]{0,300}/.exec(v) || [''])[0]);
      ok(fs.existsSync(path.join(mod, FLAGS, 'flag_rus.tga')), 'the usa flag is copied over the rus flag');
      ok(tgaSize(path.join(mod, FLAGS, 'flag_allies.tga')) === '2/32x16', 'the uploaded side picture is a 32x16 TGA over the allies picture', tgaSize(path.join(mod, FLAGS, 'flag_allies.tga')));
      ok(/\{\s*"home_guards\(rus\)"\s*\{\s*remove\s*\}\s*\}/.test(rd(mod, 'resource/set/multiplayer/units/squads.set')), 'home_guards(rus) is taken off the list');
      ok(!fs.existsSync(path.join(mod, 'resource/set/multiplayer/games/presets_all.inc')), 'nothing every army shares was written');
      ok(hasText(mod, 'mp/army/rus', 'Red Army'), 'a .lng file of the mod names mp/army/rus Red Army', lngs(mod).map(f => f.rel).join(', '));
      ok(hasText(mod, 'mp/alliance/allies', 'SOVIET BLOC'), 'a .lng file of the mod names the allies side SOVIET BLOC');
      // LOC-19: the stock keys go into the mod copy of #dlg_mp.lng (it replaces the game's file whole)
      const dlg = lngs(mod).find(x => /#dlg_mp\.lng$/i.test(x.rel));
      ok(!!dlg && /Red Army/.test(dlg.t) && /SOVIET BLOC/.test(dlg.t), 'the stock army and side names are in the mod copy of #dlg_mp.lng (LOC-19)', lngs(mod).map(f => f.rel).join(', '));
      ok((res.notes || []).concat(JSON.stringify(res)).join(' ').includes('every army on the allies side'), 'Review says the side picture is shared by every army on the side');
    },
  }, path.join(scratch, 'change'));
  // a new army written with its cards gets a bot buy list: gen writes its ["fin"] Units block from the roster cards
  const bd = makeMod ? rd(makeMod, 'resource/script/multiplayer/bot.data.lua') : '';
  const block = /\[\s*"fin"\s*\]\s*=\s*\{[^\r\n]*[\r\n]+[^\r\n]*unit\s*=\s*"pz4h"/.test(bd);
  console.log((block ? 'ok' : 'FAIL') + ' bot.data.lua of the new army has a ["fin"] list with its pz4h');
  // then a bots page buy for fin, written into the mod and read back: the one card list gen wrote (its last row has no comma, as
  // vanilla's) takes a second buy line (botrecipe anchors on that row too)
  // fin has no m72 card yet (m72 is a card of rus only): the Bots page refuses the buy, a bot buys only what its own army's cards offer.
  // The army task then gives fin the card (change, a card picked from rus, written into the mod's vehicles_fin.set) and the buy goes through
  let bots = 'skipped', botsOk = false, card = { passes: 0, fails: 0 }, foreign = '';
  if (makeMod) {
    const ctx = kit.ctxFor(path.join(scratch, 'botsctx'), { gameDir });
    try { await require('../../bots/lib').buyFirst(ctx, { mod: makeMod, unit: 'm72', army: 'fin', cls: 'Vehicle', priority: 2, write: true }); foreign = 'no refusal'; } catch (e) { foreign = e.key || e.message; }
    console.log((foreign === 'bots.e.wrongArmy' ? 'ok' : 'FAIL') + ' a bots buy of m72 for fin before fin has the card is refused: ' + foreign);
    card = await kit.run(R, L, {
      id: 'army-test-card', verb: 'change', base: { id: 'fin' }, mod: makeMod, answers: { unitlist: list(ex('m72', { ref: { army: 'rus' } })) }, write: true,
      after: (mod, res, ok) => ok(/\{\s*"m72"[^\r\n]*\bs\(fin\)/.test(rd(mod, 'resource/set/multiplayer/units/vehicles_fin.set')), 'the new army has the m72 card picked from rus, sold as fin'),
    }, path.join(scratch, 'card'));
    try {
      const r = await require('../../bots/lib').buyFirst(ctx, { mod: makeMod, unit: 'm72', army: 'fin', cls: 'Vehicle', priority: 2, write: true });
      const after = rd(makeMod, 'resource/script/multiplayer/bot.data.lua');
      const fin = (/\[\s*"fin"\s*\]\s*=\s*\{[\s\S]*?\n\s*\}/.exec(after) || [''])[0];
      botsOk = r.ok === true && /unit\s*=\s*"pz4h"/.test(fin) && /unit\s*=\s*"m72"/.test(fin);
      bots = botsOk ? 'written, the fin list has pz4h and m72' : 'ok ' + r.ok + ' ' + (r.code || '') + ' ' + fin.slice(0, 300);
    } catch (e) { bots = e.message; }
  }
  console.log((botsOk ? 'ok' : 'FAIL') + ' a bots buy of m72 for the new army fin, read back: ' + bots);
  botsOk = botsOk && block && foreign === 'bots.e.wrongArmy' && !card.fails;
  console.log('army: direct ' + passes + '/' + (passes + fails) + ', make ' + a.passes + '/' + (a.passes + a.fails) + ', change ' + b.passes + '/' + (b.passes + b.fails));
  console.log(fails + a.fails + b.fails || !botsOk ? 'FAIL' : 'PASS');
  if (fails + a.fails + b.fails || !botsOk) process.exitCode = 1;
})();
