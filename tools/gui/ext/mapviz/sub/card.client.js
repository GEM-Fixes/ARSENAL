// Map Viewer object card (MV-PG2, builder PG2b; freeze page-pg2.md 6.2): what the clicked thing is. On a click on the map
// with no tool in use, the card asks every picker of EXT_SCREENS.mapviz.picks ({id, V, at(x, y, tolU) -> [{type, item}]},
// tolU = 6 px at the current zoom) and shows up to 4 picks, the first opened: a cover edge or point first, then objects by
// smallest area. An object card reads GET card (card.server.js) for the def: name, kind, file, height, cover, concealment,
// sight, what can crush it, vault (when the entry says so), obstacle id, places inside, parts, notes. A cover edge card and
// a cover point card come from the item itself. Buttons Open in Editor and Open in Models only where that page exists.
// The same rows on AS64, MoW:AS2 and Gates of Hell; the Gates of Hell branch adds one row for hard cover whose obstacle id
// is nothing (sandbags): its cover in game is not checked yet [T]. Band and cover type words come from the layers part
// (mapviz.layers.band.*, mapviz.layers.ctype.*), category words from the objects part, each with the plain id as fallback.
// A GET never starts a job: a catalogue that is not made shows one Make button; the fitting entcat job's words show while
// it runs. Answers are kept per target, game folder, mod, map, mode and def; any 'map' event empties the card.
// Author: Imperator_Aug (ARSENAL, ia-b3855d21)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
var BANDS=['none','lie','low','kneel','squat','stand'],CRUSH=['tank','tankLight','armored','car'],DIRS=['n','ne','e','se','s','sw','w','nw'];
var LOOKS={none:1,left:1,right:1,two:1},MAXPICK=4,TOLPX=6,UPM=20;
var NOTES=['ENTCAT_MODEL_FILES_MISSING','ENTCAT_VOLUME_NOT_BUILT','ENTCAT_OBSTACLE_DEGENERATE','ENTCAT_DECAL_SIZE',
 'ENTCAT_DEF_MISSING','ENTCAT_DEF_PARSE','ENTCAT_MDL_MISSING','ENTCAT_VOLUME_BAD','ENTCAT_MODEL_LOAD','ENTCAT_PART_UNPLACED','ENTCAT_BAD_POSITION',
 'ENTCAT_SOLID_NO_GROUND','ENTCAT_FAULT','ENTCAT_EXT_MISSING','ENTCAT_INCLUDE_MISSING','ENTCAT_LINK_NESTED'];
function num(v){return typeof v==='number'&&isFinite(v)}
function word(k,fb){var s=tx(k);return s===k?fb:s}
function m1(v){var s=(Math.round(v*10)/10).toFixed(1);return s==='-0.0'?'0.0':s}
function metres(u){return tx('mapviz.card.m',{v:m1(u/UPM)})}
function bandWord(b){var id=num(b)?BANDS[b]:b;if(id==null)return tx('mapviz.card.unknown');return word('mapviz.layers.band.'+id,String(id))}
function catWord(c){if(c==null)return tx('mapviz.card.unknown');return word('mapviz.objects.cat.'+c,String(c).replace(/_/g,' '))}
function ctypeWord(t){return word('mapviz.layers.ctype.'+t,String(t))}
function noteWord(c){return word('mapviz.card.note.'+c,String(c))}
function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
  if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
// dirOf(a, b, side): the compass word of the protected side of an edge from a to b (side 1: left of a to b, -1: right);
// world +y is north
function dirOf(a,b,side){if(!Array.isArray(a)||!Array.isArray(b))return null;var dx=b[0]-a[0],dy=b[1]-a[1];if(!(dx*dx+dy*dy>0))return null;var s=side===-1?-1:1,nx=-dy*s,ny=dx*s;
 var g=Math.atan2(nx,ny)*180/Math.PI;if(g<0)g+=360;return DIRS[Math.round(g/45)%8]}
// order(picks): cover edges and points first, then objects (each picker gives its own order), then anything else; at most 4
function order(ps){var cov=[],obj=[],oth=[];ps.forEach(function(p){if(!p||!p.item)return;if(p.type==='coverEdge'||p.type==='coverPoint')cov.push(p);else if(p.type==='object')obj.push(p);else oth.push(p)});
 return cov.concat(obj,oth).slice(0,MAXPICK)}
MV.parts.push({id:'card',init:function(V){
 if(!V||V.q('rmt'))return;
 var OBJ=MV.objects&&typeof MV.objects.of==='function'?MV.objects.of(V):null;
 var st={picks:[],cur:0,clicked:false,cards:{}},el={};
 function sig(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 // the tool in use: the shell answers V.q('tool') (null with no tool picked)
 function toolNow(){var t=null;try{t=V.q('tool')}catch(e){t=null}return t||null}
 function tolU(){var z=V.view&&V.view.zoom;return TOLPX/(z>0?z:1)}
 function gather(x,y){var out=[],tol=tolU();(MV.picks||[]).forEach(function(p){if(!p||typeof p.at!=='function'||(p.V!=null&&p.V!==V))return;
   try{(p.at(x,y,tol)||[]).forEach(function(k){if(k&&k.item&&typeof k.type==='string')out.push(k)})}catch(e){}});return order(out)}
 function runText(n){var js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!n||!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===n.what&&j.target===t&&(!j.map||j.map===m)&&(!j.args||fits(j.args,n.args)))return j.text||word('mapviz.shell.what.'+n.what,String(n.what))}return null}
 // ---- object answers ----
 function cardOf(def){var k=sig()+'|'+def,c=st.cards[k];if(c)return c;if(V.q('docBusy')||!V.q('target')||!V.q('map'))return {state:'wait'};
  c=st.cards[k]={state:'busy'};var q={def:def},p;// the shell adds target, game, mods, modDir, map, mode (QCOM card:1)
  try{p=V.api('GET','card',q)}catch(e){p=Promise.reject(e)}
  p.then(function(a){if(st.cards[k]!==c)return;if(!a||a.kind!=='card'||(a.entry==null&&!a.failed)){c.state='error';c.err=tx('mapviz.card.na')}else{c.state='ready';c.ans=a}render()},
   function(e){if(st.cards[k]!==c)return;if(e&&e.stale){delete st.cards[k];return}var n=needOf(e);if(n){c.state='need';c.need=n}else if(e&&e.status===404){c.state='missing'}else{c.state='error';c.err=errText(e)}render()});
  return c}
 function make(c){if(!c||!c.need)return;var n=c.need,k=sig();c.state='making';c.mk=n;render();var p;
  try{p=V.job(n.what,n.args||{})}catch(e){p=Promise.reject(e)}
  p.then(function(){if(k!==sig())return;clearNeeds();render()},function(e){if(k!==sig())return;if(e&&e.stale){clearNeeds();return}c.state='error';c.err=errText(e);render()})}
 function clearNeeds(){Object.keys(st.cards).forEach(function(k){var c=st.cards[k];if(c.state==='need'||c.state==='making'||c.state==='missing'||c.state==='error')delete st.cards[k]})}
 // ---- drawing the card ----
 function leaf(id,kids,nk,o){var a={blk:id,'data-blkname':tx(nk)};for(var k in o||{})a[k]=o[k];return h('div',a,kids)}
 function row(id,lk,val){var lb=tx(lk);el.rows.appendChild(h('div',{class:'fld',blk:'mv.card.r.'+id,'data-blkname':lb},[h('span',{class:'n',text:lb+': '}),h('b',{text:String(val)})]))}
 function say(k,a,btn){el.status.textContent='';el.status.appendChild(h('span',{text:tx(k,a||{})}));if(btn){el.status.appendChild(h('span',{text:' '}));el.status.appendChild(btn)}}
 function pickLabel(p){var it=p.item;if(p.type==='object')return it.def+' ('+catWord(it.category)+')';if(p.type==='coverEdge')return tx('mapviz.card.pickEdge',{def:it.def||''});
  if(p.type==='coverPoint')return tx('mapviz.card.pickPoint',{type:ctypeWord(it.type)});return String(p.type)}
 // a structure part with no map record shares its root's uid (README 1.7): the item of that uid and def first
 function showObject(it){var all=OBJ?OBJ.byUid(it.uid):[],o=all.filter(function(x){return x.def===it.def})[0]||all[0]||null;open({type:'object',item:o||{uid:it.uid,def:it.def,category:null}})}
 // a user action asks again once for an object whose last read failed
 function retry(ps){ps.forEach(function(p){if(p&&p.type==='object'&&p.item){var k=sig()+'|'+p.item.def,c=st.cards[k];if(c&&c.state==='error')delete st.cards[k]}})}
 function open(p){retry([p]);st.picks=[p];st.cur=0;st.clicked=true;render()}
 function render(){if(!el.rows)return;el.picks.textContent='';el.rows.textContent='';el.btns.textContent='';el.status.textContent='';
  if(!st.picks.length){if(OBJ)OBJ.select(null);say(st.clicked?'mapviz.card.nothing':'mapviz.card.hint');return}
  if(st.picks.length>1){el.picks.appendChild(h('span',{class:'hint',text:tx('mapviz.card.here',{n:st.picks.length})+' '}));
   st.picks.forEach(function(p,i){el.picks.appendChild(h('button',{type:'button',text:pickLabel(p),'aria-pressed':i===st.cur?'true':'false',onclick:function(){st.cur=i;render()}}))})}
  var p=st.picks[st.cur]||st.picks[0];if(OBJ)OBJ.select(p.item.uid!=null?p.item.uid:null);
  if(p.type==='coverEdge')edgeCard(p.item);else if(p.type==='coverPoint')pointCard(p.item);else if(p.type==='object')objectCard(p.item);else say('mapviz.card.na')}
 function edgeCard(it){row('def','mapviz.card.name',it.def||tx('mapviz.card.unknown'));row('band','mapviz.card.band',bandWord(it.band));
  if(num(it.topM))row('top','mapviz.card.top',tx('mapviz.card.m',{v:m1(it.topM)}));
  if(it.kind==='coverRing'){if(num(it.r))row('radius','mapviz.card.radius',metres(it.r))}
  else{if(num(it.lenM))row('len','mapviz.card.length',tx('mapviz.card.m',{v:m1(it.lenM)}));var d=dirOf(it.a,it.b,it.side);if(d)row('side','mapviz.card.side',tx('mapviz.card.dir.'+d))}
  if(it.uid!=null)el.btns.appendChild(h('button',{type:'button',text:tx('mapviz.card.showObject'),onclick:function(){showObject(it)}}));say('mapviz.card.edgeNote')}
 function pointCard(it){row('type','mapviz.card.ctype',ctypeWord(it.type));row('band','mapviz.card.band',bandWord(it.band));
  row('look','mapviz.card.look',LOOKS[it.look]?tx('mapviz.card.look.'+it.look):tx('mapviz.card.unknown'));
  if(it.uid!=null)el.btns.appendChild(h('button',{type:'button',text:tx('mapviz.card.showObject'),onclick:function(){showObject(it)}}));say('mapviz.card.pointNote')}
 function objectCard(it){var c=cardOf(it.def);
  if(c.state==='wait'||c.state==='busy'){row('def','mapviz.card.name',it.def);say('mapviz.card.loading');return}
  if(c.state==='need'||c.state==='making'){var rt=runText(c.need||c.mk);row('def','mapviz.card.name',it.def);
   if(rt||c.state==='making'){say(rt?'mapviz.card.makingJob':'mapviz.card.making',{job:rt||''});return}
   say('mapviz.card.notMade',{},h('button',{type:'button',text:tx('mapviz.card.make'),title:tx('mapviz.card.makeT'),onclick:function(){make(c)}}));return}
  if(c.state==='missing'){row('def','mapviz.card.name',it.def);say('mapviz.card.notInList',{def:it.def});return}
  if(c.state==='error'){row('def','mapviz.card.name',it.def);say('mapviz.card.fault',{msg:c.err||''});return}
  var a=c.ans,en=a.entry;
  if(!en){row('def','mapviz.card.name',it.def);if(it.category)row('cat','mapviz.card.cat',catWord(it.category));var f=a.failed||{};
   row('failed','mapviz.card.failed',f.code?noteWord(f.code):tx('mapviz.card.unknown'));say('mapviz.card.failedNote');return}
  objectRows(en,it);buttons(en);say('mapviz.card.objNote')}
 function yn(v){return tx(v?'mapviz.card.yes':'mapviz.card.no')}
 function objectRows(en,it){row('def','mapviz.card.name',en.def||it.def);row('cat','mapviz.card.cat',catWord(en.category||it.category));
  if(typeof en.path==='string'&&en.path)row('file','mapviz.card.file',en.path);
  if(num(en.height))row('height','mapviz.card.height',metres(en.height));
  var cv=en.cover;if(cv&&typeof cv==='object'){var parts=[bandWord(cv.band)];if(num(cv.top)&&cv.band!=='none'&&cv.band!==0)parts.push(tx('mapviz.card.topV',{v:metres(cv.top)}));
   if(cv.hard!=null)parts.push(tx(cv.hard?'mapviz.card.hard':'mapviz.card.soft'));row('cover','mapviz.card.cover',parts.join('; '));
   if(cv.conceal!=null)row('conceal','mapviz.card.conceal',cv.conceal?tx('mapviz.card.concealYes'):tx('mapviz.card.no'))}
  var sg=en.sight;if(sg&&typeof sg==='object')row('sight','mapviz.card.sight',tx(!sg.enters?'mapviz.card.sightNone':sg.hard?'mapviz.card.sightHard':'mapviz.card.sightSoft'));
  var cb=en.crushBy;if(cb&&typeof cb==='object')row('crush','mapviz.card.crush',CRUSH.map(function(k){var v=cb[k];
   return tx('mapviz.card.crushV',{who:tx('mapviz.card.crush.'+k),v:tx(num(v)?(v>=0?'mapviz.card.yes':'mapviz.card.no'):'mapviz.card.unknown')})}).join(', '));
  if(en.vaultable===true)row('vault','mapviz.card.vault',tx('mapviz.card.vaultYes'));
  if(en.obstacleId!=null)row('obst','mapviz.card.obst',en.obstacleId==='nothing'?tx('mapviz.card.none'):String(en.obstacleId));
  // Gates of Hell: hard cover with obstacle id nothing (sandbags) is drawn as cover; whether soldiers use it is not checked
  if(V.q('target')==='goh'&&en.obstacleId==='nothing'&&cv&&cv.hard)row('gohcover','mapviz.card.gohCover',tx('mapviz.card.notChecked'));
  var ent=en.enterable;if(ent&&typeof ent==='object'&&num(ent.places))row('enter','mapviz.card.enter',tx('mapviz.card.enterV',{n:ent.places,f:Array.isArray(ent.ports)?ent.ports.length:0}));
  var sp=en.structure&&en.structure.parts;if(sp!=null)row('parts','mapviz.card.parts',String(Array.isArray(sp)?sp.length:num(sp)?sp:0));
  if(Array.isArray(en.notes)&&en.notes.length)row('notes','mapviz.card.notes',en.notes.map(function(n){return noteWord(n&&n.code||n)}).join('; '))}
 // the page is in this game: built (S.sec) and listed for the current game (INGAME; groups.js puts Editor and Models in
 // the AS64 group only), so a click never switches the game and opens this game's data key in another game's data
 function hasPage(id){return typeof S!=='undefined'&&!!S&&!!S.sec&&!!S.sec[id]&&(typeof INGAME!=='object'||!INGAME||!!INGAME[id])}
 function buttons(en){var p=typeof en.path==='string'?en.path:'',name=String(en.def||'');if(!p)return;
  if(hasPage('ide')&&typeof as2Link==='function')
   el.btns.appendChild(h('button',{type:'button',text:tx('mapviz.card.editor'),title:tx('mapviz.card.editorT'),onclick:function(){var ok=false;try{ok=as2Link('key:'+p)}catch(e){ok=false}if(!ok)V.say('mapviz.card.noPage')}}));
  if(typeof VIEW!=='undefined'&&VIEW&&typeof VIEW.modelGo==='function'&&hasPage('models')&&S.screens&&S.screens.models){var mk=typeof en.mdl==='string'&&en.mdl?en.mdl:p;
   el.btns.appendChild(h('button',{type:'button',text:tx('mapviz.card.models'),title:tx('mapviz.card.modelsT'),onclick:function(){var ok=false;try{ok=VIEW.modelGo({key:mk},name)}catch(e){ok=false}if(!ok)V.say('mapviz.card.noPage')}}))}}
 V.addPanel({id:'card',side:'right',build:function(box){
  box.appendChild(leaf('mv.card.title',[h('h3',{text:tx('mapviz.card.title')})],'mapviz.card.title'));
  el.picks=leaf('mv.card.picks',[],'mapviz.card.blk.picks',{class:'row'});
  el.status=h('p',{blk:'mv.card.status',class:'hint',role:'status','data-blkname':tx('mapviz.card.blk.status')});
  el.rows=h('div',{blk:'mv.card.rows',box:'col','aria-live':'polite','aria-label':tx('mapviz.card.title'),'data-blkname':tx('mapviz.card.blk.rows')});
  el.btns=leaf('mv.card.btns',[],'mapviz.card.blk.btns',{class:'row'});
  box.appendChild(el.picks);box.appendChild(el.status);box.appendChild(el.rows);box.appendChild(el.btns);render()}});
 // a click on the map (mouse or the Enter key): every picker at that spot, unless a tool takes the click
 // (late G8: a click whose hit belongs to another part, such as strong or checks, is that part's)
 V.on('cursor',function(d){if(!d||!d.click||toolNow())return;if(!num(d.x)||!num(d.y))return;var h0=Array.isArray(d.hit)?d.hit[0]:d.hit;
  if(h0&&h0.part&&h0.part!=='layers'&&h0.part!=='objects')return;st.picks=gather(d.x,d.y);retry(st.picks);st.cur=0;st.clicked=true;render()});
 V.on('map',function(){st.cards={};st.picks=[];st.cur=0;st.clicked=false;render()});
 V.on('doc',function(){render()});
 // a page job ended or the cache answer changed (W1): an answer that was not made asks once more unless its job still runs
 V.on('products',function(){var any=false;Object.keys(st.cards).forEach(function(k){var c=st.cards[k];if((c.state==='need'&&!runText(c.need))||c.state==='missing'||c.state==='error'){delete st.cards[k];any=true}});if(any)render()});
 V.on('job',function(){var p=st.picks[st.cur];if(p&&p.type==='object'){var c=st.cards[sig()+'|'+p.item.def];if(c&&(c.state==='need'||c.state==='making'))render()}});
 if(OBJ&&OBJ.onPick)OBJ.onPick(function(it){open({type:'object',item:it})});
}});
MV.card={order:order,dirOf:dirOf,NOTES:NOTES};
})();
`;
