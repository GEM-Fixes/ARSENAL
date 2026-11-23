// Bots part modeready test. Arg: scratch dir. No game, no network: a seeded AS64 install (mode cards with and without {enableBots},
// a combat card, a team card) and a seeded mod in <game>/mods, a seeded GoH install; the list rows and their why lines, the allow route
// (preview writes nothing, write adds {enableBots} with CRLF kept), undo (exact bytes, copy removed, refused after a change), the refusals,
// and the client in the page fake DOM (block rules, rows with plain words, IDs only in Details, preview under its row, write, undo).
// Author: Imperator_Aug (ARSENAL, ia-40c6c1da)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const modInfo = d => { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'mod.info'), '{mod\r\n\t{name "test"}\r\n}\r\n'); return d; };   // a real mod folder holds mod.info (the write guard asks for it)
const work = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'modeready-')));
require('../../../../../lib/testscratch').guard(work);   // never wipe a shared root, the repo, a game or a mod
fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
const P = require('./index'), check = require('../index').check;
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log('FAIL ' + m); } };

(async () => {
  ok(check('modeready', P) === '', 'contract: ' + check('modeready', P));
  ok(P.group === 'C' && P.order === 10, 'group C, order 10');
  for (const r of P.lang) ok(r.length === 5 && r.slice(1).every(s => typeof s === 'string' && s.trim()) && r.slice(2).every(s => s !== r[1]), 'four languages, translated: ' + r[0]);
  const en = {}; P.lang.forEach(r => { en[r[0]] = r[1]; });

  // ---- seeded AS64 install + a mod in <game>/mods
  const G = 'resource/set/multiplayer/games/';
  const txt = lines => lines.join('\r\n') + '\r\n';
  const put = (root, rel, lines) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt(lines), 'latin1'); };
  const game = path.join(work, 'game'), mod = path.join(game, 'mods', 'my_mod'); modInfo(mod);
  put(game, G + 'combat.set', ['{game', '\t{teammatch}', '\t{settings', '\t\t{options scoreFinal}', '\t}', '}']);
  put(game, G + 'battle_zones.set', ['{game', '\t{armySelectionMode team}', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
  put(game, G + 'captureflag.set', ['{game', '\t{teammatch}', '\t{settings', '\t}', '}']);
  put(game, G + 'frontline.set', ['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
  fs.writeFileSync(path.join(game, 'as64.exe'), '');
  put(mod, G + 'mymode.set', ['{game', '\t{class combat}', '\t{order 100}', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
  const ctx = { game: () => game, gameId: () => 'as64', kind: () => 'as2', allowLaunch: false, gamedir: game, tools: path.join(__dirname, '..', '..', '..', '..', '..'), tmpRoot: work,
    runTool: async () => { throw new Error('no tool runs here'); } };
  const U = q => ({ searchParams: new URLSearchParams(q || '') });
  const R = P.routes;

  const l = await R['GET /api/x/bots/modeready/list'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  const by = m => l.rows.find(r => r.mode === m), ks = r => (r ? r.why.map(w => w.k) : []);
  ok(l.gid === 'as64' && l.mod && !l.modWhy, 'list: as64, mod read');
  ok(by('battle_zones') && by('battle_zones').bots === true && by('battle_zones').armyMode === 'team' && ks(by('battle_zones')).join() === 'bots.modeready.why.on', 'battle_zones: bots on, team armies, one why line');
  ok(by('captureflag') && by('captureflag').bots === false && ks(by('captureflag'))[0] === 'bots.modeready.why.off', 'captureflag: bots off (TST-03)');
  ok(by('combat') && by('combat').bots === false && ks(by('combat')).includes('bots.modeready.why.combat'), 'combat: bots off, the MIS-65/MIS-71 line');
  ok(by('frontline') && ks(by('frontline')).includes('bots.modeready.why.alliance') && by('frontline').armyMode === null, 'frontline: bots on, no team armies (MIS-37 line)');
  ok(by('mymode') && by('mymode').bots === true && ks(by('mymode')).includes('bots.modeready.why.fromMod') && ks(by('mymode')).includes('bots.modeready.why.combat'), 'mymode: the mod\'s card allows bots, plays like combat');
  ok(!l.rows.some(r => r.why.some(w => w.k === 'modes.w.combat')), 'the Game Modes combat warning is replaced by ours');
  ok(P._t.armyModeOf('{game\r\n\t{armySelectionMode "Team"}') === 'team' && P._t.armyModeOf('{game}') === null, 'armyModeOf');
  // a mod outside <game>/mods: the game alone, with the reason
  const lo = await R['GET /api/x/bots/modeready/list'](U('mod=' + encodeURIComponent(path.join(game, 'resource'))), null, ctx);
  ok(lo.modWhy && !lo.mod && !lo.rows.some(r => r.mode === 'mymode'), 'a mod inside the game install (not mods/) is not read: ' + lo.modWhy);
  // refusals
  let e = null; try { await R['GET /api/x/bots/modeready/list'](U(''), null, Object.assign({}, ctx, { game: () => null })); } catch (x) { e = x; }
  ok(e && e.message === 'bots.modeready.e.nogame' && en[e.message], 'no game folder: lang key');
  e = null; try { await R['POST /api/x/bots/modeready/allow'](null, { mode: 'captureflag' }, ctx); } catch (x) { e = x; }
  ok(e && e.message === 'bots.modeready.e.needmod', 'allow without a mod refused');

  // ---- allow: preview writes nothing, write copies the card and adds {enableBots}, CRLF kept
  const mf = path.join(mod, ...(G + 'captureflag.set').split('/'));
  const pv = await R['POST /api/x/bots/modeready/allow'](null, { mod, mode: 'captureflag', write: false }, ctx);
  ok(pv.ok && pv.state === 'added' && pv.copy === true && !fs.existsSync(mf), 'preview: added + copy planned, nothing written');
  const wr = await R['POST /api/x/bots/modeready/allow'](null, { mod, mode: 'captureflag', write: true }, ctx);
  const wt = fs.existsSync(mf) ? fs.readFileSync(mf, 'latin1') : '';
  ok(wr.ok && wr.state === 'added' && /\{enableBots\}/.test(wt) && !/[^\r]\n/.test(wt), 'write: {enableBots} in the mod copy, CRLF kept');
  const l2 = await R['GET /api/x/bots/modeready/list'](U('mod=' + encodeURIComponent(mod)), null, ctx);
  ok(l2.rows.find(r => r.mode === 'captureflag').bots === true && l2.rows.find(r => r.mode === 'captureflag').from !== 'game', 'after the write the list shows bots on, card from the mod');
  ok((await R['POST /api/x/bots/modeready/allow'](null, { mod, mode: 'captureflag', write: false }, ctx)).state === 'present', 'present after the write');
  const vanilla = fs.readFileSync(path.join(game, ...(G + 'captureflag.set').split('/')), 'latin1');
  ok(!/enableBots/.test(vanilla), 'game card untouched');

  // ---- GoH: value form {enableBots 1} on, {enableBots 0} off, its own why line
  const goh = path.join(work, 'goh');
  put(goh, G + 'battle_zones.set', ['{game', '\t{settings', '\t\t{enableBots 1}', '\t}', '}']);
  put(goh, G + 'evacuation.set', ['{game', '\t{settings', '\t\t{enableBots 0}', '\t}', '}']);
  fs.mkdirSync(path.join(goh, 'binaries', 'x64'), { recursive: true }); fs.writeFileSync(path.join(goh, 'binaries', 'x64', 'call_to_arms.exe'), '');
  const gctx = Object.assign({}, ctx, { gameId: () => 'goh', kind: () => 'goh', gohDir: () => goh, curDir: () => goh });
  const lg = await R['GET /api/x/bots/modeready/list'](U(''), null, gctx);
  const gb = m => lg.rows.find(r => r.mode === m);
  ok(lg.kind === 'goh' && gb('battle_zones') && gb('battle_zones').bots === true && gb('evacuation') && gb('evacuation').bots === false, 'goh: {enableBots 1} on, {enableBots 0} off');
  ok(gb('evacuation') && gb('evacuation').why[0].k === 'bots.modeready.why.offGoh' && !gb('evacuation').why.some(w => /alliance|combat/.test(w.k)), 'goh: its own off line, no AS2 lines');
  e = null; try { await R['GET /api/x/bots/modeready/list'](U(''), null, Object.assign({}, gctx, { gohDir: () => null, curDir: () => null })); } catch (x) { e = x; }
  ok(e && e.message === 'bots.modeready.e.nogoh', 'goh without its folder: lang key');

  // ---- undo of Allow bots: the exact bytes back (a card the mod had), the copy removed (a card the game had); refused after a change by hand
  {
    const mu = path.join(game, 'mods', 'mod_undo'); modInfo(mu);
    put(mu, G + 'frontline.set', ['{game', '\t{settings', '\t}', '\t-- mine \xe9', '}']);
    const fu = path.join(mu, ...(G + 'frontline.set').split('/')), cu = path.join(mu, ...(G + 'captureflag.set').split('/'));
    const before = fs.readFileSync(fu);
    const w1 = await R['POST /api/x/bots/modeready/allow'](null, { mod: mu, mode: 'frontline', write: true }, ctx);
    ok(w1.ok && w1.undo === true && /enableBots/.test(fs.readFileSync(fu, 'latin1')), 'undo: Allow bots on the mod\'s own card offers Undo');
    const u1 = await R['POST /api/x/bots/modeready/undo'](null, { mod: mu, mode: 'frontline' }, ctx);
    ok(u1.ok && u1.action === 'restored' && Buffer.compare(before, fs.readFileSync(fu)) === 0, 'undo: exact bytes of the mod\'s card back ' + JSON.stringify(u1));
    e = null; try { await R['POST /api/x/bots/modeready/undo'](null, { mod: mu, mode: 'frontline' }, ctx); } catch (x) { e = x; }
    ok(e && e.message === 'bots.modeready.e.noUndo' && en[e.message], 'undo twice: nothing to undo');
    await R['POST /api/x/bots/modeready/allow'](null, { mod: mu, mode: 'captureflag', write: true }, ctx);
    const u2 = await R['POST /api/x/bots/modeready/undo'](null, { mod: mu, mode: 'captureflag' }, ctx);
    ok(u2.action === 'deleted' && !fs.existsSync(cu), 'undo: the copied game card removed again ' + JSON.stringify(u2));
    await R['POST /api/x/bots/modeready/allow'](null, { mod: mu, mode: 'captureflag', write: true }, ctx);
    fs.appendFileSync(cu, '-- by hand\r\n');
    e = null; try { await R['POST /api/x/bots/modeready/undo'](null, { mod: mu, mode: 'captureflag' }, ctx); } catch (x) { e = x; }
    ok(e && /^bots\.modeready\.e\.changed /.test(e.message) && /by hand/.test(fs.readFileSync(cu, 'latin1')), 'undo after a change by hand: refused, file kept ' + (e && e.message));
    ok(by('captureflag').plain.join() === 'bots.modeready.p.off' && by('mymode').plain.includes('bots.modeready.p.combat') && by('frontline').plain.includes('bots.modeready.p.alliance'), 'rows carry plain lines');
  }

  // ---- client in the page fake DOM (the page's own h(), block rules): rows, plain words, preview under its row, write, done box, undo
  const BC = require(path.join(__dirname, '..', '..', '..', '..', 'test', 'blockcheck')), FDP = require(path.join(__dirname, '..', '..', '..', '..', 'test', 'fakedom'));
  const doc = FDP.make(), pf = BC.pageFns(doc), h = pf.h, asks = [], shown = [], gone = [], changedN = [];
  const tx = (k, p) => { const s = en[k] != null ? en[k] : k; return p ? s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))) : s; };
  const parts = [], pend = [];
  new Function('BOTS_PARTS', 'h', 'tx', 'show', 'askDo', 'BOTS_UI', 'document', P.script)(parts, h, tx, p => shown.push(p), o => { asks.push(o); return { then: cb => cb(true) }; }, { changed: w => changedN.push(w) }, doc);
  ok(parts.length === 1 && parts[0].id === 'modeready' && parts[0].group === 'C', 'client pushes one part');
  ok(parts[0].title() === en['bots.modeready.title'], 'title');
  const mod2 = path.join(game, 'mods', 'mod_two'); fs.mkdirSync(mod2, { recursive: true }); modInfo(mod2);
  const api = (m, p, d, cb) => { const key = m + ' /api/x/bots/' + p, body = Object.assign({ mod: mod2 }, d || {});
    pend.push(Promise.resolve().then(() => R[key](U(m === 'GET' ? 'mod=' + encodeURIComponent(mod2) : ''), m === 'GET' ? null : body, ctx)).then(j => cb(null, j), x => cb(x.message))); };
  const flush = async () => { for (let i = 0; i < 8; i++) { while (pend.length) await pend.shift(); await new Promise(r => setImmediate(r)); } };
  const kit = { section: (id, t, kids) => h('div', { blk: id, box: 'col', 'data-blkname': t }, [h('div', { blk: id + '.title' }, [h('h3', { text: t })])].concat(kids)),
    leaf: (id, kids, name) => h('div', name ? { blk: id, 'data-blkname': name } : { blk: id }, kids), hint: (id, t) => h('div', { blk: id }, [h('div', { class: 'hint', text: t })]),
    errBox: m => h('div', { class: 'err', text: m }) };
  const root = doc.createElement('div'); root.setAttribute('data-blkroot', 'bots');
  parts[0].draw({ mod: mod2, gid: 'as64', kit, api, reload() {}, go: id => gone.push(id) }).forEach(el => root.appendChild(el));
  await flush();
  const probs = BC.checkScreen(root, 'bots');
  ok(probs.length === 0, 'client: block rules ' + probs.slice(0, 6).join(' | '));
  const rowsEl = () => root.all().filter(n => n.getAttribute && /^bots\.modeready\.m\.[a-z0-9-]+$/.test(n.getAttribute('data-blk') || ''));
  ok(rowsEl().length === 4 && root.has(en['bots.modeready.lead']) && !root.all().some(n => n.tagName === 'TABLE'), 'client: one row block per mode (4 game modes), no table: ' + rowsEl().length);
  const rowOfM = m => rowsEl().find(r => r.getAttribute('data-mode') === m);
  const inDetails = n => { for (; n; n = n.parentNode) if (n.tagName === 'DETAILS') return true; return false; };
  const shownText = el => el.all().filter(n => !n.children.length && !inDetails(n)).map(n => n.textContent).join(' ');
  ok(!/enableBots|TST-|MIS-/.test(shownText(root)) && /\{enableBots\}/.test(root.textContent), 'client: {enableBots} and the IDs only inside Details folds');
  ok(rowOfM('combat') && rowOfM('combat').has(en['bots.modeready.p.combatOff']) && !/plays like combat/.test(root.textContent), 'client: combat in plain words');
  const rowBtns = m => (rowOfM(m).all().find(n => n.getAttribute && n.getAttribute('data-btns') === m) || { children: [] }).children;
  const actOf = (m, a) => rowOfM(m).all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-act') === a);
  const cfB = rowBtns('captureflag');
  // round 4: one row per mode with one main button (Preview); Write into my mod and Undo under More options (folded until a Preview or an Undo to offer)
  const moreOf = m => rowOfM(m).all().find(n => n.tagName === 'DETAILS' && n.getAttribute('data-more') === m);
  const cfMain = cfB.filter(n => n.tagName === 'BUTTON'), cfMore = moreOf('captureflag') ? moreOf('captureflag').all().filter(n => n.tagName === 'BUTTON') : [];
  ok(cfMain.length === 1 && cfMain[0].textContent === en['bots.modeready.preview'] && !cfMain[0].disabled && cfB.some(n => n.textContent === 'Capture the Flag' || n.tagName === 'B') && !rowBtns('battle_zones').length && !moreOf('battle_zones'),
    'client: one row per mode: its name, yes/no and the one main button Preview; none on a row bots already join');
  ok(cfMore.length === 2 && cfMore[0].textContent === en['bots.modeready.write'] && cfMore[1].textContent === en['bots.modeready.undo'] && cfMore[0].disabled && cfMore[1].disabled && cfMore[1].getAttribute('title') === en['bots.modeready.undoNone'] && !moreOf('captureflag').open && moreOf('captureflag').children[0].textContent === 'More options',
    'client: Write into my mod and Undo sit under More options, folded and greyed at first');
  ok(!rowOfM('captureflag').all().filter(n => !n.children.length && !inDetails(n)).some(n => /captureflag/.test(n.textContent)) && rowOfM('captureflag').has('Mode code: captureflag'), 'client: the mode code only in Details (S20)');
  actOf('captureflag', 'preview').click(); await flush();
  const mf2 = path.join(mod2, ...(G + 'captureflag.set').split('/'));
  const cfOut = () => rowOfM('captureflag').all().find(n => n.getAttribute && n.getAttribute('data-blk') === 'bots.modeready.m.captureflag.out');
  { const a0 = asks.length, bw = root.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-act') === 'write' && n.disabled);   // a row with no Preview shown yet
    if (bw) { bw.disabled = false; bw.click(); await flush(); }
    ok(bw && asks.length === a0, 'client: Write with no Preview of that row does nothing, even when the click gets through'); }
  const writeBtn = actOf('captureflag', 'write');
  ok(moreOf('captureflag').open, 'client: a Preview opens More options so Write into my mod is in view');
  ok(writeBtn && !writeBtn.disabled && !fs.existsSync(mf2) && cfOut().has(en['bots.modeready.copy']) && cfOut().has('After writing, bots can join'), 'client: the preview opens under its own row, nothing written');
  writeBtn.click(); await flush(); await flush();
  ok(asks.length === 1 && asks[0].danger && fs.existsSync(mf2) && /enableBots/.test(fs.readFileSync(mf2, 'latin1')), 'client: write asks first, then writes');
  ok(rowOfM('captureflag') && rowOfM('captureflag').has(en['bots.modeready.yes']) && cfOut().has('Done: bots can join') && cfOut().has(en['bots.modeready.next']) && changedN.includes('modeready') && !cfOut().all().some(n => n.tagName === 'BUTTON' && n.textContent === en['bots.modeready.undo']) && actOf('captureflag', 'undo') && !actOf('captureflag', 'undo').disabled && actOf('captureflag', 'write').disabled, 'client: the rows reload with bots on, the done box stays under the row, the row Undo is the only one and usable');
  cfOut().all().find(n => n.tagName === 'BUTTON' && n.textContent === en['bots.modeready.next']).click();
  ok(gone.includes('bots.botmatch'), 'client: next step goes to Try a bot match');
  actOf('captureflag', 'undo').click(); await flush(); await flush();
  ok(!fs.existsSync(mf2) && rowOfM('captureflag').has(en['bots.modeready.no']) && !cfOut().all().some(n => n.getAttribute && n.getAttribute('data-done')) && actOf('captureflag', 'undo').disabled, 'client: Undo removes the copy, the done box goes, the row shows no bots again and Undo greys');
  root.all().find(n => n.tagName === 'BUTTON' && n.textContent === en['bots.modeready.open']).click();
  ok(shown[0] === 'modes', 'client: Open Game Modes shows the modes page');
  // no mod: buttons off, the hint shown
  const root2 = doc.createElement('div'); parts[0].draw({ mod: '', gid: 'as64', kit, api, reload() {} }).forEach(el => root2.appendChild(el));
  await flush();
  ok(root2.has(en['bots.modeready.needmod']) && root2.all().filter(n => n.tagName === 'BUTTON' && n.getAttribute('data-act')).every(b => b.disabled), 'client: no mod, Preview, Write and Undo are off');
  // the error path: a key from the server shown in the page language; an unknown message plainly with the raw words folded
  const root3 = doc.createElement('div'); parts[0].draw({ mod: '', gid: 'as64', kit, api: (m, p, d, cb) => cb('bots.modeready.e.nogame'), reload() {} }).forEach(el => root3.appendChild(el));
  ok(root3.has(en['bots.modeready.e.nogame']), 'client: a refusal key shown as words');
  const root4 = doc.createElement('div'); parts[0].draw({ mod: '', gid: 'as64', kit, api: (m, p, d, cb) => cb('ENOENT: something odd'), reload() {} }).forEach(el => root4.appendChild(el));
  ok(root4.has(en['bots.modeready.e.other']) && root4.all().some(n => n.tagName === 'DETAILS' && n.has('ENOENT')), 'client: an unknown error worded, the raw text in Details');
  // Gates of Hell: greyed up front with one plain line, the why in Details, nothing asked of the server
  { let gcalls = 0; const rootG = doc.createElement('div'); rootG.setAttribute('data-blkroot', 'bots'); parts[0].draw({ mod: mod2, gid: 'goh', kit, api: (m, p, d, cb) => { gcalls++; cb(null, {}); }, reload() {} }).forEach(el => rootG.appendChild(el));
    ok(gcalls === 0 && rootG.has(en['bots.modeready.na.goh']) && /^Not available in Gates of Hell: /.test(en['bots.modeready.na.goh']) && rootG.all().filter(n => n.tagName === 'BUTTON').map(n => n.textContent).join() === en['bots.modeready.open'] && !/GHMIS|m_aiAllowed/.test(shownText(rootG)) && /GHMIS-66/.test(rootG.textContent), 'client GoH: greyed up front, one plain line, the why in Details, no call');
    ok(BC.checkScreen(rootG, 'bots').length === 0, 'client GoH: block rules'); }
  ok(!/#[0-9a-f]{3,6}/i.test(P.script), 'client: no raw colours, theme variables only');

  // ---- in-game mode names: the game's own #dlg_mp.lng over the known names; the summary line; every composed sentence with real values
  {
    const gn = path.join(work, 'gnames');
    put(gn, G + 'battle_zones.set', ['{game', '\t{settings', '\t\t{enableBots}', '\t}', '}']);
    put(gn, G + 'combat.set', ['{game', '\t{settings', '\t}', '}']);
    put(gn, G + 'lonely.set', ['{game', '\t{settings', '\t}', '}']);
    fs.writeFileSync(path.join(gn, 'as64.exe'), '');
    put(gn, 'localization/#dlg_mp.lng', ['{tags', '\t{"mp"', '\t\t{"presets"', '\t\t\t{"game"', '\t\t\t\t{"combat" "Not this one"}', '\t\t\t}', '\t\t}', '\t\t{"game"',
      '\t\t\t{"battle_zones" "Assault Zones Seeded"}', '\t\t\t{"battle_zones"', '\t\t\t\t{"rules" "Long text: two teams fight. No flags."}', '\t\t\t}', '\t\t\t{"combat" "<c(20a601)>Combat"}', '\t\t}', '\t}', '}']);
    const nctx = Object.assign({}, ctx, { game: () => gn, gamedir: gn });
    const ln = await R['GET /api/x/bots/modeready/list'](U(''), null, nctx), nb = m => ln.rows.find(r => r.mode === m);
    ok(nb('battle_zones').name === 'Assault Zones Seeded' && nb('combat').name === 'Combat' && nb('lonely').name === 'lonely', 'names: the game\'s own words (tags stripped, presets block skipped), the id when none: ' + ln.rows.map(r => r.name).join());
    ok(P._t.namesIn('{tags\r\n\t{"mp"\r\n\t\t{"game"\r\n\t\t\t{"captureflag" "Day of Victory"}\r\n\t\t}\r\n\t}\r\n}').captureflag === 'Day of Victory', 'namesIn reads CRLF text');
    // botmodes: the modes bots can play, with orders (combat sends none), best = battle_zones when it plays
    const bm = await R['GET /api/x/bots/modeready/botmodes'](U('mod=' + encodeURIComponent(mod)), null, ctx);
    const bmm = m => bm.modes.find(x => x.mode === m);
    ok(bm.gid === 'as64' && !bm.na && bmm('combat').bots === false && bmm('mymode').bots === true && bmm('mymode').orders === false && bm.play.includes('battle_zones') && !bm.play.includes('mymode') && !bm.play.includes('combat') && bm.best === 'battle_zones' && bmm('battle_zones').name === 'Assault Zones',
      'botmodes: ' + JSON.stringify(bm));
    const bg = await R['GET /api/x/bots/modeready/botmodes'](U(''), null, gctx);
    ok(bg.kind === 'goh' && bg.na === 'bots.modeready.na.goh' && bg.play.includes('battle_zones') && !bg.play.includes('evacuation'), 'botmodes GoH: na key, its rows');
    // every sentence built from parts, in four languages, with the real values: no {slot} left, the name used as is
    const vals = { best: 'Assault Zones', mode: nb('battle_zones').name, mod: 'my_mod', list: 'Assault Zones Seeded, Day of Victory', n: 9, y: 2, file: 'set/multiplayer/games/battle_zones.set', a: 'x', m: 'why' };
    const CARD = /\{(enableBots|armySelectionMode)[^}]*\}/g;
    for (const r of P.lang) for (let c = 1; c < 5; c++) { const out = r[c].replace(/\{(\w+)\}/g, (m, k) => (vals[k] != null ? String(vals[k]) : m));
      ok(!/\{\w+\}/.test(out.replace(CARD, '')), 'sentence ' + r[0] + ' [' + c + '] has every slot filled: ' + out); }
    ok(!/[:.]/.test(vals.mode) && !/two teams fight/.test(JSON.stringify(ln)), 'the mode name is a short name, not the rules text');
    // buttons named by their exact words in every language (S14)
    const row = k => P.lang.find(r => r[0] === k);
    for (let c = 1; c < 5; c++) ok(row('bots.modeready.e.other')[c].includes(row('bots.modeready.reload')[c]) && row('bots.modeready.sum.noneYes')[c].includes(row('bots.modeready.preview')[c]) && row('bots.modeready.lead')[c].includes(row('bots.modeready.preview')[c]) && row('bots.modeready.writeT')[c].includes(row('bots.modeready.preview')[c]), 'buttons named by their exact words, column ' + c);
    // the client: summary line by name, the names in the rows and in the confirm, the folder name only (no path) in the main text
    const rootN = doc.createElement('div'); rootN.setAttribute('data-blkroot', 'bots');
    const apiN = (m, p, d, cb) => { pend.push(Promise.resolve().then(() => R[m + ' /api/x/bots/' + p](U(m === 'GET' ? 'mod=' + encodeURIComponent(mod2) : ''), m === 'GET' ? null : Object.assign({ mod: mod2 }, d || {}), nctx)).then(j => cb(null, j), x => cb(x.message, undefined, x))); };
    parts[0].draw({ mod: mod2, gid: 'as64', kit, api: apiN, reload() {}, go() {} }).forEach(el => rootN.appendChild(el));
    await flush();
    const sy = rootN.all().find(n => n.getAttribute && n.getAttribute('data-sum') === 'yes'), sn = rootN.all().find(n => n.getAttribute && n.getAttribute('data-sum') === 'no');
    ok(sy && sy.textContent === 'Bots can join: Assault Zones Seeded.' && sn && sn.textContent === 'Bots cannot join: Combat, lonely.', 'client: the summary names the modes: ' + (sy && sy.textContent) + ' / ' + (sn && sn.textContent));
    ok(BC.checkScreen(rootN, 'bots').length === 0, 'client names: block rules ' + BC.checkScreen(rootN, 'bots').slice(0, 4).join(' | '));
    const cbRow = rootN.all().find(n => n.getAttribute && n.getAttribute('data-mode') === 'combat' && n.getAttribute('data-blk'));
    cbRow.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-act') === 'preview').click(); await flush();
    ok(cbRow.has('After writing, bots can join Combat on every map of this mode while your mod is on. Nothing is written yet.') && cbRow.all().some(n => n.getAttribute && n.getAttribute('data-combat') === '1'), 'client: the preview uses the short name and warns that Combat bots send no orders');
    const before = asks.length;
    cbRow.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-act') === 'write').click(); await flush(); await flush();
    ok(asks.length === before + 1 && asks[before].lines[0] === 'Allow bots in Combat for every map of that mode, in mod_two?' && asks[before].lines.includes(en['bots.modeready.p.combatOff']) && asks[before].where === 'mod_two', 'client: the confirm reads as one sentence with the folder name: ' + (asks[before] && asks[before].lines[0]));
    const cbRow2 = rootN.all().find(n => n.getAttribute && n.getAttribute('data-mode') === 'combat' && n.getAttribute('data-blk'));
    const dn = cbRow2.all().find(n => n.getAttribute && n.getAttribute('data-done') === '1');
    ok(dn && dn.has('Done: bots can join Combat while your mod is on.') && dn.textContent.split('To see it:').length === 2 && dn.has('try a bot match in Combat. Only games with your mod on change'), 'client: the green box: "Done: ..." and "To see it: try a bot match" once, who is affected: ' + (dn && dn.textContent));
    ok(rootN.all().filter(n => n.tagName === 'BUTTON' && n.textContent === en['bots.modeready.undo'] && !n.disabled).length === 1 && dn && !dn.all().some(n => n.tagName === 'BUTTON' && n.textContent === en['bots.modeready.undo']), 'client: one usable Undo on the card, none in the green box');
    cbRow2.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-act') === 'undo').click(); await flush(); await flush();
    ok(!rootN.all().some(n => n.getAttribute && n.getAttribute('data-done') === '1') && rootN.all().some(n => n.getAttribute && n.getAttribute('data-undone') === '1'), 'client: after Undo the green box is gone, one plain line says so');
    // more than 8 modes: 8 rows, then Show all N
    const many = { kind: 'as2', rows: Array.from({ length: 11 }, (x, i) => ({ mode: 'm' + i, name: 'Mode ' + i, bots: i % 2 === 0, plain: ['bots.modeready.p.on'], why: [], from: 'game' })) };
    const rootM = doc.createElement('div'); rootM.setAttribute('data-blkroot', 'bots');
    parts[0].draw({ mod: mod2, gid: 'as64', kit, api: (m, p, d, cb) => cb(null, many), reload() {} }).forEach(el => rootM.appendChild(el));
    const rowsM = () => rootM.all().filter(n => n.getAttribute && /^bots\.modeready\.m\.m\d+$/.test(n.getAttribute('data-blk') || ''));
    const allB = rootM.all().find(n => n.tagName === 'BUTTON' && n.getAttribute('data-all') === '1');
    ok(rowsM().length === 8 && allB && allB.textContent === 'Show all 11' && BC.checkScreen(rootM, 'bots').length === 0, 'client: 8 rows, then Show all 11');
    if (allB) allB.click();
    ok(rowsM().length === 11, 'client: Show all shows every mode');
    // a refusal handed as the third value (the frame turns the code into words first): worded, with its next step, never "went wrong"
    const rootE = doc.createElement('div');
    parts[0].draw({ mod: mod2, gid: 'as64', kit, api: (m, p, d, cb) => cb(en['bots.modeready.e.nogame'], undefined, { key: 'bots.modeready.e.nogame', params: {}, message: 'bots.modeready.e.nogame' }), reload() {} }).forEach(el => rootE.appendChild(el));
    ok(rootE.has(en['bots.modeready.e.nogame']) && !rootE.has(en['bots.modeready.e.other']) && rootE.all().some(n => n.tagName === 'BUTTON' && n.textContent === en['bots.modeready.go.settings']), 'client: a code from the frame worded with its next step (Open Settings)');
    const rootW = doc.createElement('div');
    parts[0].draw({ mod: mod2, gid: 'as64', kit, api: (m, p, d, cb) => cb('Pick your mod folder first.'), reload() {} }).forEach(el => rootW.appendChild(el));
    ok(rootW.has('Pick your mod folder first.') && !rootW.has(en['bots.modeready.e.other']), 'client: words the frame already said are shown as they are');
  }

  console.log(bad ? bad + ' failures' : 'bots part modeready PASS');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FAIL crash ' + (e && e.stack || e)); process.exit(1); });
