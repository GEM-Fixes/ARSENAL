// Open file location (Shift+Alt+R, Show in the file list) and "Show game files not overwritten" in the My mod list (ui/explorer.js,
// ui/core.js). Page cases over the fake DOM with a fake server. Run by tools/gui/ext/ide/test.js (hook at its end, or alone:
// IDE_ONLY=merged node tools/gui/ext/ide/test.js <scratch>). module.exports = async function(env){}.
// Author: Imperator_Aug (ARSENAL, ia-4a613757)
'use strict';

module.exports = async function (env) {
  const { boot } = env;
  const ok = (c, m, x) => env.ok(c, c || x === undefined ? m : m + ' [' + String(x).slice(0, 400) + ']');
  const cl = (e, c) => String((e && e.className) || '').split(/\s+/).indexOf(c) >= 0;
  const M = 'C:/g/mods/mine';
  const G1 = { name: 'g.set', key: 'resource/set/g.set', where: 'vanilla', layer: 'vanilla', size: 7, idx: 0, pak: 'resource.pak' };
  const page = async (o) => {
    o = o || {};
    const copies = [], reveals = [];
    const P = await boot({ show: false, mod: M, ls: Object.assign({ 'ide.x.mode': 'mod', 'ide.x.merged': true, ['ide.x.open.' + M]: { 'resource/set': true } }, o.ls || {}),
      files: { 'mod.info': '{m}', 'resource/set/a.set': '{a 1}\r\n', 'resource/set/sub/b.set': '{b 1}\r\n' },
      api: req => {
        const p = req.path, q = req.q;
        if (p === '/api/x/ide/vdir') {
          if (q.under !== '1') return { dir: q.dir, dirs: [], files: [], total: 0, off: 0, next: null, ver: 'v' };
          const d = q.dir || '';
          if (d === '') return { dir: '', dirs: ['entity', 'set'], files: [], total: 2, off: 0, next: null, ver: 'v' };
          if (d === 'set') return { dir: 'set', dirs: ['gameonly', 'sub'], files: [G1], total: 3, off: 0, next: null, ver: 'v' };
          return { dir: d, dirs: [], files: [], total: 0, off: 0, next: null, ver: 'v' };
        }
        if (p === '/api/x/ide/vfind') { const hits = q.under === '1' && 'set/g.set'.indexOf(q.q) >= 0 ? [Object.assign({}, G1, { name: 'set/g.set' })] : []; return { q: q.q, hits, total: hits.length, off: 0, next: null, ver: 'f' }; }
        if (p === '/api/x/files/open' && q.key) return { text: '{g 1}\r\n', eol: 'crlf', bom: false, cpLines: 0, loneCr: false, lines: 2, size: 7, hash: 'h', editable: false, why: 'layer', rel: null, key: q.key };
        if (p === '/api/x/files/which') return { key: q.key, chain: [{ kind: 'vanilla', idx: 0, layer: 'vanilla', winner: true }] };
        if (p === '/api/x/files/copy') { copies.push(req.body); return req.body.write ? { ok: true, rel: 'resource/set/g.set' } : { rel: 'resource/set/g.set', size: 7, exists: false }; }
        if (p === '/api/x/ide/extopen') { reveals.push(req.body); return o.pak ? { ok: true, file: 'C:\\g\\resource.pak', pak: true, entry: 'set/a.set' } : { ok: true, file: 'C:\\g\\mods\\mine\\resource\\set\\a.set' }; }
        return undefined;
      } });
    P.said = []; const say = P.IDE.status; P.IDE.status = t => { P.said.push(t || ''); return say(t); };
    P.St.mod = M; P.bx.as2Link('page:ide'); await P.flush(); await P.flush();
    const ex = () => P.B('explorer'), body = () => ex().all().find(e => cl(e, 'idx-body'));
    const X = () => { const r = ex() && ex().all().find(e => cl(e, 'idx')); return (r && r.idxApi) || null; };
    const items = () => body().children.filter(e => cl(e, 'idx-item'));
    const row = nm => items().find(e => { const n = e.all().find(x => cl(x, 'idx-name')); return n && n.textContent === nm; }) || null;
    const anywhere = () => (P.doc.body ? P.doc.body.all() : []).concat(P.sec.all());
    return { P, ex, body, X, items, row, anywhere, copies, reveals };
  };

  // ---- D1. merged rows: game file and game-only folder dimmed, game badge, pak name in the tooltip; the mod's own row as before
  {
    const A = await page();
    const g = A.row('g.set'), go = A.row('gameonly'), a = A.row('a.set');
    ok(!!g && cl(g, 'idx-game') && cl(g, 'idx-ro'), 'merged D1: a game file the mod does not replace is listed, dimmed and read-only', A.items().map(e => e.textContent).join('|'));
    ok(!!g && g.all().some(e => cl(e, 'idx-w-vanilla') && e.textContent === 'game'), 'merged D1: the game row has the "game" badge');
    ok(!!g && g.all().some(e => /resource\.pak/.test(e.getAttribute('title') || '')), 'merged D1: the pak name is in the row tooltip');
    ok(!!go && cl(go, 'idx-game') && !!a && !cl(a, 'idx-game'), 'merged D1: a game-only folder is dimmed; my own file is not');
    ok(/3 mod files, 1 game files in the open folders/.test(A.ex().textContent), 'merged D1: the count says n mod files, m game files', A.ex().textContent.slice(0, 200));
    ok(A.P.asked.some(r => r.path === '/api/x/ide/vdir' && r.q.under === '1' && r.q.vanilla === '1' && r.q.dir === 'set'), 'merged D1: the open folder asks only its own game files (vdir under=1)');
    // narrow column (about 125 px): the info line does not shrink under the rows, wraps, and the toggle has a line of its own
    const css0 = require('./ui/explorer').css, css = Array.isArray(css0) ? css0.join('\n') : String(css0), rule = s => (new RegExp('(^|\\n)' + s.replace(/[.>]/g, '\\$&') + '\\{([^}]*)\\}').exec(css) || [])[2] || '';
    const ic = rule('.idx-info'), mc = rule('.idx-mgbox');
    ok(/flex:0 0 auto/.test(ic) && /flex-wrap:wrap/.test(ic) && /overflow-wrap:anywhere/.test(ic) && /flex:1 1 100%/.test(mc), 'merged D1: narrow column: the info line keeps its height and wraps; the toggle and the count sit on separate lines', ic + ' | ' + mc);
    const infoEl = A.ex().all().find(e => cl(e, 'idx-info')), kids = infoEl ? infoEl.children.filter(e => e.tagName !== '#TEXT') : [];
    ok(kids.length >= 2 && cl(kids[0], 'idx-mgbox') && /mod files/.test(kids[1].textContent) && !/mod files/.test(kids[0].textContent), 'merged D1: the toggle label and the count are separate items of the info line', kids.map(e => e.textContent).join('|'));
    // the toggle: off -> no game rows, remembered; on again -> back
    const box = A.ex().all().find(e => cl(e, 'idx-mgbox')), cb = box && box.all().find(e => e.tagName === 'INPUT');
    ok(!!cb && cb.checked === true, 'merged D1: the toggle is shown and on (remembered from LS)');
    cb.checked = false; cb.fire('change'); await A.P.flush();
    ok(!A.row('g.set') && A.P.ls('ide.x.merged') === false && !!A.row('a.set'), 'merged D1: toggle off hides the game rows and is remembered');
    cb.checked = true; const cb2 = A.ex().all().find(e => cl(e, 'idx-mgbox')).all().find(e => e.tagName === 'INPUT'); cb2.checked = true; cb2.fire('change'); await A.P.flush(); await A.P.flush();
    ok(!!A.row('g.set') && A.P.ls('ide.x.merged') === true, 'merged D1: toggle on shows them again');
    // read-only open
    A.body().fire('click', { button: 0, target: A.row('g.set') }); await A.P.flush(); await A.P.flush();
    const d = A.P.IDE.active();
    ok(!!d && d.editable === false && A.P.asked.some(r => r.path === '/api/x/files/open' && r.q.key === 'resource/set/g.set' && r.q.idx === '0'), 'merged D2: a game row opens read-only (key + layer)', JSON.stringify(A.P.asked.slice(-4).map(r => r.url)) + A.P.said.join('|'));
    // copy into my mod from the row menu: the confirm card, then write
    A.body().fire('contextmenu', { target: A.row('g.set'), clientX: 10, clientY: 10 }); await A.P.flush();
    const mi = A.anywhere().find(e => cl(e, 'idx-mi') && e.textContent === 'Copy into my mod');
    ok(!!mi && mi.getAttribute('aria-disabled') !== 'true', 'merged D3: the game row menu offers Copy into my mod');
    if (mi) { mi.fire('click', { preventDefault() {} }); await A.P.flush(); await A.P.flush(); }
    const go2 = A.ex().all().find(e => cl(e, 'idx-primary'));
    if (go2) { go2.fire('click'); await A.P.flush(); await A.P.flush(); }
    ok(A.copies.length === 2 && !A.copies[0].write && A.copies[1].write === true && A.copies[1].key === 'resource/set/g.set' && A.copies[1].idx === 0, 'merged D3: Copy into my mod asks, then writes through files/copy', JSON.stringify(A.copies));
    // filter: game files that hold the word come after the mod's, as game rows
    const f = A.ex().all().find(e => cl(e, 'idx-filter'));
    f.value = 'g.set'; f.fire('input', {}); await A.P.flush(); await A.P.flush(); await A.P.flush();
    const names = A.items().map(e => e.textContent);
    ok(names.some(t => /resource\/set\/g\.set/.test(t)) && A.items().some(e => cl(e, 'idx-game')) && A.P.asked.some(r => r.path === '/api/x/ide/vfind' && r.q.under === '1'), 'merged D4: the filter lists the game files not overwritten (vfind under=1)', names.join('|'));
    ok(/Matches: 0 mod files, 1 game files/.test(A.ex().textContent), 'merged D4: the filter count says mod and game matches', A.ex().textContent.slice(0, 200));
    f.value = ''; f.fire('input', {}); await A.P.flush();
    // Go to file: the game file comes too, marked as a game file; choosing it opens it read-only
    A.P.IDE.run('gofile'); await A.P.flush();
    // the box sits in the searchKit wrapper (span.sk) inside the pick popup
    const inp = A.anywhere().find(e => e.tagName === 'INPUT' && (cl(e.parentNode, 'ide-pick') || (cl(e.parentNode, 'sk') && cl(e.parentNode.parentNode, 'ide-pick'))));
    if (inp) { inp.value = 'g.set'; inp.fire('input', {}); await A.P.flush(); await A.P.flush(); await A.P.flush(); }
    const pit = A.anywhere().filter(e => cl(e, 'ide-pick-it'));
    ok(pit.some(e => /resource\/set\/g\.set/.test(e.textContent) && /game file, read-only/.test(e.textContent)), 'merged D5: Go to file lists the game file not overwritten, marked as a game file', pit.map(e => e.textContent).join('|'));
    ok(A.P.writes().every(w => w.path === '/api/x/files/copy'), 'merged: nothing written but the confirmed copy');
  }

  // ---- C1. Open file location: Shift+Alt+R, a pak entry says the pak is shown; Show in the file list selects the row
  {
    const A = await page({ pak: true, ls: { 'ide.x.merged': false } });
    ok(A.P.IDE.actions.explorer && A.P.IDE.actions.explorer.key === 'Shift+Alt+R' && A.P.IDE.actions.explorer.group === 'file', 'reveal C1: Open file location is in the File group on Shift+Alt+R');
    ok(A.P.IDE.actions.revealList && A.P.IDE.actions.revealList.group === 'file', 'reveal C1: Show in the file list is an action of the File group');
    await A.P.open('resource/set/sub/b.set');
    A.P.doc.fire ? A.P.doc.fire('keydown', { key: 'R', shiftKey: true, altKey: true, target: A.body() }) : null;
    await A.P.flush();
    const byKey = A.reveals.length > 0;
    if (!byKey) { A.P.IDE.run('explorer'); await A.P.flush(); }
    ok(A.reveals.length === 1 && A.reveals[0].app === 'explorer' && A.reveals[0].rel === 'resource/set/sub/b.set', 'reveal C1: Open file location (' + (byKey ? 'Shift+Alt+R keydown' : 'the action') + ') asks the server to show the open file', JSON.stringify(A.reveals));
    ok(A.P.said.some(t => /inside resource\.pak: the pak is shown/.test(t)), 'reveal C1: a file inside a pak: the status says the pak is shown', A.P.said.join('|'));
    ok(!A.row('b.set'), 'reveal C2: b.set is in a closed folder before Show in the file list');
    A.P.IDE.run('revealList'); await A.P.flush(); await A.P.flush();
    ok(A.X().state().sel === 'm:resource/set/sub/b.set' && !!A.row('b.set') && A.row('b.set').getAttribute('aria-selected') === 'true', 'reveal C2: Show in the file list opens the folders and selects the file', A.X().state().sel);
  }

  // ---- C3. a phone (LAN Remote) has no Open file location
  {
    const P = await boot({ remote: true, files: { 'resource/a.set': '{a}' } });
    ok(!P.IDE.actions.explorer, 'reveal C3: no Open file location on a phone');
  }

  // ---- K1. searchKit Browse (seeded): Go to file and the file list filter open the file picker at the mod folder (disk); the pick
  // puts the path inside the mod in the box and opens that file
  {
    const A = await page({ ls: { 'ide.x.merged': false } }), SK = A.P.bx.searchKit, seen = [];
    const fake = (spec, done) => { seen.push(spec); done(M + '/resource/set/a.set', { view: 'disk', path: M + '/resource/set/a.set' }); };
    ok(typeof SK === 'function' && typeof SK.picker === 'function', 'browse K1: the page has searchKit and its picker');
    const keep = SK.picker; SK.picker = fake;
    try {
      A.P.IDE.run('gofile'); await A.P.flush();
      const inp = A.anywhere().find(e => e.tagName === 'INPUT' && e._sk && cl(e.parentNode, 'sk') && cl(e.parentNode.parentNode, 'ide-pick'));
      ok(!!inp, 'browse K1: Go to file has a searchKit box');
      if (inp) { inp._sk.browse(); await A.P.flush(); await A.P.flush(); }
      const s0 = seen[0] || {};
      ok(seen.length === 1 && s0.mode === 'file' && s0.view === 'disk' && s0.start === M && !s0.def, 'browse K1: Go to file Browse reaches the picker: file mode, disk, at the mod', JSON.stringify(seen));
      ok(A.P.asked.some(r => r.path === '/api/x/files/open'), 'browse K1: the Go to file pick opens the file', JSON.stringify(A.P.asked.slice(-3).map(r => r.url)));
      const f = A.ex().all().find(e => cl(e, 'idx-filter'));
      ok(!!f && !!f._sk, 'browse K1: the file list filter is a searchKit box');
      if (f && f._sk) { f._sk.browse(); await A.P.flush(); await A.P.flush(); }
      const s1 = seen[1] || {};
      ok(seen.length === 2 && s1.mode === 'file' && s1.view === 'disk' && s1.start === M, 'browse K1: the file list filter Browse reaches the picker: file mode, disk, at the mod', JSON.stringify(seen));
      ok(!!f && f.value === 'resource/set/a.set', 'browse K1: the pick puts the path inside the mod in the filter', f && f.value);
    } finally { SK.picker = keep; }
  }
};
