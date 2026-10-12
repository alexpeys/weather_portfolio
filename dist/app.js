import {DEFAULTS,MONTHS,DAYS,attachHousing,costIndex,blendedCostIndex} from './engine.js';
const $=s=>document.querySelector(s);
const palette=[['#79985b','#f0f3e9'],['#c89b52','#f8f1e5'],['#9b88b3','#f2eef6']];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
let data,result,settings={...DEFAULTS},selected=['austin','denver','san-diego'],requestId=0;
const worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
const city=id=>data.cities.find(c=>c.id===id),index=c=>costIndex(c,city('palo-alto'));
const niceIndex=days=>result.target>0?days/result.target:null;
const relativeNice=days=>{const value=niceIndex(days);return value===null?'—':value.toFixed(2);};
const color=id=>palette[Math.max(0,selected.indexOf(id))%palette.length];
function sane(raw){
 const value={...DEFAULTS};if(!raw||typeof raw!=='object')return value;
 // Upgrade saved copies of the previous defaults; retain custom preferences.
 if(raw.low===65&&raw.high===82&&raw.rain===1&&raw.wind===25&&raw.cloud===100)return value;
 if(raw.wind===40)raw={...raw,wind:40.2336};
 for(const [key,min,max] of [['low',40,99],['high',41,110]])if(Number.isFinite(raw[key])&&raw[key]>=min&&raw[key]<=max)value[key]=raw[key];
 for(const [key,options] of Object.entries({rain:[.1,1,3],wind:[15,25,40.2336],cloud:[40,60,100]}))if(options.includes(raw[key]))value[key]=raw[key];
 if(value.low>=value.high){value.low=DEFAULTS.low;value.high=DEFAULTS.high;}return value;
}
function restore(){try{
 let stored=JSON.parse(localStorage.getItem('weather-arbitrage-v1')||'null');
 if(location.hash.startsWith('#plan='))stored=JSON.parse(atob(decodeURIComponent(location.hash.slice(6))));
 if(stored){settings=sane(stored.settings);if(Array.isArray(stored.selected)){const ids=[...new Set(stored.selected.filter(id=>id!=='palo-alto'&&data.cities.some(c=>c.id===id)))];if(ids.length<=3)selected=ids;}}
}catch{}}
function persist(){try{localStorage.setItem('weather-arbitrage-v1',JSON.stringify({settings,selected,mode:'build'}));}catch{}}
function compute(){if(!data)return;persist();$('#loading').hidden=false;$('#loading').textContent='Updating…';worker.postMessage({id:++requestId,data,settings,selected});}
function showError(message){$('#loading').hidden=true;$('#error').textContent=message;$('#error').hidden=false;}
worker.onmessage=({data:r})=>{if(r.id!==requestId)return;$('#loading').hidden=true;if(r.error)return showError(r.error);result=r.result;$('#error').hidden=true;render();};
worker.onerror=()=>showError('Unable to calculate the portfolio. Please reload.');
function render(){
 $('#criteria-summary').textContent=`High ${settings.low}–${settings.high}°F · rain < ${settings.rain} mm · wind < ${Math.round(settings.wind*.621371)} mph${settings.cloud<100?` · cloud ≤ ${settings.cloud}%`:''}`;
 renderPicker();renderPortfolio();
}
function renderPicker(){
 if(!result)return;
 const focused=document.activeElement?.dataset?.city,query=$('#city-search').value.trim().toLowerCase();
 const visible=data.cities.filter(c=>c.id!=='palo-alto'&&[c.name,c.state,c.id,...(c.aliases||[])].join(' ').toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name));
 $('#city-picker').innerHTML=visible.map(c=>{
  const chosen=selected.includes(c.id),annualNice=result.stats[c.id].total;
  return `<div class="city-row"><label><input type="checkbox" data-city="${c.id}" aria-label="Include ${c.name} in portfolio" ${chosen?'checked':''} ${selected.length===3&&!chosen?'disabled':''} style="accent-color:${color(c.id)[0]}"><span class="city-name">${c.name}<small>${c.state}</small></span></label><div class="city-stats"><span title="${result.target>0?`${relativeNice(annualNice)} times Palo Alto’s annual nice days`:'Palo Alto has zero nice days under these settings'}">${relativeNice(annualNice)} nice</span><a href="${c.housing.source}" target="_blank" rel="noopener" aria-label="${c.name}: CoL ${index(c).toFixed(2)}, median ${money(c.homePrice)} across ${c.housing.sampleSize} listings">${index(c).toFixed(2)} CoL</a></div></div>`;
 }).join('')||'<p class="no-cities">No matching cities.</p>';
 $('#selected-cities').innerHTML=selected.map(id=>`<button class="selected-chip" data-remove="${id}" aria-label="Remove ${city(id).name} from portfolio"><i style="background:${color(id)[0]}"></i>${city(id).name}<span class="x" aria-hidden="true">×</span></button>`).join('');
 $('#selection-count').textContent=`${selected.length} / 3 selected`;
 $('#city-count').textContent=`${visible.length} of ${data.cities.length-1} cities · yearly nice & CoL: Palo Alto = 1`;
 if(focused)$(`#city-picker [data-city="${focused}"]`)?.focus({preventScroll:true});
}
function chart(p){
 const counts=p.schedule.map((id,m)=>result.stats[id].monthly[m]),values=counts.map((v,m)=>v/DAYS[m]),pa=result.stats['palo-alto'].fractions;
 const x=i=>40+i*48,y=v=>201-v*177,points=a=>a.map((v,i)=>`${x(i)},${y(v)}`).join(' ');
 return `<svg class="chart" viewBox="0 0 594 238" role="img" aria-label="Monthly fraction of nice days, zero to one. ${p.ids.map(id=>city(id).name).join(', ')} in color, optimal portfolio in dark green, Palo Alto in dashed gray.">
 ${[0,.25,.5,.75,1].map(v=>`<line class="gridline" x1="39" y1="${y(v)}" x2="577" y2="${y(v)}"/><text x="28" y="${y(v)+4}" text-anchor="end">${v.toFixed(2)}</text>`).join('')}
 ${p.ids.map(id=>`<polyline data-series="${id}" points="${points(result.stats[id].fractions)}" fill="none" stroke="${color(id)[0]}" stroke-width="2.2" stroke-opacity="0.5"/>`).join('')}
 <polyline data-series="optimal" points="${points(values)}" fill="none" stroke="#293d31" stroke-width="2.6" stroke-linejoin="round"/>
 ${values.map((v,m)=>`<circle cx="${x(m)}" cy="${y(v)}" r="3" fill="${color(p.schedule[m])[0]}" stroke="#fafaf7" stroke-width="1"/>`).join('')}
 <polyline data-series="palo-alto" points="${points(pa)}" fill="none" stroke="#90948f" stroke-width="2.3" stroke-dasharray="5 4"/>
 ${MONTHS.map((month,m)=>`<text class="month-tick ${m%2===0?'major-tick':''}" x="${x(m)}" y="226" text-anchor="middle">${month}</text><rect x="${x(m)-20}" y="15" width="40" height="192" fill="transparent"><title>${month}: ${p.ids.map(id=>`${city(id).name} ${result.stats[id].fractions[m].toFixed(3)}`).join('; ')}; Optimal ${values[m].toFixed(3)} (${city(p.schedule[m]).name}); Palo Alto ${pa[m].toFixed(3)}</title></rect>`).join('')}</svg>`;
}
function renderPortfolio(){
 const p=result.custom;
 if(!p){$('#portfolio').innerHTML='<div class="empty">Select 1–3 cities.</div>';return;}
 const cost=blendedCostIndex(p.schedule,data.cities,city('palo-alto'));
 $('#portfolio').innerHTML=`<div class="metrics"><div class="metric"><span class="metric-label">Nice days vs. Palo Alto</span><strong>${relativeNice(p.nice)}</strong><small>${result.target>0?'All-year Palo Alto = 1.00':'Palo Alto has zero nice days; index unavailable'}</small></div><div class="metric"><span class="metric-label">Blended cost of living</span><strong>${cost.toFixed(2)}</strong><small>All-year Palo Alto = 1.00</small></div></div>
 <div class="chart-title"><h2>Nice days by month</h2><small>Fraction · 0–1</small></div>
 <div class="chart-legend"><span style="--series:#293d31"><i></i>Optimal</span><span class="baseline" style="--series:#90948f"><i></i>Palo Alto</span>${p.ids.map(id=>`<span class="city" style="--series:${color(id)[0]}"><i></i>${city(id).name}</span>`).join('')}</div>${chart(p)}
 <h2 class="timeline-heading">Best city each month</h2><div class="timeline" aria-label="Monthly portfolio">${p.schedule.map((id,m)=>`<div class="month" style="--city:${color(id)[0]};--soft:${color(id)[1]}" aria-label="${MONTHS[m]} in ${city(id).name}: ${result.stats[id].monthly[m].toFixed(1)} nice days"><span>${MONTHS[m]}</span><strong>${city(id).name}</strong><small>${result.stats[id].fractions[m].toFixed(2)} nice</small></div>`).join('')}</div>
 <div class="allocation">${p.ids.map(id=>`<span>${city(id).name} · ${p.schedule.filter(x=>x===id).length} ${p.schedule.filter(x=>x===id).length===1?'month':'months'}</span>`).join('')}</div>`;
}
function settingsDialog(){const form=$('#settings-form');for(const key of ['low','high','rain','wind','cloud'])form.elements[key].value=settings[key];form.elements.high.setCustomValidity('');$('#settings-dialog').showModal();}
let toastTimer;function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
async function share(){const url=`${location.origin}${location.pathname}#plan=${encodeURIComponent(btoa(JSON.stringify({settings,selected,mode:'build'})))}`;history.replaceState(null,'',url);try{await navigator.clipboard.writeText(url);toast('Portfolio link copied.');}catch{toast('Copy the portfolio link from the address bar.');}}
$('#city-search').addEventListener('input',renderPicker);
$('#city-picker').addEventListener('change',e=>{const input=e.target.closest('input[data-city]');if(!input)return;const id=input.dataset.city;if(input.checked){if(selected.length>=3){input.checked=false;return;}if(!selected.includes(id))selected.push(id);}else selected=selected.filter(x=>x!==id);renderPicker();compute();});
document.addEventListener('click',e=>{
 const close=e.target.closest('[data-close]');if(close){$(`#${close.dataset.close}`).close();return;}
 const remove=e.target.closest('[data-remove]');if(remove){selected=selected.filter(id=>id!==remove.dataset.remove);renderPicker();compute();return;}
 const action=e.target.closest('[data-action]')?.dataset.action;
 if(action==='sources')$('#sources-dialog').showModal();
 if(action==='settings')settingsDialog();
 if(action==='reset-settings'){settings={...DEFAULTS};$('#settings-dialog').close();compute();}
 if(action==='share'&&data)share();
});
$('#settings-form').addEventListener('input',()=>$('#settings-form').elements.high.setCustomValidity(''));
$('#settings-form').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(+form.elements.low.value>=+form.elements.high.value){form.elements.high.setCustomValidity('Maximum must exceed minimum.');form.elements.high.reportValidity();return;}for(const key of ['low','high','rain','wind','cloud'])settings[key]=+form.elements[key].value;$('#settings-dialog').close();compute();});
window.addEventListener('hashchange',()=>{if(data&&location.hash.startsWith('#plan=')){restore();compute();}});
try{
 const responses=await Promise.all([fetch('./climate.json'),fetch('./housing.json')]);if(responses.some(r=>!r.ok))throw Error('Unable to load the datasets. Please reload.');
 const [climate,housing]=await Promise.all(responses.map(r=>r.json()));data=attachHousing(climate,housing);data.cities=data.cities.map(c=>({...c,name:c.displayName||c.name}));restore();compute();
}catch(e){showError(e.message);}
