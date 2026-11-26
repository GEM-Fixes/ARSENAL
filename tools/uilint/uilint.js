#!/usr/bin/env node
// uilint: UI data linter: command panels, action files, keys.set, fonts.   rows UI-03,06,07,08,09,10,11,12,13,14,15,16
//   node uilint.js <mod folder> [--game <gameDir>] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [-q] [--summary]
//   node uilint.js --vfs --game <gameDir> [--exe ..] | --vfs --exe goh      every file of the whole vfs (vanilla consistency run)
// codes: PICTURE_MISSING (UI-03) ACTION_INSTRUCTION_UNKNOWN (06) PANEL_SPECIAL_UNLOADED (07) PANEL_CONDITION_UNKNOWN (08)
//   PANEL_CELL_CLASH PANEL_CELLS_FULL WARN_PANEL_CELL_RANGE (09) PANEL_ITEM_UNKNOWN (10) KEYS_TOKEN_UNKNOWN (11) KEYS_MOUSE_MIDDLE (12)
//   KEYS_PATH_UNREACHED (13) KEYS_ACTION_NO_HOTKEY (14) WARN_KEYS_ID_UNREAD (15) FONT_MAIN10_MISSING FONT_SIZE_RANGE
//   WARN_FONT_BINARY_MISSING (16). info: KEYS_PROFILE_OVERRIDE (13)
//   --exe as64|mowas_2|mowas2|goh: the game (vfs exe; no --exe: as before, as64.exe first, a GoH install found by its exe). AS64 and
//     MoW:AS2 share the AS2 install: --exe mowas_2 mounts it without as64/core. --exe goh with no --game: the GoH install (lib/games).
//   GoH rules (tables.js GOH): compiled actions + airstrike teleport mine_ap mine_at, no hard-coded barricade barbwire hedgehog, every
//     {Action "name"} of interface/action/fortify.set is an action; 7 more panel item types; instructions + action_reset
//     remove_from_inventory install_begin install_end; panel conditions: 8 code-panel tags + `-<tag>` (GHUI-75), any other term is
//     info PANEL_CONDITION_TAG (layout bars read it as a unit tag or ability name, GHUI-76); all 6 panel lists load (no
//     PANEL_SPECIAL_UNLOADED); a {Key "id"} in an action file makes that keys.set id read (no KEYS_ACTION_NO_HOTKEY / WARN_KEYS_ID_UNREAD);
//     `plant` does nothing (WARN_PLANT_NOOP, GHINT-11); button pictures are info only [I]. AS2 games: a keys.set {"category" ..} is info
//     KEYS_CATEGORY_IGNORED (GHUI-251: GoH-only)
//   --restore-points  also read <mod folder>/.arsenal-undo (restore points; the game never mounts them, so off by default)
//   CLI lists the folder once and reads the walked files through the thread pool (checkAsync); check() = same findings, one at a time
// files: set/panel_control/*.set, interface/action/*.set, **/keys.set, interface/font/*.font. context (compiled action names,
// pictures, fonts) comes from the whole vfs + folder, so a mod folder is judged against the data it would be mounted over.
// Author: Imperator_Aug (ARSENAL, ia-e4069c86)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const sdlset = require('../lib/sdlset');
const { createReport, relPath } = require('../lib/report');
const T = require('./tables'), fast = require('../strlint/fastread');

const lc = s => String(s).toLowerCase();
const tokText = t => t.k === 'STRING' ? t.value : t.text;
// block shape: name = first non-block item (any MOD branch kept), kids = enabled child blocks, toks = remaining tokens
function parts(b) {
  const items = [];
  (function fl(list) { for (const it of list) { if (it.k === 'MOD') fl(it.items); else items.push(it); } })(b.items);
  let i = 0, name = null;
  if (items.length && items[0].k !== 'BLOCK') { name = items[0]; i = 1; }
  const toks = [], kids = [];
  for (; i < items.length; i++) { if (items[i].k === 'BLOCK') { if (!items[i].disabled) kids.push(items[i]); } else toks.push(items[i]); }
  return { name, nm: name ? lc(tokText(name)) : '', toks, kids };
}
const topBlocks = root => { const out = []; for (const it of root.items) { if (it.k === 'BLOCK' && !it.disabled) out.push(it); else if (it.k === 'MOD') for (const j of it.items) if (j.k === 'BLOCK' && !j.disabled) out.push(j); } return out; };
const base = k => k.slice(k.lastIndexOf('/') + 1);

const kinds = { panel: /^resource\/set\/panel_control\/[^/]+\.set$/, action: /^resource\/interface\/action\/[^/]+\.set$/, keys: /(^|\/)keys\.set$/, font: /^resource\/interface\/font\/[^/]+\.font$/ };
const PROFILE_RE = /^resource\/interface\/profile\//;
const walked = key => PROFILE_RE.test(key) || Object.keys(kinds).some(n => kinds[n].test(key));   // keys the main loop reads
// the check as steps: yields a Promise only while a read-ahead file (io.ra, async run) is still being read
function* steps(opts, io) {
  const rep = createReport();
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];
  const ra = io && io.ra;
  // each walked file and each include read once per run (fastread)
  const F = fast.wrap(sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: opts.exe, ...fast.srcOpts(opts) }), ra), src = F.src;
  const vfsMode = !!opts.vfs;
  const goh = (opts.exe || (src.v && src.v.exe)) === 'goh';
  const G = goh ? { ...T, ...T.GOH } : T;   // the game's tables (AS64 and MoW:AS2: the AS2 tables)
  const keys = new Set([...(src.v ? src.v.files.keys() : []), ...src.local.keys()]);
  const items = new Map();
  if (vfsMode) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }

  // ---- context from data
  const customActions = new Set(), allActions = new Set(G.ACTIONS);
  for (const k of keys) { const m = /^resource\/interface\/action\/([^/]+)\.set$/.exec(k); if (m) { allActions.add(m[1]); if (!G.ACTIONS.has(m[1])) customActions.add(m[1]); } }
  // GoH: each {Action "name"} of fortify.set is an action (ui/goh-action-set-keys); {Key "id"} in any action file names its keys.set id
  const actionKeys = new Set();
  if (goh) for (const k of keys) if (/^resource\/interface\/action\/[^/]+\.set$/.test(k)) {
    const b = src.get(k); if (!b) continue;
    let r0; try { r0 = require('../lib/sdlx').read(b, { file: k, key: k, open: src.open, onError() {} }); } catch (e) { continue; }
    for (const top of topBlocks(r0.root)) {
      const tp = parts(top); if (tp.nm !== 'action') continue;
      const s = tp.toks.find(x => x.k === 'STRING');
      if (s && k === 'resource/interface/action/fortify.set' && !s.value.includes('%')) { allActions.add(lc(s.value)); customActions.add(lc(s.value)); }
      for (const c of tp.kids) { const p = parts(c); const v = p.toks.find(x => x.k === 'STRING'); if (p.nm === 'key' && v) actionKeys.add(v.value); }
    }
  }
  const pcDir = 'resource/interface/scene/panel_control/';
  const pics = new Set();   // stems that exist: name.ext, name_NN.ext
  for (const k of keys) if (k.startsWith(pcDir)) { const b = k.slice(pcDir.length).replace(/\.[^./]*$/, ''); pics.add(b); pics.add(b.replace(/_?[0-9]+$/, '')); }
  const listed = new Set();   // names any panel_control file lists (a picture only matters for those)
  for (const k of keys) if (/^resource\/set\/panel_control\/[^/]+\.set$/.test(k)) {
    const b = src.get(k); if (!b) continue;
    const r0 = require('../lib/sdlx').read(b, { file: k, key: k, open: src.open, onError() {} });
    for (const top of topBlocks(r0.root)) for (const c of parts(top).kids) { const p = parts(c); if (p.name) listed.add(lc(tokText(p.name))); }
  }
  const rd = t => { try { return src.read(t, () => {}); } catch (e) { return null; } };
  const mine = t => items.has(t) ? items.get(t) : null;

  let nfiles = 0;
  const known = new Set(T.CODE_KEY_IDS);   // plus every id vanilla ships
  if (src.v) for (const [k, r] of src.v.files) if (/(^|\/)keys\.set$/.test(k) && !src.isModKey(k) && !src.local.has(k)) {
    const root = rd({ key: k, file: k, get: () => src.readVfs(k) }); if (!root) continue;
    for (const b of topBlocks(root.root)) for (const c of parts(b).kids) { const p = parts(c); if (p.name && p.name.k === 'STRING') known.add(p.name.value); }
  }

  if (ra) for (const [key, t] of items) if (walked(key) && t.path) ra.add(key, t.path);
  for (const [key, t0] of items) {
    if (!walked(key)) continue;
    if (ra && t0.path) { const w = ra.wait(key); if (w) yield w; }
    try { checkFile(key, F.item(t0)); } finally { F.done(t0); }
  }
  function checkFile(key, t) {
    const kind = Object.keys(kinds).find(n => kinds[n].test(key));
    const r = rd(t); if (!r) return;
    nfiles++;
    const rel = t.file;
    if (!kind) return;
    const tops = topBlocks(r.root);
    if (kind === 'panel') panel(key, rel, tops);
    else if (kind === 'action') action(key, rel, tops);
    else if (kind === 'keys') keysSet(key, rel, tops);
    else font(key, rel, tops);
  }
  // singular profile dir (UI-13): any file there is never reached
  for (const key of items.keys()) if (/^resource\/interface\/profile\//.test(key) && !kinds.keys.test(key)) rep.add(items.get(key).file, 0, 'KEYS_PATH_UNREACHED', `'interface/profile/' (singular) is never read; use interface/profiles/<id>/ (UI-13)`);
  fontsGlobal();
  // UI-18: a shipped profiles/<id>/settings.set is never read (settings load from the user profile only)
  if (!vfsMode) for (const key of [...items.keys()].sort()) if (/^resource\/interface\/profiles\/[^/]+\/settings\.set$/.test(key))
    rep.add(items.get(key).file, 0, 'WARN_SETTINGS_SET_IGNORED', `the game never reads a mod's ${key.slice(9)}; default settings cannot be shipped this way, remove it or write the player's profile settings.set instead [T] (UI-18)`);
  // UI-05: action net ids are creation-order uint8s, so host and client need the same interface/action file set
  if (!vfsMode && src.v) for (const key of [...items.keys()].sort()) if (kinds.action.test(key)) {
    const rec = src.v.files.get(key);
    const inVanilla = rec && (!src.isModKey(key) || src.v.shadows.some(s => s.key === key && s.over && (s.over.layer === 'base' || /^patch [0-9]+$/.test(s.over.layer))));
    if (!inVanilla) rep.add(items.get(key).file, 0, 'WARN_ACTION_SET_MP_MISMATCH', `new action file '${base(key)}' changes the interface/action set: every multiplayer player needs the same set or action ids desync [T] (UI-05)`);
  }

  // ---- panel_control (UI-07,08,09,10)
  function panel(key, rel, tops) {
    const stem = base(key).replace(/\.set$/, '');
    if (stem === 'right_special' && !goh) rep.add(rel, 0, 'PANEL_SPECIAL_UNLOADED', 'right_special.set is listed but never loaded by the main panel: no effect (UI-07)');
    const main = /^right_/.test(stem);
    const list = [];
    for (const top of tops) {
      const tp = parts(top);
      if (tp.nm !== 'panel_control') continue;
      for (const c of tp.kids) {
        const p = parts(c); if (!p.name) continue;
        const name = lc(tokText(p.name)), it = { name, line: c.line, pos: null, prio: 0, conds: [] };
        if (!allActions.has(name) && !G.ITEM_TYPES.has(name))
          rep.add(rel, c.line, 'PANEL_ITEM_UNKNOWN', `'${tokText(p.name)}': no action (compiled or interface/action/<name>.set) and no panel item type of that name: dummy item / minimap crash (UI-10)`);
        for (const f of p.kids) {
          const q = parts(f), nums = q.toks.filter(x => x.k === 'INTEGER');
          if (q.nm === 'position' && nums.length >= 2) it.pos = [nums[0].value, nums[1].value, f.line];
          else if (q.nm === 'priority' && nums.length) it.prio = nums[0].value;
          else if (q.nm === 'condition') for (const x of q.toks) if (x.k === 'STRING' || x.k === 'IDENT') for (const term of tokText(x).split(/\s+/).filter(Boolean)) {
            it.conds.push(lc(term));
            if (goh) {   // GHUI-75 code panels: 8 tags, `-<tag>`, 4 words; GHUI-76 layout bars: any unit tag / ability name, unknown term hides silently
              const t = lc(term), neg = t[0] === '-' && G.COND_TAGS.has(t.slice(1));
              if (!G.COND_TERMS.has(t) && !neg) rep.info(rel, f.line, 'PANEL_CONDITION_TAG', `condition term "${term}" is not a GoH code-panel term: code panels log "Unknown condition term" and ignore it (GHUI-75); layout bars take it as a unit tag or soldier ability name and hide the item while no selected unit has it (GHUI-76)`);
            } else if (!T.COND_TERMS.has(lc(term))) rep.add(rel, f.line, 'PANEL_CONDITION_UNKNOWN', `unknown condition term "${term}" logs an error and is ignored (UI-08)`);
          }
        }
        if (name === 'gc_cp_browse_special' && !goh) rep.add(rel, c.line, 'PANEL_SPECIAL_UNLOADED', 'gc_cp_browse_special shows group 3 whose list is null in the original: item leads nowhere (UI-07)');
        list.push(it);
      }
    }
    if (!main) return;
    const always = it => it.conds.every(x => x === 'disabled');
    const cells = new Map();
    for (const it of list) {
      if (!it.pos || it.pos[0] === -1 && it.pos[1] === -1) continue;
      const [col, row, ln] = it.pos;
      if (col < 0 || col > 3 || row < 0 || row > 2) { rep.add(rel, ln, 'WARN_PANEL_CELL_RANGE', `position ${col} ${row} outside the main grid (cols 0-3, rows 0-2): item hidden [I] (UI-09)`); continue; }
      if (!always(it)) continue;
      const ck = col + ',' + row, prev = cells.get(ck);
      if (prev && prev.prio === it.prio) rep.add(rel, ln, 'PANEL_CELL_CLASH', `'${it.name}' shares cell ${col} ${row} with '${prev.name}' (line ${prev.line}), same priority, no conditions: second one hidden (UI-09)`);
      else if (!prev) cells.set(ck, it);
    }
    let n = 0;
    for (const it of list) if (always(it) && ++n === 13) rep.add(rel, it.line, 'PANEL_CELLS_FULL', `${n}th unconditional item, the main grid has 12 cells: this and later unpositioned items hidden (UI-09)`);
  }

  // ---- interface/action (UI-03,06)
  function action(key, rel, tops) {
    const stemName = base(key).replace(/\.set$/, '');
    const insts = (list, where) => {
      for (const b of list) {
        const p = parts(b);
        if (p.name && p.name.k === 'IDENT' && !G.INSTRUCTIONS.has(p.nm)) rep.add(rel, b.line, 'ACTION_INSTRUCTION_UNKNOWN', `unknown instruction '${p.name.text}' in {${where}}: logs "Unknown instruction", then null deref (UI-06)`);
        if (goh && p.nm === 'plant') (vfsMode ? rep.info : rep.add)(rel, b.line, 'WARN_PLANT_NOOP', `'plant' does nothing in GoH: it logs "Custom actino plant: NOT IMPLEMENTED" and goes on, nothing is planted (GHINT-11)`);
        if (p.nm === 'if') insts(p.kids, where);
      }
    };
    for (const top of tops) {
      const tp = parts(top);
      if (tp.nm !== 'action') continue;
      for (const c of tp.kids) {
        const p = parts(c);
        if (p.nm === 'instructions' || p.nm === 'instant') insts(p.kids, p.nm);
        else if (p.nm === 'button') {
          const s = p.toks.find(x => x.k === 'STRING');
          const pic = s ? s.value : stemName;
          if (!pics.has(lc(pic)) && !pics.has(lc(pic).replace(/\.[^./]*$/, ''))) (listed.has(stemName) && !goh ? rep.add : rep.info)(rel, c.line, 'PICTURE_MISSING', `button picture '${pic}' not found in interface/scene/panel_control/ (stub shown, no error) (UI-03)` + (goh ? '; GoH draws its action bar from its own GUI and ships no pictures there, so this is not checked as an error [I]' : ''));
        }
      }
    }
  }

  // ---- keys.set (UI-11..15)
  function keysSet(key, rel, tops) {
    if (!/^resource\/interface\/profiles\/[^/]+\/keys\.set$/.test(key)) rep.add(rel, 0, 'KEYS_PATH_UNREACHED', `keys.set only reached as interface/profiles/<id>/keys.set (UI-13)`);
    else if (key === 'resource/interface/profiles/default/keys.set' && !vfsMode) rep.info(rel, 0, 'KEYS_PROFILE_OVERRIDE', 'a user profiles\\<id>\\keys.set overrides every action it lists; mod defaults may not show (UI-13)');
    for (const top of tops) {
      const tp = parts(top);
      if (tp.nm !== 'keys') continue;
      for (const c of tp.kids) {
        const p = parts(c);
        if (!p.name || p.name.k !== 'STRING') continue;
        const id = p.name.value;
        for (const f of p.kids) {
          const q = parts(f);
          if (q.nm === 'category' && !goh) rep.info(rel, f.line, 'KEYS_CATEGORY_IGNORED', `'${id}': a key category is GoH-only (rebind conflicts per category); this game ignores it (GHUI-251)`);
          if (q.nm !== 'value') continue;
          for (const x of q.toks) {
            if (x.k !== 'STRING' && x.k !== 'IDENT') continue;
            for (const tok of tokText(x).toUpperCase().split(/[+ ]+/).filter(Boolean)) {
              if (T.KEY_NAMES.has(tok)) continue;
              if (tok === 'MOUSE_MIDDLE') rep.add(rel, f.line, 'KEYS_MOUSE_MIDDLE', `'${id}': MOUSE_MIDDLE is not in the key table (use MOUSE2 or MOUSE_MIDLE): silently unbound (UI-12)`);
              else rep.add(rel, f.line, 'KEYS_TOKEN_UNKNOWN', `'${id}': unknown key token '${tok}' silently ignored (UI-11)`);
            }
          }
        }
        if (known.has(id) || /^groups\//.test(id) || actionKeys.has(id)) continue;
        const m = /^actions\/(.+)$/.exec(id);
        if (m && allActions.has(m[1]) && goh) rep.add(rel, c.line, 'KEYS_ACTION_NO_HOTKEY', `'${id}': no action file names this id with {Key "${id}"}: GoH binds an action key through the action's own Key line (ui/goh-action-set-keys) [I]`);
        else if (m && allActions.has(m[1])) rep.add(rel, c.line, 'KEYS_ACTION_NO_HOTKEY', `'${id}': only built-in actions and 'button use' get a key (custom action ${customActions.has(m[1]) ? '' : 'or unlisted built-in '}cannot be bound) (UI-14)`);
        else rep.add(rel, c.line, 'WARN_KEYS_ID_UNREAD', `'${id}': no code reads this id: stored and shown in options, no effect (UI-15)`);
      }
    }
  }

  // ---- fonts (UI-16)
  function fontInfo(k) {
    const b = src.get(k); if (!b) return null;
    const r = require('../lib/sdlx').read(b, { file: k, key: k, open: src.open, onError() {} });
    for (const top of topBlocks(r.root)) {
      const tp = parts(top); if (tp.nm !== 'font_atlas') continue;
      const o = { line: top.line };
      for (const f of tp.kids) { const q = parts(f); const v = q.toks[0]; if (v) o[q.nm] = v.k === 'STRING' ? v.value : v.k === 'INTEGER' ? v.value : v.text; }
      return o;
    }
    return null;
  }
  function font(key, rel, tops) {
    const o = fontInfo(key); if (!o) return;
    if (typeof o.size === 'number' && (o.size > 255 || o.size < 0)) rep.add(rel, o.line, 'FONT_SIZE_RANGE', `size ${o.size} stored as uint8 (wraps to ${o.size & 255}) (UI-16)`);
    if (typeof o.binary_data === 'string') {
      const bk = lc('resource/interface/font/' + o.binary_data.replace(/\\/g, '/'));
      if (!keys.has(bk)) rep.add(rel, o.line, 'WARN_FONT_BINARY_MISSING', `binary_data '${o.binary_data}' not found in interface/font/ [I] (UI-16)`);
    }
  }
  function fontsGlobal() {
    let ok = false, any = false;
    for (const k of keys) if (kinds.font.test(k)) { any = true; const o = fontInfo(k); if (o && lc(o.name) === 'main' && (o.size & 255) === 10) { ok = true; break; } }
    if (!ok && (src.v || any)) rep.add('interface/font', 0, src.v ? 'FONT_MAIN10_MISSING' : 'WARN_FONT_MAIN10_MISSING', 'no font {name "main"} {size 10}: fatal startup error "No default font [main(10)] found" (UI-16)');
  }
  return { rep, files: nfiles, mods: mods || [] };   // mods: the mods actually mounted (given, or the folder's own name under <game>/mods)
}
// check(opts) -> { rep, files, mods }   sync, files read one at a time
// opts: { folder|vfs, gameDir, mods, exe, restorePoints (also read <folder>/.arsenal-undo, off by default), listing }
function check(opts) { return fast.drive(steps(opts, null)); }
// checkAsync(opts) -> Promise<same>: the folder listed once through the thread pool, walked files read ahead
// checkAsync(opts, ra0): ra0 = a readAhead stand-in to read through (lib/modset read-once pass, ctx.js), closed at the end; no
// listing of its own then (lib/sdlset lists the folder from the pass's scan this thread adopted, else walks as before)
async function checkAsync(opts, ra0) {
  try {
    const { opts: o, ra } = ra0 ? { opts, ra: ra0 } : await fast.prepare(opts);
    try { return await fast.driveAsync(steps(o, { ra })); } finally { if (ra) ra.close(); }
  } finally { if (ra0) ra0.close(); }
}

// .lintrc + --format wiring (own arg parser): rc from --rc FILE, else nearest .lintrc walking up from `start`; --no-rc disables
const { rcPrint } = require('../lib/cli'), games = require('../lib/games');
// thread pool 16 (libuv default 4): more reads queued at the disk at once (as keylint)
if (require.main === module && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';
// main(args, {ra}): the CLI (and ctx.js, the read-once module form, with the pass's reader as ra); an error rejects
async function main(args, { ra } = {}) {
  const o = {}, pos = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--game') o.gameDir = args[++i]; else if (a === '--mods') o.mods = args[++i].split(',').filter(Boolean);
    else if (a === '--exe') { const x = args[++i], g = games.get(x); if (!g || /\.exe$/i.test(String(x))) { console.error('uilint: --exe must be one of as64|mowas_2|mowas2|goh'); process.exit(2); } o.exe = g.exe; }
    else if (a === '--restore-points') o.restorePoints = true;
    else if (a === '--vfs') o.vfs = true; else if (a === '--rc') o.rcFile = args[++i]; else if (a === '--no-rc') o.noRc = true; else if (a === '--format') o.format = args[++i]; else if (a === '-o') o.output = args[++i]; else if (a === '-q') o.q = true; else if (a === '--summary') o.summary = true; else pos.push(a);
  }
  o.folder = pos[0];
  if (!o.gameDir && o.exe === 'goh') { o.gameDir = games.install('goh').dir || undefined; o.gameAuto = !!o.gameDir; }   // --exe goh with no --game: the GoH install (folder and --vfs mode)
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { if (o.vfs && !o.gameDir && o.exe === 'goh') console.error('uilint: no GoH install found (set GOH_GAME or give --game)'); console.error('usage: uilint <mod folder> [--game dir] [--exe as64|mowas_2|mowas2|goh] [--mods a,b] [--restore-points] [-q] [--summary] | --vfs --game dir [--exe ..] | --vfs --exe goh'); process.exit(2); }
  const { rep, files, mods: used } = await checkAsync(o, ra);
  rcPrint(rep, o, o.folder || o.gameDir, 'uilint', { showInfo: !o.q, byCode: true, summary: o.summary });
  console.log(`${files} files`);
  if (!files && o.folder) {   // was 0 findings with no word on an Enhanced-mode folder (w5-w8)
    const name = path.basename(path.resolve(o.folder));
    let enh = false; try { const t = fs.readFileSync(path.join(o.folder, 'mod.info'), 'latin1'); enh = /as64\+/i.test(t) || /MinGameVersion\s+"?3\.3/i.test(t); } catch (e) {}
    console.error(`uilint: 0 UI files read from the folder (panel_control, interface/action, keys.set, fonts)` +
      (!o.exe || o.exe === 'as64' ? (enh || !used.length ? `; if it is an Enhanced-mode mod or ships paks, mount it: --game <dir> --mods as64+,${name}` : '')
        : (!used.length ? `; if it ships paks, mount it: ${o.gameAuto ? '' : '--game <dir> '}--exe ${o.exe} --mods ${name}` : '')));   // as64+ (Enhanced mode) is AS64 only
  }
}
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e && e.stack || String(e)); process.exit(1); });
module.exports = { check, checkAsync, main };
