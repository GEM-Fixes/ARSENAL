#!/usr/bin/env node
// keyprof: rebind actions in a user profile's keys.set (key bindings are profile data, not mod data: C34, lim UI-13, TST-77).
//   node keyprof.js --inst N [--profile id] --list [action-prefix]
//   node keyprof.js --inst N [--profile id] --set "common/toggle_map=KEY_Y" [--set ...] [--write] [--no-check]
//   node keyprof.js --inst N [--profile id] --restore            put back keys.set.keyprof (the copy taken before the first write)
//   node keyprof.js --file <keys.set> [--exe as64|mowas2|goh] --set ... [--write] [--list]   any keys.set (tests, a modder's own profile by hand)
// --inst 1..7 only (instance 0 = the user's real profile: refused). Without --write: dry run, prints the diff lines.
// The game reads keys.set at profile load (default map first then the profile: )
// and saves the profile again on exit, so an edit made while that instance runs is lost: refused unless --no-check.
// Key text is checked like StringToKey: an unknown token is silently ignored by the engine
// (lim UI-11), so here it is an error. A {noedit} action is written with a WARN (the options page locks it, the file does not).
// Byte-exact edit via lib/sdlwrite (CRLF and everything else kept). Exit 0 ok, 1 finding/error, 2 usage.
// --exe as64|mowas2|mowas_2|goh (lib/games; default as64, the rules above):
//   mowas2: the same keys.set form; --inst refused with one line (mowas_2.exe has no -instance, TST-19 [I]): --file only.
//   goh: --inst refused (one user folder, no instance copy, GHVFS-13 [V]; its profile is the player's own): --file only.
//     Rules for a GoH keys.set [V by note]: AS2 common/* ids are unbound in GoH (GHUI-36): a --set on a common/ id the file does not have is
//     the error KEY_GOH_RENAMED with the GoH id of the same name in the file (e.g. interface/toggle_map); {category c}: a rebind clashes
//     only inside the same category, "none" = any (GHUI-251; no {category} = the default one [I]), so WARN_DUP skips other categories; interface/pause is always editable (no
//     WARN_NOEDIT). --list adds a "category c" column where the file has one. A file inside the GoH user folder (lib/userdir gohUserDir)
//     is written only while call_to_arms.exe is not running (--no-check to force); the game saves keys.set on exit [I].
// Author: Imperator_Aug (ARSENAL, ia-9e2794c2)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const W = require('../lib/sdlwrite'), UD = require('../lib/userdir');

const KEYS = new Set([
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => 'KEY_' + c),
  ...[...Array(10).keys()].map(i => 'KEY_' + i), ...[...Array(15).keys()].map(i => 'KEY_F' + (i + 1)),
  ...[...Array(10).keys()].map(i => 'KEY_NUMPAD' + i),
  ...('COMMA PERIOD SLASH BACKSLASH SEMICOLON APOSTROPHE GRAVE LBRACKET RBRACKET MINUS EQUALS ESC ESCAPE ENTER RETURN BACKSPACE BACK ' +
    'TAB SPACE CAPSLOCK PAUSE SYSRQ HOME END INSERT DELETE PRIOR PGUP NEXT PGDN UP DOWN LEFT RIGHT UPARROW DOWNARROW LEFTARROW RIGHTARROW ' +
    'ADD SUBTRACT MULTIPLY DIVIDE DECIMAL NUMPADPLUS NUMPADMINUS NUMPADSTAR NUMPADSLASH NUMPADPERIOD LSHIFT RSHIFT LCONTROL RCONTROL ' +
    'LALT RALT SHIFT CONTROL ALT LWIN RWIN APPS NUMLOCK SCROLL ANY').split(' ').map(k => 'KEY_' + k),
  'MOUSE0', 'MOUSE1', 'MOUSE2', 'MOUSE3', 'MOUSE4', 'MOUSE5', 'MOUSE6', 'MOUSE7', 'MOUSE_LEFT', 'MOUSE_RIGHT', 'MOUSE_MIDLE',
  'SHIFT', 'CTRL', 'ALT', 'DOUBLE', '~SHIFT', '~CTRL', '~ALT', '~DOUBLE']);
const MODS = new Set(['SHIFT', 'CTRL', 'ALT', 'DOUBLE', '~SHIFT', '~CTRL', '~ALT', '~DOUBLE']);

// "SHIFT + KEY_F" -> null if fine, else the reason (StringToKey: upper-cased, split on + and space)
function checkKey(text) {
  const toks = text.toUpperCase().split(/[+\s]+/).filter(Boolean);
  if (!toks.length) return 'empty key (engine: unbound)';
  const bad = toks.filter(t => !KEYS.has(t));
  if (bad.length) return 'unknown token ' + bad.join(',') + ' (engine ignores it silently, lim UI-11)';
  if (toks.every(t => MODS.has(t))) return 'only modifiers, no key';
  return null;
}
const keyAtom = k => { const u = k.trim().toUpperCase(); return /[\s+]/.test(u) ? '"' + u.replace(/\s*\+\s*/g, ' + ') + '"' : u; };
const unq = s => s.replace(/^"|"$/g, '');

// actions: [{name, node, value, valueNode, noedit, single}]
function actions(t) {
  const keys = t.root.items.find(n => n.type === 'block' && n.name === 'keys');
  if (!keys) throw new Error('no {keys} block');
  const out = [];
  for (const n of keys.items.slice(1)) {
    if (n.type !== 'block' || !n.items[0]) continue;
    const kid = nm => n.items.find(c => c.type === 'block' && c.name === nm);
    const v = kid('value'), cat = kid('category');
    out.push({ name: unq(n.items[0].text), node: n, valueNode: v, value: v && v.items[1] ? unq(v.items[1].text) : '', noedit: !!kid('noedit'), single: !!kid('single'),
      category: cat && cat.items[1] ? unq(cat.items[1].text) : '' });
  }
  return { keys, list: out };
}

// apply sets [{action,key}] to buffer -> {buf, changes[], errors[], warns[]}; opt.game 'goh' = the GoH rules (GHUI-36, GHUI-251)
function edit(buf, sets, opt = {}) {
  const goh = opt.game === 'goh';
  const t = W.parse(buf), { keys, list } = actions(t), changes = [], errors = [], warns = [];
  for (const s of sets) {
    const why = checkKey(s.key);
    if (why) { errors.push(`KEY_BAD ${s.action}: ${s.key}: ${why}`); continue; }
    const a = list.find(x => x.name === s.action), atom = keyAtom(s.key);
    if (!a && goh && /^common\//.test(s.action)) {
      const tail = s.action.slice(7), alt = list.filter(x => x.name.split('/').pop() === tail).map(x => x.name);
      errors.push(`KEY_GOH_RENAMED ${s.action}: AS2 common/ ids are unbound in GoH (GHUI-36)${alt.length ? '; GoH id: ' + alt.join(', ') : '; no GoH id of that name in this file'}`);
      continue;
    }
    if (a) {
      if (a.noedit && !(goh && a.name === 'interface/pause')) warns.push(`WARN_NOEDIT ${s.action}: locked in the options page; file edit still written`);
      if (a.single && /[+\s]/.test(s.key.trim())) warns.push(`WARN_SINGLE ${s.action}: {single} action given a modifier combo`);
      if (a.value === unq(atom)) { changes.push(`same ${s.action} ${a.value}`); continue; }
      if (a.valueNode) W.setValue(a.valueNode, atom, 1); else W.insertChild(a.node, 1, `{value ${atom}}`);
      changes.push(`set ${s.action}: ${a.value || '(none)'} -> ${unq(atom)}`);
    } else {
      warns.push(`WARN_NEW_ACTION ${s.action}: not in this file; added, but code reads only ids it knows (lim UI-15)`);
      W.insertChild(keys, keys.items.length, `{"${s.action}"\r\n\t\t{value ${atom}}\r\n\t}`);
      changes.push(`add ${s.action}: ${unq(atom)}`);
    }
    // GoH: a clash counts only inside the same category; "none" clashes with any (GHUI-251). No {category} = the default one: the vanilla
    // profile binds KEY_Q to control_manual/vault (no category) and to helicopter_up (manual_helicopter) at once [I]
    const myCat = a ? a.category : '', sameCat = x => !goh || x.category === myCat || myCat === 'none' || x.category === 'none';
    const dup = list.find(x => x.name !== s.action && x.value.toUpperCase() === unq(atom).toUpperCase() && sameCat(x));
    if (dup) warns.push(`WARN_DUP ${s.action}: ${unq(atom)} is also bound to ${dup.name}`);
  }
  return { buf: W.serialize(t), changes, errors, warns };
}

// is a game exe of instance N running? 'yes' | 'no' | 'unknown'
function gameRunning(inst) {
  const re = new RegExp('(?:^|\\s)-instance\\s+' + inst + '(?:\\s|$)', 'i');
  if (!require('../lib/platform').isWin()) {   // Linux (Proton) / macOS: ps command lines [I]
    const procs = require('../lib/platform').commandLines();
    if (!procs) return 'unknown';
    return procs.some(p => /^(as64|mowas_2)(_ed)?\.exe$/i.test(p.name) && re.test(p.cmd || '')) ? 'yes' : 'no';
  }
  try {
    const o = cp.execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(as64|mowas_2)(_ed)?\\.exe$' } | ForEach-Object { $_.CommandLine }"], { encoding: 'utf8' });
    return o.split(/\r?\n/).some(l => new RegExp('(?:^|\\s)-instance\\s+' + inst + '(?:\\s|$)', 'i').test(l)) ? 'yes' : 'no';
  } catch { return 'unknown'; }
}

// is call_to_arms.exe running (GoH has one user folder, so any copy)? 'yes' | 'no' | 'unknown'
function gohRunning() {
  if (!require('../lib/platform').isWin()) {
    const procs = require('../lib/platform').commandLines();
    return !procs ? 'unknown' : procs.some(p => /^call_to_arms(_ed)?\.exe$/i.test(p.name)) ? 'yes' : 'no';
  }
  try {
    const o = cp.execFileSync('powershell', ['-NoProfile', '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^call_to_arms(_ed)?\\.exe$' } | ForEach-Object { $_.Name }"], { encoding: 'utf8' });
    return /call_to_arms/i.test(o) ? 'yes' : 'no';
  } catch { return 'unknown'; }
}
const insideDir = (p, d) => { if (!d) return false; const r = path.relative(path.resolve(d), path.resolve(p)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

function main(argv, hooks = {}) {
  const a = { set: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--exe') { const g = require('../lib/games').get(argv[++i]); if (!g) { console.error('--exe must be as64|mowas2|mowas_2|goh'); return 2; } a.game = g.id; }
    else if (k === '--set') a.set.push(argv[++i]);
    else if (['--inst', '--profile', '--file'].includes(k)) a[k.slice(2)] = argv[++i];
    else if (k === '--list') { a.list = true; if (argv[i + 1] && !argv[i + 1].startsWith('--')) a.prefix = argv[++i]; }
    else if (['--write', '--restore', '--no-check'].includes(k)) a[k.slice(2)] = true;
    else { console.error('unknown arg ' + k); return 2; }
  }
  let file = a.file, inst = a.inst !== undefined ? +a.inst : null;
  const games = require('../lib/games'), refuse = hooks.refuse || games.refuse;
  if (!file && a.game === 'mowas2') return refuse('keyprof', 'mowas2', 'instance profiles are made only by as64.exe -instance, mowas_2.exe has none, and the main profile is the player\'s own; use --file <keys.set>', 'TST-19'), 2;
  if (!file && a.game === 'goh') return refuse('keyprof', 'goh', 'Gates of Hell keeps one user folder with no per-instance copy and its profile is the player\'s own; use --file <keys.set>', 'GHVFS-13'), 2;
  if (!file) {
    if (!(inst >= 1 && inst <= 7)) { console.error('need --inst 1..7 (0 = real profile, refused) or --file'); return 2; }
    const pdir = path.join(UD.userDir(inst) || '', 'profiles');
    const ids = fs.existsSync(pdir) ? fs.readdirSync(pdir).filter(d => fs.existsSync(path.join(pdir, d, 'keys.set'))) : [];
    const id = a.profile || (ids.length === 1 ? ids[0] : null);
    if (!id) { console.error(`instance ${inst}: profiles with keys.set: ${ids.join(',') || 'none'}; pass --profile id`); return 2; }
    file = path.join(pdir, id, 'keys.set');
  }
  if (!fs.existsSync(file)) { console.error('no file ' + file); return 2; }
  const bak = file + '.keyprof';
  const live = () => {
    if (a['no-check']) return false;
    if (a.game === 'goh' && insideDir(file, (hooks.gohUserDir || UD.gohUserDir)())) {
      const r = (hooks.gohRunning || gohRunning)();
      if (r !== 'no') { console.error(`GAME_RUNNING call_to_arms.exe: ${r}; the game saves keys.set on exit and would undo the edit (--no-check to force)`); return true; }
      return false;
    }
    if (inst === null) return false;
    const r = gameRunning(inst);
    if (r !== 'no') { console.error(`GAME_RUNNING instance ${inst}: ${r}; the game saves keys.set on exit and would undo the edit (--no-check to force)`); return true; }
    return false;
  };
  if (a.restore) {
    if (!fs.existsSync(bak)) { console.error('no backup ' + bak); return 1; }
    if (live()) return 1;
    fs.copyFileSync(bak, file); fs.unlinkSync(bak); console.log('restored ' + file); return 0;
  }
  const buf = fs.readFileSync(file);
  if (a.list) {
    for (const x of actions(W.parse(buf)).list) if (!a.prefix || x.name.startsWith(a.prefix)) console.log(`${x.name}\t${x.value}${x.noedit ? '\tnoedit' : ''}${x.single ? '\tsingle' : ''}${x.category ? '\tcategory ' + x.category : ''}`);
    return 0;
  }
  if (!a.set.length) { console.error('nothing to do: --list, --set action=KEY or --restore'); return 2; }
  const sets = [];
  for (const s of a.set) { const m = /^([^=]+)=(.*)$/.exec(s || ''); if (!m) { console.error('bad --set ' + s); return 2; } sets.push({ action: m[1].trim(), key: m[2] }); }
  const r = edit(buf, sets, { game: a.game });
  r.changes.forEach(l => console.log(l)); r.warns.forEach(l => console.log(l)); r.errors.forEach(l => console.log(l));
  if (r.errors.length) return 1;
  if (!a.write) { console.log('dry run: --write to save ' + file); return 0; }
  if (live()) return 1;
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak);
  fs.writeFileSync(file, r.buf);
  console.log('wrote ' + file + ' (backup ' + path.basename(bak) + ')');
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { checkKey, edit, actions, keyAtom, main };
