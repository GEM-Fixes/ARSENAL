// T-STUFF SEED test (PORT-121 / PORT-165 / PORT-187): every {weapon}/{item}/filling tag a ported def names resolves to Stuff in as64 (kept), or the GoH entry
// is pulled with its chain (from / pattern / filling), or the tool writes WARN_PORT_STUFF_MISSING + a hand gap. Invented fixtures only. run via run.sh.
//  1 a weapon tag only GoH has is pulled, with its ammo (filling) and the pattern as64 has not re-pulled
//  2 a tag as64 already has is kept: nothing written for it
//  3 a bare weapon name an ammo file also carries gets the "weapon name" form in the def (PORT-165)
//  4 a tag in neither tree: WARN_PORT_STUFF_MISSING + gap row of kind hand, nothing written for it
//  5 a stuff file that calls a macro nobody defines is not pulled (WARN, hand gap): half a stuff file is fatal at boot
//  6 {weapon "x" {mask ..}} (inventory slot filter) is not a lookup
//  7 --no-stuff-pull is the old closure: nothing pulled, no warning
// Author: Imperator_Aug (ARSENAL, ia-0ec8e6dd)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const tool = path.join(__dirname, '..', 'goh2as2.js');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'stuff: ' + name + (good || extra === undefined ? '' : '  ' + String(extra).slice(0, 700))); if (!good) fail++; };
const env = { ...process.env, AS2_NO_STEAM: '1', AS2_GAME: '' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'tstuff-'));
const w = (rel, s) => { const p = path.join(W, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s.replace(/\r?\n/g, '\r\n'), 'latin1'); };
// as64 side: one gun, the two patterns
w('as2/resource/set/stuff/gun/kept1', '{from "pattern gun"}\n');
w('as2/resource/set/stuff/gun/gun.pattern', '{weapon_bullet}\n');
w('as2/resource/set/stuff/shell/ap.pattern', '{shell}\n');
w('as2/resource/entity/dummy/dummy.def', '{game_entity}\n');
// GoH side
w('goh/resource/entity/u1/u1.def', `{game_entity
  {Extension "u1.mdl"}
  {extender "inventory"
    {weapon "mgun" {mask "mountable"}}
    {box
      {item "xshell he" 5}
    }
  }
  {Weaponry
    {place "a" {weapon "guna" filling "xshell he" 1}}
    {place "b" {weapon "gunb"}}
    {place "c" {weapon "kept1"}}
    {place "d" {weapon "gunmissing"}}
    {place "e" {weapon "gunmacro"}}
  }
}
`);
w('goh/resource/entity/u1/u1.mdl', '{model "x"}\n');
w('goh/resource/set/stuff/gun/guna', '{from "pattern gun"\n  {filling "xshell" 10}\n}\n');
w('goh/resource/set/stuff/shell/xshell.he.ammo', '{from "pattern ap"\n  {mass 1}\n}\n');
w('goh/resource/set/stuff/gun/gunb.weapon', '{from "pattern gun"\n  {filling "xshell" 10}\n}\n');
w('goh/resource/set/stuff/shell/gunb.he.ammo', '{from "pattern ap"\n  {mass 2}\n}\n');
w('goh/resource/set/stuff/gun/gunmacro', '{from "pattern gun"\n  ("goh_only_macro")\n}\n');
const run = extra => {
  const out = path.join(W, 'o' + Math.random().toString(36).slice(2, 6));
  const r = cp.spawnSync(process.execPath, [tool, '--goh', path.join(W, 'goh'), '--game', path.join(W, 'as2'), '--entity', 'u1', '--out', out, '--no-keylint', '--no-rc', '-q', ...extra], { encoding: 'utf8', env });
  const rd = p => { try { return fs.readFileSync(path.join(out, p), 'latin1'); } catch { return null; } };
  let gaps = []; try { gaps = JSON.parse(rd('gaps/u1.gaps.json')).gaps; } catch {}
  return { r, out, rd, gaps, text: r.stdout + r.stderr, has: p => fs.existsSync(path.join(out, p)) };
};
const a = run([]);
const D = 'resource/entity/u1/u1.def', S = 'resource/set/stuff/';
t('runs, exit 0', a.r.status === 0, a.text);
t('1 GoH-only gun pulled', a.has(S + 'gun/guna'), a.text);
t('1 its ammo (filling chain) pulled', a.has(S + 'shell/xshell.he.ammo'), a.text);
t('1 item tag "xshell he" is the same ammo, one file', a.has(S + 'shell/xshell.he.ammo'));
t('1 pattern as64 has is not re-pulled', !a.has(S + 'gun/gun.pattern') && !a.has(S + 'shell/ap.pattern'));
t('2 as64 gun kept, not written', !a.has(S + 'gun/kept1'));
const def = a.rd(D) || '';
t('3 bare weapon shared with an ammo file -> "weapon gunb"', /\{weapon "weapon gunb"\}/.test(def), def);
t('3 the .weapon file is pulled', a.has(S + 'gun/gunb.weapon'));
t('3 others stay bare', /\{weapon "guna" filling/.test(def) && /\{weapon "kept1"\}/.test(def), def);
t('4 missing tag warns by name', /WARN_PORT_STUFF_MISSING/.test(a.text) && /gunmissing/.test(a.text), a.text);
t('4 gap row of kind hand', a.gaps.some(g => g.code === 'WARN_PORT_STUFF_MISSING' && g.kind === 'hand' && /gunmissing/.test(g.reason)), JSON.stringify(a.gaps));
t('4 nothing written for it', !a.has(S + 'gun/gunmissing'));
t('5 undefined-macro stuff not pulled', !a.has(S + 'gun/gunmacro'), a.text);
t('5 and warned as missing', a.gaps.some(g => g.code === 'WARN_PORT_STUFF_MISSING' && /gunmacro/.test(g.reason)), JSON.stringify(a.gaps));
t('6 mask form is no lookup', !/mgun/.test(a.gaps.map(g => g.reason).join(' ')) && !/WARN_PORT_STUFF_MISSING[^\n]*"mgun"/.test(a.text));
const b = run(['--no-stuff-pull']);
t('7 --no-stuff-pull: nothing pulled, no stuff warning', !b.has(S + 'gun/guna') && !/WARN_PORT_STUFF_MISSING/.test(b.text), b.text);
try { fs.rmSync(W, { recursive: true, force: true }); } catch {}
console.log(fail ? 'FAIL stuff' : 'PASS stuff');
process.exit(fail ? 1 : 0);
