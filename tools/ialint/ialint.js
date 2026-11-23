#!/usr/bin/env node
// ialint: interaction data linter (entity.set + interaction_terrain/effects.set trees, includes expanded)
//   node ialint.js <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary] | --vfs --game dir [--exe ..] | --vfs --exe goh
//   --exe: the game (vfs exe; no --exe: as before, as64.exe first, a GoH install found by its exe). AS64 and MoW:AS2 share the AS2 install:
//     --exe mowas_2 mounts it without as64/core. --exe goh with no --game: the GoH install (lib/games install).
//   GoH (--exe goh or a GoH install): the event set adds destroy (GHINT-17), blast_wreaked, animation_event "name", hatch open|close (GHINT-45) [V];
//     on AS64 / MoW:AS2 those four are INT_EVENT_UNKNOWN with a GoH-only note. GoH's 16-bit event index (GHINT-30) needs no rule: ialint has no 255 cap check.
//     GoH WARN_FIRE_PLACE: the place names come from the mounted GoH vanilla data (--game, or the GoH install found for --exe goh); the AS2 list does not apply, so no check without it.
// rows INT-02,04,05,08,10,11,15,17,20*)
//   INT_EVENT_DUP (02)   INT_CALL_UNDEFINED (04)   INT_TERRAIN_BULLET (05)   INT_USE_BLEND_TEX (08)
//   INT_FLAG_OVERFLOW (10, >128 flag names engine-wide)   INT_ABLE_OVERFLOW (11, >32)
//   INT_LOG_NOOP INT_RTFUNC INT_KICK_NOOP (15)   INT_KILL_DELAY_EMPTY (17)   INT_EXPLODE_TINY (20)
// rows INT-23,24,07,03,13,01,21 GPL-07 HUM-06 (CHK-IA, handler context):
//   INT_EVENT_UNKNOWN (23, `{on word}` outside the 30 engine events; quoted names are custom)   INT_GROUND_MIN_ENERGY (24)
//   INT_HITSIDE_NOBULLET (07, hit_side left/right/top/bottom outside bullet_hit/pierce, or top/bottom in delay_ex)
//   INT_DELAYEX_LOST (03, effector / hit_side left/right in delay_ex)   INT_DELAY_CTX_LOST (13, volume/part conditions in delay or a delay_effect handler)
//   WARN_DELAY_BULLET (GPL-07, stuff/hit_side in a delay body)   INT_HEALTH_NO_DIE (HUM-06, no {die} reachable by quoted names)
//   WARN_TAG_ADD_BLOCK (01, tag added that names another block and is never tested with tagged)   WARN_FIRE_PLACE (21, fire place not in vanilla list / mod defs' place names)
// flag names =`set "x"` + string right after if/else/not; able names = names in `{able ..}` + string after `able` in a condition.
// --vfs (vanilla baseline): findings are real dead code in vanilla (kick/log no-ops, use_blend_tex, 3 undefined calls, terrain bullet) -> printed as info.
// lib gap: none; the block/token shape comes from lib/sdlx via keylint/model.parts (MOD forms transparent).
// Author: Imperator_Aug (ARSENAL, ia-97bd3896)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const sdlset = require('../lib/sdlset'), sdlx = require('../lib/sdlx');
const { createReport, relPath } = require('../lib/report');
const M = require('../keylint/model');

const ENTITY_ROOT = 'resource/set/interaction_entity/entity.set', TERRAIN_ROOT = 'resource/set/interaction_terrain/effects.set';
const FLAG_MAX = 128, ABLE_MAX = 32;
// INT-23: the closed event set of ReadEvent; a quoted first token is a custom event
const EVENTS = new Set('break repair pierce bullet_hit blast_hit blast break_armor break_armor_again blow contact overlap ground_hit grounded terrain_pp terrain_fx animation_end operatable spawn crew board move turn brake accelerate engine swim fire ik movement_mode_changed inflammation_time'.split(' '));
// GHINT-17, GHINT-45 [V] (gohweb interaction/goh-ia-condition-event-set, GoH ): events GoH adds
const GOH_EVENTS_ADDED = ['destroy', 'blast_wreaked', 'animation_event', 'hatch'];
const EVENTS_GOH = new Set([...EVENTS, ...GOH_EVENTS_ADDED]);
// INT-21: weapon place names the vanilla interaction data hooks with `{on fire "x"}` (read from vanilla entity.set); a mod's own `place` names come from its .def files
const VANILLA_PLACES = new Set('charge flamer1 flamer2 flamer3 flamer4 flamer5 gun gun2 hand_right mgun mgun1 mgun2 mgun3 mgun_linked1 mgun_linked2 mgun_linked3 mgun_linked4 mgun_own1 mgun_own2 mgun_own3 mgun_own4 zenite'.split(' '));
const tokText = t => t.k === 'STRING' ? t.value : t.k === 'IDENT' ? t.text : null;
const lc = t => { const s = tokText(t); return s === null ? null : s.toLowerCase(); };

function check(opts) {
  const rep = createReport();
  let mods = opts.mods;
  const path = require('path');
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];
  const src = sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: opts.exe });
  const game = opts.exe || (src.v && src.v.exe) || null, goh = game === 'goh';
  const EV = goh ? EVENTS_GOH : EVENTS;
  const vfsMode = !!opts.vfs;
  const mine = new Set(); for (const f of src.local.values()) mine.add(relPath(src.folder, f));
  const isMine = f => vfsMode || mine.has(f) || src.isModKey(f);
  const loc = n => {
    if (isMine(n.file)) return { file: n.file, line: n.line, note: '' };
    let x = n.via; while (x && !isMine(x.file)) x = x.via;
    return x ? { file: x.file, line: x.line, note: ` [from ${n.file}:${n.line}]` } : null;
  };
  const done = new Set();
  // vanilla dead-code baseline (kick/log no-ops, use_blend_tex, bullet, 3 undefined calls): a mod shipping copies of
  // those files inherits them -> info while the per-(code,call) vanilla count lasts; extras are counted
  const BASE = new Set(['INT_KICK_NOOP', 'INT_LOG_NOOP', 'INT_USE_BLEND_TEX', 'INT_TERRAIN_BULLET', 'INT_CALL_UNDEFINED', 'WARN_TAG_ADD_BLOCK']);
  // budget per (code, call, source file): new dead code a mod adds to a copied vanilla file is counted, not hidden by vanilla hits in other files (COV-LINT ialint-blend)
  const nfile = f => { const x = String(f || '').toLowerCase().replace(/\\/g, '/'), i = x.lastIndexOf('resource/'); return i < 0 ? x : x.slice(i); };
  const bkey = (code, msg, file) => code + (code === 'INT_CALL_UNDEFINED' ? (msg.match(/^call "([^"]*)"/) || [])[1] : '') + '@' + nfile(file);
  let budget = null, vanFires = null;   // vanFires: the {on fire "x"} places of the mounted vanilla data (GoH: its own place names)
  if (!vfsMode && opts.gameDir) {
    budget = new Map();
    const van = check({ vfs: true, gameDir: opts.gameDir, exe: opts.exe }); vanFires = van.fireNames;
    for (const i of van.rep.toJSON({ tool: 'ialint' }).info) if (BASE.has(i.code)) { const k = bkey(i.code, i.msg, i.file); budget.set(k, (budget.get(k) || 0) + 1); }
  }
  const emit = (n, code, msg) => {
    const l = loc(n); if (!l) return; const dk = l.file + ':' + l.line + ':' + code + msg; if (done.has(dk)) return; done.add(dk);
    const k = bkey(code, msg, n.file);
    if (budget && BASE.has(code) && budget.get(k) > 0) { budget.set(k, budget.get(k) - 1); return rep.info(l.file, l.line, code, msg + l.note + ' (same dead code exists in vanilla)'); }
    (vfsMode ? rep.info : rep.add)(l.file, l.line, code, msg + l.note);
  };

  const flags = new Map(), ables = new Map();   // name -> first node
  const calls = [], handlers = new Set();
  let files = 0, curBlock = null;
  // CHK-IA: handler-context checks (INT-23 INT-24 INT-07 INT-03 INT-13 GPL-07 HUM-06 INT-01 INT-21)
  const blockTags = new Set(), taggedTests = new Set(), tagAdds = [], delayEffects = [], named = new Map(), healthNodes = [], fires = [];
  const kidsOf = n => M.parts(n, false).kids;
  const keyOf = n => { const k = M.parts(n, false).keyTok; return k && k.k === 'IDENT' ? k.text.toLowerCase() : null; };
  const isKw = x => x.k === 'IDENT' && ['if', 'else'].includes(x.text.toLowerCase());
  const condsOf = n => {   // [{name,args}] of an if node's branches (`not` skipped)
    const t = n.items.filter(x => x.k !== 'BLOCK'), out = [];
    for (let i = 0; i < t.length; i++) { if (!isKw(t[i])) continue; let j = i + 1; if (t[j] && lc(t[j]) === 'not') j++; if (t[j]) out.push({ name: lc(t[j]), args: [t[j + 1] && lc(t[j + 1]), t[j + 2] && lc(t[j + 2])] }); }
    return out;
  };
  const DELAYS = new Set(['delay', 'delay_ex', 'delay_effect']);
  const VOL_CONDS = new Set(['volume', 'volume_armored', 'volume_bone_level', 'component']), BULLET_CONDS = new Set(['stuff', 'hit_side']);
  const BULLET_EV = new Set(['bullet_hit', 'pierce']), SIDES = new Set(['left', 'right', 'top', 'bottom']);
  function delayScan(d, kind, ctxCode) {   // body of one delay-like block; nested delays are scanned on their own
    for (const k of kidsOf(d)) {
      const kk = keyOf(k);
      if (DELAYS.has(kk)) { if (kk !== 'delay_effect') delayScan(k, kk); continue; }
      if (kk === 'if') for (const c of condsOf(k)) {
        const side = c.name === 'hit_side' ? c.args[0] : null;
        if (kind === 'delay_ex') {
          if (c.name === 'effector' || side === 'left' || side === 'right') emit(k, 'INT_DELAYEX_LOST', `delay_ex drops the instigator and bone: \`${c.name}${side ? ' ' + side : ''}\` is always false in its body; test it before the delay`);
          else if (side === 'top' || side === 'bottom') emit(k, 'INT_HITSIDE_NOBULLET', `hit_side ${side} inside delay_ex: the bullet is dropped, only front/back by position work; test it before the delay`);
        } else if (kind === 'delay') {
          if (BULLET_CONDS.has(c.name)) emit(k, 'WARN_DELAY_BULLET', `delay body reads \`${c.name}\` but delay runs a fresh command (no bullet/ammo) and a re-run restarts it, never stacks: test before the delay or use delay_ex`);
          else if (VOL_CONDS.has(c.name)) emit(k, 'INT_DELAY_CTX_LOST', `delay body reads \`${c.name}\` but delay starts a fresh command (no volume/part): test before the delay or use delay_ex`);
        }
      }
      delayScan(k, kind);
    }
  }
  function handlerChecks(h, ev) {   // ev: lower-case event word, null = custom quoted name
    const rec = n => {
      for (const k of kidsOf(n)) {
        const kk = keyOf(k);
        if (DELAYS.has(kk)) {
          if (kk !== 'delay_effect') delayScan(k, kk);
          else { const s = M.parts(k, false).toks.filter(x => x.k === 'STRING').pop(); if (s) delayEffects.push({ nm: s.value.toLowerCase(), node: k }); }
          continue;
        }
        if (kk === 'if') for (const c of condsOf(k)) {
          if (c.name === 'tagged' && c.args[0]) taggedTests.add(c.args[0]);
          if (ev === 'ground_hit' && c.name === 'min_energy') emit(k, 'INT_GROUND_MIN_ENERGY', 'ground_hit passes a negative value (-speed): min_energy (value > N) is never true; test velocity instead');
          if (c.name === 'hit_side' && SIDES.has(c.args[0]) && ev !== null && !BULLET_EV.has(ev)) emit(k, 'INT_HITSIDE_NOBULLET', `hit_side ${c.args[0]} in a \`${ev}\` handler: no bullet in the command, only front/back by position work; use bullet_hit or pierce`);
        }
        if (kk && kk.startsWith('health_damage')) healthNodes.push({ node: k, h });
        if (kk === 'tags') { const t = M.parts(k, false).toks; if (t[0] && lc(t[0]) === 'add' && t[1] && t[1].k === 'STRING') tagAdds.push({ nm: t[1].value.toLowerCase(), node: k, own: curBlock }); }
        rec(k);
      }
    };
    rec(h);
  }

  function walk(node, ctx, isRoot) {
    const p = M.parts(node, isRoot);
    const key = p.keyTok && p.keyTok.k === 'IDENT' ? p.keyTok.text.toLowerCase() : null;
    const all = p.toks;
    if (key === 'on') {
      const nm = all[0] && lc(all[0]);
      if (nm !== null) handlers.add(nm);
      if (ctx === 'entity' && nm !== null) {
        if (all[0].k === 'STRING') { if (!named.has(nm)) named.set(nm, []); named.get(nm).push(node); }
        else if (!nm.includes('%') && !EV.has(nm)) emit(node, 'INT_EVENT_UNKNOWN', `\`{on ${nm}}\` is not an engine event (${EV.size} are known, see the header); the game refuses the file at load. ` + (GOH_EVENTS_ADDED.includes(nm) ? `It is a GoH-only event (${nm === 'destroy' ? 'GHINT-17' : 'GHINT-45'}): rewrite it for this game${nm === 'destroy' ? ' (destroy: break also runs for a destroyed part)' : ''}` : `Quote it for a custom event: {on "${nm}"}`));
        if (all[0].k === 'STRING' || !nm.includes('%')) handlerChecks(node, all[0].k === 'IDENT' ? nm : null);
        if (nm === 'fire' && all[1] && all[1].k === 'STRING') fires.push({ nm: all[1].value.toLowerCase(), node });
      }
      if (ctx === 'terrain' && nm === 'bullet') emit(node, 'INT_TERRAIN_BULLET', 'terrain event `bullet` is never fired; use hit/detonate');
    }
    if (key === 'entities' && ctx === 'entity') for (const k of p.kids) { const kp = M.parts(k, false); if (kp.keyTok && kp.keyTok.k === 'STRING') for (const w of kp.keyTok.value.toLowerCase().split(/\s+/)) if (w) blockTags.add(w); }
    // duplicate `on` in one block
    const seen = new Map();
    p.kids.forEach((k, i) => {
      const kp = M.parts(k, false);
      if (!kp.keyTok || kp.keyTok.k !== 'IDENT' || kp.keyTok.text.toLowerCase() !== 'on' || !kp.toks[0]) return;
      const nm = kp.toks.map(lc).join(' '); if (kp.toks.some(t => lc(t) === null)) return;
      const prev = seen.get(nm) || [];
      for (const q of prev) if (q.g === p.groups[i] || !q.g || !p.groups[i]) { emit(k, 'INT_EVENT_DUP', `event "on ${nm}" already defined in this block (line ${q.n.line}); merge into one handler`); break; }
      prev.push({ g: p.groups[i], n: k }); seen.set(nm, prev);
    });
    switch (key) {
      case 'use_blend_tex': emit(node, 'INT_USE_BLEND_TEX', 'use_blend_tex is not supported (logs, no effect)'); break;
      case 'log': emit(node, 'INT_LOG_NOOP', '`log` does nothing; use `con`'); break;
      case 'rtfunc': emit(node, 'INT_RTFUNC', '`rtfunc` only warns "does not work"'); break;
      case 'kick_entity_manager': emit(node, 'INT_KICK_NOOP', '`kick_entity_manager` is a no-op'); break;
      case 'kill_delay': if (all[0] && all[0].k === 'STRING' && all[0].value === '') emit(node, 'INT_KILL_DELAY_EMPTY', 'kill_delay with empty name is an error'); break;
      case 'call': if (all[0]) { const nm = lc(all[0]); if (nm !== null && !nm.includes('%')) calls.push({ nm, node }); } break;
      case 'set': if (ctx === 'entity' && all[0] && all[0].k === 'STRING') addName(flags, all[0].value, node); break;
      case 'able': if (ctx === 'entity') for (const t of all) if (t.k === 'STRING' || (t.k === 'IDENT' && t.text[0] !== '%')) addName(ables, tokText(t), node); break;
      case 'explode_inventory': for (const k of p.kids) { const kp = M.parts(k, false); const a = kp.keyTok; if (a && (a.k === 'INTEGER' || a.k === 'FLOAT') && !a.expr && a.value <= 0.1) emit(k, 'INT_EXPLODE_TINY', `explode_inventory entry amount ${a.text} <= 0.1 can never match (shares <= 0.1 are ignored)`); } break;
    }
    if (key === 'if' || key === 'else') { /* if is a block key; else is a token inside it (below) */ }
    if (key === 'if' && ctx === 'entity') {
      const t = node.items.filter(x => x.k !== 'BLOCK');   // [if, (not) cond..., else, ...]; MOD-free in practice
      for (let i = 0; i < t.length; i++) {
        const isKw = x => x.k === 'IDENT' && ['if', 'else'].includes(x.text.toLowerCase());
        if (!isKw(t[i])) continue;
        let j = i + 1;
        if (t[j] && t[j].k === 'IDENT' && t[j].text.toLowerCase() === 'not') j++;
        if (t[j] && t[j].k === 'STRING') addName(flags, t[j].value, node);
        else if (t[j] && t[j].k === 'IDENT' && t[j].text.toLowerCase() === 'able' && t[j + 1] && t[j + 1].k === 'STRING') addName(ables, t[j + 1].value, node);
      }
    }
    for (const k of p.kids) {
      if (key === 'entities' && ctx === 'entity') { const kt = M.parts(k, false).keyTok; curBlock = kt && kt.k === 'STRING' ? new Set(kt.value.toLowerCase().split(/\s+/)) : null; }
      walk(k, ctx, false);
    }
    if (key === 'entities') curBlock = null;
  }
  function addName(map, name, node) { name = name.toLowerCase(); if (!map.has(name)) map.set(name, node); }

  function load(key, ctx) {
    const b = src.get(key); if (!b) return;
    files++;
    const t = sdlx.read(b, { file: src.local.has(key) ? relPath(src.folder, src.local.get(key)) : key, key, open: src.open, onError() {}, preInclude: src.preInclude(key) });
    if (t && t.root) walk(t.root, ctx, true);
  }
  load(ENTITY_ROOT, 'entity'); load(TERRAIN_ROOT, 'terrain');

  // delay_effect: the named handler runs with a fresh command (INT-13)
  const lostIn = (h, seen) => { const r = []; const go = n => { for (const k of kidsOf(n)) { if (keyOf(k) === 'if') for (const c of condsOf(k)) if (BULLET_CONDS.has(c.name) || VOL_CONDS.has(c.name)) r.push(c.name); go(k); } }; go(h); return r; };
  for (const d of delayEffects) for (const h of named.get(d.nm) || []) { const r = lostIn(h); if (r.length) emit(d.node, 'INT_DELAY_CTX_LOST', `delay_effect "${d.nm}" runs a fresh command but its handler reads \`${r[0]}\` (no bullet/volume): capture it before the delay or use delay_ex`); }
  // HUM-06: a health_damage command only lowers health; some handler reachable from it (by quoted name) must run {die}
  const dies = (start) => {
    const seen = new Set(), stack = [start];
    while (stack.length) {
      const n = stack.pop(); if (keyOf(n) === 'die') return true;
      const p = M.parts(n, false);
      for (const t of p.toks) if (t.k === 'STRING') { const nm = t.value.toLowerCase(); if (!seen.has(nm)) { seen.add(nm); for (const h of named.get(nm) || []) stack.push(h); } }
      for (const k of p.kids) stack.push(k);
    }
    return false;
  };
  for (const h of healthNodes) if (!dies(h.node) && !dies(h.h)) emit(h.node, 'INT_HEALTH_NO_DIE', 'health damage never kills by itself: no {die} is reachable from this handler (calls, effects, delays); the unit stays alive at 0 health');
  // INT-01: block tags are matched once against the entity description
  for (const t of tagAdds) if (blockTags.has(t.nm) && !taggedTests.has(t.nm) && !(t.own && t.own.has(t.nm))) emit(t.node, 'WARN_TAG_ADD_BLOCK', `\`tags add "${t.nm}"\` cannot switch a block on: blocks are matched once from the definition tags (a block "${t.nm}" exists, this block does not carry it, and nothing tests the tag with \`tagged\`); only \`tagged\` sees run-time tags`);
  // INT-21: only with --game (or vanilla itself, always known places); the mod's own def places are added
  // GoH: the AS2 place list does not apply; the places come from the mounted GoH vanilla data (--game), none known without it: no check
  if (fires.length && !vfsMode && (!goh || vanFires)) {
    const places = new Set(goh ? vanFires : VANILLA_PLACES);
    for (const it of src.folderItems()) {
      if (!/\.(def|ext|inc)$/i.test(it.key)) continue;
      try { const t = sdlx.read(it.get(), { file: it.file, key: it.key, open: src.open, onError() {} }); const w = n => { const p = M.parts(n, false); if (p.keyTok && p.keyTok.k === 'IDENT' && p.keyTok.text.toLowerCase() === 'place' && p.toks[0] && p.toks[0].k === 'STRING') places.add(p.toks[0].value.toLowerCase()); for (const k of p.kids) w(k); }; if (t && t.root) w(t.root); } catch (x) { /* unreadable def: its places stay unknown */ }
    }
    for (const f of fires) if (!places.has(f.nm)) emit(f.node, 'WARN_FIRE_PLACE', `{on fire "${f.nm}"}: no weapon place of that name is known (vanilla places + the places in this folder's defs); the owner's fires table is looked up by place name, a wrong name never fires`);
  }
  for (const c of calls) if (!handlers.has(c.nm)) emit(c.node, 'INT_CALL_UNDEFINED', `call "${c.nm}": no \`{on ${c.nm}}\` handler exists in the interaction data (silent no-op)`);
  const over = (map, max, code, what) => {
    if (map.size <= max) return;
    let any = false, i = 0;
    for (const [nm, n] of map) { if (++i > max && loc(n)) { emit(n, code, `${what} "${nm}" is #${i}: more than ${max} distinct names engine-wide (${map.size} total) overflows`); any = true; } }
    if (!any) rep.add(ENTITY_ROOT, 0, code, `${map.size} distinct ${what} names (max ${max})`);
  };
  over(flags, FLAG_MAX, 'INT_FLAG_OVERFLOW', 'flag'); over(ables, ABLE_MAX, 'INT_ABLE_OVERFLOW', 'able');
  rep.info('ialint', 0, 'STATS', `${flags.size} flag names, ${ables.size} able names, ${handlers.size} handler names`);
  const local = [...src.local.keys()].filter(k => /(^|\/)set\/interaction_(entity|terrain)\//i.test(String(k).replace(/\\/g, '/'))).length;
  return { rep, files, local, fireNames: [...new Set(fires.map(x => x.nm))] };
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli'), games = require('../lib/games');
if (require.main === module) {
  const args = process.argv.slice(2), o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i];
    else if (a === '--exe') { const x = args[++i], g = games.get(x); if (!g || /\.exe$/i.test(String(x))) { console.error('ialint: --exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = g.exe; }
    else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--vfs') o.vfs = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (!o.gameDir && o.exe === 'goh') o.gameDir = games.install('goh').dir || undefined;   // --exe goh with no --game: the GoH install (folder and --vfs mode)
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { if (o.vfs && !o.gameDir && o.exe === 'goh') console.error('ialint: no GoH install found (set GOH_GAME or give --game)'); console.error('usage: ialint <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary] | --vfs --game dir [--exe ..] | --vfs --exe goh'); process.exit(2); }
  const { rep, files, local } = check(o);
  // no-data notice (COV-LINT: was silent on an empty folder): roots loaded + interaction files the folder itself provides
  console.error(!files ? 'ialint: 0 files read (no entity.set / effects.set found: give --game, or a folder with resource/set/)'
    : `ialint: ${files} root files read, ${o.vfs ? 'vanilla baseline' : local + ' interaction files from the folder'}${!o.vfs && !local ? ' (0 files from the folder: nothing of the mod linted)' : ''}`);
  rcPrint(rep, o, o.folder || o.gameDir, 'ialint', { showInfo: !o.q, byCode: true, summary: o.summary });
}
module.exports = { check, EVENTS, EVENTS_GOH, VANILLA_PLACES };
