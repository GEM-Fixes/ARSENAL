// Models page, Volumes part (parity rows VOL-01..16, OBST-01..03): sub-tab "Volumes". Top to bottom: the 3D view when
// sub/viewer.client.js is there (a click on a volume selects it), search and bone filter, the list of volumes, "add a
// volume", the form of the selected volume (name, bone, shape and sizes in units and metres, placement, turn/move/scale,
// copy and paste of the matrix, fit to the mesh, thickness per side in mm, tags and component, the .vol file of a
// polyhedron), then obstacles and areas (list, form, add, delete).
// Reads only through EXT_SCREENS.models.doc (D.state), changes only through D.op, redraws on D.on: the Armor part and the
// 3D view read the same document, so an edit here shows there. Ops and states: tools/lib/model/edit/vol.js.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Test seam: EXT_SCREENS.models.subs.vol._t (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-2cafba15)
module.exports = String.raw`
(function(){
 var SIDES=['front','top','left','right','rear','bottom'],KINDS=['box','cylinder','sphere','polyhedron'];
 var ADD=['box','cylinder','sphere','polyhedron','meshBox','meshCylinder','meshSphere','meshHull'];
 var ST={gen:0,hooked:false,onEv:null,q:'',bone:'',sel:null,ob:null,clip:null,list:null,obst:null,cur:null,sure:null};

 // ---------- pure helpers (test seam) ----------
 function num(s){if(typeof s==='number')return s;s=String(s==null?'':s).trim().replace(',','.');if(!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s))return NaN;return parseFloat(s)}
 function nums(list){var o=[];for(var i=0;i<list.length;i++){var x=num(list[i]);if(!isFinite(x))return null;o.push(x)}return o}
 function r3(x){return Math.round((Number(x)||0)*1000)/1000}
 function metres(u){return r3((Number(u)||0)/20)}
 function short(id){id=String(id||'');var i=id.lastIndexOf('/');return i<0?id:id.slice(i+1)}
 function sizeText(v){if(!v)return '';if(v.kind==='box'&&v.size)return v.size.map(r3).join(' x ');
  if(v.kind==='cylinder')return 'r '+r3(v.radius)+', h '+r3(v.length);if(v.kind==='sphere')return 'r '+r3(v.radius);return v.file||''}
 function sizeMetres(v){if(!v)return '';if(v.kind==='box'&&v.size)return v.size.map(metres).join(' x ');
  if(v.kind==='cylinder')return 'r '+metres(v.radius)+', h '+metres(v.length);if(v.kind==='sphere')return 'r '+metres(v.radius);return ''}
 function thickText(t){if(!t||!t.set)return '';var l=t.list||[],same=l.every(function(x){return x===l[0]});return same?String(r3(l[0])):l.map(r3).join(' / ')}
 function parsePoints(text){var out=[],rows=String(text||'').split(/\r?\n/);
  for(var i=0;i<rows.length;i++){var s=rows[i].trim();if(!s)continue;var p=nums(s.split(/[\s;]+/));if(!p||p.length!==2)return null;out.push(p)}return out}
 function pointsText(vs){return (vs||[]).map(function(p){return p.join(' ')}).join('\n')}
 function words(s){return String(s||'').trim().split(/\s+/).filter(Boolean)}
 function addArgs(how,bone,axis){
  if(how==='box')return ['vol.add',{bone:bone,kind:'box',size:[20,20,20]}];
  if(how==='cylinder')return ['vol.add',{bone:bone,kind:'cylinder',radius:5,length:20}];
  if(how==='sphere')return ['vol.add',{bone:bone,kind:'sphere',radius:10}];
  if(how==='polyhedron')return ['vol.add',{bone:bone,kind:'polyhedron',fromBox:true,size:[20,20,20]}];
  var m={meshBox:'box',meshCylinder:'cylinder',meshSphere:'sphere',meshHull:'hull'}[how];
  return ['vol.addFromMesh',{bone:bone,how:m,axis:axis||'z'}]}

 EXT_SCREENS.models.subs.vol=function(ctx){
  var g=++ST.gen,el=ctx.el,clear=ctx.clear,say=ctx.say,mod=ctx.mod,D=EXT_SCREENS.models.doc,XP=EXT_SCREENS.models.parts||{};
  // blocks (sub/README.md "Blocks"): the card is the container 'vol'; the volume list, the selected volume's form and the obstacles
  // are one leaf each (drawn again on each selection); search and add rows are rows of leaves
  function VL(id,kids,a){a=a||{};a.blk='vol.'+id;return el('div',a,kids)}
  var card=el('div',{class:'card',style:'margin-top:10px',blk:'vol',box:'col','data-blkname':tx('models.vol.title')});ctx.body.appendChild(card);
  card.appendChild(VL('title',[el('h3',{text:tx('models.vol.title')})]));
  if(!mod){card.appendChild(VL('need',[],{class:'hint',text:tx('models.vol.needMod')}));return}
  if(!D||typeof D.op!=='function'){card.appendChild(VL('need',[],{class:'hint',text:tx('models.vol.noEditor')}));return}
  function live(){return g===ST.gen&&card.isConnected!==false}
  var msg=el('div',{class:'hint',role:'status'});
  function err(e){if(live())say(msg,'err',(e&&e.message)||String(e))}
  function done(k,p){if(live())say(msg,'hint',tx(k,p))}
  function run(op,args,okKey,after){say(msg,'hint',tx('models.vol.working'));
   return D.op(op,args).then(function(r){var info=(r&&r.info)||{};if(after)after(info);done(okKey||'models.vol.done',{v:short(info.id||'')})}).catch(err)}
  function numIn(v,w,label){var i=el('input',{type:'text',inputmode:'decimal','aria-label':label||'',style:'width:'+(w||6)+'em'});i.value=v==null?'':String(r3(v));return i}
  function btn(k,fn,cls,title){return el('button',{type:'button',class:cls||'',text:tx(k),title:title?tx(title):'',onclick:fn})}
  function field(k,kids){return el('label',{class:'row',style:'gap:4px;align-items:center'},[el('span',{text:tx(k)})].concat(kids))}
  function sideWord(s){return tx(['models.vol.side',s].join('.'))}
  function kindWord(k){return tx(['models.vol.kind',k].join('.'))}
  // blocks built here (sub/README.md "Blocks"): fl a field leaf in the page's fld shape (div.fld > label.f > span.n + control(s) +
  // after: unit, the field's own button), lf a leaf, bx a container; ids from code constants. redo draws a container again
  // (EXT_SCREENS.models.redo, ../client.js: moved blocks keep their place, one not drawn again is dropped)
  function fl(id,k,ctl,after,o){o=o||{};var t=tx(k);return el('div',{class:'fld',blk:id,'data-blkname':t},[el('label',{class:'f'+(o.chk?' chk':'')},[el('span',{class:'n',text:t}),
   ctl.length===1?ctl[0]:el('span',{class:'row'},ctl),after&&after.length?el('span',{},after):el('span')])])}
  function lf(id,kids,a){a=a||{};a.blk=id;return el('div',a,kids)}
  function bx(id,kind,k,kids){return el('div',{class:kind==='row'?'row':'',blk:id,box:kind,'data-blkname':tx(k)},kids)}
  function redo(c,pre,fn){var R=EXT_SCREENS.models.redo;if(R)return R(c,pre,fn);clear(c);return fn()}

  // ---------- 3D view ----------
  var view=null;
  if(XP.viewer){view=XP.viewer(ctx,{height:360,blk:'vol.view',show:{meshes:true,volumes:true,bones:false},onPick:function(hit){if(hit&&hit.volume)D.select({volume:hit.volume})}});if(view)card.appendChild(view)}
  card.appendChild(VL('msg',[msg],{'data-blkname':tx('models.vol.blk.msg')}));

  // ---------- search, filter, list ----------
  var qIn=el('input',{type:'search',autocomplete:'off','aria-label':tx('models.vol.search'),placeholder:tx('models.vol.searchPh'),style:'min-width:14em'});qIn.value=ST.q;
  var boneSel=el('select',{'aria-label':tx('models.vol.filterBone')});
  card.appendChild(el('div',{class:'row',style:'flex-wrap:wrap;gap:6px',blk:'vol.find',box:'row','data-blkname':tx('models.vol.search')},[VL('find.q',[qIn]),VL('find.bone',[field('models.vol.filterBone',[boneSel])])]));
  var listBox=VL('list',[],{style:'overflow-x:auto;max-height:22em;overflow-y:auto','data-blkname':tx('models.vol.blk.list')});card.appendChild(listBox);
  // the search box (searchKit, tools/gui/README.md): index = the volumes of the open model (name, id, kind; grouped by bone),
  // made once per list; history key models.vol.q. Typing redraws the list in the next frame, once however fast the keys come
  var qT=false;
  function volItems(){var L=ST.list;if(!L)return [];if(L._ski)return L._ski;
   return (L._ski=(L.volumes||[]).map(function(v){return {label:v.name,value:v.id,hint:v.id+' '+tx(['models.vol.kind',v.kind||'none'].join('.')),group:v.bone||'',lo:(v.name+' '+v.id+' '+v.kind+' '+(v.tags||[]).join(' ')).toLowerCase()}}))}
  if(typeof searchKit==='function')searchKit(qIn,{key:'models.vol.q',
   index:function(q,done){var w=String(q).toLowerCase().split(/\s+/).filter(Boolean),a=[],b=[];
    volItems().forEach(function(x){if(w.every(function(t){return x.lo.indexOf(t)>=0}))(String(x.label).toLowerCase().indexOf(w[0])===0?a:b).push(x)});var r=a.concat(b);done(r.slice(0,40),Math.max(0,r.length-40))},
   // Browse = the file picker on the game data at the model's folder, .vol files: the file's name (no extension) filters the list
   browse:{mode:'file',view:'data',start:function(){return EXT_SCREENS.models.pickAt.dir(D)},exts:['vol'],toValue:function(p,e){var PA=EXT_SCREENS.models.pickAt;return PA.stem(PA.key(p,e))}},
   onPick:function(v,it,from){if(from==='browse'){qIn.value=v;ST.q=v;drawList();return}qIn.value=it?it.label:v;ST.q=qIn.value;drawList();if(it)D.select({volume:it.value})}});
  qIn.addEventListener('input',function(){ST.q=qIn.value;if(qT)return;qT=true;var f=function(){qT=false;drawList()};if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);else setTimeout(f,0)});
  boneSel.addEventListener('change',function(){ST.bone=boneSel.value;drawList()});

  // ---------- add ----------
  var addBone=el('select',{'aria-label':tx('models.vol.addBone')}),addHow=el('select',{'aria-label':tx('models.vol.addHow')}),addAxis=el('select',{'aria-label':tx('models.vol.axis')});
  ADD.forEach(function(k){addHow.appendChild(el('option',{value:k,text:tx(['models.vol.add',k].join('.'))}))});
  ['x','y','z'].forEach(function(a){var o=el('option',{value:a,text:tx(['models.vol.axis',a].join('.'))});if(a==='z')o.selected=true;addAxis.appendChild(o)});
  card.appendChild(VL('add.title',[el('h4',{text:tx('models.vol.addTitle')})]));
  card.appendChild(el('div',{class:'row',style:'flex-wrap:wrap;gap:6px',blk:'vol.add',box:'row','data-blkname':tx('models.vol.addTitle')},[VL('add.bone',[field('models.vol.addBone',[addBone])]),VL('add.how',[field('models.vol.addHow',[addHow])]),VL('add.axis',[field('models.vol.axis',[addAxis])]),
   VL('add.go',[btn('models.vol.addBtn',function(){if(!addBone.value){say(msg,'err',tx('models.vol.pickBone'));return}var a=addArgs(addHow.value,addBone.value,addAxis.value);
    run(a[0],a[1],'models.vol.added',function(info){if(info.id)D.select({volume:info.id})})},'primary')])]));

  // ---------- selected volume ----------
  var form=VL('form',[],{box:'col',style:'margin-top:8px','data-blkname':tx('models.vol.blk.form')});card.appendChild(form);
  // ---------- obstacles and areas ----------
  var obBox=VL('obst',[],{box:'col',style:'margin-top:12px','data-blkname':tx('models.vol.obTitle')});card.appendChild(obBox);

  function drawBones(){var bones=(ST.list&&ST.list.bones)||[];
   clear(boneSel);boneSel.appendChild(el('option',{value:'',text:tx('models.vol.allBones')}));
   clear(addBone);
   bones.forEach(function(b){var o=el('option',{value:b.path,text:b.path+(b.volumes?' ('+b.volumes+')':'')});if(b.path===ST.bone)o.selected=true;boneSel.appendChild(o);
    var a=el('option',{value:b.path,text:b.path+(b.mesh?'':' '+tx('models.vol.noMesh'))});if(ST.cur&&ST.cur.bone===b.path)a.selected=true;addBone.appendChild(a)})}
  function drawList(){clear(listBox);var L=ST.list;if(!L)return;
   var q=ST.q.trim().toLowerCase(),vs=(L.volumes||[]).filter(function(v){
    if(ST.bone&&v.bone!==ST.bone)return false;if(!q)return true;
    return (v.id+' '+v.kind+' '+(v.tags||[]).join(' ')+' '+(v.component||'')+' '+(v.file||'')).toLowerCase().indexOf(q)>=0});
   if(!(L.volumes||[]).length){listBox.appendChild(el('div',{class:'hint',text:tx('models.vol.none')}));return}
   if(!vs.length){listBox.appendChild(el('div',{class:'hint',text:tx('models.vol.noMatch')}));return}
   var tb=el('table',{class:'tbl'});
   tb.appendChild(el('tr',{},['name','bone','kind','size','metres','thick'].map(function(k){return el('th',{text:tx(['models.vol.col',k].join('.'))})})));
   vs.forEach(function(v){var cur=v.id===ST.sel;
    var tr=el('tr',{class:cur?'sel':'',style:cur?'background:var(--th)':'','aria-selected':cur?'true':'false'},[
     el('td',{},[el('button',{type:'button',class:cur?'primary':'',text:v.name,title:v.id,onclick:function(){D.select({volume:v.id})}})]),
     el('td',{text:v.orphan?tx('models.vol.orphan',{b:v.boneName||''}):(v.bone||'')}),el('td',{text:kindWord(v.kind||'none')}),
     el('td',{text:sizeText(v)}),el('td',{text:sizeMetres(v)}),el('td',{text:thickText(v.thickness)})]);
    tb.appendChild(tr)});
   listBox.appendChild(tb);
   if(vs.length<(L.volumes||[]).length)listBox.appendChild(el('div',{class:'hint',text:tx('models.vol.shown',{n:vs.length,t:L.volumes.length})}))}

  // the selected volume: every field its own leaf, ids from constants (the same for every volume), side by side groups in row
  // containers; drawn again through redo (../client.js), so a field the user moved keeps its place
  function drawForm(){ST.sure=null;redo(form,'vol.form.',drawForm0)}
  function drawForm0(){var v=ST.cur,F='vol.form.';
   if(!v){form.appendChild(lf(F+'pick',[],{class:'hint',text:tx('models.vol.pickOne')}));return}
   form.appendChild(lf(F+'title',[el('h4',{text:tx('models.vol.selected',{v:v.id})})]));
   if(v.orphan)form.appendChild(lf(F+'orphan',[],{class:'hint',text:tx('models.vol.orphanSay',{b:v.boneName||''})}));
   // name and bone
   var nameIn=el('input',{type:'text','aria-label':tx('models.vol.name'),style:'width:12em'});nameIn.value=v.name;
   var bSel=el('select',{'aria-label':tx('models.vol.bone')});((ST.list&&ST.list.bones)||[]).forEach(function(b){var o=el('option',{value:b.path,text:b.path});if(b.path===v.bone)o.selected=true;bSel.appendChild(o)});
   form.appendChild(bx(F+'ident','row','models.vol.blk.ident',[
    fl(F+'ident.name','models.vol.name',[nameIn],[btn('models.vol.rename',function(){run('vol.rename',{volume:v.id,name:nameIn.value.trim()},'models.vol.renamed',function(i){if(i.id)D.select({volume:i.id})})})]),
    fl(F+'ident.bone','models.vol.bone',[bSel],[btn('models.vol.moveBone',function(){run('vol.setBone',{volume:v.id,bone:bSel.value},'models.vol.done',function(i){if(i.id)D.select({volume:i.id})})})])]));
   // shape
   var kSel=el('select',{'aria-label':tx('models.vol.shape')});KINDS.forEach(function(k){var o=el('option',{value:k,text:kindWord(k)});if(k===v.kind)o.selected=true;kSel.appendChild(o)});
   var shapeRow=bx(F+'shape','row','models.vol.shape',[]),ins={};
   function drawShape(){redo(shapeRow,F+'shape.',function(){var k=kSel.value;shapeRow.appendChild(fl(F+'shape.kind','models.vol.shape',[kSel]));
    function sz(id,key,val,label){var i=numIn(val,6,tx(label)),m=el('span',{class:'hint',text:tx('models.vol.inM',{m:metres(val)})});
     i.addEventListener('input',function(){var x=num(i.value);m.textContent=isFinite(x)?tx('models.vol.inM',{m:metres(x)}):''});ins[key]=i;shapeRow.appendChild(fl(F+'shape.'+id,label,[i],[m]))}
    ins={};
    if(k==='box'){var s=v.size||[20,20,20];sz('length','sx',s[0],'models.vol.length');sz('width','sy',s[1],'models.vol.width');sz('height','sz',s[2],'models.vol.height')}
    else if(k==='cylinder'){sz('radius','r',v.radius!=null?v.radius:5,'models.vol.radius');sz('cylheight','h',v.length!=null?v.length:20,'models.vol.cylHeight')}
    else if(k==='sphere')sz('radius','r',v.radius!=null?v.radius:10,'models.vol.radius');
    else{var fSel=el('select',{'aria-label':tx('models.vol.file')});((ST.list&&ST.list.vols)||[]).forEach(function(rel){var nm=rel.slice(rel.lastIndexOf('/')+1);
      var o=el('option',{value:nm,text:rel});if(v.file&&nm.toLowerCase()===String(v.file).toLowerCase().slice(String(v.file).lastIndexOf('/')+1))o.selected=true;fSel.appendChild(o)});
     ins.file=fSel;shapeRow.appendChild(fl(F+'shape.file','models.vol.file',[fSel]))}
    shapeRow.appendChild(lf(F+'shape.apply',[btn('models.vol.applyShape',function(){var a={volume:v.id,kind:k};
     if(k==='box'){a.size=nums([ins.sx.value,ins.sy.value,ins.sz.value])}else if(k==='cylinder'){a.radius=num(ins.r.value);a.length=num(ins.h.value)}
     else if(k==='sphere')a.radius=num(ins.r.value);else a.file=ins.file.value;
     if(a.size===null||(a.radius!==undefined&&!isFinite(a.radius))||(a.length!==undefined&&!isFinite(a.length))){say(msg,'err',tx('models.vol.badNum'));return}
     run('vol.setShape',a)},'primary')]))})}
   kSel.addEventListener('change',drawShape);drawShape();form.appendChild(shapeRow);
   // fit to the mesh
   var fitAxis=el('select',{'aria-label':tx('models.vol.axis')});['x','y','z'].forEach(function(a){var o=el('option',{value:a,text:tx(['models.vol.axis',a].join('.'))});if(a==='z')o.selected=true;fitAxis.appendChild(o)});
   form.appendChild(bx(F+'fit','row','models.vol.fit',[lf(F+'fit.go',[btn('models.vol.fit',function(){var k=kSel.value==='polyhedron'?'box':kSel.value;run('vol.fit',{volume:v.id,kind:k,axis:fitAxis.value},'models.vol.fitted')},'', 'models.vol.fitHint')]),
    fl(F+'fit.axis','models.vol.axis',[fitAxis])]));
   // placement
   var m=v.matrix||[1,0,0,0,1,0,0,0,1,0,0,0],P=[0,1,2].map(function(i){return numIn(m[9+i],6,tx(['models.vol.xyz',i].join('.')))});
   var place=bx(F+'place','col','models.vol.place',[lf(F+'place.title',[el('h4',{text:tx('models.vol.place')})])]);form.appendChild(place);
   if(!v.exact)place.appendChild(lf(F+'place.exact',[],{class:'hint',text:tx('models.vol.notExact')}));
   place.appendChild(fl(F+'place.pos','models.vol.position',P,[el('span',{class:'hint',text:tx('models.vol.inM',{m:[m[9],m[10],m[11]].map(metres).join(' ')})}),
    btn('models.vol.setPos',function(){var p=nums(P.map(function(i){return i.value}));if(!p){say(msg,'err',tx('models.vol.badNum'));return}run('vol.setPosition',{volume:v.id,position:p})})]));
   var O=[];for(var i=0;i<9;i++)O.push(numIn(m[i],5,tx('models.vol.orient')));
   var grid=el('div',{style:'display:grid;grid-template-columns:repeat(3,auto);gap:2px;width:max-content'},O);
   place.appendChild(bx(F+'place.orient','row','models.vol.orient',[fl(F+'place.orient.m','models.vol.orient',[grid]),lf(F+'place.orient.btns',[
    btn('models.vol.setOrient',function(){var o=nums(O.map(function(i){return i.value}));if(!o){say(msg,'err',tx('models.vol.badNum'));return}run('vol.setOrientation',{volume:v.id,orientation:o})}),
    btn('models.vol.round',function(){run('vol.round',{volume:v.id,step:0.5},'models.vol.rounded')},'','models.vol.roundHint'),
    btn('models.vol.copyM',function(){ST.clip=m.slice();done('models.vol.copied')}),
    btn('models.vol.pasteM',function(){if(!ST.clip){say(msg,'err',tx('models.vol.nothingCopied'));return}run('vol.setMatrix',{volume:v.id,matrix:ST.clip})})],{class:'row','data-blkname':tx('models.vol.blk.matrix')})]));
   // turn, move, scale (SOEdit's drag in a 2D pane)
   var T=[0,1,2].map(function(i){return numIn(0,4,tx(['models.vol.xyz',i].join('.')))}),Mv=[0,1,2].map(function(i){return numIn(0,4,tx(['models.vol.xyz',i].join('.')))}),Sc=[0,1,2].map(function(i){return numIn(1,4,tx(['models.vol.xyz',i].join('.')))});
   place.appendChild(bx(F+'place.tr','row','models.vol.blk.tr',[fl(F+'place.tr.turn','models.vol.turnBy',T),fl(F+'place.tr.move','models.vol.moveBy',Mv),fl(F+'place.tr.scale','models.vol.scaleBy',Sc),
    lf(F+'place.tr.apply',[btn('models.vol.applyTr',function(){var r=nums(T.map(function(i){return i.value})),mv=nums(Mv.map(function(i){return i.value})),s=nums(Sc.map(function(i){return i.value}));
     if(!r||!mv||!s){say(msg,'err',tx('models.vol.badNum'));return}run('vol.transform',{volume:v.id,rotate:r,move:mv,scale:s})})])]));
   // thickness
   var th=v.thickness||{list:[0,0,0,0,0,0]},allIn=numIn(th.all,5,tx('models.vol.thickAll')),Th=SIDES.map(function(s,i){return numIn(th.list[i],5,sideWord(s))});
   var tt=el('table',{class:'tbl'}),hr=el('tr',{},[el('th',{text:tx('models.vol.thickAll')})]),dr=el('tr',{},[el('td',{},[allIn])]);
   SIDES.forEach(function(s,i){hr.appendChild(el('th',{text:sideWord(s)}));dr.appendChild(el('td',{},[Th[i]]))});tt.appendChild(hr);tt.appendChild(dr);
   form.appendChild(bx(F+'thick','col','models.vol.thick',[lf(F+'thick.title',[el('h4',{text:tx('models.vol.thick')})]),lf(F+'thick.table',[tt],{style:'overflow-x:auto','data-blkname':tx('models.vol.thick')}),
    bx(F+'thick.set','row','models.vol.applyThick',[lf(F+'thick.set.hint',[],{class:'hint',text:tx('models.vol.mmHint')}),lf(F+'thick.set.go',[btn('models.vol.applyThick',function(){
    var a={volume:v.id},sides={};if(allIn.value.trim()!==''){a.all=num(allIn.value);if(!isFinite(a.all)){say(msg,'err',tx('models.vol.badNum'));return}}
    for(var i=0;i<6;i++){var x=Th[i].value.trim();if(x==='')continue;var n=num(x);if(!isFinite(n)){say(msg,'err',tx('models.vol.badNum'));return}if(n!==th.list[i]||!th.set)sides[SIDES[i]]=n}
    a.sides=sides;run('vol.setThickness',a,'models.vol.thickDone')},'primary')])])]));
   // tags, component, density, material
   var tagIn=el('input',{type:'text','aria-label':tx('models.vol.tags'),style:'width:14em'});tagIn.value=(v.tags||[]).join(' ');
   var compIn=el('input',{type:'text','aria-label':tx('models.vol.component'),style:'width:8em'});compIn.value=v.component||'';
   var denIn=numIn(v.density,5,tx('models.vol.density')),matIn=el('input',{type:'text','aria-label':tx('models.vol.material'),style:'width:8em'});matIn.value=v.material||'';
   form.appendChild(bx(F+'props','row','models.vol.blk.props',[fl(F+'props.tags','models.vol.tags',[tagIn]),fl(F+'props.component','models.vol.component',[compIn]),fl(F+'props.density','models.vol.density',[denIn]),fl(F+'props.material','models.vol.material',[matIn]),
    lf(F+'props.apply',[btn('models.vol.applyProps',function(){var a={volume:v.id,tags:words(tagIn.value),component:compIn.value.trim()||null,material:matIn.value.trim()||null};
     if(denIn.value.trim()!==''){a.density=num(denIn.value);if(!isFinite(a.density)){say(msg,'err',tx('models.vol.badNum'));return}}else a.density=null;
     run('vol.setProps',a)})])]));
   // duplicate, convert, delete
   var delBtn=btn('models.vol.delete',function(){if(ST.sure!==v.id){ST.sure=v.id;delBtn.textContent=tx('models.vol.deleteSure');return}
    run('vol.delete',{volume:v.id},'models.vol.deleted',function(){D.select({volume:null})})},'','models.vol.deleteHint');
   var row=[btn('models.vol.duplicate',function(){run('vol.duplicate',{volume:v.id},'models.vol.duplicated',function(i){if(i.id)D.select({volume:i.id})})})];
   if(v.kind==='box'||v.kind==='cylinder')row.push(btn('models.vol.toPoly',function(){run('vol.toPolyhedron',{volume:v.id})},'','models.vol.toPolyHint'));
   if(v.kind==='polyhedron')row.push(btn('models.vol.toBox',function(){run('vol.toBox',{volume:v.id})}));
   row.push(delBtn);form.appendChild(lf(F+'acts',row,{class:'row',style:'margin-top:6px','data-blkname':tx('models.vol.blk.acts')}));
   // the .vol file of a polyhedron
   if(v.kind==='polyhedron')drawVolFile(v)}

  function drawVolFile(v){var F='vol.form.volfile.',box=bx('vol.form.volfile','col','models.vol.blk.volfile',[]);box.setAttribute('style','margin-top:8px');form.appendChild(box);
   box.appendChild(lf(F+'title',[el('h4',{text:tx('models.vol.volFile',{f:v.file||''})})]));
   var info=el('div',{class:'hint'}),infoBox=lf(F+'info',[info],{'data-blkname':tx('models.vol.blk.volfile')});box.appendChild(infoBox);
   D.state('vol.get',{volume:v.id}).then(function(j){if(!live()||!j||!j.vol){if(live())info.textContent=tx('models.vol.volMissing');return}var o=j.vol;
    info.textContent=tx('models.vol.volInfo',{t:o.triangles,p:o.vertices})+' '+SIDES.map(function(s,i){return sideWord(s)+' '+(o.sides[i+1]||0)}).join(', ')+(o.sides.other?', '+tx('models.vol.sideOther',{n:o.sides.other}):'');
    if(o.users&&o.users.length>1)infoBox.appendChild(el('div',{class:'hint',text:tx('models.vol.shared',{n:o.users.length})}))}).catch(err);
   var Sc=[0,1,2].map(function(i){return numIn(1,4,tx(['models.vol.xyz',i].join('.')))}),Mv=[0,1,2].map(function(i){return numIn(0,4,tx(['models.vol.xyz',i].join('.')))});
   box.appendChild(bx(F+'tr','row','models.vol.blk.volTr',[fl(F+'tr.scale','models.vol.scaleBy',Sc),fl(F+'tr.move','models.vol.moveBy',Mv),
    lf(F+'tr.apply',[btn('models.vol.applyVol',function(){var s=nums(Sc.map(function(i){return i.value})),mv=nums(Mv.map(function(i){return i.value}));if(!s||!mv){say(msg,'err',tx('models.vol.badNum'));return}
     run('vol.volTransform',{volume:v.id,scale:s,move:mv})})])]));
   box.appendChild(lf(F+'mirror',['x','y','z'].map(function(a){return btn(['models.vol.mirror',a].join('.'),function(){run('vol.volTransform',{volume:v.id,mirror:a})})})
    .concat([btn('models.vol.autoSides',function(){run('vol.volSides',{volume:v.id,auto:true})},'','models.vol.autoSidesHint')]),{class:'row','data-blkname':tx('models.vol.blk.mirror')}))}

  // ---------- obstacles and areas ----------
  function drawObst(){redo(obBox,'vol.obst.',drawObst0)}
  function drawObst0(){var O=ST.obst||{obstacles:[],areas:[]},B='vol.obst.';
   obBox.appendChild(lf(B+'title',[el('h4',{text:tx('models.vol.obTitle')})]));
   obBox.appendChild(lf(B+'hint',[],{class:'hint',text:tx('models.vol.obHint')}));
   var all=(O.obstacles||[]).concat(O.areas||[]);
   if(!all.length)obBox.appendChild(lf(B+'list',[],{class:'hint',text:tx('models.vol.obNone')}));
   else{var tb=el('table',{class:'tbl'});tb.appendChild(el('tr',{},['type','name','shape'].map(function(k){return el('th',{text:tx(['models.vol.obCol',k].join('.'))})})));
    all.forEach(function(o){var cur=o.id===ST.ob;tb.appendChild(el('tr',{style:cur?'background:var(--th)':''},[el('td',{text:tx(['models.vol.ob',o.type].join('.'))}),
     el('td',{},[el('button',{type:'button',class:cur?'primary':'',text:o.name||tx('models.vol.noName'),onclick:function(){ST.ob=o.id;drawObst()}})]),
     el('td',{text:tx(['models.vol.okind',String(o.kind||'none').toLowerCase()].join('.'))})]))});
    obBox.appendChild(lf(B+'list',[tb],{style:'overflow-x:auto','data-blkname':tx('models.vol.obTitle')}))}
   obBox.appendChild(lf(B+'add',[
    btn('models.vol.addObst',function(){run('obst.add',{type:'obstacle',kind:'Obb2',center:[0,0],extent:[10,10],axis:[1,0]},'models.vol.done',function(i){ST.ob=i.id||null})}),
    btn('models.vol.addArea',function(){run('obst.add',{type:'area',kind:'Obb2',center:[0,0],extent:[10,10],axis:[1,0]},'models.vol.done',function(i){ST.ob=i.id||null})})],{class:'row'}));
   var o=null;all.forEach(function(x){if(x.id===ST.ob)o=x});if(!o)return;
   var nIn=el('input',{type:'text','aria-label':tx('models.vol.name'),style:'width:10em'});nIn.value=o.name||'';
   var kSel=el('select',{'aria-label':tx('models.vol.shape')});['Obb2','Circle2','Polygon2'].forEach(function(k){var op=el('option',{value:k,text:tx(['models.vol.okind',k.toLowerCase()].join('.'))});if(k===o.kind)op.selected=true;kSel.appendChild(op)});
   var c=o.center||[0,0],e=o.extent||[10,10],ax=o.axis||[1,0];
   var cx=numIn(c[0],5,'x'),cy=numIn(c[1],5,'y'),ex=numIn(e[0],5,'x'),ey=numIn(e[1],5,'y'),axx=numIn(ax[0],4,'x'),axy=numIn(ax[1],4,'y'),rad=numIn(o.radius!=null?o.radius:0,5,tx('models.vol.radius'));
   var pts=el('textarea',{rows:'5',cols:'18','aria-label':tx('models.vol.points')});pts.value=pointsText(o.vertices);
   var rot=el('input',{type:'checkbox','aria-label':tx('models.vol.rotate')});rot.checked=!!o.rotate;
   var tagIn=el('input',{type:'text','aria-label':tx('models.vol.tags'),style:'width:10em'});tagIn.value=(o.tags||[]).join(' ');
   var shapeBox=bx(B+'shape','row','models.vol.shape',[]);
   function drawOS(){redo(shapeBox,B+'shape.',function(){var k=kSel.value;
    if(k!=='Polygon2')shapeBox.appendChild(fl(B+'shape.centre','models.vol.centre',[cx,cy]));
    if(k==='Obb2'){shapeBox.appendChild(fl(B+'shape.half','models.vol.halfSize',[ex,ey]));shapeBox.appendChild(fl(B+'shape.dir','models.vol.dir',[axx,axy]))}
    else shapeBox.appendChild(k==='Circle2'?fl(B+'shape.radius','models.vol.radius',[rad]):fl(B+'shape.rounding','models.vol.rounding',[rad]));
    if(k==='Polygon2')shapeBox.appendChild(fl(B+'shape.points','models.vol.points',[pts],[el('span',{class:'hint',text:tx('models.vol.pointsHint')})]))})}
   kSel.addEventListener('change',drawOS);drawOS();
   obBox.appendChild(bx(B+'f','row','models.vol.blk.obForm',[fl(B+'f.name','models.vol.name',[nIn]),fl(B+'f.kind','models.vol.shape',[kSel]),fl(B+'f.rotate','models.vol.rotate',[rot],null,{chk:1}),fl(B+'f.tags','models.vol.tags',[tagIn])]));
   obBox.appendChild(shapeBox);
   var del=btn('models.vol.delete',function(){if(ST.sure!==o.id){ST.sure=o.id;del.textContent=tx('models.vol.deleteSure');return}
    run('obst.delete',{id:o.id},'models.vol.deleted',function(){ST.ob=null})});
   obBox.appendChild(lf(B+'acts',[btn('models.vol.applyOb',function(){var k=kSel.value,a={id:o.id,kind:k,rotate:rot.checked,tags:words(tagIn.value)};
    if(nIn.value.trim()&&nIn.value.trim()!==o.name)a.name=nIn.value.trim();
    if(k!=='Polygon2'){a.center=nums([cx.value,cy.value]);if(!a.center){say(msg,'err',tx('models.vol.badNum'));return}}
    if(k==='Obb2'){a.extent=nums([ex.value,ey.value]);a.axis=nums([axx.value,axy.value]);if(!a.extent||!a.axis){say(msg,'err',tx('models.vol.badNum'));return}}
    else{a.radius=num(rad.value);if(!isFinite(a.radius)){say(msg,'err',tx('models.vol.badNum'));return}}
    if(k==='Polygon2'){a.vertices=parsePoints(pts.value);if(!a.vertices){say(msg,'err',tx('models.vol.badPoints'));return}}
    run('obst.set',a)},'primary'),del],{class:'row','data-blkname':tx('models.vol.blk.obActs')}))}

  // ---------- load and redraw ----------
  function select(id){ST.sel=id||null;if(view&&view.highlight)view.highlight(ST.sel);
   if(!ST.sel){ST.cur=null;drawList();drawForm();return}
   var found=null;((ST.list&&ST.list.volumes)||[]).forEach(function(v){if(v.id===ST.sel)found=v});ST.cur=found;drawList();drawForm();drawBones()}
  function load(){if(!live())return;
   Promise.all([D.state('vol.list',{}),D.state('obst.list',{})]).then(function(r){if(!live())return;ST.list=r[0]||{volumes:[],bones:[]};ST.obst=r[1];
    if(ST.list.error)say(msg,'err',tx('models.vol.readErr',{e:ST.list.error}));
    drawBones();select(D.sel&&D.sel.volume!==undefined?D.sel.volume:ST.sel);drawObst()}).catch(err)}
  ST.onEv=function(ev){if(!live()||!ev)return;
   if(ev.type==='change'){if(view&&view.reload)view.reload();load()}
   else if(ev.type==='open')load();
   else if(ev.type==='select'&&ev.sel&&ev.sel.volume!==ST.sel)select(ev.sel.volume)};
  // the page drops listeners added while it draws (sub/README.md), so this one is added at each draw and the last one removed first
  if(typeof ST.off==='function')ST.off();ST.off=null;
  if(typeof D.on==='function'){var off=D.on(function(ev){if(ST.onEv)ST.onEv(ev)});ST.off=typeof off==='function'?off:null}
  drawForm();
  if(D.id)load();else if(typeof D.open==='function'){say(msg,'hint',tx('models.vol.opening'));D.open(ctx).then(function(){load()}).catch(err)}
  if(D.id)load();else if(typeof D.open==='function'){say(msg,'hint',tx('models.vol.opening'));D.open(ctx).then(function(){load()}).catch(err)}
 };
 EXT_SCREENS.models.subs.vol._t={num:num,nums:nums,metres:metres,sizeText:sizeText,sizeMetres:sizeMetres,thickText:thickText,parsePoints:parsePoints,pointsText:pointsText,words:words,addArgs:addArgs,short:short};
})();
`;
