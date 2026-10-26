import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleRoute, assessRoute, departureOptions } from '../route-weather.js';
import { localToUTC } from '../activity-engine.js';
import { forecast, now } from './journey-fixtures.mjs';
const route = { duration: 3600, coordinates: [[13.405,52.52],[13.415,52.52],[13.425,52.52],[13.415,52.52],[13.405,52.52]] };
const start = localToUTC('2026-10-08T15:00','Europe/Berlin');
const sample = () => sampleRoute(route);
const data = () => sample().map(() => forecast());
test('route samples preserve outward and return passage times, bounded to five points', () => {
 const s=sample(); assert.equal(s.length,5); assert.deepEqual(s.map(p=>p.fraction),[0,.25,.5,.75,1]);
 assert.equal(s[0].latitude,s[4].latitude); assert.equal(s[0].longitude,s[4].longitude);
 const a=assessRoute(route,s,data(),start,'walk'); assert.equal(a.status,'good'); assert.equal(a.points.at(-1).at-start,3600000);
});
test('samples interpolate by distance rather than by number of vertices', () => {
 const s=sampleRoute({duration:3600,coordinates:[[0,0],[.001,0],[.1,0]]}); assert.ok(Math.abs(s[2].longitude-.05)<.00001);
 assert.deepEqual(sampleRoute({duration:0,coordinates:[]}),[]);
});
test('hourly deterioration anywhere in the full moving window blocks recommendation', () => {
 const f=data(); f[2].hourly.weather_code[16]=95;
 const a=assessRoute({...route,duration:5400},sample(),f,start,'walk'); assert.equal(a.status,'changed'); assert.match(a.reason,/Thunderstorms/);
});
test('missing readings and missing hourly coverage cannot become good weather', () => {
 const f=data(); f[1].hourly.wind_gusts_10m[15]=null; assert.equal(assessRoute(route,sample(),f,start,'walk').status,'unavailable');
 const g=data();g[1].hourly.time.splice(15,1);for(const k of Object.keys(g[1].hourly))if(k!=='time')g[1].hourly[k].splice(15,1);
 assert.equal(assessRoute(route,sample(),g,start,'walk').status,'unavailable');
});
test('cached and partially missing forecasts disable recommendations', () => {
 const f=data();f[3]._jweather={cached:true};assert.equal(assessRoute(route,sample(),f,start,'walk').status,'offline');
 assert.equal(assessRoute(route,sample(),[...f.slice(0,4),null],start,'walk').status,'unavailable');
});
test('points show estimated passage time and source hour separately', () => {
 const a=assessRoute(route,sample(),data(),start,'walk');assert.equal(a.points[1].at,start+900000);assert.equal(a.points[1].forecastAt,start);
 assert.equal(a.points[1].temperature,14);assert.equal(a.points[1].rain,15);
});
test('departure choices respect local dates, now, route end and forecast horizon', () => {
 const d=forecast();const options=departureOptions(d,route,'2026-10-08',now);
 assert.ok(options.length);assert.ok(options.every(t=>t>=now+300000));
 assert.equal(departureOptions(d,route,'2026-10-30',now).length,0);
 assert.equal(departureOptions(d,{...route,duration:4*3600},'2026-10-08',now).length,0);
 const last=departureOptions(d,route,'2026-10-13',now);assert.ok(last.every(t=>t+3600000<=localToUTC('2026-10-14T00:00','Europe/Berlin')));
});
test('departure choices exclude ambiguous and missing daylight-saving hours', () => {
 for(const date of ['2026-03-29','2026-10-25']) {
  const d=forecast();d.daily.time=[date];d.hourly.time=Array.from({length:24},(_,i)=>`${date}T${String(i).padStart(2,'0')}:00`);
  const result=departureOptions(d,route,date,Date.parse(date+'T00:00:00Z')-86400000);
  assert.ok(result.every(t=>!new Intl.DateTimeFormat('en-GB',{timeZone:d.timezone,hour:'2-digit'}).format(t).startsWith('02')));
 }
});
test('invalid route, activity and nonfinite departure fail closed', () => {
 assert.equal(assessRoute(route,sample(),data(),NaN,'walk').status,'unavailable');
 assert.equal(assessRoute(route,sample(),data(),start,'__proto__').status,'unavailable');
 assert.equal(assessRoute({...route,duration:0},sample(),data(),start,'walk').status,'unavailable');
});
test('nearest passage hour cannot show adverse weather while the route is recommended', () => {
 const short={...route,duration:2700};const f=data();f[4].hourly.precipitation_probability[16]=90;
 const a=assessRoute(short,sampleRoute(short),f,start,'walk');assert.equal(a.points.at(-1).rain,90);assert.equal(a.status,'changed');
});
test('a complete day comparison reuses timezone conversions and stays interactive', () => {
 const f=data();const s=sample();const times=departureOptions(f[0],route,'2026-10-09',now);
 const before=performance.now();for(const t of times)assessRoute(route,s,f,t,'walk');
 assert.ok(performance.now()-before<1500,'A 48-departure comparison must finish within 1.5 seconds, not block the interface for many seconds.');
});
