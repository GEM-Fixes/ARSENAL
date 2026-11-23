// Models page, Armor part under Gates of Hell: the shot test by GoH's own rules (sub/armorgoh.js routes, tools/armorsim/goh.js).
// Appended to armor.client.js (its module.exports adds this string); armor.client.js calls EXT_SCREENS.models.armorGoh(ctx, H)
// under GoH only, with its helpers H = { card, L, C, call, say, ST, shooter, ready, sideWord, partWords }, and gets back the function
// that works out the part map again (its loadMap calls it when the gun, shell or range changes).
// Here the user picks the part (hit volume), its side and the angle from square on; the 3D shot and map of armor.client.js answer by
// GoH's rules too, and armor.client.js hands each 3D shot result to runMap.shot3 (the first armoured plate here). Every answer shows the line
// "read from notes and data, not tested in game [T]" and the rules left out; a piece GoH's notes leave open shows its reason.
// A stopped shell shows whether it may bounce; a 3D shot lists every plate behind the first with what is left of the shell (gohsim03),
// where it bursts with its blast rows, and the bounce's flight leg after leg. Difficulty, side and mission armour scale go in
// ST.gohRules, which armor.client.js shooter() adds to every GoH body (gohwave).
// Page rules: no backtick, no dollar-brace, no innerHTML; text through tx(); every control in a leaf block (armor.goh.*).
// Author: Imperator_Aug (ARSENAL, ia-814558eb)
module.exports = String.raw`
(function(){
 var GSIDES=['front','top','left','right','rear','bottom'],GRES={penetrate:1,no_penetration:1},GOM={calibre:1,fixed:1,slope:1,damping:1,'default':1},GGRP=['player','ally','enemy','neutral'],GSTATE={working:1,broken:1,destroyed:1},GRULE={own:1,area:1,raycast:1,none:1},GGATE={calibre:1,noDamageAcc:1,threshold:1},
  GLRES={penetrate:1,ricochet:1,no_penetration:1,skipped:1,beyond_jet:1,missed:1,refused:1},GEND={passed_all:1,ground:1,ricochet:1,no_penetration:1,beyond_jet:1};
 function gk(a,b){return tx([a,b].join('.'))}
 function n2(x){return Math.round((Number(x)||0)*100)/100}
 function why(code){return gk('models.armor.goh.r',code)}
 EXT_SCREENS.models.armorGoh=function(ctx,H){
  var el=ctx.el,clear=ctx.clear,ST=H.ST,L=H.L,say=H.say;
  var box=H.C('goh',[],'col',tx('models.armor.goh.sim'),{style:'margin-bottom:10px'});
  var angIn=el('input',{type:'number',min:'0',max:'90',step:'5','aria-label':tx('models.armor.goh.angle'),style:'width:5em'});
  angIn.value=String(ST.gohAngle==null?0:ST.gohAngle);
  var partSel=el('select',{'aria-label':tx('models.armor.goh.part')}),sideSel=el('select',{'aria-label':tx('models.armor.goh.side')});
  GSIDES.forEach(function(s){sideSel.appendChild(el('option',{value:s,text:H.sideWord(s)}))});
  var R=ST.gohRules||(ST.gohRules={}),lvSel=el('select',{'aria-label':tx('models.armor.goh.level')}),grSel=el('select',{'aria-label':tx('models.armor.goh.group')}),
   scIn=el('input',{type:'number',min:'0.05',max:'20',step:'0.05','aria-label':tx('models.armor.goh.scale'),style:'width:5em'});
  GGRP.forEach(function(g){var o=el('option',{value:g,text:gk('models.armor.goh.grp',g)});if(g===(R.group||'ally'))o.selected=true;grSel.appendChild(o)});
  scIn.value=String(R.armorScale==null?1:R.armorScale);
  function fillLevels(r){if(!r||!(r.levels||[]).length)return;var cur=R.difficulty||r.difficulty||'';clear(lvSel);r.levels.forEach(function(n){var o=el('option',{value:n,text:n});if(n===cur)o.selected=true;lvSel.appendChild(o)})}
  function setRules(){var s=Number(scIn.value);R.group=grSel.value;R.difficulty=lvSel.value||undefined;R.armorScale=isFinite(s)&&s>=0.05&&s<=20?s:1;runMap()}
  lvSel.addEventListener('change',setRules);grSel.addEventListener('change',setRules);scIn.addEventListener('change',setRules);
  var msg=el('div',{class:'hint'}),out=el('div'),mapOut=el('div'),outList=el('ul');
  var mapBtn=el('button',{type:'button',text:tx('models.armor.goh.mapBtn'),onclick:function(){runMap()}});
  var shootBtn=el('button',{type:'button',class:'primary',text:tx('models.armor.goh.shoot'),onclick:function(){shoot()}});
  box.appendChild(L('goh.title',[el('h4',{text:tx('models.armor.goh.sim')})]));
  box.appendChild(L('goh.note',[],{class:'hint',text:tx('models.armor.goh.noteT')}));
  box.appendChild(L('goh.angle',[el('span',{text:tx('models.armor.goh.angle')}),angIn,el('span',{text:tx('models.armor.goh.deg')}),mapBtn],{class:'row'}));
  box.appendChild(L('goh.rules',[el('span',{text:tx('models.armor.goh.level')}),lvSel,el('span',{text:tx('models.armor.goh.group')}),grSel,el('span',{text:tx('models.armor.goh.scale')}),scIn],{class:'row'}));
  box.appendChild(L('goh.pick',[el('span',{text:tx('models.armor.goh.part')}),partSel,el('span',{text:tx('models.armor.goh.side')}),sideSel,shootBtn],{class:'row'}));
  box.appendChild(L('goh.msg',[msg]));box.appendChild(L('goh.res',[out]));box.appendChild(L('goh.map',[mapOut]));
  box.appendChild(L('goh.left',[el('details',{},[el('summary',{text:tx('models.armor.goh.leftOut')}),outList])]));
  H.card.appendChild(box);
  function angle(){var a=Number(angIn.value);return isFinite(a)&&a>=0&&a<=90?a:null}
  angIn.addEventListener('change',function(){var a=angle();if(a==null){say(msg,'err',tx('models.armor.goh.badAngle'));return}ST.gohAngle=a;runMap()});
  function rulesText(r){var t=tx('models.armor.goh.rulesLine',{d:r.difficulty||'-',g:gk('models.armor.goh.grp',GGRP.indexOf(r.group)>=0?r.group:'ally'),a:n2(r.armor),v:n2(r.vehicleHealth),s:n2(r.armorScale)});
   if(r.asked)t+=' '+tx('models.armor.goh.rulesAsked',{w:r.asked,d:r.difficulty||'-'});return t}
  function heads(j,to){if(j.rules){fillLevels(j.rules);to.appendChild(el('div',{class:'hint',text:rulesText(j.rules)}))}
   if(j.flame)to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.flame')}));if(j.noCalibre)to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.noCal')}));
   if(j.pastTable)to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.pastTable',{m:n2(j.rangeM)})}))}
  function leftOut(j){clear(outList);(j.leftOut||[]).forEach(function(c){outList.appendChild(el('li',{text:gk('models.armor.goh.out',c)}))})}
  function fillParts(rows){var cur=partSel.value||ST.gohPart||'';clear(partSel);
   (rows||[]).forEach(function(r){var pw=H.partWords(r.volume),o=el('option',{value:r.volume,text:r.volume+(pw?' '+pw:'')});if(r.volume===cur)o.selected=true;partSel.appendChild(o)})}
  function body(extra){var b=H.shooter(),k;b.angle=angle();for(k in extra)b[k]=extra[k];return b}
  function runMap(){if(!H.ready()){say(msg,'hint',tx('models.armor.pickGun'));clear(mapOut);return}var a=angle();if(a==null){say(msg,'err',tx('models.armor.goh.badAngle'));return}
   say(msg,'hint',tx('models.armor.goh.reading'));
   H.call('/api/x/models/armor/map',body({}),function(j){say(msg,'hint','');drawMap(j)},function(e){say(msg,e.cancelled?'hint':'err',e.message);clear(mapOut)})}
  function cellOf(r,c){
   if(c.refused)return el('td',{class:'hint',title:why(c.code),text:'?'});
   var through=c.result==='penetrate',t=n2(c.nominal)+' / '+n2(c.effective);
   var tip=gk('models.armor.goh.res',GRES[c.result]?c.result:'no_penetration')+' '+tx('models.armor.goh.margin',{m:n2(c.margin)});
   if(c.gate&&GGATE[c.gate])tip+=' '+gk('models.armor.goh.gate',c.gate);
   if(c.hp&&c.hp.refused)tip+=' '+why(c.hp.code);else if(c.hp&&c.hp.part)tip+=' '+tx('models.armor.goh.hpShort',{p:c.hp.part,l:n2(c.hp.loss)});
   return el('td',{},[el('button',{type:'button',title:tip,text:t,style:'background:'+(through?'var(--cthru)':'var(--cstop)'),onclick:function(){partSel.value=r.volume;sideSel.value=c.side;shoot()}})])}
  function drawMap(j){clear(mapOut);leftOut(j);if(j.refused){mapOut.appendChild(el('div',{class:'err',text:tx('models.armor.goh.refused',{r:why(j.code)})}));return}
   fillParts(j.rows);heads(j,mapOut);
   mapOut.appendChild(el('div',{text:tx('models.armor.goh.share',{p:Math.round((Number(j.share)||0)*100),a:n2(j.angle),m:n2(j.rangeM),pen:n2(j.penetration)})}));
   var tb=el('table',{class:'tbl'}),hr=el('tr',{},[el('th',{text:tx('models.armor.goh.part')})]);
   GSIDES.forEach(function(s){hr.appendChild(el('th',{text:H.sideWord(s)}))});tb.appendChild(hr);
   (j.rows||[]).forEach(function(r){var tr=el('tr'),pw=H.partWords(r.volume);tr.appendChild(el('td',{},[el('code',{text:r.volume}),el('span',{class:'hint',text:(pw?' '+pw:'')+(r.part?' ['+r.part+']':'')})]));
    (r.sides||[]).forEach(function(c){tr.appendChild(cellOf(r,c))});tb.appendChild(tr)});
   mapOut.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.mapHow')}));
   mapOut.appendChild(el('div',{style:'overflow-x:auto'},[tb]));
   if((j.notInModel||[]).length)mapOut.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.notInModel',{l:j.notInModel.join(', ')})}))}
  function shoot(){if(!H.ready()){say(msg,'hint',tx('models.armor.pickGun'));return}if(!partSel.value){say(msg,'hint',tx('models.armor.goh.pickPart'));return}
   var a=angle();if(a==null){say(msg,'err',tx('models.armor.goh.badAngle'));return}ST.gohPart=partSel.value;
   say(msg,'hint',tx('models.armor.goh.reading'));
   H.call('/api/x/models/armor/effects',body({volume:partSel.value,side:sideSel.value}),function(j){say(msg,'hint','');drawShot(j)},function(e){say(msg,e.cancelled?'hint':'err',e.message)})}
  function drawShot(j){clear(out);leftOut(j);
   if(j.refused){out.appendChild(el('div',{class:'err',text:tx('models.armor.goh.refused',{r:why(j.code)})}));return}
   heads(j,out);var p=j.plate||{},f=p.factors,res=GRES[p.result]?p.result:'no_penetration';
   out.appendChild(el('div',{style:'font-weight:bold',text:p.volume+' ('+H.sideWord(p.side)+'), '+n2(p.angle)+'°: '+gk('models.armor.goh.res',res)}));
   out.appendChild(el('div',{text:tx('models.armor.goh.numbers',{p:n2(p.penetration),e:n2(p.effective),n:n2(p.nominal),m:n2(p.margin)})}));
   if(f){var om=f.overmatch||{};out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.factors',{o:n2(om.factor),k:gk('models.armor.goh.om',GOM[om.kind]?om.kind:'default'),f:n2(f.flaw),c:n2(f.castSteel),h:n2(f.hardness)})}))}
   if(GRULE[p.rule])out.appendChild(el('div',{class:'hint',text:tx(['models.armor.goh.thick',p.rule].join('.'),{a:p.area||''})}));
   if(p.calibreFrom==='filling')out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.calFill')}));
   if(p.gate&&GGATE[p.gate])out.appendChild(el('div',{text:gk('models.armor.goh.gate',p.gate)}));
   if(p.fuze)out.appendChild(el('div',{text:tx('models.armor.goh.fuze')}));
   if(j.ricochet)out.appendChild(el('div',{text:bounceText(j.ricochet)}));
   var e=j.effects;
   if(e&&e.refused)out.appendChild(el('div',{class:'err',text:tx('models.armor.goh.refused',{r:why(e.code)})}));
   else if(e&&!e.part)out.appendChild(el('div',{text:tx('models.armor.goh.hpNone')}));
   else if(e&&!(e.loss>0))out.appendChild(el('div',{text:tx('models.armor.goh.hpZero',{p:e.part})}));
   else if(e){out.appendChild(el('div',{text:tx('models.armor.goh.hp',{p:e.part,l:n2(e.loss),h:n2(e.hp),b:n2(e.hpBroken),d:n2(j.minimumDamageModifier),k:n2(e.modifier)})}));
    out.appendChild(el('div',{text:gk('models.armor.goh.state',GSTATE[e.state]?e.state:'working')+' '+(e.shotsToDestroy?tx('models.armor.goh.shots',{n:e.shotsToBreak,d:e.shotsToDestroy}):tx('models.armor.goh.shotsNoDestroy',{n:e.shotsToBreak}))}))}
   out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.noteT')}))}
  // a 3D shot (the AS64 shot result above shows its plates): the first armoured plate by GoH's rules here, what is left open
  // a stopped shell: bounce or burst (the bounce rule assumed the same as Assault Squad 2)
  function bounceText(b){var m=b.material||'?',g=n2(b.grazing);
   if(!b.known)return tx('models.armor.goh.bounceUnknown');
   if(b.why==='gun')return tx('models.armor.goh.bounceGun');
   if(b.why==='shell')return tx('models.armor.goh.bounceShell');
   if(b.possible)return tx('models.armor.goh.bounceChance',{n:Math.round((Number(b.chance)||0)*100),g:g,m:m});
   return tx('models.armor.goh.bounceNone',{g:g,m:m})}
  // one plate behind the first: what it does and what is left of the shell after it
  function laterText(p){var v=p.volume+' ('+H.sideWord(p.side)+(p.enter===false?' '+tx('models.armor.exit'):'')+')',r=GLRES[p.result]?p.result:'refused',w=gk('models.armor.goh.lres',r);
   if(r==='ricochet'&&p.chance!=null)w+=' ('+Math.round(p.chance*100)+'%)';
   if(p.effective==null||r==='skipped'||r==='beyond_jet'||r==='missed')return tx('models.armor.goh.laterShort',{v:v,r:w});
   var t=tx('models.armor.goh.laterRow',{v:v,r:w,n:n2(p.nominal),e:n2(p.effective),p:n2(p.penLeft),a:n2(p.after)});
   if(p.gate&&GGATE[p.gate])t+=' '+gk('models.armor.goh.gate',p.gate);
   if(p.fuze)t+=' '+tx('models.armor.goh.fuze');
   if(p.hp&&p.hp.part&&p.hp.loss>0)t+=' '+tx('models.armor.goh.laterHp',{p:p.hp.part,l:n2(p.hp.loss)});
   return t}
  function endText(j){var o=j.outcome,st=j.stoppedAt!=null?(j.plates||[])[j.stoppedAt]:null,v=st?String(st.volume).split('/').pop():'';
   if(!GEND[o])return null;
   if(o==='passed_all'||o==='ground')return gk('models.armor.goh.end',o);
   if(o==='ricochet')return tx('models.armor.goh.end.ricochet',{v:v,n:Math.round((Number(st&&st.chance)||0)*100)});
   return tx(['models.armor.goh.end',o].join('.'),{v:v})}
  // where a shell bursts, and each blast of its ammo there: the parts it reaches, the energy against the threshold, the health lost
  function burstTo(to,bu,ifNo){if(!bu)return;var t=bu.ground?tx('models.armor.goh.burstGround'):tx('models.armor.goh.burst',{v:bu.at||'?'});if(ifNo)t+=' '+tx('models.armor.goh.ifNoBounce');to.appendChild(el('div',{text:t}))}
  function blastTo(to,list){(list||[]).forEach(function(b){
   to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.blastHead',{e:n2(b.energy),i:n2(b.inner),o:n2(b.outer),n:(b.hits||[]).length})}));
   if(!(b.hits||[]).length){to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.blastNone')}));return}
   var ul=el('ul');b.hits.forEach(function(h){var t=tx('models.armor.goh.blastRow',{v:h.volume,s:H.sideWord(h.side),e5:n2(h.e5),t:n2(h.threshold),r:tx(h.pierced?'models.armor.goh.blastPierced':'models.armor.goh.blastHeld')});
    if(h.hp&&h.hp.refused)t+=' '+why(h.hp.code);else if(h.hp&&h.hp.part)t+=' '+tx('models.armor.goh.blastHp',{p:h.hp.part,l:n2(h.hp.loss)});ul.appendChild(el('li',{text:t}))});to.appendChild(ul);
   if((b.skipped||[]).length)to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.blastSkip',{l:b.skipped.map(function(s){return s.volume}).join(', ')})}))})}
  // the bounce's flight, leg after leg: its chance, the cone or the new line, the plates it meets, where it ends and bursts
  function legsTo(to,legs){(legs||[]).forEach(function(g,i){
   to.appendChild(el('div',{style:'font-weight:bold;margin-top:6px',text:tx('models.armor.goh.legHead',{n:i+1,v:g.from,c:Math.round((Number(g.chance)||0)*100),a:Math.round((Number(g.chanceAll)||0)*100)})}));
   if(g.cone){to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.legCone')}));return}
   to.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.legFly',{s:n2(g.speed),e:n2(g.energy)})}));
   if((g.plates||[]).length){var ul=el('ul');g.plates.forEach(function(p){ul.appendChild(el('li',{text:laterText(p)}))});to.appendChild(ul)}
   var et=endText(g);if(et)to.appendChild(el('div',{text:et}));
   if(g.refused)to.appendChild(el('div',{class:'err',text:tx('models.armor.goh.refused',{r:why(g.refused.code)})}));
   burstTo(to,g.burst,false);blastTo(to,g.blast)})}
  // a 3D shot (the AS64 shot result above shows its plates): the first armoured plate by GoH's rules, then every plate behind it
  // with what is left of the shell, and where the shell ends
  function drawShot3(j){clear(out);if(!j)return;
   if(j.plate||j.refused)drawShot(j);else{leftOut(j);out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.no3d')}));out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.noteT')}))}
   var lat=j.later||[];
   if(lat.length){out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.laterHead')}));var ul=el('ul');lat.forEach(function(p){ul.appendChild(el('li',{text:laterText(p)}))});out.appendChild(ul)}
   if(Number(j.cumulative)>0)out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.jet',{m:n2(j.cumulative)})}));
   var et=j.refused?null:endText(j);if(et)out.appendChild(el('div',{style:'font-weight:bold',text:et}));
   if(!j.refused){burstTo(out,j.burst,j.burst&&j.burst.ifNoBounce);blastTo(out,j.blast);legsTo(out,j.bounces)}
   if(j.laterRefused)out.appendChild(el('div',{class:'err',text:tx('models.armor.goh.refused',{r:why(j.laterRefused.code)})}));
   if((j.notHit||[]).length)out.appendChild(el('div',{class:'hint',text:tx('models.armor.goh.notHit3',{l:j.notHit.join(', ')})}))}
  runMap.shot3=drawShot3;
  return runMap};
})();
`;
