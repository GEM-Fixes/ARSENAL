// mcp tools, group `mod`: make, read, check, fix, compare, merge, port and pack a mod; find and change units, texts, maps and missions.
// Contract: tools/mcp/README.md. Every tool takes game = as64 | mowas2 | goh and wraps the CLI tool or library that already does
// the job (named in each tool's `wraps`); nothing is done here that a tool of the kit does not do.
//   - read tools only read; a child tool gets its arguments as an argv array through ctx.run.
//   - write tools answer a preview (the child's own dry run / plan) unless write: true; then every target goes through ctx.guard.write.
//     A preview says when the write would be refused, and why.
//   - a game a tool cannot serve answers { na: 'why' } in plain words.
//   - answers: a few plain lines + compact data; long lists are cut with a count and a hint how to narrow.
// Units go through the Units page's own code (mod/units.js); shared helpers in mod/util.js.
// Author: Imperator_Aug (ARSENAL, ia-6790ebe2)
'use strict';
const fs = require('fs'), path = require('path');
const U = require('./mod/util');
const units = require('./mod/units');

const GAMES = ['as64', 'mowas2', 'goh'];
const P = {
  game: { type: 'string', enum: GAMES, description: 'as64 (default), mowas2 or goh' },
  mod: { type: 'string', description: 'Full path of the mod folder' },
  modOpt: { type: 'string', description: 'Full path of a mod folder; left out = the game alone' },
  mods: { type: 'array', items: { type: 'string' }, description: 'Mod folder names in <game>/mods, in load order' },
  write: { type: 'boolean', description: 'true = change files; left out = preview only' },
  limit: { type: 'integer', description: 'Most rows to answer' },
};
const schema = (properties, required) => ({ type: 'object', properties: Object.assign({ game: P.game }, properties), required: required || [] });
const lines = a => a.filter(x => x != null && x !== '').join('\n');
const fwd = p => String(p).replace(/\\/g, '/');
const lc = s => String(s == null ? '' : s).toLowerCase();
const gameWord = g => (g.id === 'as64' ? 'AS64' : g.id === 'mowas2' ? 'MoW:AS2' : 'Gates of Hell');
// a child that could not start or ran out of time: one plain line
const failed = (ctx, r, what) => (r.isError ? ctx.bad(what + (r.timedOut ? ' took too long and was stopped' : ' could not be run') + ': ' + U.tail(r.text, 3).join(' ')) : null);
const usage = (ctx, r, what) => (r.code === 2 ? ctx.bad(what + ': ' + U.tail(r.stderr || r.stdout, 3).join(' ')) : null);
const run = (ctx, tool, argv, opt) => ctx.run(tool, argv, Object.assign({ env: U.childEnv(), cwd: U.tmpDir() }, opt));
// preview line of a write tool
function previewNote(ctx, target) {
  const why = U.wouldRefuse(ctx, target);
  return why ? 'Preview only. A write there would be refused: ' + why : 'Preview only, nothing was written. Pass write: true to write.';
}
// the mod as the game finds it: in <game>/mods (by its own folder, a link to it, or a folder of the same name), else null
function installedAs(mod, game) {
  const md = path.resolve(game, 'mods'), low = s => path.resolve(s).toLowerCase();
  if (low(path.dirname(mod)) === low(md)) return { dir: mod, how: 'in' };
  let real = mod; try { real = fs.realpathSync(mod); } catch (e) { /* as given */ }
  let ns = []; try { ns = fs.readdirSync(md); } catch (e) { return null; }
  for (const n of ns) { const d = path.join(md, n); try { if (low(fs.realpathSync(d)) === low(real) && fs.existsSync(path.join(d, 'mod.info'))) return { dir: d, how: 'link' }; } catch (e) { /* broken link */ } }
  return null;
}
const slugOf = mod => lc(path.basename(mod)).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'mod';

// ---------- mod.info ----------
function readModInfo(mod) {
  const f = ['mod.info'].map(n => path.join(mod, n)).find(U.isFile);
  if (!f) return null;
  let t = ''; try { t = fs.readFileSync(f, 'latin1'); } catch (e) { return null; }
  const live = t.replace(/^\s*;.*$/gm, ''), out = { name: null, desc: null, min: null, max: null, require: [], delete: [] };
  const re = /\{\s*"?([A-Za-z]+)"?\s+"((?:[^"\\]|\\.)*)"/g; let m;
  while ((m = re.exec(live))) {
    const k = lc(m[1]), v = Buffer.from(m[2], 'latin1').toString('utf8');
    if (k === 'name') out.name = v; else if (k === 'desc') out.desc = U.short(v, 300);
    else if (k === 'mingameversion') out.min = v; else if (k === 'maxgameversion') out.max = v;
    else if (k === 'require') out.require.push(v); else if (k === 'delete') out.delete.push(v);
  }
  return out;
}
function layoutOf(mod) {
  const ls = d => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
  const top = ls(mod), res = ls(path.join(mod, 'resource'));
  return {
    top: top.map(e => e.name + (e.isDirectory() ? '/' : '')).slice(0, 30),
    resource: res.filter(e => e.isDirectory()).map(e => e.name).slice(0, 30),
    paks: res.filter(e => /\.pak$/i.test(e.name)).map(e => e.name).concat(top.filter(e => /\.pak$/i.test(e.name)).map(e => e.name)).slice(0, 30),
    patches: top.filter(e => /^\d+\.pat$/i.test(e.name)).map(e => e.name),
    text: ['localization', 'localizations'].filter(n => U.isDir(path.join(mod, n))),
  };
}

async function modInfo(args, ctx) {
  const g = ctx.game(args);
  if (!args.mod) {
    const dir = path.join(U.need(ctx, g), 'mods');
    let ns = []; try { ns = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() || e.isSymbolicLink()).map(e => e.name); } catch (e) { ns = []; }
    const q = lc(args.q || '');
    const rows = ns.filter(n => U.isFile(path.join(dir, n, 'mod.info'))).map(n => { const i = readModInfo(path.join(dir, n)) || {}; return { folder: n, name: i.name || '', min: i.min, max: i.max, require: i.require || [] }; })
      .filter(r => !q || lc(r.folder).includes(q) || lc(r.name).includes(q));
    const L = U.list(rows, args.limit || 40, 'pass q with a part of the name');
    return { text: lines([rows.length + ' mod folder(s) in ' + fwd(dir) + (L.more ? ', first ' + L.rows.length + ' shown (pass q to narrow)' : '') + '. Workshop items are not listed.',
      ...L.rows.map(r => '- ' + r.folder + (r.name && r.name !== r.folder ? ' = ' + r.name : '') + (r.min || r.max ? '  [' + (r.min || '') + ' .. ' + (r.max || '') + ']' : '') + (r.require.length ? '  needs ' + r.require.join(', ') : ''))]),
      data: { game: g.id, dir: fwd(dir), mods: L.rows, total: L.total, more: L.more } };
  }
  const mod = U.dirArg(ctx, args.mod, 'mod');
  const info = readModInfo(mod), lay = layoutOf(mod);
  const argv = [mod, ...U.exe(g), '--format', 'json'];
  if (g.dir) argv.push('--game', g.dir);
  const r = await run(ctx, 'modinfo', argv);
  const bad = failed(ctx, r, 'modinfo'); if (bad) return bad;
  const rep = U.reportOf(r.stdout), sum = rep ? U.sumReport(rep, 10) : null;
  const t = [];
  if (!info) t.push('No mod.info in ' + fwd(mod) + ': the game does not list this folder as a mod.');
  else {
    t.push((info.name || '(no name)') + '  [' + fwd(mod) + ']');
    t.push('Game version range: ' + (info.min || '(none)') + ' .. ' + (info.max || '(none)') + (info.require.length ? '. Needs: ' + info.require.join(', ') : '') + (info.delete.length ? '. Deletes ' + info.delete.length + ' path(s)' : ''));
  }
  t.push('Holds: ' + (lay.resource.length ? 'resource/{' + lay.resource.join(',') + '}' : 'no resource/ folders') + (lay.paks.length ? ', paks ' + lay.paks.join(' ') : '') + (lay.patches.length ? ', ' + lay.patches.join(' ') : '') + (lay.text.length ? ', text in ' + lay.text.join(' + ') + '/' : ', no text folder'));
  if (sum) {
    t.push('mod.info check for ' + gameWord(g) + ': ' + (sum.total ? sum.total + ' finding(s)' : 'no findings'));
    for (const f of sum.findings) t.push('- ' + f.code + (f.line ? ' line ' + f.line : '') + ': ' + f.msg);
  } else t.push('mod.info check: ' + U.tail(r.text, 2).join(' '));
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), info, layout: lay, check: sum } };
}

// ---------- new mod ----------
async function modNew(args, ctx) {
  const g = ctx.game(args), dir = U.dirArg(ctx, args.dir, 'dir', false);
  ctx.name(args.name, 'name');
  const argv = [dir, '--name', args.name, '--target', g.id];
  if (g.kind === 'goh' && g.dir) argv.push('--game', g.dir);
  const deps = U.names(ctx, args.deps, 'deps'); if (deps.length) argv.push('--deps', deps.join(','));
  if (typeof args.description === 'string' && args.description.trim()) argv.push('--desc', args.description);
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(dir); else argv.push('--dry-run');
  const r = await run(ctx, 'newmod', argv);
  const bad = failed(ctx, r, 'newmod'); if (bad) return bad;
  if (r.code !== 0) return ctx.bad('the mod folder was not made: ' + U.tail(r.text, 4).join(' '));
  const files = String(r.stdout).split(/\r?\n/).filter(l => /^(file|dir)\s/.test(l)).map(l => l.replace(/\s+/g, ' ').trim());
  const where = g.kind === 'goh' ? 'text goes to localizations/default/interface/text/<name>.pot; mod.info holds the GoH exe version' : (g.id === 'mowas2' ? 'mod.info range 3.262.0 .. 3.262.1 (the original 32-bit game)' : 'mod.info Min 3.301, no Max (AS64 only)');
  return { text: lines([writing ? 'Made the mod folder ' + fwd(dir) + ' for ' + gameWord(g) + '.' : 'Would make ' + fwd(dir) + ' for ' + gameWord(g) + ':', ...(writing ? [] : files.map(f => '- ' + f)), where + '.',
    writing ? 'Next: mow_unit_change / mow_text_set / mow_mod_gen into it, then mow_mod_check. To play it, the folder must sit in <game>/mods.' : previewNote(ctx, dir)]),
    data: { game: g.id, dir: fwd(dir), written: writing, plan: files } };
}

// ---------- check ----------
async function modCheck(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod');
  const as2 = ctx.game({ game: 'as64' }).dir, goh = ctx.game({ game: 'goh' }).dir;
  if (!g.dir) U.need(ctx, g);
  const f = U.tmpFile('check'), fast = args.full !== true;
  const argv = [mod, '--target', g.id, '--exe', g.id, '--json', f];
  if (as2) argv.push('--game', as2);
  if (goh) argv.push('--goh', goh);
  if (fast) argv.push('--fast');
  const only = U.names(ctx, args.only, 'only'); if (only.length) argv.push('--only', only.join(','));
  if (args.with) argv.push('--with', U.dirArg(ctx, args.with, 'with'));
  const r = await run(ctx, 'check', argv, { timeout: (fast ? 20 : 90) * 60000 });
  const j = U.readJson(f);
  const bad = failed(ctx, r, 'the check'); if (bad) return bad;
  if (!j) return ctx.bad('the check gave no report: ' + U.tail(r.text, 4).join(' '));
  const all = (j.findings || []), byCode = new Map();
  for (const x of all) { const k = x.code || '?'; const o = byCode.get(k) || { code: k, n: 0, severity: x.sev || x.severity || x.cls || '', first: null }; o.n++; if (!o.first) o.first = { file: U.short(x.file || '', 160), line: x.line || 0, msg: U.short(x.msg || x.text || '', 260), tool: x.tool }; byCode.set(k, o); }
  const rank = s => ({ crash: 0, silent: 1, review: 2, cosmetic: 3 }[s] != null ? { crash: 0, silent: 1, review: 2, cosmetic: 3 }[s] : 2);
  const codes = [...byCode.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || b.n - a.n);
  const L = U.list(codes, args.limit || 25, 'pass only: [tool names] or fix the first ones and run again');
  const v = (j.verdicts && j.verdicts[g.id]) || null;
  const t = [...(j.plain || []).slice(0, 4)];
  if (v) t.push('Verdict for ' + gameWord(g) + ': ' + v.verdict + (v.text ? ' (' + v.text + ')' : ''));
  t.push(all.length ? all.length + ' finding(s) in ' + codes.length + ' kind(s)' + (L.more ? ', the ' + L.rows.length + ' worst kinds shown' : '') + ':' : 'No findings.');
  for (const c of L.rows) t.push('- ' + (c.severity ? '[' + c.severity + '] ' : '') + c.code + ' x' + c.n + ': ' + c.first.msg + (c.first.file ? '  (' + c.first.file + (c.first.line ? ':' + c.first.line : '') + ')' : ''));
  for (const x of (j.toolIssues || []).slice(0, 5)) t.push('! ' + U.short(typeof x === 'string' ? x : (x.tool || '') + ' ' + (x.msg || x.why || JSON.stringify(x)), 200));
  t.push(fast ? 'Quick check (slow linters left out). full: true runs every linter; that can take many minutes on a big mod.' : 'Full check.');
  t.push('The files were checked, the game was not run. Fix plan: mow_mod_fix.');
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), fast, verdict: v, verdicts: j.verdicts || null, overall: j.overall || null, findings: all.length, kinds: L.rows, more: L.more, read: j.read ? j.read[g.id] : null } };
}

// ---------- fix ----------
async function modFix(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod'), out = U.dirArg(ctx, args.out, 'out', false);
  if (lc(out) === lc(mod) || lc(out).startsWith(lc(mod) + path.sep)) return ctx.bad('out must be a new folder beside the mod, not the mod itself or a folder inside it. The fixes go into a patch mod; the mod is never changed.');
  const f = U.tmpFile('fix'), writing = ctx.guard.writing;
  if (writing) ctx.guard.write(out);
  const argv = [mod, writing ? 'apply' : 'plan', '--out', out, '--target', g.id, '--exe', g.exe, '--json', f];
  argv.push('--game', U.need(ctx, g));
  const only = U.names(ctx, args.only, 'only'); if (only.length) argv.push('--only', only.join(','));
  const deps = U.names(ctx, args.mods, 'mods'); if (deps.length) argv.push('--mods', deps.join(','));
  const r = await run(ctx, 'fix', argv, { timeout: 60 * 60000 });
  const j = U.readJson(f);
  const bad = failed(ctx, r, 'fix') || usage(ctx, r, 'fix'); if (bad) return bad;
  if (!j) return ctx.bad('fix gave no report: ' + U.tail(r.text, 4).join(' '));
  const row = x => (typeof x === 'string' ? x : U.short([x.file || x.key || '', x.fixer || x.kind || x.code || '', x.what || x.msg || x.why || ''].filter(Boolean).join(': '), 240));
  const ch = U.list((j.changed || []).map(row), args.limit || 30, 'pass only: [fixer names] (lng repoint set include macro enc spell syntax asread stubmtl botkeys lngdup)');
  const cant = U.list((j.cant || []).map(row), 15);
  const t = [(writing ? 'Wrote the patch mod ' : 'Plan for a patch mod ') + fwd(out) + ' for ' + gameWord(g) + ': ' + ch.total + ' file(s) ' + (writing ? 'fixed' : 'would be fixed') + ', ' + cant.total + ' could not be fixed. The mod itself is not touched; load the patch mod after it.',
    ...ch.rows.map(x => '- ' + x), ch.more ? '(' + ch.more + ' more)' : null,
    cant.total ? 'Could not fix:' : null, ...cant.rows.map(x => '- ' + x), cant.more ? '(' + cant.more + ' more)' : null,
    'Verdict: ' + (j.verdict || '?') + '. Not run in game.', writing ? null : previewNote(ctx, out)];
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), out: fwd(out), written: writing, changed: ch, cant, verdict: j.verdict || null, read: j.read || null, crashLeft: j.crashLeft, refLeft: j.refLeftN } };
}

// ---------- what a mod changes ----------
async function modDiff(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), mod = U.dirArg(ctx, args.mod, 'mod');
  const deps = U.names(ctx, args.mods, 'mods');
  let tool = 'overdiff', argv, via = 'mounted by its folder';
  const inst = g.kind === 'goh' ? { dir: mod, how: 'path' } : installedAs(mod, game);
  if (inst) {
    argv = [inst.dir, '--game', game, ...U.exe(g), '--format', 'json'];
    if (deps.length) argv.push('--mods', deps.join(','));
    via = inst.how === 'in' ? 'the mod in <game>/mods' : inst.how === 'link' ? 'its link in <game>/mods' : 'mounted by its path';
  } else {
    // a mod folder outside <game>/mods: overdiff finds mods only there; conflicts mounts a folder by path, last
    tool = 'conflicts'; via = 'mounted by its path (not installed in <game>/mods)';
    argv = ['--game', game, '--mods', deps.join(','), '--mod-dir', mod, ...U.exe(g), '--format', 'json'];
    if (args.keys === true) argv.push('--keys');
  }
  if (args.file) { if (tool !== 'conflicts') return ctx.bad('file: only for a mod folder outside <game>/mods (read by path)'); argv.push('--file', ctx.name(args.file, 'file')); }
  const r = await run(ctx, tool, argv, { timeout: 30 * 60000, max: 4000000 });
  const bad = failed(ctx, r, tool) || usage(ctx, r, tool); if (bad) return bad;
  const rep = U.reportOf(r.stdout);
  if (!rep) return ctx.bad(tool + ' gave no report: ' + U.tail(r.text, 4).join(' '));
  let info = (rep.info || []).filter(x => !/^VFS_/.test(x.code || ''));
  if (tool === 'conflicts') {   // rows the mod wins only: on AS64 the game's own as64/core also overrides the base game
    const nm = lc(path.basename(mod)), mine = info.filter(x => x.code !== 'CONFLICT_FILE_OVERRIDES' && lc(x.msg).includes(nm)), own = new Set(mine.map(x => x.file));
    info = mine.concat(info.filter(x => x.code === 'CONFLICT_FILE_OVERRIDES' && own.has(x.file)));
  }
  const unread = info.find(x => x.code === 'OVR_UNREADABLE');
  if (unread) return ctx.bad('the game would not load this mod, so nothing can be compared: ' + (rep.info || []).filter(x => /^VFS_/.test(x.code || '')).map(x => x.msg).slice(0, 3).join(' | '));
  const counts = {}; for (const x of info.concat(rep.findings || [])) counts[x.code] = (counts[x.code] || 0) + 1;
  const fileSet = new Set(info.map(x => x.file));
  const rows = (rep.findings || []).concat(info).map(x => ({ code: x.code, file: U.short(x.file, 140), line: x.line || 0, msg: U.short(x.msg, 220) }));
  const q = lc(args.q || ''), hit = q ? rows.filter(x => lc(x.file).includes(q) || lc(x.msg).includes(q)) : rows;
  const L = U.list(hit, args.limit || 30, 'pass q with a part of a file name or key');
  const t = [path.basename(mod) + ' against ' + gameWord(g) + (deps.length ? ' + ' + deps.join(', ') : '') + ' (' + via + '): ' + fileSet.size + ' file(s) differ' + (q ? ', ' + hit.length + ' row(s) match "' + args.q + '"' : '') + '.',
    Object.keys(counts).length ? 'By kind: ' + Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => k + ' ' + n).join(', ') : 'No change against the game was found.',
    ...L.rows.map(x => '- ' + x.file + (x.line ? ':' + x.line : '') + ' ' + x.code + ': ' + x.msg), L.more ? '(' + L.more + ' more rows; ' + L.hint + ')' : null,
    tool === 'conflicts' && !args.keys ? 'Each file lists its first keys only; keys: true lists every key.' : null];
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), tool, files: fileSet.size, counts, rows: L.rows, total: L.total, more: L.more } };
}

// ---------- mods together ----------
function modsArgs(args, ctx, g) {
  const mods = U.names(ctx, args.mods, 'mods'), dirs = (Array.isArray(args.mod_dirs) ? args.mod_dirs : args.mod_dirs ? [args.mod_dirs] : []).map(d => U.dirArg(ctx, d, 'mod_dirs'));
  if (mods.length + dirs.length < 2) throw ctx.refusal('name at least two mods: mods = folder names in <game>/mods (load order), mod_dirs = full paths of mod folders elsewhere (loaded last)');
  for (const d of dirs) if (d.includes(',')) throw ctx.refusal('a mod folder path may not hold a comma: ' + d);
  const argv = ['--game', U.need(ctx, g), '--mods', mods.join(','), ...U.exe(g)];
  for (const d of dirs) argv.push('--mod-dir', d);
  return { mods, dirs, argv };
}
async function modsClash(args, ctx) {
  const g = ctx.game(args), a = modsArgs(args, ctx, g), argv = a.argv.concat(['--format', 'json']);
  if (args.file) argv.push('--file', ctx.name(args.file, 'file'));
  const r = await run(ctx, 'conflicts', argv, { timeout: 30 * 60000, max: 4000000 });
  const bad = failed(ctx, r, 'conflicts') || usage(ctx, r, 'conflicts'); if (bad) return bad;
  const rep = U.reportOf(r.stdout);
  if (!rep) return ctx.bad('conflicts gave no report: ' + U.tail(r.text, 4).join(' '));
  const sum = U.sumReport(rep, args.limit || 30);
  const dropped = (rep.info || []).filter(x => /^VFS_MOD_|^MOD_/.test(x.code || '')).map(x => U.short(x.msg, 200)).slice(0, 6);
  const over = (rep.info || []).filter(x => /^CONFLICT_/.test(x.code || '')).length;
  const t = ['Mods ' + a.mods.concat(a.dirs.map(d => path.basename(d))).join(' -> ') + ' on ' + gameWord(g) + ': ' + (sum.total ? sum.total + ' clash(es) between the mods' : 'no clash between the mods') + ', ' + over + ' plain override row(s) of the game.',
    ...dropped.map(x => '! ' + x),
    sum.total ? 'By kind: ' + Object.entries(sum.counts).map(([k, n]) => k + ' ' + n).join(', ') : null,
    ...sum.findings.map(f => '- ' + f.file + (f.line ? ':' + f.line : '') + ' ' + f.code + ': ' + f.msg), sum.more ? '(' + sum.more + ' more; pass file: a path pattern such as resource/set/** to narrow)' : null,
    sum.total ? 'The last mod in the order wins each clash. mow_mods_patch plans a patch mod that keeps both sides.' : null];
  return { text: lines(t), data: { game: g.id, order: a.mods, modDirs: a.dirs.map(fwd), clashes: sum, overrides: over, dropped } };
}
async function modsPatch(args, ctx) {
  const g = ctx.game(args), a = modsArgs(args, ctx, g), out = U.dirArg(ctx, args.out, 'out', false);
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(out);
  const argv = [writing ? 'write' : 'plan'].concat(a.argv, ['--out', out, '--json']);
  if (args.name) argv.push('--name', ctx.name(args.name, 'name'));
  const r = await run(ctx, 'conflicts', argv, { script: 'patchmod.js', timeout: 30 * 60000, max: 4000000 });
  const bad = failed(ctx, r, 'patchmod') || usage(ctx, r, 'patchmod'); if (bad) return bad;
  let j = null; { const s = String(r.stdout), i = s.indexOf('{'); if (i >= 0) { try { j = JSON.parse(s.slice(i)); } catch (e) { j = null; } } }
  if (!j) return ctx.bad('patchmod gave no report: ' + U.tail(r.text, 4).join(' '));
  const files = j.files || j.rows || [], cant = j.cant || [];
  const row = x => U.short((x.key || x.file || '') + ': ' + (x.what || x.mode || ''), 240);
  const L = U.list(files.map(row), args.limit || 30), C = U.list(cant.map(x => U.short((x.key || x.file || '') + ': ' + (x.why || x.what || x.k || ''), 240)), 15);
  const choices = files.reduce((n, x) => n + ((x.choices && x.choices.length) || 0), 0);
  const t = [(writing ? 'Wrote the patch mod ' : 'Plan for the patch mod ') + fwd(out) + ' (load it last, after ' + a.mods.concat(a.dirs.map(d => path.basename(d))).join(' and ') + '): ' + L.total + ' merged file(s), ' + C.total + ' that could not be merged' + (choices ? ', ' + choices + ' value(s) both mods changed (the last mod\'s value is kept)' : '') + '.',
    ...L.rows.map(x => '- ' + x), L.more ? '(' + L.more + ' more)' : null, C.total ? 'Not merged:' : null, ...C.rows.map(x => '- ' + x),
    g.kind === 'goh' ? 'Gates of Hell: this patch-mod path has never been run on a GoH mod set [T]; read the plan before writing.' : null, 'Not run in game.', writing ? null : previewNote(ctx, out)];
  return { text: lines(t), data: { game: g.id, out: fwd(out), written: writing, files: L, cant: C, choices, exit: r.code } };
}

// ---------- units ----------
const modFor = (ctx, args) => (args.mod ? U.dirArg(ctx, args.mod, 'mod') : undefined);
const unitLine = u => u.id + (u.name ? ' = ' + u.name : '') + '  [' + [u.army, u.period, u.kind].filter(Boolean).join(' ') + ']' + (u.cost != null ? '  cost ' + u.cost + (u.res && u.res !== 'mp' ? ' ' + u.res : '') : '') + (u.buyable ? '' : '  (not in the buy menu)') + (u.mod ? '  (from the mod)' : '');
async function unitFind(args, ctx) {
  const g = ctx.game(args), mod = modFor(ctx, args), n = Math.min(Math.max(args.limit || 25, 1), 100);
  const r = await units.call(ctx, g, 'search', { mod, q: String(args.q || ''), kind: args.kind || undefined, army: args.army || undefined, all: args.all === true, limit: n });
  const t = [r.total + ' unit(s) match "' + (args.q || '') + '" in ' + gameWord(g) + (mod ? ' + ' + path.basename(mod) : '') + (r.total > r.results.length ? ', first ' + r.results.length + ' shown (add army, kind or more letters)' : '') + '.',
    ...r.results.map(u => '- ' + unitLine(u)),
    r.didYouMean && r.didYouMean.length ? 'Did you mean: ' + r.didYouMean.map(x => x.id + (x.name && x.name !== x.id ? ' (' + x.name + ')' : '')).join(', ') : null,
    !r.total && !args.all ? 'Only buy-menu units are searched; all: true searches every unit of the game.' : null,
    g.kind === 'goh' && r.results.some(u => u.card) ? 'GoH: one id has a card per period; pass its card value to mow_unit_stats / mow_unit_change.' : null];
  return { text: lines(t), data: { game: g.id, total: r.total, units: r.results.map(u => U.compact(u, { arr: 6 })), didYouMean: r.didYouMean || [], armies: r.armies || [] } };
}
const STAT_KEYS = ['id', 'name', 'army', 'period', 'card', 'kind', 'buyable', 'cost', 'res', 'level', 'charge', 'fore', 'unlock', 'armor', 'armorMacro', 'gun', 'speed', 'members', 'brings', 'many', 'def', 'cardFile', 'nameKey', 'group', 'button', 'tags', 'vanilla', 'isNew', 'cardMod', 'defMod', 'where'];
async function unitStats(args, ctx) {
  const g = ctx.game(args), mod = modFor(ctx, args), id = ctx.name(args.id, 'id');
  const show = new Set(Array.isArray(args.show) && args.show.length ? args.show : ['stats']);
  const body = { mod, id, card: args.card || undefined };
  const s = await units.call(ctx, g, 'stats', body);
  const data = { game: g.id }, t = [];
  const d = {}; for (const k of STAT_KEYS) if (s[k] !== undefined && s[k] !== null && s[k] !== '') d[k] = s[k];
  data.unit = U.compact(d, { arr: 12, str: 200 });
  t.push(unitLine(Object.assign({}, s, { mod: !!(s.cardMod || s.defMod) })));
  if (s.buyable) {
    const u = s.unlock || {};
    t.push('Buy: cost ' + s.cost + ' ' + (s.res || 'mp') + (g.kind === 'goh' ? '' : ', rank ' + (s.level == null ? '-' : s.level)) + (u.charge != null ? ', cooldown ' + u.charge + ' s' + (u.factor && u.factor !== 1 ? ' x' + u.factor : '') : '') + (u.startWait != null && g.kind !== 'goh' ? ', wait at the start ' + u.startWait + ' s' : ''));
  }
  if (s.armor) t.push('Armour: ' + (typeof s.armor === 'string' ? s.armor : JSON.stringify(s.armor)));
  if (s.gun) t.push('Main gun: ' + s.gun.weapon + (s.gun.pen != null ? ', penetration ' + s.gun.pen + ' mm at 100 m' : '') + (s.gun.damage != null ? ', damage ' + s.gun.damage : '') + (s.gun.reload != null ? ', reload ' + s.gun.reload + ' s' : '') + (s.gun.range ? ', range ' + s.gun.range : ''));
  if (s.brings && s.brings.parts) t.push('Brings: ' + s.brings.parts.map(p => p.n + ' x ' + (p.name || p.id)).join(', '));
  else if (s.members && s.members.length) t.push('Members: ' + s.members.map(m => (m.n || 1) + ' x ' + m.breed).join(', '));
  if (s.vanilla && mod) { const v = s.vanilla; if (v.cost !== s.cost || v.name !== s.name) t.push('In the game without the mod: cost ' + v.cost + (v.name && v.name !== s.name ? ', name ' + v.name : '')); }
  if (s.isNew && mod) t.push('New in this mod (the game has no such unit).');
  if (s.def) t.push('File: ' + s.def + (s.cardFile ? ', card in ' + s.cardFile : ''));
  if (show.has('equipment')) {
    const k = await units.call(ctx, g, 'kit', Object.assign({ showNames: true }, body, args.breed ? { breed: args.breed } : {}));
    data.equipment = U.compact(k, { arr: 30, str: 160 });
    const kit = k.kit || k.box || null, items = (kit && kit.items) || k.items || [];
    if (k.soldiers && k.soldiers.length && !items.length) t.push('Equipment: this is a group; pass breed with one of: ' + k.soldiers.map(x => x.id).slice(0, 12).join(', '));
    else t.push('Carries: ' + (items.length ? items.slice(0, 25).map(i => (i.max != null ? i.max + ' x ' : '') + (i.name || i.item) + (i.inHands ? ' (in hands)' : '')).join(', ') + (items.length > 25 ? ' ... ' + (items.length - 25) + ' more' : '') : 'nothing listed'));
    if (k.slots && k.slots.length) t.push('Weapon slots: ' + k.slots.slice(0, 12).map(x => (x.slot || x.place || x.name) + '=' + (x.item || x.weapon || '-')).join(', '));
  }
  if (show.has('look')) {
    const k = await units.call(ctx, g, 'look', Object.assign({}, body, args.breed ? { breed: args.breed } : {}));
    data.look = U.compact(k, { arr: 30, str: 160 });
    if (k.soldiers) t.push('Look: this is a group; pass breed with one of: ' + k.soldiers.map(x => x.id).slice(0, 12).join(', '));
    else t.push('Look: ' + (k.skin ? 'skin ' + (k.skin.skin || k.skin) + ', ' : '') + 'texture variant ' + (k.texmod || 'none') + (k.variants && k.variants.length ? ' (the model has: ' + k.variants.map(v => v.name || v).slice(0, 12).join(', ') + ')' : ' (the model has no other variant)'));
  }
  return { text: lines(t), data };
}
const FIELD = { price: 'cost', cost: 'cost', rank: 'level', level: 'level', cooldown: 'charge', charge: 'charge', unlock: 'charge', headstart: 'fore', fore: 'fore', name: 'name', armor: 'armor', armour: 'armor',
  squad: 'squad', equipment: 'equipment', kit: 'equipment', skin: 'skin', texture: 'texmod', texmod: 'texmod' };
async function unitChange(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod');
  const what = FIELD[lc(args.what)];
  if (!what) return ctx.bad('what must be one of: price, rank, cooldown, headstart, name, armour, squad, equipment, skin, texture');
  const body = { mod, card: args.card || undefined };
  if (args.id) body.id = ctx.name(args.id, 'id');
  if (args.breed) body.breed = ctx.name(args.breed, 'breed');
  if (args.entity) body.entity = ctx.name(args.entity, 'entity');
  let route = 'change';
  if (['cost', 'level', 'charge', 'fore', 'name', 'armor'].includes(what)) {
    if (!body.id) return ctx.bad('id is needed: the unit id as mow_unit_find shows it');
    if (args.value == null || String(args.value).trim() === '') return ctx.bad('value is needed: the new ' + args.what);
    Object.assign(body, { field: what, value: String(args.value), part: args.part || undefined });
  } else if (what === 'squad') {
    if (!body.id) return ctx.bad('id is needed: the squad id as mow_unit_find shows it');
    route = 'recipe'; Object.assign(body, { recipe: 'squad', breed: args.breed || args.part || '', count: Number(args.value) });
  } else if (what === 'equipment') {
    if (!body.id && !body.breed && !body.entity) return ctx.bad('name the soldier (id or breed such as rus/rifle) or the vehicle (id or entity)');
    route = 'kit/set';
    Object.assign(body, { add: Array.isArray(args.add) ? args.add : undefined, del: Array.isArray(args.del) ? args.del : undefined, inHands: args.in_hands || undefined, slots: args.slots && typeof args.slots === 'object' ? args.slots : undefined });
    if (!body.add && !body.del && !body.inHands && !body.slots) return ctx.bad('equipment: give add [{item, count?, filled?}], del [item], in_hands or slots {slot: item}. mow_unit_stats with show: ["equipment"] lists what the unit carries.');
  } else {
    if (!body.id && !body.breed && !body.entity) return ctx.bad('name the soldier (id or breed such as rus/rifle) or the vehicle (id or entity)');
    route = 'look/set';
    if (what === 'skin') body.skin = String(args.value == null ? '' : args.value); else body.texmod = args.value == null || args.value === '' ? 'none' : String(args.value);
    if (args.texmod != null) body.texmod = String(args.texmod);
  }
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(mod);
  // always a plan first: it names every file, and each one is checked before the write
  let res = await units.call(ctx, g, route, Object.assign({}, body, { write: false }));
  const planErr = (res.errors || []).length;
  if (writing && !planErr) {
    for (const f of res.files || []) ctx.guard.write(path.join(mod, ...String(f.file).split('/')));
    for (const n of res.names || []) if (n.file) ctx.guard.write(path.join(mod, ...(n.pot ? String(n.file).split('/') : ['localization', n.file])));
    res = await units.call(ctx, g, route, Object.assign({}, body, { write: true }));
  }
  const rows = (res.rows || []).map(r => ({ field: r.field, part: r.part, old: r.old, new: r.new }));
  const files = (res.files || []).map(f => ({ file: f.file, isNew: !!f.isNew, copiedFromGame: !!f.copiedFromGame, lines: (f.lines || []).slice(0, 8).map(l => U.short(l, 220)), more: (f.more || 0) + Math.max(0, (f.lines || []).length - 8) }));
  const un = res.unit || {};
  const t = [(res.written ? 'Changed ' : planErr ? 'Cannot change ' : 'Would change ') + (un.name || un.id || args.id || args.breed || args.entity) + ' in ' + path.basename(mod) + ' (' + gameWord(g) + '):',
    ...rows.map(r => '- ' + r.field + (r.part ? ' ' + r.part : '') + ': ' + r.old + ' -> ' + r.new),
    ...(res.errors || []).map(e => '! ' + (e.msg || e.code)), ...(res.warnings || []).slice(0, 6).map(e => 'warning: ' + (e.msg || e.code)),
    files.length ? 'Files: ' + files.map(f => f.file + (f.copiedFromGame ? ' (a mod copy of the game file)' : f.isNew ? ' (new)' : '')).join(', ') : null,
    (res.names || []).length ? 'Text: ' + res.names.map(n => n.key + ' in ' + n.file).join(', ') : null,
    res.hasModInfo === false ? 'This folder has no mod.info yet: the game will not list it (mow_mod_new makes one in a new folder).' : null,
    res.written ? 'Written. Check it in game before calling it done; mow_mod_check reads the files.' : planErr ? null : (writing ? 'Nothing was written.' : previewNote(ctx, mod))];
  return { text: lines(t), isError: false, data: { game: g.id, mod: fwd(mod), what, written: !!res.written, unit: U.compact(un), rows, files, names: (res.names || []).map(n => ({ key: n.key, file: n.file, text: n.text })), errors: (res.errors || []).map(e => ({ code: e.code, msg: e.msg })), warnings: (res.warnings || []).slice(0, 10).map(e => ({ code: e.code, msg: e.msg })) } };
}

// ---------- gen ops ----------
const GEN_NO = new Set(['mod']);
async function modGen(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), mod = U.dirArg(ctx, args.mod, 'mod');
  if (!Array.isArray(args.ops) || !args.ops.length) return ctx.bad('ops is needed: a list of gen ops, each {op: "card" | "set" | "armor" | "text" | "roster" | "squad" | "breed" | "kit" | "clone" | "gun" | "shell" | "item" | "macro" | "preset" | ..., fields}. The fields of every op: tools/gen/README.md and the head of tools/gen/gen.js.');
  if (args.ops.length > 40) return ctx.bad('at most 40 ops in one call');
  const L = units.lib(), G = L.gen(), OPS = G.genMain.OPS, writing = ctx.guard.writing;
  for (const [i, s] of args.ops.entries()) {
    if (!s || typeof s !== 'object' || typeof s.op !== 'string') return ctx.bad('ops[' + i + '] must be an object with an op name');
    if (GEN_NO.has(s.op)) return ctx.bad('ops[' + i + ']: the mod op is not run here; make the folder with mow_mod_new');
    if (!OPS[s.op] || typeof G.ops[OPS[s.op]] !== 'function') return ctx.bad('ops[' + i + ']: unknown op "' + s.op + '". Known: ' + Object.keys(OPS).filter(k => !GEN_NO.has(k)).join(' '));
  }
  if (writing) ctx.guard.write(mod);
  if (g.kind === 'goh' && writing) { const why = require('../../lib/writeguard').refuseWrite(mod, { game }); if (why) return ctx.bad(String(why).replace(/^refused:\s*/, '')); }
  const once = plan => {
    const c = L.newCtx(game, mod, plan, g.id), log = [];
    args.ops.forEach((s, i) => {
      const n0 = c.rep.count;
      try { G.ops[OPS[s.op]](c, s, s.op === 'set' ? U.tmpDir() : { name: slugOf(mod) }); }
      catch (e) { c.err('GEN_CRASH', 'ops[' + i + '] ' + s.op + ': ' + String(e && e.message || e).split('\n')[0], 'op' + i); }
      log.push({ i, op: s.op, status: c.rep.count > n0 ? 'refused' : 'ok' });
    });
    return { c, log };
  };
  let p = once(true), res = L.finish(p.c, game, mod, { write: false }, { rows: [], names: [] });
  const planErr = res.errors.length;
  if (writing && !planErr) {
    for (const f of res.files || []) ctx.guard.write(path.join(mod, ...String(f.file).split('/')));
    p = once(false); res = L.finish(p.c, game, mod, { write: true }, { rows: [], names: [] });
  }
  const files = (res.files || []).map(f => ({ file: f.file, isNew: !!f.isNew, copiedFromGame: !!f.copiedFromGame, lines: (f.lines || []).slice(0, 6).map(l => U.short(l, 200)), more: (f.more || 0) + Math.max(0, (f.lines || []).length - 6) }));
  const FL = U.list(files, 25);
  const t = [(res.written ? 'Ran ' : planErr ? 'Refused: ' : 'Plan of ') + args.ops.length + ' op(s) on ' + path.basename(mod) + ' (' + gameWord(g) + '): ' + p.log.map(x => x.op + ' ' + x.status).join(', ') + '.',
    ...res.errors.slice(0, 12).map(e => '! ' + e.code + ': ' + U.short(e.raw || e.msg, 260)), ...res.warnings.slice(0, 8).map(e => 'warning ' + e.code + ': ' + U.short(e.raw || e.msg, 220)),
    FL.total ? 'Files (' + FL.total + '): ' + FL.rows.map(f => f.file + (f.copiedFromGame ? ' (mod copy of the game file)' : f.isNew ? ' (new)' : '')).join(', ') + (FL.more ? ' ... ' + FL.more + ' more' : '') : 'No file changes.',
    (res.names || []).length ? 'Text: ' + res.names.slice(0, 10).map(n => n.key + ' in ' + n.file).join(', ') : null,
    res.written ? 'Written. Not run in game: mow_mod_check next, then test it in game.' : planErr ? 'Nothing was written (an op that is refused stops the whole call).' : previewNote(ctx, mod)];
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), written: !!res.written, ops: p.log, files: FL, names: (res.names || []).slice(0, 20).map(n => ({ key: n.key, file: n.file })), errors: res.errors.slice(0, 20).map(e => ({ code: e.code, msg: U.short(e.raw || e.msg, 300) })), warnings: res.warnings.slice(0, 20).map(e => ({ code: e.code, msg: U.short(e.raw || e.msg, 300) })), info: (res.info || []).slice(0, 12).map(e => ({ code: e.code, msg: U.short(e.msg, 200) })) } };
}

// ---------- text ----------
const unTsv = s => String(s).replace(/\\(\\|t|n|r)/g, (m, c) => (c === 't' ? '\t' : c === 'n' ? '\n' : c === 'r' ? '\r' : '\\'));
function readTsv(file) {
  const out = [];
  let t = ''; try { t = fs.readFileSync(file, 'utf8'); } catch (e) { return out; }
  const ls = t.split(/\r?\n/);
  for (let i = 1; i < ls.length; i++) { if (!ls[i]) continue; const c = ls[i].split('\t'); out.push({ file: c[0] || '', key: c[1] || '', text: unTsv(c[2] || ''), tr: unTsv(c[3] || '') }); }
  return out;
}
async function textRows(ctx, g, mod, lang) {
  // the game's own texts: one extract per game folder kept in the scratch folder (the extract of the AS2 install takes about 20 s)
  const src = mod || U.need(ctx, g);
  let stamp = ''; if (!mod) for (const n of ['localization.pak', 'localizations', 'resource']) { try { stamp += fs.statSync(path.join(src, n)).mtimeMs + '|'; } catch (e) { stamp += '-|'; } }
  const keep = !mod ? path.join(U.tmpDir(), 'text-' + g.id + '-' + U.sha(lc(src) + '|' + (lang || '') + '|' + stamp) + '.tsv') : null;
  if (keep && U.isFile(keep)) return { rows: readTsv(keep), cached: true };
  const f = keep ? keep + '.' + process.pid + '.part' : U.tmpFile('text', '.tsv');
  const argv = ['extract', src, '--out', f]; if (lang) argv.push('--lang', ctx.name(lang, 'lang'));
  const r = await run(ctx, 'lng', argv, { timeout: 20 * 60000 });
  if (r.isError || !U.isFile(f)) { try { fs.rmSync(f, { force: true }); } catch (e) { /* none */ } throw ctx.refusal('the texts could not be read: ' + U.tail(r.text, 3).join(' ')); }
  let rows = readTsv(f);
  if (keep) { try { fs.renameSync(f, keep); } catch (e) { try { fs.rmSync(f, { force: true }); } catch (e2) { /* none */ } } }
  else { try { fs.rmSync(f, { force: true }); } catch (e) { /* none */ } }
  return { rows, cached: false };
}
async function textFind(args, ctx) {
  const g = ctx.game(args), mod = modFor(ctx, args);
  const q = lc(args.q || ''), key = lc(args.key || '');
  if (!q && !key) return ctx.bad('give q (words in the text or the key) or key (the start of a key such as desc/entity/t34)');
  let { rows } = await textRows(ctx, g, mod, args.lang);
  if (!mod) rows = rows.filter(r => !/^mods\//i.test(r.file));   // the game's own text only, not the mods installed in it
  const words = q.split(/\s+/).filter(Boolean);
  const hit = rows.filter(r => (!key || lc(r.key).startsWith(key)) && (!words.length || words.every(w => lc(r.key).includes(w) || lc(r.text).includes(w) || lc(r.tr).includes(w))));
  const L = U.list(hit.map(r => ({ key: r.key, text: U.short(r.tr || r.text, 200), file: r.file })), args.limit || 30, 'add words to q, or pass key with the start of the key');
  const t = [hit.length + ' text(s) match in ' + (mod ? path.basename(mod) : gameWord(g)) + ' (' + rows.length + ' keys read)' + (L.more ? ', first ' + L.rows.length + ' shown' : '') + '.',
    ...L.rows.map(r => '- ' + r.key + ' = "' + r.text.replace(/\n/g, '\\n') + '"  (' + r.file + ')'), L.more ? '(' + L.more + ' more; ' + L.hint + ')' : null,
    g.kind === 'goh' ? 'GoH: texts are .pot/.po entries (key = msgctxt) under localizations/<language>/; lang picks one language folder.' : 'AS2 and AS64 read one set of .lng files; a key is <file name>/<names>, the file name dropped for "#" files.'];
  return { text: lines(t), data: { game: g.id, mod: mod ? fwd(mod) : null, total: hit.length, rows: L.rows, more: L.more } };
}
async function textSet(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod'), key = ctx.name(args.key, 'key');
  if (typeof args.text !== 'string') return ctx.bad('text is needed (the new text; an empty text is allowed)');
  const goh = g.kind === 'goh', loc = goh ? (args.loc ? ctx.name(args.loc, 'loc') : 'default') : null;
  let file = args.file ? ctx.name(args.file, 'file') : (goh ? slugOf(mod) + (loc === 'default' || loc === 'en' ? '.pot' : '.po') : '#' + slugOf(mod) + '.lng');
  if (/[\\/]|\.\./.test(file)) return ctx.bad('file is a file name only (for example #mymod.lng or desc.lng), not a path');
  if (!/\.(lng|pot|po)$/i.test(file)) return ctx.bad('file must end in .lng' + (goh ? ', .pot or .po' : ''));
  if (!goh && /\.(pot|po)$/i.test(file)) return { na: '.pot and .po text files are read by Gates of Hell only; ' + gameWord(g) + ' reads .lng' };
  const target = goh ? path.join(mod, 'localizations', loc, 'interface', 'text', file) : path.join(mod, 'localization', file);
  const writing = ctx.guard.writing;
  if (writing) { ctx.guard.write(mod); ctx.guard.write(target); }
  const argv = [mod, '--file', file, '--key', key, '--text', args.text, ...U.exe(g)];
  if (g.dir) argv.push('--game', g.dir);
  if (goh) argv.push('--loc', loc);
  if (args.force === true) argv.push('--force');
  if (!writing) argv.push('--dry-run');
  const r = await run(ctx, 'lng-add', argv);
  const bad = failed(ctx, r, 'lng-add') || usage(ctx, r, 'lng-add'); if (bad) return bad;
  const out = U.tail(r.stdout, 8), exists = /LNG_KEY_EXISTS/.test(r.text);
  if (r.code !== 0) return { text: lines(['The text was not ' + (writing ? 'written' : 'accepted') + ':', ...out.map(l => '- ' + U.short(l, 300)), exists ? 'The key is already there; force: true replaces its text.' : null]), isError: !exists, data: { game: g.id, written: false, key, file: fwd(path.relative(mod, target)), exists } };
  return { text: lines([(writing ? 'Wrote ' : 'Would write ') + key + ' = "' + U.short(args.text, 120) + '" in ' + fwd(path.relative(mod, target)) + ' of ' + path.basename(mod) + '.',
    ...out.filter(l => /WARN_|LNG_|shadow/i.test(l)).map(l => 'note: ' + U.short(l, 300)),
    goh ? 'GoH: .pot text in the default (or en) folder, .po in another language folder.' : 'A "#" file adds keys; a mod file with the name of a game file (desc.lng) replaces that whole file.', writing ? null : previewNote(ctx, target)]),
    data: { game: g.id, written: writing, key, file: fwd(path.relative(mod, target)) } };
}

// ---------- maps and missions ----------
function mapKey(ctx, v) {
  ctx.name(v, 'map');
  let k = lc(fwd(v.trim())).replace(/^\/+|\/+$/g, '').replace(/^resource\//, '');
  if (!/^map\//.test(k)) k = /^(multi|single)\//.test(k) ? 'map/' + k : 'map/multi/' + k;
  if (!/^map\/(multi|single)\/[a-z0-9_\-./]+$/.test(k) || k.includes('..')) throw ctx.refusal('not a map name: ' + v + ' (for example 1v1_argentan, multi/2v2_bazerville or map/single/...)');
  return k;
}
async function mapList(ctx, g, args) {
  const argv = ['--game', U.need(ctx, g), '--list', ...U.exe(g)];
  const r = await run(ctx, 'mission-clone', argv, { timeout: 15 * 60000, max: 2000000 });
  const bad = failed(ctx, r, 'the map list') || usage(ctx, r, 'the map list'); if (bad) return { bad };
  const rows = [];
  for (const l of String(r.stdout).split(/\r?\n/)) { const m = /^(map\/[^:]+):\s*(.*?)(?:\s+\[mod:\s*(.*)\])?\s*$/.exec(l); if (m) rows.push({ map: m[1], modes: m[2].split(/\s+/).filter(Boolean), mod: m[3] || null }); }
  return { rows };
}
function missionsLib() { return require('../../gui/ext/missions')._t; }
async function mapInfo(args, ctx) {
  const g = ctx.game(args);
  if (!args.map) {
    const r = await mapList(ctx, g, args); if (r.bad) return r.bad;
    const q = lc(args.q || ''), mode = lc(args.mode || '');
    const hit = r.rows.filter(x => (!q || x.map.includes(q)) && (!mode || x.modes.includes(mode)));
    const L = U.list(hit, args.limit || 40, 'pass q (part of the name, such as 2v2) or mode');
    return { text: lines([hit.length + ' multiplayer map(s) in ' + gameWord(g) + ' and its enabled mods' + (L.more ? ', first ' + L.rows.length + ' shown (' + L.hint + ')' : '') + '.',
      ...L.rows.map(x => '- ' + x.map.replace(/^map\//, '') + ': ' + x.modes.join(' ') + (x.mod ? '  [mod ' + x.mod + ']' : ''))]), data: { game: g.id, total: hit.length, maps: L.rows, more: L.more } };
  }
  const key = mapKey(ctx, args.map), game = U.need(ctx, g), mod = modFor(ctx, args);
  const M = missionsLib();
  let f; try { f = M.factsOf(game, mod || '', key, U.names(ctx, args.mods, 'mods'), null, { id: g.id, exe: g.exe, kind: g.kind, dir: game }); } catch (e) { return ctx.bad('the map could not be read: ' + String(e.message).split('\n')[0]); }
  if (!f.modes || !f.modes.length) return ctx.bad('no map "' + key + '" with a mission was found in ' + gameWord(g) + (mod ? ' or ' + path.basename(mod) : '') + '. mow_map_info without map lists the maps; a map marked [mod name] comes from that mod: pass mods: [its folder name in <game>/mods].');
  const data = { game: g.id, map: key, facts: U.compact(f, { arr: 20 }) };
  const players = f.players != null ? f.players : (f.info && f.info.maxPlayers);
  const t = [key + (players ? ': up to ' + players + ' players' : '') + ', ' + f.modes.length + ' mode(s): ' + f.modes.map(m => m.mode).join(' ') + '.',
    ...f.modes.map(m => '- ' + m.mode + ': ' + m.flags + ' flag(s), ' + (m.spawns == null ? '?' : m.spawns) + ' start point(s)' + (m.players ? ', ' + m.players + ' players' : '') + (m.bots == null ? '' : m.bots ? ', bots on' : ', bots off') + (m.own ? '  (this mod\'s own file)' : '')),
    ...(f.warn || []).map(w => 'warning: ' + w.k.replace(/^missions\.w\./, '') + ' ' + JSON.stringify(w.p)),
    g.kind === 'goh' ? 'GoH: no map.info; players come from <mode>.info, flags are map points.' : null];
  if (args.view === true) {
    const argv = ['--game', game, ...U.exe(g), '--map', key.replace(/^map\//, ''), '--width', String(Math.min(Math.max(args.width || 60, 20), 120)), '--entities', '--legend'];
    const r = await run(ctx, 'mapview', argv, { timeout: 5 * 60000 });
    if (!r.isError && r.code === 0) { data.view = ctx.cut(r.stdout, 12000); t.push('', data.view); } else t.push('The map picture could not be made: ' + U.tail(r.text, 2).join(' '));
  }
  return { text: lines(t), data };
}
const MI_COUNT = { entities: /\{\s*Entity\s+"/gi, humans: /\{\s*Human\s+"/gi, triggers: /\{\s*trigger\s+"/gi, zones: /\{\s*zone\s+"/gi, waypoints: /\{\s*waypoint\b/gi, squads: /\{\s*Squad\b/gi, players: /\{\s*Player\s/gi };
async function missionInfo(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), key = mapKey(ctx, args.map), mod = modFor(ctx, args);
  const M = missionsLib(), gg = { id: g.id, exe: g.exe, kind: g.kind, dir: game }, rd = M.readerOf(gg), mmods = U.names(ctx, args.mods, 'mods');
  let modes; try { modes = rd.modesOf(mod || '', key, mmods); } catch (e) { return ctx.bad('the map could not be read: ' + String(e.message).split('\n')[0]); }
  if (!modes.length) return ctx.bad('no mission file (<mode>.mi) was found for "' + key + '" in ' + gameWord(g) + (mod ? ' or ' + path.basename(mod) : '') + '. mow_map_info without map lists the maps.');
  const want = args.mode ? lc(ctx.name(args.mode, 'mode')) : null;
  if (want && !modes.includes(want)) return ctx.bad('the map has no mode "' + want + '". It has: ' + modes.join(' '));
  const rows = [];
  for (const m of want ? [want] : modes) {
    const b = rd.readKey(mod || '', 'resource/' + key + '/' + m + '.mi', mmods), s = b ? b.toString('latin1').replace(/^\s*;.*$/gm, '') : '';
    const row = { mode: m, bytes: b ? b.length : 0 };
    for (const k of Object.keys(MI_COUNT)) row[k] = (s.match(MI_COUNT[k]) || []).length;
    row.flags = g.kind === 'goh' ? (s.match(/\{\s*visor\s+"?MapPoint"?\s*\}/gi) || []).length : (s.match(/"flag_point[^"]*"/gi) || []).length;
    if (want) { const defs = new Map(); for (const x of s.matchAll(/\{\s*(?:Entity|Human)\s+"([^"]+)"/gi)) defs.set(lc(x[1]), (defs.get(lc(x[1])) || 0) + 1); row.top = [...defs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => n + ' x' + c); row.kinds = defs.size; }
    rows.push(row);
  }
  const t = [key + ' in ' + gameWord(g) + (mod ? ' + ' + path.basename(mod) : '') + ': ' + rows.length + ' mission(s).',
    ...rows.map(r => '- ' + r.mode + '.mi: ' + r.entities + ' objects, ' + r.humans + ' soldiers, ' + r.flags + ' flags, ' + r.triggers + ' triggers, ' + r.zones + ' zones, ' + r.waypoints + ' waypoints' + (r.top ? '. Most placed: ' + r.top.join(', ') : ''))];
  const data = { game: g.id, map: key, missions: rows };
  if (mod) {
    const inst = g.kind === 'goh' ? null : installedAs(mod, game);
    const argv = ['--game', game, '--map', key.replace(/^map\//, ''), '--format', 'json', ...U.exe(g)];
    if (inst && inst.how !== 'path') argv.push('--mods', lc(path.basename(inst.dir))); else { if (mod.includes(',')) return ctx.bad('the mod folder path may not hold a comma'); argv.push('--mod-dir', mod); }
    const r = await run(ctx, 'misdiff', argv, { timeout: 20 * 60000, max: 4000000 });
    const rep = r.isError ? null : U.reportOf(r.stdout);
    if (!rep) t.push('What the mod changed could not be read: ' + U.tail(r.text, 2).join(' '));
    else {
      const ch = (rep.info || []).filter(x => /^MIS_DIFF_/.test(x.code || '')), counts = {}; for (const x of ch) counts[x.code.replace(/^MIS_DIFF_/, '')] = (counts[x.code.replace(/^MIS_DIFF_/, '')] || 0) + 1;
      const L = U.list(ch.map(x => ({ code: x.code.replace(/^MIS_DIFF_/, ''), file: U.short(x.file, 120), msg: U.short(x.msg, 200) })), args.limit || 20, 'pass mode to read one mission');
      t.push(ch.length ? 'The mod changes this map: ' + Object.entries(counts).map(([k, n]) => k + ' ' + n).join(', ') + '.' : 'The mod changes nothing in this map\'s missions.', ...L.rows.map(x => '- ' + x.code + ' ' + x.file + ': ' + x.msg), L.more ? '(' + L.more + ' more)' : null,
        ...(rep.findings || []).slice(0, 6).map(x => 'warning ' + x.code + ': ' + U.short(x.msg, 220)));
      data.diff = { changes: ch.length, counts, rows: L.rows, more: L.more, warnings: (rep.findings || []).slice(0, 10).map(x => ({ code: x.code, msg: U.short(x.msg, 220) })) };
    }
  }
  return { text: lines(t), data };
}
async function mapClone(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), key = mapKey(ctx, args.map), out = U.dirArg(ctx, args.mod, 'mod', false);
  const name = ctx.name(args.name, 'name');
  if (!/^[A-Za-z0-9_]{1,40}$/.test(name)) return ctx.bad('name: letters, digits and _ only, at most 40');
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(out);
  const argv = ['--game', game, '--map', key, '--name', name, '--out', out, '--target', g.id];
  if (args.no_mission === true) argv.push('--no-mission');
  if (U.isFile(path.join(out, 'mod.info'))) argv.push('--no-modinfo');
  if (!writing) argv.push('--plan');
  const r = await run(ctx, 'map-clone', argv, { timeout: 20 * 60000 });
  const bad = failed(ctx, r, 'map-clone') || usage(ctx, r, 'map-clone'); if (bad) return bad;
  const out8 = U.tail(r.text, 14).map(l => U.short(l, 260));
  if (r.code !== 0) return ctx.bad('the map was not copied: ' + out8.slice(-4).join(' | '));
  return { text: lines([(writing ? 'Copied ' : 'Would copy ') + key + ' as ' + name + ' into ' + fwd(out) + ' (' + gameWord(g) + ').', ...out8.map(l => '  ' + l),
    g.kind === 'goh' ? 'GoH: the lobby name goes to a .pot of the mod; mod.info holds the GoH exe version.' : null, writing ? 'Not run in game.' : previewNote(ctx, out)]),
    data: { game: g.id, map: key, name: lc(name), mod: fwd(out), written: writing } };
}
async function modeAdd(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), key = mapKey(ctx, args.map), out = U.dirArg(ctx, args.mod, 'mod', false);
  const from = lc(ctx.name(args.from, 'from')), to = lc(ctx.name(args.to, 'to'));
  if (g.kind === 'goh' && /^(combat|frontline)$/.test(to)) return { na: 'Gates of Hell has no ' + to + ' mode of that form; its modes are battle_zones, frontlines and the others mow_map_info lists' };
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(out);
  const argv = ['--game', game, '--map', key, '--from', from, '--to', to, '--out', out, ...U.exe(g)];
  if (Number.isInteger(args.flags)) argv.push('--flags', String(args.flags));
  if (!writing) argv.push('--dry-run');
  const r = await run(ctx, 'mission-clone', argv, { timeout: 20 * 60000 });
  const bad = failed(ctx, r, 'mission-clone') || usage(ctx, r, 'mission-clone'); if (bad) return bad;
  const out8 = U.tail(r.text, 14).map(l => U.short(l, 260)), manual = /MC_NEEDS_MANUAL/.test(r.text);
  if (r.code !== 0 && !manual) return ctx.bad('the mode was not added: ' + out8.slice(-4).join(' | '));
  return { text: lines([(writing ? 'Added' : 'Would add') + ' the mode ' + to + ' to ' + key + ' from its ' + from + ' mission, in ' + fwd(out) + ' (' + gameWord(g) + ').', ...out8.map(l => '  ' + l),
    manual ? 'This pair is a plain copy: the flags and zones need hand work (MC_NEEDS_MANUAL).' : null, writing ? 'Not run in game.' : previewNote(ctx, out)]),
    data: { game: g.id, map: key, from, to, mod: fwd(out), written: writing, manual } };
}

// ---------- port ----------
function portArgs(args, ctx, g) {
  const mod = U.dirArg(ctx, args.mod, 'mod'), as2 = ctx.game({ game: 'as64' }).dir, goh = ctx.game({ game: 'goh' }).dir;
  const argv = [mod, '--to', g.id];
  if (args.from) { const f = ctx.name(args.from, 'from'); if (!GAMES.includes(f.split('@')[0])) throw ctx.refusal('from must be as64, mowas2 or goh (optionally as64@<build>)'); argv.push('--from', f); }
  if (as2) argv.push('--as2', as2);
  if (goh) argv.push('--goh', goh);
  return { mod, argv };
}
function portText(j, g, mod) {
  const grp = (rows, n) => (rows || []).slice(0, n).map(x => { const [name, o] = Array.isArray(x) ? x : [x.name || x.code || '', x]; const ex = (o && o.ex) || {}; return '- ' + (o && o.n != null ? o.n + ' x ' : '') + name + (ex.msg ? ': ' + U.short(ex.msg, 220) + (ex.file ? '  (e.g. ' + ex.file + ')' : '') : ''); });
  const cant = j.cant || [], review = j.review || [], auto = j.auto || [], hits = (j.warn && j.warn.hit) || [];
  return [path.basename(mod) + ': ' + (j.from || '?') + ' -> ' + gameWord(g) + ' (mod.info ' + (j.min || '-') + ' .. ' + (j.max || '-') + '). Read ' + ((j.inv && j.inv.loose) || 0) + ' loose file(s), ' + ((j.inv && j.inv.paks) || 0) + ' pak(s).',
    auto.length ? 'Would change by itself (' + auto.length + ' kind(s)):' : 'Nothing to change by itself.', ...grp(auto, 12),
    cant.length ? 'Cannot be converted (' + cant.length + '):' : null, ...grp(cant, 10),
    review.length ? 'Needs a look (' + review.length + '):' : null, ...grp(review, 10),
    hits.length ? hits.length + ' behaviour change(s) of the target game touch this mod\'s data.' : null];
}
async function portPlan(args, ctx) {
  const g = ctx.game(args), a = portArgs(args, ctx, g), f = U.tmpFile('port');
  const r = await run(ctx, 'upgrade', a.argv.concat(['--plan', '--json', f]), { timeout: 60 * 60000 });
  const j = U.readJson(f);
  const bad = failed(ctx, r, 'upgrade') || usage(ctx, r, 'upgrade'); if (bad) return bad;
  if (!j) return ctx.bad('the port plan gave no report: ' + U.tail(r.text, 4).join(' '));
  const t = portText(j, g, a.mod).concat(['Plan only: nothing was written and no game was run. mow_mod_upgrade writes the converted copy into a new folder.',
    j.from === g.id ? 'The mod is already for ' + gameWord(g) + ' by its mod.info; pass from to say otherwise.' : null]);
  return { text: lines(t), data: { game: g.id, mod: fwd(a.mod), from: j.from, to: j.to, range: [j.min, j.max], read: j.inv || null, codes: j.codes || {}, auto: (j.auto || []).length, cant: (j.cant || []).length, review: (j.review || []).length } };
}
async function portCopy(args, ctx) {
  const g = ctx.game(args), a = portArgs(args, ctx, g), out = U.dirArg(ctx, args.out, 'out', false), f = U.tmpFile('port');
  if (lc(out) === lc(a.mod) || lc(out).startsWith(lc(a.mod) + path.sep)) return ctx.bad('out must be a new folder, not the mod itself or a folder inside it: the source mod is never changed');
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(out);
  const argv = a.argv.concat(writing ? ['--out', out, '--no-link', '--json', f] : ['--plan', '--json', f]);
  const r = await run(ctx, 'upgrade', argv, { timeout: 90 * 60000 });
  const j = U.readJson(f);
  const bad = failed(ctx, r, 'upgrade') || usage(ctx, r, 'upgrade'); if (bad) return bad;
  if (!j) return ctx.bad('the port gave no report: ' + U.tail(r.text, 4).join(' '));
  const verdict = (U.tail(r.stdout, 30).find(l => /^VERDICT/.test(l)) || '').replace(/^VERDICT\s*/, '');
  const t = [(writing ? 'Wrote the converted copy to ' + fwd(out) + '.' : 'Would write a converted copy to ' + fwd(out) + '.'), ...portText(j, g, a.mod),
    verdict ? 'Verdict: ' + verdict : null, writing ? 'The source mod was not changed. mow_mod_check on the copy next; not run in game.' : previewNote(ctx, out)];
  return { text: lines(t), data: { game: g.id, mod: fwd(a.mod), out: fwd(out), written: writing, from: j.from, to: j.to, codes: j.codes || {}, cant: (j.cant || []).length, verdict: verdict || null, exit: r.code } };
}

// ---------- pack ----------
async function modPack(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod');
  const argv = [mod, ...U.exe(g)], writing = ctx.guard.writing;
  let out = null;
  if (args.out) out = U.dirArg(ctx, args.out, 'out', false);
  if (writing) {
    if (!out) return ctx.bad('out is needed to write: the full path of a folder for the paks (not the mod folder, not a game folder)');
    if (lc(out) === lc(mod) || lc(out).startsWith(lc(mod) + path.sep)) return ctx.bad('out must be a folder outside the mod: the mod\'s loose files stay as they are');
    ctx.guard.write(out); argv.push('--out', out);
    if (args.package === true) argv.push('--package');
  } else argv.push('--dry');
  const r = await run(ctx, 'packer', argv, { timeout: 60 * 60000, max: 400000 });
  const bad = failed(ctx, r, 'packer') || usage(ctx, r, 'packer'); if (bad) return bad;
  const ls = String(r.stdout).split(/\r?\n/).filter(Boolean);
  const plan = ls.filter(l => /\bPLAN\b|\.pak\b/.test(l)).slice(0, 14).map(l => U.short(l.trim(), 240));
  const prob = ls.filter(l => /\b(WARN_[A-Z_]+|ZIP_NAME_TOO_LONG|LNG_NOT_UTF8|PACK_[A-Z_]+)\b/.test(l) && !/\bPLAN\b/.test(l));
  const counts = {}; for (const l of prob) { const m = /\b(WARN_[A-Z_]+|ZIP_NAME_TOO_LONG|LNG_NOT_UTF8|PACK_[A-Z_]+)\b/.exec(l); counts[m[1]] = (counts[m[1]] || 0) + 1; }
  const L = U.list(prob.map(l => U.short(l.trim(), 240)), args.limit || 15);
  const last = U.tail(r.stdout, 2).join(' ');
  const t = [(writing ? (r.code === 0 ? 'Packed ' : 'Packing stopped for ') : 'Pack plan for ') + path.basename(mod) + ' (' + gameWord(g) + ')' + (writing ? ' into ' + fwd(out) : '') + ': ' + last,
    ...plan.map(l => '  ' + l), Object.keys(counts).length ? 'Checks: ' + Object.entries(counts).map(([k, n]) => k + ' ' + n).join(', ') : 'Checks: nothing found.',
    ...L.rows.map(l => '- ' + l), L.more ? '(' + L.more + ' more)' : null,
    g.kind === 'goh' ? 'GoH: only resource/, N.pat and localizations/ of a mod are read; localizations/ text stays loose.' : null, writing ? null : previewNote(ctx, out || path.join(path.dirname(mod), path.basename(mod) + '_packed'))];
  return { text: lines(t), isError: writing && r.code !== 0, data: { game: g.id, mod: fwd(mod), out: out ? fwd(out) : null, written: writing && r.code === 0, plan, counts, problems: L, exit: r.code } };
}

// ---------- which file wins, entity ----------
async function fileWhich(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), p = fwd(ctx.name(args.path, 'path')).replace(/^\/+/, '');
  const mods = U.names(ctx, args.mods, 'mods');
  const r = await run(ctx, 'vfs', [game, ...U.exe(g), '--mods', mods.join(','), '-q', 'which', p], { timeout: 10 * 60000 });
  const bad = failed(ctx, r, 'vfs') || usage(ctx, r, 'vfs'); if (bad) return bad;
  const out = U.tail(r.stdout, 20).map(l => U.short(l, 300)), win = out.find(l => /^winner:/.test(l)), keyL = out.find(l => /^key:/.test(l));
  const found = !!win;
  return { text: lines([found ? p + ' in ' + gameWord(g) + (mods.length ? ' + ' + mods.join(', ') : '') + ':' : 'No file "' + p + '" in ' + gameWord(g) + (mods.length ? ' + ' + mods.join(', ') : '') + '. Give the path as the game sees it, for example resource/set/stuff/gun/76mm_zis3 or set/multiplayer/units/soldiers.set.', ...out.map(l => '  ' + l),
    ...U.tail(r.stderr, 4).filter(l => /MOD_|VFS_|disabled/i.test(l)).map(l => '! ' + U.short(l, 240))]),
    data: { game: g.id, path: p, found, key: keyL ? keyL.replace(/^key:\s*/, '') : null, winner: win ? win.replace(/^winner:\s*/, '') : null, mods } };
}
async function entityInfo(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), ns = U.names(ctx, args.names, 'names');
  if (!ns.length) return ctx.bad('names is needed: one or more entity names (the .def name, such as t34_85 or pz4h)');
  if (ns.length > 8) return ctx.bad('at most 8 names in one call');
  const argv = [game, ...U.exe(g)];
  const mods = U.names(ctx, args.mods, 'mods'); if (mods.length) argv.push('--mods', mods.join(','));
  if (args.mod) argv.push('--folder', U.dirArg(ctx, args.mod, 'mod'));
  const r = await run(ctx, 'entityindex', argv.concat(ns), { timeout: (g.kind === 'goh' ? 60 : 15) * 60000, max: 60000 });
  const bad = failed(ctx, r, 'entityindex') || usage(ctx, r, 'entityindex'); if (bad) return bad;
  const ls = String(r.stdout).split(/\r?\n/), missing = ls.filter(l => /: no such entity/.test(l)).map(l => l.split(':')[0]);
  const body = ls.filter(l => l.trim() && !/^exe /.test(l));
  const t = [ns.length - missing.length + ' of ' + ns.length + ' found in ' + gameWord(g) + '.', ctx.cut(body.map(l => U.short(l, 400)).join('\n'), 14000),
    missing.length ? 'Not found: ' + missing.join(', ') + '. mow_unit_find searches by a part of the name.' : null];
  return { text: lines(t), data: { game: g.id, asked: ns, missing } };
}

const ALL = GAMES;
// ---------- one-job forms of mow_unit_change ----------
const kitSlot = (args, ctx) => unitChange(Object.assign({}, args, { what: 'equipment' }), ctx);
const lookSet = (args, ctx) => {
  if (args.skin == null && args.texture == null) return ctx.bad('give skin (a skin name, mow_unit_stats with show: ["look"] lists them) or texture (a texture variant of the model, "none" clears it)');
  return unitChange(Object.assign({}, args, args.skin != null ? { what: 'skin', value: args.skin, texmod: args.texture != null ? args.texture : undefined } : { what: 'texture', value: args.texture }), ctx);
};

// ---------- weapons ----------
const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function weaponFind(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), mod = modFor(ctx, args);
  const r = await units.call(ctx, g, 'weapons', { mod });
  const words = lc(args.q || '').split(/\s+/).filter(Boolean), grp = lc(args.group || '');
  const hit = (r.weapons || []).filter(w => (!grp || lc(w.group) === grp) && words.every(x => lc(w.name).includes(x) || lc(w.group).includes(x)));
  const groups = {}; for (const w of r.weapons || []) groups[w.group] = (groups[w.group] || 0) + 1;
  const L = U.list(hit, args.limit || 30, 'add letters to q or pass group');
  const t = [hit.length + ' weapon or item file(s) match in ' + gameWord(g) + (mod ? ' + ' + path.basename(mod) : '') + (L.more ? ', first ' + L.rows.length + ' shown (' + L.hint + ')' : '') + '. Groups: ' + Object.entries(groups).map(([k, n]) => k + ' ' + n).join(', ') + '.',
    ...L.rows.map(w => '- ' + w.name + '  [' + w.group + ']')];
  const data = { game: g.id, total: hit.length, weapons: L.rows, more: L.more, groups };
  // one exact name: its file and its main values as written (a value it inherits from a pattern is not listed)
  const one = hit.length === 1 ? hit[0] : hit.find(w => lc(w.name) === lc(args.q || ''));
  if (one) {
    const c = units.lib().newCtx(game, mod || path.join(U.tmpDir(), 'units-none'), true, g.id);
    let key = null; try { key = c.keys(new RegExp('^resource/set/stuff/.*/' + reEsc(one.name) + '$'))[0]; } catch (e) { key = null; }
    if (key) {
      const text = c.read(key).toString('latin1').replace(/^\s*;.*$/gm, ''), vals = {};
      for (const k of ['from', 'range', 'aimRange', 'damage', 'projectileDamage', 'projectileDamageThreshold', 'speed', 'rechargeTime', 'recoveryTime', 'burst', 'filling', 'spreading', 'accuracy', 'aimingTime', 'calibre', 'mass']) {
        const m = new RegExp('\\{\\s*' + k + '\\s+([^{}]*)\\}', 'i').exec(text); if (m) vals[k] = U.short(m[1].trim(), 120);
      }
      data.file = key; data.values = vals;
      t.push(one.name + ': ' + key, ...Object.entries(vals).map(([k, v]) => '  ' + k + ' = ' + v), 'Values not listed are inherited from the pattern in "from". mow_weapon_change changes one.');
    }
  }
  return { text: lines(t), data };
}
async function weaponChange(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), mod = U.dirArg(ctx, args.mod, 'mod');
  const w = lc(ctx.name(args.weapon, 'weapon')), what = String(args.what || 'range');
  if (!/^[a-z0-9_ .-]+$/.test(w)) return ctx.bad('weapon: the file name of the weapon as mow_weapon_find shows it (for example mosin)');
  if (!/^[A-Za-z_][\w/]*$/.test(what)) return ctx.bad('what: range, or the name of a value of the weapon file such as damage, rechargeTime, speed');
  if (args.value == null || String(args.value).trim() === '') return ctx.bad('value is needed: the new ' + what);
  const writing = ctx.guard.writing;
  if (writing) ctx.guard.write(mod);
  const L = units.lib();
  const once = async write => {
    if (what === 'range') return units.call(ctx, g, 'recipe', { recipe: 'range', mod, weapon: w, range: String(args.value), write });
    if (g.kind === 'goh' && write) { const why = require('../../lib/writeguard').refuseWrite(mod, { game }); if (why) throw ctx.refusal(String(why).replace(/^refused:\s*/, '')); }
    const c = L.newCtx(game, mod, !write, g.id);
    const keys = c.keys(new RegExp('^resource/set/stuff/.*/' + reEsc(w) + '$'));
    if (!keys.length) throw ctx.refusal('no weapon file named "' + w + '" was found. mow_weapon_find lists them.');
    const key = keys[0], text = c.read(key).toString('latin1').replace(/^\s*;.*$/gm, '');
    const root = (/^\s*\{\s*([A-Za-z_]\w*)/m.exec(text) || [])[1] || 'from';
    const leaf = what.split('/').pop(), own = new RegExp('\\{\\s*' + leaf + '\\s+([^{}]*)\\}', 'i').exec(text);
    L.gen().ops.opSet(c, { op: 'set', rows: [{ entity: 'file:' + key, path: what.includes('/') ? what : root + '/' + what, value: String(args.value), op: own ? 'set' : 'add' }] }, c.out);
    return L.finish(c, game, mod, { write }, { weapon: w, file: key, rows: [{ field: what, old: own ? own[1].trim() : '(inherited)', new: String(args.value) }], names: [] });
  };
  let res = await once(false);
  const planErr = (res.errors || []).length;
  if (writing && !planErr) { for (const f of res.files || []) ctx.guard.write(path.join(mod, ...String(f.file).split('/'))); res = await once(true); }
  const rows = (res.rows || []).map(r => ({ field: r.field, old: r.old, new: r.new }));
  const t = [(res.written ? 'Changed ' : planErr ? 'Cannot change ' : 'Would change ') + w + ' in ' + path.basename(mod) + ' (' + gameWord(g) + '):', ...rows.map(r => '- ' + r.field + ': ' + r.old + ' -> ' + r.new),
    ...(res.errors || []).map(e => '! ' + (e.msg || e.code)), ...(res.warnings || []).slice(0, 5).map(e => 'warning: ' + (e.msg || e.code)),
    res.inheritedFrom ? 'The old value came from ' + res.inheritedFrom + '; the weapon file now holds its own.' : null,
    (res.files || []).length ? 'Files: ' + res.files.map(f => f.file + (f.copiedFromGame ? ' (a mod copy of the game file)' : '')).join(', ') : null,
    'Every unit that carries this weapon changes. A new gun or shell: mow_mod_gen with the gun / shell ops.',
    res.written ? 'Written. Not run in game.' : planErr ? null : previewNote(ctx, mod)];
  return { text: lines(t), data: { game: g.id, mod: fwd(mod), weapon: w, what, written: !!res.written, rows, files: (res.files || []).map(f => ({ file: f.file, lines: (f.lines || []).slice(0, 6) })), errors: (res.errors || []).map(e => ({ code: e.code, msg: e.msg })) } };
}

// ---------- place an object, bots in a mode ----------
async function mapPlace(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), key = mapKey(ctx, args.map), mod = U.dirArg(ctx, args.mod, 'mod', false);
  const ent = ctx.name(args.entity, 'entity');
  const pos = Array.isArray(args.pos) ? args.pos.map(Number) : String(args.pos || '').split(/[\s,]+/).filter(Boolean).map(Number);
  if (pos.length < 2 || pos.length > 3 || pos.some(n => !Number.isFinite(n))) return ctx.bad('pos: [x, y] or [x, y, z] in map units (mow_map_info with view: true shows the ground)');
  const writing = ctx.guard.writing;
  const target = path.join(mod, 'resource', ...key.split('/'), 'map');
  if (writing) { ctx.guard.write(mod); ctx.guard.write(target); }
  const argv = [mod, '--game', game, ...U.exe(g), '--map', key.replace(/^map\//, ''), '--entity', ent, '--pos', pos.join(',')];
  const mods = U.names(ctx, args.mods, 'mods'); if (mods.length) argv.push('--mods', mods.join(','));
  if (args.dir != null && Number.isFinite(Number(args.dir))) argv.push('--dir', String(Number(args.dir)));
  if (args.scale != null && Number(args.scale) > 0) argv.push('--scale', String(Number(args.scale)));
  if (!writing) argv.push('--dry-run');
  const r = await run(ctx, 'place-entity', argv, { timeout: (g.kind === 'goh' ? 60 : 20) * 60000 });
  const bad = failed(ctx, r, 'place-entity'); if (bad) return bad;
  const out = U.tail(r.text, 10).map(l => U.short(l, 280));
  if (r.code !== 0) return ctx.bad('the object was not placed: ' + out.slice(-4).join(' | '));
  return { text: lines([(writing ? 'Placed ' : 'Would place ') + ent + ' at ' + pos.join(', ') + ' on ' + key + ' in ' + fwd(mod) + ' (' + gameWord(g) + '): the mod gets its own copy of the map file with one more object.', ...out.map(l => '  ' + l),
    'Map files are compared between players in multiplayer: everyone needs the mod.' + (g.kind === 'goh' ? ' GoH: object ids are 32-bit; never run in game.' : ''), writing ? 'Not run in game.' : previewNote(ctx, target)]),
    data: { game: g.id, map: key, entity: ent, pos, mod: fwd(mod), file: fwd(path.relative(mod, target)), written: writing } };
}
const MODE_SAY = { added: 'bots are now allowed', 'added.will': 'bots would be allowed (the line enableBots is added to the mode card)', present: 'bots are already allowed, nothing to do', fail: 'the mode card has no settings block to add the line to', nocard: 'no card for this mode was found' };
async function modeBots(args, ctx) {
  const g = ctx.game(args); U.need(ctx, g);
  const mod = U.dirArg(ctx, args.mod, 'mod'), mode = lc(ctx.name(args.mode, 'mode')), writing = ctx.guard.writing;
  const file = 'resource/set/multiplayer/games/' + mode + '.set';
  if (writing) { ctx.guard.write(mod); ctx.guard.write(path.join(mod, ...file.split('/'))); }
  let r;
  try { r = await require('../../gui/ext/modes').routes['POST /api/x/modes/bots']('/api/x/modes/bots', { mod, mode, write: writing, gid: g.id }, units.gui(ctx, g)); }
  catch (e) {
    if (e && (e.status === 400 || e.status === 499)) { const k = String(e.message); return ctx.bad(/nocard/.test(k) ? 'no game mode "' + mode + '" in ' + gameWord(g) + ' or the mod (a mode is a card in resource/set/multiplayer/games/)' : /e\.mode$/.test(k) ? 'mode: a mode name such as battle_zones' : k.replace(/^refused:\s*/, '')); }
    throw e;
  }
  const state = r.state + (r.state === 'added' && !writing ? '.will' : '');
  return { text: lines(['Mode ' + mode + ' in ' + path.basename(mod) + ' (' + gameWord(g) + '): ' + (MODE_SAY[state] || state) + '.',
    r.state === 'added' ? 'File: ' + (r.file || file) + (r.copy ? ' (a mod copy of the game card)' : '') + '. It applies to every map of that mode while the mod is on.' : null,
    ...(r.warn || []).map(w => 'warning: ' + (/combat/.test(w.k) ? 'a combat-type mode has no flags for the bots to take, so they may stand still' : w.k)),
    r.state === 'added' ? (writing ? 'Written. Not run in game.' : previewNote(ctx, mod)) : null,
    g.kind === 'goh' ? 'GoH: same card form; its bots buy from script/multiplayer/units/<army>/<stage>.<army>.lua, there is no bot.data.lua.' : null]),
    isError: !r.ok, data: { game: g.id, mod: fwd(mod), mode, state: r.state, file: r.file || file, written: writing && r.state === 'added' } };
}

// ---------- bots ----------
async function botsRecipe(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod'), act = args.action || 'check';
  if (g.kind === 'goh' && (act === 'check' || act === 'fix')) return { na: 'Gates of Hell has no bot.lua and no bot.data.lua (its bots buy from script/multiplayer/units/<army>/<stage>.<army>.lua), and a check of those lists is not built. action: "buy_first" with army and stage edits such a list.' };
  if (act === 'check') {
    const argv = [mod, '--check', ...U.exe(g)]; if (g.dir) argv.push('--game', g.dir);
    const r = await run(ctx, 'botrecipe', argv, { timeout: 15 * 60000 });
    const bad = failed(ctx, r, 'botrecipe') || usage(ctx, r, 'botrecipe'); if (bad) return bad;
    const ls = U.tail(r.stdout, 400), prob = ls.filter(l => /^(error|warn)/i.test(l)), L = U.list(prob.map(l => U.short(l, 260)), args.limit || 25);
    return { text: lines(['Bot buy list of ' + path.basename(mod) + ' (' + gameWord(g) + '): ' + (ls[ls.length - 1] || 'no answer') + '.', ...L.rows.map(l => '- ' + l), L.more ? '(' + L.more + ' more)' : null,
      ...ls.filter(l => /^info/i.test(l)).slice(0, 4).map(l => U.short(l, 260)), 'Checked: the shape of script/multiplayer/bot.data.lua against the game\'s, and that every unit the bots buy has a buy card.']),
      data: { game: g.id, mod: fwd(mod), problems: L, exit: r.code } };
  }
  if (act !== 'fix' && act !== 'buy_first') return ctx.bad('action: check, fix (the known bot.lua fixes) or buy_first (the bots buy one unit first)');
  const out = U.dirArg(ctx, args.out, 'out', false), writing = ctx.guard.writing;
  if (writing) ctx.guard.write(out);
  const argv = [mod, '--out', out, ...U.exe(g)]; if (g.dir) argv.push('--game', g.dir);
  if (act === 'buy_first') {
    argv.push('--buy-first', ctx.name(args.unit, 'unit'));
    if (g.kind === 'goh') { if (args.army) argv.push('--army', ctx.name(args.army, 'army')); if (args.stage) argv.push('--stage', ctx.name(args.stage, 'stage')); }
    if (args.after) argv.push('--after', ctx.name(args.after, 'after'));
  }
  if (!writing) argv.push('--dry-run');
  const r = await run(ctx, 'botrecipe', argv, { timeout: 15 * 60000 });
  const bad = failed(ctx, r, 'botrecipe'); if (bad) return bad;
  const ls = U.tail(r.text, 12).map(l => U.short(l, 280));
  if (r.code === 2) return ctx.bad('the bot recipe was refused: ' + ls.slice(-4).join(' | '));
  return { text: lines([(writing ? 'Bot recipe written into ' : 'Bot recipe plan for ') + fwd(out) + ' (' + gameWord(g) + ', ' + (act === 'fix' ? 'the known bot.lua fixes' : 'buy ' + args.unit + ' first') + '):', ...ls.map(l => '  ' + l),
    act === 'fix' ? 'The patch is a full copy of bot.lua: run it again when the mod\'s bot.lua changes.' : null, writing ? 'Not run in game.' : previewNote(ctx, out)]),
    isError: r.code !== 0, data: { game: g.id, mod: fwd(mod), out: fwd(out), action: act, written: writing && r.code === 0, exit: r.code } };
}

// ---------- multiplayer sync ----------
async function mpSync(args, ctx) {
  const g = ctx.game(args), act = args.action || (args.a && args.b ? 'compare' : args.out ? 'export' : 'mod');
  if (act === 'compare') {
    const a = ctx.name(args.a, 'a'), b = ctx.name(args.b, 'b');
    for (const f of [a, b]) if (!path.isAbsolute(f) || !U.isFile(f)) return ctx.bad('a and b: full paths of two fingerprint files made by action "export"; not found: ' + f);
    const r = await run(ctx, 'mpsync', ['--compare', a, b], { timeout: 10 * 60000, max: 400000 });
    const bad = failed(ctx, r, 'mpsync') || usage(ctx, r, 'mpsync'); if (bad) return bad;
    const ls = U.tail(r.stdout, 2000), L = U.list(ls.slice(0, -1).map(l => U.short(l, 260)), args.limit || 30);
    return { text: lines(['Compared the two file sets: ' + (ls[ls.length - 1] || 'no answer') + '.', ...L.rows.map(l => '- ' + l), L.more ? '(' + L.more + ' more)' : null,
      'DETECTED = the lobby sees the difference (players cannot join); SILENT = the lobby does not see it, the match can go out of sync.']), data: { rows: L, exit: r.code } };
  }
  if (act === 'export') {
    const game = U.need(ctx, g), out = ctx.name(args.out, 'out');
    if (!path.isAbsolute(out) || !/\.json$/i.test(out)) return ctx.bad('out: the full path of a .json file to write the fingerprint to');
    const mods = U.names(ctx, args.mods, 'mods');
    if (!ctx.guard.writing) return { text: lines(['Would write the fingerprint of ' + gameWord(g) + (mods.length ? ' + ' + mods.join(', ') : '') + ' (every file the lobby compares) to ' + fwd(out) + '. Each player makes one; action "compare" then names the files that differ.', previewNote(ctx, out)]), data: { game: g.id, out: fwd(out), written: false } };
    ctx.guard.write(out);
    const r = await run(ctx, 'mpsync', ['--game', game, ...U.exe(g), '--mods', mods.join(','), '--export', out], { timeout: 60 * 60000 });
    const bad = failed(ctx, r, 'mpsync') || usage(ctx, r, 'mpsync'); if (bad) return bad;
    return { text: lines([(U.isFile(out) ? 'Wrote the fingerprint to ' + fwd(out) + '.' : 'The fingerprint was not written.'), ...U.tail(r.text, 5).map(l => '  ' + U.short(l, 260))]), isError: !U.isFile(out), data: { game: g.id, out: fwd(out), written: U.isFile(out) } };
  }
  if (act !== 'mod') return ctx.bad('action: mod (classify a mod\'s files), export (fingerprint of the game + mods) or compare (two fingerprints)');
  const mod = U.dirArg(ctx, args.mod, 'mod'), argv = ['--mod', mod, ...U.exe(g)]; if (g.dir) argv.push('--game', g.dir);
  const r = await run(ctx, 'mpsync', argv, { timeout: 30 * 60000, max: 400000 });
  const bad = failed(ctx, r, 'mpsync') || usage(ctx, r, 'mpsync'); if (bad) return bad;
  const ls = U.tail(r.text, 2000);
  const skipped = ls.find(l => /SKIPPED/.test(l));
  if (skipped) return ctx.bad('the mod could not be read as the game would load it' + (g.kind === 'goh' ? '' : ' (on AS2 the mod folder must be in <game>/mods for this)') + '. The CLI names the reason: node tools/mpsync/mpsync.js --mod <folder>');
  const warn = ls.filter(l => /MPSYNC_/.test(l)), L = U.list(warn.map(l => U.short(l, 260)), args.limit || 25);
  return { text: lines(['Files of ' + path.basename(mod) + ' as the multiplayer lobby compares them (' + gameWord(g) + '): ' + U.short(ls[ls.length - 1] || '', 300), ...L.rows.map(l => '- ' + l), L.more ? '(' + L.more + ' more)' : null,
    'S = compared by content, Z = by size only (a same-size change goes unseen), X = not compared.' + (g.kind === 'goh' ? ' GoH: the same rules by code reading, not measured in a lobby.' : '')]), data: { game: g.id, mod: fwd(mod), rows: L, exit: r.code } };
}

// ---------- balance, price ----------
async function balanceCheck(args, ctx) {
  const g = ctx.game(args), game = U.need(ctx, g), mod = modFor(ctx, args), show = args.show || 'odd';
  if (!['odd', 'models', 'summary'].includes(show)) return ctx.bad('show: odd (units that do not fit their group), models (what the price follows per class) or summary');
  const argv = [game, ...U.exe(g), '--tmp', U.tmpDir(), '-q'];
  if (mod) argv.push('--folder', mod);
  if (args.where) argv.push('--where', ctx.name(args.where, 'where'));
  if (show !== 'summary') argv.push('--' + show, '--json');
  const r = await run(ctx, 'balance', argv, { timeout: (g.kind === 'goh' ? 60 : 20) * 60000, max: 3000000 });
  const bad = failed(ctx, r, 'balance') || usage(ctx, r, 'balance'); if (bad) return bad;
  const who = gameWord(g) + (mod ? ' + ' + path.basename(mod) : '');
  if (show === 'summary') return { text: lines(['Balance summary of ' + who + ':', ctx.cut(U.tail(r.stdout, 60).map(l => U.short(l, 240)).join('\n'), 8000)]), data: { game: g.id, exit: r.code } };
  let j = null; { const s = String(r.stdout), i = s.search(/[[{]/); try { j = JSON.parse(s.slice(i)); } catch (e) { j = null; } }
  if (!j) return ctx.bad('balance gave no report: ' + U.tail(r.text, 3).join(' '));
  if (show === 'models') {
    const rows = Object.entries(j).map(([cls, m]) => ({ cls, n: m.n, r2: m.r2, weak: !!m.weak, weights: (m.weights || []).map(w => w.f + ' ' + w.w).join(', ') }));
    return { text: lines(['What the price follows per unit class in ' + who + ' (fit on the buyable units; r2 near 1 = the price follows these numbers closely):', ...rows.map(x => '- ' + x.cls + ' (' + x.n + ' units, r2 ' + x.r2 + (x.weak ? ', weak' : '') + '): ' + x.weights),
      'af / as = armour front / side, men = soldiers. A weak fit means the prices of that class were set by hand.']), data: { game: g.id, models: rows } };
  }
  const q = lc(args.q || ''), all = Array.isArray(j) ? j : (j.odd || []);
  const hit = all.filter(x => !q || lc(x.id).includes(q) || lc(x.name).includes(q) || lc(x.army) === q || lc(x.cls) === q || lc(x.code) === q).sort((a, b) => (b.sev || 0) - (a.sev || 0));
  const counts = {}; for (const x of hit) counts[x.code] = (counts[x.code] || 0) + 1;
  const L = U.list(hit.map(x => ({ id: x.id, name: x.name, army: x.army, cls: x.cls, code: x.code, sev: x.sev, text: U.short(x.text, 260) })), args.limit || 25, 'pass q (an army, a class such as tank, a code or part of a name) or where');
  return { text: lines([hit.length + ' unit(s) of ' + who + ' do not fit the pattern of their group' + (L.more ? ', the ' + L.rows.length + ' strongest shown (' + L.hint + ')' : '') + '. By kind: ' + (Object.entries(counts).map(([k, n]) => k + ' ' + n).join(', ') || 'none') + '.',
    ...L.rows.map(x => '- ' + (x.name || x.id) + ' (' + x.id + ', ' + x.army + ' ' + x.cls + ') ' + x.code + ': ' + x.text),
    'These are hints from the numbers, not errors: the game was not run.' + (g.kind === 'goh' ? ' GoH: prices by the GoH squad rule; no rank and no head start.' : '')]), data: { game: g.id, total: hit.length, counts, rows: L.rows, more: L.more } };
}
async function price(args, ctx) {
  const g = ctx.game(args), mod = U.dirArg(ctx, args.mod, 'mod'), show = args.show || 'fit';
  if (g.kind === 'goh') return { na: 'the price calculator reads the AS2 price rows (set/multiplayer/units/soldiers.set "mp/<side>/<breed>" with level tables); Gates of Hell prices squads by its own rule (own cost + members x squad_cost_factor), which mow_unit_stats and mow_balance_check show' };
  if (!['fit', 'calc', 'plan', 'tiers'].includes(show)) return ctx.bad('show: fit (how well the model matches the mod), calc (price per soldier and squad card), tiers (item tiers) or plan (what an apply would write)');
  const cmd = show === 'tiers' ? ['calc', mod, '--review', 'tiers'] : [show, mod];
  const argv = cmd.concat(g.dir ? ['--game', g.dir] : []);
  if (args.model) { const m = ctx.name(args.model, 'model'); if (!path.isAbsolute(m) || !U.isFile(m)) return ctx.bad('model: full path of a price_model.inc file'); argv.push('--model', m); }
  const r = await run(ctx, 'pricecalc', argv, { timeout: 20 * 60000, max: 3000000 });
  const bad = failed(ctx, r, 'pricecalc') || usage(ctx, r, 'pricecalc'); if (bad) return bad;
  let ls = String(r.stdout).split(/\r?\n/).filter(l => l.trim());
  const q = lc(args.q || ''), head = ls.slice(0, show === 'fit' ? 0 : 1);
  if (q) ls = head.concat(ls.slice(head.length).filter(l => lc(l).includes(q)));
  const n = args.limit || (show === 'fit' ? 40 : 30), L = U.list(ls.map(l => U.short(l.replace(/\t/g, ' | '), 300)), n, 'pass q with a part of a breed or card name');
  return { text: lines(['Price calculator, ' + show + ' of ' + path.basename(mod) + ' (' + gameWord(g) + '; AS64 and MoW:AS2 read the same price rows): ' + ls.length + ' line(s)' + (L.more ? ', first ' + L.rows.length + ' shown (' + L.hint + ')' : '') + '.', ...L.rows,
    'Reads only. The model is the mod\'s resource/set/multiplayer/units/price_model.inc; without one it is fitted from the mod\'s own price rows (a guess). Writing price comments into the mod is left to the CLI: node tools/pricecalc/pricecalc.js apply.',
    U.tail(r.stderr, 3).map(l => U.short(l, 240)).join(' ') || null]), isError: r.code !== 0 && !ls.length, data: { game: g.id, mod: fwd(mod), show, lines: L.total, more: L.more, exit: r.code } };
}

const MORE = [
  { name: 'mow_kit_slot', group: 'units', title: 'Equipment and weapon slots', kind: 'write', games: ALL, wraps: 'gui units kit/set (gen opKit, opVehKit)',
    description: 'Use to change what a soldier carries or what a vehicle holds: add / del items of the inventory (a vehicle: its ammo box), in_hands for the held weapon, slots to swap a vehicle weapon slot. Name a soldier by id or breed, a vehicle by id or entity. Answers old -> new and the files; preview unless write: true. Same as mow_unit_change what: equipment. goh: breeds are army/period/name.',
    inputSchema: schema({ mod: P.mod, id: { type: 'string', description: 'Unit id as mow_unit_find shows it' }, breed: { type: 'string', description: 'One soldier: army/name (GoH army/period/name)' }, entity: { type: 'string', description: 'A vehicle by its entity name' }, card: { type: 'string', description: 'GoH: the card value of the find row' },
      add: { type: 'array', items: { type: 'object' }, description: '[{item, count?, filled?, filling?}]' }, del: { type: 'array', items: { type: 'string' }, description: 'Item names to remove' }, in_hands: { type: 'string', description: 'Item the soldier holds' }, slots: { type: 'object', description: 'Vehicle weapon slots {slot: item or false}' }, write: P.write }, ['mod']), handler: kitSlot },
  { name: 'mow_look_set', group: 'units', title: 'Skin and texture variant', kind: 'write', games: ALL, wraps: 'gui units look/set (gen opWear, opTexmod)',
    description: 'Use to give a soldier another skin (uniform) or a soldier or vehicle another texture variant (camo) of its model. mow_unit_stats with show: ["look"] lists what the unit has and what its model offers. Answers old -> new and the files; preview unless write: true. Same as mow_unit_change what: skin / texture. goh: breeds are army/period/name.',
    inputSchema: schema({ mod: P.mod, id: { type: 'string', description: 'Unit id as mow_unit_find shows it' }, breed: { type: 'string', description: 'One soldier: army/name' }, entity: { type: 'string', description: 'A vehicle by its entity name' }, card: { type: 'string', description: 'GoH: the card value of the find row' },
      skin: { type: 'string', description: 'Skin name' }, texture: { type: 'string', description: 'Texture variant name; "none" clears it' }, write: P.write }, ['mod']), handler: lookSet },
  { name: 'mow_weapon_find', group: 'weapons', title: 'Find a weapon', kind: 'read', games: ALL, wraps: 'gui units weapons (gen Ctx keys of set/stuff)',
    description: 'Use to find a weapon, ammo or item file by a part of its name ("mosin", "75mm"): answers the names with their group (gun, mgun, rifle, ammo ...). One exact match also answers its file and the values written in it (range, damage, reload, speed); the rest it inherits from its pattern. For gun against armour use mow_matchup. All three games; the groups are the game\'s own set/stuff folders.',
    inputSchema: schema({ q: { type: 'string', description: 'Part of the weapon file name' }, group: { type: 'string', description: 'A set/stuff folder such as gun, rifle, ammo' }, mod: P.modOpt, limit: P.limit }), handler: weaponFind },
  { name: 'mow_weapon_change', group: 'weapons', title: 'Change a weapon value', kind: 'write', games: ALL, wraps: 'gui units recipe range, gen opSet on the weapon file',
    description: 'Use to change one value of a weapon in a mod: what = range (value one or two numbers, e.g. "80 90") or the name of a value of the weapon file (damage, rechargeTime, speed ...). The mod gets its own copy of the weapon file; every unit with that weapon changes. Answers old -> new and the file; preview unless write: true. A new gun or shell is mow_mod_gen (gun / shell ops). goh: same file form; never run in game.',
    inputSchema: schema({ mod: P.mod, weapon: { type: 'string', description: 'Weapon file name as mow_weapon_find shows it' }, what: { type: 'string', description: 'range (default) or a value name' }, value: { type: ['string', 'number'], description: 'The new value' }, write: P.write }, ['mod', 'weapon', 'value']), handler: weaponChange },
  { name: 'mow_map_place', group: 'maps', title: 'Place an object on a map', kind: 'write', games: ALL, wraps: 'place-entity',
    description: 'Use to add one static object (a house, a wreck, a gun) to a map: the mod gets its own copy of the map file with the new object at pos (map units). Answers the new object id and warnings (outside the map, entity unknown); preview unless write: true. as64 and mowas2: 16-bit object ids; goh: 32-bit ids, mod folder outside the GoH install.',
    inputSchema: schema({ mod: { type: 'string', description: 'Full path of the mod folder to write into' }, map: { type: 'string', description: 'Map name such as 1v1_argentan' }, entity: { type: 'string', description: 'Entity (.def) name' }, pos: { type: 'array', items: { type: 'number' }, description: '[x, y] or [x, y, z] in map units' }, dir: { type: 'number', description: 'Turn in degrees' }, scale: { type: 'number', description: 'Size factor' }, mods: P.mods, write: P.write }, ['mod', 'map', 'entity', 'pos']), handler: mapPlace },
  { name: 'mow_mode_bots', group: 'bots', title: 'Allow bots in a game mode', kind: 'write', games: ALL, wraps: 'gui modes bots (botsFor)',
    description: 'Use when a game mode offers no bots in the lobby: adds enableBots to the mode card in the mod (the game card is copied first). It applies to every map of that mode. Answers the state (added, already there, no card) and the file; preview unless write: true. goh: same card form; GoH bots buy from per-army lua lists.',
    inputSchema: schema({ mod: P.mod, mode: { type: 'string', description: 'Mode name such as battle_zones' }, write: P.write }, ['mod', 'mode']), handler: modeBots },
  { name: 'mow_bots_recipe', group: 'bots', title: 'Check or fix the bots of a mod', kind: 'write', games: ALL, wraps: 'botrecipe (--check, fix, --buy-first)',
    description: 'Use when bots do not buy a mod\'s units or do nothing: action check (default) reads the mod\'s bot.data.lua against the game\'s and says which entries are broken or have no buy card; fix writes the known bot.lua fixes into a patch mod folder (out); buy_first makes the bots buy one unit first. Preview unless write: true. goh: check and fix are not served (GoH has no bot.lua or bot.data.lua); buy_first edits a GoH buy list (army, stage).',
    inputSchema: schema({ mod: P.mod, action: { type: 'string', enum: ['check', 'fix', 'buy_first'], description: 'Default check' }, out: { type: 'string', description: 'fix, buy_first: full path of the mod folder to write' }, unit: { type: 'string', description: 'buy_first: the unit id' }, after: { type: 'string', description: 'buy_first: put it after this unit' }, army: { type: 'string', description: 'GoH buy_first: eng, fin, ger, rus or usa' }, stage: { type: 'string', description: 'GoH buy_first: early, mid, late or conquest' }, write: P.write, limit: P.limit }, ['mod']), handler: botsRecipe },
  { name: 'mow_mp_sync', group: 'together', title: 'Multiplayer file sync', kind: 'write', games: ALL, wraps: 'mpsync (--mod, --export, --compare)',
    description: 'Use for "out of sync" or "different version" between players. action mod (default): which of a mod\'s files the lobby compares by content, by size only or not at all. action export: writes a fingerprint .json of the game + mods (write: true, out); each player makes one. action compare: names the files that differ between two fingerprints (a, b) and whether the lobby sees them. goh: same rules by code reading, not measured.',
    inputSchema: schema({ action: { type: 'string', enum: ['mod', 'export', 'compare'], description: 'Default mod' }, mod: P.modOpt, mods: P.mods, out: { type: 'string', description: 'export: full path of the .json to write' }, a: { type: 'string', description: 'compare: first fingerprint file' }, b: { type: 'string', description: 'compare: second fingerprint file' }, write: P.write, limit: P.limit }), handler: mpSync },
  { name: 'mow_balance_check', group: 'weapons', title: 'Units that do not fit', kind: 'read', games: ALL, wraps: 'balance --odd, --models',
    description: 'Use to judge balance from the numbers: show odd (default) lists buyable units whose price, cooldown or strength does not fit their class (too cheap for its armour, costs more but is no better, ready too early); show models says what the price follows per class; summary gives the totals. mod reads a mod on top of the game; q narrows. Hints, not errors. goh: GoH squad price rule, no rank or head start.',
    inputSchema: schema({ mod: P.modOpt, show: { type: 'string', enum: ['odd', 'models', 'summary'], description: 'Default odd' }, q: { type: 'string', description: 'An army, a class (tank, car, squad), a code or part of a name' }, where: { type: 'string', description: 'Filter such as "army=ger cls=tank cost>500"' }, limit: P.limit }), handler: balanceCheck },
  { name: 'mow_price', group: 'weapons', title: 'Price calculator', kind: 'read', games: ALL, wraps: 'pricecalc fit, calc, plan',
    description: 'Use to ask "is this price fair" for soldiers and squad cards of a mod: show fit (default) says how many prices the mod\'s price model reproduces and the biggest gaps; calc lists the computed against the current price per soldier and card (q narrows); tiers lists item tiers; plan says what an apply would write. Reads only. as64 and mowas2 only: goh answers why not.',
    inputSchema: schema({ mod: P.mod, show: { type: 'string', enum: ['fit', 'calc', 'tiers', 'plan'], description: 'Default fit' }, q: { type: 'string', description: 'Part of a breed or card name' }, model: { type: 'string', description: 'Full path of a price_model.inc; default the mod\'s own' }, limit: P.limit }, ['mod']), handler: price },
];

// ---------- the tools ----------
const tools = [
  { name: 'mow_mod_info', group: 'mod', title: 'Read a mod', kind: 'read', games: ALL, wraps: 'modinfo',
    description: 'Use first on any mod folder: its name, game version range, required mods, what it holds (resource folders, paks, text) and the mod.info check for the game. Without mod: the mod folders in <game>/mods. as64: Min 3.301 = AS64 only; mowas2: range around 3.262; goh: GoH exe version scale, text in localizations/.',
    inputSchema: schema({ mod: P.modOpt, q: { type: 'string', description: 'Without mod: part of a folder or mod name' }, limit: P.limit }), handler: modInfo },
  { name: 'mow_mod_new', group: 'mod', title: 'Make a new mod folder', kind: 'write', games: ALL, wraps: 'newmod',
    description: 'Use to start a mod: makes an empty mod folder (mod.info, resource skeleton, an empty text file) and checks it. Preview lists the files; write: true makes them. as64: mod.info Min 3.301; mowas2: 3.262 range; goh: GoH version, text as .pot under localizations/default.',
    inputSchema: schema({ dir: { type: 'string', description: 'Full path of the new folder (must not exist or be empty)' }, name: { type: 'string', description: 'Shown name of the mod' }, deps: { type: 'array', items: { type: 'string' }, description: 'Mods it needs (Require)' }, description: { type: 'string', description: 'Shown description' }, write: P.write }, ['dir', 'name']), handler: modNew },
  { name: 'mow_mod_check', group: 'mod', title: 'Check a mod', kind: 'read', games: ALL, wraps: 'check (wouldload + doctor linters)',
    description: 'Use to find why a mod crashes, does not load or misbehaves: one call runs the load verdict and the linters for the game and answers plain lines, the verdict and the worst finding kinds with one example each. Default is the quick check (under a minute on a small mod); full: true runs every linter (minutes on a big mod). Files only, the game is not run. All three games; the verdict is per game.',
    inputSchema: schema({ mod: P.mod, full: { type: 'boolean', description: 'true = every linter (slow)' }, only: { type: 'array', items: { type: 'string' }, description: 'Only these linters (tool names such as sdllint, refcheck, lnglint)' }, with: { type: 'string', description: 'Full path of a patch mod to check together with the mod' }, limit: P.limit }, ['mod']), handler: modCheck },
  { name: 'mow_mod_fix', group: 'mod', title: 'Fix a mod into a patch mod', kind: 'write', games: ALL, wraps: 'fix',
    description: 'Use after mow_mod_check: plans the fixes the kit can make by itself (text encoding, merged text files, missing includes and macros, repointed paths, syntax slips) and, with write: true, writes them into a NEW patch mod folder loaded after the mod. The mod itself is never changed. Answers the files fixed and what could not be fixed. goh: GoH rules and .pot merge; mowas2: the 32-bit view.',
    inputSchema: schema({ mod: P.mod, out: { type: 'string', description: 'Full path of the patch mod folder to make (new, beside the mod)' }, only: { type: 'array', items: { type: 'string' }, description: 'Only these fixers: lng repoint set include macro enc spell syntax asread stubmtl botkeys lngdup' }, mods: P.mods, write: P.write, limit: P.limit }, ['mod', 'out']), handler: modFix },
  { name: 'mow_mod_diff', group: 'mod', title: 'What a mod changes', kind: 'read', games: ALL, wraps: 'overdiff, conflicts --mod-dir',
    description: 'Use to see what a mod changes against the game (or against the game plus earlier mods): per changed file the keys added, changed or removed, and files that replace a whole game file. Answers counts by kind and the first rows; q narrows. A mod in <game>/mods is read as mounted; a folder elsewhere is mounted by its path. goh: every mod folder is read by path.',
    inputSchema: schema({ mod: P.mod, mods: { type: 'array', items: { type: 'string' }, description: 'Mods loaded before it (names in <game>/mods)' }, q: { type: 'string', description: 'Part of a file name or key' }, file: { type: 'string', description: 'Path pattern such as resource/set/** (folder outside <game>/mods only)' }, keys: { type: 'boolean', description: 'true = every key, not the first three per file' }, limit: P.limit }, ['mod']), handler: modDiff },
  { name: 'mow_mods_clash', group: 'together', title: 'Clashes between mods', kind: 'read', games: ALL, wraps: 'conflicts',
    description: 'Use when two or more mods are played together: lists where they change the same key or file, who wins (the last in the order) and what is lost. Answers counts by kind and the first clashes. mods = folder names in <game>/mods in load order; mod_dirs = folders elsewhere, loaded last. mowas2 and goh keep the game\'s mod version gate (a refused mod is named).',
    inputSchema: schema({ mods: P.mods, mod_dirs: { type: 'array', items: { type: 'string' }, description: 'Full paths of mod folders outside <game>/mods (loaded last)' }, file: { type: 'string', description: 'Path pattern such as resource/set/**' }, limit: P.limit }), handler: modsClash },
  { name: 'mow_mods_patch', group: 'together', title: 'Patch mod that keeps both sides', kind: 'write', games: ALL, wraps: 'conflicts/patchmod',
    description: 'Use after mow_mods_clash: plans a small patch mod, loaded last, that holds the merged files of the clashing mods (text keys, set entries, macros), and with write: true writes it into a new folder. The mods are never changed. Answers merged files, what could not be merged and the values both changed. goh: .pot files merge by key; cross-file text fixes are AS2 only.',
    inputSchema: schema({ mods: P.mods, mod_dirs: { type: 'array', items: { type: 'string' }, description: 'Full paths of mod folders outside <game>/mods' }, out: { type: 'string', description: 'Full path of the patch mod folder (new or empty)' }, name: { type: 'string', description: 'Shown name of the patch mod' }, write: P.write, limit: P.limit }, ['out']), handler: modsPatch },
  { name: 'mow_unit_find', group: 'units', title: 'Find a unit', kind: 'read', games: ALL, wraps: 'gui units search (statsheet --units-json)',
    description: 'Use to find a unit by a part of its id or shown name ("panzer 4 h", "t34"): answers id, name, army, kind and price of the matches and "did you mean" names. Searches the buy menu; all: true searches every unit. mod adds a mod folder on top of the game. The first call per game reads the game (about a minute; Gates of Hell far longer when no tool has read it before). goh: an id has one card per period, shown as card.',
    inputSchema: schema({ q: { type: 'string', description: 'Part of the id or name; empty lists all' }, army: { type: 'string', description: 'Army tag such as rus, ger, usa' }, kind: { type: 'string', enum: ['vehicle', 'squad', 'soldier'], description: 'Only this kind' }, all: { type: 'boolean', description: 'true = also units outside the buy menu' }, mod: P.modOpt, limit: P.limit }), handler: unitFind },
  { name: 'mow_unit_stats', group: 'units', title: 'Stats of a unit', kind: 'read', games: ALL, wraps: 'gui units stats, kit, look',
    description: 'Use for one unit\'s numbers: price and resource, rank, cooldown, armour, main gun (penetration at 100 m, damage, reload), members of a squad, its files, and the game\'s value when a mod changed it. show adds "equipment" (what it carries, weapon slots) and "look" (skin, texture variants). goh: no rank and no head start; armour is not broken down.',
    inputSchema: schema({ id: { type: 'string', description: 'Unit id as mow_unit_find shows it' }, card: { type: 'string', description: 'GoH: the card value of the find row (period copy)' }, breed: { type: 'string', description: 'For equipment or look of one soldier of a group: army/name (GoH army/period/name)' }, show: { type: 'array', items: { type: 'string', enum: ['stats', 'equipment', 'look'] }, description: 'Parts to answer, default stats' }, mod: P.modOpt }, ['id']), handler: unitStats },
  { name: 'mow_unit_change', group: 'units', title: 'Change a unit', kind: 'write', games: ALL, wraps: 'gui units change, recipe, kit/set, look/set (gen ops)',
    description: 'Use to change one thing of a unit in a mod folder: what = price, rank, cooldown, headstart, name, armour (value "front side rear top" in mm, part = the armour part), squad (value = soldier count, breed = which member), equipment (add / del / in_hands / slots), skin, texture (texture variant; "none" clears). Answers old -> new and the files; preview unless write: true. Only the mod folder is written. goh: rank, headstart and armour are refused in plain words; names go to a .pot.',
    inputSchema: schema({ mod: P.mod, id: { type: 'string', description: 'Unit id as mow_unit_find shows it' }, what: { type: 'string', enum: ['price', 'rank', 'cooldown', 'headstart', 'name', 'armour', 'squad', 'equipment', 'skin', 'texture'], description: 'What to change' },
      value: { type: ['string', 'number'], description: 'The new value' }, part: { type: 'string', description: 'Armour part name' }, card: { type: 'string', description: 'GoH: the card value of the find row' }, breed: { type: 'string', description: 'One soldier: army/name (GoH army/period/name)' }, entity: { type: 'string', description: 'A vehicle by its entity name (equipment, texture)' },
      add: { type: 'array', items: { type: 'object' }, description: 'Equipment to add: [{item, count?, filled?, filling?}]' }, del: { type: 'array', items: { type: 'string' }, description: 'Equipment to remove (item names)' }, in_hands: { type: 'string', description: 'Item the soldier holds' }, slots: { type: 'object', description: 'Vehicle weapon slots {slot: item or false}' }, write: P.write }, ['mod', 'what']), handler: unitChange },
  { name: 'mow_mod_gen', group: 'mod', title: 'Run gen ops on a mod', kind: 'write', games: ALL, wraps: 'gen ops (gen/lib/ops, in-process on the mod folder)',
    description: 'Use for edits mow_unit_change does not cover: a list of gen ops run on an existing mod folder, such as card, roster (new buy-menu card), clone (new unit from an old one), squad, breed, kit, set (any key of a file), armor, text, gun, shell, item, macro, preset. Answers each op\'s result, the changed files with their first changed lines, and refusals with their code. Preview unless write: true; one refused op stops the whole call. goh: card, roster, squad, breed, set, text and gun forms work; AS2-only ops answer a GEN_*_AS2_ONLY line.',
    inputSchema: schema({ mod: P.mod, ops: { type: 'array', items: { type: 'object' }, description: 'gen ops, e.g. [{op:"card", unit:"t34_0", army:"rus", fields:{cost:100}}]; fields per op in tools/gen/README.md' }, write: P.write }, ['mod', 'ops']), handler: modGen },
  { name: 'mow_text_find', group: 'text', title: 'Find a text', kind: 'read', games: ALL, wraps: 'lng extract',
    description: 'Use to find a shown text or its key: searches the keys and texts of the game (or of a mod folder) and answers key, text and file. q = words, key = the start of a key (desc/entity/t34). The first call per game reads all texts (about 20 s) and keeps them. as64 and mowas2: .lng files, one language set; goh: .pot/.po entries under localizations/<language>/, lang picks one.',
    inputSchema: schema({ q: { type: 'string', description: 'Words in the text or key' }, key: { type: 'string', description: 'Start of the key' }, mod: P.modOpt, lang: { type: 'string', description: 'GoH language folder such as en, ru, default' }, limit: P.limit }), handler: textFind },
  { name: 'mow_text_set', group: 'text', title: 'Set a text', kind: 'write', games: ALL, wraps: 'lng-add',
    description: 'Use to add or replace one text key in a mod (a unit name, a description, a menu line). Answers the file and key; preview unless write: true. An existing key needs force: true. as64 and mowas2: a "#<mod>.lng" file under localization/ (keys of a "#" file have no file prefix); goh: a .pot under localizations/default/interface/text/ (loc = another language folder, then .po).',
    inputSchema: schema({ mod: P.mod, key: { type: 'string', description: 'Key as the game sees it, e.g. desc/entity/my_tank' }, text: { type: 'string', description: 'The text' }, file: { type: 'string', description: 'Text file name; default #<mod>.lng (GoH <mod>.pot)' }, loc: { type: 'string', description: 'GoH language folder, default "default"' }, force: { type: 'boolean', description: 'true = replace an existing key' }, write: P.write }, ['mod', 'key', 'text']), handler: textSet },
  { name: 'mow_map_info', group: 'maps', title: 'Maps and their modes', kind: 'read', games: ALL, wraps: 'mission-clone --list, gui missions facts, mapview',
    description: 'Use to list multiplayer maps (no map: names with their game modes; q and mode narrow) or to read one map: players, each mode\'s flags, start points and bots, with warnings; view: true adds a text picture of the ground. mod reads a mod folder\'s own copy. goh: no map.info, players come from <mode>.info and flags are map points.',
    inputSchema: schema({ map: { type: 'string', description: 'Map name such as 1v1_argentan or multi/2v2_x; left out = list' }, q: { type: 'string', description: 'List: part of the name' }, mode: { type: 'string', description: 'List: only maps with this mode' }, mod: P.modOpt, mods: P.mods, view: { type: 'boolean', description: 'true = add a text picture of the map' }, width: { type: 'integer', description: 'Picture width in characters (20..120)' }, limit: P.limit }), handler: mapInfo },
  { name: 'mow_mission_info', group: 'maps', title: 'Missions of a map', kind: 'read', games: ALL, wraps: 'gui missions readers, misdiff',
    description: 'Use to read a map\'s mission files (<mode>.mi): objects, soldiers, flags, triggers, zones and waypoints per mode; mode names one mission and adds the most placed objects. With mod it also answers what the mod changed in the map\'s missions (entities added, moved, removed, triggers). goh: flags are map points; a mod folder is read by its path.',
    inputSchema: schema({ map: { type: 'string', description: 'Map name such as 1v1_argentan' }, mode: { type: 'string', description: 'One mode such as battle_zones' }, mod: P.modOpt, mods: P.mods, limit: P.limit }, ['map']), handler: missionInfo },
  { name: 'mow_map_clone', group: 'maps', title: 'Copy a map into a mod', kind: 'write', games: ALL, wraps: 'map-clone',
    description: 'Use to make a new map from an existing one: copies the map folder under a new name into a mod folder, rewrites its paths and adds the lobby name. Preview unless write: true. as64 and mowas2: .lng lobby name; goh: .pot lobby name and GoH version in mod.info; a map of the other game family is refused.',
    inputSchema: schema({ map: { type: 'string', description: 'Map to copy, e.g. 1v1_argentan' }, name: { type: 'string', description: 'New map name (letters, digits, _)' }, mod: { type: 'string', description: 'Full path of the mod folder to write into' }, no_mission: { type: 'boolean', description: 'true = leave the mission files out' }, write: P.write }, ['map', 'name', 'mod']), handler: mapClone },
  { name: 'mow_mode_add', group: 'maps', title: 'Add a game mode to a map', kind: 'write', games: ALL, wraps: 'mission-clone',
    description: 'Use to give a map another multiplayer mode: clones its <from>.mi mission to <to>.mi in a mod folder (combat <-> battle_zones adds or strips flags, -> captureflag) and lints the result. Preview unless write: true. goh: GoH mode table; combat and frontline are not served there.',
    inputSchema: schema({ map: { type: 'string', description: 'Map name' }, from: { type: 'string', description: 'Mode the map has, e.g. combat' }, to: { type: 'string', description: 'Mode to add, e.g. battle_zones' }, mod: { type: 'string', description: 'Full path of the mod folder to write into' }, flags: { type: 'integer', description: 'Flag count for battle_zones' }, write: P.write }, ['map', 'from', 'to', 'mod']), handler: modeAdd },
  { name: 'mow_port_plan', group: 'mod', title: 'Plan a move to another game', kind: 'read', games: ALL, wraps: 'upgrade --plan',
    description: 'Use before moving a mod between games (GoH <-> AS2, MoW:AS2 <-> AS64): game = the target. Answers what would change by itself (mod.info range, encoding, .lng <-> .pot, renamed includes), what cannot be converted and what needs a look. Reads only. To goh: text becomes .pot and the GoH version scale; to as64 or mowas2: the AS2 forms.',
    inputSchema: schema({ mod: P.mod, from: { type: 'string', description: 'Game the mod is for now (as64, mowas2, goh); default read from its mod.info' } }, ['mod']), handler: portPlan },
  { name: 'mow_mod_upgrade', group: 'mod', title: 'Upgrade or move a mod', kind: 'write', games: ALL, wraps: 'upgrade --out',
    description: 'Use to upgrade a classic MoW:AS2 mod to AS64 (game: as64) or to move a mod to another game, after mow_port_plan: writes a converted copy of the mod for the target game (game) into a new folder and checks it again. The source mod is never changed. Preview unless write: true. Answers the changes, what was left out and the static verdict; no game is run. To goh: text becomes .pot; to as64 or mowas2: the AS2 forms.',
    inputSchema: schema({ mod: P.mod, out: { type: 'string', description: 'Full path of the new folder for the copy' }, from: { type: 'string', description: 'Game the mod is for now; default from its mod.info' }, write: P.write }, ['mod', 'out']), handler: portCopy },
  { name: 'mow_mod_pack', group: 'mod', title: 'Pack a mod', kind: 'write', games: ALL, wraps: 'packer',
    description: 'Use before sharing a mod: plans its .pak files by role (gamelogic, entity, map, interface, texture, sound) and runs the pack checks (name length, text encoding, loose files that shadow a pak). write: true with out writes the paks into another folder (package: true = a ready mod folder); the mod itself is not changed. goh: localizations/ text stays loose.',
    inputSchema: schema({ mod: P.mod, out: { type: 'string', description: 'Full path of the folder for the paks (outside the mod)' }, package: { type: 'boolean', description: 'true = write a ready mod folder' }, write: P.write, limit: P.limit }, ['mod']), handler: modPack },
  { name: 'mow_file_which', group: 'mod', title: 'Which file wins', kind: 'read', games: ALL, wraps: 'vfs which',
    description: 'Use to see which copy of a game file the game reads with a given mod list: the winning source (game pak, loose file or mod) and the copies it shadows. path as the game sees it (resource/set/... or set/...). All three games; mowas2 reads without as64/core.',
    inputSchema: schema({ path: { type: 'string', description: 'File path as the game sees it' }, mods: P.mods }, ['path']), handler: fileWhich },
  { name: 'mow_entity_info', group: 'units', title: 'Read an entity', kind: 'read', games: ALL, wraps: 'entityindex',
    description: 'Use for the raw facts of an entity by its .def name: source file, what it inherits, its extenders and what it refers to (model, weapons, ammo, items). For buy-menu numbers use mow_unit_stats. mods and mod add mods on top. goh: the first read of the install builds an index and can take very long.',
    inputSchema: schema({ names: { type: 'array', items: { type: 'string' }, description: 'Entity names (up to 8)' }, mods: P.mods, mod: P.modOpt }, ['names']), handler: entityInfo },
].concat(MORE);

module.exports = { group: 'mod', tools };
