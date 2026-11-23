// defcheck: FXD-1 parse check of a def goh2as2 writes, by the as64 reader rules that stop a whole game at load.
// checkDef(text, types) -> [{line, msg}]; text = latin1 string, types = Map from boneTypesOf (bone name -> '' plain | revolute | prizmatic | socket | planarsocket), may be null.
// Rules and where they come from (read for FXD-1 [V]):
//   revolute/prizmatic {limits}: bare, or exactly 2 numbers (ReadKeyword@585: IsNext(SDL_NUMBER) then two ReadFloat; a lone number = "Number expected!", esdlreader 117)
//   socket/planarsocket {limits}: bare, or exactly 1 number (@870); a second number = block terminator expected
//   {speed}/{speed2} (parametric bone@436): one number, 0 = ERROR_MSG "Zero speed in ik-bone"; on a plain bone (no type word in the mdl) the keyword is unknown = "unexpected token" (FMT-05)
//   SDL shape: unclosed { or (, stray } or ), unterminated string.
// Not caught: anything needing macro/include expansion, bone/volume/place names absent from the mdl, unknown keys (keylint), material/ply/anm load errors, define-not-found,
//   numbers/strings in the wrong slot of any other block, a block's own arity (only bone limits/speed are checked), engine ERROR_MSGs from later stages (pather, ammo, stuff).
// Author: Imperator_Aug (ARSENAL, ia-08400131)
const sdlw = require('../lib/sdlwrite');
const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
const lineOf = (src, pos) => { let n = 1; for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) n++; return n; };
const SOCKETY = new Set(['socket', 'planarsocket']), SINGLE = new Set(['revolute', 'prizmatic']);

// limits children of a def bone block whose argument count the as64 reader refuses for the mdl's bone type
function limitsArityBad(bone, types) {
  const s = bone.items.find(x => x.type === 'string');
  if (!s || !types) return [];
  const ty = types.get(s.text.replace(/^"|"$/g, '').toLowerCase());
  if (ty === '') return [];
  const out = [];
  for (const k of bone.items) {
    if (k.type !== 'block' || k.name !== 'limits') continue;
    const args = k.items.slice(1), nums = args.filter(a => a.type === 'atom' && NUM.test(a.text));
    const allNum = nums.length === args.length;
    // bone absent from the rep mdl: its type is unknown and donorfit may rename it onto a revolute bone (b8r3 m2a1: mgun -> mgun2 carried {limits 15} onto a revolute). One value is legal on a socket only, so it goes.
    if (ty === undefined) { if (args.length === 1) out.push({ node: k, type: 'absent from the mdl (a rename can land it on a revolute)', n: 1, want: '2 (or 1 on a socket)' }); continue; }
    const want = SINGLE.has(ty) ? [0, 2] : SOCKETY.has(ty) ? [0, 1] : null;
    if (want && (!allNum || !want.includes(nums.length))) out.push({ node: k, type: ty, n: args.length, want: want[1] });
  }
  return out;
}

function checkDef(text, types) {
  const out = [], t = sdlw.parse(Buffer.from(text, 'latin1')), src = t.src;
  const add = (pos, msg) => out.push({ line: lineOf(src, pos), msg });
  (function w(n) {
    for (const k of n.items) {
      if (k.type === 'stray') { add(k.start, `stray "${k.text}": unexpected token`); continue; }
      if (k.type === 'string' && !k.text.endsWith('"') || (k.type === 'string' && k.text.length < 2)) { add(k.start, 'unterminated string: String expected!'); continue; }
      if (k.type !== 'block' && k.type !== 'list') continue;
      if (!k.closed) add(k.start, `unclosed ${k.type === 'block' ? '{' : '('}: Block terminator expected!`);
      if (k.type === 'block' && k.name === 'bone' && types) {
        const s = k.items.find(x => x.type === 'string'), ty = s ? types.get(s.text.replace(/^"|"$/g, '').toLowerCase()) : undefined;
        for (const b of limitsArityBad(k, types)) add(b.node.start, `{limits} under {bone ${s.text}} (mdl type ${b.type}) has ${b.n} value(s), the reader takes 0 or ${b.want}: Number expected! / Block terminator expected!`);
        for (const c of k.items) {
          if (c.type !== 'block' || !/^(limits|speed2?)$/.test(c.name)) continue;
          if (ty === '') add(c.start, `{${c.name}} under {bone ${s.text}}: the mdl's bone is plain, keyword unknown: unexpected token`);
          if (c.name !== 'limits') {
            const a = c.items.slice(1);
            if (a.length !== 1 || !(a[0].type === 'atom' && NUM.test(a[0].text))) add(c.start, `{${c.name}} needs one number (${a.length} item(s) given): Number expected! / Block terminator expected!`);
            else if (parseFloat(a[0].text) === 0 && ty !== '') add(c.start, `{${c.name} 0} under {bone ${s.text}}: Zero speed in ik-bone`);
          }
        }
      }
      w(k);
    }
  })(t.root);
  return out;
}
module.exports = { checkDef, limitsArityBad, NUM };
