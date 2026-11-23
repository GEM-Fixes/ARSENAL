// browser side of the Unit AI page: the bots script's BOTS_UI.drawGroups with group D. Page rules: no backtick, no dollar-brace.
// Author: Imperator_Aug (ARSENAL, ia-2abe91d9)
module.exports = String.raw`
EXT_SCREENS.unitai=function(root){
 if(typeof BOTS_UI==='undefined'||!BOTS_UI.drawGroups){root.appendChild(h('div',{blk:'nobots'},[h('div',{class:'err',text:tx('unitai.nobots')})]));return {refresh:function(){},focus:function(){}}}
 // the symptom list: each line opens the card that answers it
 var TASKS=[{k:'unitai.task.spot',go:'bots.brain.seeing',mod:true},{k:'unitai.task.flee',go:'bots.brain.courage',mod:true},{k:'unitai.task.rocket',go:'bots.targets.sym.rocketinf'},{k:'unitai.task.targets',go:'bots.targets.sym.list'},
  {k:'unitai.task.shell',go:'bots.targets.ammo'},{k:'unitai.task.aim',go:'bots.brain.guns',mod:true}];
 return BOTS_UI.drawGroups(root,['D'],{page:'unitai',h1:'unitai.h1',lead:'unitai.lead',tasks:TASKS,taskH:'unitai.task.h'});
};
`;
