// Author: Imperator_Aug (ARSENAL, ia-531298d2)
'use strict';
// XLATE-5: checks and fixes on a built --donor unit, called by goh2as2.js after the def is written. Nothing here writes outside the unit's own output folder.
//   fileCheck: every file the output mdl / its plys / the def name must exist in the output or in the vanilla vfs (donor side), else the build stops (ERR_DONOR_FILE_MISSING).
//   fitPass: donorfit.check on the written def (read only), then the edits that clear most fit fails, 38 of 43):
//     - a crew-macro seat (LinkBone / door the mdl lacks): the def's call of the seat macro (("seat_3_human")) is replaced by the macro's own body, every nested macro expanded
//       and each leaf call (("seat_human" place() bone() door())) dropped when it names a bone/door the mdl lacks. The seats the mdl has stay, with their bone [T];
//     - a {linkbone "x"} written in the def itself, x absent: removed (a place with no linkbone is how vanilla writes the driver) [T];
//     - a weapon whose default aim bone the mdl lacks and the place names no {foresight}: the place gets {foresight "<a bone the mdl has>"} [T].
const fs = require('fs'), path = require('path');
const names = require('../lib/names');
const { meshRefs } = require('../binhdr/ply');

const FILE_RE = /"([^"\r\n]+\.(?:ply|anm|vol|mdl|ext|inc|mtl|ebm))"/gi;

function keyOf(name, dirKey) {
  const s = String(name).trim().replace(/\\/g, '/');
  if (!s || /^\$\//.test(s) || /\s/.test(s)) return null;
  if (s.startsWith('/')) return 'resource' + s.toLowerCase();
  return names.resolve(s, dirKey).key.toLowerCase();
}
const dirOf = k => k.slice(0, k.lastIndexOf('/'));

// the text with ; comments out, line ends kept. A ; inside a string stays, as in balEnd below
function stripComments(s) {
  let out = '', q = false;
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"' || c === '\n') q = false; out += c; continue; }
    if (c === '"') { q = true; out += c; continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\n') { if (s[j] === '\r') out += '\r'; j++; } if (j < s.length) out += '\n'; continue; }
    out += c;
  }
  return out;
}

// -> [{ from, name, key }] names with no file in outDir and none in the vfs (vf.files keys are lowercase 'resource/...')
function fileCheck({ outDir, mdlKey, defKey, vf, implicitAnms }) {
  const missing = [], seen = new Set();
  const has = k => fs.existsSync(path.join(outDir, k)) || (vf && vf.files.has(k));
  const check = (from, name, dir) => {
    const k = keyOf(name, dir); if (!k) return;
    const id = from + '|' + k; if (seen.has(id)) return; seen.add(id);
    if (!has(k)) missing.push({ from, name, key: k });
  };
  const mp = path.join(outDir, mdlKey);
  if (!fs.existsSync(mp)) { missing.push({ from: defKey, name: path.basename(mdlKey), key: mdlKey }); return missing; }
  const mtext = stripComments(fs.readFileSync(mp, 'latin1')), mdir = dirOf(mdlKey), plys = new Set();   // a name behind ; is no reference (VOL-4F: three units refused over a commented-out damage_components.ext)
  for (const m of mtext.matchAll(FILE_RE)) { check(mdlKey, m[1], mdir); if (/\.ply$/i.test(m[1])) plys.add(m[1]); }
  for (const a of implicitAnms(mtext)) check(mdlKey, a + '.anm', mdir);
  for (const p of plys) {   // a ply names its materials: a missing .mtl is a load crash (FMT-03, PORT-131)
    const pk = keyOf(p, mdir); if (!pk || !fs.existsSync(path.join(outDir, pk))) continue;
    let r; try { r = meshRefs(fs.readFileSync(path.join(outDir, pk))); } catch { continue; }
    for (const m of r.mtls) { const k = keyOf(m, dirOf(pk)); if (k && /\.mtl$/.test(k)) check(pk, m, dirOf(pk)); }
  }
  return missing;   // the def's own includes are the donor's: they resolve in the game's own data, not checked here
}

// balanced ( ) or { } group from index i, strings and ; comments skipped; end of text when unbalanced
function balEnd(s, i) {
  let depth = 0, q = false;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) { if (c === '"' || c === '\n') q = false; continue; }
    if (c === '"') q = true;
    else if (c === ';') { while (j < s.length && s[j] !== '\n') j++; }
    else if (c === '(' || c === '{') depth++;
    else if ((c === ')' || c === '}') && --depth === 0) return j + 1;
  }
  return s.length;
}
const parenEnd = balEnd;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// the text of (define "M" ...): in the def, else in the .ext/.inc it names, followed to depth 4 (output folder first, then vfs)
function findDefine(M, defText, defKey, outDir, vf, vfsLib) {
  const re = new RegExp('\\(\\s*define\\s+"' + esc(M) + '"', 'i'), seen = new Set();
  const grab = t => { const m = re.exec(t); return m ? t.slice(m.index, balEnd(t, m.index)) : null; };
  const walk = (text, key, depth) => {
    let b = grab(text); if (b) return b;
    if (depth >= 4) return null;
    for (const m of text.matchAll(/include\s+"([^"\r\n]+\.(?:ext|inc))"/gi)) {
      const k = keyOf(m[1], dirOf(key)); if (!k || seen.has(k)) continue; seen.add(k);
      let t = null;
      const p = path.join(outDir, k);
      if (fs.existsSync(p)) t = fs.readFileSync(p, 'latin1'); else if (vf && vf.files.has(k)) { try { t = vfsLib.readRec(vf.files.get(k)).toString('latin1'); } catch { t = null; } }
      if (t && (b = walk(t, k, depth + 1))) return b;
    }
    return null;
  };
  return walk(defText, defKey, 0);
}

// the top-level units of a define body: whole ( ) calls, { } blocks, loose atoms
function unitsOf(def) {
  const m = /^\(\s*define\s+"[^"]*"/i.exec(def); if (!m) return null;
  const end = def.lastIndexOf(')'), body = def.slice(m[0].length, end), out = [];
  for (let i = 0; i < body.length;) {
    const c = body[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === ';') { while (i < body.length && body[i] !== '\n') i++; continue; }
    if (c === '(' || c === '{') { const e = balEnd(body, i); out.push(body.slice(i, e)); i = e; continue; }
    let e = i; while (e < body.length && !/\s/.test(body[e])) e++;
    out.push(body.slice(i, e)); i = e;
  }
  return out;
}
const callName = u => { const m = /^\(\s*"([^"]+)"/.exec(u); return m ? m[1] : null; };
const bareCall = u => /^\(\s*"[^"]+"\s*\)$/.test(u);

// expand the macro call `unit`: macros of the chain are replaced by their body units; a leaf call naming a missing bone/door goes
function expandSeats(unit, ctx) {
  const name = callName(unit); if (!name) return [unit];
  const lc = name.toLowerCase();
  if (lc === ctx.leaf) {
    const args = unit.replace(/^\(\s*"[^"]+"/, '');
    for (const miss of ctx.missing) if (new RegExp('\\(\\s*' + esc(miss) + '\\s*\\)|["\\s(]' + esc(miss) + '["\\s)]', 'i').test(args)) { ctx.dropped.push(miss); return []; }
    return [unit];
  }
  if (ctx.chain.has(lc) && bareCall(unit)) {
    const d = findDefine(name, ctx.defText, ctx.defKey, ctx.outDir, ctx.vf, ctx.vfsLib), us = d && unitsOf(d);
    if (!us) { ctx.failed = true; return [unit]; }
    return us.flatMap(u => expandSeats(u, ctx));
  }
  return [unit];
}

// mdl bone names with their case, from the mdl text
function mdlBoneNames(mdlText) {
  const m = new Map();
  for (const x of mdlText.matchAll(/\{\s*bone\s+(?:[a-z]+\s+)?"([^"\r\n]+)"/gi)) if (!m.has(x[1].toLowerCase())) m.set(x[1].toLowerCase(), x[1]);
  return m;
}
const AIM_PREF = ['mgun', 'gun', 'shooter', 'shooter00', 'gun_rot', 'barrel', 'muzzle'];
function aimBone(place, bones) {
  if (bones.has(String(place).toLowerCase())) return bones.get(String(place).toLowerCase());
  for (const p of AIM_PREF) if (bones.has(p)) return bones.get(p);
  for (const [lc, real] of bones) if (/fore|sight|aim|muzzle|shoot/.test(lc)) return real;
  for (const [lc, real] of bones) if (/gun|mg|barrel|turret/.test(lc)) return real;
  return null;
}

// calls with args of macro `leaf` naming a bone/door the mdl lacks go to "<leaf>_nolb" (a define copy without {linkbone});
// door(emitN) args get an emit bone the mdl has. Returns { text, n } or null.
function nolbFix(text, leaf, missing, emits, findDef) {
  const callRe = new RegExp('\\(\\s*"' + esc(leaf) + '"((?:[^()\\n]|\\([^()\\n]*\\))*)\\)', 'ig');
  let n = 0, di = 0;
  let out = text.split('\n').map(line => {
    if (/^\s*\(\s*define\b/i.test(line)) return line;
    return line.replace(callRe, (all, args) => {
      let a = args, hit = false;
      for (const m of missing) {
        const re = new RegExp('\\(\\s*' + esc(m) + '\\s*\\)', 'i'); if (!re.test(a)) continue;
        hit = true;
        if (/^emit\d*$/i.test(m) && emits.length) a = a.replace(re, '(' + emits[di++ % emits.length] + ')');
      }
      if (!hit) return all;
      n++;
      return '("' + leaf + '_nolb"' + a + ')';
    });
  }).join('\n');
  if (!n) return null;
  const nre = new RegExp('\\(\\s*define\\s+"' + esc(leaf) + '_nolb"', 'i');
  if (!nre.test(out)) {
    const m = new RegExp('\\(\\s*define\\s+"' + esc(leaf) + '"', 'i').exec(out);
    const d = m ? out.slice(m.index, balEnd(out, m.index)) : findDef(leaf);
    if (!d) return null;
    const nd = d.replace(new RegExp('"' + esc(leaf) + '"', 'i'), '"' + leaf + '_nolb"').replace(/\{\s*linkbone\s+"[^"\r\n]*"\s*\}[ \t]*/gi, '');
    if (m) { const e = m.index + d.length; out = out.slice(0, e) + '\n\n' + nd + out.slice(e); }
    else { const k = out.search(new RegExp('\\(\\s*"' + esc(leaf) + '_nolb"', 'i')); out = out.slice(0, k) + nd + '\n' + out.slice(k); }
  }
  return { text: out, n };
}
// {bone "N" ...} without its {limits}/{speed}/{speed2} children (a plain bone the mdl lacks); the whole block when nothing is left
function stripBoneKids(text, name) {
  const m = new RegExp('\\{\\s*bone\\s+"' + esc(name) + '"', 'i').exec(text); if (!m) return null;
  const e = balEnd(text, m.index), b = text.slice(m.index, e);
  const nb = b.replace(/\{\s*(?:limits|speed2?)\b[^{}]*\}/gi, '');
  const rest = nb.replace(/\{\s*bone\s+"[^"]*"/i, '').replace(/;[^\n]*/g, '').replace(/[\s}]/g, '');
  return text.slice(0, m.index) + (rest ? nb : '') + text.slice(e);
}

// ---- FXE-1: the seat rule. A seat the unit is operated through (driver, gunner, commander, charger, loader, radio, assistant, or any seat a weapon place names as its
// {gunner}/{charger}) is never dropped for a bone the rep mdl lacks. The missing name becomes a bone of the OUTPUT mdl, a copy of the nearest real bone (door emitN -> the
// emit with the nearest number; seat bone seatNN / driver1 -> the same stem, nearest number) placed as its sibling so it has the same parent and world position; with no such
// bone, a bone with no transform under the root bone (the owner origin, which is where a seat with no {linkbone} sits: [V]).
// breaks a seat whose linkbone is not found, and a door missing from the mdl leaves the unit with no order (PORT-137 [V kv8s]); a bone that exists clears both.
const SEAT_PRIMARY = new Set(['driver', 'commander', 'gunner', 'charger', 'loader', 'radio', 'assistant']);
function bonesOfMdl(text) {   // lowercase name -> { name, at, end } of the {bone ..} block
  const out = new Map(), re = /\{\s*bone\s+(?:[a-z]+\s+)?"([^"\r\n]+)"/gi; let m;
  while ((m = re.exec(text))) if (!out.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), { name: m[1], at: m.index, end: balEnd(text, m.index) });
  return out;
}
function nearestBone(name, kind, bones) {   // -> the real bone name to copy, or null
  const lc = name.toLowerCase(), mm = /^(.*?)(\d+)$/.exec(lc), stem = mm ? mm[1] : lc, num = mm ? +mm[2] : 0;
  const pool = [...bones.keys()].filter(b => (kind === 'door' ? /^emit\d*$/ : new RegExp('^' + esc(stem) + '\\d*$')).test(b) && b !== lc);
  const withNum = pool.map(b => { const x = /(\d+)$/.exec(b); return { b, n: x ? +x[1] : 0 }; }).sort((a, c) => Math.abs(a.n - num) - Math.abs(c.n - num) || a.n - c.n);
  return withNum.length ? bones.get(withNum[0].b).name : null;
}
// misses: donorfit misses; seats: res.seats. Edits the output mdl; -> [{ kind, name, to }] (to null = the root) or null when the mdl cannot be edited
function seatAlias(res, mdlPath) {
  const need = new Map();   // lc name -> { kind, name, seats: [place] }
  const seatBy = {
    door: d => res.seats.filter(s => s.doors.some(x => x.door === d)),
    LinkBone: b => res.seats.filter(s => s.linkbone === b && !s.linkboneOk),
  };
  for (const m of res.misses) {
    // FXE-2 rule 4: a {foresight "foresightN"} the mdl lacks (a muzzle bone): aliased as the nearest foresight sibling, else the root, like a seat
    if (m.key === 'foresight' && m.name && !m.name.includes('%')) { const lf = m.name.toLowerCase(); if (!need.has(lf)) need.set(lf, { kind: 'foresight', name: m.name, seats: ['weapon place ' + (m.parent || '')] }); continue; }
    if (m.key !== 'door' && m.key !== 'LinkBone') continue;
    const lc = m.name.toLowerCase(), ss = seatBy[m.key](lc).filter(s => SEAT_PRIMARY.has(s.place) || s.crews);
    if (ss.length && !need.has(lc)) need.set(lc, { kind: m.key === 'door' ? 'door' : 'seat', name: m.name, seats: ss.map(s => s.place) });
    // a gun's weapon place whose LinkBone the mdl lacks (cannon_mgun_1.ext: {place "mgun" {LinkBone "mgun"}}): with the bone gone the gun has nothing to fire from; the place
    // is in an include this tool cannot edit, so the bone is added: the mdl's aim-like bone (mgun, gun, shooter..), else the root [T]
    // FXE-2: a vehicle's main weapon place (first, or "gun") gets the same alias: its LinkBone left absent is a main gun with no muzzle origin
    else if (m.key === 'LinkBone' && (res.gun || isMainPlace(res, lc)) && !seatBy.LinkBone(lc).length && !need.has(lc)) need.set(lc, { kind: 'weapon', name: m.name, seats: ['weapon place'] });
  }
  if (!need.size) return [];
  let buf; try { buf = fs.readFileSync(mdlPath); } catch { return null; }
  let text = buf.toString('latin1');
  if (!/\{\s*skeleton\b/i.test(text) && !/\{\s*bone\b/i.test(text)) return null;
  const nl = /\r\n/.test(text) ? '\r\n' : '\n', done = [];
  for (const n of need.values()) {
    const bones = bonesOfMdl(text);
    const to = n.kind === 'weapon' ? (nearestBone(n.name, 'seat', bones) || aimBone(n.name, new Map([...bones].map(([k, v]) => [k, v.name])))) : nearestBone(n.name, n.kind, bones);
    let block, at;
    if (to) {   // a sibling copy: the target's own block without nested bones
      const b = bones.get(to.toLowerCase()); let body = text.slice(b.at, b.end);
      for (let g = 0; g < 50; g++) { const c = /\{\s*bone\s+(?:[a-z]+\s+)?"[^"\r\n]*"/gi; c.lastIndex = 1; const k = c.exec(body); if (!k) break; body = body.slice(0, k.index) + body.slice(balEnd(body, k.index)); }
      block = nl + body.replace(/(\{\s*bone\s+(?:[a-z]+\s+)?)"[^"\r\n]*"/i, '$1"' + n.name + '"'); at = b.end;
    } else {
      const root = [...bones.values()].sort((a, c) => a.at - c.at)[0]; if (!root) return null;
      block = nl + '\t\t{bone "' + n.name + '"}'; at = root.end - 1;
    }
    text = text.slice(0, at) + block + text.slice(at);
    done.push({ kind: n.kind, name: n.name, to: to || null, seats: n.seats });
  }
  fs.writeFileSync(mdlPath, Buffer.from(text, 'latin1'));
  return done;
}
// ---- FXE-2: bone blocks. A def {bone "x" ..} block whose bone the output mdl lacks logs "Bone x not found" then "Block terminator expected" and aborts the load ( [V logs
// toldi2, uk-triumph, sdkfz8_flak18, sdkfz251_stuka]). Default: the block is removed (a {speed}/{limits} on a bone that is not there drives nothing). A {limits} block on a main-gun type bone
// (gun/cannon/barrel/turret/mantlet, not an mg) drives the main gun's turning: it is kept, with the bone added to the output mdl as a copy of a typed (revolute) lookalike; with none the build is refused.
const MAINGUN_BONE = /gun|cannon|barrel|turret|mantlet/i, MG_BONE = /mg|machine|coax/i;
function typedLookalike(mdlText, name) {   // -> name of a typed ({bone revolute "n"}) bone that shares the stem, or null
  const lc = name.toLowerCase(), stem = lc.replace(/\d+$/, ''), re = /\{\s*bone\s+([a-z]+)\s+"([^"\r\n]+)"/gi; let m;
  while ((m = re.exec(mdlText))) { const n = m[2].toLowerCase(); if (n !== lc && stem.length >= 3 && (n.startsWith(stem) || stem.startsWith(n.replace(/\d+$/, '')) && n.replace(/\d+$/, '').length >= 3)) return m[2]; }
  return null;
}
// BUILD-6: the typed bones above the main weapon's muzzle, innermost first, the root left out. A def {bone} block only modifies a bone the mdl has and aim walks the
// parents of the foresight bone, so with such a bone the gun aims on the mdl's own limits and a donor block on a bone the mdl lacks adds nothing. Empty: nothing can aim, the refusal stands.
function typedAimChain(mdlText, res) {
  const bones = bonesOfMdl(mdlText), all = [...bones.values()], rootAt = Math.min(...all.map(b => b.at));
  const w = res.wplaces || [], links = w.filter((x, i) => i === 0 || x.name === 'gun').flatMap(x => x.links.map(l => l.toLowerCase()));
  const muzzles = [...links, ...[...bones.keys()].filter(n => /^foresight\d*$/.test(n)), ...[...bones.keys()].filter(n => /^m?gun\d*$/.test(n))];
  for (const n of muzzles) {
    const x = bones.get(n); if (!x) continue;
    const up = all.filter(b => b.at <= x.at && b.end >= x.end && b.at !== rootAt && /^\{\s*bone\s+[a-z]+\s+"/i.test(mdlText.slice(b.at, b.at + 80))).sort((a, c) => c.at - a.at);
    if (up.length) return up.map(b => b.name);
  }
  return [];
}
function copyBone(mdlPath, to, name) {   // adds bone `name` to the output mdl as a sibling copy of `to` (nested bones left out); false when the mdl cannot be edited
  let buf; try { buf = fs.readFileSync(mdlPath); } catch { return false; }
  const text = buf.toString('latin1'), bones = bonesOfMdl(text), b = bones.get(to.toLowerCase()); if (!b) return false;
  const nl = /\r\n/.test(text) ? '\r\n' : '\n'; let body = text.slice(b.at, b.end);
  for (let g = 0; g < 50; g++) { const c = /\{\s*bone\s+(?:[a-z]+\s+)?"[^"\r\n]*"/gi; c.lastIndex = 1; const k = c.exec(body); if (!k) break; body = body.slice(0, k.index) + body.slice(balEnd(body, k.index)); }
  const blk = nl + body.replace(/(\{\s*bone\s+(?:[a-z]+\s+)?)"[^"\r\n]*"/i, '$1"' + name + '"');
  fs.writeFileSync(mdlPath, Buffer.from(text.slice(0, b.end) + blk + text.slice(b.end), 'latin1'));
  return true;
}
const isMainPlace = (res, bone) => { const w = res.wplaces || []; const m = w.find((x, i) => i === 0 || x.name === 'gun'); return !!(m && m.links.includes(bone.toLowerCase())) || w.some(x => x.name === 'gun' && x.links.includes(bone.toLowerCase())); };

// the seat a built unit must keep: a vehicle its driver, a gun its gunner, each with a door the mdl has (a vehicle) and a linkbone the mdl has (or none). -> [reason]
function seatAudit(res) {
  const bad = [], seats = res.seats || [], want = res.gun ? 'gunner' : 'driver', s = seats.find(x => x.place === want);
  if (res.gun ? !seats.length : !res.hasPather) return bad;   // stub def (gun with no seat at all / vehicle with no {PatherID}): nothing to keep or break
  if (!s) bad.push(`no "${want}" seat in the def (${res.gun ? 'gun' : 'vehicle'}): nobody can operate it`);
  else {
    if (!s.linkboneOk) bad.push(`seat "${want}": linkbone "${s.linkbone}" is not in the mdl, the seat breaks at spawn`);
    if (!res.gun && !s.doors.some(d => d.ok)) bad.push(`seat "${want}": ${s.doors.length ? 'door ' + s.doors.map(d => d.door).join('/') + ' is not in the mdl' : 'no door links it'}, the unit takes no order`);
  }
  return bad;
}

// ---- T-DONORFIT: weapon-place rule table. A weapon place with no {LinkBone} sits on the mdl bone of its own name [I]; the donor def's names (mgun, mgun1, mgun2) are the donor mdl's. The fix is a {LinkBone "<mdl bone>"} on the place, not a rename.
// The role is the place's own {type} (the def says it): GoH names its MG bones <mgun>_<role letter>. Candidates in order, the first the mdl has and no other place uses.
// Name suffix (mgun -> coax, mgun1 -> hull, mgun2 -> aa) is the fallback only when the place has no {type}: the pz4h def itself says mgun = mgun_aa, mgun1 = mgun_hull, mgun2 = mgun_coaxial.
const PLACE_ROLES = [
  { role: 'aa', type: /(^|_)aa$|anti/i, cands: ['mgun_aa', 'mgun_a', 'mgun_rot'], why: 'role aa (anti-air MG): the mdl\'s AA gun bone, else mgun_rot, the muzzle carrier under mgun_a_rot1/2 (the AA gunner\'s seat sits under it)' },
  { role: 'hull', type: /hull|bow/i, cands: ['mgun_h', 'mgun_hull', 'hullmg'], why: 'role hull (bow MG): the mdl\'s hull MG bone' },
  { role: 'coax', type: /coax/i, cands: ['mgun_c', 'mgun_coax', 'mgun_coaxial'], why: 'role coax (coaxial MG): the mdl\'s coaxial MG bone' },
];
const PLACE_SUFFIX = { '': 'coax', 1: 'hull', 2: 'aa' };
function mapPlace(m, bones, taken) {   // -> { to, why } | null (bones: lowercase name -> real name)
  let rule = PLACE_ROLES.find(r => m.role && r.type.test(m.role)), how = rule && `{type "${m.role}"}`;
  if (!rule) { const sm = /^mgun(\d*)$/i.exec(m.name); if (sm && !m.role) { rule = PLACE_ROLES.find(r => r.role === PLACE_SUFFIX[sm[1]]); how = `name suffix "${sm[1]}" (no {type})`; } }
  if (!rule) return null;
  const to = rule.cands.find(c => bones.has(c) && !taken.has(c));
  return to ? { to: bones.get(to), why: `${how}, ${rule.why}` } : null;
}

// T-CHAINFIX: a GoH-made mdl tags door bones {parameters "group=..."} (donorfit.js:129 reads it the same way, volumes excluded)
function gohMdl(p) {
  let t; try { t = fs.readFileSync(p, 'latin1'); } catch { return false; }
  for (let at; (at = t.search(/\{\s*volume\b/i)) >= 0;) { const e = balEnd(t, at); if (!(e > at)) break; t = t.slice(0, at) + t.slice(e); }
  return /\{\s*parameters\s+"[^"]*\bgroup\s*=/i.test(t);
}
// donorfit: require('../donorfit/donorfit.js'); returns { applied: [text], left: [miss text], rounds, seatMap: [text], seatBad: [text] }
function fitPass({ defKey, outDir, mdlKey, game, exe, rep, vf, vfsLib, donorfit, allowMissing }) {
  const applied = [], dp = path.join(outDir, defKey), seatMap = [], aliased = new Set(), refuse = [], gaps = [];   // gaps: T-DONORFIT { kind, code, key, reason } for goh2as2's gap list
  const bones = mdlBoneNames(fs.readFileSync(path.join(outDir, mdlKey), 'latin1'));
  let left = [], rounds = 0, seatBad = [];
  for (let round = 1; round <= 6; round++) {   // T-DONORFIT: 4 -> 6, the place and volume pass takes a round of its own
    rounds = round;
    let res; try { res = donorfit.check({ def: dp, game, exe: exe || undefined, mods: [], moddir: outDir, rep }); } catch (e) { return { applied, left: ['donorfit check failed: ' + e.message], rounds, seatMap, seatBad }; }
    if (res.fatal) return { applied, left: ['donorfit: ' + res.fatal], rounds, seatMap, seatBad };
    seatBad = seatAudit(res);
    left = res.misses.map(m => `${m.key} "${m.name}"${m.macro ? ' via ' + m.macro : ''} def line ${m.defLine}`);
    const sa = res.seats ? seatAlias(res, path.join(outDir, mdlKey)) : [];
    if (sa && sa.length) {
      for (const a of sa) aliased.add(a.name.toLowerCase());
      for (const a of sa) seatMap.push(`${a.kind === 'door' ? 'door' : a.kind === 'weapon' ? 'weapon-place linkbone' : a.kind === 'foresight' ? 'foresight (muzzle) bone' : 'seat bone'} ${a.name} -> ${a.to || 'root (owner origin)'}: alias bone added to the output mdl for seat ${a.seats.join('/')} [T]`);
      for (const [k, v] of mdlBoneNames(fs.readFileSync(path.join(outDir, mdlKey), 'latin1'))) bones.set(k, v);
      continue;   // re-check: the aliased names are no longer misses
    }
    // T-CHAINFIX: DF_CREW_EXT (donorfit's rule, donorfit.js:731-739 + its --write rename): a vanilla extended crew macro on a GoH-made mdl never links a man
    // (G-CHAIN2 g1 0/4 operatable, g2 4/4 after the rename). Same edit here: "crew_N_human_extended<suffix>" -> "crew_N_human" on the line donorfit names.
    // donorfit's rule matches only a closing quote right after "extended", so the suffix form (crew_5_human_extended2, vanilla m26) is found here with the same
    // GoH-mdl test (a bone {parameters "group=..."} outside a volume, donorfit.js:129) [I: same macro family, same driver link].
    {
      const ce = res.misses.filter(m => m.key === 'DF_CREW_EXT' && m.defLine);
      if (gohMdl(path.join(outDir, mdlKey))) fs.readFileSync(dp, 'latin1').split('\n').forEach((l, i) => {
        const x = /\(\s*"(crew_(\d+)_human_extended)\w+"/i.exec(l.replace(/;.*$/, ''));
        if (x && !ce.some(m => m.defLine === i + 1)) ce.push({ key: 'DF_CREW_EXT', name: x[1], defLine: i + 1, to: `crew_${x[2]}_human` });
      });
      if (ce.length) {
        const dl = fs.readFileSync(dp, 'latin1').split('\n'); let n = 0;
        for (const m of ce) {
          const li = m.defLine - 1, L = dl[li]; if (L === undefined) continue;
          const re = new RegExp('"(' + esc(m.name) + '\\w*)"', 'i'), hit = re.exec(L.replace(/;.*$/, '')); if (!hit) continue;
          dl[li] = L.replace(re, `"${m.to}"`); n++;
          applied.push(`DF_CREW_EXT crew macro "${hit[1]}" (def line ${m.defLine}) -> "${m.to}": a vanilla extended crew on a GoH mdl never links (T-DONORREADY [V], G-CHAIN2 [V]) [T]`);
          gaps.push({ kind: 'baked', code: 'XLATE_FIT_CREW_EXT', key: 'crew ' + hit[1], reason: `T-CHAINFIX crew macro "${hit[1]}" renamed to "${m.to}" (DF_CREW_EXT) [T]` });
        }
        if (n) { fs.writeFileSync(dp, Buffer.from(dl.join('\n'), 'latin1')); continue; }
      }
    }
    // FXE-1: a seat-macro call that gives door1 and not door2 leaves {door "%door2"} unresolved (SDL-21: the name stays literal). Vanilla AS2 never calls it that way (0 of its defs),
    // so the call gets the second door: the nearest emit of the mdl other than the one it names, else the same one. Single-line calls only.
    {
      const un = (res.unresolved || []).filter(u => u.what === 'door' && /%door\d*/i.test(u.name) && /^def:\d+$/.test(u.where || ''));
      if (un.length) {
        const dl = fs.readFileSync(dp, 'latin1').split('\n'); let n = 0;
        for (const u of un) {
          const li = +u.where.slice(4) - 1, key = /%(door\d*)/i.exec(u.name)[1].toLowerCase(); let L = dl[li]; if (L === undefined) continue;
          const cr = /\r$/.test(L) ? '\r' : '', body = L.replace(/\r$/, '');
          if (!/^\s*\(\s*"[^"]+"/.test(body) || !/\)\s*$/.test(body) || new RegExp('\\b' + key + '\\(', 'i').test(body)) continue;
          const dm = /\bdoor\d*\(\s*(\w+)\s*\)/i.exec(body); if (!dm) continue;
          const bn = mdlBoneNames(fs.readFileSync(path.join(outDir, mdlKey), 'latin1')), mine = dm[1].toLowerCase();
          if (!bn.has(mine)) continue;   // door1 itself is not settled yet: the next round
          const alt = nearestBone(mine, 'door', new Map([...bn].filter(([k]) => !aliased.has(k)).map(([k, v]) => [k, { name: v }]))) || bn.get(mine);   // a real door, not one of our own copies
          dl[li] = body.replace(/\)\s*$/, ' ' + key + '(' + alt + '))') + cr; n++;
          seatMap.push(`call at def line ${li + 1} gave ${key} only through door1(${dm[1]}): ${key}(${alt}) added so "%${key}" resolves (vanilla never omits it) [T]`);
        }
        if (n) { fs.writeFileSync(dp, Buffer.from(dl.join('\n'), 'latin1')); continue; }
      }
    }
    // FXE-2: bone blocks of the def itself (see above): drop, alias, or leave for the refusal below
    {
      const bbs = res.misses.filter(m => m.key === 'bone-block' && !m.inExt && !m.macro);
      if (bbs.length) {
        let t = fs.readFileSync(dp, 'latin1'), edited = 0, aliasedNow = 0;
        for (const m of bbs) {
          const re = new RegExp('\\{\\s*bone\\s+"' + esc(m.name) + '"', 'i'), at = t.search(re); if (at < 0) continue;
          const e = balEnd(t, at), blk = t.slice(at, e), hasLim = /\{\s*limits\b/i.test(blk), main = hasLim && MAINGUN_BONE.test(m.name) && !MG_BONE.test(m.name);
          let chainNote = '';
          if (main) {
            const mt = fs.readFileSync(path.join(outDir, mdlKey), 'latin1'), lk = typedLookalike(mt, m.name);
            if (lk && copyBone(path.join(outDir, mdlKey), lk, m.name)) { for (const [k, v] of mdlBoneNames(fs.readFileSync(path.join(outDir, mdlKey), 'latin1'))) bones.set(k, v); seatMap.push(`bone-block ${m.name} -> ${lk}: alias bone (copy of the typed bone) added to the output mdl so the main gun's {limits} block loads [T]`); aliasedNow++; continue; }
            const chain = typedAimChain(mt, res);
            if (chain.length) chainNote = `; the gun aims on the mdl's own typed bones ${chain.join(', ')}, with their limits`;
            else if (!allowMissing) continue;   // left: refused by name after the loop
          }
          let s = e; while (/[ \t]/.test(t[s] || '')) s++; if (t[s] === '\r') s++; if (t[s] === '\n') s++;
          let b0 = at; while (b0 > 0 && /[ \t]/.test(t[b0 - 1])) b0--;
          t = t.slice(0, b0) + t.slice(s); edited++;
          applied.push(`bone-block "${m.name}" (def line ${m.defLine}) removed: the output mdl has no such bone, and a {bone} block for a missing bone aborts the load (Bone not found, Block terminator expected)${hasLim ? '; it held {limits}' : ''}${chainNote} [T]`);
        }
        if (edited) { fs.writeFileSync(dp, Buffer.from(t, 'latin1')); continue; }
        if (aliasedNow) continue;
      }
    }
    // T-DONORFIT: a weapon place the mdl has no bone for (DF_BONE_MISSING), and a shield volume the mdl lacks. Both [I] causes of "loads, never operatable" (G-DONORSPAWN).
    {
      const pm = res.misses.filter(m => m.key === 'DF_BONE_MISSING' && !m.inExt && !m.macro), vm = res.misses.filter(m => m.key === 'volume' && !m.inExt && !m.macro && /^shield/i.test(m.name));
      if (pm.length || vm.length) {
        let t = fs.readFileSync(dp, 'latin1'), edited = 0;
        // the place keeps its name ({user "mgun"} items, crew lines, the vanilla include's own place of that name all keep working); it gets {LinkBone "<mdl bone>"} on its opening line
        const taken = new Set((res.wplaces || []).flatMap(w => [w.name, ...w.links]));
        for (const m of pm) {
          const r = mapPlace(m, bones, taken); if (!r) continue;
          const wi = Math.max(0, t.search(/\{\s*weaponry\b/i)), re = new RegExp('(\\{\\s*place\\s+"' + esc(m.name) + '")', 'i'), k = t.slice(wi).search(re); if (k < 0) continue;   // not written in the def (include only): left, refused below
          t = t.slice(0, wi + k) + t.slice(wi + k).replace(re, `$1 {LinkBone "${r.to}"}`);
          taken.add(r.to.toLowerCase()); edited++;
          applied.push(`DF_BONE_MISSING place "${m.name}"${m.role ? ` (type ${m.role})` : ''} got {LinkBone "${r.to}"}: ${r.why} [T]`);
          gaps.push({ kind: 'baked', code: 'XLATE_FIT_PLACE_LINKBONE', key: 'place ' + m.name, reason: `T-DONORFIT weapon place "${m.name}" has no mdl bone of that name: {LinkBone "${r.to}"} added, ${r.why} [T]` });
        }
        for (const m of vm) {
          const at = t.search(new RegExp('\\{\\s*volume\\s+"' + esc(m.name) + '"', 'i')); if (at < 0) continue;
          const e = balEnd(t, at); let s = e; while (/[ \t]/.test(t[s] || '')) s++; if (t[s] === '\r') s++; if (t[s] === '\n') s++;
          let b0 = at; while (b0 > 0 && /[ \t]/.test(t[b0 - 1])) b0--;
          t = t.slice(0, b0) + t.slice(s); edited++;
          applied.push(`volume "${m.name}" (def line ${m.defLine}) removed: a shield volume the output mdl lacks (no mdl volume of that name) [T]`);
          gaps.push({ kind: 'dropped', code: 'XLATE_FIT_VOLUME_DROPPED', key: 'volume ' + m.name, reason: `T-DONORFIT shield volume "${m.name}" is not in the output mdl: block removed from the def [T]` });
        }
        if (edited) { fs.writeFileSync(dp, Buffer.from(t, 'latin1')); continue; }
      }
    }
    // VOL-FX: two load stops the gate only refused (BUILD-GATE). Both [V log SWEEP-0A], fix [T] until a game loads the unit.
    // DF_STUFF "weapon <name>": the lookup reads Stuff FILE NAME tags only, "weapon" is no file-name tag, so the prefix is dropped (vanilla gun/203mm_gun carries {203mm_gun});
    //   if the bare name has no Stuff either, donorfit names it on the next round and the refusal below stands.
    // DF_MATERIAL "no material source": "steel" joins the first {props} (a props tag of flesh/steel/wood/.. is a material source), else {props "steel"} opens the entity.
    {
      let t = fs.readFileSync(dp, 'latin1'), n = 0;
      for (const m of res.misses) {
        const pm = m.key === 'DF_STUFF' && /^weapon\s+(\S.*)$/i.exec(m.name);
        if (pm) { const re = new RegExp('"' + esc(m.name) + '"', 'gi'); if (re.test(t)) { t = t.replace(re, '"' + pm[1] + '"'); n++; applied.push(`DF_STUFF "${m.name}": "weapon " prefix dropped -> "${pm[1]}" (Stuff lookup reads file-name tags only) [T]`); } }
        if (m.key === 'DF_MATERIAL' && m.name === 'no material source' && !/\{\s*props\b[^}]*"steel"/i.test(t)) {
          const pr = /\{\s*props\b[^}\r\n]*/i.exec(t);
          if (pr) t = t.slice(0, pr.index + pr[0].length).replace(/\s*$/, '') + ' "steel"' + t.slice(pr.index + pr[0].length);
          else { const ge = /\{\s*game_entity\b/i.exec(t); if (!ge) continue; t = t.slice(0, ge.index + ge[0].length) + '\r\n\t{props "steel"}' + t.slice(ge.index + ge[0].length); }
          n++; applied.push('DF_MATERIAL "no material source": props tag "steel" added (else Undefined material, load aborts) [T]');
        }
      }
      if (n) { fs.writeFileSync(dp, Buffer.from(t, 'latin1')); continue; }
    }
    const text = fs.readFileSync(dp, 'latin1'), lines = text.split('\n'); let changed = 0;
    const groups = new Map();   // def line index -> { chain: [innermost..outermost], missing: Set }
    for (const m of res.misses) {
      if (m.inExt) continue;
      const li = m.defLine - 1; if (!(li >= 0 && li < lines.length)) continue;
      if (m.key === 'DF_AIM' && m.place) {
        const b = m.lookalike || aimBone(m.place, bones); if (!b) continue;
        const re = new RegExp('(\\{\\s*place\\s+"' + esc(m.place) + '")', 'i');
        const at = lines.findIndex(l => re.test(l)); if (at < 0 || /foresight/i.test(lines[at])) continue;
        lines[at] = lines[at].replace(re, `$1 {foresight "${b}"}`); changed++;
        applied.push(`DF_AIM "${m.name}": place "${m.place}" got {foresight "${b}"} [T]`);
      } else if ((m.key === 'LinkBone' || m.key === 'door') && m.macro) {
        const chain = m.macro.split('<').map(x => x.trim().toLowerCase()), g = groups.get(li) || { chain: chain, missing: new Set(), leaf: chain[0] };
        if (chain.length > g.chain.length) g.chain = chain;
        g.missing.add(m.name); groups.set(li, g);
      } else if (m.key === 'LinkBone' && !m.macro) {   // a {linkbone "x"} written in the def itself
        const re = new RegExp('\\{\\s*linkbone\\s+"' + esc(m.name) + '"\\s*\\}[ \\t]*', 'i');
        for (let i = li; i < Math.min(lines.length, li + 10); i++) if (re.test(lines[i])) { lines[i] = lines[i].replace(re, ''); changed++; applied.push(`LinkBone "${m.name}": {linkbone} removed, the seat keeps no bone [T]`); break; }
      }
    }
    for (const [li, g] of [...groups].sort((a, b) => b[0] - a[0])) {   // bottom up
      const outer = g.chain[g.chain.length - 1], cre = new RegExp('\\(\\s*"' + esc(outer) + '"\\s*\\)', 'i');
      if (!cre.test(lines[li])) continue;
      const ctx = { leaf: g.leaf, chain: new Set(g.chain.slice(1)), missing: [...g.missing], dropped: [], failed: false, defText: text, defKey, outDir, vf, vfsLib };
      const units = expandSeats(`("${outer}")`, ctx);
      if (ctx.failed || !ctx.dropped.length) continue;
      const indent = /^[ \t]*/.exec(lines[li])[0], cr = /\r$/.test(lines[li]) ? '\r' : '';
      lines[li] = lines[li].replace(cre, units.map((u, i) => (i ? indent : '') + u.replace(/\r?\n/g, cr + '\n')).join(cr + '\n') || ';');
      changed++;
      applied.push(`seats: "${outer}" (def line ${li + 1}) expanded in place, ${ctx.dropped.length} seat call(s) dropped for the bone/door the mdl lacks: ${[...new Set(ctx.dropped)].join(' ')} [T]`);
    }
    if (changed) fs.writeFileSync(dp, Buffer.from(lines.join('\n'), 'latin1'));
    if (!changed) {
      const cand = [dp]; try { for (const x of fs.readdirSync(path.dirname(dp))) if (/\.(ext|inc)$/i.test(x)) cand.push(path.join(path.dirname(dp), x)); } catch {}
      const leaves = new Map(), emits = [...bones.values()].filter(b => /^emit\d+$/i.test(b));
      for (const m of res.misses) if ((m.key === 'LinkBone' || m.key === 'door') && m.macro) { const lf = m.macro.split('<')[0].trim(); (leaves.get(lf) || leaves.set(lf, new Set()).get(lf)).add(m.name); }
      for (const f of cand) {
        let t = fs.readFileSync(f, 'latin1'), ch = false;
        for (const [lf, ms] of leaves) { const cur = t; const r = nolbFix(t, lf, [...ms], emits, M => findDefine(M, cur, defKey, outDir, vf, vfsLib)); if (r) { t = r.text; ch = true; applied.push(`seats: ${r.n} call(s) of "${lf}" in ${path.basename(f)} use ${lf}_nolb (no {linkbone}) for: ${[...ms].join(' ')} [T]`); } }
        for (const m of res.misses) if (m.key === 'DF_PLAIN_BONE') { const r = stripBoneKids(t, m.name); if (r != null && r !== t) { t = r; ch = true; applied.push(`DF_PLAIN_BONE "${m.name}": {limits}/{speed} removed [T]`); } }
        if (ch) { fs.writeFileSync(f, Buffer.from(t, 'latin1')); changed++; }
      }
    }
    if (!changed) break;
  }
  try {   // the final state: the audit runs on what is on disk
    const res = donorfit.check({ def: dp, game, exe: exe || undefined, mods: [], moddir: outDir, rep });
    if (!res.fatal) {
      seatBad = seatAudit(res); left = res.misses.map(m => `${m.key} "${m.name}"${m.macro ? ' via ' + m.macro : ''} def line ${m.defLine}`);
      // FXE-2: what is still here after the rules and stops the game at load is refused by name: { code, text }
      for (const m of res.misses) {
        if (m.key === 'bone-block') refuse.push({ code: 'ERR_DONOR_BONE', text: `bone block "${m.name}" (def line ${m.defLine}${m.inExt ? ', in ' + m.inExt : ''}${m.macro ? ', via ' + m.macro : ''}) names a bone the output mdl lacks${m.inExt || m.macro ? ' and sits where this tool cannot edit it' : ' and holds {limits} for a main-gun bone; the mdl has no typed lookalike and no typed bone above the muzzle, so the gun could not aim. Add a revolute bone above the muzzle in the mdl, or pick a donor that fits it'}: Bone not found, Block terminator expected at load` });
        else if (m.key === 'DF_BONE_MISSING') {   // T-DONORFIT: no rule mapped it: a hand gap, and a stop (the unit would load and never be operatable)
          refuse.push({ code: 'ERR_DONOR_BONE_MISSING', text: `weapon place "${m.name}"${m.role ? ` (type ${m.role})` : ''} (def line ${m.defLine}${m.inExt ? ', in ' + m.inExt : ''}${m.macro ? ', via ' + m.macro : ''}) has no {LinkBone} and no mdl bone of that name, and no rule maps it to one: the unit would load and never become operatable (G-DONORSPAWN [I]). Rename the place to a bone of the mdl, or give it {LinkBone "<bone>"}` });
          gaps.push({ kind: 'hand', code: 'ERR_DONOR_BONE_MISSING', key: 'place ' + m.name, reason: `T-DONORFIT weapon place "${m.name}"${m.role ? ` (type ${m.role})` : ''} names no bone of the output mdl and no rule maps it: AS2 needs a hand rename or {LinkBone}` });
        }
        else if (m.key === 'DF_STUFF') refuse.push({ code: 'ERR_DONOR_WEAPON', text: `{weapon "${m.name}"} is carried by no Stuff file name (weapon not found): No Stuff found for tags, then ACCESS_VIOLATION in ` });
        else if (m.key === 'LinkBone' && isMainPlace(res, m.name)) refuse.push({ code: 'ERR_DONOR_LINKBONE', text: `the main gun's {LinkBone "${m.name}"} (def line ${m.defLine}) is not in the output mdl and was not aliased` });
        else if ((m.key === 'foresight' || m.key === 'DF_AIM') && res.gun !== undefined && !m.macro && (!m.place || m.place === 'gun' || (res.wplaces && res.wplaces[0] && res.wplaces[0].name === m.place))) refuse.push({ code: 'ERR_DONOR_MUZZLE', text: `muzzle/foresight bone "${m.name}" (def line ${m.defLine}) of the main weapon is not in the output mdl and has no lookalike` });
      }
    }
  } catch { /* the earlier audit stands */ }
  return { applied, left, rounds, seatMap, seatBad, refuse, gaps };
}

module.exports = { fileCheck, fitPass, parenEnd, balEnd, aimBone, mdlBoneNames, findDefine, unitsOf, expandSeats, typedLookalike, copyBone };
