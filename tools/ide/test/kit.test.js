// ide kit test (Code Pieces data and planner, design 12.1). arg 1 = scratch dir (the ialint case writes a mod folder there).
// Two halves, each prints its own result line:
//   core     own fixtures (tools/ide/test/fx/kit) and sample pieces: self-contained ES5 functions, kitKindOf, sections,
//            lang/common rows, compile, scopeAt, plan (indent, placement, refusals, duplicate reactions, warnings, edits that
//            apply and check clean), speed and checkpoints, scanNames, words.json, the route answer, seeded content faults.
//   content  the real groups that are present (tools/ide/kit/pieces, lang): rules 1 to 9 of design 12.1 and the rules of the
//            content builders' checker. An absent group is "skip"; a present group with faults fails and names piece and rule.
//   round 2  (2026-11-21) core: groups, catalog fields no size mp whole, the generic scope (top any in:<word> in:*),
//            whole-file and multiplayer refusals, kind props, sections and rows (section M, fx/kit/samples2.js). content:
//            the v1 rules over the v1 groups only; each round 2 group that is present gets the build contract of
//            (logic copied, rows in fx/kit/assign2.json) and every piece is planned into a
//            place made for its scope (an empty doc for whole) and must balance and parse with lib/sdlx. Absent round 2
//            groups are named in one line and skipped. Env KIT_GROUP_FAULTS=<file> writes the round 2 faults as JSON.
// Last line PASS only when core passes and content passes or is skipped.
// Author: Imperator_Aug (ARSENAL, ia-eccd0b1b)
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), vm = require('vm'), cp = require('child_process');
const scratch = process.argv[2] || path.join(os.tmpdir(), 'ide-kit-test');
fs.mkdirSync(scratch, { recursive: true });
const ROOT = path.resolve(__dirname, '..', '..', '..');
const FX = path.join(__dirname, 'fx', 'kit');
const kitPlan = require('../kit/plan'), kitKinds = require('../kit/kinds'), SEC = require('../kit/sections'), WORDS = require('../kit/words');
const INDEX = require('../kit/index'), COMMON = require('../kit/lang/common');
const { check } = require('../intel/check'), FIX = require('../intel/fixes');
const IALINT = require('../../ialint/ialint');
let GAME = null;
try { GAME = require('../../lib/gamedir').resolve({}).dir || null; } catch (e) { GAME = null; }

let cbad = 0, cn = 0;
const ok = (c, what) => { cn++; if (!c) { cbad++; console.log('FAIL core: ' + what); } return !!c; };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), what + '\n   got:  ' + JSON.stringify(a) + '\n   want: ' + JSON.stringify(b));
const read = f => fs.readFileSync(path.join(FX, f), 'utf8');
const srcOf = text => { const ls = String(text).split('\n'); return { count: ls.length, line: n => ls[n - 1] }; };
const marks = text => { const m = {}; String(text).split('\n').forEach((l, i) => { const x = /;\s*@([a-z0-9_]+)\s*$/.exec(l); if (x) m[x[1]] = i + 1; }); return m; };
const P = kitPlan().use(WORDS);
const SAMPLES = require('./fx/kit/samples');
const S = id => SAMPLES.pieces.find(p => p.id === id);
const SCOPES = ['top', 'block', 'handler', 'branch', 'timer', 'container'];
const ROLES = ['event', 'cond', 'act', 'recipe', 'pattern', 'block', 'grammar', 'data'];
const FK = ['chance', 'seconds', 'number', 'units', 'choice', 'flag', 'event', 'view', 'anim', 'sound', 'tag', 'tags', 'sound-file', 'entity', 'effect', 'bone', 'path', 'place', 'terrain', 'able', 'macro', 'input', 'text', 'comment', 'code', 'list'];
const NUMK = ['chance', 'seconds', 'number', 'units'];
const NAMEK = ['flag', 'event', 'view', 'anim', 'sound', 'tag', 'place', 'terrain', 'able', 'macro', 'input'];
const KIND_IDS = kitKinds().KINDS.map(k => k.id);

// =====================================================================================================================
// shared checks (core uses them on its own rows and seeded faults; content on the real groups)
const BARE = /(?<![\w.\/\\#+$'"`-])as64(?![\w+\/\\"`]|'(?!s\b)|\.\w)/;   // tools/gui/test/test-lang.js:91
const MODNAMES = (() => { try { return fs.readdirSync(path.join(ROOT, 'refmods')).filter(n => { try { return fs.statSync(path.join(ROOT, 'refmods', n)).isDirectory(); } catch (e) { return false; } }); } catch (e) { return []; } })();
const LIMIDS = (() => {
  const s = new Set(), d = path.join(ROOT, 'limits');
  try { for (const f of fs.readdirSync(d)) if (/\.md$/.test(f)) for (const m of fs.readFileSync(path.join(d, f), 'utf8').matchAll(/^([A-Z][A-Z0-9]*-\d+)\s*\|/gm)) s.add(m[1]); } catch (e) { /* no limits folder */ }
  return s;
})();
const slots = s => (String(s).match(/\{[a-z0-9]+\}/g) || []).sort().join(',');
// non-ASCII characters built from code points (the source stays ASCII)
const ch = (...c) => String.fromCharCode(...c);
const RE_DASH = new RegExp('[' + ch(0x2014, 0x2013) + ']'), RE_CYR = new RegExp('[' + ch(0x400) + '-' + ch(0x4ff) + ']');
const RE_ZH = new RegExp('[' + ch(0x4e00) + '-' + ch(0x9fff) + ']'), RE_STOP = new RegExp('(\\.|' + ch(0x3002) + ')$');
// network play: the one fixed sentence per language (compared in lower case, without the full stop), never "safe" and
// never "the same way on every machine". A bare "safe" stays allowed (a safe idle, a mine armed or safe).
const NET = ['not tried in a network game', '\u043d\u0435 \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043e \u0432 \u0441\u0435\u0442\u0435\u0432\u043e\u0439 \u0438\u0433\u0440\u0435',
  '\u043d\u0435 \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u0435\u043d\u043e \u0432 \u043c\u0435\u0440\u0435\u0436\u0435\u0432\u0456\u0439 \u0433\u0440\u0456', '\u672a\u5728\u8054\u7f51\u6e38\u620f\u4e2d\u8bd5\u8fc7'];
const RE_NETCODE = /\b(rand|user_control|user_squad)\b/;
const RE_SAFE = [/safe.{0,40}network|network.{0,40}safe/i,
  /\u0431\u0435\u0437\u043e\u043f\u0430\u0441.{0,40}\u0441\u0435\u0442\u0435\u0432|\u0441\u0435\u0442\u0435\u0432.{0,40}\u0431\u0435\u0437\u043e\u043f\u0430\u0441/i,
  /\u0431\u0435\u0437\u043f\u0435[\u0447\u043a].{0,40}\u043c\u0435\u0440\u0435\u0436\u0435\u0432|\u043c\u0435\u0440\u0435\u0436\u0435\u0432.{0,40}\u0431\u0435\u0437\u043f\u0435[\u0447\u043a]/i,
  /\u5b89\u5168.{0,20}\u8054[\u7f51\u673a]|\u8054[\u7f51\u673a].{0,20}\u5b89\u5168/];
// one lang row -> [[rule, msg]]
function rowFaults(r) {
  const out = [], L = ['', 'en', 'ru', 'uk', 'zh'];
  if (!Array.isArray(r) || r.length !== 5) return [['row', 'row is not [key, en, ru, uk, zh]']];
  for (let i = 1; i < 5; i++) {
    const v = r[i];
    if (typeof v !== 'string' || !v.trim()) { out.push(['empty', L[i] + ' is empty']); continue; }
    if (RE_DASH.test(v)) out.push(['dash', L[i] + ' has an em or en dash']);
    if (/\S - \S/.test(v)) out.push(['separator', L[i] + ' has " - " as a separator']);
    if (/\$\{|@[a-z^][a-z0-9_]*@/.test(v)) out.push(['marker', L[i] + ' shows a raw fill-in marker']);
    if (BARE.test(v)) out.push(['as64', L[i] + ' has the game name in lower case (write AS64)']);
    if (/`/.test(v)) out.push(['backtick', L[i] + ' has a backtick']);
    if (slots(v) !== slots(r[1])) out.push(['slots', L[i] + ' has other {slots} than en']);
    if ((i === 2 || i === 3) && !RE_CYR.test(v)) out.push(['translated', L[i] + ' has no Cyrillic letter (not translated?)']);
    if (i === 4 && !RE_ZH.test(v)) out.push(['translated', 'zh has no Chinese character (not translated?)']);
    if (i === 1 && /[^\x20-\x7e]/.test(v)) out.push(['ascii', 'en is not plain ASCII']);
    if (/same way on every machine/i.test(v)) out.push(['machine', L[i] + ' says "same way on every machine" (write "' + NET[i - 1] + '")']);
    for (const re of RE_SAFE) if (re.test(v)) { out.push(['safe', L[i] + ' calls something safe in a network game (write "' + NET[i - 1] + '")']); break; }
    for (const m of MODNAMES) if (new RegExp('\\b' + m.replace(/[^a-z0-9]/gi, '') + '\\b', 'i').test(v)) out.push(['modname', L[i] + ' names a real mod (' + m + ')']);
  }
  return out;
}
const ind = (c, n) => c.split('\n').map(l => (l ? '\t'.repeat(n) : '') + l).join('\n');
const EVFORM = { move: 'move on', turn: 'turn on', accelerate: 'accelerate on', brake: 'brake on', engine: 'engine on', swim: 'swim on', grounded: 'grounded on',
  operatable: 'operatable on', board: 'board in', crew: 'crew in', overlap: 'overlap begin', terrain_pp: 'terrain_pp "swamp" enter', terrain_fx: 'terrain_fx "sand" enter',
  ik: 'ik begin "turret"', fire: 'fire "gun"', animation_end: 'animation_end "kit_anim"', custom: '"kit_event"', blow: 'blow' };
// the piece's compiled text inside a fixture for one scope
function wrap(text, scope, piece) {
  const ev = piece.events && piece.events.length ? (EVFORM[piece.events[0]] || piece.events[0]) : 'spawn';
  if (scope === 'top') return text + '\n';
  if (scope === 'block') return '{"kit_test"\n' + ind(text, 1) + '\n}\n';
  const h = '{"kit_test"\n\t{on ' + ev + '\n', e = '\n\t}\n}\n';
  if (scope === 'handler') return h + ind(text, 2) + e;
  const head = scope === 'branch' ? '{if rand 0.5' : scope === 'timer' ? '{delay 1' : '{spawn "kit_fx"';
  return h + '\t\t' + head + '\n' + ind(text, 3) + '\n\t\t}' + e;
}
function balance(src) {
  const st = []; let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '"') { i++; while (i < src.length && src[i] !== '"' && src[i] !== '\n') { if (src[i] === '\\') i++; i++; } i++; continue; }
    if (c === ';') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{' || c === '(') st.push([c, line]);
    else if (c === '}' || c === ')') { const o = st.pop(); if (!o || o[0] !== (c === '}' ? '{' : '(')) return 'unbalanced ' + c + ' at line ' + line; }
    i++;
  }
  return st.length ? 'unclosed ' + st.map(s => s[0] + ' from line ' + s[1]).join(', ') : null;
}
// rule 7: every event, condition and action word is a known one; the forms the game refuses are absent
function lexLine(text) {
  const out = []; let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ';') break;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') { let j = i + 1; while (j < text.length && text[j] !== '"') { if (text[j] === '\\') j++; j++; } out.push({ t: 's', v: text.slice(i + 1, j) }); i = j + 1; continue; }
    if ('{}()'.includes(c)) { out.push({ t: c }); i++; continue; }
    let j = i; while (j < text.length && !/[\s;"{}()]/.test(text[j])) j++;
    out.push({ t: 'w', v: text.slice(i, j) }); i = j;
  }
  return out;
}
const BLOCK_KEYS = new Set(['inflammation_time']);
function tokCheck(text, p, fail) {
  const ACT = new Set(WORDS.actions), EV = new Set(WORDS.events), TEV = new Set(WORDS.terrainEvents), COND = new Set(WORDS.conditions);
  const CONT = new Set(WORDS.containers), VAL = new Set(WORDS.valueBlocks), SIDES = ['front', 'back', 'left', 'right', 'top', 'bottom'];
  const terrain = (p.kinds || []).includes('ia-terrain');
  const toks = []; for (const l of text.split('\n')) for (const t of lexLine(l)) toks.push(t);
  const lw = t => t && t.t === 'w' ? t.v.toLowerCase() : null;
  const st = [];
  function condAt(j) {
    let x = toks[j];
    if (lw(x) === 'not') { j++; x = toks[j]; if (lw(x) === 'not') fail('notnot', '"not not" is not a form'); }
    if (!x || x.t !== 'w' && x.t !== 's') return j;
    if (x.t === 's') return j + 1;
    const c = x.v.toLowerCase();
    if (c === 'if') fail('elseif', '"else if" is not a form');
    else if (!c.startsWith('%') && !COND.has(c)) fail('condition', 'unknown condition ' + c);
    const aw = lw(toks[j + 1]);
    if (c === 'kill_flags' && aw !== 'blast' && aw !== 'piercing') fail('kill_flags', 'kill_flags takes blast or piercing');
    if (c === 'hit_side' && !SIDES.includes(aw) && !(aw && aw.startsWith('%'))) fail('hit_side', 'hit_side takes a side word (INT-07)');
    j++;
    while (toks[j] && toks[j].t !== '{' && toks[j].t !== '}' && lw(toks[j]) !== 'else') j++;
    return j;
  }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], top = st.length ? st[st.length - 1] : null, parent = top ? top.kind : 'top';
    if (t.t === '(') {
      const hw = lw(toks[i + 1]);
      if (hw === 'mod') { st.push({ ch: '(', kind: parent }); i++; continue; }
      st.push({ ch: '(', kind: hw === 'define' ? 'macro' : 'skip' });
      continue;
    }
    if (t.t === '{') {
      const head = toks[i + 1] && (toks[i + 1].t === 'w' || toks[i + 1].t === 's') ? toks[i + 1] : null, hw = lw(head);
      let kind = 'value';
      if (hw && hw.charAt(0) === '#') kind = 'skip';   // {## ...} is a switched-off block (dummy.inc:278)
      else if (parent === 'skip') kind = 'skip';
      else if (parent === 'top') {
        if (hw === 'entities' || hw === 'effects') kind = 'top';
        else if (head && head.t === 's') kind = 'block';
        else if (hw === 'on') kind = 'handler';
        else fail('block_key', '{' + (hw || '') + ' at the top level');
      } else if (parent === 'block') {
        if (hw === 'on') kind = 'handler';
        else if (!(head && head.t === 's') && !BLOCK_KEYS.has(hw)) fail('block_key', '{' + (hw || '') + ' inside an entity block is not a known key');
      } else if (['macro', 'handler', 'branch', 'timer', 'container'].includes(parent)) {
        if (hw === 'on' && parent === 'macro') kind = 'handler';
        else if (head && head.t === 's') { if (parent === 'macro') kind = 'block'; else fail('action', 'a quoted name where an action goes'); }
        else if (hw && !hw.startsWith('%')) {
          if (!ACT.has(hw)) fail('action', 'unknown action ' + hw);
          if (hw === 'log' || hw === 'rtfunc' || hw === 'kick_entity_manager') fail('noop', hw + ' does nothing in the game (INT-15)');
          if (hw === 'with_effector') {
            // the nearest reaction inside the piece decides; else the piece's events list. A quoted (custom) event is not known.
            let h = null; for (let j = st.length - 1; j >= 0; j--) if (st[j].kind === 'handler') { h = st[j]; break; }
            const carries = e => e === 'custom' || (WORDS.ctxOfEvent[e] || []).includes('instigator');
            const ev = h ? [h.ev] : p.events || [];
            if (!ev.length || ev.some(e => !carries(e))) fail('with_effector', 'with_effector only in a piece limited to events that carry the other unit');
          }
          kind = hw === 'if' ? 'branch' : hw === 'delay' || hw === 'delay_ex' ? 'timer' : CONT.has(hw) ? 'container' : VAL.has(hw) || hw.startsWith('health_damage_') ? 'value' : 'action';
        }
      }
      const fr = { ch: '{', kind };
      st.push(fr);
      if (head) i++;
      if (kind === 'handler') {
        const e = toks[i + 1];
        fr.ev = !e ? '' : e.t === 's' || e.v.startsWith('%') ? 'custom' : e.v.toLowerCase();
        if (!e || e.t !== 'w' && e.t !== 's') fail('event', '{on without an event');
        else if (e.t === 'w' && !e.v.startsWith('%')) {
          const w = e.v.toLowerCase();
          if (terrain ? !TEV.has(w) : !EV.has(w)) fail('event', 'unknown event ' + w);
          if (terrain && w === 'bullet') fail('event', 'a terrain {on bullet} never fires (INT-05)');
        }
      }
      if (kind === 'branch') i = condAt(i + 1) - 1;
      continue;
    }
    if (t.t === '}' || t.t === ')') { const want = t.t === '}' ? '{' : '('; let j = st.length - 1; while (j >= 0 && st[j].ch !== want) j--; if (j >= 0) st.length = j; continue; }
    if (top && top.kind === 'branch' && lw(t) === 'else' && toks[i + 1] && toks[i + 1].t !== '{') i = condAt(i + 1) - 1;
  }
}
function compileDefaults(p) { return P.compile(p, {}).text; }
// rules 1 to 8 and the checker's rules over pieces and rows. rows = { key: [en, ru, uk, zh] }
function contentCheck(pieces, rows, o) {
  const fails = [], warns = [], seen = new Set(), used = new Set();
  const secIds = new Set(SEC.SECTIONS.filter(s => !s.view).map(s => s.id));
  const groupOf = {};
  for (const p of pieces) groupOf[p.id] = p.group || '';
  for (const p of pieces) {
    const id = p && p.id || '?';
    const E = (rule, msg) => fails.push({ id, group: p.group || '', rule, msg }), W = (rule, msg) => warns.push({ id, group: p.group || '', rule, msg });
    if (!/^[a-z0-9][a-z0-9._-]{2,60}$/.test(id)) E('id', 'id does not match ^[a-z0-9][a-z0-9._-]{2,60}$');
    if (seen.has(id)) E('id', 'duplicate id'); seen.add(id);
    if (!secIds.has(p.sec)) E('sec', 'sec ' + p.sec + ' is not a section of the tree');
    if (!Array.isArray(p.kinds) || !p.kinds.length || p.kinds.some(k => !KIND_IDS.includes(k))) E('kinds', 'kinds must be kinds.js rows');
    if (p.notKinds !== undefined && (!Array.isArray(p.notKinds) || p.notKinds.some(k => !KIND_IDS.includes(k)))) E('kinds', 'notKinds must be a list of kinds.js rows');
    if (!Array.isArray(p.scope) || !p.scope.length || p.scope.some(k => !SCOPES.includes(k))) E('scope', 'scope must be a list of ' + SCOPES.join('|'));
    if (p.events !== undefined && (!Array.isArray(p.events) || !p.events.length || p.events.some(e => !(WORDS.events.includes(e) || e === 'custom')))) E('events', 'events must be engine event words or custom: ' + JSON.stringify(p.events));
    if (!ROLES.includes(p.role)) E('role', 'role must be one of ' + ROLES.join('|'));
    if (!['V', 'I', 'T'].includes(p.tag)) E('tag', 'tag must be V, I or T');
    if ((p.tag === 'V' || p.tag === 'I') && !(typeof p.src === 'string' && p.src)) E('src', 'tag ' + p.tag + ' needs a src cite');
    if (p.src && p.tag !== 'T' && !/^set\/[a-z0-9_\/.-]+:\d+(-\d+)?$/.test(p.src)) E('src', 'src is not of the form set/<path>:<line>[-<line>]: ' + p.src);
    if (p.short && p.tag !== 'V') E('short', 'short:true only on tag V');
    if (!Array.isArray(p.needs)) E('needs', 'needs must be a list');
    if (!Array.isArray(p.lim)) E('lim', 'lim must be a list');
    for (const l of p.lim || []) { if (!/^[A-Z][A-Z0-9]*-\d+$/.test(l)) E('lim', 'lim id format: ' + l); else if (LIMIDS.size && !LIMIDS.has(l)) E('lim', 'lim id ' + l + ' is not a row of limits/'); }
    if (typeof p.adv !== 'boolean') E('adv', 'adv must be true or false');
    if (p.tag === 'T' && p.adv !== true) E('adv', 'a T piece must have adv:true');
    if (p.sec && /^ia\.adv/.test(p.sec) && p.adv !== true) E('adv', 'a piece of the Advanced section must have adv:true');
    if (p.wrap !== false) E('wrap', 'wrap must be false in v1');
    if (p.task !== null) E('task', 'task must be null in v1');
    if (typeof p.code !== 'string' || !p.code.trim()) { E('code', 'no code'); continue; }
    const c = p.code, f = p.f || {};
    if (/[^\x09\x0a\x20-\x7e]/.test(c)) E('ascii', 'code is not ASCII (or has CR)');
    if (/\$\{|`/.test(c)) E('code', 'code has a dollar-brace or a backtick');
    if (c.split('\n').some(l => /^ +\S/.test(l))) E('code', 'code is indented with spaces (tabs wanted)');
    if (/\n$/.test(c)) E('code', 'code ends with a line end');
    if (/;/.test(c.replace(/"[^"\n]*"/g, '""')) && id !== 'a.sdl.comment') E('semicolon', 'code has a ; comment');
    // rand, user_control and user_squad can differ between the machines of a network game: the watch-out says so
    if (RE_NETCODE.test(c)) {
      const wr = rows['ide.kit.p.' + id + '.w'];
      if (!wr) E('network', 'code uses ' + RE_NETCODE.exec(c)[1] + ': a watch-out row (.w) with "Not tried in a network game." is wanted');
      else for (let i = 0; i < 4; i++) if (String(wr[i] == null ? '' : wr[i]).toLowerCase().indexOf(NET[i]) < 0) E('network', ['en', 'ru', 'uk', 'zh'][i] + ' watch-out lacks "' + NET[i] + '" (code uses ' + RE_NETCODE.exec(c)[1] + ')');
    }
    const names = [], re = /@(\^|[a-z][a-z0-9_]{0,23}|)@/g; let m, carets = 0;
    while ((m = re.exec(c))) { if (m[1] === '^') carets++; else if (m[1]) names.push(m[1]); }
    if (/@/.test(c.replace(re, ''))) E('marker', 'stray @ in code (write @@ for a literal one)');
    if (carets > 1) E('caret', 'more than one @^@');
    if ((p.role === 'event' || p.role === 'cond' || p.wrap) && carets !== 1) E('caret', 'an event or check piece needs one @^@');
    if (carets && !c.split('\n').some(l => /^\t*@\^@$/.test(l))) E('caret', '@^@ must stand alone on its own line');
    for (const n of names) if (!f[n]) E('field', 'marker @' + n + '@ has no field');
    if (new Set(names).size !== names.length) E('field', 'a field name is used twice (mirrors come in v1.1)');
    for (const n of Object.keys(f)) {
      const d = f[n];
      if (!names.includes(n)) E('field', 'field ' + n + ' is not used in code');
      if (!/^[a-z][a-z0-9_]{0,23}$/.test(n)) E('field', 'field name ' + n);
      if (!d || !FK.includes(d.k)) { E('field', 'field ' + n + ' kind ' + (d && d.k)); continue; }
      if (typeof d.def !== 'string') { E('default', 'field ' + n + ' default must be a string'); continue; }
      if (/"/.test(d.def) && !['choice', 'code', 'list'].includes(d.k)) E('default', 'field ' + n + ' default holds a quote');
      if (NUMK.includes(d.k) && !/^-?\d+(\.\d+)?$/.test(d.def)) E('number', 'field ' + n + ' default is not a number: ' + d.def);
      if (d.k === 'chance' && !(+d.def > 0 && +d.def <= 1)) E('number', 'field ' + n + ' chance default must be above 0 and at most 1');
      if (NUMK.includes(d.k) && typeof d.min === 'number' && +d.def < d.min) E('number', 'field ' + n + ' default below min');
      if (NUMK.includes(d.k) && typeof d.max === 'number' && +d.def > d.max) E('number', 'field ' + n + ' default above max');
      if (NUMK.includes(d.k) && d.int && !/^-?\d+$/.test(d.def)) E('number', 'field ' + n + ' default is not a whole number');
      if (NAMEK.includes(d.k) && !/^[A-Za-z0-9_]+$/.test(d.def)) E('default', 'field ' + n + ' (' + d.k + ') default must be a plain name: ' + d.def);
      if (d.k === 'tags' && d.def !== 'my_unit') E('tags', 'field ' + n + ' (tags) default must be my_unit');
      if (d.k === 'choice' && !(Array.isArray(d.choices) && d.choices.length > 1 && d.choices.includes(d.def))) E('choice', 'field ' + n + ' choice needs choices[] that hold the default');
      if (!['code', 'list', 'comment', 'text', 'choice'].includes(d.k) && /[{}();]/.test(d.def)) E('default', 'field ' + n + ' default holds a brace, paren or ;');
    }
    if (p.role === 'event') { if (typeof p.event !== 'string' || !p.event) E('event', 'an event piece needs event'); else if (!c.includes('{on ' + p.event)) E('event', 'event "' + p.event + '" is not the head of the {on line'); }
    const text = compileDefaults(p), b = balance(text);
    if (b) { E('balance', 'braces after filling the defaults: ' + b); }
    else {
      const ia = p.kinds.some(k => /^ia-/.test(k));
      // the sdl pieces are offered in interaction files too (catalog ia-entity), so they are checked as interaction code;
      // every listed scope, not only the first
      if (ia || (p.kinds.includes('sdl') && !(p.notKinds || []).includes('ia-entity'))) for (const sc of p.scope) tokCheck(wrap(text, sc, p), p, (rule, msg) => E(rule, msg + ' (in a ' + sc + ' fixture)'));
      const key = ia ? 'resource/set/interaction_entity/kit_test.inc' : 'resource/set/kit_test.set';
      for (const sc of p.scope) {
        let res; try { res = check({ text: wrap(text, sc, p), key }, {}); } catch (e) { res = [{ sev: 'error', code: 'CRASH', msg: e.message }]; }
        for (const x of res.filter(x => x.sev === 'error' || x.sev === 'warn')) E('check', 'check finding in a ' + sc + ' fixture: ' + x.code + ' ' + x.msg + ' (line ' + x.line + ')');
        if (o && o.game) {
          try { res = check({ text: wrap(text, sc, p), key }, { gameDir: o.game }); } catch (e) { res = [{ sev: 'error', code: 'CRASH', msg: e.message }]; }
          // a define or include whose name is a field the user fills (a.sdl.macro "speed", an include of "mymod.inc") cannot exist yet
          const userName = x => (x.code === 'MACRO_UNDEFINED' || x.code === 'INCLUDE_MISSING') && Object.keys(f).some(n => f[n] && f[n].def && String(x.msg).indexOf('"' + f[n].def + '"') >= 0);
          for (const x of res.filter(x => x.sev === 'error' && !userName(x))) E('check', 'check finding with the game in a ' + sc + ' fixture: ' + x.code + ' ' + x.msg + ' (line ' + x.line + ')');
        }
        if (o && o.oneScope) break;
      }
    }
    for (const suf of ['', '.d']) { const k = 'ide.kit.p.' + id + suf; if (!rows[k]) E('lang', 'lang row missing: ' + k); used.add(k); }
    for (const suf of ['.w', '.n']) used.add('ide.kit.p.' + id + suf);
    for (const n of Object.keys(f)) { used.add('ide.kit.p.' + id + '.f.' + n); used.add('ide.kit.p.' + id + '.f.' + n + '.h'); }
    const ti = rows['ide.kit.p.' + id];
    if (ti) {
      const w = String(ti[0]).split(/\s+/).slice(1).filter(x => /^[A-Z][a-z]+$/.test(x));
      if (w.length > 1) W('title', 'title looks like Title Case: ' + ti[0]);
      for (let i = 0; i < 4; i++) if (String(ti[i] == null ? '' : ti[i]).length > 48) W('title', ['en', 'ru', 'uk', 'zh'][i] + ' title is long (' + String(ti[i]).length + ' characters, at most 48): ' + ti[i]);
      for (let i = 0; i < 4; i++) if (RE_STOP.test(ti[i] || '')) { E('title', 'title ends with a full stop'); break; }
    }
  }
  // rows
  if (o && o.common) {
    for (const s of SEC.SECTIONS) used.add('ide.kit.s.' + s.id);
    for (const k of KIND_IDS) used.add('ide.kit.k.' + k);
    for (const k of FK) used.add('ide.kit.fk.' + k);
  }
  const same = { 1: [], 2: [], 3: [] };
  for (const k of Object.keys(rows)) {
    const r = rows[k], pid = (/^ide\.kit\.p\.(.+?)(\.d|\.w|\.n|\.f\..*)?$/.exec(k) || [])[1];
    const g = pid && groupOf[pid] !== undefined ? groupOf[pid] : /^ide\.kit\.(s|k|fk)\./.test(k) ? 'common' : '';
    for (const [rule, msg] of rowFaults([k].concat(r))) fails.push({ id: k, group: g, rule, msg });
    if (!used.has(k)) fails.push({ id: k, group: g, rule: 'unused', msg: 'row belongs to no piece, field, section, kind or field kind' });
    for (let i = 1; i < 4; i++) if (r[i] && r[i] === r[0]) same[i].push(k);
  }
  for (let i = 1; i < 4; i++) if (same[i].length > 6) fails.push({ id: 'lang', group: '', rule: 'identical', msg: ['', 'ru', 'uk', 'zh'][i] + ': ' + same[i].length + ' values identical to English (at most 6): ' + same[i].slice(0, 12).join(', ') });
  return { fails, warns };
}
// rule 9: ialint over a scratch mod with every ia piece in its own block -> [{ id, rule, msg }]
// With a game: ialint reads through the game (gameDir) and the scratch entity.set is the game's own plus the kit include, so the
// game's reactions count for INT_CALL_UNDEFINED. Without a game INT_CALL_UNDEFINED is not judged (it needs the game's reactions).
function ialintCase(pieces, dir, game) {
  const out = [], lines = ['; kit test: every interaction piece in its own block'], at = [];
  const ia = pieces.filter(p => p.kinds && p.kinds.includes('ia-entity') && typeof p.code === 'string');
  ia.forEach((p, n) => {
    let text; try { text = compileDefaults(p); } catch (e) { return; }
    if (balance(text) || /^\s*\{entities\b/.test(text)) return;
    const sc = p.scope[0];
    const w = sc === 'top' ? text : wrap(text, sc, p).replace('{"kit_test"', '{"kit_' + n + '"').replace(/\n$/, '');
    const from = lines.length + 1;
    for (const l of w.split('\n')) lines.push(l);
    at.push({ id: p.id, group: p.group || '', from, to: lines.length });
  });
  const ent = path.join(dir, 'resource', 'set', 'interaction_entity');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(ent, { recursive: true });
  let set = '{entities\r\n\t(include "kit.inc")\r\n}\r\n', files = null;
  if (game) { try { files = WORDS.gameFiles(game); } catch (e) { files = null; } }
  const van = files && files.get('set/interaction_entity/entity.set');
  if (van) { const k = van.lastIndexOf('}'); set = van.slice(0, k) + '\t(include "kit.inc")\r\n' + van.slice(k); }
  fs.writeFileSync(path.join(ent, 'entity.set'), set, 'latin1');
  fs.writeFileSync(path.join(ent, 'kit.inc'), lines.join('\r\n') + '\r\n');
  const { rep } = IALINT.check(van ? { folder: dir, gameDir: game } : { folder: dir });
  const j = rep.toJSON({ tool: 'ialint' });
  for (const f of j.findings) {
    if (f.severity !== 'error' || !/^INT_/.test(f.code)) continue;
    if (!van && f.code === 'INT_CALL_UNDEFINED') continue;
    if (!/kit\.inc$/.test(String(f.file).replace(/\\/g, '/'))) continue;   // the game's own files (copied into entity.set) are not the kit's
    const a = /kit\.inc$/.test(String(f.file).replace(/\\/g, '/')) ? at.find(x => f.line >= x.from && f.line <= x.to) : null;
    out.push({ id: a ? a.id : 'all', group: a ? a.group : '', rule: 'ialint', msg: f.code + ' ' + f.msg });
  }
  return out;
}

// every piece through the planner: each listed scope and each listed event (spawn when none; the sdl pieces as the
// ia-entity catalog offers them), defaults, into a host with one empty line at the place -> [{ id, group, rule, msg }].
// Wanted: no refusal; on the piece's own events (not inside a delay, where the warning is the point) no w.noCtx or
// w.delay; the text after the edits is balanced; the caret, when there is one, lies on an inserted line.
function hostFor(scope, ev) {
  if (scope === 'top') return { text: '', gap: 1 };
  if (scope === 'block') return { text: '{"kit_host"\n\t\n}', gap: 2 };
  const h = '{"kit_host"\n\t{on ' + ev + '\n';
  if (scope === 'handler') return { text: h + '\t\t\n\t}\n}', gap: 3 };
  const head = scope === 'branch' ? '{if rand 0.5' : scope === 'timer' ? '{delay 1' : '{spawn "kit_fx"';
  return { text: h + '\t\t' + head + '\n\t\t\t\n\t\t}\n\t}\n}', gap: 4 };
}
function planContent(pieces) {
  const out = [];
  for (const p of pieces) {
    if (!p || typeof p.code !== 'string' || !Array.isArray(p.scope)) continue;
    const E = (rule, msg) => out.push({ id: p.id, group: p.group || '', rule, msg });
    const evs = p.events && p.events.length ? p.events : [null];
    for (const sc of p.scope) for (const e of evs) {
      const hs = hostFor(sc, e ? (EVFORM[e] || e) : 'spawn'), where = sc + (e ? ' ' + e : '');
      const kk = (p.notKinds || []).includes('ia-entity') ? 'sdl' : 'ia-entity';
      const r = P.plan(srcOf(hs.text), { gap: hs.gap }, p, {}, { kitKind: kk, editable: true, ver: 1 });
      if (r.refuse) { E('plan', 'refused in its own place (' + where + '): ' + JSON.stringify(r.refuse)); continue; }
      const bad = r.warn.filter(w => w.k === 'ide.kit.w.noCtx' || w.k === 'ide.kit.w.delay');
      if (e && sc !== 'timer' && bad.length) E('plan', 'warned in its own event (' + where + '): ' + JSON.stringify(bad));
      let txt; try { txt = FIX.apply(hs.text, r.edits); } catch (x) { E('plan', 'edits do not apply (' + where + '): ' + x.message); continue; }
      const b = balance(txt);
      if (b) E('plan', 'braces after the insert (' + where + '): ' + b);
      if (r.caret && !(r.caret.line >= r.from && r.caret.line <= r.to)) E('plan', 'caret outside the inserted lines (' + where + ')');
    }
  }
  return out;
}

// ---- round 2 content checks (the build contract, its logic copied here; the contract
// rows are copied to fx/kit/assign2.json: nothing under is read) -> [{ group, no, id, what }]
const KINDS2 = ['ia-entity', 'ia-terrain', 'mi', 'mapinfo', 'lng', 'entity-def', 'props', 'breed', 'stuff', 'sdl'];
const IGNORE_SDLX = new Set(['INCLUDE_MISSING', 'MACRO_UNDEFINED', 'UNREPLACED_PARAM']);
const sdlx = require('../../lib/sdlx');
function balanced2(code) {
  // braces and parens outside "strings" and ; comments (check-group.js)
  let d = 0, q = false;
  for (const line of code.split('\n')) {
    q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') q = false; continue; }
      if (c === '"') { q = true; continue; }
      if (c === ';') break;
      if (c === '{' || c === '(') d++;
      else if (c === '}' || c === ')') { d--; if (d < 0) return false; }
    }
    if (q) return false;
  }
  return d === 0;
}
function r2Contract(g, mod, rows, want) {
  const out = [], F = (no, id, what) => out.push({ group: g, no, id, what });
  if (!mod || mod.group !== g || !Array.isArray(mod.pieces)) { F(0, '', 'pieces file is not { group, pieces }'); return out; }
  if (!Array.isArray(rows)) { F(0, '', 'lang file is not a list'); rows = []; }
  const R = {};
  for (const r of rows) { if (!Array.isArray(r) || r.length !== 5) { F(0, '', 'lang row is not [key,en,ru,uk,zh]: ' + JSON.stringify(r).slice(0, 80)); continue; } if (R[r[0]]) F(0, r[0], 'lang key twice: ' + r[0]); R[r[0]] = r; }
  const byNo = {}; mod.pieces.forEach(p => { if (p) byNo[p.no] = p; });
  const secIds = new Set(SEC.SECTIONS.filter(s => !s.view).map(s => s.id));
  for (const w of want) {
    const p = byNo[w.no], E = what => F(w.no, w.id, what);
    if (!p) { E('piece is missing'); continue; }
    if (p.id !== w.id) E('id is ' + p.id);
    if (p.sec !== w.sec && p.sec !== 'sdl.files') E('sec is ' + p.sec + ', contract says ' + w.sec);
    if (!secIds.has(p.sec)) E('sec ' + p.sec + ' is not a section of the tree');
    if (p.size !== w.size && !(w.outline && p.size === 'large')) E('size is ' + p.size);
    if (['V', 'I', 'T'].indexOf(p.tag) < 0) E('bad tag');
    if (p.tag === 'T' && p.adv !== true) E('a T piece must have adv:true');
    if (/^mi\.adv/.test(String(p.sec)) && p.adv !== true) E('a piece of mi.adv must have adv:true');
    if (!Array.isArray(p.kinds) || !p.kinds.length || p.kinds.some(k => KINDS2.indexOf(k) < 0)) { E('bad kinds ' + JSON.stringify(p.kinds)); continue; }
    // the catalog lists a piece only where its section's top lists its kind (sdl pieces: an sdl section)
    const top = SEC.topOf(p.sec);
    if (top && !p.kinds.some(k => top.kinds.indexOf(k) >= 0 || (k === 'sdl' && /^sdl\./.test(top.id)))) E('section ' + p.sec + ' is not listed for kinds ' + p.kinds.join(','));
    if (ROLES.indexOf(p.role) < 0) E('bad role ' + p.role);
    if (!Array.isArray(p.scope) || !p.scope.length) E('no scope');
    else if (p.kinds[0] === 'ia-entity') { if (p.scope.some(s => SCOPES.indexOf(s) < 0)) E('interaction scope must be of ' + SCOPES.join(' ')); }
    else if (p.scope.some(s => !/^(top|any|empty|in:(\*|[a-z_][a-z0-9_]*))$/.test(s))) E('bad scope ' + JSON.stringify(p.scope));
    if (p.whole && (!Array.isArray(p.scope) || p.scope.length !== 1 || p.scope[0] !== 'empty')) E('a whole-file piece has scope ["empty"]');
    if (Array.isArray(p.scope) && p.scope.includes('empty') && p.whole !== true) E('scope empty without whole:true');
    if (w.mp && p.mp !== w.mp && ['yes', 'no', 'unknown'].indexOf(p.mp) < 0) E('mp missing');
    if (p.mp !== undefined && ['yes', 'no', 'unknown'].indexOf(p.mp) < 0) E('mp must be yes, no or unknown');
    if (typeof p.src !== 'string' || (!p.src && fs.existsSync(path.join(ROOT, 'limits')))) E('no src');
    if (!Array.isArray(p.needs) || !Array.isArray(p.lim)) E('needs and lim are lists');
    const code = p.code;
    if (typeof code !== 'string' || !code) { E('no code'); continue; }
    if (/[^\x09\x0a\x20-\x7e]/.test(code)) E('code is not ASCII with tabs and \\n');
    if (code.indexOf('$' + '{') >= 0) E('code holds a dollar-brace');
    if (/^ +\S/m.test(code)) E('code is indented with spaces (use tabs)');
    const plain = code.replace(/@@/g, '');
    const mk = plain.match(/@[A-Za-z0-9_^]*@/g) || [];
    if ((plain.replace(/@[A-Za-z0-9_^]*@/g, '')).indexOf('@') >= 0) E('a stray @ (write @@ for a literal one)');
    const f = p.f || {}, usedF = new Set();
    let carets = 0;
    for (const m of mk) { const n = m.slice(1, -1); if (n === '^') carets++; else if (!f[n]) E('fill-in ' + m + ' has no field'); else usedF.add(n); }
    if (carets > 1) E('more than one @^@');
    for (const n of Object.keys(f)) {
      if (!usedF.has(n)) E('field ' + n + ' is not in the code');
      if (!f[n] || typeof f[n].k !== 'string' || f[n].def == null || String(f[n].def) === '') E('field ' + n + ' needs k and a default');
      else if (!FK.includes(f[n].k)) E('field ' + n + ' kind ' + f[n].k + ' is not a field kind of lang/common.js');
    }
    let filled = plain.replace(/@\^@/g, '');
    for (const n of Object.keys(f)) filled = filled.split('@' + n + '@').join(String(f[n] && f[n].def));
    if (!balanced2(filled)) E('braces, parens or quotes do not balance with the defaults filled in');
    for (const suf of ['', '.d']) {
      const r = R['ide.kit.p.' + p.id + suf];
      if (!r) E('lang row ide.kit.p.' + p.id + suf + ' is missing');
      else for (let i = 1; i < 5; i++) if (typeof r[i] !== 'string' || !r[i].trim()) E('lang row ' + r[0] + ' is empty in ' + ['', 'en', 'ru', 'uk', 'zh'][i]);
    }
    for (const n of Object.keys(f)) {
      const r = R['ide.kit.p.' + p.id + '.f.' + n];
      if (r) for (let i = 1; i < 5; i++) if (!String(r[i] || '').trim()) E('field label ' + n + ' is empty in a language');
    }
  }
  for (const p of mod.pieces) if (p && !want.some(w => w.no === p.no)) F(p.no || 0, p.id || '', 'piece ' + p.id + ' (no ' + p.no + ') is not of this group');
  for (const k of Object.keys(R)) { if (!mod.pieces.some(p => p && (k === 'ide.kit.p.' + p.id || k.indexOf('ide.kit.p.' + p.id + '.') === 0))) F(0, k, 'lang key of no piece here: ' + k); }
  return out;
}
// a minimal legal place for one scope token of a round 2 piece: { text, gap } (the new lines go before line gap) or null
function r2Host(tok) {
  if (tok === 'top' || tok === 'any' || tok === 'empty') return { text: '', gap: 1 };
  if (tok === 'in:*') return { text: '{"kit_name"\n\t\n}\n', gap: 2 };
  const m = /^in:([a-z_][a-z0-9_]*)$/.exec(tok);
  if (!m) return null;
  if (m[1] === 'define') return { text: '(define "kit_define"\n\t\n)\n', gap: 2 };
  // the engine sets only mp, coop, game:<map> and dl_<difficulty> (lib/sdlx MOD_NAME)
  if (m[1] === 'mod') return { text: '(mod "mp"\n\t\n)\n', gap: 2 };
  if (m[1] === 'on') return { text: '{on hit\n\t\n}\n', gap: 2 };
  return { text: '{' + m[1] + '\n\t\n}\n', gap: 2 };
}
const EXT_OF = { 'ia-entity': 'inc', 'ia-terrain': 'inc', mi: 'mi', mapinfo: 'info', lng: 'lng', 'entity-def': 'def', props: 'ext', breed: 'set', stuff: 'set', sdl: 'set' };
// plan every round 2 piece into a host made for each of its places; the text after the edits balances and parses
// with lib/sdlx (the reader of intel/check.js) -> [{ group, no, id, what }]
function r2Plan(p) {
  const out = [], E = what => out.push({ group: p.group || '', no: p.no || 0, id: p.id, what });
  if (!p || typeof p.code !== 'string' || !Array.isArray(p.scope) || !Array.isArray(p.kinds) || !p.kinds.length) { E('no code, scope or kinds'); return out; }
  const kks = p.kinds.filter(k => KINDS2.includes(k));
  if (!kks.length) { E('no kind to plan in'); return out; }
  for (const kk of kks) {
    const hosts = [];
    if (p.whole) hosts.push(['empty', { text: '', gap: 1 }]);
    else if (kk === 'ia-entity') {
      for (const sc of p.scope) for (const e of (p.events && p.events.length ? p.events : [null])) hosts.push([sc + (e ? ' ' + e : ''), hostFor(sc, e ? (EVFORM[e] || e) : 'spawn')]);
    } else for (const sc of p.scope) hosts.push([sc, r2Host(sc)]);
    for (const [where, hs] of hosts) {
      if (!hs) { E('no fixture for scope ' + where + ' (kind ' + kk + ')'); continue; }
      const r = P.plan(srcOf(hs.text), { gap: hs.gap }, p, {}, { kitKind: kk, editable: true, ver: 1, rel: kk === 'mi' ? 'map/single/kit_test/kit.mi' : undefined });
      if (r.refuse) { E('refused in its own place (' + kk + ' ' + where + '): ' + JSON.stringify(r.refuse)); continue; }
      let txt; try { txt = FIX.apply(hs.text, r.edits); } catch (x) { E('edits do not apply (' + kk + ' ' + where + '): ' + x.message); continue; }
      const b = balance(txt);
      if (b) { E('braces after the insert (' + kk + ' ' + where + '): ' + b); continue; }
      if (r.caret && !(r.caret.line >= r.from && r.caret.line <= r.to)) E('caret outside the inserted lines (' + kk + ' ' + where + ')');
      const errs = [];
      try {
        sdlx.read(Buffer.from(txt, 'latin1'), { file: 'kit_test', key: 'resource/kit_test.' + (EXT_OF[kk] || 'set'), open: () => null, preInclude: [],
          // as intel/check.js on one buffer: a %param of a define body is filled by the caller (UNREPLACED_PARAM, ARITH_BAD on a %param)
          onError: (file, line, code, msg) => { if (!IGNORE_SDLX.has(code) && !(code === 'ARITH_BAD' && /%/.test(msg))) errs.push(code + ' ' + msg + ' (line ' + line + ')'); } });
      } catch (x) { errs.push('CRASH ' + x.message); }
      if (errs.length) E('parse (lib/sdlx) in ' + kk + ' ' + where + ': ' + errs.slice(0, 3).join('; '));
    }
  }
  return out;
}

// real pieces at real places (review round 1): each case failed on the pieces as they were before that round
// -> [{ id, group, rule:'plan-case', msg }]
function planCases(pieces) {
  const out = [], byId = id => pieces.find(p => p.id === id);
  const hostIn = (ev, inner) => '{"my_unit"\n\t{on ' + ev + '\n' + (inner ? '\t\t{' + inner + '\n\t\t\t{set "x" 1}\n\t\t}' : '\t\t{set "x" 1}') + '\n\t}\n}';
  const cases = [
    // a check right in a delay body: the game's own form (tank.inc:75-76), allowed with the warnings of the place
    ['b.if.flag', hostIn('spawn', 'delay 2'), 4, 'ia-entity', r => r.refuse === null, 'fits a {delay} body'],
    ['b.if.stuff', hostIn('bullet_hit', 'delay 2'), 4, 'ia-entity', r => r.refuse === null && r.warn.some(w => w.k === 'ide.kit.w.delay'), 'in a delay of {on bullet_hit}: added with ide.kit.w.delay'],
    ['b.if.inline', hostIn('spawn', 'if rand 0.5'), 4, 'ia-entity', r => r.refuse === null, 'fits an {if} branch'],
    // checks whose default needs what the reaction carries are offered only where it carries it
    ['b.if.name', hostIn('spawn'), 3, 'ia-entity', r => r.refuse && r.refuse.k === 'ide.kit.x.scope', 'refused in {on spawn} (no sender there)'],
    ['b.if.name_any', hostIn('spawn'), 3, 'ia-entity', r => r.refuse && r.refuse.k === 'ide.kit.x.scope', 'refused in {on spawn} (no sender there)'],
    ['b.if.min_speed', hostIn('spawn'), 3, 'ia-entity', r => r.refuse && r.refuse.k === 'ide.kit.x.scope', 'refused in {on spawn} (no value there)'],
    ['b.if.else_check', hostIn('spawn'), 3, 'ia-entity', r => r.refuse === null && !r.warn.some(w => w.k === 'ide.kit.w.noCtx' || w.k === 'ide.kit.w.delay'), 'in {on spawn}: no context warning with its defaults'],
    ['b.if.both', hostIn('spawn'), 3, 'ia-entity', r => r.refuse === null && !r.warn.some(w => w.k === 'ide.kit.w.noCtx' || w.k === 'ide.kit.w.delay'), 'in {on spawn}: no context warning with its defaults'],
    ['b.if.either', hostIn('spawn'), 3, 'ia-entity', r => r.refuse === null && !r.warn.some(w => w.k === 'ide.kit.w.noCtx' || w.k === 'ide.kit.w.delay'), 'in {on spawn}: no context warning with its defaults'],
    ['b.if.effector', hostIn('blow opponent'), 3, 'ia-entity', r => r.refuse === null, 'fits {on blow opponent} (blow carries the other unit)'],
    // in a (define ...) body the event is the caller's: the game's damage helpers test stuff and volume there (cannon.inc:16-18)
    ['b.if.stuff', '(define "d"\n\t{if stuff "%0"\n\t\t\n\t}\n)', 3, 'ia-entity', r => r.refuse === null, 'in an {if} of a define body: not refused'],
    ['b.if.volume', '(define "d"\n\t{set "a" 1}\n\t\n)', 3, 'ia-entity', r => r.refuse === null, 'in a define body of actions: not refused'],
    // a reaction of your own: a delay drops the command there too (ialint INT_DELAY_CTX_LOST)
    ['b.if.volume', hostIn('"kit_event"', 'delay 2'), 4, 'ia-entity', r => r.refuse === null && r.warn.some(w => w.k === 'ide.kit.w.delay'), 'in a delay of {on "kit_event"}: added with ide.kit.w.delay'],
    ['b.if.effector', hostIn('board in', 'delay_ex 2'), 4, 'ia-entity', r => r.refuse === null && r.warn.some(w => w.k === 'ide.kit.w.delay'), 'in a delay_ex of {on board in}: added with ide.kit.w.delay'],
    // the game's own uses: a name check in {on board out} (human.inc:724-726), bullet_detonate in break_armor (explosive.inc:265-268)
    ['b.if.name', hostIn('board out', 'if effector "mtb_d3"'), 4, 'ia-entity', r => r.refuse === null, 'fits {on board out} (human.inc:724-726)'],
    ['b.if.name_any', hostIn('board out', 'if effector "mtb_d3"'), 4, 'ia-entity', r => r.refuse === null, 'fits {on board out} (human.inc:724-726)'],
    ['b.act.bullet_detonate', hostIn('break_armor', 'if name "pierce"'), 4, 'ia-entity', r => r.refuse === null, 'fits {on break_armor} (explosive.inc:265-268)'],
    ['b.act.bullet_detonate', hostIn('spawn'), 3, 'ia-entity', r => r.refuse && r.refuse.k === 'ide.kit.x.scope', 'refused in {on spawn} (no bullet there)'],
    // a define and its call land at the caret inside a .def block, not after it
    ['n.sdl.define', '{game_entity\n\t{speed 10}\n\t{mass 5}\n}', 3, 'entity-def', r => r.refuse === null && r.from === 3 && !r.warn.some(w => w.k === 'ide.kit.addedAfter'), 'in a .def block: lands at the caret with no addedAfter']
  ];
  for (const [id, text, gap, kk, want, what] of cases) {
    const p = byId(id);
    if (!p) { out.push({ id, group: '', rule: 'plan-case', msg: 'piece is missing' }); continue; }
    const r = P.plan(srcOf(text), { gap }, p, {}, { kitKind: kk, editable: true, ver: 1 });
    if (!want(r)) out.push({ id, group: p.group || '', rule: 'plan-case', msg: what + ': got ' + JSON.stringify({ refuse: r.refuse, warn: r.warn, from: r.from }) });
  }
  let ids = []; try { ids = INDEX.catalog('ia-entity', 'en', {}).pieces.map(p => p.id); } catch (e) { out.push({ id: 'catalog', group: '', rule: 'plan-case', msg: 'catalog ia-entity throws: ' + e.message }); }
  for (const id of ['a.sdl.macro', 'n.sdl.define']) if (ids.includes(id)) out.push({ id, group: 'sdl', rule: 'plan-case', msg: 'catalog ia-entity offers it (stuff-file code with no interaction form)' });
  return out;
}
// fits(src, scopeAt answer, piece, opts) against plan(): over every line of the fixture hosts, for every piece of the
// catalog of the host's kind, fits() true <=> plan() does not refuse with x.scope -> [{ id, group, rule:'fits', msg }]
const FITS_HOSTS = [
  ['tabs.inc', 'ia-entity'], ['scope.inc', 'ia-entity'], ['dup.inc', 'ia-entity'], ['mixed.inc', 'ia-entity'], ['names.inc', 'ia-entity'],
  ['inline:frag', 'ia-entity', '{on pierce\n\t{call "x"}\n}\n\n{on contact\n\t{if rand 0.5\n\t\t{set "a" 1}\n\t}\n}\n(mod "mp"\n\t{on spawn\n\t}\n\n)\n'],
  ['inline:defines', 'ia-entity', '(define "x"\n\t{on pierce}\n\n)\n(define "y"\n\t{view start %0}\n\n)\n(define "z"\n\n)\n(define "w"\n\t{"%0"\n\t}\n\n)\n{"t"\n\t{inflammation_time\n\t\t5\n\t}\n\t{on spawn\n\t\t(mod "mp"\n\t\t\t{x}\n\t\t)\n\t\t{delay_ex 1\n\t\t\t\n\t\t}\n\t}\n}\n'],
  ['inline:def', 'entity-def', '{game_entity\n\t{speed 10}\n\t{extension "x"\n\n\t}\n}\n'],
  ['inline:terrain', 'ia-terrain', '{effects\n\t{"sand"\n\t\t{"hit"\n\t\t\t{on hit\n\t\t\t\t\n\t\t\t}\n\t\t\t{if rand 0.5\n\t\t\t}\n\t\t}\n\t}\n}\n'],
  // round 2 kinds: the generic scope (innermost block and its head; strings and ; comments skipped)
  ['inline:mi', 'mi', '; kit\n{mission\n\t{Human "a" 0xd000\n\t\t{Position 0 0}\n\t}\n\t; {Human "b"\n\t{"trig"\n\t\t\n\t}\n\n}\n(define "kit_h"\n\t\n)\n'],
  ['inline:empty-mi', 'mi', '; only a note\n\n'],
  ['inline:mapinfo', 'mapinfo', ';SDL\n{game\n\t{maxPlayers 4}\n\n}\n'],
  ['inline:entdef', 'entity-def', '(include "/properties/tank.ext")\n{game_entity\n\t{extension "x"\n\n\t}\n\t{mass 10}\n\n}\n{actor\n\t\n}\n'],
  ['inline:props', 'props', '{game_entity\n\t{weaponry\n\t\t\n\t}\n}\n'],
  ['inline:breed', 'breed', '{breed\n\t{armors\n\t\t\n\t}\n\n}\n'],
  ['inline:stuff', 'stuff', '{from "x"}\n{item\n\t\n}\n'],
  ['inline:lng', 'lng', '{tags\n\t{"a" "b"}\n\n}\n']
];
// The kind is not fits()' question: only pieces the planner takes for the host's kind are tried. Whether plan() refuses
// with x.scope depends on a piece's scope and events only, so one piece per scope and events pair is enough.
// fitsFn = the function under test (default P.fits; a seeded case passes a faulty copy).
function fitsAgree(pieces, fitsFn) {
  const out = [], seen = {}, fit = fitsFn || P.fits;
  for (const [name, kk, inline] of FITS_HOSTS) {
    const text = inline !== undefined ? inline : read(name), src = srcOf(text), cache = {}, shape = {};
    const ps = pieces.filter(p => {
      if (!p || !Array.isArray(p.scope)) return false;
      const k = p.kinds || [];
      if ((p.notKinds || []).includes(kk) || !(k.includes(kk) || (k.includes('sdl') && kk !== 'bot-lua'))) return false;
      const key = JSON.stringify([p.scope, p.events || null, !!p.whole]);
      if (shape[key]) return false;
      return (shape[key] = true);
    });
    for (let g = 1; g <= src.count + 1; g++) {
      const s = P.scopeAt(src, g, cache);
      for (const p of ps) {
        const f = fit(src, s, p, { kitKind: kk, cache }), r = P.plan(src, { gap: g }, p, {}, { kitKind: kk, editable: true, ver: 1, cache });
        // round 2: a whole-file piece in a file with text (x.whole) is a place refusal too
        const refusedScope = !!(r.refuse && (r.refuse.k === 'ide.kit.x.scope' || r.refuse.k === 'ide.kit.x.whole'));
        if (f === refusedScope && !seen[p.id + name]) {
          seen[p.id + name] = 1;
          out.push({ id: p.id, group: p.group || '', rule: 'fits', msg: name + ' line ' + g + ': fits() says ' + f + ', plan() ' + (r.refuse ? 'refuses ' + r.refuse.k : 'adds it') });
        }
      }
    }
  }
  return out;
}

// =====================================================================================================================
// CORE
// ---- A. the two page functions are self-contained ES5
for (const [name, fn] of [['kitPlan', kitPlan], ['kitKinds', kitKinds]]) {
  const s = fn.toString(), code = s.replace(/\/\/[^\n]*/g, '');
  ok(!/`/.test(s) && s.indexOf('$' + '{') < 0, name + ': no backtick, no dollar-brace');
  ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(s), name + ': no innerHTML');
  ok(!/=>/.test(code) && !/\b(let|const|class)\s/.test(code), name + ': ES5 (no arrow, let, const, class)');
  ok(!/\brequire\s*\(/.test(code), name + ': no require inside');
  ok(!/\.(includes|find|findIndex|repeat|startsWith|endsWith|padStart|padEnd)\(|Object\.assign|Array\.from|new (Set|Map)\b/.test(code), name + ': no ES2015 library calls');
  let f2 = null; try { f2 = vm.runInNewContext('(' + s + ')', {}); } catch (e) { f2 = null; }
  ok(typeof f2 === 'function' && f2() && typeof f2() === 'object', name + ': runs from its own text in an empty context');
}
{
  const p2 = vm.runInNewContext('(' + kitPlan.toString() + ')', {})().use(WORDS);
  const t = read('tabs.inc');
  eq(JSON.parse(JSON.stringify(p2.plan(srcOf(t), { gap: 3 }, S('s.act.sound'), {}, { kitKind: 'ia-entity', editable: true, ver: 1 }))),
    JSON.parse(JSON.stringify(P.plan(srcOf(t), { gap: 3 }, S('s.act.sound'), {}, { kitKind: 'ia-entity', editable: true, ver: 1 }))), 'kitPlan from toString plans like the module');
  ok(typeof p2.fits === 'function' && [1, 3, 5, 10].every(g => p2.fits(srcOf(t), p2.scopeAt(srcOf(t), g), S('s.act.sound'), { kitKind: 'ia-entity' }) === P.fits(srcOf(t), P.scopeAt(srcOf(t), g), S('s.act.sound'), { kitKind: 'ia-entity' })), 'kitPlan from toString: fits() answers like the module');
  const k2 = vm.runInNewContext('(' + kitKinds.toString() + ')', {})();
  ok(k2.kitKindOf('resource/set/interaction_entity/a.inc') === 'ia-entity', 'kitKinds from toString works');
}

// ---- B. kitKindOf (design 4.3)
{
  const K = kitKinds();
  eq(K.KINDS.map(k => k.id), ['ia-entity', 'ia-terrain', 'ia-terrain-map', 'modinfo', 'lng', 'bot-lua', 'mi', 'mapinfo', 'mp-units', 'mp-games', 'stuff', 'breed', 'entity-def', 'props', 'mtl', 'sound-set', 'sdl'], 'KINDS: the 16 kinds of design 4.3 and props (round 2)');
  eq(K.KINDS.filter(k => k.pieces).map(k => k.id), ['ia-entity', 'ia-terrain', 'lng', 'mi', 'mapinfo', 'stuff', 'breed', 'entity-def', 'props', 'sdl'], 'round 2: pieces on for ia-terrain, lng, mi, mapinfo, stuff, breed, entity-def, props');
  const cases = [
    ['resource/set/interaction_entity/entity.set', 'ia-entity'], ['set/interaction_entity/entity.set', 'ia-entity'],
    ['set/interaction_entity/tank/tank_light.inc', 'ia-entity'], ['resource/set/interaction_entity/foo.set', 'sdl'],
    ['mypak.pak::set/interaction_entity/a.inc', 'ia-entity'], ['data.pak::resource/set/stuff/gun/x', 'stuff'],
    ['resource/set/interaction_terrain/effects.set', 'ia-terrain'], ['set/interaction_terrain/effects/sand.inc', 'ia-terrain'],
    ['resource/set/interaction_terrain/terrains.set', 'ia-terrain-map'], ['set/interaction_terrain/textures.set', 'ia-terrain-map'],
    ['mod.info', 'modinfo'], ['resource/mod.info', 'sdl'],
    ['resource/interface/text/english/units.lng', 'lng'], ['resource/script/multiplayer/bot_x.lua', 'bot-lua'],
    ['resource/script/multiplayer/sub/x.lua', 'none'], ['resource/script/x.lua', 'none'],
    ['resource/map/single/m1/1.mi', 'mi'], ['resource/map/multi/2x2/map.info', 'mapinfo'],
    ['resource/set/multiplayer/units/ger.set', 'mp-units'], ['set/multiplayer/games/frontline.set', 'mp-games'], ['set/multiplayer/armies/ger.set', 'mp-games'],
    ['resource/set/stuff/gun/76mm_f34', 'stuff'], ['set/breed/ger/x.set', 'breed'],
    ['resource/entity/vehicle/tank/t34/t34.def', 'entity-def'], ['resource/entity/x/x.mtl', 'mtl'],
    ['resource/sound/sound.set', 'sound-set'], ['sound/vehicle/tank/folder.set', 'sound-set'],
    ['resource/properties/tank.ext', 'props'], ['properties/human.inc', 'props'], ['resource/properties/readme.txt', 'none'],
    ['resource/entity/vehicle/tank/t34/t34.inc', 'entity-def'], ['entity/-vehicle/tank_medium.ext', 'entity-def'], ['resource/entity/x/x.mdl', 'sdl'],
    ['RESOURCE\\Set\\Interaction_Entity\\Human.INC', 'ia-entity'],
    ['game.log', 'none'], ['readme.txt', 'none'], ['', 'none'], [null, 'none']
  ];
  for (const [k, want] of cases) eq(K.kitKindOf(k), want, 'kitKindOf ' + JSON.stringify(k));
}

// ---- C. sections (design 4.2)
{
  const ids = SEC.SECTIONS.map(s => s.id);
  ok(new Set(ids).size === ids.length, 'section ids are unique');
  ok(SEC.SECTIONS.every(s => s.parent === null || ids.includes(s.parent)), 'every parent exists');
  ok(SEC.SECTIONS.every(s => s.parent === null || SEC.SECTIONS.find(x => x.id === s.parent).parent === null), 'depth at most two section levels (then the piece)');
  // v1 counts: only the v1 sub-sections (count set) add up; round 2 sub-sections carry no count
  for (const t of SEC.SECTIONS.filter(s => !s.parent && s.count !== undefined)) {
    const subs = SEC.SECTIONS.filter(s => s.parent === t.id && !s.view && s.count !== undefined);
    if (subs.length) ok(subs.reduce((a, s) => a + s.count, 0) === t.count, t.id + ': sub-section counts add up to ' + t.count);
  }
  ok(SEC.SECTIONS.filter(s => !s.parent && /^ia\./.test(s.id) && s.count !== undefined).reduce((a, s) => a + s.count, 0) === 386, 'ia sections hold 386 pieces (v1)');
  ok(SEC.SECTIONS.find(s => s.id === 'sdl.any').count === 5, 'sdl.any holds 5 pieces');
  eq(SEC.SECTIONS.filter(s => s.adv).map(s => s.id), ['ia.adv', 'ia.adv.ev', 'ia.adv.if', 'ia.adv.do', 'ia.adv.setup', 'ia.adv.idea', 'mi.adv'], 'adv on ia.adv and below and on mi.adv only');
  eq(Object.keys(SEC.VIEWS), ['ia.ideas.show'], 'one view: ia.ideas.show');
  ok(SEC.VIEWS['ia.ideas.show'].length === 10 && SEC.SECTIONS.find(s => s.id === 'ia.ideas.show').view === true, 'the view holds 10 ids and is marked view');
  // the v1 tree is kept: ids, parents and orders of the v1 sections (sdl.any moves to the end: order 90)
  const V1TREE = [['ia.start', 4, []], ['ia.ideas', 53, ['show', 'veh', 'inf', 'obj', 'nat', 'exp', 'amb', 'sys']], ['ia.when', 66, ['life', 'hit', 'move', 'weap', 'anim', 'own']],
    ['ia.if', 68, ['rand', 'hitby', 'touch', 'state', 'parts', 'move', 'world', 'logic']], ['ia.do', 110, ['fx', 'snd', 'make', 'dmg', 'crew', 'push', 'anim', 'mem', 'wait']],
    ['ia.pat', 36, ['setup', 'fx', 'time', 'dmg', 'move']], ['ia.change', 8, []], ['ia.adv', 41, ['ev', 'if', 'do', 'setup', 'idea']], ['sdl.any', 5, []]];
  V1TREE.forEach(([id, n, subs], i) => {
    const t = SEC.SECTIONS.find(s => s.id === id);
    ok(t && t.parent === null && t.order === (id === 'sdl.any' ? 90 : i + 1) && t.count === n, 'v1 top ' + id + ' kept (order, count)');
    subs.forEach((x, j) => { const s = SEC.SECTIONS.find(y => y.id === id + '.' + x); ok(s && s.parent === id && s.order === j + 1, 'v1 sub-section ' + id + '.' + x + ' kept'); });
  });
  const topsOf = k => SEC.forKind(k).filter(s => !s.parent).sort((a, b) => a.order - b.order).map(s => s.id);
  eq(topsOf('ia-entity'), ['ia.start', 'ia.sys', 'ia.ideas', 'ia.forms', 'ia.when', 'ia.if', 'ia.do', 'ia.pat', 'ia.change', 'ia.adv', 'sdl.any', 'sdl.files'], 'ia-entity tops in the organize.md order');
  eq(topsOf('mi'), ['mi.start', 'mi.sys', 'mi.ideas', 'mi.when', 'mi.if', 'mi.do', 'mi.pat', 'mi.adv', 'mi.debug', 'sdl.any', 'sdl.files'], 'mi tops in the organize.md order');
  eq(topsOf('ia-terrain')[0], 'ter.start-here', 'ia-terrain starts with Start here');
  eq(topsOf('props'), topsOf('entity-def'), 'props lists the entity sections');
  const sub = (p) => SEC.SECTIONS.filter(s => s.parent === p).sort((a, b) => a.order - b.order).map(s => s.id.slice(p.length + 1));
  eq(sub('ia.ideas'), ['show', 'veh', 'inf', 'obj', 'nat', 'exp', 'amb', 'sys', 'guns', 'aircraft', 'trains', 'more'], 'new ia.ideas sub-sections after the old ones');
  eq(sub('ia.pat'), ['setup', 'fx', 'time', 'dmg', 'move', 'n-timers', 'n-macros', 'more'], 'new ia.pat sub-sections after the old ones');
  ok(SEC.SECTIONS.filter(s => s.count === undefined && !s.view).length === SEC.SECTIONS.length - 50, 'the round 2 sections carry no count');
  ok(SEC.forKind('ia-entity').every(s => /^(ia|sdl)\./.test(s.id)) && SEC.forKind('ia-entity').length === SEC.SECTIONS.filter(s => /^(ia|sdl)\./.test(s.id)).length, 'ia-entity lists every ia and sdl section');
  eq(SEC.forKind('bot-lua'), [], 'a Lua bot script lists no section (it is not SDL text)');
  for (const k of KIND_IDS.filter(k => k !== 'bot-lua')) {
    const ids = SEC.forKind(k).map(s => s.id);
    ok(ids.includes('sdl.any') && ids.includes('sdl.files'), 'kind ' + k + ' lists sdl.any and sdl.files');
  }
  for (const k of ['ia-terrain-map', 'modinfo', 'mp-units', 'mp-games', 'mtl', 'sound-set', 'sdl']) eq(SEC.forKind(k).map(s => s.id), ['sdl.any', 'sdl.files'], 'kind ' + k + ' (no pieces of its own) lists sdl.any and sdl.files only');
  const R2T = { 'ia-terrain': /^ter\./, lng: /^lng\./, mi: /^mi\./, mapinfo: /^info\./, stuff: /^stuff\./, breed: /^breed\./, 'entity-def': /^ent\./, props: /^ent\./ };
  for (const k of Object.keys(R2T)) ok(SEC.forKind(k).every(s => R2T[k].test(s.id) || /^sdl\./.test(s.id)) && SEC.forKind(k).some(s => R2T[k].test(s.id)), 'kind ' + k + ' lists its own sections and the sdl ones');
}

// ---- D. lang/common.js rows
{
  const keys = COMMON.map(r => r[0]);
  const want = SEC.SECTIONS.map(s => 'ide.kit.s.' + s.id).concat(KIND_IDS.map(k => 'ide.kit.k.' + k), FK.map(k => 'ide.kit.fk.' + k));
  eq(keys.slice().sort(), want.slice().sort(), 'lang/common.js: exactly the section, kind and field kind rows');
  const bad = []; for (const r of COMMON) for (const [rule, msg] of rowFaults(r)) bad.push(r[0] + ' ' + rule + ': ' + msg);
  ok(!bad.length, 'lang/common.js rows are clean: ' + bad.slice(0, 6).join('; '));
  for (let i = 2; i <= 4; i++) { const same = COMMON.filter(r => r[i] === r[1]).map(r => r[0]); ok(same.length <= 6, 'lang/common.js: at most 6 values identical to English (' + same.join(',') + ')'); }
}

// ---- E. parse and compile
{
  eq(P.parse('{on "@name@"\n\t@^@\n}', { name: { k: 'event', def: 'x' } }), ['{on "', { f: 'name', k: 'event', def: 'x' }, '"\n\t', { caret: true }, '\n}'], 'parse: text, field, caret');
  eq(P.compile(S('s.act.lit')).text, '{view start "v1"}\n{view start "a@b"}', 'compile: @@ is a literal @');
  eq(P.compile(S('s.act.sound'), { vol: '5' }), { text: '{play_sound "fly" 5}', fields: [{ name: 'name', k: 'sound', off: 13, len: 3 }, { name: 'vol', k: 'number', off: 18, len: 1 }], caret: null }, 'compile: values override defaults, offsets');
  const c = P.compile(S('s.event.named'));
  ok(c.caret === c.text.indexOf('\n\t') + 2 && c.text === '{on "my_event"\n\t\n}', 'compile: caret offset on its own line');
  const rp = Object.assign({}, S('s.act.sound'), { parts: P.parse(S('s.act.sound').code, S('s.act.sound').f) }); delete rp.code;
  eq(P.compile(rp, { vol: '5' }), P.compile(S('s.act.sound'), { vol: '5' }), 'compile: a route piece (parts) compiles like its code');
  const m = P.compile(S('s.list.multi'));
  ok(m.fields[0].len === '(include "a.inc")\n\t(include "b.inc")'.length, 'compile: a line end counts 1 in len');
  eq(P.compile(S('s.act.sound'), { name: 'a\r\nb' }).text, '{play_sound "a\nb" 1}', 'compile: CRLF in a value becomes LF');
}

// ---- F. scopeAt
{
  const t = read('scope.inc'), src = srcOf(t), M = marks(t);
  const W = {
    def_head: { kind: 'top', depth: 0 }, def_on: { kind: 'macro', depth: 1, inDefine: true }, def_body: { kind: 'handler', depth: 2, ev: 'custom', event: 'helper_ev', inDefine: true },
    a_head: { kind: 'top', depth: 0 }, a_on: { kind: 'block', depth: 1, block: 'kit_a tank' }, a_in_spawn: { kind: 'handler', depth: 2, ev: 'spawn', ctx: [] },
    a_if: { kind: 'handler' }, a_branch: { kind: 'branch', depth: 3 }, a_else: { kind: 'branch', depth: 3 }, a_delay: { kind: 'branch' }, a_timer: { kind: 'timer', depth: 4, ctx: [] },
    a_one_line: { kind: 'block', depth: 1 }, a_pierce: { kind: 'block' }, a_delayex: { kind: 'handler', ev: 'pierce', event: 'pierce' },
    a_dx_if: { kind: 'timer', ctx: ['volume', 'part', 'value', 'source'], lost: ['bullet', 'instigator'] }, a_dx_branch: { kind: 'branch', depth: 4 },
    a_spawn: { kind: 'handler' }, a_container: { kind: 'container', depth: 3 }, a_hdp: { kind: 'handler' }, a_value: { kind: 'value', depth: 3 },
    a_delay2: { kind: 'handler' }, a_d_if: { kind: 'timer', ctx: [], lost: ['bullet', 'volume', 'part', 'instigator', 'value', 'source'] },
    a_call: { kind: 'block', depth: 1 }, a_close: { kind: 'block', depth: 1 }, top_after: { kind: 'top', depth: 0 },
    ents: { kind: 'top', depth: 0 }, ents_in: { kind: 'top', depth: 1 }, eff: { kind: 'top', depth: 0 }, sand: { kind: 'top', depth: 1 }, sand_hit: { kind: 'block', depth: 2 },
    sand_in: { kind: 'handler', depth: 3, ev: 'hit' }, data: { kind: 'top' }, data_ext: { kind: 'block', depth: 1 }, data_nested: { kind: 'block', depth: 2 },
    mod_head: { kind: 'block', depth: 1 }, mod_in: { kind: 'block', depth: 2 }, ik: { kind: 'block' }, ik_in: { kind: 'handler', ev: 'ik', event: 'ik begin turret' }
  };
  const cache = {};
  const names = Object.keys(W).sort(() => 0.5 - Math.random());
  for (const n of names) {
    ok(M[n], 'scope.inc marks @' + n);
    const s = P.scopeAt(src, M[n]), s2 = P.scopeAt(src, M[n], cache), w = W[n];
    ok(JSON.stringify(s) === JSON.stringify(s2), 'scopeAt with a cache equals without (@' + n + ')');
    const got = { kind: s.kind };
    for (const k of Object.keys(w)) got[k] = k === 'block' ? (s.block && s.block.name) : s[k];
    eq(got, Object.assign({ kind: w.kind }, w), 'scopeAt @' + n + ' (line ' + M[n] + ')');
  }
  const end = P.scopeAt(src, src.count + 1);
  ok(end.kind === 'top' && end.depth === 0, 'scopeAt after the last line: top, depth 0');
  const sh = P.scopeAt(src, M.a_branch);
  ok(sh.frames.length === 3 && sh.frames[1].kind === 'handler' && sh.frames[1].event === 'spawn' && sh.frames[2].head === 'if' && sh.frames[0].ch === '{', 'scopeAt frames: { ch, line, head, kind, event }');
  const stray = srcOf('}\n)\n}\n{"a"\n\t{on spawn\n');
  for (let l = 1; l <= 6; l++) ok(P.scopeAt(stray, l).depth >= 0, 'stray closers: depth never negative (line ' + l + ')');
  ok(P.scopeAt(stray, 6).kind === 'handler', 'stray closers are ignored');
  // with a game: the game's own interaction files at sampled lines
  let files = null; try { files = GAME ? WORDS.gameFiles(GAME) : null; } catch (e) { files = null; }
  if (!files) console.log('skip core: scopeAt on the game\'s interaction files (no game found)');
  else {
    let bad = 0, n = 0;
    for (const [k, text] of files) {
      const ls = text.split(/\r?\n/), s = { count: ls.length, line: i => ls[i - 1] }, c = {};
      for (let i = 0; i < 12; i++) {
        const l = 1 + Math.floor(Math.random() * (ls.length + 1)); n++;
        try { const x = P.scopeAt(s, l, c); if (!(x.depth >= 0) || !SCOPES.concat(['value', 'macro', 'action']).includes(x.kind)) bad++; } catch (e) { bad++; console.log('  ' + k + ':' + l + ' ' + e.message); }
      }
    }
    ok(files.size >= 50 && bad === 0, 'scopeAt on ' + files.size + ' game interaction files, ' + n + ' sampled lines: no crash, depth never negative');
  }
}

// ---- G. plan
const base = { kitKind: 'ia-entity', editable: true, ver: 7 };
function doPlan(text, gap, piece, values, opts) {
  const r = P.plan(srcOf(text), { gap }, piece, values || {}, Object.assign({}, base, opts || {}));
  const out = r.refuse ? text : FIX.apply(text, r.edits);
  return { r, out, piece, values: values || {} };
}
function landed(name, x, key) {
  // fields hold their values, the result checks clean, the first and last inserted lines are from and to
  const ls = x.out.split('\n'), comp = P.compile(x.piece, x.values);
  for (const f of x.r.fields) {
    const at = ls.slice(0, f.line - 1).reduce((a, l) => a + l.length + 1, 0) + f.col - 1;
    const want = comp.fields.find(c => c.name === f.name), wv = want ? comp.text.slice(want.off, want.off + want.len) : null;
    // a value over lines gets the place's indent on its later lines
    const got = x.out.slice(at, at + f.len), norm = v => String(v).split('\n').map(l => l.replace(/^[ \t]+/, '')).join('\n');
    ok(want && (wv.indexOf('\n') < 0 ? got === wv : norm(got) === norm(wv)), name + ': field ' + f.name + ' holds its value (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(wv) + ')');
  }
  ok(x.r.to >= x.r.from && x.r.from >= 1, name + ': from ' + x.r.from + ' to ' + x.r.to);
  const res = check({ text: x.out, key: key || 'resource/set/interaction_entity/kit_test.inc' }, {}).filter(f => f.sev === 'error');
  ok(!res.length, name + ': the text after the insert checks clean ' + res.map(f => f.code + ':' + f.line).join(','));
}
{
  const tabs = read('tabs.inc'), spaces = read('spaces.inc'), mixed = read('mixed.inc');
  // indent copied from the nearest line, tabs
  let x = doPlan(tabs, 3, S('s.act.sound'));
  eq(x.r.edits, [{ line: 3, col: 0, text: '\t\t{play_sound "fly" 1}' }], 'tabs: action before line 3, indent from the nearest line');
  eq(x.r.fields, [{ name: 'name', k: 'sound', line: 3, col: 16, len: 3 }, { name: 'vol', k: 'number', line: 3, col: 21, len: 1 }], 'tabs: field positions after the edit');
  ok(x.r.refuse === null && x.r.ver === 7 && x.r.caret === null && x.r.from === 3 && x.r.to === 3, 'tabs: no refusal, ver echoed, no caret');
  ok(x.out.split('\n')[2].slice(15, 18) === 'fly', 'tabs: the field covers its value');
  landed('tabs action', x);
  x = doPlan(tabs, 4, S('s.act.sound'));
  eq(x.r.edits, [{ line: 4, col: 0, text: '\t\t{play_sound "fly" 1}' }], 'tabs: insert below the last action (gap before the closing line)');
  // blank line replaced, event piece with caret
  x = doPlan(tabs, 5, S('s.event.contact'));
  eq(x.r.edits, [{ line: 5, col: 1, endCol: 1, text: '\t{on contact\n\t\t\n\t}' }], 'tabs: blank line replaced by the reaction');
  eq([x.r.from, x.r.to, x.r.caret], [5, 7, { line: 6, col: 3 }], 'tabs: from, to, caret on the empty middle line');
  landed('tabs event', x);
  // spaces
  x = doPlan(spaces, 4, S('s.act.sound'));
  eq(x.r.edits, [{ line: 4, col: 0, text: '        {play_sound "fly" 1}' }], 'spaces: indent copied (8 spaces)');
  x = doPlan(spaces, 5, S('s.event.contact'));
  eq(x.r.edits, [{ line: 5, col: 0, text: '    {on contact\n        \n    }' }], 'spaces: a reaction uses 4-space units');
  landed('spaces event', x);
  // mixed (like cannon.inc:155-157): the nearest line above wins
  x = doPlan(mixed, 5, S('s.cond.volume'));
  eq(x.r.edits, [{ line: 5, col: 0, text: '        {if volume "body"\n            \n        }' }], 'mixed: indent of the nearest line above (spaces), 4-space unit');
  x = doPlan(mixed, 4, S('s.act.sound'));
  eq(x.r.edits, [{ line: 4, col: 0, text: '\t\t{play_sound "fly" 1}' }], 'mixed: above a spaces line, the tab line above wins');
  // a top piece inside a block goes after the block
  x = doPlan(tabs, 3, S('s.block.unit'));
  eq(x.r.edits, [{ line: 10, col: 0, text: '{"my_unit"\n\t{on spawn\n\t\t\n\t}\n}' }], 'top piece dropped inside a block: placed after the block');
  eq(x.r.warn, [{ k: 'ide.kit.addedAfter', p: { n: 1 } }], 'top piece moved: warning addedAfter with the block line');
  eq(x.r.caret, { line: 12, col: 3 }, 'top piece: caret');
  landed('top after block', x);
  // refusals
  eq(doPlan(tabs, 3, S('s.act.sound'), {}, { kitKind: 'none' }).r.refuse, { k: 'ide.kit.x.view', p: {} }, 'no text tab: x.view');
  eq(doPlan(tabs, 3, S('s.act.sound'), {}, { cover: true }).r.refuse, { k: 'ide.kit.x.cover', p: {} }, 'a box covers the text: x.cover');
  eq(doPlan(tabs, 3, S('s.act.sound'), {}, { editable: false, why: 'layer' }).r.refuse, { k: 'ide.kit.x.ro', p: { why: 'layer' } }, 'read-only: x.ro with why');
  eq(doPlan(tabs, 3, S('s.act.sound'), {}, { kitKind: 'lng' }).r.refuse, { k: 'ide.kit.x.kind', p: { kind: 'ia-entity', kind2: 'lng' } }, 'wrong kind: x.kind');
  ok(doPlan('{x\n}\n', 2, S('s.sdl.comment'), {}, { kitKind: 'lng' }).r.refuse === null, 'an sdl piece fits any SDL kind');
  for (const id of ['s.sdl.comment', 's.data.mp']) {
    eq(doPlan('function OnTick()\n  local x = 1\nend\n', 2, S(id), {}, { kitKind: 'bot-lua' }).r.refuse, { k: 'ide.kit.x.kind', p: { kind: 'sdl', kind2: 'bot-lua' } }, 'an sdl piece in a Lua bot script: x.kind (' + id + ')');
  }
  x = doPlan(tabs, 1, S('s.act.sound'));
  eq(x.r.refuse, { k: 'ide.kit.x.scope', p: { where: 'handler', n: 3, ev: '' }, near: 3 }, 'wrong place: x.scope with the nearest legal line');
  ok(x.r.edits.length === 0 && x.r.fields.length === 0, 'a refusal has no edits');
  eq(doPlan(tabs, 10, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.scope', p: { where: 'block', n: 9, ev: '' }, near: 9 }, 'a reaction at the top level: nearest gap inside the block');
  eq(doPlan(tabs, 3, S('s.cond.stuff')).r.refuse, { k: 'ide.kit.x.scope', p: { where: 'handler', n: 7, ev: 'bullet_hit, pierce' }, near: 7 }, 'events-limited piece in spawn: refused, near the pierce reaction');
  ok(doPlan(tabs, 7, S('s.cond.stuff')).r.refuse === null, 'events-limited piece inside pierce: fits');
  // duplicate reactions (INT-02)
  const dup = read('dup.inc'), D = marks(dup);
  eq(doPlan(dup, D.dup1_end, S('s.event.spawn')).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'spawn' }, goto: D.dup1_spawn }, 'duplicate: direct child');
  eq(doPlan(dup, D.dup1_end, S('s.event.named'), { name: 'NAMED_EV' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'named_ev' }, goto: D.dup1_named }, 'duplicate: {on "x"} twice is the same (case and overload ignored)');
  eq(doPlan(dup, D.dup1_end, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'contact' }, goto: D.dup1_mod_contact }, 'duplicate: inside (mod ...) of the block');
  x = doPlan(dup, D.dup1_end, S('s.event.ik'));
  ok(x.r.refuse === null, 'ik end "turret" differs from ik begin "turret"');
  eq(doPlan(dup, D.dup2_end, S('s.event.named'), { name: 'file_ev' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'file_ev' }, goto: D.dup2_call }, 'duplicate: inside a file define the block calls');
  ok(doPlan(dup, D.dup2_end, S('s.event.named'), { name: 'other_ev' }).r.refuse === null, 'a file define without that event: fits');
  eq(doPlan(dup, D.pz_end, S('s.event.named'), { name: 'add_movement_sound' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'add_movement_sound' }, goto: D.pz_call }, 'duplicate: inside a game helper (pz1_sound)');
  ok(doPlan(dup, D.pz_end, S('s.event.spawn')).r.refuse === null, 'a game helper without that event: fits');
  eq(doPlan(dup, D.unk_end, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.unknown', p: { name: 'not_known_helper', ev: 'contact' }, goto: D.unk_call }, 'unknown helper call: x.unknown with goto');
  eq(doPlan(dup, D.unk_end, S('s.event.spawn')).r.refuse.k, 'ide.kit.x.dup', 'unknown helper: a direct duplicate is named first');
  eq(doPlan(dup, D.inc_end, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.unknown', p: { name: 'more.inc', ev: 'contact' }, goto: D.inc_line }, 'include in the block: x.unknown');
  // a helper call fills its helper's inputs (%0 from args, %name from name(...)): its events are known (review round 2)
  ok(doPlan(dup, D.door_end, S('s.event.contact')).r.refuse === null, 'a game helper whose events the call fills (door args 1): another reaction fits');
  eq(doPlan(dup, D.door_end, S('s.event.named'), { name: 'open1' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'open1' }, goto: D.door_call }, 'a game helper whose events the call fills: "open1" is a duplicate');
  ok(doPlan(dup, D.door_end, S('s.event.named'), { name: 'open2' }).r.refuse === null, 'a game helper whose events the call fills: "open2" is not (the call gave 1)');
  eq(doPlan(dup, D.door0_end, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.unknown', p: { name: 'door', ev: 'contact' }, goto: D.door0_call }, 'a game helper whose input the call does not give: x.unknown');
  ok(doPlan(dup, D.tfx_end, S('s.event.contact')).r.refuse === null, '("terrain_fx" args "sand" sand): contact fits');
  eq(doPlan(dup, D.tfx_end, { id: 't.tfx', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on terrain_fx Sand enter\n\t@^@\n}', f: {} }).r.refuse,
    { k: 'ide.kit.x.dup', p: { ev: 'terrain_fx sand enter' }, goto: D.tfx_call }, '("terrain_fx" args "sand" sand): terrain_fx sand enter is a duplicate (quotes and case aside)');
  eq(doPlan(dup, D.ml_end, S('s.event.named'), { name: 'close3' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'close3' }, goto: D.ml_call }, 'a call written over two lines: its args are read');
  eq(doPlan(dup, D.two_end, S('s.event.named'), { name: 'open5' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'open5' }, goto: D.two_call }, 'two calls on one line: the first one\'s args');
  eq(doPlan(dup, D.two_end, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.unknown', p: { name: 'door', ev: 'contact' }, goto: D.two_call }, 'two calls on one line: the second one gives no args (not taken from the first)');
  ok(doPlan(dup, D.bp_end, S('s.event.contact')).r.refuse === null, 'a file define {on "burn_%0_start"} called with args: contact fits');
  eq(doPlan(dup, D.bp_end, S('s.event.named'), { name: 'burn_2_start' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'burn_2_start' }, goto: D.bp_call2 }, 'a file define called with args 2: "burn_2_start" is a duplicate (%0_start is %0 then _start)');
  ok(doPlan('{"u"\n\t("g" args sand)\n\n}\n(define "g"\n\t{on terrain_fx %0 enter}\n)', 3, S('s.event.contact')).r.refuse === null, 'a file define with {on terrain_fx %0 enter} called with args: contact fits');
  eq(doPlan('{"u"\n\t("g" event(Engine on))\n\n}\n(define "g"\n\t{on %event}\n)', 3, S('s.event.named'), { name: 'x' }).r.refuse, null, 'a named input fills {on %event}: a reaction of your own fits');
  eq(doPlan('{"u"\n\t("g" args "my_ev")\n\n}\n(define "g"\n\t{on %0}\n)', 3, S('s.event.named'), { name: 'my_ev' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'my_ev' }, goto: 2 }, 'a quoted value as the whole event word: a reaction of your own');
  ok(doPlan('{"u"\n\t("g" args "my_ev")\n\n}\n(define "g"\n\t{on %0}\n)', 3, { id: 't.myev', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on my_ev\n}', f: {} }).r.refuse === null, 'a quoted value as the whole event word is not the game event of that name');
  ok(doPlan(dup, D.unk_call - 1, S('s.act.sound')).r.refuse === null, 'non-event pieces are not dup-checked (an action in a reaction of a block with an unknown helper)');
  const nd = doPlan(dup, D.unk_end, S('s.act.sound')).r.refuse;
  ok(nd && nd.k === 'ide.kit.x.scope', 'an action at block level: refused for the place, not as a duplicate (' + JSON.stringify(nd) + ')');
  ok(doPlan(dup, D.dup1_end, S('s.sdl.comment'), {}, { kitKind: 'ia-entity' }).r.refuse === null, 'a piece without a reaction is not dup-checked');
  // a gap inside an action or value moves after its closing line
  const sc = read('scope.inc'), M = marks(sc);
  x = doPlan(sc, M.a_value, S('s.act.sound'));
  ok(x.r.refuse === null && x.r.from === M.a_value + 2, 'a gap inside a value block moves after its closing line (' + x.r.from + ')');
  // warnings
  const w = (gap, id, vals, opts) => doPlan(sc, gap, S(id), vals, opts).r;
  eq(w(M.a_d_if, 's.cond.volume').warn, [{ k: 'ide.kit.w.delay', p: {} }], 'warn: a volume check inside a delay (INT-13)');
  eq(w(M.a_in_spawn, 's.cond.volume').warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'volume' } }], 'warn: spawn carries no volume');
  eq(w(M.a_dx_if, 's.cond.volume').warn, [], 'no warning: delay_ex keeps the volume');
  eq(w(M.a_in_spawn, 's.cond.side').warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'bullet' } }], 'warn: hit_side left without a bullet');
  eq(w(M.a_in_spawn, 's.cond.side', { side: 'front' }).warn, [], 'no warning: hit_side front works without a bullet');
  eq(w(M.ik_in, 's.cond.volume').warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'volume' } }], 'warn: ik carries no volume');
  eq(w(M.def_body, 's.cond.volume').warn, [], 'no warning: a custom event context is not known');
  eq(w(M.a_in_spawn, 's.act.call').warn, [{ k: 'ide.kit.w.call', p: { name: 'nobody_home' } }], 'warn: call of a reaction nobody has (INT-04)');
  eq(w(M.a_in_spawn, 's.act.call', { name: 'helper_ev' }).warn, [], 'no warning: the file reacts to that name');
  eq(w(M.a_in_spawn, 's.act.flag').warn, [{ k: 'ide.kit.w.flag', p: { name: 'my_new_flag' } }], 'note: a new flag name (INT-10)');
  eq(w(M.a_in_spawn, 's.act.flag', { flag: 'f1' }).warn, [], 'no note: the flag is in the file');
  eq(w(M.a_in_spawn, 's.data.mp').warn, [{ k: 'ide.kit.w.mp', p: {} }], 'warn: (mod "mp") in an interaction file');
  eq(w(M.data_nested, 's.data.mp', {}, { kitKind: 'sdl' }).warn, [], 'no warning: (mod "mp") in a data file');
  eq(w(M.a_in_spawn, 's.sdl.comment', { note: 'caf' + ch(0xe9) }).warn, [{ k: 'ide.kit.w.ascii', p: {} }], 'warn: a note that is not plain ASCII');
  x = doPlan(sc, M.a_in_spawn, S('s.data.mp'));
  landed('mod piece in a handler', x);
  // list fields are no tab stop; append at the end
  x = doPlan('{"a"\n}', 3, S('s.list.multi'));
  eq(x.r.fields.map(f => f.name), ['file'], 'a list field is not a tab stop');
  eq(x.out, '{"a"\n}\n{entities\n\t(include "a.inc")\n\t(include "b.inc")\n\t(include "mymod.inc")\n}', 'append after a last line with text');
  x = doPlan('{"a"\n}\n', 4, S('s.block.unit'));
  eq(x.out, '{"a"\n}\n{"my_unit"\n\t{on spawn\n\t\t\n\t}\n}\n', 'append over the last empty line keeps the final line end');
  eq([x.r.from, x.r.to, x.r.fields[0]], [3, 7, { name: 'tags', k: 'tags', line: 3, col: 3, len: 7 }], 'append: from, to, field');
  landed('append', x);
  x = doPlan('', 1, S('s.block.unit'));
  ok(x.r.refuse === null && x.r.from === 1 && /^\{"my_unit"/.test(x.out), 'an empty text takes a top piece');
  // never throws
  ok(P.plan(srcOf(tabs), { gap: 1 }, null, {}, base).refuse.k === 'ide.kit.notAdded', 'a broken piece: notAdded, no throw');
  ok(P.plan(null, null, S('s.act.sound'), null, base).refuse !== null, 'no source: refused, no throw');
  // the planner's edits apply the same way through fixes.apply as described
  ok(FIX.apply(tabs, doPlan(tabs, 5, S('s.event.contact')).r.edits).split('\n').length === tabs.split('\n').length + 2, 'one blank line replaced by three lines');

  // pieces that add reactions through their own (define ...) and its call (b.start.define_named, b.combo.terrain_fx_macro)
  const pDef = { id: 't.define_named', kinds: ['ia-entity'], scope: ['block'], role: 'grammar',
    code: '(define "hook_event"\n\t{on %event\n\t\t{call "@handler@"}\n\t}\n)\n("hook_event" event(@event_words@))',
    f: { handler: { k: 'event', def: 'update_lights' }, event_words: { k: 'code', def: 'operatable on' } } };
  const pTer = { id: 't.terrain_fx_macro', kinds: ['ia-entity'], scope: ['block'], role: 'pattern',
    code: '(define "ground_fx"\n\t{on terrain_fx %0 enter\n\t\t{view start "on_%1"}\n\t}\n\t{on terrain_fx %0 leave\n\t}\n)\n("ground_fx" args "water" water)\n("ground_fx" args "mud" mud)', f: {} };
  const hasOp = '{"mymod_gate"\n\t{on operatable on\n\t}\n\n}';
  eq(doPlan(hasOp, 4, pDef).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'operatable on' }, goto: 2 }, 'macro piece: the reaction its own define adds through the call is a duplicate');
  ok(doPlan(hasOp, 4, pDef, { event_words: 'engine on' }).r.refuse === null, 'macro piece: another event through the call fits');
  x = doPlan('{"mymod_gate"\n\n}', 2, pDef);
  ok(x.r.refuse === null, 'macro piece: fits an empty block');
  eq(doPlan(x.out, x.r.to + 1, pDef, { event_words: 'engine on' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'engine on' }, goto: x.r.to }, 'macro piece added twice: the block already calls the helper it defines');
  eq(doPlan('{"t"\n\t{on terrain_fx water enter\n\t}\n\n}', 4, pTer).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'terrain_fx water enter' }, goto: 2 }, 'positional macro inputs: terrain_fx water enter is a duplicate');
  ok(doPlan('{"t"\n\t{on terrain_fx sand enter\n\t}\n\n}', 4, pTer).r.refuse === null, 'positional macro inputs: another terrain fits');
  const pMix = { id: 't.mix', kinds: ['ia-entity'], scope: ['block'], role: 'pattern', code: '(define "gfx"\n\t{on terrain_fx %0 %how\n\t}\n)\n("gfx" args "water" how(enter))', f: {} };
  eq(doPlan('{"t"\n\t{on terrain_fx water enter\n\t}\n\n}', 4, pMix).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'terrain_fx water enter' }, goto: 2 }, 'macro inputs: args then a named input, the named one is not taken as a positional word');
  const pArgsNamed = { id: 't.argsn', kinds: ['ia-entity'], scope: ['block'], role: 'pattern', code: '(define "gfx"\n\t{on %args\n\t}\n)\n("gfx" args(contact))', f: {} };
  eq(doPlan('{"t"\n\t{on contact\n\t}\n\n}', 4, pArgsNamed).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'contact' }, goto: 2 }, 'macro inputs: args(...) is a named input called args (SDL-19)');
  eq(doPlan('{"t"\n\t("pz1_sound")\n\n}', 3, { id: 't.call', kinds: ['ia-entity'], scope: ['block'], role: 'pattern', code: '{on "add_movement_sound"\n}', f: {} }).r.refuse,
    { k: 'ide.kit.x.dup', p: { ev: 'add_movement_sound' }, goto: 2 }, 'a game helper the block calls: its quoted reaction is a duplicate of the same quoted one');

  // a (mod ...) in a piece's own text is transparent: the reactions typed into it count (a.sdl.mponly's lines field)
  const pModL = { id: 't.modl', kinds: ['sdl'], scope: ['top', 'block'], role: 'grammar', code: '(mod "not \\"mp\\""\n\t@lines@\n)', f: { lines: { k: 'code', def: '; your lines here' } } };
  eq(doPlan('{"u"\n\t{on spawn\n\t}\n\n}', 4, pModL, { lines: '{on spawn\n\t{x}\n}' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'spawn' }, goto: 2 }, 'a reaction typed into a piece\'s (mod ...): a duplicate');
  ok(doPlan('{"u"\n\t{on spawn\n\t}\n\n}', 4, pModL, { lines: '{on contact\n\t{x}\n}' }).r.refuse === null, 'a reaction typed into a piece\'s (mod ...): another event fits');

  // quoted and unquoted names are two reactions; a block that opens or closes on a line shared with another block
  ok(doPlan('{"t"\n\t{on "spawn"\n\t}\n}', 4, S('s.event.spawn')).r.refuse === null, '{on spawn} next to {on "spawn"}: two reactions, fits');
  eq(doPlan('{"t"\n\t{on "spawn"\n\t}\n}', 4, S('s.event.named'), { name: 'spawn' }).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'spawn' }, goto: 2 }, '{on "spawn"} twice: a duplicate');
  ok(doPlan('{"a" {on contact}} {"b"\n\t{on spawn}\n}', 3, S('s.event.contact')).r.refuse === null, 'a block opened on the line of another block: the other block\'s reaction does not count');
  eq(doPlan('{"a" {on contact}} {"b"\n\t{on spawn}\n}', 3, S('s.event.spawn')).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'spawn' }, goto: 2 }, 'a block opened on the line of another block: its own reaction counts');
  ok(doPlan('{"b"\n\t{on spawn}\n} {"c" {on contact}}', 2, S('s.event.contact')).r.refuse === null, 'a block closed on the line of another block: the other block\'s reaction does not count');

  // indent: a ; line at column 0 and an else line are not the indent of the place
  x = doPlan('{"t"\n\t{on contact\n;\t\t{components "wingleft" destroy}\n\t\t{set "b" 1}\n\t}\n}', 4, S('s.act.sound'));
  eq(x.r.edits, [{ line: 4, col: 0, text: '\t\t{play_sound "fly" 1}' }], 'indent: a commented-out line at column 0 is skipped');
  landed('indent after a comment', x);
  x = doPlan('{"t"\n\t{on contact\n;\t\t{x}\n\n\t}\n}', 4, S('s.act.sound'));
  eq(x.r.edits, [{ line: 4, col: 1, endCol: 1, text: '\t\t{play_sound "fly" 1}' }], 'indent: only a comment near: the reaction head plus one unit');
  x = doPlan('{"t"\n\t{on contact\n\t\t{if volume "gun"\n\t\t\t{set "a" 1}\n\t\telse volume "body"\n\n\t\t}\n\t}\n}', 6, S('s.act.sound'));
  eq(x.r.edits, [{ line: 6, col: 1, endCol: 1, text: '\t\t\t{play_sound "fly" 1}' }], 'indent: after an else line, one unit deeper than the else');
  landed('indent after else', x);
  x = doPlan('{"t"\n\t{on contact\n\t\t{if volume "gun"\n\t\telse\n\t\t\t{set "a" 1}\n\t\t}\n\t}\n}', 4, S('s.act.sound'));
  eq(x.r.edits, [{ line: 4, col: 0, text: '\t\t\t{play_sound "fly" 1}' }], 'indent: right before an else line, one unit deeper than the else');
  x = doPlan('{"t"\n\t{on contact\n\t\t{if volume "gun"\n\t\t\t{set "a" 1}\n\t\t else volume "body"\n\n\t\t\t{set "b" 1}\n\t\t}\n\t}\n}', 6, S('s.act.sound'));
  eq(x.r.edits, [{ line: 6, col: 1, endCol: 1, text: '\t\t\t{play_sound "fly" 1}' }], 'indent: right after an else written with a space (flora.inc:46), the branch line below is the model');
  x = doPlan('{"t"\n\t{on contact\n\t\t{if volume "gun"\n\t\t\t{set "a" 1}\n\t\t\telse volume "body"\n\n\t\t\t{set "b" 1}\n\t\t}\n\t}\n}', 6, S('s.act.sound'));
  eq(x.r.edits, [{ line: 6, col: 1, endCol: 1, text: '\t\t\t{play_sound "fly" 1}' }], 'indent: right after an else written at the branch indent, the branch line below is the model');
  x = doPlan('{"t"\n    {on contact\n        {if volume "gun"\n        else\n\n        }\n    }\n}', 5, S('s.act.sound'));
  eq(x.r.edits, [{ line: 5, col: 1, endCol: 1, text: '            {play_sound "fly" 1}' }], 'indent: else in a spaces file, one 4-space unit deeper');

  // fragment files (top-level reactions, included into a block) and define bodies
  x = doPlan('{on pierce\n\t{call "x"}\n}\n', 4, S('s.event.contact'));
  ok(x.r.refuse === null && x.r.edits[0].text === '{on contact\n\t\n}', 'fragment file: a reaction fits at the top level (' + JSON.stringify(x.r.refuse || x.r.edits) + ')');
  eq(doPlan('{on pierce\n}\n{on contact\n}\n', 5, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'contact' }, goto: 3 }, 'fragment file: a top-level duplicate is refused');
  eq(doPlan('{on pierce\n}\n{"blk"\n}\n', 5, S('s.event.contact')).r.refuse.k, 'ide.kit.x.scope', 'a file with a quoted block is no fragment: a reaction at the top level is refused');
  x = doPlan('{on pierce\n}\n(mod "mp"\n\t{on spawn\n\t}\n\n)\n', 6, S('s.event.contact'));
  ok(x.r.refuse === null && x.r.edits[0].text === '\t{on contact\n\t\t\n\t}', 'fragment file: a reaction fits inside a top-level (mod ...) (' + JSON.stringify(x.r.refuse || x.r.edits) + ')');
  eq(doPlan('(mod "mp"\n\t{on contact\n\t}\n)\n\n', 5, S('s.event.contact')).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'contact' }, goto: 2 }, 'fragment file whose reactions sit in a (mod ...): a top-level duplicate is refused');
  eq(doPlan('(mod "mp"\n\t{"blk"\n\t}\n)\n\n', 5, S('s.event.contact')).r.refuse.k, 'ide.kit.x.scope', 'a quoted block inside a top-level (mod ...): no fragment');
  eq(doPlan('{on pierce\n}\n', 3, S('s.event.contact'), {}, { kitKind: 'sdl' }).r.refuse.k, 'ide.kit.x.kind', 'fragment rule only for interaction files');
  x = doPlan('(define "x"\n\t{on pierce}\n\n)', 3, S('s.event.contact'));
  ok(x.r.refuse === null && x.r.edits[0].text === '\t{on contact\n\t\t\n\t}', 'define body with reactions: a reaction fits (' + JSON.stringify(x.r.refuse || x.r.edits) + ')');
  ok(doPlan('(define "x"\n\t{on pierce}\n\n)', 3, S('s.act.sound')).r.refuse.k === 'ide.kit.x.scope', 'define body with reactions: an action is refused');
  x = doPlan('(define "y"\n\t{view start %0}\n\n)', 3, S('s.act.sound'));
  ok(x.r.refuse === null && x.r.edits[0].text === '\t{play_sound "fly" 1}', 'define body with actions: an action fits');
  ok(doPlan('(define "y"\n\t{view start %0}\n\n)', 3, S('s.event.contact')).r.refuse.k === 'ide.kit.x.scope', 'define body with actions: a reaction is refused');
  ok(doPlan('(define "z"\n\n)', 2, S('s.act.sound')).r.refuse === null && doPlan('(define "z"\n\n)', 2, S('s.event.contact')).r.refuse === null, 'an empty define body takes an action or a reaction');
  // review round 2: the event of a define body is the caller's, so an events-limited check is not refused there (the
  // game's damage helpers test stuff and volume in define bodies, cannon.inc:16-18)
  ok(doPlan('(define "y"\n\t{view start %0}\n\n)', 3, S('s.cond.stuff')).r.refuse === null, 'define body: an events-limited piece fits (the event is the caller\'s)');

  // (mod ...) inside a reaction is no reaction
  const modIn = '{"t"\n\t{on spawn\n\t\t(mod "mp"\n\t\t\t{x}\n\t\t)\n\t}\n}';
  const sm = P.scopeAt(srcOf(modIn), 4);
  eq([sm.kind, sm.event, sm.ev, sm.ctx], ['handler', 'spawn', 'spawn', []], '(mod) inside a reaction: the reaction is still spawn');
  eq(doPlan(modIn, 4, S('s.cond.volume')).r.warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'volume' } }], '(mod) inside a reaction: the context warning stays');
  eq(doPlan(modIn, 4, S('s.cond.stuff')).r.refuse.k, 'ide.kit.x.scope', '(mod) inside a reaction: an events-limited piece is judged by the real event');
  ok(P.scanNames(srcOf(modIn)).events.indexOf('mp') < 0, '(mod) inside a reaction: no reaction named mp');

  // a gap inside a setting of an entity block written over lines moves after it
  x = doPlan('{"t"\n\t{inflammation_time\n\t\t5\n\t}\n}', 3, S('s.event.contact'));
  eq(x.out, '{"t"\n\t{inflammation_time\n\t\t5\n\t}\n\t{on contact\n\t\t\n\t}\n}', 'a reaction dropped inside {inflammation_time ...}: placed after it');
  // the same at the top level of a fragment file (review round 2)
  const fragSet = '{on spawn\n}\n{inflammation_time\n\t\n\t5\n}\n';
  x = doPlan(fragSet, 4, S('s.event.contact'));
  eq(x.out, '{on spawn\n}\n{inflammation_time\n\t\n\t5\n}\n{on contact\n\t\n}\n', 'a fragment file: a reaction dropped inside a top-level setting is placed after it');
  ok(P.fits(srcOf(fragSet), P.scopeAt(srcOf(fragSet), 4), S('s.event.contact'), base) === true, 'a fragment file: fits() takes the moved gap too');
  eq(doPlan(fragSet, 4, S('s.event.spawn')).r.refuse, { k: 'ide.kit.x.dup', p: { ev: 'spawn' }, goto: 1 }, 'a fragment file: the moved gap is duplicate-checked');
  x = doPlan('{"u"\n}\n{inflammation_time\n\t\n}\n', 4, S('s.event.contact'));
  ok(x.r.refuse === null && x.r.from === 4, 'not a fragment file (it has a quoted block): the gap in a top-level unquoted block is not moved (' + x.r.from + ')');
  x = doPlan('{"t"\n\t{onspawn\n\n\t}\n}', 3, S('s.event.contact'));
  ok(x.r.refuse === null && x.r.from === 5, 'a mistyped {onspawn: the reaction goes after it (' + x.r.from + ')');
  x = doPlan('{entity\n\t{extension "x"\n\n\t}\n}', 3, S('s.sdl.comment'), {}, { kitKind: 'sdl' });
  ok(x.r.refuse === null && x.r.from === 3, 'a data file: a gap in a nested unquoted block stays there');

  // context: break_armor carries the bullet's source and instigator; actions that need a volume, part or the other unit
  const cStuff = { id: 't.stuff', kinds: ['ia-entity'], scope: ['handler', 'branch'], role: 'cond', code: '{if stuff "shell"\n\t@^@\n}', f: {} };
  const cEff = { id: 't.eff', kinds: ['ia-entity'], scope: ['handler', 'branch'], role: 'cond', code: '{if effector "tank"\n\t@^@\n}', f: {} };
  const hostEv = (ev, inner) => '{"t"\n\t{on ' + ev + '\n' + (inner ? '\t\t{' + inner + '\n\n\t\t}' : '') + '\n\t}\n}';
  for (const ev of ['break_armor', 'break_armor_again']) {
    eq(doPlan(hostEv(ev), 3, cStuff).r.warn, [], 'no warning: stuff in ' + ev + ' (airborne.inc:75-77)');
    eq(doPlan(hostEv(ev), 3, cEff).r.warn, [], 'no warning: effector in ' + ev);
  }
  eq(doPlan(hostEv('spawn'), 3, cStuff).r.warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'source' } }], 'stuff in spawn: warned');
  const aComp = { id: 't.comp', kinds: ['ia-entity'], scope: ['handler', 'branch', 'timer'], role: 'act', code: '{component break}', f: {} };
  const aEff = { id: 't.weff', kinds: ['ia-entity'], scope: ['handler', 'branch', 'timer'], role: 'act', code: '{with_effector\n\t@^@\n}', f: {} };
  const aTear = { id: 't.tear', kinds: ['ia-entity'], scope: ['handler', 'branch', 'timer'], role: 'act', code: '{tear "p" bone from_volume\n\t{impulse up 2 1 dir 2 1}\n}', f: {} };
  const aTear2 = { id: 't.tear2', kinds: ['ia-entity'], scope: ['handler', 'branch', 'timer'], role: 'act', code: '{tear "p" bone}', f: {} };
  eq(doPlan(hostEv('contact', 'delay 1'), 4, aComp).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], 'component inside a plain delay: w.delay');
  eq(doPlan(hostEv('contact', 'delay_ex 1'), 4, aComp).r.warn, [], 'component inside delay_ex: the part is kept');
  eq(doPlan(hostEv('contact'), 3, aComp).r.warn, [], 'component in contact: no warning');
  eq(doPlan(hostEv('spawn'), 3, aComp).r.warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'part' } }], 'component in spawn: w.noCtx');
  eq(doPlan(hostEv('bullet_hit', 'delay 1'), 4, aEff).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], 'with_effector inside a plain delay: w.delay');
  eq(doPlan(hostEv('bullet_hit', 'delay_ex 1'), 4, aEff).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], 'with_effector inside delay_ex: the other unit is dropped');
  eq(doPlan(hostEv('bullet_hit', 'delay 1'), 4, aTear).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], 'tear from_volume inside a plain delay: w.delay');
  eq(doPlan(hostEv('bullet_hit', 'delay 1'), 4, aTear2).r.warn, [], 'tear without from_volume: no warning');
  // a reaction whose command is not known ({on "x"}, crew): a timer still drops what it drops (review round 2: ialint
  // reports INT_DELAY_CTX_LOST and INT_DELAYEX_LOST there); with no timer nothing is known, so nothing is warned
  const tc = (id, code) => ({ id, kinds: ['ia-entity'], scope: ['handler', 'branch', 'timer'], role: 'cond', code, f: {} });
  const tVol = tc('t.vol', '{if volume "body"\n}'), tStuff = tc('t.stf', '{if stuff "shell"\n}'), tEff = tc('t.eff2', '{if effector "tank"\n}');
  eq(doPlan(hostEv('"kit_event"', 'delay 1'), 4, tVol).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], '{on "x"} {delay}: a volume check warns w.delay');
  eq(doPlan(hostEv('"kit_event"', 'delay 1'), 4, tStuff).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], '{on "x"} {delay}: a stuff check warns w.delay');
  eq(doPlan(hostEv('"kit_event"', 'delay 1'), 4, aComp).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], '{on "x"} {delay}: a component action warns w.delay');
  eq(doPlan(hostEv('"kit_event"', 'delay_ex 1'), 4, tVol).r.warn, [], '{on "x"} {delay_ex}: the volume is kept, no warning');
  eq(doPlan(hostEv('"kit_event"', 'delay_ex 1'), 4, tEff).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], '{on "x"} {delay_ex}: an effector check warns w.delay');
  eq(doPlan(hostEv('"kit_event"'), 3, tVol).r.warn, [], '{on "x"} with no timer: not known, no warning');
  eq(doPlan(hostEv('crew', 'delay 1'), 4, tEff).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], '{on crew} {delay}: an effector check warns w.delay');
  eq(doPlan(hostEv('board in', 'delay_ex 1'), 4, tEff).r.warn, [{ k: 'ide.kit.w.delay', p: {} }], '{on board in} {delay_ex}: an effector check warns w.delay (board carries the other unit)');
  eq(doPlan(hostEv('board out'), 3, tEff).r.warn, [], '{on board out}: an effector check, no warning (human.inc:725)');
  eq(doPlan(hostEv('board out'), 3, tc('t.nm', '{if name "emit1"\n}')).r.warn, [], '{on board out}: a name check, no warning (human.inc:726)');
  eq(doPlan(hostEv('board in'), 3, tVol).r.warn, [{ k: 'ide.kit.w.noCtx', p: { what: 'volume' } }], '{on board in}: a volume check warns w.noCtx');
  const sk = P.scopeAt(srcOf(hostEv('"kit_event"', 'delay_ex 1')), 4);
  ok(sk.ctx === null && sk.lost.join() === 'bullet,instigator', 'scopeAt {on "x"} {delay_ex}: ctx null, lost bullet and instigator (' + JSON.stringify([sk.ctx, sk.lost]) + ')');
  // in a (define ...) body outside any reaction of its own, the event is the caller's: an events-limited check fits
  // there (cannon.inc:16-18, tank.inc:112); inside a reaction of the define it is judged as everywhere
  const tEvd = { id: 't.evd', kinds: ['ia-entity'], scope: ['handler', 'branch'], role: 'cond', code: '{if stuff "shell"\n\t@^@\n}', f: {}, events: ['bullet_hit', 'pierce'] };
  ok(doPlan('(define "d"\n\t{set "a" 1}\n\t\n)', 3, tEvd).r.refuse === null, 'a define body of actions: an events-limited check fits');
  ok(doPlan('(define "d"\n\t{if stuff "%0"\n\t\t\n\t}\n)', 3, tEvd).r.refuse === null, 'an {if} in a define body: an events-limited check fits');
  ok(doPlan('(define "d"\n\t{on %0\n\t\t\n\t}\n)', 3, tEvd).r.refuse === null, '{on %0} in a define body: the event is the caller\'s, fits');
  eq((doPlan('(define "d"\n\t{on spawn\n\t\t\n\t}\n)', 3, tEvd).r.refuse || {}).k, 'ide.kit.x.scope', '{on spawn} in a define body: an events-limited check is refused');
  eq((doPlan('{"t"\n\t{on spawn\n\t\t\n\t}\n}', 3, tEvd).r.refuse || {}).k, 'ide.kit.x.scope', 'control: {on spawn} in a block, refused');
  {
    const ds = srcOf('(define "d"\n\t{if stuff "%0"\n\t\t\n\t}\n)');
    ok(P.fits(ds, P.scopeAt(ds, 3), tEvd, base) === true, 'fits(): an events-limited check in a define body is not dimmed');
  }

  // {on "@name@" ...} filled with a game event word
  const pOv = { id: 't.ov', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on "@name@" overload\n\t@^@\n}', f: { name: { k: 'event', def: 'pierce' } }, event: '"@name@"' };
  eq(doPlan('{"t"\n\n}', 2, pOv).r.warn, [], 'quoted event name: the default (the game\'s own form) is not noted');
  eq(doPlan('{"t"\n\n}', 2, pOv, { name: 'contact' }).r.warn, [{ k: 'ide.kit.w.quoted', p: { name: 'contact' } }], 'quoted event name: contact in quotes is noted');
  eq(doPlan('{"t"\n\n}', 2, pOv, { name: 'engine on' }).r.warn, [{ k: 'ide.kit.w.quoted', p: { name: 'engine on' } }], 'quoted event name: engine on in quotes is noted');
  eq(doPlan('{"t"\n\n}', 2, pOv, { name: 'my_event' }).r.warn, [], 'quoted event name: a name of your own is not noted');

  // fits(src, scopeAt answer, piece, opts): exactly what plan() refuses as x.scope (the pane dims by it)
  const fitPieces = SAMPLES.pieces.concat([pDef, pTer, cStuff, cEff, aComp, aEff, pOv], require('./fx/kit/samples2').pieces);
  const fa = fitsAgree(fitPieces);
  ok(!fa.length, 'fits() agrees with plan() x.scope at every line of the fixture hosts (' + fa.slice(0, 4).map(f => f.id + ' ' + f.msg).join('; ') + ')');
  const fr1 = srcOf('{on pierce\n\t{call "x"}\n}\n\n'), df1 = srcOf('(define "x"\n\t{on pierce}\n\n)');
  ok(P.fits(fr1, P.scopeAt(fr1, 4), S('s.event.contact'), { kitKind: 'ia-entity' }) === true && P.fits(fr1, P.scopeAt(fr1, 4), S('s.event.contact'), { kitKind: 'stuff' }) === false, 'fits: a reaction at the top level of a fragment file (interaction kinds only)');
  ok(P.fits(df1, P.scopeAt(df1, 3), S('s.event.contact'), base) === true && P.fits(df1, P.scopeAt(df1, 3), S('s.act.sound'), base) === false, 'fits: a define body with reactions takes a reaction, not an action');
  ok(P.fits(srcOf(read('tabs.inc')), P.scopeAt(srcOf(read('tabs.inc')), 3), S('s.block.unit'), base) === true, 'fits: a top piece inside a block fits (it is added after the block)');
  ok(P.fits(null, null, S('s.act.sound'), base) === false, 'fits: no source, no answer: false, no throw');
  // seeded: the pane's first copy (no fragment file, no define body) disagrees with plan() and is caught
  const effK = s => { if (s.kind !== 'action' && s.kind !== 'value') return s.kind; let k = s.depth - 1; while (k > 0 && (s.frames[k - 1].kind === 'action' || s.frames[k - 1].kind === 'value')) k--; return k > 0 ? s.frames[k - 1].kind : 'top'; };
  const paneFits = (src, s, p) => { const sc = p.scope || []; if (sc.includes('top')) return true; if (!sc.includes(effK(s))) return false; return p.events && p.events.length ? s.ev != null && p.events.includes(s.ev) : true; };
  ok(fitsAgree(fitPieces, paneFits).some(f => /inline:(frag|defines)/.test(f.msg)), 'seeded: a fits() copy that does not know fragment files and define bodies is caught');
}

// ---- H. speed and checkpoints
{
  const chunk = read('tabs.inc').replace(/\n$/, '').split('\n'), big = [];
  let size = 0, n = 0;
  while (size < 2 * 1024 * 1024) { for (const l of chunk) { const x = l.replace('kit_tabs', 'kit_' + n); big.push(x); size += x.length + 1; } n++; }
  const src = { count: big.length, line: i => big[i - 1] }, cache = {};
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const t0 = Date.now();
  for (let i = 0; i < 100; i++) P.scopeAt(src, 1 + Math.floor(rnd() * big.length), cache);
  const ms = Date.now() - t0;
  ok(ms < 200, 'speed: scopeAt on a 2 MB source, 100 random lines with checkpoints: ' + ms + ' ms (budget 200)');
  const keys = Object.keys(cache.cp).map(Number);
  ok(keys.length > 10 && keys.every(k => k % 200 === 1), 'checkpoints every 200 lines (' + keys.length + ')');
  const L = 5001, below = keys.filter(k => k < L).length;
  P.cacheDrop(cache, L);
  const after = Object.keys(cache.cp).map(Number);
  ok(after.every(k => k < L) && after.length === below, 'cacheDrop keeps the checkpoints above the changed line');
  eq(P.scopeAt(src, 9000, cache), P.scopeAt(src, 9000), 'after cacheDrop the answer is the same');
  // a drag reads the lines up to the gap, not 300 lines below it (the page counts its line reads)
  {
    const F = ['{"my_unit"', '\t{on spawn'].concat(new Array(600).fill('\t\t{tags add "x"}'), ['\t}', '}']);
    let reads = 0; const fs2 = { count: F.length, line: i => { reads++; return F[i - 1]; } };
    const nm = P.scanNames(fs2), c2 = {}; reads = 0;
    for (let g = 3; g <= 12; g++) P.plan(fs2, { gap: g }, S('s.act.flag'), {}, Object.assign({}, base, { names: nm, cache: c2 }));
    ok(reads < 600, 'plan at 10 gaps near the top of a 600-line file reads fewer lines than the file holds (' + reads + ')');
  }
  // an edit below a checkpoint: a stale cache answers wrong, cacheDrop at the edited line makes it right again
  for (let i = 1; i <= big.length; i += 37) P.scopeAt(src, i, cache);
  const E = 5100;
  ok(Object.keys(cache.cp).map(Number).some(k => k > E && k < 9000), 'checkpoints between the edit and line 9000 exist');
  const before = big[E - 1];
  big[E - 1] = '{"kit_open_edit" ' + before;   // one more frame stays open below the edit
  const stale = JSON.parse(JSON.stringify(cache)), fresh = P.scopeAt(src, 9000);
  ok(JSON.stringify(P.scopeAt(src, 9000, stale)) !== JSON.stringify(fresh), 'control: the edit changes the answer, so a stale checkpoint would show');
  P.cacheDrop(cache, E);
  eq(P.scopeAt(src, 9000, cache), fresh, 'after an edit and cacheDrop at that line: the same answer as without a cache');
  big[E - 1] = before;
}

// ---- I. scanNames
{
  const t = read('names.inc'), N = P.scanNames(srcOf(t));
  eq(N.flags, ['flag_a', 'flag_b', 'flag_c'], 'scanNames flags (set, if, else not)');
  eq(N.events, ['custom_a'], 'scanNames events (quoted reactions)');
  eq(N.views, ['view_a', 'view_b'], 'scanNames views');
  eq(N.sounds, ['snd_a', 'move'], 'scanNames sounds');
  eq(N.anims.slice().sort(), ['anim_a', 'anim_b'], 'scanNames animations');
  eq(N.tags, ['kit_names', 'tank', 'ru', 'smoking'], 'scanNames tags');
  eq(N.calls, ['called_a', 'called_b'], 'scanNames calls (call, delay_effect)');
  eq(N.helpers, ['pos_helper', 'named_helper'], 'scanNames helper calls');
  eq(N.includes, ['inc_a.inc'], 'scanNames includes');
  eq(N.defines, [{ name: 'pos_helper', params: ['0', '1'], named: false, line: 1, events: ['"%0'], calls: [] },
    { name: 'named_helper', params: ['place', 'snd'], named: true, line: 6, events: ['fire %place'], calls: ['pos_helper'] }], 'scanNames defines: positional and named inputs, inner events, calls');
  const many = ['{"m"', '\t{on spawn'];
  for (let i = 0; i < 300; i++) many.push('\t\t{set "f' + i + '" 1}');
  many.push('\t}', '}');
  ok(P.scanNames(srcOf(many.join('\n'))).flags.length === 200, 'scanNames caps a list at 200');
}

// ---- J. words.json
{
  eq(WORDS.events, [...IALINT.EVENTS].filter(e => e !== 'inflammation_time').sort(), 'words.events = ialint EVENTS minus inflammation_time');
  eq(WORDS.actions, require('../../fxlint/actions.json').actions.slice().sort(), 'words.actions = fxlint actions.json');
  eq(WORDS.places, [...IALINT.VANILLA_PLACES].sort(), 'words.places = ialint VANILLA_PLACES');
  const cpp = path.join(ROOT, 'game', 'interaction', '');
  if (fs.existsSync(cpp)) {
    const want = [...fs.readFileSync(cpp, 'latin1').matchAll(/^REGISTER_CONDITION\((\w+),/gm)].map(m => m[1]).sort();
    eq(WORDS.conditions, want, 'words.conditions = REGISTER_CONDITION names of  (' + want.length + ')');
  } else console.log('skip core: words.conditions (game/interaction is not in this checkout)');
  ok(WORDS.containers.includes('tear') && !WORDS.containers.includes('if') && WORDS.containers.includes('spawn'), 'words.containers: actions.json containers without if/delay, plus tear');
  ok(WORDS.terrains.length === 18 && WORDS.terrains.includes('shallow_water') && WORDS.ables.length === 22, 'words: 18 terrains, 22 ables');
  ok(Object.keys(WORDS.ctxOfEvent).every(e => WORDS.events.includes(e)), 'ctxOfEvent keys are engine events');
  ok(Object.keys(WORDS.ctxOfCond).every(c => WORDS.conditions.includes(c)), 'ctxOfCond keys are conditions');
  ok((WORDS.helperEvents.pz1_sound || []).includes('"add_movement_sound'), 'helperEvents: pz1_sound reacts to "add_movement_sound" (a quoted name keeps its leading quote)');
  ok(Object.keys(WORDS.ctxOfAct).every(k => WORDS.actions.includes(k.split(' ')[0])), 'ctxOfAct keys start with an action');
  ok(['instigator', 'source', 'bullet'].every(w => WORDS.ctxOfEvent.break_armor.includes(w) && WORDS.ctxOfEvent.break_armor_again.includes(w)), 'ctxOfEvent: break_armor carries the bullet, its source and the instigator');
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ide', 'kit', 'words.js'), '--check'], { encoding: 'utf8', shell: false });
  const outp = (r.stdout || '') + (r.stderr || '');
  if (/^skip /m.test(outp)) console.log('note core: words.js --check: ' + outp.trim().split('\n').filter(l => /^skip/.test(l)).join('; '));
  ok(r.status === 0, 'words.js --check: words.json matches the rebuild (' + outp.trim().split('\n').pop() + ')');
}

// ---- K. route answer
{
  const fake = INDEX._make(() => [
    { id: 'sample', pieces: { mod: { group: 'sample', pieces: SAMPLES.pieces } }, lang: { mod: SAMPLES.rows } },
    { id: 'gone', pieces: { absent: true }, lang: { absent: true } },
    { id: 'broken', pieces: { error: new Error('boom') }, lang: { absent: true } }
  ]);
  const L = fake.load();
  eq(L.groups.map(g => g.id + ':' + g.state), ['sample:ok', 'gone:absent', 'broken:error'], 'load: group states');
  ok(L.errors.some(e => /^broken: .*boom/.test(e)), 'load: a broken group is named with its error');
  const c = fake.catalog('ia-entity', 'ru', { game: true });
  eq(Object.keys(c), ['v', 'kind', 'lang', 'game', 'sections', 'views', 'pieces', 'words', 'kinds', 'withPieces'], 'catalog: shape');
  ok(/^[0-9a-f]{12}$/.test(c.v) && c.v === fake.catalog('lng', 'zh', {}).v && c.v === fake.catalog('ia-entity', 'ru', { game: true }).v, 'catalog: v stable across kinds and languages');
  ok(c.kind === 'ia-entity' && c.lang === 'ru' && c.game === true && fake.catalog('ia-entity', 'ru', { game: false }).game === false, 'catalog: kind, lang, game flag');
  ok(c.pieces.length === SAMPLES.pieces.length, 'catalog ia-entity: its pieces and the sdl pieces');
  const ps = c.pieces.find(p => p.id === 's.act.sound');
  const ru = (rows, k) => (rows.find(r => r[0] === k) || [])[2];
  const sRu = k => ru(SAMPLES.rows, 'ide.kit.p.' + k), cRu = k => ru(COMMON, 'ide.kit.' + k);
  ok(RE_CYR.test(sRu('s.act.sound.d')) && RE_CYR.test(cRu('fk.number')), 'the ru rows the catalog cases expect are Cyrillic');
  ok(ps.title === 'Title s.act.sound' && ps.titleEn === 'Title s.act.sound' && ps.what === sRu('s.act.sound.d'), 'catalog: an empty ru title falls back to English, what in ru');
  const fn = ps.parts.find(x => x.f === 'name'), fv = ps.parts.find(x => x.f === 'vol');
  ok(fn.label === sRu('s.act.sound.f.name') && fn.hint === sRu('s.act.sound.f.name.h') && fv.label === cRu('fk.number') && fv.min === 0 && fv.max === 10, 'catalog parts: own label and hint, else the field kind label; min and max kept');
  ok(ps.parts.filter(x => typeof x === 'string').every(x => !/@/.test(x)), 'catalog parts: a text part never holds a marker');
  ok(ps.key === 'resource/set/interaction_entity/airborne.inc' && ps.line === 4 && ps.event === null && ps.watch === undefined, 'catalog: key and line from src, event null, no watch');
  ok(c.pieces.find(p => p.id === 's.cond.side').watch === sRu('s.cond.side.w'), 'catalog: watch row');
  ok(c.pieces.find(p => p.id === 's.event.spawn').event === 'spawn' && c.pieces.find(p => p.id === 's.cond.stuff').events.join() === 'bullet_hit,pierce', 'catalog: event and events');
  ok(c.sections.length === SEC.forKind('ia-entity').length && c.sections.find(s => s.id === 'ia.adv').adv === true && c.sections.find(s => s.id === 'ia.start').title === cRu('s.ia.start') && RE_CYR.test(cRu('s.ia.start')), 'catalog: sections with titles and adv');
  ok(c.views['ia.ideas.show'].length === 10, 'catalog: views');
  // every list the planner reads from words (kitPlan W) is sent: the page plans with these words only
  eq(Object.keys(c.words).sort(), ['ables', 'containers', 'ctxOfAct', 'ctxOfCond', 'ctxOfEvent', 'events', 'helperEvents', 'places', 'terrains', 'valueBlocks'], 'catalog: words');
  ok(['events', 'ctxOfEvent', 'ctxOfCond', 'ctxOfAct', 'helperEvents', 'containers', 'valueBlocks'].every(k => JSON.stringify(c.words[k]) === JSON.stringify(WORDS[k])), 'catalog: the planner\'s words are the words module\'s');
  {
    // planned through the catalog's words, as the page does (review round 2: the page never warned w.quoted)
    const PW = kitPlan().use(c.words), qOv = { id: 't.ovq', kinds: ['ia-entity'], scope: ['block'], role: 'event', code: '{on "@name@" overload\n\t@^@\n}', f: { name: { k: 'event', def: 'pierce' } }, event: '"@name@"' };
    eq(PW.plan(srcOf('{"t"\n\n}'), { gap: 2 }, qOv, { name: 'contact' }, base).warn, [{ k: 'ide.kit.w.quoted', p: { name: 'contact' } }], 'catalog words: contact typed into {on "..."} warns w.quoted');
    eq(PW.plan(srcOf('{"t"\n\t{on "kit_event"\n\t\t{delay 1\n\n\t\t}\n\t}\n}'), { gap: 4 }, { id: 't.cv', kinds: ['ia-entity'], scope: ['timer'], role: 'cond', code: '{if volume "body"\n}', f: {} }, {}, base).warn,
      [{ k: 'ide.kit.w.delay', p: {} }], 'catalog words: a volume check in a delay under a reaction of your own warns w.delay');
  }
  ok(c.kinds.lng === cRu('k.lng') && RE_CYR.test(c.kinds.lng), 'catalog: kind titles');
  const lng = fake.catalog('lng', 'en', {});
  eq(lng.pieces.map(p => p.id).sort(), ['s.data.mp', 's.sdl.comment'], 'catalog lng: the sdl pieces only');
  eq(lng.sections.slice().sort((a, b) => a.order - b.order).map(s => s.id), ['lng.whole-file', 'sdl.any', 'sdl.files'], 'catalog lng: its own section and the sdl ones, in order');
  ok(fake.catalog('none', 'en', {}).pieces.length === 0, 'catalog none: no pieces');
  const notIa = INDEX._make(() => [{ id: 'nk', pieces: { mod: { group: 'nk', pieces: [Object.assign({}, S('s.sdl.comment'), { id: 's.sdl.notia', notKinds: ['ia-entity'] }), S('s.sdl.comment')] } }, lang: { mod: [] } }]);
  eq(notIa.catalog('ia-entity', 'en', {}).pieces.map(p => p.id), ['s.sdl.comment'], 'catalog: a piece whose notKinds holds the kind is left out');
  eq(notIa.catalog('sdl', 'en', {}).pieces.map(p => [p.id, p.notKinds]), [['s.sdl.notia', ['ia-entity']], ['s.sdl.comment', undefined]], 'catalog: other kinds list it, with its notKinds');
  eq(doPlan('{"a"\n\n}', 2, Object.assign({}, S('s.sdl.comment'), { notKinds: ['ia-entity'] })).r.refuse, { k: 'ide.kit.x.kind', p: { kind: 'sdl', kind2: 'ia-entity' } }, 'plan: notKinds refuses that kind');
  const lua = fake.catalog('bot-lua', 'en', {});
  ok(lua.pieces.length === 0 && lua.sections.length === 0, 'catalog bot-lua: no sections, no pieces (sdl pieces are not Lua)');
  for (const [k, l] of [['Bad', 'en'], ['a', 'en'], ['../x', 'en'], ['x'.repeat(30), 'en'], ['foo-bar', 'en'], ['ia-entity', 'de'], ['ia-entity', ''], [null, 'en']]) {
    let st = 0; try { fake.catalog(k, l, {}); } catch (e) { st = e.status; }
    ok(st === 400, 'catalog 400 for kind ' + JSON.stringify(k) + ' lang ' + JSON.stringify(l));
  }
  let real = null; try { real = INDEX.catalog('ia-entity', 'en', { game: false }); } catch (e) { real = null; }
  ok(real && Array.isArray(real.pieces) && real.kind === 'ia-entity', 'the real catalog answers without throwing');
}

// ---- L. the content rules catch seeded faults (one fault per piece and per lang row)
{
  const SEED = require('./fx/kit/seeded');
  const rows = {}; for (const r of SEED.rows) rows[r[0]] = r.slice(1);
  const res = contentCheck(SEED.pieces, rows, { oneScope: true });
  for (const p of SEED.pieces.filter(x => x.want)) {
    const got = res.fails.filter(f => f.id === p.id).map(f => f.rule);
    if (LIMIDS.size || p.want !== 'lim') ok(got.includes(p.want), 'seeded ' + p.id + ' is caught by rule ' + p.want + ' (got ' + (got.join(',') || 'nothing') + ')');
  }
  for (const [r, rule] of SEED.langFaults) {
    if (rule === 'modname' && !MODNAMES.length) { console.log('skip core: seeded mod name (no refmods folder)'); continue; }
    const got = res.fails.filter(f => f.id === r[0]).map(f => f.rule);
    const hostTitle = rule === 'title' ? res.fails.filter(f => f.id === 'z.seed.stop').map(f => f.rule) : [];
    if (LIMIDS.size || rule !== 'modname') ok(got.includes(rule) || hostTitle.includes(rule), 'seeded lang row ' + r[0] + ' is caught by rule ' + rule + ' (got ' + (got.concat(hostTitle).join(',') || 'nothing') + ')');
  }
  // network rules: a missing language in the watch-out is named; the right watch-out, a bare "safe" and a long title are no fault
  ok(res.fails.some(f => f.id === 'z.seed.netzh' && f.rule === 'network' && /^zh /.test(f.msg)) && !res.fails.some(f => f.id === 'z.seed.netzh' && f.rule === 'network' && !/^zh /.test(f.msg)), 'seeded z.seed.netzh: only the zh watch-out is named');
  ok(!res.fails.some(f => /z\.seed\.netok/.test(f.id)), 'a rand piece whose watch-out holds the network sentence in all four languages: no fault');
  for (const v of ['Calls a safe idle later.', 'Mine armed or safe.', 'Not tried in a network game.']) {
    ok(!rowFaults(['k', v, v, v, v]).some(([r]) => r === 'safe' || r === 'machine'), 'a bare "safe" is no fault: ' + v);
  }
  ok(res.warns.some(w => w.id === 'z.seed.long' && w.rule === 'title' && /^ru title is long/.test(w.msg)), 'seeded z.seed.long: a ru title over 48 characters is warned');
  ok(!res.fails.some(f => f.id === 'z.seed.long' || f.id === 'ide.kit.p.z.seed.long'), 'seeded z.seed.long: the long title is a warning, no fault');
  // the planner pass over pieces catches a check that is never true in the piece's own event, and a clean piece passes
  const pBad = { id: 'z.plan.ctx', group: 'seed', kinds: ['ia-entity'], scope: ['handler'], events: ['spawn'], role: 'cond', code: '{if volume "body"\n\t@^@\n}', f: {} };
  ok(planContent([pBad]).some(f => f.id === 'z.plan.ctx' && f.rule === 'plan' && /noCtx/.test(f.msg)), 'planner pass: a volume check limited to spawn is caught');
  ok(planContent([Object.assign({}, pBad, { id: 'z.plan.ok', events: ['contact'] })]).length === 0, 'planner pass: the same check limited to contact is clean');
  const hosts = SEED.pieces.filter(x => !x.want).map(x => x.id);
  const stray = res.fails.filter(f => hosts.includes(f.id) && f.rule !== 'title');
  ok(!stray.length, 'seeded: the host pieces raise nothing else (' + stray.map(f => f.id + ' ' + f.rule + ' ' + f.msg).join('; ') + ')');
  const iaS = SAMPLES.pieces.filter(p => p.kinds.includes('ia-entity')), iaIds = iaS.map(p => 'ide.kit.p.' + p.id);
  const sRows = Object.fromEntries(SAMPLES.rows.filter(r => iaIds.some(k => r[0] === k || r[0].indexOf(k + '.') === 0)).map(r => [r[0], r.slice(1)]));
  const clean = contentCheck(iaS, sRows, {});
  const cf = clean.fails.filter(f => f.rule !== 'empty' && f.rule !== 'identical' && f.rule !== 'translated');
  ok(!cf.length, 'the sample pieces pass the content rules (' + cf.slice(0, 5).map(f => f.id + ' ' + f.rule + ' ' + f.msg).join('; ') + ')');
  // s.act.call calls a reaction nobody has; s.cond.side asks for a side in a spawn reaction (both are planner warning cases)
  const ia = ialintCase(SAMPLES.pieces.filter(p => p.id !== 's.act.call' && p.id !== 's.cond.side'), path.join(scratch, 'ialint-samples'));
  ok(!ia.length, 'ialint on the sample pieces: no INT error (' + ia.map(f => f.id + ' ' + f.msg).join('; ') + ')');
  const seededIa = ialintCase([Object.assign({}, S('s.event.spawn'), { id: 'z.dup', scope: ['top'], code: '{"kit_dupe"\n\t{on spawn\n\t}\n\t{on spawn\n\t}\n}' })], path.join(scratch, 'ialint-seeded'), GAME);
  ok(seededIa.some(f => f.id === 'z.dup' && /INT_EVENT_DUP/.test(f.msg)), 'ialint case: a seeded duplicate reaction is caught and named');
}
// ---- M. round 2: groups, catalog fields, the generic scope, whole-file and multiplayer refusals
const SAMPLES2 = require('./fx/kit/samples2');
const S2 = id => SAMPLES2.pieces.find(p => p.id === id);
{
  ok(INDEX.GROUPS.length === 47 && INDEX.GROUPS_V1.length === 16 && INDEX.GROUPS_R2.length === 31 && INDEX.GROUPS_R2.every(g => INDEX.GROUPS.includes(g)), 'index: 16 v1 groups and the 31 round 2 groups');
  const src2 = fs.readFileSync(path.join(ROOT, 'tools', 'ide', 'kit', 'index.js'), 'utf8');
  for (const g of INDEX.GROUPS_R2) ok(src2.includes("require('./pieces/" + g + "')") && src2.includes("require('./lang/" + g + "')"), 'index: literal require paths for ' + g);
  const st = INDEX.load().groups;
  ok(INDEX.GROUPS_R2.every(g => { const x = st.find(y => y.id === g); return x && ['ok', 'absent', 'error'].includes(x.state); }), 'index: every round 2 group loads as ok, absent or error');
  // catalog: no, size, mp, whole passed through; a kind gets the pieces of its kinds whose section its tree lists
  const fake = INDEX._make(() => [
    { id: 'sample', pieces: { mod: { group: 'sample', pieces: SAMPLES.pieces } }, lang: { mod: SAMPLES.rows } },
    { id: 'r2', pieces: { mod: { group: 'r2', pieces: SAMPLES2.pieces } }, lang: { mod: SAMPLES2.rows } }
  ]);
  const mi = fake.catalog('mi', 'en', {});
  const u = mi.pieces.find(p => p.id === 'r.mi.unit'), w = mi.pieces.find(p => p.id === 'r.mi.whole'), sp = mi.pieces.find(p => p.id === 'r.mi.sp');
  ok(u && u.no === 9002 && u.size === 'small' && u.mp === 'yes' && u.whole === undefined && JSON.stringify(u.scope) === '["in:mission"]', 'catalog mi: no, size, mp and the scope tokens passed through');
  ok(w && w.whole === true && sp && sp.mp === 'no', 'catalog mi: whole and mp no passed through');
  ok(!mi.pieces.some(p => p.id === 'r.mi.wrongsec') && !fake.catalog('ia-entity', 'en', {}).pieces.some(p => p.id === 'r.mi.wrongsec'), 'catalog: a piece whose section is not of its kind is in neither catalog');
  ok(mi.pieces.some(p => p.id === 's.sdl.comment') && mi.pieces.some(p => p.id === 'r.sdl.file') && !mi.pieces.some(p => p.id === 'r.ent.mass' || p.id === 's.act.sound'), 'catalog mi: its pieces and the sdl pieces, not those of other kinds');
  const ia = fake.catalog('ia-entity', 'en', {});
  ok(ia.pieces.every(p => p.no === undefined || p.id === 'r.sdl.file') && ia.pieces.find(p => p.id === 's.act.sound').size === undefined, 'catalog ia-entity: v1 pieces carry no no, size, mp or whole');
  ok(ia.pieces.some(p => p.id === 'r.sdl.file'), 'catalog ia-entity: the sdl.files pieces too (every SDL kind lists sdl.files)');
  for (const k of ['entity-def', 'props']) ok(fake.catalog(k, 'en', {}).pieces.some(p => p.id === 'r.ent.mass'), 'catalog ' + k + ': the entity piece for entity-def and props');
  ok(fake.catalog('ia-terrain', 'en', {}).pieces.some(p => p.id === 'r.ter.fx') && !fake.catalog('ia-terrain', 'en', {}).pieces.some(p => p.id === 's.act.sound'), 'catalog ia-terrain: its pieces, not the ia-entity ones');
  ok(fake.catalog('props', 'en', {}).kinds.props === 'Shared unit data (properties)', 'catalog: the props kind has a title');
  ok(mi.sections.find(s => s.id === 'mi.adv').adv === true && mi.sections.find(s => s.id === 'mi.start.whole-file').parent === 'mi.start', 'catalog mi: sections with parent and adv');

  // the generic scope
  const B2 = { editable: true, ver: 3 };
  const gp = (text, gap, p, kk, o) => { const r = P.plan(srcOf(text), { gap }, p, {}, Object.assign({ kitKind: kk || 'mi' }, B2, o || {})); return { r, out: r.refuse ? text : FIX.apply(text, r.edits) }; };
  const MI = '{mission\n\t{Human "a" 0xd000\n\t\t{Position 0 0}\n\t}\n\n}\n';
  let x = gp(MI, 5, S2('r.mi.unit'));
  eq(x.r.refuse, null, 'in:mission: fits a gap in {mission');
  eq(x.r.edits, [{ line: 5, col: 1, endCol: 1, text: '\t{Human "kit_soldier" 0xd000\n\t\t{Position 0 0}\n\t}' }], 'in:mission: the blank line is replaced, indent of the place (tabs)');
  eq([x.r.from, x.r.to, x.r.fields], [5, 7, [{ name: 'name', k: 'text', line: 5, col: 10, len: 11 }]], 'in:mission: from, to, field after the edit');
  ok(!balance(x.out), 'in:mission: balanced after the insert');
  eq(gp(MI, 3, S2('r.mi.unit')).r.refuse, { k: 'ide.kit.x.scope', p: { where: 'in:mission', n: 2, ev: '' }, near: 2 }, 'in:mission inside {Human: x.scope with where and the nearest line');
  ok(gp(MI, 3, S2('r.mi.any')).r.refuse === null && gp(MI, 1, S2('r.mi.any')).r.refuse === null, 'any: fits inside a block and at the top level');
  ok(gp(MI, 1, S2('r.mi.top')).r.refuse === null && gp(MI, 8, S2('r.mi.top')).r.refuse === null, 'top: fits where no block is open');
  x = gp(MI, 3, S2('r.mi.top'));
  ok(x.r.refuse === null && x.r.from === 7 && JSON.stringify(x.r.warn) === '[{"k":"ide.kit.addedAfter","p":{"n":1}}]', 'top inside a block: added after the outermost block, warning addedAfter (' + JSON.stringify([x.r.from, x.r.warn]) + ')');
  ok(gp(MI, 3, S2('r.mi.named')).r.refuse.k === 'ide.kit.x.scope', 'in:*: an unquoted head ({Human) does not take it');
  ok(gp('{mission\n\t{"kit_trig"\n\t\t\n\t}\n}', 3, S2('r.mi.named')).r.refuse === null, 'in:*: a quoted head ({"kit_trig") takes it');
  ok(gp(MI, 3, Object.assign({}, S2('r.mi.unit'), { scope: ['in:human'] })).r.refuse === null, 'in:<word>: the head word in lower case ({Human = in:human)');
  ok(gp('{mission\n\t; {Human "b"\n\t"{x"\n\n}', 4, S2('r.mi.unit')).r.refuse === null, 'a brace in a ; comment or in a string opens no block');
  ok(gp('(define "kit_h"\n\t\n)', 2, S2('r.mi.define')).r.refuse === null && gp('(define "kit_h"\n\t\n)', 2, S2('r.mi.named')).r.refuse.k === 'ide.kit.x.scope', 'a paren block: (define "x" = in:define, not in:*');
  ok(gp('{mission\n\n}', 2, S2('r.mi.unit')).r.refuse === null && gp('{Mission\n\n}', 2, S2('r.mi.unit')).r.refuse === null, 'the head word is compared in lower case');
  // the v1 sdl pieces keep their v1 placement in the round 2 kinds
  ok(gp(MI, 3, S('s.sdl.comment')).r.refuse === null && gp(MI, 3, S('s.data.mp')).r.refuse === null, 'a v1 sdl piece in a .mi: v1 placement (any block)');
  // whole-file pieces
  eq(gp(MI, 1, S2('r.mi.whole')).r.refuse, { k: 'ide.kit.x.whole', p: {} }, 'whole: refused in a file with text (x.whole)');
  for (const [t, what] of [['', 'an empty doc'], ['\n\n', 'blank lines'], ['; my mission\n\n', 'a ; comment'], ['﻿\n', 'a BOM only']]) {
    const y = gp(t, 1, S2('r.mi.whole'));
    ok(y.r.refuse === null && /\{mission\n\t\{kit_whole 1\}\n\}/.test(y.out) && !balance(y.out), 'whole: fits ' + what);
  }
  eq(gp('{x\n}\n', 1, S2('r.sdl.file'), 'ia-entity').r.refuse, { k: 'ide.kit.x.whole', p: {} }, 'whole: the same in an interaction file');
  ok(gp('', 1, S2('r.sdl.file'), 'ia-entity').r.refuse === null, 'whole: an sdl.files piece into an empty interaction file');
  // multiplayer
  for (const rel of ['map/multi/2x2_kit/kit.mi', 'resource/map/multi/2x2_kit/kit.mi', 'kit.pak::map/multi/a/b.mi', 'MAP\\MULTI\\a\\b.mi']) eq(gp(MI, 5, S2('r.mi.sp'), 'mi', { rel }).r.refuse, { k: 'ide.kit.x.mp', p: {} }, 'mp no under map/multi/: x.mp (' + rel + ')');
  for (const rel of ['map/single/kit/kit.mi', undefined, '']) ok(gp(MI, 5, S2('r.mi.sp'), 'mi', { rel }).r.refuse === null, 'mp no outside map/multi/: fits (' + rel + ')');
  ok(gp(MI, 5, S2('r.mi.unit'), 'mi', { rel: 'map/multi/a/b.mi' }).r.refuse === null && gp(MI, 5, S2('r.mi.any'), 'mi', { rel: 'map/multi/a/b.mi' }).r.refuse === null, 'mp yes and unknown: fit a multiplayer map');
  const ms = srcOf(MI);
  ok(P.fits(ms, P.scopeAt(ms, 5), S2('r.mi.sp'), { kitKind: 'mi', rel: 'map/multi/a/b.mi' }) === false && P.fits(ms, P.scopeAt(ms, 5), S2('r.mi.sp'), { kitKind: 'mi' }) === true, 'fits: mp no is dimmed under map/multi/ when rel is given');
  ok(P.fits(ms, P.scopeAt(ms, 1), S2('r.mi.whole'), { kitKind: 'mi' }) === false && P.fits(srcOf(''), P.scopeAt(srcOf(''), 1), S2('r.mi.whole'), { kitKind: 'mi' }) === true, 'fits: a whole-file piece only in an empty file');
  ok(P.fits(ms, P.scopeAt(ms, 3), S2('r.mi.unit'), { kitKind: 'mi' }) === false && P.fits(ms, P.scopeAt(ms, 5), S2('r.mi.unit'), { kitKind: 'mi' }) === true, 'fits: the generic scope');
  // other kinds
  const TER = '{effects\n\t{"sand"\n\t\t{"hit"\n\t\t\t{on hit\n\t\t\t\t\n\t\t\t}\n\t\t}\n\t}\n}';
  x = gp(TER, 5, S2('r.ter.fx'), 'ia-terrain');
  ok(x.r.refuse === null && x.r.edits[0].text === '\t\t\t\t{spawn "kit_dust"}', 'ia-terrain in:on: fits {on hit, four tabs');
  ok(gp(TER, 3, S2('r.ter.fx'), 'ia-terrain').r.refuse.k === 'ide.kit.x.scope', 'ia-terrain in:on: refused in a quoted block');
  ok(gp('{game_entity\n\t{mass 1}\n\n}', 3, S2('r.ent.mass'), 'entity-def').r.refuse === null && gp('{game_entity\n\t{mass 1}\n\n}', 3, S2('r.ent.mass'), 'props').r.refuse === null, 'entity piece: entity-def and props');
  eq(gp('{game_entity\n\n}', 2, S2('r.ent.mass'), 'mi').r.refuse, { k: 'ide.kit.x.kind', p: { kind: 'entity-def', kind2: 'mi' } }, 'entity piece in a .mi: x.kind');
  eq(gp(MI, 5, S2('r.mi.unit'), 'ia-entity').r.refuse, { k: 'ide.kit.x.kind', p: { kind: 'mi', kind2: 'ia-entity' } }, 'mission piece in an interaction file: x.kind');
  // no duplicate check for the new kinds: the same block twice is added
  ok(gp('{mission\n\t{Human "kit_soldier" 0xd000\n\t\t{Position 0 0}\n\t}\n\n}', 5, S2('r.mi.unit')).r.refuse === null, 'no duplicate check in a .mi');
  // never throws; kitPlan from its own text plans a generic piece like the module
  ok(P.plan(srcOf(MI), { gap: 2 }, { id: 'z', kinds: ['mi'], scope: 5, code: '{x}' }, {}, { kitKind: 'mi' }).refuse.k === 'ide.kit.notAdded', 'a broken round 2 piece: notAdded, no throw');
  const p3 = vm.runInNewContext('(' + kitPlan.toString() + ')', {})().use(WORDS);
  eq(JSON.parse(JSON.stringify(p3.plan(srcOf(MI), { gap: 3 }, S2('r.mi.top'), {}, { kitKind: 'mi', editable: true }))), JSON.parse(JSON.stringify(P.plan(srcOf(MI), { gap: 3 }, S2('r.mi.top'), {}, { kitKind: 'mi', editable: true }))), 'kitPlan from toString: a generic piece plans like the module');
  // the fixture builder of the content pass makes a legal place for every scope token of the sample pieces
  for (const p of SAMPLES2.pieces.filter(p => p.id !== 'r.mi.wrongsec')) { const f = r2Plan(p); ok(!f.length, 'round 2 plan pass: ' + p.id + ' clean (' + f.map(z => z.what).join('; ') + ')'); }
  ok(r2Plan(Object.assign({}, S2('r.mi.unit'), { id: 'z.r2.bad', code: '{Human "@name@" 0xd000\n\t{Position 0 0}' })).some(f => /braces|parse/.test(f.what)), 'seeded: an unclosed brace in a round 2 piece is caught by the plan pass');
  ok(r2Plan(Object.assign({}, S2('r.mi.unit'), { id: 'z.r2.where', scope: ['in:'] })).length > 0, 'seeded: a scope token with no word is caught');
  ok(r2Contract('z', { group: 'z', pieces: [Object.assign({}, S2('r.mi.unit'), { no: 1, id: 'wrong.id' })] }, [], [{ no: 1, id: 'b.ter.underwater', sec: 'ter.water', size: 'medium', kind: 'ia-terrain', group: 'z' }]).some(f => /id is wrong.id/.test(f.what)), 'seeded: the contract check names a wrong id');
}
const coreOk = cbad === 0;
console.log('core: ' + (coreOk ? 'PASS' : 'FAIL') + ' (' + (cn - cbad) + ' of ' + cn + ' cases)');

// =====================================================================================================================
// CONTENT: the real groups that are present
let contentState = 'skip';
{
  const L = INDEX.load();
  const V1 = new Set(INDEX.GROUPS_V1), R2 = new Set(INDEX.GROUPS_R2);
  const isV1 = g => V1.has(g.id || g);
  const present = L.groups.filter(g => g.state === 'ok').map(g => g.id), absent = L.groups.filter(g => g.state === 'absent').map(g => g.id);
  const broken = L.groups.filter(g => g.state === 'error');
  const absentV1 = absent.filter(isV1), absentR2 = absent.filter(g => R2.has(g));
  console.log('content: ' + present.length + ' of ' + L.groups.length + ' groups present' + (absentV1.length ? ' (v1 absent: ' + absentV1.join(', ') + ')' : ''));
  // round 2 groups not written yet are named in one line and skipped (they arrive while the round runs)
  console.log('content: round 2 absent, skip (' + absentR2.length + ' of ' + R2.size + '): ' + (absentR2.join(', ') || 'none'));
  const fails = [];
  for (const g of broken) fails.push({ id: g.id, group: g.id, rule: 'load', msg: g.error });
  // v1 ships all 16 groups: a missing pieces file is a release fault, not a skip
  for (const id of absentV1) fails.push({ id, group: id, rule: 'load', msg: 'pieces/' + id + '.js is missing (v1 ships every group)' });
  for (const e of L.errors) if (!broken.some(g => e.indexOf(g.id + ':') === 0)) fails.push({ id: 'load', group: e.split(':')[0], rule: 'load', msg: e });
  // v1 content rules over the v1 pieces and their rows (the round 2 pieces have their own contract below)
  const v1Pieces = L.pieces.filter(p => V1.has(p.group)), r2Pieces = L.pieces.filter(p => R2.has(p.group));
  const r2Ids = new Set(r2Pieces.map(p => p.id));
  const v1Rows = {};
  for (const k of Object.keys(L.rows)) { const pid = (/^ide\.kit\.p\.(.+?)(\.d|\.w|\.n|\.f\..*)?$/.exec(k) || [])[1]; let r2 = false; if (pid !== undefined) for (const id of r2Ids) if (k === 'ide.kit.p.' + id || k.indexOf('ide.kit.p.' + id + '.') === 0) { r2 = true; break; } if (!r2) v1Rows[k] = L.rows[k]; }
  if (present.length) {
    const t0 = Date.now();
    const res = contentCheck(v1Pieces, v1Rows, { common: true, game: GAME });
    for (const f of res.fails) fails.push(f);
    if (!GAME) console.log('skip content: check with the game (no game found)');
    // rule 1: counts per v1 section, over the v1 pieces (only when every v1 group is present)
    if (!absentV1.length && !broken.some(isV1)) {
      for (const s of SEC.SECTIONS) {
        if (s.view) { for (const id of SEC.VIEWS[s.id]) if (!L.pieces.some(p => p.id === id)) fails.push({ id: s.id, group: '', rule: 'view', msg: 'view id ' + id + ' is no piece' }); continue; }
        if (s.count === undefined) continue;
        const n = v1Pieces.filter(p => p.sec === s.id || String(p.sec).indexOf(s.id + '.') === 0).length;
        if (n !== s.count) fails.push({ id: s.id, group: '', rule: 'count', msg: 'section ' + s.id + ' holds ' + n + ' pieces, design 4.2 says ' + s.count });
      }
    } else console.log('skip content: counts per section (not every v1 group is present)');
    // rule 2 on the route answer: no marker in a text part
    for (const k of KIND_IDS.filter(k => k !== 'bot-lua')) for (const p of INDEX.catalog(k, 'en', {}).pieces) if (p.parts.some(x => typeof x === 'string' && /@/.test(x) && !/^[^@]*$/.test(x.replace(/@/g, '')))) fails.push({ id: p.id, group: '', rule: 'parts', msg: 'a text part of the route answer holds @' });
    // the planner over every real piece: each listed scope and event, defaults, into a host made for it
    for (const f of planContent(v1Pieces)) fails.push(f);
    for (const f of planCases(v1Pieces)) fails.push(f);
    // fits() agrees with plan() for every catalog piece over the fixture hosts (v1 and round 2: the planner is the kit's)
    for (const f of fitsAgree(L.pieces)) fails.push(f);
    // rule 9: ialint
    let ia = [];
    if (!GAME) console.log('skip content: ialint INT_CALL_UNDEFINED (no game found)');
    try { ia = ialintCase(v1Pieces, path.join(scratch, 'ialint-content'), GAME); } catch (e) { ia = [{ id: 'all', group: '', rule: 'ialint', msg: 'ialint crashed: ' + e.message }]; }
    for (const f of ia) fails.push(f);
    console.log('content: ' + v1Pieces.length + ' v1 pieces, ' + r2Pieces.length + ' round 2 pieces, ' + Object.keys(L.rows).length + ' lang rows, ' + res.warns.length + ' warnings, ' + (Date.now() - t0) + ' ms');
    // round 2: the build contract per present group, then every piece planned into a place made for its scope
    const A2 = require('./fx/kit/assign2.json'), gf = [];
    for (const g of INDEX.GROUPS_R2) {
      const st = L.groups.find(x => x.id === g);
      if (!st || st.state !== 'ok') continue;
      let mod = null, rows = null;
      try { mod = require('../kit/pieces/' + g); } catch (e) { gf.push({ group: g, no: 0, id: '', what: 'pieces file: ' + e.message.split('\n')[0] }); continue; }
      try { rows = require('../kit/lang/' + g); } catch (e) { rows = []; gf.push({ group: g, no: 0, id: '', what: 'lang file: ' + e.message.split('\n')[0] }); }
      const before = gf.length;
      for (const f of r2Contract(g, mod, rows, A2.pieces.filter(p => p.group === g))) gf.push(f);
      for (const p of r2Pieces.filter(p => p.group === g)) for (const f of r2Plan(p)) gf.push(f);
      console.log('content: round 2 ' + g + ': ' + mod.pieces.length + ' pieces, ' + (Array.isArray(rows) ? rows.length : 0) + ' lang rows, ' + (gf.length - before) + ' faults');
    }
    for (const f of gf) fails.push({ id: '#' + f.no + ' ' + f.id, group: f.group, rule: 'r2', msg: f.what });
    if (process.env.KIT_GROUP_FAULTS) fs.writeFileSync(process.env.KIT_GROUP_FAULTS, JSON.stringify(gf, null, 1));
    // pieces per kind (the route answer of every kind)
    console.log('content: pieces per kind: ' + KIND_IDS.map(k => k + ' ' + INDEX.catalog(k, 'en', {}).pieces.length).join(', '));
    const byG = {};
    for (const f of fails) byG[f.group || '?'] = (byG[f.group || '?'] || 0) + 1;
    for (const f of fails.slice(0, 200)) console.log('FAIL content ' + (f.group || '?') + ' ' + f.id + ' [' + f.rule + '] ' + f.msg);
    if (fails.length > 200) console.log('... ' + (fails.length - 200) + ' more');
    for (const w of res.warns.slice(0, 20)) console.log('warn content ' + (w.group || '?') + ' ' + w.id + ' [' + w.rule + '] ' + w.msg);
    contentState = fails.length ? 'FAIL' : 'PASS';
    console.log('content: ' + contentState + (fails.length ? ' (' + fails.length + ' faults: ' + Object.keys(byG).map(g => g + ' ' + byG[g]).join(', ') + ')' : ''));
  } else {
    if (fails.length) { for (const f of fails) console.log('FAIL content ' + f.group + ' [' + f.rule + '] ' + f.msg); contentState = 'FAIL'; }
    console.log('content: ' + (contentState === 'FAIL' ? 'FAIL' : 'skip (no group present)'));
  }
}
console.log(coreOk && contentState !== 'FAIL' ? 'PASS' : 'FAIL');
process.exit(coreOk && contentState !== 'FAIL' ? 0 : 1);
