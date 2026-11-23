// testplan part "changes": lib/changes.js + lib/state.js. Builds its own small mod folders in a scratch dir, needs no game install.
// usage: node tools/testplan/test/changes.test.js [scratch dir]     prints `<n> passed, <m> failed`, exit 1 on a fail
// Author: Imperator_Aug (ARSENAL, ia-7e76a687)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const changes = require('../lib/changes'), state = require('../lib/state');

const ROOT = path.resolve(process.argv[2] || require('../../lib/platform').tmpDir('testplan-changes'));
const W = path.join(ROOT, 'w' + process.pid);
fs.rmSync(W, { recursive: true, force: true });
fs.mkdirSync(W, { recursive: true });
process.env.GIT_CEILING_DIRECTORIES = ROOT;       // a repo above the scratch dir must not make the "no git" mod a git mod

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) pass++;
  else { fail++; console.log('FAIL ' + name + (detail === undefined ? '' : ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))); }
}
const eq = (a, b, name) => ok(JSON.stringify(a) === JSON.stringify(b), name, { got: a, want: b });
async function rejects(fn, code, name) {
  try { await fn(); ok(false, name, 'did not reject'); } catch (e) { ok(e && e.code === code, name, e && (e.code + ' ' + e.message)); }
}

// ---- helpers: files and a stored zip ----
function put(dir, rel, data, mtime) {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
  if (mtime) fs.utimesSync(f, new Date(mtime), new Date(mtime));
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(entries) {                               // {name: text} -> Buffer (stored, no compression)
  const parts = [], cd = [];
  let off = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nb = Buffer.from(name, 'latin1'), data = Buffer.from(text), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nb, data); cd.push(ch, nb);
    off += 30 + nb.length + data.length;
  }
  const cdb = Buffer.concat(cd), end = Buffer.alloc(22), n = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(n, 8); end.writeUInt16LE(n, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, end]);
}
const byRel = r => Object.fromEntries(r.files.map(f => [f.rel, f]));
const states = r => r.files.map(f => f.rel + ' ' + f.state);
const OLD = Date.now() - 10 * 86400e3, MID = Date.now() - 5 * 86400e3;
const stackOf = (folder, more) => Object.assign({ gameDir: '', exe: 'as64', gid: 'as64', kind: 'as2', mods: [], folder, name: path.basename(folder), state: '' }, more || {});

function makeMod(dir) {
  put(dir, 'mod.info', '{mod\r\n\t{name "t"}\r\n}\r\n', OLD);
  put(dir, 'resource/set/stuff/gun.set', '{stuff "gun"\r\n}\r\n', OLD);
  put(dir, 'resource/entity/-vehicle/Tank/tank.def', '{game_entity\r\n}\r\n', OLD);
  put(dir, 'resource/entity/-vehicle/Tank/tank.mdl', 'mdl', OLD);
  put(dir, 'resource/map/single/m1/0.mi', '{mission}', OLD);
  put(dir, 'localization/en/desc.lng', '{desc}', OLD);
  put(dir, 'resource/extra.pak', zip({ 'set/stuff/a.set': 'aaa', 'entity/b.def': 'bbb', 'interface/c.dds': 'ccc' }), OLD);
  put(dir, '.arsenal/cache/x.json', '{}', OLD);
  put(dir, '.git/HEAD', 'ref: x', OLD);
  put(dir, 'node_modules/n/index.js', 'x', OLD);
}

async function main() {
  // ---------- state ----------
  {
    const dir = path.join(W, 'state', 'deep', 'st');
    const st = state.open(dir);
    eq(st.dir, dir, 'state: dir');
    eq([st.read('last'), st.lastSnapshot(), st.ticks(), st.marks()], [null, null, {}, []], 'state: empty reads');
    ok(!fs.existsSync(dir), 'state: open and reads create nothing');
    const f = st.write('units', { a: 1 });
    ok(fs.existsSync(dir) && f === path.join(dir, 'units.json'), 'state: first write creates the dir');
    eq(st.read('units.json'), { a: 1 }, 'state: read back (name with .json)');
    eq(st.read('units'), { a: 1 }, 'state: read back (bare name)');
    ok(!fs.readFileSync(f, 'utf8').includes('\r') && fs.readFileSync(f, 'utf8').endsWith('\n'), 'state: LF only');
    st.write('pairs/p1', [1]);
    eq(st.read('pairs/p1'), [1], 'state: sub-folder name');
    const t = st.setTick('look|entity:tank', { v: 'pass', note: 'fine' });
    ok(t.v === 'pass' && t.note === 'fine' && !Number.isNaN(Date.parse(t.at)), 'state: setTick answer');
    st.setTick('sound|weapon:gun', { v: 'fail' });
    st.setTick('look|entity:tank', { v: 'skip', note: 'later' });
    eq(Object.keys(st.ticks()).sort(), ['look|entity:tank', 'sound|weapon:gun'], 'state: ticks keys');
    eq([st.ticks()['look|entity:tank'].v, st.ticks()['sound|weapon:gun'].note], ['skip', ''], 'state: a tick is replaced, note defaults to empty');
    // seeded defects: wrong tick word, no row id, a name that leaves the state dir, a torn ticks file
    let threw = 0;
    for (const bad of [() => st.setTick('a', { v: 'ok' }), () => st.setTick('a', {}), () => st.setTick('', { v: 'pass' }), () => st.write('../out', {}), () => { if (st.read('../../x') === null) throw new Error('not read'); }]) { try { bad(); } catch (e) { threw++; } }
    ok(!fs.existsSync(path.join(dir, '..', 'out.json')), 'state: defect, a name with .. writes nothing outside');
    eq(threw, 5,'state: defects refused (bad tick word, no v, no row id, names with ..)');
    eq(Object.keys(st.ticks()).length, 2, 'state: a refused tick writes nothing');
    st.setTick('sound|weapon:gun', null);
    eq(Object.keys(st.ticks()), ['look|entity:tank'], 'state: setTick null takes the tick away');
    fs.writeFileSync(path.join(dir, 'ticks.json'), '{"a":');
    eq(st.ticks(), {}, 'state: a torn ticks.json reads as empty');
    st.addMark({ at: 'x', files: 1 }); st.addMark({ at: 'y', files: 2 });
    eq(st.marks().map(m => m.at), ['x', 'y'], 'state: marks in order');
    eq(fs.readFileSync(path.join(dir, 'history.json'), 'utf8').split('\n').filter(l => l.startsWith('{')).length, 2, 'state: history.json one line per mark');
    ok(Array.isArray(JSON.parse(fs.readFileSync(path.join(dir, 'history.json'), 'utf8'))), 'state: history.json is JSON');
    eq(state.dirOf({ folder: path.join(W, 'm') }), path.join(W, 'm', '.arsenal', 'testplan'), 'state: default dir');
    eq(state.dirOf({ folder: path.join(W, 'm'), state: path.join(W, 's') }), path.join(W, 's'), 'state: --state wins');
  }

  // ---------- since words ----------
  {
    const now = Date.parse('2026-01-10T12:00:00Z');
    eq(changes.parseSince(undefined).kind, 'last', 'since: default last');
    eq(changes.parseSince('6h', now), { kind: 'time', since: '6h', at: '2026-01-10T06:00:00.000Z', ref: null }, 'since: 6h');
    eq(changes.parseSince('2D', now).at, '2026-01-08T12:00:00.000Z', 'since: 2d');
    eq(changes.parseSince('2026-01-01T00:00:00Z').at, '2026-01-01T00:00:00.000Z', 'since: ISO');
    eq([changes.parseSince('git').ref, changes.parseSince('git:v1.2').ref, changes.parseSince('git:v1.2').since], ['HEAD', 'v1.2', 'git:v1.2'], 'since: git refs');
    let bad = 0;
    for (const w of ['yesterday', '5', '5m', 'git:', 'git:--output=x', 'h', '12']) { try { changes.parseSince(w); } catch (e) { if (e.code === 'TP_SINCE') bad++; } }
    eq(bad, 7, 'since: defect, wrong words refused');
  }

  // ---------- all, and last without a snapshot ----------
  const mod = path.join(W, 'mods', 'MyMod'), st0 = stackOf(mod);
  makeMod(mod);
  {
    await rejects(() => changes.find(st0, { since: 'sometime' }), 'TP_SINCE', 'find: defect, a wrong since rejects');
    await rejects(() => changes.find(stackOf(path.join(W, 'nope')), { since: 'all' }), 'TP_NO_MOD', 'find: defect, a missing mod folder rejects');
    await rejects(() => changes.find({}, { since: 'all' }), 'TP_NO_MOD', 'find: defect, a stack with no folder rejects');
    const r = await changes.find(st0, { since: 'all' });
    eq([r.since, r.base.kind], ['all', 'all'], 'all: base');
    const m = byRel(r);
    eq(r.files.filter(f => !f.pak).map(f => f.rel), ['localization/en/desc.lng', 'mod.info', 'resource/entity/-vehicle/Tank/tank.def', 'resource/entity/-vehicle/Tank/tank.mdl',
      'resource/extra.pak', 'resource/map/single/m1/0.mi', 'resource/set/stuff/gun.set'], 'all: every file, case kept, no .git .arsenal node_modules, sorted');
    ok(r.files.every(f => f.state === 'added'), 'all: every row added');
    eq(['localization/en/desc.lng', 'mod.info', 'resource/entity/-vehicle/Tank/tank.def', 'resource/extra.pak', 'resource/map/single/m1/0.mi', 'resource/set/stuff/gun.set'].map(k => m[k].area),
      ['text', 'other', 'entity', 'pak', 'map', 'set'], 'all: area words');
    eq(r.files.filter(f => f.pak).map(f => f.rel + ' ' + f.area + ' ' + f.size), ['resource/extra.pak!entity/b.def entity 3', 'resource/extra.pak!interface/c.dds interface 3', 'resource/extra.pak!set/stuff/a.set set 3'], 'all: pak entries as <pak>!<entry> with the mounted area');
    eq(r.counts, { added: 10, changed: 0, removed: 0 }, 'all: counts');
    ok(m['mod.info'].size === 22 && Math.abs(m['mod.info'].mtimeMs - OLD) < 2000, 'all: size and mtimeMs');

    const l = await changes.find(st0, {});
    eq([l.since, l.base.kind, l.base.at], ['last', 'vanilla', null], 'last, no snapshot: falls to vanilla');
    ok(l.notes.some(n => /no snapshot/.test(n)) && l.notes.some(n => /no game folder/.test(n)), 'last, no snapshot: notes say so', l.notes);
    eq(l.files.length, 7, 'last, no snapshot, no game: every file');
    ok(l.files.every(f => f.state === 'added'), 'vanilla without a game: every file added');
    ok(!fs.existsSync(path.join(mod, '.arsenal', 'testplan')), 'find writes nothing');
  }

  // ---------- mark, then last ----------
  {
    const line = await changes.mark(st0);
    eq([line.files, line.rowsPassed, line.rowsFailed, line.rowsOpen], [7, 0, 0, 0], 'mark: history line');
    const st = state.open(state.dirOf(st0)), snap = st.lastSnapshot();
    ok(fs.existsSync(path.join(mod, '.arsenal', 'testplan', 'last.json')), 'mark: last.json in <mod>/.arsenal/testplan');
    ok(snap && snap.count === 7 && snap.files.every(r => r.length === 4 && typeof r[3] === 'string'), 'mark: every file hashed');
    eq(snap.paks['resource/extra.pak'].map(e => e[0]), ['entity/b.def', 'interface/c.dds', 'set/stuff/a.set'], 'mark: pak entry list kept');
    ok(!fs.readFileSync(path.join(st.dir, 'last.json'), 'utf8').includes('\r'), 'mark: last.json LF');
    eq(st.marks().length, 1, 'mark: one history line');
    const none = await changes.find(st0, { since: 'last' });
    eq([none.base.kind, none.base.at, none.files.length], ['last', snap.at, 0], 'last: nothing changed right after a mark');

    // changes
    put(mod, 'resource/set/stuff/gun.set', '{stuff "gun"\n}\r\n\r\n', MID);                 // same size, a CRLF became LF: changed
    put(mod, 'resource/entity/-vehicle/Tank/tank.def', '{game_entity\r\n}\r\n', MID);       // same bytes, new time: not a change
    put(mod, 'resource/entity/-vehicle/Tank/tank.mdl', 'mdl2', MID);                         // size moved
    put(mod, 'resource/entity/-vehicle/Tank/new.ply', 'ply');                                // new
    fs.unlinkSync(path.join(mod, 'localization/en/desc.lng'));                               // removed
    put(mod, 'resource/extra.pak', zip({ 'set/stuff/a.set': 'aXa', 'interface/c.dds': 'ccc', 'entity/d.def': 'dd' }), MID);
    put(mod, '.arsenal/cache/y.json', '{}');
    const r = await changes.find(st0, { since: 'last' });
    eq(states(r), [
      'localization/en/desc.lng removed',
      'resource/entity/-vehicle/Tank/new.ply added',
      'resource/entity/-vehicle/Tank/tank.mdl changed',
      'resource/extra.pak changed',
      'resource/extra.pak!entity/b.def removed',
      'resource/extra.pak!entity/d.def added',
      'resource/extra.pak!set/stuff/a.set changed',
      'resource/set/stuff/gun.set changed',
    ], 'last: added, changed (size; same size other bytes), removed, pak entry diff; a touched file is not listed');
    eq(r.counts, { added: 2, changed: 4, removed: 2 }, 'last: counts');
    const m = byRel(r);
    eq([m['localization/en/desc.lng'].area, m['localization/en/desc.lng'].size], ['text', 6], 'last: a removed file keeps area and size');
    eq([m['resource/extra.pak!entity/d.def'].pak, m['resource/extra.pak!entity/d.def'].entry, m['resource/extra.pak!entity/d.def'].area], ['resource/extra.pak', 'entity/d.def', 'entity'], 'last: entry row fields');

    // a pak rewritten with the same entries (new time, same size): not a change
    const mod2 = path.join(W, 'mods', 'pakmod'), s2 = stackOf(mod2);
    put(mod2, 'resource.pak', zip({ 'set/a.set': 'a', 'entity/e.def': 'e' }), OLD);
    put(mod2, 'bad.pak', 'this is no zip', OLD);
    await changes.mark(s2);
    put(mod2, 'resource.pak', zip({ 'set/a.set': 'a', 'entity/e.def': 'e' }), MID);
    eq((await changes.find(s2, {})).files.length, 0, 'last: a pak written again with the same entries is not a change');
    // seeded defect: a broken pak that changed is listed, with a note, and does not throw
    put(mod2, 'bad.pak', 'this is no zip either', MID);
    fs.unlinkSync(path.join(mod2, 'resource.pak'));
    const b = await changes.find(s2, {});
    eq(states(b), ['bad.pak changed', 'resource.pak removed', 'resource.pak!entity/e.def removed', 'resource.pak!set/a.set removed'], 'last: defect, a broken pak is listed without entries; a removed pak lists its entries');
    ok(b.notes.some(n => /bad\.pak: not readable as a pak/.test(n)), 'last: the broken pak is named in notes', b.notes);
    eq(byRel(b)['resource.pak!set/a.set'].area, 'set', 'pak at the mod root: entry area through resource/');

    // seeded defect: a torn snapshot is no snapshot
    fs.writeFileSync(path.join(mod2, '.arsenal', 'testplan', 'last.json'), '{"v":1,"files":[["a",1');
    const t = await changes.find(s2, {});
    eq([t.base.kind, t.files.length], ['vanilla', 1], 'last: defect, a torn last.json falls to vanilla');
  }

  // ---------- time ----------
  {
    const r = await changes.find(st0, { since: '1h' });
    eq(states(r), ['resource/entity/-vehicle/Tank/new.ply added'], 'time 1h: only the file written now; added (not in the snapshot)');
    ok(r.base.kind === 'time' && Math.abs(Date.parse(r.base.at) - (Date.now() - 3600e3)) < 60e3, 'time: base.at is the cut');
    ok(r.notes.some(n => /removed/.test(n)), 'time: note about removed files', r.notes);
    const d = await changes.find(st0, { since: '7d' });
    eq(states(d), [
      'resource/entity/-vehicle/Tank/new.ply added',
      'resource/entity/-vehicle/Tank/tank.def changed',
      'resource/entity/-vehicle/Tank/tank.mdl changed',
      'resource/extra.pak changed',
      'resource/extra.pak!entity/b.def removed',
      'resource/extra.pak!entity/d.def added',
      'resource/extra.pak!set/stuff/a.set changed',
      'resource/set/stuff/gun.set changed',
    ], 'time 7d: newer files, changed when the snapshot knows them, pak entries against the snapshot; no removed file');
    ok(!d.files.some(f => f.rel === 'localization/en/desc.lng'), 'time: the deleted file is not listed');
    const iso = await changes.find(st0, { since: new Date(Date.now() - 3 * 86400e3).toISOString() });
    eq(states(iso), ['resource/entity/-vehicle/Tank/new.ply added'], 'time ISO: 3 days back');
    // no snapshot: a file made now is added by its birth time
    const mod3 = path.join(W, 'mods', 'timemod');
    put(mod3, 'resource/set/old.set', 'o', OLD); put(mod3, 'resource/set/new.set', 'n');
    eq(states(await changes.find(stackOf(mod3), { since: '2h' })), ['resource/set/new.set added'], 'time, no snapshot: new by birth time');
    eq((await changes.find(stackOf(mod3), { since: '30d' })).files.length, 2, 'time 30d: both');
  }

  // ---------- --state elsewhere ----------
  {
    const sdir = path.join(W, 'elsewhere'), s = stackOf(mod, { state: sdir });
    eq((await changes.find(s, {})).base.kind, 'vanilla', 'state dir elsewhere: no snapshot there');
    const plan = { rows: [{ status: 'pass' }, { status: 'pass' }, { status: 'fail' }, { status: 'todo' }, { status: 'unproven' }, { status: 'skip' }, { status: 'na' }] };
    const line = await changes.mark(s, { plan });
    eq([line.files, line.rowsPassed, line.rowsFailed, line.rowsOpen], [7, 2, 1, 2], 'mark: row counts from a plan');
    ok(fs.existsSync(path.join(sdir, 'last.json')), 'mark: writes into --state');
    eq((await changes.find(s, {})).files.length, 0, 'state dir elsewhere: clean after its own mark');
    const st = state.open(sdir);
    st.write('run/plan', { rows: [{ status: 'fail' }, { status: 'held' }] });
    const l2 = await changes.mark(s);
    eq([l2.rowsPassed, l2.rowsFailed, l2.rowsOpen], [0, 1, 1], 'mark: row counts from <state>/run/plan.json');
    eq(st.marks().length, 2, 'mark: history grows');
    fs.unlinkSync(path.join(sdir, 'run', 'plan.json'));
    st.setTick('a', { v: 'pass' }); st.setTick('b', { v: 'fail' }); st.setTick('c', { v: 'skip' });
    const l3 = await changes.mark(s);
    eq([l3.rowsPassed, l3.rowsFailed, l3.rowsOpen], [1, 1, 0], 'mark: row counts from ticks when there is no plan');
    eq(st.marks().map(m => m.files), [7, 7, 7], 'history: three marks');
    // the first state dir still has the old snapshot
    eq((await changes.find(st0, {})).files.length, 8, 'two state dirs do not mix');
  }

  // ---------- git ----------
  {
    const repo = path.join(W, 'repo'), gm = path.join(repo, 'mods', 'GitMod'), s = stackOf(gm);
    const g = (...a) => cp.spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'core.autocrlf=false', '-C', repo, ...a], { encoding: 'utf8', windowsHide: true });
    fs.mkdirSync(repo, { recursive: true });
    const init = g('init', '-q');
    await rejects(() => changes.find(st0, { since: 'git' }), init.error ? 'TP_GIT' : 'TP_NOT_GIT', 'git: defect, a mod in no work tree is refused');
    if (init.error || init.status !== 0) console.log('note: git not usable here, git mode untried (' + (init.error ? init.error.message : init.stderr) + ')');
    else {
      put(gm, 'resource/set/a.set', 'a\r\n'); put(gm, 'resource/set/b.set', 'b'); put(gm, 'resource/entity/Gone.def', 'g');
      put(gm, 'mod.info', 'i'); put(repo, 'outside.txt', 'o'); put(gm, '.gitignore', 'ignored.tmp\n'); put(gm, 'ignored.tmp', 'x');
      g('add', '-A'); const c1 = g('commit', '-q', '-m', 'one');
      ok(c1.status === 0, 'git: fixture commit', c1.stderr);
      eq((await changes.find(s, { since: 'git' })).files.length, 0, 'git: clean tree, nothing');
      put(gm, 'resource/set/a.set', 'a\n');                    // CRLF -> LF
      fs.unlinkSync(path.join(gm, 'resource/entity/Gone.def'));
      put(gm, 'resource/entity/new.def', 'n');                 // untracked
      put(gm, 'resource/set/staged.set', 's'); g('add', 'mods/GitMod/resource/set/staged.set');
      put(repo, 'outside.txt', 'changed outside the mod');
      put(gm, '.arsenal/testplan/x.json', '{}');
      const r = await changes.find(s, { since: 'git' });
      eq(states(r), ['resource/entity/Gone.def removed', 'resource/entity/new.def added', 'resource/set/a.set changed', 'resource/set/staged.set added'],
        'git: paths relative to the mod (a sub-folder of the work tree), untracked added, nothing from outside, .arsenal and ignored files left out');
      eq([r.since, r.base.kind, r.base.ref], ['git:HEAD', 'git', 'HEAD'], 'git: base');
      ok(!Number.isNaN(Date.parse(r.base.at)), 'git: base.at is the commit time');
      eq([byRel(r)['resource/entity/Gone.def'].area, byRel(r)['resource/set/a.set'].size], ['entity', 2], 'git: area of a removed file, size of a live one');
      g('add', '-A'); g('commit', '-q', '-m', 'two'); g('tag', 'v2');
      put(gm, 'resource/set/b.set', 'b2');
      eq(states(await changes.find(s, { since: 'git:v2' })), ['resource/set/b.set changed'], 'git:<tag>');
      eq(states(await changes.find(s, { since: 'git:HEAD~1' })), ['resource/entity/Gone.def removed', 'resource/entity/new.def added', 'resource/set/a.set changed', 'resource/set/b.set changed', 'resource/set/staged.set added'], 'git:HEAD~1');
      await rejects(() => changes.find(s, { since: 'git:no-such-ref' }), 'TP_GIT', 'git: defect, an unknown ref is refused');
    }
  }

  // ---------- vanilla against a small fake game (loose files only) ----------
  {
    const game = path.join(W, 'game'), vm = path.join(game, 'mods', 'vmod');
    put(game, 'resource/set/stuff/gun.set', '{stuff "gun"\r\n}\r\n', OLD);
    put(game, 'resource/set/stuff/same.set', 'same', OLD);
    put(game, 'resource/entity/tank.def', 'tank', OLD);
    put(vm, 'mod.info', '{mod\r\n}\r\n', OLD);
    put(vm, 'resource/set/stuff/gun.set', '{stuff "gun"\n}\n', OLD);       // differs
    put(vm, 'resource/set/stuff/same.set', 'same', OLD);                    // identical copy
    put(vm, 'resource/entity/brand_new.def', 'new', OLD);                   // new key
    let r = null, e = null;
    try { r = await changes.find(stackOf(vm, { gameDir: game, exe: 'mowas_2', gid: 'mowas2' }), { since: 'vanilla' }); } catch (x) { e = x; }
    ok(r && !e, 'vanilla: answers on a fake game', e && e.stack);
    if (r) {
      eq(states(r), ['mod.info added', 'resource/entity/brand_new.def added', 'resource/set/stuff/gun.set changed'], 'vanilla: new and differing files; an identical copy is left out');
      eq([r.base.kind, r.base.ref], ['vanilla', game.replace(/\\/g, '/')], 'vanilla: base');
      ok(r.notes.some(n => /byte-identical/.test(n)), 'vanilla: note on identical copies', r.notes);
      ok(r.notes.some(n => /^overdiff: /.test(n)), 'vanilla: overdiff detail in notes', r.notes);
    }
  }

  try { fs.rmSync(W, { recursive: true, force: true }); } catch (e) { /* scratch stays */ }
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.log('FAIL crash :: ' + (e && e.stack || e)); console.log(pass + ' passed, ' + (fail + 1) + ' failed'); process.exit(1); });
