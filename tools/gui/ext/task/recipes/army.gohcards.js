// recipe "army", the Gates of Hell buy cards (game parity 2026-11-23): add, take off and move the cards of one army in one period list.
// Read on the GoH install [V 2026-11-23]: the cards of army <a> in period <p> (early, mid, late) are
// resource/set/multiplayer/units/<p>/units_<a>.set (CRLF), each either a block {"<id>" ("<macro>" side(..) period(..) .. b(tab) g(group)
// ..) ..} or a macro call line ("<macro>" side(<a>) name(<name>) d(<doctrine>) period(<p>) .. g(group) .. b(tab) ..) whose card id is
// <name>(<side>); the tab b(..) is one of inf1 inf2 empl vehicles tanks doctrine (head of the file), doctrine cards ("doctrine_t1" ..)
// get the doctrine tab from their macro (settings.set generic_d {button "doctrine"}) and have no b(..) of their own.
// Add: a card of this army (any period) is copied under a new id into the period list through the Units page's GoH Add
// (POST /api/x/units/add, gohAdd: the card block or call line, a cloned entity for a card that buys its own entity, name .pot).
// Take off: the card's lines in the mod copy of the period list are made comments (';'), so the game skips them and the text stays.
// Move: the card's b(..) / g(..) (or {button ".."} / {group ".."}) get the picked tab and group. Both through this recipe's route
// POST /api/x/task/r/army/gohcards (dry run names the file; the write goes only into the picked mod). Every buy panel change is [T].
// Author: Imperator_Aug (ARSENAL, ia-08f8a5c9)
'use strict';
const fs = require('fs'), path = require('path');

// conquest/units_<a>.set is the Conquest mode's list (min_stage, no tab, not in the buy panel catalogue [V 2026-11-23]): not offered
const UNITS = 'resource/set/multiplayer/units/', PERIODS = ['early', 'mid', 'late'];
const TABS = ['inf1', 'inf2', 'empl', 'vehicles', 'tanks', 'doctrine'];
const TAG = /^[a-z][a-z0-9_]{0,15}$/, WORD = /^[a-z0-9_]{1,30}$/;
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const lc = s => String(s == null ? '' : s).toLowerCase();
const listKey = (p, a) => UNITS + p + '/units_' + a + '.set';
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// a line without its quoted strings and ; comment (for counting braces)
const bare = l => l.replace(/"[^"]*"/g, '""').replace(/;.*$/, '');
const arg = (t, k) => { const m = new RegExp('(?:^|[\\s(])' + k + '\\(([^()]*)\\)', 'i').exec(t); return m ? m[1].trim() : null; };
const blk = (t, k) => { const m = new RegExp('\\{\\s*' + k + '\\s+"([^"]*)"', 'i').exec(t); return m ? m[1].trim() : null; };

// the cards of one period list (text): [{id, cat, kind: 'block'|'call', macro, side, period, tab, group, doctrine, i, j, tail, text}]
// cat = the card id the Units catalogue knows (block id, or <name>(<side>) for a call line); tail: text after the card's last ')' or
// '}' on its last line (not empty: the card shares a line with something else)
function parse(text, period) {
  const lines = String(text).split(/\r?\n/), out = [];
  let d = 0;
  for (let i = 0; i < lines.length; i++) {
    if (d === 0) {
      const m = /^\s*\{\s*"([^"]+)"/.exec(lines[i]), c = !m && /^\s*\(\s*"([^"]+)"/.exec(lines[i]);
      if (m || c) {
        let dd = 0, j = i, col = -1;
        for (; j < lines.length; j++) {
          const b = bare(lines[j]);
          for (let k = 0; k < b.length; k++) { const ch = b[k]; if (ch === '{' || ch === '(') dd++; else if (ch === '}' || ch === ')') { dd--; if (dd <= 0) { col = k; break; } } }
          if (dd <= 0) break;
        }
        if (j >= lines.length) j = lines.length - 1;
        const t = lines.slice(i, j + 1).join('\n'), tail = col >= 0 ? bare(lines[j]).slice(col + 1).trim() : '';
        const macro = m ? ((/\(\s*"([^"]+)"/.exec(t) || [])[1] || '') : c[1];
        const side = lc(arg(t, 'side') || ''), per = lc(arg(t, 'period') || period || '');
        let id = null;
        if (m) id = m[1];
        else { const nm = arg(t, 'name'); if (nm && side) id = nm + '(' + side + ')'; }
        if (id) {
          const tab = lc(arg(t, 'b') || blk(t, 'button') || (/doctrine/i.test(macro) || /\(\s*"doctrine_t\d/i.test(t) ? 'doctrine' : ''));
          out.push({ id, cat: id, kind: m ? 'block' : 'call', macro, side, period: per, tab, group: lc(arg(t, 'g') || blk(t, 'group') || ''), doctrine: lc(arg(t, 'd') || ''), i, j, tail, text: t,
            tabOwn: !!(arg(t, 'b') || blk(t, 'button')), groupOwn: !!(arg(t, 'g') || blk(t, 'group')) });
        }
        i = j; continue;
      }
    }
    for (const ch of bare(lines[i])) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') d = Math.max(0, d - 1); }
  }
  return out;
}
// the Units page card key of a card (units/server.js cardKey: id@card file@period): a block's file is its list, a call line's the
// macro's define file units/settings.set [I: catalogue of the real install]; a wrong key only makes the Add pick the id's last copy
const cardKey = (x, key) => lc(x.cat) + '@' + (x.kind === 'block' ? key : UNITS + 'settings.set') + '@' + x.period;
// g: a gen Ctx of target goh (army.goh reader). -> the cards of army in the period list (or every period when period is empty)
function cardsOf(g, army, period) {
  const out = [];
  for (const p of period ? [period] : PERIODS) {
    const key = listKey(p, army), b = g.read(key); if (!b) continue;
    for (const x of parse(b.toString('latin1'), p)) out.push(Object.assign(x, { key, listPeriod: p, card: null }, { card: cardKey(x, key) }));
  }
  return out;
}
// every card id of every army and period (the new id must be free everywhere: the Units Add checks the whole catalogue)
function allIds(g) {
  const s = new Set();
  for (const k of g.keys(/^resource\/set\/multiplayer\/units\/[^/]+\/units_[^/]+\.set$/)) {
    const b = g.read(k); if (!b) continue;
    for (const x of parse(b.toString('latin1'), '')) { s.add(lc(x.cat)); s.add(lc(x.cat.replace(/\([^()]*\)$/, ''))); }
  }
  return s;
}
// a free id for the copy of card x into period p: <name>_<p>, else <name>_copy, else <name>_<p>_2 ..
function newIdOf(x, p, taken) {
  const base = lc(x.cat.replace(/\([^()]*\)$/, '')).replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '').slice(0, 30) || 'card';
  const tries = [base.endsWith('_' + p) ? base + '_copy' : base + '_' + p];
  for (let n = 2; n < 100; n++) tries.push(tries[0] + '_' + n);
  return tries.find(t => /^[a-z][a-z0-9_]{1,40}$/.test(t) && !taken.has(t) && !/_x+$/.test(t)) || null;
}
// the shown text of a card's own name key (.pot msgctxt -> msgid), read once per reader
function nameOf(g, keys) {
  if (!g._descText) {
    g._descText = new Map();
    for (const k of g.keys(/^resource\/interface\/text\/[^/]+\.pot$/)) {
      const t = g.readStr(k) || '', re = /msgctxt\s+"((?:[^"\\]|\\.)*)"\s*\r?\nmsgid\s+"((?:[^"\\]|\\.)*)"/g; let m;
      while ((m = re.exec(t))) if (/^desc\/(entity|squad)\//i.test(m[1]) && !g._descText.has(lc(m[1]))) g._descText.set(lc(m[1]), m[2].replace(/\\"/g, '"'));
    }
  }
  for (const k of keys) { const v = g._descText.get(lc(k)); if (v) return v; }
  return '';
}
const nameKeys = x => (x.kind === 'call' ? ['desc/squad/' + x.cat, 'desc/squad/' + x.cat.replace(/\([^()]*\)$/, '')] : ['desc/entity/' + x.cat, 'desc/squad/' + x.cat]);

// ---- lookups (army.recipe.js calls these on the GoH tab). g: the GoH reader, me: the army, period: the draft's period or ''
const subOf = x => x.listPeriod + (x.tab ? ', tab ' + x.tab : '') + (x.group ? ', group ' + x.group : '') + (x.doctrine ? ', doctrine ' + x.doctrine : '');
const hit = (w, ...xs) => { w = lc(w).trim(); return !w || xs.some(x => lc(x).includes(w)); };
// a card to copy: every card of this army in every period, as <card id>@<period>
function lookCard(g, me, words) {
  return cardsOf(g, me, '').filter(x => hit(words, x.cat)).map(x => ({ id: x.cat + '@' + x.listPeriod, name: '', where: x.key, ref: { key: x.key }, sub: subOf(x) }));
}
// a card of this army in the period (to take off or move)
function lookOwn(g, me, period, words) {
  return cardsOf(g, me, period).filter(x => hit(words, x.cat)).map(x => ({ id: x.cat, name: '', where: x.key, ref: { key: x.key }, sub: subOf(x) }));
}
function lookGroup(g, me, period, words) {
  const by = new Map();
  for (const x of cardsOf(g, me, period)) if (x.group) { if (!by.has(x.group)) by.set(x.group, []); by.get(x.group).push(x.cat); }
  return [...by.keys()].sort().filter(k => hit(words, k)).map(k => ({ id: k, name: k, where: '', ref: null, sub: by.get(k).length + ': ' + by.get(k).slice(0, 6).join(', ') + (by.get(k).length > 6 ? ' ..' : '') }));
}
function lookTab(g, me, period, words) {
  const n = {};
  if (g && me) for (const x of cardsOf(g, me, period)) if (x.tab) n[x.tab] = (n[x.tab] || 0) + 1;
  return [...new Set(TABS.concat(Object.keys(n)))].filter(k => hit(words, k)).map(k => ({ id: k, name: k, where: '', ref: null, sub: String(n[k] || 0) }));
}

// ---- the edit of one period list: rm = card ids taken off, mv = card ids moved to tab and/or group. -> {text, rows} (throws a plain line)
function edit(text, period, rm, mv, tab, group) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n', lines = text.split(/\r?\n/), cards = parse(text, period), rows = [];
  const find = id => { const x = cards.find(y => lc(y.cat) === lc(id)) || cards.find(y => y.kind === 'call' && lc(y.cat.replace(/\([^()]*\)$/, '')) === lc(id)); if (!x) throw bad('The ' + period + ' list has no card ' + id + '. Pick it from the list.'); return x; };
  for (const id of mv) {
    const x = find(id); let t = x.text;
    const put = (k, bk, v) => {
      const a = new RegExp('((?:^|[\\s(])' + k + '\\()[^()]*(\\))', 'i'), b = new RegExp('(\\{\\s*' + bk + '\\s+")[^"]*(")', 'i');
      if (a.test(t)) t = t.replace(a, (m, p, q) => p + v + q);
      else if (b.test(t)) t = t.replace(b, (m, p, q) => p + v + q);
      else throw bad('Card ' + x.cat + ' takes its ' + (k === 'b' ? 'tab' : 'group') + ' from its macro "' + x.macro + '" (no ' + k + '(..) of its own), so it cannot be moved here.' + (x.tab === 'doctrine' ? ' Doctrine cards stay on the doctrine tab.' : ''));
    };
    if (tab) put('b', 'button', tab);
    if (group) put('g', 'group', group);
    if (t !== x.text) { lines.splice(x.i, x.j - x.i + 1, ...t.split('\n')); rows.push({ card: x.cat, op: 'move', tab: tab || x.tab, group: group || x.group }); }
  }
  // take off after the moves (line numbers of moved cards stay: a move keeps the line count of its card)
  for (const id of rm) {
    const x = parse(lines.join('\n'), period).find(y => lc(y.cat) === lc(id)) || find(id);
    if (x.tail) throw bad('Card ' + x.cat + ' shares its last line with other text, so it cannot be taken off here. Take it off in a text editor.');
    for (let k = x.i; k <= x.j; k++) lines[k] = ';' + lines[k];
    rows.push({ card: x.cat, op: 'remove' });
  }
  return { text: lines.join(eol), rows };
}

// own route: POST /api/x/task/r/army/gohcards {mod, army, period, remove: [ids], move: [ids], tab, group, write}: the dry run names the
// period list; the write puts the changed copy into the mod (bytes of every other line kept, CRLF kept)
async function cardsRoute(url, b, ctx) {
  b = b || {};
  const mod = require('../../bots/lib').checkMod(ctx, b.mod), army = lc(b.army), period = lc(b.period);
  if (!TAG.test(army)) throw bad('Pick the army first.');
  if (!PERIODS.includes(period)) throw bad('Pick the period list: early, mid or late.');
  const list = v => (Array.isArray(v) ? v : []).map(String).filter(Boolean).slice(0, 200);
  const rm = list(b.remove), mv = list(b.move), tab = lc(b.tab || ''), group = lc(b.group || '');
  if ([...rm, ...mv].some(x => !/^[A-Za-z0-9_.()-]{1,80}$/.test(x))) throw bad('A card id is letters, digits, _ and brackets.');
  if ((tab && !WORD.test(tab)) || (group && !WORD.test(group))) throw bad('Pick the tab and the group from the list.');
  let dir = null; try { dir = require('./skin.goh').gohDirOf(ctx); } catch (e) { dir = null; }
  if (!dir) throw Object.assign(bad('Set the Gates of Hell folder first (the Game folder button at the top).'), { key: 'task.army.e.nogoh' });
  const g = require('../../units/server').lib.newCtx(dir, mod, true, 'goh'), key = listKey(period, army), buf = g.read(key);
  if (!buf) throw bad('Army ' + army + ' has no ' + period + ' list (' + key + ').');
  const r = edit(buf.toString('latin1'), period, rm, mv, tab, group);
  if (!b.write) return { ok: true, files: [key], rows: r.rows };
  const why = require('../../../../lib/writeguard').refuseWrite(mod, { game: dir, purpose: 'change the buy cards' });
  if (why) throw bad(why);
  if (ctx.job) ctx.job.writes = true;
  // the final file must stay inside the mod also with links followed (lib/modwrite), and the old copy (or its absence) gets a restore
  // point in the Files page form first (<mod>/.arsenal/undo for a mod in the game's mods folder)
  const MW = require('../../../../lib/modwrite'), dst = path.join(mod, ...key.split('/'));
  try { MW.guardFile(mod, dst, { game: dir }); } catch (e) { throw bad(e.message); }
  const restore = MW.restorePoints(mod, [key], 'task-army-gohcards', { game: dir });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(r.text, 'latin1'));
  return { ok: true, wrote: true, files: [key], rows: r.rows, restore, undo: MW.restoreRoot(mod) };
}

// compile part on GoH. c: the compile ctx, g: the GoH reader, tag: the army, H: {linesOf}. -> {calls, notes} (nothing asked: empty)
function compile(c, g, tag, H) {
  const calls = [], notes = [];
  const ids = q => H.linesOf(c, q).map(l => String(l.value || '').trim()).filter(Boolean);
  const adds = ids('gohadd'), rm = ids('unitremove'), mv = ids('groupcards');
  const ga = c.answer('cardgroup'), ta = c.answer('gohtab');
  const group = ga && ga.src === 'exist' ? lc(ga.value) : '', tab = ta && ta.src === 'exist' ? lc(ta.value) : '';
  if (!adds.length && !rm.length && !mv.length && !group && !tab) return { calls, notes };
  const period = lc(c.value('gohperiod') || '');
  if (!PERIODS.includes(period)) throw bad('Pick the period list the cards are in: early, mid or late.');
  const key = listKey(period, tag);
  if (!g.read(key)) throw bad('Army ' + tag + ' has no ' + period + ' list (' + key + '). Pick another period.');
  const mine = cardsOf(g, tag, period), own = id => mine.find(y => lc(y.cat) === lc(id)) || mine.find(y => y.kind === 'call' && lc(y.cat.replace(/\([^()]*\)$/, '')) === lc(id));
  // move
  if (mv.length && !group && !tab) throw bad('Pick the cooldown group or the buy tab the picked cards move to (or take the cards off that list).');
  if (!mv.length && (group || tab)) throw bad('Pick the cards that move to ' + [group && 'group ' + group, tab && 'tab ' + tab].filter(Boolean).join(' and ') + ' (or keep the group and tab as they are).');
  if ((group && !WORD.test(group)) || (tab && !WORD.test(tab))) throw bad('Pick the group and the tab from the list.');
  const seen = new Set();
  for (const id of rm.concat(mv)) {
    const x = own(id);
    if (!x) throw bad(tag + ' has no card ' + id + ' in its ' + period + ' list. Pick it from the list.');
    if (seen.has(lc(x.cat))) throw bad('Card ' + x.cat + ' is picked twice (taken off and moved, or twice in one list).');
    seen.add(lc(x.cat));
  }
  if (rm.length || mv.length) {
    // the route's own check runs in the plan too (a doctrine card has no tab of its own); here only the plain lines
    edit(g.read(key).toString('latin1'), period, rm, mv, tab, group);
    calls.push({ route: 'POST /api/x/task/r/army/gohcards', body: { army: tag, period, remove: rm, move: mv, tab, group }, dryFlag: 'write' });
    for (const id of rm) notes.push('Card ' + own(id).cat + ' is taken off the ' + tag + ' ' + period + ' list: its lines become comments (;) in your mod\'s copy of ' + key + '. Check the buy panel in game [T].');
    for (const id of mv) notes.push('Card ' + own(id).cat + ' moves to ' + [tab && 'tab ' + tab, group && 'group ' + group].filter(Boolean).join(' and ') + ' in ' + key + ' [T].');
  }
  // add: a card of this army (any period) copied under a new id into this period list by the Units page's GoH Add
  const taken = adds.length ? allIds(g) : new Set(), all = adds.length ? cardsOf(g, tag, '') : [];
  for (const line of adds) {
    const m = /^(.+)@([a-z]+)$/.exec(line), id = m ? m[1] : line, from = m ? m[2] : '';
    const x = all.find(y => lc(y.cat) === lc(id) && (!from || y.listPeriod === from));
    if (!x) throw bad(tag + ' has no card ' + id + (from ? ' in its ' + from + ' list' : '') + ' to copy. Pick a card of this army from the list (Gates of Hell crews belong to their own army).');
    const nid = newIdOf(x, period, taken);
    if (!nid) throw bad('No free id for the copy of ' + x.cat + '. Copy it on the Units page and type an id there.');
    taken.add(nid);
    const name = nameOf(g, nameKeys(x));
    calls.push({ route: 'POST /api/x/units/add', body: { gid: 'goh', like: x.cat, card: x.card, id: nid, period, name, bots: false }, dryFlag: 'write' });
    notes.push('Card ' + x.cat + ' (' + x.listPeriod + ') is copied as ' + nid + ' into ' + key + (name ? ', named ' + name : '') + ' by the Units page\'s Add; buy it in a test match [T]. The first read of the Gates of Hell unit list can take many minutes.');
  }
  return { calls, notes };
}

module.exports = { PERIODS, TABS, parse, cardsOf, allIds, newIdOf, edit, cardsRoute, compile, lookCard, lookOwn, lookGroup, lookTab, listKey };
