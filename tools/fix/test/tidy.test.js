// tidy fixers (fix/lib/tidy.js): unused bot keys and earlier copies of repeated text keys, on text in memory.
// usage: node tools/fix/test/tidy.test.js
// Author: Imperator_Aug (ARSENAL, ia-a2462a68)
const t = require('../lib/tidy');
let n = 0, bad = 0;
const ok = (c, m, x) => { n++; if (!c) { bad++; console.log('FAIL ' + m + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

// ---- botkeys
const lua = [
  'MaxSquadSize = 5',
  'AttackBaseTime = 15 * 60 -- 10min',
  'Purchases = {',
  '\t{priority = 3.0, class = UnitClass.Infantry, period = "43", unit = "a(ger)"},',
  '\t{priority = 1.0, unit = "b", period = "all 42 43"},',
  '\t{period = 7},',
  '\t{priority = 2, period = { 1, 2 }, unit = "c"},',
  '\t-- period = "44" in a comment stays',
  '\t{priority = 2, text = "period = 1", unit = "d"},',
  '}',
  'x = 1; AttackBaseTime = 2',
  ''].join('\r\n');
const b = t.stripBotKeys(lua);
ok(b.removed.length === 4, 'four plain keys removed', b.removed);
ok(/\{priority = 3\.0, class = UnitClass\.Infantry, unit = "a\(ger\)"\},/.test(b.text), 'field in the middle: taken with its comma', b.text);
ok(/\{priority = 1\.0, unit = "b"\},/.test(b.text), 'last field: the comma before it goes too');
ok(/\t\{\},/.test(b.text), 'only field: empty table left');
ok(!/^AttackBaseTime = 15/m.test(b.text) && /^MaxSquadSize = 5\r\nPurchases/.test(b.text), 'statement line removed whole');
ok(/-- period = "44" in a comment stays/.test(b.text) && /text = "period = 1"/.test(b.text), 'comment and string content untouched');
ok(b.cant.length === 2 && b.cant.some(c => /not a plain/.test(c.msg)) && b.cant.some(c => /shares its line/.test(c.msg)), 'table value and shared line refused', b.cant);
ok(/period = \{ 1, 2 \}/.test(b.text) && /x = 1; AttackBaseTime = 2/.test(b.text), 'refused places are left as they were');
const eb = { kind: 'botkeys', key: 'resource/script/multiplayer/bot.data.lua', before: Buffer.from(lua, 'latin1'), after: Buffer.from(b.text, 'latin1') };
ok(t.check(eb) === null, 'check passes the result', t.check(eb));
ok(/pieces taken out/.test(t.check(Object.assign({}, eb, { after: Buffer.from(b.text.replace('unit = "b"', 'unit = "z"'), 'latin1') })) || ''), 'check refuses a result with other changes');
ok(/brackets/.test(t.check(Object.assign({}, eb, { after: Buffer.from(b.text.replace('\t{},', '\t{,'), 'latin1') })) || ''), 'check refuses lost brackets');

// ---- lngdup
const lngText = [
  '{tags',
  '\t{"desc"',
  '\t\t{"a" "first"}',
  '\t\t{"b" "only"}',
  '\t\t{"a" "second"}',
  '\t\t{"c" "one"} {"d" "x"}',
  '\t\t{"c" "two"}',
  '\t\t{"a" "third"}',
  '\t}',
  '}', ''].join('\r\n');
const d = t.stripLngDups(lngText);
ok(d.removed.length === 1 && d.removed[0].line === 3, 'first pass takes the earliest copy of "a"', d.removed);
ok(d.cant.length === 1 && d.cant[0].line === 6, 'a line holding two keys is refused', d.cant);
const d2 = t.stripLngDups(d.text);
ok(d2.removed.length === 1 && !/"second"/.test(d2.text) && /"third"/.test(d2.text), 'second pass takes the next copy; the last one stays', d2.text);
ok(/\{"c" "one"\} \{"d" "x"\}/.test(d2.text) && /\r\n/.test(d2.text), 'refused line and CRLF kept');
ok(t.check({ kind: 'lngdup', before: Buffer.from(lngText), after: Buffer.from(d2.text) }) === null, 'check: same keys, same texts');
ok(/text of desc\/a changed/.test(t.check({ kind: 'lngdup', before: Buffer.from(lngText), after: Buffer.from(d2.text.replace('third', 'other')) }) || ''), 'check refuses a changed text');
ok(/set of text keys/.test(t.check({ kind: 'lngdup', before: Buffer.from(lngText), after: Buffer.from(d2.text.replace('\t\t{"b" "only"}\r\n', '')) }) || ''), 'check refuses a lost key');

console.log(bad ? bad + ' of ' + n + ' failed' : 'tidy ' + n + ' PASS');
process.exit(bad ? 1 : 0);
