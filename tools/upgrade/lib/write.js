// writer: copy the mod to --out, apply the rule table. paks stay in place: same pak name, same entries, only changed entries differ; a pak with no change is copied byte for byte.
// text goes through a temp view (loose + pak entries by name) so as2togoh can see links across paks
// Author: Imperator_Aug (ARSENAL, ia-b3d51a1b)
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const C = require('../../modmove/lib/common'), S = require('../../modmove/lib/static');
const pak = require('../../lib/pak'), { writeZip } = require('../../lib/zipwrite');
const LP = require('./lngpot');
const PAK_BINARY = /\.(dds|tga|png|jpe?g|bmp|ogg|wav|mp3|bik|avi|anm|ply|vol|mesh|bin|ttf|otf|dll|exe|cab|zip|pak|pat|net)$/i;
const ext = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const safeRel = n => { const p = path.posix.normalize(n); return !(p.startsWith('..') || path.isAbsolute(p)) ; };
const utf8ok = b => { try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b); return true; } catch { return false; } };

// every file: {rel, pak, ent, key, text}. key = path as the game sees it, resource/ removed
function collect(modDir) {
  const items = [], paks = [], unreadable = [];
  for (const f of C.walk(modDir)) {
    if (!/\.(pak|pat)$/i.test(f)) { items.push({ rel: f, pak: null, name: f, key: f.toLowerCase().replace(/^resource\//, ''), text: !PAK_BINARY.test(f) }); continue; }
    try {
      const ents = pak.list(path.join(modDir, f)); paks.push({ rel: f, ents });
      for (const e of ents) if (!e.name.endsWith('/')) items.push({ rel: f, pak: f, ent: e, ents, name: e.name, key: e.name.toLowerCase(), text: !PAK_BINARY.test(e.name) });
    } catch (e) { unreadable.push(f + ': ' + e.message); paks.push({ rel: f, ents: null }); }
  }
  return { items, paks, unreadable };
}
function readItem(modDir, it) {
  if (!it.pak) return fs.readFileSync(path.join(modDir, it.rel));
  if (it.ents.fd === undefined) it.ents.fd = fs.openSync(path.join(modDir, it.pak), 'r');
  return pak.read(it.ents, it.ent);
}
function closePaks(paks) { for (const p of paks) if (p.ents && p.ents.fd !== undefined) { fs.closeSync(p.ents.fd); delete p.ents.fd; } }
// a .lng lives under localization/ or in a pak named localization (engine mounts it at /interface/text)
function lngRel(it) {
  const k = it.name.replace(/\\/g, '/'), m = /(?:^|\/)localization\/(.+\.lng)$/i.exec(k);
  if (m) return m[1];
  if (it.pak && /(^|\/)localization\.pak$/i.test(it.pak) && /\.lng$/i.test(k)) return k;
  return null;
}
function versionEdit(text, min, max) {
  const set = (t, key, val) => {
    const re = new RegExp(`\\{\\s*${key}\\s+"[^"]*"\\s*\\}[ \\t]*\\r?\\n?`, 'i');
    if (val === null) return t.replace(re, '');
    if (re.test(t)) return t.replace(new RegExp(`(\\{\\s*${key}\\s+")[^"]*(")`, 'i'), (m, a, b) => a + val + b);
    const at = t.lastIndexOf('}'), eol = t.includes('\r\n') ? '\r\n' : '\n';
    return at < 0 ? t : t.slice(0, at) + `\t{${key} "${val}"}${eol}` + t.slice(at);
  };
  return set(set(text, 'MinGameVersion', min), 'MaxGameVersion', max);
}
const seenPath = it => (it.pak ? it.name : it.rel).replace(/\\/g, '/');
// what stays out of the copy: block rows (a row with dir:true takes the whole folder of the file it matches), then --only / --drop. root files such as mod.info always stay
function leaveOut(items, rows, o, done) {
  const out = { blocked: new Map(), only: 0, dropped: 0 };
  const take = (it, why) => { done.set(it, null); const e = out.blocked.get(why) || out.blocked.set(why, { n: 0, ex: seenPath(it) }).get(why); e.n++; };
  for (const r of rows.filter(x => x.action === 'block' && x.re)) {
    const re = new RegExp(r.re, 'i'), hit = items.filter(it => !done.has(it) && re.test(seenPath(it)));
    if (!r.dir) { for (const it of hit) take(it, r.why || r.id); continue; }
    const dirs = new Set(hit.map(it => (it.pak || '') + '|' + path.posix.dirname(seenPath(it)).toLowerCase() + '/'));
    if (dirs.size) for (const it of items) { if (done.has(it)) continue; const p = seenPath(it).toLowerCase(); for (const d of dirs) { const [pk, dir] = d.split('|'); if ((it.pak || '') === pk && p.startsWith(dir)) { take(it, r.why || r.id); break; } } }
  }
  const list = s => (s ? String(s).split(',') : []).map(x => x.trim().toLowerCase().replace(/\\/g, '/').replace(/^resource\//, '').replace(/\/+$/, '')).filter(Boolean);
  const only = list(o.only), drop = list(o.drop);
  const under = (k, ps) => ps.some(p => k === p || k.startsWith(p + '/'));
  for (const it of items) {
    if (done.has(it) || (!it.pak && !it.key.includes('/'))) continue;
    const k = it.pak && /(^|\/)localization\.pak$/i.test(it.pak) ? 'localization/' + it.key : it.key;
    if (only.length && !under(k, only)) { done.set(it, null); out.only++; } else if (under(k, drop)) { done.set(it, null); out.dropped++; }
  }
  return out;
}
// non-UTF-8 is read as cp1251: Cyrillic comes in runs of high bytes, Latin-1 accents come one at a time
function looksLatin(b) {
  let lone = 0, runs = 0;
  for (let i = 0; i < b.length; i++) if (b[i] > 127) { let j = i; while (j + 1 < b.length && b[j + 1] > 127) j++; runs++; if (j === i) lone++; i = j; }
  return runs >= 3 && lone / runs > 0.5;
}
function write(modDir, to, plan, rows, o) {
  const out = path.resolve(o.out), changes = new Map(), warns = [], cl = collect(modDir), { items, paks, unreadable } = cl;
  const log = (k, n = 1, ex) => { const c = changes.get(k) || changes.set(k, { n: 0, ex: ex || '' }).get(k); c.n += n; if (!c.ex && ex) c.ex = ex; };
  const has = k => rows.find(r => r.kind === k && r.action === 'rewrite');
  const done = new Map();   // item -> Buffer changed | null dropped
  const added = [];         // [rel, Buffer]
  let view = null;
  const left = leaveOut(items, rows, o, done);
  try {
    // text view for as2togoh: on a name in two containers the last in mount order is viewed, the others get only the per-file fixers
    const byKey = new Map(), body = new Map();
    // winner = last in vfs mount order inside a mod: dir entries by uppercase name, files and dirs interleaved (vfs.js mountDir), a pak's entries in zip order at the pak's place
    const segs = it => it.rel.replace(/\\/g, '/').split('/').map(s => s.toUpperCase());
    const cmpSeg = (a, b) => { const A = segs(a), B = segs(b); for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) return A[i] < B[i] ? -1 : 1; return A.length - B.length; };
    const ord = new Map(items.map((it, i) => [it, i])), mountOrder = items.slice().sort((a, b) => cmpSeg(a, b) || ord.get(a) - ord.get(b));
    const coll = new Map();
    for (const it of mountOrder) if (it.text && !done.has(it)) { const old = byKey.get(it.key); if (old) (coll.get(it.key) || coll.set(it.key, [old]).get(it.key)).push(it); byKey.set(it.key, it); body.set(it, readItem(modDir, it)); }
    for (const [k, v] of coll) warns.push({ code: 'WARN_UPGRADE_SAME_NAME_TWO_CONTAINERS', file: k, msg: `in ${v.length} containers (${v.map(i => i.pak || i.rel).join(', ')}): the last in mount order (${v[v.length - 1].pak || v[v.length - 1].rel}) goes through as2togoh, the others get only the per-file fixers [I]` });
    if (has('as2togoh')) {
      view = fs.mkdtempSync(path.join(os.tmpdir(), 'upgrade-'));
      const src = path.join(view, 'in'), dst = path.join(view, 'out'); fs.mkdirSync(src, { recursive: true });
      for (const it of byKey.values()) { if (!safeRel(it.name)) continue; const p = path.join(src, it.pak ? it.name : it.rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body.get(it)); }
      const json = path.join(view, 'r.json'), args = [src, '--out', dst, '--json', json, '-q'];
      if (plan.exeVer) args.push('--goh-version', plan.exeVer);
      // donors stay opt-in: auto picks the first def of the class, a person should ask for that
      if (o.donor) { const g = C.installs(o).goh; if (g) args.push('--goh', g); if (o.donor !== 'auto') args.push('--donor', o.donor); }
      const r = C.runTool('as2togoh', args);
      if (r.status !== 0 && !fs.existsSync(json)) throw new Error('as2togoh failed: ' + (r.err || r.out).slice(0, 300));
      for (const f of JSON.parse(fs.readFileSync(json, 'utf8')).findings || []) {
        if (/_(WEAPON_INCLUDE|FORESIGHT|HEAD_PATTERN|BODY_ROOT|VERSION|VEHICLE_DONOR)$/.test(f.code)) log('as2togoh ' + f.code.replace(/^WARN_AS2TOGOH_/, '').toLowerCase(), 1, f.file);
        else warns.push({ code: f.code, file: f.file, msg: f.msg });
      }
      for (const it of byKey.values()) { const p = path.join(dst, it.pak ? it.name : it.rel); if (fs.existsSync(p)) { const b = fs.readFileSync(p); if (Buffer.compare(b, body.get(it))) { if (!utf8ok(body.get(it)) && utf8ok(b)) log('cp1251 to UTF-8', 1, it.pak ? it.name : it.rel); body.set(it, b); } } }
    }
    // per-file fixers
    const low = new Set(items.filter(i => !done.has(i)).map(i => i.key)), shipped = n => [...low].some(k => k === n || k.endsWith('/' + n));
    const incs = rows.filter(r => r.kind === 'include' && r.action === 'rewrite' && !shipped(r.name.toLowerCase()));
    const enc = has('encoding'), drop = rows.filter(r => r.kind === 'path_drop' && r.action === 'rewrite').map(r => new RegExp(r.re, 'i'));
    const pots = new Map();
    for (const it of items) {
      if (done.has(it)) continue;
      const path0 = (it.pak ? it.name : it.rel).replace(/\\/g, '/');
      if (drop.some(re => re.test(path0))) { done.set(it, null); log('as64-only file dropped', 1, path0); continue; }
      if (!it.text) continue;
      let b = body.get(it), isLng = ext(it.key) === 'lng';
      if (isLng && has('lng_pot')) {
        const rel = lngRel(it);
        const keys = rel ? LP.lngKeys(readItem(modDir, it), rel) : null;
        if (rel && !keys.length && b.length) { warns.push({ code: 'WARN_UPGRADE_LNG_NO_KEYS', file: path0, msg: 'no keys read, root is not {tags}: file kept as it was, not converted' }); continue; }
        if (rel) { const pr = 'localizations/default/interface/text/' + rel.replace(/#/g, '').replace(/\.lng$/i, '.pot'); pots.set(pr, [...(pots.get(pr) || []), ...keys]); done.set(it, null); log('.lng to .pot', 1, path0 + ' -> ' + pr); continue; }
      }
      if (has('pot_lng') && /\.po$/i.test(it.key)) { done.set(it, null); log('.po translation dropped: AS2 has one language set (LOC-17)', 1, path0); continue; }
      if (has('pot_lng') && /\.pot$/i.test(it.key)) {
        const lf = 'localization/#' + path.posix.basename(path0).replace(/\.pot$/i, '.lng'), t = LP.toLng(LP.potKeys(b.toString('utf8')));
        if (t.clash) warns.push({ code: 'WARN_UPGRADE_POT_KEY_CLASH', file: path0, msg: `${t.clash} key(s) are both a text and a block, left out` });
        added.push([lf, Buffer.from(t.text, 'utf8')]); done.set(it, null); log('.pot to .lng', 1, path0 + ' -> ' + lf); continue;
      }
      if (isLng) continue;   // LOC-05: .lng stays UTF-8
      if (b.includes(0)) continue;   // binary under a text-looking name
      let s = null, wasUtf8 = utf8ok(b);
      if (incs.length && /\.(def|ext|inc|set)$/.test(it.key)) {
        s = b.toString('latin1');
        for (const r of incs) {
          const re = new RegExp('(include\\s+")(?:[^"]*[/\\\\])?' + r.name.replace(/\./g, '\\.') + '(")', 'gi');
          if (!re.test(s)) continue;
          let tgt = r.path;
          if (tgt.includes('<army>')) { const a = /(?:^|\/)mp\/([^/]+)\//.exec(it.key); if (!a) { warns.push({ code: 'WARN_UPGRADE_INCLUDE_ARMY', file: path0, msg: `${r.name}: no army in this path, ${r.path} not filled` }); continue; } tgt = tgt.replace('<army>', a[1]); }
          s = s.replace(re, (m, x, y) => { log('include path rename', 1, `${path0}: ${r.name} -> ${tgt}`); return x + tgt + y; });
        }
      }
      let nb = s === null ? b : Buffer.from(s, 'latin1');
      if (enc && enc.enc === 'utf8' && !wasUtf8) { if (looksLatin(nb)) warns.push({ code: 'WARN_UPGRADE_ENCODING_GUESS', file: path0, msg: 'read as cp1251 but looks like Latin-1: accented letters may come out as Cyrillic' }); nb =Buffer.from(new TextDecoder('windows-1251').decode(nb), 'utf8'); log('cp1251 to UTF-8', 1, path0); }
      if (enc && enc.enc === 'cp1251') {
        const str = (wasUtf8 ? nb.toString('utf8') : nb.toString('latin1')).replace(/^﻿/, '');
        if (wasUtf8 && nb.some(c => c > 127)) {
          const e = cp1251(str);
          if (e.bad) warns.push({ code: 'WARN_UPGRADE_NOT_CP1251', file: path0, msg: `${e.bad} character(s) have no cp1251 form, shown as ?` });
          nb = e.buf; log('UTF-8 to cp1251', 1, path0);
        }
        const crlf = Buffer.from(nb.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1');
        if (Buffer.compare(crlf, nb)) { nb = crlf; log('line ends to CRLF', 1, path0); }
      }
      if (Buffer.compare(nb, readItem(modDir, it))) done.set(it, nb);
    }
    for (const [pr, keys] of pots) {
      const t = LP.toPot(keys, plan.mod);
      if (t.dups) warns.push({ code: 'WARN_UPGRADE_LNG_DUP_KEY', file: pr, msg: `${t.dups} repeated key(s) kept once, the first` });
      added.push([pr, Buffer.from(t.text, 'utf8')]);
    }
    // --patch: a folder laid over the copy, last so no fixer touches it. same name replaces wherever it lives, also inside a pak
    if (o.patch) for (const f of C.walk(o.patch)) {
      if (/^(mod\.info|upgrade\.md)$/i.test(f)) continue;
      const key = f.toLowerCase().replace(/^resource\//, ''), b = fs.readFileSync(path.join(o.patch, f)), hit = items.filter(i => i.key === key && done.get(i) !== null);
      for (const i of hit) done.set(i, b);
      if (!hit.length) added.push([f, b]);
      log('file from --patch', 1, f);
    }
    // mod.info
    const mi = items.find(i => !i.pak && i.key === 'mod.info');
    const v = has('version');
    let target = null;
    if (v) {
      if (v.exe) target = { min: plan.exeVer, max: plan.exeVer };
      else if (o.mode === 'enhanced') { if (!v.enhanced) throw new Error('--mode enhanced exists on as64 only'); target = v.enhanced; }
      else if (o.mode === 'classic' || plan.versionBad) target = v.classic;
    }
    if (!mi) {
      const tv = target || v && (v.classic || { min: plan.exeVer, max: plan.exeVer }) || {};
      const lines = [`{mod`, `\t{name "${plan.mod}"}`]; if (tv.min) lines.push(`\t{MinGameVersion "${tv.min}"}`); if (tv.max) lines.push(`\t{MaxGameVersion "${tv.max}"}`); lines.push('}', '');
      added.push(['mod.info', Buffer.from(lines.join('\r\n'), 'latin1')]); log('write mod.info', 1, 'mod.info');
    } else {
      let b = done.has(mi) ? done.get(mi) : body.get(mi);
      let s = b.toString('latin1'); const s0 = s;
      if (target && target.min) { s = versionEdit(s, target.min, target.max); }
      for (const r of rows.filter(x => x.kind === 'require_drop' && x.action === 'rewrite')) {
        const re = new RegExp(`\\{\\s*require\\s+"${r.name.replace(/[+.]/g, '\\$&')}"\\s*\\}[ \\t]*\\r?\\n?`, 'gi');
        if (re.test(s)) { s = s.replace(re, ''); log(`Require ${r.name} dropped`, 1, 'mod.info'); }
      }
      // loading ignores FileId [V]); the Workshop uploader picks an item's folder as the mods/ folder whose
      // mod.info has that FileId, newest mod.info wins), so a kept FileId would let this copy be uploaded over the original
      const noId = s.replace(/\{\s*FileId\s+"[^"]*"\s*\}[ \t]*\r?\n?/i, '');
      const hadId = noId !== s; s = noId;
      if (hadId) { log('Workshop FileId removed: a copy must not claim the original item', 1, 'mod.info'); done.set(mi, Buffer.from(s, 'latin1')); }
      const s1 = hadId ? s0.replace(/\{\s*FileId\s+"[^"]*"\s*\}[ \t]*\r?\n?/i, '') : s0;
      if (s !== s1) { log('mod.info version range', 1, target ? `Min ${target.min} Max ${target.max || '(none)'}` : ''); done.set(mi, Buffer.from(s, 'latin1')); }
      // GX upgrade G11: --export credits the original author in Desc (only when asked, only if the source mod.info names one)
      if (o.export) {
        const cur = (done.has(mi) ? done.get(mi) : b).toString('latin1'), au = /\{\s*Author\s+"([^"]*)"\s*\}/i.exec(cur), nm = /\{\s*Name\s+"([^"]*)"\s*\}/i.exec(cur);
        if (au && au[1].trim()) {
          const credit = 'Ported from ' + (nm ? nm[1] : plan.mod) + ' by ' + au[1].trim();
          if (!cur.includes(credit)) {
            const dm = /(\{\s*Desc\s+")([^"]*)("\s*\})/i.exec(cur);
            const nx = dm ? cur.replace(dm[0], () => dm[1] + (dm[2] ? dm[2] + ' ' : '') + credit + dm[3]) : cur.replace(/(\r?\n)(\s*\}\s*)$/, (m, nl, tail) => nl + '\t{Desc "' + credit + '"}' + nl + tail.replace(/^\s+/, ''));
            if (nx !== cur) { done.set(mi, Buffer.from(nx, 'latin1')); log('Desc credits the original author (--export)', 1, 'mod.info'); }
          }
        }
      }
      // FIX-PORT tools-other (COV-BLD covb_t LF mod.info): mod.info is game text, every writer emits CRLF; an LF/CR source is normalized, bytes otherwise kept
      const MI = require('../../lib/modinfotext'), fin = done.has(mi) ? done.get(mi) : b;
      if (fin && !MI.isCrlf(fin)) { done.set(mi, MI.crlf(fin)); log('mod.info line ends made CRLF', 1, 'mod.info'); }
    }
    // output
    fs.mkdirSync(out, { recursive: true });
    // unlink first: a hardlinked pak at this name must never be written through to the user's mod
    const put = (rel, b) => { const p = path.join(out, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); try { fs.unlinkSync(p); } catch { /* none there */ } fs.writeFileSync(p, b); };
    const check = [], link = { n: 0, bytes: 0 };
    for (const it of items) {
      if (it.pak) continue;
      if (done.has(it)) { if (done.get(it)) put(it.rel, done.get(it)); continue; }
      const p = path.join(out, it.rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(path.join(modDir, it.rel), p);
    }
    for (const p of paks) {
      const op = path.join(out, p.rel); fs.mkdirSync(path.dirname(op), { recursive: true });
      const its = p.ents ? items.filter(i => i.pak === p.rel) : [];
      if (!p.ents || !its.some(i => done.has(i))) {
        const sp = path.join(modDir, p.rel); let linked = false;
        if (!o['no-link']) { try { fs.linkSync(sp, op); linked = true; link.n++; link.bytes += fs.statSync(sp).size; } catch { /* other volume or no link support: copy */ } }
        if (!linked) fs.copyFileSync(sp, op);
        continue;
      }
      if (p.ents.fd === undefined) p.ents.fd = fs.openSync(path.join(modDir, p.rel), 'r');
      const kept = its.filter(i => done.get(i) !== null);
      if (!kept.length) continue;   // everything in it left out: no empty pak
      writeZip(op, kept.map(i => [i.name, () => { const b = done.has(i) ? done.get(i) : pak.read(p.ents, i.ent); i.srcCrc = zlib.crc32(b); return b; }, i.ent.method !== 0 || done.has(i)]));
      check.push({ pak: p.rel, want: kept.length, op, kept });
    }
    for (const [rel, b] of added) put(rel, b);
    // round trip: same names, changed entries read back, the rest by crc
    for (const c of check) {
      const got = pak.list(c.op).filter(e => !e.name.endsWith('/')), by = new Map(got.map(e => [e.name, e]));
      let bad = got.length !== c.want ? `entries ${got.length} of ${c.want}` : null;
      for (const i of c.kept) { const g = by.get(i.name); if (!g) { bad = 'lost ' + i.name; break; } if (g.crc !== i.srcCrc) { bad = 'crc differs on ' + i.name; break; } }
      if (bad) throw new Error(`round trip failed on ${c.pak}: ${bad}`);
    }
    closePaks(paks);
    return { changes: [...changes], warns, unreadable, pakRebuilt: check.length, pakCopied: paks.length - check.length, pakLinked: link.n, linkedBytes: link.bytes, added: added.length, blocked: [...left.blocked], leftOnly: left.only, leftDrop: left.dropped };
  } finally { closePaks(paks); if (view) fs.rmSync(view, { recursive: true, force: true }); }
}
// cp1251 encoder from the decoder's own table
let CP = null;
function cp1251(s) {
  if (!CP) { CP = new Map(); const d = new TextDecoder('windows-1251'); for (let i = 128; i < 256; i++) CP.set(d.decode(Buffer.from([i])), i); }
  const out = []; let bad = 0;
  for (const ch of s) { const c = ch.codePointAt(0); if (c < 128) out.push(c); else if (CP.has(ch)) out.push(CP.get(ch)); else { out.push(63); bad++; } }
  return { buf: Buffer.from(out), bad };
}
module.exports = { write, collect, cp1251, versionEdit };
