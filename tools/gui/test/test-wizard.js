// GUIUX test: the guided fix on the Check screen. Finding cards (what, where, why, how), the ticked subset reaching the fix argv,
// and the patch folder never inside the source mod (page and server). Needs no game and no browser; every child is a harmless node -e.
//   node tools/gui/test/test-wizard.js [scratchDir]
// Author: Imperator_Aug (ARSENAL, ia-8b8eaa06)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const gui = require('../gui'), fakedom = require('./fakedom');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-wz-')));
fs.mkdirSync(S, { recursive: true });
// no game, as the header says. Without this the server finds a real Steam install: the page's ext calls on the chosen mod (ide/tree,
// files/tree; they take no game override) build that game's layered view, a synchronous 13-14 s job that holds the server, so the
// size probe (GET /api/mod) answers after the 15 s wait about every second run
process.env.AS2_NO_STEAM = '1'; delete process.env.AS2_GAME; delete process.env.GOH_GAME;
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// AS2GUI_WAIT=N multiplies every wait (a loaded machine, where the first page calls each take seconds)
const WAITX = Math.max(1, Number(process.env.AS2GUI_WAIT) || 1);
const W = require('../../lib/test/wait');
// backstop at least 60 s (WAIT line), only then a miss is reported. Backup, never a hang
async function waitFor(cond, what, ms = 15000) { const v = await W.until(cond, { who: 'test-wizard', what, ms: ms * WAITX, step: 25 }); if (!v) { ok(false, 'not done after the long wait: ' + what); return null; } return v; }
const NODE = process.execPath;
const WRITEJSON = "require('fs').writeFileSync(process.argv[1],process.argv[2]);console.log('wrote result')";

function req(port, method, url, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: url, agent: false, headers: Object.assign({ host: '127.0.0.1:' + port }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* ndjson */ } resolve({ status: res.statusCode, text: t, j }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
function loadPage(port, ls) {
  const doc = fakedom.make(), confirms = [], store = new Map(Object.entries(ls));
  const ctx = {
    document: doc, TextDecoder, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    confirm: m => { confirms.push(m); return true; }, fetch: (u, o) => fetch('http://127.0.0.1:' + port + u, o),
  };
  ctx.window = ctx; vm.createContext(ctx);
  return { doc, confirms, run(html) { vm.runInContext(/<script>([\s\S]*)<\/script>/.exec(html)[1], ctx, { filename: 'page.js:script' }); } };
}
const btn = (el, text) => el.all().find(e => e.tagName === 'BUTTON' && e.textContent === text);

async function main() {
  // fixtures: an invented mod and an invented game folder (nothing real is read)
  const mod = path.join(S, 'mods', 'alpha'), game = path.join(S, 'game');
  fs.mkdirSync(path.join(mod, 'resource', 'set'), { recursive: true }); fs.mkdirSync(path.join(game, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(mod, 'mod.info'), '{Mod\r\n {Name "Alpha"}\r\n}\r\n');
  fs.writeFileSync(path.join(mod, 'resource', 'set', 'a.set'), ['{a', ' {b}', ' (include "gone.inc")', ' {c}', '}'].join('\r\n') + '\r\n');
  fs.writeFileSync(path.join(mod, 'resource', 'bin.ply'), Buffer.from([1, 0, 2, 0, 3]));
  const CHECK = { mod, read: {}, verdicts: {}, errors: [], findings: [
    { tool: 'sdllint', code: 'INCLUDE_MISSING', n: 1, sev: 'crash', samples: ['resource/set/a.set:3'] },
    { tool: 'plylint', code: 'PLY_MTL_MISSING', n: 2, sev: 'cosmetic' },
    { tool: 'keylint', code: 'UNKNOWN_KEY', n: 1, sev: 'review' },
    // GUI-LOC: 25 object samples -> 2 pages of 20, each a "manual:" hit (no plan entry for this code)
    { tool: 'keylint', code: 'KEY_OBSOLETE', n: 30, sev: 'review', samples: Array.from({ length: 25 }, (_, i) => ({ file: 'resource/set/k' + i + '.set', line: i + 1, msg: 'old key', path: path.join(mod, 'resource', 'set', 'a.set') })) }],
    notes: ['JOBS -j 2 (asked 8; free RAM 3.0 GB, ~90000 files, ~1200 MB per tool)'],
    toolIssues: [{ tool: 'refcheck', kind: 'reran', text: 'RERAN refcheck alone after exit 134 (out of memory): ok' }, { tool: 'binhdr', kind: 'oom', text: 'out of memory also when run alone (exit 134)' }] };
  const PLAN = { changed: [{ kind: 'include', file: 'resource/set/a.set', detail: 'stub gone.inc', targets: [{ code: 'INCLUDE_MISSING', line: 3, why: 'stub gone.inc' }] }, { kind: 'stubmtl', file: 'resource/x.mtl', detail: 'stand-in material' }],
    cant: [{ key: 'resource/set/a.set', code: 'MACRO_UNDEFINED', msg: 'macro X has no definition anywhere', line: 4 }], reverted: [], verdict: 'PLAN', exit: 0 };
  const APPLY = { changed: [{ kind: 'include', file: 'resource/set/a.set', detail: 'stub gone.inc' }], cant: [], reverted: [], verdict: 'APPLIED', exit: 0 };
  const calls = [];
  const hook = (cc, info) => {
    const a = cc.args.slice(); calls.push({ cmd: info.cmd, args: a });
    const i = a.indexOf('--json'), target = a[i + 1];
    const res = info.cmd === 'check' ? (a.includes('--with') ? Object.assign({}, CHECK, { findings: CHECK.findings.slice(1) }) : CHECK) : a.includes('apply') ? APPLY : PLAN;
    if (i >= 0 && target && path.basename(path.dirname(target)).startsWith('as2gui-') && path.basename(target) === 'result.json') return { file: NODE, args: ['-e', WRITEJSON, target, JSON.stringify(res)] };
    return { file: NODE, args: ['-e', "console.log('echo')"] };
  };
  const A = await gui.start({ port: 0, cwd: S, spawnHook: hook, tmpRoot: S });
  try {
    // ---- server routes
    const ex = await req(A.port, 'GET', '/api/explain?codes=INCLUDE_MISSING,UNKNOWN_KEY,bad%20code');
    ok(ex.status === 200 && ex.j.cards.INCLUDE_MISSING.auto === 'include' && ex.j.cards.UNKNOWN_KEY.auto === null && !ex.j.cards['bad code'] && ex.j.fixers.stubmtl.safe === false, '/api/explain cards + fixers', ex.text);
    const pk = await req(A.port, 'GET', '/api/peek?path=' + encodeURIComponent(path.join(mod, 'resource', 'set', 'a.set')) + '&line=3');
    ok(pk.status === 200 && pk.j.lines.some(l => l.n === 3 && /gone\.inc/.test(l.text)) && pk.j.lines[0].n === 1, '/api/peek lines around line 3', pk.text);
    ok((await req(A.port, 'GET', '/api/peek?path=' + encodeURIComponent(path.join(mod, 'resource', 'bin.ply')))).status === 415, '/api/peek refuses a binary file');
    ok((await req(A.port, 'GET', '/api/peek?path=resource/set/a.set')).status === 400, '/api/peek needs an absolute path');
    const c0 = calls.length;
    for (const o of [mod, path.join(mod, 'patch'), path.dirname(mod)]) {
      const r = await req(A.port, 'POST', '/api/run?stream=0', { cmd: 'fix', input: { mod, mode: 'apply', out: o, game } });
      ok(r.status === 400 && /outside the mod/.test(r.text), 'server refuses fix apply out=' + path.relative(S, o), r.text);
    }
    ok(calls.length === c0, 'refused applies spawn nothing');

    // ---- the page
    const html = (await req(A.port, 'GET', '/')).text;
    const P = loadPage(A.port, { 'as2gui.mod': JSON.stringify(mod), 'as2gui.game': JSON.stringify(game), 'as2gui.screen': JSON.stringify('check') });
    P.run(html);
    const wz = await waitFor(() => P.doc.body.all().find(e => e.tagName === 'DIV' && /\bwizard\b/.test(e.className)), 'guided fix card');
    if (!wz) { console.log(P.doc.getElementById('main').children.map(s => s.hidden + ':' + s.textContent.slice(0, 160)).join('\n')); return; }
    ok(wz.querySelectorAll('li').length >= 6 && wz.all().filter(e => e.tagName === 'LI' && e.getAttribute('title')).length >= 6, '6 steps, each with a tooltip');
    const bCheck = btn(wz, 'Check the mod'), bApply = btn(wz, 'Apply ticked fixes');
    ok(bCheck && !bCheck.disabled && bApply && bApply.disabled && /check/i.test(bApply.getAttribute('title')), 'before a check: Check enabled, Apply disabled with the reason as tooltip', bApply && bApply.getAttribute('title'));
    const status = wz.querySelector('[role=status]');
    ok(status && /Check the mod/.test(status.textContent), 'status line says what to do', status && status.textContent);
    const fastBox = wz.all().find(e => e.tagName === 'INPUT' && (e.type || e.getAttribute('type')) === 'checkbox' && !e.getAttribute('data-fix'));
    await waitFor(() => fastBox && !fastBox.checked, 'small mod: quick check unticked by the size probe');
    bCheck.click();
    await waitFor(() => wz.querySelectorAll('input[data-fix]').length === 2, 'fix checkboxes after check + plan');
    const ck = calls.filter(c => c.cmd === 'check').pop(), pl = calls.filter(c => c.cmd === 'fix').pop();
    ok(ck && ck.args.includes(mod) && !ck.args.includes('--fast'), 'check ran on the mod, full check (small mod)', ck && ck.args.join(' '));
    ok(pl && pl.args.includes('plan') && pl.args.includes('--out') && !pl.args.includes('apply'), 'fix plan ran after the check (writes nothing)', pl && pl.args.join(' '));
    const cards = wz.all().filter(e => e.tagName === 'DIV' && /\bfcard\b/.test(e.className));
    const card = c => cards.find(e => e.dataset.code === c);
    ok(cards.length >= 4, 'a card per finding + per plan cant', cards.length);
    const inc = card('INCLUDE_MISSING');
    ok(inc && /Where/.test(inc.textContent) && /Why it matters/.test(inc.textContent) && /How to fix/.test(inc.textContent) && inc.querySelectorAll('li').length > 0, 'card: what, where, why, how-to steps', inc && inc.textContent);
    ok(inc && /crash/.test(inc.querySelector('.badge').textContent) && inc.querySelector('.badge').getAttribute('title'), 'card: plain severity with impact tooltip');
    ok(inc && /Automatic fix: include/.test(inc.textContent), 'card: auto fixer named');
    ok(card('UNKNOWN_KEY') && /No automatic fix/.test(card('UNKNOWN_KEY').textContent) && /No file location/.test(card('UNKNOWN_KEY').textContent), 'manual-only card keeps its steps and says no file location');
    ok(card('MACRO_UNDEFINED') && /macro X has no definition/.test(card('MACRO_UNDEFINED').textContent), 'plan cant item rendered as a card with its reason');
    // GUI-LOC: each hit says what the fix plan will do there, or the manual step; hits paged at 20; tool issue cards
    ok(/fix will: stub gone\.inc/.test(inc.textContent), 'hit covered by the plan: "fix will: <edit>"', inc.textContent);
    const ko = card('KEY_OBSOLETE'), hitBtns = () => ko.all().filter(e => e.tagName === 'BUTTON' && /k\d+\.set:\d+$/.test(e.textContent));
    ok(ko && /manual: /.test(ko.textContent) && !/fix will/.test(ko.textContent), 'hit not in the plan: "manual: <step>"', ko && ko.textContent.slice(0, 300));
    ok(ko && hitBtns().length === 20 && /page 1 of 2/.test(ko.textContent) && /25 of 30 places listed/.test(ko.textContent), 'hits paged at 20, cap note', ko && hitBtns().length);
    const nx = ko && ko.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Next');
    if (nx) { nx.click(); ok(hitBtns().length === 5 && /page 2 of 2/.test(ko.textContent) && hitBtns()[0].textContent === 'resource/set/k20.set:21', 'Next page shows hits 21-25', hitBtns().map(b => b.textContent).join()); } else ok(false, 'Next button on the hit list');
    ok(/ran out of memory beside the other checkers and was rerun alone/.test(wz.textContent), 'reran tool: card text');
    ok(/binhdr ran out of memory, also when run alone/.test(wz.textContent) && btn(wz, 'Rerun binhdr alone'), 'tool still failing: hint + rerun button');
    ok(/JOBS -j 2/.test(wz.textContent), 'doctor notes shown');
    // where -> peek
    const wb = inc.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'resource/set/a.set:3');
    ok(wb && /a\.set/.test(wb.getAttribute('title')), 'where is an openable file:line');
    if (wb) { wb.click(); await waitFor(() => /> 3 +.*gone\.inc/.test(wb.parentNode.textContent), 'peek view shows the marked line'); }
    // walkthrough of the hand fixes: one place at a time, skips what the plan fixes, Next moves on, Done marks and moves on
    {
      const wbtn = wz.all().find(e => e.tagName === 'BUTTON' && e.getAttribute('data-walkbtn')), wbox = wz.all().find(e => e.getAttribute && e.getAttribute('data-walk'));
      ok(wbtn && wbox, 'walkthrough button and box');
      if (wbtn && wbox) {
        wbtn.click();
        const pos = () => (wbox.all().find(e => e.getAttribute('data-walkpos')) || {}).textContent || '';
        ok(/^Place 1 of \d+$/.test(pos()) && /Suggested fix/.test(wbox.textContent), 'walkthrough opens on place 1 with a suggested fix', pos());
        ok(!/gone\.inc/.test(wbox.textContent.split('Suggested fix')[0]) || !/fix will/.test(wbox.textContent), 'place covered by the fix plan is not walked');
        const nxw = wbox.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Next');
        if (nxw) { nxw.click(); ok(/^Place 2 of/.test(pos()), 'Next goes to place 2', pos()); }
        const dn = wbox.all().find(e => e.tagName === 'INPUT' && e.getAttribute('data-walkdone'));
        if (dn) { dn.checked = true; dn.fire('change'); ok(/^Place 3 of/.test(pos()) && /1 of \d+ marked done/.test(wbox.textContent), 'Done marks the place and moves on', pos()); }
        const cl = wbox.all().find(e => e.tagName === 'BUTTON' && e.textContent === 'Close the walkthrough'); if (cl) cl.click();
        ok(wbox.hidden === true, 'walkthrough closes');
      }
    }
    // default picks: safe ticked, risky not
    const boxes = () => wz.querySelectorAll('input[data-fix]'), box = id => boxes().find(b => b.dataset.fix === id); // redrawn on every select button
    ok(box('include:resource/set/a.set').checked && !box('stubmtl:resource/x.mtl').checked, 'safe fix ticked, risky (stubmtl) unticked by default');
    btn(wz, 'Select all').click(); ok(boxes().every(b => b.checked), 'Select all');
    btn(wz, 'Select none').click(); ok(boxes().every(b => !b.checked) && bApply.disabled && /Tick/.test(bApply.getAttribute('title')), 'Select none -> Apply disabled, tooltip says tick one');
    btn(wz, 'Only safe fixes').click(); ok(box('include:resource/set/a.set').checked && !box('stubmtl:resource/x.mtl').checked, 'Only safe fixes');
    // out inside the source mod: blocked in the page, reason shown
    const out = wz.all().find(e => e.tagName === 'INPUT' && e.getAttribute('aria-label') === 'patch folder');
    ok(out && out.value === path.join(path.dirname(mod), 'alpha_fixed'), 'default patch folder is beside the mod', out && out.value);
    out.value = path.join(mod, 'fixed'); out.fire('input');
    ok(bApply.disabled && /inside your mod/.test(bApply.getAttribute('title')), 'out inside the mod: Apply disabled, reason in tooltip', bApply.getAttribute('title'));
    out.value = path.dirname(mod); out.fire('input');
    ok(bApply.disabled && /holds your mod/.test(bApply.getAttribute('title')), 'out holding the mod: Apply disabled');
    const good = path.join(S, 'patches', 'alpha_fixed'); out.value = good; out.fire('input');
    ok(!bApply.disabled, 'out outside the mod: Apply enabled', bApply.getAttribute('title'));
    const n0 = calls.length; bApply.click();
    await waitFor(() => /Done/.test(status.textContent), 'apply done');
    const ap = calls.slice(n0).find(c => c.cmd === 'fix');
    ok(P.confirms.length === 1 && P.confirms[0].includes(good) && P.confirms[0].includes(mod) && /replaced/.test(P.confirms[0]), 'confirm shows the exact out path, the mod, and that old contents are replaced', P.confirms[0]);
    const oi = ap ? ap.args.indexOf('--only') : -1, pi = ap ? ap.args.indexOf('--pick') : -1;
    ok(ap && ap.args.includes('apply') && ap.args[ap.args.indexOf('--out') + 1] === good, 'apply argv: mode apply, --out = chosen folder', ap && ap.args.join(' '));
    ok(ap && ((oi >= 0 && ap.args[oi + 1] === 'include') || (pi >= 0 && ap.args[pi + 1] === 'include:resource/set/a.set')), 'ticked subset reaches the argv (include only, no stubmtl)', ap && ap.args.join(' '));
    ok(ap && !ap.args.some(x => /stubmtl/.test(x)), 'unticked fixer not in argv');
    ok(!fs.existsSync(path.join(mod, 'fixed')) && fs.readdirSync(mod).sort().join(',') === 'mod.info,resource', 'source mod folder unchanged');
    ok(/1 file\(s\) written/.test(wz.textContent) && /not touched/.test(wz.textContent), 'step 6: what changed + next steps');
    const bRe = btn(wz, 'Check again with the patch'); ok(bRe && !bRe.disabled, 'Check again enabled after apply');
    const n1 = calls.length; bRe.click();
    await waitFor(() => /now: 3/.test(status.textContent) || /Problems before: 4, with the patch: 3/.test(wz.textContent), 'recheck before/after');
    const rc = calls.slice(n1).find(c => c.cmd === 'check');
    ok(rc && rc.args[rc.args.indexOf('--with') + 1] === good, 'recheck passes --with <patch>', rc && rc.args.join(' '));
  } finally { await A.close(); }
}
main().catch(e => { failN++; console.log('FAIL crash ' + (e.stack || e)); }).then(() => {
  if (!process.argv[2]) fs.rmSync(S, { recursive: true, force: true });
  console.log((failN ? 'FAIL' : 'PASS') + ' wizard ' + pass + '/' + (pass + failN)); process.exit(failN ? 1 : 0);
});
