// gohsample build: convert every sampled entity with the goh2as2 CLI (one run per entity, so closures that overlap keep their attribution),
// merge the results into one AS2 mod folder <out>/mod. A refusal or failed conversion is recorded as data, never a stop.
// Author: Imperator_Aug (ARSENAL, ia-375678c2)
const fs = require('fs'), path = require('path');
const C = require('./common');

const MOD_NAME = 'gohsample';
// t = C.target(): as64 range = newmod RANGE.as64 (min only, as before); mowas2 = RANGE.mowas2 (3.262.0..3.262.1), through goh2as2/target.js
const modInfoText = t => ['{Mod', ` {Name "${MOD_NAME}"}`, ' {Desc "LOCAL ONLY - converted Gates of Hell sample for crash calibration. Never publish."}', ...(t ? t.modInfo : [' {MinGameVersion "3.301"}']), '}', ''].join('\r\n');

function walkFiles(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, base, out); else out.push(C.fwd(path.relative(base, p)));
  }
  return out;
}

async function convertOne(e, o, work) {
  const rec = { entity: e.entity, kind: e.kind, key: e.key, status: 'refused', reason: '', files: [], closure: 0, dropped: {}, findings: {}, info: {}, skipped: [], ms: 0 };
  fs.rmSync(work, { recursive: true, force: true });
  const args = [path.join(C.TOOLS, 'goh2as2', 'goh2as2.js'), '--goh', o.goh, '--entity', e.key, '--out', work, '--game', o.as2, ...(o.flag || []), '--no-keylint', '--format', 'json', '--no-rc'];
  const r = await C.runNode(args[0], args.slice(1), { timeout: 300000 });
  rec.ms = r.ms;
  let j = null;
  try { j = JSON.parse(r.out); } catch { /* not json */ }
  if (!j) { rec.reason = `goh2as2 gave no json (exit ${r.code}${r.timedOut ? ', timeout' : ''}): ${(r.err || r.out).trim().split(/\r?\n/).pop() || ''}`.slice(0, 300); return rec; }
  const all = j.findings.map(f => ({ ...f, info: false })).concat((j.info || []).map(f => ({ ...f, info: true })));
  for (const f of all) {
    const bag = f.info ? rec.info : rec.findings;
    bag[f.code] = (bag[f.code] || 0) + 1;
    if (/\bdrop\b|omitted|skipped|not copied/i.test(f.msg)) { rec.dropped[f.code] = (rec.dropped[f.code] || 0) + 1; if (/skipped|omitted/.test(f.msg)) rec.skipped.push(f.file); }
  }
  const files = walkFiles(path.join(work, 'resource'));
  rec.files = files.map(f => 'resource/' + f);
  rec.closure = files.length;
  const defWritten = files.includes(e.key);
  const fatal = j.findings.find(f => f.code === 'PORT_NOT_FOUND' || f.code === 'PORT_CRASH');
  if (!defWritten) { rec.status = 'refused'; rec.reason = fatal ? `${fatal.code}: ${fatal.msg}` : 'def not written (nothing converted)'; return rec; }
  if (fatal && (fatal.code === 'PORT_CRASH') && fatal.file === 'resource/' + e.key) { rec.status = 'refused'; rec.reason = `${fatal.code}: ${fatal.msg}`; return rec; }
  rec.status = rec.findings.WARN_PORT_CLOSURE_CAP ? 'partial' : 'converted';
  if (rec.status === 'partial') rec.reason = 'closure stopped at the goh2as2 file cap: references past it dangle';
  if (fatal) rec.reason = (rec.reason ? rec.reason + '; ' : '') + `${fatal.code} on ${fatal.file}: ${fatal.msg}`.slice(0, 200);
  return rec;
}

const MOD_B = 'gohsample_b';

// part B: one goh2as2 --keys run over all sampled non-entity files -> <out>/mod_b (a SEPARATE mod: these override vanilla names)
async function buildB(o, plan, out, log) {
  const files = (plan.partB && plan.partB.files) || [];
  const modB = path.join(out, 'mod_b'), work = path.join(out, 'work_b');
  fs.rmSync(modB, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true });
  if (!files.length) return { files: [], counts: { files: 0, converted: 0, refused: 0 } };
  fs.mkdirSync(work, { recursive: true });
  const keys = path.join(work, 'keys.txt');
  fs.writeFileSync(keys, files.map(f => f.key).join('\r\n') + '\r\n');
  const r = await C.runNode(path.join(C.TOOLS, 'goh2as2', 'goh2as2.js'), ['--goh', o.goh, '--keys', keys, '--out', path.join(work, 'o'), '--game', o.as2, ...(o.flag || []), '--no-keylint', '--format', 'json', '--no-rc'], { timeout: 600000 });
  let j = null;
  try { j = JSON.parse(r.out); } catch { /* none */ }
  const recs = files.map(f => ({ ...f, status: 'refused', reason: '', findings: {}, info: {} }));
  const by = new Map(recs.map(x => [x.key, x]));
  if (!j) for (const x of recs) x.reason = `goh2as2 gave no json (exit ${r.code}): ${(r.err || r.out).trim().split(/\r?\n/).pop() || ''}`.slice(0, 300);
  else {
    for (const f of j.findings.map(x => [x, false]).concat((j.info || []).map(x => [x, true]))) {
      const x = by.get(String(f[0].file).replace(/^resource\//, '').toLowerCase());
      if (!x) continue;
      const bag = f[1] ? x.info : x.findings;
      bag[f[0].code] = (bag[f[0].code] || 0) + 1;
      if (f[0].code === 'PORT_CRASH' || f[0].code === 'WARN_PORT_SKIP_SET_KIND' || f[0].code === 'WARN_PORT_SKIP_KIND') x.reason = `${f[0].code}: ${f[0].msg}`.slice(0, 200);
    }
    for (const x of recs) {
      const src = path.join(work, 'o', 'resource', x.key), dst = path.join(modB, 'resource', x.key);
      if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); x.status = 'converted'; x.reason = ''; }
      else if (!x.reason) x.reason = 'goh2as2 wrote nothing for this key';
    }
  }
  const mi = modInfoText(o.tg).replace(`"${MOD_NAME}"`, `"${MOD_B}"`).replace('converted Gates of Hell sample', 'converted Gates of Hell set/properties sample (overrides vanilla names)');
  C.writeCp1251(path.join(modB, 'mod.info'), mi);
  fs.rmSync(work, { recursive: true, force: true });
  const counts = { files: recs.length, converted: recs.filter(x => x.status === 'converted').length, refused: recs.filter(x => x.status === 'refused').length };
  log(`build part B: ${counts.converted} of ${counts.files} files converted into ${modB} (${r.ms} ms)`);
  return { files: recs, counts };
}

async function build(o) {
  const out = path.resolve(o.out), plan = C.readJson(o.plan);
  const goh = o.goh || plan.meta.goh, as2 = o.as2 || plan.meta.as2;
  C.guardOut(out, goh, as2, o.game);
  const tg = C.target(o, plan);   // game parity: as64 (default) | mowas2
  const T0 = Date.now(), log = o.q ? () => { } : console.log;
  const mod = path.join(out, 'mod'), workRoot = path.join(out, 'work');
  fs.rmSync(mod, { recursive: true, force: true }); fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(mod, 'resource'), { recursive: true });
  C.writeCp1251(path.join(mod, 'mod.info'), modInfoText(tg));
  const oo = { goh, as2, flag: tg.flag };
  const jobs = plan.entities;
  const recs = await C.pool(jobs, +(o.j || 4), async (e, i) => {
    const work = path.join(workRoot, String(i));
    const rec = await convertOne(e, oo, work);
    if ((i + 1) % 10 === 0) log(`  converted ${i + 1}/${jobs.length}`);
    return rec;
  });
  // merge in plan order; same path + same bytes = shared, same path + other bytes = conflict (first wins)
  const owners = new Map(), conflicts = [];
  recs.forEach((rec, i) => {
    if (rec.status === 'refused') return;
    const work = path.join(workRoot, String(i));
    for (const f of rec.files) {
      const src = path.join(work, f), dst = path.join(mod, f);
      if (!owners.has(f)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        owners.set(f, [rec.entity]);
      } else {
        owners.get(f).push(rec.entity);
        if (!fs.readFileSync(src).equals(fs.readFileSync(dst))) conflicts.push({ file: f, entity: rec.entity, first: owners.get(f)[0] });
      }
    }
  });
  fs.rmSync(workRoot, { recursive: true, force: true });
  const shared = {};
  for (const [f, who] of owners) if (who.length > 1) shared[f] = who;
  for (const rec of recs) rec.sharedFiles = rec.files.filter(f => shared[f]).length;
  const ok = recs.filter(r => r.status !== 'refused');
  fs.writeFileSync(path.join(out, 'names.txt'), ok.map(r => r.entity).join('\r\n') + (ok.length ? '\r\n' : ''));
  // mod.info check with the repo's own validator
  const mi = await C.runNode(path.join(C.TOOLS, 'modinfo', 'modinfo.js'), [mod, '-q', '--no-rc'], { timeout: 60000 });
  const miFind = /(\d+) findings/.exec(mi.out);
  const partB = await buildB({ goh, as2, flag: tg.flag, tg }, plan, out, log);
  const reasons = {};
  for (const r of recs) if (r.status === 'refused') { const k = r.reason.replace(/[:(].*$/, '').trim() || 'unknown'; reasons[k] = (reasons[k] || 0) + 1; }
  const res = {
    tool: 'gohsample', version: 1, notice: C.NOTICE, goh: C.fwd(goh), as2: C.fwd(as2), mod: C.fwd(mod),
    counts: { entities: recs.length, converted: recs.filter(r => r.status === 'converted').length, partial: recs.filter(r => r.status === 'partial').length, refused: recs.length - ok.length, files: owners.size, sharedFiles: Object.keys(shared).length, conflicts: conflicts.length },
    partB, refusedReasons: reasons, modInfoFindings: miFind ? +miFind[1] : null, conflicts, shared, entities: recs, ms: Date.now() - T0,
  };
  C.writeJson(path.join(out, 'build.json'), res);
  log(`build: ${res.counts.converted} converted, ${res.counts.partial} partial, ${res.counts.refused} refused; ${owners.size} files, ${Object.keys(shared).length} shared between entities; modinfo ${res.modInfoFindings} findings (${res.ms} ms)`);
  return res;
}

module.exports = { build, MOD_NAME, MOD_B, modInfoText };
