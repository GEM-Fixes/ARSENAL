// testplan state: the small files a mod's test plan keeps between runs (README "changes").
//   open(dir) -> S = {dir, read(name), write(name, obj), snapshot(tree), lastSnapshot(), ticks(), setTick(rowId, {v, note}), marks(),
//                     addMark(line)}
//     dir       the state dir (<mod>/.arsenal/testplan by default: dirOf(stack)). Created on the first write only; open and
//               every read leave the disk alone.
//     read(name) -> the parsed JSON of <dir>/<name>[.json], null when the file is missing or does not parse.
//     write(name, obj) -> the path written. JSON, 2 spaces, LF, through a temp file and a rename. name may hold a sub-folder.
//     snapshot(tree) -> the snapshot written to last.json: {v, at, dir, count, bytes, all, files:[[rel, size, mtimeMs, sig]],
//               paks:{rel:[[entry, size, crc]]}}. tree = a lib/modtree scan; rows may carry a 4th value (sig: sha1 of the file,
//               'pak:<sha1 of the entry list>' for a readable pak, null = not hashed) and tree.paks the entry lists
//               (changes.mark adds both). One file row per line.
//     lastSnapshot() -> that object, null when there is none (or it is of another version).
//     ticks() -> {rowId: {v, note, at}}. setTick(rowId, {v: 'pass'|'fail'|'skip', note}) -> the tick; any other v throws.
//               setTick(rowId, null) takes the tick away.
//     marks() -> [{at, files, rowsPassed, rowsFailed, rowsOpen}] oldest first. addMark(line) appends one (changes.mark).
//               history.json is a JSON array with one mark per line.
//   dirOf(stack) -> stack.state, else <stack.folder>/.arsenal/testplan.   VER, TICKS.
// Author: Imperator_Aug (ARSENAL, ia-bbb520dc)
'use strict';
const fs = require('fs'), path = require('path');

const VER = 1, TICKS = ['pass', 'fail', 'skip'];

function dirOf(stack) {
  if (stack && stack.state) return path.resolve(String(stack.state));
  if (!stack || !stack.folder) throw new Error('testplan state: no state dir and no mod folder');
  return path.join(path.resolve(String(stack.folder)), '.arsenal', 'testplan');
}

function open(dir) {
  if (!dir) throw new Error('testplan state: no dir');
  dir = path.resolve(String(dir));
  const fileOf = name => {
    const n = String(name || '').replace(/\\/g, '/');
    if (!n || n.split('/').some(p => p === '..' || p === '') || path.isAbsolute(n)) throw new Error('testplan state: bad name ' + JSON.stringify(name));
    return path.join(dir, /\.json$/i.test(n) ? n : n + '.json');
  };
  const writeText = (name, text) => {
    const f = fileOf(name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const tmp = f + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, text);
    try { fs.renameSync(tmp, f); } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* gone */ } throw e; }
    return f;
  };
  const readText = name => { try { return fs.readFileSync(fileOf(name), 'utf8'); } catch (e) { return null; } };
  const read = name => { const t = readText(name); if (t === null) return null; try { return JSON.parse(t); } catch (e) { return null; } };
  const write = (name, obj) => writeText(name, JSON.stringify(obj, null, 2) + '\n');

  function snapshot(tree) {
    if (!tree || !Array.isArray(tree.files)) throw new Error('testplan state: snapshot needs a modtree scan');
    const snap = {
      v: VER, at: new Date().toISOString(), dir: String(tree.dir || '').replace(/\\/g, '/'),
      count: tree.files.length, bytes: tree.bytes || 0, all: tree.all || '',
      files: tree.files.map(r => [r[0], r[1], r[2], r[3] === undefined ? null : r[3]]),
      paks: tree.paks || {},
    };
    const head = { v: snap.v, at: snap.at, dir: snap.dir, count: snap.count, bytes: snap.bytes, all: snap.all };
    const paks = Object.keys(snap.paks).sort().map(k => JSON.stringify(k) + ':' + JSON.stringify(snap.paks[k]));
    const text = JSON.stringify(head).slice(0, -1) + ',\n"files":[\n' + snap.files.map(r => JSON.stringify(r)).join(',\n')
      + '\n],\n"paks":{\n' + paks.join(',\n') + '\n}}\n';
    writeText('last', text);
    return snap;
  }
  function lastSnapshot() {
    const s = read('last');
    return s && s.v === VER && Array.isArray(s.files) ? Object.assign(s, { paks: s.paks || {} }) : null;
  }

  function ticks() { const t = read('ticks'); return t && typeof t === 'object' && !Array.isArray(t) ? t : {}; }
  function setTick(rowId, tick) {
    if (!rowId || typeof rowId !== 'string') throw new Error('testplan state: a tick needs a row id');
    const all = ticks();
    if (tick === null) { delete all[rowId]; write('ticks', all); return null; }
    if (!tick || !TICKS.includes(tick.v)) throw new Error('testplan state: a tick is pass, fail or skip, not ' + JSON.stringify(tick && tick.v));
    const t = { v: tick.v, note: tick.note === undefined || tick.note === null ? '' : String(tick.note), at: new Date().toISOString() };
    all[rowId] = t;
    write('ticks', all);
    return t;
  }

  function marks() {
    const t = readText('history');
    if (t === null) return [];
    try { const a = JSON.parse(t); if (Array.isArray(a)) return a; } catch (e) { /* one object per line, below */ }
    const out = [];
    for (const l of t.split(/\r?\n/)) { const s = l.trim().replace(/,$/, ''); if (s[0] === '{') { try { out.push(JSON.parse(s)); } catch (e) { /* a torn line */ } } }
    return out;
  }
  function addMark(line) {
    const all = marks(); all.push(line);
    writeText('history', '[\n' + all.map(m => JSON.stringify(m)).join(',\n') + '\n]\n');
    return line;
  }

  return { dir, read, write, snapshot, lastSnapshot, ticks, setTick, marks, addMark };
}

module.exports = { open, dirOf, VER, TICKS };
