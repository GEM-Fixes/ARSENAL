#!/usr/bin/env node
// goh2as2: convert GoH entity data into an AS2 override folder (rows PORT-18..33; context PORT-01,02,05,07,10,15). GoH game read-only.
// usage: ARSENAL goh2as2 --goh <GoH dir> (--entity <name|rel/path.def>.. | --keys <file>) (--out <dir> | --mod <dir>) [flags]
//   input   --goh D            GoH install, Workshop mod or resource folder (loose files + resource/**/*.pak)
//           --base D ..        lower-priority GoH tree (the install under a Workshop mod); only files the closure names are pulled
//           --entity N ..      unit def by name or rel/path.def (repeatable)   --keys F  one virtual key per line, no closure unless --deps
//           --entity-list F    one unit name per line, same as repeating --entity
//           --text-only        write every text output, no binary; <out>/text-only.tsv lists one skipped resource key per line, sorted
//           --deps | --no-deps closure on/off (default: on for --entity, off for --keys)   --max-files N  closure cap (default 400)
//   output  --out D            override folder <D>/resource/..   --mod D  same, plus mod.info and unit names (localization/#goh2as2_names.lng)
//           --dry-run          write nothing   --no-names  no names .lng   --nation N  breed nation (default ger)
//   AS2     --game D           AS2 install (default: env AS2_GAME, as2.json, Steam)   --no-game  no AS2 dir (no vanilla checks, no texture rename)
//           --no-keylint       skip the keylint pass on --out
//           --exe as64|mowas_2|mowas2  target build (target.js): vfs view of the stuff pull and the donor, keylint --exe, mod.info range
//                              (mowas_2: no as64+ in the stuff view, MinGameVersion 3.262.0 + MaxGameVersion 3.262.1); default: as64.exe in --game
//                              -> as64 (as before), else mowas_2. --exe goh is refused (exit 2: GoH is the source)
//   report  --format text|json|sarif|csv|html   -o F   -q (findings only)   --rc F | --no-rc   --help | -h   --version
//   donor chain (one --entity = the rep, --game required):
//           --donor STEM       build on the vanilla def STEM, the rep's mdl in its Extension   --exe as64|mowas_2  vfs flavour
//           --rep-key          unit in a rep-named folder (entity/<rep>/), the vanilla key is never written
//           --pull-props       pull the rep mdl's /properties/*.ext   --mtl-fallback  donor (or stub) .mtl for a material GoH lacks
//           --match-weapon     swap the donor weapon for the nearest vanilla one to the rep's (WPN-1 table first; --no-wpn-table: calibre rule only)
//           --wpn-answers F    weapon sheet answers (tools/wpn)   --grenade-stuff  vanilla grenade_at entries for GoH grenades
//           --lightmap-multiply  GoH {lightmap} -> multiply material   --drop-limits  remove gun/turret limits
//           --no-translate     no XLATE-2 values   --table F  xlate table   --xlate-json F  translation record
//           --no-ask | --ask-json | --answers F   how out-of-line values are asked (default: ask on a terminal)
//           --no-fit-pass      no donorfit edit pass   --allow-missing  ERR_DONOR_* become warnings
//   ARSENAL goh2as2 pot2lng|wav2story|anmswap ...   small hand steps (extras.js header). --out/--mod may be <AS2>/mods/<name> (not a link into GoH).
//   gaps:     every run that writes also writes <out>/gaps/<unit>.gaps.json: each GoH key the unit lost (dropped), turned into a value or renamed (baked),
//             or left to the donor def (donor), with code + reason; "unexplained" = keys gone from the output with no rule (T-PORTGAP, should stay empty).
//   output is deterministic: the same input gives byte-equal files (T-PORTGAP GOLD test); mod.info names the --out folder.
//   fx (GOH2-FX): entity/fx defs follow {sprite "$/x"} (= texture/fx/x) and "/texture/.."; .ebm {Frame}/{reference} follow, nested, ';' lines skipped.
//   --entity: resolves entity/**/<name>.def in GoH (loose + resource/**/*.pak, pak entries are rooted at the pak's dir), then pulls
//             same-stem siblings (ext mdl mtl ply vol anm) and every file named by a string/path inside the pulled text (dependency closure).
//   --keys:   file, one virtual key per line (resource/ prefix optional, # comments); no closure unless --deps.
//             /properties/* files named by a pulled file are not copied (PORT-47, WARN_PORT_SHARED_PROPS); --keys can still force one.
//   output: <out>/resource/<key>; text = GoH bytes + CRLF (strings UTF-8 = as64, PORT-15,, .lng untouched; binaries copied as-is (info line).
//   refuses --out inside the GoH or AS2 install. After writing runs keylint on --out with --game and prints its finding count.
// codes (all WARN_: every row is [I]): WARN_PORT_DROP_HEALTH(18) _ARMOR_RESHAPE(19) _VOLUME_KEY(20) _VOLUME_FLAG(21) _ARITH_EVAL/_ARITH_FAIL(22)
//   _DROP_EVENTS(23) _MTL_KEYS(24) _DROP_AMMO_KEY(25) _WEAPON_KEY(26) _MINE_RESHAPE(27) _MI_MANUAL(28) _DROP_SET_CALL(29) _VISION_KEY(30)
//   _SKIP_KIND(31) _SKIP_SET_KIND(33) _NONASCII_IDENT/_STR_NOT_UTF8(15) _SHARED_PROPS(47) _FX_CURVES(58) _LOCO_SPEED(GOHFIX) _ANM_MISSING _MISSING_REF _NOT_FOUND ; PORT_PLY_MAGIC (FMT-13 [V])
//   WARN_PORT_PLAIN_BONE (FMT-05 [V], replaces _EMPTY_LIMITS/_BONE_BASIS): a {limits}/{speed} block under a def {bone "x"} is removed where the mdl's x is a plain bone
//   (any name); kept on revolute/prizmatic/socket/planarsocket bones, and where the mdl lacks the bone or no mdl is found
// --donor <vanilla def stem> (with one --entity = the rep, and --game): builds a donor unit instead of converting the rep's def.
//   writes the vanilla def text (found through lib/vfs, PORT-129) at its own key, the LAST {Extension "...mdl"} replaced with the rep's mdl; every file in the rep's
//   mdl folder except .def/.ext (and what they name: ply->mtl->textures, anm, vol) goes into the folder that Extension names (PORT-131); textures stay at their own
//   keys; mod.info is written. Other def lines stay; the plain-bone rule is applied to the def's bone blocks against the rep's mdl. Unknown stem: exit 1, nothing written.
//   --exe as64|mowas_2 picks the vfs flavour for the lookup (default: as64.exe present in --game, else mowas_2) and the mod.info range.
// Author: Imperator_Aug (ARSENAL, ia-eb9651be)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { checkDef, limitsArityBad } = require('./defcheck');
const pakset = require('../lib/pakset'), sdlw = require('../lib/sdlwrite'), enc = require('../lib/enc'), vfsLib = require('../lib/vfs');
const { createReport } = require('../lib/report'), cli = require('../lib/cli');
const { meshRefs } = require('../binhdr/ply'), names = require('../lib/names'), { stripGohLoco } = require('./loco');

const TEXT = new Set(['def', 'ext', 'inc', 'def1', 'mdl', 'mtl', 'mi', 'set', 'ammo', 'weapon', 'grenade', 'mine', 'hand', 'fx', 'pattern', 'presets', 'fsm', 'dl', 'info', 'mod', 'water', 'template', 'accuracy']);
const BIN = new Set(['ply', 'vol', 'anm', 'dds', 'tga', 'png', 'jpg', 'bmp', 'ebm', 'tex']);
const SKIP_EXT = new Set(['materials', 'omask', 'bzc', 'dso', 'hso', 'cso', 'html', 'js', 'css', 'htm']);   // PORT-31
// PORT-33 GoH-only set kinds -> reason, else null. COV-C40: the top-level GoH sets no AS2 code opens by name (engine grep 2026-11-09,
// test/c40.js re-checks it); market.set has an AS2 reader but it fills the Steam store settings, not mod data.
const SKIP_TOP_SETS = ['benchmark.set', 'component.set', 'damage.set', 'library.set', 'squads.set', 'tp_control.set', 'small_firearms_accuracy.inc', 'level_of_detail_scenario.set', 'market.set'];
function skipSetKind(k) {
  if (/^set\/dynamic_campaign\//.test(k) || /(^|\/)difficulties\/[^/]*\.dl$/.test(k) || /(^|\/)(layout|profiles)\.set$/.test(k) || /(^|\/)scene\.(fx|set)$/.test(k)) return 'PORT-33 [I] GoH-only data kind, no AS2 equivalent; skipped';
  const m = /^set\/([^/]+)$/.exec(k);
  if (m && SKIP_TOP_SETS.includes(m[1])) return `PORT-33 [I] GoH-only top-level set ${m[1]}: no AS2 code reads it${m[1] === 'market.set' ? ' as mod data (Steam store settings only)' : ''}; skipped (COV-C40)`;
  return null;
}
const STUFF_KEYS = new Set(require('./stuffkeys.json'));   // PORT-26 allowlist, genstuffkeys.js: the stuff readers stop on any other key
// PORT-53 census 2026-11-05: in no game/ gem/ string and no vanilla set/entity/properties file. names that may be data (summer, hand1r, face) left out on purpose
const ENTITY_DEAD_KEYS = new Set('perks grm resources desert snow summer stuff_preview ai_in_manual itemtags spinx spiny spinz hp_broken repairorder dyncmppersistent manualaccuracyzoom blastwave_modifier armor_damage_modifier bigkernel novisibilitypatch light_bone break_fx break_bone mechanicresources sealable tpc_zclip damageblast damagetpc removeentities defaultradius viewstoscale ignorepatherboundsai maxairbornealtitude minrecognizetime aimbone tpcinstantaiming uselookataiming caststeel usehq additive'.split(' '));
const DEP_EXT = ['def', 'ext', 'mdl', 'mtl', 'inc', 'ply', 'vol', 'anm', 'dds', 'mine', 'ammo', 'weapon', 'pattern'];
const IMG_EXT = ['ebm', 'tex', 'dds', 'tga', 'bmp', 'jpg', 'png'];   // lookup order
const SIB_EXT = ['ext', 'mdl', 'mtl', 'ply', 'vol', 'anm'];
// ASSET-1: every texture a .mtl names (PORT-152: only diffuse/bump/specular were followed, and a name with a space was dropped as "not file-like")
const MTL_TEX_KEYS = new Set(['diffuse', 'diffuse1', 'diffuse2', 'bump', 'specular', 'mask', 'lightmap', 'height', 'envmap', 'normal']);
const TEX_KEY_RE = /^(diffuse\d*|bump|specular|mask|lightmap|height|envmap|normal|texture)$/;
const texconv = require('./texconv');
const BIN_TEX = new Set(['dds', 'tga', 'png', 'jpg', 'bmp', 'ebm', 'tex']);
// rewrite the texture names of a converted .mtl whose target was renamed (texRename: source key -> output key); dir = the mtl's source dir
// FIX-PORT assets:16: one {specular "name"} entry of an mtl, name matched case-blind and literal
function specLineRe(nm) { return new RegExp('\\{\\s*specular\\s+"' + nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*\\}', 'i'); }
function renameMtlTex(text, dir, map, texRename) {
  if (!texRename.size) return text;
  return text.replace(/(\{\s*(diffuse\d*|bump|specular|mask|lightmap|height|envmap|normal)\s+)"([^"\r\n]*)"/gi, (m, pre, key, nm) => {
    const r = resolveTok({ s: nm, q: true, key: key.toLowerCase() }, dir, map), nk = r && texRename.get(r);
    if (!nk) return m;
    const keep = /\.(dds|tga|png|jpg|bmp|ebm|tex)$/i.test(nm), k2 = keep ? nk : nk.replace(/\.[^./]+$/, '');
    return pre + '"' + (k2.startsWith('texture/common/') ? '$/' + k2.slice('texture/common/'.length) : '/' + k2) + '"';
  });
}
// GOH2-FX: the _goh mark goes before a trailing _N number, so a {button} "<name>_0N" set stays a set (attack_00.tga -> attack_goh_00.tga, not attack_00_goh.tga)
const gohKey = k => k.replace(/(_\d+)?(\.[^./]+)$/, (m, num, ext) => '_goh' + (num || '') + ext);
// GOH2-FX: .ebm text with ';' comments blanked (same length, so offsets hold); a commented {Frame} is not a reference
const ebmLive = b => b.replace(/;[^\r\n]*/g, m => ' '.repeat(m.length));
// GOH2-FX: a pulled .ebm whose frame/reference texture was renamed (TEXKEY_RENAMED) names the new key, else it reads AS2's picture
function renameEbmTex(text, dir, map, texRename) {
  if (!texRename.size) return text;
  return text.replace(/(\{\s*(?:Frame|reference)\s+)"([^"\r\n]+)"/gi, (m, pre, nm) => {
    const r = resolveTok({ s: nm, q: true, key: 'texture' }, dir, map), nk = r && texRename.get(r);
    if (!nk) return m;
    const keep = /\.\w+$/.test(nm), b = nk.slice(nk.lastIndexOf('/') + 1);
    return pre + '"' + nm.replace(/\\/g, '/').replace(/[^/]*$/, keep ? b : b.replace(/\.[^.]+$/, '')) + '"';
  });
}
// the engine lists set/stuff and reads every file there as SDL, whatever its name: GoH keeps thousands with no extension
const isText = k => TEXT.has(extOf(k)) || /^set\/stuff\//.test(k) && !BIN.has(extOf(k));
const extOf = n => { const b = n.slice(n.lastIndexOf('/') + 1), i = b.lastIndexOf('.'); return i < 0 ? '' : b.slice(i + 1).toLowerCase(); };
const norm = p => { const o = []; for (const s of p.split('/')) { if (s === '..') o.pop(); else if (s !== '.' && s !== '') o.push(s); } return o.join('/'); };

// ---- GoH index: virtual key (lowercase, no resource/) -> {name, path|ent}
function buildIndex(goh) {
  const root = fs.existsSync(path.join(goh, 'resource')) ? path.join(goh, 'resource') : goh;
  const ps = pakset.open(root, null), map = new Map();
  for (const e of ps.entries) {
    const name = e.key.toLowerCase();   // PORT-34: pakset key = name rooted at pak dir
    map.set(name, { name, ent: e });
  }
  // T-PORTGAP: readdir order is the file system's (NTFS sorts, others need not); sorted so the map order, and every first-match .find() on it, is the same everywhere
  for (const f of fs.readdirSync(root, { recursive: true }).map(String).sort()) {
    const p = path.join(root, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || /\.pak$/i.test(p)) continue;
    const name = f.replace(/\\/g, '/').toLowerCase();
    map.set(name, { name, path: p });
  }
  return { root, map, ps };
}
const readEnt = e => e.path ? fs.readFileSync(e.path) : pakset.read(e.ent);

// ---- SDL helpers
const lineOf = (src, off) => { let n = 1; for (let i = src.indexOf('\n'); i >= 0 && i < off; i = src.indexOf('\n', i + 1)) n++; return n; };
const isBlk = n => n.type === 'block' || n.type === 'list';
// T-PORTGAP key paths: block names from the root down ('a/b/c', lowercase; a {#tag block is named by its tag, a nameless one '{}'); (lists) are
// transparent, so a block inside a (define ..) body or an (if ..) has the path of its nearest blocks. keyPaths(text) = every block's path, document order.
const blkName = n => n.tag || n.name || '{}';
const nodePath = n => { const o = []; for (let p = n; p && !p.root; p = p.parent) if (p.type === 'block') o.unshift(blkName(p)); return o.join('/'); };
function subtreePaths(n, skip) {   // n's own path + every block below it; skip(node) = true leaves that node (and its subtree) out
  const out = [];
  (function w(x) { if (x.type === 'block') { if (skip && skip(x)) return; out.push(nodePath(x)); } for (const k of x.items || []) if (k.items) w(k); })(n);
  return out;
}
function keyPaths(text) {
  const out = [];
  (function w(n, p) { for (const k of n.items) { if (k.type === 'list') { w(k, p); continue; } if (k.type !== 'block') continue; const q = p ? p + '/' + blkName(k) : blkName(k); out.push(q); w(k, q); } })(sdlw.parse(Buffer.from(text, 'latin1')).root, '');
  return out;
}
const msetOf = arr => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return m; };
const msetMinus = (a, b) => { const m = new Map(a); for (const [k, n] of b) if (m.has(k)) { const r = m.get(k) - n; if (r > 0) m.set(k, r); else m.delete(k); } return m; };
const msetList = m => [...m].flatMap(([k, n]) => Array(n).fill(k));
// a text-level step (regex edit on the converted text): the key paths it removed, as one gap entry, or null
function textStepGap(before, after, file, code, reason) {
  let gone; try { gone = msetList(msetMinus(msetOf(keyPaths(before)), msetOf(keyPaths(after)))); } catch { return null; }
  return gone.length ? { file, line: 0, kind: 'dropped', code, key: gone[0], paths: gone, reason } : null;
}
// NAT-GAP: sub-keys the as64 readers take: {burst} ; {spreading} = modifier keywords [V]
const BURST_SUBKEYS = new Set(['min', 'noaiming', 'short', 'long', 'rangekoef']);
const SPREADING_SUBKEYS = new Set(['spreadradius', 'spreadxyratio', 'spreadyadjust', 'spreadpower', 'burstaccuracy', 'burstrecoverytime', 'burstspreaddelta', 'burstspreadcount', 'burstspreadwidth', 'radiusfunction', 'radiustable']);
// NAT-GAP: stuffnames.checkStuff removals (pulled GoH stuff, before the write loop) as gap entries. as64 reads each key, but the value names an asset
// as64 lacks (sound file, cursor picture, flying-model entity): no as64 asset carries the same thing with proof, so the line goes and the parent
// pattern's value applies. step -> removed key name (lowercase) -> [code, reason]
const STUFF_NAME_DROPS = {
  curve: { curve: ['WARN_PORT_CURVE_DROPPED', 'NAT-GAP [V, T look] {curve} names a curve as64 set/ballistics.set lacks and no map row: unknown curve is fatal; parent pattern curve applies'] },
  cursor: Object.fromEntries(['cursor', 'cursorreloading', 'crosshair', 'crosshairreloading'].map(k => [k, ['WARN_PORT_CURSOR_DROPPED', `NAT-GAP [V, T look] as64 reads {${k}} as /interface/cursor/<name>; the GoH picture is not in as64: dropped, parent pattern cursor applies`]])),
  sound: { firesound: ['WARN_PORT_SOUND_DROPPED', 'NAT-GAP [V, T sound] as64 reads {fireSound} as /sound/weapon/shot/<path>; the GoH sound path is not in as64: dropped, parent pattern sound applies'],
    reloadsound: ['WARN_PORT_SOUND_DROPPED', 'NAT-GAP [V, T sound] as64 reads {reloadSound} as /sound/weapon/reload/<path>; the GoH sound path is not in as64: dropped, parent pattern sound applies'] },
  view: { view: ['WARN_PORT_VIEW_DROPPED', 'NAT-GAP [V, T look] as64 reads ammo {view "<entity>"} as the flying model; the GoH entity is not in as64 ("SetSkeleton() failed" each shot): block with its tail dropped, round flies with no model'],
    tail: ['WARN_PORT_TAIL_DROPPED', 'NAT-GAP [V, T look] as64 reads {tail "<entity>"} in a bullet view; the GoH fx entity is not in as64: dropped, round flies with no tail'] },
};
// before/after: one checkStuff step; names: STUFF_NAME_DROPS[step]. removed paths grouped under their topmost removed block, one entry per code
function stuffNameGaps(before, after, file, log, names) {
  let gone; try { gone = msetList(msetMinus(msetOf(keyPaths(before)), msetOf(keyPaths(after)))); } catch { return []; }
  const tops = gone.filter(p => !gone.some(q => q !== p && p.startsWith(q + '/')));
  const by = new Map();
  for (const p of gone) {
    const top = tops.filter(q => q === p || p.startsWith(q + '/')).sort((a, b) => a.length - b.length)[0] || p;
    const leaf = top.slice(top.lastIndexOf('/') + 1), cr = names[leaf] || ['PORTGAP_STUFF_NAME', `NAT-GAP stuff name check removed {${leaf}} with no rule row: report it`];
    if (!by.has(cr[0])) by.set(cr[0], { cr, paths: [] });
    by.get(cr[0]).paths.push(p);
  }
  const what = log.filter(l => /DROPPED$/.test(l.code)).map(l => l.msg.replace(/:.*$/, '')).join(' ');
  return [...by.values()].map(({ cr, paths }) => ({ file, line: 0, kind: 'dropped', code: cr[0], key: paths[0], paths, reason: `${cr[1]}${what ? ': ' + what : ''}` }));
}
function walk(node, fn, p = []) {
  for (const k of node.items) {
    if (k.type === 'list') { walk(k, fn, p); continue; }   // (define ...) macro bodies and (if ...) hold the same blocks; skipping them left every rule blind there
    if (k.type !== 'block') continue;
    fn(k, p);
    walk(k, fn, p.concat([k.name || '']));
  }
}
const evalArith = nd => {   // nd: list node '(op a b ...)' -> number | null   (sdlx arith: prefix op, left fold)
  const op = nd.items[0];
  if (!op || op.type !== 'atom' || !/^[-+*/]$/.test(op.text)) return null;
  const vals = [];
  for (const k of nd.items.slice(1)) {
    if (k.type === 'atom' && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(k.text)) vals.push(parseFloat(k.text));
    else if (k.type === 'list') { const v = evalArith(k); if (v === null) return null; vals.push(v); }
    else return null;
  }
  if (!vals.length) return null;
  let a = vals[0];
  for (const v of vals.slice(1)) { if (op.text === '/' && v === 0) return null; a = op.text === '+' ? a + v : op.text === '-' ? a - v : op.text === '*' ? a * v : a / v; }
  return Number.isFinite(a) ? a : null;
};
const fmtNum = v => String(Math.round(v * 1e6) / 1e6);
const LOCO = new Set(['turnradius', 'starttime', 'braketime', 'stoptime', 'turntime', 'turnstart', 'turnstop', 'maxspeedatmaxturn']);   // PORT-22
const FLAGS_ABLE = new Set(['blockcamera']);                                                                                              // PORT-21: nolook hole holed nowounddecal are valid AS2 keys
const VOL_KEYS = new Set(['caststeel', 'highhardness', 'quality']);                                                                       // PORT-20: not in the volume reader
// PORT-57 family, closure route: {vision "x"} with no as64 entry is fatal. GoH's vision entries need GoH's terms in settings.set, so the name maps to an as64 one, ranges stay as64's [I]
const AS2_VISIONS = new Set('start_point map_point flag_point human mp_soldier mp_officer mp_sniper soldier_focused rifle_telescope field_glass cannon_main cannon_mgun cannon_crew vehicle_main vehicle_top_mgun vehicle_top_turret moto moto_crew moto_around mg_hull tank_main-l tank_main-m tank_main-h tank_driver tank_back none cover-detector animal searchlight watchtower marine_main'.split(' '));
const VISION_MAP = [[/^tank_range_/, 'tank_main-m'], [/^tank_around/, 'tank_back'], [/^tank_/, 'tank_driver'], [/^noise_detection$/, 'none'], [/^cannon_/, 'cannon_main'], [/^vehicle_|^car_|^truck_/, 'vehicle_main'], [/^moto/, 'moto'], [/^human|^soldier|^inf/, 'human']];
const visionFix = (s, rel, rep) => s.replace(/(\{\s*vision\s+")([^"\r\n]+)"/gi, (m, a, n) => {
  if (AS2_VISIONS.has(n.toLowerCase())) return m;
  const hit = VISION_MAP.find(x => x[0].test(n.toLowerCase())), to = hit ? hit[1] : 'none';
  rep.add(rel, s.slice(0, s.indexOf(m)).split('\n').length, 'WARN_PORT_VISION_NAME', `PORT-57 [I] vision "${n}" not in as64: uses "${to}", as64 range`);
  return a + to + '"';
});
// T-PATHER (KEY-30, MOV-13): {PatherID "x"} must be a {Profile} of the winning set/pather.set or the unit load stops ("Unit: Wrong pather name", ).
// vanilla AS2 profiles [V, 21]; GoH has ~130 per-model ones. A GoH name in AS2's list is kept, else the table picks by class [I].
const AS2_PATHERS = new Set('human human_flying animal tank tank.light amphibia armored vehicle.large vehicle.small moto cannon.large cannon.small cannon.carried cannon.micro airborne railway shallow_water shallow_water_0 water deep_water deep_water_0'.split(' '));
// [regex of GoH names, as64 profile, reason]; first hit wins. Classes follow what vanilla AS2 defs use: tank.ext -> tank (medium/heavy/SPG), tank_light defs -> tank.light, armoredcar.ext halftracks -> armored, wheeled btr/cars -> vehicle.small, trucks -> vehicle.large
const PATHER_TABLE = [
  [/^(universal|t20|t26|t27|t37|t40|t50|t60|t70|ft17|stuart|locust|matilda1|mk6b|panzer1|panzer2l?|panzer38|su76|zis30|bt|goliath)$/, 'tank.light', 'light tank class: AS2 tank_light defs use tank.light'],
  [/^(lvt4|shermandd)$/, 'amphibia', 'swimming tracked class: AS2 lvt4 uses amphibia'],
  [/^(kv1|kv2|churchill|churchillvii|su100y|tiger2?|smk|bis|pershing|panzer[345]|nashorn|t28|t34|sherman|m4a3|hvss|m10_gmc|m18_gmc|roller\.medium|cromwell|comet|valentine|matilda2|crusader|cruiser[23]?|elefant|thor)$/, 'tank', 'medium/heavy tank or SPG class: AS2 tank.ext (tank_heavy, tank_medium, karlthor) uses tank'],
  [/^(m3halftrack|sdkfz251|sdkfz6_cargo|sdkfz7|sdkfz8)$/, 'armored', 'halftrack class: AS2 btr/sdkfz251, m3, sdkfz7/8 include armoredcar.ext (armored)'],
  [/^(sdkfz222|sdkfz232|nkl|m3scout|ba10|ba20|ba64|kubel|wc51|willys|schwimm|kfz15)$/, 'vehicle.small', 'wheeled armoured car / light car class: AS2 ba64, sdkfz222/232, kubel set vehicle.small'],
  [/^(blitz36|maultier|gazaaa|cckw)$/, 'vehicle.large', 'truck class: AS2 vehicle.ext uses vehicle.large'],
  [/^(moto|bicycle|ketten)$/, 'moto', 'two-wheel / small tracked cycle class: AS2 car/moto uses moto'],
  [/^cannon\.(carried|carry\.ski|strecher)$/, 'cannon.carried', 'carried gun class: AS2 mortars use cannon.carried'],
  [/^cannon\.medium$/, 'cannon.small', 'medium towed gun: AS2 has small and large only; the lighter one (47mm-class in AS2) [I]'],
  [/^(bf109|bf110|blenheim|fi156|il2|ju87|po2|yak1|p47)$/, 'airborne', 'aircraft class: AS2 airborne defs use airborne'],
  [/^(nothing|human_tpc|human_prone)$/, 'human', 'infantry variant: AS2 has human'],
  [/^(horse|horse_double)$/, 'animal', 'animal class'],
];
const PATHER_DIR = [[/\/(tank_heavy|tank_medium|spg|tank_destroyer)\//, 'tank'], [/\/tank_light\//, 'tank.light'], [/\/btr\//, 'armored'], [/\/car\//, 'vehicle.small'], [/\/truck\//, 'vehicle.large'], [/\/cannon\//, 'cannon.small'], [/\/airborne\//, 'airborne']];
const patherMap = (name, defKey) => {   // -> { to, reason } | null (null: no class match)
  const n = name.toLowerCase();
  if (AS2_PATHERS.has(n)) return { to: name, keep: true };
  const hit = PATHER_TABLE.find(x => x[0].test(n)); if (hit) return { to: hit[1], reason: hit[2] };
  const dh = PATHER_DIR.find(x => x[0].test('/' + String(defKey || '').toLowerCase().replace(/\\/g, '/')));
  return dh ? { to: dh[1], reason: `no table entry; the def's folder class gives ${dh[1]}` } : null;
};
const patherFix = (s, k, rep, rel, fg) => s.replace(/(\{\s*pather(?:id)?\s+")([^"\r\n]+)"/gi, (m, a, n, off) => {
  const r = patherMap(n, k); if (r && r.keep) return m;
  const line = s.slice(0, off).split('\n').length;
  if (!r) {
    rep.add(rel, line, 'WARN_PORT_PATHER_UNMAPPED', `KEY-30 [I] PatherID "${n}" is not an as64 pather profile and no class matches: left as is, the unit load stops (Wrong pather name) until a profile is added or the name is set by hand`);
    fg.push({ file: k, line, kind: 'hand', code: 'PATHER_MAP', key: 'patherid', paths: [], reason: `KEY-30 PatherID "${n}" has no as64 profile and no class match: left unchanged; a pather.set profile or a hand-picked name is needed` });
    return m;
  }
  rep.add(rel, line, 'WARN_PORT_PATHER_MAP', `KEY-30 [I] PatherID "${n}" is not an as64 pather profile: uses "${r.to}" (${r.reason})`);
  fg.push({ file: k, line, kind: 'baked', code: 'PATHER_MAP', key: 'patherid', paths: [], reason: `KEY-30 PatherID "${n}" not in as64 pather.set: mapped to "${r.to}" (${r.reason}) [I]` });
  return a + r.to + '"';
});
const AS2_MATERIALS =new Set('steel concrete wood straw flesh sand ice rock ground water underwater steelball dummy'.split(' '));        // PORT-20: {material} is read, unknown name errors; GoH adds fabric glass misc
const MTL_KEYS = new Set(['lightmap', 'full_specular', 'specular_intensity', 'gloss_scale']);     // PORT-24
// PORT-47: GoH shared /properties files never go into the mod: same path overrides vanilla for every AS2 entity and GoH-only keys crash the load. Includes point at the AS2 file instead.
// GOHFIX: keys are paths under properties/ (subfolders too). GoH selection/{vehicle,cannon}_elongated.inc go to AS2 selection/vehicle.inc and cannon.inc:
// same scale(%scale) argument and selection_active/_selected names [V files]. AS2 selection/vehicle_elongate.inc (the old target) takes scalex/scaley, so a
// GoH call's scale(1.0) would leave %scalex undefined (GPL-11) [I], and the old regex never matched the subfolder anyway (dcgdefs INCLUDE_MISSING x7 [V]).
const PROP_NAMES = { 'stuff_weapon.ext': 'stuff_small.ext', 'veterancy.inc': 'veterancy_generic.inc', 'resupply.inc': 'resupply_generic.inc', 'selection/vehicle_elongated.inc': 'selection/vehicle.inc', 'selection/cannon_elongated.inc': 'selection/cannon.inc' };
const isSharedProp = k => k.toLowerCase().startsWith('properties/');
const propRename = c => { const r = PROP_NAMES[c.toLowerCase().replace(/\\/g, '/').replace(/^\/?properties\//, '')]; return r ? 'properties/' + r : null; };   // key -> AS2 key or null
const renameProps = s => s.replace(/(properties\/)((?:[a-z0-9_]+\/)*[a-z0-9_]+\.(?:ext|inc))/gi, (m, d, n) => d + (PROP_NAMES[n.toLowerCase()] || n));
// PORTREV (gohfix gap): a renamed props include keeps the GoH macro calls, but the AS2 file may not define them (GoH resupply.inc "supply_ammo"
// -> AS2 resupply_generic.inc has para_ammo truck_ammo truck_ammo_art only: MACRO_UNDEFINED, [V gohfix]). A call to a define of the
// GoH file that the AS2 file lacks goes to the nearest AS2 define (args dropped: the AS2 defines take none) [I], else it is commented out.
const PROP_DEFINE_MAP = { 'resupply_generic.inc': { supply_ammo: 'para_ammo', supply_ammo_fixed: 'para_ammo', flag_ammo: 'para_ammo', crate_ammo_heavy: 'truck_ammo_art', truck_ammo_heavy: 'truck_ammo_art', truck_ammo_heavy_2x: 'truck_ammo_art' } };
const definesOf = s => new Set([...String(s || '').matchAll(/\(\s*define\s+"([^"]+)"/gi)].map(m => m[1].toLowerCase()));
function callEnd(s, i) {   // s[i] === '(' -> index after its matching ')', strings and ; comments skipped; -1 if open
  let d = 0;
  for (let j = i; j < s.length; j++) { const c = s[j]; if (c === '"') { j = s.indexOf('"', j + 1); if (j < 0) return -1; } else if (c === ';') { const n = s.indexOf('\n', j); if (n < 0) return -1; j = n; } else if (c === '(') d++; else if (c === ')' && --d === 0) return j + 1; }
  return -1;
}
// text: converted file; renamed: [{goh, as2, gohDefs:Set, as2Defs:Set|null}] for each PROP_NAMES include this file names. returns {text, fixes:[{name,to,how}]}
function fixRenamedDefines(text, renamed) {
  const fixes = [];
  for (const r of renamed) {
    if (!r.as2Defs) continue;
    const map = PROP_DEFINE_MAP[r.as2] || {}, gone = [...r.gohDefs].filter(n => !r.as2Defs.has(n));
    for (const n of gone) {
      const re = new RegExp('\\(\\s*"' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'gi');
      let m, out = '', last = 0;
      while ((m = re.exec(text))) {
        const ls = text.lastIndexOf('\n', m.index) + 1, lineHead = text.slice(ls, m.index);
        if (/;/.test(lineHead.replace(/"[^"]*"/g, ''))) continue;   // already in a comment
        const e = callEnd(text, m.index); if (e < 0) continue;
        const to = map[n] && r.as2Defs.has(map[n]) ? map[n] : null, orig = text.slice(m.index, e);
        const rep = to ? `("${to}")` : '; ' + orig.replace(/\r?\n/g, ' ') + ' ; PORTREV: define not in AS2 ' + r.as2 + '\r\n';
        out += text.slice(last, m.index) + rep; last = e; re.lastIndex = e;
        fixes.push({ name: n, to, how: to ? 'mapped' : 'commented', from: r.goh, file: r.as2, orig: orig.replace(/\s+/g, ' ') });
      }
      text = out + text.slice(last);
    }
  }
  return { text, fixes };
}
const SET_CALLS = new Set(['call_synced']);                                                                                             // PORT-29: the others exist in AS2 data too

// convert one text file. src = latin1 string (file bytes, strings UTF-8), returns {buf, edits}
function convertText(src, rel, vkey, ext, rep, ctx = {}) {
  const t = sdlw.parse(Buffer.from(src, 'latin1'));
  const want = new Set();
  const inDropped = n => { for (let p = n.parent; p; p = p.parent) if (want.has(p)) return true; return false; };
  const L = n => lineOf(t.src, n.start);
  const add = (code, node, msg) => rep.add(rel, L(node), code, msg);
  // T-PORTGAP: why.get(node) = the rule that removed it; renames = key names rewritten in place (subtree paths change); bakes = values computed or mapped
  const why = new Map(), renames = [], gaps = ctx.gaps || null;
  const bake = (node, code, msg) => { if (gaps) gaps.push({ file: vkey, line: L(node), kind: 'baked', code, key: nodePath(node), paths: [], reason: msg }); };
  const hand = (node, code, msg) => { if (gaps) gaps.push({ file: vkey, line: L(node), kind: 'hand', code, key: nodePath(node), paths: [], reason: msg }); };
  const drop = (node, code, msg, up = 0) => {
    add(code, node, msg); want.add(node); if (!why.has(node)) why.set(node, { code, msg });
    let p = node.parent;
    for (let i = 0; i < up && p && !p.root && p.type === 'block'; i++, p = p.parent) {
      if (p.items.slice(1).every(k => want.has(k) && k.type === 'block')) want.add(p); else break;
    }
  };
  const splice = (s, e, text) => t.splices.push({ start: s, end: e, text });
  const kind = ext;
  const base = vkey.slice(vkey.lastIndexOf('/') + 1);

  walk(t.root, (n, p) => {
    const nm = n.name, par = p[p.length - 1] || '', inPath = x => p.includes(x);
    // PORT-32: {##x stays: the reader skips it
    // PORT-18 (def/any): health hp/hp_broken, armor_damage_modifier
    if ((nm === 'hp' || nm === 'hp_broken') && par === 'health' && inPath('perks')) drop(n, 'WARN_PORT_DROP_HEALTH', `PORT-18 [I] drop perks/component/health/${nm} (GoH-only; AS2 health from other keys)`, 3);
    else if (nm === 'armor_damage_modifier') drop(n, 'WARN_PORT_DROP_HEALTH', 'PORT-18 [I] drop armor_damage_modifier (GoH-only)');
    // PORT-19: armor/setting/threshold koef stays: as64 reads it
    // PORT-20/21: volume. per-face thickness and known materials stay
    if (nm === 'volume') {
      for (const k of n.items) {
        if (k.type !== 'block') continue;
        if (VOL_KEYS.has(k.name)) drop(k, 'WARN_PORT_VOLUME_KEY', `PORT-20 [V] drop volume/${k.name} (not in the as64 volume reader; see PORT-01)`);
        else if (k.name === 'material') { const mn = String(k.items[1] && k.items[1].text || '').replace(/"/g, '').toLowerCase(); if (!AS2_MATERIALS.has(mn)) drop(k, 'WARN_PORT_VOLUME_KEY', `PORT-20 [V] drop volume/material "${mn}" (not in the as64 material.set; portfix volmats adds it for a whole-tree mount)`); }
        else if (k.name === 'able') { for (const f of k.items) if (f.type === 'block' && FLAGS_ABLE.has(f.name)) drop(f, 'WARN_PORT_VOLUME_FLAG', `PORT-21 [I] drop volume/able/${f.name} (no AS2 key)`, 1); }
        else if (k.name === 'contact' && k.items.length === 1) drop(k, 'WARN_PORT_VOLUME_FLAG', 'PORT-21 [I] drop bare {contact} flag (AS2 contact takes a value)');
      }
    }
    // PORT-22: arithmetic
    if (LOCO.has(nm)) for (const k of n.items.slice(1)) if (k.type === 'list') {
      const v = evalArith(k);
      if (v === null) add('WARN_PORT_ARITH_FAIL', k, `PORT-22 [I] ${nm}: cannot evaluate expression, left as is`);
      else { const m = `PORT-22 [I] ${nm}: ${t.src.slice(k.start, k.end).replace(/\s+/g, ' ')} -> ${fmtNum(v)}`; add('WARN_PORT_ARITH_EVAL', k, m); bake(n, 'WARN_PORT_ARITH_EVAL', m); splice(k.start, k.end, fmtNum(v)); }
    }
    // PORT-23: sequence/events
    if (nm === 'obstacleid' && par === 'obstacle') drop(n, 'WARN_PORT_DROP_EVENTS', 'PORT-74 [V] drop obstacle/obstacleID (known keyword with no case there: Block terminator expected)');
    if (nm === 'events' && par === 'sequence') drop(n, 'WARN_PORT_DROP_EVENTS', 'PORT-23 [I] drop sequence/events (GoH-only frame events)');
    // PORT-24: mtl
    // ASSET-1 option --lightmap-multiply: GoH {lightmap "x"} (baked shading) -> AS2 {material multiply {diffuse} {diffuse1 "x"}} multiply + diffuse1 is the AS2 lightmap form [I]).
    // The material type changes to multiply, so a bump/specular in the same material may stop being read [T]; without the flag the key is dropped (PORT-24)
    if (kind === 'mtl' && nm === 'lightmap' && p.length === 1 && ctx.lightmapMultiply && n.items[1] && n.items[1].type === 'string' && n.parent && n.parent.items[1] && n.parent.items[1].type === 'atom') {
      splice(n.items[0].start, n.items[0].end, 'diffuse1'); splice(n.parent.items[1].start, n.parent.items[1].end, 'multiply');
      rep.info(rel, L(n), 'PORT_LIGHTMAP_MULTIPLY', `ASSET-1 [I] {lightmap} -> {diffuse1} and material type "${n.parent.items[1].text}" -> multiply; bump/specular use under multiply is [T]`);
      renames.push({ node: n, code: 'PORT_LIGHTMAP_MULTIPLY', msg: 'ASSET-1 {lightmap} renamed {diffuse1} under a multiply material' });
    } else
    if (kind === 'mtl' && MTL_KEYS.has(nm) && p.length === 1) drop(n, 'WARN_PORT_MTL_KEYS', `PORT-24 [I] drop material/${nm} (PBR-like key, no AS2 key; flat diffuse/bump kept: AS2 accepts both)`);
    // PORT-25: ammo
    // GoH splits these blocks over .pattern/.inc/.set too, and an .inc holds them at its root. takes only energy+area, anything else is fatal at boot [V as64]
    if (nm === 'ground_interaction_radius' && kind !== 'mine') drop(n, 'WARN_PORT_DROP_AMMO_KEY', 'PORT-25 [V] drop damage/ground_interaction_radius (GoH-only, fatal in )');
    else if (kind === 'ammo' || kind === 'pattern' || kind === 'inc' || kind === 'grenade') {
      if (nm === 'possibledamageradius' || (nm === 'cumulative' && par === 'bullet')) drop(n, 'WARN_PORT_DROP_AMMO_KEY', `PORT-25 [I] drop ${nm} (GoH-only)`);
      else if (nm === 'scalex' && par === 'view' && p[p.length - 2] === 'trace') drop(n, 'WARN_PORT_DROP_AMMO_KEY', 'PORT-25 [I] drop bullet/trace/view/scalex (GoH-only)');
    }
    // PORT-26: weapon/pattern
    if (kind === 'weapon' || kind === 'pattern') {
      if (nm === 'overmatchslope' || nm === 'overmatchcalibre') drop(n, 'WARN_PORT_WEAPON_KEY', `PORT-26/02 [I] drop ${nm} (engine has no overmatch; PORT-02 [V])`);
      else if (par === 'from' && p.length === 1 && (nm === 'calibre' || nm === 'minrange')) { const m = `PORT-26 [I] from/${nm} is GoH layout; AS2 weapon_bullet{gravity,rechargetime,spreading,aimtype}: rewrite by hand`; add('WARN_PORT_WEAPON_KEY', n, m); hand(n, 'WARN_PORT_WEAPON_KEY', m); }
      else if (nm === 'rechargetime' && par === 'parameters') { const m = 'PORT-26 [I] parameters/rechargetime: AS2 takes rechargetime in weapon_bullet; move by hand'; add('WARN_PORT_WEAPON_KEY', n, m); hand(n, 'WARN_PORT_WEAPON_KEY', m); }
    }
    // NAT-GAP: {burst ..} and block-form {spreading ..} are the as64 form already (vanilla as64 set/stuff/gun/120mm_l50 {spreading {radiusTable ..}} {burst {min}{short}{long}}):
    // kept as written. Only a sub-key the as64 reader has no case for is dropped: burst (default: unexpected token)
    // spreading = modifier keywords (else)
    if ((kind === 'weapon' || kind === 'pattern' || /^set\/stuff\//i.test(vkey)) && (nm === 'burst' || nm === 'spreading')) {
      const ok = nm === 'burst' ? BURST_SUBKEYS : SPREADING_SUBKEYS, code = nm === 'burst' ? 'WARN_PORT_BURST_KEY' : 'WARN_PORT_SPREADING_KEY';
      for (const k of n.items) if (k.type === 'block' && !ok.has(String(blkName(k)).toLowerCase())) drop(k, code, nm === 'burst' ? `NAT-GAP [V] drop burst/${blkName(k)}: as64 {burst} reads min noaiming short long rangeKoef only ( unexpected token)` : `NAT-GAP [I] drop spreading/${blkName(k)}: not an as64 modifier keyword (; other names go to , :87-90)`);
    }
    // PORT-27: a mine's root {from "pattern"} stays: ReadStuff takes from on any stuff; {item "pattern"} is fatal [V as64]
    if (kind === 'mine' && nm === 'ground_interaction_radius' && par === 'damage') drop(n, 'WARN_PORT_MINE_RESHAPE', 'PORT-27 [I] drop damage/ground_interaction_radius');
    // PORT-28: block action, string tag_add/tag_remove are native; nothing to do
    // PORT-29: interaction scripts
    if (/(^|\/)set\/interaction_entity(\.[a-z]+$|\/)/.test(vkey) && SET_CALLS.has(nm)) drop(n, 'WARN_PORT_DROP_SET_CALL', `PORT-29 [V] drop ${nm} (GoH-only call; rewrite behaviour by hand)`);
    // PORT-30: vision
    if (/(^|\/)set\/vision\.set$/.test(vkey)) {
      if (par === 'firing' && /^firing_/.test(nm || '')) { add('WARN_PORT_VISION_KEY', n, `PORT-30 [I] rename ${nm} -> ${nm.slice(7)}`); renames.push({ node: n, code: 'WARN_PORT_VISION_KEY', msg: `PORT-30 renamed ${nm} -> ${nm.slice(7)}` }); const nn = n.items[0]; if (nn) splice(nn.start, nn.end, nn.text.replace(/^("?)firing_/i, '$1')); }
      else if (/^(vehicle|plane|marine)_\d+$/.test(nm || '')) { const m = `PORT-30 [I] rule ${nm}: no known AS2 name; rewrite by hand`; add('WARN_PORT_VISION_KEY', n, m); hand(n, 'WARN_PORT_VISION_KEY', m); }
    }
    // PORT-26: last, so the named rules above report first. keys in no engine keyword table; the stuff readers are strict (fatal "unexpected token" while loading set/stuff at boot) [V]. keyed on the folder + its includes: GoH splits weapons over .weapon/.pattern/.hand/.inc
    if (nm && !/^[-\d.#%]/.test(nm) && !STUFF_KEYS.has(String(nm).toLowerCase()) && (/^set\/stuff\//i.test(vkey) || ctx.stuffInc && ctx.stuffInc.has(vkey)) && !want.has(n) && !inDropped(n)) drop(n, 'WARN_PORT_WEAPON_KEY', `PORT-26 [V] drop ${nm} (no such key in AS2 stuff readers, fatal at boot)`);
    // PORT-53: entity data keys no engine string names and no vanilla file uses, or (perks and friends) keys other AS2 readers take but entity readers do not (whole-tree census + AS2 entity keys); fatal in where read [V tpc_zclip, I rest]
    if (nm && ENTITY_DEAD_KEYS.has(String(nm).toLowerCase()) && /^(entity|properties)\//i.test(vkey) && !want.has(n) && !inDropped(n)) drop(n, 'WARN_PORT_ENTITY_KEY', `PORT-53 drop ${nm} (GoH-only, no AS2 reader)`);
    // PORT-58 [V as64]: takes one curve, a second is fatal "Block terminator expected". first kept
    if (/^(entity|properties)\//i.test(vkey) && n.items) { const cs = n.items.filter(c => c.type === 'block' && /^(linear|power|npower|peak|const)$/i.test(String(c.name))); for (const c of cs.slice(1)) drop(c, 'WARN_PORT_FX_CURVES', `PORT-58 [V] one curve per channel: drop ${c.name} from ${nm}`); }
    // FMT-05 [V]: {limits}/{speed} on a bone the mdl declares plain (no revolute/prizmatic/socket/planarsocket type word) = "unexpected token" crash at load (PORT-127's crash).
    // A bare {limits} on a typed bone is legal and kept (vanilla has 38 files with one). The bone's type comes from the def's own mdl (ctx.boneTypes); a bone the mdl lacks is left for donorfit.
    if (nm === 'bone' && ctx.boneTypes && !want.has(n) && !inDropped(n)) plainBoneDrops(n, ctx.boneTypes).forEach(k => drop(k, 'WARN_PORT_PLAIN_BONE', `FMT-05 [V] removed {${k.name}} under {bone ${boneNameOf(n)}}: the mdl's bone is plain (as64 parser: "unexpected token", crash at load)`));
    if (nm === 'bone' && ctx.boneTypes && !want.has(n) && !inDropped(n)) limitsArityBad(n, ctx.boneTypes).forEach(b => drop(b.node, 'WARN_PORT_LIMITS_ARITY', limArityMsg(n, b)));
    if (nm === 'bone' && ctx.boneTypes && want.has(n) === false && boneBlockEmptied(n, want)) want.add(n);
    // PORT-54 [V as64]: effect child head {+ view name}: AS2 reads {view name}, the + is fatal
    if (nm === '+' && /^entity\/fx\//i.test(vkey) && n.items[1]) { add('WARN_PORT_FX_PLUS', n, 'PORT-54 [V] {+ view -> {view'); renames.push({ node: n, code: 'WARN_PORT_FX_PLUS', msg: 'PORT-54 {+ view} renamed {view}: the + is fatal in AS2' }); splice(n.items[0].start, n.items[1].start, ''); }
  });
  if (kind === 'ammo') {
    const bl = sdlw.findAll(t, 'bullet'), has = sdlw.findAll(t, 'bullet/applyprojectile').length;
    for (const b of bl) if (!has) add('WARN_PORT_DROP_AMMO_KEY', b, 'PORT-25 [I] bullet has no applyprojectile: add by hand');
  }
  // PORT-19 note when durability inserted is reported at the koef line; apply removals topmost-only
  const removed = new Set();
  for (const n of want) { let a = n.parent, skip = false; while (a) { if (want.has(a)) { skip = true; break; } a = a.parent; } if (!skip) { sdlw.removeNode(n); removed.add(n); } }
  if (gaps) {   // T-PORTGAP: one entry per removed subtree; a block removed because every child went is "emptied" and names the children's codes
    const gone = x => { for (let p = x; p; p = p.parent) if (removed.has(p)) return true; return false; };
    for (const n of removed) {
      let w = why.get(n);
      if (!w) { const cs = [...new Set([...want].filter(c => c !== n && gone(c) && (() => { for (let p = c.parent; p; p = p.parent) if (p === n) return true; return false; })() && why.has(c)).map(c => why.get(c).code))].sort(); w = { code: 'EMPTIED', msg: `every key in this block was dropped (${cs.join(', ') || 'no rule named'}), so the block went too` }; }
      gaps.push({ file: vkey, line: L(n), kind: 'dropped', code: w.code, key: nodePath(n), paths: subtreePaths(n), reason: w.msg });
    }
    for (const r of renames) if (!gone(r.node)) gaps.push({ file: vkey, line: L(r.node), kind: 'baked', code: r.code, key: nodePath(r.node), paths: subtreePaths(r.node, gone), reason: r.msg });
  }
  void base;
  return sdlw.serialize(t).toString('latin1').replace(/\r?\n/g, '\r\n');
}

// PORT-32 text rewrite {##x -> {x (identifier x only; {##+ ... is not rewritten) (also used by portdiff before parsing GoH files); operates on a decoded string
const fixHashTags = str => str.replace(/{##(?=[A-Za-z_])/g, '{');

// ---- dependency closure
// closure follows only values of keys that name files/entities (PORT closure tightening); other strings/atoms (bone/volume names, labels) are ignored
const REF_KEYS = new Set(['extension', 'include', 'file', 'volumeview', 'mesh', 'model', 'texture', 'diffuse', 'bump', 'specular', 'normal', 'material', 'mtl', 'ply', 'anm', 'vol', 'polyhedron',
  'ammo', 'weapon', 'entity', 'item', 'sound', 'sounds', 'fx', 'effect', 'animation', 'pattern', 'projectile', 'applyprojectile', 'shell', 'inventory', 'from', 'base', 'parent', 'template', 'skin', 'set', 'def', 'collision', 'volume_view', 'view']);
function tokens(src, mtl) {
  const t = sdlw.parse(Buffer.from(src, 'latin1')), out = [];
  (function w(n) {
    for (const k of n.items) {
      if (k.type === 'string' || k.type === 'atom') { if (k === n.items[0] || !(REF_KEYS.has(n.name) || (mtl && MTL_TEX_KEYS.has(n.name)))) continue; out.push({ s: k.type === 'string' ? k.text.replace(/^"|"$/g, '') : k.text, q: k.type === 'string', key: n.name }); }
      else if (k.items) w(k);
    }
  })(t.root);
  return out;
}
// {sequence "name"} with no {file} loads <model dir>/name.anm; missing = fatal at preload
function implicitAnms(src) {
  const out = [];
  (function w(n) {
    const kids = n.items.filter(k => k.items);
    if (n.name === 'sequence' && n.items[1] && n.items[1].type === 'string' && !kids.some(k => k.name === 'file')) out.push(n.items[1].text.replace(/^"|"$/g, '').toLowerCase());
    kids.forEach(w);
  })(sdlw.parse(Buffer.from(src, 'latin1')).root);
  return out;
}
// every key a token could name, in lookup order; null = not a file-like token
function candKeys(tok, dir) {
  let s = tok.s.trim();
  const isTex = TEX_KEY_RE.test(tok.key);   // $/ = /texture/common/ for materials
  // the number filter is for atoms only: a quoted name may start with a digit ("105mm_k13_x.mdl"), run on as64: File not found at preload
  // a quoted texture name may hold spaces ("$/model/m4a3e8/sherman m4a3e8"): it is a name (ASSET-1, PORT-152)
  if (!s || s.length < 3 || (/\s/.test(s) && !(isTex && tok.q)) || !tok.q && /^[-+\d.%]/.test(s) && !s.includes('/')) return null;
  s = s.toLowerCase().replace(/\\/g, '/');
  if (!tok.q && !s.includes('/')) return null;
  const bases = s.startsWith('/') ? [s.slice(1)] : s.startsWith('$/') ? ['texture/common/' + s.slice(2), 'entity/' + s.slice(2), s.slice(2), 'texture/' + s.slice(2), dir + '/' + s.slice(2)] : [dir + '/' + s, s];
  const hasExt = extOf(s) !== '' && (BIN.has(extOf(s)) || TEXT.has(extOf(s)) || SKIP_EXT.has(extOf(s)));
  const out = [];
  for (const b of bases) for (const x of hasExt ? [''] : (isTex ? IMG_EXT : DEP_EXT).map(e => '.' + e)) out.push(norm(b + x));
  return { out, hasExt };
}
function resolveTok(tok, dir, map) {
  const c = candKeys(tok, dir);
  if (!c) return null;
  for (const k of c.out) if (map.has(k)) return k;
  return null;
}
// closure checker: re-reads every wanted mdl/ply/mtl/def/ext/inc and asks of each file name in it whether it is in the closure, in vanilla AS2, or in nothing
// (a hole in the closure when GoH has it, otherwise a name GoH lacks too). Entity/weapon/ammo names (no extension, not a file key) are not file names and are not checked.
const FILE_KEYS = new Set(['extension', 'include', 'volumeview', 'texture', 'diffuse', 'diffuse1', 'diffuse2', 'bump', 'specular', 'normal', 'mask', 'lightmap', 'height', 'envmap']);   // others (anm "left", vol, ply) hold names, not paths, unless they carry an extension
const OTHER_EXT = new Set(['wav', 'ogg', 'mp3', 'lua', 'txt', 'xml', 'bik', 'avi', 'lng']);
function checkClosure(want, idx, as2idx, readText, listed, written) {   // written (FXC-4 gap 6): keys --mtl-fallback writes, they are in the output though not in `want`
  const res = { refs: 0, closure: 0, as2: 0, missing: [] };
  for (const k of [...want.keys()]) {
    const ext = extOf(k), dir = k.slice(0, k.lastIndexOf('/'));
    if (!['def', 'ext', 'inc', 'mdl', 'mtl', 'ply'].includes(ext) || !idx.map.has(k)) continue;
    const refs = [];   // {name, cands, tok}
    if (ext === 'ply') {
      let r; try { r = meshRefs(readEnt(idx.map.get(k))); } catch { continue; }
      for (const m of r.mtls) refs.push({ name: m, cands: [names.resolve(m, 'resource/' + dir).key.replace(/^resource\//, '').toLowerCase()] });
      for (const t of r.tex) { const c = candKeys({ s: t, q: true, key: 'texture' }, dir); if (c) refs.push({ name: t, cands: c.out, tex: true }); }
    } else {
      let src; try { src = readText(k); } catch { continue; }
      if (ext === 'mdl') for (const a of implicitAnms(src)) refs.push({ name: a + '.anm (sequence)', cands: [norm(dir + '/' + a + '.anm')] });
      for (const tok of tokens(src, ext === 'mtl')) {
        const c = candKeys(tok, dir);
        if (!c || !(FILE_KEYS.has(tok.key) || c.hasExt)) continue;
        if (SKIP_EXT.has(extOf(tok.s.toLowerCase()))) continue;
        refs.push({ name: tok.s, cands: c.out, tex: TEX_KEY_RE.test(tok.key) });
      }
      // any quoted name with a file extension, whatever its key ({polyhedron "x.vol"} was in no key list and the checker said 0 missing)
      const seen = new Set(refs.map(r => r.name));
      // SCEN-FIX: a `;` comment line names nothing (bush_dense_2.mdl keeps its old bones as `;` lines: empty.ply and branches_lod3.mtl were false CLOSURE_MISSING, hand-filled in SCEN-G)
      for (const m of src.replace(/^[ \t]*;[^\r\n]*/gm, '').matchAll(/"([^"\r\n]+\.[a-z][a-z0-9]{1,4})"/gi)) {
        const s = m[1].trim();
        const xe = extOf(s.toLowerCase());   // collider/props names such as "tank.heavy" are not files: known file extensions only
        if (/\s/.test(s) || s.length < 3 || seen.has(s) || SKIP_EXT.has(xe) || !(BIN.has(xe) || TEXT.has(xe) || OTHER_EXT.has(xe))) continue;
        seen.add(s);
        const c = candKeys({ s, q: true, key: 'any' }, dir);
        const low = s.toLowerCase().replace(/\\/g, '/');
        refs.push({ name: s, cands: c && c.hasExt ? c.out : [norm(low.startsWith('/') ? low.slice(1) : dir + '/' + low), norm(low)] });
      }
    }
    for (const r of refs) {
      res.refs++;
      const cands = r.cands.flatMap(c => [c, isSharedProp(c) ? propRename(c) || c : c]);
      if (cands.some(c => want.has(c) && !SKIP_EXT.has(extOf(c))) || (written && cands.some(c => written.has(c)))) res.closure++;
      else if (as2idx && cands.some(c => as2idx.map.has(c))) res.as2++;
      else res.missing.push({ from: k, name: r.name, tex: !!r.tex, how: cands.some(c => listed.has(c)) ? 'listed (PORT-47 not copied)' : cands.some(c => idx.map.has(c)) ?'IN GoH, NOT PULLED' : 'not in GoH data either' });
    }
  }
  return res;
}

// GoH text -> AS2 text: bytes pass through (GoH UTF-8 = as64 UTF-8, [V shot]); only the BOM is stripped, EOL -> CRLF.
// src = latin1 string of the bytes. scan (lazy) = enc.sdlScan: non-ASCII outside strings/comments, string values that are not UTF-8
function decodeText(buf) {
  let b = buf; if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3);
  return { src: b.toString('latin1').replace(/\r?\n/g, '\r\n'), get scan() { return enc.sdlScan(b); } };
}

// FMT-05: bone name -> type word ('' = plain, else revolute/prizmatic/socket/planarsocket/wild) from an mdl's bone tree. A {Bone "x"} inside a {Volume} has no type word and is ignored.
// SCEN-FIX rule 3 (PORT-171): GoH {Extender "light" {preset "n" {light_fx ..}{light_bone ..}{break_fx ..}{break_bone ..}}} is fatal on as64 ( reads only
// {lamp "n" on|off|work|broken}, {lightfx}, {breakfx}, {check_operatable}). The keys do not map plainly [V]: as64 finds bones/volumes by the name suffix of a lamp
// ("lamp_light_point<n>", "lamp_glass<n>") and builds the fx entity names from one {lightfx} + _point/_spot/_plafond/_dir, while GoH names a bone and an fx per preset. So the block
// is replaced by an empty {Extender "light"} (the form SCEN-G r4 ran clean). Returns {text, n} with n = blocks replaced.
function emptyGohLight(text) {
  let n = 0, out = '', i = 0;
  const re = /\{\s*Extender\s+"light"/gi;
  for (let m; (m = re.exec(text));) {
    let d = 0, j = m.index, q = false;
    for (; j < text.length; j++) { const c = text[j]; if (c === '"') q = !q; else if (!q && c === '{') d++; else if (!q && c === '}' && --d === 0) { j++; break; } }
    const blk = text.slice(m.index, j);
    if (!/\{\s*preset\b/i.test(blk)) { re.lastIndex = j; continue; }
    out += text.slice(i, m.index) + '{Extender "light"\r\n}'; i = j; re.lastIndex = j; n++;
  }
  return { text: out + text.slice(i), n };
}
// PORT-186: {extender "light"} with {lamp "N"} needs a model bone named ..lamp_glassN; without it a blast that breaks the lamp
// crashes. bones = Map from boneTypesOf; unknown (null) leaves the text as is.
function dropLamplessLight(text, bones) {
  if (!bones) return { text, n: 0, lamps: [] };
  const names = [...bones.keys()];
  let n = 0, out = '', i = 0; const lamps = [];
  const re = /\{\s*Extender\s+"light"/gi;
  for (let m; (m = re.exec(text));) {
    let d = 0, j = m.index, q = false;
    for (; j < text.length; j++) { const c = text[j]; if (c === '"') q = !q; else if (!q && c === '{') d++; else if (!q && c === '}' && --d === 0) { j++; break; } }
    const blk = text.slice(m.index, j), ls = [...blk.matchAll(/\{\s*lamp\s+"([^"]*)"/gi)].map(x => x[1]);
    const miss = ls.filter(l => !names.some(b => b.endsWith('lamp_glass' + l.toLowerCase())));
    if (!miss.length) { re.lastIndex = j; continue; }
    let s = m.index; while (s > i && /[ \t]/.test(text[s - 1])) s--;
    let e = j; while (e < text.length && /[ \t]/.test(text[e])) e++; if (text[e] === '\r') e++; if (text[e] === '\n') e++;
    out += text.slice(i, s); i = e; re.lastIndex = e; n++; lamps.push(...miss);
  }
  return { text: out + text.slice(i), n, lamps };
}
// C2d: defs under <root> (resource/entity of a mod) whose entity title (file name before the first dot) is already taken: [{ file, title, other }]
function entityRedefs(root) {
  const seen = new Map(), out = [], files = [];
  (function w(d, rel) {
    let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es.sort((a, b) => (a.name < b.name ? -1 : 1))) { const r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) w(path.join(d, e.name), r); else if (/\.def$/i.test(e.name)) files.push(r); }
  })(root, '');
  files.sort((a, b) => (path.posix.basename(a).split('.').length - path.posix.basename(b).split('.').length) || (a < b ? -1 : 1));   // plain <t>.def first: the side copy is the one named
  for (const r of files) {
    const t = path.posix.basename(r).split('.')[0].toLowerCase();
    if (seen.has(t)) out.push({ file: 'resource/entity/' + r, title: t, other: 'resource/entity/' + seen.get(t) }); else seen.set(t, r);
  }
  return out;
}
function boneTypesOf(src) {
  const types = new Map();
  (function w(n, inVol) {
    for (const k of n.items) {
      if (k.type !== 'block' && k.type !== 'list') continue;
      if (k.name === 'bone' && !inVol) {
        const si = k.items.findIndex(x => x.type === 'string');
        if (si > 0) { const nm = k.items[si].text.replace(/^"|"$/g, '').toLowerCase(); if (!types.has(nm)) types.set(nm, si >= 2 && k.items[si - 1].type === 'atom' ? k.items[si - 1].text.toLowerCase() : ''); }
      }
      w(k, inVol || k.name === 'volume');
    }
  })(sdlw.parse(Buffer.from(src, 'latin1')).root, false);
  return types;
}
const boneNameOf = n => { const s = n.items.find(x => x.type === 'string'); return s ? s.text : '?'; };
// {limits}/{speed}/{speed2} children of a def bone block whose mdl bone is plain (BUILD-6: speed2 is a parametric-bone key like speed, , ERR_DEF_READER m3a1_stuart_late)
function plainBoneDrops(n, types) {
  const s = n.items.find(x => x.type === 'string');
  if (!s || types.get(s.text.replace(/^"|"$/g, '').toLowerCase()) !== '') return [];
  return n.items.filter(k => k.type === 'block' && /^(limits|speed2?)$/i.test(k.name));
}
// FXD-1 [V, 870]: revolute/prizmatic {limits} takes 0 or 2 numbers, socket/planarsocket 0 or 1; any other count stops the game at load ("Number expected!", 117).
// A donor's {limits 15} (a socket cone) on a rep mdl bone that is revolute is dropped: the rep mdl's own limits stand. The rep's GoH def never writes a one-value limits (rep def read for us-m2a1_lt) [V]; what GoH's reader does with one is not in the dumps [T].
const limArityMsg = (k, b) => `FXD-1 [V] removed {limits} (${b.n} value(s)) under {bone ${boneNameOf(k)}}: the mdl's bone is ${b.type}, the as64 reader takes 0 or ${b.want} (else "Number expected!", crash at load); the mdl's own limits stand`;
// XLATE-5 (WPN-1G): a reactive weapon is imported as a {weapon_bullet} copy of the vanilla template with the GoH range and recharge, not as the {from "<template>" {range N N}} root:
// the reactive reader stops on that root ("unexpected token", ) [I], and reads aimRange/maxRange, not {range}. row.imp gives range and recharge. [T in game]
function reactiveWeapon(tmplText, row, name, tmpl) {
  const n = row.imp || {}; let t = tmplText.replace(/\r?\n/g, '\n');
  const set = (key, val) => {
    const re = new RegExp('(\\{\\s*' + key + '\\s+)[^}\\s]+(\\s*\\})', 'i');
    if (re.test(t)) t = t.replace(re, '$1' + val + '$2');
    else t = t.replace(/(\{\s*weapon_bullet[^\n]*\n)/i, `$1\t{${key} ${val}}\n`);
  };
  if (n.range != null) { set('aimRange', Math.round(n.range)); set('maxRange', Math.round(n.range)); }
  if (n.recharge != null) set('rechargeTime', n.recharge);
  return `; goh2as2 WPN-1 + XLATE-5 [T]: GoH weapon ${name} imported translated: copy of vanilla ${tmpl} with aimRange/maxRange ${n.range != null ? Math.round(n.range) : '(template)'} and rechargeTime ${n.recharge != null ? n.recharge : '(template)'} from tools/xlate/table.json\n` + t;
}
// FXD-1 rule 2: every def written is parse-checked (defcheck.js); a hit is ERR_DEF_READER and the process exits 1 (the report still prints)
let readerErrs = 0, readerFirst = null;
const errList = [];   // XLATE-5: every error that makes the exit code 1, { code, loc }; the last output line names the first one
function readerCheck(rep, rel, text, types) {
  for (const f of checkDef(text, types)) {
    // a stray ")" is dropped silently by the reader (SDL-16 [V], 4 in vanilla; the blitz3_6* donor defs carry one): a warning, not a stop (defcheck.js still reports it as a finding)
    if (f.warn || /^stray "\)"/.test(f.msg)) { rep.add(rel, f.line, 'WARN_PAREN_STRAY', 'BG-3 [V SDL-16] the reader drops a stray ")" silently; not a stop (' + f.msg + ')'); continue; }   // does not change the exit code
    readerErrs++; if (!readerFirst) readerFirst = `${rel}:${f.line} ${f.msg}`; errList.push({ code: 'ERR_DEF_READER', loc: `${rel}:${f.line} ${f.msg}` });
    rep.add(rel, f.line, 'ERR_DEF_READER', 'FXD-1 the as64 reader would stop the game on this def: ' + f.msg);
  }
}
// a bone block whose only children were dropped (name string and atoms aside) goes with them
function boneBlockEmptied(n, want) {
  if (!n.items.some(k => k.type === 'block' && want.has(k))) return false;
  return n.items.every(k => k === n.items[0] || k.type === 'string' || k.type === 'atom' || (k.type === 'block' && want.has(k)));
}
// --donor: the plain-bone rule on a bare def text (cp1251 bytes as latin1), not the GoH conversions
function stripPlainBones(src, rel, rep, types) {
  const t = sdlw.parse(Buffer.from(src, 'latin1')), want = new Set();
  (function w(n) {
    for (const k of n.items) {
      if (k.type === 'list') { w(k); continue; }
      if (k.type !== 'block') continue;
      if (k.name === 'bone') {
        for (const c of plainBoneDrops(k, types)) { want.add(c); rep.add(rel, lineOf(t.src, c.start), 'WARN_PORT_PLAIN_BONE', `FMT-05 [V] removed {${c.name}} under {bone ${boneNameOf(k)}}: the rep mdl's bone is plain`); }
        for (const b of limitsArityBad(k, types)) { want.add(b.node); rep.add(rel, lineOf(t.src, b.node.start), 'WARN_PORT_LIMITS_ARITY', limArityMsg(k, b)); }
        if (boneBlockEmptied(k, want)) want.add(k);
      }
      w(k);
    }
  })(t.root);
  for (const n of want) { let a = n.parent, skip = false; while (a) { if (want.has(a)) { skip = true; break; } a = a.parent; } if (!skip) sdlw.removeNode(n); }
  return sdlw.serialize(t).toString('latin1');
}
// PORT-133: mdl text with its skeleton's plain {bone "basis"} made {bone revolute "basis" {speed 0.01}}; null when basis is absent or already typed
function revoluteBasis(src) {
  const types = boneTypesOf(src);
  if (!types.has('basis') || types.get('basis') !== '') return null;
  const re = /\{(\s*)bone(\s+)"basis"/i;
  return re.test(src) ? src.replace(re, '{$1bone$2revolute "basis" {speed 0.01}') : null;
}
// LIM-1 [I rule, V one unit]: GoH elevation limits on a towed gun's rep mdl can leave the gun unable to hit ground targets in AS2
// (20mm_type_2: rep gun_rot -5 85 gave 0/6 kills, the donor type2_20mm_stand's -15 65 gave 3/3 at 300, ../run/voln/t2/lim; -5 65 gave 0/2, so the low side matters).
// Rule: for revolute gun_rot/gun bones in both mdls with 2-value limits, both "elevation-major" (max > |min|, as AA guns and howitzers;
// vanilla pak40 -17 10 / flak41 -47 10 use the other sign and are left alone), when the rep's range sits above the donor's on both ends
// (rep min > donor min and rep max > donor max), the donor's limits are written. Returns { text, changes: [{bone, from, to}] }.
function donorGunLimits(repSrc, donorSrc) {
  const lim = (src, nm) => {
    const m = new RegExp('\\{\\s*bone\\s+revolute\\s+"' + nm + '"', 'i').exec(src); if (!m) return null;
    let e = src.slice(m.index + m[0].length).search(/\{\s*bone\b/i); e = e < 0 ? src.length : m.index + m[0].length + e;
    const l = /\{\s*limits\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\}/i.exec(src.slice(m.index, e));
    return l ? { at: m.index + l.index, len: l[0].length, a: +l[1], b: +l[2], raw: l[1] + ' ' + l[2] } : null;
  };
  const changes = []; let text = repSrc;
  for (const nm of ['gun_rot', 'gun']) {
    const r = lim(text, nm), d = lim(donorSrc, nm);
    if (!r || !d) continue;
    if (!(r.b > Math.abs(r.a) && d.b > Math.abs(d.a))) continue;
    if (!(r.a > d.a && r.b > d.b)) continue;
    text = text.slice(0, r.at) + '{limits ' + d.raw + '}' + text.slice(r.at + r.len);
    changes.push({ bone: nm, from: r.raw, to: d.raw });
  }
  return { text, changes };
}
// the mdl that goes with a def: its last {extension "x.mdl"}, else the same-stem .mdl; returns the idx key or null
function mdlKeyOf(k, src, idx, depth = 0, seen = new Set()) {
  const dir = k.slice(0, k.lastIndexOf('/'));
  const ts = tokens(src).filter(t => t.key === 'extension' && /\.mdl$/i.test(t.s));
  for (let i = ts.length - 1; i >= 0; i--) { const r = resolveTok(ts[i], dir, idx.map); if (r) return r; }
  // FXE-1: the model is named in an included file (GoH mortars: (include "81mm_mortar.inc") holds the {Extension "81mm_brandt.mdl"}); the def's own Extension wins, includes are read in order to depth 3, each relative to the file naming it
  if (depth < 3) for (const t of tokens(src)) {
    if (t.key !== 'include' || !/\.(inc|ext)$/i.test(t.s)) continue;
    const ik = resolveTok(t, dir, idx.map);
    if (!ik || seen.has(ik)) continue; seen.add(ik);
    let isrc; try { isrc = decodeText(readEnt(idx.map.get(ik))).src; } catch { continue; }
    const r = mdlKeyOf(ik, isrc, idx, depth + 1, seen); if (r) return r;
  }
  if (depth) return null;   // the same-name sibling rule is for the def only
  const sib = k.slice(0, k.lastIndexOf('.')) + '.mdl';
  return idx.map.has(sib) ? sib : null;
}

// PORT-124/125/126: what a closure alone leaves out for infantry. [T] none of this was run in game by this tool; the hand-written versions it copies were
const PATTERN_CLASSES = new Set(['rifle', 'smg', 'mgun', 'pistol', 'gun']);   // vanilla set/stuff/<class>/<class>.pattern exists [V dirs listing]
const safeName = s => String(s).replace(/[^A-Za-z0-9_-]/g, '_');
function breedText(skin, nation, itemLines) {
  return ['{breed', `\t{skin "${skin}"}`, '\t{portrait "ger_soldier2"}', `\t{nationality ${nation}}`, '\t{icon "rifleman"}', '\t{icon_priority 1}',
    '\t{perks', '\t\t{"health" "150%"', '\t\t}', '\t\t{"vision" "mp_soldier"', '\t\t}', '\t\t{"speed" 0.9', '\t\t}', '\t\t{"rifle" lvl_2', '\t\t}', '\t}',
    '\t{veterancy', `\t\t(include "/set/breed/mp/${nation}/veterancy_generic.inc")`, '\t\t("veterancy_1")', '\t}',
    '\t{inventory', ...itemLines.map(l => '\t\t' + l), '\t\t{in_hands 0}', '\t}', '}', ''].join('\r\n');
}
// WPN-1: the one call into tools/wpn (weapon table). answers = the user's sheet read back (--wpn-answers); `have` = vanilla weapon names the donor's vfs has.
let WPN_ANSWERS = {};
function wpnRule(rW, dW, have) {
  const r = require('../wpn/wpn.js').decide(rW, { answers: WPN_ANSWERS, donorWeapon: dW });
  if (r.action === 'swap' && !have.has(r.as2)) return { action: 'none' };   // table target not in this vfs: old rule
  if (r.action === 'import') { const t = r.row.tmpl || r.row.as2; if (!t || !have.has(t) || !r.text()) return { action: 'none' }; r.tmpl = t; r.basis = r.basis + ' [WPN-1]'; }
  return r;
}
// SILENT-1F: every line of "<base> zenite" (with or without "ammo ") names the round ty instead, and the muzzle prop follows: a gun that no longer is AA. Both muzzles have no blastwave, so this changes no shot count (muzzle.inc)
const zeniteToRound = (text, base, ty) => text.replace(new RegExp('"((?:ammo\\s+)?)' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+zenite"', 'gi'), (m, pre) => `"${pre}${base} ${ty}"`).replace(/"muzzle_zenite"/gi, '"muzzle_minimum"');
// {extender "stuff" {item "x"}} item names of a weapon def
function stuffItems(src) {
  const out = [];
  (function w(n) {
    for (const k of n.items) {
      if (k.type !== 'block' && k.type !== 'list') continue;
      if (k.name === 'extender' && k.items[1] && /^"stuff"$/i.test(k.items[1].text)) for (const c of k.items) if (c.type === 'block' && c.name === 'item' && c.items[1]) out.push(c.items[1].text.replace(/^"|"$/g, ''));
      w(k);
    }
  })(sdlw.parse(Buffer.from(src, 'latin1')).root);
  return out;
}

function insideDir(p, dir) { const r = path.relative(path.resolve(dir), path.resolve(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); }

function main() {
  const a = process.argv.slice(2), o = { fmt: {}, args: {} };
  const sub = require('./extras').SUBS[a[0]];   // GOH2-FX: pot2lng | wav2story | anmswap (extras.js)
  if (sub) return sub(a.slice(1));
  const val = i => { if (i + 1 >= a.length) { console.error(a[i] + ' needs a value'); process.exit(2); } return a[i + 1]; };
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--goh') o.goh = val(i++); else if (x === '--base') (o.bases = o.bases || []).push(val(i++)); else if (x === '--entity') (o.entities = o.entities || []).push(val(i++)); else if (x === '--keys') o.keys = val(i++);
    else if (x === '--out') o.out = val(i++); else if (x === '--mod') { o.out = val(i++); o.mod = true; } else if (x === '--game') o.game = val(i++); else if (x === '--no-game') o.noGame = true; else if (x === '--nation') o.nation = val(i++); else if (x === '--max-files') o.max = parseInt(val(i++), 10) || 400;
    else if (x === '--dry-run') o.dry = true; else if (x === '--no-deps') o.noDeps = true; else if (x === '--deps') o.deps = true; else if (x === '--no-keylint') o.noKeylint = true; else if (x === '--no-names') o.noNames = true;
    else if (x === '--format') o.fmt.format = val(i++); else if (x === '-o') o.fmt.output = val(i++); else if (x === '--rc') o.fmt.rcFile = val(i++); else if (x === '--no-rc') o.fmt.noRc = true;
    else if (x === '-q') o.q = true;
    else if (x === '--text-only') o.textOnly = true;
    else if (x === '--entity-list') { let t; try { t = fs.readFileSync(val(i++), 'utf8'); } catch (e) { console.error('error: --entity-list: ' + e.message); process.exit(2); } for (const l of t.split(/\r?\n/)) if (l.trim()) (o.entities = o.entities || []).push(l.trim()); }
    else if (x === '--donor') o.donor = val(i++); else if (x === '--exe') o.exe = require('./target').exeArg('goh2as2', val(i++));
    else if (x === '--rep-key') o.repKey = true; else if (x === '--pull-props') o.pullProps = true; else if (x === '--mtl-fallback') o.mtlFallback = true; else if (x === '--lightmap-multiply') o.lightmapMultiply = true; else if (x === '--no-fit-pass') o.noFitPass = true; else if (x === '--allow-missing') o.allowMissing = true;   // FXC-1: rebuild-1 gaps 1+6, 4, 7
    else if (x === '--match-weapon') o.matchWeapon = true; else if (x === '--grenade-stuff') o.grenadeStuff = true;   // FXC-3: rebuild-1 gaps 5, 8
    // XLATE-2: translated values are written by default on --donor; asking per out-of-line value (engine limit, then AS2 scale) is on when stdin is a terminal or --ask-json is given
    else if (x === '--no-translate') o.noTranslate = true; else if (x === '--no-ask') o.noAsk = true; else if (x === '--ask-json') o.askJson = true; else if (x === '--answers') o.answers = val(i++);
    else if (x === '--no-wpn-table') o.noWpnTable = true; else if (x === '--wpn-answers') { try { WPN_ANSWERS = JSON.parse(fs.readFileSync(val(i++), 'utf8')); } catch (e) { console.error('error: --wpn-answers: ' + e.message); process.exit(2); } }   // WPN-1
    else if (x === '--no-stuff-pull') o.noStuffPull = true;   // T-STUFF: off = the old closure (no weapon/ammo/item tag pass)
    else if (x === '--drop-limits') o.dropLimits = true; else if (x === '--xlate-json') o.xlateJson = val(i++); else if (x === '--table') o.table = val(i++);
    else { console.error('unknown arg ' + x); process.exit(2); }
  }
  if (o.repKey && !o.donor) { console.error('--rep-key needs --donor'); process.exit(2); }
  if (o.matchWeapon && !o.donor) { console.error('--match-weapon needs --donor'); process.exit(2); }
  if (o.donor && (!o.entities || o.entities.length !== 1 || o.keys || !o.game)) { console.error('--donor needs exactly one --entity (the rep), --game, and no --keys'); process.exit(2); }
  if (o.bases && o.out) for (const b of o.bases) if (insideDir(o.out, b)) { console.error(`error: --out ${o.out} is inside a game install (${b}); refusing`); process.exit(2); }
  if (!o.goh || !o.out || (!o.entities && !o.keys)) { console.error('usage: ARSENAL goh2as2 --goh dir (--entity name | --keys file) (--out|--mod) dir [--game as2dir] [--no-game] [--base dir].. [--nation n] [--max-files N] [--dry-run] [--no-deps|--deps] [--no-keylint] [--no-names] [-q] [--format F] [-o file] [--rc F|--no-rc]\n  donor chain: --donor stem [--exe as64|mowas_2] [--rep-key] [--pull-props] [--mtl-fallback] [--match-weapon] [--grenade-stuff] [--lightmap-multiply] [--drop-limits] [--no-translate] [--no-ask|--ask-json|--answers F] [--xlate-json F] [--table F] [--no-wpn-table] [--wpn-answers F] [--no-fit-pass] [--allow-missing]\n  full list: ARSENAL goh2as2 --help'); process.exit(2); }
  // DOOR-CLEAN: a --goh / --base folder that is not there is named here (was a raw ENOENT scandir from buildIndex)
  for (const [flag, d] of [['--goh', o.goh], ...(o.bases || []).map(b => ['--base', b])]) {
    let isDir = false; try { isDir = fs.statSync(d).isDirectory(); } catch (e) { /* missing */ }
    if (!isDir) { console.error(`error: PORT_GOH_MISSING ${flag} ${d}: no such folder (give the Gates of Hell mod or resource folder)`); process.exit(2); }
  }
  // PORTREV (rev-port #4/#13): the default AS2 dir (env AS2_GAME, as2.json, Steam) also feeds the ASSET-1 texture rename and every vanilla check below; --no-game opts out
  if (o.noGame && o.game) { console.error('--no-game and --game exclude each other'); process.exit(2); }
  const as2 = o.noGame ? null : (o.game || require('../lib/gamedir').resolve().dir);
  if (o.donor && !as2) require('../lib/gamedir').missing('goh2as2 --donor');
  const TG = require('./target'), tgt = TG.targetOf(o.exe, as2);   // game parity: as64 | mowas2 (stuff view mods, mod.info range)
  // GOH2-FX (COV-L8G row): an AS2 mod folder <AS2>/mods/<name> is a valid --out/--mod; the rest of the install (vanilla data) and all of GoH stay refused.
  // Its real path (links followed, nearest existing folder) must stay in that mods folder too, so a link tree into GoH (gohfull) is refused.
  const modsOk = g => {
    const mods = path.join(g, 'mods'), r = path.relative(path.resolve(mods), path.resolve(o.out));
    if (!r || r.startsWith('..') || path.isAbsolute(r)) return false;
    let p = path.resolve(o.out); while (!fs.existsSync(p) && path.dirname(p) !== p) p = path.dirname(p);
    let real; try { real = fs.realpathSync(p); } catch { return false; }
    return insideDir(real, fs.realpathSync(mods)) && !(o.goh && insideDir(real, o.goh));
  };
  for (const g of [o.goh, as2].filter(Boolean)) if (insideDir(o.out, g) && !(g === as2 && modsOk(g))) { console.error(`error: --out ${o.out} is inside a game install (${g}); refusing (an AS2 mods/<name> folder is allowed)`); process.exit(2); }
  const rep = createReport();
  const idx = buildIndex(o.goh), baseOnly = new Set(), baseIdxs = [];
  // --base: lower-priority GoH tree (the install under a Workshop mod). A mod unit that leans on its base unit's files (kv8s -> kv1s start.anm) finds them there; the mod's own file wins on a clash. Only files the closure names are pulled, never the whole base folder.
  for (const b of o.bases || []) { const bi = buildIndex(b); baseIdxs.push(bi); for (const [k, v] of bi.map) if (!idx.map.has(k)) { idx.map.set(k, v); baseOnly.add(k); } }
  const want = new Map();   // vkey -> why
  // T-PORTGAP: owner = the unit (entity def key, or 'keys') a wanted file was first reached from; set on every want.set while curOwner is the file being followed
  const owner = new Map(); let curOwner = 'keys';
  want.set = function (k, v) { if (!owner.has(k)) owner.set(k, curOwner); return Map.prototype.set.call(this, k, v); };
  const addKey = (k, why) => { if (!want.has(k)) want.set(k, why); };
  const max = o.max || 400 * Math.max(1, (o.entities || []).length);   // T-PORTINC: the default cap is 400 per --entity; a shared 400 cut a 20-unit run's /properties chain silently-ish (WARN_PORT_CLOSURE_CAP below)
  for (const e of o.entities || []) {
    const q = e.toLowerCase().replace(/\\/g, '/').replace(/^resource\//, ''), hits = [];
    for (const k of idx.map.keys()) if (!baseOnly.has(k) && (k === q || (k.endsWith('.def') && (k.endsWith('/' + q + '.def') || k.endsWith('/' + q))))) hits.push(k);
    if (!hits.length) rep.add(e, 0, 'PORT_NOT_FOUND', 'no GoH def matches entity name');
    else { if (hits.length > 1) rep.info(e, 0, 'PORT_AMBIGUOUS', `${hits.length} defs match, converting all: ${hits.slice(0, 5).join(', ')}`); for (const h of hits) { curOwner = h; addKey(h, 'entity'); } }
  }
  curOwner = 'keys';
  // ---- --donor: the vanilla def (through the vfs), the rep's mdl folder. The rep's def itself and every .def/.ext stay out of the output.
  let donor = null;
  if (o.donor) {
    const stem = o.donor.toLowerCase().replace(/\\/g, '/').replace(/^.*\//, '').replace(/\.def$/, '');
    let vf; try { vf = vfsLib.build({ gameDir: as2, mods: [], exe: o.exe || undefined }); } catch (e) { console.error(`error: --donor: cannot build the vfs of ${as2}: ${e.message}`); process.exit(1); }
    const dk = [...vf.files.keys()].filter(k => /^resource\/entity\//.test(k) && k.endsWith('/' + stem + '.def')).sort();
    if (!dk.length) { console.error(`error: --donor ${o.donor}: no entity def "${stem}.def" in the vfs of ${as2}`); process.exit(1); }
    const repHits = [...want.keys()].filter(k => want.get(k) === 'entity').sort();
    if (!repHits.length) { console.error(`error: --donor: rep entity ${o.entities[0]} not found in the GoH data`); process.exit(1); }
    let rsrc; try { rsrc = decodeText(readEnt(idx.map.get(repHits[0]))).src; } catch (e) { console.error('error: --donor: cannot read the rep def: ' + e.message); process.exit(1); }
    const mk = mdlKeyOf(repHits[0], rsrc, idx);
    if (!mk) { console.error(`error: --donor: rep def ${repHits[0]} names no .mdl`); process.exit(1); }
    let vtext = vfsLib.readRec(vf.files.get(dk[0])).toString('latin1');
    const extRe = /\{\s*extension\s+"([^"\r\n]*\.mdl)"\s*\}/gi;
    // FXC-3 gap 9: a stub with no Extension (m1mortar: {game_entity (include "mortar.inc")}) is followed into its include, which is inlined in place (relative .ext/.inc refs made absolute); text not already a game_entity is wrapped
    for (let depth = 0; depth < 3 && ![...vtext.matchAll(extRe)].length; depth++) {
      const im = /[({]\s*include\s+"([^"\r\n]+)"[^\r\n]*?[)}]/i.exec(vtext);
      if (!im) break;
      const t = im[1].replace(/\\/g, '/'), ibase = depth === 0 ? dk[0].slice(0, dk[0].lastIndexOf('/')) : dk[0].slice(0, dk[0].lastIndexOf('/'));
      const ik = names.resolve(t, ibase).key.toLowerCase();
      if (!vf.files.has(ik)) break;
      const idir = ik.slice(0, ik.lastIndexOf('/'));
      const inc = vfsLib.readRec(vf.files.get(ik)).toString('latin1').replace(/"([^"\r\n]+\.(?:ext|inc))"/gi, (m, tok) => {
        const tt = tok.replace(/\\/g, '/');
        if (tt.startsWith('/') || tt.startsWith('$/')) return m;
        const kk = names.resolve(tt, idir).key.toLowerCase();
        return vf.files.has(kk) ? '"/' + kk.replace(/^resource\//, '') + '"' : m;
      });
      vtext = vtext.slice(0, im.index) + inc + vtext.slice(im.index + im[0].length);
      rep.info(dk[0], 0, 'PORT_DONOR_STUB_FOLLOWED', `donor ${dk[0]} has no Extension: include ${ik} inlined (FXC-3 gap 9)`);
    }
    if (![...vtext.matchAll(extRe)].length) { /* falls through to the old error below */ }
    else if (!/^\s*(;[^\r\n]*\r?\n\s*)*\{\s*game_entity\b/i.test(vtext)) vtext = '{game_entity\r\n' + vtext.replace(/\s+$/, '') + '\r\n}\r\n';
    const exm = [...vtext.matchAll(extRe)].pop();
    if (!exm) { console.error(`error: --donor: ${dk[0]} has no {Extension "....mdl"}`); process.exit(1); }
    const vExt = exm[1].replace(/\\/g, '/'), repMdl = mk.slice(mk.lastIndexOf('/') + 1);
    const folderKey = names.resolve(vExt, dk[0].slice(0, dk[0].lastIndexOf('/'))).key.toLowerCase();   // 'resource/entity/x/van.mdl'
    // PORT-133: a towed gun = PatherID cannon/mortar/gun/howitzer in the vanilla def, or the def sits under /-vehicle/cannon/ (all 25 such PatherID defs do [V count])
    const gun = /patherid\s+"(cannon|mortar|gun|howitzer)/i.test(vtext) || /\/-vehicle\/cannon\//.test(dk[0]);
    donor = { stem, gun, defKey: dk[0], text: vtext, exm, newExt: vExt.slice(0, vExt.lastIndexOf('/') + 1) + repMdl, repDir: mk.slice(0, mk.lastIndexOf('/')), destDir: folderKey.slice('resource/'.length, folderKey.lastIndexOf('/')), mk, repKey: repHits[0], vmdl: folderKey };
    donor.vf = vf; donor.repSrc = rsrc;
    if (o.repKey) {   // FXC-1 gap 1: the unit is the rep's own, in a rep-named folder; the vanilla donor key is never written
      donor.repName = safeName(o.entities[0].replace(/\\/g, '/').replace(/^.*\//, '').replace(/\.def$/, '')).toLowerCase();
      donor.destDir = 'entity/' + donor.repName;
    }
    if (dk.length > 1) rep.add(dk[0], 0, 'WARN_PORT_DONOR_AMBIGUOUS', `${dk.length} defs named ${stem}.def in the vfs, used ${dk[0]}: ${dk.slice(1, 4).join(', ')}`);
    for (const h of repHits) want.delete(h);
    curOwner = repHits[0];
    for (const k of idx.map.keys()) {   // the rep's mdl folder, files directly in it; subfolders come in by reference
      if (k.slice(0, k.lastIndexOf('/')) === donor.repDir && !/\.(def|ext)$/.test(k)) addKey(k, 'donor folder');
    }
    curOwner = 'keys';
  }
  const donorKey = k => donor && (k === donor.repDir || k.startsWith(donor.repDir + '/')) ? donor.destDir + k.slice(donor.repDir.length) : k;
  if (o.keys) for (const l of fs.readFileSync(o.keys, 'utf8').split(/\r?\n/)) {
    const k = l.replace(/(^|\s)#.*/, '').trim().toLowerCase().replace(/\\/g, '/').replace(/^resource\//, '');   // a # inside a name is part of it: GoH has material_#1045.mtl (PORTREV rev-port #11: this chain used to sit inside the comment)
    if (!k) continue;
    if (idx.map.has(k)) addKey(k, 'key'); else rep.add(k, 0, 'PORT_NOT_FOUND', 'key not in GoH data');
  }
  const fxSeen = new Set(), fxStat = { pulled: 0, as2: 0, missing: 0 };   // GOH2-FX sprite refs
  const sharedProps = new Map(), mtlFallback = new Map(), ebmGone = new Map();   // ebmGone: ebm key -> Frame lines whose texture neither GoH nor AS2 has
  // PORT-47 refinement [I]: with --game, a /properties file the AS2 vfs lacks cannot override anything, so it is copied (includes followed); a path AS2 has keeps the old rule
  if (!(as2 && fs.existsSync(as2))) console.error(`WARN_PORT_NO_GAME ${o.noGame ? '--no-game given' : as2 ? 'AS2 dir ' + as2 + ' does not exist' : 'no AS2 dir found (--game, AS2_GAME, as2.json, Steam)'}: GoH textures keep their own keys (ASSET-1 rename off), no vanilla checks, infantry weapons written as pattern stubs`);
  const renDefs = new Map();   // PORTREV: PROP_NAMES key -> {goh, as2, gohDefs, as2Defs}
  const renamedIncludes = src => {
    const out = [];
    for (const m of String(src).matchAll(/properties\/((?:[a-z0-9_]+\/)*[a-z0-9_]+\.(?:ext|inc))/gi)) {
      const n = m[1].toLowerCase(); if (!PROP_NAMES[n]) continue;
      if (!renDefs.has(n)) {
        let g = null, a = null;
        try { const e = idx.map.get('properties/' + n); if (e) g = decodeText(readEnt(e)).src; } catch { g = null; }
        try { const e = as2idx && as2idx.map.get('properties/' + PROP_NAMES[n]); if (e) a = decodeText(readEnt(e)).src; } catch { a = null; }
        renDefs.set(n, { goh: n, as2: PROP_NAMES[n], gohDefs: definesOf(g), as2Defs: as2idx ? definesOf(a) : null });
      }
      if (!out.includes(renDefs.get(n))) out.push(renDefs.get(n));
    }
    return out;
  };
  const as2idx = as2 && fs.existsSync(as2) ? buildIndex(as2) : null, propsCopied = new Map(), propsRejected = new Map(), propsShadow = new Map();
  // PORT-47 refinement [I]: a GoH /properties file AS2 also has can't sit at its own path, but the entity needs its macros (t3457_41: 9 undefined, fatal PORT-62). So it goes to properties/goh/, overriding nothing, and includes are rewritten.
  const propShadowable = c => {
    if (!as2idx || propRename(c) || !as2idx.map.has(c) || propsRejected.has(c)) return false;
    try { if (isText(c) && /\{\s*NoVisibilityPatch\b/i.test(decodeText(readEnt(idx.map.get(c))).src)) { propsRejected.set(c, 'NoVisibilityPatch'); return false; } } catch { return false; }
    return true;
  };
  const propPathFix = (s, k) => {   // quoted paths into /properties become absolute output paths; a shadowed file's relative includes need that too
    const dir = k.slice(0, k.lastIndexOf('/'));
    return s.replace(/"([^"\r\n]+\.[a-z0-9]+)"/gi, (m, tok) => {
      const t = tok.replace(/\\/g, '/').toLowerCase(), c = norm(t.startsWith('/') ? t.slice(1) : dir + '/' + t);
      if (propsShadow.has(c)) return '"/' + propsShadow.get(c) + '"';
      // T-PORTINC: a shadowed file now sits in properties/goh/, so its relative include/path into /properties (abm.inc, vehicle.ext: as64 has them, nothing copied) dangles; made absolute when pulled, in as64, or in GoH
      if (propsShadow.has(k) && isSharedProp(c) && /\.(ext|inc)$/.test(t)) {
        if (want.has(c) || (as2idx && as2idx.map.has(c))) return '"/' + c + '"';
        if (idx.map.has(c)) { rep.add('resource/' + k, 0, 'WARN_PORT_INCLUDE_NOT_PULLED', `T-PORTINC include "${tok}" -> ${c} is in GoH but was not pulled (closure cap --max-files ${max}?): the shadowed file dangles [I]`); return '"/' + c + '"'; }
        rep.add('resource/' + k, 0, 'WARN_PORT_INCLUDE_MISSING', `T-PORTINC include "${tok}" -> ${c} is in neither GoH nor as64: the file dangles at load [I]`); return m;
      }
      return propsShadow.has(k) && isSharedProp(c) && want.has(c) ? '"/' + c + '"' : m;
    });
  };
  const propCopyable = c => {
    if (!as2idx) return false;
    if (propRename(c) || as2idx.map.has(c) || propsRejected.has(c)) return false;
    if (!isText(c)) return true;   // GOHFIX: a props .ebm/.dds (selection sprite frame) has no keys to reject
    try { if (/\{\s*NoVisibilityPatch\b/i.test(decodeText(readEnt(idx.map.get(c))).src)) { propsRejected.set(c, 'NoVisibilityPatch'); return false; } } catch { return false; }
    return true;
  };
  // T-STUFF state (helpers inside the closure block): stuff tags the defs name, as64 / pulled / missing; gap rows for missing ones; weapon names to write as "weapon <name>"
  const stuffSt = { tags: new Set(), as64: new Set(), pulled: new Set(), missing: new Set() }, stuffMissingGaps = [], weaponQuote = new Set(), stuffPorted = new Map(), ammoFixed = new Map(), preGaps = new Map();   // preGaps (NAT-GAP): resource key -> gap entries of edits made before the write loop (stuff name checks, def ammo family); ammoFixed: T-PORTLOAD def text with ammo mapped to the gun's family
  // closure
  if ((o.entities && !o.noDeps) || o.deps) {
    let defByName = null, as2Defs = null; const placeSeen = new Set();   // SCEN-FIX rule 1 helpers
    const queue = [...want.keys()];   // XLATE-5: in push below, AS2 has no damage_components.ext and the mdl names it, so --donor pulls that one without --pull-props
    // ---- T-STUFF (PORT-121/165/187): the engine finds weapon/ammo/item Stuff by FILE-NAME tags, never by include, so the file closure above never reached set/stuff.
    // Every {weapon "t"} / {item "t"} / filling "t" a def names must resolve in as64 (kept), or the GoH entry is pulled (macros expanded from GoH .presets, its from/pattern/filling chain with it), or WARN_PORT_STUFF_MISSING + a hand gap.
    // A tag whose chain cannot be completed is not pulled at all: a half-ported stuff file is fatal at boot for every game that mounts the mod (PORT-26). Needs --game (as64 side); off with --donor (its weapon swap owns that).
    const STUFF_ON = !!as2idx && !donor && !o.noStuffPull;
    let sxA = null, sxG = null, as64read = null, sxDone = new Map(), as64Curves = new Set(), as64Cursors = new Set(), as64Sounds = new Set(), as64Ents = new Set(), as64Keys = new Set();   // T-PORTLOAD: as64 set/ballistics.set curve names, /interface/cursor names (no ext)
    const SN = require('./stuffnames');
    const mkSx = keys => { const files = new Map(), by = new Map(); for (const k of keys) { if (!k.startsWith('set/stuff/') || k.endsWith('/.presets') || /\/_settings\//.test(k) || /\.(fsm|hand)$/.test(k)) continue; const tg = new Set(k.slice(k.lastIndexOf('/') + 1).toLowerCase().split('.').filter(Boolean)); files.set(k, tg); for (const t of tg) { if (!by.has(t)) by.set(t, []); by.get(t).push(k); } } return { files, by }; };
    const getSxA = () => {
      if (sxA) return sxA; let keys;
      try { const vf = vfsLib.build({ gameDir: as2, mods: TG.stuffMods(tgt), exe: o.exe || undefined }); as64read = k => { const r = vf.files.get('resource/' + k); return r ? vfsLib.readRec(r).toString('latin1') : null; }; keys = [...vf.files.keys()].map(k => k.replace(/^resource\//, '').toLowerCase()); }
      catch (e) { as64read = k => { const e2 = as2idx.map.get(k); return e2 ? readEnt(e2).toString('latin1') : null; }; keys = [...as2idx.map.keys()]; }
      as64Curves = SN.curvesOf(as64read('set/ballistics.set'));
      for (const k of keys) if (k.startsWith('interface/cursor/')) { const n = k.slice(17); as64Cursors.add(n.replace(/\.[a-z0-9]+$/, '')); as64Cursors.add(n); }
      for (const k of keys) if (k.startsWith('sound/weapon/')) { as64Sounds.add(k.replace(/\.[a-z0-9]+$/, '')); for (let i = k.lastIndexOf('/'); i > 13; i = k.lastIndexOf('/', i - 1)) as64Sounds.add(k.slice(0, i)); }   // T-PORTLOAD r3: files (no ext) + folders
      for (const k of keys) { as64Keys.add(k); as64Keys.add(k.replace(/\.[a-z0-9]+$/, '')); const m = /^entity\/.*\/([^/]+)\.def$/.exec(k); if (m) as64Ents.add(m[1]); }   // T-PORTLOAD r3: ammo {view}/{tail} names
      return sxA = mkSx(keys);
    };
    const getSxG = () => sxG || (sxG = mkSx([...idx.map.keys()]));
    const hitsOf = (sx, w) => { const ws = w.toLowerCase().split(/\s+/).filter(Boolean); if (!ws.length) return []; let cand = null; for (const t of ws) { const l = sx.by.get(t); if (!l) return []; if (!cand || l.length < cand.length) cand = l; } return cand.filter(k => { const tg = sx.files.get(k); return !tg.has('pattern') && ws.every(t => tg.has(t)); }); };
    const clashed = (sx, w, hits) => { const ws = w.toLowerCase().split(/\s+/); return !ws.includes('weapon') && !ws.includes('ammo') && hits.some(k => sx.files.get(k).has('ammo')); };   // PORT-165: a bare weapon name an ammo file also carries is found as the ammo
    const patHits = (sx, nm) => (sx.by.get(nm) || []).filter(k => sx.files.get(k).has('pattern'));
    const strOf = x => x && x.type === 'string' ? x.text.replace(/^"|"$/g, '') : null;
    const stuffRefs = (src, isStuff) => {
      const out = [], root = sdlw.parse(Buffer.from(src.replace(/\r\n/g, '\n'), 'latin1')).root;
      const add = (kind, tag) => { tag = (tag || '').trim(); if (tag.length >= 2 && /[a-z]/i.test(tag) && !tag.includes('%')) out.push({ kind, tag }); };
      (function w(n, anc) {
        for (const k of n.items) {
          if (k.type !== 'block') continue;
          const nm = String(k.name || '').toLowerCase(), a1 = strOf(k.items[1]);
          if (!isStuff) {
            if (nm === 'weapon' && a1 && !k.items.some(x => x.type === 'block' && /^mask$/i.test(String(x.name)))) add('weapon', a1);   // {weapon "mgun" {mask ..}} in an inventory is a slot filter, not a lookup
            if (nm === 'item' && a1 && anc.some(a => a === 'box' || a === 'inventory' || a === 'extender')) add('item', a1);
            if (nm === 'weapon' || nm === 'item') for (let i = 1; i < k.items.length - 1; i++) if (k.items[i].type === 'atom' && /^filling$/i.test(k.items[i].text) && strOf(k.items[i + 1])) add('filling', strOf(k.items[i + 1]));
          } else {
            if (nm === 'filling' && a1) add('filling', a1);
            if (nm === 'from' && a1) { if (/^pattern\s/i.test(a1)) add('pattern', a1.replace(/^pattern\s+/i, '')); else add('from', a1); }
            if (nm === 'entity' && a1) add('entity', a1);
          }
          w(k, anc.concat(nm === 'extender' && strOf(k.items[1]) ? ['extender'] : [nm]));
        }
      })(root, []);
      return out;
    };
    const ensureDefNames = () => { if (!defByName) { defByName = new Map(); for (const ek of idx.map.keys()) if (/^entity\/.*\.def$/.test(ek)) { const b = ek.slice(ek.lastIndexOf('/') + 1, -4); if (!defByName.has(b)) defByName.set(b, []); defByName.get(b).push(ek); } } if (!as2Defs) { as2Defs = new Set(); for (const ek of as2idx.map.keys()) if (/^entity\/.*\.def$/.test(ek)) as2Defs.add(ek.slice(ek.lastIndexOf('/') + 1, -4)); } };
    const stuffBad = new Map(), stuffBusy = new Set();
    const stuffFile = (fk, plan, miss) => {   // one GoH stuff file + everything its chain needs; false = not pullable (reason in miss)
      if (want.has(fk) || plan.has(fk) || stuffBusy.has(fk)) return true;
      if (stuffBad.has(fk)) { miss.push(`${fk}: ${stuffBad.get(fk)}`); return false; }
      stuffBusy.add(fk);
      const fail = why => { stuffBad.set(fk, why); miss.push(`${fk}: ${why}`); stuffBusy.delete(fk); return false; };
      let src; try { src = decodeText(readEnt(idx.map.get(fk))).src; } catch (e) { return fail('unreadable'); }
      const SPt = require('./stuffport'), dir = fk.slice(0, fk.lastIndexOf('/')), gread = x => { const e = idx.map.get(x); return e ? readEnt(e).toString('latin1') : null; };
      getSxA();
      // T-PORTLOAD: a GoH stuff file at a key as64 already has (e.g. a pattern) is not written over it: as64's file stays and is the chain
      if (as64read(fk) != null) { rep.info('resource/' + fk, 0, 'PORT_STUFF_KEEP_AS64', `T-PORTLOAD as64 has ${fk}: kept, the GoH file is not pulled over it`); stuffBusy.delete(fk); return true; }
      const r = SPt.port(src, SPt.parseDefines(gread(dir + '/.presets') || '', gread), SPt.parseDefines(as64read(dir + '/.presets') || '', as64read), { isAmmo: /\.(ammo|pattern)$/.test(fk) || /^set\/stuff\/shell\//.test(fk) });
      const mm = [...new Set(r.log.filter(l => l.how === 'MISSING').map(l => l.name))];
      if (mm.length) return fail(`calls macro ${mm.slice(0, 3).map(x => '("' + x + '")').join(' ')} that neither GoH .presets nor as64 defines`);
      { const hasCur = as64Cursors.size ? n => as64Cursors.has(n.toLowerCase().replace(/\\/g, '/')) : null, hasSnd = as64Sounds.size ? k => as64Sounds.has(k) : null, hasView = as64Ents.size ? n => { n = n.toLowerCase().replace(/\\/g, '/'); return n.startsWith('/') ? as64Keys.has(n.slice(1)) : as64Ents.has(n); } : null;
        // T-PORTLOAD: curve/cursor/sound/view names checked against as64. NAT-GAP: one checker per call (same order as checkStuff), so each removal is its own gap entry
        const steps = [[[as64Curves, null, null, null], STUFF_NAME_DROPS.curve], [[null, hasCur, null, null], STUFF_NAME_DROPS.cursor], [[null, null, hasSnd, null], STUFF_NAME_DROPS.sound], [[null, null, null, hasView], STUFF_NAME_DROPS.view]], pg = [];
        for (const [args, why] of steps) {
          if (!args.some(Boolean)) continue;
          const pre = r.text, cs = SN.checkStuff(pre, ...args); r.text = cs.text;
          for (const l of cs.log) { if (/^WARN_/.test(l.code)) rep.add('resource/' + fk, 0, l.code, 'T-PORTLOAD ' + l.msg); else rep.info('resource/' + fk, 0, l.code, 'T-PORTLOAD ' + l.msg); }
          if (pre !== cs.text) for (const g of stuffNameGaps(pre, cs.text, fk, cs.log, why)) pg.push(g);
        }
        if (pg.length) preGaps.set(fk, pg); }
      for (const ref of stuffRefs(r.text, true)) { const oc = resolveRef(ref, fk, plan, miss); if (oc === 'missing') return fail(`chain ${ref.kind} "${ref.tag}" does not resolve`); }
      plan.set(fk, 'stuff by tag (T-STUFF)'); stuffPorted.set(fk, r.text); stuffBusy.delete(fk); return true;
    };
    // outcome: 'as64' (kept) | 'pulled' (planned) | 'missing'
    const resolveRef = (ref, fromKey, plan, miss) => {
      const tag = ref.tag.toLowerCase(), A = getSxA(), G = getSxG();
      if (ref.kind === 'entity') {   // non-blocking: spawn-time, not boot
        ensureDefNames(); const nm = tag.replace(/\\/g, '/').replace(/\.def$/, '').replace(/^.*\//, '');
        if (as2Defs.has(nm)) return 'as64';
        const c = (defByName.get(nm) || []).slice().sort();
        if (!c.length) { rep.add('resource/' + fromKey, 0, 'WARN_PORT_STUFF_ENTITY_MISSING', `T-STUFF {entity "${ref.tag}"} of a pulled stuff file has no def in GoH or as64 [I: spawn-time failure, not boot]`); return 'as64'; }
        plan.set(c[0], 'entity of stuff ' + fromKey); return 'pulled';
      }
      if (ref.kind === 'pattern') {
        if (patHits(A, tag).length) return 'as64';
        const gh = patHits(G, tag).sort(); if (!gh.length) { miss.push(`pattern "${tag}" is in neither as64 nor GoH`); return 'missing'; }
        const same = gh.find(x => x.slice(0, x.lastIndexOf('/')) === fromKey.slice(0, fromKey.lastIndexOf('/'))) || gh[0];
        return stuffFile(same, plan, miss) ? 'pulled' : 'missing';
      }
      const isW = ref.kind === 'weapon' || ref.kind === 'from';
      let ah = hitsOf(A, tag);
      if (isW && clashed(A, tag, ah)) { if (hitsOf(A, 'weapon ' + tag).length) { weaponQuote.add(tag); return 'as64'; } ah = []; }
      if (ah.length) return 'as64';
      let gh = hitsOf(G, tag);
      if (isW && clashed(G, tag, gh)) { const gw = hitsOf(G, 'weapon ' + tag); if (gw.length) { weaponQuote.add(tag); gh = gw; } else { miss.push(`bare "${tag}" is also an ammo file name and no ${tag}.weapon file exists (PORT-165)`); gh = []; } }
      if (!gh.length) { if (!miss.length) miss.push(`no Stuff file name in as64 or GoH carries all of: ${tag}`); return 'missing'; }
      let ok = false; for (const h of gh.slice().sort().slice(0, 8)) if (stuffFile(h, plan, miss)) ok = true;
      return ok ? 'pulled' : 'missing';
    };
    // T-PORTLOAD: family word of a gun's own {filling} chain (as64 file first, as resolveRef keeps as64 names; then GoH), null = not read
    const gunFamily = (tag, hop = 0) => {
      if (hop > 6) return null;
      const A = getSxA(), G = getSxG(), gr = x => { const e = idx.map.get(x); return e ? readEnt(e).toString('latin1') : null; };
      const pick = (sx, rd) => { for (const h of hitsOf(sx, tag).filter(x => !sx.files.get(x).has('ammo')).sort()) { const t = rd(h); if (t != null) return t; } return null; };
      let t = pick(A, as64read); if (t == null) t = pick(G, gr); if (t == null) return null;
      t = t.replace(/;[^\n]*/g, '');
      const f = /\{\s*filling\s+"([^"]+)"/i.exec(t); if (f) return SN.famOf(f[1]);
      const fr = /\{\s*from\s+"([^"]+)"/i.exec(t); return fr && !/^pattern\s/i.test(fr[1]) ? gunFamily(fr[1], hop + 1) : null;
    };
    const stuffOfDef = (k, src) => {
      if (!STUFF_ON || !/^(def|ext|inc)$/.test(extOf(k))) return;
      if (/\bfilling\s+"/i.test(src)) {   // T-PORTLOAD: def ammo of another family than the gun fills -> as64 rounds of the gun's family (before the stuff refs, so the GoH rounds are not pulled)
        const A = getSxA(), fx = SN.fixAmmoFamily(src, gunFamily, tags => hitsOf(A, tags).some(x => A.files.get(x).has('ammo')));
        if (fx.text !== src) {   // NAT-GAP: a box item commented out here is a gap entry of the def
          const drops = fx.log.filter(l => l.code === 'WARN_PORT_AMMO_ITEM_DROPPED').map(l => l.msg.replace(/;.*$/, ''));
          const g = textStepGap(src, fx.text, k, 'WARN_PORT_AMMO_ITEM_DROPPED', `NAT-GAP [V, T play] the engine reloads a gun only with rounds matching its own {filling} tags; this box round's family is mapped onto the gun's and as64 has no round of that type, so no item carries it: dropped${drops.length ? ': ' + drops.join('; ') : ''}`);
          if (g) preGaps.set(k, [g]);   // once per def (the closure reads each key once; a set, so a re-read cannot double it)
          ammoFixed.set(k, fx.text); src = fx.text; }
        for (const l of fx.log) { if (/^WARN_/.test(l.code)) rep.add('resource/' + k, 0, l.code, 'T-PORTLOAD ' + l.msg); else rep.info('resource/' + k, 0, l.code, 'T-PORTLOAD ' + l.msg); }
      }
      let refs; try { refs = stuffRefs(src.replace(/^[ \t]*;[^\r\n]*/gm, ''), false); } catch (e) { return; }
      for (const ref of refs) {
        const id = ref.kind + ':' + ref.tag.toLowerCase(); let oc = sxDone.get(id);
        if (!oc) {
          const plan = new Map(), miss = []; oc = { r: resolveRef(ref, k, plan, miss), miss }; sxDone.set(id, oc);
          if (oc.r !== 'missing') for (const [c, w] of plan) if (!want.has(c) && want.size < max) { want.set(c, w + ' for "' + ref.tag + '" of ' + k); queue.push(c); if (/^set\/stuff\//.test(c)) rep.info('resource/' + c, 0, 'PORT_STUFF_PULLED', `T-STUFF [T] pulled for ${ref.kind} "${ref.tag}" named by ${k}: GoH macros expanded, GoH numbers NOT scaled to as64 (goh2as2 stuffport --scale-damage does that)`); }
        }
        stuffSt.tags.add(id); stuffSt[oc.r === 'missing' ? 'missing' : oc.r].add(id);
        if (oc.r === 'missing') { const why = `T-STUFF PORT-121 [V, I fix] ${ref.kind} "${ref.tag}" has no Stuff entry in as64 and none could be pulled from GoH (${oc.miss.slice(0, 2).join('; ') || 'no match'}): the game logs "No Stuff found for tags" and crashes in ; write the entry by hand or swap the weapon`; rep.add('resource/' + k, 0, 'WARN_PORT_STUFF_MISSING', why); stuffMissingGaps.push({ file: k, line: 0, kind: 'hand', code: 'WARN_PORT_STUFF_MISSING', key: ref.kind, paths: [], reason: why }); }
      }
    };
    while (queue.length && want.size < max) {
      const k = queue.shift(), dir = k.slice(0, k.lastIndexOf('/')), stem = k.slice(0, k.lastIndexOf('.'));
      curOwner = owner.get(k) || 'keys';
      const push = (c, why) => { if (donor && /\.(def|ext)$/.test(c) && !(extOf(k) === 'mdl' && /^properties\/[^/]+\.ext$/.test(c) && (o.pullProps || /^properties\/damage_components[^/]*\.ext$/.test(c)))) return; if (isSharedProp(c)) { if (propCopyable(c)) { if (!want.has(c) && want.size < max) { want.set(c, 'props copied (absent from AS2) for ' + k); propsCopied.set(c, k); queue.push(c); } return; } if (propShadowable(c)) { if (!want.has(c) && want.size < max) { want.set(c, 'props shadowed for ' + k); propsShadow.set(c, 'properties/goh/' + c.slice('properties/'.length)); queue.push(c); } return; } if (!sharedProps.has(c)) sharedProps.set(c, k); return; } if (!want.has(c) && want.size < max) { want.set(c, why); queue.push(c); } };
      if (extOf(k) === 'def' || extOf(k) === 'ext' || extOf(k) === 'mdl') for (const x of SIB_EXT) if (idx.map.has(stem + '.' + x)) push(stem + '.' + x, 'sibling of ' + k);
      if (extOf(k) === 'ply') {   // MESH/SUBM chunks name their .mtl (and texture names when no material); a missing one is PLY_MTL_MISSING, a load-time crash (FMT-03)
        let r; try { r = meshRefs(readEnt(idx.map.get(k))); } catch { continue; }
        for (const m of r.mtls) {
          const c = names.resolve(m, 'resource/' + dir).key.replace(/^resource\//, '').toLowerCase();
          if (!/\.mtl$/.test(c)) continue;
          if (idx.map.has(c)) push(c, 'material of ' + k);
          else if (o.mtlFallback) {   // FXC-1 gap 7 (PORT-131 crash class): the donor's same-name mtl, else a stub, written where the ply names it
            const bn = c.slice(c.lastIndexOf('/') + 1), dv = donor && donor.vf ? [...donor.vf.files.keys()].filter(x => x.endsWith('/' + bn)).sort() : [];
            if (dv.length) { mtlFallback.set(c, { buf: vfsLib.readRec(donor.vf.files.get(dv[0])), from: dv[0] }); rep.add('resource/' + k, 0, 'WARN_PORT_MTL_FALLBACK', `mesh names material ${JSON.stringify(m)} -> ${c}: not in GoH data; donor's ${dv[0]} copied there instead (look is the donor's) [I]`); }
            else { mtlFallback.set(c, { buf: Buffer.from('{material\r\n}\r\n', 'latin1'), from: null }); rep.add('resource/' + k, 0, 'WARN_PORT_MTL_FALLBACK', `mesh names material ${JSON.stringify(m)} -> ${c}: not in GoH data, no donor mtl of that name; empty stub material written (untextured) [I]`); }
          } else rep.add('resource/' + k, 0, 'WARN_PORT_MISSING_REF', `mesh names material ${JSON.stringify(m)} -> ${c}: not in GoH data, binhdr will flag PLY_MTL_MISSING`);
        }
        for (const t of r.tex) { const x = resolveTok({ s: t, q: true, key: 'texture' }, dir, idx.map); if (x) push(x, 'texture of ' + k); }
        continue;
      }
      if (extOf(k) === 'ebm') {   // FXD-3 rule 2: an .ebm is SDL {bitmap ... {Frame "..."}}; each frame texture is pulled from GoH, else must be in vanilla AS2, else the frame (all frames: the ebm) is dropped [V crash: missing frame is fatal at first load]
        // GOH2-FX: ';' comment lines skipped; {reference "x"} followed like a frame; a frame/reference .ebm is queued, so nested ones follow too (cov-l8i: 213 hand-ported frames)
        let b; try { b = ebmLive(readEnt(idx.map.get(k)).toString('latin1')); } catch { continue; }
        for (const m of b.matchAll(/\{\s*reference\s+"([^"\r\n]+)"/gi)) {
          const x = resolveTok({ s: m[1], q: true, key: 'texture' }, dir, idx.map);
          if (x) push(x, 'reference of ' + k); else if (!(as2idx && resolveTok({ s: m[1], q: true, key: 'texture' }, dir, as2idx.map))) rep.add('resource/' + k, 0, 'WARN_PORT_EBM_REF_MISSING', `GOH2-FX {reference "${m[1]}"} is in neither GoH nor AS2: the texture fails at load [I]`);
        }
        for (const m of b.matchAll(/\{\s*Frame\s+"([^"\r\n]+)"[^}\r\n]*\}/gi)) {
          const tk = { s: m[1], q: true, key: 'texture' }, x = resolveTok(tk, dir, idx.map);
          if (x) push(x, 'frame of ' + k);
          else if (as2idx && resolveTok(tk, dir, as2idx.map)) continue;
          else { if (!ebmGone.has(k)) ebmGone.set(k, []); ebmGone.get(k).push(m[0]); }
        }
        continue;
      }
      if (!isText(k)) continue;
      let src; try { src = decodeText(readEnt(idx.map.get(k))).src; } catch { continue; }
      if (extOf(k) === 'mdl') for (const a of implicitAnms(src)) { const c = norm(dir + '/' + a + '.anm'); if (idx.map.has(c)) push(c, 'sequence in ' + k); else rep.add(k, 0, 'WARN_PORT_ANM_MISSING', `sequence "${a}" has no ${a}.anm in GoH: AS2 stops with Resource not found at preload`); }
      for (const tok of tokens(src, extOf(k) === 'mtl')) { const r = resolveTok(tok, dir, idx.map); if (r) push(r, 'ref from ' + k); }
      if (!/^set\//.test(k)) stuffOfDef(k, src);   // T-STUFF: weapon/ammo/item tags -> as64 / pulled / WARN_PORT_STUFF_MISSING
      // GOH2-FX: an fx def's {sprite "$/x"} names texture/fx/x (cov-l8i [V]: the GoH muzzle fx loaded texture/fx/explosion/... at fire), "/texture/.." is rooted.
      // Lookup ebm, tex, dds, tga, ... A sprite vanilla AS2 has (any of those) is left to AS2; else GoH's is pulled and an .ebm's frames follow above. Gated to entity/fx/.
      if (/^entity\/fx\//.test(k) && /^(def|ext|inc)$/.test(extOf(k))) for (const sm of src.matchAll(/\{\s*(?:##\+?\s*)?sprite\s+"(\$\/[^"\r\n]+|\/texture\/[^"\r\n]+)"/gi)) {
        const s = sm[1].trim().toLowerCase().replace(/\\/g, '/'), base = norm(s.startsWith('$/') ? 'texture/fx/' + s.slice(2) : s.slice(1));
        if (fxSeen.has(base)) continue; fxSeen.add(base);
        const cands = BIN_TEX.has(extOf(base)) ? [base] : IMG_EXT.map(e => base + '.' + e);
        if (as2idx && cands.some(c => as2idx.map.has(c))) { fxStat.as2++; continue; }
        const hit = cands.find(c => idx.map.has(c));
        if (hit) { fxStat.pulled++; push(hit, 'fx sprite of ' + k); }
        else { fxStat.missing++; rep.add('resource/' + k, 0, 'WARN_PORT_FX_TEX_MISSING', `GOH2-FX {sprite "${sm[1]}"} -> ${base}: in neither GoH${as2idx ? ' nor vanilla AS2' : ''}: the fx loads a missing texture [I]`); }
      }
      // SCEN-FIX rule 2 (PORT-172): {Sprite "x.mtl"} of a stamp or bush def (entity/landscape/**, entity/flora/**, entity/service/** for the flag and ammo-point decals) names a sibling .mtl/.ebm that no REF_KEYS key reached; a missing one
      // died in on valley [V SCEN-G r1, I link]. Gated by path: a Sprite in a unit's selection .inc would add files to unit builds, which must keep their bytes.
      // What the mtl names (ply, textures) follows by the normal rules once it is queued.
      // MAPFILL: an .mdl SpriteView LOD holds {Sprite "x.mtl"} too (GoH bush_euro2, losheim_gap: closure check "branches_lod3.mtl IN GoH, NOT PULLED")
      // GOHFIX: also a pulled (copied, AS2-absent) /properties file: selection/vehicle_big_active.inc {Sprite "vehicle_big_selected.ebm"} was "IN GoH, NOT PULLED"
      // (dcgdefs [V]). A sprite AS2 has at that key is left to AS2 (a GoH copy would replace AS2's picture for every vanilla user). ';' lines name nothing.
      const propSprite = /^properties\//.test(k);
      if ((propSprite || /^entity\/(landscape|flora|service)\//.test(k)) && /^(def|ext|inc|mdl)$/.test(extOf(k))) for (const sm of src.replace(/^[ \t]*;[^\r\n]*/gm, '').matchAll(/\{\s*Sprite\s+"([^"\r\n]+)"/gi)) {
        if (propSprite && as2idx && resolveTok({ s: sm[1], q: true, key: 'sprite' }, dir, as2idx.map)) continue;
        let sk = resolveTok({ s: sm[1], q: true, key: 'sprite' }, dir, idx.map);
        if (!sk && !extOf(sm[1].toLowerCase())) for (const e of ['mtl', 'ebm']) if (!sk && idx.map.has(norm(dir + '/' + sm[1].toLowerCase() + '.' + e))) sk = norm(dir + '/' + sm[1].toLowerCase() + '.' + e);
        if (sk) { if (!want.has(sk)) push(sk, 'Sprite of ' + k); } else if (!(as2idx && resolveTok({ s: sm[1], q: true, key: 'sprite' }, dir, as2idx.map))) rep.add('resource/' + k, 0, 'WARN_PORT_SPRITE_MISSING', `PORT-172 {Sprite "${sm[1]}"} is not in GoH data: as64 may die in  [I]`);
      }
      // SCEN-FIX rule 1 (PORT-170): {place "slot" "entity"} children. A def named there and absent from the output is fatal at spawn on as64.
      // Each child def goes into `want` and the queue like any file, so its own place children follow; `want.has` is the cycle guard (a cycle ends at the first repeat).
      if (/^(def|ext|inc)$/.test(extOf(k))) for (const pm of src.matchAll(/\{\s*place\s+"[^"\r\n]*"\s+"([^"\r\n]+)"/gi)) {
        const nm = pm[1].trim().replace(/\\/g, '/').toLowerCase().replace(/\.def$/, '');
        if (!placeSeen.add(k + '\n' + nm)) continue;
        if (!defByName) { defByName = new Map(); for (const ek of idx.map.keys()) if (/^entity\/.*\.def$/.test(ek)) { const b = ek.slice(ek.lastIndexOf('/') + 1, -4); if (!defByName.has(b)) defByName.set(b, []); defByName.get(b).push(ek); } }
        const full = nm.includes('/') ? [norm(nm.replace(/^\//, '') + '.def')].filter(c => idx.map.has(c)) : (defByName.get(nm) || []).slice().sort();
        if (full.length) {
          const sh = c => { let i = 0; while (i < c.length && i < k.length && c[i] === k[i]) i++; return i; };
          const best = full.slice().sort((a, b) => sh(b) - sh(a) || (a < b ? -1 : 1))[0];
          if (!want.has(best)) push(best, 'place child of ' + k);
          continue;
        }
        if (as2idx) { if (!as2Defs) { as2Defs = new Set(); for (const ek of as2idx.map.keys()) if (/^entity\/.*\.def$/.test(ek)) as2Defs.add(ek.slice(ek.lastIndexOf('/') + 1, -4)); } if (as2Defs.has(nm.replace(/^.*\//, ''))) continue; }
        rep.add('resource/' + k, 0, 'WARN_PORT_PLACE_MISSING', `PORT-170 {place} child "${pm[1]}" has no def of that name in GoH${as2idx ? ' or vanilla AS2' : ''}: the parent is fatal at spawn on as64 [V SCEN-G r3]`);
      }
    }
    if (want.size >= max) rep.add('-', 0, 'WARN_PORT_CLOSURE_CAP', `dependency closure stopped at ${max} files (--max-files)`);
  }
  if (stuffSt.tags.size) rep.info('-', 0, 'PORT_STUFF_TAGS', `T-STUFF: ${stuffSt.tags.size} weapon/ammo/item tag(s) named by ported defs: ${stuffSt.as64.size} kept (${tgt === 'mowas2' ? 'MoW:AS2' : 'as64'} has the Stuff), ${stuffSt.pulled.size} pulled from GoH, ${stuffSt.missing.size} missing (WARN_PORT_STUFF_MISSING + hand gap)`);
  for (const [c, from] of propsCopied) rep.info('resource/' + from, 0, 'PORT_PROPS_COPIED', 'PORT-47 [I] ' + c + ' absent from the AS2 vfs: copied (converted) with its includes; it cannot override an AS2 file');
  for (const [c, s] of propsShadow) rep.info('resource/' + s, 0, 'PORT_PROPS_SHADOWED', 'PORT-47 [I] ' + c + ' also exists in AS2: written here so it overrides nothing, includes rewritten');
  const gapList = [...stuffMissingGaps];   // T-PORTGAP: every gap entry of the run, {file, line, kind, code, key, paths, reason}; file = GoH key; grouped by owner unit at the end
  for (const [c, from] of sharedProps) {
    const rn = propRename(c);
    // T-PORTGAP: the entry sits on the props file itself (its keys are what AS2 does not get), owned by the unit whose file includes it
    let ps = []; try { ps = keyPaths(decodeText(readEnt(idx.map.get(c))).src); } catch { ps = []; }
    if (!owner.has(c)) owner.set(c, owner.get(from) || 'keys');
    gapList.push({ file: c, line: 0, kind: 'dropped', code: 'WARN_PORT_SHARED_PROPS', key: '*', paths: ps, reason: rn ? `PORT-47 shared props file not copied (included by ${from}): the include now names AS2 /${rn}, whose keys stand in for GoH's` : `PORT-47 shared props file not copied (included by ${from})${propsRejected.has(c) ? ' (carries {' + propsRejected.get(c) + '})' : ''}: AS2's file of that name (if any) stands in` });
    rep.add('resource/' + from, 0, 'WARN_PORT_SHARED_PROPS', rn ? `PORT-47 [V] ${c} not copied; include now names AS2 /${rn}` : `PORT-47 [V] ${c} not copied${propsRejected.has(c) ? ' (carries {' + propsRejected.get(c) + '}, a key AS2 rejects)' : ''}; AS2 has to supply it or the include dangles`);
  }
  // closure checker (only when a closure ran): every file name in the wanted mdl/ply/mtl/def/ext/inc resolves in the closure, in vanilla AS2, or is reported here as missing
  let chk = null;
  const specDrop = new Map();   // FIX-PORT assets:16: mtl key -> Set of missing {specular} names dropped from the written mtl
  if ((o.entities && !o.noDeps) || o.deps) {
    chk = checkClosure(want, idx, as2idx, k => decodeText(readEnt(idx.map.get(k))).src, new Set(sharedProps.keys()), new Set(mtlFallback.keys()));
    // ASSET-1: a texture name that resolves nowhere (closure, GoH, vanilla AS2) draws as a checker with no game.log line (PORT-152 [V]); needs --game to know vanilla
    for (const m of chk.missing) {
      if (m.tex && as2idx && /\.mtl$/.test(m.from) && specLineRe(m.name).test(decodeText(readEnt(idx.map.get(m.from))).src)) {   // FIX-PORT assets:16 (us-m2a1_lt "$/model/m2a4_sp", in no GoH pak)
        if (!specDrop.has(m.from)) specDrop.set(m.from, new Set()); specDrop.get(m.from).add(m.name);
        rep.add('resource/' + m.from, 0, 'WARN_PORT_SPECULAR_DROPPED', `PORT-152 specular "${m.name}" is in no pulled file, GoH data or vanilla AS2 (${m.how}): the {specular} line is dropped from the written mtl so it does not draw as a checker (1,034 of 2,954 vanilla bump mtls have no specular [V]); shine is lost, look [T]`);
      } else if (m.tex && as2idx) rep.add('resource/' + m.from, 0, 'WARN_PORT_MISSING_TEXTURE', `PORT-152 [V] texture "${m.name}" is in no pulled file, GoH data or vanilla AS2 (${m.how}): the unit draws as a checker, game.log is silent`);
      else rep.add('resource/' + m.from, 0, 'WARN_PORT_CLOSURE_MISSING', `${m.name}: ${m.how}`);
    }
  }
  // files set/stuff includes from outside set/stuff hold stuff blocks too: same reader, same rules
  const stuffInc = new Set(), incQ = [...want.keys()].filter(k => isText(k) && /^set\/stuff\//.test(k));
  while (incQ.length) {
    const k = incQ.pop();
    let src; try { src = decodeText(readEnt(idx.map.get(k))).src; } catch { continue; }
    for (const m of src.matchAll(/\(\s*include\s+"([^"]+)"/gi)) {
      const r = m[1].replace(/\\/g, '/').toLowerCase(), c = norm(r.startsWith('/') ? r : k.slice(0, k.lastIndexOf('/')) + '/' + r);
      if (idx.map.has(c) && !/^set\/stuff\//.test(c) && !stuffInc.has(c)) { stuffInc.add(c); incQ.push(c); }
    }
  }
  // ASSET-1 (asset-same: 1,886 of 2,854 texture keys shared by both games differ in bytes, 206 world/model): a texture written at a key AS2 already has, with other bytes,
  // would replace AS2's picture for every AS2 user of that key. Such a texture is written under <name>_goh.<ext> and the pulled .mtl files are pointed at it. Needs --game.
  const texRename = new Map();   // source key -> output key
  if (as2idx) for (const k of want.keys()) {
    if (!BIN_TEX.has(extOf(k)) || SKIP_EXT.has(extOf(k)) || !idx.map.has(k)) continue;
    const dk = donorKey(k), ae = as2idx.map.get(dk);
    if (!ae) continue;
    let same = false; try { same = readEnt(ae).equals(readEnt(idx.map.get(k))); } catch { continue; }
    if (same) continue;
    const nk = gohKey(dk);
    texRename.set(k, nk);
    rep.add('resource/' + nk, 0, 'WARN_PORT_TEXKEY_RENAMED', `ASSET-1 [V bytes] AS2 has ${dk} with other bytes: GoH's picture written as ${nk}, .mtl and .ebm names rewritten (a trailing _N stays last, GOH2-FX); a .ply naming ${dk} directly still reads AS2's picture [I]`);
  }
  // convert
  const outRoot = path.join(o.out, 'resource'), written = [], mdlBones = new Map(), gohOrigin = [];   // gohOrigin: PORTREV rev-port #3 ledger rows
  const textOnlySkipped = [];   // NAT-CONV
  let nText = 0, nBin = 0, nSkip = 0, nBytes = 0, shadowN = 0;   // shadowN: PORTREV2 #10; MAPFILL: bytes of the converted output, shown in dry runs too (size rule before big copies)
  for (const [k, why] of [...want].sort((x, y) => x[0] < y[0] ? -1 : 1)) {
    const rel = 'resource/' + k, ext = extOf(k), ent = idx.map.get(k);
    let out;
    try {
      const fileGap = (code, reason) => { let ps = []; if (isText(k) || SKIP_EXT.has(ext) && !readEnt(ent).subarray(0, 512).includes(0)) { try { ps = keyPaths(decodeText(readEnt(ent)).src); } catch { ps = []; } } gapList.push({ file: k, line: 0, kind: 'dropped', code, key: '*', paths: ps, reason }); };   // T-PORTGAP: a whole file left out
      if (SKIP_EXT.has(ext)) { rep.add(rel, 0, 'WARN_PORT_SKIP_KIND', `PORT-31 [I] .${ext} has no AS2 loader; omitted${ext === 'materials' ? ' (maps need .materials rework)' : ''}`); fileGap('WARN_PORT_SKIP_KIND', `PORT-31 .${ext} has no AS2 loader: file not written`); nSkip++; continue; }
      { const why = skipSetKind(k); if (why) { rep.add(rel, 0, 'WARN_PORT_SKIP_SET_KIND', why); fileGap('WARN_PORT_SKIP_SET_KIND', why); nSkip++; continue; } }
      const buf = readEnt(ent);
      if (ext === 'ebm' && ebmGone.has(k)) {
        const lines = ebmGone.get(k), left = buf.toString('latin1').replace(/\{\s*Frame\s+"[^"\r\n]+"[^}\r\n]*\}[ \t]*\r?\n?/gi, m => lines.includes(m.replace(/[ \t]*\r?\n?$/, '')) ? '' : m);
        if (!/\{\s*Frame\s/i.test(ebmLive(left))) { rep.add(rel, 0, 'WARN_PORT_EBM_DROPPED', `FXD-3: every Frame texture of this .ebm (${lines.map(l => /"([^"]+)"/.exec(l)[1]).join(', ')}) is in neither GoH nor AS2: file not written (a missing frame texture is fatal at load) [V crash, I fix]`); fileGap('WARN_PORT_EBM_DROPPED', 'FXD-3 every Frame texture is in neither GoH nor AS2: file not written'); nSkip++; continue; }
        out = Buffer.from(renameEbmTex(left, k.slice(0, k.lastIndexOf('/')), idx.map, texRename), 'latin1'); nBin++;
        rep.add(rel, 0, 'WARN_PORT_EBM_FRAME_DROPPED', `FXD-3: Frame line(s) ${lines.join(' ')} removed: texture in neither GoH nor AS2 [I]`);
        gapList.push({ file: k, line: 0, kind: 'dropped', code: 'WARN_PORT_EBM_FRAME_DROPPED', key: 'frame', paths: [], reason: `FXD-3 Frame line(s) removed, texture in neither GoH nor AS2: ${lines.join(' ')}` });
      } else
      if (ext === 'lng') out = buf;
      else if (isText(k)) {
        const d = decodeText(buf);
        { const sc = d.scan;   // PORT-15: bytes pass through unchanged; flag what as64 cannot read
          for (const x of sc.outside.slice(0, 3)) rep.add(rel, x.line, 'WARN_PORT_NONASCII_IDENT', `PORT-15 non-ASCII byte 0x${x.byte.toString(16)} outside strings/comments: identifiers must be ASCII`);
          for (const x of sc.badStr.slice(0, 3)) rep.add(rel, x.line, 'WARN_PORT_STR_NOT_UTF8', 'PORT-15 string value is not valid UTF-8 (legacy cp1251 bytes, shows as U+FFFD)'); }
        // FMT-05: the def's (or its same-stem .ext's) mdl gives each bone's type; shared /properties files have no mdl of their own
        let boneTypes = null;
        if ((ext === 'def' || ext === 'ext') && /^entity\//.test(k)) {
          const mk = mdlKeyOf(k, d.src, idx);
          if (mk) { if (!mdlBones.has(mk)) { try { mdlBones.set(mk, boneTypesOf(decodeText(readEnt(idx.map.get(mk))).src)); } catch { mdlBones.set(mk, null); } } boneTypes = mdlBones.get(mk); }
        }
        if (donor && donorKey(k) !== k && d.src.toLowerCase().includes(donor.repDir)) rep.add(rel, 0, 'WARN_PORT_DONOR_ABSPATH', `${donor.repDir} is named by path in this file; it moved to ${donor.destDir}, so that path now dangles`);
        const fg = (preGaps.get(k) || []).slice();   // T-PORTGAP: this file's gap entries (NAT-GAP: with those of edits made before the write loop)
        const step = (before, code, reason) => { const g = textStepGap(before, conv, k, code, reason); if (g) fg.push(g); };
        let conv = convertText(renameProps(stuffPorted.has(k) ? stuffPorted.get(k) : ammoFixed.has(k) ? ammoFixed.get(k) : d.src), rel, k, ext, rep, { stuffInc, boneTypes, lightmapMultiply: o.lightmapMultiply, gaps: fg });   // T-STUFF: a pulled stuff file is written from its macro-expanded text
        if (weaponQuote.size && /^(def|ext|inc)$/.test(ext)) { const pre = conv; conv = conv.replace(/(\{\s*weapon\s+)"([^"\r\n]+)"(?!\s*\{\s*mask)/gi, (m, p, nm) => weaponQuote.has(nm.toLowerCase()) ? p + '"weapon ' + nm + '"' : m); if (conv !== pre) { rep.info(rel, 0, 'PORT_WEAPON_QUOTED', 'PORT-165 [V log, I fix] bare {weapon "name"} that an ammo file also carries written as "weapon name" (the .weapon file-name tag)'); fg.push({ file: k, line: 0, kind: 'baked', code: 'PORT_WEAPON_QUOTED', key: 'weapon', paths: [], reason: 'PORT-165 bare weapon name shared with an ammo file written as "weapon <name>"' }); } }
        { const pre = conv; conv = visionFix(propPathFix(conv, k), rel, rep); if (conv !== pre) for (const m of pre.matchAll(/\{\s*vision\s+"([^"\r\n]+)"/gi)) if (!AS2_VISIONS.has(m[1].toLowerCase())) fg.push({ file: k, line: lineOf(pre, m.index), kind: 'baked', code: 'WARN_PORT_VISION_NAME', key: 'vision', paths: [], reason: `PORT-57 vision "${m[1]}" not in as64: mapped to an as64 name, as64 range` }); }
        if (/^(def|ext|inc)$/.test(ext)) conv = patherFix(conv, k, rep, rel, fg);   // T-PATHER
        if (/^(def|ext|inc)$/.test(ext) && /minWorkers/i.test(conv)) { const pre = conv, mw = require('./stuffnames').dropMinWorkers(conv); if (mw.n) { conv = mw.text; step(pre, 'WARN_PORT_MINWORKERS', 'T-PORTLOAD GoH minWorkers N after seat names dropped: as64 reads the list as strings only'); rep.add(rel, 0, 'WARN_PORT_MINWORKERS', `T-PORTLOAD [V crash] ${mw.n} \`minWorkers N\` in {workers|gunner|charger ..} dropped: as64 reads seat lists as strings only, the atom is fatal "Block terminator expected"; minimum crew not carried`); } }
        if (/\{\s*Extender\s+"light"/i.test(conv)) { const pre = conv, lg = emptyGohLight(conv); if (lg.n) { conv = lg.text; step(pre, 'WARN_PORT_LIGHT_EMPTIED', 'PORT-171 GoH {Extender "light" {preset ..}} written empty: preset keys do not map to as64 {lamp}/{lightfx}'); rep.add(rel, 0, 'WARN_PORT_LIGHT_EMPTIED', `PORT-171 [V reader] GoH {Extender "light" {preset ..}} is fatal on as64 and its keys do not map plainly to {lamp}/{lightfx}: ${lg.n} block(s) written as empty {Extender "light"}; lights not carried, look [T]`); } }
        if (ext === 'def' && /\{\s*Extender\s+"light"/i.test(conv)) { const pre = conv, dl = dropLamplessLight(conv, boneTypes); if (dl.n) { conv = dl.text; step(pre, 'WARN_PORT_LIGHT_NOBONE', `PORT-186 {extender "light"} dropped: lamp(s) ${dl.lamps.join(', ')} have no lamp_glass bone in the model (blast crash)`); rep.add(rel, 0, 'WARN_PORT_LIGHT_NOBONE', `PORT-186 [V] {extender "light"} with {lamp "${dl.lamps.join('", "')}"} but the model has no lamp_glass bone for it: a blast on the lamp crashes the game; ${dl.n} block(s) dropped, the unit has no working light`); } }
        { const rn = renamedIncludes(d.src);   // PORTREV: calls to GoH defines the renamed AS2 props file lacks
          if (rn.length) { const pre = conv, fr = fixRenamedDefines(conv, rn); conv = fr.text; step(pre, 'WARN_PORT_DEFINE_RENAMED', 'PORTREV macro call commented out: the define is not in the AS2 props file'); for (const f of fr.fixes) if (f.to) fg.push({ file: k, line: 0, kind: 'baked', code: 'WARN_PORT_DEFINE_RENAMED', key: '("' + f.name + '")', paths: [], reason: `PORTREV call mapped to AS2 ("${f.to}"), GoH args dropped: ${f.orig}` });
            for (const f of fr.fixes) rep.add(rel, 0, 'WARN_PORT_DEFINE_RENAMED', `PORTREV [I] ("${f.name}") is defined in GoH properties/${f.from} but not in AS2 properties/${f.file} (MACRO_UNDEFINED at load): ${f.to ? 'call replaced by ("' + f.to + '"), GoH args dropped: ' + f.orig : 'call commented out: ' + f.orig}`);
            for (const r of rn) if (!r.as2Defs) rep.add(rel, 0, 'WARN_PORT_DEFINE_UNCHECKED', `PORTREV properties/${r.goh} -> ${r.as2}: no AS2 dir, the GoH macro calls were not checked against the AS2 file`); } }
        if (/^(def|ext|inc)$/.test(ext)) { const pre = conv, lo = stripGohLoco(conv); if (lo.n) { conv = lo.text; step(pre, 'WARN_PORT_LOCO_SPEED', 'GOHFIX GoH {Slow}/{Normal}/{Fast} in Locomotion: no as64 case (fatal unexpected token); AS2 speed comes from {MaxSpeed}'); rep.add(rel, 0, 'WARN_PORT_LOCO_SPEED', `GOHFIX [V dcgdefs inst 2] ${lo.n} GoH {Slow}/{Normal}/{Fast} key(s) inside a Locomotion block removed: as64 has no case for them (fatal "unexpected token", ); AS2 speed comes from {MaxSpeed}`); } }
        if (/^(def|ext|inc)$/.test(ext) && /targetSelector/i.test(conv)) { const ts = require('./translate').mapTargetSelector(conv); conv = ts.text;   // COV-C40, AI-02
          for (const c of ts.changes) { rep.add(rel, 0, 'WARN_PORT_TARGET_SEL_MAP', `AI-02 [I] {targetSelector "${c.from}"} is GoH-only (no such {type} in AS2 set/target/select.set: null selector, the unit ranks no foe); mapped to "${c.to}" by family`); fg.push({ file: k, line: 0, kind: 'baked', code: 'WARN_PORT_TARGET_SEL_MAP', key: 'targetselector', paths: [], reason: `AI-02 "${c.from}" mapped to AS2 "${c.to}" by family` }); }
          for (const u of ts.unknown) rep.add(rel, 0, 'WARN_PORT_TARGET_SEL_UNKNOWN', `AI-02 {targetSelector "${u}"} is in neither AS2 nor the GoH map: null selector in game (no auto target); set an AS2 type (${require('./translate').AS2_TARGET_TYPES.join(', ')})`); }
        if (ext === 'mtl' && specDrop.has(k)) { const pre = conv; for (const nm of specDrop.get(k)) conv = conv.replace(new RegExp('^[ \\t]*' + specLineRe(nm).source + '[^\\r\\n]*(\\r?\\n)?', 'gmi'), ''); step(pre, 'WARN_PORT_SPECULAR_DROPPED', 'PORT-152 {specular} names a texture in no pulled file, GoH or AS2: line dropped (no checker), shine lost'); }
        if (ext === 'mtl') conv = renameMtlTex(conv, k.slice(0, k.lastIndexOf('/')), idx.map, texRename);
        out = Buffer.from(conv, 'latin1'); nText++;
        { // T-PORTGAP safety net: keys gone from this file that no rule above recorded
          let left = []; try { left = msetList(msetMinus(msetMinus(msetOf(keyPaths(d.src)), msetOf(keyPaths(conv))), msetOf(fg.flatMap(g => g.paths)))); } catch { left = []; }
          if (left.length) fg.push({ file: k, line: 0, kind: 'unexplained', code: 'PORTGAP_UNEXPLAINED', key: left[0], paths: left, reason: 'key paths in the GoH file and not in the written one, recorded by no rule (tool gap: report it)' });
          gapList.push(...fg);
        }
        if (ext === 'def') readerCheck(rep, rel, out.toString('latin1'), boneTypes);
        // PORT-133 [V fix, I cause]: a towed gun whose mdl basis is plain is silent; the vanilla gun mdl has {bone revolute "basis" {speed 0.01}}
        if (donor && donor.gun && ext === 'mdl' && k === donor.mk) {
          const fixed = revoluteBasis(out.toString('latin1'));
          if (fixed) { out = Buffer.from(fixed, 'latin1'); rep.add(rel, 0, 'WARN_PORT_GUN_BASIS', `PORT-133: donor ${donor.stem} is a towed gun and this mdl's "basis" was a plain bone (silent unit, 0 shots): rewritten as {bone revolute "basis" {speed 0.01}} [V b8-x3 fix, T this tool's output]`); }
          let dsrc = null; try { if (donor.vf.files.has(donor.vmdl)) dsrc = vfsLib.readRec(donor.vf.files.get(donor.vmdl)).toString('latin1'); } catch { dsrc = null; }
          const gl = dsrc ? donorGunLimits(out.toString('latin1'), dsrc) : null;
          if (gl && gl.changes.length) { out = Buffer.from(gl.text, 'latin1'); rep.add(rel, 0, 'WARN_PORT_GUN_LIMITS', `LIM-1 [I] GoH gun limits sit above the donor's on both ends (20mm_type_2: -5 85 gave 0 kills, donor -15 65 gave 3/3 [V]): ${gl.changes.map(c => `${c.bone} ${c.from} -> ${c.to}`).join(', ')} from ${donor.vmdl}`); }
        }
      } else if (o.textOnly) {   // NAT-CONV: --text-only: the binary is neither converted nor written; its resource key goes to text-only.tsv
        textOnlySkipped.push(k); continue;
      } else {
        out = ext === 'ebm' && texRename.size ? Buffer.from(renameEbmTex(buf.toString('latin1'), k.slice(0, k.lastIndexOf('/')), idx.map, texRename), 'latin1') : buf; nBin++;
        if (ext === 'dds') {   // ASSET-1: ATI2 / BC5U / raw8 have no loader format: converted to A8R8G8B8
          let cv = null; try { cv = texconv.convert(buf); } catch (e) { rep.add(rel, 0, 'WARN_PORT_DDS_CONVERT_FAIL', `ASSET-1: ${texconv.kindOf(buf)} could not be converted (${e.message}); copied as-is, the loader will refuse it`); }
          if (cv) {
            out = cv.buf;
            if (cv.kind === 'raw8') rep.add(rel, 0, 'WARN_PORT_DDS_RAW8', `ASSET-1 [I] 8-bit ${cv.w}x${cv.h} DDS has no AS2 format; written as grey A8R8G8B8 (luminance or alpha-only: what it is used for is not read)`);
            else rep.info(rel, 0, 'PORT_DDS_CONVERTED', `ASSET-1 [I] ${cv.note}, ${cv.w}x${cv.h}, ${cv.mips} mip(s); z-in-B shader use and ATI2 channel order are [T]`);
          } else if (!texconv.loadable(buf)) rep.add(rel, 0, 'WARN_PORT_DDS_UNLOADABLE', `ASSET-1 [V] DDS format "${texconv.kindOf(buf)}" is not one the AS2 loader reads; copied as-is, expect "Unknown DDS picture format"`);
        }
        if (ext === 'ply') { const m = buf.subarray(0, 4).toString('latin1'); if (m !== 'EPLY' && m !== 'BPLY') rep.add(rel, 0, 'PORT_PLY_MAGIC', `FMT-13 [V] .ply magic "${m}" is not EPLY/BPLY: engine cannot load`); }
        if (ext === 'avi') for (const w of require('./avicheck').aviWarn(buf.subarray(0, 65536)).warn) rep.add(rel, 0, w.code, 'C27 ' + w.msg);   // COV-L8K
        if (out === buf) rep.info(rel, 0, 'PORT_BINARY_COPY', `copied as-is (.${ext}; GoH->AS2 format compat unknown [I], see FMT-01/10/13)`);
      }
    } catch (err) { rep.add(rel, 0, 'PORT_CRASH', String(err && err.message || err)); continue; }
    if (as2idx && !propsShadow.has(k) && !texRename.has(k)) {   // PORTREV2 (rev-port #10): a non-renamed key vanilla AS2 also has, with other bytes, replaces it for every AS2 user in the mod
      const wk = donorKey(k), ae = as2idx.map.get(wk);
      let same = true; if (ae) { try { same = readEnt(ae).equals(out); } catch { same = false; } }
      if (ae && !same) { shadowN++; rep.add('resource/' + wk, 0, 'WARN_PORT_SHADOWS_VANILLA', `rev-port #10 [I] vanilla AS2 has ${wk} with other bytes: the mod's GoH version replaces it for every AS2 unit that reads it${/^set\/stuff\//.test(wk) ? ' (set/stuff: vanilla weapons get GoH numbers)' : ''}; rename it or drop it from the port if vanilla users must keep theirs`); }
    }
    nBytes += out.length;
    if (!o.dry) {
      const p = path.join(outRoot, propsShadow.get(k) || texRename.get(k) || donorKey(k));
      let st = null; try { st = fs.lstatSync(p); } catch { /* new file */ }
      if (st && (st.isSymbolicLink() || st.nlink > 1)) { rep.add(rel, 0, 'WARN_PORT_LINK_TARGET', `GOH2-FX ${p} is a link (symlink or hard link): not written, writing would change the file it points at`); continue; }
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, out); written.push(p); gohOrigin.push({ file: p, buf: out, tool: 'goh2as2', src: k });
    }
  }
  // ---- PORT-124/125/126: breed + weapon stuff entry + stuff.ext stub (text: bytes + CRLF like the rest)
  const putText = (key, text, code, msg) => {
    const rel = 'resource/' + key;
    if (!o.dry) { const p = path.join(outRoot, key); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1')); written.push(p); }
    rep.info(rel, 0, code, msg); nText++;
  };
  for (const [c, f] of mtlFallback) {   // FXC-1 gap 7
    if (!o.dry) { const p = path.join(outRoot, donorKey(c)); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, f.buf); written.push(p); }
    rep.info('resource/' + c, 0, 'PORT_MTL_FALLBACK_WRITTEN', f.from ? `copy of ${f.from}` : 'empty stub material'); nText++;
  }
  // ---- --donor: the vanilla def, its last mdl Extension pointed at the rep's mdl, plain-bone blocks stripped against the rep's mdl
  if (donor) {
    const raw = donor.exm[1], pre = o.repKey ? '' : raw.slice(0, Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\')) + 1), newVal = pre + donor.mk.slice(donor.mk.lastIndexOf('/') + 1);
    let text = donor.text.slice(0, donor.exm.index) + donor.exm[0].replace('"' + raw + '"', '"' + newVal + '"') + donor.text.slice(donor.exm.index + donor.exm[0].length);
    const dkey = o.repKey ? donor.destDir + '/' + donor.repName + '.def' : donor.defKey.slice('resource/'.length);
    if (o.repKey) {
      // FXC-1 gaps 1+6: the def moved, so its relative .ext/.inc references would dangle. The donor folder's crew.ext is copied beside the new def (vfs), every other relative one is made absolute to where the donor has it.
      const ddir = donor.defKey.slice(0, donor.defKey.lastIndexOf('/')), crewDone = new Set();
      const fixRefs = (src, base) => src.replace(/"([^"\r\n]+\.(?:ext|inc))"/gi, (m, tok) => {
        const t = tok.replace(/\\/g, '/');
        if (t.startsWith('/') || t.startsWith('$/')) return m;
        const key = names.resolve(t, base).key.toLowerCase();
        if (!donor.vf.files.has(key)) return m;
        if (/^crew\.ext$/i.test(t)) {
          if (!crewDone.has(key)) {
            crewDone.add(key);
            const ct = fixRefs(vfsLib.readRec(donor.vf.files.get(key)).toString('latin1'), key.slice(0, key.lastIndexOf('/')));
            putText(donor.destDir + '/crew.ext', ct, 'PORT_DONOR_CREW', `donor folder's ${key} (vfs) copied beside the rep def (FXC-1 gap 6) [I: donorfit/in-game fit of its doors+places is not done]`);
          }
          return m;
        }
        return '"/' + key.replace(/^resource\//, '') + '"';
      });
      text = fixRefs(text, ddir);
    }
    // ---- XLATE-2: translated values, native armour macro args, crew count, gun/turret limits (tools/goh2as2/translate.js; table from tools/xlate)
    let xl = null, xlTypes = null; try { xlTypes = boneTypesOf(decodeText(readEnt(idx.map.get(donor.mk))).src); } catch { /* no bone info */ }
    if (!o.noTranslate) {
      const TR = require('./translate'), xlate = require('../xlate/xlate.js'), dkeyX = 'resource/' + dkey;
      const gather = (src, dirKey, depth = 0, seen = new Set()) => {   // the rep's def plus the GoH includes it names (not /properties)
        let all = src; if (depth >= 3) return all;
        for (const m of src.matchAll(/include\s+"([^"\r\n]+)"/gi)) {
          const t = m[1].replace(/\\/g, '/'); if (/^\/?properties\//i.test(t) || t.startsWith('$/')) continue;
          const ik = names.resolve(t, dirKey).key.toLowerCase().replace(/^resource\//, ''); if (seen.has(ik) || !idx.map.has(ik)) continue; seen.add(ik);
          let s2; try { s2 = decodeText(readEnt(idx.map.get(ik))).src; } catch { continue; }
          all += '\n' + gather(s2, 'resource/' + ik.slice(0, ik.lastIndexOf('/')), depth + 1, seen);
        }
        return all;
      };
      const repAll = gather(donor.repSrc, 'resource/' + donor.repKey.slice(0, donor.repKey.lastIndexOf('/')));
      const side = { map: { get: k => { const v = idx.map.get(k); return v && (v.path ? { path: v.path } : v.ent); }, has: k => idx.map.has(k) } };
      const askMode = o.noAsk ? 'off' : o.answers ? 'answers' : o.askJson ? 'json' : process.stdin.isTTY ? 'tty' : 'off';
      let answers = {}; if (o.answers) { try { answers = JSON.parse(fs.readFileSync(o.answers, 'utf8')); } catch (e) { console.error('error: --answers: ' + e.message); process.exit(2); } }
      const stem = donor.repKey.split('/').pop().replace(/\.def$/, '');
      xl = TR.translate({
        text, repAll, repKey: donor.repKey, donorKey: donor.defKey, vf: donor.vf, vfsLib, types: xlTypes, unit: donor.repName || stem,
        opt: { ask: askMode, answers, dropLimits: o.dropLimits, table: o.table },
        extract: () => xlate.extract(side, 'goh', { key: donor.repKey, stem, cls: TR.classOfKey(donor.repKey), scope: 'vehicle' }, 'goh'),
        add: (code, msg) => rep.add(dkeyX, 0, code, msg), info: (code, msg) => rep.info(dkeyX, 0, code, msg),
      });
      text = xl.text;
    }
    if (o.matchWeapon) {   // FXC-3 gap 5 [I, class from its set/stuff/<class>/ folder]
      // FXC-4 gap 2 [V real defs]: the weapon is `{weapon "<name>" filling "<ammo>" 1}`; <name> is a stuff key, either bare ("76mm_m1a2") or with the key's own "weapon " prefix ("weapon werfer42").
      const dkeyR = 'resource/' + dkey, WRE = /\{\s*weapon\s+"([^"\r\n]+)"|"(weapon\s+[^"\r\n]+)"/gi;
      const wrefs = s => [...s.matchAll(WRE)].map(m => (m[1] || m[2]).trim());
      const wkey = n => n.replace(/^weapon\s+/i, '').toLowerCase();
      const calOf = n => { const m = /(\d+)\s*mm/i.exec(n) || /mortar(\d+)/i.exec(n); return m ? parseInt(m[1], 10) : 0; };
      const van = new Map(), vanKey = new Map();   // name -> class, vanilla set/stuff/<class>/<name>; name -> vfs key
      for (const k of donor.vf.files.keys()) { const m = /^resource\/set\/stuff\/([^/]+)\/([^/]+)$/.exec(k); if (m && !/\.ammo$/.test(m[2])) { const nm = m[2].replace(/\.weapon$/, '').toLowerCase(); van.set(nm, m[1]); vanKey.set(nm, k); } }
      // includes of a def are read too (a weapon can sit in a .ext/.inc): the rep's through the GoH index, the donor's through the vfs; /properties files are shared, not followed
      const incs = (src, dirKey, has, read, seen = new Set(), depth = 0) => {
        let all = src; if (depth >= 3) return all;
        for (const m of src.matchAll(/include\s+"([^"\r\n]+)"/gi)) {
          const t = m[1].replace(/\\/g, '/'); if (/^\/?properties\//i.test(t) || t.startsWith('$/')) continue;
          const ik = names.resolve(t, dirKey).key.toLowerCase(); if (seen.has(ik) || !has(ik)) continue; seen.add(ik);
          let s2; try { s2 = read(ik); } catch { continue; }
          all += '\n' + incs(s2, ik.slice(0, ik.lastIndexOf('/')), has, read, seen, depth + 1);
        }
        return all;
      };
      const rk = donor.repKey, rAll = incs(donor.repSrc, 'resource/' + rk.slice(0, rk.lastIndexOf('/')), ik => idx.map.has(ik.replace(/^resource\//, '')), ik => decodeText(readEnt(idx.map.get(ik.replace(/^resource\//, '')))).src);
      const dAll = incs(text, donor.defKey.slice(0, donor.defKey.lastIndexOf('/')), ik => donor.vf.files.has(ik), ik => vfsLib.readRec(donor.vf.files.get(ik)).toString('latin1'));
      const rW = (wrefs(rAll).map(wkey).find(n => calOf(n)) || '');
      const mortarRep = /mortar|werfer/i.test(rW) || /"ammo[^"]*mortar/i.test(rAll);
      // the donor's gun = first vanilla weapon with a calibre in its name (an MG listed first is not it); a mortar donor's werfer42 has none, so a mortar rep takes the first mortar/werfer
      const gohCls = n => { const re = new RegExp('^set/stuff/[^/]+/' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.[a-z]+)?$'); const h = [...idx.map.keys()].find(x => re.test(x)); return h ? h.split('/')[2] : null; };
      // FXD-3 rule 1b: a weapon line that sits only in an include of the donor def (no args) is inlined into the written def, so the swap below reaches it [V logic on a fixture, T in game]
      if (!wrefs(text).some(n => van.has(wkey(n)))) {
        const ire = /\(\s*include\s+"([^"\r\n]+)"/gi; let im;
        while ((im = ire.exec(text))) {
          const t = im[1].replace(/\\/g, '/'); if (/^\/?properties\//i.test(t) || t.startsWith('$/')) continue;
          const ik = names.resolve(t, donor.defKey.slice(0, donor.defKey.lastIndexOf('/'))).key.toLowerCase(); if (!donor.vf.files.has(ik)) continue;
          const body = vfsLib.readRec(donor.vf.files.get(ik)).toString('latin1'), end = im.index + im[0].length;
          if (!wrefs(body).some(n => van.has(wkey(n))) || !/^\s*\)/.test(text.slice(end))) continue;
          const idir = ik.slice(0, ik.lastIndexOf('/')), abs = body.replace(/"([^"\r\n]+\.(?:ext|inc))"/gi, (q, tok) => { const tt = tok.replace(/\\/g, '/'); if (tt.startsWith('/') || tt.startsWith('$/')) return q; const kk = names.resolve(tt, idir).key.toLowerCase(); return donor.vf.files.has(kk) ? '"/' + kk.replace(/^resource\//, '') + '"' : q; });
          text = text.slice(0, im.index) + abs.replace(/\s+$/, '') + text.slice(text.indexOf(')', end) + 1);
          rep.add(dkeyR, 0, 'WARN_PORT_WEAPON_INLINED', `FXD-3: donor weapon "${wrefs(abs).find(n => van.has(wkey(n)))}" sat in include ${ik}; the include was inlined into the written def so the weapon swap reaches it [I]`);
          break;
        }
      }
      const dRefs = wrefs(text);
      let dW0 = dRefs.find(n => van.has(wkey(n)) && calOf(n)) || (mortarRep ? dRefs.find(n => van.has(wkey(n)) && /mortar|werfer/i.test(n)) : null), multi = false;
      // FXD-3 rule 1a: the donor's weapon has no calibre in its name (t4_20cm rocket, type99lmg, mg34): when the rep's gun is a cannon (20 mm or more) or of another class, the first such weapon line is the one swapped [I: carrier, 15cm]
      if (!dW0 && rW) {
        const c0 = dRefs.find(n => van.has(wkey(n)));
        if (c0 && (calOf(rW) >= 20 || gohCls(rW) !== van.get(wkey(c0)))) { dW0 = c0; multi = dRefs.filter(n => wkey(n) === wkey(c0)).length > 1; }
      }
      const dW = dW0 ? wkey(dW0) : null;
      if (!dW0 && wrefs(dAll).some(n => van.has(wkey(n)))) { if (rW && calOf(rW) >= 20) rep.add(dkeyR, 0, 'WARN_PORT_CALIBRE', `CALIBRE CHECK FAILS: donor weapon "${wrefs(dAll).find(n => van.has(wkey(n)))}" could not be swapped (reached only through an include that takes arguments or is shared); rep weapon "${rW}" [I]`); }
      // WPN-1: the one call into the weapon table (tools/wpn): swap by table, the user's sheet answer, or import translated. 'none' = rep weapon not in the table: the nearest-calibre rule below stays.
      const wt = o.noWpnTable || !dW || !rW ? { action: 'none' } : wpnRule(rW, dW, van);
      if (dW && rW && (wt.action === 'none' ? calOf(dW) !== calOf(rW) : wt.action !== 'keep')) {
        const rcal = calOf(rW), dcls = van.get(dW), dcal = calOf(dW);
        const rhit = [...idx.map.keys()].find(x => new RegExp('^set/stuff/[^/]+/' + rW.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.[a-z]+)?$').test(x));
        const rcls = rhit ? rhit.split('/')[2] : dcls;
        // a mortar rep only takes a mortar weapon (name has mortar/werfer, any class): a gun of near calibre is a different aim type, and werfer42 is not "a mortar of any calibre"
        const pool = mortarRep ? [...van.keys()].filter(n => /mortar|werfer/.test(n)) : [...van.entries()].filter(([, c]) => c === rcls).map(([n]) => n);
        const cands = pool.filter(n => calOf(n)).sort();
        let best = null; for (const n of cands) if (!best || Math.abs(calOf(n) - rcal) < Math.abs(calOf(best) - rcal) || (Math.abs(calOf(n) - rcal) === Math.abs(calOf(best) - rcal) && n === rW)) best = n;
        if (van.has(rW) && pool.includes(rW)) best = rW;
        if (wt.action === 'swap') best = wt.as2;
        else if (wt.action === 'import') best = van.has(wt.tmpl) ? wt.tmpl : best;   // the template's ammo moves in with the swap below; the weapon line is renamed to the local entry after it
        // FIX-PORT tools-other:50 [V MB-R7]: a 150 mm rep that is a werfer/rocket, not a mortar by name (15cm_43m: 150mm_nebelwerfer), on mortar150 (swap or WPN-1 import template) never hit (0 hits in 3 games);
        // the hand fit {foresight "foresight"} {weapon "150mm_sfh18" filling "bullet150 fg" 6} killed 1/1. So mortar150 there becomes gun-class 150mm_sfh18 and the import is not written.
        const sfh = best === 'mortar150' && mortarRep && rcal === 150 && !/mortar/i.test(rW) && van.has('150mm_sfh18') && wt.action !== 'swap';
        if (sfh) best = '150mm_sfh18';
        if (best && (wt.action === 'swap' || wt.action === 'import' || Math.abs(calOf(best) - rcal) <= Math.max(3, Math.round(rcal * 0.1)))) {
          // ammo/filling lines that must move with the gun: the donor weapon's ammo base (its stuff `{filling "bullet76"}`, `from` followed) becomes the new weapon's, in `filling "..."` and `{item "ammo ..."}`
          const baseOf = n => { for (let i = 0; i < 6 && n; i++) { const vk = vanKey.get(n); if (!vk) return null; const s = vfsLib.readRec(donor.vf.files.get(vk)).toString('latin1'); const f = /\{\s*filling\s+"(?:ammo\s+)?([^"\s]+)/i.exec(s); if (f) return f[1].toLowerCase(); const fr = /\{\s*from\s+"([^"]+)"/i.exec(s); n = fr ? wkey(fr[1]) : null; } return null; };
          const hasAmmo = (b, ty) => [...donor.vf.files.keys()].some(k => k.startsWith('resource/set/stuff/') && (ty ? k.endsWith('/' + b + '.' + ty + '.ammo') : (k.endsWith('/' + b + '.ammo') || (k.includes('/' + b + '.') && k.endsWith('.ammo')))));
          const db = baseOf(dW), nb = baseOf(best);
          let swapped = 0;   // FXD-3: with several lines on the one donor weapon (4 MG places) only the first becomes the rep's gun
          // FXE-2 [V log 150mm_type_97]: a bare name that an ammo file also carries (mortar150 = mortar150.weapon + mortar150.fg.ammo) is found as the AMMO: "Trying to create Weapon from non-weapon Stuff", SetItem crash. Such a weapon is written "weapon <name>" (the .weapon file-name tag)
          const clash = hasAmmo(best) && (vanKey.get(best) || '').endsWith('.weapon');
          // BUILD-6: Stuff lookup reads file-name tags only, so "weapon <name>" needs a .weapon file: an extensionless vanilla entry (gun/203mm_gun) is written bare, or the swap makes a weapon nothing carries (ERR_DONOR_WEAPON)
          const prefixOk = (vanKey.get(best) || '').endsWith('.weapon');
          text = text.replace(WRE, m => m.replace(/"([^"]+)"/, (q, n) => wkey(n) === dW && (!multi || !swapped++) ? '"' + (prefixOk && (/^weapon\s/i.test(n) || clash) ? 'weapon ' : '') + best + '"' : q));
          let ammoNote = '';
          const fullOf = n => { for (let i = 0; i < 6 && n; i++) { const vk = vanKey.get(n); if (!vk) return null; const s = vfsLib.readRec(donor.vf.files.get(vk)).toString('latin1'); const f = /\{\s*filling\s+"([^"]+)"/i.exec(s); if (f) return f[1]; const fr = /\{\s*from\s+"([^"]+)"/i.exec(s); n = fr ? wkey(fr[1]) : null; } return null; };
          if (multi && nb) {   // the other places keep their ammo: add the new gun's round after the first item line of the old one
            const nf = fullOf(best), il = new RegExp('^([ \\t]*)\\{item\\s+"(?:ammo\\s+)?' + (db || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s+\\w+)?"[^\\r\\n]*\\}[ \\t]*\\r?$', 'im').exec(text);
            if (nf && il && !text.includes('"' + nf + '"')) { const e = il.index + il[0].length; text = text.slice(0, e) + '\n' + il[1] + `{item "${/^ammo\s/i.test(nf) ? nf : 'ammo ' + nf}" 30}` + text.slice(e); ammoNote = `; item "${nf}" added after the ${db} line, the other places keep ${db}`; }
            else ammoNote = `; no ammo line added for "${nf || best}": add {item "..."} by hand`;
          } else if (db && nb && db !== nb) {
            const esc = db.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), tyRe = new RegExp('"(?:ammo\\s+)?' + esc + '(?:\\s+(\\w+))?"', 'gi');
            const types = [...new Set([...text.matchAll(tyRe)].map(m => (m[1] || '').toLowerCase()))], lack = types.filter(ty => !hasAmmo(nb, ty));
            if (!types.length) ammoNote = `; no ammo/filling line names "${db}"`;
            else {   // each line moves where vanilla has that type for the new base; a type it lacks stays on the donor's base and is warned
              const nfTy = (/^\S+\s+(\w+)$/.exec((fullOf(best) || '').replace(/^ammo\s+/i, '')) || [])[1];   // FXD-3: a typeless old line moves to the new round with its type (mortar150 fg)
              text = text.replace(tyRe, (m, ty) => !ty || !lack.includes((ty || '').toLowerCase()) ? m.replace(new RegExp(esc, 'i'), !ty && nfTy ? nb + ' ' + nfTy : nb) : m);
              ammoNote = `; ammo/filling ${db} -> ${nb} for ${types.filter(x => !lack.includes(x)).map(x => x || '(none)').join(' ') || 'no type'}`;
              if (lack.length) { rep.add(dkeyR, 0, 'WARN_PORT_AMMO_NOT_MOVED', `new weapon "${best}" shoots ${nb}, donor lines name ${db}; vanilla has no ${nb} ammo of type ${lack.join(', ')}: those lines stay on ${db}, change or drop them by hand [I]`); ammoNote += `; type ${lack.join(', ')} left on ${db}`; }
            }
          } else if (!db || !nb) ammoNote = `; ammo base of ${!db ? dW : best} not readable: filling/item lines are the donor's, check by hand`;
          if (sfh) {   // FIX-PORT tools-other:50: the hand-fit weapon line and a foresight in its place
            let fs0 = 0;
            text = text.replace(/\{\s*weapon\s+"150mm_sfh18"[^}\r\n]*\}/i, () => '{weapon "150mm_sfh18" filling "bullet150 fg" 6}');
            { const wi = text.indexOf('{weapon "150mm_sfh18"'), pi = wi < 0 ? -1 : text.toLowerCase().lastIndexOf('{place', wi);
              if (wi >= 0 && pi >= 0 && !/\{\s*foresight\s/i.test(text.slice(pi, wi))) { const ls = text.lastIndexOf('\n', wi) + 1, ind = /^[ \t]*/.exec(text.slice(ls))[0]; text = text.slice(0, ls) + ind + '{foresight "foresight"}\n' + text.slice(ls); fs0 = 1; } }
            let ty0 = 0; text = text.replace(/\{\s*item\s+"(?:ammo\s+)?bullet150"/gi, () => (ty0++, '{item "bullet150 fg"'));   // sfh18's filling is a bare "bullet150"; vanilla has only bullet150.ap/fg/sm ammo, the hand fit carried "bullet150 fg"
            ammoNote += `; 15cm rule: weapon line {weapon "150mm_sfh18" filling "bullet150 fg" 6}${fs0 ? ', {foresight "foresight"} added to its place' : ''}${ty0 ? ', ' + ty0 + ' typeless bullet150 item line(s) -> "bullet150 fg"' : ''}`;
            rep.add(dkeyR, 0, 'WARN_PORT_MORTAR150_SFH18', `rep "${rW}" (150 mm, not a mortar) would take vanilla mortar150, which never hit in game (MB-R7: 0 hits in 3 runs); gun-class 150mm_sfh18 written instead${wt.action === 'import' ? ' (WPN-1 import of goh_' + rW + ' not written)' : ''}, as the hand fit that killed [V MB-R7]; this output and a "foresight" bone in the rep mdl [T]`);
          }
          if (wt.action === 'import' && !sfh) {   // WPN-1: the def now shoots the local translated entry goh_<rep weapon>, a {from "<template>"} with the GoH numbers through tools/xlate/table.json
            const lk = `set/stuff/${wt.cls}/goh_${rW}.weapon`; let tx = wt.text();
            if (wt.cls === 'reactive' && vanKey.has(best)) { try { tx = reactiveWeapon(vfsLib.readRec(donor.vf.files.get(vanKey.get(best))).toString('latin1'), wt.row, rW, best); } catch (e) { rep.add(dkeyR, 0, 'WARN_XLATE_REACTIVE', `reactive import kept the {from} form: ${e.message}`); } }
            text = text.replace(WRE, m => m.replace(/"([^"]+)"/, (q, n) => wkey(n) === best ? '"' + (/^weapon\s/i.test(n) ? 'weapon ' : '') + 'goh_' + rW + '"' : q));
            putText(lk, tx.replace(/\r?\n/g, '\n'), 'PORT_STUFF_WRITTEN', `WPN-1 [T] ${lk}: GoH weapon ${rW} imported translated, template ${best}`);
            ammoNote += `; WPN-1 import: weapon line -> goh_${rW} (${wt.basis})`;
          }
          // FXE-2 rule 5: a swap into another weapon class than the donor's slot (gun place -> flamethrower/mgun/howitzer entry) breaks the place wiring (aim type, ammo, crew): refused by name
          // (FXD-3 rule 1a swaps a calibre-less donor MG for the rep's cannon on purpose, and keeps that; only a donor gun with a calibre of its own is held to its class)
          // BUILD-6: a rocket launcher has no calibre in its name (t4_20cm) but is no MG carrier: a swap into or out of class reactive is held to the class too
          if (!mortarRep && rcls !== dcls && (dcal > 0 || dcls === 'reactive' || rcls === 'reactive')) {
            rep.add(dkeyR, 0, o.allowMissing ? 'WARN_DONOR_WEAPON_CLASS' : 'ERR_DONOR_WEAPON_CLASS', `FXE-2: donor weapon "${dW}" (class ${dcls}) would be swapped for "${best}" (class ${rcls}) to follow the rep's "${rW}": the place is wired for class ${dcls}, so the weapon class changes ${dcls} -> ${rcls} and the unit is refused; pick a donor whose weapon class is ${rcls}${o.allowMissing ? ' (--allow-missing: not a stop)' : ''} [I]`);
            if (!o.allowMissing) errList.push({ code: 'ERR_DONOR_WEAPON_CLASS', loc: `${dkeyR} ${dW} ${dcls}->${rcls}` });
          }
          rep.add(dkeyR, 0, 'WARN_PORT_WEAPON_SWAPPED', `donor weapon "${dW}" (${dcal || '?'} mm) -> vanilla "${best}" (${calOf(best)} mm), nearest to the rep's "${rW}" (${rcal} mm) in ${mortarRep ? 'mortars' : 'class ' + rcls}${ammoNote}${!mortarRep && rcls !== dcls ? '; class changed from ' + dcls + ': place wiring may not fit [T]' : ''} [I]`);
        } else if (mortarRep && van.has('werfer42') && /^[\w.-]+$/.test(rW) && !van.has(rW)) {
          // FXD-3 rule 3: no vanilla mortar near this calibre. A local stuff entry set/stuff/<class>/<rep weapon>.weapon is written as a copy of vanilla werfer42 (ammo "mortar fg", curved aim, range 110, recharge 5: werfer42's values, not the rep's), and the def points at it. A stuff entry needs: weapon_bullet block, filling "<ammo> <type>", foresight, aimtype curved, range keys, cursors [V from vanilla werfer42]. Damage and range are NOT the rep's [T].
          const wcls = van.get('werfer42'), lk = `set/stuff/${wcls}/${rW}.weapon`;
          text = text.replace(WRE, m => m.replace(/"([^"]+)"/, (q, n) => wkey(n) === dW ? '"' + (/^weapon\s/i.test(n) ? 'weapon ' : '') + rW + '"' : q));
          putText(lk, `; goh2as2 FXD-3 [T]: copy of vanilla werfer42 for rep weapon ${rW} (${rcal} mm); range, damage, rate are werfer42's, not the rep's\n` + vfsLib.readRec(donor.vf.files.get(vanKey.get('werfer42'))).toString('latin1').replace(/\r?\n/g, '\n'), 'PORT_STUFF_WRITTEN', `FXD-3 [T] ${lk}: local mortar weapon, no vanilla mortar within ~10% of ${rcal} mm`);
          rep.add(dkeyR, 0, 'WARN_PORT_MORTAR_LOCAL', `rep mortar "${rW}" (${rcal} mm): no vanilla mortar near it, so the def uses a local copy of werfer42 (${lk}); calibre is NOT matched, range/damage are werfer42's [T]`);
        } else rep.add(dkeyR, 0, 'WARN_PORT_CALIBRE', `rep weapon "${rW}" (${rcal} mm) has no vanilla ${mortarRep ? 'mortar' : rcls} weapon within ~10%${best ? ' (nearest ' + best + ', ' + calOf(best) + ' mm)' : ''}; donor weapon "${dW}" (${dcal ? dcal + ' mm' : 'calibre not in its name'}) kept${mortarRep ? ' (vanilla mortars: ' + pool.join(' ') + ')' : ''} [I]`);
      }
      // FXD-3 rule 1c: a vanilla cannon (class gun, 20 mm or more) left in the written def while every weapon the rep names is a machine gun (GoH class mgun), or the rep names none that GoH has: the rep is MG-only [I: m2a1, cckw]
      {
        const rr = [...new Set(wrefs(rAll).map(wkey))], rc = rr.map(gohCls).filter(Boolean), cannon = wrefs(text).map(wkey).find(n => van.get(n) === 'gun' && calOf(n) >= 20);
        if (cannon && rc.length && rc.every(c => c === 'mgun')) rep.add(dkeyR, 0, 'WARN_PORT_CANNON_ON_MG', `CALIBRE CHECK FAILS: the def keeps cannon "${cannon}" but the rep's weapons (${rr.join(', ')}) are machine guns only: a gun the rep does not have [I]`);
      }
      // FXD-1 rule 3: the round the weapon is loaded with. A donor built on a howitzer/assault gun is loaded with HE (fg); b8r3 pak44 (rep loads apcbche) got 92 hits on t34_0 and no kill with 128mm_pak44 + bullet128 fg, while a vanilla-AP load of the same gun killed in 5.3 s (b8-x3) [V reports; ammo type as cause I].
      // If the rep's first filling is armour-piercing and the donor's is HE, the filling goes to the weapon base's ap (else apcr) round when vanilla has one, and an item line is added for it. An HE rep (type97 loads he) is left as is: that is faithful, warned.
      {
        const AP = /^(ap|apcr|apcbc|apcbche|apds|aphe|hvap|heat|hc)$/i, HE = /^(fg|he|sm)$/i, fm = /\bfilling\s+"((?:ammo\s+)?)([^"\s]+)\s+(\w+)"/i;
        const rf = /\bfilling\s+"(?:ammo\s+)?[^"\s]+\s+(\w+)"/i.exec(rAll), df = fm.exec(text);
        if (rf && df) {
          const hasTy = (b, ty) => donor.vf.files.has('resource/set/stuff/shell/' + b + '.' + ty + '.ammo') || [...donor.vf.files.keys()].some(k => k.startsWith('resource/set/stuff/') && k.endsWith('/' + b + '.' + ty + '.ammo'));
          // SILENT-1F: an AA donor (m19) leaves "bullet37 zenite" and muzzle_zenite after the gun swap. An AP-loaded rep is no AA gun: every line moves to the base's ap (else apcr) round, the muzzle to muzzle_minimum as vanilla 37 mm guns have (ha-go, m5a1). A rep that loads zenite itself never gets here.
          const zty = AP.test(rf[1]) && /^zenite$/i.test(df[3]) ? ['ap', 'apcr'].find(x => hasTy(df[2].toLowerCase(), x)) : null;
          if (zty) {
            text = zeniteToRound(text, df[2], zty);
            rep.add(dkeyR, 0, 'WARN_PORT_FILLING_AP', `rep loads ${rf[1]} first, AA donor loaded ${df[2]} zenite: filling and item lines -> "${df[2]} ${zty}", muzzle_zenite -> muzzle_minimum; "flak", abm_zenite and {Barrels} stay the donor's [I]`);
          } else if (AP.test(rf[1]) && HE.test(df[3])) {
            const ty = ['ap', 'apcr'].find(x => hasTy(df[2].toLowerCase(), x));
            if (ty) {
              const lineRe = new RegExp('^([ \\t]*)\\{item\\s+"(' + df[1] + ')' + df[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + df[3] + '"\\s+(\\d+)\\}[ \\t]*\\r?$', 'im');
              text = text.replace(fm, (m, pre, b) => `filling "${pre}${b} ${ty}"`);
              const li = lineRe.exec(text);
              if (li && !new RegExp('"' + df[1] + df[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+' + ty + '"', 'i').test(text.replace(fm, ''))) text = text.slice(0, li.index + li[0].length) + '\n' + li[1] + `{item "${df[1]}${df[2]} ${ty}" 20}` + text.slice(li.index + li[0].length);
              rep.add(dkeyR, 0, 'WARN_PORT_FILLING_AP', `FXD-1 rep loads ${rf[1]} first, donor loaded ${df[3]} (HE: no tank kill seen with it, pak44 92 hits); filling -> "${df[2]} ${ty}"${li ? ', item line added' : ', no item line of the old type to copy: add one by hand'} [I]`);
            } else rep.add(dkeyR, 0, 'WARN_PORT_FILLING_HE', `rep loads ${rf[1]} first, donor loads ${df[3]} and vanilla "${df[2]}" has no ap/apcr round: HE may not kill armour [I]`);
          } else if (HE.test(rf[1]) && HE.test(df[3])) rep.add(dkeyR, 0, 'WARN_PORT_FILLING_HE', `rep loads ${rf[1]} first, so ${df[3]} is faithful; type97 3-way test shows HE with 40-45 hits did not kill t34_0 on as64 (M3-RR-T): an AP/apcr load is the hand-fit way [T]`);
        }
      }
      // donor armour far from the rep's: armor_<class> macro rank, or the thickness differing 2x or more; FXC-4 gap 4: also the rep's own {front N} / {thickness N} (its def plus included .ext) against the donor's macro args, 1.5x or more
      const rank = s => { const m = /\(\s*"armor_([a-z0-9]+)"/i.exec(s); if (!m) return 0; const c = m[1].toLowerCase(); return /light|small|tiny/.test(c) ? 1 : /medium|mid/.test(c) ? 2 : /heavy|super|big/.test(c) ? 3 : 0; };
      const nums = (s, re) => [...s.matchAll(re)].map(m => parseFloat(m[1]));
      const thick = s => Math.max(0, ...nums(s, /\{\s*thickness\s+(\d+)/gi));
      const macroArm = s => Math.max(0, ...[...s.matchAll(/\(\s*"armor_[a-z0-9_]+"([^)\r\n]*)\)/gi)].flatMap(m => [...m[1].matchAll(/\w+\(\s*(\d+(?:\.\d+)?)/g)].map(x => parseFloat(x[1]))));
      const frontOf = s => Math.max(0, ...nums(s, /\{\s*front\s+(\d+(?:\.\d+)?)\s*\}/gi));
      const dr = rank(text), rr = rank(donor.repSrc), dt = thick(text), rt = thick(donor.repSrc);
      const dM = macroArm(text) || frontOf(text) || dt, rM = frontOf(rAll) || thick(rAll) || macroArm(rAll);
      if ((dr && rr && Math.abs(dr - rr) >= 2) || (dt && rt && (dt >= 2 * rt || rt >= 2 * dt)) || (dM && rM && (dM >= 1.5 * rM || rM >= 1.5 * dM)))
        rep.add(dkeyR, 0, 'WARN_PORT_ARMOUR', `donor armour (class rank ${dr || '?'}, max thickness ${dt || '?'}, front/macro ${dM || '?'}) is far from the rep's (rank ${rr || '?'}, thickness ${rt || '?'}, front/thickness ${rM || '?'}): hit points and penetration will not match the rep [I]`);
    }
    let types = null; try { types = boneTypesOf(decodeText(readEnt(idx.map.get(donor.mk))).src); } catch { /* no bone info */ }
    if (types) text = stripPlainBones(text, 'resource/' + dkey, rep, types);
    else rep.add('resource/' + dkey, 0, 'WARN_PORT_DONOR_NO_BONES', 'rep mdl unreadable: plain-bone rule not applied');
    readerCheck(rep, 'resource/' + dkey, text, types);
    if (xl && xl.cls) {   // XLATE-2 static native check against the class peers, and the record GUI/score read
      const TR = require('./translate'); let nat = null, arm = null;
      try { nat = TR.nativeCheck(text, dkey, xl.cls, donor.vf, vfsLib); } catch (e) { nat = { checked: 0, misses: [], note: 'check failed: ' + e.message }; }
      try { arm = TR.armourRead(text, dkey, donor.vf, vfsLib); } catch (e) { arm = null; }
      if (nat.misses.length) rep.add('resource/' + dkey, 0, 'WARN_XLATE_NATIVE', `${nat.misses.length} of ${nat.checked} key paths are held by no AS2 ${xl.cls} peer: ${nat.misses.slice(0, 12).join(', ')}${nat.misses.length > 12 ? ' ...' : ''} [I]`);
      else rep.info('resource/' + dkey, 0, 'XLATE_NATIVE', `static native check: ${nat.checked} key paths, every one held by an AS2 ${xl.cls} peer [V on the table]`);
      xl.nativeResult = nat; xl.armourWritten = arm;
      if (o.xlateJson) fs.writeFileSync(o.xlateJson, JSON.stringify({ unit: xl.unit, cls: xl.cls, wrote: xl.wrote, skipped: xl.skipped, listed: xl.listed, asked: xl.asked, answers: xl.asker.log, crew: xl.crew, native: nat, armourWritten: arm }, null, 1));
    }
    { // T-PORTGAP: the rep's own def (and its same-folder .def/.ext, never written in donor mode) is replaced by the vanilla donor def: every key there is left to the donor,
      // except what XLATE-2 wrote (baked, by table key) and what it listed and did not translate
      const D = `--donor ${donor.stem}: the vanilla def ${donor.defKey} supplies this unit's data; the GoH value is not carried`;
      for (const k of [...idx.map.keys()].filter(x => x.slice(0, x.lastIndexOf('/')) === donor.repKey.slice(0, donor.repKey.lastIndexOf('/')) && /\.(def|ext)$/.test(x) && (x === donor.repKey || x.slice(0, x.lastIndexOf('.')) === donor.repKey.slice(0, donor.repKey.lastIndexOf('.')))).sort()) {
        let ps = []; try { ps = keyPaths(decodeText(readEnt(idx.map.get(k))).src); } catch { ps = []; }
        if (!owner.has(k) || owner.get(k) === 'keys') owner.set(k, donor.repKey);   // the rep's sibling .ext was never wanted: it belongs to the rep, not to 'keys'
        gapList.push({ file: k, line: 0, kind: 'donor', code: 'PORT_DONOR_DEF', key: '*', paths: ps, reason: D });
      }
      if (xl) {
        for (const w of xl.wrote || []) gapList.push({ file: donor.repKey, line: 0, kind: 'baked', code: 'XLATE_WRITE', key: String(w.key), paths: [], reason: `XLATE-2 GoH ${w.goh === undefined ? '-' : w.goh} -> ${w.value} written into the donor def (donor had ${w.donor === null ? 'none' : w.donor}; ${w.mode}${w.note ? '; ' + w.note : ''})` });
        for (const l of xl.listed || []) gapList.push({ file: donor.repKey, line: 0, kind: 'donor', code: 'WARN_XLATE_LISTED', key: String(l), paths: [], reason: 'XLATE-2 listed, not translated: the donor value stands' });
      }
    }
    putText(dkey, text, 'PORT_DONOR_DEF', `donor def ${donor.defKey} (vfs): Extension "${raw}" -> "${newVal}", mdl folder files in ${donor.destDir}/ (PORT-129, PORT-131)`);
  }
  const readAs2 = k => { try { return decodeText(readEnt(as2idx.map.get(k))).src; } catch { return null; } };
  const outKey = k => propsShadow.get(k) || k;
  if (o.entities || o.keys) {
    let nation = (o.nation || 'ger').toLowerCase();
    if (as2idx && !as2idx.map.has(`set/breed/mp/${nation}/veterancy_generic.inc`)) {
      rep.add('-', 0, 'WARN_PORT_INF_NATION', `PORT-125 [I] AS2 has no set/breed/mp/${nation}/veterancy_generic.inc: breeds use ger`);
      nation = 'ger';
    }
    const men = [], weapons = [];   // men: {stem, key}; weapons: {item, cls, ent, key}
    for (const k of want.keys()) {
      if (/^entity\/humanskin\/.*\.def$/.test(k)) men.push({ stem: k.slice(k.lastIndexOf('/') + 1, -4), key: k });
      else if (/^entity\/inventory\/.*\.def$/.test(k)) {
        let src; try { src = decodeText(readEnt(idx.map.get(k))).src; } catch { continue; }
        const defStem = k.slice(k.lastIndexOf('/') + 1, -4);
        for (const item of stuffItems(src)) {
          const it = item.toLowerCase(), sk = [...idx.map.keys()].find(x => new RegExp('^set/stuff/[^/]+/' + it.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\.[a-z]+)?$').test(x));
          if (!sk && o.grenadeStuff && /^grenade\s+\S/i.test(item)) { weapons.push({ item, cls: 'grenade', ent: defStem, key: k, grenade: true }); continue; }   // FXC-3 gap 8
          if (!sk) { rep.add('resource/' + k, 0, 'WARN_PORT_INF_NO_STUFF', `PORT-124 [I] item "${item}" has no GoH set/stuff/<class>/${item}: no stuff entry written, write one by hand`); continue; }
          const cls = sk.split('/')[2];
          let ent = defStem;
          try { const m = /\{\s*entity\s+"([^"]+)"/i.exec(decodeText(readEnt(idx.map.get(sk))).src); if (m) ent = m[1]; } catch { /* keep def stem */ }
          if (cls === 'grenade') { rep.add('resource/' + k, 0, 'WARN_PORT_INF_GRENADE', `PORT-124 [I] item "${item}" is a grenade: by hand, set/stuff/grenade/02 grenade_at/${item}.grenade with {inventory {size 2 1}} (plan/reports/b8-inf.md)`); continue; }
          if (!PATTERN_CLASSES.has(cls)) { rep.add('resource/' + k, 0, 'WARN_PORT_INF_CLASS', `PORT-124 [I] item "${item}" is class "${cls}": no "pattern ${cls}" known in AS2, write the stuff entry by hand`); continue; }
          weapons.push({ item, cls, ent, key: k });
        }
      }
    }
    const wanted = new Set();   // stuff entries written, so two weapons never write one file twice
    for (const w of weapons) {
      if (w.grenade) {   // FXC-3 gap 8: no GoH stuff entry; write the vanilla grenade_at pattern entry, entity = the GoH inventory def stem [T that the entity resolves]
        const gk = `set/stuff/grenade/02 grenade_at/${w.item.replace(/^grenade\s+/i, '')}.grenade`;
        if (wanted.has(gk)) continue; wanted.add(gk);
        let ptn = 'grenade_at', inv = '{inventory {size 2 1}}';
        if (as2idx) {
          const tk = [...as2idx.map.keys()].filter(x => /^set\/stuff\/grenade\/02 grenade_at\/[^/]+\.grenade$/.test(x)).sort()[0], tt = tk && readAs2(tk);
          const pm = tt && /\{\s*from\s+"pattern ([^"]+)"/.exec(tt), im = tt && /\{\s*inventory[^\r\n]*\}\s*(?=[\r\n\t]|$)/.exec(tt);
          if (pm) ptn = pm[1]; if (im) inv = im[0].trim();
        } else rep.add('-', 0, 'WARN_PORT_INF_NO_TEMPLATE', `PORT-124 [I] no --game: grenade entry ${gk} written from the built-in grenade_at shape`);
        putText(gk, `; goh2as2 FXC-3 [T]: vanilla pattern, not GoH damage\n{from "pattern ${ptn}"\n\t${inv}\n\t{entity "${w.ent}"}\n}\n`, 'PORT_STUFF_WRITTEN', `FXC-3 [T] ${gk}: {from "pattern ${ptn}"} {entity "${w.ent}"}, in place of INF_NO_STUFF`);
        w.ammo = null; continue;
      }
      const sKey = `set/stuff/${w.cls}/${w.item}`;
      if (wanted.has(sKey)) continue; wanted.add(sKey);
      // template: a vanilla item of the same class (mauzer for rifle, else the first one by name) gives ammo, sounds and speed; those are a guess, not GoH's values
      let tmpl = null, tname = null;
      if (as2idx) {
        const cands = [...as2idx.map.keys()].filter(x => new RegExp('^set/stuff/' + w.cls + '/[^/.]+$').test(x)).sort();
        const pref = `set/stuff/${w.cls}/mauzer`;
        for (const c of (cands.includes(pref) ? [pref] : []).concat(cands)) {
          const t = readAs2(c);
          if (t && new RegExp('^\\s*\\{from\\s+"pattern ' + w.cls + '"').test(t)) { tmpl = t; tname = c.slice(c.lastIndexOf('/') + 1); break; }
        }
      }
      w.ammo = 'ammo rifle';
      let text;
      if (tmpl) {
        const am = /\{\s*filling\s+"([^"]+)"/i.exec(tmpl); if (am) w.ammo = am[1];
        text = tmpl.replace(/\{\s*entity\s+"[^"]*"\s*\}/i, `{entity "${w.ent}"}`).replace(/\s+$/, '') + '\n';
        text = `; goh2as2 PORT-124 [T]: ammo, sounds, speed copied from vanilla "${tname}", not GoH's values\n` + text;
      } else {
        text = `; goh2as2 PORT-124 [T]: no --game template, ammo/sounds/speed by hand\n{from "pattern ${w.cls}"\n\t{entity "${w.ent}"}\n}\n`;
        rep.add('-', 0, 'WARN_PORT_INF_NO_TEMPLATE', `PORT-124 [I] no vanilla ${w.cls} item to copy (give --game): ${sKey} has only from/entity`);
      }
      // WPN-1 (Q49): a hand weapon the table imports (type38's slow rifle) is the GoH numbers through tools/xlate/table.json on a vanilla template, not the template's own values
      if (!o.noWpnTable && as2idx) {
        const wi = wpnRule(w.item, null, { has: n => as2idx.map.has(`set/stuff/${w.cls}/${n}`) }), wtx = wi.action === 'import' && wi.text({ entity: w.ent });
        if (wtx) { text = wtx; rep.add('-', 0, 'WARN_PORT_WPN_IMPORT', `WPN-1 [T] ${sKey}: GoH weapon "${w.item}" imported translated on template ${wi.tmpl} (${wi.basis})`); }
      }
      putText(sKey, text, 'PORT_STUFF_WRITTEN', `PORT-124 [T] ${sKey}: {from "pattern ${w.cls}"} {entity "${w.ent}"}${tname ? ' + values of ' + tname : ''}`);
    }
    // breeds: one per man (default weapon mauzer), one per weapon (skin ger_t2) so the weapon can be tried without a GoH skin
    for (const m of men) {
      const bk = `set/breed/mp/goh/${safeName(m.stem)}.set`;
      putText(bk, breedText(m.stem, nation, ['{item "mauzer" filled}', '{item "ammo rifle" 100}', '{item "bandage" 3}']), 'PORT_BREED_WRITTEN', `PORT-124 [T] ${bk}: {skin "${m.stem}"}, nation ${nation}, absolute veterancy include (PORT-125)`);
    }
    for (const w of weapons) {
      const bk = `set/breed/mp/goh/w_${safeName(w.item)}.set`;
      putText(bk, breedText('ger_t2', nation, w.grenade ? [`{item "${w.item}" 3}`, '{item "bandage" 3}'] : [`{item "${w.item}" filled}`, `{item "${w.ammo}" 100}`, '{item "bandage" 3}']), 'PORT_BREED_WRITTEN', `PORT-124 [T] ${bk}: carries "${w.item}" (skin ger_t2)`);
    }
    // PORT-126: GoH stuff_small.ext (shadowed to properties/goh/) ends in (include "stuff.ext"), which dangles
    const wrote = new Set([...want.keys()].map(outKey));
    if (wrote.has('properties/goh/stuff_small.ext') && !wrote.has('properties/goh/stuff.ext'))
      putText('properties/goh/stuff.ext', ';SDL\n(include "/properties/stuff.ext")\n', 'PORT_STUB_WRITTEN', 'PORT-126 [V loads, T weapon effect] properties/goh/stuff.ext stub: its (include "stuff.ext") would dangle');
  }
  let fitResult = null;
  if (donor && !o.dry) {   // XLATE-5: the finished unit is checked on disk
    const FP = require('./fitpass'), dkeyF = 'resource/' + (o.repKey ? donor.destDir + '/' + donor.repName + '.def' : donor.defKey.slice('resource/'.length)), mdlKeyF = 'resource/' + donorKey(donor.mk);
    // (1) every file the output mdl / plys / def name exists in the output or in vanilla; else the build stops
    for (const m of FP.fileCheck({ outDir: o.out, mdlKey: mdlKeyF, defKey: dkeyF, vf: donor.vf, implicitAnms })) {
      rep.add(m.from, 0, o.allowMissing ? 'WARN_DONOR_FILE_MISSING' : 'ERR_DONOR_FILE_MISSING', `XLATE-5: "${m.name}" (${m.key}) is in neither the output nor vanilla AS2: the game stops at load (Resource not found) [I]${o.allowMissing ? ' (--allow-missing: not a stop)' : ''}`);
      if (!o.allowMissing) errList.push({ code: 'ERR_DONOR_FILE_MISSING', loc: `${m.from} ${m.key}` });
    }
    // (5) a bone/door/aim the mdl lacks: donorfit finds it, fitpass edits the def
    if (!o.noFitPass) {
      const fp = FP.fitPass({ defKey: dkeyF, outDir: o.out, mdlKey: mdlKeyF, game: as2, exe: o.exe, rep: donor.repName || path.basename(donor.repKey, '.def'), vf: donor.vf, vfsLib, donorfit: require('../donorfit/donorfit.js'), allowMissing: o.allowMissing });
      for (const r of fp.refuse || []) {   // FXE-2: what is left and stops the game at load is a refusal by name
        rep.add(dkeyF, 0, o.allowMissing ? 'WARN_' + r.code.slice(4) : r.code, `FXE-2: ${r.text} [I]${o.allowMissing ? ' (--allow-missing: not a stop)' : ''}`);
        if (!o.allowMissing) errList.push({ code: r.code, loc: `${dkeyF} ${r.text.slice(0, 80)}` });
      }
      for (const a of fp.applied) rep.info(dkeyF, 0, 'XLATE_FIT_APPLIED', a);
      for (const g of fp.gaps || []) gapList.push({ file: donor.repKey, line: 0, kind: g.kind, code: g.code, key: g.key, paths: [], reason: g.reason });   // T-DONORFIT: place renames / shield volume drops / unmapped places
      for (const a of fp.seatMap || []) rep.info(dkeyF, 0, 'SEAT_MAP', `FXE-1: ${a}`);
      for (const b of fp.seatBad || []) {   // FXE-1: a seat that cannot work fails the build by name
        rep.add(dkeyF, 0, o.allowMissing ? 'WARN_DONOR_SEAT' : 'ERR_DONOR_SEAT', `FXE-1: ${b} [I]${o.allowMissing ? ' (--allow-missing: not a stop)' : ''}`);
        if (!o.allowMissing) errList.push({ code: 'ERR_DONOR_SEAT', loc: `${dkeyF} ${b}` });
      }
      for (const l of fp.left) rep.add(dkeyF, 0, 'WARN_XLATE_FIT_LEFT', `XLATE-5: donorfit still reports ${l} [T]`);
      fitResult = fp;
    }
  }
  idx.ps.close(); for (const b of baseIdxs) b.ps.close(); if (as2idx) as2idx.ps.close();
  // T-PORTGAP: <out>/gaps/<unit>.gaps.json per unit (entity def key, or 'keys' for --keys files no entity reached). Sorted, no paths or times: byte-stable.
  let gapFiles = 0;
  if (!o.dry) {
    const units = new Map();   // owner key -> entries
    for (const u of new Set([...owner.values()])) units.set(u, []);
    for (const g of gapList) { const u = owner.get(g.file) || 'keys'; if (!units.has(u)) units.set(u, []); units.get(u).push(g); }
    const stemOf = u => u === 'keys' ? 'keys' : donor && o.repKey && u === donor.repKey ? donor.repName : u.slice(u.lastIndexOf('/') + 1).replace(/\.def$/, '');
    const names2 = new Map(), taken = new Map();
    for (const u of [...units.keys()].sort()) { const s = safeName(stemOf(u)); taken.set(s, (taken.get(s) || 0) + 1); names2.set(u, s); }
    for (const u of [...units.keys()].sort()) if (taken.get(names2.get(u)) > 1) names2.set(u, safeName(u.replace(/\.def$/, '').replace(/\//g, '_')));
    const ord = (a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0);
    for (const [u, list] of [...units].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
      if (u === 'keys' && !o.keys && !list.length) continue;
      const files = [...owner].filter(([, v]) => v === u).map(([k]) => k).sort();
      const counts = { dropped: 0, baked: 0, donor: 0, hand: 0, unexplained: 0 }, byCode = {};
      for (const g of list) { counts[g.kind] = (counts[g.kind] || 0) + 1; const bk = g.kind + ' ' + g.code, c = byCode[bk] || (byCode[bk] = { kind: g.kind, code: g.code, entries: 0, keys: 0 }); c.entries++; c.keys += g.paths.length; }
      const j = { tool: 'goh2as2', form: 'gaps/1', unit: names2.get(u), def: u === 'keys' ? null : u, mode: donor && u === donor.repKey ? 'donor ' + donor.stem : u === 'keys' ? 'keys' : 'convert',
        kinds: { dropped: 'removed from the written file (or the whole file not written)', baked: 'turned into a value or renamed in place', donor: 'left to the vanilla donor def', hand: 'kept as GoH wrote it, AS2 needs a hand rewrite', unexplained: 'gone from the output with no rule recorded (tool gap)' },
        counts, byCode: Object.fromEntries(Object.entries(byCode).sort()), files,
        moved: Object.fromEntries(files.map(k => [k, propsShadow.get(k) || texRename.get(k) || donorKey(k)]).filter(([k, v]) => v !== k)),   // GoH key -> the key it was written under (shadowed props, renamed textures, donor folder)
        gaps: list.slice().sort(ord) };
      const p = path.join(o.out, 'gaps', names2.get(u) + '.gaps.json');
      fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(j, null, 1) + '\n'); gapFiles++;
    }
  }
  if (o.textOnly && !o.dry) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(path.join(o.out, 'text-only.tsv'), textOnlySkipped.length ? [...new Set(textOnlySkipped)].sort().join('\n') + '\n' : ''); rep.info('text-only.tsv', 0, 'PORT_TEXT_ONLY', `NAT-CONV: ${textOnlySkipped.length} binary file(s) not written, keys in text-only.tsv`); }
  if (!o.dry && gohOrigin.length) { const lf = require('./origin').record(o.out, gohOrigin); rep.info(path.basename(lf), 0, 'PORT_GOH_ORIGIN', `rev-port #3: ${gohOrigin.length} file(s) made from GoH data listed in ${lf}; this mod carries GoH assets: do not publish it without a yes`); }
  if (o.mod || donor) {   // --mod (and --donor): write mod.info (UTF-8 CRLF, MinGameVersion 3.301; mowas2 target: 3.262.0..3.262.1) if missing
    const mi = path.join(o.out, 'mod.info');
    if (fs.existsSync(mi)) rep.info('mod.info', 0, 'PORT_MODINFO_EXISTS', 'mod.info present; left untouched');
    else if (!o.dry) { fs.mkdirSync(o.out, { recursive: true }); fs.writeFileSync(mi, Buffer.from(['{Mod', ` {Name "${path.basename(path.resolve(o.out)).replace(/"/g, '')}"}`, ...TG.modInfoLines(tgt), '}', ''].join('\r\n'), 'utf8')); }
  }
  // C2d (MB-R13 port-build:89): a ported unit with no desc/entity key shows "{}" in the kill feed and on the buy card. --mod/--donor run the
  // unitname stage (GoH English name, near key, else a name from the key) into localization/#goh2as2_names.lng; vanilla and mod keys are never
  // overwritten. Its findings are copied as info (a fallback name does not fail the port). --no-names skips it.
  let unames = null;
  if (!o.dry && !o.noNames && written.length && (o.mod || donor)) {
    try {
      const un = require('./unitname');
      const hBase = (o.bases && o.bases[0]) || o.goh;
      unames = un.run({ mod: o.out, goh: hBase, gohMods: o.bases && o.bases.length ? [o.goh] : [], game: as2 && fs.existsSync(as2) ? as2 : null, file: '#goh2as2_names.lng' });
      const j = unames.rep.toJSON({ tool: 'unitname' });
      for (const f of j.findings) rep.info(f.file, f.line, 'PORT_' + f.code, f.msg);
    } catch (e) { rep.add(o.out, 0, 'WARN_PORT_NAMES_FAILED', 'unit names not written: ' + e.message); }
  }
  // C2d (port-build:88): the engine names an entity by the def title before the first dot, so <t>.unfit.def beside <t>.def (old
  // donorfit backups; c39_rp3 holds 58) or a second <t>.def elsewhere in the mod loads twice: `Entity redefinition: <t>`. Warn by name; nothing is moved.
  if (!o.dry && (o.mod || donor)) for (const d of entityRedefs(path.join(o.out, 'resource', 'entity'))) rep.add(d.file, 0, 'WARN_PORT_ENTITY_REDEF', `entity "${d.title}" is also defined by ${d.other}: the game logs "Entity redefinition: ${d.title}" and keeps one${/\.[^.]+\.def$/i.test(d.file) ? ' (side copy: rename it to <t>.def.unfit or delete it)' : ''}`);
  const extra = [`${o.dry ? 'would write' : 'wrote'} ${nText} text + ${nBin} binary file(s) (${(nBytes / 1048576).toFixed(1)} MB) to ${o.out}; ${nSkip} skipped; ${want.size} wanted (closure ${[...want.values()].filter(w => w !== 'entity' && w !== 'key').length} pulled by reference/sibling)`];
  if (gapFiles) { const n = k => gapList.filter(g => g.kind === k).length; extra.push(`gap list (T-PORTGAP): ${gapFiles} unit file(s) in ${path.join(o.out, 'gaps')}: ${n('dropped')} dropped, ${n('baked')} baked, ${n('donor')} donor, ${n('hand')} hand, ${n('unexplained')} unexplained entr${n('unexplained') === 1 ? 'y' : 'ies'}`); }
  extra.push(as2idx ? `vanilla keys shadowed (rev-port #10): PORT_SHADOWS_VANILLA ${shadowN} file(s) written at a key AS2 has with other bytes` : 'vanilla keys shadowed (rev-port #10): not checked (no --game)');
  if (unames && unames.counts) extra.push(`unit names (C2d): ${unames.counts.units} unit(s) in ${unames.out}: GoH ${unames.counts.goh}, near ${unames.counts.near}, from key ${unames.counts.fallback}, vanilla kept ${unames.counts.vanilla}, mod kept ${unames.counts.mod}`);
  if (fitResult) extra.push(`fit pass (XLATE-5): ${fitResult.applied.length} edit(s), ${fitResult.left.length} donorfit miss(es) left after ${fitResult.rounds} round(s)`);
  if (fxSeen.size) extra.push(`fx sprites (GOH2-FX): ${fxSeen.size} named: ${fxStat.pulled} pulled from GoH, ${fxStat.as2} left to vanilla AS2${as2idx ? '' : ' (no --game: none checked)'}, ${fxStat.missing} missing`);
  if (chk) extra.push(`closure check: ${chk.refs} file names checked: ${chk.closure} in the closure, ${chk.as2} in vanilla AS2${as2idx ? '' : ' (no --game: not checked)'}, ${chk.missing.length} missing`);
  let kl = null;
  if (!o.dry && !o.noKeylint && written.length && fs.existsSync(as2)) {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'keylint', 'keylint.js'), o.out, '--game', as2, ...TG.exeFlag(o.exe), '-q'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const m = /(\d+) findings/.exec(r.stdout || '');
    kl = m ? +m[1] : null;
    extra.push(`keylint on ${o.out}: ${kl === null ? 'failed to run' : kl + ' findings'} (informational)`);
  }
  const f = Object.assign({}, o.fmt, { output: o.fmt.output || null });
  cli.rcPrint(rep, f, o.out, 'goh2as2', { showInfo: !o.q, byCode: false });
  for (const l of extra) (f.format && f.format !== 'text' ? console.error : console.log)(l);
  if (errList.length) {   // BG-3 + XLATE-5: the last line says why the code is 1 (a caller that keeps only the last 3 lines saw "0 missing" and no reason). Format: exit 1: N CODE, first: <where> <why>; CODE is the first error's, N counts that code
    process.exitCode = 1;
    const e0 = errList[0], n = errList.filter(e => e.code === e0.code).length;
    (f.format && f.format !== 'text' ? console.error : console.log)(`exit 1: ${n} ${e0.code}, first: ${e0.loc}`);
  }
  return { rep, kl };
}
module.exports = { keyPaths, stuffNameGaps, STUFF_NAME_DROPS, BURST_SUBKEYS, SPREADING_SUBKEYS, skipSetKind, SKIP_TOP_SETS, fixRenamedDefines, definesOf, entityRedefs, PROP_DEFINE_MAP, PROP_NAMES, mdlKeyOf, reactiveWeapon, convertText, evalArith, fixHashTags, buildIndex, readEnt, decodeText, boneTypesOf, zeniteToRound };   // before main runs: xlate.js requires this file back for fixHashTags
if (require.main === module) cli.run(main);
