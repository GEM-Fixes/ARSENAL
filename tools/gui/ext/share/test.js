// share ext test. Arg: scratch dir. No game start, no network.
// Author: Imperator_Aug (ARSENAL, ia-e4ea31bb)
const fs = require('fs'), path = require('path'), cp = require('child_process');
const work = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'gx-share-test'));
const tools = path.resolve(__dirname, '..', '..', '..');
const mod = require('./index');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };
const rej = async (p, re, m) => { try { await p; ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' [' + e.message.slice(0, 70) + ']'); } };
require('../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const game = path.join(work, 'game');
const fx = path.join(tools, 'conflicts', 'test', 'fixture', 'game');
fs.cpSync(fx, game, { recursive: true });
const ctx = {
  gamedir: game, tools, tmpRoot: work, allowLaunch: false, game: () => game,
  runTool: async (tool, entry, args) => { const r = cp.spawnSync(process.execPath, [path.join(tools, entry)].concat(args), { encoding: 'utf8', timeout: 90000 }); return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '', timedOut: !!r.error }; },
};
const R = n => mod.routes[n];
const U = q => new URL('http://x/?' + q);
(async () => {
  for (const k of Object.keys(mod.routes)) ok(/^(GET|POST) \/api\/x\/share\/[a-z]+$/.test(k), 'route name ' + k);
  const md = path.join(game, 'mods', 'mine'); fs.mkdirSync(path.join(md, 'resource', 'set'), { recursive: true });
  fs.writeFileSync(path.join(md, 'mod.info'), '{mod\r\n\t{Name "Mine"}\r\n\t{Desc "old"}\r\n\t{FileId "12345"}\r\n\t{Require "as64+"}\r\n}\r\n');
  fs.writeFileSync(path.join(md, 'resource', 'set', 'a.set'), '{x 1}\r\n');
  fs.writeFileSync(path.join(md, 'UPGRADE.md'), 'notes');
  fs.mkdirSync(path.join(md, '.git')); fs.writeFileSync(path.join(md, '.git', 'HEAD'), 'x');
  fs.writeFileSync(path.join(md, 'notes.txt'), 'n');
  let r = await R('GET /api/x/share/mods')(U(''), null, ctx);
  ok(r.mods.some(m => m.folder === 'mine') && r.mods.some(m => m.folder === 'ma'), 'mods list');
  r = await R('GET /api/x/share/info')(U('mod=' + encodeURIComponent(md)), null, ctx);
  ok(r.fields.Name === 'Mine' && r.fileId === '12345' && r.upgraded && r.range === 'none', 'info read');
  const body = { mod: md, fields: { Name: 'Mine', Desc: 'Привет "q"', Version: '1.0', MinGameVersion: '3.262.0', MaxGameVersion: '3.262.1' } };
  r = await R('POST /api/x/share/info')(null, body, ctx);
  ok(r.changes.length === 4 && !r.wrote && r.fileId === '12345', 'info preview does not write');
  ok(!/Version/.test(fs.readFileSync(path.join(md, 'mod.info'), 'latin1')), 'file unchanged after preview');
  const tch = []; ctx.modtree = { touch: d => tch.push(d) };   // CACHE: a write tells the shared walk (lib/modtree); a preview does not
  await R('POST /api/x/share/info')(null, body, ctx);
  ok(tch.length === 0, 'touch: a preview touches nothing');
  r = await R('POST /api/x/share/info')(null, Object.assign({ write: true }, body), ctx);
  ok(tch.length === 1 && path.resolve(tch[0]) === path.resolve(md), 'touch: the mod.info write touches the mod');
  const txt = fs.readFileSync(path.join(md, 'mod.info')).toString('utf8');
  ok(r.wrote && /FileId "12345"/.test(txt) && /Require "as64\+"/.test(txt) && txt.includes('Привет \\"q\\"'), 'info written, FileId and other lines kept, UTF-8');
  ok(txt.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')), 'CRLF line ends');
  r = await R('POST /api/x/share/info')(null, { mod: md, fields: { Name: 'Other' }, knownName: 'Mine' }, ctx);
  ok(r.nameChanged === true, 'name change after FileId warns');
  await rej(R('POST /api/x/share/info')(null, { mod: md, fields: { Name: '' } }), /empty/, 'empty name refused');
  await rej(R('POST /api/x/share/info')(null, { mod: md, fields: { Version: 'abc' } }), /numbers/, 'bad version refused');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
  fs.writeFileSync(path.join(work, 'p.png'), png); fs.writeFileSync(path.join(work, 'big.png'), Buffer.concat([png, Buffer.alloc(1100000)])); fs.writeFileSync(path.join(work, 't.png'), 'text');
  ok((await R('POST /api/x/share/preview')(null, { mod: md, from: path.join(work, 'big.png') }, ctx)).why === 'big', 'picture over 1 MB refused');
  ok((await R('POST /api/x/share/preview')(null, { mod: md, from: path.join(work, 't.png') }, ctx)).why === 'type', 'not a picture refused');
  r = await R('POST /api/x/share/preview')(null, { mod: md, from: path.join(work, 'p.png'), write: true }, ctx);
  ok(r.wrote && fs.existsSync(path.join(md, 'preview.png')), 'picture copied');
  ok(tch.length === 2, 'touch: the picture write touches the mod'); delete ctx.modtree;
  await rej(R('POST /api/x/share/workshop')(null, { mod: md, out: game, write: true }, ctx), /refused/, 'out inside game refused');
  { const x = await R('POST /api/x/share/package')(null, { mod: md, out: path.join(md, 'o'), write: true }, ctx);   // GT-22: refusal names both folders, as a key the page translates
    ok(x.refused && x.refused.key === 'sep' && /mods\/mine$/.test(x.refused.params.mod) && /mine\/o$/.test(x.refused.params.out) && x.refused.msg.includes(x.refused.params.mod) && !fs.existsSync(path.join(md, 'o')), 'out inside mod refused, both folders named (' + JSON.stringify(x.refused) + ')'); }
  await rej(R('POST /api/x/share/info')(null, { mod: game, write: true, fields: { Name: 'x' } }, ctx), /mod\.info|refused/, 'game folder is not a mod');
  const sq = path.join(work, 'steamapps', 'workshop', 'mod1'); fs.mkdirSync(sq, { recursive: true }); fs.writeFileSync(path.join(sq, 'mod.info'), '{mod {Name "w"}}');
  await rej(R('POST /api/x/share/info')(null, { mod: sq, write: true, fields: { Name: 'x2' } }, ctx), /Steam/, 'Steam folder refused');
  const out = path.join(work, 'up');
  r = await R('POST /api/x/share/workshop')(null, { mod: md, out, write: false }, ctx);
  ok(!r.wrote && r.left_out.includes('UPGRADE.md') && r.left_out.includes('.git/') && r.left_out.includes('notes.txt'), 'workshop plan lists left-out files');
  r = await R('POST /api/x/share/workshop')(null, { mod: md, out, write: true }, ctx);
  ok(r.wrote && fs.existsSync(path.join(out, 'mine', 'mod.info')) && !fs.existsSync(path.join(out, 'mine', 'UPGRADE.md')) && !fs.existsSync(path.join(out, 'mine', '.git')) && !fs.existsSync(path.join(out, 'mine', 'notes.txt')), 'clean copy has no .git, notes, UPGRADE.md');
  await rej(R('POST /api/x/share/workshop')(null, { mod: md, out, write: true }, ctx), /already/, 'non-empty destination refused');
  // writeguard (I-3, I-4, I-14, I-20, I-21): GoH and game folders by content with a wrong or no game, out = a file, long name, package twice
  const gohX = path.join(work, 'gohx'); fs.mkdirSync(path.join(gohX, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(gohX, 'binaries', 'x64', 'call_to_arms.exe'), '');
  const gB = path.join(work, 'gameB'); fs.mkdirSync(path.join(gB, 'resource'), { recursive: true }); fs.writeFileSync(path.join(gB, 'as64.exe'), '');
  const empty = path.join(work, 'emptydir'); fs.mkdirSync(empty, { recursive: true });
  for (const c of [Object.assign({}, ctx, { game: () => empty }), Object.assign({}, ctx, { game: () => null })]) {
    await rej(R('POST /api/x/share/workshop')(null, { mod: md, out: path.join(gohX, 'ws'), write: true }, c), /Gates of Hell/, 'workshop copy into a GoH dir refused (game ' + c.game() + ')');
    { const x = await R('POST /api/x/share/package')(null, { mod: md, out: path.join(gB, 'resource', 'pk'), write: true }, c); ok(x.refused && /game folder/.test(x.refused.msg) && x.refused.params.out, 'package into another game resource/ refused (game ' + c.game() + ')'); }
  }
  ok(!fs.existsSync(path.join(gohX, 'ws')) && !fs.existsSync(path.join(gB, 'resource', 'pk')), 'nothing written into the GoH or game folder');
  fs.writeFileSync(path.join(work, 'afile.txt'), 'x');
  await rej(R('POST /api/x/share/workshop')(null, { mod: md, out: path.join(work, 'afile.txt'), write: true }, ctx), /is a file, not a folder/, 'out = a file: plain 400');
  await rej(R('POST /api/x/share/info')(null, { mod: md, fields: { Name: 'n'.repeat(3000) } }, ctx), /200 or less/, 'name over 200 chars refused');
  const pk = path.join(work, 'pk');
  const p1 = await R('POST /api/x/share/package')(null, { mod: md, out: pk, write: true }, ctx);
  const p2 = await R('POST /api/x/share/package')(null, { mod: md, out: pk, write: true }, ctx);
  ok(!p1.existing && p2.existing && /already held/.test(p2.existing.note), 'second package into the same folder says it already held files');
  {   // JOBS: a package run stopped from the footer: a package folder this request made is removed, one that was there stays
    const name = fs.readdirSync(pk)[0], pk3 = path.join(work, 'pk3'), job = { writes: false };
    const half = Object.assign({}, ctx, { job, runTool: async (tool, entry, args) => { const o = args[args.indexOf('--out') + 1]; fs.mkdirSync(path.join(o, name), { recursive: true }); fs.writeFileSync(path.join(o, name, 'half.txt'), 'x'); return { code: null, cancelled: true, stdout: '', stderr: '' }; } });
    const s1 = await R('POST /api/x/share/package')(null, { mod: md, out: pk3, write: true }, half);
    ok(s1.cancelled === true && job.writes === true && !fs.existsSync(path.join(pk3, name)), 'package stopped: answers cancelled, marked as a write, the folder it made is removed');
    const had = fs.readdirSync(path.join(pk, name)).filter(n => n !== 'half.txt').length;
    const s2 = await R('POST /api/x/share/package')(null, { mod: md, out: pk, write: true }, half);
    ok(s2.cancelled === true && had > 0 && fs.readdirSync(path.join(pk, name)).filter(n => n !== 'half.txt').length === had, 'package stopped: a package folder that was already there keeps its files');
    try { fs.rmSync(path.join(pk, name, 'half.txt'), { force: true }); } catch (e) { /* scratch */ }
  }
  const prev = path.join(work, 'prevcopy'); fs.cpSync(md, prev, { recursive: true });
  fs.writeFileSync(path.join(md, 'resource', 'set', 'b.set'), '{y 2}\r\n'); fs.writeFileSync(path.join(md, 'resource', 'set', 'a.set'), '{x 2}\r\n');
  r = await R('POST /api/x/share/version')(null, { mod: md, kind: 'minor', note: 'fixed', prev }, ctx);
  ok(r.old === '1.0' && r.next === '1.1' && !r.wrote && r.changed.length === 2 && /fixed/.test(r.noteText), 'version preview and changed files');
  r = await R('POST /api/x/share/version')(null, { mod: md, kind: 'minor', write: true }, ctx);
  ok(r.wrote && /Version "1\.1"/.test(fs.readFileSync(path.join(md, 'mod.info'), 'utf8')), 'version written');
  r = await R('POST /api/x/share/gate')(null, { mod: md, deep: false }, ctx);
  ok(Array.isArray(r.items) && r.items.some(i => i.id === 'info') && typeof r.ready === 'boolean', 'gate runs (' + r.items.map(i => i.id + ':' + i.status).join(' ') + ')');
  {   // N2-8: WARN_* on mod.info is a warning. GT-02: the check row status comes from check --json overall.verdict, not its text
    // the stub writes the --json file the way check.js does (overall + plain); stdout is what the old text reading saw
    let ov = null, seenJson = '';
    const sctx = Object.assign({}, ctx, { game: () => game, runTool: async (tool, entry, args, o) => {
      if (tool === 'modinfo') return { code: 1, stdout: args[0] + '/mod.info: WARN_DESC_SHORT the description is short\n', stderr: '' };
      if (tool === 'check') {
        const j = args.indexOf('--json'); seenJson = j >= 0 ? args[j + 1] : '';
        if (seenJson && ov) fs.writeFileSync(seenJson, JSON.stringify({ target: 'as64', overall: ov, plain: [ov.text, 'Can crash the game: a unit points at a missing file (3 places, first: resource/set/a.set:1).', 'Quick check: some slow checks were skipped.'] }));
        return { code: ov ? (ov.verdict === 'refused' ? 1 : ov.verdict === 'unfinished' ? 2 : 0) : 2, stdout: 'PROGRESS check: start\nVERDICT as64: LOADS_STATIC no fatal class on a root\nVERDICT mowas2: LOADS_STATIC\n', stderr: ov ? '' : 'Not found: x' };
      }
      return ctx.runTool(tool, entry, args, o);
    } });
    const gate = async () => { const gr = await R('POST /api/x/share/gate')(null, { mod: md }, sctx); return id => gr.items.find(i => i.id === id) || {}; };
    ov = { target: 'as64', verdict: 'ok', crash: 0, silent: 0, text: 'Looks good for the 64-bit game (AS64): no known crash problem in the files.' };
    let it = await gate();
    ok(it('info').status === 'warn' && /WARN_DESC_SHORT/.test(it('info').detail), 'gate: WARN_ on mod.info is warn, not fail (' + JSON.stringify(it('info')) + ')');
    ok(it('check').status === 'pass' && it('check').verdict === 'ok' && /\.json$/i.test(seenJson) && path.resolve(path.dirname(seenJson)) === path.resolve(require('os').tmpdir()) && !fs.existsSync(seenJson), 'GT-02 gate: check runs with --json in the OS temp folder, file removed, ok = pass (' + seenJson + ')');
    // GT-02: crash findings with a LOADS_STATIC verdict line: the old text reading passed this, Check said crash
    ov = { target: 'as64', verdict: 'crash', crash: 3, silent: 0, text: 'Not ready for the 64-bit game (AS64): 3 problems that can crash the game.' };
    it = await gate();
    ok(it('check').status === 'fail' && it('check').verdict === 'crash' && it('check').crash === 3, 'GT-02 gate: overall crash = fail even with LOADS_STATIC lines (' + JSON.stringify(it('check')).slice(0, 160) + ')');
    ok(it('check').plain.length === 2 && /^Can crash the game/.test(it('check').plain[0]) && /VERDICT as64/.test(it('check').full), 'GT-18 gate: plain finding lines under the result (first line left to the page), tool text kept for Details');
    ov = { target: 'as64', verdict: 'refused', crash: 0, silent: 0, text: 'The 64-bit game (AS64) will not load this mod: the version range in mod.info does not fit this game.' };
    it = await gate(); ok(it('check').status === 'fail' && it('check').verdict === 'refused', 'GT-02 gate: refused = fail');
    ov = { target: 'as64', verdict: 'unfinished', crash: 0, silent: 0, text: 'The check did not finish.' };
    it = await gate(); ok(it('check').status === 'warn' && it('check').verdict === 'unfinished', 'GT-02 gate: unfinished = warn');
    ov = null;
    it = await gate(); ok(it('check').status === 'warn' && it('check').verdict === 'unfinished' && /Not found/.test(it('check').detail), 'GT-02 gate: no result file (check stopped early) = warn with its message');
    // page: first line translated by verdict in four languages, plain lines listed, tool text behind a Details fold
    const L = mod.lang, sc = mod.script;
    const vk = ['ok', 'crash', 'refused', 'unfinished', 'timeout'].map(v => 'share.gate.v.' + v).concat(['share.gate.g.as64', 'share.gate.g.mowas2', 'share.gate.g.goh', 'share.gate.plainHead', 'share.gate.details']);
    ok(vk.every(k => ['en', 'ru', 'uk', 'zh'].every(l => L[l] && typeof L[l][k] === 'string' && L[l][k].length > 1)) && /\{n\}/.test(L.en['share.gate.v.crash']), 'GT-02 verdict keys in en, ru, uk, zh');
    ok(/T\('gate\.v\.'\+i\.verdict/.test(sc) && /i\.plain\.map/.test(sc) && /h\('details'/.test(sc) && /T\('gate\.details'\)/.test(sc), 'GT-18 page: verdict line translated, plain lines, Details fold');
  }
  r = await R('POST /api/x/share/package')(null, { mod: md }, ctx);
  ok(typeof r.ok === 'boolean' && Array.isArray(r.plan), 'package plan');
  const gm = path.join(game, 'mods', 'goh1'); fs.mkdirSync(gm, { recursive: true }); fs.writeFileSync(path.join(gm, 'mod.info'), '{mod {Name "g"}}'); fs.writeFileSync(path.join(gm, 'GOH-ORIGIN.tsv'), 'path\tsrc\r\nresource/a.set\tgoh\r\n');
  { const x = await R('POST /api/x/share/package')(null, { mod: gm, out: path.join(work, 'gohpk'), write: true }, ctx);
    ok(!x.ok && x.refused && x.refused.key === 'gohMod' && /Gates of Hell/.test(x.refused.msg) && !fs.existsSync(path.join(work, 'gohpk')), 'GoH-origin mod not packed'); }
  await rej(R('POST /api/x/share/workshop')(null, { mod: gm }, ctx), /Gates of Hell/, 'GoH-origin mod not for Workshop');
  r = await R('POST /api/x/share/gate')(null, { mod: gm, deep: false }, ctx);
  ok(!r.ready && r.items.find(i => i.id === 'goh').status === 'fail', 'gate fails on GoH origin');
  r = await R('GET /api/x/share/info')(U('mod=' + encodeURIComponent(gm)), null, ctx);
  ok(r.goh === 1, 'info reports GoH rows');
  r = await R('POST /api/x/share/card')(null, { mods: ['ma', 'mine', 'nosuch'] }, ctx);
  ok(/Play together/.test(r.text) && r.missing[0] === 'nosuch' && r.order.length === 3, 'play card');
  r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, ctx);
  ok(r.winner === 'mb' && Array.isArray(r.files), 'clashes ma,mb (' + r.files.length + ' files, ' + r.clashes.length + ' values)');
  await rej(R('POST /api/x/share/clashes')(null, { mods: ['ma', 'nosuchmod'] }, ctx), /mod not found: nosuchmod/, 'unknown mod says mod not found');
  {   // guided fix: groups by kind, then a patch mod: Preview writes nothing, Write makes a new folder, the check with it shows less
    // mb without {Require "ma"}: two mods side by side (with it mb is itself a patch mod over ma, whose values are decisions, not clashes)
    const mbInfo = path.join(game, 'mods', 'mb', 'mod.info'), mbWas = fs.readFileSync(mbInfo);
    fs.writeFileSync(mbInfo, '{mod\r\n {Name "mb"}\r\n}\r\n');
    r = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'] }, ctx);
    const all = r.groups.reduce((a, g) => a.concat(g.items), []);
    ok(r.groups.length > 0 && r.total === all.length && r.groups.every((g, i) => !i || g.harm > r.groups[i - 1].harm) && all.every(c => c.id && c.file && c.fix && (c.fix.last || c.fix.patch || c.fix.hand)), 'clashes: groups in harm order, every clash has a way out (' + r.groups.map(g => g.kind + ':' + g.count).join(' ') + ')');
    const can = all.filter(c => c.fix.patch === 'merge' || c.fix.patch === 'take'), before = r.total;
    const files = [...new Set(can.map(c => c.file))].map(k => { const c = can.find(x => x.file === k); return c.fix.patch === 'take' ? { key: k, mode: 'take', take: c.loser } : { key: k, mode: 'merge' }; });
    const po = path.join(work, 'togpatch');
    await rej(R('POST /api/x/share/clashfix')(null, { mods: ['ma', 'mb'], out: po, files: [] }, ctx), /nothing is picked/, 'clashfix: nothing picked is said');
    await rej(R('POST /api/x/share/clashfix')(null, { mods: ['ma', 'mb'], files }, ctx), /name a new folder/, 'clashfix: no folder is said');
    let p = await R('POST /api/x/share/clashfix')(null, { mods: ['ma', 'mb'], out: po, files }, ctx);
    ok(!p.wrote && !fs.existsSync(po) && p.files.length === files.length && !p.refused, 'clashfix preview: ' + p.files.length + ' files planned, nothing written');
    const tch2 = []; ctx.modtree = { touch: d => tch2.push(d) };
    p = await R('POST /api/x/share/clashfix')(null, { mods: ['ma', 'mb'], out: po, name: 'Both', files, write: true }, ctx);
    delete ctx.modtree;
    ok(p.wrote && fs.existsSync(path.join(po, 'mod.info')) && /\{require "ma"\}/i.test(fs.readFileSync(path.join(po, 'mod.info'), 'latin1')) && !p.notWinning.length, 'clashfix write: a new mod folder with Require on both mods, its files are the ones read');
    ok(tch2.some(d => path.resolve(d) === path.resolve(po)), 'touch: the patch mod write touches the new folder');
    const again = await R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'], patch: po }, ctx);
    ok(again.patch && again.total < before && !again.groups.some(g => /^(lost|value|file)$/.test(g.kind)) && again.decided > 0, 'check again with the patch mod: the patched clashes are gone (' + before + ' -> ' + again.total + ' left: ' + again.groups.map(g => g.kind).join() + '), ' + again.decided + ' named as decided');
    p = await R('POST /api/x/share/clashfix')(null, { mods: ['ma', 'mb'], out: po, files, write: true }, ctx).catch(e => ({ err: e.message }));
    ok((p.refused || p.err) && /new or empty/.test(p.refused || p.err), 'clashfix: a folder that holds files is refused');
    p = await R('POST /api/x/share/clashfix')(null, { mods: ['ma', 'mb'], out: path.join(game, 'mods', 'ma', 'p'), files, write: true }, ctx).catch(e => ({ err: e.message }));
    ok((p.refused || p.err) && !fs.existsSync(path.join(game, 'mods', 'ma', 'p')), 'clashfix: a folder inside one of the mods is refused');
    await rej(R('POST /api/x/share/clashes')(null, { mods: ['ma', 'mb'], patch: path.join(work, 'nopatch') }, ctx), /no mod\.info/, 'check again: a folder that is no mod is said');
    // 2026-11 refine: the answer's new parts, the side routes, the joint view kinds
    const RT = require('./routes'), T = RT._t;
    ok(r.asked.join() === 'ma,mb' && r.gate && typeof r.ms === 'number' && Array.isArray(r.notes) && Array.isArray(r.sameMod) && !r.sameMod.length && !('shadows' in r)
      && r.wins && r.wins.mb > 0 && r.groups.every(g => g.wins && Array.isArray(g.codes) && g.codes.length), 'clashes: who wins how often, notes, same-mod pairs, the time; whole-file replacements are no part of it (wins ' + JSON.stringify(r.wins) + ')');
    r = await R('GET /api/x/share/clashprogress')(U('run=nosuchrun1'), null, ctx);
    ok(r && r.step === '', 'clashprogress: a run that is not there answers an empty step');
    r = await R('POST /api/x/share/clashshadows')(null, { mods: ['ma', 'mb'] }, ctx);
    ok(Array.isArray(r.shadows) && typeof r.more === 'number', 'clashshadows: whole-file replacements on demand (' + r.shadows.length + ')');
    await rej(R('POST /api/x/share/clashshadows')(null, { mods: ['ma'] }, ctx), /at least two/, 'clashshadows: one mod is said');
    r = await R('POST /api/x/share/clashmp')(null, { mods: ['ma', 'mb'] }, ctx);
    ok(r.mods.join() === 'ma,mb' && r.patch === '' && Array.isArray(r.sizeOnly) && Array.isArray(r.actions) && typeof r.checked === 'boolean' && r.gid, 'clashmp: the online result for the picked mods (checked ' + r.checked + ', by length only ' + JSON.stringify(r.sizeOnly) + ')');
    r = await R('POST /api/x/share/clashmp')(null, { mods: ['ma', 'mb'], patch: po }, ctx);
    ok(r.patch && r.patchFiles > 0 && r.patchInMods === false, 'clashmp with the patch mod: its files counted, said to be outside the mods folder (' + r.patchFiles + ')');
    await rej(R('POST /api/x/share/clashmp')(null, { mods: ['ma', 'nosuchmod'] }, ctx), /mod not found/, 'clashmp: unknown mod is said');
    const opened = []; T.open = d => { opened.push(d); return { ok: true }; };
    r = await R('POST /api/x/share/clashopen')(null, { dir: po }, ctx);
    ok(r.ok && opened.length === 1 && path.resolve(opened[0]) === path.resolve(po), 'clashopen: the patch mod folder is opened');
    await rej(R('POST /api/x/share/clashopen')(null, { dir: work }, ctx), /not a mod folder/, 'clashopen: a folder that is no mod is refused');
    ok(opened.length === 1, 'clashopen: nothing opened on a refusal');
    T.open = null;
    ok(T.verless('RobZ Realism Mod 1.30.10') === T.verless('robz realism mod 1.31.0') && T.verless('ui - core') !== T.verless('robz realism mod 1.31.0'), 'two versions of one mod: the names are equal once the version is taken off');
    for (const [n, v] of [['twin 1.0', '1.0'], ['twin 1.1', '1.1']]) { fs.mkdirSync(path.join(game, 'mods', n), { recursive: true }); fs.writeFileSync(path.join(game, 'mods', n, 'mod.info'), '{mod\r\n {Name "Twin ' + v + '"}\r\n}\r\n'); }
    const sp = T.sameModPairs(game, ['ma', 'twin 1.0', 'twin 1.1'], false);
    ok(sp.length === 1 && sp[0].a === 'twin 1.0' && sp[0].b === 'twin 1.1', 'two versions of one mod in the list are named as a pair');
    fs.rmSync(path.join(game, 'mods', 'twin 1.0'), { recursive: true, force: true }); fs.rmSync(path.join(game, 'mods', 'twin 1.1'), { recursive: true, force: true });
    const jg = RT.togGroups([
      { level: 'warn', file: 'resource/set/j/top.def', line: 3, code: 'CONFLICT_JOINT_PARSE', msg: 'x', d: { loser: 'jb', winner: 'jc', key: 'MACRO_UNDEFINED', why: 'define not found', other: 'resource/set/j/jinc.inc', otherOf: 'jb' } },
      { level: 'warn', file: 'resource/set/j/use.def', line: 2, code: 'CONFLICT_JOINT_REF', msg: 'x', d: { kind: 'macro', key: 'ja_armor', loser: 'ja', winner: 'jb', other: 'resource/set/j/stuff.inc', n: 1 } },
      { level: 'warn', file: 'resource/set/j/use.def', line: 4, code: 'CONFLICT_JOINT_REF', msg: 'x', d: { kind: 'entity', key: 'jcar', loser: 'ja', winner: 'jb', other: 'resource/entity/j/jcar/jcar.def', n: 1 } },
    ], false);
    const jp = jg.find(x => x.kind === 'jointparse'), jr = jg.find(x => x.kind === 'jointref');
    ok(jp && jr && jp.count === 1 && jr.count === 2 && jp.codes.join() === 'CONFLICT_JOINT_PARSE' && jr.codes.join() === 'CONFLICT_JOINT_REF' && jp.harm < jr.harm, 'joint view kinds: a file that stops reading, a name one mod takes away (codes kept on the group)');
    ok(jp.items[0].fix.patch === 'take' && jp.items[0].fix.key === 'resource/set/j/jinc.inc' && jp.items[0].fix.hand, 'joint parse: the way out is the changed include of the mod that needs it, in a patch mod');
    const jgame = RT.togGroups([{ level: 'warn', file: 'resource/set/j/top.def', line: 0, code: 'CONFLICT_JOINT_PARSE', msg: 'x', d: { loser: 'jb', winner: 'ja', key: 'ARITH_BAD', why: 'x', other: 'resource/set/j/game.inc', otherOf: '' } }], false)[0].items[0];
    ok(jgame.game === true && !jgame.fix.patch && !jgame.fix.last && jgame.fix.hand, 'joint parse on a game file another mod changes: no copy of a mod and no order mends it, by hand only');
    const jm = jr.items.find(c => c.what === 'macro'), je = jr.items.find(c => c.what === 'entity');
    ok(jm && jm.fix.patch === 'merge' && jm.fix.key === 'resource/set/j/stuff.inc' && je && !je.fix.patch && je.fix.hand, 'joint ref: a lost macro can be put back by keeping both sides of the shared file; a deleted entity is by hand');
    {   // Stop: api() holds every button of the clicked card while a POST runs (page.js holdCard), so the Stop button must go in after the request starts
      const sc = String(require('./script')), iApi = sc.indexOf('api(url,body,me?'), iStop = sc.indexOf('el.appendChild(sb)');
      ok(iApi > 0 && iStop > iApi && /'data-stop':'1'/.test(sc) && sc.includes("clashprogress?run='+id+'&wait=1'"), 'page: the Stop button is added after the request is sent (not held with the card), progress is polled as a hidden wait');
    }
    fs.writeFileSync(mbInfo, mbWas);
  }
  r = await R('POST /api/x/share/updated')(null, {}, ctx);
  ok(typeof r.available === 'boolean', 'updated route answers');
  {   // GT-08: the package is a ready mod folder <out>/<mod folder>/ with mod.info and resource/*.pak, real zip dates, works dropped into mods
    const pak = require('../../../lib/pak'), pko = path.join(work, 'pk8');
    const x = await R('POST /api/x/share/package')(null, { mod: md, out: pko, write: true }, ctx), mf = path.join(pko, 'mine');
    ok(x.ok && x.wrote && x.dest && /pk8\/mine$/.test(x.dest), 'GT-08 package answers with the mod folder it wrote (' + x.dest + ')');
    ok(fs.readdirSync(pko).join() === 'mine', 'GT-08 out holds one mod folder, no bare pak (' + fs.readdirSync(pko) + ')');
    ok(fs.existsSync(path.join(mf, 'mod.info')) && fs.readFileSync(path.join(mf, 'mod.info'), 'utf8').includes('{FileId "12345"}'), 'GT-08 package has the mod.info');
    ok(fs.existsSync(path.join(mf, 'resource', 'gamelogic.pak')) && pak.list(path.join(mf, 'resource', 'gamelogic.pak')).some(e => e.name === 'set/a.set'), 'GT-08 package has resource/gamelogic.pak with the set file');
    ok(fs.existsSync(path.join(mf, 'preview.png')) && !fs.existsSync(path.join(mf, 'UPGRADE.md')) && !fs.existsSync(path.join(mf, 'notes.txt')) && !fs.existsSync(path.join(mf, '.git')), 'GT-08 package keeps the picture, leaves out notes, UPGRADE.md, .git');
    const d = pak.list(path.join(mf, 'resource', 'gamelogic.pak'))[0].time >>> 16, mo = (d >> 5) & 15;
    ok(mo >= 1 && mo <= 12 && (d & 31) >= 1 && 1980 + (d >> 9) >= 2020, 'GT-08 zip entry date is a real date (month ' + mo + ')');
    ok(x.files.includes('mod.info') && x.files.includes('resource/gamelogic.pak'), 'GT-08 written list is relative to the mod folder');
    const g2 = path.join(work, 'game2'); fs.mkdirSync(path.join(g2, 'mods'), { recursive: true }); fs.cpSync(mf, path.join(g2, 'mods', 'mine'), { recursive: true });
    const l2 = await R('GET /api/x/share/mods')(U(''), null, Object.assign({}, ctx, { game: () => g2 }));
    ok(l2.mods.some(m => m.folder === 'mine' && m.name === 'Mine'), 'GT-08 the package dropped into mods is listed as a mod');
    const sc = require('./script');
    ok(/pack\.done/.test(sc) && require('./lang').en['share.pack.done'].includes('{dest}') && !/send those files/.test(require('./lang').en['share.pack.done']), 'GT-08 done text speaks of the mod folder');
  }
  {   // GT-23: the package plan names the mod; the page shows it at the top
    const x = await R('POST /api/x/share/package')(null, { mod: md }, ctx);
    ok(x.mod && x.mod.name === 'Mine' && x.mod.folder === 'mine' && x.plan.some(p => p.pak === 'gamelogic.pak' && p.files === 2), 'GT-23 plan names the mod and each pak (' + JSON.stringify(x.mod) + ' ' + JSON.stringify(x.plan) + ')');
    const sc = require('./script'), L = require('./lang');
    ok(/modHead\(box\)/.test(sc) && /function secPack[\s\S]*?modHead\(box\)[\s\S]*?function secWs/.test(sc), 'GT-23 Package section shows the mod at its top');
    ok(['en', 'ru', 'uk', 'zh'].every(l => /\{name\}/.test(L[l]['share.mod.which'] || '') && /\{name\}/.test(L[l]['share.pack.planned'] || '')), 'GT-23 mod name text in all four languages');
  }
  {   // GT-22: picker starts outside the game list; a picked folder is checked at once; refusals in four languages naming the folders
    const st = await R('GET /api/x/share/outstart')(U(''), null, ctx);
    ok(st.dir && !st.dir.toLowerCase().startsWith(game.replace(/\\/g, '/').toLowerCase()), 'GT-22 picker start is not in the game (' + st.dir + ')');
    let x = await R('POST /api/x/share/outcheck')(null, { mod: md, out: path.join(game, 'outx') }, ctx);
    ok(!x.ok && x.refused.key === 'game' && x.refused.params.game && x.refused.params.out, 'GT-22 game folder refused, naming the game and the pick');
    x = await R('POST /api/x/share/outcheck')(null, { mod: md, out: path.join(work, 'fine') }, ctx);
    ok(x.ok && /fine\/mine$/.test(x.dest) && x.mod.name === 'Mine', 'GT-22 good folder: says where the package goes');
    const sc = require('./script'), L = require('./lang');
    ok(/\/api\/x\/share\/outstart/.test(sc) && /\/api\/x\/share\/outcheck/.test(sc), 'GT-22 page opens the picker at the start folder and checks the pick');
    const keys = ['need', 'game', 'steam', 'sep', 'isMod', 'goh', 'gameLike', 'file', 'gohMod', 'other'];
    ok(keys.every(k => ['en', 'ru', 'uk', 'zh'].every(l => L[l]['share.refuse.' + k])) && ['en', 'ru', 'uk', 'zh'].every(l => /\{out\}/.test(L[l]['share.refuse.sep']) && /\{mod\}/.test(L[l]['share.refuse.sep'])), 'GT-22 refusal texts in four languages, sep names both');
    let syn = true; try { new Function(sc); } catch (e) { syn = false; } ok(syn && !/`|\$\{|innerHTML/.test(sc), 'client script parses, no backtick, dollar-brace or innerHTML');
  }
  // Workshop uploader: a fixture game folder of its own; nothing is started
  const ug = path.join(work, 'upgame'); fs.mkdirSync(ug, { recursive: true }); fs.writeFileSync(path.join(ug, 'as64.exe'), 'x'); fs.writeFileSync(path.join(ug, 'steam_api64.dll'), 'the game dll');
  r = await R('GET /api/x/share/uploader')(U('game=' + encodeURIComponent(ug)), null, ctx);
  // the uploader program (third_party/workshop_gui) is left out of the public copy on purpose: there the status says so and install
  // is refused by name; the copy and start cases run only where the program is
  const hasPkg = !!require('../../../workshop/workshop').packageDir().dir;
  ok(!r.installed && r.hasPackage === hasPkg && r.steps.map(s => s.action).join() === 'copy,keep,write' && fs.readdirSync(ug).length === 2, 'uploader status: what would be copied, nothing written');
  await rej(R('GET /api/x/share/uploader')(U('game=' + encodeURIComponent(work)), null, ctx), /not a game folder/, 'uploader: not a game folder');
  await rej(R('POST /api/x/share/uploader')(null, { act: 'install', game: ug }, ctx), /confirm/, 'uploader install needs the confirm');
  await rej(R('POST /api/x/share/uploader')(null, { act: 'start', game: ug }, ctx), /Install it first/, 'uploader start before install refused');
  if (!hasPkg) {
    await rej(R('POST /api/x/share/uploader')(null, { act: 'install', confirm: true, game: ug }, ctx), /not part of this copy/, 'uploader install without the program: refused by name');
    ok(fs.readdirSync(ug).length === 2, 'uploader install without the program: nothing written');
    console.log('skip uploader install and start: the uploader program (third_party/workshop_gui) is not in this copy (left out of the public copy on purpose)');
  } else {
  r = await R('POST /api/x/share/uploader')(null, { act: 'install', confirm: true, game: ug }, ctx);
  ok(r.installed && r.upToDate && r.done.join() === 'workshop_gui.exe,steam_appid.txt' && fs.readFileSync(path.join(ug, 'steam_api64.dll'), 'utf8') === 'the game dll' && fs.readFileSync(path.join(ug, 'steam_appid.txt'), 'utf8') === '244450', 'uploader install: exe and appid placed, the dll already there kept');
  const started = [];
  r = await R('POST /api/x/share/uploader')(null, { act: 'start', game: ug }, Object.assign({}, ctx, { spawnUploader: (exe, a, o) => { started.push([exe, o.cwd]); return { unref() {}, on() {} }; } }));
  ok(r.started && started.length === 1 && started[0][1] === ug, 'uploader start runs it from the game folder');
  }
  const t = require('./routes')._t;
  ok(t.rangeKind({ MinGameVersion: '3.262.0', MaxGameVersion: '3.262.1' }) === 'classic' && t.rangeKind({ MinGameVersion: '3.301' }) === 'enhanced', 'range kinds');
  await require('./parity')(path.join(work, 'parity'), ok);   // game parity: MoW:AS2 and GoH branches of every route (made-up fixtures)
  await require('./pagecheck')(path.join(work, 'page'), ok);   // the page itself in the fake DOM: blocks, profile, uploader confirm
  console.log(fails ? 'FAIL share (' + fails + ')' : 'PASS share');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL share: ' + (e.stack || e)); process.exit(1); });
