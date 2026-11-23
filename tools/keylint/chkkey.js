// keylint CHK-KEY checks (2h batch): tree rules (onBlock), raw-text armor macro pass (armorText), bot Lua pass (luaPass).
//   SDL-61 MTL_DIFFUSE_BARE  AI-01 SELECT_NO_CATCHALL  AI-05 AMMO_RULE_GAP  AI-12 WARN_BOT_API_UNKNOWN  AI-15 BOT_DATA_UNUSED_KEY
//   PORT-88 GOH_DEF_KEY_IGNORED  PORT-92 WARN_GOH_MP_KEY_IGNORED  SDL-43 TAGS_MULTI_STRING  TST-80 ARMOR_MACRO_ARGS
//   never: GPL-01 (95% of vanilla defs lack `able blast`; which shells hit is runtime), AI-18 (retreatLimit/spread are runtime sensor values)
// Author: Imperator_Aug (ARSENAL, ia-56c1c0d3)
const M = require('./model');

const ENT = new Set(['def', 'ext', 'inc', 'def1', 'mdl']);
const GOH_DEF_KEYS = new Set(['hp_broken', 'armor_damage_modifier', 'blastwave_modifier', 'flag_vaultable']);          // PORT-88: no reader in as64
const GOH_MP_KEYS = new Set(['cost_ap', 'cost_sp', 'squad_cost_factor', 'score_factor', 'research_stage', 'mapselection']);   // PORT-92 [I]
const BOT_COMMANDS = new Set(['spawn', 'saychat', 'captureflag', 'income', 'enemyhastanks']);   // commands export methods
const isParam = t => t && t.k === 'IDENT' && t.text[0] === '%';

function onBlock(x) {
  const { kind, key, cp, c, pkey, emit, pcp } = x;
  const t0 = cp.toks[0];

  // SDL-61: mtl {diffuse x} must be a quoted string ( "String expected!" kills the map load)
  if (kind === 'mtl' && key === 'diffuse' && t0 && t0.k !== 'STRING' && !isParam(t0))
    emit(t0, 'MTL_DIFFUSE_BARE', `{diffuse ${t0.text}}: the texture name must be a quoted string, {diffuse "${t0.text}"}; a bare word makes the map load fail with "String expected!"`);

  // SDL-43: tags reads ONE string, split on spaces; a second quoted string is not split into more tags
  // (.def top level only: {Tags "a" "b"} in volume / part blocks of .mdl .ext is a list reader, 88+3417 vanilla uses)
  if (key === 'tags' && ((kind === 'def' || kind === 'def1') && !x.path.includes('/') || kind === 'set/multiplayer.set' || kind === 'set/breed.set') && cp.keyTok && cp.keyTok.k === 'IDENT') {
    const ss = cp.toks.filter(t => t.k === 'STRING');
    if (ss.length >= 2) emit(c, 'TAGS_MULTI_STRING', `{tags} has ${ss.length} quoted strings: only the first is read as tags; write one string, {tags "${ss.map(t => t.value).join(' ')}"}`);
  }

  // PORT-88: GoH def keys the as64 engine never reads
  if (ENT.has(kind) && !x.goh && cp.keyTok && cp.keyTok.k === 'IDENT' && GOH_DEF_KEYS.has(key))
    emit(c, 'GOH_DEF_KEY_IGNORED', `"${cp.keyTok.text}" is a Gates of Hell key; as64 has no reader for it, so it does nothing (bake the effect into armor blocks, or drop it)`);

  // PORT-92: GoH unit/card settings keys the as64 multiplayer readers never read [I]
  if (kind === 'set/multiplayer.set' && !x.goh && cp.keyTok && cp.keyTok.k === 'IDENT' && GOH_MP_KEYS.has(key))
    x.warn(c, 'GOH_MP_KEY_IGNORED', `"${cp.keyTok.text}" is a Gates of Hell unit/card setting; as64 multiplayer readers are not known to read it, so it is probably ignored (drop it)`);

  // AI-01: a selector whose groups all have {select ..} terms drops every contact no term matches; a group without {select} takes the rest
  if (kind.startsWith('set/target') && key === 'selector' && cp.keyTok && cp.keyTok.k === 'IDENT') {
    const groups = cp.kids.filter(k => M.parts(k, false).key === 'group');
    const gp = groups.map(g => M.parts(g, false));
    const sel = gp.map(g => g.kids.filter(k => M.parts(k, false).key === 'select'));
    const inRange = k => { const p = M.parts(k, false); return p.toks.some(t => t.k === 'IDENT' && t.text.toLowerCase() === 'in_range') || p.kids.some(z => M.parts(z, false).key === 'in_range'); };
    const catchAll = sel.some(s => !s.length), range = sel.some(s => s.some(inRange));
    if (!catchAll && !range)
      emit(c, 'SELECT_NO_CATCHALL', groups.length ? 'every group has {select ..} terms and none is a late catch-all: a contact that matches no term is never attacked; add a last {group} without {select}, or a {select {in_range m}} group'
        : 'selector has no {group}: it selects no contact at all, so units with these tags never attack; add a {group {sort distance}}');
  }

  // AI-05: ammo.set {select_ammo {class [in_bush|in_cover] {"ammo" ..}..}}; engine appends a catch-all of priority -1 (never shoot) itself
  if (kind.startsWith('set/target') && pkey === 'select_ammo' && cp.keyTok && cp.keyTok.k === 'IDENT') {
    const cond = t => t && t.k === 'IDENT' && /^in_(bush|cover)$/i.test(t.text);
    if (!cp.kids.length) emit(c, 'AMMO_RULE_GAP', `ammo class "${cp.keyTok.text}" has no ammo rule: every ammo falls to the engine catch-all (priority -1), so this target class is never shot at; add {"bullet"} etc.`);
    else if (cond(t0) && pcp) {
      const sib = pcp.kids.filter(k => M.parts(k, false).key === key).map(k => M.parts(k, false));
      if (sib.every(p => cond(p.toks[0])) && pcp.kids.find(k => M.parts(k, false).key === key) === c)
        emit(c, 'AMMO_RULE_GAP', `ammo class "${cp.keyTok.text}" only has in_bush/in_cover blocks and no plain {${cp.keyTok.text} ...} block: targets in any other state get no ammo rule and are not shot at`);
    }
  }
}

// TST-80: raw text of a def-like file; armor macro call ("armor_x" turret(a b c d) body(..) | args N): parameter lists take 1, 2 or 4 numbers
function armorText(text) {
  const s = text.replace(/;[^\r\n]*/g, m => ' '.repeat(m.length)), out = [], re = /\(\s*"armor_\w+"/gi;
  let m;
  while ((m = re.exec(s))) {
    let d = 1, i = m.index + m[0].length; const st = i;
    while (i < s.length && d) { const ch = s[i++]; if (ch === '(') d++; else if (ch === ')') d--; }
    const body = s.slice(st, i - 1), line = s.slice(0, m.index).split('\n').length;
    const bad = [];
    const pr = /([A-Za-z_]\w*)\s*\(([^()]*)\)/g; let p;
    while ((p = pr.exec(body))) { const n = p[2].trim().split(/\s+/).filter(Boolean); if (n.length && n.every(v => /^[-+]?[\d.]+$/.test(v)) && ![1, 2, 4].includes(n.length)) bad.push(`${p[1]}(${n.length} values)`); }
    const ar = /\bargs\s+((?:[-+]?[\d.]+\s*)+)(?=\)|[A-Za-z_]|$)/.exec(body);
    if (ar) { const n = ar[1].trim().split(/\s+/); if (![1, 2, 4].includes(n.length)) bad.push(`args (${n.length} values)`); }
    if (bad.length) out.push({ line, msg: `armor macro call takes 1, 2 or 4 values per parameter (got ${bad.join(', ')}); the other counts are read wrongly: give 1 (all sides), 2 (front/side) or 4 (front/side/rear/top)` });
  }
  return out;
}

// bot Lua: strip comments and string contents (newlines kept)
function stripLua(t) {
  let o = '', i = 0;
  while (i < t.length) {
    const ch = t[i];
    if (ch === '-' && t[i + 1] === '-') {
      const lb = /^--\[(=*)\[/.exec(t.slice(i, i + 12));
      if (lb) { const e = t.indexOf(']' + lb[1] + ']', i); const end = e < 0 ? t.length : e + lb[1].length + 2; o += t.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
      while (i < t.length && t[i] !== '\n') { o += ' '; i++; } continue;
    }
    if (ch === '"' || ch === "'") { o += ch; i++; while (i < t.length && t[i] !== ch && t[i] !== '\n') { o += t[i] === '\\' ? '  ' : ' '; i += t[i] === '\\' ? 2 : 1; } if (t[i] === ch) { o += ch; i++; } continue; }
    o += ch; i++;
  }
  return o;
}
const isBotLua = k => /^resource\/script\/multiplayer\/bot[^/]*\.lua$/.test(k);
// -> [{ line, code, msg }] for one bot Lua file (key = virtual key)
function luaPass(key, text) {
  const s = stripLua(text), out = [], lineAt = ix => s.slice(0, ix).split('\n').length;
  let m;
  if (/(^|\/)bot\.data\.lua$/.test(key)) {
    const re = /(?<![\w.])(period|AttackBaseTime)\s*=(?!=)/g;
    while ((m = re.exec(s))) out.push({ line: lineAt(m.index), code: 'BOT_DATA_UNUSED_KEY', msg: `"${m[1]}" is never read by the bot (eras come from the preset unitset, AttackBaseTime is unused); remove it, it changes nothing` });
  }
  const ap = /BotApi\s*\.\s*Commands\s*[:.]\s*(\w+)/g;
  while ((m = ap.exec(s))) if (!BOT_COMMANDS.has(m[1].toLowerCase()))
    out.push({ line: lineAt(m.index), code: 'WARN_BOT_API_UNKNOWN', msg: `BotApi.Commands:${m[1]}: the bot API only has Spawn, SayChat, CaptureFlag, Income, EnemyHasTanks; there are no board, fire or retreat orders, this call does nothing or errors [I]` });
  return out;
}

module.exports = { onBlock, armorText, luaPass, isBotLua, stripLua };
