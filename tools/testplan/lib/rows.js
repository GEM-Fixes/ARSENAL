// Author: Imperator_Aug (ARSENAL, ia-7332070c)
'use strict';
// testplan rows: stack + items in, test rows out. Pure: reads no file and no game.
//   build(stack, items, {only:[check ids], everything:false}) -> {rows:[row], summary}
//   row = {id, code, item, check, how, runner, title, target:{entity, weapon, ammo, card, army, file}, expect, status:'todo', result:null, why, limits}
//     plus (additive) form: 'run'|'dry'|'plan'|null (the form the runner has in this game), foe: the default foe of a fire/dmgout/feel row or null,
//     source: 'changed'|'depends', group, session.
//   code(id) -> 'T-' + 5 chars base32 (Crockford alphabet, no I L O U) of sha1(id). summarize(rows, itemCount) -> summary.
//   STATUSES = the status words of the contract.
// how: static | run | player. A `run` check the game cannot run is `player` with the reason in `why` and keeps the runner where a dry or
// plan form exists (mowas2: edrun dry, prove plan, TST-19; goh: spawn keeps sweep, the rest has no runner).
const crypto = require('crypto');
const catalog = require('./catalog');

const STATUSES = ['todo', 'pass', 'fail', 'unproven', 'void', 'held', 'skip', 'na'];
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const lc = s => String(s == null ? '' : s).toLowerCase();

// sha1 -> 32 base32 chars (160 bits); the code is a 5 char window of it
function b32(id) {
  const h = crypto.createHash('sha1').update(String(id), 'utf8').digest();
  let bits = '', out = '';
  for (const b of h) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function code(id) { return 'T-' + b32(id).slice(0, 5); }

const CAN = {
  as64: { edrun: 'run', prove: 'run', sweep: 'plan' },
  mowas2: { edrun: 'dry', prove: 'plan', sweep: 'plan' },
  goh: { edrun: 'no', prove: 'score', sweep: 'plan' },
};
const WHY = {
  mowas2: 'mowas_2.exe takes no test runner flags, so no real run happens (TST-19); a person checks it',
  goh: 'GoH runs no test game; a person checks it',
};
// default foes of the edrun packer (pack.js FOE_VEH, FOE_INF, the heavy foe); GoH has none here
const FOE = { soft: 'gaz67b', man: 'mp/ger/rifle', heavy: 'pz6bh' };

// the way one check is done on this stack: null (no row) or {how, runner, form, why}
function wayOf(check, stack) {
  const g = catalog.gid(stack);
  const way = check.games[g];
  if (!way || way === 'no') return null;
  if (check.how !== 'run') return { how: way, runner: null, form: null, why: '' };
  const can = Object.assign({}, CAN[g], stack && stack.canRun);
  const sw = (stack && stack.why) || {};
  const r = check.runner;
  if (r === 'edrun') {
    if (can.edrun === 'run') return { how: 'run', runner: 'edrun', form: 'run', why: '' };
    if (can.edrun === 'dry') return { how: 'player', runner: 'edrun', form: 'dry', why: sw.edrun || WHY[g] || WHY.mowas2 };
    return { how: 'player', runner: null, form: null, why: sw.edrun || WHY[g] || WHY.goh };
  }
  if (r === 'prove') {
    if (can.prove === 'run') return { how: 'run', runner: 'prove', form: 'run', why: '' };
    if (can.prove === 'plan') return { how: 'player', runner: 'prove', form: 'plan', why: sw.prove || WHY[g] || WHY.mowas2 };
    // no prove run and no plan (goh score): a spawn row still has the preloadsweep plan, a move row has nothing
    if (check.id === 'spawn' && can.sweep === 'plan') return { how: 'player', runner: 'sweep', form: 'plan', why: sw.prove || WHY[g] || WHY.goh };
    return { how: 'player', runner: null, form: null, why: sw.prove || WHY[g] || WHY.goh };
  }
  // the whole run (log): a run row when any runner really runs
  if (can.edrun === 'run' || can.prove === 'run') return { how: 'run', runner: null, form: 'run', why: '' };
  return { how: 'player', runner: null, form: null, why: sw.edrun || sw.prove || WHY[g] || WHY.goh };
}

function applies(check, it, everything) {
  if (check.per === 'plan') return false;
  if (!check.kinds.includes(it.kind)) return false;
  if (check.cls && it.kind === 'entity' && !check.cls.includes(it.cls)) return false;
  if (check.changedOnly && !everything && it.source === 'depends') return false;
  if (check.needs === 'card' && it.kind === 'entity' && !(it.cards && it.cards.length)) return false;
  if (check.needs === 'weapons' && !(it.weapons && it.weapons.length)) return false;
  return true;
}

function itemWhy(it) {
  if (it.source === 'depends') {
    const via = (it.via || []).filter(Boolean);
    return 'depends on ' + (via.length ? via.join(', ') : 'a changed item');
  }
  const w = (it.why || []).filter(x => x && x.rel);
  if (!w.length) return 'in the mod';
  return w[0].state + ' ' + w[0].rel + (w.length > 1 ? ' (+' + (w.length - 1) + ' more)' : '');
}

function foeOf(check, it, g) {
  if (g === 'goh') return null;
  if (check.id === 'fire' || check.id === 'dmgout') return it.cls === 'human' ? FOE.man : FOE.soft;
  if (check.id === 'feel') return FOE.heavy;
  return null;
}

function targetOf(it, weapon) {
  const c = (it.cards && it.cards[0]) || null;
  return {
    entity: it.kind === 'entity' ? it.key : null,
    weapon: weapon || (it.kind === 'weapon' ? it.key : null),
    ammo: it.kind === 'ammo' ? it.key : null,
    card: c ? c.card : (it.kind === 'card' || it.kind === 'squad' ? it.key : null),
    army: c ? c.army || null : null,
    file: it.file || null,
  };
}

function summarize(rows, itemCount) {
  const s = { rows: rows.length, byHow: { static: 0, run: 0, player: 0 }, byStatus: {}, byCheck: {}, items: 0 };
  for (const st of STATUSES) s.byStatus[st] = 0;
  const its = new Set();
  for (const r of rows) {
    s.byHow[r.how] = (s.byHow[r.how] || 0) + 1;
    s.byStatus[r.status] = (s.byStatus[r.status] || 0) + 1;
    s.byCheck[r.check] = (s.byCheck[r.check] || 0) + 1;
    its.add(r.item);
  }
  s.items = itemCount != null ? itemCount : its.size;
  return s;
}

function build(stack, items, opts) {
  const o = opts || {};
  const g = catalog.gid(stack);
  const only = o.only && o.only.length ? new Set(o.only.map(lc)) : null;
  const unknown = only ? [...only].filter(id => !catalog.get(id)) : [];
  const checks = catalog.CHECKS.filter(c => !only || only.has(c.id));
  const ways = new Map(checks.map(c => [c.id, wayOf(c, stack)]));
  const rows = [], seen = new Set(), codes = new Set(), seenItems = new Set();

  function push(check, itemId, it, weapon) {
    const way = ways.get(check.id);
    if (!way) return;
    const id = check.id + '|' + itemId + (weapon ? '|' + lc(weapon) : '');
    if (seen.has(id)) return;
    seen.add(id);
    // a code is the first free 5 char window of the hash, so two ids never share one
    const h = b32(id);
    let cd = null;
    for (let i = 0; i + 5 <= h.length && !cd; i++) { const c = 'T-' + h.slice(i, i + 5); if (!codes.has(c)) cd = c; }
    if (!cd) cd = 'T-' + h.slice(0, 5) + rows.length.toString(32).toUpperCase();
    codes.add(cd);
    const foe = it ? foeOf(check, it, g) : null;
    const base = it ? itemWhy(it) : 'the whole ' + (check.id === 'log' ? 'run' : 'mod');
    const name = it ? (it.name || it.key || itemId) : (check.id === 'log' ? 'the run' : (stack && stack.name) || 'the mod');
    rows.push({
      id, code: cd, item: itemId, check: check.id, how: way.how, runner: way.runner, form: way.form,
      title: check.title + ': ' + name + (weapon ? ' / ' + weapon : ''),
      target: it ? targetOf(it, weapon) : { entity: null, weapon: null, ammo: null, card: null, army: null, file: null },
      expect: check.expect + (foe ? ' (foe ' + foe + ')' : ''), foe,
      status: 'todo', result: null,
      why: base + (way.why ? '; ' + way.why : ''),
      limits: check.limits.slice(), source: it ? it.source || 'changed' : 'changed', group: check.group, session: check.session,
    });
  }

  for (const it of items || []) {
    if (!it || !it.id || seenItems.has(it.id)) continue;
    seenItems.add(it.id);
    for (const check of checks) {
      if (!applies(check, it, !!o.everything)) continue;
      if (check.per === 'weapon') {
        const done = new Set();
        for (const w of it.weapons) { if (!w || done.has(lc(w))) continue; done.add(lc(w)); push(check, it.id, it, w); }
      } else push(check, it.id, it, null);
    }
  }
  // the rows of the whole plan: one log row when something is tested in a game, one sync row for the mod
  if (seenItems.size) {
    for (const check of checks) {
      if (check.per !== 'plan') continue;
      push(check, check.id === 'log' ? 'run' : 'mod', null, null);
    }
  }
  const summary = summarize(rows, new Set(rows.filter(r => r.item !== 'run' && r.item !== 'mod').map(r => r.item)).size);
  if (unknown.length) summary.unknownChecks = unknown;
  return { rows, summary };
}

module.exports = { build, code, summarize, wayOf, STATUSES };
