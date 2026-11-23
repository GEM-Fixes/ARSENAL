// mcp gimp test: every tool of tools/mcp/tools/gimp.js, its handler called directly with a ctx (lib/ctx forCall).
//   1. refusals that need no GIMP: a value starting with "-", an unknown job, a write outside ARSENAL_WRITE_ROOTS, preview by default
//   2. with GIMP 3 installed: a real cutout (by colour, inverted), layers + .xcf, removebg, scale; outputs read back
//   Without GIMP part 2 is skipped with one plain line.   node tools/mcp/test/gimp.test.js
// Writes go only into a scratch folder (env ARSENAL_TMP when set, else the os temp), removed at the end.
// Author: Imperator_Aug (ARSENAL, ia-ad177d02)
'use strict';
const fs = require('fs'), path = require('path');
const { T, scratch, rm } = require('./rpc');
const t = T('gimp');
const S = scratch('gimptest');
process.env.ARSENAL_WRITE_ROOTS = path.join(S, 'out');
const ctxLib = require('../lib/ctx');
const M = require('../tools/gimp');
const I = require('../../unitcard/lib/img');
const Gp = require('../../gimp/gimp');
const tool = n => M.tools.find(x => x.name === n);
async function call(name, args) {
  const tl = tool(name); if (!tl) return { text: 'no tool ' + name, isError: true };
  if (ctxLib._reset) ctxLib._reset();
  try { return (await tl.handler(args, ctxLib.forCall(tl, args))) || { text: '', isError: true }; }
  catch (e) { return e && e.refused ? { text: 'refused: ' + e.message, isError: true, refused: true } : { text: 'THREW ' + (e && e.stack || e), isError: true, threw: true }; }
}
(async () => {
  t.ok(M.group === 'gimp' && ['mow_gimp_status', 'mow_gimp_cutout', 'mow_gimp_layers', 'mow_gimp_run', 'mow_card_cutouts'].every(n => tool(n)), 'five tools in group gimp');
  t.ok(M.tools.filter(x => x.kind === 'write').length === 4, 'four write tools');
  // a test picture: a red square on a white backdrop
  const pic = I.blank(32, 32, [255, 255, 255, 255]); for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) { const o = (y * 32 + x) * 4; pic.d[o] = 200; pic.d[o + 1] = 20; pic.d[o + 2] = 20; }
  fs.mkdirSync(path.join(S, 'in'), { recursive: true }); const inp = path.join(S, 'in', 'sq.png'); fs.writeFileSync(inp, I.png(pic));
  const out = path.join(S, 'out', 'cut.png'), st = Gp.status();
  let r = await call('mow_gimp_status', {});
  t.ok(!r.isError && /GIMP/.test(r.text), 'status answers');
  if (!st.found) {
    console.log('gimp: GIMP 3 not installed, the GIMP runs are skipped (' + (st.why || '') + ')');
    r = await call('mow_gimp_cutout', { input: inp, output: out, write: true }); t.ok(r.isError && /GIMP/.test(r.text), 'cutout without GIMP is refused in plain words');
    rm(S); return t.done();
  }
  r = await call('mow_gimp_cutout', { input: '-x', output: out }); t.ok(r.refused && /may not start/.test(r.text), 'a value starting with - is refused');
  r = await call('mow_gimp_run', { job: 'script', input: inp, output: out }); t.ok(r.isError && /no free script/.test(r.text), 'an unknown job is refused');
  r = await call('mow_gimp_cutout', { input: inp, output: out, by: 'color', rgb: [255, 255, 255], invert: true });
  t.ok(!r.isError && /Preview/.test(r.text) && !fs.existsSync(out), 'cutout previews without write');
  r = await call('mow_gimp_cutout', { input: inp, output: path.join(S, 'elsewhere', 'x.png'), write: true }); t.ok(r.refused, 'a target outside ARSENAL_WRITE_ROOTS is refused');
  r = await call('mow_gimp_cutout', { input: inp, output: out, by: 'color', rgb: [255, 255, 255], threshold: 10, invert: true, write: true });
  t.ok(!r.isError && fs.existsSync(out), 'cutout written | ' + r.text.slice(0, 300));
  if (fs.existsSync(out)) { const p = I.decode(fs.readFileSync(out), out); t.ok(p.d[(16 * 32 + 16) * 4 + 3] === 255 && p.d[(2 * 32 + 2) * 4 + 3] === 0 && p.d[(16 * 32 + 16) * 4] === 200, 'cutout keeps the square, backdrop transparent'); }
  r = await call('mow_gimp_layers', { input: inp, folder: path.join(S, 'out', 'lay'), rects: [{ name: 'top', x: 0, y: 0, w: 32, h: 8 }], xcf: true, write: true });
  t.ok(!r.isError && fs.existsSync(path.join(S, 'out', 'lay', 'top.png')) && fs.existsSync(path.join(S, 'out', 'lay', 'rest.png')) && fs.existsSync(path.join(S, 'out', 'lay', 'layers.xcf')), 'layers + rest + xcf | ' + r.text.slice(0, 300));
  r = await call('mow_gimp_run', { job: 'scale', input: inp, output: path.join(S, 'out', 's.png'), w: 64, h: 64, write: true });
  t.ok(!r.isError && fs.existsSync(path.join(S, 'out', 's.png')) && I.decode(fs.readFileSync(path.join(S, 'out', 's.png')), 's.png').w === 64, 'scale job');
  r = await call('mow_gimp_run', { job: 'removebg', input: inp, output: path.join(S, 'out', 'rb.png'), write: true });
  if (fs.existsSync(path.join(S, 'out', 'rb.png'))) { const p = I.decode(fs.readFileSync(path.join(S, 'out', 'rb.png')), 'rb.png'); t.ok(p.d[3] === 0 && p.d[(16 * 32 + 16) * 4 + 3] === 255, 'removebg clears the backdrop only'); } else t.ok(false, 'removebg wrote nothing | ' + r.text.slice(0, 300));
  r = await call('mow_card_cutouts', { kind: 'squad' }); t.ok(!r.isError && /Preview/.test(r.text) || /no .* install/.test(r.text), 'card cutouts previews by default');
  rm(S); t.done();
})();
