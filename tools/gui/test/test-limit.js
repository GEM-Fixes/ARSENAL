// GUI-LIM test: GET /api/limit (codes and id) and the limits column, filter and count line on the Check result. No game, no browser.
//   node tools/gui/test/test-limit.js [scratchDir]
// Author: Imperator_Aug (ARSENAL, ia-f5bab5ca)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const gui = require('../gui'), fakedom = require('./fakedom'), lm = require('../../lib/limmap');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'as2gui-lim-')));
fs.mkdirSync(S, { recursive: true });
let pass = 0, failN = 0;
const ok = (c, m, extra) => { if (c) pass++; else { failN++; console.log('FAIL ' + m + (extra !== undefined ? '\n  ' + String(extra).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(cond, what, ms = 10000) { const t0 = Date.now(); for (;;) { let v; try { v = cond(); } catch (e) { v = false; } if (v) return v; if (Date.now() - t0 > ms) { ok(false, 'timed out waiting for ' + what); return null; } await sleep(25); } }
function get(port, url) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'GET', path: url, agent: false, headers: { host: '127.0.0.1:' + port } }, res => {
      const ch = []; res.on('data', d => ch.push(d)); res.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (e) { /* text */ } resolve({ status: res.statusCode, j, text: t }); });
    });
    r.on('error', reject); r.end();
  });
}
// codes from the real map: one with a row, one tool-kind, one the map does not know
const all = lm.codes();
const withRow = all.find(c => { const e = lm.limitOf(c); return e && e.lim.length && lm.rowClass(e.lim[0]); });
const toolKind = all.find(c => { const e = lm.limitOf(c); return e && e.kind === 'tool'; });
const UNKNOWN = 'NO_SUCH_CODE_ZZZ';
const cntOf = el => el.all().find(e => e.attrs && e.attrs['data-lim-count']);

async function main() {
  ok(withRow && toolKind, 'limmap holds a code with a row and a tool-kind code', [withRow, toolKind]);
  const A = await gui.start({ port: 0, cwd: S, tmpRoot: S });
  try {
    // ---- route: codes
    const r1 = await get(A.port, '/api/limit?codes=' + [withRow, toolKind, UNKNOWN, 'bad%20code'].join(','));
    const e1 = lm.limitOf(withRow);
    ok(r1.status === 200 && r1.j && JSON.stringify(r1.j.codes[withRow].lim) === JSON.stringify(e1.lim) && r1.j.codes[withRow].class === e1.class, '/api/limit codes: a code with a row gives its ids and class', r1.text);
    ok(r1.j.codes[toolKind].kind === 'tool' && r1.j.codes[toolKind].lim.length === 0, '/api/limit codes: a tool-kind code gives kind tool, no ids', r1.text);
    ok(r1.j.codes[UNKNOWN] === null, '/api/limit codes: an unknown code gives null');
    ok(!('bad code' in r1.j.codes), '/api/limit codes: a malformed code is dropped');
    const r0 = await get(A.port, '/api/limit');
    ok(r0.j && r0.j.codes && Object.keys(r0.j.codes).length === 0, '/api/limit with nothing asked: empty codes');
    // ---- route: id (row text from limits/; PORT-138 sits in the continuation file PORT7.md)
    const hasLimits = fs.existsSync(path.join(__dirname, '..', '..', '..', 'limits', 'PORT7.md'));
    const r2 = await get(A.port, '/api/limit?id=PORT-138');
    ok(r2.status === 200 && r2.j.id === 'PORT-138' && r2.j.class === lm.rowClass('PORT-138'), '/api/limit id: id and class', r2.text);
    if (hasLimits) ok(r2.j.row && /limits N/.test(r2.j.row.subject) && r2.j.row.limit && r2.j.row.effect, '/api/limit id: PORT-138 found in limits/PORT7.md (continuation file)', r2.text);
    const r3 = await get(A.port, '/api/limit?id=KEY-18');
    if (hasLimits) ok(r3.j.row && /AccuracyByMotion/.test(r3.j.row.subject), '/api/limit id: a row in the main area file', r3.text);
    const r4 = await get(A.port, '/api/limit?id=ZZZ-9999');
    ok(r4.status === 200 && r4.j.row === null && r4.j.class === null, '/api/limit id: unknown row gives row null, class null', r4.text);
    ok((await get(A.port, '/api/limit?id=..%2Fetc')).status === 400, '/api/limit id: a malformed id is refused');
    // limits/ absent (the exe ships none): row null, never a throw
    const bak = fs.readdirSync;
    fs.readdirSync = function (d, ...a) { if (/limits$/.test(String(d))) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return bak.call(fs, d, ...a); };
    let r5; try { r5 = gui.apiLimit(null, 'PORT-138'); } finally { fs.readdirSync = bak; }
    ok(r5.row === null && r5.id === 'PORT-138', 'apiLimit: limits/ absent gives row null');

    // ---- the page: viewCheck under the fake DOM
    const html = (await get(A.port, '/')).text;
    const doc = fakedom.make(), store = new Map();
    const ctx = { document: doc, TextDecoder, console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
      localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      confirm: () => true, fetch: (u, o) => fetch('http://127.0.0.1:' + A.port + u, o) };
    ctx.window = ctx; vm.createContext(ctx);
    const src = /<script>([\s\S]*)<\/script>/.exec(html)[1].replace(/\}\)\(\);\s*$/, 'window.__vc = viewCheck;})();');
    vm.runInContext(src, ctx, { filename: 'page.js:script' });
    const el = doc.createElement('div');
    const rid = lm.limitOf(withRow).lim[0];
    ctx.__vc({ mod: S, read: {}, errors: [], findings: [
      { tool: 'keylint', code: withRow, n: 3, sev: 'review' }, { tool: 'x', code: toolKind, n: 2, sev: 'review' }, { tool: 'x', code: UNKNOWN, n: 1, sev: 'silent' }] }, el);
    await waitFor(() => cntOf(el) && cntOf(el).textContent, 'limits count line');
    ok(cntOf(el) && /3 of 3 shown: 1 with a row, 1 tool, 1 no row/.test(cntOf(el).textContent), 'count line above the list', cntOf(el) && cntOf(el).textContent);
    ok(el.has('limits') && el.has(rid) && el.has('no row yet'), 'column header, row id and "no row yet" shown', el.textContent.slice(0, 300));
    ok(el.all().some(e => e.attrs && e.attrs['data-lim-label'] === 'tool' && e.textContent === 'tool'), 'tool kind shows the label "tool"');
    const sel = el.all().find(e => e.tagName === 'SELECT' && e.attrs['data-lim-filter']);
    ok(sel && sel.all().filter(e => e.tagName === 'OPTION').length === 4, 'filter has 4 options');
    for (const [v, keep, drop] of [['row', withRow, toolKind], ['tool', toolKind, UNKNOWN], ['none', UNKNOWN, withRow]]) {
      sel.value = v; sel.fire('change');
      ok(el.has(keep) && !el.textContent.includes(drop), 'filter ' + v + ' keeps ' + keep + ' and hides ' + drop);
    }
    ok(/1 of 3 shown/.test(cntOf(el).textContent), 'count line follows the filter');
    sel.value = 'row'; sel.fire('change');
    const idBtn = el.all().find(e => e.tagName === 'BUTTON' && e.attrs['data-lim-id'] === rid);
    ok(!!idBtn, 'row id is a button');
    if (idBtn) {
      idBtn.click(); await waitFor(() => /class: /.test(el.textContent), 'row detail');
      ok(/class: /.test(el.textContent) && (!hasLimits || /limit: /.test(el.textContent)), 'click on an id shows subject, limit, effect, class', el.textContent.slice(-400));
    }
  } finally { await A.close(); }
  console.log(`limit test: ${pass} passed, ${failN} failed`);
  process.exitCode = failN ? 1 : 0;
}
main().catch(e => { console.log('limit test crashed: ' + (e && e.stack || e)); process.exitCode = 1; });
