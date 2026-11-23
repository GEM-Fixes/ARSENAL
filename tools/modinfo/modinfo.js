#!/usr/bin/env node
// modinfo: validate mod.info files (MoW:AS2). Engine ignores all parse errors; this reports them.
// rules:, lim VFS-20..22
//   node modinfo.js [--all] <mods folder or mod folder> [--game G] [--game-version VER] [--goh] [--exe as64|mowas_2|mowas2|goh] [--format F] [-q]
//   --exe goh = the GoH rules (as --goh; no --game: the GoH install's version); tag "develop" skips the GoH version check (GOH_DEVELOP, GHVFS-02);
//   on GoH each version bound is optional (a missing one is open, info WARN_GOH_OPEN_BOUND) and {priority N} is a known key
//   --exe mowas_2: the 3.262 exe has no modern rule: Min >= 3.301 is VER_RANGE, no Max is VER_MISSING [I]; as64+ is no built-in there
//   (a Require "as64+" is looked up in mods/ like any folder, as on GoH). none = as before.
// Author: Imperator_Aug (ARSENAL, ia-c0b34f3e)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path');
const { readText } = require('../lib/enc'), sdl = require('../lib/sdl'), { createReport } = require('../lib/report'), cli = require('../lib/cli');
const MODERN = [3, 301];   //  MODERN_MIN_GAME_VERSION; IsModern = Min >= 3.301
const G_DEFAULT = [3, 262];
const KEYS = ['name', 'desc', 'mingameversion', 'maxgameversion', 'require', 'delete', 'fileid'];
const REPEAT = new Set(['require', 'delete']);
const CANON = { name: 'Name', desc: 'Desc', mingameversion: 'MinGameVersion', maxgameversion: 'MaxGameVersion', require: 'Require', delete: 'Delete', fileid: 'FileId' };

function lev(a, b) {
  const d = [];
  for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
function verParse(s) { return String(s || '').replace(/[^0-9.]/g, '').split('.').filter(x => x !== '').map(Number); }
function verCmp(a, b) { const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; }

// fatalOnly (--all): startup-crash check only (ENG-24), first fatal finding per folder
function checkMod(dir, siblings, rep, fatalOnly, G) {
  const rel = dir.replace(/\\/g, '/') + '/mod.info';
  let nfatal = 0;
  const FATAL = new Set(['SYNTAX', 'MODINFO_PARSE', 'ENC_BOM']);
  const add = (line, code, msg) => {
    if (fatalOnly) { if (!FATAL.has(code) || nfatal) return; }
    if (FATAL.has(code)) nfatal++;
    rep.add(rel, line, code, msg);
  };
  const synLines = new Set();
  const r = readText(path.join(dir, 'mod.info'), 'cp1251');
  if (r.fatal) { add(1, 'ENC_BOM', r.fatal); return; }
  // engine ignores all parse errors (VFS-20): report lexer/brace errors as SYNTAX
  const top = sdl.parseLines(r.lines, (line, code, msg) => { if (code !== 'WARN_ESCAPE') synLines.add(line); add(line, code === 'WARN_ESCAPE' ? code : 'SYNTAX', msg); });
  const root = sdl.kids(top, 'mod')[0];
  if (!root) { add(1, 'SYNTAX', 'no root {Mod ...} block'); return; }
  const seen = {}, ent = {};
  const val = b => b.vals.length ? b.vals[0].v : '';
  for (const k of root.kids) {
    k.key = k.name;
    const lk = (k.key || '').toLowerCase();
    // ENG-24: a known key reads exactly one quoted string then '}' ( ReadKeyword -> ReadString, ReadBlockEnd);
    // anything else aborts the whole game start. Strings take \" (backslash kept) but not "" doubling.
    if (KEYS.includes(lk) && !synLines.has(k.line)) {
      if (k.kids.length) add(k.line, 'MODINFO_PARSE', `{${k.key}} contains a nested block; "String expected!" aborts game start`);
      else if (!k.vals.length) add(k.line, 'MODINFO_PARSE', `{${k.key}} has no value; "String expected!" aborts game start`);
      else if (k.vals[0].t !== 's') add(k.line, 'MODINFO_PARSE', `{${k.key} ${k.vals[0].v}} value is not a quoted string; "String expected!" aborts game start`);
      else if (k.vals.length > 1) add(k.vals[1].line, 'MODINFO_PARSE', `{${k.key}} has stray token "${k.vals[1].v}" after the string (unescaped " inside the text? use \\"); "Block terminator expected!" aborts game start`);
    }
    if (G.goh && lk === 'tags') {   // GoH key (template mod.info, robz_mod "no_delete develop") [V data]; one quoted string of words [I]
      if (!k.vals.length || k.vals[0].t !== 's') add(k.line, 'WARN_GOH_TAGS', `{tags} expects one quoted string of words, got ${k.vals.length ? k.vals[0].v : 'nothing'} [I]`);
      else (ent.tags = ent.tags || []).push(k);
      continue;
    }
    if (G.goh && lk === 'priority') {   // GoH key: int (ReadInt), default 1 (vfs/goh-modinfo-version-rule [V]); AS2 ignores it
      if (!k.vals.length || !/^-?\d+$/.test(String(k.vals[0].v))) add(k.line, 'WARN_GOH_PRIORITY', `{priority} expects a whole number, got ${k.vals.length ? k.vals[0].v : 'nothing'}`);
      continue;
    }
    if (!KEYS.includes(lk)) {
      let best = null, bd = 3;
      for (const c of KEYS) { const d = lev(lk, c); if (d < bd) { bd = d; best = c; } }
      add(k.line, 'UNKNOWN_KEY', `unknown key "${k.key}"` + (best ? ` (did you mean ${CANON[best]}?)` : '') + '; ignored silently by engine');
      continue;
    }
    if (!REPEAT.has(lk)) {
      if (seen[lk]) add(k.line, 'DUP_KEY', `duplicate ${CANON[lk]} (first at line ${seen[lk]}); later presumably wins [I]`);
      else seen[lk] = k.line;
    }
    (ent[lk] = ent[lk] || []).push(k);
  }
  if (fatalOnly) return;
  const last = k => ent[k] && ent[k][ent[k].length - 1];
  const nm = last('name');
  if (nm) {
    const folder = path.basename(path.resolve(dir));
    if (val(nm).toLowerCase() !== folder.toLowerCase())
      rep.info(rel, nm.line, 'WARN_NAME_FOLDER', `Name "${val(nm)}" differs from folder "${folder}" (Workshop install folder uses Name)`);
  }
  const mn = last('mingameversion'), mx = last('maxgameversion');
  const vmn = mn ? verParse(val(mn)) : [], vmx = mx ? verParse(val(mx)) : [];
  // VFS-19/48 (IsGameVersionSupported ): modern (Min >= 3.301) = Enhanced-only, checked vs plain version, no max;
  // legacy = data version 3.262.N must lie in [Min,Max], empty Min/Max = unsupported
  // --exe mowas_2: the 3.262 exe has no modern rule (VFS-48 is as64.exe): every mod takes the legacy [Min,Max] check [I]
  const modern = !G.goh && !G.mow && vmn.length && verCmp(vmn, MODERN) >= 0;
  // GHVFS-02: GoH tag "develop" lifts the version check
  const tg = G.goh && last('tags'), develop = !!(tg && tg.vals.length && /(^|\s)develop(\s|$)/i.test(tg.vals[0].v));
  if (develop) rep.info(rel, tg.line, 'GOH_DEVELOP', 'tags has "develop": GoH skips the version check for this mod (GHVFS-02)');
  else if (G.goh) {
    // GoH gate (gohweb vfs/goh-modinfo-version-rule [V]): each bound optional, a missing one is open;
    // below a set Min or above a set Max = refused. "any" = open (PORT-46)
    const anyMn = mn && /^any$/i.test(val(mn)), anyMx = mx && /^any$/i.test(val(mx));
    if (!vmn.length && !vmx.length && !anyMn && !anyMx) rep.info(rel, root.line, 'WARN_GOH_OPEN_BOUND', 'no minGameVersion and no maxGameVersion: GoH loads this mod on any version (both bounds open, vfs/goh-modinfo-version-rule [V])');
    else if (!vmn.length !== !vmx.length && !anyMn && !anyMx) rep.info(rel, (mn || mx).line, 'WARN_GOH_OPEN_BOUND', `only ${mn ? 'minGameVersion' : 'maxGameVersion'} set: GoH treats the other bound as open (vfs/goh-modinfo-version-rule [V])`);
    if (vmn.length && !anyMn && verCmp(G, vmn) < 0) add(mn.line, 'VER_RANGE', `GoH ${G.join('.')} < minGameVersion ${val(mn)}; mod rejected ("Unsupported game version")`);
    if (vmx.length && !anyMx && verCmp(G, vmx) > 0) add(mx.line, 'VER_RANGE', `GoH ${G.join('.')} > maxGameVersion ${val(mx)}; mod rejected ("Unsupported game version")`);
  } else if (modern) {
    rep.info(rel, mn.line, 'WARN_MOD_MODERN', `MinGameVersion ${val(mn)} >= 3.301: Enhanced-only mod (needs as64+ listed); no Max check, plain version not verified`);
    // VFS-59: Min above the build's plain version (PRODUCT_VERSION 3.301) = refused on as64, and the refusal crashes the game at start instead
    if (verCmp(vmn.slice(0, 2), MODERN) > 0) add(mn.line, 'VER_CRASH', `MinGameVersion ${val(mn)} is above this as64 build (3.301): listing this mod CRASHES the game at start instead of refusing it; lower Min or do not list it (lim VFS-59)`);
  }
  else {
    if (!vmn.length) add(mn ? mn.line : root.line, 'VER_MISSING', 'MinGameVersion missing/empty; mod UNSUPPORTED');
    if (!vmx.length) add(mx ? mx.line : root.line, 'VER_MISSING', 'MaxGameVersion missing/empty; mod UNSUPPORTED');
    if (vmn.length && verCmp(G, vmn) < 0) add(mn.line, 'VER_RANGE', `game ${G.join('.')} < MinGameVersion ${val(mn)}; mod rejected`);
    // a 1.x Max is a Gates of Hell range (GoH 1.0xx, PORT-43): checked here by the AS2 rules, so say how to check it as GoH
    if (vmx.length && verCmp(G, vmx) > 0) add(mx.line, 'VER_RANGE', `game ${G.join('.')} > MaxGameVersion ${val(mx)}; mod rejected` + (vmx[0] < 3 ? ' (a 1.x range is a Gates of Hell mod: check it with --exe goh)' : ''));
  }
  if (vmn.length && vmx.length && verCmp(vmn, vmx) > 0) add(mn.line, 'VER_ORDER', `MinGameVersion ${val(mn)} > MaxGameVersion ${val(mx)}; can never load (engine does not check)`);
  for (const k of ent.require || []) {
    const folder = val(k).split(':')[0].trim();
    if (folder.toLowerCase() === 'as64+' && !G.goh && !G.mow) {   /* built-in on as64.exe only (VFS-47) */ rep.info(rel, k.line, 'WARN_REQ_BUILTIN', 'as64+ is the built-in mod (as64/plus, VFS-47); not looked up in mods/'); continue; }
    if (!siblings.has(folder.toLowerCase())) add(k.line, 'REQ_MISSING', `required mod folder "${folder}" not found next to this mod`);
  }
  for (const k of ent.delete || []) {
    if (!/^resource\//i.test(val(k)))
      add(k.line, 'DELETE_PREFIX', `Delete path "${val(k)}" must start with resource/ (else matches nothing)`);
  }
  const fi = last('fileid');
  if (fi && !/^\d+$/.test(val(fi))) add(fi.line, 'BAD_FILEID', `FileId "${val(fi)}" is not a decimal string`);
}

function main() {
  const o = cli.parse(process.argv.slice(2), { flags: ['--all', '--goh'], values: ['--game-version'] });
  // --game-version <data version>: target game's data version for the legacy range check (default AS2 3.262; a GoH mod carries 1.06x ranges). --game is the shared game-dir flag
  // GoH rules (tags key, GoH version gate) when --goh, a 1.x --game-version, or --game is a GoH install (binaries/x64/call_to_arms.exe; version from its PE, else 1.067)
  const gohExe = o.gameDir && path.join(o.gameDir, 'binaries', 'x64', 'call_to_arms.exe');
  // --exe (lib/cli common): goh = the GoH rules; mowas_2 = the legacy range for every mod (no modern rule on the 3.262 exe [I])
  const goh = o.exe === 'goh' || !!o.x.goh || /^[0-2]\./.test(o.x['game-version'] || '') || !!(!o.exe && gohExe && fs.existsSync(gohExe));
  let gv = o.x['game-version'];
  if (goh && !gv) { const pe = gohExe && fs.existsSync(gohExe) && require('../lib/gamever').peVersion(gohExe), m = pe && /^(\d+)\.(\d)\.(\d)\.(\d)/.exec(pe); gv = m ? m[1] + '.' + m[2] + m[3] + m[4] : '1.067'; }
  const G = gv ? verParse(gv) : G_DEFAULT.slice();
  if (!G.length) { console.error('--game-version needs a version like 3.262'); process.exit(2); }
  G.join = () => String(gv || '3.262');   // print as given (parse drops zeros: 1.066 -> [1,66])
  G.goh = goh;
  G.mow = !goh && o.exe === 'mowas_2';
  const arg = o.pos[0];
  if (!arg || !fs.existsSync(arg) || !fs.statSync(arg).isDirectory()) { console.error('usage: node modinfo.js [--all] <mods folder or mod folder> [--game-version VER] [--format F] [-q]'); process.exit(2); }
  const all = !!o.x.all;
  const rep = createReport();
  const isMod = d => { const f = path.join(d, 'mod.info'); return fs.existsSync(f) && fs.statSync(f).isFile(); };
  const lsDirs = d => fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  if (isMod(arg) && !all) {
    const par = path.dirname(path.resolve(arg));
    checkMod(arg, new Set(lsDirs(par).map(s => s.toLowerCase())), rep, false, G);
  } else {
    const subs = lsDirs(arg).sort();
    const sib = new Set(subs.map(s => s.toLowerCase()));
    for (const s of subs) {
      const d = path.join(arg, s);
      if (!isMod(d)) { if (!all) rep.add(d.split(path.sep).join('/'), 0, 'WARN_NOT_MOD', 'no mod.info; engine ignores this folder'); }
      else checkMod(d, sib, rep, all, G);
    }
  }
  cli.printReport(rep, o, { tool: 'modinfo', byCode: false });
}
cli.run(main);
