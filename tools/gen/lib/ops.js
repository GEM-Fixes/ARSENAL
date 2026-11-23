// ops.js: gen operations. each op(ctx, spec) edits through ctx (overlay) or a wrapped CLI tool; findings go to ctx.rep (GEN_* codes),
// in-game checks to ctx.test. wrapped: newmod (mod) clone-entity (clone) lng-add (text); in-process: patch-entity.applyEdit (set),
// sdlwrite (armor), line editing of roster text (roster card squad breed).
// Author: Imperator_Aug (ARSENAL, ia-d14f59fc)
const fs = require('fs'), path = require('path');
const sdlwrite = require('../../lib/sdlwrite');
const patch = require('../../patch-entity/patch-entity');
const C = require('../../modmove/lib/common');
const { lower } = require('./ctx');

const S = v => (v === null || v === undefined) ? '' : String(v);
const list = v => v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = s => S(s).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'gen';
const FACTION = /^[a-z0-9_]+$/;
const SET_OPS = ['set', 'add', 'append', 'del'];          // set-row op values (GEN_SET_BAD_OP); gen --schema reads this
const SQUAD_NAME = /^[a-z0-9_]+$/i;             // squad / breed name (GEN_SQUAD_ARGS / GEN_BREED_ARGS)
const MAPNAME = /^[A-Za-z0-9_]+$/;              // map-clone new name (GEN_MAPCLONE_ARGS)

// ---- file resolution -------------------------------------------------------------------------------------------------
// ent: entity name (resource/entity/**/<name>.def) | "file:<vfs key>" | key containing "/" (resource/ prefix optional)
function resolveFile(ctx, ent, where) {
  ent = S(ent).trim();
  if (!ent) { ctx.err('GEN_SET_ENTITY_UNKNOWN', 'empty entity', where); return null; }
  if (/^file:/i.test(ent) || ent.includes('/') || ent.includes('\\')) {
    let k = lower(ent.replace(/^file:/i, '')).replace(/^\/+/, '');
    if (!k.startsWith('resource/')) k = 'resource/' + k;
    for (const c of [k, k + '.set', k + '.def', k + '.inc']) if (ctx.exists(c)) return { key: c, virt: !ctx.read(c) };
    ctx.err('GEN_SET_ENTITY_UNKNOWN', `file "${ent}" not in the mod folder or the base data (key ${k})`, where);
    return null;
  }
  const n = lower(ent), tail = '/' + n + '.def';
  const hits = ctx.keys(new RegExp('^resource/entity/.*' + esc(tail) + '$'));
  // a clone made earlier in this spec: in a real run the file is on disk by now; in --plan opClone holds its planned files in
  // ctx.dirty (clone-entity --plan-out), so it is edited like any other. Only a clone with no planned def (tool refused) stays a name.
  if (ctx.virt.has('entity:' + n) && !hits.some(k => ctx.inMod(k))) return { key: null, virt: true };
  if (!hits.length) { ctx.err('GEN_SET_ENTITY_UNKNOWN', `entity "${ent}" has no resource/entity/**/${n}.def in the mod or base data`, where); return null; }
  if (hits.length > 1) {
    const mine = hits.filter(k => ctx.inMod(k));
    if (mine.length === 1) return { key: mine[0] };
    ctx.err('GEN_SET_ENTITY_AMBIGUOUS', `entity "${ent}" matches ${hits.length} defs (${hits.slice(0, 3).join(' | ')}): use file:<key>`, where);
    return null;
  }
  return { key: hits[0] };
}
const isText = k => !/\.(ply|mdl|anm|vol|tga|dds|ebm|wav|ogg|pak|avi|bin|net|grs|mtl)$/i.test(k);

// ---- CSV -------------------------------------------------------------------------------------------------------------
function csvRows(text) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim() || /^\s*#/.test(raw)) return;
    const cells = []; let cur = '', q = false;
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      if (q) { if (c === '"') { if (raw[j + 1] === '"') { cur += '"'; j++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === ',') { cells.push(cur); cur = ''; } else cur += c;
    }
    cells.push(cur);
    if (i === 0 || !out.length) if (/^entity$/i.test(cells[0].trim()) && /^path$/i.test((cells[1] || '').trim())) return;
    out.push({ line: i + 1, entity: cells[0].trim(), path: (cells[1] || '').trim(), value: cells.length > 2 ? cells[2] : '', op: (cells[3] || 'set').trim().toLowerCase() || 'set' });
  });
  return out;
}

// ---- set: batched path edits, one file edited once ---------------------------------------------------------------------
function opSet(ctx, spec, base) {
  let rows = [], src = 'spec';
  if (spec.csv) {
    const f = path.resolve(base, S(spec.csv));
    if (!fs.existsSync(f)) { ctx.err('GEN_SET_CSV_MISSING', `csv file ${f} not found`, S(spec.csv)); return; }
    src = path.basename(f);
    rows = rows.concat(csvRows(fs.readFileSync(f, 'utf8')));
  }
  list(spec.rows).forEach((r, i) => {
    if (typeof r === 'string') rows = rows.concat(csvRows(r).map(x => Object.assign(x, { line: i + 1 })));
    else rows.push({ line: i + 1, entity: S(r.entity || r.file), path: S(r.path), value: S(r.value), op: S(r.op || 'set').toLowerCase() });
  });
  if (spec.entity && spec.values && typeof spec.values === 'object') for (const [p, v] of Object.entries(spec.values)) rows.push({ line: 0, entity: S(spec.entity), path: p, value: S(v), op: 'set' });
  if (!rows.length) { ctx.err('GEN_SET_EMPTY', 'set op has no rows', 'set'); return; }
  const byFile = new Map(), pending = []; let ok = 0, bad = 0;
  for (const r of rows) {
    const where = src + (r.line ? ':' + r.line : '');
    if (!SET_OPS.includes(r.op)) { ctx.err('GEN_SET_BAD_OP', `row op "${r.op}": set|add|append|del`, where); bad++; continue; }
    if (!r.path) { ctx.err('GEN_SET_PATH_MISSING', `row for "${r.entity}" has an empty path`, where); bad++; continue; }
    const f = resolveFile(ctx, r.entity, where);
    if (!f) { bad++; continue; }
    if (!f.key) { ctx.info('GEN_SET_PLAN_VIRTUAL', `${r.entity}: created earlier in this spec, row not checked in --plan`, where); ok++; continue; }
    if (!isText(f.key)) { ctx.err('GEN_SET_BINARY', `${f.key} is not an SDL text file`, where); bad++; continue; }
    if (!byFile.has(f.key)) byFile.set(f.key, []);
    byFile.get(f.key).push(Object.assign({ where }, r));
  }
  for (const [key, rs] of byFile) {
    let buf = ctx.read(key);
    if (!buf) { ctx.err('GEN_SET_ENTITY_UNKNOWN', `${key} unreadable`, key); bad += rs.length; continue; }
    const wasMine = ctx.inMod(key);
    let n = 0;
    for (const r of rs) {
      let res;
      try { res = patch.applyEdit(buf, { op: r.op, path: r.path, value: r.value }); } catch (e) { res = { err: ['GEN_SET_NOT_SDL', e.message] }; }
      // vanilla defs open with {game_entity or {Entity: a path written for one root is tried on the other before it is refused
      if (res.err && res.err[0] === 'PATCH_KEY_MISSING' && /^(game_entity|entity)\//i.test(r.path)) {
        const alt = r.path.replace(/^(game_entity|entity)\//i, (m, a) => (/^g/i.test(a) ? 'entity' : 'game_entity') + '/');
        try { const r2 = patch.applyEdit(buf, { op: r.op, path: alt, value: r.value }); if (!r2.err) res = r2; } catch (e) { /* keep the first refusal */ }
      }
      if (res.err) { ctx.err(res.err[0] === 'PATCH_KEY_MISSING' ? 'GEN_SET_PATH_MISSING' : 'GEN_' + res.err[0].replace(/^PATCH_/, 'SET_'), `${r.entity} ${r.path}: ${res.err[1].replace(/^--\w+ /, '')}`, r.where); bad++; continue; }
      if (/thickness/i.test(r.path) && /\(\s*"?armor_|\barmor\s*\(/i.test(buf.toString('latin1'))) ctx.err('WARN_GEN_SET_THICKNESS_SHADOWED', `${r.entity} ${r.path}: this def calls an armor_* macro; a nonzero macro side value overrides {thickness} (DMG-06, GPL-04) - use the armor op`, r.where);
      if (res.note) ctx.info('GEN_' + res.note[0].replace(/^PATCH_/, 'SET_'), `${r.entity} ${r.path}: ${res.note[1].replace(/^--\w+ \S+: /, '')}`, r.where);
      buf = res.buf; n++; ok++;
    }
    if (n) pending.push({ key, buf, n, wasMine });
  }
  // all-or-nothing: a refused row (any file of this op) means no file of this op is written, so the mod never holds a half-applied csv
  if (bad && pending.length) {
    ctx.err('GEN_SET_NOT_WRITTEN', `${bad} row(s) refused: the ${ok} valid row(s) in ${pending.length} file(s) were not written (fix the refused rows, then rerun)`, src);
    ctx.facts.push(`set: ${bad} row(s) refused, nothing written (${ok} valid row(s) held back)`);
    return;
  }
  for (const { key, buf, n, wasMine } of pending) {
    if (ctx.plan && ctx.planned && ctx.planned.has(key)) planLines(ctx, key, ctx.read(key), buf, src);
    ctx.write(key, buf);
    if (!wasMine) ctx.info('GEN_SET_FULL_COPY', `${key}: mod now carries a whole-file override of the base copy (VFS-01/41)`, key);
    ctx.test.push(`set: ${key} (${n} edit${n > 1 ? 's' : ''}): spawn/inspect the changed unit or weapon and compare against base values in the statsheet diff.`);
  }
  ctx.facts.push(`set: ${ok} row(s) applied, ${bad} refused`);
}

// ---- armor: edit the macro arg of ("armor_*" ...) -----------------------------------------------------------------------
function opArmor(ctx, spec) {
  for (const it of list(spec.items || [spec])) {
    const ent = S(it.entity), where = 'armor ' + ent;
    const f = resolveFile(ctx, ent, where);
    if (!f) continue;
    if (!f.key) { ctx.info('GEN_ARMOR_PLAN_VIRTUAL', `${ent} is created in this spec: armor edit not checked in --plan`, where); continue; }
    const buf = ctx.read(f.key), t = sdlwrite.parse(buf);
    const want = lower(S(it.macro));
    const calls = [];
    (function walk(n) {
      for (const c of n.items || []) {
        if (c.type === 'list' && c.items[0] && c.items[0].type === 'string' && /^armor_/i.test(c.name || '') && (!want || c.name === want)) calls.push(c);
        else if (c.items) walk(c);
      }
    })(t.root);
    if (!calls.length) { ctx.err('GEN_ARMOR_NO_MACRO', `${f.key}: no ("armor_*" ...) macro call${want ? ' named ' + want : ''}; thickness lives in per-volume blocks, use set rows`, where); continue; }
    const call = calls[0], argGiven = !!it.arg;
    // value forms: "f s r t" (_ keeps) | "turret 60 60 60 30 body 50 _ _ _" (named parts) | {turret: "60 60 60 30", body: "50 _ _ _"}
    let toks;
    if (it.value && typeof it.value === 'object' && !Array.isArray(it.value)) toks = Object.entries(it.value).flatMap(([k, v]) => [lower(k), ...S(v).trim().split(/\s+/).filter(Boolean)]);
    else toks = S(it.value).trim().split(/\s+/).filter(Boolean);
    if (!toks.length) { ctx.err('GEN_ARMOR_NO_VALUE', `${ent}: armor op needs value`, where); continue; }
    // slots of one named part: atoms after the name inside part(..)
    const parts = [];
    // the parser reads part(52 52 52 20) as the atom `part` followed by a list of atoms
    for (let k = 1; k + 1 < call.items.length; k++) {
      const c = call.items[k], l = call.items[k + 1];
      if (c.type !== 'atom' || l.type !== 'list' || lower(c.text) === 'args') continue;
      const sl = []; for (let j = 0; j < l.items.length; j++) sl.push([l, j]);
      parts.push({ name: lower(c.text), slots: sl, cur: sl.map(([n, j]) => n.items[j].text).join(' ') });
    }
    const argAtom = call.items.findIndex(c => c.type === 'atom' && lower(c.text) === 'args');
    const partList = parts.map(x => `${x.name}(${x.cur})`).join(' ');
    const help = `"${call.name}" has ${parts.length ? 'parts ' + partList : 'no named parts'}${argAtom > 0 ? ' and an args list' : ''}. Give 4 numbers front side rear top (_ keeps one)${parts.length ? ', e.g. "120 _ _ _" for every part, or name the part first: "' + parts[0].name + ' 120 _ _ _"' : ''}`;
    const jobs = []; // [slots, values]
    const named = toks.some(x => /^[a-z]/i.test(x) && x !== '_');
    if (named || (argGiven && lower(S(it.arg)) !== 'args')) {
      // named parts: split the tokens at each part name
      let cur = null; const groups = [];
      if (!named) groups.push({ name: lower(S(it.arg)), vals: toks });
      else for (const x of toks) { if (/^[a-z]/i.test(x) && x !== '_') { cur = { name: lower(x), vals: [] }; groups.push(cur); } else if (cur) cur.vals.push(x); else { ctx.err('GEN_ARMOR_BAD_FORM', `${ent}: value "${S(it.value)}" starts with numbers then part names; ${help}`, where); groups.length = 0; break; } }
      if (!groups.length) continue;
      let bad = false;
      for (const g of groups) {
        const pt = parts.find(x => x.name === g.name);
        if (!pt) { ctx.err('GEN_ARMOR_PART_UNKNOWN', `${ent}: no part "${g.name}". ${help}`, where); bad = true; break; }
        if (g.vals.length !== pt.slots.length) { ctx.err('GEN_ARMOR_ARGC', `${ent}: part ${g.name} takes ${pt.slots.length} value(s) (front side rear top order for 4), got ${g.vals.length}; use _ to keep one. ${help}`, where); bad = true; break; }
        jobs.push({ label: `${call.name} ${g.name}`, slots: pt.slots, vals: g.vals });
      }
      if (bad) continue;
    } else if (argAtom > 0) {
      const slots = []; for (let j = argAtom + 1; j < call.items.length && call.items[j].type === 'atom'; j++) slots.push([call, j]);
      if (toks.length !== slots.length) { ctx.err('GEN_ARMOR_ARGC', `${ent}: ${call.name} args takes ${slots.length} value(s) (front side rear top order for 4), got ${toks.length}; use _ to keep one`, where); continue; }
      jobs.push({ label: `${call.name} args`, slots, vals: toks });
    } else {
      // plain numbers on a macro made of named parts: apply to every part that takes that many values
      const fit = parts.filter(x => x.slots.length === toks.length);
      if (!fit.length) { ctx.err('GEN_ARMOR_ARG_MISSING', `${f.key}: ${help}; ${toks.length} value(s) given and no part takes that many`, where); continue; }
      for (const x of fit) jobs.push({ label: `${call.name} ${x.name}`, slots: x.slots, vals: toks });
      if (fit.length > 1 || parts.length > 1) ctx.info('GEN_ARMOR_ALL_PARTS', `${ent}: "${toks.join(' ')}" applied to ${fit.map(x => x.name).join(' + ')} of ${call.name}${fit.length < parts.length ? ' (parts with another value count skipped: ' + parts.filter(x => !fit.includes(x)).map(x => x.name).join(' ') + ')' : ''}; name a part to change only one`, where);
    }
    const before = jobs.map(jb => jb.label + ' ' + jb.slots.map(([n, j]) => n.items[j].text).join(' '));
    for (const jb of jobs) jb.vals.forEach((v, i) => { if (v !== '_') sdlwrite.setValue(jb.slots[i][0], Buffer.from(ctx.bytes(v), 'latin1'), jb.slots[i][1]); });
    const vals = [jobs.map(jb => jb.label + ' ' + jb.vals.join(' ')).join('; ')], arg = jobs.length > 1 ? 'parts' : 'args';
    const wasMine = ctx.inMod(f.key);
    ctx.write(f.key, sdlwrite.serialize(t));
    if (!wasMine) ctx.info('GEN_ARMOR_FULL_COPY', `${f.key}: whole-file override of the base def (VFS-01/41)`, where);
    ctx.facts.push(`armor: ${ent} ${before.join('; ')} -> ${vals[0]}`);
    ctx.test.push(`armor: ${ent} (${call.name}): shoot it from front/side/rear with a known gun; macro value beats per-volume thickness (DMG-06). compare penetration vs the statsheet armor sheet.`);
  }
}

// ---- wrapped: newmod / clone-entity / lng-add ---------------------------------------------------------------------------
function parseFind(ctx, r, tag) {
  const fs_ = C.parseFindings(r.out);
  for (const f of fs_) {
    if (ctx.goh && f.code === 'SELFCHECK_MODINFO' && /VER_RANGE game 3\.262/.test(f.msg)) { ctx.info('GEN_MODINFO_AS2_ONLY', 'newmod self-check ran the AS2-only modinfo lint on a GoH mod.info: VER_RANGE ignored [I]', 'mod.info'); continue; }
    // clone-entity warns per clone that the "_x" sibling is missing; the spec may clone it in a later op, so gen reports it only if no op does
    if (f.info && f.code === 'CLONE_NO_X_VARIANT') { (ctx.pendingX = ctx.pendingX || []).push(f); continue; }
    if (f.info) ctx.rep.info(f.file, f.line, f.code, f.msg);
    else ctx.rep.add(f.file, f.line, f.code, f.msg);
  }
  // a child that was killed (timeout: r.error ETIMEDOUT, status null) or stopped with no finding line (a one-line refusal, exit 2) failed:
  // GEN_TOOL_FAILED is reported and also returned with the findings, so the op's "no error" check does not record it as done
  const killed = !!r.error || r.status === null;
  if ((killed || (r.status && r.status !== 0 && !/findings/.test(r.out))) && !fs_.some(f => !f.info && !/^WARN_/.test(f.code))) {
    const why = killed ? (r.error && r.error.code === 'ETIMEDOUT' ? 'timed out' : 'killed' + (r.error ? ' (' + (r.error.code || r.error.message) + ')' : '')) : 'exit ' + r.status;
    const msg = `${tag} ${why}: ${(r.err || r.out || '').trim().split('\n').slice(0, 3).join(' / ')}`;
    ctx.err('GEN_TOOL_FAILED', msg, tag);
    fs_.push({ file: tag, line: 0, code: 'GEN_TOOL_FAILED', msg, info: false });
  }
  return fs_;
}
function opMod(ctx, spec, g) {
  if (!ctx.plan && fs.existsSync(path.join(ctx.out, 'mod.info'))) { ctx.info('GEN_MOD_EXISTS', 'mod.info present, newmod skipped', 'mod'); return; }
  const a = [ctx.out, '--name', S(spec.title || spec.name || g.name), '--target', ctx.target, '--game', ctx.root];
  if (spec.deps && list(spec.deps).length) a.push('--deps', list(spec.deps).join(','));
  if (spec.game_version) { a.push('--game-version', S(spec.game_version)); ctx.gameVersion = S(spec.game_version); }
  if (ctx.plan) a.push('--dry-run');
  const r = ctx.tool('newmod', a);
  parseFind(ctx, r, 'newmod');
  ctx.facts.push(`mod: ${ctx.out} (${ctx.target})`);
}
function opClone(ctx, spec) {
  const a = ['--game', ctx.root, '--out', ctx.out, ...ctx.exeArgs()];
  if (ctx.mods.length) a.push('--mods', ctx.mods.join(','));
  if (spec.stuff) a.push('--stuff', S(spec.stuff), '--tags', S(spec.tags));
  else if (spec.entity) { a.push('--entity', S(spec.entity), '--as', S(spec.as)); if (spec.copy_assets) a.push('--copy-assets'); if (spec.roster) a.push('--roster'); if (spec.material) a.push('--material', S(spec.material)); }
  else { ctx.err('GEN_CLONE_ARGS', 'clone needs stuff+tags or entity+as', 'clone'); return; }
  if (spec.name) a.push('--name', S(spec.name));
  const sets = spec.set && typeof spec.set === 'object' && !Array.isArray(spec.set) ? Object.entries(spec.set).map(([k, v]) => k + '=' + S(v)) : list(spec.set).map(S);
  sets.forEach(s => a.push('--set', s));
  let po = null;
  if (ctx.plan) { po = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'gen-clone-')), 'plan.json'); a.push('--dry-run', '--plan-out', po); }
  const r = ctx.tool('clone-entity', a);
  const f = parseFind(ctx, r, 'clone-entity');
  if (po) planOverlay(ctx, po, 'clone ' + S(spec.as || spec.tags));
  if (spec.entity && spec.as) {
    (ctx.cloneOps = ctx.cloneOps || []).push({ entity: S(spec.entity), as: S(spec.as), copy_assets: spec.copy_assets, material: spec.material, wreck: spec.wreck, ok: !f.some(x => !x.info && !/^WARN_/.test(x.code)) });
    // the wreck step (autoWrecks) clones "<entity>_x" for it: the "clone has no _x variant" note would be stale
    if (wreckWanted(spec) && defCount(ctx, S(spec.entity) + '_x')) ctx.pendingX = (ctx.pendingX || []).filter(x => { const m = /clone "([^"]+)" has none/.exec(x.msg); return !m || lower(m[1]) !== lower(S(spec.as)); });
  }
  if (!f.some(x => !x.info && !/^WARN_/.test(x.code)) || ctx.plan) {
    if (spec.entity) { ctx.virt.add('entity:' + lower(spec.as)); ctx.test.push(`clone: entity ${spec.as} (from ${spec.entity}): place it in the editor or buy it (needs a card: roster op) and check it spawns with the right model, no log errors.`); }
    else { (ctx.stuffClones = ctx.stuffClones || []).push({ from: S(spec.stuff), as: S(spec.tags) }); ctx.virt.add('stuff:' + lower(spec.tags)); ctx.test.push(`clone: stuff ${spec.tags} (from ${spec.stuff}): equip it (breed op inventory) and fire at a fixed target; check the changed stat.`); }
    ctx.names.add(lower(spec.entity ? spec.as : spec.tags)); ctx.names.add(lower(S(spec.tags).replace(/\./g, ' ')));
    // clone-entity --name already writes desc/entity/<as> into #clone_entity.lng: finishText must not write that key again (chain-n)
    if (spec.entity && spec.name) (ctx.cloneKeys = ctx.cloneKeys || new Map()).set('desc/entity/' + lower(spec.as), S(spec.name));
    ctx.facts.push(`clone: ${spec.entity ? spec.entity + ' -> ' + spec.as : spec.stuff + ' -> ' + spec.tags}${sets.length ? ' [' + sets.join('; ') + ']' : ''}`);
  }
}
// ---- wreck step: run once at the end of a gen run, from gen main and from genMain.finishText (the task path, compile.js finishGen) ----
// N8: a base unit with a "<entity>_x" wreck def: the engine swaps a destroyed vehicle for "<name>_x" by name, so a clone without one
// dies into nothing. Every entity clone op of the run (ctx.cloneOps, recorded by opClone) gets its wreck cloned too (clone option
// `wreck: false` turns it off) [T: wreck shows on death]. FIX-PORT (port-donors:17): a dead "<n>_x" goes on to "<n>_xx" by name; clones
// without it log SetSkeleton failed, rc-g.md [V]): "_xx" is cloned with the "_x" op's flags, no set rows.
const wreckWanted = s => s.wreck !== false && String(s.wreck) !== 'false' && !/_x+$/i.test(S(s.entity));
const defCount = (ctx, n) => ctx.keys(new RegExp('^resource/entity/.*/' + esc(lower(n)) + '\\.def$')).length;
function autoWrecks(ctx, log) {
  module.exports.armyBots(ctx); // ops-unit: the new armies' bots blocks, after every roster op (own once-guard)
  if (ctx.wrecksDone) return;
  ctx.wrecksDone = true;
  const done = (ctx.cloneOps || []).slice(), cloned = new Set(done.map(s => lower(s.as))), wreckOps = [];
  for (const s of done.filter(s => s.ok && wreckWanted(s))) {
    const from = s.entity + '_x', to = s.as + '_x';
    if (cloned.has(lower(to)) || !defCount(ctx, from)) continue;
    const c0 = ctx.rep.count;
    opClone(ctx, { op: 'clone', entity: from, as: to, copy_assets: s.copy_assets, material: s.material });
    cloned.add(lower(to)); wreckOps.push({ entity: from, as: to, copy_assets: s.copy_assets, material: s.material, ok: true });
    ctx.info('GEN_WRECK_AUTOCLONE', `${from} -> ${to}: the base unit has a destroyed-vehicle wreck, cloned too so the dead ${s.as} leaves a wreck (add wreck: false to the clone op to skip it) [T]`, 'clone ' + to);
    if (log) log({ i: 'x', op: 'clone', status: ctx.rep.count > c0 ? 'errors' : 'ok', findings: ctx.rep.count - c0 });
  }
  for (const s of done.concat(wreckOps).filter(s => s.ok && /_x$/i.test(s.entity) && /_x$/i.test(s.as))) {
    const from = s.entity + 'x', to = s.as + 'x';
    if (cloned.has(lower(to)) || !defCount(ctx, from)) continue;
    const c0 = ctx.rep.count;
    opClone(ctx, { op: 'clone', entity: from, as: to, copy_assets: s.copy_assets, material: s.material });
    cloned.add(lower(to));
    ctx.info('GEN_XX_AUTOCLONE', `${from} -> ${to}: base has the "_xx" wreck stage, cloned with the "${s.entity}" op's flags (no set rows) so the dead "_x" wreck finds it${ctx.rep.count > c0 ? ' (clone reported errors)' : ''} [T]`, 'clone ' + to);
    if (log) log({ i: 'xx', op: 'clone', status: ctx.rep.count > c0 ? 'errors' : 'ok', findings: ctx.rep.count - c0 });
  }
  for (const f of ctx.pendingX || []) { const m = /clone "([^"]+)" has none/.exec(f.msg); if (!m || !cloned.has(lower(m[1]) + '_x')) ctx.rep.info(f.file, f.line, f.code, f.msg); }
  ctx.pendingX = [];
}

// --plan: the files clone-entity would write (its --plan-out JSON) go into ctx.dirty, so later set/macro/armor/weapon rows of the
// same spec edit them (no GEN_SET_ENTITY_UNKNOWN / PLAN_VIRTUAL) and the plan lists their content (GEN_PLAN_WRITE). Assets (models,
// textures) are only names (ctx.virt). ctx.planned = the overlay keys; opSet prints its edits of them.
const PLAN_MAX = 40;
function planLines(ctx, key, old, now, where) {
  const d = patch.lineDiff(old ? old.toString('latin1') : '', now.toString('latin1'));
  ctx.info('GEN_PLAN_WRITE', `${key}${old ? '' : ' (new file)'}: ${d.length} line(s)`, where);
  d.slice(0, PLAN_MAX).forEach(l => ctx.info('GEN_PLAN_WRITE', `${key} ${l}`, where));
  if (d.length > PLAN_MAX) ctx.info('GEN_PLAN_WRITE', `${key} ... ${d.length - PLAN_MAX} more line(s)`, where);
}
function planOverlay(ctx, file, where) {
  let items = [];
  try { items = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* tool refused: nothing planned */ }
  try { fs.rmSync(path.dirname(file), { recursive: true, force: true }); } catch (e) { /* temp */ }
  ctx.planned = ctx.planned || new Set();
  for (const it of items) {
    const key = lower(it.rel);
    if (it.data === null) { ctx.virt.add(key); continue; }
    const buf = Buffer.from(it.data, 'base64'), old = ctx.read(key);
    ctx.write(key, buf); ctx.planned.add(key);
    planLines(ctx, key, old, buf, where);
  }
}
function opText(ctx, spec, g) {
  for (const it of list(spec.items || [spec])) {
    if (!it.key || it.text === undefined) { ctx.err('GEN_TEXT_ARGS', 'text op needs key and text', 'text'); continue; }
    ctx.texts.push({ key: S(it.key), text: S(it.text), file: S(it.file || spec.file || '') });
  }
}

// ---- line/block level editing of roster-style text ---------------------------------------------------------------------
function splitLines(buf) { const s = buf.toString('latin1'); return { eol: s.includes('\r\n') ? '\r\n' : '\n', lines: s.split(/\r?\n/) }; }
// depth of ({ minus }) outside quotes and ; comments
function depthDelta(l) {
  let d = 0, q = false;
  for (let i = 0; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; else if (!q) { if (c === ';') break; if (c === '{' || c === '(') d++; else if (c === '}' || c === ')') d--; } }
  return d;
}
function blockEnd(lines, i) { let d = 0, j = i; for (; j < lines.length; j++) { d += depthDelta(lines[j]); if (d <= 0) break; } return d === 0 ? j : -1; }
// replace `{k v}` or `k(v)` inside block text
function setField(text, k, v) {
  const a = new RegExp('(\\{\\s*' + esc(k) + '\\s+)[^{}]*(\\})', 'i'), b = new RegExp('((?:^|[\\s(])' + esc(k) + '\\()[^()]*(\\))', 'i');
  if (a.test(text)) return text.replace(a, (m, p, q) => p + v + q);
  if (b.test(text)) return text.replace(b, (m, p, q) => p + v + q);
  return null;
}
// GoH MP unit .set field names. Source: prior-art T10 "GoH Mod Tool 0.4.6" (closed exe, inspected static; names only, no
// semantics) lists: CD CI n g score b CW CP t doctrine. Names are lower-case in the .set files here (cd(0) ci(60) g() b() t()).
// [I] only the names; meaning of cd/ci = cost in the two currencies is inferred from the vanilla lines, not stated by T10.
const GOH_FIELDS = ['cd', 'ci', 'n', 'g', 'score', 'b', 'cw', 'cp', 't', 'doctrine'];
function applyFields(ctx, text, fields, where) {
  for (const [k, v] of Object.entries(fields || {})) {
    const r = setField(text, k, ctx.bytes(S(v)));
    if (r === null) {
      const hint = ctx.goh ? `; GoH field names per T10 [I]: ${GOH_FIELDS.join(' ')}${GOH_FIELDS.includes(lower(k)) ? ' (known name, but this card line does not carry it: copy a card that does)' : ''}` : '';
      ctx.err('GEN_FIELD_UNKNOWN', `card has no field "${k}" ({${k} ..} or ${k}(..)) to set${hint}`, where); continue;
    }
    text = r;
  }
  return text;
}
// effective set text files in a dir regex
function setFiles(ctx, re) { return ctx.keys(re); }
const UNITS_AS2 = /^resource\/set\/multiplayer\/units\/[^\/]+\.set$/;
const UNITS_GOH = (period) => new RegExp('^resource/set/multiplayer/units/' + (period ? esc(period) : '[a-z]+') + '/units_[a-z0-9]+\\.set$');
function unitFiles(ctx, army, period, kind) {
  if (!ctx.goh) {
    const all = setFiles(ctx, UNITS_AS2);
    return kind === 'squad' ? all.filter(k => /\/squads\.set$/.test(k)) : kind === 'soldier' ? all.filter(k => /\/soldiers\.set$/.test(k)) : all.filter(k => /\/vehicles/.test(k) && (!army || k.endsWith('_' + army + '.set') || /vehicles(_x\w*)?\.set$/.test(k)));
  }
  return setFiles(ctx, UNITS_GOH(period)).filter(k => !army || k.endsWith('/units_' + army + '.set'));
}
// find the card block `{"name" ...}` -> {key, lines, eol, i, j}
function findCard(ctx, files, name, army) {
  const re = new RegExp('^\\s*\\{\\s*"' + esc(name) + '"(\\s|\\()', 'i');
  for (const key of files) {
    const b = ctx.read(key); if (!b) continue;
    const { eol, lines } = splitLines(b);
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      const j = blockEnd(lines, i); if (j < 0) continue;
      const txt = lines.slice(i, j + 1).join('\n');
      if (army && !new RegExp('\\bs(ide)?\\(' + esc(army) + '\\)', 'i').test(txt) && !new RegExp('_' + esc(army) + '\\.set$').test(key)) continue;
      return { key, lines, eol, i, j };
    }
  }
  return null;
}
// is key reachable from some loader: reverse include graph over resource/set/multiplayer/**. returns chain root keys
function includeRoots(ctx, key) {
  const all = ctx.keys(/^resource\/set\/multiplayer\/.*\.(set|inc)$/), rev = new Map();
  for (const k of all) {
    const t = ctx.readStr(k); if (!t) continue;
    const dir = k.replace(/[^\/]*$/, '');
    for (const m of t.matchAll(/\(\s*include\s+"([^"]+)"/gi)) {
      const v = lower(m[1]);
      const cands = /^[\\\/]/.test(m[1]) ? ['resource' + v.replace(/^\/+/, '/')] : [path.posix.normalize(dir + v), 'resource/' + v];
      for (const c of cands) { if (!rev.has(c)) rev.set(c, new Set()); rev.get(c).add(k); }
    }
  }
  const seen = new Set([key]), roots = []; const st = [key];
  while (st.length) { const k = st.pop(); const up = rev.get(k); if (!up || !up.size) { roots.push(k); continue; } for (const u of up) if (!seen.has(u)) { seen.add(u); st.push(u); } }
  return { roots, hasParent: rev.has(key) };
}
function checkLoaded(ctx, key, what) {
  const r = includeRoots(ctx, key);
  if (!r.hasParent && !/\/common\.set$/.test(key) && !/roster_/.test(key)) { ctx.err('GEN_ROSTER_NOT_LOADED', `${key} is included by no set file, ${what} there would never load`, key); return false; }
  ctx.info('GEN_ROSTER_CHAIN', `${key} <- ${r.roots.slice(0, 2).join(', ')} (include chain root; the engine entry that loads the root is [I])`, key);
  return true;
}
function replaceInFile(ctx, card, newLines) {
  // insert after the like block in the effective file; the mod copy replaces the whole file (ROSTER_REPLACES)
  const lines = card.lines.slice(); lines.splice(card.j + 1, 0, ...newLines);
  if (!ctx.inMod(card.key)) ctx.info('GEN_ROSTER_REPLACES', `${card.key}: the mod copy replaces the whole base file (other mods' edits of it are shadowed)`, card.key);
  ctx.write(card.key, lines.join(card.eol));
}

// ---- roster: card for a unit in an army list ----------------------------------------------------------------------------
function opRoster(ctx, spec) {
  if (spec.bots && typeof spec.bots === 'object' && module.exports.botBad(ctx, spec.bots, 'roster')) return; // ops-unit: bots {..} checked before any write
  const unit = S(spec.unit || spec.entity), like = S(spec.like), army = S(spec.army), period = S(spec.period || (ctx.goh ? 'late' : ''));
  const where = 'roster ' + unit;
  if (!unit || !like || !FACTION.test(army)) { ctx.err('GEN_ROSTER_ARGS', 'roster needs unit, like (existing card to copy) and army', where); return; }
  if (!ctx.plan && !ctx.virt.has('entity:' + lower(unit)) && !resolveFile(ctx, unit, where)) return;
  const files = unitFiles(ctx, army, period, 'vehicle');
  if (!files.length) { ctx.err('GEN_ROSTER_NO_FILE', `no army list file for army "${army}"${ctx.goh ? ' period ' + period : ''}`, where); return; }
  if (findCard(ctx, files, unit, army)) { ctx.err('GEN_ROSTER_EXISTS', `card "${unit}" already in the ${army} list`, where); return; }
  let card = findCard(ctx, files, like, army), other = null;
  // like may be a card of another army (a new army's list starts empty): the copy goes into this army's own vehicles_<army>.set
  // with its side tag s(<army>) (AS2; GoH lists are per army and period)
  if (!card && !ctx.goh) {
    const src = findCard(ctx, unitFiles(ctx, '', period, 'vehicle'), like, null);
    if (src) {
      const tk = 'resource/set/multiplayer/units/vehicles_' + lower(army) + '.set';
      if (!ctx.exists(tk)) { ctx.err('GEN_ROSTER_NO_FILE', `"${like}" is a card of another army (${src.key}); army ${army} has no list of its own (${tk}) to copy it into: make the army first (army op)`, where); return; }
      if (findCard(ctx, [tk], unit, null)) { ctx.err('GEN_ROSTER_EXISTS', `card "${unit}" already in ${tk}`, where); return; }
      const t = ctx.read(tk); const sl = t ? splitLines(t) : { eol: '\r\n', lines: [''] };
      other = { src, key: tk, sl, from: (/\bs(?:ide)?\((\w+)\)/i.exec(src.lines.slice(src.i, src.j + 1).join('\n')) || [])[1] || '?' };
    }
  }
  if (!card && !other) { ctx.err('GEN_ROSTER_LIKE_MISSING', `no card "${like}" for army ${army} in ${files.slice(0, 3).join(', ')}${files.length > 3 ? ' ..' : ''} nor in another army's list`, where); return; }
  if (!checkLoaded(ctx, card ? card.key : other.key, 'a card')) return;
  const from = card || other.src;
  let blk = from.lines.slice(from.i, from.j + 1).join('\n');
  blk = blk.replace(new RegExp('^(\\s*\\{\\s*")' + esc(like) + '(")', 'i'), (m, a, b) => a + unit + b);
  if (other) blk = blk.replace(/\b(s(?:ide)?\()\w+(\))/i, (m, a, b) => a + lower(army) + b);
  blk = applyFields(ctx, blk, spec.fields, where);
  // tags: [word, "-word"] and not_for_sale / basic / remove on the copied card (ops-unit cardEdit)
  const te = { tags: spec.tags, not_for_sale: spec.not_for_sale, basic: spec.basic, remove: spec.remove };
  if (module.exports.cardEdits(te)) { const r = module.exports.cardEdit(ctx, blk, te, [from.key, ...ctx.keys(/^resource\/set\/multiplayer\/units\/.*\.(set|inc)$/)], where); if (r === null) return; blk = r; }
  if (card) replaceInFile(ctx, card, blk.split('\n'));
  else {
    const ls = other.sl.lines.slice(); while (ls.length && ls[ls.length - 1].trim() === '') ls.pop();
    ls.push(...blk.split('\n'), '');
    if (!ctx.inMod(other.key)) ctx.info('GEN_ROSTER_REPLACES', `${other.key}: the mod copy replaces the whole base file`, other.key);
    const old = ctx.read(other.key), nb = Buffer.from(ls.join(other.sl.eol), 'latin1');
    ctx.write(other.key, nb);
    if (ctx.plan) planLines(ctx, other.key, old, nb, where);
    ctx.info('GEN_ROSTER_OTHER_ARMY', `${like} is a card of army ${other.from} (${other.src.key}:${other.src.i + 1}): copied as "${unit}" into ${other.key} with s(${lower(army)}) [T: buy it as ${army}]`, where);
  }
  if (ctx.virt.has('army:' + lower(army))) { ctx.armyCards = ctx.armyCards || {}; (ctx.armyCards[lower(army)] = ctx.armyCards[lower(army)] || []).push({ unit, like }); } // army op of this spec: armyBots writes its bots block from these
  ctx.names.add(lower(unit)); ctx.facts.push(`roster: ${unit} (${army}) card copied from ${like}${other ? ' of army ' + other.from : ''} in ${card ? card.key : other.src.key}`);
  ctx.test.push(`roster: ${unit} (${army}): start a LAN/test-mode match as ${army}, open the purchase panel: card present in its button group, price right, buyable, spawns. exe: ${ctx.target}.`);
  if (spec.name) ctx.texts.push({ key: 'desc/entity/' + unit, text: S(spec.name), file: '' });
  if (spec.icon_like) iconCopy(ctx, unit, S(spec.icon_like), where);
  botsAdvice(ctx, 'vehicle', unit, like, army, spec, where);
}
function iconCopy(ctx, unit, like, where) {
  const ks = ctx.keys(new RegExp('^resource/interface/scene/unit_icon(_small)?/' + esc(lower(like)) + '(_0\\d)?\\.tga$'));
  if (!ks.length) { ctx.err('GEN_ICON_LIKE_MISSING', `no unit_icon files for "${like}"`, where); return; }
  for (const k of ks) { const nk = k.replace(new RegExp('/' + esc(lower(like)) + '(_0\\d|)\\.tga$'), (m, s) => '/' + lower(unit) + s + '.tga'); const b = ctx.read(k); if (b) ctx.write(nk, b); }
  ctx.facts.push(`icon: ${ks.length} file(s) copied ${like} -> ${unit}`);
  ctx.test.push(`icon: ${unit} card shows the ${like} picture (copy), 4 state frames (idle/hover/press/disabled).`);
}
// ---- card: price/name/icon of an existing card (in the mod copy) ----------------------------------------------------------
function opCard(ctx, spec) {
  if (spec.list !== undefined) return module.exports.opCardList(ctx, spec); // ops-unit: a co-op / single-player list
  const unit = S(spec.unit), army = S(spec.army), where = 'card ' + unit;
  if (!unit || !FACTION.test(army)) { ctx.err('GEN_CARD_ARGS', 'card needs unit and army', where); return; }
  const period = S(spec.period || (ctx.goh ? 'late' : '')), files = unitFiles(ctx, army, period, 'vehicle');
  const X = module.exports, edits = X.cardEdits(spec);
  let card = findCard(ctx, files, unit, army), soldier = false;
  // a soldier card: {"mp/<army>/<name>" ("macro" side(..))} in soldiers.set (GoH: inf_<army>.set); unit is <name> or mp/<army>/<name>
  if (!card) { const sn = unit.replace(new RegExp('^mp/' + esc(army) + '/', 'i'), ''); if (/^[a-z0-9_]+$/i.test(sn)) { card = findDecl(ctx, lower(army), sn, period); soldier = !!card; } }
  if (soldier && spec.info !== undefined) { ctx.err('GEN_CARD_INFO_SOLDIER', `${unit} is a soldier card: the purchase panel shows the squad's info text (info/squad/<squad>(${army})); set it with the squad op's info`, where); return; }
  if (card && edits) {
    const blk = card.lines.slice(card.i, card.j + 1).join('\n');
    const nb = X.cardEdit(ctx, blk, spec, [card.key, ...ctx.keys(/^resource\/set\/multiplayer\/units\/.*\.(set|inc)$/)], where);
    if (nb === null) return;
    if (nb !== blk) {
      const lines = card.lines.slice(); lines.splice(card.i, card.j - card.i + 1, ...nb.split('\n'));
      if (!ctx.inMod(card.key)) ctx.info('GEN_ROSTER_REPLACES', `${card.key}: the mod copy replaces the whole base file`, card.key);
      const old = ctx.read(card.key), buf = Buffer.from(lines.join(card.eol), 'latin1');
      ctx.write(card.key, buf);
      if (ctx.plan) planLines(ctx, card.key, old, buf, where);
      ctx.test.push(`card: ${unit} (${army}) ${soldier ? 'soldier ' : ''}card changed (${edits}): the purchase panel shows it so (price, cp, greyed for not_for_sale, gone for remove); buying deducts the new price [T].`);
    }
  } else if (!card && edits) { ctx.err('GEN_CARD_UNKNOWN', `no card "${unit}" for army ${army} in the army lists nor a soldier card mp/${army}/${unit} in ${declFiles(ctx, army, period).join(', ')}`, where); return; }
  if (spec.name) ctx.texts.push({ key: S(spec.key || 'desc/entity/' + unit), text: S(spec.name), file: '' });
  if (spec.info !== undefined) ctx.texts.push({ key: S(spec.info_key || 'info/entity/' + unit), text: S(spec.info), file: '' });
  if (spec.icon_like) iconCopy(ctx, unit, S(spec.icon_like), where);
  ctx.facts.push(`card: ${unit} (${army})`);
}

// ---- squad / breed -----------------------------------------------------------------------------------------------------------
const breedKey = (ctx, army, name, period) => `resource/set/breed/mp/${army}/${ctx.goh ? period + '/' : ''}${name}.set`;
const declRe = (ctx, army, name, period) => new RegExp('^\\s*\\{\\s*"mp/' + esc(army) + '/' + (ctx.goh ? esc(period) + '/' : '') + esc(name) + '"', 'i');
function declFiles(ctx, army, period) { return ctx.goh ? [`resource/set/multiplayer/units/${period}/inf_${army}.set`] : ['resource/set/multiplayer/units/soldiers.set']; }
function findDecl(ctx, army, name, period) {
  const re = declRe(ctx, army, name, period);
  for (const key of declFiles(ctx, army, period)) {
    const b = ctx.read(key); if (!b) continue;
    const { eol, lines } = splitLines(b);
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) { const j = blockEnd(lines, i); return { key, lines, eol, i, j: j < 0 ? i : j }; }
  }
  return null;
}
// effective localization text of a key (base .lng under resource/interface/text, deps included; AS2 only). lazy map lower key -> text
function locText(ctx, key) {
  if (ctx.goh) return null;
  if (!ctx.locMap) {
    ctx.locMap = new Map();
    const lngpot = require('../../upgrade/lib/lngpot');
    for (const k of ctx.keys(/^resource\/interface\/text\/.*\.lng$/)) {
      const b = ctx.read(k); if (!b) continue;
      try { for (const [kk, t] of lngpot.lngKeys(b, k.slice('resource/interface/text/'.length))) ctx.locMap.set(kk.toLowerCase(), t); } catch (e) { /* unreadable lng: no text from it */ }
    }
  }
  const t = ctx.locMap.get(lower(key));
  return t === undefined ? null : t;
}
// localization entry made by gen itself (squad/breed): spec text > copy of the like key's text > fallback. auto: a text op on the same key wins
function autoText(ctx, key, given, likeKey, fallback, where) {
  let text = S(given), from = 'spec';
  if (!text) { const t = likeKey ? locText(ctx, likeKey) : null; if (t !== null) { text = t; from = 'copy of ' + likeKey; } else { text = fallback; from = 'fallback'; } }
  ctx.texts.push({ key, text, file: '', auto: true });
  ctx.info('GEN_LOC_AUTO', `${key} = "${text.slice(0, 60)}" (${from})`, where);
}
// AS2 bots buy only units named in script/multiplayer/bot.data.lua Purchases (modweb ai/mp-bot): copy every "<like>(<army>)" entry as "<name>(<army>)"
const BOTKEY = 'resource/script/multiplayer/bot.data.lua';
function botPurchases(ctx, name, like, army, prio, where, bo) {
  if (ctx.goh) { ctx.notFor('WARN_GEN_BOTS_AS2_ONLY', 'bots', `GoH has no script/multiplayer/bot.data.lua Purchases (bot.main.lua + modes/*.lua instead); ${name} not added for bots`, 'GHMIS-66', where); return; }
  const b = ctx.read(BOTKEY);
  if (!b) { ctx.err('GEN_BOTS_NO_DATA', `no ${BOTKEY} in the base data`, where); return; }
  const { eol, lines } = splitLines(b);
  const re = new RegExp('(\\bunit\\s*=\\s*")' + esc(like) + '\\(' + esc(army) + '\\)(")', 'i'), out = [];
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!re.test(l) || /^\s*--/.test(l)) { out.push(l); continue; }
    let nl = l.replace(re, (m, a, z) => a + name + '(' + army + ')' + z);
    if (prio !== null) nl = nl.replace(/(\bpriority\s*=\s*)[\d.]+/, '$1' + prio);
    if (bo) nl = module.exports.botFields(nl, bo); // ops-unit: bots {class min_income min_team}
    const code = l.replace(/--.*$/, '');
    if (/\}\s*$/.test(code)) { out.push(l.replace(/\}(\s*)(--.*)?$/, (m, w, c) => '},' + w + (c || ''))); out.push(nl); } // last entry of a stage: comma goes on the copied-from line
    else out.push(l, nl);
    n++;
  }
  if (!n) { ctx.err('WARN_GEN_BOTS_LIKE_ABSENT', `bots: no "${like}(${army})" entry in ${BOTKEY} Purchases, bots do not buy ${like} either; ${name} not added`, where); return; }
  if (!ctx.inMod(BOTKEY)) ctx.info('GEN_ROSTER_REPLACES', `${BOTKEY}: the mod copy replaces the whole base file (other mods' bot edits are shadowed)`, BOTKEY);
  ctx.write(BOTKEY, out.join(eol));
  ctx.facts.push(`bots: ${name}(${army}) added to ${n} Purchases stage(s) next to ${like}(${army})${prio !== null ? ', priority ' + prio : ''}`);
  ctx.test.push(`bots: ${name}(${army}): MP match with normal bots on ${army}, 8 min: game.log / testrun rows show bots buying ${name} [I].`);
}
const definedMacros = ctx => { const s = new Set(); for (const k of ctx.keys(/^resource\/set\/(multiplayer\/units|breed)\/.*\.(set|inc)$/)) { const t = ctx.readStr(k) || ''; for (const m of t.matchAll(/\(\s*define\s+"([^"]+)"/gi)) s.add(lower(m[1])); } return s; };

// bots: true | <priority>: AS2 bots buy only bot.data.lua Purchases units, a card alone is never bought (C05) [I]
// FIX-PORT tools-mod:31: with no bots key the unit is never bought by AI bots; when bots DO buy the like, that is a silent gap, so it is a warning (bots: false says it is meant)
// N5: same for a roster (vehicle/gun) card: WARN_GEN_VEHICLE_NO_BOTS
function botsAdvice(ctx, kind, name, like, army, spec, where) {
  const bo = spec.bots && typeof spec.bots === 'object' ? spec.bots : null; // ops-unit: bots {priority class min_income min_team}
  if (bo) { if (!module.exports.botBad(ctx, bo, where)) botPurchases(ctx, name, like, army, bo.priority !== undefined ? S(bo.priority) : null, where, bo); return; }
  if (spec.bots !== undefined && spec.bots !== false && S(spec.bots) !== 'false') { botPurchases(ctx, name, like, army, /^[\d.]+$/.test(S(spec.bots)) ? S(spec.bots) : null, where); return; }
  const b = spec.bots === undefined && !ctx.goh ? ctx.read(BOTKEY) : null;
  const re = new RegExp('\\bunit\\s*=\\s*"' + esc(like) + '\\(' + esc(army) + '\\)"', 'i');
  const nLike = b ? splitLines(b).lines.filter(l => !/^\s*--/.test(l) && re.test(l)).length : 0;
  const code = kind === 'squad' ? 'SQUAD' : 'VEHICLE';
  if (nLike) ctx.err('WARN_GEN_' + code + '_NO_BOTS', `${kind} ${name}: AI bots buy ${like}(${army}) in ${nLike} ${BOTKEY} Purchases stage(s) but will never buy ${name} (bots buy only Purchases units, C05 [I]); set bots: true (or a priority) to add it there, or bots: false if that is meant`, where);
  else ctx.info('GEN_' + code + '_NO_BOTS', `${kind} ${name}: bots buy only units in ${BOTKEY} Purchases; ${spec.bots === undefined ? (ctx.goh ? 'GoH bot data is not mapped' : `bots do not buy ${like}(${army}) either`) : 'bots: false'}; set bots: true (or a priority) to add it next to ${like}(${army})`, where);
}

function opSquad(ctx, spec) {
  if (spec.bots && typeof spec.bots === 'object' && module.exports.botBad(ctx, spec.bots, 'squad')) return; // ops-unit: bots {..} checked before any write
  if (module.exports.squadX(spec)) return module.exports.opSquadX(ctx, spec); // ops-unit: content / order / not_for_sale / remove / >4 types
  const name = S(spec.name), like = S(spec.like), army = S(spec.army), period = S(spec.period || (ctx.goh ? 'late' : '')), where = 'squad ' + name;
  const mem = list(spec.members).map(m => typeof m === 'string' ? { breed: m.split(':')[0], n: +(m.split(':')[1] || 1) } : { breed: S(m.breed), n: +(m.n || m.count || 1) });
  if (!SQUAD_NAME.test(name) || !like || !FACTION.test(army) || !mem.length) { ctx.err('GEN_SQUAD_ARGS', 'squad needs name, army, like (existing squad to copy fields from) and members [breed:n ..]', where); return; }
  if (mem.some(m => !m.breed || !(m.n >= 1))) { ctx.err('GEN_SQUAD_ARGS', 'members need breed and n>=1', where); return; }
  const files = unitFiles(ctx, army, period, 'squad');
  if (!files.length) { ctx.err('GEN_ROSTER_NO_FILE', `no squad list for army ${army}${ctx.goh ? ' period ' + period : ''}`, where); return; }
  // template line: ("squad_withNtypes" side(army) name(like) ...)
  let card = null;
  for (const key of files) {
    const b = ctx.read(key); if (!b) continue;
    const { eol, lines } = splitLines(b);
    const re = new RegExp('^\\s*\\(\\s*"(squad|single)_with\\w*"[^\\n]*\\bname\\(' + esc(like) + '\\)', 'i'), sre = new RegExp('\\bside\\(' + esc(army) + '\\)', 'i');
    const i = lines.findIndex(l => re.test(l) && (sre.test(l) || ctx.goh)); // AS2 squads.set holds all sides, GoH files are per side
    if (i >= 0) { card = { key, lines, eol, i, j: i }; break; }
  }
  if (!card) { ctx.err('GEN_SQUAD_LIKE_MISSING', `no squad line with name(${like}) for army ${army} in ${files.join(', ')}`, where); return; }
  if (card.lines.some(l => new RegExp('\\bname\\(' + esc(name) + '\\)', 'i').test(l) && (!ctx.goh && new RegExp('\\bside\\(' + esc(army) + '\\)', 'i').test(l) || ctx.goh))) { ctx.err('GEN_SQUAD_EXISTS', `squad ${name} already exists for ${army}`, where); return; }
  if (!checkLoaded(ctx, card.key, 'a squad')) return;
  const macros = definedMacros(ctx);
  for (const m of mem) {
    const bk = breedKey(ctx, army, m.breed, period);
    if (!ctx.exists(bk) && !ctx.virt.has('breed:' + army + ':' + lower(m.breed))) { ctx.err('GEN_SQUAD_BREED_UNKNOWN', `breed "${m.breed}" has no ${bk} (squad member names are breeds, not entities)`, where); return; }
    if (!findDecl(ctx, army, m.breed, period) && !ctx.virt.has('breed:' + army + ':' + lower(m.breed))) ctx.err('WARN_GEN_SQUAD_BREED_UNDECLARED', `breed ${m.breed}: no "mp/${army}/${ctx.goh ? period + '/' : ''}${m.breed}" declaration in ${declFiles(ctx, army, period)[0]} (cp/score/cost unset?) [I]`, where);
  }
  let l = card.lines[card.i];
  const n = mem.length;
  const mm = /^(\s*\(\s*")(squad_with)(\d+)(types)([^"]*)(")/i.exec(l), sm = /^(\s*\(\s*")(single_with)(\d+)(type)([^"]*)(")/i.exec(l);
  let macro;
  if (mm) { macro = 'squad_with' + n + 'types' + mm[5]; } else if (sm && n === 1) macro = sm[2] + '1type' + sm[5]; else macro = 'squad_with' + n + 'types';
  if (!macros.has(lower(macro))) { ctx.err('GEN_SQUAD_MACRO_UNDEFINED', `macro "${macro}" (${n} member types) is not defined in the unit/breed set files`, where); return; }
  l = l.replace(/^(\s*\(\s*")[^"]+(")/, (m, a, b) => a + macro + b);
  l = l.replace(/\s+c\d+\([^()]*\)/g, '');
  const cs = mem.map((m, i) => `c${i + 1}(${m.breed}:${m.n})`).join(' ');
  if (/\bg\([^()]*\)/.test(l)) l = l.replace(/(\bg\([^()]*\))/, '$1 ' + cs); else l = l.replace(/(\bb\()/, cs + ' $1');
  l = l.replace(new RegExp('\\bname\\(' + esc(like) + '\\)', 'i'), 'name(' + name + ')');
  l = applyFields(ctx, l, spec.fields, where);
  replaceInFile(ctx, card, [l]);
  // display name key desc/squad/<name>(<side>) (same in AS2 desc.lng and GoH desc_squad*.pot) [V data]
  // name + info entries always (LOC_NAME_MISSING / LOC_INFO_MISSING otherwise): display/info > like's text > the squad name
  autoText(ctx, `desc/squad/${name}(${army})`, spec.display, `desc/squad/${like}(${army})`, name, where);
  autoText(ctx, `info/squad/${name}(${army})`, spec.info, `info/squad/${like}(${army})`, S(spec.display) || name, where);
  botsAdvice(ctx, 'squad', name, like, army, spec, where);
  ctx.names.add(lower(name)); ctx.facts.push(`squad: ${name} (${army}${ctx.goh ? ' ' + period : ''}) = ${mem.map(m => m.breed + ':' + m.n).join(' ')} via ${macro}`);
  ctx.test.push(`squad: ${name} (${army}): lobby purchase panel (${ctx.goh ? 'button ' + (/b\((\w+)\)/.exec(l) || [])[1] : 'squad button'}): card shows name and price, buy it, squad spawns with ${mem.map(m => m.n + ' ' + m.breed).join(', ')}, no 'Can't preload mp/${army}' warnings. exe: ${ctx.target}. format inferred from vanilla lines [I].`);
}

function opBreed(ctx, spec) {
  const name = S(spec.name), like = S(spec.like), army = S(spec.army), period = S(spec.period || (ctx.goh ? 'late' : '')), where = 'breed ' + name;
  if (!SQUAD_NAME.test(name) || !like || !FACTION.test(army)) { ctx.err('GEN_BREED_ARGS', 'breed needs name, like (existing breed), army', where); return; }
  const lk = breedKey(ctx, army, lower(like), period), nk = breedKey(ctx, army, lower(name), period);
  const b = ctx.read(lk);
  if (!b) { ctx.err('GEN_BREED_LIKE_MISSING', `no breed file ${lk}`, where); return; }
  if (ctx.exists(nk)) { ctx.err('GEN_BREED_EXISTS', `${nk} already exists`, where); return; }
  const d = findDecl(ctx, army, like, period);
  if (!d) { ctx.err('GEN_BREED_DECL_MISSING', `no "mp/${army}/${ctx.goh ? period + '/' : ''}${like}" declaration in ${declFiles(ctx, army, period)[0]} to copy`, where); return; }
  let buf = b;
  for (const [p, v] of Object.entries(spec.set || {})) {
    const pp = p.replace(/^\+/, ''), r = patch.applyEdit(buf, { op: /^\+/.test(p) ? 'add' : 'set', path: /^breed\//i.test(pp) ? pp : 'breed/' + pp, value: S(v) });
    if (r.err) { ctx.err('GEN_SET_PATH_MISSING', `breed ${name} ${p}: ${r.err[1]}`, where); continue; }
    buf = r.buf;
  }
  if (spec.veterancy !== undefined) {
    const t = buf.toString('latin1'), re = /\(\s*"(veterancy_(?:lvl_)?)(\d+)"\s*\)/;
    if (!re.test(t)) ctx.err('GEN_BREED_VET_MISSING', `breed ${like} has no ("veterancy_..") call to change`, where);
    else {
      const nm = RegExp.$1 + S(spec.veterancy);
      if (!definedMacros(ctx).has(nm)) ctx.err('GEN_BREED_VET_UNDEFINED', `macro "${nm}" is not defined (${ctx.goh ? 'set/breed/presets/perks/veterancy.inc' : 'set/breed/veterancy*.inc'})`, where);
      else buf = Buffer.from(t.replace(re, `("${nm}")`), 'latin1');
    }
  }
  buf = module.exports.breedDel(ctx, buf, spec.del, where); // ops-unit: del inventory items / perk lines
  if (!buf) return;
  const dl = d.lines.slice(d.i, d.j + 1).join('\n').replace(new RegExp('("mp/' + esc(army) + '/' + (ctx.goh ? esc(period) + '/' : '') + ')' + esc(like) + '"', 'i'), (m, a) => a + name + '"');
  const nd = module.exports.declFields(ctx, dl, spec.decl, d, where); // ops-unit: a macro-call declaration is expanded to a block first; null = refused
  if (nd === null) return;
  ctx.write(nk, buf);
  d.lines.splice(d.j + 1, 0, ...nd.split('\n'));
  if (!ctx.inMod(d.key)) ctx.info('GEN_ROSTER_REPLACES', `${d.key}: the mod copy replaces the whole base file`, d.key);
  ctx.write(d.key, d.lines.join(d.eol));
  // GoH: other period lists that declare the copied breed (conquest/inf_ger.set declares mp/ger/mid/.. too [V]) get the new card as well
  if (ctx.goh) for (const ok of ctx.keys(new RegExp('^resource/set/multiplayer/units/[a-z0-9_]+/inf_' + esc(army) + '\\.set$', 'i'))) {
    if (ok === d.key) continue;
    const ob = ctx.read(ok); if (!ob) continue;
    const o = splitLines(ob), re = declRe(ctx, army, like, period), i = o.lines.findIndex(l => re.test(l));
    if (i < 0) continue;
    const j0 = blockEnd(o.lines, i), j = j0 < 0 ? i : j0;
    const ol = o.lines.slice(i, j + 1).join('\n').replace(new RegExp('("mp/' + esc(army) + '/' + esc(period) + '/)' + esc(like) + '"', 'i'), (m, a) => a + name + '"');
    const od = module.exports.declFields(ctx, ol, spec.decl, { key: ok, lines: o.lines, eol: o.eol, i, j }, where);
    if (od === null) return;
    o.lines.splice(j + 1, 0, ...od.split('\n'));
    if (!ctx.inMod(ok)) ctx.info('GEN_ROSTER_REPLACES', `${ok}: the mod copy replaces the whole base file`, ok);
    ctx.write(ok, o.lines.join(o.eol));
  }
  ctx.virt.add('breed:' + army + ':' + lower(name));
  // soldier name desc/human/mp/<army>/[<period>/]<name> (loccover LOC_NAME_MISSING; GoH key form [I]): display > like's text > name
  const hk = `desc/human/mp/${army}/${ctx.goh ? period + '/' : ''}`;
  autoText(ctx, hk + name, spec.display, hk + like, name, where);
  ctx.names.add(lower(name)); ctx.facts.push(`breed: ${army}/${name} from ${like}${spec.veterancy !== undefined ? ' vet ' + spec.veterancy : ''}`);
  ctx.test.push(`breed: ${army}/${name}: buy a squad containing it; check the soldier's weapon/inventory/skin and that it fires; log has no 'Can't preload mp/${army}/${name}'. exe: ${ctx.target}.`);
}

// ---- wrapped map tools: map-clone, mission-clone, place-entity ------------------------------------------------------------
// each op runs the existing CLI (tools/map-clone, tools/mission-clone, tools/place-entity) with --out = the mod folder; plan -> the
// tool's own dry flag (map-clone --plan, mission-clone/place-entity --dry-run). Their files are already CRLF, strings UTF-8.
const MAPKEY = /^map\/[a-z0-9_\-]+(\/[a-z0-9_\-]+)+$/i;
const mapKey = m => { const s = S(m).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''); return /^map\//i.test(s) ? s : 'map/' + s; };
// mods to search for a source map: the spec's deps that are folders under G/mods (as64+ is built in) + op-level mods: [..]
const srcMods = (ctx, spec) => [...new Set([...ctx.mods, ...list(spec.mods || [])].map(S).filter(m => fs.existsSync(path.join(ctx.root, 'mods', m))))];
function opMapClone(ctx, spec) {
  const map = mapKey(spec.map || spec.from), name = S(spec.name || spec.as), where = 'map-clone ' + name;
  if (!MAPKEY.test(map) || !MAPNAME.test(name)) { ctx.err('GEN_MAPCLONE_ARGS', 'map-clone needs map (map/multi/<m>) and name [A-Za-z0-9_]+', where); return; }
  const ma = ['--game', ctx.root, '--map', map, '--name', name, '--out', ctx.out, '--target', ctx.target, ...(srcMods(ctx, spec).length ? ['--mods', srcMods(ctx, spec).join(',')] : [])];
  // GoH: the mod op's game_version goes to map-clone too, so its mod.info range matches newmod's (map-clone warns WARN_MAPCLONE_GOH_VERSION
  // when it can read no exe version and has none); AS2/AS64 argument lists stay as before
  if (ctx.goh && ctx.gameVersion) ma.push('--game-version', ctx.gameVersion);
  // --plan: a temp run whose text files (.mi, map.info, .mtl, .lng) go into ctx.dirty, binaries into ctx.virt (planTemp), so later set rows see them
  const r = ctx.plan ? planTemp(ctx, 'map-clone', ma, where) : ctx.tool('map-clone', ma);
  const f = parseFind(ctx, r, 'map-clone');
  if (f.some(x => !x.info && !/^WARN_/.test(x.code))) return;
  const nk = map.replace(/[^/]+$/, name.toLowerCase());
  ctx.virtMaps.add(nk.toLowerCase());
  ctx.facts.push(`map-clone: ${map} -> ${nk} (terrain bytes untouched)`);
  ctx.test.push(`map-clone: ${name}: the map is listed in the lobby with the source's display name and loads like ${map}; check game.log for missing map files. exe: ${ctx.target}.`);
}
// --plan for a tool with no plan-out: the tool writes into a temp folder (its --out replaced), every file it wrote (but mod.info)
// goes into ctx.dirty (text, up to 4 MB) or ctx.virt (binary or bigger: a name only), the temp folder is removed
function planTemp(ctx, tool, args, where) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gen-' + tool + '-')), a = args.slice(), oi = a.indexOf('--out');
  a[oi + 1] = tmp;
  try {
    const r = ctx.tool(tool, a);
    ctx.planned = ctx.planned || new Set();
    (function walk(d, rel) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name), k = rel + e.name.toLowerCase();
        if (e.isDirectory()) { walk(p, k + '/'); continue; }
        if (k === 'mod.info') continue;
        const buf = fs.readFileSync(p);
        if (isText(k) && buf.length <= 4 << 20 && !buf.includes(0)) { const old = ctx.read(k); ctx.write(k, buf); ctx.planned.add(k); planLines(ctx, k, old, buf, where); }
        else { ctx.virt.add(k); ctx.info('GEN_PLAN_WRITE', `${k} (new file): ${buf.length} bytes`, where); }
      }
    })(tmp, '');
    return r;
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp */ } }
}
function opMissionClone(ctx, spec) {
  const map = mapKey(spec.map), from = S(spec.from), to = S(spec.to || spec.with_mode), where = 'mission-clone ' + map;
  if (!MAPKEY.test(map) || !from || !to) { ctx.err('GEN_MISSION_ARGS', 'mission-clone needs map, from (mode) and to (mode)', where); return; }
  if (ctx.plan && ctx.virtMaps.has(map.toLowerCase())) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${map} is created by an earlier map-clone op: mission-clone not simulated in --plan`, where); return; }
  // GoH [I]: mission-clone --exe goh is its GoH-to-GoH branch (GoH mode table, <mode>.info, .pot title, mod.info range from the GoH exe;
  // its --target follows the --exe game); the mod op's game_version goes along so the mod.info range matches newmod's
  const a = ['--game', ctx.root, '--map', map, '--from', from, '--to', to, '--out', ctx.out, ...(ctx.goh ? ['--exe', 'goh'] : ctx.exeArgs())];
  if (ctx.goh && ctx.gameVersion) a.push('--game-version', ctx.gameVersion);
  // MoW:AS2: mission-clone --target mowas2 (mod.info range 3.262; it picks as64 when as64.exe is in the folder and no target is named)
  if (!ctx.goh && ctx.exeArgs().length) a.push('--target', ctx.target);
  if (spec.flags !== undefined) a.push('--flags', S(spec.flags));
  const noBots = spec.no_bots === true || /^(true|yes|1)$/i.test(S(spec.no_bots));
  if (noBots && !spec.with_mode) { ctx.err('GEN_MISSION_ARGS', 'no_bots goes with with_mode (a new mode card); an existing mode keeps its own card', where); return; }
  if (spec.with_mode) { a.push('--with-mode', S(spec.with_mode)); if (spec.from_mode) a.push('--from-mode', S(spec.from_mode)); if (spec.title) a.push('--title', S(spec.title)); if (noBots) a.push('--no-bots'); }
  if (srcMods(ctx, spec).length) a.push('--mods', srcMods(ctx, spec).join(','));
  if (spec.src) a.push('--src', S(spec.src));   // e.g. the GoH root: (include ../bz_*.inc) copied from its paks
  // --plan: run for real into a temp folder and hold its files in ctx.dirty (planTemp), so a later set row on the new mode card
  // (games/<with_mode>.set) or the .mi of the same spec finds it; a real run writes the mod folder and ctx.tool forgets the disk cache
  const r = ctx.plan ? planTemp(ctx, 'mission-clone', a, where) : ctx.tool('mission-clone', a);
  const f = parseFind(ctx, r, 'mission-clone');
  if (f.some(x => !x.info && !/^WARN_/.test(x.code))) return;
  if (spec.with_mode) ctx.virt.add('mode:' + lower(S(spec.with_mode)));
  ctx.facts.push(`mission-clone: ${map} ${from} -> ${to}${spec.with_mode ? ' (new mode ' + spec.with_mode + (noBots ? ', bots off' : '') + ')' : ''}`);
  ctx.test.push(`mission-clone: ${map} mode ${to}: pick it in the lobby, start with 2 players; spawn points and flags appear, capture works. MC_NEEDS_MANUAL findings = hand edit owed.`);
}
function opPlace(ctx, spec) {
  for (const it of list(spec.items || [spec])) {
    const map = S(it.map).replace(/^map\//i, ''), ent = S(it.entity), where = 'place ' + ent;
    const pos = Array.isArray(it.pos) ? it.pos.join(',') : S(it.pos);
    if (!map || !ent || !pos) { ctx.err('GEN_PLACE_ARGS', 'place needs map (multi/<m>), entity (def name) and pos "x,y[,z]" in map units (MAP-16)', where); continue; }
    if (ctx.plan && ctx.virtMaps.has(('map/' + map).toLowerCase())) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `map ${map} is created by an earlier map-clone op: place not simulated in --plan`, where); continue; }
    const a = [ctx.out, '--game', ctx.root, '--map', map, '--entity', ent, '--pos', pos, ...ctx.exeArgs()];
    if (ctx.mods.length) a.push('--mods', ctx.mods.join(','));
    if (it.dir !== undefined) a.push('--dir', S(it.dir));
    if (it.scale !== undefined) a.push('--scale', S(it.scale));
    if (it.tex !== undefined) a.push('--tex', S(it.tex));
    if (ctx.plan) a.push('--dry-run');
    const r = ctx.tool('place-entity', a);
    const f = parseFind(ctx, r, 'place-entity');
    if (f.some(x => !x.info && !/^WARN_/.test(x.code))) continue;
    ctx.facts.push(`place: ${ent} at ${pos} on ${map}`);
    ctx.test.push(`place: ${ent} on ${map} at ${pos}: load the map, find the object at that spot (map units, MAP-16), right height, no log error. Map files are CRC-compared in MP (VFS-29): all players need the mod.`);
  }
}

// ---- new parts for a unit: gun (own weapon file), weapon (mount it), kitbash (turret of another vehicle) ------------------------
// AS2 layout (resource/set/stuff/gun/<name>, shells resource/set/stuff/shell/<family>.<type>.ammo). GoH [I]: gun (no pen/damage) and
// weapon (ammo lines kept) on the same file forms; kitbash: one plain line (model editing, owner decision 2026-11-10).
const GUNDIR = 'resource/set/stuff/gun/', SHELLDIR = 'resource/set/stuff/shell/';
const GUN_NAME = /^[a-z0-9][a-z0-9_()-]*$/;
const STUFF_OF = h => 'resource/set/stuff/' + h.dir + h.base;
// the gun file and the files it inherits from ({from "x"}), nearest first
function gunChain(ctx, name) {
  const out = []; let n = lower(S(name)).trim();
  for (let i = 0; i < 8 && n && n !== 'pattern gun'; i++) {
    const key = GUNDIR + n, text = ctx.readStr(key);
    if (text === null) break;
    out.push({ name: n, key, text });
    const m = /\{\s*from\s+"([^"]+)"/i.exec(text);
    n = m ? lower(m[1]) : '';
  }
  return out;
}
// text with every {parameters "x" ..} block cut out (their values belong to one shell type)
function gunOwn(text) {
  let s = text, m;
  while ((m = /\{\s*parameters\s+"/i.exec(s))) { const e = sdlEnd(s, m.index); if (e < 0) break; s = s.slice(0, m.index) + s.slice(e + 1); }
  return s;
}
function gunFacts(ctx, name) {
  const ch = gunChain(ctx, name), f = { found: ch.length > 0, chain: ch.map(c => c.name) };
  const first = re => { for (const c of ch) { const m = re.exec(gunOwn(c.text)); if (m) return m; } return null; };
  let m;
  if ((m = first(/\{\s*filling\s+"([^"]+)"/i))) f.filling = lower(m[1]);
  if ((m = first(/\{\s*rechargeTime\s+([\d.]+)/i))) f.recharge = +m[1];
  if ((m = first(/\(\s*"speed"\s+s\(\s*([\d.]+)/i))) f.speed = +m[1];
  if ((m = first(/\{\s*projectileDamage\s+([\d.]+)/i))) f.damage = +m[1];
  if ((m = first(/\(\s*"(damage2?)"\s+a\(\s*([\d.]+)\s*\)\s*b\(\s*([\d.]+)\s*\)\s*c\(\s*([\d.]+)\s*\)\s*d\(\s*([\d.]+)\s*\)\s*e\(\s*([\d.]+)\s*\)/i))) { f.penMacro = lower(m[1]); f.pen = m.slice(2, 7).map(Number); }
  // GoH gun files: ("reload time" seconds(n)) ("velocity" mps(n)) (vanilla gun/100mm_bs3 and rifles [V GoH data])
  if (f.recharge === undefined && (m = first(/\(\s*"reload time"\s+seconds\(\s*([\d.]+)/i))) f.recharge = +m[1];
  if (f.speed === undefined && (m = first(/\(\s*"velocity"\s+mps\(\s*([\d.]+)/i))) f.speed = +m[1];
  // GoH cannons with a speed per ammo type: ("velocity m/s" ap(n) apcr(n) he(n) heat(n)) (vanilla gun/100mm_d10c [V GoH data]); speed = ap, else he
  if (f.speed === undefined && (m = first(/\(\s*"velocity m\/s"([^)]*(?:\([^)]*\)[^)]*)*)\)/i))) { f.speedAmmo = true; const v = /\b(?:ap|he)\(\s*([\d.]+)/i.exec(m[1]); if (v) f.speed = +v[1]; }
  if ((m = first(/\(\s*"range_([\w-]+)"/i))) f.range = lower(m[1]);
  if ((m = first(/\(\s*"accuracy_(\w+)"/i))) f.accuracy = lower(m[1]);
  // GoH accuracy call with its arguments: ("accuracy_direct" r1(0.55) range_ap(220) range_he(220) range_heat(220)) (vanilla gun/100mm_d10c [V GoH data])
  if ((m = first(/\(\s*"accuracy_\w+"((?:\s+[\w-]+\(\s*[^()]*?\s*\))+)\s*\)/i))) f.accArgs = [...m[1].matchAll(/([\w-]+)\(\s*([^()]*?)\s*\)/g)].map(x => [lower(x[1]), x[2]]);
  for (const c of ch) { const p = /\{\s*parameters\s+"apcr"[\s\S]*?\(\s*"damage2?"\s+a\(\s*([\d.]+)\s*\)\s*b\(\s*([\d.]+)\s*\)\s*c\(\s*([\d.]+)\s*\)\s*d\(\s*([\d.]+)\s*\)\s*e\(\s*([\d.]+)\s*\)/i.exec(c.text); if (p) { f.apcr = p.slice(1, 6).map(Number); break; } }
  return f;
}
// index of the brace that closes the block opening at i ('{' or '('), strings and ; comments skipped. -1 = unbalanced
function sdlEnd(s, i) {
  const open = s[i], close = open === '(' ? ')' : '}';
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"') { j = s.indexOf('"', j + 1); if (j < 0) return -1; continue; }
    if (c === ';') { const e = s.indexOf('\n', j); if (e < 0) return -1; j = e; continue; }
    if (c === open) d++; else if (c === close && --d === 0) return j;
  }
  return -1;
}
function presetNames(ctx) { return [...(ctx.readStr(GUNDIR + '.presets') || '').matchAll(/\(\s*define\s+"([^"]+)"/gi)].map(m => lower(m[1])); }
// the %params a gun/.presets define uses, in order of first use (GoH accuracy_direct: r1 range_ap range_he range_heat [V GoH data])
function presetParams(ctx, mac) {
  const s = ctx.readStr(GUNDIR + '.presets') || '', m = new RegExp('\\(\\s*define\\s+"' + esc(mac) + '"', 'i').exec(s);
  if (!m) return [];
  const e = sdlEnd(s, m.index), body = s.slice(m.index, e < 0 ? s.length : e + 1);
  return [...new Set([...body.matchAll(/%([\w-]+)/g)].map(x => lower(x[1])))];
}
function opGun(ctx, spec) {
  const name = lower(S(spec.name)).trim(), like = lower(S(spec.like)).trim(), where = 'gun ' + name;
  if (!GUN_NAME.test(name) || !like) { ctx.err('GEN_GUN_ARGS', 'gun needs name (new weapon name: a-z 0-9 _ ( ) -, no dots or spaces) and like (existing gun to inherit from)', where); return; }
  // GoH [I]: same file form (resource/set/stuff/gun/<name>, {from "<like>"}); its .presets has "reload time" seconds() and "velocity" mps()
  // (used below when present) and range_<n> / accuracy_<x> names; penetration is per shell type through "penetration_*" macros
  // GoH: pen, pen_scale, damage, a per ammo type speed and the shell rows a numeric range moves are written by lib/gohgun.js (the
  // like's "penetration_*" rows scaled per shell, "armor health" damage) [I][T]; the rest below as before
  const gp = ctx.goh ? require('./gohgun').gohPen(ctx, spec, where) : null;
  if (gp && gp.bad) return;
  if (gp) spec = gp.spec;
  const base = gunFacts(ctx, like);
  if (!base.found) { ctx.err('GEN_GUN_LIKE_MISSING', `no gun "${like}" (${GUNDIR}${like}) in the mod or the game data`, where); return; }
  if (ctx.exists(GUNDIR + name)) { ctx.err('GEN_GUN_EXISTS', `a gun named "${name}" already exists (${GUNDIR}${name}); the first one found wins, pick another name`, where); return; }
  const num = (v, what, lo, hi) => { const n = Number(v); if (!isFinite(n) || n < lo || n > hi) { ctx.err('GEN_GUN_VALUE', `${what} "${S(v)}": a number ${lo}..${hi}`, where); return null; } return Math.round(n * 100) / 100; };
  const L = [], said = []; let bad = false;
  const presets = presetNames(ctx), gohMac = n => ctx.goh && presets.includes(n);
  if (spec.recharge !== undefined) { const n = num(spec.recharge, 'recharge (seconds between shots)', 0.05, 120); if (n === null) bad = true; else { L.push(gohMac('reload time') ? `("reload time" seconds(${n}))` : `{rechargeTime ${n}}`); said.push(`reload ${base.recharge === undefined ? '?' : base.recharge} -> ${n} s`); } }
  if (spec.speed !== undefined) { const n = num(spec.speed, 'speed (muzzle velocity, m/s)', 50, 2000); if (n === null) bad = true; else {
    // GoH like with a speed per ammo type: the same macro with every type set, else its {parameters "<type>"} speed would win [T]
    if (base.speedAmmo && gohMac('velocity m/s')) { L.push(`("velocity m/s" ap(${n}) apcr(${n}) he(${n}) heat(${n}))`); ctx.test.push(`gun ${name}: GoH, fire each ammo type of ${like} at a target: the shell speed is ${n} m/s for all; a {parameters "<type>"} ("global velocity") block of ${like} still sets its own type [T].`); }
    else L.push(gohMac('velocity') ? `("velocity" mps(${n}))` : `("speed" s(${n}))`);
    said.push(`shell speed ${base.speed === undefined ? '?' : base.speed} -> ${n}`); } }
  let pen = null;
  if (spec.pen !== undefined) {
    pen = (Array.isArray(spec.pen) ? spec.pen : S(spec.pen).trim().split(/[\s,]+/)).map(Number);
    if (pen.length !== 5 || pen.some(x => !isFinite(x) || x < 0 || x > 600)) { ctx.err('GEN_GUN_VALUE', `pen "${S(spec.pen)}": 5 numbers, penetration in mm at 100 500 1000 1500 2000 m`, where); bad = true; pen = null; }
  } else if (spec.pen_scale !== undefined) {
    const k = num(spec.pen_scale, 'pen_scale', ...require('./gohgun').PEN_SCALE);
    if (k === null) bad = true;
    else if (!base.pen) { ctx.err('GEN_GUN_NO_PEN', `"${like}" has no ("damage" a() b() c() d() e()) table to scale; give pen as 5 numbers`, where); bad = true; }
    else pen = base.pen.map(x => Math.round(x * k));
  }
  if (pen) {
    const mac = base.penMacro || 'damage';
    L.push(`("${mac}" a(${pen[0]}) b(${pen[1]}) c(${pen[2]}) d(${pen[3]}) e(${pen[4]}))`);
    said.push(`penetration ${base.pen ? base.pen.join('/') : '?'} -> ${pen.join('/')} mm`);
    // the base's special-shell table follows by the same ratio, else the stronger shell would end up weaker than the plain one
    if (base.apcr && base.pen && base.pen[0] > 0) { const k = pen[0] / base.pen[0], ap = base.apcr.map(x => Math.round(x * k)); L.push('{parameters "apcr"', `\t("${mac}" a(${ap[0]}) b(${ap[1]}) c(${ap[2]}) d(${ap[3]}) e(${ap[4]}))`, '}'); }
    if (spec.damage === undefined) L.push(`{projectileDamage ${pen[0]}}`);
  }
  if (spec.damage !== undefined) { const n = num(spec.damage, 'damage (projectileDamage)', 1, 2000); if (n === null) bad = true; else { L.push(`{projectileDamage ${n}}`); said.push(`damage ${base.damage === undefined ? '?' : base.damage} -> ${n}`); } }
  let rangeN = null;
  for (const [field, pre] of [['range', 'range_'], ['accuracy', 'accuracy_'], ['caliber', 'caliber_']]) {
    const v = field === 'range' ? spec.range : field === 'accuracy' ? spec.accuracy : spec.caliber;
    if (v === undefined) continue;
    const mac = pre + lower(S(v)).replace(new RegExp('^' + pre), '');
    if (!presets.includes(mac)) { ctx.err('GEN_GUN_VALUE', `${field} "${S(v)}": one of ${presets.filter(p => p.startsWith(pre)).map(p => p.slice(pre.length)).join(' ')}`, where); bad = true; continue; }
    if (field === 'range') { const rn = /^range_(\d+)/.exec(mac); if (rn) rangeN = rn[1]; }
    // GoH [I]: a define with %params takes them in the call (accuracy_* = r1 range_ap range_he range_heat, accuracy_indirect + r2 rmax);
    // bare it leaves %r1 in the text and the build gate fails (sdllint ARITH_BAD). The values are copied from the like's own accuracy call,
    // range_ap/he/heat shifted with the new range_<n> when one is given (below); a param the like does not give stops the op
    let args = '';
    const need = ctx.goh ? presetParams(ctx, mac) : [];
    if (need.length) {
      const have = new Map(base.accArgs || []);
      // range given: each of the like's range_ap/he/heat moves by (new n - like's n), so its per-type offsets stay (vanilla 37mm_pak35:
      // range_160 with heat 110 -> range_200 gives ap 200 he 200 heat 150 [V GoH data]); a value or like range that is not a number
      // gets the flat new n, named in a [T] test line
      if (rangeN) {
        const likeN = /^(\d+)/.exec(base.range || ''), flat = [];
        for (const k of ['range_ap', 'range_he', 'range_heat']) if (need.includes(k)) {
          const old = have.get(k), x = Number(old);
          if (likeN && old !== undefined && /^\s*\d+(\.\d+)?\s*$/.test(String(old))) have.set(k, String(Math.max(1, Math.round(x + (+rangeN - +likeN[1])))));
          else { have.set(k, rangeN); if (old !== undefined && String(old) !== rangeN) flat.push(k + ' ' + old); }
        }
        if (flat.length) ctx.test.push(`gun ${name}: GoH, ${flat.join(', ')} of ${like} set flat to ${rangeN} (no numeric range to shift from): check the accuracy of each ammo type at range [T].`);
      }
      const miss = need.filter(k => !have.has(k));
      if (miss.length) { ctx.err('GEN_GUN_GOH_ARGS', `${field} "${S(v)}" on GoH: ("${mac}") takes ${need.map(k => k + '()').join(' ')} (${GUNDIR}.presets); ${like} gives no ${miss.join(' ')} to copy (its accuracy: ${base.accuracy || 'none'}): pick the accuracy of the like, or a like that calls ${mac} with its values`, where); bad = true; continue; }
      args = need.map(k => ` ${k}(${have.get(k)})`).join('');
    }
    L.push(`("${mac}"${args})`); said.push(`${field} ${base[field] || '?'} -> ${mac.slice(pre.length)}`);
  }
  if (ctx.goh && rangeN && spec.accuracy === undefined && (base.accArgs || []).some(([k, x]) => /^range_(ap|he|heat)$/.test(k) && x !== rangeN))
    ctx.test.push(`gun ${name}: GoH, range set to ${rangeN} but the accuracy curve of ${like} keeps its own range_ap/he/heat (${base.accArgs.filter(([k]) => /^range_/.test(k)).map(([k, x]) => k + ' ' + x).join(', ')}); give accuracy: ${base.accuracy} to set them too [T].`);
  if (gp) { L.push(...gp.L); said.push(...gp.said); }
  if (bad) return;
  const eol = '\r\n';
  ctx.write(GUNDIR + name, `{from "${base.chain[0]}"\t; gen: new gun, values not listed here come from ${base.chain[0]}` + eol + L.map(l => '\t' + l).join(eol) + (L.length ? eol : '') + '}' + eol);
  ctx.virt.add('stuff:' + name); ctx.names.add(name);
  if (spec.display) ctx.texts.push({ key: 'desc/weapon/' + name, text: S(spec.display), file: '' });
  ctx.facts.push(`gun: ${name} (from ${base.chain[0]}${base.filling ? ', shells ' + base.filling : ''})${said.length ? ': ' + said.join(', ') : ': same values, own file'}`);
  ctx.test.push(`gun: ${name}: mount it on a unit (weapon op), fire at a parked tank at 100 m and 1000 m; reload time and penetration should match ${said.join(', ') || 'the base gun'}. The macros come from ${GUNDIR}.presets of the same folder [I].`);
}
// weapon: put a gun on a vehicle's weapon place; shells in the def follow the new gun's shell family
function opWeapon(ctx, spec) {
  const ent = S(spec.entity), gun = lower(S(spec.weapon)).trim(), place = lower(S(spec.place || 'gun')), where = 'weapon ' + ent;
  // GoH [I]: the def mount is the same {Weaponry {place "gun" {weapon "<gun>" filling "<ammo>" n}}} (vanilla GoH vehicle defs [V data]);
  // GoH shell names (bullet_<cal>.<nation>.<type>.ammo) do not follow the AS2 <family>.<type>.ammo rule the shell swap uses, so on GoH the
  // ammo lines are left as they are (info GEN_WEAPON_GOH_AMMO_KEPT, [T])
  if (!ent || !gun) { ctx.err('GEN_WEAPON_ARGS', 'weapon needs entity (def name) and weapon (gun name)', where); return; }
  // a soldier carries its weapons in its inventory (a breed, set/breed/..), not on a {place} mount: that is the kit op
  const kitHint = `a soldier's weapons are inventory lines of its breed: use the kit op (op: kit, breed: <army>/<breed>, add: [{item: "${gun}", filled: true, in_hands: true}])`;
  if (!ent.includes('/') && !ctx.keys(new RegExp('^resource/entity/.*/' + esc(lower(ent)) + '\\.def$')).length && !ctx.virt.has('entity:' + lower(ent))
    && ctx.keys(new RegExp('^resource/set/breed/(.*/)?' + esc(lower(ent)) + '(\\.\\w+)?$')).length) { ctx.err('GEN_WEAPON_USE_KIT', `"${ent}" is a breed (soldier), not a def with a weapon mount: ${kitHint}`, where); return; }
  const f = resolveFile(ctx, ent, where);
  if (!f) return;
  if (!f.key) { ctx.info('GEN_WEAPON_PLAN_VIRTUAL', `${ent} is created in this spec: the weapon change is not shown in --plan`, where); return; }
  let nf = gunFacts(ctx, gun), other = null;
  if (!nf.found) {
    // a weapon outside gun/ (mgun/ flame/ reactive/ bombing/ rifle/ smg/ pistol/ bazooka/): the engine finds stuff by its file-name tags in any folder
    const A = require('./ops-asset'), w = gun.split(/[\s.]+/).filter(Boolean);
    const r = A.findStuff(A.stuffIndex(ctx), w, ['mgun/', 'flame/', 'reactive/', 'bombing/', 'rifle/', 'smg/', 'pistol/', 'bazooka/']);
    other = r.pick || null;
    if (!other && r.hits.length > 1) { ctx.err('GEN_WEAPON_AMBIGUOUS', `"${gun}" names ${r.hits.length} weapon files (${r.hits.slice(0, 4).map(h => h.dir + h.base).join(' ')}): give more of its file-name words`, where); return; }
    if (!other && !ctx.virt.has('stuff:' + gun)) { ctx.err('GEN_WEAPON_MISSING', `no weapon "${gun}" in ${GUNDIR} or the other weapon folders (mgun flame reactive bombing rifle smg pistol bazooka); make it with a gun op first or name a game weapon`, where); return; }
    nf = { found: true, chain: [], filling: null };
  }
  let text = ctx.readStr(f.key);
  const pm = new RegExp('\\{\\s*place\\s+"' + esc(place) + '"', 'i').exec(text);
  const pe = pm ? sdlEnd(text, pm.index) : -1;
  const human = /^resource\/entity\/(humanskin|human)\//i.test(f.key) || /\{\s*(skin|humanskin)\b/i.test(text);
  if ((!pm || pe < 0) && human) { ctx.err('GEN_WEAPON_USE_KIT', `${f.key} is a soldier model with no weapon mount: ${kitHint}`, where); return; }
  if (!pm || pe < 0) { ctx.err('GEN_WEAPON_NO_PLACE', `${f.key}: no {place "${place}"} in its Weaponry block (places: ${[...text.matchAll(/\{\s*place\s+"([^"]+)"/gi)].map(m => m[1]).join(' ') || 'none'})`, where); return; }
  let blk = text.slice(pm.index, pe + 1);
  const wm = /(\{\s*weapon\s+")([^"]+)(")/i.exec(blk);
  if (!wm) { ctx.err('GEN_WEAPON_NO_WEAPON', `${f.key}: place "${place}" holds no {weapon "..."} line`, where); return; }
  const old = lower(wm[2]), of = gunFacts(ctx, old);
  blk = blk.replace(wm[0], wm[1] + gun + wm[3]);
  text = text.slice(0, pm.index) + blk + text.slice(pe + 1);
  // shells: "ammo <family> <type>" in the weapon line and the inventory box; a type the new family lacks is dropped
  let swapped = 0; const dropped = [];
  if (ctx.goh) ctx.info('GEN_WEAPON_GOH_AMMO_KEPT', `${ent}: GoH ammo lines (filling and inventory) left as they are; check ${gun} fires what the unit carries [T]`, where);
  else if (of.filling && nf.filling && of.filling !== nf.filling) {
    const re = new RegExp('^([^\\n;]*"(?:ammo\\s+)?)' + esc(of.filling) + '((?:\\s+(\\w+))?"[^\\n]*)$', 'gim');
    text = text.replace(re, (m, a, b, type) => {
      if (type && !ctx.exists(SHELLDIR + nf.filling + '.' + lower(type) + '.ammo')) {
        if (/\{\s*item\s+"/i.test(a)) { dropped.push(type); return ';' + m.replace(/^\s+/, '\t') + '\t; gen: no ' + nf.filling + ' ' + type + ' shell in the game'; }
        const alt = ['ap', 'fg'].find(t => ctx.exists(SHELLDIR + nf.filling + '.' + t + '.ammo'));
        if (alt) { swapped++; return a + nf.filling + b.replace(new RegExp('^\\s+' + esc(type)), ' ' + alt); }
      }
      swapped++; return a + nf.filling + b;
    });
  }
  const wasMine = ctx.inMod(f.key);
  ctx.write(f.key, text);
  if (!wasMine) ctx.info('GEN_WEAPON_FULL_COPY', `${f.key}: whole-file override of the base def (VFS-01/41)`, where);
  if (dropped.length) ctx.info('GEN_WEAPON_SHELL_DROPPED', `${ent}: shell type(s) ${[...new Set(dropped)].join(' ')} do not exist for ${nf.filling}; those inventory lines were commented out`, where);
  if (other) ctx.info('GEN_WEAPON_OUTSIDE_GUN', `${gun} is ${STUFF_OF(other)} (not a gun/ cannon): mounted on place "${place}"; ammo lines of the unit are not changed, check it carries what ${gun} fires [T]`, where);
  ctx.facts.push(`weapon: ${ent} place ${place}: ${old} -> ${gun}${swapped ? ` (shells ${of.filling} -> ${nf.filling}, ${swapped} line(s))` : ''}`);
  ctx.test.push(`weapon: ${ent}: spawn it, check the gun name in the unit panel, fire every shell type, watch the reload. The barrel model stays the vehicle's own (only the data changed).`);
}
// kitbash: the turret (bone subtree, meshes, hit volumes) of another vehicle on this unit's hull. The unit must own its model files
// (clone with copy_assets). Text-level edit of the .mdl; meshes copied as kb_<name>. Fit, recoil animation and crew seats are [T].
function opKitbash(ctx, spec) {
  const ent = S(spec.entity), donor = S(spec.turret_from), part = lower(S(spec.part || 'turret')), where = 'kitbash ' + ent;
  if (ctx.goh) { ctx.notFor('GEN_KITBASH_AS2_ONLY', 'kitbash', 'it edits model files (.mdl bones, meshes, volumes); model editing is for Assault Squad 2 and the 64-bit build only', 'owner decision 2026-11-10', where); return; }
  if (!ent || !donor) { ctx.err('GEN_KITBASH_ARGS', 'kitbash needs entity (the new unit) and turret_from (vehicle whose turret is used)', where); return; }
  const hf = resolveFile(ctx, ent, where);
  if (!hf) return;
  if (!hf.key) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${ent} is created in this spec: the turret swap is not simulated in --plan`, where); return; }
  const df = resolveFile(ctx, donor, where);
  if (!df || !df.key) return;
  const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
  const mdlOf = key => {
    const m = /\{\s*extension\s+"([^"]+)"/i.exec(ctx.readStr(key) || ''); if (!m) return null;
    const v = lower(m[1]);
    const cands = /^[\/\\]/.test(m[1]) ? ['resource' + v, 'resource/entity' + v] : [path.posix.normalize(dirOf(key) + v), 'resource/entity/' + v];
    return cands.find(k => ctx.read(k)) || null;
  };
  const hm = mdlOf(hf.key), dm = mdlOf(df.key);
  if (!hm || !dm) { ctx.err('GEN_KITBASH_NO_MODEL', `${!hm ? ent : donor}: its def names no model file that can be read ({Extension "x.mdl"})`, where); return; }
  if (!ctx.inMod(hm)) { ctx.err('GEN_KITBASH_NEEDS_COPY', `${ent} uses the game's own model ${hm}; clone it with copy_assets: true first so the turret swap edits a copy`, where); return; }
  let H = ctx.readStr(hm); const D = ctx.readStr(dm), hdir = dirOf(hm), ddir = dirOf(dm);
  const boneRe = n => new RegExp('\\{\\s*bone\\s+(?:\\w+\\s+)?"' + esc(n) + '"', 'i');
  const hi = H.search(boneRe(part)), di = D.search(boneRe(part));
  const he = hi < 0 ? -1 : sdlEnd(H, hi), de = di < 0 ? -1 : sdlEnd(D, di);
  if (he < 0 || de < 0) { ctx.err('GEN_KITBASH_NO_TURRET', `${he < 0 ? ent : donor}: its model has no bone "${part}" (a turretless vehicle cannot give or take a turret)`, where); return; }
  const hBlk = H.slice(hi, he + 1); let dBlk = D.slice(di, de + 1);
  const bones = t => [...t.matchAll(/\{\s*bone\s+(?:\w+\s+)?"([^"]+)"/gi)].map(m => lower(m[1]));
  const hB = new Set(bones(hBlk)), dB = new Set(bones(dBlk));
  // the bone's own placement lines (depth 1): Position / Matrix34 / Orientation
  const placement = blk => { const out = []; let d = 0; for (let j = 0; j < blk.length; j++) { const c = blk[j]; if (c === '"') { j = blk.indexOf('"', j + 1); continue; } if (c === '{') { d++; if (d === 2) { const m = /^\{\s*(position|matrix34|orientation)\b/i.exec(blk.slice(j, j + 24)); const e = sdlEnd(blk, j); if (m && e > 0) out.push([j, e]); if (e > 0) { j = e; d--; } } } else if (c === '}') d--; } return out; };
  const hp = placement(hBlk).map(([a, b]) => hBlk.slice(a, b + 1)), dp = placement(dBlk);
  for (const [a, b] of dp.slice().reverse()) dBlk = dBlk.slice(0, a) + dBlk.slice(b + 1);
  // files named inside the donor turret: copied beside the host model as kb_<name>, references rewritten
  const used = new Map();
  const take = (name) => {
    const n = lower(name).replace(/\\/g, '/');
    if (n.includes('/')) return name;
    if (!used.has(n)) used.set(n, 'kb_' + n);
    return used.get(n);
  };
  dBlk = dBlk.replace(/(\{\s*(?:VolumeView|LODView|file)\s+")([^"]+)(")/gi, (m, a, v, c) => a + take(v) + c);
  // host-only bones under the old turret (seats, sights, fx points the def may name): kept as empty bones so references still resolve
  const lost = [...hB].filter(b => !dB.has(b));
  const stubs = lost.map(b => { const i = hBlk.search(boneRe(b)), e = i < 0 ? -1 : sdlEnd(hBlk, i); const pl = e < 0 ? [] : placement(hBlk.slice(i, e + 1)).map(([x, y]) => hBlk.slice(i, e + 1).slice(x, y + 1).replace(/\s+/g, ' ')); return `\t{bone "${b}" ${pl.join(' ')}}\t; gen kitbash: kept from the old turret, no mesh`; });
  const eol = H.includes('\r\n') ? '\r\n' : '\n';
  const open = dBlk.indexOf('\n') > 0 ? dBlk.indexOf('\n') + 1 : dBlk.indexOf('"', dBlk.indexOf('"') + 1) + 1;
  dBlk = dBlk.slice(0, open) + hp.map(p => '\t' + p.replace(/\r?\n/g, eol) + eol).join('') + dBlk.slice(open, dBlk.lastIndexOf('}')) + stubs.map(s => s + eol).join('') + '}';
  // a donor turret bone whose name the hull also uses (cover3, mgun ..): the hull keeps the name (its def and animations use it), the donor's becomes kb_<name>
  const outside = new Set(bones(H.slice(0, hi) + H.slice(he + 1))), clash = [...dB].filter(b => b !== part && outside.has(b));
  const reBone = b => new RegExp('(\\{\\s*bone\\s+(?:\\w+\\s+)?")' + esc(b) + '(")', 'gi');
  for (const b of clash) dBlk = dBlk.replace(reBone(b), (m, a, c) => a + 'kb_' + b + c);
  H = H.slice(0, hi) + dBlk + H.slice(he + 1);
  // hit volumes: host ones bound to the old turret's bones go, donor ones bound to its turret's bones come
  const vols = t => { const out = []; const re = /\{\s*volume\s+"([^"]+)"/gi; let m; while ((m = re.exec(t))) { const e = sdlEnd(t, m.index); if (e < 0) break; const b = t.slice(m.index, e + 1), bn = /\{\s*bone\s+"([^"]+)"/i.exec(b); out.push({ name: lower(m[1]), a: m.index, e, text: b, bone: bn ? lower(bn[1]) : '' }); re.lastIndex = e; } return out; };
  const hv = vols(H).filter(v => hB.has(v.bone)), dv = vols(D).filter(v => dB.has(v.bone));
  for (const v of hv.slice().reverse()) H = H.slice(0, v.a) + H.slice(v.e + 1).replace(/^[ \t]*\r?\n/, '');
  const keepNames = new Set(vols(H).map(v => v.name));
  let added = 0;
  for (const v of dv) {
    if (keepNames.has(v.name)) { ctx.info('GEN_KITBASH_VOLUME_KEPT', `${ent}: hit volume "${v.name}" of ${donor}'s turret skipped, the hull already has one with that name`, where); continue; }
    H = H.replace(/\s*$/, '') + eol + (clash.includes(v.bone) ? v.text.replace(reBone(v.bone), (m, a, c) => a + 'kb_' + v.bone + c) : v.text).replace(/(\{\s*polyhedron\s+")([^"]+)(")/i, (m, a, x, c) => a + take(x) + c).replace(/\r?\n/g, eol) + eol; added++;
  }
  // copy the named files; a mesh names its material inside the binary and finds it beside itself (FMT-03)
  const { meshRefs } = require('../../binhdr/ply');
  const same = (a, b) => a && b && Buffer.compare(a, b) === 0;
  let nfiles = 0, missing = 0;
  const put = (key, buf) => { ctx.write(key, buf); nfiles++; };
  const texCopy = (name, mtlText) => {
    const n = lower(name).replace(/\\/g, '/');
    if (n.startsWith('/') || n.startsWith('.') || n.startsWith('$')) return mtlText;
    const stem = n.replace(/\.(dds|ebm|tga)$/i, '');
    const files = ctx.keys(new RegExp('^' + esc(ddir + stem) + '(#[^/]*)?\\.(dds|ebm|tga)$'));
    let rename = false;
    for (const k of files) { const hk = hdir + k.slice(ddir.length), cur = ctx.read(hk); if (cur && !same(cur, ctx.read(k))) rename = true; }
    for (const k of files) { const rel = k.slice(ddir.length), hk = hdir + (rename ? 'kb_' + rel : rel); if (!ctx.read(hk)) put(hk, ctx.read(k)); }
    return rename && mtlText !== null ? mtlText.split('"' + name + '"').join('"kb_' + name + '"') : mtlText;
  };
  for (const [src, dst] of used) {
    let buf = ctx.read(ddir + src);
    if (!buf) { missing++; ctx.err('WARN_GEN_KITBASH_FILE_MISSING', `${donor}: its turret names ${src}, not found in ${ddir}`, where); continue; }
    if (/\.ply$/.test(src)) {
      let refs = { mtls: [], tex: [] }; try { refs = meshRefs(buf); } catch (e) { ctx.err('WARN_GEN_KITBASH_MESH_UNREAD', `${src}: mesh header not read (${e.message}); its material was not copied`, where); }
      for (const t of refs.tex || []) texCopy(t, null);
      for (const m of refs.mtls || []) {
        const n = lower(m).replace(/\\/g, '/');
        if (n.startsWith('/') || n.startsWith('..') || !n.endsWith('.mtl')) continue;
        let body = ctx.read(ddir + n);
        if (!body) { ctx.err('WARN_GEN_KITBASH_MTL_MISSING', `${src} names material "${m}", not found beside ${donor}'s model: the turret may load untextured or crash on load (FMT-03) [T]`, where); continue; }
        let text = body.toString('latin1');
        for (const q of text.matchAll(/\{\s*(?:diffuse|bump|specular|detail|lightmap|envmap|mask)\s+"([^"]+)"/gi)) text = texCopy(q[1], text);
        body = Buffer.from(text, 'latin1');
        const cur = ctx.read(hdir + n);
        if (!cur) { put(hdir + n, body); continue; }
        if (same(cur, body)) continue;
        // same material name, other content: the mesh gets a same-length new name (binary stays valid), the material is written under it
        let nn = 'kb' + n.slice(2); for (let i = 0; ctx.read(hdir + nn) && !same(ctx.read(hdir + nn), body) && i < 10; i++) nn = 'k' + i + n.slice(2);
        if (nn.length !== n.length) continue;
        const sbuf = buf.toString('latin1'), at = lower(sbuf).indexOf(n);
        if (at < 0) { ctx.err('WARN_GEN_KITBASH_MTL_CLASH', `${src}: material "${m}" clashes with the hull's file of that name and could not be renamed; the turret will wear the hull's material`, where); continue; }
        buf = Buffer.from(sbuf.split(sbuf.substr(at, n.length)).join(nn), 'latin1');
        if (!ctx.read(hdir + nn)) put(hdir + nn, body);
      }
    }
    put(hdir + dst, buf);
  }
  ctx.write(hm, H);
  if (clash.length) ctx.info('GEN_KITBASH_BONES_RENAMED', `${ent}: ${clash.length} part(s) of ${donor}'s turret share a name with a hull part and were renamed kb_<name>: ${clash.join(' ')} (a weapon the def mounts on that name stays on the hull's part)`, where);
  if (lost.length) ctx.info('GEN_KITBASH_BONES_KEPT', `${ent}: ${lost.length} bone(s) of the old turret are not in ${donor}'s turret and were kept without a mesh: ${lost.slice(0, 14).join(' ')}${lost.length > 14 ? ' ..' : ''}`, where);
  ctx.err('WARN_GEN_KITBASH_UNTESTED', `${ent}: turret of ${donor} placed on the hull at the old turret's spot. Ring size, gun recoil animation and crew positions are not checked: look at it in the editor [T]`, where);
  ctx.facts.push(`kitbash: ${ent} turret <- ${donor} (${used.size} file(s) named, ${nfiles} written, ${hv.length} hull turret volume(s) out, ${added} in${missing ? ', ' + missing + ' missing' : ''})`);
  ctx.test.push(`kitbash: ${ent}: open it in the editor: turret sits on the ring, turns, gun elevates and recoils, textures right, crew can board. Shoot the turret: it takes hits (volumes from ${donor}).`);
}

module.exports = { opMod, opClone, opText, opSet, opArmor, opRoster, opCard, opSquad, opBreed, opMapClone, opMissionClone, opPlace, opGun, opWeapon, opKitbash, autoWrecks, gunFacts, gunChain, csvRows, slug, list, S, GOH_FIELDS, SET_OPS, FACTION, SQUAD_NAME, MAPNAME, MAPKEY };
// ops-unit.js (iblock macro preset army kit + card list / breed del / squad block): helpers it shares, then its ops on this module
module.exports.H = { resolveFile, splitLines, depthDelta, blockEnd, setField, applyFields, unitFiles, findCard, checkLoaded, breedKey, findDecl, autoText, botsAdvice, sdlEnd, BOTKEY };
Object.assign(module.exports, require('./ops-unit'));
// ops-asset.js (gun of any class, shell item sound soundclass voice skin stuffmodel mapinfo): its ops on this module
Object.assign(module.exports, require('./ops-asset').ops);
