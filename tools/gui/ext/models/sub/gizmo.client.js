// Models page part `gizmo`: the move / rotate / scale handles the 3D view (sub/viewer.client.js) draws on the selected bone or volume.
// The view calls G = EXT_SCREENS.models.parts.gizmo(host) once, with
//   host.target() -> { kind: 'bone'|'volume', id (bone path | volume id), world (12), parent (12, the world of what it hangs on),
//                      vol (the scene volume), posed (an animation frame is shown) } | null
//   host.preview({ kind, id, world } | null)   draws the object (and, for a bone, all below it) at world while dragging
//   host.op(name, args) -> Promise             one document op (EXT_SCREENS.models.doc.op)
//   host.say(text), host.redraw()
// and then G.lines(V) (segments to draw, colours by palette name), G.hit(V, x, y), G.down(V, hit, x, y, e), G.move(V, x, y, e), G.up()
// (-> the op's Promise, or nothing), G.cancel(), G.setMode(m), G.sync(). V = one pane: { e, f, r, u, ortho, project(p) -> [x, y],
// ray(x, y) -> {o, d}, upp(p) } with x, y in pane pixels.
// A drag moves the object in the view only (preview); letting go sends exactly one op, from the table OPS below.
// OPS (checked against tools/lib/model/edit/tree.js and vol.js):
//   bone   move / rotate / scale -> bone.setMatrix { bone: path, matrix: world, space: 'world' }  (tree.js turns it local)
//   volume move / rotate         -> vol.setMatrix  { volume: id, matrix: local }   local = world * inverse(bone world)
//   volume scale                 -> vol.transform  { volume: id, scale: [x, y, z] } (the shape's own sizes; a polyhedron is refused there)
// Bones are not moved while an animation frame is shown (the view shows the pose, the op would change the rest place).
// Matrices: 12 numbers, rows x, y, z axes then the position; a point p lands at p * M. World: +Z up, 20 units per metre.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Author: Imperator_Aug (ARSENAL, ia-1a7e7ce2)
module.exports = String.raw`
EXT_SCREENS.models.parts.gizmo=(function(){
 var OPS={bone:{move:'bone.setMatrix',rotate:'bone.setMatrix',scale:'bone.setMatrix'},volume:{move:'vol.setMatrix',rotate:'vol.setMatrix',scale:'vol.transform'}};
 var MODES=['select','move','rotate','scale'],UPM=20,PX=80,HITPX=8;
 // the Files part's preferences: snapMove in game units (the bar shows metres: / UPM), snapTurn in degrees; 0 or missing -> null
 function prefStep(k){var P=EXT_SCREENS.models.prefs;if(!P||typeof P.get!=='function')return null;
  var v=Number(P.get(k==='move'?'snapMove':'snapTurn'));if(!(v>0))return null;return k==='move'?v/UPM:v}
 // one preferences listener for every gizmo bar on the page: a changed snap preference becomes the step (and the bar's own value)
 var GZ=[],PHOOK=null;
 function hookPrefs(){var P=EXT_SCREENS.models.prefs;if(!P||typeof P.on!=='function'||PHOOK===P)return;PHOOK=P;
  P.on(function(n){var k=n==='snapMove'?'move':n==='snapTurn'?'rotate':null;if(!k)return;var v=prefStep(k);if(!v)return;
   GZ=GZ.filter(function(g){return g.row.isConnected!==false});
   GZ.forEach(function(g){g.st.step[k]=v;if(g.inp[k])g.inp[k].value=String(v)});LS.set(k==='move'?'models.gizmo.stepMove':'models.gizmo.stepRot',v)})}
 function sub3(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
 function add3(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
 function scl3(a,s){return [a[0]*s,a[1]*s,a[2]*s]}
 function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
 function crs3(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
 function len3(a){return Math.sqrt(dot3(a,a))}
 function nrm3(a){var l=len3(a)||1;return [a[0]/l,a[1]/l,a[2]/l]}
 function inv12(m){var a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h2=m[7],i=m[8];
  var A=e*i-f*h2,B=-(d*i-f*g),C=d*h2-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-20)return null;var q=1/det;
  var r=[A*q,-(b*i-c*h2)*q,(b*f-c*e)*q,B*q,(a*i-c*g)*q,-(a*f-c*d)*q,C*q,-(a*h2-b*g)*q,(a*e-b*d)*q],t=[-m[9],-m[10],-m[11]];
  return r.concat([t[0]*r[0]+t[1]*r[3]+t[2]*r[6],t[0]*r[1]+t[1]*r[4]+t[2]*r[7],t[0]*r[2]+t[1]*r[5]+t[2]*r[8]])}
 function mul12(a,b){var o=new Array(12);for(var r=0;r<4;r++)for(var c=0;c<3;c++){var s=r===3?b[9+c]:0;for(var k=0;k<3;k++)s+=a[r*3+k]*b[k*3+c];o[r*3+c]=s}return o}
 function clean(m){return m.map(function(x){var r=Math.round(x*1e6)/1e6;return Object.is(r,-0)?0:r})}
 // the three handle axes at the object: local = its own axes (unit), world = X Y Z
 function axesOf(w,space){if(space==='world')return [[1,0,0],[0,1,0],[0,0,1]];return [nrm3(w.slice(0,3)),nrm3(w.slice(3,6)),nrm3(w.slice(6,9))]}
 // parameter along the line o + a t (a unit) closest to the ray ro + rd s (rd unit); null when they are parallel
 function closestT(o,a,ro,rd){var w0=sub3(o,ro),b=dot3(a,rd),d=dot3(a,w0),e=dot3(rd,w0),den=1-b*b;if(den<1e-6)return null;return (b*e-d)/den}
 function planeHit(o,n,ro,rd){var dn=dot3(rd,n);if(Math.abs(dn)<1e-9)return null;var t=dot3(sub3(o,ro),n)/dn;return add3(ro,scl3(rd,t))}
 // v turned by angle (radians) about the unit axis n (right hand)
 function rotv(v,n,a){var c=Math.cos(a),s=Math.sin(a);return add3(add3(scl3(v,c),scl3(crs3(n,v),s)),scl3(n,dot3(n,v)*(1-c)))}
 function snap(v,step){return step>0?Math.round(v/step)*step:v}
 function segDist(p,a,b){var ab=[b[0]-a[0],b[1]-a[1]],q=ab[0]*ab[0]+ab[1]*ab[1],t=q?((p[0]-a[0])*ab[0]+(p[1]-a[1])*ab[1])/q:0;t=Math.max(0,Math.min(1,t));
  var x=a[0]+ab[0]*t-p[0],y=a[1]+ab[1]*t-p[1];return Math.sqrt(x*x+y*y)}
 // new world matrices
 function moved(w,d){var o=w.slice();o[9]+=d[0];o[10]+=d[1];o[11]+=d[2];return o}
 function turned(w,n,a){var o=w.slice();for(var i=0;i<3;i++){var r=rotv(w.slice(i*3,i*3+3),n,a);o[i*3]=r[0];o[i*3+1]=r[1];o[i*3+2]=r[2]}return o}
 function scaled(w,s){var o=w.slice();for(var i=0;i<3;i++)for(var k=0;k<3;k++)o[i*3+k]=w[i*3+k]*s[i];return o}
 // the one op for a finished drag: t = host.target(), mode, world = the new world, sc = the scale [x, y, z] (scale mode)
 function opFor(t,mode,world,sc){if(!t)return null;var name=(OPS[t.kind]||{})[mode];if(!name)return null;
  if(t.kind==='bone')return {name:name,args:{bone:t.id,matrix:clean(world),space:'world'}};
  if(name==='vol.transform')return {name:name,args:{volume:t.id,scale:sc.map(function(x){return Math.round(x*1e6)/1e6})}};
  var ip=inv12(t.parent||[1,0,0,0,1,0,0,0,1,0,0,0]);if(!ip)return null;return {name:name,args:{volume:t.id,matrix:clean(mul12(world,ip))}}}
 function circle(o,n,r,N){var a=Math.abs(n[2])<0.9?[0,0,1]:[1,0,0],u=nrm3(crs3(n,a)),v=crs3(n,u),P=[];for(var i=0;i<=N;i++){var t=i/N*Math.PI*2;P.push(add3(o,add3(scl3(u,Math.cos(t)*r),scl3(v,Math.sin(t)*r))))}return P}

 function gizmo(host){
  var el=h;
  // snap steps: the bar's own value when set there, else the Files part's preferences snapMove (game units) and snapTurn (degrees)
  var st={mode:LS.get('models.gizmo.mode','select'),space:LS.get('models.gizmo.space','local'),snap:!!LS.get('models.gizmo.snap',false),
   step:{move:Number(LS.get('models.gizmo.stepMove',0))||prefStep('move')||0.05,rotate:Number(LS.get('models.gizmo.stepRot',0))||prefStep('rotate')||5,scale:Number(LS.get('models.gizmo.stepScale',0.05))||0.05}};
  var INP={};
  if(MODES.indexOf(st.mode)<0)st.mode='select';
  var drag=null,hot=null;
  var mb={};
  function modeBtn(m){var b=el('button',{type:'button',text:tx(['models.gizmo.mode',m].join('.')),title:tx(['models.gizmo.key',m].join('.')),onclick:function(){G.setMode(m)}});mb[m]=b;return b}
  var sSpace=el('select',{'aria-label':tx('models.gizmo.space')},['local','world'].map(function(v){return el('option',{value:v,text:tx(['models.gizmo.space',v].join('.'))})}));
  sSpace.addEventListener('change',function(){st.space=sSpace.value;LS.set('models.gizmo.space',st.space);host.redraw()});
  var cSnap=el('input',{type:'checkbox'});cSnap.addEventListener('change',function(){st.snap=!!cSnap.checked;LS.set('models.gizmo.snap',st.snap)});
  function num(key,lsk,unit){var i=el('input',{type:'number',min:'0',step:'any',style:'width:5em','aria-label':tx(['models.gizmo.step',key].join('.'))});i.value=String(st.step[key]);INP[key]=i;
   i.addEventListener('change',function(){var v=Number(i.value);if(v>0){st.step[key]=v;LS.set(lsk,v)}else i.value=String(st.step[key])});
   return F('step.'+key,tx(['models.gizmo.step',key].join('.')),i,el('span',{text:' '+tx(unit)}))}
  // blocks (sub/README.md "Blocks"): the bar is a row container (host.blk, default 'gizmo'): the mode buttons one leaf, then one leaf
  // per field in the page's fld shape (div.fld > label.f > span.n + control + unit)
  var BID=host.blk||'gizmo';
  function F(id,name,ctl,after,chk){return el('div',{class:'fld',blk:BID+'.'+id,'data-blkname':name},[el('label',{class:'f'+(chk?' chk':'')},[el('span',{class:'n',text:name}),ctl,after||el('span')])])}
  var row=el('div',{class:'row',blk:BID,box:'row','data-blkname':host.name||tx('models.gizmo.space')},[el('div',{class:'row',blk:BID+'.modes'},MODES.map(modeBtn)),
   F('space',tx('models.gizmo.space'),sSpace),F('snap',tx('models.gizmo.snap'),cSnap,null,true),
   num('move','models.gizmo.stepMove','models.gizmo.unit.m'),num('rotate','models.gizmo.stepRot','models.gizmo.unit.deg'),num('scale','models.gizmo.stepScale','models.gizmo.unit.x')]);
  function sync(){MODES.forEach(function(m){mb[m].setAttribute('aria-pressed',st.mode===m?'true':'false');mb[m].style.fontWeight=st.mode===m?'bold':'normal'});
   sSpace.value=st.space;sSpace.disabled=st.mode==='scale';cSnap.checked=st.snap}
  function size(V,o){return (V.upp?V.upp(o):1)*PX}
  function T(){var t=host.target();return t&&t.world?t:null}
  // handle shapes in world space: {axis: 0..2 | -1 centre, a, b} segments
  function shapes(V,t){var o=t.world.slice(9,12),s=size(V,o),A=axesOf(t.world,st.mode==='scale'?'local':st.space),out=[];
   if(st.mode==='move'||st.mode==='scale'){A.forEach(function(a,i){out.push({axis:i,a:o,b:add3(o,scl3(a,s))});
     if(st.mode==='scale'){var e=add3(o,scl3(a,s)),q=s*0.06,u=nrm3(crs3(a,V.f));out.push({axis:i,a:add3(e,scl3(u,-q)),b:add3(e,scl3(u,q))})}});
    var c=s*0.12,r=V.r,u=V.u,P=[add3(o,add3(scl3(r,-c),scl3(u,-c))),add3(o,add3(scl3(r,c),scl3(u,-c))),add3(o,add3(scl3(r,c),scl3(u,c))),add3(o,add3(scl3(r,-c),scl3(u,c)))];
    for(var k=0;k<4;k++)out.push({axis:-1,a:P[k],b:P[(k+1)%4]})}
   else if(st.mode==='rotate'){A.forEach(function(a,i){var C=circle(o,a,s*0.9,40);for(var k=0;k+1<C.length;k++)out.push({axis:i,a:C[k],b:C[k+1]})})}
   return out}
  var COL=['x','y','z'];
  GZ.push({row:row,st:st,inp:INP});hookPrefs();
  var G={el:row,
   lines:function(V){if(!V||st.mode==='select')return [];var t=T();if(!t)return [];var a=drag?drag.axis:hot;
    return shapes(V,t).map(function(s){return {a:s.a,b:s.b,c:s.axis===a&&a!=null?'acc':s.axis<0?'hint':COL[s.axis]}})},
   hit:function(V,x,y){if(!V||st.mode==='select')return null;var t=T();if(!t)return null;var best=null,bd=HITPX;
    // the centre first (all three axes start there), then the nearest handle line
    if(st.mode!=='rotate'){var c=V.project(t.world.slice(9,12));if(c&&Math.abs(c[0]-x)<=HITPX&&Math.abs(c[1]-y)<=HITPX)return {axis:-1}}
    shapes(V,t).forEach(function(s){var a=V.project(s.a),b=V.project(s.b);if(!a||!b)return;var d=segDist([x,y],a,b);if(d<bd){bd=d;best={axis:s.axis}}});
    return best},
   down:function(V,hh,x,y,e){var t=T();drag=null;if(!t||!hh)return;
    if(t.kind==='bone'&&t.posed){host.say(tx('models.gizmo.posed'));return}
    var o=t.world.slice(9,12),A=axesOf(t.world,st.mode==='scale'?'local':st.space),R=V.ray(x,y);
    drag={t:t,mode:st.mode,axis:hh.axis,o:o,A:A,x0:x,y0:y,world:t.world.slice(),sc:[1,1,1],ang:0,last:null,d:[0,0,0],changed:false};
    if(hh.axis>=0){var a=A[hh.axis];
     if(st.mode==='rotate'){var p=planeHit(o,a,R.o,R.d);drag.last=p&&Math.abs(dot3(R.d,a))>0.05?sub3(p,o):null}
     else drag.t0=closestT(o,a,R.o,R.d)}
    else drag.p0=planeHit(o,V.f,R.o,R.d);
    host.redraw()},
   move:function(V,x,y,e){if(!drag||!V)return;var t=drag.t,o=drag.o,R=V.ray(x,y),w=t.world,snapOn=st.snap!==!!(e&&e.altKey),txt='';
    if(drag.mode==='move'){var d=[0,0,0];
     if(drag.axis>=0){var a=drag.A[drag.axis],c=closestT(o,a,R.o,R.d);if(c==null||drag.t0==null)return;var k=c-drag.t0;if(snapOn)k=snap(k,st.step.move*UPM);d=scl3(a,k)}
     else{var p=planeHit(o,V.f,R.o,R.d);if(!p||!drag.p0)return;d=sub3(p,drag.p0);
      // Ctrl keeps the move to the screen's up and down, Shift to its left and right
      if(e&&(e.ctrlKey||e.metaKey))d=scl3(V.u,dot3(d,V.u));else if(e&&e.shiftKey)d=scl3(V.r,dot3(d,V.r));
      if(snapOn)d=d.map(function(v){return snap(v,st.step.move*UPM)})}
     drag.d=d;drag.world=moved(w,d);txt=tx('models.gizmo.readMove',{x:(d[0]/UPM).toFixed(2),y:(d[1]/UPM).toFixed(2),z:(d[2]/UPM).toFixed(2)})}
    else if(drag.mode==='rotate'){var n=drag.A[drag.axis];if(drag.axis<0)return;var p2=planeHit(o,n,R.o,R.d),step=0;
     if(drag.last&&p2&&Math.abs(dot3(R.d,n))>0.05){var v1=sub3(p2,o);step=Math.atan2(dot3(n,crs3(drag.last,v1)),dot3(drag.last,v1));drag.last=v1}
     else{step=(x-(drag.px==null?drag.x0:drag.px))*0.01;drag.last=p2&&Math.abs(dot3(R.d,n))>0.05?sub3(p2,o):null}
     drag.px=x;drag.ang+=step;var deg=drag.ang*180/Math.PI;if(snapOn)deg=snap(deg,st.step.rotate);
     drag.deg=deg;drag.world=turned(w,n,deg*Math.PI/180);txt=tx('models.gizmo.readRotate',{a:deg.toFixed(1)})}
    else if(drag.mode==='scale'){var s=[1,1,1];
     if(drag.axis>=0){var a2=drag.A[drag.axis],c2=closestT(o,a2,R.o,R.d);if(c2==null||!drag.t0)return;var f=c2/drag.t0;if(!(f>0.001))f=0.001;if(snapOn)f=Math.max(st.step.scale,snap(f,st.step.scale));s[drag.axis]=f}
     else{var f2=Math.max(0.001,1+(x-drag.x0)/100);if(snapOn)f2=Math.max(st.step.scale,snap(f2,st.step.scale));s=[f2,f2,f2]}
     drag.sc=s;drag.world=scaled(w,s);txt=tx('models.gizmo.readScale',{x:s[0].toFixed(2),y:s[1].toFixed(2),z:s[2].toFixed(2)})}
    drag.changed=true;host.preview({kind:t.kind,id:t.id,world:drag.world});host.say(txt)},
   up:function(){var d=drag;drag=null;if(!d)return;if(!d.changed){host.preview(null);return}
    var same=d.mode==='scale'?d.sc.every(function(x){return x===1}):d.world.every(function(x,i){return Math.abs(x-d.t.world[i])<1e-9});
    if(same){host.preview(null);host.say('');return}
    var o=opFor(d.t,d.mode,d.world,d.sc);if(!o){host.preview(null);return}
    var pr=host.op(o.name,o.args);host.say(tx('models.gizmo.sent'));
    return Promise.resolve(pr).then(function(j){host.say('');return j},function(x){host.preview(null);host.say(tx('models.gizmo.failed',{e:(x&&x.message)||'?'}));throw x})},
   cancel:function(){if(drag){drag=null;host.preview(null);host.say('')}},
   setMode:function(m){if(MODES.indexOf(m)<0)return;st.mode=m;LS.set('models.gizmo.mode',m);sync();host.redraw()},
   sync:function(){hot=null;sync()},
   _st:function(){return {st:st,drag:drag}}};
  sync();
  return G}
 gizmo._t={OPS:OPS,closestT:closestT,planeHit:planeHit,rotv:rotv,snap:snap,moved:moved,turned:turned,scaled:scaled,opFor:opFor,inv12:inv12,mul12:mul12,axesOf:axesOf,segDist:segDist};
 return gizmo})();
`;
