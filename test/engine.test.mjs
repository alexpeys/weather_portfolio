import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DEFAULTS,DAYS,weather,medianHomePrice,attachHousing,homePrice,costIndex,blendedCostIndex,optimize,calculate} from '../dist/engine.js';
const climate=JSON.parse(fs.readFileSync(new URL('../dist/climate.json',import.meta.url)));const housing=JSON.parse(fs.readFileSync(new URL('../dist/housing.json',import.meta.url)));const data=attachHousing(climate,housing);const settings={...DEFAULTS,overrides:{}};
const stats=Object.fromEntries(data.cities.map(c=>[c.id,weather(c,settings,data)]));const target=stats['palo-alto'].total;
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function independentBest(cities){let best=null;for(let code=0;code<cities.length**12;code++){
 let n=code,days=0,cost=0;for(let m=0;m<12;m++){const c=cities[n%cities.length];n=Math.floor(n/cities.length);days+=stats[c.id].monthly[m];cost+=c.homePrice/12;}
 if(!best||days>best.days+1e-8||Math.abs(days-best.days)<1e-8&&cost<best.cost)best={days,cost};
 }return best;}
test('all cities have complete aligned ten-year non-leap daily histories',()=>{
 assert.equal(data.version,2);assert.equal(data.years,10);assert.equal(data.cities.length,24);assert.equal(data.cities[0].id,'palo-alto');assert.equal(data.dates.length,3650);assert.equal(data.dates[0],'2016-01-01');assert.equal(data.dates.at(-1),'2025-12-31');assert.ok(data.dates.every(t=>!t.endsWith('02-29')));
 for(const c of data.cities)for(const v of ['tmax','precip','wind','cloud']){assert.equal(c.daily[v].length,3650);assert.ok(c.daily[v].every(Number.isFinite));}
});
test('monthly fractions use each month length and retain the annual day count',()=>{for(const c of data.cities){const r=stats[c.id];approx(r.daily.reduce((a,b)=>a+b,0),r.total);approx(r.annualFraction,r.total/365);r.monthly.forEach((v,m)=>{assert.ok(v>=0&&v<=DAYS[m]);approx(r.fractions[m],v/DAYS[m]);assert.ok(r.fractions[m]>=0&&r.fractions[m]<=1);});approx(r.fractions.reduce((s,v,m)=>s+v*DAYS[m],0),r.total);}});
test('high-temperature limits are applied per day, before aggregation',()=>{
 const c={name:'Controlled fixture',daily:{tmax:Array(365).fill(90),precip:Array(365).fill(0),wind:Array(365).fill(0),cloud:Array(365).fill(100)}};
 c.daily.tmax.splice(0,8,60,82,59.9,82.1,95,50,70,70);c.daily.precip[6]=1;c.daily.wind[7]=40.2336;
 const r=weather(c,settings,{version:2,years:1});approx(r.total,2);approx(r.fractions[0],2/31);
 c.daily.tmax[31]=70;const feb=weather(c,settings,{version:2,years:1});approx(feb.fractions[1],1/28);
 c.daily.tmax[0]=null;assert.throws(()=>weather(c,settings,{version:2,years:1}),/Missing weather/);
});
test('Palo Alto summer includes hot days that are excluded, with all clouds allowed',()=>{
 const c=data.cities[0],july=data.dates.map((d,i)=>d.slice(5,7)==='07'?i:-1).filter(i=>i>=0);
 const hot=july.filter(i=>c.daily.tmax[i]>82);assert.ok(hot.length>50);assert.ok(stats[c.id].fractions[6]<.9);
 const manuallyNice=july.filter(i=>c.daily.tmax[i]>=60&&c.daily.tmax[i]<=82&&c.daily.precip[i]<1&&c.daily.wind[i]<40.2336).length/10;approx(stats[c.id].monthly[6],manuallyNice);
});
test('housing medians use exact bedroom/bathroom counts and cannot fall back to MIT',()=>{const sample=[{price:100,beds:3,baths:2},{price:300,beds:3,baths:2},{price:9999,beds:3,baths:2.5},{price:9000,beds:4,baths:2},{price:null,beds:3,baths:2}];approx(medianHomePrice(sample),200);sample.push({price:800,beds:3,baths:2});approx(medianHomePrice(sample),300);assert.throws(()=>homePrice({id:'legacy',annual:60000}));assert.throws(()=>attachHousing(climate,{...housing,cities:housing.cities.slice(1)}));});
test('every housing source median reconciles to its published exact-match sample',()=>{for(const c of data.cities){assert.ok(c.housing.sampleSize>=5);assert.equal(c.housing.samples.length,c.housing.sampleSize);assert.ok(c.housing.samples.every(x=>x.beds===3&&x.baths===2));const sorted=c.housing.samples.map(x=>x.price).sort((a,b)=>a-b),n=sorted.length;approx(c.homePrice,(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2);assert.ok(c.housing.source.startsWith('https://www.redfin.com/'));}approx(costIndex(data.cities[0],data.cities[0]),1);approx(costIndex(data.cities[1],data.cities[0]),478000/2939000);});
test('blended CoL is weighted by occupied months, without rounding or clamping',()=>{const pa={id:'pa',homePrice:100},a={id:'a',homePrice:60},b={id:'b',homePrice:180},cities=[pa,a,b];const schedule=[...Array(4).fill('a'),...Array(8).fill('b')];approx(blendedCostIndex(schedule,cities,pa),1.4);approx(blendedCostIndex(Array(12).fill('pa'),cities,pa),1);assert.throws(()=>blendedCostIndex(['a'],cities,pa));assert.throws(()=>blendedCostIndex(Array(12).fill('unknown'),cities,pa));});
test('two- and three-city schedules maximize annual nice days over every possible month assignment',()=>{
 for(const ids of [['austin','boulder'],['austin','denver','san-diego']]){const cities=ids.map(id=>data.cities.find(c=>c.id===id)),expected=independentBest(cities),r=optimize(cities,stats);approx(r.nice,expected.days);approx(r.costScore,expected.cost);}
});
test('monthly winners ignore old annual goals and minimum stays, and allow return visits',()=>{
 const cities=[{id:'a',homePrice:100},{id:'b',homePrice:10000}],fixture={a:{monthly:Array.from({length:12},(_,m)=>m%2?1:20)},b:{monthly:Array.from({length:12},(_,m)=>m%2?20:1)}};
 for(const goal of ['match','sun','value']){const r=optimize(cities,fixture,{...settings,goal,minStay:4},0,goal);assert.deepEqual(r.schedule,Array.from({length:12},(_,m)=>m%2?'b':'a'));approx(r.nice,240);approx(r.costScore,5050);assert.equal(r.moves,12);}
});
test('weather ties use cheaper housing then stable city order; unused cities have no cost or moves',()=>{
 const cities=[{id:'c',homePrice:10},{id:'b',homePrice:10},{id:'a',homePrice:20}],fixture=Object.fromEntries(cities.map(c=>[c.id,{monthly:Array(12).fill(20)}]));
 for(const order of [cities,[...cities].reverse()]){const r=optimize(order,fixture);assert.deepEqual(r.schedule,Array(12).fill('b'));assert.equal(r.ids.length,3);approx(r.nice,240);approx(r.costScore,10);approx(blendedCostIndex(r.schedule,cities,cities[2]),.5);assert.equal(r.moves,0);}
 fixture.a.monthly[11]=21;const r=optimize(cities,fixture);assert.equal(r.schedule[11],'a');assert.equal(r.moves,2);approx(r.costScore,130/12);
});
test('every month is an upper envelope across all 2,024 real city pairs and triples',()=>{
 const pool=data.cities.slice(1);let groups=0;
 const check=cities=>{groups++;const r=optimize(cities,stats);r.schedule.forEach((id,m)=>{const best=Math.max(...cities.map(c=>stats[c.id].monthly[m]));assert.equal(stats[id].monthly[m],best);approx(stats[id].fractions[m],Math.max(...cities.map(c=>stats[c.id].fractions[m])));});};
 for(let i=0;i<pool.length;i++)for(let j=i+1;j<pool.length;j++){check([pool[i],pool[j]]);for(let k=j+1;k<pool.length;k++)check([pool[i],pool[j],pool[k]]);}
 assert.equal(groups,2024);
});
test('invalid selections or incomplete monthly data fail clearly',()=>{
 const cities=data.cities.slice(1,4);assert.throws(()=>optimize([cities[0],cities[0]],stats),/unique/);assert.throws(()=>optimize([],stats),/one, two or three/);assert.throws(()=>optimize(data.cities.slice(1,5),stats),/two or three/);assert.throws(()=>optimize(cities,{...stats,[cities[0].id]:{monthly:Array(11).fill(0)}}),/Incomplete monthly weather/);
});
test('discovery filters, weather totals and blended CoL reconcile',()=>{for(const count of ['2','3']){const r=calculate(data,{...settings,cityCount:count});assert.equal(r.combinations,count==='2'?253:1771);for(const p of [r.closest,r.value,r.denver]){assert.equal(p.ids.length,+count);approx(p.nice,p.schedule.reduce((s,id,m)=>s+r.stats[id].monthly[m],0));approx(p.costScore,p.schedule.reduce((s,id)=>s+homePrice(data.cities.find(c=>c.id===id))/12,0));approx(blendedCostIndex(p.schedule,data.cities,data.cities[0]),p.costScore/data.cities[0].homePrice);}}});

test('the approved city catalog has exactly twenty-three candidates and a Palo Alto reference',()=>{
 const expected=['palo-alto','austin','denver','boulder','bend','eugene','miami','minneapolis','reno','jackson','bozeman','phoenix','tucson','las-vegas','boston','los-angeles','santa-barbara','san-diego','salt-lake-city','seattle','asheville','new-york','philadelphia','chicago'];
 assert.deepEqual(data.cities.map(c=>c.id),expected);assert.deepEqual(housing.cities.map(c=>c.id),expected);
 const jackson=data.cities.find(c=>c.id==='jackson');assert.equal(jackson.state,'WY');assert.equal(jackson.admin1,'Wyoming');assert.equal(jackson.admin2,'Teton');assert.equal(jackson.displayName,'Jackson Hole');assert.ok(jackson.lat>43&&jackson.lat<44&&jackson.lon> -111&&jackson.lon< -110);
 const philly=data.cities.find(c=>c.id==='philadelphia');assert.equal(philly.admin1,'Pennsylvania');assert.equal(philly.admin2,'Philadelphia');assert.ok(philly.lat>39&&philly.lat<40&&philly.lon> -76&&philly.lon< -75);
 const santaBarbara=data.cities.find(c=>c.id==='santa-barbara');assert.equal(santaBarbara.admin1,'California');assert.ok(santaBarbara.lat>34&&santaBarbara.lat<35);
});
test('single-city portfolios reproduce that city every month; zero cities have no curve',()=>{
 for(const c of data.cities.slice(1)){const r=optimize([c],stats);assert.deepEqual(r.schedule,Array(12).fill(c.id));assert.equal(r.moves,0);approx(r.nice,stats[c.id].total);approx(r.costScore,c.homePrice);approx(blendedCostIndex(r.schedule,data.cities,data.cities[0]),costIndex(c,data.cities[0]));}
 assert.equal(calculate(data,settings,[]).custom,null);const r=calculate(data,settings,['bend']).custom;assert.deepEqual(r.ids,['bend']);assert.deepEqual(r.schedule,Array(12).fill('bend'));
});
test('annual nice-day fraction weights month lengths instead of averaging monthly fractions',()=>{
 const c={name:'January fixture',daily:{tmax:[...Array(31).fill(70),...Array(334).fill(90)],precip:Array(365).fill(0),wind:Array(365).fill(0),cloud:Array(365).fill(0)}};
 const r=weather(c,settings,{version:2,years:1});approx(r.annualFraction,31/365);assert.notEqual(r.annualFraction,r.fractions.reduce((s,x)=>s+x,0)/12);
});
