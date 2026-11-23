// fix/tidy: two fixers that remove text the game never uses, so nothing changes in game.
//   botkeys  BOT_DATA_UNUSED_KEY (keylint, AI-15): `period = ...` fields and the `AttackBaseTime = ...` statement in the mod's
//            script/multiplayer/bot.data.lua are removed. Refused when another Lua file of the mod or the game names the key
//            (a custom bot script could read it), when a value is not a plain string/number/name, or when the result does not pass check().
//   lngdup   DUP_KEY (lnglint, LOC-04: the later definition wins): the earlier line of each repeated key is removed from the mod's
//            .lng. Only a line that holds exactly that one key is removed; other shapes stay and are listed as refused.
//            GoH (c.exe 'goh'): inside one GoH text file the FIRST definition stays (GHLOC-08), so the later lines are removed and the first
//            kept; GoH .lng files only (a .pot is left alone), patch path localizations/default/...; the check reads the keys first-wins.
//   plan(c, kinds:Set, prior:Map out->edit) -> { edits:[{kind, key, out, before, after, why:[..], targets:[{code,line}], removed:n}], cant:[{key,line,code,msg}], counts }
//     an lng edit of the same file planned earlier (prior) is composed: the duplicates are removed from its result, it stays one edit.
//   check(e) -> null | reason   (the gate fix.js runs on every edit of these kinds)
// Author: Imperator_Aug (ARSENAL, ia-0f30c6fb)
const vfs = require('../../lib/vfs');
const { luaPass, stripLua } = require('../../keylint/chkkey');
const lng = require('./lng');

const BOT = 'resource/script/multiplayer/bot.data.lua', KEYS = ['period', 'AttackBaseTime'];
const VALUE = /^(?:"[^"\n]*"|'[^'\n]*'|-?[\d.]+|[A-Za-z_][\w.]*)/;   // on the stripped text: string, number or a name

// ---- botkeys
// -> { text, removed:[{line, key}], cant:[{line, msg}] }
function stripBotKeys(text) {
  const s = stripLua(text), cuts = [], removed = [], cant = [], lineAt = ix => s.slice(0, ix).split('\n').length;
  const re = /(?<![\w.])(period|AttackBaseTime)\s*=(?!=)/g;
  let m;
  while ((m = re.exec(s))) {
    const at = m.index, line = lineAt(at), ls = s.lastIndexOf('\n', at - 1) + 1, le = s.indexOf('\n', at) < 0 ? s.length : s.indexOf('\n', at);
    const before = s.slice(ls, at), depth = (s.slice(0, at).match(/\{/g) || []).length - (s.slice(0, at).match(/\}/g) || []).length;
    if (depth === 0) {   // a statement: the whole line goes, when the line holds nothing else
      if (before.trim() !== '' || /[;{}]/.test(s.slice(at, le))) { cant.push({ line, msg: `"${m[1]}" shares its line with other code` }); continue; }
      cuts.push([ls, le < text.length ? le + 1 : le]); removed.push({ line, key: m[1] }); continue;
    }
    // a table field: name = value, then a comma or the closing brace
    let p = at + m[0].length; while (s[p] === ' ' || s[p] === '\t') p++;
    const v = VALUE.exec(s.slice(p, le));
    if (!v) { cant.push({ line, msg: `"${m[1]}" has a value that is not a plain string, number or name` }); continue; }
    let q = p + v[0].length; while (s[q] === ' ' || s[q] === '\t') q++;
    if (s[q] === ',' || s[q] === ';') { q++; while (s[q] === ' ' || s[q] === '\t') q++; cuts.push([at, q]); removed.push({ line, key: m[1] }); continue; }
    if (s[q] === '}') {   // last field: the separator before it goes too
      let b = at; while (b > ls && (s[b - 1] === ' ' || s[b - 1] === '\t')) b--;
      if (s[b - 1] === ',' || s[b - 1] === ';') { cuts.push([b - 1, q]); removed.push({ line, key: m[1] }); continue; }
      if (s[b - 1] === '{') { cuts.push([at, q]); removed.push({ line, key: m[1] }); continue; }
    }
    cant.push({ line, msg: `"${m[1]}" is not followed by a comma or a closing brace on its line` });
  }
  let out = '', pos = 0;
  for (const [a, b] of cuts.sort((x, y) => x[0] - y[0])) { if (a < pos) continue; out += text.slice(pos, a); pos = b; }
  return { text: out + text.slice(pos), removed, cant };
}
// another Lua file that names one of the keys (a bot script that reads it): -> [{ key, file }]
function readers(c) {
  const out = [];
  for (const [key, rec] of c.v.files) {
    if (!/^resource\/script\/.*\.lua$/.test(key) || /(^|\/)bot\.data\.lua$/.test(key) || rec.deleted) continue;
    let s; try { s = stripLua(vfs.readRec(rec).toString('latin1')); } catch (e) { continue; }
    for (const k of KEYS) if (new RegExp('(?<![\\w])' + k + '(?![\\w])').test(s)) out.push({ key: k, file: key });
  }
  return out;
}
const braces = s => { const t = stripLua(s); return [(t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length, (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length]; };

// ---- lngdup
// -> { text, removed:[{line, key, kept}], cant:[{line, msg}] }
function stripLngDups(text, keepFirst) {
  const lint = require('../../lnglint/lnglint');
  const eol = /\r\n/.test(text) ? '\r\n' : '\n', lines = text.split(/\r?\n/), drop = new Map(), cant = [];
  for (const f of lint.lintBuffer('x.lng', text)) {
    if (f.code !== 'DUP_KEY' && f.code !== 'DUP_KEY_SAME') continue;
    const m = /^"(.*)" duplicates line (\d+)/.exec(f.msg); if (!m) continue;
    const early = keepFirst ? f.line : +m[2], kept = keepFirst ? +m[2] : f.line, L = lines[early - 1], leaf = m[1].split('/').pop();   // early = the line removed
    if (drop.has(early)) continue;
    const one = L != null && /^\s*\{\s*"((?:[^"\\]|\\.)*)"(?:\s+"(?:[^"\\]|\\.)*")*\s*\}\s*(?:;.*)?$/.exec(L);
    if (!one || one[1].toLowerCase() !== leaf.toLowerCase()) { cant.push({ line: early, msg: `"${m[1]}" at line ${early} is not alone on its line (the copy at line ${kept} is the one the game uses)` }); continue; }
    drop.set(early, { line: early, key: m[1], kept });
  }
  if (!drop.size) return { text, removed: [], cant };
  return { text: lines.filter((l, i) => !drop.has(i + 1)).join(eol), removed: [...drop.values()], cant };
}
const leavesOf = (buf, firstWins) => { const b = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? buf.subarray(3) : buf; return lng.parse(b.toString('utf8'), { firstWins }).leaves; };

function plan(c, kinds, prior = new Map()) {
  const edits = [], cant = [], counts = { botkeys: 0, lngdup: 0 };
  if (kinds.has('botkeys')) {
    const rec = c.v.files.get(BOT);
    if (rec && c.mineOf(rec)) {
      const before = vfs.readRec(rec), text = before.toString('latin1'), r = stripBotKeys(text);
      const rd = r.removed.length ? readers(c) : [];
      if (rd.length) cant.push({ key: BOT, code: 'FIX_BOTKEYS_READ', msg: `kept: ${[...new Set(rd.map(x => x.key))].join(', ')} is named in ${[...new Set(rd.map(x => x.file))].slice(0, 3).join(', ')}, so a script may read it` });
      else {
        for (const x of r.cant) cant.push({ key: BOT, line: x.line, code: 'FIX_BOTKEYS_SHAPE', msg: x.msg });
        if (r.removed.length) {
          counts.botkeys = r.removed.length;
          edits.push({ kind: 'botkeys', key: BOT, out: BOT, before, after: Buffer.from(r.text, 'latin1'), removed: r.removed.length,
            why: [`${r.removed.length} unused bot keys removed (${[...new Set(r.removed.map(x => x.key))].join(', ')}); the bot never reads them`],
            targets: r.removed.map(x => ({ code: 'BOT_DATA_UNUSED_KEY', line: x.line })) });
        }
      }
    }
  }
  if (kinds.has('lngdup')) {
    const goh = c.exe === 'goh';
    for (const [key, rec] of c.v.files) {
      if (!key.startsWith(lng.LOC_ROOT) || !key.endsWith('.lng') || !c.mineOf(rec)) continue;
      const out = goh ? 'localizations/default/' + key.slice('resource/'.length) : 'localization/' + key.slice(lng.LOC_ROOT.length), pe = prior.get(out);
      const src = pe && pe.kind === 'lng' ? pe.after : vfs.readRec(rec);
      const bom = src[0] === 0xEF && src[1] === 0xBB && src[2] === 0xBF, body = src.subarray(bom ? 3 : 0);
      let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch (e) { continue; }   // not UTF-8: the lng fixer says so
      const r = stripLngDups(text, goh);
      // a key written three times or more: each pass takes the earliest copy (line numbers of later passes are those of the shorter text)
      for (let n = 0; n < 8 && r.removed.length; n++) { const x = stripLngDups(r.text, goh); if (!x.removed.length) break; r.text = x.text; r.removed.push(...x.removed); }
      for (const x of r.cant) cant.push({ key: out, line: x.line, code: 'FIX_LNGDUP_SHAPE', msg: x.msg });
      if (!r.removed.length) continue;
      counts.lngdup += r.removed.length;
      const after = Buffer.concat([bom ? src.subarray(0, 3) : Buffer.alloc(0), Buffer.from(r.text, 'utf8')]);
      const why = goh ? `${r.removed.length} later copies of repeated text keys removed; GoH already uses the first one` : `${r.removed.length} earlier copies of repeated text keys removed; the game already uses the later one`;
      const targets = r.removed.map(x => ({ code: 'DUP_KEY', line: goh ? x.line : x.kept }));
      // checked here, so a file that reads differently without the line is left whole (and an lng merge of it stays as planned)
      const bad = check({ kind: 'lngdup', before: src, after, firstWins: goh });
      if (bad) { counts.lngdup -= r.removed.length; cant.push({ key: out, code: 'FIX_LNGDUP_CHECK', msg: `kept all ${r.removed.length} repeated keys: without the ${goh ? 'later' : 'earlier'} lines ${bad} (a line before them is probably broken, see the other findings of this file)` }); continue; }
      if (pe && pe.kind === 'lng') { pe.after = after; pe.dedup = r.removed.length; pe.dedupFrom = src; pe.targets = (pe.targets || []).concat(targets); pe.dedupWhy = why; pe.firstWins = goh; }
      else edits.push({ kind: 'lngdup', key, out, before: src, after, removed: r.removed.length, why: [why], targets, firstWins: goh });
    }
  }
  return { edits, cant, counts };
}

function check(e) {
  if (e.kind === 'botkeys') {
    const a = e.after.toString('latin1'), b = e.before.toString('latin1');
    if (luaPass(e.key, a).some(f => f.code === 'BOT_DATA_UNUSED_KEY') && !stripBotKeys(a).cant.length) return 'unused keys are still there';
    const ba = braces(a), bb = braces(b);
    if (ba[0] !== bb[0] || ba[1] !== bb[1]) return 'brackets no longer balance the way they did';
    // what is left must be the old text minus the removed pieces, in order
    let i = 0; for (let j = 0; j < b.length && i < a.length; j++) if (b[j] === a[i]) i++;
    if (i !== a.length) return 'the result is not the old file with pieces taken out';
    const luaCheck = require('../../ide/intel/lua').luaCheck;
    if (luaCheck(a).length > luaCheck(b).length) return 'the Lua structure check finds something new';
    return null;
  }
  // lngdup (or the dedupe part of an lng edit): same keys, same texts
  const from = e.kind === 'lng' ? e.dedupFrom : e.before;
  const A = leavesOf(e.after, e.firstWins), B = leavesOf(from, e.firstWins);
  if (A.size !== B.size) return 'the set of text keys changed';
  for (const [k, l] of B) { const x = A.get(k); if (!x || x.vals.join('\u0000') !== l.vals.join('\u0000')) return `the text of ${k} changed`; }
  return null;
}

module.exports = { plan, check, stripBotKeys, stripLngDups, KINDS: ['botkeys', 'lngdup'] };
