// GEN-FIX2 #3: add on an existing name (inventory lines -> a second line; same key -> that line; one unkeyed line -> set,
// --append refuses it), keyed lines without a key refused, a key set through a macro call refused (PATCH_KEY_MACRO).
// Old behaviour: add on {item "a" 1} replaced it; with 2 items PATCH_AMBIGUOUS; set on ("speed" s(800)) wrote ("speed" 900(800)).
// usage: node add-test.js   prints "OK name" / "FAIL name: why"; exit 1 on any FAIL. No game.
// Author: Imperator_Aug (ARSENAL, ia-325d9991)
const { applyEdit } = require('../patch-entity');
const sdlwrite = require('../../lib/sdlwrite');
let fail = 0;
const ok = (name, cond, why) => { console.log((cond ? 'OK ' : 'FAIL ') + name + (cond ? '' : ': ' + why)); if (!cond) fail++; };
const B = s => Buffer.from(s.replace(/\n/g, '\r\n'), 'latin1');
const run = (text, op, p, value) => { const r = applyEdit(B(text), { op, path: p, value }); return Object.assign(r, { s: r.buf ? r.buf.toString('latin1') : '' }); };
const clean = s => { try { sdlwrite.parse(Buffer.from(s, 'latin1')); return true; } catch (e) { return false; } };

const one = '{breed\n\t{inventory\n\t\t{item "ppsh41" filled}\n\t}\n}\n';
const two = '{breed\n\t{inventory\n\t\t{item "ppsh41" filled}\n\t\t{item "grenade f1" 2}\n\t}\n}\n';
let r = run(one, 'add', 'breed/inventory/item', '"bandage" 3');
ok('add item on 1 keyed item: second line', !r.err && /\{item "ppsh41" filled\}/.test(r.s) && /\{item "bandage" 3\}/.test(r.s) && r.note && r.note[0] === 'PATCH_ADD_APPENDED' && clean(r.s), r.err || r.s);
ok('add item: CRLF kept', !/[^\r]\n/.test(r.s), JSON.stringify(r.s));
r = run(two, 'add', 'breed/inventory/item', '"bandage" 3');
ok('add item on 2 items: third line (was PATCH_AMBIGUOUS)', !r.err && (r.s.match(/\{item /g) || []).length === 3 && /"grenade f1" 2\}\r\n\t\t\{item "bandage" 3\}/.test(r.s), r.err || r.s);
r = run(two, 'add', 'breed/inventory/item', '"grenade f1" 4');
ok('add same key: that line set', !r.err && (r.s.match(/\{item /g) || []).length === 2 && /\{item "grenade f1" 4\}/.test(r.s) && /\{item "ppsh41" filled\}/.test(r.s), r.err || r.s);
r = run(two, 'add', 'breed/inventory/item', '5');
ok('add without key on keyed lines refused', r.err && r.err[0] === 'PATCH_ADD_KEYLESS', JSON.stringify(r.err || r.s));
r = run(two, 'append', 'breed/inventory/item', '"grenade f1" 1');
ok('append same key: a new line', !r.err && (r.s.match(/\{item /g) || []).length === 3, r.err || r.s);

const single = '{mover\n\t{cost 400}\n\t{speed 10}\n}\n';
r = run(single, 'add', 'mover/cost', '500');
ok('add on one unkeyed line: set in place (upsert kept)', !r.err && /\{cost 500\}/.test(r.s) && !/400/.test(r.s) && r.note && r.note[0] === 'PATCH_ADD_SET', r.err || r.s);
r = run(single, 'append', 'mover/cost', '500');
ok('append on one unkeyed line refused', r.err && r.err[0] === 'PATCH_APPEND_SINGLE', JSON.stringify(r.err || r.s));
r = run(single, 'append', 'mover/range', '30');
ok('append a missing name: created', !r.err && /\{range 30\}/.test(r.s), r.err || r.s);
r = run('{m\n\t{tag "a"}\n\t{x 1}\n\t{x 2}\n}\n', 'add', 'm/x', '3');
ok('add on a repeated unkeyed name: new line', !r.err && /\{x 2\}\r\n\t\{x 3\}/.test(r.s), r.err || r.s);

const mac = '{mover\n\t("speed" s(800))\n\t{weight 10}\n}\n';
for (const op of ['set', 'add', 'append']) {
  r = run(mac, op, 'mover/speed', '900');
  ok(op + ' on a macro-set key refused PATCH_KEY_MACRO', r.err && r.err[0] === 'PATCH_KEY_MACRO' && /macro/.test(r.err[1]), JSON.stringify(r.err || r.s));
}
r = run(mac, 'del', 'mover/speed');
ok('del of a macro call still works', !r.err && !/speed/.test(r.s), r.err || r.s);
r = run(mac, 'set', 'mover/weight', '12');
ok('set beside a macro call untouched', !r.err && /\{weight 12\}/.test(r.s) && /\("speed" s\(800\)\)/.test(r.s), r.err || r.s);
// several parents still ambiguous
r = run('{a\n\t{l {c 1}}\n\t{l {c 2}}\n}\n', 'add', 'a/l/c', '3');
ok('add under 2 parents: PATCH_AMBIGUOUS', r.err && r.err[0] === 'PATCH_AMBIGUOUS', JSON.stringify(r.err || r.s));
// GEN-FIX3 #3: a quoted block name holding '/' ({"mp/rus/rifle" ..}, {"s:a/b" ..}) is one path segment. Old: the '/' inside the quotes split it -> PATCH_KEY_MISSING
const qn = '{units\n\t{"mp/rus/rifle" {cp 2.5} {cost 10}}\n\t{"mp/ger/rifle" {cp 3}}\n}\n';
r = run(qn, 'set', 'units/"mp/rus/rifle"/cp', '4');
ok('set under a quoted name with / (was PATCH_KEY_MISSING)', !r.err && /\{"mp\/rus\/rifle" \{cp 4\}/.test(r.s) && /\{"mp\/ger\/rifle" \{cp 3\}/.test(r.s) && clean(r.s), JSON.stringify(r.err || r.s));
r = run(qn, 'add', 'units/"mp/ger/rifle"/score', '0.5');
ok('add under a quoted name with /', !r.err && /\{"mp\/ger\/rifle" \{cp 3\}\s*\{score 0\.5\}/.test(r.s) && clean(r.s), JSON.stringify(r.err || r.s));
r = run(qn, 'set', 'units/"mp/fin/rifle"/cp', '4');
ok('unknown quoted name still PATCH_KEY_MISSING', r.err && r.err[0] === 'PATCH_KEY_MISSING', JSON.stringify(r.err || r.s));
r = run(qn, 'set', 'units/mp/rus/rifle/cp', '4');
ok('unquoted / still splits (seeded: no such units/mp block)', r.err && r.err[0] === 'PATCH_KEY_MISSING', JSON.stringify(r.err || r.s));

// GEN-FIX4 #3: add under a block the file lacks creates it (was PATCH_KEY_MISSING); a second add in the same run joins that block
const runs = (text, ...es) => { let b = B(text), notes = []; for (const e of es) { const x = applyEdit(b, e); if (x.err) return { err: x.err, notes }; if (x.note) notes.push(x.note[0]); b = x.buf; } return { s: b.toString('latin1'), notes }; };
const gun = '{from "x"\n\t{mass 2}\n}\n';
r = run(gun, 'add', 'from/special/PrepareTime', '3');
ok('add under a missing block: {special {PrepareTime 3}} created, mass kept (PATCH_ADD_BLOCK)', !r.err && /\t\{mass 2\}\r\n\t\{special \{PrepareTime 3\}\}\r\n\}/.test(r.s) && r.note && r.note[0] === 'PATCH_ADD_BLOCK' && clean(r.s), JSON.stringify(r.err || r.s));
r = runs(gun, { op: 'add', path: 'from/special/PrepareTime', value: '3' }, { op: 'add', path: 'from/special/ReloadTime', value: '4' });
ok('two adds under one missing block: one {special} block holds both', !r.err && (r.s.match(/\{special/g) || []).length === 1 && /\{special \{PrepareTime 3\} \{ReloadTime 4\}\}/.test(r.s) && r.notes.join() === 'PATCH_ADD_BLOCK' && clean(r.s), JSON.stringify(r.err || r.s));
r = run('{from "x" {mass 2}}', 'add', 'from/a/b/c', '1');
ok('add under two missing blocks: nested blocks created', !r.err && /\{mass 2\} \{a \{b \{c 1\}\}\}\}$/.test(r.s), JSON.stringify(r.err || r.s));
r = run(gun, 'set', 'from/special/PrepareTime', '3');
ok('seeded: --set still refuses a missing block (PATCH_KEY_MISSING)', r.err && r.err[0] === 'PATCH_KEY_MISSING', JSON.stringify(r.err || r.s));
r = run(gun, 'add', 'gun/special/PrepareTime', '3');
ok('seeded: a missing root block is not created (PATCH_KEY_MISSING)', r.err && r.err[0] === 'PATCH_KEY_MISSING', JSON.stringify(r.err || r.s));
r = run(gun, 'add', 'from/special[1]/PrepareTime', '3');
ok('seeded: an indexed missing block is refused', r.err && r.err[0] === 'PATCH_BAD_ARGS', JSON.stringify(r.err || r.s));

// GEN-FIX4 #4: #* sets the whole value list of a line with several quoted values
const tg = '{from "x"\n\t{tag "a" "b" "c"}\n}\n';
r = run(tg, 'add', 'from/tag[0]', '"a b"');
ok('seeded: without #* one value replaces only the first (PATCH_VALUE_FIRST_ONLY says how)', !r.err && /\{tag "a b" "b" "c"\}/.test(r.s) && r.note && r.note[0] === 'PATCH_VALUE_FIRST_ONLY' && /#\*/.test(r.note[1]), JSON.stringify(r.err || r.s));
r = run(tg, 'add', 'from/tag[0]#*', '"a" "b"');
ok('#*: {tag "a" "b" "c"} -> {tag "a" "b"}', !r.err && /\t\{tag "a" "b"\}\r\n/.test(r.s) && clean(r.s), JSON.stringify(r.err || r.s));
r = run(tg, 'set', 'from/tag#*', '"a b"');
ok('#*: one value with a space -> {tag "a b"}', !r.err && /\t\{tag "a b"\}\r\n/.test(r.s), JSON.stringify(r.err || r.s));
r = run('{from "x" {tag "a" "b" {sub 1}}}', 'set', 'from/tag#*', '"z"');
ok('#*: child blocks of the line stay', !r.err && /\{tag "z" \{sub 1\}\}/.test(r.s), JSON.stringify(r.err || r.s));
r = run(gun, 'add', 'from/tag#*', '"z" "y"');
ok('#* on a missing name: the line is created', !r.err && /\{tag "z" "y"\}/.test(r.s), JSON.stringify(r.err || r.s));
r = run(tg, 'del', 'from/tag#*');
ok('seeded: --del with #* refused', r.err && r.err[0] === 'PATCH_BAD_ARGS', JSON.stringify(r.err || r.s));
process.exit(fail ? 1 : 0);
