#!/usr/bin/env node
// humlint: human/infantry data linter (vitality, health_damage actions, perks/abilities, breeds, inventory box, stance FSM, .mdl duration).
// rows HUM-01 HUM-03 HUM-07 HUM-14 HUM-16 HUM-18 HUM-23 HUM-29 HUM-31 (all re-verified against src; HUM-13 = keylint WARN_PERK_LEVEL, HUM-31 track limit = binhdr ANM_BONE_LIMIT / expcheck)
// usage: node tools/humlint/humlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary]
//        node tools/humlint/humlint.js --vfs --game <dir> [--mods a,b] [--exe X]   (whole mounted vfs)
//   --exe X  the game whose vfs view is read (lib/cli common option, lib/games): none = as before (as64 when as64.exe is in the folder);
//            mowas_2 = no as64/core; goh = the GoH install when no --game. The HUM rules are AS2 source rows; for GoH they are [I]
//            (a full vanilla GoH --vfs run: quiet but for the case below). GoH: HUM_VETERANCY_TIED is not reported for ranks tied at a
//            negative threshold: vanilla GoH gives a rank from spawn that way (perks/veterancy.inc, narrator breeds: every rank -1;
//            the spawn rank follows the veterancy perks, GHHUM-19) [I].
// codes: HUM_VITALITY_KEY (01)  HUM_STAMINA_ROW (03)  HUM_DAMAGE_KEY HUM_THROW_EFFECTS (07)  HUM_ABILITY_BASE HUM_ABILITY_NO_LEVELS (14)
//        HUM_POSTURE_RELOAD (16)  WARN_HUM_BREED_UNKNOWN (18)  HUM_BOX_SIZE_INT8 WARN_HUM_USER_AMOUNT (23)
//        HUM_FSM_SPLIT_ORDER HUM_FSM_DYING_EDGES (29)  HUM_DURATION_ZERO (31, `{duration frames 0}`; the .anm track limit lives in binhdr/expcheck)
// Author: Imperator_Aug (ARSENAL, ia-4f2e87a6)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const path = require('path');
const sdlset = require('../lib/sdlset');
const { createReport } = require('../lib/report'), cli = require('../lib/cli');

const BLOCK = 'BLOCK';
const low = s => String(s).toLowerCase();
const txt = it => it.k === 'STRING' ? it.value : it.text;
const nameOf = b => { const f = b.items && b.items[0]; return f && (f.k === 'IDENT' || f.k === 'STRING') ? low(txt(f)) : null; };
const subs = b => b.items.filter(i => i.k === BLOCK);
const args = b => b.items.slice(1).filter(i => i.k !== BLOCK);
const sub = (b, n) => subs(b).filter(s => nameOf(s) === n);

const KINDS = 'avoidance melee health speed stealth vision specialvision specialattack weapon veterancy health_regeneration stamina stamina_regeneration tank vehicle cannon weapon_reload'.split(' ');
const LEVELED = new Set('avoidance melee health health_regeneration stamina stamina_regeneration weapon_reload weapon'.split(' '));
const INC_ROWS = new Set(['stay', 'walk', 'slow', 'normal', 'fast']);
const MOVE_MODES = new Set('slow normal fast walk bow assault spot sneak'.split(' '));   // enum names<movement mode> minus none (-> unexpected token)
const HEALTH_KEYS = new Set(['max', 'current', 'inc']);
const STAMINA_KEYS = new Set(['max', 'current', 'movement_limits', 'inc', 'load']);
const DAMAGE_ACTIONS = new Set(['health_damage_pierce', 'health_damage_blast', 'health_damage_count', 'health_damage_blow']);   // crush has its own 2-string reader
const POSTURES = new Set(['stand', 'squat', 'crawl', 'cover', 'vehicle', 'default']);

function check(opts) {
  const rep = createReport();
  let mods = opts.mods;
  if (!mods && opts.folder && opts.gameDir && path.basename(path.dirname(path.resolve(opts.folder))).toLowerCase() === 'mods') mods = [path.basename(path.resolve(opts.folder))];
  const src = sdlset.createSource({ gameDir: opts.gameDir, mods, folder: opts.folder, exe: opts.exe });
  const isGoh = (src.v ? src.v.exe : opts.exe) === 'goh';   // the game the vfs used (a GoH folder with no --exe is goh too)
  const items = new Map();
  if (opts.vfs) for (const t of src.vfsItems()) items.set(t.key, t);
  else { for (const t of src.modItems()) items.set(t.key, t); for (const t of src.folderItems()) items.set(t.key, t); }

  // all keys visible (folder over vfs): for breeds, abilities, stuff
  const allKeys = new Set(src.local.keys());
  if (src.v) for (const k of src.v.files.keys()) allKeys.add(k);
  const readKey = key => { try { return src.read({ key, file: key, get: () => src.get(key) }, () => {}); } catch (e) { return null; } };

  const seen = new Set();
  const add = (n, t, code, msg) => {
    const f = (n && n.file) || t.file, l = (n && n.line) || 0, id = f + ':' + l + ':' + code;
    if (seen.has(id)) return; seen.add(id);
    rep.add(f, l, code, msg);
  };

  // ---- ability registry: name -> { base, levels } (from set/ability/*.set; HUM-14/16)
  let abil = null;
  const abilities = () => {
    if (abil) return abil;
    abil = { defs: new Map(), blocks: [] };
    for (const k of [...allKeys].sort()) {
      if (!/^resource\/set\/ability\/.*\.set$/.test(k)) continue;
      const r = readKey(k); if (!r) continue;
      for (const b of subs(r.root)) {
        const name = nameOf(b); if (name == null) continue;
        let base = name;
        const a = args(b);
        if (a[0] && a[0].k === 'IDENT' && low(a[0].text) === 'from' && a[1]) base = low(txt(a[1]));
        abil.blocks.push({ b, name, base, key: k });
        const d = abil.defs.get(name) || { base, own: 0 };
        if (base !== name) d.base = base;
        d.own += sub(b, 'level').length;
        abil.defs.set(name, d);
      }
    }
    return abil;
  };
  const rootKind = (name, depth = 0) => {   // builtin kind a name derives from, or null
    if (depth > 20) return null;
    if (KINDS.includes(name) && !(abilities().defs.get(name) && abilities().defs.get(name).base !== name)) return name;
    const d = abilities().defs.get(name);
    if (!d) return KINDS.includes(name) ? name : null;
    if (d.base === name) return KINDS.includes(name) ? name : null;
    return rootKind(d.base, depth + 1);
  };
  const levelCount = (name, depth = 0) => {
    if (depth > 20) return 0;
    const d = abilities().defs.get(name); if (!d) return 0;
    return d.own + (d.base !== name ? levelCount(d.base, depth + 1) : 0);
  };

  // ---- breed names (HUM-18)
  let breeds = null;
  const breedNames = () => {
    if (breeds) return breeds;
    breeds = new Set();
    for (const k of allKeys) { const m = /^resource\/set\/breed\/(.+)\.set$/.exec(k); if (m) breeds.add(m[1]); }
    return breeds;
  };

  // ---- stuff stackable heuristic (HUM-23): stuff files whose path words contain all item tags
  let stuffs = null;
  const stuffList = () => {
    if (stuffs) return stuffs;
    stuffs = [];
    for (const k of allKeys) {
      if (!k.startsWith('resource/set/stuff/') || k.includes('/_settings/') || k.endsWith('/.presets')) continue;
      const words = new Set(k.slice('resource/set/stuff/'.length).split(/[\/.]/).filter(Boolean));
      stuffs.push({ key: k, words });
    }
    return stuffs;
  };
  const stackable = tags => {   // true | false | null (unresolved)
    const T = tags.split(/\s+/).filter(Boolean).map(low);
    if (!T.length) return null;
    const c = stuffList().filter(s => T.every(t => s.words.has(t)));
    if (!c.length) return null;
    return c.some(s => { const b = src.get(s.key); return b && /stackable/i.test(b.toString('latin1')); });
  };

  const visit = (t, n, parents) => {
    const name = nameOf(n);
    if (name == null) return;
    const underInv = parents.some(p => p.name === 'extender' && p.arg === 'inventory');
    // HUM-01 / HUM-03 vitality
    if (name === 'extender' && args(n)[0] && low(txt(args(n)[0])) === 'vitality') {
      for (const h of sub(n, 'health')) for (const k of subs(h)) { const kn = nameOf(k); if (kn != null && !HEALTH_KEYS.has(kn)) add(k, t, 'HUM_VITALITY_KEY', `vitality Health key "${kn}" unknown (max current inc): "unexpected token" load error (HUM-01)`); }
      for (const s of sub(n, 'stamina')) for (const k of subs(s)) {
        const kn = nameOf(k); if (kn == null) continue;
        if (!STAMINA_KEYS.has(kn)) add(k, t, 'HUM_VITALITY_KEY', `vitality Stamina key "${kn}" unknown (max current movement_limits inc load): "unexpected token" load error (HUM-01)`);
        else if (kn === 'inc') for (const r of subs(k)) {
          const rn = nameOf(r); if (rn == null || r.items[0].k !== 'IDENT') continue;
          if (!INC_ROWS.has(rn)) add(r, t, 'HUM_STAMINA_ROW', `Stamina.inc row "${rn}" is not stay|walk|slow|normal|fast: it silently overwrites the "stay" row (rates[0]) (HUM-03)`);
        } else if (kn === 'movement_limits') for (const r of subs(k)) {
          const rn = nameOf(r); if (rn == null || r.items[0].k !== 'IDENT') continue;
          if (!MOVE_MODES.has(rn)) add(r, t, 'HUM_VITALITY_KEY', `movement_limits mode "${rn}" is not a movement mode (slow normal fast walk bow assault spot sneak): "unexpected token" load error (HUM-01)`);
        }
      }
    }
    // HUM-07 health_damage_*
    if (DAMAGE_ACTIONS.has(name)) {
      let effects = 0;
      for (const k of subs(n)) {
        const kn = nameOf(k); if (kn == null) continue;
        if (kn === 'effects') effects += args(k).filter(a => a.k === 'STRING').length;
        else if (kn === 'table') { if (effects <= 4) add(k, t, 'HUM_THROW_EFFECTS', `${name} table after only ${effects} effects (needs >4; "effects" must come first): ERROR "Throw effects not loaded" (HUM-07)`); }
        else if (kn !== 'explosive_treshold') add(k, t, 'HUM_DAMAGE_KEY', `${name} key "${kn}" unknown (effects table explosive_treshold${kn === 'explosive_threshold' ? '; the engine spells it "treshold"' : ''}): "unexpected token" load error (HUM-07)`);
      }
    }
    // HUM-16 posture reload
    if (name === 'level' && parents.length) {
      const owner = parents[parents.length - 1].name;
      if (owner != null && rootKind(owner) === 'weapon') for (const p of subs(n)) if (POSTURES.has(nameOf(p))) for (const k of sub(p, 'reload'))
        add(k, t, 'HUM_POSTURE_RELOAD', `"reload" in weapon-ability posture "${nameOf(p)}": the engine reads this value under the key "aim_range"; "reload" is read by nothing (HUM-16)`);
    }
    // HUM-23 inventory box
    if (name === 'box' && underInv) for (const s of sub(n, 'size')) {
      for (const a of args(s)) if (a.k === 'INTEGER' && (a.value < -128 || a.value > 127)) add(s, t, 'HUM_BOX_SIZE_INT8', `box Size ${a.value} does not fit int8 cells (-128..127): wraps silently (HUM-23)`);
    }
    // HUM-25 two weapons on one holder place (box items {user "x"})
    if (name === 'box' && underInv) {
      const byUser = new Map();
      for (const it of sub(n, 'item')) {
        const u = sub(it, 'user')[0], ua = u && args(u)[0], a0 = args(it)[0];
        if (!ua || !a0 || a0.k !== 'STRING' || stackable(a0.value) !== false) continue;   // ammo and unresolved items share holders
        const un = low(txt(ua));
        if (byUser.has(un)) add(it, t, 'HUM_HOLDER_TWO_ITEMS', `second weapon item "${a0.value}" on holder place "${un}": 'HolderWeapon: set user ... ignored', only the first is bound; give it its own {user} place (HUM-25)`);
        else byUser.set(un, 1);
      }
    }
    // TST-107 Health max far from stock (human.ext only)
    if (name === 'extender' && args(n)[0] && low(txt(args(n)[0])) === 'vitality' && /^resource\/properties\/human[^\/]*\.ext$/.test(t.key)) {
      for (const h of sub(n, 'health')) for (const m of sub(h, 'max')) {
        const v = args(m)[0];
        if (v && (v.k === 'INTEGER' || v.k === 'FLOAT') && (v.value > 300 || v.value < 33)) add(m, t, 'WARN_HUM_HEALTH_FAR', `infantry Health max ${v.value} is far from stock 100: kill times change by 10x (5000 = 17-33 s per kill); scale health here only on purpose (TST-107)`);
      }
    }
    if (name === 'item' && sub(n, 'user').length && underInv) {
      const a = args(n), tg = a[0] && a[0].k === 'STRING' ? a[0].value : null, c = a[1] && (a[1].k === 'INTEGER' || a[1].k === 'FLOAT') ? a[1].value : 1;
      if (tg && c !== 1 && stackable(tg) === false) add(n, t, 'WARN_HUM_USER_AMOUNT', `item "${tg}" count ${c} with {user}: non-stackable stuff needs count 1 (warning "Invalid amount for non-stack item") (HUM-23)`);
    }
    // HUM-31 .mdl duration frames 0
    if (name === 'duration') { const a = args(n); if (a[0] && a[0].k === 'IDENT' && low(a[0].text) === 'frames' && a[1] && (a[1].k === 'INTEGER' || a[1].k === 'FLOAT') && a[1].value === 0) add(n, t, 'HUM_DURATION_ZERO', 'duration frames 0: ERROR "Invalid duration parameter (must be non-zero)" (HUM-31)'); }
    const arg = args(n)[0];
    const me = { name, arg: arg && (arg.k === 'STRING' || arg.k === 'IDENT') ? low(txt(arg)) : null };
    for (const k of subs(n)) visit(t, k, parents.concat(me));
  };

  // HUM-29 FSM graph
  const fsmCheck = (t, f) => {
    const st = new Map(), list = [];
    const get = nm => { nm = low(nm); let s = st.get(nm); if (!s) { s = { name: nm, declared: false, tags: new Set(), leads: [], node: null }; st.set(nm, s); list.push(s); } return s; };
    let split = 0;
    for (const k of subs(f)) {
      const kn = nameOf(k);
      if (kn === 'split') { const a = args(k)[0]; if (a && a.k === 'INTEGER') split = a.value; }
      else if (kn === 'state') {
        const a = args(k)[0]; if (!a || a.k !== 'STRING') continue;
        const s = get(a.value); s.declared = true; s.node = k;
        for (const c of subs(k)) {
          const cn = nameOf(c), ca = args(c);
          if (cn === 'tag') for (const x of ca) txt(x).split(/\s+/).filter(Boolean).forEach(w => s.tags.add(low(w)));
          else if (cn === 'to' || cn === 'transit') { if (ca[0] && ca[0].k === 'STRING') { const o = get(ca[0].value); s.leads.push(o); } }
          else if (cn === 'from') { if (ca[0] && ca[0].k === 'STRING') get(ca[0].value).leads.push(s); }
          else if (cn === 'fromtagged') { const need = ca.filter(x => x.k === 'STRING').map(x => low(x.value)); for (const o of list.slice()) if (need.every(w => o.tags.has(w))) o.leads.push(s); }
          else if (cn === 'split') { if (split <= 0) add(c, t, 'HUM_FSM_SPLIT_ORDER', `state "${s.name}" {split}: no {Split N} before it ("SplitCount value is undefined" error) (HUM-29)`); }
        }
      }
    }
    for (const s of list) {
      if (!s.declared || s.name === 'dead' || s.name === 'common' || !s.leads.length) continue;
      const n = s.leads.filter(o => o.tags.has('dying')).length;
      if (n !== 1) add(s.node, t, 'HUM_FSM_DYING_EDGES', `fsm state "${s.name}": ${n} edge(s) into a "dying" stance (exactly 1 needed): load warning, broken death transition (HUM-29)`);
    }
  };

  const PRE = /vitality|health_damage|inventory|duration|\bfsm\b|\{\s*breed|level|perks|vision_human|\b(?:rocketlauncher|mgun|smg|rifle|pistol|flamethrower)\b/i;
  const WEAPON_TYPES = 'rocketlauncher mgun smg rifle pistol flamethrower'.split(' ');
  // HUM-20: item tag string -> set of breed files using it (lazy, all visible breeds)
  let bItems = null;
  const breedItemUse = () => {
    if (bItems) return bItems;
    bItems = new Map();
    for (const k of [...allKeys].sort()) {
      if (!/^resource\/set\/breed\/.*\.set$/.test(k)) continue;
      const r = readKey(k); if (!r) continue;
      for (const b of subs(r.root)) if (nameOf(b) === 'breed') for (const inv of sub(b, 'inventory')) for (const it of sub(inv, 'item')) {
        const a = args(it)[0]; if (!a || a.k !== 'STRING') continue;
        const tg = low(a.value).split(/\s+/).filter(Boolean).sort().join(' ');
        if (!bItems.has(tg)) bItems.set(tg, new Set()); bItems.get(tg).add(k);
      }
    }
    return bItems;
  };
  let files = 0;
  for (const [key, t] of items) {
    if (!/^resource\/(set|properties|entity|map|stuff)/.test(key) && !/\.mdl$/.test(key)) continue;
    const buf = t.get(); if (!buf || !PRE.test(buf.toString('latin1'))) continue;
    const raw = buf.toString('latin1');
    // TST-106 vision_human radius tiny (raw text: macro define)
    if (/^resource\/set\/vision\//.test(key)) {
      const re = /\(\s*define\s+"vision_human"\s*\(\s*"radius"\s*r\(\s*(-?[\d.]+)\s*\)/gi;
      let m; while ((m = re.exec(raw))) if (parseFloat(m[1]) <= 5) add({ line: raw.slice(0, m.index).split('\n').length }, t, 'HUM_VISION_RADIUS_TINY', `vision_human radius ${m[1]} m: every infantry kill stops (a man must see the foe, knife at 4 m too); keep it well above a few metres (TST-106)`);
    }
    // HUM-27 stuff weapon type tag without the weapon tag
    if (/^resource\/set\/stuff\//.test(key) && !/\.(pattern|ammo)$/.test(key) && !/_settings\//.test(key) && !/\bweapon\b/i.test(raw)) {
      let sr; try { sr = src.read(t, () => {}); } catch (e) { sr = null; }
      if (sr) for (const x of sub(sr.root, 'tag')) {
        const w = args(x).map(txt).join(' ').split(/\s+/).filter(Boolean).map(low);
        if (w.some(q => WEAPON_TYPES.includes(q)) && !w.includes('ammo')) add(x, t, 'HUM_WEAPON_NO_TAG', `stuff tags "${w.join(' ')}" carry a weapon type but not "weapon": the engine matches type AND weapon, so it is held as a plain item; add "weapon" (HUM-27)`);
      }
    }
    let r; try { r = src.read(t, () => {}); } catch (e) { r = null; }
    if (!r) continue;
    files++;
    for (const b of subs(r.root)) {
      visit(t, b, []);
      if (nameOf(b) === 'fsm' && args(b)[0] && low(txt(args(b)[0])) === 'human') fsmCheck(t, b);
    }
    // HUM-14 / HUM-18 / perks
    if (/^resource\/set\/ability\/.*\.set$/.test(key)) {
      const A = abilities();
      for (const x of A.blocks.filter(x => x.key === key)) {
        if (rootKind(x.base) == null && !A.defs.has(x.base)) add(x.b, t, 'HUM_ABILITY_BASE', `ability "${x.name}" derives from unknown base "${x.base}": ERROR 'Unknown ability' (HUM-14)`);
        if (rootKind(x.name) === 'weapon_reload') add(x.b, t, 'HUM_WEAPON_RELOAD_PERK', `ability set defines "${x.name}" of kind weapon_reload: read by nothing in the game outside the veterancy bonus, so it stays inert (HUM-11)`);
      }
    }
    if (/^resource\/set\/breed\/.*\.set$/.test(key)) {
      for (const b of subs(r.root)) if (nameOf(b) === 'breed') for (const p of sub(b, 'perks')) for (const e of subs(p)) {
        const pn = nameOf(e); if (pn == null) continue;
        const rk = rootKind(pn);
        if (rk && LEVELED.has(rk) && levelCount(pn) === 0) add(e, t, 'HUM_ABILITY_NO_LEVELS', `perk "${pn}": ability kind has no {level} blocks in set/ability: ERROR 'No levels in ability' (HUM-14)`);
        if (rk === 'weapon_reload') add(e, t, 'HUM_WEAPON_RELOAD_PERK', `perk "${pn}" (weapon_reload) is read by nothing in the game outside the veterancy bonus: it does nothing here; put it in a veterancy rank instead (HUM-11)`);
      }
      for (const b of subs(r.root)) if (nameOf(b) === 'breed') {
        // HUM-17 veterancy ranks sharing one threshold
        for (const v of sub(b, 'veterancy')) {
          const seenThr = new Map();
          for (const x of subs(v)) {
            const a = args(x)[0], xn = nameOf(x); if (xn == null || !a || (a.k !== 'INTEGER' && a.k !== 'FLOAT')) continue;
            if (seenThr.has(a.value) && !(isGoh && a.value < 0)) add(x, t, 'HUM_VETERANCY_TIED', `veterancy rank "${xn}" has the same threshold ${a.value} as "${seenThr.get(a.value)}": both are active at once, only the highest rank applies and ranks do not stack (HUM-17)`);
            else seenThr.set(a.value, xn);
          }
        }
        for (const inv of sub(b, 'inventory')) {
          const items = sub(inv, 'item');
          // HUM-21 in_hands beyond item blocks
          for (const h of sub(inv, 'in_hands')) { const a = args(h)[0]; if (a && a.k === 'INTEGER' && (a.value >= items.length || a.value < 0)) add(h, t, 'HUM_IN_HANDS_RANGE', `in_hands ${a.value} but the breed has ${items.length} {item} blocks (0-based, items only): ignored, nothing is put in the hand (HUM-21)`); }
          // HUM-20 filled N on stuff other breeds use
          for (const it of items) {
            const a = args(it), a0 = a[0], i = a.findIndex(x => x.k === 'IDENT' && low(x.text) === 'filled');
            if (!a0 || a0.k !== 'STRING' || i < 0 || !a[i + 1] || (a[i + 1].k !== 'INTEGER' && a[i + 1].k !== 'FLOAT')) continue;
            const tg = low(a0.value).split(/\s+/).filter(Boolean).sort().join(' '), users = breedItemUse().get(tg);
            if (users && [...users].some(u => u !== key)) add(it, t, 'HUM_FILLED_N_GLOBAL', `"filled ${a[i + 1].value}" on "${a0.value}" rewrites that stuff's magazine size for every breed that carries it; give this breed its own stuff or use "filling" (HUM-20)`);
          }
        }
      }
    }
    if (/^resource\/set\/multiplayer\/units\//.test(key)) {
      for (const b of subs(r.root)) {
        const f = b.items[0]; if (!f || f.k !== 'STRING' || !sub(b, 'breed').length) continue;
        const nm = low(f.value);
        if (!breedNames().has(nm)) add(b, t, 'WARN_HUM_BREED_UNKNOWN', `multiplayer unit "${f.value}" is flagged {breed} but set/breed has no "${nm}": warning 'Unknown breed', skin skeleton (HUM-18)`);
      }
    }
  }
  return { rep, files };
}

if (require.main === module) cli.run(() => {
  const p = cli.parse(process.argv.slice(2), { flags: ['--vfs'] });
  const o = { gameDir: p.gameDir || undefined, mods: p.mods.length ? p.mods : undefined, vfs: p.x.vfs, folder: p.pos[0], exe: p.exe };
  if (!o.folder && !o.vfs || o.vfs && !o.gameDir) { console.error('usage: node tools/humlint/humlint.js <mod folder> [--game dir] [--mods a,b] [--exe as64|mowas_2|mowas2|goh] [-q] [--summary] [--format text|json|sarif|html|csv] [-o file] [--rc file|--no-rc] | --vfs --game <dir>'); process.exit(2); }
  const { rep, files } = check(o);
  cli.printReport(rep, p, { tool: 'humlint' });
  if (p.format === 'text' && !p.output) console.log(`${files} files`); else console.error(`${files} files`);
});
module.exports = { check };
