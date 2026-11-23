#!/usr/bin/env node
// helmetport (PORT-85): GoH helmet / headgear / body-armour stuff into an AS2 mod: set/stuff entry rewritten for the AS2 patterns,
// the model pulled by goh2as2 (plus the mtl files GoH keeps beside the mdl, not the ply), and a breed {armors} so a soldier wears it.
//   node tools/helmetport/helmetport.js --goh <GoH dir> --out <mod dir> [--game <AS2 dir>] [--mods a,b] [--exe as64|mowas_2|mowas2]
//        --exe: the AS2 build the mod is for: the vfs view of --game (mowas_2: no as64/core) and goh2as2 --exe; none = the vfs rule, as
//        before; goh refused (exit 2: GoH is the source)
//        env HELMETPORT_GOH2AS2 (tests): a node script run in place of goh2as2 with the same args
//        (--item <name|set key> ... | --breed <GoH breed name|key> [--as <AS2 breed key> [--as-from <AS2 breed key>]] | --all | --list)
//        [--no-model] [--keep-light-armor] [--fit auto|none|x,y,z] [--fit-scale s] [--tone auto|none|k|r,g,b] [--cap-tone screen|k|r,g,b|auto] [--cap-spec ref|keep] [--chunk N] [--dry-run] [--format F] [-o file] [-q]
//   --item   GoH set/stuff/{head,body}/**/<name> (repeatable); a `from` parent that is another GoH head/body set is ported too.
//   --breed  reads {armors {head x}{body y}} of a GoH breed (set/breed/**/<name>[.set]) and ports x, y.
//   --as     writes AS2 breed <key> = the AS2 breed --as-from (default --as itself) read through lib/vfs, its {armors} replaced by the GoH one
//            (inserted before perks/veterancy/inventory when absent; order). needs --game.
//   --all    every GoH head/body set (models in --chunk entity batches, default 150). --list: counts per kind, writes nothing.
// set rules [V data 2026-11-08, GoH 1034 heavy / 511 light / 8 item head sets, 10 body, 176-203]:
//   stuff tags = file name split on '.' (helmet.pattern = "helmet pattern"); `from` finds a stuff by tag set, a miss = "pattern not found"
//   then a null base. GoH patterns heavy_headgear / light_headgear do not exist in AS2, so:
//     from "pattern heavy_headgear" -> from "helmet pattern"   (AS2 helmet: tag armor, mass 0.8)          HP_FROM_HEAVY
//     from "pattern light_headgear" -> from "pattern headgear" (AS2 cap shape: fieldcap_rus, cap1_ger)    HP_FROM_LIGHT
//     light + own {tag "armor"} (75 GoH sidecaps): armor dropped, else the cap gets the head holder's pierceAbsorb 30 like a
//       helmet (human.ext armor "head", HUM-24); --keep-light-armor keeps it                                 WARN_HP_LIGHT_ARMOR
//     body {item ... {tag "... armor"}} -> {from "pattern overcoat" {tag "armor"} ...}: the GoH tag lacks "body", the AS2 body
//       holder has {mask "body"} (human.ext) so the GoH shape would be refused (HUM-22 "Can't put armor")    HP_BODY_OVERCOAT
//     body item without armor (radios, packs, cape): kept as a plain item, carried in the box, not worn     WARN_HP_BODY_NOT_WORN
//     head item (gas masks): kept; no "head" tag -> cannot sit in the head holder                             WARN_HP_NO_HEAD_TAG
//     from "<other GoH set>": parent ported first HP_FROM_CHAIN; found only in AS2: kept HP_FROM_AS2; else WARN_HP_FROM_UNKNOWN
//     child keys no AS2 stuff reader takes (goh2as2/stuffkeys.json, PORT-26) dropped                         WARN_HP_KEY_DROP
//     (macro calls) left as is                                                                                WARN_HP_MACRO
//   name: same file name as an AS2 stuff at another key = one of the two is ignored (FindStuff dedupe) WARN_HP_NAME_CLASH;
//     same key = override HP_OVERRIDE; two GoH sets of that name WARN_HP_DUP_NAME (first in key order taken).
// model: {entity} def found in GoH (else WARN_HP_NO_ENTITY, 20 GoH sets name no def); goh2as2 --entity pulls def/mdl/ply/textures.
//   GoH plys name a material ("ger_helm.mtl") that sits in the MDL folder, not the ply folder (shared ply, per-variant skin); goh2as2
//   looks beside the ply only, so helmetport hands it those mdl-folder mtl keys (HP_MTL_MDL_DIR [I]: AS2 resolves like GoH, same
//   engine; a ply with no mtl crashes , PORT-131). Neither folder: WARN_HP_MTL_MISSING.
// fit/tone (fit.js,, after goh2as2; --fit on head entities only:
//   --fit auto per item and shape: the item's main ply vs AS2 helmet1_ger/helmet.ply (helmet = heavy)
//                fieldcap1_ger/cap.ply (cap = light: scale up to the vanilla width, crown front + top matched). Needs --game; else
//                per-shape defaults (helmet +0.42 +0.06 +0.24, cap +0.25 +0.01 -0.32 scale 1.12) WARN_HP_FIT_REF. x,y,z = given, all
//                shapes. Put on the mdl root's child bones ({Position}/{Matrix34}); root views wrapped in bone "hp_fit": the engine
//                replaces the root transform at attach [V] HP_FIT
//   --fit-scale  uniform scale on the same bones (default 1; given = also replaces the cap auto scale).
//   --tone auto  each diffuse of the entity mtls RGB * k, rewritten A8R8G8B8 <= 512 px; k per channel per shape = median AS2 ref /
//                median GoH ref (helmet + body: helmet M40 vs ger_helm_39; cap: fieldcap_ger vs ger_cap_fieldcap_43); refs missing:
//                fit.js TONE_DEFAULTS, WARN_HP_TONE_REF. k or r,g,b = given.                                                       HP_TONE
//                not decodable: WARN_HP_TONE_DECODE (left as goh2as2 wrote it).
//   --cap-tone   tone for cap-shape items only (screen|auto|none|k|r,g,b), wins over --tone for caps. screen = fit.js CAP_TONE_SCREEN
//                1.65,1.75,1.65: on-screen match to vanilla fieldcap1_ger in one edrun frame (auto matches texture medians, which
//                leaves GoH caps ~0.72x darker and bluer in game).
//   --cap-spec ref  cap-shape mtls: {specular} -> the vanilla fieldcap1_ger spec texture by absolute path (not copied) and the color
//                alpha (spec power) -> its power (GoH caps: ger_sp_null black, power 25; vanilla fieldcap_ger_sp, 76). keep = as GoH
//                (default). ref missing / no --game: fit.js CAP_SPEC_DEFAULT, WARN_HP_SPEC_REF.                                   HP_CAP_SPEC
// output: <out>/resource/<key>, text cp1251 + CRLF. refuses --out inside the GoH or AS2 install. errors: HP_ERR_* (exit 1).
// Author: Imperator_Aug (ARSENAL, ia-20e716b0)
'use strict';
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const pakset = require('../lib/pakset'), enc = require('../lib/enc'), cli = require('../lib/cli');
const { createReport } = require('../lib/report');
const { meshRefs } = require('../binhdr/ply');

const STUFF_KEYS = new Set(require('../goh2as2/stuffkeys.json').map(s => s.toLowerCase()));
const PATTERN_TAGS = {   // AS2 vanilla pattern -> its full tag set (gamelogic.pak set/stuff/head|body) [V data]
  'helmet pattern': ['smallitemin1hand', 'head', 'armor'],
  'pattern headgear': ['smallitemin1hand', 'head'],
  'pattern overcoat': ['smallitemin1hand', 'body'],
};
const HEAVY = 'helmet pattern', LIGHT = 'pattern headgear', OVERCOAT = 'pattern overcoat';
const tagKey = s => s.trim().toLowerCase().split(/\s+/).filter(Boolean).sort().join(' ');
const fwd = p => p.replace(/\\/g, '/');
const baseName = k => k.slice(k.lastIndexOf('/') + 1);
const dirOf = k => k.slice(0, k.lastIndexOf('/'));
function normKey(k) { const out = []; for (const p of fwd(k).toLowerCase().split('/')) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p); } return out.join('/'); }

// ---- GoH index: loose files under resource/ win over pak entries (pak keys rooted at the pak dir, PORT-34)
function gohIndex(gohDir) {
  const root = path.join(gohDir, 'resource'), map = new Map();
  (function walk(d, rel) {
    let ds; try { ds = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const x of ds) {
      const p = path.join(d, x.name), r = rel ? rel + '/' + x.name : x.name;
      if (x.isDirectory()) walk(p, r); else if (!/\.pak$/i.test(x.name)) map.set(r.toLowerCase(), () => fs.readFileSync(p));
    }
  })(root, '');
  const ps = pakset.open(root, {});
  for (const e of ps.entries) if (!map.has(e.key)) map.set(e.key, () => pakset.read(e));
  return map;
}
function decode(buf) {   // byte-preserving: GoH set text is cp1251/ASCII; a UTF-8 BOM file is re-encoded at write
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { s: buf.subarray(3).toString('utf8'), utf8: true };
  return { s: buf.toString('latin1'), utf8: false };
}
function encodeOut(s, utf8) {
  const t = s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  return utf8 ? enc.encodeCp1251(t) : Buffer.from(t, 'latin1');
}

// ---- tiny SDL scanner: outer block header + top-level child blocks (strings, ; comments, nested braces/parens respected)
function skipStr(s, i) { const j = s.indexOf('"', i + 1); return j < 0 ? s.length : j + 1; }
function scanBlock(s, i) {   // s[i] === '{' or '(' -> index after its match
  let d = 0;
  for (let j = i; j < s.length;) {
    const c = s[j];
    if (c === '"') { j = skipStr(s, j); continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\n') j++; continue; }
    if (c === '{' || c === '(') d++; else if (c === '}' || c === ')') { d--; if (d === 0) return j + 1; }
    j++;
  }
  return -1;
}
function parseSet(s) {
  let i = 0;
  for (;;) { while (i < s.length && /\s/.test(s[i])) i++; if (s[i] === ';') { while (i < s.length && s[i] !== '\n') i++; continue; } break; }
  if (s[i] !== '{') return null;
  const end = scanBlock(s, i); if (end < 0) return null;
  const head = /^\{\s*(?:from\s+"([^"]*)"|([A-Za-z_][\w]*))/.exec(s.slice(i, i + 400));
  if (!head) return null;
  const kids = [], macros = [];
  let j = i + head[0].length;
  while (j < end - 1) {
    const c = s[j];
    if (c === '"') { j = skipStr(s, j); continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\n') j++; continue; }
    if (c === '{' || c === '(') {
      const e = scanBlock(s, j); if (e < 0) return null;
      const text = s.slice(j, e), m = /^[{(]\s*"?([A-Za-z_][\w]*)/.exec(text);
      (c === '{' ? kids : macros).push({ name: m ? m[1].toLowerCase() : '?', text });
      j = e; continue;
    }
    j++;
  }
  return { from: head[1] != null ? head[1] : null, type: head[2] ? head[2].toLowerCase() : null, kids, macros };
}
const tagsOf = kids => { const t = kids.find(k => k.name === 'tag'); const m = t && /\{\s*tag\s+"([^"]*)"/.exec(t.text); return m ? m[1].toLowerCase().split(/\s+/).filter(Boolean) : []; };
const entityOf = kids => { const t = kids.find(k => k.name === 'entity'); const m = t && /\{\s*entity\s+"([^"]*)"/.exec(t.text); return m ? m[1] : null; };
const setTag = (kids, tags) => {
  const i = kids.findIndex(k => k.name === 'tag');
  if (!tags.length) { if (i >= 0) kids.splice(i, 1); return; }
  const t = { name: 'tag', text: `{tag "${tags.join(' ')}"}` };
  if (i >= 0) kids[i] = t; else kids.unshift(t);
};
const render = (header, kids, macros) => header + '\n' + kids.concat(macros).map(k => '\t' + k.text.trim()).join('\n') + '\n}\n';

// ---- one set -> converted text + facts
function convertSet(key, text, ctx) {
  const rep = ctx.rep, rel = 'resource/' + key, p = parseSet(text);
  if (!p) { rep.add(rel, 0, 'HP_ERR_PARSE', 'set text is not one {block}: not written'); return null; }
  const kind = key.split('/')[2];   // head | body
  let kids = p.kids.slice(), header, finalTags, own = tagsOf(kids), shape = null;
  for (const k of kids.slice()) if (!STUFF_KEYS.has(k.name)) { rep.add(rel, 0, 'WARN_HP_KEY_DROP', `{${k.name} ...} dropped: no AS2 stuff reader takes it (PORT-26, the reader stops there)`); kids.splice(kids.indexOf(k), 1); }
  if (p.macros.length) rep.add(rel, 0, 'WARN_HP_MACRO', `${p.macros.length} (macro) call(s) left as is: AS2 needs the define in this dir's .presets`);
  if (p.from != null) {
    const ft = tagKey(p.from);
    if (ft === 'heavy_headgear pattern') { header = `{from "${HEAVY}"`; rep.info(rel, 0, 'HP_FROM_HEAVY', `from "${p.from}" -> "${HEAVY}"`); finalTags = PATTERN_TAGS[HEAVY]; shape = 'helmet'; }
    else if (ft === 'light_headgear pattern' || ft === 'headgear pattern') {
      header = `{from "${LIGHT}"`; if (ft !== 'headgear pattern') rep.info(rel, 0, 'HP_FROM_LIGHT', `from "${p.from}" -> "${LIGHT}"`); finalTags = PATTERN_TAGS[LIGHT]; shape = 'cap';
      if (own.includes('armor') && !ctx.keepLightArmor) {
        own = own.filter(t => t !== 'armor'); setTag(kids, own);
        rep.add(rel, 0, 'WARN_HP_LIGHT_ARMOR', 'light headgear with {tag "armor"}: armor dropped (a cap would get the head holder pierceAbsorb 30 of a helmet, HUM-24); --keep-light-armor keeps it [I]');
      }
    } else if (PATTERN_TAGS[ft] || ft === 'helmet pattern' || ft === 'overcoat pattern') { header = `{from "${p.from}"`; finalTags = PATTERN_TAGS[ft] || PATTERN_TAGS[ft === 'overcoat pattern' ? OVERCOAT : HEAVY]; }
    else {
      header = `{from "${p.from}"`;
      const parent = ctx.findGohSet(p.from, key);
      if (parent) { rep.info(rel, 0, 'HP_FROM_CHAIN', `from "${p.from}" = GoH ${parent}: ported too`); const r = ctx.port(parent); finalTags = r ? r.tags : []; shape = r ? r.shape : null; }
      else if (ctx.as2Has(p.from)) { rep.info(rel, 0, 'HP_FROM_AS2', `from "${p.from}" found in AS2: kept`); finalTags = []; }
      else { rep.add(rel, 0, 'WARN_HP_FROM_UNKNOWN', `from "${p.from}": no GoH head/body set and no AS2 stuff of those tags: AS2 says "pattern not found" then reads a null base [I crash]`); finalTags = []; }
    }
  } else if (p.type === 'item') {
    if (kind === 'body' && own.includes('armor')) {
      header = `{from "${OVERCOAT}"`; own = own.filter(t => !PATTERN_TAGS[OVERCOAT].includes(t)); setTag(kids, own); finalTags = PATTERN_TAGS[OVERCOAT]; shape = 'body';
      rep.info(rel, 0, 'HP_BODY_OVERCOAT', `{item} body armour -> {from "${OVERCOAT}"} + {tag "${own.join(' ')}"} (AS2 body holder mask "body")`);
    } else {
      header = '{item'; finalTags = [];
      if (kind === 'body') rep.add(rel, 0, 'WARN_HP_BODY_NOT_WORN', `body item with no armor tag (${own.join(' ') || 'none'}): kept as a plain item, carried in the box, not shown worn (AS2 has no backpack holder) [I]`);
      else if (!own.includes('head')) rep.add(rel, 0, 'WARN_HP_NO_HEAD_TAG', `head item tagged "${own.join(' ')}": no "head" tag, the head holder ({mask "head"}) refuses it as armour`);
      else rep.info(rel, 0, 'HP_ITEM_KEEP', 'plain head {item} kept as is');
    }
  } else { rep.add(rel, 0, 'HP_ERR_TYPE', `top block {${p.type}}: not a stuff item: not written`); return null; }
  const tags = [...new Set(finalTags.concat(own).concat(baseName(key).toLowerCase().split('.')))];
  if (!shape) shape = kind === 'body' ? 'body' : tags.includes('armor') ? 'helmet' : 'cap';
  return { text: render(header, kids, p.macros), tags, entity: entityOf(kids), kind, shape };
}

// ---- model: entity def -> mdl -> ply -> mtl names, looked up in the mdl folder when the ply folder lacks them
function modelPlan(defKey, idx, rep) {
  const extra = [], read = k => decode(idx.get(k)()).s;
  const def = read(defKey), dd = dirOf(defKey);
  for (const m of def.matchAll(/\{\s*extension\s+"([^"]+\.mdl)"/gi)) {
    const mk = normKey(m[1].startsWith('/') ? m[1] : dd + '/' + m[1]);
    if (!idx.has(mk)) { rep.add('resource/' + defKey, 0, 'WARN_HP_MDL_MISSING', `Extension ${m[1]} -> ${mk}: not in GoH data`); continue; }
    const md = dirOf(mk), seen = new Set();
    for (const v of read(mk).matchAll(/\{\s*volumeview\s+"([^"]+)"/gi)) {
      const pk = normKey(v[1].startsWith('/') ? v[1] : md + '/' + v[1]);
      if (seen.has(pk) || !idx.has(pk)) continue; seen.add(pk);
      let r; try { r = meshRefs(idx.get(pk)()); } catch { continue; }
      for (const mt of r.mtls || []) {
        const nm = fwd(mt).toLowerCase();
        if (!/\.mtl$/.test(nm)) continue;
        const atPly = normKey(dirOf(pk) + '/' + nm), atMdl = normKey(md + '/' + nm);
        if (idx.has(atPly)) continue;   // goh2as2 follows it
        if (idx.has(atMdl)) { if (!extra.includes(atMdl)) { extra.push(atMdl); rep.info('resource/' + pk, 0, 'HP_MTL_MDL_DIR', `material ${mt} not beside the ply; ${atMdl} (mdl folder) carried [I]`); } }
        else rep.add('resource/' + pk, 0, 'WARN_HP_MTL_MISSING', `material ${mt}: neither ${atPly} nor ${atMdl} in GoH: a ply with no mtl crashes at load (PORT-131)`);
      }
    }
  }
  return extra;
}

// ---- entity def -> { mdls, mtls } GoH keys (mtl beside the ply, else in the mdl folder)
function modelFiles(defKey, idx) {
  const read = k => decode(idx.get(k)()).s, mdls = [], mtls = [];
  const def = read(defKey), dd = dirOf(defKey);
  for (const m of def.matchAll(/\{\s*extension\s+"([^"]+\.mdl)"/gi)) {
    const mk = normKey(m[1].startsWith('/') ? m[1] : dd + '/' + m[1]);
    if (!idx.has(mk) || mdls.includes(mk)) continue; mdls.push(mk);
    const md = dirOf(mk);
    for (const v of read(mk).matchAll(/\{\s*volumeview\s+"([^"]+)"/gi)) {
      const pk = normKey(v[1].startsWith('/') ? v[1] : md + '/' + v[1]);
      if (!idx.has(pk)) continue;
      let r; try { r = meshRefs(idx.get(pk)()); } catch { continue; }
      for (const mt of r.mtls || []) {
        const nm = fwd(mt).toLowerCase(); if (!/\.mtl$/.test(nm)) continue;
        const k = [normKey(dirOf(pk) + '/' + nm), normKey(md + '/' + nm)].find(x => idx.has(x));
        if (k && !mtls.includes(k)) mtls.push(k);
      }
    }
  }
  return { mdls, mtls };
}
function texKey(ref, mtlKey) {   // mtl texture ref -> GoH key: "$/x" = texture/common/x, "/x" = x, else beside the mtl; .dds when no extension
  let r = fwd(ref).toLowerCase();
  r = r.startsWith('$/') ? 'texture/common/' + r.slice(2) : r.startsWith('/') ? r.slice(1) : dirOf(mtlKey) + '/' + r;
  r = normKey(r); return /\.[a-z0-9]{2,4}$/.test(baseName(r)) ? r : r + '.dds';
}
function mainPly(mk, idx) {   // first VolumeView of the mdl (first LOD of the first view = the main shell) -> GoH key
  const m = /\{\s*volumeview\s+"([^"]+)"/i.exec(decode(idx.get(mk)()).s);
  return m ? normKey(m[1].startsWith('/') ? m[1] : dirOf(mk) + '/' + m[1]) : null;
}
function fitTone({ X, idx, vf, rep, entities, headEnts, shapes, fitArg, toneArg, fitScale, scaleGiven, capTone, capSpec }) {
  const fit = require('./fit'), vfs = require('../lib/vfs');
  const as2Read = k => { const rec = vf && vf.files.get(k); return rec ? vfs.readRec(rec) : null; };
  const gohRead = k => idx.has(k) ? idx.get(k)() : null;
  const outPath = k => path.join(X.out, 'resource', k);
  const vcache = new Map(), verts = (k, rd) => { if (!vcache.has(k)) { const b = rd(k); vcache.set(k, b ? fit.plyVerts(b) : []); } return vcache.get(k); };
  const warned = new Set();
  // per mdl: { off, s, how } ; helmet = heavy head item, cap = light (fit.js header)
  function fitFor(shape, mk) {
    if (fitArg === 'none') return { off: [0, 0, 0], s: fitScale, how: 'scale only' };
    if (fitArg !== 'auto') return { off: fitArg.split(',').map(Number), s: fitScale, how: 'given' };
    const sh = shape === 'cap' ? 'cap' : 'helmet', R = fit.REF[sh], a = verts(R.as2Ply, as2Read);
    const pk = mainPly(mk, idx); let g = pk ? verts(pk, gohRead) : [], src = pk;
    if (!g.length) { g = verts(R.gohPly, gohRead); src = 'GoH ref ' + R.gohPly; }
    let r = null;
    if (a.length && g.length) r = sh === 'cap' ? fit.capFit(a, g, scaleGiven ? fitScale : 0) : { off: fit.autoOffset(a, g), s: fitScale };
    if (r) return { off: r.off, s: r.s, how: `${sh} auto: ${src} vs AS2 ${R.as2Ply}` };
    const D = fit.FIT_DEFAULTS[sh];
    if (!warned.has('fit ' + sh)) { warned.add('fit ' + sh); rep.add('fit', 0, 'WARN_HP_FIT_REF', `${sh}: reference ply missing or empty (${vf ? '' : 'no --game; '}AS2 ${R.as2Ply}, GoH ${src || R.gohPly}): default offset ${D.off.join(' ')} scale ${D.s} [V data 2026-11-08]`); }
    return { off: D.off.slice(), s: scaleGiven ? fitScale : D.s, how: sh + ' default' };
  }
  const tcache = new Map();
  function toneFor(shape) {   // -> number | [r,g,b] | null
    const ta = shape === 'cap' && capTone ? capTone : toneArg;
    if (ta === 'none') return null;
    if (ta !== 'auto') { const v = ta.split(',').map(Number); return v.length === 3 ? v : v[0]; }
    const sh = fit.REF[shape] ? shape : 'helmet';
    if (tcache.has(sh)) return tcache.get(sh);
    const R = fit.REF[sh], t = fit.autoTone(as2Read(R.as2Dds), gohRead(R.gohDds));
    let k = t;
    if (t) rep.info('tone', 0, 'HP_TONE_AUTO', `${sh}: k ${t.join(' ')} (r g b) = median ${R.as2Dds} / GoH ${R.gohDds}`);
    else { k = fit.TONE_DEFAULTS[sh]; rep.add('tone', 0, 'WARN_HP_TONE_REF', `${sh}: reference texture missing or not decodable${vf ? '' : ' (no --game)'}: default k ${k.join(' ')}`); }
    tcache.set(sh, k); return k;
  }
  const doFit = fitArg !== 'none' || fitScale !== 1;
  const toned = new Set();
  for (const [ent, dk] of entities) {
    const mf = modelFiles(dk, idx), shape = shapes.get(ent) || 'helmet';
    if (doFit && headEnts.has(ent)) for (const mk of mf.mdls) {
      if (!fs.existsSync(outPath(mk))) continue;
      const f = fitFor(shape, mk), d = decode(idx.get(mk)()), r = fit.patchMdl(d.s, f.off, f.s);
      if (!r.notes.length) { rep.add('resource/' + mk, 0, 'WARN_HP_FIT_NONE', 'no {Skeleton} root bone to offset: left as is'); continue; }
      fs.writeFileSync(outPath(mk), encodeOut(r.text, d.utf8));
      rep.info('resource/' + mk, 0, 'HP_FIT', `offset ${f.off.join(' ')}${f.s !== 1 ? ' scale ' + f.s : ''} (${f.how}): ${r.notes.join('; ')}`);
    }
    const k = toneFor(shape);
    if (k) for (const mt of mf.mtls) {
      const m = /\{\s*diffuse\s+"([^"]+)"/i.exec(decode(idx.get(mt)()).s); if (!m) continue;
      const tk = texKey(m[1], mt); if (toned.has(tk)) continue; toned.add(tk);
      const src = gohRead(tk); if (!src || !fs.existsSync(outPath(tk))) continue;
      const r = fit.toneDds(src, k);
      if (!r) { rep.add('resource/' + tk, 0, 'WARN_HP_TONE_DECODE', 'diffuse not decodable: left as goh2as2 wrote it, renders darker [I]'); continue; }
      fs.writeFileSync(outPath(tk), r.buf);
      rep.info('resource/' + tk, 0, 'HP_TONE', `diffuse x${Array.isArray(k) ? k.join(',') : k} (${shape}) -> A8R8G8B8 ${r.w}x${r.h}, ${r.mips} mips`);
    }
    if (capSpec === 'ref' && shape === 'cap') for (const mt of mf.mtls) {
      if (!fs.existsSync(outPath(mt))) continue;
      const sp = specRef(), t = fs.readFileSync(outPath(mt), 'latin1'), r = fit.patchSpec(t, sp.ref, sp.power);
      if (!r.notes.length) continue;
      fs.writeFileSync(outPath(mt), Buffer.from(r.text, 'latin1'));
      rep.info('resource/' + mt, 0, 'HP_CAP_SPEC', `${r.notes.join(', ')} (vanilla ${fit.REF.cap.as2Mtl})`);
    }
  }
  function specRef() {   // vanilla fieldcap1_ger spec ref + power, read once
    if (specRef.v) return specRef.v;
    const b = as2Read(fit.REF.cap.as2Mtl), v = b && fit.mtlSpec(b.toString('latin1'), fit.REF.cap.as2Mtl);
    if (v && (v.ref.startsWith('$') || vf.files.has('resource' + v.ref.toLowerCase() + '.dds') || vf.files.has('resource' + v.ref.toLowerCase()))) return (specRef.v = v);
    rep.add('cap-spec', 0, 'WARN_HP_SPEC_REF', `${fit.REF.cap.as2Mtl} or its specular texture not found${vf ? '' : ' (no --game)'}: default ${fit.CAP_SPEC_DEFAULT.ref} power ${fit.CAP_SPEC_DEFAULT.power}`);
    return (specRef.v = fit.CAP_SPEC_DEFAULT);
  }
}

function inside(child, parent) { if (!parent) return false; const r = path.relative(path.resolve(parent), path.resolve(child)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); }

function main() {
  const o = cli.parse(process.argv.slice(2), { flags: ['--no-model', '--keep-light-armor', '--dry-run', '--all', '--list'], values: ['--goh', '--out', '--breed', '--as', '--as-from', '--chunk', '--fit', '--fit-scale', '--tone', '--cap-tone', '--cap-spec'] });
  const items = []; const av = process.argv.slice(2); for (let i = 0; i < av.length; i++) if (av[i] === '--item') items.push(av[++i]);
  o.pos = o.pos.filter(x => !items.includes(x));
  const X = o.x;
  // --exe (lib/cli common): the AS2 build of the port; goh is the source (--goh), never the target
  if (o.exe === 'goh') require('../lib/games').refuse('helmetport', 'goh', 'the target of a GoH port is an AS2 build (as64 or mowas_2); GoH is the source, given by --goh', 'plan/reports/game-parity/t-port-b.md: n/a (source game)');
  if (!X.goh || (!X.list && !X.out) || (!items.length && !X.breed && !X.all && !X.list)) {
    console.error('usage: helmetport --goh <GoH dir> --out <mod dir> [--game <AS2>] (--item name ... | --breed name [--as key [--as-from key]] | --all | --list) [--no-model] [--keep-light-armor] [--fit auto|none|x,y,z] [--fit-scale s] [--tone auto|none|k|r,g,b] [--cap-tone screen|k|r,g,b|auto] [--cap-spec ref|keep] [--dry-run]');
    process.exit(2);
  }
  if (X.out && (inside(X.out, X.goh) || inside(X.out, o.gameDir) && !inside(X.out, path.join(o.gameDir, 'mods')))) { console.error('error: --out inside the GoH or AS2 install (a mods/<name> folder is allowed)'); process.exit(2); }
  const fitArg = String(X.fit || 'none').toLowerCase(), toneArg = String(X.tone || 'none').toLowerCase(), fitScale = X['fit-scale'] != null ? Number(X['fit-scale']) : 1;
  if (!/^(auto|none|[-+.\d]+,[-+.\d]+,[-+.\d]+)$/.test(fitArg) || !/^(auto|none|\d*\.?\d+|\d*\.?\d+,\d*\.?\d+,\d*\.?\d+)$/.test(toneArg) || !(fitScale > 0)) { console.error('error: --fit auto|none|x,y,z, --tone auto|none|k|r,g,b, --fit-scale > 0'); process.exit(2); }
  let capTone = X['cap-tone'] != null ? String(X['cap-tone']).toLowerCase() : null; if (capTone === 'screen') capTone = require('./fit').CAP_TONE_SCREEN;
  const capSpec = String(X['cap-spec'] || 'keep').toLowerCase();
  if ((capTone && !/^(auto|none|\d*\.?\d+|\d*\.?\d+,\d*\.?\d+,\d*\.?\d+)$/.test(capTone)) || !/^(ref|keep)$/.test(capSpec)) { console.error('error: --cap-tone screen|auto|none|k|r,g,b, --cap-spec ref|keep'); process.exit(2); }
  if (X.as && !o.gameDir) { console.error('error: --as needs --game'); process.exit(2); }
  const rep = createReport(), idx = gohIndex(X.goh);
  const setKeys = [...idx.keys()].filter(k => /^set\/stuff\/(head|body)\/[^.]+$|^set\/stuff\/(head|body)\/.*\/[^/.]+$/.test(k)).sort();
  const byName = new Map(); for (const k of setKeys) { const n = baseName(k); (byName.get(n) || byName.set(n, []).get(n)).push(k); }
  const defs = new Map(); for (const k of [...idx.keys()].sort()) { const m = /^entity\/.*\/([^/]+)\.def$/.exec(k); if (m && !defs.has(m[1])) defs.set(m[1], k); }

  if (X.list) {
    const c = {};
    for (const k of setKeys) { const p = parseSet(decode(idx.get(k)()).s), kind = k.split('/')[2]; const f = !p ? 'unparsed' : p.from != null ? 'from "' + p.from + '"' : '{' + p.type + '}'; c[kind + ' ' + f] = (c[kind + ' ' + f] || 0) + 1; }
    for (const [k, n] of Object.entries(c).sort()) console.log(`${String(n).padStart(5)}  ${k}`);
    console.log(`${setKeys.length} GoH head/body sets, ${[...byName.values()].filter(v => v.length > 1).length} names in more than one file`);
    return;
  }

  // AS2 side (optional): stuff names + breeds through lib/vfs
  let vf = null, as2Stuff = new Map();
  if (o.gameDir) {
    const bo = { gameDir: o.gameDir, mods: o.mods }; if (o.exe) bo.exe = o.exe;   // no --exe: the vfs rule (as64 first), as before
    vf = require('../lib/vfs').build(bo);
    for (const k of vf.files.keys()) { const m = /^resource\/set\/stuff\/(.*)$/.exec(k); if (m && !/\.(presets|fsm)$/.test(k)) { const t = tagKey(baseName(k).split('.').join(' ')); if (!as2Stuff.has(t)) as2Stuff.set(t, m[0].slice('resource/'.length)); } }
  }
  const as2Has = tags => { const want = tagKey(tags).split(' '); for (const t of as2Stuff.keys()) { const have = t.split(' '); if (want.every(w => have.includes(w))) return true; } return !vf && !!PATTERN_TAGS[tagKey(tags)]; };

  const done = new Map(), outFiles = new Map(), entities = new Map(), headEnts = new Set(), shapes = new Map();
  const findGohSet = (name, self) => { const t = tagKey(name); if (t.includes(' ')) return null; const l = (byName.get(t) || []).filter(k => k !== self); return l[0] || null; };
  const ctx = { rep, keepLightArmor: !!X['keep-light-armor'], findGohSet, as2Has: t => as2Has(t), port: null };
  function port(key) {
    if (done.has(key)) return done.get(key);
    done.set(key, null);   // cycle guard
    const r = convertSet(key, decode(idx.get(key)()).s, ctx);
    done.set(key, r);
    if (!r) return null;
    const rel = 'resource/' + key, n = baseName(key);
    if ((byName.get(n) || []).length > 1) rep.add(rel, 0, 'WARN_HP_DUP_NAME', `${byName.get(n).length} GoH sets named ${n} (${byName.get(n).join(', ')}): this one (first in key order) ported; porting two of them into one mod = AS2 keeps the first it reads`);
    if (vf) { const a = as2Stuff.get(tagKey(n)); if (a === key) rep.info(rel, 0, 'HP_OVERRIDE', `overrides AS2 ${a}`); else if (a) rep.add(rel, 0, 'WARN_HP_NAME_CLASH', `AS2 already has stuff ${n} at ${a}: one of the two is ignored (FindStuff dedupe); rename one`); }
    outFiles.set(key, encodeOut(r.text, false));
    if (!r.entity) rep.add(rel, 0, 'WARN_HP_NO_ENTITY', 'no {entity}: nothing shown worn');
    else if (!defs.has(r.entity.toLowerCase())) rep.add(rel, 0, 'WARN_HP_NO_ENTITY', `{entity "${r.entity}"}: no entity/**/${r.entity}.def in GoH; the item has no model (vanilla does this too, refcheck limits)`);
    else { entities.set(r.entity.toLowerCase(), defs.get(r.entity.toLowerCase())); const e = r.entity.toLowerCase(); if (!shapes.has(e)) shapes.set(e, r.shape); if (r.kind === 'head') headEnts.add(e); }
    rep.info(rel, 0, 'HP_SET', `-> ${key} (tags ${r.tags.join(' ')})`);
    return r;
  }
  ctx.port = port;
  const resolveItem = it => {
    const k = normKey(it.replace(/^resource\//i, ''));
    if (idx.has(k) && setKeys.includes(k)) return k;
    const l = byName.get(baseName(k)) || [];
    if (!l.length) { rep.add(it, 0, 'HP_ERR_NOT_FOUND', `no GoH set/stuff/head|body/**/${baseName(k)}`); return null; }
    return l[0];
  };

  const breedArmors = [];
  if (X.breed) {
    const b = normKey(X.breed.replace(/^resource\//i, '')), bn = baseName(b).replace(/\.set$/, '');
    const bk = idx.has(b) ? b : [...idx.keys()].filter(k => k.startsWith('set/breed/') && baseName(k).replace(/\.set$/, '') === bn).sort()[0];
    if (!bk) rep.add(X.breed, 0, 'HP_ERR_NOT_FOUND', 'no GoH breed of that name under set/breed/');
    else {
      const t = decode(idx.get(bk)()).s, a = /\{\s*armors\b/i.exec(t);
      if (!a) rep.add('resource/' + bk, 0, 'WARN_HP_BREED_NO_ARMORS', 'GoH breed has no {armors}: nothing worn to port');
      else {
        const blk = t.slice(a.index, scanBlock(t, a.index));
        for (const m of blk.matchAll(/\{\s*(head|body)\s+"?([^"}\s]+)"?\s*\}/gi)) breedArmors.push({ slot: m[1].toLowerCase(), name: m[2] });
        rep.info('resource/' + bk, 0, 'HP_BREED', `armors: ${breedArmors.map(x => x.slot + ' ' + x.name).join(', ') || 'none'}`);
      }
    }
  }
  const want = X.all ? setKeys.slice() : items.map(resolveItem).filter(Boolean);
  for (const a of breedArmors) { const k = resolveItem(a.name); if (k) { want.push(k); a.key = k; } }
  for (const k of want) port(k);

  // breed armors must fit the AS2 holders: head mask "head", body mask "body" (properties/human.ext)
  for (const a of breedArmors) {
    const r = a.key && done.get(a.key);
    if (r && !r.tags.includes(a.slot)) rep.add('resource/' + a.key, 0, 'WARN_HP_SLOT_MASK', `breed puts it in the ${a.slot} holder but its tags (${r.tags.join(' ')}) lack "${a.slot}": "Can't put armor" (HUM-22)`);
  }
  if (X.as) {
    const asKey = normKey(X.as.replace(/^resource\//i, '')), fromKey = normKey((X['as-from'] || X.as).replace(/^resource\//i, ''));
    const rec = vf.files.get('resource/' + fromKey);
    if (!rec) rep.add(X['as-from'] || X.as, 0, 'HP_ERR_NOT_FOUND', `AS2 breed ${fromKey} not in the vfs`);
    else {
      let t = decode(require('../lib/vfs').readRec(rec)).s.replace(/\r\n/g, '\n');
      const slots = breedArmors.filter(a => a.key && done.get(a.key));
      const blk = '{armors\n' + slots.map(a => `\t\t{${a.slot} "${baseName(a.key)}"}`).join('\n') + '\n\t}';
      const a = /\{\s*armors\b/i.exec(t);
      if (a) t = t.slice(0, a.index) + blk + t.slice(scanBlock(t, a.index));
      else { const m = /\{\s*(perks|veterancy|inventory)\b/i.exec(t); const at = m ? m.index : t.lastIndexOf('}'); t = t.slice(0, at) + blk + '\n\t' + t.slice(at).replace(/^\s*/, ''); }
      if (!slots.length) t = t.replace(/\{armors\n\n\t\}\s*/, '');
      if (dirOf(asKey) !== dirOf(fromKey) && /\(\s*include\s+"[^/"]/.test(t)) rep.add('resource/' + asKey, 0, 'WARN_HP_REL_INCLUDE', `relative (include) of ${fromKey} now resolves in ${dirOf(asKey)}: keep --as in the same folder`);
      outFiles.set(asKey, encodeOut(t, false));
      rep.info('resource/' + asKey, 0, 'HP_BREED_ARMORS', `AS2 breed from ${fromKey}, armors ${slots.map(s => s.slot + ' ' + baseName(s.key)).join(', ') || 'removed'}`);
    }
  }

  // write sets + breed
  if (!X['dry-run']) for (const [k, b] of outFiles) { const f = path.join(X.out, 'resource', k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); }
  // models through goh2as2 (entity closure + the mdl-folder mtl keys)
  if (!X['no-model'] && entities.size) {
    const chunk = Math.max(1, Number(X.chunk) || 150), ents = [...entities.entries()];
    for (let i = 0; i < ents.length; i += chunk) {
      const part = ents.slice(i, i + chunk), extra = [];
      for (const [, dk] of part) for (const m of modelPlan(dk, idx, rep)) if (!extra.includes(m)) extra.push(m);
      const args = [process.env.HELMETPORT_GOH2AS2 || path.join(__dirname, '..', 'goh2as2', 'goh2as2.js'), '--goh', X.goh, '--out', X.out, '--no-rc', '--no-keylint', '-q'];
      for (const [e] of part) args.push('--entity', e);
      let kf = null;
      if (extra.length) { kf = path.join(os.tmpdir(), `helmetport-${process.pid}-${i}.txt`); fs.writeFileSync(kf, extra.join('\n') + '\n'); args.push('--keys', kf); }
      if (o.gameDir) args.push('--game', o.gameDir);
      if (o.exe) args.push('--exe', o.exe);   // goh2as2 --exe: the same AS2 build (no --exe: its args stay as before)
      if (X['dry-run']) args.push('--dry-run');
      const r = cp.spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 28 });
      if (kf) try { fs.unlinkSync(kf); } catch { }
      const out = (r.stdout || '') + (r.stderr || ''), wrote = /wrote [^\n]*/.exec(out), nf = /(\d+) findings/.exec(out);
      if (r.status !== 0 && !wrote) rep.add('goh2as2', 0, 'HP_ERR_MODEL', `goh2as2 exit ${r.status}: ${out.trim().split('\n').slice(-2).join(' | ')}`);
      else rep.info('goh2as2', 0, 'HP_MODEL', `${part.length} entit${part.length > 1 ? 'ies' : 'y'} (${part.map(p => p[0]).slice(0, 4).join(', ')}${part.length > 4 ? ', ...' : ''}), ${extra.length} mdl-folder mtl: ${wrote ? wrote[0] : 'dry run'}; goh2as2 ${nf ? nf[1] : '?'} findings`);
    }
  }
  // goh2as2 may copy the GoH stuff set into the closure: put our converted sets + breed back on top (T-CHAINFIX)
  if (!X['no-model'] && !X['dry-run'] && entities.size) for (const [k, b] of outFiles) fs.writeFileSync(path.join(X.out, 'resource', k), b);
  if (!X['no-model'] && !X['dry-run'] && entities.size && (fitArg !== 'none' || toneArg !== 'none' || fitScale !== 1 || capTone || capSpec === 'ref')) fitTone({ X, idx, vf, rep, entities, headEnts, shapes, fitArg, toneArg, fitScale, scaleGiven: X['fit-scale'] != null, capTone, capSpec });
  cli.printReport(rep, o, { tool: 'helmetport' });
  process.exitCode = Object.keys(rep.counts).some(c => c.startsWith('HP_ERR')) ? 1 : 0;
}
if (require.main === module) cli.run(main);
module.exports = { parseSet, convertSet, modelPlan, modelFiles, texKey, tagKey };
