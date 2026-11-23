#!/usr/bin/env node
// soedit: the node side of working with SOEdit models (SOEdit itself is downloaded by `install`, never shipped; https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy). contract: tools/soedit/README.md
//   node soedit.js locate [--json]                      where SOEdit.exe is (ARSENAL_SOEDIT, soedit/ next to ARSENAL.exe, tools/dist/out/soedit/); exit 2 none
//   node soedit.js stage  <entity | .mdl path | vfs path> --out <mod folder> [--game G] [--mods a,b] [--anm a,b | --no-anm]
//                         [--textures cache|stage|none] [--cache-dir D] [--dry] [--json f]
//        copies .mdl .ply .vol .anm .mtl to the same paths under the mod (files already there are kept), textures to a view cache outside the
//        mod (default), writes <mod>/.arsenal/soedit/<stem>.stage.json + pristine copies in <stem>.orig/. refuses a game-install target.
//   node soedit.js open   <staged .mdl | stage record> [--anm file] [--lang en|ru|uk|zh] [--game G] [--wait] [--dry]
//        starts SOEdit.exe <mdl> [anm] --respath <file> --lang <code>; respath file (<mod>/.arsenal/soedit/<stem>.respath.txt, UTF-8):
//        line 1 game folder, line 2 the mod folder, line 3 the texture view cache (each ends with \). detached unless --wait; --dry prints only.
//   node soedit.js check  <stage record | staged .mdl> [--game G] [--json f] [-q]
//        FILE_CHANGED FILE_NEW FILE_MISSING (info FILE_UNCHANGED), MDL_KEYWORD_LOST MDL_BLOCK_LOST MDL_COMMENTS_DROPPED WARN_ANM_VERSION_CHANGED
//        WARN_PLY_SUBM_TO_MESH, then binhdr + expcheck findings on the changed files. exit 1 = something lost or missing.
//   node soedit.js ops    <operation> ...               batch operations (tools/soedit/ops/, wave 2)
//   stage targets (target.js): entity name | vfs key or disk path of a .mdl/.def/breed .set | breed:<mp/ger/admiral> | pak:<pak path>!<entry>;
//        the --out folder is read as a layer over the game (its loose files and its paks), --no-out-layer turns that off.
//   node soedit.js index  [--game G] [--mod M] [--mods a,b] [--out f]   model search index (modelindex.js) of game + mod folder -> f
//   node soedit.js find   <words> [--game G] [--mod M] [--kind all|vehicle|human|object|breed|model] [--limit n] [--json f]
//   node soedit.js folder <folder | .pak> [--game G] [--mod M] [--json f]   every model in a folder (recursive, its paks too) or a pak
//   --game defaults to AS2_GAME / as2.json / Steam (tools/lib/gamedir.js).
//   --exe as64|mowas_2|mowas2|goh (stage, index, find, folder, check): the game whose file view is read. AS64 and MoW:AS2 share the AS2
//        install; without --exe the vfs takes as64 when as64.exe is there, so --exe mowas_2 is what keeps the as64/core files out.
//        No --exe: everything as before. --exe goh: the Gates of Hell file view; without --game the GoH install is found
//        (tools/lib/gamedir.js goh). SOEdit works with GoH models (owner 2026-11-15,; --out: lib/writeguard (a mod in <GoH>/mods ARSENAL did not make needs ARSENAL_ADVANCED=1).
// Author: Imperator_Aug (ARSENAL, ia-0693f3a8)
require('../lib/help')(__filename); // --help / -h: header usage, exit 0 (HELPFIX2)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { locate } = require('./locate');
const S = require('./stage');

const LANGS = ['en', 'ru', 'uk', 'zh'];
const games = require('../lib/games');
// --exe value -> the vfs exe ('as64' | 'mowas_2' | 'goh'); a word that names no game throws (exit 2)
function exeArg(v) { const g = games.get(v); if (!g) throw new Error(`--exe must be as64, mowas_2, mowas2 or goh (got ${v})`); return g.exe; }
const win = p => path.resolve(p).replace(/\//g, '\\').replace(/\\?$/, '\\');

// respath lines for a stage record (README / --respath)
function respathLines(rec, out, game) {
  const L = [game ? win(game) : '', win(out)];
  if (rec && rec.textures && rec.textures.mode === 'cache' && rec.textures.cache) L.push(win(rec.textures.cache));
  return L;
}

// start the program on its own, no model: found -> started; not found -> exit 2 with where it was looked for
function startBare(o) {
  const log = o.log || (s => console.log(s)), lang = o.lang || 'en';
  if (!LANGS.includes(lang)) { log(`soedit start: --lang must be one of ${LANGS.join(', ')} (got ${lang}).`); return 2; }
  const ex = (o.locate || locate)();
  if (!ex.path) { log(ex.msg); return 2; }
  const args = ex.ours === false ? [] : ['--lang', lang];
  if (o.dry) { log(`exe: ${ex.path} (${ex.source})`); log(`args: ${JSON.stringify(args)}`); log('dry run: SOEdit not started'); return 0; }
  const ch = (o.spawn || cp.spawn)(ex.path, args, { detached: true, stdio: 'ignore', windowsHide: false, cwd: path.dirname(ex.path) });
  if (ch && ch.on) ch.on('error', () => {});
  if (ch && ch.unref) ch.unref();
  log(`SOEdit started${ch && ch.pid ? ` (pid ${ch.pid})` : ''}: ${ex.path}`);
  return 0;
}
function openModel(o) {
  const log = o.log || (s => console.log(s));
  const lang = o.lang || 'en';
  if (!LANGS.includes(lang)) { log(`soedit open: --lang must be one of ${LANGS.join(', ')} (got ${lang}).`); return 2; }
  if (!o.arg) { log('soedit open: name a staged .mdl or a stage record.'); return 2; }
  let r = null;
  try { r = S.findRecord(o.arg); } catch (e) { log(`soedit open: the stage record could not be read: ${e.message}`); return 2; }
  let mdl, out, stem;
  if (r) { out = S.outOfRecord(r.file); mdl = path.join(out, ...r.rec.model.split('/')); stem = r.rec.stem; }
  else {
    if (!/\.mdl$/i.test(o.arg) || !fs.existsSync(o.arg)) { log(`soedit open: ${o.arg} is neither a stage record nor a .mdl file.`); return 2; }
    mdl = path.resolve(o.arg); stem = path.basename(mdl).replace(/\.mdl$/i, '').toLowerCase();
    const i = mdl.toLowerCase().lastIndexOf(path.sep + 'resource' + path.sep);
    out = i >= 0 ? mdl.slice(0, i) : path.dirname(mdl);
  }
  if (!fs.existsSync(mdl)) { log(`soedit open: the staged model ${mdl} is missing. Stage it again.`); return 2; }
  const game = o.game || (r && r.rec.game) || null;
  const rpFile = path.join(S.arsenalDir(out), stem + '.respath.txt');
  const lines = respathLines(r && r.rec, out, game);
  const args = [path.resolve(mdl)];
  if (o.anm) args.push(path.resolve(o.anm));
  const ex = (o.locate || locate)();
  if (ex.ours !== false) args.push('--respath', rpFile, '--lang', lang);   // a SOEdit from somewhere else does not know these options
  const exe = ex.path || '<SOEdit.exe not found>';
  const q = a => /[\s"]/.test(a) ? `"${a}"` : a;
  if (o.dry) {
    log(`exe: ${exe}${ex.path ? ` (${ex.source}, sha256 ${ex.sha256})` : ''}`);
    log(`args: ${JSON.stringify(args)}`);
    log(`command: ${[exe, ...args].map(q).join(' ')}`);
    log(`respath file: ${rpFile}`);
    lines.forEach((l, i) => log(`  ${i + 1}: ${l}`));
    log(`dry run: SOEdit not started${r ? '' : ' (no stage record: no texture cache line)'}`);
    return 0;
  }
  if (!ex.path) { log(ex.msg); return 2; }
  fs.mkdirSync(path.dirname(rpFile), { recursive: true });
  fs.writeFileSync(rpFile, lines.join('\r\n') + '\r\n', 'utf8');
  const spawn = o.spawn || cp.spawn, spawnSync = o.spawnSync || cp.spawnSync;
  if (o.wait) {
    const res = spawnSync(ex.path, args, { stdio: 'inherit', windowsHide: false });
    if (res.error) { log(`soedit open: ${res.error.message}`); return 2; }
    log(`SOEdit closed (exit ${res.status}). Next: node tools/soedit/soedit.js check ${q(r ? r.file : mdl)}`);
    return 0;
  }
  const ch = spawn(ex.path, args, { detached: true, stdio: 'ignore', windowsHide: false });
  if (ch && ch.unref) ch.unref();
  log(`SOEdit started${ch && ch.pid ? ` (pid ${ch.pid})` : ''} on ${mdl}. When it is closed: node tools/soedit/soedit.js check ${q(r ? r.file : mdl)}`);
  return 0;
}

function gameOf(arg, exe) {
  if (arg) return arg;
  if (exe === 'goh') { try { return require('../lib/gamedir').goh({}) || null; } catch (e) { return null; } }
  const gd = require('../lib/gamedir').resolve({});
  return gd.dir || null;
}

function main(argv) {
  const cmd = argv[0], a = argv.slice(1), o = { pos: [] };
  const val = i => { if (i + 1 >= a.length) throw new Error(`${a[i]} needs a value`); return a[i + 1]; };
  if (cmd === 'ops') { o.pos.push(a[0]); const k = a.indexOf('--exe'); if (k >= 0 && a[k + 1]) o.exe = exeArg(a[k + 1]); }   // an operation reads its own options (tools/soedit/ops/<name>.js main): only --exe is looked at here
  else for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === '--out') o.out = val(i++);
    else if (x === '--sig') o.sig = val(i++);
    else if (x === '--game') o.game = val(i++);
    else if (x === '--exe') o.exe = exeArg(val(i++));
    else if (x === '--mods') o.mods = val(i++).split(',').map(s => s.trim()).filter(Boolean);
    else if (x === '--mod') o.mod = val(i++);
    else if (x === '--kind') o.kind = val(i++);
    else if (x === '--limit') o.limit = Number(val(i++));
    else if (x === '--no-out-layer') o.noOutLayer = true;
    else if (x === '--anm') o.anm = val(i++);
    else if (x === '--no-anm') o.noAnm = true;
    else if (x === '--textures') o.textures = val(i++);
    else if (x === '--cache-dir') o.cacheDir = val(i++);
    else if (x === '--lang') o.lang = val(i++);
    else if (x === '--config') o.config = val(i++);
    else if (x === '--json') { if (cmd === 'locate' || cmd === 'install') o.json = true; else o.json = val(i++); }
    else if (x === '--dry') o.dry = true;
    else if (x === '--wait') o.wait = true;
    else if (x === '-q') o.q = true;
    else if (x.startsWith('--') && cmd !== 'ops') throw new Error(`unknown option ${x}`);
    else o.pos.push(x);
  }
  switch (cmd) {
    case 'locate': {
      const r = locate();
      if (o.json) console.log(JSON.stringify(r, null, 1));
      else if (r.path) console.log(`${r.path}\nsource: ${r.source}\nsha256: ${r.sha256}`);
      else console.log(r.msg);
      return r.path ? 0 : 2;
    }
    case 'install': return require('./install').install({}).then(r => { if (o.json) console.log(JSON.stringify(r, null, 1)); return r.code; });
    case 'start': return startBare({ lang: o.lang, dry: o.dry });
    case 'build': console.error('soedit build: SOEdit is not part of ARSENAL and its source is not here (owner 2026-11-15). "soedit install" downloads the latest release from https://github.com/ThatFrostyy/SOEdit-PatchByFrostyy.'); return 2;
    case 'stage': {
      if (!o.pos[0]) throw new Error('stage needs an entity name or a .mdl path');
      const r = S.stage({ target: o.pos[0], out: o.out, game: gameOf(o.game, o.exe), mods: o.mods, exe: o.exe, anm: o.noAnm ? [] : (o.anm ? o.anm.split(',').filter(Boolean) : []),
        noAnm: o.noAnm, textures: o.textures, cacheDir: o.cacheDir, dry: o.dry, json: o.json, noOutLayer: o.noOutLayer });
      if (r.code) console.log(`soedit stage: ${r.msg}`);
      return r.code;
    }
    case 'index': {   // the model search index of game + mod folder, written to --out (default: the per-user cache file)
      const MI = require('./modelindex'), game = gameOf(o.game, o.exe);
      if (!game) { console.log('soedit index: no game folder: pass --game <folder>.'); return 2; }
      const file = o.out || MI.cacheFile(game, o.mod, o.mods, o.exe);
      // --sig: the caller's own signature (the GUI's store stamps). Without it the signature is taken here, before the walk, as
      // MI.build takes it first: a change during the build makes the next check rebuild. buildAsync: the mod is walked once off
      // the loop (lib/modtree) and laid on from that listing; the same index as MI.build
      const t0 = Date.now(), sg = o.sig || MI.sig(game, o.mod || null, o.mods || [], o.exe);
      return MI.buildAsync({ game, mods: o.mods || [], modDir: o.mod || null, exe: o.exe, sig: sg }).then(ix => {
        ix.meta.ms = Date.now() - t0;   // the whole build, walk included, as before
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = file + '.' + process.pid + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(ix)); fs.renameSync(tmp, file);
        console.log(`models: ${ix.rows.length} (${Object.entries(ix.meta.counts).map(([k, n]) => n + ' ' + k).join(', ')}) in ${ix.meta.ms} ms -> ${file}`);
        return 0;
      }).catch(e => { console.error(`soedit: ${e.message}`); return 2; });   // as a throw of the sync build ended: the message, code 2
    }
    case 'find': case 'folder': {   // the same answers as the Models page routes, printed (one row per line, or --json)
      const MI = require('./modelindex'), game = gameOf(o.game, o.exe);
      let r;
      if (cmd === 'folder') r = MI.listFolder({ path: o.pos[0] || '.', game, mods: o.mods || [], modDir: o.mod || null, exe: o.exe });
      else {
        const file = MI.cacheFile(game, o.mod, o.mods, o.exe), sg = MI.sig(game, o.mod, o.mods, o.exe);
        let ix = MI.load(file); if (!ix || ix.meta.sig !== sg) { ix = MI.build({ game, mods: o.mods || [], modDir: o.mod || null, sig: sg, exe: o.exe }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(ix)); }
        r = MI.search(ix.rows, o.pos.join(' '), { kind: o.kind, limit: o.limit });
      }
      if (r.error) { console.log(`soedit ${cmd}: ${r.error}`); return 2; }
      if (o.json) { fs.writeFileSync(o.json, JSON.stringify(r, null, 1)); return 0; }
      console.log(`${r.total} found${r.truncated ? ' (first ' + r.results.length + ' listed)' : ''}`);
      // a row with a display name (the name in the game, from the .lng texts) ends with it: in game: "PzKpfw IV Ausf.H"
      for (const x of r.results.concat(r.didYouMean && r.didYouMean.length ? [{ name: '-- did you mean --', kind: '', where: '', pak: '', target: '' }, ...r.didYouMean] : [])) console.log(`${x.kind.padEnd(8)} ${x.name.padEnd(28)} ${x.where.padEnd(4)} ${(x.pak || '').padEnd(14)} ${x.target}${x.title ? `  in game: "${x.title}"` : ''}`);
      return 0;
    }
    case 'open': return openModel({ arg: o.pos[0], anm: o.anm, lang: o.lang, game: o.game, wait: o.wait, dry: o.dry });
    case 'check': return require('./check').check({ arg: o.pos[0], game: o.game, exe: o.exe, json: o.json, q: o.q });
    case 'ops': {
      const op = o.pos[0], f = op && path.join(__dirname, 'ops', op.replace(/[^\w-]/g, '') + '.js');
      if (!op || !fs.existsSync(f)) { console.log(`soedit ops: no operation ${op || '(none)'}; available: ${(fs.existsSync(path.join(__dirname, 'ops')) ? fs.readdirSync(path.join(__dirname, 'ops')).filter(n => n.endsWith('.js')).map(n => n.slice(0, -3)) : []).join(', ') || 'none yet'}`); return 2; }
      const m = require(f);
      const rest = argv.slice(2), k = rest.indexOf('--exe');   // --exe was read above (the operations work on files, not on a game view)
      if (k >= 0) rest.splice(k, 2);
      return typeof m.main === 'function' ? m.main(rest) : 0;
    }
    default:
      console.log('usage: node tools/soedit/soedit.js locate|install|start|stage|open|check|ops|index|find|folder ... (--help for details)');
      return 2;
  }
}

if (require.main === module) {
  let code;
  try { code = main(process.argv.slice(2)); } catch (e) { console.error(`soedit: ${e.message}`); code = 2; }
  Promise.resolve(code).then(c => { process.exitCode = c || 0; });
}

module.exports = { main, openModel, startBare, respathLines };
