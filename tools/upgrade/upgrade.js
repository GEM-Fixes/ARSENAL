#!/usr/bin/env node
// upgrade: move a mod to as64 | mowas2 | goh. --plan reads loose files and paks, reports READ / WOULD CHANGE / CAN'T / NEEDS A LOOK / TEST, writes nothing but --out/UPGRADE.md.
// without --plan: writes the upgraded mod to --out by rules/<game>/<from>--<to>.json, re-checks it, reports before and after
// usage: node upgrade.js <modDir> --to as64|mowas2|goh [--from as64|mowas2|goh[@sha]] (--plan [--out dir] | --out dir [--mode classic|enhanced] [--only p,p] [--drop p,p] [--patch dir] [--donor auto|name]) [--goh-version V] [--as2 G] [--goh H] [--top N] [--json f]
//   --only / --drop: game paths, a partial conversion such as --only entity/inventory,set/stuff,set/breed. --patch: folder laid over the copy. --donor: GoH vehicle defs replaced by a GoH donor, a person's call
//   --carry [--carry-max MB=500] [--drop-dangling]: AS2 -> GoH only. copies the source install's files the copy refers to and the target lacks, transitively, through the same rewrites; refused binaries listed. output is local-only (assets). --drop-dangling removes what still cannot resolve with its roster rows (lib/carry.js)
//   --plan with --only/--drop/--patch/--donor/--mode/--goh-version runs the real writer into a temp folder (deleted) and appends what the write will do. --carry/--then-fix/--no-link/--carry-max/--drop-dangling need a write: refused (exit 2) under --plan. a flag that cannot apply (--donor off AS2->GoH, --goh-version off goh, --carry-max without --carry) exits 2
//   --then-fix: after the write runs tools/fix apply (safe fixers only, patch folder <out>-fixpatch) and tools/check (--fast when its usage lists it) as child processes, prints one CHAIN block. --to-build: GoH/as64 build sha for the behaviour-warning rows
//   unchanged paks are hardlinked into --out (MB saved printed), copied when the link fails; --no-link copies. nothing later writes through a link: added files and carry's copies unlink the target first, carry's pak rebuilds rename a .new over it
// exit 0 static clean, 3 partial (something left out or findings remain), 2 refused, 1 failed. no game ran either verdict. block rows leave files out of the copy. modDir is never written.
// Author: Imperator_Aug (ARSENAL, ia-bd3733aa)
const fs = require('fs'), path = require('path');
const C = require('../modmove/lib/common'), S = require('../modmove/lib/static'), pak = require('../lib/pak');
const RULES = require('./lib/rules'), W = require('./lib/write'), D = require('./lib/detect'), CARRY = require('./lib/carry'), CHAIN = require('./lib/chain');
const os = require('os');
class UsageErr extends Error {}   // a flag that cannot do what it says: exit 2
// behaviour warnings (warn rows), shown under WARN and counted after the verdict, never changing it
const warnTail = p => { const n = D.total(p.warn); return n ? `, ${p.warn.hit.length} behaviour warnings + ${p.warn.notes.length} notes, read them` : ''; };

// codes the writer fixes. every other MOVE_ code is a person's call
const AUTO = {
  MOVE_VERSION_RANGE: 'mod.info version range', MOVE_VERSION_ABOVE_TARGET: 'mod.info version range', MOVE_GOH_VERSION_SCALE: 'mod.info version range',
  MOVE_INCLUDE_RENAME: 'include path rename', MOVE_NO_MOD_INFO: 'write mod.info', WARN_MOVE_LNG_GOH: '.lng / .pot conversion',
};
const WHY = [[/^mod\.info version range/, 'the target game only loads a mod whose version range fits it'], [/^write mod\.info/, 'the mod had no mod.info and the game ignores a folder without one'],
  [/^Workshop FileId/, 'a copy must not be uploaded over the original Workshop item'], [/^Require .* dropped/, 'the target game already has that mod built in'],
  [/^include path/, 'a file has another path in the target game, so the include points at the new one'], [/^(cp1251 to UTF-8|UTF-8 to cp1251)/, 'the target game reads text in the other encoding'],
  [/line ends/, 'the game reads its text files with CRLF line ends'], [/^\.(lng|pot|po)\b/, 'the target game uses the other translation file format'], [/^as64-only/, 'the Classic game cannot load files made for as64'],
  [/line ends/, 'the game reads its text files with CRLF line ends'], [/^.(lng|pot|po)/, 'the target game uses the other translation file format'], [/^as64-only/, 'the Classic game cannot load files made for as64'],
  [/^as2togoh/, 'Gates of Hell data differs from AS2 here; read the warnings below'], [/^file from --patch/, 'you asked for it with --patch'], [/^Desc credits/, 'you asked for --export']];
const whyOf = k => { const w = WHY.find(([re]) => re.test(k)); return w ? w[1] : 'the target game needs this form'; };
// GX upgrade G7: nothing to edit = say so and what to do next, not "untested"
const modeOf = p => (p.to === 'as64' ? (p.min && p.max ? 'as64 Classic' : 'as64 Enhanced') : p.to);
const SAME = t => (t === 'goh' ? 'goh' : 'as2');

function detectFrom(mi) {
  const v = C.verParse(mi && mi.min);
  if (!v.length) return null;
  if (v[0] < 2) return 'goh';
  return C.verCmp(v, C.MODERN_MIN) >= 0 ? 'as64' : 'mowas2';
}
// every name in the mod, loose and packed
function inventory(modDir) {
  const out = { loose: 0, paks: 0, packed: 0, unreadable: [], names: [] };
  for (const f of C.walk(modDir)) {
    if (!/\.(pak|pat)$/i.test(f)) { out.loose++; out.names.push(f.toLowerCase()); continue; }
    out.paks++;
    try { for (const e of pak.list(path.join(modDir, f))) { out.packed++; out.names.push(e.name.toLowerCase()); } } catch (e) { out.unreadable.push(f + ': ' + e.message); }
  }
  return out;
}
function cants(inv, from, to) {
  const c = [], pick = re => inv.names.filter(n => re.test(n));
  const dll = pick(/\.dll$/), lua = pick(/\.lua$/), net = pick(/(^|\/)map\.net$/);
  if (dll.length) c.push(`${dll.length} DLL (${dll.slice(0, 3).join(', ')}): fixed to one exe build. no conversion, the mod runs without it or not at all. never loaded by this tool`);
  if (lua.length) c.push(`${lua.length} Lua script(s) (${lua.slice(0, 3).join(', ')}): not read or converted`);
  if (net.length && SAME(from) !== SAME(to)) c.push(`${net.length} map.net: format differs across games, first u32 AS2 0a, GoH 05 02, no writer. rebuild the map in the target editor`);
  for (const u of inv.unreadable) c.push(`pak not readable, its content is NOT in this report: ${u}`);
  return c;
}
// progress on stderr (DOOR-B: a large mod printed nothing for minutes): a stage start line once the mod is big, and each stage's time when it took 1 s or more
function stage(o, name, fn) {
  const t = Date.now(); if (o._big) console.error(`upgrade: ${name} ...`);
  const r = fn(), dt = Date.now() - t;
  if (dt >= 1000) console.error(`upgrade: ${name} took ${(dt / 1000).toFixed(1)} s`);
  return r;
}
function plan(modDir, to, o = {}) {
  const mi = S.parseModInfo(modDir);
  const fromRaw = o.from || detectFrom(mi), [from, sha] = String(fromRaw || '').split('@');
  if (!C.TARGETS.includes(from)) throw new Error(`source game unknown (mod.info min "${mi ? mi.min : ''}"): pass --from as64|mowas2|goh`);
  if (!C.TARGETS.includes(to)) throw new Error('--to must be as64, mowas2 or goh');
  const t0 = Date.now(), inv = stage(o, 'inventory', () => inventory(modDir));
  o._big = o._big || inv.names.length > 2000;
  // static caps each code at `top`. a plan reports totals, so no cap unless asked
  const r = stage(o, `static check (${inv.names.length} names)`, () => S.check(modDir, from, to, { as2: o.as2, goh: o.goh, top: o.top || 1e6 }));
  const auto = new Map(), review = new Map(), codes = {};
  // DET-FIX: the walk order of S.check is not fixed: sort before the first finding becomes the e.g. example
  const fkey = f => [f.file || '', f.line || 0, String(f.msg || '')];
  const fcmp = (a, b) => { const x = fkey(a), y = fkey(b); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); };
  for (const f of r.findings.slice().sort(fcmp)) {
    codes[f.code] = (codes[f.code] || 0) + 1;
    const fix = AUTO[f.code], m = fix ? auto : review, k = fix || f.code;
    const e = m.get(k) || m.set(k, { n: 0, ex: f }).get(k); e.n++;
  }
  const cant = cants(inv, from, to);
  let warnRows = []; try { warnRows = RULES.load(from, to); } catch { /* no table: no warn rows */ }
  const warn = stage(o, 'warn rows', () => D.run(modDir, warnRows, from, sha || null, to, o['to-build']));
  const hasEntity = inv.names.some(n => /(^|\/)entity\/.+\.def$/.test(n));
  const test = ['L2 boot + mount: `Mod: activate mod` in the log, on the target exe'];
  if (hasEntity) test.push('L3 preload sweep: lists every changed entity, one match load (tools/preloadsweep)');
  if (inv.names.some(n => /(^|\/)map\//.test(n))) test.push('L4 one map loaded on the target');
  return { mod: path.basename(path.resolve(modDir)), from, sha: sha || null, to, min: mi && mi.min, max: mi && mi.max, inv: { ...inv, names: undefined }, auto: [...auto], review: [...review], codes, cant, warn, test, notes: r.notes, ...(o.time ? { ms: Date.now() - t0, time: true } : {}), verdict: cant.length ? 'partial, untested' : 'untested', noEdit: !auto.size && !review.size && !cant.length && !warn.hit.length };
}
// mod out of the rule table, then the same check on the result. the mod is never written
function upgrade(modDir, to, o) {
  const p = plan(modDir, to, o);
  const rows = RULES.load(p.from, to);
  if (o.donor && !rows.some(x => x.kind === 'as2togoh' && x.action === 'rewrite')) throw new UsageErr(`--donor does nothing for ${p.from} -> ${to}: only AS2 -> GoH replaces vehicle defs`);
  p.exeVer = o['goh-version'] || (to === 'goh' ? C.dataVersion('goh', C.exeOf('goh', C.installs(o))).ver : null);
  if (to === 'goh' && !p.exeVer) throw new Error('GoH exe version not readable: pass --goh or --goh-version');
  p.versionBad = p.auto.some(([k]) => k === 'mod.info version range' || k === 'write mod.info');
  const r = stage(o, 'write', () => W.write(modDir, to, p, rows, o));
  // same from -> to as the plan: from the target to itself no cross-game rule fires and everything reads as fixed
  const chk = () => S.check(path.resolve(o.out), p.from, to, { as2: o.as2, goh: o.goh, top: 1e6 });
  let after = stage(o, 'static check of the output', chk); if (o.carry) after = CARRY.apply({ p, o, to, rows, W, check: chk, first: after });
  const afterC = {}; for (const f of after.findings) afterC[f.code] = (afterC[f.code] || 0) + 1;
  p.rows = rows.map(x => x.id); p.result = r; p.before = p.codes; p.after = afterC;
  // WARN_ codes are [I] notes, the rest are refs or keys the target should lack. no game ran this either way
  const remain = Object.keys(afterC).filter(k => !k.startsWith('WARN_'));
  p.partial = [...r.blocked.map(([k]) => k), ...(r.leftOnly || r.leftDrop ? ['--only/--drop'] : []), ...remain];
  // the plan calls cant items (unread paks, DLL, Lua, map.net) partial; the write says the same so exit 3 matches
  for (const c of p.cant) p.partial.push('cant: ' + c.slice(0, 80));
  if (p.carry) p.partial.push(...CARRY.verdictNotes(p));
  p.verdict = p.partial.length ? 'partial' : 'static clean';
  return p;
}
const linkTail = r => (r.pakLinked ? `, ${r.pakLinked} of those hardlinked (${(r.linkedBytes / 1048576).toFixed(1)} MB not copied; they share disk with the source mod, so edit them only by replacing the file; --no-link copies instead)` : '');
function renderDone(p, out) {
  const L = [`# upgrade: ${p.mod}  ${p.from} -> ${p.to}, written to ${out}`, `READ    ${p.inv.loose} loose files, ${p.inv.paks} paks with ${p.inv.packed} entries. paks: ${p.result.pakRebuilt} rebuilt, ${p.result.pakCopied} copied byte for byte${linkTail(p.result)}`, 'CHANGED'];
  if (!p.result.changes.length) L.push('  nothing');
  for (const [k, e] of p.result.changes) L.push(`  ${String(e.n).padStart(5)}  ${k}   e.g. ${e.ex}`, `         why: ${whyOf(k)}. To undo: delete the out folder (${out}); the source mod was not changed.`);
  L.push("CAN'T"); if (!p.cant.length) L.push('  nothing found'); for (const c of p.cant) L.push('  ' + c);
  L.push('LEFT OUT OF THE COPY'); const { blocked, leftOnly, leftDrop } = p.result;
  if (!blocked.length && !leftOnly && !leftDrop) L.push('  nothing');
  for (const [k, e] of blocked) L.push(`  ${String(e.n).padStart(5)}  ${k}   e.g. ${e.ex}`);
  if (leftOnly) L.push(`  ${String(leftOnly).padStart(5)}  outside --only`);
  if (leftDrop) L.push(`  ${String(leftDrop).padStart(5)}  under --drop`);
  L.push('WARNINGS FROM THE FIXERS'); if (!p.result.warns.length) L.push('  none');
  const w = new Map(); for (const x of p.result.warns) { const e = w.get(x.code) || w.set(x.code, { n: 0, ex: x }).get(x.code); e.n++; }
  for (const [k, e] of w) L.push(`  ${String(e.n).padStart(5)}  ${k}   e.g. ${e.ex.file}: ${String(e.ex.msg).slice(0, 110)}`);
  if (p.carry) L.push(...CARRY.render(p.carry, p.carryBefore, p.carryAfter));
  L.push('STATIC CHECK  code: before -> after');
  for (const k of [...new Set([...Object.keys(p.before), ...Object.keys(p.after)])].sort((a, b) => (p.after[b] || 0) - (p.after[a] || 0))) L.push(`  ${k}: ${p.before[k] || 0} -> ${p.after[k] || 0}`);
  L.push(...D.render(p.warn));
  L.push('TEST    not run:'); for (const t of p.test) L.push('  ' + t);
  if (!p.result.changes.length && !p.result.blocked.length && !p.result.leftOnly && !p.result.leftDrop && !p.partial.length && !p.warn.hit.length) { L.push(`VERDICT no edit needed, already matches ${modeOf(p)}; next: play it (ARSENAL play ${p.mod})`); return L.join('\n') + '\n'; }
  L.push(`VERDICT ${p.verdict}, untested: no game ran this${warnTail(p)}${p.partial.length ? '. open: ' + p.partial.slice(0, 8).join('; ') + (p.partial.length > 8 ? `; +${p.partial.length - 8} more` : '') : ''}`);
  return L.join('\n') + '\n';
}
function render(p) {
  const L = [`# upgrade plan: ${p.mod}  ${p.from}${p.sha ? '@' + p.sha : ''} -> ${p.to}   (mod.info min ${p.min || '-'} max ${p.max || '-'})`];
  L.push(`READ    ${p.inv.loose} loose files, ${p.inv.paks} paks with ${p.inv.packed} entries. text checked, binaries by name only.${p.time ? ' ' + (p.ms / 1000).toFixed(0) + ' s' : ''}`);
  L.push('WOULD CHANGE');
  if (!p.auto.length) L.push('  nothing');
  for (const [k, e] of p.auto) L.push(`  ${String(e.n).padStart(5)}  ${k}   e.g. ${e.ex.file}: ${e.ex.msg.slice(0, 110)}`);
  L.push("CAN'T");
  if (!p.cant.length) L.push('  nothing found');
  for (const c of p.cant) L.push('  ' + c);
  L.push('NEEDS A LOOK  (no fixer, checked statically, [I] where the code is WARN_)');
  if (!p.review.length) L.push('  nothing');
  for (const [k, e] of p.review.sort((a, b) => b[1].n - a[1].n)) L.push(`  ${String(e.n).padStart(5)}  ${k}   e.g. ${e.ex.file}: ${e.ex.msg.slice(0, 110)}`);
  L.push(...D.render(p.warn));
  L.push('TEST    not run:');
  for (const t of p.test) L.push('  ' + t);
  for (const n of p.notes) L.push('note    ' + n);
  if (p.noEdit) { L.push(`VERDICT no edit needed, already matches ${modeOf(p)}; next: play it (ARSENAL play ${p.mod})`); return L.join('\n') + '\n'; }
  L.push(`VERDICT ${p.verdict}: no game ran this${warnTail(p)}`);
  return L.join('\n') + '\n';
}
const USAGE = 'usage: ARSENAL upgrade <modDir> --to as64|mowas2|goh [--from g[@sha]] [--to-build B] (--plan [--out dir] | --out dir [--then-fix] [--no-link] [--export] [--carry [--carry-max MB] [--drop-dangling]]) [--mode classic|enhanced] [--only p,p] [--drop p,p] [--patch dir] [--donor auto|name] [--goh-version V] [--as2 G] [--goh H] [--top N] [--json f]\n  plan honours --only --drop --patch --donor --mode --goh-version by a dry run; --carry --then-fix --no-link need a write';
if (require.main === module) {
  const a = process.argv.slice(2), o = {}, pos = [];
  if (a.includes('--help') || a.includes('-h')) { console.log(USAGE); process.exit(0); }
  const VAL = { '--to': 'to', '--from': 'from', '--out': 'out', '--as2': 'as2', '--goh': 'goh', '--top': 'top', '--json': 'json', '--mode': 'mode', '--goh-version': 'goh-version', '--only': 'only', '--drop': 'drop', '--patch': 'patch', '--donor': 'donor', '--to-build': 'to-build', '--carry-max': 'carry-max' };
  for (let i = 0; i < a.length; i++) { if (VAL[a[i]]) o[VAL[a[i]]] = a[++i]; else if (a[i] === '--plan') o.plan = true; else if (a[i] === '--time') o.time = true; else if (a[i] === '--carry') o.carry = true; else if (a[i] === '--drop-dangling') o['drop-dangling'] = true; else if (a[i] === '--then-fix') o.thenFix = true; else if (a[i] === '--no-link') o['no-link'] = true; else if (a[i] === '--export') o.export = true; else if (a[i].startsWith('-')) { console.error('unknown arg ' + a[i] + '\n' + USAGE); process.exit(2); } else pos.push(a[i]); }
  const bad = m => { console.error('upgrade: ' + m); process.exit(2); };
  if (!pos[0] || !o.to) { console.error(USAGE); process.exit(2); }
  // a flag that would do nothing is refused, never accepted quietly
  if (o.plan) for (const k of ['carry', 'carry-max', 'drop-dangling', 'then-fix', 'no-link', 'export']) if (o[k === 'then-fix' ? 'thenFix' : k]) bad('--' + k + ' needs a write: it copies or changes files, a plan writes none. drop --plan, or drop the flag');
  if ((o['carry-max'] || o['drop-dangling']) && !o.carry) bad('--carry-max / --drop-dangling only work with --carry');
  if (o['carry-max'] !== undefined && !(+o['carry-max'] > 0)) bad('--carry-max needs MB > 0');
  if (o['goh-version'] && o.to !== 'goh') bad('--goh-version only sets the GoH exe version for --to goh');
  if (o.donor && o.to !== 'goh') bad('--donor only applies to --to goh');
  if (o.thenFix && o.to === 'goh' && !C.installs(o).goh) bad('--then-fix needs the GoH install for fix and check: pass --goh');
  if (!o.plan && !o.out) { console.error('upgrade: pass --plan to report, or --out <dir> to write the upgraded copy'); process.exit(2); }
  if (o.mode && !['classic', 'enhanced'].includes(o.mode)) { console.error('--mode must be classic or enhanced'); process.exit(2); }
  if (!fs.existsSync(pos[0])) { console.error('no such mod folder: ' + pos[0]); process.exit(2); }
  if (o.top) { o.top = +o.top; if (!(o.top > 0)) bad('--top needs a number > 0'); }
  if (o.patch && !fs.existsSync(o.patch)) { console.error('no such --patch folder: ' + o.patch); process.exit(2); }
  if (o.out && (path.resolve(o.out).toLowerCase() + path.sep).startsWith(path.resolve(pos[0]).toLowerCase() + path.sep)) { console.error('upgrade: --out inside the mod refused, the mod stays untouched'); process.exit(2); }
  // I-6: any AS2/GoH install by content, Workshop, odd names: refused whatever --as2/--goh say
  if (o.out) { const why = require('../lib/writeguard').refuseWrite(o.out, { game: C.installs(o).as2, purpose: 'write the upgraded copy' }); if (why) bad(why); }
  if (!o.plan) {
    const out = path.resolve(o.out), low = out.toLowerCase() + path.sep, inst = C.installs(o);
    for (const g of [inst.as2, inst.goh]) if (g) { const r = path.resolve(g).toLowerCase() + path.sep; if (low.startsWith(r) && !low.startsWith(r + 'mods' + path.sep)) { console.error('upgrade: --out inside a game install refused, only its mods folder can be written'); process.exit(2); } }
    if (fs.existsSync(out) && !fs.statSync(out).isDirectory()) bad('--out ' + out + ' is a file, not a folder. Pick a new folder for the upgraded copy.');   // I-13
    if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error('upgrade: --out is not empty, refused: ' + out); process.exit(2); }
    let d;
    try { d = upgrade(pos[0], o.to, o); } catch (e) { console.error('upgrade: ' + e.message); process.exit(e instanceof UsageErr ? 2 : 1); }
    let text = renderDone(d, out), ch = null;
    process.stdout.write(text);
    if (!o.export) fs.writeFileSync(path.join(out, 'UPGRADE.md'), text);   // G11 --export: the folder is the mod only
    if (o.thenFix) { ch = CHAIN.chain(out, o.to, o); const t = CHAIN.render(ch, d).join('\n') + '\n'; process.stdout.write(t); if (!o.export) fs.appendFileSync(path.join(out, 'UPGRADE.md'), t); d.chain = ch; }
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(d, null, 1));
    process.exit(d.partial.length || (ch && (ch.skipped || ch.fix.status !== 0 || !ch.check.verdicts.length)) ? 3 : 0);
  }
  let p;
  try { p = plan(pos[0], o.to, o); } catch (e) { console.error('upgrade: ' + e.message); process.exit(2); }
  let text = render(p);
  // write-shaping flags: the plan runs the real writer into a temp folder (deleted) so it shows what the write will do with them
  if (['only', 'drop', 'patch', 'donor', 'mode', 'goh-version'].some(k => o[k])) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'upplan-'));
    try {
      const d = upgrade(pos[0], o.to, { ...o, out: path.join(tmp, 'o'), plan: false });
      text += '\nWITH ' + ['only', 'drop', 'patch', 'donor', 'mode', 'goh-version'].filter(k => o[k]).map(k => '--' + k + ' ' + o[k]).join(' ') + '  (dry run into a temp folder, deleted; the write would do this)\n' + renderDone(d, '(temp)').split('\n').slice(1).join('\n');
      p.dry = { verdict: d.verdict, partial: d.partial, result: d.result, after: d.after };
    } catch (e) { console.error('upgrade: ' + e.message); process.exit(2); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  process.stdout.write(text);
  if (o.out) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, 'UPGRADE.md'), text); }
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(p, null, 1));
}
module.exports = { USAGE, plan, render, upgrade, renderDone, detectFrom, inventory };
