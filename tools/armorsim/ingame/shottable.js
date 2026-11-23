#!/usr/bin/env node
// armorsim/ingame/shottable: the in-game check of the penetration checker step 6). Reads only; writes into --out.
//   shottable plan <unit> --weapons W[:ammo],W2[:ammo] --range M [--faces front,rear,left,right] [--aim body,turret]
//             [--game G] [--mods a,b] [--folder MOD] [--samples N] [--seed N] [--wait S] [--shells file.json] [--exe as64|mowas_2] --out DIR
//       one row per shot (gun, shell, face, aimed volume, range) with the prediction of effects.effects(), and the owner's steps.
//       --exe: the game the table is for (default as64, as before): its file view (MoW:AS2: no as64/core) and the editor named in the
//       steps (as64_ed.exe, MoW:AS2 mowas_2_ed.exe; both hold dbg_interactionEvent, dbg_interactionEventInfo, v_bulletPath, con_file
//       [I: names found in the exes, the MoW:AS2 editor's event lines not yet seen in a run]). table.json keeps exe when given.
//       --exe goh: refused with one line, exit 2 (armour simulator AS2 and the 64-bit build only, owner decision 2026-11-10).
//       Writes DIR/table.json, DIR/table.md.
//   shottable compare DIR --log <game.log>
//       splits the log into shots (marker lines `> shot_N`, else one shot per `EVENT: bullet_hit`), matches each to its row and
//       writes DIR/compare.json, DIR/compare.md: events seen vs predicted, parts broken, a verdict and the RULES numbers to look at.
// Log line formats and their the game: README.md next to this file. Exit 0 done, 1 problem, 2 usage.
// Author: Imperator_Aug (ARSENAL, ia-06696468)
'use strict';
const fs = require('fs'), path = require('path');

// Engine events a script can hook (RULES.md); other EVENT names are handlers / other events.
const ENGINE = new Set(['bullet_hit', 'pierce', 'break_armor', 'break_armor_again', 'break', 'repair', 'blast_hit', 'blast']);
const FIELDS = new Set(['Position', 'Direction', 'Normal', 'Bullet', 'Effector', 'Volume', 'Component', 'Bone', 'Name', 'Data']);
// Which RULES.md rows a difference points at
const RULES = {
  bullet_hit: [24, 25, 26], pierce: ['1-23 (pen test)', 27, 28], break_armor: [28, 29, 42], break_armor_again: [28, 29, 31, 42],
  break: [30, 31, 32], repair: [31], blast_hit: [33, 36, 37, 39, 40], blast: [33, 36, 37, 38, 39, 40, 41], volume: [24, 26, 30],
  order: [25, 28, 31, 40], none: [37], part: [30, 31, 32], state: [31],
};
// the scene editor of each game (the steps name it); GoH is refused before a table is made
const EDITOR = { as64: 'as64_ed.exe', mowas_2: 'mowas_2_ed.exe' };
const r3 = x => Math.round(x * 1000) / 1000;
const lc = s => String(s == null ? '' : s).toLowerCase();

// ---------- plan ----------
function shellList(a, ctx, sim) {
  if (a.shells) {
    const J = JSON.parse(fs.readFileSync(a.shells, 'utf8'));
    return (Array.isArray(J) ? J : [J]).map(s => Object.assign({ weapon: '(json)' }, s));
  }
  const out = [];
  for (const w of String(a.weapons || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const i = w.indexOf(':'), weapon = i > 0 ? w.slice(0, i) : w, ammo = i > 0 ? w.slice(i + 1) : undefined;
    const S = sim.shellFrom({ weapon, ammo }, ctx.opts);
    if (S.error) throw new Error(S.error);
    // the reader falls back to another ammo of the gun when the asked one has no table: say so, never fire the wrong shell silently
    const words = ammo ? lc(ammo).split(/[\s.]+/).filter(x => x && !/^bullet\d*$/.test(x)) : [];
    if (words.some(x => !lc(S.ammo).split(/[\s.]+/).includes(x))) S.asked = ammo;
    if (out.some(o => o.weapon === S.weapon && o.ammo === S.ammo)) S.duplicate = true;
    out.push(S);
  }
  return out;
}

function partFacts(facts) {
  const m = new Map();
  for (const f of facts || []) {
    const x = /^part:(\S+) (\S+)/.exec(f.fact);
    if (!x) continue;
    const k = x[1], st = x[2], e = m.get(k) || { part: k, states: {} };
    e.states[st] = Math.max(e.states[st] || 0, f.chance);
    m.set(k, e);
  }
  return [...m.values()].map(e => Object.assign(e, { chance: Math.max(...Object.values(e.states)) }));
}

// The prediction a row carries: required = the engine events of the first run (no dice in the armour part), optional = events a
// script makes with a chance (part changes -> break, script blasts -> blast_hit / blast).
function predictionOf(E) {
  const required = (E.engine.events || []).filter(e => ENGINE.has(e.event)).map(e => ({ event: e.event, volume: e.volume || null, part: e.part || null, sender: e.sender || null, value: e.value }));
  const parts = partFacts(E.facts);
  const optional = [];
  for (const p of parts) optional.push({ event: 'break', part: p.part, chance: p.chance });
  for (const b of E.blasts || []) {
    if (b.source !== 'script') continue;
    if ((b.hits || []).length) optional.push({ event: 'blast_hit', chance: b.chance });
    for (const h of b.hits || []) optional.push({ event: 'blast', part: h.part || null, volume: h.volume, chance: b.chance });
  }
  return {
    required, optional, parts,
    end: E.engine.end ? { result: E.engine.end.result, volume: E.engine.end.volume || null } : null,
    ends: (E.ends || []).map(x => ({ result: x.result, volume: x.volume || null, chance: x.chance })),
    tags: (E.tags || []).map(t => ({ tag: t.tag, op: t.op, chance: t.chance })),
    blasts: (E.blasts || []).map(b => ({ source: b.source, chance: b.chance, energy: b.energy, radiusM: b.radiusM, hits: (b.hits || []).map(h => ({ volume: h.volume, part: h.part, result: h.result, chance: h.chance })) })),
    whole: E.whole || [], inputs: E.inputs || [], notFollowed: (E.notFollowed || []).map(u => u.kind + ' ' + u.name),
  };
}

function plan(a) {
  const sim = require('../sim'), fx = require('../effects'), pen = require('../pen');
  const range = Number(a.range);
  if (!isFinite(range) || range <= 0) return { usage: '--range M is required' };
  if (!a.weapons && !a.shells) return { usage: '--weapons W[:ammo],.. (or --shells file.json) is required' };
  let game = a.game;
  if (!game && !a.noGameResolve) { try { game = require('../../lib/gamedir').resolve({}).dir || undefined; } catch (e) { game = undefined; } }
  const ctx = sim.open(a.unit, Object.assign({ game, mods: a.mods ? String(a.mods).split(',').filter(Boolean) : [], folder: a.folder }, a.exe ? { exe: a.exe } : {}));
  if (ctx.error) return { error: ctx.error };
  const shells = shellList(a, ctx, sim);
  const faces = String(a.faces || 'front,rear,left,right').split(',').map(s => s.trim()).filter(Boolean);
  const want = String(a.aim || 'body,turret').split(',').map(s => s.trim()).filter(Boolean);
  // a name with no volume of its own takes the first volume whose name starts with it (body -> body1)
  const aimName = v => sim.aimVolume(ctx, v) ? v : ((ctx.vols.find(x => lc(x.name).startsWith(lc(v)) && sim.aimVolume(ctx, x.name)) || {}).name || null);
  const aims = [...new Set(want.map(aimName).filter(Boolean))];
  const missingAims = want.filter(v => !aimName(v));
  if (!aims.length) aims.push(null);
  const samples = a.samples ? Number(a.samples) : 400, seed = a.seed ? Number(a.seed) : 1, wait = a.wait ? Number(a.wait) : 20;
  const rows = [], shellNotes = [];
  for (const S of shells) if (S.asked) shellNotes.push(`asked for ${S.weapon} ammo "${S.asked}", the reader gave ${S.ammo}${S.duplicate ? ' (the same shell as another row set: those rows repeat)' : ''}`);
  for (const S of shells) for (const face of faces) for (const aim of aims) {
    const v = sim.parseView(face);
    if (!v) return { usage: 'face ' + face + ': front|rear|left|right|top|az,el' };
    const point = aim ? sim.aimVolume(ctx, aim) : null, ray = sim.rayFrom(ctx, v.az, v.el, point);
    const E = fx.effects(ctx, S, range, ray, { samples, seed, until: wait });
    const n = rows.length + 1, first = (E.engine.plates || [])[0];
    rows.push({ id: n, marker: 'shot_' + n, weapon: S.weapon, ammo: S.ammo || null, kind: S.kind || null, calibre: S.calibre,
      penetration: Math.round(pen.penetrationAt(S, range) * 10) / 10, face: v.name, az: v.az, el: v.el, aim: aim || 'centre',
      aimPoint: point ? point.map(r3) : null, firstVolume: first ? first.volume : null, rangeM: range, predicted: predictionOf(E) });
  }
  return Object.assign({ unit: a.unit, rangeM: range, samples, seed, waitS: wait, game: game || null }, a.exe ? { exe: a.exe } : {}, { folder: a.folder || null, missingAims, shellNotes, rows });
}

function evText(e) { return e.event + (e.part ? '(' + e.part + ')' : e.volume ? '[' + e.volume + ']' : ''); }
function pct(x) { return Math.round(x * 100) + '%'; }

function planMd(T) {
  const L = [`# Shot table: ${T.unit}, ${T.rangeM} m`, '',
    `Made by tools/armorsim/ingame/shottable.js from the files the checker reads (${T.folder ? 'mod folder ' + T.folder + ' over ' : ''}the game). Chances over ${T.samples} runs, seed ${T.seed}, ${T.waitS} s after the hit.`, '',
    '## Steps for the owner', '',
    '1. Start the scene editor (' + EDITOR[T.exe || 'as64'] + ' -edit multi/<any flat map>:combat). Use the editor, not a multiplayer game: the event lines are printed only for the unit selected, and the editor lets you select the enemy target; in multiplayer you can select only your own units.',
    '2. Open the console (key left of 1) and type these lines, one at a time:',
    '   - `dbg_interactionEvent 1`',
    '   - `dbg_interactionEventInfo 1`',
    '   - `v_bulletPath 1` (draws the shell path on screen, writes nothing to the log; take a screenshot if a row differs)',
    '   - `con_file 1` (on by default: every console line also goes to game.log)',
    `3. Place the target, a ${T.unit}, for the enemy player with AI control and the order hold position. Place one shooter with the gun of the row for your own player, ${T.rangeM} m away on flat ground. Turn the target so the face of the row points at the shooter (front: its nose towards the shooter; rear: its back; left: its left side; right: its right side).`,
    '4. Press START. Select the target (click it) so its events are printed.',
    '5. For each row below: type the marker of the row in the console (for example `shot_1`; the console answers that it does not know it, which is fine: the line goes into the log), then fire one shell of the row at the volume named in the row, using direct control of the shooter. Wait the seconds given above, then press Stop (the scene comes back fresh for the next row). Note anything you see that the log cannot show (fire, crew leaving, the turret stuck).',
    '6. When all rows are done, close the game and run:',
    '   `node tools/armorsim/ingame/shottable.js compare <this folder> --log <game folder>/log/game.log`',
    '   game.log is rewritten at every start, so run the compare before you start the game again.', '',
    'A row fired twice or skipped: type the marker of the row you fire next; the compare follows the markers, not the order.', ''];
  if (T.missingAims.length) L.push('Volumes asked for but not in this unit: ' + T.missingAims.join(', '), '');
  for (const s of T.shellNotes || []) L.push('Shell: ' + s, '');
  L.push('## Rows', '', '| row | marker | gun / shell | face | aim at | first volume hit | engine events predicted | shell ends | parts (chance) | tags (chance) | blasts |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of T.rows) {
    const P = r.predicted;
    L.push(`| ${r.id} | shot_${r.id} | ${r.weapon} / ${r.ammo || '-'} (${r.kind || '?'}, ${r.calibre} mm, pen ${r.penetration} mm) | ${r.face} | ${r.aim} | ${r.firstVolume || 'none'} | ${P.required.map(evText).join(', ') || 'none'} | ${P.ends.map(e => e.result + (e.volume ? ' ' + e.volume : '') + ' ' + pct(e.chance)).join(', ')} | ${P.parts.map(p => p.part + ' ' + Object.entries(p.states).map(([s, c]) => s + ' ' + pct(c)).join('/')).join(', ') || 'none'} | ${P.tags.filter(t => t.op === 'add').map(t => t.tag + ' ' + pct(t.chance)).join(', ') || 'none'} | ${P.blasts.map(b => b.source + ' ' + pct(b.chance) + ' ' + b.hits.length + ' hit').join(', ') || 'none'} |`);
  }
  L.push('', 'Tags are not printed by the engine: the compare cannot check them. Chances below 100% may or may not happen on one shot.');
  return L.join('\n') + '\n';
}

// ---------- log ----------
// Formats (README.md): `EVENT: <name>` ; `Info entity: "<name>"` + ` <Field>: <text>`
// typed console lines `> <line>` ; unknown word `atom not found : '<w>'` .
function parseLog(text) {
  const lines = String(text).split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const markers = lines.some(l => /^> shot_\d+\s*$/.test(l));
  const shots = [], counts = { lines: lines.length, events: 0, info: 0, markers: 0, console: 0, unknown: 0, unknownInShots: 0, beforeFirst: 0 };
  let cur = null, ev = null, auto = 0, inInfo = false;
  const open = (id, line) => { cur = { id, line, events: [], unknown: 0 }; shots.push(cur); ev = null; };
  lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, ''); let m;
    if ((m = /^> shot_(\d+)\s*$/.exec(l))) { counts.markers++; open(Number(m[1]), i + 1); inInfo = false; return; }
    if ((m = /^atom not found : '(shot_\d+)'$/.exec(l))) { counts.console++; return; }
    if (/^> /.test(l)) { counts.console++; inInfo = false; return; }
    if ((m = /^EVENT: (.+)$/.exec(l))) {
      counts.events++; inInfo = false;
      const name = m[1].trim();
      if (!markers && name === 'bullet_hit') open(++auto, i + 1);
      if (!cur) { counts.beforeFirst++; ev = null; return; }
      ev = { event: name, line: i + 1 }; cur.events.push(ev); return;
    }
    if ((m = /^Info entity: "(.*)"( \[frozen\])?$/.exec(l))) { counts.info++; inInfo = true; if (ev) { ev.entity = m[1]; if (m[2]) ev.frozen = true; } return; }
    if (inInfo && (m = /^  (\w+): (.*)$/.exec(l)) && FIELDS.has(m[1])) {
      counts.info++;
      if (ev) {
        const k = m[1], v = m[2];
        if (k === 'Volume') ev.volume = v; else if (k === 'Component') ev.part = v; else if (k === 'Name') ev.sender = v;
        else if (k === 'Data') { const d = /^(\S+) \((-?\d+)\)$/.exec(v); ev.value = d ? Number(d[1]) : v; }
        else if (k === 'Effector') ev.effector = v.replace(/^"|"$/g, ''); else if (k === 'Bullet') ev.bullet = v;
        else ev[k.toLowerCase()] = v;
      }
      return;
    }
    inInfo = false;
    counts.unknown++;
    if (cur) cur.unknown++;
  });
  counts.unknownInShots = shots.reduce((s, x) => s + x.unknown, 0);
  return { markers, shots, counts };
}

// ---------- compare ----------
function compareRow(row, shot) {
  const P = row.predicted, diffs = [], notes = [];
  const seenAll = shot ? shot.events : [];
  const seen = seenAll.filter(e => ENGINE.has(e.event)), other = seenAll.filter(e => !ENGINE.has(e.event)).map(e => e.event);
  const hasInfo = seen.some(e => e.entity !== undefined);
  const diff = (what, rulesKey) => diffs.push({ what, rules: RULES[rulesKey] || [] });
  if (!shot) return { row: row.id, verdict: 'not fired', seen: [], predicted: P.required.map(evText), diffs: [], notes: ['no shot in the log for this row'], other: [] };
  if (!seen.length && P.required.length) {
    diff('no engine event seen; predicted ' + P.required.map(evText).join(', ') + ' (target not selected, shell missed, or ' + (P.end ? 'a different end than ' + P.end.result : 'other end') + ')', 'none');
  }
  const used = new Array(seen.length).fill(false);
  let j = 0;
  if (seen.length) for (const r of P.required) {
    let k = j;
    while (k < seen.length && !(seen[k].event === r.event && (!r.part || !seen[k].part || lc(seen[k].part) === lc(r.part)))) k++;
    if (k < seen.length) {
      used[k] = true; j = k + 1;
      if (r.volume && seen[k].volume && lc(seen[k].volume) !== lc(r.volume) && r.event !== 'break') diff(`${r.event}: volume ${seen[k].volume} seen, ${r.volume} predicted`, 'volume');
      if (r.sender && seen[k].sender && seen[k].sender !== r.sender) diff(`${r.event}: sender ${seen[k].sender} seen, ${r.sender} predicted`, r.event);
    } else {
      const earlier = seen.findIndex((s, x) => !used[x] && s.event === r.event);
      diff(earlier >= 0 ? `order: ${evText(r)} seen earlier than predicted` : `${evText(r)} predicted, not seen`, earlier >= 0 ? 'order' : r.event);
    }
  }
  const optLeft = P.optional.map(o => Object.assign({ hit: 0 }, o));
  seen.forEach((s, x) => {
    if (used[x]) return;
    const o = optLeft.find(q => q.event === s.event && q.chance > 0 && (!q.part || !s.part || lc(q.part) === lc(s.part)) && (q.event !== 'break' || q.hit < 2));
    if (o) { o.hit++; notes.push(`${evText(s)} seen (a script makes it with chance ${pct(o.chance)})`); }
    else diff(`${evText(s)} seen, not predicted`, s.event);
  });
  for (const o of optLeft) if (o.chance >= 0.99 && !o.hit && !(o.event === 'break' && seen.some((s, x) => used[x] && s.event === 'break' && lc(s.part) === lc(o.part)))) diff(`${evText(o)} predicted in every run, not seen`, o.event);
  // parts: break count per part (Component line) -> 1 broken, 2 destroyed (RULES 31)
  const seenParts = {};
  for (const s of seen) if (s.event === 'break' && s.part) seenParts[s.part] = (seenParts[s.part] || 0) + 1;
  const partsSeen = Object.entries(seenParts).map(([part, n]) => ({ part, state: n >= 2 ? 'destroyed' : 'broken', breaks: n }));
  if (hasInfo) {
    for (const ps of partsSeen) {
      const pp = P.parts.find(p => lc(p.part) === lc(ps.part));
      if (!pp) { if (!diffs.some(d => d.what.startsWith('break(' + ps.part + ')'))) diff(`part ${ps.part} ${ps.state} seen, no chance predicted`, 'part'); continue; }
      const st = pp.states[ps.state] || 0;
      if (st === 0) diff(`part ${ps.part} ${ps.state} seen; predicted ${Object.entries(pp.states).map(([s2, c]) => s2 + ' ' + pct(c)).join('/')}`, 'state');
    }
    for (const pp of P.parts) if (pp.chance >= 0.99 && !seenParts[pp.part] && !diffs.some(d => d.what.includes('(' + pp.part + ')'))) diff(`part ${pp.part} predicted changed in every run, no break seen`, 'part');
  } else if (seen.length) notes.push('no Info lines: parts and volumes not checked (type dbg_interactionEventInfo 1)');
  if (other.length) notes.push('other EVENT names (handlers or other events, not compared): ' + [...new Set(other)].join(', '));
  if (shot.unknown) notes.push(shot.unknown + ' other log lines inside this shot (counted, not read)');
  const rules = [...new Set(diffs.flatMap(d => d.rules))];
  return { row: row.id, verdict: diffs.length ? 'differs' : 'same', seen: seen.map(evText), predicted: P.required.map(evText), partsSeen,
    partsPredicted: P.parts, diffs, rules, notes, other, tags: 'not in the log' };
}

function compare(T, parsed) {
  const byId = new Map();
  if (parsed.markers) for (const s of parsed.shots) byId.set(s.id, s);   // a marker typed twice: the last one wins
  else parsed.shots.forEach((s, i) => byId.set(i + 1, s));
  const rows = T.rows.map(r => compareRow(r, byId.get(r.id)));
  const extra = [...byId.keys()].filter(k => !T.rows.some(r => r.id === k));
  const rules = {};
  for (const r of rows) for (const n of r.rules || []) (rules[n] = rules[n] || []).push(r.row);
  return { unit: T.unit, split: parsed.markers ? 'markers' : 'order (one shot per bullet_hit)', counts: parsed.counts, extraShots: extra, rows, rules,
    summary: { same: rows.filter(r => r.verdict === 'same').length, differs: rows.filter(r => r.verdict === 'differs').length, notFired: rows.filter(r => r.verdict === 'not fired').length } };
}

function compareMd(C, T) {
  const L = [`# In-game check: ${C.unit}`, '', `Shots split by ${C.split}. Rows: ${C.summary.same} same, ${C.summary.differs} differ, ${C.summary.notFired} not fired.`,
    `Log lines: ${C.counts.lines}; event lines ${C.counts.events}, info lines ${C.counts.info}, markers ${C.counts.markers}, console ${C.counts.console}, other lines ${C.counts.unknown} (${C.counts.unknownInShots} inside shots; counted, not read), events before the first shot ${C.counts.beforeFirst}.`];
  if (C.extraShots.length) L.push(`Shots in the log with no row: ${C.extraShots.join(', ')}.`);
  L.push('', '| row | shot | verdict | events seen | events predicted | parts seen | what differs |', '|---|---|---|---|---|---|---|');
  for (const r of C.rows) {
    const t = T.rows.find(x => x.id === r.row);
    L.push(`| ${r.row} | ${t.weapon} / ${t.ammo || '-'}, ${t.face}, ${t.aim} | ${r.verdict} | ${r.seen.join(', ') || 'none'} | ${r.predicted.join(', ') || 'none'} | ${(r.partsSeen || []).map(p => p.part + ' ' + p.state).join(', ') || 'none'} | ${r.diffs.map(d => d.what).join('; ') || '-'} |`);
  }
  L.push('', '## Notes per row', '');
  for (const r of C.rows) if (r.notes.length) L.push(`- row ${r.row}: ` + r.notes.join('; '));
  L.push('', '## RULES.md numbers the differences point at', '');
  const ks = Object.keys(C.rules);
  if (!ks.length) L.push('none');
  for (const k of ks) L.push(`- rule ${k}: rows ${C.rules[k].join(', ')}`);
  L.push('', 'Tags are not printed by the engine and are not compared. A row that differs only on a part with a chance between 0 and 100% is not a difference.');
  return L.join('\n') + '\n';
}

// ---------- CLI ----------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s === '-h' || s === '--help') a.help = true;
    else if (s.startsWith('--')) { const k = s.slice(2), eq = k.indexOf('='); if (eq > 0) a[k.slice(0, eq)] = k.slice(eq + 1); else a[k] = argv[++i]; }
    else a._.push(s);
  }
  return a;
}
const HELP = `shottable: in-game check of the penetration checker (reads only; writes into --out / the table folder)
  plan <unit> --weapons W[:ammo],.. --range M [--faces front,rear,left,right] [--aim body,turret] [--game G] [--mods a,b]
       [--folder MOD] [--samples 400] [--seed 1] [--wait 20] [--shells file.json] [--exe as64|mowas_2] --out DIR
  compare DIR --log <game.log>
exit: 0 done, 1 problem, 2 usage`;
function usage(m) { process.stderr.write((m ? m + '\n' : '') + HELP + '\n'); return 2; }

function main(argv) {
  const a = parseArgs(argv), cmd = a._[0];
  if (a.help) { process.stdout.write(HELP + '\n'); return 0; }
  if (a.exe !== undefined) {
    const g = require('../../lib/games').get(a.exe);
    if (!g) return usage('--exe must be as64, mowas_2 or mowas2 (got ' + a.exe + ')');
    if (g.id === 'goh') { process.stderr.write(require('../../lib/games').notFor('shottable', 'goh', 'the armour simulator is for MoW:AS2 and the 64-bit build only', 'owner decision 2026-11-10, plan/decisions.md SOEdit') + '\n'); return 2; }
    a.exe = g.exe;
  }
  if (cmd === 'plan') {
    a.unit = a._[1];
    if (!a.unit || !a.out) return usage('plan needs <unit> and --out DIR');
    let T;
    try { T = plan(a); } catch (e) { process.stderr.write(e.message + '\n'); return 1; }
    if (T.usage) return usage(T.usage);
    if (T.error) { process.stderr.write(T.error + '\n'); return 1; }
    fs.mkdirSync(a.out, { recursive: true });
    fs.writeFileSync(path.join(a.out, 'table.json'), JSON.stringify(T, null, 1) + '\n');
    fs.writeFileSync(path.join(a.out, 'table.md'), planMd(T));
    for (const s of T.shellNotes) process.stderr.write('note: ' + s + '\n');
    process.stdout.write(`${T.rows.length} rows -> ${path.join(a.out, 'table.md')}\n`);
    return 0;
  }
  if (cmd === 'compare') {
    const dir = a._[1];
    if (!dir || !a.log) return usage('compare needs DIR and --log <game.log>');
    let T, text;
    try { T = JSON.parse(fs.readFileSync(path.join(dir, 'table.json'), 'utf8')); } catch (e) { process.stderr.write('no table.json in ' + dir + ': ' + e.message + '\n'); return 1; }
    try { text = fs.readFileSync(a.log, 'latin1'); } catch (e) { process.stderr.write('cannot read the log: ' + e.message + '\n'); return 1; }
    const C = compare(T, parseLog(text));
    fs.writeFileSync(path.join(dir, 'compare.json'), JSON.stringify(C, null, 1) + '\n');
    fs.writeFileSync(path.join(dir, 'compare.md'), compareMd(C, T));
    process.stdout.write(`same ${C.summary.same}, differs ${C.summary.differs}, not fired ${C.summary.notFired}; other log lines ${C.counts.unknown} -> ${path.join(dir, 'compare.md')}\n`);
    return 0;
  }
  return usage(cmd ? 'unknown command ' + cmd : null);
}

module.exports = { plan, planMd, parseLog, compare, compareRow, compareMd, predictionOf, ENGINE, RULES };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
