// NAT-CONV: --text-only writes every text output and no binary; text-only.tsv lists the skipped binaries (sorted); --entity-list == repeated --entity.
// Needs test/fixture from mkfixture.js.
// Author: Imperator_Aug (ARSENAL, ia-c843d8b4)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const d = __dirname, F = path.join(d, 'fixture'), tool = path.join(d, '..', 'goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'textonly: ' + name + (good || !extra ? '' : '  ' + String(extra).slice(0, 600))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'textonly-'));
const run = (name, extra) => { const out = path.join(W, name, 'out'); const r = cp.spawnSync(process.execPath, [tool, '--goh', path.join(F, 'goh'), '--keys', path.join(F, 'keys.txt'), '--no-game', '--mod', out, '--no-keylint', '--no-rc', '-q', ...extra], { encoding: 'utf8', env }); return { out, r }; };
const tree = dir => { const m = new Map(); (function w(p, rel) { for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) { const q = path.join(p, e.name), r = rel ? rel + '/' + e.name : e.name; if (e.isDirectory()) w(q, r); else m.set(r, fs.readFileSync(q)); } })(dir, ''); return m; };
const BINX = /\.(dds|ply|anm|vol|wav|ogg|tga|bmp|pak)$/;
try {
  const A = run('full', ['--entity', 'tank']), B = run('text', ['--entity', 'tank', '--text-only']);
  t('both runs exit alike', A.r.status === B.r.status && A.r.status !== null, A.r.stderr + B.r.stderr);
  const ta = tree(A.out), tb = tree(B.out);
  const binFull = [...ta.keys()].filter(k => k.startsWith('resource/') && BINX.test(k));
  t('fixture has binaries (' + binFull.length + ')', binFull.length > 0);
  t('no binary written', ![...tb.keys()].some(k => BINX.test(k)), [...tb.keys()].filter(k => BINX.test(k)).join(' '));
  const tsv = tb.has('text-only.tsv') ? tb.get('text-only.tsv').toString('utf8').split('\n').filter(Boolean) : null;
  t('text-only.tsv present', !!tsv);
  t('tsv sorted', !!tsv && tsv.every((x, i) => i === 0 || tsv[i - 1] < x));
  t('tsv lists every binary the full run wrote', !!tsv && binFull.every(k => tsv.includes(k.slice('resource/'.length))), (tsv || []).join(' ') + ' | ' + binFull.join(' '));
  const bad = [];
  for (const [k, v] of ta) { if (k === 'text-only.tsv' || k === 'GOH-ORIGIN.tsv' || (k.startsWith('resource/') && BINX.test(k))) continue; if (!tb.has(k)) bad.push('missing ' + k); else if (!tb.get(k).equals(v)) bad.push('differs ' + k); }
  for (const k of tb.keys()) if (k !== 'text-only.tsv' && !ta.has(k)) bad.push('extra ' + k);
  t('every text file equals the normal run\'s', !bad.length, bad.join('; '));
  t('normal run writes no text-only.tsv', !ta.has('text-only.tsv'));
  const lf = path.join(W, 'list.txt'); fs.writeFileSync(lf, 'tank\n\n');
  const C = run('list', ['--entity-list', lf, '--text-only']);
  const tc = tree(C.out), diff = [...new Set([...tb.keys(), ...tc.keys()])].filter(k => !tb.has(k) || !tc.has(k) || !tb.get(k).equals(tc.get(k)));
  t('--entity-list equals --entity', C.r.status === B.r.status && !diff.length, diff.join(' '));
} finally { fs.rmSync(W, { recursive: true, force: true }); }
console.log(fail ? 'textonly: FAIL' : 'textonly: all ok');
process.exit(fail ? 1 : 0);
