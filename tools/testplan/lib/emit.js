// Author: Imperator_Aug (ARSENAL, ia-0e5a2dba)
'use strict';
// testplan emit (README "emit and pairs"): the run rows of a plan -> runner files and commands. Starts nothing.
//   write(stack, plan, {out, cards?, weaponMm?, groupOf?, ammoBoxOf?, control?, perGame?, seed?, root?, sweepOut?})
//     -> Promise of {out, files:[{path, kind, rows}], commands:[{id, how, runner, cmd, argv, dry, needsLaunch, rows, tag?}], notes, unplaced:[{row, why}], map}
//   edrun  fire, dmgout, dmgin, crew rows -> pairs (edrun/pack.js buildPairs + packGames: 7 pairs and the control a game)
//          -> <out>/edrun/g<n>.json, <out>/edrun/run-list.md (edrun/runlist.js form), one command a game. as64 real, mowas2 --dry, goh none.
//          a fire row and a dmgout row of one entity and weapon share the fo pair; dmgin = the di pair; crew = a cr pair (task aiuse).
//          edrun cannot choose which weapon a unit fires: the fo pair is recorded against the def's first weapon only; another weapon gets its own
//          pair only when its ammo tag and the def's box list are known (pair keys ammo + ammoBox), else its rows go to notes and `unplaced`.
//   prove  spawn and move rows -> `--units a,b:human --depth spawn|move --tiny` by army, 12 units a line at most -> <out>/prove/run-list.md.
//          as64 real, mowas2 --plan, goh none. a unit with a move row runs at depth move only (move includes the spawn mark).
//   sweep  spawn rows -> <out>/sweep/names.txt + one preloadsweep `plan` command; on goh also the two text steps for the player [T].
//   <out>/map.json = {pairs:{<pair name>:{id, game, rows}}, prove:{<card>:[rows]}, sweep:{<name>:[rows]}}: how results.read finds a row.
// cmd = the line to run from the src dir; argv = the same for `node`, relative to tools/.
const fs = require('fs'), path = require('path'), os = require('os');
const pairs = require('./pairs');

const EDRUN_CHECKS = ['fire', 'dmgout', 'dmgin', 'crew'], PROVE_CHECKS = ['spawn', 'move'];
const PIPE = 'dbg_blast 1;dbg_health 1';
const PROVE_CHUNK = 12;
const ED_EXE = { as64: 'as64_ed.exe', mowas2: 'mowas_2_ed.exe' }, GAME_EXE = { mowas2: 'mowas_2.exe' };

const fwd = p => String(p).replace(/\\/g, '/');
const quote = s => (/[\s"&|<>^;()]/.test(s) || s === '' ? '"' + String(s).replace(/"/g, '\\"') + '"' : String(s));
const within = (base, p) => { const r = path.relative(path.resolve(base), path.resolve(p)); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); };
const cardParts = c => { const m = /^(.*?)(?:\(([a-z0-9]+)\))?$/.exec(String(c || '')); return { name: m[1].split('/').pop(), army: m[2] || null, full: String(c || '') }; };

function gidOf(stack) {
  if (stack.gid) return stack.gid;
  return stack.exe === 'mowas_2' || stack.exe === 'mowas2' ? 'mowas2' : stack.exe === 'goh' || stack.kind === 'goh' ? 'goh' : 'as64';
}
function canRunOf(stack) {
  const gid = gidOf(stack), c = stack.canRun || {};
  return {
    edrun: c.edrun || (gid === 'as64' ? 'run' : gid === 'mowas2' ? 'dry' : 'no'),
    prove: c.prove || (gid === 'as64' ? 'run' : gid === 'mowas2' ? 'plan' : 'score'),
  };
}
function modsOf(stack) {
  const list = (stack.mods || []).map(String).filter(Boolean), nm = stack.name || (stack.folder ? path.basename(stack.folder) : '');
  if (nm && !list.some(m => m.split(':')[0].toLowerCase() === nm.toLowerCase())) list.push(nm);
  return list;
}

// rows of the plan that a runner takes, with what each one names
function runRows(plan) {
  const items = new Map((plan.items || []).map(i => [i.id, i]));
  const out = [];
  for (const r of plan.rows || []) {
    if (!r || r.status === 'na') continue;
    if (!EDRUN_CHECKS.includes(r.check) && !PROVE_CHECKS.includes(r.check)) continue;
    const it = items.get(r.item) || null, t = r.target || {};
    const entity = t.entity || (it && (it.kind === 'entity' ? it.key || it.name : null)) || null;
    const ic = it && it.cards && it.cards.length ? (it.cards.find(c => c.buyable) || it.cards[0]) : null;
    const cp = cardParts(t.card || (ic && ic.card) || '');
    out.push({ row: r, item: it, entity, card: cp.name || null, army: t.army || cp.army || (ic && ic.army) || null, weapon: t.weapon || null, ammo: t.ammo || null, cls: (it && it.cls) || null });
  }
  return out;
}

function emitEdrun(stack, rr, opt, R) {
  const mine = rr.filter(x => EDRUN_CHECKS.includes(x.row.check));
  if (!mine.length) return;
  const can = R.can.edrun, gid = R.gid;
  const drop = (xs, why) => { for (const x of xs) R.unplaced.push({ row: x.row.id, why }); };
  if (can === 'no') {
    // the rows part made these `player` rows already; nothing is written, the note says why
    R.notes.push(`edrun: no file written for ${mine.length} fire, damage and crew rows: ${(stack.why && stack.why.edrun) || pairs.gohWhy()}. They stay player rows (checklist).`);
    drop(mine, 'edrun cannot run on this game');
    return;
  }
  const got = pairs.cardsOf(stack, opt);
  if (!got) { R.needsGame = true; R.notes.push(`edrun: no game dir, unit cards cannot be read: ${mine.length} rows not placed`); drop(mine, 'needsGame'); return; }
  const pack = require('../../edrun/pack.js');
  // one group per rep (card name): its rows by check
  const groups = new Map();
  for (const x of mine) {
    const key = x.card || x.entity;
    if (!key) { R.notes.push(`edrun: row ${x.row.id} names no entity and no card: not placed`); drop([x], 'no entity'); continue; }
    const g = groups.get(key) || groups.set(key, { key, army: x.army, entity: x.entity, item: x.item, xs: [] }).get(key);
    g.xs.push(x);
  }
  const reps = [...groups.values()].map(g => ({ name: g.key, army: pack.findCard(got.cards, g.key, g.army) ? g.army : undefined, opts: {} }));
  const b = pack.buildPairs(reps, got.cards, { groupOf: got.groupOf || undefined, weaponMm: got.weaponMm || undefined, control: opt.control });
  for (const w of b.warns) R.notes.push('edrun: ' + w);
  for (const e of b.errs) if (!/^rep /.test(e)) R.notes.push('edrun: ' + e);
  if (!b.ctl) {
    R.notes.push(`edrun: no control pair can be made on this stack (${b.errs.filter(e => /^control/.test(e)).join('; ') || 'no control card'}): no game written, ${mine.length} rows not placed`);
    drop(mine, 'no control on this stack');
    return;
  }
  const list = [];   // {kind, rep, pair, rows}
  for (const g of groups.values()) {
    const its = b.items.filter(i => i.rep === g.key), fo = its.find(i => i.kind === 'fo'), di = its.find(i => i.kind === 'di');
    const by = c => g.xs.filter(x => x.row.check === c);
    if (!fo && !di) {
      const why = b.errs.find(e => e.startsWith(`rep ${g.key}`)) || `rep ${g.key}: no pair`;
      R.notes.push(`edrun: ${why}: ${g.xs.length} rows not placed (player rows)`);
      drop(g.xs, why); continue;
    }
    // fire + dmgout: the fo pair, by weapon
    const shots = [...by('fire'), ...by('dmgout')];
    if (shots.length) {
      const order = [];
      for (const w of (g.item && g.item.weapons) || []) if (!order.includes(w)) order.push(w);
      for (const x of shots) { const w = x.weapon || ''; if (!order.includes(w)) order.push(w); }
      const first = order.find(w => shots.some(x => (x.weapon || '') === w));
      const used = order.filter(w => shots.some(x => (x.weapon || '') === w));
      for (const w of used) {
        const xs = shots.filter(x => (x.weapon || '') === w);
        if (!fo) { R.notes.push(`edrun: ${g.key}: no fire pair on this stack: ${xs.length} rows not placed`); drop(xs, 'no fire pair'); continue; }
        if (w === first) {
          list.push({ kind: 'fo', rep: g.key, pair: { ...fo.pair, watch: true }, rows: xs.map(x => x.row.id) });
          if (used.length > 1) R.notes.push(`edrun: ${g.key} has ${used.length} weapons and edrun cannot choose which one fires: the fire pair is recorded against ${w || 'its weapon'} (first of the def) [T]`);
          continue;
        }
        // another weapon: only by its ammo, with the def's whole box list (edrun removes the other box items)
        const ammo = (xs.find(x => x.ammo) || {}).ammo || null;
        let box = (xs.map(x => x.row.target && x.row.target.ammoBox).find(Array.isArray)) || null;
        if (!box && ammo && opt.ammoBoxOf) { try { box = opt.ammoBoxOf(fo.pair.shooter, w, ammo) || null; } catch (e) { box = null; } }
        if (ammo && Array.isArray(box) && box.length) {
          list.push({ kind: 'fo', rep: g.key, weapon: w, pair: { ...fo.pair, watch: true, ammo, ammoBox: box.slice() }, rows: xs.map(x => x.row.id) });
          R.notes.push(`edrun: ${g.key} weapon ${w}: pair with ammo ${ammo} and the box list, the other box items are removed so only that round is left [T: the unit then fires ${w}]`);
        } else {
          R.notes.push(`edrun: ${g.key} weapon ${w}: edrun cannot choose this weapon (${ammo ? 'box list of the def not known' : 'no ammo tag on the row'}): ${xs.length} rows (${xs.map(x => x.row.code || x.row.id).join(', ')}) not placed, they go to the player`);
          drop(xs, `edrun cannot choose weapon ${w}`);
        }
      }
    }
    const din = by('dmgin');
    if (din.length) {
      if (di) list.push({ kind: 'di', rep: g.key, pair: { ...di.pair, watch: true }, rows: din.map(x => x.row.id) });
      else { R.notes.push(`edrun: ${g.key}: no damage-in pair on this stack: ${din.length} rows not placed`); drop(din, 'no damage-in pair'); }
    }
    const crew = by('crew');
    if (crew.length) {
      if (fo && fo.pair.class !== 'infantry' && fo.pair.crew) list.push({ kind: 'cr', rep: g.key, pair: { ...fo.pair, task: 'aiuse' }, rows: crew.map(x => x.row.id) });
      else { R.notes.push(`edrun: ${g.key}: no crewed fire pair (a man, or no crew on the card): ${crew.length} crew rows not placed`); drop(crew, 'no crewed pair'); }
    }
  }
  if (!list.length) return;
  for (const i of list) { delete i.pair.name; i.pair.name = pairs.name(i.pair, i.kind); if (i.weapon && !i.pair.ammo) i.pair.name += '_w'; }
  pairs.unique(list.map(i => i.pair));
  for (const i of list) { i.pair = { name: i.pair.name, ...i.pair }; i.pair.id = pairs.id(i.pair); }
  const ctls = b.ctls.map(c => ({ ...c, id: pairs.id(c) }));
  let packed;
  try { packed = pack.packGames(list, ctls, { perGame: opt.perGame, seed: opt.seed }); }
  catch (e) { R.notes.push(`edrun: games not packed: ${e.message}`); drop(mine.filter(x => list.some(i => i.rows.includes(x.row.id))), 'not packed'); return; }
  const byName = new Map(list.map(i => [i.pair.name, i]));
  const dir = path.join(R.out, 'edrun');
  fs.mkdirSync(dir, { recursive: true });
  const dry = can !== 'run', lines = ['# testplan edrun run list', '', `stack: ${gid}, mods ${R.mods.join(',') || '(none)'}. ${dry ? 'dry: the mission is written, no game starts' : 'each line starts one editor game'}`, ''];
  const allRows = [];
  packed.games.forEach((g, n) => {
    const gname = `g${n + 1}`, file = path.join(dir, gname + '.json'), rows = [];
    fs.writeFileSync(file, JSON.stringify(g, null, 1) + '\n');
    for (const p of g) { const i = byName.get(p.name); if (!i) continue; R.map.pairs[p.name] = { id: p.id, game: gname, rows: i.rows.slice() }; rows.push(...i.rows); }
    allRows.push(...rows);
    R.files.push({ path: file, kind: 'edrun', rows });
    const argv = ['edrun/edrun.js', '--game', fwd(stack.gameDir || ''), ...(opt.root || stack.root ? ['--root', fwd(opt.root || stack.root)] : []), '--exe', ED_EXE[gid] || ED_EXE.as64,
      '--pairs', fwd(file), ...(R.mods.length ? ['--mods', R.mods.join(',')] : []), '--out', fwd(path.join(dir, gname + '-run')),
      ...(gid === 'as64' ? ['--pipe', PIPE] : []), ...(dry ? ['--dry'] : [])];
    const cmd = 'node tools/' + argv.map(quote).join(' ');
    lines.push(`## ${gname}`, `pairs: ${g.map(p => p.name).join(' ')}`, cmd, '');
    R.commands.push({ id: 'edrun-' + gname, how: 'run', runner: 'edrun', cmd, argv, dry, needsLaunch: !dry, rows });
  });
  const rl = path.join(dir, 'run-list.md');
  fs.writeFileSync(rl, lines.join('\n'));
  R.files.push({ path: rl, kind: 'runlist', rows: allRows });
  for (const w of packed.warns) if (!/backfill ran out/.test(w)) R.notes.push('edrun: ' + w);
  if (!stack.gameDir) R.notes.push('edrun: no game dir on the stack: fill --game in the commands');
  if (dry) R.notes.push(`edrun: ${gid} runs --dry only (${(stack.why && stack.why.edrun) || 'TST-19: no control pipe'}): the missions are written and checked, the rows stay with the player`);
  else R.notes.push(`edrun: all games in one go: node tools/edrun/runlist.js --list ${quote(fwd(rl))} --out ${quote(fwd(path.join(dir, 'runs')))}`);
}

function emitProve(stack, rr, opt, R) {
  const mine = rr.filter(x => PROVE_CHECKS.includes(x.row.check) && !(x.row.check === 'spawn' && x.row.runner === 'sweep'));
  if (!mine.length) return;
  const can = R.can.prove, gid = R.gid;
  if (can !== 'run' && can !== 'plan') {
    R.notes.push(`prove: no file written for ${mine.length} spawn and move rows: ${(stack.why && stack.why.prove) || 'no control pipe on this game, prove can only score a log (modweb/testing/goh-drive.md)'}. Move rows stay player rows; spawn rows go to the sweep.`);
    for (const x of mine) if (x.row.check !== 'spawn') R.unplaced.push({ row: x.row.id, why: 'prove cannot run on this game' });
    return;
  }
  const units = new Map();   // army|card -> {army, card, human, depth, rows}
  for (const x of mine) {
    if (!x.card || !x.army) {
      if (x.row.check === 'spawn' && x.entity) R.notes.push(`prove: ${x.entity} has no card or army: spawn row ${x.row.code || x.row.id} is tested by the sweep only`);
      else { R.notes.push(`prove: row ${x.row.id}: no card or army, a bot cannot buy it: not placed`); R.unplaced.push({ row: x.row.id, why: 'no card or army' }); }
      continue;
    }
    const k = x.army + '|' + x.card, u = units.get(k) || units.set(k, { army: x.army, card: x.card, human: x.cls === 'human', depth: 'spawn', rows: [] }).get(k);
    if (x.row.check === 'move') u.depth = 'move';
    u.rows.push(x.row.id);
  }
  if (!units.size) return;
  const dir = path.join(R.out, 'prove'), plan = can !== 'run';
  const lines = ['# testplan prove lines', '', plan ? `${gid}: --plan writes the fixture and scenario only, no game starts` : 'each line starts one match', ''];
  const sets = new Map();
  for (const u of units.values()) { const k = u.army + '|' + u.depth; (sets.get(k) || sets.set(k, []).get(k)).push(u); }
  const all = [];
  for (const [k, us] of [...sets.entries()].sort((a, c) => (a[0] < c[0] ? -1 : 1))) {
    const [army, depth] = k.split('|');
    for (let at = 0, n = 1; at < us.length; at += PROVE_CHUNK, n++) {
      const ch = us.slice(at, at + PROVE_CHUNK), rows = [].concat(...ch.map(u => u.rows));
      const argv = ['prove/prove.js', '--game', fwd(stack.gameDir || ''), '--army', army, '--units', ch.map(u => u.card + (u.human ? ':human' : '')).join(','), '--depth', depth, '--tiny',
        ...(R.mods.length ? ['--mods', R.mods.join(',')] : []), ...(plan ? ['--plan'] : []), ...(GAME_EXE[gid] ? ['--exe', GAME_EXE[gid]] : [])];
      const cmd = 'node tools/' + argv.map(quote).join(' '), id = `prove-${army}-${depth}-${n}`;
      lines.push(`## ${id}`, cmd, '');
      R.commands.push({ id, how: 'run', runner: 'prove', cmd, argv, dry: plan, needsLaunch: !plan, rows });
      for (const u of ch) R.map.prove[u.card] = (R.map.prove[u.card] || []).concat(u.rows);
      all.push(...rows);
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'run-list.md');
  fs.writeFileSync(f, lines.join('\n'));
  R.files.push({ path: f, kind: 'prove', rows: all });
  if (plan) R.notes.push(`prove: ${gid} gets --plan lines only (${(stack.why && stack.why.prove) || 'TST-19'}): the rows stay with the player`);
}

function emitSweep(stack, rr, opt, R) {
  const mine = rr.filter(x => x.row.check === 'spawn');
  if (!mine.length) return;
  const gid = R.gid, names = new Map();
  for (const x of mine) {
    if (!x.entity) { R.notes.push(`sweep: row ${x.row.id} names no entity: not placed`); if (!R.map.prove[x.card]) R.unplaced.push({ row: x.row.id, why: 'no entity' }); continue; }
    (names.get(x.entity) || names.set(x.entity, []).get(x.entity)).push(x.row.id);
  }
  if (!names.size) return;
  const dir = path.join(R.out, 'sweep'), f = path.join(dir, 'names.txt'), rows = [].concat(...names.values());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(f, [...names.keys()].join('\n') + '\n');
  R.files.push({ path: f, kind: 'sweep', rows });
  for (const [n, ids] of names) R.map.sweep[n] = ids;
  // the thin mod of the sweep: never inside the mod under test (preloadsweep refuses it), on GoH never among the game files
  const folder = stack.folder || '', safe = String(stack.name || path.basename(folder) || 'mod').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  let thin = opt.sweepOut || path.join(dir, 'tp_sweep_' + safe);
  if (!opt.sweepOut && folder && within(folder, thin)) {
    thin = gid !== 'goh' && stack.gameDir ? path.join(stack.gameDir, 'mods', 'tp_sweep_' + safe) : path.join(os.tmpdir(), 'tp_sweep_' + safe);
    R.notes.push(`sweep: --out lies inside the mod, where preloadsweep refuses to write: the thin mod goes to ${fwd(thin)}`);
  }
  const argv = ['preloadsweep/preloadsweep.js', 'plan', fwd(folder), '--names-file', fwd(f), '--out', fwd(thin),
    ...(stack.gameDir ? ['--game', fwd(stack.gameDir)] : []), '--exe', gid === 'mowas2' ? 'mowas_2' : gid];
  const cmd = 'node tools/' + argv.map(quote).join(' ');
  R.commands.push({ id: 'sweep-plan', how: 'run', runner: 'sweep', cmd, argv, dry: true, needsLaunch: false, rows, ...(gid === 'goh' ? { tag: '[T]' } : {}) });
  if (gid === 'goh') {
    // no control pipe on GoH: the player starts the match. preloadsweep plan prints these two lines with the real names filled in
    const text = [
      `node tools/modswitch/modswitch.js --game ${quote(fwd(stack.gameDir || '<GoH folder>'))} --profile "<GoH user dir>/profiles/<id>/options.set" --set ${safe},${path.basename(thin).toLowerCase()} --write`,
      'node tools/uidrive/uidrive.js play goh boot,skirmish',
    ];
    text.forEach((t, i) => R.commands.push({ id: 'sweep-goh-' + (i ? 'play' : 'mods'), how: 'player', runner: 'sweep', cmd: t, argv: null, dry: false, needsLaunch: false, rows, tag: '[T]', text: true }));
    R.notes.push('sweep: on Gates of Hell this is the only game step. Run the plan command, then start the two text commands yourself (the plan prints them with the real names); then: node tools/preloadsweep/preloadsweep.js read <GoH user dir>/log/game.log --plan <thin mod>/run.json [T]');
  } else R.notes.push('sweep: the plan command writes the thin mod and run.json and starts nothing; host a multiplayer match with both mods on, then preloadsweep read');
}

function write(stack, plan, opt = {}) {
  return Promise.resolve().then(() => {
    if (!stack) throw new Error('emit.write: a stack is needed');
    if (!opt.out) throw new Error('emit.write: opt.out (the folder to write) is needed');
    const out = path.resolve(opt.out);
    const R = { out, gid: gidOf(stack), can: canRunOf(stack), mods: modsOf(stack), files: [], commands: [], notes: [], unplaced: [], map: { pairs: {}, prove: {}, sweep: {} }, needsGame: false };
    const rr = runRows(plan || {});
    fs.mkdirSync(out, { recursive: true });
    if (!rr.length) R.notes.push('no run row in the plan: nothing to emit');
    emitEdrun(stack, rr, opt, R);
    emitProve(stack, rr, opt, R);
    emitSweep(stack, rr, opt, R);
    // a row dropped by one runner but placed by another is placed
    const placed = new Set([].concat(...R.files.map(f => f.rows)));
    const seen = new Set();
    R.unplaced = R.unplaced.filter(u => !placed.has(u.row) && !seen.has(u.row) && seen.add(u.row));
    const mf = path.join(out, 'map.json');
    fs.writeFileSync(mf, JSON.stringify(R.map, null, 1) + '\n');
    R.files.push({ path: mf, kind: 'map', rows: [...placed] });
    const res = { out, files: R.files, commands: R.commands, notes: R.notes, unplaced: R.unplaced, map: mf };
    if (R.needsGame) res.needsGame = true;
    return res;
  });
}

module.exports = { write, runRows, EDRUN_CHECKS, PROVE_CHECKS, PIPE, PROVE_CHUNK };
