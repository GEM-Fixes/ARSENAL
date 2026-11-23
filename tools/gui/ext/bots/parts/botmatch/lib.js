// Bots part botmatch, pure helpers (no IO): the generated testrun scenario, and the readers of what a bot match leaves behind
// (pipe.jsonl of the run, the mp_userUnits / mp_slots / mp_result replies in it, game.log) and the report built from them.
// Sources: scenario order = "opposed bots, host idle" + in-play-team.md; mp_set before mp_slot (chain-g g2:
// a slot set first was dropped); mp_set team.X.army only under {armySelectionMode team} (MIS-37, harness-edrun: bot2 "no field");
// mp_army <army> BOT pins a lone bot in an alliance mode (bot2.json [V], MIS-73); vehicle buys = `u:<card>` in mp_userUnits
// (in-play-team); infantry shows only member paths `u:mp/<side>/<type>` (ai-pages-game-checks C [V]), so a squad card
// is matched through its members (squads.set name(N) side(S) cK(type:n), membersOf) and is n/a where its members are not known; `DBG: SpawnUnit <card> <player>` prints BEFORE the spawn, `DBG: Spawning Unit
// Not found - <unit>` (MIS-32), `Lua call failed: <what>` (MIS-33); match_end / mp_result JSON with
// players {name, team, side, army, ai, local}. The host's profile name is never put in a report (in-play-team).
// Author: Imperator_Aug (ARSENAL, ia-91a7f9a5)
'use strict';

const lo = s => String(s || '').toLowerCase();
const DIFFS = ['easy', 'normal', 'hard', 'heroic'];   // mp_slot words for an AI
// bot slot ids by bot count. Slot 1 is the host's seat (live `slot id=1 team=a user=<host>`; mp_slot refuses a held seat)
// [V: ai-pages-game-checks C, D]. Slots 1..n/2 are team a, the rest team b (live 1,2 = a, 3,4 = b) [V];
// the 1-bot match (mp_host 2: slot 2 = team b) is [I], not yet run. The report reads the real teams from mp_slots.
const SLOTS = { 1: [2], 2: [2, 3], 3: [2, 3, 4] };
const teamOfSlot = (id, players) => (id <= (players || 4) / 2 ? 'a' : 'b');
const MAX_MIN = 60;
const EXC = '\\*{5,} Exception \\*{5,}';

// {map: 'multi/<folder>', mode, bots 1..3, difficulty, armyA, armyB, armyMode ('team'|other|null), minutes, mods: [folder names]}
// -> {scenario, slots: [{id, team}], players, pinned: 'team'|'one'|'none'}
function scenarioOf(o) {
  const slots = SLOTS[o.bots], players = o.bots >= 2 ? 4 : 2, team = o.armyMode === 'team', one = !team && o.bots === 1;
  const steps = [{ cmd: 'mp_lan' }, { wait_stage: true }, { cmd: 'mp_host {map} ' + players }, { wait_stage: true }, { cmd: 'mp_slots' }];
  if (team) steps.push({ cmd: 'mp_set team.a.army {armyA}' }, { cmd: 'mp_set team.b.army {armyB}' });   // before any mp_slot (chain-g g2)
  for (const id of slots) steps.push({ cmd: 'mp_slot ' + id + ' {difficulty}' });
  if (one) steps.push({ cmd: 'mp_army {armyB} BOT' });   // a lone bot in an alliance mode (bot2.json, MIS-73)
  steps.push({ cmd: 'mp_slots' }, { cmd: 'mp_ready' }, { cmd: 'mp_start' }, { wait: 'loaded', timeout: 300 });
  // one unit list a minute; the wait ends at once when the match is over (an event seen counts again), so the last lists come quickly
  for (let i = 0; i < o.minutes; i++) steps.push({ wait: 'match_end', timeout: 60 }, { cmd: 'mp_userUnits' });
  steps.push({ cmd: 'mp_result' });
  const scenario = {
    name: 'botmatch', rows: [], mode: 'menu', mods: o.mods.slice(),
    params: { map: o.map + ':' + o.mode, difficulty: o.difficulty, armyA: o.armyA, armyB: o.armyB },
    src: ['console mp_slot', 'console mp_userUnits', 'log event match_end'],
    note: 'Made by the Bots page, Try a bot match: host idle, ' + o.bots + ' bot(s) at ' + o.difficulty + ', unit list every 60 s, up to ' + o.minutes + ' min.',
    steps, verdict: [{ log: EXC, want: false }],
  };
  return { scenario, slots: slots.map(id => ({ id, team: teamOfSlot(id, players) })), players, pinned: team ? 'team' : one ? 'one' : 'none' };
}

// ---- pipe.jsonl ({t, dir: in|out, raw}) -> {loadedT, replies [{cmd, t, ok, output, error}], events, matchEnd, gameOverT}
const obj = x => { if (x && typeof x === 'object') return x; try { return JSON.parse(String(x)); } catch (e) { return null; } };
function parsePipe(text) {
  const sent = new Map(), out = { loadedT: null, replies: [], events: [], matchEnd: null, gameOverT: null };
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const r = obj(line), m = r && obj(r.raw);
    if (!m) continue;
    const t = +r.t || 0;
    if (r.dir === 'out') { if (m.id != null) sent.set(m.id, String(m.cmd || '')); continue; }
    if (m.type === 'reply') out.replies.push({ cmd: sent.get(m.id) || '', t, ok: !!m.ok, output: Array.isArray(m.output) ? m.output.map(String) : [], error: m.error || null });
    else if (m.type === 'event') {
      out.events.push(Object.assign({ t }, m));
      if (m.event === 'loaded' && out.loadedT == null) out.loadedT = t;
      if (m.event === 'game_over' && out.gameOverT == null) out.gameOverT = t;
      if (m.event === 'match_end' && !out.matchEnd) out.matchEnd = { t, end: m.end || '', reason: m.reason || '', result: obj(m.result) };
    }
  }
  return out;
}

// mp_userUnits lines: "#<side> <name>" then "  <actor> u:<card> cp:<n> cw:.. score:.. chrg:.." -> [{side, name, units: [{actor, card, member}]}]
// member: a card path with a slash (a crew man, human[5:mp/rus/tankman] u:mp/rus/tankman), not a buy of its own [I]
function parseUserUnits(lines) {
  const players = [];
  let cur = null;
  for (const raw of lines || []) {
    const l = String(raw).replace(/\r$/, '');
    let m = /^\s*#(\d+)(?:\s+(.*))?$/.exec(l);
    if (m) { cur = { side: +m[1], name: (m[2] || '').trim(), units: [] }; players.push(cur); continue; }
    if (!cur || !l.trim()) continue;
    m = /^\s*(\S+)(?:\s+u:(\S+))?/.exec(l);
    if (!m) continue;
    const card = m[2] || null;
    cur.units.push({ actor: m[1], card, member: !!card && card.includes('/') });
  }
  return players;
}

// squad cards and their members from the units set texts: {card (lower case): [member path]} for squad macros "... name(N) side(S) c1(type:n)
// c2(..)" (squads.set) -> "N(S)": ["mp/S/type" ...]; a plain card line {"<card>" ...} -> [] (seen by its own u:<card>). [V] shape from
// the as64 squads.set; the member path mp/<side>/<type> matches the live u: values (mp/ger/rifle2). A card missing here = members unknown.
function membersOf(texts) {
  const out = {};
  for (const text of texts || []) for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.replace(/;.*$/, ''), c = /^\s*\{"([^"]+)"/.exec(l);
    if (c && !/[%/]/.test(c[1]) && !out[lo(c[1])]) out[lo(c[1])] = [];
    const n = /\bname\(([^)\s]+)\)/.exec(l), sd = /\bside\(([^)\s]+)\)/.exec(l);
    if (!n || !sd) continue;
    const mem = [...l.matchAll(/\bc\d+\(([A-Za-z0-9_\-]+):\d+\)/g)].map(m => lo('mp/' + sd[1] + '/' + m[1]));
    if (mem.length) out[lo(n[1] + '(' + sd[1] + ')')] = [...new Set(mem)];
  }
  return out;
}

// mp_slots lines -> {armyMode, teams {a: army}, slots [{id, team, state, user}]}
function parseSlots(lines) {
  const out = { armyMode: null, teams: {}, slots: [] };
  for (const l of lines || []) {
    let m = /^armyMode\s+(\d+)/.exec(l);
    if (m) { out.armyMode = +m[1]; continue; }
    m = /^team name=(\S*)\s+size=\S*\s+army=(\S*)/.exec(l);
    if (m) { out.teams[m[1]] = m[2]; continue; }
    m = /^slot id=(\d+)\s+team=(\S*)\s+state=(\S+)\s+user=(\d+)/.exec(l);
    if (m) out.slots.push({ id: +m[1], team: m[2], state: m[3], user: +m[4] });
  }
  return out;
}

// game.log -> {spawns [{unit, player}], notFound [unit], luaFails [message], exceptions n}
function parseLog(text) {
  const out = { spawns: [], notFound: [], luaFails: [], exceptions: 0 };
  for (const l of String(text || '').split(/\r?\n/)) {
    let m;
    if ((m = /DBG: Spawning Unit Not found - (\S+)/.exec(l))) { if (!out.notFound.includes(m[1])) out.notFound.push(m[1]); }
    else if ((m = /DBG: SpawnUnit (\S+)(?: (.*))?$/.exec(l))) out.spawns.push({ unit: m[1], player: (m[2] || '').trim() });
    else if ((m = /Lua call failed:?\s*(.*)$/.exec(l))) out.luaFails.push(m[1].trim());
    else if (new RegExp(EXC).test(l)) out.exceptions++;
  }
  return out;
}

// testrun output lines -> [{code, msg}] (the run's own findings, as lib/report prints them)
function parseRun(stdout) {
  const out = [];
  for (const l of String(stdout || '').split(/\r?\n/)) {
    const m = /((?:WARN_)?TESTRUN_[A-Z_]+):?\s+(.*)$/.exec(l);
    if (m) out.push({ code: m[1], msg: m[2].trim().slice(0, 300) });
  }
  return out;
}

const secs = (t, t0) => Math.max(0, Math.round((t - (t0 || 0)) / 1000));

// the report a bot match gives: {bots [{side, team, army, armyHow, name, bought [{card, at, asked, seen}], never [card], asked n}],
//   issues [{k, p}], end {at, how, winner, early, empty [team], gameTime} | null, run [{code, msg, k}], samples n, traps [k]}
// plan: {map, mode, bots, minutes, pinned, slots [{id, team}], armies {a, b}}; lists: {army: [unit]} from bot.data.lua (null = unread);
// members: membersOf() of the units sets (null = unread). bought[].na = true: the card's members are not known, so whether and when it
// came onto the field cannot be told (never 0); seen = null for a squad matched by its members (squads cannot be counted from members).
function report(o) {
  const P = parsePipe(o.pipe), L = parseLog(o.log), plan = o.plan || {}, lists = o.lists || null, t0 = P.loadedT;
  const samples = P.replies.filter(r => r.cmd === 'mp_userUnits' && r.ok).map(r => ({ at: secs(r.t, t0), players: parseUserUnits(r.output) }));
  // who is who: mp_result (last), else match_end's result; the host (local, not ai) is only ever "host"
  let res = null;
  for (const r of P.replies) if (r.cmd === 'mp_result' && r.ok) res = obj(r.output.join('')) || res;
  if (!res && P.matchEnd) res = P.matchEnd.result;
  let who = (res && Array.isArray(res.players) ? res.players : []).map(p => ({ side: +p.side, team: p.team || '', army: p.army || '', ai: !!p.ai, local: !!p.local, name: p.ai ? String(p.name || '') : '' }));
  if (!who.length) {   // no result: the unit lists alone; bot = an AI-looking name, the lowest side otherwise the host [I]
    const seen = new Map();
    for (const s of samples) for (const p of s.players) if (!seen.has(p.side)) seen.set(p.side, p.name);
    const sides = [...seen.keys()].sort((a, b) => a - b), aiName = n => /\b(AI|BOT)\b/i.test(n);
    const anyAi = sides.some(s => aiName(seen.get(s)));
    who = sides.map((s, i) => { const ai = anyAi ? aiName(seen.get(s)) : i > 0; return { side: s, team: '', army: '', ai, local: !ai && i === 0, name: ai ? seen.get(s) : '' }; });
  }
  // mp_slots before mp_start: the first reply holds only the host (and other people), the last one the bots too. A bot's seat shows as
  // state=open with a user id, never state=ai (ai-pages-game-checks C [V]), so a bot slot = a user that was not there at first.
  let slots = null, first = null;
  for (const r of P.replies) { if (r.cmd === 'mp_start') break; if (r.cmd === 'mp_slots' && r.ok) { slots = parseSlots(r.output); if (!first) first = slots; } }
  const people = new Set(first && first !== slots ? first.slots.filter(s => s.user).map(s => s.user) : []);
  for (const p of (res && Array.isArray(res.players) ? res.players : [])) if (p.local && p.userId != null) people.add(+p.userId);
  const aiSlots = slots ? slots.slots.filter(s => s.state === 'ai' || (s.user && people.size && !people.has(s.user))).sort((a, b) => a.id - b.id) : [];
  const bots = who.filter(p => p.ai).sort((a, b) => a.side - b.side);
  bots.forEach((b, i) => {
    if (!b.team && aiSlots[i]) b.team = aiSlots[i].team;
    if (!b.team && plan.slots && plan.slots[i]) b.team = plan.slots[i].team;
    if (!b.army && slots && slots.teams[b.team]) b.army = slots.teams[b.team];
  });
  const nameCount = {};
  for (const b of bots) nameCount[b.name] = (nameCount[b.name] || 0) + 1;
  const inList = (army, unit) => !!(lists && lists[army] && lists[army].some(u => lo(u) === lo(unit)));
  const members = o.members || null;
  const out = { bots: [], issues: [], end: null, run: [], samples: samples.length, traps: [] };
  for (const b of bots) {
    // buy attempts (game.log, in order): by the bot's own name; a name two bots share goes by whose list holds the unit [I]
    const asked = L.spawns.filter(s => lo(s.player) === lo(b.name) && (nameCount[b.name] === 1 || inList(b.army, s.unit) || !bots.some(x => x !== b && x.name === b.name && inList(x.army, s.unit))));
    // first unit list that shows each card on the bot's side (members, slash paths, not counted)
    const seen = new Map();
    for (const s of samples) {
      const p = s.players.find(x => x.side === b.side);
      if (!p) continue;
      const n = {};
      for (const u of p.units) if (u.card && !u.member) n[u.card] = (n[u.card] || 0) + 1;
      for (const c of Object.keys(n)) { const e = seen.get(lo(c)); if (!e) seen.set(lo(c), { card: c, at: s.at, most: n[c] }); else e.most = Math.max(e.most, n[c]); }
    }
    // a squad card: first unit list with one of its members on the bot's side [I: two bought squads sharing a member type look alike]
    const byMembers = card => { const m = members && members[lo(card)]; if (!m || !m.length) return null;
      for (const s of samples) { const p = s.players.find(x => x.side === b.side); if (p && p.units.some(u => u.member && m.includes(lo(u.card)))) return s.at; } return undefined; };
    const bought = [], done = new Set();
    for (const a of asked) {
      const e = seen.get(lo(a.unit)), x = bought.find(y => lo(y.card) === lo(a.unit));
      if (x) { x.asked++; continue; }
      const m = members ? members[lo(a.unit)] : undefined, bm = e ? null : byMembers(a.unit);
      if (e) bought.push({ card: a.unit, asked: 1, at: e.at, seen: e.most });
      else if (bm !== null) bought.push({ card: a.unit, asked: 1, at: bm == null ? null : bm, seen: null, squad: true });
      else if (m) bought.push({ card: a.unit, asked: 1, at: null, seen: 0 });   // a plain card the lists never showed
      else bought.push({ card: a.unit, asked: 1, at: null, seen: null, na: true });   // members not known: n/a, never 0
      done.add(lo(a.unit));
    }
    for (const e of [...seen.values()].sort((x, y) => x.at - y.at)) if (!done.has(lo(e.card))) { bought.push({ card: e.card, asked: 0, at: e.at, seen: e.most }); done.add(lo(e.card)); }
    const list = lists && b.army && lists[b.army] ? lists[b.army] : null;
    const never = list ? [...new Set(list.filter(u => !done.has(lo(u))))] : null;
    out.bots.push({ side: b.side, team: b.team || '', army: b.army || '', armyHow: plan.pinned === 'team' || (plan.pinned === 'one' && bots.length === 1) ? 'pinned' : b.army ? 'own' : 'unknown',
      name: b.name, bought, never, asked: asked.length });
  }
  // fewer bots than asked for (a seat refused, a slot left empty)
  if (plan.bots && bots.length < plan.bots) out.issues.push({ k: 'bots.botmatch.r.fewer', p: { n: bots.length, want: plan.bots } });
  // log lines that need a word each
  if (L.luaFails.length) out.issues.push({ k: 'bots.botmatch.r.lua', p: { n: L.luaFails.length, first: L.luaFails.slice(0, 3).join(' | ') } });
  for (const u of L.notFound) out.issues.push({ k: 'bots.botmatch.r.notFound', p: { unit: u } });
  if (L.exceptions) out.issues.push({ k: 'bots.botmatch.r.exception', p: { n: L.exceptions } });
  if (o.log == null) out.issues.push({ k: 'bots.botmatch.r.nolog', p: {} });
  // end of the match: when, how, and a side with no units in the last list before the end (TST-26)
  if (P.matchEnd) {
    const at = secs(P.matchEnd.t, t0), r = P.matchEnd.result || {}, limit = (plan.minutes || MAX_MIN) * 60;
    const before = samples.filter(s => s.at <= at + 1).pop() || null, teams = {};
    for (const p of who) if (p.team) teams[p.team] = teams[p.team] || 0;
    if (before) for (const p of before.players) { const w = who.find(x => x.side === p.side); if (w && w.team) teams[w.team] += p.units.length; }
    const empty = before ? Object.keys(teams).filter(t => !teams[t]).sort() : [];
    const early = P.matchEnd.end === 'result' && at < limit - 30;
    out.end = { at, how: P.matchEnd.end, winner: r.winner && r.winner.team ? r.winner.team : null, gameTime: r.gameTime != null ? Math.round(+r.gameTime / 1000) : null, early, empty, listed: !!before };
  }
  // the run's own findings: the expected ones (match still on at a minute's wait, the empty-logdir verdict) left out
  for (const f of parseRun(o.stdout)) {
    if (f.code === 'TESTRUN_WAIT_TIMEOUT' && /match_end/.test(f.msg)) continue;
    if (f.code === 'TESTRUN_VERDICT_FAIL' || f.code === 'TESTRUN_NOTE' || f.code === 'TESTRUN_ARCHIVE' || f.code === 'TESTRUN_LOGDIR_EMPTY') continue;
    if (f.code === 'TESTRUN_CMD_FAIL' && P.matchEnd && /^mp_(userUnits|result):/.test(f.msg)) continue;   // a unit list asked after the end
    const k = /no AI here/i.test(f.msg) ? 'bots.botmatch.run.noai' : RUN_KEYS[f.code] || null;
    out.run.push({ code: f.code, msg: f.msg, k });
  }
  // harness traps that apply to this match, in-play.md)
  if (/(^|\/)chain_map$/i.test(String(plan.map || ''))) out.traps.push('bots.botmatch.trap.chain');
  if (plan.bots === 1) out.traps.push('bots.botmatch.trap.alone');
  if (plan.pinned === 'none') out.traps.push('bots.botmatch.trap.random');
  if (bots.some(b => b.team === 'a')) out.traps.push('bots.botmatch.trap.income');
  return out;
}
const RUN_KEYS = {
  TESTRUN_RUNNING: 'bots.botmatch.run.running', TESTRUN_NO_PIPE: 'bots.botmatch.run.nopipe', TESTRUN_LOAD_TIMEOUT: 'bots.botmatch.run.load',
  TESTRUN_CRASH: 'bots.botmatch.run.crash', TESTRUN_HANG: 'bots.botmatch.run.crash', TESTRUN_ENGINE_EXCEPTION: 'bots.botmatch.run.crash',
  TESTRUN_MODE_MIX: 'bots.botmatch.run.modemix', WARN_TESTRUN_TEAM_UNSET: 'bots.botmatch.run.teamunset', TESTRUN_CMD_FAIL: 'bots.botmatch.run.cmd',
  TESTRUN_NO_EXE: 'bots.botmatch.run.noexe', TESTRUN_STAGE_TIMEOUT: 'bots.botmatch.run.load',
};

// the unit names of each army over every purchase stage of bot.data.lua (ext/bots lib.buys stages) -> {army: [unit]}
function listsOf(stages) {
  const out = {};
  for (const s of stages || []) for (const a of Object.keys(s.armies || {})) for (const r of s.armies[a] || []) { (out[a] = out[a] || []); if (r.unit && !out[a].includes(r.unit)) out[a].push(r.unit); }
  return out;
}

module.exports = { DIFFS, SLOTS, MAX_MIN, teamOfSlot, scenarioOf, membersOf, parsePipe, parseUserUnits, parseSlots, parseLog, parseRun, report, listsOf, RUN_KEYS };
