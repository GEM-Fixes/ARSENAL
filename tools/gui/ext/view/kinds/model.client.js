// view kind model, page side (../README.md): where:'page'. A mesh (.ply), a collision volume (.vol) or an animation (.anm) opened
// anywhere (the Editor's explorer, a link, the Files page, VIEW.open) jumps to the Models page, on the model that uses it:
// GET /api/x/view/model/owner finds the .mdl (model.server.js), then show('models'), S.screens.models.pick(target, {sub, sel, ply})
// opens it read only (a game key is read from the game, nothing is copied into the mod) and switches to the sub-tab with the file
// selected (Mesh, Volumes, Animation). No model for the file: the bytes tab opens instead (VIEW.open kind hex).
// Also: VIEW.modelGo(ref, name) for the explorer's "Show in Models" / "Show on its model" (.mdl, .def, .mtl, textures: says so when
// no model uses the file, never opens bytes), and the Editor action "Show in Models" (IDE.action, group jump) on a .mdl or .def tab.
// The owner is looked up first and the page changes only when there is one, so a file with no model never flashes the Models page.
// Game parity: the jump goes only to a Models page the page's game shows (INGAME.models; show() would switch to AS64 otherwise). In a
// game without it (none now: AS64, MoW:AS2 and GoH all show it) the file opens as bytes (VIEW.open kind hex:
// the Editor, or a box over the page), and the explicit forms say "not in this game" instead.
// Page rules: ES5, no backtick, no dollar-brace, no innerHTML; strings through tx().
// Author: Imperator_Aug (ARSENAL, ia-92dcd2c3)
'use strict';
const script = String.raw`
(function(){
 function say(k,p){if(typeof toast==='function')toast(tx(k,p))}
 function bytes(item){try{VIEW.open(item.ref,item.name,{kind:'hex'})}catch(e){}}
 function pageOk(){return typeof show==='function'&&typeof S!=='undefined'&&S&&S.screens&&S.screens.models&&typeof S.screens.models.pick==='function'}
 // the page's game shows the Models page (no INGAME table: a test or an old shell, as before)
 function inGame(){return typeof INGAME==='undefined'||!INGAME||!!INGAME.models}
 function gname(){try{return curGame().name}catch(e){return ''}}
 // o.explicit: the user asked for the model (a menu, an action): no model is said, not opened as bytes
 function jump(item,o){o=o||{};
  if(!inGame()){if(o.explicit)say('view.model.notHere',{g:gname()});else bytes(item);return true}
  api('/api/x/view/model/owner?'+item.q,undefined,{what:tx('view.model.job.read')}).then(function(j){
   if(!j||!j.found||!j.target){if(o.explicit)say('view.model.none',{name:item.name});else bytes(item);return}
   if(!pageOk()){if(o.explicit)say('view.model.noPage');else bytes(item);return}
   show('models');S.screens.models.pick(j.target,{sub:j.sub||'model',sel:j.sel||null,ply:j.ply||null});
   var c=j.candidates||[];
   if(j.loose)say('view.model.loose',{name:item.name,mdl:j.name});
   else if(c.length>1)say('view.model.many',{n:c.length,mdl:j.name});
   if(j.note==='modpak')say('view.model.modpak')},
  function(e){if(o.explicit)say('view.model.fail',{m:(e&&(e.text||e.message))||''});else bytes(item)});
  return true}
 VIEW.reg('model',{where:'page',label:'view.model.label',exts:['ply','vol','anm'],go:function(item){return jump(item)}});
 VIEW.modelGo=function(ref,name){var it=VIEW.item(ref,name,'model');if(!it){say('view.noMod');return false}return jump(it,{explicit:true})};
 // the Editor action on the open tab: a .mdl (or a .def that names one)
 function cur(){var I=window.IDE,d=I&&typeof I.active==='function'?I.active():null;return d&&d.ref&&/\.(mdl|def)$/i.test(String(d.name||d.rel||d.key||''))?d:null}
 function regAct(){var I=window.IDE;if(!I||typeof I.action!=='function')return false;if(I.actions&&I.actions.showInModels)return true;
  I.action('showInModels',{label:'view.model.act',tip:'view.model.actTip',key:null,group:'jump',run:function(){var d=cur();if(d)VIEW.modelGo(d.ref,d.name)},when:function(){return !!cur()&&inGame()}});return true}
 if(!regAct()&&typeof setTimeout==='function'){setTimeout(regAct,0);setTimeout(regAct,2000)}
 VIEW._modelAct=regAct;
})();
`;
module.exports = { script, css: '' };
