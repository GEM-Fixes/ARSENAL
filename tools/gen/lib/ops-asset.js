// ops-asset.js: gen ops for new parts that are not units: a weapon of any class, shells, items (grenades, mines), sound folders,
// sound classes (loudness rows), voices, skins, inventory models and map.info values. AS2 data layout. GoH [I]: gun, shell, item and
// soundclass run on the same file forms (GoH macros "fire rate" "reload time" "velocity" taken when the folder's .presets has them);
// sound, voice, skin, stuffmodel and mapinfo stop with their GEN_<OP>_AS2_ONLY code and one plain line (lib/games notFor, cited row).
// Registered by one line each in ops.js (exports), gen.js (OPS, SAMPLES) and specschema.js (FIELDS = assetFields()).
// Fields, examples and tags: tools/gen/README.md. Every op writes through ctx (the overlay: --plan writes nothing, a run writes
// only under --out), refuses with a GEN_<OP>_* code and a plain message, and lists the keys it writes in the facts.
// codes (counted): GEN_GUN_CLASS GEN_GUN_VALUE GEN_GUN_PARAM_UNKNOWN GEN_GUN_SOUND_MISSING GEN_GUN_LIKE_AMBIGUOUS GEN_SHELL_* GEN_ITEM_* GEN_SOUND_*
//   GEN_SOUNDCLASS_* GEN_VOICE_* GEN_SKIN_* GEN_STUFFMODEL_* GEN_MAPINFO_* (ARGS LIKE_MISSING LIKE_AMBIGUOUS EXISTS VALUE AS2_ONLY + per op);
//   WARN_GEN_SOUND_RATE WARN_GEN_SOUND_STEREO WARN_GEN_VOICE_RATE WARN_GEN_VOICE_STEREO WARN_GEN_SKIN_SIZE WARN_GEN_MAPINFO_KEY_UNCHECKED
//   WARN_GEN_SOUNDCLASS_PERCENT_SUM GEN_VOICE_LOUDNESS_UNKNOWN.
//   info: GEN_PLAN_WRITE GEN_SOUND_CONVERTED GEN_VOICE_CONVERTED GEN_SHELL_PRESET_DROPPED GEN_*_FULL_COPY
//   GEN_SOUND_MONO GEN_VOICE_MONO GEN_SOUNDCLASS_PERCENT GEN_VOICE_LOUDNESS (GEN-FIX4)
// Author: Imperator_Aug (ARSENAL, ia-13954fc7)
'use strict';
const fs = require('fs'), path = require('path');
const patch = require('../../patch-entity/patch-entity');
const sdlwrite = require('../../lib/sdlwrite');
const wav = require('../../lib/wav');
const { lower } = require('./ctx');
const O = () => require('./ops');                    // lazy: ops.js requires this file at its end

const S = v => (v === null || v === undefined) ? '' : String(v);
const list = v => v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v);
const EOL = '\r\n';
const eolOf = t => /\r\n/.test(t) ? '\r\n' : '\n';
const STUFF = 'resource/set/stuff/', SOUND = 'resource/sound/', TALK = 'resource/set/talk.set', SOUNDSET = 'resource/sound/sound.set';
const ID = /^[a-z0-9][a-z0-9_]*$/;
const GUN_NAME = /^[a-z0-9][a-z0-9_()-]*$/;
// weapon class -> stuff folders its like is looked up in (folder prefixes under resource/set/stuff/)
const CLASS_DIRS = { rifle: ['rifle/'], mg: ['mgun/'], smg: ['smg/'], pistol: ['pistol/'], launcher: ['bazooka/', 'reactive/'], cannon: ['gun/'], mounted: ['gun/', 'mgun/', 'flame/', 'reactive/', 'bombing/'] };
const SHELL_DIRS = ['shell/', 'bazooka/', 'ammo/', 'reactive/'];
const ITEM_DIRS = ['grenade/', 'explosive/', 'med/', 'capacity/', 'content/', 'head/', 'body/', 'special/', 'melee/'];
const SHELL_PRESETS = ['ap', 'apcr', 'fg', 'fg_medium', 'fg_heavy'];
const TALK_KINDS = ['human', 'vehicle', 'cannon'];
const SOUND_TAGS = ['effects', 'emotions', 'speech', 'environment'];

// ---- SDL text helpers (text level, so the file keeps its own layout, comments and bytes) ----------------------------------
// index of the brace closing the block opening at i ('{' or '('), strings and ; comments skipped. -1 = unbalanced
function sdlEnd(s, i) {
  const open = s[i], close = open === '(' ? ')' : '}';
  let d = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"') { j = s.indexOf('"', j + 1); if (j < 0) return -1; continue; }
    if (c === ';') { const e = s.indexOf('\n', j); if (e < 0) return -1; j = e; continue; }
    if (c === open) d++; else if (c === close && --d === 0) return j;
  }
  return -1;
}
// the file's root block: index of its '{' (comments and a ;SDL line skipped)
function rootOf(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ';') { const e = s.indexOf('\n', i); if (e < 0) return -1; i = e; continue; }
    if (c === '"') { const e = s.indexOf('"', i + 1); if (e < 0) return -1; i = e; continue; }
    if (c === '{') return i;
  }
  return -1;
}
// direct child blocks of the block opening at r: [{name (lower), a, e, paren}]
function kids(s, r) {
  const end = sdlEnd(s, r), out = [];
  if (end < 0) return out;
  for (let i = r + 1; i < end; i++) {
    const c = s[i];
    if (c === '"') { i = s.indexOf('"', i + 1); if (i < 0) break; continue; }
    if (c === ';') { const e = s.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (c === '{' || c === '(') {
      const e = sdlEnd(s, i); if (e < 0) break;
      const m = /^[{(]\s*"?([^\s"{}()]*)/.exec(s.slice(i, i + 80));
      out.push({ name: lower(m ? m[1] : ''), a: i, e, paren: c === '(' }); i = e;
    }
  }
  return out;
}
const indentOf = (s, i) => /^[ \t]*/.exec(s.slice(s.lastIndexOf('\n', i - 1) + 1))[0];
// put lines into the block opening at r, before its closing brace; a line may hold \n (a nested block), re-indented
function addIn(s, r, lines, eol) {
  if (!lines.length) return s;
  const end = sdlEnd(s, r), ind = indentOf(s, r), tail = s.slice(end);
  let head = s.slice(0, end);
  if (!head.slice(r).includes('\n')) return head.replace(/\s*$/, '') + ' ' + lines.map(l => l.replace(/\s*\n\s*/g, ' ')).join(' ') + tail;
  head = head.replace(/[ \t]*$/, '');
  if (!/\n$/.test(head)) head += eol;
  return head + lines.map(l => ind + '\t' + l.replace(/\r?\n/g, eol + ind + '\t') + eol).join('') + ind + tail;
}
// replace the first child block {name ..} of block r with text, else add it
function setKid(s, r, name, text, eol) {
  const k = kids(s, r).find(x => !x.paren && x.name === lower(name));
  return k ? s.slice(0, k.a) + text + s.slice(k.e + 1) : addIn(s, r, [text], eol);
}
// cut s[a..e]; the whole line goes when nothing else is on it
function cut(s, a, e) {
  const ls = s.lastIndexOf('\n', a - 1) + 1, le = s.indexOf('\n', e + 1);
  const before = s.slice(ls, a), after = le < 0 ? s.slice(e + 1) : s.slice(e + 1, le);
  if (!before.trim() && !after.replace(/;.*$/, '').trim()) return s.slice(0, ls) + (le < 0 ? '' : s.slice(le + 1));
  return s.slice(0, a) + s.slice(e + 1);
}
// a raw SDL argument from a spec value: '' for a bare macro call, text without braces / ; / unbalanced quotes, else null
function rawArg(v) {
  if (v === true || v === null || v === '') return '';
  if (typeof v === 'number') return isFinite(v) ? String(v) : null;
  const t = Array.isArray(v) ? v.map(S).join(' ') : S(v).trim();
  if (!/^[A-Za-z0-9_ .,()+*\/%"#-]*$/.test(t) || (t.match(/"/g) || []).length % 2) return null;
  let d = 0; for (const c of t) { if (c === '(') d++; else if (c === ')' && --d < 0) return null; }
  return d ? null : t;
}
// a number check bound to one refusal code: (value, what, lo, hi, int) -> number | null (finding written)
function numOk(ctx, code, where) {
  return (v, what, lo, hi, int) => {
    const n = Number(v);
    if (v === '' || v === null || v === undefined || typeof v === 'boolean' || Array.isArray(v) || !isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) {
      ctx.err(code, `${what} "${S(v)}": ${int ? 'a whole number' : 'a number'} ${lo}..${hi}`, where); return null;
    }
    return Math.round(n * 10000) / 10000;
  };
}
const round = n => Math.round(n * 10000) / 10000;
// write through ctx; --plan: a text file's changed lines (new file: every line) as info GEN_PLAN_WRITE, binary files only counted in the facts
const PLAN_MAX = 80;
function put(ctx, key, data) {
  const old = ctx.plan ? ctx.read(key) : null, buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
  ctx.write(key, buf);
  if (!ctx.plan || buf.includes(0)) return;
  const d = old ? patch.lineDiff(old.toString('latin1'), buf.toString('latin1')) : buf.toString('latin1').split(/\r?\n/).filter((l, i, a) => l || i < a.length - 1).map((l, i) => `+${i + 1}: ${l}`);
  ctx.info('GEN_PLAN_WRITE', `${key}${old ? '' : ' (new file)'}: ${d.length} line(s)`, 'plan');
  d.slice(0, PLAN_MAX).forEach(l => ctx.info('GEN_PLAN_WRITE', `${key} ${l}`, 'plan'));
  if (d.length > PLAN_MAX) ctx.info('GEN_PLAN_WRITE', `${key} ... ${d.length - PLAN_MAX} more line(s)`, 'plan');
}
function defExists(ctx, n) { return ctx.virt.has('entity:' + n) || ctx.keys(new RegExp('^resource/entity/.*/' + esc(n) + '\\.def$')).length > 0; }
// facts: every key written (gen --json --plan lists them all too)
function wrote(ctx, op, keys) {
  const k = [...keys];
  ctx.facts.push(`${op}: writes ${k.length} file(s): ${k.slice(0, 24).join(', ')}${k.length > 24 ? ` .. +${k.length - 24} more (gen --json --plan lists every key)` : ''}`);
}

// ---- stuff (resource/set/stuff/**): a file's tags are its name split on "." (mg42, panzershreck.weapon, bullet76.fg.ammo) ---
// the engine finds a stuff by a subset of tags, the first match wins [I: clone-entity notes]
function stuffIndex(ctx) {
  return ctx.keys(/^resource\/set\/stuff\/.+/).filter(k => !/\/\.[^/]*$/.test(k)).map(k => {
    const base = k.slice(k.lastIndexOf('/') + 1);
    return { key: k, dir: k.slice(STUFF.length, k.lastIndexOf('/') + 1), base, tags: new Set(base.split('.').filter(Boolean)) };
  });
}
const words = v => lower(S(v)).trim().split(/[\s.]+/).filter(Boolean);
function findStuff(idx, w, dirs) {
  const hits = w.length ? idx.filter(x => w.every(t => x.tags.has(t)) && (!dirs || dirs.some(d => x.dir.startsWith(d)))) : [];
  const exact = hits.filter(x => x.tags.size === w.length);
  return { hits, exact, pick: exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null };
}
// the file and what it inherits ({from "tags"}), nearest first; a parent in the same folder is preferred
function chainOf(ctx, idx, hit) {
  const out = []; let cur = hit;
  for (let i = 0; i < 8 && cur; i++) {
    const text = ctx.readStr(cur.key); if (text === null) break;
    out.push({ key: cur.key, dir: cur.dir, text });
    const r = rootOf(text), m = r < 0 ? null : /^\{\s*from\s+"([^"]+)"/i.exec(text.slice(r));
    if (!m) break;
    const f = findStuff(idx, words(m[1])), same = a => a.find(x => x.dir === cur.dir);
    cur = same(f.exact) || f.exact[0] || same(f.hits) || f.hits[0] || null;
  }
  return out;
}
// macro names a stuff folder offers: its .presets (else the parent folder's) and the files those include. bodies (optional Map) gets name -> define text
function macrosOf(ctx, dir, bodies) {
  const out = new Set(), seen = new Set();
  const take = key => {
    if (seen.has(key)) return false; seen.add(key);
    const t = ctx.readStr(key); if (t === null) return false;
    for (const m of t.matchAll(/\(\s*define\s+"([^"]+)"/gi)) {
      out.add(lower(m[1]));
      if (bodies && !bodies.has(lower(m[1]))) { const e = sdlEnd(t, m.index); bodies.set(lower(m[1]), e < 0 ? t.slice(m.index) : t.slice(m.index, e + 1)); }
    }
    for (const m of t.matchAll(/\(\s*include\s+"([^"]+)"/gi)) take(('resource/' + lower(m[1]).replace(/\\/g, '/')).replace(/\/+/g, '/'));
    return true;
  };
  for (let d = dir; ; d = d.replace(/[^/]+\/$/, '')) { if (take(STUFF + d + '.presets') || !d) break; }
  return out;
}
// text without its {parameters "x" ..} blocks (their values belong to one shell type)
function cutParams(text) {
  let s = text, m;
  while ((m = /\{\s*parameters\s+"/i.exec(s))) { const e = sdlEnd(s, m.index); if (e < 0) break; s = s.slice(0, m.index) + s.slice(e + 1); }
  return s;
}
// the like's current values, for "old -> new" in the facts
function weaponFacts(chain) {
  const own = chain.map(c => cutParams(c.text)), f = {};
  const first = re => { for (const t of own) { const m = re.exec(t); if (m) return m; } return null; };
  let m;
  if ((m = first(/\(\s*"recoveryTime"\s+r\(\s*([\d.]+)/i))) f.rof = +m[1]; else if ((m = first(/\{\s*recoveryTime\s+([\d.]+)/i))) f.rof = Math.round(60 / +m[1]);
  if ((m = first(/\{\s*filling\s+"([^"]+)"\s+(\d+)/i))) { f.filling = m[1]; f.magazine = +m[2]; }
  if ((m = first(/\{\s*rechargeTime\s+([\d.]+)/i))) f.reload = +m[1];
  if ((m = first(/\{\s*spreading\s+([\d.]+)/i))) f.spread = +m[1];
  if ((m = first(/\{\s*RelaxationTime\s+([\d.]+)/i))) f.aim = +m[1];
  if ((m = first(/\{\s*healthDamage\s+([\d.]+)/i))) f.health = +m[1];
  if ((m = first(/\{\s*range\s+([\d.]+)\s+([\d.]+)/i))) f.range = m[1] + ' ' + m[2];
  if ((m = first(/\(\s*"speed"\s+s\(\s*([\d.]+)/i))) f.speed = +m[1]; else if ((m = first(/\{\s*speed\s+([\d.]+)/i))) f.speed = +m[1];
  if ((m = first(/\{\s*projectileDamage\s+([\d.]+)/i))) f.damage = +m[1];
  // GoH macro forms (vanilla rifle/mgun/gun files): ("fire rate" rpm(n)) ("reload time" seconds(n)) ("velocity" mps(n))
  if (f.rof === undefined && (m = first(/\(\s*"fire rate"\s+rpm\(\s*([\d.]+)/i))) f.rof = +m[1];
  if (f.reload === undefined && (m = first(/\(\s*"reload time"\s+seconds\(\s*([\d.]+)/i))) f.reload = +m[1];
  if (f.speed === undefined && (m = first(/\(\s*"velocity"\s+mps\(\s*([\d.]+)/i))) f.speed = +m[1];
  return f;
}
// the like's burst seconds [short, long]: the last {burst {short n s} {long n s}} or ("burst_x") of the nearest file in the chain that has one
// (a macro is read from its define in bodies); null when none is found
function burstTimes(chain, bodies) {
  const pair = t => { const m = /\{\s*burst\s*\{\s*short\s+[\d.]+\s+([\d.]+)\s*\}\s*\{\s*long\s+[\d.]+\s+([\d.]+)/i.exec(t); return m ? [+m[1], +m[2]] : null; };
  for (const c of chain) {
    const t = cutParams(c.text), hits = [];
    for (const m of t.matchAll(/\{\s*burst\s*\{\s*short\b/gi)) hits.push({ at: m.index, v: pair(t.slice(m.index)) });
    for (const m of t.matchAll(/\(\s*"(burst_[a-z0-9_]+)"/gi)) { const b = bodies && bodies.get(lower(m[1])); hits.push({ at: m.index, v: b ? pair(b) : null }); }
    const last = hits.filter(h => h.v).sort((a, b) => a.at - b.at).pop();
    if (last) return last.v;
  }
  return null;
}
// weapon own-file lines for the class fields. o = plain values; general = also speed/damage/range/accuracy/caliber (the cannon op does them for gun/)
function gunLines(ctx, o, mac, base, dir, general, where) {
  const num = numOk(ctx, 'GEN_GUN_VALUE', where), L = [], said = []; let bad = false;
  const was = k => base[k] === undefined ? '?' : base[k];
  const macList = pre => [...mac].filter(x => x.startsWith(pre)).map(x => x.slice(pre.length)).join(' ') || 'none in ' + dir + '.presets';
  if (o.rof !== undefined) {
    const n = num(o.rof, 'rof (rounds per minute)', 1, 3000);
    if (n === null) bad = true;
    // GoH folders define "fire rate" rpm(..) (set/small_firearms_accuracy.inc, gun/.presets; vanilla rifle/mgun files use it [V GoH data]); AS2 has none of it
    else { L.push(mac.has('recoverytime') ? `("recoveryTime" r(${n}))` : mac.has('fire rate') ? `("fire rate" rpm(${n}))` : `{recoveryTime ${round(60 / n)}}`); said.push(`rate of fire ${was('rof')} -> ${n} rpm`); }
  }
  if (o.burst !== undefined) {
    const b = o.burst, w = isMap(b) || Array.isArray(b) ? '' : lower(S(b)).trim();
    if (/^[a-z_]+$/.test(w)) {
      if (mac.has('burst_' + w.replace(/^burst_/, ''))) { L.push(`("burst_${w.replace(/^burst_/, '')}")`); said.push('burst ' + w); }
      else { ctx.err('GEN_GUN_VALUE', `burst "${w}": a preset of ${dir}.presets (${macList('burst_')}) or two numbers "short long" (rounds)`, where); bad = true; }
    } else {
      // rounds "short long", optional seconds "short long short_s long_s"; seconds not given come from the like (else 0.3 / 0.7)
      const pair = Array.isArray(b) ? b : isMap(b) ? [b.short, b.long, b.short_s, b.long_s] : w.split(/[\s,]+/);
      const sh = num(pair[0], 'burst short (rounds)', 1, 500, true), lg = num(pair[1], 'burst long (rounds)', 1, 500, true);
      const lt = base.burstTime, sec = (v, i, what) => v === undefined || v === null || v === '' ? (lt ? lt[i] : [0.3, 0.7][i]) : num(v, what, 0, 60);
      const ss = sec(pair[2], 0, 'burst short seconds'), ls = sec(pair[3], 1, 'burst long seconds');
      if (sh === null || lg === null || ss === null || ls === null) bad = true;
      else {
        L.push(`{burst {short ${sh} ${ss}} {long ${lg} ${ls}}}`);
        said.push(`burst ${sh}/${lg} rounds, ${ss}/${ls} s`);
        const given = pair[2] !== undefined && pair[2] !== '' && pair[3] !== undefined && pair[3] !== '';
        if (!given) ctx.info(lt ? 'GEN_GUN_BURST_TIME_LIKE' : 'GEN_GUN_BURST_TIME_DEFAULT', lt ? `burst seconds ${lt[0]} / ${lt[1]} kept from the like (give "short long short_s long_s" to set them)` : `the like has no {burst} to read seconds from: 0.3 / 0.7 s used (give "short long short_s long_s" to set them)`, where);
      }
    }
  }
  const plain = [['spread', 'spread ({spreading})', 0, 50, 'spreading'], ['aim', 'aim (seconds, {RelaxationTime})', 0, 30, 'RelaxationTime'],
    ['reload', 'reload (seconds, {rechargeTime})', 0.05, 120, 'rechargeTime'], ['health', 'health (damage to soldiers, {healthDamage})', 0, 100000, 'healthDamage']];
  if (general) plain.push(['damage', 'damage ({projectileDamage})', 0, 5000, 'projectileDamage']);
  for (const [k, what, lo, hi, key] of plain) {
    if (o[k] === undefined) continue;
    const n = num(o[k], what, lo, hi);
    // GoH: reload through its "reload time" seconds(..) macro when the folder offers it (vanilla GoH weapons use it [V GoH data])
    if (n === null) bad = true; else { L.push(k === 'reload' && mac.has('reload time') ? `("reload time" seconds(${n}))` : `{${key} ${n}}`); said.push(`${k} ${was(k)} -> ${n}`); }
  }
  if (o.magazine !== undefined) {
    const n = num(o.magazine, 'magazine (rounds)', 1, 2000, true);
    if (n === null) bad = true;
    else if (!base.filling) { ctx.err('GEN_GUN_VALUE', `magazine: the like has no {filling "<ammo>" n} to resize`, where); bad = true; }
    else { L.push(`{filling "${base.filling}" ${n}}`); said.push(`magazine ${was('magazine')} -> ${n}`); }
  }
  for (const [k, sub, key] of [['fire_sound', 'shot', 'fireSound'], ['reload_sound', 'reload', 'reloadSound']]) {
    if (o[k] === undefined) continue;
    const p = lower(S(o[k])).trim().replace(/\\/g, '/').replace(/^\/+/, ''), q = p.replace(/\/+$/, '');
    if (!/^[a-z0-9_\/.-]+$/.test(p)) { ctx.err('GEN_GUN_VALUE', `${k} "${S(o[k])}": a path under resource/sound/weapon/${sub}/ (a-z 0-9 _ / . -)`, where); bad = true; continue; }
    if (!ctx.virt.has('sound:weapon/' + sub + '/' + q) && !ctx.keys(new RegExp('^' + esc(SOUND + 'weapon/' + sub + '/' + q) + '(/|\\.|$)')).length) {
      ctx.err('GEN_GUN_SOUND_MISSING', `${k} "${p}": nothing at resource/sound/weapon/${sub}/${q} in the mod or the game (make it with a sound op first: id weapon/${sub}/${q})`, where); bad = true; continue;
    }
    L.push(`{${key} "${p}"}`); said.push(`${k} ${p}`);
  }
  if (general) {
    if (o.speed !== undefined) { const n = num(o.speed, 'speed (m/s)', 10, 3000); if (n === null) bad = true; else { L.push(mac.has('speed') ? `("speed" s(${n}))` : mac.has('velocity') ? `("velocity" mps(${n}))` : `{speed ${n}}`); said.push(`speed ${was('speed')} -> ${n}`); } }
    if (o.range !== undefined) {
      const w = lower(S(Array.isArray(o.range) ? o.range.join(' ') : o.range)).trim(), two = w.split(/[\s,]+/);
      if (two.length === 2 && two.every(x => x !== '' && isFinite(+x))) {
        const a = num(two[0], 'range (effective)', 1, 2000), b2 = num(two[1], 'range (max)', 1, 2000);
        if (a === null || b2 === null) bad = true; else { L.push(`{range ${a} ${b2}}`); said.push(`range ${was('range')} -> ${a} ${b2}`); }
      } else if (mac.has('range_' + w.replace(/^range_/, ''))) { L.push(`("range_${w.replace(/^range_/, '')}")`); said.push('range ' + w); }
      else { ctx.err('GEN_GUN_VALUE', `range "${w}": two numbers "effective max" or a preset (${macList('range_')})`, where); bad = true; }
    }
    for (const k of ['accuracy', 'caliber']) {
      if (o[k] === undefined) continue;
      const w = lower(S(o[k])).trim().replace(new RegExp('^' + k + '_'), '');
      if (mac.has(k + '_' + w)) { L.push(`("${k}_${w}")`); said.push(`${k} ${w}`); }
      else { ctx.err('GEN_GUN_VALUE', `${k} "${S(o[k])}": a preset of ${dir}.presets: ${macList(k + '_')}`, where); bad = true; }
    }
  }
  if (o.params !== undefined) {
    if (!isMap(o.params)) { ctx.err('GEN_GUN_VALUE', 'params: a map {macro: args} (("macro" args)) or {shell type: {key: value}} ({parameters "type" ..})', where); bad = true; }
    else for (const [k, v] of Object.entries(o.params)) {
      const kk = lower(k);
      if (isMap(v)) {
        if (!/^[a-z0-9_ ]+$/.test(kk)) { ctx.err('GEN_GUN_VALUE', `params "${k}": a shell type name (a-z 0-9 _)`, where); bad = true; continue; }
        const inner = [];
        for (const [ik, iv] of Object.entries(v)) {
          const r = rawArg(iv);
          if (r === null || !/^[A-Za-z_]\w*$/.test(ik)) { ctx.err('GEN_GUN_VALUE', `params ${k}.${ik} "${S(iv)}": a key name and a plain value (no braces or ;)`, where); bad = true; continue; }
          inner.push(mac.has(lower(ik)) ? `("${ik}"${r ? ' ' + r : ''})` : `{${ik}${r ? ' ' + r : ''}}`);
        }
        L.push(`{parameters "${kk}"\n\t${inner.join('\n\t')}\n}`); said.push(`own values for ${kk} shells`);
      } else if (mac.has(kk)) {
        const r = rawArg(v);
        if (r === null) { ctx.err('GEN_GUN_VALUE', `params ${k} "${S(v)}": macro arguments as text, e.g. r(1200) or s(820) (no braces or ;)`, where); bad = true; continue; }
        L.push(`("${k}"${r ? ' ' + r : ''})`); said.push(`("${k}"${r ? ' ' + r : ''})`);
      } else { ctx.err('GEN_GUN_PARAM_UNKNOWN', `params ${k}: not a macro of ${dir}.presets (${[...mac].sort().join(' ') || 'none'}); a shell type takes a map, ${k}: {key: value}`, where); bad = true; }
    }
  }
  return { L, said, bad };
}

// ---- gun: a new weapon of any class (rifle mg smg pistol launcher cannon mounted) ------------------------------------------
// no class (or cannon) and none of the class fields: exactly the cannon op (ops.js opGun), so old specs and gold stay the same
function opGunAny(ctx, spec) {
  const cls = lower(S(spec.class)).trim(), name = lower(S(spec.name)).trim(), like = lower(S(spec.like)).trim(), where = 'gun ' + name;
  const o = { rof: spec.rof, burst: spec.burst, spread: spec.spread, aim: spec.aim, reload: spec.reload, health: spec.health, params: spec.params, magazine: spec.magazine, fire_sound: spec.fire_sound, reload_sound: spec.reload_sound };
  const extra = Object.keys(o).filter(k => o[k] !== undefined);
  if (cls && !CLASS_DIRS[cls]) { ctx.err('GEN_GUN_CLASS', `class "${cls}": one of ${Object.keys(CLASS_DIRS).join(' ')}`, where); return; }
  if ((!cls || cls === 'cannon') && !extra.length) return O().opGun(ctx, spec);
  // GoH [I]: same stuff tree (resource/set/stuff/<class>/, {from "<like>"}, GHKEY-63/68) and the folder's own .presets macros
  // ("fire rate" "reload time" "velocity", GoH burst_* and spreading_*), read from the game like on AS2
  if (!GUN_NAME.test(name) || !like) { ctx.err('GEN_GUN_ARGS', 'gun needs name (new weapon name: a-z 0-9 _ ( ) -, no dots or spaces) and like (existing weapon to inherit from)', where); return; }
  if (spec.reload !== undefined && spec.recharge !== undefined) { ctx.err('GEN_GUN_ARGS', 'reload and recharge both set {rechargeTime}: give one', where); return; }
  const idx = stuffIndex(ctx), dirs = CLASS_DIRS[cls || 'cannon'], f = findStuff(idx, words(like), dirs);
  if (!f.hits.length) {
    const any = findStuff(idx, words(like));
    if (any.hits.length) ctx.err('GEN_GUN_CLASS', `"${like}" is ${any.hits[0].key.slice(STUFF.length)}, not a ${cls || 'cannon'} weapon (class ${cls || 'cannon'} looks in ${dirs.join(' ')}); pick the class of the like`, where);
    else ctx.err('GEN_GUN_LIKE_MISSING', `no weapon "${like}" under ${dirs.map(d => STUFF + d).join(' ')} in the mod or the game data`, where);
    return;
  }
  if (!f.pick) { ctx.err('GEN_GUN_LIKE_AMBIGUOUS', `"${like}" matches ${f.hits.length} files (${f.hits.slice(0, 4).map(x => x.key.slice(STUFF.length)).join(' | ')}): give more of its name`, where); return; }
  const bodies = new Map(), chain = chainOf(ctx, idx, f.pick), base = weaponFacts(chain), mac = macrosOf(ctx, f.pick.dir, bodies);
  base.burstTime = burstTimes(chain, bodies);
  if (f.pick.dir === 'gun/') {
    // a cannon: the cannon op writes the file and its own fields, the class fields go in after
    const g = gunLines(ctx, o, mac, base, f.pick.dir, false, where);
    if (g.bad) return;
    const key = STUFF + 'gun/' + name;
    O().opGun(ctx, Object.assign({}, spec, { like: f.pick.base }));
    if (!ctx.dirty.has(key)) return;
    const t = ctx.readStr(key);
    put(ctx, key, addIn(t, rootOf(t), g.L, EOL));
    if (g.said.length) ctx.facts.push(`gun: ${name}: also ${g.said.join(', ')}`);
    wrote(ctx, 'gun', [key]);
    return;
  }
  if (spec.pen !== undefined || spec.pen_scale !== undefined) { ctx.err('GEN_GUN_CLASS', `pen / pen_scale are cannon tables (gun/ folder); "${like}" is ${f.pick.key.slice(STUFF.length)}: use params for its own macros`, where); return; }
  const g = gunLines(ctx, Object.assign({}, o, { reload: spec.reload !== undefined ? spec.reload : spec.recharge, speed: spec.speed, damage: spec.damage, range: spec.range, accuracy: spec.accuracy, caliber: spec.caliber }), mac, base, f.pick.dir, true, where);
  if (g.bad) return;
  const pat = f.pick.tags.has('pattern'), ext = !pat && f.pick.base.includes('.') ? f.pick.base.slice(f.pick.base.indexOf('.')) : '';
  const key = STUFF + f.pick.dir + name + ext;
  if (ctx.virt.has('stuff:' + name) || findStuff(idx, (name + ext).split('.')).hits.length) { ctx.err('GEN_GUN_EXISTS', `a weapon named "${name}" already exists (or a file whose name holds every part of it); the first one found wins, pick another name`, where); return; }
  const from = f.pick.base.split('.').join(' ');
  put(ctx, key, `{from "${from}"\t; gen: new ${cls} weapon, values not listed here come from ${f.pick.key.slice(STUFF.length)}` + EOL + g.L.map(l => '\t' + l.replace(/\n/g, EOL + '\t') + EOL).join('') + '}' + EOL);
  ctx.virt.add('stuff:' + name); ctx.names.add(name);
  if (spec.display) ctx.texts.push({ key: 'desc/weapon/' + name, text: S(spec.display), file: '' });
  ctx.facts.push(`gun: ${name} (${cls}, from ${f.pick.key.slice(STUFF.length)}${base.filling ? ', ammo "' + base.filling + '"' : ''})${g.said.length ? ': ' + g.said.join(', ') : ': same values, own file'}`);
  wrote(ctx, 'gun', [key]);
  ctx.test.push(`gun: ${name}: give it to a soldier or unit (set its weapon / inventory to "${name}"), fire a long burst at a target 50 m away: rate, burst length, spread, aim time and reload should match ${g.said.join(', ') || 'the like'} [T]. Macros come from ${STUFF}${f.pick.dir}.presets [I].`);
}

// ---- shell / item: a full copy of the like with edits (blast layers, preset arguments, blocks the like only inherits) -------
// blast layers: [{energy, area "inner outer"} | "energy inner outer"] -> {damage blastwave ..} then {damage add blastwave ..}
function blastLayers(ctx, v, code, where) {
  const num = numOk(ctx, code, where), out = [];
  for (const [i, b] of list(v).entries()) {
    let e, a0, a1;
    if (isMap(b)) { e = b.energy; const ar = Array.isArray(b.area) ? b.area : S(b.area).trim().split(/[\s,]+/); a0 = ar[0]; a1 = ar[1]; }
    else [e, a0, a1] = Array.isArray(b) ? b : S(b).trim().split(/[\s,]+/);
    const E = num(e, `blast[${i}] energy`, 0, 10000), A = num(a0, `blast[${i}] inner radius (m)`, 0, 500), B = num(a1, `blast[${i}] outer radius (m)`, 0, 500);
    if (E === null || A === null || B === null) return null;
    if (A > B) { ctx.err(code, `blast[${i}]: inner radius ${A} is above the outer ${B}`, where); return null; }
    out.push(`{damage ${i ? 'add ' : ''}blastwave\n\t{energy ${E}}\n\t{area ${A} ${B}}\n}`);
  }
  if (!out.length) { ctx.err(code, 'blast: one or more layers "energy inner outer" (or {energy, area})', where); return null; }
  return out;
}
// replace the root blast layers (and an fg* preset call, which writes its own) by the given ones. KEY-17: a {damage} without add replaces the inherited ones
function putBlast(text, layers, eol) {
  let r = rootOf(text), dropped = null;
  const gone = kids(text, r).filter(k => (!k.paren && k.name === 'damage' && /blastwave/i.test(text.slice(k.a, k.e + 1))) || (k.paren && /^fg/.test(k.name)));
  for (const k of gone.slice().reverse()) { if (k.paren) dropped = text.slice(k.a, k.e + 1); text = cut(text, k.a, k.e); }
  r = rootOf(text);
  return { text: addIn(text, r, layers, eol), dropped, removed: gone.length };
}
// make sure the root has its own {name ..} block: copied from the nearest file of the chain that has one. undefined = nowhere
function ownBlock(text, chain, name, eol) {
  const r = rootOf(text);
  if (kids(text, r).some(k => !k.paren && k.name === name)) return { text, from: null };
  for (const c of chain.slice(1)) {
    const cr = rootOf(c.text), k = kids(c.text, cr).find(x => !x.paren && x.name === name);
    if (!k) continue;
    const ind = indentOf(c.text, k.a), blk = c.text.slice(k.a, k.e + 1).split(/\r?\n/).map((l, i) => i && l.startsWith(ind) ? l.slice(ind.length) : l).join('\n');
    return { text: addIn(text, r, [blk], eol), from: c.key };
  }
  return { text, from: undefined };
}
function setIn(text, blk, sub, line, eol) {
  const k = kids(text, rootOf(text)).find(x => !x.paren && x.name === blk);
  return setKid(text, k.a, sub, line, eol);
}
// tags of a shell/item copy: "word" adds a {tag ..} word, "-word" drops one from the copy's own {tag "a b" ..} lines (a line left with no
// word goes). A word only an ancestor ({from}) carries cannot be dropped by the copy [I: {tag} in a {from} child adds to the inherited
// words]: refused GEN_<OP>_TAG_INHERITED; a word nowhere: GEN_<OP>_TAG_ABSENT. -> { text, said } | null (finding written)
function tagEdit(ctx, text, chain, v, P, where, eol) {
  const t = list(v).flatMap(x => S(x).trim().split(/\s+/)).filter(Boolean);
  if (!t.length || t.some(x => !/^-?[a-z0-9_]+$/i.test(x))) { ctx.err(`GEN_${P}_VALUE`, `tags "${list(v).join(' ')}": words a-z 0-9 _ (a leading - drops the word)`, where); return null; }
  const add = t.filter(x => x[0] !== '-'), del = t.filter(x => x[0] === '-').map(x => lower(x.slice(1))), said = [];
  const tagWords = s => { const r = rootOf(s); return r < 0 ? [] : kids(s, r).filter(k => !k.paren && k.name === 'tag').flatMap(k => [...s.slice(k.a, k.e + 1).matchAll(/"([^"]*)"/g)].flatMap(m => m[1].toLowerCase().split(/\s+/))); };
  for (const w of del) {
    const own = kids(text, rootOf(text)).filter(k => !k.paren && k.name === 'tag');
    const hit = own.filter(k => [...text.slice(k.a, k.e + 1).matchAll(/"([^"]*)"/g)].some(m => m[1].toLowerCase().split(/\s+/).includes(w)));
    if (!hit.length) {
      const anc = chain.slice(1).find(c => tagWords(c.text).includes(w));
      if (anc) ctx.err(`GEN_${P}_TAG_INHERITED`, `tag word "${w}" comes from ${anc.key} through {from}; the copy's own {tag} lines add words, they cannot drop an inherited one [I]: pick a like that does not carry "${w}"`, where);
      else ctx.err(`GEN_${P}_TAG_ABSENT`, `tag word "${w}" is not in the copy's {tag} lines (words: ${tagWords(text).join(' ') || 'none'})`, where);
      return null;
    }
    for (const k of hit.slice().reverse()) {
      const blk = text.slice(k.a, k.e + 1).replace(/"([^"]*)"/g, (m, s) => { const ws = s.split(/\s+/).filter(x => x && x.toLowerCase() !== w); return ws.length ? '"' + ws.join(' ') + '"' : '""'; }).replace(/\s*""/g, '');
      text = /"/.test(blk) ? text.slice(0, k.a) + blk + text.slice(k.e + 1) : cut(text, k.a, k.e);
    }
    said.push('-' + w);
  }
  if (add.length) { text = addIn(text, rootOf(text), [`{tag ${add.map(x => '"' + x + '"').join(' ')}}`], eol); said.push(...add); }
  return { text, said: 'tags ' + said.join(' ') };
}
// damage_edit: [{type, layer?, set: {sub: value}}]: values inside the copy's own n-th {damage [add] <type> ..} block (1 = first), in
// place. KEY-17 [V]: a file cannot change one inherited layer: {damage <type>} replaces every inherited <type> layer, {damage add <type>}
// adds one more. So a layer the copy only inherits is refused GEN_<OP>_DAMAGE_INHERITED (restate the layers: blast for blastwave).
function damageEdit(ctx, text, chain, v, P, where, eol) {
  const code = `GEN_${P}_VALUE`, said = [];
  for (const [i, d] of list(v).entries()) {
    if (!isMap(d) || !/^[a-z_]+$/i.test(S(d.type)) || !isMap(d.set) || !Object.keys(d.set).length) { ctx.err(code, `damage_edit[${i}]: {type: fire|blastwave|cumulative.., layer: 1, set: {radius: 8, heating: 0.8}}`, where); return null; }
    const type = lower(S(d.type)), n = d.layer === undefined ? 1 : Number(d.layer);
    if (!Number.isInteger(n) || n < 1) { ctx.err(code, `damage_edit[${i}] layer "${S(d.layer)}": 1 for the first ${type} block, 2 for the next ..`, where); return null; }
    const ofType = s => { const r = rootOf(s); return r < 0 ? [] : kids(s, r).filter(k => !k.paren && k.name === 'damage' && new RegExp('^\\{\\s*damage\\s+(add\\s+)?' + type + '\\b', 'i').test(s.slice(k.a, k.e + 1))); };
    const own = ofType(text);
    if (own.length < n) {
      const anc = chain.slice(1).find(c => ofType(c.text).length >= n);
      if (anc) ctx.err(`GEN_${P}_DAMAGE_INHERITED`, `damage_edit[${i}]: ${type} layer ${n} comes from ${anc.key} through {from}. The game cannot change one inherited damage layer in place: {damage ${type} ..} replaces every inherited ${type} layer and {damage add ${type} ..} adds one more (KEY-17)${type === 'blastwave' ? '; give all layers with blast:' : '; pick a like whose own file has the layer'}`, where);
      else ctx.err(code, `damage_edit[${i}]: the copy has ${own.length} ${type} block(s), no layer ${n}`, where);
      return null;
    }
    for (const [sub, val] of Object.entries(d.set)) {
      const raw = Array.isArray(val) ? val.map(S).join(' ') : S(val);
      if (!/^[a-z_][a-z0-9_]*$/i.test(sub) || !/^-?[\d.]+(\s+-?[\d.]+)*$/.test(raw.trim())) { ctx.err(code, `damage_edit[${i}] ${sub} "${raw}": a field name and number(s)`, where); return null; }
      const k = ofType(text)[n - 1];
      text = setKid(text, k.a, sub, `{${sub} ${raw.trim()}}`, eol);
      said.push(`${type}[${n}] ${sub} ${raw.trim()}`);
    }
  }
  return { text, said: 'damage ' + said.join(', ') };
}
// like lookup shared by shell and item: -> { pick, idx } | null (finding written)
function likeStuff(ctx, like, dirs, codes, where) {
  const idx = stuffIndex(ctx), f = findStuff(idx, words(like), dirs);
  if (!f.hits.length) { ctx.err(codes[0], `no "${like}" under ${dirs.map(d => STUFF + d).join(' ')} in the mod or the game data`, where); return null; }
  if (!f.pick) { ctx.err(codes[1], `"${like}" matches ${f.hits.length} files (${f.hits.slice(0, 4).map(x => x.key.slice(STUFF.length)).join(' | ')}): give more of its name`, where); return null; }
  return { pick: f.pick, idx };
}
function opShell(ctx, spec) {
  const id = lower(S(spec.id)).trim().replace(/\s+/g, '.'), like = S(spec.like).trim(), where = 'shell ' + id;
  // GoH [I]: shells are the same stuff files (resource/set/stuff/shell/<family>.<nation>.<type>.ammo, {from "pattern .."}); the AS2
  // presets ap/apcr/fg are not in GoH shell/.presets, so preset: is refused there with the folder's own list (GEN_SHELL_VALUE)
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(id) || !like) { ctx.err('GEN_SHELL_ARGS', 'shell needs id (family.type, e.g. bullet76x.heat: a-z 0-9 _ and dots) and like (an existing shell, e.g. bullet76.fg)', where); return; }
  const L = likeStuff(ctx, like, SHELL_DIRS, ['GEN_SHELL_LIKE_MISSING', 'GEN_SHELL_LIKE_AMBIGUOUS'], where);
  if (!L) return;
  const ext = L.pick.tags.has('ammo') && !id.split('.').includes('ammo') ? '.ammo' : '';
  const key = STUFF + L.pick.dir + id + ext;
  if (ctx.virt.has('stuff:' + id) || findStuff(L.idx, (id + ext).split('.')).hits.length) { ctx.err('GEN_SHELL_EXISTS', `a shell "${id}" already exists (or a file whose name holds every part of it): the game would find only one, pick another id`, where); return; }
  const chain = chainOf(ctx, L.idx, L.pick), num = numOk(ctx, 'GEN_SHELL_VALUE', where), eol = eolOf(chain[0].text), said = [];
  let text = chain[0].text, bad = false;
  if (spec.preset !== undefined || spec.args !== undefined) {
    // GoH: its shell/.presets blast calls ("ap_blast" args n), ("he_auto_blast" args n) .. [V GoH data] count as presets there (args only)
    const isPre = n => SHELL_PRESETS.includes(n) || (ctx.goh && /_blast$/.test(n));
    const mac = macrosOf(ctx, L.pick.dir), call = kids(text, rootOf(text)).find(k => k.paren && isPre(k.name));
    const pre = spec.preset !== undefined ? lower(S(spec.preset)).trim() : call ? call.name : '';
    if (!isPre(pre) || !mac.has(pre)) { ctx.err('GEN_SHELL_VALUE', `preset "${pre}": one of ${SHELL_PRESETS.filter(p => mac.has(p)).join(' ') || '(none in ' + L.pick.dir + '.presets)'}`, where); bad = true; }
    else {
      const old = call ? /args\s+([^)]*?)\s*\)\s*$/i.exec(text.slice(call.a, call.e + 1)) : null;
      const a = spec.args !== undefined ? num(spec.args, 'args (the preset number: trace scale for ap/apcr, blast energy for fg*)', 0, 1000) : old ? old[1] : null;
      if (a === null) { if (spec.args === undefined) ctx.err('GEN_SHELL_VALUE', `preset ${pre}: give args (a number)`, where); bad = true; }
      else {
        const t = `("${pre}" args ${a})`;
        text = call ? text.slice(0, call.a) + t + text.slice(call.e + 1) : addIn(text, rootOf(text), [t], eol);
        said.push(`preset ${call ? call.name + (old ? ' ' + old[1] : '') : 'none'} -> ${pre} ${a}`);
      }
    }
  }
  if (spec.blast !== undefined) {
    const lay = blastLayers(ctx, spec.blast, 'GEN_SHELL_VALUE', where);
    if (!lay) bad = true;
    else {
      const p = putBlast(text, lay, eol); text = p.text;
      if (p.dropped) ctx.info('GEN_SHELL_PRESET_DROPPED', `${id}: ${p.dropped.replace(/\s+/g, ' ')} removed; it writes its own blast layers and the given ones replace them`, where);
      said.push(`${lay.length} blast layer(s)`);
    }
  }
  for (const [k, what, lo, hi] of [['mass', 'mass (kg)', 0.001, 10000], ['cumulative', 'cumulative (HEAT share 0..1)', 0, 1]]) {
    const v = k === 'mass' ? spec.mass : spec.cumulative;
    if (v === undefined) continue;
    const n = num(v, what, lo, hi);
    if (n === null) bad = true; else { text = setKid(text, rootOf(text), k, `{${k} ${n}}`, eol); said.push(`${k} ${n}`); }
  }
  if (spec.entity !== undefined) {
    const e = lower(S(spec.entity)).trim();
    if (!ID.test(e) || !defExists(ctx, e)) { ctx.err('GEN_SHELL_ENTITY_MISSING', `entity "${e}": no resource/entity/**/${e}.def in the mod or the game (the flying / lying shell model)`, where); bad = true; }
    else { text = setKid(text, rootOf(text), 'entity', `{entity "${e}"}`, eol); said.push('model ' + e); }
  }
  if (spec.tags !== undefined) { const r = tagEdit(ctx, text, chain, spec.tags, 'SHELL', where, eol); if (!r) bad = true; else { text = r.text; said.push(r.said); } }
  if (spec.damage_edit !== undefined) { const r = damageEdit(ctx, text, chain, spec.damage_edit, 'SHELL', where, eol); if (!r) bad = true; else { text = r.text; said.push(r.said); } }
  if (bad) return;
  put(ctx, key, `; gen: shell ${id}, a copy of ${L.pick.key.slice(STUFF.length)}${said.length ? ': ' + said.join(', ') : ''}` + eol + text);
  ctx.virt.add('stuff:' + id); ctx.names.add(id);
  ctx.facts.push(`shell: ${id} (copy of ${L.pick.key.slice(STUFF.length)})${said.length ? ': ' + said.join(', ') : ''}`);
  wrote(ctx, 'shell', [key]);
  ctx.test.push(`shell: ${id}: a gun whose ammo family is ${id.split('.')[0]} gets "${id.split('.').slice(1).join(' ') || id}" shells in its inventory list; fire it at a tank and at infantry: penetration, blast radius and damage as set [T].`);
}
function opItem(ctx, spec) {
  const id = lower(S(spec.id)).trim(), like = S(spec.like).trim(), where = 'item ' + id;
  // GoH [I]: grenades and mines are the same stuff files ({from "pattern .."}, {throw ..}, {special {PrepareTime}} in vanilla GoH grenade/)
  if (!ID.test(id) || !like) { ctx.err('GEN_ITEM_ARGS', 'item needs id (new item name: a-z 0-9 _) and like (an existing grenade, mine or item, e.g. f1)', where); return; }
  const L = likeStuff(ctx, like, ITEM_DIRS, ['GEN_ITEM_LIKE_MISSING', 'GEN_ITEM_LIKE_AMBIGUOUS'], where);
  if (!L) return;
  const pat = L.pick.tags.has('pattern'), ext = !pat && L.pick.base.includes('.') ? L.pick.base.slice(L.pick.base.indexOf('.')) : '';
  const key = STUFF + L.pick.dir + id + ext;
  if (ctx.virt.has('stuff:' + id) || findStuff(L.idx, (id + ext).split('.')).hits.length) { ctx.err('GEN_ITEM_EXISTS', `an item "${id}" already exists (or a file whose name holds every part of it): pick another id`, where); return; }
  const chain = chainOf(ctx, L.idx, L.pick), num = numOk(ctx, 'GEN_ITEM_VALUE', where), eol = eolOf(chain[0].text), said = [];
  let text = chain[0].text, bad = false;
  const block = (name, code, msg) => { const b = ownBlock(text, chain, name, eol); if (b.from === undefined) { ctx.err(code, msg, where); bad = true; return false; } text = b.text; return true; };
  if (spec.throw !== undefined) {
    const t = spec.throw;
    if (!isMap(t)) { ctx.err('GEN_ITEM_VALUE', 'throw: a map {range, angle, spread, speed}', where); bad = true; }
    else if (block('throw', 'GEN_ITEM_NO_THROW', `${like} has no {throw ..} block in its chain: it is not thrown (a mine or a held item)`)) {
      for (const [k, sub, what, lo, hi] of [['range', 'range', 'throw range (m)', 1, 200], ['angle', 'startAngle', 'throw angle (degrees)', 0, 89], ['spread', 'spreading', 'throw spread', 0, 5], ['speed', 'constantSpeed', 'throw speed', 1, 200]]) {
        if (t[k] === undefined) continue;
        const n = num(t[k], what, lo, hi);
        if (n === null) bad = true; else { text = setIn(text, 'throw', sub, `{${sub} ${n}}`, eol); said.push(`throw ${k} ${n}`); }
      }
    }
  }
  if (spec.fuse !== undefined) {
    const n = num(spec.fuse, 'fuse (seconds, {special {PrepareTime}})', 0, 60);
    if (n === null) bad = true;
    else if (block('special', 'GEN_ITEM_NO_FUSE', `${like} has no {special ..} block in its chain: no fuse time to set`)) { text = setIn(text, 'special', 'PrepareTime', `{PrepareTime ${n}}`, eol); said.push(`fuse ${n} s`); }
  }
  if (spec.weight !== undefined || spec.size !== undefined) {
    const w = spec.weight === undefined ? null : num(spec.weight, 'weight (inventory)', 0, 10000);
    const sz = spec.size === undefined ? null : (Array.isArray(spec.size) ? spec.size : S(spec.size).trim().split(/[\s,x]+/));
    const sw = sz ? num(sz[0], 'size width (inventory cells)', 1, 20, true) : null, sh = sz ? num(sz[1], 'size height (inventory cells)', 1, 20, true) : null;
    if ((spec.weight !== undefined && w === null) || (sz && (sw === null || sh === null))) bad = true;
    else {
      if (ownBlock(text, chain, 'inventory', eol).from === undefined) text = addIn(text, rootOf(text), ['{inventory\n}'], eol);
      else text = ownBlock(text, chain, 'inventory', eol).text;
      if (w !== null) { text = setIn(text, 'inventory', 'weight', `{weight ${w}}`, eol); said.push(`weight ${w}`); }
      if (sz) { text = setIn(text, 'inventory', 'size', `{size ${sw} ${sh}}`, eol); said.push(`size ${sw}x${sh}`); }
    }
  }
  if (spec.blast !== undefined) {
    const lay = blastLayers(ctx, spec.blast, 'GEN_ITEM_VALUE', where);
    if (!lay) bad = true; else { text = putBlast(text, lay, eol).text; said.push(`${lay.length} blast layer(s)`); }
  }
  for (const [k, what, lo, hi] of [['mass', 'mass (kg)', 0.001, 10000], ['cumulative', 'cumulative (HEAT share 0..1)', 0, 1]]) {
    const v = k === 'mass' ? spec.mass : spec.cumulative;
    if (v === undefined) continue;
    const n = num(v, what, lo, hi);
    if (n === null) bad = true; else { text = setKid(text, rootOf(text), k, `{${k} ${n}}`, eol); said.push(`${k} ${n}`); }
  }
  if (spec.entity !== undefined) {
    const e = lower(S(spec.entity)).trim();
    if (!ID.test(e) || !defExists(ctx, e)) { ctx.err('GEN_ITEM_ENTITY_MISSING', `entity "${e}": no resource/entity/**/${e}.def in the mod or the game (the model in hand / on the ground)`, where); bad = true; }
    else { text = setKid(text, rootOf(text), 'entity', `{entity "${e}"}`, eol); said.push('model ' + e); }
  }
  if (spec.tags !== undefined) { const r = tagEdit(ctx, text, chain, spec.tags, 'ITEM', where, eol); if (!r) bad = true; else { text = r.text; said.push(r.said); } }
  if (spec.damage_edit !== undefined) { const r = damageEdit(ctx, text, chain, spec.damage_edit, 'ITEM', where, eol); if (!r) bad = true; else { text = r.text; said.push(r.said); } }
  if (bad) return;
  put(ctx, key, `; gen: item ${id}, a copy of ${L.pick.key.slice(STUFF.length)}${said.length ? ': ' + said.join(', ') : ''}` + eol + text);
  ctx.virt.add('stuff:' + id); ctx.names.add(id);
  ctx.facts.push(`item: ${id} (copy of ${L.pick.key.slice(STUFF.length)})${said.length ? ': ' + said.join(', ') : ''}`);
  wrote(ctx, 'item', [key]);
  ctx.test.push(`item: ${id}: put it in a soldier's inventory ({item "${id}"} in a breed or unit), throw or place it: range, fuse and blast as set [T].`);
}

// ---- sound: a new sound folder (wavs + folder.set); soundclass: a loudness row in sound.set ----------------------------------
// staged files: a list of .wav paths and/or folders (their *.wav), relative to the spec's folder
function staged(ctx, v) {
  const base = ctx.base || process.cwd(), files = [], missing = [];
  for (const p of list(v)) {
    const f = path.resolve(base, S(p));
    if (!S(p) || !fs.existsSync(f)) { missing.push(S(p)); continue; }
    if (fs.statSync(f).isDirectory()) { for (const n of fs.readdirSync(f).sort()) if (/\.wav$/i.test(n) && fs.statSync(path.join(f, n)).isFile()) files.push({ name: n.toLowerCase(), file: f + path.sep + n }); }
    else files.push({ name: path.basename(f).toLowerCase(), file: f });
  }
  return { files, missing };
}
// a .wav for the game: kept byte for byte when Miles plays its format (PCM 8/16, IMA ADPCM 4-bit), else decoded and re-encoded.
// C = [bad, converted, rate warning, stereo warning, resampled info] codes of the calling op; with C[4] a rate other than 44100 / 22050
// is resampled (linear) to 44100 (above 22050) or 22050, else it is only warned
function resample(d, rate) {
  const ch = d.channels, n = Math.max(1, Math.round(d.frames * rate / d.rate)), pcm = new Int16Array(n * ch), k = d.rate / rate;
  for (let i = 0; i < n; i++) {
    const x = i * k, a = Math.min(Math.floor(x), d.frames - 1), b = Math.min(a + 1, d.frames - 1), t = x - Math.floor(x);
    for (let c = 0; c < ch; c++) pcm[i * ch + c] = Math.round(d.pcm[a * ch + c] * (1 - t) + d.pcm[b * ch + c] * t);
  }
  return { rate, channels: ch, frames: n, pcm };
}
// mono (GEN-FIX4): a file of 2+ channels is downmixed to one (wav.toMono, mean of the channels) and re-encoded; C[5] = its info code
const monoOf = v => v === undefined || v === false || /^(false|no|0)$/i.test(S(v)) ? false : v === true || /^(true|yes|1)$/i.test(S(v)) ? true : null;
function gameWav(ctx, f, fmt, C, where, mono) {
  if (!/^[a-z0-9_ .()-]+\.wav$/.test(f.name)) { ctx.err(C[0], `${f.name}: a .wav file with an ASCII name (a-z 0-9 _ . ( ) - space); the game plays .wav only`, where); return null; }
  const buf = fs.readFileSync(f.file), p = wav.parse(buf);
  if (!p.ok) { ctx.err(C[0], `${f.name}: ${p.error || 'not a RIFF/WAVE file'}; the game plays .wav (16-bit PCM or IMA ADPCM)`, where); return null; }
  const m = p.fmt, plays = wav.GAME_SAFE.has(p.tag) && (p.tag !== wav.TAG.PCM || m.bits === 8 || m.bits === 16) && (p.tag !== wav.TAG.IMA_ADPCM || m.bits === 4);
  let out = buf;
  const reRate = !!C[4] && m.rate !== 44100 && m.rate !== 22050, down = !!mono && m.channels > 1;
  if (reRate || down) {
    let d = wav.decode(buf);
    if (!d.ok) { ctx.err(C[0], `${f.name}: ${m.rate} Hz ${m.codec} ${m.bits}-bit could not be decoded here to ${reRate ? 'resample' : 'downmix'} (${d.error}); save it as 16-bit PCM${reRate ? ' at 44100 Hz' : ', one channel'}`, where); return null; }
    const enc = fmt === 'ima' ? 'IMA ADPCM' : '16-bit PCM';
    if (down) { d = wav.toMono(d); ctx.info(C[5], `${f.name}: ${m.channels} channels -> 1 (mono: the mean of the channels), ${enc}; the staged file is not changed`, where); }
    if (reRate) {
      const to = m.rate > 22050 ? 44100 : 22050, n0 = d.frames; d = resample(d, to);
      ctx.info(C[4], `${f.name}: ${m.rate} Hz ${m.codec} ${m.bits}-bit -> ${to} Hz ${enc} (linear resample, ${n0} -> ${d.frames} frames; the staged file is not changed)`, where);
    } else if (m.rate !== 44100 && m.rate !== 22050) ctx.err(C[2], `${f.name}: ${m.rate} Hz; game files use 44100 or 22050 (Miles resamples, the pitch should stay) [T]`, where);
    out = fmt === 'ima' ? wav.encodeImaAdpcm(d) : wav.encodePcm16(d);
    if (!down && m.channels !== 1) ctx.err(C[3], `${f.name}: ${m.channels} channels; a sound placed in the world (shot, voice) should be mono, Miles 3D on stereo loses its place (mono: true downmixes it) [T]`, where);
    return out;
  }
  if (!plays) {
    const d = wav.decode(buf);
    if (!d.ok) { ctx.err(C[0], `${f.name}: ${m.codec} ${m.bits}-bit is not a format the game plays and could not be decoded here (${d.error}); save it as 16-bit PCM .wav`, where); return null; }
    out = fmt === 'ima' ? wav.encodeImaAdpcm(d) : wav.encodePcm16(d);
    ctx.info(C[1], `${f.name}: ${m.codec} ${m.bits}-bit -> ${fmt === 'ima' ? 'IMA ADPCM' : '16-bit PCM'} (the game does not play the original format; the staged file is not changed)`, where);
  }
  if (m.rate !== 44100 && m.rate !== 22050) ctx.err(C[2], `${f.name}: ${m.rate} Hz; game files use 44100 or 22050 (Miles resamples, the pitch should stay) [T]`, where);
  if (m.channels !== 1) ctx.err(C[3], `${f.name}: ${m.channels} channels; a sound placed in the world (shot, voice) should be mono, Miles 3D on stereo loses its place (mono: true downmixes it) [T]`, where);
  return out;
}
function opSound(ctx, spec) {
  const id = lower(S(spec.id)).trim().replace(/^\/+|\/+$/g, ''), like = lower(S(spec.like)).trim().replace(/^\/+|\/+$/g, ''), where = 'sound ' + id;
  if (ctx.goh) { ctx.notFor('GEN_SOUND_AS2_ONLY', 'sound', 'GoH folder.set files set their sound through resource/sound/defines.inc macros ((include "\\sound\\defines.inc") ("bkg_100kg_bomb")), not the {loudness ".."} rows this op writes, and inherit distances differently (GHVIS-29); GoH sounds are PCM 44.1/48 kHz with some IMA ADPCM. That form is not mapped', 'vanilla GoH resource/sound/defines.inc and resource/sound/**/folder.set; GHVIS-29', where); return; }
  if (!/^[a-z0-9_]+(\/[a-z0-9_]+)*$/.test(id) || (!like && spec.files === undefined)) { ctx.err('GEN_SOUND_ARGS', 'sound needs id (a folder under resource/sound, e.g. weapon/shot/my_mg) and like (a sound folder to copy) and/or files (.wav files or a folder of them)', where); return; }
  const dir = SOUND + id + '/', model = require('../../sound/model'), read = k => ctx.read(k);
  if (ctx.virt.has('sound:' + id) || ctx.keys(new RegExp('^' + esc(dir))).length) { ctx.err('GEN_SOUND_EXISTS', `resource/sound/${id}/ already holds files; a second folder of that name would mix both: pick another id`, where); return; }
  let eff = null;
  if (like) {
    if (!/^[a-z0-9_]+(\/[a-z0-9_]+)*$/.test(like) || !ctx.keys(new RegExp('^' + esc(SOUND + like + '/'))).length) { ctx.err('GEN_SOUND_LIKE_MISSING', `no sound folder resource/sound/${like}/ in the mod or the game data`, where); return; }
    eff = model.folder(SOUND + like, read);
  }
  const fmt = spec.format === undefined ? 'pcm' : lower(S(spec.format)).trim();
  let bad = false;
  const bad1 = (code, msg) => { ctx.err(code, msg, where); bad = true; };
  if (!['pcm', 'ima'].includes(fmt)) bad1('GEN_SOUND_VALUE', `format "${fmt}": pcm (16-bit PCM) or ima (IMA ADPCM, a quarter of the size), used when a file has to be converted`);
  const mono = monoOf(spec.mono);
  if (mono === null) bad1('GEN_SOUND_VALUE', `mono "${S(spec.mono)}": true (downmix files of 2+ channels to one) or false`);
  else if (mono && spec.files === undefined) bad1('GEN_SOUND_ARGS', 'mono: true works on the files you give (files: ..); the like folder is copied as it is');
  const set = model.soundSet(read), lines = [], said = [];
  const tag = spec.tag !== undefined ? lower(S(spec.tag)).trim() : eff && eff.groupKnown ? eff.group : '';
  if (tag && !SOUND_TAGS.includes(tag)) bad1('GEN_SOUND_VALUE', `tag "${tag}": one of ${SOUND_TAGS.join(' ')} (the volume slider the sound follows; anything else plays as 'other', VIS-09)`);
  else if (tag) lines.push(`{tag ${tag}}`);
  const loud = spec.loudness !== undefined ? S(spec.loudness).trim() : eff && eff.loudness && eff.loudness !== 'default' ? eff.loudness : '';
  if (loud && !set.loudness[lower(loud)]) bad1('GEN_SOUND_LOUDNESS_UNKNOWN', `loudness "${loud}" is not a row of sound.set (${set.order.join(', ')}); add it with a soundclass op first`);
  else if (loud) lines.push(`{loudness "${loud}"}`);
  if (spec.signal !== undefined) {
    const p = S(spec.signal).trim().split(/\s+/);
    if (p.length !== 2 || !/^[a-z_][a-z0-9_]*$/i.test(p[0]) || !(+p[1] >= 0 && +p[1] <= 1000)) bad1('GEN_SOUND_VALUE', `signal "${S(spec.signal)}": "name radius", e.g. "shot 40" (what the AI hears and how far, m)`);
    else lines.push(`{signal ${p[0]} ${+p[1]}}`);
  } else if (eff && eff.signal && eff.signal.name) lines.push(`{signal ${eff.signal.name} ${eff.signal.radius}}`);
  const vol = spec.volume !== undefined ? spec.volume : eff && eff.volume !== 1 ? eff.volume : undefined;
  if (vol !== undefined) { const n = numOk(ctx, 'GEN_SOUND_VALUE', where)(vol, 'volume (the engine clamps it to 0..1)', 0, 1); if (n === null) bad = true; else lines.push(`{volume ${n}}`); }
  const out = new Map();
  if (spec.files !== undefined) {
    const st = staged(ctx, spec.files);
    if (st.missing.length) bad1('GEN_SOUND_FILE_MISSING', `files not found (paths are read from the spec's folder): ${st.missing.join(', ')}`);
    if (!st.missing.length && !st.files.length) bad1('GEN_SOUND_FILE_MISSING', 'files: no .wav file in what was given');
    for (const f of st.files) { const b = gameWav(ctx, f, fmt, ['GEN_SOUND_BAD_WAV', 'GEN_SOUND_CONVERTED', 'WARN_GEN_SOUND_RATE', 'WARN_GEN_SOUND_STEREO', null, 'GEN_SOUND_MONO'], where, mono); if (!b) bad = true; else out.set(dir + f.name, b); }
  } else {
    const ws = ctx.keys(new RegExp('^' + esc(SOUND + like + '/') + '[^/]+\\.wav$'));
    if (!ws.length) bad1('GEN_SOUND_FILE_MISSING', `resource/sound/${like}/ has no .wav of its own (only subfolders): give files, or a like that holds the sounds`);
    for (const k of ws) out.set(dir + k.slice(k.lastIndexOf('/') + 1), ctx.read(k));
  }
  if (bad) return;
  if (lines.length) out.set(dir + 'folder.set', Buffer.from('{sound' + EOL + lines.map(l => '\t' + l + EOL).join('') + '}' + EOL, 'latin1'));
  for (const [k, b] of out) put(ctx, k, b);
  ctx.virt.add('sound:' + id);
  said.push(`${out.size - (lines.length ? 1 : 0)} wav`); if (lines.length) said.push('folder.set ' + lines.join(' '));
  ctx.facts.push(`sound: ${id}${like ? ' (like ' + like + ')' : ''}: ${said.join(', ')}`);
  wrote(ctx, 'sound', out.keys());
  ctx.test.push(`sound: ${id}: play it in game (a weapon's fireSound "${id.replace(/^weapon\/shot\//, '')}" when under weapon/shot/, or the editor sound list): it is heard, at the loudness range of "${loud || 'its parent'}", the AI reacts to the signal [T].`);
}
// percent rows of sound.set (GEN-FIX4): {percent "<group>" <share %> [<max buffers>]}, the shape of AS2 sound.set:11-15 and GoH
// sound.set (same header comment); both sum to 100. Groups the engine knows (GetGroup, sound/model.js GROUP_IDS) + main_environment
// (a vanilla row; any other name sets group 'other', VIS-09)
const PERCENT_GROUPS = ['effects', 'emotions', 'speech', 'environment', 'main_environment'];
function percentEdit(ctx, text, pc, where) {
  const eol = eolOf(text), said = [];
  for (const [g0, v] of Object.entries(pc)) {
    const g = lower(g0).trim(), p = S(v).trim().split(/\s+/);
    if (!PERCENT_GROUPS.includes(g)) { ctx.err('GEN_SOUNDCLASS_VALUE', `percent "${g0}": a sound group of sound.set (${PERCENT_GROUPS.join(' ')}); another name only sets the share of group 'other' (VIS-09)`, where); return null; }
    if (p.length > 2 || !/^\d+(\.\d+)?$/.test(p[0]) || +p[0] > 100 || (p[1] !== undefined && !/^\d+$/.test(p[1]))) { ctx.err('GEN_SOUNDCLASS_VALUE', `percent ${g}: "${S(v)}" is "share" or "share max": share 0..100 (% of the sound buffers), max a whole number of buffers`, where); return null; }
    const row = `{percent "${g}" ${+p[0]}${p[1] !== undefined ? ' ' + +p[1] : ''}}`;
    const re = new RegExp('^([ \\t]*)\\{\\s*percent\\s+"' + esc(g) + '"[^}\\r\\n]*\\}', 'im'), m = re.exec(text);
    if (m) { said.push(`${m[0].trim().replace(/\s+/g, ' ')} -> ${row}`); text = text.slice(0, m.index) + m[1] + row + text.slice(m.index + m[0].length); continue; }
    const all = [...text.matchAll(/^([ \t]*)\{\s*percent\s+"[^"]*"[^}\r\n]*\}[^\r\n]*/gim)];
    if (all.length) { const l = all[all.length - 1], at = l.index + l[0].length; text = text.slice(0, at) + eol + l[1] + row + text.slice(at); }
    else text = addIn(text, rootOf(text), [row], eol);
    said.push('+' + row);
  }
  const sum = [...text.matchAll(/^[ \t]*\{\s*percent\s+"[^"]*"\s+([\d.]+)/gim)].reduce((a, m) => a + +m[1], 0);
  if (Math.abs(sum - 100) > 1e-6) ctx.err('WARN_GEN_SOUNDCLASS_PERCENT_SUM', `the percent rows of sound.set now add up to ${sum}, not 100 (AS2 and GoH sound.set both sum to 100); how the engine shares the buffers then is not known [I]`, where);
  ctx.info('GEN_SOUNDCLASS_PERCENT', `sound.set percent: ${said.join('; ')} (sum ${sum})`, where);
  return { text, said };
}
function opSoundClass(ctx, spec) {
  const name = S(spec.name).trim(), row = spec.name !== undefined || spec.min !== undefined || spec.max !== undefined, where = 'soundclass ' + (name || 'percent');
  // GoH [I]: resource/sound/sound.set has the same {loudness "<name>" min max prio} and {percent ..} rows (vanilla GoH sound.set [V data])
  if (spec.percent !== undefined && (!isMap(spec.percent) || !Object.keys(spec.percent).length)) { ctx.err('GEN_SOUNDCLASS_ARGS', 'percent: a map {<group>: "share [max]"}, e.g. {speech: "12 1"}', where); return; }
  if ((row || spec.percent === undefined) && (!/^[A-Za-z0-9_][A-Za-z0-9_ ]*$/.test(name) || spec.min === undefined || spec.max === undefined)) { ctx.err('GEN_SOUNDCLASS_ARGS', 'soundclass needs name (ASCII letters, digits, _ and spaces), min and max (hearing distance in m), and/or percent: {<group>: "share [max]"}', where); return; }
  const text = ctx.readStr(SOUNDSET), model = require('../../sound/model');
  const set = text === null ? null : model.soundSet(k => ctx.read(k));
  if (!set || !set.loudness.default) { ctx.err('GEN_SOUNDCLASS_NO_DEFAULT', `${SOUNDSET} ${text === null ? 'is missing' : "has no 'default' loudness row"}: the first folder.set read would crash (VIS-27); fix sound.set first`, where); return; }
  let t = text, line = null;
  if (row) {
    if (set.loudness[lower(name)]) { ctx.err('GEN_SOUNDCLASS_EXISTS', `loudness "${name}" is already a row of sound.set (${set.loudness[lower(name)].min} ${set.loudness[lower(name)].max}): a second row overwrites the first, pick another name`, where); return; }
    const num = numOk(ctx, 'GEN_SOUNDCLASS_VALUE', where), mn = num(spec.min, 'min (full volume up to, m)', 0, 5000), mx = num(spec.max, 'max (silent from, m)', 0, 5000);
    const pr = spec.priority === undefined ? undefined : num(spec.priority, 'priority (whole number, higher wins a voice slot)', 0, 1000, true);
    if (mn === null || mx === null || pr === null) return;
    if (mn > mx) { ctx.err('GEN_SOUNDCLASS_VALUE', `min ${mn} is above max ${mx}`, where); return; }
    line = `{loudness "${name}" ${mn} ${mx}${pr !== undefined ? ' ' + pr : ''}}`;
    t = addIn(t, rootOf(t), [line], eolOf(t));
  }
  let pc = null;
  if (spec.percent !== undefined) { pc = percentEdit(ctx, t, spec.percent, where); if (!pc) return; t = pc.text; }
  const wasMine = ctx.inMod(SOUNDSET);
  put(ctx, SOUNDSET, t);
  if (!wasMine) ctx.info('GEN_SOUNDCLASS_FULL_COPY', `${SOUNDSET}: the mod holds the whole file (it replaces the vanilla one; rows kept, 'default' kept, VIS-27)`, where);
  if (line) ctx.facts.push(`soundclass: ${line} added to sound.set (${set.order.length} rows before, 'default' kept)`);
  if (pc) ctx.facts.push(`soundclass: sound.set percent ${pc.said.join('; ')}`);
  wrote(ctx, 'soundclass', [SOUNDSET]);
  if (line) ctx.test.push(`soundclass: "${name}": a sound folder with {loudness "${spec.name}"} is heard up to ${spec.max} m, full volume within ${spec.min} m; game.log has no loudness error [T].`);
  if (pc) ctx.test.push(`soundclass: percent ${Object.keys(spec.percent).join(' ')}: a battle with many sounds of that group plays more (or fewer) of them at once; no sound cut out [T].`);
}

// ---- voice: a new talk language: the like's talk trees copied (sounds replaced where given) + phrase lines in talk.set ---------
function opVoice(ctx, spec) {
  const id = lower(S(spec.id)).trim(), like = lower(S(spec.like)).trim(), where = 'voice ' + id;
  if (ctx.goh) return opVoiceGoh(ctx, spec, id, like, where);
  if (!ID.test(id) || !like) { ctx.err('GEN_VOICE_ARGS', 'voice needs id (new language id: a-z 0-9 _) and like (a language of talk.set: rus ger ger2 eng usa jap)', where); return; }
  const text = ctx.readStr(TALK), p = text === null ? -1 : text.search(/\(\s*define\s+"phrases"/i), pe = p < 0 ? -1 : sdlEnd(text, p);
  if (pe < 0) { ctx.err('GEN_VOICE_NO_PHRASES', `${TALK}: no (define "phrases" ..) block to add the language to`, where); return; }
  const langs = new Map();
  for (const m of text.slice(p, pe).matchAll(/\(\s*"(\w+)"\s+args\s+%0\s+([A-Za-z0-9_]+)\s+(\d+)\s+%1\s*\)/gi)) {
    const l = lower(m[2]), x = langs.get(l) || { macro: m[1], n: 0 }; x.n = Math.max(x.n, +m[3]); langs.set(l, x);
  }
  const src = langs.get(like);
  if (!src) { ctx.err('GEN_VOICE_LIKE_MISSING', `"${like}" is not a language of talk.set (${[...langs.keys()].join(' ')})`, where); return; }
  if (langs.has(id) || ctx.keys(new RegExp('^resource/sound/[^/]+/talk/' + esc(id) + '/')).length) { ctx.err('GEN_VOICE_EXISTS', `language "${id}" already exists in talk.set or as a sound/*/talk/${id}/ tree: pick another id`, where); return; }
  // the tree the like's macro plays from: {sound "%0/talk/<x>/%3/v%2"}, x = %1 (the language) or a fixed name (ger2 -> ger)
  const dm = new RegExp('\\(\\s*define\\s+"' + esc(src.macro) + '"', 'i').exec(text), body = dm ? text.slice(dm.index, sdlEnd(text, dm.index) + 1) : '';
  const sm = /\{\s*sound\s+"%0\/talk\/([^/"]+)\//i.exec(body), tree = !sm || sm[1] === '%1' ? like : lower(sm[1]);
  const n = spec.speakers === undefined ? src.n : numOk(ctx, 'GEN_VOICE_VALUE', where)(spec.speakers, 'speakers (voice variants, v1..vN)', 1, 9, true);
  if (n === null) return;
  const fmt = spec.format === undefined ? 'pcm' : lower(S(spec.format)).trim();
  if (!['pcm', 'ima'].includes(fmt)) { ctx.err('GEN_VOICE_VALUE', `format "${fmt}": pcm or ima`, where); return; }
  const mono = monoOf(spec.mono);
  if (mono === null) { ctx.err('GEN_VOICE_VALUE', `mono "${S(spec.mono)}": true (downmix the sounds you give to one channel) or false`, where); return; }
  // target key -> source key; speaker t plays the like's speaker (t-1) % count + 1
  const plan = new Map(), per = {};
  for (const kind of TALK_KINDS) {
    const pre = `resource/sound/${kind}/talk/${tree}/`;
    for (const k of ctx.keys(new RegExp('^' + esc(pre)))) {
      const rel = k.slice(pre.length), m = /^(.*?)\/v(\d+)\/(.*)$/.exec(rel);
      if (!m) { plan.set(`resource/sound/${kind}/talk/${id}/${rel}`, k); continue; }
      for (let t = 1; t <= n; t++) if ((t - 1) % src.n + 1 === +m[2]) plan.set(`resource/sound/${kind}/talk/${id}/${m[1]}/v${t}/${m[3]}`, k);
    }
  }
  if (!plan.size) { ctx.err('GEN_VOICE_LIKE_MISSING', `no sound tree resource/sound/{human,vehicle,cannon}/talk/${tree}/ in the mod or the game data`, where); return; }
  const repl = new Map(); let bad = false;
  // loudness (GEN-FIX4): "<class>" for every talk tree the voice gets, or {human|vehicle|cannon: "<class>"}; a loudness row of sound.set
  const model = require('../../sound/model'), kinds = TALK_KINDS.filter(k => [...plan.keys()].some(x => x.startsWith(`resource/sound/${k}/talk/${id}/`)));
  let loudBy = null;
  if (spec.loudness !== undefined) {
    const set = model.soundSet(k => ctx.read(k)); loudBy = {};
    if (isMap(spec.loudness)) for (const [k, v] of Object.entries(spec.loudness)) { if (!kinds.includes(lower(k))) { ctx.err('GEN_VOICE_VALUE', `loudness "${k}": a talk tree this voice gets (${kinds.join(' ')})`, where); return; } loudBy[lower(k)] = S(v).trim(); }
    else for (const k of kinds) loudBy[k] = S(spec.loudness).trim();
    for (const c of new Set(Object.values(loudBy))) if (!/^[A-Za-z0-9_][A-Za-z0-9_ ]*$/.test(c) || !set.loudness[lower(c)]) { ctx.err('GEN_VOICE_LOUDNESS_UNKNOWN', `loudness "${c}" is not a row of sound.set (${set.order.join(', ')}); add it with a soundclass op first`, where); return; }
  }
  if (spec.sounds !== undefined) {
    if (!isMap(spec.sounds)) { ctx.err('GEN_VOICE_VALUE', 'sounds: a map {"<folder>[/v<N>]": file | [files] | folder}, folder e.g. attack or vehicle/attack', where); return; }
    for (const [k0, v] of Object.entries(spec.sounds)) {
      const parts = lower(k0).replace(/^\/+|\/+$/g, '').split('/'), kind = TALK_KINDS.includes(parts[0]) ? parts.shift() : 'human';
      const vm = /^v(\d+)$/.exec(parts[parts.length - 1] || ''), sp = vm ? +vm[1] : 0; if (vm) parts.pop();
      const folder = parts.join('/'), fpre = `resource/sound/${kind}/talk/${id}/${folder}/`;
      if (!folder || ![...plan.keys()].some(x => x.startsWith(fpre))) {
        const have = [...new Set([...plan.keys()].filter(x => x.startsWith(`resource/sound/${kind}/talk/`)).map(x => x.split('/')[5]))];
        ctx.err('GEN_VOICE_FOLDER_UNKNOWN', `sounds "${k0}": ${kind} talk has no folder "${folder}" (${have.slice(0, 12).join(' ')}${have.length > 12 ? ' ..' : ''})`, where); bad = true; continue;
      }
      if (vm && (sp < 1 || sp > n)) { ctx.err('GEN_VOICE_VALUE', `sounds "${k0}": speaker v${sp} is outside v1..v${n}`, where); bad = true; continue; }
      const st = staged(ctx, v);
      if (st.missing.length || !st.files.length) { ctx.err('GEN_VOICE_FILE_MISSING', `sounds "${k0}": ${st.missing.length ? 'not found: ' + st.missing.join(', ') : 'no .wav in what was given'} (paths are read from the spec's folder)`, where); bad = true; continue; }
      const bufs = [];
      for (const f of st.files) { const b = gameWav(ctx, f, fmt, ['GEN_VOICE_BAD_WAV', 'GEN_VOICE_CONVERTED', 'WARN_GEN_VOICE_RATE', 'WARN_GEN_VOICE_STEREO', 'GEN_VOICE_RESAMPLED', 'GEN_VOICE_MONO'], where, mono); if (!b) bad = true; else bufs.push([f.name, b]); }
      for (let t = 1; t <= n; t++) if (!sp || t === sp) repl.set(fpre + 'v' + t + '/', bufs);
    }
  }
  if (bad) return;
  const keys = [];
  for (const [dst, k] of plan) { if (/\.wav$/.test(dst) && [...repl.keys()].some(r => dst.startsWith(r))) continue; put(ctx, dst, ctx.read(k)); keys.push(dst); per[dst.split('/')[2]] = (per[dst.split('/')[2]] || 0) + 1; }
  for (const [pre, bufs] of repl) for (const [nm, b] of bufs) { put(ctx, pre + nm, b); keys.push(pre + nm); }
  for (const [kind, cls] of Object.entries(loudBy || {})) {
    // talk/<id>/folder.set in the shape of the vanilla talk folders: {sound {tag <group>} {loudness "<class>"}} (sound/human/talk/folder.set,
    // sound/vehicle/talk/folder.set, sound/human/talk/eng/death_cry/folder.set); the tag restates the parent's group
    const fk = `resource/sound/${kind}/talk/${id}/folder.set`, old = ctx.readStr(fk), eff = model.folder(`resource/sound/${kind}/talk`, k => ctx.read(k));
    let nt;
    if (old !== null && /\{\s*loudness\s+"[^"]*"\s*\}/i.test(old)) nt = old.replace(/\{\s*loudness\s+"[^"]*"\s*\}/i, `{loudness "${cls}"}`);
    else if (old !== null) nt = addIn(old, rootOf(old), [`{loudness "${cls}"}`], eolOf(old));
    else nt = '{sound' + EOL + (eff.groupKnown ? `\t{tag ${eff.group}}` + EOL : '') + `\t{loudness "${cls}"}` + EOL + '}' + EOL;
    put(ctx, fk, nt); if (!keys.includes(fk)) keys.push(fk);
    const sub = [...plan.keys()].filter(k => k.startsWith(`resource/sound/${kind}/talk/${id}/`) && /\/folder\.set$/.test(k) && k !== fk).map(k => k.split('/').slice(-2, -1)[0]);
    ctx.info('GEN_VOICE_LOUDNESS', `${fk}: {loudness "${cls}"} (was ${eff.loudness || 'default'} from ${kind}/talk)${sub.length ? `; ${sub.join(' ')} keep their own folder.set loudness` : ''}`, where);
  }
  const eol = eolOf(text), wasMine = ctx.inMod(TALK), lines = [];
  for (let t = 1; t <= n; t++) lines.push(`\t("phrase_voice" args %0 ${id} ${t} %1)`);
  let head = text.slice(0, pe).replace(/[ \t]*$/, ''); if (!/\n$/.test(head)) head += eol;
  put(ctx, TALK, head + '\t; gen: voice ' + id + ' (sounds from ' + like + ')' + eol + lines.join(eol) + eol + text.slice(pe));
  keys.push(TALK);
  if (!wasMine) ctx.info('GEN_VOICE_FULL_COPY', `${TALK}: the mod holds the whole file (it replaces the vanilla one; every language kept)`, where);
  ctx.facts.push(`voice: ${id} from ${like} (${tree} sounds): ${n} speaker(s), ${keys.length - 1} file(s) (${Object.entries(per).map(([k, c]) => k + ' ' + c).join(', ')}${repl.size ? ', ' + repl.size + ' folder(s) replaced' : ''}), talk.set +${n} phrase lines`);
  wrote(ctx, 'voice', keys);
  ctx.test.push(`voice: ${id}: give a breed {voice "${id}"} (or {nationality "${id}"}, which also picks the name list) [I], select it, order it, put it in a fight: each phrase plays from talk/${id}/ [T].`);
}

// ---- voice on GoH: read on the GoH install [V 2026-11-23]: talk.set (define "phrase_voice" {sound "talk/%0/%1/%3/v%2"}) with three
// lists, "phrases" (human), "phrases_tank" (tank), "phrases_cannon" (cannon), each ("phrase_voice" args %0 <language> <N> %1); the
// sounds sit in resource/sound/talk/<actor>/<language>/<folder>/v<N>/*.wav (sound/talk.pak; folder.set there are ("talk") define
// calls of sound/defines.inc, not {loudness} rows, so loudness is refused). A breed speaks it with {voice <language>} [V].
// The like's tree of each actor whose list names the like is copied under the new id, N lines added to that actor's list.
const GOH_TALK = { human: 'phrases', tank: 'phrases_tank', cannon: 'phrases_cannon' };
function opVoiceGoh(ctx, spec, id, like, where) {
  if (!ID.test(id) || !like) { ctx.err('GEN_VOICE_ARGS', 'voice needs id (new language id: a-z 0-9 _) and like (a language of talk.set: rus ger usa eng fin ..)', where); return; }
  const text = ctx.readStr(TALK), blocks = {};
  for (const [actor, def] of Object.entries(GOH_TALK)) {
    const p = text === null ? -1 : text.search(new RegExp('\\(\\s*define\\s+"' + def + '"', 'i')), pe = p < 0 ? -1 : sdlEnd(text, p);
    if (pe < 0) continue;
    const langs = new Map();
    for (const m of text.slice(p, pe).matchAll(/^[ \t]*\(\s*"(\w+)"\s+args\s+%0\s+([A-Za-z0-9_]+)\s+(\d+)\s+%1\s*\)/gim)) { const l = lower(m[2]); langs.set(l, Math.max(langs.get(l) || 0, +m[3])); }
    blocks[actor] = { p, pe, langs };
  }
  if (!blocks.human) { ctx.err('GEN_VOICE_NO_PHRASES', `${TALK}: no (define "phrases" ..) block to add the language to`, where); return; }
  if (!blocks.human.langs.has(like)) { ctx.err('GEN_VOICE_LIKE_MISSING', `"${like}" is not a language of the talk.set "phrases" list (${[...blocks.human.langs.keys()].join(' ')})`, where); return; }
  if (Object.values(blocks).some(b => b.langs.has(id)) || ctx.keys(new RegExp('^resource/sound/talk/[^/]+/' + esc(id) + '/')).length) { ctx.err('GEN_VOICE_EXISTS', `language "${id}" already exists in talk.set or as a sound/talk/*/${id}/ tree: pick another id`, where); return; }
  if (spec.loudness !== undefined) { ctx.err('GEN_VOICE_VALUE', 'loudness: a GoH talk folder.set calls a sound define (("talk") of sound/defines.inc), it has no {loudness} row to set; leave it out (the new voice is heard as far as the game voices)', where); return; }
  const n0 = spec.speakers === undefined ? 0 : numOk(ctx, 'GEN_VOICE_VALUE', where)(spec.speakers, 'speakers (voice variants, v1..vN)', 1, 9, true);
  if (n0 === null) return;
  const fmt = spec.format === undefined ? 'pcm' : lower(S(spec.format)).trim();
  if (!['pcm', 'ima'].includes(fmt)) { ctx.err('GEN_VOICE_VALUE', `format "${fmt}": pcm or ima`, where); return; }
  const mono = monoOf(spec.mono);
  if (mono === null) { ctx.err('GEN_VOICE_VALUE', `mono "${S(spec.mono)}": true (downmix the sounds you give to one channel) or false`, where); return; }
  // per actor: speakers (asked, else the like's count in that list); target key -> source key, speaker t plays the like's (t-1) % count + 1
  const plan = new Map(), per = {}, nOf = {};
  for (const [actor, b] of Object.entries(blocks)) {
    const sn = b.langs.get(like); if (!sn) continue;
    const n = n0 || sn, pre = `resource/sound/talk/${actor}/${like}/`;
    nOf[actor] = n;
    for (const k of ctx.keys(new RegExp('^' + esc(pre)))) {
      const rel = k.slice(pre.length), m = /^(.*?)\/v(\d+)\/(.*)$/.exec(rel);
      if (!m) { plan.set(`resource/sound/talk/${actor}/${id}/${rel}`, k); continue; }
      for (let t = 1; t <= n; t++) if ((t - 1) % sn + 1 === +m[2]) plan.set(`resource/sound/talk/${actor}/${id}/${m[1]}/v${t}/${m[3]}`, k);
    }
  }
  if (!plan.size) { ctx.err('GEN_VOICE_LIKE_MISSING', `no sound tree resource/sound/talk/{human,tank,cannon}/${like}/ in the mod or the game data`, where); return; }
  const repl = new Map(); let bad = false;
  if (spec.sounds !== undefined) {
    if (!isMap(spec.sounds)) { ctx.err('GEN_VOICE_VALUE', 'sounds: a map {"[human|tank|cannon/]<folder>[/v<N>]": file | [files] | folder}, folder e.g. attack or tank/attack', where); return; }
    for (const [k0, v] of Object.entries(spec.sounds)) {
      const parts = lower(k0).replace(/^\/+|\/+$/g, '').split('/');
      if (parts[0] === 'vehicle') parts[0] = 'tank';
      const actor = GOH_TALK[parts[0]] ? parts.shift() : 'human';
      const vm = /^v(\d+)$/.exec(parts[parts.length - 1] || ''), sp = vm ? +vm[1] : 0; if (vm) parts.pop();
      const folder = parts.join('/'), fpre = `resource/sound/talk/${actor}/${id}/${folder}/`;
      if (!folder || ![...plan.keys()].some(x => x.startsWith(fpre))) {
        const have = [...new Set([...plan.keys()].filter(x => x.startsWith(`resource/sound/talk/${actor}/`)).map(x => x.split('/')[5]))];
        ctx.err('GEN_VOICE_FOLDER_UNKNOWN', `sounds "${k0}": ${actor} talk has no folder "${folder}" (${have.slice(0, 12).join(' ')}${have.length > 12 ? ' ..' : ''})`, where); bad = true; continue;
      }
      if (vm && (sp < 1 || sp > nOf[actor])) { ctx.err('GEN_VOICE_VALUE', `sounds "${k0}": speaker v${sp} is outside v1..v${nOf[actor]}`, where); bad = true; continue; }
      const st = staged(ctx, v);
      if (st.missing.length || !st.files.length) { ctx.err('GEN_VOICE_FILE_MISSING', `sounds "${k0}": ${st.missing.length ? 'not found: ' + st.missing.join(', ') : 'no .wav in what was given'} (paths are read from the spec's folder)`, where); bad = true; continue; }
      const bufs = [];
      for (const f of st.files) { const b = gameWav(ctx, f, fmt, ['GEN_VOICE_BAD_WAV', 'GEN_VOICE_CONVERTED', 'WARN_GEN_VOICE_RATE', 'WARN_GEN_VOICE_STEREO', 'GEN_VOICE_RESAMPLED', 'GEN_VOICE_MONO'], where, mono); if (!b) bad = true; else bufs.push([f.name, b]); }
      for (let t = 1; t <= nOf[actor]; t++) if (!sp || t === sp) repl.set(fpre + 'v' + t + '/', bufs);
    }
  }
  if (bad) return;
  const keys = [];
  for (const [dst, k] of plan) { if (/\.wav$/.test(dst) && [...repl.keys()].some(r => dst.startsWith(r))) continue; put(ctx, dst, ctx.read(k)); keys.push(dst); per[dst.split('/')[3]] = (per[dst.split('/')[3]] || 0) + 1; }
  for (const [pre, bufs] of repl) for (const [nm, b] of bufs) { put(ctx, pre + nm, b); keys.push(pre + nm); }
  // talk.set: N lines at the end of each list that names the like (last list first, so the earlier offsets hold)
  const eol = eolOf(text), wasMine = ctx.inMod(TALK);
  let out = text;
  for (const [actor, b] of Object.entries(blocks).filter(([a]) => nOf[a]).sort((x, y) => y[1].pe - x[1].pe)) {
    const lines = []; for (let t = 1; t <= nOf[actor]; t++) lines.push(`\t("phrase_voice" args %0 ${id} ${t} %1)`);
    let head = out.slice(0, b.pe).replace(/[ \t]*$/, ''); if (!/\n$/.test(head)) head += eol;
    out = head + eol + '\t; gen: voice ' + id + ' (sounds from ' + like + ')' + eol + lines.join(eol) + eol + out.slice(b.pe);
  }
  put(ctx, TALK, out);
  keys.push(TALK);
  if (!wasMine) ctx.info('GEN_VOICE_FULL_COPY', `${TALK}: the mod holds the whole file (it replaces the vanilla one; every language kept)`, where);
  ctx.facts.push(`voice (GoH): ${id} from ${like}: ${Object.entries(nOf).map(([a, n]) => a + ' ' + n).join(', ')} speaker(s), ${keys.length - 1} file(s) (${Object.entries(per).map(([k, c]) => k + ' ' + c).join(', ')}${repl.size ? ', ' + repl.size + ' folder(s) replaced' : ''})`);
  wrote(ctx, 'voice', keys);
  ctx.test.push(`voice: ${id}: give a breed {voice ${id}} (GoH breeds pick their voice so, like {voice ger_officer}), select it, order it, put it in a fight: each phrase plays from sound/talk/<actor>/${id}/ [T]. exe: goh.`);
}

// ---- skin: a new humanskin (folder copy, def/mdl/textures renamed) or a texture variant <texture>#<id>.dds of a vehicle --------
function opSkin(ctx, spec) {
  const id = lower(S(spec.id)).trim(), like = lower(S(spec.like)).trim(), ent = lower(S(spec.entity)).trim(), where = 'skin ' + id;
  if (ctx.goh) { ctx.notFor('GEN_SKIN_AS2_ONLY', 'skin', 'a GoH skin variant also swaps meshes (<model>#<variant>.ply) and GoH soldiers are not humanskin folders of the AS2 form; the GoH skin layout is not mapped', 'GHFMT-10', where); return; }
  if (!ID.test(id) || (!like && !ent) || (like && ent)) { ctx.err('GEN_SKIN_ARGS', 'skin needs id and either like (a humanskin folder: a new soldier skin) or entity (a unit: a texture variant <texture>#<id>.dds)', where); return; }
  const tex = spec.textures === undefined ? {} : spec.textures;
  if (!isMap(tex)) { ctx.err('GEN_SKIN_VALUE', 'textures: a map {diffuse|bump|specular|<texture name>[#variant]: file.dds}', where); return; }
  let bad = false;
  const dds = (k, p) => {
    const f = path.resolve(ctx.base || process.cwd(), S(p));
    if (!S(p) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { ctx.err('GEN_SKIN_FILE_MISSING', `textures ${k}: ${S(p)} not found (paths are read from the spec's folder)`, where); return null; }
    const b = fs.readFileSync(f);
    if (b.length < 128 || b.toString('latin1', 0, 4) !== 'DDS ') { ctx.err('GEN_SKIN_NOT_DDS', `textures ${k}: ${S(p)} is not a DDS file; the game reads .dds (DXT1/DXT5, FMT-02) and gen has no converter`, where); return null; }
    return b;
  };
  const dim = b => b && b.length >= 20 && b.toString('latin1', 0, 4) === 'DDS ' ? b.readUInt32LE(16) + 'x' + b.readUInt32LE(12) : '?';
  const stemsOf = t => [...S(t).matchAll(/\{\s*(diffuse|bump|specular|detail|mask|envmap|lightmap)\s+"([^"]+)"/gi)].map(m => ({ role: lower(m[1]), stem: lower(m[2]) }));
  const out = new Map(), said = [];
  if (like) {
    const dir = `resource/entity/humanskin/${like}/`, ndir = `resource/entity/humanskin/${id}/`;
    if (!ID.test(like) || !ctx.exists(dir + like + '.def')) { ctx.err('GEN_SKIN_LIKE_MISSING', `no humanskin ${dir}${like}.def in the mod or the game data`, where); return; }
    if (ctx.keys(new RegExp('^' + esc(ndir))).length || defExists(ctx, id)) { ctx.err('GEN_SKIN_EXISTS', `humanskin "${id}" (or a def of that name) already exists: pick another id`, where); return; }
    const files = ctx.keys(new RegExp('^' + esc(dir) + '[^/]+$')), roles = new Map(), ren = new Map();
    for (const k of files.filter(x => /\.mtl$/.test(x))) for (const s of stemsOf(ctx.readStr(k))) {
      if (!/[\/\\]/.test(s.stem) && s.stem.startsWith(like)) ren.set(s.stem, id + s.stem.slice(like.length));
      if (!roles.has(s.role)) roles.set(s.role, s.stem);
    }
    const newName = n => { if (n === like + '.def') return id + '.def'; if (n === like + '.mdl') return id + '.mdl'; const m = /^([^#.]+)((?:#[^.]*)?\.(?:dds|tga|ebm))$/.exec(n); return m && ren.has(m[1]) ? ren.get(m[1]) + m[2] : n; };
    const texRe = /(\{\s*(?:diffuse|bump|specular|detail|mask|envmap|lightmap)\s+")([^"]+)(")/gi;
    for (const k of files) {
      const n = k.slice(dir.length); let b = ctx.read(k);
      if (n === like + '.def') b = Buffer.from(b.toString('latin1').replace(/(\{\s*extension\s+")([^"]+)(")/i, (m, a, v, c) => lower(v) === like + '.mdl' ? a + id + '.mdl' + c : m), 'latin1');
      else if (/\.mtl$/.test(n)) b = Buffer.from(b.toString('latin1').replace(texRe, (m, a, v, c) => ren.has(lower(v)) ? a + ren.get(lower(v)) + c : m), 'latin1');
      out.set(ndir + newName(n), b);
    }
    for (const [k0, p] of Object.entries(tex)) {
      const m = /^([^#]+)(#.*)?$/.exec(lower(k0).replace(/\.dds$/, '')), key = m ? m[1] : '', v = m && m[2] ? m[2] : '';
      const back = [...ren.entries()].find(e => e[1] === key), stem0 = roles.get(key) || (ren.has(key) || files.some(x => x.startsWith(dir + key + '.')) ? key : back ? back[0] : null);
      if (!stem0) { ctx.err('GEN_SKIN_STEM_UNKNOWN', `textures ${k0}: not a texture of ${like} (roles ${[...roles.keys()].join(' ')}; names ${[...roles.values()].join(' ')})`, where); bad = true; continue; }
      const b = dds(k0, p); if (!b) { bad = true; continue; }
      const dst = ndir + (ren.get(stem0) || stem0) + v + '.dds', old = out.get(dst);
      if (old && dim(old) !== dim(b)) ctx.err('WARN_GEN_SKIN_SIZE', `textures ${k0}: ${dim(b)}, the replaced texture is ${dim(old)}; the model's UV map is drawn for the old layout [T]`, where);
      out.set(dst, b); said.push(`${(ren.get(stem0) || stem0) + v}.dds <- ${S(p)}`);
    }
    if (bad) return;
    for (const [k, b] of out) put(ctx, k, b);
    ctx.facts.push(`skin: humanskin ${id} (copy of ${like}, ${out.size} files)${said.length ? ': ' + said.join(', ') : ': same textures under new names'}`);
    wrote(ctx, 'skin', out.keys());
    ctx.test.push(`skin: ${id}: give a breed {skin "${id}"} (breed op set skin), spawn the soldier: the new uniform shows, no white or black parts, LODs at distance too [T].`);
    return;
  }
  const defs = ctx.keys(new RegExp('^resource/entity/.*/' + esc(ent) + '\\.def$'));
  if (!defs.length) { ctx.err('GEN_SKIN_ENTITY_UNKNOWN', `entity "${ent}" has no resource/entity/**/${ent}.def in the mod or the game data`, where); return; }
  if (defs.length > 1) { ctx.err('GEN_SKIN_AMBIGUOUS', `entity "${ent}" matches ${defs.length} defs (${defs.slice(0, 3).join(' | ')})`, where); return; }
  const def = defs[0], dt = ctx.readStr(def), em = /\{\s*extension\s+"([^"]+)"/i.exec(dt);
  let mdir = def.slice(0, def.lastIndexOf('/') + 1);
  if (em && /[\/\\]/.test(em[1])) { const v = lower(em[1]).replace(/\\/g, '/'); mdir = (v.startsWith('/') ? 'resource' + v : mdir + v).replace(/[^/]+$/, ''); }
  const mtls = ctx.keys(new RegExp('^' + esc(mdir) + '[^/]+\\.mtl$')), stems = new Set();
  for (const k of mtls) for (const s of stemsOf(ctx.readStr(k))) if (!/[\/\\$]/.test(s.stem)) stems.add(s.stem);
  if (!stems.size) { ctx.err('GEN_SKIN_NO_MTL', `${mdir}: no .mtl naming a texture beside ${ent}'s model; its textures live elsewhere, edit that folder`, where); return; }
  if (!Object.keys(tex).length) { ctx.err('GEN_SKIN_ARGS', `skin for entity ${ent} needs textures {<texture name>: file.dds} (names: ${[...stems].join(' ')})`, where); return; }
  for (const [k0, p] of Object.entries(tex)) {
    const stem = lower(k0).replace(/\.dds$/, '');
    if (!stems.has(stem)) { ctx.err('GEN_SKIN_STEM_UNKNOWN', `textures ${k0}: not a texture of ${ent}'s model (${[...stems].join(' ')})`, where); bad = true; continue; }
    const dst = mdir + stem + '#' + id + '.dds';
    if (ctx.exists(dst)) { ctx.err('GEN_SKIN_EXISTS', `${dst} already exists: pick another variant id`, where); bad = true; continue; }
    const b = dds(k0, p); if (!b) { bad = true; continue; }
    const old = ctx.read(mdir + stem + '.dds');
    if (old && dim(old) !== dim(b)) ctx.err('WARN_GEN_SKIN_SIZE', `textures ${k0}: ${dim(b)}, ${stem}.dds is ${dim(old)}; the UV map is drawn for the old layout [T]`, where);
    out.set(dst, b); said.push(`${stem}#${id}.dds`);
  }
  if (bad) return;
  if (spec.texmod === true || /^(true|yes)$/i.test(S(spec.texmod))) {
    const wasMine = ctx.inMod(def);
    out.set(def, Buffer.from(setKid(dt, rootOf(dt), 'texmod', `{texmod "${id}"}`, eolOf(dt)), 'latin1')); said.push(`${ent}.def {texmod "${id}"}`);
    if (!wasMine) ctx.info('GEN_SKIN_FULL_COPY', `${def}: whole-file override of the base def to set {texmod "${id}"} (VFS-01)`, where);
  }
  for (const [k, b] of out) put(ctx, k, b);
  ctx.facts.push(`skin: variant ${id} of ${ent}: ${said.join(', ')}`);
  wrote(ctx, 'skin', out.keys());
  ctx.test.push(`skin: ${ent} variant ${id}: ${spec.texmod ? 'spawn the unit' : 'place it with {TexMod "' + id + '"} in a mission or a map texMod'}; the new texture shows on every part [T].`);
}

// ---- stuffmodel: a copy of an inventory model (inventory/<group>/<like>/) for a new weapon or item ----------------------------
function opStuffModel(ctx, spec) {
  const id = lower(S(spec.id)).trim(), like = lower(S(spec.like)).trim(), item = words(spec.item).join(' '), where = 'stuffmodel ' + id;
  if (ctx.goh) { ctx.notFor('GEN_STUFFMODEL_AS2_ONLY', 'stuffmodel', 'it copies and edits a model (.mdl preview camera); model editing is for Assault Squad 2 and the 64-bit build only', 'owner decision 2026-11-10', where); return; }
  if (!ID.test(id) || !ID.test(like)) { ctx.err('GEN_STUFFMODEL_ARGS', 'stuffmodel needs id (new model name: a-z 0-9 _) and like (an inventory model, e.g. mg42)', where); return; }
  const defs = ctx.keys(new RegExp('^resource/entity/inventory/[^/]+/' + esc(like) + '/' + esc(like) + '\\.def$'));
  if (!defs.length) { ctx.err('GEN_STUFFMODEL_LIKE_MISSING', `no inventory model resource/entity/inventory/<group>/${like}/${like}.def in the mod or the game data`, where); return; }
  if (defs.length > 1) { ctx.err('GEN_STUFFMODEL_LIKE_AMBIGUOUS', `"${like}" is in ${defs.length} inventory groups (${defs.join(' | ')})`, where); return; }
  const dir = defs[0].slice(0, defs[0].lastIndexOf('/') + 1), ndir = dir.replace(/[^/]+\/$/, id + '/');
  if (defExists(ctx, id) || ctx.keys(new RegExp('^' + esc(ndir))).length) { ctx.err('GEN_STUFFMODEL_EXISTS', `an entity "${id}" (or the folder ${ndir}) already exists: pick another id`, where); return; }
  let sk = null;
  if (item) {
    const f = findStuff(stuffIndex(ctx), item.split(' '));
    sk = f.pick;
    if (!sk) { ctx.err('GEN_STUFFMODEL_ITEM_MISSING', `item "${item}": ${f.hits.length ? f.hits.length + ' stuff files match (' + f.hits.slice(0, 3).map(x => x.key.slice(STUFF.length)).join(' | ') + '), give more of the name' : 'no stuff file of that name (make it with a gun, shell or item op first)'}`, where); return; }
  }
  const cam = spec.camera, edits = [];
  if (cam !== undefined) {
    if (!isMap(cam)) { ctx.err('GEN_STUFFMODEL_VALUE', 'camera: a map {origin "x y z", lookat "x y z", fov n} (the inventory picture camera) [I]', where); return; }
    for (const k of Object.keys(cam)) {
      const v = Array.isArray(cam[k]) ? cam[k].map(S) : S(cam[k]).trim().split(/[\s,]+/), want = k === 'fov' ? 1 : 3;
      if (!['origin', 'lookat', 'fov'].includes(k) || v.length !== want || v.some(x => x === '' || !isFinite(+x)) || (k === 'fov' && !(+v[0] > 1 && +v[0] < 170))) { ctx.err('GEN_STUFFMODEL_VALUE', `camera ${k} "${S(cam[k])}": origin / lookat = 3 numbers, fov = 1..170`, where); return; }
      edits.push([k, v.map(Number).join(' ')]);
    }
  }
  const out = new Map();
  for (const k of ctx.keys(new RegExp('^' + esc(dir) + '[^/]+$'))) {
    const n = k.slice(dir.length); let b = ctx.read(k);
    if (n === like + '.def') {
      let t = b.toString('latin1').replace(/(\{\s*extension\s+")([^"]+)(")/i, (m, a, v, c) => a + id + '.mdl' + c);
      if (item) { const re = /(\{\s*extender\s+"stuff"[\s\S]*?\{\s*item\s+")([^"]+)(")/i; t = re.test(t) ? t.replace(re, (m, a, v, c) => a + item + c) : addIn(t, rootOf(t), [`{extender "stuff" {item "${item}"}}`], eolOf(t)); }
      out.set(ndir + id + '.def', Buffer.from(t, 'latin1'));
    } else if (n === like + '.mdl') {
      let t = b.toString('latin1');
      for (const [k2, v] of edits) {
        const p = t.search(/\{\s*extender\s+"preview"/i), st = p < 0 ? null : kids(t, p).find(x => x.name === 'stuff'), c = st ? kids(t, st.a).find(x => x.name === 'camera') : null;
        if (!c) { ctx.err('GEN_STUFFMODEL_NO_CAMERA', `${k}: no {Extender "preview" {"Stuff" {camera ..}}} block to edit [I]`, where); return; }
        t = setKid(t, c.a, k2, `{${k2} ${v}}`, eolOf(t));
      }
      out.set(ndir + id + '.mdl', Buffer.from(t, 'latin1'));
    } else out.set(ndir + n, b);
  }
  const said = [`${out.size} files from ${dir}`];
  if (sk) {
    const t = ctx.readStr(sk.key), wasMine = ctx.inMod(sk.key);
    out.set(sk.key, Buffer.from(setKid(t, rootOf(t), 'entity', `{entity "${id}"}`, eolOf(t)), 'latin1'));
    said.push(`${sk.key.slice(STUFF.length)} {entity "${id}"}`);
    if (!wasMine) ctx.info('GEN_STUFFMODEL_FULL_COPY', `${sk.key}: whole-file override of the base stuff file to point it at the model "${id}" (VFS-01)`, where);
  }
  if (edits.length) said.push('camera ' + edits.map(e => e.join(' ')).join(', '));
  for (const [k, b] of out) put(ctx, k, b);
  ctx.facts.push(`stuffmodel: ${id} (copy of ${like}): ${said.join(', ')}`);
  wrote(ctx, 'stuffmodel', out.keys());
  ctx.test.push(`stuffmodel: ${id}: open a soldier's inventory holding ${item || 'the item that names it'}: the picture shows (preview camera of the .mdl [I]), drop it: the model lies on the ground [T].`);
}

// ---- mapinfo: values of map.info (or <mode>.info) of a map: maxPlayers, texMod, ranked .. -----------------------------------
const MAPINFO = { maxplayers: ['maxPlayers', 1, 16], minplayers: ['minPlayers', 1, 16], rankedminplayers: ['rankedMinPlayers', 1, 16], rankedmaxplayers: ['rankedMaxPlayers', 1, 16], texmod: ['texMod'], ranked: ['ranked'], parameters: ['parameters'] };
function opMapInfo(ctx, spec) {
  const m0 = S(spec.map).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''), map = lower(/^map\//i.test(m0) ? m0 : 'map/' + m0), mode = lower(S(spec.mode)).trim(), where = 'mapinfo ' + map;
  if (ctx.goh) { ctx.notFor('GEN_MAPINFO_AS2_ONLY', 'mapinfo', 'the GoH map folder holds no resource/map/multi/<map>/map.info of the AS2 form in the vanilla data; the GoH map values file is not mapped', 'vanilla GoH data', where); return; }
  const set = spec.set;
  if (!/^map\/[a-z0-9_-]+(\/[a-z0-9_-]+)+$/.test(map) || !isMap(set) || !Object.keys(set).length || (mode && !ID.test(mode))) { ctx.err('GEN_MAPINFO_ARGS', 'mapinfo needs map (multi/<m>) and set {maxPlayers: n, texMod: n, ..}; mode = a <mode>.info instead of map.info', where); return; }
  if (ctx.plan && ctx.virtMaps.has(map)) { ctx.skipped++; ctx.info('GEN_PLAN_SKIPPED', `${map} is created by an earlier map-clone op: map.info values not simulated in --plan`, where); return; }
  const key = 'resource/' + map + '/' + (mode ? mode + '.info' : 'map.info'), buf = ctx.read(key);
  if (!buf) { ctx.err('GEN_MAPINFO_MISSING', `${key} not found in the mod or the game data`, where); return; }
  const text = buf.toString('latin1'), r = rootOf(text);
  if (r < 0 || !/^\{\s*game\b/i.test(text.slice(r))) { ctx.err('GEN_MAPINFO_NO_GAME', `${key}: no {game ..} block`, where); return; }
  const tree = sdlwrite.parse(buf), num = numOk(ctx, 'GEN_MAPINFO_VALUE', where), edits = [], said = [], fin = {};
  const old = k => { const m = new RegExp('\\{\\s*' + k + '(?:\\s+([^{}]*?))?\\s*\\}', 'i').exec(text); return m ? (m[1] || 'on') : 'none'; };
  let bad = false;
  for (const [k0, v] of Object.entries(set)) {
    const K = MAPINFO[lower(k0)];
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(k0)) { ctx.err('GEN_MAPINFO_VALUE', `key "${k0}": a map.info key name (letters, digits, _)`, where); bad = true; continue; }
    if (!K) {
      const rv = rawArg(v);
      if (rv === null) { ctx.err('GEN_MAPINFO_VALUE', `${k0} "${S(v)}": a plain value (no braces or ;)`, where); bad = true; continue; }
      edits.push({ op: 'add', path: 'game/' + k0, value: rv }); said.push(`${k0} ${old(k0)} -> ${rv}`);
      ctx.err('WARN_GEN_MAPINFO_KEY_UNCHECKED', `${k0}: not a key gen knows (${Object.values(MAPINFO).map(x => x[0]).join(' ')}); written as {${k0} ${rv}} unchecked [T]`, where); continue;
    }
    if (K.length === 3) { const n = num(v, K[0], K[1], K[2], true); if (n === null) { bad = true; continue; } fin[lower(K[0])] = n; edits.push({ op: 'add', path: 'game/' + K[0], value: String(n) }); said.push(`${K[0]} ${old(K[0])} -> ${n}`); }
    else if (K[0] === 'texMod') { const w = lower(S(v)).trim(); if (!/^(\d|d)$/.test(w)) { ctx.err('GEN_MAPINFO_VALUE', `texMod "${S(v)}": 0..9 (a season / camo variant number) or d`, where); bad = true; continue; } edits.push({ op: 'add', path: 'game/texMod', value: w }); said.push(`texMod ${old('texMod')} -> ${w}`); }
    else if (K[0] === 'ranked') {
      const on = v === true || /^(true|yes|1)$/i.test(S(v)), off = v === false || /^(false|no|0)$/i.test(S(v)), has = !!sdlwrite.find(tree, 'game/ranked');
      if (!on && !off) { ctx.err('GEN_MAPINFO_VALUE', `ranked "${S(v)}": true or false`, where); bad = true; continue; }
      if (on && !has) edits.push({ op: 'add', path: 'game/ranked', value: '' }); else if (off && has) edits.push({ op: 'del', path: 'game/ranked' });
      said.push(`ranked ${has ? 'on' : 'off'} -> ${on ? 'on' : 'off'}`);
    } else { const t = S(v); if (/["{};]/.test(t)) { ctx.err('GEN_MAPINFO_VALUE', `parameters: text without quotes, braces or ;`, where); bad = true; continue; } edits.push({ op: 'add', path: 'game/parameters', value: `"${t}"` }); said.push(`parameters -> "${t}"`); }
  }
  for (const [a, b] of [['minplayers', 'maxplayers'], ['rankedminplayers', 'rankedmaxplayers']]) if (fin[a] !== undefined && fin[b] !== undefined && fin[a] > fin[b]) { ctx.err('GEN_MAPINFO_VALUE', `${MAPINFO[a][0]} ${fin[a]} is above ${MAPINFO[b][0]} ${fin[b]}`, where); bad = true; }
  if (bad) return;
  let b = buf;
  for (const e of edits) { const res = patch.applyEdit(b, e); if (res.err) { ctx.err('GEN_MAPINFO_VALUE', `${e.path}: ${res.err[1]}`, where); return; } b = res.buf; }
  b = Buffer.from(b.toString('latin1').replace(/\{ranked \}/, '{ranked}'), 'latin1');
  const wasMine = ctx.inMod(key);
  put(ctx, key, b);
  if (!wasMine) ctx.info('GEN_MAPINFO_FULL_COPY', `${key}: the mod holds the whole file (it replaces the map's own; VFS-01)`, where);
  ctx.facts.push(`mapinfo: ${key}: ${said.join(', ')}`);
  wrote(ctx, 'mapinfo', [key]);
  ctx.test.push(`mapinfo: ${map}: the lobby shows ${said.join(', ')}; start a game with that many players [T].`);
}

// ---- schema rows (specschema.js merges these into FIELDS; gun = the cannon row plus the class fields) ------------------------
function assetFields(h) {
  const { F, ref, S1, FIELDS } = h, N = { type: ['number', 'string'] }, MAP = { type: 'object' }, FILES = { anyOf: [S1, { type: 'array', items: S1 }] };
  const BLAST = F({ anyOf: [S1, { type: 'array' }, MAP] }, 'blast layers, first replaces the inherited ones (KEY-17): ["energy inner outer", ..] or [{energy, area "inner outer"}]', ['KEY-17']);
  const DMG = F({ type: ['array', 'object'] }, 'values inside the own n-th {damage [add] <type>} block, in place: [{type: fire, layer: 1, set: {radius: 8, heating: 0.8, time: 5}}]; an inherited layer is refused (KEY-17)', ['KEY-17']);
  return {
    gun: { req: ['name', 'like'], props: Object.assign({}, FIELDS.gun.props, {
      class: F({ type: 'string', enum: Object.keys(CLASS_DIRS) }, 'weapon class: the stuff folder the like is found in (rifle mg smg pistol launcher cannon mounted); default cannon = the cannon op'),
      rof: F(N, 'rate of fire, rounds per minute: ("recoveryTime" r(rpm)) when the folder has the macro, else {recoveryTime 60/rpm}'),
      burst: F({ type: ['string', 'array', 'object'] }, 'burst preset short|medium|long (("burst_x")) or rounds "short long" [+ seconds "short_s long_s"] ({burst {short n s} {long n s}}; seconds not given come from the like)'),
      spread: F(N, '{spreading N}: shot spread'), aim: F(N, 'aim time in seconds ({RelaxationTime})'),
      reload: F(N, 'reload time in seconds ({rechargeTime}); recharge is the same key'), health: F(N, 'damage to soldiers per hit ({healthDamage})'),
      magazine: F(N, 'rounds per magazine ({filling "<the like\'s ammo>" n})'),
      fire_sound: F(S1, 'shot sound under resource/sound/weapon/shot/ ({fireSound "x"}), e.g. mgun/mg42_burst/'),
      reload_sound: F(S1, 'reload sound under resource/sound/weapon/reload/ ({reloadSound "x"})'),
      params: F(MAP, 'raw preset calls {macro: args} -> ("macro" args), e.g. {recoveryTime: "r(1200)"}; {shell type: {key: value}} -> {parameters "type" ..}') }) },
    shell: { req: ['id', 'like'], props: {
      id: F(S1, 'new shell = <family>.<type> (file shell/<id>.ammo beside the like), e.g. bullet76x.heat'), like: F(S1, 'existing shell copied, e.g. bullet76.fg'),
      preset: F({ type: 'string', enum: SHELL_PRESETS }, 'shell/.presets call: ap apcr (trace) fg fg_medium fg_heavy (blast layers)'), args: F(N, 'the preset number: trace scale (ap/apcr) or blast energy (fg*)'),
      blast: BLAST, mass: F(N, '{mass kg}'), cumulative: F(N, '{cumulative 0..1}: HEAT share of the damage'),
      entity: F(S1, '{entity "x"}: the shell model def'), tags: F(ref('scalarOrList'), 'extra {tag ..} words; "-word" drops a word from the own {tag} lines of the copy'), damage_edit: DMG } },
    item: { req: ['id', 'like'], props: {
      id: F(S1, 'new item name (file beside the like, same extension)'), like: F(S1, 'existing grenade, mine or item copied, e.g. f1, antitank'),
      throw: F(MAP, 'throw {range m, angle deg (startAngle), spread (spreading), speed (constantSpeed)}; the inherited block is copied in first'),
      fuse: F(N, 'fuse seconds ({special {PrepareTime}})'), mass: F(N, '{mass kg}'), weight: F(N, '{inventory {weight}}'), size: F({ type: ['string', 'array'] }, '{inventory {size w h}} in cells: "1 1"'),
      blast: BLAST, cumulative: F(N, '{cumulative 0..1}'), entity: F(S1, '{entity "x"}: the model def'), tags: F(ref('scalarOrList'), 'extra {tag ..} words; "-word" drops a word from the own {tag} lines of the copy'), damage_edit: DMG } },
    sound: { req: ['id'], any: [['like'], ['files']], props: {
      id: F(S1, 'new folder under resource/sound/, e.g. weapon/shot/my_mg'), like: F(S1, 'sound folder whose settings (and wavs when no files) are copied'),
      files: F(FILES, '.wav files or folders of them, read from the spec\'s folder; a format the game does not play is converted (lib/wav.js)'),
      loudness: F(S1, 'a row of sound.set ({loudness "x"})', ['VIS-27']), signal: F(S1, '"name radius": what the AI hears, e.g. "shot 40"'),
      volume: F(N, '0..1 (the engine clamps it)'), tag: F({ type: 'string', enum: SOUND_TAGS }, 'volume group (VIS-09)', ['VIS-09']),
      format: F({ type: 'string', enum: ['pcm', 'ima'] }, 'conversion target: 16-bit PCM or IMA ADPCM', [], { default: 'pcm' }),
      mono: F({ type: ['boolean', 'string'] }, 'true: files of 2+ channels are downmixed to one (mean of the channels, lib/wav.js toMono); a world sound should be mono') } },
    soundclass: { req: [], any: [['name', 'min', 'max'], ['percent']], props: {
      name: F(S1, 'new loudness row name'), min: F(N, 'full volume up to (m)'), max: F(N, 'silent from (m)'), priority: F(N, 'whole number; higher keeps a voice slot'),
      percent: F(MAP, 'sound.set {percent "<group>" share [max]} rows: {<group>: "share [max]"}, group effects emotions speech environment main_environment; set in place or added after the last row') } },
    voice: { req: ['id', 'like'], props: {
      id: F(S1, 'new talk language id (breed {voice "<id>"})'), like: F(S1, 'talk.set language whose phrases and sound trees are copied: rus ger ger2 eng usa jap'),
      speakers: F(N, 'voice variants v1..vN (default: as many as the like)'), sounds: F(MAP, 'replacement wavs {"[human|vehicle|cannon/]<folder>[/v<N>]": file | [files] | folder}'),
      format: F({ type: 'string', enum: ['pcm', 'ima'] }, 'conversion target for given wavs', [], { default: 'pcm' }),
      mono: F({ type: ['boolean', 'string'] }, 'true: given wavs of 2+ channels are downmixed to one'),
      loudness: F({ type: ['string', 'object'] }, 'a sound.set loudness row for talk/<id>/folder.set ({loudness "x"}): one class for every talk tree, or {human|vehicle|cannon: class}', ['VIS-27']) } },
    skin: { req: ['id'], any: [['like'], ['entity']], props: {
      id: F(S1, 'new humanskin name, or the variant name of <texture>#<id>.dds'), like: F(S1, 'humanskin folder copied (a soldier skin)'),
      entity: F(S1, 'unit def whose model gets a texture variant'), textures: F(MAP, '{diffuse|bump|specular|<texture name>[#variant]: file.dds}', ['FMT-02']),
      texmod: F({ type: ['boolean', 'string'] }, 'with entity: also set {texmod "<id>"} in its def') } },
    stuffmodel: { req: ['id', 'like'], props: {
      id: F(S1, 'new inventory model (entity) name'), like: F(S1, 'inventory model copied: resource/entity/inventory/<group>/<like>/'),
      item: F(S1, 'stuff name (weapon / item) that gets {entity "<id>"}; the def\'s {extender "stuff" {item}} names it'),
      camera: F(MAP, 'inventory picture camera {origin "x y z", lookat "x y z", fov n} in the .mdl preview block [I]') } },
    mapinfo: { req: ['map', 'set'], props: {
      map: F(S1, 'multi/<m> (or map/multi/<m>)'), mode: F(S1, 'edit <mode>.info instead of map.info'),
      set: F(MAP, '{maxPlayers, minPlayers, texMod, ranked, rankedMinPlayers, rankedMaxPlayers, parameters, <other game key>}', ['VFS-01']) } },
  };
}

module.exports = { ops: { opGunAny, opShell, opItem, opSound, opSoundClass, opVoice, opSkin, opStuffModel, opMapInfo }, assetFields, stuffIndex, findStuff, CLASS_DIRS };
