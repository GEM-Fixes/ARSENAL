// Map Viewer page shell, page side (MV-PG1): tools/mapviz/README.md 1.10 (page API V), 5 (envelopes), 6.1 (routes),
// 11. An ES5 page script, joined into the page by ext/mapviz/index.js before every other part.
// Author: Imperator_Aug (ARSENAL, ia-91d82d1b)
module.exports = String.raw`
// ---- Map Viewer: how a part plugs in (tools/mapviz/README.md 1.10) ----
// A part pushes {id, init(V)} to EXT_SCREENS.mapviz.parts. The shell builds the page, then calls init(V) once per part.
//   V.q(name)               current value: target, map, mode, side, kind, game, layers (shareable list: no tool layer, no
//                           layer of a PRIVATE group: strong, danger, factfire, factplace, fairness, without include),
//                           allLayers (the same with those), include,
//                           rmt, canvas (true when the browser draws), size [w, h], modes, cursor [x, y] or null, reduced,
//                           jobs (the page's jobs still queued or running: [{id, what, state, stage, done, total, queue,
//                           target, map, args, text}], args = the job's key fields as posted {map?, mode?, side?, kind?,
//                           size?}: a need fits a job only when every key field the need names is the same; text = the
//                           job line words of that job), docBusy (true from a map pick until its document landed or
//                           failed: a part holds every fetch that carries the mode while it is true), mod (the page's
//                           mod folder, null when there is none or the page's game is not the viewer's target: a part
//                           keys its own caches on target, game and mod), tab (the right column tab shown: layers,
//                           inspect, analysis or pictures), picker (true while the map picker is open)
//   V.tab(id)               show that right column tab (layers, inspect, analysis, pictures) -> true, false for another id
//   V.api(method, path, body, opt) GET or POST /api/x/mapviz/<path> -> Promise; the page's target, game, mod folder, map, mode,
//                           side and kind are added where the route takes them (a body key set to null leaves one out).
//                           opt = the third argument of the GUI's api() (README JOBS): {what: ready text} names the
//                           request in the job list, {job:false} keeps it out; with no what the shell names it by route
//   V.job(what, args)       POST job, show it on the job line, poll every 500 ms -> Promise of the finished job record;
//                           a failed, cancelled or timed out job rejects with an Error carrying key mapviz.err.<code>;
//                           a poll with no answer or a 5xx is tried again up to 3 times in a row, 1 s apart; then (and
//                           after 20 answers in a row whose state the page does not know) the job ends as failed. Every
//                           failed end says the job-failed line (mapviz.shell.jobFailed) before the promise rejects
//   V.doc                   the map document of the chosen map (entities left out), null while none or loading
//   V.pal                   palette.json (null until the first refresh brings it)
//   V.on(event, fn) / V.emit(event, data)   map {key, mode, side, kind, doc}, view {cx, cy, zoom}, cursor {x, y, px, py,
//                           click?, hit?}, layers {visible} (layer tick and group tick both on), theme, tool {id}, refresh
//                           {target}; a part asks for a map with V.emit('map', {key, mode?, pick: true}): the shell takes
//                           that request itself and never hands it on, so a 'map' listener only sees the shell's form
//                           (with user: true while the open map was opened by the user's pick, false when a refresh,
//                           S.mapKey or a permalink opened it; key null when the map was closed: game, folder or mod
//                           changed); job {id, what, state, stage, done, total, queue, target, map, args, text, end?} on
//                           every poll answer of a page job (end: true once, when it ended; one poll per job id, a joined
//                           request gets the same promise); products {} once per page job that ended done and when the
//                           cache answer changed: every row or status in the "not made" state asks once again (not one
//                           whose own job still runs); doc {key, ok} once the document read of the open map ended (ok
//                           false: failed or not made; after the 'map' event when it landed); picker {open} when the map
//                           picker (the popover under the map button that holds the 'list' panel) opens or closes. Nothing of it while the
//                           page is hidden: no draw, no recheck, no products; a read asked then waits until the page is
//                           shown (and is dropped, rejected with stale: true, when its map was closed). A shown page whose
//                           game, folder or mod changed with no refresh yet takes the change in the moment it reads,
//                           draws, gets a pick or a user action (as a refresh: the map closes, the map list of the new
//                           context is asked for) and then goes on; a read or job of the closed map is rejected, stale;
//                           a pick that takes such a change in is dropped (it came from the old context's list: no map
//                           set, no read, no job; the page says the closed-map line); a pick after that opens
//   V.addLayer({id, group, label, legend, engineTrue, engineTrueGoh?, defaultOn, draw(ctx2d, view), tiles?: base, hit?(x, y),
//                list?(), source?})  engineTrue: the row shows the mark MK_T (as the game sees it), else MK_E (estimate); engineTrueGoh (a
//                           boolean) takes its place on the Gates of Hell page, for a layer whose rule is untested
//                           on AS64 and MoW:AS2 but only inferred on GoH. group is one of base height game movement water objects cover sight viewshed strong
//                           danger factfire factplace fairness checks tools (a layer that names the group it had before
//                           the split, e.g. pass in game, lands in its new group: REGROUP);
//                           label and legend labels are text or mapviz.* keys; no draw and no tiles: the shell fetches
//                           GET layer name=<source or id> and draws the grid or vector envelope itself; view.env holds it.
//                           With no canvas context the shell still fetches the 'source' layers that are visible, so the
//                           item lists fill. tool: true (or a layer whose id is a tool id) marks a tool layer: never in
//                           the permalink or V.q('layers'), and a permalink leaves its tick alone
//   V.relist()              the shell draws the DOM item lists of the visible layers again; a part calls it when its
//                           list() answer changed outside the shell's own fetch (its own fetch, or a draw that found new items)
//   V.addTool({id, label, key, start(), move(x, y), click(x, y), end()})   one tool at a time; Esc ends it
//   V.addHover(fn(x, y) -> [{label, value, state?}], {quiet?})   rows for the readout under the cursor and the cursor strip.
//                           A row with state: true (or whose value is one of the shell's state words: not made yet,
//                           loading, reading, being made) is a state, not a value: the readout keeps it, the strip leaves
//                           it out. quiet: the provider's rows go to the strip only (a part whose own panel is aria-live)
//   V.addPanel({id, side: 'left' | 'right' | 'bottom', name?, tab?, build(box, V)})   a container block the part fills with
//                           field leaves; its block name is name (words or a mapviz.* key), else mapviz.<id>.title.
//                           Where it goes (placeOf): the panel 'list' -> the map picker popover; a panel whose id is a tool
//                           id -> a card docked on the stage, shown only while that tool is in use; tab ('layers' |
//                           'inspect' | 'analysis' | 'pictures') -> that right column tab; side 'left' -> the left
//                           column; a right or bottom panel -> its tab in TABOF, else a right panel -> inspect and a
//                           bottom panel -> below the view area
//   V.view                  {cx, cy, zoom}: world centre and screen pixels per world unit; screen up = +world y
//   V.toWorld(px, py) / V.toScreen(x, y)   canvas pixels <-> world units
//   V.redraw()              draw again on the next frame
//   V.token(name)           a page colour token (bg, fg, line, acc, err, hint, card ...) for chrome; data colours come
//                           only from V.pal or an envelope's palette
//   V.say(key, args)        one line in the page's live message
// Outside V: EXT_SCREENS.mapviz.kit = {colour, colourCss, b64, decode, gridDraw, vectorDraw, toScreen, toWorld, tileBox}
// for reading and drawing envelopes (b64(text) -> Uint8Array; tileBox(hd, z, tx, ty, view, w, h) -> [x, y, w, h] the
// screen rectangle of a tile snapped to whole pixels by its edges, so tiles of a mosaic meet with no gap and no overlap),
// EXT_SCREENS.mapviz.keys = the keyboard list, EXT_SCREENS.mapviz._t = pure helpers for tests.
(function(){
// the right column groups, one idea each (GROUPS: list order). Split from the old ten: movement out of game, viewshed (the
// clicked-spot tool layers) out of sight, danger and the two factor groups out of strong, tools (measure, profile) out of
// checks. No group was renamed, so every old group name is still a group. DRAW: canvas order, bottom first; the old
// order is kept except that the factor grids now lie under the strong point marks and score, and the movement grids
// under the game marks (zones, flags, spawns and fortification slots stay readable over a grid)
var GROUPS=['base','height','game','movement','water','objects','cover','sight','viewshed','strong','danger','factfire','factplace','fairness','checks','tools'];
var DRAW=['base','height','water','objects','cover','sight','viewshed','factfire','factplace','strong','danger','fairness','movement','game','checks','tools'];
var PRIVATE={strong:1,danger:1,factfire:1,factplace:1,fairness:1};
// REGROUP: layer id -> [the group it had before the split, its group now]. A part (or an older copy of one) that still
// names the old group gets the new one, so nothing that names old groups breaks
var REGROUP=(function(){var r={},k;function put(ids,a,b){ids.forEach(function(id){r[id]=[a,b]})}
 put(['pass','move','travel.a','travel.b','route.a','route.b','routes'],'game','movement');
 put(['sight.view','sight.vis','sight.fire','sight.rings'],'sight','viewshed');
 put(['strong.danger','strong.howitzer','strong.nocrest'],'strong','danger');
 put(['ow','kz','sp','df','amb','enf'].map(function(f){return 'strong.f.'+f}),'strong','factfire');
 put(['cv','rt','fr','px','hu'].map(function(f){return 'strong.f.'+f}),'strong','factplace');
 put(['measure','profile'],'checks','tools');return r})();
function regroup(id,g){var r=REGROUP[id];return r&&r[0]===g?r[1]:g}
// a group with nothing on is folded and a group with something on is open, until the user folds or unfolds it: that
// choice is kept with LS (as2gui.maps.viewer.fold.<group>: a maps.* name, so the GUI keeps it in its settings file too)
var SIDES=['a','b','both'],KINDS=['inf','mg','at','tank'],TARGETS={as64:1,mowas2:1,goh:1};
// QCOM: the GET routes the shell adds the page's fields to (1 = ALLC); PHQ: those that also get the page phase when one is
// picked (waves C and D: layer, strong, checks, json; a part's own query or body may set it, or leave it out with null)
var QCOM={maps:['target','game','mods','modDir'],doc:1,layer:1,hover:1,tiles:1,card:1,strong:1,checks:1,json:1,pictures:1,'export':1,
 'previews/targets':['target','game','mods','modDir','map','mode']};
var PHQ={layer:1,strong:1,checks:1,json:1};
var ALLC=['target','game','mods','modDir','map','mode','side','kind'];
var JOBF={map:1,mode:1,side:1,kind:1,size:1,phase:1,at:1,pose:1,light:1,target:1,game:1,mods:1,modDirs:1};
var KEYF=['map','mode','side','kind','size','phase','at','pose','light'];
var TILE=256,BATCH=16,ZMIN=0.00005,ZMAX=64,POLLRETRY=3,ODDMAX=20,LIVE={queued:1,running:1};
var KEYS=[['Arrows','mapviz.shell.key.arrows'],['Shift+Arrows','mapviz.shell.key.pan'],['+ -','mapviz.shell.key.zoom'],['0','mapviz.shell.key.fit'],
 ['Double-click','mapviz.shell.key.dbl'],['Enter','mapviz.shell.key.enter'],['Esc','mapviz.shell.key.esc'],['F2','mapviz.shell.key.picker'],
 ['[ ]','mapviz.shell.key.fold'],['F','mapviz.shell.key.full'],['/','mapviz.shell.key.filter'],['?','mapviz.shell.key.list']];
// views: one press sets the layer ticks of a common look. Each names real layer ids of the parts (V.addLayer); the base picture
// and the game marks (MARKS) stay on in every view, every other layer that is not a tool layer goes off, and the group tick of a
// group the view uses goes on. A view only changes ticks: it never starts a job (a layer of it that is not made shows its Make)
var MARKS=['zones','flags','spawns','points','boxes','mission','game.fort'];
var VIEWS=[['plain','mapviz.shell.view.plain',['base']],
 ['terrain','mapviz.shell.view.terrain',['base','shade','height','contours']],
 ['movement','mapviz.shell.view.movement',['base','move','routes']],
 ['water','mapviz.shell.view.water',['base','water.band','water.drown','water.labels','water.checks']],
 ['cover','mapviz.shell.view.cover',['base','cover.band','cover.edges','cover.points','sight.field']],
 ['strong','mapviz.shell.view.strong',['base','strong.labels','strong.score','strong.uncont','strong.first','strong.contact']]];
// viewSet(id) -> {layer id: 1} the view turns on (its own ids and the game marks), null for no such view
function viewSet(id){for(var i=0;i<VIEWS.length;i++)if(VIEWS[i][0]===id){var s={};VIEWS[i][2].concat(MARKS).forEach(function(x){s[x]=1});return s}return null}
// the two marks of a layer row: the rule is the game's own (MK_T) or our estimate (MK_E); the words are for screen readers
var MK_T='\u25C6',MK_E='\u2248';
// filterHit(hay, q): every word of the filter text q (lower case) is in hay (the row's label, group name, help text and id)
function filterHit(hay,q){q=String(q||'').toLowerCase().replace(/^\s+|\s+$/g,'');if(!q)return true;hay=String(hay||'').toLowerCase();var w=q.split(/\s+/);
 for(var i=0;i<w.length;i++)if(hay.indexOf(w[i])<0)return false;return true}
// the right column tabs (TABS: tab order) and the tab of each panel id the parts add today (TABOF); a panel's own tab
// option wins over the table, a right panel the table does not name goes to inspect (placeOf below)
var TABS=['layers','inspect','analysis','pictures'];
var TABK={layers:'mapviz.shell.tab.layers',inspect:'mapviz.shell.tab.inspect',analysis:'mapviz.shell.tab.analysis',pictures:'mapviz.shell.tab.pictures'};
var TABOF={base:'layers',water:'layers',layers:'layers',hover:'inspect',card:'inspect',objects:'inspect',strong:'analysis',checks:'analysis',
 pictures:'pictures',style:'pictures','export':'pictures'};
// UPM: world units per metre when the document names none (tools/mapviz/README.md: 20 u = 1 m); SCALEPX: the longest scale bar
var UPM=20,SCALEPX=140,STRIPMAX=8;
// the page's layout (W4, P6): the view area (one head row and the main row) is one column of the window height under the
// page header (--hdh); the head row holds the title, the map picker button, mode, phase, side, unit kind and the view
// buttons, and wraps; the main row takes what the head leaves, never under 320 px; in it the left column (game panel,
// items) 220 to 250 px, the right column (the four tabs) 340 to 370 px, the stage between them. A folded left column
// takes no width (its fold button is the toolbar's first item); a folded right column keeps only its fold button. On the stage: the tool card (top left), the first-time hint (centre), the cursor strip
// and the job line (bottom). The map picker is a popover under its button. The side columns scroll inside themselves;
// under 900 px one column: the stage, then the tabs, then the left column; the tool card goes below the stage and the
// picker takes the window width. Nothing of it while arranging (every block shows in the flow); no colour literal here
var LAYOUT=[
 'main:has(>section[data-id="mapviz"]:not([hidden])){max-width:none}',
 '.mvstage [data-blk="mv.canvas"]>canvas{height:60vh;min-height:320px}',
 'body:not(.arranging) .mvtop.blc{display:flex;flex-direction:column;flex-wrap:nowrap;gap:6px;height:calc(100vh - var(--mvy,calc(var(--hdh,34px) + 4px)) - 8px);min-height:420px;isolation:isolate}',
 // isolation: the page's own layers (the tool row, the map list, the cards) stack inside the page, so the window header
 // (sticky, z-index 5) always goes over them when the page scrolls
 'body:not(.arranging) .mvtop>.blk{flex:0 0 auto;max-width:none}',
 'body:not(.arranging) .mvtop>.mvmain.blc{flex:1 1 auto;min-height:320px}',
 'body:not(.arranging) .mvtop:fullscreen{height:100vh;background:var(--bg);padding:8px}',
 'body:not(.arranging) .mvtop.mvfull{position:fixed;inset:0;z-index:40;height:auto;margin:0;padding:8px;background:var(--bg)}',
 // the head row
 // the head row and the toolbar share one row while the width allows (one row at 1600 px): the page title is for screen
 // readers only (the GUI's own tab names the page), the lead words of side and unit kind too (each button names itself,
 // the group carries the word as its name and title), the head buttons are a little narrower and the gaps smaller
 'body:not(.arranging) .mvhead.blc{gap:4px 8px;position:relative;z-index:6}',
 'body:not(.arranging) .mvhead h2{font-size:1.15em;margin:0}',
 'body:not(.arranging) .mvhead>.mvtitle,body:not(.arranging) .mvhead .mvsegf>.hint{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}',
 'body:not(.arranging) .mvhead .mvseg>button,body:not(.arranging) .mvbar button{padding:3px 7px}',
 'body:not(.arranging) .mvhead .mvbar{gap:4px;margin:0}',
 'body:not(.arranging) .mvhead .blk.fld>label.f{display:flex;gap:4px;margin:0;align-items:center}',
 'body:not(.arranging) .mvhead .blk.fld>label.f>span:empty{display:none}',
 'body:not(.arranging) .mvhead .blk.row{margin:0}',
 '.mvseg{display:inline-flex;flex-wrap:wrap;align-items:center}',
 '.mvseg>button{margin:0 -1px 0 0;border-radius:0}',
 '.mvseg>button:first-child{border-radius:4px 0 0 4px}.mvseg>button:last-child{border-radius:0 4px 4px 0}',
 '.mvseg>button[aria-pressed="true"],.mvbar button[aria-pressed="true"],.mvtablist>[aria-selected="true"]{background:var(--sel);border-color:var(--acc)}',
 '.mvpickbtn{min-width:10em;max-width:16em;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
 // the map picker popover
 'body:not(.arranging) .mvpickbox.blc{position:relative;gap:0}',
 'body:not(.arranging) .mvpick.blc{position:absolute;top:calc(100% + 4px);left:0;width:420px;max-width:calc(100vw - 32px);max-height:70vh;overflow:auto;overscroll-behavior:contain;z-index:20;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px;box-shadow:0 6px 24px var(--shadow)}',
 'body:not(.arranging) .mvpick[hidden],body:not(.arranging) .mvtabp[hidden],body:not(.arranging) .mvcard[hidden],body:not(.arranging) .mvfirst[hidden]{display:none}',
 // the main row: left column, stage, right column. The left column's fold button is the toolbar's first item, so a folded
 // left column takes no width; a folded right column keeps 34 px for its fold button (in its tab row)
 'body:not(.arranging) .mvmain.blc{display:grid;grid-template-columns:var(--mvl,minmax(220px,250px)) minmax(0,1fr) var(--mvr,minmax(340px,370px));grid-template-rows:minmax(0,1fr);grid-auto-rows:auto;align-items:stretch;gap:10px;min-height:320px}',
 'body:not(.arranging) .mvmain.mvnoleft{--mvl:0px}',
 'body:not(.arranging) .mvmain.mvnoright{--mvr:34px}',
 'body:not(.arranging) .mvnoleft>.mvleft,body:not(.arranging) .mvnoright>.mvright>.blk:not(.mvcolbar),body:not(.arranging) .mvnoright .mvtablist{display:none}',
 'body:not(.arranging) .mvmain>.blk{min-width:0;max-width:none;min-height:0}',
 'body:not(.arranging) .mvmain>.mvside{overflow:auto;overscroll-behavior:contain;padding-right:4px}',
 // the right column: the tab row stays put and the tab shown scrolls under it; in the Layers tab the filter stays at the
 // top of the scrolling tab (the views and On now scroll: kept fixed too they would take more than 150 px of the column)
 'body:not(.arranging) .mvmain>.mvright{overflow:hidden;display:flex;flex-direction:column;flex-wrap:nowrap;padding-right:0}',
 'body:not(.arranging) .mvright>.mvcolbar{flex:0 0 auto;background:var(--bg)}',
 'body:not(.arranging) .mvright>.mvtabp{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding-right:4px}',
 'body:not(.arranging) .mvright>.mvtabp>[data-blk="mv.filter"]{position:sticky;top:0;z-index:3;background:var(--bg);margin-top:0;padding:0 0 4px}',
 'body:not(.arranging) .mvmain>.mvleft{grid-column:1;grid-row:1}',
 'body:not(.arranging) .mvmain>.mvstage{grid-column:2;grid-row:1;display:flex;flex-direction:column;flex-wrap:nowrap;gap:4px;overflow:hidden;position:relative}',
 'body:not(.arranging) .mvmain>.mvright{grid-column:3;grid-row:1}',
 'body:not(.arranging) .mvstage>[data-blk="mv.canvas"]{flex:1 1 auto;min-height:0}',
 'body:not(.arranging) .mvstage>[data-blk="mv.canvas"]>canvas{height:100%;min-height:0}',
 'body:not(.arranging) .mvstage>.blk:not([data-blk="mv.canvas"]){flex:0 0 auto}',
 '.mvcolbar{display:flex;align-items:center;gap:4px;flex-wrap:wrap}',
 '.mvcolfold{padding:0 .5em;min-width:1.9em}',
 '.mvtablist{display:flex;flex-wrap:wrap;gap:2px;flex:1 1 auto}',
 '.mvtablist>button{flex:1 1 auto;margin:0}',
 '.mvdot{color:var(--acc)}',
 // on the stage: the tool card, the first-time hint, the screen reader readout, the cursor strip, the job progress
 // the tool card: at most 45 % of the stage high (the box of the cards ends 55 % above the stage bottom), scrolling inside.
 // A panel that starts with its own heading keeps it, and the card shows only its close button, at its top right (mvown)
 'body:not(.arranging) .mvstage>.mvcards.blc{position:absolute;top:8px;left:8px;bottom:calc(55% - 8px);z-index:4;width:340px;max-width:calc(100% - 16px);gap:6px;pointer-events:none}',
 'body:not(.arranging) .mvcards>.mvcard.blc{position:relative;pointer-events:auto;max-height:100%;overflow:auto;overscroll-behavior:contain;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:6px 8px;box-shadow:0 4px 16px var(--shadow)}',
 'body:not(.arranging) .mvcards>.mvcard.mvown{padding-right:2.4em}',
 'body:not(.arranging) .mvcards>.mvcard.mvown>.mvcardhead{position:absolute;top:4px;right:6px;margin:0;z-index:1}',
 '.mvcardhead{justify-content:space-between}',
 'body:not(.arranging) .mvstage>.mvfirst{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3;width:min(30em,90%);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 16px;box-shadow:0 4px 16px var(--shadow)}',
 '.mvfirst ol{margin:6px 0 0;padding-left:1.4em}.mvfirst h3{margin:0}',
 'body:not(.arranging) .mvstage>.mvsr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}',
 '.mvstrip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.35em;font-variant-numeric:tabular-nums}',
 '.mvprog{width:8em;height:6px;vertical-align:middle;margin:0 6px}',
 // the Layers tab: the filter, the mark key, the views, On now (each visible layer with its group's opacity and its legend),
 // then the groups (a head: tick, fold button with the on/total count, opacity; its rows on one line each). The help text of a
 // row or a group head shows under it while a control in it has the keyboard focus (the mouse has the title); the words of
 // the marks are for screen readers only (mvvh)
 '.mvvh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}',
 '.mvgrp>.blk,.mvon>.blk{display:flex;flex-wrap:wrap;align-items:center;gap:2px 6px}',
 '.mvgrp .mvfold{background:none;border:0;padding:2px 0;font:inherit;color:inherit;cursor:pointer;text-align:left;flex:1 1 auto}',
 // the help text floats over the rows below (never pushes them: a tick must not move the list under the pointer) and shows
 // for the keyboard only (:focus-visible); the mouse has the same words as the label's title
 '.mvgrp>.blk{position:relative}',
 '.mvtip{display:none;position:absolute;left:1.6em;right:4px;top:100%;z-index:5;margin:0;padding:4px 6px;white-space:normal;background:var(--card);color:var(--fg);border:1px solid var(--btnl);border-radius:4px;box-shadow:0 4px 14px var(--shadow)}',
 '.mvgrp>.blk:has(:focus-visible)>.mvtip{display:block}',
 '.mvgrp [data-layer],.mvon [data-on]{padding-left:1.2em}',
 '.mvmark{font-size:.8em;opacity:.75;cursor:help}',
 '.mvmk{padding:0 .5em;margin:0;font-size:.9em}',
 '.mvleg{flex:1 0 100%;margin:0 0 4px 1.6em;font-size:.9em}',
 '.mvviews{display:flex;flex-wrap:wrap;align-items:center;gap:4px}.mvviews>button{margin:0}',
 '.mvonhead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px}.mvonhead h3{margin:0}',
 '@media (max-width:900px){',
 ' body:not(.arranging) .mvtop.blc{height:auto;min-height:0}',
 ' body:not(.arranging) .mvmain.blc{grid-template-columns:minmax(0,1fr);grid-template-rows:auto;height:auto}',
 ' body:not(.arranging) .mvmain>.mvstage{grid-column:1;grid-row:1;height:auto;overflow:visible}',
 ' body:not(.arranging) .mvstage>[data-blk="mv.canvas"]{flex:0 0 auto;height:calc(100vh - var(--hdh,34px) - 120px);min-height:320px}',
 ' body:not(.arranging) .mvstage>.mvcards.blc{position:static;order:10;width:auto;max-width:none;pointer-events:auto}',
 ' body:not(.arranging) .mvcards>.mvcard.blc{max-height:none}',
 ' body:not(.arranging) .mvpick.blc{position:fixed;top:auto;left:8px;right:8px;width:auto;max-width:none}',
 ' body:not(.arranging) .mvmain>.mvright{grid-column:1;grid-row:2}',
 ' body:not(.arranging) .mvmain>.mvleft{grid-column:1;grid-row:3}',
 ' body:not(.arranging) .mvmain>.mvside{overflow:visible;padding-right:0}',
 ' body:not(.arranging) .mvright>.mvtabp{overflow:visible;padding-right:0}',
 ' body:not(.arranging) .mvright>.mvtabp>[data-blk="mv.filter"]{position:static}}'
].join('\n');
// words for ids the window shows (keys mapviz.shell.what.<job>, .stage.<stage>, .item.<kind>, .fault.<code>). Stages: only
// the names in STAGES have a word; any other stage a part emits shows the plain 'working' word (.stage.other)
var WHATS=['maps','doc','grids','terrain','topo','water','pass','entcat','l0','l1','c0',
 'sight','view','cover','obstacles','travel','routes','strong','checks','l2','pack','l3','l4','staff','painted','recon','sketch'];
// waves C and D add the stages of the rules parts (sight, cover, pass, strong) and of previews (plan to commit; previews
// runs are no page jobs, the export part words them itself, but a word here keeps every stage name worded once)
var STAGES=['wait','read','write','tiles','draw','build','place','masks','defs','picture',
 'solids','grid','fire','view','edges','probes','lip','conceal','obstacles','travel','routes','frame','candidates','factors','refine',
 'classify','ensemble','fair','checks','plan','compose','encode','commit','catalog','pack','textures','other'];
var ITEMS=['spawn','flag','contourLabel','waterLabel','check','other'];
var FAULTS=['palette','size','draw','kind'];
function word(k,fb){var s=tx(k);return s===k?fb:s}
function whatText(w){return w?word('mapviz.shell.what.'+w,String(w)):''}
function stageText(s){return s?(STAGES.indexOf(String(s))>=0?word('mapviz.shell.stage.'+s,tx('mapviz.shell.stage.other')):tx('mapviz.shell.stage.other')):''}
function itemText(k){return word('mapviz.shell.item.'+k,tx('mapviz.shell.item.other'))}
function faultText(c){return word('mapviz.shell.fault.'+c,tx('mapviz.shell.fault.draw'))}

// ---- pure helpers (tested alone) ----
function toScreen(v,w,hh,x,y){return [w/2+(x-v.cx)*v.zoom,hh/2-(y-v.cy)*v.zoom]}
function toWorld(v,w,hh,px,py){return [v.cx+(px-w/2)/v.zoom,v.cy-(py-hh/2)/v.zoom]}
function clampZ(z){return z<ZMIN?ZMIN:z>ZMAX?ZMAX:z}
function zoomAt(v,w,hh,px,py,f){var p=toWorld(v,w,hh,px,py),z=clampZ(v.zoom*f);return {cx:p[0]-(px-w/2)/z,cy:p[1]+(py-hh/2)/z,zoom:z}}
function fitBox(b,w,hh){if(!b||b.length!==4||!(b[2]>b[0])||!(b[3]>b[1]))return null;return {cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2,zoom:clampZ(Math.min(w/(b[2]-b[0]),hh/(b[3]-b[1]))*0.95)}}
function pickZ(hd,zoom){if(!(zoom>0)||!(hd.cell>0))return 0;var z=Math.floor(Math.log(1/(hd.cell*zoom))/Math.LN2);if(!(z>0))z=0;if(z>hd.zmax)z=hd.zmax;return z}
// tile x.y of level z: world left x, top y and side length (README 5.2: north-west anchor, level row 0 = min y)
function tileRect(hd,z,tx,ty){var f=Math.pow(2,z),cz=hd.cell*f,hz=Math.ceil(hd.h/f);return {x:hd.ox+tx*TILE*cz,y:hd.oy+(hz-ty*TILE)*cz,s:TILE*cz}}
function tileList(hd,z,v,w,hh){var f=Math.pow(2,z),cz=hd.cell*f,wz=Math.ceil(hd.w/f),hz=Math.ceil(hd.h/f),s=TILE*cz,top=hd.oy+hz*cz;
 var nx=Math.ceil(wz/TILE),ny=Math.ceil(hz/TILE),a=toWorld(v,w,hh,0,hh),b=toWorld(v,w,hh,w,0),out=[];
 var x0=Math.max(0,Math.floor((a[0]-hd.ox)/s)),x1=Math.min(nx-1,Math.floor((b[0]-hd.ox)/s)),y0=Math.max(0,Math.floor((top-b[1])/s)),y1=Math.min(ny-1,Math.floor((top-a[1])/s));
 for(var ty=y0;ty<=y1;ty++)for(var tx=x0;tx<=x1;tx++)out.push(tx+'.'+ty);return out}
// tileBox(hd, z, tx, ty, view, w, h) -> [x, y, w, h]: the tile's screen rectangle snapped to whole pixels by its edges.
// The left edge of tile tx and the right edge of tile tx - 1 come from the same world x (tileRect of the same index), so
// both round to the same pixel: neighbours share an edge with no gap and no overlap at any zoom or pan
function tileBox(hd,z,tx,ty,v,w,hh){var a=tileRect(hd,z,tx,ty),b=tileRect(hd,z,tx+1,ty+1),p=toScreen(v,w,hh,a.x,a.y),q=toScreen(v,w,hh,b.x,b.y),
 x0=Math.round(p[0]),y0=Math.round(p[1]);return [x0,y0,Math.round(q[0])-x0,Math.round(q[1])-y0]}
// permalink: page:mapviz/<target>~<map key>~<mode>~<layers>~<x,y,zoom> (never a mod path). The short deep link of other
// pages, page:mapviz/<target>~<map key>~<mode>, opens the map and mode and keeps the layer ticks (layers null) and fits
// the map (view null)
function num(n){var r=Math.round(n*1000)/1000;return String(r)}
function linkOf(o){var v=o.view||{cx:0,cy:0,zoom:1};return 'page:mapviz/'+o.target+'~'+(o.map||'')+'~'+(o.mode||'')+'~'+(o.layers||[]).join(',')+'~'+num(v.cx)+','+num(v.cy)+','+(Math.round(v.zoom*1e6)/1e6)}
function parseLink(s){s=String(s||'');if(s.indexOf('page:mapviz/')===0)s=s.slice(12);var p=s.split('~');if(p.length===3)p=p.concat([null,'']);if(p.length!==5||!TARGETS[p[0]])return null;
 if(p[1]&&(!/^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/.test(p[1])||/^map\//.test(p[1])||/(^|\/)\.\.?(\/|$)/.test(p[1])))return null;
 if(p[2]&&!/^[A-Za-z0-9_.-]+$/.test(p[2]))return null;
 var ls=p[3]===null?null:p[3]?p[3].split(','):[];for(var i=0;ls&&i<ls.length;i++)if(!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(ls[i]))return null;
 var v=null;if(p[4]){var n=p[4].split(',').map(Number);if(n.length!==3||!isFinite(n[0])||!isFinite(n[1])||!(n[2]>0))return null;v={cx:n[0],cy:n[1],zoom:clampZ(n[2])}}
 return {target:p[0],map:p[1]||null,mode:p[2]||null,layers:ls,view:v}}
// shareable(layers, include, groups?, tools?): the visible layers (own tick on and, when groups is given, the group tick on);
// the PRIVATE groups (strong, danger, the two factor groups, fairness) only with include; a tool layer (l.tool: measure, profile) only with tools, never in a link
function shareable(layers,include,groups,tools){var out=[];for(var i=0;i<layers.length;i++){var l=layers[i];if(!l.on)continue;if(groups&&groups[l.group]&&!groups[l.group].on)continue;if(PRIVATE[l.group]&&!include)continue;if(l.tool&&!tools)continue;out.push(l.id)}return out}
// phasesOf(doc, mode) -> the frontline phases the mode holds (spawns, flags, points, clipsBySide), ascending; every mode's
// when mode is null. The page phase select shows when there are two or more
function phasesOf(doc,mode){var out=[];if(!doc||!Array.isArray(doc.modes))return out;
 doc.modes.forEach(function(m){if(!m||(mode&&m.id!==mode))return;['spawns','flags','points','clipsBySide'].forEach(function(k){(Array.isArray(m[k])?m[k]:[]).forEach(function(it){var p=it&&it.phase;
  if(typeof p==='number'&&Math.floor(p)===p&&p>=0&&out.indexOf(p)<0)out.push(p)})})});return out.sort(function(a,b){return a-b})}
// tagHit(hit, layer): a click hit carries the id of the part that added the layer (part) and the layer id (layer), so a
// part acts only on its own hits (page-pg3 N9); a value the part set itself is kept
function tagHit(r,l){if(Array.isArray(r)){r.forEach(function(x){tagHit(x,l)});return}if(r&&typeof r==='object'){if(r.part==null)r.part=l.part||null;if(r.layer==null)r.layer=l.id}}
// placeOf(panel, isTool) -> where V.addPanel puts it: 'card' (its id is a tool id: docked on the stage while the tool is in
// use), 'picker' (the map list), a tab of TABS (its own tab option, else TABOF for a right or bottom panel), 'left', 'bottom'
// (a bottom panel no table names) or 'inspect' (a right panel no table names); null for no panel
function placeOf(o,isTool){if(!o||!o.id)return null;if(isTool)return 'card';if(o.id==='list')return 'picker';if(TABS.indexOf(o.tab)>=0)return o.tab;
 if(o.side==='right'||o.side==='bottom'){if(Object.prototype.hasOwnProperty.call(TABOF,o.id))return TABOF[o.id];return o.side==='right'?'inspect':'bottom'}return 'left'}
// scaleBar(zoom, upm, maxPx) -> {m, px}: the longest round length (1, 2 or 5 times a power of ten metres: ... 0.5, 1, 2, 5,
// 10, 20, 50, 100 ...) whose bar is at most maxPx screen pixels at zoom (pixels per world unit) and upm (world units per
// metre); null when the view has no scale
function scaleBar(zoom,upm,maxPx){var ppm=zoom*upm;if(!(ppm>0)||!isFinite(ppm)||!(maxPx>0))return null;var t=maxPx/ppm,p=Math.pow(10,Math.floor(Math.log(t)/Math.LN10+1e-9)),m=p;
 if(5*p<=t)m=5*p;else if(2*p<=t)m=2*p;if(m>t*1.000001)m=p/2;m=Number(m.toPrecision(6));return {m:m,px:m*ppm}}
// stripText(pos, rows, max) -> the cursor strip line: the position words, then the first max rows ([label, value], label words
// already) as "label: value", joined on one line (the strip cuts what does not fit with an ellipsis)
function stripText(pos,rows,max){var out=[pos];(rows||[]).slice(0,max>0?max:STRIPMAX).forEach(function(r){if(!r)return;var v=r[1]==null?'':String(r[1]);out.push(r[0]?r[0]+': '+v:v)});
 return out.filter(function(s){return s!==''&&s!=null}).join('  \u00B7  ')}
// typing(e): the key came while typing in an input, select, textarea or editable text: the page's own keys stay off
function typing(e){var t=e&&e.target;if(!t||!t.tagName||/^(BODY|HTML|#document)$/i.test(t.tagName)){try{t=typeof document!=='undefined'&&document?document.activeElement:null}catch(x){t=null}}
 if(!t)return false;var g=String(t.tagName||'').toUpperCase();return g==='INPUT'||g==='SELECT'||g==='TEXTAREA'||!!t.isContentEditable}
// offBox(box, x, y): the point lies outside the world box [x0, y0, x1, y1] (no box: never off)
function offBox(b,x,y){return !!(b&&b.length===4&&(x<b[0]||x>b[2]||y<b[1]||y>b[3]))}
var B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',B64R=null;
function b64(s){if(!B64R){B64R={};for(var i=0;i<64;i++)B64R[B64.charAt(i)]=i}s=String(s||'').replace(/[^A-Za-z0-9+\/]/g,'');
 var n=Math.floor(s.length*3/4),out=new Uint8Array(n),o=0,acc=0,bits=0;
 for(var k=0;k<s.length;k++){acc=(acc<<6)|B64R[s.charAt(k)];bits+=6;if(bits>=8){bits-=8;if(o<n)out[o++]=(acc>>bits)&255}}return o===n?out:out.subarray(0,o)}
var ES={u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,f32:4,rgba8:4};
// decode(env) -> {w, h, vals} of a grid envelope (README 5.1); a wrong size or type throws an Error with code kind or size
function dErr(m,c){return Object.assign(new Error(m),{code:c})}
function decode(env){if(!env||env.kind!=='grid')throw dErr('not a grid envelope','kind');var es=ES[env.etype];if(!es)throw dErr('unknown etype '+env.etype,'kind');
 var w=env.w,hh=env.h;if(!(w>0)||!(hh>0)||Math.floor(w)!==w||Math.floor(hh)!==hh)throw dErr('bad size '+w+' x '+hh,'size');
 var by=b64(env.data);if(by.length!==w*hh*es)throw dErr('data is '+by.length+' bytes, '+w+' x '+hh+' '+env.etype+' needs '+(w*hh*es),'size');
 if(env.etype==='rgba8')return {w:w,h:hh,rgba:by};
 var dv=new DataView(by.buffer,by.byteOffset,by.byteLength),n=w*hh,vals=new Float64Array(n),sc=typeof env.scale==='number'?env.scale:1,of=typeof env.offset==='number'?env.offset:0,nd=env.nodata,i,r;
 for(i=0;i<n;i++){switch(env.etype){case 'u8':r=dv.getUint8(i);break;case 'i8':r=dv.getInt8(i);break;case 'u16':r=dv.getUint16(i*2,true);break;case 'i16':r=dv.getInt16(i*2,true);break;
  case 'u32':r=dv.getUint32(i*4,true);break;case 'i32':r=dv.getInt32(i*4,true);break;default:r=dv.getFloat32(i*4,true)}
  vals[i]=(nd!=null&&r===nd)||r!==r?NaN:r*sc+of}
 return {w:w,h:hh,vals:vals,raw:dv}}
function colour(hx){var m=/^.([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(hx||''));if(!m||String(hx).charAt(0)!=='\x23')return null;var v=parseInt(m[1],16);return [(v>>16)&255,(v>>8)&255,v&255,m[2]?parseInt(m[2],16):255]}
function colourCss(hx){var c=colour(hx);return c?'rgba'+'('+c[0]+','+c[1]+','+c[2]+','+(Math.round(c[3]/255*1000)/1000)+')':''}
function palFn(env,opts,dec){var p=env.palette,i;if(opts&&typeof opts.colour==='function')return opts.colour;
 if(Array.isArray(p)){var by={};for(i=0;i<p.length;i++){var e=p[i],hx=typeof e==='string'?e:e&&e.fill,code=e&&typeof e==='object'&&typeof e.code==='number'?e.code:i;by[code]=colour(hx)}return function(v){return by[v]||null}}
 if(p&&Array.isArray(p.stops)&&dec.vals){var lo=Infinity,hi=-Infinity;for(i=0;i<dec.vals.length;i++){var x=dec.vals[i];if(x===x){if(x<lo)lo=x;if(x>hi)hi=x}}
  var st=p.stops.map(function(s){return {at:s.at,c:colour(s.color)}}).filter(function(s){return s.c});if(!st.length)return null;
  return function(v){var t=hi>lo?(v-lo)/(hi-lo):0,k;for(k=1;k<st.length;k++)if(t<=st[k].at)break;if(k>=st.length)return st[st.length-1].c;var a=st[k-1],b=st[k],u=b.at>a.at?(t-a.at)/(b.at-a.at):0;
   return [Math.round(a.c[0]+(b.c[0]-a.c[0])*u),Math.round(a.c[1]+(b.c[1]-a.c[1])*u),Math.round(a.c[2]+(b.c[2]-a.c[2])*u),Math.round(a.c[3]+(b.c[3]-a.c[3])*u)]}}
 return null}
// gridImage(env) -> {cv, rect} or {err: code}: an off-screen picture of the grid, row 0 = min y at the bottom;
// codes kind, size (decode), draw (no off-screen canvas), palette (no colours); the page words them with .fault.<code>
function gridImage(env,opts){var dec;try{dec=decode(env)}catch(e){return {err:e.code||'size',msg:e.message}}
 var cv=typeof document!=='undefined'&&document.createElement?document.createElement('canvas'):null,c2=cv&&cv.getContext?cv.getContext('2d'):null;if(!c2||!c2.createImageData)return {err:'draw'};
 cv.width=dec.w;cv.height=dec.h;var img=c2.createImageData(dec.w,dec.h),d=img.data,fn=dec.rgba?null:palFn(env,opts,dec),i,j;
 if(!dec.rgba&&!fn)return {err:'palette'};
 for(j=0;j<dec.h;j++)for(i=0;i<dec.w;i++){var s=j*dec.w+i,o=((dec.h-1-j)*dec.w+i)*4,c;
  if(dec.rgba){d[o]=dec.rgba[s*4];d[o+1]=dec.rgba[s*4+1];d[o+2]=dec.rgba[s*4+2];d[o+3]=dec.rgba[s*4+3];continue}
  var v=dec.vals[s];c=v===v?fn(v):null;if(c){d[o]=c[0];d[o+1]=c[1];d[o+2]=c[2];d[o+3]=c[3]}}
 c2.putImageData(img,0,0);return {cv:cv,rect:[env.ox,env.oy,env.ox+env.w*env.cell,env.oy+env.h*env.cell]}}
function gridDraw(ctx,view,env,opts){if(!env._img)env._img=gridImage(env,opts);var g=env._img;if(g.err||!ctx.drawImage)return g.err||'nodraw';
 var p=view.toScreen(g.rect[0],g.rect[3]),q=view.toScreen(g.rect[2],g.rect[1]);if('imageSmoothingEnabled' in ctx)ctx.imageSmoothingEnabled=false;ctx.drawImage(g.cv,p[0],p[1],q[0]-p[0],q[1]-p[1]);return null}
function sideOf(pal,team){var s=pal&&(pal.sides||pal);return s&&(s[team]||s.neutral)||null}
function vectorDraw(ctx,view,env,opts){var items=env.items||[],pal=(opts&&opts.pal)||{},mk=pal.marks||{},i;if(!ctx.beginPath)return 'nodraw';
 var sides=env.pal==='sides'?{sides:env.palette}:pal;
 for(i=0;i<items.length;i++){var it=items[i],p;
  if(it.kind==='box'&&it.b){p=view.toScreen(it.b[0],it.b[3]);var q=view.toScreen(it.b[2],it.b[1]);ctx.strokeStyle=colourCss(mk.scaleBar)||view.token('line');ctx.lineWidth=it.box==='world'?2:1;
   if(ctx.setLineDash)ctx.setLineDash(it.box==='world'?[]:[6,4]);ctx.strokeRect(p[0],p[1],q[0]-p[0],q[1]-p[1]);if(ctx.setLineDash)ctx.setLineDash([]);continue}
  if(typeof it.x!=='number'||typeof it.y!=='number')continue;p=view.toScreen(it.x,it.y);var sd=sideOf(sides,it.team);
  // flag zone: circle {rA, rB} as an ellipse, poly {pts} (absolute world u, GoH) as its polygon (README 3, 5.3)
  if(it.kind==='flag'){var z=it.zone||{};ctx.beginPath();
   if(z.kind==='poly'&&Array.isArray(z.pts)&&z.pts.length>=3){for(var k=0;k<z.pts.length;k++){var q2=view.toScreen(z.pts[k][0],z.pts[k][1]);if(k)ctx.lineTo(q2[0],q2[1]);else ctx.moveTo(q2[0],q2[1])}if(ctx.closePath)ctx.closePath()}
   else{var rA=(z.rA||0)*view.zoom,rB=(z.rB||z.rA||0)*view.zoom;if(ctx.ellipse)ctx.ellipse(p[0],p[1],Math.max(rA,1),Math.max(rB,1),0,0,Math.PI*2);else ctx.arc(p[0],p[1],Math.max(rA,1),0,Math.PI*2)}
   if(sd){ctx.fillStyle=colourCss(sd.wash);ctx.fill()}ctx.strokeStyle=colourCss(mk.flagRing)||view.token('fg');ctx.lineWidth=mk.flagRingWidth||2;ctx.stroke();continue}
  ctx.beginPath();ctx.arc(p[0],p[1],5,0,Math.PI*2);ctx.fillStyle=colourCss(sd&&sd.fill)||view.token('acc');ctx.fill();
  // spawn facing: yaw in degrees counter-clockwise from +x in the world (README 5.3); screen y grows down, so it is negated
  if(it.kind==='spawn'&&typeof it.yaw==='number'){var a=it.yaw*Math.PI/180;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]+Math.cos(a)*12,p[1]-Math.sin(a)*12);ctx.strokeStyle=colourCss(mk.spawnArrow)||view.token('fg');ctx.lineWidth=2;ctx.stroke()}}
 return null}
// game names for the permalink note (a link opens only in the game it names)
var GAMEN={as64:'mapviz.shell.gameName.as64',mowas2:'mapviz.shell.gameName.mowas2',goh:'mapviz.shell.gameName.goh'};
function lbl(x){if(x==null)return '';x=String(x);return /^mapviz\.[a-z]/.test(x)?tx(x):x}
function errKey(e){return e&&e.key&&/^mapviz\.err\./.test(e.key)?e.key:'mapviz.err.MV_FAULT'}
function errText(e){if(!e)return '';if(e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e.text||e.message||e)}
function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}

var MV=EXT_SCREENS.mapviz=function(root){
 var st={target:null,map:null,mode:null,phase:null,side:'both',kind:'inf',view:{cx:0,cy:0,zoom:1},include:false,cursor:null,tool:null,canvas:false,w:800,h:560,
  ctx:null,skipKey:null,pend:null,user:false,cacheSig:null,due:false,tab:'layers',pick:false,foldL:false,foldR:false,full:false,fs:false,off:true},
  ev={},layers=[],tools=[],hovers=[],panels=[],hdrs={},tiles={},jobs={},jmeta={},ended={},pollP={},held=[],drag=null,frame=false,docSeq=0,gen=0,
  reduced=false,docBusy=false,curPart=null;
 try{reduced=!!(typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){}
 function pageTarget(){var g=S&&S.gameId;return TARGETS[g]?g:null}
 // the page's game, game folder and mod: when any of them changes the open map is closed (W2)
 function ctxNow(){var g=pageTarget();return [g||'',g==='goh'?(typeof gohDir==='function'?(gohDir()||''):''):(S&&S.gameOv||''),S&&S.mod||''].join('|')}
 // quiet(): the page is hidden. While hidden the page reads nothing and draws nothing: a read a part asks for waits
 // (held) until the page is shown; it is dropped (rejected, 'stale') when the context or the open map changed meanwhile.
 // A shown page is never quiet: when its game, folder or mod changed and no refresh took it in yet (st.ctx is the context
 // the open map belongs to), the first thing that looks (a pick, a read, a draw, a user action) takes the new context in
 // at once, as refresh() does (catchUp), and then goes on
 function quiet(){if(hiddenNow())return true;catchUp();return false}
 var catching=false;
 function catchUp(){if(catching||RMT||st.ctx===null||st.ctx===ctxNow())return false;catching=true;try{refresh()}finally{catching=false}return true}
 // settle(): before a user action on a shown page: take a changed context in first (no-op while hidden); true when it did
 function settle(){return !hiddenNow()&&catchUp()}
 function own(){return !!st.target&&st.target===pageTarget()}
 function gameOf(){if(!own())return null;if(st.target==='goh')return typeof gohDir==='function'?(gohDir()||null):null;return (S&&S.gameOv)||null}
 function modOf(){return own()&&S&&S.mod?String(S.mod):null}
 function rmtErr(){return Object.assign(new Error('MV_REFUSED'),{key:'mapviz.err.MV_REFUSED',params:{msg:tx('mapviz.shell.rmt')}})}
 // ---- V ----
 var V={doc:null,pal:null,view:st.view,
  q:function(n){switch(n){case 'target':return st.target;case 'map':return st.map;case 'mode':return st.mode;case 'side':return st.side;case 'kind':return st.kind;
   case 'game':return gameOf();case 'layers':return shareable(layers,st.include,GRP);case 'allLayers':return shareable(layers,true,GRP);case 'include':return st.include;
   case 'rmt':return !!RMT;case 'canvas':return st.canvas;case 'size':return [st.w,st.h];case 'modes':return V.doc&&V.doc.modes?V.doc.modes.map(function(m){return m.id}):[];
   case 'cursor':return st.cursor?[st.cursor[0],st.cursor[1]]:null;case 'reduced':return reduced;case 'mod':return modOf();case 'docBusy':return docBusy;
   case 'jobs':return Object.keys(jobs).map(jobInfo);case 'phase':return st.phase;case 'phases':return phasesOf(V.doc,st.mode);
   case 'tool':return st.tool?st.tool.id:null;case 'tab':return st.tab;case 'picker':return !!st.pick}return null},
  tab:function(t){if(TABS.indexOf(t)<0)return false;setTab(t,false);return true},
  go:function(o){return go(o)},
  api:function(method,p,body,opt){return vapi(method,p,body,opt)},
  job:function(what,args){return vjob(what,args)},
  on:function(e,fn){if(typeof fn==='function')(ev[e]=ev[e]||[]).push(fn);return function(){ev[e]=(ev[e]||[]).filter(function(x){return x!==fn})}},
  emit:function(e,d){emit(e,d)},
  addLayer:function(o){return addLayer(o)},
  addTool:function(o){if(!o||!o.id||tools.some(function(t){return t.id===o.id}))return false;tools.push(o);
   layers.forEach(function(l){if(l.id===o.id&&!l.tool){l.tool=true;if(PENDL)l.on=l.def;drawGroups()}});if(PBOX&&PBOX[o.id])cardFor(o.id);drawTools();drawLink();return true},
  relist:function(){drawItems()},
  addHover:function(fn,o){if(typeof fn==='function')hovers.push({fn:fn,quiet:!!(o&&o.quiet)})},
  addPanel:function(o){return addPanel(o)},
  toWorld:function(px,py){return toWorld(st.view,st.w,st.h,px,py)},
  toScreen:function(x,y){return toScreen(st.view,st.w,st.h,x,y)},
  redraw:function(){redraw()},
  token:function(n){return typeof cssv==='function'?cssv('--'+String(n).replace(/^--/,''),''):''},
  say:function(k,a){say(k,a)}};
 // a map pick request {key, mode?, pick: true} is the shell's own: it sets the map and the listeners get the shell's form.
 // A pick that takes a change of game, folder or mod in (settle) came from the list of the old context: it is dropped (no
 // map set, no document read, no job) and the page says the closed-map line; the refresh inside settle has asked the map
 // list of the new context, and a pick made from that list opens
 function emit(e,d){if(e==='map'&&d&&d.pick){if(d.key){if(settle()){say('mapviz.shell.closed');return}setMap(d.key,d.mode,true,false)}return}
  (ev[e]||[]).slice().forEach(function(fn){try{fn(d)}catch(x){say('mapviz.shell.partFault',{part:e,msg:x&&x.message||String(x)})}})}
 function setView(v,quiet){settle();st.view.cx=v.cx;st.view.cy=v.cy;st.view.zoom=clampZ(v.zoom);V.view=st.view;redraw();if(!quiet)emit('view',{cx:st.view.cx,cy:st.view.cy,zoom:st.view.zoom});drawLink()}
 function qs(o){var a=[];Object.keys(o).forEach(function(k){var v=o[k];if(v==null||v==='')return;(Array.isArray(v)?v:[v]).forEach(function(x){a.push(encodeURIComponent(k)+'='+encodeURIComponent(String(x)))})});return a.length?'?'+a.join('&'):''}
 function commons(){return {target:st.target,game:gameOf(),mods:null,modDir:modOf(),map:st.map,mode:st.mode,side:st.side,kind:st.kind}}
 function staleErr(){return Object.assign(new Error('MV_CANCELLED'),{key:'mapviz.err.MV_CANCELLED',stale:true,params:{msg:tx('mapviz.shell.closed')}})}
 // release(): the page is shown and its context settled: every held read goes now, or is dropped when its map is gone
 function release(){var hs=held;held=[];hs.forEach(function(x){x()})}
 // a read of the open map (doc, layer, hover, tiles) asked in the old context on a shown page whose context changed: the
 // catch-up closes that map, so the read is dropped (rejected, stale) and never sent with no map; any other read goes on
 // in the new context (the map list, the cache line, the palette)
 // the name of a request in the GUI job list (README JOBS): the part's own (opt.what), else by route; most requests here
 // are sent from a timer or after another answer, where the GUI cannot take the name from a clicked button
 var JW={job:'mapviz.shell.w.job',cancel:'mapviz.shell.w.stop','cache/clear':'mapviz.shell.w.clear'};
 function jopt(rt,get,opt){var o={},k;for(k in opt||{})if(Object.prototype.hasOwnProperty.call(opt,k))o[k]=opt[k];
  if(o.job!==false&&!o.what)o.what=tx(JW[rt]||(get?'mapviz.shell.w.read':'mapviz.shell.w.send'));return o}
 function vapi(method,p,body,opt){if(RMT)return Promise.reject(rmtErr());p=String(p||'').replace(/^\/+/,'');var g0=gen,rt0=p.split('?')[0];
  if(rt0!=='cancel'&&quiet()){var hc=st.ctx,hg=gen;return new Promise(function(res,rej){held.push(function(){if(st.ctx!==hc||gen!==hg){rej(staleErr());return}vapi(method,p,body,opt).then(res,rej)})})}
  if(gen!==g0&&QCOM[rt0]===1)return Promise.reject(staleErr());
  var url='/api/x/mapviz/'+p.split('?')[0],o={},k;
  if(method==='GET'){var route=p.split('?')[0],c=QCOM[route],cm=commons();if(c){(c===1?ALLC:c).forEach(function(k){o[k]=cm[k]})}if(PHQ[route]&&st.phase!=null)o.phase=st.phase;
   for(k in body||{})if(Object.prototype.hasOwnProperty.call(body,k))o[k]=body[k];
   if(c&&!o.target)return Promise.reject(Object.assign(new Error('MV_USAGE'),{status:400,key:'mapviz.err.MV_USAGE',params:{msg:tx('mapviz.shell.noTarget')}}));
   return api(url+qs(o),undefined,jopt(route,true,opt))}
  return api(url,body||{},jopt(rt0,false,opt))}
 function vjob(what,args){if(RMT)return Promise.reject(rmtErr());var g0=gen;settle();if(gen!==g0&&what!=='maps')return Promise.reject(staleErr());if(!st.target)return Promise.reject(Object.assign(new Error('MV_USAGE'),{key:'mapviz.err.MV_USAGE',params:{msg:tx('mapviz.shell.noTarget')}}));
  var cm=commons(),b={what:what,target:st.target},k;if(cm.game)b.game=cm.game;if(cm.modDir)b.modDirs=[cm.modDir];
  if(what!=='maps'){if(st.map)b.map=st.map;if(st.mode)b.mode=st.mode;b.side=st.side;b.kind=st.kind;if(st.phase!=null)b.phase=st.phase}
  for(k in args||{})if(Object.prototype.hasOwnProperty.call(args,k)){if(!JOBF[k])return Promise.reject(Object.assign(new Error('MV_USAGE'),{key:'mapviz.err.MV_USAGE',params:{msg:k}}));if(args[k]==null)delete b[k];else b[k]=args[k]}
  // one poll per job id: a request the runner joins to a running job (shared, the same id) gets that job's promise
  return vapi('POST','job',b).then(function(s){var id=s.id;if(pollP[id])return pollP[id];
   jmeta[id]={what:what,target:b.target,map:b.map||null,args:keyArgs(b)};jobs[id]={id:id,what:what,state:s.state,queue:s.queue,stage:'',done:0,total:0};
   drawJobs();emit('job',jobInfo(id));return (pollP[id]=poll(id))})}
 // the job's own key fields as the request body carried them (map, mode, side, kind, size, phase, at, pose, light)
 function keyArgs(b){var o={};KEYF.forEach(function(k){if(b[k]!=null)o[k]=b[k]});return o}
 // jobInfo(id) -> the job as the 'job' event and V.q('jobs') give it (what, target, map and args from the request it was
 // posted with)
 function jobInfo(id){var j=jobs[id]||{},m=jmeta[id]||{},w=j.what||m.what,a={},k;for(k in m.args||{})a[k]=m.args[k];
  return {id:id,what:w,state:j.state||'',stage:j.stage||'',done:j.done||0,total:j.total||0,queue:j.queue||0,
  target:m.target||null,map:m.map||null,args:a,text:jobLine({what:w,state:j.state,queue:j.queue,stage:j.stage,done:j.done,total:j.total})}}
 // a job that ended: told once ('job' with end); an id that ended is never written or told again
 function jobEnd(id,r){if(ended[id])return false;ended[id]=1;var d=jobInfo(id);d.state=r&&r.state||'failed';d.end=true;delete jobs[id];drawJobs();emit('job',d);return true}
 // after a page job ended done the "not made" rows ask again once (recheck); while the page is hidden that waits for the show
 function afterDone(){if(quiet()){st.due=true;return}loadCache(true);recheck()}
 // a poll that gets no answer (a network blip, a server fault) is tried again up to POLLRETRY times, 1 s apart, before
 // the job ends on the page as failed; an answer of the server that refuses the poll (4xx) ends it at once. An answer
 // whose state the page does not know (not queued, running, done, failed, cancelled or timeout) ODDMAX times in a row
 // ends it as failed too, so a poll never loops for ever. Every failed end says the job-failed line before it rejects,
 // so a caller that ignores the rejection still leaves a visible line
 function poll(id){var errs=0,odd=0;return new Promise(function(res,rej){
  function giveUp(e){jobEnd(id,null);say('mapviz.shell.jobFailed',{what:whatText(jmeta[id]&&jmeta[id].what),msg:errText(e)});rej(e)}
  function step(){api('/api/x/mapviz/job'+qs({id:id})).then(function(r){errs=0;r=r||{};if(jmeta[id]&&!r.what)r.what=jmeta[id].what;
    if(ended[id]){res(r);return}
    if(r.state==='done'){jobs[id]=r;if(jobEnd(id,r))afterDone();res(r);return}
    if(r.state==='failed'||r.state==='cancelled'||r.state==='timeout'){jobs[id]=r;jobEnd(id,r);var c=r.error&&r.error.code||(r.state==='cancelled'?'MV_CANCELLED':r.state==='timeout'?'MV_FAULT':'MV_FAULT');
     var e=Object.assign(new Error(c),{key:'mapviz.err.'+c,params:{msg:(r.error&&r.error.msg)||r.state},job:r});say('mapviz.shell.jobFailed',{what:whatText(r.what),msg:errText(e)});rej(e);return}
    if(LIVE[r.state])odd=0;else if(++odd>=ODDMAX){giveUp(Object.assign(new Error('MV_FAULT'),{key:'mapviz.err.MV_FAULT',params:{msg:tx('mapviz.shell.oddState',{state:String(r.state)})},job:r}));return}
    jobs[id]=r;drawJobs();emit('job',jobInfo(id));later(step,500)},function(e){if(ended[id]){rej(e);return}var s=e&&e.status;
    if(!(s>=400&&s<500)&&++errs<=POLLRETRY){later(step,1000);return}giveUp(e)})}
  step()})}
 // fits(job args, need args): every key field the need names has the same value in the job (a pass job for kind inf does
 // not make the pass layer of kind tank); a need with no args fits any job of its what
 function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
   if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
 // a page job of this what (and of the need's key fields) is queued or running for the open map -> its words, else null
 function runText(what,args){var ids=Object.keys(jobs);for(var i=0;i<ids.length;i++){var d=jobInfo(ids[i]);if(d.what===what&&d.target===st.target&&(!d.map||d.map===st.map)&&fits(d.args,args))return d.text}return null}
 // recheck(): after a page job ended done, or when the cache answer changed: every layer row and tile header in the "not
 // made" state asks again once (a row whose own job still runs waits for that job), and the parts are told ('products').
 // While the page is hidden nothing asks: the page asks once when it is shown again
 function recheck(){if(quiet()){st.due=true;return}var any=false;layers.forEach(function(l){var n=l.s.need;if(n&&!l.s.mk&&!runText(n.what,n.args)){l.s.key=null;l.s.need=null;any=true}});
  Object.keys(hdrs).forEach(function(k){var n=hdrs[k].need;if(n&&!runText(n.what,n.args)){delete hdrs[k];any=true}});
  emit('products',{});if(any){drawGroups();redraw()}}
 function later(fn,ms){if(typeof setTimeout==='function')setTimeout(fn,ms);else fn()}
 // ---- layers ----
 function addLayer(o){if(o&&typeof o.id==='string'&&typeof o.group==='string'){var ng=regroup(o.id,o.group);if(ng!==o.group){var c={},k;for(k in o)c[k]=o[k];c.group=ng;o=c}}
  if(!o||typeof o.id!=='string'||!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(o.id)||GROUPS.indexOf(o.group)<0){say('mapviz.shell.badPart',{part:o&&o.id||'?'});return false}
  if(layers.some(function(l){return l.id===o.id}))return false;
  // source: a layer name, or a function source(V.q) -> name | null (page-pg2 S1); query: {field: value} or a function
  // query(V.q) -> that, added to the GET layer fields; why(V.q) -> the key that says why a null source shows nothing
  var l={id:o.id,group:o.group,label:o.label||o.id,legend:o.legend||null,engineTrue:!!o.engineTrue,engineTrueGoh:typeof o.engineTrueGoh==='boolean'?o.engineTrueGoh:null,on:o.defaultOn!==false&&!(o.defaultOn==null&&PRIVATE[o.group]),
   draw:typeof o.draw==='function'?o.draw:null,tiles:typeof o.tiles==='string'?o.tiles:null,hit:typeof o.hit==='function'?o.hit:null,list:typeof o.list==='function'?o.list:null,
   source:typeof o.source==='string'||typeof o.source==='function'?o.source:(typeof o.draw!=='function'&&typeof o.tiles!=='string'?o.id:null),
   query:typeof o.query==='function'||(o.query&&typeof o.query==='object')?o.query:null,why:typeof o.why==='function'?o.why:null,s:{},part:curPart,
   tool:!!o.tool||tools.some(function(t){return t.id===o.id})};
  l.def=l.on;if(PENDL&&!l.tool)l.on=!!PENDL[l.id];
  layers.push(l);drawGroups();redraw();return true}
 var PENDL=null;
 // the key of everything fetched for the open map: the context (game, folder, mod) is in it, so an answer that comes late
 // from an old context never lands under a key of the new one
 function sig(){return [st.ctx||'',st.target,st.map,st.mode,st.side,st.kind,st.phase==null?'':st.phase].join('|')}
 // srcOf(l) -> {name, q}: the layer name to fetch now and the extra GET fields (S1); a part function that throws or gives
 // no string is no name
 function srcOf(l){var n=l.source,q=l.query;if(typeof n==='function'){try{n=n(V.q)}catch(e){n=null}}if(typeof n!=='string'||!n)n=null;
  if(typeof q==='function'){try{q=q(V.q)}catch(e){q=null}}return {name:n,q:q&&typeof q==='object'&&!Array.isArray(q)?q:null}}
 // a layer is not fetched while the map's document is being read: the mode comes with the document (no fetch with no mode).
 // The fetch key is the page context, the name and the part's extra fields: a name that changes with the kind, or a
 // field that changes, asks again
 function layerEnv(l){if(!l.source||!st.map||!st.target)return null;var sr=srcOf(l),s=l.s,k;
  if(!sr.name){k=sig()+'|';if(s.key!==k){var w=null;if(l.why){try{w=l.why(V.q)}catch(e){w=null}}s.key=k;s.env=null;s.err=null;s.need=null;s.busy=false;s.why=w||'mapviz.shell.noSource';s.want=false;drawGroups()}return null}
  var body={name:sr.name},f;for(f in sr.q||{})if(Object.prototype.hasOwnProperty.call(sr.q,f)&&f!=='name')body[f]=sr.q[f];
  k=sig()+'|'+sr.name+'|'+(sr.q?JSON.stringify(sr.q):'');if(s.key===k)return s.env||null;if(docBusy)return null;
  s.key=k;s.env=null;s.err=null;s.need=null;s.why=null;s.busy=true;drawGroups();
  vapi('GET','layer',body).then(function(env){if(s.key!==k)return;s.busy=false;
    if(!env||(env.kind!=='grid'&&env.kind!=='vector'))s.err=tx('mapviz.shell.badLayer',{msg:faultText('kind')});
    else if(env.kind==='grid'){try{decode(env);s.env=env}catch(e){s.err=tx('mapviz.shell.badLayer',{msg:faultText(e.code||'size')})}}else s.env=env;
    s.want=false;drawGroups();drawItems();redraw()},
   function(e){if(s.key!==k)return;s.busy=false;var n=needOf(e);if(n){s.need=n;wanted(l,n)}else{s.err=errText(e);s.want=false}drawGroups()});
  return null}
 function viewObj(env){return {cx:st.view.cx,cy:st.view.cy,zoom:st.view.zoom,w:st.w,h:st.h,env:env||null,pal:V.pal,
  toScreen:function(x,y){return toScreen(st.view,st.w,st.h,x,y)},toWorld:function(px,py){return toWorld(st.view,st.w,st.h,px,py)},token:V.token}}
 // ---- tiles (README 5.2) ----
 function tkey(base){return sig()+'|'+base}
 function drawTiles(ctx,l){if(!st.map||!st.target)return;var base=l.tiles,hk=tkey(base),hd=hdrs[hk];
  // a header answer is taken only while the tile store it was asked for is the page's (gen: a closed map, a cleared
  // cache or another map starts a new store)
  if(!hd){if(docBusy)return;var g=gen;hdrs[hk]={busy:true};vapi('GET','tiles',{base:base,z:0,t:'0.0'}).then(function(a){if(g!==gen)return;hdrs[hk]={zmax:a.zmax,w:a.w,h:a.h,ox:a.ox,oy:a.oy,cell:a.cell,box:a.box};if(l.s.need&&!l.s.mk){l.s.need=null;drawGroups()}l.s.want=false;takeTiles(hk,a);redraw()},
   function(e){if(g!==gen)return;var n=needOf(e);hdrs[hk]={err:n?null:errText(e),need:n};l.s.need=n;l.s.err=n?null:errText(e);if(n)wanted(l,n);else l.s.want=false;drawGroups()});return}
  if(hd.busy||hd.err||hd.need)return;var z=pickZ(hd,st.view.zoom),list=tileList(hd,z,st.view,st.w,st.h),ask=[];
  for(var i=0;i<list.length;i++){var k=hk+'|'+z+'|'+list[i],t=tiles[k];
   if(!t){ask.push(list[i]);continue}
   if(t.img&&t.ok&&ctx.drawImage){var xy=list[i].split('.'),bx=tileBox(hd,z,+xy[0],+xy[1],st.view,st.w,st.h);try{ctx.drawImage(t.img,bx[0],bx[1],bx[2],bx[3])}catch(e){}}}
  for(var b=0;b<ask.length;b+=BATCH)fetchTiles(hk,base,z,ask.slice(b,b+BATCH))}
 function fetchTiles(hk,base,z,list){var g=gen;list.forEach(function(t){tiles[hk+'|'+z+'|'+t]={busy:true}});
  vapi('GET','tiles',{base:base,z:z,t:list.join(',')}).then(function(a){if(g===gen)takeTiles(hk,a)},function(){if(g===gen)list.forEach(function(t){tiles[hk+'|'+z+'|'+t]={failed:true}})})}
 function takeTiles(hk,a){(a&&a.tiles||[]).forEach(function(t){var k=hk+'|'+a.z+'|'+t.t;if(t.missing||!t.png){tiles[k]={missing:true};return}
  var rec={img:null,ok:false};tiles[k]=rec;if(typeof Image!=='function')return;try{var im=new Image();im.onload=function(){rec.ok=true;redraw()};im.src='data:image/png;base64,'+t.png;rec.img=im;if(im.complete&&im.width)rec.ok=true}catch(e){}})}
 // ---- drawing ----
 var cv=null,ctx=null;
 function redraw(){if(frame)return;frame=true;var f=function(){frame=false;drawNow()};
  if(typeof window!=='undefined'&&typeof window.requestAnimationFrame==='function'){try{window.requestAnimationFrame(f);return}catch(e){}}later(f,16)}
 // no canvas context: nothing is drawn, but the visible 'source' layers are still fetched (layerEnv keeps one fetch per
 // key and calls drawItems when it lands), so the DOM item lists fill for the fake DOM and for screen readers
 function fetchSources(){if(!st.map||!st.target)return;DRAW.forEach(function(g){if(!GRP[g].on)return;layers.forEach(function(l){if(l.group===g&&l.on&&l.source&&!l.tiles)layerEnv(l)})})}
 function drawNow(){if(quiet())return;if(!ctx){fetchSources();return}var w=(cv.clientWidth|0)||st.w,hh=(cv.clientHeight|0)||st.h;if(cv.width!==w)cv.width=w;if(cv.height!==hh)cv.height=hh;st.w=w;st.h=hh;
  try{if(ctx.setTransform)ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;if(ctx.clearRect)ctx.clearRect(0,0,w,hh);var bg=V.token('card')||V.token('bg');if(bg&&ctx.fillRect){ctx.fillStyle=bg;ctx.fillRect(0,0,w,hh)}}catch(e){}
  DRAW.forEach(function(g){var G=GRP[g];if(!G.on)return;layers.forEach(function(l){if(l.group!==g||!l.on)return;ctx.globalAlpha=G.op;
   try{if(ctx.save)ctx.save();if(l.tiles)drawTiles(ctx,l);else{var env=l.source?layerEnv(l):null;if(l.draw)l.draw(ctx,viewObj(env));else if(env){var r=env.kind==='grid'?gridDraw(ctx,viewObj(env),env):vectorDraw(ctx,viewObj(env),env,{pal:V.pal});if(r&&r!=='nodraw'&&!l.s.err){l.s.err=tx('mapviz.shell.badLayer',{msg:faultText(r)});drawGroups()}}}}
   catch(e){l.s.err=tx('mapviz.shell.badLayer',{msg:e&&e.message||String(e)});drawGroups()}finally{try{if(ctx.restore)ctx.restore()}catch(e){}}})});
  ctx.globalAlpha=1;if(st.cursor&&ctx.beginPath){var p=toScreen(st.view,w,hh,st.cursor[0],st.cursor[1]);ctx.strokeStyle=colourCss(V.pal&&V.pal.marks&&V.pal.marks.cursor)||V.token('fg');ctx.lineWidth=1;
   ctx.beginPath();ctx.moveTo(p[0]-8,p[1]);ctx.lineTo(p[0]+8,p[1]);ctx.moveTo(p[0],p[1]-8);ctx.lineTo(p[0],p[1]+8);ctx.stroke()}
  if(st.map)drawScale(ctx,w,hh)}
 var GRP={};GROUPS.forEach(function(g){GRP[g]={on:true,op:1}});
 // ---- the page ----
 var el={};
 function fld(id,k,ctl){var t=tx(k);return h('div',{class:'fld',blk:'mv.'+id,'data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),ctl,h('span')])])}
 function sel(opts,val,on){var s=h('select',{onchange:function(){on(s.value)}},opts.map(function(o){return h('option',{value:o[0],text:o[1]})}));s.value=val;return s}
 function say(k,a){if(el.say){el.say.textContent=k?tx(k,a||{}):''}}
 // blocks (tools/gui/test/blockcheck.js): every control and text sits in a leaf block; a heading, a control or a table is
 // wrapped in a leaf, never a block itself; every block carries a plain-word name (data-blkname) in the page language
 function leaf(id,nk,kids,a){var o={blk:id,'data-blkname':nk?tx(nk):null};for(var k in a||{})o[k]=a[k];return h('div',o,kids)}
 function boxOf(id,nk,kids,kind){return h('div',{blk:id,box:kind||'col','data-blkname':nk?tx(nk):null},kids)}
 function bid(s){return String(s).replace(/[^a-z0-9.]+/g,'-')}
 function addCls(e,c){if(e)e.className=(e.className?e.className+' ':'')+c}
 // the page's own style, once per document (W4, P6): the view area is the window height under the page header, the main
 // row takes what the title and the bar leave and the stage the width the side columns leave; the side columns scroll
 // inside themselves; below 900 px the stage comes first. While the GUI
 // arranges blocks (body.arranging) none of it applies, so every block bar shows and the blocks flow as on other pages
 function layout(){try{if(typeof document==='undefined'||!document||!document.createElement||document.__mvCss)return;document.__mvCss=true;
  var s=document.createElement('style');s.setAttribute('data-mapviz','1');s.textContent=LAYOUT;(document.head||document.body).appendChild(s)}catch(e){}
  try{if(typeof window!=='undefined'&&window&&window.addEventListener)window.addEventListener('resize',function(){fitTop();redraw()})}catch(e){}
  try{if(typeof ResizeObserver==='function'&&cv){var ro=new ResizeObserver(function(){fitTop();redraw()});ro.observe(cv);if(document.body)ro.observe(document.body)}}catch(e){}}
 // fitTop: the view area ends at the window bottom wherever it starts. The GUI header height (--hdh) leaves out the tab and
 // sub-tab rows above the page, so the shell measures its own top (page y) and gives it to the layout as --mvy; with no
 // layout box (fake DOM, hidden page) the --hdh rule stays
 function fitTop(){try{if(!el||!el.top||!el.top.getBoundingClientRect||!el.top.style||!el.top.style.setProperty)return;var r=el.top.getBoundingClientRect();if(!r||!(r.height>0))return;
  var y=Math.max(0,Math.round(r.top+((typeof window!=='undefined'&&window&&window.scrollY)||0)));if(y!==fitTop.y){fitTop.y=y;el.top.style.setProperty('--mvy',y+'px')}}catch(e){}}
 root.textContent='';
 if(RMT){root.appendChild(boxOf('mv','mapviz.shell.title',[leaf('mv.title','mapviz.shell.title',[h('h2',{text:tx('mapviz.shell.title')})]),h('p',{blk:'mv.rmt',class:'hint','data-blkname':tx('mapviz.shell.blk.rmt'),text:tx('mapviz.shell.rmt')})]));
  return {refresh:function(){},focus:function(){},view:function(){},pick:function(){},go:function(){return false},V:V}}
 // ---- the head row: title, the map picker button, mode, phase, side, unit kind, the view buttons ----
 // "Map:" before the map name is for screen readers only (the button's place and title say it to the eye)
 el.mapHint=h('span',{class:'mvvh',text:tx('mapviz.shell.mapLabel')+' ',hidden:true});
 el.mapName=h('b',{text:tx('mapviz.shell.chooseMap')});
 el.pickBtn=h('button',{type:'button',class:'mvpickbtn','aria-haspopup':'dialog','aria-expanded':'false',title:tx('mapviz.shell.pickT'),onclick:function(){setPicker(!st.pick,true)}},
  [el.mapHint,el.mapName,h('span',{'aria-hidden':'true',text:' \u25BE'})]);
 // the map picker: a popover under the button that holds the 'list' panel (role dialog). Esc, a click outside it or a map
 // the user picks closes it; it opens with the focus on its first field and gives the focus back to the button
 el.pick=h('div',{blk:'mv.picker',box:'col',class:'mvpick',role:'dialog','aria-label':tx('mapviz.shell.chooseMap'),hidden:true,'data-blkname':tx('mapviz.shell.blk.picker'),
  onkeydown:function(e){if(e&&e.key==='Escape'&&!e.defaultPrevented&&st.pick){setPicker(false,true);if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation()}}});
 el.pickBox=boxOf('mv.pickbox','mapviz.shell.blk.pickbox',[leaf('mv.map','mapviz.shell.blk.map',[el.pickBtn]),el.pick]);addCls(el.pickBox,'mvpickbox');
 el.mode=sel([['',tx('mapviz.shell.modeNone')]],'',function(v){setMode(v||null)});
 el.modeF=fld('mode','mapviz.shell.mode',el.mode);
 // side and unit kind: button groups (aria-pressed); a press sends the same 'map' form the old selects sent
 el.sideF=seg('side','mapviz.shell.sideLabel',SIDES,'mapviz.shell.side.',st.side,function(v){setSide(v)});
 el.kindF=seg('kind','mapviz.shell.kindLabel',KINDS,'mapviz.shell.kind.',st.kind,function(v){setKind(v)});
 // the page phase (page-pg2 S4, page-pg3 N1): shown only while the open mode holds two or more phases; '' = null = the
 // lowest phase (the jobs take the mode's lowest phase when none is given)
 el.phase=sel([['',tx('mapviz.shell.phaseFirst')]],'',function(v){setPhase(v)});
 el.phaseF=fld('phase','mapviz.shell.phaseLabel',el.phase);el.phaseF.hidden=true;
 // the left column: the 'left' panels (the game panel) and the item lists; its fold button is the toolbar's first item
 // (mv.bar), so the column spends no row on it
 el.foldL=h('button',{type:'button',class:'mvcolfold',onclick:function(){setColFold('l',!st.foldL,true)}});
 el.left=boxOf('mv.left','mapviz.shell.blk.left',[]);
 // the canvas height comes from the page's own style (LAYOUT above): the stage fills the main row of the view area
 cv=h('canvas',{tabindex:'0',role:'application','aria-label':tx('mapviz.shell.canvas'),width:'800',height:'560',style:'width:100%;display:block;touch-action:none'});
 try{ctx=cv.getContext?cv.getContext('2d'):null}catch(e){ctx=null}
 st.canvas=!!(ctx&&ctx.drawImage&&ctx.beginPath);if(!st.canvas)ctx=null;
 el.hint=st.canvas?null:h('p',{blk:'mv.nocanvas',class:'hint','data-blkname':tx('mapviz.shell.blk.nocanvas'),text:tx('mapviz.shell.noCanvas')});
 // the readout stays the accessible line (aria-live, seen by screen readers only); the cursor strip shows the same rows on
 // one line for the eye (aria-hidden)
 el.readout=leaf('mv.readout','mapviz.shell.blk.readout',[],{'aria-live':'polite',class:'hint mvsr'});
 el.strip=leaf('mv.strip','mapviz.shell.blk.strip',[],{'aria-hidden':'true',class:'hint mvstrip'});
 // the item lists (zones, flags, spawns ...) are a fold at the end of the left column, never under the stage (W4)
 el.itemsSum=h('summary',{text:tx('mapviz.shell.blk.items')});
 el.items=h('details',{blk:'mv.items',box:'col',class:'mvitems',open:true,'data-blkname':tx('mapviz.shell.blk.items')},[el.itemsSum]);
 el.say=h('p',{blk:'mv.say',role:'status','aria-live':'polite',class:'hint','data-blkname':tx('mapviz.shell.blk.say')});
 // the tool cards (a panel whose id is a tool id, shown while that tool is in use) and the first-time hint (no map open)
 el.cards=boxOf('mv.cards','mapviz.shell.blk.cards',[]);addCls(el.cards,'mvcards');
 el.first=leaf('mv.first','mapviz.shell.first.title',[h('h3',{text:tx('mapviz.shell.first.title')}),
  h('ol',{},[h('li',{text:tx('mapviz.shell.first.pick')}),h('li',{text:tx('mapviz.shell.first.layers')}),h('li',{text:tx('mapviz.shell.first.click')})])],{class:'hint mvfirst'});
 el.view=boxOf('mv.viewbox','mapviz.shell.blk.view',[st.canvas?leaf('mv.canvas','mapviz.shell.blk.canvas',[cv]):el.hint,el.first,el.cards,el.readout,el.say,el.strip]);
 // the right column: its fold button and the tab list, then one tab panel per tab (TABS); the panels go to their tab
 el.groups=boxOf('mv.groups','mapviz.shell.blk.groups',[]);
 // the Layers tab top: the filter (searchKit: history, index = the layers, Browse = the product cache on the disk, a file picked
 // gives its name as the filter), the one-line key of the two marks, the views, then On now (the visible layers with their
 // legend; it took the place of the separate legend block)
 el.filt=h('input',{type:'search',autocomplete:'off',style:'width:100%','aria-label':tx('mapviz.shell.filter'),placeholder:tx('mapviz.shell.filterHint'),oninput:function(){setFilter(el.filt.value)}});
 el.filtKit=typeof searchKit==='function'?searchKit(el.filt,{key:'mapviz.layerFilter',beside:true,index:function(q,done){done(layers.filter(function(l){return filterHit(hayOf(l),q)}).map(function(l){var w=lbl(l.label);return {label:w,value:w,hint:tx('mapviz.shell.group.'+l.group)}}))},
  browse:{mode:'file',view:'disk',start:function(){return st.cacheRoot||''},toValue:function(p){var b=String(p||'').split(/[\\\/]/).pop();return b.replace(/\.[^.]*$/,'')}},
  onPick:function(v){el.filt.value=v;setFilter(v)}}):null;
 // after the kit's own keys (a key it used carries e._sk): Down or Enter go to the first row the filter shows, Esc clears the text
 el.filt.addEventListener('keydown',function(e){if(!e||e._sk)return;var k=e.key;
  if(k==='ArrowDown'||k==='Enter'){var f=firstRow();if(f&&f.focus){if(e.preventDefault)e.preventDefault();try{f.focus()}catch(x){}}}
  else if(k==='Escape'&&el.filt.value){el.filt.value='';setFilter('');if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation()}});
 el.filtF=h('div',{class:'fld',blk:'mv.filter','data-blkname':tx('mapviz.shell.filter')},[h('label',{class:'f'},[h('span',{class:'n',text:tx('mapviz.shell.filter')}),el.filtKit?el.filtKit.el:el.filt,h('span')])]);
 el.markKey=leaf('mv.markkey','mapviz.shell.blk.markKey',[h('span',{text:tx('mapviz.shell.markKey',{t:MK_T,e:MK_E})})],{class:'hint'});
 el.viewB={};
 el.views=leaf('mv.views','mapviz.shell.views',[h('span',{class:'hint',text:tx('mapviz.shell.views')+' '})],{class:'mvviews',role:'group','aria-label':tx('mapviz.shell.views')});
 VIEWS.forEach(function(v){var b=h('button',{type:'button','aria-pressed':'false',text:tx(v[1]),onclick:function(){applyView(v[0])}});b._fk='view:'+v[0];el.viewB[v[0]]=b;el.views.appendChild(b)});
 el.onnow=boxOf('mv.onnow','mapviz.shell.onNow',[]);addCls(el.onnow,'mvon');
 el.foldR=h('button',{type:'button',class:'mvcolfold',onclick:function(){setColFold('r',!st.foldR,true)}});
 el.tabs={};el.dots={};el.panes={};
 el.tablist=h('div',{role:'tablist',class:'mvtablist','aria-label':tx('mapviz.shell.blk.tabs'),onkeydown:function(e){tabKey(e)}});
 // only the Inspect tab has a new-card dot: hidden and with no text until a click brings a card (newCard), so no tab's
 // text holds a dot at load
 TABS.forEach(function(t){var d=t==='inspect'?h('span',{class:'mvdot','aria-hidden':'true',hidden:true}):null;
  var b=h('button',{type:'button',role:'tab',id:'mvtab-'+t,'aria-controls':'mvpane-'+t,'aria-selected':'false',tabindex:'-1',onclick:function(){setTab(t,true)}},[h('span',{text:tx(TABK[t])}),d]);
  el.tabs[t]=b;if(d)el.dots[t]=d;el.tablist.appendChild(b);
  el.panes[t]=h('div',{blk:'mv.tab.'+t,box:'col',class:'mvtabp',role:'tabpanel',id:'mvpane-'+t,'aria-labelledby':'mvtab-'+t,'data-blkname':tx(TABK[t])})});
 [el.filtF,el.markKey,el.views,el.onnow,el.groups].forEach(function(x){el.panes.layers.appendChild(x)});
 el.right=boxOf('mv.right','mapviz.shell.blk.right',[leaf('mv.tabs','mapviz.shell.blk.tabs',[el.foldR,el.tablist],{class:'mvcolbar'})].concat(TABS.map(function(t){return el.panes[t]})));
 addCls(el.left,'mvside mvleft');addCls(el.view,'mvstage');addCls(el.right,'mvside mvright');
 el.bottom=boxOf('mv.bottom','mapviz.shell.blk.bottom',[]);
 el.tools=h('span',{});
 // the permalink: one Copy link button; the field shows only when the browser cannot copy (select it and copy by hand)
 el.link=h('input',{type:'text',readonly:true,hidden:true,'aria-label':tx('mapviz.shell.link'),style:'min-width:14em;flex:1'});
 el.incl=h('input',{type:'checkbox',onchange:function(){st.include=!!el.incl.checked;drawLink()}});
 el.fullB=h('button',{type:'button',text:tx('mapviz.shell.full'),title:tx('mapviz.shell.key.full')+' (F)','aria-pressed':'false',onclick:function(){setFull(!st.full)}});
 el.keysB=h('button',{type:'button',text:tx('mapviz.shell.keys'),title:tx('mapviz.shell.key.list')+' (?)','aria-expanded':'false',onclick:function(){toggleKeys()}});
 el.bar=leaf('mv.bar','mapviz.shell.blk.bar',[el.foldL,
  h('button',{type:'button',text:tx('mapviz.shell.fit'),title:tx('mapviz.shell.key.fit'),onclick:function(){fit()}}),
  h('button',{type:'button',text:'+','aria-label':tx('mapviz.shell.zoomIn'),onclick:function(){zoomBy(1.25)}}),
  h('button',{type:'button',text:'\u2212','aria-label':tx('mapviz.shell.zoomOut'),onclick:function(){zoomBy(0.8)}}),
  el.tools,el.fullB,
  h('button',{type:'button',text:tx('mapviz.shell.copy'),title:tx('mapviz.shell.copyT'),onclick:function(){copyLink()}}),el.link,
  h('label',{title:tx('mapviz.shell.includeT')},[el.incl,h('span',{text:' '+tx('mapviz.shell.include')})]),
  el.keysB],{class:'row mvbar'});
 el.job=h('span',{});el.stop=h('button',{type:'button',text:tx('mapviz.shell.stop'),hidden:true,onclick:function(){stopJobs()}});
 // a thin bar under the job words while a job reports done of total
 el.prog=h('progress',{class:'mvprog',max:'1',value:'0',hidden:true,'aria-hidden':'true'});
 el.cache=h('span',{});el.clear=h('button',{type:'button',text:tx('mapviz.shell.clear'),title:tx('mapviz.shell.clearT'),onclick:function(){clearCache()}});
 // the cache line closes the Pictures tab (the panels of that tab go above it)
 el.cacheLine=leaf('mv.cacheline','mapviz.shell.blk.cache',[h('span',{class:'hint',text:tx('mapviz.shell.cache')+' '}),el.cache,el.clear],{class:'row'});
 el.panes.pictures.appendChild(el.cacheLine);
 el.keys=h('dl',{blk:'mv.keys',hidden:true,'data-blkname':tx('mapviz.shell.keys')},[]);
 // the key list: the shell's keys, then one row per tool that has a key (drawn again when a tool is added)
 function drawKeys(){if(!el.keys)return;el.keys.textContent='';
  KEYS.forEach(function(k){el.keys.appendChild(h('dt',{},[h('kbd',{text:k[0]})]));el.keys.appendChild(h('dd',{text:tx(k[1])}))});
  tools.forEach(function(t){if(!t.key)return;el.keys.appendChild(h('dt',{},[h('kbd',{text:String(t.key)})]));el.keys.appendChild(h('dd',{text:lbl(t.label)}))})}
 drawKeys();
 // the job line is a strip at the stage bottom (seen without scrolling, P6)
 el.view.appendChild(leaf('mv.jobline','mapviz.shell.blk.jobs',[h('span',{class:'hint',text:tx('mapviz.shell.jobs')+' '}),el.job,el.prog,el.stop],{class:'row'}));
 el.main=boxOf('mv.main','mapviz.shell.blk.main',[el.left,el.view,el.right],'cols');addCls(el.main,'mvmain');
 // the view area: one head row (title, map button, mode, phase, side, unit kind, view buttons) and the main row, in one
 // column of the window height under the page header (P6)
 el.head=boxOf('mv.head','mapviz.shell.blk.head',[leaf('mv.title','mapviz.shell.title',[h('h2',{text:tx('mapviz.shell.title')})],{class:'mvtitle'}),el.pickBox,el.modeF,el.phaseF,el.sideF,el.kindF,el.bar],'row');addCls(el.head,'mvhead');
 el.top=boxOf('mv.top','mapviz.shell.blk.top',[el.head,el.main]);addCls(el.top,'mvtop');
 layout();
 root.appendChild(boxOf('mv','mapviz.shell.title',[el.top,el.bottom,el.keys]));
 setTab(lsTab(),false);setColFold('l',!!lsGet('maps.viewer.foldLeft'),false);setColFold('r',!!lsGet('maps.viewer.foldRight'),false);drawMapName();drawFirst();drawStrip();
 function toggleKeys(){el.keys.hidden=!el.keys.hidden;if(el.keysB)el.keysB.setAttribute('aria-expanded',el.keys.hidden?'false':'true')}
 // ---- the head row controls ----
 // seg(id, label key, values, word key prefix, value, on(v)): a leaf with a button group, one aria-pressed button per value
 function seg(id,nk,vals,pre,cur,on){var lab=tx(nk),bs={},g=h('span',{class:'mvseg',role:'group','aria-label':lab,title:lab});
  vals.forEach(function(v){var b=h('button',{type:'button','aria-pressed':v===cur?'true':'false',text:tx(pre+v),onclick:function(){on(v)}});bs[v]=b;g.appendChild(b)});
  var f=h('div',{blk:'mv.'+id,class:'mvsegf','data-blkname':lab},[h('span',{class:'hint',text:lab+' '}),g]);f._mvb=bs;return f}
 function segSet(f,v){if(f&&f._mvb)for(var k in f._mvb)if(Object.prototype.hasOwnProperty.call(f._mvb,k))f._mvb[k].setAttribute('aria-pressed',k===v?'true':'false')}
 function setSide(v){if(SIDES.indexOf(v)<0)return;settle();if(v===st.side)return;st.side=v;segSet(el.sideF,v);mapChanged()}
 function setKind(v){if(KINDS.indexOf(v)<0)return;settle();if(v===st.kind)return;st.kind=v;segSet(el.kindF,v);mapChanged()}
 function rmCls(e,c){if(e)e.className=String(e.className||'').split(/\s+/).filter(function(x){return x&&x!==c}).join(' ')}
 function drawMapName(){if(!el.mapName)return;el.mapName.textContent=st.map||tx('mapviz.shell.chooseMap');el.mapHint.hidden=!st.map}
 function drawFirst(){if(el.first)el.first.hidden=!!st.map}
 // ---- the map picker ----
 function inside(n,box){for(var i=0;n&&box&&i<400;i++){if(n===box)return true;n=n.parentNode}return false}
 function inDialog(n){for(var i=0;n&&i<400;i++){if(String(n.tagName||'').toUpperCase()==='DIALOG')return true;n=n.parentNode}return false}
 // firstField(box): its first input, select or textarea in document order (not hidden), else its first button
 function firstField(n){var k=n&&n.children?Array.prototype.slice.call(n.children):[],btn=null;
  for(var i=0;i<k.length;i++){var c=k[i];if(!c||c.hidden)continue;var g=String(c.tagName||'').toUpperCase();
   if(g==='INPUT'){var ty=String((c.getAttribute&&c.getAttribute('type'))||c.type||'').toLowerCase();if(ty!=='hidden')return c;continue}
   if(g==='SELECT'||g==='TEXTAREA')return c;if(g==='BUTTON'){if(!btn)btn=c;continue}
   var f=firstField(c);if(f&&String(f.tagName||'').toUpperCase()!=='BUTTON')return f;if(!btn&&f)btn=f}
  return btn}
 function activeEl(){try{return typeof document!=='undefined'&&document?document.activeElement:null}catch(e){return null}}
 // setPicker(open, focus): open or close the picker; focus: the first field when it opens, the button when it closes.
 // The 'picker' event {open} tells the parts
 function setPicker(o,foc){o=!!o;if(!el.pick)return;var was=st.pick;st.pick=o;el.pick.hidden=!o;el.pickBtn.setAttribute('aria-expanded',o?'true':'false');
  if(o&&foc){var f=firstField(el.pick);if(f&&f.focus){try{f.focus()}catch(e){}}}
  else if(!o&&foc&&el.pickBtn.focus){try{el.pickBtn.focus()}catch(e){}}
  if(o!==was)emit('picker',{open:o})}
 // a press outside the picker and its button closes it (not one in a dialog of the GUI, such as Browse of the search box)
 try{if(typeof document!=='undefined'&&document&&document.addEventListener)document.addEventListener('mousedown',function(e){if(!st.pick)return;var t=e&&e.target;
   if(!t||inside(t,el.pick)||inside(t,el.pickBtn)||inDialog(t))return;setPicker(false,false)},true)}catch(e){}
 // ---- the right column tabs ----
 function lsTab(){var t=lsGet('maps.viewer.tab');return TABS.indexOf(t)>=0?t:'layers'}
 // setTab(tab, user, focus): show that tab; a tab the user picks is kept (LS as2gui.maps.viewer.tab); the Inspect tab shown
 // drops its new-card dot
 function setTab(t,user,foc){if(TABS.indexOf(t)<0||!el.tabs||!el.tabs[t])return;st.tab=t;
  TABS.forEach(function(x){var on=x===t;el.tabs[x].setAttribute('aria-selected',on?'true':'false');el.tabs[x].setAttribute('tabindex',on?'0':'-1');el.panes[x].hidden=!on});
  if(t==='inspect')newCard(false);if(user)lsSet('maps.viewer.tab',t);if(foc&&el.tabs[t].focus){try{el.tabs[t].focus()}catch(e){}}}
 // arrows (and Home, End) move between the tabs and show the one they reach
 function tabKey(e){var k=e&&e.key,i=TABS.indexOf(st.tab),n=TABS.length,j=k==='ArrowRight'||k==='ArrowDown'?(i+1)%n:k==='ArrowLeft'||k==='ArrowUp'?(i+n-1)%n:k==='Home'?0:k==='End'?n-1:-1;
  if(j<0)return;setTab(TABS[j],true,true);if(e.preventDefault)e.preventDefault()}
 // newCard(on): a click on the map found something (the object card has news): a dot on the Inspect tab while another
 // tab is shown; the tab is never switched for the user
 function newCard(on){var d=el.dots&&el.dots.inspect;if(!d)return;on=!!on&&st.tab!=='inspect';d.hidden=!on;d.textContent=on?' \u25CF':'';
  if(on)el.tabs.inspect.setAttribute('title',tx('mapviz.shell.tabNew'));else if(el.tabs.inspect.removeAttribute)el.tabs.inspect.removeAttribute('title')}
 // ---- more room for the map: column folds, full screen ----
 function setColFold(s,v,user){v=!!v;var L=s==='l',b=L?el.foldL:el.foldR,c=L?'mvnoleft':'mvnoright';if(!b||!el.main)return;if(L)st.foldL=v;else st.foldR=v;
  rmCls(el.main,c);if(v)addCls(el.main,c);
  b.textContent=L?(v?'\u00BB':'\u00AB'):(v?'\u00AB':'\u00BB');b.setAttribute('aria-expanded',v?'false':'true');
  var w=tx(L?(v?'mapviz.shell.unfoldLeft':'mapviz.shell.foldLeft'):(v?'mapviz.shell.unfoldRight':'mapviz.shell.foldRight'));b.setAttribute('aria-label',w);b.setAttribute('title',w+(L?' ([)':' (])'));
  if(user){lsSet(L?'maps.viewer.foldLeft':'maps.viewer.foldRight',v);redraw()}}
 // setFull(on): the view area fills the screen (Fullscreen API), or fills the window (class mvfull) where the API is absent
 // or refused; Esc leaves either
 function setFull(on){on=!!on;if(!el.top||on===st.full)return;var d=typeof document!=='undefined'?document:null,t=el.top;st.full=on;
  if(on){st.fs=false;if(typeof t.requestFullscreen==='function'){try{var pr=t.requestFullscreen();st.fs=true;
     if(pr&&typeof pr.then==='function')pr.then(null,function(){st.fs=false;if(st.full){addCls(t,'mvfull');redraw()}})}catch(e){st.fs=false}}
   if(!st.fs)addCls(t,'mvfull')}
  else{if(st.fs&&d&&typeof d.exitFullscreen==='function'&&d.fullscreenElement){try{var px=d.exitFullscreen();if(px&&typeof px.then==='function')px.then(null,function(){})}catch(e){}}st.fs=false;rmCls(t,'mvfull')}
  if(el.fullB)el.fullB.setAttribute('aria-pressed',on?'true':'false');redraw()}
 try{if(typeof document!=='undefined'&&document&&document.addEventListener)document.addEventListener('fullscreenchange',function(){if(st.fs&&!document.fullscreenElement){st.fs=false;st.full=false;rmCls(el.top,'mvfull');
   if(el.fullB)el.fullB.setAttribute('aria-pressed','false');redraw()}})}catch(e){}
 // ---- the page's own keys (F2, [, ], F, ?, Esc for the picker and the window fill): never while typing in a field (but
 // Esc, and F2 inside the open picker), never a key a tool has; the canvas keys call it too
 function toolKey(k){var t=null;tools.forEach(function(x){if(x.key&&String(x.key).toLowerCase()===String(k).toLowerCase())t=x});return t}
 function pageKey(e){if(!e||e.ctrlKey||e.altKey||e.metaKey)return false;var k=e.key;
  if(k==='Escape'){if(st.pick){setPicker(false,true);return true}if(st.full&&!st.fs){setFull(false);return true}
   // Esc ends the tool in use from anywhere on the page (the tool button or a side column may hold the focus), not while typing
   if(st.tool&&!typing(e)){useTool(null);return true}return false}
  // F2 is the picker's own key: it also closes the picker from its search box (the one field it may come from)
  if(k==='F2'&&st.pick&&(inside(e.target,el.pick)||inside(activeEl(),el.pick))){setPicker(false,true);return true}
  if(typing(e)||toolKey(k))return false;
  if(k==='F2'){setPicker(!st.pick,true);return true}
  if(k==='['){setColFold('l',!st.foldL,true);return true}
  if(k===']'){setColFold('r',!st.foldR,true);return true}
  if(k==='f'||k==='F'){setFull(!st.full);return true}
  if(k==='/'){focusFilter();if(e.preventDefault)e.preventDefault();return true}
  if(k==='?'){toggleKeys();return true}
  return false}
 // ---- the cursor strip ----
 function upmNow(){var u=V.doc&&V.doc.upm;return typeof u==='number'&&u>0?u:UPM}
 function mtr(u){return (Math.round(u/upmNow()*10)/10).toFixed(1)}
 // drawStrip(): the position in metres and the first rows of the readout; the hint when the cursor is off the map (no map,
 // no cursor, the pointer left the canvas, or outside the world box)
 function drawStrip(){if(!el.strip)return;var c=st.cursor,b=V.doc&&V.doc.boxes&&(V.doc.boxes.world||V.doc.boxes.auto);
  if(!st.map||!c||st.off||offBox(b,c[0],c[1])){el.strip.textContent=tx('mapviz.shell.stripHint');return}
  el.strip.textContent=stripText(tx('mapviz.shell.stripAt',{x:mtr(c[0]),y:mtr(c[1])}),st.rows||[],STRIPMAX)}
 // ---- the scale bar (canvas bottom left) ----
 function drawScale(c,w,hh){var sb=scaleBar(st.view.zoom,upmNow(),Math.min(SCALEPX,w/3));if(!sb||!c.beginPath||!c.fillRect)return;
  var t=sb.m>=1000?tx('mapviz.shell.scaleKm',{n:Number((sb.m/1000).toPrecision(6))}):tx('mapviz.shell.scaleM',{n:sb.m}),x=12,y=hh-10,L=Math.max(1,Math.round(sb.px)),fg=V.token('fg'),bg=V.token('card')||V.token('bg');
  try{c.font='11px sans-serif';var tw=c.measureText?(c.measureText(t)||{}).width||0:0;
   if(bg){c.globalAlpha=0.8;c.fillStyle=bg;c.fillRect(x-6,y-24,Math.max(L,tw)+12,30)}c.globalAlpha=1;
   c.strokeStyle=fg;c.lineWidth=2;c.beginPath();c.moveTo(x,y-6);c.lineTo(x,y);c.lineTo(x+L,y);c.lineTo(x+L,y-6);c.stroke();
   if(c.fillText){c.fillStyle=fg;c.fillText(t,x,y-10)}}catch(e){}}
 // ---- right bar: the filter, the views, On now, the groups and their layer rows ----
 // tips (what a layer or group shows and how it is calculated): looked up by id, mapviz.shell.tip.l.<layer id> and
 // mapviz.shell.tip.g.<group>, so a part that adds a layer needs no edit here. On the Gates of Hell page a key with
 // .goh after it wins where the rules differ; AS64 and MoW:AS2 share the plain key. No text: no tip
 function tipOf(k){var gk=(st.target||pageTarget())==='goh'?k+'.goh':null;if(gk&&tx(gk)!==gk)k=gk;var s=tx(k);return s===k?'':s}
 function layerTip(id){return tipOf('mapviz.shell.tip.l.'+id)}
 // the mark of a layer on this page: engineTrueGoh on the Gates of Hell page when the part gave one, else engineTrue
 function isTrue(l){return (st.target||pageTarget())==='goh'&&typeof l.engineTrueGoh==='boolean'?l.engineTrueGoh:!!l.engineTrue}
 function groupTip(g){return tipOf('mapviz.shell.tip.g.'+g)}
 // markOf(l): the small mark after a layer name: MK_T (as the game sees it) or MK_E (estimate). Its title says what the mark
 // means (the mouse), its words are read by screen readers (visually hidden); the key under the filter explains both once
 function markOf(l){var t=isTrue(l);return h('span',{class:'mvmark','data-mark':t?'true':'estimate',title:tx(t?'mapviz.shell.tip.engineTrue':'mapviz.shell.tip.estimate')},
  [h('span',{'aria-hidden':'true',text:' '+(t?MK_T:MK_E)}),h('span',{class:'mvvh',text:' '+tx(t?'mapviz.shell.engineTrue':'mapviz.shell.estimate')})])}
 // tipEl(id, text): the help text of a row or a group head. The row's tick (or the head's fold button) names it with
 // aria-describedby, so a screen reader says it with the control; it shows under the row while a control in the row has the
 // keyboard focus (style .mvtip), and the label (or the fold button) carries it as its title for the mouse
 function tipEl(id,text){return h('p',{class:'hint mvtip',id:id,text:text})}
 // folds: one per group. The user's own fold choice is kept with LS (as2gui.maps.viewer.fold.<group>) and wins; until the
 // user makes one, a group with no layer ticked starts folded and a group with a layer ticked starts open. A tick inside a
 // group the user has not folded yet keeps that group open for the session (not kept), so a group never folds under the
 // pointer when its last layer is unticked. Only a fold button, Fold all and Unfold all write a fold (setFold): no draw, tick,
 // view, map or refresh does. LS.get reads the GUI's settings file before localStorage (tools/gui/page.js), so a fold kept
 // there wins even after localStorage was cleared; a stored fold is never dropped, since a user's own choice looks the same
 var FOLD={};
 function lsGet(k){try{return typeof LS!=='undefined'&&LS&&LS.get?LS.get(k,null):null}catch(e){return null}}
 function lsSet(k,v){try{if(typeof LS!=='undefined'&&LS&&LS.set)LS.set(k,v)}catch(e){}}
 function anyOn(g){return layers.some(function(l){return l.group===g&&l.on})}
 function folded(g){if(Object.prototype.hasOwnProperty.call(FOLD,g))return FOLD[g];var v=lsGet('maps.viewer.fold.'+g);if(v!=null){FOLD[g]=!!v;return FOLD[g]}return !anyOn(g)}
 function setFold(g,v){FOLD[g]=!!v;lsSet('maps.viewer.fold.'+g,!!v)}
 function keepOpen(g){if(!Object.prototype.hasOwnProperty.call(FOLD,g)&&lsGet('maps.viewer.fold.'+g)==null)FOLD[g]=false}
 // the filter: FILT the text (lower case, trimmed); a row shows when every word is in its label, group name, help text or id.
 // While it filters, a group with a match is open (FFOLD: a fold the user makes while filtering, dropped with the text) and a
 // group with none is hidden; clearing the text gives every group its own fold back
 var FILT='',FFOLD={};
 function hayOf(l){return [lbl(l.label),tx('mapviz.shell.group.'+l.group),layerTip(l.id),l.id].join(' \n ').toLowerCase()}
 function setFilter(v){var q=String(v==null?'':v).toLowerCase().replace(/^\s+|\s+$/g,'');if(q===FILT)return;if(!q||!FILT)FFOLD={};FILT=q;drawGroups()}
 // focusFilter(): the key '/': the Layers tab shown (not kept), the right column open, the focus in the filter box
 function focusFilter(){if(!el.filt)return;setTab('layers',false);if(st.foldR)setColFold('r',false,false);
  try{if(el.filtKit&&el.filtKit.focus)el.filtKit.focus();else if(el.filt.focus)el.filt.focus()}catch(e){}}
 // the keyboard focus over a rebuild of the column: each control the rebuild makes may carry a key (_fk); the control that had
 // the focus gets it back by its key. focusWant names another one (an On now row that goes away hands the focus on); a Make
 // button that turns into words gives it to the tick of its row
 var FKM={},focusWant=null,fkDepth=0;
 function fk(e,k){e._fk=k;FKM[k]=e;return e}
 // the control in use stays where it is on the screen over a rebuild (topOf before and after; the pane or the page scrolls by
 // the difference): a tick adds a row to On now above the list, and the list must not move under the pointer
 function topOf(e){try{return e&&e.getBoundingClientRect?e.getBoundingClientRect().top:null}catch(x){return null}}
 function holdAt(t,y0){var y1=topOf(t);if(y0==null||y1==null||!isFinite(y1-y0)||Math.abs(y1-y0)<1)return;var d=y1-y0,p=t.closest?t.closest('.mvtabp'):null;
  if(p&&p.scrollHeight>p.clientHeight+1)p.scrollTop+=d;else if(typeof window!=='undefined'&&window.scrollBy)window.scrollBy(0,d)}
 function withFocus(fn){if(fkDepth){fn();return}var a=activeEl(),k=a&&a._fk&&(inside(a,el.groups)||inside(a,el.onnow))?a._fk:null,y0=k?topOf(a):null;
  fkDepth++;try{FKM={};fn()}finally{fkDepth--}
  if(k&&FKM[k])holdAt(FKM[k],y0);
  var w=focusWant||k;focusWant=null;if(!w)return;var t=FKM[w]||FKM[String(w).replace(/^mk:/,'')]||null;
  if(t&&t.focus&&activeEl()!==t){try{t.focus()}catch(e){}}}
 // firstRow(): the tick of the first layer row the list shows now (Down or Enter in the filter box)
 function firstRow(){flushGroups();for(var i=0;i<GROUPS.length;i++){var g=GROUPS[i];if(FILT?FFOLD[g]:folded(g))continue;
   for(var j=0;j<layers.length;j++){var l=layers[j];if(l.group===g&&(!FILT||filterHit(hayOf(l),FILT))&&FKM['l:'+l.id])return FKM['l:'+l.id]}}return null}
 // userTick(l, on): the user ticked or unticked a layer (a row, On now). Ticked and known as not made: its job starts now (the
 // same call Make makes; none when a matching job runs). Ticked and not known yet: the row asks (want), and the job starts
 // when the answer says not made. Unticked: no job is cancelled (the job line's Stop does that). Only this starts a job of a
 // layer by itself: never a refresh, a permalink, a stored state or a view
 function userTick(l,on){settle();keepOpen(l.group);l.on=!!on;var s=l.s;s.want=false;
  if(on){var n=s.need||(s.fail&&s.fail.need);if(n){if(!s.mk)makeNeed(l,n)}else if((l.source||l.tiles)&&!s.env&&!s.err&&!s.why)s.want=true}
  layersChanged()}
 // wanted(l, n): the answer of a layer the user ticked says not made: make it now (once)
 function wanted(l,n){if(!l.s.want)return;l.s.want=false;if(n&&l.on)makeNeed(l,n)}
 // the opacity of a group: one slider in its head and one in On now, kept in step
 var SLD={};
 function opSlider(g,gw,r){var op=h('input',{type:'range',min:'0',max:'100',step:'5','aria-label':tx('mapviz.shell.opacity',{group:gw}),
   oninput:function(){setOp(g,op.value,op,false)},onchange:function(){setOp(g,op.value,op,true)}});op.value=String(Math.round(GRP[g].op*100));op._r=r;(SLD[g]=SLD[g]||[]).push(op);return fk(op,'op:'+r+':'+g)}
 function setOp(g,v,src,end){var G=GRP[g];G.op=Math.max(0,Math.min(1,Number(v)/100));(SLD[g]||[]).forEach(function(o){if(o!==src)o.value=String(Math.round(G.op*100))});redraw();if(end)drawOn()}
 // drawGroups() asks for a rebuild of the layer list; the rebuild itself (drawGroups0, whole list + On now + views) runs once per
 // animation frame however many layers or states changed in it, and once at the end of the page build (gHold). flushGroups()
 // runs a waiting rebuild now: for code that reads the list right after a change (firstRow) and for tests (the page's flush()).
 // No requestAnimationFrame (a test harness): the rebuild runs at once, as it always did
 var gHold=1,gDirty=false,gSched=false;
 function drawGroups(){if(!el.groups)return;gDirty=true;if(gHold||gSched)return;
  if(typeof window==='undefined'||typeof window.requestAnimationFrame!=='function'){flushGroups();return}
  gSched=true;var f=function(){gSched=false;flushGroups()};try{window.requestAnimationFrame(f)}catch(e){f()}}
 function flushGroups(){if(!gDirty||!el.groups)return;gDirty=false;withFocus(drawGroups0)}
 function drawGroups0(){el.groups.textContent='';SLD={};layers.forEach(function(l){l._ns=null});
  var shown=GROUPS.filter(function(g){return layers.some(function(l){return l.group===g})}),seen=0;
  // fold all / unfold all, over the groups
  if(shown.length)el.groups.appendChild(leaf('mv.groups.bar','mapviz.shell.blk.grpBar',[
   h('button',{type:'button',text:tx('mapviz.shell.foldAll'),onclick:function(){shown.forEach(function(g){setFold(g,true);FFOLD[g]=true});drawGroups()}}),h('span',{text:' '}),
   h('button',{type:'button',text:tx('mapviz.shell.unfoldAll'),onclick:function(){shown.forEach(function(g){setFold(g,false);FFOLD[g]=false});drawGroups()}})],{class:'row'}));
  shown.forEach(function(g){var ls=layers.filter(function(l){return l.group===g});var G=GRP[g];
   var hits=FILT?ls.filter(function(l){return filterHit(hayOf(l),FILT)}):ls,fold=FILT?!!FFOLD[g]:folded(g);
   var gw=tx('mapviz.shell.group.'+g),gt=groupTip(g),nOn=ls.filter(function(l){return l.on}).length,gid=gt?'mvtip-g-'+g:null;
   var gc=fk(h('input',{type:'checkbox','aria-label':tx('mapviz.shell.grpTick',{group:gw}),onchange:function(){settle();if(!Object.prototype.hasOwnProperty.call(FOLD,g)&&lsGet('maps.viewer.fold.'+g)==null)FOLD[g]=folded(g);G.on=!!gc.checked;layersChanged()}}),'g:'+g);gc.checked=G.on;
   // the head: the group tick, the fold button (name and how many of its layers are on; the help as its title and its
   // description), the opacity, the help text (shown while the head has the keyboard focus)
   var fb=fk(h('button',{type:'button',class:'mvfold','aria-expanded':fold?'false':'true',title:gt||null,'aria-describedby':gid,onclick:function(){if(FILT)FFOLD[g]=!FFOLD[g];else setFold(g,!folded(g));focusWant='fold:'+g;drawGroups()}},
    [h('span',{'aria-hidden':'true',text:fold?'\u25B8 ':'\u25BE '}),h('b',{text:gw}),h('span',{class:'hint',text:' '+tx('mapviz.shell.grpCount',{on:nOn,n:ls.length})})]),'fold:'+g);
   // one container per group: a head leaf and one leaf per layer (a folded group keeps its rows, hidden; while the filter
   // runs, a row that does not match is hidden and a group with no match is hidden whole)
   var box=h('div',{blk:'mv.g.'+g,box:'col',class:'mvgrp','data-blkname':gw,hidden:!!(FILT&&!hits.length)},[
    h('div',{blk:'mv.g.'+g+'.head',class:'mvghead',title:gt||null,'data-blkname':tx('mapviz.shell.blk.grpHead',{group:gw})},[gc,fb,opSlider(g,gw,'g'),gt?tipEl(gid,gt):null])]);
   if(!FILT||hits.length)seen++;
   ls.forEach(function(l){var lw=lbl(l.label),lt=layerTip(l.id),tid=lt?'mvtip-l-'+bid(l.id):null,hit=hits.indexOf(l)>=0;
    var c=fk(h('input',{type:'checkbox','aria-describedby':tid,onchange:function(){userTick(l,!!c.checked)}}),'l:'+l.id);c.checked=l.on;
    var row=h('div',{blk:'mv.l.'+bid(l.id),'data-blkname':lw,'data-layer':l.id,title:lt||null,hidden:fold||!hit},[h('label',{title:lt||null},[c,h('span',{text:' '+lw})]),markOf(l)]);
    statusInto(row,l,'l');if(lt)row.appendChild(tipEl(tid,lt));
    box.appendChild(row)});
   el.groups.appendChild(box)});
  if(!shown.length)el.groups.appendChild(h('p',{blk:'mv.groups.none',class:'hint','data-blkname':tx('mapviz.shell.blk.groups'),text:tx('mapviz.shell.noLayers')}));
  else if(FILT&&!seen)el.groups.appendChild(h('p',{blk:'mv.groups.nomatch',class:'hint','data-blkname':tx('mapviz.shell.filter'),text:tx('mapviz.shell.filterNone')}));
  drawOn();drawViews()}
 // statusInto(row, l, region): what a row says after the layer mark: loading, why a source names nothing, the make state
 // (drawn again in place on every job answer, needView), a fault
 function statusInto(row,l,r){var s=l.s;
  if(s.busy)row.appendChild(h('span',{class:'hint',text:' '+tx('mapviz.shell.loading')}));
  if(s.why&&l.on)row.appendChild(h('span',{class:'hint',text:' '+lbl(s.why)}));
  if(s.need||s.fail||s.mk){var ns=h('span',{class:'mvns'});ns._r=r;row.appendChild(ns);(l._ns=l._ns||[]).push(ns);needOne(l,ns)}
  else if(s.err)row.appendChild(h('span',{class:'err',text:' '+s.err}))}
 // the make state of a layer, in place (no rebuild of the rows, so the keyboard focus stays): the job that makes it runs ->
 // its words (a second Make would only join it); a job of it failed or was stopped -> the reason and Try again; not made ->
 // one small Make it button on the same line (its words not made yet for screen readers)
 function needView(l){(l._ns||[]).forEach(function(ns){needOne(l,ns)})}
 function needOne(l,ns){ns.textContent='';var s=l.s,n=s.need||(s.fail&&s.fail.need),lw=lbl(l.label),rt=n?runText(n.what,n.args):null;if(!n)return;
  if(rt||s.mk){ns.appendChild(h('span',{class:'hint',text:' '+tx('mapviz.shell.makingRow',{job:rt||whatText(n.what)})}));return}
  if(s.fail){ns.appendChild(h('span',{class:'err',text:' '+s.fail.msg+' '}));
   ns.appendChild(fk(h('button',{type:'button',class:'mvmk',text:tx('mapviz.shell.retry'),'aria-label':tx('mapviz.shell.retryL',{name:lw}),onclick:function(){focusWant='mk:'+ns._r+':'+l.id;makeNeed(l,s.fail.need)}}),'mk:'+ns._r+':'+l.id));return}
  ns.appendChild(h('span',{class:'mvvh',text:' '+tx('mapviz.shell.notMade')}));
  ns.appendChild(fk(h('button',{type:'button',class:'mvmk',text:tx('mapviz.shell.make'),title:tx('mapviz.shell.notMade'),'aria-label':tx('mapviz.shell.makeL',{name:lw}),onclick:function(){focusWant='mk:'+ns._r+':'+l.id;makeNeed(l,s.need)}}),'mk:'+ns._r+':'+l.id))}
 // makeNeed(l, need): post the job that makes the layer (W3: never while a matching job runs or its own runs); done -> the row
 // asks again; failed or stopped -> the row stays ticked with the reason and Try again
 function makeNeed(l,n){var s=l.s;if(!n||s.mk)return;s.want=false;if(runText(n.what,n.args)){s.need=n;needView(l);drawMakeAll();return}
  s.mk=true;s.need=n;s.fail=null;s.err=null;drawGroups();
  vjob(n.what,n.args).then(function(){s.mk=false;if(l.s!==s)return;s.key=null;s.need=null;Object.keys(hdrs).forEach(function(k){if(hdrs[k].need)delete hdrs[k]});drawGroups();redraw()},
   function(e){s.mk=false;if(l.s!==s)return;s.need=null;s.err=errText(e);s.fail={need:n,msg:s.err};drawGroups()})}
 // ---- On now: every visible layer (its tick and its group tick on; a tool layer only while its tool is in use; with no
 // map open, one line in place of the rows), by group in list order, with an
 // untick, its group's opacity (opacity is a group's), its make state and its legend rows inline ----
 // A tool layer (measure, profile) is listed only while its tool is in use: nothing is drawn behind it otherwise
 function visibleOn(){var out=[],tid=st.tool?st.tool.id:null;GROUPS.forEach(function(g){if(!GRP[g].on)return;layers.forEach(function(l){if(l.group===g&&l.on&&(!l.tool||l.id===tid))out.push(l)})});return out}
 // the visible layers known as not made, with no job of theirs running: "Make these (n)" starts them in this order
 function needsMake(){if(!st.map)return [];return visibleOn().filter(function(l){var s=l.s;return s.need&&!s.mk&&!runText(s.need.what,s.need.args)})}
 function drawMakeAll(){var b=el.makeAll;if(!b)return;var n=needsMake().length;b.hidden=!st.map||n<2;b.textContent=tx('mapviz.shell.makeAll',{n:n})}
 function makeAll(){settle();var seen={};needsMake().forEach(function(l){var n=l.s.need,k=n.what+'|'+JSON.stringify(n.args||{});if(seen[k])return;seen[k]=1;makeNeed(l,n)})}
 // the legend lists only what is on the picture now (owner 2026-11-19): the layer and its group are ticked, the group is not fully
 // see-through, the layer has its data (not being read, not "not made", no fault, no "why not"), a data layer has something to draw,
 // and a layer may say so itself (l.drawn(V) false = nothing drawn). A legend row with no colour marks nothing drawn and is left out.
 // Its rows sit under the layer in On now
 function drawnNow(l){var G=GRP[l.group],s=l.s||{};if(!st.map||!l.on||!G||!G.on||!(G.op>0))return false;if(s.busy||s.need||s.err||s.why)return false;
  if(l.source&&!l.tiles){var e=s.env;if(!e)return false;if(e.kind==='vector'&&!(e.items&&e.items.length))return false}
  // a layer that draws itself and lists its things (zones, flags, spawns...): an empty list on this map = nothing drawn
  if(!l.source&&typeof l.list==='function'){var li=null;try{li=l.list()}catch(x){li=null}if(Array.isArray(li)&&!li.length)return false}
  if(typeof l.drawn==='function'){try{if(l.drawn(V)===false)return false}catch(x){}}return true}
 function legendOf(l){if(!l.legend||!drawnNow(l))return null;var lg=l.legend;if(typeof lg==='function'){try{lg=lg(V)}catch(e){lg=null}}if(!Array.isArray(lg))return null;
  lg=lg.filter(function(r){return r&&!!colourCss(r.color)});if(!lg.length)return null;
  var box=h('div',{class:'mvleg','data-legend':l.id,role:'list','aria-label':tx('mapviz.shell.legend')+': '+lbl(l.label)});
  lg.forEach(function(r){var sw=h('span',{'aria-hidden':'true',style:'display:inline-block;width:1em;height:1em;vertical-align:middle;border:1px solid var(--line)'});sw.style.background=colourCss(r.color);
   box.appendChild(h('div',{role:'listitem'},[sw,h('span',{text:' '+lbl(r.label)})]))});return box}
 function drawOn(){if(!el.onnow)return;withFocus(drawOn0)}
 function drawOn0(){var box=el.onnow,vis=visibleOn();box.textContent='';Object.keys(SLD).forEach(function(g){SLD[g]=SLD[g].filter(function(o){return o._r!=='on'})});
  layers.forEach(function(l){if(l._ns)l._ns=l._ns.filter(function(ns){return ns._r!=='on'})});
  el.makeAll=fk(h('button',{type:'button',hidden:true,title:tx('mapviz.shell.makeAllT'),onclick:function(){makeAll()}}),'onall');
  box.appendChild(leaf('mv.onnow.head','mapviz.shell.onNow',[h('h3',{text:tx('mapviz.shell.onNow')}),el.makeAll],{class:'mvonhead'}));drawMakeAll();
  // no map open: one line in place of the rows (the default ticks draw nothing yet)
  if(!st.map){box.appendChild(h('p',{blk:'mv.onnow.nomap',class:'hint','data-blkname':tx('mapviz.shell.onNow'),text:tx('mapviz.shell.onNoMap')}));return}
  if(!vis.length){box.appendChild(h('p',{blk:'mv.onnow.none',class:'hint','data-blkname':tx('mapviz.shell.onNow'),text:tx('mapviz.shell.onNone')}));return}
  var cur=null;vis.forEach(function(l,i){var g=l.group,gw=tx('mapviz.shell.group.'+g);
   if(g!==cur){cur=g;box.appendChild(h('div',{blk:'mv.on.g.'+g,'data-blkname':tx('mapviz.shell.blk.grpHead',{group:gw}),'data-on-group':g},[h('b',{class:'hint',text:gw}),opSlider(g,gw,'on')]))}
   var lw=lbl(l.label),lt=layerTip(l.id),nx=vis[i+1]||vis[i-1]||null;
   var c=fk(h('input',{type:'checkbox',onchange:function(){focusWant=nx?'on:'+nx.id:'onall';userTick(l,!!c.checked)}}),'on:'+l.id);c.checked=true;
   var row=h('div',{blk:'mv.on.'+bid(l.id),'data-blkname':lw,'data-on':l.id,title:lt||null},[h('label',{title:lt||null},[c,h('span',{text:' '+lw})]),markOf(l)]);
   statusInto(row,l,'on');var lg=legendOf(l);if(lg)row.appendChild(lg);box.appendChild(row)})}
 // ---- views ----
 // activeView() -> the id of the view the ticks match now, else null (every layer that is not a tool layer is on exactly when
 // the view names it, and the groups of its layers are on)
 function activeView(){for(var i=0;i<VIEWS.length;i++){var s=viewSet(VIEWS[i][0]),ok=layers.some(function(l){return !l.tool});
   layers.forEach(function(l){if(l.tool)return;if(l.on!==!!s[l.id]||(s[l.id]&&!GRP[l.group].on))ok=false});if(ok)return VIEWS[i][0]}return null}
 function drawViews(){if(!el.viewB)return;var a=activeView();VIEWS.forEach(function(v){var b=el.viewB[v[0]],s=viewSet(v[0]),names=[];
   layers.forEach(function(l){if(s[l.id]&&MARKS.indexOf(l.id)<0)names.push(lbl(l.label))});
   b.setAttribute('aria-pressed',a===v[0]?'true':'false');b.setAttribute('title',tx('mapviz.shell.viewT',{list:names.join(', ')}))})}
 // applyView(id): the view's ticks (its layers and the game marks on, every other layer that is not a tool layer off, the groups
 // of its layers on); a tool layer keeps its tick. It starts no job and drops any tick that waited to start one; pressing the
 // view that is on already changes nothing
 function applyView(id){settle();var s=viewSet(id);if(!s||activeView()===id)return;
  layers.forEach(function(l){if(l.tool)return;l.s.want=false;l.on=!!s[l.id];if(l.on)GRP[l.group].on=true});
  for(var i=0;i<VIEWS.length;i++)if(VIEWS[i][0]===id)say('mapviz.shell.viewSaid',{name:tx(VIEWS[i][1])});layersChanged()}
 function drawItems(){if(!el.items)return;el.items.textContent='';el.items.appendChild(el.itemsSum);var n=0;
  DRAW.slice().reverse().forEach(function(g){if(!GRP[g].on)return;layers.forEach(function(l){if(l.group!==g||!l.on)return;var list=null;
   if(l.list){try{list=l.list()}catch(e){list=null}}else if(l.s.env&&l.s.env.kind==='vector')list=(l.s.env.items||[]).filter(function(it){return typeof it.x==='number'}).map(function(it){return {label:(it.name||itemText(it.kind))+(it.mode?' ('+it.mode+')':''),x:it.x,y:it.y}});
   if(!Array.isArray(list)||!list.length)return;var ul=h('ul',{'aria-label':lbl(l.label)});
   list.slice(0,200).forEach(function(it){n++;ul.appendChild(h('li',{},[h('button',{type:'button',class:'link',text:String(it.label),onclick:function(){if(typeof it.x==='number'){st.cursor=[it.x,it.y];setView({cx:it.x,cy:it.y,zoom:st.view.zoom});readout()}}})]))});
   el.items.appendChild(h('div',{blk:'mv.items.'+bid(l.id),'data-blkname':lbl(l.label)},[h('b',{text:lbl(l.label)}),ul]))})});
  el.itemsSum.textContent=n?tx('mapviz.shell.itemsN',{n:n}):tx('mapviz.shell.blk.items')}
 function layersChanged(){settle();drawGroups();drawItems();drawLink();redraw();emit('layers',{visible:shareable(layers,true,GRP,true)})}
 // ---- tools ----
 function drawTools(){drawKeys();el.tools.textContent='';tools.forEach(function(t){var b=h('button',{type:'button',text:lbl(t.label),'aria-pressed':st.tool===t?'true':'false',title:t.key?lbl(t.label)+' ('+t.key+')':null,onclick:function(){useTool(st.tool===t?null:t)}});el.tools.appendChild(b)})}
 function useTool(t){settle();var old=st.tool;if(old&&old.end){try{old.end()}catch(e){}}st.tool=t||null;if(t&&t.start){try{t.start()}catch(e){say('mapviz.shell.partFault',{part:t.id,msg:e.message})}}drawTools();drawCards();drawOn();emit('tool',{id:t?t.id:null});redraw()}
 // ---- panels ----
 // a panel's block name: o.name (words or a mapviz.* key), else the part's title (mapviz.<id>.title), else 'Panel'
 function panelName(o){if(o.name)return lbl(o.name);var k='mapviz.'+o.id+'.title',s=tx(k);return s!==k?s:tx('mapviz.shell.blk.panel')}
 // PBOX: panel id -> its box; CARDS: tool id -> the card on the stage that holds the panel of that id
 var PBOX={},PNAME={},CARDS={};
 function addPanel(o){if(!o||!o.id||typeof o.build!=='function')return null;var box=h('div',{blk:'mv.p.'+o.id,box:'col','data-blkname':panelName(o)});
  var at=placeOf(o,tools.some(function(t){return t.id===o.id}));PBOX[o.id]=box;PNAME[o.id]=panelName(o);
  if(at==='card')cardFor(o.id);else if(at==='picker')el.pick.appendChild(box);else if(at==='left')el.left.appendChild(box);else if(at==='bottom')el.bottom.appendChild(box);
  else{var p=el.panes[at]||el.panes.inspect;if(el.cacheLine&&el.cacheLine.parentNode===p)p.insertBefore(box,el.cacheLine);else p.appendChild(box)}
  try{o.build(box,V)}catch(e){say('mapviz.shell.partFault',{part:o.id,msg:e.message})}if(CARDS[o.id])cardTitle(CARDS[o.id]);panels.push(o);return box}
 // cardFor(tool id): the panel of that id becomes a card docked on the stage (top left; below the stage under 900 px),
 // shown only while its tool is in use; its close button ends the tool. A panel added before its tool moves in when the
 // tool is added
 function cardFor(id){var box=PBOX[id];if(!box||CARDS[id]||!el.cards)return;var nm=PNAME[id]||String(id),k='mv.tc.'+bid(id),w=tx('mapviz.shell.cardClose',{name:nm});
  var x=h('button',{type:'button',class:'mvx',text:'\u00D7','aria-label':w,title:w+' (Esc)',onclick:function(){if(st.tool&&st.tool.id===id){useTool(null);try{if(st.canvas&&cv.focus)cv.focus()}catch(e){}}}});
  var tb=h('b',{class:'mvcardt',text:nm}),card=h('div',{blk:k,box:'col',class:'mvcard',role:'region','aria-label':nm,hidden:true,'data-blkname':nm},
   [h('div',{blk:k+'.head',class:'row mvcardhead','data-blkname':tx('mapviz.shell.blk.cardHead',{name:nm})},[tb,x])]);
  card._mvt=tb;card._mvbox=box;
  card.appendChild(box);el.cards.appendChild(card);CARDS[id]=card;drawCards()}
 // ownHead(box): the panel starts with its own heading (its first element is a heading, or a leaf whose first element is one)
 function isHead(n){return !!n&&/^H[1-6]$/.test(String(n.tagName||'').toUpperCase())}
 function firstEl(n){var k=n&&n.children;return k&&k.length?k[0]:null}
 function ownHead(box){var c=firstEl(box);return isHead(c)||isHead(firstEl(c))}
 // cardTitle(card): one title on a card: the shell's title text goes when the panel has its own heading (the card keeps its
 // close button and its aria-label)
 function cardTitle(card){if(!card||!card._mvt)return;var own=ownHead(card._mvbox);card._mvt.hidden=own;rmCls(card,'mvown');if(own)addCls(card,'mvown')}
 function drawCards(){for(var id in CARDS)if(Object.prototype.hasOwnProperty.call(CARDS,id)){CARDS[id].hidden=!(st.tool&&st.tool.id===id);cardTitle(CARDS[id])}}
 // ---- view actions ----
 function fit(){var b=V.doc&&V.doc.boxes&&(V.doc.boxes.world||V.doc.boxes.auto);var v=fitBox(b,st.w,st.h);if(v)setView(v)}
 function zoomBy(f,px,py){setView(zoomAt(st.view,st.w,st.h,px==null?st.w/2:px,py==null?st.h/2:py,f))}
 function pan(dx,dy){setView({cx:st.view.cx-dx/st.view.zoom,cy:st.view.cy+dy/st.view.zoom,zoom:st.view.zoom})}
 // a hover row whose value is a state, not a value of the spot: the provider marks it (state: true), or its value is one of the
 // shell's own state words (not made yet, loading, reading the map, the map not read yet, being made: ...). The readout keeps
 // it for screen readers; the cursor strip leaves it out
 function stateWord(v){v=String(v==null?'':v).replace(/^\s+|\s+$/g,'');if(!v)return false;
  if(['mapviz.shell.notMade','mapviz.shell.loading','mapviz.shell.reading','mapviz.shell.docNeed'].some(function(k){return tx(k)===v}))return true;
  var mk=String(tx('mapviz.shell.makingRow')).split('{')[0];return mk.length>2&&v.indexOf(mk)===0}
 function readout(click){var c=st.cursor;if(!c){el.readout.textContent='';st.rows=[];drawStrip();return}st.off=false;var rows=[[tx('mapviz.shell.at'),num(c[0])+', '+num(c[1])]],strip=[];
  // a provider added with {quiet: true} gives rows to the strip only (its own panel already says them aloud)
  hovers.forEach(function(p){try{(p.fn(c[0],c[1])||[]).forEach(function(r){if(!r||r.label==null)return;var w=[lbl(r.label),String(r.value==null?'':r.value)];
   if(!p.quiet)rows.push(w);if(!r.state&&!stateWord(w[1]))strip.push(w)})}catch(e){}});
  var hit=null;if(click){DRAW.slice().reverse().some(function(g){if(!GRP[g].on)return false;return layers.slice().reverse().some(function(l){if(l.group!==g||!l.on||!l.hit)return false;try{hit=l.hit(c[0],c[1])}catch(e){hit=null}if(hit)tagHit(hit,l);return !!hit})});
   if(hit){(Array.isArray(hit)?hit:[hit]).forEach(function(r){var w=typeof r==='string'?['',r]:r&&r.label!=null?[lbl(r.label),String(r.value==null?'':r.value)]:null;if(!w)return;
    rows.push(w);if(!(r&&r.state)&&!stateWord(w[1]))strip.push(w)})}}
  el.readout.textContent=rows.map(function(r){return r[0]?r[0]+': '+r[1]:r[1]}).join('  |  ');st.rows=strip;drawStrip();if(click&&hit)newCard(true);return hit}
 function cursorAt(px,py,click){settle();var w=toWorld(st.view,st.w,st.h,px,py);st.cursor=w;var hit=readout(click),d={x:w[0],y:w[1],px:px,py:py};
  if(click){d.click=true;d.hit=hit||null;if(st.tool&&st.tool.click){try{st.tool.click(w[0],w[1])}catch(e){}}}else if(st.tool&&st.tool.move){try{st.tool.move(w[0],w[1])}catch(e){}}
  emit('cursor',d);redraw()}
 // go({x, y, box?}) (page-pg3 N5): the cursor at (x, y); with a box [x0, y0, x1, y1] the view fits it (never zoomed in past
 // 4 times the current zoom), else the view centres on (x, y) at the current zoom; the readout, then 'view' and 'cursor'
 // (no click). false for a point that is not two numbers
 function go(o){if(!o||typeof o.x!=='number'||typeof o.y!=='number'||!isFinite(o.x)||!isFinite(o.y))return false;settle();
  var v=o.box?fitBox(o.box,st.w,st.h):null;if(v&&v.zoom>st.view.zoom*4)v.zoom=clampZ(st.view.zoom*4);if(!v)v={cx:o.x,cy:o.y,zoom:st.view.zoom};
  st.cursor=[o.x,o.y];setView(v);readout();var p=toScreen(st.view,st.w,st.h,o.x,o.y);emit('cursor',{x:o.x,y:o.y,px:p[0],py:p[1]});redraw();return true}
 function pos(e){var r=cv.getBoundingClientRect?cv.getBoundingClientRect():{left:0,top:0};return [(e.clientX||0)-(r.left||0),(e.clientY||0)-(r.top||0)]}
 if(st.canvas){
  cv.addEventListener('mousedown',function(e){var p=pos(e);drag={x:p[0],y:p[1],moved:false}});
  cv.addEventListener('mousemove',function(e){var p=pos(e);if(drag&&!st.tool){var dx=p[0]-drag.x,dy=p[1]-drag.y;if(Math.abs(dx)+Math.abs(dy)>2||drag.moved){drag.moved=true;drag.x=p[0];drag.y=p[1];pan(dx,dy);return}}cursorAt(p[0],p[1],false)});
  cv.addEventListener('mouseup',function(e){var p=pos(e),was=drag;drag=null;if(!was||!was.moved)cursorAt(p[0],p[1],true)});
  cv.addEventListener('mouseleave',function(){drag=null;st.off=true;drawStrip()});
  cv.addEventListener('wheel',function(e){var p=pos(e);if(e.preventDefault)e.preventDefault();zoomBy((e.deltaY||0)<0?1.2:1/1.2,p[0],p[1])});
  // double-click zooms in at the pointer, Shift and double-click zooms out
  cv.addEventListener('dblclick',function(e){var p=pos(e);if(e.preventDefault)e.preventDefault();zoomBy(e.shiftKey?0.5:2,p[0],p[1])});
  cv.addEventListener('keydown',function(e){onKey(e)});
 }
 function onKey(e){var k=e.key,step=e.shiftKey?Math.round(Math.min(st.w,st.h)/8):10,c=st.cursor?toScreen(st.view,st.w,st.h,st.cursor[0],st.cursor[1]):[st.w/2,st.h/2],done=true;
  var d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
  if(d){if(e.shiftKey)pan(-d[0]*step,-d[1]*step);else cursorAt(c[0]+d[0]*step,c[1]+d[1]*step,false)}
  else if(k==='+'||k==='=')zoomBy(1.25,c[0],c[1]);else if(k==='-'||k==='_')zoomBy(0.8,c[0],c[1]);else if(k==='0')fit();
  else if(k==='Enter')cursorAt(c[0],c[1],true);else if(k==='Escape'){if(st.tool)useTool(null);else done=pageKey(e)}
  else{var t=toolKey(k);if(t)useTool(st.tool===t?null:t);else done=pageKey(e)}
  if(done&&e.preventDefault)e.preventDefault()}
 // ---- map, mode ----
 function info(){return {key:st.map,mode:st.mode,phase:st.phase,side:st.side,kind:st.kind,doc:V.doc,user:!!(st.map&&st.user)}}
 // closeMap(): the game, its folder or the mod changed (W2): the open map goes, with its modes, document, layer data,
 // tiles, cursor, tool, permalink and every part's map state (the 'map' event with key null)
 function closeMap(){var had=!!st.map;docSeq++;gen++;docBusy=false;st.map=null;st.mode=null;st.phase=null;st.user=false;V.doc=null;hdrs={};tiles={};st.cursor=null;st.keepView=false;
  if(st.tool)useTool(null);if(el.readout)el.readout.textContent='';st.rows=[];drawMapName();drawModes();if(had)say('mapviz.shell.closed');mapChanged()}
 function mapChanged(){drawPhases();drawFirst();drawStrip();layers.forEach(function(l){l.s={}});drawGroups();drawItems();drawLink();redraw();emit('map',info())}
 function drawModes(){var s=el.mode;s.textContent='';var ms=V.q('modes');s.appendChild(h('option',{value:'',text:tx('mapviz.shell.modeNone')}));ms.forEach(function(m){s.appendChild(h('option',{value:m,text:m}))});s.value=st.mode&&ms.indexOf(st.mode)>=0?st.mode:''}
 // the phase select: the phases of the open mode; a picked phase the mode does not hold goes back to null
 function drawPhases(){var s=el.phase,ps=phasesOf(V.doc,st.mode);if(st.phase!=null&&ps.indexOf(st.phase)<0)st.phase=null;if(!s)return;s.textContent='';
  s.appendChild(h('option',{value:'',text:tx('mapviz.shell.phaseFirst')}));ps.forEach(function(p){s.appendChild(h('option',{value:String(p),text:tx('mapviz.shell.phaseN',{n:p})}))});
  s.value=st.phase==null?'':String(st.phase);el.phaseF.hidden=ps.length<2}
 // a mode picked for a map that a context change just closed is dropped with that map; a mode change resets the phase
 function setMode(m){var g0=gen;settle();if(gen!==g0)return;if(m===st.mode)return;st.mode=m;st.phase=null;mapChanged()}
 function setPhase(v){var g0=gen;settle();if(gen!==g0)return;var n=v===''||v==null?null:Number(v);if(n!==null&&(!isFinite(n)||Math.floor(n)!==n))n=null;if(n===st.phase)return;st.phase=n;mapChanged()}
 // a user pick of the map whose document a refresh is reading (S.mapKey, user false: no doc job on a need) reads it again
 // as the user's pick, so an unmade map starts its doc job (the Editor and Maps page open: S.mapKey, show, pick)
 function setMap(key,mode,user,keepView){if(!key)return;key=String(key).replace(/^map\//,'');var same=key===st.map,was=!!st.user;st.map=key;if(mode!==undefined)st.mode=mode||null;else if(!same)st.mode=null;
  if(!same||mode!==undefined)st.phase=null;
  if(!same){V.doc=null;hdrs={};tiles={};gen++;st.user=!!user}else if(user)st.user=true;drawMapName();
  // a map the user picked closes the map picker (the focus goes back to its button when it was in the picker)
  if(user&&st.pick)setPicker(false,inside(activeEl(),el.pick));
  if(own()&&S){S.mapKey='map/'+key;st.skipKey=null}
  var go=(!same||!V.doc)&&!(same&&docBusy&&!(user&&!was));if(go)docBusy=true;if(V.doc)drawModes();mapChanged();if(go)loadDoc(user,keepView)}
 // docBusy: the document of the open map is being read (its GET, or the doc job a user pick started); the layers wait for
 // it (P7) and are drawn, so fetched, once it is there or once it failed. The parts see it as V.q('docBusy') and hold
 // every fetch that carries the mode while it is true; the 'doc' event {key, ok} tells them when the read ended (ok
 // false: it failed or is not made; the map stays open with no mode), after the 'map' event of a document that landed
 function docEnd(ok){docBusy=false;if(!ok){drawItems();redraw()}emit('doc',{key:st.map,ok:!!ok})}
 function loadDoc(user,keepView){var my=++docSeq,key=st.map;docBusy=true;
  vapi('GET','doc',{entities:'0',mode:null,side:null,kind:null}).then(function(d){if(my!==docSeq||key!==st.map)return;docBusy=false;gotDoc(d,keepView);if(my===docSeq)docEnd(true)},function(e){if(my!==docSeq)return;var n=needOf(e);
   if(n&&user){say('mapviz.shell.reading');vjob('doc',{}).then(function(){if(my===docSeq)loadDoc(false,keepView)},function(x){if(my!==docSeq)return;say('mapviz.shell.docFault',{msg:errText(x)});docEnd(false)});return}
   if(n){say('mapviz.shell.docNeed');showDocNeed(keepView);docEnd(false);return}say('mapviz.shell.docFault',{msg:errText(e)});docEnd(false)})}
 function showDocNeed(keepView){var b=h('button',{type:'button',text:tx('mapviz.shell.read'),onclick:function(){if(b.parentNode)b.parentNode.removeChild(b);loadDoc(true,keepView)}});el.say.appendChild(h('span',{text:' '}));el.say.appendChild(b)}
 function gotDoc(d,keepView){V.doc=d;var ms=V.q('modes');if(st.mode&&ms.indexOf(st.mode)<0)st.mode=null;if(!st.mode&&ms.length)st.mode=ms[0];drawModes();say('');
  if(!keepView)fit();mapChanged()}
 // ---- link ----
 function link(){return st.target?linkOf({target:st.target,map:st.map,mode:st.mode,layers:shareable(layers,st.include,GRP),view:st.view}):''}
 function drawLink(){if(el.link){el.link.value=st.target&&st.map?'#go='+encodeURIComponent(link()):'';if(!el.link.value)el.link.hidden=true}}
 // copyLink(): the Copy link button; the page says it was copied, or shows the field selected to copy by hand when the
 // browser has no clipboard (or refuses it)
 function copyLink(){settle();var s=el.link.value;if(!s){say('mapviz.shell.noMap');return}
  var hand=function(){el.link.hidden=false;try{if(el.link.focus)el.link.focus();if(el.link.select)el.link.select()}catch(e){}say('mapviz.shell.copyHand')};
  try{if(typeof navigator!=='undefined'&&navigator&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){el.link.hidden=true;say('mapviz.shell.copied')},hand)}else hand()}catch(e){hand()}}
 // ---- job line, cache line ----
 // jobLine(j) -> the words of one job: what, then waiting / stage / stage and progress
 function jobLine(j){var a={what:whatText(j.what),n:j.queue||0,stage:stageText(j.stage)||tx('mapviz.shell.stage.other'),done:j.done||0,total:j.total||0};
  return j.state==='queued'?tx('mapviz.shell.jobQueued',a):j.total?tx('mapviz.shell.jobRun',a):tx('mapviz.shell.jobStage',a)}
 function drawJobs(){var ids=Object.keys(jobs);if(!ids.length){el.job.textContent=tx('mapviz.shell.jobNone');el.stop.hidden=true}
  else{el.job.textContent=ids.map(function(id){return jobLine(jobs[id])}).join('; ');el.stop.hidden=false}
  // the thin progress bar: the first job that reports done of total
  var pj=null;ids.forEach(function(id){var j=jobs[id];if(!pj&&j&&j.total>0)pj=j});
  if(el.prog){el.prog.hidden=!pj;if(pj){el.prog.max=pj.total;el.prog.value=Math.max(0,Math.min(pj.done||0,pj.total))}}
  layers.forEach(function(l){if(l._ns)needView(l)});drawMakeAll()}
 function stopJobs(){Object.keys(jobs).forEach(function(id){vapi('POST','cancel',{id:id}).then(function(){},function(){})})}
 // loadCache(afterJob): the cache line; a changed answer (entries or bytes) that no page job explains is a recheck too
 function loadCache(afterJob){vapi('GET','cache').then(function(c){var mb=function(b){return Math.round((b||0)/1048576*10)/10};el.cache.textContent=tx('mapviz.shell.cacheIs',{mb:mb(c.bytes),cap:mb(c.cap),n:c.entries||0});
   if(c.root)st.cacheRoot=String(c.root);var cs=(c.entries||0)+'|'+(c.bytes||0),was=st.cacheSig;st.cacheSig=cs;if(!afterJob&&was!==null&&was!==cs)recheck()},function(e){el.cache.textContent=errText(e)})}
 function clearCache(){settle();if(!st.map||!st.target){say('mapviz.shell.noMap');return}
  vapi('POST','cache/clear',{scope:'map',target:st.target,map:st.map}).then(function(r){say('mapviz.shell.cleared',{n:r.removed||0});hdrs={};tiles={};gen++;layers.forEach(function(l){l.s={}});V.doc=null;loadCache(true);drawGroups();redraw()},function(e){say('mapviz.shell.clearFault',{msg:errText(e)})})}
 // ---- theme ----
 if(typeof onTheme==='function')onTheme(function(){layers.forEach(function(l){if(l.s.env)l.s.env._img=null});redraw();emit('theme',{})},'mapviz');
 drawJobs();drawGroups();
 // ---- parts ----
 // curPart: the part whose init runs, so a layer it adds knows its part (click hits carry it)
 (MV.parts||[]).forEach(function(p){if(!p||typeof p.init!=='function')return;curPart=p.id!=null?String(p.id):null;try{p.init(V)}catch(e){say('mapviz.shell.partFault',{part:p.id||'?',msg:e&&e.message||String(e)})}curPart=null});
 gHold=0;flushGroups();
 el.left.appendChild(el.items);drawItems();
 var palBusy=false;
 function loadPal(){if(V.pal||palBusy)return;palBusy=true;vapi('GET','palette').then(function(p){V.pal=p;palBusy=false;layers.forEach(function(l){if(l.s.env)l.s.env._img=null});drawOn();redraw();emit('theme',{})},function(){palBusy=false})}
 // shown or hidden: the GUI refreshes every screen once at start and on each mod or game change, shown or not; show()
 // un-hides the section, sets S.cur and then refreshes it. A hidden Map Viewer reads nothing (no palette, cache, map list
 // or document call, no layer, tile or hover read, no recheck): the first read comes when the screen is shown, and every
 // later show refreshes it again. A refresh while hidden still takes in a change of game, folder or mod: it closes the
 // open map (no read), so a job that ends meanwhile never asks for the old map in the new context
 function hiddenNow(){if(root.hidden)return true;return typeof S!=='undefined'&&!!S&&!!S.sec&&S.sec.mapviz===root&&S.cur!=='mapviz'}
 // refresh(): the game, folder or mod changed since the last refresh: close the open map and do not follow the S.mapKey
 // the old game left (W2); a permalink kept for another game opens once its game is the page's. catchUp() runs it too,
 // the moment a shown page sees its context changed with no refresh yet (the GUI sets the folder before its own refresh)
 function refresh(){var pt=pageTarget(),cx=ctxNow();
   if(hiddenNow()){if(st.ctx!==null&&st.ctx!==cx){st.skipKey=S&&typeof S.mapKey==='string'?S.mapKey:null;st.ctx=cx;st.target=pt;closeMap()}return}
   if(st.ctx!==cx){var had=st.ctx!==null;st.ctx=cx;if(had||st.target!==pt){if(had)st.skipKey=S&&typeof S.mapKey==='string'?S.mapKey:null;st.target=pt;closeMap()}}
   if(st.pend&&st.pend.target===pt){var o=st.pend;st.pend=null;openLink(o)}
   // shown and settled: the reads held while hidden go now (or are dropped when their map was closed); a job that ended
   // done while hidden asks once now
   var due=st.due;st.due=false;release();
   if(!st.target){say('mapviz.shell.noTarget');emit('refresh',{target:null});return}
   loadPal();loadCache(due);if(due)recheck();
   if(own()&&S&&typeof S.mapKey==='string'&&/^map\//.test(S.mapKey)&&S.mapKey!==st.skipKey){var k=S.mapKey.slice(4);if(k&&k!==st.map)setMap(k,undefined,false,false)}
   else if(st.map&&!V.doc&&!docBusy)loadDoc(false,!!st.keepView);
   emit('refresh',{target:st.target});redraw();
   // shown with no map open: the map picker opens by itself (the first step of the hint on the stage)
   if(!st.map&&!st.pick)setPicker(true,true)}
 return {
  refresh:function(){refresh()},
  focus:function(){try{if(st.pick)return;if(st.canvas&&cv.focus)cv.focus()}catch(e){}},
  // keys(e): the GUI hands the shown page every key (tools/gui/page.js); the page's own keys answer here (not a key the
  // canvas had, not while typing in a field) -> true when taken
  keys:function(e){if(!e||(cv&&e.target===cv)||hiddenNow())return false;return pageKey(e)},
  // a permalink opens only in the game it names: for another game it waits, and the page says which game it needs
  view:function(s){var o=parseLink(s);if(!o){say('mapviz.shell.badLink');return}
   if(o.target!==pageTarget()){st.pend=o;say('mapviz.shell.otherGame',{game:tx(GAMEN[o.target])});return}
   st.pend=null;openLink(o)},
  // pick(key, mode?) (page-pg2 S6): another page (the file viewer, the Maps page) opens a map here as the user's pick
  // a pick before the page's first refresh (the viewer never shown yet) takes the page's context in first, so the
  // first refresh does not close it as a map of an old context (it was lost: the bots page opened the viewer empty)
  pick:function(key,mode){if(!key)return;if(st.ctx===null&&!RMT){st.ctx=ctxNow();st.target=pageTarget()}emit('map',{key:String(key),mode:mode,pick:true})},
  go:function(o){return go(o)},
  // flush(): a layer list rebuild that waits for its frame runs now
  flush:function(){flushGroups()},
  V:V};
 // openLink(o): a permalink of the page's own game; a game, folder or mod change not yet refreshed closes the old map first
 function openLink(o){var cx=ctxNow();if(st.target!==o.target||st.ctx!==cx){var old=st.ctx!==null&&st.ctx!==cx;st.ctx=cx;st.target=o.target;if(st.map&&old)closeMap()}
  if(o.layers){PENDL={};o.layers.forEach(function(id){PENDL[id]=true});layers.forEach(function(l){if(!l.tool)l.on=!!PENDL[l.id];l.s.want=false})}
  if(o.view)setView(o.view,true);st.keepView=!!o.view;
  // the short deep link (layers null) comes from a button another page's user pressed: it opens as the user's pick (an
  // unmade map document starts its read job, as a pick from the list does)
  if(o.map){st.map=null;setMap(o.map,o.mode,!o.layers,!!o.view)}drawGroups()}
};
MV.parts=[];
MV.keys=KEYS;
MV.kit={colour:colour,colourCss:colourCss,b64:b64,decode:decode,gridDraw:gridDraw,vectorDraw:vectorDraw,toScreen:toScreen,toWorld:toWorld,tileBox:tileBox};
MV._t={toScreen:toScreen,toWorld:toWorld,zoomAt:zoomAt,fitBox:fitBox,pickZ:pickZ,tileRect:tileRect,tileBox:tileBox,tileList:tileList,linkOf:linkOf,parseLink:parseLink,shareable:shareable,b64:b64,decode:decode,colour:colour,GROUPS:GROUPS,DRAW:DRAW,PRIVATE:PRIVATE,REGROUP:REGROUP,regroup:regroup,VIEWS:VIEWS,MARKS:MARKS,viewSet:viewSet,filterHit:filterHit,MK_T:MK_T,MK_E:MK_E,
 WHATS:WHATS,STAGES:STAGES,ITEMS:ITEMS,FAULTS:FAULTS,stageText:stageText,phasesOf:phasesOf,tagHit:tagHit,QCOM:QCOM,PHQ:PHQ,JOBF:JOBF,KEYF:KEYF,
 TABS:TABS,TABOF:TABOF,placeOf:placeOf,scaleBar:scaleBar,stripText:stripText,typing:typing,offBox:offBox,UPM:UPM};
})();
`;
