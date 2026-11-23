// output checks for helmetport runs 1-2 (work/out1, work/out2): rewrite shape, cp1251-safe CRLF text, mdl-folder mtl carried, breed splice
// Author: Imperator_Aug (ARSENAL, ia-7f037f23)
'use strict';
const fs = require('fs'), path = require('path');
const W = path.join(__dirname, 'work');
let bad = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); bad++; } };
const rd = (o, k) => { try { return fs.readFileSync(path.join(W, o, 'resource', k), 'latin1'); } catch { return null; } };
const crlf = t => t != null && !/[^\r]\n/.test(t) && t.includes('\r\n');
const sets = ['head/hv/helm_a', 'head/lt/cap_a', 'head/mask_x', 'head/chain_b', 'body/armor_v', 'body/radio_p', 'head/hv/helm_a'];
for (const s of sets) { const t = rd('out1', 'set/stuff/' + s); ok(t != null, s + ' written'); ok(crlf(t), s + ' CRLF'); }
const a = rd('out1', 'set/stuff/head/hv/helm_a') || '';
ok(/^\{from "helmet pattern"/.test(a) && !/bogus_key/.test(a) && /\{tag "armor"\}/.test(a), 'heavy -> helmet pattern, bad key dropped, armor kept');
const c = rd('out1', 'set/stuff/head/lt/cap_a') || '';
ok(/^\{from "pattern headgear"/.test(c) && !/armor/.test(c), 'light -> pattern headgear, armor dropped');
const v = rd('out1', 'set/stuff/body/armor_v') || '';
ok(/^\{from "pattern overcoat"/.test(v) && /\{tag "armor"\}/.test(v) && /\{size 3 6\}/.test(v), 'body armour -> pattern overcoat, inventory verbatim');
ok(/^\{from "helm_a"/.test(rd('out1', 'set/stuff/head/chain_b') || ''), 'chain from kept');
ok(rd('out1', 'set/stuff/head/old/mask_x') == null, 'dup name: only the first ported');
ok(/^\{item/.test(rd('out1', 'set/stuff/head/mask_x') || ''), 'head item kept');
ok(fs.existsSync(path.join(W, 'out1/resource/entity/inv/head/helm_a/helm.mtl')), 'mdl-folder mtl carried');
ok(fs.existsSync(path.join(W, 'out1/resource/entity/inv/head/src/helm.ply')), 'shared ply carried');
ok(fs.existsSync(path.join(W, 'out1/resource/entity/inv/head/helm_a/helm_a.def')), 'def carried');
const b = rd('out2', 'set/breed/mp/ger/hp.set') || '';
ok(crlf(b), 'breed CRLF');
ok(/\{armors\r\n\t\t\{head "mask_x"\}\r\n\t\t\{body "armor_v"\}\r\n\t\}\r\n\t\{veterancy 1\}/.test(b), 'armors inserted before veterancy');
ok((b.match(/\{breed/g) || []).length === 1 && /\(include "veterancy_generic.inc"\)/.test(b), 'rest of breed kept');
const k = rd('out5', 'set/stuff/head/lt/cap_a') || '';
ok(/\{tag "armor"\}/.test(k), '--keep-light-armor keeps armor');
const r = rd('out6', 'set/breed/mp/ger/hp3.set') || '';
ok(/\{armors\r\n\t\t\{head "helm_a"\}\r\n\t\}/.test(r) && (r.match(/armors/g) || []).length === 1, 'existing armors replaced');
// fit + tone (run 7 auto from refs, run 8 default offset)
const mc = rd('out7', 'entity/inv/head/helm_c/helm_c.mdl') || '';
ok(/\{bone "hw"\r\n\t\t\t\{Position 0\.5 0 0\.3\}\r\n\t\t\t\{VolumeView "helmc\.ply"\}/.test(mc) && /\{orientation\r\n\t\t\t1 0 0/.test(mc), 'fit: child bone gets Position, root kept');
const ma = rd('out7', 'entity/inv/head/helm_a/helm_a.mdl') || '';
ok(/\{bone "basis"\s*\{bone "hp_fit"\s*\{Position 0\.5 0 0\.3\}\s*\{VolumeView "\.\.\/src\/helm\.ply"\}\s*\}\s*\}/.test(ma) && crlf(ma), 'fit: root view wrapped in hp_fit, CRLF');
ok(/\{Position 0\.42 0\.06 0\.24\}/.test(rd('out8', 'entity/inv/head/helm_c/helm_c.mdl') || ''), 'fit: default offset without refs');
let tx = null; try { tx = fs.readFileSync(path.join(W, 'out7/resource/texture/common/_hum/helmc.dds')); } catch { }
ok(tx && tx.readUInt32LE(80) === 0x41 && tx.readUInt32LE(28) === 3 && tx[128 + 1] >= 95 && tx[128 + 1] <= 105, 'tone: A8R8G8B8, 3 mips, grey 49 x ~2');
ok(tx && tx[128] >= 112 && tx[128] <= 125 && tx[128] - tx[128 + 2] >= 12, 'tone: per channel, blue k (~2.4) > red k (~2) [BGRA]');
const mcap = rd('out7', 'entity/inv/head/cap_c/cap_c.mdl') || '';
ok(/\{bone "cw"\r\n\t\t\t\{Matrix34\r\n\t\t\t\t1\.1\t0\t0\r\n\t\t\t\t0\t1\.1\t0\r\n\t\t\t\t0\t0\t1\.1\r\n\t\t\t\t0\.2\t0\t0\.1\r\n\t\t\t\}/.test(mcap), 'cap fit: own scale 1.1 + offset 0.2 0 0.1 from fieldcap ref (not the helmet offset)');
let tc = null; try { tc = fs.readFileSync(path.join(W, 'out7/resource/texture/common/_hum/capc.dds')); } catch { }
ok(tc && tc.readUInt32LE(80) === 0x41 && tc[128] >= 45 && tc[128] <= 53 && tc[128 + 2] >= 45 && tc[128 + 2] <= 53, 'cap tone: cap refs k ~1, not the helmet k');
// --cap-tone / --cap-spec (run 9 with --game, run 10 without)
let t9 = null; try { t9 = fs.readFileSync(path.join(W, 'out9/resource/texture/common/_hum/capc.dds')); } catch { }
ok(t9 && t9[128] >= 90 && t9[128] <= 106 && t9[128 + 2] >= 90 && t9[128 + 2] <= 106, 'cap-tone 2: cap diffuse ~49 x 2, wins over --tone auto (k ~1)');
const m9 = rd('out9', 'entity/inv/head/cap_c/capc.mtl') || '';
ok(/\{specular "\/entity\/inventory\/-equipment\/head\/fieldcap1_ger\/fieldcap_ger_sp"\}/.test(m9) && /\{color "230 230 230 76"\}/.test(m9), 'cap-spec ref: vanilla spec by absolute path + power 76');
ok(!/fieldcap_ger_sp/.test(rd('out9', 'entity/inv/head/helm_c/helmc.mtl') || '') && /null_sp/.test(rd('out7', 'entity/inv/head/cap_c/capc.mtl') || ''), 'cap-spec: helmets and runs without it keep the GoH spec');
ok(/fieldcap_ger_sp"\}/.test(rd('out10', 'entity/inv/head/cap_c/capc.mtl') || ''), 'cap-spec ref without --game: default ref');
let t11 = null; try { t11 = fs.readFileSync(path.join(W, 'out11/resource/texture/common/_hum/capc.dds')); } catch { }
ok(t11 && t11[130] >= 76 && t11[130] <= 86 && t11[129] >= 81 && t11[129] <= 90 && t11[129] > t11[130], 'cap-tone screen: 1.65,1.75,1.65 on grey 49 [BGRA]');
ok(rd('out1', 'texture/common/_hum/helmc.dds') == null && !/Position/.test(rd('out1', 'entity/inv/head/helm_a/helm_a.mdl') || ''), 'no --fit: mdl untouched');
process.exit(bad ? 1 : 0);
