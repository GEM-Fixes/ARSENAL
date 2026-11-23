#!/usr/bin/env node
// release-check: a game updated, what does that mean for mods? no game is run, no game file written.
//   node tools/release-check/release-check.js [--as2 dir] [--goh dir] [--snaps dir] [--out dir] [--log f] [--repo dir] [--no-upstream] [--online] [--force] [--json f] [--exe as64|mowas_2|mowas2|goh]
// exe sha vs newest snap baseline per game -> new baseline -> verdiff old vs new -> draft rows (--out, never into tools/upgrade/rules) -> upstreamscan for as64 -> report
//   --promote f: approved draft rows (origin auto, tag kept, id+action required) -> tools/upgrade/rules/<game>/<from>--<to>.json, deduped by id, nothing written if one row is refused
//   --replan mods..: upgrade --plan per mod, summary of what the promoted rows (or --draft ids, else every origin-auto row) hit
//     --to as64|mowas2|mowas_2|goh (mowas_2 = mowas2), --from g[@sha]; no --to = the --promote/--draft pair, else the --exe game, else as64.
//     a mod name is a folder, or a name under <as2>/mods, then <goh>/mods (read only). an install not found is skipped with a line
//   --publish mods..: publish gate (PACKGUARD, rev-port #3): GoH assets never ship. exit 1 + PACK_GOH_ORIGIN / PACK_GOH_RENAMED / PACK_PRIVATE
//     per mod (tools/packer/gohguard.js reads <mod>/GOH-ORIGIN.tsv); exit 0 when every mod is clean
//   --exe g: check only that game's exe: as64 = as64.exe, mowas_2|mowas2 = mowas_2.exe under --as2 (baseline label mowas2-as2), goh = the GoH exe.
//     no --exe: as64.exe and the GoH exe, as before. upstreamscan (the as64 source repo) runs with no --exe or --exe as64 only.
//     the exe log check (tools/exever) always covers the three exes
// exit 0 nothing changed, 1 something changed (read the report), 2 bad call. mowas_2 (3.262) gets no updates; --exe mowas_2 still reads it
// Author: Imperator_Aug (ARSENAL, ia-9eb3a36a)
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { spawnSync } = require('child_process');
const { identify } = require('../lib/exever'), snap = require('../snap/snap'), verdiff = require('../verdiff/verdiff');

// DOOR-B5: the repo layout has two levels up (run/ beside src/). A shipped copy or the exe has none, and its virtual tree
// sits beside the exe, so the old default wrote run/snaps INTO the exe folder. Shipped default = <home>/.as2/run (AS64_RUN overrides both).
const REPO = fs.existsSync(path.join(__dirname, '..', '..', 'modweb', 'porting'));
const RUN = (process.env.AS64_RUN || (REPO ? path.resolve(__dirname, '..', '..', '..', 'run') : path.join(process.env.AS2_HOME || require('os').homedir(), '.as2', 'run'))).replace(/\\/g, '/');
const USAGE = 'usage: ARSENAL release-check [--as2 dir] [--goh dir] [--snaps dir] [--out dir] [--log f] [--repo dir] [--no-upstream] [--online] [--force] [--json f] [--exe as64|mowas_2|mowas2|goh]\n       as2 release-check --promote <draft rules file> [--only id,id] [--rules-dir dir] [--dry] [--replan <mod|path>... [--to as64|mowas2|goh] [--from g]]\n       as2 release-check --replan <mod|path>... [--draft <rules file>] [--to g] [--from g]\n       as2 release-check --publish <mod|path>...   (GoH guard: exit 1 if GoH-origin bytes or a PRIVATE pak are in the mod)';
function args(a) {
  if (a.includes('--help') || a.includes('-h')) { console.log(USAGE); process.exit(0); }
  const o = { as2: require('../lib/gamedir').resolve().dir, goh: require('../lib/gamedir').goh(), snaps: RUN + '/snaps', out: RUN + '/release-check', repo: RUN + '/upstream/as2' };
  const val = new Set(['--as2', '--goh', '--snaps', '--out', '--log', '--repo', '--json', '--promote', '--rules-dir', '--draft', '--only', '--to', '--from']), flag = new Set(['--no-upstream', '--online', '--force', '--dry']);
  for (let i = 0; i < a.length; i++) {
    if (val.has(a[i]) && a[i + 1] !== undefined) o[a[i].slice(2)] = a[++i];
    else if (a[i] === '--exe' && a[i + 1] !== undefined) {
      const w = String(a[++i]).toLowerCase(), g = ['as64', 'mowas_2', 'mowas2', 'goh'].includes(w) && require('../lib/games').get(w);
      if (!g) { console.error('--exe: as64, mowas_2, mowas2 or goh\n' + USAGE); process.exit(2); }
      o.exe = g.id;
    }
    else if (flag.has(a[i])) o[a[i].slice(2)] = true;
    else if (a[i] === '--publish') { o.publish = []; while (a[i + 1] !== undefined && a[i + 1][0] !== '-') o.publish.push(a[++i]); }
    else if (a[i] === '--replan') { o.replan = []; while (a[i + 1] !== undefined && a[i + 1][0] !== '-') o.replan.push(a[++i]); }
    else { console.error(USAGE); process.exit(2); }
  }
  // --to / --from take the game words of upgrade (as64, mowas2, goh); mowas_2 (vfs exe) is the same game. --from may carry @sha
  for (const k of ['to', 'from']) if (o[k] !== undefined) {
    const [w, sha] = String(o[k]).toLowerCase().split('@'), g = ['as64', 'mowas_2', 'mowas2', 'goh'].includes(w) && require('../lib/games').get(w);
    if (!g || (sha !== undefined && k === 'to')) { console.error(`--${k}: as64, mowas2 (mowas_2) or goh${k === 'from' ? ' (optionally @sha)' : ''}\n` + USAGE); process.exit(2); }
    o[k] = g.id + (sha !== undefined ? '@' + sha : '');
  }
  return o;
}

// ---- --promote: approved draft rows -> tools/upgrade/rules/<game>/<from>--<to>.json (one file per from/to pair, deduped by id, origin auto, tag kept)
const RULES_ROOT = path.join(__dirname, '..', 'upgrade', 'rules');
const rulesFile = (dir, from, to) => path.join(dir, to === 'goh' ? 'goh' : 'as2', `${from}--${to}.json`);
function readRows(f) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const rows = Array.isArray(j) ? j : j && Array.isArray(j.rows) ? j.rows : null;
  if (!rows) throw new Error('not a rows array');
  return rows;
}
// returns {ok, lines, added:[ids], pairs} ; writes nothing when any row is refused
function promote(file, dir, opt) {
  const L = [], res = { ok: false, lines: L, added: [], skipped: [], pairs: new Set() };
  let rows;
  try { rows = readRows(file); } catch (e) { L.push(`promote: ${file}: ${e.message}`); return res; }
  const only = opt.only ? new Set(String(opt.only).split(',')) : null;
  if (only) rows = rows.filter(r => r && only.has(r.id));
  const bad = rows.map((r, i) => (!r || typeof r !== 'object' ? `row ${i}: not an object` : !r.id ? `row ${i}: no id` : !r.action ? `row ${r.id}: no action` : !r.from || !r.to ? `row ${r.id}: no from/to` : null)).filter(Boolean);
  if (bad.length) { L.push(`promote: refused, nothing written (${bad.length} bad rows):`, ...bad.slice(0, 10).map(b => '  ' + b)); return res; }
  if (!rows.length) { L.push('promote: no rows to promote'); res.ok = true; return res; }
  const rules = require('../upgrade/lib/rules'), byFile = new Map();
  for (const r of rows) { const f = rulesFile(dir, r.from, r.to); if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(r); }
  const plans = [];
  for (const [f, rs] of byFile) {
    // re-read just before writing: another builder adds rows to the same files
    const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [], have = new Set(cur.map(x => x.id)), add = [];
    for (const r of rs) {
      if (have.has(r.id)) { res.skipped.push(`${r.id} (already in ${path.basename(f)})`); continue; }
      have.add(r.id);
      add.push({ kind: 'warn', scope: '*', evidence: `draft promoted from ${path.basename(file)}`, test: 'none: draft promoted, unverified', ...r, tag: r.tag || 'I', origin: 'auto' });
    }
    try { rules.validate([...cur, ...add], f); } catch (e) { L.push(`promote: refused, nothing written: ${e.message}`); return res; }
    plans.push({ f, cur, add });
  }
  if (opt.dry) L.push('promote --dry: nothing written');
  for (const { f, add } of plans) {
    if (add.length && !opt.dry) {
      const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [], have = new Set(cur.map(x => x.id)), fresh = add.filter(r => !have.has(r.id));
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = f + '.tmp' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify([...cur, ...fresh], null, 1));
      fs.renameSync(tmp, f);
    }
    for (const r of add) { res.added.push(r.id); res.pairs.add(r.from + '>' + r.to); L.push(`added ${r.id} [${r.tag}] ${r.kind}/${r.action} -> ${path.relative(path.join(__dirname, '..', '..'), f).replace(/\\/g, '/')}`); }
  }
  for (const s of res.skipped) L.push('skipped ' + s);
  L.push(`promote: ${res.added.length} added, ${res.skipped.length} skipped${opt.dry ? ' (dry)' : ''}`);
  res.ok = true;
  return res;
}

// ---- --publish: GoH guard per mod (tools/packer/gohguard.js). returns {lines, refused}
const modDirOf = (m, o) => [m, o.as2 && path.join(o.as2, 'mods', m)].find(d => d && fs.existsSync(d) && fs.statSync(d).isDirectory());
function publishGate(mods, o) {
  const gg = require('../packer/gohguard'), L = [];
  let refused = 0, missing = 0;
  for (const m of mods) {
    const dir = modDirOf(m, o);
    if (!dir) { L.push(`${m}: no such mod folder (not a path, not under ${o.as2}/mods)`); missing++; continue; }
    const g = gg.check(dir);
    const cg = require('../lib/creditgate');
    for (const e of cg.treeEntries(dir)) if (cg.privateHit(e.rel)) g.hits.push({ rel: e.rel, code: 'PACK_PRIVATE_MARKS', msg: 'private mark registry / credit tool must not ship' });
    if (g.hits.length) refused++;
    L.push(`${m}: ${g.hits.length ? 'REFUSED, ' + g.hits.length + ' GoH-origin hits' : 'ok'} (GOH-ORIGIN.tsv rows: ${g.ledger})`);
    for (const h of g.hits.slice(0, 40)) L.push(`  ${h.rel}: ${h.code} ${h.msg}`);
    if (g.hits.length > 40) L.push(`  ... ${g.hits.length - 40} more`);
    for (const n of g.notes.slice(0, 10)) L.push(`  info: ${n.rel}: ${n.code} ${n.msg}`);
  }
  L.push(refused ? `PUBLISH REFUSED: ${refused} of ${mods.length} mods hold GoH-origin bytes; GoH assets must never be published` : missing ? 'PUBLISH: some mods not found' : 'PUBLISH OK: no GoH-origin bytes found');
  return { lines: L, refused, missing };
}

// ---- --replan: upgrade --plan on each mod, then what the new rows hit
function replan(mods, o, ids, to, from) {
  const L = [], tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'relreplan-'));
  L.push(`replan: upgrade --plan --to ${to}${from ? ' --from ' + from : ''} on ${mods.length} mods; new rows: ${ids ? ids.size + ' (' + [...ids].slice(0, 6).join(', ') + (ids.size > 6 ? ', ...' : '') + ')' : 'all origin-auto rows'}`);
  for (const m of mods) {
    // a mod name is looked up under <as2>/mods, then <goh>/mods (read only: upgrade --plan writes nothing)
    const dir = [m, o.as2 && path.join(o.as2, 'mods', m), o.goh && path.join(o.goh, 'mods', m)].find(d => d && fs.existsSync(d) && fs.statSync(d).isDirectory());
    if (!dir) { L.push(`  ${m}: no such mod folder (not a path, not under ${[o.as2, o.goh].filter(Boolean).map(d => d + '/mods').join(' or ')})`); continue; }
    const jf = path.join(tmp, 'p.json'), a = [path.join(__dirname, '..', 'upgrade', 'upgrade.js'), dir, '--to', to, '--plan', '--json', jf];
    if (from) a.push('--from', from);
    if (o.as2) a.push('--as2', o.as2); if (o.goh) a.push('--goh', o.goh);
    const t0 = Date.now(), r = spawnSync(process.execPath, a, { encoding: 'utf8', maxBuffer: 1 << 28 });
    let p = null; try { p = JSON.parse(fs.readFileSync(jf, 'utf8')); fs.rmSync(jf); } catch { /* no plan */ }
    if (!p) { L.push(`  ${m}: plan failed (${String(r.stderr || r.stdout).trim().split('\n').pop().slice(0, 160)})`); continue; }
    const hits = ((p.warn && p.warn.hit) || []).filter(h => ids ? ids.has(h.row.id) : h.row.origin === 'auto');
    const n = hits.reduce((s, h) => s + h.n, 0);
    L.push(`  ${p.mod} (${p.from} -> ${p.to}): ${hits.length ? `${hits.length} new rows hit, ${n} places` : 'no new row hits'}; plan total: ${(p.auto || []).length} auto fixes, ${(p.review || []).length} review codes, ${((p.warn && p.warn.hit) || []).length} warn rows hit; ${Date.now() - t0} ms`);
    for (const h of hits) { const e = h.ex[0]; L.push(`    ${h.row.id} x${h.n}${e ? `  e.g. ${e.file}:${e.line}` : ''}`); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return L;
}

// newest <label>-<sha8>.json.gz by the time inside it, the file date moves with copies
function newest(dir, label) {
  if (!fs.existsSync(dir)) return null;
  const re = new RegExp('^' + label + '-([0-9a-f]{8})\\.json\\.gz$');
  const l = fs.readdirSync(dir).map(f => ({ f, m: re.exec(f) })).filter(x => x.m).map(x => ({ file: path.join(dir, x.f), short: x.m[1], t: fs.statSync(path.join(dir, x.f)).mtimeMs }));
  return l.sort((a, b) => b.t - a.t)[0] || null;
}

function dropAs64(s) {
  const a = k => /^as64\//i.test(k);
  for (const k of Object.keys(s.loose)) if (a(k)) delete s.loose[k];
  for (const k of Object.keys(s.paks)) if (a(k)) delete s.paks[k];
  for (const [k, v] of Object.entries(s.entries)) if (a(v[2])) delete s.entries[k];
  return s;
}

function oneGame(g, o, R) {
  const row = { game: g.name, status: 'missing' };
  R.games.push(row);
  if (!g.dir) { R.lines.push(`${g.name}: no install found (name it with ${g.name === 'goh' ? '--goh' : '--as2'} <dir>), skipped`); return; }
  const f = path.join(g.dir, g.exe);
  if (!fs.existsSync(f)) { R.lines.push(`${g.name}: no ${g.exe} under ${g.dir}, skipped`); return; }
  const id = identify(f), base = newest(o.snaps, g.label);
  row.sha = id.short; row.pe = id.pe || null; row.baseline = base && base.short;
  if (base && base.short === id.short && !o.force) { row.status = 'unchanged'; R.lines.push(`${g.name}: ${id.short} same as baseline, nothing to do`); return; }
  fs.mkdirSync(o.snaps, { recursive: true }); fs.mkdirSync(o.out, { recursive: true });
  const nf = path.join(o.snaps, `${g.label}-${id.short}.json.gz`), t0 = Date.now();
  const s = snap.snap(g.dir, {});
  if (g.name === 'mowas2') dropAs64(s); // mowas_2.exe never mounts as64/: keep the AS64 layer out of the MoW:AS2 baseline
  fs.writeFileSync(nf, zlib.gzipSync(JSON.stringify(s)));
  R.changed = true;
  R.lines.push(`${g.name}: exe ${base ? base.short : 'no baseline'} -> ${id.short}${id.pe ? ' (' + id.pe + ')' : ''}, baseline written ${path.basename(nf)}, ${Date.now() - t0} ms`);
  if (!base) { row.status = 'first baseline'; R.lines.push('  nothing to compare with yet'); return; }
  if (base.file === nf) { row.status = 'forced'; R.lines.push('  same exe, --force: data checked against the old baseline is gone, compare by hand'); return; }
  row.status = 'changed';
  const v = verdiff.run(base.file, nf, { from: g.name, to: g.name, top: 20 });
  row.renames = v.renames.length; row.maybes = v.maybes.length;
  const rows = verdiff.rules(v, { from: g.name, to: g.name, top: 20 }), rf = path.join(o.out, `${g.name}-${base.short}--${id.short}.rules.json`);
  fs.writeFileSync(rf, JSON.stringify(rows, null, 1));
  row.rules = rf;
  R.lines.push(...v.lines.slice(0, 12).map(l => '  ' + l));
  R.lines.push(`  ${rows.length} draft rule rows [I] in ${rf}: read them, then copy what holds to tools/upgrade/rules/`);
  R.todo.push(`${g.name}: re-run the gates on one mod you care about (wouldload, upgrade --plan), then a boot on the new exe when you want it proved`);
}

function upstream(o, R) {
  if (o['no-upstream']) return;
  if (!fs.existsSync(o.repo)) { R.lines.push(`upstream: no clone at ${o.repo}, skipped`); return; }
  fs.mkdirSync(o.out, { recursive: true });
  const j = path.join(o.out, 'upstream.json'), rf = path.join(o.out, 'upstream.rules.json');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'upstreamscan', 'upstreamscan.js'), '--from-installed', '--repo', o.repo, '--json', j, '--rules-out', rf, '--top', '10', '-q'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status === 2 || r.error) { R.lines.push('upstream: ' + String(r.stderr || r.error).trim().slice(0, 200)); return; }
  R.lines.push('upstream as64, installed to HEAD:', ...r.stdout.split('\n').filter(Boolean).slice(0, 40).map(l => '  ' + l.slice(0, 160)));
  R.upstream = { json: j, rules: rf };
}

function exever(o, R) {
  // DOOR-B5: no exe log to compare with (shipped copy / exe has no = skip and say so.
  // It used to flag every exe as EXE_NEW_BUILD, which set CHANGED (exit 1) on an unchanged install.
  const logf = o.log || require('../lib/exever').LOG;
  if (!fs.existsSync(logf)) { R.lines.push('exe log: ' + logf.replace(/\\/g, '/') + ' not found, build-log check skipped (snapshots still compare the exe sha with the baseline)'); return; }
  const a = [path.join(__dirname, '..', 'exever', 'exever.js')];
  if (o.as2) a.push('--as2', o.as2); if (o.goh) a.push('--goh', o.goh); // an install not found is left out, not passed as undefined
  if (o.log) a.push('--log', o.log);
  if (o.online) a.push('--online');
  const r = spawnSync(process.execPath, a, { encoding: 'utf8' });
  const lines = r.stdout.split('\n').filter(l => /^[A-Z_]+ /.test(l));
  R.exeLog = lines;
  if (lines.length) { R.changed = true; R.lines.push('exe log:', ...lines.map(l => '  ' + l.slice(0, 200))); R.todo.push('append the new builds to modweb/porting/exe-versions.md'); }
}

function sub(o) {
  const out = [];
  let ids = null, to = o.to, from = o.from;
  if (o.promote) {
    const r = promote(o.promote, o["rules-dir"] || RULES_ROOT, o);
    out.push(...r.lines);
    if (!r.ok) { console.log(out.join("\n")); process.exit(2); }
    ids = new Set(r.added);
    if (!to && r.pairs.size === 1) [from, to] = [...r.pairs][0].split(">");
  } else if (o.draft) {
    try { const rs = readRows(o.draft); ids = new Set(rs.map(x => x.id)); if (!to && rs[0]) { to = rs[0].to; from = from || rs[0].from; } } catch (e) { console.error("--draft: " + e.message); process.exit(2); }
  }
  if (o.replan) {
    if (!o.replan.length) { console.error("--replan needs mod names or folders"); process.exit(2); }
    if (o.promote && o.dry) out.push("replan after --dry promote: the new rows are not in the table, so the hits below are the existing ones");
    out.push(...replan(o.replan, o, o.promote && o.dry ? null : ids, to || o.exe || "as64", from));
  }
  console.log(out.join("\n") + "\nstatic only: rule table and mod folders, no game ran");
  process.exit(0);
}

// the games whose exe is checked, in report order: no --exe = as64 and goh (as before), --exe g = that one
const CHECKS = [{ name: 'as64', exe: 'as64.exe', label: 'as64-as2' }, { name: 'mowas2', exe: 'mowas_2.exe', label: 'mowas2-as2' }, { name: 'goh', exe: 'binaries/x64/call_to_arms.exe', label: 'goh' }];

function main() {
  const o = args(process.argv.slice(2));
  if (o.publish) {
    if (!o.publish.length) { console.error('--publish needs mod names or folders'); process.exit(2); }
    const r = publishGate(o.publish, o);
    console.log(r.lines.join('\n'));
    process.exit(r.refused ? 1 : r.missing ? 2 : 0);
  }
  if (o.promote || o.replan) return sub(o);
  const R = { games: [], lines: [], todo: [], changed: false };
  exever(o, R);
  for (const g of CHECKS) if (o.exe ? g.name === o.exe : g.name !== 'mowas2') oneGame({ ...g, dir: g.name === 'goh' ? o.goh : o.as2 }, o, R);
  if (!o.exe || o.exe === 'as64') upstream(o, R);
  console.log(R.lines.join('\n'));
  if (R.todo.length) console.log('\nTODO\n' + R.todo.map(t => '  ' + t).join('\n'));
  console.log(`\n${R.changed ? 'CHANGED' : 'NOTHING CHANGED'}, static only: no game ran this`);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(R, null, 1));
  process.exit(R.changed ? 1 : 0);
}
if (require.main === module) main();
module.exports = { newest, publishGate };
