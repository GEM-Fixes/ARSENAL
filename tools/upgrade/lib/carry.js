// carry: --carry copies the source game's own assets that the target lacks (and the mod refers to) into the upgraded copy, transitively.
//   run(c) -> result   c = { out, from, to, o, plan, rows, findings, W (write.js) }   findings = post-write static check of out
// each round: wanted keys -> source vfs -> sniff binary headers (refuse what the target cannot read) -> stage -> W.write (same rule rewrites as mod files)
//   -> copy into out at the mod's own layout -> static check of the staged files (explicit refs) + implicit refs (ply -> mtl, mtl -> texture, fireSound) -> next round
// dropDangling(c) removes what still cannot resolve, with the roster entries that name it. mod.info Desc and the CARRIED section say: local use only.
// legal: the carried files are the source game's assets. a copy that holds them is for local play, never published.
// Author: Imperator_Aug (ARSENAL, ia-08ff3c7b)
const fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const C = require('../../modmove/lib/common'), S = require('../../modmove/lib/static'), K = require('../../modmove/lib/keysets');
const vfs = require('../../lib/vfs'), pak = require('../../lib/pak'), names = require('../../lib/names'), { writeZip } = require('../../lib/zipwrite');
const PLY = require('../../binhdr/ply');

const MB = 1048576;
const TEX_EXT = ['.dds', '.tga', '.ebm', '.tex', '.bmp', '.jpg', '.png'];
const SCAN_EXT = /\.(ply|mtl|ebm|tex|set|weapon|ammo|pattern|def|ext|inc)$/;
const strip = k => k.toLowerCase().replace(/\\/g, '/').replace(/^resource\//, '');
const dirOf = k => k.slice(0, k.lastIndexOf('/') + 1);
const extOf = k => { const i = k.lastIndexOf('.'); return i < 0 || k.indexOf('/', i) >= 0 ? '' : k.slice(i + 1); };
const norm = p => { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); };

// binary headers. AS2 and GoH share EPLY EANM EVLM DDS #10); BPLY is a map-mesh variant GoH has once in 120 samples
function sniff(key, b) {
  const e = extOf(key), m4 = b.toString('latin1', 0, 4);
  if (e === 'ply') return m4 === 'EPLY' ? null : m4 === 'BPLY' ? 'BPLY big-mesh .ply: GoH reads it rarely (1 of 120 sampled), an AS2 BPLY is not shown to load there' : `.ply magic ${JSON.stringify(m4)} is not EPLY`;
  if (e === 'anm') return m4 === 'EANM' ? null : `.anm magic ${JSON.stringify(m4)} is not EANM`;
  if (e === 'vol') return m4 === 'EVLM' ? null : `.vol magic ${JSON.stringify(m4)} is not EVLM`;
  if (e === 'dds') return m4 !== 'DDS ' ? `.dds magic ${JSON.stringify(m4)}` : b.toString('latin1', 84, 88) === 'DX10' ? 'DX10 .dds: no loader in this engine family' : null;
  if (e === 'wav') return m4 === 'RIFF' ? null : '.wav is not RIFF';
  if (e === 'ogg') return m4 === 'OggS' ? null : '.ogg is not OggS';
  if (b.length === 0) return 'empty file';
  return null;
}

function listOut(out) {   // [{key, rel, pak?}] every file the copy holds, loose and packed
  const r = [];
  for (const f of C.walk(out)) {
    if (!/\.(pak|pat)$/i.test(f)) { r.push({ key: strip(f), rel: f }); continue; }
    try { for (const e of pak.list(path.join(out, f))) if (!e.name.endsWith('/')) r.push({ key: strip(e.name), rel: f, pak: f, name: e.name }); } catch { /* unreadable pak: names unknown */ }
  }
  return r;
}
const layoutOf = out => (fs.existsSync(path.join(out, 'resource')) ? 'resource/' : ['entity', 'set', 'texture'].some(d => fs.existsSync(path.join(out, d))) ? '' : 'resource/');

// ---- implicit references: what the static check does not see (binary .ply, extension-less texture and sound names)
function texWants(name, dir, add) {
  const n = name.toLowerCase().replace(/\\/g, '/').trim();
  if (!n || n[0] === '#' || /[<%{}]/.test(n)) return;
  add(n.startsWith('$/') ? norm('texture/common/' + n.slice(2)) : n.startsWith('/') ? norm(n.slice(1)) : norm(dir + n), 'tex');
}
function implicitRefs(key, buf, add) {
  const e = extOf(key), dir = dirOf(key);
  if (e === 'ply') {
    let r; try { r = PLY.meshRefs(buf); } catch { return; }
    for (const m of r.mtls) { const k = names.resolve(m, 'resource/' + dir).key.replace(/^resource\//, ''); if (/\.mtl$/.test(k)) add(k, 'mtl'); }
    for (const t of r.tex) texWants(t, dir, add);
    return;
  }
  const s = buf.toString('latin1').replace(/;[^\n]*/g, '');
  if (e === 'mtl') for (const m of s.matchAll(/\{\s*(?:diffuse|bump|specular|envmap|mask|height)\s+"([^"]+)"/gi)) texWants(m[1], dir, add);
  else if (e === 'ebm' || e === 'tex') for (const m of s.matchAll(/\{?\s*(?:reference|frame)\s+"([^"]+)"/gi)) texWants(m[1], dir, add);
  if (/^(set|weapon|ammo|pattern|def)$/.test(e)) for (const m of s.matchAll(/\{\s*(fireSound|reloadSound)\s+"([^"]+)"/gi)) add((/^fire/i.test(m[1]) ? 'sound/weapon/shot/' : 'sound/weapon/reload/') + norm(m[2].toLowerCase()), 'snd');
  // any quoted .wav name in a set/def (not only fire/reload): sound/<path>. the 'snd' want only carries what the source install has
  if (/^(set|weapon|ammo|pattern|def)$/.test(e)) for (const m of s.matchAll(/"([^"\r\n]+)\.wav"/gi)) { const n = norm(m[1].toLowerCase().replace(/\\/g, '/')); if (n.includes('/') && !/[<%{}]/.test(n)) add(n.startsWith('sound/') ? n : 'sound/' + n, 'snd'); }
}

function run(c) {
  const t0 = Date.now(), o = c.o, out = path.resolve(c.out), cap = (+o['carry-max'] || 500) * MB;
  if (c.to !== 'goh' || c.from === 'goh') throw new Error('--carry: only AS2 -> GoH so far (the carried files are the AS2 install\'s)');
  const inst = C.installs(o), srcRoot = C.rootOf(c.from, inst), dstRoot = C.rootOf(c.to, inst);
  if (!srcRoot || !fs.existsSync(srcRoot)) throw new Error('--carry: source game install not found, pass --as2');
  const v = vfs.build({ gameDir: srcRoot, mods: [], exe: c.from === 'as64' ? 'as64' : 'mowas_2' });
  const src = new Map(); for (const [k, r] of v.files) src.set(strip(k), r);
  const dst = K.vanillaKeys(c.to, dstRoot);
  const pre = layoutOf(out), have = new Set(listOut(out).map(x => x.key));
  const dstDirs = new Set(); for (const k of dst) if (k.startsWith('sound/')) { let i = k.length; while ((i = k.lastIndexOf('/', i - 1)) > 5) dstDirs.add(k.slice(0, i)); }
  const entBy = new Map(); for (const k of src.keys()) { const m = /^entity\/(?:.*\/)?([^/]+)\.def$/.exec(k); if (m) (entBy.get(m[1]) || entBy.set(m[1], []).get(m[1])).push(k); }

  const st = { queue: [], seen: new Set(), carried: new Map(), cant: new Map(), refBy: new Map(), bytes: 0, capHit: false, capSkipped: 0, rounds: 0 };
  const link = (key, parent) => { if (!parent) return; (st.refBy.get(key) || st.refBy.set(key, new Set()).get(key)).add(parent); };
  const want = (key, parent, why) => {
    key = strip(key);
    if (!src.has(key)) return;
    link(key, parent);
    if (dst.has(key) || have.has(key) || st.seen.has(key)) return;
    st.seen.add(key); st.queue.push({ key, why: why || 'ref' });
  };
  const wantImplicit = (parent) => (k, kind) => {
    if (kind === 'tex') {   // any variant already on the target or in the copy settles the name
      if (TEX_EXT.some(x => dst.has(k + x) || have.has(k + x)) || dst.has(k) || have.has(k)) return;
      for (const x of TEX_EXT) want(k + x, parent, 'texture');
    } else if (kind === 'snd') {
      if (dst.has(k + '.wav') || dstDirs.has(k) || have.has(k + '.wav')) return;
      if (src.has(k + '.wav')) want(k + '.wav', parent, 'sound');
      else for (const sk of src.keys()) if (sk.startsWith(k + '/') && /\.wav$/.test(sk)) want(sk, parent, 'sound');
    } else if (kind === 'mtl') {
      if (!dst.has(k) && !have.has(k) && !dst.has(dirOf(k) + '.materials') && !have.has(dirOf(k) + '.materials')) want(k, parent, 'material');
    }
  };
  const fromFindings = fs => {
    for (const f of fs) {
      const holder = strip(f.file || '');
      if (f.code === 'MOVE_REF_MISSING_ON_TARGET') { const m = /\(resource\/(.+)\) but not in /.exec(f.msg); if (m) want(m[1], holder, 'ref'); }
      else if (f.code === 'WARN_MOVE_ENTITY_MISSING_ON_TARGET') { const m = /^"([^"]+)" matches an entity def/.exec(f.msg); if (m) for (const k of entBy.get(m[1].toLowerCase()) || []) if (!dst.has(k)) want(k, holder, 'entity'); }
    }
  };
  fromFindings(c.findings);
  // the copy's own materials, meshes, texture lists and weapon sets name more than the static check reads
  if (!o['carry-no-own']) {
    const ownScan = (it, read) => { if (!SCAN_EXT.test(it.key) || /^map\//.test(it.key)) return; const b = read(); if (b) implicitRefs(it.key, b, wantImplicit(it.key)); };
    const paks = new Map();
    try {
      for (const it of listOut(out)) {
        if (!SCAN_EXT.test(it.key) || /^map\//.test(it.key) || /\.(def|ext|inc)$/.test(it.key)) continue;
        if (!it.pak) { ownScan(it, () => fs.readFileSync(path.join(out, it.rel))); continue; }
        let ents = paks.get(it.pak); if (!ents) { ents = pak.list(path.join(out, it.pak)); ents.fd = fs.openSync(path.join(out, it.pak), 'r'); ents.by = new Map(ents.map(e => [e.name, e])); paks.set(it.pak, ents); }
        ownScan(it, () => { const e = ents.by.get(it.name); return e ? pak.read(ents, e) : null; });
      }
    } finally { for (const e of paks.values()) if (e.fd !== undefined) fs.closeSync(e.fd); }
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
  try {
    while (st.queue.length) {
      st.rounds++;
      const batch = st.queue.splice(0), sin = path.join(tmp, 'in' + st.rounds), sout = path.join(tmp, 'out' + st.rounds), staged = [];
      for (const w of batch) {
        const rec = src.get(w.key), size = rec.size || 0;
        if (st.bytes + size > cap) { st.capHit = true; st.capSkipped++; continue; }
        let b; try { b = vfs.readRec(rec); } catch (e) { st.cant.set(w.key, { why: 'unreadable in the source: ' + e.message }); continue; }
        const bad = sniff(w.key, b);
        if (bad) { st.cant.set(w.key, { why: bad }); continue; }
        st.bytes += b.length; staged.push(w);
        const p = path.join(sin, 'resource', w.key); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b);
      }
      if (!staged.length) continue;
      c.W.write(sin, c.to, c.plan, c.rows, { out: sout, donor: o.donor, as2: o.as2, goh: o.goh });
      const got = [];
      for (const w of staged) {
        const sp = path.join(sout, 'resource', w.key);
        if (!fs.existsSync(sp)) { st.cant.set(w.key, { why: 'a rule row blocks this file or drops it (rules/goh)' }); st.bytes -= src.get(w.key).size || 0; continue; }
        const dp = path.join(out, pre + w.key); fs.mkdirSync(path.dirname(dp), { recursive: true }); try { fs.unlinkSync(dp); } catch { /* none there */ } fs.copyFileSync(sp, dp);
        have.add(w.key); st.carried.set(w.key, { size: fs.statSync(dp).size, why: w.why }); got.push(w.key);
      }
      // explicit refs of the rewritten files: the same static check, scoped to them, everything else known through extraKeys
      const r = S.check(sout, c.from, c.to, { as2: o.as2, goh: o.goh, top: 1e6, extraKeys: have, noLint: true });
      fromFindings(r.findings.filter(f => /^(MOVE_REF|WARN_MOVE_ENTITY)_MISSING_ON_TARGET$/.test(f.code)));
      for (const k of got) if (SCAN_EXT.test(k)) { const f = path.join(sout, 'resource', k); if (fs.existsSync(f)) implicitRefs(k, fs.readFileSync(f), wantImplicit(k)); }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // what a refused file takes with it: the defs and set files that reach it
  const lost = new Map();
  for (const k of st.cant.keys()) {
    const seen = new Set([k]), q = [k];
    while (q.length) { const x = q.shift(); for (const p of st.refBy.get(x) || []) { if (seen.has(p)) continue; seen.add(p); q.push(p); if (!/^set\/multiplayer\//.test(p)) (lost.get(p) || lost.set(p, new Set()).get(p)).add(k); } }
  }
  const byExt = {}; for (const [k, e] of st.carried) { const x = extOf(k) || '-'; const b = byExt[x] || (byExt[x] = { n: 0, bytes: 0 }); b.n++; b.bytes += e.size; }
  const carried = [...st.carried.keys()].sort();
  if (carried.length) fs.writeFileSync(path.join(out, 'CARRIED.txt'), `files copied from ${srcRoot} (local use only, never publish)\r\n` + carried.map(k => k + '  (' + st.carried.get(k).why + ')').join('\r\n') + '\r\n');
  if (carried.length) markLocal(out, srcRoot);
  return {
    srcGame: srcRoot, n: carried.length, mb: +(carried.reduce((a, k) => a + st.carried.get(k).size, 0) / MB).toFixed(1), rounds: st.rounds, capMb: cap / MB, capHit: st.capHit, capSkipped: st.capSkipped,
    byExt, carried, cant: [...st.cant].map(([k, e]) => ({ key: k, why: e.why })), lost: [...lost].map(([k, s]) => ({ key: k, via: [...s].slice(0, 3), carried: st.carried.has(k), unit: /\.(def|set|ammo|weapon)$/.test(k) })).filter(l => l.carried || l.unit), layout: pre || '(root)', ms: Date.now() - t0,
  };
}

// mod.info Desc says local use. no Desc line: one is added
function markLocal(out, srcRoot) {
  const f = path.join(out, 'mod.info'); if (!fs.existsSync(f)) return;
  let s = fs.readFileSync(f).toString('latin1');
  const note = ' \\n LOCAL USE ONLY: holds assets copied from ' + path.basename(srcRoot) + '. never publish.';
  if (s.includes('LOCAL USE ONLY')) return;
  if (/\{\s*Desc\s+"/i.test(s)) s = s.replace(/(\{\s*Desc\s+"[^"]*)"/i, (m, a) => a + note.replace(/\\n/, '\\n') + '"');
  else { const at = s.lastIndexOf('}'), eol = s.includes('\r\n') ? '\r\n' : '\n'; if (at < 0) return; s = s.slice(0, at) + `\t{Desc "LOCAL USE ONLY: holds assets copied from ${path.basename(srcRoot)}. never publish."}${eol}` + s.slice(at); }
  fs.writeFileSync(f, Buffer.from(s, 'latin1'));
}

// ---- drop-dangling
// roster rows are top-level {"name" ...} blocks. removes the ones named in `ns`, keeps every other byte
function dropRoster(text, ns) {
  let out = '', i = 0, depth = 0, removed = 0, last = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === ';') { while (i < n && text[i] !== '\n') i++; continue; }
    if (ch === '"') { i++; while (i < n && text[i] !== '"' && text[i] !== '\n') i++; i++; continue; }
    if (ch === '{') {
      if (depth === 0) {
        const m = /^\{\s*"([^"\n]+)"/.exec(text.slice(i, i + 200));
        if (m && ns.has(m[1].toLowerCase())) {
          let d = 0, j = i;
          for (; j < n; j++) { const cj = text[j]; if (cj === ';') { while (j < n && text[j] !== '\n') j++; j--; } else if (cj === '"') { j++; while (j < n && text[j] !== '"' && text[j] !== '\n') j++; } else if (cj === '{') d++; else if (cj === '}' && --d === 0) { j++; break; } }
          let ls = i; while (ls > last && /[ \t]/.test(text[ls - 1])) ls--;
          if (text[j] === '\r') j++; if (text[j] === '\n') j++;
          out += text.slice(last, ls); last = j; i = j; removed++; continue;
        }
      }
      depth++;
    } else if (ch === '}') depth--;
    i++;
  }
  return { text: out + text.slice(last), removed };
}
// patch the copy: drop keys, edit keys. loose files in place, a pak with a change is rebuilt under the same name
function patchOut(out, drop, edit) {
  const gone = [], edited = [];
  for (const it of listOut(out)) {
    const full = path.join(out, it.rel);
    if (it.pak) continue;
    if (drop.has(it.key)) { fs.unlinkSync(full); gone.push(it.key); continue; }
    if (edit.has(it.key) || (edit.glob && edit.glob.test(it.key))) { const b = fs.readFileSync(full), nb = edit.apply(it.key, b); if (nb && Buffer.compare(nb, b)) { fs.writeFileSync(full, nb); edited.push(it.key); } }
  }
  for (const f of C.walk(out).filter(x => /\.(pak|pat)$/i.test(x))) {
    const p = path.join(out, f); let ents; try { ents = pak.list(p); } catch { continue; }
    ents.fd = fs.openSync(p, 'r');
    const nb = new Map(), kept = [];
    try {
      for (const e of ents) {   // edits first: a pak is rebuilt only when something in it changes
        const k = strip(e.name);
        if (e.name.endsWith('/') || drop.has(k) || !edit.glob || !edit.glob.test(k)) continue;
        const ob = pak.read(ents, e), x = edit.apply(k, ob);
        if (x && Buffer.compare(x, ob)) nb.set(e, x);
      }
      if (!nb.size && !ents.some(e => drop.has(strip(e.name)))) continue;
      for (const e of ents) {
        if (e.name.endsWith('/')) continue;
        const k = strip(e.name);
        if (drop.has(k)) { gone.push(k); continue; }
        if (nb.has(e)) edited.push(k);
        const b = nb.get(e);
        kept.push([e.name, b ? () => b : () => pak.read(ents, e), e.method !== 0 || !!b]);
      }
      if (kept.length) writeZip(p + '.new', kept);
    } finally { fs.closeSync(ents.fd); }
    if (kept.length) fs.renameSync(p + '.new', p); else fs.unlinkSync(p);
  }
  return { gone, edited };
}
// c = { out, findings (final static check of out), carry (run result or null) }
function dropDangling(c) {
  const out = path.resolve(c.out), pre = layoutOf(out), drop = new Set(), nameSet = new Set(), why = [];
  const holders = new Set();
  for (const f of c.findings) {
    if (!/^(MOVE_REF|WARN_MOVE_ENTITY)_MISSING_ON_TARGET$/.test(f.code)) continue;
    const h = strip(f.file || ''), isRoster = /^set\/multiplayer\//.test(h);
    const m = f.code.startsWith('WARN') ? /^"([^"]+)"/.exec(f.msg) : null;
    if (m) nameSet.add(m[1].toLowerCase());
    if (!isRoster && /^(set|entity)\//.test(h)) holders.add(h);
  }
  const all = listOut(out).map(x => x.key);
  for (const h of holders) {
    const cand = /\.(def|set|ammo|weapon)$/.test(h) ? [h] : all.filter(k => dirOf(k) === dirOf(h) && /\.def$/.test(k));
    for (const k of cand) { drop.add(k); why.push(k); }
  }
  for (const k of drop) nameSet.add(k.slice(k.lastIndexOf('/') + 1).replace(/\.[^.]*$/, ''));
  for (const l of c.carry && c.carry.lost || []) { drop.add(l.key); if (l.unit) nameSet.add(l.key.slice(l.key.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '')); }
  let rosterRows = 0;
  const edit = { has: () => false, glob: /^set\/multiplayer\/.+\.set$/, apply: (k, b) => { const r = dropRoster(b.toString('latin1'), nameSet); rosterRows += r.removed; return r.removed ? Buffer.from(r.text, 'latin1') : null; } };
  const r = patchOut(out, drop, edit);
  return { files: [...new Set(r.gone)].sort(), rosterRows, rosterFiles: r.edited, names: nameSet.size, pre };
}

const MISSING = /^(MOVE_REF|WARN_MOVE_ENTITY)_MISSING_ON_TARGET$/;
const count = fs0 => { const r = { files: 0, entities: 0 }; for (const f of fs0) if (f.code === 'MOVE_REF_MISSING_ON_TARGET') r.files++; else if (MISSING.test(f.code)) r.entities++; return r; };
// upgrade.js calls this in place of the plain post-check: carry, re-check, optional drop. returns the final check result
function apply({ p, o, to, rows, W, check, first }) {
  const out = path.resolve(o.out);
  p.carryBefore = classes(first.findings); p.carryCountBefore = count(first.findings);
  let cr;
  try { cr = run({ out, from: p.from, to, o, plan: p, rows, findings: first.findings, W }); } catch (e) { p.carry = { error: e.message }; p.carryAfter = p.carryBefore; p.carryCountAfter = p.carryCountBefore; return first; }
  let after = cr.n || cr.cant.length ? check() : first;
  if (o['drop-dangling']) {
    const all = { files: [], rosterRows: 0, rosterFiles: [] };
    for (let pass = 0; pass < 3; pass++) {
      const d = dropDangling({ out, findings: after.findings, carry: pass ? null : cr });
      if (!d.files.length && !d.rosterRows) break;
      all.files.push(...d.files); all.rosterRows += d.rosterRows; all.rosterFiles.push(...d.rosterFiles);
      after = check();
    }
    all.files = [...new Set(all.files)].sort(); cr.drop = all; cr.dropped = true;
  }
  p.carry = cr; p.carryAfter = classes(after.findings); p.carryCountAfter = count(after.findings);
  return after;
}
const verdictNotes = p => {
  const b = p.carryCountBefore, a = p.carryCountAfter, c = p.carry || {};
  if (c.error) return ['--carry not run: ' + c.error];
  return [`carry: missing files ${b.files} -> ${a.files}, missing entities ${b.entities} -> ${a.entities}${c.cant && c.cant.length ? ', ' + c.cant.length + ' refused' : ''}${c.capHit ? ', size cap hit' : ''}; local-only`];
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// missing classes: code + area of the holder file (+ target extension for files)
function classes(fs0) {
  const m = {};
  for (const f of fs0) {
    let k;
    if (f.code === 'MOVE_REF_MISSING_ON_TARGET') { const t = /\(resource\/(.+)\) but not in /.exec(f.msg); k = 'files ' + (t ? '.' + extOf(t[1].toLowerCase()) : '?') + ' from ' + strip(f.file).split('/').slice(0, 2).join('/'); }
    else if (f.code === 'WARN_MOVE_ENTITY_MISSING_ON_TARGET') k = 'entities named in ' + strip(f.file).split('/').slice(0, 3).join('/');
    else continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}
function render(cr, classesB, classesA) {
  const L = ['CARRIED  local-only: holds game assets, never publish'];
  if (cr.error) { L.push('  not run: ' + cr.error); return L; }
  L.push(`  ${cr.n} files, ${cr.mb} MB (cap ${cr.capMb} MB${cr.capHit ? ', HIT: ' + cr.capSkipped + ' wanted files not carried' : ', not hit'}) from ${cr.srcGame}, ${plural(cr.rounds, 'round')}, ${(cr.ms / 1000).toFixed(0)} s. layout ${cr.layout}. list: CARRIED.txt`);
  L.push('  by kind: ' + (Object.entries(cr.byExt).sort((a, b) => b[1].n - a[1].n).map(([e, x]) => `.${e} ${x.n}`).join(', ') || 'none'));
  L.push(`  CAN'T carry (${cr.cant.length}): binary the target cannot read, unreadable, or blocked by a rule row`);
  for (const x of cr.cant.slice(0, 12)) L.push(`    ${x.key}: ${x.why}`);
  if (cr.cant.length > 12) L.push(`    +${cr.cant.length - 12} more`);
  const units = cr.lost.filter(l => l.unit);
  if (units.length) L.push(`  ${plural(units.length, 'def/set file')} reach a refused file and will not load${cr.dropped ? ' (dropped)' : ''}, e.g. ${units.slice(0, 3).map(l => l.key).join(', ')}`);
  L.push('  missing classes, before carry -> after:');
  for (const k of Object.keys({ ...classesB, ...classesA }).sort((a, b) => (classesB[b] || 0) - (classesB[a] || 0))) L.push(`    ${String(classesB[k] || 0).padStart(5)} -> ${String(classesA[k] || 0).padStart(5)}  ${k}`);
  if (cr.drop) {
    L.push(`  DROPPED (--drop-dangling): ${plural(cr.drop.files.length, 'file')}, ${plural(cr.drop.rosterRows, 'roster row')} in ${plural(cr.drop.rosterFiles.length, 'file')}`);
    for (const k of cr.drop.files.slice(0, 15)) L.push('    ' + k);
    if (cr.drop.files.length > 15) L.push(`    +${cr.drop.files.length - 15} more`);
  }
  return L;
}
module.exports = { run, apply, verdictNotes, dropDangling, dropRoster, render, classes, sniff, implicitRefs, markLocal, listOut };
