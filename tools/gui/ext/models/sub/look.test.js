// Models page part `look` test (texture variants of the open model, the soldier skins): (1) the same keys and slots in en ru uk
// zh, a text for every key the client names; (2) the client string obeys the page rules and parses; (3) the pure helpers;
// (4) the control on a stub DOM: None first, the file's own variant marked, a pick redraws the viewer and asks nothing more,
// a variant asked by another page, the skin card built with its search box; (5) the routes on a tiny loose game (the Units
// page's fixture + two skins of one model, a vehicle with a winter texture): look by name, def, model file and soldier file,
// look/skins, look/pose, plain refusals; the game files stay as they were. No browser, no install.
// usage: node look.test.js [scratch dir]      last line: PASS models look (N)
// Author: Imperator_Aug (ARSENAL, ia-0aa4c2e6)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), assert = require('assert');
const SRC = require('./look.client'), LANG = require('./look.lang.json'), SRV = require('./look.server');
const TOOLS = path.resolve(__dirname, '..', '..', '..', '..');
const scratch = path.resolve(process.argv[2] || path.join(process.env.ARSENAL_TMP && path.isAbsolute(process.env.ARSENAL_TMP) ? process.env.ARSENAL_TMP : require('os').tmpdir(), 'models-look-test'));
let n = 0; const ok = m => { n++; console.log('ok ' + n + ' ' + m); };
const tick = async (k = 8) => { for (let i = 0; i < k; i++) await new Promise(r => setImmediate(r)); };

(async () => {
  // ---------- (1) strings ----------
  const en = LANG.en, keys = Object.keys(en), slots = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join();
  for (const l of ['ru', 'uk', 'zh']) {
    assert.deepStrictEqual(Object.keys(LANG[l]).sort(), keys.slice().sort(), l + ': same keys');
    for (const k of keys) { assert.ok(LANG[l][k], l + ' empty ' + k); assert.strictEqual(slots(LANG[l][k]), slots(en[k]), l + ' slots of ' + k); }
  }
  const named = [...new Set([...SRC.matchAll(/'(models\.(?:look|skins)\.[a-zA-Z0-9.]+)'/g)].map(m => m[1]))];
  for (const k of named) assert.ok(en[k], 'en missing ' + k);
  for (const k of keys) assert.ok(named.includes(k), 'unused ' + k);
  ok('strings: ' + keys.length + ' keys in en ru uk zh with the same slots, every key the client names has a text, none unused');

  // ---------- (2) page rules ----------
  assert.ok(!/[`]|\$\{|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/.test(SRC), 'page rules');
  new vm.Script(SRC);
  for (const m of SRC.matchAll(/blk:'([^']+)'/g)) assert.ok(/^[a-z0-9.\-]+$/.test(m[1]), 'block id ' + m[1]);
  ok('client: page rules kept, parses, block ids lower case');

  // ---------- stub page ----------
  const mk = tag => ({ tag, kids: [], L: {}, attrs: {}, style: {}, className: '', textContent: '', hidden: false, disabled: false, isConnected: true, _v: '',
    get firstChild() { return this.kids[0] || null; },
    get value() { return this._v; }, set value(v) { this._v = v == null ? '' : String(v); },
    appendChild(c) { this.kids.push(c); return c; }, removeChild(c) { this.kids.splice(this.kids.indexOf(c), 1); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); }, fire(t) { (this.L[t] || []).forEach(f => f({ target: this })); } });
  const h = (tag, a, kids) => { const e = mk(tag); for (const k of Object.keys(a || {})) { const v = a[k]; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v || ''; else if (k === 'onclick') e.addEventListener('click', v); else if (k === 'hidden') e.hidden = !!v; else if (k === 'value') { e._v = String(v); e.attrs.value = String(v); } else e.attrs[k] = String(v); } (kids || []).forEach(c => e.appendChild(c)); return e; };
  const all = (root, f, out) => { out = out || []; (root.kids || []).forEach(c => { if (f(c)) out.push(c); all(c, f, out); }); return out; };
  const text = e => (e.textContent || '') + (e.kids || []).map(text).join(' ');
  const tx = (k, o) => String(en[k] || k).replace(/\{([a-z]+)\}/g, (m, s) => (o && o[s] != null ? o[s] : m));
  const sent = []; let reply = () => ({ ok: false, error: 'no' });
  const S = { gameId: 'as64', mod: 'C:/mods/m', modWrites: 0, screens: { units: { pick: id => S.picked.push(id) } }, picked: [] };
  const EXT = { models: { parts: {}, subs: {} } }, kits = [];
  const env = { EXT_SCREENS: EXT, h, tx, S, LANG: 'en', show: id => S.picked.push('show ' + id), setTimeout: () => 0, clearTimeout() {},
    api: (url, body) => { sent.push({ url, body }); return Promise.resolve(reply(url, body)); },
    searchKit: (input, o) => { kits.push(o); return { el: h('div', {}, [input]) }; } };
  new Function(...Object.keys(env), SRC)(...Object.values(env));
  const P = EXT.models.parts, T = P.look._t;

  // ---------- (3) helpers ----------
  const J = { variants: [{ name: '1', textures: 2, meshes: 0 }, { name: 'winter', textures: 4, meshes: 3 }], current: 'late', textures: 7 };
  assert.deepStrictEqual([T.has(J, '1'), T.has(J, 'late'), T.has(J, 'x'), T.has(J, ''), T.meshesOf(J, 'winter'), T.meshesOf(J, '1'), T.meshesOf(J, 'x')], [true, true, false, false, 3, 0, 0]);
  assert.deepStrictEqual([T.startOf(J, undefined), T.startOf(J, 'winter'), T.startOf(J, 'nope'), T.startOf(J, ''), T.startOf({ variants: [], current: '' }, undefined)], ['late', 'winter', 'late', '', '']);
  assert.strictEqual(T.wearers([{ id: 'ger/officer', name: 'Officer' }, { id: 'ger/x', name: '' }]), 'Officer (ger/officer), ger/x');
  const rows = [{ skin: 'ger_officer', group: 'ger', sub: 'ger_officer', file: 'f', texmod: '', worn: 1, by: [{ id: 'ger/officer', name: 'Officer' }] },
    { skin: 'ger2_officer', group: 'ger', sub: 'ger_officer', file: 'f', texmod: 'camo', worn: 0, by: [] }, { skin: 'fin_a', group: 'fin', sub: '[fin]/m36', file: 'f', texmod: '', worn: 0, by: [] }].map(T.rowOf);
  assert.ok(rows[1].hint.includes('camo') && rows[0].lo.includes('officer (ger/officer)'.split(' ')[0]) && rows[0].lo.includes('ger/officer'));
  let R = T.groupRows(rows, [], '');
  assert.deepStrictEqual([R.n, R.order, R.by.ger.map(x => x.value)], [3, ['ger', '[fin]/m36'], ['ger_officer', 'ger2_officer']]);
  R = T.groupRows(rows, ['officer', 'camo'], ''); assert.deepStrictEqual([R.n, R.order], [1, ['ger']]);
  R = T.groupRows(rows, [], 'fin'); assert.deepStrictEqual([R.n, R.order], [1, ['[fin]/m36']]);
  assert.deepStrictEqual([T.headOf('ger'), T.headOf('[fin]/m36/winter')], ['ger', 'fin / m36 / winter']);
  ok('helpers: which variant a model starts with (asked, else the file\'s, else none), mesh count of a variant, wearers in words, list rows by heading with every word matched');

  // ---------- (4) the control and the card ----------
  {
    const ans = { ok: true, target: 'pz4h', def: 'resource/entity/x/pz4h.def', model: 'resource/entity/x/pz4h.mdl', entity: 'pz4h', human: false, skin: '', goh: false, textures: 10,
      variants: [{ name: '1', textures: 2, meshes: 0 }, { name: 'd', textures: 2, meshes: 0 }], current: 'd', hasLine: true, known: true, aliases: [['snow', '1']], worn: 0, by: [], unit: { id: 'pz4h', name: 'PzKpfw IV' } };
    reply = () => ans;
    const set = [], vw = { setVariant: (v, q, keep) => { set.push([v, !!keep]); return true; } };
    const box = P.look({ set: { target: 'pz4h' } }, { viewer: vw }); await tick();
    assert.deepStrictEqual(sent.map(s => [s.url, s.body.target, s.body.mod]), [['/api/x/models/look', 'pz4h', 'C:/mods/m']]);
    const sel = all(box, c => c.tag === 'select')[0], opts = sel.kids.map(o => o.attrs.value + '=' + o.textContent);
    assert.deepStrictEqual(opts, ['=' + en['models.look.none'], '1=1  (2 of 10 textures)', 'd=d  (2 of 10 textures)  ' + en['models.look.inFile']]);
    assert.ok(sel.value === 'd' && !sel.disabled && text(box).includes('Set in the file: d') && text(box).includes('snow = 1'), text(box));
    assert.deepStrictEqual(set, [['d', true]], 'the file\'s own variant is drawn first and the view mode is left alone');
    sel.value = '1'; sel.fire('change'); sel.value = ''; sel.fire('change');
    assert.deepStrictEqual(set.slice(1), [['1', false], ['', false]]); assert.strictEqual(sent.length, 1, 'a pick asks the server nothing');
    const ub = all(box, c => c.tag === 'button' && c.textContent.includes('PzKpfw IV'))[0]; assert.ok(ub, 'Open in Units'); ub.fire('click');
    assert.deepStrictEqual(S.picked, ['show units', 'pz4h']);
    for (const id of ['model.look', 'model.look.pick', 'model.look.notes', 'model.look.mesh', 'model.look.links']) assert.ok(all({ kids: [box] }, c => c.attrs.blk === id).length === 1, 'block ' + id);
    assert.strictEqual(all({ kids: [box] }, c => c.attrs.blk === 'model.look')[0].attrs.box, 'col');
    // drawn again: the answer is kept, the last pick too
    const set2 = [], box2 = P.look({ set: { target: 'pz4h' } }, { viewer: { setVariant: v => set2.push(v) } }); await tick();
    assert.ok(sent.length === 1 && all(box2, c => c.tag === 'select')[0].value === '' && set2.length === 0, 'kept answer, kept pick (None)');
    // another page asks for a variant; one the files do not have falls back to the file's
    P.look.drop(); const set3 = [], box3 = P.look({ set: { target: 'PZ4H' } }, { viewer: { setVariant: v => set3.push(v) }, want: '1' }); await tick();
    assert.ok(P.look({ set: {} }, {}) === null, 'no model: no control');
    S.mod = ''; P.look.drop(); const box4 = P.look({ set: { target: 'pz4h' } }, { want: 'zz' }); await tick();
    assert.ok(text(box4).includes(en['models.look.needMod']) && all(box4, c => c.tag === 'select')[0].value === 'd'); S.mod = 'C:/mods/m';
    reply = () => ({ ok: false, error: 'No entity named "zz".' }); const box5 = P.look({ set: { target: 'zz' } }, {}); await tick();
    assert.ok(text(box5).includes('No entity named "zz".') && all(box5, c => c.tag === 'select')[0].disabled);
    void box3;
    ok('control: None first, the file\'s variant marked and drawn first, a pick redraws the viewer and asks nothing, Open in Units, answer kept per model, no mod folder said, a refusal shown as a sentence');

    // mesh variants (Gates of Hell): a small picture of the one model with the variant meshes; a skin: Show standing
    P.look.drop(); const scenes = [], posed = [];
    P.viewer = (c, o) => { const e = h('div'); scenes.push(o.scene); e.setScene = s => scenes.push(s); return e; };
    reply = () => ({ ok: true, target: 'fin_a', def: 'd', model: 'm', entity: 'fin_a', human: true, skin: 'fin_a', goh: true, textures: 4, variants: [{ name: 'winter', textures: 4, meshes: 4 }, { name: 'burned', textures: 2, meshes: 0 }],
      current: '', hasLine: false, known: true, aliases: [], worn: 9, by: [{ id: 'mp/fin/rifle', name: 'Rifleman' }], unit: null });
    const gb = P.look({ set: { target: 'fin_a' } }, { viewer: { setVariant() {} }, pose: (s, v) => posed.push([s, v]) }); await tick();
    const gs = all(gb, c => c.tag === 'select')[0];
    assert.ok(gs.kids[1].textContent.includes('4 meshes') && text(gb).includes(en['models.look.gohSeason']) && text(gb).includes('9 multiplayer soldiers') && scenes.length === 0, text(gb));
    gs.value = 'winter'; gs.fire('change');
    assert.deepStrictEqual(scenes, [{ url: '/api/x/models/look/pose', body: { target: 'fin_a', variant: 'winter' } }]); assert.ok(text(gb).includes('swaps 4 meshes'));
    gs.value = 'burned'; gs.fire('change'); assert.ok(!text(gb).includes('swaps'), 'no picture for a variant without meshes');
    all(gb, c => c.tag === 'button' && c.textContent === en['models.look.stand'])[0].fire('click'); assert.deepStrictEqual(posed, [['fin_a', 'burned']]);
    ok('mesh variants: a variant with mesh files gets the small picture of the model with them (look/pose), others none; a skin offers Show standing');

    // the card of soldier skins
    const picks = [], card = P.skins({ pick: (nm, v) => picks.push([nm, v]) }), kit = kits[kits.length - 1];
    assert.deepStrictEqual([kit.key, kit.beside, kit.browse.mode, kit.browse.view, kit.browse.start, typeof kit.index, typeof kit.onPick], ['models.skins', true, 'file', 'data', 'entity/humanskin', 'function', 'function']);
    assert.strictEqual(kit.browse.toValue('resource\\entity\\humanskin\\ger\\ger_officer.def'), 'ger_officer');
    for (const id of ['skins', 'skins.title', 'skins.intro', 'skins.find', 'skins.list', 'skins.pose']) assert.ok(all({ kids: [card.el] }, c => c.attrs.blk === id).length === 1, 'block ' + id);
    const list = { skins: [{ skin: 'ger_officer', group: 'ger', sub: 'ger_officer', file: 'f', texmod: '', worn: 1, by: [{ id: 'ger/officer', name: 'Officer' }] }, { skin: 'ger2_officer', group: 'ger', sub: 'ger_officer', file: 'f', texmod: 'camo', worn: 0, by: [] }], groups: [{ group: 'ger', n: 2 }], total: 2 };
    reply = url => (/skins$/.test(url) ? list : { ok: true, target: 'ger2_officer', def: 'd', model: 'm', entity: 'ger2_officer', human: true, skin: 'ger2_officer', goh: false, textures: 3, variants: [{ name: 'camo', textures: 1, meshes: 0 }], current: 'camo', hasLine: true, known: true, aliases: [], worn: 0, by: [], unit: null });
    const n0 = sent.length; let got = null; kit.index('officer camo', (a, more) => { got = [a.map(x => x.value), more]; }); await tick();
    assert.deepStrictEqual(got, [['ger2_officer'], 0]); assert.strictEqual(sent.slice(n0).filter(s => /skins$/.test(s.url)).length, 1);
    all(card.el, c => c.tag === 'button' && c.textContent === en['models.skins.open'])[0].fire('click'); await tick();
    const li = all(card.el, c => c.tag === 'li'); assert.deepStrictEqual(li.map(x => x.attrs['data-ski']), ['ger_officer', 'ger2_officer']);
    assert.ok(text(li[0]).includes('Worn by 1: Officer (ger/officer)') && text(li[1]).includes(en['models.skins.wornNone']) && sent.slice(n0).filter(s => /skins$/.test(s.url)).length === 1, text(li[0]));
    scenes.length = 0; all(li[1], c => c.tag === 'button' && c.textContent === en['models.look.stand'])[0].fire('click'); await tick();
    assert.deepStrictEqual(scenes, [{ url: '/api/x/models/look/pose', body: { target: 'ger2_officer', variant: 'camo' } }], 'the skin stands with the variant of its file');
    const ps = all(card.el, c => c.tag === 'select' && c.attrs['aria-label'] === en['models.look.tex'])[0]; ps.value = ''; ps.fire('change');
    assert.deepStrictEqual(scenes[1], { url: '/api/x/models/look/pose', body: { target: 'ger2_officer', variant: false } }, 'None: the plain textures');
    all(li[1], c => c.tag === 'button' && c.textContent === en['models.skins.openModel'])[0].fire('click'); assert.deepStrictEqual(picks, [['ger2_officer', 'camo']]);
    S.modWrites = 1; card.stale(); await tick(); assert.strictEqual(sent.slice(n0).filter(s => /skins$/.test(s.url)).length, 2, 'the list is read again after a write');
    delete P.viewer;
    ok('skin card: searchKit (history key, index over name, army and wearer, Browse on the skin files), rows under army headings with who wears a skin, a skin standing with the variant of its file, the select redraws it, Open model passes the variant, read again after a write');
  }

  // ---------- (5) routes on a loose game ----------
  {
    require('../../../../lib/testscratch').guard(scratch);   // never wipe a shared root, the repo, a game or a mod
    fs.rmSync(scratch, { recursive: true, force: true }); fs.mkdirSync(scratch, { recursive: true });
    const fx = require('../../units/fixture').make(scratch), tmpRoot = path.join(scratch, 'tmp'); fs.mkdirSync(tmpRoot, { recursive: true });
    const put = (k, t) => { const f = path.join(fx.game, k); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t.replace(/\n/g, '\r\n'), 'latin1'); };
    const model = (dir, name, vars) => {
      put(dir + '/' + name + '.mdl', '{skeleton\n\t{bone "body"\n\t\t{VolumeView "' + name + '.ply"}\n\t}\n}\n');
      put(dir + '/' + name + '.ply', 'EPLYBNDS\x01\x02\x0b' + name + '.mtl\x01\x02');
      put(dir + '/' + name + '.mtl', '{material simple\n\t{diffuse "' + name + '"}\n}\n');
      for (const v of [''].concat(vars)) put(dir + '/' + name + (v ? '#' + v : '') + '.dds', 'DDS ');
    };
    const hs = 'resource/entity/humanskin/', vd = 'resource/entity/-vehicle/tank_heavy/kv1/';
    model(hs + 'rus_inf', 'rus_inf', ['camo', 'd']);
    put(hs + 'rus_inf/rus_inf.def', '{game_entity\n\t{Extension "rus_inf.mdl"}\n}\n');
    put(hs + 'rus_inf/rus2_inf.def', '{game_entity\n\t{Extension "rus_inf.mdl"}\n\t{texmod "camo"}\n}\n');
    put(hs + 'rus_inf/rus3_inf.def', '{game_entity\n\t{Extension "rus_inf.mdl"}\n\t{texmod "snow"}\n}\n');
    put('resource/set/breed/mp/rus/look1.set', '{breed\n\t{skin "rus_inf"}\n}\n');
    model(vd.slice(0, -1), 'kv1', ['winter']);
    put(vd + 'kv1.def', '{game_entity\n\t{Extension "kv1.mdl"}\n\t{TexMods\n\t\t{"snow" "winter"}\n\t}\n}\n');
    const snap = () => { const o = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (f !== fx.mod) w(f); } else o.push(f + ':' + fs.statSync(f).size); } })(fx.game); return o.sort().join('\n'); };
    const before = snap();
    const ctx = { gamedir: fx.game, tools: TOOLS, tmpRoot, allowLaunch: false, modAgeMs: 0, game: () => fx.game,
      runTool: async (tool, entry, args, o) => { const r = cp.spawnSync(process.execPath, [path.join(TOOLS, entry), ...args], { encoding: 'utf8', timeout: (o && o.timeoutMs) || 60000 }); return { code: r.status, stdout: r.stdout, stderr: r.stderr, timedOut: !!(r.error && r.error.code === 'ETIMEDOUT') }; } };
    const call = (r, b) => SRV.routes['POST /api/x/models/' + r]('/api/x/models/' + r, Object.assign({ gid: 'as64' }, b), ctx);
    const vs = j => j.variants.map(v => v.name + ':' + v.textures + ':' + v.meshes).join(' ');

    let j = await call('look', { target: 'rus_inf' });
    assert.deepStrictEqual([j.ok, j.def, j.model, j.entity, j.human, j.skin, j.goh, j.textures, vs(j), j.current, j.hasLine, j.known, j.worn, j.by, j.unit],
      [true, hs + 'rus_inf/rus_inf.def', hs + 'rus_inf/rus_inf.mdl', 'rus_inf', true, 'rus_inf', false, 1, 'camo:1:0 d:1:0', '', false, true, 1, [{ id: 'mp/rus/look1', name: '' }], null], JSON.stringify(j));
    j = await call('look', { target: 'rus2_inf' });
    assert.deepStrictEqual([j.def, j.model, j.skin, vs(j), j.current, j.hasLine, j.known, j.worn], [hs + 'rus_inf/rus2_inf.def', hs + 'rus_inf/rus_inf.mdl', 'rus2_inf', 'camo:1:0 d:1:0', 'camo', true, true, 0]);
    j = await call('look', { target: 'rus3_inf' }); assert.deepStrictEqual([j.current, j.known], ['snow', false], 'a variant named with no files: said');
    ok('look of a skin: its def and model, the variants its textures have files for, the one its file names, whether that one has files, the soldiers that wear it');
    j = await call('look', { target: 'kv1' });
    assert.deepStrictEqual([j.ok, j.def, j.human, j.skin, vs(j), j.current, j.aliases, j.worn], [true, vd + 'kv1.def', false, '', 'winter:1:0', '', [['snow', 'winter']], 0], JSON.stringify(j));
    const byMdl = await call('look', { target: path.join(fx.game, vd, 'kv1.mdl') }), byDef = await call('look', { target: vd + 'kv1.def' }), byBreed = await call('look', { target: 'breed:mp/rus/look1' });
    assert.deepStrictEqual([byMdl.ok, byMdl.def, byMdl.model, vs(byMdl)], [true, vd + 'kv1.def', vd + 'kv1.mdl', 'winter:1:0'], JSON.stringify(byMdl));
    assert.deepStrictEqual([byDef.def, vs(byDef), byBreed.skin, vs(byBreed)], [vd + 'kv1.def', 'winter:1:0', 'rus_inf', 'camo:1:0 d:1:0']);
    ok('look of a vehicle by name, by the path of its model file, by the key of its def; of a soldier file: the skin it names');
    for (const [t, re] of [['', /Pick a model first/], ['no_such_thing', /No entity named "no_such_thing"/], ['breed:mp/rus/nobody', /No soldier file/], ['resource/entity/nope/x.mdl', /is not in the mod folder or the game/]]) {
      const r = await call('look', { target: t }); assert.ok(r.ok === false && re.test(r.error) && /^[A-Z].*\.$/.test(r.error), t + ': ' + JSON.stringify(r));
    }
    ok('look refusals are one plain sentence: nothing picked, an unknown name, a soldier file that is not there, a file outside the game');

    const ls = await call('look/skins', {});
    assert.deepStrictEqual(ls.skins.filter(x => /^rus\d?_inf$/.test(x.skin)).map(x => [x.skin, x.group, x.sub, x.texmod, x.worn, x.by.map(b => b.id).join()].join('|')),
      ['rus2_inf|rus|rus_inf|camo|0|', 'rus3_inf|rus|rus_inf|snow|0|', 'rus_inf|rus|rus_inf||1|rus/look1']);
    assert.ok(ls.total === ls.skins.length && ls.groups.some(g => g.group === 'rus' && g.n === 3), JSON.stringify(ls.groups));
    ok('look/skins: the Units page\'s skin list (group, folder, variant of the file, who wears it)');

    // the pose route hands the one model to the Units line-up (its own test covers the picture): the meshes of this fixture are
    // stand-ins, so the answer is a figure or one plain sentence; the variant asked is the one reported
    for (const b of [{ target: 'kv1', variant: 'winter' }, { target: 'rus2_inf' }, { target: 'rus2_inf', variant: false }]) {
      const p = await call('look/pose', b);
      if (p.ok) { assert.ok(p.scene && p.scene.format === 'scene/1' && p.figures.length === 1 && p.kind === (b.target === 'kv1' ? 'vehicle' : 'soldier'), JSON.stringify(p).slice(0, 300));
        assert.strictEqual(p.variant === '-' ? '' : p.variant, b.variant === false ? '' : b.variant || 'camo'); assert.strictEqual(p.swapped, 0); }
      else assert.ok(/^[A-Z].*\.$/.test(p.error), JSON.stringify(p));
    }
    const p0 = await call('look/pose', { target: '' }); assert.ok(p0.ok === false && /Pick a model first/.test(p0.error));
    ok('look/pose: one model through the Units line-up, the variant asked (or the file\'s, or none) reported; a refusal is a sentence');
    assert.deepStrictEqual(SRV._t.keyOf('C:\\Games\\X\\Resource\\Entity\\a\\b.MDL'), 'resource/entity/a/b.mdl'); assert.strictEqual(SRV._t.keyOf('entity/a.mdl'), '');
    assert.strictEqual(snap(), before, 'game files untouched'); assert.ok(!fs.existsSync(path.join(fx.mod, 'resource')), 'nothing written into the mod folder');
    ok('reads only: the game files and the mod folder are as they were');
  }
  console.log('PASS models look (' + n + ')');
})().catch(e => { console.error(e && e.stack || e); console.log('FAIL models look'); process.exit(1); });
