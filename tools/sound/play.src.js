// play.src.js: the per-frame maths of the game's sound playback, one source for model.js (node) and the browser player.
// Plain ES5, no require: in node it is module.exports, pasted into a page as a script it sets window.SNDMATH.
// Page rules: no backtick, no dollar-brace, no innerHTML. Distances: any one unit for all arguments of a call (model.js uses meters).
// Tags: [V] verified, [I] inferred (Miles is closed: documented MSS 9 behaviour), [T] needs an in-game test.
// Author: Imperator_Aug (ARSENAL, ia-70645d29)
(function (root) {
  'use strict';
  var M = {};

  // ---- constants [V]
  M.UNITS_PER_METER = 20;            //  g_unitsPerMeter; folder.set / sound.set meters x 20
  M.METERS_PER_UNIT = 0.05;          // AIL_set_3D_distance_factor(g_metersPerUnit)
  M.BUFFER_MIN_UNITS = 1;            //  DEFAULT_MIN_DISTANCE: SetDistances puts it for min <= 0 (:228-230)
  M.BUFFER_MAX_UNITS = 1e38;         //  DEFAULT_MAX_DISTANCE: SetDistances puts it for max <= 0 (:231-233)
  M.FOLDER_MIN_UNITS = 0;            //  folder: min 0, max 100 units (5 m), group OTHER, volume 1, priority -1
  M.FOLDER_MAX_UNITS = 100;
  M.LISTENER_NEAR = 0.1;             //
  M.LISTENER_FAR = 0.9;
  M.ROLLOFF = 1.0;                   // cvar snd_rolloff, ; AIL_set_3D_rolloff_factor
  M.MAX_FILE_PLAYED = 3;             // cvar snd_maxFilePlayedChannels
  M.MAX_PLAYING = 3;                 //
  M.ANTI_REVERB_MS = 50;             // cvar snd_antiReverbThreshold
  M.CUTOFF_PART = 0.5;               // cvar snd_cutoffPart
  M.KEEP_TIME_MS = 200;              // cvar snd_keepTime
  M.ORDER_NOT_STARTED = 5e37;        //
  M.ORDER_KEPT_TOO_LONG = 1e38;      //
  M.ORDER_EPSILON = 1e-5;            //
  M.DEFAULT_SAMPLE_RATE = 44100;     // (option sound/rate 0 -> 44100)
  M.DEFAULT_GROUP_VOLUME = 0.5;      // before the options are read
  M.DEFAULT_SHARE = 0.2;             // (20 percent)
  M.DEFAULT_LIMIT = 1000;            //
  M.POOL_START = 20;                 // g_soundMaxSamples before option sound/buffers (16|32|"64"=56)
  M.TICK_MS = 50;                    // [I] game tick = quant length; QUANT_LENGTH 50; single player assumed the same
  M.GROUPS = ['effects', 'emotions', 'speech', 'environment', 'other'];   // order = group id

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }   //  (NaN passes through)
  M.clamp = clamp;

  // ---- distances
  // what Miles is given: : min <= 0 -> 1 unit, max <= 0 -> 1e38 [V]
  M.milesDistances = function (minUnits, maxUnits) {
    return { min: minUnits > 0 ? minUnits : M.BUFFER_MIN_UNITS, max: maxUnits > 0 ? maxUnits : M.BUFFER_MAX_UNITS };
  };
  // Miles 3D distance gain [I: MSS 9 documented inverse-distance rolloff, auto attenuation]:
  // full volume inside min; gain = min / (min + rolloff * (d - min)) beyond it; silent beyond max (sound.set comment: "clipped to
  // silence", max 0 = never: SetDistances turns 0 into 1e38). Arguments in one unit; pass Miles' distances (milesDistances).
  M.gainAt = function (d, min, max, rolloff) {
    if (rolloff === undefined || rolloff === null) rolloff = M.ROLLOFF;
    if (!(min > 0)) min = M.BUFFER_MIN_UNITS * M.METERS_PER_UNIT;
    if (max > 0 && max < 1e37 && d > max) return 0;
    if (!(d > min)) return 1;
    var den = min + rolloff * (d - min);
    return den > 0 ? clamp(min / den, 0, 1) : 1;
  };
  // the distance low pass [V]: cutOff = folder min distance (raw, not the Miles 1-unit substitute)
  // / listener distance, Clamp 0..1, AIL_set_sample_low_pass_cut_off(sample, -1 = all channels, cutOff). Set only when the
  // position is set on a started sample (Play, SetPosition): the listener moving later does not update it [V].
  M.lowPassCutoff = function (minDist, d) {
    var c = minDist / d;                 // d 0 -> Infinity -> 1; min 0 and d 0 -> NaN (engine passes NaN to Miles)
    return clamp(c, 0, 1);
  };
  // [I] Miles takes the cut-off as a fraction of the Nyquist frequency (1 = no filter): Hz = cutoff * rate / 2
  M.lowPassHz = function (cutoff, rate) { return cutoff * rate / 2; };
  // [I] filter shape: 2nd-order Butterworth low pass (RBJ cookbook, Q = 1/sqrt 2); null = bypass (cutoff >= 1 or NaN)
  M.lowPassCoefs = function (cutoff, rate) {
    if (!(cutoff < 1)) return null;
    var fc = Math.max(10, M.lowPassHz(cutoff, rate)), w = 2 * Math.PI * fc / rate, cw = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2);
    var a0 = 1 + al;
    return { b0: (1 - cw) / 2 / a0, b1: (1 - cw) / a0, b2: (1 - cw) / 2 / a0, a1: -2 * cw / a0, a2: (1 - al) / a0, hz: fc };
  };

  // ---- listener [V]
  // along = 0.1 at view angle <= 0, 0.9 at >= PI/2, linear between; listener = eye + (target - eye) * along
  M.listenerAlong = function (viewAngle) {
    if (viewAngle <= 0) return M.LISTENER_NEAR;
    if (viewAngle >= Math.PI / 2) return M.LISTENER_FAR;
    return viewAngle * ((M.LISTENER_FAR - M.LISTENER_NEAR) / (Math.PI / 2)) + M.LISTENER_NEAR;
  };
  M.listenerPosition = function (eye, target, viewAngle) {
    var a = M.listenerAlong(viewAngle);
    return [eye[0] + (target[0] - eye[0]) * a, eye[1] + (target[1] - eye[1]) * a, eye[2] + (target[2] - eye[2]) * a];
  };
  // front = camera forward with z = 0, normalised; a vertical look gives UNIT_Z (:258-267); up = UNIT_Z
  M.listenerFront = function (forward) {
    var x = forward[0], y = forward[1], l = x * x + y * y;
    if (l > 1e-12) { var s = 1 / Math.sqrt(l); return [x * s, y * s, 0]; }
    return [0, 0, 1];
  };
  M.distance = function (a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); };
  // bearing of a source in degrees from the listener front, positive to the right [I: right = front x up, z up]
  M.bearingDeg = function (listener, front, source) {
    var dx = source[0] - listener[0], dy = source[1] - listener[1];
    var f = front[0] * dx + front[1] * dy, r = front[1] * dx - front[0] * dy;
    if (f === 0 && r === 0) return 0;
    return Math.atan2(r, f) * 180 / Math.PI;
  };
  // stereo pan -1 (left) .. 1 (right) from a bearing [I: Miles 3D on stereo speakers; front and back fold together]
  M.pan = function (bearingDeg) { return Math.sin(bearingDeg * Math.PI / 180); };
  // [I] pan law: -3 dB constant power, scaled so the centre is unity on both speakers (a centred 3D sound = a 2D one)
  M.panGains = function (pan) {
    var t = (clamp(pan, -1, 1) + 1) * Math.PI / 4;
    return { left: Math.min(1, Math.SQRT2 * Math.cos(t)), right: Math.min(1, Math.SQRT2 * Math.sin(t)) };
  };

  // ---- volume [V]
  // group volume: master% / 100 * group option% / 100; environment drives OTHER too
  M.groupVolume = function (masterPercent, groupPercent) { return (masterPercent / 100) * (groupPercent / 100); };
  // positioned channel: folder Volume * attenuation (GetSoundAttenuation = 1.0 stub) * group * file
  // clamped 0..1
  M.channelVolume = function (folderVolume, groupVolume, fileVolume, attenuation) {
    if (attenuation === undefined) attenuation = 1;
    return clamp(folderVolume * attenuation * groupVolume * (fileVolume === undefined ? 1 : fileVolume), 0, 1);
  };
  // ambient (interface, weather, start_sound ... ambient): group * file only, folder Volume NOT applied
  M.ambientVolume = function (groupVolume, fileVolume) { return clamp(groupVolume * (fileVolume === undefined ? 1 : fileVolume), 0, 1); };

  // ---- rate [V]: SetRate takes a wanted DURATION in seconds (0 = the file's own rate);
  // factor = 0.001 / seconds * fileMs = fileSeconds / seconds. Only caller: the reload sound, stretched to the reload time
  // (not for vehicles). [I] Miles rate factor resamples: pitch moves with speed.
  M.rateFactor = function (fileMs, seconds) { return seconds ? 0.001 / seconds * fileMs : 1; };

  // ---- voice limit [V]
  // weight: 1 inside the folder min distance, else 1 / 2^(d / min)  (:337-342)
  M.candidateWeight = function (d, minDist) { return minDist > d ? 1 : 1 / Math.pow(2, d / minDist); };
  // "played" of a candidate (:334-335) = AIL_sample_position / info.samples. [I: MSS docs] AIL_sample_position counts BYTES of
  // the sample data and AILSOUNDINFO.samples counts sample frames, so played = time part * bytes per frame: PCM16 mono reaches
  // 0.5 (snd_cutoffPart) a quarter in, IMA ADPCM mono (1024 bytes / 2041 frames) only at its very end, PCM16 stereo at 1/8.
  M.playedFraction = function (playedMs, fileMs, bytesPerFrame) {
    if (!(fileMs > 0)) return 0;
    return (playedMs / fileMs) * (bytesPerFrame === undefined ? 1 : bytesPerFrame);
  };
  // order and priority of one candidate (:343-356): played = playedFraction, playedMs = ms played
  M.candidateRank = function (loop, played, playedMs, folderPriority) {
    var priority = folderPriority, order;
    if (loop) order = played;
    else if (Math.abs(played) < M.ORDER_EPSILON) order = M.ORDER_NOT_STARTED;
    else if (played > M.CUTOFF_PART) { priority = 0; order = played; }
    else if (M.KEEP_TIME_MS < playedMs) order = M.ORDER_KEPT_TOO_LONG;
    else order = played;
    return { order: order, priority: priority };
  };
  // sort comparator (:119-131): heavier first, then higher priority, then (two one-shots) lower order, else older serial
  M.compareCandidates = function (a, b) {
    var before;
    if (Math.abs(a.weight - b.weight) <= M.ORDER_EPSILON) {
      if (a.priority === b.priority) {
        if (!a.loop && !b.loop) { if (a.order === b.order) return 0; before = a.order < b.order; }
        else { if (a.serial === b.serial) return 0; before = a.serial < b.serial; }
      } else before = a.priority > b.priority;
    } else before = a.weight > b.weight;
    return before ? -1 : 1;
  };
  // group budget (:366-369): int(min(max(pool * share, 1), limit) + 0.5)
  M.groupFree = function (pool, share, limit) { return Math.floor(Math.min(Math.max(pool * share, 1), limit) + 0.5); };
  // one copy of a file against the copies already let play this tick (:375-385): admitted playedMs list, its playedMs
  M.copyAdmit = function (admittedMs, playedMs, maxPlaying, thresholdMs) {
    if (maxPlaying === undefined) maxPlaying = Math.max(1, Math.min(M.MAX_FILE_PLAYED, M.MAX_PLAYING));
    if (thresholdMs === undefined) thresholdMs = M.ANTI_REVERB_MS;
    if (admittedMs.length >= maxPlaying) return { ok: false, reason: 'max-copies' };
    for (var j = 0; j < admittedMs.length; j++) if (Math.abs(admittedMs[j] - playedMs) < thresholdMs) return { ok: false, reason: 'anti-reverb' };
    return { ok: true, reason: null };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.SNDMATH = M;
})(typeof window !== 'undefined' ? window : this);
