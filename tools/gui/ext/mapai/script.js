// browser side of the Map scripts for AI page: the bots script's BOTS_UI.drawGroups with group E. Page rules: no backtick, no dollar-brace.
// Author: Imperator_Aug (ARSENAL, ia-082e82f1)
module.exports = String.raw`
EXT_SCREENS.mapai=function(root){
 if(typeof BOTS_UI==='undefined'||!BOTS_UI.drawGroups){root.appendChild(h('div',{blk:'nobots'},[h('div',{class:'err',text:tx('mapai.nobots')})]));return {refresh:function(){},focus:function(){}}}
 // the task list: each line opens the card that does it
 var TASKS=[{k:'mapai.task.extra',go:'bots.mission.orders',mod:true},{k:'mapai.task.send',go:'bots.mission.orders',mod:true},{k:'mapai.task.teams',go:'bots.mission.teams',mod:true}];
 return BOTS_UI.drawGroups(root,['E'],{page:'mapai',h1:'mapai.h1',lead:'mapai.lead',tasks:TASKS,last:['bots.mission.teams']});
};
`;
