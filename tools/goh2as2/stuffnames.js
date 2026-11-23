// T-PORTLOAD: names inside a pulled GoH stuff file, and ammo a ported def loads, checked against as64 before anything is written.
//   curves  : {curve "x"} is looked up in /set/ballistics.set at stuff load; a name it lacks is ERROR "Unknown curve" and the game dies at load
//             [V G-PORT4 crash: hmgun.pattern {curve "bullet_hmg"}].
//             as64 name kept; else CURVE_MAP (reason per row); else the line is dropped (the parent pattern's curve applies) + WARN.
//   cursors : {cursor|cursorReloading|crosshair|crosshairReloading "x"} loads /interface/cursor/x at stuff load;
//             a name as64 lacks is dropped (the parent's applies) + WARN [I, dropped to be safe].
//   ammo : the engine finds a gun's rounds by the gun's own {filling} tags ( ammo.Find(filling.tags)), so a def that
//             loads GoH "bulletger_75_l43 apcbche" into a gun whose chain fills "bullet75" (as64 75mm_pak39) can never reload it
//             (edrun preflight AMMO HOLD). The def's ammo strings of that family are mapped onto the gun's family with the shell type
//             mapped (stuffport SHELL_TYPES), if as64 has that ammo; a box item with no as64 counterpart is dropped; a weaponry filling
//             with none is left + WARN (hand).
// codes: PORT_CURVE_MAPPED WARN_PORT_CURVE_DROPPED WARN_PORT_CURSOR_DROPPED PORT_AMMO_FAMILY WARN_PORT_AMMO_ITEM_DROPPED WARN_PORT_AMMO_UNMAPPED WARN_PORT_SOUND_DROPPED WARN_PORT_VIEW_MAPPED WARN_PORT_VIEW_DROPPED WARN_PORT_TAIL_DROPPED (WARN_PORT_MINWORKERS in goh2as2.js)
// Author: Imperator_Aug (ARSENAL, ia-233c555c)
'use strict';
const { SHELL_TYPES } = require('./stuffport');

// GoH set/ballistics.set curve -> as64 curve. as64 has: linear cumulative bullet gun_std gun_light gun_medium gun_heavy [V vfs as64+, T-PORTLOAD].
// GoH has: example bullet bullet_sniper autorifle assaultrifle bullet_mg bullet_hmg bullet_smg bullet_pistol shotgun gun_autocannon gun_std [V GoH set/ballistics.set].
const CURVE_MAP = {
  bullet_sniper: ['bullet', 'small-arms round: as64 has one small-arms falloff curve, "bullet" [I]'],
  autorifle: ['bullet', 'small-arms round: as64 "bullet" [I]'],
  assaultrifle: ['bullet', 'small-arms round: as64 "bullet" [I]'],
  bullet_mg: ['bullet', 'rifle-calibre MG round: as64 MGs use "bullet" through pattern bullet [I]'],
  bullet_hmg: ['bullet', 'heavy MG round (12.7-15 mm): still a bullet, as64 has no HMG curve [I]'],
  bullet_smg: ['bullet', 'pistol-calibre SMG round: as64 "bullet" [I]'],
  bullet_pistol: ['bullet', 'pistol round: as64 "bullet" [I]'],
  shotgun: ['bullet', 'shot: nearest as64 small-arms curve "bullet" [I]'],
  gun_autocannon: ['gun_light', 'small-calibre cannon: as64 "gun_light" falls off soonest of the gun curves [I]'],
};
function curvesOf(text) { return new Set([...String(text || '').matchAll(/\{\s*curve\s+"([^"]+)"/gi)].map(m => m[1].toLowerCase())); }

// drop one {key ...} line-or-block at index i of text (with its line when alone on it)
function cutAt(text, i, e) {
  let a = i, b = e;
  while (a > 0 && /[ \t]/.test(text[a - 1])) a--;
  let b2 = b; while (b2 < text.length && /[ \t]/.test(text[b2])) b2++;
  if ((a === 0 || text[a - 1] === '\n') && (b2 >= text.length || text[b2] === '\r' || text[b2] === '\n')) { b = b2; if (text[b] === '\r') b++; if (text[b] === '\n') b++; } else a = i;
  return text.slice(0, a) + text.slice(b);
}

// text: a stuff file (macro-expanded). curves: Set of as64 curve names. hasCursor(name) -> bool (null = cursors not checked).
// returns { text, log: [{code, msg}] }
function checkStuff(text, curves, hasCursor, hasSound, hasView) {
  const log = [];
  if (curves && curves.size) text = text.replace(/\{\s*curve\s+"([^"]+)"\s*\}[^\S\r\n]*(;[^\r\n]*)?(\r?\n)?/gi, (m, nm) => {
    const k = nm.toLowerCase();
    if (curves.has(k)) return m;
    const mp = CURVE_MAP[k];
    if (mp && curves.has(mp[0])) { log.push({ code: 'PORT_CURVE_MAPPED', msg: `{curve "${nm}"} -> "${mp[0]}": ${mp[1]}` }); return m.replace(/"[^"]+"/, `"${mp[0]}"`); }
    log.push({ code: 'WARN_PORT_CURVE_DROPPED', msg: `{curve "${nm}"} is not in as64 set/ballistics.set and has no map row: line dropped, the parent pattern's curve applies (an unknown curve is fatal at load)` });
    return '';
  });
  if (hasCursor) {
    const re = /\{\s*(cursor|cursorReloading|crosshair|crosshairReloading)\s+"([^"]+)"\s*\}/gi;
    for (let m; (m = re.exec(text));) {
      if (hasCursor(m[2])) continue;
      text = cutAt(text, m.index, m.index + m[0].length); re.lastIndex = m.index;
      log.push({ code: 'WARN_PORT_CURSOR_DROPPED', msg: `{${m[1]} "${m[2]}"}: no /interface/cursor/${m[2]} in as64; dropped, the parent's cursor applies` });
    }
  }
  // T-PORTLOAD round 3: {fireSound|reloadSound "x"} plays /sound/weapon/shot|reload/x; a path as64 lacks is a silent
  // "unknown sound file" every shot (GPL-15) [V t_pl_3 95mm_qf95 "cannon/s4/d1/Shared/Cannon_85to100mm/"]. dropped, the parent's sound applies.
  if (hasSound) {
    const re = /\{\s*(fireSound|reloadSound)\s+"([^"]*)"\s*\}/gi;
    for (let m; (m = re.exec(text));) {
      const k = (/^fire/i.test(m[1]) ? 'sound/weapon/shot/' : 'sound/weapon/reload/') + m[2].toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
      if (hasSound(k)) continue;
      text = cutAt(text, m.index, m.index + m[0].length); re.lastIndex = m.index;
      log.push({ code: 'WARN_PORT_SOUND_DROPPED', msg: `{${m[1]} "${m[2]}"}: no /${k} file or folder in as64; dropped, the parent's sound applies (else "unknown sound file" each shot)` });
    }
  }
  // T-PORTLOAD round 3: ammo {view "x" {tail "y" ..}}: x is an entity (shell model) or a /texture path, y an fx entity. GoH names
  // (howitzer_shell_88-100_lv, shell_tracer_*, /texture/fx/tracer_new/*.mtl) are not in as64: "SetSkeleton() failed: entity '...'" each shot
  // [V t_pl_3 cromwell6 95 mm]. missing tail dropped (the round flies without it); views: see round 4 below.
  // round 4: a top-level {view} is the flying-model ENTITY; the texture form lives in {trace {view "/texture/..."}} (as64 set/stuff/shell/.presets _tr).
  // "/texture/fx/trace" as a top-level view is itself "SetSkeleton() failed" [V t_pl_4]. so: trace view (texture) -> VIEW_DEFAULT; top-level view
  // entity as64 lacks -> whole block dropped (as64 bullet75.fg.ammo has no view at all [V]).
  if (hasView) {
    const re0 = /\{\s*view\s+"([^"]+)"/gi;
    for (let m; (m = re0.exec(text));) {
      if (hasView(m[1])) continue;
      if (parentKey(text, m.index) === 'trace') {
        log.push({ code: 'WARN_PORT_VIEW_MAPPED', msg: `{trace {view "${m[1]}"}}: no such as64 texture; -> "${VIEW_DEFAULT}" (as64 shell trace)` });
        text = text.slice(0, m.index) + m[0].replace(/"[^"]+"/, `"${VIEW_DEFAULT}"`) + text.slice(m.index + m[0].length);
      } else {
        const e = blockEnd(text, m.index); if (e < 0) continue;
        log.push({ code: 'WARN_PORT_VIEW_DROPPED', msg: `{view "${m[1]}" ..}: flying-model entity as64 lacks ("SetSkeleton() failed" each shot); block dropped, the round flies without a model` });
        text = cutAt(text, m.index, e); re0.lastIndex = m.index;
      }
    }
    const re = /\{\s*tail\s+"([^"]+)"[^{}\r\n]*\}/gi;
    for (let m; (m = re.exec(text));) {
      if (hasView(m[1])) continue;
      text = cutAt(text, m.index, m.index + m[0].length); re.lastIndex = m.index;
      log.push({ code: 'WARN_PORT_TAIL_DROPPED', msg: `{tail "${m[1]}"}: no as64 entity; dropped` });
    }
  }
  return { text, log };
}
const VIEW_DEFAULT = '/texture/fx/trace';
// index just past the } closing the block that opens at i (strings and ; comments skipped), -1 if unclosed
function blockEnd(text, i) {
  let d = 0;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (c === '"') { j = text.indexOf('"', j + 1); if (j < 0) return -1; continue; }
    if (c === ';') { while (j < text.length && text[j] !== '\n') j++; continue; }
    if (c === '{') d++; else if (c === '}' && --d === 0) return j + 1;
  }
  return -1;
}
// keyword of the block enclosing index i (lowercase), '' at top. strings/comments are not tracked backwards: stuff text has no braces in them in practice [I]
function parentKey(text, i) {
  let d = 0;
  for (let j = i - 1; j >= 0; j--) {
    const c = text[j];
    if (c === '}') d++; else if (c === '{') { if (d === 0) { const m = /^\{\s*([A-Za-z_]\w*)/.exec(text.slice(j, j + 64)); return m ? m[1].toLowerCase() : ''; } d--; }
  }
  return '';
}

// first non-"ammo" word of a tag string (the ammo family / calibre word, same rule as edrun preflight calOf)
const famOf = s => String(s || '').trim().toLowerCase().split(/\s+/).filter(w => w && w !== 'ammo')[0] || '';
// src: a def/ext/inc text. gunFamily(weaponTag) -> family word of the gun's own {filling} chain, or null (unknown: nothing done).
// hasAmmo(tags) -> bool (as64 has an ammo stuff with these tags). returns { text, log, gaps: [{code, msg}] }
function fixAmmoFamily(src, gunFamily, hasAmmo) {
  const log = [], map = new Map();   // GoH family -> gun family
  for (const m of src.matchAll(/\{\s*weapon\s+"([^"\r\n]+)"\s+filling\s+"([^"\r\n]+)"/gi)) {
    const gf = gunFamily(m[1]), af = famOf(m[2]);
    if (!gf || !af || gf === af || map.has(af)) continue;
    map.set(af, gf);
  }
  if (!map.size) return { text: src, log };
  const mapTags = tags => {   // "bulletger_75_l43 apcbche" -> "bullet75 ap" | null
    const ws = tags.toLowerCase().split(/\s+/).filter(Boolean), af = famOf(tags), gf = map.get(af);
    const rest = ws.filter(w => w !== af && w !== 'ammo').map(w => SHELL_TYPES[w] || w);
    const cand = [gf, ...rest].join(' ');
    if (hasAmmo(cand)) return cand;
    // MG belts and the like: GoH "ammo mgun_rus dt" vs as64 "ammo mgun": no shell type in the tags, the bare family is the round
    if (!rest.some(w => w in SHELL_TYPES || /^(heat|hea|heatb|heatc|ic)$/.test(w)) && hasAmmo('ammo ' + gf)) return (ws.includes('ammo') ? 'ammo ' : '') + gf;
    return null;
  };
  let text = src;
  // box/inventory items of a mapped family
  text = text.replace(/\{\s*item\s+"([^"\r\n]+)"[^{}\r\n]*\}[^\S\r\n]*(;[^\r\n]*)?/gi, (m, tags) => {
    if (!map.has(famOf(tags))) return m;
    const to = mapTags(tags);
    if (to) { log.push({ code: 'PORT_AMMO_FAMILY', msg: `item "${tags}" -> "${to}"` }); return m.replace(`"${tags}"`, `"${to}"`); }
    log.push({ code: 'WARN_PORT_AMMO_ITEM_DROPPED', msg: `item "${tags}": the gun fills "${map.get(famOf(tags))}" and as64 has no "${map.get(famOf(tags))}" round of this type; item dropped` });
    return '; goh2as2 T-PORTLOAD dropped: ' + m.replace(/\s+/g, ' ');
  });
  // weaponry fillings
  text = text.replace(/(\{\s*weapon\s+"[^"\r\n]+"\s+filling\s+)"([^"\r\n]+)"/gi, (m, h, tags) => {
    if (!map.has(famOf(tags))) return m;
    let to = mapTags(tags);
    if (!to) for (const t of ['ap', 'fg', 'apcr']) if (hasAmmo(map.get(famOf(tags)) + ' ' + t)) { to = map.get(famOf(tags)) + ' ' + t; break; }
    if (to) { log.push({ code: 'PORT_AMMO_FAMILY', msg: `weapon filling "${tags}" -> "${to}"` }); return h + `"${to}"`; }
    log.push({ code: 'WARN_PORT_AMMO_UNMAPPED', msg: `weapon filling "${tags}": the gun fills "${map.get(famOf(tags))}", no as64 round found; left, the gun cannot reload it - hand` });
    return m;
  });
  for (const [a, g] of map) log.unshift({ code: 'PORT_AMMO_FAMILY', msg: `GoH ammo family "${a}" -> "${g}": the gun's own {filling} chain fills "${g}" and the engine reloads by the gun's filling tags; the as64 rounds are kept, GoH rounds of that family not pulled` });
  return { text, log };
}

// T-PORTLOAD round 2: GoH writes `minWorkers N` after the seat names of {workers ..} (cannon extender move/attack/trailing) and {gunner ..}/{charger ..}
// (weapon place). as64 reads those lists as strings only (,
// ), so the atom is fatal: "Block terminator expected" [V t_pl_2 75mm_pak40.def crash]. Dropped, the
// minimum crew count is lost. returns { text, n }
function dropMinWorkers(text) {
  let n = 0;
  text = text.replace(/(\{\s*(?:workers|gunner|charger)(?:\s+"[^"\r\n]*")+)\s+minWorkers\s+[-+]?\d+(?:\.\d+)?/gi, (m, h) => { n++; return h; });
  return { text, n };
}

module.exports = { CURVE_MAP, curvesOf, checkStuff, fixAmmoFamily, famOf, dropMinWorkers };
