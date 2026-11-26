// GUI-EXT bots test. Arg: scratch dir. No game, no network: fixtures in the scratch dir + the botrecipe chainn3 fixture.
// Author: Imperator_Aug (ARSENAL, ia-aa347c16)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'bots-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index'), lib = require('./lib');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };
const T = path.join(__dirname, '..', '..', '..');       // tools/
const FX = path.join(T, 'botrecipe', 'test', 'chainn3');
const mod = path.join(work, 'mod'), gameDir = path.join(work, 'game'); modInfo(mod);
const W = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t, 'latin1'); };

// fake mod: chainn3 mod + stock bot.data.lua + small number files (CRLF, a tab, a cp1251 byte)
fs.cpSync(path.join(FX, 'mod'), mod, { recursive: true });
fs.cpSync(path.join(FX, 'stock', 'script'), path.join(mod, 'resource', 'script'), { recursive: true });
fs.rmSync(path.join(mod, 'resource', 'script', 'multiplayer', 'bot.lua'), { force: true });
const G = path.join(mod, 'resource', 'set', 'multiplayer', 'games');
const generic = '{easy\r\n\t{balancingFactorBonus {cp 0.75} {mp 0.75} {payback 0.75} }\r\n}\r\n{normal\r\n\t{balancingFactorBonus {cp 1.00} {mp 1.00} {payback 1.00} }\r\n}\r\n';
W(path.join(G, 'bots_generic.inc'), generic);
const presets = '; \xe0\xe1 comment\r\n(define "test_all"\r\n\t{common\r\n\t\t{balancingFactorBonus {cp 1.0} {mp 1.0} }\r\n\t\t{growTime\t1500}\r\n\t\t{payback\r\n\t\t\t{cp \t"0\t25\t50"}\r\n\t\t\t{restore "1.50\t1.25\t0.75"}\r\n\t\t}\r\n\t}\r\n)\r\n{presets\r\n\t{"s:standard_100_all" ("test_all" start(160) finish(3000) cp(100))}\r\n}\r\n';
W(path.join(G, 'presets_test.inc'), presets);
const ctx = {
  game: () => null, allowLaunch: false, gamedir: null, tools: T, tmpRoot: work,
  runTool: async (tool, entry, args) => { const r = cp.spawnSync(process.execPath, [path.join(T, entry)].concat(args), { encoding: 'utf8' }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: false }; },
};
// writes need a game folder set (I-9): a fake AS2 install (exe + resource/), no paks
fs.mkdirSync(path.join(gameDir, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gameDir, 'as64.exe'), '');
const wctx = Object.assign({}, ctx, { game: () => gameDir });
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes;

// ---- game parity (made-up fixtures): MoW:AS2 reads the shared install without as64/core; GoH reads its own presets and bot difficulty
// ---- wave 3 (S17-S20): armies from real cards, the Undo registry, Reset greyed, match terms, the first screen, main text
async function wave3() {
  const B = require('./blkboot'), en = X.lang.en, fill = (k, p) => Object.keys(p).reduce((s, x) => s.split('{' + x + '}').join(p[x]), en[k]);
  // S17: helper files (vehicles_x.set, vehicles_xnotanks.set) are no army; their cards are units bots cannot buy; a card of the folder's army
  const m3 = path.join(work, 'w3mod'), US = [m3, 'resource', 'set', 'multiplayer', 'units']; modInfo(m3);
  W(path.join(...US, 'vehicles_ger.set'), '{"pz4h"\t("vs" t(tank) s(ger) c(6))}\r\n{"pz3j"\t("vs" t(tank) c(5))}\r\n');
  W(path.join(...US, 'vehicles_x.set'), '{"veteran_tiger"\t("vs" t(tank) c(9))}\r\n{"sturmtiger"\t("vs" t(tank) c(9))}\r\n');
  W(path.join(...US, 'vehicles_xnotanks.set'), '{"mp/rus/tankman"\t("vs" t(inf) side(rus))}\r\n{"katyusha_x"\t("vs" t(art) c(4))}\r\n');
  W(path.join(...US, 'ger_ss', 'vehicles_41.set'), '{"tiger_ss"\t("vs" t(tank) c(9))}\r\n');
  const ul = lib.unitList(ctx, m3), ar = [...new Set(ul.units.map(u => u.army))].sort();
  ok(ar.join() === 'ger,ger_ss' && !ul.units.some(u => /^(x|xnotanks)$/.test(u.army)), 'S17: no army "x" or "xnotanks" from helper files: ' + ar.join());
  ok(['veteran_tiger', 'sturmtiger', 'katyusha_x'].every(u => ul.cannot.some(c => c.unit === u && c.why === 'noArmy')) && !ul.cannot.some(c => c.unit.includes('/')), 'S17: helper-file units listed as cannot-buy with the reason, crews left out: ' + ul.cannot.map(c => c.unit).join());
  ok(ul.units.some(u => u.unit === 'pz3j' && u.army === 'ger') && ul.units.some(u => u.unit === 'tiger_ss' && u.army === 'ger_ss'), 'S17: a card with no s() takes its file or folder army');
  ok(Object.keys(ul.armies || {}).every(a => ul.armies[a] && !/^(x|xnotanks)$/.test(a)) && ul.armies.ger_ss === lib.ARMY_NAMES.ger_ss, 'S17: every army code has a name: ' + JSON.stringify(ul.armies));
  ok(lib.unitArmy(ctx, m3, 'veteran_tiger').card === true && !lib.unitArmy(ctx, m3, 'veteran_tiger').armies.length && lib.hasCard(ctx, m3, 'pz4h'), 'lib.unitArmy / hasCard for the buy check part');
  ok(['ger_ss', 'rus_guard', 'axis_minor'].every(a => lib.ARMY_NAMES[a]) && lib.shortName('A very long army name that goes on and on and on') .length <= 33 && !/\s\S{1,3}…$/.test(lib.shortName('A very long army name that goes on and on and on')) && lib.shortName('U.S. Army', 32, true) === 'U.S. Army', 'army names: the new codes; long labels cut at a word end');
  for (const [u, k] of [['veteran_tiger', 'bots.e.noArmy']]) { let e = null; try { await R['POST /api/x/bots/buyfirst'](null, { mod: m3, unit: u, cls: 'Tank' }, ctx); } catch (x) { e = x; }
    ok(e && e.key === k && en[k] && !/\{/.test(fill(k, e.params || {})), 'S17: ' + u + ' refused at Preview with a plain sentence: ' + (e && e.message)); }
  ok(['bots.e.noArmy', 'bots.e.wrongArmy', 'bots.add.cannot', 'bots.add.why.noArmy', 'bots.kind.Sniper', 'bots.kind.Officer', 'bots.kind.MG', 'bots.kind.Airborne', 'bots.na.short', 'bots.reset.noCopy', 'bots.see.bots', 'bots.see.own', 'bots.done.what'].every(k => ['ru', 'uk', 'zh'].every(c => X.lang[c][k] && X.lang[c][k] !== en[k])), 'S20: the wave 3 strings in four languages');
  ok(['uk'].every(c => Object.keys(X.lang[c]).filter(k => !/^bots\.(botmatch|brain|buycheck|limits|mission|modeready|recipes|stages|targets)\./.test(k)).every(k => !/мап[аиуіо]/i.test(X.lang[c][k].replace(/«Мапи»/g, '')))), 'S20: uk says карта on these pages (the Maps page keeps its name)');

  // the page: Undo registry, Reset greyed, match terms, first screen, main text
  let can = false; const rel = 'set/multiplayer/games/bots_generic.inc';
  const stage = n => ({ n, repeat: 0, armies: { ger: Array.from({ length: 12 }, (_, i) => ({ unit: 'u' + n + '_' + i, cls: i % 2 ? 'Sniper' : 'Tank', priority: 1 })) } });
  const route = (p, m, body) => /\/undo$/.test(p) && m === 'GET' ? { files: [{ rel, ok: can, n: can ? 1 : 0, id: 'u1' }] } : /\/undo$/.test(p) ? (can = false, { ok: true }) :
    /table$/.test(p) ? { file: 'bots_generic.inc', from: 'game', rows: [{ id: 'g|easy|cp', group: 'easy', field: 'botCp', current: '0.75', vanilla: '0.75', kind: 'num' }] } :
    /edit$/.test(p) ? Object.assign({ changes: [{ id: 'g|easy|cp', group: 'easy', field: 'botCp', was: '0.75', now: body.changes['g|easy|cp'] }], copiesWholeFile: true, target: 'C:/m/resource/' + rel }, body.write ? (can = true, { written: true, undo: [{ rel, id: 'u1' }] }) : {}) :
    /buys$/.test(p) ? { from: 'game', ownBot: false, compared: true, labels: { ger: 'Wehrmacht' }, classes: ['Infantry', 'Tank', 'Sniper'], stages: [stage(1), stage(2), stage(3)], cards: [] } :
    /units$/.test(p) ? { units: [{ unit: 'pz4h', army: 'ger', name: 'Panzer IV H', cls: 'Tank' }], cannot: [{ unit: 'veteran_tiger', army: null, why: 'noArmy', name: 'Tiger (veteran)', cls: 'HeavyTank' }], armies: { ger: 'Wehrmacht' } } : undefined;
  const P = await B.boot({ 'as2gui.mod': 'C:/mods/my mod' }, route); P.ctx.as2Link('page:bots'); await P.settle();
  const s = P.sec('bots'), blk = id => s.all().find(e => B.isB(e) && e.dataset.blk === id), btnIn = (id, txt) => (blk(id) || { all: () => [] }).all().find(e => e.tagName === 'BUTTON' && e.textContent === txt);
  ok(blk('mod') && blk('mod').textContent === fill('bots.mod', { p: 'my mod' }), 'S10: the mod by its folder name only: ' + (blk('mod') && blk('mod').textContent));
  ok(blk('group.a').all().filter(e => e.tagName === 'SUMMARY' || e.tagName === 'H3').filter(e => e.textContent.indexOf(en['bots.buys.h']) >= 0).length === 1, '"What bots buy" said once (group and card)');
  const rs = btnIn('diff.btns', en['bots.btn.reset']); ok(rs && rs.disabled && rs.title === en['bots.reset.noCopy'], 'Reset greyed with a plain hover text when the mod has no copy');
  const sel = blk('add.f.cls') && blk('add.f.cls').all().find(e => e.tagName === 'SELECT'); ok(sel && sel.children.map(o => o.value).join() === 'Infantry,Tank,Sniper' && sel.children[2].textContent === en['bots.kind.Sniper'], 'Kind of unit: the classes of the list, worded');
  const ui = blk('add.f.unit').all().find(e => e.tagName === 'INPUT'); ok(ui.attrs.placeholder === fill('bots.add.unitHintN', { name: 'Panzer IV H' }), 'the example is a real in-game name of the list: ' + ui.attrs.placeholder);
  ok(blk('add.cannot') && blk('add.cannot').textContent === en['bots.add.cannot'] && blk('add.f.prio') && blk('add.f.prio').textContent.includes(en['bots.add.prioRange']), 'the cannot-buy toggle; priority shows its range and stock value');
  // the first screen: the task list and the first card, under 30 lines; the later stages folded
  { const lines = []; let stop = false; const cards = s.all().filter(e => /\bcard\b/.test(String(e.className || '')));
    const walk = e => { if (stop) return; if (e === cards[1]) { stop = true; return; } if (e.hidden || (e.tagName === 'DETAILS' && !e.open)) { const su = e.children && e.children.find(c => c.tagName === 'SUMMARY'); if (su && !e.hidden) lines.push(su.textContent); return; }
      if (/^(LI|H2|H3|SUMMARY|LABEL)$/.test(e.tagName) || (e.tagName === 'DIV' && e.children.some(c => c.tagName === '#TEXT' && c.textContent.trim()))) { lines.push(e.textContent); if (e.tagName !== 'DIV') return; }
      (e.children || []).forEach(walk); };
    walk(s); ok(lines.length > 10 && lines.length < 30, 'first screen: task list + first card in ' + lines.length + ' lines (under 30)'); }
  // S20: no file extension and no bracketed code in the main text of the frame (Details, small code and form values aside)
  { const bad = [], skip = /^(DETAILS|SMALL|OPTION|SELECT|INPUT|TEXTAREA|SCRIPT|STYLE)$/;
    const walk = e => { if (skip.test(e.tagName)) return; if (e.tagName === '#TEXT') { const x = e.textContent; if (/\.(set|inc|lua|def|mdl|lng|ext)\b/i.test(x) || /\((?:(?=[a-z0-9_]*[0-9_])[a-z0-9_]{1,12}|[a-z]{2,4})\)/.test(x)) bad.push(x.slice(0, 80)); return; } (e.children || []).forEach(walk); };
    ['title', 'lead', 'tasks', 'pages', 'game', 'mod', 'buys', 'add', 'diff', 'how', 'adv'].forEach(id => { const b = blk(id); if (b) walk(b); });
    ok(!bad.length, 'S20: main text has no file extension or bracketed code: ' + bad.join(' | ')); }
  // match terms: the difficulty preview says what changes in a match
  const inp = blk('diff').all().find(e => e.tagName === 'INPUT'); inp.value = '0.9'; inp.fire('input');
  ok(blk('diff').textContent.includes(fill('bots.tbl.usual', { lo: '0.25', hi: '4' })), 'difficulty: a sensible range (0.25 to 4), not 0 to 100');
  btnIn('diff.btns', en['bots.btn.preview']).click(); await P.settle();
  const said = fill('bots.eff.units.down', { g: en['bots.d.easy'], p: '10', was: fill('bots.eff.was.down', { p: '25' }) });
  ok(blk('diff.res').textContent.includes(said), 'difficulty preview in match terms: ' + blk('diff.res').textContent.slice(0, 160));
  // S18: write, then Undo in the green box: the card's own Undo greys again, no old "Undone" line twice, no path in the main text
  P.ctx.confirm = () => true; btnIn('diff.btns', en['bots.btn.write']).click(); await P.settle();
  const box = blk('diff.res').all().find(e => e.dataset && e.dataset.done);
  ok(box && box.textContent.indexOf(fill('bots.done.what', { what: said })) === 0, 'S18: "Done: <what changed>."');
  const cu = () => blk('diff.btns').all().find(e => e.dataset && e.dataset.cardundo);
  ok(cu() && !cu().disabled, 'after the write the card Undo is on');
  box.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['bots.btn.undo']).click(); await P.settle();
  ok(cu() && cu().disabled && !blk('diff.btns').textContent.includes(en['bots.undo.done']), 'S18: after the green-box Undo the card Undo greys again (one Undo state per file)');
  // the registry in the kit: two card Undos of one file refresh together; a new green box clears the old Undone line
  { const K = P.ctx.BOTS_UI.kit; can = true; const a = K.undoBtn([rel]), b = K.undoBtn(['resource/' + rel]); await P.settle();
    ok(!a.button.disabled && !b.button.disabled, 'registry: both on'); a.button.click(); await P.settle();
    ok(a.button.disabled && b.button.disabled && a.textContent.includes(en['bots.undo.done']) && !b.textContent.includes(en['bots.undo.done']), 'registry: Undo on one greys the other of the same file');
    K.done(null, { lines: ['x'], undo: [{ rel, id: 'u2' }] }); ok(!a.textContent.includes(en['bots.undo.done']), 'registry: a new green box clears the old Undone line'); }
  // round 5: the Undone line of a card Undo is drawn where the done box goes (the card's result leaf), never inside the button row
  { const K = P.ctx.BOTS_UI.kit; can = true; const ub = K.undoBtn([rel]), row = K.leaf('zz.btns', [ub]), res = P.ctx.document.createElement('div'), card = K.section('zz', 'ZZ', [row, K.leaf('zz.res', [res])]); await P.settle();
    ub.button.click(); await P.settle();
    ok(card && res.textContent === en['bots.undo.done'] && !row.textContent.includes(en['bots.undo.done']), 'kit.undoBtn: Undone goes where the done box goes: ' + res.textContent + ' / ' + row.textContent);
    ok(en['bots.e.undoChanged'].indexOf('{file}') < 0 && /Write into my mod/.test(en['bots.e.undoChanged']) && ['ru', 'uk', 'zh'].every(c => X.lang[c]['bots.e.undoChanged'].includes(X.lang[c]['bots.btn.write'])), 'undo refusal: no path in the main text, a next step that names the button'); }
  ok(!en['bots.e.undoNone'].includes('{file}'), 'S18: "Nothing to undo" names no path');
  // GoH: the difficulty group first, greyed fold lines of the cards that cannot work there
  { const P3 = await B.boot({ 'as2gui.gameId': 'goh', 'as2gui.games': { goh: { dir: '', mod: 'C:/m', roots: null, screen: 'bots' } } }, p => /table$/.test(p) ? { rows: [] } : undefined);
    P3.ctx.as2Link('page:bots'); await P3.settle(); const s3 = P3.sec('bots'), b3 = id => s3.all().find(e => B.isB(e) && e.dataset.blk === id);
    ok(b3('group.c').open === true && b3('group.a').open === false && b3('diff').dataset.folded === '0', 'GoH: the difficulty group and card open first');
    const fl = b3('add').all().find(e => e.dataset && e.dataset.foldline); ok(fl && fl.textContent !== fill('bots.na.short', { game: 'Gates of Hell' }) && !B.ids(s3).includes('add.na'), 'GoH: the add card is a working card, not greyed: ' + (fl && fl.textContent)); }
}

async function parity() {
  const as2 = path.join(work, 'par-as2'), goh = path.join(work, 'par-goh'), pm = path.join(work, 'par-mod'), GG = ['resource', 'set', 'multiplayer', 'games']; modInfo(pm);
  // shared AS2 install: as64.exe, base bots_generic (cp 0.75) and an as64/core copy (cp 0.99) that only AS64 mounts
  W(path.join(as2, 'as64.exe'), ''); W(path.join(as2, 'mowas_2.exe'), '');
  W(path.join(as2, ...GG, 'bots_generic.inc'), generic);
  W(path.join(as2, 'as64', 'core', ...GG, 'bots_generic.inc'), generic.replace('{cp 0.75}', '{cp 0.99}'));
  fs.mkdirSync(pm, { recursive: true });
  const runs = [];
  const gctx = (id, dirs) => Object.assign({}, ctx, { gameId: () => id, exe: () => ({ as64: 'as64', mowas2: 'mowas_2', goh: 'goh' })[id], kind: () => (id === 'goh' ? 'goh' : 'as2'),
    game: () => as2, gohDir: () => goh, curDir: () => (id === 'goh' ? goh : as2), runTool: async (t, e, a) => { runs.push([id, a]); return { code: 0, stdout: 'ok', stderr: '' }; } }, dirs || {});
  const cell = (t, id) => (t.rows.find(r => r.id === id) || {}).vanilla;
  const tm = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(pm) + '&file=bots_generic.inc'), null, gctx('mowas2'));
  const ta = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(pm) + '&file=bots_generic.inc'), null, gctx('as64'));
  const t0 = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(pm) + '&file=bots_generic.inc'), null, Object.assign({}, ctx, { game: () => as2 }));
  ok(cell(tm, 'bots_generic.inc|easy|cp') === '0.75', 'mowas2: stock numbers from the game without as64/core: ' + cell(tm, 'bots_generic.inc|easy|cp'));
  ok(cell(ta, 'bots_generic.inc|easy|cp') === '0.99' && cell(t0, 'bots_generic.inc|easy|cp') === '0.99', 'as64 (named or not): as64/core wins, as before; caches per game');
  ok(lib.gameOf(gctx('mowas2')).exe === 'mowas_2' && lib.gameOf(gctx('as64')).exe === undefined && lib.gameOf(ctx).id === 'as64', 'gameOf: exe only for a game other than AS64');
  await R['POST /api/x/bots/buyfirst'](null, { mod: pm, unit: 'mk7', cls: 'Tank', first: true }, gctx('mowas2'));
  await R['POST /api/x/bots/buyfirst'](null, { mod: pm, unit: 'mk7', cls: 'Tank', first: true }, gctx('as64'));
  const ra = runs.find(r => r[0] === 'mowas2'), rb = runs.find(r => r[0] === 'as64');
  ok(ra && ra[1].join(' ').includes('--exe mowas_2') && ra[1].includes('--game'), 'mowas2: botrecipe gets --exe mowas_2: ' + (ra && ra[1].join(' ')));
  ok(rb && !rb[1].includes('--exe'), 'as64: the botrecipe argument list as before (no --exe)');
  // the pair: the real botrecipe takes --exe mowas_2 (dry run on the chainn3 mod, game = the fake install)
  const real = await R['POST /api/x/bots/buyfirst'](null, { mod, unit: 'mk7', cls: 'Tank', first: true }, Object.assign({}, wctx, { gameId: () => 'mowas2', exe: () => 'mowas_2', kind: () => 'as2', curDir: () => gameDir }));
  ok(real.ok && !real.wrote, 'mowas2: botrecipe dry run with --exe mowas_2 works: ' + JSON.stringify(real.say).slice(0, 300));

  // GoH install (made up, same forms as the vanilla files): bots_generic per difficulty, a preset file with a define and a {presets} block
  W(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
  const GP = [...GG, 'presets'];
  const gbots = '{easy\r\n\t{unitset\r\n\t\t{value %period}\r\n\t}\r\n\t{balancingFactorBonus\r\n\t\t{cp 0.80}\r\n\t\t{mpStart 1.10}\r\n\t\t{mpFinish 0.8}\r\n\t\t{payback 0.8}\r\n\t\t{chargeDelay 1.0}\t;// {charge 9.9} in a comment\r\n\t\t{charge 1.0}\r\n\t}\r\n\t{unitScore 1.2}\r\n}\r\n{hard\r\n\t{balancingFactorBonus\r\n\t\t{cp 1.00}\r\n\t\t{mpStart 1.10}\r\n\t\t{mpFinish 1.25}\r\n\t\t{payback 3.50}\r\n\t\t{chargeDelay 1.0}\r\n\t\t{charge 1.0}\r\n\t}\r\n\t{unitScore 0.8}\r\n}\r\n';
  W(path.join(goh, ...GP, 'global_parameters', 'bots_generic.inc'), gbots);
  const gpre = '; == mid \xe0 ==\r\n(define "standard_all"\r\n\t{common\r\n\t\t(include "global_parameters/budget.inc" s(%start) f(%finish) d(%doctrine))\r\n\t}\r\n)\r\n{presets\r\n\t{"s:mid_standard_100"\r\n\t\t{gameMode "standard"}\r\n\t\t("standard_all"\t\tstart(200) finish(3300) doctrine(200) cp(0:100,900:150,1800:200))\r\n\t\t{ranked}\r\n\t}\r\n;\t("old" start(1))\r\n\t{"s:fl"\r\n\t\t("standard_all"\tstart_a(2650) finish_a(2650) cp_a(0:175,900:200) cp_b(1000))\r\n\t}\r\n}\r\n';
  W(path.join(goh, ...GP, 'preset_mid.inc'), gpre);
  const hc = gctx('goh'), F = 'presets/preset_mid.inc';
  ok(lib.filesOf(hc).includes(lib.GOH_BOTS) && lib.filesOf(hc).includes(F) && !lib.filesOf(hc).includes('bots_generic.inc'), 'goh: its own file list');
  const tb = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(pm) + '&file=' + encodeURIComponent(lib.GOH_BOTS)), null, hc);
  const fb = [...new Set(tb.rows.map(r => r.field))].join();
  ok(tb.from === 'game' && tb.rows.length === 14 && fb === 'botCp,mpStart,mpFinish,botPayback,chargeDelay,charge,unitScore', 'goh: bot difficulty rows (2 x 7), comment skipped: ' + tb.rows.length + ' ' + fb);
  ok(tb.rows.find(r => r.id === lib.GOH_BOTS + '|easy|charge').current === '1.0' && tb.rows.find(r => r.id === lib.GOH_BOTS + '|hard|unitScore').current === '0.8', 'goh: values read from the right block');
  const tq = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(pm) + '&file=' + encodeURIComponent(F)), null, hc);
  const q = id => tq.rows.find(r => r.id === F + '|' + id) || {};
  ok(tq.rows.length === 8 && q('s:mid_standard_100|cp').kind === 'steps' && q('s:mid_standard_100|doctrine').current === '200' && q('s:fl|cp_b').kind === 'int' && !tq.rows.some(r => r.group === 'old'), 'goh: preset rows (define include and commented calls skipped): ' + tq.rows.map(r => r.group + '.' + r.field).join());
  ok(tq.rows.every(r => r.part === 'preset'), 'goh: preset rows marked for the presets editor');
  const same = {}; tq.rows.forEach(r => { same[r.id] = r.current; });
  ok((await R['POST /api/x/bots/edit'](null, { mod: pm, file: F, changes: same, write: false }, hc)).changes.length === 0, 'goh: same values = no change (round trip)');
  let es = null; try { await R['POST /api/x/bots/edit'](null, { mod: pm, file: F, changes: { [F + '|s:mid_standard_100|cp']: '0:100,900:150' }, write: false }, hc); } catch (x) { es = x; }
  ok(es && es.status === 400 && /same count of steps/.test(es.message), 'goh: a steps value keeps its step count');
  const wr = await R['POST /api/x/bots/edit'](null, { mod: pm, file: F, changes: { [F + '|s:mid_standard_100|cp']: '0:120,900:150,1800:210', [F + '|s:mid_standard_100|start']: '250' }, write: true }, hc);
  const out = path.join(pm, ...GP, 'preset_mid.inc');
  ok(wr.written && fs.existsSync(out) && fs.readFileSync(out, 'latin1') === gpre.replace('start(200)', 'start(250)').replace('cp(0:100,900:150,1800:200)', 'cp(0:120,900:150,1800:210)'), 'goh: written at resource/set/multiplayer/games/presets/ in the mod, CRLF and bytes kept');
  const wb = await R['POST /api/x/bots/edit'](null, { mod: pm, file: lib.GOH_BOTS, changes: { [lib.GOH_BOTS + '|hard|mpFinish']: '1.5' }, write: true }, hc);
  ok(wb.written && fs.readFileSync(path.join(pm, ...GP, 'global_parameters', 'bots_generic.inc'), 'latin1') === gbots.replace('{mpFinish 1.25}', '{mpFinish 1.5}'), 'goh: bot difficulty written');
  // a folder inside the GoH install: the shared write guard refuses
  const inG = path.join(goh, 'mods', 'mine'); fs.mkdirSync(inG, { recursive: true });
  let eg = null; try { await R['POST /api/x/bots/edit'](null, { mod: inG, file: F, changes: { [F + '|s:mid_standard_100|start']: '260' }, write: true }, hc); } catch (x) { eg = x; }
  ok(eg && eg.status === 400 && !fs.existsSync(path.join(inG, 'resource')), 'goh: no write inside the GoH install: ' + (eg && eg.message));
  let ef = null; try { await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(pm) + '&file=bots_generic.inc'), null, hc); } catch (x) { ef = x; }
  ok(ef && /Unknown file/.test(ef.message), 'goh: an AS2 file name is not a GoH file');
  // GoH purchase lists (made up, same forms as the vanilla files): no list yet = the plain "no lists" line; then a period and a conquest list,
  // the lobby mode map, a mod copy that wins and a line the reader does not read (listed with file and line, never guessed)
  let en0 = null; try { await R['GET /api/x/bots/buys'](U('mod=' + encodeURIComponent(pm)), null, hc); } catch (x) { en0 = x; }
  ok(en0 && en0.status === 404 && en0.key === 'bots.e.noGohList', 'goh: buys with no purchase list says so plainly: ' + (en0 && en0.message));
  const SM = [goh, 'resource', 'script', 'multiplayer'];
  W(path.join(...SM, 'bot.main.lua'), 'local function initializeBotAI()\r\n    local gameModeMap = {\r\n        campaign_capture_the_flag = "conquest",\r\n        frontlines = "frontlines", -- comment\r\n    }\r\nend\r\n');
  W(path.join(...SM, 'modes', 'frontlines.lua'), 'function OnGameStart()\r\n    OnGameStartUtility(BotApi.Instance.unitMode)\r\nend\r\n');
  W(path.join(...SM, 'modes', 'conquest.lua'), 'function OnGameStart()\r\n\tOnGameStartUtility("conquest")\r\nend\r\n');
  W(path.join(...SM, 'units', 'ger', 'mid.ger.lua'), 'Purchases["mid.ger"] = {\r\n\t{Repeat = 0, --infinite\r\n\t\tUnits = {\r\n\t\t\t--{priority = 1.0, type = {"Class3"}, unit = "old(ger)"},\r\n\t\t\t{priority = 2.5, type = {"Class2", "Tank"}, unit = "pz4(ger)"},\r\n\t\t}\r\n\t},\r\n\t{Repeat = 3, Units = { {priority = 1, type = {"Class1", "Infantry", "Squad"}, unit = "sq(ger)"} }},\r\n}\r\n');
  W(path.join(...SM, 'units', 'ger', 'conquest.ger.lua'), 'Purchases["conquest.ger"] = {\r\n\t{Repeat = 0, Units = {\r\n\t\t{availability = "1.4", base = { "Infantry", "Squad" }, class = {}, grade = "Grade1", posture = { "Defensive" }, roles = {}, effects = {}, unit = "sq_con(ger)"},\r\n\t}}\r\n}\r\n');
  W(path.join(...SM, 'units', 'rus', 'mid.rus.lua'), 'Purchases["mid.rus"] = { {Repeat = 0, Units = { {priority = 1, type = {"Infantry"}, unit = "game(rus)"} }} }\r\n');
  W(path.join(pm, 'resource', 'script', 'multiplayer', 'units', 'rus', 'mid.rus.lua'), 'Purchases["mid.rus"] = {\r\n {Repeat = 1, Units = { {priority = 4, type = {"Infantry"}, unit = "mine(rus)", odd = 2} }}\r\n}\r\n');
  lib.forget(); require('../../../lib/gameview').drop(goh);
  const gb = await R['GET /api/x/bots/buys'](U('mod=' + encodeURIComponent(pm)), null, hc);
  ok(gb.game === 'goh' && gb.list === 'mid' && gb.lists.join() === 'mid,conquest' && gb.armies.join() === 'ger,rus' && gb.from === 'mod', 'goh: buys reads the purchase lists, first list in period order: ' + gb.list + ' ' + gb.lists + ' ' + gb.armies);
  const g1 = gb.stages[0].armies.ger, r1 = gb.stages[0].armies.rus;
  ok(gb.stages.length === 2 && g1.length === 1 && g1[0].unit === 'pz4(ger)' && g1[0].priority === 2.5 && g1[0].cls === 'Tank' && gb.stages[1].repeats.ger === 3 && gb.stages[0].repeats.rus === 1, 'goh: stages, priority, kind and Repeat per army; a commented row is not read');
  ok(r1.length === 1 && r1[0].unit === 'mine(rus)' && r1[0].priority === 4 && gb.files.rus.from === 'mod' && gb.files.ger.from === 'game', 'goh: the mod copy of a list wins over the game');
  ok(gb.notRead.length === 1 && gb.notRead[0].file === 'script/multiplayer/units/rus/mid.rus.lua' && gb.notRead[0].line === 2 && /odd/.test(gb.notRead[0].what), 'goh: an unknown key is listed as not read with file and line: ' + JSON.stringify(gb.notRead));
  ok(gb.modes.length === 2 && gb.modes.find(m => m.mode === 'frontlines').list === 'period' && gb.modes.find(m => m.mode === 'campaign_capture_the_flag').list === 'conquest', 'goh: lobby mode -> list from bot.main.lua and modes/*.lua: ' + JSON.stringify(gb.modes));
  const gc = await R['GET /api/x/bots/buys'](U('mod=' + encodeURIComponent(pm) + '&list=conquest'), null, hc), c1 = gc.stages[0].armies.ger[0];
  ok(gc.list === 'conquest' && c1.unit === 'sq_con(ger)' && c1.priority === null && c1.availability === 1.4 && c1.grade === 'Grade1' && c1.tags.join() === 'Infantry,Squad,Defensive' && !gc.stages[0].armies.rus, 'goh: a conquest list: availability, grade and tags, no priority');
  // GoH add a unit (botrecipe --exe goh): arguments, checks, already-in = no run, then the real tool on the fixture lists: preview, write
  // into the mod (CRLF kept, the copied row with the unit), undo byte for byte, no write inside the GoH install
  const n0 = runs.length;
  const pv = await R['POST /api/x/bots/buyfirst'](null, { mod: pm, unit: 'pz3(ger)', army: 'ger', list: 'mid', cls: 'Tank', priority: '3' }, hc), ga = runs.slice(n0).map(r => r[1]);
  ok(ga.length === 1 && ga[0].join(' ').includes('--exe goh --buy-first pz3(ger) --army ger --stage mid') && ga[0].includes('--dry-run') && ga[0].join(' ').includes('--class Tank --priority 3') && ga[0][ga[0].indexOf('--game') + 1] === goh, 'goh add: botrecipe --exe goh --army --stage <list>, a dry run on preview: ' + (ga[0] && ga[0].join(' ')));
  ok(pv.ok && !pv.wrote && pv.rel === 'script/multiplayer/units/ger/mid.ger.lua' && pv.from === 'game', 'goh add: reply names the roster file and where it is read from ' + JSON.stringify(pv).slice(0, 200));
  const n1 = runs.length, al = await R['POST /api/x/bots/buyfirst'](null, { mod: pm, unit: 'pz4(ger)', army: 'ger', list: 'mid', write: true }, hc);
  ok(al.ok && al.noChange && !al.wrote && runs.length === n1 && !fs.existsSync(path.join(pm, 'resource', 'script', 'multiplayer', 'units', 'ger')), 'goh add: a unit the list has already = nothing to change, nothing run or copied');
  for (const [b, k] of [[{ unit: 'x', list: 'mid' }, 'bots.e.gohArmy'], [{ unit: 'x', army: 'ger' }, 'bots.e.gohList'], [{ unit: 'x', army: 'ger', list: 'late' }, 'bots.e.gohNoFile'], [{ unit: 'x', army: 'ger', list: 'mid', priority: 'lots' }, 'bots.e.gohPrio'], [{ unit: 'bad name!', army: 'ger', list: 'mid' }, 'bots.e.unit'], [{ unit: 'x', army: '../ger', list: 'mid' }, 'bots.e.gohArmy']]) {
    let e = null; try { await R['POST /api/x/bots/buyfirst'](null, Object.assign({ mod: pm }, b), hc); } catch (x) { e = x; }
    ok(e && e.key === k && X.lang.ru[k] && X.lang.zh[k], 'goh add: refused with ' + k + ': ' + (e && (e.key + ' ' + e.message)));
  }
  let ei = null; try { await R['POST /api/x/bots/buyfirst'](null, { mod: inG, unit: 'pz3(ger)', army: 'ger', list: 'mid', write: true }, hc); } catch (x) { ei = x; }
  ok(ei && ei.status === 400 && !fs.existsSync(path.join(inG, 'resource')), 'goh add: no write inside the GoH install: ' + (ei && ei.message));
  const greal = gctx('goh', { runTool: ctx.runTool });
  const rp = await R['POST /api/x/bots/buyfirst'](null, { mod: pm, unit: 'pz3(ger)', army: 'ger', list: 'mid', cls: 'Tank' }, greal);
  ok(rp.ok && !rp.wrote && rp.placed && rp.placed.after === 'pz4(ger)' && !fs.existsSync(path.join(pm, 'resource', 'script', 'multiplayer', 'units', 'ger')), 'goh add: real botrecipe preview, copy of the pz4(ger) row, nothing written: ' + JSON.stringify(rp.say));
  const rw = await R['POST /api/x/bots/buyfirst'](null, { mod: pm, unit: 'pz3(ger)', army: 'ger', list: 'mid', cls: 'Tank', priority: '3', write: true }, greal);
  const gf = path.join(pm, 'resource', 'script', 'multiplayer', 'units', 'ger', 'mid.ger.lua'), gt = fs.existsSync(gf) ? fs.readFileSync(gf, 'latin1') : '';
  ok(rw.ok && rw.wrote && /\{priority = 3(\.0)?, type = \{"Class2", "Tank"\}, unit = "pz3\(ger\)"\},\r\n/.test(gt) && gt.includes('unit = "pz4(ger)"') && !/[^\r]\n/.test(gt), 'goh add: written into the mod copy of the list, row copied, CRLF kept: ' + JSON.stringify(rw.say) + ' ' + JSON.stringify(gt));
  ok(Array.isArray(rw.undo) && rw.undo.length === 1 && rw.undo[0].rel === 'script/multiplayer/units/ger/mid.ger.lua', 'goh add: one undo ticket for the roster file ' + JSON.stringify(rw.undo));
  const gu = await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(pm)), null, hc);
  ok(gu.goh && gu.units.some(u => u.unit === 'pz3(ger)' && u.army === 'ger' && u.src === 'mod' && u.lists.includes('mid')) && gu.units.some(u => u.unit === 'sq_con(ger)' && u.lists.join() === 'conquest') && gu.lists.join() === 'mid,conquest' && gu.kinds.includes('Tank'), 'goh: the unit index = the units of every purchase list: ' + JSON.stringify(gu).slice(0, 300));
  { // the GoH unit index through the shared store (lib gohUnitsCached): the same answer, served again without a read; a list edit in the mod = a new answer
    const cs = require('../../../lib/cachestore'), MTm = require('../../../lib/modtree'), GVm = require('../../../lib/gameview');
    const st = cs.open({ root: path.join(work, 'gohunits-store') }), cc = Object.assign({}, hc, { cache: st, modtree: MTm, gameview: GVm });
    MTm.touch(pm); const c1 = await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(pm)), null, cc);
    const GBm = require('../../../botrecipe/gohbuys'), rl0 = GBm.readList; let reads = 0; GBm.readList = function () { reads++; return rl0.apply(this, arguments); };
    let c2, c3; try { c2 = await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(pm)), null, cc); lib.forget(); c3 = await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(pm)), null, cc); } finally { GBm.readList = rl0; }
    ok(JSON.stringify(c1) === JSON.stringify(gu) && JSON.stringify(c2) === JSON.stringify(gu) && JSON.stringify(c3) === JSON.stringify(gu) && reads === 0, 'goh unit index cached: same answer from memory and from the store, no list read again (' + reads + ')');
    const ex = path.join(pm, 'resource', 'script', 'multiplayer', 'units', 'ger', 'mid.ger.lua'), was = fs.existsSync(ex) ? fs.readFileSync(ex) : null;
    W(ex, String(was || '').replace('unit = "pz3(ger)"', 'unit = "pz3x(ger)"')); MTm.touch(pm);
    const c4 = await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(pm)), null, cc);
    if (was) fs.writeFileSync(ex, was); MTm.touch(pm);
    ok(was && c4.units.some(u => u.unit === 'pz3x(ger)') && !c4.units.some(u => u.unit === 'pz3(ger)'), 'goh unit index cached: an edit of a mod list (new mod:script stamp) gives the new answer');
    // Prepare section bots.gohunits (PERF C6): GoH only, per mod; run fills the entry the units route then hits without a list read
    const GP = X.prep.find(p => p.id === 'bots.gohunits'), gq = { mod: pm, game: { id: 'goh', dir: goh } };
    await MTm.ensure(pm, { maxAgeMs: 0 }); const s0 = GP && GP.state(cc, gq);
    ok(GP && GP.games.join() === 'goh' && GP.areas.join() === 'script' && X.lang.en[GP.title] && X.lang.zh[GP.title] && s0.state !== 'ready', 'goh prep: section bots.gohunits, GoH only, area script, not made for this stamp yet: ' + JSON.stringify(s0));
    await GP.run(cc, gq, null); const s1 = GP.state(cc, gq); lib.forget();
    let r5 = 0; GBm.readList = function () { r5++; return rl0.apply(this, arguments); };
    try { await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(pm)), null, cc); } finally { GBm.readList = rl0; }
    ok(s1.state === 'ready' && r5 === 0, 'goh prep: run makes the entry, the units route then reads no list (' + s1.state + ', ' + r5 + ')');
    const s2 = GP.state(Object.assign({}, cc), { mod: pm, game: { id: 'as64', dir: goh } });
    await GP.clear(cc); const s3 = GP.state(cc, gq);
    ok(s2.state === 'na' && s3.state === 'none', 'goh prep: na on an AS2 game; clear empties the section (' + s2.state + ', ' + s3.state + ')');
  }
  const ru = await R['POST /api/x/bots/undo'](null, { mod: pm, undo: rw.undo }, hc);
  ok(ru && !fs.existsSync(gf) && !fs.existsSync(path.join(pm, 'resource', 'script', 'multiplayer', 'units', 'ger')), 'goh add: undo removes the copy the write made ' + JSON.stringify(ru).slice(0, 200));
  ok(X.lang.en['na.bots.goh'] && ['ru', 'uk', 'zh'].every(c => X.lang[c]['na.bots.goh']), 'na.bots.goh in four languages');
  ok(/curGame\(\)\.kind==='goh'/.test(X.script) && X.script.includes("'presets/preset_mid.inc'") && X.script.includes('presets/global_parameters/bots_generic.inc'), 'page: start settings card knows the GoH files');
}

// ---- the frame: groups, parts, the two other pages (Unit AI = D, Map scripts for AI = E), BOTS_UI.go, folds
async function groups() {
  const B = require('./blkboot'), en = X.lang.en, PARTS = require('./parts');
  // parts/index.js: a literal list of the nine; a folder that is there loads (a skipped one names why); the contract is checked
  const src = fs.readFileSync(path.join(__dirname, 'parts', 'index.js'), 'utf8');
  ok(PARTS.IDS.length === 9 && PARTS.IDS.every(id => src.includes("require('./" + id + "')")), 'parts: a literal require for each of the nine');
  for (const id of PARTS.IDS) {
    const there = fs.existsSync(path.join(__dirname, 'parts', id, 'index.js')), sk = PARTS.skipped.find(x => x.id === id);
    ok(!there || !sk, 'parts: ' + id + ' is there but was skipped: ' + (sk && sk.why));
  }
  ok(PARTS.some(p => p.id === 'limits'), 'parts: limits loaded');
  ok(PARTS.check('x', { id: 'x', group: 'G', order: 1 }) && PARTS.check('x', { id: 'x', group: 'A', order: 1, routes: { 'GET /api/x/bots/y/z': async () => 1 } }) && PARTS.check('x', { id: 'x', group: 'A', order: 1, script: 'var a=' + String.fromCharCode(96) }) &&
    PARTS.check('x', { id: 'x', group: 'A', order: 1, script: 'var a=(' }) && PARTS.check('x', { id: 'x', group: 'A', order: 1, lang: [['bots.y.k', 'a', 'b', 'c', 'd']] }) && !PARTS.check('x', { id: 'x', group: 'A', order: 1, routes: {}, lang: [], script: '' }),
  'parts: a bad group, a route outside /api/x/bots/<id>/, a backtick, a script that does not parse, a key of another part are refused');
  for (const p of PARTS) for (const k of Object.keys(p.routes || {})) ok(R[k] === p.routes[k] || (/^POST /.test(k) && R[k].inner === p.routes[k]), 'parts: route merged ' + k);   // a POST route is wrapped: it tells the mod listing after a write (CACHE)
  for (const p of PARTS) for (const r of p.lang || []) ok(['en', 'ru', 'uk', 'zh'].every((c, i) => X.lang[c][r[0]] === r[i + 1]), 'parts: string merged ' + r[0]);
  const hd = X.script.indexOf('var BOTS_PARTS=[]'), ui = X.script.indexOf('var BOTS_UI='), pp = X.script.indexOf('// bots part limits'), sc = X.script.indexOf('EXT_SCREENS.bots=');
  ok(hd >= 0 && hd < ui && ui < pp && pp < sc, 'script order: BOTS_PARTS, BOTS_UI, the parts, then the screen');
  ok(['checkMod', 'checkWrite', 'gameOf', 'gameText', 'modText', 'effective'].every(k => typeof lib[k] === 'function'), 'lib: the names parts use');
  // the pages: unitai and mapai ext folders
  const UA = require('../unitai'), MA = require('../mapai');
  for (const [x, id, g] of [[UA, 'unitai', 'D'], [MA, 'mapai', 'E']]) {
    ok(x.id === id && x.nav === id + '.nav' && !Object.keys(x.routes).length && x.script.includes('EXT_SCREENS.' + id) && x.script.includes("['" + g + "']") && !/`|\$\{/.test(x.script), id + ': shape, group ' + g + ', script rules');
    ok(Object.keys(x.lang.en).every(k => ['ru', 'uk', 'zh'].every(c => x.lang[c][k] && x.lang[c][k] !== x.lang.en[k])), id + ': four languages');
  }
  for (const g of 'ABCDEF') ok(['en', 'ru', 'uk', 'zh'].every(c => X.lang[c]['bots.g.' + g] && X.lang[c]['bots.g.' + g + '.lead']), 'group ' + g + ' title and lead in four languages');

  // a page with the mod set, fake parts in every kind: one throws, one gives plain nodes, one calls the server, one on Unit AI
  const reply = (p, m, body, u) => /buys$/.test(p) ? { from: 'game', ownBot: false, compared: true, labels: {}, stages: [{ n: 1, repeat: 0, armies: { ger: [{ unit: 'pz', cls: 'Tank', priority: 1 }] } }], cards: [] } :
    /table$/.test(p) ? { rows: [{ id: 'g|easy|cp', group: 'easy', field: 'cp', current: '1', vanilla: '1', kind: 'num' }] } : /units$/.test(p) ? { units: [] } : /zapi\/x$/.test(p) ? { said: 'x' } : /zapi\/y$/.test(p) ? { said: 'y' } : /zapi\/stop$/.test(p) ? { __status: 499, key: 'job.cancelled', error: 'cancelled' } : /zapi\/poll$/.test(p) ? { said: 'p' } : undefined;
  const P = await B.boot({ 'as2gui.mod': 'C:/m' }, reply); await P.settle(); P.ctx.as2Link('page:bots'); await P.settle();
  const C = P.ctx, got = {};
  // JOBS: the page's own job list is read to see how env.api names its requests: the list's 0.6 s wait runs at once here
  const st0 = C.setTimeout; C.setTimeout = (f, ms) => { if (ms === 600) f(); return 0; };
  const warned = []; C.console = Object.assign({}, console, { warn: (...a) => warned.push(a.join(' ')) });   // the thrower's warning is expected: kept, not printed
  C.BOTS_PARTS.push({ id: 'zthrow', group: 'A', order: 5, title: () => 'Thrower', draw: () => { throw new Error('boom'); } });
  C.BOTS_PARTS.push({ id: 'zplain', group: 'B', order: 5, title: () => 'Plain', draw: () => { const d = C.document.createElement('div'); d.textContent = 'plain'; return [d, 'words']; } });
  C.BOTS_PARTS.push({ id: 'zapi', group: 'C', order: 5, title: () => 'Api', draw: env => { got.env = env; env.api('GET', 'zapi/x', { a: '1' }, (e, r) => { got.x = [e, r]; }); env.api('POST', '/zapi/y', { b: 2 }, (e, r) => { got.y = [e, r]; });
    env.api('POST', 'zapi/stop', {}, (e, r, x) => { got.stop = [e, r, x]; }, { what: 'Api: named' }); env.api('GET', 'zapi/poll', {}, (e, r) => { got.poll = [e, r]; }, { job: false });
    return [env.kit.hint('bots.zapi.h', 'hi')]; } });
  C.BOTS_PARTS.push({ id: 'targets.zsym', group: 'D', order: 1, title: () => 'ZD', draw: env => [env.kit.section('bots.targets.zsym', 'ZD', [env.kit.hint('bots.targets.zsym.x', 'x')])] });
  C.localStorage.setItem('bots.fold.bots.C', '0');
  C.as2Link('page:bots'); await P.settle();
  const s = P.sec('bots'), ids = B.ids(s), at = i => ids.indexOf(i), blk = (sec, id) => sec.all().find(e => B.isB(e) && e.dataset.blk === id);
  const up = (sec, id) => { const r = []; for (let e = blk(sec, id); e; e = e.parentNode) if (B.isB(e) && /^group\./.test(e.dataset.blk)) r.push(e.dataset.blk); return r[0]; };
  // lazy folds: group C is folded, so what its part reads (GET) while it is drawn waits for the unfold; a POST is never held
  {
    const zc = () => P.calls.filter(c => c[1].indexOf('/api/x/bots/zapi/') >= 0).map(c => c[0] + ' ' + c[1].split('zapi/')[1].split('?')[0]).sort().join(',');
    ok(zc() === 'POST stop,POST y', 'a folded group: the reads of its part are held, its POSTs are sent: ' + zc());
    const gc = blk(s, 'group.c'); ok(gc && gc.tagName === 'DETAILS' && !gc.open, 'group C is folded');
    gc.open = true; gc.fire('toggle'); await P.settle();
    ok(zc() === 'GET poll,GET x,POST stop,POST y', 'unfolding the group sends the held reads, once: ' + zc());
    gc.open = false; gc.fire('toggle'); gc.open = true; gc.fire('toggle'); gc.open = false; gc.fire('toggle'); await P.settle();
    ok(zc() === 'GET poll,GET x,POST stop,POST y', 'folding and unfolding again sends nothing more');
  }
  const pr = B.check(s); ok(!pr.length, 'frame blocks: ' + pr.slice(0, 8).join('; '));
  ok(['group.a', 'group.b', 'group.c', 'group.f'].every(i => ids.includes(i)) && !ids.includes('group.d') && !ids.includes('group.e'), 'bots page: groups A B C F only ' + ids.filter(i => /^group\.[a-f]$/.test(i)).join());
  ok(at('group.a') < at('group.b') && at('group.b') < at('group.c') && at('group.c') < at('group.f'), 'bots page: groups in order');
  ok(up(s, 'buys') === 'group.a' && up(s, 'add') === 'group.a' && at('buys') < at('add') && at('add') < at('part.zthrow.err'), 'group A: what bots buy, add a unit, then the parts');
  ok(up(s, 'how') === 'group.b' && at('how') < at('part.zplain.0'), 'group B: how bots choose before the parts');
  ok(up(s, 'diff') === 'group.c' && at('bots.zapi.h') < at('diff'), 'group C: the difficulty numbers after the parts');
  ok(up(s, 'bots.limits') === 'group.f' && up(s, 'adv') === 'group.f' && at('bots.limits') < at('adv'), 'group F: limits, then more tools');
  const lim = blk(s, 'bots.limits'), ltx = lim ? lim.textContent : '';
  ok(['AI-13', 'AI-11', 'AI-12, MIS-08', 'AI-22', 'GHMIS-66'].every(i => ltx.includes(i)) && ltx.includes(en['bots.limits.board']), 'limits: plain lines with their IDs');
  ok(ids.includes('group.a.lead') && blk(s, 'group.a.lead').textContent === en['bots.g.A.lead'] && blk(s, 'group.a').all().some(e => e.tagName === 'SUMMARY' && e.textContent.indexOf(en['bots.g.A']) === 0), 'group A: title and lead');
  const err = blk(s, 'part.zthrow.err');
  ok(warned.some(w => /bots part zthrow/.test(w)), 'a part that throws: a console warning');
  ok(err && /boom/.test(err.textContent) && err.textContent.includes('Thrower') && ids.includes('buys'), 'a part that throws: an error box in its place, the page still drawn');
  ok(ids.includes('part.zplain.0') && ids.includes('part.zplain.1') && blk(s, 'part.zplain.1').textContent === 'words', 'a part that gives plain nodes: each in a leaf');
  ok(got.env && got.env.mod === 'C:/m' && got.env.gid && typeof got.env.reload === 'function' && got.env.kit === C.BOTS_UI.kit && ['section', 'leaf', 'hint', 'errBox', 'qs', 'hitsOf', 'editor'].every(k => typeof got.env.kit[k] === 'function'), 'env: mod, gid, reload, kit');
  const cx = P.calls.find(c => /\/api\/x\/bots\/zapi\/x\?/.test(c[1])), cy = P.calls.find(c => /\/api\/x\/bots\/zapi\/y$/.test(c[1]));
  ok(cx && /a=1/.test(cx[1]) && /mod=C%3A%2Fm/.test(cx[1]) && cx[0] === 'GET', 'env.api GET: the path under /api/x/bots/ with the data and the mod ' + (cx && cx[1]));
  ok(cy && cy[0] === 'POST' && cy[2].b === 2 && cy[2].mod === 'C:/m', 'env.api POST: the body with the mod');
  ok(got.x && got.x[0] === null && got.x[1].said === 'x' && got.y && got.y[1].said === 'y', 'env.api: cb(null, json)');
  // JOBS: env.api names its requests (the part's title, plus the clicked button for a POST), passes a given name and job:false through,
  // and a request stopped from the job list comes back as "stopped", which the kit draws as a plain line
  {
    C.setTimeout = st0;
    const names = C.JOBS.list().map(j => j.name), nApi = names.filter(n => n === 'Api').length;
    ok(nApi === 1, 'env.api: a request is named after its part (POST zapi/y; the GET zapi/x no click started is a page read, gone when it ends): ' + JSON.stringify(names));
    ok(names.includes('Api: named') && C.JOBS.list().find(j => j.name === 'Api: named').state === 'cancelled', 'env.api: a given name is passed on; the stopped request is listed as cancelled: ' + JSON.stringify(names));
    ok(names.filter(n => /^Api/.test(n)).length === 2, 'env.api: job:false keeps a poll out of the job list: ' + JSON.stringify(names));
    ok(got.poll && got.poll[1].said === 'p', 'env.api: a poll still answers');
    ok(got.stop && got.stop[0] === en['bots.stopped'] && got.stop[2] && got.stop[2].cancelled === true, 'env.api: a stopped request says Stopped and carries cancelled: ' + JSON.stringify(got.stop && [got.stop[0], got.stop[2] && got.stop[2].cancelled]));
    const k = got.env.kit, sb = k.errBox(got.stop[2]), eb2 = k.errBox('real trouble'), s2 = k.stopBox('x'), jw = k.jobWhat('Card', 'Go');
    ok(sb.className === 'hint' && sb.getAttribute('data-stopped') === '1' && sb.getAttribute('role') === 'status' && sb.textContent === en['bots.stopped'], 'kit.errBox: a stopped request is a plain line, not an error box');
    ok(eb2.className === 'err' && s2.className === 'hint' && s2.textContent === 'x', 'kit: a real error stays an error; stopBox takes its own text');
    ok(/Card/.test(jw) && /Go/.test(jw) && k.jobWhat('Card', '') === 'Card', 'kit.jobWhat: card and button ' + jw);
    ok(['bots.btn.stop', 'bots.stopped', 'bots.add.stopped'].every(key => ['ru', 'uk', 'zh'].every(c => X.lang[c][key] && X.lang[c][key] !== en[key])), 'stop wording in four languages');
  }
  // folds: the one closed last time stays closed; the others open
  ok(blk(s, 'group.c').open === false && blk(s, 'group.a').open === true, 'folds: remembered per page and group');
  // S8: only the first group starts open; a folded group shows its lead in the header
  const gl = g => blk(s, g).all().find(e => e.dataset && e.dataset.grplead);
  ok(blk(s, 'group.b').open === false && blk(s, 'group.f').open === false && gl('group.b') && !gl('group.b').hidden && gl('group.a').hidden && gl('group.b').textContent === en['bots.g.B.lead'], 'folds: first group open, the others folded with their lead in the header');
  // the task list on top: each item jumps to its card and opens it; the other pages in one line
  ok(at('tasks') >= 0 && at('tasks') < at('group.a') && at('pages') < at('group.a'), 'tasks and the other-pages line before the groups');
  const task = k => blk(s, 'tasks').all().find(e => e.tagName === 'BUTTON' && e.textContent === en[k]);
  ok(['bots.task.unit', 'bots.task.money'].every(k => task(k)), 'tasks: the page-card items are listed');
  { const tb = blk(s, 'tasks').all().filter(e => e.tagName === 'BUTTON' && e.dataset.task), gone = tb.filter(b => !s.all().some(e => e.dataset && e.dataset.blk === b.dataset.task));
    ok(tb.length >= 2 && !gone.length, 'tasks: every task line points at a block drawn on this page, missing: ' + gone.map(b => b.dataset.task).join()); }
  task('bots.task.money').click(); ok(blk(s, 'group.c').open === true, 'tasks: make bots richer opens the difficulty card fold');
  blk(s, 'group.c').open = false;
  const pl = blk(s, 'pages'); ok(pl && ['unitai', 'mapai'].every(p => pl.all().some(e => e.tagName === 'BUTTON' && e.dataset.page === p)) && pl.textContent.includes(en['bots.about.unitai']), 'pages: what the other two pages are for, a button to each');
  // the kit (exact names, the part agents use them)
  const K = C.BOTS_UI.kit;
  ok(['details', 'more', 'done', 'na', 'wait', 'pick', 'undoBy', 'emsg', 'diff', 'diffOrder', 'changed'].every(k => typeof K[k] === 'function') && typeof C.BOTS_UI.changed === 'function', 'kit: details more done na wait pick undoBy emsg diff changed');
  ok(K.diffOrder([['+', 'a'], ['-', 'b'], [' ', 'c'], { op: '+', text: 'd' }, { t: '-', s: 'e' }]).map(x => x.t + x.s).join() === '-b,+a, c,-e,+d', 'kit.diffOrder: removed lines first in every change');
  const dt = K.details('zz.det', ['x', K.hint('zz.det.h', 'y')]); ok(dt.tagName === 'DETAILS' && dt.dataset.blk === 'zz.det' && dt.textContent.indexOf(en['bots.details']) === 0, 'kit.details: a folded block labelled Details');
  ok(K.more(null, ['x']).textContent.indexOf(en['bots.more']) === 0 && K.na('zz.na', 'why').textContent === 'why' && K.wait(null, 'reading x').textContent.includes('reading x'), 'kit.more, kit.na, kit.wait');
  { let undone = 0; const box = K.done(null, { lines: ['zq9'], see: 'To see it in the game: look', next: [{ text: 'Next', go: 'diff' }], undo: () => { undone++; return Promise.resolve({}); } });
    const n = (s, w) => s.split(w).length - 1;
    ok(box.textContent.indexOf(en['bots.done.what'].replace('{what}', 'zq9')) === 0 && n(box.textContent, 'zq9') === 1 && n(box.textContent, en['bots.done.see']) === 1 && !/To see it in/.test(box.textContent) && box.textContent.includes('Look'),
      'kit.done (S18): "Done: <what>." then one "To see it:" (the caller\'s own lead cut): ' + box.textContent);
    const two = K.done(null, { lines: ['a', 'b'], see: K.seeText('bots') });
    ok(two.textContent.indexOf(en['bots.done.title']) === 0 && two.all().filter(e => e.tagName === 'LI').length === 2 && two.textContent.includes(en['bots.see.bots']) && K.seeText('own') === en['bots.see.own'], 'kit.done: several lines under "Done: written into your mod."; kit.seeText bots and own (S19)');
    const holder = C.document.createElement('div'); holder.appendChild(box);
    box.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['bots.btn.undo']).click(); await P.settle();
    const un = holder.all().find(e => e.dataset && e.dataset.undone);
    ok(undone === 1 && box.parentNode !== holder && un && un.textContent === en['bots.undo.done'], 'kit.done: Undo runs once, the box goes, a line says it was put back (S13)'); }
  // round 2 kit members (parts adopt them): na needs two arguments, rows, n, term, undoBtn, naText
  ok(['rows', 'n', 'term', 'undoBtn', 'naText', 'fold'].every(k => typeof K[k] === 'function'), 'kit round 2: rows n term undoBtn naText fold');
  { let thrown = false; const ce = C.console.error; C.console.error = () => {}; try { K.na('only text'); } catch (e) { thrown = true; } C.console.error = ce;
    ok(thrown, 'kit.na with one argument throws (S15: kit.na(id, text))'); }
  ok(K.na(null, { why: 'no bot list', use: 'the Bots page' }).textContent === K.naText({ why: 'no bot list', use: 'the Bots page' }) && K.naText({ why: 'x' }).includes('x'), 'kit.na: one wording pattern through naText');
  { const w = K.rows(Array.from({ length: 12 }, (_, i) => 'r' + i), { show: 8 }), li = w.all().filter(e => e.tagName === 'LI'), sb = w.all().find(e => e.dataset && e.dataset.showall);
    ok(li.length === 12 && li.filter(e => !e.hidden).length === 8 && sb && sb.textContent === en['bots.rows.all'].replace('{n}', '12'), 'kit.rows: 8 shown, "Show all 12"');
    sb.click(); ok(li.every(e => !e.hidden) && sb.textContent === en['bots.rows.fewer'], 'kit.rows: Show all, then Show fewer');
    ok(!K.rows(['a', 'b'], { show: 8 }).all().some(e => e.dataset && e.dataset.showall), 'kit.rows: a short list has no button'); }
  ok(K.n(1, 'bots.rep.k') === en['bots.rep.k.one'] && K.n(3, 'bots.rep.k') === en['bots.rep.k.other'].replace('{n}', '3'), 'kit.n: one and other (no "1 times")');
  ok(['one', 'few', 'many', 'other'].every(f => X.lang.ru['bots.rep.k.' + f] && X.lang.uk['bots.rep.k.' + f]), 'kit.n: ru and uk rows have every form');
  { const tm = K.term('Payback', 'payback'); ok(tm.dataset.term === 'payback' && (tm.getAttribute('title') || tm.title) === en['bots.tip.payback'], 'kit.term: hover text from bots.tip.<key>'); }
  ok(['payback', 'buycard', 'stage', 'priority', 'as64'].every(k => ['en', 'ru', 'uk', 'zh'].every(c => X.lang[c]['bots.tip.' + k] && X.lang[c]['bots.tip.' + k + '.g'])), 'terms: hover text and glossary word in four languages');
  { const ub = K.undoBtn(['nothing.set']); ok(ub.button && ub.button.disabled && typeof ub.refresh === 'function', 'kit.undoBtn: greyed until the server says there is something to undo'); }
  { const inp = C.document.createElement('input'), hd = K.pick(inp, { key: 'zz.pick', items: [{ label: 'Tiger', value: 'pz6' }] });
    ok(!hd.attached, 'kit.pick: waits while the box has no parent');
    const holder = C.document.createElement('div'); holder.appendChild(inp); await P.settle();
    ok(hd.attached && inp.parentNode && inp.parentNode.dataset.sk === 'zz.pick' && inp.parentNode.parentNode === holder, 'kit.pick: searchKit once the box is in the page, its wrapper where the box was'); }
  // BOTS_UI.changed: the other drawn parts of the page are drawn again in place
  { let n = 0; C.BOTS_PARTS.push({ id: 'zcount', group: 'B', order: 6, draw: env => [env.kit.hint('bots.zcount.h', 'n' + (++n))] });
    C.as2Link('page:bots'); await P.settle(); const n0 = n, heard = [];
    C.BOTS_UI.onChanged((w, p) => heard.push(w));
    C.BOTS_UI.changed('bot list', 'zcount');
    ok(n === n0 && heard.join() === 'bot list', 'changed: the source part is not drawn again; listeners hear it');
    C.BOTS_UI.changed('bot list', 'zplain');
    ok(n === n0 + 1 && blk(s, 'bots.zcount.h').textContent === 'n' + n && s.all().filter(e => e.dataset && e.dataset.blk === 'bots.zcount.h').length === 1, 'changed: another part redrawn once, in place'); }
  // BOTS_UI.go: a card on this page opens its fold; a part block on another page switches page
  C.BOTS_UI.go('diff'); ok(blk(s, 'group.c').open === true, 'go: opens the fold around a card');
  ok(C.BOTS_UI.pageOf('bots.targets.zsym.x') === 'unitai' && C.BOTS_UI.pageOf('group.E') === 'mapai' && C.BOTS_UI.pageOf('group.a') === 'bots' && C.BOTS_UI.pageOf('bots.limits') === 'bots' && C.BOTS_UI.pageOf('add.f.unit') === 'bots', 'go: the page that owns a block');
  const pg = C.BOTS_UI.go('bots.targets.zsym.x'); await P.settle();
  const su = P.sec('unitai');
  ok(pg === 'unitai' && su && !su.hidden && s.hidden, 'go: switches to the Unit AI page');
  if (su) {
    const iu = B.ids(su), pu = B.check(su);
    ok(!pu.length, 'unitai blocks: ' + pu.slice(0, 8).join('; '));
    ok(iu.includes('group.d') && !iu.includes('group.a') && iu.includes('bots.targets.zsym.x') && iu.includes('mod') && iu.includes('title') && blk(su, 'title').textContent === UA.lang.en['unitai.h1'], 'unitai: group D with its part, the mod line, its title');
  }
  C.as2Link('page:mapai'); await P.settle();
  const sm = P.sec('mapai');
  if (sm) { const im = B.ids(sm); ok(im.includes('group.e') && !im.includes('group.d') && !im.includes('group.a') && (im.includes('group.e.none') === !X.parts.some(p => p.group === 'E')), 'mapai: group E only (the nothing-here line only when no part is in E)'); ok(!B.check(sm).length, 'mapai blocks: ' + B.check(sm).slice(0, 6).join('; ')); }
  else ok(false, 'mapai page not built');
  C.BOTS_UI.go('group.A'); await P.settle();
  ok(!s.hidden, 'go: group.A goes back to the Bots page');
  // ---- round 5: one wording everywhere (the contract the parts code against)
  { const L4 = ['en', 'ru', 'uk', 'zh'], all4 = k => L4.every(c => typeof X.lang[c][k] === 'string' && X.lang[c][k].length > 0);
    ok(['army', 'kind', 'game', 'undone', 'none', 'needGame', 'needMod', 'gate', 'diff'].every(k => typeof K[k] === 'function'), 'kit round 5: army kind game undone none needGame needMod gate');
    const codes = Object.keys(lib.ARMY_NAMES), miss = codes.filter(a => !all4('bots.army.' + a));
    ok(codes.length >= 16 && !miss.length, 'every lib ARMY_NAMES code has bots.army.<code> in four languages: ' + miss.join());
    ok(codes.every(a => X.lang.en['bots.army.' + a] === lib.ARMY_NAMES[a]), 'bots.army.<code> in English is the lib name');
    ok(['ger', 'rus', 'eng', 'usa', 'jap'].every(a => ['ru', 'uk', 'zh'].every(c => X.lang[c]['bots.army.' + a] !== X.lang.en['bots.army.' + a])), 'the big five armies are worded in ru, uk and zh');
    ok(K.army('ger') === en['bots.army.ger'] && K.army('GER_SS') === en['bots.army.ger_ss'] && K.army('zzz', 'Zed Land') === 'Zed Land' && K.army('zzz') === 'zzz' && K.army('') === '', 'kit.army: the lang name, a mod army by the server name, else the code');
    const km = lib.CLASSES.concat(['Sniper', 'Officer', 'MG', 'Airborne', 'Assault']).filter(c => !all4('bots.kind.' + c));
    ok(!km.length, 'every stock unit kind and the mod ones have bots.kind.<Class> in four languages: ' + km.join());
    ok(K.kind('Tank') === en['bots.kind.Tank'] && K.kind('sniper') === en['bots.kind.Sniper'] && K.kind('heavy_tank') === en['bots.kind.HeavyTank'] && K.kind('MyOddKind') === 'My odd kind' && K.kind('') === '', 'kit.kind: any letter case; an unknown kind as words');
    ok(K.game('as64') === 'AS64' && K.game('mowas2') === 'MoW:AS2' && K.game('goh') === 'Gates of Hell' && K.game() === K.game(C.GID || 'as64') && ['as64', 'mowas2', 'goh'].every(g => all4('bots.gname.' + g)), 'kit.game: one display name per game');
    const FL = require('./lang');
    ok(L4.every(c => !Object.keys(FL[c]).some(k => /\bGoH\b/.test(FL[c][k]) || (/Assault Squad 2/.test(FL[c][k]) && k !== 'bots.tip.as64'))), 'frame strings: no second form of a game name');
    ok(K.undone('the bot list is as before.') === 'Undone: the bot list is as before.' && K.undone() === en['bots.undo.done'] && all4('bots.undone') && all4('bots.undone.file'), 'kit.undone: the one sentence');
    const nn = K.none('another word.'); ok(nn.textContent === en['bots.none'] + ' ' + en['bots.none.try'].replace('{hint}', 'another word') && nn.dataset.none === '1' && K.none().textContent === en['bots.none'] && all4('bots.none') && all4('bots.none.try'), 'kit.none: Nothing found. Try <hint>.');
    ok(all4('bots.showChange') && L4.every(c => X.lang[c]['bots.showChange'] === X.lang[c]['bots.exact']), 'bots.showChange: the one fold label, in four languages');
    const df = K.diff(null, [['+', 'a']]); ok(df.tagName === 'DETAILS' && df.textContent.indexOf(en['bots.showChange']) === 0 && df.all().some(e => e.tagName === 'PRE'), 'kit.diff: folded under "Show the exact file change"');
    const ng = K.needGame('zz.ng'), nb = ng.all().find(e => e.tagName === 'BUTTON');
    ok(ng.dataset.blk === 'zz.ng' && ng.textContent.includes(en['bots.needGame']) && nb && nb.textContent === en['bots.needGame.btn'] && ng.all().some(e => e.dataset && e.dataset.nogame) && !/bot files/.test(en['bots.needGame']), 'kit.needGame: one page-neutral line and the button to Settings');
    const nm2 = K.needMod(null); ok(nm2.dataset.needmod === '1' && nm2.textContent.includes(en['bots.needmod']), 'kit.needMod: the one no-mod line');
    // gate: Write greyed until a Preview of the current values was shown; any change greys it again
    const mk = t => { const e = C.document.createElement(t); return e; };
    const f1 = mk('input'), pb = mk('button'), wb = mk('button'); f1.value = 'a';
    const g = K.gate(pb, wb, [f1]);
    ok(wb.disabled && wb.title === en['bots.gate.tip'], 'kit.gate: Write starts greyed with the reason');
    g.shown(); ok(!wb.disabled && wb.title === '' && g.ok(), 'kit.gate: on after the preview was shown');
    f1.value = 'b'; f1.fire('input'); ok(wb.disabled, 'kit.gate: a field change greys Write again');
    f1.value = 'a'; f1.fire('input'); ok(!wb.disabled, 'kit.gate: back to the previewed values turns it on');
    g.shown('stale'); ok(wb.disabled, 'kit.gate: a late reply for other values does not open Write'); g.clear(); ok(wb.disabled && !g.ok(), 'kit.gate: clear');
    let v = 'x'; const g2 = K.gate(pb, wb, () => v); g2.shown(); v = 'y'; ok(g2.touch() === false && wb.disabled, 'kit.gate: a function of the values, touch() after a change');
    // a task button leaves only its card open
    C.BOTS_UI.go('add', true); await P.settle();
    const open = s.all().filter(e => e.dataset && e.dataset.folded === '0').map(e => e.dataset.blk);
    ok(open.length === 1 && open[0] === 'add', 'a task button opens its card and folds the others: ' + open.join());
    ok(!/^Что покупают боты/.test(X.lang.ru['bots.buys.h']), 'ru: the read-only list title does not start like the stage editor title');
  }
  // no mod: a part's call is not sent (the routes refuse it with 400); cb gets the pick-a-mod line. mod:'' in the data sends it anyway
  const P2 = await B.boot({}, reply); await P2.settle(); P2.ctx.as2Link('page:bots'); await P2.settle();
  const g2 = {}; P2.ctx.BOTS_PARTS.push({ id: 'znomod', group: 'A', order: 1, draw: env => { env.api('GET', 'zapi/x', {}, (e, r) => { g2.a = [e, r]; }); env.api('GET', 'zapi/x', { mod: '' }, (e, r) => { g2.b = [e, r]; }); return []; } });
  P2.ctx.as2Link('page:bots'); await P2.settle();
  ok(g2.a && g2.a[0] === en['bots.needmod'] && g2.b && g2.b[0] === null && P2.calls.filter(c => /zapi\/x/.test(c[1])).length === 1, 'env.api with no mod: not sent, cb(pick-a-mod line); mod:\'\' sends');
}

// every parts/<id>/test.js as a child process with its own scratch folder
async function partTests() {
  const dir = path.join(__dirname, 'parts');
  for (const id of fs.readdirSync(dir).sort()) {
    const t = path.join(dir, id, 'test.js');
    if (!fs.existsSync(t)) continue;
    const sw = path.join(work, 'parts', id); fs.mkdirSync(sw, { recursive: true });
    const r = require('../../../lib/test/wait').spawnSync(process.execPath, [t, sw], { encoding: 'utf8', timeout: 300000, env: Object.assign({}, process.env, { TEMP: sw, TMP: sw, TMPDIR: sw }) }, 'bots test part ' + id);
    const lines = String(r.stdout || '').trim().split(/\r?\n/), tail = lines.filter(l => /PASS/.test(l)).pop() || lines.pop() || '';
    ok(r.status === 0, 'part ' + id + ' test failed (' + (r.status === null ? 'timed out' : 'exit ' + r.status) + '):\n' + String((r.stdout || '') + (r.stderr || '')).split('\n').slice(-12).join('\n'));
    if (r.status === 0) console.log('part ' + id + ': ' + tail);
  }
}

(async () => {
  // contract
  ok(X.id === 'bots' && X.nav === 'bots.nav' && X.adv === false && X.after === 'maps', 'shape');
  ok(!/`|\$\{/.test(X.script) && /EXT_SCREENS\.bots/.test(X.script), 'script rules');
  // buys
  const b = await R['GET /api/x/bots/buys'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(b.from === 'mod' && b.stages.length >= 1 && Object.keys(b.stages[0].armies).length >= 1, 'buys read stages');
  ok(b.cards.some(c => c.unit === 'chainn3_cromwell'), 'buys lists the mod card');
  ok(b.compared === false && b.cards.every(c => c.how === null), 'buys with no game set says it could not compare');
  // GT-14: with the game's own units set, a copied game card is not the mod's; an added or changed card is
  const vset = path.join(mod, 'resource', 'set', 'multiplayer', 'units', 'vehicles_eng.set');
  const vlines = fs.readFileSync(vset, 'latin1').split('\r\n');
  const gl = vlines.filter(l => !/\{"chainn3_cromwell"/.test(l)).map(l => /\{"qf2"/.test(l) ? l.replace('{cost 135}', '{cost 999}') : (/\{"willysmb_eng"/.test(l) ? l.replace(/\s+/g, '  ') : l));
  W(path.join(gameDir, 'resource', 'set', 'multiplayer', 'units', 'vehicles_eng.set'), gl.join('\r\n'));
  const bg = await R['GET /api/x/bots/buys'](U('mod=' + encodeURIComponent(mod)), null, wctx);
  const cu = u => bg.cards.find(c => c.unit === u);
  ok(bg.compared === true, 'buys compared with the game');
  ok(cu('chainn3_cromwell') && cu('chainn3_cromwell').how === 'new', 'GT-14 added unit is the mod\'s (new)');
  ok(cu('qf2') && cu('qf2').how === 'changed', 'GT-14 changed card is the mod\'s (changed)');
  ok(!cu('willysmb_eng') && !cu('bedford') && !cu('qf6'), 'GT-14 copied game cards are not listed as the mod\'s');
  // searchKit index of the unit boxes: the game's buy cards (vfs) and the mod's, by army from the file name
  {
    const ul = await R['GET /api/x/bots/units'](U('mod=' + encodeURIComponent(mod)), null, wctx), uu = (u, a) => ul.units.find(x => x.unit === u && x.army === a);
    ok(uu('chainn3_cromwell', 'eng') && uu('chainn3_cromwell', 'eng').src === 'mod' && uu('bedford', 'eng') && uu('bedford', 'eng').src === 'game', 'units: game and mod cards by army ' + ul.units.length);
    ok(ul.units.filter(x => x.unit === 'qf2' && x.army === 'eng').length === 1, 'units: a card in both the game and the mod is listed once');
  }
  // table
  const t =await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(mod) + '&file=bots_generic.inc'), null, ctx);
  ok(t.rows.length === 6 && t.rows[0].group === 'easy' && t.rows[0].current === '0.75', 'table bots_generic');
  const tp = await R['GET /api/x/bots/table'](U('mod=' + encodeURIComponent(mod) + '&file=presets_test.inc'), null, ctx);
  ok(['start', 'finish', 'cp', 'growTime', 'bonusCp', 'bonusMp', 'paybackCp', 'paybackRestore'].every(f => tp.rows.some(r => r.field === f)), 'table presets fields');
  // edit: preview does not write, write keeps bytes and CRLF
  const id = 'bots_generic.inc|easy|cp', pid = 'presets_test.inc|s:standard_100_all|start';
  const pre = await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.5' }, write: false }, ctx);
  ok(pre.changes.length === 1 && !pre.written && fs.readFileSync(path.join(G, 'bots_generic.inc'), 'latin1') === generic, 'edit preview');
  let en = null; try { await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.5' }, write: true }, ctx); } catch (x) { en = x; }
  ok(en && en.status === 400 && /game folder is not set/.test(en.message) && fs.readFileSync(path.join(G, 'bots_generic.inc'), 'latin1') === generic, 'edit write with no game set refused (I-9)');
  let er = null; try { await R['POST /api/x/bots/reset'](null, { mod, file: 'bots_generic.inc', write: true }, ctx); } catch (x) { er = x; }
  ok(er && er.status === 400 && fs.existsSync(path.join(G, 'bots_generic.inc')), 'reset with no game set refused, copy kept');
  const wr = await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.5' }, write: true }, wctx);
  ok(wr.written && fs.readFileSync(path.join(G, 'bots_generic.inc'), 'latin1') === generic.replace('{cp 0.75}', '{cp 0.5}'), 'edit write exact bytes');
  // undo (S4): a write reply carries undo [{rel, id}]; POST undo puts the exact bytes back once; a file changed since, or an older write
  // of the same file, is refused plainly (409, bots.e.undo*) and nothing is touched
  {
    const GF = path.join(G, 'bots_generic.inc'), rd = () => fs.readFileSync(GF, 'latin1');
    ok(Array.isArray(wr.undo) && wr.undo.length === 1 && /bots_generic\.inc$/.test(wr.undo[0].rel) && wr.undo[0].id, 'edit write: an undo ticket ' + JSON.stringify(wr.undo));
    const u1 = await R['POST /api/x/bots/undo'](null, { mod, undo: wr.undo }, wctx);
    ok(u1.restored && u1.restored.length === 1 && rd() === generic, 'undo: the exact bytes from before the write');
    let ua = null; try { await R['POST /api/x/bots/undo'](null, { mod, undo: wr.undo }, wctx); } catch (x) { ua = x; }
    ok(ua && ua.status === 409 && ua.key === 'bots.e.undoNone' && rd() === generic, 'undo twice: nothing to undo, said plainly ' + (ua && ua.message));
    const wa = await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.4' }, write: true }, wctx);
    fs.writeFileSync(GF, rd().replace('{cp 0.4}', '{cp 0.3}'), 'latin1');
    let uc = null; try { await R['POST /api/x/bots/undo'](null, { mod, undo: wa.undo }, wctx); } catch (x) { uc = x; }
    ok(uc && uc.status === 409 && uc.key === 'bots.e.undoChanged' && /\{cp 0\.3\}/.test(rd()), 'undo after a change by hand: refused, the file kept ' + (uc && uc.message));
    fs.writeFileSync(GF, generic, 'latin1');
    const wb1 = await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.4' }, write: true }, wctx);
    const wb2 = await R['POST /api/x/bots/edit'](null, { mod, file: 'bots_generic.inc', changes: { [id]: '0.3' }, write: true }, wctx);
    let uo = null; try { await R['POST /api/x/bots/undo'](null, { mod, undo: wb1.undo }, wctx); } catch (x) { uo = x; }
    ok(uo && uo.status === 409 && uo.key === 'bots.e.undoChanged' && /\{cp 0\.3\}/.test(rd()), 'undo of an older write of the same file: refused');
    await R['POST /api/x/bots/undo'](null, { mod, undo: wb2.undo }, wctx);
    ok(/\{cp 0\.4\}/.test(rd()), 'undo of the last write: back to the write before it');
    let ub = null; try { await R['POST /api/x/bots/undo'](null, { mod, undo: [{ rel: '../x', id: '1' }] }, wctx); } catch (x) { ub = x; }
    ok(ub && ub.status === 400 && ub.key === 'bots.e.undoBad', 'undo: a path outside the mod refused');
    fs.writeFileSync(GF, generic.replace('{cp 0.75}', '{cp 0.5}'), 'latin1');
    ok(typeof lib.undo.save === 'function' && typeof lib.undo.restore === 'function', 'lib.undo save/restore exported for the parts');
  }
  // S14: a button or field named in quotes is named by its exact words in that language (a trailing "(...)" or "..." of the label may go)
  {
    const C4 = ['en', 'ru', 'uk', 'zh'], own = require('./lang'), pool = {}, norm = s => String(s).replace(/[.…:]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const extL = []; for (const d of fs.readdirSync(path.join(__dirname, '..'))) for (const f of ['lang.js', 'lang.json']) { const p = path.join(__dirname, '..', d, f); if (fs.existsSync(p)) try { extL.push(f.endsWith('.json') ? JSON.parse(fs.readFileSync(p, 'utf8')) : require(p)); } catch (e) { /* not a lang table */ } }
    for (const c of C4) {
      const s = pool[c] = new Set(), add = v => { if (typeof v !== 'string') return; s.add(norm(v)); s.add(norm(v.replace(/\s*[(（][^()（）]*[)）]\s*$/, ''))); };
      Object.values(X.lang[c] || {}).forEach(add);
      Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'lang', c + '.json'), 'utf8'))).forEach(add);
      for (const L of extL) { const i = C4.indexOf(c) + 1;
        if (Array.isArray(L)) L.forEach(r => Array.isArray(r) && add(r[i]));
        else if (L && L[c] && typeof L[c] === 'object') Object.values(L[c]).forEach(add);
        else if (L && typeof L === 'object') Object.values(L).forEach(v => Array.isArray(v) ? add(v[i - 1]) : null); }
    }
    const Q = /"([^"{}]{2,90})"|«([^»{}]{2,90})»|“([^”{}]{2,90})”/g, badQ = [];
    for (const c of C4) for (const [k, v] of Object.entries(own[c])) for (const m of String(v).matchAll(Q)) { const w = m[1] || m[2] || m[3]; if (!pool[c].has(norm(w))) badQ.push(c + ' ' + k + ': ' + w); }
    ok(!badQ.length, 'S14: quoted names are the exact words on the page: ' + badQ.join(' | '));
  }
  // S6/S9: every server refusal of the frame carries a bots.e.* key worded in four languages
  {
    const used = [...new Set([...fs.readFileSync(path.join(__dirname, 'lib.js'), 'utf8').matchAll(/'(bots\.e\.[a-zA-Z.]+)'/g)].map(m => m[1]))];
    const miss = used.filter(k => !['en', 'ru', 'uk', 'zh'].every(c => X.lang[c][k] && (c === 'en' || X.lang[c][k] !== X.lang.en[k])));
    ok(used.length >= 20 && !miss.length, 'error keys in four languages (' + used.length + '), missing: ' + miss.join());
    ok(en && en.key === 'bots.e.noGameDir', 'a refusal carries its key: ' + (en && en.key));
  }
  await R['POST /api/x/bots/edit'](null, { mod, file: 'presets_test.inc', changes: { [pid]: '999', 'presets_test.inc|test_all|growTime': '10', 'presets_test.inc|test_all|paybackCp': '0\t30\t60' }, write: true }, wctx);
  const pt = fs.readFileSync(path.join(G, 'presets_test.inc'), 'latin1');
  ok(pt === presets.replace('start(160)', 'start(999)').replace('{growTime\t1500}', '{growTime\t10}').replace('"0\t25\t50"', '"0\t30\t60"'), 'presets write exact bytes');
  // bad values
  for (const [c, m] of [[{ [id]: 'abc' }, 'bad number'], [{ [pid]: '-5' }, 'negative'], [{ 'nope|x|y': '1' }, 'unknown id'], [{ 'presets_test.inc|test_all|paybackCp': '1 2' }, 'row count']]) {
    let e = null; try { await R['POST /api/x/bots/edit'](null, { mod, file: c['presets_test.inc|test_all|paybackCp'] ? 'presets_test.inc' : (c[pid] ? 'presets_test.inc' : 'bots_generic.inc'), changes: c, write: true }, wctx); } catch (x) { e = x; }
    ok(e && e.status === 400, 'refuse ' + m);
  }
  // reset
  const rs = await R['POST /api/x/bots/reset'](null, { mod, file: 'bots_generic.inc', write: true }, wctx);
  ok(rs.removed && !fs.existsSync(path.join(G, 'bots_generic.inc')), 'reset removes copy');
  // game dir refusal
  fs.mkdirSync(path.join(gameDir, 'mods', 'm1'), { recursive: true }); modInfo(path.join(gameDir, 'mods', 'm1'));
  const gctx = Object.assign({}, ctx, { game: () => gameDir });
  let e1 = null; try { await R['POST /api/x/bots/edit'](null, { mod: gameDir, file: 'presets_test.inc', changes: {}, write: true }, gctx); } catch (x) { e1 = x; }
  ok(e1 && e1.status === 400, 'refuse game dir');
  let e2 = null; try { await R['POST /api/x/bots/reset'](null, { mod: path.join(gameDir, 'resource'), file: 'presets_test.inc', write: true }, gctx); } catch (x) { e2 = x; }
  ok(e2 && e2.status === 400, 'refuse game resource dir');
  ok(lib.checkMod(gctx, path.join(gameDir, 'mods', 'm1')) && lib.checkWrite(gctx, path.join(gameDir, 'mods', 'm1')), 'game/mods/<mod> allowed');
  // by content, whatever game is set: another AS2 install's resource/, a GoH folder, a Workshop path
  const gB = path.join(work, 'gameB'), goh = path.join(work, 'goh');
  fs.mkdirSync(path.join(gB, 'resource', 'x'), { recursive: true }); fs.writeFileSync(path.join(gB, 'mowas_2.exe'), '');
  fs.mkdirSync(path.join(goh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), ''); fs.mkdirSync(path.join(goh, 'mods', 'g1'), { recursive: true });
  const ws = path.join(work, 'steamapps', 'workshop', 'content', '400750', '1'); fs.mkdirSync(ws, { recursive: true });
  for (const [d, m] of [[path.join(gB, 'resource', 'x'), 'another game resource/'], [path.join(goh, 'mods', 'g1'), 'GoH mods'], [ws, 'Workshop']]) {
    modInfo(d);   // refused by what the folder is part of, not for a missing mod.info
    let e = null; try { lib.checkWrite(wctx, d); } catch (x) { e = x; }
    ok(e && e.status === 400 && /refused/i.test(e.message), 'write refused: ' + m + ' ' + (e && e.message));
  }
  ok(lib.checkWrite(wctx, mod) === mod, 'a mod folder in a normal place allowed');
  // buy first: preview then write; stock list reaches the mod
  const bf = { mod, unit: 'chainn3_cromwell', army: 'eng', stage: '1', cls: 'Tank', first: true };
  const dry = await R['POST /api/x/bots/buyfirst'](null, bf, ctx);
  ok(dry.ok && !dry.wrote, 'buyfirst preview ' + JSON.stringify(dry.say));
  const mod2 = path.join(work, 'mod2'); fs.cpSync(mod, mod2, { recursive: true }); modInfo(mod2);
  let eb = null; try { await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { mod: mod2, write: true }), ctx); } catch (x) { eb = x; }
  ok(eb && eb.status === 400, 'buyfirst write with no game set refused');
  const w2 = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { mod: mod2, write: true }), wctx);
  ok(w2.ok && w2.wrote && /chainn3_cromwell/.test(fs.readFileSync(path.join(mod2, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1')), 'buyfirst write');
  {
    const bd = path.join(mod2, 'resource', 'script', 'multiplayer', 'bot.data.lua'), was = fs.readFileSync(path.join(mod, 'resource', 'script', 'multiplayer', 'bot.data.lua'));
    ok(Array.isArray(w2.undo) && w2.undo.some(u => /bot\.data\.lua$/.test(u.rel)) && w2.placed && w2.placed.army === 'eng', 'buyfirst write: undo tickets and where it went ' + JSON.stringify({ undo: w2.undo, placed: w2.placed }));
    await R['POST /api/x/bots/undo'](null, { mod: mod2, undo: w2.undo }, wctx);
    ok(fs.readFileSync(bd).equals(was), 'buyfirst undo: the bot list back byte for byte');
  }
  // JOBS: checkWrite marks the request as writing; a write stopped from the job list puts every file back and says so
  {
    const j1 = { cancelled: false, writes: false };
    lib.checkWrite(Object.assign({}, wctx, { job: j1 }), mod);
    ok(j1.writes === true, 'checkWrite: the request job is marked as writing');
    const j0 = { cancelled: false, writes: false }; let er = null;
    try { lib.checkWrite(Object.assign({}, ctx, { job: j0 }), mod); } catch (x) { er = x; }
    ok(er && j0.writes === false, 'checkWrite: a refused write is not marked');
    const j2 = { cancelled: false, writes: false };
    await R['POST /api/x/bots/buyfirst'](null, bf, Object.assign({}, wctx, { job: j2 }));
    ok(j2.writes === false, 'buyfirst preview: not marked as writing');
    // the stop lands after the tool has written: the real tool runs, then the request is reported cancelled
    const mod4 = path.join(work, 'mod4'); fs.cpSync(mod, mod4, { recursive: true }); modInfo(mod4);
    const bytes = d => fs.readdirSync(d, { recursive: true }).map(String).sort().map(r => { const f = path.join(d, r); return r + (fs.statSync(f).isFile() ? ':' + fs.readFileSync(f).toString('latin1') : '/'); }).join('|');
    const before = bytes(mod4), j3 = { cancelled: false, writes: false }; let ran = 0;
    const sctx = Object.assign({}, wctx, { job: j3, runTool: async (...a) => { const r = await wctx.runTool(...a); ran++; return Object.assign({}, r, { code: null, cancelled: true }); } });
    const st = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { mod: mod4, write: true }), sctx);
    ok(ran === 1 && st.cancelled === true && st.ok === false && st.wrote === false && j3.writes === true && !st.undo, 'buyfirst stopped: returns early as cancelled, no undo ticket: ' + JSON.stringify(st).slice(0, 200));
    ok(bytes(mod4) === before && Array.isArray(st.left) && st.left.length === 0, 'buyfirst stopped: every file in the mod is back byte for byte, nothing left: ' + JSON.stringify([st.put, st.left]));
    // the stop is seen on the request's job only (the child's answer looks normal): the same end
    const j4 = { cancelled: false, writes: false };
    const st2 = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { mod: mod4, write: true }), Object.assign({}, wctx, { job: j4, runTool: async (...a) => { const r = await wctx.runTool(...a); j4.cancelled = true; return r; } }));
    ok(st2.cancelled === true && bytes(mod4) === before, 'buyfirst stopped (seen on the request job): files back');
    const st3 = await R['POST /api/x/bots/buyfirst'](null, bf, Object.assign({}, ctx, { runTool: async () => ({ code: null, stdout: '', stderr: '', timedOut: false, cancelled: true }) }));
    ok(st3.cancelled === true && st3.wrote === false && st3.put.length === 0, 'buyfirst preview stopped: returns early');
  }
  // check A4: a unit the bots buy already: the preview says so in plain words, a write copies nothing into the mod and leaves no undo entry
  {
    const ma = path.join(work, 'mod-already'); fs.mkdirSync(path.join(ma, 'resource'), { recursive: true }); modInfo(ma);
    const BD = path.join(ma, 'resource', 'script', 'multiplayer', 'bot.data.lua');
    const stock = fs.readFileSync(path.join(mod, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');
    const have = (/\["eng"\]\s*=\s*\{[\s\S]*?unit\s*=\s*"(\w+)"/.exec(stock) || [])[1];
    const tree = d => fs.readdirSync(d, { recursive: true }).map(String).sort().join('|');
    const g2 = path.join(work, 'game-already'), gbd = path.join(g2, 'resource', 'script', 'multiplayer'); fs.mkdirSync(gbd, { recursive: true }); fs.writeFileSync(path.join(gbd, 'bot.data.lua'), stock, 'latin1');
    const actx = Object.assign({}, ctx, { game: () => g2 });   // the list comes from the game: the mod has none of its own
    const t0 = tree(ma), ab = { mod: ma, unit: have, army: 'eng', stage: '1', cls: 'Tank', first: true };
    const p0 = await R['POST /api/x/bots/buyfirst'](null, ab, actx);
    ok(have && p0.ok && p0.noChange === true && !p0.wrote, 'buyfirst: a unit the bots buy already: the preview says nothing to change ' + JSON.stringify([have, p0.noChange, p0.say]));
    const w0 = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, ab, { write: true }), actx);
    ok(w0.ok && w0.noChange === true && !w0.wrote && !fs.existsSync(BD) && tree(ma) === t0, 'buyfirst: already bought: a write copies nothing into the mod ' + JSON.stringify([w0.wrote, tree(ma)]));
    ok(Array.isArray(w0.undo) && w0.undo.length === 0, 'buyfirst: already bought: no undo entry ' + JSON.stringify(w0.undo));
    const fresh = await R['POST /api/x/bots/buyfirst'](null, bf, ctx);
    ok(fresh.ok && fresh.noChange === false, 'buyfirst: a new unit is not "nothing to change"');
    for (const L of ['en', 'ru', 'uk', 'zh']) ok(/\{name\}/.test(X.lang[L]['bots.add.already'] || ''), 'bots.add.already in ' + L);
    ok(/r\.noChange\)\{G\.clear\(\)/.test(X.script || fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8')), 'client: nothing to change clears the gate (Write stays off)');
  }
  // S13: undo keeps a stack per file (more than one step back), a first write's folders go on undo, GET undo says what can be undone
  {
    const um = path.join(work, 'undomod'); fs.mkdirSync(um, { recursive: true }); modInfo(um);
    const rel = 'set/target/ammo.set', p = path.join(um, 'resource', 'set', 'target', 'ammo.set');
    const put = s => { const u = lib.undo.save(wctx, um, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); return u.commit(); };
    const s0 = lib.undo.state(wctx, um, rel);
    ok(!s0.ok && s0.n === 0 && s0.key === 'bots.e.undoNone', 'undo state: nothing yet ' + JSON.stringify(s0));
    for (let i = 1; i <= 12; i++) put('v' + i);
    const s1 = lib.undo.state(wctx, um, rel);
    ok(s1.ok && s1.n === 12 && lib.undo.MAX >= 10, 'undo stack: 12 writes kept (max ' + lib.undo.MAX + ') ' + JSON.stringify(s1));
    for (let i = 11; i >= 1; i--) { lib.undo.restore(wctx, um, rel); if (fs.readFileSync(p, 'utf8') !== 'v' + i) { ok(false, 'undo step back to v' + i); break; } }
    ok(fs.readFileSync(p, 'utf8') === 'v1', 'undo: eleven steps back, each to the write before');
    const last = lib.undo.restore(wctx, um, rel);
    ok(last.removed && !fs.existsSync(path.join(um, 'resource')) && fs.existsSync(um), 'undo of the first write: the file and the folders it made go (resource/set/target), the mod folder stays ' + JSON.stringify(last));
    // another write made "set" earlier: still no empty folder left
    fs.mkdirSync(path.join(um, 'resource', 'set', 'other'), { recursive: true }); put('w'); fs.rmSync(path.join(um, 'resource', 'set', 'other'), { recursive: true });
    lib.undo.restore(wctx, um, rel);
    ok(!fs.existsSync(path.join(um, 'resource')), 'undo: empty parents go even when an earlier write made them');
    put('a'); fs.writeFileSync(p, 'by hand');
    const s2 = lib.undo.state(wctx, um, rel);
    ok(!s2.ok && s2.key === 'bots.e.undoChanged', 'undo state: a file changed by hand cannot be undone ' + JSON.stringify(s2));
    const g = await R['GET /api/x/bots/undo'](U('mod=' + encodeURIComponent(um) + '&rel=' + encodeURIComponent(rel) + '&rel=none.set'), null, wctx);
    ok(g.files && g.files.length === 2 && g.files[0].rel === rel && g.files[0].n === 1 && !g.files[0].ok && g.files[1].n === 0, 'GET undo: one state per file ' + JSON.stringify(g));
  }
  // item 4: stages by table position, so a list with no {--purchase N} comments still has its stages
  {
    const STG = require('../../../botrecipe/stages');
    const stock = fs.readFileSync(path.join(mod, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1'), bare = stock.replace(/--[^\r\n]*/g, '');
    const a = STG.stagesOf(stock), b = STG.stagesOf(bare);
    ok(a.length >= 2 && b.length === a.length && !/--purchase/.test(bare), 'stages: the same count with and without comments (' + a.length + '/' + b.length + ')');
    const mb = path.join(work, 'modbare'); fs.cpSync(mod, mb, { recursive: true }); modInfo(mb);
    fs.writeFileSync(path.join(mb, 'resource', 'script', 'multiplayer', 'bot.data.lua'), bare, 'latin1');
    let es = null; try { await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { mod: mb, stage: String(b.length + 1) }), ctx); } catch (x) { es = x; }
    ok(es && es.status === 400 && es.key === 'bots.e.stage' && es.params && Number(es.params.n) === b.length, 'buyfirst: a stage past the end refused with the real count ' + (es && es.message));
    const d1 = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { mod: mb, stage: '1' }), ctx);
    ok(d1.ok, 'buyfirst: stage 1 of a list with no comments works ' + JSON.stringify(d1.say || d1.plain));
    const bb = await R['GET /api/x/bots/buys'](U('mod=' + encodeURIComponent(mb)), null, ctx);
    ok(bb.stages && bb.stages.length === b.length && bb.labels && Object.keys(bb.labels).length && Object.keys(bb.labels).every(k => bb.labels[k] && bb.labels[k] !== k || !lib.ARMY_NAMES[k]), 'buys: no comments, army labels are still in-game names ' + JSON.stringify(bb.labels));
    ok(lib.armyName('ger') === 'Germany' && lib.armyName('zzz') === 'zzz', 'armyName: the game name by code, the code when unknown');
  }
  // item 3: a unit with no buy card is refused before anything runs (a worded key)
  {
    const gc = path.join(work, 'gamecards'); W(path.join(gc, 'resource', 'set', 'multiplayer', 'units', 'eng.set'), '{"chainn3_cromwell" 1 2 3}\r\n');
    fs.writeFileSync(path.join(gc, 'mowas_2.exe'), '');
    const cctx = Object.assign({}, ctx, { game: () => gc });
    ok(lib.hasCard(cctx, mod, 'chainn3_cromwell') === true, 'hasCard: a card in the game');
    if (lib.hasCard(cctx, mod, 'nocard_unit') === false) {
      let en0 = null; try { await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { unit: 'nocard_unit' }), cctx); } catch (x) { en0 = x; }
      ok(en0 && en0.status === 400 && en0.key === 'bots.e.noCard' && X.lang.ru['bots.e.noCard'], 'buyfirst: a unit with no buy card refused with bots.e.noCard ' + (en0 && en0.message));
    } else ok(false, 'hasCard: a unit the game and the mod have no card for = false');
  }
  // plain message for a raw code
  const miss = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { after: 'nosuchunit' }), ctx);
  ok(!miss.ok && miss.code === 'BOT_ANCHOR_MISSING' && miss.plain, 'buyfirst plain code');
  let e3 = null; try { await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, { unit: 'bad name!' }), ctx); } catch (x) { e3 = x; }
  ok(e3 && e3.status === 400, 'refuse bad unit name');
  // GEN-FIX3: min_income / min_team on the line, Repeat of the stage (gen bots op field names); plan first, refusals before any run
  {
    const bx = Object.assign({}, bf, { minIncome: 300, minTeam: 2, repeat: 3 });
    const dryx = await R['POST /api/x/bots/buyfirst'](null, bx, ctx);
    ok(dryx.ok && !dryx.wrote && dryx.say.some(l => /would set min_income = 300, min_team = 2/.test(l)) && dryx.say.some(l => /would set stage 1 Repeat 1 -> 3/.test(l)), 'buyfirst extra preview ' + JSON.stringify(dryx.say));
    const mod3 = path.join(work, 'mod3'); fs.cpSync(mod, mod3, { recursive: true }); modInfo(mod3);
    const before = fs.readFileSync(path.join(mod3, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');
    const wx = await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bx, { mod: mod3, write: true }), wctx);
    const after = fs.readFileSync(path.join(mod3, 'resource', 'script', 'multiplayer', 'bot.data.lua'), 'latin1');
    ok(wx.ok && wx.wrote && /unit = "chainn3_cromwell", min_income = 300, min_team = 2\},/.test(after), 'buyfirst extra on the line ' + JSON.stringify(wx.say));
    ok(/\{--purchase 1\r\n\t\tRepeat = 3,/.test(after) && /\{--purchase 2\r\n\t\tRepeat = 1,/.test(after), 'buyfirst repeat on stage 1 only');
    ok(after.split('\r\n').length === before.split('\r\n').length + 1 && !/[^\r]\n/.test(after), 'buyfirst extra: one line more, CRLF kept');
    // seeded defects: each refused with 400 before anything runs
    for (const [o, m] of [[{ minIncome: '-5' }, 'negative min_income'], [{ minTeam: 'two' }, 'min_team not a number'], [{ repeat: 0 }, 'repeat 0'], [{ repeat: 2, stage: '' }, 'repeat without a stage'], [{ repeat: 2, stage: '9' }, 'repeat on a missing stage']]) {
      let ex = null; try { await R['POST /api/x/bots/buyfirst'](null, Object.assign({}, bf, o), ctx); } catch (x) { ex = x; }
      ok(ex && ex.status === 400, 'buyfirst refuses ' + m + (ex ? '' : ' (not refused)'));
    }
  }

  // blocks: the whole page in the fake DOM, the screen driven to its loaded states, every part in a leaf block
  {
    const B = require('./blkboot'), en = X.lang.en;
    const row = (file, group, field, cur) => ({ id: file + '|' + group + '|' + field, group, field, current: cur, vanilla: '1.0', kind: 'num' });
    let stopAdd = false;   // true: buyfirst answers 499 (stopped from the job list)
    let whole = true;   // the edit reply: true = a whole copy of the stock file goes in, false = the mod already has its own copy
    const lay = { v: 1, active: 't', profiles: { t: { screens: { bots: { o: { diff: ['diff.title', 'buys'] }, hid: [] } } } } };
    const P = await B.boot({ 'as2gui.mod': 'C:/m', 'as2gui.layout': lay },(p, m, body, u) => /buys$/.test(p) ? { from: 'mod', ownBot: true, compared: false, labels: { ger: 'Germany' }, stages: [{ n: 1, repeat: 0, armies: { ger: [{ unit: 'pz', cls: 'Tank', priority: 1 }] } }, { n: 2, repeat: 2, armies: { ger: [] } }], cards: [{ unit: 'c1', army: 'ger', listed: false, how: 'new' }] } :
      /table$/.test(p) ? { rows: /bots_generic/.test(u) ? [row('g', 'easy', 'cp', '0.75')] : [row('p', 's:std', 'start', '160'), row('p', 'all', 'growTime', '1500')] } :
      /units$/.test(p) ? { units: [{ unit: 'c1', army: 'ger', src: 'mod' }, { unit: 'sherman_m4a1', army: 'usa', src: 'game' }, { unit: 't34_85', army: 'rus', src: 'game', name: 'T-34/85' }] } :
      /undo$/.test(p) ? (m === 'GET' ? { files: [...u.matchAll(/[?&]rel=([^&]*)/g)].map(x => ({ rel: decodeURIComponent(x[1]), ok: true, id: 'u1', n: 1 })) } : { restored: ['x'] }) : /buyfirst$/.test(p) ? stopAdd ? { __status: 499, key: 'job.cancelled', error: 'cancelled' } : { ok: true, say: ['said'], name: 'Unit C1', placed: { army: 'ger', after: 'pz' }, undo: body && body.write ? [{ rel: 'resource/script/multiplayer/bot.data.lua', id: 'u1' }] : undefined } : /edit$/.test(p) ? { changes: [{ group: 'easy', field: 'cp', was: '0.75', now: '0.5' }], copiesWholeFile: whole, target: 't' } : undefined);
    await P.settle(); P.ctx.as2Link('page:bots'); await P.settle();   // lazy pages: the Bots page draws at its first show
    const s = P.sec('bots'), Q = (tag, f) => s.all().find(e => e.tagName === tag && f(e)), btn = t => Q('BUTTON', e => e.textContent === t);
    const say = (m, pr) => ok(!pr.length, m + (pr.length ? ': ' + pr.slice(0, 12).join('; ') : ''));
    say('blocks: loaded', B.check(s));
    const want = ['title', 'lead', 'how', 'mod', 'nogame', 'buys', 'buys.army', 'buys.list', 'add.miss', 'buys.nocompare', 'add', 'add.f.unit', 'tasks', 'tasks.list', 'pages', 'add.more', 'diff', 'diff.table', 'adv', 'adv.modes', 'adv.open'];
    ok(want.every(i => B.ids(s).includes(i)), 'blocks: every card drawn, missing: ' + want.filter(i => !B.ids(s).includes(i)).join());
    // the multiplayer start settings moved to the Game Modes page (ext/modes): none of its blocks here, a button opens that page
    ok(!B.ids(s).some(i => /^mp(\.|$)/.test(i)) && !P.calls.some(c => /presets_/.test(c[1])), 'blocks: no multiplayer start settings on the Bots page');
    ok(/var BOTS_UI=/.test(X.script) && /mpCard:mpCard/.test(X.script), 'BOTS_UI shares the editor and the start settings card');
    const om = Q('BUTTON', e => e.textContent === en['bots.adv.openModes'] && e.parentNode && e.parentNode.dataset.blk === 'adv.open'); ok(!!om, 'blocks: Open Game Modes button next to Open Maps');
    // searchKit (owner 2026-11-19): the unit, copy-of and table filter boxes have browse, an index and history
    {
      P.ctx.requestAnimationFrame = f => f();   // this harness never runs timers: draw at once
      const ks = s.all().filter(e => e.dataset && e.dataset.sk).map(e => e.dataset.sk);
      ok(['bots.add.unit', 'bots.add.like'].every(k => ks.includes(k)), 'searchKit: unit boxes ' + ks.join(','));
      const ui = Q('INPUT', e => e.attrs['aria-label'] === en['bots.add.unit']);
      ui.value = 'pz'; ui.fire('input'); await P.settle();
      const dd = ui.parentNode.all().find(e => e.attrs && e.attrs.role === 'listbox');
      const o = dd && dd.all().find(e => /sk-index/.test(e.className || '') && /^pz/.test(e.textContent));
      ok(!!o, 'searchKit: a unit from the bot list is suggested ' + (dd ? dd.textContent : ''));
      ui.value = 'sher'; ui.fire('input'); await P.settle();
      const o2 = dd && dd.all().find(e => /sk-index/.test(e.className || '') && /^sherman_m4a1/.test(e.textContent));
      ok(!!o2, 'searchKit: a game card from /units is suggested');
      if (o) { ui.value = 'pz'; ui.fire('input'); await P.settle(); const o3 = dd.all().find(e => /sk-index/.test(e.className || '') && /^pz/.test(e.textContent));
        dd.fire('click', { target: o3 }); await P.settle();
        const asel = Q('SELECT', e => e.attrs['aria-label'] === en['bots.add.army']);
        ok(ui.value === 'pz' && asel.value === 'ger', 'searchKit: a picked unit fills the box and its army ' + ui.value + ' ' + asel.value); asel.value = ''; }
      // Browse = the file picker (owner 2026-11-19): game data at entity/, .def only; a pick gives the unit's name
      const sent = []; P.ctx.searchKit.picker = (spec, done) => { sent.push(spec); done('entity/vehicle/tank/t34_85/t34_85.def', { view: 'data', name: 't34_85.def' }); };
      ui._sk.browseButton.click(); await P.settle();
      ok(sent.length === 1 && sent[0].view === 'data' && sent[0].start === 'entity' && sent[0].mode === 'file' && (sent[0].exts || []).join() === 'def' && ui.value === 't34_85', 'searchKit: unit Browse opens the game data at entity/, a pick gives the name ' + JSON.stringify(sent[0]) + ' ' + ui.value);
      const lk = Q('INPUT', e => e.attrs['aria-label'] === en['bots.add.like']);
      lk._sk.browseButton.click(); await P.settle();
      ok(sent.length === 2 && sent[1].start === 'entity' && lk.value === 't34_85', 'searchKit: copy-of Browse the same ' + lk.value);
      lk.value = ''; ui.value = '';
      ui.value = ''; ui.focus(); ui.fire('keydown', { key: 'ArrowDown' }); await P.settle();
      ok(dd.all().filter(e => /sk-index/.test(e.className || '')).length >= 2, 'searchKit: ArrowDown on an empty unit box shows the first rows of the index');
      ui._sk.close();
      // the start settings card (BOTS_UI.mpCard, shown on Game Modes): its filter's Browse opens the game data at the presets' folder; a
      // preset file picked there opens in the card (the file list follows) and the filter shows all of its rows
      P.ctx.as2Link('page:modes'); await P.settle(); const mp = P.sec('modes');
      const fl = mp.all().find(e => e.tagName === 'INPUT' && e.attrs['aria-label'] === en['bots.mp.filter']), fs2 = mp.all().find(e => e.tagName === 'SELECT' && e.attrs['aria-label'] === en['bots.mp.file']);
      sent.length = 0; P.ctx.searchKit.picker = (spec, done) => { sent.push(spec); done('set/multiplayer/games/presets_all.inc', { view: 'data', name: 'presets_all.inc' }); };
      const nT0 = P.calls.filter(c => /\/bots\/table\?.*presets_all/.test(c[1])).length;
      fl._sk.browseButton.click(); await P.settle();
      ok(sent.length === 1 && sent[0].view === 'data' && sent[0].start === 'set/multiplayer/games' && (sent[0].exts || []).join() === 'inc', 'mp filter Browse at set/multiplayer/games ' + JSON.stringify(sent[0]));
      ok(fl.value === 'presets_all.inc' && fs2.value === 'presets_all.inc' && P.calls.filter(c => /\/bots\/table\?.*presets_all/.test(c[1])).length > nT0, 'mp filter Browse: the picked preset file opens, the file list follows ' + fl.value + ' ' + fs2.value);
      const rowsShown = mp.all().filter(e => e.tagName === 'TR').length;
      ok(rowsShown >= 2, 'mp filter: the file name as the filter shows all of its rows (' + rowsShown + ')');
      P.ctx.as2Link('page:bots'); await P.settle();   // back on the Bots page: a page that is not on screen is not drawn again (lazy pages)
    }
    // S1: an in-game name typed in the unit box is taken as that unit
    { const ui = Q('INPUT', e => e.attrs['aria-label'] === en['bots.add.unit']); ui.value = 't-34/85';
      btn(en['bots.add.preview']).click(); await P.settle();
      const c = P.calls.filter(c => /\/buyfirst$/.test(c[1])).pop();
      ok(c && c[2].unit === 't34_85' && ui.value === 't34_85', 'add: the in-game name typed is turned into the unit ' + (c && c[2].unit));
      P.calls.splice(P.calls.indexOf(c), 1); }
    Q('INPUT', e => e.attrs['aria-label'] === en['bots.add.unit']).value = 'c1';
    btn(en['bots.add.preview']).click(); await P.settle();
    // Add unit: Write into my mod asks first (the unit, the file, the mod); a cancel writes nothing, a yes writes once
    const addW = () => P.calls.filter(c => /\/buyfirst$/.test(c[1]) && c[2] && c[2].write);
    const bAdd = () => Q('BUTTON', e => e.textContent === en['bots.add.write'] && e.parentNode && e.parentNode.dataset.blk === 'add.btns');
    const blk2 = id => s.all().find(e => B.isB(e) && e.dataset.blk === id);
    // S3: the preview leads with plain sentences; the file change is folded
    { const ar = blk2('add.res'); ok(ar && ar.textContent.includes(en['bots.add.pv.h']) && ar.all().some(e => e.tagName === 'DETAILS' && e.textContent.includes(en['bots.exact'])), 'add preview: plain sentences first, the exact change folded'); }
    // the units of the mod no bot buys: at the top of the add card, a click fills the form
    { const mb = blk2('add.miss'), b1 = mb && mb.all().find(e => e.tagName === 'BUTTON' && e.dataset.unit === 'c1'), all = blk2('add').all();
      ok(b1 && all.indexOf(mb) < all.indexOf(blk2('add.f.unit')), 'add: the missing units list sits at the top of the card'); }
    const BD = 'resource/script/multiplayer/bot.data.lua', fill = (k, o) => Object.keys(o).reduce((s, n) => s.split('{' + n + '}').join(o[n]), en[k]);
    let asked = ''; P.ctx.confirm = q => { asked = String(q); return false; };
    const pvBody = P.calls.filter(c => /\/buyfirst$/.test(c[1]))[0][2], wantP = pvBody.first ? '1000' : '1';   // the priority the server uses for that preview
    ok(!bAdd().disabled, 'add: preview turns the write button on');
    bAdd().click(); await P.settle();
    ok(addW().length === 0 && asked.includes(fill('bots.add.ask', { unit: 'Unit C1', file: BD, army: en['bots.add.auto'], stage: en['bots.add.auto'], p: wantP })) && asked.includes('C:/m') && asked.includes(fill('bots.add.replace', { file: BD })) && !asked.includes(fill('bots.add.copy', { file: BD })), 'add: write asks first with the unit, the file and the mod (its own list is replaced), a cancel writes nothing: ' + asked);
    P.ctx.confirm = () => true; bAdd().click(); await P.settle();
    ok(addW().length === 1 && addW()[0][2].unit === 'c1' && addW()[0][2].mod === 'C:/m', 'add: yes at the ask writes once');
    // S4: the green box (what changed, how to see it, next steps, Undo); the buy list read again; Undo posts the tickets
    { const ar = blk2('add.res'), nb = P.calls.filter(c => /\/buys\?/.test(c[1])).length;
      ok(ar && ar.textContent.includes(en['bots.done.title']) && ar.textContent.includes('Unit C1') && ar.all().some(e => e.tagName === 'BUTTON' && e.textContent === en['bots.next.match']), 'add write: the green box in plain words with next steps ' + (ar && ar.textContent.slice(0, 200)));
      ar.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['bots.btn.undo']).click(); await P.settle();
      const uc = P.calls.filter(c => /\/bots\/undo$/.test(c[1])).pop();
      ok(uc && uc[2].mod === 'C:/m' && uc[2].undo[0].id === 'u1' && ar.textContent.includes(en['bots.undo.done']) && P.calls.filter(c => /\/buys\?/.test(c[1])).length > nb, 'add undo: the tickets posted, said done, the buy list read again');
      Q('INPUT', e => e.attrs['aria-label'] === en['bots.add.unit']).value = 'c1'; }
    // the extra writes are named in the ask: a copied card
    const likeIn = Q('INPUT', e => e.attrs['aria-label'] === en['bots.add.like']); likeIn.value = 'qf2'; likeIn.fire('input');
    btn(en['bots.add.preview']).click(); await P.settle();
    asked = ''; P.ctx.confirm = q => { asked = String(q); return false; }; bAdd().click(); await P.settle();
    ok(addW().length === 1 && asked.includes(fill('bots.add.askCard', { unit: 'Unit C1', like: 'qf2' })), 'add: the ask names the copied buy card: ' + asked);
    P.ctx.confirm = () => true;
    const inp = Q('INPUT', e => e.attrs['aria-label'] === 'Easy, ' + en['bots.f.cp']); inp.value = '0.5'; inp.fire('input');
    Q('BUTTON', e => e.textContent === en['bots.btn.preview'] && e.parentNode && e.parentNode.dataset.blk === 'diff.btns').click(); await P.settle();
    // number editor: when the mod already has its own copy (no whole-file copy), the ask says that copy is replaced
    const saveW = () => Q('BUTTON', e => e.textContent === en['bots.save.write'] && e.parentNode && e.parentNode.dataset.blk === 'diff.btns');
    const editW = () => P.calls.filter(c => /\/edit$/.test(c[1]) && c[2] && c[2].write);
    asked = ''; P.ctx.confirm = q => { asked = String(q); return false; }; saveW().click(); await P.settle();
    ok(editW().length === 0 && asked.includes(fill('bots.save.copy', { file: 'bots_generic.inc' })) && !asked.includes(fill('bots.save.replace', { file: 'bots_generic.inc' })), 'save: a whole copy is named when the mod has none: ' + asked);
    whole = false; inp.value = '0.4'; inp.fire('input'); ok(saveW().disabled, 'save: an edit after the preview turns the write off');
    Q('BUTTON', e => e.textContent === en['bots.btn.preview'] && e.parentNode && e.parentNode.dataset.blk === 'diff.btns').click(); await P.settle();
    asked = ''; saveW().click(); await P.settle();
    ok(editW().length === 0 && asked.includes(fill('bots.save.replace', { file: 'bots_generic.inc' })) && !asked.includes(fill('bots.save.copy', { file: 'bots_generic.inc' })), 'save: the mod\'s own copy is named as replaced: ' + asked);
    P.ctx.confirm = () => true;
    say('blocks: after add and preview', B.check(s));
    // JOBS: an Add stopped from the job list is a plain "stopped" line that says the list was put back, never an error box
    { stopAdd = true; P.ctx.confirm = () => true;
      btn(en['bots.add.preview']).click(); await P.settle();
      const ar1 = blk2('add.res');
      ok(ar1 && ar1.all().some(e => e.getAttribute && e.getAttribute('data-stopped') === '1' && e.textContent === en['bots.stopped']) && !ar1.all().some(e => e.className === 'err'), 'add: a stopped preview is a plain line: ' + (ar1 && ar1.textContent));
      stopAdd = false; btn(en['bots.add.preview']).click(); await P.settle(); stopAdd = true;
      bAdd().click(); await P.settle();
      const ar2 = blk2('add.res');
      ok(ar2 && ar2.all().some(e => e.getAttribute && e.getAttribute('data-stopped') === '1' && e.textContent === en['bots.add.stopped']) && !ar2.all().some(e => e.className === 'err'), 'add: a stopped write says the bot list was put back, plainly: ' + (ar2 && ar2.textContent));
      stopAdd = false; }
    // a profile moved a card into another box: a redraw removes it there, draws it again once, the profile puts it back
    const find = id => s.all().filter(e => B.isB(e) && e.dataset.blk === id);
    ok(find('buys')[0].parentNode === find('diff')[0], 'blocks: the profile moved the buys card into the difficulty box');
    const nBuys = P.calls.filter(c => /\/buys\?/.test(c[1])).length;
    P.ctx.as2Link('page:bots'); await P.settle();
    say('blocks: after a redraw', B.check(s));
    ok(P.calls.filter(c => /\/buys\?/.test(c[1])).length === nBuys + 1, 'blocks: showing the page drew it again');
    ok(find('buys').length === 1 && find('how').length === 1 && find('buys')[0].parentNode === find('diff')[0], 'blocks: a redraw does not double a moved card and keeps it where the profile put it');
    const GOHUNITS = { goh: true, units: [{ unit: 'pz4(ger)', army: 'ger', src: 'game', cls: 'Tank', lists: ['mid'] }, { unit: 'sq_con(ger)', army: 'ger', src: 'game', cls: 'Infantry', lists: ['conquest'] }], cannot: [], armies: { ger: 'Germany' }, lists: ['mid', 'conquest'], kinds: ['Infantry', 'Tank'] };
    const GOHBUYS = { game: 'goh', from: 'game', list: 'conquest', lists: ['mid', 'conquest'], armies: ['ger'], labels: { ger: 'Germany' }, stages: [{ n: 1, repeat: 0, repeats: { ger: 0 }, armies: { ger: [{ unit: 'sq_con(ger)', cls: 'Infantry', priority: null, availability: 1.4 }] } }], files: { ger: { rel: 'script/multiplayer/units/ger/conquest.ger.lua', from: 'game' } }, modes: [{ mode: 'frontlines', list: 'period' }], notRead: [{ file: 'script/multiplayer/units/ger/conquest.ger.lua', line: 3, what: 'key odd' }], cards: [], classes: [], compared: true, ownBot: false, names: {} };
    // GoH (S7): the buy list cards greyed up front with the reason, no call for them; the difficulty card reads the GoH file
    { const P3 = await B.boot({ 'as2gui.gameId': 'goh', 'as2gui.games': { goh: { dir: '', mod: 'C:/m', roots: null, screen: 'bots' } } }, (p, m, body, u) => /table$/.test(p) ? { rows: [] } : /\/buys$/.test(p) ? GOHBUYS : /\/units$/.test(p) ? GOHUNITS : /undo$/.test(p) && m === 'GET' ? { files: [] } : /buyfirst$/.test(p) ? { ok: true, rel: 'script/multiplayer/units/' + body.army + '/' + body.list + '.' + body.army + '.lua', from: 'game', placed: { after: 'pz4(ger)', army: body.army }, pri: body.priority || null, say: ['buy-first ' + body.unit], undo: body.write ? [{ rel: 'script/multiplayer/units/ger/mid.ger.lua', id: 'g1' }] : undefined } : undefined);
      P3.ctx.as2Link('page:bots'); await P3.settle();
      const s3 = P3.sec('bots'), i3 = B.ids(s3), c3 = P3.calls.map(c => c[1]).filter(u => /\/api\/x\/bots\//.test(u));
      ok(['add.f.army', 'add.f.list', 'add.f.unit', 'game'].every(i => i3.includes(i)) && !i3.includes('add.na') && !i3.includes('buys.na') && c3.some(u => /\/bots\/units\?mod=/.test(u)) && !c3.some(u => /\/bots\/buyfirst/.test(u)), 'goh: the add card drawn with army, list and unit; the unit index asked, nothing written ' + i3.join());
      // GoH add: the unit box on the searchKit (browse, index from the purchase lists, history); army and list from the replies; Preview
      // sends army + list, Write is greyed until then and asks first with the roster file, the green box carries the undo ticket
      { const Q3 = (tag, f) => s3.all().find(e => e.tagName === tag && f(e)), en3 = X.lang.en;
        P3.ctx.requestAnimationFrame = f => f();
        const ks3 = s3.all().filter(e => e.dataset && e.dataset.sk).map(e => e.dataset.sk);
        ok(['bots.add.unit', 'bots.add.after'].every(k => ks3.includes(k)), 'goh add: unit and after boxes on the searchKit ' + ks3.join());
        const gu = Q3('INPUT', e => e.attrs['aria-label'] === en3['bots.add.unit']), ga = Q3('SELECT', e => e.attrs['aria-label'] === en3['bots.add.army']), gl = s3.all().find(e => B.isB(e) && e.dataset.blk === 'add.f.list').all().find(e => e.tagName === 'SELECT');
        ok(gu._sk && gu._sk.browseButton && ga.value === 'ger' && gl.children.map(o => o.value).join() === 'mid,conquest', 'goh add: browse button, army and lists filled: ' + ga.value + ' ' + gl.children.map(o => o.value).join());
        gu.value = 'pz'; gu.fire('input'); await P3.settle();
        const dd3 = gu.parentNode.all().find(e => e.attrs && e.attrs.role === 'listbox'), o3 = dd3 && dd3.all().find(e => /sk-index/.test(e.className || '') && /^pz4\(ger\)/.test(e.textContent));
        ok(!!o3, 'goh add: a unit of a purchase list is suggested ' + (dd3 ? dd3.textContent : ''));
        gu._sk.close();
        const gb = t3 => Q3('BUTTON', e => e.textContent === t3 && e.parentNode && e.parentNode.dataset.blk === 'add.btns');
        gu.value = 'pz3(ger)'; gu.fire('input'); gu._sk.close(); gl.value = 'mid'; gl.fire('change');
        ok(gb(en3['bots.btn.write']).disabled, 'goh add: Write greyed before a preview');
        gb(en3['bots.btn.preview']).click(); await P3.settle();
        const pc = P3.calls.filter(c => /\/buyfirst$/.test(c[1])).pop();
        ok(pc && pc[2].unit === 'pz3(ger)' && pc[2].army === 'ger' && pc[2].list === 'mid' && !pc[2].write && !gb(en3['bots.btn.write']).disabled, 'goh add: preview sends unit, army and list; Write on after it ' + JSON.stringify(pc && pc[2]));
        const ar3 = s3.all().find(e => B.isB(e) && e.dataset.blk === 'add.res');
        ok(ar3 && ar3.textContent.includes(fill('bots.add.gohPv', { army: 'Germany', name: 'pz3(ger)', list: 'mid', after: 'pz4(ger)' })) && ar3.textContent.includes(en3['bots.add.gohCopy']), 'goh add: the preview in plain words ' + (ar3 && ar3.textContent.slice(0, 300)));
        let asked3 = ''; P3.ctx.confirm = q => { asked3 = String(q); return false; };
        gb(en3['bots.btn.write']).click(); await P3.settle();
        ok(!P3.calls.some(c => /\/buyfirst$/.test(c[1]) && c[2].write) && asked3.includes('resource/script/multiplayer/units/ger/mid.ger.lua') && asked3.includes('C:/m'), 'goh add: write asks first with the roster file and the mod: ' + asked3);
        P3.ctx.confirm = () => true; gb(en3['bots.btn.write']).click(); await P3.settle();
        const wc = P3.calls.filter(c => /\/buyfirst$/.test(c[1]) && c[2].write);
        ok(wc.length === 1 && ar3.all().some(e => e.dataset && e.dataset.done === '1') && ar3.all().some(e => e.tagName === 'BUTTON' && e.textContent === en3['bots.btn.undo']), 'goh add: yes writes once, the green box with Undo ' + ar3.textContent.slice(0, 200)); }
      // GoH: the buys card asks for one purchase list and draws it (list picker, availability for a conquest row, the not-read lines)
      ok(c3.some(u => /\/bots\/buys\?mod=/.test(u)) && i3.includes('buys.gohlist') && i3.includes('buys.notread') && i3.includes('buys.file') && s3.textContent.includes(fill('bots.buys.availP', { a: 1.4 })) && s3.textContent.includes('sq_con(ger)'), 'goh: the buys card draws the GoH list ' + i3.join());
      ok(c3.some(u => /\/bots\/table\?.*presets%2Fglobal_parameters%2Fbots_generic\.inc/.test(u)) && s3.textContent.includes(en['bots.game.goh']), c3.join(' ') + ' goh: the difficulty card reads the GoH file; one line says what works'); }
    // no mod: the short page
    const P2 = await B.boot({}, () => undefined); await P2.settle(); P2.ctx.as2Link('page:bots'); await P2.settle();
    const s2 = P2.sec('bots'); say('blocks: no mod', B.check(s2));
    ok(B.ids(s2).includes('needmod') && !B.ids(s2).includes('buys'), 'blocks: no mod shows the pick-a-mod line');
    ok(['group.a', 'group.b', 'group.c', 'group.f', 'how', 'adv'].every(i => B.ids(s2).includes(i)), 'blocks: no mod still draws the groups, how bots choose and more tools');
  }
  await groups();
  await wave3();
  await partTests();
  await parity();
  { const gt = await require('./guardtest')(work, ok); console.log('write guard: ' + gt.n + ' checks over ' + gt.audit.length + ' POST routes'); }
  { const ct = await require('./cachetest')(work, ok); console.log('cache: ' + ct.n + ' checks (shared store, game view, mod listing, Prepare section)'); }
  console.log(bad ? bad + ' failures' : 'bots ext PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });
