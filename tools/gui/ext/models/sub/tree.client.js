// Models page part `tree`: the Skeleton sub-tab of the built-in model editor (parity rows TREE-01..10, BONE-01..34).
// Left: the model tree (bones, their volumes, obstacles and areas) with search, expand and collapse, show and hide boxes, keyboard
// arrows, drag a bone onto another to move it there, and a menu of every bone action (right click, or the "Actions" button).
// Right: the form of the selected bone: name, joint type, place (local or world, units and metres, angles in degrees, scale, the
// full matrix), nudges, flags, joint limits and speed, mesh and its settings, levels of detail, sequences.
// Everything goes through EXT_SCREENS.models.doc (sub/doc.client.js): D.state('tree.list' | 'bone.get' | 'bone.copy'), D.op('bone.*'),
// D.on to draw again after a change, D.select({ bone | volume }) so the 3D view shows the same pick. Ops: tools/lib/model/edit/tree.js.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Author: Imperator_Aug (ARSENAL, ia-a4b465e0)
module.exports = String.raw`
(function(){
 var ST={bone:null,list:null,rev:-1,open:null,hidden:{},clip:null,clipM:null,clipP:null,q:'',space:'local',vis:[],drag:null,off:null,view:null,seqOwner:'bone'};
 var K='models.tree.',TYPES=['none','revolute','prizmatic','socket','planarsocket','wild'];
 var VF=['NoCastShadows','NoGetShadows','NoGroupMesh','DecalTarget','Ground'];
 // the colour picker's start value when a bone has no colour of its own: data for the model file (mid grey), not a page colour
 // rows of the F2 key list (Files part); these keys act only while the Skeleton tree has the focus (doc.client KEYMAP 'tree')
 var MK=EXT_SCREENS.models;MK.keys=MK.keys||[];
 [['Up, Down, Home, End','move'],['Left, Right','open'],['Enter, F2','edit'],['Delete','delete'],['Menu','menu']]
  .forEach(function(r){MK.keys.push({keys:r[0],key:K+'key.'+r[1],area:'tree'})});
 var GREYV='#'+[128,128,128].map(function(x){return (x<16?'0':'')+x.toString(16)}).join('');
 function fmt(x){if(x==null||typeof x!=='number'||!isFinite(x))return '';var r=Math.round(x*1e5)/1e5;return String(r===0?0:r)}
 // decimal comma becomes a dot, other characters are dropped (as SOEdit's matrix cells do)
 function num(s){s=String(s==null?'':s).replace(/,/g,'.').replace(/[^0-9eE+\-.]/g,'');if(!s)return null;var x=parseFloat(s);return isFinite(x)?x:null}
 function openSet(){var all=LS.get('models.tree.open',{})||{},k=ST.list?ST.list.mdl:'';if(!all[k])all[k]={};return {all:all,m:all[k],key:k}}
 function setOpen(p,on){var o=openSet();if(on)o.m[p]=1;else delete o.m[p];LS.set('models.tree.open',o.all)}
 function isOpen(p){return !!openSet().m[p]}
 EXT_SCREENS.models.subs.tree=function(ctx){
  var el=ctx.el,clear=ctx.clear,D=ctx.doc||EXT_SCREENS.models.doc||null;
  // blocks (sub/README.md "Blocks"): container 'tree' with two columns (tree.left: find, tools, question, the tree; tree.right: mode and
  // the bone form, one leaf per section); the tree list with its menu is one leaf
  var box=el('div',{blk:'tree',box:'col','data-blkname':tx('models.tree.title')});ctx.body.appendChild(box);
  if(!D){box.appendChild(el('div',{class:'hint',blk:'tree.nocore',text:tx('models.tree.noCore')}));return}
  var msg=el('div',{class:'hint','aria-live':'polite'}),mode=el('div',{class:'hint'});
  var find=el('input',{type:'search',autocomplete:'off',placeholder:tx('models.tree.find'),'aria-label':tx('models.tree.find'),style:'flex:1;min-width:8em'});
  find.value=ST.q;
  // another sub-tab (Mesh, Volumes) with the pick carried over; without the page's switch only the pick
  function goTo(s,sel){var M=EXT_SCREENS.models;if(M&&typeof M.go==='function'&&M.go(s,sel))return;D.select(sel)}
  var treeBox=el('div',{role:'tree',tabindex:'0','data-keys':'tree','aria-label':tx('models.tree.title'),style:'max-height:60vh;overflow:auto;border:1px solid var(--line);border-radius:4px;padding:4px;background:var(--card);outline-color:var(--acc)'});
  var menu=el('div',{hidden:true,role:'menu',style:'position:fixed;z-index:50;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:4px;box-shadow:0 2px 8px var(--shadow);padding:4px;max-height:70vh;overflow:auto;display:flex;flex-direction:column;gap:2px'});
  var ask=el('div',{hidden:true,class:'card',style:'margin:6px 0',blk:'tree.ask','data-blkname':tx('models.tree.blk.ask')});
  var form=el('div',{blk:'tree.form',box:'col','data-blkname':tx('models.tree.blk.form')});
  var tools=el('div',{class:'row',blk:'tree.tools','data-blkname':tx('models.tree.blk.tools')});
  var left=el('div',{blk:'tree.left',box:'col','data-blkname':tx('models.tree.blk.left')},[el('div',{class:'row',blk:'tree.find'},[find]),tools,ask,el('div',{blk:'tree.list','data-blkname':tx('models.tree.title')},[treeBox,menu])]);
  // the find box (searchKit, tools/gui/README.md): index = the bones of the open model (name, path; grouped by parent),
  // history key models.tree.find; built once per bone list (ST.list)
  skit(find,'models.tree.find',boneItems,function(v,it){var b=byPath(it?it.value:v);if(!b){find.value=v;doFind();return}find.value=b.name;ST.q=b.name;
   var parts=b.path.split('/');for(var k=1;k<parts.length;k++)setOpen(parts.slice(0,k).join('/'),true);say('hint','');select(b.path)},'ply');
  var right=el('div',{blk:'tree.right',box:'col','data-blkname':tx('models.tree.blk.form')},[el('div',{blk:'tree.mode','data-blkname':tx('models.tree.blk.mode')},[mode]),form]);
  box.appendChild(el('div',{blk:'tree.title'},[el('h3',{text:tx('models.tree.title')})]));
  box.appendChild(el('div',{blk:'tree.cols',box:'cols','data-blkname':tx('models.tree.blk.cols')},[left,right]));
  box.appendChild(el('div',{blk:'tree.msg','data-blkname':tx('models.tree.blk.msg')},[msg]));
  function say(cls,t){msg.className=cls;msg.textContent=t||''}
  function fail(e){say('err',e&&e.message?e.message:String(e))}

  // ---------- data ----------
  function byPath(p){var L=ST.list;if(!L||!p)return null;for(var i=0;i<L.bones.length;i++)if(L.bones[i].path===p)return L.bones[i];return null}
  function load(){if(!D.id){say('hint',D.error||tx('models.tree.notOpen'));clear(treeBox);clear(form);return Promise.resolve()}
   return D.state('tree.list',{}).then(function(L){ST.list=L;ST.rev=D.rev;
    if(L.error)say('err',tx('models.tree.unreadable',{e:L.error}));
    if(ST.bone&&!byPath(ST.bone))ST.bone=null;
    if(!ST.bone&&D.sel&&D.sel.bone&&byPath(D.sel.bone))ST.bone=D.sel.bone;
    if(!ST.bone&&L.bones.length)ST.bone=L.bones[0].path;
    drawTools();drawTree();drawForm()}).catch(fail)}
  function act(op,args,after){say('hint',tx('models.tree.working'));ST.busy=(ST.busy||0)+1;
   return D.op(op,args).then(function(r){ST.busy--;var i=(r&&r.info)||{};
    if(i.bone&&typeof i.bone==='string')ST.bone=i.bone;else if(i.bones&&i.bones.length)ST.bone=i.bones[0];
    if(ST.bone){var parts=ST.bone.split('/');for(var k=1;k<parts.length;k++)setOpen(parts.slice(0,k).join('/'),true)}
    say('hint',i.unchanged?tx('models.tree.unchanged'):doneText(op,i));if(after)after(r);
    if(D.rev!==ST.rev)return load().then(function(){D.select({bone:ST.bone})})},function(e){ST.busy--;fail(e)})}
  function doneText(op,i){
   if(op==='bone.delete'){var v=i.volumes||{};return tx('models.tree.done.delete',{n:(i.removed||[]).length,d:(v.deleted||[]).length,m:(v.moved||[]).length,k:(v.kept||[]).length})}
   if(op==='bone.rename'&&i.anm&&i.anm.length)return tx('models.tree.done.renameAnm',{n:i.anm.length})+((i.defMentions||[]).length?' '+tx('models.tree.done.defMentions',{n:i.defMentions.length}):'');
   if(op==='bone.rename'&&(i.defMentions||[]).length)return tx('models.tree.done.defMentions',{n:i.defMentions.length});
   if(op==='bone.set'&&(i.removed||[]).length)return tx('models.tree.done.removedKeys',{k:i.removed.join(', ')});
   return tx('models.tree.done')}
  function select(p){ST.bone=p;D.select({bone:p,volume:null});drawTree();drawForm()}

  // ---------- show and hide (display only) ----------
  function pushHidden(){var b=[],v=[];Object.keys(ST.hidden).forEach(function(k){if(k.slice(0,2)==='v:')v.push(k.slice(2));else b.push(k)});
   if(typeof D.setHidden==='function')D.setHidden({bones:b,volumes:v})}
  function showBranch(p,on,bones,vols){var L=ST.list;if(!L)return;
   L.bones.forEach(function(b){if(b.path!==p&&b.path.indexOf(p+'/')!==0)return;
    if(bones){if(on)delete ST.hidden[b.path];else ST.hidden[b.path]=1}
    if(vols)b.volumes.forEach(function(id){if(on)delete ST.hidden['v:'+id];else ST.hidden['v:'+id]=1})});
   pushHidden();drawTree()}

  // ---------- every action on a bone (menu, toolbar, keys) ----------
  function cur(){return byPath(ST.bone)}
  function copyText(t){ST.clip=t;try{if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).catch(function(){})}catch(e){}}
  function doCopy(branch){var b=cur();if(!b)return;D.state('bone.copy',{bone:b.path,branch:branch}).then(function(j){copyText(j.text);say('hint',tx(branch?'models.tree.copiedBranch':'models.tree.copiedBone',{b:b.name}))}).catch(fail)}
  function doPaste(as){var b=cur();if(!b)return;if(!ST.clip){say('err',tx('models.tree.clipEmpty'));return}act('bone.paste',{bone:b.path,text:ST.clip,as:as})}
  function doCut(){var b=cur();if(!b)return;D.state('bone.copy',{bone:b.path,branch:true}).then(function(j){copyText(j.text);askDelete(true,true)}).catch(fail)}
  var ACTS=[
   ['addChild',function(b){act('bone.add',{parent:b.path})}],
   ['addNext',function(b){act('bone.add',{after:b.path})}],
   ['edit',function(){focusForm()}],
   ['rename',function(){focusForm()}],
   ['delete',function(){askDelete(true)}],
   ['deleteKeep',function(){askDelete(false)}],
   ['parent',function(b){if(b.parent)select(b.parent)}],
   ['up',function(b){act('bone.up',{bone:b.path})}],
   ['down',function(b){act('bone.down',{bone:b.path})}],
   ['duplicate',function(b){act('bone.duplicate',{bone:b.path})}],
   ['cut',function(){doCut()}],
   ['copyBone',function(){doCopy(false)}],
   ['copyBranch',function(){doCopy(true)}],
   ['pasteNext',function(){doPaste('next')}],
   ['pasteNested',function(){doPaste('nested')}],
   ['copyMatrix',function(){var b=cur();D.state('bone.get',{bone:b.path}).then(function(g){ST.clipM=g.local;say('hint',tx('models.tree.copiedMatrix'))}).catch(fail)}],
   ['pasteMatrix',function(b){if(!ST.clipM){say('err',tx('models.tree.clipEmpty'));return}act('bone.setMatrix',{bone:b.path,matrix:ST.clipM})}],
   ['copyParams',function(){var b=cur();D.state('bone.get',{bone:b.path}).then(function(g){ST.clipP=g.params||'';say('hint',tx('models.tree.copiedParams'))}).catch(fail)}],
   ['pasteParams',function(b){if(ST.clipP==null){say('err',tx('models.tree.clipEmpty'));return}act('bone.set',{bone:b.path,params:ST.clipP||null})}],
   ['deleteMesh',function(b){act('bone.mesh',{bone:b.path,file:null})}],
   ['addLod',function(){focusForm('lod')}],
   ['round',function(b){act('bone.round',{bone:b.path})}],
   ['mirror',function(b){act('bone.mirror',{bone:b.path,axis:'y'})}],
   ['expand',function(b){branchOpen(b.path,true)}],
   ['collapse',function(b){branchOpen(b.path,false)}],
   ['expandAll',function(){(ST.list.bones||[]).forEach(function(x){setOpen(x.path,true)});drawTree()}],
   ['collapseAll',function(){(ST.list.bones||[]).forEach(function(x){setOpen(x.path,false)});drawTree()}],
   ['showBranch',function(b){showBranch(b.path,true,true,false)}],['hideBranch',function(b){showBranch(b.path,false,true,false)}],
   ['showVolumes',function(b){showBranch(b.path,true,false,true)}],['hideVolumes',function(b){showBranch(b.path,false,false,true)}],
   ['showBoth',function(b){showBranch(b.path,true,true,true)}],['hideBoth',function(b){showBranch(b.path,false,true,true)}]];
  function run(id){var b=cur();if(!b&&id!=='expandAll'&&id!=='collapseAll'&&id!=='addChild'){say('err',tx('models.tree.pickFirst'));return}
   for(var i=0;i<ACTS.length;i++)if(ACTS[i][0]===id){if(!b&&id==='addChild'){act('bone.add',{});return}ACTS[i][1](b);return}}
  function off(id){var b=cur();if(!b)return id!=='expandAll'&&id!=='collapseAll'&&id!=='addChild';
   if(id==='parent')return !b.parent;
   if(id==='up')return b.index<=0;if(id==='down')return b.index>=b.siblings-1;
   if((id==='addNext'||id==='duplicate'||id==='pasteNext')&&!b.parent&&ST.list.bones.filter(function(x){return x.depth===0}).length<2)return true;
   if((id==='delete'||id==='deleteKeep'||id==='cut')&&!b.parent&&ST.list.bones.filter(function(x){return x.depth===0}).length<2)return true;
   if(id==='deleteMesh')return !b.mesh;
   if(id==='expand'||id==='collapse')return !b.children.length;
   return false}
  function branchOpen(p,on){ST.list.bones.forEach(function(b){if(b.path===p||b.path.indexOf(p+'/')===0)setOpen(b.path,on)});drawTree()}
  function drawTools(){clear(tools);
   ['addChild','addNext','delete','up','down','duplicate','cut','copyBranch','pasteNested','expandAll','collapseAll'].forEach(function(id){
    var bt=el('button',{type:'button',text:tx(K+'a.'+id),onclick:function(){run(id)}});bt.disabled=off(id);tools.appendChild(bt)});
   tools.appendChild(el('button',{type:'button',text:tx('models.tree.actions'),'aria-haspopup':'menu',onclick:function(e){openMenu(e&&e.clientX!=null?e.clientX:40,e&&e.clientY!=null?e.clientY:40)}}))}
  function closeMenu(){menu.hidden=true;clear(menu)}
  function openMenu(x,y){clear(menu);
   ACTS.forEach(function(a){var bt=el('button',{type:'button',role:'menuitem',text:tx(K+'a.'+a[0]),style:'text-align:left',onclick:function(){closeMenu();run(a[0])}});bt.disabled=off(a[0]);menu.appendChild(bt)});
   menu.appendChild(el('button',{type:'button',role:'menuitem',text:tx('models.tree.close'),style:'text-align:left',onclick:closeMenu}));
   menu.style.left=Math.max(0,x)+'px';menu.style.top=Math.max(0,y)+'px';menu.hidden=false;
   if(menu.firstChild&&menu.firstChild.focus)menu.firstChild.focus()}
  menu.addEventListener('keydown',function(e){if(e.key==='Escape'){closeMenu();treeBox.focus&&treeBox.focus()}});

  // delete: whole branch or the bone alone; what happens to the volumes on the deleted bones
  function askDelete(branch,isCut){var b=cur();if(!b)return;clear(ask);ask.hidden=false;
   var gone=ST.list.bones.filter(function(x){return x.path===b.path||(branch&&x.path.indexOf(b.path+'/')===0)});
   var vols=0;gone.forEach(function(x){vols+=x.volumes.length});
   ask.appendChild(el('div',{text:tx(isCut?'models.tree.ask.cut':branch?'models.tree.ask.branch':'models.tree.ask.alone',{b:b.name,n:gone.length})}));
   var vs=el('select',{'aria-label':tx('models.tree.ask.vols')});
   ['delete','parent','keep'].forEach(function(k){vs.appendChild(el('option',{value:k,text:tx(K+'ask.v.'+k)}))});
   if(vols)ask.appendChild(el('div',{class:'row'},[el('span',{text:tx('models.tree.ask.volsN',{n:vols})}),vs]));
   ask.appendChild(el('div',{class:'row'},[
    el('button',{type:'button',class:'primary',text:tx(isCut?'models.tree.a.cut':'models.tree.a.delete'),onclick:function(){ask.hidden=true;clear(ask);act('bone.delete',{bone:b.path,children:branch,volumes:vols?vs.value:'delete'},function(){ST.bone=b.parent})}}),
    el('button',{type:'button',text:tx('models.tree.cancel'),onclick:function(){ask.hidden=true;clear(ask)}})]))}

  // ---------- the tree ----------
  function badge(t){return el('span',{class:'hint',style:'margin-left:6px;font-size:90%',text:t})}
  function drawTree(){clear(treeBox);ST.vis=[];var L=ST.list;if(!L)return;
   if(!L.bones.length)treeBox.appendChild(el('div',{class:'hint',text:tx('models.tree.empty')}));
   var roots=L.bones.filter(function(b){return b.parent===null});
   roots.forEach(function(b){drawBone(b)});
   var orph=L.volumes.filter(function(v){return v.orphan});
   if(orph.length){treeBox.appendChild(el('div',{style:'margin-top:6px',text:tx('models.tree.orphans',{n:orph.length})}));orph.forEach(function(v){drawVol(v,1)})}
   if(L.obstacles.length||L.areas.length){treeBox.appendChild(el('div',{style:'margin-top:6px',text:tx('models.tree.obstacles',{n:L.obstacles.length,a:L.areas.length})}));
    L.obstacles.concat(L.areas).forEach(function(o){treeBox.appendChild(el('div',{class:'hint',style:'padding-left:22px',text:(o.name||'?')+' ('+(o.kind||'?')+')'}))})}}
  function drawBone(b){var L=ST.list,open=isOpen(b.path),kids=b.children.length+b.volumes.length,sel=b.path===ST.bone;
   ST.vis.push(b.path);
   var tg=el('button',{type:'button','aria-label':tx(open?'models.tree.a.collapse':'models.tree.a.expand'),style:'width:1.8em;padding:0 2px;visibility:'+(kids?'visible':'hidden'),text:open?'-':'+',
    onclick:function(e){if(e&&e.stopPropagation)e.stopPropagation();setOpen(b.path,!open);drawTree()}});
   var cb=el('input',{type:'checkbox','aria-label':tx('models.tree.show',{b:b.name})});cb.checked=!ST.hidden[b.path];
   cb.addEventListener('click',function(e){if(e&&e.stopPropagation)e.stopPropagation()});
   cb.addEventListener('change',function(){if(cb.checked)delete ST.hidden[b.path];else ST.hidden[b.path]=1;pushHidden()});
   var name=el('span',{text:b.name});
   var row=el('div',{role:'treeitem','aria-selected':sel?'true':'false','aria-level':String(b.depth+1),draggable:'true',
    style:'display:flex;align-items:center;gap:2px;padding:1px 2px 1px '+(b.depth*14)+'px;cursor:pointer;border-radius:3px;'+(sel?'background:var(--sel);':'')},[tg,cb,name]);
   if(kids)row.setAttribute('aria-expanded',open?'true':'false');
   if(b.kind!=='bone')row.appendChild(badge(TYPES.indexOf(b.kind)>0?tx(K+'type.'+b.kind):b.kind));
   if(b.prefab)row.appendChild(badge(tx('models.tree.prefab')));
   if(b.lods)row.appendChild(badge(tx('models.tree.lods',{n:b.lods})));else if(b.mesh)row.appendChild(badge(tx('models.tree.hasMesh')));
   if(b.volumes.length)row.appendChild(badge(tx('models.tree.vols',{n:b.volumes.length})));
   if(b.sequences)row.appendChild(badge(tx('models.tree.seqs',{n:b.sequences})));
   row.addEventListener('click',function(){select(b.path)});
   row.addEventListener('dblclick',function(){select(b.path);focusForm()});
   row.addEventListener('contextmenu',function(e){if(e&&e.preventDefault)e.preventDefault();select(b.path);openMenu(e.clientX,e.clientY)});
   row.addEventListener('dragstart',function(e){ST.drag=b.path;try{e.dataTransfer.setData('text/plain',b.path);e.dataTransfer.effectAllowed='move'}catch(x){}});
   row.addEventListener('dragover',function(e){if(ST.drag&&ST.drag!==b.path&&b.path.indexOf(ST.drag+'/')!==0&&e.preventDefault)e.preventDefault()});
   row.addEventListener('drop',function(e){if(e&&e.preventDefault)e.preventDefault();var d=ST.drag;ST.drag=null;
    if(!d||d===b.path||b.path.indexOf(d+'/')===0)return;act('bone.move',{bone:d,parent:b.path})});
   treeBox.appendChild(row);
   if(open){b.children.forEach(function(c){var cb2=byPath(c);if(cb2)drawBone(cb2)});
    b.volumes.forEach(function(id){var v=null;L.volumes.forEach(function(x){if(x.id===id)v=x});if(v)drawVol(v,b.depth+1)})}}
  function drawVol(v,depth){var cb=el('input',{type:'checkbox','aria-label':tx('models.tree.show',{b:v.name})});cb.checked=!ST.hidden['v:'+v.id];
   cb.addEventListener('change',function(){if(cb.checked)delete ST.hidden['v:'+v.id];else ST.hidden['v:'+v.id]=1;pushHidden()});
   var row=el('div',{role:'treeitem',style:'display:flex;align-items:center;gap:2px;padding:1px 2px 1px '+(depth*14+22)+'px;cursor:pointer'},
    [cb,el('span',{text:v.name}),badge(tx('models.tree.volume',{k:['box','cylinder','sphere','polyhedron'].indexOf(v.kind)>=0?tx(K+'vk.'+v.kind):(v.kind||'?')}))]);
   row.setAttribute('title',tx('models.tree.volOpenTip'));
   row.addEventListener('click',function(){D.select({volume:v.id});say('hint',tx('models.tree.volPicked',{v:v.name}))});
   row.addEventListener('dblclick',function(){goTo('vol',{volume:v.id})});
   treeBox.appendChild(row)}
  // keyboard: arrows move, right opens or goes in, left closes or goes to the parent, Enter edits, Delete deletes, F2 renames
  treeBox.addEventListener('keydown',function(e){var k=e.key,i=ST.vis.indexOf(ST.bone),b=cur();
   if(k==='ArrowDown'){if(i<ST.vis.length-1)select(ST.vis[i+1])}
   else if(k==='ArrowUp'){if(i>0)select(ST.vis[i-1])}
   else if(k==='Home'){if(ST.vis.length)select(ST.vis[0])}
   else if(k==='End'){if(ST.vis.length)select(ST.vis[ST.vis.length-1])}
   else if(k==='ArrowRight'&&b){if(b.children.length&&!isOpen(b.path)){setOpen(b.path,true);drawTree()}else if(b.children.length)select(b.children[0])}
   else if(k==='ArrowLeft'&&b){if(b.children.length&&isOpen(b.path)){setOpen(b.path,false);drawTree()}else if(b.parent)select(b.parent)}
   else if(k==='Enter'||k==='F2'){focusForm()}
   else if(k==='Delete'){askDelete(true)}
   else if(k==='ContextMenu'){openMenu(60,60)}
   else return;
   if(e.preventDefault)e.preventDefault()});
  // find: the first bone named so (whole name first, then the start, then anywhere); Enter goes to the tree
  function doFind(){var q=find.value.trim().toLowerCase();ST.q=find.value;if(!q||!ST.list)return;
   var bs=ST.list.bones,hit=null,tests=[function(n){return n===q},function(n){return n.indexOf(q)===0},function(n){return n.indexOf(q)>=0}];
   for(var t=0;t<3&&!hit;t++)for(var i=0;i<bs.length;i++)if(tests[t](bs[i].name.toLowerCase())){hit=bs[i];break}
   if(!hit){say('hint',tx('models.tree.notFound',{q:find.value.trim()}));return}
   var parts=hit.path.split('/');for(var k=1;k<parts.length;k++)setOpen(parts.slice(0,k).join('/'),true);
   say('hint','');select(hit.path)}
  find.addEventListener('input',doFind);
  find.addEventListener('keydown',function(e){if(e._sk)return;if(e.key==='Enter'){doFind();if(treeBox.focus)treeBox.focus()}});

  // ---------- the form ----------
  var F={};
  function focusForm(part){var t=part==='lod'?F.lodIn:F.name;if(t&&t.focus)t.focus()}
  function lab(t,kids,hint){return el('div',{class:'row'},[el('span',{style:'min-width:9em',text:t})].concat(kids).concat(hint?[el('span',{class:'hint',text:hint})]:[]))}
  function numIn(v,aria,w){var i=el('input',{type:'text',inputmode:'decimal','aria-label':aria,style:'width:'+(w||6)+'em'});i.value=fmt(v);return i}
  function nums(a,what){var o=[];for(var i=0;i<a.length;i++){var x=num(a[i].value);if(x===null){say('err',tx('models.tree.badNum',{f:what}));return null}o.push(x)}return o}
  function sec(t,id,kids){return el('details',{open:true,style:'margin-top:6px;border-top:1px solid var(--line);padding-top:4px',blk:'tree.form.'+id,box:'col'},[el('summary',{text:t})].concat(kids))}
  function btn(t,fn,cls){return el('button',{type:'button',class:cls||'',text:t,onclick:fn})}
  // after the form is filled: its rows into blocks, one leaf per field (EXT_SCREENS.models.blockify, ../client.js)
  fill=(function(f0){return function(g){f0(g);var B=EXT_SCREENS.models.blockify;if(B)B(form)}})(fill);
  function drawForm(){clear(form);F={};var b=cur();
   var fr=(D.sel&&D.sel.frame)||0;mode.textContent=tx(fr>0?'models.tree.mode.anim':'models.tree.mode.skel',{f:fr});
   if(!b){form.appendChild(el('div',{class:'hint',blk:'tree.form.pick',text:tx('models.tree.pickFirst')}));return}
   D.state('bone.get',{bone:b.path}).then(function(g){if(ST.bone!==b.path)return;clear(form);fill(g)}).catch(fail)}
  function fill(g){var p=g.path;
   form.appendChild(el('div',{class:'hint',blk:'tree.form.where',text:tx('models.tree.where',{p:g.path,l:g.line})}));
   // name, parent, joint type, where it hangs
   F.name=el('input',{type:'text','aria-label':tx('models.tree.f.name'),style:'min-width:12em'});F.name.value=g.name;
   F.name.addEventListener('keydown',function(e){if(e.key==='Enter')act('bone.rename',{bone:p,name:F.name.value.trim()})});
   var ren=btn(tx('models.tree.f.renameBtn'),function(){act('bone.rename',{bone:p,name:F.name.value.trim(),anm:anmCb.checked})});
   var anmCb=el('input',{type:'checkbox','aria-label':tx('models.tree.f.renameAnm')});anmCb.checked=true;
   var ty=el('select',{'aria-label':tx('models.tree.f.type')});TYPES.forEach(function(t){var o=el('option',{value:t,text:tx(K+'type.'+(t==='none'?'bone':t))});if(t===g.type)o.selected=true;ty.appendChild(o)});
   ty.addEventListener('change',function(){act('bone.set',{bone:p,type:ty.value})});
   var mv=el('select',{'aria-label':tx('models.tree.f.moveTo')});mv.appendChild(el('option',{value:'',text:tx('models.tree.f.top')}));
   ST.list.bones.forEach(function(x){if(x.path===p||x.path.indexOf(p+'/')===0)return;var o=el('option',{value:x.path,text:x.path});if(x.path===g.parent)o.selected=true;mv.appendChild(o)});
   if(!g.parent)mv.value='';
   var keepW=el('input',{type:'checkbox','aria-label':tx('models.tree.f.keepWorld')});keepW.checked=true;
   form.appendChild(sec(tx('models.tree.s.bone'),'bone',[
    lab(tx('models.tree.f.name'),[F.name,ren,el('label',{},[anmCb,el('span',{text:' '+tx('models.tree.f.renameAnm')})])]),
    lab(tx('models.tree.f.parent'),[el('code',{text:g.parent||tx('models.tree.f.none')}),g.parent?btn(tx('models.tree.a.parent'),function(){select(g.parent)}):null].filter(Boolean)),
    lab(tx('models.tree.f.type'),[ty],tx('models.tree.f.typeHint')),
    lab(tx('models.tree.f.moveTo'),[mv,el('label',{},[keepW,el('span',{text:' '+tx('models.tree.f.keepWorld')})]),btn(tx('models.tree.f.moveBtn'),function(){act('bone.move',{bone:p,parent:mv.value||null,keepWorld:keepW.checked})})]),
    g.prefab?el('div',{class:'hint',text:tx('models.tree.f.prefab',{f:g.prefab})}):null].filter(Boolean)));
   placeSec(g);flagSec(g);if(g.type!=='none')jointSec(g);meshSec(g);seqSec(g);infoSec(g)}

  function placeSec(g){var p=g.path,w=ST.space==='world';
   var sp=el('select',{'aria-label':tx('models.tree.f.space')});['local','world'].forEach(function(k){var o=el('option',{value:k,text:tx(K+'f.space.'+k)});if(k===ST.space)o.selected=true;sp.appendChild(o)});
   sp.addEventListener('change',function(){ST.space=sp.value;drawForm()});
   var pos=w?g.worldPosition:g.position,eu=w?g.worldEuler:g.euler,sc=w?g.worldScale:g.scale;
   var P=[0,1,2].map(function(i){return numIn(pos[i],tx('models.tree.f.pos')+' '+'xyz'[i])}),E=[0,1,2].map(function(i){return numIn(eu[i],tx(K+'f.ang.'+i))}),Sc=[0,1,2].map(function(i){return numIn(sc[i],tx('models.tree.f.scale')+' '+'xyz'[i])});
   var metres=el('span',{class:'hint'});function m(){var a=P.map(function(x){var v=num(x.value);return v===null?'?':fmt(v/20)});metres.textContent=tx('models.tree.f.metres',{x:a[0],y:a[1],z:a[2]})}
   P.forEach(function(x){x.addEventListener('input',m)});m();
   var apply=btn(tx('models.tree.f.apply'),function(){var a=nums(P,tx('models.tree.f.pos')),e=nums(E,tx('models.tree.f.angles')),s=nums(Sc,tx('models.tree.f.scale'));if(!a||!e||!s)return;
    act('bone.place',{bone:p,position:a,euler:e,scale:s,space:ST.space})},'primary');
   // the full matrix, 4 rows of 3 (axes x, y, z, then the position)
   var M=(w?g.world:g.local).map(function(v,i){return numIn(v,tx('models.tree.f.cell',{r:Math.floor(i/3)+1,c:i%3+1}),5)});
   var grid=el('div');for(var r=0;r<4;r++)grid.appendChild(el('div',{class:'row'},[el('span',{style:'min-width:6em',class:'hint',text:tx(K+'f.row.'+r)})].concat(M.slice(r*3,r*3+3))));
   var mApply=btn(tx('models.tree.f.applyMatrix'),function(){var a=nums(M,tx('models.tree.f.matrix'));if(a)act('bone.setMatrix',{bone:p,matrix:a,space:ST.space})});
   var ax=el('select',{'aria-label':tx('models.tree.f.mirrorAxis')});['y','x','z'].forEach(function(k){ax.appendChild(el('option',{value:k,text:tx(K+'f.axis.'+k)}))});
   // nudges: move along the parent's axes, turn about the bone's own axes, grow or shrink
   var stM=numIn(LS.get('models.tree.stepMove',1),tx('models.tree.f.stepMove'),4),stT=numIn(LS.get('models.tree.stepTurn',15),tx('models.tree.f.stepTurn'),4);
   function nud(kind,i,sgn){var s=num(kind==='move'?stM.value:stT.value);if(s===null){say('err',tx('models.tree.badNum',{f:tx('models.tree.f.step')}));return}
    LS.set(kind==='move'?'models.tree.stepMove':'models.tree.stepTurn',s);var v=[0,0,0];v[i]=s*sgn;var a={bone:p};a[kind]=v;act('bone.nudge',a)}
   function nb(kind,i,sgn){return btn((sgn>0?'+':'-')+'xyz'[i],function(){nud(kind,i,sgn)})}
   var nm=[],nt=[];for(var i=0;i<3;i++){nm.push(nb('move',i,-1),nb('move',i,1));nt.push(nb('rotate',i,-1),nb('rotate',i,1))}
   form.appendChild(sec(tx('models.tree.s.place'),'place',[
    lab(tx('models.tree.f.space'),[sp],w?tx('models.tree.f.space.worldHint'):tx('models.tree.f.space.localHint')),
    lab(tx('models.tree.f.pos'),P,tx('models.tree.f.units')),el('div',{class:'row'},[metres]),
    lab(tx('models.tree.f.angles'),E,tx('models.tree.f.deg')),
    lab(tx('models.tree.f.scale'),Sc,g.mirrored?tx('models.tree.f.mirrored'):''),
    el('div',{class:'row'},[apply,btn(tx('models.tree.a.round'),function(){act('bone.round',{bone:p})})]),el('div',{class:'row'},[ax,btn(tx('models.tree.a.mirror'),function(){act('bone.mirror',{bone:p,axis:ax.value})})]),
    el('details',{},[el('summary',{text:tx('models.tree.f.matrix')}),grid,el('div',{class:'row'},[mApply])].concat(g.exact?[]:[el('div',{class:'hint',text:tx('models.tree.f.inexact')})])),
    el('details',{},[el('summary',{text:tx('models.tree.f.nudge')}),
     lab(tx('models.tree.f.stepMove'),[stM].concat(nm),tx('models.tree.f.units')),lab(tx('models.tree.f.stepTurn'),[stT].concat(nt),tx('models.tree.f.deg')),
     el('div',{class:'row'},[btn(tx('models.tree.f.grow'),function(){act('bone.nudge',{bone:p,scale:[1.1,1.1,1.1]})}),btn(tx('models.tree.f.shrink'),function(){act('bone.nudge',{bone:p,scale:[1/1.1,1/1.1,1/1.1]})})])])]))}

  function flagSec(g){var p=g.path;
   var vis=el('select',{'aria-label':tx('models.tree.f.vis')});[['','default'],['1','on'],['0','off']].forEach(function(k){var o=el('option',{value:k[0],text:tx(K+'f.vis.'+k[1])});if((g.visibility==null?'':String(g.visibility))===k[0])o.selected=true;vis.appendChild(o)});
   if(g.visibility!=null&&g.visibility!==0&&g.visibility!==1)vis.appendChild(el('option',{value:String(g.visibility),selected:true,text:String(g.visibility)}));
   vis.addEventListener('change',function(){act('bone.set',{bone:p,visibility:vis.value===''?null:parseInt(vis.value,10)})});
   var term=el('input',{type:'checkbox','aria-label':tx('models.tree.f.terminator')});term.checked=!!g.terminator;
   term.addEventListener('change',function(){act('bone.set',{bone:p,terminator:term.checked})});
   var colOn=el('input',{type:'checkbox','aria-label':tx('models.tree.f.colorOn')});colOn.checked=!!g.colorRaw;
   var col=el('input',{type:'color','aria-label':tx('models.tree.f.color')});col.value=g.color||GREYV;
   function setCol(){act('bone.set',{bone:p,color:colOn.checked?col.value:null})}
   colOn.addEventListener('change',setCol);col.addEventListener('change',function(){if(colOn.checked)setCol()});
   var par=el('input',{type:'text','aria-label':tx('models.tree.f.params'),style:'flex:1;min-width:14em'});par.value=g.params||'';
   function setPar(){act('bone.set',{bone:p,params:par.value.trim()||null})}
   par.addEventListener('keydown',function(e){if(e.key==='Enter')setPar()});
   form.appendChild(sec(tx('models.tree.s.flags'),'flags',[
    lab(tx('models.tree.f.vis'),[vis],tx('models.tree.f.visHint')),
    lab(tx('models.tree.f.terminator'),[term],tx('models.tree.f.terminatorHint')),
    lab(tx('models.tree.f.color'),[colOn,col],tx('models.tree.f.colorHint')),
    lab(tx('models.tree.f.params'),[par,btn(tx('models.tree.f.apply'),setPar)],tx('models.tree.f.paramsHint'))]))}

  function jointSec(g){var p=g.path,L=g.limits||[];
   var use=el('input',{type:'checkbox','aria-label':tx('models.tree.f.limitsOn')});use.checked=!!g.limits;
   var one=el('input',{type:'checkbox','aria-label':tx('models.tree.f.limitsOne')});one.checked=L.length===1;
   var lo=numIn(L[0],tx('models.tree.f.lo')),hi=numIn(L.length>1?L[1]:null,tx('models.tree.f.hi'));
   var spd=numIn(g.speed,tx('models.tree.f.speed')),spd2=numIn(g.speed2,tx('models.tree.f.speed2'));
   function apply(){var a={bone:p};
    if(!use.checked)a.limits=null;else{var x=num(lo.value),y=num(hi.value);if(x===null||(!one.checked&&y===null)){say('err',tx('models.tree.badNum',{f:tx('models.tree.f.limits')}));return}a.limits=one.checked?[x]:[x,y]}
    var s=num(spd.value),s2=num(spd2.value);a.speed=spd.value.trim()===''?null:s;a.speed2=spd2.value.trim()===''?null:s2;
    if((spd.value.trim()&&s===null)||(spd2.value.trim()&&s2===null)){say('err',tx('models.tree.badNum',{f:tx('models.tree.f.speed')}));return}
    act('bone.set',a)}
   form.appendChild(sec(tx('models.tree.s.joint'),'joint',[
    lab(tx('models.tree.f.limits'),[el('label',{},[use,el('span',{text:' '+tx('models.tree.f.limitsOn')})]),el('label',{},[one,el('span',{text:' '+tx('models.tree.f.limitsOne')})]),lo,hi],tx('models.tree.f.deg')),
    lab(tx('models.tree.f.speed'),[spd],tx('models.tree.f.speedHint')),lab(tx('models.tree.f.speed2'),[spd2]),
    el('div',{class:'row'},[btn(tx('models.tree.f.apply'),apply,'primary')])]))}

  // searchKit on a box (tools/gui/README.md): items() -> [{label,value,hint,group}] (the same array while the data stays, so the words in
  // lower case are made once); every word typed must be in the label, value or hint, labels that start with it first. Returns the box
  // to put on the page (the kit's wrapper, or the input alone in a part test without the page's kit)
  function skit(i,key,items,pick,ext){if(typeof searchKit!=='function')return i;var src=null,lo=null,PA=EXT_SCREENS.models.pickAt;
   function get(){var a=items()||[];if(a!==src){src=a;lo=a.map(function(x){return (x.label+' '+x.value+' '+(x.hint||'')).toLowerCase()})}return a}
   return searchKit(i,{key:key,onPick:pick,
    browse:{mode:'file',view:'data',start:function(){return PA.dir(D)},exts:[ext],toValue:function(p,e){var k=PA.key(p,e);return ext==='ply'&&key==='models.tree.find'?PA.stem(k):PA.rel(D,k)}},
    index:function(q,done){var a=get(),w=String(q).toLowerCase().split(/\s+/).filter(Boolean),st=[],mid=[];
     a.forEach(function(x,k){if(w.every(function(t){return lo[k].indexOf(t)>=0}))(String(x.label).toLowerCase().indexOf(w[0])===0?st:mid).push(x)});var r=st.concat(mid);done(r.slice(0,40),Math.max(0,r.length-40))}}).el}
  function boneItems(){var L=ST.list;if(!L)return [];if(L._ski)return L._ski;
   return (L._ski=L.bones.map(function(b){var p=b.path.lastIndexOf('/');return {label:b.name,value:b.path,hint:b.path,group:p<0?tx('models.tree.top'):b.path.slice(0,p)}}))}
  // the files of the document by kind (.ply meshes, .anm animations): the mesh, level of detail and sequence file boxes
  var FI={src:null,ply:[],anm:[]};
  function fileItems(kind){var fl=D.files||[];if(FI.src!==fl){FI={src:fl,ply:[],anm:[]};fl.forEach(function(f){var r=String(f.rel||''),k=f.kind==='ply'||/\.ply$/i.test(r)?'ply':/\.anm$/i.test(r)?'anm':null;
    if(k){var p=r.lastIndexOf('/');FI[k].push({label:r.slice(p+1),value:r.slice(p+1),hint:r,group:p<0?'':r.slice(0,p)})}})}return FI[kind]}
  function plyList(){var dl=el('datalist',{id:'models-tree-ply'});(D.files||[]).forEach(function(f){if(f.kind==='ply'||/\.ply$/i.test(f.rel||''))dl.appendChild(el('option',{value:String(f.rel).replace(/^.*\//,'')}))});return dl}
  function meshSec(g){var p=g.path,m=g.mesh;
   var file=el('input',{type:'text',list:'models-tree-ply','aria-label':tx('models.tree.f.mesh'),style:'flex:1;min-width:12em'});file.value=m?m.file||'':'';
   var cbs={};var flags=VF.map(function(f){var c=el('input',{type:'checkbox','aria-label':tx(K+'vf.'+f)});c.checked=!!(m&&m.flags[f]);cbs[f]=c;return el('label',{},[c,el('span',{text:' '+tx(K+'vf.'+f)})])});
   var layer=el('input',{type:'text','aria-label':tx('models.tree.f.layer'),style:'width:9em'});layer.value=m&&m.layer!=null?m.layer:'';
   function apply(){var fl={};VF.forEach(function(f){fl[f]=cbs[f].checked});var a={bone:p,flags:fl,layer:layer.value.trim()||null};
    if(file.value.trim())a.file=file.value.trim();else if(!m){say('err',tx('models.tree.f.meshFirst'));return}act('bone.mesh',a)}
   var fileBox=skit(file,'models.tree.mesh',function(){return fileItems('ply')},null,'ply');
   var kids=[fileBox===file?plyList():null,lab(tx('models.tree.f.mesh'),[fileBox],m&&m.kind&&m.kind!=='VolumeView'?tx('models.tree.f.viewKind',{k:m.kind}):''),
    el('div',{class:'row'},flags),lab(tx('models.tree.f.layer'),[layer],tx('models.tree.f.layerHint')),
    el('div',{class:'row'},[btn(tx('models.tree.f.apply'),apply,'primary'),m?btn(tx('models.tree.a.deleteMesh'),function(){act('bone.mesh',{bone:p,file:null})}):null].filter(Boolean)),
    el('div',{class:'row'},[btn(tx('models.tree.a.openMesh'),function(){goTo('ply',{bone:p})}),el('span',{class:'hint',text:tx('models.tree.f.meshTools')})])];
   // levels of detail
   var lods=el('div');
   if(g.lod){g.lod.entries.forEach(function(e,i){lods.appendChild(el('div',{class:'row'},[el('span',{text:tx('models.tree.f.lodN',{n:i})}),el('code',{text:e.file||'?'}),
     btn(tx('models.tree.f.lodRemove'),function(){act('bone.lod.remove',{bone:p,index:i})})]))});
    var offCb=el('input',{type:'checkbox','aria-label':tx('models.tree.f.lodOff')});offCb.checked=!!g.lod.off;
    offCb.addEventListener('change',function(){act('bone.lod.off',{bone:p,on:offCb.checked})});
    lods.appendChild(el('label',{},[offCb,el('span',{text:' '+tx('models.tree.f.lodOff')})]))}
   F.lodIn=el('input',{type:'text',list:'models-tree-ply','aria-label':tx('models.tree.f.lodFile'),style:'flex:1;min-width:12em'});
   kids.push(el('div',{style:'margin-top:4px'},[el('b',{text:tx('models.tree.f.lods')})]),lods,
    lab(tx('models.tree.f.lodFile'),[skit(F.lodIn,'models.tree.lod',function(){return fileItems('ply')},null,'ply'),btn(tx('models.tree.a.addLod'),function(){var f=F.lodIn.value.trim();if(!f){say('err',tx('models.tree.f.meshFirst'));return}act('bone.lod.add',{bone:p,file:f})})],g.lod?'':tx('models.tree.f.lodHint')));
   form.appendChild(sec(tx('models.tree.s.mesh'),'mesh',kids))}

  function seqSec(g){var p=g.path;var wrap=el('div'),addRow=el('div',{class:'row','data-blkname':tx('models.tree.f.seqAdd')});
   var own=el('select',{'aria-label':tx('models.tree.f.seqOwner')});['bone','skeleton'].forEach(function(k){var o=el('option',{value:k,text:tx(K+'f.seqOwner.'+k)});if(k===ST.seqOwner)o.selected=true;own.appendChild(o)});
   own.addEventListener('change',function(){ST.seqOwner=own.value;drawSeqs()});
   function drawSeqs(){clear(wrap);clear(addRow);var owner=ST.seqOwner==='skeleton'?null:p;
    (owner===null?D.state('tree.sequences',{}).then(function(j){return j.sequences}):Promise.resolve(g.sequences)).then(function(list){
     if(!list.length)wrap.appendChild(el('div',{class:'hint',text:tx('models.tree.f.noSeq')}));
     list.forEach(function(s){wrap.appendChild(seqRow(owner,s))});
     var nn=el('input',{type:'text','aria-label':tx('models.tree.f.seqName'),placeholder:tx('models.tree.f.seqName'),style:'width:9em'}),nf=el('input',{type:'text','aria-label':tx('models.tree.f.seqFile'),placeholder:tx('models.tree.f.seqFile'),style:'width:12em'});
     [nn,skit(nf,'models.tree.seqFile',function(){return fileItems('anm')},null,'anm'),btn(tx('models.tree.f.seqAdd'),function(){act('bone.seq.add',{bone:owner,name:nn.value.trim(),file:nf.value.trim()||null})})].forEach(function(x){addRow.appendChild(x)})}).catch(fail)}
   form.appendChild(sec(tx('models.tree.s.seq'),'seq',[lab(tx('models.tree.f.seqOwner'),[own]),wrap,addRow]));drawSeqs()}
  function seqRow(owner,s){
   var n=el('input',{type:'text','aria-label':tx('models.tree.f.seqName'),style:'width:8em'});n.value=s.name||'';
   var f=el('input',{type:'text','aria-label':tx('models.tree.f.seqFile'),placeholder:s.fileDefault||'',style:'width:10em'});f.value=s.file||'';
   var sp=numIn(s.speed,tx('models.tree.f.seqSpeed'),4),sm=numIn(s.smooth,tx('models.tree.f.seqSmooth'),4);
   var cb={};var flags=['autostart','store','resume'].map(function(k){var c=el('input',{type:'checkbox','aria-label':tx(K+'f.seq.'+k)});c.checked=!!s[k];cb[k]=c;return el('label',{},[c,el('span',{text:' '+tx(K+'f.seq.'+k)})])});
   function apply(){var fs={file:f.value.trim()||null,speed:sp.value.trim()===''?null:num(sp.value),smooth:sm.value.trim()===''?null:num(sm.value),autostart:cb.autostart.checked,store:cb.store.checked,resume:cb.resume.checked};
    if(n.value.trim()!==s.name)fs.name=n.value.trim();act('bone.seq.set',{bone:owner,sequence:s.name,fields:fs})}
   var kids=[el('div',{class:'row'},[n,skit(f,'models.tree.seqFile',function(){return fileItems('anm')},null,'anm'),el('span',{class:'hint',text:tx('models.tree.f.seqSpeed')}),sp,el('span',{class:'hint',text:tx('models.tree.f.seqSmooth')}),sm].concat(flags)),
    el('div',{class:'row'},[btn(tx('models.tree.f.apply'),apply),btn(tx('models.tree.f.seqRemove'),function(){act('bone.seq.remove',{bone:owner,sequence:s.name})})])];
   if(s.events)kids.push(el('div',{class:'row'},[el('span',{class:'err',text:tx('models.tree.f.events')}),btn(tx('models.tree.f.eventsRemove'),function(){act('bone.seq.events.remove',{bone:owner,sequence:s.name})})]));
   return el('div',{style:'border-left:3px solid var(--line);padding-left:6px;margin:4px 0'},kids)}

  function infoSec(g){var kids=[];
   if(g.volumes.length){var r=el('div',{class:'row'},[el('span',{text:tx('models.tree.f.volumes')})]);
    g.volumes.forEach(function(id){var b=btn(id.slice(id.lastIndexOf('/')+1),function(){goTo('vol',{volume:id})});b.setAttribute('title',tx('models.tree.a.openVol'));r.appendChild(b)});kids.push(r)}
   if(g.unknown.length)kids.push(el('div',{class:'hint',text:tx('models.tree.f.kept',{k:g.unknown.join(', ')})}));
   kids.push(el('div',{class:'hint',text:tx('models.tree.f.world',{x:fmt(g.worldPosition[0]),y:fmt(g.worldPosition[1]),z:fmt(g.worldPosition[2]),mx:fmt(g.worldPositionM[0]),my:fmt(g.worldPositionM[1]),mz:fmt(g.worldPositionM[2])})}));
   form.appendChild(sec(tx('models.tree.s.info'),'info',kids))}

  // ---------- keep in step with the document ----------
  if(ST.off){try{ST.off()}catch(e){}ST.off=null}
  if(D.on)ST.off=D.on(function(ev){if(!ev)return;
   if(ev.type==='open'){ST.bone=null;ST.list=null;ST.hidden={};load()}
   else if(ev.type==='change'){if(ev.rev!==ST.rev&&!ST.busy)load()}
   else if(ev.type==='select'&&ev.sel){var fr=ev.sel.frame||0;mode.textContent=tx(fr>0?'models.tree.mode.anim':'models.tree.mode.skel',{f:fr});
    if(ev.sel.bone&&ev.sel.bone!==ST.bone&&byPath(ev.sel.bone)){ST.bone=ev.sel.bone;drawTree();drawForm()}}});
  mode.textContent=tx(((D.sel&&D.sel.frame)||0)>0?'models.tree.mode.anim':'models.tree.mode.skel',{f:(D.sel&&D.sel.frame)||0});
  if(D.id)load();else if(D.opening)D.opening.then(load).catch(fail);else if(D.open&&ctx.mod&&ctx.set)D.open(ctx).then(load).catch(fail);else say('hint',tx('models.tree.notOpen'));
 };
 EXT_SCREENS.models.subs.tree._t={num:num,fmt:fmt,ST:ST};
})();
`;
