// ai.js: optional AI reader for gen --describe. Sends the user's words, the op rules and a short unit catalogue to Claude
// (Anthropic Messages API over https, no package: the toolkit ships as one exe without node_modules) and gets a gen spec back.
// The answer is data only: it is checked with specschema.checkSpec, limited to the ops a new unit needs, and run by gen like
// any spec (plan first). One retry with the findings; any failure returns { ok: false, error } and the caller uses describe.js.
//   key:   ANTHROPIC_API_KEY, else the first line of the file ARSENAL_AI_KEY_FILE names, else <home>/.arsenal/anthropic.key
//   model: ARSENAL_AI_MODEL (default claude-opus-5-5).  url: ANTHROPIC_BASE_URL (default https://api.anthropic.com)
// aiDescribe(text, cat, { schema, target, gunFacts, id }) -> { ok, spec, plan, understood[], assumed[], model } | { ok: false, error }
// available() -> { ok, why }   (a key was found; no request is made)
// Author: Imperator_Aug (ARSENAL, ia-5bfe94d0)
const fs = require('fs'), path = require('path'), os = require('os');
const D = require('./describe');
const lc = s => String(s == null ? '' : s).toLowerCase();
const MODEL = 'claude-opus-5-5';
const ALLOWED = ['clone', 'gun', 'weapon', 'kitbash', 'armor', 'set', 'roster', 'squad', 'text'];

function keyOf() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  for (const f of [process.env.ARSENAL_AI_KEY_FILE, path.join(os.homedir(), '.arsenal', 'anthropic.key')]) {
    try { if (f && fs.existsSync(f)) { const k = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].trim(); if (k) return k; } } catch (e) { /* unreadable: no key */ }
  }
  return null;
}
function available() {
  return keyOf() ? { ok: true, why: '' } : { ok: false, why: 'No API key found. Set the environment variable ANTHROPIC_API_KEY, or put the key in the file ' + path.join(os.homedir(), '.arsenal', 'anthropic.key') + ', then start the program again.' };
}

// one line per unit the buy panel holds: enough to pick a base, a gun and a turret donor
function catalogueText(cat) {
  const rows = [];
  for (const u of cat.units || []) {
    if (!u.buyable || (u.kind === 'vehicle' ? !u.def : u.kind !== 'squad')) continue;
    if (u.kind === 'squad') { rows.push([u.id, 'squad', u.army, u.cost, (u.members || []).map(m => m.breed + ':' + m.n).join(' '), u.name || ''].join('|')); continue; }
    const mac = (u.armorMacro || []).find(m => /^armor_(?!engine|mantlet)/.test(m.macro) && m.parts.some(p => p.values.length));
    rows.push([u.id, D.classOf(u), u.army, u.cost, u.speed == null ? '' : u.speed, u.gun ? u.gun.weapon + '@' + (u.gun.place || 'gun') : '',
      mac ? mac.macro + ' ' + mac.parts.map(p => p.name + '(' + p.values.join(' ') + ')').join(' ') : '', u.name || ''].join('|'));
  }
  return rows.join('\n');
}

const RULES = `You turn a modder's plain description of a new unit for Men of War: Assault Squad 2 into a spec for the ARSENAL "gen" tool.
The tool then builds a mod from the spec. The person may write loosely ("fast soviet heavy tank with a big gun"); you choose
sensible game values the way an experienced modder would, starting from the real game unit closest to what they describe.

The game cannot load new 3D models from words, so "a completely new unit" means: a copy of an existing unit that owns every
file (definition, model files, gun file, armour values, speed, buy-panel card, name), each under a new name, with the values
changed to fit the description. Every id and gun name you use as a starting point must come from the catalogue below, because
the tool refuses names the game data does not hold.

Ops, in the order to emit them for a vehicle or gun:
1. {"op":"clone","entity":<catalogue id>,"as":<new id>,"name":<display name>,"copy_assets":true}
   new id: lower-case letters, digits, _ ; starts with a letter; at most 28 chars; not ending in _x; not an id in the catalogue.
2. {"op":"gun","name":<new gun name>,"like":<gun of a catalogue unit>, optional "recharge":<seconds>, "pen_scale":<factor on
   the like gun's penetration, e.g. 1.2>, "range":"minimum|short|medium|long|maximum", "accuracy":"minimum|low|medium|high|maximum"}
   new gun name: "<calibre>mm_<new id>" (lower-case, at most 40 chars). Use the base unit's gun as "like" unless the description
   asks for another calibre; then use the catalogue gun nearest that calibre. Leave this op and op 4 out when the base has no gun.
3. optional {"op":"kitbash","entity":<new id>,"turret_from":<catalogue vehicle id>} only when the person asks for the turret of
   another vehicle. It moves model parts and needs checking in the editor, so never add it unasked.
4. {"op":"weapon","entity":<new id>,"weapon":<new gun name>,"place":<the part after @ in the base unit's gun column>}
5. optional {"op":"armor","entity":<new id>,"macro":<the base's armour macro name>,"value":{<part>:"front side rear top", ..}}
   Give every part the base lists, four whole numbers each (mm). A base with an empty armour column has no armour line: leave the op out.
   A macro shown as args(N) takes "value":"N".
6. optional {"op":"set","entity":<new id>,"values":{"game_entity/chassis/locomotion/maxspeed":<km/h>}} when speed changes and the base has a speed.
7. {"op":"roster","unit":<new id>,"like":<base id>,"army":<base army>,"fields":{"cost":<price>}}
   The card is copied inside the base unit's own army list, so the new unit appears in that nation's buy panel.
For an infantry squad emit only:
   {"op":"squad","name":<new id>,"like":<base id without its "(army)" suffix>,"army":<army>,"members":["breed:n", ..],"fields":{"cost":<price>},"display":<name>}
   members use breeds from the base squad's member list.

Price: when none is given, scale the base price with the changes (stronger gun, thicker armour, more speed cost more) and round to 5.
Stay within what the description asks; values it does not mention stay as the base has them.

Answer with one JSON object and nothing else:
{"understood":[short phrases: what you read from the description],
 "assumed":[short sentences: every choice you made that the person did not state, including the base unit and why],
 "spec":{"name":"<new id>_mod","title":<display name>,"ops":[..]}}
If the description cannot be met at all (for example no unit of that kind exists), answer {"error":"<one plain sentence>"}.

Catalogue columns for vehicles and guns: id|class|army|price|top speed|main gun@place|armour macro and parts (front side rear top)|name
Catalogue columns for squads: id|squad|army|price|members|name`;

async function call(body, key, signal) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const send = async (b, beta) => {
    const h = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    if (beta) h['anthropic-beta'] = beta;
    const r = await fetch(base + '/v1/messages', { method: 'POST', headers: h, body: JSON.stringify(b), signal });
    let j = null; try { j = await r.json(); } catch (e) { /* not JSON */ }
    return { status: r.status, j };
  };
  // refusals fall back to another model on the server (beta); an endpoint that does not know the field gets the plain request
  let r = await send(Object.assign({}, body, { fallbacks: 'default' }), 'server-side-fallback-2026-07-01');
  if (r.status === 400) r = await send(body, null);
  return r;
}
function httpError(r) {
  const m = r.j && r.j.error && r.j.error.message ? ' (' + String(r.j.error.message).slice(0, 160) + ')' : '';
  if (r.status === 401 || r.status === 403) return 'the API key was refused' + m + '.';
  if (r.status === 429) return 'the AI service is rate-limited right now' + m + '.';
  if (r.status >= 500) return 'the AI service had an error (' + r.status + ').';
  return 'the AI request failed with status ' + r.status + m + '.';
}
const textOf = msg => (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
function jsonOf(t) {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
}

// spec -> the short plan the page shows (same shape as describe.js)
function planOf(spec, cat) {
  const byId = new Map((cat.units || []).map(u => [lc(u.id), u]));
  const o = k => (spec.ops || []).find(x => x.op === k), cl = o('clone'), sq = o('squad'), ro = o('roster'), gun = o('gun'), kb = o('kitbash'), ar = o('armor'), st = o('set');
  if (sq) {
    const b = byId.get(lc(sq.like + '(' + sq.army + ')')) || {};
    const cost = sq.fields && sq.fields.cost != null ? +sq.fields.cost : b.cost;
    const ch = []; if (b.cost != null && cost !== b.cost) ch.push({ what: 'price', old: b.cost, new: cost });
    return { id: sq.name + '(' + sq.army + ')', name: sq.display || spec.title || sq.name, base: { id: b.id || sq.like, name: b.name || sq.like, army: sq.army, cost: b.cost }, kind: 'squad', cls: 'squad', changes: ch, cost };
  }
  if (!cl) return null;
  const b = byId.get(lc(cl.entity)) || {}, ch = [];
  if (gun) ch.push({ what: 'gun', old: b.gun ? b.gun.weapon : '', new: gun.name + ' (from ' + gun.like + ')' + ['recharge', 'pen_scale', 'range', 'accuracy'].filter(k => gun[k] != null).map(k => ', ' + k.replace('recharge', 'reload').replace('pen_scale', 'penetration x') + ' ' + gun[k]).join('') });
  if (kb) ch.push({ what: 'turret', old: b.name || cl.entity, new: ((byId.get(lc(kb.turret_from)) || {}).name || kb.turret_from) + ' (model parts; look at it in the editor)' });
  if (ar) ch.push({ what: 'armour (front side rear top)', old: ((b.armorMacro || []).find(m => m.macro === lc(ar.macro)) || { parts: [] }).parts.map(p => p.name + ' ' + p.values.join(' ')).join(', '), new: typeof ar.value === 'object' ? Object.entries(ar.value).map(([k, v]) => k + ' ' + v).join(', ') : String(ar.value) });
  const sp = st && st.values && st.values['game_entity/chassis/locomotion/maxspeed'];
  if (sp != null) ch.push({ what: 'top speed', old: b.speed, new: +sp });
  const cost = ro && ro.fields && ro.fields.cost != null ? +ro.fields.cost : b.cost;
  if (b.cost != null && cost !== b.cost) ch.push({ what: 'price', old: b.cost, new: cost });
  return { id: cl.as, name: cl.name || spec.title || cl.as, base: { id: cl.entity, name: b.name || cl.entity, army: b.army, cost: b.cost }, kind: 'vehicle', cls: b.id ? D.classOf(b) : '', changes: ch,
    gun: gun ? { name: gun.name, like: gun.like } : undefined, turretFrom: kb ? { id: kb.turret_from } : undefined, cost };
}

// checks beyond the schema: only the ops a new unit needs, and every starting point is a real catalogue unit
function vet(spec, cat, schema, target) {
  const out = [];
  if (!spec || typeof spec !== 'object' || !Array.isArray(spec.ops) || !spec.ops.length) return ['spec needs name and a non-empty ops list'];
  for (const x of require('./specschema').checkSpec(spec, schema, { target })) out.push(x.code + ' ' + x.msg);
  const ids = new Set((cat.units || []).map(u => lc(u.id))), made = new Set();
  spec.ops.forEach((s, i) => {
    const at = 'ops[' + i + '] ' + (s && s.op) + ': ';
    if (!s || !ALLOWED.includes(s.op)) { out.push(at + 'only these ops are allowed here: ' + ALLOWED.join(' ')); return; }
    if (s.op === 'clone') {
      if (!s.entity || !s.as) out.push(at + 'needs entity and as (stuff clones are not used here)');
      else { if (!ids.has(lc(s.entity))) out.push(at + 'entity "' + s.entity + '" is not a catalogue id'); if (ids.has(lc(s.as))) out.push(at + 'the new id "' + s.as + '" is already a unit'); if (!/^[a-z][a-z0-9_]{1,27}$/.test(String(s.as)) || /_x+$/.test(String(s.as))) out.push(at + 'bad new id "' + s.as + '"'); made.add(lc(s.as)); }
      if (s.set) out.push(at + 'do not use set inside clone; use the set op');
    }
    if (s.op === 'kitbash' && !ids.has(lc(s.turret_from))) out.push(at + 'turret_from "' + s.turret_from + '" is not a catalogue id');
    if (['weapon', 'kitbash', 'armor', 'set'].includes(s.op) && s.entity && !made.has(lc(s.entity))) out.push(at + 'entity "' + s.entity + '" must be the unit this spec clones (game units are not edited here)');
    if (s.op === 'set' && (s.csv || s.rows)) out.push(at + 'use {entity, values} only');
    if (s.op === 'roster' && !ids.has(lc(s.like))) out.push(at + 'like "' + s.like + '" is not a catalogue id');
    if (s.op === 'squad' && !ids.has(lc(s.like + '(' + s.army + ')'))) out.push(at + 'like "' + s.like + '" with army "' + s.army + '" is not a catalogue squad');
  });
  return out;
}

async function aiDescribe(text, cat, opt) {
  opt = opt || {};
  const key = keyOf();
  if (!key) return { ok: false, error: available().why };
  if (typeof fetch !== 'function') return { ok: false, error: 'this Node version has no fetch; AI mode needs Node 18 or newer.' };
  const model = process.env.ARSENAL_AI_MODEL || MODEL;
  // the keyword reader's result goes along as a draft: a grounded starting point the model may keep, fix or replace
  let draft = null; try { const d = D.describe(text, cat, { gunFacts: opt.gunFacts, id: opt.id }); if (d.ok) draft = d.spec; } catch (e) { /* no draft */ }
  const user = 'Description of the new unit:\n' + String(text).trim() + (opt.id ? '\n\nUse this new id: ' + opt.id : '') +
    (draft ? '\n\nA keyword reader produced this draft spec. It follows the op rules but reads only simple words; keep what fits the description and correct what does not:\n' + JSON.stringify(draft) : '');
  const body = { model, max_tokens: 16000, output_config: { effort: 'medium' },
    system: [{ type: 'text', text: RULES + '\n\nCatalogue:\n' + catalogueText(cat), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }] };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), opt.timeoutMs || 180000);
  try {
    for (let round = 0; round < 2; round++) {
      const r = await call(body, key, ctl.signal);
      if (r.status !== 200 || !r.j) return { ok: false, error: httpError(r) };
      const msg = r.j;
      if (msg.stop_reason === 'refusal') return { ok: false, error: 'the AI declined this description.' };
      if (msg.stop_reason === 'max_tokens') return { ok: false, error: 'the AI answer was cut off.' };
      const j = jsonOf(textOf(msg));
      let bad;
      if (!j) bad = ['the answer was not one JSON object'];
      else if (j.error) return { ok: false, error: 'the AI could not build it: ' + String(j.error).slice(0, 200) };
      else bad = vet(j.spec, cat, opt.schema, opt.target || 'as64');
      if (!bad.length) {
        const arr = v => (Array.isArray(v) ? v : []).map(x => String(x).slice(0, 300)).slice(0, 20);
        return { ok: true, spec: { name: String(j.spec.name || 'new_unit_mod'), title: j.spec.title ? String(j.spec.title) : undefined, ops: j.spec.ops }, plan: planOf(j.spec, cat), understood: arr(j.understood), assumed: arr(j.assumed), model: msg.model || model };
      }
      if (round) return { ok: false, error: 'the AI spec did not pass the checks (' + bad.slice(0, 3).join('; ').slice(0, 300) + ').' };
      // the assistant turn goes back unchanged (thinking blocks included), then the findings
      body.messages.push({ role: 'assistant', content: msg.content }, { role: 'user', content: 'The tool refused that spec:\n- ' + bad.slice(0, 12).join('\n- ') + '\nSend the corrected JSON object.' });
    }
    return { ok: false, error: 'no usable answer.' };
  } catch (e) {
    return { ok: false, error: e && e.name === 'AbortError' ? 'the AI did not answer in time.' : 'the AI service could not be reached (' + String(e && e.message || e).slice(0, 120) + ').' };
  } finally { clearTimeout(timer); }
}

module.exports = { aiDescribe, available, vet, planOf, catalogueText, keyOf, ALLOWED, MODEL };
