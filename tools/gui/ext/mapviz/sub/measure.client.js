// Map Viewer measure tool (MV-PG1, second half): distance in metres along a polyline, the bearing (clockwise from north,
// screen up = +world y) and the height change, from points clicked on the map (mouse, or the keyboard cursor and Enter)
// or typed in metres 11.3). Every value is repeated in a DOM list. Esc ends the tool (the shell
// calls end); the points stay until Clear or the next start. Heights come from the page's height store (hover part).
// Nothing is written; no call is made on a LAN Remote device (the shell does not start the parts there).
// Author: Imperator_Aug (ARSENAL, ia-95557291)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
MV.parts.push({id:'measure',init:function(V){
 if(V.q('rmt')||!MV.heights)return;
 var K=MV.heights.kit,H=MV.heights.of(V),st={pts:[],on:false,hover:null,map:null},el={};
 function say(k,a){if(el.msg)el.msg.textContent=k?tx(k,a||{}):''}
 // add(p, typed) -> true when the point was taken; a refused point is told and leaves the list as it was
 function add(p,typed){var e=K.checkPt(V.doc,p,st.pts.length?st.pts[st.pts.length-1]:null);if(e){say('mapviz.measure.'+e);return false}
  st.pts.push([p[0],p[1]]);H.ensure();say(typed?'mapviz.measure.added':'');draw();V.redraw();return true}
 function hz(p){var z=H.heightAt(p[0],p[1]);return typeof z==='number'?z:null}
 // sums(pts) -> {legs:[{d, bearing, dz}], total, straight, bearing, dz}
 function sums(){var legs=[],tot=0,i,P=st.pts;for(i=1;i<P.length;i++){var s=K.seg(P[i-1],P[i]),za=hz(P[i-1]),zb=hz(P[i]);tot+=s.d;legs.push({d:s.d,bearing:s.bearing,dz:za!=null&&zb!=null?zb-za:null})}
  var o={legs:legs,total:tot,straight:null,bearing:null,dz:null};
  if(P.length>1){var f=K.seg(P[0],P[P.length-1]),z0=hz(P[0]),z1=hz(P[P.length-1]);o.straight=f.d;o.bearing=f.bearing;o.dz=z0!=null&&z1!=null?z1-z0:null}
  return o}
 // deg(b): one decimal; a bearing just west of north that rounds up to 360.0 is said as 0.0
 function deg(b){if(b==null)return '?';var s=K.fx(b,1);return s==='360.0'?'0.0':s}
 function draw(){if(!el.list)return;el.list.textContent='';el.legs.textContent='';el.sum.textContent='';var P=st.pts;
  if(!P.length){el.list.appendChild(h('li',{class:'hint',text:tx('mapviz.measure.none')}));return}
  P.forEach(function(p,i){el.list.appendChild(h('li',{text:tx('mapviz.measure.point',{n:i+1,x:K.mtr(p[0],1),y:K.mtr(p[1],1)})}))});
  var o=sums(),noH=false;
  o.legs.forEach(function(l,i){var a={n:i+1,d:K.mtr(l.d,2),b:deg(l.bearing)};if(l.dz==null)noH=true;else a.dz=K.sgn(l.dz,2);
   el.legs.appendChild(h('li',{text:tx(l.dz==null?'mapviz.measure.legNoH':'mapviz.measure.leg',a)}))});
  if(P.length<2)return;
  // a missing height: the heights are not read yet, or (heights read) a point has no ground under it (nodata, R16)
  var noK=H.ready()?'mapviz.measure.noGround':'mapviz.measure.noHeight';
  function ln(id,nk,text,cls){el.sum.appendChild(h('p',{blk:'mv.measure.'+id,'class':cls||null,'data-blkname':tx(nk),text:text}))}
  ln('total','mapviz.measure.blk.total',tx('mapviz.measure.total',{d:K.mtr(o.total,2),n:o.legs.length}));
  ln('straight','mapviz.measure.blk.straight',tx('mapviz.measure.straight',{d:K.mtr(o.straight,2),b:deg(o.bearing)}));
  ln('rise','mapviz.measure.blk.rise',o.dz==null?tx(noK):tx('mapviz.measure.rise',{dz:K.sgn(o.dz,2)}));
  if(noH&&o.dz!=null)ln('noh','mapviz.measure.blk.noh',tx(noK),'hint')}
 function clear(){st.pts=[];st.hover=null;say('');draw();V.redraw()}
 function undo(){if(st.pts.length){st.pts.pop();draw();V.redraw()}}
 function typed(){var r=K.parsePt(el.x.value,el.y.value);if(r.err){say('mapviz.measure.badNum');return}if(add(r.pt,true)){el.x.value='';el.y.value=''}}
 function field(id,k,ctl){var t=tx(k);return h('div',{class:'fld',blk:'mv.measure.'+id,'data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),ctl,h('span')])])}
 V.addPanel({id:'measure',side:'bottom',build:function(box){
  el.x=h('input',{type:'text',inputmode:'decimal',size:'8',autocomplete:'off'});
  el.y=h('input',{type:'text',inputmode:'decimal',size:'8',autocomplete:'off',onkeydown:function(e){if(e&&e.key==='Enter'){typed();if(e.preventDefault)e.preventDefault()}}});
  el.msg=h('p',{blk:'mv.measure.msg',class:'hint',role:'status','aria-live':'polite','data-blkname':tx('mapviz.measure.blk.msg')});
  el.list=h('ol',{'aria-label':tx('mapviz.measure.points')});
  el.legs=h('ol',{'aria-label':tx('mapviz.measure.legs')});
  el.sum=h('div',{blk:'mv.measure.sum',box:'col','aria-live':'polite','data-blkname':tx('mapviz.measure.blk.sum')});
  box.appendChild(h('div',{blk:'mv.measure.title','data-blkname':tx('mapviz.measure.title')},[h('h3',{text:tx('mapviz.measure.title')})]));
  box.appendChild(h('p',{blk:'mv.measure.help',class:'hint','data-blkname':tx('mapviz.measure.blk.help'),text:tx('mapviz.measure.help')}));
  box.appendChild(h('div',{blk:'mv.measure.typed',box:'row','data-blkname':tx('mapviz.measure.blk.typed')},[field('x','mapviz.measure.x',el.x),field('y','mapviz.measure.y',el.y),
   h('div',{blk:'mv.measure.go','data-blkname':tx('mapviz.measure.blk.go')},[h('button',{type:'button',text:tx('mapviz.measure.add'),onclick:function(){typed()}})])]));
  box.appendChild(h('div',{blk:'mv.measure.bar',class:'row','data-blkname':tx('mapviz.measure.blk.bar')},[h('button',{type:'button',text:tx('mapviz.measure.undo'),onclick:function(){undo()}}),
   h('button',{type:'button',text:tx('mapviz.measure.clear'),onclick:function(){clear()}})]));
  box.appendChild(el.msg);
  // the two lists and the sums: a container of leaves (the points, the legs, the sums box)
  box.appendChild(h('div',{blk:'mv.measure.lists',box:'col','data-blkname':tx('mapviz.measure.blk.lists')},[
   h('div',{blk:'mv.measure.pts','data-blkname':tx('mapviz.measure.points')},[h('b',{text:tx('mapviz.measure.points')}),el.list]),
   h('div',{blk:'mv.measure.legl','data-blkname':tx('mapviz.measure.legs')},[h('b',{text:tx('mapviz.measure.legs')}),el.legs]),el.sum]));
  draw()}});
 // the line on the map: casing, line, a dot per point, a dashed piece to the cursor while the tool is on. The layer gives
 // no item list: the panel's own lists repeat the points. Its id is the tool id, so the shell keeps it out of the permalink
 function line(ctx,view,pts,dash){if(pts.length<2)return;var pal=V.pal&&V.pal.marks||{},i,p;
  var pass=[[K.css(pal.measureCasing)||view.token('bg'),4],[K.css(pal.measure)||view.token('fg'),2]];
  pass.forEach(function(s){ctx.beginPath();for(i=0;i<pts.length;i++){p=view.toScreen(pts[i][0],pts[i][1]);if(i)ctx.lineTo(p[0],p[1]);else ctx.moveTo(p[0],p[1])}
   if(ctx.setLineDash)ctx.setLineDash(dash?[6,4]:[]);ctx.strokeStyle=s[0];ctx.lineWidth=s[1];ctx.stroke()});
  if(ctx.setLineDash)ctx.setLineDash([])}
 // as the game sees it: flat lengths and bearings are plain geometry in world units, and the heights are bilinear between
 // the height lattice samples exactly as the game's height lookup [V]
 V.addLayer({id:'measure',group:'tools',label:'mapviz.measure.layer',engineTrue:true,defaultOn:true,
  draw:function(ctx,view){if(!ctx||!ctx.beginPath||!st.pts.length)return;var pal=V.pal&&V.pal.marks||{};
   line(ctx,view,st.pts,false);if(st.on&&st.hover)line(ctx,view,[st.pts[st.pts.length-1],st.hover],true);
   st.pts.forEach(function(q){var p=view.toScreen(q[0],q[1]);ctx.beginPath();ctx.arc(p[0],p[1],3.5,0,Math.PI*2);ctx.fillStyle=K.css(pal.measure)||view.token('fg');ctx.fill();
    ctx.strokeStyle=K.css(pal.measureCasing)||view.token('bg');ctx.lineWidth=1.5;ctx.stroke()})}});
 V.addTool({id:'measure',label:'mapviz.measure.tool',key:'m',
  start:function(){st.pts=[];st.hover=null;st.on=true;say('mapviz.measure.started');draw();V.redraw()},
  move:function(x,y){if(!st.on)return;st.hover=[x,y];if(st.pts.length)V.redraw()},
  click:function(x,y){if(st.on)add([x,y],false)},
  end:function(){st.on=false;st.hover=null;say(st.pts.length?'mapviz.measure.ended':'');V.redraw()}});
 H.on(function(){if(st.pts.length>1)draw()});
 V.on('map',function(d){var k=d&&d.key?String(d.key):'';if(k!==st.map){st.map=k;st.pts=[];st.hover=null;draw()}});
}});
})();
`;
