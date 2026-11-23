// Map Viewer water layers (MV-PG1, second half A): the layers of the water rules (tools/mapviz/README.md 1.8, 4.4
// water.band, water.drown, water.depth; 5.3 waterLabel and water.checks; 5.4 water palette), legend text of
// 5.1. Layers of group water: 'water.band' (no prone, swim), 'water.drown' (the cells where a
// vehicle class of the chosen unit kind, or the class picked in the panel, drowns), 'water.depth', 'water.labels';
// group checks: 'water.checks' (off by default). Drown classes are read only through water.drown meta.bits (bit k =
// class meta.bits[k]), never from a fixed bit order. Labels are built from the label items with language keys, never
// from words in a product. The legend says what each band means, "vanilla values" where the data says so, that a unit
// only drowns under direct control, and that routes never enter drown cells only where every chosen depth is 0.7 m or
// more (design 5.1: a shallower mod depth drowns on type 3, which routes cross). The labels and checks lists are kept
// per target, map, mode, side and kind: dropped on every 'map' event, filled by the draw or, before it, by the part's
// own fetch of the same layer, so the DOM list never shows the items of another mode. When either brings new items the
// part calls V.relist(), so the list fills with no canvas context too.
// Author: Imperator_Aug (ARSENAL, ia-94427fb6)
module.exports = String.raw`
(function(){
if(!EXT_SCREENS.mapviz||!EXT_SCREENS.mapviz.parts)return;
EXT_SCREENS.mapviz.parts.push({id:'water',init:function(V){
 if(!V||V.q('rmt'))return;
 var K=EXT_SCREENS.mapviz.kit||null,el={};
 // unit kind of the shell -> the vehicle classes it stands for (README 1.8 class ids): infantry swims, never drowns; the MG
 // kind is the two GoH machine gun classes (wheeled 1.3 m, carried shield 1.0 m), none on AS2 and AS64 [T: does a crewed
 // MG drown in game]; AT is the unlinked gun
 var KINDC={inf:[],mg:['gun_goh_a','gun_goh_b'],at:['gun_unlinked'],tank:['tank_light','tank_medium','tank_heavy','amphibious']};
 var KNOWN=['car','truck','moto','armored_car','tank_light','gun_unlinked','tank_medium','tank_heavy','amphibious','gun_goh_a','gun_goh_b'];
 var CODES=['BLOCKED_NOT_DEADLY','WET_LOOK_DRY_PLAY','SWAMP','PAINTED_ABOVE_LEVEL'];
 var st={cls:'',meta:null},LST={};
 function css(hx){return K&&K.colourCss?K.colourCss(hx):''}
 function c4(hx){return K&&K.colour?K.colour(hx):null}
 function na(){return new Error(tx('mapviz.water.na'))}
 function palAt(p){var v=V.pal;String(p).split('.').forEach(function(k){v=v&&typeof v==='object'?v[k]:undefined});return v===undefined?null:v}
 function palOf(env,want){if(!env)return null;if(env.pal!=null&&env.pal!==want)return null;return env.palette!=null?env.palette:palAt(want)}
 function n1(x){return String(Math.round(x*10)/10)}
 function clsName(id){var k='mapviz.water.cls.'+id,s=tx(k);return s===k?String(id):s}
 function bandName(b){return tx(b===2?'mapviz.water.band.swim':b===1?'mapviz.water.band.noProne':'mapviz.water.band.none')}
 function paint(ctx,view,env,key,fn){if(!env||env.kind!=='grid'||!K||!K.gridDraw)throw na();if(env._mvw!==key){env._img=null;env._mvw=key}
  var r=K.gridDraw(ctx,view,env,{colour:fn});if(r&&r!=='nodraw')throw na()}
 // ---- drown classes: from meta.bits only ----
 function bitsOf(env){var m=env&&env.meta;if(!m||!Array.isArray(m.bits)||m.bits.length>32)return null;for(var i=0;i<m.bits.length;i++)if(typeof m.bits[i]!=='string')return null;return m.bits}
 // the classes of the chosen kind that this game has: meta.bits once known (amphibious kept: it has no depth), else no
 // GoH class outside GoH
 function chosen(){if(st.cls)return [st.cls];var ids=(KINDC[V.q('kind')]||[]).slice(),b=st.meta&&Array.isArray(st.meta.bits)?st.meta.bits:null;
  return ids.filter(function(id){return b?(b.indexOf(id)>=0||id==='amphibious'):(V.q('target')==='goh'||!/^gun_goh_/.test(id))})}
 // routes never enter the drown cells only when every chosen class drowns at 0.7 m or deeper (types 4 and 5 only)
 function deepOnly(){var meta=st.meta,want=chosen();if(!meta||!Array.isArray(meta.bits)||!Array.isArray(meta.depthM))return false;var any=false;
  for(var i=0;i<want.length;i++){var k=meta.bits.indexOf(want[i]);if(k<0)continue;var d=meta.depthM[k];if(!(typeof d==='number'&&d>=0.7))return false;any=true}return any}
 function maskOf(bits){var want=chosen(),m=0;for(var k=0;k<bits.length;k++)if(want.indexOf(bits[k])>=0)m=(m|(1<<k))>>>0;return m}
 // where a class's depth comes from: meta.source ('vanilla' | 'stack') or meta.sources (one per bit), when the data gives it
 function sourceOf(meta,id){if(!meta)return null;var k=Array.isArray(meta.bits)?meta.bits.indexOf(id):-1;
  if(Array.isArray(meta.sources)&&k>=0)return meta.sources[k]||null;return typeof meta.source==='string'?meta.source:null}
 // ---- layers ----
 function bandFn(env){var p=palOf(env,'water.bands');if(!Array.isArray(p))throw na();var by={};p.forEach(function(e,i){if(e&&e.fill)by[typeof e.code==='number'?e.code:i]=c4(e.fill)});
  return function(v){return v>0?by[v]||null:null}}
 function drownFn(env,mask){var p=palOf(env,'water.drown');if(!p||!p.fill)throw na();var c=c4(p.fill);return function(v){return mask&&((v>>>0)&mask)?c:null}}
 function depthFn(env){if(env.pal!=null&&env.pal!=='water.depth')throw na();var b=palAt('water.bands'),d=palAt('water.drown');if(!Array.isArray(b)||!b[1]||!d)throw na();
  var a=c4(b[1].fill),z=c4(d.fill),hi=0,dec=null,i;try{dec=K&&K.decode?K.decode(env):null}catch(e){dec=null}if(!a||!z||!dec||!dec.vals)throw na();
  for(i=0;i<dec.vals.length;i++){var x=dec.vals[i];if(x===x&&x>hi)hi=x}
  return function(v){if(!(v>0)||!(hi>0))return null;var t=Math.min(1,v/hi);return [0,1,2,3].map(function(j){return Math.round(a[j]+(z[j]-a[j])*t)})}}
 function drawBand(ctx,view){var e=view.env;if(!e)return;paint(ctx,view,e,'band',bandFn(e))}
 function drawDrown(ctx,view){var e=view.env;if(!e)return;var bits=bitsOf(e);if(!bits)throw na();seen(e.meta);var m=maskOf(bits);if(!m)return;paint(ctx,view,e,'drown'+m,drownFn(e,m))}
 function drawDepth(ctx,view){var e=view.env;if(!e)return;paint(ctx,view,e,'depth',depthFn(e))}
 function labelText(it,bits){var lines=[tx('mapviz.water.labelBand',{band:bandName(it.band),min:n1(it.depthMin),max:n1(it.depthMax),area:Math.round(it.area)})];
  if(Array.isArray(it.merged)&&it.merged.indexOf(1)>=0)lines.push(tx('mapviz.water.labelMerged'));
  var dr=Array.isArray(it.drown)?it.drown:[];
  if(dr.length){if(bits&&bits.length&&dr.length>=bits.length)lines.push(tx('mapviz.water.allDrown'));else lines.push(tx('mapviz.water.drowns',{list:dr.map(clsName).join(', ')}))}
  return lines}
 // ---- the items behind the DOM lists, per target, game folder, mod, map, mode, side and kind (the shell's layer key) ----
 function lsig(){return [V.q('target'),V.q('game')||'',V.q('mod')||'',V.q('map'),V.q('mode'),V.q('side'),V.q('kind')].join('|')}
 function vecOk(e,want){return !!e&&e.kind==='vector'&&Array.isArray(e.items)&&!!palOf(e,want)}
 function relist(){if(typeof V.relist==='function')V.relist()}
 // a draw that finds items the list does not hold yet asks the shell to draw the lists again (once per new item set)
 function keep(name,items){var k=lsig()+'|'+name,c=LST[k];if(c&&c.items===items)return;LST[k]={items:items};relist()}
 // the list asks for the layer itself when no draw has given it yet (no canvas, or the list is drawn before the draw);
 // when that fetch lands the shell draws the lists again (V.relist). While the shell reads the map's document
 // (V.q('docBusy')) the mode is not known yet: the list asks nothing and keeps no entry, so it asks once with the mode
 // when the shell draws the lists again on the 'map' event of the document (or on its 'doc' event)
 function itemsOf(name,want){var k=lsig()+'|'+name,c=LST[k];if(c)return c.items;if(!V.q('target')||!V.q('map')||V.q('docBusy'))return null;LST[k]=c={items:null};
  try{V.api('GET','layer',{name:name}).then(function(e){c.done=true;if(LST[k]===c&&!c.items&&vecOk(e,want)){c.items=e.items;relist()}},function(){c.done=true})}catch(x){}return null}
 function drawLabels(ctx,view){var e=view.env;if(!e)return;if(e.kind!=='vector'||!Array.isArray(e.items))throw na();var p=palOf(e,'water.label');if(!p)throw na();keep('water.labels',e.items);
  if(!ctx.fillText)return;var bits=st.meta&&st.meta.bits;ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  e.items.forEach(function(it){if(!it||it.kind!=='waterLabel'||typeof it.x!=='number')return;var s=view.toScreen(it.x,it.y),ls=labelText(it,bits);
   ls.forEach(function(t,i){var y=s[1]+(i-(ls.length-1)/2)*13;if(ctx.strokeText){ctx.strokeStyle=css(p.halo);ctx.lineWidth=3;ctx.strokeText(t,s[0],y)}ctx.fillStyle=css(p.text);ctx.fillText(t,s[0],y)})})}
 function codeText(c){return CODES.indexOf(c)>=0?tx('mapviz.water.check.'+c):tx('mapviz.water.check.other')}
 function drawChecks(ctx,view){var e=view.env;if(!e)return;if(e.kind!=='vector'||!Array.isArray(e.items))throw na();var p=palOf(e,'water.check');if(!p||!p.fill)throw na();keep('water.checks',e.items);
  if(!ctx.beginPath)return;var line=css(p.hatch&&p.hatch.color)||css(p.fill);
  e.items.forEach(function(it){if(!it||typeof it.x!=='number'||typeof it.y!=='number')return;
   if(Array.isArray(it.box)&&it.box.length===4&&ctx.strokeRect){var a=view.toScreen(it.box[0],it.box[3]),b=view.toScreen(it.box[2],it.box[1]);ctx.fillStyle=css(p.fill);if(ctx.fillRect)ctx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);ctx.strokeStyle=line;ctx.lineWidth=1;ctx.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1])}
   var s=view.toScreen(it.x,it.y);ctx.beginPath();ctx.arc(s[0],s[1],6,0,Math.PI*2);ctx.fillStyle=css(p.fill);ctx.fill();ctx.strokeStyle=line;ctx.lineWidth=1.5;ctx.stroke()})}
 function listLabels(){var bits=st.meta&&st.meta.bits;return (itemsOf('water.labels','water.label')||[]).filter(function(it){return it&&it.kind==='waterLabel'&&typeof it.x==='number'}).map(function(it){return {label:labelText(it,bits).join('; '),x:it.x,y:it.y}})}
 function listChecks(){return (itemsOf('water.checks','water.check')||[]).filter(function(it){return it&&typeof it.x==='number'}).map(function(it){var t=codeText(it.code);if(typeof it.area==='number')t=tx('mapviz.water.checkItem',{what:t,area:Math.round(it.area)});
   if(it.cls)t=t+' ('+clsName(it.cls)+')';return {label:t,x:it.x,y:it.y}})}
 // ---- legends (design 5.1) ----
 function legBand(){var b=palAt('water.bands');if(!Array.isArray(b))return null;var rows=[];b.forEach(function(e){if(e&&e.code===1)rows.push({color:e.fill,label:tx('mapviz.water.legNoProne')});if(e&&e.code===2)rows.push({color:e.fill,label:tx('mapviz.water.legSwim')})});return rows}
 function legDrown(){var d=palAt('water.drown');if(!d)return null;var want=chosen(),rows=[];
  if(!want.length){rows.push({color:null,label:tx('mapviz.water.noDrownKind')});return rows}
  rows.push({color:d.fill,label:tx('mapviz.water.legDrown',{list:want.map(clsName).join(', ')})});
  var meta=st.meta;if(meta&&Array.isArray(meta.bits)){var has=want.filter(function(id){return meta.bits.indexOf(id)>=0});
   if(has.length&&has.every(function(id){return sourceOf(meta,id)==='vanilla'}))rows.push({color:null,label:tx('mapviz.water.vanilla')})}
  rows.push({color:null,label:tx('mapviz.water.direct')});if(deepOnly())rows.push({color:null,label:tx('mapviz.water.noRoute')});return rows}
 V.addLayer({id:'water.band',group:'water',label:'mapviz.water.bandLayer',engineTrue:true,defaultOn:true,source:'water.band',draw:drawBand,legend:legBand});
 V.addLayer({id:'water.drown',group:'water',label:'mapviz.water.drownLayer',engineTrue:true,defaultOn:true,source:'water.drown',draw:drawDrown,legend:legDrown});
 V.addLayer({id:'water.depth',group:'water',label:'mapviz.water.depthLayer',engineTrue:true,defaultOn:false,source:'water.depth',draw:drawDepth,
  legend:function(){var b=palAt('water.bands'),d=palAt('water.drown');return b&&b[1]&&d?[{color:b[1].fill,label:tx('mapviz.water.shallow')},{color:d.fill,label:tx('mapviz.water.deepest')}]:null}});
 V.addLayer({id:'water.labels',group:'water',label:'mapviz.water.labelsLayer',engineTrue:true,defaultOn:true,source:'water.labels',draw:drawLabels,list:listLabels});
 V.addLayer({id:'water.checks',group:'checks',label:'mapviz.water.checksLayer',engineTrue:false,defaultOn:false,source:'water.checks',draw:drawChecks,list:listChecks,
  legend:function(){var c=palAt('water.check');return c?[{color:c.fill,label:tx('mapviz.water.legCheck')}]:null}});
 // ---- the panel: class picker and the legend text ----
 function seen(meta){if(st.meta===meta)return;var k=JSON.stringify(meta&&meta.bits||[]),same=st.meta&&JSON.stringify(st.meta.bits||[])===k;st.meta=meta;if(!same)drawPick();explain()}
 function drawPick(){var s=el.pick;if(!s)return;s.textContent='';s.appendChild(h('option',{value:'',text:tx('mapviz.water.byKind')}));
  var ids=(st.meta&&st.meta.bits)||KNOWN;ids.forEach(function(id){s.appendChild(h('option',{value:id,text:clsName(id)}))});
  if(st.cls&&ids.indexOf(st.cls)<0)st.cls='';s.value=st.cls}
 function explain(){var box=el.text;if(!box)return;box.textContent='';var add=function(k,a){box.appendChild(h('p',{text:tx(k,a||{})}))};
  add('mapviz.water.exNoProne');add('mapviz.water.exSwim');
  var want=chosen(),meta=st.meta;
  if(!want.length)add('mapviz.water.noDrownKind');
  else if(!meta)add('mapviz.water.legDrown',{list:want.map(clsName).join(', ')});
  else want.forEach(function(id){var k=meta&&Array.isArray(meta.bits)?meta.bits.indexOf(id):-1,dm=k>=0&&Array.isArray(meta.depthM)?meta.depthM[k]:null;
   if(meta&&k<0){if(id==='amphibious')add('mapviz.water.exDrownAny',{cls:clsName(id)});return}if(typeof dm==='number'&&isFinite(dm))add('mapviz.water.exDrown',{cls:clsName(id),m:n1(dm)});else add('mapviz.water.exDrownAny',{cls:clsName(id)});
   var src=sourceOf(meta,id);if(src==='vanilla')add('mapviz.water.exVanilla',{cls:clsName(id)})});
  add('mapviz.water.direct');if(deepOnly())add('mapviz.water.noRoute')}
 V.addPanel({id:'water',side:'right',build:function(box){var t=tx('mapviz.water.pick');
  el.pick=h('select',{onchange:function(){st.cls=el.pick.value||'';explain();V.redraw()}});drawPick();
  el.text=h('div',{blk:'mv.water.legend','aria-live':'polite','data-blkname':tx('mapviz.water.blk.legend')});
  box.appendChild(h('div',{blk:'mv.water.title','data-blkname':tx('mapviz.water.title')},[h('h3',{text:tx('mapviz.water.title')})]));
  box.appendChild(h('div',{class:'fld',blk:'mv.water.pick','data-blkname':t},[h('label',{class:'f'},[h('span',{class:'n',text:t}),el.pick,h('span')])]));
  box.appendChild(el.text);explain()}});
 // every 'map' event (map, mode, side or kind) drops the list items of other keys
 V.on('map',function(){var s=lsig()+'|';Object.keys(LST).forEach(function(k){if(k.indexOf(s)!==0)delete LST[k]});explain()});
 // the document read ended: a list that waited for it is drawn again, so it asks now (once)
 V.on('doc',function(){relist()});
 // a page job ended or the cache answer changed (W1): an item list that had no answer asks again once on the next list
 V.on('products',function(){var any=false;Object.keys(LST).forEach(function(k){if(!LST[k].items&&LST[k].done){delete LST[k];any=true}});if(any)relist()});
}});
})();
`;
