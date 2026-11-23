// view kind shader, server side (.pso pixel / .vso vertex: the game's shader cache). Layout from the engine (tools/lib/dxbc.js):
// the cache key as an engine string, then the DXBC code;
// the file name is the MD5 of the key in lower case (:250). What a modder needs to know (:69-71): as64 compiles
// shader/dx10/*.hlsl itself and keeps its own cache in the user folder (@/shader_cache/<renderer>-as64/), cleared when the shader
// sources' CRC changes (:99); the cache shipped in gamelogic.pak (shader/cache/dx11.0/) or in a mod is never read by as64.
// Game parity (ctx.gameId, answered as game): MoW:AS2 reads the shipped cache (modweb porting/as64-vs-mowas2:9 [I]); Gates of Hell
// keeps @/shader_cache/<renderer>/ with kinds .vso .pso .gso .hso .dso .cso and copies the shipped cache over it (GHFMT-39 [V]).
// The GoH files have the same form (key, then DXBC; name = MD5 of the key; sources under shader/dx10/): read on the real GoH install,
// all five shipped kinds (.pso .vso .hso .dso .cso) [I]. The page words the cache line per game.
//   GET /api/x/view/shader/info?<ref> -> { name, size, key, keyLen, parsed{file,entry,defines}, md5{asIs,lower,stem,match},
//                                          dxbc{magic,checksum,size,chunks,model,rdef,isgn,osgn,stat,notes}, source{key,found} }
// Read only.
// Author: Imperator_Aug (ARSENAL, ia-41a7562b)
'use strict';
const R = require('../ref'), D = require('../../../../lib/dxbc');
const MAX = 8 << 20;
const gidOf = ctx => { try { const g = ctx && typeof ctx.gameId === 'function' ? ctx.gameId() : null; return g === 'mowas2' || g === 'goh' ? g : 'as64'; } catch { return 'as64'; } };

async function info(url, body, ctx) {
  const q = R.refOfQuery(url), r = R.readRef(ctx, q, { max: MAX });
  const s = D.cacheSplit(r.buf), out = { name: r.name, game: gidOf(ctx), size: r.size, key: s.key, keyLen: s.keyLen, keyBad: !!s.bad, codeOff: s.codeOff, parsed: null, md5: null, dxbc: D.parse(s.code), source: null };
  if (s.key != null) {
    out.parsed = D.parseKey(s.key);
    const m = D.md5Name(s.key), stem = String(r.name).replace(/\.[^.]*$/, '').toLowerCase();
    out.md5 = { asIs: m[0], lower: m[1], stem, match: stem === m[1] || stem === m[0] };
  }
  // the source the key names: /shader/dx10/<file>.hlsl (shaderVersion is "dx10" on dx11)
  if (out.parsed && out.parsed.file && q.mod) {
    const k = 'resource/shader/dx10/' + out.parsed.file.toLowerCase() + '.hlsl';
    let found = false; try { found = R.listKeys(ctx, q.mod, k).includes(k); } catch { found = false; }
    out.source = { key: k, found };
  }
  return out;
}

module.exports = {
  exts: ['pso', 'vso', 'gso', 'hso', 'dso', 'cso'],
  routes: { 'GET /api/x/view/shader/info': info },
  remote: ['GET /api/x/view/shader/info'],
};
