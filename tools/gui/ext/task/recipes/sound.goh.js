// recipe "sound", the Gates of Hell branch (game parity 2026-11-23): a new sound folder written the way GoH reads it.
// Read on the GoH install [V 2026-11-23]: 548 folder.set files, most of them (include "\sound\defines.inc") ("<preset>")
// a preset of resource/sound/defines.inc (243 defines) holding {loudness "<row>"} {tag ..} {volume ..} {signal ..} {SignalPeriod ..};
// a few name the keys straight ({tag environment} {loudness "vehicle_int"} {volume 1}). The distance a sound is heard at is the
// loudness row of resource/sound/sound.set: {loudness "<row>" <min m> <max m> <priority>}. A GoH folder with no min distance is
// stopped with a warning (GHVIS-31), and a sub folder keeps its parent's distances (GHVIS-29), so the new folder.set always names its
// keys itself, read from what the start folder resolves to (tools/sound/model folder(.., {game: 'goh'})): tag, loudness, volume,
// signal, SignalPeriod. A min and max distance that no sound.set row has gets a new row (gen soundclass, the whole sound.set in the
// mod, every game row kept). The gen sound op stops on GoH (GEN_SOUND_AS2_ONLY), so the wavs are plain copies (or the Art page's
// wav-convert), the folder.set a staged file. GoH plays PCM16 at 44100 or 48000 Hz and IMA ADPCM (a sample of the game wavs [V]).
// Every sound heard in game is [T].
// Author: Imperator_Aug (ARSENAL, ia-6b0e8874)
'use strict';
const fs = require('fs'), path = require('path');

const M = () => require('../../../../sound/model');
const bad = (m, s) => Object.assign(new Error(m), { status: s || 400 });
const TAGS = ['effects', 'emotions', 'speech', 'environment'];
const r3 = v => Math.round(Number(v) * 1000) / 1000;
const fnOr = (v, d) => { try { return typeof v === 'function' ? v() : (v == null ? d : v); } catch (e) { return d; } };

// the GoH install of a lookup, values or route ctx (skin.goh.js gohDirOf)
const gohDir = ctx => { try { return require('./skin.goh').gohDirOf(ctx); } catch (e) { return fnOr(ctx && ctx.gohDir, null); } };
const gameG = dir => (dir ? { dir, exe: 'goh', kind: 'goh' } : null);
const readOf = V => k => { const r = V.get(k); return r ? V.readAny(r) : null; };

// what a sound folder resolves to: {group, loudness, min, max, priority, volume, signal, period}; null when it is not a folder
function resolve(V, name) {
  const key = 'resource/sound/' + name;
  try {
    const set = M().soundSet(readOf(V)), f = M().folder(key, readOf(V), set, null, { game: 'goh' });
    const row = f.loudness ? set.loudness[String(f.loudness).toLowerCase()] : null;
    return { group: f.group, loudness: row ? row.name : f.loudness, min: row ? row.min : r3(f.minDistance), max: row ? row.max : r3(f.maxDistance), priority: row ? row.priority : null,
      volume: f.volume, signal: f.signal, period: f.signalPeriod, set };
  } catch (e) { return null; }
}
// the loudness rows of sound.set with min and max: [{name, min, max, priority}]
const rowsOf = set => (set.order || []).map(n => set.loudness[n]).filter(r => r && r.min != null && r.max != null);

// the new folder.set: every key named, CRLF
function folderSet(o) {
  const L = ['{sound'];
  if (o.tag) L.push('\t{tag ' + o.tag + '}');
  L.push('\t{loudness "' + o.loudness + '"}');
  if (o.volume != null) L.push('\t{volume ' + r3(o.volume) + '}');
  if (o.signal && o.signal.name) L.push('\t{signal ' + o.signal.name + ' ' + r3(o.signal.radius || 0) + '}');
  if (o.period != null && o.period > 0) L.push('\t{SignalPeriod ' + r3(o.period) + '}');
  L.push('}', '');
  return L.join('\r\n');
}

// make on GoH. H: {c, V, L (the like folder: soundAt), like, name, where, folder, brought, src, ways, specs, mono, stereo, convertCall,
// percentChange, slotRow, WAV_NAME, notes, calls, copies, ops}
function make(H) {
  const { c, V, L, like, folder, notes, calls, copies, ops } = H;
  const R = resolve(V, like);
  if (!R) throw bad('The sound ' + like + ' cannot be read (its folder.set or sound.set): pick another sound to start from.');
  // the wavs: the ones brought (made mono and converted when asked), else a copy of each wav of the start folder
  if (H.brought.length) {
    H.brought.forEach((f, j) => {
      const n = path.basename(f).toLowerCase();
      if (!H.WAV_NAME.test(n)) throw bad('The file name ' + path.basename(f) + ' must be plain English letters, digits, space, _ . ( ) or -, ending in .wav. Rename it and bring it again.');
      const to = 'resource/sound/' + folder + '/' + n;
      if (H.specs[j]) calls.push(H.convertCall(H.ways[j].file, to, H.specs[j]));
      else copies.push({ staged: path.relative(path.resolve(c.staging), path.resolve(H.src[j])).replace(/\\/g, '/'), to });
    });
  } else {
    for (const k of L.files) copies.push({ key: k, to: 'resource/sound/' + folder + '/' + k.slice(k.lastIndexOf('/') + 1) });
    notes.push('The new sound plays the ' + L.files.length + ' recordings of ' + like + ' until you bring your own.');
  }
  // how it is heard: the answers, else what the start folder resolves to
  const tagA = String(c.value('tag') || 'like'), tag = tagA !== 'like' ? tagA : (TAGS.includes(R.group) ? R.group : null);
  const picked = !c.kept('loudness') && c.value('loudness') ? String(c.value('loudness')).trim() : '';
  let base = R;
  if (picked) {
    const row = R.set.loudness[picked.toLowerCase()];
    if (!row || row.min == null) throw bad('The loudness class ' + picked + ' is not a row of sound.set with a distance. Pick one from the list.');
    base = { loudness: row.name, min: row.min, max: row.max, priority: row.priority };
  }
  const num = id => { const v = c.value(id); return v == null || v === '' || c.kept(id) ? null : Number(v); };
  const dmin = num('dist_min'), dmax = num('dist_max');
  const want = { min: dmin != null && dmin !== R.min ? dmin : base.min, max: dmax != null && dmax !== R.max ? dmax : base.max };
  if (!(want.min > 0)) throw bad('Full volume up to: more than 0 m. Gates of Hell stops a sound placed in the world that has no min distance (GHVIS-31).');
  if (!(want.max >= want.min)) throw bad('Silent from must be at least the full volume distance.');
  let loud = base.loudness;
  if (want.min !== base.min || want.max !== base.max) {
    const same = rowsOf(R.set).find(r => r.min === want.min && r.max === want.max);
    if (same) { loud = same.name; notes.push('The distances ' + want.min + ' to ' + want.max + ' m are the sound.set row ' + same.name + ': the folder names it.'); }
    else {
      let nm = 'arsenal_' + H.name, i = 2;
      while (R.set.loudness[nm.toLowerCase()]) nm = 'arsenal_' + H.name + '_' + i++;
      const sc = { op: 'soundclass', name: nm, min: want.min, max: want.max };
      if (base.priority != null) sc.priority = base.priority;
      ops.push(sc); loud = nm;
      notes.push('A new loudness row ' + nm + ' (' + want.min + ' to ' + want.max + ' m) goes into sound.set of your mod: the mod then holds the whole sound.set, every game row kept [T].');
    }
  }
  if (!loud) throw bad('The sound ' + like + ' resolves to no loudness row of sound.set: pick a loudness class.');
  const vol = num('volume'), sig = String(c.value('signal') || 'like');
  const o = { tag, loudness: loud, volume: vol != null ? vol : R.volume, signal: sig !== 'like' ? { name: sig, radius: Number(c.value('signal_m') || 0) } : R.signal, period: sig !== 'like' ? null : R.period };
  if (o.signal && o.signal.name === 'sound' && !o.signal.radius) o.signal = null;
  const rel = 'sound/' + folder + '/folder.set', f = path.join(c.staging, 'gohsound', ...rel.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, folderSet(o));
  copies.push({ staged: 'gohsound/' + rel, to: 'resource/' + rel });
  notes.push('resource/sound/' + folder + '/folder.set names its own keys (Gates of Hell stops a sound with no distance, GHVIS-31): loudness ' + loud + ' (' + want.min + ' to ' + want.max + ' m)' + (o.tag ? ', tag ' + o.tag : '') + (o.volume != null ? ', volume ' + r3(o.volume) : '') + (o.signal ? ', signal ' + o.signal.name + ' ' + r3(o.signal.radius) : '') + '. Check it in game [T].');
  return R;
}

module.exports = { gohDir, gameG, resolve, rowsOf, folderSet, make, TAGS };
