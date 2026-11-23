// describe.js: plain words -> a gen spec for a new unit. No model, no network: keyword and number reading against the unit
// catalogue (statsheet --units-json). describe(text, cat, opt) -> { ok, spec, plan, understood[], assumed[], error }.
//   cat.units: catalogue rows (kind vehicle|squad, army, cost, speed, gun.weapon, armorMacro, def, tags, buyable, name, members).
//   opt.gunFacts(name) -> { found, pen[5], recharge, range, accuracy, filling } (ops.gunFacts bound to a Ctx); without it gun
//   changes that need the base gun's numbers are left out and said so. opt.taken(id) -> true when the id is in use.
// What it reads: nation, class (tank light/medium/heavy, tank destroyer, artillery, AA, AT gun, armoured car, APC, truck, infantry
//   squad), a named unit to start from ("based on the Tiger", "like a T-34"), a turret donor ("with the turret of the IS-2"),
//   numbers (88mm, 120mm front armour, 45 km/h, cost 900, reload 5 s, 8 men), strength words (fast, heavily armoured, big gun,
//   rapid fire, accurate, long range, cheap ..) with very/slightly, and a name ("called Wolf" or in quotes).
// A new vehicle = own def + own model files (clone copy_assets), own gun file (gun), mounted (weapon), armour (armor), speed (set),
//   card (roster), optional kitbash. English keywords (+ a few German/Russian nation words).
// Author: Imperator_Aug (ARSENAL, ia-2addbe09)
const lc = s => String(s == null ? '' : s).toLowerCase();
const norm = s => lc(s).replace(/[^a-z0-9]+/g, '');
const r5 = n => Math.max(10, Math.round(n / 5) * 5);
const r1 = n => Math.round(n * 10) / 10;

const NATIONS = [
  { army: ['ger', 'ger2'], re: /\b(german|germany|wehrmacht|deutsch\w*|nazi|axis german|panzer)\b/, word: 'German' },
  { army: ['rus'], re: /\b(soviet|russian?|ussr|red army|sowjet\w*|rkka)\b/, word: 'Soviet' },
  { army: ['usa'], re: /\b(americans?|usa|u\.s\.a?\.?|us army|united states|yank\w*)\b/, word: 'American' },
  { army: ['eng'], re: /\b(british|britain|uk|english|england|commonwealth|royal)\b/, word: 'British' },
  { army: ['jap'], re: /\b(japanese|japan|imperial japan\w*|ija)\b/, word: 'Japanese' },
];
// GoH only (opt.goh): Finland is a GoH army; AS2 keeps the list above unchanged
const NATIONS_GOH = NATIONS.concat([{ army: ['fin'], re: /\b(finnish|finland|finns?|suomi)\b/, word: 'Finnish' }]);
// role words, most specific first. cls = internal class
const ROLES = [
  { cls: 'td', re: /\b(tank destroyers?|tank hunters?|td|assault guns?|jagdpanzer|self[- ]propelled (anti[- ]?tank|at) guns?)\b/, word: 'tank destroyer' },
  { cls: 'art', re: /\b(artillery|howitzers?|spg|self[- ]propelled (gun|artillery|howitzer)s?|rocket (launcher|artillery)s?)\b/, word: 'artillery' },
  { cls: 'aa', re: /\b(anti[- ]?air(craft)?|aa (gun|tank|vehicle)s?|aa|flak\w*|spaag)\b/, word: 'anti-aircraft' },
  { cls: 'atgun', re: /\b(anti[- ]?tank guns?|at guns?|field guns?|towed guns?)\b/, word: 'anti-tank gun' },
  { cls: 'mortar', re: /\b(mortars?)\b/, word: 'mortar' },
  { cls: 'mg', re: /\b(machine[- ]?gun (nest|post|emplacement)s?|hmg|stationary mg|mg nests?)\b/, word: 'machine gun post' },
  { cls: 'car', re: /\b(armou?red cars?|scout cars?|recon\w*( vehicles?| cars?)?|jeeps?|motorcycles?)\b/, word: 'armoured car' },
  { cls: 'apc', re: /\b(apcs?|half[- ]?tracks?|troop (carrier|transport)s?|armou?red (personnel )?carriers?|transports?)\b/, word: 'troop carrier' },
  { cls: 'truck', re: /\b(trucks?|lorr(y|ies)|supply (truck|vehicle)s?)\b/, word: 'truck' },
  { cls: 'tank', re: /(?<!anti[- ]?)\b(tanks?|panzers?)\b/, word: 'tank' },
  { cls: 'squad', re: /\b(squads?|infantry|soldiers?|riflemen|rifle squads?|troops|men|snipers?|commandos?|paratroop\w*|stormtroop\w*|engineers?|sappers?|grenadiers?|militia|partisans?|guards?)\b/, word: 'infantry squad' },
];
const WEIGHT = [
  { w: 'sheavy', re: /\b(super[- ]?heavy|superheavy|breakthrough)\b/ },
  { w: 'heavy', re: /\bheavy\b(?!\s+(armou?r|gun|cannon|weapon))/ },
  { w: 'medium', re: /\b(medium|main battle|mbt)\b/ },
  { w: 'light', re: /\blight\b(?!\s+(armou?r|gun|cannon|weapon))/ },
];
const INT = '(very|extremely|super|really|incredibly|massively|hugely|slightly|somewhat|a bit|a little|fairly|quite)?\\s*';
const amp = (w, k) => { w = lc(w || ''); const d = k - 1; return /very|extremely|super|really|incredibly|massively|hugely/.test(w) ? 1 + d * 1.8 : /slightly|somewhat|a bit|a little/.test(w) ? 1 + d * 0.45 : k; };
// trait words -> factor on speed / armour / penetration / reload time / cost; range and accuracy move one preset step
const TRAITS = [
  { t: 'speed', k: 1.25, re: new RegExp('\\b' + INT + '(fast|quick|speedy|agile|nimble|mobile|rapid(?!\\s*[- ]?fir))\\b'), say: 'faster' },
  { t: 'speed', k: 0.8, re: new RegExp('\\b' + INT + '(slow|sluggish|lumbering)\\b(?!\\s+(reload|fir|rate))'), say: 'slower' },
  { t: 'armor', k: 1.3, re: new RegExp('\\b' + INT + '(heavily armou?red|well[- ]armou?red|thick(er)? armou?r|heavy armou?r|strong armou?r|tough|durable|armou?red to the teeth|up[- ]?armou?red|more armou?r)\\b'), say: 'thicker armour' },
  { t: 'armor', k: 0.7, re: new RegExp('\\b' + INT + '(lightly armou?red|thin(ner)? armou?r|light armou?r|weak armou?r|paper armou?r|glass cannon|fragile|less armou?r)\\b'), say: 'thinner armour' },
  { t: 'pen', k: 1.25, re: new RegExp('\\b' + INT + '(big(ger)? (gun|cannon)|powerful( gun| cannon)?|strong(er)? (gun|cannon)|huge (gun|cannon)|high[- ]penetration|hard[- ]hitting|deadly|devastating|better (gun|cannon)|heavy (gun|cannon))\\b'), say: 'stronger gun' },
  { t: 'pen', k: 0.8, re: new RegExp('\\b' + INT + '(weak(er)? (gun|cannon)|small(er)? (gun|cannon)|low[- ]penetration|pea[- ]?shooter|light (gun|cannon))\\b'), say: 'weaker gun' },
  { t: 'reload', k: 0.75, re: new RegExp('\\b' + INT + '(rapid[- ]?fir\\w*|fast[- ]?fir\\w*|quick[- ]?fir\\w*|fast(er)? reload\\w*|quick(er)? reload\\w*|high rate of fire|autoloader|auto[- ]?cannon)\\b'), say: 'faster reload' },
  { t: 'reload', k: 1.3, re: new RegExp('\\b' + INT + '(slow(er)? reload\\w*|slow[- ]?fir\\w*|low rate of fire)\\b'), say: 'slower reload' },
  { t: 'range', k: 1, re: new RegExp('\\b' + INT + '(long(er)?[- ]rang\\w*|far[- ]reaching|sniper (gun|cannon|tank))\\b'), say: 'longer range' },
  { t: 'range', k: -1, re: new RegExp('\\b' + INT + '(short(er)?[- ]rang\\w*|close[- ]rang\\w*|brawler)\\b'), say: 'shorter range' },
  { t: 'acc', k: 1, re: new RegExp('\\b' + INT + '(accurate|precise|precision|pin[- ]?point)\\b'), say: 'more accurate' },
  { t: 'acc', k: -1, re: new RegExp('\\b' + INT + '(inaccurate|imprecise)\\b'), say: 'less accurate' },
  { t: 'cost', k: 0.8, re: new RegExp('\\b' + INT + '(cheap|budget|affordable|low[- ]cost|inexpensive|spammable)\\b'), say: 'cheaper' },
  { t: 'cost', k: 1.25, re: new RegExp('\\b' + INT + '(expensive|costly|premium|pricey)\\b'), say: 'more expensive' },
  { t: 'tier', k: 1, re: /\b(elite|veteran|best|top[- ]tier|late[- ]war|end[- ]?game|ultimate|monster|beast)\b/, say: 'top of its class' },
  { t: 'tier', k: -1, re: /\b(early[- ]war|basic|starter|entry[- ]level|obsolete|militia|conscripts?)\b/, say: 'bottom of its class' },
];
const RANGE = ['minimum', 'short', 'medium', 'long', 'maximum'], ACC = ['minimum', 'low', 'medium', 'high', 'maximum'];

function calibre(u) { const m = u && u.gun && /(?:^|_)(\d{2,3})mm/.exec(lc(u.gun.weapon)); return m ? +m[1] : null; }
function macroOf(u) {
  // the hull's own armour line: ("armor_heavy" turret(f s r t) body(..) body2(..)) | ("armor_spa_light" armor(..)) | ("armor_light" args N)
  for (const m of u.armorMacro || []) { const parts = m.parts.filter(p => p.values.length && p.values.every(v => typeof v === 'number')); if (parts.length && /^armor_(?!engine|mantlet)/.test(m.macro)) return { macro: m.macro, parts }; }
  return null;
}
const mainPart = m => m.parts.find(p => /^(body|armor|args)$/.test(p.name)) || m.parts[0];
const front = u => { const m = macroOf(u); const b = m && mainPart(m); return b ? b.values[0] : (u.armorMax ? u.armorMax.front : null); };
const hasTurret = u => !!((u.armorMacro || []).some(m => m.parts.some(p => p.name === 'turret')) || (u.armorAreas || []).some(a => a.name === 'turret'));
function classOf(u) {
  if (u.kind === 'squad') return 'squad';
  const tags = ' ' + lc(u.tags) + ' ', gun = lc(u.gun && u.gun.weapon), folder = (/resource\/entity\/[^/]+\/([^/]+)\//.exec(lc(u.def)) || [])[1] || '';
  if (/ hero | inf_only /.test(tags)) return 'other';
  if (/ deminer /.test(tags)) return 'other';
  if (/ supply /.test(tags)) return 'truck';
  if (/ (artillery|heavyart) /.test(tags)) return 'art';
  if (/flak|oerlikon|bofors|61-k|_x4|_x2|40mm_m19|20mm_type2|browning_x4/.test(gun)) return folder === 'cannon' ? 'aagun' : 'aa';
  if (folder === 'cannon') return /werfer|mortar/.test(gun) ? 'mortar' : calibre(u) ? 'atgun' : 'mg';
  if (folder === 'car') return 'car';
  if (folder === 'btr') return calibre(u) ? 'car' : 'apc';
  if (/^tank_/.test(folder)) return calibre(u) && calibre(u) >= 50 && !hasTurret(u) ? 'td' : 'tank';
  return 'other';
}
const weightOf = u => { const t = ' ' + lc(u.tags) + ' '; return / sheavy /.test(t) ? 'sheavy' : / heavy /.test(t) ? 'heavy' : / medium /.test(t) ? 'medium' : / light /.test(t) ? 'light' : ''; };
const pct = (arr, p) => { const a = arr.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null; };

// unit names in the text: [{u, at, len}] longest first, overlaps dropped
function mentions(text, units) {
  const t = ' ' + lc(text).replace(/[^a-z0-9]+/g, ' ') + ' ', out = [];
  // one word of a name counts only for a vehicle and only when it is not an everyday word (tiger, panther, sherman: yes; elite, heavy: no)
  const STOP = new Set(['tank', 'tanks', 'gun', 'light', 'medium', 'heavy', 'squad', 'scout', 'sniper', 'engineer', 'sapper', 'elite', 'veteran', 'assault', 'rifle', 'mortar', 'guards', 'infantry', 'crew', 'armored', 'armoured', 'heavy', 'support', 'supply', 'truck', 'wheeled', 'early', 'late', 'ausf', 'model', 'type', 'pzkpfw', 'sdkfz', 'custom', 'turret', 'm3', 'm5', 'm7', 'm8']);
  for (const u of units) {
    const names = new Set();
    for (const raw of [u.name, String(u.id).replace(/\(.*\)$/, '')]) {
      const s = lc(raw || '').replace(/[^a-z0-9]+/g, ' ').trim(); if (!s) continue;
      names.add(s);
      const w = s.split(' ');
      // "PzKpfw IV Ausf.H" -> also "pzkpfw iv"; "T-34/85" -> "t 34 85", "t 34" and "t34"
      if (w.length > 2 || (w.length === 2 && /^\d+$/.test(w[1]) === false && w[0].length <= 2)) names.add(w.slice(0, 2).join(' '));
      if (w.length > 2 && w[0].length <= 2) names.add(w.slice(0, 2).join(''));
      names.add(s.replace(/ /g, ''));
      if (u.kind === 'vehicle') for (const x of w) if (x.length >= 5 && !STOP.has(x) && !/^\d+$/.test(x)) names.add(x);
    }
    const full = lc(u.name || '').replace(/[^a-z0-9]+/g, ' ').trim();
    for (const n of names) {
      if (n.length < 3 || STOP.has(n) || /^\d+$/.test(n)) continue;
      const i = t.indexOf(' ' + n + ' ');
      if (i >= 0) out.push({ u, at: i, len: n.length, exact: n === full || n === lc(u.id), extra: Math.max(0, full.length - n.length) });
    }
  }
  // longest mention first; among units sharing it: the exact name, a usable class, in the buy panel, the name closest to what was written, the cheapest
  const usable = u => (u._cls && u._cls !== 'other' ? 0 : 1);
  out.sort((a, b) => b.len - a.len || (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || usable(a.u) - usable(b.u) || (b.u.buyable ? 1 : 0) - (a.u.buyable ? 1 : 0) || a.extra - b.extra || (a.u.cost || 0) - (b.u.cost || 0) || lc(a.u.id).localeCompare(lc(b.u.id)));
  const keep = [];
  for (const m of out) if (!keep.some(k => m.at < k.at + k.len + 1 && k.at < m.at + m.len + 1)) keep.push(m);
  return { list: keep.sort((a, b) => a.at - b.at), flat: t };
}

function describe(text, cat, opt) {
  opt = opt || {};
  const raw = String(text || '').trim(), t = lc(raw);
  const understood = [], assumed = [];
  if (raw.length < 3) return { ok: false, error: 'Describe the unit in a few words, for example: fast Soviet heavy tank with a big gun, cost 900.', understood, assumed };
  const units = (cat.units || []).filter(u => u.buyable && (u.kind === 'vehicle' ? !!u.def : u.kind === 'squad'));
  for (const u of units) u._cls = u._cls || classOf(u);
  const pool0 = units.filter(u => u._cls !== 'other');

  // ---- name
  let name = null, m;
  if ((m = /["“„]([^"”]{2,40})["”]/.exec(raw))) name = m[1].trim();
  else if ((m = /\b(?:called|named|name it|name is|call it)\s+(?:the\s+)?([A-Za-z0-9][\w'-]*(?:\s+[A-Z0-9][\w'-]*){0,3})/.exec(raw))) name = m[1].trim();
  const body = name ? t.replace(lc(m[0]), ' ') : t;

  // ---- nation, role, weight
  const nat = (opt.goh ? NATIONS_GOH : NATIONS).find(n => n.re.test(body));
  let role = ROLES.find(r => r.re.test(body));
  const wt = WEIGHT.find(w => w.re.test(body));
  if (!role && wt) role = ROLES.find(r => r.cls === 'tank');
  if (nat) understood.push('nation: ' + nat.word);
  if (role) understood.push('kind: ' + (wt && role.cls === 'tank' ? wt.w.replace('sheavy', 'super heavy') + ' ' : '') + role.word);

  // ---- numbers
  const num = {};
  if ((m = /\b(\d{2,3})\s*-?\s*mm\b(?!\s*(of\s+)?(front(al)?\s+|side\s+|rear\s+|thick\s+)?(armou?r|plate|thick))/.exec(body)) && !/(armou?r|front|thick|plate)\s*(of\s*)?$/.test(body.slice(0, m.index))) num.cal = +m[1];
  if ((m = /\b(\d{2,3})\s*-?\s*mm\s*(of\s+)?(front(al)?\s+|thick\s+)?(armou?r|plate|thick)/.exec(body) || /(armou?r|front(al)?( armou?r| plate)?|thickness)\s*(of|:|=)?\s*(\d{2,3})\s*(mm)?\b/.exec(body))) num.armor = +(m[1] > 0 ? m[1] : m[5]);
  if ((m = /\b(\d{2,3})\s*(km\/?h|kph|kmh)\b/.exec(body) || /\b(?:top )?speed\s*(?:of|:|=)?\s*(\d{2,3})\b/.exec(body))) num.speed = +m[1];
  if ((m = /\b(?:costs?|price|priced at|for)\s*(?:of|:|=)?\s*(\d{2,5})\b/.exec(body) || /\b(\d{2,5})\s*(points?|pts|mp|cp|credits?)\b/.exec(body))) num.cost = +m[1];
  if ((m = /\breload(?:s| time)?\s*(?:of|in|:|=)?\s*(\d+(?:\.\d+)?)\s*(s|sec|seconds?)?\b/.exec(body) || /\b(\d+(?:\.\d+)?)\s*(s|sec|seconds?)\s+reload/.exec(body))) num.reload = +m[1];
  if ((m = /\b(\d{2,3})\s*mm\s+(of\s+)?pen\w*/.exec(body) || /\bpen(?:etration)?\s*(?:of|:|=)?\s*(\d{2,3})\b/.exec(body))) num.pen = +m[1];
  if ((m = /\b(\d{1,2})\s*(men|man|soldiers?|troops|riflemen|members)\b/.exec(body) || /\bsquad of\s+(\d{1,2})\b/.exec(body))) num.men = +m[1];
  if (num.pen && num.cal === num.pen) delete num.cal;
  if (num.cal) understood.push('gun calibre: ' + num.cal + ' mm');
  if (num.armor) understood.push('front armour: ' + num.armor + ' mm');
  if (num.speed) understood.push('top speed: ' + num.speed + ' km/h');
  if (num.cost) understood.push('price: ' + num.cost);
  if (num.reload) understood.push('reload: ' + num.reload + ' s');
  if (num.pen) understood.push('penetration: ' + num.pen + ' mm at 100 m');
  if (num.men) understood.push('squad size: ' + num.men);

  // ---- trait words
  const K = { speed: 1, armor: 1, pen: 1, reload: 1, cost: 1 }; let dRange = 0, dAcc = 0, tier = 0;
  for (const tr of TRAITS) {
    const x = tr.re.exec(body); if (!x) continue;
    const inten = tr.t === 'tier' ? '' : x[1];
    if (tr.t === 'range') dRange += tr.k; else if (tr.t === 'acc') dAcc += tr.k; else if (tr.t === 'tier') tier += tr.k;
    else K[tr.t] *= amp(inten, tr.k);
    understood.push((!inten ? '' : /slightly|somewhat|a bit|a little/.test(lc(inten)) ? 'slightly ' : /fairly|quite/.test(lc(inten)) ? '' : 'much ') + tr.say);
  }

  // ---- named units: base and turret donor
  const men = mentions(body, pool0.concat(units.filter(u => u._cls === 'other' && u.kind === 'vehicle')));
  let base = null, donor = null;
  for (const x of men.list) {
    const before = men.flat.slice(Math.max(0, x.at - 28), x.at + 1), after = men.flat.slice(x.at + x.len + 1, x.at + x.len + 14);
    const isDonor = /\bturret (of|from|off)( the| an?)? $/.test(before) || /^ ?(s )?turret\b/.test(after);
    if (isDonor && x.u.kind === 'vehicle') { if (!donor) donor = x.u; } else if (!base) base = x.u;
  }
  if (/\b(kitbash|franken\w*|hybrid|mash[- ]?up)\b/.test(body) && men.list.length >= 2 && !donor) { const o = men.list.map(x => x.u).find(u => u !== base && u.kind === 'vehicle'); if (o) donor = o; }
  if (base) understood.push('start from: ' + (base.name || base.id));
  if (donor) understood.push('turret from: ' + (donor.name || donor.id));

  // ---- pick the unit to start from
  let pool = pool0;
  const cls = base ? base._cls : role ? role.cls : null;
  if (!base) {
    if (!role && !donor && !understood.length) return { ok: false, error: 'Nothing in that description was recognised. Name a kind of unit (tank, tank destroyer, anti-tank gun, squad ..), a nation, a unit to start from, or traits such as fast, heavy armour, big gun, cost 900.', understood, assumed };
    if (!role && !donor) { role = ROLES.find(r => r.cls === 'tank'); assumed.push('no kind of unit named: a tank is assumed'); }
    const want = role ? role.cls : 'tank';
    const byCls = u => want === 'aa' ? /^aa/.test(u._cls) : want === 'atgun' ? u._cls === 'atgun' : want === 'tank' ? (u._cls === 'tank' || (wt && u._cls === 'td')) : u._cls === want;
    let c = pool.filter(byCls);
    if (want === 'tank' && !c.length) c = pool.filter(u => u._cls === 'td');
    if (!c.length) return { ok: false, error: 'No unit of that kind (' + (role ? role.word : want) + ') is in the buy panel of this game data to start from.', understood, assumed };
    if (nat) { const n = c.filter(u => nat.army.includes(lc(u.army))); if (n.length) c = n; else assumed.push('no ' + nat.word + ' ' + role.word + ' in the game: the closest one of another nation is used and stays in that nation\'s panel'); }
    else assumed.push('no nation named: every nation was searched');
    if (wt && want !== 'squad') { const w = c.filter(u => weightOf(u) === wt.w || (wt.w === 'sheavy' && weightOf(u) === 'heavy')); if (w.length) c = w.filter(u => weightOf(u) === wt.w).length ? w.filter(u => weightOf(u) === wt.w) : w; else assumed.push('no ' + wt.w + ' one found: the weight word was dropped'); }
    // closeness to what was asked; without numbers the middle (or the top / bottom) of the class by price
    const costs = c.map(u => u.cost), tgtCost = num.cost ? num.cost / (K.cost || 1) : pct(costs, tier > 0 ? 0.9 : tier < 0 ? 0.1 : K.cost < 1 ? 0.3 : K.cost > 1 ? 0.7 : 0.5);
    const cals = c.map(calibre), tgtCal = num.cal || (K.pen > 1 ? pct(cals, 0.75) : K.pen < 1 ? pct(cals, 0.25) : null);
    const score = u => {
      let s = 0;
      if (tgtCal) s += calibre(u) ? Math.abs(calibre(u) - tgtCal) / tgtCal * 3 : 4;
      if (num.armor) s += front(u) ? Math.abs(front(u) - num.armor) / num.armor * 1.5 : 2;
      if (num.speed) s += u.speed ? Math.abs(u.speed - num.speed) / num.speed : 1;
      if (K.speed !== 1 && u.speed) s += (K.speed > 1 ? -1 : 1) * (u.speed - pct(c.map(x => x.speed), 0.5)) / 60;
      if (K.armor !== 1 && front(u)) s += (K.armor > 1 ? -1 : 1) * (front(u) - pct(c.map(front), 0.5)) / 250;
      if (tgtCost != null && u.cost) s += Math.abs(u.cost - tgtCost) / tgtCost * (num.cost || tier ? 1 : 0.6);
      if (want === 'squad') { const kw = /sniper|engineer|sapper|commando|paratroop|stormtroop|grenadier|militia|partisan|guard|assault|smg|rifle|mg|machine|bazooka|at |anti tank|officer|medic|flame/g; const a = new Set(body.match(kw) || []), nm = lc(u.name) + ' ' + lc(u.id); let hit = 0; for (const k of a) if (nm.includes(k.trim())) hit++; s -= hit * 2; if (num.men) s += Math.abs((u.members || []).reduce((x, y) => x + y.n, 0) - num.men) / num.men; }
      return s;
    };
    base = c.map(u => ({ u, s: score(u) })).sort((a, b) => a.s - b.s || lc(a.u.id).localeCompare(lc(b.u.id)))[0].u;
    assumed.push('started from ' + (base.name || base.id) + ' (' + base.army + ', price ' + base.cost + '): the closest game unit to the description');
  } else if (nat && !nat.army.includes(lc(base.army))) assumed.push((base.name || base.id) + ' is a ' + base.army + ' unit: the new unit goes into the ' + base.army + ' buy panel (a card is copied inside one nation\'s list)');

  // ---- id and name
  const baseName = base.name || String(base.id).replace(/\(.*\)$/, '');
  const named = !!name, sid = u => lc(String(u.id).replace(/\(.*\)$/, ''));
  if (!name) { name = baseName + (donor ? ' / ' + (donor.name || donor.id) + ' turret' : ' Custom'); assumed.push('no name given: "' + name + '"'); }
  let id = lc(opt.id || (named ? name : sid(base) + (donor ? '_' + sid(donor) : '_custom'))).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28).replace(/_+$/, '') || 'new_unit';
  if (!/^[a-z]/.test(id)) id = 'u_' + id;
  if (/_x+$/.test(id)) id += '1';
  const taken = x => (opt.taken && opt.taken(x)) || (cat.units || []).some(u => lc(u.id) === x || lc(u.id).startsWith(x + '('));
  for (let i = 2; taken(id) && i < 99; i++) id = id.replace(/_\d+$/, '') + '_' + i;

  const plan = { id, name, base: { id: base.id, name: baseName, army: base.army, cost: base.cost }, kind: base.kind, cls: base._cls, changes: [] };
  if (opt.goh) return gohPlan({ base, donor, id, name, plan, num, K, dRange, dAcc, understood, assumed, all: cat.units || [], gf: opt.gunFacts });
  const ops = [];
  let costK = K.cost;

  // ---- infantry squad
  if (base.kind === 'squad') {
    const mm = /^(.*)\(([^)]+)\)$/.exec(base.id), like = mm ? mm[1] : base.id, army = mm ? mm[2] : base.army;
    let members = (base.members || []).map(x => ({ breed: x.breed, n: x.n }));
    const total = members.reduce((a, b) => a + b.n, 0);
    if (num.men && total && num.men !== total) {
      const k = num.men / total; let left = num.men;
      members = members.map((x, i) => { const n = i === members.length - 1 ? left : Math.max(1, Math.round(x.n * k)); left -= n; return { breed: x.breed, n: Math.max(0, n) }; }).filter(x => x.n > 0);
      costK *= k; plan.changes.push({ what: 'men', old: total, new: num.men });
    }
    const cost = num.cost || (costK !== 1 ? r5(base.cost * costK) : base.cost);
    if (cost !== base.cost) plan.changes.push({ what: 'price', old: base.cost, new: cost });
    for (const k of ['speed', 'armor', 'pen', 'reload']) if (K[k] !== 1) assumed.push('a squad has no ' + (k === 'pen' ? 'gun strength' : k) + ' of its own to change here: that word was left out (change the soldiers\' weapons on the Units page)');
    ops.push({ op: 'squad', name: id, like, army, members: members.map(x => x.breed + ':' + x.n), fields: { cost }, display: name });
    plan.id = id + '(' + army + ')'; plan.cost = cost;
    return { ok: true, spec: { name: id + '_mod', title: name, ops }, plan, understood, assumed };
  }

  // ---- vehicle: own def + own model files
  ops.push({ op: 'clone', entity: base.id, as: id, name, copy_assets: true });

  // gun: start from the base's gun, or the game gun nearest the asked calibre (same nation first)
  const gf = n => (opt.gunFacts ? opt.gunFacts(n) : null);
  const baseGun = base.gun ? lc(base.gun.weapon) : null, baseCal = calibre(base);
  let gunLike = baseGun, gunCal = baseCal, gunK = 1;
  const donorGun = donor && donor.gun ? lc(donor.gun.weapon) : null;
  if (donorGun && !num.cal) { gunLike = donorGun; gunCal = calibre(donor); understood.push('gun: the donor turret\'s own (' + donorGun + ')'); }
  if (num.cal && (!gunCal || Math.abs(num.cal - gunCal) / num.cal > 0.06 || (donorGun && calibre(donor) && Math.abs(num.cal - calibre(donor)) / num.cal <= 0.06))) {
    const guns = new Map();
    for (const u of units.concat((cat.units || []).filter(x => x.kind === 'vehicle' && x.gun))) { const c = calibre(u); if (!c) continue; const g = lc(u.gun.weapon); const cur = guns.get(g); const own = lc(u.army) === lc(base.army) ? 0 : 1; if (!cur || own < cur.own) guns.set(g, { g, c, own, art: classOf(u) === 'art' }); }
    const isArt = base._cls === 'art';
    const best = [...guns.values()].sort((a, b) => Math.abs(a.c - num.cal) - Math.abs(b.c - num.cal) || (a.art === isArt ? 0 : 1) - (b.art === isArt ? 0 : 1) || a.own - b.own || a.g.localeCompare(b.g))[0];
    if (best) { if (baseCal) gunK = Math.pow(best.c / baseCal, 1.2); gunLike = best.g; gunCal = best.c; if (best.c !== num.cal) assumed.push('no ' + num.cal + ' mm gun in the game: the nearest, ' + best.c + ' mm (' + best.g + '), is the starting point'); }
  }
  const facts = gunLike ? gf(gunLike) : null;
  const inGunDir = !!(facts && facts.found);
  if (gunLike && inGunDir) {
    const gname = ((gunCal ? gunCal + 'mm_' : 'gun_') + id).slice(0, 40);
    const g = { op: 'gun', name: gname, like: gunLike }, said = [];
    if (num.reload) { g.recharge = num.reload; if (facts.recharge) gunK *= Math.pow(facts.recharge / num.reload, 0.5); said.push('reload ' + num.reload + ' s'); }
    else if (K.reload !== 1 && facts.recharge) { g.recharge = r1(facts.recharge * K.reload); gunK *= Math.pow(1 / K.reload, 0.5); said.push('reload ' + facts.recharge + ' -> ' + g.recharge + ' s'); }
    let pk = K.pen;
    if (num.pen && facts.pen && facts.pen[0] > 0) pk = num.pen / facts.pen[0];
    if (pk !== 1 && facts.pen) { g.pen_scale = Math.round(pk * 100) / 100; gunK *= Math.pow(pk, 0.8); said.push('penetration at 100 m ' + facts.pen[0] + ' -> ' + Math.round(facts.pen[0] * pk) + ' mm'); }
    else if (pk !== 1) assumed.push('the gun ' + gunLike + ' has no penetration table to scale: its strength was left as it is');
    const step = (lad, cur, d) => { const i = lad.indexOf(cur); return i < 0 || !d ? null : lad[Math.max(0, Math.min(lad.length - 1, i + d))]; };
    const nr = step(RANGE, facts.range, dRange), na = step(ACC, facts.accuracy, dAcc);
    if (nr && nr !== facts.range) { g.range = nr; gunK *= dRange > 0 ? 1.08 : 0.94; said.push('range ' + facts.range + ' -> ' + nr); } else if (dRange) assumed.push('the gun\'s range class (' + (facts.range || 'none') + ') has no step in that direction: range left as it is');
    if (na && na !== facts.accuracy) { g.accuracy = na; gunK *= dAcc > 0 ? 1.06 : 0.95; said.push('accuracy ' + facts.accuracy + ' -> ' + na); } else if (dAcc) assumed.push('the gun\'s accuracy class (' + (facts.accuracy || 'none') + ') has no step in that direction: accuracy left as it is');
    ops.push(g);
    plan.gun = { name: gname, like: gunLike, calibre: gunCal, changes: said };
    plan.changes.push({ what: 'gun', old: baseGun || '', new: gname + ' (from ' + gunLike + ')' + (said.length ? ': ' + said.join(', ') : '') });
  } else if (gunLike && (K.pen !== 1 || K.reload !== 1 || num.cal || num.reload || num.pen)) {
    assumed.push(opt.gunFacts ? 'its weapon (' + gunLike + ') is not a cannon file this tool can copy: the weapon was left as it is' : 'gun numbers were not read (no game data at hand): the weapon was left as it is');
    gunK = 1;
  } else if (!gunLike && (K.pen !== 1 || num.cal)) assumed.push((base.name || base.id) + ' carries no gun: the gun words were left out');

  // turret of another vehicle
  if (donor && donor.id !== base.id) {
    ops.push({ op: 'kitbash', entity: id, turret_from: donor.id });
    plan.turretFrom = { id: donor.id, name: donor.name || donor.id };
    plan.changes.push({ what: 'turret', old: baseName, new: (donor.name || donor.id) + ' (model parts; look at it in the editor)' });
  }
  if (plan.gun) ops.push({ op: 'weapon', entity: id, weapon: plan.gun.name, place: (base.gun && base.gun.place) || 'gun' });

  // armour: the armor_* macro parts turret / body
  const mac = macroOf(base); let aK = K.armor;
  if (num.armor && front(base)) aK = num.armor / front(base);
  if (aK !== 1 && mac) {
    const sc = p => p.values.map(v => Math.max(1, Math.round(v * aK))).join(' ');
    const onlyArgs = mac.parts.length === 1 && mac.parts[0].name === 'args';
    const value = {};
    for (const p of mac.parts) value[p.name] = sc(p);
    ops.push({ op: 'armor', entity: id, macro: mac.macro, value: onlyArgs ? sc(mac.parts[0]) : value });
    const b = mainPart(mac);
    plan.changes.push({ what: 'armour (front side rear top)', old: mac.parts.map(p => p.name + ' ' + p.values.join(' ')).join(', '), new: Object.entries(value).map(([k, v]) => k + ' ' + v).join(', ') });
    plan.armorFront = Math.round(b.values[0] * aK);
  } else if (aK !== 1) { assumed.push((base.name || base.id) + ' keeps its armour in per-part blocks, not in one armour line: armour was left as it is (use the armour change on the Units page)'); aK = 1; }

  // speed
  let sK = K.speed, speed = null;
  if (num.speed && base.speed) sK = num.speed / base.speed;
  if (sK !== 1 && base.speed) {
    speed = num.speed || Math.round(base.speed * sK);
    ops.push({ op: 'set', entity: id, values: { 'game_entity/chassis/locomotion/maxspeed': speed } });
    plan.changes.push({ what: 'top speed', old: base.speed, new: speed });
  } else if (sK !== 1) { assumed.push((base.name || base.id) + ' has no top speed value to change: speed left as it is'); sK = 1; }

  // price: follows the changes unless one was given
  let cost = num.cost;
  if (!cost) {
    const k = (1 + 0.6 * (aK - 1)) * gunK * (1 + 0.3 * (sK - 1)) * costK;
    cost = k !== 1 ? r5(base.cost * Math.max(0.3, Math.min(4, k))) : base.cost;
    if (cost !== base.cost) assumed.push('no price given: ' + cost + ' (the ' + (base.name || base.id) + ' costs ' + base.cost + '; scaled by the changes)');
  }
  if (cost !== base.cost) plan.changes.push({ what: 'price', old: base.cost, new: cost });
  plan.cost = cost;
  ops.push({ op: 'roster', unit: id, like: base.id, army: base.army, fields: { cost } });
  if (!plan.changes.length) assumed.push('nothing in the description changes a value: the new unit is a copy of ' + (base.name || base.id) + ' with its own files, gun and card');
  return { ok: true, spec: { name: id + '_mod', title: name, ops }, plan, understood, assumed };
}

// ---- Gates of Hell: the plan is one card copy (GUI units gohAdd: the card block under a new id in units/<period>/units_<army>.set,
// a card that buys its own entity clones that entity). What maps: the unit picked from the words, id, name, men count (the card's
// cN(<breed>:n) counts), price (the card's own cost(..); the game adds members x squad_cost_factor and rounds up, GHGPL-10). What
// does not: turret, and gun, armour, speed where the card has no vehicle copy of its own (refused[] pieces, one plain reason each;
// the GUI says them in four languages); gun words go as op.gun (lib/describe-gohgun.js) [I][T]
const GOH_WHY = {
  gun: 'only a card with its own vehicle copy, whose weapon is a cannon file of the game gun folder, can get a changed gun',
  armor: 'only a card with its own vehicle copy can carry new armour, and that armour must sit in the copy\'s own files (not two shared files deep)',
  speed: 'only a card with its own vehicle copy can carry a new top speed, and the speed(N) of its chassis must be in the copy\'s own files',
  turret: 'joining model parts of two vehicles is for Assault Squad 2 and the 64-bit build only',
  price: 'this squad is built by a macro call with no price of its own: the game adds up its members (GHGPL-10)',
};
function gohPlan(a) {
  const { base, donor, id, name, plan, num, K, dRange, dAcc, understood, assumed } = a;
  const refused = [], no = p => { if (!refused.some(r => r.piece === p)) refused.push({ piece: p, why: GOH_WHY[p] }); };
  let gArmor = null, gSpeed = null, gGun = null;
  if (donor && donor.id !== base.id) no('turret');
  if (base.kind === 'squad') { if (K.speed !== 1 || K.armor !== 1 || K.pen !== 1 || K.reload !== 1) assumed.push('a squad has no gun, armour or speed of its own to change here: those words were left out'); }
  else {
    // gun words: a gun op on the card op, run on the copy's own vehicle (lib/describe-gohgun.js; GUI units gohgun-copy.js)
    gGun = require('./describe-gohgun').plan({ base, id, num, K, dRange, dAcc, all: a.all, gf: a.gf, understood, assumed, no });
    if (gGun) plan.changes.push({ what: 'gun', old: base.gun.weapon, new: gGun.name + ' (from ' + gGun.like + ')' + (gGun.said.length ? ': ' + gGun.said.join(', ') : '') });
    // armour and speed go on the card op: the Units page applies them to the copy's own vehicle files (tools/gui/ext/units/goharmour.js)
    if (num.armor || K.armor !== 1) gArmor = num.armor ? { front: num.armor } : { k: K.armor };
    if (num.speed || K.speed !== 1) gSpeed = num.speed ? { kmh: num.speed } : { k: K.speed };
  }
  const short = x => String(x).split('/').pop();   // GoH breed ids: [mp/]<army>/<period>/<breed>; the card names <breed>:n
  let members = null, k = 1;
  const total = (base.members || []).reduce((s, x) => s + x.n, 0);
  if (base.kind === 'squad' && num.men && total && num.men !== total) {
    const ms = base.members.map(x => ({ breed: short(x.breed), n: x.n })); k = num.men / total; let left = num.men;
    members = ms.map((x, i) => { const n = i === ms.length - 1 ? left : Math.max(1, Math.round(x.n * k)); left -= n; return { breed: x.breed, n: Math.max(0, n) }; }).filter(x => x.n > 0);
    plan.changes.push({ what: 'men', old: total, new: num.men });
  }
  // price: the asked card total minus the members' part (scaled with the men) = the card's own cost(..)
  let price = null, cost = base.cost;
  const own = base.ownCost == null ? null : +base.ownCost, part = own == null ? null : Math.max(0, base.cost - own) * k;
  if (num.cost || K.cost !== 1) {
    const want = num.cost || r5(base.cost * K.cost);
    if (own == null) no('price');
    else {
      price = Math.max(0, Math.round(want - part));
      if (want - part < 0) assumed.push('the members alone cost about ' + Math.round(part) + ': the card\'s own price is set to 0');
      cost = Math.round(price + part); plan.changes.push({ what: 'price', old: base.cost, new: cost });
    }
  } else if (k !== 1 && own != null) { cost = Math.round(own + part); assumed.push('no price given: the card price follows the men (own price ' + own + ' + members, GHGPL-10), about ' + cost); }
  const period = String(base.period || '').toLowerCase();
  const side = /\(([^()]+)\)$/.exec(base.id);
  plan.id = side ? id + '(' + side[1] + ')' : id; plan.cost = cost; plan.period = period; plan.goh = true;
  if (!plan.changes.length && !refused.length && !gArmor && !gSpeed) assumed.push('nothing in the description changes a value: the new unit is a copy of ' + (base.name || base.id) + ' with its own card');
  const op = { op: 'gohcard', like: base.id, card: base.card || null, id, name, period, price };
  if (members) op.members = members.map(x => x.breed + ':' + x.n);
  if (gArmor) op.armor = gArmor;
  if (gSpeed) op.speed = gSpeed;
  if (gGun) op.gun = { name: gGun.name, like: gGun.like, place: gGun.place, recharge: gGun.recharge, pen_scale: gGun.pen_scale, range: gGun.range };
  return { ok: true, spec: { name: id + '_mod', title: name, goh: true, ops: [op] }, plan, understood, assumed, refused };
}

module.exports = { describe, classOf, calibre, mentions, GOH_WHY };
