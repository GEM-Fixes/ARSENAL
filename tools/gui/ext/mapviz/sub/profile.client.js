// Map Viewer height profile (MV-PG1, second half): the ground heights between two points (clicked, keyboard cursor and
// Enter, or typed in metres) with the straight sight line from eye height over the first point to the same height over the
// last one. Terrain only, and the page says so: objects are the fire line of wave C. Heights come from the page's height
// store (hover part, README 5.6 hover pack). The chart is a small canvas of its own; with no canvas context the values
// table is shown instead (it is always there for screen readers behind "Show the values"). The cursor on the chart, its
// arrow keys or a table row put a mark on the map at that spot. Nothing is written.
// Author: Imperator_Aug (ARSENAL, ia-23d2d14c)
module.exports = String.raw`
(function(){
var MV=EXT_SCREENS.mapviz;if(!MV||!MV.parts)return;
MV.parts.push({id:'profile',init:function(V){
 if(V.q('rmt')||!MV.heights)return;
 var K=MV.heights.kit,H=MV.heights.of(V),EYE=['stand','kneel','prone'],ROWS=60,CW=480,CH=170,PL=44,PR=10,PT=10,PB=22;
 var st={a:null,b:null,on:false,hover:null,prof:null,sight:null,eye:'stand',mark:null,open:false,map:null},el={},cv=null,cx=null;
 var STATEK={'mapviz.profile.pickA':1,'mapviz.profile.pickB':1,'mapviz.profile.wait':1,'mapviz.profile.need':1,'mapviz.profile.making':1,'mapviz.profile.fault':1,'mapviz.profile.badLayer':1};
 function say(k,a){st.msgK=k||null;if(el.msg)el.msg.textContent=k?tx(k,a||{}):''}
 function eyeU(){return K.EYES[st.eye]*K.UPM}
 function compute(){st.prof=null;st.sight=null;st.mark=null;if(!st.a||!st.b){render();return}
  if(!H.ready()){H.ensure();render();return}
  st.prof=K.profileOf(H.pack,st.a,st.b,800);st.sight=st.prof?K.sightOf(st.prof,eyeU()):null;render();V.redraw()}
 function setPts(a,b){var e=K.checkPt(V.doc,a,null)||K.checkPt(V.doc,b,a);if(e){say('mapviz.profile.'+e);return false}st.a=a;st.b=b;say('');compute();return true}
 // ---- the panel ----
 function field(id,k,ctl){var t=tx(k);return h('div',{class:'fld',blk:'mv.profile.'+id,'data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),ctl,h('span')])])}
 function inp(){return h('input',{type:'text',inputmode:'decimal',size:'7',autocomplete:'off'})}
 function typed(){var a=K.parsePt(el.ax.value,el.ay.value),b=K.parsePt(el.bx.value,el.by.value);if(a.err||b.err){say('mapviz.profile.badNum');return}setPts(a.pt,b.pt)}
 V.addPanel({id:'profile',side:'bottom',build:function(box){
  el.ax=inp();el.ay=inp();el.bx=inp();el.by=inp();
  el.eye=h('select',{onchange:function(){st.eye=K.EYES[el.eye.value]?el.eye.value:'stand';if(st.prof){st.sight=K.sightOf(st.prof,eyeU());render();V.redraw()}}},
   EYE.map(function(k){return h('option',{value:k,text:tx('mapviz.profile.eye.'+k)})}));el.eye.value=st.eye;
  el.msg=h('p',{blk:'mv.profile.msg',class:'hint',role:'status','aria-live':'polite','data-blkname':tx('mapviz.profile.blk.msg')});
  el.sum=h('div',{blk:'mv.profile.sum',box:'col','aria-live':'polite','data-blkname':tx('mapviz.profile.blk.sum')});
  el.mark=h('p',{blk:'mv.profile.mark',class:'hint','aria-live':'polite','data-blkname':tx('mapviz.profile.blk.mark')});
  cv=h('canvas',{width:String(CW),height:String(CH),tabindex:'0',role:'img','aria-label':tx('mapviz.profile.chart'),style:'width:100%;max-width:640px;display:block'});
  try{cx=cv.getContext?cv.getContext('2d'):null}catch(e){cx=null}
  if(cx&&!(cx.beginPath&&cx.lineTo&&cx.stroke&&cx.fillRect))cx=null;
  // the values table sits in a leaf of its own (a table is never a block itself); the leaf is what hides
  el.tbl=h('table',{'aria-label':tx('mapviz.profile.table')});
  el.table=h('div',{blk:'mv.profile.table','data-blkname':tx('mapviz.profile.table')},[el.tbl]);
  el.toggle=cx?h('button',{type:'button','aria-expanded':'false',text:tx('mapviz.profile.showTable'),onclick:function(){st.open=!st.open;render()}}):null;
  box.appendChild(h('div',{blk:'mv.profile.title','data-blkname':tx('mapviz.profile.title')},[h('h3',{text:tx('mapviz.profile.title')})]));
  box.appendChild(h('p',{blk:'mv.profile.help',class:'hint','data-blkname':tx('mapviz.profile.blk.help'),text:tx('mapviz.profile.help')}));
  box.appendChild(h('div',{blk:'mv.profile.typed',box:'row','data-blkname':tx('mapviz.profile.blk.typed')},[field('ax','mapviz.profile.ax',el.ax),field('ay','mapviz.profile.ay',el.ay),
   field('bx','mapviz.profile.bx',el.bx),field('by','mapviz.profile.by',el.by),
   h('div',{blk:'mv.profile.go','data-blkname':tx('mapviz.profile.blk.go')},[h('button',{type:'button',text:tx('mapviz.profile.show'),onclick:function(){typed()}})])]));
  box.appendChild(field('eye','mapviz.profile.eye',el.eye));
  box.appendChild(el.msg);box.appendChild(el.sum);
  box.appendChild(cx?h('div',{blk:'mv.profile.chart','data-blkname':tx('mapviz.profile.blk.chart')},[cv]):h('p',{blk:'mv.profile.nochart',class:'hint','data-blkname':tx('mapviz.profile.blk.chart'),text:tx('mapviz.profile.noChart')}));
  el.toggleBox=el.toggle?h('div',{blk:'mv.profile.toggle','data-blkname':tx('mapviz.profile.blk.toggle')},[el.toggle]):null;
  box.appendChild(el.mark);if(el.toggleBox)box.appendChild(el.toggleBox);box.appendChild(el.table);
  if(cx){cv.addEventListener('mousemove',function(e){var r=cv.getBoundingClientRect?cv.getBoundingClientRect():{left:0,top:0},sc=cv.clientWidth>0?cv.width/cv.clientWidth:1;markAtPx(((e.clientX||0)-(r.left||0))*sc)});
   cv.addEventListener('keydown',function(e){var n=st.prof?st.prof.pts.length-1:0,k=st.mark==null?0:st.mark,step=e.shiftKey?10:1,go=null;if(!st.prof)return;
    if(e.key==='ArrowLeft')go=k-step;else if(e.key==='ArrowRight')go=st.mark==null?0:k+step;else if(e.key==='Home')go=0;else if(e.key==='End')go=n;
    if(go!=null){setMark(Math.max(0,Math.min(n,go)));if(e.preventDefault)e.preventDefault()}})}
  render()}});
 function markAtPx(px){if(!st.prof)return;var n=st.prof.pts.length-1,pw=CW-PL-PR,t=(px-PL)/pw;setMark(Math.max(0,Math.min(n,Math.round(t*n))))}
 function setMark(k){if(!st.prof)return;st.mark=k;var p=st.prof.pts[k];
  if(el.mark)el.mark.textContent=p.z==null?tx('mapviz.profile.markNoGround',{d:K.mtr(p.d,2)}):tx('mapviz.profile.markAt',{d:K.mtr(p.d,2),z:K.mtr(p.z,2)});chart();V.redraw()}
 // status(): the line for the tool's state; a message the user caused (a refused point) stays until the next action
 function status(){if(st.msgK&&!STATEK[st.msgK])return;if(!st.a||!st.b){say(st.on?(st.a?'mapviz.profile.pickB':'mapviz.profile.pickA'):'');return}
  if(st.prof){say('');return}
  // the job that makes the heights runs (this part's press or another's): its words, no second button (W3)
  var rt=(H.state==='need'||H.state==='making')&&typeof H.runText==='function'?H.runText():null;
  if(rt)say('mapviz.profile.making',{job:rt});
  else if(H.state==='need'){say('mapviz.profile.need');el.msg.appendChild(h('span',{},[h('span',{text:' '}),h('button',{type:'button',text:tx('mapviz.profile.make'),onclick:function(){H.makeAll()}})]))}
  else if(H.state==='error'&&H.err&&H.err.code==='layer')say('mapviz.profile.badLayer',{what:K.word('mapviz.hover.lay.'+H.err.layer,String(H.err.layer))});
  else if(H.state==='error')say('mapviz.profile.fault',{msg:H.err&&H.err.msg?H.err.msg:tx('mapviz.profile.noHeights')});
  else say('mapviz.profile.wait')}
 // each line of the summary is a leaf of its own (the summary is a container block)
 function sumLine(id,nk,text,cls){return h('p',{blk:'mv.profile.'+id,'class':cls||null,'data-blkname':tx(nk),text:text})}
 function render(){if(!el.sum)return;status();el.sum.textContent='';el.tbl.textContent='';if(el.mark&&st.mark==null)el.mark.textContent='';
  var pr=st.prof,s=st.sight;
  if(pr){el.sum.appendChild(sumLine('len','mapviz.profile.blk.len',tx('mapviz.profile.len',{d:K.mtr(pr.len,2)})));
   if(pr.hi!=null)el.sum.appendChild(sumLine('range','mapviz.profile.blk.range',tx('mapviz.profile.range',{lo:K.mtr(pr.lo,2),hi:K.mtr(pr.hi,2),at:K.mtr(pr.hiAt,2)})));
   // no ground (nodata heights past the map's ground mesh): such stretches are left out of the heights and the sight line
   if(pr.hi==null)el.sum.appendChild(sumLine('gap','mapviz.profile.blk.gap',tx('mapviz.profile.noGround')));
   else if(pr.miss)el.sum.appendChild(sumLine('gap','mapviz.profile.blk.gap',tx('mapviz.profile.gap')));
   var e=K.fx(K.EYES[st.eye],2);
   if(!s)el.sum.appendChild(sumLine('sight','mapviz.profile.blk.sight',tx('mapviz.profile.noSight')));
   else if(s.clear)el.sum.appendChild(sumLine('sight','mapviz.profile.blk.sight',tx('mapviz.profile.clear',{eye:e})));
   else el.sum.appendChild(sumLine('sight','mapviz.profile.blk.sight',tx('mapviz.profile.blocked',{eye:e,at:K.mtr(s.first.d,2),over:K.mtr(s.first.over,2)})));
   el.sum.appendChild(sumLine('terrain','mapviz.profile.blk.terrain',tx('mapviz.profile.terrain'),'hint'));
   table()}
  var show=!!pr&&(!cx||st.open);el.table.hidden=!show;
  if(el.toggle){el.toggle.hidden=!pr;el.toggleBox.hidden=!pr;el.toggle.textContent=tx(st.open?'mapviz.profile.hideTable':'mapviz.profile.showTable');el.toggle.setAttribute('aria-expanded',st.open?'true':'false')}
  chart()}
 // the values table: at most ROWS rows (every k-th sample, the highest point and the first blocked point always in)
 function table(){var pr=st.prof,s=st.sight,n=pr.pts.length-1,step=Math.max(1,Math.ceil(n/ROWS)),ks=[],seen={},i;
  function put(k){if(k!=null&&!seen[k]&&k>=0&&k<=n){seen[k]=1;ks.push(k)}}
  for(i=0;i<=n;i+=step)put(i);put(n);if(s&&s.first)put(s.first.k);pr.pts.forEach(function(p,k){if(p.z!=null&&p.z===pr.hi)put(k)});ks.sort(function(a,b){return a-b});
  el.tbl.appendChild(h('thead',{},[h('tr',{},[h('th',{scope:'col',text:tx('mapviz.profile.colD')}),h('th',{scope:'col',text:tx('mapviz.profile.colH')}),h('th',{scope:'col',text:tx('mapviz.profile.colS')})])]));
  var tb=h('tbody',{});ks.forEach(function(k){var p=pr.pts[k];
   tb.appendChild(h('tr',{},[h('td',{},[h('button',{type:'button',class:'link',title:tx('mapviz.profile.markT'),text:K.mtr(p.d,2),onclick:function(){setMark(k)}})]),
    h('td',{text:p.z==null?tx('mapviz.profile.noGroundCell'):K.mtr(p.z,2)}),h('td',{text:s?K.mtr(K.lineAt(s,pr,p.d),2):'?'})]))});
  el.tbl.appendChild(tb)}
 // the chart (guarded: no context, or a context that throws, draws nothing)
 function chart(){if(!cx)return;try{var pr=st.prof,s=st.sight,pal=V.pal||{},mk=pal.marks||{},W=CW,Hh=CH,pw=W-PL-PR,ph=Hh-PT-PB;
  if(cv.width!==W)cv.width=W;if(cv.height!==Hh)cv.height=Hh;
  if(cx.setLineDash)cx.setLineDash([]);cx.globalAlpha=1;cx.fillStyle=V.token('card')||V.token('bg');cx.fillRect(0,0,W,Hh);
  cx.strokeStyle=V.token('line');cx.lineWidth=1;cx.beginPath();cx.moveTo(PL,PT);cx.lineTo(PL,PT+ph);cx.lineTo(PL+pw,PT+ph);cx.stroke();
  if(!pr||pr.lo==null)return;
  var lo=pr.lo,hi=pr.hi;if(s){lo=Math.min(lo,s.ya,s.yb);hi=Math.max(hi,s.ya,s.yb)}if(hi-lo<20){var md=(hi+lo)/2;lo=md-10;hi=md+10}var pd=(hi-lo)*0.08;lo-=pd;hi+=pd;
  var X=function(d){return PL+d/pr.len*pw},Y=function(z){return PT+(hi-z)/(hi-lo)*ph};
  if(cx.fillText){cx.fillStyle=V.token('fg');cx.font='11px sans-serif';cx.fillText(K.mtr(hi,1),2,PT+9);cx.fillText(K.mtr(lo,1),2,PT+ph);cx.fillText('0',PL,Hh-6);cx.fillText(K.mtr(pr.len,1),PL+pw-28,Hh-6)}
  var stops=pal.height&&pal.height.stops,fill=K.css(stops&&stops[1]&&stops[1].color),line=K.css(mk.profile)||V.token('fg'),k,p,open=false;
  // the ground fill and line break over each stretch with no ground (nodata): one closed shape per stretch that has ground
  var rs=K.runs(pr);
  if(fill&&rs.length){cx.beginPath();rs.forEach(function(r){cx.moveTo(X(pr.pts[r[0]].d),PT+ph);for(var q=r[0];q<=r[1];q++)cx.lineTo(X(pr.pts[q].d),Y(pr.pts[q].z));
    cx.lineTo(X(pr.pts[r[1]].d),PT+ph);if(cx.closePath)cx.closePath()});
   cx.globalAlpha=0.45;cx.fillStyle=fill;cx.fill();cx.globalAlpha=1}
  cx.beginPath();open=false;for(k=0;k<pr.pts.length;k++){p=pr.pts[k];if(p.z==null){open=false;continue}if(open)cx.lineTo(X(p.d),Y(p.z));else{cx.moveTo(X(p.d),Y(p.z));open=true}}
  cx.strokeStyle=line;cx.lineWidth=1.5;cx.stroke();
  if(s){var ok=K.css(pal.sight&&pal.sight.ring)||V.token('acc'),dz=pal.danger&&pal.danger.stops,bad=K.css(dz&&dz[dz.length-1]&&dz[dz.length-1].color)||V.token('err');
   var cut=s.first?s.first.d:pr.len;cx.lineWidth=1.5;if(cx.setLineDash)cx.setLineDash([5,3]);
   cx.beginPath();cx.moveTo(X(0),Y(s.ya));cx.lineTo(X(cut),Y(K.lineAt(s,pr,cut)));cx.strokeStyle=ok;cx.stroke();
   if(s.first){cx.beginPath();cx.moveTo(X(cut),Y(K.lineAt(s,pr,cut)));cx.lineTo(X(pr.len),Y(s.yb));cx.strokeStyle=bad;cx.stroke();
    if(cx.setLineDash)cx.setLineDash([]);cx.beginPath();cx.arc(X(cut),Y(s.first.over+K.lineAt(s,pr,cut)),4,0,Math.PI*2);cx.strokeStyle=bad;cx.stroke()}
   if(cx.setLineDash)cx.setLineDash([])}
  if(st.mark!=null&&pr.pts[st.mark]){p=pr.pts[st.mark];var cc=K.css(mk.cursor)||V.token('fg');cx.strokeStyle=cc;cx.lineWidth=1;cx.beginPath();cx.moveTo(X(p.d),PT);cx.lineTo(X(p.d),PT+ph);cx.stroke();
   if(p.z!=null){cx.beginPath();cx.arc(X(p.d),Y(p.z),3.5,0,Math.PI*2);cx.fillStyle=cc;cx.fill()}}
 }catch(e){}}
 // ---- on the map ----
 function dot(ctx,view,q,r,col,fillIt){var p=view.toScreen(q[0],q[1]);ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);if(fillIt){ctx.fillStyle=col;ctx.fill()}else{ctx.strokeStyle=col;ctx.lineWidth=2;ctx.stroke()}}
 function seg(ctx,view,a,b,col,w,dash){var p=view.toScreen(a[0],a[1]),q=view.toScreen(b[0],b[1]);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);
  if(ctx.setLineDash)ctx.setLineDash(dash?[6,4]:[]);ctx.strokeStyle=col;ctx.lineWidth=w;ctx.stroke();if(ctx.setLineDash)ctx.setLineDash([])}
 // an estimate: the ground samples are the engine's bilinear heights, but the sight line is a straight line over bare
 // ground from an assumed eye height; the game tests sight against its sight grid with object tops (rules/sight), which
 // the profile leaves out, so the line can say clear where the game is blocked
 V.addLayer({id:'profile',group:'tools',label:'mapviz.profile.layer',engineTrue:false,defaultOn:true,
  draw:function(ctx,view){if(!ctx||!ctx.beginPath||!st.a)return;var pal=V.pal||{},mk=pal.marks||{},line=K.css(mk.profile)||view.token('fg'),cas=K.css(mk.measureCasing)||view.token('bg');
   if(st.b){seg(ctx,view,st.a,st.b,cas,4,false);seg(ctx,view,st.a,st.b,line,2,false)}else if(st.on&&st.hover)seg(ctx,view,st.a,st.hover,line,2,true);
   dot(ctx,view,st.a,4,line,true);if(st.b)dot(ctx,view,st.b,4,line,false);
   if(st.sight&&st.sight.first){var dz=pal.danger&&pal.danger.stops;dot(ctx,view,[st.sight.first.x,st.sight.first.y],6,K.css(dz&&dz[dz.length-1]&&dz[dz.length-1].color)||view.token('err'),false)}
   if(st.prof&&st.mark!=null&&st.prof.pts[st.mark]){var m=st.prof.pts[st.mark];dot(ctx,view,[m.x,m.y],5,K.css(mk.cursor)||view.token('fg'),true)}}});
 V.addTool({id:'profile',label:'mapviz.profile.tool',key:'p',
  start:function(){st.msgK=null;st.a=null;st.b=null;st.prof=null;st.sight=null;st.mark=null;st.hover=null;st.on=true;render();V.redraw()},
  move:function(x,y){if(!st.on||!st.a||st.b)return;st.hover=[x,y];V.redraw()},
  click:function(x,y){if(!st.on)return;var p=[x,y];
   if(!st.a||st.b){var e=K.checkPt(V.doc,p,null);if(e){say('mapviz.profile.'+e);return}st.msgK=null;st.a=p;st.b=null;st.prof=null;st.sight=null;st.mark=null;H.ensure();render();V.redraw();return}
   setPts(st.a,p)},
  end:function(){st.on=false;st.hover=null;if(st.a&&!st.b)st.a=null;render();if(st.prof)say('mapviz.profile.ended');V.redraw()}});
 H.on(function(){if(st.a&&st.b&&!st.prof&&H.ready())compute();else render()});
 V.on('map',function(d){var k=d&&d.key?String(d.key):'';if(k!==st.map){st.map=k;st.a=null;st.b=null;st.prof=null;st.sight=null;st.mark=null;render();V.redraw()}});
 V.on('theme',function(){chart()});
}});
})();
`;
