// macrostd step buylist: multiplayer buy-list cards in resource/set/multiplayer/units/** to ONE style, the one-line named call
//   ("unit_tank" side(ger) name(mk7) crew1(2) crew2(1) charge(10) tags(40) group(d1) button(v3) score(250) weight(0) points(5)
//    level(1) cost(250) fore(-31.0))
//   Two input styles: old cards {"mk7" ("v" c(10) t(40) s(eng) n1(2) n2(1) ...) {level 1} {cost 250} {fore -31.0}} (literal name,
//   macro inside, level/cost/fore as blocks) and calls of card macros whose body is one {"%name(%side)" ...} block (squads.set).
//   For each card the macro is flattened (nested calls such as generic_v inlined with the engine's text substitution, GPL-11, keys in
//   reverse sorted order, SDL-56) into a template; parameters get whole-word names by meaning (c -> charge, sc -> score, cN/nN by
//   their place: "mp/x/%n1" member1, ":%n1" crew1, "%c1 (" vehicle1 ...). Templates that differ only in soldier breed words
//   ("mp/%side/vehicle_supporter_41") become one macro with a breed parameter. New macros go to units/_macros.inc, included by every
//   root that reads a changed file, before its first use (SDL-17, TST-108). Every card is proven with sdlx (old text vs new call give
//   the same tokens and errors) before it is changed; anything else is a case and keeps its old text. Old macros stay defined.
//   Not converted (counted, no case): stat cards without level/cost ({"mp/ger/x" ("level_0" side(ger))}, "extra"), commented text.
//   Cases: card name that is not `name` or `name(side)` with side = the side parameter (SDL-19: a value cannot hold ')'), values
//   with ( ) % " or a line end, a parameter passed twice, %x the call leaves unreplaced, a parameter glued to word text (SDL-56),
//   macros defined differently in the roots that read the file, files a vanilla root reads.
// Author: Imperator_Aug (ARSENAL, ia-2a9a85a1)
const sdlx = require('../../lib/sdlx');
const { flatten } = require('../expand');
const { scan } = require('../scan');

const UNITS = 'resource/set/multiplayer/units/';
const INC = '_macros.inc';
const S1 = '\u0001', S2 = '\u0002';
const sent = p => S1 + p + S2;
const SENT_RE = /\u0001([^\u0002]*)\u0002/g;

// new macro base names by the old macro that gives most cards to the template (RobZ Realism); others: unit_<old name>
const NAMES = {
  v: 'unit_tank', v_com: 'unit_tank_commander_first', v_vet: 'unit_tank', v_rus41: 'unit_tank', v_hun: 'unit_tank', v_ita: 'unit_tank',
  v_rom: 'unit_tank', v_fin: 'unit_tank', vet_hun: 'unit_tank', v_rus_g: 'unit_tank', v_vet_com: 'unit_tank_commander_first',
  v3_tank: 'unit_tank_three_crew',
  vs: 'unit_vehicle_supporters', vs_rus41: 'unit_vehicle_supporters', vs_eng40: 'unit_vehicle_supporters', vs_ita: 'unit_vehicle_supporters',
  vs_bul: 'unit_vehicle_supporters', vs_hun: 'unit_vehicle_supporters', vs_fin: 'unit_vehicle_supporters', vs_rom: 'unit_vehicle_supporters',
  vs_rus_g: 'unit_vehicle_supporters_guard', vs_rus_g_noinfo: 'unit_vehicle_supporters_guard_noinfo',
  vs_ss: 'unit_vehicle_supporters_info', vs_ss_noinfo: 'unit_vehicle_supporters_noinfo', vs_ger_m: 'unit_vehicle_supporters_info',
  v_ss: 'unit_tank_info', v_ss_com: 'unit_tank_info_commander_first',
  v_seq: 'unit_tank_sequence', v2_seq: 'unit_tanks_sequence', v_seq_com: 'unit_tank_sequence_commander_first',
  v2_seq_com: 'unit_tanks_sequence_commander_first', v_seq_ita: 'unit_tank_sequence', v2_seq_ita: 'unit_tanks_sequence',
  vs_seq: 'unit_vehicle_supporters_sequence', vs2_seq: 'unit_vehicles_supporters_sequence', vs_seq_ita: 'unit_vehicle_supporters_sequence',
  vs2_seq_ita: 'unit_vehicle_supporters_sequence', vs3_seq_ita: 'unit_vehicle_supporters_sequence', vs_seq_rom: 'unit_vehicle_supporters_sequence',
  vs2_seq_rom: 'unit_vehicles_supporters_sequence',
  i1: 'unit_infantry', i2: 'unit_infantry', i3: 'unit_infantry', i5: 'unit_infantry', i6: 'unit_infantry', i8: 'unit_infantry',
  v0: 'unit_vehicle_members', v1: 'unit_vehicle_members', v2: 'unit_two_vehicles_members', '2v': 'unit_vehicle_pair', '22v': 'unit_vehicle_pair',
  light_mortar_ger: 'unit_light_mortar', light_mortar_eng: 'unit_light_mortar', light_mortar_ost: 'unit_light_mortar', light_mortar_ss: 'unit_light_mortar',
  how: 'unit_howitzer_tractor', fin_how: 'unit_howitzer_tractor', hun_how: 'unit_howitzer_tractor', ita_how: 'unit_howitzer_tractor',
  how_y: 'unit_howitzer',
};
// what a template holds: vehicles, members, crews -> 'vehicles1_members3' (names for macros the table does not know)
function struct(tpl) {
  const ps = new Set();
  for (const t of tpl) for (const m of t.matchAll(/%(\w+)/g)) ps.add(m[1]);
  const n = re => [...ps].filter(p => re.test(p)).length;
  const V = n(/^vehicle\d+$/), M = n(/^member\d*$/), C = n(/^crew\d*$/);
  return [V && 'vehicles' + V, M && 'members' + M, C && 'crews' + C].filter(Boolean).join('_');
}
// squad card macros (body already {"%name(%side)" ...}): squad_withNtypes -> squad_N, squad_withNtypes_vehicle -> squad_N_vehicle
function baseName(old, tpl) {
  if (NAMES[old]) return NAMES[old];
  let r = /^squad_with(\d+)types(_vehicle)?$/.exec(old);
  if (r) return 'squad_' + r[1] + (r[2] || '');
  r = /^i_seq_with(\d+)(x\d+)?types$/.exec(old);
  if (r) return 'squad_' + r[1] + (r[2] ? '_' + r[2] : '') + '_sequence';
  const st = struct(tpl);
  return st ? 'unit_' + st : 'unit_' + old.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}
const PARAM_TEXT = {
  side: 'army side folder: ger, eng, rus, usa, jap, ger_ss, ger2, rus_guard, axis_minor',
  name: 'card name (the entity of the first vehicle, or the squad name)',
  charge: 'recharge time after buying, s',
  tags: 'extra tags of the card (years 40..45, all, inf_only ...)',
  group: 'buy-menu group cell',
  button: 'buy-menu button (tab)',
  icon: 'icon index',
  score: 'score value',
  weight: 'cw value',
  points: 'cp value',
  level: 'unlock level',
  cost: 'price, points',
  fore: 'fore value',
  breed: 'soldier breed of the crew',
};
const pText = p => {
  if (PARAM_TEXT[p]) return PARAM_TEXT[p];
  let r;
  if ((r = /^breed(\d+)$/.exec(p))) return `soldier breed of crew ${r[1]}`;
  if ((r = /^crew(\d*)$/.exec(p))) return `number of crew${r[1] ? ' ' + r[1] : ''} soldiers`;
  if ((r = /^member(\d*)$/.exec(p))) return `squad member${r[1] ? ' ' + r[1] : ''}: breed:count`;
  if ((r = /^vehicle(\d*)$/.exec(p))) return `vehicle${r[1] ? ' ' + r[1] : ''} entity`;
  return p;
};
const ORDER = ['side', 'name', 'vehicle', 'breed', 'member', 'crew', 'charge', 'tags', 'group', 'button', 'icon', 'score', 'weight', 'points', 'level', 'cost', 'fore'];
const orderKey = p => { const b = p.replace(/\d+$/, ''), i = ORDER.indexOf(b); return [i < 0 ? 99 : i, +(p.slice(b.length) || 0), p]; };
const byOrder = (a, b) => { const x = orderKey(a), y = orderKey(b); return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); };

// engine parameter substitution (sdlx subst, GPL-11 / SDL-56): every "%name" replaced, names in reverse sorted order
function subst(text, params) {
  for (const name of [...params.keys()].sort().reverse()) text = text.split('%' + name).join(params.get(name));
  return text;
}

// lexer for SDL text: { k: '{' '}' '(' ')' 'S' 'W', a, b }; comments skipped (';' to line end), strings never span a line end
function lex(s) {
  const out = [], n = s.length;
  let j = 0;
  while (j < n) {
    const c = s[j];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '=') { j++; continue; }
    if (c === ';') { while (j < n && s[j] !== '\n' && s[j] !== '\r') j++; continue; }
    if (c === '{' || c === '}' || c === '(' || c === ')') { out.push({ k: c, a: j, b: j + 1 }); j++; continue; }
    if (c === '"') {
      let q = j + 1, bad = false;
      for (;;) { if (q >= n || s[q] === '\n' || s[q] === '\r') { bad = true; break; } if (s[q] === '\\') { q += 2; continue; } if (s[q] === '"') { q++; break; } q++; }
      out.push({ k: 'S', a: j, b: q, bad }); j = q; continue;
    }
    let q = j + 1;
    while (q < n && !' \t\r\n=;"(){}'.includes(s[q])) q++;
    out.push({ k: 'W', a: j, b: q }); j = q;
  }
  return out;
}

class Fail extends Error { constructor(id, msg) { super(msg); this.id = id; } }

// text of a macro call with params Map, nested string-name calls expanded the same way -> flat text (comments kept)
function flatCall(name, params, defs, depth) {
  if (depth > 16) throw new Fail('nested', `macro "${name}" nests deeper than 16`);
  const d = defs.get(name);
  if (!d) throw new Fail('undefined', `macro "${name}" not defined in the roots that read the file`);
  if (d.conflict) throw new Fail('define-differs', `macro "${name}" has different bodies in the roots that read the file`);
  return flatText(subst(d.text, params), defs, depth + 1);
}
function flatText(text, defs, depth) {
  const sc = scan(text);
  if (sc.defines.length || sc.includes.length) throw new Fail('control', 'define or include inside a card macro');
  const calls = sc.calls.filter(c => !sc.calls.some(o => o !== c && o.span[0] < c.span[0] && o.span[1] >= c.span[1])).sort((a, b) => b.span[0] - a.span[0]);
  for (const c of calls) {
    if (c.bad || c.dynamic || c.args.length) throw new Fail('call-shape', `call of "${c.name}" with positional args, a % name or bad params`);
    const P = new Map();
    for (const p of c.params) P.set(p.name, p.value);
    text = text.slice(0, c.span[0]) + ' ' + flatCall(c.name, P, defs, depth) + ' ' + text.slice(c.span[1]);
  }
  return text;
}

// template text -> normalized tokens (no comments); checks: no ( ), no %, no glued sentinel
function tplTokens(text) {
  const toks = lex(text).map(t => text.slice(t.a, t.b));
  for (const t of toks) {
    if (t === '(' || t === ')') throw new Fail('control', 'control block or arithmetic in the card');
    if (t.includes('%')) throw new Fail('unreplaced', `unreplaced ${/%\w*/.exec(t)[0]} in the card (SDL-21)`);
    for (const m of t.matchAll(SENT_RE)) { const nx = t[m.index + m[0].length]; if (nx && /\w/.test(nx)) throw new Fail('glued', `parameter %${m[1]} is glued to "${t.slice(m.index + m[0].length).replace(SENT_RE, '%$1')}" (SDL-56 prefix text)`); }
  }
  return toks;
}

// old parameter name -> new whole-word name, from its place in the template
const FIXED = { s: 'side', side: 'side', name: 'name', c: 'charge', sc: 'score', t: 'tags', g: 'group', b: 'button', cw: 'weight', cp: 'points', i: 'icon', f: 'fore', level: 'level', cost: 'cost', fore: 'fore' };
function renameMap(toks) {
  const seen = new Map();
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k];
    for (const m of t.matchAll(SENT_RE)) {
      const old = m[1];
      let nn = FIXED[old], r;
      if (!nn && (r = /^v(\d+)$/.exec(old))) nn = 'vehicle' + r[1];
      if (!nn && (r = /^[cn](\d*)$/.exec(old))) {
        const pre = t[m.index - 1], post = t.slice(m.index + m[0].length);
        if (pre === '/') nn = 'member' + r[1];
        else if (pre === ':') nn = 'crew' + r[1];
        else if ((t[0] === '"' && /^\s+\(/.test(post)) || (t === m[0] && toks[k - 1] === 'info' && toks[k - 2] === '{')) nn = 'vehicle' + r[1];
      }
      if (!nn) throw new Fail('param-place', `parameter %${old}: no whole-word name for its place in "${t.replace(SENT_RE, '%$1')}"`);
      if (seen.has(old) && seen.get(old) !== nn) throw new Fail('param-place', `parameter %${old} used as ${seen.get(old)} and ${nn}`);
      seen.set(old, nn);
    }
  }
  // 10 or more of a kind: two digits (member01 .. member14), so no name is a prefix of another (SDL-56)
  const wide = new Set();
  for (const nn of seen.values()) { const r = /^([a-z]+)(\d+)$/.exec(nn); if (r && +r[2] >= 10) wide.add(r[1]); }
  for (const [o, nn] of seen) { const r = /^([a-z]+)(\d+)$/.exec(nn); if (r && wide.has(r[1])) seen.set(o, r[1] + r[2].padStart(2, '0')); }
  const back = new Map();
  for (const [o, nn] of seen) { if (back.has(nn)) throw new Fail('param-clash', `%${back.get(nn)} and %${o} would both be ${nn}`); back.set(nn, o); }
  return seen;
}
const prefixClash = names => { for (const a of names) for (const b of names) if (b.length > a.length && b.startsWith(a)) return [a, b]; return null; };

// pretty print a token list of one or more blocks, depth = tabs
function pretty(toks, depth) {
  const root = { items: [] }, st = [root];
  for (const t of toks) {
    if (t === '{') { const b = { items: [] }; st[st.length - 1].items.push(b); st.push(b); }
    else if (t === '}') { if (st.length < 2) throw new Fail('shape', 'unbalanced } in card'); st.pop(); }
    else st[st.length - 1].items.push(t);
  }
  if (st.length !== 1) throw new Fail('shape', 'unclosed { in card');
  const T = d => '\t'.repeat(d), out = [];
  const pb = (b, d) => {
    if (!b.items.some(x => typeof x !== 'string')) { out.push(T(d) + '{' + b.items.join(' ') + '}'); return; }
    let head = [], k = 0;
    while (k < b.items.length && typeof b.items[k] === 'string') head.push(b.items[k++]);
    out.push(T(d) + '{' + head.join(' '));
    for (; k < b.items.length; k++) { const x = b.items[k]; if (typeof x === 'string') out.push(T(d + 1) + x); else pb(x, d + 1); }
    out.push(T(d) + '}');
  };
  for (const x of root.items) { if (typeof x === 'string') out.push(T(depth) + x); else pb(x, depth); }
  return out;
}

const tokenKey = (buf, defs) => {
  const errs = [];
  const r = sdlx.read(Buffer.from(buf, 'latin1'), { file: 'card', key: UNITS + 'card.set', defines: defs, open: () => null, onError: (f, l, code) => errs.push(code) });
  return flatten(r.root, []).join('\u0003') + '|' + errs.sort().join(' ');
};

function plan(ctx) {
  const m = ctx.model, changes = [], cases = [], stats = { converted: 0, oldStyle: 0, newStyle: 0, left: {}, notBuy: 0, files: 0 };
  const incKey = UNITS + INC;
  const units = [...m.files.values()].filter(f => f.scope && f.key.startsWith(UNITS) && f.key !== incKey).sort((a, b) => (a.key < b.key ? -1 : 1));
  const ownDefs = new Set(m.files.has(incKey) ? m.files.get(incKey).scan.defines.map(d => d.name) : []);

  // roots that read each units file
  const closure = new Map();
  const reach = k => { if (closure.has(k)) return closure.get(k); const s = new Set([k]); closure.set(k, s); for (const t of m.graph.get(k) || []) for (const x of reach(t)) s.add(x); return s; };
  const roots = [...m.roots.mod, ...m.roots.vanilla];
  const rootsOf = new Map(units.map(f => [f.key, []]));
  for (const r of roots) for (const k of reach(r)) if (rootsOf.has(k)) rootsOf.get(k).push(r);
  // defines at the end of each root (sdlx over the current text)
  const open = (r) => {
    if (r.kind !== 'virtual') return null;
    const F = m.files.get(r.key);
    let b = null;
    if (F) { try { b = ctx.read(F.rel); } catch (x) { b = null; } }
    else if (ctx.vanilla.has(r.key)) b = ctx.vanilla.read(r.key);
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  const defsCache = new Map();
  const rootDefs = r => {
    if (defsCache.has(r)) return defsCache.get(r);
    const b = open({ kind: 'virtual', key: r });
    const d = b ? sdlx.read(b.buf, { file: r, key: r, open, preInclude: m.preInclude(r), onError: () => {} }).defines : new Map();
    defsCache.set(r, d); return d;
  };
  const mergeDefs = rs => {
    const out = new Map();
    for (const r of rs) for (const [n, d] of rootDefs(r)) {
      const x = out.get(n);
      if (!x) out.set(n, { text: d.text, file: d.file, line: d.line });
      else if (x.text !== d.text) x.conflict = true;
    }
    return out;
  };
  const unitRoots = roots.filter(r => [...reach(r)].some(k => k !== r && rootsOf.has(k)));
  let dirDefs = null;

  // ---- pass 1: cards and their templates
  const cards = [];
  const fileInfo = new Map();
  for (const F of units) {
    const s = F.s, sc = F.scan;
    const orphan = !rootsOf.get(F.key).some(r => r !== F.key) && !sc.includes.length;
    const vanRoot = rootsOf.get(F.key).filter(r => !m.files.has(r));
    let defs;
    if (orphan) { dirDefs = dirDefs || mergeDefs(unitRoots); defs = dirDefs; }
    else defs = mergeDefs(rootsOf.get(F.key));
    fileInfo.set(F.key, { orphan, defs, vanRoot });
    const inDef = p => sc.defines.some(d => p > d.span[0] && p < d.span[1]);
    const toks = lex(s);
    const entrySpans = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.k !== '{' || !toks[k + 1] || toks[k + 1].k !== 'S' || inDef(t.a)) continue;
      // old card: { "NAME" ( "M" ... ) {key value}* }
      let j = k + 2, depth = 1, e = -1;
      for (let q = k + 1; q < toks.length; q++) { if (toks[q].k === '{') depth++; else if (toks[q].k === '}' && --depth === 0) { e = q; break; } }
      if (e < 0) continue;
      const span = [t.a, toks[e].b];
      entrySpans.push(span);
      const call = toks[j] && toks[j].k === '(' ? sc.calls.find(c => c.span[0] === toks[j].a) : null;
      const leafs = [];
      let ok = !!call;
      if (call) {
        j = k + 2; while (j < e && toks[j].a < call.span[1]) j++;
        while (ok && j < e) {
          if (toks[j].k === '{' && toks[j + 1] && toks[j + 1].k === 'W' && toks[j + 2] && toks[j + 2].k === 'W' && toks[j + 3] && toks[j + 3].k === '}') {
            leafs.push({ key: s.slice(toks[j + 1].a, toks[j + 1].b), value: s.slice(toks[j + 2].a, toks[j + 2].b) }); j += 4;
          } else ok = false;
        }
      }
      const keys = leafs.map(x => x.key);
      if (!ok || !keys.includes('level') || !keys.includes('cost')) { stats.notBuy++; continue; }
      const nameRaw = s.slice(toks[k + 1].a + 1, toks[k + 1].b - 1);
      cards.push({ F, style: 'old', span, line: F.scan.lineOf(t.a), text: s.slice(span[0], span[1]), call, leafs, nameRaw });
    }
    // card-macro calls outside old cards and defines
    for (const c of sc.calls) {
      if (c.inDefine >= 0 || entrySpans.some(sp => c.span[0] > sp[0] && c.span[0] < sp[1]) || ownDefs.has(c.name)) continue;
      const d = defs.get(c.name);
      if (!d || d.conflict) continue;
      const lt = lex(d.text);
      if (!(lt.length >= 2 && lt[0].k === '{' && lt[1].k === 'S' && /%name\b/.test(d.text.slice(lt[1].a, lt[1].b)))) continue;
      cards.push({ F, style: 'new', span: c.span, line: c.line, text: s.slice(c.span[0], c.span[1]), call: c });
    }
  }

  // templates
  for (const cd of cards) {
    try {
      const fi = fileInfo.get(cd.F.key);
      if (fi.vanRoot.length) throw new Fail('vanilla-root', `read by vanilla ${fi.vanRoot[0]}: the new include cannot be added there`);
      const c = cd.call;
      if (c.bad || c.dynamic || c.args.length) throw new Fail('call-shape', 'positional args, a % macro name or bad params');
      const vals = new Map(), P = new Map();
      for (const p of c.params) {
        if (vals.has(p.name) && vals.get(p.name) !== p.value) throw new Fail('param-twice', `parameter ${p.name} passed twice ("${vals.get(p.name)}", "${p.value}")`);
        vals.set(p.name, p.value); P.set(p.name, sent(p.name));
      }
      let body = flatCall(c.name, P, fi.defs, 0);
      if (cd.style === 'old') {
        for (const l of cd.leafs) { if (vals.has(l.key)) throw new Fail('param-twice', `${l.key} is a call parameter and a block`); vals.set(l.key, l.value); }
        if (cd.leafs.some(l => !FIXED[l.key] || FIXED[l.key] !== l.key)) throw new Fail('leaf', `card block {${cd.leafs.map(l => l.key).join('} {')}}: only level, cost, fore are parameters`);
        if (new Set(cd.leafs.map(l => l.key)).size !== cd.leafs.length) throw new Fail('param-twice', 'a card block twice');
        let nameTpl;
        const r = /^([^()"%\\\s]+)\(([^()"%\\\s]+)\)$/.exec(cd.nameRaw);
        if (/^[^()"%\\\s]+$/.test(cd.nameRaw)) { nameTpl = sent('name'); vals.set('name', cd.nameRaw); }
        else if (r && vals.has('s') && vals.get('s') === r[2]) { nameTpl = sent('name') + '(' + sent('s') + ')'; vals.set('name', r[1]); }
        else if (r) throw new Fail('name-side', `card name "${cd.nameRaw}": side "${r[2]}" is not the side parameter s(${vals.get('s') || ''})`);
        else throw new Fail('name', `card name "${cd.nameRaw}" is not name or name(side) (SDL-19: a value cannot hold ')')`);
        if (vals.has('name') && c.params.some(p => p.name === 'name')) throw new Fail('param-twice', 'name parameter and literal card name');
        body = '{"' + nameTpl + '" ' + body + ' ' + cd.leafs.map(l => `{${l.key} ${sent(l.key)}}`).join(' ') + '}';
      }
      const toks = tplTokens(body);
      const used = new Set();
      for (const t of toks) for (const mm of t.matchAll(SENT_RE)) used.add(mm[1]);
      for (const p of used) {
        const v = vals.get(p);
        if (v === undefined) throw new Fail('unreplaced', `parameter ${p} not passed`);
        if (/[()%"\r\n\\]/.test(v)) throw new Fail('value', `value ${p}(${v}) holds ( ) % " \\ or a line end`);
      }
      const ren = renameMap(toks);
      cd.ren = ren;
      cd.newVals = new Map([...used].map(p => [ren.get(p), vals.get(p)]));
      cd.tpl = toks.map(t => t.replace(SENT_RE, (x, p) => '%' + ren.get(p)));
      cd.oldMacro = c.name;
      const pc = prefixClash([...cd.newVals.keys()]);
      if (pc) throw new Fail('param-prefix', `${pc[0]} is a prefix of ${pc[1]} (SDL-56)`);
    } catch (x) {
      if (!(x instanceof Fail)) throw x;
      cd.fail = x;
    }
  }

  // ---- pass 2: group templates, merge breed words
  const live = cards.filter(c => !c.fail);
  const BREED = /\/([A-Za-z_][A-Za-z0-9_]*)(?=[^A-Za-z0-9_]|$)/g;
  const slotKey = tpl => tpl.map(t => t[0] === '"' ? t.replace(BREED, '/\u0004') : t).join(' ');
  const slotVals = tpl => { const v = []; for (const t of tpl) if (t[0] === '"') for (const mm of t.matchAll(BREED)) v.push(mm[1]); return v; };
  const groups = new Map();
  for (const cd of live) { const k = slotKey(cd.tpl); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(cd); }
  const macros = [];
  for (const [k, list] of groups) {
    const exact = new Map();
    for (const cd of list) { const t = cd.tpl.join(' '); if (!exact.has(t)) exact.set(t, []); exact.get(t).push(cd); }
    const sv = list.map(cd => slotVals(cd.tpl));
    const vary = sv[0].map((_, i) => i).filter(i => sv.some(v => v[i] !== sv[0][i]));
    if (exact.size > 1 && vary.length >= 1 && vary.length <= 2) {
      const bn = vary.length === 1 ? ['breed'] : ['breed1', 'breed2'];
      let slot = -1;
      const tpl = list[0].tpl.map(t => t[0] === '"' ? t.replace(BREED, (x, w) => { slot++; const vi = vary.indexOf(slot); return vi < 0 ? x : '/%' + bn[vi]; }) : t);
      list.forEach((cd, n) => { vary.forEach((i, vi) => cd.newVals.set(bn[vi], sv[n][i])); });
      if (prefixClash([...list[0].newVals.keys()])) { for (const [, l2] of exact) macros.push({ tpl: l2[0].tpl, cards: l2 }); continue; }
      macros.push({ tpl, cards: list });
    } else for (const [, l2] of exact) macros.push({ tpl: l2[0].tpl, cards: l2 });
  }
  // names
  const taken = new Set([...m.byName.keys(), ...m.vanilla.defined, ...m.vanilla.called]);
  for (const n of ownDefs) taken.delete(n);
  const ownText = new Map();
  if (m.files.has(incKey)) { const f = m.files.get(incKey); for (const d of f.scan.defines) ownText.set(d.name, f.s.slice(d.bodySpan[0], d.bodySpan[1]).replace(/\s+/g, ' ').trim()); }
  const prim = mc => { const c = new Map(); for (const cd of mc.cards) c.set(cd.oldMacro, (c.get(cd.oldMacro) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); };
  macros.sort((a, b) => b.cards.length - a.cards.length || (a.tpl.join(' ') < b.tpl.join(' ') ? -1 : 1));
  const usedNames = new Set();
  for (const mc of macros) {
    mc.olds = prim(mc);
    mc.lines = pretty(mc.tpl, 1);
    const norm = mc.lines.join(' ').replace(/\s+/g, ' ').trim();
    const same = [...ownText].find(([, t]) => t === norm);
    if (same && !usedNames.has(same[0])) { mc.name = same[0]; mc.existing = true; usedNames.add(mc.name); continue; }
    let base = baseName(mc.olds[0][0], mc.tpl);
    if (mc.tpl[1] && /\(%side\)"$/.test(mc.tpl[1]) && mc.cards[0].style === 'old') base += '_sided';
    const free = x => !usedNames.has(x) && !taken.has(x);
    let nm = base, i = 2;
    if (!free(nm)) { const st = struct(mc.tpl); if (st && !base.includes(st)) nm = base + '_' + st; }
    const b2 = nm;
    while (!free(nm)) nm = b2 + '_' + i++;
    mc.name = nm; usedNames.add(nm);
  }

  // ---- pass 3: new call text, sdlx proof per card
  const callText = (mc, cd) => '("' + mc.name + '" ' + [...cd.newVals.keys()].sort(byOrder).map(p => `${p}(${cd.newVals.get(p)})`).join(' ') + ')';
  const defText = mc => '\r\n' + mc.lines.join('\r\n') + '\r\n';
  const proofDefs = new Map();
  for (const mc of macros) for (const cd of mc.cards) {
    const fi = fileInfo.get(cd.F.key);
    if (!proofDefs.has(fi.defs)) proofDefs.set(fi.defs, new Map([...fi.defs].filter(([, d]) => !d.conflict)));
    const D = proofDefs.get(fi.defs);
    D.set(mc.name, { text: defText(mc), file: incKey, line: 1 });
  }
  for (const mc of macros) {
    mc.ok = [];
    for (const cd of mc.cards) {
      const D = proofDefs.get(fileInfo.get(cd.F.key).defs);
      cd.newText = callText(mc, cd);
      const a = tokenKey(cd.text, D), b = tokenKey(cd.newText, D);
      if (a !== b) cd.fail = new Fail('proof', `sdlx gives other tokens for ${cd.newText}`);
      else mc.ok.push(cd);
    }
  }
  // cases: one per reason + old macro + message, with every place
  const agg = new Map();
  for (const cd of cards) if (cd.fail) {
    const k = cd.fail.id + '|' + (cd.call ? cd.call.name : '') + '|' + cd.fail.message.replace(/\([^)]*\)|"[^"]*"/g, '');
    if (!agg.has(k)) agg.set(k, { cd, at: [] });
    agg.get(k).at.push(`${cd.F.rel.slice(UNITS.length)}:${cd.line}`);
    stats.left[cd.fail.id] = (stats.left[cd.fail.id] || 0) + 1;
  }
  for (const { cd, at } of agg.values()) cases.push({ id: 'buylist-' + cd.fail.id, title: `${at.length} card${at.length > 1 ? 's' : ''} of "${cd.call ? cd.call.name : '?'}" left in their style: ${cd.fail.message}`,
    detail: `${at.slice(0, 12).join(' ')}${at.length > 12 ? ' ...' : ''}; e.g. ${cd.text.replace(/\s+/g, ' ').slice(0, 200)}` });

  // ---- edits per file
  const perFile = new Map();
  for (const mc of macros) for (const cd of mc.ok) { if (!perFile.has(cd.F.key)) perFile.set(cd.F.key, []); perFile.get(cd.F.key).push({ cd, mc }); }
  const changedKeys = new Set(perFile.keys());
  for (const [key, eds] of perFile) {
    const F = m.files.get(key);
    let s = ctx.read(F.rel).toString('latin1');
    if (s !== F.s) throw new Error(`buylist: ${F.rel} changed since the model was built`);
    eds.sort((p, q) => q.cd.span[0] - p.cd.span[0]);
    for (const { cd } of eds) s = s.slice(0, cd.span[0]) + cd.newText + s.slice(cd.span[1]);
    const rows = eds.reverse().map(({ cd, mc }) => ({ line: cd.line, kind: cd.style === 'old' ? 'card' : 'card_call', before: cd.text, after: cd.newText, note: `was "${cd.oldMacro}", now "${mc.name}"` }));
    stats.converted += eds.length; stats.files++;
    stats.oldStyle += eds.filter(e => e.cd.style === 'old').length; stats.newStyle += eds.filter(e => e.cd.style === 'new').length;
    changes.push({ file: F.rel, after: Buffer.from(s, 'latin1'), create: false, rows, _key: key });
  }

  // ---- the include in every mod root that reads a changed file (not orphans: nothing reads them, their macros are undefined there)
  const needInc = new Map();
  for (const key of changedKeys) {
    if (fileInfo.get(key).orphan) continue;
    for (const r of rootsOf.get(key)) if (r !== key || reach(r).size > 1) { if (!needInc.has(r)) needInc.set(r, new Set()); needInc.get(r).add(key); }
  }
  for (const [r, keys] of needInc) {
    if (reach(r).has(incKey)) continue;
    const R = m.files.get(r);
    if (!R || !R.scope) { cases.push({ id: 'buylist-root', title: `${r}: root outside the edited files reads changed cards`, detail: [...keys].join(', ') }); continue; }
    const ch = changes.find(c => c._key === r);
    let s = ch ? ch.after.toString('latin1') : R.s;
    // first place in the root's own text: an include whose closure reaches a changed file, or a changed card of the root itself
    const sc = scan(s);
    let at = null;
    for (const inc of sc.includes) {
      if (inc.inDefine >= 0) continue;
      const t = sdlx.resolveInclude(inc.raw, r).key;
      if ([...keys].some(k => reach(t).has(k))) { at = at === null || inc.span[0] < at ? inc.span[0] : at; break; }
    }
    if (keys.has(r)) for (const e of perFile.get(r)) { const p = s.indexOf(e.cd.newText); if (p >= 0 && (at === null || p < at)) at = p; }
    if (at === null) { cases.push({ id: 'buylist-root', title: `${R.rel}: no place for the include found`, detail: [...keys].join(', ') }); continue; }
    const ls = s.lastIndexOf('\n', at - 1) + 1;
    const ind = /^[ \t]*/.exec(s.slice(ls))[0];
    const eol = /\r\n/.test(s) ? '\r\n' : '\n';
    const rk = r.slice(0, r.lastIndexOf('/') + 1);
    const raw = rk === UNITS ? INC : '/' + incKey.slice('resource/'.length);
    const line = `${ind}(include "${raw}")${eol}`;
    s = s.slice(0, ls) + line + s.slice(ls);
    const row = { line: sc.lineOf(ls), kind: 'include', before: '', after: line.trim(), note: `defines of ${INC} before the first converted card (SDL-17, TST-108)` };
    if (ch) { ch.after = Buffer.from(s, 'latin1'); ch.rows.unshift(row); }
    else changes.push({ file: R.rel, after: Buffer.from(s, 'latin1'), create: false, rows: [row], _key: r });
  }

  // ---- _macros.inc: new defines (appended when the file exists)
  const newMacros = macros.filter(mc => mc.ok.length && !mc.existing);
  if (newMacros.length) {
    const exists = m.files.has(incKey);
    let s = exists ? ctx.read(m.files.get(incKey).rel).toString('latin1') : ';SDL\r\n; buy-list card macros (macrostd buylist): one card per call, one call per line in the units files\r\n';
    if (!/\r\n$/.test(s)) s += '\r\n';
    const rows = [];
    for (const mc of newMacros) {
      const params = [...new Set(mc.ok.flatMap(cd => [...cd.newVals.keys()]))].sort(byOrder);
      const olds = mc.olds.map(([o, n]) => `"${o}" ${n}`).join(', ');
      const what = `buy card {${mc.tpl[1]} ...} (was ${olds})`;
      const hdr = [`; ${mc.name}: ${what}`, ...params.map(p => `;   ${p} - ${pText(p)}`), `;   e.g. ${mc.ok[0].newText}`];
      s += '\r\n' + hdr.join('\r\n') + '\r\n' + `(define "${mc.name}"` + defText(mc) + ')\r\n';
      rows.push({ line: 0, kind: 'define', before: '', after: mc.name, note: `${mc.ok.length} cards; was ${olds}` });
    }
    changes.push({ file: exists ? m.files.get(incKey).rel : 'resource/set/multiplayer/units/' + INC, after: Buffer.from(s, 'latin1'), create: !exists, rows });
  }

  // ---- old macros no mod card calls any more (left defined; step dead decides)
  const conv = new Map();
  for (const mc of macros) for (const cd of mc.ok) conv.set(cd.oldMacro, (conv.get(cd.oldMacro) || 0) + 1);
  const unused = [];
  const dropped = new Set();
  const callsLeft = n => { const x = m.byName.get(n); if (!x) return 0; return x.calls.filter(c => !(c.def && dropped.has(c.def.name))).length - (conv.get(n) || 0); };
  for (let again = true; again;) {
    again = false;
    for (const [n, x] of m.byName) {
      if (dropped.has(n) || !x.defs.some(d => d.scope && d.key.startsWith(UNITS))) continue;
      if (!conv.has(n) && !x.calls.some(c => c.def && dropped.has(c.def.name))) continue;
      if (callsLeft(n) <= 0 && !m.vanilla.called.has(n) && !m.dynMatch(n)) { dropped.add(n); unused.push(n); again = true; }
    }
  }
  for (const c of changes) delete c._key;
  const leftStr = Object.entries(stats.left).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  cases.push({ id: 'buylist-summary', title: `${stats.converted} cards converted (${stats.oldStyle} old style, ${stats.newStyle} card-macro calls) in ${stats.files} files; ${newMacros.length} macros added; left: ${leftStr}; ${stats.notBuy} stat/extra cards without level+cost not buy cards`,
    detail: `macros no mod card calls any more (left defined, step dead): ${unused.sort().join(' ') || 'none'}; orphan files changed (no root reads them, verify DIFF expected): ${[...changedKeys].filter(k => fileInfo.get(k).orphan).join(' ') || 'none'}` });
  return { changes, cases };
}

module.exports = { id: 'buylist', title: 'multiplayer buy-list cards to one-line named card-macro calls', plan, subst, lex, pretty };
