// game parity: the server learns the page's game. Loopback only, no game started, game installs read only.
//   node tools/gui/test/test-games.js [scratchDir]
// 1. ctx of an ext route (a made-up route added for this test): default as64; gid by query, body and header (order query, body, header);
//    unknown = as64; exe and kind per game; gohDir from ?goh, body.goh and the header (URI-decoded); curDir; ctx.game() unchanged
// 2. LAN Remote: a GoH folder outside the folders the PC page shows is refused (header, query, body; a relative one; a bad encoding);
//    one inside is taken; a gid alone is harmless
// 3. core routes: /api/mods, /api/mod, /api/installed and /api/ls under goh with a made-up GoH folder; worksOn with the GoH rule
//    (GHVFS-02, GHNET-22); the in-process game command with the request's kind goh
// 4. (wave 3) under goh a ?game that is the page's AS2 folder does not replace the GoH install (/api/installed, /api/ls); a ?game that
//    is a GoH install still wins; as64 and mowas2 keep the AS2 folder; /api/jobs names the game of a running job (sleeper child)
// 5. (sweep) /api/run adds --exe <game> to testprofile and testprofile-seed under mowas2 and goh (real modswitch refusal, TST-19,
//    GHVFS-13); the as64 argv has no --exe; check gets none from the server
// Author: Imperator_Aug (ARSENAL, ia-638c1bc2)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
// a made-up ext route, added before gui.js reads the ext list (test only)
const EXT = require('../ext');
const seen = [];
EXT.push({ id: 'zzgame', routes: {
  'GET /api/x/zzgame/ctx': async (u, b, ctx) => { seen.push(ctx); return { gameId: ctx.gameId(), exe: ctx.exe(), kind: ctx.kind(), gohDir: ctx.gohDir(), curDir: ctx.curDir(), game: ctx.game() }; },
  'POST /api/x/zzgame/ctx': async (u, b, ctx) => ({ gameId: ctx.gameId(), exe: ctx.exe(), kind: ctx.kind(), gohDir: ctx.gohDir(), curDir: ctx.curDir(), game: ctx.game() }),
} });
const gui = require('../gui'), remote = require('../remote'), gamedir = require('../../lib/gamedir');
remote.ALLOW.add('GET /api/x/zzgame/ctx'); remote.ALLOW.add('POST /api/x/zzgame/ctx');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-games-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 500) : '')); } };

function req(port, method, p, o = {}) {
  return new Promise(resolve => {
    const headers = Object.assign({ host: o.host || '127.0.0.1:' + port }, o.headers || {});
    if (o.remote) headers['x-test-remote'] = '1';
    if (o.cookie) headers.cookie = o.cookie;
    let body = null; if (method === 'POST') { body = JSON.stringify(o.body || {}); headers['content-type'] = 'application/json'; }
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers }, res => {
      let t = ''; res.setEncoding('utf8'); res.on('data', d => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (e) { /* text */ } resolve({ status: res.statusCode, text: t, j }); });
    });
    r.on('error', e => resolve({ status: 0, text: e.message }));
    if (body) r.write(body); r.end();
  });
}
const CRLF = s => s.replace(/\n/g, '\r\n');
const q = encodeURIComponent;

(async () => {
  // the made-up GoH install under the server's temp root (a folder the PC page shows) and one outside every root
  const TMP = path.join(S, 'tmp'), GOH = path.join(TMP, 'Gates Ünit goh'), OUT = path.join(S, 'elsewhere', 'goh');
  for (const d of [GOH, OUT]) {
    fs.mkdirSync(path.join(d, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(d, 'binaries', 'x64', 'call_to_arms.exe'), '');
    fs.mkdirSync(path.join(d, 'mods'), { recursive: true });
  }
  const mk = (dir, info) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'mod.info'), CRLF(info)); };
  mk(path.join(GOH, 'mods', 'gmod'), '{name "G mod"}\n{desc "goh"}\n{MinGameVersion 1.067}\n{MaxGameVersion 1.067}\n');
  mk(path.join(GOH, 'mods', 'devmod'), '{name "Dev"}\n{MinGameVersion 3.301}\n{Tags "develop no_delete"}\n');
  mk(path.join(GOH, 'mods', 'as2mod'), '{name "Old"}\n{MinGameVersion 3.301}\n');
  mk(path.join(GOH, 'mods', 'open'), '{name "Open"}\n');
  const AS2 = gamedir.resolve({}).dir;   // the real AS2 install or null (read only)
  const LAN = '10.9.8.7';
  const A = await gui.start({ port: 0, cwd: S, tmpRoot: TMP, remoteHook: x => x.headers['x-test-remote'] === '1', lan: [LAN] });
  const P = A.port, H = LAN + ':' + P;
  try {
    // ---- 1. ctx
    let r = await req(P, 'GET', '/api/x/zzgame/ctx');
    const defGoh = gamedir.goh({}) || null;
    ok(r.status === 200 && r.j.gameId === 'as64' && r.j.exe === 'as64' && r.j.kind === 'as2', 'nothing sent: as64, exe as64, kind as2', r.text);
    ok(r.j.gohDir === defGoh, 'nothing sent: gohDir = gamedir.goh({}) (or null)', r.j.gohDir);
    ok(r.j.curDir === r.j.game && r.j.game === AS2, 'as64: curDir = ctx.game() = the AS2 install as before', r.text);
    for (const [id, exe, kind] of [['as64', 'as64', 'as2'], ['mowas2', 'mowas_2', 'as2'], ['goh', 'goh', 'goh']]) {
      r = await req(P, 'GET', '/api/x/zzgame/ctx?gid=' + id); ok(r.j && r.j.gameId === id && r.j.exe === exe && r.j.kind === kind, 'gid by query ' + id + ': exe ' + exe + ', kind ' + kind, r.text);
      r = await req(P, 'GET', '/api/x/zzgame/ctx', { headers: { 'x-arsenal-game': id } }); ok(r.j && r.j.gameId === id && r.j.exe === exe && r.j.kind === kind, 'gid by header ' + id, r.text);
      r = await req(P, 'POST', '/api/x/zzgame/ctx', { body: { gid: id } }); ok(r.j && r.j.gameId === id && r.j.exe === exe && r.j.kind === kind, 'gid by body ' + id, r.text);
    }
    r = await req(P, 'GET', '/api/x/zzgame/ctx?gid=mowas2', { headers: { 'x-arsenal-game': 'goh' } }); ok(r.j.gameId === 'mowas2', 'query wins over the header', r.text);
    r = await req(P, 'POST', '/api/x/zzgame/ctx', { body: { gid: 'mowas2' }, headers: { 'x-arsenal-game': 'goh' } }); ok(r.j.gameId === 'mowas2', 'body wins over the header', r.text);
    for (const bad of ['mowas_2', 'GOH', 'x', '__proto__', 'toString']) { r = await req(P, 'GET', '/api/x/zzgame/ctx?gid=' + q(bad)); ok(r.j && r.j.gameId === 'as64' && r.j.kind === 'as2', 'unknown gid ' + bad + ' = as64', r.text); }
    r = await req(P, 'GET', '/api/x/zzgame/ctx', { headers: { 'x-arsenal-game': 'mowas2' } });
    ok(r.j.curDir === r.j.game && r.j.game === AS2, 'mowas2: curDir = the AS2 install, ctx.game() unchanged', r.text);
    r = await req(P, 'GET', '/api/x/zzgame/ctx', { headers: { 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(GOH) } });
    ok(r.j.gohDir === GOH && r.j.curDir === GOH && r.j.game === AS2, 'goh: gohDir from the header, URI-decoded (space, non-ASCII); curDir = gohDir; game() still the AS2 install', r.text);
    r = await req(P, 'GET', '/api/x/zzgame/ctx?gid=goh&goh=' + q(GOH)); ok(r.j.gohDir === GOH && r.j.curDir === GOH, 'gohDir by query', r.text);
    r = await req(P, 'POST', '/api/x/zzgame/ctx', { body: { gid: 'goh', goh: GOH } }); ok(r.j.gohDir === GOH && r.j.curDir === GOH, 'gohDir by body', r.text);
    r = await req(P, 'GET', '/api/x/zzgame/ctx?goh=' + q(GOH), { headers: { 'x-arsenal-goh': q(OUT) } }); ok(r.j.gohDir === GOH && r.j.kind === 'as2' && r.j.curDir === AS2, 'query goh wins over the header; as64 keeps curDir on the AS2 install', r.text);
    r = await req(P, 'GET', '/api/x/zzgame/ctx', { headers: { 'x-arsenal-game': 'goh', 'x-arsenal-goh': '%E0%A4%A' } }); ok(r.status === 200 && r.j.gohDir === defGoh, 'PC: a header that does not decode is ignored (the finder answers)', r.text);

    // ---- 2. LAN Remote
    await req(P, 'POST', '/api/remote', { body: { on: true } });
    const key = (await req(P, 'GET', '/api/remote')).j.link.split('?k=')[1], C = remote.COOKIE + '=' + key, ro = h => ({ remote: true, host: H, cookie: C, headers: h || {} });
    r = await req(P, 'GET', '/api/x/zzgame/ctx', ro({ 'x-arsenal-game': 'mowas2' })); ok(r.status === 200 && r.j.gameId === 'mowas2', 'remote: a gid alone is taken', r.text);
    r = await req(P, 'GET', '/api/x/zzgame/ctx', ro({ 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(GOH) })); ok(r.status === 200 && r.j.gohDir === GOH, 'remote: a GoH folder the PC page shows is taken', r.text);
    const refused = x => x.status === 403 && x.j && x.j.key === 'rmt.viewOnly';
    r = await req(P, 'GET', '/api/x/zzgame/ctx', ro({ 'x-arsenal-goh': q(OUT) })); ok(refused(r), 'remote: header GoH folder outside the roots refused (403 rmt.viewOnly)', r.status + ' ' + r.text);
    r = await req(P, 'GET', '/api/x/zzgame/ctx?goh=' + q(OUT), ro()); ok(refused(r), 'remote: query GoH folder outside the roots refused', r.status);
    r = await req(P, 'POST', '/api/x/zzgame/ctx', Object.assign(ro(), { body: { gid: 'goh', goh: OUT } })); ok(refused(r), 'remote: body GoH folder outside the roots refused', r.status);
    r = await req(P, 'GET', '/api/x/zzgame/ctx', ro({ 'x-arsenal-goh': 'tmp' })); ok(refused(r), 'remote: a relative GoH folder refused', r.status);
    r = await req(P, 'POST', '/api/x/zzgame/ctx', Object.assign(ro(), { body: { goh: 'tmp' } })); ok(refused(r), 'remote: a relative body.goh refused', r.status);
    r = await req(P, 'GET', '/api/x/zzgame/ctx?goh=tmp', ro()); ok(refused(r), 'remote: a relative ?goh refused', r.status);
    r = await req(P, 'GET', '/api/x/zzgame/ctx', ro({ 'x-arsenal-goh': '%E0%A4%A' })); ok(refused(r), 'remote: a header that does not decode refused', r.status);
    r = await req(P, 'GET', '/api/x/zzgame/ctx', ro({ 'x-arsenal-goh': q(GOH + path.sep + '..' + path.sep + '..') })); ok(refused(r), 'remote: ".." in the header refused', r.status);
    r = await req(P, 'GET', '/api/mods?dir=' + q(path.join(GOH, 'mods')), ro({ 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(OUT) })); ok(refused(r), 'remote: a core route with a GoH header outside the roots refused', r.status);
    r = await req(P, 'GET', '/api/mods?dir=' + q(path.join(GOH, 'mods')), ro({ 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(GOH) })); ok(r.status === 200 && r.j.game === GOH, 'remote: /api/mods with a shown GoH folder', r.status + ' ' + r.text.slice(0, 200));
    await req(P, 'POST', '/api/remote', { body: { on: false } });

    // ---- 3. core routes
    const GH = { 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(GOH) };
    r = await req(P, 'GET', '/api/mods?dir=' + q(path.join(GOH, 'mods')), { headers: GH });
    const by = n => (r.j && r.j.mods || []).find(m => m.folder === n) || {};
    ok(r.status === 200 && r.j.game === GOH && r.j.kind === 'goh' && r.j.gameVersion === null, '/api/mods under goh: the GoH install, kind goh, no version (empty exe)', r.text.slice(0, 300));
    ok(by('gmod').installed === true && by('open').installed === true, '/api/mods under goh: mods in <GoH>/mods are installed', JSON.stringify(by('gmod')));
    ok(by('gmod').worksOn === 'goh' && by('open').worksOn === 'goh' && by('devmod').worksOn === 'goh' && by('devmod').develop === true && by('as2mod').worksOn === 'none',
      '/api/mods under goh: GoH bounds and Tags develop (version unknown: an AS2 3.x Min only is refused)', JSON.stringify(r.j.mods.map(m => [m.folder, m.worksOn])));
    r = await req(P, 'GET', '/api/mods?dir=' + q(path.join(GOH, 'mods')));
    ok(r.status === 200 && r.j.game === AS2 && r.j.kind === undefined && r.j.mods.find(m => m.folder === 'gmod').worksOn === 'none', '/api/mods with no game: the AS2 install and the AS2 rule as before', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/mod?dir=' + q(path.join(GOH, 'mods', 'gmod')), { headers: GH }); ok(r.status === 200 && r.j.works.worksOn === 'goh' && r.j.works.min === '1.067', '/api/mod under goh: the GoH rule', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/mod?dir=' + q(path.join(GOH, 'mods', 'gmod'))); ok(r.status === 200 && r.j.works.worksOn === 'none', '/api/mod with no game: the AS2 rule', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/installed?gid=goh&goh=' + q(GOH)); ok(r.status === 200 && r.j.game === GOH && r.j.mods.length === 4 && r.j.mods.every(m => m.hasInfo), '/api/installed under goh: <GoH>/mods', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/ls', { headers: GH }); ok(r.status === 200 && r.j.roots[0].path === path.join(GOH, 'mods'), '/api/ls under goh: game mods = <GoH>/mods', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/ls?game=' + q(GOH)); ok(r.status === 200 && r.j.roots[0].path === path.join(GOH, 'mods'), '/api/ls with ?game = a GoH folder (as the page sends today)', r.text.slice(0, 200));
    // workshop by kind: a made-up steam library
    const LIB = path.join(S, 'lib', 'steamapps'), G2 = path.join(LIB, 'common', 'Call to Arms - Gates of Hell'), A2 = path.join(LIB, 'common', 'Men of War Assault Squad 2');
    for (const d of [path.join(G2, 'binaries', 'x64'), path.join(A2, 'mods'), path.join(G2, 'mods'), path.join(LIB, 'workshop', 'content', '400750'), path.join(LIB, 'workshop', 'content', '244450')]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(G2, 'binaries', 'x64', 'call_to_arms.exe'), '');
    r = await req(P, 'GET', '/api/ls?game=' + q(G2)); ok(r.j && r.j.roots.some(x => x.readOnly && x.path === path.join(LIB, 'workshop', 'content', '400750')), '/api/ls: a GoH install lists the 400750 Workshop', r.text.slice(0, 300));
    r = await req(P, 'GET', '/api/ls', { headers: { 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(G2) } }); ok(r.j && r.j.roots.some(x => x.readOnly && x.path === path.join(LIB, 'workshop', 'content', '400750')), '/api/ls by header goh: the 400750 Workshop', r.text.slice(0, 300));
    r = await req(P, 'GET', '/api/ls?game=' + q(A2)); ok(r.j && r.j.roots.some(x => x.readOnly && x.path === path.join(LIB, 'workshop', 'content', '244450')) && !r.text.includes('400750'), '/api/ls: an AS2 install lists the 244450 Workshop', r.text.slice(0, 300));
    r = await req(P, 'GET', '/api/mods?dir=' + q(path.join(LIB, 'workshop', 'content', '400750')), { headers: { 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(G2) } }); ok(r.j && r.j.readOnly === true, '/api/mods under goh: the GoH Workshop is read only', r.text.slice(0, 200));
    // wave 3: the page sends its AS2 folder (S.gameOv) as ?game= on every tab; under goh that is not the open game
    fs.mkdirSync(path.join(A2, 'mods', 'as2only'), { recursive: true });
    r = await req(P, 'GET', '/api/installed?game=' + q(A2), { headers: GH }); ok(r.status === 200 && r.j.game === GOH && r.j.mods.length === 4, '/api/installed under goh with ?game = the AS2 folder: still <GoH>/mods', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/installed?game=' + q(G2), { headers: GH }); ok(r.status === 200 && r.j.game === G2, '/api/installed under goh with ?game = a GoH install: that install wins', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/installed?game=' + q(A2)); ok(r.status === 200 && r.j.game === A2 && r.j.mods.some(m => m.name === 'as2only'), '/api/installed as64 with ?game = the AS2 folder: as before', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/installed?game=' + q(A2), { headers: { 'x-arsenal-game': 'mowas2' } }); ok(r.status === 200 && r.j.game === A2, '/api/installed mowas2 with ?game = the AS2 folder (shared install)', r.text.slice(0, 200));
    r = await req(P, 'GET', '/api/ls?game=' + q(A2), { headers: { 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(G2) } });
    ok(r.j && r.j.roots[0].path === path.join(G2, 'mods') && r.j.roots.some(x => x.readOnly && x.path === path.join(LIB, 'workshop', 'content', '400750')) && !r.text.includes('244450'), '/api/ls under goh with ?game = the AS2 folder: GoH mods and the 400750 Workshop', r.text.slice(0, 300));
    r = await req(P, 'GET', '/api/ls?game=' + q(A2), { headers: { 'x-arsenal-game': 'mowas2' } }); ok(r.j && r.j.roots[0].path === path.join(A2, 'mods') && r.text.includes('244450'), '/api/ls mowas2 with ?game = the AS2 folder: AS2 mods and the 244450 Workshop', r.text.slice(0, 300));
    // in-process game command
    r = await req(P, 'POST', '/api/run?stream=0', { body: { cmd: 'game', input: { game: GOH } }, headers: { 'x-arsenal-game': 'goh' } });
    ok(r.status === 200 && r.j.code === 0 && r.j.result.dir === GOH && r.j.result.kind === 'goh' && /gamedir\.goh/.test(r.j.argv.join(' ')), 'run game under goh (header): gamedir.goh', r.text.slice(0, 300));
    r = await req(P, 'POST', '/api/run?stream=0', { body: { cmd: 'game', input: { game: GOH } } });
    ok(r.status === 200 && r.j.result.dir === GOH && !r.j.result.kind && /gamedir\.resolve/.test(r.j.argv.join(' ')), 'run game with no game named: gamedir.resolve as before', r.text.slice(0, 300));

    // worksOn unit checks (GHVFS-02, GHNET-22)
    const w = (t, v) => gui.worksOn(CRLF(t), 'goh', v).worksOn;
    ok(w('{MinGameVersion 1.067}\n{MaxGameVersion 1.067}', '1.067') === 'goh' && w('{MinGameVersion 1.068}', '1.067') === 'none' && w('{MaxGameVersion 1.066}', '1.067') === 'none'
      && w('{MinGameVersion 1.060}', '1.067') === 'goh' && w('', '1.067') === 'goh' && w('{MinGameVersion 9.0}\n{Tags "a develop"}', '1.067') === 'goh' && w('{MinGameVersion 3.301}', '1.067') === 'none',
    'worksOn goh: each bound optional, develop = any version, Min and Max against the game version');
    ok(gui.worksOn('{MinGameVersion 3.301}').worksOn === 'as64' && gui.worksOn('{MinGameVersion 3.262}\n{MaxGameVersion 3.262}').worksOn === 'classic' && gui.worksOn('').worksOn === 'none', 'worksOn AS2 unchanged');
    if (defGoh) { const v = gui.gohVersion(defGoh); ok(v === null || /^1\.\d{3}$/.test(v), 'the real GoH exe version in the mod.info form (read only): ' + v); }
    // wave 3: the job list names the game of a running job (a sleeper child stands in for the tool)
    const B = await gui.start({ port: 0, cwd: S, tmpRoot: TMP, spawnHook: () => ({ file: process.execPath, args: ['-e', 'setTimeout(function(){},20000)'] }) });
    try {
      for (const [hdr, want] of [[{ 'x-arsenal-game': 'goh', 'x-arsenal-goh': q(GOH) }, 'goh'], [{ 'x-arsenal-game': 'mowas2' }, 'mowas2'], [{}, 'as64']]) {
        const hr = http.request({ host: '127.0.0.1', port: B.port, method: 'POST', path: '/api/run', headers: Object.assign({ host: '127.0.0.1:' + B.port, 'content-type': 'application/json' }, hdr) }, res => res.resume());
        hr.on('error', () => { /* cancelled */ }); hr.end(JSON.stringify({ cmd: 'check', input: { mod: GOH, fast: true } }));
        let jl = []; for (let i = 0; i < 100 && !jl.length; i++) { await new Promise(d => setTimeout(d, 100)); jl = ((await req(B.port, 'GET', '/api/jobs')).j || {}).jobs || []; }
        ok(jl.length === 1 && jl[0].game === want && jl[0].cmd === 'check', '/api/jobs: a running job under ' + want + ' says game ' + want, JSON.stringify(jl));
        if (jl[0]) await req(B.port, 'POST', '/api/cancel', { body: { id: jl[0].id } });
        for (let i = 0; i < 100; i++) { await new Promise(d => setTimeout(d, 100)); if (!(((await req(B.port, 'GET', '/api/jobs')).j || {}).jobs || []).length) break; }
      }
    } finally { await B.close(); }
    // sweep: testprofile and testprofile-seed (modswitch) get --exe <game> when the game is not as64; the AS64 argv stays as it was.
    // as64 runs a stand-in (the real one would read this PC's profile); mowas2 and goh run the real modswitch, which refuses at once
    // (TST-19, GHVFS-13) before it reads anything, and the run shows that line with exit 2
    const FAKE2 = path.join(S, "as2fake"); fs.mkdirSync(FAKE2, { recursive: true });
    const argvs = [];
    const Cq = await gui.start({ port: 0, cwd: S, tmpRoot: TMP, spawnHook: (cc, m) => { argvs.push(cc.args.slice(1)); return argvs[argvs.length - 1].includes('--exe') ? cc : { file: process.execPath, args: ['-e', 'console.log("profile: stand-in")'] }; } });
    try {
      for (const [cmd, input] of [['testprofile', { game: FAKE2, inst: 1 }], ['testprofile-seed', { seed: 1 }]]) {
        for (const [gid, exe, row] of [['as64', null, null], ['mowas2', 'mowas_2', 'TST-19'], ['goh', 'goh', 'GHVFS-13']]) {
          const n = argvs.length;
          const rr = await req(Cq.port, 'POST', '/api/run?stream=0', { body: { cmd, input }, headers: gid === 'as64' ? {} : { 'x-arsenal-game': gid } });
          const a = argvs[n] || [], j = rr.j || {}, text = (j.lines || []).map(l => l.line).join('\n');
          if (!exe) ok(rr.status === 200 && !a.includes('--exe') && j.code === 0, cmd + ' as64: argv as before (no --exe), the run goes on', JSON.stringify(a) + ' ' + rr.text);
          else ok(rr.status === 200 && a[a.indexOf('--exe') + 1] === exe && a.filter(x => x === '--exe').length === 1 && j.code === 2
            && new RegExp('^modswitch: not available for .*\\(' + row + '\\)$', 'm').test(text), cmd + ' ' + gid + ': --exe ' + exe + ', modswitch refuses with the plain line (' + row + ')', JSON.stringify(a) + ' ' + rr.text);
        }
      }
      // a command outside the list never gets --exe from the game (check keeps its own fields)
      const n = argvs.length;
      await req(Cq.port, 'POST', '/api/run?stream=0', { body: { cmd: 'check', input: { mod: FAKE2, fast: true } }, headers: { 'x-arsenal-game': 'mowas2' } });
      ok(argvs[n] && !argvs[n].includes('--exe'), 'check under mowas2: no --exe added by the server', JSON.stringify(argvs[n]));
    } finally { await Cq.close(); }
  } finally { await A.close(); }
  console.log(pass + ' passed, ' + failN + ' failed');
  process.exit(failN ? 1 : 0);
})().catch(e => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
