// recipe "bots": what the computer players buy first for an army (bots page buyfirst, botrecipe), bot money per difficulty
// and cooldown factors per difficulty (bots_generic.inc), the lobby presets of a presets file through the bots page edit route, and
// the bots' fighting style (doctrine page persona, its base file and its check). Census: census/bots.json. Contract: ../README.md. Author: Imperator_Aug (ARSENAL, ia-5d2e81c4)
// Author: Imperator_Aug (ARSENAL, ia-4177922b)
'use strict';
const os = require('os'), path = require('path');
const RD = require('./army.recipe')._read;

const TAG = /^[a-z][a-z0-9_]{0,15}$/, UNIT = /^[A-Za-z0-9_()]+$/;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const lower = s => String(s == null ? '' : s).toLowerCase();
const norm = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
const CLASSES = ['Infantry', 'ATInfantry', 'Vehicle', 'Tank', 'AATank', 'ATTank', 'HeavyTank', 'ArtilleryTank'];
const LEVELS = ['easy', 'normal', 'hard', 'heroic'];
const PERSONAS = ['universal', 'us-1944-rifle', 'uk-1944-infantry', 'ger-1944-kampfgruppe', 'su-1941-rifle', 'su-1944-guards', 'jp-1942-infantry', 'fi-1940-winter', 'what-if-modern'];
const NOMOD = path.join(os.tmpdir(), 'arsenal-task-bots-no-mod');
const DEFPRESET = 's:standard_100_all', PFILES = ['presets_all.inc', 'presets_competitive.inc', 'presets_user.inc', 'presets_test.inc'];
const GENERIC = 'resource/set/multiplayer/games/bots_generic.inc';
const lib = () => require('../../bots/lib');
const GM = () => require('../../../../lib/games');
// the ctx the bots page lib reads with: the AS2 install (ctx.game) and the game as gui.js gives it (gameId, exe, kind, curDir as
// functions; lib/compile.js lookupCtx puts the draft's game word in gameId, so it is turned back into functions here)
function botCtx(ctx, gameDir, gid) {
  const id = GM().idOf(gid) || 'as64', g = gameDir !== undefined ? gameDir : RD.gameOf(ctx);
  return Object.assign({}, ctx || {}, { game: () => g, gameId: () => id, exe: () => GM().exeOf(id), kind: () => GM().kindOf(id), curDir: () => g });
}
// Gates of Hell has no bot.data.lua: its bots buy in bot.main.lua and modes/*.lua by event name (GHMIS-66)
const NA_GOH = RD.naLine('goh', 'Gates of Hell has no bot.data.lua: its bots buy in bot.main.lua and modes/*.lua, read by event name', 'GHMIS-66');
// Gates of Hell (2026-11-23): bots.goh.js, a unit added to one purchase list of an army through the Bots page (gohBuys, gohAddUnit)
const BG = () => require('./bots.goh');
const isGoh = (ctx, opt) => RD.gidOf(ctx, opt && opt.game) === 'goh';

// one question per difficulty and factor; the three factors share their words
const lv = (f, cover) => LEVELS.map(l => ({ id: 'bot' + f + '_' + l, kind: 'number', ask: 'task.bots.q.bot' + f, help: 'task.bots.h.bot' + f, covers: [cover], when: { diff: l }, limits: { min: 0, max: 100, step: 0.05, unit: 'x', usual: [0.5, 3] } }));
const tableOf = (ctx, mod, file) => { try { return lib().table(ctx, mod && path.isAbsolute(String(mod)) ? String(mod) : NOMOD, file).rows; } catch (e) { return []; } };
// the rules (define) a lobby preset uses: s:standard_100_all -> standard_all, c:custom_80_competitive -> custom_competitive, s:test_all -> test_all
function defineOf(p, rows) {
  const defs = [...new Set(rows.map(r => r.id.split('|')).filter(x => x[2] === 'growTime').map(x => x[1]))];
  const d = String(p || '').replace(/^[sc]:/, '').replace(/_\d+(?=_|$)/, '');
  return defs.includes(d) ? d : defs.length === 1 ? defs[0] : null;
}
const pfileOf = d => { const a = d && d.answers && d.answers.pfile; const v = a && a.src === 'value' ? a.value : null; return PFILES.includes(v) ? v : 'presets_all.inc'; };
// the cooldown factors of each difficulty in bots_generic.inc: {easy: '*=0', ..}
function charges(g) {
  const t = (g && g.readStr(GENERIC)) || '', out = {};
  for (const l of LEVELS) { const m = new RegExp('\\{\\s*' + l + '\\b[\\s\\S]*?chargeFactors\\s*\\{\\s*value\\s+"([^"]*)"', 'i').exec(t); if (m) out[l] = m[1]; }
  return out;
}
// one share of every card timer per difficulty ("*=N"); a value with tag rows shows keep and is replaced whole when a number is given
const chq = () => LEVELS.map(l => ({ id: 'botcharge_' + l, kind: 'number', ask: 'task.bots.q.botcharge', help: 'task.bots.h.botcharge', covers: ['level.chargefactors'], when: { diff: l }, limits: { min: 0, max: 10, step: 0.05, unit: 'x', usual: [0, 1] } }));
const ONE = /^\s*\*\s*=\s*(\d+(?:\.\d+)?)\s*;?\s*$/;
// own route: the bots page buy with a stock bot file to start from (botrecipe --stock); the core buyfirst route does not pass --stock
async function buyStock(url, b, ctx) {
  const L = lib(), mod = L.checkMod(ctx, b.mod), fsx = require('fs');
  const unit = String(b.unit || ''), cls = String(b.cls || 'Tank'), army = String(b.army || '');
  if (!UNIT.test(unit)) throw bad('Bad unit name.');
  if (!CLASSES.includes(cls)) throw bad('Unknown unit class: ' + cls);
  if (army && !TAG.test(army)) throw bad('Bad army id.');
  const file = String(b.stockFile || '');
  if (!path.isAbsolute(file) || !/\.lua$/i.test(file) || !fsx.existsSync(file)) throw bad('The stock bot file is not there: ' + file);
  const root = fsx.mkdtempSync(path.join(os.tmpdir(), 'arsenal-task-bots-stock-')), at = path.join(root, 'script', 'multiplayer');
  try {
    fsx.mkdirSync(at, { recursive: true }); fsx.copyFileSync(file, path.join(at, 'bot.data.lua'));
    const pri = b.first ? '1000.0' : (Number(b.priority) > 0 ? String(Number(b.priority)) : '1.0');
    const args = [mod, '--out', mod, '--buy-first', unit, '--class', cls, '--priority', pri, '--stock', root];
    if (army) args.push('--army', army);
    if (b.stage) { if (!/^[1-8]$/.test(String(b.stage))) throw bad('Stage is a number from 1 to 8.'); args.push('--stage', String(b.stage)); }
    if (b.after) { if (!UNIT.test(String(b.after))) throw bad('Bad "after" unit.'); args.push('--after', String(b.after)); }
    if (b.cheap) args.push('--cheap');
    if (b.cardLike) { if (!UNIT.test(String(b.cardLike))) throw bad('Bad "copy card of" unit.'); args.push('--card-like', String(b.cardLike)); }
    let g = null; try { g = ctx.game(); } catch (e) { /* no game folder */ }
    if (g) args.push('--game', g);
    // the page's game: MoW:AS2 reads the mowas_2 file set (no as64/core); AS64 keeps its argument list as it was
    const gid = RD.gidOf(ctx, b.gid);
    if (gid === 'goh') throw bad(NA_GOH);
    if (gid !== 'as64') args.push('--exe', GM().exeOf(gid));
    if (b.write) L.checkWrite(ctx, mod); else args.push('--dry-run');
    // JOBS: the tool itself writes into the mod (the footer asks twice before a stop); stopped = killed, its answer is not a result
    if (b.write && ctx.job) ctx.job.writes = true;
    const r = await ctx.runTool('botrecipe', 'botrecipe/botrecipe.js', args, { timeoutMs: 120000 });
    if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { ok: false, wrote: false, stopped: true, code: null, say: [], pri, stock: true };
    const text = (String(r.stdout || '') + '\n' + String(r.stderr || '')).trim(), code = /\b(BOT_[A-Z_]+)\b/.exec(r.stderr || '');
    return { ok: r.code === 0, wrote: !!b.write && r.code === 0, code: code ? code[1] : null, say: text.split(/\r?\n/).filter(Boolean).slice(0, 40), pri, stock: true };
  } finally { try { fsx.rmSync(root, { recursive: true, force: true }); } catch (e) { /* best effort */ } }
}

// the Repeat of one wave in bot.data.lua (the mod's, else the game's): a number, null when the wave has no Repeat line, undefined when
// the list cannot be read (the bots page refuses it then)
function repeatOf(c, st) {
  try { const s = lib().buys(botCtx(null, c.gameDir, c.game), c.mod && path.isAbsolute(String(c.mod)) ? String(c.mod) : NOMOD).stages[st - 1]; return !s ? undefined : s.repeat == null ? null : Number(s.repeat); } catch (e) { return undefined; }
}
// the lobby presets of the presets file the draft picked, with plain labels: s:standard_100_all -> "Standard, 100 points"
async function lookPreset(ctx, words, opt) {
  let d = null; try { d = opt && opt.draft ? require('../lib/draft').load(ctx, opt.draft) : null; } catch (e) { d = null; }
  const file = pfileOf(d), mod = (opt && opt.mod) || (d && d.mod) || ctx.mod, w = lower(words).trim();
  const names = [...new Set(tableOf(botCtx(ctx, undefined, RD.gidOf(ctx, d || (opt && opt.game))), mod, file).map(r => r.id.split('|')[1]).filter(x => /^[sc]:/.test(x)))];
  return names.filter(n => !w || lower(n).includes(w)).map(n => {
    const m = /^([sc]):([a-z]+)(?:_(\d+))?/.exec(n) || [];
    return { id: n, name: (m[1] === 'c' ? 'Host picks the money' : 'Standard') + (m[3] ? ', ' + m[3] + ' points' : ''), where: file, sub: n + ' (' + file + ')' };
  });
}
async function lookUnit(ctx, words, opt) {
  const g = RD.reader(RD.gameOf(ctx), (opt && opt.mod) || ctx.mod, RD.gidOf(ctx, opt && opt.game)); if (!g) return [];
  const w = lower(words).trim(), out = [];
  for (const a of RD.armies(g)) {
    if (a.id != null && a.id < 0) continue;
    for (const x of RD.cards(g, a.tag)) if (!w || lower(x.id).includes(w)) out.push({ id: x.id, name: x.id, where: x.key, ref: { key: x.key }, sub: a.tag + ', ' + (x.tab || '') + (x.cost != null ? ', ' + x.cost : '') });
    if (out.length > 400) break;
  }
  return out;
}

module.exports = {
  id: 'bots',
  // one verb: bots always work on an army that is there (make would do the same as change)
  verbs: ['change'],
  // MoW:AS2 has the same bot files (bot.data.lua, bots_generic.inc, presets); Gates of Hell has no bot.data.lua (GHMIS-66):
  // there the group goh adds a unit to one of its purchase lists (bots.goh.js); every other question is AS2 only (the loop at the end)
  games: ['as64', 'mowas2', 'goh'],
  needs: ['mod'],
  order: 70,
  title: 'task.bots.t',
  test: 'task.bots.test',
  census: 'bots',
  base: { lookup: 'army' },
  groups: [
    { id: 'goh', title: 'task.bots.g.goh', essential: true, q: require('./bots.goh').questions() },
    // this army only: one buy line in its list of bot.data.lua; every question about the unit waits for a yes
    { id: 'buy', title: 'task.bots.g.buy', essential: true, q: [
      { id: 'addunit', kind: 'yesno', ask: 'task.bots.q.addunit', help: 'task.bots.h.addunit', covers: [] },
      { id: 'unit', kind: 'thing', ask: 'task.bots.q.unit', help: 'task.bots.h.unit', covers: ['buy.unit'], when: { addunit: true }, limits: { limit: 'MIS-32' }, picker: { sources: ['exist'], lookup: 'botunit' } },
      { id: 'cls', kind: 'choice', ask: 'task.bots.q.cls', help: 'task.bots.h.cls', covers: ['buy.class'], when: { addunit: true }, limits: { values: CLASSES, limit: 'MIS-77' } },
      { id: 'first', kind: 'yesno', ask: 'task.bots.q.first', help: 'task.bots.h.first', covers: ['buy.first'], when: { addunit: true } },
      { id: 'priority', kind: 'number', ask: 'task.bots.q.priority', help: 'task.bots.h.priority', covers: ['buy.priority'], when: { addunit: true, first: false }, limits: { min: 0.1, max: 100, step: 0.1, unit: 'x', usual: [1, 3] } },
      { id: 'stage', kind: 'number', ask: 'task.bots.q.stage', help: 'task.bots.h.stage', covers: ['buy.stage'], when: { addunit: true }, limits: { min: 0, max: 8, step: 1, unit: 'wave' } },
      { id: 'after', kind: 'thing', ask: 'task.bots.q.after', help: 'task.bots.h.after', covers: ['buy.after'], when: { addunit: true }, picker: { sources: ['keep', 'exist'], lookup: 'botunit' } },
      { id: 'cheap', kind: 'yesno', ask: 'task.bots.q.cheap', help: 'task.bots.h.cheap', covers: ['buy.cheap'], when: { addunit: true } },
      { id: 'minincome', kind: 'number', ask: 'task.bots.q.minincome', help: 'task.bots.h.minincome', covers: ['buy.min_income'], when: { addunit: true }, limits: { min: -1, max: 100000, step: 1, unit: 'mp', limit: 'MIS-78' } },
      { id: 'minteam', kind: 'number', ask: 'task.bots.q.minteam', help: 'task.bots.h.minteam', covers: ['buy.min_team'], when: { addunit: true }, limits: { min: 0, max: 8, step: 1, unit: 'players', limit: 'MIS-78' } },
      // Repeat belongs to one wave: asked only when the wave is named
      { id: 'repeat', kind: 'number', ask: 'task.bots.q.repeat', help: 'task.bots.h.repeat', covers: ['buy.stage_repeat'], when: { addunit: true, stage: [1, 2, 3, 4, 5, 6, 7, 8] }, limits: { min: 1, max: 1000, step: 1, unit: 'times', limit: 'MIS-79', usual: [1, 10] } },
      { id: 'stockfile', kind: 'file', ask: 'task.bots.q.stockfile', help: 'task.bots.h.stockfile', covers: ['buy.stock'], when: { addunit: true }, picker: { sources: ['keep', 'file'], kinds: ['.lua'] } },
      { id: 'cardlike', kind: 'thing', ask: 'task.bots.q.cardlike', help: 'task.bots.h.cardlike', covers: ['buy.card_like'], when: { addunit: true }, picker: { sources: ['keep', 'exist'], lookup: 'botunit' } },
    ] },
    // every army: bots_generic.inc, the lobby presets and the fighting style (left as they are unless asked)
    { id: 'level', title: 'task.bots.g.level', essential: false, q: [
      { id: 'diff', kind: 'choice', ask: 'task.bots.q.diff', help: 'task.bots.h.diff', covers: [], limits: { values: LEVELS } },
    ].concat(lv('cp', 'level.botcp'), lv('mp', 'level.botmp'), lv('payback', 'level.botpayback'), chq()) },
    { id: 'preset', title: 'task.bots.g.preset', essential: false, q: [
      { id: 'pfile', kind: 'choice', ask: 'task.bots.q.pfile', help: 'task.bots.h.pfile', covers: ['preset.file'], limits: { values: PFILES } },
      { id: 'reset', kind: 'choice', ask: 'task.bots.q.reset', help: 'task.bots.h.reset', covers: ['preset.reset'], limits: { values: ['no', 'levels', 'presets', 'both'] } },
      { id: 'pname', kind: 'thing', ask: 'task.bots.q.pname', help: 'task.bots.h.pname', covers: [], picker: { sources: ['keep', 'exist'], lookup: 'preset' } },
      { id: 'start', kind: 'number', ask: 'task.bots.q.start', help: 'task.bots.h.start', covers: ['preset.start'], limits: { min: 0, max: 10000000, step: 1, unit: 'mp' } },
      { id: 'finish', kind: 'number', ask: 'task.bots.q.finish', help: 'task.bots.h.finish', covers: ['preset.finish'], limits: { min: 0, max: 10000000, step: 1, unit: 'mp' } },
      { id: 'cp', kind: 'number', ask: 'task.bots.q.cp', help: 'task.bots.h.cp', covers: ['preset.cp'], limits: { min: 0, max: 10000000, step: 1, unit: 'cp' } },
      { id: 'growtime', kind: 'number', ask: 'task.bots.q.growtime', help: 'task.bots.h.growtime', covers: ['preset.growtime'], limits: { min: 60, max: 7200, step: 1, unit: 's', usual: [600, 3600] } },
      { id: 'bonuscp', kind: 'number', ask: 'task.bots.q.bonuscp', help: 'task.bots.h.bonus', covers: ['preset.bonus'], limits: { min: 0, max: 100, step: 0.05, unit: 'x', usual: [0.5, 2] } },
      { id: 'bonusmp', kind: 'number', ask: 'task.bots.q.bonusmp', help: 'task.bots.h.bonus', covers: ['preset.bonus'], limits: { min: 0, max: 100, step: 0.05, unit: 'x', usual: [0.5, 2] } },
      { id: 'restore', kind: 'text', ask: 'task.bots.q.restore', help: 'task.bots.h.restore', covers: ['preset.payback'], limits: { re: '^\\d+(\\.\\d+)?( \\d+(\\.\\d+)?)*$', limit: 'MIS-06' } },
    ] },
    { id: 'mind', title: 'task.bots.g.mind', essential: false, q: [
      { id: 'persona', kind: 'choice', ask: 'task.bots.q.persona', help: 'task.bots.h.persona', covers: ['mind.persona', 'mind.maxsquadsize', 'mind.orderrotation', 'mind.flagpriority', 'mind.botconfig_keys'], limits: { values: ['keep'].concat(PERSONAS), limit: 'MIS-25' } },
      { id: 'profile', kind: 'choice', ask: 'task.bots.q.profile', help: 'task.bots.h.profile', covers: ['mind.profile'], when: { persona: PERSONAS }, limits: { values: ['auto', 'vanilla', 'botconfig'] } },
      { id: 'mindbase', kind: 'file', ask: 'task.bots.q.mindbase', help: 'task.bots.h.mindbase', covers: ['mind.base'], when: { persona: PERSONAS }, picker: { sources: ['keep', 'file'], kinds: ['.lua'] } },
      { id: 'scale', kind: 'number', ask: 'task.bots.q.scale', help: 'task.bots.h.scale', covers: ['mind.scale'], when: { persona: PERSONAS }, limits: { min: 0, max: 2, step: 0.05, unit: 'x', usual: [0.5, 1.5] } },
      { id: 'mindcheck', kind: 'yesno', ask: 'task.bots.q.mindcheck', help: 'task.bots.h.mindcheck', covers: ['mind.check'], limits: { limit: 'MIS-84' } },
    ] },
  ],
  kept: [
    ['buy.army', 'built in step: the "what to change" step picks the army'],
    ['on.mod', 'built in step: the mod step picks the mod the bot files go into'],
    ['buy.write', 'built in step: the Review step shows the dry run, the Write step writes'],
    ['test.match', 'built in step: the Test step hands over to the Play page for a match against a bot'],
    ['buy.ignored', 'look only: keys bots never read (MIS-10); nothing to write'],
    ['on.enablebots', 'owned by the map task: it turns bots on for a mode (Maps page clone, body.bots)'],
    ['on.lobby_slot', 'meaning not proven [I]: set in the lobby when a match starts (MIS-61); no file holds it'],
    ['buy.team_mode', 'meaning not proven [I]: botrecipe --team-mode flips armySelectionMode of a mode, what that does in the lobby is not tested'],
    ['buy.remove', 'meaning not proven [I], and no tool step yet: no route takes a unit out of the buy list or reorders it'],
    ['mind.per_army', 'meaning not proven [I], and no tool step yet: the Bot Doctrine page writes one style for every army'],
  ],
  checklist: ['task.bots.c.first', 'task.bots.c.money', 'task.bots.c.style', 'task.bots.c.log'],
  lookups: {
    army: async (ctx, words, opt) => (isGoh(ctx, opt) ? BG().lookArmy(ctx, words, opt) : RD.lookArmy(ctx, words, opt)),
    botunit: lookUnit, preset: lookPreset,
    gohlist: (ctx, words, opt) => BG().lookList(ctx, words, opt),
    gohunit: (ctx, words, opt) => BG().lookUnit(ctx, words, opt),
    gohcls: (ctx, words, opt) => BG().lookCls(ctx, words, opt),
  },
  routes: { 'POST /api/x/task/r/bots/buy': buyStock, 'POST /api/x/task/r/bots/gohbuy': (url, b, ctx) => BG().buyRoute(url, b, ctx) },
  values: async (ctx, base, opt) => {
    const pfile = pfileOf(opt && opt.draft);
    const out = { addunit: false, first: false, priority: 1, stage: 0, cheap: false, cls: 'Tank', diff: 'normal', pfile, reset: 'no', pname: pfile === 'presets_all.inc' ? DEFPRESET : undefined, persona: 'keep', profile: 'auto', scale: 1, mindcheck: true };
    out.minincome = -1; out.minteam = 0;
    const gid = RD.gidOf(ctx, opt && opt.game);
    if (gid === 'goh') return Object.assign(out, await BG().values(ctx, base, opt));
    if (!RD.gameOf(ctx)) { if (!out.pname) delete out.pname; return out; }
    ctx = botCtx(ctx, undefined, gid);
    const ch = charges(RD.reader(RD.gameOf(ctx), ctx.mod, gid)); for (const l of LEVELS) { const x = ONE.exec(ch[l] || ''); if (x) out['botcharge_' + l] = Number(x[1]); }
    for (const r of tableOf(ctx, ctx.mod, 'bots_generic.inc')) { const p = r.id.split('|'); if (LEVELS.includes(p[1])) out['bot' + p[2] + '_' + p[1]] = Number(r.current); }
    const pa = tableOf(ctx, ctx.mod, pfile), get = id => { const r = pa.find(x => x.id === pfile + '|' + id); return r ? r.current : undefined; };
    if (!out.pname) { const s0 = pa.map(r => r.id.split('|')[1]).find(x => /^s:/.test(x)) || pa.map(r => r.id.split('|')[1]).find(x => /^[sc]:/.test(x)); out.pname = s0; }
    const num = v => (v === undefined ? undefined : Number(v)), def = defineOf(out.pname, pa);
    Object.assign(out, { start: num(get(out.pname + '|start')), finish: num(get(out.pname + '|finish')), cp: num(get(out.pname + '|cp')) });
    if (def) Object.assign(out, { growtime: num(get(def + '|growTime')), bonuscp: num(get(def + '|bonusCp')), bonusmp: num(get(def + '|bonusMp')),
      restore: get(def + '|paybackRestore') === undefined ? undefined : norm(get(def + '|paybackRestore')) });
    for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
    return out;
  },
  compile: async (draft, c) => {
    const gid = RD.gidOf(null, c.game);
    if (gid === 'goh') return BG().compile(draft, c);
    const army = c.base && c.base.id ? lower(c.base.id) : '';
    if (!TAG.test(army)) throw bad('Pick the army whose bots change first.');
    const calls = [], notes = [];
    const a = id => c.answer(id), given = id => !!a(id) && a(id).src !== 'keep';
    // 1 what bots buy first (botrecipe through the bots page): only after a yes to adding a unit (its questions are hidden on no)
    const adding = c.value('addunit') === true;
    if (adding && !given('unit')) throw bad('Pick the unit the bots of ' + army + ' buy, or answer No to adding a unit.');
    if (adding) {
      const unit = String(c.value('unit') || '').trim();
      if (!UNIT.test(unit)) throw bad('Pick the unit by its card name (letters, digits, _ and brackets), for example t34_85 or smgs(' + army + ').');
      const cls = c.value('cls') || 'Tank';
      if (!CLASSES.includes(cls)) throw bad('Pick the bot class of the unit.');
      const body = { unit, army, cls, first: !!c.value('first') };
      if (!body.first) body.priority = Number(c.value('priority')) || 1;
      const st = Number(c.value('stage')) || 0;
      if (st) { if (!(st >= 1 && st <= 8)) throw bad('The buy wave is a number from 1 to 8, or 0 for the first one with the list.'); body.stage = st; }
      if (given('after')) { const v = String(c.value('after')); if (!UNIT.test(v)) throw bad('Pick the unit to buy it after by its card name.'); body.after = v; }
      if (c.value('cheap')) { body.cheap = true; notes.push('Cheap: the unit\'s card gets a lower price for players too.'); }
      if (given('cardlike')) { const v = String(c.value('cardlike')); if (!UNIT.test(v)) throw bad('Pick the unit whose card is copied by its card name.'); body.cardLike = v; }
      // min income, min team (on the unit's line) and Repeat (of its wave): the bots page writes them after the buy line
      const mi = Number(c.value('minincome')), mt = Number(c.value('minteam'));
      if (given('minincome') && mi !== -1) { if (!(mi >= 0)) throw bad('Min income is a number of manpower from 0 up, or -1 for none.'); body.minIncome = Math.round(mi); }
      if (given('minteam') && mt) body.minTeam = Math.round(mt);
      if (given('repeat') && st) {
        // Repeat belongs to the named wave and is asked only then; the wave's own number changes nothing; a wave with no Repeat line
        // runs once, so 1 changes nothing there and any other number is refused in plain words (the bots page edits a line, it adds none)
        const v = Math.round(Number(c.value('repeat'))), now = repeatOf(c, st);
        if (now === null && v !== 1) throw bad('Buy wave ' + st + ' has no Repeat line, so the bots run it once. Leave Repeat at 1, or pick a wave that repeats.');
        if (now !== null && now !== v) body.repeat = v;
      }
      if (/\(/.test(unit) && !/^(Infantry|ATInfantry)$/.test(cls)) notes.push(unit + ' is a squad: the bot class Infantry or ATInfantry fits it.');
      // a refused buy row comes back as ok false: the core counts that as a failed step; the own test also wants a written or previewed line
      const okBuy = r => !!r && r.ok === true;
      const sf = c.answer('stockfile');
      if (sf && sf.src === 'file') {
        const p = [].concat(c.value('stockfile') || [])[0];
        if (!p) throw bad('The stock bot file was not uploaded.');
        if (body.minIncome !== undefined || body.minTeam !== undefined || body.repeat !== undefined) throw bad('A buy from an uploaded bot file takes no min income, min team or Repeat: write the buy first, then a second buy of the unit with them.');
        calls.push({ route: 'POST /api/x/task/r/bots/buy', body: Object.assign({ stockFile: p }, body, gid === 'as64' ? {} : { gid }), dryFlag: 'write', ok: okBuy });
        notes.push('The buy line starts from the uploaded bot file, not the mod\'s own bot.data.lua.');
      } else calls.push({ route: 'POST /api/x/bots/buyfirst', body, ok: okBuy });
      notes.push('Only ' + army + ': one buy line in its list of bot.data.lua' + (body.cheap || body.cardLike ? ', and the card of ' + unit + ' in its own list' : '') + '.');
    }
    // 2 reset first, then the edits (each edit reads the file as it is after the reset)
    const pfile = PFILES.includes(c.value('pfile')) ? c.value('pfile') : 'presets_all.inc';
    const rs = c.value('reset') || 'no';
    if (given('reset') && rs !== 'no') {
      if (rs === 'levels' || rs === 'both') calls.push({ route: 'POST /api/x/bots/reset', body: { file: 'bots_generic.inc' } });
      if (rs === 'presets' || rs === 'both') calls.push({ route: 'POST /api/x/bots/reset', body: { file: pfile } });
    }
    // 3 bot money per difficulty: only answered values that differ from the file
    const fake = botCtx(null, c.gameDir, gid), lvRows = tableOf(fake, c.mod, 'bots_generic.inc'), lch = {};
    for (const l of LEVELS) for (const f of ['cp', 'mp', 'payback']) {
      const q = 'bot' + f + '_' + l; if (!given(q)) continue;
      const id = 'bots_generic.inc|' + l + '|' + f, cur = lvRows.find(r => r.id === id), v = Number(c.value(q));
      if (!cur) throw bad('bots_generic.inc has no ' + l + ' ' + f + ' setting.');
      if (Number(cur.current) !== v) lch[id] = v.toFixed(2);
    }
    if (Object.keys(lch).length) calls.push({ route: 'POST /api/x/bots/edit', body: { file: 'bots_generic.inc', changes: lch } });
    const rows = [], chNow = charges(RD.reader(c.gameDir, c.mod, gid));
    for (const l of LEVELS) {
      const q = 'botcharge_' + l; if (!given(q)) continue;
      const n = Number(c.value(q)); if (!(n >= 0 && n <= 10)) throw bad('Bots wait a share of each card timer from 0 to 10.');
      const was = chNow[l] || '', x = ONE.exec(was);
      if (x && Number(x[1]) === n) continue;
      if (was && !x) notes.push(l + ': the timer shares per card tag ("' + was + '") are replaced by one share for every card.');
      rows.push({ entity: 'file:' + GENERIC, path: l + '/chargeFactors/value', value: '"*=' + n + '"' });
    }
    if (rows.length && (rs === 'levels' || rs === 'both') && given('reset')) throw bad('A reset of the difficulties runs after the cooldown change and would undo it. Write the reset first, then the cooldowns.');
    const ops = rows.length ? [{ op: 'set', rows }] : [];
    // 4 lobby presets (presets_all.inc): a preset's money and points, its rules' grow time, bonus and payback
    const paRows = tableOf(fake, c.mod, pfile), pname = String(c.value('pname') || c.values.pname || DEFPRESET).trim(), def = defineOf(pname, paRows), pch = {};
    const put = (q, id, fmt) => {
      if (!given(q)) return;
      const cur = paRows.find(r => r.id === pfile + '|' + id);
      if (!cur) throw bad(pfile + ' has no ' + id.split('|').join(' ') + ' setting. Preset names look like ' + (paRows.map(r => r.id.split('|')[1]).filter(x => /^[sc]:/.test(x)).slice(0, 2).join(' or ') || 's:standard_100_all') + '.');
      const v = fmt(c.value(q));
      if (norm(cur.current) !== norm(v)) pch[pfile + '|' + id] = v;
    };
    put('start', pname + '|start', v => String(Math.round(Number(v))));
    put('finish', pname + '|finish', v => String(Math.round(Number(v))));
    put('cp', pname + '|cp', v => String(Math.round(Number(v))));
    if (def) {
      put('growtime', def + '|growTime', v => String(Math.round(Number(v))));
      put('bonuscp', def + '|bonusCp', v => Number(v).toFixed(1));
      put('bonusmp', def + '|bonusMp', v => Number(v).toFixed(1));
      put('restore', def + '|paybackRestore', v => norm(v));
    } else if (['growtime', 'bonuscp', 'bonusmp', 'restore'].some(given)) throw bad('Grow time, bonus and payback belong to the rules (define) of a preset; ' + pfile + ' has no rules found for ' + pname + '.');
    if (Object.keys(pch).length) calls.push({ route: 'POST /api/x/bots/edit', body: { file: pfile, changes: pch } });
    // 5 fighting style (doctrine page): from the mod's bot file (else the game's), or an uploaded one
    const mb = c.answer('mindbase'), mbase = mb && mb.src === 'file' ? [].concat(c.value('mindbase') || [])[0] : null;
    if (mb && mb.src === 'file' && !mbase) throw bad('The bot file to start from was not uploaded.');
    const styled = given('persona') && c.value('persona') !== 'keep';
    if (styled) {
      const persona = String(c.value('persona'));
      if (!PERSONAS.includes(persona)) throw bad('Pick a fighting style from the list.');
      const sc = Number(c.value('scale')), body = { persona, profile: c.value('profile') || 'auto', scale: isFinite(sc) ? sc : 1 };
      if (mbase) body.base = mbase;
      calls.push({ route: 'POST /api/x/doctrine/gen', body });
    }
    // 6 the style check (doctrine page): errors is a count, 0 = the bot file reads right (MIS-84)
    if (styled ? c.value('mindcheck') !== false : (given('mindcheck') && c.value('mindcheck') === true)) {
      const body = { profile: c.value('profile') || 'auto' };
      calls.push({ route: 'POST /api/x/doctrine/check', body, ok: r => !!r && typeof r.errors === 'number' && r.errors === 0 });
      notes.push('The doctrine check reads the bot file' + (styled ? ' after the style is written' : '') + '; in the plan it reads the file the mod has now.');
    }
    // Review: what every army shares, named with its file and the armies
    const wide = [];
    if (calls.some(x => x.body && x.body.file === 'bots_generic.inc') || ops.length) wide.push('bots_generic.inc (bot difficulty' + (rows.length ? ', timer shares' : '') + ')');
    if (calls.some(x => x.body && x.body.file === pfile)) wide.push(pfile + ' (lobby money of players and bots alike' + (Object.keys(pch).length ? ': ' + pname : '') + ')');
    if (styled) wide.push('bot.data.lua (fighting style)');
    if (wide.length) {
      let tags = []; try { tags = RD.armies(RD.reader(c.gameDir, c.mod, gid)).filter(x => x.id == null || x.id >= 0).map(x => x.tag); } catch (e) { tags = []; }
      notes.push('Every army' + (tags.length ? ' (' + tags.join(', ') + ')' : '') + ', not only ' + army + ': ' + wide.join('; ') + '.');
    }
    if (!calls.length && !ops.length) notes.push('Nothing to change: every answer is as the game has it.');
    return { gen: ops.length ? { ops } : null, calls, notes, result: army };
  },
};
// the AS2 questions: asked on the AS2 tabs only (the goh group is the Gates of Hell form)
for (const g of module.exports.groups) for (const q of g.q) if (!/^goh/.test(q.id)) q.when = Object.assign({}, q.when || {}, { $game: ['as64', 'mowas2'] });
// for the games test (bots.games.test.js): the page ctx a game word makes, and the GoH line
Object.defineProperty(module.exports, '_bots', { value: { botCtx, NA_GOH }, enumerable: false });
