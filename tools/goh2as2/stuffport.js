// COV-L8K: one GoH stuff file (gun / ammo / set file) onto an AS2 key, with the GoH-only macros expanded from GoH's own defines.
//   goh2as2 stuffport --goh <GoH dir> --game <AS2 dir> --file <GoH key, e.g. set/stuff/gun/88mm_kwk43> [--as <AS2 key>] <mod>
//                     [--exe as64|mowas_2|mowas2] [--mods as64+] [--map <file>] [--no-type-map] [--dry-run] [--kit] [--scale-damage none|auto|<file.json>]
//   --exe (game parity): the AS2 build; vfs and entity index views of that exe (one index cache per exe). --mods default: as64+ for
//     as64 (as64.exe in --game, as before), none for mowas_2. --exe goh is refused (exit 2)
//   --scale-damage (DMGSCALE, gun files): GoH numbers multiplied onto the AS2 scale per class (dmgscale.json for auto; default none)
//   --kit (COV-L8L, set/breed files): only the GoH {inventory} is taken, item tags checked against AS2 stuff and mapped (ITEM_NAMES, nation
//     suffix cut) or dropped, in_hands re-indexed, and spliced into the AS2 breed at --as. codes SP_ITEM_KEEP SP_ITEM_MAP WARN_SP_ITEM_DROPPED WARN_SP_KIT_HANDS SP_KIT
//   --skill (COV-L8M, set/ability/skill_<x>.set): each {"name" from kind ...} block onto the AS2 set/ability file defining that name (else
//     set/ability/<name>.set, or --as); recoil/zoom_recoil/sway dropped; unknown kind (HUM-14) not written; levels AS2 breeds ask for checked.
//     codes SP_SKILL SP_SKILL_KEY_DROP WARN_SP_SKILL_KIND WARN_SP_SKILL_LEVEL WARN_SP_SKILL_MACRO WARN_SP_SKILL_NONE
//   gun files: {filling "tags"} checked like kit items (container word clip/drum/mag cut too): SP_FILL_KEEP SP_FILL_MAP WARN_SP_FILL_UNKNOWN
//   macro map: GoH defines = <GoH dir of the file>/.presets (+ its includes; SDL-50: set/stuff files see their dir's .presets);
//     AS2 defines = the same for the --as key's dir in the AS2 vfs (--mods stack). Per call ("name" ...):
//       KEEP     AS2 has the name with the same body (whitespace/comments aside): call left as is
//       EXPAND   AS2 lacks the name: GoH body inlined, %args substituted, inner calls decided the same way
//       CONFLICT AS2 has the name with another body (PORT-61): GoH body inlined
//       MISSING  GoH has no define either: call left, WARN (it will be "define not found" in AS2)
//   then arithmetic folded to numbers, GoH shell types mapped (SHELL_TYPES, `parameters "x"`, `from "pattern x"`),
//   GoH item tags mapped (ITEM_TAGS, `enable_items`/`disable_items`), --map lines applied, and the goh2as2 PORT pass
//   (convertText: keys no AS2 stuff reader takes are dropped, PORT-26) run. Output bytes passed through (UTF-8 strings, + CRLF under <mod>/resource/<as key>.
//   --map file lines: `old => new` (literal text replace, reported) or `-name` (drop every {name ...} block). # comments.
// codes: SP_KEEP SP_EXPAND SP_CONFLICT (info) WARN_SP_MISSING WARN_SP_UNRESOLVED_ARG WARN_SP_TYPE_UNMAPPED WARN_SP_TAG_DROPPED SP_TYPE SP_TAG SP_MAP
// Author: Imperator_Aug (ARSENAL, ia-85bc4fa3)
'use strict';
const fs = require('fs'), path = require('path');

// GoH shell type (ammo file suffix / parameters tag / pattern name) -> AS2 type (vanilla AS2 has ap apcr fg sm zenite airplane).
// [I] by family: AP-family (capped, ballistic-capped, with or without HE filler) -> ap; sub-calibre -> apcr; HE -> fg; smoke/WP -> sm.
// heat has no AS2 gun shell: left as is (an unmatched parameters block is silent, DMG-01) and warned.
const SHELL_TYPES = {
  ap: 'ap', ap2: 'ap', apc: 'ap', apche: 'ap', aphe: 'ap', apbc: 'ap', apbche: 'ap', apbche2: 'ap', apcbc: 'ap', apcbche: 'ap', apcbche2: 'ap', aphebc: 'ap', aphebc2: 'ap',
  apcr: 'apcr', apcr2: 'apcr', hvap: 'apcr', apds: 'apcr',
  he: 'fg', he2: 'fg', fg: 'fg',
  sm: 'sm', wp: 'sm',
};
// GoH melee/blow item tag -> AS2 tag (null = no AS2 counterpart: dropped from the list). rifle_slap_melee -> rifle [V cov-l8j kill twin];
// rifle_stab_melee = GoH bayonet rifles, AS2 rifles carry no bayonet tag [I]
const ITEM_TAGS = { rifle_slap_melee: 'rifle', rifle_stab_melee: null };

// ---- text scanner (strings, ; comments, nested parens)
function skipStr(s, i) { const j = s.indexOf('"', i + 1); return j < 0 ? s.length : j + 1; }
function stripComments(s) {
  let o = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"') { const j = skipStr(s, i); o += s.slice(i, j); i = j; }
    else if (c === ';') { while (i < s.length && s[i] !== '\n') i++; }
    else { o += c; i++; }
  }
  return o;
}
function closeParen(s, i) {   // s[i] === '(' -> index after its matching ')'
  let d = 0;
  for (let j = i; j < s.length;) {
    const c = s[j];
    if (c === '"') { j = skipStr(s, j); continue; }
    if (c === ';') { while (j < s.length && s[j] !== '\n') j++; continue; }
    if (c === '(') d++; else if (c === ')') { d--; if (d === 0) return j + 1; }
    j++;
  }
  return -1;
}
const norm = b => stripComments(b).replace(/\s+/g, ' ').trim();

// (define "name" body) and (include "x") at any depth of a presets text. read(key) -> text | null for includes
function parseDefines(text, read, defs = new Map(), seen = new Set()) {
  const s = text;
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"') { i = skipStr(s, i); continue; }
    if (c === ';') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '(') {
      const m = /^\(\s*(define|include)\s+"([^"]*)"/.exec(s.slice(i, i + 300));
      if (m) {
        const e = closeParen(s, i);
        if (e < 0) break;
        if (m[1] === 'define') { if (!defs.has(m[2])) defs.set(m[2], s.slice(i + m[0].length, e - 1)); }   // first define wins (sdlreader map insert)
        else if (read) {
          const k = m[2].replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
          if (!seen.has(k)) { seen.add(k); const t = read(k); if (t != null) parseDefines(t, read, defs, seen); }
        }
        i = e; continue;
      }
    }
    i++;
  }
  return defs;
}

// call args: `args v1 v2` (ordinal %0 %1) or `name(v) name2(v)` (named). values are raw text
function parseArgs(t) {
  const named = {}, ord = [];
  let i = 0, ordinal = false;
  const ws = () => { while (i < t.length && /\s/.test(t[i])) i++; };
  const tok = () => {   // one value token: string, (list), or atom
    ws(); if (i >= t.length) return null;
    if (t[i] === '"') { const j = skipStr(t, i); const v = t.slice(i, j); i = j; return v; }
    if (t[i] === '(') { const j = closeParen(t, i); const v = t.slice(i, j < 0 ? t.length : j); i = j < 0 ? t.length : j; return v; }
    const m = /^[^\s()"]+/.exec(t.slice(i)); if (!m) { i++; return ''; } i += m[0].length; return m[0];
  };
  for (;;) {
    ws(); if (i >= t.length) break;
    if (ordinal) { const v = tok(); if (v === null) break; ord.push(v); continue; }
    const m = /^([A-Za-z_][\w]*)\s*\(/.exec(t.slice(i));
    if (m) { const st = i + m[0].length - 1, e = closeParen(t, st); named[m[1]] = t.slice(st + 1, e - 1).trim(); i = e < 0 ? t.length : e; continue; }
    const w = /^args\b/.exec(t.slice(i));
    if (w) { ordinal = true; i += 4; continue; }
    tok();   // stray token: skipped
  }
  return { named, ord };
}
function subst(body, a, name, out) {
  return body.replace(/%(\w+)/g, (m, k) => {
    if (/^\d+$/.test(k) && a.ord[+k] !== undefined) return a.ord[+k];
    if (a.named[k] !== undefined) return a.named[k];
    out.push({ code: 'WARN_SP_UNRESOLVED_ARG', msg: `("${name}"): %${k} has no value in the call; left as %${k}` });
    return m;
  });
}

// expand every ("name" ...) call in text. decide(name) -> KEEP | EXPAND | CONFLICT | MISSING
function expand(text, goh, as2, log, depth = 0) {
  const s = text; let o = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"') { const j = skipStr(s, i); o += s.slice(i, j); i = j; continue; }
    if (c === ';') { const j = s.indexOf('\n', i); const e = j < 0 ? s.length : j; o += s.slice(i, e); i = e; continue; }
    if (c === '(') {
      const m = /^\(\s*"([^"]*)"/.exec(s.slice(i, i + 300));
      if (m) {
        const e = closeParen(s, i), call = s.slice(i, e), name = m[1];
        const gb = goh.get(name), ab = as2.get(name);
        let how = ab !== undefined && (gb === undefined || norm(ab) === norm(gb)) ? 'KEEP' : gb === undefined ? 'MISSING' : ab !== undefined ? 'CONFLICT' : 'EXPAND';
        log.push({ how, name, depth });
        if (how === 'KEEP' || how === 'MISSING' || depth > 20) { o += call; i = e; continue; }
        const a = parseArgs(call.slice(m[0].length, -1));
        const body = subst(stripComments(gb), a, name, log);
        o += expand(body, goh, as2, log, depth + 1).trim();
        i = e; continue;
      }
    }
    o += c; i++;
  }
  return o;
}

// fold innermost (op n n ...) to a number, repeat
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const fmt = v => String(Math.round(v * 1e6) / 1e6);
function foldArith(text) {
  let prev;
  do {
    prev = text;
    text = text.replace(/\(\s*([-+*/])\s+([^()"]*?)\s*\)/g, (m, op, rest) => {
      const vs = rest.trim().split(/\s+/);
      if (!vs.length || !vs.every(v => NUM.test(v))) return m;
      let a = parseFloat(vs[0]);
      for (const v of vs.slice(1).map(parseFloat)) { if (op === '/' && v === 0) return m; a = op === '+' ? a + v : op === '-' ? a - v : op === '*' ? a * v : a / v; }
      return Number.isFinite(a) ? fmt(a) : m;
    });
  } while (text !== prev);
  return text;
}

function mapTypes(text, log, isAmmo) {
  const one = w => { const k = w.toLowerCase(); if (k in SHELL_TYPES) { if (SHELL_TYPES[k] !== k) log.push({ code: 'SP_TYPE', msg: `${w} -> ${SHELL_TYPES[k]}` }); return SHELL_TYPES[k]; } log.push({ code: 'WARN_SP_TYPE_UNMAPPED', msg: `GoH shell type "${w}" has no AS2 shell; left as is` }); return w; };
  text = text.replace(/(\{\s*parameters\s+")([^"]*)"/gi, (m, h, v) => h + v.split(/\s+/).filter(Boolean).map(w => (/^[a-z0-9]+$/i.test(w) && (w.toLowerCase() in SHELL_TYPES || /^(heat|hea|heatb|heatc|ic)$/i.test(w)) ? one(w) : w)).join(' ') + '"');
  if (isAmmo) text = text.replace(/(\{\s*from\s+"pattern\s+)([^"\s]+)"/gi, (m, h, v) => h + one(v) + '"');
  return text;
}
function mapItemTags(text, log) {
  return text.replace(/(\{\s*(?:enable_items|disable_items)\b)([^{}]*)\}/gi, (m, h, body) => {
    const out = body.replace(/"([^"]*)"/g, (q, t) => {
      const k = t.toLowerCase();
      if (!(k in ITEM_TAGS)) return q;
      if (ITEM_TAGS[k] === null) { log.push({ code: 'WARN_SP_TAG_DROPPED', msg: `item tag "${t}" has no AS2 counterpart; dropped from ${h.replace(/[{\s]/g, '')}` }); return ''; }
      log.push({ code: 'SP_TAG', msg: `"${t}" -> "${ITEM_TAGS[k]}"` }); return `"${ITEM_TAGS[k]}"`;
    });
    return h + out.replace(/[ \t]{2,}/g, ' ').replace(/\s+$/, '') + '}';
  });
}
function applyMap(text, mapText, log) {
  for (const raw of mapText.split(/\r?\n/)) {
    const l = raw.replace(/#.*/, '').trim(); if (!l) continue;
    if (l.startsWith('-')) {
      const nm = l.slice(1).trim(); let n = 0;
      for (;;) {
        const re = new RegExp('\\{\\s*' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), m = re.exec(text); if (!m) break;
        let d = 0, j = m.index; for (; j < text.length; j++) { if (text[j] === '"') { j = skipStr(text, j) - 1; continue; } if (text[j] === '{') d++; else if (text[j] === '}') { d--; if (!d) break; } }
        text = text.slice(0, m.index) + text.slice(j + 1); n++;
      }
      log.push({ code: 'SP_MAP', msg: `drop {${nm}}: ${n} block(s)` }); continue;
    }
    const m = /^(.*?)\s*=>\s*(.*)$/.exec(l); if (!m) continue;
    const n = text.split(m[1]).length - 1; text = text.split(m[1]).join(m[2]);
    log.push({ code: 'SP_MAP', msg: `${m[1]} => ${m[2]}: ${n} place(s)` });
  }
  return text;
}

// whole pipeline on text. gohDefs/as2Defs: Map name -> body. returns { text, log }
function port(src, gohDefs, as2Defs, opts = {}) {
  const log = [];
  let t = expand(src, gohDefs, as2Defs, log);
  t = foldArith(t);
  if (opts.typeMap !== false) t = mapTypes(t, log, opts.isAmmo);
  t = mapItemTags(t, log);
  if (opts.map) t = applyMap(t, opts.map, log);
  return { text: t, log };
}
// after the PORT pass: drop {parameters "x"} blocks left empty, and later byte-same (whitespace aside) parameters blocks (same-tag blocks merge, later keys win: DMG-01, so a same-text repeat is a no-op)
function tidy(text, log) {
  let n = 0, d = 0;
  const seen = new Set(), re = /\{\s*parameters\s+"[^"]*"/g;
  for (let m; (m = re.exec(text));) {
    let dep = 0, j = m.index;
    for (; j < text.length; j++) { const c = text[j]; if (c === '"') { j = skipStr(text, j) - 1; continue; } if (c === ';') { while (j < text.length && text[j] !== '\n') j++; continue; } if (c === '{') dep++; else if (c === '}') { dep--; if (!dep) break; } }
    const blk = text.slice(m.index, j + 1), inner = stripComments(blk.slice(m[0].length, -1)).trim(), k = stripComments(blk).replace(/\s+/g, ' ').trim();
    if (inner && !seen.has(k)) { seen.add(k); continue; }
    if (inner) d++; else n++;
    let a = m.index, b = j + 1;   // take the line with it when the block is alone on it
    while (a > 0 && /[ \t]/.test(text[a - 1])) a--;
    let b2 = b; while (b2 < text.length && /[ \t]/.test(text[b2])) b2++;
    if ((a === 0 || text[a - 1] === '\n') && (b2 >= text.length || text[b2] === '\r' || text[b2] === '\n')) { b = b2; if (text[b] === '\r') b++; if (text[b] === '\n') b++; } else a = m.index;
    text = text.slice(0, a) + text.slice(b); re.lastIndex = a;
  }
  if (n || d) log.push({ code: 'SP_TIDY', msg: `${n} empty parameters block(s), ${d} same-text repeat(s) removed` });
  return text;
}
// COV-L8M: a GoH {states} block naming an animation state AS2 humans lack (GoH mosin can_aim "can-aim-bolt") loads silently but the
// soldier never fires: twin 0/21 kills vs 21/21 vanilla, 5/7 with the block dropped [V edrun cov-l8m]. Names below are every state
// used by AS2 (as64+) set/stuff {states} blocks [V vfs scan]; a block with any other name is dropped so the AS2 pattern's states apply.
const AS2_STATES = new Set(['reload', 'unload', 'fire', 'aim', 'can-aim', 'reload-bazooka', 'unload-bazooka', 'fire-bazooka', 'aim-bazooka', 'can-aim-bazooka', 'aim-thrower', 'can-aim-thrower']);
function dropStates(text, log) {
  const re = /\{\s*states\b/g;
  for (let m; (m = re.exec(text));) {
    let dep = 0, j = m.index;
    for (; j < text.length; j++) { const c = text[j]; if (c === '"') { j = skipStr(text, j) - 1; continue; } if (c === ';') { while (j < text.length && text[j] !== '\n') j++; continue; } if (c === '{') dep++; else if (c === '}') { dep--; if (!dep) break; } }
    const blk = stripComments(text.slice(m.index, j + 1));
    const bad = [...blk.matchAll(/"([^"]*)"/g)].map(x => x[1]).filter(s => !AS2_STATES.has(s));
    if (!bad.length) continue;
    let a = m.index, b = j + 1;
    while (a > 0 && /[ \t]/.test(text[a - 1])) a--;
    if (text[b] === '\r') b++; if (text[b] === '\n') b++;
    text = text.slice(0, a) + text.slice(b); re.lastIndex = a;
    log.push({ code: 'SP_STATES_DROP', msg: `{states} dropped: GoH-only state(s) ${[...new Set(bad)].join(', ')} (unit would never fire)` });
  }
  return text;
}
// ---- COV-L8L breed kit: --kit takes the GoH breed's {inventory} onto the AS2 breed at --as (AS2 look, perks and veterancy stay: GoH skin/portrait/
// armor names and perk macros (ability.inc) are not in AS2, and a missing breed include crashed at load, cov-mut2 r1/r2).
// An item is a stuff tag set (order free, modweb humans/breeds), so a GoH item is kept when some AS2 stuff carries every word (has(tags)).
// Else, in order: ITEM_NAMES (exact GoH tag string), the same words with a GoH nation suffix cut (bandage_rus -> bandage), then dropped (WARN).
// ITEM_NAMES rows are [I] nearest AS2 kit by role, checked only against stuff existence, not stats.
const ITEM_NAMES = {
  'nagant_revolver': 'nagan', 'revolver_clip ammo': 'ammo pistol', 'atrifle_rus ammo': 'ammo ptr', 'atrifle_ger ammo': 'ammo ptr',
  'rdg1_smoke grenade': 'smoke grenade', 'nb39_smoke grenade': 'smoke grenade', 'molotov_cocktail grenade': 'grenade molotov_coctail',
  'rgd33 grenade': 'grenade f1', 'ppd40': 'ppsh', 'ppd_drum ammo': 'ammo pistol', 'ppsh_drum ammo': 'ammo pistol', 'mosin_clip ammo': 'ammo rifle',
};
const NATION_SUFFIX = /_(rus|ger|us|usa|eng|uk|jap|fin|ita|pol|fr|hun|rom)$/;
const CONTAINER_WORDS = new Set(['clip', 'drum', 'mag', 'magazine', 'belt', 'box', 'stripper', 'pan']);
// COV-L8M: a ported gun's {filling "tags" N} is an ammo item; checked and mapped like a kit item. A filling no AS2 stuff carries is kept
// (dropping it leaves the gun empty) but warned: the gun will not load ammo in game [I].
function mapFilling(text, has, log) {
  return text.replace(/\{\s*filling\s+"([^"]*)"/g, (m, tags) => {
    const l2 = []; const to = mapItem(tags, has, l2);
    for (const l of l2) log.push({ code: l.code === 'WARN_SP_ITEM_DROPPED' ? 'WARN_SP_FILL_UNKNOWN' : l.code.replace('SP_ITEM', 'SP_FILL'), msg: l.msg.replace('; item dropped', '; kept, the gun will find no ammo') });
    return to === null || to === tags ? m : m.replace(`"${tags}"`, `"${to}"`);
  });
}

// ---- COV-L8M weapon skill: GoH set/ability/skill_<x>.set -> the AS2 set/ability file that defines the same ability name.
// AS2 reads every /set/ability/*.set and a name it already has is cloned again as a second kind (:134-139), so a GoH
// skill_rifle.set dropped beside AS2 rifle.set would not replace "rifle" [I]: the port writes onto the AS2 file of that name instead.
// GoH posture keys recoil/zoom_recoil/sway are dropped (DDA would skip them silently); a base kind AS2 lacks is HUM-14 (load error):
// that block is not written. A level an AS2 breed asks for that the GoH file lacks is a silent top-level buff (humans/abilities:15): warned.
// PORTREV (rev-port #5): the REGISTER_ABILITY kinds, lowercased (names are case-insensitive) [V];
// ids with no prototype (Medic Fortification Personage Mechanic) are refused (HUM-14 risk). AS2 block names are added at run time.
const SKILL_KINDS = ['avoidance', 'melee', 'health', 'speed', 'stealth', 'vision', 'specialvision', 'specialattack', 'weapon', 'veterancy', 'health_regeneration', 'stamina', 'stamina_regeneration', 'tank', 'vehicle', 'cannon', 'weapon_reload'];
const SKILL_NO_PROTO = ['medic', 'fortification', 'personage', 'mechanic'];
function topBlocks(s) {   // raw text (comments kept): top-level {name ...} spans [{a, b, name}]
  const out = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '"') { i = skipStr(s, i); continue; }
    if (c === ';') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c !== '{') { i++; continue; }
    const e = blockAt(s, i); if (e < 0) break;
    const m = /^\{\s*(?:"([^"]+)"|([\w.]+))/.exec(s.slice(i, e));
    out.push({ a: i, b: e, name: m ? (m[1] || m[2]).toLowerCase() : '' });
    i = e;
  }
  return out;
}
const SKILL_DROP = /^[ \t]*\{\s*(recoil|zoom_recoil|sway)\s+[-+.\d]+\s*\}[^\n]*\n?/gm;
function skillBlocks(text) {   // top-level {name [from base] ...} blocks
  const s = stripComments(text), out = [];
  for (let i = 0; i < s.length;) {
    if (s[i] !== '{') { i++; continue; }
    const e = blockAt(s, i); if (e < 0) break;
    const m = /^\{\s*("([^"]+)"|([\w.]+))(?:\s+from\s+("([^"]+)"|([\w.]+)))?/.exec(s.slice(i, e));
    if (m) { const name = m[2] || m[3]; out.push({ name, base: m[5] || m[6] || name, text: s.slice(i, e) }); }
    i = e;
  }
  return out;
}
// gohText: GoH skill file; as2Files: Map(AS2 key -> text) of set/ability/*.set; breeds: [text] AS2 breeds. returns { outs: [{key, text}], log }
function portSkill(gohText, as2Files, breeds, asKey) {
  const log = [], names = new Map();
  for (const [k, t] of as2Files) for (const b of skillBlocks(t)) if (!names.has(b.name)) names.set(b.name, k);
  const outs = [];
  for (const b of skillBlocks(gohText)) {
    const lb = b.base.toLowerCase();
    if (SKILL_NO_PROTO.includes(lb)) { log.push({ code: 'WARN_SP_SKILL_KIND', msg: `"${b.name}": base kind "${b.base}" has an id but no prototype in AS2 (HUM-14 Unknown ability, load error); block not written` }); continue; }
    if (!SKILL_KINDS.includes(lb) && ![...names.keys()].some(n => n.toLowerCase() === lb)) { log.push({ code: 'WARN_SP_SKILL_KIND', msg: `"${b.name}": base kind "${b.base}" unknown to AS2 (HUM-14 Unknown ability, load error); block not written` }); continue; }
    if (/\(\s*include\b|\(\s*"/.test(b.text)) log.push({ code: 'WARN_SP_SKILL_MACRO', msg: `"${b.name}": includes/macros left as is (GoH files, AS2 has none of them)` });
    const nDrop = (b.text.match(SKILL_DROP) || []).length;
    let t = b.text.replace(SKILL_DROP, '');
    if (nDrop) log.push({ code: 'SP_SKILL_KEY_DROP', msg: `"${b.name}": ${nDrop} recoil/zoom_recoil/sway key(s) dropped (AS2 posture reads accuracy, aim_range)` });
    const levels = new Set([...t.matchAll(/\{\s*level\s+"([^"]+)"/g)].map(m => m[1]));
    const want = new Set(); const re = new RegExp('\\{\\s*"' + b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s+"?([\\w%.]+)"?', 'g');
    for (const br of breeds) for (const m of br.matchAll(re)) want.add(m[1]);
    const miss = [...want].filter(l => !levels.has(l)).sort();
    if (miss.length) log.push({ code: 'WARN_SP_SKILL_LEVEL', msg: `"${b.name}": AS2 breeds ask for level(s) ${miss.join(' ')} the GoH file lacks (silent top-level buff, humans/abilities:15)` });
    const key = asKey || names.get(b.name) || `set/ability/${b.name}.set`;
    log.push({ code: 'SP_SKILL', msg: `"${b.name}" from ${b.base}: ${levels.size} level(s) -> ${key}${names.has(b.name) ? ' (replaces the AS2 block)' : ' (new AS2 ability)'}` });
    const prev = outs.find(o => o.key === key); if (prev) prev.blocks.push({ name: b.name.toLowerCase(), text: t }); else outs.push({ key, blocks: [{ name: b.name.toLowerCase(), text: t }] });
  }
  // PORTREV (rev-port #5 part 2): an existing AS2 file keeps the blocks the GoH file lacks (veterancy.set lvl_1..lvl_5); same-named blocks are replaced in place
  for (const o of outs) {
    const old = as2Files.get(o.key);
    if (old == null) { o.text = o.blocks.map(x => x.text).join('\n\n'); continue; }
    const spans = topBlocks(old), used = new Set(); let txt = old;
    for (const sp of spans.slice().reverse()) { const nb = o.blocks.find(x => x.name === sp.name); if (nb) { txt = txt.slice(0, sp.a) + nb.text + txt.slice(sp.b); used.add(nb); } }
    const add = o.blocks.filter(x => !used.has(x));
    if (add.length) txt = txt.replace(/\s*$/, '') + '\n\n' + add.map(x => x.text).join('\n\n') + '\n';
    const kept = spans.filter(sp => sp.name && !o.blocks.some(x => x.name === sp.name)).length;
    if (kept) log.push({ code: 'SP_SKILL_KEEP', msg: `${o.key}: ${kept} AS2 block(s) the GoH file lacks kept` });
    o.text = txt;
  }
  for (const o of outs) delete o.blocks;
  if (!outs.length && !log.length) log.push({ code: 'WARN_SP_SKILL_NONE', msg: 'no ability blocks in the GoH file' });
  return { outs, log };
}
function blockAt(s, i) {   // s[i] === '{' -> index after its matching '}'
  let d = 0;
  for (let j = i; j < s.length; j++) { const c = s[j]; if (c === '"') { j = skipStr(s, j) - 1; continue; } if (c === ';') { while (j < s.length && s[j] !== '\n') j++; continue; } if (c === '{') d++; else if (c === '}') { d--; if (!d) return j + 1; } }
  return -1;
}
function findBlock(s, name) { const m = new RegExp('\\{\\s*' + name + '\\b').exec(s); if (!m) return null; const e = blockAt(s, m.index); return e < 0 ? null : { a: m.index, b: e, text: s.slice(m.index, e) }; }
function mapItem(tags, has, log) {
  const k = tags.toLowerCase().replace(/\s+/g, ' ').trim();
  if (has(k)) { log.push({ code: 'SP_ITEM_KEEP', msg: `"${tags}"` }); return k; }
  const tries = [];
  if (ITEM_NAMES[k]) tries.push(ITEM_NAMES[k]);
  const cut = k.split(' ').map(w => w.replace(NATION_SUFFIX, '')).join(' ');
  if (cut !== k) tries.push(cut);
  // COV-L8M: GoH ammo carries a container word (mosin "ammo rifle_rus clip"); AS2 ammo tags have none ("ammo rifle") [I by name]
  const bare = cut.split(' ').filter(w => !CONTAINER_WORDS.has(w)).join(' ');
  if (bare && bare !== cut) tries.push(bare);
  for (const t of tries) if (has(t)) { log.push({ code: 'SP_ITEM_MAP', msg: `"${tags}" -> "${t}"` }); return t; }
  log.push({ code: 'WARN_SP_ITEM_DROPPED', msg: `"${tags}": no AS2 stuff carries these tags${tries.length ? ' (tried ' + tries.map(t => '"' + t + '"').join(', ') + ')' : ''}; item dropped` });
  return null;
}
// gohText: GoH breed; as2Text: AS2 breed at the target key; has(tagString) -> bool. returns { text, log }
function portKit(gohText, as2Text, has) {
  const log = [], g = findBlock(gohText, 'inventory'), t = findBlock(as2Text, 'inventory');
  if (!g) { log.push({ code: 'WARN_SP_KIT_NONE', msg: 'GoH breed has no {inventory}; AS2 breed left as is' }); return { text: as2Text, log }; }
  const inner = g.text.replace(/^\{\s*inventory\b/, '').replace(/\}$/, '');
  const items = [], other = []; let inHands = null;
  for (let i = 0; i < inner.length;) {
    if (inner[i] === ';') { while (i < inner.length && inner[i] !== '\n') i++; continue; }
    if (inner[i] !== '{') { i++; continue; }
    const e = blockAt(inner, i), blk = inner.slice(i, e); i = e;
    let m;
    if ((m = /^\{\s*item\s+"([^"]*)"\s*([^{}]*?)\s*\}$/.exec(blk))) items.push({ tags: m[1], rest: m[2] });
    else if ((m = /^\{\s*in_hands\s+(\d+)\s*\}$/.exec(blk))) inHands = +m[1];
    else other.push(blk.trim());
  }
  const out = []; let newHands = null;
  items.forEach((it, n) => {
    const to = mapItem(it.tags, has, log); if (to === null) { if (n === inHands) log.push({ code: 'WARN_SP_KIT_HANDS', msg: `in_hands item "${it.tags}" dropped; in_hands set to 0` }); return; }
    if (n === inHands) newHands = out.length;
    out.push(`\t\t{item "${to}"${it.rest ? ' ' + it.rest : ''}}`);
  });
  for (const o of other) { out.push('\t\t' + o); log.push({ code: 'SP_KIT_OTHER', msg: `kept as is: ${o.slice(0, 60)}` }); }
  if (inHands !== null) out.push(`\t\t{in_hands ${newHands === null ? 0 : newHands}}`);
  const blk = '{inventory\n' + out.join('\n') + '\n\t}';
  log.push({ code: 'SP_KIT', msg: `${items.length} GoH item(s) -> ${out.filter(l => /\{item /.test(l)).length} AS2 item(s)` });
  if (!t) { log.push({ code: 'WARN_SP_KIT_NO_INV', msg: 'AS2 breed has no {inventory}; added before the last }' }); const z = as2Text.lastIndexOf('}'); return { text: as2Text.slice(0, z) + '\t' + blk + '\n' + as2Text.slice(z), log }; }
  return { text: as2Text.slice(0, t.a) + blk + as2Text.slice(t.b), log };
}
// ---- DMGSCALE: --scale-damage auto|none|<file.json>. GoH and AS2 express gun numbers on other scales (GoH 0.75 x m/s vs AS2 0.5 x m/s for
// gun speed, GoH range 220 vs AS2 140, GoH rifle healthDamage 70 vs AS2 200 ...). dmgscale.json holds per-class per-key multipliers (median
// of AS2/GoH over same-named vanilla guns, [I] until the in-game twin). Only leaf keys at the top of the stuff block or in a top {parameters}
// block are touched, so {speed} inside recoil/sway blocks is left. codes SP_SCALE WARN_SP_SCALE_SKIP SP_SCALE_OFF
const SCALE_KEYS = { rechargetime: 'rechargeTime', speed: 'speed', range: 'range', healthdamage: 'healthDamage', projectiledamage: 'penetration', projectiledamagetable: 'penetration' };
function scaleClass(asKey, text) {
  const m = /^set\/stuff\/(gun|rifle|mgun|smg|pistol)\//.exec(asKey); if (!m) return null;
  if (m[1] !== 'gun') return m[1];
  const r = /\{\s*recoveryTime\s+([-+.\d]+)/i.exec(stripComments(text));
  return r && +r[1] < 1 ? 'autocannon' : 'gun';
}
function loadScale(spec) {
  if (!spec || spec === 'none') return null;
  const f = spec === 'auto' ? path.join(__dirname, 'dmgscale.json') : spec;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!j || typeof j.classes !== 'object') throw new Error(`${f}: no "classes" object`);
  return j;
}
// PORTREV2 (rev-port #6 macro part): a ("name" ...) call port() kept (AS2 define, same body) sits at a scaled position (top of the stuff block or a
// top {parameters}) and its body yields a scaled key ({speed (* 0.5 %s)} ...) at its own top: expanded with the AS2 define and folded, so
// scaleDamage sees a literal. Calls with no define known (MISSING) or no scaled key are left as they are. codes SP_SCALE_EXPAND, WARN_SP_SCALE_MACRO (in scaleDamage)
function topKeys(t) {   // names of {blocks} at depth 0 of t (comments, strings skipped)
  const out = []; let d = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') { i = skipStr(t, i) - 1; continue; }
    if (c === ';') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '{') { if (d === 0) { const m = /^\{\s*([A-Za-z_]\w*)/.exec(t.slice(i, i + 64)); if (m) out.push(m[1].toLowerCase()); } d++; }
    else if (c === '}') d--;
  }
  return out;
}
function expandScaled(text, defs, log) {
  if (!defs || !defs.size) return text;
  let o = '', i = 0; const stack = [];
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') { const j = skipStr(text, i); o += text.slice(i, j); i = j; continue; }
    if (ch === ';') { let j = text.indexOf('\n', i); if (j < 0) j = text.length; o += text.slice(i, j); i = j; continue; }
    if (ch === '{') { const m = /^\{\s*([A-Za-z_]\w*)/.exec(text.slice(i, i + 64)); stack.push(m ? m[1].toLowerCase() : ''); o += ch; i++; continue; }
    if (ch === '}') { stack.pop(); o += ch; i++; continue; }
    if (ch === '(') {
      const m = /^\(\s*"([^"]*)"/.exec(text.slice(i, i + 300)), e = closeParen(text, i);
      const okDepth = stack.length === 1 || (stack.length === 2 && stack[1] === 'parameters');
      if (m && e > 0 && okDepth && defs.has(m[1])) {
        const sub = [], body = subst(stripComments(defs.get(m[1])), parseArgs(text.slice(i + m[0].length, e - 1)), m[1], sub);
        const x = foldArith(expand(body, defs, new Map(), [], 1)).trim();
        if (!sub.length && topKeys(x).some(k => SCALE_KEYS[k])) { log.push({ code: 'SP_SCALE_EXPAND', msg: `("${m[1]}") expanded with the AS2 define so its ${topKeys(x).filter(k => SCALE_KEYS[k]).join(' ')} can be scaled` }); o += x; i = e; continue; }
      }
      if (e > 0) { o += text.slice(i, e); i = e; continue; }
    }
    o += ch; i++;
  }
  return o;
}
// table: loadScale() result; cls: class name. returns text with numbers multiplied. defs (optional): AS2 define map, kept calls carrying a scaled key are expanded first
function scaleDamage(text, table, cls, log, over, defs) {   // over: {key: ratio} from the vanilla twin (dmgtwin.js), wins over the class
  over = over || {};
  if (defs && cls && table.classes[cls]) text = expandScaled(text, defs, log);
  const c = cls && table.classes[cls];
  if (!c) { log.push({ code: 'WARN_SP_SCALE_SKIP', msg: `no scale class for this file${cls ? ' (' + cls + ' not in the table)' : ''}; values left as GoH` }); return text; }
  const k = c.keys || {}, on = n => typeof over[n] === 'number' ? over[n] : k[n] && k[n].apply !== false && typeof k[n].scale === 'number' ? k[n].scale : null;
  for (const n of [...new Set(Object.values(SCALE_KEYS))]) if (k[n] && on(n) === null) log.push({ code: 'SP_SCALE_OFF', msg: `${cls} ${n}: apply false in the table (spread ${k[n].spread}); left as GoH` });
  const cnt = {}, mul = (v, s) => String(Math.round(parseFloat(v) * s * 100) / 100);
  let o = '', i = 0; const stack = [], unknown = new Set();
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') { const j = skipStr(text, i); o += text.slice(i, j); i = j; continue; }
    if (ch === ';') { let j = text.indexOf('\n', i); if (j < 0) j = text.length; o += text.slice(i, j); i = j; continue; }
    if (ch === '}') { stack.pop(); o += ch; i++; continue; }
    if (ch === '(' && defs && (stack.length === 1 || (stack.length === 2 && stack[1] === 'parameters'))) { const cm = /^\(\s*"([^"]*)"/.exec(text.slice(i, i + 300)); if (cm && !defs.has(cm[1])) unknown.add(cm[1]); }
    if (ch !== '{') { o += ch; i++; continue; }
    const m = /^\{\s*([A-Za-z_]\w*)/.exec(text.slice(i, i + 64)), name = m ? m[1].toLowerCase() : '';
    const okDepth = stack.length === 1 || (stack.length === 2 && stack[1] === 'parameters');
    const key = SCALE_KEYS[name];
    if (key && okDepth) {
      const e = blockAt(text, i); let blk = text.slice(i, e);
      if (name === 'projectiledamagetable') {
        const sy = on('penetration'), sx = on('range');
        if (sy !== null || sx !== null) {
          blk = blk.replace(/^(\{\s*\w+)([\s\S]*)$/, (z, h, body) => h + body.replace(/\{\s*([-+.\d]+)\s+([-+.\d]+)\s*\}/g, (q, x, y) => `{${sx === null ? x : mul(x, sx)} ${sy === null ? y : mul(y, sy)}}`));
          cnt['penetration table'] = (cnt['penetration table'] || 0) + 1;
        }
      } else if (on(key) !== null) {
        const s = on(key);
        blk = blk.replace(/^(\{\s*\w+)((?:\s+[-+]?(?:\d+\.?\d*|\.\d+))+)(\s*\})$/, (z, h, nums, t) => { cnt[key] = (cnt[key] || 0) + 1; return h + nums.replace(/[-+]?(\d+\.?\d*|\.\d+)/g, v => mul(v, s)) + t; });
      }
      o += blk; i = e; continue;
    }
    stack.push(name); o += ch; i++;
  }
  if (unknown.size) log.push({ code: 'WARN_SP_SCALE_MACRO', msg: `class ${cls}: call(s) with no known define at a scaled position, any speed/range/damage inside stays on GoH scale: ${[...unknown].map(n => '("' + n + '")').join(' ')}` });
  const done = Object.entries(cnt).map(([n, v]) => `${n} x${v}`).join(', ');
  log.push({ code: done ? 'SP_SCALE' : 'WARN_SP_SCALE_NOKEY', msg: `class ${cls}: ${done || 'no scaled key in the file (values inside kept macro calls are not scaled; expand them or scale by hand)'} (${[...new Set([...Object.keys(k), ...Object.keys(over)])].filter(n => on(n) !== null).map(n => n + ' *' + on(n) + (typeof over[n] === 'number' ? ' twin' : '')).join(' ')})` });
  return o;
}
const dirOf = k => k.slice(0, k.lastIndexOf('/'));
const presetsKey = k => dirOf(k) + '/.presets';

function stuffport(a) {
  const ex = require('./extras');
  const o = ex.parse(a, { goh: 1, game: 1, file: 1, as: 1, mods: 1, exe: 1, map: 1, 'no-type-map': 0, 'dry-run': 0, kit: 0, skill: 0, 'scale-damage': 1 });
  let scaleTab = null;
  // PORTREV (rev-port #6): auto is the default (DMGFIX twin + class table [V]); `--scale-damage none` keeps GoH numbers and says so
  const scaleSpec = o['scale-damage'] || 'auto';
  try { scaleTab = loadScale(scaleSpec); } catch (e) { ex.die('X_BAD_ARG', '--scale-damage: ' + e.message); }
  if (!scaleTab && /^set\/stuff\/(gun|rifle|mgun|smg|pistol)\//.test((o.as || o.file || '').toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?/, ''))) console.log('WARN_SP_SCALE_NONE --scale-damage none: speed, range, penetration and healthDamage stay on GoH scales (GoH speed 0.75 x m/s vs AS2 0.5 x m/s)');
  if (!o.goh || !o.game || !o.file) ex.die('X_BAD_ARG', 'usage: as2 goh2as2 stuffport --goh G --game A --file <GoH key> [--as <AS2 key>] <mod> [--map f]');
  // game parity: --exe as64|mowas_2 names the AS2 build; mowas_2 (or no as64.exe in --game) has no as64+, so the default stuff view is the base data alone.
  // checked before the mod folder, so --exe goh gets the plain refusal line first (wave 2 rule)
  const TG = require('./target'), spExe = o.exe ? TG.exeArg('goh2as2 stuffport', o.exe) : undefined;
  ex.modCheck(o);
  const spMods = o.mods ? o.mods.split(',') : TG.stuffMods(TG.targetOf(spExe, o.game));
  const g = require('./goh2as2'), vfsLib = require('../lib/vfs');
  const bytes = t => Buffer.from(t.replace(/\r?\n/g, '\r\n'), 'latin1');   // ENCFIX: text was read latin1, write the same bytes (UTF-8 strings stay UTF-8)
  const key = o.file.toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?/, ''), as = (o.as || key).toLowerCase().replace(/\\/g, '/').replace(/^\/?(resource\/)?/, '');
  if (!ex.keyOk(as)) ex.die('X_BAD_KEY', as);
  const idx = g.buildIndex(o.goh), gread = k => { const e = idx.map.get(k); return e ? g.readEnt(e).toString('latin1') : null; };
  const src = gread(key); if (src == null) { idx.ps.close(); ex.die('X_NOT_FOUND', `${key}: not in GoH data`); }
  const gohDefs = parseDefines(gread(presetsKey(key)) || '', gread);
  const vf = vfsLib.build({ gameDir: o.game, mods: spMods, exe: spExe });
  const aread = k => { const r = vf.files.get('resource/' + k); return r ? vfsLib.readRec(r).toString('latin1') : null; };
  if (o.skill) {   // COV-L8M: GoH weapon skill file onto the AS2 ability file of the same name
    const as2Files = new Map(), breeds = [];
    for (const [k, r] of vf.files) {
      if (/^resource\/set\/ability\/[^/]+\.set$/.test(k)) as2Files.set(k.slice(9), vfsLib.readRec(r).toString('latin1'));
      else if (/^resource\/set\/breed\/.+\.set$/.test(k)) breeds.push(vfsLib.readRec(r).toString('latin1'));
    }
    const r = portSkill(src, as2Files, breeds, o.as ? as : null);
    idx.ps.close();
    for (const l of r.log) console.log(l.code + ' ' + l.msg);
    for (const w of r.outs) ex.put(o, w.key, bytes(w.text + '\n'));
    return;
  }
  if (o.kit) {   // COV-L8L: GoH breed inventory onto the AS2 breed at --as
    const tgt = aread(as); if (tgt == null) { idx.ps.close(); ex.die('X_NOT_FOUND', `${as}: no AS2 breed to take the kit (--kit needs an existing --as key)`); }
    const ix = require('../entityindex/index.js');
    const eidx = ix.build({ gameDir: o.game, mods: spMods, exe: spExe, cache: path.join(require('os').tmpdir(), 'goh2as2-stuffport-eidx.json') }).idx;
    const r = portKit(src, tgt, t => eidx.stuffHas(t));
    let out = r.text; if (o.map) out = applyMap(out, fs.readFileSync(o.map, 'latin1'), r.log);
    idx.ps.close();
    for (const l of r.log) console.log(l.code + ' ' + l.msg);
    ex.put(o, as, bytes(out));
    return;
  }
  const as2Defs = parseDefines(aread(presetsKey(as)) || '', aread);
  const isAmmo = /\.(ammo|pattern)$/.test(as) || /^set\/stuff\/shell\//.test(as);
  const r = port(src, gohDefs, as2Defs, { isAmmo, typeMap: !o['no-type-map'], map: o.map ? fs.readFileSync(o.map, 'latin1') : null });
  // goh2as2 PORT pass (PORT-26 key drop etc.)
  const findings = [], rep = { add: (f, l, c, m) => findings.push(`${c} line ${l}: ${m}`), info: (f, l, c, m) => findings.push(`${c} line ${l}: ${m}`) };
  const ext = /\.([a-z0-9]+)$/.exec(as); let out = r.text;
  try { out = g.convertText(r.text, as, as, ext ? ext[1] : 'weapon', rep, {}); } catch (e) { findings.push('WARN_SP_PORT_PASS_FAIL ' + e.message); }
  idx.ps.close();
  out = dropStates(tidy(out, r.log), r.log);
  if (/\{\s*filling\s+"/.test(out)) {   // COV-L8M: ammo tags of the filling checked against AS2 stuff
    const ix = require('../entityindex/index.js');
    const eidx = ix.build({ gameDir: o.game, mods: spMods, exe: spExe, cache: path.join(require('os').tmpdir(), 'goh2as2-stuffport-eidx.json') }).idx;
    out = mapFilling(out, t => eidx.stuffHas(t), r.log);
  }
  if (scaleTab && (o['scale-damage'] || scaleClass(as, out))) {   // DMGSCALE: after every map, so --map values are scaled too; DMGFIX: per-gun ratio from the vanilla twin first. default auto: non-gun keys pass quietly
    const cls = scaleClass(as, out), dc = {};
    if (cls && scaleTab.classes[cls]) out = expandScaled(out, as2Defs, r.log);   // PORTREV2 #6: kept macro calls carrying a scaled key -> literal, before the twin reads the values
    const flat = k => { const t = aread(k); if (t == null) return null; const p = presetsKey(k); if (!dc[p]) dc[p] = parseDefines(aread(p) || '', aread); return port(t, dc[p], new Map(), { typeMap: false }).text; };
    const list = d => { const pre = 'resource/' + d + '/', a = []; for (const k of vf.files.keys()) if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) a.push(k.slice(9)); return a; };
    const tw = cls && scaleTab.classes[cls] ? require('./dmgtwin').twinScale({ table: scaleTab, cls, portedText: out, asKey: as, gohKey: key, readAs: flat, list, log: r.log }) : { over: {} };
    out = scaleDamage(out, scaleTab, cls, r.log, tw.over, as2Defs);
  }
  const counts = {};
  for (const l of r.log) { if (l.how) { const k = 'SP_' + (l.how === 'MISSING' ? 'MISSING' : l.how); if (!counts[k + ' ' + l.name]) console.log(`${l.how === 'MISSING' ? 'WARN_' : ''}${k} ("${l.name}")${l.depth ? ' nested' : ''}`); counts[k + ' ' + l.name] = 1; } else { const k = l.code + ' ' + l.msg; counts[k] = (counts[k] || 0) + 1; } }
  for (const [k, n] of Object.entries(counts)) if (!/^SP_(KEEP|EXPAND|CONFLICT|MISSING) /.test(k)) console.log(k + (n > 1 ? ` (x${n})` : ''));
  for (const f of findings) console.log(f);
  ex.put(o, as, bytes(out));
}

module.exports = { SKILL_KINDS, SKILL_NO_PROTO, scaleDamage, expandScaled, topKeys, scaleClass, loadScale, SCALE_KEYS, SHELL_TYPES, ITEM_TAGS, ITEM_NAMES, mapItem, mapFilling, portSkill, skillBlocks, portKit, tidy, dropStates, parseDefines, parseArgs, expand, foldArith, mapTypes, mapItemTags, applyMap, port, stuffport };
