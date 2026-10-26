import { test, expect } from '@playwright/test';
import { forecast, parks, routeFixture, now, placePath } from './journey-fixtures.mjs';
const path='explore.html?lat=52.52&lon=13.405&name=Berlin&country=Germany&activity=cycle&at=2026-10-08T13%3A00%3A00.000Z&minutes=60';
async function setup(page,{fail=false}={}) {
 await page.clock.install({time:new Date(now)});
 const calls=[];
 await page.route('https://api.open-meteo.com/**',r=>{calls.push(r.request().url());return fail?r.abort():r.fulfill({json:forecast()});});
 await page.route('https://overpass-api.de/**',r=>r.fulfill({json:parks}));
 await page.route('https://routing.openstreetmap.de/**',r=>r.fulfill({json:routeFixture(r.request().url())}));
 await page.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e4e8da"/></svg>'}));
 return calls;
}
test('full map carries activity/time, shows real routes and compares departures without refetching',async({page})=>{
 const calls=await setup(page);await page.goto(path);
 await expect(page.locator('.explore-route')).toHaveCount(2);
 await expect(page.locator('[data-mode=cycle]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','good');
 await expect(page.locator('.departure-choice[aria-pressed=true]')).toHaveText('15:00');
 await expect(page.locator('.weather-stop')).toHaveCount(5);
 await expect(page.locator('#route-directions')).toHaveAttribute('href',/travelmode=bicycling/);
 await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
 const n=calls.length;await page.getByRole('button',{name:'15:30',exact:true}).click();
 await expect(page.locator('.departure-choice[aria-pressed=true]')).toHaveText('15:30');
 await expect(page.locator('.weather-stop').first()).toContainText('15:30');expect(calls.length).toBe(n);
 await page.locator('#save-route-window').click();await expect(page.locator('#save-route-window')).toHaveText('Saved ✓');
 await page.locator('#back-to-weather').click();await expect(page).toHaveURL(/weather.html/);await expect(page.locator('.plan-card')).toHaveCount(1);
});
test('route longer than selected window and stormy weather cannot be saved',async({page})=>{
 await setup(page);await page.route('https://routing.openstreetmap.de/**',r=>{const f=routeFixture(r.request().url());f.routes[0].duration=5400;return r.fulfill({json:f});});
 await page.goto(path.replace('activity=cycle','activity=walk'));
 await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','good');await expect(page.locator('#save-route-window')).toBeDisabled();
 await expect(page.locator('#save-reason')).toContainText('90 min');
 await page.locator('#explore-duration').selectOption('90');await expect(page.locator('#save-route-window')).toBeEnabled();
 await page.route('https://api.open-meteo.com/**',r=>{const f=forecast();f.hourly.weather_code.fill(95);return r.fulfill({json:f});});
 await page.reload();await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','changed');await expect(page.locator('#save-route-window')).toBeDisabled();
});
test('failed route weather keeps route usable and offers retry',async({page})=>{
 await setup(page);await page.route('https://api.open-meteo.com/**',r=>{
 const lat=Number(new URL(r.request().url()).searchParams.get('latitude'));
 return lat===52.52?r.fulfill({json:forecast()}):r.abort();});
 await page.goto(path);await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','unavailable');
 await expect(page.locator('#save-route-window')).toBeDisabled();await expect(page.locator('#route-gpx')).toBeEnabled();await expect(page.locator('#retry-route-weather')).toBeVisible();
});
test('direct entry without location and forecast failures remain recoverable',async({page})=>{
 await setup(page,{fail:true});await page.goto('explore.html');await expect(page.locator('#explore-status')).toContainText('Choose a place');
 await page.goto(path);await expect(page.locator('#explore-status')).toContainText('could not load');await expect(page.locator('#retry-explore')).toBeVisible();
});
for(const width of [320,390,768,1440])test(`full map fits ${width}px and mobile details stay accessible`,async({page})=>{
 await page.setViewportSize({width,height:844});await setup(page);await page.emulateMedia({reducedMotion:'reduce'});await page.goto(path);
 await expect(page.locator('.explore-route')).toHaveCount(2);
 for(const theme of ['light','dark']){
 await page.evaluate(t=>window.JweatherTheme.setPreference(t),theme);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width<=700){await page.locator('#details-toggle').click();await expect(page.locator('#details-toggle')).toHaveAttribute('aria-expanded','false');await page.locator('#details-toggle').click();await expect(page.locator('#save-route-window')).toBeVisible();}
 }
 await page.locator('#departure-day').focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement.tagName)).toBe('BUTTON');
 const b=await page.locator('#outdoor-map').boundingBox();expect(b.height).toBeGreaterThan(200);
});
test('route entry opens dedicated page with current weather-window context',async({page})=>{
 await setup(page);await page.goto(placePath);await page.getByRole('button',{name:'Find a route',exact:true}).click();
 await expect(page).toHaveURL(/explore.html.*activity=walk/);await expect(page.locator('.explore-route')).toHaveCount(2);
});
test('weather stays primary and routes remain available as an optional tool',async({page})=>{
 await setup(page);await page.goto(placePath);
 await expect(page.locator('.site-header')).not.toContainText('Explore map');
 await expect(page.locator('#map-panel')).toBeHidden();
 await page.locator('#map-tab').click();
 await page.getByRole('link',{name:'Open route planner',exact:true}).click();
 await expect(page).toHaveURL(/explore.html/);await expect(page.locator('.explore-route')).toHaveCount(2);
});
test('offline time changes never restore a recommendation or enable saving',async({page,context})=>{
 await setup(page);await page.goto(path);await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','good');
 await context.setOffline(true);await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','offline');
 await page.getByRole('button',{name:'15:30',exact:true}).click();
 await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','offline');
 await expect(page.locator('#save-route-window')).toBeDisabled();await expect(page.locator('#departure-recommendation')).toContainText('Reconnect');
 await context.setOffline(false);await page.locator('#retry-route-weather').click();
 await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','good');
});
test('custom start and destination can be selected with map keyboard controls',async({page})=>{
 await setup(page);await page.goto(path);await expect(page.locator('.explore-route')).toHaveCount(2);
 await page.locator('#set-route-target').focus();await page.keyboard.press('Enter');
 await page.locator('#outdoor-map').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 await expect(page.locator('.explore-route')).toHaveCount(1);await expect(page.locator('.explore-route')).toContainText('Your destination');
 await page.locator('#set-route-start').click();await page.locator('#outdoor-map').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
 await expect(page.locator('#set-route-start')).toHaveAttribute('aria-pressed','false');await expect(page.locator('.explore-route')).toHaveCount(2);
});
for(const viewport of [{width:320,height:568},{width:844,height:390}])test(`departure controls stay on screen at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await setup(page);await page.goto(path);await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','good');
 const departure=await page.locator('.departure-bar').boundingBox();expect(departure.y+departure.height).toBeLessThanOrEqual(viewport.height);
});
test('selected route stays inside mobile map when the details panel changes height',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);
 const longer={elements:[{id:101,center:{lat:52.545,lon:13.405},tags:{name:'Long park',leisure:'park'}}]};
 await page.route('https://overpass-api.de/**',r=>r.fulfill({json:longer}));await page.goto(path);
 await expect(page.locator('.route-weather-status')).toHaveAttribute('data-status','good');
 await page.locator('#details-toggle').click();await page.locator('#details-toggle').click();
 await expect.poll(async()=>{const map=await page.locator('#outdoor-map').boundingBox(),route=await page.locator('.selected-route-line').boundingBox();return route.y>=map.y+45&&route.y+route.height<=map.y+map.height-20;}).toBe(true);
});
