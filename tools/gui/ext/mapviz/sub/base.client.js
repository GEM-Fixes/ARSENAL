// Map Viewer base layers (MV-PG1, second half A): tools/mapviz/README.md 1.10 (page API V), 4.4 (shade, pic.topo,
// gtype, material, slopecls, height), 5.2 (tiles), 5.3 (contours), 5.4 (height stops, ground, slope), 6.1 (routes);
// 11 (base preset "Topographic").
// Layers: 'base' (group base): the chosen base picture, one of topographic (pic.topo tiles + contours with their height
// labels), schematic picture (job l0), ground picture (job l1), ground types, ground materials, none. A base whose part
// is not built ('parts' route) shows as not built, never as an error. Group height: 'shade' (shaded relief), 'height'
// (height bands), 'contours' (skipped while the base is topographic: it holds them already), 'slopecls' (slope classes).
// The panel: the base picker, the one-click preset "Topographic", a status line with the Make button for a picture
// that is not made yet. A layer whose data is missing or wrong throws "not available" from its draw: the shell shows
// that on the layer row and still draws the others. Colours only from palette.json (V.pal or the envelope's palette).
// While the job that makes the chosen picture runs, the status keeps its stage words and progress ('job' event). When a
// page job ends or the cache changes ('products'), a "not made" picture asks again once. A map the user picks opens
// with the topographic picture job started by itself when that picture is not made yet (design 11.1: only on a pick).
// Author: Imperator_Aug (ARSENAL, ia-5f5a3336)
// SLOPE: the vanilla pather.set slope angles per game and kind (inf, at, tank), from tools/mapviz/rules/pass VANILLA
// [V]
const PS = require('../../../../mapviz/rules/pass');
const SLOPE = {};
for (const g of ['as2', 'goh']) {
  SLOPE[g] = ['inf', 'at', 'tank'].map(kind => {
    const row = PS.VANILLA[g].find(r => r.patherId === PS.KIND_VANILLA[g][kind]);
    const bi = row.heights.findIndex(v => v < 0), ci = row.heights.findIndex(v => v > 0);
    return { kind, block: bi < 0 ? null : bi * PS.CLASS_DEG, cost: ci < 0 || (bi >= 0 && ci > bi) ? null : ci * PS.CLASS_DEG };
  });
}
module.exports = String.raw`
(function(){
var SLOPE=/*SLOPE*/{};
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
EXT_SCREENS.mapviz.parts.push({id:'base',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=EXT_SCREENS.mapviz.kit||null;
 var CHOICES=['topo','l0','l1','gtype','material','none'];
 var PART={topo:'raster',l0:'render',l1:'render',gtype:'mapkit',material:'mapkit'};
 var TILES={topo:1,l0:1,l1:1},NEEDPART={l0:1,l1:1};
 var st={choice:'topo',built:null,partsFor:null,open:null,auto:null,tried:false,live:false},C={},el={};
 // the job that makes each choice (a need from the server names its own; this is the fallback)
 var JOB={topo:'topo',l0:'l0',l1:'l1',gtype:'grids',material:'grids'};
 // cache keys: the topographic picture does not depend on the mode (its job keys the size only), so its key leaves the
 // mode out and a mode change after the map opens does not make it "not made" again (W3); every other entry is per mode.
 // Every key holds the context (game folder and mod), so an entry of another context is never found under a new key
 function ctxOf(){return (V.q('game')||'')+'|'+(V.q('mod')||'')}
 function kOf(kind,name){var t=V.q('target')||'',m=V.q('map')||'';return kind==='tiles'&&name==='topo'?t+'|'+m+'|*|'+ctxOf()+'|tiles|topo':sig()+'|'+kind+'|'+name}
 // the words of a page job of this what queued or running for the open map, else null (V.q('jobs') may be absent); with
 // the need's args, only a job whose key fields (j.args, as posted) are the need's: a topo job of another size is not ours
 function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
   if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
 function runText(what,args){var js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!what||!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===what&&j.target===t&&(!j.map||j.map===m)&&(!j.args||fits(j.args,args)))return j.text||String(what)}return null}
 // ---- small helpers ----
 function css(hx){return K&&K.colourCss?K.colourCss(hx):''}
 function c4(hx){return K&&K.colour?K.colour(hx):null}
 function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
 function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
 function notBuiltErr(e){return !!e&&(e.status===501||/MV_NOT_BUILT/.test(String(e.key||'')+' '+String(e.message||'')))}
 function na(){return new Error(tx('mapviz.base.na'))}
 function sig(){return [V.q('target')||'',V.q('map')||'',V.q('mode')||'',ctxOf()].join('|')}
 function palAt(p){var v=V.pal;String(p).split('.').forEach(function(k){v=v&&typeof v==='object'?v[k]:undefined});return v===undefined?null:v}
 // the palette part of an envelope: its own when its pal is the expected one, else palette.json; another pal is a defect (null)
 function palOf(env,want){if(!env)return null;if(env.pal!=null&&env.pal!==want)return null;return env.palette!=null?env.palette:palAt(want)}
 function num(x,d){var f=Math.pow(10,d||0);return String(Math.round(x*f)/f)}
 // ---- built parts (GET parts) ----
 function isBuilt(c){if(c==='none')return true;if(!st.built)return !NEEDPART[c];var s=st.built[PART[c]];return NEEDPART[c]?s==='built':s!=='not built'}
 function loadParts(){var t=V.q('target');if(!t||st.partsFor===t)return;st.partsFor=t;
  V.api('GET','parts').then(function(r){var b={};(r&&r.parts||[]).forEach(function(p){if(p&&p.part)b[p.part]=p.state});st.built=b;drawPick();status();V.redraw()},function(){st.built={};drawPick();status()})}
 // ---- data: layer envelopes and tile pictures, cached per target, map and mode ----
 // while the shell reads the map's document (V.q('docBusy')) the mode is not known yet: nothing is fetched (a fetch then
 // would go with no mode); an entry that waits is not kept, so the read goes once the 'map' or 'doc' event says the
 // document is there (or failed)
 function docBusy(){return !!V.q('docBusy')}
 function waiting(kind,name){return {kind:kind,name:name,env:null,hd:null,need:null,err:null,nb:false,busy:true,img:{},wait:true}}
 function get(name){var k=kOf('layer',name),c=C[k];if(c)return c;if(docBusy())return waiting('layer',name);c=C[k]={kind:'layer',name:name,env:null,need:null,err:null,nb:false,busy:true};
  if(!V.q('target')||!V.q('map')){c.busy=false;return c}
  V.api('GET','layer',{name:name}).then(function(env){c.busy=false;if(!env||(env.kind!=='grid'&&env.kind!=='vector'))c.err=tx('mapviz.base.na');else c.env=env;status();V.redraw()},
   function(e){c.busy=false;fail(c,e)});
  return c}
 function fail(c,e){var n=needOf(e);if(n)c.need=n;else if(notBuiltErr(e))c.nb=true;else c.err=errText(e);status();V.redraw()}
 function tiles(base){var k=kOf('tiles',base),t=C[k];if(t)return t;if(docBusy())return waiting('tiles',base);t=C[k]={kind:'tiles',name:base,hd:null,need:null,err:null,nb:false,busy:true,img:{}};
  if(!V.q('target')||!V.q('map')){t.busy=false;return t}
  V.api('GET','tiles',{base:base,z:0,t:'0.0'}).then(function(a){t.busy=false;
    if(!a||!(a.w>0)||!(a.h>0)||!(a.cell>0)){t.err=tx('mapviz.base.na');status();autoGo();return}
    t.hd={zmax:a.zmax>0?a.zmax|0:0,w:a.w,h:a.h,ox:a.ox,oy:a.oy,cell:a.cell};take(t,a);status();autoGo();V.redraw()},
   function(e){t.busy=false;fail(t,e);autoGo()});
  return t}
 function take(t,a){(a&&a.tiles||[]).forEach(function(x){if(!x)return;var k=a.z+'|'+x.t;if(x.missing||!x.png){t.img[k]={missing:true};return}
  var r={img:null,ok:false};t.img[k]=r;if(typeof Image!=='function')return;
  try{var im=new Image();im.onload=function(){r.ok=true;V.redraw()};im.src='data:image/png;base64,'+x.png;r.img=im;if(im.complete&&im.width)r.ok=true}catch(e){}})}
 function fetchTiles(t,base,z,list){list.forEach(function(n){t.img[z+'|'+n]={busy:true}});
  V.api('GET','tiles',{base:base,z:z,t:list.join(',')}).then(function(a){take(t,a);V.redraw()},function(){list.forEach(function(n){t.img[z+'|'+n]={failed:true}})})}
 // README 5.2 through the shell's own tile maths (EXT_SCREENS.mapviz._t: level pick, tiles in view, tile rectangle);
 // the part keeps only its cache and its fetch
 function drawTiles(ctx,view,t,base){var hd=t.hd,T=EXT_SCREENS.mapviz._t;if(!hd||!ctx.drawImage||!T||!T.pickZ||!T.tileList||!T.tileRect)return;
  var z=T.pickZ(hd,view.zoom),list=T.tileList(hd,z,view,view.w,view.h),ask=[];
  list.forEach(function(n){var r=t.img[z+'|'+n];if(!r){ask.push(n);return}
   // the shell's tileBox snaps each tile to whole pixels by its edges, so the mosaic shows no seam at any zoom or pan
   if(r.ok&&r.img){var xy=n.split('.'),b;if(T.tileBox)b=T.tileBox(hd,z,+xy[0],+xy[1],view,view.w,view.h);else{var R=T.tileRect(hd,z,+xy[0],+xy[1]),p=view.toScreen(R.x,R.y);b=[p[0],p[1],R.s*view.zoom,R.s*view.zoom]}
    try{ctx.drawImage(r.img,b[0],b[1],b[2],b[3])}catch(e){}}});
  for(var i=0;i<ask.length;i+=16)fetchTiles(t,base,z,ask.slice(i,i+16))}
 // ---- grid drawing through the shell's kit; the colour function's key decides when the picture is made again ----
 function paint(ctx,view,env,key,fn){if(!env||env.kind!=='grid'||!K||!K.gridDraw)throw na();if(env._mvb!==key){env._img=null;env._mvb=key}
  var r=K.gridDraw(ctx,view,env,{colour:fn});if(r&&r!=='nodraw')throw na()}
 function range(env){if(env._mvr)return env._mvr;var d=K&&K.decode?K.decode(env):null,lo=Infinity,hi=-Infinity;
  if(d&&d.vals)for(var i=0;i<d.vals.length;i++){var v=d.vals[i];if(v===v){if(v<lo)lo=v;if(v>hi)hi=v}}env._mvr=[lo,hi];return env._mvr}
 function stopAt(stops,t){var k;for(k=1;k<stops.length;k++)if(t<=stops[k].at)break;if(k>=stops.length)return stops[stops.length-1].c;
  var a=stops[k-1],b=stops[k],u=b.at>a.at?(t-a.at)/(b.at-a.at):0;return [0,1,2,3].map(function(j){return Math.round(a.c[j]+(b.c[j]-a.c[j])*u)})}
 function gtypeFn(env){var p=palOf(env,'ground.types'),o=c4(palAt('ground.other'));if(!Array.isArray(p))throw na();var by={};
  p.forEach(function(e,i){if(e&&e.fill)by[typeof e.code==='number'?e.code:i]=c4(e.fill)});return function(v){return by[v]||o}}
 function matFn(env){var p=palOf(env,'ground.materials');if(!p||typeof p!=='object'||Array.isArray(p))throw na();var names=(env.meta&&env.meta.names)||{},by={},o=c4(p.other||palAt('ground.other'));
  Object.keys(names).forEach(function(id){by[id]=c4(p[names[id]])||o});return function(v){return by[v]||o}}
 function heightFn(env){var p=palOf(env,'height');if(!p||!Array.isArray(p.stops))throw na();var stops=p.stops.map(function(s){return {at:s.at,c:c4(s.color)}}).filter(function(s){return s.c});
  if(!stops.length)throw na();var r=range(env),lo=r[0],hi=r[1];
  return function(v){var t=hi>lo?(v-lo)/(hi-lo):0,b=Math.min(9,Math.max(0,Math.floor(t*10)));return stopAt(stops,(b+0.5)/10)}}
 function shadeFn(env){var p=palOf(env,'height.shade');if(!p||!p.light||!p.dark)throw na();var m=env.meta||{},alt=m.alt>0?m.alt:30,
  F=m.flat>0&&m.flat<255?m.flat:Math.round(255*Math.sin(alt*Math.PI/180)),sg=typeof p.strength==='number'?p.strength:0.55,L=c4(p.light),D=c4(p.dark);if(!L||!D)throw na();
  return function(v){if(v<F)return [D[0],D[1],D[2],Math.round(255*sg*(F-v)/F)];if(v>F)return [L[0],L[1],L[2],Math.round(255*sg*(v-F)/(255-F))];return null}}
 function slopeFn(env){var p=palOf(env,'slope.classes');if(!Array.isArray(p))throw na();var by=p.map(function(x){return c4(typeof x==='string'?x:x&&x.fill)});return function(v){return by[v]||null}}
 // contours (README 5.3): lines, index lines thicker; labels upright along the line, with a halo
 function drawContours(ctx,view,env){var p=palOf(env,'height.contour');if(!env||env.kind!=='vector'||!p)throw na();var items=env.items||[],i,k;
  if(!ctx.beginPath)return;
  for(i=0;i<items.length;i++){var it=items[i];if(!it||it.kind!=='contour'||!Array.isArray(it.pts)||it.pts.length<2)continue;ctx.beginPath();
   for(k=0;k<it.pts.length;k++){var q=view.toScreen(it.pts[k][0],it.pts[k][1]);if(k)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])}
   ctx.strokeStyle=css(it.index?p.index:p.line);ctx.lineWidth=(it.index?p.indexWidth:p.width)||1;ctx.stroke()}
  if(!ctx.fillText)return;
  var turn=!!(ctx.translate&&ctx.rotate&&ctx.save&&ctx.restore);
  for(i=0;i<items.length;i++){var lb=items[i];if(!lb||lb.kind!=='contourLabel'||typeof lb.x!=='number')continue;var s=view.toScreen(lb.x,lb.y),txt=tx('mapviz.base.m',{m:num(lb.level,1)}),x=s[0],y=s[1];
   if(turn){ctx.save();ctx.translate(s[0],s[1]);ctx.rotate(-(lb.angle||0)*Math.PI/180);x=0;y=0}
   try{ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    if(ctx.strokeText){ctx.strokeStyle=css(p.halo);ctx.lineWidth=3;ctx.strokeText(txt,x,y)}ctx.fillStyle=css(p.label);ctx.fillText(txt,x,y)}
   finally{if(turn)ctx.restore()}}}
 // ---- the base layer ----
 function drawBase(ctx,view){var c=st.choice;if(c==='none'||!V.q('map')||docBusy())return;if(!isBuilt(c))return;
  if(TILES[c]){var t=tiles(c);if(t.err)throw na();drawTiles(ctx,view,t,c);if(c==='topo'){var ce=get('contours');if(ce.env)drawContours(ctx,view,ce.env)}return}
  var g=get(c);if(g.err)throw na();if(!g.env)return;
  paint(ctx,view,g.env,c,c==='gtype'?gtypeFn(g.env):matFn(g.env))}
 // the codes a grid holds (the legend lists only those)
 function present(env){if(env._mvp)return env._mvp;var d=null,o={};try{d=K&&K.decode?K.decode(env):null}catch(e){d=null}if(!d||!d.vals)return null;
  for(var i=0;i<d.vals.length;i++){var v=d.vals[i];if(v===v)o[v]=1}env._mvp=o;return o}
 function gtLabel(id){var s=tx('mapviz.base.gt.'+id);return s==='mapviz.base.gt.'+id?tx('mapviz.base.gt.other'):s}
 function matLabel(n){var s=tx('mapviz.base.mat.'+n);return s==='mapviz.base.mat.'+n?String(n):s}
 function legendBase(){var c=st.choice,rows=[];if(!V.pal)return null;
  if(c==='topo'){var hp=palAt('height'),cp=palAt('height.contour');if(hp&&hp.stops&&hp.stops.length){rows.push({color:hp.stops[0].color,label:tx('mapviz.base.low')});rows.push({color:hp.stops[hp.stops.length-1].color,label:tx('mapviz.base.high')})}
   if(cp){rows.push({color:cp.line,label:tx('mapviz.base.contourLine')});rows.push({color:cp.index,label:tx('mapviz.base.contourIndex')})}return rows}
  // ground types: the codes on the drawn grid (after the load re-type), one row per palette code there, and one
  // 'other' row when a code there has no palette entry (GoH 15, an unknown type)
  if(c==='gtype'){var ty=palAt('ground.types')||[],gt=C[kOf('layer','gtype')],seen=gt&&gt.env?present(gt.env):null,known={},odd=false;if(!seen)return rows;
   ty.forEach(function(e,i){if(!e)return;var code=typeof e.code==='number'?e.code:i;known[code]=1;if(seen[code])rows.push({color:e.fill,label:gtLabel(code)})});
   Object.keys(seen).forEach(function(k){if(!known[k])odd=true});if(odd)rows.push({color:palAt('ground.other'),label:tx('mapviz.base.gt.other')});return rows}
  if(c==='material'){var mp=palAt('ground.materials')||{},g=C[kOf('layer','material')],names=g&&g.env&&g.env.meta&&g.env.meta.names||{};
   var here=g&&g.env?present(g.env):null;
   Object.keys(names).forEach(function(id){var n=names[id];if(here&&!here[id])return;rows.push({color:mp[n]||mp.other,label:matLabel(n)})});return rows}
  return null}
 // the base layer's legend changes with the picker, so the panel draws it (the shell's legend is drawn on layer changes only)
 V.addLayer({id:'base',group:'base',label:'mapviz.base.layer',engineTrue:false,defaultOn:true,draw:drawBase});
 V.addLayer({id:'shade',group:'height',label:'mapviz.base.shade',engineTrue:false,defaultOn:false,source:'shade',
  draw:function(ctx,view){if(view.env)paint(ctx,view,view.env,'shade',shadeFn(view.env))},
  legend:function(){var p=palAt('height.shade');return p?[{color:p.light,label:tx('mapviz.base.lit')},{color:p.dark,label:tx('mapviz.base.dark')}]:null}});
 V.addLayer({id:'height',group:'height',label:'mapviz.base.height',engineTrue:true,defaultOn:false,source:'height',
  draw:function(ctx,view){if(view.env)paint(ctx,view,view.env,'height',heightFn(view.env))},
  legend:function(){var p=palAt('height');if(!p||!p.stops||!p.stops.length)return null;return [{color:p.stops[0].color,label:tx('mapviz.base.low')},{color:p.stops[p.stops.length-1].color,label:tx('mapviz.base.high')}]}});
 V.addLayer({id:'contours',group:'height',label:'mapviz.base.contours',engineTrue:true,defaultOn:false,source:'contours',
  draw:function(ctx,view){if(st.choice==='topo')return;if(view.env)drawContours(ctx,view,view.env)},
  legend:function(){var p=palAt('height.contour');return p?[{color:p.line,label:tx('mapviz.base.contourLine')},{color:p.index,label:tx('mapviz.base.contourIndex')}]:null}});
 V.addLayer({id:'slopecls',group:'height',label:'mapviz.base.slope',engineTrue:true,defaultOn:false,source:'slopecls',
  draw:function(ctx,view){if(view.env)paint(ctx,view,view.env,'slope',slopeFn(view.env))},
  // the marks are the vanilla pather.set slope angles of the game on this tab (SLOPE, built from rules/pass VANILLA when the
  // page is built): per kind the block angle, or where the kind is never blocked (GoH t34, cannon.small) the angle its
  // slope cost starts; a mod's own pather.set may differ (the pass layers read the stack's)
  legend:function(){var p=palAt('slope');if(!p||!Array.isArray(p.classes))return null;var d=p.classDeg||6,rows=[],L=SLOPE[V.q('target')==='goh'?'goh':'as2']||[];
   L.forEach(function(x){var blk=typeof x.block==='number',deg=blk?x.block:x.cost;if(typeof deg!=='number')return;
    rows.push({color:p.classes[Math.min(p.classes.length-1,Math.floor(deg/d))],label:tx(blk?'mapviz.base.slopeBlock':'mapviz.base.slopeCost',{deg:deg,who:tx('mapviz.shell.kind.'+x.kind)})})});
   return rows.length?rows:null}});
 // ---- the panel ----
 function entry(c){return C[kOf(TILES[c]?'tiles':'layer',c)]||null}
 // status(): once the page is live (a refresh or a map event came) a choice with no entry asks for it here, so the
 // status never waits for a draw (base layer or its group off, no canvas)
 function status(){if(!el.status)return;var c=st.choice,k=null,a=null,btn=null;
  if(st.live&&!entry(c))ask();
  if(c==='none')k=null;else if(!V.q('map'))k='mapviz.base.noMap';else if(!isBuilt(c))k='mapviz.base.notBuilt';
  else{var x=entry(c),rt=x&&x.need?runText(x.need.what,x.need.args):runText(JOB[c]);
   // a job that makes this picture runs (ours or one another part started): its words stay until it ends, no button (W3);
   // with no entry yet (it waits for that job) the words of the job show too
   if(x&&(x.mk||(x.need&&rt))||(!x&&rt&&!docBusy())){k=x&&x.auto?(rt?'mapviz.base.autoJob':'mapviz.base.auto'):(rt?'mapviz.base.makingJob':'mapviz.base.making');a={job:rt||''}}
   else if(!x||x.busy)k='mapviz.base.loading';else if(x.nb)k='mapviz.base.notBuilt';else if(x.need){k='mapviz.base.need';btn=makeBtn(x)}else if(x.err){k='mapviz.base.fault';a={msg:x.err}}}
  el.status.textContent=k?tx(k,a||{}):'';if(btn){el.status.appendChild(h('span',{text:' '}));el.status.appendChild(btn)}
  if(el.preset)el.preset.setAttribute('aria-pressed',c==='topo'?'true':'false');drawLegend()}
 function drawLegend(){var box=el.legend;if(!box)return;box.textContent='';var rows=legendBase();if(!rows||!rows.length)return;
  box.appendChild(h('b',{text:tx('mapviz.base.c.'+st.choice)}));
  rows.forEach(function(r){var sw=h('span',{'aria-hidden':'true',style:'display:inline-block;width:1em;height:1em;vertical-align:middle;border:1px solid var(--line)'}),c=css(r.color);
   if(c&&sw.style)sw.style.background=c;box.appendChild(h('div',{},[sw,h('span',{text:' '+r.label})]))})}
 function makeBtn(x){return h('button',{type:'button',text:tx('mapviz.base.make'),onclick:function(){make(x,false)}})}
 // make(x, auto): post the job the need names (a job the same as a running one joins it on the server); while it runs
 // the status keeps its words; when it ends done the entries of this map are dropped and asked again
 function make(x,auto){if(!x||x.mk||!x.need)return;var n=x.need;x.mk=true;x.auto=!!auto;status();
  V.job(n.what,n.args||{}).then(function(){x.mk=false;var s=sig(),tk=kOf('tiles','topo');Object.keys(C).forEach(function(k){if(k.indexOf(s+'|')===0||k===tk)delete C[k]});ask();status();V.redraw()},
   function(e){x.mk=false;x.need=null;if(notBuiltErr(e))x.nb=true;else x.err=errText(e);status()})}
 // W6: a map the user picked opens with the topographic base: its picture job starts by itself when it is not made yet.
 // Only on a pick (the 'map' event's user flag), once per open, never on a refresh, a remembered map or a permalink
 function autoGo(){var k=st.auto;if(!k||st.choice!=='topo'||!isBuilt('topo'))return;if(k!==(V.q('target')||'')+'|'+(V.q('map')||'')){st.auto=null;return}
  var t=tiles('topo');if(t.busy)return;st.auto=null;st.tried=true;if(t.need&&!t.mk&&!runText(t.need.what,t.need.args))make(t,true);else status()}
 // ask(): read the entry of the current choice now, with no draw (P3): at a map open, on a refresh, after 'products' or
 // the user's own Make dropped an entry, and when the status finds none; also while the base layer or its group is off
 // or no canvas draws. One fetch per key (tiles() and get() keep it); none while the document is read or while the job
 // that makes this choice runs (its end asks: 'products')
 function ask(){var c=st.choice;if(c==='none'||!V.q('target')||!V.q('map')||!isBuilt(c)||docBusy()||entry(c)||runText(JOB[c]))return;if(TILES[c])tiles(c);else get(c)}
 function choose(c){if(CHOICES.indexOf(c)<0)c='none';st.choice=c;if(el.pick)el.pick.value=c;status();V.redraw()}
 function drawPick(){var s=el.pick;if(!s)return;s.textContent='';CHOICES.forEach(function(c){var ok=isBuilt(c),name=tx('mapviz.base.c.'+c);
   s.appendChild(h('option',{value:c,text:ok?name:tx('mapviz.base.notBuiltOpt',{name:name}),disabled:!ok}))});s.value=st.choice}
 V.addPanel({id:'base',side:'right',build:function(box){var t=tx('mapviz.base.choose');
  el.pick=h('select',{onchange:function(){choose(el.pick.value)}});drawPick();
  el.preset=h('button',{type:'button',text:tx('mapviz.base.preset'),title:tx('mapviz.base.presetT'),'aria-pressed':'true',onclick:function(){choose('topo')}});
  el.status=h('p',{blk:'mv.base.status',class:'hint',role:'status','aria-live':'polite','data-blkname':tx('mapviz.base.blk.status')});
  el.legend=h('div',{blk:'mv.base.legend','data-blkname':tx('mapviz.base.blk.legend')});
  box.appendChild(h('div',{blk:'mv.base.title','data-blkname':tx('mapviz.base.title')},[h('h3',{text:tx('mapviz.base.title')})]));
  box.appendChild(h('div',{class:'fld',blk:'mv.base.pick','data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),el.pick,h('span')])]));
  box.appendChild(h('div',{blk:'mv.base.preset',class:'row','data-blkname':tx('mapviz.base.blk.preset')},[el.preset]));
  box.appendChild(el.status);box.appendChild(el.legend);status()}});
 V.on('refresh',function(){st.live=true;loadParts();ask();status()});
 // an entry stays only while its key is still the one for the open map (and mode); the topographic picture keeps its
 // entry over a mode change. With a map and its document there the current choice asks at once (no draw needed)
 V.on('map',function(d){st.live=true;Object.keys(C).forEach(function(k){var x=C[k];if(!x||k!==kOf(x.kind,x.name))delete C[k]});
  var o=d&&d.key?(V.q('target')||'')+'|'+d.key:null;if(o!==st.open){st.open=o;st.tried=false;st.auto=null}
  if(o&&d.user&&d.doc&&!st.tried)st.auto=o;if(o&&d.doc)ask();status();autoGo()});
 // the document read ended (it landed, failed or is not made): what waited for it asks now
 V.on('doc',function(){st.live=true;ask();status();autoGo();V.redraw()});
 // a page job ended or the cache answer changed: every "not made" entry asks again once (one that is being made, or
 // whose own job still runs, waits); the current choice asks at once, so the status never waits for a draw
 V.on('products',function(){var any=false;Object.keys(C).forEach(function(k){var x=C[k];if(x&&x.need&&!x.mk&&!runText(x.need.what,x.need.args)){delete C[k];any=true}});
  var had=!!entry(st.choice);ask();if(any||had!==!!entry(st.choice)){status();V.redraw()}});
 V.on('job',function(){status()});
 V.on('theme',function(){Object.keys(C).forEach(function(k){if(C[k].env)C[k].env._img=null});drawLegend()});
}});
})();
`.replace('/*SLOPE*/{}', JSON.stringify(SLOPE));
