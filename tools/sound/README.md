# sound: decode game sounds and play them the way the game does

Node only, no dependencies. It reads the game and only writes to `--out` / `--keep` files or the temp folder. It refuses any target
inside a game or Steam folder (lib/writeguard).

| file | what |
|---|---|
| `tools/lib/wav.js` | RIFF/WAVE reader, bit-exact decoders (PCM 8/16/24/32, float, A-law, mu-law, IMA ADPCM, MS ADPCM, extensible), PCM16 and IMA ADPCM writers |
| `tools/sound/play.src.js` | per-play maths (distances, gain, low pass, listener, pan, volume, rate, voice limit). Plain ES5: `module.exports` in node, `window.SNDMATH` in a page |
| `tools/sound/model.js` | engine rules over a key reader: sound.set, folder.set inheritance, name resolution, shuffle bag, options, plan, render, voice-limit simulation |
| `tools/sound/sound.js` | CLI: `info`, `resolve`, `decode`, `play`, `sweep` |

Tags: **[V]** verified, **[I]** inferred (Miles is closed: documented MSS 9/10 behaviour)
**[T]** needs an in-game test. Every [I]/[T] item is in `REPORT.json` `gaps` with how to check it.

## CLI

```
node tools/sound/sound.js info    <file|key>   [--distance m] [--bearing deg] [--ambient] [--json]
node tools/sound/sound.js resolve <name>       e.g. weapon/shot/gun/85to100_cal/88mm_flak41  (prints a hint when weapon/shot/ or weapon/reload/ is missing)
node tools/sound/sound.js decode  <file|key> --out <file.wav>          plain PCM16
node tools/sound/sound.js play    <file|key|name> [--distance m] [--bearing deg] [--loop n] [--ambient] [--duration s] [--seed n] [--dry] [--keep FILE]
node tools/sound/sound.js sweep   [--limit n] [--all-notes]
common: --game DIR (default lib/gamedir: AS2_GAME, as2.json, Steam) --mods a,b --mod DIR --json
        --options FILE | --profile (user volumes from a profile options.set; else game defaults) --rolloff r --out-rate hz
```

A key is a path in the game's file view: `resource/sound/...`, `sound/...` or a path relative to `sound/`, and `.wav` may be left
off. A loose disk file outside any `sound/` folder plays like a vanilla folder: the vanilla `default` loudness (20 m, no max) through
the root `{loudness "default"}`.

`play` renders one play offline (the 3D gain, pan, low pass and rate below, then resampling to the output rate). It plays the result
through PowerShell `System.Media.SoundPlayer.PlaySync` (spawned with `shell:false`, temp wav in `os.tmpdir()`, deleted afterwards).
`--dry` prints the plan and plays nothing. `--keep FILE` saves the render. Renders are capped at 120 s, and `loop 0` (forever) renders once.

## API

### wav (`tools/lib/wav.js`)

```
parse(buf) -> { ok, kind:'wav'|'short'|'ogg'|'mp3'|'flac'|'notwav'|'nofmt', error?,
                riff:{size}, fmt:{tag, codec, channels, rate, avgBytes, blockAlign, bits, cbSize, samplesPerBlock?, coefs?,
                                  validBits?, channelMask?, subTag?},
                tag (effective: extensible -> its subtype), dataOffset, dataBytes, frames, seconds, fact?:{samples},
                loops?:[{id, type, start, end, fraction, playCount}], chunks:[{id, off, size}],
                notes:[{code, level:'info'|'warn'|'error', msg}] }
decode(buf, {ima:'reference'|'ffmpeg'}?) ->
       { ok:true, rate, channels, frames, pcm:Int16Array (interleaved), codec, trimmedByFact, parse }
     | { ok:false, code, error, payload?:{off, len, codec:'mp3'}, parse }
encodePcm16({rate, channels, pcm}) -> Buffer                        fmt 16 bytes + data
encodeImaAdpcm({rate, channels, pcm}, {blockAlign = 1024 * ch}?) -> Buffer
       vanilla profile: fmt 20 bytes, tag 0x11, 4 bits, cbSize 2, samplesPerBlock 2041 (mono 1024), avgBytes 22125 at 44100,
       fact = frame count, last block padded; each block header carries the encoder's step index forward
imaExpand(state{pred,index}, nibble) / imaExpandMul (ffmpeg form) / imaEncodeNibble / samplesPerBlockOf(tag, ch, align, bits)
alaw(byte) / mulaw(byte); tables TAG, CODEC, IMA_STEP, IMA_INDEX, MS_ADAPT, MS_COEF; GAME_SAFE (Set of tags vanilla uses)
```

The note codes are:
- `SHORT`, `OGG_RENAMED`, `MP3_RENAMED`, `FLAC_RENAMED`, `NOT_RIFF`, `NO_FMT`, `NO_DATA`: these make `ok` false.
- `RIFF_SIZE`, `TRUNCATED`.
- `CODEC`: not PCM or IMA.
- `PCM_BITS`: 8-bit is info; 24 or 32 is a warning.
- `IMA_BITS`, `STEREO`, `RATE` (not 44100 or 22050), `FMT_ZERO`, `SPB`.
- `IMA_ALIGN`: not 1024 or 2048 per channel.
- `FACT`: the data is at least one block shorter than the fact chunk.
- `EMPTY`.

The kinds match `tools/gui/ext/art/core.js` wavInfo; a test checks this.

### play.src.js (`window.SNDMATH` / `require('./play.src')`)

Constants: `UNITS_PER_METER 20`, `METERS_PER_UNIT 0.05`, `BUFFER_MIN_UNITS 1`, `BUFFER_MAX_UNITS 1e38`, `FOLDER_MIN_UNITS 0`,
`FOLDER_MAX_UNITS 100`, `LISTENER_NEAR 0.1`, `LISTENER_FAR 0.9`, `ROLLOFF 1`, `MAX_FILE_PLAYED 3`, `MAX_PLAYING 3`,
`ANTI_REVERB_MS 50`, `CUTOFF_PART 0.5`, `KEEP_TIME_MS 200`, `ORDER_NOT_STARTED 5e37`, `ORDER_KEPT_TOO_LONG 1e38`, `ORDER_EPSILON 1e-5`,
`DEFAULT_SAMPLE_RATE 44100`, `DEFAULT_GROUP_VOLUME 0.5`, `DEFAULT_SHARE 0.2`, `DEFAULT_LIMIT 1000`, `POOL_START 20`, `TICK_MS 50`,
`GROUPS ['effects','emotions','speech','environment','other']`.

Functions (all distances in one unit per call; model.js uses meters):

```
clamp(v, lo, hi)
milesDistances(minUnits, maxUnits) -> {min, max}               min <= 0 -> 1, max <= 0 -> 1e38
gainAt(d, min, max, rolloff) -> 0..1                           1 inside min, min/(min + rolloff (d - min)), 0 beyond max (< 1e37)
lowPassCutoff(minDist, d) -> 0..1 (NaN for 0/0)               lowPassHz(cutoff, rate)   lowPassCoefs(cutoff, rate) -> {b0,b1,b2,a1,a2,hz} | null
listenerAlong(viewAngle)  listenerPosition(eye, target, viewAngle)  listenerFront(forward)  distance(a, b)
bearingDeg(listener, front, source) (+ = right)  pan(bearingDeg) -> -1..1  panGains(pan) -> {left, right}
groupVolume(master%, group%)  channelVolume(folderVol, groupVol, fileVol?, attenuation?)  ambientVolume(groupVol, fileVol?)
rateFactor(fileMs, seconds)
candidateWeight(d, minDist)  playedFraction(playedMs, fileMs, bytesPerFrame)  candidateRank(loop, played, playedMs, priority) -> {order, priority}
compareCandidates(a, b) (a, b = {weight, priority, order, loop, serial})  groupFree(pool, share, limit)
copyAdmit(admittedPlayedMs[], playedMs, maxPlaying?, thresholdMs?) -> {ok, reason:null|'max-copies'|'anti-reverb'}
```

### model (`tools/sound/model.js`)

`src` is `{ read(key) -> Buffer|null, list(dirKey) -> keys under it }`. Keys are lower case, for example `resource/sound/...`.
`memSource({key: Buffer|string})` builds one in memory, and `sound.makeSource(o)` builds one over the vfs and a mod folder.

```
soundSet(read) -> { key, groups:{effects..other:{percent, share, max, volume, rows}},
                    loudness:{lcname:{name, min, max, minUnits, maxUnits, priority, line}}, order:[lcname], defaultName,
                    errors:[{code, level, msg, line?}], fatal:'NO_DEFAULT_LOUDNESS'|null, staleDefault }
   codes: NO_SOUND_SET EMPTY SIGNATURE STRAY_TOKEN BAD_VALUE GROUP_OTHER LOUDNESS_DUP PRIORITY_FLOAT UNEXPECTED_TOKEN
          NO_DEFAULT_LOUDNESS STALE_DEFAULT
folder(folderKey, read, set?, cache?: Map) -> { key, group, groupId, groupKnown, volume, minDistance, maxDistance (m),
                    minUnits, maxUnits, priority, loudness, signal:{name, radius}|null, signalPeriod, hasSet, anySet, fatal,
                    chain:[{key, setKey|null, own:{reset?, tag?, distance?, minDistance?, maxDistance?, loudness?, volume?, signal?, signalPeriod?}}],
                    warnings:[{key, code, level, msg, line?}] }
   codes: TAG_UNKNOWN TAG_QUOTED LOUDNESS_UNKNOWN BAD_VALUE UNEXPECTED_TOKEN STRAY_TOKEN NO_DEFAULT_LOUDNESS SIGNATURE SDL_*
resolve(name, list) -> { name, exists, folderKey, files:[keys, sorted], fixed:key|null, pick:'fixed'|'single'|'random'|null,
                    warn:"unknown sound file '<name>'"|null }
bag(files, rnd?) -> { files, next() -> key|null }          engineRandom(seed=1) -> () => 24-bit int (engine LCG)
options(text|Buffer|null) -> { speakerConfig, rate, buffers, master, effects, emotions, environment, interface, game_music,
                    narrator, found:{key:1} }
groupVolumes(options) -> { effects, emotions, speech, environment, other }
plan({ name | key, buf?, distance=0 (m), bearing=0 (deg), camera?:{eye, target, viewAngle, forward?}, source?:[x,y,z] (m),
       loop: 1 | n | true (=0 forever), ambient, volumes?:options, rolloff?, outRate?, duration? (s), seed=1, set?, cache? }, src)
  -> { ok, name, key, folderKey, resolve,
       wav:{ok, kind, codec, tag, channels, rate, bits, frames, seconds, dataBytes, bytesPerFrame},
       settings:{group, groupKnown, volume, minDistance, maxDistance, priority, loudness, signal, signalPeriod, chain},
       positional, ambient, loop, options:{master, effects, emotions, environment, narrator, rate, buffers},
       gain:{group, file, folder, attenuation, channel, distance, pan, panLeft, panRight, left, right},
       distances:{distance, bearing, listener|null, min, max, milesMin, milesMax (null = none), rolloff},
       lowPass:{cutoff, hz|null, active}, rate:{file, fileMs, duration, factor, playback, out}, notes:[{code, level, msg}] }
  | { ok:false, error, resolve, notes:[UNKNOWN_SOUND] }
   plan codes: UNKNOWN_SOUND NO_FILE VOLUME_CLIPPED STEREO_3D BEYOND_MAX NO_FOLDER_SET LOW_PASS_ZERO AMBIENT_NO_FOLDER_VOLUME RATE FATAL
               + the wav notes + folder warnings (from:'folder.set')
render(decoded, plan, {loops?, maxSeconds?, outRate?}) -> { rate, channels:2, frames, pcm:Int16Array }
limits() -> { maxFilePlayedChannels, maxPlaying, antiReverbMs, cutoffPart, keepTimeMs, rolloff, tickMs, poolStart,
              orderNotStarted, orderKeptTooLong, groupFree(set, pool) -> {group: n},
              simulate(requests:[ms | {t, loop}], {fileMs, bytesPerFrame=1024/2041, tickMs, maxFilePlayed, antiReverbMs,
                       groupFree, priority, untilMs})
                -> { tickMs, copies:[{t, loop, result:'played'|'playing'|'rejected'|'cut'|'pending', startedAt, endedAt, reason, starts}] } }
memSource(map)  norm(key)  titleOf(key)  ROOT  SET_KEY  OPTION_DEFAULTS  M (= play.src)
```

## Engine rules -> source

The paths are under the repository root. is shortened to `dev/`.

| rule | where | tag |
|---|---|---|
| whole file read, `AIL_WAV_info` decides the format | | V |
| volume clamp 0..1 | | V |
| `SetRate(seconds)`: factor = 0.001 / s × fileMs; 0 = own rate; only caller = reload | | V |
| distance low pass: cutOff = Clamp(folder min / listener distance), set at start/SetPosition only | | V |
| min ≤ 0 → 1 unit, max ≤ 0 → 1e38 | | V |
| loop 0 = forever, 1 = once | | V |
| folder.set keywords (case-insensitive) | | V |
| folder defaults: min 0, max 100 units, other, volume 1, priority -1 | | V |
| child copies parent state, then reads its own folder.set; lists direct *.wav | | V |
| shuffle bag (`unpicked`, swap) | | V |
| file by title | | V |
| a name is a folder when it has any direct file (folder.set alone counts) | | V |
| each folder.set read resets distances to `default` loudness; priority kept; no default → log + crash | | V |
| ambient ignores folder volume; positioned = folder × attenuation × group × file | , (attenuation stub 1.0) | V |
| group by tag, unknown → other | | V |
| `MAX_PLAYING` 3 | | V |
| cvars antiReverb 50, maxFilePlayed 3, cutoffPart 0.5, keepTime 200, rolloff 1 | | V |
| constants (rate, share, limit, listener 0.1/0.9, orders 5e37/1e38) | | V |
| candidate comparator | | V |
| sound.set: percent, loudness, default pointer | | V |
| Restart: buffers, rate, distance factor, rolloff | | V |
| listener = eye + (target − eye) × along; front horizontal | | V |
| voice limit: weight, rank, group budget, per-file copies, anti-reverb | | V |
| Play: name → folder / dirname + title, warning text | | V |
| group volume = master × option, narrator → speech, environment → environment + other | | V |
| GetFolder loads parents first | | V |
| GetLoudness case-insensitive | | V |
| options: rate 11/22/44_khz, buffers 16/32/"64"=56, volumes 0..100 | | V |
| engine RNG | | V |
| index order of a folder's files | | V (sort order [I]) |
| weapon fireSound/reloadSound get `weapon/shot/` / `weapon/reload/` | | V |
| music: AIL streams (mp3/wav), not this path | | V |

## [I] / [T]

- **[I]** Miles 3D gain curve: inverse distance `min / (min + rolloff (d − min))`, and silence beyond max.
- **[I]** The low-pass cut-off is a fraction of Nyquist. The shape is a 2nd-order Butterworth.
- **[I]** Pan law: sin(bearing) with constant power, unity at centre. Front and back fold together.
- **[I]** Resampling is linear to the output rate, and the rate factor moves the pitch.
- **[I]** IMA rounding: the reference bitwise form is used. The ffmpeg multiply form is offered (mean 25.7 LSB apart on vanilla).
- **[I]** `played` is bytes over frames (AIL_sample_position in bytes): IMA mono passes cutoffPart only at its end.
- **[T]** A stereo file played as a 3D sound (214 vanilla files are stereo).
- **[T]** Whether 24/32-bit PCM, MP3-in-WAV and MS ADPCM play at all.
- **[I]** The tick is 50 ms (UpdateChannels rate).
- **[I]** Index sort order is the byte order of lower-case keys, which the bag order depends on.
- **[I]** A quoted `{tag "x"}` is read as an identifier.
- **[I]** min 0 makes the low pass cut-off 0 (fully muffled), and 0/0 sends NaN to Miles.
- **[I]** Distance factor 0.05 makes Miles work in meters. The 3rd argument of `AIL_set_sample_3D_distances` (auto 3D attenuation) is not modelled.
- **[T]** Symptoms of the stale `default` pointer (VIS-27) when a folder.set names an unknown loudness.

## Tests

`sh tools/sound/test/run.sh [scratch]` runs `tools/sound/test/*.test.js` and `tools/lib/test/wav.test.js` (each also runs alone).
They need no game install. Vanilla checks run when the game is found; the ffmpeg cross-check runs when ffmpeg is on PATH.
To run under the lib suite, `tools/lib/test/test.js` can load `require('./wav.test')(t, assert)`.
