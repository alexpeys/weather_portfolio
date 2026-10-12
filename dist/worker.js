import {weather,optimize} from './engine.js';
self.onmessage=({data:{data,settings,selected,id}})=>{
 try{
  const stats=Object.fromEntries(data.cities.map(c=>[c.id,weather(c,settings,data)]));
  const custom=selected.length?optimize(selected.map(id=>data.cities.find(c=>c.id===id)),stats):null;
  self.postMessage({id,result:{stats,target:stats['palo-alto'].total,custom}});
 }catch(e){self.postMessage({id,error:e.message});}
};
