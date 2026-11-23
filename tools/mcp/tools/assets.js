// mcp tools, group `assets`: models and their parts (meshes, volumes, animations), textures and materials, effects, sound, icons.
// Contract: tools/mcp/README.md. Every tool takes game = as64 | mowas2 | goh and wraps the CLI tool or library that already does the
// job (named in each tool's `wraps`); nothing is decided here that a tool of the kit does not decide.
//   - read tools only read; a child tool gets its arguments as an argv array through ctx.run.
//   - library answers (model scene, animation headers, texture header, name usages) come from the child assets/probe.js, so the
//     server thread never mounts a game.
//   - the one write tool (mow_model_stage) answers the child's own dry run unless write: true; then the target goes through ctx.guard.write.
//   - a game a tool cannot serve answers { na: 'why' }; rule statements carry the limits row id the wrapped tool names.
//   - answers: a few plain lines + compact data; long lists are cut with a count and how to ask for more (limit, offset, q).
// Author: Imperator_Aug (ARSENAL, ia-61ed37bb)
'use strict';
const fs = require('fs'), path = require('path');
const U = require('./mod/util');

const GAMES = ['as64', 'mowas2', 'goh'];
const P = {
  game: { type: 'string', enum: GAMES, description: 'as64 (default), mowas2 or goh' },
  mod: { type: 'string', description: 'Full path of the mod folder' },
  modOpt: { type: 'string', description: 'Full path of a mod folder laid over the game; left out = the game alone' },
  mods: { type: 'array', items: { type: 'string' }, description: 'Mod folder names in <game>/mods, in load order' },
  write: { type: 'boolean', description: 'true = change files; left out = preview only' },
  limit: { type: 'integer', description: 'Most rows to answer' },
  offset: { type: 'integer', description: 'Rows to skip (the next page)' },
  model: { type: 'string', description: 'Entity name (pz6e), a game path of a .mdl or .def (entity/-vehicle/.../x.mdl), a full disk path of a .mdl, or breed:<key> for a soldier' },
};
const schema = (properties, required) => ({ type: 'object', properties: Object.assign({ game: P.game }, properties), required: required || [] });
const lines = a => a.filter(x => x != null && x !== '').join('\n');
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s == null ? '' : s).toLowerCase();
const gameWord = g => (g.id === 'as64' ? 'AS64' : g.id === 'mowas2' ? 'MoW:AS2' : 'Gates of Hell');
const failed = (ctx, r, what) => (r.isError ? ctx.bad(what + (r.timedOut ? ' took too long and was stopped' : ' could not be run') + ': ' + U.tail(r.text, 3).join(' ')) : null);
const usage = (ctx, r, what) => (r.code === 2 ? ctx.bad(what + ': ' + U.tail(r.stderr || r.stdout, 3).join(' ')) : null);
const run = (ctx, tool, argv, opt) => ctx.run(tool, argv, Object.assign({ env: U.childEnv(), cwd: U.tmpDir() }, opt));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d; };
const page = (args, d, hi) => ({ limit: num(args.limit, d, 1, hi || 200), offset: num(args.offset, 0, 0, 1e6) });
const more = (total, pg, shown) => (total > pg.offset + shown ? '... ' + (total - pg.offset - shown) + ' more: pass offset: ' + (pg.offset + shown) + ' (or a larger limit)' : null);
const modsArgv = (ctx, args) => { const m = U.names(ctx, args.mods, 'mods'); return m.length ? ['--mods', m.join(',')] : []; };
const modDir = (ctx, args) => (args.mod == null || args.mod === '' ? null : U.dirArg(ctx, args.mod, 'mod'));
const byCount = a => { const m = {}; for (const x of a) m[x] = (m[x] || 0) + 1; return Object.entries(m).sort((x, y) => y[1] - x[1]).map(([k, n]) => n + ' ' + k).join(', '); };

// the library child: one JSON answer, { error } included
async function probe(ctx, cmd, o, timeout) {
  const r = await run(ctx, 'mcp', [cmd, JSON.stringify(o)], { script: 'tools/assets/probe.js', timeout: timeout || 5 * 60 * 1000, max: 4 << 20 });
  if (r.isError) return { fail: ctx.bad('the ' + cmd + ' reader ' + (r.timedOut ? 'took too long and was stopped' : 'could not be run') + ': ' + U.tail(r.stderr, 2).join(' ')) };
  let j = null; try { j = JSON.parse(r.stdout); } catch (e) { j = null; }
  if (!j) return { fail: ctx.bad('the ' + cmd + ' reader gave no answer: ' + U.tail(r.text, 2).join(' ')) };
  return { j };
}
const viewOf = (ctx, g, args) => ({ game: U.need(ctx, g), exe: g.exe, mods: U.names(ctx, args.mods, 'mods'), modDir: modDir(ctx, args) || undefined });
// a lint report of a child tool -> lines
function reportLines(t, name, r, n) {
  const rep = U.reportOf(r.stdout), sum = rep ? U.sumReport(rep, n) : null;
  if (!sum) { t.push(name + ': ' + (U.tail(r.text, 2).join(' ') || 'no answer')); return null; }
  t.push(name + ': ' + (sum.total ? sum.total + ' finding(s)' + (Object.keys(sum.counts).length ? ' (' + Object.entries(sum.counts).map(([k, v]) => v + ' ' + k).join(', ') + ')' : '') : 'no findings'));
  for (const f of sum.findings) t.push('- ' + f.code + ' ' + f.file + (f.line ? ':' + f.line : '') + ': ' + f.msg);
  if (sum.more) t.push('... ' + sum.more + ' more: pass a larger limit');
  return sum;
}

// ---------- models ----------
async function modelFind(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g);
  ctx.name(args.q, 'q');
  const words = args.q.trim().split(/\s+/).filter(Boolean);
  for (const w of words) ctx.name(w, 'q');
  const kind = lc(args.kind || 'all'), n = num(args.limit, 20, 1, 100);
  if (!['all', 'vehicle', 'human', 'object', 'breed', 'model'].includes(kind)) return ctx.bad('kind: use all, vehicle, human, object, breed or model');
  const tmp = U.tmpFile('mfind');
  const argv = ['find', ...words, '--game', dir, ...U.exe(g), '--kind', kind, '--limit', String(n), '--json', tmp, ...modsArgv(ctx, args)];
  const md = modDir(ctx, args); if (md) argv.push('--mod', md);
  const r = await run(ctx, 'soedit', argv);
  const bad = failed(ctx, r, 'soedit find') || usage(ctx, r, 'soedit find'); if (bad) { U.readJson(tmp); return bad; }
  const j = U.readJson(tmp);
  if (!j || !Array.isArray(j.results)) return ctx.bad('the model search gave no answer: ' + U.tail(r.text, 3).join(' '));
  const rows = j.results.map(x => ({ name: x.name, kind: x.kind, title: x.title || '', where: x.where + (x.pak ? ' ' + x.pak : ''), target: x.target, model: x.model || null }));
  return { text: lines([(j.total || rows.length) + ' model(s) match "' + args.q + '" in ' + gameWord(g) + (md ? ' + ' + path.basename(md) : '') + (j.total > rows.length ? ', first ' + rows.length + ' shown (pass a larger limit, a kind or more words)' : '') + '.',
    ...rows.map(x => '- ' + x.name + ' [' + x.kind + ']' + (x.title ? ' "' + x.title + '"' : '') + '  ' + x.where + '  ' + (x.model || x.target)),
    rows.length ? 'Next: mow_model_info with model: "<name>".' : 'Nothing found: try fewer or other words, or kind: "all".']),
    data: { game: g.id, total: j.total || rows.length, rows } };
}

async function modelInfo(args, ctx) {
  const g = ctx.game(args);
  ctx.name(args.model, 'model');
  const o = Object.assign({ target: args.model.trim() }, viewOf(ctx, g, args));
  const pr = await probe(ctx, 'model', o); if (pr.fail) return pr.fail;
  const j = pr.j;
  if (j.error && !j.key) return ctx.bad(j.error + ' Use mow_model_find to search by words.');
  const show = new Set(Array.isArray(args.show) ? args.show.map(lc) : []), pg = page(args, 30, 300);
  const badShow = [...show].find(w => !['bones', 'meshes', 'volumes', 'files', 'textures'].includes(w)); if (badShow) return ctx.bad('show: use bones, meshes, volumes, files, textures (got ' + String(badShow).slice(0, 30) + ')');
  const kinds = {}; for (const f of j.files) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  const fromMod = j.files.filter(f => !/^(base|patch \d+|as64\/core)$/.test(f.layer));
  const faces = j.meshes.reduce((n, m) => n + m.faces, 0);
  const t = [j.key + (j.entity ? '  (entity ' + j.entity + ')' : ''),
    'Skeleton: ' + j.bones.length + ' bones. Meshes: ' + j.meshes.length + ' (' + faces + ' faces' + (j.meshes.some(m => m.skinned) ? ', skinned' : '') + '; ' + byCount(j.meshes.map(m => m.kind)) + '). Volumes: ' + j.volumes.length + (j.volumes.length ? ' (' + byCount(j.volumes.map(v => v.kind)) + ')' : '') + '. Obstacles ' + j.obstacles + ', areas ' + j.areas + '. Sequences: ' + j.sequences.length + '.',
    j.bounds ? 'Size box (engine units, 20 per metre): ' + j.bounds.min.join(' ') + ' .. ' + j.bounds.max.join(' ') : null,
    'Pulls in ' + j.files.length + ' file(s): ' + Object.entries(kinds).map(([k, v]) => v + ' ' + k).join(', ') + (fromMod.length ? '; ' + fromMod.length + ' come from a mod layer' : '; all from the game') + '.',
    j.unresolved.length ? j.unresolved.length + ' name(s) the model asks for that are found nowhere:' : 'Every file the model names was found.',
    ...j.unresolved.slice(0, 15).map(u => '- missing ' + u.kind + ' "' + u.name + '" asked by ' + path.posix.basename(u.from || '')),
    j.unresolved.length > 15 ? '... ' + (j.unresolved.length - 15) + ' more in data.unresolved' : null,
    ...(j.problems || []).slice(0, 5).map(p => '- problem: ' + (typeof p === 'string' ? p : JSON.stringify(p)).slice(0, 200))];
  const sect = (name, arr, f) => { if (!show.has(name)) return; const rows = arr.slice(pg.offset, pg.offset + pg.limit); t.push(name + ' (' + arr.length + '):', ...rows.map(f), more(arr.length, pg, rows.length)); };
  sect('bones', j.bones, b => '- ' + b.path + (b.visible ? '' : ' (hidden)'));
  sect('meshes', j.meshes, m => '- ' + m.file + ' on ' + m.bone + ' [' + m.kind + '] ' + m.faces + ' faces' + (m.materials.length ? ', ' + m.materials.join(' ') : ''));
  sect('volumes', j.volumes, v => '- ' + v.id + ' [' + v.kind + ']' + (v.file ? ' ' + v.file : ''));
  sect('files', j.files, f => '- ' + f.kind + ' ' + f.key + '  [' + f.layer + ']');
  sect('textures', j.files.filter(f => f.kind === 'texture'), f => '- ' + f.key + '  [' + f.layer + ']');
  if (!show.size) t.push('More: show: ["bones", "meshes", "volumes", "files", "textures"]; animations: mow_anim_list.');
  if (g.kind === 'goh') t.push('Gates of Hell: the model files have the same forms; this view is read only.');
  return { text: lines(t), data: { game: g.id, key: j.key, entity: j.entity, counts: { bones: j.bones.length, meshes: j.meshes.length, faces, volumes: j.volumes.length, sequences: j.sequences.length, files: kinds }, bounds: j.bounds, unresolved: j.unresolved.slice(0, 40), fromMod: fromMod.length } };
}

async function modelCheck(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g), mod = U.dirArg(ctx, args.mod, 'mod');
  const all = ['def', 'export', 'binary'];
  const want = Array.isArray(args.checks) && args.checks.length ? args.checks.map(lc) : all;
  const badWord = want.find(w => !all.includes(w)); if (badWord) return ctx.bad('checks: use def, export, binary (got ' + String(badWord).slice(0, 30) + ')');
  const n = num(args.limit, 8, 1, 60), t = [], data = { game: g.id, mod: fwd(mod) };
  const jobs = [];
  if (want.includes('def')) {
    if (g.kind === 'goh') t.push('def: not run for Gates of Hell. The .def checks compare against the AS64 and MoW:AS2 engine readers (PORT-171).');
    else jobs.push(['def', 'defcheck', [mod, '--game', dir, ...U.exe(g), '--format', 'json', '-q'], '.def against its .mdl: bone blocks, light extenders, stuff names']);
  }
  if (want.includes('export')) jobs.push(['export', 'expcheck', [mod, '--game', dir, ...U.exe(g), '--format', 'json', '-q'], 'exporter limits: skin and animation bone counts, twin bones and volumes (FMT-18..21, all inferred)']);
  if (want.includes('binary')) jobs.push(['binary', 'binhdr', [dir, ...U.exe(g), '--folder', mod, '--format', 'json', '-q'], 'binary headers of .ply .anm .vol .mdl and the materials a mesh names']);
  const rs = await Promise.all(jobs.map(j => run(ctx, j[1], j[2])));
  for (let i = 0; i < jobs.length; i++) {
    const [key, tool, , what] = jobs[i], r = rs[i];
    const bad = failed(ctx, r, tool); if (bad) return bad;
    if (r.code === 2) { t.push(key + ' (' + tool + '): ' + U.tail(r.stderr || r.stdout, 2).join(' ')); continue; }
    data[key] = reportLines(t, key + ' (' + tool + ', ' + what + ')', r, n);
  }
  t.unshift('Model checks of ' + fwd(mod) + ' for ' + gameWord(g) + ':');
  t.push('Files only; a missing texture or model file of a ported mod: mow_asset_missing.');
  return { text: lines(t), data };
}

async function modelStage(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g);
  ctx.name(args.model, 'model');
  const mod = U.dirArg(ctx, args.mod, 'mod', false);
  const tex = args.textures || 'none';
  if (!['none', 'stage'].includes(tex)) return ctx.bad('textures: use none (default) or stage (copy them into the mod too)');
  const tmp = U.tmpFile('mstage');
  const argv = ['stage', args.model.trim(), '--out', mod, '--game', dir, ...U.exe(g), '--textures', tex, '--json', tmp, ...modsArgv(ctx, args)];
  const an = U.names(ctx, args.anims, 'anims'); if (an.length) argv.push('--anm', an.join(','));
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(mod); else argv.push('--dry');
  const r = await run(ctx, 'soedit', argv);
  const bad = failed(ctx, r, 'soedit stage'); if (bad) { U.readJson(tmp); return bad; }
  const j = U.readJson(tmp);
  if (r.code !== 0 || !j) return ctx.bad('the model was not staged: ' + U.tail(r.text, 4).join(' '));
  const kinds = {}; for (const f of j.files || []) kinds[f.kind] = (kinds[f.kind] || 0) + 1;
  const kept = (j.files || []).filter(f => f.present).length, record = fwd(path.join(mod, '.arsenal', 'soedit', j.stem + '.stage.json'));
  const why = writing ? null : U.wouldRefuse(ctx, mod);
  return { text: lines([(writing ? 'Staged ' : 'Would stage ') + j.model + (j.entity ? ' (entity ' + j.entity + ')' : '') + ' into ' + fwd(mod) + '.',
    'Files: ' + Object.entries(kinds).map(([k, v]) => v + ' ' + k).join(', ') + (kept ? '; ' + kept + ' already in the mod are kept as they are' : '') + '. Each goes to the same path under the mod, so the game reads the mod copy.',
    tex === 'stage' ? 'Textures: ' + ((j.textures && j.textures.files) || []).length + ' copied into the mod.' : 'Textures are not copied (textures: "stage" copies them).',
    (j.unresolved || []).length ? (j.unresolved.length + ' name(s) the model asks for were found nowhere: ' + j.unresolved.slice(0, 6).map(u => u.kind + ' ' + u.name).join(', ')) : null,
    'Stage record: ' + record + (writing ? '' : ' (not written)') + '. Untouched copies are kept beside it; the game mounts only <mod>/resource.',
    writing ? 'After editing (SOEdit, Blender): mow_model_edits with record: "' + record + '" says what an edit lost.' : (why ? 'Preview only. A write there would be refused: ' + why : 'Preview only, nothing was written. Pass write: true to copy the files.')]),
    data: { game: g.id, written: writing, mod: fwd(mod), model: j.model, entity: j.entity || null, record, files: kinds, kept, unresolved: (j.unresolved || []).slice(0, 20) } };
}

async function modelEdits(args, ctx) {
  const g = ctx.game(args);
  ctx.name(args.record, 'record');
  const rec = args.record.trim();
  if (!path.isAbsolute(rec)) return ctx.bad('record: give the full path of the stage record (.stage.json) or of the staged .mdl');
  if (!U.isFile(rec)) return ctx.bad('record was not found: ' + fwd(rec));
  const tmp = U.tmpFile('medits');
  const argv = ['check', rec, ...U.exe(g), '--json', tmp, '-q'];
  if (g.dir) argv.push('--game', g.dir);
  const [r, loc] = await Promise.all([run(ctx, 'soedit', argv), run(ctx, 'soedit', ['locate', '--json'])]);
  const bad = failed(ctx, r, 'soedit check'); if (bad) { U.readJson(tmp); return bad; }
  const j = U.readJson(tmp);
  if (r.code === 2 || !j) return ctx.bad('no stage record was read: ' + U.tail(r.text, 3).join(' ') + ' Stage the model first with mow_model_stage.');
  const fs_ = Array.isArray(j.findings) ? j.findings : [], info = Array.isArray(j.info) ? j.info : [];
  const all = fs_.concat(info), cnt = {}; for (const f of all) cnt[f.code] = (cnt[f.code] || 0) + 1;
  const n = num(args.limit, 20, 1, 100), shown = fs_.slice(0, n);
  let so = null; try { so = JSON.parse(loc.stdout); } catch (e) { so = null; }
  return { text: lines(['Edits of the staged model ' + fwd(rec) + ': ' + (Object.keys(cnt).length ? Object.entries(cnt).map(([k, v]) => v + ' ' + k).join(', ') : 'nothing changed') + '.',
    r.code === 1 ? 'Something was lost or is missing:' : (fs_.length ? 'Findings:' : 'Nothing was lost.'),
    ...shown.map(f => '- ' + f.code + ' ' + (f.file || '') + (f.line ? ':' + f.line : '') + ': ' + U.short(f.msg, 240)),
    fs_.length > shown.length ? '... ' + (fs_.length - shown.length) + ' more: pass a larger limit' : null,
    'SOEdit program: ' + (so && so.path ? 'found (' + so.source + ')' : 'not found on this machine (the check does not need it)') + '.',
    g.kind === 'goh' ? 'Gates of Hell: the same check; whether the game reads both animation versions alike is inferred.' : null]),
    data: { game: g.id, record: fwd(rec), lost: r.code === 1, counts: cnt, findings: shown.map(f => ({ code: f.code, file: f.file, line: f.line || 0, msg: U.short(f.msg, 240) })), soedit: !!(so && so.path) } };
}

async function assetMissing(args, ctx) {
  const g = ctx.game(args);
  if (g.kind === 'goh') return { na: 'the missing-asset check (portasset) judges a mod against the AS64 or MoW:AS2 game data; Gates of Hell is the source side of a port and is refused by the tool. For one GoH model use mow_model_info (it lists the names found nowhere); for a whole GoH mod use mow_mod_check.' };
  const dir = U.need(ctx, g), mod = U.dirArg(ctx, args.mod, 'mod');
  const argv = [mod, '--game', dir, ...U.exe(g), '--format', 'json', '-q'];
  if (args.all === true) argv.push('--all');
  const r = await run(ctx, 'portasset', argv);
  const bad = failed(ctx, r, 'portasset') || usage(ctx, r, 'portasset'); if (bad) return bad;
  const t = ['Asset names of ' + fwd(mod) + ' that resolve neither in the mod nor in ' + gameWord(g) + ' (textures of materials, model parts, volumes), and texture files the engine cannot use:'];
  const sum = reportLines(t, 'portasset', r, num(args.limit, 15, 1, 100));
  t.push(args.all === true ? null : 'Files byte-equal to the game\'s own are skipped; all: true checks them too.', g.id === 'mowas2' ? 'MoW:AS2 mounts no as64 layer, so a name only that layer holds counts as missing.' : null);
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), report: sum } };
}

// ---------- textures, animations ----------
async function textureInfo(args, ctx) {
  const g = ctx.game(args);
  const o = {};
  if (args.file != null && args.file !== '') {
    ctx.name(args.file, 'file');
    if (!path.isAbsolute(args.file.trim())) return ctx.bad('file: give the full path; for a game path (texture/common/x, entity/.../x) use key');
    if (!U.isFile(args.file.trim())) return ctx.bad('file was not found: ' + fwd(args.file.trim()));
    o.file = path.resolve(args.file.trim());
  } else if (args.key != null && args.key !== '') {
    ctx.name(args.key, 'key');
    if (path.isAbsolute(args.key.trim()) || args.key.includes('..')) return ctx.bad('key: a path as the game sees it (entity/-vehicle/.../name or texture/common/name), not a disk path; use file for that');
    Object.assign(o, viewOf(ctx, g, args), { key: args.key.trim() });
  } else return ctx.bad('give file (a full disk path) or key (a path as the game sees it)');
  const pr = await probe(ctx, 'texture', o); if (pr.fail) return pr.fail;
  const j = pr.j;
  if (j.error) return ctx.bad(j.error);
  const pow2 = v => v > 0 && (v & (v - 1)) === 0;
  return { text: lines([j.key + (j.layer ? '  [' + j.layer + ']' : ''),
    (j.kind || '?') + (j.format ? ' ' + j.format : '') + (j.width ? ', ' + j.width + ' x ' + j.height : '') + (j.mips != null ? ', ' + j.mips + ' mip level(s)' : '') + ', ' + j.size + ' bytes' + (j.width && !(pow2(j.width) && pow2(j.height)) ? ' (sides are not powers of two)' : '') + '.',
    j.note ? 'Note: ' + j.note : null,
    j.variants.length > 1 ? 'Variants beside it (' + j.stem + '#<x>): ' + j.variants.slice(0, 30).join(', ') + (j.variants.length > 30 ? ' ... ' + (j.variants.length - 30) + ' more' : '') : 'No #variant files beside it.',
    'Which formats the game loads is checked for a whole mod by mow_asset_missing (as64, mowas2). A unit\'s skin and texture variants: mow_unit_stats with show: ["look"].']),
    data: Object.assign({ game: g.id }, j) };
}

async function animList(args, ctx) {
  const g = ctx.game(args);
  ctx.name(args.model, 'model');
  const pr = await probe(ctx, 'anims', Object.assign({ target: args.model.trim() }, viewOf(ctx, g, args))); if (pr.fail) return pr.fail;
  const j = pr.j;
  if (j.error) return ctx.bad(j.error + ' Use mow_model_find to search by words.');
  const q = lc(args.q || ''), pg = page(args, 40, 300);
  const files = j.files.filter(f => !q || lc(f.name).includes(q)), rows = files.slice(pg.offset, pg.offset + pg.limit);
  const seqNames = [...new Set(j.sequences.map(s => s.name))];
  return { text: lines([j.key + ': ' + seqNames.length + ' sequence name(s) in the .mdl, ' + j.files.length + ' animation file(s) found' + (j.missing.length ? ', ' + j.missing.length + ' named but missing' : '') + '.',
    seqNames.length ? 'Sequences: ' + seqNames.slice(0, 60).join(', ') + (seqNames.length > 60 ? ' ... ' + (seqNames.length - 60) + ' more' : '') : null,
    ...rows.map(f => '- ' + f.name + ': ' + (f.error ? 'unreadable (' + f.error + ')' : f.frames + ' frames, ' + f.bones + ' bones, version 0x' + Number(f.version).toString(16)) + '  [' + f.layer + ']'),
    more(files.length, pg, rows.length),
    ...j.missing.slice(0, 10).map(m => '- missing: ' + m.name),
    'These are the model\'s own files. A soldier\'s shared animations sit with the human model; which animation a .def asks for: mow_entity_info.']),
    data: { game: g.id, key: j.key, sequences: seqNames.slice(0, 200), files: rows, total: files.length, missing: j.missing.slice(0, 40) } };
}

// ---------- sound ----------
const soundView = (ctx, g, args) => { const a = ['--game', U.need(ctx, g), ...U.exe(g), '--json', ...modsArgv(ctx, args)]; const md = modDir(ctx, args); if (md) a.push('--mod', md); return a; };
const soundJson = r => { const s = String(r.stdout || ''), i = s.indexOf('{'); if (i < 0) return null; try { return JSON.parse(s.slice(i)); } catch (e) { return null; } };
const soundErr = r => { const m = /^error: (.*)$/m.exec(String(r.text || '')); return m ? m[1] : null; };
const setLine = s => 'group ' + s.group + (s.groupKnown === false ? ' (not a group the engine knows)' : '') + ', volume ' + s.volume + ', heard from ' + s.minDistance + ' m' + (s.maxDistance ? ' to ' + s.maxDistance + ' m' : '') + ', priority ' + s.priority + (s.loudness ? ', loudness "' + s.loudness + '"' : '') + (s.signal ? ', AI signal "' + s.signal.name + '" radius ' + s.signal.radius : '');

async function soundFind(args, ctx) {
  const g = ctx.game(args);
  ctx.name(args.name, 'name');
  const r = await run(ctx, 'sound', ['resolve', args.name.trim(), ...soundView(ctx, g, args)]);
  const bad = failed(ctx, r, 'sound resolve') || usage(ctx, r, 'sound resolve'); if (bad) return bad;
  const j = soundJson(r), e = soundErr(r);
  if (!j || !j.resolve) return ctx.bad('the sound name was not resolved: ' + (e || U.tail(r.text, 2).join(' ')));
  const rs = j.resolve, s = j.settings || null, n = num(args.limit, 15, 1, 200), files = rs.files || [];
  return { text: lines(['Sound name "' + rs.name + '": ' + (rs.exists ? 'a folder, ' + files.length + ' file(s), the game picks one ' + (rs.pick === 'random' ? 'at random' : '(' + rs.pick + ')') : rs.fixed ? 'one file, ' + rs.fixed : 'nothing by that name') + '.',
    rs.folderKey ? 'Folder: ' + rs.folderKey : null,
    rs.warn ? 'Warning: ' + rs.warn : null, j.hint ? 'Hint: ' + j.hint : null,
    s ? 'Folder settings (folder.set chain): ' + setLine(s) + '.' : null,
    ...(s && s.warnings ? s.warnings.slice(0, 5).map(w => '- ' + (w.code || '') + ' ' + (w.msg || w)) : []),
    ...files.slice(0, n).map(f => '- ' + f),
    files.length > n ? '... ' + (files.length - n) + ' more: pass a larger limit' : null,
    'A weapon\'s fireSound is looked up under weapon/shot/. One file in detail: mow_sound_info. Where the name is used: mow_fx_find.',
    g.kind === 'goh' ? 'Gates of Hell: its own folder distance rules apply (GHVIS-29).' : null]),
    data: { game: g.id, name: rs.name, exists: !!rs.exists, folder: rs.folderKey || null, fixed: rs.fixed || null, files: files.slice(0, n), total: files.length, settings: s ? { group: s.group, volume: s.volume, minDistance: s.minDistance, maxDistance: s.maxDistance, priority: s.priority, loudness: s.loudness, signal: s.signal || null } : null } };
}

async function soundInfo(args, ctx) {
  const g = ctx.game(args);
  ctx.name(args.sound, 'sound');
  const argv = ['info', args.sound.trim(), ...soundView(ctx, g, args)];
  if (args.distance != null) { const d = Number(args.distance); if (!Number.isFinite(d) || d < 0) return ctx.bad('distance: metres, 0 or more'); argv.push('--distance', String(d)); }
  if (args.ambient === true) argv.push('--ambient');
  const r = await run(ctx, 'sound', argv);
  const bad = failed(ctx, r, 'sound info') || usage(ctx, r, 'sound info'); if (bad) return bad;
  const j = soundJson(r), e = soundErr(r);
  if (!j || !j.plan) return ctx.bad('the sound was not read: ' + (e || U.tail(r.text, 2).join(' ')) + '. Give a game path (sound/weapon/shot/gun/x.wav), a full disk path, or find the name with mow_sound_find.');
  const p = j.plan, w = p.wav || {}, s = p.settings || null, ga = p.gain || null;
  const notes = [].concat((j.wav && j.wav.notes) || [], p.notes || []).map(x => (typeof x === 'string' ? x : (x.code ? x.code + ' ' : '') + (x.msg || ''))).filter(Boolean);
  return { text: lines([(j.key || fwd(j.file || '')) + ': ' + (w.ok === false ? 'not a wav the game decodes' : (w.codec || '?') + ', ' + w.channels + ' channel(s), ' + w.rate + ' Hz, ' + w.bits + ' bit, ' + (Math.round((w.seconds || 0) * 100) / 100) + ' s') + '.',
    s ? 'Folder settings: ' + setLine(s) + '.' : null,
    ga && args.distance != null ? 'At ' + args.distance + ' m' + (p.ambient ? ' (ambient)' : '') + ': gain left ' + ga.left + ', right ' + ga.right + (p.lowPass && p.lowPass.active ? ', low-pass at ' + p.lowPass.hz + ' Hz' : '') + ' (game default volumes).' : 'distance: <metres> adds how loud it is heard there.',
    ...notes.slice(0, 8).map(x => '- note: ' + U.short(x, 220)),
    g.kind === 'goh' ? 'Gates of Hell play rules: folder distances (GHVIS-29), folder volume on ambient (GHVIS-30), no min distance = stopped (GHVIS-31).' : null]),
    data: { game: g.id, key: j.key || null, file: j.file || null, wav: w, settings: s ? { group: s.group, volume: s.volume, minDistance: s.minDistance, maxDistance: s.maxDistance, priority: s.priority, loudness: s.loudness } : null, gain: ga, notes: notes.slice(0, 20) } };
}

async function soundCheck(args, ctx) {
  const g = ctx.game(args), md = modDir(ctx, args);
  const argv = ['sweep', ...soundView(ctx, g, args)];
  if (args.files != null) argv.push('--limit', String(num(args.files, 200, 1, 100000)));
  const r = await run(ctx, 'sound', argv, { max: 8 << 20 });
  const bad = failed(ctx, r, 'sound sweep') || usage(ctx, r, 'sound sweep'); if (bad) return bad;
  const j = soundJson(r);
  if (!j || j.wav == null) return ctx.bad('the sound sweep gave no answer: ' + (soundErr(r) || U.tail(r.text, 2).join(' ')));
  const n = num(args.limit, 10, 1, 100);
  const inMod = k => !!md && U.isFile(path.join(md, ...String(k).split('/')));
  const first = a => (md ? a.filter(inMod).concat(a.filter(k => !inMod(k))) : a);
  const failedRows = (j.failed || []).map(f => (typeof f === 'string' ? { key: f } : f));
  const warn = ((j.folders && j.folders.warnings) || []), setErr = ((j.soundSet && j.soundSet.errors) || []);
  const t = [j.wav + ' wav file(s) read in ' + gameWord(g) + (md ? ' + ' + path.basename(md) : '') + (args.files != null ? ' (cut at files: ' + args.files + ')' : '') + ': ' + j.decoded + ' decode, ' + failedRows.length + ' fail. Formats: ' + Object.entries(j.byCodec || {}).map(([k, v]) => v + ' ' + k).join(', ') + '.',
    ...failedRows.slice(0, n).map(f => '- cannot be decoded: ' + (f.key || f.file || JSON.stringify(f).slice(0, 120)) + (f.error ? ' (' + U.short(f.error, 120) + ')' : '') + (inMod(f.key) ? '  [mod]' : ''))];
  for (const [code, cnt] of Object.entries(j.notes || {})) {
    const fl = first((j.noteFiles && j.noteFiles[code]) || []), mine = md ? fl.filter(inMod).length : 0;
    t.push('note ' + code + ': ' + cnt + ' file(s)' + (md ? ', ' + mine + ' of the listed in the mod' : '') + (fl.length ? ', e.g. ' + fl.slice(0, 3).join(', ') : ''));
  }
  t.push((j.folders ? j.folders.count + ' sound folder(s); ' + (j.folders.noFolderSet || []).length + ' without any folder.set above them; ' : '') + warn.length + ' folder.set warning(s), ' + setErr.length + ' sound.set note(s).');
  for (const w of warn.slice(0, n)) t.push('- ' + (w.code || '') + ' ' + (w.key || '') + (w.line ? ':' + w.line : '') + ': ' + U.short(w.msg || '', 200));
  for (const w of setErr.slice(0, 4)) t.push('- sound.set ' + (w.code || '') + (w.line ? ' line ' + w.line : '') + ': ' + U.short(w.msg || '', 200));
  if (warn.length > n) t.push('... ' + (warn.length - n) + ' more folder warnings: pass a larger limit');
  t.push('The sweep reads the game\'s sounds with the mod laid over them (about 15 s for the AS2 install); files: <n> stops after n files.');
  return { text: lines(t), data: { game: g.id, mod: md ? fwd(md) : null, wav: j.wav, decoded: j.decoded, failed: failedRows.slice(0, 40), byFormat: j.byFormat || {}, notes: j.notes || {}, folderWarnings: warn.length, music: j.music || null } };
}

// ---------- effects ----------
async function fxFind(args, ctx) {
  const g = ctx.game(args), dir = U.need(ctx, g);
  ctx.name(args.name, 'name');
  const name = args.name.trim();
  if (/[\s"{}]/.test(name)) return ctx.bad('name: one name without spaces or quotes (an effect entity such as ex_arm_big, a sound name, a texture or model stem)');
  const md = modDir(ctx, args), mods = U.names(ctx, args.mods, 'mods');
  const ixArgv = [dir, ...U.exe(g), ...(mods.length ? ['--mods', mods.join(',')] : []), ...(md ? ['--folder', md] : []), name];
  const o = { name, game: dir, exe: g.exe, mods, budgetMs: 25000 }; if (md) o.folder = md;
  const [ix, pr] = await Promise.all([run(ctx, 'entityindex', ixArgv, { timeout: 30 * 60 * 1000 }), probe(ctx, 'refs', o)]);
  if (pr.fail) return pr.fail;
  const j = pr.j; if (j.error) return ctx.bad('the usage search failed: ' + j.error);
  const defLines = String(ix.stdout || '').split(/\r?\n/).filter(l => /^resource\//.test(l) || /: no such entity/.test(l));
  const defs = defLines.filter(l => /^resource\//.test(l)).map(l => l.trim());
  const pg = page(args, 25, 200), q = lc(args.q || '');
  const hits = j.hits.filter(h => !q || lc(h.at).includes(q)), rows = hits.slice(pg.offset, pg.offset + pg.limit);
  const folders = byCount(hits.map(h => h.at.split('/').slice(1, 3).join('/')));
  return { text: lines(['"' + name + '" in ' + gameWord(g) + (md ? ' + ' + path.basename(md) : '') + (mods.length ? ' + ' + mods.join(', ') : '') + ':',
    defs.length ? 'Defined as an entity: ' + defs.join(' ; ') : 'No entity (.def) has this name' + (ix.isError ? ' (the entity index could not be read)' : '') + '; it may be a sound name, a texture, a custom event or plain text.',
    hits.length + ' place(s) use it' + (j.kind ? ' (searched as ' + (j.kind === 'entity' ? 'an entity name' : 'text') + ')' : '') + (folders ? ': ' + U.short(folders, 300) : '') + (j.truncated ? '. The search stopped early (' + (j.why || 'time') + '): there may be more' : '') + '.',
    ...rows.map(h => '- ' + h.at + '  ' + h.text + (h.where && h.where !== 'vanilla' ? '  [' + h.where + ']' : '')),
    more(hits.length, pg, rows.length),
    hits.length > pg.limit ? 'q: "<part of a path>" narrows (for example interaction_entity, .def, sound).' : null,
    g.kind === 'goh' ? 'Gates of Hell: the first search builds an index of the install and can take long.' : null]),
    data: { game: g.id, name, defined: defs, kind: j.kind, total: hits.length, truncated: j.truncated, rows } };
}

// a lint tool on a mod folder -> report
async function lintMod(ctx, g, tool, mod, args) {
  const argv = [mod, '--game', U.need(ctx, g), ...U.exe(g), '--format', 'json', '-q', ...modsArgv(ctx, args)];
  const r = await run(ctx, tool, argv);
  return { r, bad: failed(ctx, r, tool) || usage(ctx, r, tool) };
}
async function fxCheck(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod');
  const { r, bad } = await lintMod(ctx, g, 'fxlint', mod, args); if (bad) return bad;
  const t = ['Effects and sound data of ' + fwd(mod) + ' for ' + gameWord(g) + ' (sound folder tags VIS-09, weather and thunder VIS-14, action names VIS-18, track tracers against fxmanager.set VIS-19):'];
  const sum = reportLines(t, 'fxlint', r, num(args.limit, 15, 1, 100));
  if (g.kind === 'goh') t.push('Gates of Hell: its own action list is used (GHINT-26).');
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), report: sum } };
}

// ---------- icons ----------
const ICON_CODE = /PICTURE|FONT/;
async function iconCheck(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod');
  const { r, bad } = await lintMod(ctx, g, 'uilint', mod, args); if (bad) return bad;
  const rep = U.reportOf(r.stdout);
  if (!rep) return ctx.bad('the interface check gave no answer: ' + U.tail(r.text, 3).join(' '));
  const all = rep.findings.concat(Array.isArray(rep.info) ? rep.info : []);
  const pics = all.filter(f => ICON_CODE.test(f.code)), other = rep.findings.filter(f => !ICON_CODE.test(f.code));
  const n = num(args.limit, 20, 1, 100), cnt = {}; for (const f of pics) cnt[f.code] = (cnt[f.code] || 0) + 1;
  return { text: lines(['Button pictures and fonts of ' + fwd(mod) + ' for ' + gameWord(g) + ': ' + (pics.length ? Object.entries(cnt).map(([k, v]) => v + ' ' + k).join(', ') : 'no missing picture or font') + '.',
    ...pics.slice(0, n).map(f => '- ' + f.code + ' ' + f.file + (f.line ? ':' + f.line : '') + ': ' + U.short(f.msg, 240)),
    pics.length > n ? '... ' + (pics.length - n) + ' more: pass a larger limit' : null,
    'It reads the actions of interface/action/*.set and the fonts; a picture is looked for in the mod and in the game (PICTURE_MISSING, UI-03).',
    other.length ? other.length + ' other interface finding(s) (panels, keys): mow_mod_check with only: ["uilint"].' : null,
    g.kind === 'goh' ? 'Gates of Hell: button pictures are reported as info only (inferred).' : null,
    'Unit icons and portraits of a buy card are named in the unit data: mow_unit_stats. One picture file: mow_texture_info.']),
    data: { game: g.id, mod: fwd(mod), counts: cnt, findings: pics.slice(0, n).map(f => ({ code: f.code, file: f.file, line: f.line || 0, msg: U.short(f.msg, 240) })), other: other.length } };
}

// ---------- the tools ----------
const READ = 'read', WRITE = 'write';
const VIEW = { mod: P.modOpt, mods: P.mods };
const tools = [
  { name: 'mow_model_find', title: 'Find a model', kind: READ, wraps: 'soedit find',
    description: 'Use to find a 3D model by words: entity name, shown title or file name, in the game and optionally a mod. Answers name, kind (vehicle, human, object, breed, model), where it comes from and its .mdl. kind narrows. Then mow_model_info. All three games; mowas2 reads without as64/core; goh: the first search builds an index and can take long.',
    inputSchema: schema({ q: { type: 'string', description: 'Words, all must match (tiger, "pz6 turret")' }, kind: { type: 'string', enum: ['all', 'vehicle', 'human', 'object', 'breed', 'model'] }, mod: P.modOpt, mods: P.mods, limit: P.limit }, ['q']), handler: modelFind },
  { name: 'mow_model_info', title: 'What a model is made of', kind: READ, wraps: 'lib/model sceneload + soedit stage collect',
    description: 'Use to see what a model (.mdl of an entity) pulls in: bones, meshes with face counts and materials, hit volumes, sequences, size box, every file (ply, vol, anm, mtl, textures) with the layer it comes from, and the names it asks for that exist nowhere (missing textures and parts). show adds the lists. mod and mods lay mods over the game. All three games; goh is read the same way, view only.',
    inputSchema: schema({ model: P.model, mod: P.modOpt, mods: P.mods, show: { type: 'array', items: { type: 'string', enum: ['bones', 'meshes', 'volumes', 'files', 'textures'] }, description: 'Lists to add' }, limit: P.limit, offset: P.offset }, ['model']), handler: modelInfo },
  { name: 'mow_model_check', title: 'Check a mod\'s models', kind: READ, wraps: 'defcheck, expcheck, binhdr',
    description: 'Use when a mod\'s unit crashes on load or looks broken: checks the mod folder\'s .def files against their .mdl (bones, lights, stuff names), the exporter limits (bone counts, twin names) and the binary headers of meshes, animations and volumes. Answers finding kinds with examples. checks picks def, export, binary. goh: the def check is not run (PORT-171); the other two are.',
    inputSchema: schema({ mod: P.mod, checks: { type: 'array', items: { type: 'string', enum: ['def', 'export', 'binary'] } }, limit: P.limit }, ['mod']), handler: modelCheck },
  { name: 'mow_model_stage', title: 'Copy a model into a mod for editing', kind: WRITE, wraps: 'soedit stage',
    description: 'Use before editing a model in SOEdit or Blender: copies the model\'s editable files (.mdl .ply .vol .anm .mtl) from the game or its paks to the same paths in your mod folder, keeps files already there, and writes a stage record with untouched copies. Preview (file counts, what is missing) unless write: true. After editing run mow_model_edits. All three games; goh models stage the same way.',
    inputSchema: schema({ model: P.model, mod: P.mod, anims: { type: 'array', items: { type: 'string' }, description: 'Extra animation names to copy' }, textures: { type: 'string', enum: ['none', 'stage'], description: 'stage = copy the textures into the mod too (default none)' }, mods: P.mods, write: P.write }, ['model', 'mod']), handler: modelStage },
  { name: 'mow_model_edits', title: 'What a model edit changed or lost', kind: READ, wraps: 'soedit check, soedit locate',
    description: 'Use after a staged model was edited and saved: compares the files with the stage record and says which changed, which are new or missing and what the editor dropped (keyword blocks of the .mdl, comments, animation version, mesh part kinds), then header and exporter checks on the changed files. Also says whether SOEdit is on this machine. All three games; goh: the same check, engine reaction inferred.',
    inputSchema: schema({ record: { type: 'string', description: 'Full path of <mod>/.arsenal/soedit/<name>.stage.json or of the staged .mdl' }, limit: P.limit }, ['record']), handler: modelEdits },
  { name: 'mow_asset_missing', title: 'Missing textures and model parts of a mod', kind: READ, wraps: 'portasset',
    description: 'Use when a mod shows white or checkered models, or a ported unit fails to load: lists every texture name in a material, every mesh, animation, material and volume a model names that is found neither in the mod nor in the game, and texture files the engine cannot use. as64 and mowas2 (mowas2 without the as64 layer). goh: not served, use mow_model_info per model or mow_mod_check.',
    inputSchema: schema({ mod: P.mod, all: { type: 'boolean', description: 'Also check files that are byte-equal to the game\'s' }, limit: P.limit }, ['mod']), handler: assetMissing },
  { name: 'mow_texture_info', title: 'Read a texture file', kind: READ, wraps: 'lib/model/dds, artport dims',
    description: 'Use to read one texture or picture: format (DXT1, DXT3, DXT5, BC5, RGBA), size, mip levels, which layer it comes from, and the #variant files beside it (camo and damage variants a material can switch to). Give file (a disk path) or key (a path as the game sees it, extension optional). All three games; goh files are read the same way.',
    inputSchema: schema({ file: { type: 'string', description: 'Full disk path of a .dds .tga .png' }, key: { type: 'string', description: 'Game path, e.g. entity/-vehicle/tank_heavy/pz6e/pz6auste or texture/common/x' }, mod: P.modOpt, mods: P.mods }), handler: textureInfo },
  { name: 'mow_anim_list', title: 'Animations of a model', kind: READ, wraps: 'lib/model/mdl sequences, lib/anm',
    description: 'Use to list the animations a model has: the sequence names in its .mdl and each .anm file with frames, bone count and version, plus animation names the model asks for that are missing. q narrows by name. All three games; goh animations are a newer version of the same form. Shared soldier animations belong to the human model.',
    inputSchema: schema({ model: P.model, q: { type: 'string', description: 'Part of an animation name' }, mod: P.modOpt, mods: P.mods, limit: P.limit, offset: P.offset }, ['model']), handler: animList },
  { name: 'mow_sound_find', title: 'Resolve a sound name', kind: READ, wraps: 'sound resolve',
    description: 'Use to see what a sound name in the data plays: the folder or file it resolves to, the files the game picks from, and the folder settings that apply (group, volume, hearing distance, priority, AI signal). A weapon fireSound is looked up under weapon/shot/. All three games; goh uses its own folder distance rules (GHVIS-29).',
    inputSchema: schema({ name: { type: 'string', description: 'Sound name as written in the data, e.g. weapon/shot/gun or gun/85to100_cal/88mm_flak41' }, mod: P.modOpt, mods: P.mods, limit: P.limit }, ['name']), handler: soundFind },
  { name: 'mow_sound_info', title: 'Read a sound file', kind: READ, wraps: 'sound info',
    description: 'Use to check one .wav: codec, channels, rate, length, notes on what the game does with it (stereo, odd rates), its folder settings, and with distance how loud it is heard at that many metres. sound is a game path (sound/.../x.wav), a full disk path or a sound name. All three games; goh applies its own play rules (GHVIS-29..31).',
    inputSchema: schema({ sound: { type: 'string', description: 'Game path, disk path or sound name' }, distance: { type: 'number', description: 'Metres from the listener' }, ambient: { type: 'boolean' }, mod: P.modOpt, mods: P.mods }, ['sound']), handler: soundInfo },
  { name: 'mow_sound_check', title: 'Check all sound files', kind: READ, wraps: 'sound sweep',
    description: 'Use after adding sounds to a mod: decodes every .wav of the game with the mod laid over it and answers which cannot be decoded, format notes (stereo, bit depth, rate) with the mod\'s files first, folders without a folder.set and folder.set warnings such as an unknown group tag (VIS-09). About 15 s; files stops early. All three games; goh adds its filter chains.',
    inputSchema: schema({ mod: P.modOpt, mods: P.mods, files: { type: 'integer', description: 'Stop after this many files' }, limit: P.limit }), handler: soundCheck },
  { name: 'mow_fx_find', title: 'Where an effect or asset name is defined and used', kind: READ, wraps: 'entityindex, ide intel refs',
    description: 'Use to find where an effect, entity or other asset name comes from and who uses it: the .def that defines it and every line that names it (interaction scripts that spawn it, weapons, other defs, bot lists), in the game plus mod or mods. q narrows by path, limit and offset page. All three games; goh: the first call builds an index and can take long.',
    inputSchema: schema({ name: { type: 'string', description: 'One name, e.g. ex_arm_big' }, q: { type: 'string', description: 'Part of a path to keep' }, mod: P.modOpt, mods: P.mods, limit: P.limit, offset: P.offset }, ['name']), handler: fxFind },
  { name: 'mow_fx_check', title: 'Check effects and sound data of a mod', kind: READ, wraps: 'fxlint',
    description: 'Use when effects or sounds of a mod do not show or play: checks sound folder tags (VIS-09), weather and thunder blocks (VIS-14), interaction action names the engine does not know (VIS-18) and track tracer effects missing from fxmanager.set (VIS-19). Answers finding kinds with file and line. All three games; goh is checked against its own action list (GHINT-26).',
    inputSchema: schema({ mod: P.mod, mods: P.mods, limit: P.limit }, ['mod']), handler: fxCheck },
  { name: 'mow_icon_check', title: 'Check button pictures and fonts of a mod', kind: READ, wraps: 'uilint',
    description: 'Use when a button or icon of a mod shows blank: checks that every picture an interface action names exists in the mod or the game (PICTURE_MISSING, UI-03) and that fonts are complete; counts the other interface findings and says where to read them. All three games; goh reports button pictures as info only. Buy card icons: mow_unit_stats.',
    inputSchema: schema({ mod: P.mod, mods: P.mods, limit: P.limit }, ['mod']), handler: iconCheck },
];
for (const t of tools) t.games = GAMES;

module.exports = { group: 'assets', tools };
