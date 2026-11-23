// detect: which warn rows touch THIS mod, and which apply to this from -> to build pair
// row.detect = {type:'text', files:re on the lowercase path, re, flags} | {type:'path', re} | {type:'modpath', re} | {type:'none'} (note: nothing in mod data can show it)
// loose files and every pak entry are read through one pass; only entries a text detector's `files` matches are inflated
// build filter: row.since = upstream commit. with the upstream clone (blobless, read only, GIT_NO_LAZY_FETCH=1) ancestry decides, else every row applies and a note says so
// Author: Imperator_Aug (ARSENAL, ia-d495c651)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const pak = require('../../lib/pak');
const C = require('../../modmove/lib/common');

const INSTALLED_AS64 = '58826db6';   // game.log Commit 58826db68
const CLONE = process.env.AS2_UPSTREAM || path.resolve(__dirname, '../../../../run/upstream/as2');
const MAX_READ = 64 << 20, SHOW = 3;
const TYPES = new Set(['text', 'path', 'modpath', 'anmmesh', 'none']);   // anmmesh: .anm (files re) that carries mesh-frame records, FRM2 flag 0x20

// true when an EANM FRM2 file has a mesh-frame record, false when it has none, null when it does not parse as FRM2
function anmHasMesh(b) {
  try {
    if (b.length < 24 || b.toString('latin1', 0, 4) !== 'EANM' || b.toString('latin1', 8, 12) !== 'FRMS') return null;
    let p = 16;
    if (b.toString('latin1', p, p + 4) !== 'BMAP') return null;
    const n = b.readInt32LE(p + 4); p += 8;
    for (let i = 0; i < n; i++) p += 4 + b.readInt32LE(p);
    while (p + 4 <= b.length) {
      if (b.toString('latin1', p, p + 4) !== 'FRM2') return null;
      p += 6; const rc = b[p++];
      for (let i = 0; i < rc; i++) { p++; const f = b.readUInt16LE(p); p += 2; if (f & 0x20) return true; if (f & 1) p += 12; if (f & 2) p += 12; }
    }
    return false;
  } catch { return null; }
}

function validateDetect(r, file) {
  const d = r.detect;
  if (!d || !TYPES.has(d.type)) throw new Error(`${file}: warn row ${r.id} needs detect.type ${[...TYPES].join('|')}`);
  if (!r.since || !r.msg) throw new Error(`${file}: warn row ${r.id} needs since and msg`);
  try { if (d.type !== 'none' && d.type !== 'anmmesh') new RegExp(d.re, d.flags || 'i'); if (d.type === 'text' || d.type === 'anmmesh') new RegExp(d.files, 'i'); } catch (e) { throw new Error(`${file}: warn row ${r.id} bad regex: ${e.message}`); }
  if ((d.type === 'text' || d.type === 'anmmesh') && !d.files) throw new Error(`${file}: warn row ${r.id} text detector needs files`);
}

// ---- git ancestry
const cache = new Map();
const hasClone = () => fs.existsSync(path.join(CLONE, '.git')) || fs.existsSync(path.join(CLONE, 'HEAD'));
function git(args) {
  const r = cp.spawnSync('git', ['-C', CLONE, ...args], { encoding: 'utf8', env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, timeout: 20000 });
  return r.error ? { status: 128 } : r;
}
const known = sha => { const k = 'k' + sha; if (!cache.has(k)) cache.set(k, git(['cat-file', '-e', sha + '^{commit}']).status === 0); return cache.get(k); };
// true | false | null (no clone or unknown commit)
function isAncestor(c, of) {
  const k = c + '>' + of;
  if (cache.has(k)) return cache.get(k);
  let v = null;
  if (hasClone() && known(c) && known(of)) v = git(['merge-base', '--is-ancestor', c, of]).status === 0;
  cache.set(k, v);
  return v;
}

// rows -> {fire, after, fixed, before, info}. from/sha = source build, toBuild = target build
// normal row: fires when `since` is in the target (and not already in the source build).
//   not in target -> after (reads "after your build"); in the source build already -> before.
// bug row (bug:true, since = the fix): the build bug is present while the fix is NOT in the target -> fire; fix in target -> fixed
// a draft promoted by release-check has no detector: it reads as a note, its commit (if any) from evidence
function normal(r) {
  if (r.detect && r.msg) return r;
  const since = r.since || (/^[0-9a-f]{7,40}$/.test(r.evidence || '') ? r.evidence : null);
  return { ...r, detect: r.detect || { type: 'none' }, msg: r.msg || r.note || r.evidence || r.id, since };
}
function applicable(rows, from, sha, to, toBuild) {
  const out = { fire: [], after: [], fixed: [], before: [], info: [] };
  const tb = toBuild || (to === 'as64' ? INSTALLED_AS64 : null);
  const warn = rows.filter(r => r.kind === 'warn' && r.action === 'warn').map(normal);
  let fell = false;
  for (const r of warn) {
    if (!r.since) { out.fire.push(r); continue; }
    const inTarget = tb ? isAncestor(r.since, tb) : null;
    const inSource = from === 'as64' && sha ? isAncestor(r.since, sha) : false;
    if (inTarget === null || (from === 'as64' && sha && inSource === null)) { fell = true; out.fire.push(r); continue; }
    if (r.bug) { (inTarget ? out.fixed : out.fire).push(r); continue; }
    if (!inTarget) out.after.push(r);
    else if (inSource) out.before.push(r);
    else out.fire.push(r);
  }
  if (warn.length && fell) out.info.push(!hasClone() ? `no upstream clone (maintainer only, AS2_UPSTREAM=<as2 git clone>): build filter off, every warn row applies` : `commit or build unknown to the upstream clone: build filter off for those rows, they apply`);
  if (from === 'as64' && !sha && warn.length) out.info.push('no --from as64@<sha>: every row since the first as64 build is listed, pass the build the mod last ran on to cut it');
  if (tb && warn.length) out.info.push(`target build ${tb}${toBuild ? '' : ' (the installed as64 build; --to-build <sha> overrides)'}`);
  return out;
}

// ---- scan the mod once
function scan(modDir, rows) {
  const hits = new Map(rows.map(r => [r.id, { n: 0, ex: [] }]));
  const hit = (r, file, line, text) => { const h = hits.get(r.id); h.n++; if (h.ex.length < SHOW) h.ex.push({ file, line, text: text && String(text).trim().slice(0, 80) }); };
  const px = rows.filter(r => r.detect.type === 'path').map(r => [r, new RegExp(r.detect.re, r.detect.flags || 'i')]);
  const tx = rows.filter(r => r.detect.type === 'text').map(r => [r, new RegExp(r.detect.files, 'i'), new RegExp(r.detect.re, (r.detect.flags || 'i').replace('g', ''))]);
  const ax = rows.filter(r => r.detect.type === 'anmmesh').map(r => [r, new RegExp(r.detect.files, 'i')]);
  const abs = path.resolve(modDir).replace(/\\/g, '/');
  for (const r of rows.filter(x => x.detect.type === 'modpath')) if (new RegExp(r.detect.re, r.detect.flags || 'i').test(abs)) hit(r, '(mod folder)', 0, abs);
  const textOf = buf => buf.toString('latin1');
  const lineOf = (s, i) => { let n = 1; for (let k = s.indexOf('\n'); k >= 0 && k < i; k = s.indexOf('\n', k + 1)) n++; return n; };
  const test = (name, shown, getBuf) => {
    const low = name.toLowerCase();
    for (const [r, re] of px) if (re.test(low)) hit(r, shown, 0, null);
    for (const [r, re] of ax) if (re.test(low)) { let v = null; try { v = anmHasMesh(getBuf()); } catch { /* too big */ } if (v) hit(r, shown, 0, null); }
    let s = null;
    for (const [r, fre, re] of tx) {
      if (!fre.test(low)) continue;
      if (s === null) { try { s = textOf(getBuf()); } catch { s = ''; } }
      const m = re.exec(s);
      if (m) { const ls = s.lastIndexOf('\n', m.index) + 1, le = s.indexOf('\n', m.index); hit(r, shown, lineOf(s, m.index), s.slice(ls, le < 0 ? undefined : le)); }
    }
  };
  const needText = tx.length > 0 || ax.length > 0;
  const unreadable = [];
  for (const f of C.walk(modDir)) {
    if (!/\.(pak|pat)$/i.test(f)) {
      test(f, f, () => fs.readFileSync(path.join(modDir, f)));
      continue;
    }
    let ents;
    try { ents = pak.list(path.join(modDir, f)); } catch (e) { unreadable.push(f + ': ' + e.message); continue; }
    if (needText) ents.fd = fs.openSync(path.join(modDir, f), 'r');
    try {
      for (const e of ents) {
        if (e.name.endsWith('/')) continue;
        test(e.name, `${f}!${e.name}`, () => { if (e.size > MAX_READ) throw new Error('big'); return pak.read(ents, e); });
      }
    } finally { if (ents.fd !== undefined) fs.closeSync(ents.fd); }
  }
  return { hits, unreadable };
}

// the whole step. → {hit:[{row,n,ex}], notes:[row], after:[row], fixed:[row], before:[row], info:[str], unreadable}
function run(modDir, rows, from, sha, to, toBuild) {
  const ap = applicable(rows, from, sha, to, toBuild);
  const det = ap.fire.filter(r => r.detect.type !== 'none'), notes = ap.fire.filter(r => r.detect.type === 'none');
  const { hits, unreadable } = det.length ? scan(modDir, det) : { hits: new Map(), unreadable: [] };
  return { hit: det.filter(r => hits.get(r.id).n).map(r => ({ row: r, ...hits.get(r.id) })), clean: det.filter(r => !hits.get(r.id).n).length, notes, after: ap.after, fixed: ap.fixed, before: ap.before, info: ap.info, unreadable };
}

// report lines. total = number printed in the verdict
const total = w => (w ? w.hit.length + w.notes.length : 0);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '~' : s);
function render(w) {
  const L = [];
  if (!w) return L;
  const t = `${w.hit.length} hit${w.hit.length === 1 ? '' : 's'} in mod data, ${w.notes.length} notes, ${w.clean} detectors found nothing`;
  L.push(`WARN    behaviour changes on the target exe, from the commit log, none run in game. ${t}`);
  for (const h of w.hit) {
    const r = h.row;
    L.push(`  ${String(h.n).padStart(5)}  ${r.id} [${r.tag}] ${clip(r.msg, 120)}${r.bug ? ' (build bug)' : ''}`);
    for (const e of h.ex) L.push(`           ${e.file}${e.line ? ':' + e.line : ''}${e.text ? '  ' + e.text : ''}`);
    L.push(`           test: ${r.test}`);
  }
  if (w.notes.length) {
    L.push('  notes, nothing in mod data can show these (read once):');
    for (const r of w.notes) L.push(`    ${r.id} [${r.tag}] ${clip(r.msg, 110)}`);
  }
  if (w.after.length) L.push(`  after your build, not in the target exe: ${w.after.map(r => r.id).join(' ')}`);
  if (w.fixed.length) L.push(`  build bugs fixed in the target: ${w.fixed.map(r => r.id).join(' ')}`);
  if (w.before.length) L.push(`  already in your source build, no change: ${w.before.map(r => r.id).join(' ')}`);
  for (const u of w.unreadable) L.push(`  pak not readable, its content was not scanned: ${u}`);
  for (const i of w.info) L.push('  note: ' + i);
  return L;
}
module.exports = { run, applicable, scan, render, total, isAncestor, validateDetect, INSTALLED_AS64, CLONE };
