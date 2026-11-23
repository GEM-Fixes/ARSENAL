// ops-unit.js: gen ops a guided unit task needs beyond ops.js (GEN-OPS-UNIT). Each op edits through ctx (overlay of the mod folder), refuses
// with a named GEN_* code and writes nothing for that op on a refusal; in --plan every changed line is an info GEN_PLAN_WRITE "<key> +N: line".
//   iblock {entity, like}                                    copy the like's own block(s) in set/interaction_entity/**.inc under the new id (sounds, burn chance)
//   macro  {entity, macro, match?, nth?, arg?, value?, add?, rename?}   one argument of a ("macro" ..) or (include ..) call in a def, or the macro name
//   preset {file, name, set{path: value}}                     game-mode presets: list keys (unitLimits chargeFactors commandPoints) merge "tag=N;-tag", other keys replace
//   army   {tag, id?, like, title?, icon_like?, alliance?}    armies/<tag>.set + vehicles_<tag>.set + its include line + alliance entry + mp/army/<tag> text (AS2)
//   kit    {breed, army?, period?, add:[{item, count?, spread?, filled?, rounds?, filling?, in_hands?}], del:[item], in_hands?: item | false}
//          soldier inventory lines {item "tags" [n [dev]] [filled [N] | filling "tags" n]}; the in_hands index stays on its line
//   vehkit {entity, add:[{item, count?, filled?, filling?, rounds?}], del:[item], mount:{slot: item | false}}   (opVehKit; called by the Units page, not a spec op yet)
//          a vehicle's own box lines {item "tags" [n] [filled | filling "tags" [n]] {user "slot"}} and what is mounted in its masked weapon slots
//   wear   {breed, army?, period?, skin}                     (opWear) the {skin "name"} line of a soldier file: the entity he wears
//   texmod {entity, variant: name | false, as?}              (opTexmod) the {texmod "variant"} line of an entity def; as: written as a new def beside it
//   card list: (opCardList)  a co-op / single-player price: units/<list>.set = common.set include list + an override card (TST-94) [T]
//   breed del: (breedDel), breed decl: through a macro call (declFields: expanded block); squad content/order/not_for_sale/remove/>4 types (opSquadX)
// codes (counted): GEN_IBLOCK_* GEN_MACRO_* GEN_PRESET_* GEN_ARMY_* GEN_KIT_* GEN_WEAR_* GEN_TEXMOD_* GEN_CARD_LIST_* GEN_BREED_DEL_ABSENT GEN_SQUAD_* GEN_BOTS_*; info GEN_PLAN_WRITE GEN_FILE_FULL_COPY ..
// Author: Imperator_Aug (ARSENAL, ia-2dc118d5)
const path = require('path');
const sdlwrite = require('../../lib/sdlwrite');
const patchE = require('../../patch-entity/patch-entity');
const { lower } = require('./ctx');
const O = require('./ops');   // ops.js fills module.exports (and O.H, its helpers) before it requires this file

const S = v => (v === null || v === undefined) ? '' : String(v);
const list = v => v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ID = /^[a-z0-9_][a-z0-9_\-().]*$/i;                 // entity / squad / tag ids: ASCII only
const truthy = v => v === true || /^(true|yes|1)$/i.test(S(v));
const H = () => O.H;
const PLAN_MAX = 80;

// ---- shared ------------------------------------------------------------------------------------------------------------
// write through ctx; --plan: the changed lines as info. a base file copied into the mod for the first time: GEN_FILE_FULL_COPY
function put(ctx, key, data, where) {
  const old = ctx.read(key), wasMine = ctx.inMod(key);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
  ctx.write(key, buf);
  if (old && !wasMine) ctx.info('GEN_FILE_FULL_COPY', `${key}: the mod now holds a whole copy of the base file (VFS-01/41); other mods' edits of it are shadowed`, where);
  if (!ctx.plan) return;
  if (buf.includes(0)) { ctx.info('GEN_PLAN_WRITE', `${key}${old ? '' : ' (new file)'}: binary, ${buf.length} bytes`, where); return; }
  const d = old ? patchE.lineDiff(old.toString('latin1'), buf.toString('latin1')) : buf.toString('latin1').split(/\r?\n/).map((l, i) => `+${i + 1}: ${l}`);
  ctx.info('GEN_PLAN_WRITE', `${key}${old ? '' : ' (new file)'}: ${d.length} line(s)`, where);
  d.slice(0, PLAN_MAX).forEach(l => ctx.info('GEN_PLAN_WRITE', `${key} ${l}`, where));
  if (d.length > PLAN_MAX) ctx.info('GEN_PLAN_WRITE', `${key} ... ${d.length - PLAN_MAX} more line(s)`, where);
}
const lines0 = (ctx, key) => { const b = ctx.read(key); return b ? H().splitLines(b) : null; };
// top-level {"name" ..} blocks of a line array (depth 0 only, so blocks inside (define ..) bodies are skipped)
function topBlocks(lines) {
  const out = []; let d = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = d === 0 ? /^\s*\{\s*"([^"]+)"/.exec(lines[i]) : null;
    if (m) { const j = H().blockEnd(lines, i); if (j >= 0) { out.push({ i, j, name: m[1] }); i = j; continue; } }
    d += H().depthDelta(lines[i]);
  }
  return out;
}
// (define "name" body): first one in keys -> {key, body (text after the name), params: Set of %param names}
function findDefine(ctx, name, keys) {
  const re = new RegExp('\\(\\s*define\\s+"' + esc(name) + '"', 'i');
  for (const k of keys) {
    const t = ctx.readStr(k); if (!t) continue;
    const m = re.exec(t); if (!m) continue;
    const e = H().sdlEnd(t, m.index); if (e < 0) continue;
    const body = t.slice(m.index + m[0].length, e);
    return { key: k, body, params: new Set([...body.matchAll(/%([A-Za-z_]\w*|\d+)/g)].map(x => lower(x[1]))) };
  }
  return null;
}
// a call list ("macro" a(..) args 1 2 ..) -> named [{name, atom, list}], pos [nodes]
function callArgs(call) {
  const named = [], pos = [];
  for (let k = 1; k < call.items.length; k++) {
    const c = call.items[k], nx = call.items[k + 1];
    if (c.type === 'atom' && nx && nx.type === 'list' && nx.start === c.end) { named.push({ name: lower(c.text), atom: c, list: nx }); k++; continue; }
    pos.push(c);
  }
  return { named, pos };
}
// substitute %params of a define body with the call's args. returns {text, dropped: [lines with an unknown %param]}
function substitute(body, call, src) {
  const { named, pos } = callArgs(call), map = new Map();
  for (const a of named) map.set(a.name, src.slice(a.list.start + 1, a.list.closeStart).trim());
  const ai = pos.findIndex(p => p.type === 'atom' && lower(p.text) === 'args');
  if (ai >= 0) pos.slice(ai + 1).forEach((p, i) => map.set(String(i), p.text));
  const dropped = [], out = [];
  for (const l of body.split(/\r?\n/)) {
    let miss = false;
    const r = l.replace(/%([A-Za-z_]\w*|\d+)/g, (m, p) => { const v = map.get(lower(p)); if (v === undefined) { miss = true; return m; } return v; });
    if (miss) dropped.push(l.trim()); else out.push(r);
  }
  return { text: out.join('\n'), dropped };
}
const reindent = (text, ind) => {
  const ls = text.split('\n').filter(l => l.trim());
  const cut = Math.min(...ls.map(l => /^[ \t]*/.exec(l)[0].length));
  return ls.map(l => ind + l.slice(cut));
};
// {k v} in a block text: replace the value (quoted stays quoted); absent and add -> a new {k v} line before the closing brace
function setKey(ctx, text, k, v, add) {
  const re = new RegExp('(\\{\\s*' + esc(k) + '\\s+)([^{}]*?)(\\s*\\})', 'i'), m = re.exec(text), val = ctx.bytes(S(v));
  if (m) return text.replace(re, (x, a, old, z) => a + (/^"/.test(old.trim()) && !/^"/.test(val) ? '"' + val + '"' : val) + z);
  if (!add) return null;
  const ls = text.split('\n'), ind = (/^[ \t]*/.exec(ls[1] || '\t')[0] || '\t');
  ls.splice(ls.length - 1, 0, `${ind}{${k} ${val}}`);
  return ls.join('\n');
}

// ---- iblock: the like's per-unit interaction block(s) under the new id ---------------------------------------------------
function opIblock(ctx, spec) {
  const ent = S(spec.entity).trim(), like = S(spec.like).trim(), where = 'iblock ' + ent;
  if (!ID.test(ent) || !ID.test(like) || lower(ent) === lower(like)) { ctx.err('GEN_IBLOCK_ARGS', 'iblock needs entity (the new unit id) and like (the unit whose interaction block is copied): two different ASCII ids', where); return; }
  if (!ctx.virt.has('entity:' + lower(ent)) && !H().resolveFile(ctx, ent, where)) return;
  const word = (n, w) => n.toLowerCase().split(/\s+/).includes(lower(w));
  const hits = [], mine = [];
  for (const key of ctx.keys(/^resource\/set\/interaction_entity\/.*\.(inc|set)$/)) {
    const f = lines0(ctx, key); if (!f) continue;
    const bl = topBlocks(f.lines);
    for (const x of bl) if (word(x.name, ent)) mine.push(`${key}:${x.i + 1} {"${x.name}"}`);
    const h = bl.filter(x => word(x.name, like));
    if (h.length) hits.push({ key, eol: f.eol, lines: f.lines, h });
  }
  if (mine.length) { ctx.err('GEN_IBLOCK_EXISTS', `${ent} already has an interaction block: ${mine.slice(0, 3).join(', ')}`, where); return; }
  if (!hits.length) { ctx.err('GEN_IBLOCK_LIKE_MISSING', `${like} has no block of its own in set/interaction_entity (a {"${like} tank"} style block); its sounds come from the shared props blocks, which ${ent} gets anyway`, where); return; }
  const said = [];
  for (const f of hits) {
    const lines = f.lines.slice();
    for (const x of f.h.slice().reverse()) {
      const nn = x.name.split(/(\s+)/).map(w => lower(w) === lower(like) ? ent : w).join('');
      const blk = lines.slice(x.i, x.j + 1);
      blk[0] = blk[0].replace('"' + x.name + '"', '"' + nn + '"');
      lines.splice(x.j + 1, 0, ...blk);
      said.unshift(`{"${nn}"} after {"${x.name}"} (${f.key.replace('resource/set/interaction_entity/', '')}:${x.i + 1}, ${blk.length} lines)`);
    }
    put(ctx, f.key, lines.join(f.eol), where);
  }
  ctx.facts.push(`iblock: ${ent} <- ${like}: ${said.join('; ')}`);
  ctx.test.push(`iblock: ${ent}: drive it and turn the turret: engine, track and turret sounds are the ${like}'s (not silent, not the generic ones); hit the engine: it can burn [T].`);
}

// ---- macro: one argument of a macro call in a def (the general armor op) -------------------------------------------------
// macros a def can call live in properties/** (tank_crew.ext, tank_unarmed.ext, vehicle.ext ..) or the def itself
// a breed .set calls macros from the .inc files it includes (vanilla: (define "veterancy_1") in set/breed/mp/<army>/veterancy_generic.inc,
// the only veterancy define there is): the file, its own includes, properties/**, then set/breed/**/*.inc
const MACRO_DIRS = 'the file itself, its (include ..) files, properties/**, set/breed/**/*.inc';
function macroKeys(ctx, key) {
  const dir = key.replace(/[^\/]*$/, ''), inc = [];
  for (const m of (ctx.readStr(key) || '').matchAll(/\(\s*include\s+"([^"]+)"/gi)) { const v = lower(m[1]).replace(/\\/g, '/'); inc.push(/^\//.test(v) ? 'resource' + v : path.posix.normalize(dir + v), 'resource/' + v.replace(/^\/+/, '')); }
  // GoH: a stuff file also sees its folder's .presets (loader-implicit, set/stuff/gun/.presets range_* accuracy_* penetration_*) [V GoH data]
  const pre = ctx.goh && /^resource\/set\/stuff\//.test(key) ? [dir + '.presets'] : [];
  return [...new Set([key, ...inc, ...pre, ...ctx.keys(/^resource\/properties\/.*\.(ext|inc|set|def)$/), ...ctx.keys(/^resource\/set\/breed\/.*\.inc$/)])];
}
// names of the defines in those files whose name starts like want (veterancy_ -> veterancy_1 in <file>), for a refusal
function defsLike(ctx, keys, want) {
  const stem = lower(want).replace(/\d+$/, '') || lower(want), out = new Map();
  for (const k of keys) for (const m of (ctx.readStr(k) || '').matchAll(/\(\s*define\s+"([^"]+)"/gi)) if (lower(m[1]).startsWith(stem) && !out.has(lower(m[1]))) out.set(lower(m[1]), k);
  return [...out].slice(0, 6).map(([n, k]) => `${n} (${k})`).join(', ');
}
function calls(t) {
  const out = [];
  (function walk(n) {
    for (const c of n.items || []) {
      if (c.type === 'list' && c.items[0] && (c.items[0].type === 'string' || (c.items[0].type === 'atom' && /^include$/i.test(c.items[0].text)))) out.push(c);
      if (c.items) walk(c);
    }
  })(t.root);
  return out;
}
function opMacro(ctx, spec) {
  const ent = S(spec.entity), mac = lower(S(spec.macro)).trim(), where = 'macro ' + ent + ' ' + mac;
  const hasVal = spec.value !== undefined && spec.value !== null, ren = S(spec.rename).trim();
  if (!ent || !mac || (!hasVal && !ren)) { ctx.err('GEN_MACRO_ARGS', 'macro needs entity, macro (the called name, or include) and value (with arg) or rename', where); return; }
  if (ren && !/^[A-Za-z0-9_\-]+$/.test(ren)) { ctx.err('GEN_MACRO_ARGS', `rename "${ren}": a macro name, ASCII letters digits _ -`, where); return; }
  if (ren && lower(ren) === mac) { ctx.err('GEN_MACRO_ARGS', `rename "${ren}" is the macro the call already uses`, where); return; }
  if (ren && mac === 'include') { ctx.err('GEN_MACRO_ARGS', 'an (include ..) call has no name to change; set arg: 1 to the new path instead', where); return; }
  if (hasVal && !S(spec.arg).trim()) { ctx.err('GEN_MACRO_ARGS', 'value needs arg: a named argument (step, scale, place ..), args (the numbers after args) or a position 1..n', where); return; }
  const f = H().resolveFile(ctx, ent, where);
  if (!f) return;
  if (!f.key) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${ent} is created in this spec: the macro edit is not shown in --plan`, where); return; }
  let t; try { t = sdlwrite.parse(ctx.read(f.key)); } catch (e) { ctx.err('GEN_MACRO_NOT_SDL', `${f.key}: ${e.message}`, where); return; }
  const src = t.src, text = c => src.slice(c.start, c.end).replace(/\s+/g, ' ');
  const nameOf = c => c.items[0].type === 'string' ? lower(c.items[0].text.replace(/^"|"$/g, '')) : 'include';
  const all = calls(t);
  let hit = all.filter(c => nameOf(c) === mac);
  if (spec.match !== undefined) hit = hit.filter(c => lower(text(c)).includes(lower(S(spec.match))));
  if (!hit.length) { ctx.err('GEN_MACRO_NO_CALL', `${f.key}: no ("${mac}" ..) call${spec.match !== undefined ? ' containing "' + S(spec.match) + '"' : ''}; calls in this def: ${[...new Set(all.map(nameOf))].join(' ') || 'none'}`, where); return; }
  if (spec.nth !== undefined) {
    const n = +S(spec.nth);
    if (!(n >= 1 && n <= hit.length && Number.isInteger(n))) { ctx.err('GEN_MACRO_ARGS', `nth ${S(spec.nth)}: 1..${hit.length} (${hit.length} matching call(s))`, where); return; }
    hit = [hit[n - 1]];
  }
  if (hit.length > 1) { ctx.err('GEN_MACRO_AMBIGUOUS', `${hit.length} ("${mac}" ..) calls: ${hit.slice(0, 6).map((c, i) => (i + 1) + ') ' + text(c)).join('  ')}; give match: <text in the call> or nth: <n>`, where); return; }
  const call = hit[0], before = text(call), { named, pos } = callArgs(call), said = [];
  const def = findDefine(ctx, mac === 'include' ? '\u0000' : mac, macroKeys(ctx, f.key));
  if (hasVal) {
    const arg = lower(S(spec.arg).trim()), val = S(spec.value).trim();
    if (arg === 'args') {
      const ai = call.items.findIndex(c => c.type === 'atom' && lower(c.text) === 'args');
      const slots = []; if (ai > 0) for (let j = ai + 1; j < call.items.length && call.items[j].type === 'atom'; j++) slots.push(call.items[j]);
      const toks = val.split(/\s+/).filter(Boolean);
      if (!slots.length) { ctx.err('GEN_MACRO_ARG_MISSING', `${before}: no "args" numbers; named args: ${named.map(a => a.name).join(' ') || 'none'}`, where); return; }
      if (toks.length !== slots.length) { ctx.err('GEN_MACRO_ARGC', `${before}: args takes ${slots.length} value(s), got ${toks.length}; _ keeps one`, where); return; }
      toks.forEach((v, i) => { if (v !== '_') sdlwrite.setValue(slots[i], ctx.bytes(v)); });
      said.push(`args ${slots.map(s => s.text).join(' ')} -> ${toks.map((v, i) => v === '_' ? slots[i].text : v).join(' ')}`);
    } else if (/^\d+$/.test(arg)) {
      const node = pos[+arg - 1];
      if (!node || node.type === 'list' || node.type === 'block') { ctx.err('GEN_MACRO_ARG_MISSING', `${before}: no plain argument at position ${arg} (${pos.filter(p => p.type === 'atom' || p.type === 'string').length} there)`, where); return; }
      said.push(`arg ${arg} ${node.text} -> ${val}`);
      sdlwrite.setValue(node, ctx.bytes(val));
    } else {
      const a = named.find(x => x.name === arg);
      if (a) {
        const inner = src.slice(a.list.start + 1, a.list.closeStart).trim();
        const nv = /^"[^"]*"$/.test(inner) && !/^"/.test(val) ? '"' + val + '"' : val;
        t.splices.push({ start: a.list.start + 1, end: a.list.closeStart, text: ctx.bytes(nv), node: null });
        said.push(`${arg}(${inner}) -> ${arg}(${nv})`);
      } else if (truthy(spec.add)) {
        t.splices.push({ start: call.closeStart, end: call.closeStart, text: ctx.bytes(` ${arg}(${val})`), node: null });
        said.push(`added ${arg}(${val})`);
      } else { ctx.err('GEN_MACRO_ARG_MISSING', `${before}: no ${arg}(..) argument; named args: ${named.map(x => x.name).join(' ') || 'none'} (add: true appends it)`, where); return; }
      if (def && !def.params.has(arg)) ctx.err('WARN_GEN_MACRO_ARG_UNUSED', `${arg}: the macro "${mac}" (${def.key}) never reads %${arg}, so this value changes nothing [I]`, where);
    }
  }
  if (ren) {
    const nd = findDefine(ctx, ren, macroKeys(ctx, f.key));
    if (!nd) { const mk = macroKeys(ctx, f.key), like = defsLike(ctx, mk, ren); ctx.err('GEN_MACRO_UNDEFINED', `no (define "${ren}" ..) in ${MACRO_DIRS}; a call to it would be an undefined macro. ${like ? 'Defined there: ' + like + '.' : ''} Write the define first (a .inc of the mod, included by the file), then rename`, where); return; }
    const have = new Set(named.map(a => a.name)), ai = pos.findIndex(p => p.type === 'atom' && lower(p.text) === 'args'), npos = ai < 0 ? 0 : pos.length - ai - 1;
    const missing = [...nd.params].filter(p => /^\d+$/.test(p) ? +p >= npos : !have.has(p));
    if (missing.length) { ctx.err('GEN_MACRO_PARAM_MISSING', `"${ren}" (${nd.key}) reads %${missing.join(' %')}, which the call does not give (${before}); a %param left unreplaced breaks the load`, where); return; }
    const unused = [...have].filter(p => !nd.params.has(p));
    if (unused.length) ctx.info('GEN_MACRO_ARG_UNUSED', `"${ren}" does not read ${unused.join(' ')}: those args are ignored after the rename`, where);
    sdlwrite.setValue(call.items[0], ren);
    said.push(`"${mac}" -> "${ren}"`);
  }
  put(ctx, f.key, sdlwrite.serialize(t), where);
  ctx.facts.push(`macro: ${ent} ${before}: ${said.join('; ')}`);
  ctx.test.push(`macro: ${ent} (${mac}): spawn it and check what that call drives (crew seats, track marks, selection ring, armour preset ..); game.log has no macro or include error [T].`);
}

// ---- preset: game-mode economy and per-unit buy limits -------------------------------------------------------------------
const LISTKEY = new Set(['unitlimits', 'chargefactors', 'commandpoints']);
function presetKey(ctx, file) {
  let k = lower(S(file)).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!k.includes('/')) k = 'resource/set/multiplayer/games/' + k;
  else if (!k.startsWith('resource/')) k = 'resource/' + k;
  for (const c of [k, k + '.inc', k + '.set']) if (ctx.exists(c) && ctx.read(c)) return c;
  return null;
}
function opPreset(ctx, spec) {
  const where = 'preset ' + S(spec.file) + ' ' + S(spec.name), sets = spec.set && typeof spec.set === 'object' && !Array.isArray(spec.set) ? Object.entries(spec.set) : [];
  if (!S(spec.file) || !S(spec.name) || !sets.length) { ctx.err('GEN_PRESET_ARGS', 'preset needs file (presets_all.inc, frontline.set ..), name (a (define "x") or {"x"} preset, or all) and set: {key: value}', where); return; }
  const key = presetKey(ctx, spec.file);
  if (!key) { ctx.err('GEN_PRESET_FILE_UNKNOWN', `no ${S(spec.file)} under set/multiplayer/games (files: ${ctx.keys(/^resource\/set\/multiplayer\/games\/[^/]+$/).map(k => k.split('/').pop()).join(' ')})`, where); return; }
  let t; try { t = sdlwrite.parse(ctx.read(key)); } catch (e) { ctx.err('GEN_PRESET_NOT_SDL', `${key}: ${e.message}`, where); return; }
  // scopes: (define "x" ..) at any depth, {"x" ..} blocks under a {presets ..} block
  const defs = [], presets = [];
  (function walk(n, inPresets) {
    for (const c of n.items || []) {
      if (c.type === 'list' && c.items[0] && c.items[0].type === 'atom' && lower(c.items[0].text) === 'define' && c.items[1] && c.items[1].type === 'string') defs.push({ name: lower(c.items[1].text.replace(/"/g, '')), node: c });
      else if (c.type === 'block' && inPresets && c.items[0] && c.items[0].type === 'string') presets.push({ name: c.name, node: c });
      if (c.items) walk(c, c.type === 'block' && c.name === 'presets');
    }
  })(t.root, false);
  const want = lower(S(spec.name)), scopes = want === 'all' ? defs.concat(presets) : defs.concat(presets).filter(s => s.name === want);
  if (!scopes.length) { ctx.err('GEN_PRESET_NAME_UNKNOWN', `${key}: no preset "${S(spec.name)}"; there: ${defs.concat(presets).map(s => s.name).join(' ') || 'none'} (or all)`, where); return; }
  const said = [], tagsSeen = [];
  let bad = false;
  for (const [p, v0] of sets) {
    const segs = lower(p).split('/').filter(Boolean), last = segs[segs.length - 1], v = S(v0).trim();
    const hits = [];
    for (const s of scopes) (function walk(n, chain) {
      for (const c of n.items || []) {
        if (c.type !== 'block') continue;
        const ch = chain.concat(c.name);
        if (c.name === last) { let i = 0; for (const x of chain) if (x === segs[i]) i++; if (i >= segs.length - 1) hits.push({ scope: s.name, node: c }); }
        walk(c, ch);
      }
    })(s.node, []);
    if (!hits.length) {
      // a key the preset lacks: added where the preset reader takes it (game preset / data / unit budget Serialize, modweb mission/mp-preset);
      // any other name is skipped by the DDA reader without a word (MIS-01) or by case (MIS-11), so it is refused
      const r = presetAdd(ctx, scopes, segs, v, where);
      if (r === null) { bad = true; continue; }
      if (r.length) { for (const x of r) { if (x.tags) tagsSeen.push(...x.tags); said.push(x.said); } continue; }
      ctx.err('GEN_PRESET_KEY_MISSING', `${key} ${S(spec.name)}: no {${p}} block, and its parent ${segs.slice(0, -1).join('/') || '(the preset)'} is not in the preset either (keys like unitLimits chargeFactors commandPoints budgets/vehicle/resource/start)`, where); bad = true; continue;
    }
    for (const h of hits) {
      let node = h.node;
      if (node.items.length === 2 && node.items[1].type === 'block' && node.items[1].name === 'value') node = node.items[1];
      const cur = node.items[1], curText = cur && cur.type !== 'block' && cur.type !== 'list' ? cur.text : null;
      const isList = LISTKEY.has(last) || (curText !== null && /^"[^"]*=[^"]*"$/.test(curText));
      if (isList) {
        let entries = curText ? curText.replace(/^"|"$/g, '').split(';').map(x => x.trim()).filter(Boolean) : [];
        const trail = curText ? /;\s*"$/.test(curText) : false;
        if (/^=/.test(v)) entries = v.slice(1).split(';').map(x => x.trim()).filter(Boolean);
        for (const e of /^=/.test(v) ? [] : v.split(';').map(x => x.trim()).filter(Boolean)) {
          if (/^-/.test(e)) { const tg = lower(e.slice(1)); const n0 = entries.length; entries = entries.filter(x => lower(x.split('=')[0]) !== tg); if (entries.length === n0) ctx.info('GEN_PRESET_TAG_ABSENT', `${p} has no ${tg} entry to remove`, where); continue; }
          const m = /^([A-Za-z0-9_^|.\-]+|\*)\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(e);
          if (!m) { ctx.err('GEN_PRESET_VALUE', `${p}: "${e}" is not tag=number (or -tag to remove, or =whole;list to replace)`, where); bad = true; continue; }
          const i = entries.findIndex(x => lower(x.split('=')[0].trim()) === lower(m[1]));
          if (i >= 0) entries[i] = m[1] + '=' + m[2];
          else { const star = entries.findIndex(x => x.split('=')[0].trim() === '*'); entries.splice(star >= 0 && m[1] !== '*' ? star : entries.length, 0, m[1] + '=' + m[2]); }
          if (m[1] !== '*') tagsSeen.push(m[1]);
        }
        const nv = '"' + entries.join(';') + (trail ? ';' : '') + '"';
        if (cur && curText !== null) sdlwrite.setValue(cur, ctx.bytes(nv)); else sdlwrite.setValue(node, ctx.bytes(nv), 1);
        said.push(`${h.scope} ${p}: ${curText || '(empty)'} -> ${nv}`);
      } else {
        if (cur && (cur.type === 'block' || cur.type === 'list')) { ctx.err('GEN_PRESET_VALUE', `${p} holds blocks, not a value; name a key inside it (e.g. ${p}/${cur.name || '..'})`, where); bad = true; continue; }
        const nv = cur && cur.type === 'string' && !/^"/.test(v) ? '"' + v + '"' : v;
        if (cur) sdlwrite.setValue(cur, ctx.bytes(nv)); else sdlwrite.setValue(node, ctx.bytes(nv), 1);
        said.push(`${h.scope} ${p}: ${curText || '(none)'} -> ${nv}`);
      }
    }
  }
  if (bad) return;
  // a limit or factor tag no card carries matches nothing: the unit stays unlimited [I]
  const units = ctx.keys(/^resource\/set\/multiplayer\/units\/.*\.(set|inc)$/).map(k => ctx.readStr(k) || '').join('\n').toLowerCase();
  for (const tg of [...new Set(tagsSeen.map(lower))]) if (!new RegExp('(^|[^a-z0-9_])' + esc(tg) + '([^a-z0-9_]|$)').test(units)) ctx.err('WARN_GEN_PRESET_TAG_UNUSED', `tag "${tg}": no unit card in set/multiplayer/units carries it, so the limit or factor matches no unit; give the card that tag (card fields t) [I]`, where);
  put(ctx, key, sdlwrite.serialize(t), where);
  ctx.facts.push(`preset: ${key.split('/').pop()} ${said.join('; ')}`);
  ctx.test.push(`preset: ${key.split('/').pop()} ${S(spec.name)}: start a match of a mode that uses it; buy the limited unit past its limit (the button greys out) and check the start resources / charge times [T].`);
}

// keys a preset reader takes, by parent block (canonical case: DDA names match case-sensitively, MIS-11). '' = the preset itself
const EDATA = ['unitset', 'commandPoints', 'unitLimits', 'chargeFactors', 'balancingFactorBonus', 'budgets', 'growFactors', 'fullpayback'];
const PRESET_ADD = {
  '': ['gameMode', 'unitMode', 'specMode', 'advanced', 'ranked', 'remove', 'common', 'teams', 'bots'],
  common: EDATA, a: EDATA, b: EDATA, easy: EDATA, normal: EDATA, hard: EDATA, heroic: EDATA,
  balancingfactorbonus: ['cp', 'mp', 'payback'], chargefactors: ['value', 'available'], unitset: ['value', 'include', 'exclude', 'available'],
  resource: ['start', 'finish', 'growTime', 'growTable', 'payback', 'limitmin', 'limitmax', 'speedset', 'period', 'speed'],
  teams: ['a', 'b'], bots: ['easy', 'normal', 'hard', 'heroic'],
};
const PRESET_FLAG = new Set(['advanced', 'ranked', 'remove']), PRESET_WRAP = new Set(['chargefactors', 'unitset']);
// add {last value} under every parent the path names in each scope; [] = no parent found, null = refused (error given)
function presetAdd(ctx, scopes, segs, v, where) {
  const last = segs[segs.length - 1], par = segs.slice(0, -1), pn = par.length ? par[par.length - 1] : '';
  const allowed = PRESET_ADD[pn] || (/^[a-z]$/.test(pn) ? EDATA : null);
  const canon = allowed && allowed.find(k => k.toLowerCase() === last);
  if (!canon) {
    ctx.err('GEN_PRESET_KEY_UNKNOWN', `{${segs.join('/')}}: the preset reader takes ${allowed ? allowed.join(' ') : 'no keys'} under ${pn || 'a preset'}; any other name is skipped without an error (MIS-01, names are case-sensitive MIS-11), so it is not added`, where);
    return null;
  }
  const lk = last, out = [];
  let body;
  if (PRESET_FLAG.has(lk)) { if (!/^(true|yes|1|)$/i.test(v)) { ctx.err('GEN_PRESET_VALUE', `${canon} is a flag block {${canon}}: give true (to remove it, use the set op del)`, where); return null; } body = `{${canon}}`; }
  else if (lk === 'balancingfactorbonus' || lk === 'budgets' || lk === 'common' || lk === 'teams' || lk === 'bots' || (pn === 'teams' || pn === 'bots')) {
    ctx.err('GEN_PRESET_VALUE', `${canon} holds blocks, not a value: name a key inside it (e.g. ${segs.join('/')}/${(PRESET_ADD[lk] || EDATA)[0]})`, where); return null;
  } else {
    if (v === '') { ctx.err('GEN_PRESET_VALUE', `${canon}: give a value`, where); return null; }
    const isList = LISTKEY.has(lk);
    if (isList && !v.split(';').map(x => x.trim()).filter(Boolean).every(e => /^([A-Za-z0-9_^|.\-]+|\*)\s*=\s*[-\d.:,]+$/.test(e))) { ctx.err('GEN_PRESET_VALUE', `${canon}: "${v}" is not tag=number;.. (MIS-04: ; separates entries)`, where); return null; }
    const q = isList || PRESET_WRAP.has(lk) || !/^-?\d+(\.\d+)?$/.test(v) && !/^".*"$/.test(v) ? '"' + v.replace(/^"|"$/g, '') + '"' : v;
    body = PRESET_WRAP.has(lk) ? `{${canon} {value ${q}}}` : `{${canon} ${q}}`;
    if (isList) out.tags = v.split(';').map(e => e.split('=')[0].trim()).filter(x => x && x !== '*');
  }
  // creating a missing parent is not done here: the parent must exist (it holds the context, e.g. which budget)
  for (const s of scopes) {
    const parents = [];
    if (!par.length) parents.push(s.node);
    else (function walk(n, chain) {
      for (const c of n.items || []) {
        if (c.type !== 'block') continue;
        const ch = chain.concat(c.name);
        if (c.name === pn) { let i = 0; for (const x of chain) if (x === par[i]) i++; if (i >= par.length - 1) parents.push(c); }
        walk(c, ch);
      }
    })(s.node, []);
    for (const p of parents) {
      if (pn === 'resource' && ['limitmin', 'limitmax', 'period', 'speed'].includes(lk) && !/^0(\.0*)?$/.test(v)) {
        const mode = p.parent && (p.parent.items || []).find(c => c.type === 'block' && c.name === 'mode'), mv = mode && mode.items[1] ? lower(mode.items[1].text || '').replace(/"/g, '') : '';
        if (mv === 'standard' || (lk !== 'limitmin' && lk !== 'limitmax' && /custom|fullpayback/.test(mv))) { ctx.err('GEN_PRESET_VALUE', `${canon} ${v} in a "${mv}" budget: the budget refuses it ("Invalid parameter value", MIS-17: standard needs period speed limitmin limitmax 0, custom / fullpayback period speed 0)`, where); return null; }
      }
      sdlwrite.insertChild(p, p.items.length, body);
      out.push({ said: `${s.name} ${segs.join('/')}: (none) -> added ${body}`, tags: out.tags });
    }
  }
  if (out.length) ctx.info('GEN_PRESET_KEY_ADDED', `${segs.join('/')}: the preset had no such key; ${body} added in ${out.length} place(s) (a key the preset reader takes, modweb mission/mp-preset)`, where);
  return out;
}

// ---- army: a new side ------------------------------------------------------------------------------------------------------
const ARMIES = 'resource/set/multiplayer/armies/', ALLY = 'resource/set/multiplayer/games/preset_alliances.inc', VEH = 'resource/set/multiplayer/units/vehicles.set';
function opArmy(ctx, spec) {
  const tag = lower(S(spec.tag)).trim(), like = lower(S(spec.like)).trim(), where = 'army ' + tag;
  if (ctx.goh) { ctx.notFor('GEN_ARMY_AS2_ONLY', 'army', 'GoH has armies/<army>.set files (vanilla eng fin ger rus usa), but an army is playable only with a doctrine in the preset unit mode (GHGPL-09) and its Steam content army/<name> (GHNET-26); the doctrine and vehicle-list layout is not mapped', 'vanilla GoH resource/set/multiplayer/armies/; GHGPL-09, GHNET-26', where); return; }
  if (!/^[a-z][a-z0-9_]{0,15}$/.test(tag) || !like) { ctx.err('GEN_ARMY_ARGS', 'army needs tag (new side id: a-z 0-9 _, up to 16, e.g. fin) and like (an army whose file is copied, e.g. rus)', where); return; }
  if (ctx.exists(ARMIES + tag + '.set')) { ctx.err('GEN_ARMY_EXISTS', `army "${tag}" already exists (${ARMIES}${tag}.set)`, where); return; }
  const lt = ctx.readStr(ARMIES + like + '.set');
  if (lt === null) { ctx.err('GEN_ARMY_LIKE_MISSING', `no ${ARMIES}${like}.set (armies: ${ctx.keys(/^resource\/set\/multiplayer\/armies\/[^/]+\.set$/).map(k => k.split('/').pop().slice(0, -4)).join(' ')})`, where); return; }
  // ids: stock 0..5, 100..102 engine-reserved (random dummy spectator), a new army 6..99 (TST-95, MIS-07)
  const used = new Map();
  for (const k of ctx.keys(/^resource\/set\/multiplayer\/armies\/[^/]+\.set$/)) { const m = /\{\s*id\s+(-?\d+)/i.exec(ctx.readStr(k) || ''); if (m) used.set(+m[1], k.split('/').pop().slice(0, -4)); }
  let id;
  if (spec.id === undefined || spec.id === null || S(spec.id) === '') { id = 6; while (used.has(id) && id < 100) id++; ctx.info('GEN_ARMY_ID_PICKED', `id ${id}: the lowest free id from 6 (stock armies use ${[...used.keys()].sort((a, b) => a - b).join(' ')})`, where); }
  else id = +S(spec.id);
  if (!Number.isInteger(id) || id < 6 || id > 99) { ctx.err('GEN_ARMY_ID_RANGE', `id ${S(spec.id)}: a whole number 6..99 (0..5 are the stock armies, 100..102 engine-reserved, TST-95)`, where); return; }
  if (used.has(id)) { ctx.err('GEN_ARMY_ID_USED', `id ${id} is the id of army "${used.get(id)}"; two armies with one id share rank and selection [I] (MIS-07): pick a free id`, where); return; }
  // alliance entry
  let ally = null;
  if (S(spec.alliance)) {
    const f = lines0(ctx, ALLY);
    if (!f) { ctx.err('GEN_ARMY_ALLIANCE_UNKNOWN', `no ${ALLY} to add the army to`, where); return; }
    const names = f.lines.map(l => /^\s*\{\s*"([^"]+)"/.exec(l)).filter(Boolean).map(m => m[1]);
    const i = f.lines.findIndex(l => new RegExp('^\\s*\\{\\s*"' + esc(S(spec.alliance)) + '"', 'i').test(l)), j = i < 0 ? -1 : H().blockEnd(f.lines, i);
    if (j < 0) { ctx.err('GEN_ARMY_ALLIANCE_UNKNOWN', `no alliance "${S(spec.alliance)}" in ${ALLY} (there: ${names.join(' ')})`, where); return; }
    let a = -1; for (let k = i; k <= j; k++) if (/\{\s*armies\s+"/i.test(f.lines[k])) a = k;
    const lines = f.lines.slice();
    if (a >= 0) lines.splice(a + 1, 0, lines[a].replace(/(\{\s*armies\s+")[^"]*(")/i, '$1' + tag + '$2'));
    else lines.splice(j, 0, /^[ \t]*/.exec(lines[i])[0] + '\t{armies "' + tag + '"}');
    ally = { eol: f.eol, lines };
  } else ctx.err('WARN_GEN_ARMY_NO_ALLIANCE', `army ${tag} is in no alliance: modes with armySelectionMode alliance (combat, frontline ..) never offer it; give alliance: axis|allies [I]`, where);
  // icon: flag picture of icon_like copied as flag_<tag>
  let icon = null;
  if (S(spec.icon_like)) {
    const src = 'resource/interface/pages/multi/flag_' + lower(S(spec.icon_like)) + '.tga', b = ctx.read(src);
    if (!b) { ctx.err('GEN_ARMY_ICON_MISSING', `no ${src} to copy (flags: ${ctx.keys(/^resource\/interface\/pages\/multi\/flag_[^/]+\.tga$/).map(k => k.split('/').pop().slice(5, -4)).join(' ')})`, where); return; }
    icon = { key: 'resource/interface/pages/multi/flag_' + tag + '.tga', buf: b };
  }
  const eol = lt.includes('\r\n') ? '\r\n' : '\r\n';
  let at = lt;
  at = /\{\s*id\s+-?\d+\s*\}/i.test(at) ? at.replace(/(\{\s*id\s+)-?\d+/i, '$1' + id) : at.replace(/(\{\s*army\b[^\r\n]*)/i, `$1${eol}\t{id ${id}}`);
  at = /\{\s*title\s+"[^"]*"\s*\}/i.test(at) ? at.replace(/(\{\s*title\s+")[^"]*(")/i, `$1mp/army/${tag}$2`) : at.replace(/(\{\s*id\s+\d+\s*\})/i, `$1${eol}\t{title "mp/army/${tag}"}`);
  if (icon) at = /\{\s*icon\s+"[^"]*"/i.test(at) ? at.replace(/(\{\s*icon\s+")[^"]*(")/i, `$1/interface/pages/multi/flag_${tag}$2`) : at.replace(/(\{\s*title\s+"[^"]*"\s*\})/i, `$1${eol}\t{icon "/interface/pages/multi/flag_${tag}"}`);
  if (/\{\s*appid_base\b/i.test(at)) { at = at.split(/\r?\n/).filter(l => !/\{\s*appid_base\b/i.test(l)).join(eol); ctx.info('GEN_ARMY_APPID_DROPPED', `${like}'s {appid_base ..} (a Steam DLC gate) is not copied to ${tag}`, where); }
  // vehicles_<tag>.set and its include in vehicles.set (the list roster/card ops add cards to)
  const vf = lines0(ctx, VEH);
  if (!vf) { ctx.err('GEN_ARMY_NO_LIST', `no ${VEH} to include the new army list from`, where); return; }
  const vk = 'resource/set/multiplayer/units/vehicles_' + tag + '.set', vl = vf.lines.slice();
  let li = -1; vl.forEach((l, k) => { if (/^\s*\(\s*include\s+"vehicles_[^"]*"\s*\)/i.test(l)) li = k; });
  const incl = (li >= 0 ? /^[ \t]*/.exec(vl[li])[0] : '') + `(include "vehicles_${tag}.set")`;
  if (li >= 0) vl.splice(li + 1, 0, incl); else vl.push(incl);
  put(ctx, ARMIES + tag + '.set', at, where);
  if (icon) put(ctx, icon.key, icon.buf, where);
  if (!ctx.exists(vk)) put(ctx, vk, `; ${tag} army list (gen army op, from ${like}): cards go here (roster / card ops with army: ${tag})${eol}`, where);
  put(ctx, VEH, vl.join(vf.eol), where);
  if (ally) put(ctx, ALLY, ally.lines.join(ally.eol), where);
  ctx.texts.push({ key: 'mp/army/' + tag, text: S(spec.title) || tag.toUpperCase(), file: '' });
  ctx.virt.add('army:' + tag);
  // bots: bot.lua reads units[BotApi.Instance.army], so a ["<tag>"] block in each Purchases stage is the shape; its entries must name
  // <tag>'s own cards. Written at the end of the run (armyBots) from the cards roster ops of the same spec gave <tag>; none: GEN_ARMY_NO_BOTS
  (ctx.newArmies = ctx.newArmies || []).push({ tag, like, title: S(spec.title) || tag.toUpperCase(), where });
  ctx.facts.push(`army: ${tag} id ${id} from ${like}${ally ? ', alliance ' + S(spec.alliance) : ''}${icon ? ', flag of ' + S(spec.icon_like) : ''}, list ${vk.split('/').pop()} (empty)`);
  ctx.test.push(`army: ${tag}: lobby army selector lists "${S(spec.title) || tag.toUpperCase()}"${ally ? ' in alliance ' + S(spec.alliance) : ''} with its flag; pick it, start: no rank/army error in game.log (id ${id} > 5, TST-95) [T].`);
}

// end of run (ops.autoWrecks calls it, once): each army made by this spec gets a ["<tag>"] Units block in every bot.data.lua Purchases
// stage, from the cards roster ops gave it (ctx.armyCards); each entry copies the priority / class of its like's entry in that stage.
// No cards, or no like listed in any stage: GEN_ARMY_NO_BOTS (the bot on that army buys nothing, MIS-77)
function armyBots(ctx) {
  if (ctx.armyBotsDone || !(ctx.newArmies || []).length) return;
  ctx.armyBotsDone = true;
  const key = O.H.BOTKEY, no = (a, why) => ctx.info('GEN_ARMY_NO_BOTS', `bots: ${key} has no ["${a.tag}"] Units block, so a bot on ${a.tag} buys nothing (MIS-77). Not written: ${why}`, a.where);
  for (const a of ctx.newArmies) {
    const cards = ((ctx.armyCards || {})[a.tag] || []);
    if (!cards.length) { no(a, `the spec gives ${a.tag} no cards (add roster ops with army: ${a.tag} after the army op; the block is written from them)`); continue; }
    const f = lines0(ctx, key);
    if (!f) { no(a, `no ${key} in the base data`); continue; }
    const L = f.lines, out = [];
    if (L.some(l => new RegExp('^\\s*\\[\\s*"' + esc(a.tag) + '"\\s*\\]\\s*=').test(l))) { ctx.info('GEN_ARMY_BOTS_THERE', `${key} has a ["${a.tag}"] block already: left as it is`, a.where); continue; }
    let stage = 0, n = 0, said = [];
    // one Purchases stage per "Units = {" line (vanilla marks them {--purchase N; the comment is not needed)
    const starts = []; L.forEach((l, i) => { if (/^\s*Units\s*=\s*\{/.test(l)) starts.push(i); });
    for (let s = 0; s < starts.length; s++) {
      const s0 = starts[s], s1 = s + 1 < starts.length ? starts[s + 1] : L.length, ui = s0, rows = [];
      for (const c of cards) {
        const re = new RegExp('\\bunit\\s*=\\s*"' + esc(c.like) + '"', 'i'), hit = L.slice(s0, s1).find(l => re.test(l) && !/^\s*--/.test(l));
        if (!hit) continue;
        rows.push(hit.replace(/--.*$/, '').trim().replace(/,\s*$/, '').replace(re, `unit = "${c.unit}"`));
      }
      if (!rows.length) continue;
      const ind = /^[ \t]*/.exec(L[ui])[0] + '\t';
      out.push({ at: ui + 1, lines: [`${ind}["${a.tag}"] = {--${a.title} (gen army ${a.tag})`, ...rows.map((r, k) => ind + '\t' + r + (k < rows.length - 1 ? ',' : '')), ind + '},'] });
      stage++; n += rows.length; said.push(`stage ${s + 1}: ${rows.length}`);
    }
    if (!stage) { no(a, `no like of its cards (${cards.map(c => c.like).join(' ')}) is listed in any Purchases stage to copy priority / class from`); continue; }
    const nl = L.slice(); for (const o of out.reverse()) nl.splice(o.at, 0, ...o.lines);
    put(ctx, key, nl.join(f.eol), a.where);
    const miss = cards.filter(c => !L.some(l => new RegExp('\\bunit\\s*=\\s*"' + esc(c.like) + '"', 'i').test(l))).map(c => c.unit);
    if (miss.length) ctx.err('WARN_GEN_ARMY_BOTS_PART', `bots: ${miss.join(' ')} not in the ["${a.tag}"] block: their like is in no Purchases stage`, a.where);
    ctx.info('GEN_ARMY_BOTS', `bots: ["${a.tag}"] Units block written in ${stage} Purchases stage(s) (${said.join(', ')}) from the ${cards.length} card(s) this spec gave ${a.tag}; infantry squads of ${a.tag} are not in it (make squads, then add them on the bots page) [T]`, a.where);
    ctx.facts.push(`bots: ["${a.tag}"] block, ${n} entr${n === 1 ? 'y' : 'ies'} in ${stage} stage(s)`);
    ctx.test.push(`bots: MP match with a normal bot on ${a.tag}, 8 min: the bot buys ${cards.map(c => c.unit).join(' ')} (game.log / testrun rows) [T].`);
  }
}

// ---- kit: soldier inventory lines --------------------------------------------------------------------------------------------
// stuff names are matched by file-name tags (FindStuff): "grenade f1" = a set/stuff file whose name splits into grenade + f1
function stuffKnown(ctx, item) {
  const want = lower(item).split(/\s+/).filter(Boolean);
  if (!ctx._unitStuff) ctx._unitStuff = ctx.keys(/^resource\/set\/stuff\/.+[^/]$/).filter(k => !/\.(fsm|presets)$/.test(k)).map(k => new Set(k.split('/').pop().split('.').filter(Boolean)));
  const virt = [...ctx.virt].filter(v => v.startsWith('stuff:')).map(v => new Set(v.slice(6).split(/[.\s]+/)));
  return want.length > 0 && ctx._unitStuff.concat(virt).some(t => want.every(w => t.has(w)));
}
const itemName = n => lower(S(n.items[1] && n.items[1].text).replace(/^"|"$/g, ''));
// the parts of an item line after its name: {item "tags" [n [dev]] [filled [N] | filling "tags" n]}.
// Kept as the file's own words, so a part an edit does not name is written back exactly as it was
const KIT_NUM = /^\d+(\.\d+)?$/;
function kitLine(n) {
  const t = n.items.slice(2), o = { n: null, dev: null, mode: null, fN: null, fTags: null };
  let p = 0;
  const num = () => !!t[p] && t[p].type === 'atom' && /^-?(\d+\.?\d*|\.\d+)$/.test(t[p].text);
  if (num()) { o.n = t[p++].text; if (num()) o.dev = t[p++].text; }
  const w = t[p] && t[p].type === 'atom' ? lower(t[p].text) : '';
  if (w === 'filled') { o.mode = 'filled'; p++; if (num()) o.fN = t[p].text; }
  else if (w === 'filling') { o.mode = 'filling'; o.fTags = S(t[p + 1] && t[p + 1].text).replace(/^"|"$/g, ''); o.fN = t[p + 2] ? t[p + 2].text : '0'; }
  return o;
}
const kitTail = o => [o.n, o.dev, o.mode === 'filled' ? 'filled' : o.mode === 'filling' ? `filling "${o.fTags}"` : null, o.mode ? o.fN : null].filter(x => x !== null && x !== undefined).join(' ');
// one add entry laid over a line (old = kitLine of the line, null for a new line): the parts the entry names are set, the rest stays.
// Two older forms keep their meaning: count alone on a plain "filled" line takes the filled away, filled alone on a plain count line
// takes the count away. -> the new parts, or null (refused, finding written)
function kitMerge(ctx, a, item, old, where) {
  const has = k => a[k] !== undefined && a[k] !== null && a[k] !== '';
  const bad = m => { ctx.err('GEN_KIT_ARGS', `add ${item}: ${m}`, where); return null; };
  const same = (x, y) => x !== null && y !== null && +x === +y;
  if (has('count') && !KIT_NUM.test(S(a.count))) return bad(`count "${S(a.count)}" must be a whole number >= 1`);
  if (has('spread') && !KIT_NUM.test(S(a.spread))) return bad(`spread "${S(a.spread)}" must be a number, 0 or more`);
  if (has('rounds') && !(/^\d+$/.test(S(a.rounds)) && +S(a.rounds) >= 1)) return bad(`rounds "${S(a.rounds)}" must be a whole number >= 1`);
  const fill = a.filling !== undefined && a.filling !== null && a.filling !== false ? lower(S(a.filling)).trim().replace(/\s+/g, ' ') : null;
  if (fill && /["{}()]/.test(fill)) return bad(`filling "${fill}": a stuff name like "ammo mp40"`);
  if (fill && truthy(a.filled)) return bad('filled (the weapon\'s own ammunition) or filling (named ammunition), not both');
  const full = has('spread') || has('rounds') || a.filling !== undefined || a.filled === false || (has('count') && truthy(a.filled));
  const o = old ? Object.assign({}, old) : { n: null, dev: null, mode: null, fN: null, fTags: null };
  if (has('count')) o.n = same(S(a.count), o.n) ? o.n : String(+S(a.count));
  if (has('spread')) o.dev = +S(a.spread) > 0 ? (same(S(a.spread), o.dev) ? o.dev : String(+S(a.spread))) : null;
  if (fill) {
    const r = has('rounds') ? String(+S(a.rounds)) : (old && old.mode === 'filling' ? old.fN : null);
    if (r === null) return bad('filling needs rounds: how many rounds of it are loaded');
    const kept = !!old && old.mode === 'filling' && lower(old.fTags).trim().replace(/\s+/g, ' ') === fill;   // the line's own ammunition: not looked up again, its text stays
    if (!kept && !stuffKnown(ctx, fill)) { ctx.err('GEN_KIT_ITEM_UNKNOWN', `add ${item}: filling: no set/stuff file whose name tags cover "${fill}"`, where); return null; }
    o.mode = 'filling'; o.fTags = kept ? old.fTags : ctx.bytes(fill); o.fN = same(r, old && old.mode === 'filling' ? old.fN : null) ? old.fN : r;
  } else if (a.filled !== undefined && a.filled !== null) {
    if (truthy(a.filled)) { const keep = !full && old && old.mode === 'filled' ? old.fN : null; o.mode = 'filled'; o.fTags = null; o.fN = has('rounds') ? String(+S(a.rounds)) : keep; }
    else { o.mode = null; o.fN = null; o.fTags = null; }
  } else if (a.filling !== undefined) { o.mode = null; o.fN = null; o.fTags = null; }
  else if (has('rounds')) { if (!o.mode) return bad('rounds without filled or filling: say what is loaded'); o.fN = String(+S(a.rounds)); }
  if (!full && old) {
    if (has('count') && a.filled === undefined && old.mode === 'filled' && old.fN === null) o.mode = null;
    if (truthy(a.filled) && !has('count') && old.n !== null && old.dev === null) o.n = null;
  }
  if (o.dev !== null && o.n === null) o.n = '1';
  if (has('count') || has('spread')) {
    if (o.dev === null && o.n !== null && !(/^\d+$/.test(o.n) && +o.n >= 1)) return bad(`count "${o.n}" must be a whole number >= 1 (a count with a fraction needs a spread)`);
  }
  if (!old && o.n === null && !o.mode) o.n = '1';
  if (old && old.n === null && o.n !== null && +o.n === 1 && o.dev === null) o.n = null;   // a line that wrote no count keeps none
  return o;
}
// add/del on a breed buffer; hands: undefined = the held line stays the held one, false = nothing held ({in_hands} line removed:
// the engine's -1), an item name = that line is held. returns {buf, said} or null (refused, findings written)
function kitEdit(ctx, buf, add, del, where, hands) {
  let t; try { t = sdlwrite.parse(buf); } catch (e) { ctx.err('GEN_KIT_NOT_SDL', e.message, where); return null; }
  const br = sdlwrite.find(t, 'breed');
  if (!br) { ctx.err('GEN_KIT_NO_BREED', 'the file has no {breed ..} block', where); return null; }
  const inv = sdlwrite.find(br, 'inventory');
  const items = inv ? inv.items.filter(n => n.type === 'block' && n.name === 'item') : [];
  const handsNode = inv ? inv.items.find(n => n.type === 'block' && n.name === 'in_hands') : null;
  const handsIdx = handsNode && handsNode.items[1] && /^\d+$/.test(handsNode.items[1].text) ? +handsNode.items[1].text : null;
  const gone = new Set(), said = [];
  for (const d of del) {
    const hit = items.filter(n => itemName(n) === lower(S(d)));
    if (!hit.length) { ctx.err('GEN_KIT_ITEM_ABSENT', `no {item "${S(d)}"} in the inventory (items: ${items.map(itemName).join(', ') || 'none'})`, where); return null; }
    hit.forEach(n => gone.add(n)); said.push('- ' + S(d));
  }
  const lines = [], names = []; let wantHands = null;
  for (const a0 of add) {
    const a = typeof a0 === 'string' ? { item: a0 } : (a0 || {}), item = S(a.item).trim();
    if (!item || /["{}()]/.test(item)) { ctx.err('GEN_KIT_ARGS', `add: item "${item}": a stuff name like "ppsh41" or "grenade f1"`, where); return null; }
    if (!stuffKnown(ctx, item)) { ctx.err('GEN_KIT_ITEM_UNKNOWN', `add: no set/stuff file whose name tags cover "${item}" (the engine finds stuff by file-name tags; a missing item is a dummy, REF_ITEM_UNKNOWN)`, where); return null; }
    const have = items.filter(n => !gone.has(n) && itemName(n) === lower(item));
    const sets = ['count', 'spread', 'filled', 'rounds', 'filling'].some(k => a[k] !== undefined);
    const mark = () => { if (!truthy(a.in_hands)) return true; if (wantHands) { ctx.err('GEN_KIT_ARGS', `in_hands on two items (${wantHands}, ${item})`, where); return false; } wantHands = item; return true; };
    // an item the soldier already has: its line is set in place (same slot, so {in_hands n} still points at it)
    if (have.length === 1 && !names.includes(lower(item)) && (sets || truthy(a.in_hands))) {
      const n = have[0], old = kitLine(n), o = kitMerge(ctx, a, item, old, where);
      if (!o) return null;
      if (!mark()) return null;
      const was = kitTail(old), now = kitTail(o);
      if (was === now) { if (sets) ctx.info('GEN_KIT_COUNT_SAME', `"${item}" is ${was || '1'} already`, where); continue; }
      const rest = n.items.slice(2);
      if (!rest.length) sdlwrite.setValue(n, now, 2);
      else if (now) { sdlwrite.setValue(rest[0], now); rest.slice(1).forEach(x => sdlwrite.removeNode(x)); }
      else rest.forEach(x => sdlwrite.removeNode(x));
      said.push(`${item} ${was || '1'} -> ${now || '1'}`); continue;
    }
    if (have.length > 1 && sets) { ctx.err('GEN_KIT_ITEM_EXISTS', `add: "${item}" has ${have.length} lines in the inventory; del it and add one line with the count`, where); return null; }
    if (have.length || names.includes(lower(item))) { ctx.err('GEN_KIT_ITEM_EXISTS', `add: "${item}" is in the inventory already; give count (or filled) to set its line, or del it first`, where); return null; }
    const o = kitMerge(ctx, a, item, null, where);
    if (!o) return null;
    lines.push(`{item "${ctx.bytes(item)}" ${kitTail(o)}}`); names.push(lower(item));
    if (!mark()) return null;
    said.push('+ ' + lines[lines.length - 1]);
  }
  const left = items.filter(n => !gone.has(n)), final = left.map(itemName).concat(names);
  let idx = handsIdx;
  if (wantHands && hands !== undefined) { ctx.err('GEN_KIT_ARGS', 'in_hands on an item and in_hands of the kit: give one', where); return null; }
  if (wantHands) idx = final.indexOf(lower(wantHands));
  else if (hands === false || hands === null || (typeof hands === 'string' && /^(|none|false|no|-)$/i.test(hands.trim()))) idx = null;
  else if (hands !== undefined) { idx = final.indexOf(lower(S(hands).trim())); if (idx < 0) { ctx.err('GEN_KIT_HANDS_ABSENT', `in_hands: no {item "${S(hands)}"} in the inventory after this edit (items: ${final.join(', ') || 'none'})`, where); return null; } }
  else if (handsIdx !== null && items[handsIdx]) {
    idx = left.indexOf(items[handsIdx]);
    if (idx < 0) { ctx.err('GEN_KIT_HANDS_GONE', `"${itemName(items[handsIdx])}" is the item in hands ({in_hands ${handsIdx}}) and is deleted; add another item with in_hands: true, or give in_hands: "<item>" or in_hands: false`, where); return null; }
  }
  for (const n of gone) sdlwrite.removeNode(n);
  if (!inv) {
    if (!lines.length) { ctx.err('GEN_KIT_NO_INVENTORY', 'the breed has no {inventory ..} block', where); return null; }
    sdlwrite.insertChild(br, br.items.length, '{inventory\n' + lines.map(l => '\t' + l).join('\n') + (idx !== null ? `\n\t{in_hands ${idx}}` : '') + '\n}');
  } else {
    const at = handsNode ? inv.items.indexOf(handsNode) : inv.items.length;
    for (const l of lines) sdlwrite.insertChild(inv, at, l);
    if (idx === null && handsNode) { sdlwrite.removeNode(handsNode); said.push(`in_hands ${handsIdx === null ? '-' : handsIdx} -> none`); }
    else if (idx !== null && idx !== handsIdx) {
      if (handsNode) sdlwrite.setValue(handsNode, String(idx), 1); else sdlwrite.insertChild(inv, inv.items.length, `{in_hands ${idx}}`);
      said.push(`in_hands ${handsIdx === null ? '-' : handsIdx} -> ${idx} (${final[idx]})`);
    }
  }
  return { buf: sdlwrite.serialize(t), said };
}
function opKit(ctx, spec) {
  let b = S(spec.breed).trim().replace(/^mp\//i, ''), army = lower(S(spec.army)), period = S(spec.period || (ctx.goh ? 'late' : ''));
  const parts = b.split('/'), where = 'kit ' + b;
  if (parts.length === 3 && ctx.goh) [army, period, b] = parts; else if (parts.length === 2) [army, b] = parts; else if (parts.length !== 1) b = '';
  b = lower(b);
  const add = list(spec.add), del = list(spec.del);
  if (!/^[a-z0-9_]+$/.test(b) || !O.FACTION.test(army) || (!add.length && !del.length && spec.in_hands === undefined)) { ctx.err('GEN_KIT_ARGS', 'kit needs breed (rus/rifle, or rifle with army: rus) and add: [{item, count, spread, filled, rounds, filling, in_hands}] and/or del: [item] and/or in_hands: item | false', where); return; }
  const key = H().breedKey(ctx, army, b, period);
  if (!ctx.read(key)) {
    if (ctx.virt.has('breed:' + army + ':' + b)) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${army}/${b} is made by an earlier breed op: the kit edit is not shown in --plan`, where); return; }
    ctx.err('GEN_KIT_BREED_UNKNOWN', `no breed file ${key}`, where); return;
  }
  const r = kitEdit(ctx, ctx.read(key), add, del, where, spec.in_hands);
  if (!r) return;
  if (!r.said.length) { ctx.info('GEN_KIT_COUNT_SAME', `${army}/${b}: the inventory is like that already`, where); return; }
  put(ctx, key, r.buf, where);
  ctx.facts.push(`kit: ${army}/${b}: ${r.said.join(', ')}`);
  ctx.test.push(`kit: ${army}/${b}: buy a squad with this soldier; open its inventory: ${r.said.join(', ')}; the weapon in hands fires [T].`);
}

// ---- vehkit: a vehicle's inventory box lines and the weapons mounted in its masked slots ------------------------------------------
// {entity, add:[{item, count?, filled?, filling?, rounds?}], del:[item], mount:{<slot>: item | false}}
// The box of a vehicle is {extender "inventory" {box {item "tags" [n] [filled | filling "tags" [n]] {cell x y} {user "holder"}}}} in its
// def ([V]); {user "slot"} mounts the item in the
// holder of that name when the vehicle spawns ( [V]). A holder {weapon "slot" {mask "tags"}} takes
// in the game, only an item that has every tag of the mask ( [V]); {user} itself is not
// checked by the engine, so the caller checks the mask (the Units page does; this op edits only the def's own text, includes not expanded).
// Only lines written in the def itself are edited; a line an include or a ( ) call gives is not seen here. A weapon fixed in a place
// ({Weaponry {place {weapon ..}}}) is the weapon op.
function vehItem(n) {
  let p = 1; const tags = [];
  while (n.items[p] && n.items[p].type === 'string') tags.push(S(n.items[p++].text).replace(/^"|"$/g, ''));
  const tail = []; while (n.items[p] && n.items[p].type !== 'block' && n.items[p].type !== 'list') tail.push(n.items[p++]);
  const subs = n.items.slice(p).filter(x => x.type === 'block'), user = subs.find(x => x.name === 'user');
  const o = { node: n, name: lower(tags.join(' ')).trim().replace(/\s+/g, ' '), lastTag: n.items[tags.length], tail, n: null, mode: null, fTags: null, fN: null,
    user: user && user.items[1] ? lower(S(user.items[1].text).replace(/^"|"$/g, '')) : '', userNode: user || null };
  let q = 0;
  if (tail[q] && /^\d+$/.test(tail[q].text)) o.n = tail[q++].text;
  const w = tail[q] ? lower(tail[q].text) : '';
  if (w === 'filled') o.mode = 'filled';
  else if (w === 'filling') { o.mode = 'filling'; o.fTags = S(tail[q + 1] && tail[q + 1].text).replace(/^"|"$/g, ''); o.fN = tail[q + 2] && /^\d+$/.test(tail[q + 2].text) ? tail[q + 2].text : null; }
  return o;
}
const vehTail = o => [o.n, o.mode === 'filled' ? 'filled' : o.mode === 'filling' ? `filling "${o.fTags}"` : null, o.mode === 'filling' ? o.fN : null].filter(x => x !== null && x !== undefined).join(' ');
function vehBox(t) {
  const ent = t.root.items.find(n => n.type === 'block');
  const exts = ent ? ent.items.filter(n => n.type === 'block' && n.name === 'extender' && n.items[1] && lower(S(n.items[1].text).replace(/"/g, '')) === 'inventory') : [];
  const boxes = []; for (const e of exts) for (const b of e.items) if (b.type === 'block' && b.name === 'box') boxes.push(b);
  const items = []; for (const b of boxes) for (const n of b.items) if (n.type === 'block' && n.name === 'item') items.push(vehItem(n));
  return { ent, exts, boxes, items };
}
function opVehKit(ctx, spec) {
  const ent = S(spec.entity).trim(), where = 'vehkit ' + ent;
  const add = list(spec.add), del = list(spec.del), mount = spec.mount && typeof spec.mount === 'object' && !Array.isArray(spec.mount) ? spec.mount : {};
  if (!ent || (!add.length && !del.length && !Object.keys(mount).length)) { ctx.err('GEN_VEHKIT_ARGS', 'vehkit needs entity (a vehicle def name) and add: [{item, count, filled, filling, rounds}] and/or del: [item] and/or mount: {slot: item | false}', where); return; }
  const f = H().resolveFile(ctx, ent, where);
  if (!f) return;
  if (!f.key) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${ent} is created in this spec: the inventory edit is not shown in --plan`, where); return; }
  let buf = ctx.read(f.key); const said = [];
  const bad = (code, m) => { ctx.err(code, m, where); return false; };
  // one edit per pass: sdlwrite records its changes against the text it parsed
  const pass = fn => { let t; try { t = sdlwrite.parse(buf); } catch (e) { return bad('GEN_VEHKIT_NOT_SDL', e.message); } const r = fn(t, vehBox(t)); if (r === false) return false; buf = sdlwrite.serialize(t); return true; };
  const clean = v => lower(S(v)).trim().replace(/\s+/g, ' ');
  const newLine = (t, B, line) => {
    if (!B.ent) return bad('GEN_VEHKIT_NO_ENTITY', `${f.key}: no entity block to put the inventory in`);
    if (B.boxes.length) { const b = B.boxes[B.boxes.length - 1]; sdlwrite.insertChild(b, b.items.length, line); }
    else if (B.exts.length) { const e = B.exts[B.exts.length - 1]; sdlwrite.insertChild(e, e.items.length, '{box\n\t' + line + '\n}'); }
    else sdlwrite.insertChild(B.ent, B.ent.items.length, '{extender "inventory"\n\t{box\n\t\t' + line + '\n\t}\n}');
    return true;
  };
  for (const d of del) {
    const name = clean(d);
    if (!pass((t, B) => {
      const hit = B.items.filter(x => x.name === name);
      if (!hit.length) return bad('GEN_VEHKIT_ITEM_ABSENT', `no {item "${name}"} in the box lines of ${f.key} (its own lines: ${B.items.map(x => x.name).join(', ') || 'none'}; lines of an included file are not edited)`);
      hit.forEach(x => sdlwrite.removeNode(x.node)); said.push('- ' + name);
    })) return;
  }
  for (const a0 of add) {
    const a = typeof a0 === 'string' ? { item: a0 } : (a0 || {}), item = clean(a.item), has = k => a[k] !== undefined && a[k] !== null && a[k] !== '';
    if (!item || /["{}()]/.test(item)) return void bad('GEN_VEHKIT_ARGS', `add: item "${item}": a stuff name like "mg42" or "ammo bullet75 ap"`);
    if (!stuffKnown(ctx, item)) return void bad('GEN_VEHKIT_ITEM_UNKNOWN', `add: no set/stuff file whose name tags cover "${item}"`);
    if (has('spread') && +a.spread !== 0) return void bad('GEN_VEHKIT_ARGS', `add ${item}: a box line has no spread (a whole count only)`);
    if (has('count') && !(/^\d+$/.test(S(a.count)) && +a.count >= 1)) return void bad('GEN_VEHKIT_ARGS', `add ${item}: count "${S(a.count)}" must be a whole number >= 1`);
    if (has('rounds') && !(/^\d+$/.test(S(a.rounds)) && +a.rounds >= 1)) return void bad('GEN_VEHKIT_ARGS', `add ${item}: rounds "${S(a.rounds)}" must be a whole number >= 1`);
    const fill = has('filling') && a.filling !== false ? clean(a.filling) : null;
    if (fill && /["{}()]/.test(fill)) return void bad('GEN_VEHKIT_ARGS', `add ${item}: filling "${fill}": a stuff name like "ammo mgun"`);
    if (fill && truthy(a.filled)) return void bad('GEN_VEHKIT_ARGS', `add ${item}: filled (the weapon's own ammunition) or filling (named ammunition), not both`);
    if (!fill && truthy(a.filled) && has('rounds')) return void bad('GEN_VEHKIT_ARGS', `add ${item}: a box line reads "filled" without a number (one load); give filling: "<ammo>" with rounds`);
    if (!pass((t, B) => {
      const have = B.items.filter(x => x.name === item);
      if (have.length > 1) return bad('GEN_VEHKIT_ITEM_EXISTS', `add: "${item}" has ${have.length} lines in the box; del it and add one line with the count`);
      const old = have[0] || null, o = old ? { n: old.n, mode: old.mode, fTags: old.fTags, fN: old.fN } : { n: null, mode: null, fTags: null, fN: null };
      if (old && !['count', 'filled', 'filling', 'rounds'].some(has)) return bad('GEN_VEHKIT_ITEM_EXISTS', `add: "${item}" is in the box already; give count (or filled) to set its line, or del it first`);
      if (has('count')) o.n = +a.count === 1 && !(old && old.n !== null) ? null : String(+a.count);
      if (fill) {
        const kept = old && old.mode === 'filling' && clean(old.fTags) === fill;
        if (!kept && !stuffKnown(ctx, fill)) return bad('GEN_VEHKIT_ITEM_UNKNOWN', `add ${item}: filling: no set/stuff file whose name tags cover "${fill}"`);
        o.mode = 'filling'; o.fTags = kept ? old.fTags : ctx.bytes(fill); o.fN = has('rounds') ? String(+a.rounds) : (kept ? old.fN : null);
      } else if (a.filled !== undefined && a.filled !== null) { if (truthy(a.filled)) { o.mode = 'filled'; o.fTags = null; o.fN = null; } else { o.mode = null; o.fTags = null; o.fN = null; } }
      else if (a.filling !== undefined) { o.mode = null; o.fTags = null; o.fN = null; }
      else if (has('rounds')) { if (o.mode !== 'filling') return bad('GEN_VEHKIT_ARGS', `add ${item}: rounds without filling: name the ammunition that is loaded`); o.fN = String(+a.rounds); }
      const now = vehTail(o);
      if (!old) { const line = `{item "${ctx.bytes(item)}"${now ? ' ' + now : ''}}`; said.push('+ ' + line); return newLine(t, B, line); }
      const was = vehTail(old);
      if (was === now) { ctx.info('GEN_KIT_COUNT_SAME', `"${item}" is ${was || '1'} already`, where); return true; }
      if (old.tail.length) { if (now) { sdlwrite.setValue(old.tail[0], now); old.tail.slice(1).forEach(x => sdlwrite.removeNode(x)); } else old.tail.forEach(x => sdlwrite.removeNode(x)); }
      else sdlwrite.setValue(old.lastTag, old.lastTag.text + ' ' + now);
      said.push(`${item} ${was || '1'} -> ${now || '1'}`);
    })) return;
  }
  for (const s0 of Object.keys(mount)) {
    const slot = clean(s0), want = mount[s0] === false || mount[s0] === null || /^(|none|false|no|-)$/i.test(S(mount[s0]).trim()) ? null : clean(mount[s0]);
    if (!/^[a-z0-9_]+$/.test(slot)) return void bad('GEN_VEHKIT_ARGS', `mount: slot "${slot}": the name of a weapon place (mgun, mgun1 ..)`);
    if (want && (/["{}()]/.test(want) || !stuffKnown(ctx, want))) return void bad('GEN_VEHKIT_ITEM_UNKNOWN', `mount ${slot}: no set/stuff file whose name tags cover "${want}"`);
    let was = null, same = false;
    // 1. what is mounted leaves the slot (its line stays in the box)
    if (!pass((t, B) => {
      const cur = B.items.filter(x => x.user === slot);
      was = cur.length ? cur[0].name : null;
      if (want && cur.length === 1 && cur[0].name === want) { same = true; return true; }
      if (!want && !cur.length) return bad('GEN_VEHKIT_SLOT_EMPTY', `mount ${slot}: no box line of ${f.key} has {user "${slot}"} (a line of an included file is not edited)`);
      cur.forEach(x => sdlwrite.removeNode(x.userNode));
    })) return;
    if (same) { ctx.info('GEN_KIT_COUNT_SAME', `slot ${slot} holds "${want}" already`, where); continue; }
    // 2. the new weapon: its own unmounted line takes the {user}, else a new loaded line
    if (want && !pass((t, B) => {
      const line = B.items.find(x => x.name === want && !x.user);
      if (line && line.n !== null && +line.n !== 1) return bad('GEN_VEHKIT_MOUNT_COUNT', `mount ${slot}: the box line of "${want}" holds ${line.n}; a mounted weapon is one item (set its count to 1 or del the line first)`);
      if (line) { sdlwrite.insertChild(line.node, line.node.items.length, `{user "${slot}"}`); return true; }
      return newLine(t, B, `{item "${ctx.bytes(want)}" filled {user "${slot}"}}`);
    })) return;
    said.push(`slot ${slot}: ${was || 'empty'} -> ${want || 'empty'}`);
  }
  if (!said.length) { ctx.info('GEN_KIT_COUNT_SAME', `${ent}: the inventory is like that already`, where); return; }
  put(ctx, f.key, buf, where);
  ctx.facts.push(`vehkit: ${ent}: ${said.join(', ')}`);
  ctx.test.push(`vehkit: ${ent}: spawn it and open its inventory: ${said.join(', ')}; a weapon mounted in a slot fires, and taken out it can be put back by using it [T].`);
}

// ---- wear: the entity a soldier wears (the op "skin" of ops-asset makes a new skin; this one picks one); texmod: the texture variant a model shows -----------------------------------------------
// wear {breed, army?, period?, skin}                                                          (opWear; called by the Units page)
//   {breed {skin "name"}} is the breed's field "skin" ([V]); the engine's own list of names
//   is the .def files under /entity/humanskin (:24 [V]); a breed without the line wears "skeleton" (:71-73 [V]). The soldier takes the
//   views of that entity's bones ( [V]). Only the line written in the breed file itself is set: a breed
//   whose block holds an include or a ( ) call and no own line is refused (the line may come from there).
// texmod {entity, variant: name | false, as?: new def name}                                  (opTexmod; called by the Units page)
//   {texmod "variant"} in an entity def is the model's texture modification as read ( ->
//    ReadTexMod -> [V]): every texture of the model that has a
//   file "<texture>#<variant>.<ext>" shows that file ([V]); a variant no texture has is
//   dropped when the model starts ( TEXMODS_VALIDATE [V]). The reader casts the model without a check
//   so the line must come after the line that loads the model ({extension "x.mdl"}) [I: a line before it was not tried]: the op
//   writes it right after the def's own {extension} line and refuses a def that has none. variant false takes the line out.
//   as: the edited text is written as a new def of that name beside the old one (how vanilla makes ger2_officer.def from
//   ger_officer.mdl + {texmod "camo"} [V data]); the old def is not touched. The {extension} of a def names its model by a path
//   from the def's folder, so the copy shows the same model.
function opWear(ctx, spec) {
  let b = S(spec.breed).trim().replace(/^mp\//i, ''), army = lower(S(spec.army)), period = S(spec.period || (ctx.goh ? 'late' : ''));
  const parts = b.split('/'), where = 'wear ' + b, skin = lower(S(spec.skin).trim());
  if (parts.length === 3 && ctx.goh) [army, period, b] = parts; else if (parts.length === 2) [army, b] = parts; else if (parts.length !== 1) b = '';
  b = lower(b);
  if (!/^[a-z0-9_]+$/.test(b) || !O.FACTION.test(army) || !ID.test(skin)) { ctx.err('GEN_WEAR_ARGS', 'wear needs breed (rus/rifle, or rifle with army: rus) and skin: the name of a def under entity/humanskin', where); return; }
  const key = H().breedKey(ctx, army, b, period);
  if (!ctx.read(key)) {
    if (ctx.virt.has('breed:' + army + ':' + b)) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${army}/${b} is made by an earlier breed op: the skin edit is not shown in --plan`, where); return; }
    ctx.err('GEN_WEAR_BREED_UNKNOWN', `no breed file ${key}`, where); return;
  }
  if (!ctx.keys(new RegExp('^resource/entity/humanskin/(?:.*/)?' + esc(skin) + '\\.def$')).length && !ctx.virt.has('entity:' + skin)) {
    ctx.err('GEN_WEAR_UNKNOWN', `no resource/entity/humanskin/**/${skin}.def in the mod or base data (the game warns "Undefined skin" and the soldier keeps the bare skeleton)`, where); return;
  }
  let t; try { t = sdlwrite.parse(ctx.read(key)); } catch (e) { ctx.err('GEN_WEAR_NOT_SDL', e.message, where); return; }
  const br = t.root.items.find(n => n.type === 'block' && n.name === 'breed');
  if (!br) { ctx.err('GEN_WEAR_NO_BREED', 'the file has no {breed ..} block', where); return; }
  const own = br.items.filter(n => n.type === 'block' && n.name === 'skin');
  if (own.length > 1) { ctx.err('GEN_WEAR_MANY', `${key} has ${own.length} {skin ..} lines; leave one`, where); return; }
  let was = '';
  if (!own.length) {
    if (br.items.some(n => n.type === 'list')) { ctx.err('GEN_WEAR_INHERITED', `${key} has no {skin ..} line of its own and its block calls other files; the skin may come from there`, where); return; }
    sdlwrite.insertChild(br, 1, `{skin "${skin}"}`);
  } else {
    const v = own[0].items[1];
    if (!v || (v.type !== 'string' && v.type !== 'atom')) { ctx.err('GEN_WEAR_FORM', `${key}: the {skin ..} line names no entity`, where); return; }
    was = lower(S(v.text).replace(/^"|"$/g, ''));
    if (was === skin) { ctx.info('GEN_WEAR_SAME', `${army}/${b} wears "${skin}" already`, where); return; }
    sdlwrite.setValue(v, `"${skin}"`);
  }
  put(ctx, key, sdlwrite.serialize(t), where);
  ctx.facts.push(`skin: ${army}/${b}: ${was || 'skeleton'} -> ${skin}`);
  ctx.test.push(`skin: ${army}/${b}: buy this soldier; he wears "${skin}" and game.log has no "Undefined skin" line [T].`);
}
const VARIANT = /^[a-z0-9_][a-z0-9_.\-]*$/i;
function opTexmod(ctx, spec) {
  const ent = S(spec.entity).trim(), where = 'texmod ' + ent, off = spec.variant === false || spec.variant === null || /^(|none|false|no|-)$/i.test(S(spec.variant).trim());
  const variant = off ? null : lower(S(spec.variant).trim()), as = spec.as === undefined || spec.as === null || spec.as === '' ? null : lower(S(spec.as).trim());
  if (!ent || spec.variant === undefined || (variant && !VARIANT.test(variant)) || (as && !ID.test(as))) { ctx.err('GEN_TEXMOD_ARGS', 'texmod needs entity (a def name) and variant: the part after # in a texture file name, or false for none; as: the name of a new def', where); return; }
  const f = H().resolveFile(ctx, ent, where);
  if (!f) return;
  if (!f.key) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${ent} is created in this spec: the texmod edit is not shown in --plan`, where); return; }
  if (!/\.def$/.test(f.key)) { ctx.err('GEN_TEXMOD_ARGS', `${f.key} is not an entity def`, where); return; }
  let t; try { t = sdlwrite.parse(ctx.read(f.key)); } catch (e) { ctx.err('GEN_TEXMOD_NOT_SDL', e.message, where); return; }
  const top = t.root.items.find(n => n.type === 'block');
  if (!top) { ctx.err('GEN_TEXMOD_NO_ENTITY', `${f.key}: no entity block`, where); return; }
  const own = top.items.filter(n => n.type === 'block' && n.name === 'texmod'), ext = top.items.filter(n => n.type === 'block' && n.name === 'extension');
  if (own.length > 1) { ctx.err('GEN_TEXMOD_MANY', `${f.key} has ${own.length} {texmod ..} lines; leave one`, where); return; }
  const v = own.length ? own[0].items[1] : null, named = !!v && (v.type === 'string' || v.type === 'atom');
  const was = named ? lower(S(v.text).replace(/^"|"$/g, '')) : '';
  let nk = f.key;
  if (as) {
    if (!ext.length) { ctx.err('GEN_TEXMOD_NO_EXTENSION', `${f.key} has no {extension "x.mdl"} line of its own, so a copy under another name would have no model`, where); return; }
    nk = f.key.slice(0, f.key.lastIndexOf('/') + 1) + as + '.def';
    const taken = ctx.keys(new RegExp('^resource/entity/(?:.*/)?' + esc(as) + '\\.def$'));
    if (taken.length || ctx.virt.has('entity:' + as)) { ctx.err('GEN_TEXMOD_EXISTS', `an entity "${as}" exists already (${taken[0] || 'made earlier in this spec'})`, where); return; }
  }
  if (!variant) {
    if (!own.length && !as) { ctx.err('GEN_TEXMOD_ABSENT', `${f.key} has no {texmod ..} line of its own (a line of an included file is not edited)`, where); return; }
    if (own.length) sdlwrite.removeNode(own[0]);
  } else if (own.length) {
    if (!named) { ctx.err('GEN_TEXMOD_FORM', `${f.key}: the {texmod ..} line sets textures one by one and names no variant; it is not edited here`, where); return; }
    if (was === variant && !as) { ctx.info('GEN_TEXMOD_SAME', `${ent} shows "${variant}" already`, where); return; }
    if (was !== variant) sdlwrite.setValue(v, `"${variant}"`);
  } else {
    if (!ext.length) { ctx.err('GEN_TEXMOD_NO_EXTENSION', `${f.key} has no {extension "x.mdl"} line of its own; the texmod line must follow the line that loads the model`, where); return; }
    const last = ext[ext.length - 1];
    sdlwrite.insertChild(top, top.items.indexOf(last) + 1, `{texmod "${variant}"}`);
  }
  put(ctx, nk, sdlwrite.serialize(t), where);
  if (as) ctx.virt.add('entity:' + as);
  const name = nk.slice(nk.lastIndexOf('/') + 1, -4);
  ctx.facts.push(`texmod: ${name}: ${was || 'none'} -> ${variant || 'none'}${as ? ' (new def beside ' + f.key + ')' : ''}`);
  ctx.test.push(`texmod: ${name}: spawn it on a map that sets no texture variant of its own; it shows its "${variant || 'plain'}" textures [T].`);
}

// ---- breed: del: (inventory items / perk lines), decl: fields through a macro call (called from ops.js opBreed) ------------------
function breedDel(ctx, buf, del, where) {
  if (del === undefined || del === null) return buf;
  const o = Array.isArray(del) || typeof del !== 'object' ? { items: list(del) } : del;
  let out = buf;
  if (list(o.items).length) { const r = kitEdit(ctx, out, [], list(o.items), where); if (!r) return null; out = r.buf; ctx.facts.push(`breed del: ${r.said.join(', ')}`); }
  if (list(o.perks).length) {
    const t = sdlwrite.parse(out), pk = sdlwrite.find(t, 'breed/perks');
    for (const p of list(o.perks)) {
      const hit = pk ? pk.items.filter(n => n.type === 'block' && n.name === lower(S(p))) : [];
      if (!hit.length) { ctx.err('GEN_BREED_DEL_ABSENT', `no {"${S(p)}" ..} perk line (perks: ${pk ? pk.items.filter(n => n.type === 'block').map(n => n.name).join(' ') : 'no {perks} block'})`, where); return null; }
      hit.forEach(n => sdlwrite.removeNode(n));
    }
    out = sdlwrite.serialize(t); ctx.facts.push(`breed del perks: ${list(o.perks).map(S).join(' ')}`);
  }
  return out;
}
// {"mp/<army>/<name>" ("macro" side(x))} -> {"mp/<army>/<name>" <define body with the args put in>}; null when it is not a macro call or the define is not found
function expandDecl(ctx, text, keys, where) {
  let t; try { t = sdlwrite.parse(Buffer.from(text, 'latin1')); } catch (e) { return null; }
  const blk = t.root.items.find(n => n.type === 'block');
  const call = blk && blk.items.find(n => n.type === 'list' && n.items[0] && n.items[0].type === 'string');
  if (!call) return null;
  const mac = call.items[0].text.replace(/"/g, ''), def = findDefine(ctx, mac, keys);
  if (!def) { ctx.err('GEN_BREED_DECL_MACRO_UNDEFINED', `the declaration calls ("${mac}" ..) and no (define "${mac}") was found to expand`, where); return null; }
  const sub = substitute(def.body.replace(/^\s*\n/, ''), call, t.src);
  if (sub.dropped.length) ctx.info('GEN_DECL_PARAM_DROPPED', `("${mac}") lines with a %param the call does not give were left out: ${sub.dropped.join(' | ')}`, where);
  const rest = blk.items.filter(n => n !== call && n !== blk.items[0]).map(n => t.src.slice(n.start, n.end));
  const ind = /^[ \t]*/.exec(text)[0];
  return [ind + '{' + blk.items[0].text, ...reindent(sub.text, ind + '\t'), ...rest.map(r => ind + '\t' + r), ind + '}'].join('\n');
}
// returns the new declaration text, or null when a field could not be set (the breed op then writes nothing)
function declFields(ctx, text, fields, d, where) {
  const ks = Object.keys(fields || {}), e0 = ctx.rep.counts.GEN_FIELD_UNKNOWN || 0;
  const plain = () => { const r = H().applyFields(ctx, text, fields, where); return (ctx.rep.counts.GEN_FIELD_UNKNOWN || 0) > e0 ? null : r; };
  if (!ks.length || ks.every(k => H().setField(text, k, 'x') !== null)) return plain();
  const ex = expandDecl(ctx, text, [d.key, ...ctx.keys(/^resource\/set\/multiplayer\/units\/.*\.(set|inc)$/)], where);
  if (!ex) return plain();
  ctx.info('GEN_BREED_DECL_EXPANDED', `the declaration was a macro call; written as an expanded block so ${ks.join(' ')} can be set (the other soldiers on that macro keep theirs)`, where);
  let out = ex;
  for (const [k, v] of Object.entries(fields)) { const r = setKey(ctx, out, k, v, false); if (r === null) ctx.err('GEN_FIELD_UNKNOWN', `the expanded declaration has no {${k} ..} (keys: ${[...out.matchAll(/\{\s*([A-Za-z_]\w*)/g)].map(m => m[1]).join(' ')})`, where); else out = r; }
  return (ctx.rep.counts.GEN_FIELD_UNKNOWN || 0) > e0 ? null : out;
}

// ---- card: fields, tag words and flag keys of an existing (or a copied) card ---------------------------------------------------
// price cp score icon are short for fields cost cp score icon; tags: ["word", "-word"]; not_for_sale / basic / remove: true adds the
// bare {key}, false takes it out (mp-units: same-name cards MERGE, tags too, so a removal is written into the card itself)
const CARD_SHORT = { price: 'cost', cp: 'cp', score: 'score', icon: 'icon' }, CARD_FLAGS = ['not_for_sale', 'basic', 'remove'];
const CARD_KEYS = new Set(['charge', 'fore', 'group', 'icon', 'button', 'cost', 'cp', 'score', 'cw', 'level', 'info']);
// what the spec changes on the card block ('' = nothing)
function cardEdits(spec) {
  const o = [];
  if (spec.fields && Object.keys(spec.fields).length) o.push('fields');
  // spelled out (not spec[k]) so the schema drift test sees which card fields the code reads
  const v = { price: spec.price, cp: spec.cp, score: spec.score, icon: spec.icon, tags: list(spec.tags).length ? spec.tags : undefined, not_for_sale: spec.not_for_sale, basic: spec.basic, remove: spec.remove };
  for (const k of [...Object.keys(CARD_SHORT), 'tags', ...CARD_FLAGS]) if (v[k] !== undefined) o.push(k);
  return o.join(' ');
}
const flagRe = f => new RegExp('\\{\\s*' + f + '\\s*\\}', 'i');
function cardEdit(ctx, text, spec, keys, where) {
  const fields = Object.assign({}, spec.fields || {});
  for (const [k, f] of Object.entries(CARD_SHORT)) if (spec[k] !== undefined) fields[f] = spec[k];
  const words = list(spec.tags).map(w => S(w).trim());
  const badW = words.find(w => !/^-?[A-Za-z0-9_]+$/.test(w));
  if (badW !== undefined) { ctx.err('GEN_CARD_TAGS_BAD', `tags "${badW}": a tag word (ASCII letters digits _) to add, or -word to take out`, where); return null; }
  for (const f of CARD_FLAGS) if (spec[f] !== undefined && !/^(true|false|yes|no|1|0)$/i.test(S(spec[f]))) { ctx.err('GEN_CARD_FLAG_BAD', `${f} "${S(spec[f])}": true (add {${f}}) or false (take it out)`, where); return null; }
  let out = text, expanded = false;
  // a key not in the card text: expand the card's macro call ({"x" ("macro" args)} -> the define body) once and look again
  const expand = () => {
    if (expanded) return false;
    const ex = expandDecl(ctx, out, keys, where); if (!ex) return false;
    out = ex; expanded = true;
    ctx.info('GEN_CARD_EXPANDED', `the card was a macro call; written as an expanded block so it can be changed (the other cards on that macro keep theirs)`, where);
    return true;
  };
  // the card's own macro (one level) mentions {k ..} or k(..): only then is an expansion worth it
  const macroHas = k => { if (expanded) return false; const c = /^\s*\{\s*"[^"]+"\s*\(\s*"([^"]+)"/.exec(out), d = c && findDefine(ctx, c[1], keys); return !!d && new RegExp('\\{\\s*' + esc(k) + '[\\s}]|[\\s(]' + esc(k) + '\\(', 'i').test(d.body); };
  const said = [];
  for (const [k0, v] of Object.entries(fields)) {
    const k = lower(k0), val = ctx.bytes(S(v)), tryset = () => H().setField(out, k, val) || (k === 'score' ? H().setField(out, 'sc', val) : null);
    let r = tryset();
    if (r === null && (macroHas(k) || (k === 'score' && macroHas('sc'))) && expand()) r = tryset();
    if (r === null && CARD_KEYS.has(k)) { r = addChild(out, `{${k} ${val}}`); if (r === null) { ctx.err('GEN_CARD_NOT_SDL', 'the card block does not parse', where); return null; } out = r; said.push(`+{${k} ${val}}`); continue; }
    if (r === null) { ctx.err('GEN_FIELD_UNKNOWN', `card has no field "${k0}" ({${k0} ..} or ${k0}(..)) to set, and it is not a card key (${[...CARD_KEYS].join(' ')}) to add`, where); return null; }
    out = r; said.push(`${k} ${val}`);
  }
  if (words.length) {
    const find = () => /(\{\s*tags\s+")([^"]*)(")/i.exec(out) || /((?:^|[\s(])t\()([^()]*)(\))/.exec(out);
    let m = find();
    if (!m && expand()) m = find();
    if (!m) { ctx.err('GEN_CARD_NO_TAGS', 'the card has no {tags ".."} nor t(..) to edit', where); return null; }
    const ws = m[2].trim().split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (w[0] === '-') {
        const i = ws.findIndex(x => lower(x) === lower(w.slice(1)));
        if (i < 0) { ctx.err('GEN_CARD_TAG_ABSENT', `tag "${w.slice(1)}" is not in ${m[0].trim()}${/\bt\($/.test(m[1]) ? ' (the macro adds the side tag itself, which a card cannot drop)' : ''}`, where); return null; }
        ws.splice(i, 1);
      } else if (!ws.some(x => lower(x) === lower(w))) ws.push(w);
    }
    out = out.slice(0, m.index) + m[1] + ws.join(' ') + m[3] + out.slice(m.index + m[0].length);
    said.push('tags ' + words.join(' '));
  }
  for (const f of CARD_FLAGS) {
    if (spec[f] === undefined) continue;
    const on = truthy(spec[f]);
    if (on) {
      if (flagRe(f).test(out)) { ctx.info('GEN_CARD_FLAG_SET', `{${f}} is on the card already`, where); continue; }
      if (!expanded) { const call = /^\s*\{\s*"[^"]+"\s*\(\s*"([^"]+)"/.exec(out), def = call && findDefine(ctx, call[1], keys); if (def && flagRe(f).test(def.body)) { ctx.info('GEN_CARD_FLAG_SET', `{${f}} comes from the card's macro ("${call[1]}") already`, where); continue; } }
      const r = addChild(out, `{${f}}`);
      if (r === null) { ctx.err('GEN_CARD_NOT_SDL', 'the card block does not parse', where); return null; }
      out = r; said.push(`+{${f}}`);
    } else {
      if (!flagRe(f).test(out)) expand();
      if (!flagRe(f).test(out)) { ctx.err('WARN_GEN_CARD_FLAG_ABSENT', `{${f}} is not on the card (nor in its macro): nothing to take out`, where); continue; }
      const ls = out.split('\n'), li = ls.findIndex(l => flagRe(f).test(l));
      if (!ls[li].replace(flagRe(f), '').trim()) ls.splice(li, 1); else ls[li] = ls[li].replace(new RegExp('[ \\t]*\\{\\s*' + f + '\\s*\\}', 'i'), '');
      out = ls.join('\n');
      said.push(`-{${f}}`);
    }
  }
  if (said.length) ctx.info('GEN_CARD_EDIT', said.join(', '), where);
  return out;
}
// append a child block to the card block text (multi-line: its own line, one line: inline)
function addChild(text, child) {
  let t; try { t = sdlwrite.parse(Buffer.from(text, 'latin1')); } catch (e) { return null; }
  const blk = t.root.items.find(n => n.type === 'block'); if (!blk) return null;
  sdlwrite.insertChild(blk, blk.items.length, child);
  return sdlwrite.serialize(t).toString('latin1');
}

// ---- card list: (co-op / single-player price) --------------------------------------------------------------------------------
const UNITS = 'resource/set/multiplayer/units/';
function opCardList(ctx, spec) {
  const unit = S(spec.unit), army = S(spec.army), lst = lower(S(spec.list)).trim(), where = 'card ' + unit + ' list ' + lst;
  if (ctx.goh) { ctx.notFor('GEN_CARD_LIST_AS2_ONLY', 'card list', 'GoH unit lists are per period (units/<period>/units_<army>.set, roster_<period>.set, only_roster_<period>.set), not the AS2 units/<list>.set with a common.set include; that list form is not mapped (use card or roster with period:)', 'vanilla GoH resource/set/multiplayer/units/<period>/units_<army>.set and roster_<period>.set', where); return; }
  if (!/^[a-z0-9_]+$/.test(lst) || lst === 'common') { ctx.err('GEN_CARD_LIST_ARGS', `list "${S(spec.list)}": a game type or class name (cooperative, ..); common is the default list, drop list: for it`, where); return; }
  if (!spec.fields || typeof spec.fields !== 'object' || !Object.keys(spec.fields).length) { ctx.err('GEN_CARD_LIST_ARGS', 'card list: needs fields (cost, level ..) to change for that list', where); return; }
  const card = H().findCard(ctx, H().unitFiles(ctx, army, '', 'vehicle'), unit, army);
  if (!card) { ctx.err('GEN_CARD_UNKNOWN', `no card "${unit}" for army ${army} in the army lists`, where); return; }
  const lk = UNITS + lst + '.set';
  let base = ctx.readStr(lk), made = false;
  if (base === null) {
    base = ctx.readStr(UNITS + 'common.set');
    if (base === null) { ctx.err('GEN_CARD_LIST_NO_COMMON', `no ${UNITS}common.set to copy the include list from`, where); return; }
    made = true;
  }
  const f = H().splitLines(Buffer.from(base, 'latin1')), lines = f.lines, eol = made ? '\r\n' : f.eol;
  const re = new RegExp('^\\s*\\{\\s*"' + esc(unit) + '"(\\s|\\()', 'i'), i = lines.findIndex(l => re.test(l));
  if (i >= 0) {
    const j = H().blockEnd(lines, i);
    const nb = H().applyFields(ctx, lines.slice(i, j + 1).join('\n'), spec.fields, where);
    lines.splice(i, j - i + 1, ...nb.split('\n'));
  } else {
    const nb = H().applyFields(ctx, card.lines.slice(card.i, card.j + 1).join('\n'), spec.fields, where);
    const u = lines.findIndex(l => /^\s*\{\s*units\b/i.test(l)), ue = u < 0 ? -1 : H().blockEnd(lines, u);
    const ins = ['\t; gen card list: ' + unit + ' for ' + lst, ...nb.split('\n').map(l => '\t' + l.replace(/^\s+/, ''))];
    if (ue < 0) lines.push(...ins);
    else if (lines[ue].trim() === '}') lines.splice(ue, 0, ...ins);
    else { lines[ue] = lines[ue].replace(/\}(\s*)$/, ''); lines.splice(ue + 1, 0, ...ins, '}'); }
  }
  put(ctx, lk, lines.join(eol), where);
  if (made) ctx.info('GEN_CARD_LIST_MADE', `${lk} = the common.set include list + the override card: the engine reads only the first of <gameType>.set, <gameClass>.set, common.set (TST-94), so ${lst} games read this list instead of common.set [T]`, where);
  if (!ctx.exists('resource/set/multiplayer/games/' + lst + '.set')) ctx.err('WARN_GEN_CARD_LIST_NO_MODE', `no game mode games/${lst}.set: the list is read only when "${lst}" is a game type or class name the engine uses [I]`, where);
  ctx.facts.push(`card list: ${unit} (${army}) in ${lk.split('/').pop()}${made ? ' (new list)' : ''}: ${Object.entries(spec.fields).map(([k, v]) => k + ' ' + S(v)).join(', ')}`);
  ctx.test.push(`card list: start a ${lst} game as ${army}: ${unit} shows the new values in the purchase panel; a normal multiplayer game still shows the stock ones (TST-94) [T].`);
}

// ---- squad: content / order / not_for_sale / remove / more than 4 member types (called from ops.js opSquad) ----------------
const squadX = spec => spec.change !== undefined || spec.content !== undefined || spec.order !== undefined || spec.not_for_sale !== undefined || spec.remove !== undefined || new Set(list(spec.members).map(m => lower(typeof m === 'string' ? m.split(':')[0] : S(m && m.breed)))).size > 4;
// squad lines / blocks of one army in a squad file: [{i, j, name}]
function squadRows(ctx, lines, army) {
  const out = [], side = new RegExp('\\bside\\(' + esc(army) + '\\)', 'i');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\(\s*"(?:squad|single)_with\w*"[^\n]*\bname\(([^()]+)\)/i.exec(lines[i]);
    if (m && (ctx.goh || side.test(lines[i]))) { out.push({ i, j: i, name: lower(m[1]) }); continue; }
    const b = /^\s*\{\s*"([^"(]+)\(([^)"]+)\)"/.exec(lines[i]);
    if (b && (ctx.goh || lower(b[2]) === lower(army))) { const j = H().blockEnd(lines, i); if (j >= 0) { out.push({ i, j, name: lower(b[1]) }); i = j; } }
  }
  return out;
}
function orderAt(ctx, rows, order, where) {
  const o = lower(S(order));
  if (o === 'first') return rows.length ? rows[0].i : null;
  if (o === 'last') return rows.length ? rows[rows.length - 1].j + 1 : null;
  const r = rows.find(x => x.name === o);
  if (!r) { ctx.err('GEN_SQUAD_ORDER_UNKNOWN', `order "${S(order)}": first, last or a squad of this army to go after (${rows.slice(0, 12).map(x => x.name).join(' ')}${rows.length > 12 ? ' ..' : ''})`, where); return undefined; }
  return r.j + 1;
}
function opSquadX(ctx, spec) {
  const name = S(spec.name), like = S(spec.like), army = S(spec.army), period = S(spec.period || (ctx.goh ? 'late' : '')), where = 'squad ' + name;
  if (!O.SQUAD_NAME.test(name) || !O.FACTION.test(army)) { ctx.err('GEN_SQUAD_ARGS', 'squad needs name and army', where); return; }
  const files = H().unitFiles(ctx, army, period, 'squad');
  if (!files.length) { ctx.err('GEN_ROSTER_NO_FILE', `no squad list for army ${army}${ctx.goh ? ' period ' + period : ''}`, where); return; }
  const find = n => { for (const key of files) { const f = lines0(ctx, key); if (!f) continue; const rows = squadRows(ctx, f.lines, army), r = rows.find(x => x.name === lower(n)); if (r) return Object.assign({ key, rows }, f, r); } return null; };
  if (truthy(spec.change)) return squadChange(ctx, spec, find, files, where);
  // remove: a {"<name>(<army>)" {remove}} block after the squad drops it from the list [T]
  if (truthy(spec.remove)) {
    if (ctx.goh) { ctx.notFor('GEN_SQUAD_REMOVE_AS2_ONLY', 'squad remove', 'it writes the AS2 {"<name>(<army>)" {remove}} form; GoH squad lines are ("squad_withNtypes" .. name() period()) in per-period files with no such key, and no GoH remove form is known', 'vanilla GoH units/<period>/units_<army>.set', where); return; }
    const h = find(name);
    if (!h) { ctx.err('GEN_SQUAD_REMOVE_UNKNOWN', `no squad ${name} for ${army} to remove`, where); return; }
    const tag = `{"${name}(${army})" {remove}}`;
    if (h.lines.some(l => l.includes(tag))) { ctx.err('GEN_SQUAD_EXISTS', `${name}(${army}) is removed already`, where); return; }
    const lines = h.lines.slice(); lines.splice(h.j + 1, 0, tag + '\t; gen: squad taken off the list');
    put(ctx, h.key, lines.join(h.eol), where);
    ctx.facts.push(`squad: ${name} (${army}) removed: ${tag}`);
    ctx.test.push(`squad remove: ${name} (${army}): the purchase panel no longer shows it; game.log has no unit-list error [T, not seen working].`);
    return;
  }
  const mem = list(spec.members).map(m => typeof m === 'string' ? { breed: m.split(':')[0], n: +(m.split(':')[1] || 1) } : { breed: S(m && m.breed), n: +((m && (m.n || m.count)) || 1) });
  const block = new Set(mem.map(m => lower(m.breed))).size > 4 || spec.content !== undefined || truthy(spec.not_for_sale);
  // order: checked before anything is written
  if (spec.order !== undefined && !/^(first|last)$/i.test(S(spec.order))) {
    const rows = files.flatMap(k => { const f = lines0(ctx, k); return f ? squadRows(ctx, f.lines, army) : []; });
    if (orderAt(ctx, rows, spec.order, where) === undefined) return;
  }
  if (!block) {
    // order only: the plain macro line (ops.js opSquad), then moved; a refusal there (exists, unknown breed ..) stops here too
    const hard = () => Object.entries(ctx.rep.counts).filter(([k]) => !/^WARN_/.test(k)).reduce((a, [, n]) => a + n, 0), c0 = hard();
    O.opSquad(ctx, Object.assign({}, spec, { order: undefined, not_for_sale: undefined, remove: undefined, content: undefined }));
    const h = find(name);
    if (!h || hard() > c0) return;
    const rows = h.rows.filter(r => r.i !== h.i), lines = h.lines.slice(), [ln] = lines.splice(h.i, 1);
    const fix = rows.map(r => r.i > h.i ? { i: r.i - 1, j: r.j - 1, name: r.name } : r);
    const at = orderAt(ctx, fix, spec.order, where);
    if (at === undefined || at === null) return;
    lines.splice(at, 0, ln);
    put(ctx, h.key, lines.join(h.eol), where);
    ctx.facts.push(`squad order: ${name} (${army}) at ${lower(S(spec.order))}`);
    return;
  }
  if (!like) { ctx.err('GEN_SQUAD_ARGS', 'squad needs like (an existing squad: its charge, group, button, tags, level, cost are the start)', where); return; }
  if (!mem.length && spec.content === undefined) { ctx.err('GEN_SQUAD_ARGS', 'squad needs members [breed:n ..] or content', where); return; }
  if (mem.some(m => !m.breed || !(m.n >= 1))) { ctx.err('GEN_SQUAD_ARGS', 'members need breed and n>=1', where); return; }
  if (spec.content !== undefined && (/["{}]/.test(S(spec.content)) || !S(spec.content).trim())) { ctx.err('GEN_SQUAD_CONTENT_BAD', `content "${S(spec.content)}": the text inside {content ".."}, without quotes or braces, e.g. "m3 ( mp/rus/sturmovik:6 mp/rus/sturmovik2:2 )"`, where); return; }
  const h = find(like);
  if (!h || h.i !== h.j) { ctx.err('GEN_SQUAD_LIKE_MISSING', `no squad line with name(${like}) for army ${army} in ${files.join(', ')}`, where); return; }
  if (find(name)) { ctx.err('GEN_SQUAD_EXISTS', `squad ${name} already exists for ${army}`, where); return; }
  if (!H().checkLoaded(ctx, h.key, 'a squad')) return;
  for (const m of mem) {
    const bk = H().breedKey(ctx, army, m.breed, period);
    if (!ctx.exists(bk) && !ctx.virt.has('breed:' + army + ':' + lower(m.breed))) { ctx.err('GEN_SQUAD_BREED_UNKNOWN', `breed "${m.breed}" has no ${bk} (squad member names are breeds, not entities)`, where); return; }
  }
  // expand the like's macro line into a card block
  let t; try { t = sdlwrite.parse(Buffer.from(h.lines[h.i], 'latin1')); } catch (e) { t = null; }
  const call = t && t.root.items.find(n => n.type === 'list');
  const mac = call && call.items[0] && call.items[0].type === 'string' ? call.items[0].text.replace(/"/g, '') : '';
  const def = mac ? findDefine(ctx, mac, [h.key, ...ctx.keys(/^resource\/set\/(multiplayer\/units|breed)\/.*\.(set|inc)$/)]) : null;
  if (!def) { ctx.err('GEN_SQUAD_MACRO_UNDEFINED', `the ${like} line calls ("${mac}" ..) and no (define "${mac}") was found to expand into a card block`, where); return; }
  const sub = substitute(def.body.replace(/^\s*\n/, ''), call, t.src);
  if (sub.dropped.length) ctx.info('GEN_DECL_PARAM_DROPPED', `("${mac}") lines with a %param the ${like} line does not give were left out: ${sub.dropped.join(' | ')}`, where);
  let blk = reindent(sub.text, '').join('\n');
  const first = /^\{\s*"([^"]+)"/.exec(blk);
  if (!first) { ctx.err('GEN_SQUAD_MACRO_UNDEFINED', `("${mac}") does not expand to a {"<name>" ..} card block`, where); return; }
  blk = blk.replace(/^\{\s*"[^"]+"/, '{"' + first[1].replace(new RegExp('^' + esc(like), 'i'), name) + '"');
  // content: raw, or the members with the like's own prefix (mp/<army>/)
  const cm = /\{\s*content\s+"([^"]*)"\s*\}/i.exec(blk), pre = cm && /(\S*\/)[^\s/]+$/.exec(cm[1].trim().split(/\s+/)[0] || '');
  const content = spec.content !== undefined ? S(spec.content).trim() : mem.map(m => `${pre ? pre[1] : 'mp/' + army + '/'}${m.breed}:${m.n}`).join(' ');
  blk = cm ? blk.replace(cm[0], `{content "${ctx.bytes(content)}"}`) : setKey(ctx, blk, 'content', '"' + content + '"', true);
  const ALIAS = { c: 'charge', f: 'fore', g: 'group', b: 'button' }, KEYS = new Set(['charge', 'fore', 'group', 'icon', 'button', 'cost', 'cp', 'score', 'cw', 'level', 'tags', 'info', 'breed']);
  for (const [k0, v] of Object.entries(spec.fields || {})) {
    const k = ALIAS[lower(k0)] || lower(k0);
    if (!KEYS.has(k)) { ctx.err('GEN_FIELD_UNKNOWN', `card block field "${k0}": one of ${[...KEYS].join(' ')} (or c f g b)`, where); return; }
    blk = setKey(ctx, blk, k, v, true);
  }
  if (truthy(spec.not_for_sale)) blk = blk.replace(/\}\s*$/, ' {not_for_sale}}');
  const lines = h.lines.slice(), out = blk.split('\n');
  let at = h.i + 1;
  if (spec.order !== undefined) { const a = orderAt(ctx, h.rows, spec.order, where); if (a === undefined || a === null) return; at = a; }
  lines.splice(at, 0, ...out);
  put(ctx, h.key, lines.join(h.eol), where);
  H().autoText(ctx, `desc/squad/${name}(${army})`, spec.display, `desc/squad/${like}(${army})`, name, where);
  H().autoText(ctx, `info/squad/${name}(${army})`, spec.info, `info/squad/${like}(${army})`, S(spec.display) || name, where);
  H().botsAdvice(ctx, 'squad', name, like, army, spec, where);
  ctx.names.add(lower(name));
  ctx.facts.push(`squad: ${name} (${army}) card block from ${like} (${mac} expanded): content "${content}"${truthy(spec.not_for_sale) ? ', not_for_sale' : ''}${spec.order !== undefined ? ', order ' + S(spec.order) : ''}`);
  ctx.test.push(`squad: ${name} (${army}): the purchase panel shows it${truthy(spec.not_for_sale) ? ' greyed / not buyable' : ''}; buy it: the squad spawns as "${content}"; no 'Can't preload' line [T: card block written in the macro's own key form].`);
}

// change: true on an existing squad (its own line or card block, in place): members (the whole new list, or only "-breed" entries
// to take types out), content, fields, not_for_sale true/false, order. A macro line stays a macro line while it can (<= 4 types,
// no raw content, no not_for_sale), else it is written as an expanded card block
function squadChange(ctx, spec, find, files, where) {
  const name = S(spec.name), army = lower(S(spec.army)), period = S(spec.period || (ctx.goh ? 'late' : ''));
  const h = find(name);
  if (!h) { ctx.err('GEN_SQUAD_CHANGE_UNKNOWN', `no squad ${name} for ${army} to change (change: true edits an existing squad; drop it to make a new one)`, where); return; }
  const raw = list(spec.members).map(m => typeof m === 'string' ? m.trim() : (m && m.breed ? S(m.breed) + ':' + S(m.n || m.count || 1) : ''));
  const outs = raw.filter(m => m[0] === '-').map(m => lower(m.slice(1))), adds = raw.filter(m => m[0] !== '-');
  if (outs.length && adds.length) { ctx.err('GEN_SQUAD_ARGS', 'members: the whole new list ("breed:n" ..) or only "-breed" entries to take types out, not both', where); return; }
  const parsed = adds.map(m => ({ breed: lower(m.split(':')[0]), n: +(m.split(':')[1] || 1) }));
  if (parsed.some(m => !/^[a-z0-9_]+$/.test(m.breed) || !(m.n >= 1) || !Number.isInteger(m.n))) { ctx.err('GEN_SQUAD_ARGS', 'members need "breed:n" with n a whole number >= 1', where); return; }
  for (const m of parsed) { const bk = H().breedKey(ctx, army, m.breed, period); if (!ctx.exists(bk) && !ctx.virt.has('breed:' + army + ':' + m.breed)) { ctx.err('GEN_SQUAD_BREED_UNKNOWN', `breed "${m.breed}" has no ${bk}`, where); return; } }
  if (spec.content !== undefined && (/["{}]/.test(S(spec.content)) || !S(spec.content).trim())) { ctx.err('GEN_SQUAD_CONTENT_BAD', `content "${S(spec.content)}": the text inside {content ".."}, without quotes or braces`, where); return; }
  if (spec.content !== undefined && raw.length) { ctx.err('GEN_SQUAD_ARGS', 'content or members, not both', where); return; }
  if (spec.order !== undefined && !/^(first|last)$/i.test(S(spec.order)) && lower(S(spec.order)) === lower(name)) { ctx.err('GEN_SQUAD_ORDER_UNKNOWN', 'order: a squad to follow other than itself', where); return; }
  let rows = h.lines.slice(h.i, h.j + 1), said = [];
  const isLine = h.i === h.j && /^\s*\(\s*"squad_with\d+types"/i.test(rows[0]);
  // current member list from the line (c1(x:n) ..) or the block {content}
  const cur = isLine ? [...rows[0].matchAll(/\bc(\d)\(([^():]+)(?::(\d+))?\)/g)].map(m => ({ breed: lower(m[2]), n: +(m[3] || 1) }))
    : ((/\{\s*content\s+"([^"]*)"/i.exec(rows.join('\n')) || [, ''])[1].trim().split(/\s+/).filter(t => /^[^()*]+$/.test(t) && t.includes('/')).map(t => ({ breed: lower(t.split('/').pop().split(':')[0]), n: +(t.split(':')[1] || 1) })));
  let mem = null;
  if (outs.length) {
    for (const o of outs) if (!cur.some(m => m.breed === o)) { ctx.err('GEN_SQUAD_MEMBER_ABSENT', `"${o}" is not a member type of ${name} (${cur.map(m => m.breed + ':' + m.n).join(' ') || 'no plain members'})`, where); return; }
    mem = cur.filter(m => !outs.includes(m.breed));
    if (!mem.length) { ctx.err('GEN_SQUAD_ARGS', `taking ${outs.join(' ')} out leaves ${name} empty; remove: true takes the squad off the list`, where); return; }
    said.push('- ' + outs.join(' -'));
  } else if (parsed.length) { mem = parsed; said.push('members ' + parsed.map(m => m.breed + ':' + m.n).join(' ')); }
  const types = mem ? new Set(mem.map(m => m.breed)).size : 0;
  const nfs = spec.not_for_sale === undefined ? undefined : truthy(spec.not_for_sale);
  const needBlock = !isLine ? false : spec.content !== undefined || nfs === true || types > 4;
  let text = rows.join('\n');
  if (isLine && !needBlock) {
    let l = rows[0];
    if (mem) {
      const at = l.search(/\bc\d\(/);
      l = l.replace(/[ \t]*\bc\d\([^()]*\)/g, '');
      const ins = mem.map((m, k) => `c${k + 1}(${m.breed}:${m.n})`).join(' ');
      const pos = Math.min(at < 0 ? l.lastIndexOf(')') : at, l.length);
      l = l.slice(0, pos).replace(/[ \t]*$/, ' ') + ins + ' ' + l.slice(pos).replace(/^[ \t]*/, '');
      const mac = 'squad_with' + mem.length + 'types';
      if (!findDefine(ctx, mac, [h.key, ...ctx.keys(/^resource\/set\/multiplayer\/units\/.*\.(set|inc)$/)])) { ctx.err('GEN_SQUAD_MACRO_UNDEFINED', `${mem.length} member types need ("${mac}"), which no set file defines`, where); return; }
      l = l.replace(/"squad_with\d+types"/i, '"' + mac + '"');
    }
    for (const [k0, v] of Object.entries(spec.fields || {})) { const r = H().setField(l, lower(k0), ctx.bytes(S(v))); if (r === null) { ctx.err('GEN_FIELD_UNKNOWN', `the ${name} line has no ${k0}(..)`, where); return; } l = r; said.push(`${k0} ${S(v)}`); }
    if (nfs === false) ctx.err('WARN_GEN_CARD_FLAG_ABSENT', `${name} is a plain macro line: it has no {not_for_sale} to take out`, where);
    text = l;
  } else {
    if (isLine) {
      let t; try { t = sdlwrite.parse(Buffer.from(rows[0], 'latin1')); } catch (e) { t = null; }
      const call = t && t.root.items.find(n => n.type === 'list'), mac = call ? call.items[0].text.replace(/"/g, '') : '';
      const def = mac ? findDefine(ctx, mac, [h.key, ...ctx.keys(/^resource\/set\/(multiplayer\/units|breed)\/.*\.(set|inc)$/)]) : null;
      if (!def) { ctx.err('GEN_SQUAD_MACRO_UNDEFINED', `the ${name} line calls ("${mac}") and no define was found to expand into a card block`, where); return; }
      const sub = substitute(def.body.replace(/^\s*\n/, ''), call, t.src);
      text = reindent(sub.text, /^[ \t]*/.exec(rows[0])[0]).join('\n');
      said.push(`expanded ("${mac}") into a card block`);
    }
    const cm = /\{\s*content\s+"([^"]*)"\s*\}/i.exec(text), pre = cm && /(\S*\/)[^\s/]+$/.exec(cm[1].trim().split(/\s+/).find(x => x.includes('/')) || '');
    let content = null;
    if (spec.content !== undefined) content = S(spec.content).trim();
    else if (mem) {
      if (outs.length && cm) content = cm[1].trim().split(/\s+/).filter(tk => !(tk.includes('/') && outs.includes(lower(tk.split('/').pop().split(':')[0])))).join(' ');
      else content = mem.map(m => `${pre ? pre[1] : 'mp/' + army + '/'}${m.breed}:${m.n}`).join(' ');
    }
    if (content !== null) { text = cm ? text.replace(cm[0], `{content "${ctx.bytes(content)}"}`) : setKey(ctx, text, 'content', '"' + content + '"', true); if (spec.content !== undefined) said.push(`content "${content}"`); }
    for (const [k0, v] of Object.entries(spec.fields || {})) { const r = setKey(ctx, text, lower(k0), v, true); text = r; said.push(`${k0} ${S(v)}`); }
    if (nfs === true && !flagRe('not_for_sale').test(text)) { text = addChild(text, '{not_for_sale}') || text; said.push('+{not_for_sale}'); }
    if (nfs === false) {
      if (!flagRe('not_for_sale').test(text)) ctx.err('WARN_GEN_CARD_FLAG_ABSENT', `${name} has no {not_for_sale} to take out`, where);
      else { const ls = text.split('\n'), li = ls.findIndex(l => flagRe('not_for_sale').test(l)); if (!ls[li].replace(flagRe('not_for_sale'), '').trim()) ls.splice(li, 1); else ls[li] = ls[li].replace(/[ \t]*\{\s*not_for_sale\s*\}/i, ''); text = ls.join('\n'); said.push('-{not_for_sale}'); }
    }
  }
  const lines = h.lines.slice(), nl = text.split('\n');
  lines.splice(h.i, h.j - h.i + 1, ...nl);
  if (spec.order !== undefined) {
    const moved = lines.splice(h.i, nl.length);
    const r2 = squadRows(ctx, lines, army), at = orderAt(ctx, r2, spec.order, where);
    if (at === undefined || at === null) return;
    lines.splice(at, 0, ...moved); said.push('order ' + lower(S(spec.order)));
  }
  if (!said.length) { ctx.err('GEN_SQUAD_ARGS', 'change: true needs members, content, fields, not_for_sale or order', where); return; }
  put(ctx, h.key, lines.join(h.eol), where);
  ctx.facts.push(`squad change: ${name} (${army}) in ${h.key}: ${said.join(', ')}`);
  ctx.test.push(`squad change: ${name} (${army}): the purchase panel shows it${nfs ? ' greyed / not buyable' : ''}; buy it: it spawns ${mem ? mem.map(m => m.breed + ':' + m.n).join(' ') : 'as set'}; no 'Can't preload' line [T].`);
}

// ---- bots: {priority, class, min_income, min_team} on a copied bot.data.lua Purchases entry (ops.js botPurchases) --------------
const BOT_CLASSES = ['Infantry', 'ATInfantry', 'Vehicle', 'Tank', 'HeavyTank', 'ATTank', 'AATank', 'ArtilleryTank'];
function botBad(ctx, bo, where) {
  if (bo.class !== undefined && !BOT_CLASSES.map(lower).includes(lower(S(bo.class)))) { ctx.err('GEN_BOTS_CLASS_UNKNOWN', `bots class "${S(bo.class)}": one of ${BOT_CLASSES.join(' ')} (UnitClass.* in bot.data.lua)`, where); return true; }
  for (const k of ['priority', 'min_income', 'min_team']) if (bo[k] !== undefined && !/^\d+(\.\d+)?$/.test(S(bo[k]))) { ctx.err('GEN_BOTS_VALUE', `bots ${k} "${S(bo[k])}": a number >= 0`, where); return true; }
  for (const k of Object.keys(bo)) if (!['priority', 'class', 'min_income', 'min_team'].includes(k)) { ctx.err('GEN_BOTS_VALUE', `bots: unknown key "${k}" (priority class min_income min_team)`, where); return true; }
  return false;
}
function botFields(line, bo) {
  let l = line;
  if (bo.class !== undefined) { const c = BOT_CLASSES.find(x => lower(x) === lower(S(bo.class))); l = l.replace(/(\bclass\s*=\s*UnitClass\.)\w+/, '$1' + c); }
  for (const k of ['min_income', 'min_team']) {
    if (bo[k] === undefined) continue;
    const re = new RegExp('(\\b' + k + '\\s*=\\s*)[\\d.]+');
    if (re.test(l)) l = l.replace(re, '$1' + S(bo[k]));
    else if (k === 'min_team' && /\bmin_income\s*=\s*[\d.]+/.test(l)) l = l.replace(/(\bmin_income\s*=\s*[\d.]+)/, `$1, min_team = ${S(bo[k])}`);
    else l = l.replace(/(\bpriority\s*=\s*[\d.]+)/, `$1, ${k} = ${S(bo[k])}`);
  }
  return l;
}

module.exports = { opIblock, opMacro, opPreset, opArmy, opKit, opVehKit, opWear, opTexmod, opCardList, opSquadX, squadX, breedDel, declFields, cardEdits, cardEdit, armyBots, botBad, botFields, BOT_CLASSES, unitPut: put };
