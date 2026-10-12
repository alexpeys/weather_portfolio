"""Fetch comparable 2016–2025 daily records via Open-Meteo ERA5-Seamless.
Temperature: ERA5-Land 0.1°. Precipitation, wind, cloud: ERA5 0.25°.
Cache raw API responses outside the deliverable; never silently accept missing data.
"""
import json,os,sys,time,urllib.request,urllib.parse,datetime,concurrent.futures
from pathlib import Path
base=Path(__file__).resolve().parent.parent
cache=Path(os.environ.get('WEATHER_CACHE_DIR',str(base/'.cache'/'history')));cache.mkdir(parents=True,exist_ok=True)
original=json.loads((base/'dist'/'climate.json').read_text())
catalog=json.loads((base/'dist'/'cities.json').read_text())
fields=['temperature_2m_max','precipitation_sum']
expected_dates=[(datetime.date(2016,1,1)+datetime.timedelta(days=i)).isoformat() for i in range(3653)]

def fetch(c):
 path=cache/(c['id']+'.json')
 params=dict(latitude=c['lat'],longitude=c['lon'],start_date='2016-01-01',end_date='2025-12-31',daily=','.join(fields),hourly='wind_speed_10m,cloud_cover',models='era5_seamless',timezone='auto',temperature_unit='fahrenheit',wind_speed_unit='kmh',cell_selection='land')
 url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params)
 if path.exists(): d=json.loads(path.read_text())
 else:
  for attempt in range(3):
   try:
    with urllib.request.urlopen(url,timeout=120) as r:d=json.load(r)
    if 'daily' not in d or 'hourly' not in d:raise ValueError(str(d))
    path.write_text(json.dumps(d));break
   except urllib.error.HTTPError as e:
    detail=e.read().decode()
    print(f"{c['id']}: HTTP {e.code}: {detail}",flush=True)
    if attempt==2 or (e.code==429 and "daily" in detail.lower()):raise
    time.sleep(60 if e.code==429 else 3*(attempt+1))
   except Exception:
    if attempt==2:raise
    time.sleep(2*(attempt+1))
 day=d['daily'];hour=d['hourly'];n=len(day['time'])
 if day['time']!=expected_dates:raise ValueError(f'{c["id"]}: dates do not match the requested ten-year window')
 if d['daily_units'].get('temperature_2m_max')!='°F' or d['daily_units'].get('precipitation_sum')!='mm':raise ValueError('Unexpected daily units')
 if d['hourly_units'].get('wind_speed_10m')!='km/h' or d['hourly_units'].get('cloud_cover')!='%':raise ValueError('Unexpected hourly units')
 for field in fields:
  if len(day[field])!=n or any(x is None for x in day[field]):raise ValueError(f'Missing {c["id"]} {field}')
 buckets={t:[] for t in day['time']}
 for i,t in enumerate(hour['time']):
  if 9<=int(t[11:13])<=18:buckets[t[:10]].append(i)
 ids=[i for i,t in enumerate(day['time']) if t[5:]!='02-29']
 daily={'tmax':[],'precip':[],'wind':[],'cloud':[]}
 for i in ids:
  date=day['time'][i];hs=buckets[date]
  if len(hs)!=10:raise ValueError(f'{date}: incomplete daytime hours')
  w=[hour['wind_speed_10m'][j] for j in hs];cl=[hour['cloud_cover'][j] for j in hs]
  if any(x is None for x in w+cl):raise ValueError(f'{date}: missing wind/cloud')
  daily['tmax'].append(day['temperature_2m_max'][i]);daily['precip'].append(day['precipitation_sum'][i]);daily['wind'].append(max(w));daily['cloud'].append(round(sum(cl)/len(cl),2))
 new={k:v for k,v in c.items() if k not in ['daily','cell']}
 new.update(daily=daily,cell={'lat':d['latitude'],'lon':d['longitude'],'elevation':d['elevation']},historySource=url,timezone=d['timezone'],utcOffsetSeconds=d['utc_offset_seconds'])
 print(c['name']+': validated 3,650 days',flush=True)
 return new

with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:cities=list(pool.map(fetch,catalog['cities']))
dates=[];d=datetime.date(2016,1,1)
while d<=datetime.date(2025,12,31):
 if not(d.month==2 and d.day==29):dates.append(d.isoformat())
 d+=datetime.timedelta(days=1)
result={'version':2,'source':'https://open-meteo.com/en/docs/historical-weather-api','sourceName':'Open-Meteo ERA5-Seamless','climatePeriod':'2016–2025','years':10,'dates':dates,'temperatureUnit':'fahrenheit','temperatureResolution':'0.1°','otherResolution':'0.25°','windHours':'09:00–18:00','upstreamInspiration':original.get('upstreamInspiration',{'source':original['source'],'sourceCommit':original.get('sourceCommit')}),'accessed':datetime.date.today().isoformat(),'cities':cities}
path=base/'dist'/'climate.json';tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(result,separators=(',',':')));tmp.replace(path)
print('Wrote verified multi-year climate dataset.',flush=True)
