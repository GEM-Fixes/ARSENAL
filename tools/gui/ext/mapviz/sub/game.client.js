// Map Viewer game marks (MV-PG1, second half A): what the chosen mode puts on the map, read from the map document V.doc
// (tools/mapviz/README.md 3.2: modes, spawns, flags with their zone circles and polygons, points, clipsBySide, boxes;
// 3.1 frame and units; 5.4 sides and marks colours). Layers of group game: 'flags', 'zones' (capture zones: an AS2 or
// AS64 circle zone holds two radii, rB for team b and rA for every other team 2): the ring of the
// chosen side is drawn, side "both" draws both rings, one when they are equal; the GoH polygon with absolute points),
// 'spawns' (per side, arrow along the yaw), 'points' (other mode points), 'boxes' (the world box, the camera box, a
// side's own camera box from clipsBySide). The side picker of the shell filters zones, spawns, points and side boxes.
// Every layer gives list() so the shell's DOM list repeats everything drawn; an item names its phase when the mode
// holds more than one phase (frontline modes); the panel says what the mode holds ("no spawns in this mode" and so on).
// Layer 'mission': the named places of the mode's mission file (GET places, game.server.js): Helpers zones as outlines,
// Helpers waypoints as dots, map points the document does not name. A single-player mission keeps every place there, so
// before this layer the viewer showed "0 flags" for it.
// MAPVIZ_PICK (window.MAPVIZ_PICK, also EXT_SCREENS.mapviz.picker): the place picker other pages open over the page
// (README.md of this folder, "The place picker"): a sketch at once, the map picture when it is there, named places,
// a click on a place or on any spot gives world u and metres back. MAPVIZ_PICK.embed(o) is the same map view inline,
// for a page that keeps a live map in its own card and draws marks on it (zones, routes, units, goals, the start).
// Author: Imperator_Aug (ARSENAL, ia-10b556e9)
module.exports = String.raw`
(function(){
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
var MVX=EXT_SCREENS.mapviz,UPM=20,PKK={flag:1,pbase:1,ebase:1,area:1,arean:1,point:1,pointn:1,path:1,start:1},PKIND={zone:1,flag:1,start:1,point:1,waypoint:1};
// a place's words: the label the caller gave, else the server's label form in the page language, else its id
function plabel(p){if(!p)return '';if(p.label!=null&&p.label!=='')return String(p.label);var l=p.lab;
 if(l&&PKK[l.k]){var s=tx('mapviz.game.pk.'+l.k,{n:l.n==null?'':l.n});if(s&&s.indexOf('mapviz.')!==0)return s}return String(p.id==null?'':p.id)}
function pkind(k){return tx('mapviz.game.pk.kind.'+(PKIND[k]?k:'point'))}
function fin(v){return typeof v==='number'&&isFinite(v)}
function r2(v){return Math.round(v*100)/100}
function m1(v){return String(Math.round(v/UPM*10)/10)}
// ---- the place picker ----
var PK=(function(){
 var TG={as64:1,mowas2:1,goh:1},MK={zone:1,route:1,unit:1,goal:1,start:1},seq=0,W0=760,H0=460,HIN=360;
 function tok(n){return typeof cssv==='function'?cssv('--'+n,''):''}
 function K(){return MVX.kit||{}}
 function T(){return MVX._t||{}}
 function qs(o){var a=[];Object.keys(o).forEach(function(k){var v=o[k];if(v==null||v==='')return;a.push(encodeURIComponent(k)+'='+encodeURIComponent(String(v)))});return a.length?'?'+a.join('&'):''}
 // the map key as the missions, bots and maps pages name it (map/..., resource/map/..., a path to its .mi) -> the viewer's key
 function keyOf(s){s=String(s==null?'':s).replace(/\\/g,'/').replace(/^\/+/,'').replace(/^resource\//i,'').replace(/^map\//i,'').replace(/\/+$/,'');
  if(!s||/(^|\/)\.\.?(\/|$)/.test(s)||/\/\//.test(s)||!/^[A-Za-z0-9_][A-Za-z0-9_.\/ -]*$/.test(s))return null;return s.toLowerCase()}
 function stem(s){s=String(s==null?'':s).replace(/\\/g,'/');s=s.slice(s.lastIndexOf('/')+1).replace(/\.mi$/i,'');return /^[A-Za-z0-9_.-]{1,80}$/.test(s)?s:null}
 // the game: o.target or o.gameId (as64, mowas2, goh), or o.game when it is one of them, else the page's; its folder
 // o.gameDir, else the page's (GoH: gohDir(), else S.gameOv); the mod o.modDir or o.mod, else the page's when the game is
 // the page's own
 function ctxOf(o){var g=typeof S!=='undefined'&&S?S.gameId:null,t=o.target||o.gameId||(TG[o.game]?o.game:null)||g;if(!TG[t])t=null;
  var dir=typeof o.gameDir==='string'?o.gameDir:t==='goh'?(typeof gohDir==='function'?(gohDir()||''):''):((typeof S!=='undefined'&&S&&S.gameOv)||'');
  var mod=typeof o.modDir==='string'?o.modDir:typeof o.mod==='string'?o.mod:(t&&t===g&&typeof S!=='undefined'&&S&&S.mod)?String(S.mod):'';
  return {target:t,game:dir||null,modDir:mod||null}}
 // caller places: {id, label, x, y, kind, r?, pts?} in world u; a place with no finite x and y is left out
 function norm(list){var out=[];(Array.isArray(list)?list:[]).forEach(function(p,i){if(!p||!fin(+p.x)||!fin(+p.y))return;var q={},k;for(k in p)if(Object.prototype.hasOwnProperty.call(p,k))q[k]=p[k];
  q.x=+p.x;q.y=+p.y;q.id=p.id!=null&&p.id!==''?String(p.id):String(p.label!=null?p.label:'p'+i);q.kind=PKIND[p.kind]?p.kind:'point';q.given=true;
  if(!(fin(q.r)&&q.r>0))delete q.r;if(!(Array.isArray(q.pts)&&q.pts.length>=3))delete q.pts;out.push(q)});return out}
 function own(o,k){return Object.prototype.hasOwnProperty.call(o,k)}
 // the map and the mission of a request: map may be a path to a .mi (the mission is then its name)
 function mapOf(o){var key=keyOf(o.map),mis=o.mission!=null&&o.mission!==''?stem(o.mission):null;
  if(key&&/\.mi$/.test(key)){if(!mis)mis=stem(key);key=key.slice(0,key.lastIndexOf('/'))||null}return {key:key,mis:mis}}
 // marks of an inline view, in world u: zone {x, y, r | pts}, route {pts}, unit {x, y, n?}, goal {x, y, n}, start {x, y};
 // side player | enemy | ally | neutral; a mark with no finite place is left out
 function nv(v){return v==null||v===''?NaN:+v}
 function pts2(a,min){if(!Array.isArray(a))return null;var o=[];a.forEach(function(q){if(Array.isArray(q)&&fin(nv(q[0]))&&fin(nv(q[1])))o.push([+q[0],+q[1]])});return o.length>=min?o:null}
 function normM(list){var out=[];(Array.isArray(list)?list:[]).forEach(function(m){if(!m||!MK[m.type])return;var q={type:m.type,side:m.side,label:m.label==null?'':String(m.label)},p=null;
   if(m.type==='route'){p=pts2(m.pts,2);if(!p)return;q.pts=p;q.dashed=!!m.dashed;q.arrow=m.arrow!==false}
   else if(m.type==='zone'&&(p=pts2(m.pts,3))){var sx=0,sy=0;p.forEach(function(a){sx+=a[0];sy+=a[1]});q.pts=p;q.x=sx/p.length;q.y=sy/p.length}
   else{if(!fin(nv(m.x))||!fin(nv(m.y)))return;q.x=+m.x;q.y=+m.y;if(m.type==='zone'){if(!(nv(m.r)>0)||!fin(+m.r))return;q.r=+m.r}}
   if(m.n!=null&&m.n!=='')q.n=String(m.n);out.push(q)});return out}
 function hgt(o){var v=+o.height;return v>=80&&v<=4000?Math.round(v):HIN}
 function cvCss(hh){return 'display:block;width:100%;height:'+hh+'px;box-sizing:border-box;border:1px solid var(--line);border-radius:4px;cursor:crosshair;touch-action:none;background:var(--bg)'}
 function sideTok(s){return s==='enemy'?'s2':s==='player'||s==='ally'?'s1':'hint'}
 function near(s,px,py,d){return !!s&&Math.abs(s[0]-px)<=d&&Math.abs(s[1]-py)<=d}
 function segD(px,py,a,b){var dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?((px-a[0])*dx+(py-a[1])*dy)/l:0;t=t<0?0:t>1?1:t;var x=a[0]+t*dx-px,y=a[1]+t*dy-py;return Math.sqrt(x*x+y*y)}
 // ---- one map view: the modal picker is one instance, every inline view (embed) is its own; P is that view's state ----
 function mk(){
 var P=null;
 function live(me){return !!P&&P.me===me}
 function ts(x,y){var v=P.view;return [P.w/2+(x-v.cx)*v.zoom,P.h/2-(y-v.cy)*v.zoom]}
 function tw(px,py){var v=P.view;return [v.cx+(px-P.w/2)/v.zoom,v.cy-(py-P.h/2)/v.zoom]}
 function clampZ(z){return z<0.00005?0.00005:z>64?64:z}
 function okBox(b){return Array.isArray(b)&&b.length===4&&b.every(fin)&&b[2]>b[0]&&b[3]>b[1]}
 // the sketch frame: the map's world box when known, else the extent of the places with a margin, else 2 km square
 function bounds(){if(P.pic&&okBox(P.pic.box))return P.pic.box;if(okBox(P.wbox))return P.wbox;var b=null;
  P.places.concat(P.marks).forEach(function(p){var xs=[],ys=[];if(fin(p.x)){xs.push(p.x);ys.push(p.y)}if(p.r>0){xs.push(p.x-p.r,p.x+p.r);ys.push(p.y-p.r,p.y+p.r)}(p.pts||[]).forEach(function(q){xs.push(q[0]);ys.push(q[1])});
   for(var i=0;i<xs.length;i++){if(!b)b=[xs[i],ys[i],xs[i],ys[i]];else{b[0]=Math.min(b[0],xs[i]);b[1]=Math.min(b[1],ys[i]);b[2]=Math.max(b[2],xs[i]);b[3]=Math.max(b[3],ys[i])}}});
  if(!b)return [-20000,-20000,20000,20000];var mx=Math.max((b[2]-b[0])*0.1,400),my=Math.max((b[3]-b[1])*0.1,400);return [b[0]-mx,b[1]-my,b[2]+mx,b[3]+my]}
 // the playable area: GET places play (the first Clips world box, the rule the mission writer spmis refuses a place by,
 // SPMIS_POINT_OUTSIDE), else its world box, else the picture's; null while none is known (a spot is then not refused,
 // and the result says inside null)
 function playBox(){return okBox(P.play)?P.play:okBox(P.wbox)?P.wbox:(P.pic&&okBox(P.pic.box))?P.pic.box:null}
 function inPlay(x,y){var b=playBox();return b?(x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]):null}
 function fit(){var b=bounds();P.view={cx:(b[0]+b[2])/2,cy:(b[1]+b[3])/2,zoom:clampZ(Math.min(P.w/(b[2]-b[0]),P.h/(b[3]-b[1]))*0.95)}}
 function zoomAt(px,py,f){var p=tw(px,py),z=clampZ(P.view.zoom*f);P.view={cx:p[0]-(px-P.w/2)/z,cy:p[1]+(py-P.h/2)/z,zoom:z};P.moved=true;draw()}
 // ---- hits: a place mark within 10 px (the nearest), else the smallest zone that holds the spot, else the spot ----
 function inZone(p,x,y){if(p.pts){var c=false,Q=p.pts;for(var i=0,j=Q.length-1;i<Q.length;j=i++){if(((Q[i][1]>y)!==(Q[j][1]>y))&&(x<(Q[j][0]-Q[i][0])*(y-Q[i][1])/(Q[j][1]-Q[i][1])+Q[i][0]))c=!c}return c}
  if(p.r>0){var dx=x-p.x,dy=y-p.y;return dx*dx+dy*dy<=p.r*p.r}return false}
 function zsize(p){if(p.pts){var a=1e30,b=-1e30,c=1e30,d=-1e30;p.pts.forEach(function(q){a=Math.min(a,q[0]);b=Math.max(b,q[0]);c=Math.min(c,q[1]);d=Math.max(d,q[1])});return (b-a)*(d-c)}return p.r*p.r*4}
 function hitAt(px,py){var best=null,bd=10.5;P.places.forEach(function(p){if(p.dup)return;var s=ts(p.x,p.y),d=Math.sqrt((s[0]-px)*(s[0]-px)+(s[1]-py)*(s[1]-py));if(d<bd){bd=d;best=p}});
  var w=tw(px,py);if(!best){var bz=null;P.places.forEach(function(p){if(p.kind!=='zone'||p.dup||!inZone(p,w[0],w[1]))return;if(!bz||zsize(p)<zsize(bz))bz=p});best=bz}
  return best?{x:best.x,y:best.y,place:best}:{x:w[0],y:w[1],place:null}}
 // what goes back: x, y in world u (rounded to 0.01), the same in metres, and the place (a copy, with its label) or null
 function pub(p){if(!p)return null;var q={},k;for(k in p)if(Object.prototype.hasOwnProperty.call(p,k)&&k!=='lab'&&k!=='dup'&&k!=='given')q[k]=p[k];q.label=plabel(p);return q}
 // inside: true when the spot lies in the playable area, null when no area is known (never false: such a spot is refused)
 function result(s){var x=r2(s.x),y=r2(s.y);return {x:x,y:y,units:'u',upm:UPM,m:{x:r2(s.x/UPM),y:r2(s.y/UPM)},place:pub(s.place),map:P.key,mission:P.mode,target:P.c.target,inside:inPlay(s.x,s.y)}}
 // a spot outside the playable area is refused at once with a plain line; the picker stays open
 function refuse(){P.el.line.textContent=tx('mapviz.game.pk.outside');P.el.line.setAttribute('role','alert');if(P.el.ok)P.el.ok.disabled=true;if(P.emb)bar(false)}
 // an inline view stays as it is after a pick (one click picks, no OK and no Cancel)
 function choose(s){if(!P||!s)return;if(inPlay(s.x,s.y)===false){refuse();return}var o=P.o,out=result(s);if(!P.emb)close();if(typeof o.onPick==='function'){try{o.onPick(out)}catch(e){try{console.error('MAPVIZ_PICK onPick: '+(e&&e.message||e))}catch(x){}}}}
 function cancel(){if(!P)return;var o=P.o;close();if(typeof o.onCancel==='function'){try{o.onCancel()}catch(e){}}}
 function spotText(s,lead){var a={x:m1(s.x),y:m1(s.y)};var e=P.emb;
  return s.place?tx(lead?(e?'mapviz.game.pk.selPlaceIn':'mapviz.game.pk.selPlace'):'mapviz.game.pk.atPlace',{name:plabel(s.place),kind:pkind(s.place.kind),x:a.x,y:a.y}):tx(lead?(e?'mapviz.game.pk.selSpotIn':'mapviz.game.pk.selSpot'):'mapviz.game.pk.atSpot',a)}
 // the one status line of an inline view: the hover or the choice while there is one, else the places and picture words
 function bar(idle){var e=P.el;e.sp.hidden=!idle;e.spic.hidden=!idle;e.line.hidden=idle}
 function line(){if(!P)return;var s=P.hov||P.sel,out=!!s&&inPlay(s.x,s.y)===false;P.el.line.removeAttribute('role');
  P.el.line.textContent=out?tx('mapviz.game.pk.outsideAt',{x:m1(s.x),y:m1(s.y)}):s?(s.mark?tx('mapviz.game.pk.atMark',{name:s.mark.label,x:m1(s.at[0]),y:m1(s.at[1])}):spotText(s,s===P.sel&&!P.hov)):P.emb?'':tx('mapviz.game.pk.help');
  if(P.el.ok)P.el.ok.disabled=!P.sel||inPlay(P.sel.x,P.sel.y)===false;if(P.emb)bar(!s);var cs=P.cv&&P.cv.style;if(cs&&typeof cs==='object')cs.cursor=P.hov&&inPlay(P.hov.x,P.hov.y)===false?'not-allowed':'crosshair'}
 function select(s,centre){P.sel=s;P.hov=null;if(centre&&s){P.view={cx:s.x,cy:s.y,zoom:P.view.zoom};var p=s.place;if(p&&p.r>0)P.view.zoom=clampZ(Math.min(P.view.zoom,Math.min(P.w,P.h)/(p.r*5)));P.moved=true}line();draw()}
 // ---- drawing: page tokens only (bg, card, line, fg, hint, acc, s1, s2); the picture tiles through the viewer's kit ----
 function teamCol(t){return t==='a'?tok('s1'):t==='b'?tok('s2'):tok('acc')}
 function draw(){if(!P||!P.g)return;var c=P.g,w=P.w,hh=P.h,b=bounds(),i;
  if(c.fillRect){c.fillStyle=tok('bg');c.fillRect(0,0,w,hh)}
  var p0=ts(b[0],b[3]),p1=ts(b[2],b[1]);if(c.fillRect){c.fillStyle=tok('card');c.fillRect(p0[0],p0[1],p1[0]-p0[0],p1[1]-p0[1])}
  var pic=P.pic,ktb=K().tileBox;if(pic&&pic.hd&&c.drawImage&&ktb){Object.keys(pic.img).forEach(function(n){var r=pic.img[n];if(!r||!r.ok||!r.img)return;var xy=n.split('.'),q=ktb(pic.hd,pic.z,+xy[0],+xy[1],P.view,w,hh);try{c.drawImage(r.img,q[0],q[1],q[2],q[3])}catch(e){}});
   // zoomed in: the sharper tiles of the part in view, over the whole-map level (fineSoon asks for the ones not read yet)
   var fn=pic.fine;if(fn&&fn.z<pic.z)Object.keys(fn.img).forEach(function(n){var r=fn.img[n];if(!r||!r.ok||!r.img)return;var xy=n.split('.'),q=ktb(pic.hd,fn.z,+xy[0],+xy[1],P.view,w,hh);try{c.drawImage(r.img,q[0],q[1],q[2],q[3])}catch(e){}});
   fineSoon()}
  if(c.strokeRect){c.strokeStyle=tok('line');c.lineWidth=1;c.strokeRect(p0[0],p0[1],p1[0]-p0[0],p1[1]-p0[1])}
  // the playable area: the rest dimmed, the area outlined (a click outside it is refused)
  var pb=playBox();if(pb&&c.fillRect){var a0=ts(pb[0],pb[3]),a1=ts(pb[2],pb[1]),ga=c.globalAlpha;c.globalAlpha=0.55;c.fillStyle=tok('bg');
   c.fillRect(0,0,w,Math.max(0,a0[1]));c.fillRect(0,a1[1],w,Math.max(0,hh-a1[1]));c.fillRect(0,a0[1],Math.max(0,a0[0]),a1[1]-a0[1]);c.fillRect(a1[0],a0[1],Math.max(0,w-a1[0]),a1[1]-a0[1]);
   c.globalAlpha=ga==null?1:ga;if(c.strokeRect){c.strokeStyle=tok('acc');c.lineWidth=2;if(c.setLineDash)c.setLineDash([8,4]);c.strokeRect(a0[0],a0[1],a1[0]-a0[0],a1[1]-a0[1]);if(c.setLineDash)c.setLineDash([])}}
  if(!c.beginPath)return;
  // zones: outlines (a dup capture ring thin and dotted), each with a small centre mark
  P.places.forEach(function(p){if(p.kind!=='zone'||!(p.pts||p.r>0))return;c.beginPath();
   if(p.pts){for(i=0;i<p.pts.length;i++){var q=ts(p.pts[i][0],p.pts[i][1]);if(i)c.lineTo(q[0],q[1]);else c.moveTo(q[0],q[1])}if(c.closePath)c.closePath()}
   else{var s=ts(p.x,p.y);c.arc(s[0],s[1],Math.max(p.r*P.view.zoom,2),0,Math.PI*2)}
   c.strokeStyle=p.dup?tok('hint'):tok('acc');c.lineWidth=p.dup?1:2;if(c.setLineDash)c.setLineDash(p.dup?[2,3]:[]);c.stroke();if(c.setLineDash)c.setLineDash([])});
  if(P.marks.length)marksUnder(c);
  // marks: waypoints small, start points square, flags and points round
  P.places.forEach(function(p){if(p.dup)return;var s=ts(p.x,p.y);if(s[0]<-20||s[1]<-20||s[0]>w+20||s[1]>hh+20)return;c.beginPath();
   if(p.kind==='start'&&c.rect)c.rect(s[0]-4,s[1]-4,8,8);else c.arc(s[0],s[1],p.kind==='waypoint'?2.5:p.kind==='zone'?3:5,0,Math.PI*2);
   c.fillStyle=p.kind==='waypoint'?tok('hint'):p.kind==='zone'?tok('acc'):teamCol(p.team);c.fill();if(p.kind!=='waypoint'){c.strokeStyle=tok('bg');c.lineWidth=1;c.stroke()}});
  if(P.marks.length)marksOver(c);
  labels(c);
  // the selection and the hover ring
  [P.sel,P.hov].forEach(function(s,k){if(!s)return;var q=ts(s.x,s.y);c.beginPath();c.arc(q[0],q[1],k?9:11,0,Math.PI*2);c.strokeStyle=tok(k?'fg':'acc');c.lineWidth=2;c.stroke();
   if(!s.place&&!k){c.beginPath();c.moveTo(q[0]-16,q[1]);c.lineTo(q[0]+16,q[1]);c.moveTo(q[0],q[1]-16);c.lineTo(q[0],q[1]+16);c.stroke()}})}
 // ---- the marks of an inline view (page tokens only): zones and routes under the place marks, then units, goals and
 // the start over them; each keeps where it was drawn (_s) for the hover line ----
 function sideCol(s){return tok(sideTok(s))}
 function trace(c,m){var i,q;c.beginPath();if(m.pts){for(i=0;i<m.pts.length;i++){q=ts(m.pts[i][0],m.pts[i][1]);if(i)c.lineTo(q[0],q[1]);else c.moveTo(q[0],q[1])}}
  else{q=ts(m.x,m.y);c.arc(q[0],q[1],Math.max(m.r*P.view.zoom,2),0,Math.PI*2)}}
 function tip(c,x,y,a){var n=10,b=0.45;c.beginPath();c.moveTo(x,y);c.lineTo(x-n*Math.cos(a-b),y-n*Math.sin(a-b));c.lineTo(x-n*Math.cos(a+b),y-n*Math.sin(a+b));if(c.closePath)c.closePath();c.fill()}
 function numIn(c,t,x,y,col){if(t==null||!c.fillText)return;c.font='bold 10px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=col;c.fillText(String(t),x,y)}
 function marksUnder(c){var M=P.marks,i;
  // zones: filled lightly and outlined
  M.forEach(function(m){if(m.type!=='zone')return;var col=sideCol(m.side),ga=c.globalAlpha;trace(c,m);if(m.pts&&c.closePath)c.closePath();
   c.globalAlpha=0.18;c.fillStyle=col;c.fill();c.globalAlpha=ga==null?1:ga;c.strokeStyle=col;c.lineWidth=2;c.stroke()});
  // routes: an arrow head at the end and one mid-way on each long leg (120 px and more)
  M.forEach(function(m){if(m.type!=='route')return;var col=sideCol(m.side),S=m.pts.map(function(q){return ts(q[0],q[1])});m._s=S;trace(c,m);
   c.strokeStyle=col;c.lineWidth=2.5;if(c.setLineDash)c.setLineDash(m.dashed?[7,5]:[]);c.stroke();if(c.setLineDash)c.setLineDash([]);if(!m.arrow)return;c.fillStyle=col;
   for(i=1;i<S.length;i++){var dx=S[i][0]-S[i-1][0],dy=S[i][1]-S[i-1][1],L=Math.sqrt(dx*dx+dy*dy),a=Math.atan2(dy,dx);if(L<1)continue;
    if(i===S.length-1)tip(c,S[i][0],S[i][1],a);if(L>=120)tip(c,S[i-1][0]+dx/2+5*Math.cos(a),S[i-1][1]+dy/2+5*Math.sin(a),a)}})}
 function marksOver(c){var M=P.marks,G=[],i;
  // units: a round badge with its count; several on one spot are fanned out on a small ring so all are seen
  M.forEach(function(m){if(m.type!=='unit')return;var s=ts(m.x,m.y),g=null;for(i=0;i<G.length;i++)if(near(G[i].s,s[0],s[1],5)){g=G[i];break}if(!g){g={s:s,a:[]};G.push(g)}g.a.push(m)});
  G.forEach(function(g){var n=g.a.length,rad=n>1?Math.min(8+2*n,24):0;g.a.forEach(function(m,k){var a=Math.PI*2*k/n-Math.PI/2,x=g.s[0]+rad*Math.cos(a),y=g.s[1]+rad*Math.sin(a),col=sideCol(m.side),al=m.side==='ally';m._s=[x,y];
    c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fillStyle=al?tok('bg'):col;c.fill();c.strokeStyle=al?col:tok('bg');c.lineWidth=al?2.5:1.5;c.stroke();numIn(c,m.n,x,y,al?col:tok('bg'))})});
  // goals: a numbered diamond in the accent colour; the start: a square with a ring
  M.forEach(function(m){if(m.type!=='goal'&&m.type!=='start')return;var s=ts(m.x,m.y),x=s[0],y=s[1];m._s=s;c.beginPath();
   if(m.type==='goal'){c.moveTo(x,y-10);c.lineTo(x+10,y);c.lineTo(x,y+10);c.lineTo(x-10,y);if(c.closePath)c.closePath();c.fillStyle=tok('acc');c.fill();c.strokeStyle=tok('bg');c.lineWidth=1.5;c.stroke();numIn(c,m.n,x,y,tok('bg'));return}
   if(c.rect)c.rect(x-5,y-5,10,10);else c.arc(x,y,5,0,Math.PI*2);c.fillStyle=tok('s1');c.fill();c.strokeStyle=tok('bg');c.lineWidth=1;c.stroke();
   c.beginPath();c.arc(x,y,11,0,Math.PI*2);c.strokeStyle=tok('s1');c.lineWidth=2;c.stroke()})}
 // the labelled mark under the pointer: a unit, goal or start badge first, then (not when a place took the spot) a
 // route within 6 px, then the smallest zone that holds the spot
 function markAt(px,py,badges){var M=P.marks,i,j,m,w,bz=null;for(i=M.length-1;i>=0;i--){m=M[i];if(m.label&&m.type!=='zone'&&m.type!=='route'&&near(m._s,px,py,10))return m}
  if(badges)return null;
  for(i=M.length-1;i>=0;i--){m=M[i];if(!m.label||m.type!=='route'||!m._s)continue;for(j=1;j<m._s.length;j++)if(segD(px,py,m._s[j-1],m._s[j])<=6)return m}
  w=tw(px,py);M.forEach(function(z){if(z.label&&z.type==='zone'&&inZone(z,w[0],w[1])&&(!bz||zsize(z)<zsize(bz)))bz=z});return bz}
 // what the pointer is over: what a click takes (hitAt), and the mark to name when no place mark is right there
 function hover(px,py){var hv=hitAt(px,py);if(!P.marks.length)return hv;if(hv.place&&near(ts(hv.place.x,hv.place.y),px,py,10.5))return hv;
  var m=markAt(px,py,!!hv.place);if(m){hv.mark=m;hv.at=tw(px,py)}return hv}
 // one label: left out when it would overlap a label already written
 function put(c,boxes,t,x,y,col){var tw2=c.measureText?c.measureText(t).width:t.length*7,r=[x-tw2/2-2,y-8,x+tw2/2+2,y+8];
  for(var i=0;i<boxes.length;i++){var o=boxes[i];if(r[0]<o[2]&&r[2]>o[0]&&r[1]<o[3]&&r[3]>o[1])return}boxes.push(r);
  if(c.strokeText){c.strokeStyle=tok('bg');c.lineWidth=3;c.strokeText(t,x,y)}c.fillStyle=col;c.fillText(t,x,y)}
 // labels: flags, zones, start points and points first, waypoints only while few are in view; one that would overlap a
 // label already written is left out (the search box and the hover line still name it); the mark labels come after
 // every place label, under the same rule, so a mark never takes a place label away
 function labels(c){if(!c.fillText)return;var w=P.w,hh=P.h,boxes=[],vis=0;c.font='12px sans-serif';c.textAlign='center';c.textBaseline='middle';
  P.places.forEach(function(p){if(p.kind==='waypoint'){var s=ts(p.x,p.y);if(s[0]>=0&&s[1]>=0&&s[0]<=w&&s[1]<=hh)vis++}});
  P.places.forEach(function(p){if(p.dup||(p.kind==='waypoint'&&vis>40))return;var s=ts(p.x,p.y),t=plabel(p);if(!t||s[0]<0||s[1]<0||s[0]>w||s[1]>hh)return;
   put(c,boxes,t,s[0],s[1]-(p.kind==='waypoint'?9:14),p.kind==='waypoint'?tok('hint'):tok('fg'))});
  P.marks.forEach(function(m){if(!m.label)return;var s,y,S=m._s;
   if(m.type==='route'){if(!S)return;var k=Math.floor((S.length-1)/2);s=[(S[k][0]+S[k+1][0])/2,(S[k][1]+S[k+1][1])/2];y=s[1]-11}
   else if(m.type==='zone'){s=ts(m.x,m.y);y=s[1]-(m.pts?12:m.r*P.view.zoom+10)}else{s=S||ts(m.x,m.y);y=s[1]-(m.type==='start'?20:18)}
   if(s[0]<0||s[1]<0||s[0]>w||s[1]>hh)return;put(c,boxes,m.label.length>26?m.label.slice(0,25)+String.fromCharCode(8230):m.label,s[0],y,tok('fg'))})}   // a long label is cut on the map; the hover line says all of it
 // ---- the places: the caller's at once, then the mission's (GET places); a caller place keeps its id over the server's ----
 function say(which,k,a){if(!P)return;P.el[which].textContent=k?tx(k,a):''}
 // why a read failed, as a sentence in the window's language (never the code: MV_NOT_FOUND, fetch failed ...)
 function why(e){var c=String(e&&(e.key||e.message)||''),m=/MV_[A-Z_]+/.exec(c),st=e&&e.status;c=m?m[0]:'';
  return tx(c==='MV_NOT_FOUND'||st===404&&!c?'mapviz.game.pk.why.nf':c==='MV_NOT_BUILT'||c==='MV_NOT_MADE'?'mapviz.game.pk.why.nb':c==='MV_USAGE'?'mapviz.game.pk.why.use':!st&&!c&&!(e&&e.key)?'mapviz.game.pk.why.off':'mapviz.game.pk.why.other')}
 function merge(){var have={};P.given.forEach(function(p){have[p.id]=1});P.places=P.given.concat(P.got.filter(function(p){return !have[p.id]}))}
 function loadPlaces(){var me=P.me;if(!P.key){say('sp','mapviz.game.pk.noMap');return}if(RMT){say('sp','mapviz.game.pk.remote');return}if(!P.c.target){say('sp','mapviz.game.pk.noTarget');return}
  say('sp','mapviz.game.pk.loading');
  api('/api/x/mapviz/places'+qs({target:P.c.target,game:P.c.game,modDir:P.c.modDir,map:P.key,mode:P.mode}),undefined,{what:tx('mapviz.game.pk.loading')}).then(function(r){if(!live(me))return;
   P.got=(r&&Array.isArray(r.places)?r.places:[]).filter(function(p){return p&&fin(p.x)&&fin(p.y)});merge();if(okBox(r&&r.bounds))P.wbox=r.bounds;if(okBox(r&&r.play))P.play=r.play;if(r&&Array.isArray(r.modes))P.modes=r.modes;
   if(!P.moved)fit();say('sp','mapviz.game.pk.places',{n:P.places.filter(function(p){return !p.dup}).length});draw()},
   function(e){if(!live(me))return;say('sp','mapviz.game.pk.placesFault',{why:why(e)});draw()})}
 // ---- the picture: the relief tiles of the viewer's cache (GET tiles: z 0 tile 0.0 first for the size, then one level
 // of at most 16 tiles that shows the whole map); not made -> the job the 404 names, polled with its stage on the
 // status line; the sketch stays usable all the time ----
 function needOf(e){var p=e&&(e.params||(e.reply&&e.reply.params));return e&&e.status===404&&p&&p.need&&p.need.what?p.need:null}
 function base(){return {target:P.c.target,game:P.c.game,modDir:P.c.modDir,map:P.key}}
 // P.ps: none (not asked) | loading | ready | missing. An inline view never starts the picture job by itself (it is
 // drawn with its card, also on a refresh): it says the picture is not made and offers a button that starts it
 function mkShow(){if(P.el.mk)P.el.mk.hidden=!P.need}
 function loadPicture(){var me=P.me;if(!P.key||RMT||!P.c.target)return;P.ps='loading';say('spic','mapviz.game.pk.picAsk');
  api('/api/x/mapviz/tiles'+qs(Object.assign(base(),{base:pb(),z:0,t:'0.0'})),undefined,{what:tx('mapviz.game.pk.picAsk')}).then(function(a){if(live(me))gotHead(a)},function(e){if(!live(me))return;var n=needOf(e);
   if(n&&!P.made&&P.noJob){P.need=n;P.ps='missing';say('spic','mapviz.game.pk.picNot');mkShow();return}if(n&&!P.made){makePic(n);return}picFail(e)})}
 // o.base: which picture of the viewer is shown under the marks. topo (the default) = the relief; l3 = the map with its
 // object models drawn in and no sun light or shadow (render l3; l4 is the lit one). A picture other than the relief that
 // cannot be read or made falls back to the relief once, and the status line says why
 function pb(){var b=P.o&&P.o.base;return P.fb||!b||['l0','l1','l2','l3','l4'].indexOf(b)<0?'topo':b}
 function picFail(e){if(pb()!=='topo'){P.fb=true;P.fbWhy=e?why(e):'';P.made=false;P.need=null;loadPicture();return}P.ps='missing';say('spic','mapviz.game.pk.picFault',{why:e?why(e):tx('mapviz.game.pk.picNone')})}
 function levelOf(hd){var z=Math.max(0,hd.zmax-2),n=function(z){var f=Math.pow(2,z);return [Math.ceil(Math.ceil(hd.w/f)/256),Math.ceil(Math.ceil(hd.h/f)/256)]},d=n(z);
  while(d[0]*d[1]>16&&z<hd.zmax){z++;d=n(z)}return {z:z,nx:d[0],ny:d[1]}}
 function gotHead(a){var me=P.me;if(!a||!(a.w>0)||!(a.h>0)||!(a.cell>0)){picFail(null);return}
  var hd={zmax:a.zmax>0?a.zmax|0:0,w:a.w,h:a.h,ox:a.ox,oy:a.oy,cell:a.cell},L=levelOf(hd),list=[],x,y;for(y=0;y<L.ny;y++)for(x=0;x<L.nx;x++)list.push(x+'.'+y);list=list.slice(0,16);
  P.pic={hd:hd,z:L.z,img:{},box:okBox(a.box)?a.box:null};if(!P.moved)fit();draw();
  api('/api/x/mapviz/tiles'+qs(Object.assign(base(),{base:pb(),z:L.z,t:list.join(',')})),undefined,{what:tx('mapviz.game.pk.picAsk')}).then(function(b){if(!live(me))return;take(b);P.ps='ready';if(P.fb)say('spic','mapviz.game.pk.picRelief',{why:P.fbWhy||''});else say('spic',pb()==='topo'?'mapviz.game.pk.picShown':'mapviz.game.pk.picObjects');draw()},function(e){if(live(me))picFail(e)})}
 // ---- sharper tiles when zoomed in: the level where one picture pixel is about one screen pixel, only the tiles in view,
 // at most 16 per request, asked 300 ms after the view last moved. One finer level is kept; the whole-map level stays under it ----
 function fineSoon(){if(!P.pic||P.ps!=='ready'||P.fineT||typeof setTimeout!=='function')return;var me=P.me,p=P;P.fineT=setTimeout(function(){p.fineT=null;if(P===p&&live(me))fine(me)},300)}
 function fine(me){var pic=P.pic,ktb=K().tileBox;if(!pic||!pic.hd||!ktb||pic.busy||P.ps!=='ready')return;var w=P.w,hh=P.h,z=pic.z,q;
  while(z>0){q=ktb(pic.hd,z,0,0,P.view,w,hh);if(Math.abs(q[2])<=384&&Math.abs(q[3])<=384)break;z--}
  if(z>=pic.z){return}if(!pic.fine||pic.fine.z!==z)pic.fine={z:z,img:{},asked:{}};
  var fn=pic.fine,f=Math.pow(2,z),nx=Math.ceil(Math.ceil(pic.hd.w/f)/256),ny=Math.ceil(Math.ceil(pic.hd.h/f)/256),want=[],x,y;if(nx*ny>16384)return;
  for(y=0;y<ny;y++)for(x=0;x<nx;x++){var n=x+'.'+y;if(fn.asked[n])continue;q=ktb(pic.hd,z,x,y,P.view,w,hh);var x0=Math.min(q[0],q[0]+q[2]),x1=Math.max(q[0],q[0]+q[2]),y0=Math.min(q[1],q[1]+q[3]),y1=Math.max(q[1],q[1]+q[3]);
   if(x1<0||y1<0||x0>w||y0>hh)continue;want.push([Math.abs((x0+x1)/2-w/2)+Math.abs((y0+y1)/2-hh/2),n])}
  if(!want.length)return;want.sort(function(a,b){return a[0]-b[0]});var list=want.slice(0,16).map(function(a){return a[1]});list.forEach(function(n){fn.asked[n]=1});pic.busy=true;
  api('/api/x/mapviz/tiles'+qs(Object.assign(base(),{base:pb(),z:z,t:list.join(',')})),undefined,{what:tx('mapviz.game.pk.picAsk')}).then(function(b){if(!live(me)||P.pic!==pic)return;pic.busy=false;if(pic.fine===fn)take(b,fn.img);draw()},function(){if(P.pic===pic)pic.busy=false})}
 function take(b,into){(b&&b.tiles||[]).forEach(function(t){if(!t||t.missing||!t.png||typeof Image!=='function')return;var r={img:null,ok:false},me=P.me;(into||P.pic.img)[t.t]=r;
  try{var im=new Image();im.onload=function(){r.ok=true;if(live(me))draw()};im.src='data:image/png;base64,'+t.png;r.img=im;if(im.complete&&im.width)r.ok=true}catch(e){}})}
 function stageWords(j){var st=T().stageText?T().stageText(j.stage):'',w=tx('mapviz.shell.what.'+j.what);if(!w||w.indexOf('mapviz.')===0)w=String(j.what||'');
  if(j.state==='queued')return tx('mapviz.game.pk.picQueued',{what:w});return j.total>0?tx('mapviz.game.pk.picMakingN',{what:w,stage:st||tx('mapviz.shell.stage.other'),done:j.done||0,total:j.total}):tx('mapviz.game.pk.picMaking',{what:w,stage:st||tx('mapviz.shell.stage.other')})}
 function makePic(n){var me=P.me,b={what:n.what,target:P.c.target,map:P.key},k;P.made=true;P.need=null;P.ps='loading';mkShow();if(P.c.game)b.game=P.c.game;if(P.c.modDir)b.modDirs=[P.c.modDir];
  for(k in n.args||{})if(Object.prototype.hasOwnProperty.call(n.args,k)&&n.args[k]!=null&&k!=='target'&&k!=='game'&&k!=='modDirs')b[k]=n.args[k];
  say('spic','mapviz.game.pk.picMaking',{what:n.what,stage:tx('mapviz.shell.stage.other')});
  api('/api/x/mapviz/job',b,{what:tx('mapviz.game.pk.picAsk')}).then(function(s){if(live(me))poll(me,s.id,0,s)},function(e){if(live(me))picFail(e)})}
 function poll(me,id,odd,j){if(!live(me))return;if(j&&j.state){if(j.state==='done'){loadPicture();return}if(j.state==='failed'||j.state==='cancelled'||j.state==='timeout'){picFail(j.error&&j.error.msg?{message:j.error.msg}:{message:j.state});return}
   say('spic','');P.el.spic.textContent=stageWords({what:j.what||pb(),state:j.state,stage:j.stage,done:j.done,total:j.total})}
  setTimeout(function(){if(!live(me))return;api('/api/x/mapviz/job'+qs({id:id})).then(function(r){poll(me,id,0,r)},function(e){if(odd>=3){if(live(me))picFail(e);return}poll(me,id,odd+1,null)})},700)}
 // ---- the dialog ----
 function evPos(e){var x=e&&fin(e.offsetX)?e.offsetX:null,y=e&&fin(e.offsetY)?e.offsetY:null;
  if(x===null&&P.cv.getBoundingClientRect&&e&&fin(e.clientX)){var r=P.cv.getBoundingClientRect();x=e.clientX-r.left;y=e.clientY-r.top}return x===null?null:[x,y]}
 // an inline view out of the page (its card is being redrawn) measures 0: it keeps the size it had
 function size(){var cv=P.cv,cw=cv.clientWidth>0?Math.round(cv.clientWidth):0;if(P.emb&&!cw&&cv.width===P.w)return;
  var w=cw||W0,hh=cv.clientHeight>0?Math.round(cv.clientHeight):P.emb?P.hgt:H0;if(w===P.w&&hh===P.h&&cv.width===w)return;
  var c=P.view?[P.view.cx,P.view.cy]:null;P.w=w;P.h=hh;cv.width=w;cv.height=hh;if(!P.moved||!c)fit()}
 // keys on the map. The dialog: arrows move the choice, Shift with arrows pans. An inline view: arrows pan, Shift with
 // arrows moves the choice, Enter takes what the pointer is over, else the choice
 function keyCanvas(e){if(!P)return;var k=e.key,step=(P.emb?!e.shiftKey:e.shiftKey)?null:12,pick=P.emb?(P.hov||P.sel):P.sel,s=P.sel||{x:P.view.cx,y:P.view.cy,place:null},done=true;
  if(k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown'){var dx=k==='ArrowLeft'?-1:k==='ArrowRight'?1:0,dy=k==='ArrowUp'?-1:k==='ArrowDown'?1:0;
   if(!step){P.view={cx:P.view.cx+dx*P.w/8/P.view.zoom,cy:P.view.cy-dy*P.h/8/P.view.zoom,zoom:P.view.zoom};P.moved=true;draw()}
   else{var q=ts(s.x,s.y),px=Math.max(0,Math.min(P.w,q[0]+dx*step)),py=Math.max(0,Math.min(P.h,q[1]+dy*step)),w=tw(px,py),h0=hitAt(px,py);select(h0.place?h0:{x:w[0],y:w[1],place:null},false)}}
  else if(k==='+'||k==='=')zoomAt(P.w/2,P.h/2,1.25);else if(k==='-'||k==='_')zoomAt(P.w/2,P.h/2,0.8);else if(k==='0'){fit();P.moved=false;draw()}
  else if(k==='Enter'||k===' '){if(pick)choose(pick);else select({x:P.view.cx,y:P.view.cy,place:null},false)}else done=false;
  if(done){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation()}}
 // the Tab ring stays inside the dialog; Esc cancels (an open suggestion list of the search box closes first: the kit stops that key)
 function keyBox(e){if(e.key==='Escape'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();cancel();return}
  if(e.key!=='Tab')return;var f=P.ring.filter(function(x){return x&&!x.disabled&&!x.hidden}),i=f.indexOf(document.activeElement);if(!f.length)return;
  if(e.shiftKey&&i<=0){f[f.length-1].focus();if(e.preventDefault)e.preventDefault()}else if(!e.shiftKey&&i===f.length-1){f[0].focus();if(e.preventDefault)e.preventDefault()}}
 function searchIndex(q,done){q=String(q||'').toLowerCase();var out=[];if(!P){done([]);return}
  P.places.forEach(function(p){if(p.dup)return;var l=plabel(p),id=String(p.id);if(q&&l.toLowerCase().indexOf(q)<0&&id.toLowerCase().indexOf(q)<0)return;
   out.push({label:l,value:l,hint:pkind(p.kind)+(id!==l?' '+id:''),place:p})});done(out.slice(0,400),Math.max(0,out.length-400))}
 function findPlace(v){v=String(v||'').toLowerCase();if(!v)return null;var hit=null;P.places.forEach(function(p){if(!hit&&!p.dup&&(plabel(p).toLowerCase()===v||String(p.id).toLowerCase()===v))hit=p});
  if(!hit)P.places.forEach(function(p){if(!hit&&!p.dup&&plabel(p).toLowerCase().indexOf(v)>=0)hit=p});return hit}
 // a .mi picked with Browse opens that mission (and its map when the file lies in another map folder)
 function onFind(v,item,from){if(!P)return;if(from==='browse'){var path=String(v||'').replace(/\\/g,'/'),m=stem(path),k=keyOf(path.slice(0,path.lastIndexOf('/')));
   if(!m||!/\.mi$/i.test(path))return;if(k&&k!==P.key){P.key=k;P.pic=null;P.wbox=null;P.play=null;P.made=false;P.fb=false;P.moved=false;loadPicture()}P.mode=m;P.got=[];P.places=P.given.slice();P.sel=null;P.el.inp.value='';
   head();loadPlaces();draw();return}
  var p=item&&item.place?item.place:findPlace(v);if(!p){say('sp','mapviz.game.pk.noFind',{q:String(v||'')});return}P.el.inp.value=plabel(p);select({x:p.x,y:p.y,place:p},true)}
 function head(){var e=P.el,nm=P.o&&P.o.mapName?String(P.o.mapName):'';
  // the caller's name of the map (mapName: its in-game name) leads the main line; the folder stays in the small line below
  e.misMain.textContent=!P.key?tx('mapviz.game.pk.noMap'):nm?tx(P.mode?'mapviz.game.pk.missionOn':'mapviz.game.pk.allMisOn',{name:nm}):P.mode?tx('mapviz.game.pk.mission'):tx('mapviz.game.pk.allMis');
  e.misFile.textContent=!P.key?'':P.mode?tx('mapviz.game.pk.files',{map:'map/'+P.key,file:P.mode+'.mi'}):tx('mapviz.game.pk.filesAll',{map:'map/'+P.key});e.misFile.hidden=!P.key}
 function build(o){var id='mvpk'+P.me,el=P.el={};
  el.title=h('h3',{id:id+'-t',text:o.title?String(o.title):tx('mapviz.game.pk.title'),style:'margin:0;font-size:16px'});
  // the header in plain words; the map folder and the mission file only as small secondary text
  el.misMain=h('p',{style:'margin:0'});el.misFile=h('p',{class:'hint',style:'margin:0;font-size:11px'});
  el.mis=h('div',{class:'mvpk-head'},[el.misMain,el.misFile]);
  el.sp=h('span',{});el.spic=h('span',{});
  el.status=h('p',{role:'status','aria-live':'polite',style:'margin:0;min-height:1.3em'},[el.sp,h('span',{text:' '}),el.spic]);
  el.inp=h('input',{type:'text',id:id+'-q',autocomplete:'off',placeholder:tx('mapviz.game.pk.findHint'),style:'width:100%','aria-describedby':id+'-st'});
  el.status.setAttribute('id',id+'-st');
  var lab=h('label',{for:id+'-q',text:tx('mapviz.game.pk.find'),style:'white-space:nowrap'});
  el.cv=h('canvas',{tabindex:'0','aria-label':tx('mapviz.game.pk.canvas'),'aria-describedby':id+'-ln',style:'display:block;width:100%;height:min(60vh,520px);border:1px solid var(--line);border-radius:4px;cursor:crosshair;touch-action:none;background:var(--bg)'});
  el.line=h('p',{id:id+'-ln','aria-live':'polite',style:'margin:0;min-height:1.3em'});
  el.ok=h('button',{type:'button',class:'primary',text:tx('mapviz.game.pk.choose'),onclick:function(){if(P&&P.sel)choose(P.sel)}});
  el.zin=h('button',{type:'button',text:tx('mapviz.game.pk.zoomIn'),title:tx('mapviz.game.pk.zoomIn'),onclick:function(){zoomAt(P.w/2,P.h/2,1.25)}});
  el.zout=h('button',{type:'button',text:tx('mapviz.game.pk.zoomOut'),title:tx('mapviz.game.pk.zoomOut'),onclick:function(){zoomAt(P.w/2,P.h/2,0.8)}});
  el.fit=h('button',{type:'button',text:tx('mapviz.game.pk.fit'),onclick:function(){fit();P.moved=false;draw()}});
  el.no=h('button',{type:'button',text:tx('mapviz.game.pk.cancel'),onclick:function(){cancel()}});
  el.keys=h('p',{class:'hint',style:'margin:0;font-size:12px',text:tx('mapviz.game.pk.keys')});
  el.box=h('div',{role:'dialog','aria-modal':'true','aria-labelledby':id+'-t',class:'mvpk',style:'background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;box-shadow:0 8px 28px var(--shadow);padding:12px 14px;width:min(1000px,96vw);max-height:96vh;overflow:auto;display:flex;flex-direction:column;gap:8px;box-sizing:border-box'},
   [el.title,el.mis,el.status,h('div',{style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'},[lab,el.inp]),el.cv,el.line,
    h('div',{style:'display:flex;gap:6px;flex-wrap:wrap;align-items:center'},[el.ok,el.no,h('span',{style:'flex:1 1 auto'}),el.zin,el.zout,el.fit]),el.keys]);
  el.ov=h('div',{class:'mvpk-ov',style:'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2000;background:var(--scrim);display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box',
   onmousedown:function(e){if(e&&e.target===el.ov)cancel()}},[el.box]);
  el.box.addEventListener('keydown',keyBox);
  wire(el.cv);
  return el}
 // a listener the view takes off again when it closes
 function on(t,ev,f){t.addEventListener(ev,f);P.ls.push([t,ev,f])}
 // the map's own listeners, the same for the dialog and an inline view: drag pans, the wheel zooms, a click takes
 function wire(cv){on(cv,'keydown',keyCanvas);
  on(cv,'mousedown',function(e){if(!P)return;var p=evPos(e);if(!p)return;P.drag={x:p[0],y:p[1],cx:P.view.cx,cy:P.view.cy};P.dragged=false;try{cv.focus()}catch(x){}});
  on(cv,'mousemove',function(e){if(!P)return;var p=evPos(e);if(!p)return;var d=P.drag;
   if(d){var dx=p[0]-d.x,dy=p[1]-d.y;if(Math.abs(dx)+Math.abs(dy)>3)P.dragged=true;if(P.dragged){P.view={cx:d.cx-dx/P.view.zoom,cy:d.cy+dy/P.view.zoom,zoom:P.view.zoom};P.moved=true;draw()}return}
   P.hov=hover(p[0],p[1]);line();draw()});
  on(cv,'mouseup',function(){if(P)P.drag=null});
  on(cv,'mouseleave',function(){if(!P)return;P.drag=null;P.hov=null;line();draw()});
  on(cv,'click',function(e){if(!P)return;if(P.dragged){P.dragged=false;return}var p=evPos(e);if(p)choose(hover(p[0],p[1]))});
  on(cv,'wheel',function(e){if(!P)return;var p=evPos(e)||[P.w/2,P.h/2];if(e.preventDefault)e.preventDefault();zoomAt(p[0],p[1],(e.deltaY||0)<0?1.25:0.8)})}
 // ---- the inline view: canvas, one status line, the legend row, a small toolbar ----
 function buildIn(o){var id='mvpk'+P.me,el=P.el={};
  el.sp=h('span',{});el.spic=h('span',{});el.line=h('span',{id:id+'-ln'});
  el.status=h('p',{role:'status','aria-live':'polite',class:'hint',style:'margin:0;min-height:1.3em;font-size:12px'},[el.sp,h('span',{text:' '}),el.spic,el.line]);
  el.cv=h('canvas',{tabindex:'0','aria-describedby':id+'-ln',style:cvCss(P.hgt)});
  el.leg=h('div',{class:'mvpk-leg',style:'display:flex;gap:4px 12px;flex-wrap:wrap;font-size:12px'});
  var bs='padding:2px 8px;font-size:12px;min-width:26px';
  el.zin=h('button',{type:'button',text:'+',style:bs,title:tx('mapviz.game.pk.zoomIn'),'aria-label':tx('mapviz.game.pk.zoomIn'),onclick:function(){if(P)zoomAt(P.w/2,P.h/2,1.25)}});
  el.zout=h('button',{type:'button',text:'-',style:bs,title:tx('mapviz.game.pk.zoomOut'),'aria-label':tx('mapviz.game.pk.zoomOut'),onclick:function(){if(P)zoomAt(P.w/2,P.h/2,0.8)}});
  el.fit=h('button',{type:'button',text:tx('mapviz.game.pk.fit'),style:bs,onclick:function(){fitAll()}});
  el.mk=h('button',{type:'button',text:tx('mapviz.game.pk.picMake'),style:bs,onclick:function(){if(P&&P.need)makePic(P.need)}});el.mk.hidden=true;
  el.root=h('div',{class:'mvpk-in',style:'display:flex;flex-direction:column;gap:4px;min-width:0'},[el.cv,el.status,el.leg,h('div',{style:'display:flex;gap:6px;flex-wrap:wrap;align-items:center'},[el.zin,el.zout,el.fit,el.mk])]);
  wire(el.cv);return el}
 function words(){P.el.cv.setAttribute('aria-label',(P.o.mapName?String(P.o.mapName)+'. ':'')+tx('mapviz.game.pk.canvasIn'))}
 function legend(){var box=P.el.leg,L=Array.isArray(P.o.legend)?P.o.legend:[];box.textContent='';
  L.forEach(function(it){if(!it||it.text==null||it.text==='')return;var gl=it.type==='goal',rt=it.type==='route',v='var(--'+(gl?'acc':sideTok(it.side))+')';   // type goal: the accent diamond; type route: a short line
   box.appendChild(h('span',{style:'display:inline-flex;align-items:center;gap:4px;white-space:nowrap'},[h('span',{'aria-hidden':'true',class:'mvpk-sw',
    style:rt?'display:inline-block;width:16px;height:0;border-top:2px dashed '+v:'display:inline-block;width:10px;height:10px;box-sizing:border-box;'+(gl?'transform:rotate(45deg);':'border-radius:50%;')+(it.side==='ally'&&!gl?'border:2px solid '+v:'background:'+v)}),h('span',{text:String(it.text)})]))});
  box.hidden=!box.children.length}
 function fitAll(){if(!P)return;fit();P.moved=false;draw()}
 // one draw per frame for what comes from outside (update, a new size)
 function soon(){if(!P||P.raf)return;P.raf=true;var f=function(){if(!P)return;P.raf=false;size();draw()},w=typeof window!=='undefined'?window:null;
  if(w&&typeof w.requestAnimationFrame==='function')w.requestAnimationFrame(f);else f()}
 // embed(o): o = {target | gameId | game, gameDir?, modDir? | mod?, map, mission?, mapName?, places?, marks?, legend?, height?,
 // onPick(result), makePicture?}; the handle {el, update(p), fit(), close(), state()}. The caller puts el into its page
 // and may take it out and put it back any number of times: the state (view, picture, places) lives here, not in the page
 function embed(o){var q={},k;o=o||{};for(k in o)if(own(o,k))q[k]=o[k];var km=mapOf(q);
  P={emb:true,o:q,me:++seq,c:ctxOf(q),key:km.key,mode:km.mis,given:norm(q.places),got:[],places:[],marks:normM(q.marks),modes:[],wbox:null,play:null,pic:null,ps:'none',need:null,noJob:q.makePicture!==true,made:false,
   view:null,w:W0,h:hgt(q),hgt:hgt(q),sel:null,hov:null,drag:null,dragged:false,moved:false,kit:null,g:null,ls:[],ro:null,raf:false};
  P.places=P.given.slice();var el=buildIn(q);P.cv=el.cv;words();legend();
  try{P.g=el.cv.getContext?el.cv.getContext('2d'):null}catch(e){P.g=null}
  size();fit();
  // the size follows the container: a ResizeObserver when the browser has one (it also tells when el is put back into
  // the page), the window's resize, and every update()
  if(typeof ResizeObserver==='function'){try{P.ro=new ResizeObserver(function(){soon()});P.ro.observe(el.cv)}catch(e){P.ro=null}}
  if(typeof window!=='undefined'&&window&&typeof window.addEventListener==='function')on(window,'resize',function(){soon()});
  line();say('spic',RMT||!P.key?'':'mapviz.game.pk.sketch');draw();loadPlaces();loadPicture();
  return {el:el.root,update:update,fit:fitAll,close:close,state:state,_t:{raw:function(){return P},toScreen:function(x,y){return P?ts(x,y):null},toWorld:function(x,y){return P?tw(x,y):null},markAt:function(x,y){return P?markAt(x,y,false):null}}}}
 // update(p): places, marks, legend, map, mission, mapName, target (and the other fields of embed), height, onPick. A
 // changed map, game, game folder or mod reads the places and the picture again and fits; a changed mission reads the
 // places again; anything else keeps the view and asks for nothing
 function update(p){if(!P||!p)return;var o=P.o,k;for(k in p)if(own(p,k))o[k]=p[k];
  var km=mapOf(o),c=ctxOf(o),ch=km.key!==P.key||c.target!==P.c.target||c.game!==P.c.game||c.modDir!==P.c.modDir,chm=km.mis!==P.mode;
  if(own(p,'places'))P.given=norm(o.places);if(own(p,'marks'))P.marks=normM(o.marks);if(own(p,'legend'))legend();if(own(p,'mapName'))words();
  if(own(p,'height')&&hgt(o)!==P.hgt){P.hgt=hgt(o);P.el.cv.setAttribute('style',cvCss(P.hgt))}
  if(ch||chm){var pic=ch||P.ps==='loading';P.me=++seq;P.key=km.key;P.mode=km.mis;P.c=c;P.got=[];P.modes=[];P.sel=null;P.hov=null;
   if(ch){P.wbox=null;P.play=null;P.moved=false}if(pic){P.pic=null;P.made=false;P.fb=false;P.need=null;P.ps='none';mkShow();say('spic',RMT||!P.key?'':'mapviz.game.pk.sketch')}
   merge();if(!P.moved)fit();loadPlaces();if(pic)loadPicture()}
  else{merge();if(!P.moved)fit()}
  line();soon()}
 function state(){if(!P)return null;return {map:P.key,target:P.c.target,places:P.places.filter(function(p){return !p.dup}).length,marks:P.marks.length,picture:P.ps,view:{cx:P.view.cx,cy:P.view.cy,zoom:P.view.zoom}}}
 // open(o): o = {target | gameId | game, gameDir?, modDir? | mod?, map, mission?, places?, title?, onPick({x, y, units, upm,
 // m: {x, y}, place, map, mission, target}), onCancel?}; one picker at a time (a second open replaces the first)
 function open(o){o=o||{};close();var me=++seq,km=mapOf(o),key=km.key,mis=km.mis;
  P={o:o,me:me,c:ctxOf(o),key:key,mode:mis,given:norm(o.places),got:[],places:[],marks:[],ls:[],ps:'none',need:null,modes:[],wbox:null,play:null,pic:null,made:false,view:null,w:W0,h:H0,sel:null,hov:null,drag:null,dragged:false,moved:false,kit:null,g:null,
   back:typeof document!=='undefined'?document.activeElement:null};
  P.places=P.given.slice();var el=build(o);P.cv=el.cv;head();
  try{P.g=el.cv.getContext?el.cv.getContext('2d'):null}catch(e){P.g=null}
  var host=document.body||document.documentElement;host.appendChild(el.ov);size();fit();
  // the search box: the page's searchKit (Browse = the mission files of the map folder, the index = the place labels,
  // the history), put on after the input is in the page
  if(typeof searchKit==='function'){try{P.kit=searchKit(el.inp,{key:'mapviz.pick',index:searchIndex,onPick:onFind,
   browse:{mode:'file',view:'data',start:function(){return P&&P.key?'map/'+P.key:'map'},exts:['mi']}})}catch(e){P.kit=null}}
  if(!P.kit)el.inp.addEventListener('keydown',function(e){if(e.key==='Enter')onFind(el.inp.value,null,'index')});
  var kb=el.inp.parentNode&&el.inp.parentNode!==el.inp?(el.inp.parentNode.children||[]).filter(function(x){return x.tagName==='BUTTON'}):[];
  P.ring=[el.inp].concat(kb,[el.cv,el.ok,el.no,el.zin,el.zout,el.fit]);
  line();say('spic',RMT||!key?'':'mapviz.game.pk.sketch');draw();loadPlaces();loadPicture();
  try{if(P.kit&&P.kit.focus)P.kit.focus();else el.inp.focus()}catch(e){}
  return {close:close,me:me}}
 // close(): the dialog goes with its listeners and search box; a job it started runs on (its picture lands in the cache);
 // the focus goes back where it was. An inline view: its listeners and its size watch go, an answer or a job poll that
 // comes later is dropped, its element leaves the page, and every later call of its handle does nothing
 function close(){if(!P)return;var p=P;P=null;try{if(p.kit&&p.kit.close)p.kit.close()}catch(e){}
  p.ls.forEach(function(l){try{if(l[0].removeEventListener)l[0].removeEventListener(l[1],l[2])}catch(e){}});p.ls=[];
  if(p.emb){try{if(p.ro)p.ro.disconnect()}catch(e){}if(p.el.root.parentNode)p.el.root.parentNode.removeChild(p.el.root);return}
  if(p.el&&p.el.ov&&p.el.ov.parentNode)p.el.ov.parentNode.removeChild(p.el.ov);
  try{if(p.back&&p.back.focus)p.back.focus()}catch(e){}}
 return {open:open,close:close,embed:embed,isOpen:function(){return !!P},
  _t:{state:function(){return P},playBox:function(){return P?playBox():null},keyOf:keyOf,stem:stem,ctxOf:ctxOf,hitAt:function(x,y){return P?hitAt(x,y):null},toScreen:function(x,y){return P?ts(x,y):null},toWorld:function(x,y){return P?tw(x,y):null},levelOf:levelOf,plabel:plabel,result:function(s){return P?result(s):null}}}}
 // the dialog is one view; embed(o) makes a view of its own each time (null where there is no document to build in)
 var DLG=mk();
 return {open:DLG.open,close:DLG.close,isOpen:DLG.isOpen,_t:DLG._t,embed:function(o){return typeof document==='undefined'||!document?null:mk().embed(o)}};
})();
MVX.picker=PK;
if(typeof window!=='undefined'&&window)window.MAPVIZ_PICK=PK;
EXT_SCREENS.mapviz.parts.push({id:'game',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=EXT_SCREENS.mapviz.kit||null,el={};
 var PKINDS={ammo:1,base:1,evac:1,spawn_ext:1,other:1};
 function css(hx){return K&&K.colourCss?K.colourCss(hx):''}
 function num(x){return String(Math.round(x))}
 function pal(){return V.pal||{}}
 function sideOf(team){var s=pal().sides||{};return s[team]||s.neutral||null}
 function teamText(team){return team==='a'||team==='b'?tx('mapviz.game.side.'+team):tx('mapviz.game.side.none')}
 function mode(){var d=V.doc,m=V.q('mode');if(!d||!Array.isArray(d.modes)||!d.modes.length)return null;
  for(var i=0;i<d.modes.length;i++)if(d.modes[i]&&d.modes[i].id===m)return d.modes[i];return m?null:d.modes[0]}
 function sideOk(team){var s=V.q('side');return !s||s==='both'||team===s}
 function pos(o){return o&&typeof o.x==='number'&&typeof o.y==='number'&&isFinite(o.x)&&isFinite(o.y)}
 // ---- the items of the mode ----
 function flags(){var m=mode();return m&&Array.isArray(m.flags)?m.flags.filter(pos):[]}
 function zoneOk(z){return z&&((z.kind==='circle'&&z.rA>0)||(z.kind==='poly'&&Array.isArray(z.pts)&&z.pts.length>=3))}
 function zones(){return flags().filter(function(f){return zoneOk(f.zone)})}
 function spawns(){var m=mode();return m&&Array.isArray(m.spawns)?m.spawns.filter(function(s){return pos(s)&&sideOk(s.team)}):[]}
 function points(){var m=mode();return m&&Array.isArray(m.points)?m.points.filter(function(p){return pos(p)&&sideOk(p.team)}):[]}
 function okBox(b){return Array.isArray(b)&&b.length===4&&b[2]>b[0]&&b[3]>b[1]}
 function boxes(){var d=V.doc,out=[];if(!d||!d.boxes)return out;var B=d.boxes;
  if(okBox(B.world))out.push({what:'world',team:null,b:B.world});
  if(okBox(B.camera))out.push({what:'camera',team:null,b:B.camera});
  var m=mode(),named=Array.isArray(B.named)?B.named:[],seen={};
  ((m&&m.clipsBySide)||[]).forEach(function(c){if(!c||!sideOk(c.team)||(c.team!=='a'&&c.team!=='b'))return;var k=c.team+'|'+c.clip+'|'+c.phase;if(seen[k])return;seen[k]=1;
   named.forEach(function(n){if(n&&n.name===c.clip&&okBox(n.camera))out.push({what:'side',team:c.team,clip:c.clip,phase:c.phase,b:n.camera})})});
  return out}
 // ---- drawing (README 3.1: world u, x east, y north; 5.3 angles counter-clockwise from +x) ----
 function ring(ctx,p,r){ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2)}
 function label(ctx,p,text,dy){if(!ctx.fillText||!text)return;var mk=pal().marks||{};ctx.font='12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  if(ctx.strokeText){ctx.strokeStyle=css(mk.halo);ctx.lineWidth=3;ctx.strokeText(text,p[0],p[1]+dy)}ctx.fillStyle=css(mk.flagRing)||V.token('fg');ctx.fillText(text,p[0],p[1]+dy)}
 function mark(ctx,p,sd,r){ring(ctx,p,r);if(!sd)return;if(sd.shape==='outlined'){ctx.strokeStyle=css(sd.fill);ctx.lineWidth=2.5;ctx.stroke()}else{ctx.fillStyle=css(sd.fill);ctx.fill();ctx.strokeStyle=css(sd.line);ctx.lineWidth=1;ctx.stroke()}}
 // a circle zone's rings for the chosen side (world u): side a -> rA, side b -> rB, both -> both (one when equal)
 function radii(z){var a=z.rA,b=z.rB>0?z.rB:z.rA,s=V.q('side');if(s==='a')return [{r:a,team:'a'}];if(s==='b')return [{r:b,team:'b'}];
  return a===b?[{r:a,team:null}]:[{r:a,team:'a'},{r:b,team:'b'}]}
 function drawZones(ctx,view){if(!ctx.beginPath)return;var mk=pal().marks||{};zones().forEach(function(f){var z=f.zone,p=view.toScreen(f.x,f.y),sd=sideOf(f.team),line=css(mk.flagRing)||V.token('fg');
   if(z.kind==='poly'){ctx.beginPath();for(var k=0;k<z.pts.length;k++){var q=view.toScreen(z.pts[k][0],z.pts[k][1]);if(k)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])}if(ctx.closePath)ctx.closePath();
    if(sd&&sd.wash){ctx.fillStyle=css(sd.wash);ctx.fill()}ctx.strokeStyle=line;ctx.lineWidth=mk.flagRingWidth||2;ctx.stroke();return}
   // the wash fills the widest ring once; with two rings the ring of side B is dashed
   var rs=radii(z),wi=0;rs.forEach(function(x,i){if(x.r>rs[wi].r)wi=i});
   rs.forEach(function(x,i){ctx.beginPath();ctx.arc(p[0],p[1],Math.max(x.r*view.zoom,1),0,Math.PI*2);if(i===wi&&sd&&sd.wash){ctx.fillStyle=css(sd.wash);ctx.fill()}ctx.strokeStyle=line;ctx.lineWidth=mk.flagRingWidth||2;
    if(ctx.setLineDash)ctx.setLineDash(rs.length>1&&x.team==='b'?[6,4]:[]);ctx.stroke()});if(ctx.setLineDash)ctx.setLineDash([])})}
 function drawFlags(ctx,view){if(!ctx.beginPath)return;flags().forEach(function(f){var p=view.toScreen(f.x,f.y);mark(ctx,p,sideOf(f.team),6);label(ctx,p,f.name||'',-14)})}
 function drawSpawns(ctx,view){if(!ctx.beginPath)return;var mk=pal().marks||{};spawns().forEach(function(s){var p=view.toScreen(s.x,s.y);mark(ctx,p,sideOf(s.team),5);
   if(typeof s.yaw==='number'&&isFinite(s.yaw)){var a=s.yaw*Math.PI/180;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(p[0]+Math.cos(a)*14,p[1]-Math.sin(a)*14);ctx.strokeStyle=css(mk.spawnArrow)||V.token('fg');ctx.lineWidth=2;ctx.stroke()}})}
 function drawPoints(ctx,view){if(!ctx.beginPath)return;points().forEach(function(o){var p=view.toScreen(o.x,o.y),sd=sideOf(o.team);ctx.beginPath();
   if(ctx.rect)ctx.rect(p[0]-4,p[1]-4,8,8);else ring(ctx,p,4);if(sd){ctx.fillStyle=css(sd.fill);ctx.fill();ctx.strokeStyle=css(sd.line);ctx.lineWidth=1;ctx.stroke()}})}
 function drawBoxes(ctx,view){if(!ctx.strokeRect)return;var mk=pal().marks||{};boxes().forEach(function(x){var p=view.toScreen(x.b[0],x.b[3]),q=view.toScreen(x.b[2],x.b[1]),sd=x.team?sideOf(x.team):null;
   ctx.strokeStyle=sd?css(sd.line):(css(mk.scaleBar)||V.token('line'));ctx.lineWidth=x.what==='world'?2:1;if(ctx.setLineDash)ctx.setLineDash(x.what==='world'?[]:x.what==='camera'?[8,4]:[3,3]);
   ctx.strokeRect(p[0],p[1],q[0]-p[0],q[1]-p[1]);if(ctx.setLineDash)ctx.setLineDash([])})}
 // ---- the DOM list (shell list()) and hits ----
 // two radii in metres (20 u per metre): one per side when they differ. The doc holds world u: AS2 and AS64 zoneA/zoneB
 // are metres, at least 1, times 20 [V]; a GoH zone radius is taken
 // as written, in u, with no 1 m minimum and no units-per-metre scaling (GHMAP-04 [V], mapdoc.js zoneGoh)
 function zoneText(z){if(!z)return tx('mapviz.game.zoneNone');if(z.kind==='poly')return tx('mapviz.game.zonePoly',{n:z.pts.length});
  return z.rB>0&&z.rB!==z.rA?tx('mapviz.game.zoneTeams',{a:num(z.rA/20),b:num(z.rB/20)}):tx('mapviz.game.zoneCircle',{r:num(z.rA/20)})}
 // the phase goes into an item's text only when the mode holds more than one phase
 function phased(){var m=mode(),seen={},n=0;if(!m)return false;['flags','spawns','points','clipsBySide'].forEach(function(k){(Array.isArray(m[k])?m[k]:[]).forEach(function(o){
   if(o&&typeof o.phase==='number'&&!seen[o.phase]){seen[o.phase]=1;n++}})});return n>1}
 function ph(o,t){return o&&typeof o.phase==='number'&&phased()?t+' '+tx('mapviz.game.phase',{n:o.phase}):t}
 function listFlags(){return flags().map(function(f){return {label:ph(f,tx('mapviz.game.flagItem',{name:f.name||'?',side:teamText(f.team),zone:zoneText(zoneOk(f.zone)?f.zone:null)})),x:f.x,y:f.y}})}
 function listZones(){return zones().map(function(f){var c=centre(f);return {label:ph(f,tx('mapviz.game.zoneItem',{name:f.name||'?',zone:zoneText(f.zone)})),x:c[0],y:c[1]}})}
 function listSpawns(){return spawns().map(function(s){return {label:ph(s,tx('mapviz.game.spawnItem',{name:s.name||tx('mapviz.game.noName'),side:teamText(s.team),order:s.order==null?'':s.order})),x:s.x,y:s.y}})}
 function listPoints(){return points().map(function(o){return {label:ph(o,tx('mapviz.game.pointItem',{what:tx('mapviz.game.pt.'+(PKINDS[o.kind]?o.kind:'other')),name:o.name||tx('mapviz.game.noName'),side:teamText(o.team)})),x:o.x,y:o.y}})}
 function listBoxes(){return boxes().map(function(x){var w=Math.round((x.b[2]-x.b[0])/20),hh=Math.round((x.b[3]-x.b[1])/20);
   return {label:ph(x,tx(x.what==='side'?'mapviz.game.boxSide':'mapviz.game.box.'+x.what,{w:w,h:hh,side:teamText(x.team)})),x:(x.b[0]+x.b[2])/2,y:(x.b[1]+x.b[3])/2}})}
 function centre(f){var z=f.zone;if(z&&z.kind==='poly'){var sx=0,sy=0;z.pts.forEach(function(p){sx+=p[0];sy+=p[1]});return [sx/z.pts.length,sy/z.pts.length]}return [f.x,f.y]}
 // inside the ring of the chosen side; side both: inside either ring
 function inside(f,x,y){var z=f.zone;if(!zoneOk(z))return false;
  if(z.kind==='circle'){var dx=x-f.x,dy=y-f.y,d2=dx*dx+dy*dy;return radii(z).some(function(r){return d2<=r.r*r.r})}
  var c=false,P=z.pts;for(var i=0,j=P.length-1;i<P.length;j=i++){if(((P[i][1]>y)!==(P[j][1]>y))&&(x<(P[j][0]-P[i][0])*(y-P[i][1])/(P[j][1]-P[i][1])+P[i][0]))c=!c}return c}
 function hitZone(x,y){var out=[];zones().forEach(function(f){if(inside(f,x,y))out.push({label:tx('mapviz.game.zoneHit'),value:f.name||'?'})});return out.length?out:null}
 // ---- layers ----
 function sw(c){return c||null}
 V.addLayer({id:'zones',group:'game',label:'mapviz.game.zones',engineTrue:true,defaultOn:true,draw:drawZones,list:listZones,hit:hitZone,
  legend:function(){var s=pal().sides,mk=pal().marks||{};return s&&s.neutral?[{color:sw(s.neutral.wash),label:tx('mapviz.game.zoneLegend')},{color:sw(mk.flagRing),label:tx('mapviz.game.zoneLegendB')}]:null}});
 V.addLayer({id:'flags',group:'game',label:'mapviz.game.flags',engineTrue:true,defaultOn:true,draw:drawFlags,list:listFlags,
  legend:function(){var s=pal().sides;return s?[{color:sw(s.neutral&&s.neutral.fill),label:tx('mapviz.game.flagLegend')}]:null}});
 V.addLayer({id:'spawns',group:'game',label:'mapviz.game.spawns',engineTrue:true,defaultOn:true,draw:drawSpawns,list:listSpawns,
  legend:function(){var s=pal().sides;return s?[{color:sw(s.a&&s.a.fill),label:tx('mapviz.game.spawnA')},{color:sw(s.b&&s.b.fill),label:tx('mapviz.game.spawnB')}]:null}});
 // points: an estimate. The positions are read from the map file, but the kind each one is drawn and listed as (ammo,
 // base, evac, other) is guessed from the def name (tools/mapviz/lib/mapkit/mapdoc.js pointKind)
 V.addLayer({id:'points',group:'game',label:'mapviz.game.points',engineTrue:false,defaultOn:true,draw:drawPoints,list:listPoints});
 V.addLayer({id:'boxes',group:'game',label:'mapviz.game.boxes',engineTrue:true,defaultOn:true,draw:drawBoxes,list:listBoxes,
  legend:function(){var mk=pal().marks;return mk?[{color:sw(mk.scaleBar),label:tx('mapviz.game.boxLegend')}]:null}});
 // ---- mission: the named places of the mode's mission file (GET places), read once per game, folder, mod, map and
 // mode, after the map document landed (or failed: then for the mode the page holds) ----
 var MS={k:null,d:null,err:null};
 function msKey(){return [V.q('target')||'',V.q('game')||'',V.q('mod')||'',V.q('map')||'',V.q('mode')||''].join('|')}
 function msWant(){if(!V.q('map')||!V.q('target')){MS.k=null;MS.d=null;MS.err=null;return}if(V.q('docBusy'))return;var k=msKey();if(k===MS.k)return;MS.k=k;MS.d=null;MS.err=null;
  V.api('GET','places',{target:V.q('target'),game:V.q('game'),modDir:V.q('mod'),map:V.q('map'),mode:V.q('mode')||null}).then(function(r){if(MS.k!==k)return;
   MS.d={places:(r&&Array.isArray(r.places)?r.places:[]).filter(pos)};if(typeof V.relist==='function')V.relist();V.redraw();summary()},
   function(e){if(MS.k!==k)return;if(e&&e.stale){MS.k=null;return}MS.d={places:[]};MS.err=e;summary()})}
 // the places the document does not draw already: a map point named in the mode's flags, spawns or points is left out
 function msPlaces(){if(!MS.d||MS.k!==msKey())return [];var m=mode(),seen={};
  if(m)['flags','spawns','points'].forEach(function(k){(Array.isArray(m[k])?m[k]:[]).forEach(function(o){if(o&&o.name!=null)seen[String(o.name).toLowerCase()]=1})});
  return MS.d.places.filter(function(p){if(p.kind==='zone'||p.kind==='waypoint')return true;return !seen[String(p.id).toLowerCase()]&&sideOk(p.team)})}
 function msZones(){return msPlaces().filter(function(p){return p.kind==='zone'&&(p.r>0||(Array.isArray(p.pts)&&p.pts.length>=3))})}
 function drawMission(ctx,view){if(!ctx.beginPath)return;var mk=pal().marks||{},s=pal().sides||{},line=css(mk.flagRing)||V.token('fg'),ps=msPlaces(),boxes=[],vis=0;
  msZones().forEach(function(p){ctx.beginPath();if(p.pts){for(var k=0;k<p.pts.length;k++){var q=view.toScreen(p.pts[k][0],p.pts[k][1]);if(k)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1])}if(ctx.closePath)ctx.closePath()}
   else{var c=view.toScreen(p.x,p.y);ctx.arc(c[0],c[1],Math.max(p.r*view.zoom,2),0,Math.PI*2)}
   ctx.strokeStyle=line;ctx.lineWidth=p.dup?1:1.5;if(ctx.setLineDash)ctx.setLineDash(p.dup?[2,3]:[6,3]);ctx.stroke();if(ctx.setLineDash)ctx.setLineDash([])});
  ps.forEach(function(p){if(p.dup)return;var c=view.toScreen(p.x,p.y);if(p.kind==='waypoint'){if(c[0]>=0&&c[1]>=0&&c[0]<=view.w&&c[1]<=view.h)vis++;ring(ctx,c,2.5);if(s.neutral){ctx.fillStyle=css(s.neutral.fill);ctx.fill()}return}
   if(p.kind==='zone'){ring(ctx,c,2.5);ctx.fillStyle=line;ctx.fill();return}mark(ctx,c,sideOf(p.team),p.kind==='start'?5:6)});
  // labels: one that would overlap a label already written is left out; waypoint labels only while few are in view
  if(!ctx.fillText)return;ps.forEach(function(p){if(p.dup||(p.kind==='waypoint'&&vis>40))return;var c=view.toScreen(p.x,p.y),t=plabel(p);if(!t||!(view.w>0)||c[0]<0||c[1]<0||c[0]>view.w||c[1]>view.h)return;
   var tw=ctx.measureText?ctx.measureText(t).width:t.length*7,y=c[1]-(p.kind==='waypoint'?9:14),r=[c[0]-tw/2-2,y-8,c[0]+tw/2+2,y+8];
   for(var i=0;i<boxes.length;i++){var o=boxes[i];if(r[0]<o[2]&&r[2]>o[0]&&r[1]<o[3]&&r[3]>o[1])return}boxes.push(r);label(ctx,[c[0],y],t,0)})}
 function msItem(p){return {label:tx('mapviz.game.msnItem',{what:pkind(p.kind),name:plabel(p)}),x:p.x,y:p.y}}
 // the DOM list: every zone and named point, and one row per waypoint group (its first waypoint)
 function listMission(){var ps=msPlaces(),out=[],grp={},order=[];ps.forEach(function(p){if(p.dup)return;if(p.kind!=='waypoint'){out.push(msItem(p));return}
   var g=p.group||'';if(!grp[g]){grp[g]={n:0,x:p.x,y:p.y};order.push(g)}grp[g].n++});
  order.forEach(function(g){out.push({label:tx('mapviz.game.pathItem',{name:g||tx('mapviz.game.noName'),n:grp[g].n}),x:grp[g].x,y:grp[g].y})});return out}
 function hitMission(x,y){var out=[];msZones().forEach(function(p){if(p.dup)return;var inz=p.pts?inside({zone:{kind:'poly',pts:p.pts}},x,y):((x-p.x)*(x-p.x)+(y-p.y)*(y-p.y)<=p.r*p.r);
  if(inz)out.push({label:tx('mapviz.game.msnHit'),value:plabel(p)})});return out.length?out:null}
 // engineTrue: the places are read from the mission file as written; a label is only a reading of the name
 V.addLayer({id:'mission',group:'game',label:'mapviz.game.mission',engineTrue:true,defaultOn:true,draw:drawMission,list:listMission,hit:hitMission,
  legend:function(){var mk=pal().marks;return mk?[{color:sw(mk.flagRing),label:tx('mapviz.game.msnLegend')}]:null}});
 // ---- the panel: what the mode holds ----
 function summary(){var box=el.sum;if(!box)return;box.textContent='';var d=V.doc;
  if(!V.q('map')||!d){box.appendChild(h('p',{class:'hint',text:tx('mapviz.game.noMap')}));return}
  var m=mode();if(!m){box.appendChild(h('p',{class:'hint',text:tx('mapviz.game.noMode')}));return}
  var allSp=(m.spawns||[]).filter(pos),sp=spawns(),fl=flags(),pt=points();
  // flags: the document's, and the mission's places named as flags or bases (Helpers zones of a single-player mission)
  var ms=msPlaces().filter(function(p){return !p.dup}),mf=ms.filter(function(p){return p.lab&&(p.lab.k==='flag'||p.lab.k==='pbase'||p.lab.k==='ebase')}).length;
  box.appendChild(h('p',{text:tx('mapviz.game.modeIs',{mode:m.id})}));
  box.appendChild(h('p',{text:tx('mapviz.game.nFlags',{n:fl.length+mf})}));
  if(!allSp.length)box.appendChild(h('p',{class:'hint',text:tx('mapviz.game.noSpawns')}));
  else box.appendChild(h('p',{text:tx('mapviz.game.nSpawns',{n:sp.length})}));
  if(pt.length)box.appendChild(h('p',{text:tx('mapviz.game.nPoints',{n:pt.length})}));
  var mz=ms.filter(function(p){return p.kind==='zone'}).length,mw=ms.filter(function(p){return p.kind==='waypoint'}).length;
  if(mz)box.appendChild(h('p',{text:tx('mapviz.game.nZones',{n:mz})}));
  if(mw)box.appendChild(h('p',{text:tx('mapviz.game.nPaths',{n:mw})}));
  if(MS.err)box.appendChild(h('p',{class:'hint',text:tx('mapviz.game.msnFault',{msg:String(MS.err.text||MS.err.message||MS.err)})}))}
 V.addPanel({id:'game',side:'left',build:function(box){el.sum=h('div',{blk:'mv.game.sum','aria-live':'polite','data-blkname':tx('mapviz.game.blk.sum')});
  box.appendChild(h('div',{blk:'mv.game.title','data-blkname':tx('mapviz.game.title')},[h('h3',{text:tx('mapviz.game.title')})]));box.appendChild(el.sum);summary()}});
 V.on('map',function(){msWant();summary()});
 V.on('doc',function(){msWant();summary()});
 V.on('refresh',function(){msWant();summary()});
}});
})();
`;
