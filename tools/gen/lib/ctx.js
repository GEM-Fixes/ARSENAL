// ctx.js: gen run context = target/encoding, effective-file overlay (mod folder over vfs over base game), child tool runners.
// edits are collected in memory (dirty) and written once by flush(); wrapped CLI tools read/write the mod folder directly, so
// the runner flushes before each spawn and drops the disk-key cache after it.
// game: target as64 | mowas2 | goh (lib/games ids). AS64 and MoW:AS2 share one install; the vfs picks as64 when as64.exe is there and
// no exe is named, so target mowas2 builds the vfs with exe mowas_2 (no as64/core, no as64+) and every child tool that reads game data
// gets --exe mowas_2 when the folder holds as64.exe (exeArgs). as64 and goh name no exe: their vfs view and argument lists stay as before
// (goh = its own install). o.exe (option exe: as64 | mowas_2 | mowas2 | goh) names the vfs exe outright (an in-process caller such as the
// Task page passes its draft's exe); child tools still get --exe only for mowas_2.
// Author: Imperator_Aug (ARSENAL, ia-b52434df)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const vfs = require('../../lib/vfs');
const games = require('../../lib/games');
const { createReport } = require('../../lib/report');
const C = require('../../modmove/lib/common');
const MW = require('../../lib/modwrite');

const TOOLS = path.resolve(__dirname, '..', '..');
const lower = s => String(s).replace(/\\/g, '/').toLowerCase();

class Ctx {
  constructor(o) {
    this.o = o; this.target = o.target; this.goh = o.target === 'goh';
    this.game = o.game; this.gohDir = o.goh; this.root = this.goh ? o.goh : o.game;
    // the vfs exe named for this target: only mowas2 needs one (the shared AS2 install would show the AS64 set otherwise).
    // o.exe (an id or vfs exe of lib/games, e.g. the Task page's draft exe) names it outright; an unknown word is ignored
    this.exe = (o.exe && games.exeOf(o.exe)) || (games.idOf(o.target) === 'mowas2' ? 'mowas_2' : undefined);
    this.out = path.resolve(o.out); this.plan = !!o.plan; this.mods = o.deps || [];
    this.rep = createReport();
    this.dirty = new Map(); this.virt = new Set(); this.diskKeys = null; this.vf = null;
    this.test = []; this.facts = []; this.texts = []; this.steps = []; this.skipped = 0; this.opsDone = 0;
    this.spawns = 0; this.names = new Set(); this.virtMaps = new Set();
    this.restoreAction = null; this.restored = []; this.restoreGaps = [];
  }
  // ---- encoding: JS string -> latin1 "byte string" of its UTF-8 (both AS2/as64 and GoH read string values as UTF-8
  bytes(s) { return Buffer.from(String(s), 'utf8').toString('latin1'); }
  err(code, msg, where) { this.rep.add(where || '-', 0, code, msg); }
  // an op that cannot run on this game: its code with the one plain line of lib/games ("gen <op>: not available for GoH: <why> (<row>)")
  notFor(code, op, why, row, where) { this.err(code, games.notFor('gen ' + op, this.target, why, row), where); }
  info(code, msg, where) { this.rep.info(where || '-', 0, code, msg); }
  // ---- files
  vfs() {
    if (!this.vf) {
      if (!this.root || !fs.existsSync(this.root)) throw new Error('game dir not found: ' + this.root + ' (pass --game / --goh)');
      this.vf = vfs.build(Object.assign({ gameDir: this.root, mods: this.mods }, this.exe ? { exe: this.exe } : {}));
    }
    return this.vf;
  }
  // --exe for a child tool that reads game data (clone-entity, place-entity, mission-clone, statsheet, refcheck, build): only for mowas2,
  // and only when the folder holds as64.exe (the one case where the tool's own pick would be as64; without it the pick is mowas_2 already)
  exeArgs() { return this.exe === 'mowas_2' && this.shared() ? ['--exe', this.exe] : []; }
  shared() {
    if (this._shared === undefined) this._shared = !!this.root && games.detect(this.root) === 'as64';
    return this._shared;
  }
  disk(key) { return path.join(this.out, key); }
  scanDisk() {
    if (this.diskKeys) return this.diskKeys;
    const acc = new Set();
    if (fs.existsSync(this.out)) (function walk(d, rel) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name.toLowerCase() + '/'); else acc.add(rel + e.name.toLowerCase());
      }
    })(this.out, '');
    return (this.diskKeys = acc);
  }
  // effective bytes: dirty overlay > mod folder > vfs (vanilla + deps)
  read(key) {
    key = lower(key);
    if (this.dirty.has(key)) return this.dirty.get(key);
    if (this.scanDisk().has(key)) return fs.readFileSync(this.disk(key));
    const r = this.vfs().files.get(key);
    return r ? vfs.readRec(r) : null;
  }
  inMod(key) { key = lower(key); return this.dirty.has(key) || this.scanDisk().has(key); }
  exists(key) { key = lower(key); return this.dirty.has(key) || this.scanDisk().has(key) || this.vfs().files.has(key) || this.virt.has(key); }
  readStr(key) { const b = this.read(key); return b ? b.toString('latin1') : null; }
  write(key, data) { key = lower(key); this.dirty.set(key, Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1')); }
  keys(re) {
    const s = new Set();
    for (const k of this.vfs().files.keys()) if (re.test(k)) s.add(k);
    for (const k of this.scanDisk()) if (re.test(k)) s.add(k);
    for (const k of this.dirty.keys()) if (re.test(k)) s.add(k);
    return [...s].sort();
  }
  // every file is checked first (lib/modwrite: strictly inside the mod, also with links followed, and writeguard), nothing is written
  // when one is refused. this.restoreAction (set by a caller that wants undo, e.g. the Units page on GoH) takes a restore point of each
  // file (Files page form, lib/modwrite restoreRoot) before it is written; the ids collect in this.restored.
  flush() {
    if (this.plan) return 0;
    const list = [...this.dirty].map(([k, b]) => [k, b, this.disk(k)]);
    const gopt = this.root ? { game: this.root } : {};
    for (const [, , f] of list) MW.guardFile(this.out, f, gopt);
    if (this.restoreAction && list.length) this.restored.push(...MW.restorePoints(this.out, list.map(x => x[0]), this.restoreAction, gopt));
    let n = 0;
    for (const [, b, f] of list) {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, b); n++;
    }
    this.dirty.clear(); this.diskKeys = null;
    return n;
  }
  // ---- child tools (existing CLIs, run through modmove runTool). flush first, forget disk cache after.
  // with restoreAction: a file the child made that was not there before gets a restore point with existed:false (restore = remove);
  // a file the child changed in place is not captured (the child writes it itself), noted as such in this.restoreGaps
  tool(tool, args, opt) {
    this.flush();
    this.spawns++;
    const before = this.restoreAction && !this.plan ? new Set(this.scanDisk()) : null;
    const r = C.runTool(tool, args, opt || {});
    this.diskKeys = null;
    if (before) {
      const made = [...this.scanDisk()].filter(k => !before.has(k) && !k.startsWith('.arsenal/'));
      if (made.length) this.restored.push(...MW.newFilePoints(this.out, made, this.restoreAction));
      this.restoreGaps.push(tool);
    }
    return r;
  }
}
module.exports = { Ctx, lower, TOOLS };
