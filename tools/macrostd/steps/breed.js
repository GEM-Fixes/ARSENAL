// macrostd step breed: the soldier breeds resource/set/breed/**/*.set repeat the same perk lines and the veterancy include + call
//   by hand. This step writes resource/set/breed/breed_macros.inc (breed_body, breed_drive, breed_skills, breed_vet) and in each
//   breed: adds (include "/set/breed/breed_macros.inc") above {breed (TST-108: the include and the file come in the same step),
//   replaces each run of perks that matches a macro exactly (names in the macro's order, value forms below) by one call, writes the
//   other perks one per line ({"x" v} instead of the two-line {"x" v / } form), and replaces
//     {veterancy (include "veterancy_generic.inc") ("veterancy_<k>")}   by   ("breed_vet" kind(<k>))
//   The include inside the breed_vet body resolves from the CALLING breed's folder (a macro-body parser has no file name; the
//   innermost named parser is the breed:, sdlx.read), so each side keeps its own veterancy_generic.inc.
//   Value forms a macro takes (anything else stays literal, data identical, SDL-20 textual substitution):
//     breed_body   health / health_regeneration / stamina / stamina_regeneration "<number>%" (quoted in the body), vision raw token
//                  (quoted or bare, passed as written), speed number
//     breed_drive  tank, vehicle, cannon numbers
//     breed_skills pistol smg mgun rifle rocketlauncher melee = bare lvl_<n>; the call passes <n>
//   Parameter names: no one is a strict prefix of another (SDL-56): health/regen_health, stamina/regen_stamina.
//   A perks block with a comment, a macro call or anything but {"name" values} entries is left as it is (counted as a case).
// Author: Imperator_Aug (ARSENAL, ia-1a5578f3)
const INC_REL = 'resource/set/breed/breed_macros.inc';
const INC_LINE = '(include "/set/breed/breed_macros.inc")';
const NUM = /^-?\d+(\.\d+)?$/;
const PCT = /^"\d+(\.\d+)?%"$/;
const VIS = /^("[A-Za-z0-9_]+"|[A-Za-z_][A-Za-z0-9_]*)$/;
const LVL = /^lvl_(\d+(\.\d+)?)$/;

// macro groups: perk name, call parameter, value test, value -> argument
const GROUPS = [
  { name: 'breed_body', perks: [
    ['health', 'health', PCT, v => v.slice(1, -1)], ['health_regeneration', 'regen_health', PCT, v => v.slice(1, -1)],
    ['stamina', 'stamina', PCT, v => v.slice(1, -1)], ['stamina_regeneration', 'regen_stamina', PCT, v => v.slice(1, -1)],
    ['vision', 'vision', VIS, v => v], ['speed', 'speed', NUM, v => v]] },
  { name: 'breed_drive', perks: [['tank', 'tank', NUM, v => v], ['vehicle', 'vehicle', NUM, v => v], ['cannon', 'cannon', NUM, v => v]] },
  { name: 'breed_skills', perks: [
    ['pistol', 'pistol', LVL, v => LVL.exec(v)[1]], ['smg', 'smg', LVL, v => LVL.exec(v)[1]], ['mgun', 'mgun', LVL, v => LVL.exec(v)[1]],
    ['rifle', 'rifle', LVL, v => LVL.exec(v)[1]], ['rocketlauncher', 'rocket', LVL, v => LVL.exec(v)[1]], ['melee', 'melee', LVL, v => LVL.exec(v)[1]]] },
];

function macroFile(eol) {
  const L = [
    '; breed_macros.inc: shared perk and veterancy blocks of the soldier breeds (set/breed/**/*.set, written by macrostd step breed).',
    ';   A breed that calls one of these macros includes this file first: (include "/set/breed/breed_macros.inc").',
    ';   Perks a macro does not hold (tankgun, stealth, telescope, ...) stay literal lines next to the calls, in the breed\'s order.',
    '',
    '; breed_body: the body perks health, health_regeneration, stamina, stamina_regeneration, vision, speed (in this order)',
    ';   health - "health" perk, percent of the base with a % sign',
    ';   regen_health - "health_regeneration" perk, percent with a % sign',
    ';   stamina - "stamina" perk, percent with a % sign',
    ';   regen_stamina - "stamina_regeneration" perk, percent with a % sign',
    ';   vision - "vision" perk, vision preset name as the breed writes it (quoted "mp_soldier" or bare mp_soldier)',
    ';   speed - "speed" perk, move speed factor (1 = normal)',
    ';   e.g. ("breed_body" health(150%) regen_health(100%) stamina(100%) regen_stamina(100%) vision("mp_soldier") speed(0.9))',
    '(define "breed_body"',
    '\t{"health" "%health"}',
    '\t{"health_regeneration" "%regen_health"}',
    '\t{"stamina" "%stamina"}',
    '\t{"stamina_regeneration" "%regen_stamina"}',
    '\t{"vision" %vision}',
    '\t{"speed" %speed}',
    ')',
    '',
    '; breed_drive: the crew perks tank, vehicle, cannon (in this order)',
    ';   tank - "tank" perk, tank driving and crew skill factor',
    ';   vehicle - "vehicle" perk, soft vehicle driving skill factor',
    ';   cannon - "cannon" perk, gun crew skill factor',
    ';   e.g. ("breed_drive" tank(0.75) vehicle(1) cannon(0.8))',
    '(define "breed_drive"',
    '\t{"tank" %tank}',
    '\t{"vehicle" %vehicle}',
    '\t{"cannon" %cannon}',
    ')',
    '',
    '; breed_skills: the weapon skill perks pistol, smg, mgun, rifle, rocketlauncher, melee as lvl_<n> (in this order)',
    ';   pistol - "pistol" skill level number (4 = lvl_4)',
    ';   smg - "smg" skill level number',
    ';   mgun - "mgun" skill level number',
    ';   rifle - "rifle" skill level number',
    ';   rocket - "rocketlauncher" skill level number',
    ';   melee - "melee" skill level number',
    ';   e.g. ("breed_skills" pistol(4) smg(4) mgun(2) rifle(3) rocket(2) melee(4))',
    '(define "breed_skills"',
    '\t{"pistol" lvl_%pistol}',
    '\t{"smg" lvl_%smg}',
    '\t{"mgun" lvl_%mgun}',
    '\t{"rifle" lvl_%rifle}',
    '\t{"rocketlauncher" lvl_%rocket}',
    '\t{"melee" lvl_%melee}',
    ')',
    '',
    '; breed_vet: the veterancy block; includes veterancy_generic.inc from the CALLING breed\'s folder (each side has its own) and',
    ';   calls its veterancy_<kind> macro',
    ';   kind - name of the veterancy macro after "veterancy_" (1, elite, tankcrew, lvl5, ...)',
    ';   e.g. ("breed_vet" kind(1))',
    '(define "breed_vet"',
    '\t{veterancy',
    '\t\t(include "veterancy_generic.inc")',
    '\t\t("veterancy_%kind")',
    '\t}',
    ')',
  ];
  return L.join(eol) + eol;
}

// one perks block -> entries [{name, vals:[tok]}] | null (not plain entries)
function parseEntries(body) {
  if (/[;()]/.test(body.replace(/"[^"\r\n]*"/g, '""'))) return null;
  const out = [];
  const re = /\s*\{"([A-Za-z0-9_]+)"((?:\s+(?:"[^"\r\n]*"|[^\s"{}]+))*)\s*\}/y;
  let pos = 0;
  while (pos < body.length) {
    if (/^\s*$/.test(body.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(body);
    if (!m) return null;
    out.push({ name: m[1], vals: m[2].match(/"[^"\r\n]*"|[^\s"{}]+/g) || [] });
    pos = re.lastIndex;
  }
  return out;
}

function matchGroup(es, i, g) {
  if (i + g.perks.length > es.length) return null;
  const args = [];
  for (let k = 0; k < g.perks.length; k++) {
    const e = es[i + k], [pn, par, test, conv] = g.perks[k];
    if (e.name !== pn || e.vals.length !== 1 || !test.test(e.vals[0])) return null;
    const a = conv(e.vals[0]);
    if (a.includes(')') || /%\w/.test(a)) return null;
    args.push(par + '(' + a + ')');
  }
  return '("' + g.name + '" ' + args.join(' ') + ')';
}

function planFile(s) {
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const lines = s.split(eol);
  const res = { rows: [], used: false, why: [] };
  // perks block
  const pi = lines.findIndex(l => /^\t+\{perks\s*$/.test(l));
  if (pi >= 0 && !lines.some(l => l.includes('("breed_'))) {
    const ind = /^\t+/.exec(lines[pi])[0];
    let pe = -1;
    for (let k = pi + 1; k < lines.length; k++) if (lines[k] === ind + '}') { pe = k; break; }
    const es = pe > 0 ? parseEntries(lines.slice(pi + 1, pe).join('\n')) : null;
    if (!es) res.why.push('perks block not plain {"name" value} entries');
    else {
      const out = [], got = new Set();
      for (let i = 0; i < es.length;) {
        let hit = null;
        for (const g of GROUPS) { const c = matchGroup(es, i, g); if (c) { hit = [g, c]; break; } }
        if (hit) { out.push(ind + '\t' + hit[1]); got.add(hit[0].name); i += hit[0].perks.length; continue; }
        const e = es[i++];
        out.push(ind + '\t{"' + e.name + '"' + e.vals.map(v => ' ' + v).join('') + '}');
      }
      for (const g of GROUPS) if (!got.has(g.name)) res.why.push(g.name);
      const before = lines.slice(pi + 1, pe);
      if (out.join('\n') !== before.join('\n')) {
        res.rows.push({ line: pi + 2, kind: got.size ? 'perks_macro' : 'perks_one_line', before: before.length + ' lines', after: out.length + ' lines: ' + [...got].join(' '), note: '' });
        lines.splice(pi + 1, pe - pi - 1, ...out);
        if (got.size) res.used = true;
      }
    }
  }
  // veterancy block
  for (let k = 0; k < lines.length; k++) {
    const m = /^(\t+)\{veterancy\s*$/.exec(lines[k]);
    if (!m) continue;
    const ind = m[1];
    let e = -1;
    for (let j = k + 1; j < lines.length; j++) if (lines[j] === ind + '}') { e = j; break; }
    const inner = e > 0 ? lines.slice(k + 1, e).filter(l => l.trim()) : [];   // blank lines inside are not data
    const v = inner.length === 2 && inner[1].startsWith(ind + '\t(') ? /^\("veterancy_([a-z0-9_]+)"\)$/.exec(inner[1].slice(ind.length + 1)) : null;
    if (v && inner[0] === ind + '\t(include "veterancy_generic.inc")') {
      const call = ind + '("breed_vet" kind(' + v[1] + '))';
      res.rows.push({ line: k + 1, kind: 'vet_macro', before: 'veterancy_' + v[1], after: call.trim(), note: '' });
      lines.splice(k, e - k + 1, call); res.used = true;
    } else res.why.push('breed_vet');
    break;
  }
  if (res.used && !lines.includes(INC_LINE)) {
    const b = lines.findIndex(l => /^\{breed\b/.test(l));
    if (b < 0) return { rows: [], used: false, why: ['no top-level {breed line for the include'] };
    lines.splice(b, 0, INC_LINE);
    res.rows.unshift({ line: b + 1, kind: 'include', before: '', after: INC_LINE, note: 'TST-108: breed_macros.inc is created in the same step' });
  }
  res.after = lines.join(eol);
  res.eol = eol;
  return res;
}

module.exports = {
  id: 'breed',
  title: 'soldier breeds: shared perk and veterancy macros (breed_macros.inc)',
  planFile, macroFile,
  plan(ctx) {
    const m = ctx.model, changes = [], cases = [];
    const keys = [...m.files.keys()].filter(k => /^resource\/set\/breed\/.+\.set$/.test(k) && m.files.get(k).scope).sort();
    const left = new Map();
    let anyUse = false, eol = '\r\n';
    for (const k of keys) {
      const F = m.files.get(k);
      const s = ctx.read(F.rel).toString('latin1');
      if (s !== F.s) throw new Error(`breed: ${F.rel} changed since the model was built`);
      const r = planFile(s);
      for (const w of r.why) { if (!left.has(w)) left.set(w, []); left.get(w).push(F.rel); }
      if (!r.rows.length) continue;
      if (r.used) { anyUse = true; eol = r.eol; }
      changes.push({ file: F.rel, after: Buffer.from(r.after, 'latin1'), create: false, rows: r.rows });
    }
    if (anyUse && !ctx.exists(INC_REL)) {
      const clash = ['breed_body', 'breed_drive', 'breed_skills', 'breed_vet'].filter(n => m.byName.has(n) || m.vanilla.defined.has(n) || m.vanilla.called.has(n));
      if (clash.length) return { changes: [], cases: [{ id: 'breed-name-clash', title: 'breed macros not written', detail: clash.join(', ') + ' already exist' }] };
      changes.unshift({ file: INC_REL, after: Buffer.from(macroFile(eol), 'latin1'), create: true, rows: [{ line: 1, kind: 'create', before: '', after: 'breed_body breed_drive breed_skills breed_vet', note: 'TST-108' }] });
    }
    for (const [w, fs] of [...left].sort((a, b) => b[1].length - a[1].length)) {
      const title = w === 'breed_vet' ? 'their veterancy block literal (not the include + one call form)'
        : /^breed_/.test(w) ? `the ${w} perks literal` : 'their perks block as it is';
      const why = w === 'breed_vet' ? 'inline {"lvl_n" ..} entries' : /^breed_/.test(w) ? 'no exact run (order, value form, or a perk missing or between)' : w;
      cases.push({ id: 'breed-literal', title: `${fs.length} breeds keep ${title}`, detail: why + ': ' + fs.slice(0, 8).join(', ') + (fs.length > 8 ? ', ...' : '') });
    }
    return { changes, cases };
  },
};
