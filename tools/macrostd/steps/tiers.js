// macrostd step tiers: the soldier breeds' perk calls ("breed_body" ...), ("breed_drive" ...), ("breed_skills" ...) repeat the same
//   value sets across classes and sides (tiers). This step writes resource/set/breed/breed_tiers.inc with one parameterless macro per
//   set used by TIER_MIN+ breeds (body_<tier>, drive_<tier>, skills_<tier>), each defined as the very call it replaces, adds
//   (include "/set/breed/breed_tiers.inc") to breed_macros.inc after its header comment (TST-108: file + include in the same step),
//   and replaces each matching call line in a breed by ("<tier>"). Rarer sets keep their explicit breed_* call (the exceptions).
//   Data identical: a macro body is expanded textually and re-read, so a nested call holds the same raw parameter text as the breed
//   line had, SDL-20); verify proves it. A set is the call's argument text AS WRITTEN: vision("mp_soldier") vs
//   vision(mp_soldier) and 1 vs 1.0 are different sets (they are listed as cases, the owner may make them the same).
//   Names: the NAMES map below (one line per tier, edit it to rename a tier). A set used TIER_MIN+ times that the map does not name
//   gets a value name (body_h<health>_s<stamina>..., drive_t<tank>_v<vehicle>_c<cannon>, skills_<6 levels>).
//   Re-run renames: the tiers already in breed_tiers.inc are read back (name -> call), breed lines calling an old name get the new
//   name, and breed_tiers.inc is rewritten. A tier that falls under TIER_MIN is written back as the explicit call.
//   Out of line (report only, TSV kind outline, file + line): every call left explicit, with its nearest tier (fewest differing
//   values, tie -> the more used) and the differences; "text only" when every difference is quoting or number form (1 vs 1.0).
//   Scope: SDL-17/GPL-11 (the tiers are visible through breed_macros.inc, which every converted breed includes before {breed),
//   SDL-18 (names lowercase, exact), SDL-19/21 (no parameters), TST-108.
// Author: Imperator_Aug (ARSENAL, ia-effb6f16)
const TIERS_REL = 'resource/set/breed/breed_tiers.inc';
const MACROS_REL = 'resource/set/breed/breed_macros.inc';
const TIERS_LINE = '(include "/set/breed/breed_tiers.inc")';
const BREED_INC = '(include "/set/breed/breed_macros.inc")';
const TIER_MIN = 4;

// ---- tier names: <group>: { '<call arguments as written>': '<tier name>' }. Rename a tier by editing its name here, then re-run.
//   Tiers serve every faction (breed folder) that uses the set; a name carries a faction only when one faction alone uses the set.
//   Sets not named here get a value name (with the faction first when one faction alone uses them).
const NAMES = {
  body: {
    'health(100%) regen_health(100%) stamina(75%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_militia',
    'health(100%) regen_health(100%) stamina(75%) regen_stamina(100%) vision("mp_soldier") speed(0.8)': 'body_ger_volkssturm',
    'health(150%) regen_health(100%) stamina(125%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_ger_ss_ssvt_sl',
    'health(200%) regen_health(100%) stamina(150%) regen_stamina(100%) vision(mp_soldier) speed(0.9)': 'body_veteran_bare',
    'health(200%) regen_health(100%) stamina(200%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_axis_minor_assault',
    'health(250%) regen_health(100%) stamina(150%) regen_stamina(100%) vision(mp_soldier) speed(0.9)': 'body_usa_raider',
    'health(250%) regen_health(100%) stamina(200%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_eng_anzac',
    'health(250%) regen_health(100%) stamina(200%) regen_stamina(125%) vision("mp_soldier") speed(0.95)': 'body_jap_charger',
    'health(250%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_officer") speed(1.0)': 'body_officer_s100',
    'health(250%) regen_health(100%) stamina(150%) regen_stamina(100%) vision("mp_officer") speed(1.0)': 'body_officer',
    'health(250%) regen_health(100%) stamina(150%) regen_stamina(100%) vision(mp_officer) speed(1)': 'body_officer_bare',
    'health(350%) regen_health(100%) stamina(200%) regen_stamina(100%) vision("mp_sniper") speed(1.0)': 'body_sniper_s200',
    'health(400%) regen_health(100%) stamina(200%) regen_stamina(100%) vision("mp_officer") speed(1)': 'body_crew_elite',
    'health(100%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.8)': 'body_crew',
    'health(100%) regen_health(100%) stamina(100%) regen_stamina(100%) vision(mp_soldier) speed(0.8)': 'body_crew_bare',
    'health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.8)': 'body_crew_commander',
    'health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision(mp_soldier) speed(0.8)': 'body_crew_commander_bare',
    'health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_regular',
    'health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision(mp_soldier) speed(0.9)': 'body_regular_bare',
    'health(200%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_squadleader',
    'health(200%) regen_health(100%) stamina(150%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_veteran',
    'health(350%) regen_health(100%) stamina(150%) regen_stamina(100%) vision("mp_sniper") speed(1.0)': 'body_sniper',
    'health(400%) regen_health(100%) stamina(200%) regen_stamina(100%) vision("mp_soldier") speed(0.9)': 'body_elite',
    'health(400%) regen_health(100%) stamina(200%) regen_stamina(100%) vision(mp_soldier) speed(0.9)': 'body_elite_bare',
    'health(350%) regen_health(100%) stamina(225%) regen_stamina(125%) vision("mp_soldier") speed(0.9)': 'body_jap_takasago',
    'health(400%) regen_health(100%) stamina(225%) regen_stamina(125%) vision("mp_soldier") speed(1)': 'body_ger2_pzgren',
    'health(400%) regen_health(100%) stamina(225%) regen_stamina(125%) vision(mp_soldier) speed(1)': 'body_ger_gebirgsjager',
  },
  drive: {
    'tank(0.75) vehicle(0.8) cannon(0.8)': 'drive_militia',
    'tank(0.75) vehicle(1) cannon(0.8)': 'drive_regular',
    'tank(0.85) vehicle(1) cannon(0.9)': 'drive_veteran',
    'tank(0.95) vehicle(1) cannon(1)': 'drive_elite',
    'tank(0.85) vehicle(1) cannon(1.0)': 'drive_support',
    'tank(1) vehicle(1) cannon(0.9)': 'drive_crew',
    'tank(1.1) vehicle(1) cannon(0.95)': 'drive_crew_commander',
    'tank(1.15) vehicle(1.15) cannon(1.0)': 'drive_crew_elite',
  },
  skills: {
    'pistol(1) smg(1) mgun(1) rifle(1) rocket(1) melee(2)': 'skills_rus_militia',
    'pistol(1) smg(1) mgun(1) rifle(1) rocket(2) melee(2)': 'skills_ger_volkssturm',
    'pistol(1) smg(1) mgun(1) rifle(1) rocket(1) melee(4)': 'skills_jap_charger',
    'pistol(2) smg(2) mgun(4) rifle(2) rocket(2) melee(4)': 'skills_support',
    'pistol(2) smg(2) mgun(1) rifle(5) rocket(1) melee(2)': 'skills_sniper_r5',
    'pistol(4) smg(3) mgun(2) rifle(6) rocket(2) melee(4)': 'skills_sniper_r6',
    'pistol(5) smg(5) mgun(4) rifle(5) rocket(4) melee(5)': 'skills_squadleader',
    'pistol(6) smg(6) mgun(6) rifle(6) rocket(6) melee(6)': 'skills_elite_6',
    'pistol(7) smg(7) mgun(7) rifle(7) rocket(7) melee(7)': 'skills_elite_7',
  },
};

const GROUPS = {
  body: { macro: 'breed_body', what: 'body perks (health, health_regeneration, stamina, stamina_regeneration, vision, speed)' },
  drive: { macro: 'breed_drive', what: 'crew perks (tank, vehicle, cannon)' },
  skills: { macro: 'breed_skills', what: 'weapon skill levels (pistol, smg, mgun, rifle, rocketlauncher, melee)' },
};
const ARGS_RE = /^[a-z_]+\([^()\r\n]*\)( [a-z_]+\([^()\r\n]*\))*$/;
const CALL_RE = /^(\t+)\("breed_(body|drive|skills)" ([^\r\n]*?)\)([ \t]*(?:;.*)?)$/;
const TIER_RE = /^(\t+)\("([a-z0-9_]+)"\)([ \t]*(?:;.*)?)$/;

const argList = a => [...a.matchAll(/([a-z_]+)\(([^()]*)\)/g)].map(m => [m[1], m[2]]);
const num = v => parseFloat(String(v).replace(/[%"]/g, ''));
const dig = v => String(v).replace(/[%"]/g, '').replace('.', '');
// value name; faction = the one breed folder that uses the set (null when several do)
function valueName(g, args, faction) {
  const n = valueName0(g, args);
  return faction ? n.replace(/^([a-z]+)_/, `$1_${faction.toLowerCase().replace(/[^a-z0-9_]/g, '')}_`) : n;
}
function valueName0(g, args) {
  const a = Object.fromEntries(argList(args));
  if (g === 'body') {
    let n = `body_h${dig(a.health)}_s${dig(a.stamina)}`;
    if (num(a.regen_health) !== 100) n += `_rh${dig(a.regen_health)}`;
    if (num(a.regen_stamina) !== 100) n += `_r${dig(a.regen_stamina)}`;
    if (num(a.speed) !== 0.9) n += `_sp${dig(a.speed)}`;
    const vis = String(a.vision || '');
    if (vis.replace(/"/g, '') !== 'mp_soldier') n += '_' + vis.replace(/"/g, '').replace(/^mp_/, '');
    if (!vis.startsWith('"')) n += '_bare';
    return n.toLowerCase().replace(/[^a-z0-9_]/g, '');
  }
  if (g === 'drive') return `drive_t${dig(a.tank)}_v${dig(a.vehicle)}_c${dig(a.cannon)}`.replace(/[^a-z0-9_]/g, '');
  return ('skills_' + argList(args).map(x => dig(x[1])).join('_')).replace(/[^a-z0-9_]/g, '');
}
const faction = rel => { const p = rel.split('/'); return p[p.length - 2]; };
// differences of a set from a tier: [{k, v, tv, text}] text = same number, other text
function diffs(args, targs) {
  const a = argList(args), b = new Map(argList(targs)), out = [];
  for (const [k, v] of a) {
    const tv = b.has(k) ? b.get(k) : '(none)';
    if (v === tv) continue;
    const text = b.has(k) && (v.replace(/"/g, '') === tv.replace(/"/g, '') || (!isNaN(num(v)) && /^[\d.%"]+$/.test(v) && /^[\d.%"]+$/.test(tv) && num(v) === num(tv)));
    out.push({ k, v, tv, text });
  }
  return out;
}
// strength order (weakest first): body health, stamina, regen, speed; drive sum, tank; skills sum, then the levels in order
function strength(g, args) {
  const v = argList(args).map(x => num(x[1]));
  if (g === 'body') return [v[0], v[2], v[3], v[1], v[5]];
  if (g === 'drive') return [v[0] + v[1] + v[2], v[0], v[1]];
  return [v.reduce((s, x) => s + x, 0), ...v];
}
const cmpArr = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
// a set's normal form: quotes off vision, numbers as numbers (twins = same normal form, different text)
const normal = args => argList(args).map(([k, v]) => k + '=' + (isNaN(num(v)) ? v.replace(/"/g, '') : num(v))).join(' ');
// the class word of a breed file name (side prefixes and numbers off), for the "typical users" column
function classWord(rel) {
  const stem = rel.split('/').pop().replace(/\.set$/i, '').toLowerCase();
  const tail = x => x.replace(/(_?\d+[a-z]?)+$/, '').replace(/_(single|asst|assist|ammo)$/, '').replace(/\d+[a-z]?$/, '');
  let s = stem;
  for (let i = 0; i < 3; i++) { const t = s.replace(/^(axm_[a-z]+_|rus_|ger_|eng_|usa_|jap_|ss_|ost_|guard_|guards_|elite_|vet_)/, ''); if (tail(t)) s = t; }
  return tail(s) || stem;
}
function typicalUsers(rels) {
  const c = new Map();
  for (const r of rels) { const w = classWord(r); c.set(w, (c.get(w) || 0) + 1); }
  return [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 4).map(([w, n]) => w + ' ' + n).join(', ');
}
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - s.length));

// breed_tiers.inc text from tiers [{g, name, args, uses, rels}] (already in group + strength order)
function tiersFile(tiers, eol) {
  const L = [
    '; breed_tiers.inc: named tiers of the soldier breeds\' perk sets (written by macrostd step tiers). Each tier is one call of',
    ';   breed_body / breed_drive / breed_skills with fixed values; a breed writes ("body_regular") instead of the full call.',
    `;   A set used by fewer than ${TIER_MIN} breeds keeps its explicit breed_* call in the breed (the exceptions). Included from`,
    ';   breed_macros.inc, so a breed that includes breed_macros.inc sees every tier. Rename a tier: edit its line in the NAMES map',
    ';   of tools/macrostd/steps/tiers.js and re-run the step (it renames the calls in the breeds too).',
  ];
  for (const g of Object.keys(GROUPS)) {
    const ts = tiers.filter(t => t.g === g);
    if (!ts.length) continue;
    const w = Math.max(...ts.map(t => t.name.length)) + 2, wv = Math.max(...ts.map(t => t.args.length)) + 2;
    L.push(';', `; ${g} tiers, ${GROUPS[g].macro}: ${GROUPS[g].what}; weakest first, strongest last`);
    L.push(';   ' + pad('tier', w) + pad('values', wv) + pad('breeds', 8) + pad('sides', 7) + 'typical users (breed file class: count)');
    for (const t of ts) L.push(';   ' + pad(t.name, w) + pad(t.args, wv) + pad(String(t.uses), 8) + pad(String(t.facs), 7) + t.users);
  }
  for (const t of tiers) {
    L.push('', `; ${t.name}: ${GROUPS[t.g].macro} tier, ${argList(t.args).map(([k, v]) => k + ' ' + v).join(', ')}`, `;   e.g. ("${t.name}")`,
      `(define "${t.name}"`, `\t("${GROUPS[t.g].macro}" ${t.args})`, ')');
  }
  return L.join(eol) + eol;
}
// tiers already written: name -> { g, args }
function readTiers(s) {
  const m = new Map();
  for (const x of s.matchAll(/^\(define "([a-z0-9_]+)"\r?\n\t\("breed_(body|drive|skills)" ([^\r\n]*)\)\r?\n\)/gm)) m.set(x[1], { g: x[2], args: x[3] });
  return m;
}

module.exports = {
  id: 'tiers',
  title: 'soldier breeds: named tier macros for repeated perk sets (breed_tiers.inc)',
  NAMES, TIER_MIN, valueName, tiersFile,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    if (!ctx.exists(MACROS_REL)) return { changes, cases: [{ id: 'tiers-no-macros', title: 'tiers not made', detail: MACROS_REL + ' missing (run step breed first)' }] };
    const old = ctx.exists(TIERS_REL) ? readTiers(ctx.read(TIERS_REL).toString('latin1')) : new Map();
    const keys = [...m.files.keys()].filter(k => /^resource\/set\/breed\/.+\.set$/.test(k) && m.files.get(k).scope).sort();
    // pass 1: every perk call line (explicit or an old tier) in breeds that include breed_macros.inc before it
    const files = [], sets = { body: new Map(), drive: new Map(), skills: new Map() };
    for (const k of keys) {
      const F = m.files.get(k), s = ctx.read(F.rel).toString('latin1');
      const eol = s.includes('\r\n') ? '\r\n' : '\n', lines = s.split(eol);
      const inc = lines.indexOf(BREED_INC);
      const hits = [];
      lines.forEach((l, i) => {
        let x = CALL_RE.exec(l), g, args, ind, tail, from = null;
        if (x && ARGS_RE.test(x[3])) [ind, g, args, tail] = [x[1], x[2], x[3], x[4]];
        else if ((x = TIER_RE.exec(l)) && old.has(x[2])) { ind = x[1]; ({ g, args } = old.get(x[2])); tail = x[3]; from = x[2]; }
        else return;
        if (inc < 0 || inc > i) return;
        hits.push({ i, ind, g, args, tail, from });
        if (!sets[g].has(args)) sets[g].set(args, []);
        sets[g].get(args).push(F.rel);
      });
      if (hits.length) files.push({ F, eol, lines, hits });
    }
    // tiers: sets used TIER_MIN+ times, named by the map or by value
    const taken = new Set(), tiers = [], nameOf = new Map();
    const foreign = n => {     // a name in use outside breed_tiers.inc / breed tier calls, or by vanilla
      if (m.vanilla.defined.has(n) || m.vanilla.called.has(n)) return 'vanilla';
      const b = m.byName.get(n);
      if (!b) return null;
      if (b.defs.some(d => d.key !== TIERS_REL)) return b.defs.find(d => d.key !== TIERS_REL).rel;
      if (!old.has(n) && b.calls.length) return b.calls[0].rel;
      return null;
    };
    for (const g of Object.keys(GROUPS)) {
      const list = [...sets[g]].filter(([, r]) => r.length >= TIER_MIN).sort((a, b) => cmpArr(strength(g, a[0]), strength(g, b[0])) || (a[0] < b[0] ? -1 : 1));
      for (const [args, rels] of list) {
        const facs = new Set(rels.map(faction));
        const name = NAMES[g][args] || valueName(g, args, facs.size === 1 ? [...facs][0] : null);
        const clash = foreign(name);
        if (clash || taken.has(name)) {
          cases.push({ id: 'tiers-name-clash', title: `tier ${name} not made (set stays explicit)`, detail: `${GROUPS[g].macro} ${args}: name ${clash ? 'already used in ' + clash : 'given twice in NAMES'}` });
          continue;
        }
        taken.add(name);
        const t = { g, name, args, uses: rels.length, rels, users: typicalUsers(rels), auto: !NAMES[g][args], facs: facs.size };
        tiers.push(t); nameOf.set(g + '|' + args, name);
      }
    }
    // nearest tier of an explicit set (fewest differing values; tie -> the more used), for the out-of-line rows
    const nearMemo = new Map();
    const nearest = (g, args) => {
      const k = g + '|' + args;
      if (nearMemo.has(k)) return nearMemo.get(k);
      let best = null;
      for (const t of tiers) {
        if (t.g !== g) continue;
        const d = diffs(args, t.args);
        if (!best || d.length < best.d.length || (d.length === best.d.length && t.uses > best.t.uses)) best = { t, d };
      }
      nearMemo.set(k, best);
      return best;
    };
    const outline = { body: { text: 0, values: 0, far: 0 }, drive: { text: 0, values: 0, far: 0 }, skills: { text: 0, values: 0, far: 0 } };
    // pass 2: rewrite the call lines
    let anyTier = false, nOut = 0;
    for (const { F, eol, lines, hits } of files) {
      const rows = [], orows = [];
      for (const h of hits) {
        const name = nameOf.get(h.g + '|' + h.args);
        if (!name) {
          const n = nearest(h.g, h.args);
          let after, note;
          if (!n) { after = 'no tier in this group'; note = 'far'; }
          else if (n.d.length > 2) { after = `no tier within 2 values (nearest ${n.t.name}, ${n.d.length} values differ)`; note = 'far'; }
          else {
            const all = n.d.every(x => x.text);
            after = n.d.map(x => `${x.k} ${x.v} vs ${x.tv}` + (x.text && !all ? ' (text only)' : '')).join(', ');
            note = all ? 'text' : 'values';
            if (all) after += ' (text only, same number)';
          }
          outline[h.g][note]++;
          nOut++;
          orows.push({ line: h.i + 1, kind: 'outline', before: n ? `${h.g} near ${n.t.name} (${n.t.uses} breeds)` : h.g, after, note: note === 'text' ? 'text only (joining changes the expanded text: case)' : note });
        }
        const now = name ? `${h.ind}("${name}")${h.tail}` : `${h.ind}("${GROUPS[h.g].macro}" ${h.args})${h.tail}`;
        if (name) anyTier = true;
        if (now === lines[h.i]) continue;
        rows.push({ line: h.i + 1, kind: !name ? 'tier_expand' : h.from ? 'tier_rename' : 'tier_call', before: lines[h.i].trim(), after: now.trim(), note: name && !h.from ? `${GROUPS[h.g].macro} set used by ${sets[h.g].get(h.args).length} breeds` : '' });
        lines[h.i] = now;
      }
      if (rows.length) changes.push({ file: F.rel, after: Buffer.from(lines.join(eol), 'latin1'), create: false, rows: rows.concat(orows) });
      else if (orows.length) changes.push({ file: F.rel, after: null, create: false, rows: orows });
    }
    // breed_tiers.inc + the include line in breed_macros.inc (same step, TST-108)
    const ms = ctx.read(MACROS_REL).toString('latin1'), eol = ms.includes('\r\n') ? '\r\n' : '\n';
    if (anyTier || old.size) {
      const text = tiersFile(tiers, eol), exists = ctx.exists(TIERS_REL);
      if (!exists || ctx.read(TIERS_REL).toString('latin1') !== text) {
        changes.unshift({ file: TIERS_REL, after: Buffer.from(text, 'latin1'), create: !exists, rows: [{ line: 1, kind: exists ? 'rewrite' : 'create', before: exists ? [...old.keys()].length + ' tiers' : '', after: tiers.length + ' tiers: ' + tiers.map(t => t.name).join(' '), note: 'TST-108: included from breed_macros.inc in the same step' }] });
      }
      const ml = ms.split(eol);
      if (!ml.includes(TIERS_LINE)) {
        let i = 0;
        while (i < ml.length && ml[i].startsWith(';')) i++;
        while (i < ml.length && /^\(include "\/set\/breed\/breed_[a-z0-9_]+\.inc"\)$/.test(ml[i])) i++;
        ml.splice(i, 0, TIERS_LINE);
        changes.push({ file: MACROS_REL, after: Buffer.from(ml.join(eol), 'latin1'), create: false, rows: [{ line: i + 1, kind: 'include', before: '', after: TIERS_LINE, note: 'TST-108: breed_tiers.inc is written in the same step' }] });
      }
    }
    // cases: twins (same values, different text) and tiers without a rank word
    for (const g of Object.keys(GROUPS)) {
      const byNorm = new Map();
      for (const [args, rels] of sets[g]) { const n = normal(args); if (!byNorm.has(n)) byNorm.set(n, []); byNorm.get(n).push([args, rels.length]); }
      for (const [, list] of byNorm) {
        if (list.length < 2) continue;
        list.sort((a, b) => b[1] - a[1]);
        cases.push({ id: 'tiers-twin', title: `${GROUPS[g].macro}: ${list.length} sets differ only by quoting or number form (not merged)`,
          detail: list.map(([a, n]) => `${nameOf.get(g + '|' + a) || 'explicit'} x${n}: ${a}`).join(' | ') });
      }
    }
    const vn = tiers.filter(t => t.auto);
    if (vn.length) cases.push({ id: 'tiers-value-name', title: `${vn.length} tiers named by value (no rank word fits most users)`, detail: vn.map(t => `${t.name} x${t.uses} (${t.users})`).join(' | ') });
    if (nOut) cases.push({ id: 'tiers-outline', title: `${nOut} explicit perk calls are out of line (TSV kind outline: nearest tier + differences)`,
      detail: Object.entries(outline).map(([g, o]) => `${g}: ${o.values} differ in values (<=2), ${o.text} in text only, ${o.far} no tier within 2`).join(' | ') });
    return { changes, cases };
  },
};
