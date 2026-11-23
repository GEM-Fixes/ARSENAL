// breedflat: a soldier file (set/breed/**.set) with its (include ..) lines and macro calls written out, as the plain brace text
// the game ends up reading. Readers that look for {skin "x"}, {inventory {item ..}} or {armors ..} in the file's own text miss
// every line a macro supplies (a mod that builds its soldiers from shared macros: ("breed_look" skin(x)), ("kit_rifle")).
//   flat(input, key, readBuf, opt?) -> { text, expanded, partial }
//     input    Buffer or string of the soldier file; the answer's text has the same type
//     key      the file's game path (resource/set/breed/mp/ger/tankman.set): relative includes start there
//     readBuf  key -> Buffer | null: the caller's view of the game and the mod (the mod's file wins)
//     opt.mark true: every block a macro or an include supplied gets a last child {__macro}, so a caller can tell the soldier
//              file's own lines from the supplied ones (kit.js readBreed)
//     expanded false: the file has no ( .. ) line, text is the input itself
//     partial  true: an include or a macro was not found, so some lines are still missing
// Expansion is lib/sdlx (the engine's reader rules:. A (mod "name" ..) line is kept as its content [I: the
// game keeps it only while that mod is on]
// Author: Imperator_Aug (ARSENAL, ia-4bb6ab74)
const sdlx = require('./sdlx');

const MARK = '__macro';
function print(node, out, mark, top) {
  if (node.k === 'BLOCK') {
    if (node.disabled) return;
    out.push('{');
    for (const it of node.items) print(it, out, mark, false);
    if (mark && node.via && !top) out.push('{' + MARK + '}');
    out.push('}');
  } else if (node.k === 'MOD') { if (!node.not) for (const it of node.items) print(it, out, mark, top); }
  else if (node.k === 'STRING') out.push('"' + node.text + '"');
  else out.push(String(node.text));
}
function flat(input, key, readBuf, opt) {
  const isStr = typeof input === 'string', buf = isStr ? Buffer.from(input, 'utf8') : input;
  if (!buf || buf.indexOf(40) < 0) return { text: input, expanded: false, partial: false };   // 40 = (
  let partial = false;
  const open = r => {
    if (!r || r.kind !== 'virtual') return null;
    let b = null; try { b = readBuf(r.key); } catch (e) { b = null; }
    return b ? { buf: b, file: r.key, key: r.key } : null;
  };
  let root;
  try {
    root = sdlx.read(buf, { file: key, key, open, onError: (f, l, code) => { if (/^(INCLUDE_|MACRO_)/.test(code)) partial = true; } }).root;
  } catch (e) { return { text: input, expanded: false, partial: true }; }
  const lines = [];
  for (const it of root.items) { const out = []; print(it, out, !!(opt && opt.mark), true); lines.push(out.join(' ')); }
  // one block per line inside the top blocks reads better in an error message; the readers do not care
  const s = lines.join('\r\n').replace(/\} \{/g, '}\r\n{') + '\r\n';
  return { text: isStr ? Buffer.from(s, 'latin1').toString('utf8') : Buffer.from(s, 'latin1'), expanded: true, partial };
}
module.exports = { flat, MARK };
