// Map Viewer hover readout (MV-PG1, second half): what lies under the cursor, from the hover pack (tools/mapviz/README.md
// 5.6): position in metres, height, slope class, ground type and material, water band, depth and the water area labels
// (README 5.3 water.labels) at that spot. The rows go to this part's own panel only, the one live readout of the page: it
// is aria-live and repainted at most every GAP ms (the last spot is always said). They are not given to the shell's line
// (V.addHover), which is aria-live too and follows every cursor step. The keyboard cursor of the shell drives the panel,
// as the mouse does.
// It also holds the page's shared height store, EXT_SCREENS.mapviz.heights = {kit, of(V)}: of(V) gives one store per page
// {state, pack, need, err, labels, ensure(), make(), makeAll(), at(x, y), on(fn)} that the measure and profile parts read.
// A GET never starts a job: a missing product shows a "Make it" button (README 6.1 need). While the job that makes it
// runs, the status shows that job's words and no button; when a page job ends, a pack that was not made asks again once.
// Author: Imperator_Aug (ARSENAL, ia-390c9187)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
var UPM=20,DEG=6,GAP=250,REQ=['height','slopecls','gtype','material'],OPT=['water.band'];
var ES={u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,f32:4};
var MATS=['undef','air','ground','road','country_road','sand','grass','snow','ice','rock','mud','swamp','puddle','bridge','bridge_wood','shallow_water','water','deep_water','underwater'];
var CLS=['car','truck','moto','armored_car','tank_light','tank_medium','tank_heavy','gun_unlinked','amphibious','gun_goh_a','gun_goh_b'];
// eye and target heights in m: the engine's cover aim heights used as eye proxies (design 5.3) [I]
var EYES={stand:1.6,kneel:1.16,prone:0.54};
// ---- pure helpers (EXT_SCREENS.mapviz.heights.kit) ----
// base64 and palette colours come from the shell kit (EXT_SCREENS.mapviz.kit.b64 and .colourCss), read when used
function b64(s){var k=MV.kit;return k&&typeof k.b64==='function'?k.b64(s):null}
// readPack(p) -> pack {w, h, cell, ox, oy, W, step, L:{name: {etype, dv, scale, nodata}}, names, miss:[optional names absent]}
// or {err: 'kind' | 'frame' | 'layer', layer?}: a required layer absent, of an unknown type or of the wrong size is refused
// (and the whole pack when the shell's base64 reader is not there: 'kind')
function readPack(p){var i;if(!p||p.kind!=='hover'||!p.layers||typeof p.layers!=='object')return {err:'kind'};
 var w=p.w,hh=p.h;if(!(w>0)||!(hh>0)||Math.floor(w)!==w||Math.floor(hh)!==hh||!(p.cell>0)||!isFinite(p.ox)||!isFinite(p.oy))return {err:'frame'};
 var pk={w:w,h:hh,cell:p.cell,ox:p.ox,oy:p.oy,W:typeof p.waterLevel==='number'&&isFinite(p.waterLevel)?p.waterLevel:null,step:p.step||1,L:{},names:{},miss:[],cache:{},map:p.map||null,mode:p.mode||null};
 var all=REQ.concat(OPT);
 for(i=0;i<all.length;i++){var n=all[i],l=p.layers[n],need=REQ.indexOf(n)>=0;
  if(!l||typeof l!=='object'){if(need)return {err:'layer',layer:n};pk.miss.push(n);continue}
  var es=ES[l.etype],by=es?b64(l.data):null;if(es&&!by)return {err:'kind'};
  if(!es||by.length!==w*hh*es){if(need)return {err:'layer',layer:n};pk.miss.push(n);continue}
  pk.L[n]={etype:l.etype,dv:new DataView(by.buffer,by.byteOffset,by.byteLength),scale:typeof l.scale==='number'&&l.scale?l.scale:1,nodata:typeof l.nodata==='number'?l.nodata:null}}
 var nm=p.layers.material&&p.layers.material.names;if(nm&&typeof nm==='object')pk.names=nm;
 return pk}
function raw(Ly,k){var dv=Ly.dv;switch(Ly.etype){case 'u8':return dv.getUint8(k);case 'i8':return dv.getInt8(k);case 'u16':return dv.getUint16(k*2,true);case 'i16':return dv.getInt16(k*2,true);
 case 'u32':return dv.getUint32(k*4,true);case 'i32':return dv.getInt32(k*4,true);default:return dv.getFloat32(k*4,true)}}
function val(pk,n,i,j){var Ly=pk.L[n];if(!Ly||i<0||j<0||i>=pk.w||j>=pk.h)return null;var r=raw(Ly,j*pk.w+i);if((Ly.nodata!=null&&r===Ly.nodata)||r!==r)return null;return r*Ly.scale}
// height in u at a world point: bilinear between the lattice samples (README 4.2); null outside the grid. A nodata corner
// (a lattice point past the map's ground mesh, R16) drops out and the other corners are weighted again, as mapkit heightAt;
// null when every weighted corner is nodata, so a nodata point never reads as -32768 u
function heightAt(pk,x,y){var fi=(x-pk.ox)/pk.cell,fj=(y-pk.oy)/pk.cell;if(!(fi>=0&&fj>=0&&fi<=pk.w&&fj<=pk.h))return null;
 if(fi>pk.w-1)fi=pk.w-1;if(fj>pk.h-1)fj=pk.h-1;var i0=Math.floor(fi),j0=Math.floor(fj),i1=Math.min(i0+1,pk.w-1),j1=Math.min(j0+1,pk.h-1),u=fi-i0,v=fj-j0;
 var hs=[val(pk,'height',i0,j0),val(pk,'height',i1,j0),val(pk,'height',i0,j1),val(pk,'height',i1,j1)],ws=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v],s=0,sw=0,k;
 for(k=0;k<4;k++){if(hs[k]==null)continue;s+=hs[k]*ws[k];sw+=ws[k]}
 if(!(sw>1e-12))return null;return sw<1-1e-12?s/sw:s}
// sampleAt(pack, x, y) -> {x, y, i, j, inside, height, hCell, noGround, slope, gtype, material, matName, band, depth}
// cell layers by the cell that holds the point (truncate, README 3.1); depth = W - h with h the cell's south-west lattice
// sample (the cell rule of README 4.2, as water.depth) where the ground type is 3..5; band undefined = no water.band layer.
// noGround: inside the grid but no height there (nodata, R16): the window says so in words, never a number
function sampleAt(pk,x,y){var i=Math.floor((x-pk.ox)/pk.cell),j=Math.floor((y-pk.oy)/pk.cell),r={x:x,y:y,i:i,j:j,inside:i>=0&&j>=0&&i<pk.w&&j<pk.h};
 if(!r.inside)return r;
 r.height=heightAt(pk,x,y);r.hCell=val(pk,'height',i,j);r.noGround=r.height==null;r.slope=val(pk,'slopecls',i,j);r.gtype=val(pk,'gtype',i,j);r.material=val(pk,'material',i,j);
 r.matName=r.material!=null&&pk.names&&typeof pk.names[String(r.material)]==='string'?pk.names[String(r.material)]:null;
 r.band=pk.L['water.band']?val(pk,'water.band',i,j):undefined;
 r.depth=r.gtype>=3&&r.gtype<=5&&pk.W!=null&&r.hCell!=null?pk.W-r.hCell:null;
 return r}
// connected parts (4 neighbours, as raster regions) of the cells whose band passes test -> Int32Array of part ids, 0 none
function comps(pk,test){var w=pk.w,hh=pk.h,n=w*hh,lab=new Int32Array(n),par=[0],i,j,k;
 function find(a){while(par[a]!==a){par[a]=par[par[a]];a=par[a]}return a}
 for(j=0;j<hh;j++)for(i=0;i<w;i++){k=j*w+i;if(!test(val(pk,'water.band',i,j)))continue;var l=i>0?lab[k-1]:0,u=j>0?lab[k-w]:0;
  if(!l&&!u){lab[k]=par.length;par.push(par.length)}else if(l&&u){var a=find(l),c=find(u);if(a!==c){if(a<c)par[c]=a;else par[a]=c}lab[k]=a<c?a:c}else lab[k]=l||u}
 for(k=0;k<n;k++)if(lab[k])lab[k]=find(lab[k]);return lab}
function inPart(pk,lab,id,x,y){var i=Math.floor((x-pk.ox)/pk.cell),j=Math.floor((y-pk.oy)/pk.cell),a,b;
 for(b=-1;b<=1;b++)for(a=-1;a<=1;a++){var ii=i+a,jj=j+b;if(ii>=0&&jj>=0&&ii<pk.w&&jj<pk.h&&lab[jj*pk.w+ii]===id)return true}return false}
// labelsAt(pack, items, x, y) -> the water labels of the water area under the point: band 2 spot -> the swim area's label;
// band 1 spot -> the no-prone area's own label, else the deeper label it was merged into (README 5.3, 4 m2 rule).
// A label belongs to the area that holds its anchor (or a neighbour of it, for a sampled pack) [I]
function labelsAt(pk,items,x,y){if(!pk||!pk.L['water.band']||!items||!items.length)return [];
 var i=Math.floor((x-pk.ox)/pk.cell),j=Math.floor((y-pk.oy)/pk.cell),b=val(pk,'water.band',i,j);if(!(b>=1))return [];
 var key=b>=2?'c2':'c1';if(!pk.cache[key])pk.cache[key]=comps(pk,b>=2?function(v){return v>=2}:function(v){return v>=1});
 var lab=pk.cache[key],id=lab[j*pk.w+i];if(!id)return [];
 var own=[],merged=[];items.forEach(function(it){if(!it||it.kind!=='waterLabel'||typeof it.x!=='number'||typeof it.y!=='number')return;if(!inPart(pk,lab,id,it.x,it.y))return;
  if(b>=2){if(it.band===2)own.push(it)}else if(it.band===1)own.push(it);else if(it.band===2&&Array.isArray(it.merged)&&it.merged.indexOf(1)>=0)merged.push(it)});
 return own.length?own:merged}
// geometry for measure and profile: world u in, u and degrees out; bearing clockwise from north (screen up = +world y)
function seg(a,b){var dx=b[0]-a[0],dy=b[1]-a[1],d=Math.sqrt(dx*dx+dy*dy);if(!(d>0))return {d:0,bearing:null};var g=Math.atan2(dx,dy)*180/Math.PI;if(g<0)g+=360;if(g>=360)g-=360;return {d:d,bearing:g}}
function same(a,b){return !!a&&!!b&&Math.abs(a[0]-b[0])<1e-6&&Math.abs(a[1]-b[1])<1e-6}
function boxOf(doc){var b=doc&&doc.boxes&&(doc.boxes.world||doc.boxes.auto);return b&&b.length===4?b:null}
function inBox(b,p){return !!b&&p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]}
// a point typed in metres -> {pt:[x, y] in u} or {err:'num'}
function parsePt(xs,ys){function one(s){s=String(s==null?'':s).replace(/\s+/g,'').replace(',','.');if(!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s))return NaN;return Number(s)}
 var x=one(xs),y=one(ys);if(!isFinite(x)||!isFinite(y))return {err:'num'};return {pt:[x*UPM,y*UPM]}}
// check a new point against the map box and the point before it -> null or an error code (noMap, outside, same)
function checkPt(doc,p,prev){var b=boxOf(doc);if(!b)return 'noMap';if(!inBox(b,p))return 'outside';if(prev&&same(prev,p))return 'same';return null}
// profileOf(pack, a, b, max) -> {a, b, len, pts:[{d, x, y, z}], lo, hi, hiAt, miss} with samples every half pack cell (at
// most max); z null = no ground there (nodata or outside): left out of lo, hi and hiAt; miss = how many samples have none
function profileOf(pk,a,b,max){var dx=b[0]-a[0],dy=b[1]-a[1],len=Math.sqrt(dx*dx+dy*dy);if(!pk||!(len>0))return null;
 var n=Math.max(2,Math.min(max||800,Math.ceil(len/(pk.cell/2)))),pts=[],lo=null,hi=null,hiAt=0,miss=0,k;
 for(k=0;k<=n;k++){var t=k/n,x=a[0]+dx*t,y=a[1]+dy*t,z=heightAt(pk,x,y);pts.push({d:len*t,x:x,y:y,z:z});
  if(z!=null){if(lo==null||z<lo)lo=z;if(hi==null||z>hi){hi=z;hiAt=len*t}}else miss++}
 return {a:a,b:b,len:len,pts:pts,lo:lo,hi:hi,hiAt:hiAt,miss:miss}}
// runs(profile) -> [[k0, k1]]: the stretches of samples that have ground, in order (the chart draws each one alone)
function runs(pr){var out=[],s=-1,k;if(!pr)return out;for(k=0;k<pr.pts.length;k++){if(pr.pts[k].z!=null){if(s<0)s=k}else if(s>=0){out.push([s,k-1]);s=-1}}
 if(s>=0)out.push([s,pr.pts.length-1]);return out}
// sightOf(profile, eye u) -> {clear, first:{k, d, x, y, over} | null, ya, yb}: the straight line from eye height over the
// first point to the same height over the last; terrain only (objects are wave C); a sample above the line blocks it; a
// sample with no ground (z null) neither blocks nor clears it; null when the first or the last point has no ground
function sightOf(pr,eye){if(!pr||!pr.pts.length)return null;var n=pr.pts.length-1,za=pr.pts[0].z,zb=pr.pts[n].z;if(za==null||zb==null)return null;
 var ya=za+eye,yb=zb+eye,first=null;
 for(var k=1;k<n;k++){var p=pr.pts[k];if(p.z==null)continue;var line=ya+(yb-ya)*p.d/pr.len;if(p.z>line+1e-9&&!first)first={k:k,d:p.d,x:p.x,y:p.y,over:p.z-line}}
 return {clear:!first,first:first,ya:ya,yb:yb}}
function lineAt(s,pr,d){return s.ya+(s.yb-s.ya)*d/pr.len}
// numbers for the window
function fx(v,d){var s=Number(v).toFixed(d);return /^-0(\.0+)?$/.test(s)?s.slice(1):s}
function mtr(u,d){return fx(u/UPM,d)}
function sgn(u,d){var s=mtr(u,d);return (u>0&&/[1-9]/.test(s)?'+':'')+s}
function css(hx){var k=MV.kit;return k&&typeof k.colourCss==='function'?k.colourCss(hx):''}
function errText(e){if(e&&e.key&&/^mapviz\./.test(e.key))return tx(e.key,{msg:(e.params&&e.params.msg)||e.message||''});return String(e&&(e.text||e.message)||e)}
function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
function word(k,fb){var s=tx(k);return s===k?fb:s}
// fits(job args, need args): every key field the need names (mode, kind, side, size; map when the job has one) is the job's
function fits(ja,na){ja=ja||{};for(var k in na||{}){if(!Object.prototype.hasOwnProperty.call(na,k)||na[k]==null)continue;var v=ja[k];
  if(k==='map'){if(v!=null&&String(v)!==String(na[k]))return false;continue}if(v==null||String(v)!==String(na[k]))return false}return true}
var KIT={b64:b64,readPack:readPack,val:val,heightAt:heightAt,sampleAt:sampleAt,comps:comps,labelsAt:labelsAt,seg:seg,same:same,boxOf:boxOf,inBox:inBox,
 parsePt:parsePt,checkPt:checkPt,profileOf:profileOf,runs:runs,sightOf:sightOf,lineAt:lineAt,fx:fx,mtr:mtr,sgn:sgn,css:css,errText:errText,needOf:needOf,word:word,UPM:UPM,EYES:EYES};
// ---- the height store, one per page ----
var stores=[];
function of(V){for(var i=0;i<stores.length;i++)if(stores[i][0]===V)return stores[i][1];var s=mkStore(V);stores.push([V,s]);return s}
function mkStore(V){
 var s={state:'none',pack:null,need:null,err:null,labels:null,sig:'',seq:0,chain:0,fns:[]};
 function sigOf(){return [V.q('target')||'',V.q('map')||'',V.q('mode')||'',V.q('game')||'',V.q('mod')||''].join('|')}
 function tell(){s.fns.slice().forEach(function(f){try{f(s)}catch(e){}})}
 function sync(){var g=sigOf();if(g===s.sig)return false;s.sig=g;s.seq++;s.state='none';s.pack=null;s.need=null;s.err=null;s.labels=null;s.chain=0;return true}
 function load(){var my=++s.seq;s.state='loading';s.err=null;tell();
  V.api('GET','hover').then(function(p){if(my!==s.seq)return;var r=readPack(p);if(r.err){s.state='error';s.err={code:r.err,layer:r.layer||null};tell();return}
    s.pack=r;s.state='ready';tell();if(r.L['water.band'])labels(my)},
   function(e){if(my!==s.seq)return;var n=needOf(e);if(n){s.state='need';s.need=n;tell();if(s.autoKey&&s.autoKey===V.q('map')){s.autoKey=null;s.chain=4}if(s.chain>0){s.chain--;s.make()}return}
    s.state='error';s.err={code:'api',msg:errText(e)};s.chain=0;tell()})}
 function labels(my){V.api('GET','layer',{name:'water.labels'}).then(function(env){if(my!==s.seq)return;
   s.labels=env&&env.kind==='vector'&&Array.isArray(env.items)?env.items.filter(function(it){return it&&it.kind==='waterLabel'}):[];tell()},
  function(){if(my!==s.seq)return;s.labels=[];tell()})}
 s.on=function(f){if(typeof f==='function')s.fns.push(f)};
 // ensure(): forget a pack of another map or mode; read the pack when a map is read (the shell holds its document)
 s.ensure=function(){if(V.q('rmt'))return;var changed=sync();if(!V.q('target')||!V.q('map')||!V.doc){if(changed)tell();return}if(s.state==='none')load();else if(changed)tell()};
 s.forget=function(){if(sync())tell()};
 // picked(key): a map the user picked makes its readout pack by itself, once per open (as the base part does for its
 // picture): never on a refresh, a remembered map or a permalink, and not again on a mode, side or kind change
 s.picked=function(key){if(!key){s.autoSeen=null;s.autoKey=null;return}if(key!==s.autoSeen){s.autoSeen=key;s.autoKey=key}};
 s.make=function(){if(!s.need||V.q('rmt'))return;var n=s.need,my=s.seq;s.need=null;s.mkNeed=n;s.state='making';tell();
  V.job(n.what,n.args||{}).then(function(){if(my!==s.seq)return;s.mkNeed=null;s.state='none';load()},function(e){if(my!==s.seq)return;s.mkNeed=null;s.state='error';s.err={code:'api',msg:errText(e)};s.chain=0;tell()})};
 // makeAll(): the user's one press makes every product the pack still needs, one after the other (at most 4)
 s.makeAll=function(){s.chain=4;s.make()};
 s.ready=function(){return s.state==='ready'&&!!s.pack&&s.sig===sigOf()};
 // runText(): the words of the page job that makes what the pack needs, while it is queued or running, else null
 // (a job fits only when its key fields, j.args as posted, are the need's: a pass job of another kind is not this one)
 s.runText=function(){var n=s.need||s.mkNeed,js=V.q('jobs'),t=V.q('target'),m=V.q('map');if(!n||!Array.isArray(js))return null;
  for(var i=0;i<js.length;i++){var j=js[i];if(j&&!j.end&&j.what===n.what&&j.target===t&&(!j.map||j.map===m)&&(!j.args||fits(j.args,n.args)))return j.text||String(n.what)}return null};
 // a page job ended or the cache answer changed (W1): a pack that was not made, or that lacks an optional layer, is read
 // again once; a pack being made waits for its own job
 if(typeof V.on==='function'){
  V.on('products',function(){if(V.q('rmt')||!V.q('map')||!V.doc||s.sig!==sigOf())return;if((s.state==='need'&&!s.runText())||(s.state==='ready'&&s.pack&&s.pack.miss.length))load()});
  V.on('job',function(){if(s.state==='need'||s.state==='making')tell()})}
 s.at=function(x,y){return s.ready()?sampleAt(s.pack,x,y):null};
 s.heightAt=function(x,y){return s.ready()?heightAt(s.pack,x,y):null};
 return s}
MV.heights={kit:KIT,of:of};
// ---- the part ----
MV.parts.push({id:'hover',init:function(V){
 if(V.q('rmt'))return;
 var S0=of(V),el={},last=0,timer=false;
 function typeWord(t){if(t==null)return tx('mapviz.hover.unknown');return t>=0&&t<=11&&Math.floor(t)===t?tx('mapviz.hover.type.'+t):tx('mapviz.hover.type.other',{id:t})}
 function matWord(name,id){if(name&&MATS.indexOf(name)>=0)return tx('mapviz.hover.mat.'+name);if(name)return String(name).replace(/_/g,' ');return id==null?tx('mapviz.hover.unknown'):tx('mapviz.hover.matId',{id:id})}
 function clsWord(id){return CLS.indexOf(id)>=0?tx('mapviz.hover.cls.'+id):String(id).replace(/_/g,' ')}
 function bandWord(b){return b===1||b===2?tx('mapviz.hover.band.'+b):tx('mapviz.hover.unknown')}
 function areaText(it){var a=typeof it.area==='number'&&isFinite(it.area)?Math.round(it.area):null,lo=it.depthMin,hi=it.depthMax;
  var d=typeof lo==='number'&&isFinite(lo)&&typeof hi==='number'&&isFinite(hi)?tx('mapviz.hover.deep',{lo:fx(lo,1),hi:fx(hi,1)}):tx('mapviz.hover.unknown');
  return tx('mapviz.hover.areaV',{band:bandWord(it.band),deep:d,a:a==null?'?':a})}
 // rows(x, y) -> [{id, label, value}] or null while there is no pack
 function rows(x,y){if(!S0.ready())return null;var pk=S0.pack,r=sampleAt(pk,x,y),out=[],un=tx('mapviz.hover.unknown');
  out.push({id:'pos',label:'mapviz.hover.pos',value:tx('mapviz.hover.posV',{x:mtr(x,1),y:mtr(y,1)})});
  if(!r.inside){out.push({id:'where',label:'mapviz.hover.where',value:tx('mapviz.hover.outside')});return out}
  var ng=tx('mapviz.hover.noGround');
  // the cell's own south-west sample decides "no ground" for the readout (as the depth row and the cell layers do): a
  // cell whose own sample is nodata (off the map's ground, R16) shows the position and one "no ground here" row only, no
  // slope, ground type, material or water (W5, P8); the measure and profile parts keep heightAt
  if(r.hCell==null){out.push({id:'where',label:'mapviz.hover.where',value:ng});return out}
  out.push({id:'height',label:'mapviz.hover.height',value:r.height==null?ng:tx('mapviz.hover.m',{v:mtr(r.height,2)})});
  out.push({id:'slope',label:'mapviz.hover.slope',value:r.slope==null?un:tx('mapviz.hover.slopeV',{lo:r.slope*DEG,hi:r.slope*DEG+DEG})});
  out.push({id:'ground',label:'mapviz.hover.ground',value:typeWord(r.gtype)});
  out.push({id:'material',label:'mapviz.hover.material',value:matWord(r.matName,r.material)});
  var wet=r.gtype>=3&&r.gtype<=5;
  if(r.band===undefined){if(wet)out.push({id:'water',label:'mapviz.hover.water',value:tx('mapviz.hover.noBands')})}
  else if(r.band===null){if(wet)out.push({id:'water',label:'mapviz.hover.water',value:un})}
  else if(r.band>0)out.push({id:'water',label:'mapviz.hover.water',value:bandWord(r.band)});
  if(wet)out.push({id:'depth',label:'mapviz.hover.depth',value:r.depth!=null?tx('mapviz.hover.m',{v:mtr(r.depth,2)}):r.hCell==null?ng:un});
  if(r.band>0&&S0.labels){labelsAt(pk,S0.labels,x,y).forEach(function(it,n){out.push({id:'area'+n,label:'mapviz.hover.area',value:areaText(it)});
   if(Array.isArray(it.drown)&&it.drown.length)out.push({id:'drown'+n,label:'mapviz.hover.drowns',value:it.drown.map(clsWord).join(', ')})})}
  return out}
 function status(){if(!el.status)return;el.status.textContent='';var k=null,a={};
  if(!V.q('map'))k='mapviz.hover.noMap';
  else if(S0.state==='loading')k='mapviz.hover.loading';
  else if(S0.state==='making'||(S0.state==='need'&&S0.runText())){var rt=S0.runText();k=rt?'mapviz.hover.makingJob':'mapviz.hover.making';a={job:rt||''}}
  else if(S0.state==='need'&&S0.need){k='mapviz.hover.need';a={what:word('mapviz.shell.what.'+S0.need.what,String(S0.need.what))}}
  else if(S0.state==='error'&&S0.err){if(S0.err.code==='api'){k='mapviz.hover.fault';a={msg:S0.err.msg||''}}else if(S0.err.code==='layer'){k='mapviz.hover.badLayer';a={what:word('mapviz.hover.lay.'+S0.err.layer,String(S0.err.layer))}}else k='mapviz.hover.badPack'}
  else if(S0.state==='none'&&!V.doc)k='mapviz.hover.noDoc';
  else if(S0.ready()&&S0.pack.miss.length)k='mapviz.hover.noBands';
  if(!k)return;el.status.textContent=tx(k,a);
  if(k==='mapviz.hover.need')el.status.appendChild(h('span',{},[h('span',{text:' '}),h('button',{type:'button',text:tx('mapviz.hover.make'),title:tx('mapviz.hover.makeT'),onclick:function(){S0.makeAll()}})]))}
 // no pack is on its way while the status asks for a Make, a job makes it, or the read failed: the rows then show the
 // position only, never "reading..." (that word is for a pack being read)
 // (also when the document read ended with no document: nothing is being read then)
 function noPack(){return S0.state==='need'||S0.state==='making'||S0.state==='error'||(S0.state==='none'&&!V.doc&&!V.q('docBusy')&&!!V.q('map'))}
 function paint(){if(!el.rows)return;var c=V.q('cursor'),rs=c?rows(c[0],c[1]):null;el.rows.textContent='';
  if(!rs&&c&&V.q('map')&&noPack())rs=[{id:'pos',label:'mapviz.hover.pos',value:tx('mapviz.hover.posV',{x:mtr(c[0],1),y:mtr(c[1],1)})}];
  if(!rs){el.rows.appendChild(h('p',{blk:'mv.hover.hint',class:'hint','data-blkname':tx('mapviz.hover.blk.hint'),text:tx(c?'mapviz.hover.wait':'mapviz.hover.move')}));return}
  rs.forEach(function(r){var lb=tx(r.label);el.rows.appendChild(h('div',{class:'fld',blk:'mv.hover.'+r.id,'data-blkname':lb},[h('span',{class:'n',text:lb+': '}),h('b',{text:r.value})]))})}
 // throttle: paint now when the last paint is GAP ms old, else once when it is (the last spot is always painted)
 function schedule(){var now=Date.now();if(now-last>=GAP){last=now;paint();return}if(timer)return;timer=true;
  setTimeout(function(){timer=false;last=Date.now();paint()},Math.max(1,GAP-(now-last)))}
 V.addPanel({id:'hover',side:'right',build:function(box){
  el.title=h('div',{blk:'mv.hover.title','data-blkname':tx('mapviz.hover.title')},[h('h3',{text:tx('mapviz.hover.title')})]);
  el.status=h('p',{blk:'mv.hover.status',class:'hint',role:'status','data-blkname':tx('mapviz.hover.blk.status')});
  el.rows=h('div',{blk:'mv.hover.rows',box:'col','aria-live':'polite','aria-atomic':'true','aria-label':tx('mapviz.hover.title'),'data-blkname':tx('mapviz.hover.blk.rows')});
  box.appendChild(el.title);box.appendChild(el.status);box.appendChild(el.rows);status();paint()}});
 S0.on(function(){status();schedule()});
 // the stage strip of the shell: the same rows, without the position (the strip writes it itself); quiet, so they are
 // not said twice (this panel is the aria-live readout)
 if(V.addHover)V.addHover(function(x,y){var r=rows(x,y);return r?r.filter(function(o){return o.id!=='pos'}).map(function(o){return {label:o.label,value:o.value}}):[]},{quiet:true});
 V.on('cursor',function(){schedule()});
 V.on('map',function(d){if(d&&!d.key)S0.picked(null);else if(d&&d.user)S0.picked(d.key);S0.ensure();status();schedule()});
 V.on('refresh',function(){S0.ensure();status()});
 // the document read ended: the pack waits for V.doc (it asks on the 'map' event that carries the document); after a
 // failed or not-made read there is no pack to ask for, so the status and the rows are only said again
 V.on('doc',function(){S0.ensure();status();schedule()});
}});
})();
`;
