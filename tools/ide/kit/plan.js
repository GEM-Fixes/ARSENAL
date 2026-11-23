// kit planner: where a piece fits, how it is indented, what one insert writes (design 8.1, 8.2, Appendix A and B).
// module.exports = kitPlan, ONE self-contained ES5 function: the page gets it by toString() (no closure over module
// variables, no require, no backtick, no template slot, no innerHTML). Pure: reads lines, returns edits; never writes.
//   kitPlan() -> api = { use(words) -> api, scopeAt, cacheDrop, plan, fits, compile, parse, scanNames, normEvent }
//   src   = { count, line(n) -> string }   1-based lines without line ends (the page: the editor's lines; tests: an array)
//   scopeAt(src, line, cache?) -> { kind, depth, head, frames:[{ ch, line, head, kind, event? }], event?, ev?, ctx, lost,
//                                   inDefine, block?:{ line, name, depth }, line }   = what is open at the start of `line`
//   fits(src, s, piece, opts) -> bool: s = a scopeAt answer; true exactly when plan(src, { gap: s.line }, piece, .., opts)
//     does not refuse with x.scope (opts = { kitKind, cache }; the kind, view, read-only and duplicates are not judged)
//     kind: top|block|handler|branch|timer|container|value|macro|action. event = the normalised words after {on;
//     ev = its first word ('custom' for a quoted name, '%' for a macro input). ctx = what the command carries there
//     (words of words.ctxOfEvent, reduced by delay and delay_ex) or null when unknown; lost = what a timer dropped (under
//     an event not known: every word that timer drops anywhere).
//     cache = { cp:{ <line>: frames } } kept by the caller per doc: a checkpoint every 200 lines.
//   cacheDrop(cache, fromLine): forget the checkpoints at or below a changed line (the ones above stay valid).
//   parse(code, f) -> parts ['text', { f, k, def, choices?, min?, max?, int? }, { caret:true }]   (@name@, @^@, @@)
//   compile(piece, values?) -> { text, fields:[{ name, k, off, len }], caret:off|null }   piece with parts or with code+f
//   plan(src, at, piece, values, opts) -> { edits, fields:[{ name, k, line, col, len }], caret, from, to, warn:[{ k, p }],
//     refuse:{ k, p, near?, goto? }|null, ver }   at = { gap }; opts = { kitKind, editable, why, ver, cover?, names?, cache? }
//     (cover = a box covers the text; names = a scanNames answer the caller already has; cache = the scopeAt cache of
//     the doc). near and goto are line numbers. Never throws.
//     refuse keys: ide.kit.x.view, x.cover, x.ro (p.why = opts.why), x.kind (p.kind, p.kind2 = kit kind ids; an 'sdl'
//     piece fits every kind but bot-lua and the kinds of its own notKinds list), x.scope (p.where = scope id, p.n = line, p.ev = event words), x.dup (p.ev, goto),
//     x.unknown (p.name, p.ev, goto), notAdded (an internal fault). warn keys: ide.kit.w.delay, w.noCtx (p.what = a ctx
//     word; a condition of words.ctxOfCond or an action of words.ctxOfAct), w.call (p.name), w.flag (p.name), w.mp,
//     w.ascii, w.quoted (p.name = a game event word typed into {on "@name@"}), addedAfter (p.n = line of the block it went after).
//   scanNames(src) -> { flags, events, views, sounds, anims, tags, calls, includes, helpers, defines:[{ name, params,
//     named, line, events, calls }] }  (each list at most 200; events = quoted custom handler names; calls = {call} and
//     delay_effect targets; helpers = ("name" ...) macro calls; defines[].events = {on ...} inside the define body, as
//     duplicate keys: normalised words, a leading '"' when the event name is quoted)
//   Round 2 (2026-11-21): opts.rel = the doc's path (forward slashes, lower case, optional). For every kind but ia-entity
//     a piece whose scope holds none of block handler branch timer container is placed by the generic scope: at the gap
//     the innermost open block (brace or paren; strings and ; comments skipped) and its head; it fits when its scope
//     holds 'any', or 'top' and no block is open, or 'in:<word>' = the head word in lower case, or 'in:*' and the head is
//     a quoted name. A 'top' piece dropped inside a block goes after the outermost one (w addedAfter), as in v1.
//     A whole-file piece (whole:true, scope ['empty']) fits only a file with no text but blank lines and ; comments
//     (refuse ide.kit.x.whole); mp:'no' is refused in a file under map/multi/ (ide.kit.x.mp; fits() judges it when
//     opts.rel is given). No duplicate check and only w.ascii for these; ia-entity and the v1 pieces as before.
// Author: Imperator_Aug (ARSENAL, ia-4aee087a)
'use strict';
function kitPlan() {
  var CP = 200, CAP = 200;
  // a macro input in a define body: %0 to %9 are the args, one digit (the game writes "fire_%01" = %0 then 1, and
  // "burn_%0_start"); %name a named input
  var INP = '%([0-9]|[A-Za-z_][A-Za-z0-9_]*)';
  var W = {
    events: [], conditions: [], actions: [],
    containers: ['spawn', 'take_off', 'spawn_human', 'for_each_link', 'for_each_volume', 'with_linked_entity', 'with_effector', 'tear'],
    valueBlocks: ['explode_inventory', 'table', 'effects'],
    ctxOfEvent: {}, ctxOfCond: {}, ctxOfAct: {}, helperEvents: {}
  };
  var S = {};
  var api;
  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function setOf(a) { var o = {}, i; for (i = 0; a && i < a.length; i++) o[a[i]] = true; return o; }
  function rebuild() { S.cont = setOf(W.containers); S.val = setOf(W.valueBlocks); }
  rebuild();
  function use(words) {
    var k;
    if (words) for (k in W) if (has(W, k) && has(words, k) && words[k]) W[k] = words[k];
    rebuild(); FM = null;
    return api;
  }
  function line(src, n) { var t = src && src.line ? src.line(n) : null; return t == null ? '' : String(t).replace(/\r$/, ''); }
  function rep(s, n) { var o = ''; while (n-- > 0) o += s; return o; }

  // ---- lexer: one line -> tokens { t:'{'|'}'|'('|')'|'w'|'s', v, c } (c 1-based); ';' outside a string ends the line
  function lex(text) {
    var out = [], i = 0, L = text.length, c, j, s, d;
    while (i < L) {
      c = text.charAt(i);
      if (c === ';') break;
      if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
      if (c === '"') {
        j = i + 1; s = '';
        while (j < L) { d = text.charAt(j); if (d === '\\' && j + 1 < L) { s += d + text.charAt(j + 1); j += 2; continue; } if (d === '"') break; s += d; j++; }
        out.push({ t: 's', v: s, c: i + 1 }); i = j + 1; continue;
      }
      if (c === '{' || c === '}' || c === '(' || c === ')') { out.push({ t: c, c: i + 1 }); i++; continue; }
      j = i;
      while (j < L) { d = text.charAt(j); if (d === ' ' || d === '\t' || d === '\r' || d === ';' || d === '"' || d === '{' || d === '}' || d === '(' || d === ')') break; j++; }
      out.push({ t: 'w', v: text.slice(i, j), c: i + 1 }); i = j;
    }
    return out;
  }

  // ---- frames
  function classify(fr, parent) {
    var pk = parent ? parent.kind : 'top', h = fr.head || '';
    if (fr.ch === '(') {
      if (!fr.q && h === 'define') return 'macro';
      if (!fr.q && h === 'mod') { fr.t = true; return pk || 'value'; }
      return 'value';
    }
    if (pk === 'top') {
      if (!fr.q && (h === 'entities' || h === 'effects')) return 'top';
      if (!fr.q && h === 'on') return 'handler';
      return 'block';
    }
    if (pk === 'block') return (!fr.q && h === 'on') ? 'handler' : 'block';
    if (pk === 'macro' || pk === 'handler' || pk === 'branch' || pk === 'timer' || pk === 'container') {
      if (fr.q) return pk === 'macro' ? 'block' : 'value';
      if (h === 'on') return 'handler';
      if (h === 'if') return 'branch';
      if (h === 'delay' || h === 'delay_ex') return 'timer';
      if (S.cont[h]) return 'container';
      if (S.val[h] || h.indexOf('health_damage_') === 0) return 'value';
      return 'action';
    }
    return 'value';
  }
  function normWords(ws) {
    var out = [], i, w, q, x;
    for (i = 0; i < ws.length; i++) {
      w = ws[i]; q = w.charAt(0) === '"';
      x = (q ? w.slice(1, w.length - 1) : w).toLowerCase();
      if (!q && (x === 'inherit' || x === 'overload')) continue;
      out.push(x);
    }
    return out.join(' ');
  }
  function baseWord(ws) {
    if (!ws.length) return '';
    if (ws[0].charAt(0) === '"') return 'custom';
    if (ws[0].charAt(0) === '%') return '%';
    return ws[0].toLowerCase();
  }
  // words after {on in a piece's event key or a line -> normalised event ('fire "gun" overload' -> 'fire gun')
  // the key the duplicate check compares: the normalised words, with a leading '"' when the first word is quoted
  // ({on "spawn"} is a reaction of your own, {on spawn} the game's event: two different reactions)
  function keyWords(ws) { return (ws.length && ws[0].charAt(0) === '"' ? '"' : '') + normWords(ws); }
  function evWords(s) {
    var t = lex(String(s == null ? '' : s)), ws = [], i;
    for (i = 0; i < t.length; i++) { if (t[i].t === 'w') ws.push(t[i].v); else if (t[i].t === 's') ws.push('"' + t[i].v + '"'); else break; }
    return ws;
  }
  function normEvent(s) { return normWords(evWords(s)); }
  function evKey(s) { return keyWords(evWords(s)); }
  function evShow(k) { return k.charAt(0) === '"' ? k.slice(1) : k; }
  function endEv(fr, frames, hook) {
    fr.evOpen = false;
    fr.event = normWords(fr.evw || []);
    fr.key = keyWords(fr.evw || []);
    fr.ev = baseWord(fr.evw || []);
    if (hook && hook.ev) hook.ev(fr, frames);
  }
  function setHead(frames, fr, t, hook) {
    fr.pend = false;
    if (t) { fr.q = t.t === 's'; fr.head = fr.q ? t.v : t.v.toLowerCase(); } else fr.head = '';
    fr.kind = classify(fr, frames.length > 1 ? frames[frames.length - 2] : null);
    // only a {on ...} frame names an event; a (mod ...) inside a reaction takes the kind 'handler' but is no reaction
    if (fr.kind === 'handler' && fr.ch === '{') { fr.evOpen = true; fr.evw = []; }
    if (fr.ch === '(' && fr.q) fr.call = true;
    if (fr.ch === '(' && !fr.q && (fr.head === 'define' || fr.head === 'include')) fr.needName = true;
    if (hook && hook.open) hook.open(fr, frames);
  }
  function step(frames, text, n, hook) {
    var toks = lex(text), i, t, top, j, fr, want;
    for (i = 0; i < toks.length; i++) {
      t = toks[i]; top = frames.length ? frames[frames.length - 1] : null;
      if (t.t === 'w' || t.t === 's') {
        if (top && top.pend) { setHead(frames, top, t, hook); continue; }
        if (top) {
          if (top.evOpen) top.evw.push(t.t === 's' ? '"' + t.v + '"' : t.v);
          else if (top.needName && t.t === 's') { top.name = t.v; top.needName = false; if (hook && hook.name) hook.name(top, frames); }
          if (hook && hook.tok) hook.tok(t, top, frames, n);
          top.nt++; top.pw = t.t === 'w' ? t.v.toLowerCase() : '"';
        } else if (hook && hook.tok) hook.tok(t, null, frames, n);
        continue;
      }
      if (top && top.pend) setHead(frames, top, null, hook);
      if (top && top.evOpen) endEv(top, frames, hook);
      if (t.t === '{' || t.t === '(') { frames.push({ ch: t.t, line: n, c: t.c, head: null, q: false, pend: true, kind: null, nt: 0, pw: '' }); continue; }
      want = t.t === '}' ? '{' : '(';
      for (j = frames.length - 1; j >= 0; j--) if (frames[j].ch === want) break;
      if (j < 0) continue;   // a stray closer is ignored
      while (frames.length > j) {
        fr = frames[frames.length - 1];
        if (fr.pend) setHead(frames, fr, null, hook);
        if (fr.evOpen) endEv(fr, frames, hook);
        frames.pop(); fr.end = n;
        if (hook && hook.close) hook.close(fr, frames, n);
      }
    }
    if (frames.length) { top = frames[frames.length - 1]; if (top.evOpen) endEv(top, frames, hook); }
  }
  function clone(f) { var c = {}, k; for (k in f) if (has(f, k)) c[k] = f[k]; if (f.evw) c.evw = f.evw.slice(); return c; }
  function snap(frames) { var o = [], i; for (i = 0; i < frames.length; i++) o.push(clone(frames[i])); return o; }
  // frames open at the start of line n (checkpoints every 200 lines in cache.cp)
  function stateAt(src, n, cache) {
    var cp = cache ? (cache.cp || (cache.cp = {})) : null, k = 1, frames = [], i, cnt = src ? src.count | 0 : 0;
    if (cp) { k = Math.floor((n - 1) / CP) * CP + 1; while (k > 1 && !cp[k]) k -= CP; if (k > 1) frames = snap(cp[k]); else k = 1; }
    for (i = k; i < n && i <= cnt; i++) {
      step(frames, line(src, i), i, null);
      if (cp && i % CP === 0 && !cp[i + 1]) cp[i + 1] = snap(frames);
    }
    return frames;
  }
  function cacheDrop(cache, from) {
    var k;
    if (!cache || !cache.cp) return;
    for (k in cache.cp) if (has(cache.cp, k) && +k >= from) delete cache.cp[k];
  }
  function describe(frames) {
    var d = frames.length, top = d ? frames[d - 1] : null, out, i, f, h = -1, b = -1, ctx, lost = [], j, keep;
    out = { kind: top ? (top.kind || 'value') : 'top', depth: d, head: top ? top.head : null, frames: [], ctx: null, lost: lost, inDefine: false };
    for (i = 0; i < d; i++) {
      f = frames[i];
      out.frames.push(f.kind === 'handler' && !f.t ? { ch: f.ch, line: f.line, head: f.head, kind: f.kind, event: f.event } : { ch: f.ch, line: f.line, head: f.head, kind: f.kind || 'value' });
      if (f.kind === 'macro') out.inDefine = true;
      if (f.kind === 'handler' && !f.t) h = i;
      if (f.kind === 'block' && f.q) b = i;
    }
    if (b >= 0) out.block = { line: frames[b].line, name: frames[b].head, depth: b + 1 };
    if (h >= 0) {
      out.event = frames[h].event || ''; out.ev = frames[h].ev || '';
      ctx = has(W.ctxOfEvent, out.ev) ? W.ctxOfEvent[out.ev] : null;
      // an event whose command is not known (a reaction of your own, crew, a macro input): ctx stays null, but a timer
      // still drops what it drops everywhere, so lost holds every word a delay drops (delay_ex: the other unit, bullet)
      var unk = !ctx;
      ctx = unk ? ['bullet', 'volume', 'part', 'instigator', 'value', 'sender', 'source'] : ctx.slice();
      for (i = h + 1; i < d; i++) {
        if (frames[i].kind !== 'timer') continue;
        if (frames[i].head === 'delay') { for (j = 0; j < ctx.length; j++) lost.push(ctx[j]); ctx = []; }
        else {
          keep = [];
          for (j = 0; j < ctx.length; j++) { if (ctx[j] === 'instigator' || ctx[j] === 'bullet' || ctx[j] === 'bone') lost.push(ctx[j]); else keep.push(ctx[j]); }
          ctx = keep;
        }
      }
      out.ctx = unk ? null : ctx;
    }
    return out;
  }
  function scopeAt(src, n, cache) {
    var cnt = src ? src.count | 0 : 0, o;
    n = Math.max(1, Math.min(cnt + 1, n | 0));
    o = describe(stateAt(src, n, cache)); o.line = n;
    return o;
  }
  // line where the frame at index k (0-based, open at the start of line g) closes
  function closeLine(src, g, k, cache) {
    var fr = stateAt(src, g, cache), L, cnt = src.count | 0;
    for (L = g; L <= cnt && L < g + 60000; L++) { step(fr, line(src, L), L, null); if (fr.length <= k) return L; }
    return cnt;
  }

  // ---- templates
  function parse(code, f) {
    var parts = [], re = /@(\^|[a-z][a-z0-9_]{0,23}|)@/g, m, last = 0, txt = '', d, p, k;
    code = String(code == null ? '' : code); f = f || {};
    function flush() { if (txt) parts.push(txt); txt = ''; }
    while ((m = re.exec(code))) {
      txt += code.slice(last, m.index); last = m.index + m[0].length;
      if (m[1] === '') { txt += '@'; continue; }
      flush();
      if (m[1] === '^') { parts.push({ caret: true }); continue; }
      d = has(f, m[1]) ? f[m[1]] : {};
      p = { f: m[1], k: d.k || 'text', def: d.def == null ? '' : String(d.def) };
      for (k in d) if (has(d, k) && k !== 'k' && k !== 'def') p[k] = d[k];
      parts.push(p);
    }
    txt += code.slice(last); flush();
    return parts;
  }
  function partsOf(piece) { return piece && piece.parts ? piece.parts : parse(piece && piece.code, piece && piece.f); }
  function compile(piece, values) {
    var parts = partsOf(piece), text = '', fields = [], caret = null, i, p, v;
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (typeof p === 'string') { text += p; continue; }
      if (p.caret) { caret = text.length; continue; }
      v = values && has(values, p.f) && values[p.f] != null ? String(values[p.f]) : String(p.def == null ? '' : p.def);
      v = v.replace(/\r\n?/g, '\n');
      fields.push({ name: p.f, k: p.k, off: text.length, len: v.length });
      text += v;
    }
    return { text: text, fields: fields, caret: caret };
  }
  function fillEvent(piece, values) {
    var parts = partsOf(piece), defs = {}, i;
    for (i = 0; i < parts.length; i++) if (typeof parts[i] !== 'string' && parts[i].f) defs[parts[i].f] = parts[i].def;
    return String(piece.event || '').replace(/@(\^|[a-z][a-z0-9_]{0,23}|)@/g, function (m, n) {
      if (n === '') return '@'; if (n === '^') return '';
      return values && has(values, n) && values[n] != null ? String(values[n]) : (has(defs, n) ? String(defs[n]) : '');
    });
  }

  // ---- names in a text
  function scanNames(src) {
    var R = { flags: [], events: [], views: [], sounds: [], anims: [], tags: [], calls: [], includes: [], helpers: [], defines: [] }, seen = {};
    var fr = [], n, cnt = src ? src.count | 0 : 0;
    function add(list, v) {
      var key = list + '|' + v;
      if (v == null || v === '' || v.indexOf('%') >= 0 || seen[key] || R[list].length >= CAP) return;
      seen[key] = 1; R[list].push(v);
    }
    function rec(frames) { var i; for (i = frames.length - 1; i >= 0; i--) if (frames[i].rec) return frames[i].rec; return null; }
    function addU(a, v) { if (v !== '' && a.indexOf(v) < 0 && a.length < CAP) a.push(v); }
    var hook = {
      open: function (f, frames) {
        var r, ws, i, m, re;
        if (f.head && f.head.indexOf('%') >= 0 && (r = rec(frames.slice(0, frames.length - 1)))) {
          re = new RegExp(INP, 'g');
          while ((m = re.exec(f.head))) { addU(r.params, m[1]); if (!/^[0-9]+$/.test(m[1])) r.named = true; }
        }
        if (f.kind === 'block' && f.q) { ws = f.head.split(/\s+/); for (i = 0; i < ws.length; i++) add('tags', ws[i]); }
        if (f.call) { add('helpers', f.head); r = rec(frames.slice(0, frames.length - 1)); if (r) addU(r.calls, f.head); }
      },
      name: function (f, frames) {
        if (f.head === 'include') { add('includes', f.name); return; }
        if (R.defines.length >= CAP) return;
        f.rec = { name: f.name, params: [], named: false, line: f.line, events: [], calls: [] };
        R.defines.push(f.rec);
      },
      ev: function (f, frames) {
        var r = rec(frames), w = f.event.split(' ');
        if (f.ev === 'custom') add('events', w[0]);
        if (f.ev === 'animation_end' && w[1]) add('anims', w[1]);
        if (r) addU(r.events, f.key);
      },
      tok: function (t, top, frames) {
        var r, m, re, h;
        if (t.v.indexOf('%') >= 0 && (r = rec(frames))) {
          re = new RegExp(INP, 'g');
          while ((m = re.exec(t.v))) { addU(r.params, m[1]); if (!/^[0-9]+$/.test(m[1])) r.named = true; }
        }
        if (!top || t.t !== 's') return;
        h = top.head;
        if (h === 'set' && top.nt === 0) add('flags', t.v);
        if (top.kind === 'branch' && (top.nt === 0 || top.pw === 'else' || top.pw === 'not')) add('flags', t.v);
        if ((h === 'view' || h === 'add_view') && top.nt === 1) add('views', t.v);
        if ((h === 'play_sound' || h === 'start_sound' || h === 'stop_sound' || h === 'link_sound') && top.nt === 0) add('sounds', t.v);
        if ((h === 'ani_play' || h === 'ani_stop' || h === 'ani_wind') && top.nt === 0) add('anims', t.v);
        if (h === 'tags' && top.nt === 1) add('tags', t.v);
        if (h === 'call' && top.nt === 0) add('calls', t.v);
        if (h === 'delay_effect') top.lastS = t.v;
      },
      close: function (f) { if (f.head === 'delay_effect' && f.lastS) add('calls', f.lastS); }
    };
    for (n = 1; n <= cnt; n++) step(fr, line(src, n), n, hook);
    return R;
  }

  // ---- what the block that holds a gap already has: direct handlers, helper calls, includes
  // blk = { line, depth } of the block's own frame (opened on blk.line); depth 0 = the file's top level (a fragment file).
  // Only what sits in the block's own frame counts: another block opened or closed on the same line is not this one.
  function blockInfo(src, blk, cache) {
    var d = blk.depth, fr = d ? stateAt(src, blk.line, cache) : [], out = { handlers: [], calls: [], includes: [] }, hs = [], cs = [], inc = [], L, cnt = src.count | 0, i, own = d ? null : 'top', done = false;
    var hook = {
      open: function (f, frames) {
        var j = frames.length - 2, par;
        if (d && frames.length === d && f.ch === '{' && f.line === blk.line) { own = f; done = false; return; }   // the last block opened at that depth on blk.line
        while (j >= 0 && frames[j].t) j--;
        if (j !== d - 1) return;
        par = j < 0 ? 'top' : frames[j];
        if (f.kind === 'handler' && f.ch === '{') hs.push({ f: f, par: par });
        else if (f.call) cs.push({ f: f, par: par });
        else if (f.ch === '(' && f.head === 'include') inc.push({ f: f, par: par });
      },
      close: function (f) { if (f === own) done = true; }
    };
    for (L = d ? blk.line : 1; L <= cnt && L < (d ? blk.line : 1) + 60000; L++) { step(fr, line(src, L), L, hook); if (done || (d && fr.length < d)) break; }
    for (i = 0; i < hs.length; i++) if (hs[i].par === own) out.handlers.push({ event: hs[i].f.key || '', line: hs[i].f.line });
    for (i = 0; i < cs.length; i++) if (cs[i].par === own) out.calls.push({ name: cs[i].f.head, line: cs[i].f.line, inp: callInputs(src, cs[i].f) });
    for (i = 0; i < inc.length; i++) if (inc[i].par === own) out.includes.push({ path: inc[i].f.name || '', line: inc[i].f.line });
    return out;
  }
  // the reactions a piece's text adds where it sits in a block (keys as keyWords):
  //   evs = its top-level {on ...} heads, and the {on ...} of its own (define ...) bodies for each top-level call of that
  //   define, the inputs filled from the call (args a b -> %0 %1, name(words) -> %name); an event whose input stays unfilled
  //   is left out. helpers = the names it defines and calls; ext = the other names it calls at its top level.
  function tWd(x) { return x.t === 's' ? '"' + x.v + '"' : x.v; }
  function tIsW(x) { return x && (x.t === 'w' || x.t === 's'); }
  // index of the token that closes the bracket at T[i0] (T.length when it never closes)
  function tCloser(T, i0) { var c = 0, n; for (n = i0; n < T.length; n++) { if (T[n].t === '{' || T[n].t === '(') c++; else if (T[n].t === '}' || T[n].t === ')') { c--; if (!c) return n; } } return T.length; }
  // the inputs of a macro call T[i] = '(' T[i+1] = "name" ... T[j] = ')': { args:[words], named:{ name: 'words' } }
  //   args a b: the words up to the next named input name(...) or the call's end; words keep their quotes
  function tInputs(T, i, j) {
    var args = [], named = {}, k, m, q, ws;
    for (k = i + 2; k < j; k++) {
      if (T[k].t === 'w' && T[k].v.toLowerCase() === 'args' && !(T[k + 1] && T[k + 1].t === '(')) { for (k++; k < j && tIsW(T[k]) && !(T[k].t === 'w' && T[k + 1] && T[k + 1].t === '('); k++) args.push(tWd(T[k])); k--; continue; }
      if (T[k].t === 'w' && T[k + 1] && T[k + 1].t === '(') {
        m = tCloser(T, k + 1); ws = [];
        for (q = k + 2; q < m; q++) if (tIsW(T[q])) ws.push(tWd(T[q]));
        named[T[k].v.toLowerCase()] = ws.join(' '); k = m;
      }
    }
    return { args: args, named: named };
  }
  // %0 %1 and %name in a text filled from a call's inputs (an input the call does not give stays as it is)
  function fillIn(s, inp, plain) {
    return s.replace(new RegExp(INP, 'g'), function (a, n) {
      var v = /^[0-9]$/.test(n) ? (+n < inp.args.length ? inp.args[+n] : null) : (has(inp.named, n.toLowerCase()) ? inp.named[n.toLowerCase()] : null);
      return v == null ? a : plain ? normWords(evWords(v)) : v;
    });
  }
  // a duplicate key (keyWords form) of a helper's event filled from the call's inputs; the key again
  function fillKey(k, inp) {
    var q = k.charAt(0) === '"', body = q ? k.slice(1) : k, m;
    if (!inp || body.indexOf('%') < 0) return k;
    // the first word is a whole input ({on %0 ...}): a quoted value makes it a reaction of your own
    m = new RegExp('^' + INP + '(\\s|$)').exec(body);
    if (!q && m) { var v0 = fillIn('%' + m[1], inp, false); if (v0.charAt(0) === '"') q = true; }
    return (q ? '"' : '') + fillIn(body, inp, true);
  }
  // the inputs of the call whose '(' opens frame f (f.line, f.c, f.end): read from the lines it spans
  function callInputs(src, f) {
    var T = [], L, t, j, end = f.end || Math.min(src.count | 0, f.line + 200);
    for (L = f.line; L <= end; L++) { t = lex(line(src, L)); for (j = 0; j < t.length; j++) if (L > f.line || t[j].c >= f.c) T.push(t[j]); }
    if (!T.length || T[0].t !== '(') return { args: [], named: {} };
    return tInputs(T, 0, tCloser(T, 0));
  }
  function pieceEvents(text) {
    var ls = text.split('\n'), T = [], i, j, k, m, t, dd, d = 0, st = [], defs = {}, out = { evs: [], helpers: [], ext: [] }, nm, ws, inp, s;
    for (i = 0; i < ls.length; i++) { t = lex(ls[i]); for (j = 0; j < t.length; j++) T.push(t[j]); }
    var wd = tWd, isW = tIsW;
    function closer(i0) { return tCloser(T, i0); }
    function addK(k2) { if (k2 && out.evs.indexOf(k2) < 0) out.evs.push(k2); }
    for (i = 0; i < T.length; i++) {
      t = T[i];
      if (d === 0 && t.t === '{' && T[i + 1] && T[i + 1].t === 'w' && T[i + 1].v.toLowerCase() === 'on') {
        ws = []; for (k = i + 2; isW(T[k]); k++) ws.push(wd(T[k]));
        addK(keyWords(ws));
      }
      if (d === 0 && t.t === '(' && T[i + 1] && T[i + 1].t === 'w' && T[i + 1].v.toLowerCase() === 'define' && T[i + 2] && T[i + 2].t === 's') {
        nm = T[i + 2].v; j = closer(i); defs[nm] = []; dd = 0;
        for (k = i + 3; k < j; k++) {
          if (dd === 0 && T[k].t === '{' && T[k + 1] && T[k + 1].t === 'w' && T[k + 1].v.toLowerCase() === 'on') {
            ws = []; for (m = k + 2; m < j && isW(T[m]); m++) ws.push(wd(T[m]));
            defs[nm].push(ws.join(' '));
          }
          if (T[k].t === '{' || T[k].t === '(') dd++; else if (T[k].t === '}' || T[k].t === ')') dd--;
        }
        i = j; continue;
      }
      if (d === 0 && t.t === '(' && T[i + 1] && T[i + 1].t === 's') {
        nm = T[i + 1].v; j = closer(i);
        if (!has(defs, nm)) { if (out.ext.indexOf(nm) < 0) out.ext.push(nm); i = j; continue; }
        inp = tInputs(T, i, j);
        if (out.helpers.indexOf(nm) < 0) out.helpers.push(nm);
        for (k = 0; k < defs[nm].length; k++) {
          s = fillIn(defs[nm][k], inp, false);
          if (s.indexOf('%') < 0) addK(evKey(s));
        }
        i = j; continue;
      }
      // (mod ...) is transparent: what it holds sits where the (mod sits
      if (t.t === '{' || t.t === '(') { m = t.t === '(' && T[i + 1] && T[i + 1].t === 'w' && T[i + 1].v.toLowerCase() === 'mod' ? 0 : 1; st.push(m); d += m; }
      else if ((t.t === '}' || t.t === ')') && st.length) d -= st.pop();
    }
    return out;
  }

  // ---- placement helpers
  // ex(s) -> more scope ids a place takes (a fragment file's top level, a define body); see places()
  function fitsS(s, piece, ex) {
    var sc = piece.scope || [], ev = piece.events, more, i, any;
    if (sc.indexOf(s.kind) < 0) {
      more = ex ? ex(s) : []; any = false;
      for (i = 0; i < more.length; i++) if (sc.indexOf(more[i]) >= 0) any = true;
      if (!any) return false;
    }
    // in a (define ...) body outside any {on ...} of its own (or in {on %0}), the event is the caller's: not judged
    if (ev && ev.length && !(s.inDefine && (s.ev == null || s.ev === '%'))) { if (s.ev == null || ev.indexOf(s.ev) < 0) return false; }
    return true;
  }
  // places with no block by design, for one plan call (memo per call):
  //   the top level of an interaction file that holds {on ...} at its top level and no quoted block (tank/tank_light.inc:
  //   included into a block) takes block pieces; a (define ...) body takes what its own children are: reactions -> block,
  //   actions -> handler, quoted blocks -> top, an empty body -> block and handler
  function places(src, cache, isIa) {
    var memo = {}, frag = null;
    function fragFile() {
      var fr = [], cnt = src.count | 0, n, hasOn = false, hasB = false;
      var hook = { open: function (f, frames) {
        var i;
        if (f.ch !== '{') return;
        for (i = 0; i < frames.length - 1; i++) if (!frames[i].t) return;   // only (mod ...) around it
        if (f.kind === 'handler') hasOn = true; else if (f.kind === 'block' && f.q) hasB = true;
      } };
      for (n = 1; n <= cnt && !hasB; n++) step(fr, line(src, n), n, hook);
      return hasOn && !hasB;
    }
    function body(ln, k) {
      var fr = stateAt(src, ln, cache), cnt = src.count | 0, L, o = {}, out = [];
      var hook = { open: function (f, frames) { if (frames.length !== k + 2) return; if (f.kind === 'handler' && f.ch === '{') o.block = 1; else if (f.kind === 'block' && f.q) o.top = 1; else if (f.ch === '{') o.handler = 1; } };
      for (L = ln; L <= cnt && L < ln + 60000; L++) { step(fr, line(src, L), L, hook); if (fr.length <= k) break; }
      if (o.top) out.push('top'); if (o.block) out.push('block'); if (o.handler) out.push('handler');
      return out.length ? out : ['block', 'handler'];
    }
    // the file's own top level: no frame open, or only (mod ...) frames (they are transparent)
    function topLevel(s) { var i; if (s.kind !== 'top') return false; for (i = 0; i < s.depth; i++) if (!(s.frames[i].ch === '(' && s.frames[i].head === 'mod')) return false; return true; }
    function ex(s) {
      var f;
      if (topLevel(s)) { if (!isIa) return []; if (frag === null) frag = fragFile(); return frag ? ['block'] : []; }
      if (s.kind === 'macro') { f = s.frames[s.depth - 1]; if (!has(memo, f.line)) memo[f.line] = body(f.line, s.depth - 1); return memo[f.line]; }
      return [];
    }
    ex.frag = function (s) { return topLevel(s) && ex(s).length > 0; };
    ex.fragFile = function () { if (!isIa) return false; if (frag === null) frag = fragFile(); return frag; };
    return ex;
  }
  function nearest(src, g, piece, cache, ex) {
    var cnt = src.count | 0, lo = Math.max(1, g - 600), hi = Math.min(cnt + 1, g + 600), fr = stateAt(src, lo, cache), L, best = 0, bd = 1e9, dd;
    for (L = lo; L <= hi; L++) {
      dd = Math.abs(L - g);
      if (dd < bd && fitsS(describe(fr), piece, ex)) { best = L; bd = dd; }
      if (L <= cnt) step(fr, line(src, L), L, null);
    }
    return best;
  }
  function lead(t) { var m = /^[ \t]*/.exec(t); return m ? m[0] : ''; }
  function fileUnit(src) {
    var i, m, cnt = src.count | 0;
    for (i = 1; i <= cnt && i <= 3000; i++) { m = /^([ \t]+)\S/.exec(line(src, i)); if (m) return m[1].charAt(0) === '\t' ? '\t' : '    '; }
    return '\t';
  }
  function unitOf(base, src) { if (base.indexOf('\t') >= 0) return '\t'; if (base === '') return fileUnit(src); return '    '; }
  function indentFor(src, g, s, cache) {
    var depth = s.depth, cnt = src.count | 0, lo, hi, dep = {}, fr, L, t, base = null, hb;
    if (depth === 0) return { base: '', unit: fileUnit(src) };
    // lines above the gap are read once; lines below only as far as the forward scan needs them
    var txt = {}, d0;
    lo = Math.max(1, g - 300); hi = Math.min(cnt, g + 300); fr = stateAt(src, lo, cache);
    for (L = lo; L < g && L <= cnt; L++) { dep[L] = fr.length; txt[L] = line(src, L); step(fr, txt[L], L, null); }
    // a ; line is skipped (code is commented out at column 0, as the game's files and Notepad++ do). An else line is no
    // model: the code line on the other side of the gap is, when there is one; else one unit deeper than the else (the
    // game's files mostly write else at its {if}'s indent and the branch one unit deeper)
    var els = null;
    function isElse(t2) { return /^\s*else(\s|$)/.test(t2); }
    for (L = g - 1; L >= lo; L--) {
      if (dep[L] < depth) break;
      if (dep[L] !== depth) continue;
      t = txt[L];
      if (/^\s*$/.test(t) || /^\s*[})]/.test(t) || /^\s*;/.test(t)) continue;
      if (isElse(t)) els = t; else base = lead(t);
      break;
    }
    if (base === null) for (L = g; L <= hi; L++) {
      d0 = fr.length; t = line(src, L); step(fr, t, L, null);
      if (d0 < depth) break;
      if (d0 !== depth) continue;
      if (/^\s*$/.test(t) || /^\s*;/.test(t)) continue;
      if (/^\s*[})]/.test(t)) break;
      if (isElse(t)) els = els || t; else base = lead(t);
      break;
    }
    if (base === null && els !== null) { base = lead(els); base += unitOf(base, src); }
    if (base === null) { hb = lead(line(src, s.frames[depth - 1].line)); base = hb + unitOf(hb, src); }
    return { base: base, unit: unitOf(base, src) };
  }
  // indented text + a map from a compiled offset to { line (0-based), col (0-based) } and to an output offset
  function indentText(text, ind) {
    var ls = text.split('\n'), out = [], meta = [], i, k, off = 0;
    for (i = 0; i < ls.length; i++) {
      k = /^\t*/.exec(ls[i])[0].length;
      out.push(ls[i] === '' ? '' : ind.base + rep(ind.unit, k) + ls[i].slice(k));
      meta.push({ k: k, start: off, oStart: 0, empty: ls[i] === '' });
      off += ls[i].length + 1;
    }
    off = 0;
    for (i = 0; i < out.length; i++) { meta[i].oStart = off; off += out[i].length + 1; }
    function map(o) {
      var i2 = 0, c, m, oc;
      while (i2 + 1 < meta.length && meta[i2 + 1].start <= o) i2++;
      m = meta[i2]; c = o - m.start;
      if (m.empty) oc = 0;
      else oc = c < m.k ? ind.base.length + ind.unit.length * c : ind.base.length + ind.unit.length * m.k + (c - m.k);
      return { line: i2, col: oc, off: m.oStart + oc };
    }
    return { text: out.join('\n'), lines: out.length, map: map };
  }
  // conditions, flags and calls a piece's text uses
  function pieceUse(text) {
    var ls = text.split('\n'), toks = [], i, j, t, k, ws, ka, u = { conds: [], acts: [], flags: [], calls: [], handlers: [], mod: false };
    for (i = 0; i < ls.length; i++) { t = lex(ls[i]); for (j = 0; j < t.length; j++) toks.push(t[j]); }
    function word(x) { return x && x.t === 'w' ? x.v.toLowerCase() : null; }
    // actions that need what the command carries: words.ctxOfAct keys 'head' or 'head word' (the word anywhere in the action)
    for (i = 0; i < toks.length; i++) {
      if (toks[i].t !== '{' || !word(toks[i + 1])) continue;
      ws = [];
      for (j = i + 2; j < toks.length && toks[j].t !== '{' && toks[j].t !== '}'; j++) if (toks[j].t === 'w') ws.push(toks[j].v.toLowerCase());
      for (k in W.ctxOfAct) {
        if (!has(W.ctxOfAct, k)) continue;
        ka = k.split(' ');
        if (ka[0] === word(toks[i + 1]) && (ka.length < 2 || ws.indexOf(ka[1]) >= 0)) u.acts.push({ c: k, a: null });
      }
    }
    function cond(j2) {
      var x = toks[j2];
      if (word(x) === 'not') { j2++; x = toks[j2]; }
      if (!x) return;
      if (x.t === 's') { u.flags.push(x.v); return; }
      if (x.t === 'w') u.conds.push({ c: x.v.toLowerCase(), a: word(toks[j2 + 1]) });
    }
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t.t === '{' && word(toks[i + 1]) === 'if') cond(i + 2);
      else if (t.t === 'w' && t.v.toLowerCase() === 'else' && toks[i + 1] && toks[i + 1].t !== '{') cond(i + 1);
      else if (t.t === '{' && word(toks[i + 1]) === 'set' && toks[i + 2] && toks[i + 2].t === 's') u.flags.push(toks[i + 2].v);
      else if (t.t === '{' && word(toks[i + 1]) === 'call' && toks[i + 2] && toks[i + 2].t === 's') u.calls.push(toks[i + 2].v);
      else if (t.t === '{' && word(toks[i + 1]) === 'delay_effect') {
        for (j = i + 2; j < toks.length && toks[j].t !== '}' && toks[j].t !== '{'; j++) if (toks[j].t === 's') t = toks[j];
        if (t.t === 's') u.calls.push(t.v);
      } else if (t.t === '{' && word(toks[i + 1]) === 'on' && toks[i + 2] && toks[i + 2].t === 's') u.handlers.push(toks[i + 2].v.toLowerCase());
      else if (t.t === '(' && word(toks[i + 1]) === 'mod') u.mod = true;
    }
    return u;
  }
  function helperOf(name, line, defs) {
    var i, best = null, any = null;
    for (i = 0; i < defs.length; i++) if (defs[i].name === name) { any = defs[i]; if (defs[i].line < line) best = defs[i]; }
    return best || any;
  }
  // events a helper brings, through file defines then the game's helpers; null = cannot be read
  //   inp = the call's inputs ({ args, named }, callInputs): %0 %1 %name in the helper's events are filled from them; an
  //   event whose input the call does not give cannot be read
  function helperEvents(name, line, defs, seen, inp) {
    var d = helperOf(name, line, defs), out = [], i, sub, e;
    if (seen[name]) return [];
    seen[name] = true;
    if (d) {
      for (i = 0; i < d.events.length; i++) { e = fillKey(d.events[i], inp); if (e.indexOf('%') >= 0) return null; out.push(e); }
      for (i = 0; i < d.calls.length; i++) { sub = helperEvents(d.calls[i], d.line + 1, defs, seen); if (sub === null) return null; out = out.concat(sub); }
      return out;
    }
    if (has(W.helperEvents, name)) {
      for (i = 0; i < W.helperEvents[name].length; i++) { e = fillKey(W.helperEvents[name][i], inp); if (e.indexOf('%') >= 0) return null; out.push(e); }
      return out;
    }
    return null;
  }

  // where a gap really lands, before any piece is looked at: a gap inside a setting of an entity block written over lines
  // ({inflammation_time ...}) moves after its closer; a gap inside an action or a value moves after the line that closes it
  //   (in a fragment file a setting at the file's top level moves the same way: ex = places(); ex.fragFile())
  function gapOf(src, g, cache, isIa, ex) {
    var cnt = src.count | 0, s = scopeAt(src, g, cache), raw, k, j;
    if (isIa) {
      raw = stateAt(src, g, cache);
      for (k = 0; k < raw.length; k++) {
        if (raw[k].ch !== '{' || raw[k].q || raw[k].head === 'on' || raw[k].kind !== 'block') continue;
        for (j = k - 1; j >= 0 && raw[j].t; j--);
        if (j >= 0 ? (raw[j].kind === 'block' && raw[j].q) : (ex && ex.fragFile())) { g = Math.min(cnt + 1, closeLine(src, g, k, cache) + 1); s = scopeAt(src, g, cache); break; }
      }
    }
    if (s.kind === 'action' || s.kind === 'value') {
      for (k = s.depth - 1; k > 0 && (s.frames[k - 1].kind === 'action' || s.frames[k - 1].kind === 'value'); k--);
      g = Math.min(cnt + 1, closeLine(src, g, k, cache) + 1);
      s = scopeAt(src, g, cache);
    }
    return { g: g, s: s };
  }
  // a 'top' piece that does not fit at the gap goes after the outermost block around it: { g, s, n = that block's line } or null
  function topAfter(src, g, s, cache) {
    var k, g2;
    for (k = 0; k < s.depth && s.frames[k].kind === 'top'; k++);
    if (k >= s.depth) return null;
    g2 = Math.min((src.count | 0) + 1, closeLine(src, g, k, cache) + 1);
    return { g: g2, s: scopeAt(src, g2, cache), n: s.frames[k].line };
  }
  // fits(src, s, piece, opts) -> true when plan() at the gap s.line would not refuse the piece with ide.kit.x.scope
  //   s = a scopeAt(src, gap, cache) answer (it carries .line); opts = { kitKind, cache } as for plan(). Only the place is
  //   judged (the gap moves, fragment files, define bodies, a 'top' piece added after the block), not the kind, the view,
  //   read-only or duplicates. The work that does not depend on the piece is done once per s (a pane ranks every piece).
  // ---- round 2: the generic scope of every kind but ia-entity (scope tokens top, any, in:<word>, in:*, empty)
  //   A piece is judged by it when the kind is not ia-entity and its scope holds none of the v1 interaction places
  //   (block handler branch timer container): the v1 sdl pieces keep their v1 placement in every kind.
  var V1ONLY = { block: true, handler: true, branch: true, timer: true, container: true };
  function generic(piece, kk) {
    var sc = piece.scope || [], i;
    if (kk === 'ia-entity') return false;
    for (i = 0; i < sc.length; i++) if (V1ONLY[sc[i]] === true) return false;
    return true;
  }
  function isWhole(piece) { var sc = piece.scope || []; return piece.whole === true || (sc.length === 1 && sc[0] === 'empty'); }
  // the doc's path is under map/multi/ (opts.rel: forward slashes, lower case; a pak entry after '::'; resource/ optional)
  function underMulti(rel) {
    var p = String(rel == null ? '' : rel), i = p.lastIndexOf('::');
    if (i >= 0) p = p.slice(i + 2);
    p = p.replace(/\\/g, '/').toLowerCase();
    return /(^|\/)map\/multi\//.test(p);
  }
  // no text but blank lines and ; comments (a BOM on line 1 is no text)
  function blankFile(src) {
    var cnt = src.count | 0, n, t;
    for (n = 1; n <= cnt; n++) { t = line(src, n); if (n === 1) t = t.replace(/^﻿/, ''); if (!/^[ \t]*(;.*)?$/.test(t)) return false; }
    return true;
  }
  // raw frames open at a gap -> does the piece fit there (innermost block and its head word)
  function genFits(fr, piece) {
    var sc = piece.scope || [], f;
    if (sc.indexOf('any') >= 0) return true;
    if (!fr.length) return sc.indexOf('top') >= 0;
    f = fr[fr.length - 1];
    if (f.q) return sc.indexOf('in:*') >= 0;
    return !!f.head && sc.indexOf('in:' + f.head) >= 0;
  }
  // a 'top' piece dropped inside a block goes after the outermost block around the gap: { g, n = that block's line } or null
  function genTopAfter(src, g, fr, piece, cache) {
    var g2, f2;
    if (!fr.length || (piece.scope || []).indexOf('top') < 0) return null;
    g2 = Math.min((src.count | 0) + 1, closeLine(src, g, 0, cache) + 1);
    f2 = stateAt(src, g2, cache);
    return genFits(f2, piece) ? { g: g2, n: fr[0].line } : null;
  }
  function genNearest(src, g, piece, cache) {
    var cnt = src.count | 0, lo = Math.max(1, g - 600), hi = Math.min(cnt + 1, g + 600), fr = stateAt(src, lo, cache), L, best = 0, bd = 1e9, dd;
    for (L = lo; L <= hi; L++) {
      dd = Math.abs(L - g);
      if (dd < bd && genFits(fr, piece)) { best = L; bd = dd; }
      if (L <= cnt) step(fr, line(src, L), L, null);
    }
    return best;
  }
  // where a round 2 piece goes: { g, warn? } or { refuse } (whole-file pieces and the generic scope)
  function placeR2(src, g, piece, cache, wantNear) {
    var fr, t, n;
    if (isWhole(piece)) return blankFile(src) ? { g: g } : { refuse: { k: 'ide.kit.x.whole', p: {} } };
    fr = stateAt(src, g, cache);
    if (genFits(fr, piece)) return { g: g };
    t = genTopAfter(src, g, fr, piece, cache);
    if (t) return { g: t.g, warn: { k: 'ide.kit.addedAfter', p: { n: t.n } } };
    n = wantNear ? genNearest(src, g, piece, cache) : 0;
    t = { refuse: { k: 'ide.kit.x.scope', p: { where: (piece.scope || [''])[0], n: n, ev: '' } } };
    if (n) t.refuse.near = n;
    return t;
  }

  var FM = null;
  function fitsAt(src, s, piece, opts) {
    var o = opts || {}, isIa = /^ia-/.test(o.kitKind || ''), cache = o.cache || {}, R, ex;
    if (!src || !s || !piece) return false;
    try {
      if (piece.mp === 'no' && o.rel != null && underMulti(o.rel)) return false;
      if (isWhole(piece) || generic(piece, o.kitKind || '')) return !placeR2(src, Math.max(1, Math.min((src.count | 0) + 1, (s.line | 0) || 1)), piece, cache, false).refuse;
    } catch (e) { return false; }
    if (!FM || FM.s !== s || FM.src !== src || FM.isIa !== isIa) {
      ex = places(src, cache, isIa);
      R = gapOf(src, Math.max(1, Math.min((src.count | 0) + 1, (s.line | 0) || 1)), cache, isIa, ex);
      FM = { s: s, src: src, isIa: isIa, g: R.g, at: R.s, ex: ex, top: undefined };
    }
    if (fitsS(FM.at, piece, FM.ex)) return true;
    if ((piece.scope || []).indexOf('top') < 0 || FM.at.depth === 0) return false;
    if (FM.top === undefined) FM.top = topAfter(src, FM.g, FM.at, cache);
    return !!FM.top && fitsS(FM.top.s, piece, FM.ex);
  }

  function plan(src, at, piece, values, opts) {
    var r = { edits: [], fields: [], caret: null, from: 0, to: 0, warn: [], refuse: null, ver: opts ? opts.ver : undefined };
    try { planIn(r, src, at || {}, piece, values || {}, opts || {}); }
    catch (e) { r.edits = []; r.fields = []; r.caret = null; r.from = 0; r.to = 0; r.refuse = { k: 'ide.kit.notAdded', p: { m: String(e && e.message || e) } }; }
    return r;
  }
  function planIn(r, src, at, piece, values, opts) {
    var cache = opts.cache || {}, cnt = src.count | 0, g, s, i, k, n, info, evs, ev, names = null, defs, he, c, ind, out, comp, edits, from, ln, blank;
    var kinds = piece.kinds || [], isIa = /^ia-/.test(opts.kitKind || ''), raw, j, ex, pe, frag;
    // kinds whose files are not SDL text (a Lua bot script): the 'sdl' pieces of any data file do not go there
    var NOSDL = { 'bot-lua': true };
    if (!opts.kitKind || opts.kitKind === 'none') { r.refuse = { k: 'ide.kit.x.view', p: {} }; return; }
    if (opts.cover) { r.refuse = { k: 'ide.kit.x.cover', p: {} }; return; }
    if (opts.editable === false) { r.refuse = { k: 'ide.kit.x.ro', p: { why: opts.why || '' } }; return; }
    if ((kinds.indexOf(opts.kitKind) < 0 && (kinds.indexOf('sdl') < 0 || has(NOSDL, opts.kitKind))) || (piece.notKinds || []).indexOf(opts.kitKind) >= 0) { r.refuse = { k: 'ide.kit.x.kind', p: { kind: kinds[0] || '', kind2: opts.kitKind } }; return; }
    // round 2: a piece not for multiplayer maps (mp 'no') is refused in a file under map/multi/
    if (piece.mp === 'no' && underMulti(opts.rel)) { r.refuse = { k: 'ide.kit.x.mp', p: {} }; return; }
    g = Math.max(1, Math.min(cnt + 1, (at.gap | 0) || 1));
    // round 2: whole-file pieces (only into a file with no text) and the generic scope of the kinds but ia-entity
    if (isWhole(piece) || generic(piece, opts.kitKind)) {
      raw = placeR2(src, g, piece, cache, true);
      if (raw.refuse) { r.refuse = raw.refuse; return; }
      g = raw.g;
      if (raw.warn) r.warn.push(raw.warn);
      s = scopeAt(src, g, cache);
      comp = compile(piece, values);
      emit(r, src, g, s, comp, cache);
      asciiWarn(r, piece, values);
      return;
    }
    ex = places(src, cache, isIa);
    raw = gapOf(src, g, cache, isIa, ex); g = raw.g; s = raw.s;
    if (!fitsS(s, piece, ex)) {
      if ((piece.scope || []).indexOf('top') >= 0 && s.depth > 0) {
        raw = topAfter(src, g, s, cache);
        if (raw) { g = raw.g; s = raw.s; r.warn.push({ k: 'ide.kit.addedAfter', p: { n: raw.n } }); }
      }
      if (!fitsS(s, piece, ex)) {
        n = nearest(src, g, piece, cache, ex);
        r.warn = [];
        r.refuse = { k: 'ide.kit.x.scope', p: { where: (piece.scope || [''])[0], n: n, ev: (piece.events || []).join(', ') } };
        if (n) r.refuse.near = n;
        return;
      }
    }
    comp = compile(piece, values);
    // duplicate reactions (INT-02): only where the gap sits directly in an entity block ((mod ...) around it is transparent),
    // or at the top level of a fragment file (its top-level reactions all go into the one block that includes it)
    frag = ex.frag(s);
    var direct = isIa && ((s.kind === 'block' && !!s.block) || frag);
    for (i = s.block && !frag ? s.block.depth : 0; direct && i < s.depth; i++) if (!(s.frames[i].ch === '(' && s.frames[i].head === 'mod')) direct = false;
    if (direct) {
      pe = pieceEvents(comp.text); evs = pe.evs;
      if (piece.event && !evs.length) evs.push(evKey(fillEvent(piece, values)));
      // a game or file helper the piece calls at its top level brings its reactions too (when they can be read)
      if (pe.ext.length) {
        names = opts.names || scanNames(src); defs = names.defines;
        for (k = 0; k < pe.ext.length; k++) { he = helperEvents(pe.ext[k], g, defs, {}); for (i = 0; he && i < he.length; i++) if (evs.indexOf(he[i]) < 0) evs.push(he[i]); }
      }
      if (evs.length || pe.helpers.length) {
        info = blockInfo(src, frag ? { line: 1, depth: 0 } : s.block, cache);
        for (i = 0; i < evs.length && !r.refuse; i++) for (k = 0; k < info.handlers.length; k++) {
          if (info.handlers[k].event === evs[i]) { r.refuse = { k: 'ide.kit.x.dup', p: { ev: evShow(evs[i]) }, goto: info.handlers[k].line }; break; }
        }
        // the block already calls a helper this piece defines and calls (the same piece added twice)
        for (k = 0; k < info.calls.length && !r.refuse; k++) if (pe.helpers.indexOf(info.calls[k].name) >= 0) {
          r.refuse = { k: 'ide.kit.x.dup', p: { ev: evs.length ? evShow(evs[0]) : info.calls[k].name }, goto: info.calls[k].line };
        }
        if (!r.refuse && evs.length && (info.calls.length || info.includes.length)) {
          names = names || opts.names || scanNames(src); defs = names.defines;
          var unknown = null;
          for (k = 0; k < info.calls.length && !r.refuse; k++) {
            he = helperEvents(info.calls[k].name, info.calls[k].line, defs, {}, info.calls[k].inp);
            if (he === null) { if (!unknown) unknown = { name: info.calls[k].name, line: info.calls[k].line }; continue; }
            for (i = 0; i < evs.length; i++) if (he.indexOf(evs[i]) >= 0) { r.refuse = { k: 'ide.kit.x.dup', p: { ev: evShow(evs[i]) }, goto: info.calls[k].line }; break; }
          }
          if (!r.refuse && info.includes.length && (!unknown || info.includes[0].line < unknown.line)) unknown = { name: info.includes[0].path, line: info.includes[0].line };
          if (!r.refuse && unknown) r.refuse = { k: 'ide.kit.x.unknown', p: { name: unknown.name, ev: evShow(evs[0]) }, goto: unknown.line };
        }
        if (r.refuse) { r.warn = []; return; }
      }
    }
    emit(r, src, g, s, comp, cache);
    warnings(r, src, s, piece, values, opts, comp, names, isIa);
  }
  // text, indent, edits, fields and caret of a compiled piece put in at gap g (s = scopeAt there)
  function emit(r, src, g, s, comp, cache) {
    var cnt = src.count | 0, ind, out, blank, ln, edits, from, i, c, a, b;
    ind = indentFor(src, g, s, cache);
    out = indentText(comp.text, ind);
    blank = g <= cnt && /^\s*$/.test(line(src, g));
    if (g <= cnt && blank && s.depth > 0) { ln = line(src, g); edits = [{ line: g, col: 1, endCol: ln.length + 1, text: out.text }]; from = g; }
    else if (g <= cnt) { edits = [{ line: g, col: 0, text: out.text }]; from = g; }
    else if (cnt === 0) { edits = [{ line: 1, col: 0, text: out.text }]; from = 1; }
    else if (/^\s*$/.test(line(src, cnt))) { ln = line(src, cnt); edits = [{ line: cnt, col: 1, endCol: ln.length + 1, text: out.text + '\n' }]; from = cnt; }
    else { ln = line(src, cnt); edits = [{ line: cnt, col: ln.length + 1, endCol: ln.length + 1, text: '\n' + out.text }]; from = cnt + 1; }
    r.edits = edits; r.from = from; r.to = from + out.lines - 1;
    for (i = 0; i < comp.fields.length; i++) {
      c = comp.fields[i];
      if (c.k === 'list') continue;
      a = out.map(c.off); b = out.map(c.off + c.len);
      r.fields.push({ name: c.name, k: c.k, line: from + a.line, col: a.col + 1, len: b.off - a.off });
    }
    if (comp.caret !== null) { c = out.map(comp.caret); r.caret = { line: from + c.line, col: c.col + 1 }; }
  }
  // a note field that is not plain ASCII (the game reads data files byte by byte)
  function asciiWarn(r, piece, values) {
    var parts = partsOf(piece), i, v;
    for (i = 0; i < parts.length; i++) {
      if (typeof parts[i] === 'string' || parts[i].k !== 'comment') continue;
      v = has(values, parts[i].f) && values[parts[i].f] != null ? String(values[parts[i].f]) : String(parts[i].def || '');
      if (/[^\x20-\x7e\t]/.test(v)) pushW(r, 'ide.kit.w.ascii', {});
    }
  }
  function pushW(r, k, p) { var i; for (i = 0; i < r.warn.length; i++) if (r.warn[i].k === k) return; r.warn.push({ k: k, p: p || {} }); }
  function warnings(r, src, s, piece, values, opts, comp, names, isIa) {
    var u = pieceUse(comp.text), i, j, need, ok, c, parts, v, all = u.conds.concat(u.acts), nc = u.conds.length;
    // the event's command known (s.ctx): w.delay when a timer dropped what is needed, else w.noCtx. Not known (a reaction
    // of your own, crew): only w.delay, when a timer dropped every word the condition or action can use
    if (s.event != null && (s.ctx || s.lost.length)) {
      for (i = 0; i < all.length; i++) {
        c = all[i];
        if (i < nc && c.c === 'hit_side' && (c.a === 'front' || c.a === 'back')) continue;
        need = i >= nc ? W.ctxOfAct[c.c] : c.c === 'hit_side' ? ['bullet'] : (has(W.ctxOfCond, c.c) ? W.ctxOfCond[c.c] : null);
        if (!need || !need.length) continue;
        ok = false;
        if (s.ctx) { for (j = 0; j < need.length; j++) if (s.ctx.indexOf(need[j]) >= 0) ok = true; }
        else { for (j = 0; j < need.length; j++) if (s.lost.indexOf(need[j]) < 0) ok = true; }
        if (ok) continue;
        var lostIt = false;
        for (j = 0; j < need.length; j++) if (s.lost.indexOf(need[j]) >= 0) lostIt = true;
        if (lostIt) pushW(r, 'ide.kit.w.delay', {}); else pushW(r, 'ide.kit.w.noCtx', { what: need[0] });
      }
    }
    if (u.calls.length || u.flags.length) {
      names = names || opts.names || scanNames(src);
      for (i = 0; i < u.calls.length; i++) {
        v = u.calls[i].toLowerCase();
        if (u.handlers.indexOf(v) >= 0) continue;
        ok = false;
        for (j = 0; j < names.events.length; j++) if (names.events[j].toLowerCase() === v) ok = true;
        if (!ok) { pushW(r, 'ide.kit.w.call', { name: u.calls[i] }); break; }
      }
      for (i = 0; i < u.flags.length; i++) if (names.flags.indexOf(u.flags[i]) < 0) { pushW(r, 'ide.kit.w.flag', { name: u.flags[i] }); break; }
    }
    if (u.mod && isIa) pushW(r, 'ide.kit.w.mp', {});
    parts = partsOf(piece);
    // {on "@name@" ...} filled with a game event word (contact, engine on): in quotes it is a reaction of your own, so it
    // neither replaces nor switches off the game's reaction to that event (the default is the game's own form: no note)
    for (i = 1; i < parts.length - 1; i++) {
      if (typeof parts[i] === 'string' || !parts[i].f || typeof parts[i - 1] !== 'string' || typeof parts[i + 1] !== 'string') continue;
      if (!/\{on[ \t]+"$/.test(parts[i - 1]) || parts[i + 1].charAt(0) !== '"') continue;
      v = has(values, parts[i].f) && values[parts[i].f] != null ? String(values[parts[i].f]) : String(parts[i].def || '');
      if (v === String(parts[i].def || '')) continue;
      c = v.replace(/^\s+/, '').split(/\s+/)[0].toLowerCase();
      if (c && W.events.indexOf(c) >= 0) pushW(r, 'ide.kit.w.quoted', { name: v });
    }
    for (i = 0; i < parts.length; i++) {
      if (typeof parts[i] === 'string' || parts[i].k !== 'comment') continue;
      v = has(values, parts[i].f) && values[parts[i].f] != null ? String(values[parts[i].f]) : String(parts[i].def || '');
      if (/[^\x20-\x7e\t]/.test(v)) pushW(r, 'ide.kit.w.ascii', {});
    }
  }

  api = { use: use, scopeAt: scopeAt, cacheDrop: cacheDrop, plan: plan, fits: fitsAt, compile: compile, parse: parse, scanNames: scanNames, normEvent: normEvent };
  return api;
}
module.exports = kitPlan;
