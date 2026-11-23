// soedit tests: stage closure + hashes, kept mod files, refusal, open --dry / stubbed spawn, check loss codes on doctored copies,
// locate; build is gone (plain line, exit 2). No window is started. Fixture: mkfixture.js in a temp dir.
// Author: Imperator_Aug (ARSENAL, ia-2e9ede63)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const { make, plyOf, meshPart, anmOf } = require('./mkfixture');
const S = require('../stage'), C = require('../check'), L = require('../locate'), CLI = require('../soedit');

let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}\n  got  ${JSON.stringify(a)}\n  want ${JSON.stringify(b)}`);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const SOEDIT = path.join(__dirname, '..', 'soedit.js');
const cli = (args, env = {}) => cp.spawnSync(process.execPath, [SOEDIT, ...args], { encoding: 'utf8', env: Object.assign({}, process.env, { AS2_NO_STEAM: '1' }, env) });
const quiet = () => { const out = []; return { log: s => out.push(s), out }; };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soedit-test-'));
try {
  const fx = make(path.join(root, 'fx'));
  const disk = (base, key) => path.join(base, ...key.split('/'));
  const gameBytes = key => {   // the fixture's own bytes (loose, or the pak entry through lib/pak)
    const p = disk(fx.game, key); if (fs.existsSync(p)) return fs.readFileSync(p);
    const pk = require('../../lib/pak'), Lst = pk.list(path.join(fx.game, 'resource', 'entity', 'e1.pak'));
    const e = Lst.find(x => 'resource/entity/' + x.name === key); return pk.read(Lst, e);
  };
  const cache = path.join(root, 'cache');

  // 1. a file already in the mod is kept
  const mine = Buffer.from('my own open.anm');
  fs.mkdirSync(path.dirname(disk(fx.mod, fx.T + 'open.anm')), { recursive: true });
  fs.writeFileSync(disk(fx.mod, fx.T + 'open.anm'), mine);

  // 2. --dry writes nothing
  let q = quiet();
  let r = S.stage({ target: 'tank1', out: fx.mod, game: fx.game, cacheDir: cache, dry: true, log: q.log });
  eq(r.code, 0, 'dry stage code');
  ok(!fs.existsSync(path.join(fx.mod, '.arsenal')) && !fs.existsSync(cache), 'dry stage wrote nothing');

  // 3. stage by entity name: closure, hashes, cache, record
  q = quiet();
  r = S.stage({ target: 'tank1', out: fx.mod, game: fx.game, cacheDir: cache, log: q.log });
  eq(r.code, 0, 'stage code: ' + q.out.join(' | '));
  const rec = r.record;
  const byKind = k => rec.files.filter(f => f.kind === k).map(f => f.rel).sort();
  for (const k of ['mdl', 'ply', 'vol', 'anm', 'mtl']) eq(byKind(k), fx.expect[k], 'file set ' + k);
  eq(rec.textures.files.map(f => f.rel).sort(), fx.expect.texture.slice().sort(), 'textures in the cache record');
  eq(byKind('texture'), [], 'no textures in the mod (cache mode)');
  eq(rec.unresolved.map(u => `${u.kind} ${u.name}`).sort(), fx.expect.unresolved.slice().sort(), 'unresolved refs listed');
  ok(!rec.files.some(f => /unrelated/.test(f.rel)), 'unrelated file not staged');
  for (const f of rec.files) {
    if (f.rel.endsWith('open.anm')) continue;
    const want = gameBytes(f.rel);
    eq([f.sha256, f.size, f.present], [sha(want), want.length, false], 'record hash ' + f.rel);
    eq(sha(fs.readFileSync(disk(fx.mod, f.rel))), sha(want), 'copied bytes ' + f.rel);
    ok(fs.existsSync(S.pristinePath(fx.mod, 'tank1', f.rel)), 'pristine copy ' + f.rel);
  }
  for (const f of rec.textures.files) eq(sha(fs.readFileSync(disk(cache, f.rel))), sha(gameBytes(f.rel)), 'cache bytes ' + f.rel);
  const start = rec.files.find(f => f.rel.endsWith('start.anm'));
  eq([start.source, path.basename(start.pak), start.entry], ['pak', 'e1.pak', 'vehicle/tank1/start.anm'], 'pak source recorded');
  eq(rec.files.find(f => f.rel.endsWith('tank1.mdl')).source, 'game', 'loose game source recorded');
  const kept = rec.files.find(f => f.rel.endsWith('open.anm'));
  eq([kept.present, kept.sha256, kept.source], [true, sha(mine), 'mod'], 'mod file recorded as present');
  eq(fs.readFileSync(disk(fx.mod, fx.T + 'open.anm')).toString(), mine.toString(), 'mod file not overwritten');
  ok(fs.existsSync(S.recordPath(fx.mod, 'tank1')), 'record written at .arsenal/soedit/tank1.stage.json');

  // 4. textures stage / none, by mdl path and by vfs path
  const mod2 = path.join(root, 'mod2'), mod3 = path.join(root, 'mod3');
  r = S.stage({ target: disk(fx.game, fx.mdlKey), out: mod2, game: fx.game, textures: 'stage', log: quiet().log });
  eq([r.code, r.record.files.filter(f => f.kind === 'texture').length, r.record.textures.cache], [0, 3, null], '--textures stage by mdl path');
  eq(r.record.files.find(f => f.kind === 'mdl').source, 'file', 'mdl given by path: source file');
  r = S.stage({ target: 'entity/vehicle/tank1/tank1.mdl', out: mod3, game: fx.game, textures: 'none', noAnm: true, log: quiet().log });
  eq([r.code, r.record.files.filter(f => f.kind === 'texture' || f.kind === 'anm').length, r.record.textures.files.length], [0, 0, 0], '--textures none --no-anm by vfs path');

  // 5. refusals
  const before = fs.readdirSync(fx.game).sort();
  r = S.stage({ target: 'tank1', out: path.join(fx.game, 'resource', 'mymod'), game: fx.game, cacheDir: cache, log: quiet().log });
  ok(r.code === 2 && /game folder/i.test(r.msg), 'game-dir target refused: ' + r.msg);
  eq(fs.readdirSync(fx.game).sort(), before, 'nothing written into the game');
  ok(!fs.existsSync(path.join(fx.game, 'resource', 'mymod')), 'refused target not created');
  r = S.stage({ target: 'tank1', out: path.join(root, 'm4'), game: fx.game, cacheDir: path.join(fx.game, 'cache'), log: quiet().log });
  eq(r.code, 2, 'cache inside the game refused');
  r = S.stage({ target: 'no_such_unit', out: path.join(root, 'm5'), game: fx.game, cacheDir: cache, log: quiet().log });
  ok(r.code === 2 && /No entity named/.test(r.msg), 'unknown entity: plain message');

  // 5b. target forms (target.js) and the mod folder as a layer: a model only in the mod's pak, a breed with the shared human
  // model from the game pak, a pak entry, a .def outside any resource tree; origins per file; the CLI index / find / folder verbs
  {
    const T = require('../target'), MI = require('../modelindex'), { makeHuman } = require('./mkfixture');
    const fx2 = make(path.join(root, 'fx2')), h = makeHuman(fx2, path.join(root, 'fx2'));
    eq(['t99', 'plates 2', 'lci(l)', '#stone01', 'a*b', 'breed:mp/ger/x', 'breed:../x', 'pak:rel.pak!a.mdl', 'x/y.def', '../x.mdl', '-x', ''].map(t => T.parse(t).form || T.parse(t).code),
      ['name', 'name', 'name', 'name', 'name', 'breed', 'breed', 'pak', 'key', 'key', 'dash', 'empty'], 'parse forms and refusal codes');
    eq([T.unitName('resource/entity/-vehicle/t99/t99.def'), T.unitName('breed:mp/ger/x'), T.unitName('t99')], ['t99', null, 't99'], 'unitName');
    const files = rec2 => rec2.files.map(f => [f.rel, f.where, f.pakName || '', !!f.shared]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    let q2 = quiet();
    r = S.stage({ target: 't99', out: fx2.mod, game: fx2.game, dry: true, log: q2.log });
    eq([r.code, r.record.model, r.record.form], [0, 'resource/entity/-vehicle/t99/t99.mdl', 'name'], 'stage --dry: a vehicle only in the mod\'s pak, by name: ' + q2.out.join(' | '));
    eq(files(r.record).filter(f => !/\.def$/.test(f[0])), [['resource/entity/-vehicle/t99/hull.ply', 'mod', 'entity.pak', false], ['resource/entity/-vehicle/t99/t99.mdl', 'mod', 'entity.pak', false]], 'origins: mod pak');
    q2 = quiet();
    r = S.stage({ target: 'breed:mp/ger/admiral', out: fx2.mod, game: fx2.game, dry: true, log: q2.log });
    eq([r.code, r.record.model, r.record.breed, r.record.human], [0, 'resource/entity/humanskin/ger_officer/ger_officer.mdl', 'resource/set/breed/mp/ger/admiral.set', true], 'stage --dry of a breed: ' + q2.out.join(' | '));
    const fl = files(r.record);
    ok(fl.some(f => f[0] === T.HUMAN_MDL && f[1] === 'game' && f[2] === 'e2.pak' && f[3]), 'the shared human.mdl from the game pak, marked shared: ' + JSON.stringify(fl));
    ok(fl.some(f => f[0] === 'resource/properties/animation/human/human_anm.ext' && f[2] === 'gamelogic.pak' && f[3]), 'the clip list of human.mdl');
    ok(fl.some(f => f[0] === 'resource/set/breed/mp/ger/admiral.set' && !f[3]) && fl.some(f => f[0] === 'resource/entity/humanskin/ger_officer/skin.ply' && !f[3]), 'the breed and the skin\'s own files');
    ok(q2.out.some(l => /shared/.test(l)) && q2.out.some(l => /breed/.test(l)), 'the log names the breed and the shared files');
    r = S.stage({ target: 'breed:mp/rus/rifleman', out: fx2.mod, game: fx2.game, dry: true, log: quiet().log });
    eq([r.code, r.record.model], [0, 'resource/entity/humanskin/rus_rifle/rus_rifle.mdl'], 'a mod breed whose skin is in the mod pak');
    r = S.stage({ target: 'pak:' + h.gamePak + '!humanskin/ger_officer/ger_officer.def', out: fx2.mod, game: fx2.game, dry: true, log: quiet().log });
    eq([r.code, r.record.model], [0, 'resource/entity/humanskin/ger_officer/ger_officer.mdl'], 'a pak entry');
    r = S.stage({ target: path.join(h.loose, 'lone.def'), out: fx2.mod, game: fx2.game, dry: true, log: quiet().log });
    eq([r.code, r.record.model, files(r.record).map(f => f[1])], [0, 'resource/lone.mdl', ['file', 'file', 'file']], 'a .def outside any resource tree, files next to it');
    r = S.stage({ target: 'breed:mp/none/x', out: fx2.mod, game: fx2.game, dry: true, log: quiet().log });
    ok(r.code === 2 && /No breed mp\/none\/x/.test(r.msg), 'unknown breed: plain message: ' + r.msg);
    ok(!fs.existsSync(path.join(fx2.mod, '.arsenal')), 'dry runs wrote nothing');
    // CLI verbs (cache in the temp folder)
    const env = { ARSENAL_CACHE: path.join(root, 'tc') };
    let p2 = cli(['index', '--game', fx2.game, '--mod', fx2.mod], env);
    ok(p2.status === 0 && /models: 8 /.test(p2.stdout), 'index: ' + p2.stdout + p2.stderr);
    p2 = cli(['find', 'admiral', '--game', fx2.game, '--mod', fx2.mod], env);
    ok(p2.status === 0 && /^1 found/.test(p2.stdout) && /breed:mp\/ger\/admiral/.test(p2.stdout), 'find: ' + p2.stdout);
    p2 = cli(['folder', h.entityPak, '--game', fx2.game, '--mod', fx2.mod], env);
    ok(p2.status === 0 && /^2 found/.test(p2.stdout) && /pak:.*entity\.pak!entity\/-vehicle\/t99\/t99\.def/.test(p2.stdout), 'folder: ' + p2.stdout);
    const was = process.env.ARSENAL_CACHE; process.env.ARSENAL_CACHE = env.ARSENAL_CACHE;
    const ix = MI.load(MI.cacheFile(fx2.game, fx2.mod, []));
    if (was === undefined) delete process.env.ARSENAL_CACHE; else process.env.ARSENAL_CACHE = was;
    ok(ix && ix.meta.sig === MI.sig(fx2.game, fx2.mod, []) && ix.rows.length === 8, 'the cache file in ARSENAL_CACHE, keyed by what changed');
    // search with display names (title): file names first, then display names; byTitle only when the display name found it;
    // a short word is not looked for inside a display name; canon folds common names
    const rw = (name, title, kind) => ({ target: name, name, kind: kind || 'vehicle', key: 'resource/entity/-vehicle/' + name + '/' + name + '.def', where: 'game', pak: '', model: '', title });
    const rows = [rw('pz6e', 'PzKpfw VI Tiger'), rw('jagdtiger', 'Jagdtiger'), rw('pz6b', 'PzKpfw VI Kingtiger'), rw('tiger_crate', undefined, 'object'), rw('t34_0', 'T-34/76'), rw('pz4h', 'PzKpfw IV Ausf.H'), rw('ger_tank', 'Tiger Light')];
    const sr = (q, o) => MI.search(rows, q, o).results.map(r => (r.byTitle ? '*' : '') + r.name);
    eq(sr('tiger'), ['tiger_crate', '*pz6e', '*ger_tank', 'jagdtiger', '*pz6b'], 'name start, display word start, name holding, display name holding');
    eq(sr('pz6e'), ['pz6e'], 'an id query: the file name, not marked');
    eq(sr('T-34'), ['*t34_0'], 'a display name with punctuation');
    eq(sr('ger'), ['ger_tank', 'jagdtiger', 'tiger_crate'], 'a 3-letter word is not looked for inside display names (pz6e "Tiger" stays out)');
    eq(sr('panzer iv h'), [], 'no common-name folding without canon');
    const canon = s => s.toLowerCase().replace(/panzer|pzkpfw/g, 'pz').replace(/ausf\.?/g, '').replace(/[^a-z0-9]+/g, '');
    eq(sr('panzer iv h', { canon }), ['*pz4h'], 'canon folds "panzer iv h" onto "PzKpfw IV Ausf.H"');
    eq(MI.search(rows, 'tigr').didYouMean.map(r => (r.byTitle ? '*' : '') + r.name).slice(0, 1), ['*pz6e'], 'didYouMean through a display name word');
    // the folded query: dropped under 4 letters, matched only from a word start, and to a word end when it ends in a number
    // (cw mirrors the Units canon: words folded, panzer/pzkpfw = pz, Ausf. dropped, 1..10 = I..X)
    const AL = { panzer: 'pz', pzkpfw: 'pz', ausf: '' }, RO = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
    const cw = s => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => w in AL ? AL[w] : /^([1-9]|10)$/.test(w) ? RO[+w] : w).filter(Boolean).join('');
    const rows2 = [rw('pz4h', 'PzKpfw IV Ausf.H'), rw('pz4g', 'PzKpfw IV Ausf.G'), rw('m18', 'M18 Hellcat'), rw('kv1', 'KV-1'), rw('mk6', 'Mk.VI Crusader'),
      rw('is2', 'IS-2'), rw('is3', 'IS-3'), rw('zis2', 'ZIS-2'), rw('zis3', 'ZiS-3')];
    const sr2 = q => MI.search(rows2, q, { canon: cw }).results.map(r => (r.byTitle ? '*' : '') + r.name);
    const ah = sr2('ausf h');
    ok(ah[0] === '*pz4h' && !ah.includes('*m18'), '"ausf h" folds to "h" and is dropped: no "Hellcat" by its h, the Ausf.H unit first: ' + ah.join(','));
    ok(!sr2('ausf.g').includes('*pz4h'), '"ausf.g" does not find the Ausf.H unit');
    eq(sr2('kv-1'), ['*kv1'], '"kv-1" does not match "Mk.VI Crusader"');
    eq(sr2('IS-2'), ['*is2'], '"IS-2" does not match ZIS-2, ZiS-3 or IS-3');
    eq(sr2('panzer 4 h'), ['*pz4h'], 'the folded query still matches across words from a word start');
    // a name and a number end where a word ends in a display name too (not only on the canon path); a folded match from a word
    // start ranks before a display name that holds the text mid-word; a CJK character counts as 2 letters for the 4-letter rules
    const rows3 = [rw('kv1', 'KV-1'), rw('kv122', 'KV-122'), rw('kv1s', 'KV-1S'), rw('is1', 'IS-1'), rw('is10', 'IS-10'), rw('jpz4', 'Jagdpanzer IV'),
      rw('pz4g', 'PzKpfw IV Ausf.G/H'), rw('tiger_cn', '六号坦克虎式'), rw('hellcat', 'M18 Hellcat')];
    // the Units page's own canon when it loads (it is what the Models search gets), else the copy above
    let real = null; try { real = require('../../gui/ext/units/server')._t.canon || null; } catch (e) { console.log('note: the Units canon did not load (' + e.message + '): the copy is used'); }
    for (const [cn, what] of [[cw, 'copy'], [real, 'Units canon']]) {
      if (!cn) continue;
      const s3 = q => MI.search(rows3, q, { canon: cn }).results.map(r => r.name);
      eq(s3('kv-1'), ['kv1'], what + ': "kv-1" is KV-1 alone, not KV-122 or KV-1S');
      // kv1s stays by its file name (no word marks there), after kv1; kv122 is out (the 1 runs on into digits)
      eq(s3('kv 1'), ['kv1', 'kv1s'], what + ': "kv 1" is KV-1, and kv1s by its file name, not KV-122');
      eq(s3('is-1'), ['is1'], what + ': "is-1" is not IS-10');
      const pi = s3('panzer iv');
      ok(pi.indexOf('pz4g') >= 0 && pi.indexOf('jpz4') >= 0 && pi.indexOf('pz4g') < pi.indexOf('jpz4'), what + ': "panzer iv": PzKpfw IV (folded, from a word start) before Jagdpanzer IV (held mid-word): ' + pi.join(','));
      eq(s3('虎式'), ['tiger_cn'], what + ': a 2-character CJK query finds a Chinese display name that holds it');
      if (cn === real) { const r2 = q => MI.search(rows2, q, { canon: cn }).results.map(r => (r.byTitle ? '*' : '') + r.name);
        ok(r2('ausf h')[0] === '*pz4h', what + ': "ausf h" puts the Ausf.H unit first: ' + r2('ausf h').join(','));
        eq(r2('kv-1'), ['*kv1'], what + ': "kv-1" does not match "Mk.VI Crusader"'); eq(r2('IS-2'), ['*is2'], what + ': "IS-2" is IS-2 alone'); }
    }
    eq(MI.search([rw('vick', 'Vickers Light')], 'vi').results.map(r => r.name), ['vick'], 'a lone "vi" is still a word start (the word-end rule needs a name and a number)');
  }

  // 6. locate
  const none = L.locate({ env: {}, execPath: 'C:/x/node.exe', repo: path.join(root, 'norepo') });
  ok(none.path === null && /not found/.test(none.msg), 'locate: none');
  const dummy = path.join(root, 'SOEdit.exe'); fs.writeFileSync(dummy, 'dummy exe');
  let p = cli(['locate'], { ARSENAL_SOEDIT: dummy });
  ok(p.status === 0 && p.stdout.includes(dummy) && p.stdout.includes('source: env') && p.stdout.includes(sha(Buffer.from('dummy exe'))), 'locate via ARSENAL_SOEDIT: ' + p.stdout);
  const hasBuild = fs.existsSync(path.join(__dirname, '..', '..', 'dist', 'out', 'soedit', 'SOEdit.exe'));
  if (!hasBuild) { p = cli(['locate'], { ARSENAL_SOEDIT: path.join(root, 'missing.exe') }); if (!/^source: (?!env)/m.test(p.stdout)) ok(p.status === 2 && /not found/.test(p.stdout), 'locate CLI exit 2 without an exe'); } // an installed SOEdit (source: arsenal) is found instead
  const arsenal = L.locate({ env: {}, execPath: path.join(root, 'ARSENAL.exe'), repo: path.join(root, 'norepo'), isFile: f => /[\\/]soedit[\\/]SOEdit\.exe$/.test(f), hash: () => 'h' });
  eq([arsenal.source, path.basename(path.dirname(arsenal.path))], ['arsenal', 'soedit'], 'locate next to ARSENAL.exe');

  // 7. open --dry (CLI) and a stubbed start
  const recFile = S.recordPath(fx.mod, 'tank1');
  p = cli(['open', recFile, '--dry', '--lang', 'zh'], { ARSENAL_SOEDIT: dummy });
  ok(p.status === 0, 'open --dry exit 0');
  ok(p.stdout.includes('exe: ' + dummy), 'open --dry prints exe');
  ok(p.stdout.includes('--respath') && p.stdout.includes('"--lang","zh"') && p.stdout.includes('tank1.mdl'), 'open --dry prints args');
  ok(p.stdout.includes('1: ' + path.resolve(fx.game) + '\\') && p.stdout.includes('2: ' + path.resolve(fx.mod) + '\\') && p.stdout.includes('3: ' + path.resolve(cache) + '\\'), 'open --dry prints respath lines:\n' + p.stdout);
  ok(!fs.existsSync(path.join(S.arsenalDir(fx.mod), 'tank1.respath.txt')), 'open --dry wrote no respath file');
  const calls = [];
  const code = CLI.openModel({ arg: disk(fx.mod, fx.mdlKey), anm: disk(fx.mod, fx.T + 'shot.anm'), lang: 'ru', log: quiet().log,
    locate: () => ({ path: dummy, source: 'env', sha256: 'h' }), spawn: (exe, args, opt) => { calls.push({ exe, args, opt }); return { pid: 1, unref() {} }; } });
  eq(code, 0, 'open stubbed code');
  eq(calls.length, 1, 'spawn called once');
  if (calls[0]) {
    const a = calls[0].args;
    eq([path.basename(a[0]), path.basename(a[1]), a[2], path.basename(a[3]), a[4], a[5], calls[0].opt.detached], ['tank1.mdl', 'shot.anm', '--respath', 'tank1.respath.txt', '--lang', 'ru', true], 'open spawn args');
    eq(fs.readFileSync(a[3], 'utf8').split('\r\n').filter(Boolean).length, 3, 'respath file has game, mod, cache');
  }
  eq(CLI.openModel({ arg: recFile, lang: 'xx', log: quiet().log }), 2, 'bad --lang refused');

  // 8. check: clean first, then doctored copies
  q = quiet();
  let rc;
  const capture = fn => { const o = console.log, out = []; console.log = s => out.push(String(s)); try { rc = fn(); } finally { console.log = o; } return out; };
  let out = capture(() => C.check({ arg: recFile, runLinters: () => ({ findings: [] }) }));
  eq([rc, out[out.length - 1]], [0, '0 findings'], 'check clean');
  const T = fx.T, md = disk(fx.mod, T + 'tank1.mdl');
  let txt = fs.readFileSync(md, 'latin1');
  txt = txt.replace('; Exported by: fixture\r\n', '').replace(/\t*\{limits -30 30\}\r\n/, '').replace('{sequence "open" {resume}}', '{sequence "open"}')
    .replace(/\{Volume "crew"[\s\S]*?\r\n\}\r\n/, '');
  fs.writeFileSync(md, txt, 'latin1');
  fs.writeFileSync(disk(fx.mod, T + 'start.anm'), anmOf(5, ['basis', 'body']));
  fs.writeFileSync(disk(fx.mod, T + 'body.ply'), plyOf(meshPart('body.mtl'), meshPart('body.mtl')));
  fs.unlinkSync(disk(fx.mod, T + 'body_lod1.ply'));
  fs.writeFileSync(disk(fx.mod, T + 'new.anm'), anmOf(3, ['basis']));
  const lintCalls = [];
  const jf = path.join(root, 'check.json');
  out = capture(() => C.check({ arg: md, json: jf, runLinters: (script, args) => { lintCalls.push(path.basename(script)); return /expcheck/.test(script) ? { findings: [] } : { findings: [
    { file: T + 'body.ply', line: 0, code: 'PLY_STUB', msg: 'stub on a changed file' }, { file: T + 'shot.anm', line: 0, code: 'PLY_STUB', msg: 'unchanged file: dropped' }] }; } }));
  const counts = JSON.parse(fs.readFileSync(jf, 'utf8')).counts;
  const truth = {};
  for (const l of fs.readFileSync(path.join(__dirname, 'truth.md'), 'utf8').split(/\r?\n/)) { const m = /^- (\S+) (\S+)/.exec(l); if (m) truth[m[1]] = (truth[m[1]] || 0) + 1; }
  eq(Object.keys(counts).sort().map(k => k + '=' + counts[k]), Object.keys(truth).sort().map(k => k + '=' + truth[k]), 'check codes = truth.md');
  eq(rc, 1, 'check exit 1 on losses');
  if (process.env.SOEDIT_TEST_VERBOSE) console.log(out.join('\n'));
  eq(lintCalls, ['binhdr.js', 'expcheck.js'], 'binhdr + expcheck ran');
  ok(out.some(l => /MDL_KEYWORD_LOST .*bone "turret": \{limits\}/.test(l)), 'keyword names the bone and keyword');
  ok(out.some(l => /MDL_KEYWORD_LOST .*sequence "open" of the model: \{resume\}/.test(l)), 'keyword names the sequence');
  ok(out.some(l => /MDL_BLOCK_LOST .*Volume "crew"/.test(l)), 'block lost names the volume');
  ok(out.some(l => /\[binhdr\] stub/.test(l)) && !out.some(l => /unchanged file: dropped/.test(l)), 'linter findings filtered to changed files');
  // real linters run on the fixture (smoke: they start and answer)
  out = capture(() => C.check({ arg: recFile, game: fx.game }));
  ok(out.some(l => /LINTER_RAN binhdr/.test(l)) && out.some(l => /LINTER_RAN expcheck/.test(l)), 'real binhdr + expcheck ran:\n' + out.filter(l => /LINTER/.test(l)).join('\n'));

  // 9. build: SOEdit's source is not here any more (owner 2026-11-15): a plain line, exit 2
  p = cli(['build']);
  ok(p.status === 2 && /not part of ARSENAL/.test(p.stderr) && /soedit install/.test(p.stderr), 'build: plain line, exit 2', p.stderr);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
