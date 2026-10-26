import { el, button, placeURL } from './ui.js?v=20261009.1';
import { pickPlace } from './place-picker.js?v=20261009.1';
import { fetchForecast } from './forecast-api.js?v=20261026.1';
import { nearbyDestinations, rankDestinations, routeTo, routeGPX, directionsURL, distanceBetween } from './route-service.js?v=20261009.1';
import { sampleRoute, assessRoute, departureOptions } from './route-weather.js?v=20261026.1';
import { findWindows, checkPlan, localParts, clockTime, dayLabel } from './activity-engine.js?v=20261026.1';
import { savePlan, getState, placeKey, validPlace, hasPersistentStorage } from './personal-store.js?v=20261009.1';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let place = { latitude: Number(params.get('lat')), longitude: Number(params.get('lon')), name: (params.get('name') || '').slice(0,140), country: (params.get('country') || '').slice(0,140) };
if (!params.has('lat') || !params.has('lon') || !validPlace(place)) place = null;
let activity = ['walk','run','cycle'].includes(params.get('activity')) ? params.get('activity') : 'walk';
let minutes = [30,60,90].includes(Number(params.get('minutes'))) ? Number(params.get('minutes')) : 60;
let start = Date.parse(params.get('at') || '');
let cityWeather, origin, selectedRoute, routeChoices = [], samples = [], pointForecasts = [], assessment, selectedWindow;
let map, routeLayers, weatherMarkers, originMarker, dataGeneration = 0, routeGeneration = 0, weatherGeneration = 0;
let mode = '', weatherLayer = 'weather', routesBusy = false;
const routeData = new WeakMap();
let panelExpanded = true;
const status = message => { $('explore-status').textContent = message; };
function syncTheme() {
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.themeChoice===window.JweatherTheme.getPreference())));
}
document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click',()=> { window.JweatherTheme.setPreference(b.dataset.themeChoice); b.closest('details').open=false; }));
window.addEventListener('jweather:themechange',syncTheme);syncTheme();
$('explore-duration').value=String(minutes);
function syncModes() { document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===activity))); }
syncModes();
function syncURL() {
    if (!place) return;
    const query = new URLSearchParams({lat:place.latitude,lon:place.longitude,name:place.name,country:place.country || '',activity,minutes});
    if(Number.isFinite(start))query.set('at',new Date(start).toISOString());
    history.replaceState(null,'',location.pathname+'?'+query);
    $('back-to-weather').href=placeURL(place,{activity,...(Number.isFinite(start)?{planAt:new Date(start).toISOString(),minutes:String(minutes)}:{})});
}
function setBusy(busy) {
    routesBusy=busy;
    document.querySelectorAll('[data-mode], #set-route-start, #set-route-target').forEach(b=>b.disabled=busy);
    $('explore-routes').setAttribute('aria-busy',String(busy));
}
function selectMode(value) {
    mode=value;
    $('set-route-start').setAttribute('aria-pressed',String(mode==='start'));
    $('set-route-target').setAttribute('aria-pressed',String(mode==='destination'));
    $('cancel-map-selection').hidden=!mode;
    $('map-selection-hint').hidden=!mode;
    $('map-selection-hint').textContent=mode==='start'?'Tap the map to choose a nearby starting point.':'Tap the map to choose a destination. Your route will return to the start.';
    if(map)map.getContainer().style.cursor=mode?'crosshair':'';
}
$('set-route-start').addEventListener('click',()=>selectMode(mode==='start'?'':'start'));
$('set-route-target').addEventListener('click',()=>selectMode(mode==='destination'?'':'destination'));
$('cancel-map-selection').addEventListener('click',()=>selectMode(''));
document.addEventListener('keydown',e=>{if(e.key==='Escape')selectMode('');});
function initialiseMap() {
    if(map)return;
    if(!window.L)throw new Error('The map could not load. Try again.');
    const L=window.L;
    map=L.map('outdoor-map',{zoomControl:false,scrollWheelZoom:true}).setView([origin.latitude,origin.longitude],13);
    L.control.zoom({position:'topright'}).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'})
        .on('tileerror',()=>status('Some map tiles could not load. Route details remain available.')).addTo(map);
    weatherMarkers=L.layerGroup().addTo(map);routeLayers=L.layerGroup().addTo(map);
    map.on('click',event=>{
        if(!mode || routesBusy)return;
        const destination={latitude:event.latlng.lat,longitude:event.latlng.lng,name:mode==='start'?'Your starting point':'Your destination'};
        if(distanceBetween(place,destination)>20000 || distanceBetween(origin,destination)>20000){$('map-selection-hint').textContent='Choose a point within 20 km, or search for another place.';return;}
        const selectedMode=mode;selectMode('');
        if(selectedMode==='start'){origin=destination;loadRoutes();}
        else loadRoutes(destination);
    });
    const observer=new ResizeObserver(()=>map.invalidateSize({pan:false}));observer.observe($('outdoor-map'));
}
function drawRoutes(fit=false) {
    if(!map)return;
    const L=window.L;routeLayers.clearLayers();
    routeChoices.filter(r=>r!==selectedRoute).forEach(route=>L.polyline(route.coordinates.map(p=>[p[1],p[0]]),{color:'#7b8a7b',weight:4,opacity:.6}).on('click',()=>chooseRoute(route)).addTo(routeLayers));
    if(!selectedRoute)return;
    const coordinates=selectedRoute.coordinates.map(p=>[p[1],p[0]]);
    L.polyline(coordinates,{color:'#fffaf0',weight:10,opacity:.96,interactive:false}).addTo(routeLayers);
    const path=L.polyline(coordinates,{color:'#ce683c',weight:5,opacity:1,className:'selected-route-line'}).addTo(routeLayers);
    originMarker?.remove();
    originMarker=L.circleMarker(coordinates[0],{radius:7,color:'#faf8f3',weight:3,fillColor:'#333c2e',fillOpacity:1}).bindTooltip(el('span','',origin.name)).addTo(map);
    if(fit)map.fitBounds(path.getBounds(),{paddingTopLeft:[70,145],paddingBottomRight:[75,75],maxZoom:15,animate:false});
}
async function loadPlace(next) {
    place=next;origin={...next};const generation=++dataGeneration;
    ++routeGeneration;++weatherGeneration;
    selectedRoute=null;routeChoices=[];assessment=null;selectedWindow=null;samples=[];pointForecasts=[];cityWeather=null;
    $('selected-route-detail').hidden=true;$('explore-routes').replaceChildren();$('departure-choices').replaceChildren();$('departure-day').disabled=true;
    $('map-place-name').textContent=place.name;$('retry-explore').hidden=true;
    routeLayers?.clearLayers();weatherMarkers?.clearLayers();originMarker?.remove();
    status('Finding your place and its latest weather …');syncURL();setBusy(true);
    try {
        if(!navigator.onLine)throw new Error('Maps and routes need a connection. Your saved plans remain available from Weather.');
        const data=await fetchForecast(place);
        if(generation!==dataGeneration)return;
        if(data._jweather?.cached)throw new Error('Saved forecast. Reconnect to compare routes with fresh weather.');
        cityWeather=data;initialiseMap();map.setView([origin.latitude,origin.longitude],13);
        const today=localParts(Date.now(),data.timezone).slice(0,10);
        const dates=data.daily.time.filter(d=>d>=today);
        $('departure-day').replaceChildren(...dates.map(d=>{const option=el('option','',dayLabel(d,today));option.value=d;return option;}));
        $('departure-day').disabled=false;
        const requested=Number.isFinite(start)&&start>Date.now()?localParts(start,data.timezone).slice(0,10):'';
        if(dates.includes(requested))$('departure-day').value=requested;
        else {const suggested=findWindows(data,{activity,duration:minutes}).windows[0];start=suggested?.start || NaN;if(suggested)$('departure-day').value=suggested.date;}
        await loadRoutes();
    } catch(error) {
        if(generation!==dataGeneration)return;
        status(error.message.includes('connection')||error.message.includes('Saved forecast')?error.message:'The map or forecast could not load. Try again or choose another place.');
        $('retry-explore').hidden=false;
    } finally {if(generation===dataGeneration)setBusy(false);}
}
$('change-place').addEventListener('click',()=>pickPlace(next=>{start=NaN;loadPlace(next);}));
$('retry-explore').addEventListener('click',()=>place&&loadPlace(place));
async function loadRoutes(destination=null) {
    if(!cityWeather)return;
    const generation=++routeGeneration;++weatherGeneration;
    setBusy(true);selectMode('');selectedRoute=null;assessment=null;selectedWindow=null;routeChoices=[];
    $('selected-route-detail').hidden=true;$('explore-routes').replaceChildren();$('departure-choices').replaceChildren();$('departure-recommendation').textContent='Finding your route …';
    routeLayers.clearLayers();weatherMarkers.clearLayers();status(destination?'Finding a mapped path to your destination …':'Finding nearby parks and real paths …');
    try {
        const destinations=destination?[destination]:rankDestinations(origin,await nearbyDestinations(origin,activity),activity,minutes).slice(0,2);
        if(generation!==routeGeneration)return;
        if(!destinations.length){status('No nearby parks found. Choose a destination on the map.');$('departure-recommendation').textContent='Choose a destination to continue.';return;}
        let lastError;
        for(const target of destinations) {
            try {
                const route=await routeTo(origin,target,activity);
                if(generation!==routeGeneration)return;
                routeChoices.push(route);
                renderRouteChoices();
                if(!selectedRoute)chooseRoute(route);
            } catch(error) {lastError=error;}
        }
        if(generation!==routeGeneration)return;
        if(routeChoices.length){status('Choose your path. All routes return to your starting point.');drawRoutes();}
        else {status(lastError?.message||'No mapped route could be found. Try another destination.');$('retry-explore').hidden=false;$('departure-recommendation').textContent='Choose another destination.';}
    } catch(error) {if(generation===routeGeneration){status(error.message);$('retry-explore').hidden=false;}}
    finally {if(generation===routeGeneration)setBusy(false);}
}
function renderRouteChoices() {
    $('explore-routes').replaceChildren(...routeChoices.map(route=>{
        const choice=button('','explore-route',()=>chooseRoute(route));choice.setAttribute('aria-pressed',String(route===selectedRoute));
        choice.append(el('span','eyebrow',route===selectedRoute?'Selected · Out and back':'Alternative · Out and back'),el('strong','',route.name),el('span','explore-route-meta',`${(route.distance/1000).toFixed(1)} km · about ${Math.ceil(route.duration/60)} min`));return choice;
    }));
}
async function chooseRoute(route, fresh=false) {
    selectedRoute=route;selectedWindow=null;assessment=null;
    const generation=++weatherGeneration;
    samples=sampleRoute(route);pointForecasts=[];
    renderRouteChoices();drawRoutes(true);weatherMarkers.clearLayers();
    $('selected-route-detail').hidden=false;
    $('route-directions').href=directionsURL(origin,route);
    setWeatherStatus('loading','Checking the hourly weather along your route …');
    $('route-weather-stops').replaceChildren();$('route-weather-badge').textContent='';$('route-data-note').textContent='';$('retry-route-weather').hidden=true;
    $('save-route-window').disabled=true;$('save-reason').textContent='Waiting for fresh route weather.';
    renderDepartures();
    if(!samples.length){setWeatherStatus('unavailable','This route cannot be sampled. Routes must take less than three hours.');return;}
    try {
        let pending=routeData.get(route);
        if(!pending||fresh){
            // Repeated outward/return coordinates reuse the same forecast request.
            const unique=new Map();
            samples.forEach(p=>{const key=placeKey(p);if(!unique.has(key))unique.set(key,fetchForecast({...p,name:route.name},fresh));});
            pending=Promise.all(samples.map(p=>unique.get(placeKey(p))));routeData.set(route,pending);
        }
        const data=await pending;
        if(generation!==weatherGeneration||selectedRoute!==route)return;
        pointForecasts=data;renderDepartures();evaluateDeparture();
    } catch {
        if(generation!==weatherGeneration||selectedRoute!==route)return;
        routeData.delete(route);assessment=null;setWeatherStatus('unavailable','Route weather could not load. You can still open or export this path.');
        $('departure-recommendation').textContent='Route weather unavailable.';
        $('retry-route-weather').hidden=false;syncSave();
    }
}
function setWeatherStatus(state,message) {const node=document.querySelector('.route-weather-status');node.dataset.status=state;node.textContent=message;}
function renderDepartures() {
    if(!selectedRoute||!cityWeather)return;
    const choices=departureOptions(cityWeather,selectedRoute,$('departure-day').value);
    const matching=choices.includes(start);
    if(!matching) {
        const suggested=findWindows(cityWeather,{activity,duration:minutes,dates:[$('departure-day').value],horizonHours:144}).windows[0]?.start;
        start=choices.includes(suggested)?suggested:choices.find(t=>Number(localParts(t,cityWeather.timezone).slice(11,13))>=9)||choices[0]||NaN;
    }
    // Re-evaluating uses in-memory hourly data, never another request per time button.
    const scored=pointForecasts.length===samples.length?choices.map(time=>({time,result:assessRoute(selectedRoute,samples,pointForecasts,time,activity)})):[];
    const good=scored.filter(c=>c.result.status==='good').sort((a,b)=>b.result.score-a.result.score||a.time-b.time);
    const best=good[0]?.time;
    $('departure-choices').replaceChildren(...choices.map(time=>{
        const b=button(clockTime(time,cityWeather.timezone),'departure-choice',()=>{start=time;syncURL();updateDepartureSelection();evaluateDeparture();});
        b.dataset.at=String(time);b.setAttribute('aria-pressed',String(time===start));
        b.dataset.best=String(time===best);if(time===best)b.title='Best of the compared departures for this route';return b;
    }));
    $('departure-recommendation').textContent=best?`${clockTime(best,cityWeather.timezone)} · best compared departure`:choices.length?(pointForecasts.length?'No comfortable departure found.':'Comparing hourly conditions …'):'No departure available for this day.';
    if(!choices.length)setWeatherStatus('unavailable','No departure fits within the available forecast. Choose another day or a shorter route.');
    syncURL();updateDepartureSelection(true);
}
function updateDepartureSelection(scroll=false) {
    const controls=[...document.querySelectorAll('.departure-choice')];controls.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.at)===start)));
    if(scroll){const b=controls.find(b=>Number(b.dataset.at)===start);if(b){const parent=$('departure-choices');parent.scrollLeft=Math.max(0,b.offsetLeft-parent.offsetLeft-parent.clientWidth/2+b.offsetWidth/2);}}
}
function evaluateDeparture() {
    if(!selectedRoute||!pointForecasts.length)return;
    assessment=assessRoute(selectedRoute,samples,pointForecasts,start,activity);
    setWeatherStatus(assessment.status,assessment.reason);
    $('route-weather-badge').textContent=assessment.status==='good'?'Looks good':assessment.status==='changed'?'Check conditions':'';
    $('retry-route-weather').hidden=!['unavailable','offline'].includes(assessment.status);
    drawWeatherPoints();
    const times=pointForecasts.map(d=>Date.parse(d._jweather?.savedAt)).filter(Number.isFinite);
    const updated=times.length?` Updated ${clockTime(Math.min(...times),cityWeather.timezone)}.`:'';
    $('route-data-note').textContent='Estimated passage times · nearest hourly forecast. Conditions checked for the full moving time at sampled locations.'+updated;
    syncSave();
}
function pointText(p) {
    if(weatherLayer==='wind')return `${Math.round(p.wind)} km/h${p.windDirection===null?'':` · ${Math.round(p.windDirection)}°`}`;
    if(weatherLayer==='rain')return `${Math.round(p.rain)}% rain chance`;
    return `${Math.round(p.temperature)}°C · ${Math.round(p.rain)}% rain`;
}
function drawWeatherPoints() {
    weatherMarkers.clearLayers();
    const points=assessment?.points||[];
    $('route-weather-stops').replaceChildren(...points.map((p,i)=>{
        const li=el('li','weather-stop');li.append(el('span','stop-dot'));
        const label=el('div','stop-label',`${clockTime(p.at,p.zone)} · ${i===0?'Set off':i===points.length-1?'Back at the start':i===2?'Turning point':'On the way'}`);
        label.append(el('small','',`Hourly forecast ${clockTime(p.forecastAt,p.zone)}`));
        const reading=el('div','stop-conditions',`${Math.round(p.temperature)}°C · ${Math.round(p.rain)}% rain`);reading.append(el('small','',`${Math.round(p.wind)} km/h wind`));li.append(label,reading);return li;
    }));
    // Out-and-back coordinates overlap; show three spatial markers, with all five passage times in the details.
    const displayed=new Set();
    points.forEach(p=>{
        const key=placeKey(p);if(displayed.has(key))return;displayed.add(key);
        const bubble=el('div','route-point-bubble');bubble.dataset.status=assessment.status;
        bubble.append(el('b','',clockTime(p.at,p.zone)),el('span','',pointText(p)));
        const marker=window.L.marker([p.latitude,p.longitude],{icon:window.L.divIcon({className:'route-point-icon',html:bubble,iconSize:[0,0],iconAnchor:[0,10]}),keyboard:true,title:`${clockTime(p.at,p.zone)} · ${pointText(p)}`}).addTo(weatherMarkers);
        const detail=el('div','');points.filter(other=>placeKey(other)===key).forEach(other=>detail.append(el('p','',`${clockTime(other.at,other.zone)}: ${pointText(other)} (hourly ${clockTime(other.forecastAt,other.zone)})`)));
        marker.bindPopup(detail);
    });
}
function syncSave() {
    selectedWindow=null;const save=$('save-route-window');save.disabled=true;save.textContent='Save weather window';
    if(!selectedRoute||!Number.isFinite(start)){$('save-reason').textContent='Choose a route and departure first.';return;}
    if(selectedRoute.duration>minutes*60){$('save-reason').textContent=`This route takes about ${Math.ceil(selectedRoute.duration/60)} min. Choose more time outside or a shorter route.`;return;}
    if(assessment?.status!=='good'){$('save-reason').textContent='A fresh, comfortable route forecast is needed to save this time.';return;}
    const end=start+minutes*60000;
    const plan={activity,start,end,duration:minutes,zone:cityWeather.timezone};
    const check=checkPlan(cityWeather,plan);
    if(check.status!=='good'){$('save-reason').textContent='The full weather window is not a comfortable fit at the forecast location.';return;}
    // This saves a local weather plan; the route geometry is deliberately not persisted.
    selectedWindow=plan;
    const saved=getState().plans.some(p=>p.activity===activity&&p.start===start&&p.end===end&&placeKey(p.place)===placeKey(place));
    save.disabled=saved;save.textContent=saved?'Saved ✓':'Save weather window';
    $('save-reason').textContent=saved?'This time is in My plans. The route itself is not saved.':`${minutes} minutes in My plans. Export GPX to keep the route.`;
}
$('save-route-window').addEventListener('click',()=>{
    syncSave();if(!selectedWindow||$('save-route-window').disabled)return;
    try {savePlan(selectedWindow,place);syncSave();if(!hasPersistentStorage())$('save-reason').textContent='Saved for this visit. Browser storage is unavailable.';}catch(error){$('save-reason').textContent=error.message;}
});
window.addEventListener('jweather:personal',syncSave);
window.addEventListener('offline',()=>{++weatherGeneration;assessment=null;weatherMarkers?.clearLayers();if(selectedRoute){setWeatherStatus('offline','You are offline. Reconnect for fresh route weather.');$('retry-route-weather').hidden=false;syncSave();}});
$('route-gpx').addEventListener('click',()=>{
    if(!selectedRoute)return;
    const url=URL.createObjectURL(new Blob([routeGPX(selectedRoute)],{type:'application/gpx+xml'}));const a=el('a');a.href=url;a.download='jweather-route.gpx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
});
$('retry-route-weather').addEventListener('click',()=>{if(selectedRoute)chooseRoute(selectedRoute,true);});
$('departure-day').addEventListener('change',()=>{start=NaN;renderDepartures();evaluateDeparture();});
$('explore-duration').addEventListener('change',()=>{minutes=Number($('explore-duration').value);syncURL();syncSave();});
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{activity=b.dataset.mode;syncModes();syncURL();loadRoutes();}));
document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>{weatherLayer=b.dataset.layer;document.querySelectorAll('[data-layer]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));if(assessment)drawWeatherPoints();}));
$('details-toggle').addEventListener('click',()=>{
    panelExpanded=!panelExpanded;$('details-toggle').setAttribute('aria-expanded',String(panelExpanded));$('details-toggle-symbol').textContent=panelExpanded?'⌄':'⌃';$('explore-panel-content').hidden=!panelExpanded;
});
const mobile=matchMedia('(max-width: 700px)');mobile.addEventListener('change',()=>{if(!mobile.matches){panelExpanded=true;$('details-toggle').setAttribute('aria-expanded','true');$('explore-panel-content').hidden=false;}});
if(place)loadPlace(place);
