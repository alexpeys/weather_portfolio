export const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
export const DEFAULTS={low:60,high:82,rain:1,wind:40.2336,cloud:100,cityCount:'any'};
const sum=a=>a.reduce((x,y)=>x+y,0);
/** Threshold each day's high first; only then average counts across complete years. */
export function weather(city,settings,meta){
 if(meta.version!==2||!Number.isInteger(meta.years)||meta.years<1)throw Error('Unsupported climate dataset');
 const n=meta.years*365,monthly=Array(12).fill(0),daily=Array(365).fill(0);
 for(const key of ['tmax','precip','wind','cloud'])if(city.daily[key].length!==n)throw Error(`Incomplete ${city.name} ${key} history`);
 const monthAt=[];DAYS.forEach((days,m)=>{for(let i=0;i<days;i++)monthAt.push(m);});
 for(let i=0;i<n;i++){
  const {tmax,precip,wind,cloud}=city.daily;
  if(![tmax[i],precip[i],wind[i],cloud[i]].every(Number.isFinite))throw Error(`Missing weather for ${city.name}`);
  const nice=tmax[i]>=settings.low&&tmax[i]<=settings.high&&precip[i]<settings.rain&&wind[i]<settings.wind&&cloud[i]<=settings.cloud;
  if(nice){daily[i%365]++;monthly[monthAt[i%365]]++;}
 }
 const means=monthly.map(v=>v/meta.years);
 return {daily:daily.map(v=>v/meta.years),monthly:means,total:sum(means),annualFraction:sum(means)/365,fractions:means.map((v,m)=>v/DAYS[m])};
}
/** The CoL proxy uses exact 3-bed / 2-bath listing samples, never living-wage budgets. */
export function medianHomePrice(listings){
 const prices=listings.filter(x=>x.beds===3&&x.baths===2&&Number.isFinite(x.price)&&x.price>0).map(x=>x.price).sort((a,b)=>a-b);
 if(!prices.length)throw Error('No valid 3-bed / 2-bath prices');
 const middle=Math.floor(prices.length/2);return prices.length%2?prices[middle]:(prices[middle-1]+prices[middle])/2;
}
export function attachHousing(data,housing){
 if(housing.version!==1)throw Error('Unsupported housing dataset');
 const records=new Map(housing.cities.map(c=>[c.id,c]));
 if(records.size!==housing.cities.length)throw Error('Duplicate housing city');
 return {...data,housingMeta:{sourceName:housing.sourceName,retrievedAt:housing.retrievedAt,selection:housing.selection},cities:data.cities.map(c=>{
 const h=records.get(c.id);if(!h||h.sampleSize!==h.samples.length||!h.samples.every(x=>x.beds===3&&x.baths===2&&Number.isFinite(x.price)&&x.price>0))throw Error(`Incomplete housing data for ${c.name}`);
 const price=medianHomePrice(h.samples);if(price!==h.medianPrice)throw Error(`Housing median mismatch for ${c.name}`);
 return {...c,homePrice:price,housing:h};
 })};
}
export function homePrice(city){if(!Number.isFinite(city.homePrice)||city.homePrice<=0)throw Error(`Missing home price for ${city.name||city.id}`);return city.homePrice;}
export function costIndex(city,benchmark){return homePrice(city)/homePrice(benchmark);}
export function blendedCostIndex(schedule,cities,benchmark){
 if(schedule.length!==12)throw Error('A portfolio must cover twelve months');
 return sum(schedule.map(id=>{const city=cities.find(c=>c.id===id);if(!city)throw Error('Unknown city');return costIndex(city,benchmark);}))/12;
}
const numericCompare=(a,b)=>Math.abs(a-b)<1e-8?0:a-b;
export function compare(a,b,target,goal='match'){
 if(!b)return -1;
 if(goal==='sun'){return numericCompare(b.nice,a.nice)||numericCompare(a.costScore,b.costScore);}
 if(goal==='value'){
 const af=a.nice>=target-7-1e-8,bf=b.nice>=target-7-1e-8;
 if(af!==bf)return af?-1:1;
 if(af)return numericCompare(a.costScore,b.costScore)||numericCompare(b.nice,a.nice);
 return numericCompare(b.nice,a.nice)||numericCompare(a.costScore,b.costScore);
 }
 const diff=Math.abs(a.nice-target)-Math.abs(b.nice-target);
 return Math.abs(diff)>1e-8?diff:numericCompare(a.costScore,b.costScore)||numericCompare(b.nice,a.nice);
}
/** Choose the most nice days independently each month; housing price breaks ties. */
export function optimize(cities,stats){
 if(cities.length<1||cities.length>3)throw Error('Choose one, two or three cities');
 if(new Set(cities.map(c=>c.id)).size!==cities.length)throw Error('Cities must be unique');
 const ranked=[...cities].sort((a,b)=>homePrice(a)-homePrice(b)||a.id.localeCompare(b.id));
 for(const c of ranked)if(stats[c.id]?.monthly?.length!==12||!stats[c.id].monthly.every(Number.isFinite))throw Error(`Incomplete monthly weather for ${c.id}`);
 const winners=MONTHS.map((_,m)=>ranked.reduce((best,c)=>stats[c.id].monthly[m]>stats[best.id].monthly[m]?c:best));
 const schedule=winners.map(c=>c.id);
 return {schedule,ids:cities.map(c=>c.id),nice:sum(winners.map((c,m)=>stats[c.id].monthly[m])),costScore:sum(winners.map(c=>homePrice(c)))/12,moves:schedule.filter((id,m)=>id!==schedule[(m+11)%12]).length};
}
export function calculate(data,settings,selected=['austin','boulder']){
 const stats=Object.fromEntries(data.cities.map(c=>[c.id,weather(c,settings,data)]));
 const target=stats['palo-alto'].total,pool=data.cities.filter(c=>c.id!=='palo-alto');
 let closest=null,value=null,denver=null,combinations=0;
 // Discovery ranks city sets; it never changes their best-weather monthly assignments.
 const examine=group=>{combinations++;const p=optimize(group,stats);if(compare(p,closest,target,'match')<0)closest=p;if(compare(p,value,target,'value')<0)value=p;if(group.some(c=>c.id==='denver')&&compare(p,denver,target,'value')<0)denver=p;};
 for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){
 if(settings.cityCount!=='3')examine([pool[i],pool[j]]);
 if(settings.cityCount!=='2')for(let k=j+1;k<pool.length;k++)examine([pool[i],pool[j],pool[k]]);
 }
 const custom=selected.length>=1&&selected.length<=3?optimize(selected.map(id=>data.cities.find(c=>c.id===id)),stats):null;
 const featured=optimize(['austin','boulder'].map(id=>pool.find(c=>c.id===id)),stats);
 return {stats,target,closest,value,denver,featured,custom,combinations};
}
