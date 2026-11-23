// browser side of the bots part "mission" (group E, Map scripts for AI). Page rules: no backtick, no dollar-brace, DOM only through h()
// and textContent. Page standards S1-S16: names and places picked (list or the map), never typed; technical
// text only under Details; plain preview first; after Write a green box saying which mode and map to start and what to watch, with Undo;
// shared button words (Preview, Write into my mod, Undo). GoH: read only (RO): map, mode, places, start areas and this page's additions are
// shown; the recipes, Preview / Write / Undo and Remove give way to one kit.na line (why, use) (the server refuses add/remove/undo there).
//   bots.mission.orders  first: map + mode (modes bots cannot play marked, combat refused), five recipes (each one plain sentence of effect;
//                        fields, More options with typed coordinates, Details with the source), Preview / Write / Undo, result, additions
//   bots.mission.teams   last, folded into Details: how the page finds each team's bot (start areas)
// Modes: GET modeready/botmodes when that route answers, else the facts' own reading (modeInfo). Places: the map's flags, start points,
// zones and points with a direction word ("flag F1 (north-west)"); "Pick on the map" opens MAPVIZ_PICK when the Map Viewer is loaded.
// MEM (outside draw) keeps the map, mode and the open Undo across redraws: after Undo every list is read again (BOTS_UI.changed).
// Server: parts/mission/index.js (routes mission/maps, facts, units, add, remove, undo). Errors "key {json}" are worded here, the field
// named by its label (S12).
// Author: Imperator_Aug (ARSENAL, ia-b3bfa34f)
module.exports = String.raw`
var MEM={map:'',name:'',from:'',mode:'',modeUser:false,undo:null,flash:''};
BOTS_PARTS.push({id:'mission',group:'E',order:10,title:function(){return tx('bots.mission.title')},draw:function(env){
 var K=env.kit,sec=K.section,leaf=K.leaf,hint=K.hint,errBox=K.errBox,hitsOf=K.hitsOf;
 var P='bots.mission.',C1='bots.mission.teams',C2='bots.mission.orders';
 function raw(k,p){return tx(P+k,p||{})}
 // one name per game, the frame's (kit.game) when it has it
 function gameWord(g){if(typeof K.game==='function'){try{var s=K.game(g);if(s&&typeof s==='string')return s}catch(e){}}return g==='goh'?'Gates of Hell':g==='mowas2'?'Men of War: Assault Squad 2':'AS64'}
 // the one fold label of the exact file change (bots.showChange), this part's own words when the frame has none
 function showChange(){var s=tx('bots.showChange');return s==='bots.showChange'?t('add.exact'):s}
 // "Undone: <what>." where the green box was: the frame's sentence (kit.undone) when it has it. full = this part's whole sentence
 function undoneEl(what,full){var el=null;if(typeof K.undone==='function'){try{el=K.undone(what)}catch(e){el=null}}
  if(typeof el==='string')el=h('div',{class:'ok',role:'status','data-undone':'1',text:el});
  return el||h('div',{class:'ok',role:'status','data-undone':'1',text:full})}
 // an empty list or search: the frame's "Nothing found. Try <hint>." row (kit.none) when it has it
 function noneEl(hint,full){var el=null;if(typeof K.none==='function'){try{el=K.none(hint)}catch(e){el=null}}
  if(typeof el==='string')el=h('div',{class:'hint','data-none':'1',text:el});return el||h('div',{class:'hint','data-none':'1',text:full})}
 // every text: the button and block names filled in from their own keys, so an instruction names them exactly (S14)
 var AUTO=null;
 function auto(){if(!AUTO)AUTO={prev:tx('bots.btn.preview'),write:tx('bots.btn.write'),undo:tx('bots.btn.undo'),more:tx('bots.more'),details:tx('bots.details'),
  remove:raw('mine.rm'),added:raw('mine.blk'),orders:raw('orders.h'),goh:gameWord('goh'),as2:gameWord('mowas2'),g64:gameWord('as64'),onmap:raw('place.onMap'),modeready:tx('bots.modeready.title'),botmatch:raw('done.try'),crew:raw('c.crew'),etitle:raw('e.title')};return AUTO}
 function t(k,p){var q={},a=auto();Object.keys(a).forEach(function(x){q[x]=a[x]});Object.keys(p||{}).forEach(function(x){q[x]=p[x]});return tx(P+k,q)}
 // plurals: key.one / .few / .many / .other (ru, uk all four; en one + other; zh other)
 function plForm(n){var x=Math.abs(Number(n)),l=typeof LANG!=='undefined'?String(LANG):'en';if(l==='zh')return 'other';
  if(l==='ru'||l==='uk'){if(x%1)return 'other';var a=x%10,b=x%100;return a===1&&b!==11?'one':a>=2&&a<=4&&(b<12||b>14)?'few':'many'}return x===1?'one':'other'}
 function pl(w,n){var k=P+'n.'+w+'.'+plForm(n),s=tx(k,{n:n});return s===k?tx(P+'n.'+w+'.other',{n:n}):s}
 function say(x){var s=String(x||'');return /^[a-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(s)?tx(s):s}
 function ask(title,lines,danger,cb){(typeof askDo==='function'?askDo({title:title,lines:lines,where:env.mod,ok:title,danger:!!danger}):{then:function(f){f(confirm(lines.join(' ')))}}).then(function(yes){if(yes)cb()},function(){})}
 function fold(id,label,kids){return h('details',{blk:id,'data-blkname':label},[h('summary',{class:'hint',text:label})].concat(kids))}
 function details(id,kids){if(typeof K.details==='function'){try{var d=K.details(id,kids);if(d)return d}catch(e){}}return fold(id,tx('bots.details'),kids)}
 function more(id,kids){if(typeof K.more==='function'){try{var d=K.more(id,kids);if(d)return d}catch(e){}}return fold(id,tx('bots.more'),kids)}
 // S15: Not available in <game> + why + what to use instead; kit.na takes the block id and the text (an object for the one pattern)
 function na(id,o){if(typeof K.na==='function'){try{var n=K.na(id,o);if(n)return n}catch(e){}}
  var s=typeof o==='object'?o.why+' '+o.use:String(o);return leaf(id,[h('div',{class:'hint','aria-disabled':'true',style:'opacity:.75',text:s})])}
 function attach(inp,o){if(typeof K.pick==='function')return K.pick(inp,o);
  var go=function(){if(!inp.parentNode||typeof searchKit!=='function')return false;searchKit(inp,o);return true};if(!go())Promise.resolve().then(go)}
 function rows(list){if(typeof K.rows==='function'){try{var r=K.rows(list,{show:8});if(r)return r}catch(e){}}
  var ul=h('ul',{},list),wrap=h('div',{},[ul]);if(list.length<=8)return wrap;var open=false,b=h('button',{type:'button',class:'linkish'});
  function set(){list.forEach(function(x,i){x.hidden=!open&&i>=8});b.textContent=open?tx('bots.rows.fewer'):tx('bots.rows.all',{n:list.length})}
  b.addEventListener('click',function(){open=!open;set()});set();wrap.appendChild(b);return wrap}
 var GOH={why:t('goh.why'),use:t('goh.use'),game:gameWord('goh')};
 var RO=env.gid==='goh';
 // no mod: the frame's one line with its button to the Mods page (kit.needMod), else this part's own words
 function needMod(id){if(typeof K.needMod==='function'){try{var n=K.needMod(id);if(n)return n}catch(e){}}return hint(id,t('needmod'))}
 if(!env.mod)return [sec(C2,t('orders.h'),[needMod(C2+'.nomod')]),sec(C1,t('teams.h'),[needMod(C1+'.nomod')])];
 if(MEM.undo&&MEM.undo.mod!==env.mod)MEM.undo=null;
 var ST={map:'',name:'',from:'',mode:'',facts:null,err:'',busy:false,subs:[]};
 function notify(){ST.subs.forEach(function(f){try{f()}catch(e){try{console.warn('bots mission',e)}catch(x){}}})}
 function setMap(map,from,mode,name){ST.map=String(map||'').trim();ST.from=from||'';ST.mode=mode||'';if(name!=null)ST.name=name;ST.facts=null;ST.err='';
  MEM.map=ST.map;MEM.from=ST.from;MEM.mode=ST.mode;MEM.name=ST.name;
  if(!ST.map){notify();return}
  ST.busy=true;notify();var want=ST.map+'|'+ST.mode;
  env.api('GET','mission/facts',{map:ST.map,mode:ST.mode,from:ST.from},function(e,r,x){if(want!==ST.map+'|'+ST.mode)return;ST.busy=false;
   if(e){ST.err=errText(e,x);notify();return}ST.facts=r;ST.mode=r.mode||'';MEM.mode=ST.mode;notify();switchMode()})}
 // a mode by its name (S20: never the code): the Bots page's answer, else the stock names here, else the code made readable
 function modeWord(m){var r=BM&&BM.modes.filter(function(x){return x&&x.mode===m})[0];if(r&&r.name)return String(r.name);
  var k=P+'mode.name.'+String(m||''),s=tx(k);if(s!==k)return s;m=String(m||'').replace(/_/g,' ');return m.charAt(0).toUpperCase()+m.slice(1)}
 // a server refusal "key {json}" (or {key, params}) in words: the field by its label, the mode by its name, the unit by its in-game name
 function label(f){f=String(f);return f==='c.count'?t('c.countAny'):t(f)}
 function errText(s,x){var key='',p={};
  if(x&&typeof x==='object'&&x.key){key=String(x.key);p=x.params||{}}
  else{var m=/^(bots\.[A-Za-z0-9_.]+|[a-z]+\.e\.[A-Za-z0-9_.]+)(?:\s+(\{.*\}))?\s*$/.exec(String((x&&x.message)||s||''));if(m){key=m[1];if(m[2]){try{p=JSON.parse(m[2])||{}}catch(y){p={}}}}}
  if(!key)return say(s||(x&&x.message)||'');
  var q={};Object.keys(p).forEach(function(k){q[k]=p[k]});
  if(q.f!=null)q.f=label(q.f);if(q.mode!=null)q.mode=modeWord(q.mode);if(q.v!=null)q.v=unitWord(q.v);
  return key.indexOf(P)===0?t(key.slice(P.length),q):tx(key,q)}
 // ---- can bots play each mode: the Bots page's own answer (modeready/botmodes) when it is there, else what the facts read (S16)
 var BM=null;
 function loadBM(){try{env.api('GET','modeready/botmodes',{},function(e,r){if(e||!r||!Array.isArray(r.modes))return;BM=r;notifyMode();switchMode()})}catch(e){}}
 function joinOf(m){if(BM){var r=BM.modes.filter(function(x){return x&&x.mode===m})[0],play=Array.isArray(BM.play)?BM.play:null;
   if(r)return r.orders===false?{join:false,why:'combat'}:(play?play.indexOf(m)>=0:r.bots)?{join:true,why:'ok'}:{join:false,why:'off'}}
  var i=ST.facts&&ST.facts.modeInfo&&ST.facts.modeInfo[m];return i&&i.why?i:{join:null,why:'unknown'}}
 // the mode the page opens with is one bots can play; a mode the user picked is kept
 function switchMode(){if(MEM.modeUser||!ST.facts||ST.busy)return;if(joinOf(ST.mode).join===true)return;
  var ms=ST.facts.modes||[],ok=BM&&BM.best&&ms.indexOf(BM.best)>=0&&joinOf(BM.best).join===true?BM.best:ms.filter(function(m){return joinOf(m).join===true})[0];if(ok&&ok!==ST.mode)setMap(ST.map,ST.from,ok)}
 var modeSubs=[];function notifyMode(){modeSubs.forEach(function(f){try{f()}catch(e){}})}
 // ---- the map list (the Maps page's list job; asked again every 2 s while it runs): names as the game shows them, only maps with a mission
 var MAPS={items:null,wait:[],busy:false,err:''};
 function mapItems(cb){if(MAPS.items){cb(MAPS.items);return}MAPS.wait.push(cb);if(MAPS.busy)return;MAPS.busy=true;var tries=0;
  (function go(){env.api('GET','mission/maps',{},function(e,r,x){
   if(!e&&r&&r.state==='running'&&tries++<150){if(typeof pollLater==='function')pollLater(env.page,go,2000);else setTimeout(go,2000);return}   // waits while this page or the window is hidden
   MAPS.busy=false;MAPS.err=e?errText(e,x):(r&&r.state!=='done'?say(r.error||''):'');
   MAPS.other=(!e&&r&&r.other)||0;
   MAPS.items=((!e&&r&&r.maps)||[]).map(function(m){return {label:m.name||m.folder,value:m.key,folder:String(m.folder||'').toLowerCase(),m:m,hint:'',from:m.mods||'',
    lo:String(m.words||((m.name||'')+' '+m.folder+' '+String(m.folder||'').replace(/_/g,' '))).toLowerCase()}});
   var w=MAPS.wait,got=MAPS.items;MAPS.wait=[];if(MAPS.err)MAPS.items=null;w.forEach(function(f){f(got)})},tries?{job:false}:undefined)})()}   // JOBS: a re-ask while the list is read is a poll, not a job
 // the small line under a map name: folder, modes by name (worded when shown, so the Bots page's names are used once they are in)
 function mapHint(x){var m=x.m||{};return m.folder+' · '+(m.modes||[]).map(modeWord).join(', ')+(m.players?' · '+pl('players',m.players):'')+(m.mine?' · '+t('pick.mine'):'')}
 // the map box search: every word typed must be in the map's name (as the game or the mod shows it) or its folder, any order
 function mapHits(a,s){var ws=String(s||'').toLowerCase().replace(/_/g,' ').split(/\s+/).filter(Boolean);
  return (a||[]).filter(function(x){var lo=x.lo+' '+x.lo.replace(/_/g,' ');return ws.every(function(w){return lo.indexOf(w)>=0})}).map(function(x){x.hint=mapHint(x);return x})}
 function gidOf(){return env.gid||'as64'}
 function vkey(){return String(ST.map||'').replace(/^map\//,'')}
 // the Map Viewer on this map and mode (its deep link: page:mapviz/<game>~<map key without map/>~<mode>)
 function viewer(){if(typeof show==='function')show('mapviz','page:mapviz/'+gidOf()+'~'+vkey()+'~'+(ST.mode||''))}
 // ---- the map + mode picker
 function picker(id){
  var inp=h('input',{type:'text',autocomplete:'off','aria-label':t('pick.map'),placeholder:t('pick.mapHint')});
  var sel=h('select',{'aria-label':t('pick.mode')}),note=h('div',{class:'hint'}),folder=h('div',{class:'hint',style:'font-size:smaller'}),bmode='';
  var vb=h('button',{type:'button',text:t('place.viewer'),onclick:viewer});vb.disabled=true;
  var row=h('div',{class:'row'},[h('label',{text:t('pick.map')}),inp,h('label',{text:t('pick.mode')}),sel,vb]);
  function listNote(a){note.textContent=MAPS.busy?t('loading.maps'):MAPS.err?t('pick.noList',{why:MAPS.err}):a&&!a.length?t('pick.emptyList'):''}
  // nothing found: say so with what to try (part of the name, the folder, Browse), and that maps of other mods are not listed
  function noHit(s){var v=String(s||'').trim();if(!v)return;note.textContent=t('pick.noHit',{v:v})+(MAPS.other?' '+t('pick.otherMods',{maps:pl('maps',MAPS.other)}):'')}
  attach(inp,{key:'bots.mission.map',index:function(s,done){listNote(MAPS.items);mapItems(function(a){listNote(a);var hit=mapHits(a,s);
    if(a&&a.length&&!hit.length)noHit(s);done(hit.slice(0,30),Math.max(0,hit.length-30))})},
   browse:{mode:'file',view:'data',start:'map/multi',exts:['mi'],toValue:function(p){var g=String(p||'').replace(/\\/g,'/').replace(/^resource\//i,'');var m=/^(map\/.+)\/([A-Za-z0-9_]+)\.mi$/i.exec(g);if(!m)return '';bmode=m[2].toLowerCase();return m[1].toLowerCase()}},
   onPick:function(v,it,from){var nm=(it&&it.label)||String(v).split('/').pop();inp.value=nm;note.textContent='';MEM.modeUser=from==='browse';setMap(v,from==='browse'?'':(it&&it.from)||'',from==='browse'?bmode:'',nm)}});
  // a typed name counts when it is one map of the list: its name as the game shows it, its folder, or the only name that starts so
  inp.addEventListener('change',function(){var v=inp.value.trim().toLowerCase().replace(/\s+/g,' ');if(!v||v===String(ST.name).toLowerCase())return;
   note.textContent=t('loading.maps');
   mapItems(function(a){if(MAPS.err||!a||!a.length){listNote(a);return}
    function one(f){var x=a.filter(f);return x.length===1?x[0]:x.length?x:null}
    var lo=function(x){return x.label.toLowerCase().replace(/\s+/g,' ')};
    var hit=one(function(x){return lo(x)===v||x.folder===v||x.value===v});
    if(!hit||hit.length)hit=one(function(x){return lo(x).indexOf(v)===0})||hit;
    if(!hit){var ws=mapHits(a,v);hit=ws.length===1?ws[0]:ws.length?ws:null}
    if(hit&&!hit.length){inp.value=hit.label;note.textContent='';MEM.modeUser=false;setMap(hit.value,hit.from,'',hit.label);return}
    if(hit&&hit.length){note.textContent=t('pick.several',{maps:pl('maps',hit.length),v:inp.value.trim()});return}
    noHit(inp.value)})});
  sel.addEventListener('change',function(){if(sel.value!==ST.mode){MEM.modeUser=true;setMap(ST.map,ST.from,sel.value)}});
  function modes(){sel.textContent='';((ST.facts&&ST.facts.modes)||[]).forEach(function(m){var j=joinOf(m);
    sel.appendChild(h('option',{value:m,text:j.join===false?t('mode.marked',{m:modeWord(m),mark:t(j.why==='combat'?'mode.mark.no':'mode.mark.off')}):modeWord(m)}))});
   sel.value=ST.mode;sel.disabled=!ST.facts}
  modeSubs.push(modes);
  ST.subs.push(function(){if(ST.map&&inp.value.trim()!==ST.name)inp.value=ST.name||ST.map;
   folder.textContent=ST.map?t('pick.folder',{f:vkey()}):'';vb.disabled=!ST.map;modes()});
  var fdet=details(null,[folder]);fdet.hidden=true;ST.subs.push(function(){fdet.hidden=!ST.map});
  return leaf(id,[row,note,fdet],t('pick.blk'))}
 // the line under the mode: refused (no flags) or warned (bots switched off), with the card that turns bots on
 var modeBox=h('div');
 function modeNote(){modeBox.textContent='';if(!ST.facts||ST.facts.none)return;var j=joinOf(ST.mode),m=modeWord(ST.mode);
  if(j.why==='combat'){modeBox.appendChild(errBox(t('mode.combatNo',{mode:m})));return}
  if(j.why==='off')modeBox.appendChild(h('div',{class:'err'},[h('span',{text:t('mode.offWarn',{mode:m})+' '}),RO?null:h('button',{type:'button',text:tx('bots.modeready.title'),onclick:function(){env.go('bots.modeready')}})]))}
 modeSubs.push(function(){modeNote();if(ST.facts&&!ST.busy&&(joinOf(ST.mode).why==='combat')!==drawnCombat)drawRecipes()});
 function state(box){box.textContent='';
  if(!ST.map){box.appendChild(h('div',{class:'hint',text:t('pick.first')}));
   ['c','a','b','e','d'].forEach(function(r){box.appendChild(h('div',{style:'margin:4px 0'},[h('b',{text:t(r+'.title')}),h('div',{class:'hint',text:t(r+'.does')})]))});return false}
  if(ST.busy){box.appendChild(typeof K.wait==='function'?K.wait(null,t('loading.map')):h('div',{class:'hint',text:t('loading.map')}));return false}
  if(ST.err){box.appendChild(errBox(ST.err));return false}
  if(!ST.facts)return false;
  if(ST.facts.none){box.appendChild(errBox(say(ST.facts.none)));return false}
  return true}
 // ---- places: the map's flags, start points, other points, zones and points, each with where it lies on the map
 var UPM=20;function metres(u){return String(Math.round(Number(u)/UPM*10)/10)}
 function units(m){var x=Number(String(m).replace(',','.'));return String(m).trim()===''||!isFinite(x)?'':String(Math.round(x*UPM*10)/10)}
 var PLC=null;
 // a place name for people: flag "f2" = 2, start "b1" = B1, "zone_mid" = Zone mid (the name of the map file is the hover text)
 function nice(n,kind){n=String(n||'');var m=/^[A-Za-z]{0,6}[_-]?0*(\d+)$/.exec(n);if(kind==='flag'&&m)return m[1];if(kind==='start'&&/^[A-Za-z]\d+$/.test(n))return n.toUpperCase();
  var w=n.replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();if(kind==='zone')w=w.replace(/^(zone|area)\s+(?=\S)/i,'');if(kind==='waypoint')w=w.replace(/^(waypoint|point|wp)\s+(?=\S)/i,'');return w||n}
 function places(){if(PLC&&PLC.f===ST.facts)return PLC.list;var f=ST.facts,pl0=(f&&f.places)||{},out=[],seen={};
  function add(p){if(seen[p.id]||!isFinite(p.x)||!isFinite(p.y))return;seen[p.id]=1;out.push(p)}
  (pl0.mapPoints||[]).forEach(function(p){if(p.name)add({id:'mappoint|'+p.name,kind:p.kind==='start'?'start':p.kind==='flag'?'flag':'point',name:p.name,team:String(p.team||''),x:Number(p.x),y:Number(p.y)})});
  (pl0.zones||[]).forEach(function(z){add({id:'zone|'+z.name,kind:'zone',name:z.name,x:Number(z.x),y:Number(z.y),r:Number(z.r)||0})});
  (pl0.waypoints||[]).forEach(function(w){add({id:'waypoint|'+w.name,kind:'waypoint',name:w.name,x:Number(w.x),y:Number(w.y),r:Number(w.r)||0})});
  var x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;out.forEach(function(p){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)});
  out.forEach(function(p){var nx=x1>x0?(p.x-x0)/(x1-x0):.5,ny=y1>y0?(p.y-y0)/(y1-y0):.5,d=(ny>2/3?'n':ny<1/3?'s':'')+(nx>2/3?'e':nx<1/3?'w':''),nm=nice(p.name,p.kind);
   var base=p.kind==='flag'?t('place.flag',{n:nm}):p.kind==='start'?t('place.start',{n:nm,team:p.team.toUpperCase()}):p.kind==='zone'?t('place.zone',{n:nm}):p.kind==='waypoint'?t('place.wp',{n:nm}):nm;
   p.dir=t('dir.'+(d||'c'));p.label=t('place.withDir',{p:base,d:p.dir});p.short=p.kind==='start'?t('place.withDir',{p:t('place.startShort',{n:nm}),d:p.dir}):p.label;p.code=t('place.code',{n:p.name})});
  PLC={f:f,list:out};return out}
 function placeWord(s){s=String(s||'');var i=s.indexOf(':'),k=s.slice(0,i),n=s.slice(i+1);
  if(k==='xy'){var xy=n.split(' ');return t('place.xyw',{x:metres(xy[0]),y:metres(xy[1])})}
  var hit=places().filter(function(p){return p.id===k+'|'+n})[0];return hit?hit.label:n}
 function MVP(){if(typeof MAPVIZ_PICK!=='undefined'&&MAPVIZ_PICK&&typeof MAPVIZ_PICK.open==='function')return MAPVIZ_PICK;
  if(typeof window!=='undefined'&&window&&window.MAPVIZ_PICK&&typeof window.MAPVIZ_PICK.open==='function')return window.MAPVIZ_PICK;return null}
 var UX=null,UXW=[];
 function unitList(cb){if(UX){cb(UX);return}UXW.push(cb);if(UXW.length>1)return;
  env.api('GET','mission/units',{},function(e,r){UX=((!e&&r&&r.units)||[]).map(function(u){var an=(u.armyNames||u.armies||[]).join(', ');return {label:u.name||u.unit,value:u.unit,hint:an+(u.name?' · '+u.unit:''),lo:((u.name||'')+' '+u.unit+' '+an).toLowerCase()}});
   var w=UXW;UXW=[];w.forEach(function(f){f(UX)})})}
 function unitWord(u){var hit=(UX||[]).filter(function(x){return x.value===u})[0];return hit?hit.label:u}
 var ARMY={eng:1,ger:1,ger2:1,jap:1,rus:1,usa:1};
 function armyWord(a){a=String(a||'').toLowerCase();if(a&&typeof K.army==='function'){try{var s=K.army(a);if(s&&typeof s==='string'&&s!==a)return s}catch(e){}}return ARMY[a]?t('army.'+a):t('army.other')}
 function sentence(r,p){p=p||{};var q={};Object.keys(p).forEach(function(k){q[k]=p[k]});
  if(q.who)q.who=t('who.'+q.who);['to','at','then'].forEach(function(k){if(q[k])q[k]=placeWord(q[k])});
  if(q.unit)q.unit=unitWord(q.unit);
  if(q.units)q.units=String(q.units).split(', ').map(function(x){var m=/^(\d+)x (.+)$/.exec(x);return m?m[1]+' × '+unitWord(m[2]):x}).join(', ');
  if(r==='d')q.shells=pl('shells',Number(p.shells)||0);if(r==='e')q.men=pl('soldiers',Number(p.n)||0);
  var s=t(r+'.say',q);if(r==='a'&&Number(p.every))s+=' '+t('a.sayRep',q);if(r==='b'&&Number(p.every))s+=' '+t('b.sayRep',q);
  if(r==='c')s+=' '+(Number(p.crew)?t('c.sayCrew',{men:pl('men',Number(p.crew))}):t('c.sayEmpty'));if(r==='c'&&p.then)s+=' '+t('c.sayThen',q);return s}
 // the crew each kind of vehicle gets: the men of its own army (the server's answer)
 function crewLines(x){return (x.crew||[]).map(function(g){return t('c.sayCrewOf',{units:(g.units||[]).map(unitWord).join(', '),men:pl('men',Number(x.p&&x.p.crew)||0),army:g.armyName||armyWord(g.army)})})}
 // the exact file change: lines taken out first, then lines put in (- / +)
 function diffBox(id,lead,gone,put){function ls(s,m){return String(s||'').split('\n').filter(function(l){return l.replace(/\r$/,'')!==''}).map(function(l){return m+' '+l.replace(/\r$/,'')}).join('\n')}
  var g=ls(gone,'-'),p=ls(put,'+'),pre={style:'max-height:22em;overflow:auto;white-space:pre'};
  return fold(id,showChange(),[h('div',{class:'hint',text:lead}),h('div',{class:'hint',text:t('diff.removed')}),g?h('pre',Object.assign({text:g},pre)):h('div',{class:'hint',text:t('diff.none')}),
   h('div',{class:'hint',text:t('diff.added')}),p?h('pre',Object.assign({text:p},pre)):h('div',{class:'hint',text:t('diff.none')})])}

 // ==== card "orders": give the bot orders on one map
 var b2=h('div'),res=h('div'),mine=h('div'),rot=h('div');
 var last=null,form={};
 var bPrev=h('button',{type:'button',class:'primary',text:tx('bots.btn.preview'),onclick:function(){run(false)}});
 var bGo=h('button',{type:'button',text:tx('bots.btn.write'),onclick:function(){var it=items();if(!it.length)return;
  ask(tx('bots.btn.write'),[t('add.ask',{changes:pl('changes',it.length),map:ST.name||ST.map})].concat(last&&last.lines?last.lines:[],[ST.facts&&ST.facts.own?t('add.into'):t('add.copies')]),false,function(){run(true)})}});
 var bUndo=h('button',{type:'button',text:tx('bots.btn.undo'),onclick:function(){doUndo()}});
 bGo.disabled=true;
 function undoState(){var u=MEM.undo;bUndo.disabled=!(u&&u.map===ST.map&&u.mode===ST.mode);bUndo.title=bUndo.disabled?t('undo.nothing'):''}
 function dirty(){last=null;bGo.disabled=true;showRot()}
 function watch(el){el.addEventListener('input',dirty);el.addEventListener('change',dirty);return el}
 function num(aria,v,size){return watch(h('input',{type:'text',value:String(v),size:String(size||5),inputmode:'decimal',autocomplete:'off','aria-label':aria}))}
 // the word after a number box follows the number typed (S20): 1 second, 2 seconds; ru/uk 1 секунда, 2 секунды, 5 секунд
 function after(inp,w){var sp=h('span',{class:'hint'});function set(){var x=String(inp.value==null?'':inp.value).trim(),v=Number(x.replace(',','.')),k=P+'u.'+w+'.'+(x!==''&&isFinite(v)?plForm(v):'other'),s=tx(k);
  sp.textContent=' '+(s===k?tx(P+'u.'+w+'.other'):s)}inp.addEventListener('input',set);inp.addEventListener('change',set);set();return h('span',{},[inp,sp])}
 function fld(label,kids){return h('div',{class:'row'},[h('label',{text:label})].concat(kids))}
 function rotS(){var r=(ST.facts&&ST.facts.rotation)||{};return r.ms?Math.round(r.ms/1000):180}
 function whoSel(both){var s=watch(h('select',{'aria-label':t('who')}));['a','b'].concat(both?['ab']:[]).forEach(function(w){s.appendChild(h('option',{value:w,text:t('whoSel.'+w)}))});s.value='b';return s}
 function firstOf(kind,team){var p=places().filter(function(x){return x.kind===kind&&(!team||x.team===team)})[0];return p?p.id:''}
 // a place field: the list (with a default that works), "Pick on the map" beside it, typed coordinates only under More options
 function placeSel(f,opt){opt=opt||{};var aria=t(f),PL=places(),s=watch(h('select',{'aria-label':aria})),user=false,vals={'':1};
  s.appendChild(h('option',{value:'',text:t(opt.none?'place.none':'place.choose')}));
  function grp(label,kind){var list=PL.filter(function(p){return p.kind===kind});if(!list.length)return;
   s.appendChild(h('optgroup',{label:label},list.map(function(p){vals[p.id]=1;return h('option',{value:p.id,text:p.label,title:p.code})})))}
  grp(t('place.flags'),'flag');grp(t('place.starts'),'start');grp(t('place.others'),'point');grp(t('place.zones'),'zone');grp(t('place.waypoints'),'waypoint');
  var spots=null;
  function has(v){return !!vals[v]}
  function def(){if(user)return;var v=opt.def?opt.def():'';if(v&&has(v))s.value=v}
  s.addEventListener('change',function(){user=true});
  var x=num(t('place.x'),'',8),y=num(t('place.y'),'',8),tn=h('div',{class:'hint',text:t('place.typedNote',{f:aria})});
  function typed(){return String(x.value).trim()!==''||String(y.value).trim()!==''}
  function syncT(){tn.hidden=!typed()}[x,y].forEach(function(el){el.addEventListener('input',syncT);el.addEventListener('change',syncT)});syncT();
  var xy=h('div',{},[h('div',{class:'hint',text:t('place.typedH',{f:aria})}),h('div',{class:'row'},[h('label',{text:t('place.x')}),x,h('label',{text:t('place.y')}),y]),
   h('div',{class:'hint'},[h('span',{text:t('place.viewerHint')+(MVP()?' '+t('place.easier'):'')+' '}),h('button',{type:'button',text:t('place.viewer'),onclick:viewer})])]);
  // the Map Viewer's place picker: a mark of the list picks that place, any other click a spot (map units, metres shown). It answers null
  // (closed, or a spot outside the playable area it refused itself) or {inside: false}: the list stays as it was, one plain line says so
  var pn=h('div',{class:'hint',role:'status'});pn.hidden=true;
  function took(r){pn.hidden=true;if(!r||r.inside===false){pn.textContent=t('place.notPicked');pn.hidden=false;return}var pid=r.place&&r.place.id!=null?String(r.place.id):'',hit=PL.filter(function(p){return p.id===pid})[0];
   if(!hit&&r.place)hit=PL.filter(function(p){return Math.abs(p.x-Number(r.place.x))<1&&Math.abs(p.y-Number(r.place.y))<1})[0];
   x.value='';y.value='';syncT();user=true;
   if(hit)s.value=hit.id;
   else{var ux=Math.round(Number(r.x)*10)/10,uy=Math.round(Number(r.y)*10)/10;if(!isFinite(ux)||!isFinite(uy))return;var v='xy|'+ux+' '+uy;
    s.hidden=false;if(!has(v)){if(!spots){spots=h('optgroup',{label:t('place.spots')});s.appendChild(spots)}spots.appendChild(h('option',{value:v,text:t('place.xyw',{x:metres(ux),y:metres(uy)})}));vals[v]=1}
    s.value=v}
   dirty()}
  var mp=MVP(),mb=mp?h('button',{type:'button',text:t('place.onMap'),onclick:function(){var M=MVP();if(!M)return;
   try{M.open({target:gidOf(),gameId:gidOf(),game:gidOf(),mod:env.mod,modDir:env.mod,map:vkey(),mission:ST.mode,title:t('place.onMapTitle',{f:aria}),
    places:PL.map(function(p){var o={id:p.id,label:p.label,x:p.x,y:p.y,kind:p.kind};if(p.r)o.r=p.r;return o}),onPick:took})}catch(e){try{console.warn('MAPVIZ_PICK',e)}catch(z){}}}}):null;
  def();
  // a map whose mission file names no flag, start point, area or point for this mode: one plain line, then the map picker (or coordinates)
  if(!PL.length)s.hidden=true;var empty=PL.length?null:h('div',{class:'hint',text:t(mp?'place.noneOnMap':'place.noneTyped',{mode:modeWord(ST.mode),map:ST.name||ST.map})});
  return {el:h('span',{},[s,mb?' ':null,mb,empty,pn]),xy:xy,note:tn,def:def,
   get:function(){if(typed())return {kind:'xy',x:units(x.value),y:units(y.value)};var v=s.value;if(!v)return null;var i=v.indexOf('|'),k=v.slice(0,i),n=v.slice(i+1);
    if(k==='xy'){var a=n.split(' ');return {kind:'xy',x:a[0],y:a[1]}}return {kind:k,name:n}},
   check:function(){var g=this.get();if(!g)return opt.none?'':errText('',{key:P+'e.noplace',params:{f:f}});
    if(g.kind==='xy'&&(g.x===''||g.y===''))return errText('',{key:P+'e.noxy',params:{f:f}});return ''}}}
 // a unit box: searchKit over the buy lists with in-game names (attached once the input sits in its span)
 function unitBox(aria,key){var inp=watch(h('input',{type:'text',autocomplete:'off',size:'24','aria-label':aria,placeholder:t('unit.hint')})),picked={label:'',value:''};
  var nb=h('span'),wrap=h('span',{},[inp,nb]);
  attach(inp,{key:key,index:function(s,done){unitList(function(a){hitsOf(a,s,function(hit,more){nb.textContent='';if(String(s||'').trim()&&!hit.length)nb.appendChild(noneEl(t('unit.noneHint'),t('unit.none')));done(hit,more)})})},
   browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p){var g=String(p||'').replace(/\\/g,'/').replace(/^resource\//i,'').replace(/^entity\//i,'');var k=g.lastIndexOf('.');return k>0?g.slice(0,k):g}},
   onPick:function(v,it){picked={label:(it&&it.label)||v,value:v};inp.value=picked.label;nb.textContent='';dirty()}});
  function get(){var v=inp.value.trim();if(!v)return '';if(v===picked.label)return picked.value;
   var hit=(UX||[]).filter(function(x){return x.label.toLowerCase()===v.toLowerCase()||x.value===v})[0];return hit?hit.value:v}
  return {el:wrap,get:get,text:function(){return inp.value.trim()},
   known:function(){var v=get();return !v||!UX||v===picked.value||UX.some(function(x){return x.value===v})}}}
 // numbers: the range the server takes (mi.js), said with the field's label (S12)
 var RANGE={minute:[0,180],'rep.every':[20,900],'rep.until':[0,240],radius:[20,5000],'b.seconds':[10,3600],'c.count':[1,20],'c.crewN':[1,6],'d.shells':[1,40],'d.spread':[10,3000],'e.amount':[1,12]};
 function numErr(f,el){var v=String(el.value==null?'':el.value).trim();if(v==='')return '';var n=Number(v.replace(',','.')),R=RANGE[f];
  return !isFinite(n)||n<R[0]||n>R[1]?errText('',{key:P+'e.range',params:{f:f,lo:R[0],hi:R[1]}}):''}
 function rep(def){var c=watch(h('input',{type:'checkbox','aria-label':t('rep')}));c.checked=true;var ev=num(t('rep.every'),def);
  return {kids:[h('div',{class:'row'},[c,h('label',{text:' '+t('rep')})]),fld(t('rep.every'),[after(ev,'sec')]),h('div',{class:'hint',text:t('rep.why',{s:rotS()})})],on:c,every:ev}}
 function errsOf(nums,pls){var out=[];nums.forEach(function(n){var m=numErr(n[0],n[1]);if(m)out.push(m)});pls.forEach(function(p){var m=p.check();if(m)out.push(m)});return out}
 // ---- the five recipes: main fields first, the rest under More options (typed coordinates there too)
 var RD={
  a:function(){var who=whoSel(true),mn=num(t('minute'),1),to=placeSel('a.to',{def:function(){return firstOf('flag')}}),r=rep(Math.max(20,rotS()-10)),un=num(t('rep.until'),20);
   return {kids:[fld(t('who'),[who,h('span',{class:'hint','data-yours':'1',text:' '+t('who.yours')})]),fld(t('minute'),[mn]),fld(t('a.to'),[to.el]),to.note],more:r.kids.concat([fld(t('rep.until'),[un]),to.xy]),
    check:function(){return errsOf([['minute',mn],['rep.every',r.every],['rep.until',un]],[to])},
    get:function(){return {who:who.value,minute:mn.value,to:to.get(),every:r.on.checked?r.every.value:0,until:un.value}}}},
  b:function(){var who=whoSel(true),z=placeSel('b.at',{def:function(){return firstOf('zone')||firstOf('flag')}}),s2=num(t('b.seconds'),120),rd=num(t('radius'),400),r=rep(Math.max(20,rotS()-10));
   return {kids:[fld(t('who'),[who,h('span',{class:'hint','data-yours':'1',text:' '+t('who.yours')})]),fld(t('b.at'),[z.el]),z.note,fld(t('b.seconds'),[after(s2,'sec')])],more:[fld(t('radius'),[rd]),h('div',{class:'hint',text:t('radius.hint')})].concat(r.kids,[z.xy]),
    check:function(){return errsOf([['b.seconds',s2],['radius',rd],['rep.every',r.every]],[z])},
    get:function(){return {who:who.value,zone:z.get(),seconds:s2.value,radius:rd.value,every:r.on.checked?r.every.value:0}}}},
  c:function(){var who=whoSel(false),mn=num(t('minute'),5),at=placeSel('c.at',{def:function(){return firstOf('start',who.value)}}),then=placeSel('c.then',{none:true}),units=[],rows0=[];
   who.addEventListener('change',function(){at.def()});
   for(var i=0;i<3;i++){var u=unitBox(t('c.unit',{n:i+1}),'bots.mission.unit'),n=num(t('c.count',{n:i+1}),i?'':'2',3);units.push({u:u,n:n});rows0.push(h('div',{class:'row'},[u.el,h('span',{text:' × '}),n]))}
   var cr=watch(h('input',{type:'checkbox','aria-label':t('c.crew')})),crN=num(t('c.crewN'),4,3),empty=h('div',{class:'err',text:t('c.empty')});cr.checked=true;
   function syncCrew(){empty.hidden=cr.checked}cr.addEventListener('change',syncCrew);syncCrew();
   return {kids:[fld(t('who'),[who,h('span',{class:'hint','data-yours':'1',text:' '+t('who.yours')})]),fld(t('minute'),[mn]),h('div',{class:'hint',text:t('c.unitsLead')})].concat(rows0,[fld(t('c.at'),[at.el]),at.note,
     h('div',{class:'row'},[cr,h('label',{text:' '+t('c.crew')})]),empty]),
    more:[fld(t('c.crewN'),[after(crN,'men')]),h('div',{class:'hint',text:t('c.crewHow')}),fld(t('c.then'),[then.el]),then.note,h('div',{class:'hint',text:t('c.quiet')}),at.xy,then.xy],
    check:function(){var e=errsOf([['minute',mn],['c.crewN',crN]].concat(units.filter(function(x){return x.u.get()}).map(function(x){return ['c.count',x.n]})),[at,then]);
     units.forEach(function(x){if(!x.u.known())e.push(errText('',{key:P+'e.unit',params:{v:x.u.text()}}))});
     if(!units.some(function(x){return x.u.get()}))e.push(t('e.pickUnit'));return e},
    get:function(){return {who:who.value,minute:mn.value,at:at.get(),then:then.get(),crew:cr.checked,crewN:crN.value,units:units.filter(function(x){return x.u.get()}).map(function(x){return {unit:x.u.get(),n:x.n.value||'1'}})}}}},
  d:function(){var mn=num(t('minute'),8),at=placeSel('d.at',{def:function(){return firstOf('flag')}}),sh=num(t('d.shells'),8),sp=num(t('d.spread'),200);
   return {kids:[fld(t('minute'),[mn]),fld(t('d.at'),[at.el]),at.note,fld(t('d.shells'),[after(sh,'shells')])],more:[fld(t('d.spread'),[sp]),at.xy],
    check:function(){return errsOf([['minute',mn],['d.shells',sh],['d.spread',sp]],[at])},
    get:function(){return {minute:mn.value,at:at.get(),shells:sh.value,spread:sp.value}}}},
  e:function(){var who=whoSel(false),v=unitBox(t('e.vehicle'),'bots.mission.vehicle'),at=placeSel('e.at',{def:function(){return firstOf('start',who.value)}}),mn=num(t('minute'),4),am=num(t('e.amount'),3);
   who.addEventListener('change',function(){at.def()});
   return {kids:[fld(t('who'),[who,h('span',{class:'hint','data-yours':'1',text:' '+t('who.yours')})]),fld(t('e.vehicle'),[v.el]),fld(t('e.at'),[at.el]),at.note,fld(t('minute'),[mn])],more:[fld(t('e.amount'),[after(am,'soldiers')]),at.xy],
    check:function(){var e=errsOf([['minute',mn],['e.amount',am]],[at]);if(!v.get())e.push(errText('',{key:P+'e.novehicle',params:{f:'e.vehicle'}}));
     else if(!v.known())e.push(errText('',{key:P+'e.unit',params:{v:v.text()}}));return e},
    get:function(){return {who:who.value,unit:v.get(),at:at.get(),minute:mn.value,amount:am.value}}}}};
 var UNTRIED={a:1,b:1,c:1,e:1},ORDER=['c','a','b','e','d'];
 function items(){var out=[];ORDER.forEach(function(k){var f=form[k];if(f&&f.tick.checked&&!f.off)out.push({recipe:k,p:f.get()})});return out}
 function showRot(){var on=Object.keys(form).some(function(k){return form[k].move&&form[k].tick.checked});rot.hidden=!on}
 function rotBody(){rot.textContent='';var r=(ST.facts&&ST.facts.rotation)||{};
  rot.appendChild(h('div',{text:t(r.ms?(r.from==='mod'?'rot.mod':'rot.game'):'rot.unknown',{s:rotS()})}));
  rot.appendChild(h('div',{class:'hint',text:t('rot.help')}));
  rot.appendChild(h('div',{class:'row'},[h('button',{type:'button',text:t('rot.go'),onclick:function(){env.go('bots.stages.move.rotation')}})]))}
 function recipeBlock(r){var f=RD[r.id](),tick=h('input',{type:'checkbox',id:'bots-mission-'+r.id,'aria-label':t(r.id+'.title')}),off=r.off?say(r.off):'';
  tick.disabled=!!off;tick.addEventListener('change',function(){body.hidden=!tick.checked;dirty()});
  var pf=ST.facts.proof||{},notes=[];
  if(UNTRIED[r.id])notes.push(h('div',{class:'hint',text:t(r.id+'.untried')}));
  if(!pf.proven&&r.bot)notes.push(h('div',{class:'err',text:t('proof.mark')}));
  var body=h('div',{style:'margin-left:1.6em'},[h('div',{class:'hint',text:t(r.id+'.ex')})].concat(f.kids,[f.more&&f.more.length?more('bots.mission.r.'+r.id+'.more',f.more):null],notes,
   [details('bots.mission.r.'+r.id+'.details',[h('div',{class:'hint',text:t('src',{s:tx(P+r.id+'.src')===P+r.id+'.src'?r.src:t(r.id+'.src')})}),gidOf()==='mowas2'?h('div',{class:'hint',text:t('proof.game')}):null])]));body.hidden=true;
  form[r.id]={tick:tick,get:f.get,check:f.check,move:r.move,off:off};
  return leaf('bots.mission.r.'+r.id,[h('div',{class:'row'},[tick,h('label',{for:'bots-mission-'+r.id},[h('b',{text:t(r.id+'.title')})])]),
   h('div',{class:'hint',text:t(r.id+'.does')}),off?h('div',{class:'err',text:off}):null,body],t(r.id+'.title'))}
 function mineList(){mine.textContent='';var a=(ST.facts&&ST.facts.added)||[];
  if(!a.length){mine.appendChild(h('b',{text:t('mine.h')}));mine.appendChild(h('div',{class:'hint',text:t('mine.none')}));return}
  mine.appendChild(h('b',{text:t('mine.h')}));
  mine.appendChild(rows(a.map(function(x){return h('li',{'data-added':String(x.id),title:String(x.id)},[h('span',{text:sentence(x.recipe,x.p)+' '}),
   RO?null:h('button',{type:'button',text:t('mine.rm'),onclick:function(){ask(t('mine.rm'),[t('mine.ask',{what:sentence(x.recipe,x.p)})],true,function(){
    env.api('POST','mission/remove',{map:ST.map,mode:ST.mode,from:ST.from,id:x.id,write:true},function(e,r,xe){res.textContent='';
     if(e){res.appendChild(errBox(errText(e,xe)));return}res.appendChild(h('div',{class:'ok',text:t('mine.done')}));
     if(r.deleted)res.appendChild(h('div',{class:'hint',text:t('mine.deleted')}));
     res.appendChild(diffBox(P+'rm.change',t('mine.from',{p:ST.facts&&ST.facts.file||''}),r.removed,''));resFor=ST.map+'|'+ST.mode;reload()})})}})])})))}
 function lintBox(l){if(!l)return null;var d=h('div');
  if(l.na){d.appendChild(h('div',{class:'hint',text:say(l.na)}));return d}
  if(!l.ran){d.appendChild(h('div',{class:'err',text:t('lint.notRun')}));d.appendChild(details(P+'lint.details',[h('div',{class:'hint',text:l.why||''})]));return d}
  if(!l.findings.length){d.appendChild(h('div',{class:'ok',text:t('lint.clean')}));return d}
  d.appendChild(h('div',{class:'err',text:t('lint.found',{things:pl('things',l.count)})}));
  d.appendChild(details(P+'lint.details',[h('ul',{},l.findings.map(function(x){var lead=x.sev==='error'?t('lint.error'):x.sev==='info'?t('lint.info'):t('lint.warn');
   return h('li',{text:lead+' '+x.msg+' ('+x.code+', '+x.where+')'})}))]));return d}
 // ---- Undo: the box goes away, Undo is greyed again, every list on the page is read again (S13)
 function undoP(){var u=MEM.undo;return new Promise(function(ok,no){if(!u){no(new Error(t('e.noundo')));return}
  env.api('POST','mission/undo',{map:u.map,mode:u.mode,from:u.from,undo:u.tok},function(e,r,x){if(e)no(new Error(errText(e,x)));else ok(r||{})})})}
 function reload(){MAPS={items:null,wait:[],busy:false,err:''};UX=null;BM=null;loadBM();setMap(ST.map,ST.from,ST.mode,ST.name)}
 function afterUndo(r,byKit){var ur=MEM.undo&&MEM.undo.rel;MEM.undo=null;undoState();
  // S18: the card's own Undo tells the frame, so a stale green box or "Undone" line of this file goes
  if(!byKit&&ur&&typeof K.undoSync==='function')try{K.undoSync([ur])}catch(e){}var del=!!(r&&r.deleted),msg=del?'undo.deleted':'undo.done';if(byKit)MEM.flash=msg;
  if(!byKit){res.textContent='';res.appendChild(undoneEl(t(del?'undo.whatDeleted':'undo.what'),t(msg)))}
  resFor=ST.map+'|'+ST.mode;reload();
  if(!byKit&&typeof K.changed==='function'){MEM.flash=msg;try{K.changed('undo',res)}catch(e){}MEM.flash=''}}
 function doUndo(){if(bUndo.disabled)return;bUndo.disabled=true;var w=h('div',{class:'hint',text:t('loading.undo')});res.appendChild(w);
  undoP().then(function(r){afterUndo(r,false)},function(e){if(w.parentNode)w.parentNode.removeChild(w);undoState();res.appendChild(errBox(e.message))})}
 // after Write: which mode and map to start, which team the bot plays, the minute to watch (T6)
 function seeLine(it){var who={},mins=[];it.forEach(function(x){var p=x.p||{};if(p.who)who[p.who]=1;if(p.min!=null&&p.min!==''&&isFinite(Number(p.min)))mins.push(Number(p.min))});
  var ws=Object.keys(who),team=ws.length===1?t('team.'+ws[0]):ws.length?t('team.ab'):t('team.any'),q={mode:modeWord(ST.mode),map:ST.name||ST.map,team:team};
  if(joinOf(ST.mode).join===false)return t('done.seeOff',q);
  if(!mins.length)return t('done.seeHold',q);q.min=Math.min.apply(null,mins);return t('done.see',q)}
 function doneBox(lines,see,n){var o={title:t('done.what',{changes:pl('changes',n),map:ST.name||ST.map}),lines:lines,see:see+' '+t('done.remove'),next:[{text:t('done.try'),go:'bots.botmatch'}],
   undo:function(){return undoP().then(function(r){MEM.lastUndo=r;return r})},onUndo:function(){afterUndo(MEM.lastUndo,true)},rels:MEM.undo&&MEM.undo.rel?[MEM.undo.rel]:[]};
  if(typeof K.done==='function'){try{var d=K.done(P+'done',o);if(d)return d}catch(e){}}
  var box=h('div',{class:'ok'},[h('b',{text:o.title}),h('ul',{},lines.map(function(s){return h('li',{text:s})})),h('div',{text:t('done.seeH')+' '+see+' '+t('done.remove')}),
   h('div',{class:'row'},[h('button',{type:'button',class:'primary',text:o.next[0].text,onclick:function(){env.go('bots.botmatch')}}),h('button',{type:'button',text:tx('bots.btn.undo'),onclick:doUndo})])]);
  return leaf(P+'done',[box],t('done.blk'))}
 function run(write){var it=items();res.textContent='';
  if(!it.length){res.appendChild(h('div',{class:'hint',text:t('add.none')}));return}
  if(joinOf(ST.mode).why==='combat'){res.appendChild(errBox(t('mode.combatNo',{mode:modeWord(ST.mode)})));return}
  // the names and numbers are checked here first, each error naming its field (S12, S16)
  var errs=[];ORDER.forEach(function(k){var f=form[k];if(f&&f.tick.checked&&!f.off&&f.check)errs=errs.concat(f.check().map(function(m){return t('errIn',{r:t(k+'.title'),m:m})}))});
  if(errs.length){last=null;bGo.disabled=true;errs.forEach(function(m){res.appendChild(errBox(m))});return}
  var k=JSON.stringify([ST.map,ST.mode,it]);if(write&&(!last||last.k!==k)){bGo.disabled=true;return}
  res.appendChild(typeof K.wait==='function'?K.wait(null,t(write?'loading.write':'loading.preview')):h('div',{class:'hint',text:t(write?'loading.write':'loading.preview')}));
  env.api('POST','mission/add',{map:ST.map,mode:ST.mode,from:ST.from,items:it,write:write},function(e,r,x){res.textContent='';
   if(e){last=null;bGo.disabled=true;res.appendChild(errBox(errText(e,x)));return}
   if(!r.ok){last=null;bGo.disabled=true;(r.say||[]).forEach(function(s){res.appendChild(errBox(errText('',{key:s.k,params:s.p||{}})))});return}
   var lines=[];r.items.forEach(function(x){lines.push(sentence(x.recipe,x.p));lines=lines.concat(crewLines(x))});
   var off=joinOf(ST.mode).join===false;
   var fileFold=diffBox(P+(write?'done':'prev')+'.change',t(r.copies?'add.willCopy':'add.willAdd',{p:r.rel})+(r.includes||[]).map(function(y){return ' '+t('add.include',{f:y})}).join(''),
    '',r.items.map(function(y){return y.text}).join(''));
   if(!write){res.appendChild(h('b',{text:t('add.prevH',{map:ST.name||ST.map,mode:modeWord(ST.mode)})}));res.appendChild(h('ul',{},lines.map(function(s){return h('li',{text:s})})));
    if(off)res.appendChild(h('div',{class:'err'},[h('span',{text:t('mode.prevOff',{mode:modeWord(ST.mode)})+' '}),h('button',{type:'button',text:tx('bots.modeready.title'),onclick:function(){env.go('bots.modeready')}})]));
    res.appendChild(fileFold);last={k:k,lines:lines};bGo.disabled=false;return}
   MEM.undo=r.undo?{mod:env.mod,map:ST.map,mode:ST.mode,from:ST.from,tok:r.undo,rel:r.rel||''}:null;
   res.appendChild(doneBox(lines,seeLine(r.items),r.items.length));res.appendChild(lintBox(r.lint));res.appendChild(fileFold);
   last=null;bGo.disabled=true;resFor=ST.map+'|'+ST.mode;setMap(ST.map,ST.from,ST.mode);
   if(typeof K.changed==='function'){try{K.changed('mission',res)}catch(y){}}})}
 // the result box stays through the reload after a write, a remove or an undo; a new map or mode clears it
 var resFor='',drawnCombat=null;
 function drawRecipes(){drawnCombat=ST.facts?joinOf(ST.mode).why==='combat':null;form={};last=null;bGo.disabled=true;rot.textContent='';rot.hidden=true;
  if(!state(b2))return;var f=ST.facts;
  if(f.canAdd){b2.appendChild(errBox(say(f.canAdd)));return}
  if(joinOf(ST.mode).why==='combat')return;
  if(RO){b2.appendChild(na(C2+'.goh',GOH));return}
  var pf=f.proof||{};
  if(!pf.proven||pf.scriptPlacedOnly)b2.appendChild(leaf('bots.mission.proof',[h('div',{class:'err',text:t(pf.scriptPlacedOnly?'proof.onlyC':'proof.not')})]));
  var A=f.areas||{};if(!A.a||!A.b)b2.appendChild(h('div',{class:'err',text:t('teams.missing')}));
  var by={};(f.recipes||[]).forEach(function(r){by[r.id]=r});ORDER.forEach(function(id){if(by[id])b2.appendChild(recipeBlock(by[id]))});
  rotBody();showRot()}
 ST.subs.push(function(){var rk=ST.map+'|'+ST.mode;if(rk!==resFor&&!ST.busy){res.textContent='';resFor=rk}mine.textContent='';
  undoState();modeNote();drawRecipes();if(ST.facts&&!ST.facts.none)mineList()});
 var card2=sec(C2,t('orders.h'),[hint(C2+'.lead',t('orders.lead')),picker(C2+'.pick'),leaf(C2+'.mode',[modeBox]),
  leaf(C2+'.recipes',[b2],t('orders.blk')),leaf('bots.mission.rot',[rot],t('rot.blk')),
  h('div',{class:'row',blk:C2+'.btns','data-blkname':t('orders.btns'),hidden:RO},[bPrev,bGo,bUndo]),leaf(C2+'.res',[res],t('orders.res')),
  leaf(C2+'.mine',[mine],t('mine.blk')),
  details(C2+'.details',[h('div',{class:'hint',text:t('orders.d1')}),h('div',{class:'hint',text:t('orders.d2')}),h('div',{class:'hint',text:t('orders.d3')})])]);

 // ==== card "teams" (last, folded): how the page finds each team's bot
 var b1=h('div'),b0=h('div',{'aria-live':'polite'});
 function startNames(a){var PL=places();return (a.names||[]).map(function(n){var p=PL.filter(function(x){return x.id==='mappoint|'+n})[0];return p?p.short:nice(n,'start')}).join('; ')||'-'}
 ST.subs.push(function(){b1.textContent='';b0.textContent='';var f=ST.facts;
  if(ST.map&&ST.busy){b0.appendChild(typeof K.wait==='function'?K.wait(null,t('loading.map')):h('div',{class:'hint',text:t('loading.map')}))}
  else if(ST.map&&ST.err){b0.appendChild(errBox(ST.err))}
  else if(f&&f.none){b0.appendChild(errBox(say(f.none)))}
  else if(f&&f.areas){b0.appendChild(h('b',{text:t('teams.resH',{map:ST.name||ST.map,mode:modeWord(ST.mode)})}));
   ['a','b'].forEach(function(x){var a=f.areas[x];b0.appendChild(h('div',{class:a?'':'err','data-team':x,text:a?t(x==='a'?'teams.resA':'teams.resB',{names:startNames(a)}):t('teams.noArea',{team:x.toUpperCase()})}))});
   b0.appendChild(h('div',{class:'hint',text:t('teams.resEnd')}))}
  else b0.appendChild(h('div',{class:'hint',text:t('teams.pick')}));
  if(!f||f.none||!f.areas){b1.appendChild(h('div',{class:'hint',text:t('teams.pick')}));return}
  b1.appendChild(h('div',{class:'hint',text:t('teams.proofH')}));
  ['a','b'].forEach(function(x){var a=f.areas[x],T=x.toUpperCase();
   b1.appendChild(h('div',{class:a?'':'err',text:a?t('teams.area',{team:T,names:a.names.join(', ')||'-'}):t('teams.noArea',{team:T})}));
   if(a)b1.appendChild(h('div',{class:'hint',style:'font-size:smaller',text:t('teams.areaNums',{x:Math.round(a.x),y:Math.round(a.y),r:a.r})}))})});
 var card1=sec(C1,t('teams.h'),[hint(C1+'.lead',t('teams.lead')),leaf(C1+'.result',[b0],t('teams.h')),
  details(C1+'.details',[leaf(C1+'.areas',[b1],t('teams.blk')),h('div',{class:'hint',text:t('teams.d0')}),h('div',{class:'hint',text:t('teams.d1')}),h('div',{class:'hint',text:t('teams.d2')}),h('div',{class:'hint',text:t('teams.d3')})])]);
 rot.hidden=true;undoState();loadBM();
 if(MEM.flash){res.appendChild(undoneEl(t(MEM.flash==='undo.deleted'?'undo.whatDeleted':'undo.what'),t(MEM.flash)));resFor=MEM.map+'|'+MEM.mode;MEM.flash=''}
 if(MEM.map){ST.name=MEM.name;setMap(MEM.map,MEM.from,MEM.mode,MEM.name)}else notify();
 return [card2,card1]}});
`;
