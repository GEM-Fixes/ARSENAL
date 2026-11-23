// GUI-EXT modes test. Arg: scratch dir. No game, no network: a seeded game folder (mode cards and the files the list skips) and a seeded
// mod (a mode of its own, a changed copy of a game card) in the scratch dir; then the whole page in the fake DOM (blkboot of ext/bots).
// Author: Imperator_Aug (ARSENAL, ia-b6992b80)
const fs = require('fs'), path = require('path');
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'modes-')));
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const X = require('./index');
const T = path.join(__dirname, '..', '..', '..');
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };

// ---- seeded game: combat (bots off, a settings block), battle_zones (bots on), captureflag (no settings block), cooperative (players,
// order), odd (a class the engine does not know); presets, bots_generic, alliances and the template are not modes
const game = path.join(work, 'game'), mod = path.join(work, 'my_mod');
const G = 'resource/set/multiplayer/games/';
const txt = lines => lines.join('\r\n') + '\r\n';
const put = (root, rel, lines) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt(lines), 'latin1'); };
const COMBAT = ['{game', '\t{teammatch}', '\t{parameters "freezeTime=30"}', '\t{settings', '\t\t{options \t\t\tscoreFinal} ; \xe0\xe1 comment', '\t}', '}'];
const CAPTURE = ['{game', '\t{teammatch}', '}'];
put(game, G + 'combat.set', COMBAT);
put(game, G + 'battle_zones.set', ['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
put(game, G + 'captureflag.set', CAPTURE);
put(game, G + 'cooperative.set', ['{game', '\t{minPlayers\t1}', '\t{maxPlayers\t8}', '\t{order 3}', '\t{settings', '\t}', '}']);
put(game, G + 'odd.set', ['{game', '\t{class nosuch}', '}']);
for (const f of ['presets_test.inc', 'bots_generic.inc', 'preset_alliances.inc', 'gamemode.template']) put(game, G + f, ['{x}']);
fs.writeFileSync(path.join(game, 'as64.exe'), '');
// seeded mod: a mode of its own that plays like combat with bots on (MIS-65), a copy of battle_zones with bots only in a comment
put(mod, G + 'mymode.set', ['{game', '\t{class combat}', '\t{order 100}', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
const BZMOD = ['{game', '\t{settings', '\t\t;{enableBots}', '\t}', '}'];
put(mod, G + 'battle_zones.set', BZMOD);

const ctx = { game: () => game, allowLaunch: false, gamedir: game, tools: T, tmpRoot: work, runTool: async () => { throw new Error('no tool runs here'); } };
const U = q => ({ searchParams: new URLSearchParams(q) });
const R = X.routes;
const modFile = m => path.join(mod, ...(G + m + '.set').split('/'));
const rd = f => fs.readFileSync(f, 'latin1');
const refused = async (fn, re, m) => { let e = null; try { await fn(); } catch (x) { e = x; } ok(e && e.status === 400 && (!re || re.test(e.message)), m + (e ? ' (' + e.message + ')' : ' (not refused)')); };

(async () => {
  // contract
  ok(X.id === 'modes' && X.nav === 'modes.nav' && X.adv === false && X.after === 'missions', 'shape');
  ok(!/`|\$\{/.test(X.script) && /EXT_SCREENS\.modes/.test(X.script) && !/innerHTML/.test(X.script), 'script rules');
  const ext = require('..'); ok(ext.findIndex(x => x.id === 'modes') >= 0 && ext.findIndex(x => x.id === 'modes') < ext.findIndex(x => x.id === 'bots'), 'registered before bots');
  for (const c of ['ru', 'uk', 'zh']) { const miss = Object.keys(X.lang.en).filter(k => !X.lang[c][k]); ok(!miss.length, 'lang ' + c + ' has every key, missing: ' + miss.join()); }
  for (const c of ['en', 'ru', 'uk', 'zh']) for (const k of Object.keys(X.lang.en)) { const s = v => (v.match(/\{\w+\}/g) || []).sort().join(); if (s(X.lang.en[k]) !== s(X.lang[c][k])) ok(false, 'slots differ in ' + c + ' ' + k); }
  ok(X.lang.en['modes.nav'] === 'Game Modes', 'nav label');

  // ---- list
  const L = await R['GET /api/x/modes/list'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  const by = m => L.modes.find(r => r.mode === m);
  ok(L.modes.map(r => r.mode).join() === 'cooperative,mymode,combat,captureflag,battle_zones,odd', 'list: modes by order, then the stock order; .inc and template skipped: ' + L.modes.map(r => r.mode).join());
  ok(by('combat').cls === 'combat' && by('combat').known && !by('combat').clsSet && by('combat').bots === false && by('combat').from === 'game', 'list: a stock card plays as its name, bots off, from the game');
  ok(by('cooperative').min === 1 && by('cooperative').max === 8 && by('cooperative').order === 3, 'list: players and order from the card');
  ok(by('mymode').cls === 'combat' && by('mymode').clsSet && by('mymode').from === 'mod' && by('mymode').bots === true && by('mymode').warn.some(w => w.k === 'modes.w.combat'), 'list: own mode plays like combat with bots on, warned (MIS-65)');
  ok(by('battle_zones').from === 'changed' && by('battle_zones').bots === false, 'list: the mod\'s copy wins, bots in a comment do not count');
  ok(by('odd').known === false && by('odd').cls === 'nosuch' && by('odd').warn.some(w => w.k === 'modes.w.cls'), 'list: unknown class warned (MIS-19)');
  const Lg = await R['GET /api/x/modes/list'](U('mod=' + encodeURIComponent(game)), null, ctx);
  ok(Lg.modWhy === 'maps.e.gameroot' && !Lg.modes.some(r => r.mode === 'mymode') && Lg.modes.find(r => r.mode === 'battle_zones').bots === true, 'list: a refused mod leaves the game alone and says why');
  const L0 = await R['GET /api/x/modes/list'](U(''), null, ctx);
  ok(L0.modes.length === 5 && L0.modes.every(r => r.from === 'game'), 'list: no mod, the game only');
  await refused(() => R['GET /api/x/modes/list'](U(''), null, Object.assign({}, ctx, { game: () => null })), /game folder/, 'list: no game set refused');

  // ---- allow bots: preview writes nothing, write adds {enableBots} with the bytes and CRLF kept
  const P = b => R['POST /api/x/modes/bots'](null, Object.assign({ mod }, b), ctx);
  const pre = await P({ mode: 'combat', write: false });
  ok(pre.ok && pre.state === 'added' && !pre.write && pre.copy && pre.say.some(s => s.k === 'modes.s.added.will') && pre.say.some(s => s.k === 'modes.s.copy'), 'bots preview: would add, copy said');
  ok(pre.warn.some(w => w.k === 'modes.w.combat') && !pre.needsTest, 'bots preview: combat warned (MIS-65), no test asked');
  ok(!fs.existsSync(modFile('combat')), 'bots preview writes nothing');
  {   // JOBS: only a write marks the request's job as a write (the footer asks twice before stopping one)
    const jp = { writes: false }; await R['POST /api/x/modes/bots'](null, { mod, mode: 'combat', write: false }, Object.assign({}, ctx, { job: jp }));
    ok(jp.writes === false && !fs.existsSync(modFile('combat')), 'bots preview: the job is not a write');
  }
  {   // CACHE (gui README): the game's files are the one shared view of lib/gameview; only a write tells the shared mod listing
    const GV = require('../../../lib/gameview'), seen = [], cm = Object.assign({}, ctx, { modtree: { touch: m => seen.push(m) } });
    ok(X._t.viewOf(X._t.gameOf(ctx)) === GV.get({ gameDir: game, gid: 'as64' }) && X._t.viewOf({ id: 'as64', dir: null }) === null, 'cache: the list reads the shared game view');
    const m2 = path.join(work, 'cache_mod'); put(m2, G + 'mymode.set', ['{game', '}']);
    await R['POST /api/x/modes/bots'](null, { mod: m2, mode: 'captureflag', write: false }, cm);
    ok(seen.length === 0, 'cache: a preview does not touch the mod listing');
    const w2 = await R['POST /api/x/modes/bots'](null, { mod: m2, mode: 'captureflag', write: true }, cm);
    ok(w2.state === 'added' && seen.length === 1 && path.resolve(seen[0]) === path.resolve(m2), 'cache: a write touches the mod listing');
  }
  const wr = await P({ mode: 'combat', write: true });
  const want = COMBAT.slice(0, 5).concat(['\t\t{enableBots}'], COMBAT.slice(5));
  ok(wr.ok && wr.state === 'added' && wr.write && wr.needsTest && rd(modFile('combat')) === txt(want), 'bots write: game card copied, {enableBots} in its settings, bytes kept');
  ok(rd(path.join(game, ...(G + 'combat.set').split('/'))) === txt(COMBAT), 'bots write: the game card untouched');
  const again = await P({ mode: 'combat', write: false });
  ok(again.ok && again.state === 'present' && again.say.some(s => s.k === 'modes.s.present') && !again.copy, 'bots again: already on, the mod copy is read');
  const cf = await P({ mode: 'captureflag', write: true });
  const cft = rd(modFile('captureflag'));
  ok(cf.ok && cf.state === 'added' && /\t\{settings\r\n\t\t\{enableBots\}\r\n\t\}\r\n\}\r\n$/.test(cft) && cft.startsWith('{game\r\n\t{teammatch}\r\n') && !/[^\r]\n/.test(cft), 'bots write: a card with no settings block gets one, CRLF kept');
  const bz = await P({ mode: 'battle_zones', write: true });
  ok(bz.ok && bz.state === 'added' && rd(modFile('battle_zones')).includes('\t\t;{enableBots}\r\n') && /\{enableBots\}\r\n\t\}/.test(rd(modFile('battle_zones'))), 'bots write: the mod\'s own copy changed, its comment kept');
  const L2 = await R['GET /api/x/modes/list'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(L2.modes.find(r => r.mode === 'combat').bots && L2.modes.find(r => r.mode === 'combat').from === 'changed' && L2.modes.find(r => r.mode === 'captureflag').bots, 'list after writes: bots on, from my mod');
  // refusals, each before anything is written
  await refused(() => P({ mode: 'Bad Name!' }), /^modes\.e\.mode$/, 'bots: bad mode name refused');
  await refused(() => P({ mode: 'nosuch', write: true }), /^modes\.e\.nocard$/, 'bots: a mode with no card refused');
  await refused(() => P({ mode: 'combat', mod: game, write: true }), /^maps\.e\.gameroot$/, 'bots: the game folder as the mod refused');
  await refused(() => P({ mode: 'combat', mod: path.join(game, 'resource'), write: true }), /^maps\.e\.ingame$/, 'bots: the game data refused');
  await refused(() => P({ mode: 'combat', mod: '' }), /^maps\.e\.nomod$/, 'bots: no mod refused');
  await refused(() => R['POST /api/x/modes/bots'](null, { mod, mode: 'odd', write: true }, Object.assign({}, ctx, { game: () => null })), /game folder/, 'bots: no game set refused');
  ok(!fs.existsSync(modFile('nosuch')) && !fs.existsSync(modFile('odd')) && rd(path.join(game, ...(G + 'combat.set').split('/'))) === txt(COMBAT), 'refusals wrote nothing');

  // ---- the page in the fake DOM: blocks, the moved multiplayer start settings, preview then write, a redraw on a mod change
  {
    const B = require('../bots/blkboot'), en = Object.assign({}, X.lang.en, require('../bots/lang').en);
    const row = (file, group, field, cur) => ({ id: file + '|' + group + '|' + field, group, field, current: cur, vanilla: '1.0', kind: 'num' });
    // the profile puts the start settings into the right column and the guided card into the start settings box
    const lay = { v: 1, active: 't', profiles: { t: { screens: { modes: { o: { right: ['allow', 'mp'], mp: ['mp.file', 'task'] }, hid: [] } } } } };
    const P1 = await B.boot({ 'as2gui.mod': 'C:/m', 'as2gui.layout': lay }, (p, m, body) => /\/modes\/list$/.test(p) ? { modes: L.modes, mod: 'C:/m', modWhy: null } :
      /\/bots\/table$/.test(p) ? { rows: [row('p', 's:std', 'start', '160'), row('p', 'all', 'growTime', '1500')] } :
      /\/bots\/edit$/.test(p) ? { file: body.file, changes: [{ id: 'x', group: 's:std', field: 'start', was: '160', now: '170' }], written: !!body.write, target: 'C:/m/resource/set/multiplayer/games/' + body.file, copiesWholeFile: true } :
      /\/modes\/bots$/.test(p) ? { ok: true, state: 'added', write: body.write, mode: body.mode, copy: true, say: [{ k: body.write ? 'modes.s.added' : 'modes.s.added.will', p: { mode: body.mode, file: 'f' } }], warn: [], needsTest: body.write } : undefined);
    await P1.settle();
    const s = P1.sec('modes');
    ok(!!s, 'page: the Game Modes screen is built');
    if (s) {
      const say = (m, pr) => ok(!pr.length, m + (pr.length ? ': ' + pr.slice(0, 12).join('; ') : ''));
      const Q = (tag, f) => s.all().find(e => e.tagName === tag && f(e)), btn = t => Q('BUTTON', e => e.textContent === t);
      const find = id => s.all().filter(e => B.isB(e) && e.dataset.blk === id);
      ok(!P1.calls.some(c => /\/modes\/list/.test(c[1])), 'page: nothing is read before the page is opened');
      P1.ctx.as2Link('page:modes'); await P1.settle();
      say('blocks: loaded', B.check(s));
      const want = ['title', 'about', 'about.modes', 'main', 'left', 'right', 'list', 'list.table', 'list.warn', 'allow', 'allow.warn', 'allow.mode', 'allow.btns', 'task', 'task.btns', 'task.open', 'mp', 'mp.file', 'mp.presets', 'mp.presets.filter', 'mp.modes', 'mp.modes.table'];
      ok(want.every(i => B.ids(s).includes(i)), 'blocks: every card drawn, missing: ' + want.filter(i => !B.ids(s).includes(i)).join());
      ok(P1.calls.filter(c => /\/modes\/list\?mod=C%3A%2Fm$/.test(c[1])).length === 1 && P1.calls.filter(c => /\/bots\/table\?.*presets_/.test(c[1])).length === 2, 'page: the list read once with the mod, both start settings tables loaded');
      ok(s.has(L.modes[0].mode) && s.has(en['modes.from.changed']) && s.has(en['modes.w.combat'].replace('{mode}', 'mymode')), 'page: the table and its notes are shown');
      ok(find('mp')[0].parentNode === find('right')[0] && find('task')[0].parentNode === find('mp')[0], 'blocks: the profile placed the start settings and the guided card');
      // preview, then write after the confirm; a cancel writes nothing
      const sel = Q('SELECT', e => e.attrs['aria-label'] === en['modes.allow.mode']);
      ok(sel && sel.value === 'cooperative', 'allow: the first mode with bots off is picked');
      sel.value = 'combat'; sel.fire('change');
      const w = () => btn(en['modes.allow.write']);
      ok(w().disabled, 'allow: write is off before a preview');
      btn(en['modes.allow.preview']).click(); await P1.settle();
      ok(!w().disabled && s.has(en['modes.allow.planOk']), 'allow: preview done, write on');
      P1.ctx.confirm = () => false; w().click(); await P1.settle();
      ok(P1.calls.filter(c => /\/modes\/bots$/.test(c[1]) && c[2].write).length === 0 && !w().disabled, 'allow: cancel at the confirm writes nothing');
      P1.ctx.confirm = () => true; w().click(); await P1.settle();
      const wc = P1.calls.filter(c => /\/modes\/bots$/.test(c[1]) && c[2].write);
      ok(wc.length === 1 && wc[0][2].mode === 'combat' && wc[0][2].mod === 'C:/m' && w().disabled && s.has(en['modes.test.h']), 'allow: write sent once, test in game asked');
      say('blocks: after preview and write', B.check(s));
      // start settings: Write into my mod asks first (what, where), as Back to stock does; a cancel writes nothing
      const inp = Q('INPUT', e => e.value === '160'), mpBtn = t => Q('BUTTON', e => e.textContent === t && e.parentNode && e.parentNode.dataset.blk === 'mp.presets.btns');
      const ew = () => P1.calls.filter(c => /\/bots\/edit$/.test(c[1]) && c[2].write);
      ok(!!inp && !!mpBtn(en['bots.save.write']), 'start settings: a number box and the write button');
      inp.value = '170'; inp.fire('input'); mpBtn(en['bots.save.preview']).click(); await P1.settle();
      ok(!mpBtn(en['bots.save.write']).disabled && ew().length === 0, 'start settings: preview done, nothing written, write on');
      let asked = ''; P1.ctx.confirm = q => { asked = String(q); return false; }; mpBtn(en['bots.save.write']).click(); await P1.settle();
      ok(ew().length === 0 && asked.includes('C:/m/resource/set/multiplayer/games/presets_competitive.inc') && asked.includes(en['bots.save.copy'].replace('{file}', 'presets_competitive.inc')), 'start settings: write asks first with the file and where, a cancel writes nothing: ' + asked);
      P1.ctx.confirm = () => true; mpBtn(en['bots.save.write']).click(); await P1.settle();
      ok(ew().length === 1 && ew()[0][2].file === 'presets_competitive.inc' && ew()[0][2].mod === 'C:/m', 'start settings: yes at the ask writes once');
      // a mod change draws the start settings again once, where the profile put them, the guided card kept
      const nT = P1.calls.filter(c => /\/bots\/table\?.*presets_/.test(c[1])).length;
      P1.ctx.__as2gui.mod = 'C:/m2'; P1.ctx.as2Link('page:modes'); await P1.settle();
      say('blocks: after a mod change', B.check(s));
      ok(P1.calls.filter(c => /\/bots\/table\?mod=C%3A%2Fm2.*presets_/.test(c[1])).length === 2 && P1.calls.filter(c => /\/bots\/table\?.*presets_/.test(c[1])).length === nT + 2, 'page: the start settings read again for the new mod');
      ok(P1.calls.some(c => /\/modes\/list\?mod=C%3A%2Fm2$/.test(c[1])), 'page: the list read again for the new mod');
      ok(find('mp').length === 1 && find('task').length === 1 && find('mp')[0].parentNode === find('right')[0] && find('task')[0].parentNode === find('mp')[0], 'blocks: a redraw does not double or lose a card and keeps the profile\'s places');
      // the Bots page has a button to this page
      P1.ctx.as2Link('page:bots'); await P1.settle();   // lazy pages: the Bots page draws at its first show
      const bs = P1.sec('bots'), ob = bs && bs.all().find(e => e.tagName === 'BUTTON' && e.textContent === en['bots.adv.openModes']);
      ok(!!ob, 'Bots page: Open Game Modes button');
    }
    // no mod: the pick-a-mod lines, no start settings
    const P2 = await B.boot({}, p => /\/modes\/list$/.test(p) ? { modes: L0.modes, mod: '', modWhy: null } : undefined); await P2.settle();
    P2.ctx.as2Link('page:modes'); await P2.settle();
    const s2 = P2.sec('modes');
    if (s2) {
      const pr = B.check(s2); ok(!pr.length, 'blocks: no mod: ' + pr.slice(0, 8).join('; '));
      ok(B.ids(s2).includes('needmod') && !B.ids(s2).includes('mp') && !P2.calls.some(c => /\/bots\/table\?.*presets_/.test(c[1])), 'no mod: the pick-a-mod line, no start settings');
    }
  }
  // ---- game parity (made-up installs): MoW:AS2 lists the shared install without as64/core; GoH lists its own cards and classes
  {
    const as2 = path.join(work, 'par-as2'), goh = path.join(work, 'par-goh'), pm = path.join(work, 'par goh mod');
    put(as2, G + 'combat.set', COMBAT); put(as2, G + 'battle_zones.set', ['{game', '\t{settings', '\t}', '}']);
    put(path.join(as2, 'as64', 'core'), G + 'battle_zones.set', ['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
    fs.writeFileSync(path.join(as2, 'as64.exe'), '');
    const pc = id => Object.assign({}, ctx, { gameId: () => id, exe: () => ({ as64: 'as64', mowas2: 'mowas_2', goh: 'goh' })[id], kind: () => (id === 'goh' ? 'goh' : 'as2'), game: () => as2, gohDir: () => goh, curDir: () => (id === 'goh' ? goh : as2) });
    const bz = l => l.modes.find(r => r.mode === 'battle_zones');
    const lm = await R['GET /api/x/modes/list'](U(''), null, pc('mowas2')), la = await R['GET /api/x/modes/list'](U(''), null, pc('as64'));
    ok(bz(lm).bots === false && bz(la).bots === true, 'mowas2: the card without as64/core (bots off); as64: the as64/core card (bots on)');
    const pm2 = path.join(work, 'par-as2mod'); fs.mkdirSync(pm2, { recursive: true });
    const bm = await R['POST /api/x/modes/bots'](null, { mod: pm2, mode: 'battle_zones', write: false }, pc('mowas2'));
    ok(bm.state === 'added' && bm.copy === true, 'mowas2: allow bots plans the add on the mowas_2 card (as64 would find it present)');
    ok((await R['POST /api/x/modes/bots'](null, { mod: pm2, mode: 'battle_zones', write: false }, pc('as64'))).state === 'present', 'as64: the as64/core card already has bots');
    // GoH install: cards at the same path, GoH classes; a card of class combat is not a GoH mode; no MIS-65 line
    fs.mkdirSync(path.join(goh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
    put(goh, G + 'battle_zones.set', ['{game', '\t{order 0}', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
    put(goh, G + 'frontlines.set', ['{game', '\t{order 1}', '\t{settings', '\t\t;{enableBots}', '\t}', '}']);
    put(goh, G + 'presets/presets_battlezones.inc', ['(include "preset_mid.inc")']);
    put(goh, G + 'campaign_capture_the_flag.set', ['{game', '\t{settings', '\t\t{enableBots\t\t1}', '\t}', '}']);
    put(goh, G + 'evacuation.set', ['{game', '\t{settings', '\t\t{enableBots 0} ; off', '\t}', '}']);
    fs.mkdirSync(pm, { recursive: true }); put(pm, G + 'oldwar.set', ['{game', '\t{class combat}', '\t{order 5}', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
    const lg = await R['GET /api/x/modes/list'](U('mod=' + encodeURIComponent(pm)), null, pc('goh'));
    const by2 = m => lg.modes.find(r => r.mode === m) || {};
    ok(lg.modes.map(r => r.mode).join() === 'battle_zones,frontlines,oldwar,campaign_capture_the_flag,evacuation' && !lg.modWhy, 'goh: the GoH cards and the mod card, a mod folder named for GoH allowed: ' + lg.modes.map(r => r.mode).join() + ' ' + lg.modWhy);
    ok(by2('frontlines').known && by2('frontlines').bots === false && by2('battle_zones').bots === true, 'goh: frontlines is a GoH class, bots read from the card');
    ok(!by2('oldwar').known && by2('oldwar').warn.some(w => w.k === 'modes.w.clsGoh') && !by2('oldwar').warn.some(w => w.k === 'modes.w.combat'), 'goh: combat is not a GoH mode; no MIS-65 line');
    const pg = await R['POST /api/x/modes/bots'](null, { mod: pm, mode: 'frontlines', write: false }, pc('goh'));
    ok(pg.state === 'added' && pg.copy && !fs.existsSync(path.join(pm, ...(G + 'frontlines.set').split('/'))), 'goh: allow bots preview, nothing written');
    const wg = await R['POST /api/x/modes/bots'](null, { mod: pm, mode: 'frontlines', write: true }, pc('goh'));
    ok(wg.state === 'added' && /\{enableBots\}/.test(rd(path.join(pm, ...(G + 'frontlines.set').split('/')))) && !pg.warn.length, 'goh: bots allowed in the mod copy of the GoH card');
    // GoH value form: {enableBots 1} is on (vanilla campaign card); {enableBots 0} becomes 1 when bots are allowed
    const lv = await R['GET /api/x/modes/list'](U(''), null, pc('goh')), by3 = m => lv.modes.find(r => r.mode === m) || {};
    ok(by3('campaign_capture_the_flag').bots === true && by3('evacuation').bots === false, 'goh: {enableBots 1} on, {enableBots 0} off');
    const w0 = await R['POST /api/x/modes/bots'](null, { mod: pm, mode: 'evacuation', write: true }, pc('goh'));
    ok(w0.state === 'added' && rd(path.join(pm, ...(G + 'evacuation.set').split('/'))) === txt(['{game', '\t{settings', '\t\t{enableBots 1} ; off', '\t}', '}']), 'goh: {enableBots 0} turned to 1, the rest kept');
    ok((await R['POST /api/x/modes/bots'](null, { mod: pm, mode: 'campaign_capture_the_flag', write: false }, pc('goh'))).state === 'present', 'goh: {enableBots 1} is present');
    const inG = path.join(goh, 'mods', 'm1'); fs.mkdirSync(inG, { recursive: true });
    const lin = await R['GET /api/x/modes/list'](U('mod=' + encodeURIComponent(inG)), null, pc('goh'));
    ok(!lin.modWhy, 'goh: <GoH>/mods/<mod> may be read');
    await refused(() => R['POST /api/x/modes/bots'](null, { mod: inG, mode: 'battle_zones', write: true }, pc('goh')), null, 'goh: a write inside the GoH install refused by the write guard');
    ok(!fs.existsSync(path.join(inG, 'resource')), 'goh: nothing written inside the GoH install');
    const lr = await R['GET /api/x/modes/list'](U('mod=' + encodeURIComponent(path.join(goh, 'resource'))), null, pc('goh'));
    ok(lr.modWhy === 'maps.e.ingame', 'goh: a folder inside the GoH install is not a mod');
    await refused(() => R['GET /api/x/modes/list'](U(''), null, Object.assign(pc('goh'), { curDir: () => null, gohDir: () => null })), /GoH folder/, 'goh: no GoH folder set');
    ok(['en', 'ru', 'uk', 'zh'].every(c => X.lang[c]['modes.w.clsGoh'] && X.lang[c]['modes.mode.frontlines'] && X.lang[c]['modes.botsflagsGoh']), 'goh: lang in four languages');
  }
  console.log(bad ? bad + ' failures' : 'modes ext PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e.stack || e)); process.exit(1); });
