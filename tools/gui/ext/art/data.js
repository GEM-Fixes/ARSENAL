// art ext data: plain-words server messages, file-type tags, copy-paste recipes. Source: guide/15, guide/16,{textures,sound-misc,wiring},,{lod-render,sound-names}.
// Author: Imperator_Aug (ARSENAL, ia-ad2b5271)
'use strict';
const MSG = {
  'wav.short': 'This file is too small to be a sound.',
  'wav.ogg': 'This is an .ogg file renamed to .wav. The game cannot play .ogg. Convert it to a real .wav (see the ffmpeg recipe).',
  'wav.mp3': 'This is an .mp3 file renamed to .wav. Convert it to a real .wav (see the ffmpeg recipe).',
  'wav.flac': 'This is a .flac file renamed to .wav. Convert it to a real .wav (see the ffmpeg recipe).',
  'wav.notwav': 'This is not a .wav file (no RIFF/WAVE header).',
  'wav.nofmt': 'The .wav header is damaged (no format block).',
  'wav.codec': 'The sound format is {c}. The game plays mono IMA ADPCM or 16-bit PCM safely; others are untested.',
  'wav.bits': 'PCM is {b}-bit. Use 16-bit.',
  'wav.stereo': 'The sound is not mono. Sounds that come from a place in the world (shots, voices) should be mono, or they may play wrong.',
  'wav.rate': 'Sample rate is {r} Hz. The game files use 44100 Hz (22050 Hz also exists).',
  'wav.good': 'Looks fine: {c}, {r} Hz.',
  'img.dx10': 'DDS uses the DX10 header. The game cannot read it. Save as DXT1 or DXT5 (or plain 32-bit).',
  'img.ati2': 'DDS uses ATI2/BC5. The game cannot read it. Use DXT5 or DXT1.',
  'img.mult4': 'The picture size is not a multiple of 4. Compressed DDS needs width and height divisible by 4.',
  'copy.notingame': 'not in the game files',
};
function t(k, p) { let s = MSG[k] || k; if (p) s = s.replace(/\{(\w+)\}/g, (m, n) => (p[n] == null ? m : String(p[n]))); return s; }

// per-extension tag: what a beginner may do with the file
// text = edit in Notepad (UTF-8 or the file's own encoding; keep line breaks) ; exporter = made by an exporter/tool, do not hand-edit ; image = paint program ; sound = audio program ; pack = archive
const TAGS = {
  '.def': 'text', '.mdl': 'text', '.mtl': 'text', '.ebm': 'text', '.tex': 'text', '.set': 'text', '.ext': 'text', '.inc': 'text', '.txt': 'text', '.lng': 'text', '.info': 'text', '.mod': 'text', '.mis': 'text', '.sdl': 'text', '.cfg': 'text', '.pattern': 'text', '.ini': 'text', '.yaml': 'text', '.json': 'text', '.md': 'text',
  '.ply': 'exporter', '.anm': 'exporter', '.vol': 'exporter', '.net': 'exporter', '.grs': 'exporter',
  '.dds': 'image', '.tga': 'image', '.png': 'image', '.jpg': 'image', '.bmp': 'image',
  '.wav': 'sound', '.mp3': 'sound', '.ogg': 'badsound', '.flac': 'badsound',
  '.avi': 'video',
  '.pak': 'pack', '.pat': 'pack', '.zip': 'pack',
};
const FFMPEG = {
  wav16: 'ffmpeg -i input.mp3 -ac 1 -ar 44100 -c:a pcm_s16le output.wav',
  ima: 'ffmpeg -i input.wav -ac 1 -ar 44100 -c:a adpcm_ima_wav output.wav',
};
module.exports = { t, MSG, TAGS, FFMPEG };
