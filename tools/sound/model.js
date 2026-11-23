// sound/model: how the game plays a sound, as pure functions over a key reader. API and shapes: tools/sound/README.md.
//   src = { read(key) -> Buffer|null, list(prefixKey) -> [keys under prefixKey/ (any depth)] }   keys: 'resource/sound/...' lower case
//   soundSet(read)                      -> { groups, loudness, order, errors, fatal, staleDefault }
//   folder(folderKey, read, set, cache?) -> effective folder.set settings after inheritance
//   resolve(name, list) -> { name, exists, folderKey, files, fixed, pick, warn } name rules
//   bag(files, rnd?) -> { next } shuffle bag; engineRandom(seed) = the engine LCG
//   options(text)                       -> the {sound} block of a profile options.set, defaults filled
//   plan(opts, src)                     -> everything a player needs for one play
//   render(dec, plan, {loops, maxSeconds}) -> { rate, channels:2, pcm:Int16Array }   offline render of one play
//   limits()                            -> voice-limit constants + simulate(requests, opts)
//   memSource(map)                      -> src over a { key: Buffer } map (tests, GUI drafts)
//   filtersSet(read)                    -> GoH resource/sound/filters/filters.set chains { present, chains:[{name, filters:[{type, ..values, stage}]}], stages, errors }
// Game: folder(.., cache, {game}) and plan({game}) take game 'goh' for the GoH rules [V by note, gohweb vision-fx/goh-sound-pools-media]:
//   GHVIS-29 a sub-folder's folder.set keeps the parent's min/max distance (only the top folder starts from the 'default' loudness);
//   GHVIS-30 folder {volume} also scales ambient (2D) plays; GHVIS-31 a positioned play in a folder with no min distance is stopped
//   (GOH_NO_MIN_DISTANCE, plan.ok false); GHVIS-33 filters.set chains ride on every positioned channel, dry at rest (plan.filters).
//   No game or any other game = the AS2 rules above, results unchanged. A cache shared across games keys GoH folders apart ('goh:' prefix).
// Engine rules cite path:line; [V] read in source, [I] inferred (Miles closed), [T] needs an in-game test. Maths: play.src.js.
// Author: Imperator_Aug (ARSENAL, ia-50fea22c)
'use strict';
const wav = require('../lib/wav'), sdlx = require('../lib/sdlx'), M = require('./play.src');

const ROOT = 'resource/sound';
const SET_KEY = ROOT + '/sound.set';
const U = M.UNITS_PER_METER;
const GROUP_IDS = { effects: 0, emotions: 1, speech: 2, environment: 3 };   // GetGroup , else other (4)

const norm = k => String(k || '').replace(/\\/g, '/').toLowerCase().replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
const dirOf = k => { const i = k.lastIndexOf('/'); return i < 0 ? '' : k.slice(0, i); };
const baseOf = k => k.slice(k.lastIndexOf('/') + 1);
const titleOf = k => { const b = baseOf(k), i = b.lastIndexOf('.'); return i <= 0 ? b : b.slice(0, i); };   //  [I: last extension]
const round = (v, n = 4) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10 ** n) / 10 ** n : v);

// ---------- SDL ----------
function readSdl(key, read) {
  const buf = read(key);
  if (!buf) return null;
  const errors = [];
  const open = r => { if (r.kind !== 'virtual') return null; const b = read(r.key); return b ? { buf: b, file: r.key, key: r.key } : null; };
  let res;
  try { res = sdlx.read(buf, { file: key, key, open, onError: (f, l, c, m) => errors.push({ code: 'SDL_' + c, level: 'warn', msg: `${f}:${l} ${m}`, line: l }) }); }
  catch (e) { return { root: null, errors: [{ code: 'SDL_THROW', level: 'error', msg: e.message }] }; }
  return { root: res.root, errors };
}
// the root block with its signature (sdlreader(name, "sound")): { sig, items (after the signature), line }
function sigBlock(root) {
  const top = root && root.items.find(n => n.k === 'BLOCK');
  if (!top) return null;
  const first = top.items[0];
  const sig = first && first.k === 'IDENT' ? first.text : null;
  return { sig, items: sig ? top.items.slice(1) : top.items, line: top.line };
}
const word = n => (n && (n.k === 'IDENT' ? n.text : n.k === 'STRING' ? n.value : null));
const num = n => (n && (n.k === 'INTEGER' || n.k === 'FLOAT') ? n.value : null);

// ---------- sound.set [V] ----------
function soundSet(read) {
  const errors = [];
  const groups = {};
  for (const g of M.GROUPS) groups[g] = { percent: M.DEFAULT_SHARE * 100, share: M.DEFAULT_SHARE, max: M.DEFAULT_LIMIT, volume: M.DEFAULT_GROUP_VOLUME, rows: [] };
  const out = { key: SET_KEY, groups, loudness: {}, order: [], defaultName: null, errors, fatal: null, staleDefault: false };
  const r = readSdl(SET_KEY, read);
  if (!r) { errors.push({ code: 'NO_SOUND_SET', level: 'error', msg: `${SET_KEY} not found: no groups, no loudness; the first folder.set read crashes (no 'default')` }); out.fatal = 'NO_DEFAULT_LOUDNESS'; return out; }
  errors.push(...r.errors);
  const b = sigBlock(r.root);
  if (!b) { errors.push({ code: 'EMPTY', level: 'error', msg: 'sound.set has no {sound ...} block' }); out.fatal = 'NO_DEFAULT_LOUDNESS'; return out; }
  if (b.sig && b.sig.toLowerCase() !== 'sound') errors.push({ code: 'SIGNATURE', level: 'warn', msg: `root block is {${b.sig}}, the reader asks for {sound} [I]`, line: b.line });
  let defaultIndex = -1;
  for (const n of b.items) {
    if (n.k !== 'BLOCK') { errors.push({ code: 'STRAY_TOKEN', level: 'warn', msg: `'${n.text || n.k}' outside a block: the reader stops here (IsNext(SDL_BLOCK_START) loop) [I]`, line: n.line }); break; }
    const kw = word(n.items[0]), k = kw && kw.toLowerCase(), a = n.items.slice(1);
    if (k === 'percent') {                                       //
      const gname = word(a[0]) || '', g = M.GROUPS[groupId(gname)];
      const share = num(a[1]);
      if (share === null) { errors.push({ code: 'BAD_VALUE', level: 'warn', msg: `{percent "${gname}"} needs a number`, line: n.line }); continue; }
      groups[g].share = share / 100; groups[g].percent = share;
      if (num(a[2]) !== null) groups[g].max = Math.trunc(num(a[2]));   // IsNext(SDL_NUMBER) then ReadInt [I: float truncated]
      groups[g].rows.push(gname);
      if (!(gname.toLowerCase() in GROUP_IDS)) errors.push({ code: 'GROUP_OTHER', level: 'info', msg: `{percent "${gname}"} is not a group the engine knows: it sets the share of group 'other' (GetGroup, VIS-09)`, line: n.line });
    } else if (k === 'loudness') {                               //
      const name = word(a[0]);
      if (name === null || num(a[1]) === null || num(a[2]) === null) { errors.push({ code: 'BAD_VALUE', level: 'warn', msg: '{loudness "name" min max [priority]} needs a name and two numbers', line: n.line }); continue; }
      const lk = name.toLowerCase();
      let L = out.loudness[lk];
      if (!L) {
        L = out.loudness[lk] = { name, min: 0, max: 0, minUnits: 0, maxUnits: 0, priority: -1, line: n.line };   // loudness: priority -1
        out.order.push(lk);
        if (lk === 'default') { out.defaultName = name; defaultIndex = out.order.length - 1; }
      } else errors.push({ code: 'LOUDNESS_DUP', level: 'info', msg: `loudness "${name}" again: the later row overwrites the values`, line: n.line });
      L.min = num(a[1]); L.max = num(a[2]); L.minUnits = L.min * U; L.maxUnits = L.max * U;
      if (a[3] && a[3].k === 'INTEGER') L.priority = a[3].value;   // IsNext(SDL_INTEGER)
      else if (a[3] && a[3].k === 'FLOAT') errors.push({ code: 'PRIORITY_FLOAT', level: 'warn', msg: `loudness "${name}": priority ${a[3].text} is not an integer: not read, the block end sees it [I]`, line: n.line });
    } else errors.push({ code: 'UNEXPECTED_TOKEN', level: 'warn', msg: `{${kw}} in sound.set: engine logs unexpected token (:187)`, line: n.line });
  }
  if (defaultIndex < 0) { out.fatal = 'NO_DEFAULT_LOUDNESS'; errors.push({ code: 'NO_DEFAULT_LOUDNESS', level: 'error', msg: "No 'default' loudness in sound.set: the first folder.set read logs this error and crashes on the null loudness" }); }
  else if (defaultIndex < out.order.length - 1) {
    // VIS-27: defaultLoudness = &loudness.back then later push_back may move the vector: the pointer goes stale
    out.staleDefault = true;
    errors.push({ code: 'STALE_DEFAULT', level: 'info', msg: `'default' is row ${defaultIndex + 1} of ${out.order.length}: later rows grow the vector and leave the engine's default pointer stale; an unknown loudness name then reads freed memory (VIS-27) [V, T symptom]` });
  }
  return out;
}
function groupId(name) { const k = String(name || '').toLowerCase(); return k in GROUP_IDS ? GROUP_IDS[k] : 4; }
function loudnessOf(set, name, orDefault) {                     // (case-insensitive)
  const L = set.loudness[String(name).toLowerCase()];
  if (L) return L;
  return orDefault && set.loudness.default ? set.loudness.default : null;
}

// ---------- folder.set [V, 134-181] ----------
const KW = ['tag', 'distance', 'signal', 'volume', 'signalperiod', 'mindistance', 'maxdistance', 'loudness'];   //
function folderDefaults() {   // folder
  return { group: 'other', groupId: 4, minUnits: M.FOLDER_MIN_UNITS, maxUnits: M.FOLDER_MAX_UNITS, signalPeriod: -1, priority: -1, signal: null, volume: 1, loudness: null, groupKnown: false };
}
function readFolderSet(setKey, read, set, st, warnings, keepParent) {
  const own = {};
  const r = readSdl(setKey, read);
  if (!r) return own;
  for (const e of r.errors) warnings.push(Object.assign({ key: setKey }, e));
  // every folder.set read starts from the 'default' loudness distances (not the parent's); priority is NOT reset
  // GoH (keepParent): a sub-folder keeps the parent's distances, only the top folder starts from 'default' (GHVIS-29)
  const def = loudnessOf(set, 'default', true);
  if (!def) {
    warnings.push({ key: setKey, code: 'NO_DEFAULT_LOUDNESS', level: 'error', msg: "No 'default' loudness in sound.set: the engine logs it and then crashes reading this folder.set" });
    st.fatal = true; return own;
  }
  if (!keepParent) { st.minUnits = def.minUnits; st.maxUnits = def.maxUnits; own.reset = 'default'; }
  const b = sigBlock(r.root);
  if (!b) return own;
  if (b.sig && b.sig.toLowerCase() !== 'sound') warnings.push({ key: setKey, code: 'SIGNATURE', level: 'warn', msg: `root block is {${b.sig}}, the reader asks for {sound} [I]`, line: b.line });
  for (const n of b.items) {
    if (n.k !== 'BLOCK') { warnings.push({ key: setKey, code: 'STRAY_TOKEN', level: 'warn', msg: `'${n.text || n.k}' outside a block: the reader stops reading this folder.set here [I]`, line: n.line }); break; }
    const kw = word(n.items[0]), k = kw && kw.toLowerCase(), a = n.items.slice(1);
    const bad = what => warnings.push({ key: setKey, code: 'BAD_VALUE', level: 'warn', msg: `{${kw}} needs ${what} [I, value kept]`, line: n.line });
    if (!KW.includes(k)) { warnings.push({ key: setKey, code: 'UNEXPECTED_TOKEN', level: 'warn', msg: `{${kw}}: not a folder.set key (Tag Distance Signal Volume SignalPeriod MinDistance MaxDistance Loudness); engine logs unexpected token (:175)`, line: n.line }); continue; }
    switch (k) {
      case 'tag': {                                                // ReadIdentifier
        const t = word(a[0]);
        if (t === null) { bad('a group name'); break; }
        if (a[0].k === 'STRING') warnings.push({ key: setKey, code: 'TAG_QUOTED', level: 'info', msg: `{tag "${t}"} is quoted: the reader asks for an identifier [I: may be refused]`, line: n.line });
        st.groupId = groupId(t); st.group = M.GROUPS[st.groupId]; st.groupKnown = t.toLowerCase() in GROUP_IDS; own.tag = t;
        if (!st.groupKnown) warnings.push({ key: setKey, code: 'TAG_UNKNOWN', level: 'info', msg: `{tag ${t}}: not effects/emotions/speech/environment: the folder plays in group 'other' (environment volume) (VIS-09)`, line: n.line });
        break;
      }
      case 'distance':                                             // two floats, meters
        if (num(a[0]) === null || num(a[1]) === null) { bad('two numbers (min max meters)'); break; }
        st.minUnits = num(a[0]) * U; st.maxUnits = num(a[1]) * U; own.distance = [num(a[0]), num(a[1])]; st.loudness = null; break;
      case 'maxdistance':
        if (num(a[0]) === null) { bad('a number'); break; }
        st.maxUnits = num(a[0]) * U; own.maxDistance = num(a[0]); break;
      case 'mindistance':
        if (num(a[0]) === null) { bad('a number'); break; }
        st.minUnits = num(a[0]) * U; own.minDistance = num(a[0]); break;
      case 'signal':                                               // name radius
        st.signal = { name: word(a[0]), radius: num(a[1]) }; own.signal = st.signal; break;
      case 'signalperiod':
        if (num(a[0]) === null) { bad('a number (seconds)'); break; }
        st.signalPeriod = num(a[0]); own.signalPeriod = st.signalPeriod; break;
      case 'loudness': {                                           //
        const nm = word(a[0]);
        if (nm === null) { bad('a loudness name'); break; }
        let L = loudnessOf(set, nm, false);
        if (!L) {
          L = loudnessOf(set, 'default', true);
          warnings.push({ key: setKey, code: 'LOUDNESS_UNKNOWN', level: 'warn', msg: `{loudness "${nm}"}: not in sound.set; the engine falls back to 'default'` + (set.staleDefault ? ' through a stale pointer (VIS-27): garbage distances possible [T]' : ''), line: n.line });
        }
        st.minUnits = L.minUnits; st.maxUnits = L.maxUnits; st.priority = L.priority; st.loudness = L.name; own.loudness = nm; break;
      }
      case 'volume':
        if (num(a[0]) === null) { bad('a number'); break; }
        st.volume = num(a[0]); own.volume = st.volume; break;
    }
  }
  return own;
}

function folder(folderKey, read, set, cache, fo) {
  const key = norm(folderKey), goh = !!(fo && fo.game === 'goh'), ck = (goh ? 'goh:' : '') + key;
  if (cache && cache.has(ck)) return cache.get(ck);
  if (key !== ROOT && !key.startsWith(ROOT + '/')) throw new Error(`folder key must be under ${ROOT}/: ${folderKey}`);
  const set0 = set || soundSet(read);
  let parent = null;
  if (key !== ROOT) parent = folder(dirOf(key), read, set0, cache, fo);   // GetFolder loads parents first
  const st = parent ? {
    group: parent.group, groupId: parent.groupId, groupKnown: parent.groupKnown, minUnits: parent.minUnits, maxUnits: parent.maxUnits,
    signalPeriod: parent.signalPeriod, priority: parent.priority, signal: parent.signal, volume: parent.volume, loudness: parent.loudness,
  } : folderDefaults();                                           // copies group, distances, signalPeriod, priority, signal, volume
  const warnings = [];
  const setKey = key + '/folder.set';
  const has = !!read(setKey);
  const own = has ? readFolderSet(setKey, read, set0, st, warnings, goh && !!parent) : null;
  if (has && own.reset === 'default' && !own.loudness && !own.distance) st.loudness = 'default';
  const chain = (parent ? parent.chain : []).concat([{ key, setKey: has ? setKey : null, own }]);
  const out = {
    key, group: st.group, groupId: st.groupId, groupKnown: st.groupKnown,
    volume: st.volume, minDistance: st.minUnits / U, maxDistance: st.maxUnits / U, minUnits: st.minUnits, maxUnits: st.maxUnits,
    priority: st.priority, loudness: st.loudness, signal: st.signal, signalPeriod: st.signalPeriod,
    hasSet: has, anySet: chain.some(c => c.setKey), fatal: !!(st.fatal || (parent && parent.fatal)),
    chain, warnings: (parent ? parent.warnings : []).concat(warnings),
  };
  if (cache) cache.set(ck, out);
  return out;
}

// ---------- GoH filters.set [V by note gohweb vision-fx/sound-filters-set, GHVIS-33; device sound manager LoadSoundEffects] ----------
const FILTERS_KEY = ROOT + '/filters/filters.set';
const FILTER_KEYS = { bandpass: { center: 2000, width: 400, strength: 1 }, lowpass: { cutoff: 100, strength: 1 }, parameq: { center: 1000, q: 1, gain: -8, strength: 1 } };
const FREQ_KEYS = ['center', 'width', 'cutoff'], MIN_FREQUENCY = 20, MAX_STAGES = 8;
function filtersSet(read) {
  const out = { key: FILTERS_KEY, present: false, chains: [], stages: 0, errors: [] };
  const r = readSdl(FILTERS_KEY, read);
  if (!r) return out;
  out.present = true;
  for (const e of r.errors) out.errors.push(Object.assign({ key: FILTERS_KEY }, e));
  if (!r.root) return out;
  const err = (code, level, msg, line) => out.errors.push({ key: FILTERS_KEY, code, level, msg, line });
  for (const n of r.root.items) {
    if (n.k !== 'BLOCK') continue;
    const name = word(n.items[0]), chain = { name, filters: [], line: n.line };
    for (const f of n.items.slice(1)) {
      if (f.k !== 'BLOCK') continue;
      const type = word(f.items[0]), t = type && type.toLowerCase(), def = FILTER_KEYS[t];
      if (!def) { err('FILTER_UNKNOWN', 'error', `${name}: filter type '${type}' is not bandpass, lowpass or paramEq: GoH uses a null filter and crashes (GHVIS-33)`, f.line); continue; }
      const vals = Object.assign({}, def);
      for (const kv of f.items.slice(1)) {
        if (kv.k !== 'BLOCK') continue;
        const k = word(kv.items[0]), lk = k && k.toLowerCase();
        if (!(lk in def)) { err('UNEXPECTED_TOKEN', 'warn', `${name}/${type}: {${k}} is not a ${t} key (${Object.keys(def).join(' ')}): engine logs unexpected token`, kv.line); continue; }
        const v = num(kv.items[1]);
        if (v === null) { err('BAD_VALUE', 'warn', `${name}/${type}: {${k}} needs a number (default ${def[lk]} kept)`, kv.line); continue; }
        vals[lk] = v;
      }
      if (vals.strength < 0 || vals.strength > 1) { err('STRENGTH_CLAMPED', 'info', `${name}/${type}: strength ${vals.strength} clamped to 0..1`, f.line); vals.strength = Math.min(1, Math.max(0, vals.strength)); }
      for (const k of FREQ_KEYS) if (k in vals && vals[k] < MIN_FREQUENCY) { err('FREQ_RAISED', 'info', `${name}/${type}: ${k} ${vals[k]} below ${MIN_FREQUENCY} Hz: raised to ${MIN_FREQUENCY}`, f.line); vals[k] = MIN_FREQUENCY; }
      out.stages++;
      chain.filters.push(Object.assign({ type: t, stage: out.stages }, vals));
    }
    out.chains.push(chain);
  }
  if (out.stages > MAX_STAGES) err('FILTER_STAGES', 'warn', `${out.stages} filters in all: more than ${MAX_STAGES} run past GoH's sample stage table [I] (GHVIS-33)`);
  return out;
}

// ---------- name resolution [V] ----------
function directChildren(dirKey, list) {
  const pre = dirKey + '/';
  return (list(dirKey) || []).map(norm).filter(k => k.startsWith(pre) && k.indexOf('/', pre.length) < 0);
}
function wavsOf(dirKey, list) {
  //  lists direct-child *.wav in the index order (sorted map) [I: byte order of lower-case keys]
  return [...new Set(directChildren(dirKey, list).filter(k => k.endsWith('.wav')))].sort();
}
function resolve(name, list) {
  const n = norm(name);
  const asFolder = n ? ROOT + '/' + n : ROOT;
  const exists = directChildren(asFolder, list).length > 0;     // any direct file (folder.set alone counts)
  let folderKey, title = '';
  if (exists) folderKey = asFolder;
  else { folderKey = dirOf(asFolder); title = titleOf(n); }      // PART_DIRECTORY + PART_TITLE (extension dropped)
  const files = wavsOf(folderKey, list);
  const warn = `unknown sound file '${name}'`;                   //,
  const out = { name: n, exists, folderKey, files, fixed: null, pick: null, warn: null };
  if (!files.length) { out.warn = warn; return out; }
  if (title) {
    const f = files.find(k => titleOf(k) === title) || null;    //  by name (title)
    if (!f) { out.warn = warn; return out; }
    out.fixed = f; out.pick = 'fixed';
  } else out.pick = files.length === 1 ? 'single' : 'random';
  return out;
}

// ---------- shuffle bag [V] ----------
function engineRandom(seed = 1) {                                // RandomBits
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 0x7ff8a3ed) + 0x2aa01d31) >>> 0; return s >>> 8; };
}
function bag(files, rnd) {
  const f = files.slice(), r = rnd || engineRandom(1);
  let unpicked = 0;
  return {
    files: f,
    next() {
      const count = f.length;
      if (!count) return null;
      if (count === 1) return f[0];
      if (unpicked === 0) unpicked = count;
      const index = r() % unpicked;
      --unpicked;
      const t = f[unpicked]; f[unpicked] = f[index]; f[index] = t;   // SwapByCopy
      return f[unpicked];
    },
  };
}

// ---------- user options [V; file = <user dir>/profiles/<id>/options.set {options {sound ..}}] ----------
const OPTION_DEFAULTS = { speakerConfig: 'use_system_settings', rate: 44100, buffers: 16, master: 100, effects: 50, emotions: 50, environment: 50, interface: 50, game_music: 50, narrator: 50 };   //
const RATES = { '11_khz': 11025, '22_khz': 22050, '44_khz': 44100 };            //
const BUFFERS = { 16: 16, 32: 32, 64: 56 };                                       //  ("64" is 56)
function options(text) {
  const o = Object.assign({}, OPTION_DEFAULTS), found = {};
  if (!text) return Object.assign(o, { found });
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'latin1');
  let root; try { root = sdlx.read(buf, { file: 'options.set', key: 'options.set', open: () => null, onError() {} }).root; } catch (e) { return Object.assign(o, { found, error: e.message }); }
  const find = (n, nm) => (n.items || []).find(x => x.k === 'BLOCK' && word(x.items[0]) && word(x.items[0]).toLowerCase() === nm);
  const walk = n => { for (const x of n.items || []) if (x.k === 'BLOCK') { if (word(x.items[0]) === 'sound') return x; const r = walk(x); if (r) return r; } return null; };
  const s = walk(root);
  if (!s) return Object.assign(o, { found });
  const v = (blk, nm) => { const b = find(blk, nm); return b ? b.items[1] : undefined; };
  const sc = v(s, 'speaker_config'); if (sc) { o.speakerConfig = word(sc); found.speakerConfig = 1; }
  const rt = v(s, 'rate'); if (rt && RATES[word(rt)]) { o.rate = RATES[word(rt)]; found.rate = 1; }
  const bu = v(s, 'buffers'); if (bu) { const b = BUFFERS[String(word(bu) !== null ? word(bu) : num(bu))]; if (b) { o.buffers = b; found.buffers = 1; } }
  const vol = find(s, 'volume');
  if (vol) for (const k of ['master', 'effects', 'emotions', 'environment', 'interface', 'game_music', 'narrator']) {
    const x = num(v(vol, k));
    if (x !== null && x >= 0 && x <= 100) { o[k] = x; found[k] = 1; }    // Validate: out of 0..100 -> default (:117-139)
  }
  return Object.assign(o, { found });
}
// group volumes the sound manager uses (narrator drives speech, environment drives other)
function groupVolumes(opt) {
  const o = Object.assign({}, OPTION_DEFAULTS, opt || {});
  const g = p => M.groupVolume(o.master, p);
  return { effects: g(o.effects), emotions: g(o.emotions), speech: g(o.narrator), environment: g(o.environment), other: g(o.environment) };
}

// ---------- plan ----------
function plan(opts, src) {
  const read = src.read, list = src.list;
  const set = opts.set || soundSet(read);
  const notes = [];
  const add = (code, level, msg) => notes.push({ code, level, msg });
  let key = null, res = null;
  if (opts.key) {
    key = norm(opts.key);
    res = { name: titleOf(key), exists: false, folderKey: dirOf(key), files: wavsOf(dirOf(key), list), fixed: key, pick: 'fixed', warn: null };
  } else {
    res = resolve(opts.name || '', list);
    if (res.warn) return { ok: false, error: res.warn, resolve: res, notes: [{ code: 'UNKNOWN_SOUND', level: 'error', msg: res.warn + ' (the game logs this warning and plays nothing)' }] };
    key = res.fixed || bag(res.files, engineRandom(opts.seed === undefined ? 1 : opts.seed)).next();
  }
  const goh = opts.game === 'goh';
  const settings = folder(res.folderKey, read, set, opts.cache, goh ? { game: 'goh' } : undefined);
  const buf = opts.buf || read(key);
  const info = buf ? wav.parse(buf) : null;
  if (!info) add('NO_FILE', 'error', `${key} not found`);
  else for (const nn of info.notes) notes.push(nn);
  const opt = Object.assign({}, OPTION_DEFAULTS, opts.volumes || {});
  const vols = groupVolumes(opt);
  const ambient = !!opts.ambient, positional = !ambient;
  const groupVol = vols[settings.group];
  const rolloff = opts.rolloff === undefined ? M.ROLLOFF : opts.rolloff;
  const outRate = opts.outRate || opt.rate || M.DEFAULT_SAMPLE_RATE;

  // geometry: a camera + source (meters) by the listener rule, else distance + bearing as given
  let distance = opts.distance === undefined ? 0 : +opts.distance, bearing = opts.bearing === undefined ? 0 : +opts.bearing, listener = null;
  if (opts.camera && opts.source) {
    const c = opts.camera;
    listener = M.listenerPosition(c.eye, c.target, c.viewAngle || 0);
    const fwd = c.forward || [c.target[0] - c.eye[0], c.target[1] - c.eye[1], c.target[2] - c.eye[2]];
    distance = M.distance(listener, opts.source);
    bearing = M.bearingDeg(listener, M.listenerFront(fwd), opts.source);
  }
  const miles = M.milesDistances(settings.minUnits, settings.maxUnits);
  const milesM = { min: miles.min / U, max: miles.max >= 1e37 ? null : miles.max / U };
  let channel, dist3d = 1, cutoff = 1, pan = 0;
  if (positional) {
    channel = M.channelVolume(settings.volume, groupVol, 1, 1);
    dist3d = M.gainAt(distance, milesM.min, milesM.max === null ? 0 : milesM.max, rolloff);
    cutoff = M.lowPassCutoff(settings.minDistance, distance);
    pan = M.pan(bearing);
    if (settings.volume * groupVol > 1) add('VOLUME_CLIPPED', 'info', `folder volume ${settings.volume} x group ${round(groupVol)} = ${round(settings.volume * groupVol)}:  clamps to 1`);
    if (info && info.ok && info.fmt.channels > 1) add('STEREO_3D', 'warn', 'stereo file played as a positioned sound: Miles 3D needs mono; the place may be lost [T] (rendered here as a mono mix)');
    if (milesM.max !== null && distance > milesM.max) add('BEYOND_MAX', 'info', `${round(distance, 2)} m is beyond max distance ${round(milesM.max, 2)} m: silent [I]`);
    if (!settings.anySet) add('NO_FOLDER_SET', 'warn', 'no folder.set in the chain: folder() defaults stay: min 0 (Miles gets 1 unit = 0.05 m), max 100 units = 5 m: silent past 5 m [I], group other');
    if (goh && !(settings.minDistance > 0)) add('GOH_NO_MIN_DISTANCE', 'error', `GoH stops this positioned sound and logs "An ambient sound ... not marked as ambient, otherwise minDistance and maxDistance are required": the folder has no min distance (GHVIS-31)`);
    else if (!(settings.minDistance > 0)) add('LOW_PASS_ZERO', 'warn', 'min distance 0: the distance low pass gets cut-off 0/d = 0 (fully closed [I]); with the listener on the spot 0/0 = NaN goes to Miles');
  } else if (goh) {
    channel = M.channelVolume(settings.volume, groupVol, 1, 1);   // GoH: folder Volume scales ambient plays too (GHVIS-30)
    if (settings.volume !== 1) add('AMBIENT_FOLDER_VOLUME', 'info', `ambient play: GoH applies folder Volume ${settings.volume} to ambient sounds too (GHVIS-30)`);
    if (settings.volume * groupVol > 1) add('VOLUME_CLIPPED', 'info', `folder volume ${settings.volume} x group ${round(groupVol)} clamps to 1`);
  } else {
    channel = M.ambientVolume(groupVol, 1);
    if (settings.volume !== 1) add('AMBIENT_NO_FOLDER_VOLUME', 'info', `ambient play: folder Volume ${settings.volume} is not applied ( ambient branch); weather sounds multiply it in themselves`);
    if (groupVol > 1) add('VOLUME_CLIPPED', 'info', 'group volume clamps to 1');
  }
  let filters = null;
  if (goh) {
    const fs0 = opts.filters || filtersSet(read);
    filters = { present: fs0.present, chains: fs0.chains.map(c => c.name), stages: fs0.stages, applied: positional };
    for (const e of fs0.errors) notes.push(Object.assign({ from: 'filters.set' }, e));
    if (positional && fs0.stages) add('GOH_FILTERS', 'info', `GoH puts the ${fs0.chains.length} filters.set chains (${fs0.chains.map(c => c.name).join(', ')}) on every positioned channel, dry at rest; woundedEffect and a level soundeffect fade them in on group effects only (GHVIS-33): not rendered here`);
  }
  const pg = M.panGains(pan);
  const left = channel * dist3d * pg.left, right = channel * dist3d * pg.right;
  const lp = positional ? M.lowPassCoefs(cutoff, info && info.ok ? info.fmt.rate : outRate) : null;
  const fileRate = info && info.ok ? info.fmt.rate : 0;
  const fileMs = info && info.ok && fileRate ? (info.frames / fileRate) * 1000 : 0;
  const factor = M.rateFactor(fileMs, opts.duration || 0);
  if (opts.duration) add('RATE', 'info', `duration ${opts.duration} s: playback rate factor ${round(factor)} (pitch follows) [V rate rule, I pitch]`);
  if (settings.fatal) add('FATAL', 'error', "sound.set has no 'default' loudness: the game crashes reading this folder's folder.set");
  for (const w of settings.warnings) notes.push(Object.assign({ from: 'folder.set' }, w));
  const loop = opts.loop === true ? 0 : (opts.loop ? +opts.loop : 1);   // 0 = forever (LOOP_FOREVER )
  const res0 = {
    ok: !!(info && info.ok) && !settings.fatal && !(goh && positional && !(settings.minDistance > 0)),
    name: res.name, key, folderKey: res.folderKey, resolve: res,
    wav: info && { ok: info.ok, kind: info.kind, codec: info.fmt && info.fmt.codec, tag: info.tag, channels: info.fmt && info.fmt.channels, rate: fileRate, bits: info.fmt && info.fmt.bits, frames: info.frames, seconds: round(info.seconds, 4), dataBytes: info.dataBytes, bytesPerFrame: info.frames ? round(info.dataBytes / info.frames, 6) : 0 },
    settings: { group: settings.group, groupKnown: settings.groupKnown, volume: settings.volume, minDistance: settings.minDistance, maxDistance: settings.maxDistance, priority: settings.priority, loudness: settings.loudness, signal: settings.signal, signalPeriod: settings.signalPeriod, chain: settings.chain },
    positional, ambient, loop,
    options: { master: opt.master, effects: opt.effects, emotions: opt.emotions, environment: opt.environment, narrator: opt.narrator, rate: opt.rate, buffers: opt.buffers },
    gain: { group: round(groupVol, 6), file: 1, folder: positional || goh ? settings.volume : 1, attenuation: 1, channel: round(channel, 6), distance: round(dist3d, 6), pan: round(pan, 6), panLeft: round(pg.left, 6), panRight: round(pg.right, 6), left: round(left, 6), right: round(right, 6) },
    distances: { distance: round(distance, 4), bearing: round(bearing, 3), listener, min: settings.minDistance, max: settings.maxDistance, milesMin: milesM.min, milesMax: milesM.max, rolloff },
    lowPass: { cutoff: positional ? round(cutoff, 6) : 1, hz: lp ? round(lp.hz, 1) : null, active: !!lp },
    rate: { file: fileRate, fileMs: round(fileMs, 3), duration: opts.duration || 0, factor: round(factor, 6), playback: round(fileRate * factor, 3), out: outRate },
    notes,
  };
  if (goh) { res0.game = 'goh'; res0.filters = filters; }
  return res0;
}

// ---------- render: one play offline (what the game would output, as far as [I] Miles allows) ----------
function render(dec, p, ro = {}) {
  const ch = dec.channels, n = dec.frames || Math.floor(dec.pcm.length / ch);
  const positional = p.positional !== false;
  // source as float, mono mix for a positioned stereo file [I]
  const outCh = positional ? 1 : ch;
  const src = new Float32Array(n * outCh);
  for (let i = 0; i < n; i++) {
    if (positional && ch > 1) { let s = 0; for (let c = 0; c < ch; c++) s += dec.pcm[i * ch + c]; src[i] = s / ch; }
    else for (let c = 0; c < outCh; c++) src[i * outCh + c] = dec.pcm[i * ch + c];
  }
  // distance low pass at the file rate [V cut-off, I shape]
  const cutoff = p.lowPass ? p.lowPass.cutoff : (p.cutoff === undefined ? 1 : p.cutoff);
  const lp = positional ? M.lowPassCoefs(cutoff, dec.rate) : null;
  if (lp) for (let c = 0; c < outCh; c++) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = src[i * outCh + c], y = lp.b0 * x + lp.b1 * x1 + lp.b2 * x2 - lp.a1 * y1 - lp.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; src[i * outCh + c] = y;
    }
  }
  // loops: plan.loop 0 (forever) renders ro.loops or 1 pass; n > 1 renders n passes
  const loopN = ro.loops || (p.loop ? p.loop : 1);
  const factor = p.rate ? p.rate.factor : (p.factor || 1);
  const outRate = ro.outRate || (p.rate ? p.rate.out : p.outRate) || M.DEFAULT_SAMPLE_RATE;
  const step = (dec.rate * factor) / outRate;                       // [I] Miles resamples linearly to the driver rate
  const total = n * loopN;
  let outFrames = Math.max(0, Math.floor((total - 1) / step) + 1);
  if (ro.maxSeconds) outFrames = Math.min(outFrames, Math.floor(ro.maxSeconds * outRate));
  const gl = p.gain ? p.gain.left : (p.left === undefined ? 1 : p.left), gr = p.gain ? p.gain.right : (p.right === undefined ? 1 : p.right);
  const pcm = new Int16Array(outFrames * 2);
  const at = (i, c) => src[(i % n) * outCh + c];
  for (let o = 0; o < outFrames; o++) {
    const pos = o * step, i = Math.floor(pos), fr = pos - i;
    const j = i + 1 < total ? i + 1 : i;
    for (let c = 0; c < 2; c++) {
      const sc = outCh === 1 ? 0 : Math.min(c, outCh - 1);
      const v = at(i, sc) + (at(j, sc) - at(i, sc)) * fr;
      const g = c === 0 ? gl : gr;
      const s = Math.round(v * g);
      pcm[o * 2 + c] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
    }
  }
  return { rate: outRate, channels: 2, frames: outFrames, pcm };
}

// ---------- voice limits [V] ----------
function limits() {
  // requests: [ms] or [{t, loop}] of ONE file of one folder at one distance; simulates the per-tick ranking and admission
  function simulate(requests, o = {}) {
    const fileMs = o.fileMs || 1000, bpf = o.bytesPerFrame === undefined ? 1024 / 2041 : o.bytesPerFrame;
    const tick = o.tickMs || M.TICK_MS, maxPlaying = Math.max(1, Math.min(o.maxFilePlayed === undefined ? M.MAX_FILE_PLAYED : o.maxFilePlayed, M.MAX_PLAYING));
    const thr = o.antiReverbMs === undefined ? M.ANTI_REVERB_MS : o.antiReverbMs, budget = o.groupFree === undefined ? Infinity : o.groupFree;
    const prio = o.priority === undefined ? -1 : o.priority;
    const ch = requests.map((r, i) => ({ i, t: typeof r === 'number' ? r : r.t, loop: !!(r && r.loop), serial: i, state: 'waiting', startedAt: null, endedAt: null, reason: null, starts: 0 }));
    if (!ch.length) return { copies: [], tickMs: tick };
    const tEnd = o.untilMs || Math.max(...ch.map(c => c.t)) + fileMs + 2 * tick;
    for (let T = Math.floor(Math.min(...ch.map(c => c.t)) / tick) * tick; T <= tEnd; T += tick) {
      for (const c of ch) if (c.state === 'waiting' && c.t <= T) c.state = 'pending';
      for (const c of ch) if (c.state === 'playing' && !c.loop && T - c.startedAt >= fileMs) { c.state = 'done'; c.endedAt = c.startedAt + fileMs; }
      const cand = [];
      for (const c of ch) {
        if (c.state !== 'pending' && c.state !== 'playing') continue;
        const playedMs = c.state === 'playing' ? (c.loop ? (T - c.startedAt) % fileMs : T - c.startedAt) : 0;
        const played = M.playedFraction(playedMs, fileMs, bpf);
        const rk = M.candidateRank(c.loop, played, playedMs, prio);
        cand.push({ c, playedMs, weight: 1, priority: rk.priority, order: rk.order, loop: c.loop, serial: c.serial });
      }
      cand.sort(M.compareCandidates);                            // engine std::sort is not stable: ties may fall either way
      const admitted = [];
      let free = budget;
      for (const k of cand) {
        const c = k.c;
        let why = null;
        if (free === 0) why = 'group-budget';
        else { const a = M.copyAdmit(admitted, k.playedMs, maxPlaying, thr); if (!a.ok) why = a.reason; }
        if (!why) {
          admitted.push(k.playedMs); free--;
          if (c.state === 'pending') { c.state = 'playing'; c.startedAt = T; c.starts++; }
          continue;
        }
        if (!(c.loop && c.state === 'pending')) {                //
          if (c.loop) { c.state = 'pending'; c.reason = why; }    // a stopped loop waits as pending, restarts later
          else { c.state = c.state === 'playing' ? 'cut' : 'rejected'; c.endedAt = T; c.reason = why; }
        }
      }
    }
    return { tickMs: tick, copies: ch.map(c => ({ t: c.t, loop: c.loop, result: c.state === 'done' ? 'played' : c.state, startedAt: c.startedAt, endedAt: c.endedAt, reason: c.reason, starts: c.starts })) };
  }
  return {
    maxFilePlayedChannels: M.MAX_FILE_PLAYED, maxPlaying: M.MAX_PLAYING, antiReverbMs: M.ANTI_REVERB_MS, cutoffPart: M.CUTOFF_PART, keepTimeMs: M.KEEP_TIME_MS,
    rolloff: M.ROLLOFF, tickMs: M.TICK_MS, poolStart: M.POOL_START, orderNotStarted: M.ORDER_NOT_STARTED, orderKeptTooLong: M.ORDER_KEPT_TOO_LONG,
    groupFree: (set, pool) => { const out = {}; for (const g of M.GROUPS) out[g] = M.groupFree(pool, set.groups[g].share, set.groups[g].max); return out; },
    simulate,
  };
}

// ---------- sources ----------
function memSource(map) {
  const m = new Map();
  for (const [k, v] of (map instanceof Map ? map : Object.entries(map))) m.set(norm(k), Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'latin1'));
  return { read: k => m.get(norm(k)) || null, list: p => { const pre = norm(p) + '/'; return [...m.keys()].filter(k => k.startsWith(pre)); }, keys: () => [...m.keys()] };
}

module.exports = { soundSet, folder, resolve, bag, engineRandom, options, groupVolumes, plan, render, limits, memSource, filtersSet, norm, titleOf, ROOT, SET_KEY, FILTERS_KEY, OPTION_DEFAULTS, M };
