// NAT-GAP: no "hand" or "unexplained" gap entry for keys whose as64 form is known.
// 1. {burst ..} and block {spreading ..} are the as64 form (vanilla as64 set/stuff/gun/120mm_l50): kept byte-equal, no hand entry;
//    a sub-key the as64 reader has no case for is dropped (WARN_PORT_BURST_KEY / WARN_PORT_SPREADING_KEY), with a gap entry.
// 2. stuffnames.checkStuff removals (cursor, sound, view+tail, tail) become dropped entries with their own code, every removed path listed.
// Author: Imperator_Aug (ARSENAL, ia-5bb729cc)
'use strict';
const g = require('../goh2as2'), SN = require('../stuffnames');
let fail = 0;
const t = (name, good, extra) => { console.log((good ? 'ok   ' : 'FAIL ') + 'natgap: ' + name + (good || extra === undefined ? '' : '  ' + JSON.stringify(extra).slice(0, 600))); if (!good) fail++; };
const conv = (src, key, ext) => { const gaps = [], rep = { add() {}, info() {} }; const out = g.convertText(src.replace(/\n/g, '\r\n'), 'resource/' + key, key, ext, rep, { gaps }); return { out: out.replace(/\r\n/g, '\n'), gaps }; };

// 1a native burst + spreading kept
const nat = `{from "pattern bullet"
	{burst
		{min 2}
		{short 4 1}
		{long 6 2}
		{rangeKoef 0.5}
	}
	{spreading
		{BurstAccuracy 100 95 90}
	}
	{Spreading
		{SpreadXYRatio 1.2}
	}
	{spreading
		{radiusTable {0 0.02} {40 0.5}}
	}
}
`;
{ const r = conv(nat, 'set/stuff/mgun/x.pattern', 'pattern');
  t('native burst/spreading blocks written unchanged', r.out === nat, r.out);
  t('no hand and no dropped entry for them', !r.gaps.length, r.gaps); }
// 1b a sub-key as64 has no case for
{ const r = conv(`{from "pattern bullet"
	{burst
		{short 4 1}
		{shots 3}
	}
	{spreading
		{radiusTable {0 0.02}}
		{zoomfactor 2}
	}
}
`, 'set/stuff/mgun/y.pattern', 'pattern');
  t('burst/shots dropped, short kept', !/shots/.test(r.out) && /\{short 4 1\}/.test(r.out), r.out);
  t('spreading/zoomfactor dropped, radiusTable kept', !/zoomfactor/.test(r.out) && /radiusTable/.test(r.out), r.out);
  const codes = r.gaps.map(x => x.kind + ' ' + x.code + ' ' + x.key).sort();
  t('gap entries: dropped WARN_PORT_BURST_KEY + WARN_PORT_SPREADING_KEY', JSON.stringify(codes) === JSON.stringify(['dropped WARN_PORT_BURST_KEY from/burst/shots', 'dropped WARN_PORT_SPREADING_KEY from/spreading/zoomfactor']), codes);
  t('no hand entry', !r.gaps.some(x => x.kind === 'hand'), r.gaps); }
// 1c from/calibre still hand (no as64 form proven here)
{ const r = conv('{from "x"\n\t{calibre 7}\n}\n', 'set/stuff/w.weapon', 'weapon');
  t('from/calibre stays a hand entry (out of NAT-GAP scope)', r.gaps.some(x => x.kind === 'hand' && x.key === 'from/calibre'), r.gaps); }

// 2 checkStuff steps -> gap entries
const ammo = `{from "pattern ap"
	{view "goh_shell" {tail "goh_tail"}}
	{trace {view "/texture/x"}}
}
`;
{ const cs = SN.checkStuff(ammo, null, null, null, () => false), gs = g.stuffNameGaps(ammo, cs.text, 'set/stuff/shell/a.ap.ammo', cs.log, g.STUFF_NAME_DROPS.view);
  t('view step: one VIEW entry with view and view/tail', gs.length === 1 && gs[0].code === 'WARN_PORT_VIEW_DROPPED' && JSON.stringify(gs[0].paths.slice().sort()) === '["from/view","from/view/tail"]' && gs[0].kind === 'dropped', gs);
  t('trace/view renamed, not a gap path', !gs.some(x => x.paths.includes('from/trace/view')), gs); }
{ const src = '{from "pattern ap"\n\t{view "ok" {tail "goh_tail"}}\n}\n', cs = SN.checkStuff(src, null, null, null, n => n === 'ok'), gs = g.stuffNameGaps(src, cs.text, 'k', cs.log, g.STUFF_NAME_DROPS.view);
  t('tail alone: WARN_PORT_TAIL_DROPPED', gs.length === 1 && gs[0].code === 'WARN_PORT_TAIL_DROPPED' && gs[0].paths[0] === 'from/view/tail', gs); }
{ const src = '{from "pattern x"\n\t{fireSound "goh/a"}\n\t{reloadSound "goh/b"}\n\t{cursor "c1"}\n\t{parameters "ap"\n\t\t{cursorReloading "c2"}\n\t}\n}\n';
  const s = SN.checkStuff(src, null, null, () => false, null), gs = g.stuffNameGaps(src, s.text, 'k', s.log, g.STUFF_NAME_DROPS.sound);
  t('sound step: both sound keys, one WARN_PORT_SOUND_DROPPED entry', gs.length === 1 && gs[0].code === 'WARN_PORT_SOUND_DROPPED' && gs[0].paths.length === 2, gs);
  const c = SN.checkStuff(s.text, null, () => false, null, null), gc = g.stuffNameGaps(s.text, c.text, 'k', c.log, g.STUFF_NAME_DROPS.cursor);
  t('cursor step: from/cursor and from/parameters/cursorreloading under WARN_PORT_CURSOR_DROPPED', gc.length === 1 && gc[0].code === 'WARN_PORT_CURSOR_DROPPED' && JSON.stringify(gc[0].paths.slice().sort()) === '["from/cursor","from/parameters/cursorreloading"]', gc);
  t('reasons cite an as64 source line', gs.concat(gc).every(x => /\.cpp:\d+/.test(x.reason)), gs.concat(gc).map(x => x.reason)); }
{ const gs = g.stuffNameGaps('{a {b 1}}', '{a}', 'k', [], {});
  t('a removal with no table row is named PORTGAP_STUFF_NAME, never silent', gs.length === 1 && gs[0].code === 'PORTGAP_STUFF_NAME', gs); }
console.log(fail ? 'natgap: FAIL' : 'natgap: all ok');
process.exit(fail ? 1 : 0);
