// Map Viewer objects (MV-PG2, builder PG2b): the clickable objects of a map from the entcat product (tools/mapviz/README.md
// 1.7, 5.3 objects items; freeze page-pg2.md 6.1). Layer 'objects' (group objects): footprint polygons, fill and line by
// category from palette.json objects (a dot for fp.kind 'none'), the picked object outlined; without that palette key the
// lines take marks.cursor and nothing is filled. Panel 'objects': status (count, Make, job words), one tick per category,
// a find box with its hits.
// It holds the page's objects store, EXT_SCREENS.mapviz.objects = {of(V), kit}: of(V) gives one store per page
// {state: none | busy | need | making | ready | error, items, bad, need, err, at(x, y, tolU), byUid(uid), find(text),
// ticks, shown(item), select(uid), sel, pick(item), onPick(fn), on(fn), ensure(again), make(), runText()} that the card reads.
// The store is keyed on target, game folder, mod, map and mode (the entcat job keys mode, freeze jobs.md 1.1).
// It also adds the picker 'objects' to EXT_SCREENS.mapviz.picks ({id, V, at(x, y, tolU) -> [{type:'object', item}]}).
// A GET never starts a job: a missing product shows one Make button; while the entcat job that fits runs, its words show.
// Same on AS64, MoW:AS2 and Gates of Hell: the items are game-neutral ids and polygons in world units.
// Author: Imperator_Aug (ARSENAL, ia-127622b5)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
var CATS=['building','building_part','wall','fence','emplacement','tree','bush','rock','wreck','bridge','water_surface','ground_decal','road_decal','crater','service','placed_unit','other'];
var FPK={obb:1,circle:1,poly:1,'box-proj':1,decal:1,none:1},FINDMAX=200,TOLPX=6;
// ---- pure helpers (EXT_SCREENS.mapviz.objects.kit) ----
function num(v){return typeof v==='number'&&isFinite(v)}
function ptsOk(p,n){if(!Array.isArray(p)||p.length<n)return false;for(var i=0;i<p.length;i++){var q=p[i];if(!Array.isArray(q)||q.length<2||!num(q[0])||!num(q[1]))return false}return true}
// itemOk(it): an objects item of README 5.3 the page can use: kind object, a uid, a def name, fp of a known kind with its
// points (one for 'none', three or more for a polygon)
function itemOk(it){if(!it||typeof it!=='object'||it.kind!=='object')return false;if(it.uid==null||it.uid==='')return false;if(typeof it.def!=='string'||!it.def)return false;
 var f=it.fp;if(!f||typeof f!=='object'||!FPK[f.kind])return false;return f.kind==='none'?ptsOk(f.pts,1):ptsOk(f.pts,3)}
function areaOf(p){if(p.length<3)return 0;var s=0;for(var i=0,j=p.length-1;i<p.length;j=i++)s+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]);return Math.abs(s/2)}
function centreOf(p){var x=0,y=0;for(var i=0;i<p.length;i++){x+=p[i][0];y+=p[i][1]}return [x/p.length,y/p.length]}
function inside(p,x,y){var c=false;for(var i=0,j=p.length-1;i<p.length;j=i++){var a=p[i],b=p[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c}return c}
function segD(x,y,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l>0?((x-a[0])*dx+(y-a[1])*dy)/l:0;if(t<0)t=0;if(t>1)t=1;var ex=a[0]+t*dx-x,ey=a[1]+t*dy-y;return Math.sqrt(ex*ex+ey*ey)}
function edgeD(p,x,y){var d=Infinity;for(var i=0,j=p.length-1;i<p.length;j=i++){var e=segD(x,y,p[j],p[i]);if(e<d)d=e}return d}
// prep(items) -> {items, bad}: the usable items, each a copy with area (u2), x, y (footprint centre) and n (its order)
function prep(list){var out=[],bad=0;for(var i=0;i<list.length;i++){var it=list[i];if(!itemOk(it)){bad++;continue}var c=centreOf(it.fp.pts);
 out.push({kind:'object',uid:it.uid,def:it.def,category:typeof it.category==='string'?it.category:'other',fp:it.fp,zMin:it.zMin,zMax:it.zMax,area:it.fp.kind==='none'?0:areaOf(it.fp.pts),x:c[0],y:c[1],n:out.length})}
 return {items:out,bad:bad}}
// hits(items, x, y, tolU): inside a footprint or within tolU of its outline, or within tolU of a dot; smallest area first
function hits(items,x,y,tol){tol=num(tol)&&tol>0?tol:0;var out=[];if(!num(x)||!num(y))return out;
 for(var i=0;i<items.length;i++){var it=items[i],p=it.fp.pts;
  if(it.fp.kind==='none'){var dx=p[0][0]-x,dy=p[0][1]-y;if(Math.sqrt(dx*dx+dy*dy)<=tol)out.push(it);continue}
  if(inside(p,x,y)||(tol>0&&edgeD(p,x,y)<=tol))out.push(it)}
 return out.sort(function(a,b){return a.area-b.area||a.n-b.n})}
function catOf(c){return CATS.indexOf(c)>=0?c:'other'}
function catWord(c){var k='mapviz.objects.cat.'+c,s=tx(k);return s===k?String(c==null?'':c).replace(/_/g,' '):s}
function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
function word(k,fb){var s=tx(k);return s===k?fb:s}
// fits(job args, need args): every key field the need names is the job's (map only when the job has one)
function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
  if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
// runOf(V, need): the words of a page job of the need's what that fits it, while queued or running, else null
function runOf(V,n){var js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!n||!Array.isArray(js))return null;
 for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===n.what&&j.target===t&&(!j.map||j.map===m)&&(!j.args||fits(j.args,n.args)))return j.text||word('mapviz.shell.what.'+n.what,String(n.what))}return null}
var KIT={CATS:CATS,itemOk:itemOk,areaOf:areaOf,centreOf:centreOf,inside:inside,edgeD:edgeD,prep:prep,hits:hits,catOf:catOf,catWord:catWord,errText:errText,needOf:needOf,fits:fits,runOf:runOf,TOLPX:TOLPX};
// ---- the objects store, one per page ----
var stores=[];
function of(V){for(var i=0;i<stores.length;i++)if(stores[i][0]===V)return stores[i][1];var s=mkStore(V);stores.push([V,s]);return s}
function mkStore(V){
 var s={state:'none',items:[],bad:0,need:null,mkNeed:null,err:null,sig:'',seq:0,sel:null,ticks:{},fns:[],pickFns:[]};
 CATS.forEach(function(c){s.ticks[c]=true});
 function sigOf(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 function tell(){s.fns.slice().forEach(function(f){try{f(s)}catch(e){}})}
 function sync(){var g=sigOf();if(g===s.sig)return false;s.sig=g;s.seq++;s.state='none';s.items=[];s.bad=0;s.need=null;s.mkNeed=null;s.err=null;s.sel=null;return true}
 // take(env): a vector envelope of the objects layer (the part's own fetch, or the shell's fetch that the draw saw)
 s.take=function(env){if(!env||env.kind!=='vector'||!Array.isArray(env.items)){s.state='error';s.err=tx('mapviz.objects.na');tell();return false}
  var r=prep(env.items);s.items=r.items;s.bad=r.bad;s.state='ready';s.need=null;s.err=null;tell();if(typeof V.relist==='function')V.relist();return true};
 function load(){if(V.q('docBusy'))return;var my=++s.seq;s.state='busy';s.err=null;tell();var p;
  try{p=V.api('GET','layer',{name:'objects'})}catch(e){p=Promise.reject(e)}
  p.then(function(env){if(my!==s.seq)return;s.take(env)},
   function(e){if(my!==s.seq)return;if(e&&e.stale){s.state='none';tell();return}var n=needOf(e);if(n){s.state='need';s.need=n;tell();return}
    s.state='error';s.err=errText(e);tell()})}
 s.on=function(f){if(typeof f==='function')s.fns.push(f)};
 s.onPick=function(f){if(typeof f==='function')s.pickFns.push(f)};
 // ensure(again): forget the items of another key; read them once a map is open and its document (the mode) is known.
 // again (a map, doc or refresh event): a failed read asks once more; the DOM list calls it without, so no retry loop
 s.ensure=function(again){if(V.q('rmt'))return;var changed=sync();if(!V.q('target')||!V.q('map')){if(changed)tell();return}if(s.state==='none'||(again===true&&s.state==='error'))load();else if(changed)tell()};
 s.sync=function(){if(sync())tell()};
 s.ready=function(){return s.state==='ready'&&s.sig===sigOf()};
 s.make=function(){if(!s.need||V.q('rmt'))return;var n=s.need,my=s.seq;s.need=null;s.mkNeed=n;s.state='making';tell();var p;
  try{p=V.job(n.what,n.args||{})}catch(e){p=Promise.reject(e)}
  p.then(function(){if(my!==s.seq)return;s.mkNeed=null;s.state='none';load()},function(e){if(my!==s.seq)return;s.mkNeed=null;if(e&&e.stale){s.state='none';tell();return}s.state='error';s.err=errText(e);tell()})};
 s.runText=function(){return runOf(V,s.need||s.mkNeed)};
 s.shown=function(it){return !!it&&s.ticks[catOf(it.category)]!==false};
 s.at=function(x,y,tol){return s.ready()?hits(s.items,x,y,tol):[]};
 s.byUid=function(uid){if(uid==null)return [];return s.items.filter(function(it){return String(it.uid)===String(uid)})};
 // the lower-case text of each item (def name and kind word), made once per item list, so typing in the find box only compares
 var LO={of:null,a:[]};function los(){if(LO.of!==s.items){LO.of=s.items;LO.a=s.items.map(function(it){return (it.def+'\n'+catWord(it.category)).toLowerCase()})}return LO.a}
 s.find=function(text){var t=String(text==null?'':text).replace(/^\s+|\s+$/g,'').toLowerCase();if(!t)return [];var out=[],lo=los();
  for(var i=0;i<s.items.length&&out.length<FINDMAX;i++)if(lo[i].indexOf(t)>=0)out.push(s.items[i]);return out};
 // names(): the searchKit index of the find box, made once per item list: each def name once with its count, by its kind
 var NM={of:null,a:[]};s.names=function(){if(NM.of===s.items)return NM.a;var m={},a=[];
  s.items.forEach(function(it){var k=it.def;if(!m[k]){m[k]={group:catWord(catOf(it.category)),label:k,value:k,n:0,lo:k.toLowerCase(),o:CATS.indexOf(catOf(it.category))};a.push(m[k])}m[k].n++});
  a.forEach(function(x){x.hint=tx('mapviz.objects.ixCount',{n:x.n})});
  a.sort(function(x,y){return x.o-y.o||(x.label<y.label?-1:x.label>y.label?1:0)});NM.of=s.items;NM.a=a;return a};
 s.select=function(uid){var v=uid==null?null:String(uid);if(s.sel===v)return;s.sel=v;tell();if(typeof V.redraw==='function')V.redraw()};
 // pick(item): an object chosen outside the map (the find list): the card opens it
 s.pick=function(it){if(!it)return;s.pickFns.slice().forEach(function(f){try{f(it)}catch(e){}})};
 if(typeof V.on==='function'){
  V.on('map',function(){s.ensure(true)});
  V.on('doc',function(){s.ensure(true)});
  V.on('refresh',function(){s.ensure(true)});
  // a page job ended or the cache answer changed (W1): items that were not made, a stale read or a failed read are read
  // again once (a failed read sets no event, so no loop); items being made wait for their own job
  V.on('products',function(){if(V.q('rmt')||!V.q('map')||s.sig!==sigOf())return;if((s.state==='need'&&!s.runText())||s.state==='none'||s.state==='error')load()});
  V.on('job',function(){if(s.state==='need'||s.state==='making')tell()})}
 return s}
MV.objects={of:of,kit:KIT};
MV.picks=MV.picks||[];
// ---- the part ----
MV.parts.push({id:'objects',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=MV.kit||null,S0=of(V),el={},ticks={};
 function css(hx){return hx&&K&&K.colourCss?K.colourCss(hx):''}
 function na(){return new Error(tx('mapviz.objects.na'))}
 function marks(){return (V.pal&&V.pal.marks)||{}}
 // the objects palette: the envelope's (pal 'objects') or palette.json objects; another pal is a fault
 function palO(env){if(env&&env.pal!=null&&env.pal!=='objects')throw na();if(env&&env.pal==='objects'&&env.palette)return env.palette;return (V.pal&&V.pal.objects)||null}
 function look(P,cat){var c=P&&P.categories&&P.categories[cat]||null,m=marks();return {fill:css(c&&c.fill||P&&P.fill),line:css(c&&c.line||P&&P.line||m.cursor)||(V.token?V.token('fg'):'')}}
 function visible(){var ls=V.q('allLayers');return !Array.isArray(ls)||ls.indexOf('objects')>=0}
 function tolU(){var z=V.view&&V.view.zoom;return TOLPX/(z>0?z:1)}
 function path(ctx,view,p){ctx.beginPath();for(var k=0;k<p.length;k++){var q=view.toScreen(p[k][0],p[k][1]);if(k)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])}if(ctx.closePath)ctx.closePath()}
 function draw(ctx,view){var env=view&&view.env,items=null;
  if(env){if(env.kind!=='vector'||!Array.isArray(env.items))throw na();palO(env);S0.sync();if(!S0.ready()&&S0.state!=='making'&&S0.state!=='need')S0.take(env);items=S0.ready()?S0.items:prep(env.items).items}
  else if(S0.ready())items=S0.items;
  if(!items||!ctx||!ctx.beginPath)return;var P=palO(env),m=marks();
  items.forEach(function(it){if(!S0.shown(it))return;var c=look(P,catOf(it.category)),p=it.fp.pts;
   if(it.fp.kind==='none'){var q=view.toScreen(p[0][0],p[0][1]);ctx.beginPath();ctx.arc(q[0],q[1],3,0,Math.PI*2);ctx.fillStyle=c.fill||c.line;ctx.fill();return}
   path(ctx,view,p);if(c.fill){ctx.fillStyle=c.fill;ctx.fill()}ctx.strokeStyle=c.line;ctx.lineWidth=1;ctx.stroke()});
  if(S0.sel==null)return;
  items.forEach(function(it){if(String(it.uid)!==S0.sel)return;var p=it.fp.pts,sel=css(P&&P.selected||m.measure)||(V.token?V.token('acc'):''),cas=P&&P.selected?'':css(m.measureCasing);
   if(it.fp.kind==='none'){var q=view.toScreen(p[0][0],p[0][1]);ctx.beginPath();ctx.arc(q[0],q[1],6,0,Math.PI*2)}else path(ctx,view,p);
   if(cas){ctx.strokeStyle=cas;ctx.lineWidth=5;ctx.stroke()}ctx.strokeStyle=sel;ctx.lineWidth=3;ctx.stroke()})}
 function hit(x,y){var hs=S0.at(x,y,tolU()).filter(S0.shown);if(!hs.length)return null;var it=hs[0];
  return [{label:'mapviz.objects.hitCat',value:catWord(it.category),part:'objects'},{label:'mapviz.objects.hitDef',value:it.def,part:'objects'}]}
 // the DOM list: the find hits while the find box holds text, else every object of a ticked category
 function list(){S0.ensure();if(!S0.ready())return [];var t=el.find&&el.find.value?S0.find(el.find.value):null;
  return (t||S0.items).filter(S0.shown).map(function(it){return {label:it.def+' ('+catWord(it.category)+')',x:it.x,y:it.y}})}
 function legend(){var P=V.pal&&V.pal.objects,m=V.pal&&V.pal.marks;if(!P&&!m)return null;var rows=[];
  if(P&&P.categories){var seen={};S0.items.forEach(function(it){seen[catOf(it.category)]=1});
   CATS.forEach(function(c){var e=P.categories[c];if(e&&(seen[c]||!S0.items.length))rows.push({color:e.fill||e.line||null,label:catWord(c)})})}
  else rows.push({color:m&&m.cursor||null,label:tx('mapviz.objects.legAll')});
  rows.push({color:null,label:tx('mapviz.objects.legClick')});return rows}
 // an estimate: the footprints are a port of the game's obstacle shape fit, but what the layer shows by colour, the 17
 // categories, is our own reading of the def folder, props and name (tools/mapviz/entcat/category.js); no game file or
 // engine routine sorts objects that way
 V.addLayer({id:'objects',group:'objects',label:'mapviz.objects.layer',engineTrue:false,defaultOn:true,source:'objects',draw:draw,hit:hit,list:list,legend:legend});
 MV.picks.push({id:'objects',V:V,at:function(x,y,tol){if(!visible())return [];return S0.at(x,y,tol==null?tolU():tol).filter(S0.shown).map(function(it){return {type:'object',item:it}})}});
 // ---- the panel ----
 function status(){var b=el.status;if(!b)return;b.textContent='';var k=null,a={};
  if(!V.q('map'))k='mapviz.objects.noMap';
  else if(S0.state==='making'||(S0.state==='need'&&S0.runText())){var rt=S0.runText();k=rt?'mapviz.objects.makingJob':'mapviz.objects.making';a={job:rt||''}}
  else if(S0.state==='need')k='mapviz.objects.need';
  else if(S0.state==='busy')k='mapviz.objects.loading';
  else if(S0.state==='error'){k='mapviz.objects.fault';a={msg:S0.err||''}}
  else if(S0.ready()){k='mapviz.objects.count';a={n:S0.items.length}}
  else if(V.q('docBusy'))k='mapviz.objects.waitDoc';
  else k='mapviz.objects.loading';
  b.appendChild(h('span',{text:tx(k,a)}));
  if(S0.ready()&&S0.bad)b.appendChild(h('span',{text:' '+tx('mapviz.objects.bad',{n:S0.bad})}));
  if(k==='mapviz.objects.need')b.appendChild(h('span',{},[h('span',{text:' '}),h('button',{type:'button',text:tx('mapviz.objects.make'),title:tx('mapviz.objects.makeT'),onclick:function(){S0.make()}})]))}
 // the find hits: at most lim buttons (Show more adds 100), the rest counted on the button
 var LIM0=50,lim=LIM0,lastT='';
 function drawHits(){var b=el.hits;if(!b)return;b.textContent='';var t=el.find&&el.find.value;if(t!==lastT){lastT=t;lim=LIM0}if(!t)return;var hs=S0.find(t).filter(S0.shown);
  if(!hs.length){b.appendChild(h('p',{class:'hint',text:tx('mapviz.objects.noHits')}));return}
  var all=hs.length;hs=hs.slice(0,lim);
  var ul=h('ul',{});hs.forEach(function(it){ul.appendChild(h('li',{},[h('button',{type:'button',class:'link',text:it.def+' ('+catWord(it.category)+')',
   onclick:function(){if(typeof V.go==='function'){try{V.go({x:it.x,y:it.y})}catch(e){}}S0.pick(it)}})]))});b.appendChild(ul);
  if(all>lim)b.appendChild(h('button',{type:'button',text:tx('mapviz.objects.showMore',{n:Math.min(100,all-lim),left:all-lim}),onclick:function(){lim+=100;drawHits()}}))}
 // fast typing: the hits, the DOM list and the map are drawn again once in the next frame for many keys
 var cwant=false;
 function frame(f){var w=typeof window==='object'&&window;if(w&&typeof w.requestAnimationFrame==='function')w.requestAnimationFrame(f);else setTimeout(f,0)}
 function changedNow(){drawHits();if(typeof V.relist==='function')V.relist();if(typeof V.redraw==='function')V.redraw()}
 function changed(){if(cwant)return;cwant=true;frame(function(){cwant=false;changedNow()})}
 V.addPanel({id:'objects',side:'right',build:function(box){
  box.appendChild(h('div',{blk:'mv.objects.title','data-blkname':tx('mapviz.objects.title')},[h('h3',{text:tx('mapviz.objects.title')})]));
  el.status=h('p',{blk:'mv.objects.status',class:'hint',role:'status','data-blkname':tx('mapviz.objects.blk.status')});box.appendChild(el.status);
  var cats=h('div',{blk:'mv.objects.cats',role:'group','aria-label':tx('mapviz.objects.cats'),'data-blkname':tx('mapviz.objects.cats')},[h('p',{class:'hint',text:tx('mapviz.objects.cats')})]);
  CATS.forEach(function(c){var cb=h('input',{type:'checkbox','data-cat':c,onchange:function(){S0.ticks[c]=!!cb.checked;changed()}});cb.checked=S0.ticks[c]!==false;ticks[c]=cb;
   cats.appendChild(h('label',{class:'f'},[cb,h('span',{text:' '+catWord(c)})]))});
  box.appendChild(cats);
  var ft=tx('mapviz.objects.find');el.find=h('input',{type:'search','aria-label':ft,placeholder:tx('mapviz.objects.findHint'),oninput:function(){changed()},onchange:function(){changed()}});
  // searchKit (page.js; owner 2026-11-19: every search box has Browse, History and an index): history 'mapviz.objectsFind', index
  // = the object names of the map (each once, with its count) by kind; Browse = the .def files under entity/ in the game's data (the
  // mod on top), a pick gives the name without .def; a pick finds that name. Absent in a harness without the kit: the plain box
  function names(){return S0.ready()?S0.names():[]}
  function nhits(q,done){q=String(q||'').trim().toLowerCase();var a=names(),f=[],l=[],n=0;
   for(var i=0;i<a.length;i++){var p=a[i].lo.indexOf(q);if(p<0)continue;n++;if(p===0){if(f.length<40)f.push(a[i])}else if(l.length<40)l.push(a[i])}
   var o=f.concat(l).slice(0,40);done(o,n-o.length)}
  var kit=typeof searchKit==='function'?searchKit(el.find,{key:'mapviz.objectsFind',index:nhits,
   browse:{mode:'file',view:'data',start:'entity',exts:['def'],toValue:function(p,e){return String(e&&e.name||p).split('/').pop().replace(/\.def$/i,'')}},
   onPick:function(v){el.find.value=v;changedNow()}}):null;
  box.appendChild(h('div',{class:'fld',blk:'mv.objects.find','data-blkname':ft},[h('label',{class:'f'},[h('span',{class:'n',text:ft}),kit?kit.el:el.find,h('span')])]));
  el.hits=h('div',{blk:'mv.objects.hits','aria-live':'polite','data-blkname':tx('mapviz.objects.blk.hits')});box.appendChild(el.hits);
  status()}});
 S0.on(function(){status();drawHits()});
 V.on('map',function(){status()});
 V.on('doc',function(){status()});
}});
})();
`;
