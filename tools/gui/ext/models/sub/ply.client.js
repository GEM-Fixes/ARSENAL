// Models page, Meshes and materials part (parity rows PLY-01..13, MAT-01..06, additions PLY-X1 import OBJ, PLY-X2 export OBJ):
// sub-tab "Meshes and materials". Top to bottom: the list of meshes on the bones (and mesh files on no bone), the selected
// mesh (facts, parts, place on a bone, rename, replace, move/turn/scale, mirror, flip, normals, tangents, weld, bounds, levels
// of detail, skin bones, merge, merge a child bone, split, flags, materials of parts, export to OBJ), bringing in an .obj or
// .ply from disk, then the materials (list, textures found and missing, the editor of one .mtl, a new material).
// Reads only through EXT_SCREENS.models.doc (D.state), changes only through D.op, redraws on D.on. Ops and states:
// tools/lib/model/edit/ply.js. Its one route (sub/ply.server.js) only reads the file to bring in.
// Page rules: no backtick, no dollar-brace, no innerHTML; DOM through h(); text through tx(); no new global names.
// Test seam: EXT_SCREENS.models.subs.ply._t (pure helpers).
// Author: Imperator_Aug (ARSENAL, ia-1a5f7efb)
module.exports = String.raw`
(function(){
 var KINDS=['VolumeView','View'],AXES=['y-up','z-up'],UNITS=['metres','units'],BY=['parts','material','islands'],SMOOTH=['index','position'];
 var ST={gen:0,hooked:false,onEv:null,rel:null,mat:null,list:null,info:null,mats:null,mi:null,want:null};
 // EXT_SCREENS.models.plyWant(rel): show that mesh at the next list load (the Editor's "Show in Models" on a .ply; ../client.js pick)
 EXT_SCREENS.models.plyWant=function(rel){ST.want=rel?String(rel).toLowerCase():null};

 // ---------- pure helpers (test seam) ----------
 function num(s){if(typeof s==='number')return s;s=String(s==null?'':s).trim().replace(',','.');if(!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s))return NaN;return parseFloat(s)}
 function nums(list){var o=[];for(var i=0;i<list.length;i++){var x=num(list[i]);if(!isFinite(x))return null;o.push(x)}return o}
 function words(s){return String(s||'').trim().split(/[\s,;]+/).filter(Boolean)}
 function lines(s){return String(s||'').split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean)}
 function short(rel){rel=String(rel||'');var i=rel.lastIndexOf('/');return i<0?rel:rel.slice(i+1)}
 function r3(x){return Math.round((Number(x)||0)*1000)/1000}
 // '' or 'all' -> 'all'; '0 2' -> [0, 2]; anything else -> null
 function partsArg(s){var w=words(s);if(!w.length||(w.length===1&&w[0].toLowerCase()==='all'))return 'all';var p=nums(w);
  if(!p||!p.every(function(x){return x>=0&&Math.floor(x)===x}))return null;return p}
 // three text boxes -> [x, y, z] (all empty -> null, a bad one -> false)
 function vec(a){var t=a.map(function(x){return String(x==null?'':x).trim()});if(t.every(function(x){return !x}))return null;
  var v=nums(t.map(function(x){return x||'0'}));return v||false}
 // the flag picker: {name: 'on'|'off'|''} -> {set:[..], clear:[..]}
 function flagArgs(pick){var set=[],clear=[];Object.keys(pick||{}).forEach(function(k){if(pick[k]==='on')set.push(k);else if(pick[k]==='off')clear.push(k)});return {set:set,clear:clear}}
 // the material form against what the file holds -> args of mat.edit (null when nothing changes)
 function matChanges(cur,form){var a={},set={},flags={},any=false;cur=cur||{};form=form||{};
  if(form.type&&form.type!==cur.type){a.type=form.type;any=true}
  var had={};(cur.keys||[]).forEach(function(k){had[k.key]=(k.args||[]).join(' ')});
  Object.keys(form.keys||{}).forEach(function(k){var v=String(form.keys[k]==null?'':form.keys[k]).trim(),was=had[k]==null?'':had[k];
   if(v!==was){set[k]=v===''?null:v;any=true}});
  var on={};(cur.flags||[]).forEach(function(f){on[f]=true});
  Object.keys(form.flags||{}).forEach(function(f){if(!!form.flags[f]!==!!on[f]){flags[f]=!!form.flags[f];any=true}});
  if(Object.keys(set).length)a.set=set;if(Object.keys(flags).length)a.flags=flags;return any?a:null}
 function importArgs(j,f){f=f||{};var name=String(f.name||'').trim()||j.name;
  if(j.kind==='ply')return ['ply.attach',{bone:f.bone,name:name,data:j.data,overwrite:!!f.overwrite}];
  var a={obj:j.text,mtl:j.mtl||[],name:name,units:f.units||'metres',axis:f.axis||'y-up',tangents:!!f.tangents,overwrite:!!f.overwrite};
  if(f.bone)a.bone=f.bone;return ['ply.import',a]}

 EXT_SCREENS.models.subs.ply=function(ctx){
  var g=++ST.gen,el=ctx.el,clear=ctx.clear,say=ctx.say,mod=ctx.mod,D=EXT_SCREENS.models.doc;
  // blocks (sub/README.md "Blocks"): the card is the container 'ply'; the mesh list, the selected mesh's form, import and materials are
  // one leaf each (each is drawn again as a whole)
  function PL(id,kids,a){a=a||{};a.blk='ply.'+id;return el('div',a,kids)}
  var card=el('div',{class:'card',style:'margin-top:10px',blk:'ply',box:'col','data-blkname':tx('models.ply.title')});ctx.body.appendChild(card);
  card.appendChild(PL('title',[el('h3',{text:tx('models.ply.title')})]));
  if(!mod){card.appendChild(PL('need',[],{class:'hint',text:tx('models.ply.needMod')}));return}
  if(!D||typeof D.op!=='function'){card.appendChild(PL('need',[],{class:'hint',text:tx('models.ply.noEditor')}));return}
  function live(){return g===ST.gen&&card.isConnected!==false}
  var msg=el('div',{class:'hint',role:'status'});card.appendChild(PL('msg',[msg],{'data-blkname':tx('models.ply.blk.msg')}));
  function err(e){if(live())say(msg,'err',(e&&e.message)||String(e))}
  function run(op,args,after){say(msg,'hint',tx('models.ply.working'));
   return D.op(op,args).then(function(r){var info=(r&&r.info)||{};if(after)after(info);if(!live())return;
    var w=[].concat(info.warnings||[],Array.isArray(info.changed)?info.changed.filter(function(x){return typeof x==='string'}):[]);
    say(msg,'hint',tx('models.ply.done')+(w.length?' '+w.join(' '):''))}).catch(err)}
  function bad(){say(msg,'err',tx('models.ply.badNum'))}
  function btn(k,fn,cls){return el('button',{type:'button',class:cls||'',text:tx(k),onclick:fn})}
  function field(k,kids){return el('label',{class:'row',style:'gap:4px;align-items:center'},[el('span',{text:tx(k)})].concat(kids))}
  function inp(k,w,v){var i=el('input',{type:'text',autocomplete:'off','aria-label':tx(k),style:'width:'+(w||8)+'em'});if(v!=null)i.value=String(v);return i}
  function box(k){return el('input',{type:'checkbox','aria-label':tx(k)})}
  // SEARCH BOXES (searchKit, tools/gui/README.md: a manual browse, an indexed search and a history list on every box that names an
  // existing thing). sk(input, key, items) puts the kit on a box and returns what goes on the page (the kit's wrapper, or the input
  // alone in a part test without the page's kit); items() -> [{label,value,hint,group}], the same array while the data stays, so the
  // words in lower case are made once. Material boxes: the model's materials; texture boxes: the textures the materials name and the
  // document's image files; disk path boxes: the entries of the folder typed so far (one listing per folder, kept). Browse = the file
  // picker: o.browse (a spec), else the game data at the model's folder with o.exts, and o.toValue (default: the file name). Material
  // boxes: .mtl files, the name; texture boxes: image files, the texture as a material names it (EXT_SCREENS.models.pickAt.tex)
  function sk(i,key,items,o){if(typeof searchKit!=='function')return i;o=o||{};var src=null,lo=null,PA=EXT_SCREENS.models.pickAt;
   function get(){var a=items()||[];if(a!==src){src=a;lo=a.map(function(x){return (x.label+' '+x.value+' '+(x.hint||'')).toLowerCase()})}return a}
   return searchKit(i,{key:key,mode:o.mode,onPick:o.onPick,
    browse:o.browse||{mode:'file',view:'data',start:function(){return PA.dir(D)},exts:o.exts||null,toValue:o.toValue||function(p,e){return PA.name(PA.key(p,e))}},
    index:o.index||function(q,done){var a=get(),w=String(q).toLowerCase().split(/\s+/).filter(Boolean),st=[],mid=[];
     a.forEach(function(x,k){if(w.every(function(t){return lo[k].indexOf(t)>=0}))(String(x.label).toLowerCase().indexOf(w[0])===0?st:mid).push(x)});var r=st.concat(mid);done(r.slice(0,40),Math.max(0,r.length-40))}}).el}
  function base(r){r=String(r||'');return r.slice(r.lastIndexOf('/')+1)}
  var MTL={exts:['mtl']},TEXO={exts:EXT_SCREENS.models.pickAt?EXT_SCREENS.models.pickAt.TEX:null,toValue:function(p,e){var PA=EXT_SCREENS.models.pickAt;return PA.tex(D,PA.key(p,e))}};
  var SKI={mats:null,mi:[],tex:null,ti:[],files:null};
  function matItems(){var M=ST.mats;if(SKI.mats!==M){SKI.mats=M;SKI.mi=((M&&M.materials)||[]).map(function(m){var p=String(m.rel).lastIndexOf('/');return {label:base(m.rel),value:base(m.rel),hint:m.rel,group:p<0?'':m.rel.slice(0,p)}})}return SKI.mi}
  function texItems(){var M=ST.mats,fl=D.files||[];if(SKI.tex!==M||SKI.files!==fl){SKI.tex=M;SKI.files=fl;var seen={},out=[];
    function add(v,hint,g){v=String(v||'');if(!v||seen[v.toLowerCase()])return;seen[v.toLowerCase()]=1;out.push({label:v,value:v,hint:hint||'',group:g})}
    ((M&&M.found)||[]).forEach(function(t){add(t.value,t.rel,tx('models.ply.found'))});((M&&M.missing)||[]).forEach(function(t){add(t.value,t.rel,tx('models.ply.missing'))});
    fl.forEach(function(x){if(/\.(dds|tga|png|jpg|bmp)$/i.test(x.rel||''))add(base(x.rel),x.rel,tx('models.ply.found'))});SKI.ti=out}return SKI.ti}
  var LSD={};
  function diskIndex(q,done){var m=/^(.*[\\/])([^\\/]*)$/.exec(q);if(!m||!/^([a-zA-Z]:|[\\/])/.test(q)){done([]);return}var dir=m[1],part=m[2].toLowerCase(),k=dir.toLowerCase();
   function out(j){var a=[];(j.entries||[]).forEach(function(e){if(!part||e.name.toLowerCase().indexOf(part)>=0)a.push({label:e.name+'/',value:dir+e.name+'/',dir:true})});
    (j.files||[]).forEach(function(f){if(/\.(obj|ply)$/i.test(f)&&(!part||f.toLowerCase().indexOf(part)>=0))a.push({label:f,value:dir+f})});done(a.slice(0,40),Math.max(0,a.length-40))}
   if(LSD[k]){if(LSD[k].then)LSD[k].then(out);else out(LSD[k]);return}
   LSD[k]=api('/api/ls?files=1&dir='+encodeURIComponent(dir),undefined,{what:tx('models.ply.job.ls')}).then(function(j){LSD[k]=j;return j},function(){LSD[k]={entries:[],files:[]};return LSD[k]});LSD[k].then(out)}
  function diskBox(i){return sk(i,'models.ply.path',null,{index:diskIndex,
   browse:{mode:'file',view:'disk',exts:['obj','ply'],start:function(){var p=i.value.trim().replace(/[\\/]+$/,'');if(!/^([a-zA-Z]:|[\\/])/.test(p))return S.mod||'';return /\.[a-zA-Z0-9]{1,5}$/.test(p)?p.replace(/[\\/][^\\/]*$/,''):p}},
   onPick:function(v,it){i.value=v;if(it&&it.dir){try{i.focus();i.dispatchEvent(new Event('input',{bubbles:true}))}catch(e){}}}})}
  function chk(k,c){return el('label',{class:'row',style:'gap:4px;align-items:center'},[c,el('span',{text:tx(k)})])}
  function pick(k,vals,fam,cur){var s=el('select',{'aria-label':tx(k)});
   vals.forEach(function(v){var o=el('option',{value:v,text:fam?tx([fam,v].join('.')):v});if(v===cur)o.selected=true;s.appendChild(o)});return s}
  function bonePick(k,cur,none){var s=el('select',{'aria-label':tx(k)});if(none)s.appendChild(el('option',{value:'',text:tx('models.ply.noBone')}));
   ((ST.list&&ST.list.bones)||[]).forEach(function(b){var o=el('option',{value:b.path,text:b.path});if(b.path===cur)o.selected=true;s.appendChild(o)});return s}
  function meshPick(k,skip){var s=el('select',{'aria-label':tx(k)});allMeshes().forEach(function(r){if(r!==skip)s.appendChild(el('option',{value:r,text:r}))});return s}
  function allMeshes(){var L=ST.list||{},seen={},out=[];(L.meshes||[]).concat(L.loose||[]).forEach(function(m){if(m.rel&&m.exists!==false&&!seen[m.rel]){seen[m.rel]=1;out.push(m.rel)}});return out}
  function row(kids){return el('div',{class:'row',style:'flex-wrap:wrap;gap:6px;margin-top:4px'},kids)}
  // blocks built here (sub/README.md "Blocks"): fl a field leaf in the page's fld shape (div.fld > label.f > span.n + control(s) +
  // after: unit, the field's own button; o.text a name from data, o.chk a tick box), lf a leaf, bx a container, sec a section (a
  // column container led by its heading leaf); ids from code constants. redo draws a container again (EXT_SCREENS.models.redo,
  // ../client.js: moved blocks keep their place, one not drawn again is dropped)
  function fl(id,k,ctl,after,o){o=o||{};var t=o.text!=null?o.text:tx(k);return el('div',{class:'fld',blk:id,'data-blkname':t},[el('label',{class:'f'+(o.chk?' chk':'')},[el('span',{class:'n',text:t}),
   ctl.length===1?ctl[0]:el('span',{class:'row'},ctl),after&&after.length?el('span',{},after):el('span')])])}
  function lf(id,kids,a){a=a||{};a.blk=id;return el('div',a,kids)}
  function bx(id,kind,k,kids){return el('div',{class:kind==='row'?'row':'',blk:id,box:kind,'data-blkname':tx(k)},kids)}
  function redo(c,pre,fn){var R=EXT_SCREENS.models.redo;if(R)return R(c,pre,fn);clear(c);return fn()}
  function sec(parent,id,k){var b=el('div',{style:'margin-top:10px',blk:id,box:'col','data-blkname':tx(k)},[lf(id+'.title',[el('h4',{text:tx(k)})])]);parent.appendChild(b);return b}
  function yes(b){return tx(b?'models.ply.yes':'models.ply.no')}
  function tbl(cols,fam){var t=el('table',{class:'tbl'});t.appendChild(el('tr',{},cols.map(function(c){return el('th',{text:tx([fam,c].join('.'))})})));return t}
  function download(name,text){
   // the browser's object-address maker under a local name (the page test looks for outside loads by that word)
   var U=(typeof window!=='undefined'&&window['URL'])||(typeof URL!=='undefined'?URL:null),MK='createObject'+'URL',RV='revokeObject'+'URL';
   if(typeof Blob==='undefined'||!U||!U[MK])return false;
   var u=U[MK](new Blob([text],{type:'text/plain'})),a=el('a',{href:u,download:name});
   if(typeof document!=='undefined'&&document.body&&document.body.appendChild){document.body.appendChild(a);if(a.click)a.click();if(document.body.removeChild)document.body.removeChild(a)}
   else if(a.click)a.click();
   if(U[RV])setTimeout(function(){U[RV](u)},1000);return true}

  card.appendChild(PL('skin',[],{class:'hint',text:tx('models.ply.skinNote')}));
  var listBox=PL('list',[],{style:'overflow-x:auto;max-height:22em;overflow-y:auto;margin-top:6px','data-blkname':tx('models.ply.blk.list')});card.appendChild(listBox);
  var form=PL('form',[],{box:'col',style:'margin-top:8px','data-blkname':tx('models.ply.blk.form')});card.appendChild(form);
  var impBox=PL('import',[],{box:'col',style:'margin-top:12px','data-blkname':tx('models.ply.import')});card.appendChild(impBox);
  var matBox=PL('mats',[],{box:'col',style:'margin-top:12px','data-blkname':tx('models.ply.materials')});card.appendChild(matBox);

  // ---------- list of meshes ----------
  function drawList(){clear(listBox);var L=ST.list;if(!L)return;
   if(L.missing)listBox.appendChild(el('div',{class:'err',text:tx('models.ply.missingN',{n:L.missing})}));
   if(!(L.meshes||[]).length&&!(L.loose||[]).length){listBox.appendChild(el('div',{class:'hint',text:tx('models.ply.none')}));return}
   var t=tbl(['file','bone','view','verts','tris','parts','skin','state'],'models.ply.col');
   (L.meshes||[]).forEach(function(m){t.appendChild(meshRow(m,m.bone,m.lodKind?tx('models.ply.lod',{n:(m.lod||0)+1}):m.view))});
   (L.loose||[]).forEach(function(m){t.appendChild(meshRow(m,'',tx('models.ply.loose')))});
   listBox.appendChild(t)}
  function meshRow(m,boneName,view){var cur=m.rel===ST.rel;
   var state=m.exists===false?tx('models.ply.missing'):m.error?tx('models.ply.unreadable'):m.dirty?tx('models.ply.changed'):m.from==='new'?tx('models.ply.new'):tx('models.ply.ok');
   return el('tr',{class:cur?'sel':'',style:cur?'background:var(--th)':'','aria-selected':cur?'true':'false'},[
    el('td',{},[m.exists===false?el('span',{text:m.rel}):el('button',{type:'button',class:cur?'primary':'',text:short(m.rel),title:m.rel,onclick:function(){pickMesh(m.rel,boneName)}})]),
    el('td',{text:boneName||''}),el('td',{text:view||''}),el('td',{text:m.exists===false?'':String(m.vertices||0)}),el('td',{text:m.exists===false?'':String(m.triangles||0)}),
    el('td',{text:m.parts?String(m.parts.length):''}),el('td',{text:m.skinned?yes(true):''}),el('td',{class:m.exists===false||m.error?'err':'',text:state})])}
  function pickMesh(rel,boneName){ST.rel=rel;if(boneName&&D.select)D.select({bone:boneName});loadMesh()}

  // ---------- the selected mesh ----------
  // the selected mesh: every field its own leaf, ids from constants (the same for every mesh; a field drawn from the mesh's data,
  // a flag or a part, by its place in that list), side by side groups in row containers, each section a container; drawn again
  // through redo (../client.js), so a field the user moved keeps its place
  function drawForm(){redo(form,'ply.form.',drawForm0)}
  function drawForm0(){var I=ST.info,rel=ST.rel,F='ply.form.';
   if(!rel||!I){form.appendChild(lf(F+'pick',[],{class:'hint',text:tx('models.ply.pickOne')}));return}
   form.appendChild(lf(F+'title',[el('h4',{text:tx('models.ply.selected',{m:rel})})]));
   var facts=lf(F+'facts',[el('div',{class:'hint',text:tx('models.ply.facts',{v:I.vertices||0,t:I.triangles||0,p:(I.parts||[]).length,u:I.uvCount||0})}),
    el('div',{class:'hint',text:tx('models.ply.facts2',{n:yes(I.hasNormals),g:yes(I.hasTangents),s:I.skin?I.skin.join(', '):tx('models.ply.no')})}),
    el('div',{class:'hint',text:tx('models.ply.facts3',{s:I.stride||0,f:'0x'+(Number(I.vertFlags||0)).toString(16),l:(I.layout||[]).join(' '),c:(I.chunks||[]).join(' ')})})],{'data-blkname':tx('models.ply.blk.facts')});
   if(I.bounds)facts.appendChild(el('div',{class:'hint',text:tx('models.ply.boundsAre',{a:I.bounds.slice(0,3).map(r3).join(' '),b:I.bounds.slice(3,6).map(r3).join(' ')})}));
   facts.appendChild(el('div',{class:'hint',text:(I.usedBy||[]).length?tx('models.ply.usedBy',{b:I.usedBy.map(function(u){return u.bone}).join(', ')}):tx('models.ply.unused')}));
   form.appendChild(facts);
   // parts
   var pt=tbl(['part','tag','flags','tris','material'],'models.ply.pcol');
   (I.parts||[]).forEach(function(p){var mt=p.material?p.material+' ('+tx(p.materialFound?'models.ply.found':'models.ply.missing')+')':p.textures?p.textures.map(function(x,i){return x?x+' ('+tx(p.textureFound&&p.textureFound[i]?'models.ply.found':'models.ply.missing')+')':''}).filter(Boolean).join(', '):p.inline?tx('models.ply.inline'):'';
    pt.appendChild(el('tr',{},[el('td',{text:String(p.index)}),el('td',{text:p.tag}),el('td',{text:(p.flagNames||[]).join(' ')}),el('td',{text:String(p.triangles)}),el('td',{text:mt})]))});
   form.appendChild(lf(F+'parts',[pt],{style:'overflow-x:auto'}));

   // place on a bone, rename, replace
   var s=sec(form,F+'place','models.ply.place'),P=F+'place.',firstBone=(I.usedBy&&I.usedBy[0]&&I.usedBy[0].bone)||(D.sel&&D.sel.bone)||'';
   var bSel=bonePick('models.ply.bone',firstBone),kSel=pick('models.ply.kind',KINDS,'models.ply.kindOf','VolumeView'),drop=box('models.ply.drop');
   s.appendChild(bx(P+'on','row','models.ply.blk.attach',[fl(P+'on.bone','models.ply.bone',[bSel]),fl(P+'on.kind','models.ply.kind',[kSel]),lf(P+'on.btns',[
    btn('models.ply.attach',function(){if(!bSel.value)return say(msg,'err',tx('models.ply.pickBone'));run('ply.attach',{bone:bSel.value,rel:rel,kind:kSel.value})},'primary'),
    btn('models.ply.detach',function(){if(!bSel.value)return say(msg,'err',tx('models.ply.pickBone'));run('ply.detach',{bone:bSel.value,drop:!!drop.checked})})],{class:'row'}),fl(P+'on.drop','models.ply.drop',[drop],null,{chk:1})]));
   var toIn=inp('models.ply.newName',14,short(rel));
   s.appendChild(fl(P+'rename','models.ply.newName',[toIn],[btn('models.ply.rename',function(){run('ply.rename',{rel:rel,to:toIn.value.trim()},function(i){if(i.to)ST.rel=i.to})})]));
   var fromSel=meshPick('models.ply.fromMesh',rel),pathIn=inp('models.ply.path',22);
   s.appendChild(fl(P+'from','models.ply.fromMesh',[fromSel],[btn('models.ply.replace',function(){if(!fromSel.value)return say(msg,'err',tx('models.ply.pickMesh'));run('ply.replace',{rel:rel,from:fromSel.value})})]));
   s.appendChild(fl(P+'disk','models.ply.path',[diskBox(pathIn)],[btn('models.ply.replaceDisk',function(){readDisk(pathIn.value,function(j){if(j.kind!=='ply')return say(msg,'err',tx('models.ply.needPly'));run('ply.replace',{rel:rel,data:j.data})})})]));

   // shape
   s=sec(form,F+'shape','models.ply.shape');P=F+'shape.';
   var mv=[0,1,2].map(function(i){return inp(['models.ply.xyz',i].join('.'),5)}),tu=[0,1,2].map(function(i){return inp(['models.ply.xyz',i].join('.'),5)}),sc=inp('models.ply.scaleBy',5);
   s.appendChild(bx(P+'tr','row','models.ply.applyMove',[fl(P+'tr.move','models.ply.move',mv),fl(P+'tr.turn','models.ply.turn',tu),fl(P+'tr.scale','models.ply.scaleBy',[sc]),
    lf(P+'tr.apply',[btn('models.ply.applyMove',function(){var m=vec(mv.map(function(x){return x.value})),t=vec(tu.map(function(x){return x.value})),f=String(sc.value).trim();
     if(m===false||t===false||(f&&!isFinite(num(f))))return bad();if(!m&&!t&&!f)return say(msg,'err',tx('models.ply.nothing'));var a={rel:rel};if(m)a.move=m;if(t)a.turn=t;if(f)a.scale=num(f);run('ply.transform',a)},'primary')])]));
   var fac=inp('models.ply.factor',5);
   s.appendChild(bx(P+'fac','row','models.ply.blk.mirror',[fl(P+'fac.factor','models.ply.factor',[fac],[btn('models.ply.scale',function(){var f=nums(words(fac.value));if(!f||!(f.length===1||f.length===3))return bad();run('ply.scale',{rel:rel,factor:f.length===1?f[0]:f})})]),
    lf(P+'fac.mirror',[btn('models.ply.mirror.x',function(){run('ply.mirror',{rel:rel,axis:'x'})}),btn('models.ply.mirror.y',function(){run('ply.mirror',{rel:rel,axis:'y'})}),btn('models.ply.mirror.z',function(){run('ply.mirror',{rel:rel,axis:'z'})}),
     btn('models.ply.flip',function(){run('ply.flip',{rel:rel})})],{class:'row','data-blkname':tx('models.ply.blk.mirror')})]));
   var sm=pick('models.ply.smooth',SMOOTH,'models.ply.smoothBy','index'),tg=box('models.ply.withTangents'),tol=inp('models.ply.tolerance',5,'0.001');
   var nb=btn('models.ply.normals',function(){run('ply.normals',{rel:rel,smooth:sm.value,tangents:!!tg.checked})});nb.disabled=!I.canNormals;
   var tb=btn('models.ply.tangents',function(){run('ply.tangents',{rel:rel})});tb.disabled=!I.canNormals;
   var wb=btn('models.ply.weld',function(){var t=num(tol.value);if(!(t>0))return bad();run('ply.weld',{rel:rel,tolerance:t})});wb.disabled=!I.canWeld;
   s.appendChild(bx(P+'norm','row','models.ply.blk.normals',[fl(P+'norm.smooth','models.ply.smooth',[sm]),fl(P+'norm.tangents','models.ply.withTangents',[tg],null,{chk:1}),lf(P+'norm.btns',[nb,tb],{class:'row'}),
    fl(P+'norm.tol','models.ply.tolerance',[tol],[wb]),lf(P+'norm.bounds',[btn('models.ply.bounds',function(){run('ply.bounds',{rel:rel})})])]));
   if(!I.canNormals)s.appendChild(lf(P+'nonormals',[],{class:'hint',text:tx('models.ply.noNormals')}));

   // levels of detail
   s=sec(form,F+'lods','models.ply.lods');P=F+'lods.';
   var lb=bonePick('models.ply.bone',firstBone),lt=el('textarea',{rows:3,'aria-label':tx('models.ply.lodFiles'),style:'width:26em'}),off=box('models.ply.off');lt.value=rel;
   s.appendChild(lf(P+'hint',[],{class:'hint',text:tx('models.ply.lodHint')}));
   s.appendChild(bx(P+'set','row','models.ply.lods',[fl(P+'set.bone','models.ply.bone',[lb]),lf(P+'set.files',[lt],{'data-blkname':tx('models.ply.lodFiles')}),fl(P+'set.off','models.ply.off',[off],null,{chk:1}),
    lf(P+'set.go',[btn('models.ply.setLods',function(){if(!lb.value)return say(msg,'err',tx('models.ply.pickBone'));run('ply.lods',{bone:lb.value,files:lines(lt.value),off:!!off.checked})})])]));

   // skin bones
   if(I.skin){s=sec(form,F+'skin','models.ply.skin');P=F+'skin.';
    var sf=pick('models.ply.skinFrom',I.skin,null,I.skin[0]),st=inp('models.ply.skinTo',12);
    s.appendChild(bx(P+'set','row','models.ply.skin',[fl(P+'set.from','models.ply.skinFrom',[sf]),fl(P+'set.to','models.ply.skinTo',[st]),lf(P+'set.btns',[btn('models.ply.skinRename',function(){run('ply.skin',{rel:rel,rename:{from:sf.value,to:st.value.trim()}})}),
     btn('models.ply.clamp',function(){run('ply.skin',{rel:rel,clamp:true})})],{class:'row'})]))}

   // merge and split
   s=sec(form,F+'join','models.ply.join');P=F+'join.';
   var mf=meshPick('models.ply.fromMesh',rel),out=inp('models.ply.out',12);
   s.appendChild(bx(P+'merge','row','models.ply.merge',[fl(P+'merge.from','models.ply.fromMesh',[mf]),fl(P+'merge.out','models.ply.out',[out]),lf(P+'merge.go',[btn('models.ply.merge',function(){if(!mf.value)return say(msg,'err',tx('models.ply.pickMesh'));
    var a={rel:rel,from:mf.value};if(out.value.trim())a.out=out.value.trim();run('ply.merge',a,function(i){if(i.out)ST.rel=i.out})})])]));
   var cb=bonePick('models.ply.child',firstBone);
   s.appendChild(fl(P+'child','models.ply.child',[cb],[btn('models.ply.mergeChild',function(){if(!cb.value)return say(msg,'err',tx('models.ply.pickBone'));run('ply.mergeChild',{bone:cb.value},function(i){if(i.out)ST.rel=i.out})})]));
   s.appendChild(lf(P+'childhint',[],{class:'hint',text:tx('models.ply.mergeChildHint')}));
   var db=bonePick('models.ply.bone',firstBone),by=pick('models.ply.by',BY,'models.ply.byWhat','parts'),rc=box('models.ply.recentre'),kp=box('models.ply.keepParent');
   s.appendChild(bx(P+'split','row','models.ply.demerge',[fl(P+'split.bone','models.ply.bone',[db]),fl(P+'split.by','models.ply.by',[by]),fl(P+'split.recentre','models.ply.recentre',[rc],null,{chk:1}),fl(P+'split.keep','models.ply.keepParent',[kp],null,{chk:1}),
    lf(P+'split.go',[btn('models.ply.demerge',function(){if(!db.value)return say(msg,'err',tx('models.ply.pickBone'));run('ply.demerge',{bone:db.value,by:by.value,recentre:!!rc.checked,keepParent:!!kp.checked})})])]));

   // flags (one field per flag of the mesh's list, by its place in the list)
   s=sec(form,F+'flags','models.ply.flags');P=F+'flags.';s.appendChild(lf(P+'hint',[],{class:'hint',text:tx('models.ply.flagsHint')}));
   var pIn=inp('models.ply.parts',8,'all'),fp={};
   var fr=bx(P+'pick','row','models.ply.flags',[fl(P+'pick.parts','models.ply.parts',[pIn])]);
   (I.flagList||[]).forEach(function(f,i){var sl=pick('models.ply.flag',['keep','on','off'],'models.ply.flagSet','keep');sl.setAttribute('aria-label',f);fp[f]=sl;
    fr.appendChild(fl(P+'pick.f'+i,null,[sl],null,{text:f}))});
   s.appendChild(fr);
   var vs=inp('models.ply.vset',8),vc=inp('models.ply.vclear',8),mfrom=inp('models.ply.matFrom',10),mto=inp('models.ply.matTo',10),force=box('models.ply.force');
   s.appendChild(bx(P+'more','row','models.ply.applyFlags',[fl(P+'more.vset','models.ply.vset',[vs]),fl(P+'more.vclear','models.ply.vclear',[vc]),fl(P+'more.matfrom','models.ply.matFrom',[sk(mfrom,'models.ply.matFrom',matItems,MTL)]),fl(P+'more.matto','models.ply.matTo',[sk(mto,'models.ply.matTo',matItems,MTL)]),fl(P+'more.force','models.ply.force',[force],null,{chk:1}),
    lf(P+'more.go',[btn('models.ply.applyFlags',function(){var parts=partsArg(pIn.value);if(parts===null)return bad();var p={};Object.keys(fp).forEach(function(k){p[k]=fp[k].value});var fa=flagArgs(p);
     var a={rel:rel,parts:parts,force:!!force.checked};if(fa.set.length)a.set=fa.set;if(fa.clear.length)a.clear=fa.clear;
     if(words(vs.value).length)a.vset=words(vs.value);if(words(vc.value).length)a.vclear=words(vc.value);
     if(mfrom.value.trim())a.material={from:mfrom.value.trim(),to:mto.value.trim()};
     if(!a.set&&!a.clear&&!a.vset&&!a.vclear&&!a.material)return say(msg,'err',tx('models.ply.nothing'));run('ply.tweak',a)},'primary')])]));

   // materials of the parts (one row per part, by its index)
   s=sec(form,F+'pmat','models.ply.partMats');P=F+'pmat.';
   (I.parts||[]).forEach(function(p){var Q=P+'p'+p.index,r=el('div',{class:'row',blk:Q,box:'row','data-blkname':tx('models.ply.partN',{n:p.index})},[lf(Q+'.n',[el('span',{text:tx('models.ply.partN',{n:p.index})})])]);s.appendChild(r);
    if(p.textures&&!p.material){var ti=inp('models.ply.textures',20,p.textures.filter(Boolean).join(' '));
     r.appendChild(fl(Q+'.tex','models.ply.textures',[sk(ti,'models.ply.textures',texItems,{mode:'token',exts:TEXO.exts,toValue:TEXO.toValue})],[btn('models.ply.setTextures',function(){run('mat.textures',{rel:rel,part:p.index,textures:words(ti.value)})})]));return}
    var mi=inp('models.ply.matName',16,p.material||''),cr=box('models.ply.create');
    r.appendChild(fl(Q+'.mat','models.ply.matName',[sk(mi,'models.ply.matName',matItems,MTL)]));r.appendChild(fl(Q+'.create','models.ply.create',[cr],null,{chk:1}));
    r.appendChild(lf(Q+'.go',[btn('models.ply.setMat',function(){run('mat.set',{rel:rel,part:p.index,name:mi.value.trim(),create:!!cr.checked})})]))});
   var ai=inp('models.ply.matName',16),ac=box('models.ply.create');
   s.appendChild(bx(P+'all','row','models.ply.allParts',[lf(P+'all.n',[el('span',{text:tx('models.ply.allParts')})]),fl(P+'all.mat','models.ply.matName',[sk(ai,'models.ply.matName',matItems,MTL)]),fl(P+'all.create','models.ply.create',[ac],null,{chk:1}),
    lf(P+'all.go',[btn('models.ply.setMat',function(){run('mat.set',{rel:rel,part:'all',name:ai.value.trim(),create:!!ac.checked})})])]));

   // export
   s=sec(form,F+'export','models.ply.export');P=F+'export.';
   if(I.skin)s.appendChild(lf(P+'skin',[],{class:'hint',text:tx('models.ply.exportSkin')}));
   var eu=pick('models.ply.units',UNITS,'models.ply.unitsOf','metres'),ea=pick('models.ply.axis',AXES,'models.ply.axisOf','y-up');
   s.appendChild(bx(P+'opts','row','models.ply.export',[fl(P+'opts.units','models.ply.units',[eu]),fl(P+'opts.axis','models.ply.axis',[ea]),lf(P+'opts.go',[btn('models.ply.exportBtn',function(){say(msg,'hint',tx('models.ply.working'));
    D.state('ply.export',{rel:rel,units:eu.value,axis:ea.value}).then(function(j){if(!live())return;ST.exported=j;
     var a=download(j.name+'.obj',j.obj),b=a&&download(j.name+'.mtl',j.mtl);
     say(msg,'hint',a&&b?tx('models.ply.exported',{m:j.name,v:j.vertices,t:j.triangles}):tx('models.ply.noDownload'))}).catch(err)},'primary')])]))}

  // ---------- bring in a file from disk ----------
  function readDisk(path,then){path=String(path||'').trim();if(!path)return say(msg,'err',tx('models.ply.needPath'));
   say(msg,'hint',tx('models.ply.reading'));
   api('/api/x/models/ply/import-read',{path:path},{what:tx('models.ply.job.ply')}).then(function(j){if(!live())return;if(!j||j.ok===false)return say(msg,'err',(j&&j.error)||tx('models.ply.readFail'));then(j)}).catch(err)}
  function drawImport(){redo(impBox,'ply.import.',drawImport0)}
  function drawImport0(){var P='ply.import.';impBox.appendChild(lf(P+'title',[el('h4',{text:tx('models.ply.import')})]));
   impBox.appendChild(lf(P+'hint',[],{class:'hint',text:tx('models.ply.importHint')}));
   var pIn=inp('models.ply.path',26),nIn=inp('models.ply.name',12),u=pick('models.ply.units',UNITS,'models.ply.unitsOf','metres'),a=pick('models.ply.axis',AXES,'models.ply.axisOf','y-up');
   var b=bonePick('models.ply.bone',D.sel&&D.sel.bone||'',true),tg=box('models.ply.withTangents'),ow=box('models.ply.overwrite');
   impBox.appendChild(bx(P+'file','row','models.ply.blk.importFile',[fl(P+'file.path','models.ply.path',[diskBox(pIn)]),fl(P+'file.name','models.ply.name',[nIn])]));
   impBox.appendChild(bx(P+'opts','row','models.ply.blk.importOpts',[fl(P+'opts.units','models.ply.units',[u]),fl(P+'opts.axis','models.ply.axis',[a]),fl(P+'opts.bone','models.ply.bone',[b]),
    fl(P+'opts.tangents','models.ply.withTangents',[tg],null,{chk:1}),fl(P+'opts.overwrite','models.ply.overwrite',[ow],null,{chk:1}),
    lf(P+'opts.go',[btn('models.ply.importBtn',function(){readDisk(pIn.value,function(j){
     if(j.kind==='ply'&&!b.value)return say(msg,'err',tx('models.ply.pickBone'));
     var x=importArgs(j,{name:nIn.value,bone:b.value,units:u.value,axis:a.value,tangents:tg.checked,overwrite:ow.checked});
     run(x[0],x[1],function(i){if(i.rel)ST.rel=i.rel;
      var w=[];if((j.mtlMissing||[]).length)w.push(tx('models.ply.mtlMissing',{f:j.mtlMissing.join(', ')}));if(i.normalsMade)w.push(tx('models.ply.normalsMade'));if(i.uvsMissing)w.push(tx('models.ply.uvsMissing'));
      i.warnings=w.concat(i.warnings||[])})})},'primary')])]))}

  // ---------- materials ----------
  function drawMats(){redo(matBox,'ply.mats.',drawMats0)}
  function drawMats0(){var P='ply.mats.',M=ST.mats;matBox.appendChild(lf(P+'title',[el('h4',{text:tx('models.ply.materials')})]));if(!M)return;
   matBox.appendChild(lf(P+'count',[],{class:'hint',text:tx('models.ply.texCount',{f:(M.found||[]).length,m:(M.missing||[]).length})}));
   if((M.missingMaterials||[]).length)matBox.appendChild(lf(P+'matmissing',[],{class:'err',text:tx('models.ply.matMissing',{f:M.missingMaterials.map(function(m){return m.rel}).join(', ')})}));
   if((M.missing||[]).length){var ul=el('ul');M.missing.forEach(function(t){ul.appendChild(el('li',{class:'err',text:tx('models.ply.texMissing',{t:t.value||t.rel||'',by:t.material||t.mesh||''})}))});matBox.appendChild(lf(P+'texmissing',[ul],{'data-blkname':tx('models.ply.blk.texMissing')}))}
   if(!(M.materials||[]).length)matBox.appendChild(lf(P+'list',[],{class:'hint',text:tx('models.ply.noMats')}));
   else{var t=tbl(['file','type','used','tex'],'models.ply.mcol');
    M.materials.forEach(function(m){var cur=m.rel===ST.mat,tex=(m.textures||[]),miss=tex.filter(function(x){return !x.found}).length;
     t.appendChild(el('tr',{class:cur?'sel':'',style:cur?'background:var(--th)':'','aria-selected':cur?'true':'false'},[
      el('td',{},[el('button',{type:'button',class:cur?'primary':'',text:short(m.rel),title:m.rel,onclick:function(){ST.mat=m.rel;loadMat()}})]),
      el('td',{text:m.exists===false?tx('models.ply.missing'):(m.type||'')}),el('td',{text:String((m.usedBy||[]).length)}),
      el('td',{class:miss?'err':'',text:tx('models.ply.texOf',{f:tex.length-miss,m:miss})})]))});
    matBox.appendChild(lf(P+'list',[t],{style:'overflow-x:auto','data-blkname':tx('models.ply.blk.matList')}))}
   drawMat();
   // a new material
   var nn=inp('models.ply.matName',14),nt=pick('models.ply.type',M.types||['simple'],null,'simple'),nd=inp('models.ply.diffuse',14);
   matBox.appendChild(lf(P+'new.title',[el('h4',{text:tx('models.ply.newMat')})]));
   matBox.appendChild(bx(P+'new','row','models.ply.newMat',[fl(P+'new.name','models.ply.matName',[nn]),fl(P+'new.type','models.ply.type',[nt]),fl(P+'new.diffuse','models.ply.diffuse',[sk(nd,'models.ply.diffuse',texItems,TEXO)]),lf(P+'new.go',[btn('models.ply.createBtn',function(){
    var a={name:nn.value.trim(),type:nt.value};if(nd.value.trim())a.set={diffuse:nd.value.trim()};run('mat.create',a,function(i){if(i.rel)ST.mat=i.rel})})])]))}
  // the selected material (a texture key or a flag field by its place in the page's list of keys or flags)
  function drawMat(){var I=ST.mi,M=ST.mats||{},P='ply.mats.sel.';if(!ST.mat||!I)return;
   var f=el('div',{class:'card',style:'margin-top:6px',blk:'ply.mats.sel',box:'col','data-blkname':tx('models.ply.blk.matSel')});matBox.appendChild(f);
   f.appendChild(lf(P+'title',[el('h4',{text:tx('models.ply.matSel',{m:I.rel})})]));
   if(I.exists===false){f.appendChild(lf(P+'nofile',[],{class:'err',text:tx('models.ply.matNoFile')}));
    f.appendChild(lf(P+'stub',[btn('models.ply.makeStub',function(){run('mat.create',{rel:I.rel})},'primary')]));return}
   if(I.error){f.appendChild(lf(P+'bad',[],{class:'err',text:tx('models.ply.matBad',{e:I.error})}));return}
   var tSel=pick('models.ply.type',M.types||[I.type],null,I.type),keys={},flags={},cur={};
   (I.keys||[]).forEach(function(k){cur[k.key]=(k.args||[]).join(' ')});
   f.appendChild(fl(P+'type','models.ply.type',[tSel]));
   var found={};(I.textures||[]).forEach(function(t){found[t.key]=t.found});
   (M.textureKeys||[]).forEach(function(k,n){var i=inp('models.ply.texKey',18,cur[k]||'');i.setAttribute('aria-label',k);keys[k]=i;
    f.appendChild(fl(P+'k'+n,null,[sk(i,'models.ply.texKey',texItems,TEXO)],cur[k]?[el('span',{class:found[k]?'hint':'err',text:tx(found[k]?'models.ply.found':'models.ply.missing')})]:null,{text:k}))});
   var bl=pick('models.ply.blend',[''].concat(M.blends||[]),null,cur.blend||'');keys.blend=bl;
   var co=inp('models.ply.colour',12,cur.color||'');keys.color=co;
   f.appendChild(bx(P+'look','row','models.ply.blk.look',[fl(P+'look.blend','models.ply.blend',[bl]),fl(P+'look.colour','models.ply.colour',[co])]));
   var fr=bx(P+'flags','row','models.ply.blk.matFlags',[]);(M.flags||[]).forEach(function(n,x){var c=el('input',{type:'checkbox','aria-label':n});c.checked=(I.flags||[]).indexOf(n)>=0;flags[n]=c;
    fr.appendChild(fl(P+'flags.f'+x,null,[c],null,{chk:1,text:n}))});f.appendChild(fr);
   f.appendChild(lf(P+'apply',[btn('models.ply.applyMat',function(){var form={type:tSel.value,keys:{},flags:{}};Object.keys(keys).forEach(function(k){form.keys[k]=keys[k].value});
    Object.keys(flags).forEach(function(k){form.flags[k]=!!flags[k].checked});var a=matChanges(I,form);if(!a)return say(msg,'err',tx('models.ply.nothing'));a.rel=I.rel;run('mat.edit',a)},'primary')]))}

  // ---------- load and redraw ----------
  function loadMesh(){if(!live())return;if(!ST.rel){ST.info=null;drawList();drawForm();return}
   D.state('ply.get',{rel:ST.rel}).then(function(j){if(!live())return;ST.info=j;drawList();drawForm()}).catch(function(e){ST.info=null;drawList();drawForm();err(e)})}
  function loadMat(){if(!live())return;if(!ST.mat){ST.mi=null;drawMats();return}
   D.state('mat.get',{rel:ST.mat}).then(function(j){if(!live())return;ST.mi=j;drawMats()}).catch(function(e){ST.mi=null;drawMats();err(e)})}
  function load(){if(!live())return;
   Promise.all([D.state('ply.list',{}),D.state('mat.list',{})]).then(function(r){if(!live())return;ST.list=r[0]||{meshes:[],loose:[],bones:[]};ST.mats=r[1];
    if(ST.rel&&allMeshes().indexOf(ST.rel)<0)ST.rel=null;
    if(ST.want){var w=ST.want,hit=null;ST.want=null;(ST.list.meshes||[]).concat(ST.list.loose||[]).forEach(function(m){if(!hit&&m.rel&&String(m.rel).toLowerCase()===w)hit=m});
     if(hit){ST.rel=hit.rel;if(hit.bone&&D.select)D.select({bone:hit.bone})}}
    drawImport();loadMesh();loadMat()}).catch(err)}
  ST.onEv=function(ev){if(!live()||!ev)return;if(ev.type==='change'||ev.type==='open')load()};
  // the page drops listeners added while it draws, so this one is added at each draw and the last one removed first
  if(typeof ST.off==='function')ST.off();ST.off=null;
  if(typeof D.on==='function'){var off=D.on(function(ev){if(ST.onEv)ST.onEv(ev)});ST.off=typeof off==='function'?off:null}
  drawForm();
  if(D.id)load();else if(typeof D.open==='function'){say(msg,'hint',tx('models.ply.opening'));D.open(ctx).then(function(){load()}).catch(err)}
 };
 EXT_SCREENS.models.subs.ply._t={num:num,nums:nums,words:words,lines:lines,short:short,partsArg:partsArg,vec:vec,flagArgs:flagArgs,matChanges:matChanges,importArgs:importArgs};
})();
`;
