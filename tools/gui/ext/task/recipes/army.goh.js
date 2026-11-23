// recipe "army", the Gates of Hell branch (game parity 2026-11-23): change a stock army's lobby name, number and flag.
// Read on the GoH install [V 2026-11-23]: resource/set/multiplayer/armies/<tag>.set has the AS2 form ({army {id 0}
// {title "mp/army/ger"} {icon "/interface/pages/multi/flag_ger"}}); flags are TGA at resource/interface/pages/multi/flag_*.tga; the
// army names are gettext entries (resource/interface/text/dlg_mp.pot, msgctxt "mp/army/ger", text in msgid). The name goes into the
// mod's localizations/default/interface/text/zz_arsenal_army.pot through tools/lng-add (--exe goh): a .pot file whose name sorts after
// dlg_mp.pot is read later, so its text is kept (GHLOC-08 [I]). The number is a gen set row, the flag the same copy or flag route as
// the AS2 path. A new army (make, 2026-11-23) is army.gohmake.js: copies of a stock army's forms under the new word with the cards
// picked in gohfirst and gohother, written by its own route; see makeGoh below. Cards of other armies go into a stock army through the
// gohadopt route (army.gohmake.js adopt); a card that buys the unit of its own name gets that unit cloned under its new id (gen clone op).
// GoH cards are added, taken off and moved per period by army.gohcards.js (gohperiod, gohadd, unitremove, groupcards, cardgroup,
// gohtab); prices and bots are their own tasks (branches, prices.goh.js and bots.goh.js).
// The side (read on the GoH install, vfs exe goh, 2026-11-23 [V]): games/presets/alliances_generic.inc {"Axis" {title
// "mp/alliance/axis"} .. {icon "/interface/pages/multi/flag_axis"}}, included by the modes ammunition, battle_zones,
// campaign_capture_the_flag, evacuation and frontlines; its name is a .pot text (dlg_mp.pot) written like the army name, its picture
// a flag TGA written like the army flag.
// The money tabs: {budgets {vehicle .. {buttons "inf1 inf2 empl vehicles tanks"}} {hero .. {buttons "doctrine"}}} in 11 files under
// games/ (presets/global_parameters/budget*.inc, its frontlines/ and last_stand/ budget_attacker|defender(_custom).inc, and inside the
// bot_state define of campaign_capture_the_flag.set): the gohbudget route writes the vehicle buttons of every one. Every lobby change is [T].
// Author: Imperator_Aug (ARSENAL, ia-12e73242)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

const ARMIES = 'resource/set/multiplayer/armies/', FLAGS = 'resource/interface/pages/multi/';
const TEXT_FILE = 'zz_arsenal_army.pot', TEXT_DIR = 'localizations/default/interface/text/';
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const badK = (k, m, p) => Object.assign(bad(m), { key: k }, p ? { params: p } : {});
const lower = s => String(s == null ? '' : s).toLowerCase();
const gohDir = ctx => require('./skin.goh').gohDirOf(ctx);

// the GoH files plus the mod's, through the gen Ctx of target goh (read only, plan mode); _goh marks it for textOf
const CACHE = new Map(), NOMOD = path.join(os.tmpdir(), 'arsenal-task-army-no-mod');
function reader(dir, mod) {
  if (!dir) return null;
  const m = mod && path.isAbsolute(String(mod)) ? path.resolve(String(mod)) : NOMOD, k = dir + '|' + m, hit = CACHE.get(k);
  if (hit && Date.now() - hit.at < 15000) return hit.g;
  const g = require('../../units/server').lib.newCtx(dir, m, true, 'goh');
  g._goh = true;
  CACHE.set(k, { g, at: Date.now() });
  while (CACHE.size > 4) CACHE.delete(CACHE.keys().next().value);
  return g;
}
// the shown text of an mp/ key, from the .pot files of the game (msgctxt -> msgid; a .po text in msgstr is not the default language)
function textOf(g, key) {
  if (!key) return '';
  if (!g._armyText) {
    g._armyText = new Map();
    // the game's .pot first, then the mod's localizations/default/interface/text/*.pot (zz_arsenal_army*.pot), whose text is kept [I] (GHLOC-08)
    const ks = g.keys(/^resource\/interface\/text\/.*\.pot$/).concat(g.keys(/^localizations\/default\/interface\/text\/[^/]+\.pot$/).sort());
    for (const k of ks) {
      const t = g.readStr(k) || '', re = /msgctxt\s+"((?:[^"\\]|\\.)*)"\s*\r?\nmsgid\s+"((?:[^"\\]|\\.)*)"/g; let m;
      while ((m = re.exec(t))) if (/^mp\//i.test(m[1])) g._armyText.set(lower(m[1]), m[2].replace(/\\"/g, '"'));
    }
  }
  return g._armyText.get(lower(key)) || '';
}

// own route: the army name into the mod's .pot through lng-add (--exe goh); plan runs it with --dry-run (nothing written)
async function textRoute(url, b, ctx) {
  b = b || {};
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), key = String(b.key || ''), text = String(b.text || '');
  if (!/^mp\/(army|alliance)\/[a-z0-9_]{1,30}$/.test(key)) throw bad('An army or side name key is mp/army/<word> or mp/alliance/<word>.');
  if (!/^[^"{}\r\n]{1,40}$/.test(text)) throw bad('The army name is 1 to 40 characters, no quotes or braces.');
  let dir = null; try { dir = ctx.gohDir && ctx.gohDir(); } catch (e) { dir = null; }
  if (!dir) throw badK('task.army.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  if (b.write) {
    const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'save the army name' });
    if (why) throw bad(why);
    if (ctx.job) ctx.job.writes = true;
  }
  const args = [mod, '--exe', 'goh', '--game', dir, '--file', TEXT_FILE, '--key', key, '--text', text, '--force'].concat(b.write ? [] : ['--dry-run']);
  const r = await ctx.runTool('lng-add', 'lng-add/lng-add.js', args, { timeoutMs: 60000 });
  if (r.cancelled || (ctx.job && ctx.job.cancelled)) return { ok: false, stopped: true };
  if (r.code !== 0) throw bad('The army name could not be written: ' + String(r.stderr || r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300));
  return { ok: true, wrote: !!b.write, files: [TEXT_DIR + TEXT_FILE] };
}

// make on GoH: every file comes from army.gohmake.js plan (checked here, so a refusal shows at plan time), written by its route;
// the name goes through the text route (mp/army/<tag>), an uploaded flag through the flag route as flag_<tag>.tga. [T] in game
function makeGoh(c, H, given, said) {
  const base = lower(c.base && c.base.id), tag = lower(String(c.value('tag') || '').trim());
  if (!H.TAG.test(base)) throw bad('Pick the stock army whose forms the new army copies first.');
  if (!H.TAG.test(tag)) throw bad('Type the short word of the new army: small English letters, digits and _ (up to 16), for example ita.');
  if (tag === base) throw bad('The new army needs its own short word; ' + base + ' is the army it copies.');
  for (const q of AS2_LISTS) if (given(q)) throw badK('task.army.na.gohcards', NA_CARDS);
  if (H.linesOf(c, 'groupcards').length || H.linesOf(c, 'gohadd').length) throw bad('Card groups and added cards change cards the army already has: write the new army first, then change it.');
  const g = reader(c.gameDir, c.mod), all = H.armies(g);
  const title = String(c.value('title') || '').trim();
  if (!title) throw bad('Type the name players see for the new army in the lobby, for example Italy.');
  const taken = all.find(a => lower(textOf(g, a.title)) === lower(title));
  if (taken) throw bad('Army ' + taken.tag + ' is already called ' + title + ' in the lobby; give the new army its own name.');
  const used = new Set(all.map(a => a.id)); let id = null;
  const ia = c.answer('armyid');
  if (ia && ia.src !== 'keep' && c.value('armyid') !== '' && c.value('armyid') != null) id = Number(c.value('armyid'));
  else for (let n = 6; n <= 99; n++) if (!used.has(n)) { id = n; break; }
  const al = lower(c.value('alliance') || c.values.alliance || '');
  const fa = c.answer('flag'), calls = [], notes = [], to = FLAGS + 'flag_' + tag + '.tga';
  let flag = 'plain';
  if (fa && fa.src === 'exist' && fa.value) flag = 'game:' + lower(fa.value);
  else if (fa && fa.src === 'file') {
    const n = (fa.staged || [])[0];
    if (!n) throw bad('Flag: the picture was not uploaded.');
    if (!/\.(png|tga|gif)$/i.test(n)) throw bad('Flag: upload a PNG, TGA or GIF picture.');
    flag = 'own';
    const size = H.flagSize(g, FLAGS + 'flag_' + base + '.tga');
    calls.push({ route: 'POST /api/x/task/r/army/flag', body: { draft: c.draftId, name: n, to, size }, dryFlag: 'write' });
    notes.push('Flag: your picture is converted to the game\'s TGA' + (size ? ' at ' + size + ' pixels, the stock flag size' : '') + ' and saved as ' + to + '.');
  } else notes.push('Flag: a plain one-colour flag made by code is saved as ' + to + '; give your own picture (Flag, file) to replace it.');
  const pickOf = q => H.linesOf(c, q).map(x => String(x.value == null ? '' : x.value).trim()).filter(Boolean);
  const cards = pickOf('gohfirst').concat(pickOf('gohother'));
  const body = { army: tag, base, id, alliance: al, cards, flag };
  const r = require('./army.gohmake').plan(g, Object.assign({ tag }, body));
  calls.unshift({ route: 'POST /api/x/task/r/army/gohmake', body, dryFlag: 'write' });
  calls.push({ route: 'POST /api/x/task/r/army/text', body: { key: 'mp/army/' + tag, text: title }, dryFlag: 'write' });
  notes.push(...r.notes);
  notes.push('Army name: mp/army/' + tag + ' = ' + title + ' goes into ' + TEXT_DIR + TEXT_FILE + ' of your mod [T].');
  const copies = [];
  sideAndMoney(c, H, g, all, r.side, said, calls, copies, notes);
  branchNotes(c, notes);
  const ops = r.clones.map(x => ({ op: 'clone', entity: x.entity, as: x.as }));
  return { gen: ops.length ? { ops } : null, calls, copies, notes, result: tag };
}

// the AS2 card list questions: not asked on GoH (their GoH forms are gohfirst, gohother, gohadd and gohtab); a draft that has one anyway
const AS2_LISTS = ['unitlist', 'cardtab', 'firstunits'];
const NA_CARDS = 'Not available in Gates of Hell: this Assault Squad 2 card list. Gates of Hell lists cards per period with doctrines and crews; use the period list questions and the cards of other armies question.';
const branched = c => ['prices', 'bots'].some(q => { const a = c.answer(q); return !!a && a.src === 'branch'; });
function branchNotes(c, notes) {
  for (const q of ['prices', 'bots']) { const a = c.answer(q); if (a && a.src === 'branch') notes.push(q + ': written by its own task after the army' + (a.result ? ' (' + (typeof a.result === 'object' ? JSON.stringify(a.result).slice(0, 80) : a.result) + ')' : '') + '.'); }
}
// the side name and picture (alliances_generic.inc) and the money tabs (gohbudget route) of a make or change
function sideAndMoney(c, H, g, all, side, said, calls, copies, notes) {
  const sa = c.answer('sideflag'), flagSaid = !!sa && sa.src !== 'keep' && !(sa.src === 'exist' && lower(sa.value) === lower(c.values.sideflag || ''));
  if (said('sidename') || flagSaid) {
    const sd = side ? H.sides(g)[lower(side)] : null;
    if (!sd) throw bad('The army is on no side (alliances_generic.inc), so there is no side name or picture to change.');
    const on = all.filter(a => a.alliance === lower(side)).map(a => a.tag).join(', ');
    if (said('sidename')) {
      const key = lower(sd.title || ''), text = String(c.value('sidename')).trim();
      if (!/^mp\/alliance\/[a-z0-9_]{1,30}$/.test(key)) throw bad('The ' + side + ' side names its title ' + (sd.title || '(none)') + ', which this task cannot write.');
      calls.push({ route: 'POST /api/x/task/r/army/text', body: { key, text }, dryFlag: 'write' });
      notes.push('Side name: ' + key + ' = ' + text + ' goes into ' + TEXT_DIR + TEXT_FILE + ' of your mod and is shown for every army on the ' + side + ' side (' + on + ') [T].');
    }
    if (flagSaid) {
      const sf = /\/interface\/pages\/multi\/flag_([a-z0-9_]+)$/i.exec(sd.icon || '');
      if (!sf) throw bad('The ' + side + ' side has no picture path in alliances_generic.inc to write over.');
      const to = FLAGS + 'flag_' + lower(sf[1]) + '.tga';
      if (sa.src === 'exist') { const k = FLAGS + 'flag_' + lower(sa.value) + '.tga'; if (k !== to) copies.push({ key: k, to }); }
      else if (sa.src === 'file') {
        const n = (sa.staged || [])[0];
        if (!n) throw bad('Side picture: the picture was not uploaded.');
        if (!/\.(png|tga|gif)$/i.test(n)) throw bad('Side picture: upload a PNG, TGA or GIF picture.');
        const size = H.flagSize(g, to);
        calls.push({ route: 'POST /api/x/task/r/army/flag', body: { draft: c.draftId, name: n, to, size }, dryFlag: 'write' });
      } else notes.push('Side picture: draw it in the picture editor and save it as ' + to + ' in the mod.');
      notes.push('The side picture ' + to + ' is shown for every army on the ' + side + ' side (' + on + ') [T].');
    }
  }
  if (said('budgetbuttons')) {
    const now = String(c.value('budgetbuttons')).trim();
    const r = budgetPlan(g, now);
    calls.push({ route: 'POST /api/x/task/r/army/gohbudget', body: { buttons: now }, dryFlag: 'write' });
    notes.push(...r.notes);
  }
}

// ---- the money tabs: {budgets {vehicle .. {buttons ".."}} {hero .. {buttons ".."}}} in the game mode files under games/
const GAMES = 'resource/set/multiplayer/games/', BUDGET_MAIN = GAMES + 'presets/global_parameters/budget.inc';
// the index of the brace closing the block opened at i (quotes and ; comments skipped)
function closeOf(t, i) {
  let d = 0, q = false;
  for (let j = i; j < t.length; j++) {
    const ch = t[j];
    if (q) { if (ch === '"') q = false; continue; }
    if (ch === '"') q = true;
    else if (ch === ';') { const n = t.indexOf('\n', j); if (n < 0) return -1; j = n; }
    else if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return j; }
  }
  return -1;
}
// the {buttons ".."} of each {vehicle} and {hero} block right inside a {budgets} block: [{kind, start, end, value}] (start/end of the value)
function budgetSpots(t) {
  const out = [];
  for (const b of t.matchAll(/\{\s*budgets\b/g)) {
    const be = closeOf(t, b.index); if (be < 0) continue;
    let j = b.index + 1;
    while (j < be) {
      const o = t.indexOf('{', j); if (o < 0 || o >= be) break;
      const e = closeOf(t, o); if (e < 0 || e > be) break;
      const m = /^\{\s*(vehicle|hero)\b/.exec(t.slice(o, o + 40));
      if (m) {
        // its own buttons line: a {buttons ".."} whose braces sit one level inside the block
        let k = o + 1;
        while (k < e) {
          const p = t.indexOf('{', k); if (p < 0 || p >= e) break;
          const pe = closeOf(t, p); if (pe < 0) break;
          const bm = /^\{\s*buttons\s+"([^"]*)"\s*\}$/.exec(t.slice(p, pe + 1));
          if (bm) { const s = t.indexOf('"', p) + 1; out.push({ kind: m[1], start: s, end: s + bm[1].length, value: bm[1] }); break; }
          k = pe + 1;
        }
      }
      j = e + 1;
    }
  }
  return out;
}
// the money tabs now: vehicle and hero of budget.inc (the main preset), and every file that has them
function budgetOf(g) {
  if (g._gohBudget) return g._gohBudget;
  const files = [];
  for (const k of g.keys(/^resource\/set\/multiplayer\/games\/.*\.(inc|set)$/)) {
    const t = g.readStr(k) || ''; if (!/\{\s*budgets\b/.test(t)) continue;
    const sp = budgetSpots(t); if (sp.some(s => s.kind === 'vehicle')) files.push({ key: k, spots: sp });
  }
  const main = files.find(f => f.key === BUDGET_MAIN) || files[0], v = main && main.spots.find(s => s.kind === 'vehicle'), h = main && main.spots.find(s => s.kind === 'hero');
  g._gohBudget = { vehicle: v ? v.value : undefined, hero: h ? h.value : undefined, files };
  return g._gohBudget;
}
// the new vehicle buttons in every file: refused when a tab the cards of any army use (early, mid, late) is paid by no budget
function budgetPlan(g, now) {
  now = String(now || '').trim();
  if (!/^[a-z0-9_]+( [a-z0-9_]+)*$/.test(now)) throw bad('The money tabs are tab names with one space between them, for example inf1 inf2 empl vehicles tanks.');
  const B = budgetOf(g);
  if (!B.files.length) throw bad('Gates of Hell has no game mode file with money tabs ({budgets} with {vehicle} {buttons}) under ' + GAMES + '.');
  const list = now.split(' '), used = new Set(), K = require('./army.gohcards');
  for (const k of g.keys(/^resource\/set\/multiplayer\/armies\/[^/]+\.set$/)) for (const x of K.cardsOf(g, k.split('/').pop().slice(0, -4), '')) if (x.tab) used.add(lower(x.tab));
  const files = new Map(), notes = [];
  for (const f of B.files) {
    const t = g.readStr(f.key), hero = [].concat(...f.spots.filter(s => s.kind === 'hero').map(s => s.value.split(/\s+/)));
    // a tab the cards use that this file pays for now and would no longer pay for (a file that pays for none keeps that)
    const paid = new Set([].concat(...f.spots.filter(s => s.kind === 'vehicle').map(s => s.value.split(/\s+/))));
    const free = [...used].filter(x => paid.has(x) && !list.includes(x) && !hero.includes(x)).sort();
    if (free.length) throw bad('Cards are bought on tab ' + free.join(', ') + '; with no money paying for it in ' + f.key + ' they would cost nothing. Keep every tab your cards use.');
    let out = t;
    for (const s of f.spots.filter(x => x.kind === 'vehicle').sort((a, b) => b.start - a.start)) out = out.slice(0, s.start) + now + out.slice(s.end);
    if (out !== t) files.set(f.key, Buffer.from(out, 'latin1'));
  }
  if (!files.size) throw bad('Nothing changes: the money tabs are already ' + now + '.');
  // read back: every vehicle buttons line is the new one
  for (const [k, b] of files) if (budgetSpots(b.toString('latin1')).some(s => s.kind === 'vehicle' && s.value !== now)) throw bad('Internal check: ' + k + ' does not read back.', 500);
  notes.push('The money tabs (' + now + ') are a rule of the game modes, not of one army: they change for every army in ' + files.size + ' files (' + [...files.keys()].map(k => k.slice(GAMES.length)).join(', ') + '). Your mod copies replace the game\'s whole files [T].');
  return { files, notes };
}
// own route: POST /api/x/task/r/army/gohbudget {mod, buttons, write}
async function budgetRoute(url, b, ctx) {
  b = b || {};
  const M = require('./army.gohmake'), { mod, dir, g } = M.routeCtx(ctx, b);
  const r = budgetPlan(g, b.buttons), out = { ok: true, files: [...r.files.keys()], notes: r.notes };
  if (!b.write) return out;
  return Object.assign(out, { wrote: true }, M.writeAll(ctx, mod, dir, r.files, 'change the money tabs', 'task-army-gohbudget'));
}

// compile on GoH. H: the recipe's helpers {TAG, same, linesOf, armies, sides, flagSize, cards: army.gohcards}
function compile(draft, c, H) {
  if (!c.gameDir) throw badK('task.army.e.nogoh', 'Set the Gates of Hell folder first (the Game folder button at the top).');
  const tag = lower(c.base && c.base.id);
  if (!H.TAG.test(tag)) throw bad('Pick the army to change first.');
  const said = id => { const a = c.answer(id); return !!a && a.src !== 'keep' && !H.same(c.value(id), c.values[id]); };
  const given = id => { const a = c.answer(id); return !!a && a.src !== 'keep' && (a.src === 'branch' || [].concat(c.value(id) == null ? [] : c.value(id)).filter(x => x !== '' && x != null).length > 0); };
  if (c.verb === 'make') return makeGoh(c, H, given, said);
  for (const q of AS2_LISTS) if (given(q)) throw badK('task.army.na.gohcards', NA_CARDS);
  const g = reader(c.gameDir, c.mod), all = H.armies(g), me = all.find(a => a.tag === tag);
  if (!me) throw bad('Gates of Hell has no army ' + tag + ' (' + ARMIES + tag + '.set). Pick one from the list.');
  const ops = [], copies = [], calls = [], notes = [];
  // the buy cards of one period list (army.gohcards.js): the route calls and the Units Add calls come first
  const K = (H.cards || require('./army.gohcards')).compile(c, g, tag, H);
  calls.push(...K.calls); notes.push(...K.notes);
  // cards of other armies (gohother): copied into this army's period lists by the gohadopt route; checked here so a refusal shows at plan
  const other = H.linesOf(c, 'gohother').map(x => String(x.value == null ? '' : x.value).trim()).filter(Boolean);
  if (other.length) {
    const r = require('./army.gohmake').adopt(g, { tag, cards: other });
    calls.push({ route: 'POST /api/x/task/r/army/gohadopt', body: { army: tag, cards: other }, dryFlag: 'write' });
    notes.push(...r.notes);
    for (const x of r.clones) ops.push({ op: 'clone', entity: x.entity, as: x.as });
  }
  if (said('title')) {
    const title = String(c.value('title')).trim(), key = lower(me.title || 'mp/army/' + tag);
    if (!/^mp\/army\/[a-z0-9_]{1,30}$/.test(key)) throw bad('Army ' + tag + ' names its title ' + me.title + ', which this task cannot write.');
    const taken = all.find(a => a.tag !== tag && lower(textOf(g, a.title)) === lower(title));
    if (taken) throw bad('Army ' + taken.tag + ' is already called ' + title + ' in the lobby; pick another name.');
    calls.push({ route: 'POST /api/x/task/r/army/text', body: { key, text: title }, dryFlag: 'write' });
    notes.push('Army name: ' + key + ' = ' + title + ' goes into ' + TEXT_DIR + TEXT_FILE + ' of your mod; that file is read after the game\'s dlg_mp.pot, so its text is kept [I] (GHLOC-08). Check the lobby [T].');
  }
  if (said('armyid')) {
    const n = Number(c.value('armyid'));
    if (!Number.isInteger(n) || n < 0 || n > 99) throw bad('The army number is a whole number from 0 to 99 (MIS-07).');
    const other = all.find(a => a.tag !== tag && a.id === n);
    if (other) throw bad('Number ' + n + ' is already army ' + other.tag + '; two armies with one number share ranks (MIS-07). Pick a free one.');
    ops.push({ op: 'set', rows: [{ entity: 'file:' + ARMIES + tag + '.set', path: 'army/id', value: String(n) }] });
    notes.push('The army number changes in ' + ARMIES + tag + '.set; whether Gates of Hell keeps ranks per number as Assault Squad 2 does is not checked [T].');
  }
  const fa = c.answer('flag'), now = lower(c.values.flag || tag);
  if (fa && fa.src !== 'keep' && !(fa.src === 'exist' && lower(fa.value) === now)) {
    const f = /flag_([^/]+)$/.exec(me.icon || ''), to = FLAGS + 'flag_' + lower(f ? f[1] : tag) + '.tga';
    if (fa.src === 'exist') { const k = FLAGS + 'flag_' + lower(fa.value) + '.tga'; if (k !== to) copies.push({ key: k, to }); }
    else if (fa.src === 'file') {
      const n = (fa.staged || [])[0];
      if (!n) throw bad('Flag: the picture was not uploaded.');
      if (!/\.(png|tga|gif)$/i.test(n)) throw bad('Flag: upload a PNG, TGA or GIF picture.');
      const size = H.flagSize(g, to);
      calls.push({ route: 'POST /api/x/task/r/army/flag', body: { draft: c.draftId, name: n, to, size }, dryFlag: 'write' });
      notes.push('Flag: your picture is converted to the game\'s TGA' + (size ? ' at ' + size + ' pixels, the stock flag size' : '') + ' and saved as ' + to + '.');
    } else notes.push('Flag: draw it in the picture editor and save it as ' + to + ' in the mod.');
    if (copies.length || calls.length) notes.push('The flag ' + to + ' is shown wherever the game shows ' + tag + '\'s flag [T].');
  }
  sideAndMoney(c, H, g, all, me.alliance, said, calls, copies, notes);
  branchNotes(c, notes);
  if (!ops.length && !copies.length && !calls.length && !branched(c)) throw bad('Nothing changes: give ' + tag + ' a new name, number or flag, or add, take off or move its cards.');
  return { gen: ops.length ? { ops } : null, calls, copies, notes, result: tag };
}

module.exports = { reader, textOf, textRoute, compile, gohDir, budgetOf, budgetPlan, budgetSpots, budgetRoute, TEXT_FILE, TEXT_DIR };
