#!/usr/bin/env node
// botrecipe: apply the known fixes to a mod's script/multiplayer/bot.lua (loose or in the mod's paks), write a patched full copy.
//   node tools/botrecipe/botrecipe.js <mod> --out <mod folder> [--dry-run]     rows: none new
//   data mode (bot.data.lua / card / mode set, see dataMode): <mod> --out <dir> --buy-first <unit> [--cheap] [--team-mode M] [--stock R] [--bot-main F]; notes T18, refmods/robz/mapfix-build.js
// fix 1 map: take the map name from the `Starting "<map>` line when `Loading map '<m>'` found none.
// fix 2 buy: a "Not found - <name>" line proves the log is readable (S.logWorks = true), so silent refusals count as missing.
// Anchor missing = refuse (exit 2) and name it; never guesses. Already fixed = nothing to do (exit 0).
// Lua caveats for any NEW recipe: first Subscribe per event stays, so wrap after require; `Context` is local to bot.lua.
// The patch is a full bot.lua copy: stale once the source bot.lua changes (rerun). CRLF/bytes kept (latin1 round trip).
// --exe as64|mowas_2|mowas2|goh: the game whose files --game reads (vfs exe, lib/games); default from --target (as64 -> as64, mowas2 -> mowas_2),
//   else none = as before (as64 first on the shared AS2 install). Without --target, --exe as64|mowas_2 also picks the new mod.info range.
//   --exe goh (Gates of Hell; --game default = the GoH install): GoH has no bot.lua and no bot.data.lua (GHMIS-66), so the fix mode and
//   --check refuse with one plain line (exit 2). Data mode: --buy-first edits the GoH buy list script/multiplayer/units/<army>/<stage>.<army>.lua
//   (gohBuyFirst: --army eng|fin|ger|rus|usa --stage early|mid|late|conquest, or --after <unit> to find the file); --team-mode and --bot-main
//   as on AS2; --card-like and --cheap refuse (GoH buy cards are multi-line macro entries, not built). No mod.info is written for GoH.
// Author: Imperator_Aug (ARSENAL, ia-c016cda6)
const fs = require('fs'), path = require('path');
const pak = require('../lib/pak'), { walkFiles } = require('../lib/report');
// plain-words line under every refusal (GUI ext bots shows the same text, see plain.js)
const PLAIN = require('./plain'), _err = console.error;
console.error = (m, ...r) => { _err(m, ...r); const p = typeof m === 'string' && PLAIN.of(m); if (p) _err('  in plain words: ' + p); };

const RECIPES = [
  { name: 'map-from-Starting-line',
    done: s => s.includes(`'Starting "([^":]+)'`) || s.includes(`Starting "multi/`),   // second form: a bot that parses the Starting line itself
    // na: the marker the fix is about is absent from the file entirely (a bot that never reads the map from the log). Marker present but anchor changed still refuses.
    na: s => !s.includes('Loading map'),
    anchor: /(for m in string\.gmatch\(txt, "Loading map '\(\[\^'\]\+\)'"\) do last = m end\r?\n)/,
    apply: (s, m) => s.replace(m[0], `${m[1]}\tif not last then for m in string.gmatch(txt, 'Starting "([^":]+)') do last = m end end\r\n`) },
  { name: 'buy-NotFound-proves-log',
    done: s => s.includes('S.logWorks = true; return "missing"'),
    na: s => !s.includes('Not found - ') && !s.includes('logWorks'),   // no log-based purchase check in this bot.lua: nothing to fix
    anchor: /if string\.find\(txt, "Not found - " \.\. name, 1, true\) then return "missing" end/,
    apply: (s, m) => s.replace(m[0], 'if string.find(txt, "Not found - " .. name, 1, true) then S.logWorks = true; return "missing" end') },
];

function findBot(mod) {
  for (const f of walkFiles(mod, /(bot\.lua|\.pak)$/i)) {
    if (/script[\\/]multiplayer[\\/]bot\.lua$/i.test(f)) return { buf: fs.readFileSync(f), from: f };
    if (/\.pak$/i.test(f)) {
      try { const L = pak.list(f), e = L.find(x => x.name.replace(/\\/g, '/').toLowerCase() === 'script/multiplayer/bot.lua'); if (e) return { buf: pak.read(L, e), from: f + '!' + e.name }; } catch (e) { /* unreadable pak */ }
    }
  }
  return null;
}

// ---- data mode (C2, folds run/chainn3/bot.js): bot buys <unit> first, card cheap, mode in team selection ----
// --buy-first U: line `{priority P, class = UnitClass.C, unit = "U"},` after the `unit = "<after>"` line of bot.data.lua
//   (source: --stock <root with script/multiplayer/bot.data.lua>, else the mod's own). Vanilla mk7 = eng stage 2 tank list.
// --cheap: U's card in the mod's set/multiplayer/units/*.set: g(eN)->g(e10) sc(x)->sc(2.50) cp(n)->cp(5) (the chainn3 values).
// --team-mode M: set/multiplayer/games/M.set {armySelectionMode alliance} -> team. --bot-main F: copy F as bot.main.lua, CRLF.
// Out may equal the mod here (the script edited in place); every step is idempotent. Bytes kept (latin1), inserted line CRLF.
// --card-like X [--game G]: add U's buy card as a copy of X's (see below). --stock absent and no bot.data.lua in the mod: --game's vanilla one.
const DATA_VAL = ['--stage', '--army', '--mods', '--target', '--out', '--buy-first', '--after', '--class', '--priority', '--stock', '--team-mode', '--bot-main', '--card-like', '--game', '--exe'];
// the game (lib/games): --exe, else --target, else undefined (vfs picks as before). A bad --exe refuses before anything is read.
const games = require('../lib/games');
function exeArg(a) {
  const i = a.indexOf('--exe');
  if (i >= 0) { const g = games.get(a[i + 1]); if (!g) { console.error('--exe as64|mowas_2|mowas2|goh'); process.exit(2); } return g.exe; }
  const t = a.indexOf('--target'), g = t >= 0 ? games.get(a[t + 1]) : null;
  return g && g.kind === 'as2' ? g.exe : undefined;
}
// vfs options of the game read by --game: the exe handed on only when named (no --exe/--target: byte-for-byte as before)
const vfsOpts = (gameDir, mods, exe) => (exe ? { gameDir, mods, exe } : { gameDir, mods });
// --game, else with --exe goh the GoH install (games.install)
const gameArg = (a, exe) => { const i = a.indexOf('--game'); return i >= 0 ? a[i + 1] : exe === 'goh' ? games.install('goh').dir : null; };
// mod.info for a new out folder (PORT-48, COV-C13): the range follows the source mod, never a fixed modern Min.
// --target as64|mowas2 wins; else the source mod.info's Min (>= 3.301 = as64 modern, else mowas2 legacy); no source Min = mowas2.
// Ranges come from newmod RANGE: mowas2 Min 3.262.0 Max 3.262.1, as64 Min 3.301 no Max. CRLF via lib/modinfotext. An existing mod.info is kept.
const verGE = (v, w) => { const x = v.split('.').map(Number), y = w.split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return true; };
function modInfoFor(mod, out, target, why0) {
  const { RANGE } = require('../newmod/newmod');   // lazy: newmod reads --help at load
  if (target && !['as64', 'mowas2'].includes(target)) { console.error('--target as64|mowas2'); process.exit(2); }
  let t = target, why = why0 || '--target';
  if (!t) {
    const src = path.join(mod, 'mod.info'), m = fs.existsSync(src) && /\{MinGameVersion\s+"([\d.]+)"\}/.exec(fs.readFileSync(src, 'latin1'));
    t = m && verGE(m[1], RANGE.as64.min) ? 'as64' : 'mowas2'; why = m ? `source Min ${m[1]}` : 'no source Min';
  }
  const r = RANGE[t], L = ['{Mod', `\t{Name "${path.basename(path.resolve(out))}"}`, `\t{MinGameVersion "${r.min}"}`];
  if (r.max) L.push(`\t{MaxGameVersion "${r.max}"}`);
  return { text: L.concat('}', '').join('\r\n'), say: `mod.info ${t} (${why})` };
}
function writeModInfoOnce(mod, out, a) {
  const ti = a.indexOf('--target'), ex = ti < 0 && a.includes('--exe') ? games.idOf(exeArg(a)) : null;   // --exe as64|mowas_2 names the range when --target does not
  const mi = path.join(out, 'mod.info'), r = modInfoFor(mod, out, ti < 0 ? ex : a[ti + 1], ti < 0 && ex ? '--exe' : null);
  if (fs.existsSync(mi)) return null;
  require('../lib/modinfotext').writeModInfo(mi, r.text); return r.say;
}
function dataMode(mod, out, a) {
  const o = k => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  const unit = o('--buy-first'), after = o('--after') || 'mk7', cls = o('--class') || 'Tank', pri = o('--priority') || '1000.0';
  const R = path.join(mod, 'resource'), writes = [], say = [];
  let noop = false;   // --buy-first found the unit in the list already and nothing else was asked: say so, write nothing, exit 0
  const rd = (root, rel) => { const p = path.join(root, ...rel.split('/')); return fs.existsSync(p) ? fs.readFileSync(p, 'latin1') : null; };
  const die = m => { console.error(m); process.exit(2); };
  const exe = exeArg(a);
  if (exe === 'goh') for (const k of ['--card-like', '--cheap']) if (a.includes(k)) games.refuse('botrecipe ' + k, 'goh', 'GoH buy cards are multi-line macro entries in set/multiplayer/units/<stage>/units_<army>.set, not the one-line AS2 card this option edits; their macro and price form is not yet in the notes, so this is not built for GoH', 'GHMIS-66');
  if (o('--bot-main')) { writes.push(['script/multiplayer/bot.main.lua', fs.readFileSync(o('--bot-main'), 'latin1').replace(/\r?\n/g, '\r\n')]); say.push('bot.main.lua copied'); }
  const ud = path.join(R, 'set/multiplayer/units'), card = u => new RegExp(`\\{"${u.replace(/\W/g, '\\$&')}"[^\\r\\n]*`);
  const modSets = () => (fs.existsSync(ud) ? fs.readdirSync(ud).filter(f => /\.set$/i.test(f)).sort() : []).map(f => [f, fs.readFileSync(path.join(ud, f), 'latin1')]);
  let cardSet = null;   // [file, text] after --card-like, so --cheap edits that copy
  if (o('--card-like')) {
    // C2b: goh2as2 writes no buy card and gen refuses a non-empty out; copy the card of X (mod's sets, else game vfs) under U,
    // right after X's line. The whole set file lands in the mod (it replaces the game's file, as gen roster / clone-entity --roster do).
    if (!unit) die('--card-like needs --buy-first <unit>');
    const like = o('--card-like'), have = modSets().find(([, t]) => card(unit).test(t));
    if (have) { say.push(`card ${unit}: already in ${have[0]}`); cardSet = have; }
    else {
      let src = modSets().find(([, t]) => card(like).test(t));
      if (!src) {
        if (!o('--game')) die(`BOT_NO_CARD: no {"${like}" card in the mod; pass --game G to read the game's units sets`);
        const vfs = require('../lib/vfs'), v = vfs.build(vfsOpts(o('--game'), [], exe));
        for (const [k, rec] of v.files) { const m = /^resource\/set\/multiplayer\/units\/([^/]+\.set)$/.exec(k); if (!m) continue; const t = vfs.readRec(rec).toString('latin1'); if (card(like).test(t)) { src = [m[1], t]; break; } }
        vfs.closeRecs && vfs.closeRecs();
      }
      if (!src) die(`BOT_NO_CARD: no {"${like}" card in the mod or game units sets (--card-like)`);
      const l = card(like).exec(src[1])[0], at = src[1].indexOf(l) + l.length, eol = src[1].includes('\r\n') ? '\r\n' : '\n';
      cardSet = [src[0], src[1].slice(0, at) + eol + l.replace(`{"${like}"`, `{"${unit}"`) + src[1].slice(at)];
      writes.push(['set/multiplayer/units/' + src[0], cardSet[1]]); say.push(`card ${unit} = copy of ${like} in ${src[0]}`);
    }
  }
  // --buy-first (after the card step, so the card's units set names the army). T-CHAINFIX: the list is the card's army (vehicles_ger.set -> ["ger"]):
  // G-CHAIN2 put the German panzer4j after mk7 in the ["eng"] list (bot.data.lua:79-80), so only an eng bot could buy it [I].
  // No --after: first UnitClass.<class> line of that army's lists (else its first line). --after in another army's list: refused, nothing written.
  if (unit && exe === 'goh') { const r = gohBuyFirst(mod, a, unit, die); writes.push([r.rel, r.text]); say.push(r.say); }
  else if (unit) {
    const rel = 'script/multiplayer/bot.data.lua', stock = o('--stock');
    let d = (stock && rd(fs.existsSync(path.join(stock, 'script')) ? stock : path.join(stock, 'resource'), rel)) || rd(R, rel);
    if (d == null && o('--game')) { const vfs = require('../lib/vfs'), v = vfs.build(vfsOpts(o('--game'), [], exe)), r = v.files.get('resource/' + rel); if (r) d = vfs.readRec(r).toString('latin1'); vfs.closeRecs && vfs.closeRecs(); }
    if (d == null) die(`BOT_NO_DATA_LUA: no ${rel} in --stock, the mod or --game`);
    const cs = cardSet && card(unit).test(cardSet[1]) ? cardSet : modSets().find(([, t]) => card(unit).test(t));
    const army = o('--army') || (cs && (/_([a-z0-9]+)\.set$/i.exec(cs[0]) || [])[1]), cs0 = cs ? cs[0] : '--army';
    // --stage N: only the Nth purchase stage (the Nth table in Purchases) of bot.data.lua is searched and gets the line (default: the first stage the anchor is found in)
    let s0 = 0, s1 = d.length; const sg = o('--stage');
    // stages by their place in the Purchases table (stages.js), so a list without the stock comments works too (round 2 T1)
    if (sg) { const all = require('./stages').stagesOf(d), k = Number(sg); if (!all || !all.length) die('BOT_NO_STAGE: no purchase stages found in ' + rel + ' (the list has 0 stages)'); if (!(k >= 1 && k <= all.length)) die('BOT_NO_STAGE: no purchase stage ' + sg + ' in ' + rel + ' (the list has ' + all.length + (all.length === 1 ? ' stage)' : ' stages)')); s0 = all[k - 1].o; s1 = all[k - 1].c + 1; }
    // ["eng"] = { or eng = { (a list written by hand)
    const armyAt = i => { const h = [...d.slice(0, i).matchAll(/(?:\[\s*"(\w+)"\s*\]|\b(?!Units\b|Purchases\b)([A-Za-z_]\w*))\s*=\s*\{/g)].pop(); return h ? h[1] || h[2] : null; };
    const line = `{priority = ${pri}, class = UnitClass.${cls}, unit = "${unit}"},`;
    // vanilla writes the last row of each ["army"] list without the comma (bot.data.lua: every list ends `unit = "x"}` then `},`);
    // such a row is an anchor too: it gets the comma and the new row becomes the comma-less last one (GEN-FIX4)
    // a row: {priority = P, class = UnitClass.C, unit = "U"} in any spacing, fields in any order, extra fields (unlock=, line=true) and a
    // trailing comma inside the braces allowed (fix3 T3: "ai spawn improved" writes {priority=2.0, class=UnitClass.Infantry, unit="x", line=true,},)
    const esc = u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rowRe = (u, g) => new RegExp(`^([ \\t]*)\\{(?=[^{}\\r\\n]*\\bpriority\\s*=)(?=[^{}\\r\\n]*\\bclass\\s*=\\s*UnitClass\\.(\\w+))[^{}\\r\\n]*\\bunit\\s*=\\s*"${u}"[^{}\\r\\n]*\\},?`, g || 'gm');
    const unitOf = row => (/\bunit\s*=\s*"([^"]+)"/.exec(row) || [])[1];
    const has = [...d.matchAll(rowRe(esc(unit)))].some(x => x.index >= s0 && x.index < s1 && (!army || (armyAt(x.index) || '').toLowerCase() === army.toLowerCase()));
    if (has) say.push(`buy-first ${unit}: already`);
    else {
      let m = null, an = after;
      if (o('--after') || !army) {
        m = rowRe(esc(after), 'm').exec(d.slice(s0, s1)); if (m) m.index += s0;
        if (!m) die(`BOT_ANCHOR_MISSING: buy-first: no unit = "${after}" line in ${rel}; pass --after <unit in the list>`);
        const la = armyAt(m.index);
        if (army && la && la.toLowerCase() !== army.toLowerCase()) die(`BOT_ARMY_MISMATCH: buy-first: --after ${after} is in the ["${la}"] list, but the ${unit} card is in ${cs0} (army ${army}): the ${la} bot would buy it, the ${army} bot never. Give --after a unit of the ["${army}"] list, or leave --after out`);
      } else {
        const all = [...d.matchAll(rowRe('[^"]+'))].filter(r => r.index >= s0 && r.index < s1 && (armyAt(r.index) || '').toLowerCase() === army.toLowerCase());
        const rows = all.some(r => /,$/.test(r[0])) ? all.filter(r => /,$/.test(r[0])) : all;   // a row with a comma first (the earlier pick); a one-row list: its last row
        if (!rows.length) die(`BOT_ANCHOR_MISSING: buy-first: no ["${army}"] list (army ${army}) in ${rel}${sg ? ' stage ' + sg : ''}; pass --after <unit in the list>`);
        m = rows.find(r => r[2] === cls) || rows[0]; an = unitOf(m[0]);
      }
      // the new row goes after the anchor's whole line (a "-- note" after the row stays with its row); a comma-less last row gets its comma
      const end = m.index + m[0].length, last = !/,$/.test(m[0]);
      let eol = d.indexOf('\n', end); if (eol < 0) eol = d.length; else if (d[eol - 1] === '\r') eol--;
      const nl = d.includes('\r\n') ? '\r\n' : '\n';
      d = d.slice(0, end) + (last ? ',' : '') + d.slice(end, eol) + nl + m[1] + (last ? line.slice(0, -1) : line) + d.slice(eol); say.push(`buy-first ${unit} after ${an}${army ? ` (["${army}"] list, card in ${cs0})` : ' (card army unknown: no card in the mod sets)'}`);
    }
    // the unit is in the list already: in place (out = the mod) there is nothing to write, and a mod with no list of its own must not get
    // an unchanged copy of the game's whole list (ai-pages check A4). A separate --out still gets its full copy.
    // --keep-copy: the caller edits the line afterwards (GUI line fields), so the mod needs its own copy of the list all the same.
    if (!has || path.resolve(out) !== path.resolve(mod) || a.includes('--keep-copy')) writes.push([rel, d]);
    else noop = true;
  }
  if (a.includes('--cheap')) {
    if (!unit) die('--cheap needs --buy-first <unit>');
    const re = card(unit), hit = cardSet && re.test(cardSet[1]) ? cardSet : modSets().find(([, t]) => re.test(t));
    if (!hit) die(`BOT_NO_CARD: no {"${unit}" card in ${ud}/*.set (add one: --card-like <unit> --game G)`);
    const f = hit[0]; let v = hit[1]; const l = re.exec(v)[0];
    const wi = writes.findIndex(w => w[0] === 'set/multiplayer/units/' + f); if (wi >= 0) writes.splice(wi, 1);
    const nl = l.replace(/g\(e\d+\)/, 'g(e10)').replace(/sc\([\d.]+\)/, 'sc(2.50)').replace(/cp\(\d+\)/, 'cp(5)');
    v = v.replace(l, nl); writes.push(['set/multiplayer/units/' + f, v]); say.push(`cheap ${f}: ${nl === l ? 'already' : nl}`);
  }
  if (o('--team-mode')) {
    const rel = `set/multiplayer/games/${o('--team-mode')}.set`; let s = rd(R, rel);
    if (s == null) die(`BOT_NO_MODE_SET: no ${rel} in the mod`);
    if (s.includes('{armySelectionMode team}')) say.push('team-mode: already');
    else if (!s.includes('{armySelectionMode alliance}')) die(`BOT_ANCHOR_MISSING: team-mode: no {armySelectionMode alliance} in ${rel}`);
    else { s = s.replace('{armySelectionMode alliance}', '{armySelectionMode team}'); say.push('team-mode ' + o('--team-mode')); }
    writes.push([rel, s]);
  }
  if (!writes.length && noop) { console.log(say.join('; ')); console.log('nothing to change: the bot list already has this unit; 0 files written'); return; }
  if (!writes.length) die('nothing asked: --buy-first U [--cheap] [--team-mode M] [--bot-main F]');
  console.log(say.join('; '));
  if (a.includes('--dry-run')) return;
  for (const [rel, s] of writes) { const p = path.join(out, 'resource', ...rel.split('/')); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'latin1'); }
  console.log(`${writes.length} ${writes.length === 1 ? 'file' : 'files'} written under ${path.join(out, 'resource')}`);
  // in place: the mod's own mod.info is its business. GoH: none written (its range must hold the GoH exe's own version, PORT-46, GHNET-22)
  if (exe === 'goh') { if (path.resolve(mod) !== path.resolve(out) && !fs.existsSync(path.join(out, 'mod.info'))) console.log('mod.info: not written for GoH (its version range must hold the GoH exe version, PORT-46); make one with your GoH mod tools'); }
  else if (path.resolve(mod) !== path.resolve(out)) { const mis = writeModInfoOnce(mod, out, a); if (mis) console.log(mis); }
}

// ---- GoH buy lists (GHMIS-66; [V] listing of the GoH install): script/multiplayer/units/<army>/<stage>.<army>.lua, each one
// Purchases["<stage>.<army>"] = { {Repeat = 0, Units = { rows }} }. Two row forms in vanilla: {priority = P, type = {...}, unit = "U"},
// (early, mid, late) and {availability = "A", base = {...}, class = {...}, grade = ..., ..., unit = "U"}, (conquest). Many rows sit in
// --[[ ]] blocks or after -- (switched off): only active rows count (luaCode blanks comments). The new row is a copy of the anchor row
// with unit = "U" (and --priority P: priority = P, or availability = "P"), so it has the file's own form. Anchor: --after <unit>, else the
// first active row naming "--class" (default Tank) in its type/base list, else the first active row. File: --army A --stage S, or the one
// roster holding --after. Source: --stock root, else the mod's loose file, else --game (default the GoH install) through the vfs (exe goh).
// What the GoH bot does with the extra row in a match is [T]; the file form is checked on the vanilla rosters [I].
const GOH_ROSTER = /^(?:resource\/)?script\/multiplayer\/units\/([^/]+)\/([^/.]+)\.\1\.lua$/i;
function luaCode(s) {   // s with every comment blanked to spaces (newlines kept, strings kept): same length, active code only
  let o = '', i = 0;
  while (i < s.length) {
    if (s.startsWith('--', i)) {
      const lb = /^--\[(=*)\[/.exec(s.slice(i, i + 64)); let end;
      if (lb) { const e = s.indexOf(']' + lb[1] + ']', i + 2); end = e < 0 ? s.length : e + lb[1].length + 2; }
      else { end = s.indexOf('\n', i); if (end < 0) end = s.length; }
      o += s.slice(i, end).replace(/[^\r\n]/g, ' '); i = end; continue;
    }
    const c = s[i], ls = c === '[' && /^\[(=*)\[/.exec(s.slice(i, i + 64));
    if (ls) { const e = s.indexOf(']' + ls[1] + ']', i + 2), end = e < 0 ? s.length : e + ls[1].length + 2; o += s.slice(i, end); i = end; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < s.length && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1; o += s.slice(i, j + 1); i = j + 1; continue; }
    o += c; i++;
  }
  return o;
}
// active rows of a roster text: [{at, end, indent, row, unit, comma}] (at..end = the row with its comma, in the original text)
function rosterRows(s) {
  const code = luaCode(s), re = /^([ \t]*)(\{[^\r\n]*?\bunit\s*=\s*"([^"]+)"\s*\})(,?)/gm, rows = [];
  for (const m of code.matchAll(re)) rows.push({ at: m.index, end: m.index + m[0].length, indent: m[1], row: s.slice(m.index + m[1].length, m.index + m[1].length + m[2].length), unit: m[3], comma: m[4] === ',' });
  return rows;
}
function gohBuyFirst(mod, a, unit, die) {
  const o = k => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  const after = o('--after'), army = o('--army'), stage = o('--stage'), cls = o('--class') || 'Tank', pri = o('--priority'), stock = o('--stock');
  const relOf = (ar, st) => `script/multiplayer/units/${ar}/${st}.${ar}.lua`;
  const roots = [];   // [kind, root]: --stock (root with script/ or resource/), the mod's loose resource/
  if (stock) roots.push(['stock', fs.existsSync(path.join(stock, 'script')) ? stock : path.join(stock, 'resource')]);
  roots.push(['mod', path.join(mod, 'resource')]);
  let V = null; const vfsOf = () => {   // the game's rosters, read once (exe goh)
    if (V) return V; V = new Map(); const G = gameArg(a, 'goh'); if (!G) return V;
    const vfs = require('../lib/vfs'), v = vfs.build({ gameDir: G, mods: [], exe: 'goh' });
    for (const [k, r] of v.files) if (GOH_ROSTER.test(k)) V.set(k.replace(/^resource\//, ''), vfs.readRec(r).toString('latin1'));
    vfs.closeRecs && vfs.closeRecs(); return V;
  };
  const read = rel => {
    for (const [, R] of roots) { const p = path.join(R, ...rel.split('/')); if (fs.existsSync(p)) return fs.readFileSync(p, 'latin1'); }
    return vfsOf().get(rel.toLowerCase()) || null;
  };
  let rel;
  if (army && stage) rel = relOf(army, stage);
  else if (after) {
    const all = new Set();
    for (const [, R] of roots) for (const f of (fs.existsSync(path.join(R, 'script', 'multiplayer', 'units')) ? walkFiles(path.join(R, 'script', 'multiplayer', 'units'), /\.lua$/i) : [])) { const r = path.relative(R, f).replace(/\\/g, '/'); if (GOH_ROSTER.test(r)) all.add(r.toLowerCase()); }
    for (const k of vfsOf().keys()) all.add(k);
    const hit = [...all].sort().filter(r => { const m = GOH_ROSTER.exec(r); return (!army || m[1] === army.toLowerCase()) && (!stage || m[2] === stage.toLowerCase()) && rosterRows(read(r) || '').some(x => x.unit === after); });
    if (!hit.length) die(`BOT_ANCHOR_MISSING: buy-first: no active unit = "${after}" row in a GoH roster (script/multiplayer/units/<army>/<stage>.<army>.lua); pass --army and --stage`);
    if (hit.length > 1) die(`BOT_ANCHOR_MISSING: buy-first: unit = "${after}" is in ${hit.length} GoH rosters (${hit.join(', ')}); pass --army and --stage to pick one`);
    rel = hit[0];
  } else die('BOT_NO_ROSTER: GoH: name the roster with --army <eng|fin|ger|rus|usa> and --stage <early|mid|late|conquest> (script/multiplayer/units/<army>/<stage>.<army>.lua), or --after <unit in a roster>');
  let d = read(rel);
  if (d == null) die(`BOT_NO_ROSTER: no ${rel} in --stock, the mod or the GoH game (--game)`);
  const rows = rosterRows(d);
  if (rows.some(x => x.unit === unit)) return { rel, text: d, say: `buy-first ${unit}: already in ${rel}` };
  if (!rows.length) die(`BOT_ANCHOR_MISSING: buy-first: no active {... unit = "..."} row in ${rel}`);
  let m;
  if (after) { m = rows.find(x => x.unit === after); if (!m) die(`BOT_ANCHOR_MISSING: buy-first: no active unit = "${after}" row in ${rel}; pass --after <unit in the list>`); }
  else m = rows.find(x => x.row.includes(`"${cls}"`)) || rows[0];
  let nr = m.row.replace(/\bunit\s*=\s*"[^"]+"/, `unit = "${unit}"`);
  if (pri != null) nr = nr.replace(/\bpriority\s*=\s*[-\d.]+/, `priority = ${pri}`).replace(/\bavailability\s*=\s*"[^"]*"/, `availability = "${pri}"`);
  const eol = d.includes('\r\n') ? '\r\n' : '\n';
  d = d.slice(0, m.end) + (m.comma ? '' : ',') + eol + m.indent + nr + (m.comma ? ',' : '') + d.slice(m.end);
  return { rel, text: d, say: `buy-first ${unit} after ${m.unit} in ${rel} (GoH roster, row copied${pri != null ? ', priority ' + pri : ''})` };
}

// ---- --check (COV-C13 c): shape of the mod's bot.data.lua vs vanilla (botcheck.js, luatable.js); --game also checks every unit has a buy card ----
function findFile(mod, rel) {
  const re = new RegExp(rel.replace(/\//g, '[\\\\/]').replace(/\./g, '\\.') + '$', 'i'), base = rel.split('/').pop().replace(/\./g, '\\.');
  for (const f of walkFiles(mod, new RegExp(`(${base}|\\.pak)$`, 'i'))) {
    if (re.test(f)) return { buf: fs.readFileSync(f), from: f };
    if (/\.pak$/i.test(f)) {
      try { const L = pak.list(f), e = L.find(x => x.name.replace(/\\/g, '/').toLowerCase() === rel); if (e) return { buf: pak.read(L, e), from: f + '!' + e.name }; } catch (e) { /* unreadable pak */ }
    }
  }
  return null;
}
// the mod's own .lua scripts under script/ (loose or in paks), bot.data.lua excluded; sorted by path
function luaScripts(mod) {
  const acc = [];
  for (const f of walkFiles(mod, /(\.lua|\.pak)$/i)) {
    if (/\.lua$/i.test(f)) { if (/[\\/]script[\\/]/i.test(f) && !/bot\.data\.lua$/i.test(f) && !/[\\/]script[\\/]multiplayer[\\/]bot\.lua$/i.test(f)) acc.push({ from: f, text: fs.readFileSync(f, 'latin1') }); }
    else {
      try { const L = pak.list(f); for (const e of L) { const n = e.name.replace(/\\/g, '/'); if (/^script\/.*\.lua$/i.test(n) && !/bot\.data\.lua$/i.test(n) && !/^script\/multiplayer\/bot\.lua$/i.test(n)) acc.push({ from: f + '!' + e.name, text: pak.read(L, e).toString('latin1') }); } } catch (e) { /* unreadable pak */ }
    }
  }
  return acc.sort((x, y) => x.from < y.from ? -1 : x.from > y.from ? 1 : 0);
}
function checkMode(mod, a) {
  const o = k => { const i = a.indexOf(k); return i < 0 ? null : a[i + 1]; };
  const rel = 'script/multiplayer/bot.data.lua', { check, cardNames } = require('./botcheck'), exe = exeArg(a);
  const m = findFile(mod, rel);
  // AI-22: Subscribe before the require of bot.lua in the mod's own lua scripts (loose or packed), reported before the data check
  const sub = [];
  for (const l of luaScripts(mod)) for (const x of require('./botsub').check(l.text)) { sub.push(x); console.log(`${x.sev} ${x.code} ${l.from}:${x.line} ${x.msg}`); }
  if (!m) { console.error(`BOT_NO_DATA_LUA: no ${rel} in ${mod} (loose or paks)`); process.exit(2); }
  let van = null, v = null, cards = null;
  const stock = o('--stock');
  if (stock) { const p = [path.join(stock, rel), path.join(stock, 'resource', rel)].find(x => fs.existsSync(x)); if (p) van = fs.readFileSync(p, 'latin1'); }
  if (o('--game')) {
    // cards: the engine's view. Vanilla bot.data.lua from the game alone; units sets (any depth, .set/.inc) from game + --mods + this mod
    // (mounted by name when it sits in G/mods, else its loose sets laid over by path)
    const vfs = require('../lib/vfs'), G = o('--game'), inG = path.resolve(path.dirname(path.resolve(mod))).toLowerCase() === path.resolve(G, 'mods').toLowerCase();
    if (!van) { const v0 = vfs.build(vfsOpts(G, [], exe)), r = v0.files.get('resource/' + rel); if (r) van = vfs.readRec(r).toString('latin1'); }
    const mods = (o('--mods') || '').split(',').filter(Boolean).concat(inG ? [path.basename(path.resolve(mod))] : []);
    const smi = path.join(mod, 'mod.info'), mm = fs.existsSync(smi) && /\{MinGameVersion\s+"([\d.]+)"\}/.exec(fs.readFileSync(smi, 'latin1'));
    if (inG && fs.existsSync(smi)) for (const r of fs.readFileSync(smi, 'latin1').matchAll(/\{Require\s+"([^"]+)"\}/g)) if (!mods.some(x => x.split(':')[0].toLowerCase() === r[1].split(':')[0].toLowerCase())) mods.splice(mods.length - 1, 0, r[1]);   // its Requires load first
    // a modern mod mounts only in Enhanced mode; as64+ is AS64's built-in mod: never added for --exe mowas_2 (no as64/plus there)
    if (inG && mm && verGE(mm[1], '3.301') && exe !== 'mowas_2' && !mods.some(x => /^as64\+/i.test(x))) mods.unshift('as64+');
    v = vfs.build(vfsOpts(G, mods, exe));
    for (const p of v.problems) if (p.level === 'error') console.log(`warn BOT_VFS ${p.where}: ${p.code} ${p.msg}`);
    const sets = new Map(), UK = /^resource\/set\/multiplayer\/units\/(.+\.(?:set|inc))$/i;
    for (const [k, r] of v.files) { const x = UK.exec(k); if (x) sets.set(x[1].toLowerCase(), vfs.readRec(r).toString('latin1')); }
    if (!inG) for (const f of walkFiles(path.join(mod, 'resource'), /\.(set|inc)$/i)) { const x = UK.exec(path.relative(mod, f).replace(/\\/g, '/')); if (x) sets.set(x[1].toLowerCase(), fs.readFileSync(f, 'latin1')); }
    cards = cardNames([...sets.values()]);
    vfs.closeRecs && vfs.closeRecs();
  }
  const own = findFile(mod, 'script/multiplayer/bot.lua');
  if (van == null) { console.error('BOT_NO_VANILLA: pass --game G or --stock <root with script/multiplayer/bot.data.lua>'); process.exit(2); }
  const f = check(m.buf.toString('latin1'), van, cards, { ownBot: own && own.buf.toString('latin1') });
  for (const x of f) if (x.sev !== 'info' || !a.includes('-q')) console.log(`${x.sev} ${x.code} ${m.from}:${x.line} ${x.msg}`);
  const e = f.filter(x => x.sev === 'error').length, w = f.filter(x => x.sev === 'warn').length + sub.length;
  if (!a.includes('-q')) console.log(`info BOT_OWN_BOT ${own ? own.from + ' (keys it names are not typos)' : 'none: vanilla bot.lua reads this file'}`);
  console.log(`${e} errors, ${w} warnings`);
  process.exit(e ? 1 : 0);
}

function main() {
  const USAGE = 'usage: as2 botrecipe <mod> --out <mod folder> [--dry-run] [--copy] [--target as64|mowas2]\n       as2 botrecipe <mod> --out <mod folder> --buy-first <unit> [--after mk7] [--class Tank] [--priority 1000.0] [--stock <root>] [--game G] [--card-like <unit>] [--cheap] [--team-mode <mode>] [--bot-main <file>] [--target as64|mowas2] [--dry-run]\n       as2 botrecipe <mod> --check [--game G [--mods a,b]] [--stock <root>] [-q]   (bot.data.lua shape vs vanilla; --game adds the buy-card check; exit 1 on errors)\n       any form: [--exe as64|mowas_2|mowas2|goh] = the game --game reads (default from --target)\n       as2 botrecipe <mod> --out <mod folder> --exe goh --buy-first <unit> (--army A --stage early|mid|late|conquest | --after <unit>) [--class Tank] [--priority P] [--stock <root>] [--game <GoH>] [--team-mode M] [--bot-main F] [--dry-run]   (GoH roster script/multiplayer/units/A/S.A.lua)';
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(USAGE); process.exit(0); }
  const a = process.argv.slice(2), pos = a.filter((x, i) => !x.startsWith('-') && !DATA_VAL.includes(a[i - 1])), oi = a.indexOf('--out'), out = oi < 0 ? null : a[oi + 1];
  const exe = exeArg(a), data0 = ['--buy-first', '--team-mode', '--bot-main', '--card-like'].some(k => a.includes(k));
  if (exe === 'goh') {   // GHMIS-66: GoH bot = bot.main.lua + modes/*.lua, buy lists in units/<army>/*.lua; no bot.lua, no bot.data.lua
    if (a.includes('--target')) { console.error('--target as64|mowas2 names an AS2 mod.info range; not with --exe goh'); process.exit(2); }
    if (a.includes('--check')) games.refuse('botrecipe --check', 'goh', 'it checks script/multiplayer/bot.data.lua, which GoH does not have (its buy lists are script/multiplayer/units/<army>/<stage>.<army>.lua); a check of those is not built', 'GHMIS-66');
    if (!data0) games.refuse('botrecipe', 'goh', 'GoH has no script/multiplayer/bot.lua (its bot is bot.main.lua plus modes/*.lua); the two fixes patch the AS2 bot.lua only', 'GHMIS-66');
  }
  if (a.includes('--check')) { if (pos.length !== 1) { console.error(USAGE); process.exit(2); } return checkMode(pos[0], a); }   // read-only, no --out
  if (pos.length !== 1 || !out) { console.error(USAGE); process.exit(2); }
  const ti = a.indexOf('--target'); if (ti >= 0 && !['as64', 'mowas2'].includes(a[ti + 1])) { console.error('--target as64|mowas2'); process.exit(2); }   // before any write
  const rel = path.relative(path.resolve(pos[0]), path.resolve(out));
  const data = ['--buy-first', '--team-mode', '--bot-main', '--card-like'].some(k => a.includes(k));
  if (data && rel && !rel.startsWith('..') && !path.isAbsolute(rel)) { console.error('BOT_OUT_IS_SOURCE: --out lies inside the mod (equal is allowed in data mode)'); process.exit(2); }
  // installs are read only: --out inside an AS2 install (other than <install>/mods/<name>) or anywhere inside the GoH install is refused
  // with the shared guard's plain line, before anything is read or written (also with --dry-run)
  const why = require('../lib/writeguard').refuseWrite(path.resolve(out), { game: gameArg(a, exe) || undefined, purpose: 'write the bot files' });
  if (why) { console.error(why); process.exit(2); }
  if (data) return dataMode(pos[0], out, a);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) { console.error('BOT_OUT_IS_SOURCE: --out is or lies inside the mod; source is never written'); process.exit(2); }
  const bot = findBot(pos[0]);
  if (!bot) { console.error(`BOT_NO_BOT_LUA: no script/multiplayer/bot.lua in ${pos[0]} (loose or paks)`); process.exit(2); }
  const src = bot.buf.toString('latin1'); let s = src; const done = [], todo = [], na = [];
  for (const r of RECIPES) {
    if (r.done(s)) { done.push(r.name); continue; }
    // only a real bot script counts as n/a; anything else refuses
    if (r.na(s) && s.includes('BotApi.Events')) { na.push(r.name); continue; }
    const m = r.anchor.exec(s);
    if (!m) { console.error(`BOT_ANCHOR_MISSING: ${r.name}: anchor not found in ${bot.from}; bot.lua changed, apply by hand`); process.exit(2); }
    s = r.apply(s, m); todo.push(r.name);
  }
  console.log(`${bot.from}: applied [${todo.join(', ')}] already [${done.join(', ')}] not-applicable [${na.join(', ')}]`);
  if (!todo.length && !(a.includes('--copy') && na.length + done.length === RECIPES.length)) { console.log('nothing to patch'); return; }
  if (a.includes('--dry-run')) return;   // --copy: write the unchanged bot.lua when every recipe is done or n/a (a mod to run the bot as is)
  const dest = path.join(out, 'resource/script/multiplayer/bot.lua');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, s, 'latin1');
  const mis = writeModInfoOnce(pos[0], out, a); if (mis) console.log(mis);
  console.log(`${s.length - src.length} bytes added, written to ${dest}`);
}
main();
