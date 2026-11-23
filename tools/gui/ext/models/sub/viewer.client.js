// Models page part `viewer` (sub/README.md "The 3D view"): the WebGL 1 view of a model, hand-written, no library.
// One pane or four (perspective + top, front, side; each pane its own camera, ortho or perspective, maximise one), fixed views,
// orbit, roll, pan, dolly, fly, frame selection / all, reset; render modes (shaded, textured, solid, wire, solid + wire, paint,
// normals check); show and hide by kind (meshes, volumes, bones, bone names, volume names, entities, obstacles, areas, grid with metre marks,
// axes, bounds, mesh vectors), LOD level; picking of bones, meshes (-> their bone) and volumes; the move / rotate / scale handles
// of sub/gizmo.client.js when that part is there. Data: the open document (EXT_SCREENS.models.doc, tools/lib/model/edit/README.md)
// when there is one: D.scene({ anm, frame, meshes, lod }), redrawn on D.on events (only what changed is fetched again, the
// cameras stay); else POST /api/x/models/viewer/scene (viewer.server.js). Textures: POST /api/x/models/viewer/texture.
// Colours: every colour the view draws comes from the page's CSS variables (window.cssv when the page has it, else getComputedStyle;
// the background and GL clear colour are --card), read again on window.onTheme, on data-theme of the html element and on the OS scheme.
// Preferences (Files part, EXT_SCREENS.models.prefs): fov in degrees for the perspective panes, grid = game units per grid cell.
// Clicks: opts.onPick(hit) takes the click over (the view stays at rest, no readout; Armor); opts.onHit(hit) is only told (the view
// keeps following the document's pose and its readout; ../client.js passes it on to ctx.onPick for the Model sub-tab's parts).
// A hit carries the ray of the click in the clicked pane: origin (the eye, or the near plane of a flat view) and dir (unit, into
// the scene). camera() -> { eye, dir, ortho } of the active pane (the Shot part aims its Shoot button with it).
// hit.hits: every volume under the click, nearest first ({volume, name, side, point, aim}); a shot takes the first one shells hit
// (Armor, Shot). onPick may answer {volume}: that volume is selected instead of the one clicked (a ram box in front of it).
// hit.ground: [x, y, 0] where the click ray meets the ground (the plane z = 0 of model space, where areas and obstacles are drawn)
// when the ray goes down to it in front of its start and the point is near the model (within max(4 x the scene's bounding radius,
// 400 units) of the middle of the scene's bounds on the plane), else null; perspective and flat panes alike (groundAt). A shot
// tool shoots there when no volume shells hit is under the click, or when that volume is farther along the ray than the ground.
// sceneInfo() -> { world (the root bone's world matrix, 12 numbers, or null), middle (of the bounds), radius, ctr: {volume id:
// its middle} } of the scene shown, or null before one is loaded (Armor aims its camera shots with it).
// Hidden in the Skeleton tree (D.hidden, the 'hidden' event): those bones (with everything under them) and volumes are not drawn or picked.
// Matrices: scene/1 sends 12 numbers (rows x, y, z, t; row vectors). The 4x4 here is that matrix with a 0,0,0,1 column; read
// column-major by GL it is the column-vector form, so a local point lands where scene.js tp puts it. World: +X forward, +Z up.
// A ready-made scene of many models (opts.scene = { url, body }, setScene; a line-up of a buy): the scene/1 JSON comes from that
// route (POST body + mod -> { scene } | { ok: false, error }) instead of the document or the viewer's own route: no document, no
// handles, no animation list, no LOD. Each mesh may carry `target` (its textures are asked with it; a mesh without one is drawn
// untextured) and `figure` (a number: opts.onFigure(n) on a click, focusFigure(n)). One picture per (target, folder of the mesh
// file, name) is loaded and shared by every part that names it; at most TEXQ texture requests run at once. The camera fits the
// bounds of the meshes (fitBox: every corner inside the pane, so a long row fills the width), from the front at an angle
// (rowView; models face +X); a double click or A fits all again.
// Pure maths and state helpers are on EXT_SCREENS.models.parts.viewer._t for viewer.test.js. Page rules: no backtick, no
// dollar-brace, no innerHTML.
// Author: Imperator_Aug (ARSENAL, ia-5670911a)
module.exports = String.raw`
EXT_SCREENS.models.parts.viewer=(function(){
 var LIVE=[];
 // rows of the F2 key list (Files part); these keys act only while the 3D view has the focus (doc.client KEYMAP 'view')
 var MK=EXT_SCREENS.models;MK.keys=MK.keys||[];
 [['W, E, R, Q','gizmo'],['F, A','fit'],['1, 3, 7 (Ctrl: the other side)','views'],['5','ortho'],['4, F6','panes'],['Esc','esc'],['right button + W A S D Q E','fly']]
  .forEach(function(r){MK.keys.push({keys:r[0],key:['models.viewer.key',r[1]].join('.'),area:'view'})});
 // ---------- maths (pure) ----------
 function m4(m){return [m[0],m[1],m[2],0,m[3],m[4],m[5],0,m[6],m[7],m[8],0,m[9],m[10],m[11],1]}
 function xf(a,p){return [a[0]*p[0]+a[4]*p[1]+a[8]*p[2]+a[12],a[1]*p[0]+a[5]*p[1]+a[9]*p[2]+a[13],a[2]*p[0]+a[6]*p[1]+a[10]*p[2]+a[14]]}
 function mul4(a,b){var o=new Array(16);for(var c=0;c<4;c++)for(var r=0;r<4;r++){var s=0;for(var k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s}return o}
 function sub3(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
 function add3(a,b){return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]}
 function scl3(a,s){return [a[0]*s,a[1]*s,a[2]*s]}
 function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
 function crs3(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
 function nrm3(a){var l=Math.sqrt(dot3(a,a))||1;return [a[0]/l,a[1]/l,a[2]/l]}
 function persp(fov,asp,n,f){var t=1/Math.tan(fov/2);return [t/asp,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0]}
 function orthoM(hw,hh,n,f){return [1/hw,0,0,0,0,1/hh,0,0,0,0,-2/(f-n),0,0,0,-(f+n)/(f-n),1]}
 function view(e,x,y,z){return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot3(x,e),-dot3(y,e),-dot3(z,e),1]}
 // inverse of the 3x3 part (rows x, y, z); v*R -> v'*inv
 function inv3(m){var a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h2=m[7],i=m[8];
  var A=e*i-f*h2,B=-(d*i-f*g),C=d*h2-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-20)return null;var q=1/det;
  return [A*q,-(b*i-c*h2)*q,(b*f-c*e)*q,B*q,(a*i-c*g)*q,-(a*f-c*d)*q,C*q,-(a*h2-b*g)*q,(a*e-b*d)*q]}
 function vm3(v,r){return [v[0]*r[0]+v[1]*r[3]+v[2]*r[6],v[0]*r[1]+v[1]*r[4]+v[2]*r[7],v[0]*r[2]+v[1]*r[5]+v[2]*r[8]]}
 function toLocal(m,o,d){var r=inv3(m);if(!r)return null;return {o:vm3([o[0]-m[9],o[1]-m[10],o[2]-m[11]],r),d:vm3(d,r)}}
 // 12-number matrices: tp(m,p) = p*m; mul12(a,b) = a followed by b (mdl.mul); inv12 the inverse placement
 function tp(m,p){return [p[0]*m[0]+p[1]*m[3]+p[2]*m[6]+m[9],p[0]*m[1]+p[1]*m[4]+p[2]*m[7]+m[10],p[0]*m[2]+p[1]*m[5]+p[2]*m[8]+m[11]]}
 function mul12(a,b){var o=new Array(12);for(var r=0;r<4;r++)for(var c=0;c<3;c++){var s=r===3?b[9+c]:0;for(var k=0;k<3;k++)s+=a[r*3+k]*b[k*3+c];o[r*3+c]=s}return o}
 function inv12(m){var r=inv3(m);if(!r)return null;var t=vm3([-m[9],-m[10],-m[11]],r);return r.concat(t)}
 // box side from the axis and sign of the face: +X 0 front, +Z 1 top, +Y 2 left, -Y 3 right, -X 4 rear, -Z 5 bottom
 function sideOf(ax,sg){return ax===0?(sg>0?0:4):ax===1?(sg>0?2:3):(sg>0?1:5)}
 function rayBox(o,d,size){var tn=-Infinity,tf=Infinity,an=-1,sn=0,af=-1,sf=0;
  for(var i=0;i<3;i++){var hh=Math.abs(size[i])/2;
   if(Math.abs(d[i])<1e-12){if(o[i]<-hh||o[i]>hh)return null;continue}
   var t1=(-hh-o[i])/d[i],t2=(hh-o[i])/d[i],ta,tb,sa,sb;
   if(d[i]>0){ta=t1;sa=-1;tb=t2;sb=1}else{ta=t2;sa=1;tb=t1;sb=-1}
   if(ta>tn){tn=ta;an=i;sn=sa}if(tb<tf){tf=tb;af=i;sf=sb}}
  if(tn>tf||tf<0||an<0)return null;
  return tn>=0?{t:tn,side:sideOf(an,sn)}:{t:tf,side:sideOf(af,sf)}}
 function raySph(o,d,r){var a=dot3(d,d),b=2*dot3(o,d),c=dot3(o,o)-r*r,q=b*b-4*a*c;if(a<1e-20||q<0)return null;
  var s=Math.sqrt(q),t=(-b-s)/(2*a);if(t<0)t=(-b+s)/(2*a);return t<0?null:{t:t,side:0}}
 function rayCyl(o,d,r,len){var hh=Math.abs(len)/2,best=Infinity,a=d[0]*d[0]+d[1]*d[1];
  if(a>1e-20){var b=2*(o[0]*d[0]+o[1]*d[1]),c=o[0]*o[0]+o[1]*o[1]-r*r,q=b*b-4*a*c;
   if(q>=0){var s=Math.sqrt(q);[(-b-s)/(2*a),(-b+s)/(2*a)].forEach(function(t){var z=o[2]+t*d[2];if(t>=0&&z>=-hh&&z<=hh&&t<best)best=t})}}
  if(Math.abs(d[2])>1e-12)[-hh,hh].forEach(function(zc){var t=(zc-o[2])/d[2],x=o[0]+t*d[0],y=o[1]+t*d[1];if(t>=0&&x*x+y*y<=r*r&&t<best)best=t});
  return best<Infinity?{t:best,side:0}:null}
 // Moller-Trumbore, both faces; t or -1
 function rayTri(o,d,a,b,c){var e1=sub3(b,a),e2=sub3(c,a),p=crs3(d,e2),det=dot3(e1,p);if(Math.abs(det)<1e-12)return -1;
  var iv=1/det,s=sub3(o,a),u=dot3(s,p)*iv;if(u<0||u>1)return -1;var q=crs3(s,e1),v=dot3(d,q)*iv;if(v<0||u+v>1)return -1;
  var t=dot3(e2,q)*iv;return t>=0?t:-1}
 function unb64(s,T){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new T(u.buffer)}
 function triOf(v){if(v._tri===undefined)v._tri=v.triangles?unb64(v.triangles,Float32Array):null;return v._tri}
 // one volume of scene/1 against a world ray -> {t, side} | null
 function hitVol(v,o,d){if(!v||!v.world)return null;var L=toLocal(v.world,o,d);if(!L)return null;
  if(v.kind==='box')return v.size?rayBox(L.o,L.d,v.size):null;
  if(v.kind==='sphere')return v.radius>0?raySph(L.o,L.d,v.radius):null;
  if(v.kind==='cylinder')return v.radius>0?rayCyl(L.o,L.d,v.radius,v.length||0):null;
  if(v.kind==='polyhedron'){var T=triOf(v);if(!T)return null;var best=null;
   for(var i=0;i+8<T.length;i+=9){var t=rayTri(L.o,L.d,[T[i],T[i+1],T[i+2]],[T[i+3],T[i+4],T[i+5]],[T[i+6],T[i+7],T[i+8]]);
    if(t>=0&&(!best||t<best.t))best={t:t,side:Math.max(0,((v.sides||[])[i/9]||1)-1)}}return best}
  return null}
 function pick(vols,o,d,skip){var best=null;(vols||[]).forEach(function(v,i){if(skip&&skip(v,i))return;var h=hitVol(v,o,d);
  if(h&&(!best||h.t<best.t))best={t:h.t,side:h.side,index:i,volume:v.id}});
  if(best)best.point=add3(o,scl3(d,best.t));return best}
 // every volume along a world ray, nearest first: [{t, side, index, volume, name, point, aim}]. aim = the entry point moved a little
 // into the volume along the ray (half the chord, at most AIMIN units), so a shot from another side through it surely crosses it.
 var AIMIN=0.25;
 function pickAll(vols,o,d,skip){var out=[];(vols||[]).forEach(function(v,i){if(skip&&skip(v,i))return;var h=hitVol(v,o,d);if(!h)return;
  var p=add3(o,scl3(d,h.t)),far=add3(p,scl3(d,1e5)),x=hitVol(v,far,scl3(d,-1)),chord=x?Math.max(0,1e5-x.t):0;
  out.push({t:h.t,side:h.side,index:i,volume:v.id,name:v.name||null,point:p,aim:add3(p,scl3(d,Math.min(AIMIN,chord/2)))})});
  out.sort(function(a,b){return a.t-b.t});return out}
 // meshes: [{world, pos: Float32Array local, ix: index array, bone}] -> nearest {t, index, bone} | null (local AABB first)
 function pickMesh(meshes,o,d,skip){var best=null;(meshes||[]).forEach(function(m,mi){if(!m||!m.world||(skip&&skip(m,mi)))return;var L=toLocal(m.world,o,d);if(!L)return;
  (m.hit||[]).forEach(function(p){if(p.box&&!rayBox(sub3(L.o,p.box.c),L.d,p.box.s))return;var P=p.pos,I=p.ix;
   for(var k=0;k+2<I.length;k+=3){var a=I[k]*3,b=I[k+1]*3,c=I[k+2]*3;var t=rayTri(L.o,L.d,[P[a],P[a+1],P[a+2]],[P[b],P[b+1],P[b+2]],[P[c],P[c+1],P[c+2]]);
    if(t>=0&&(!best||t<best.t))best={t:t,index:mi,bone:m.bone}}})});
  if(best)best.point=add3(o,scl3(d,best.t));return best}
 function aabbOf(P){var mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(var i=0;i+2<P.length;i+=3)for(var c=0;c<3;c++){if(P[i+c]<mn[c])mn[c]=P[i+c];if(P[i+c]>mx[c])mx[c]=P[i+c]}
  return mn[0]===Infinity?null:{c:[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2],s:[mx[0]-mn[0]+1e-3,mx[1]-mn[1]+1e-3,mx[2]-mn[2]+1e-3],min:mn,max:mx}}
 // nearest projected point to (sx, sy) within maxPx: pts [[sx, sy, depth] | null] -> index | -1
 function nearPt(pts,sx,sy,maxPx){var bi=-1,bd=maxPx*maxPx;(pts||[]).forEach(function(p,i){if(!p||p[2]<-1||p[2]>1)return;var dx=p[0]-sx,dy=p[1]-sy,q=dx*dx+dy*dy;if(q<=bd){bd=q;bi=i}});return bi}

 // ---------- cameras and panes (pure) ----------
 var PI=Math.PI,HALF=PI/2,FOV=0.8,ZSTEPS=24,GRIDM=20;
 // the Files part's preferences: fov (degrees, 20..120) for the perspective panes, grid (game units per cell); every open view redraws
 function prefV(n,d){var P=EXT_SCREENS.models.prefs;if(!P||typeof P.get!=='function')return d;var v=P.get(n);return v==null?d:v}
 function readPrefs(){var f=Number(prefV('fov',0));if(f>=20&&f<=120)FOV=f*PI/180;var g=Number(prefV('grid',20));GRIDM=g>=1&&g<=2000?g:20}
 var PREFHOOK=null;
 function hookPrefs(){var P=EXT_SCREENS.models.prefs;if(!P||typeof P.on!=='function'||PREFHOOK===P)return;PREFHOOK=P;
  P.on(function(n){if(n!=='fov'&&n!=='grid')return;readPrefs();LIVE.forEach(function(x){if(!x.gone&&typeof x.dirty==='function')x.dirty()})})}
 var VIEWS=['persp','front','back','left','right','top','bottom'];
 var FIXED={front:[0,0],back:[PI,0],left:[HALF,0],right:[-HALF,0],top:[PI,HALF],bottom:[0,-HALF]};
 function newCam(v,ortho){var c={view:'persp',ortho:!!ortho,yaw:0.7,pitch:0.4,roll:0,dist:100,ctr:[0,0,0],rad:50,step:12,base:100};setView(c,v||'persp');return c}
 function setView(c,v){if(VIEWS.indexOf(v)<0)v='persp';c.view=v;if(FIXED[v]){c.yaw=FIXED[v][0];c.pitch=FIXED[v][1];c.roll=0}else{c.yaw=0.7;c.pitch=0.4;c.roll=0}return c}
 function camBasis(c){var cp=Math.cos(c.pitch),sp=Math.sin(c.pitch),cy=Math.cos(c.yaw),sy=Math.sin(c.yaw);
  var back=[cp*cy,cp*sy,sp],e=add3(c.ctr,scl3(back,c.dist)),f=scl3(back,-1),r=[-sy,cy,0],u=crs3(r,f);
  if(c.roll){var cr=Math.cos(c.roll),sr=Math.sin(c.roll),r2=add3(scl3(r,cr),scl3(u,sr)),u2=add3(scl3(u,cr),scl3(r,-sr));r=r2;u=u2}
  return {e:e,f:f,r:r,u:u}}
 function halfH(c){return c.dist*Math.tan(FOV/2)}
 function camMat(c,asp){var B=camBasis(c),P;
  if(c.ortho){var hh=halfH(c);P=orthoM(hh*asp,hh,-c.rad*8,c.dist+c.rad*8)}
  else P=persp(FOV,asp,Math.max(c.dist-c.rad*3,c.dist*0.01,0.05),c.dist+c.rad*4);
  return {PV:mul4(P,view(B.e,B.r,B.u,scl3(B.f,-1))),B:B}}
 // a ray through the pane point (nx, ny in -1..1, y up)
 function camRay(c,nx,ny,asp){var B=camBasis(c),t=Math.tan(FOV/2);
  if(c.ortho){var hh=halfH(c);return {o:add3(add3(B.e,scl3(B.f,-c.rad*8)),add3(scl3(B.r,nx*hh*asp),scl3(B.u,ny*hh))),d:B.f}}
  return {o:B.e,d:nrm3(add3(B.f,add3(scl3(B.r,nx*t*asp),scl3(B.u,ny*t))))}}
 // world point -> [x, y (pane pixels, y down), ndc z] | null
 function project(PV,p,w,h){var x=PV[0]*p[0]+PV[4]*p[1]+PV[8]*p[2]+PV[12],y=PV[1]*p[0]+PV[5]*p[1]+PV[9]*p[2]+PV[13],z=PV[2]*p[0]+PV[6]*p[1]+PV[10]*p[2]+PV[14],q=PV[3]*p[0]+PV[7]*p[1]+PV[11]*p[2]+PV[15];
  if(q<=1e-9)return null;return [(x/q+1)/2*w,(1-y/q)/2*h,z/q]}
 // world units per screen pixel at p
 function upp(c,p,hpx){if(c.ortho)return 2*halfH(c)/Math.max(1,hpx);var B=camBasis(c),dep=Math.max(1e-3,dot3(sub3(p,B.e),B.f));return 2*dep*Math.tan(FOV/2)/Math.max(1,hpx)}
 function frameTo(c,b){if(!b)return c;var d=sub3(b.max,b.min);c.ctr=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2];
  c.rad=Math.max(5,Math.sqrt(dot3(d,d))/2);c.base=c.ortho?c.rad*1.15/Math.tan(FOV/2):c.rad*2.6;c.step=12;c.dist=c.base;return c}
 function stepDist(c){return c.base*Math.pow(1.25,12-c.step)}
 // ---------- a scene of many models (opts.scene): fit, default angle, figures (pure) ----------
 // the camera of c moved, its angles kept, so every corner of the box b = {min, max} is inside a pane of aspect asp (width /
 // height) with a small margin. rad (optional): the radius kept for the clip planes and zoom limits when b is one figure of a
 // larger scene (so the rest of the scene is not clipped away)
 function fitBox(c,b,asp,rad){if(!b)return c;asp=asp>0?asp:1.5;var d=sub3(b.max,b.min),t=Math.tan(FOV/2),need=0;
  c.ctr=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2];c.rad=Math.max(5,Math.sqrt(dot3(d,d))/2,rad||0);var B=camBasis(c);
  for(var k=0;k<8;k++){var p=sub3([k&1?b.max[0]:b.min[0],k&2?b.max[1]:b.min[1],k&4?b.max[2]:b.min[2]],c.ctr),x=Math.abs(dot3(p,B.r)),y=Math.abs(dot3(p,B.u)),z=dot3(p,B.f);
   need=Math.max(need,c.ortho?Math.max(y,x/asp)*1.08/t:Math.max(x/(t*asp),y/t)*1.08-z)}
  c.base=Math.max(1,need);c.step=12;c.dist=c.base;return c}
 // ---------- a picture of one model (wrap.snapshot): the game's own preview camera (pure) ----------
 // the engine's camera frame for an eye, a target and a roll in radians: forward
 // = the unit way to the target; right = world z crossed with it (x when the view looks straight up or down), turned about
 // forward by the roll; up = forward crossed with right. -> {e, f, r, u}
 function engineFrame(o,t,roll){var d=sub3(t,o),l=Math.sqrt(dot3(d,d)),f=l>1e-6?scl3(d,1/l):[0,0,1],s=Math.sin(roll||0),c=Math.cos(roll||0),k=1-c;
  var ta=[f[0]*f[0]*k+c,f[0]*f[1]*k+f[2]*s,f[0]*f[2]*k-f[1]*s],tb=[f[0]*f[1]*k-f[2]*s,f[1]*f[1]*k+c,f[1]*f[2]*k+f[0]*s],tc=[f[0]*f[2]*k+f[1]*s,f[1]*f[2]*k-f[0]*s,f[2]*f[2]*k+c];
  var r=Math.abs(Math.abs(f[2])-1)<=1e-7?[1,0,0]:nrm3(crs3([0,0,1],f));r=[dot3(r,ta),dot3(r,tb),dot3(r,tc)];return {e:o.slice(),f:f,r:r,u:nrm3(crs3(f,r))}}
 // the camera of a picture of the box b = {min, max}, width / height = asp. cam = a preview camera of the model's .mdl
 // {origin, lookat, horizon (degrees), fov (degrees, across the width: the engine's projection scales the width by 1/tan(fov/2)
 // and the height by that times width/height)} or null. With a camera the picture is the game's
 // own (how 'preview'); when that camera would cut the model off or leave it tiny (or its fov is not an angle between 5 and 120),
 // its angle is kept and the eye is moved back or forth until the model fills the picture ('preview-fit'). Without one: the angle
 // of the engine's stand-in preview, fitted ('fit'). -> {PV, B:{e,f,r,u}, how}
 var SHOT0={origin:[156.41,118.91,77.31],lookat:[25.68,-36.04,2.61],horizon:0,fov:55.54};
 function shotCam(cam,b,asp){asp=asp>0?asp:1;var ok=!!(cam&&cam.origin&&cam.lookat),c0=ok?cam:SHOT0,how=ok?'preview':'fit',B=engineFrame(c0.origin,c0.lookat,(Number(c0.horizon)||0)*Math.PI/180);
  var fd=Number(c0.fov),good=fd>=5&&fd<=120,th=Math.tan((good?fd:45)*Math.PI/360),tv=th/asp;
  b=b||{min:[-1,-1,-1],max:[1,1,1]};var ctr=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2],dd=sub3(b.max,b.min),rad=Math.max(1e-3,Math.sqrt(dot3(dd,dd))/2);
  function corner(k){return [k&1?b.max[0]:b.min[0],k&2?b.max[1]:b.min[1],k&4?b.max[2]:b.min[2]]}
  var e=B.e,m=Infinity,k,p,z;
  if(ok&&good){m=0;for(k=0;k<8;k++){p=sub3(corner(k),e);z=dot3(p,B.f);if(z<=1e-3){m=Infinity;break}m=Math.max(m,Math.abs(dot3(p,B.r))/(z*th),Math.abs(dot3(p,B.u))/(z*tv))}}
  if(!(m>=0.3&&m<=1.02)){if(ok)how='preview-fit';var need=0;for(k=0;k<8;k++){p=sub3(corner(k),ctr);need=Math.max(need,Math.max(Math.abs(dot3(p,B.r))/th,Math.abs(dot3(p,B.u))/tv)*1.08-dot3(p,B.f))}
   e=sub3(ctr,scl3(B.f,Math.max(need,rad*0.01)))}
  var dist=Math.max(1e-3,dot3(sub3(ctr,e),B.f)),P=persp(2*Math.atan(tv),asp,Math.max(dist-rad*3,dist*0.01,0.01),dist+rad*4);
  return {PV:mul4(P,view(e,B.r,B.u,scl3(B.f,-1))),B:{e:e,f:B.f,r:B.r,u:B.u},how:how}}
 // the camera of a picture taken from a set angle (snapshot view, the unit card renders): v = {az, el (degrees: from the nose +X toward
 // the left +Y, above the ground), roll (degrees), mirror (screen x flipped), fov (degrees across the height; 0 or ortho: true = flat), margin (part of the picture
 // left free on each side, default 0.03), part {from, to} (0..1 of the subject's height: only that band is fitted, e.g. a head)}. P =
 // world points of the subject [x, y, z, x, y, z, ...] (the mesh vertices: fit 'silhouette'; or the 8 corners of the bounds). The frame
 // is fitted to the projected points (an off-centre frustum), so the subject fills the picture whatever the fov. -> {PV, B, ortho, how:
 // 'view', box: [x0, y0, x1, y1] of the fitted points in 0..1 of the picture (y down), eye distance / subject radius (persp)} | null
 function viewCam(v,P,asp){v=v||{};asp=asp>0?asp:1;var n=P?Math.floor(P.length/3):0;if(!n)return null;
  var D2R=PI/180,a=(Number(v.az)||0)*D2R,e=Math.max(-89.9,Math.min(89.9,Number(v.el)||0))*D2R,ro=(Number(v.roll)||0)*D2R,fd=Number(v.fov)||0,flat=!!v.ortho||!(fd>0.5&&fd<150);
  var back=[Math.cos(e)*Math.cos(a),Math.cos(e)*Math.sin(a),Math.sin(e)],f=scl3(back,-1),r=[-Math.sin(a),Math.cos(a),0],u=crs3(r,f);
  if(ro){var cr=Math.cos(ro),sr=Math.sin(ro),r2=add3(scl3(r,cr),scl3(u,sr));u=add3(scl3(u,cr),scl3(r,-sr));r=r2}
  if(v.mirror)r=scl3(r,-1);   // the engine's own pictures are left-handed (engineFrame: right = up x forward): mirror: true draws as it does
  var mg=Number(v.margin);mg=mg>=0&&mg<0.45?mg:0.03;
  var zlo=Infinity,zhi=-Infinity,i,k;for(i=0;i<n;i++){zlo=Math.min(zlo,P[i*3+2]);zhi=Math.max(zhi,P[i*3+2])}
  var pf=v.part&&typeof v.part==='object'?v.part:null,z0=pf?zlo+(zhi-zlo)*(Number(pf.from)||0):-Infinity,z1=pf?zlo+(zhi-zlo)*(pf.to==null?1:Number(pf.to)):Infinity;
  function inPart(i){var z=P[i*3+2];return z>=z0-1e-6&&z<=z1+1e-6}
  var mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity],m=0;
  for(i=0;i<n;i++){if(!inPart(i))continue;m++;for(k=0;k<3;k++){mn[k]=Math.min(mn[k],P[i*3+k]);mx[k]=Math.max(mx[k],P[i*3+k])}}
  if(!m)return null;
  var c=[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2],R=1e-3,Ra=1e-3,p,q;
  for(i=0;i<n;i++){p=[P[i*3]-c[0],P[i*3+1]-c[1],P[i*3+2]-c[2]];q=Math.sqrt(dot3(p,p));Ra=Math.max(Ra,q);if(inPart(i))R=Math.max(R,q)}
  var th=flat?0:Math.tan(fd*D2R/2),dist=flat?Ra*4+1:R/Math.sin(fd*D2R/2),eye=add3(c,scl3(back,dist));
  var x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,dn=Infinity,df=-Infinity,x,y,z;
  for(i=0;i<n;i++){p=[P[i*3]-eye[0],P[i*3+1]-eye[1],P[i*3+2]-eye[2]];z=dot3(p,f);dn=Math.min(dn,z);df=Math.max(df,z);if(!inPart(i))continue;
   x=dot3(p,r);y=dot3(p,u);if(!flat){if(z<=1e-6)continue;x/=z;y/=z}x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
  if(!(x1>x0))x1=x0+1e-6;if(!(y1>y0))y1=y0+1e-6;
  var cx=(x0+x1)/2,cy=(y0+y1)/2,hw=(x1-x0)/2/(1-2*mg),hh=(y1-y0)/2/(1-2*mg);if(hw/hh<asp)hw=hh*asp;else hh=hw/asp;
  var L0=cx-hw,R0=cx+hw,B0=cy-hh,T0=cy+hh,near=Math.max(dn-Ra*0.05,flat?0.01:dist*0.01),far=Math.max(df+Ra*0.05,near+1),PM;
  if(flat)PM=[2/(R0-L0),0,0,0,0,2/(T0-B0),0,0,0,0,-2/(far-near),0,-(R0+L0)/(R0-L0),-(T0+B0)/(T0-B0),-(far+near)/(far-near),1];
  else PM=[2/(R0-L0),0,0,0,0,2/(T0-B0),0,0,(R0+L0)/(R0-L0),(T0+B0)/(T0-B0),(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
  var box=[(x0-L0)/(R0-L0),(T0-y1)/(T0-B0),(x1-L0)/(R0-L0),(T0-y0)/(T0-B0)];
  return {PV:mul4(PM,view(eye,r,u,back)),B:{e:eye,f:f,r:r,u:u},ortho:flat,how:'view',box:box,dist:flat?0:dist/R,th:th}}
 // the world direction of a picture's light: from (az, el) degrees, az counted from the view's own az (0 = from the eye, -40 = from the
 // eye's left), el above the ground. -> unit vector toward the light
 function viewLight(v,l){var D2R=PI/180,a=((Number(v&&v.az)||0)+(Number(l&&l.az)||0))*D2R,e=(l&&l.el!=null?Number(l.el):45)*D2R;
  return [Math.cos(e)*Math.cos(a),Math.cos(e)*Math.sin(a),Math.sin(e)]}
 // the default light of a picture taken from a view: soft, from above and in front, a dark underside (ambient, diffuse, sky = how much
 // a face turned up is lighter than one turned down)
 var LIGHT0={az:-35,el:50,amb:0.5,dif:0.62,sky:0.16};
 // the default angle on a scene: models face +X, so the eye is in front (+X) and a little to the side and above. A long row
 // across (along Y) is seen more from the front, a column (along X) more from the side
 function rowView(b){var dx=b?b.max[0]-b.min[0]:0,dy=b?b.max[1]-b.min[1]:0;return dy>dx*2.5?{yaw:0.4,pitch:0.3}:dx>dy*2.5?{yaw:1.0,pitch:0.3}:{yaw:0.7,pitch:0.4}}
 // meshes [{world, figure, boxes: [{min, max} local]}] -> { figs: {figure number: {min, max}}, all: {min, max} | null } in world space
 function figBoxes(meshes){var F={},all=null;
  function grow(b,p){if(!b)return {min:p.slice(),max:p.slice()};for(var i=0;i<3;i++){if(p[i]<b.min[i])b.min[i]=p[i];if(p[i]>b.max[i])b.max[i]=p[i]}return b}
  (meshes||[]).forEach(function(m){if(!m||!m.world)return;(m.boxes||[]).forEach(function(x){if(!x)return;
   for(var k=0;k<8;k++){var p=tp(m.world,[k&1?x.max[0]:x.min[0],k&2?x.max[1]:x.min[1],k&4?x.max[2]:x.min[2]]);all=grow(all,p);if(typeof m.figure==='number')F[m.figure]=grow(F[m.figure],p)}})});
  return {figs:F,all:all}}
 // the figure whose box a world ray meets first -> its number | -1
 function pickFigure(figs,o,d){var best=-1,bt=Infinity;for(var k in figs||{}){var b=figs[k];if(!b)continue;
  var c=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2],h=rayBox(sub3(o,c),d,[b.max[0]-b.min[0]+1e-3,b.max[1]-b.min[1]+1e-3,b.max[2]-b.min[2]+1e-3]);
  if(h&&h.t<bt){bt=h.t;best=Number(k)}}return best}
 // the folder part of a mesh file name, for the texture key of a scene (a name is looked up from the folder of its mesh)
 function fdir(f){f=String(f||'').split('\\').join('/').toLowerCase();var i=f.lastIndexOf('/');return i<0?'':f.slice(0,i+1)}
 var TEXQ=4;
 function zoom(c,dy,mod){if(c.ortho){c.step=Math.max(0,Math.min(ZSTEPS-1,c.step+(dy>0?-1:dy<0?1:0)));c.dist=stepDist(c);return c}
  var k=mod==='ctrl'?10:mod==='shift'?1/3:1;c.dist=Math.max(c.rad*0.02,Math.min(c.rad*80,c.dist*Math.exp(dy*0.001*k)));return c}
 function orbit(c,dx,dy){c.yaw-=dx*0.01;c.pitch=Math.max(-HALF,Math.min(HALF,c.pitch+dy*0.01));if(!c.ortho)c.view='persp';return c}
 function rollPitch(c,dx,dy){c.roll+=dx*0.01;c.pitch=Math.max(-HALF,Math.min(HALF,c.pitch+dy*0.01));if(!c.ortho)c.view='persp';return c}
 function pan(c,dx,dy,hpx){var B=camBasis(c),k=2*halfH(c)/Math.max(1,hpx);c.ctr=add3(c.ctr,add3(scl3(B.r,-dx*k),scl3(B.u,dy*k)));return c}
 function dolly(c,dy){if(c.ortho)return zoom(c,dy*10);c.dist=Math.max(c.rad*0.02,Math.min(c.rad*80,c.dist*Math.exp(dy*0.01)));return c}
 // fly: turn about the eye (the eye stays), move the eye
 function flyLook(c,dx,dy){var e=camBasis(c).e;c.yaw-=dx*0.005;c.pitch=Math.max(-HALF+0.01,Math.min(HALF-0.01,c.pitch-dy*0.005));c.view='persp';
  var cp=Math.cos(c.pitch);c.ctr=sub3(e,scl3([cp*Math.cos(c.yaw),cp*Math.sin(c.yaw),Math.sin(c.pitch)],c.dist));return c}
 function flyMove(c,k,dist){var B=camBasis(c),v=[0,0,0];if(k.w)v=add3(v,B.f);if(k.s)v=sub3(v,B.f);if(k.d)v=add3(v,B.r);if(k.a)v=sub3(v,B.r);if(k.e)v=add3(v,[0,0,1]);if(k.q)v=sub3(v,[0,0,1]);
  if(!dot3(v,v))return c;c.ctr=add3(c.ctr,scl3(nrm3(v),dist));return c}
 // layout: { quad, active, order: [pane at top left, top right, bottom left, bottom right], panes: [cam] }
 function newLayout(){return {quad:false,active:0,order:[1,2,3,0],panes:[newCam('persp',false),newCam('top',true),newCam('front',true),newCam('left',true)]}}
 function paneRects(L,w,h){if(!L.quad)return [{i:L.active,x:0,y:0,w:w,h:h}];var hw=Math.floor(w/2),hh=Math.floor(h/2);
  return L.order.map(function(pi,k){return {i:pi,x:k%2?hw:0,y:k<2?0:hh,w:k%2?w-hw:hw,h:k<2?hh:h-hh}})}
 function paneAt(L,w,h,x,y){var R=paneRects(L,w,h);for(var k=0;k<R.length;k++){var r=R[k];if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)return r}return R[0]}
 function nextPane(L,dir){var k=L.order.indexOf(L.active);L.active=L.order[(k+(dir<0?3:1))%4];return L}
 function toggleQuad(L){L.quad=!L.quad;return L}
 function maximise(L,i){L.active=i;L.quad=false;return L}
 // which lib file kinds a document change touches -> what to fetch again
 function refreshPlan(changed){var p={meshes:false,pose:false,tex:false,obst:false};
  (changed||[]).forEach(function(r){var e=String(r||'').toLowerCase();
   if(/\.ply$/.test(e)){p.meshes=true;p.pose=true;p.tex=true}else if(/\.(mdl|vol|anm)$/.test(e)){p.pose=true;if(/\.mdl$/.test(e))p.obst=true}else if(/\.(mtl|dds|tga)$/.test(e))p.tex=true});return p}
 function meshSig(sc){return ((sc&&sc.meshes)||[]).map(function(m){return m.bone+':'+m.file}).join('|')}
 // world matrices with a preview (gizmo drag): {kind:'bone'|'volume', id, world} moves the object and, for a bone, all below it
 function previewWorlds(sc,pv){var B=(sc.bones||[]).map(function(b){return b.world}),M=(sc.meshes||[]).map(function(m){return m.world}),V=(sc.volumes||[]).map(function(v){return v.world});
  if(!pv||!pv.world)return {bones:B,meshes:M,vols:V};
  if(pv.kind==='volume'){(sc.volumes||[]).forEach(function(v,i){if(v.id===pv.id)V[i]=pv.world});return {bones:B,meshes:M,vols:V}}
  var bi=-1;(sc.bones||[]).forEach(function(b,i){if(b.path===pv.id&&bi<0)bi=i});if(bi<0||!B[bi])return {bones:B,meshes:M,vols:V};
  var inv=inv12(B[bi]);if(!inv)return {bones:B,meshes:M,vols:V};var D=mul12(inv,pv.world),under={};under[bi]=true;
  (sc.bones||[]).forEach(function(b,i){if(b.parent>=0&&under[b.parent])under[i]=true});
  B=B.map(function(w,i){return under[i]&&w?mul12(w,D):w});
  M=M.map(function(w,i){var m=sc.meshes[i];return under[m.bone]&&w?mul12(w,D):w});
  V=V.map(function(w,i){var v=sc.volumes[i];return under[v.bone]&&w?mul12(w,D):w});
  return {bones:B,meshes:M,vols:V}}
 // obstacle / area outline in model space (z = 0): [[x, y], ...] closed
 function outline2(o){if(!o)return [];var c=o.center||[0,0];
  if(/obb/i.test(o.kind||'')){var e=o.extent||[0,0],a=nrm3([(o.axis||[1,0])[0],(o.axis||[1,0])[1],0]),p=[-a[1],a[0]];
   return [[1,1],[-1,1],[-1,-1],[1,-1]].map(function(s){return [c[0]+a[0]*e[0]*s[0]+p[0]*e[1]*s[1],c[1]+a[1]*e[0]*s[0]+p[1]*e[1]*s[1]]})}
  if(/circle/i.test(o.kind||'')){var r=Number(o.radius)||0,out=[];for(var i=0;i<32;i++){var t=i/32*PI*2;out.push([c[0]+Math.cos(t)*r,c[1]+Math.sin(t)*r])}return out}
  return (o.vertices||[]).filter(function(v){return v&&v.length>=2}).map(function(v){return [Number(v[0]),Number(v[1])]})}
 // where a click ray (o start, d into the scene) meets the ground plane z = 0 -> [x, y, 0] | null: only a ray going down, in front
 // of its start, and only near the model: within max(4 x the bounding radius of b = {min, max}, GROUNDMIN units) of the middle of b
 var GROUNDMIN=400;
 function groundAt(o,d,b){if(!o||!d||!(d[2]<-1e-9))return null;var t=-o[2]/d[2];if(!(t>0)||!isFinite(t))return null;
  var p=[o[0]+d[0]*t,o[1]+d[1]*t,0],c=[0,0],R=0;if(!isFinite(p[0])||!isFinite(p[1]))return null;
  if(b&&b.min&&b.max){c=[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2];var s=sub3(b.max,b.min);R=Math.sqrt(dot3(s,s))/2;if(!isFinite(R))R=0}
  var lim=Math.max(4*R,GROUNDMIN),dx=p[0]-c[0],dy=p[1]-c[1];return dx*dx+dy*dy<=lim*lim?p:null}
 // grid plane of a pane: the two world axes it spans
 function gridAxes(c){if(c.ortho&&(c.view==='front'||c.view==='back'))return [1,2];if(c.ortho&&(c.view==='left'||c.view==='right'))return [0,2];return [0,1]}
 // colours read from the page tokens: hex (3 or 6 digits) or the browser's functional form with r, g, b -> [r, g, b] 0..1 | null
 function parseCol(s){s=String(s||'').trim();var m=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if(m){var x=m[1];if(x.length===3)x=x[0]+x[0]+x[1]+x[1]+x[2]+x[2];var n=parseInt(x,16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]}
  var o=s.indexOf('('),e=s.lastIndexOf(')');
  if(o>0&&e>o&&/^rgba?$/i.test(s.slice(0,o))){var p=s.slice(o+1,e).split(/[\s,\/]+/).filter(Boolean).map(parseFloat);if(p.length>=3&&p.slice(0,3).every(function(v){return !isNaN(v)}))return [p[0]/255,p[1]/255,p[2]/255]}
  return null}
 function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]}
 function lum(c){return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]}
 // a palette colour (from the tokens) as canvas paint: hex with alpha
 function css(c,a){return '#'+[c[0],c[1],c[2],a==null?1:a].map(function(v){var x=Math.max(0,Math.min(255,Math.round(v*255)));return (x<16?'0':'')+x.toString(16)}).join('')}
 // bg is the card colour (the 3D view sits on a card, and follows the light and dark theme)
 // sP sD sH: volumes the shot pierced, damaged, held (the Armor result tokens); sJ jet, sF fire, sB blast of showShot
 var TOKENS={bg:'--card',fg:'--fg',line:'--line',acc:'--acc',hint:'--hint',x:'--err',y:'--ok',z:'--link',vol:'--whol',card:'--card',sP:'--cthru',sD:'--cbounce',sH:'--cstop',sJ:'--cline',sF:'--err',sB:'--s5'};
 var GREY=[0.5,0.5,0.5];
 function palette(read){var P={};for(var k in TOKENS)P[k]=parseCol(read(TOKENS[k]))||GREY;
  P.dark=lum(P.bg)<0.5;P.grid=mix(P.bg,P.fg,0.12);P.grid5=mix(P.bg,P.fg,0.28);P.mesh=mix(P.bg,P.fg,P.dark?0.62:0.5);
  P.vol=mix(P.vol,P.fg,P.dark?0.15:0.35);P.sides=[P.x,P.acc,P.y,P.vol,P.z,P.hint];P.bone=mix(P.fg,P.x,0.35);P.ent=mix(P.fg,P.z,0.4);return P}
 // muted colour from a name (hue from a string hash), mixed into the theme's mesh grey
 function hue(s,sat){var h=0;s=String(s||'');for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;var hu=((h>>>0)%360)/60,c=sat,x=c*(1-Math.abs(hu%2-1)),k=Math.floor(hu);
  var r=k===0?[c,x,0]:k===1?[x,c,0]:k===2?[0,c,x]:k===3?[0,x,c]:k===4?[x,0,c]:[c,0,x];var m=0.5-c/2;return [r[0]+m,r[1]+m,r[2]+m]}
 function tint(s,P){return mix((P||{}).mesh||GREY,hue(s,0.5),0.35).concat(1)}
 function hex(c,a){var x=parseCol(c);return x?x.concat(a==null?1:a):null}

 // ---------- the result of a shot over the model (showShot; armorsim effects, tools/armorsim/effects.js) ----------
 // volume names in a result are the view's ids or short names (the last part of the id, or the volume's name)
 var SHOTK={held:1,damaged:2,pierced:3},SHOTPAL={pierced:'sP',damaged:'sD',held:'sH'},SHOTU=20;
 function sid(id){id=String(id||'');var i=id.lastIndexOf('/');return i<0?id:id.slice(i+1)}
 function shotIds(name,vols){name=String(name==null?'':name);if(!name)return [];vols=vols||[];
  if(vols.some(function(v){return v&&v.id===name}))return [name];
  var m=vols.filter(function(v){return v&&(v.name===name||sid(v.id)===name)}).map(function(v){return v.id});return m.length?m:[name]}
 function nOr(x,d){if(x==null||x==='')return d;x=Number(x);return isFinite(x)?x:d}
 function pt3(a){if(!Array.isArray(a)||a.length<3)return null;var p=[Number(a[0]),Number(a[1]),Number(a[2])];return p.every(isFinite)?p:null}
 // result -> { vols: {id: pierced|damaged|held} (the worst over plates, engine events, blast and jet hits with a chance above 0),
 //   jets: [{from, to}] (start point along its direction for its distance in metres), fires: [{volume} | {point}], blasts: [{point, r}]
 //   (r = outer radius, model units), missing: [result fields a drawing needed and did not find] }
 // A jet without its own point and direction starts at the shell's burst point (engine.end.burst, else end.point) along the shot
 // (ray.dir): the jet flies on from where the shell burst (tools/armorsim/after.js, RULES 44).
 function shotPlan(j,vols){var P={vols:{},jets:[],fires:[],blasts:[],missing:[]};if(!j||typeof j!=='object')return P;vols=vols||[];var E=j.engine||{};
  function put(name,k){shotIds(name,vols).forEach(function(id){if(!P.vols[id]||SHOTK[k]>SHOTK[P.vols[id]])P.vols[id]=k})}
  function miss(f){if(P.missing.indexOf(f)<0)P.missing.push(f)}
  var pl=Array.isArray(E.plates)?E.plates:Array.isArray(j.plates)?j.plates:[];
  pl.forEach(function(p){if(!p||!p.volume)return;var r=String(p.result||'').toLowerCase().replace(/ /g,'_');if(!r||r==='no_armor'||r==='no_hit'||r==='o'||r==='x')return;
   put(p.volume,r==='penetrate'||r==='p'?'pierced':'held')});
  (Array.isArray(E.events)?E.events:[]).forEach(function(e){if(!e||!e.volume)return;var n=String(e.event||'');if(n==='pierce')put(e.volume,'pierced');else if(/^break_armor/.test(n))put(e.volume,'damaged')});
  (Array.isArray(j.blasts)?j.blasts:[]).forEach(function(b){if(!b)return;
   (b.hits||[]).forEach(function(h){if(h&&h.volume&&SHOTK[h.result]&&nOr(h.chanceIfBlast,nOr(h.chance,1))>0)put(h.volume,h.result)});
   var p=pt3(b.point),R=b.radius,r=R&&typeof R==='object'?nOr(R.outer,nOr(R.inner,null)):nOr(R,null);
   if(r==null&&b.radiusM&&typeof b.radiusM==='object'){var rm=nOr(b.radiusM.outer,nOr(b.radiusM.inner,null));if(rm!=null)r=rm*SHOTU}
   if(p&&r>0)P.blasts.push({point:p,r:r});else{if(!p)miss('blasts[].point');if(!(r>0))miss('blasts[].radius')}});
  var burst=E.end?pt3(E.end.burst)||pt3(E.end.point):null,rd=j.ray?pt3(j.ray.dir):null;
  (Array.isArray(j.jets)?j.jets:[]).forEach(function(x){if(!x)return;
   (x.hits||[]).forEach(function(h){if(!h||!h.volume||!(nOr(h.chanceIfJet,nOr(h.chance,1))>0))return;var ev=Array.isArray(h.events)?h.events.map(String):[];
    put(h.volume,ev.indexOf('pierce')>=0?'pierced':ev.some(function(e){return /^break_armor/.test(e)})?'damaged':'held')});
   var s=pt3(x.point)||pt3(x.start)||burst,d=pt3(x.dir)||rd,m=nOr(x.distanceM,nOr(x.distance,null)),l=d?Math.sqrt(dot3(d,d)):0;
   if(s&&l>0&&m>0)P.jets.push({from:s,to:add3(s,scl3(d,m*SHOTU/l))});else{if(!s)miss('jets[].point');if(!(l>0))miss('jets[].dir');if(!(m>0))miss('jets[].distance')}});
  // a fire with its own point (fires[].point) is one marker there; without one (absent or null) a marker at each of its volumes
  (Array.isArray(j.fires)?j.fires:[]).forEach(function(f){if(!f||!(nOr(f.chance,1)>0))return;var p=pt3(f.point);if(p){P.fires.push({point:p});return}
   if(Array.isArray(f.volumes))f.volumes.forEach(function(v){if(v&&v.volume&&nOr(v.chance,1)>0)shotIds(v.volume,vols).forEach(function(id){P.fires.push({volume:id})})});
   else miss('fires[].volumes')});
  return P}
 // labels of the shot overlay (show.shotLabels): what each blast, jet and fire is in plain words and its quantities -> groups
 // [{point | null, volume | null, lines: [{k: 'blast'|'jet'|'fire', t}]}]; only for what shotPlan draws. Things at the same place
 // (within half a unit: two blasts at one point, a jet that starts at the burst) share one group, one line each.
 // radius 1 decimal in metres (20 units per metre), energy and damage whole, chance in percent only below 100.
 // say = tx (key, slots); a fire without its own point is labelled at its first volume with a chance.
 function r1v(x){return Math.round(x*10)/10}
 function pcv(c){var p=Math.round(c*100);return p===0&&c>0?'<1':p===100&&c<1?'>99':String(p)}
 function shotLabels(j,vols,say){var out=[],at={};if(!j||typeof j!=='object')return out;vols=vols||[];var E=j.engine||{};
  function put(p,vol,k,t){var key=p?'p:'+p.map(function(v){return Math.round(v*2)/2}).join(','):'v:'+vol,g=at[key];
   if(!g){g=at[key]={point:p||null,volume:p?null:vol,lines:[]};out.push(g)}g.lines.push({k:k,t:t})}
  function line(title,q){q=q.filter(Boolean);return q.length?title+': '+q.join(', '):title}
  function ch(c){c=nOr(c,1);return c<1?say('models.viewer.shot.q.chance',{n:pcv(c)}):''}
  (Array.isArray(j.blasts)?j.blasts:[]).forEach(function(b){if(!b)return;
   var p=pt3(b.point),R=b.radius,r=R&&typeof R==='object'?nOr(R.outer,nOr(R.inner,null)):nOr(R,null),rm=null;
   if(b.radiusM&&typeof b.radiusM==='object')rm=nOr(b.radiusM.outer,nOr(b.radiusM.inner,null));
   if(r==null&&rm!=null)r=rm*SHOTU;if(!p||!(r>0))return;if(rm==null)rm=r/SHOTU;
   var by=b.by&&typeof b.by==='object'?b.by.event:typeof b.by==='string'?b.by:'';
   var title=b.source==='shell'?say('models.viewer.shot.l.shell'):b.source==='script'?(by?say('models.viewer.shot.l.script',{e:by}):say('models.viewer.shot.l.scriptAny')):say('models.viewer.shot.l.blast');
   var parts={};(b.hits||[]).forEach(function(h){if(h&&(h.part||h.volume)&&nOr(h.chanceIfBlast,nOr(h.chance,1))>0)parts[h.part||h.volume]=1});var e=nOr(b.energy,null);
   put(p,null,'blast',line(title,[say('models.viewer.shot.q.radius',{n:r1v(rm)}),e==null?'':say('models.viewer.shot.q.energy',{n:Math.round(e)}),ch(b.chance),say('models.viewer.shot.q.parts',{n:Object.keys(parts).length})]))});
  var burst=E.end?pt3(E.end.burst)||pt3(E.end.point):null,rd=j.ray?pt3(j.ray.dir):null;
  (Array.isArray(j.jets)?j.jets:[]).forEach(function(x){if(!x)return;var s=pt3(x.point)||pt3(x.start)||burst,d=pt3(x.dir)||rd,m=nOr(x.distanceM,nOr(x.distance,null));
   if(!s||!d||!(dot3(d,d)>0)||!(m>0))return;var dm=nOr(x.damage,null);
   put(s,null,'jet',line(say('models.viewer.shot.l.jet'),[dm==null?'':say('models.viewer.shot.q.damage',{n:Math.round(dm)}),say('models.viewer.shot.q.reach',{n:r1v(m)}),ch(x.chance)]))});
  (Array.isArray(j.fires)?j.fires:[]).forEach(function(f){if(!f||!(nOr(f.chance,1)>0))return;var p=pt3(f.point),vol=null;
   if(!p&&Array.isArray(f.volumes))f.volumes.some(function(v){if(v&&v.volume&&nOr(v.chance,1)>0){vol=shotIds(v.volume,vols)[0];return true}return false});
   if(!p&&vol==null)return;var fr=nOr(f.radius,null),fh=nOr(f.heating,null),ft=nOr(f.time,null);
   put(p,vol,'fire',line(say('models.viewer.shot.l.fire'),[fr==null?'':say('models.viewer.shot.q.radius',{n:r1v(fr)}),fh==null?'':say('models.viewer.shot.q.heating',{n:r1v(fh)}),
    ft==null?'':say('models.viewer.shot.q.time',{n:r1v(ft)}),ch(f.chance)]))});
  return out}
 // label boxes on the screen: each one moved down past the boxes already placed that it would cover -> [{x, y}]
 function placeTags(B,pad){var taken=[];return B.map(function(b){var x=b.x,y=b.y;
  for(var k=0;k<60;k++){var hit=taken.filter(function(t){return x<t.x+t.w&&x+b.w>t.x&&y<t.y+t.h&&y+b.h>t.y})[0];if(!hit)break;y=hit.y+hit.h+(pad||0)}
  taken.push({x:x,y:y,w:b.w,h:b.h});return {x:x,y:y}})}
 // a wire sphere: three great circles of 32 segments -> [[a, b], ...]
 function ringSegs(c,r){var o=[],N=32;function q(k,t){var a=Math.cos(t)*r,b=Math.sin(t)*r;return k===0?[c[0]+a,c[1]+b,c[2]]:k===1?[c[0]+a,c[1],c[2]+b]:[c[0],c[1]+a,c[2]+b]}
  for(var k=0;k<3;k++)for(var i=0;i<N;i++)o.push([q(k,i/N*PI*2),q(k,(i+1)/N*PI*2)]);return o}

 // ---------- volume geometry in local space: triangles with a face number per vertex, and edges ----------
 function geoBox(s){var hx=s[0]/2,hy=s[1]/2,hz=s[2]/2,P=[],F=[],E=[];function p(a,b,c){return [a*hx,b*hy,c*hz]}
  function quad(a,b,c,d,f){[a,b,c,a,c,d].forEach(function(q){P.push(q[0],q[1],q[2]);F.push(f)})}
  quad(p(1,-1,-1),p(1,1,-1),p(1,1,1),p(1,-1,1),0);quad(p(-1,-1,1),p(1,-1,1),p(1,1,1),p(-1,1,1),1);
  quad(p(-1,1,-1),p(-1,1,1),p(1,1,1),p(1,1,-1),2);quad(p(-1,-1,-1),p(1,-1,-1),p(1,-1,1),p(-1,-1,1),3);
  quad(p(-1,-1,-1),p(-1,-1,1),p(-1,1,1),p(-1,1,-1),4);quad(p(-1,-1,-1),p(-1,1,-1),p(1,1,-1),p(1,-1,-1),5);
  var C=[];for(var i=0;i<8;i++)C.push(p(i&1?1:-1,i&2?1:-1,i&4?1:-1));
  for(var a=0;a<8;a++)for(var b=a+1;b<8;b++){var x=a^b;if(x===1||x===2||x===4)E.push(C[a][0],C[a][1],C[a][2],C[b][0],C[b][1],C[b][2])}
  return {P:P,F:F,E:E}}
 function geoCyl(r,len){var N=20,hh=len/2,P=[],F=[],E=[],k;function q(i,z){var a=i/N*PI*2;return [Math.cos(a)*r,Math.sin(a)*r,z]}
  // sides as the engine names them for a cylinder: the cap at +Z top, -Z bottom; the wall by the facing of its normal
  function wallSide(i){var a=(i+0.5)/N*PI*2,x=Math.cos(a),y=Math.sin(a);return Math.abs(x)>=Math.abs(y)?(x>0?0:4):(y>0?2:3)}
  function tri(a,b,c,f){[a,b,c].forEach(function(x){P.push(x[0],x[1],x[2]);F.push(f)})}
  for(k=0;k<N;k++){var a0=q(k,-hh),a1=q(k+1,-hh),b0=q(k,hh),b1=q(k+1,hh),ws=wallSide(k);tri(a0,a1,b1,ws);tri(a0,b1,b0,ws);tri([0,0,-hh],a1,a0,5);tri([0,0,hh],b0,b1,1);
   E.push(a0[0],a0[1],a0[2],a1[0],a1[1],a1[2],b0[0],b0[1],b0[2],b1[0],b1[1],b1[2]);if(k%5===0)E.push(a0[0],a0[1],a0[2],b0[0],b0[1],b0[2])}
  return {P:P,F:F,E:E}}
 function geoSph(r){var LA=10,LO=16,P=[],F=[],E=[],i,j;function q(i,j){var t=i/LA*PI,f=j/LO*PI*2;return [Math.sin(t)*Math.cos(f)*r,Math.sin(t)*Math.sin(f)*r,Math.cos(t)*r]}
  function tri(a,b,c){[a,b,c].forEach(function(x){P.push(x[0],x[1],x[2]);F.push(0)})}
  for(i=0;i<LA;i++)for(j=0;j<LO;j++){var a=q(i,j),b=q(i+1,j),c=q(i+1,j+1),d=q(i,j+1);tri(a,b,c);tri(a,c,d)}
  for(j=0;j<32;j++){var u=j/32*PI*2,w=(j+1)/32*PI*2;
   E.push(Math.cos(u)*r,Math.sin(u)*r,0,Math.cos(w)*r,Math.sin(w)*r,0, Math.cos(u)*r,0,Math.sin(u)*r,Math.cos(w)*r,0,Math.sin(w)*r, 0,Math.cos(u)*r,Math.sin(u)*r,0,Math.cos(w)*r,Math.sin(w)*r)}
  return {P:P,F:F,E:E}}
 function geoPoly(v){var T=triOf(v),P=[],F=[],E=[];if(!T)return {P:P,F:F,E:E};
  for(var i=0;i+8<T.length;i+=9){var f=Math.max(0,((v.sides||[])[i/9]||1)-1);for(var k=0;k<9;k++)P.push(T[i+k]);F.push(f,f,f);
   E.push(T[i],T[i+1],T[i+2],T[i+3],T[i+4],T[i+5],T[i+3],T[i+4],T[i+5],T[i+6],T[i+7],T[i+8],T[i+6],T[i+7],T[i+8],T[i],T[i+1],T[i+2])}
  return {P:P,F:F,E:E}}
 function geoOf(v){if(v.kind==='box'&&v.size)return geoBox(v.size);if(v.kind==='cylinder'&&v.radius>0)return geoCyl(v.radius,v.length||0);
  if(v.kind==='sphere'&&v.radius>0)return geoSph(v.radius);if(v.kind==='polyhedron')return geoPoly(v);return null}
 function flatNormals(P){var N=new Float32Array(P.length);for(var i=0;i+8<P.length;i+=9){var n=nrm3(crs3([P[i+3]-P[i],P[i+4]-P[i+1],P[i+5]-P[i+2]],[P[i+6]-P[i],P[i+7]-P[i+1],P[i+8]-P[i+2]]));
  for(var k=0;k<3;k++){N[i+k*3]=n[0];N[i+k*3+1]=n[1];N[i+k*3+2]=n[2]}}return N}
 // unique edges of a triangle list -> line index list
 function edgesOf(ix){var seen={},out=[];for(var k=0;k+2<ix.length;k+=3)for(var e=0;e<3;e++){var a=ix[k+e],b=ix[k+(e+1)%3],lo=a<b?a:b,hi=a<b?b:a,key=lo*2097152+hi;if(seen[key])continue;seen[key]=1;out.push(lo,hi)}return out}
 function boxLines(min,max){var o=[],C=[];for(var i=0;i<8;i++)C.push([i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]]);
  for(var a=0;a<8;a++)for(var b=a+1;b<8;b++){var x=a^b;if(x===1||x===2||x===4)o.push([C[a],C[b]])}return o}

 var VS=['attribute vec3 aP;attribute vec3 aN;attribute vec4 aC;attribute vec2 aT;uniform mat4 uPV;uniform mat4 uM;uniform float uPS;',
  'varying vec3 vN;varying vec4 vC;varying vec2 vT;varying vec3 vW;',
  'void main(){vN=(uM*vec4(aN,0.0)).xyz;vC=aC;vT=aT;vec4 w=uM*vec4(aP,1.0);vW=w.xyz;gl_PointSize=uPS;gl_Position=uPV*w;}'].join('\n');
 var FS=['precision mediump float;varying vec3 vN;varying vec4 vC;varying vec2 vT;varying vec3 vW;',
  'uniform float uLit;uniform vec3 uL;uniform float uTex;uniform sampler2D uS;uniform float uNrm;uniform vec3 uE;uniform vec3 uF;uniform float uOr;uniform vec3 uBad;uniform vec4 uK;',
  'void main(){vec4 c=vC;if(uTex>0.5){vec4 t=texture2D(uS,vT);if(t.a<0.5)discard;c=vec4(c.rgb*t.rgb,c.a);}',
  ' vec3 n=normalize(vN+vec3(0.0,0.0,1e-6));',
  ' if(uNrm>0.5){vec3 v=uOr>0.5?-uF:normalize(uE-vW);gl_FragColor=dot(n,v)<0.0?vec4(uBad,1.0):vec4(n*0.5+0.5,1.0);return;}',
  ' float k=1.0;if(uLit>0.5){if(uK.w>0.5){vec3 vv=uOr>0.5?-uF:normalize(uE-vW);vec3 nf=dot(n,vv)<0.0?-n:n;k=clamp(uK.x+uK.y*max(dot(nf,uL),0.0)+uK.z*nf.z,0.0,1.6);}else k=0.38+0.62*abs(dot(n,uL));}gl_FragColor=vec4(c.rgb*k,c.a);}'].join('\n');
 var ID12=[1,0,0,0,1,0,0,0,1,0,0,0];
 var MODES=['shaded','textured','solid','wire','solidwire','paint','normals'];
 var SHOWK=['meshes','volumes','bones','names','volNames','entities','obstacles','areas','grid','axes','bounds'];
 var MOREK=['meshWire','volWire','entWire','paintSel','vecSel','vectors','onlySel'];
 var VOLC=['one','each','sides'];
 function defShow(){return {meshes:true,volumes:true,bones:false,names:false,volNames:false,entities:false,obstacles:false,areas:false,grid:true,axes:false,bounds:false,
  meshWire:false,volWire:false,entWire:false,paintSel:false,vecSel:false,vectors:false,onlySel:false,volColor:'one',gridN:20,shot:true,shotLabels:true}}
 function viewingOf(s){return s.meshes&&s.volumes?'hybrid':s.volumes?'collision':'appearance'}
 function setViewing(s,v){s.meshes=v!=='collision';s.volumes=v!=='appearance';return s}
 function gridResize(s,d){s.gridN=Math.max(5,Math.min(50,(s.gridN||20)+d*5));return s}

 function viewer(ctx,opts){
  opts=opts||{};var el=h,set=(ctx&&ctx.set)||{};
  var show=defShow();if(opts.show)for(var k in opts.show)if(k in show)show[k]=opts.show[k];
  var cur={anm:opts.anm||null,frame:opts.frame||0},colors=opts.colors||{},faceColors=opts.faceColors||{},hl=null,selBone=null,lines=[],onPick=opts.onPick||null;
  var follow=opts.pose!==false&&!opts.onPick&&opts.anm==null;
  var height=opts.height||420,L=newLayout(),LOD=0,LODS=1;
  // a ready-made scene of many models: { url, body } (setScene changes it); null = the document or the viewer's own route
  var SCN=opts.scene&&opts.scene.url?{url:String(opts.scene.url),body:opts.scene.body||{}}:null,FIG={figs:{},all:null},FOCUS=null,needFit=false,angSet=false,stubbed=false;
  // opts.variant / setVariant(name): the texture variant the one model of this view is drawn with ('' = its plain textures); a
  // scene's meshes carry their own
  var VARIANT=opts.variant?String(opts.variant).toLowerCase():'';
  function tkOf(m,p){var v=m.variant||null;return p.name?(SCN?(m.target||'')+'\n'+fdir(m.file)+'\n'+p.name:m.file+'\n'+p.name)+(v?'\n#'+v:''):null}
  L.panes.forEach(function(c){c.mode='shaded';c.back=true});
  // blocks (sub/README.md "Blocks"): the view is a container (id opts.blk, default 'view'); each labelled control of its bars is a
  // leaf of its own in a wrapping row, so a long label goes to the next line instead of under the next select; the canvas with its
  // overlay is one leaf
  var V=opts.blk||'view';function bid(x){return V+'.'+x}
  function leaf(id,kids,a){a=a||{};a.blk=bid(id);return el('div',a,kids)}
  function bnm(k){return tx(['models.viewer.blk',k].join('.'))}
  var wrap=el('div',{class:'viewer3d',style:'margin:6px 0',blk:V,box:'col','data-blkname':tx('models.viewer.label')});
  var cv=el('canvas',{style:'display:block;width:100%;height:100%;cursor:grab;touch-action:none','aria-label':tx('models.viewer.label')});
  var ov=el('canvas',{style:'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none'});
  var box=el('div',{tabindex:'0','data-keys':'view',style:'position:relative;width:100%;height:'+height+'px;background:var(--card);border:1px solid var(--line);border-radius:4px;overflow:hidden;outline:none'},[cv,ov]);
  var info=el('div',{class:'hint'}),legend=el('div',{class:'hint'}),note=el('div',{class:'hint'}),readout=el('div',{class:'hint'}),keys=el('div',{class:'hint',text:tx('models.viewer.keys')});
  function lab(t,kids){return el('label',{style:'white-space:nowrap'},[].concat(kids,[' '+t]))}
  var cb={};function chk(key){var i=el('input',{type:'checkbox'});i.checked=!!show[key];i.addEventListener('change',function(){show[key]=!!i.checked;syncBar();dirty()});cb[key]=i;
   return leaf('s.'+key.toLowerCase(),[lab(tx(['models.viewer',key].join('.')),[i])])}
  function btn(key,fn,title){return el('button',{type:'button',text:tx(['models.viewer',key].join('.')),title:title||null,onclick:function(){fn();box.focus&&box.focus()}})}
  function sel(key,vals,get,setf){var s=el('select',{'aria-label':tx(['models.viewer',key].join('.'))});vals.forEach(function(v){var o=el('option',{value:v,text:tx(['models.viewer',key,v].join('.'))});s.appendChild(o)});
   s.addEventListener('change',function(){setf(s.value);syncBar();dirty()});s._get=get;return s}
  function P0(){return L.panes[L.active]}
  var sView=sel('view',VIEWS,function(){return P0().view},function(v){setView(P0(),v);if(SC)frameTo(P0(),SC.bounds||bnds())});
  var sMode=sel('mode',MODES,function(){return P0().mode},function(v){P0().mode=v;wantTex()});
  var sViewing=sel('viewing',['appearance','collision','hybrid'],function(){return viewingOf(show)},function(v){setViewing(show,v)});
  var sVolC=sel('volColor',VOLC,function(){return show.volColor},function(v){show.volColor=v});
  var sLod=el('select',{'aria-label':tx('models.viewer.lod')});sLod.addEventListener('change',function(){LOD=Number(sLod.value)||0;reloadMeshes()});
  var lodLab=leaf('f.lod',[lab(tx('models.viewer.lod'),[sLod])]);lodLab.style.display='none';
  var cOrtho=el('input',{type:'checkbox'});cOrtho.addEventListener('change',function(){setOrtho(P0(),!!cOrtho.checked);syncBar();dirty()});
  var bQuad=btn('quad',function(){toggleQuad(L);syncBar();dirty()});
  var bar=el('div',{class:'row',blk:bid('bar'),box:'row','data-blkname':bnm('bar')},[leaf('quad',[bQuad]),leaf('f.view',[lab(tx('models.viewer.view'),[sView])]),
   leaf('f.ortho',[lab(tx('models.viewer.ortho'),[cOrtho])]),leaf('f.mode',[lab(tx('models.viewer.mode'),[sMode])]),
   leaf('frame',[btn('frameSel',function(){frameSel(P0())}),btn('frameAll',function(){frameTo(P0(),bnds());dirty()}),btn('reset',resetAll)],{class:'row','data-blkname':bnm('frame')})]);
  var bar2=el('div',{class:'row',blk:bid('show'),box:'row','data-blkname':bnm('show')},[leaf('f.viewing',[lab(tx('models.viewer.viewing'),[sViewing])])].concat(SHOWK.map(chk),[lodLab]));
  var gridLab=el('span',{class:'hint'});
  var more=el('details',{blk:bid('more'),box:'col'},[el('summary',{text:tx('models.viewer.more')}),
   el('div',{class:'row',blk:bid('more.show'),box:'row','data-blkname':bnm('moreShow')},MOREK.map(chk).concat([leaf('f.volcolor',[lab(tx('models.viewer.volColor'),[sVolC])])])),
   el('div',{class:'row',blk:bid('more.grid'),box:'row','data-blkname':bnm('grid')},[leaf('grid',[btn('gridSmaller',function(){gridResize(show,-1);syncBar();dirty()}),btn('gridBigger',function(){gridResize(show,1);syncBar();dirty()}),gridLab],{class:'row','data-blkname':bnm('grid')}),
    (function(){var i=el('input',{type:'checkbox'});cb.back=i;i.addEventListener('change',function(){P0().back=!!i.checked;dirty()});return leaf('s.back',[lab(tx('models.viewer.backfaces'),[i])])})()])]);
  wrap.appendChild(bar);wrap.appendChild(bar2);wrap.appendChild(more);
  // the handles' bar (parts.gizmo, a row container <id>.gizmo) goes in before the canvas once the handles are made
  var cvLeaf=leaf('canvas',[box],{'data-blkname':tx('models.viewer.label')});wrap.appendChild(cvLeaf);wrap.appendChild(leaf('readout',[readout],{'data-blkname':bnm('readout')}));
  wrap.appendChild(leaf('info',[info],{'data-blkname':bnm('info')}));wrap.appendChild(leaf('legend',[legend],{'data-blkname':bnm('legend')}));
  // the shot result (showShot): its own leaf with the switch and the colour key, empty while there is no shot
  var shotBox=leaf('shot',[],{class:'row',style:'flex-wrap:wrap;gap:4px 10px;align-items:center','data-blkname':bnm('shot')});wrap.appendChild(shotBox);
  // the switch of the labels on blasts, jets and fires (show.shotLabels): a leaf of its own right after it, empty while there is no shot
  var shotLabBox=leaf('shotlabels',[],{'data-blkname':bnm('shotLabels')});wrap.appendChild(shotLabBox);
  wrap.appendChild(leaf('keys',[keys],{'data-blkname':bnm('keys')}));
  function syncBar(){[sView,sMode,sViewing,sVolC].forEach(function(s){s.value=s._get()});cOrtho.checked=!!P0().ortho;
   for(var k in cb){if(k==='back')cb.back.checked=!!P0().back;else cb[k].checked=!!show[k]}
   bQuad.textContent=tx(L.quad?'models.viewer.one':'models.viewer.quad');gridLab.textContent=tx('models.viewer.gridSize',{n:show.gridN})}
  function setOrtho(c,on){if(!!c.ortho===on)return;var hh=halfH(c);c.ortho=on;if(on){c.base=c.rad*1.15/Math.tan(FOV/2);c.dist=Math.max(1,hh/Math.tan(FOV/2));
   c.step=Math.max(0,Math.min(ZSTEPS-1,Math.round(12-Math.log(c.dist/c.base)/Math.log(1.25))));c.dist=stepDist(c)}}
  var api3={setPose:function(){},setColors:function(){},highlight:function(){},setShow:function(){},addLine:function(){},clearLines:function(){},reload:function(){},
   setScene:function(){return false},focusFigure:function(){return false},
   showShot:function(j){var p=shotPlan(j,[]);return {missing:p.missing,volumes:0,jets:0,fires:0,blasts:0}},clearShot:function(){}};
  function stub(t){stubbed=true;box.style.height='auto';box.style.background='none';cv.style.display='none';legend.textContent='';
   while(box.childNodes.length>2)box.removeChild(box.lastChild);var p=el('div',{class:'hint',style:'padding:8px 0',text:t});box.appendChild(p)}
  // a scene arrived after a sentence was shown in place of the picture (a scene route that failed, then setScene): the picture is back
  function unstub(){if(!stubbed)return;stubbed=false;while(box.childNodes.length>2)box.removeChild(box.lastChild);box.style.height=height+'px';box.style.background='var(--card)';cv.style.display='block'}
  for(var mk in api3)wrap[mk]=api3[mk];
  // slots for another part's blocks (sub/README.md "The 3D view"), also without WebGL: addTool(leaf) puts a tool button leaf in the row
  // right above the canvas, after the handles' mode buttons (<id>.gizmo.modes) when the handles are there, else in a row container
  // <id>.tools made before the canvas; addUnder(block) puts a block right under the canvas, before the readout, help, legend and keys
  var toolRow=null;
  function kidsOf(n){return Array.prototype.slice.call((n&&(n.children||n.childNodes))||[])}
  function putAfter(c,ref,b){var k=kidsOf(c),i=k.indexOf(ref);if(i>=0&&k[i+1]&&typeof c.insertBefore==='function')c.insertBefore(b,k[i+1]);else c.appendChild(b);return b}
  wrap.addTool=function(b){if(!b)return b;var g=G&&G.el;
   if(g&&g.parentNode){var m=kidsOf(g).filter(function(k){return k&&k.getAttribute&&(k.getAttribute('data-blk')||k.getAttribute('blk'))===bid('gizmo.modes')})[0];return m?putAfter(g,m,b):g.appendChild(b)}
   if(!toolRow){toolRow=el('div',{class:'row',blk:bid('tools'),box:'row','data-blkname':bnm('tools')});
    if(cvLeaf.parentNode===wrap&&typeof wrap.insertBefore==='function')wrap.insertBefore(toolRow,cvLeaf);else wrap.appendChild(toolRow)}
   toolRow.appendChild(b);return b};
  wrap.addUnder=function(b){if(!b)return b;if(cvLeaf.parentNode===wrap)return putAfter(wrap,cvLeaf,b);wrap.appendChild(b);return b};

  // ---------- GL ----------
  var gl=null;try{gl=cv.getContext&&(cv.getContext('webgl',{antialias:true,preserveDrawingBuffer:false})||cv.getContext('experimental-webgl'))}catch(e){gl=null}
  if(!gl){stub(tx('models.viewer.noGl'));return wrap}
  var prog=null,U={},A={},u32=null;
  try{u32=gl.getExtension('OES_element_index_uint');
   var sh=function(t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o};
   prog=gl.createProgram();gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));
   gl.bindAttribLocation(prog,0,'aP');gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(prog));
   ['uPV','uM','uLit','uL','uPS','uTex','uS','uNrm','uE','uF','uOr','uBad','uK'].forEach(function(n){U[n]=gl.getUniformLocation(prog,n)});['aP','aN','aC','aT'].forEach(function(n){A[n]=gl.getAttribLocation(prog,n)});
  }catch(e){stub(tx('models.viewer.noGl'));return wrap}
  var live={wrap:wrap,gl:gl,seen:false,ro:null,mo:null,mq:null,off:null};
  LIVE.forEach(function(x){if(x.seen&&!x.wrap.isConnected)release(x)});LIVE=LIVE.filter(function(x){return !x.gone});LIVE.push(live);
  function release(x){x.gone=true;try{if(x.ro)x.ro.disconnect()}catch(e){}try{if(x.mo)x.mo.disconnect()}catch(e){}try{if(x.mq)x.mq()}catch(e){}try{if(typeof x.offT==='function')x.offT()}catch(e){}try{if(typeof x.off==='function')x.off()}catch(e){}
   try{if(typeof x.offW==='function')x.offW()}catch(e){}   // the window listeners of this viewer (drag move and end, resize)
   try{var l=x.gl.getExtension('WEBGL_lose_context');if(l)l.loseContext()}catch(e){}}
  function buf(data,target){var b=gl.createBuffer();gl.bindBuffer(target||gl.ARRAY_BUFFER,b);gl.bufferData(target||gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return b}
  function kill(b){if(b)try{gl.deleteBuffer(b)}catch(e){}}

  // ---------- theme ----------
  var PAL=null;
  // the page's cssv (the current token) when there is one, else the computed style
  function readVar(n){try{if(typeof window.cssv==='function'){var v=window.cssv(n,'');if(v)return v}var cs=window.getComputedStyle&&window.getComputedStyle(document.documentElement);return cs?cs.getPropertyValue(n):''}catch(e){return ''}}
  function theme(){PAL=palette(readVar);dirty()}
  theme();
  live.dirty=dirty;readPrefs();hookPrefs();
  // the page's theme switch (header and OS): one hook per 3D view, removed with the view
  try{if(typeof window.onTheme==='function')live.offT=window.onTheme(function(){if(!live.gone)theme()},'models.viewer.'+LIVE.length)}catch(e){}
  try{if(typeof MutationObserver==='function'&&document.documentElement){live.mo=new MutationObserver(theme);live.mo.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']})}}catch(e){}
  try{if(window.matchMedia){var mq=window.matchMedia('(prefers-color-scheme: dark)');if(mq.addEventListener){mq.addEventListener('change',theme);live.mq=function(){mq.removeEventListener('change',theme)}}
   else if(mq.addListener){mq.addListener(theme);live.mq=function(){mq.removeListener(theme)}}}}catch(e){}

  // ---------- scene ----------
  var SC=null,MESH=[],VOL=[],OBST=null,seq=0,camSet=false,PREV=null,TEX={},TEXBAD={},SHOT=null,PLAN=null,texGen=0,TQ=[],TQN=0;
  // the shot shown (showShot): the plan is made again when the scene changes (volume ids)
  function plan(){if(!SHOT)return null;if(!PLAN||PLAN._sc!==SC){var vs=(SC&&SC.volumes)||[];PLAN=shotPlan(SHOT,vs);PLAN.labels=shotLabels(SHOT,vs,tx);PLAN._sc=SC}return PLAN}
  function clearKids(n){while(n.childNodes&&n.childNodes.length)n.removeChild(n.lastChild)}
  function shotLegend(){clearKids(shotBox);clearKids(shotLabBox);delete cb.shot;delete cb.shotLabels;var p=plan();if(!p)return;
   var i=el('input',{type:'checkbox'});i.checked=!!show.shot;i.addEventListener('change',function(){show.shot=!!i.checked;dirty()});cb.shot=i;
   shotBox.appendChild(lab(tx('models.viewer.shot.show'),[i]));
   var il=el('input',{type:'checkbox'});il.checked=!!show.shotLabels;il.addEventListener('change',function(){show.shotLabels=!!il.checked;dirty()});cb.shotLabels=il;
   shotLabBox.appendChild(lab(tx('models.viewer.shot.labels'),[il]));var has={};Object.keys(p.vols).forEach(function(k){has[p.vols[k]]=1});
   if(p.jets.length)has.jet=1;if(p.fires.length)has.fire=1;if(p.blasts.length)has.blast=1;
   [['pierced','--cthru'],['damaged','--cbounce'],['held','--cstop'],['jet','--cline'],['fire','--err'],['blast','--s5']].forEach(function(k){if(!has[k[0]])return;
    shotBox.appendChild(el('span',{},[el('span',{style:'display:inline-block;width:12px;height:12px;margin-right:4px;vertical-align:middle;background:var('+k[1]+')'}),tx(['models.viewer.shot',k[0]].join('.'))]))})}
  function freeAll(){MESH.forEach(function(m){m.parts.forEach(function(p){kill(p.pb);kill(p.nb);kill(p.ib);kill(p.tb);kill(p.eb)})});VOL.forEach(freeVol);MESH=[];VOL=[]}
  function freeVol(g){if(!g)return;kill(g.pb);kill(g.nb);kill(g.cb);kill(g.eb);kill(g.sb)}
  function freeTex(){for(var k in TEX)if(TEX[k]&&TEX[k].t)try{gl.deleteTexture(TEX[k].t)}catch(e){}TEX={};TEXBAD={};texGen++;TQ=[]}
  // a scene keeps its pictures over setScene (the same soldiers in the next line-up): only those no part names any more go
  function pruneTex(){var used={};MESH.forEach(function(m){m.parts.forEach(function(p){if(p.tk)used[p.tk]=1})});
   for(var k in TEX)if(!used[k]){if(TEX[k]&&TEX[k].t)try{gl.deleteTexture(TEX[k].t)}catch(e){}delete TEX[k];delete TEXBAD[k]}}
  function buildMeshes(sc){var tris=0;
   MESH=(sc.meshes||[]).map(function(m){var parts=[],hit=[];
    (m.parts||[]).forEach(function(p){try{if(!p.positions||!p.indices)return;var pos=unb64(p.positions,Float32Array),ix=unb64(p.indices,Uint32Array),type=gl.UNSIGNED_INT;
     hit.push({pos:pos,ix:ix,box:aabbOf(pos)});var ix2=ix;
     if(!u32){if(p.vertexCount>65535)return;ix2=new Uint16Array(ix);type=gl.UNSIGNED_SHORT}
     parts.push({pb:buf(pos),nb:p.normals?buf(unb64(p.normals,Float32Array)):null,tb:p.uv0?buf(unb64(p.uv0,Float32Array)):null,ib:buf(ix2,gl.ELEMENT_ARRAY_BUFFER),n:ix.length,type:type,
      ix:ix,eb:null,en:0,name:p.material||(p.textures||[])[0]||null,key:m.file,box:aabbOf(pos)});tris+=ix.length/3}catch(e){}});
    // tk: the key of the part's picture. A scene: one per (target, folder of the mesh file, name), shared by every figure
    var mo={world:m.world,bone:m.bone,file:m.file,parts:parts,hit:hit,target:m.target||null,variant:m.variant||(!SCN&&VARIANT)||null,figure:typeof m.figure==='number'?m.figure:null};
    parts.forEach(function(p){p.tk=tkOf(mo,p)});
    return mo});
   return tris}
  function edgeBuf(p){if(p.eb||p.en<0)return p.eb;try{var E=edgesOf(p.ix),T=u32?new Uint32Array(E):new Uint16Array(E);p.eb=buf(T,gl.ELEMENT_ARRAY_BUFFER);p.en=E.length;p.etype=u32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT}catch(e){p.en=-1}return p.eb}
  function volColours(g,v){kill(g.cb);g.cb=null;var fc=faceColors[v.id];if(!fc||!fc.length)return;var c=new Float32Array(g.F.length*4);
   for(var i=0;i<g.F.length;i++){var x=hex(fc[g.F[i]],0.5)||PAL.vol.concat([0.3]);c.set(x,i*4)}g.cb=buf(c)}
  function sideBuf(g){kill(g.sb);var c=new Float32Array(g.F.length*4);for(var i=0;i<g.F.length;i++)c.set(PAL.sides[g.F[i]%6].concat([0.45]),i*4);g.sb=buf(c);g.sbPal=PAL;return g.sb}
  function buildVols(sc){VOL.forEach(freeVol);VOL=(sc.volumes||[]).map(function(v){var G=geoOf(v);if(!G||!G.P.length)return null;var P=new Float32Array(G.P);
   var g={pb:buf(P),nb:buf(flatNormals(P)),n:G.F.length,F:G.F,eb:G.E.length?buf(new Float32Array(G.E)):null,en:G.E.length/3,cb:null,sb:null,P:G.P};volColours(g,v);return g})}
  function bnds(){var b=SC&&SC.bounds;if(b)return b;var mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
   ((SC&&SC.bones)||[]).forEach(function(x){if(!x.world)return;for(var i=0;i<3;i++){mn[i]=Math.min(mn[i],x.world[9+i]);mx[i]=Math.max(mx[i],x.world[9+i])}});
   return mn[0]<Infinity?{min:mn,max:mx}:{min:[-20,-20,-20],max:[20,20,20]}}
  function resetAll(){var keep=L.panes.map(function(c){return {mode:c.mode,back:c.back}});L.panes=newLayout().panes;
   L.panes.forEach(function(c,i){c.mode=keep[i].mode;c.back=keep[i].back;frameTo(c,bnds())});syncBar();dirty()}
  // bounds of what is selected (a volume, else the meshes of the bone, else a metre around the bone)
  function selBounds(){if(!SC)return null;var W=previewWorlds(SC,PREV),mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
   function add(p){for(var i=0;i<3;i++){if(p[i]<mn[i])mn[i]=p[i];if(p[i]>mx[i])mx[i]=p[i]}}
   if(hl!=null){SC.volumes.forEach(function(v,i){if(v.id!==hl||!W.vols[i]||!VOL[i])return;var P=VOL[i].P;for(var k=0;k+2<P.length;k+=3)add(tp(W.vols[i],[P[k],P[k+1],P[k+2]]))})}
   else if(selBone!=null){var bi=boneIdx(selBone);if(bi<0)return null;
    MESH.forEach(function(m,mi){if(m.bone!==bi||!W.meshes[mi])return;m.parts.forEach(function(p){if(!p.box)return;boxLines(p.box.min,p.box.max).forEach(function(s){add(tp(W.meshes[mi],s[0]));add(tp(W.meshes[mi],s[1]))})})});
    if(mn[0]===Infinity&&W.bones[bi]){var o=W.bones[bi].slice(9);add(add3(o,[-20,-20,-20]));add(add3(o,[20,20,20]))}}
   return mn[0]===Infinity?null:{min:mn,max:mx}}
  function frameSel(c){var b=selBounds();if(!b){info.textContent=tx('models.viewer.noSel');return}frameTo(c,b);dirty()}
  function boneIdx(path){if(!SC||path==null)return -1;for(var i=0;i<SC.bones.length;i++)if(SC.bones[i].path===path)return i;return -1}

  function say2(t){legend.textContent=t}
  var TRIS=0;
  function legendDraw(){if(!SC)return;var nm=MESH.filter(function(m){return m.parts.length}).length,nv=(SC.volumes||[]).length;
   var t=tx('models.viewer.legend',{m:nm,v:nv,t:Math.round(TRIS)});var miss=SC.missing||[];
   if(miss.length)t+=' '+tx('models.viewer.missing',{f:miss.slice(0,6).join(', ')+(miss.length>6?' (+'+(miss.length-6)+')':'')});
   var nw=(SC.volumes||[]).filter(function(v){return !v.world}).length;if(nw)t+=' '+tx('models.viewer.noBone',{n:nw});
   var bad=Object.keys(TEXBAD);if(bad.length)t+=' '+tx('models.viewer.texMissing',{f:bad.slice(0,4).map(function(k){return TEXBAD[k]}).join(' ')+(bad.length>4?' (+'+(bad.length-4)+')':'')});
   say2(t)}
  // opts.doc false: a view of set.target alone (the task window's Look pane), never the open document, no gizmo, read only
  function DOC(){var D=opts.doc===false||SCN?null:EXT_SCREENS.models.doc;return D&&D.id&&typeof D.scene==='function'?D:null}
  function modOf(){return (ctx&&ctx.mod)||(typeof S!=='undefined'&&S.mod)||null}
  function targetOf(){var D=DOC();return D&&D.mdl?D.mdl:set.target}
  function load(force){var D=DOC(),wantMeshes=force===true||!MESH.length&&!(SC&&SC._noMesh);var my=++seq;if(!SC)say2(tx('models.viewer.loading'));
   // a ready-made scene: its route, the body as given plus the mod; always whole (no pose, no LOD, no meshes:false)
   if(SCN){var sb={},sm=modOf();for(var bk in SCN.body)sb[bk]=SCN.body[bk];if(sm)sb.mod=sm;var ps;
    try{ps=Promise.resolve(api(SCN.url,sb,{what:tx('models.viewer.job.scene')}))}catch(e){ps=Promise.reject(e)}
    ps.then(function(j){if(my!==seq||live.gone)return;var s1=j&&j.ok!==false&&j.scene;if(!s1||typeof s1!=='object'){fail(j&&j.error);return}
     OBST={obstacles:s1.obstacles||[],areas:s1.areas||[]};apply({scene:s1},true)}).catch(function(e){if(my===seq&&!live.gone)fail(e&&e.message)});
    return}
   if(D){var q={anm:cur.anm||null,frame:cur.frame||0,meshes:wantMeshes,lod:LOD};var pr;try{pr=Promise.resolve(D.scene(q))}catch(e){pr=Promise.reject(e)}
    pr.then(function(j){if(my!==seq||live.gone)return;var sc=j&&j.format?j:j&&j.scene;if(!sc){fail(j&&j.error);return}
     if(!wantMeshes&&SC&&meshSig(sc)!==meshSig(SC)){load(true);return}
     // obstacles and areas of the current bytes come with the document's scene (older cores: the obst.list view)
     if(j.obstacles||j.areas)OBST={obstacles:j.obstacles||[],areas:j.areas||[]};else if(show.obstacles||show.areas)loadObst();
     apply({scene:sc,frames:j.frames,anmList:j.anmList,lodCount:j.lodCount},wantMeshes)}).catch(function(e){if(my===seq)fail(e&&e.message)});
    return}
   if(!set||!set.target){stub(tx('models.viewer.noTarget'));return}
   var body={mod:modOf(),target:set.target,anm:cur.anm||null,frame:cur.frame||0,meshes:wantMeshes,lod:LOD};
   api('/api/x/models/viewer/scene',body,{what:tx('models.viewer.job.scene')}).then(function(j){if(my!==seq||live.gone)return;
    if(!j||!j.ok){fail(j&&j.error);return}OBST={obstacles:j.scene.obstacles||[],areas:j.scene.areas||[]};apply(j,wantMeshes)}).catch(function(e){if(my===seq)fail(e&&e.message)})}
  function loadObst(){var D=DOC();if(!D||typeof D.state!=='function')return;try{Promise.resolve(D.state('obst.list',{})).then(function(j){if(j&&!live.gone){OBST={obstacles:j.obstacles||[],areas:j.areas||[]};dirty()}}).catch(function(){})}catch(e){}}
  function reloadMeshes(){load(true)}
  function fail(m){FAILM=String(m||'?');if(SNAP&&!SC)snapEnd(null,{error:m||'?',why:'failed',detail:FAILM});if(SC){note.textContent=tx('models.viewer.failed',{e:m||'?'});return}stub(tx('models.viewer.failed',{e:m||'?'}))}
  function asp0(){var w=cv.clientWidth||0,hh=cv.clientHeight||0;return w>0&&hh>0?w/hh:0}
  function sceneRad(){var b=bnds(),s=sub3(b.max,b.min);return Math.sqrt(dot3(s,s))/2}
  // a scene: every pane fits the whole of it (the first time the perspective pane also takes the default angle), then the
  // figure asked with focusFigure, if any. Before the canvas has a size the fit is a guess: draw() fits again once it has one
  function fitScene(){var b=bnds(),a=asp0();needFit=!a;
   if(!angSet){angSet=true;var rv=rowView(b),c0=L.panes[0];if(c0.view==='persp'){c0.yaw=rv.yaw;c0.pitch=rv.pitch;c0.roll=0}}
   L.panes.forEach(function(c){fitBox(c,b,a||1.5)});
   if(FOCUS!=null){if(FIG.figs[FOCUS])fitBox(P0(),FIG.figs[FOCUS],a||1.5,sceneRad());else if(!needFit)FOCUS=null}}
  function fitAll(c,a){FOCUS=null;fitBox(c,bnds(),a||asp0()||1.5)}
  function apply(j,withMeshes){var sc=j.scene;note.textContent='';PREV=null;FAILM='';unstub();
   if(SCN){sc.bones=sc.bones||[];sc.volumes=sc.volumes||[];sc.meshes=sc.meshes||[];sc.meshes.forEach(function(m){if(!m.world)m.world=ID12})}
   if(withMeshes||!SC){freeAll();TRIS=buildMeshes(sc);buildVols(sc);sc._noMesh=!MESH.some(function(m){return m.parts.length});
    if(SCN){FIG=figBoxes(MESH.map(function(m){return {world:m.world,figure:m.figure,boxes:m.parts.map(function(p){return p.box})}}));if(FIG.all)sc.bounds=FIG.all;pruneTex()}}
   else{(sc.meshes||[]).forEach(function(m,i){if(MESH[i])MESH[i].world=m.world});sc._noMesh=SC._noMesh;
    var same=(sc.volumes||[]).length===(SC.volumes||[]).length&&(sc.volumes||[]).every(function(v,i){var o=SC.volumes[i];return o&&o.id===v.id&&o.kind===v.kind&&JSON.stringify([o.size,o.radius,o.length,o.triangles])===JSON.stringify([v.size,v.radius,v.length,v.triangles])});
    if(same)(sc.volumes||[]).forEach(function(v,i){var o=SC.volumes[i];if(o._tri!==undefined)v._tri=o._tri});else buildVols(sc)}
   SC=sc;wrap.frames=j.frames||0;wrap.anmList=j.anmList||[];
   if(j.lodCount!=null){LODS=Math.max(1,j.lodCount|0);while(sLod.childNodes.length)sLod.removeChild(sLod.lastChild);for(var i=0;i<LODS;i++){var o=el('option',{value:String(i),text:String(i)});sLod.appendChild(o)}sLod.value=String(LOD);lodLab.style.display=LODS>1?'':'none'}
   if(!camSet){camSet=true;if(SCN)fitScene();else L.panes.forEach(function(c){frameTo(c,bnds())})}legendDraw();wantTex();dirty()}

  // ---------- textures ----------
  function texMode(){var R=paneRects(L,1,1);return R.some(function(r){var m=L.panes[r.i].mode;return m==='shaded'||m==='textured'})}
  function isPow2(n){return n>0&&(n&(n-1))===0}
  // a scene asks many pictures: at most TEXQ requests at once, the rest wait their turn (dropped when the pictures are freed)
  function texAsk(b){var o={what:tx('models.viewer.job.tex')};if(!SCN)return api('/api/x/models/viewer/texture',b,o);
   return new Promise(function(res,rej){TQ.push({b:b,o:o,res:res,rej:rej});texPump()})}
  function texPump(){if(live.gone){TQ=[];return}
   while(TQN<TEXQ&&TQ.length)(function(q){TQN++;var pr;try{pr=Promise.resolve(api('/api/x/models/viewer/texture',q.b,q.o))}catch(e){pr=Promise.reject(e)}
    pr.then(function(j){TQN--;q.res(j);texPump()},function(e){TQN--;q.rej(e);texPump()})})(TQ.shift())}
  // the target of a mesh's pictures: in a scene the mesh's own target (none: untextured), else the viewer's
  function wantTex(){if(!SC||!texMode())return;var mod=modOf()||(SCN&&SCN.body.mod)||null,tg0=SCN?null:targetOf(),gen=texGen;if(!mod||!SCN&&!tg0)return;
   MESH.forEach(function(m){var tg=SCN?m.target:tg0;if(!tg)return;m.parts.forEach(function(p){if(!p.name||!p.tb)return;var k=p.tk;if(TEX[k])return;TEX[k]={wait:true};
    texAsk(m.variant?{mod:mod,target:tg,rel:p.name,mesh:m.file,variant:m.variant}:{mod:mod,target:tg,rel:p.name,mesh:m.file}).then(function(j){if(live.gone||gen!==texGen)return;
     if(!j||!j.ok||!j.rgba){TEX[k]={bad:true};TEXBAD[k]=(j&&j.format?p.name+' ('+j.format+')':p.name);legendDraw();return}
     var px=unb64(j.rgba,Uint8Array),t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
     gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,j.width,j.height,0,gl.RGBA,gl.UNSIGNED_BYTE,px);
     if(isPow2(j.width)&&isPow2(j.height)){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT)}
     else{gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE)}
     gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);TEX[k]={t:t};dirty()}).catch(function(e){if(gen!==texGen)return;TEX[k]={bad:true};TEXBAD[k]=p.name;legendDraw()})})})}

  // ---------- draw ----------
  var raf=0,LAST={};   // LAST[pane] = {PV, B, rect}
  var BGA=1,CAMX=null,SNAP=null,SNAPQ=[],LIGHTX=null,FAILM='';   // a picture being taken: clear alpha 0, its own camera and light (snapshot, below); FAILM = why the last scene failed
  function dirty(){if(raf||live.gone)return;var f=(typeof requestAnimationFrame==='function')?requestAnimationFrame:function(c){return setTimeout(c,16)};raf=f(function(){raf=0;draw()})}
  function attr(name,b,n,cons){var l=A[name];if(l==null||l<0)return;if(b){gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,n,gl.FLOAT,false,0,0)}
   else{gl.disableVertexAttribArray(l);if(n===4)gl.vertexAttrib4f(l,cons[0],cons[1],cons[2],cons[3]);else if(n===2)gl.vertexAttrib2f(l,cons[0],cons[1]);else gl.vertexAttrib3f(l,cons[0],cons[1],cons[2])}}
  function seg(list,a,b,c){list.p.push(a[0],a[1],a[2],b[0],b[1],b[2]);list.c.push(c,c)}
  function drawSegs(list,depth){if(!list.p.length)return;if(depth)gl.enable(gl.DEPTH_TEST);else gl.disable(gl.DEPTH_TEST);
   var pb=buf(new Float32Array(list.p)),cc=new Float32Array(list.c.length*4);list.c.forEach(function(c,i){cc.set(c.length===4?c:c.concat(1),i*4)});var cb2=buf(cc);
   gl.uniformMatrix4fv(U.uM,false,new Float32Array(m4(ID12)));gl.uniform1f(U.uLit,0);gl.uniform1f(U.uTex,0);gl.uniform1f(U.uNrm,0);attr('aP',pb,3);attr('aN',null,3,[0,0,1]);attr('aT',null,2,[0,0]);attr('aC',cb2,4);
   gl.drawArrays(gl.LINES,0,list.p.length/3);kill(pb);kill(cb2);gl.enable(gl.DEPTH_TEST)}
  function drawPts(pts,size){if(!pts.p.length)return;gl.disable(gl.DEPTH_TEST);var pb=buf(new Float32Array(pts.p)),cc=new Float32Array(pts.c.length*4);pts.c.forEach(function(c,i){cc.set(c.length===4?c:c.concat(1),i*4)});var cb2=buf(cc);
   gl.uniformMatrix4fv(U.uM,false,new Float32Array(m4(ID12)));gl.uniform1f(U.uLit,0);gl.uniform1f(U.uPS,size);attr('aP',pb,3);attr('aN',null,3,[0,0,1]);attr('aC',cb2,4);gl.drawArrays(gl.POINTS,0,pts.p.length/3);kill(pb);kill(cb2);gl.uniform1f(U.uPS,1);gl.enable(gl.DEPTH_TEST)}
  // hidden in the Skeleton tree (D.hidden, display only): a bone hides with everything under it; a volume by its id
  function HID(){var D=opts.doc===false||SCN?null:EXT_SCREENS.models.doc;return D&&D.id&&D.hidden?D.hidden:null}
  function hidBone(bi){var H=HID();if(!H||!H.bones||!H.bones.length||!SC||!SC.bones[bi])return false;var p=SC.bones[bi].path||'';
   return H.bones.some(function(x){return p===x||p.indexOf(x+'/')===0})}
  function hidVol(v){var H=HID();return !!(H&&H.volumes&&v&&H.volumes.indexOf(v.id)>=0)}
  function visBone(bi,sb){if(hidBone(bi))return false;if(!show.onlySel)return true;if(sb>=0)return bi===sb;if(hl!=null){var v=(SC.volumes||[]).filter(function(x){return x.id===hl})[0];return v?v.bone===bi:true}return true}
  function draw(){if(live.gone)return;if(wrap.isConnected)live.seen=true;
   var dpr=window.devicePixelRatio||1,cw=cv.clientWidth||0,ch=cv.clientHeight||0,w=Math.max(1,Math.round(cw*dpr)),hh=Math.max(1,Math.round(ch*dpr));
   if(cv.width!==w||cv.height!==hh){cv.width=w;cv.height=hh}
   if(ov.width!==w||ov.height!==hh){ov.width=w;ov.height=hh}
   if(needFit&&SCN&&SC&&cw>0&&ch>0)fitScene();   // the scene came before the canvas had a size
   var g2=null;try{g2=ov.getContext&&ov.getContext('2d')}catch(e){g2=null}if(g2){g2.setTransform(1,0,0,1,0,0);g2.clearRect(0,0,w,hh)}
   gl.enable(gl.SCISSOR_TEST);gl.viewport(0,0,w,hh);gl.scissor(0,0,w,hh);gl.clearColor(PAL.bg[0],PAL.bg[1],PAL.bg[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   LAST={};var R=paneRects(L,w,hh);
   R.forEach(function(r){drawPane(r,hh,g2,dpr)});
   gl.disable(gl.SCISSOR_TEST);
   if(g2&&L.quad){g2.lineWidth=1;R.forEach(function(r){g2.strokeStyle=css(r.i===L.active?PAL.acc:PAL.line);g2.lineWidth=r.i===L.active?2*dpr:1;g2.strokeRect(r.x+0.5,r.y+0.5,r.w-1,r.h-1)})}}
  function drawPane(r,H,g2,dpr){var c=L.panes[r.i],gy=H-r.y-r.h;gl.viewport(r.x,gy,r.w,r.h);gl.scissor(r.x,gy,r.w,r.h);
   gl.clearColor(PAL.bg[0]*BGA,PAL.bg[1]*BGA,PAL.bg[2]*BGA,BGA);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   var cm=CAMX||camMat(c,r.w/Math.max(1,r.h)),B=cm.B;LAST[r.i]={PV:cm.PV,B:B,rect:r,cam:c};
   if(g2){g2.font=Math.round(11*dpr)+'px sans-serif';g2.fillStyle=css(PAL.hint);g2.fillText(tx(['models.viewer.view',c.view].join('.'))+(c.ortho?' '+tx('models.viewer.orthoShort'):'')+' / '+tx(['models.viewer.mode',c.mode].join('.')),r.x+6*dpr,r.y+14*dpr)}
   if(!SC)return;
   gl.useProgram(prog);gl.uniformMatrix4fv(U.uPV,false,new Float32Array(cm.PV));gl.uniform1f(U.uPS,1);gl.uniform1f(U.uTex,0);gl.uniform1f(U.uNrm,0);gl.uniform1i(U.uS,0);
   var Lw=LIGHTX?LIGHTX.dir:light(B);gl.uniform3f(U.uL,Lw[0],Lw[1],Lw[2]);gl.uniform3f(U.uE,B.e[0],B.e[1],B.e[2]);gl.uniform3f(U.uF,B.f[0],B.f[1],B.f[2]);gl.uniform1f(U.uOr,(CAMX&&CAMX.ortho!=null?CAMX.ortho:c.ortho)?1:0);gl.uniform3f(U.uBad,PAL.x[0],PAL.x[1],PAL.x[2]);
   if(LIGHTX)gl.uniform4f(U.uK,LIGHTX.amb,LIGHTX.dif,LIGHTX.sky,1);else gl.uniform4f(U.uK,0,0,0,0);
   gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);
   if(c.back)gl.disable(gl.CULL_FACE);else{gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK)}
   var W=previewWorlds(SC,PREV),sb=boneIdx(selBone),acc=PAL.acc,segs={p:[],c:[]},top={p:[],c:[]},pts={p:[],c:[]},big={p:[],c:[]};
   // grid and axes (depth tested, behind the model)
   if(show.grid){var ax=gridAxes(c),N=show.gridN||20,M=GRIDM,ext=N*M/2;
    for(var i=-N/2;i<=N/2;i++){var a=[0,0,0],b=[0,0,0],a2=[0,0,0],b2=[0,0,0];a[ax[0]]=i*M;a[ax[1]]=-ext;b[ax[0]]=i*M;b[ax[1]]=ext;a2[ax[1]]=i*M;a2[ax[0]]=-ext;b2[ax[1]]=i*M;b2[ax[0]]=ext;
     var col=i===0?PAL.line:i%5===0?PAL.grid5:PAL.grid;seg(segs,a,b,col);seg(segs,a2,b2,col)}
    if(g2)gridMarks(c,cm.PV,r,g2,dpr,ax,N,M)}
   if(show.axes){var AL=40;seg(top,[0,0,0],[AL,0,0],PAL.x);seg(top,[0,0,0],[0,AL,0],PAL.y);seg(top,[0,0,0],[0,0,AL],PAL.z)}
   drawSegs(segs,true);segs={p:[],c:[]};
   // meshes
   var mode=c.mode,wire=mode==='wire'||show.meshWire,solid=!wire||mode==='solidwire';if(mode==='solidwire')wire=true;if(show.meshWire)solid=false;
   if(show.meshes)MESH.forEach(function(m,mi){var bo=SC.bones[m.bone];if(bo&&bo.visible===false)return;var mw=W.meshes[mi];if(!mw||!visBone(m.bone,sb))return;
    gl.uniformMatrix4fv(U.uM,false,new Float32Array(m4(mw)));var onSel=sb>=0&&m.bone===sb;
    m.parts.forEach(function(p,pi){attr('aP',p.pb,3);attr('aN',p.nb,3,[0,0,1]);attr('aT',p.tb,2,[0,0]);
     var base=mode==='paint'?hue(m.file+'#'+pi,0.85).concat(1):tint(p.name||m.file,PAL);if(onSel&&show.paintSel)base=acc.concat(1);
     var T=(mode==='shaded'||mode==='textured')&&p.tb&&p.tk?TEX[p.tk]:null,useT=T&&T.t&&!(onSel&&show.paintSel);
     if(solid){gl.uniform1f(U.uNrm,mode==='normals'?1:0);gl.uniform1f(U.uLit,mode==='textured'?0:p.nb?1:0);
      if(useT){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,T.t);gl.uniform1f(U.uTex,1);attr('aC',null,4,[1,1,1,1])}else{gl.uniform1f(U.uTex,0);attr('aC',null,4,base)}
      if(mode==='solidwire'){gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1)}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.ib);gl.drawElements(gl.TRIANGLES,p.n,p.type,0);gl.disable(gl.POLYGON_OFFSET_FILL);gl.uniform1f(U.uTex,0);gl.uniform1f(U.uNrm,0)}
     if(wire||(onSel&&!show.paintSel)){var eb=edgeBuf(p);if(eb){gl.uniform1f(U.uLit,0);var wc=onSel?acc:mode==='solidwire'?PAL.fg:base.slice(0,3);attr('aC',null,4,wc.concat(1));attr('aN',null,3,[0,0,1]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,eb);gl.drawElements(gl.LINES,p.en,p.etype,0)}}});
    if(show.vectors||(show.vecSel&&onSel)){var o=tp(mw,[0,0,0]),VL=15;seg(top,o,tp(mw,[VL,0,0]),PAL.x);seg(top,o,tp(mw,[0,VL,0]),PAL.y);seg(top,o,tp(mw,[0,0,VL]),PAL.z)}});
   // volumes
   if(show.volumes){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.disable(gl.CULL_FACE);
    var SP=show.shot?plan():null;
    SC.volumes.forEach(function(v,i){var g=VOL[i],vw=W.vols[i];if(!g||!vw||hidVol(v)||!visBone(v.bone,sb)&&v.id!==hl)return;var on=hl!=null&&v.id===hl,sk=SP&&!on?SP.vols[v.id]:null;
     var base=v.id in colors?hex(colors[v.id],0.32):show.volColor==='each'?hue(v.id,0.7).concat(0.32):PAL.vol.concat(0.26);if(on)base=acc.concat(0.5);if(!base)base=PAL.vol.concat(0.26);
     if(sk)base=PAL[SHOTPAL[sk]].concat(0.55);   // the shot's result over the volume's own colours; untouched volumes keep theirs
     gl.uniformMatrix4fv(U.uM,false,new Float32Array(m4(vw)));
     if(!show.volWire){gl.uniform1f(U.uLit,1);attr('aP',g.pb,3);attr('aN',g.nb,3);attr('aT',null,2,[0,0]);
      if(g.cb&&!on&&!sk)attr('aC',g.cb,4);else if(show.volColor==='sides'&&!on&&!sk){if(!g.sb||g.sbPal!==PAL)sideBuf(g);attr('aC',g.sb,4)}else attr('aC',null,4,base);gl.drawArrays(gl.TRIANGLES,0,g.n)}
     if(g.eb){gl.uniform1f(U.uLit,0);attr('aP',g.eb,3);attr('aN',null,3,[0,0,1]);var ec=on?acc.concat(1):mix(base,PAL.fg,0.4).concat(0.85);attr('aC',null,4,ec);gl.drawArrays(gl.LINES,0,g.en)}});
    gl.depthMask(true);gl.disable(gl.BLEND)}
   // obstacles and areas (model space, on the ground)
   if(OBST){[['obstacles',PAL.x],['areas',PAL.y]].forEach(function(q){if(!show[q[0]])return;(OBST[q[0]]||[]).forEach(function(o){var pl=outline2(o);for(var i=0;i<pl.length;i++){var a=pl[i],b=pl[(i+1)%pl.length];seg(top,[a[0],a[1],0.2],[b[0],b[1],0.2],q[1])}})})}
   // bones, joints, entities, bounds
   var bw=W.bones;
   if(show.bones)(SC.bones||[]).forEach(function(b,i){var p=b.parent;if(!bw[i]||!visBone(i,sb)&&!(sb>=0&&p===sb))return;var on=i===sb;
    if(p>=0&&bw[p])seg(top,bw[p].slice(9),bw[i].slice(9),on||p===sb?acc:PAL.bone);(on?big:pts).p.push(bw[i][9],bw[i][10],bw[i][11]);(on?big:pts).c.push(on?acc:PAL.bone)});
   else if(sb>=0&&bw[sb]){big.p.push(bw[sb][9],bw[sb][10],bw[sb][11]);big.c.push(acc)}
   if(show.entities){var hasMesh={};MESH.forEach(function(m){if(m.parts.length)hasMesh[m.bone]=true});
    (SC.bones||[]).forEach(function(b,i){if(hasMesh[i]||!bw[i]||!visBone(i,sb))return;var on=i===sb;boxLines([-4,-2.5,-1],[4,2.5,1]).forEach(function(s){seg(show.entWire?top:segs,tp(bw[i],s[0]),tp(bw[i],s[1]),on?acc:PAL.ent)})})}
   if(show.bounds){var bb=bnds();boxLines(bb.min,bb.max).forEach(function(s){seg(top,s[0],s[1],PAL.hint)})}
   lines.forEach(function(l){var c2=hex(l.c)||PAL.fg.concat(1);seg(top,l.a,l.b,c2)});
   // the shot's jets (lines), blasts (wire spheres of the outer radius) and fires (a marker at the volume's middle or the point)
   var SQ=show.shot?plan():null;
   if(SQ){SQ.jets.forEach(function(x){seg(top,x.from,x.to,PAL.sJ)});SQ.blasts.forEach(function(b){ringSegs(b.point,b.r).forEach(function(s){seg(top,s[0],s[1],PAL.sB)})});
    SQ.fires.forEach(function(f){var p=f.point;if(!p&&f.volume!=null)(SC.volumes||[]).forEach(function(v,i){if(!p&&v.id===f.volume&&W.vols[i]&&VOL[i])p=tp(W.vols[i],volCtr(VOL[i]))});
     if(p){big.p.push(p[0],p[1],p[2]);big.c.push(PAL.sF)}})}
   drawSegs(segs,true);drawSegs(top,false);drawPts(pts,5*dpr);drawPts(big,9*dpr);
   // the gizmo part draws on top
   if(G&&G.lines){var gs={p:[],c:[]};try{(G.lines(viewInfo(r.i))||[]).forEach(function(s){seg(gs,s.a,s.b,PAL[s.c]||acc)})}catch(e){}drawSegs(gs,false)}
   if(g2&&show.names){g2.fillStyle=css(PAL.fg);g2.font=Math.round(11*dpr)+'px sans-serif';
    (SC.bones||[]).forEach(function(b,i){if(!bw[i]||!visBone(i,sb))return;var s=project(cm.PV,bw[i].slice(9),r.w,r.h);if(!s||s[2]<-1||s[2]>1)return;g2.fillStyle=css(i===sb?acc:PAL.fg);g2.fillText(b.name,r.x+s[0]+5*dpr,r.y+s[1]-4*dpr)})}
   if(g2&&show.volNames&&show.volumes)volNames(r,g2,dpr,cm.PV,W,sb);
   if(g2&&SQ&&show.shotLabels)shotTags(r,g2,dpr,cm.PV,W,SQ.labels||[])}
  // labels of the shot overlay (shotLabels): a small square in the kind's colour, the text in the page's colour with a halo in the
  // background colour, a thin line from the place to its label; a label that would cover another one goes under it (placeTags)
  function shotTags(r,g2,dpr,PV,W,Ls){if(!Ls.length)return;g2.save();g2.beginPath();g2.rect(r.x,r.y,r.w,r.h);g2.clip();
   var fs=Math.round(11*dpr),lh=Math.round(14*dpr),sq=Math.round(8*dpr),B=[],S=[];g2.font=fs+'px sans-serif';g2.textAlign='left';g2.lineJoin='round';
   function wid(t){var m=g2.measureText&&g2.measureText(t);return m&&m.width>0?m.width:t.length*fs*0.6}
   Ls.forEach(function(L){var p=L.point;if(!p&&L.volume!=null)(SC.volumes||[]).forEach(function(v,i){if(!p&&v.id===L.volume&&W.vols[i]&&VOL[i])p=tp(W.vols[i],volCtr(VOL[i]))});if(!p)return;
    var s=project(PV,p,r.w,r.h);if(!s||s[2]<-1||s[2]>1)return;var w=0;L.lines.forEach(function(l){w=Math.max(w,wid(l.t))});
    S.push({s:s,L:L});B.push({x:r.x+s[0]+10*dpr,y:r.y+s[1]-L.lines.length*lh/2,w:w+sq+4*dpr,h:L.lines.length*lh})});
   placeTags(B,2*dpr).forEach(function(q,n){var s=S[n].s,L=S[n].L;
    g2.strokeStyle=css(PAL.fg,0.55);g2.lineWidth=1*dpr;g2.beginPath();g2.moveTo(r.x+s[0],r.y+s[1]);g2.lineTo(q.x-2*dpr,q.y+lh/2);g2.stroke();
    L.lines.forEach(function(l,i){var ty=q.y+(i+1)*lh-4*dpr;g2.fillStyle=css(PAL[l.k==='jet'?'sJ':l.k==='fire'?'sF':'sB']);g2.fillRect(q.x,ty-sq,sq,sq);
     g2.lineWidth=3*dpr;g2.strokeStyle=css(PAL.bg);g2.strokeText(l.t,q.x+sq+4*dpr,ty);g2.fillStyle=css(PAL.fg);g2.fillText(l.t,q.x+sq+4*dpr,ty)})});
   g2.restore()}
  // volume names: one label at the centre of each volume drawn (same skips as the volumes: hidden, only the selection),
  // a halo in the background colour keeps it readable on the tinted volume in light and dark themes; kept inside the pane
  function volCtr(g){if(g.ctr)return g.ctr;var P=g.P,mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
   for(var k=0;k+2<P.length;k+=3)for(var j=0;j<3;j++){if(P[k+j]<mn[j])mn[j]=P[k+j];if(P[k+j]>mx[j])mx[j]=P[k+j]}
   g.ctr=mn[0]<Infinity?[(mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2]:[0,0,0];return g.ctr}
  function volNames(r,g2,dpr,PV,W,sb){g2.save();g2.beginPath();g2.rect(r.x,r.y,r.w,r.h);g2.clip();
   g2.font=Math.round(11*dpr)+'px sans-serif';g2.textAlign='center';g2.lineJoin='round';g2.lineWidth=3*dpr;g2.strokeStyle=css(PAL.bg);
   (SC.volumes||[]).forEach(function(v,i){var g=VOL[i],vw=W.vols[i];if(!g||!vw||hidVol(v)||!visBone(v.bone,sb)&&v.id!==hl)return;var t=v.name||v.id;if(!t)return;
    var s=project(PV,tp(vw,volCtr(g)),r.w,r.h);if(!s||s[2]<-1||s[2]>1)return;var x=r.x+s[0],y=r.y+s[1]+4*dpr;
    g2.strokeText(t,x,y);g2.fillStyle=css(hl!=null&&v.id===hl?PAL.acc:PAL.fg);g2.fillText(t,x,y)});
   g2.restore()}
  // metre marks along the two grid axes, every 5 m (every metre when the grid is 10 m or less)
  function gridMarks(c,PV,r,g2,dpr,ax,N,M){var every=N<=10?1:5;g2.fillStyle=css(PAL.hint);g2.font=Math.round(10*dpr)+'px sans-serif';
   for(var k=0;k<2;k++)for(var i=-N/2;i<=N/2;i++){if(!i||i%every)continue;var p=[0,0,0];p[ax[k]]=i*M;var s=project(PV,p,r.w,r.h);if(!s||s[2]<-1||s[2]>1)continue;
    if(s[0]<0||s[1]<0||s[0]>r.w||s[1]>r.h)continue;g2.fillText(tx('models.viewer.metres',{n:i}),r.x+s[0]+2*dpr,r.y+s[1]-2*dpr)}}
  // light: follows the camera until moved by hand (Shift + drag), then stays put in the world
  var LIGHT={follow:true,yaw:0,pitch:0.8};
  function light(B){if(LIGHT.follow)return nrm3(add3(scl3(B.f,-0.6),add3(scl3(B.r,0.3),scl3(B.u,0.5))));var cp=Math.cos(LIGHT.pitch);return [cp*Math.cos(LIGHT.yaw),cp*Math.sin(LIGHT.yaw),Math.sin(LIGHT.pitch)]}

  // ---------- pointer ----------
  function rel(e){var b=cv.getBoundingClientRect?cv.getBoundingClientRect():{left:0,top:0,width:cv.clientWidth||1,height:cv.clientHeight||1};
   var dpr=window.devicePixelRatio||1;return {x:(e.clientX-b.left)*dpr,y:(e.clientY-b.top)*dpr,W:Math.max(1,b.width*dpr),H:Math.max(1,b.height*dpr),dpr:dpr}}
  function paneOf(q){return paneAt(L,q.W,q.H,q.x,q.y)}
  function rayAt(r,x,y){var c=L.panes[r.i];return camRay(c,2*(x-r.x)/Math.max(1,r.w)-1,1-2*(y-r.y)/Math.max(1,r.h),r.w/Math.max(1,r.h))}
  // what the gizmo part needs of one pane
  function viewInfo(i){var Ls=LAST[i];if(!Ls)return null;var r=Ls.rect,c=L.panes[i];
   return {e:Ls.B.e,f:Ls.B.f,r:Ls.B.r,u:Ls.B.u,ortho:!!c.ortho,
    project:function(p){var s=project(Ls.PV,p,r.w,r.h);return s?[s[0],s[1]]:null},ray:function(x,y){return rayAt({i:i,x:0,y:0,w:r.w,h:r.h},x,y)},upp:function(p){return upp(c,p,r.h)}}}
  var drag=null,FLY=null,menu=null;
  cv.addEventListener('contextmenu',function(e){e.preventDefault()});
  cv.addEventListener('mousedown',function(e){if(menu)closeMenu();try{box.focus()}catch(x){}var q=rel(e),r=paneOf(q);
   if(L.active!==r.i){L.active=r.i;syncBar();dirty()}
   var mod=e.ctrlKey||e.metaKey?'ctrl':e.shiftKey?'shift':e.altKey?'alt':'';
   drag={x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,b:e.button,mod:mod,r:r,t0:Date.now(),moved:false,kind:null};
   if(e.button===0){var V=G&&viewInfo(r.i),gh=V&&G.hit?G.hit(V,q.x-r.x,q.y-r.y):null;
    if(gh){drag.kind='gizmo';G.down(V,gh,q.x-r.x,q.y-r.y,e)}
    else drag.kind=mod==='shift'?'light':mod==='ctrl'?'roll':mod==='alt'||L.panes[r.i].ortho?'pan':'orbit'}
   else if(e.button===1)drag.kind=mod==='ctrl'?'dolly':'pan';
   else if(e.button===2){drag.kind='rmb';if(!L.panes[r.i].ortho)drag.timer=setTimeout(function(){if(drag&&drag.kind==='rmb'){drag.kind='fly';startFly(r.i)}},200)}
   cv.style.cursor=drag.kind==='fly'?'none':'grabbing';e.preventDefault()});
  // the drag follows the mouse outside the canvas, so move and end are on the window: one pair per viewer, taken off again in release() (live.offW)
  function wMove(e){if(!drag||live.gone)return;var dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
   if(Math.abs(e.clientX-drag.x0)+Math.abs(e.clientY-drag.y0)>=4)drag.moved=true;var c=L.panes[drag.r.i],dpr=window.devicePixelRatio||1;
   if(drag.kind==='gizmo'){var q=rel(e);G.move(viewInfo(drag.r.i),q.x-drag.r.x,q.y-drag.r.y,e);return}
   if(drag.kind==='orbit')orbit(c,dx,dy);else if(drag.kind==='roll')rollPitch(c,dx,dy);else if(drag.kind==='pan')pan(c,dx*dpr,dy*dpr,drag.r.h);
   else if(drag.kind==='dolly')dolly(c,dy);else if(drag.kind==='fly')flyLook(c,dx,dy);
   else if(drag.kind==='light'){var B=camBasis(c);if(LIGHT.follow){var l0=light(B);LIGHT.yaw=Math.atan2(l0[1],l0[0]);LIGHT.pitch=Math.asin(Math.max(-1,Math.min(1,l0[2])));LIGHT.follow=false}
    if(drag.mod==='shift'&&(e.ctrlKey||e.metaKey))LIGHT.pitch=Math.max(-HALF,Math.min(HALF,LIGHT.pitch-dy*0.01));else{LIGHT.yaw-=dx*0.01;LIGHT.pitch=Math.max(-HALF,Math.min(HALF,LIGHT.pitch-dy*0.01))}}
   else return;syncBar();dirty()}
  function wUp(e){if(live.gone)wOff('mouseup',wUp);if(!drag)return;var d=drag;drag=null;cv.style.cursor='grab';if(d.timer)clearTimeout(d.timer);
   if(d.kind==='gizmo'){var pr=G.up();if(pr&&pr.catch)pr.catch(function(x){PREV=null;readout.textContent=tx('models.viewer.opFailed',{e:(x&&x.message)||'?'});dirty()});return}
   if(d.kind==='fly'){stopFly();return}
   if(d.kind==='rmb'){if(!d.moved)openMenu(e,d.r);return}
   if(d.b===0&&!d.moved)click(e,d.r)}
  function wOff(k,f){try{window.removeEventListener(k,f)}catch(z){}}
  window.addEventListener('mousemove',wMove);window.addEventListener('mouseup',wUp);
  // a drag still held when the viewer is released ends as before: its mouseup runs once more, then takes itself off
  live.offW=function(){wOff('mousemove',wMove);if(!drag)wOff('mouseup',wUp);wOff('resize',dirty)};
  cv.addEventListener('wheel',function(e){e.preventDefault();var r=paneOf(rel(e));zoom(L.panes[r.i],e.deltaY||0,e.ctrlKey?'ctrl':e.shiftKey?'shift':'');dirty()},{passive:false});
  cv.addEventListener('dblclick',function(e){e.preventDefault();var r=paneOf(rel(e));if(L.quad)maximise(L,r.i);else if(SCN)fitAll(L.panes[r.i],r.w/Math.max(1,r.h));else frameTo(L.panes[r.i],bnds());syncBar();dirty()});
  function startFly(i){FLY={i:i,keys:{},t:Date.now()};cv.style.cursor='none';info.textContent=tx('models.viewer.flying');tick()}
  function stopFly(){FLY=null;cv.style.cursor='grab';info.textContent=''}
  function tick(){if(!FLY||live.gone)return;var now=Date.now(),dt=Math.min(0.1,(now-FLY.t)/1000);FLY.t=now;var c=L.panes[FLY.i],k=FLY.keys,sp=c.rad*0.8*(k.shift?0.25:k.ctrl?4:1);
   if(k.w||k.a||k.s||k.d||k.q||k.e){flyMove(c,k,sp*dt);dirty()}var f=(typeof requestAnimationFrame==='function')?requestAnimationFrame:function(cb){return setTimeout(cb,16)};f(tick)}
  var FLYKEY={w:'w',a:'a',s:'s',d:'d',q:'q',e:'e',arrowup:'w',arrowdown:'s',arrowleft:'a',arrowright:'d'};
  function click(e,r){if(!SC)return;var q=rel(e),R=rayAt(r,q.x,q.y),Ls=LAST[r.i],W=previewWorlds(SC,PREV),sb=boneIdx(selBone);
   var bone=-1;if(Ls&&(show.bones||show.entities))bone=nearPt(W.bones.map(function(w,i){if(!w||!visBone(i,sb))return null;return project(Ls.PV,w.slice(9),r.w,r.h)}),q.x-r.x,q.y-r.y,8*q.dpr);
   var vols=(SC.volumes||[]).map(function(v,i){return W.vols[i]?Object.assign({},v,{world:W.vols[i]}):v});
   var vskip=function(v){return hidVol(v)||!visBone(v.bone,sb)&&v.id!==hl};
   var hv=show.volumes?pick(vols,R.o,R.d,vskip):null;
   var hm=show.meshes?pickMesh(MESH.map(function(m,i){return {world:W.meshes[i],hit:m.hit,bone:m.bone}}),R.o,R.d,function(m){return !visBone(m.bone,sb)}):null;
   // hits: every volume under the click, nearest first, also while volumes are not shown (a shot goes to the first one shells hit)
   var out={volume:hv?hv.volume:null,side:hv?hv.side:-1,point:hv?hv.point:hm?hm.point:null,origin:R.o,dir:R.d,bone:null,hits:pickAll(vols,R.o,R.d,vskip),ground:groundAt(R.o,R.d,bnds())};
   // a scene of many models: the figure under the click (the mesh hit, else the first figure box the ray meets); nothing is selected
   if(SCN){var fg=hm?(MESH[hm.index]||{}).figure:pickFigure(FIG.figs,R.o,R.d);out.figure=typeof fg==='number'&&fg>=0?fg:null;
    if(opts.onHit){try{opts.onHit(out)}catch(x){}}if(onPick){try{onPick(out)}catch(x){}}
    if(out.figure!=null&&typeof opts.onFigure==='function'){try{opts.onFigure(out.figure)}catch(x){}}return}
   var pickBone=bone>=0?bone:hm&&(!hv||hm.t<hv.t)?hm.bone:-1;
   if(pickBone>=0&&(bone>=0||!hv)){out.bone=SC.bones[pickBone].path;out.volume=null;out.side=-1}
   if(opts.onHit){try{opts.onHit(out)}catch(x){}}   // only told: pose following and the readout stay (the Model sub-tab, ctx.onPick)
   // onPick may answer {volume}: the volume it took (a shot past volumes shells do not hit), selected instead of the one clicked
   var took=null,cb=out.bone,cvol=out.volume;if(onPick){try{took=onPick(out)}catch(x){}}
   if(took&&typeof took==='object'&&Object.prototype.hasOwnProperty.call(took,'volume')){cvol=took.volume||null;cb=null}
   choose(cb,cvol,!onPick)}
  function choose(bone,vol,tell){var D=DOC();
   if(D&&typeof D.select==='function'){try{D.select({bone:bone||null,volume:vol||null})}catch(x){}}
   selBone=bone||null;hl=vol||null;
   if(tell){if(vol){var v=SC.volumes.filter(function(x){return x.id===vol})[0];info.textContent=v?tx('models.viewer.picked',{id:v.id,k:tx(['models.viewer.kind',v.kind].join('.')),s:sizeText(v)}):''}
    else if(bone)info.textContent=tx('models.viewer.pickedBone',{b:bone});else info.textContent=tx('models.viewer.nothing')}
   dirty()}
  function m2(x){return (Number(x||0)/20).toFixed(2)}
  function sizeText(v){if(v.kind==='box'&&v.size)return tx('models.viewer.size.box',{x:m2(v.size[0]),y:m2(v.size[1]),z:m2(v.size[2])});
   if(v.kind==='cylinder')return tx('models.viewer.size.cylinder',{r:m2(v.radius),h:m2(v.length)});
   if(v.kind==='sphere')return tx('models.viewer.size.sphere',{r:m2(v.radius)});return tx('models.viewer.size.polyhedron',{n:v.triangleCount||0})}

  // ---------- the view menu (short right click) ----------
  function closeMenu(){if(menu&&menu.parentNode)menu.parentNode.removeChild(menu);menu=null}
  function openMenu(e,r){closeMenu();var c=L.panes[r.i],q=rel(e);
   function item(text,on,fn){return el('button',{type:'button',role:'menuitemcheckbox','aria-checked':on?'true':'false',style:'display:block;width:100%;text-align:left;font-weight:'+(on?'bold':'normal'),
    text:(on?'✓ ':'  ')+text,onclick:function(){fn();closeMenu();syncBar();dirty();try{box.focus()}catch(x){}}})}
   function head(k){return el('div',{class:'hint',style:'margin-top:4px',text:tx(k)})}
   var kids=[head('models.viewer.view')];
   VIEWS.forEach(function(v){kids.push(item(tx(['models.viewer.view',v].join('.')),c.view===v,function(){setView(c,v);frameTo(c,bnds())}))});
   kids.push(item(tx('models.viewer.ortho'),!!c.ortho,function(){setOrtho(c,!c.ortho)}));
   kids.push(item(tx('models.viewer.backfaces'),!!c.back,function(){c.back=!c.back}));
   kids.push(head('models.viewer.mode'));MODES.forEach(function(m){kids.push(item(tx(['models.viewer.mode',m].join('.')),c.mode===m,function(){c.mode=m;wantTex()}))});
   kids.push(head('models.viewer.viewing'));['appearance','collision','hybrid'].forEach(function(v){kids.push(item(tx(['models.viewer.viewing',v].join('.')),viewingOf(show)===v,function(){setViewing(show,v)}))});
   kids.push(head('models.viewer.more'));SHOWK.concat(MOREK).forEach(function(k){kids.push(item(tx(['models.viewer',k].join('.')),!!show[k],function(){show[k]=!show[k]}))});
   kids.push(item(tx(L.quad?'models.viewer.one':'models.viewer.quad'),false,function(){if(L.quad)maximise(L,r.i);else toggleQuad(L)}));
   kids.push(item(tx('models.viewer.frameSel'),false,function(){frameSel(c)}));kids.push(item(tx('models.viewer.frameAll'),false,function(){frameTo(c,bnds())}));
   menu=el('div',{role:'menu',style:'position:absolute;z-index:5;max-height:90%;overflow:auto;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:4px;padding:4px;min-width:12em'},kids);
   var dpr=q.dpr||1;menu.style.left=Math.max(0,Math.min(q.x/dpr,(q.W/dpr)-200))+'px';menu.style.top=Math.max(0,q.y/dpr-10)+'px';box.appendChild(menu)}

  // ---------- keys (the view has the focus, not a text field) ----------
  box.addEventListener('keydown',function(e){var t=e.target&&e.target.tagName;if(t==='INPUT'||t==='TEXTAREA'||t==='SELECT')return;
   var k=String(e.key||'').toLowerCase(),c=P0(),ctrl=e.ctrlKey||e.metaKey;
   if(FLY&&(FLYKEY[k]||k==='shift'||k==='control')){if(FLYKEY[k])FLY.keys[FLYKEY[k]]=true;FLY.keys.shift=e.shiftKey;FLY.keys.ctrl=ctrl;e.preventDefault();return}
   var done=true;
   if(k==='escape'){if(menu)closeMenu();else if(G&&G.cancel)G.cancel();PREV=null}
   else if(k==='f6')nextPane(L,e.shiftKey?-1:1);
   else if(ctrl||e.altKey)done=false;
   else if(G&&G.setMode&&(k==='w'||k==='e'||k==='r'||k==='q'))G.setMode({w:'move',e:'rotate',r:'scale',q:'select'}[k]);
   else if(k==='f')frameSel(c);else if(k==='a'){if(SCN)fitAll(c);else frameTo(c,bnds())}
   else if(k==='4')toggleQuad(L);else if(k==='5')setOrtho(c,!c.ortho);
   else done=false;
   if(!done&&(k==='1'||k==='3'||k==='7')){setView(c,k==='1'?(ctrl?'back':'front'):k==='3'?(ctrl?'right':'left'):(ctrl?'bottom':'top'));frameTo(c,bnds());done=true}
   if(done){e.preventDefault();syncBar();dirty()}});
  box.addEventListener('keyup',function(e){if(!FLY)return;var k=String(e.key||'').toLowerCase();if(FLYKEY[k])FLY.keys[FLYKEY[k]]=false;FLY.keys.shift=e.shiftKey;FLY.keys.ctrl=e.ctrlKey||e.metaKey});
  box.addEventListener('blur',function(){if(FLY)FLY.keys={}});

  // ---------- size ----------
  try{if(typeof ResizeObserver==='function'){live.ro=new ResizeObserver(function(){if(live.seen&&!wrap.isConnected){release(live);return}dirty()});live.ro.observe(box)}
   else window.addEventListener('resize',dirty)}catch(e){}

  // ---------- the gizmo part (sub/gizmo.client.js), when there ----------
  var GP=opts.doc!==false&&!SCN&&EXT_SCREENS.models.parts&&EXT_SCREENS.models.parts.gizmo,G=null;
  var host={
   target:function(){var D=DOC();if(!D||!SC)return null;var W=previewWorlds(SC,null);
    if(hl!=null){for(var i=0;i<SC.volumes.length;i++){var v=SC.volumes[i];if(v.id===hl&&W.vols[i])return {kind:'volume',id:v.id,world:W.vols[i],parent:W.bones[v.bone]||ID12,vol:v,posed:!!cur.anm}}return null}
    var bi=boneIdx(selBone);if(bi<0||!W.bones[bi])return null;var p=SC.bones[bi].parent;return {kind:'bone',id:selBone,world:W.bones[bi],parent:p>=0&&W.bones[p]?W.bones[p]:ID12,posed:!!cur.anm}},
   preview:function(p){PREV=p||null;dirty()},
   op:function(name,args){var D=DOC();if(!D)return Promise.reject(new Error(tx('models.viewer.noDoc')));return Promise.resolve(D.op(name,args))},
   say:function(t){readout.textContent=t||''},redraw:dirty};
  host.blk=bid('gizmo');host.name=bnm('gizmo');
  if(typeof GP==='function'){try{G=GP(host)}catch(e){G=null}if(G&&G.el){if(cvLeaf.parentNode===wrap&&typeof wrap.insertBefore==='function')wrap.insertBefore(G.el,cvLeaf);else wrap.appendChild(G.el)}}

  // ---------- the document ----------
  function onDoc(ev){if(live.gone||!ev||SCN)return;var D=DOC();
   if(ev.type==='open'){freeAll();freeTex();SC=null;OBST=null;camSet=false;PREV=null;clearShot();if(D&&follow&&D.sel){cur.anm=D.sel.anm||null;cur.frame=D.sel.frame||0}load(true);return}
   if(ev.type==='close'){freeAll();freeTex();SC=null;OBST=null;camSet=false;PREV=null;clearShot();load(true);return}
   if(ev.type==='change'){var p=refreshPlan(ev.changed);if(p.tex){freeTex()}if(p.meshes)load(true);else if(p.pose)load(false);else if(p.tex){wantTex();dirty()}
    if(p.obst&&!p.meshes&&!p.pose)loadObst();return}
   if(ev.type==='hidden'){dirty();return}
   if(ev.type==='select'){var s=ev.sel||(D&&D.sel)||{};
    if(follow&&('anm' in s||'frame' in s)&&((s.anm||null)!==cur.anm||(Number(s.frame)||0)!==cur.frame)){cur.anm=s.anm||null;cur.frame=Number(s.frame)||0;load(false)}
    if('bone' in s)selBone=s.bone||null;if('volume' in s)hl=s.volume||null;if(G&&G.sync)G.sync();dirty()}}
  var D0=opts.doc===false||SCN?null:EXT_SCREENS.models.doc;if(D0&&typeof D0.on==='function'){try{live.off=D0.on(onDoc)}catch(e){}}
  if(DOC()&&follow&&D0.sel){cur.anm=D0.sel.anm||null;cur.frame=Number(D0.sel.frame)||0}
  if(DOC()&&D0.sel){selBone=D0.sel.bone||null;hl=D0.sel.volume||null}

  // ---------- methods (sub/README.md) ----------
  wrap.setPose=function(anm,frame){cur.anm=anm||null;cur.frame=Number(frame)||0;load()};
  wrap.setColors=function(c,fc){colors=c||{};faceColors=fc||{};if(SC)(SC.volumes||[]).forEach(function(v,i){if(VOL[i])volColours(VOL[i],v)});dirty()};
  wrap.highlight=function(id){hl=id==null?null:id;dirty()};
  wrap.setShow=function(s){for(var k in s||{})if(k in show){show[k]=k==='volColor'||k==='gridN'?s[k]:!!s[k]}syncBar();if(s&&(s.obstacles||s.areas))loadObst();dirty()};
  wrap.addLine=function(a,b,c){if(a&&b)lines.push({a:a,b:b,c:c});dirty()};
  wrap.clearLines=function(){lines=[];dirty()};
  // the result of a shot (armorsim effects) over the model: volumes by result, jets, fires, blasts; -> what was drawn and the result
  // fields that were missing for a drawing (sub/README.md). clearShot: gone (also when a model opens). The switch is show.shot.
  function clearShot(){SHOT=null;PLAN=null;shotLegend();dirty()}
  wrap.showShot=function(j){SHOT=j&&typeof j==='object'?j:null;PLAN=null;shotLegend();dirty();var p=plan();
   return p?{missing:p.missing.slice(),volumes:Object.keys(p.vols).length,jets:p.jets.length,fires:p.fires.length,blasts:p.blasts.length}:null};
  wrap.clearShot=clearShot;
  wrap.camera=function(){var c=P0(),B=camBasis(c);return {eye:B.e.slice(),dir:B.f.slice(),ortho:!!c.ortho}};   // the active pane's camera, read only
  // the scene shown, read only: the root bone's world, the middle and radius of the bounds, the middle of each volume
  wrap.sceneInfo=function(){if(!SC)return null;var b=bnds(),s=sub3(b.max,b.min),W=previewWorlds(SC,null),ctr={};
   (SC.volumes||[]).forEach(function(v,i){var w=W.vols[i];if(v&&v.id&&w)ctr[v.id]=VOL[i]?tp(w,volCtr(VOL[i])):w.slice(9,12)});
   var b0=SC.bones&&SC.bones[0];return {world:b0&&b0.world?b0.world.slice():null,middle:[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2],radius:Math.sqrt(dot3(s,s))/2,ctr:ctr}};
  wrap.reload=function(){freeAll();freeTex();SC=null;camSet=false;load()};
  // another model in the same view (a view made with doc:false and ctx.set.target): the old one goes, the new one loads
  wrap.setTarget=function(t){if(SCN||DOC()||!t)return false;set.target=String(t);if(stubbed)unstub();freeAll();freeTex();SC=null;camSet=false;load(true);return true};
  // the model shown as a picture: snapshot({width, height, camera?, wait?}, cb) -> cb(url | null, {camera, error?}). url = a PNG
  // data URL of width x height pixels with a see-through background (it sits on any tile colour, light or dark theme); only
  // the meshes are drawn (no grid, axes, bones, volumes, labels), shaded with their pictures. camera: a preview name of the
  // model's .mdl (default 'stuff', the one the game's inventory uses), false = always the fitted angle; see shotCam above.
  // The picture is taken when the scene and its pictures have arrived, or after wait ms (default 8000) with what is there;
  // null = no model or no WebGL picture. One at a time: a second call waits for the first. The view may be hidden or 0 x 0.
  // view: {az, el, roll, fov | ortho, fit: 'silhouette' (default) | 'box', margin, part} = a camera of its own fitted to the projected
  // mesh (viewCam), drawn with both faces and light: {az, el, amb, dif, sky, grade?} (viewLight, default LIGHT0; grade: snapGrade); info.fit = {box (pixels of the
  // fitted points), ortho, dist}. On null, info = {error, why: 'timeout' (no scene in time) | 'failed' (the scene route failed, detail =
  // its message) | 'nomesh' (a scene with no mesh) | 'nogl' (no WebGL picture)}
  function snapEnd(url,info){var s=SNAP;if(!s)return;SNAP=null;try{clearTimeout(s.timer)}catch(e){}try{clearInterval(s.poll)}catch(e){}
   try{s.cb(url,info||{})}catch(e){}if(SNAPQ.length){var n=SNAPQ.shift();snapStart(n.o,n.cb)}}
  // light.grade = {gamma, con, mid, tint:[r,g,b]}: a colour step on the drawn picture (unitcard camera.js, fitted per game on the
  // game cards): x = (c/255)^gamma, x = (x-mid)*con+mid, x *= tint; see-through pixels stay as they are. -> PNG data URL, null = none
  function snapGrade(g,w,h){var c2=document.createElement('canvas');c2.width=w;c2.height=h;var x2=c2.getContext&&c2.getContext('2d');if(!x2)return null;x2.drawImage(cv,0,0);
   var im=x2.getImageData(0,0,w,h),d=im.data,ga=Number(g.gamma)||1,co=g.con==null?1:Number(g.con),mi=g.mid==null?0.25:Number(g.mid),t=g.tint&&g.tint.length===3?g.tint.map(Number):[1,1,1],lut=[[],[],[]];
   for(var k=0;k<3;k++)for(var v=0;v<256;v++){var y=(Math.pow(v/255,ga)-mi)*co+mi;lut[k][v]=Math.max(0,Math.min(255,Math.round(y*t[k]*255)))}
   for(var i=0;i<d.length;i+=4){if(!d[i+3])continue;d[i]=lut[0][d[i]];d[i+1]=lut[1][d[i+1]];d[i+2]=lut[2][d[i+2]]}
   x2.putImageData(im,0,0);return c2.toDataURL('image/png')}
  function snapReady(){if(!SC)return false;for(var k in TEX)if(TEX[k]&&TEX[k].wait)return false;return true}
  // the points a view's picture is fitted on: every drawn mesh vertex in world space (at most about 120000, evenly thinned), or the
  // 8 corners of the bounds (view.fit 'box')
  function snapPts(fit){var W=previewWorlds(SC,PREV),tot=0,out=[];
   if(fit==='box'){var b=bnds();for(var k=0;k<8;k++)out.push(k&1?b.max[0]:b.min[0],k&2?b.max[1]:b.min[1],k&4?b.max[2]:b.min[2]);return out}
   MESH.forEach(function(m){m.hit.forEach(function(h){tot+=h.pos.length/3})});var st=Math.max(1,Math.ceil(tot/120000));
   MESH.forEach(function(m,mi){var bo=SC.bones[m.bone],mw=W.meshes[mi];if(!mw||(bo&&bo.visible===false)||!m.parts.length)return;
    m.hit.forEach(function(h){var p=h.pos;for(var i=0;i+2<p.length;i+=3*st){var w=tp(mw,[p[i],p[i+1],p[i+2]]);out.push(w[0],w[1],w[2])}})});return out}
  function snapTake(){var s=SNAP;if(!s)return;if(!SC||SC._noMesh){snapEnd(null,{error:'no model',why:SC?'nomesh':stubbed&&FAILM?'failed':'timeout',detail:FAILM});return}
   var url=null,how='',keep={},ow=cv.width,oh=cv.height,c=P0(),km=c.mode,kb=c.back,fit=null;
   try{SHOWK.forEach(function(k){keep[k]=show[k];show[k]=k==='meshes'});c.mode='shaded';cv.width=s.w;cv.height=s.h;
    if(s.view){c.back=true;CAMX=viewCam(s.view,snapPts(s.view.fit),s.w/s.h);if(!CAMX)throw new Error('nomesh');
     var lt=s.light||{},l0=LIGHT0;LIGHTX={dir:viewLight(s.view,{az:lt.az!=null?lt.az:l0.az,el:lt.el!=null?lt.el:l0.el}),amb:lt.amb!=null?Number(lt.amb):l0.amb,dif:lt.dif!=null?Number(lt.dif):l0.dif,sky:lt.sky!=null?Number(lt.sky):l0.sky};
     fit={box:CAMX.box.map(function(x,i){return Math.round(x*(i%2?s.h:s.w)*10)/10}),ortho:CAMX.ortho,dist:Math.round(CAMX.dist*100)/100}}
    else{var pv=SC.preview||null,nm=s.cam===false?null:String(s.cam||'stuff').toLowerCase(),pc=pv&&nm?(pv[nm]||pv.stuff||pv[Object.keys(pv)[0]]||null):null;CAMX=shotCam(pc,bnds(),s.w/s.h)}
    how=CAMX.how;BGA=0;LAST={};
    gl.enable(gl.SCISSOR_TEST);drawPane({i:L.active,x:0,y:0,w:s.w,h:s.h},s.h,null,1);gl.disable(gl.SCISSOR_TEST);
    url=s.light&&s.light.grade?snapGrade(s.light.grade,s.w,s.h):null;if(!url)url=typeof cv.toDataURL==='function'?cv.toDataURL('image/png'):null}catch(e){url=null}
   CAMX=null;LIGHTX=null;BGA=1;c.mode=km;c.back=kb;for(var k in keep)show[k]=keep[k];try{cv.width=ow;cv.height=oh}catch(e){}dirty();
   var ok=url&&String(url).indexOf('data:image')===0;snapEnd(ok?url:null,ok?(fit?{camera:how,fit:fit}:{camera:how}):{camera:how,error:'no picture',why:'nogl'})}
  // o.view (or o.sceneWait ms): patient: the scene may take long (a cold line-up); the picture waits for it up to sceneWait (default
  // 180000) and then for its pictures up to wait ms counted from the scene's arrival; else as before (wait counts from the call)
  function snapStart(o,cb){o=o||{};var pat=!!(o.view&&typeof o.view==='object')||Number(o.sceneWait)>0;
   SNAP={w:Math.max(1,Math.round(Number(o.width)||64)),h:Math.max(1,Math.round(Number(o.height)||64)),cam:o.camera,cb:cb||function(){},view:o.view&&typeof o.view==='object'?o.view:null,
    light:o.light&&typeof o.light==='object'?o.light:null,wait:Number(o.wait)>0?Number(o.wait):8000,t0:0};
   var s=SNAP;
   if(pat){s.timer=setTimeout(function(){if(SNAP===s&&!SC)snapEnd(null,{error:'no model',why:'timeout',detail:FAILM})},Number(o.sceneWait)>0?Number(o.sceneWait):180000);
    s.poll=setInterval(function(){if(SNAP!==s||!SC)return;if(!s.t0)s.t0=Date.now();if(snapReady()||Date.now()-s.t0>=s.wait)snapTake()},60)}
   else{s.timer=setTimeout(snapTake,s.wait);s.poll=setInterval(function(){if(SNAP&&snapReady())snapTake()},60)}
   if(stubbed&&!SC){snapEnd(null,{error:'no model',why:FAILM?'failed':'nogl',detail:FAILM});return}if(snapReady())snapTake()}
  wrap.snapshot=function(o,cb){if(SNAP){SNAPQ.push({o:o,cb:cb});return}snapStart(o,cb)};
  // a ready-made scene of many models: setScene({url, body}) shows another one (the picture stays until it arrives, the angle and
  // the pictures still named are kept); focusFigure(n) fits the active pane to the meshes of figure n (null: the whole scene),
  // kept for a scene still on its way -> true when shown now
  wrap.setScene=function(s){if(!s||!s.url)return false;if(!SCN)freeTex();SCN={url:String(s.url),body:s.body||{}};camSet=false;load(true);return true};
  wrap.focusFigure=function(n){if(!SCN)return false;if(n==null){FOCUS=null;if(SC){fitAll(P0());dirty()}return !!SC}
   FOCUS=Number(n);if(!SC||!FIG.figs[FOCUS])return false;fitBox(P0(),FIG.figs[FOCUS],asp0()||1.5,sceneRad());dirty();return true};
  // the one model of the view with another texture variant ('' or null: its plain textures): the pictures are asked again, the
  // meshes stay; a pane that shows no pictures is switched to Textured unless keepMode (quiet: only kept for the next model, setTarget follows).
  // -> true when the variant changed. Not for a scene (its meshes carry their own variant)
  wrap.setVariant=function(v,quiet,keepMode){v=v?String(v).toLowerCase():'';if(SCN||v===VARIANT)return false;VARIANT=v;if(quiet)return true;
   MESH.forEach(function(m){m.variant=VARIANT||null;m.parts.forEach(function(p){p.tk=tkOf(m,p)})});freeTex();legendDraw();
   if(SC&&!keepMode&&!texMode()){P0().mode='textured';syncBar()}wantTex();dirty();return true};
  wrap.variant=function(){return VARIANT};
  wrap.setMode=function(m){if(MODES.indexOf(m)>=0){P0().mode=m;wantTex();syncBar();dirty()}};
  wrap._st=function(){return {L:L,show:show,cur:cur,sel:{bone:selBone,volume:hl},SC:SC,seq:seq,PREV:PREV,PAL:PAL,G:G,LAST:LAST,mesh:MESH.length,tex:TEX,texBad:TEXBAD,menu:menu,host:host,shot:SHOT,plan:plan(),scene:SCN,figs:FIG,focus:FOCUS,meshes:MESH,texQ:{wait:TQ.length,run:TQN}}};
  wrap._ev={click:function(e,i){var R=paneRects(L,cv.clientWidth||1,cv.clientHeight||1);click(e,R.filter(function(r){return r.i===(i==null?L.active:i)})[0]||R[0])},onDoc:onDoc,draw:draw,theme:theme,viewInfo:viewInfo,hidBone:hidBone,hidVol:hidVol,
   prefs:function(){return {fov:FOV,grid:GRIDM}},obst:function(){return OBST}};
  wrap.appendChild(leaf('note',[note],{'data-blkname':bnm('note')}));
  info.textContent=tx('models.viewer.hint');
  // opts.compact: only the canvas (a small pane in a row of several, the Units page line-up): the bars, handles, readout, hints
  // and key list are hidden; mouse orbit, zoom and the keys of the focused canvas still work
  if(opts.compact){var ck=wrap.children||wrap.childNodes||[];for(var ci=0;ci<ck.length;ci++)if(ck[ci]!==cvLeaf)ck[ci].hidden=true;
   // a compact scene has no bar and no help line: the picture's own tip says how to turn, zoom and fit all (double click)
   if(SCN)cv.setAttribute('title',tx('models.viewer.sceneTip'))}
  syncBar();load();dirty();
  return wrap}
 // ---------- pictures of many models (sub/README.md "Pictures of models") ----------
 // viewer.pictures({sig, mod}) -> {get(target, width, height, cb, camera?, variant?), peek(target, width, height, camera?, variant?), clear(), stats()}.
 // variant: the texture variant the model is drawn with (a skin's own {texmod}, sub/look.server.js); none: its plain textures.
 // One hidden view renders the models one after the other (one WebGL context, one scene request at a time) and each picture is
 // kept in memory for the page session under sig() + target + size + camera, so a model is rendered once. sig(): a string that
 // changes with the game and the mod (the caller's data signature); mod(): the mod folder for the requests (none: the page's).
 // get: cb(url | null, info) at once when the picture is kept, else when its turn has come; the same picture asked twice while
 // it waits is rendered once. Nothing here blocks the caller: draw the tile first, set the picture in cb
 viewer.pictures=function(o){o=o||{};var C={},Q=[],busy=false,V=null,host=null,dead=false,ctx={set:{target:null},mod:null},made=0;
  function sig(){try{return typeof o.sig==='function'?String(o.sig()):''}catch(e){return ''}}
  function keyOf(t,w,hh,cam,va){return [sig(),t,w,hh,cam===false?'-':cam||'stuff'].join('|')+(va?'|#'+va:'')}
  function done(j,url,info){C[j.k]={url:url,info:info||{}};j.cbs.forEach(function(cb){try{cb(url,info||{})}catch(e){}})}
  function pump(){if(busy||!Q.length)return;var j=Q.shift();busy=j;
   try{ctx.mod=typeof o.mod==='function'?o.mod()||null:null;
    if(!V&&!dead){ctx.set.target=j.t;host=h('div',{'aria-hidden':'true',style:'position:absolute;left:-9999px;top:0;width:64px;height:64px;overflow:hidden;visibility:hidden'});
     var at=(typeof document!=='undefined'&&(document.body||document.documentElement))||null;if(at&&typeof at.appendChild==='function')at.appendChild(host);
     V=viewer(ctx,{doc:false,compact:true,pose:false,height:64,blk:'pictures',variant:j.v||'',show:{grid:false,axes:false,volumes:false,bones:false,names:false,volNames:false,entities:false,bounds:false}});host.appendChild(V);
     if(typeof V.snapshot!=='function')dead=true}
    else if(!dead){V.setVariant(j.v||'',true);V.setTarget(j.t)}}catch(e){dead=true}
   if(dead){busy=false;done(j,null,{error:'no WebGL'});pump();return}
   V.snapshot({width:j.w,height:j.h,camera:j.cam,wait:o.wait},function(url,info){made++;busy=false;done(j,url,info);pump()})}
  return {get:function(t,w,hh,cb,cam,va){t=String(t||'');w=Math.round(w)||64;hh=Math.round(hh)||64;va=va?String(va).toLowerCase():'';var k=keyOf(t,w,hh,cam,va);if(!t){cb(null,{error:'no model'});return}
    if(C[k]){cb(C[k].url,C[k].info);return}
    for(var i=0;i<Q.length;i++)if(Q[i].k===k){Q[i].cbs.push(cb);return}
    if(busy&&busy.k===k){busy.cbs.push(cb);return}
    Q.push({k:k,t:t,w:w,h:hh,cam:cam,v:va,cbs:[cb]});pump()},
   peek:function(t,w,hh,cam,va){var c=C[keyOf(String(t||''),Math.round(w)||64,Math.round(hh)||64,cam,va?String(va).toLowerCase():'')];return c?c.url:undefined},
   clear:function(){C={}},stats:function(){return {kept:Object.keys(C).length,waiting:Q.length,made:made,busy:!!busy}}}};
 viewer._t={m4:m4,xf:xf,mul4:mul4,inv3:inv3,toLocal:toLocal,rayBox:rayBox,raySph:raySph,rayCyl:rayCyl,rayTri:rayTri,hitVol:hitVol,pick:pick,pickAll:pickAll,sideOf:sideOf,geoBox:geoBox,geoCyl:geoCyl,tint:tint,
  tp:tp,mul12:mul12,inv12:inv12,pickMesh:pickMesh,aabbOf:aabbOf,nearPt:nearPt,newCam:newCam,setView:setView,camBasis:camBasis,camMat:camMat,camRay:camRay,project:project,upp:upp,
  engineFrame:engineFrame,shotCam:shotCam,viewCam:viewCam,viewLight:viewLight,LIGHT0:LIGHT0,frameTo:frameTo,fitBox:fitBox,rowView:rowView,figBoxes:figBoxes,pickFigure:pickFigure,fdir:fdir,TEXQ:TEXQ,zoom:zoom,orbit:orbit,rollPitch:rollPitch,pan:pan,dolly:dolly,flyLook:flyLook,flyMove:flyMove,newLayout:newLayout,paneRects:paneRects,paneAt:paneAt,nextPane:nextPane,
  toggleQuad:toggleQuad,maximise:maximise,refreshPlan:refreshPlan,meshSig:meshSig,previewWorlds:previewWorlds,outline2:outline2,gridAxes:gridAxes,parseCol:parseCol,palette:palette,
  edgesOf:edgesOf,groundAt:groundAt,GROUNDMIN:GROUNDMIN,shotPlan:shotPlan,shotIds:shotIds,shotLabels:shotLabels,placeTags:placeTags,ringSegs:ringSegs,viewingOf:viewingOf,setViewing:setViewing,gridResize:gridResize,defShow:defShow,VIEWS:VIEWS,MODES:MODES,FIXED:FIXED,ZSTEPS:ZSTEPS};
 // the headless card render (tools/unitcard/render.js) reaches the view factory here; the page itself goes through EXT_SCREENS
 try{if(typeof window!=='undefined'&&window)window.__as2viewer=viewer}catch(e){}
 return viewer})();
`;
