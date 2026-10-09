<div align="center">

# jweather.

Weather at a glance. A little time outside.

[Open Jweather ↗](https://jayden-ff.github.io/Jweather/)

</div>

![Jweather home — a warm paper background, a sun on the horizon, and a place search](docs/screenshots/home.png)

A forecast for wherever you are, with a good reason to step outside. Find a city, choose a walk, run, ride or sunset, and turn a suitable weather window into a plan.

The interface pairs warm neutrals with amber sunlight and a little orange at sunset. Light and dark appearances follow your system or your choice. Colours and small, quiet animations respond to the weather.

![Time outside — activity choices, a recommended hour, and a forecast timeline](docs/screenshots/time-outside.png)

## A little time outside

Choose **Walk**, **Run**, **Cycle** or **Sunset**. Jweather compares hourly conditions and suggests up to three distinct moments over the next three days. Change the duration or time of day, or focus on today or tomorrow. Each suggestion shows its temperature, maximum rain chance and wind.

Suggestions use the whole activity window, daylight, rain, wind, gusts, temperature and UV. Cycling has a stricter wind limit; sunset also considers cloud cover. Uncomfortable conditions or missing readings produce an honest empty state. These are forecasts, so check conditions before heading out.

**Add to calendar** prepares the activity, place and times for Google Calendar, Outlook or Microsoft 365. An ICS file works with Apple Calendar and other calendar apps. Calendar links open an event draft; you save it in the destination app.

Optional Google and Microsoft connections can create the event directly after account consent. They need public OAuth application IDs in [calendar-config.js](calendar-config.js). [Calendar setup](docs/calendars.md) explains the registrations and exact callback URLs. No client secret or backend is needed. The default site works immediately with calendar links and ICS.

## Make a day of it

**My day** starts with your favorite places, preferred activity and free hours. A personal suggestion waits on the home page. Save a moment and find it under **My plans**; Jweather checks its weather when you return. If conditions change, review a better time before moving the plan. A connected calendar can update its linked event after your confirmation. Removed a plan by mistake? **Undo** brings it back with its calendar link intact.

![My day — a favorite place and a personal afternoon recommendation](docs/screenshots/my-day.png)

**Compare places** puts up to three destinations beside each other for tomorrow, the weekend or the next three days. Suggestions use the same activity and local calendar dates. Each one shows the conditions behind it; unavailable or offline forecasts stay out of the ranking.

![Compare places — three destinations, their weather windows, and the best available fit](docs/screenshots/compare-places.png)

**Find a route** takes your chosen activity straight into **Explore**. Find nearby parks and mapped out-and-back routes, choose a start or destination, then open directions or download the track as GPX. Walking and cycling use different routing profiles; running times use an estimated 9 km/h pace. Route cards show whether their moving time fits the selected weather window, and saving updates as you change your plans.

![Explore — an OpenStreetMap view of Berlin and two suggested routes](docs/screenshots/explore.png)

**Share** sends a link with the place, activity and absolute start time. Someone else can open it, check the forecast and save the same moment. Calendar connections and event IDs stay private.

## Keep it close

Use **Get the app** to install Jweather where your browser supports it. After a first online visit, the app and up to twenty loaded forecasts are available offline. Saved conditions carry their original download time; new recommendations and comparisons need a fresh connection. Maps and route planning need internet access.

Places, preferences and saved plans stay on this device, in this browser. There is no account or cross-device sync. [How plans, maps and offline access work](docs/plans.md).

<details>
<summary>Make it a plan</summary>
<br>
<img src="docs/screenshots/calendar.png" alt="Calendar chooser with the activity, location and times already filled in" width="440">
</details>

## The forecast

<table>
<tr><th>Light</th><th>Dark</th></tr>
<tr>
<td><img src="docs/screenshots/forecast-light.png" alt="Lisbon forecast in light mode, with an orange sunset accent" width="100%"></td>
<td><img src="docs/screenshots/forecast-dark.png" alt="The same forecast in dark mode" width="100%"></td>
</tr>
</table>

## On your phone

Current conditions, the hours ahead and the five-day forecast come first. Activities and plans follow below. A small navigation bar keeps **Now**, **Forecast**, **Time outside** and **Your day** within reach. Temperature units sit beside the local time. Your personal day appears before the home page illustration once you have a favorite place.

Controls have more room to tap, search fields avoid the automatic iPhone zoom, and dialogs fit the visible screen when the keyboard opens. Scroll past the map normally; use **Move map** when you want to drag it, or pinch to zoom. **Cancel selection** leaves a start or destination unchanged.

<details>
<summary>A closer look at mobile</summary>
<br>
<table>
<tr><th>The forecast</th><th>Your preferences</th></tr>
<tr>
<td valign="top"><img src="docs/screenshots/forecast-mobile.png" alt="Mobile dark forecast with section navigation, temperature units and an activity window" width="320"></td>
<td valign="top"><img src="docs/screenshots/preferences-mobile.png" alt="Personal activity, free hours, weekdays and favorite places in a mobile dialog" width="320"></td>
</tr>
</table>

[My day on mobile](docs/screenshots/home-mobile.png) · [Explore on mobile](docs/screenshots/explore-mobile.png)

</details>

*Screenshots show the actual interface with example forecast data.*

- Current temperature, feels-like temperature, humidity and wind
- Eight hours ahead, five days ahead, and a closer look at each day
- Sunrise, sunset, rain probability and precipitation
- Celsius or Fahrenheit, remembered places, and light or dark appearance
- Activity windows, personal preferences and calendar export
- Favorite places, saved plans, destination comparison and shareable moments
- Maps, walking and cycling routes, GPX downloads and offline forecasts
- Keyboard navigation, mobile layouts and reduced-motion support

Everything runs in the browser. Forecasts need no API key, framework or build step. Location access is requested only when you choose **Use my location**. Preferences and recent places stay in your browser. Calendar access tokens stay in memory and are discarded on reload; connecting a calendar never happens until you choose it.

## Development

Serve the repository with any static web server:

```sh
python3 -m http.server 8000
```

Or, with Node.js 20 or newer:

```sh
npm run dev
```

The Node server uses port 8080 and the `/Jweather/` project path. It does not require installing npm dependencies. Geolocation needs HTTPS, except on localhost.

## Checks and screenshots

```sh
npm ci
npx playwright install chromium
npm test
npm run screenshots
```

To use an existing Chromium installation:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm test
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run screenshots
```

Tests cover recommendations, personal hours, changed plans, undo, comparison, sharing, route geometry, offline caching, search, units and themes. Mobile checks include small screens, landscape dialogs, long place names, section navigation and actual touch scrolling over the map. Google consent and Microsoft's PKCE flow use simulated provider responses, including denial, invalid callback states and updates to linked events. Real account access requires configured app registrations. Interface screenshots use repeatable example forecasts; the map example uses saved OpenStreetMap route data.

To refresh both map screenshots as well, set `JWEATHER_SCREENSHOT_MAP=1`. This fetches only tiles displayed in the example views, with normal TLS verification. Other screenshots need no external service.

## GitHub Pages

In **Settings → Pages**, choose **Deploy from a branch**, select your branch and **/ (root)**, then save. No build is needed. Relative asset paths support both project sites and custom domains; `.nojekyll` keeps deployment static.

Forecasts can be linked directly:

```text
weather.html?lat=38.7223&lon=-9.1393&name=Lisbon&country=Portugal
```

Existing links with `lat`, `lon` and `name` continue to work.

The manifest and service worker use relative paths, including the `/Jweather/` project prefix. When changing offline assets for a later release, bump `VERSION` in [service-worker.js](service-worker.js) and the HTML asset versions. Existing installations offer **Update Jweather** once the new shell is ready; personal data survives the update.

## Data and credits

Weather and place search: [Open-Meteo](https://open-meteo.com/), subject to its [terms](https://open-meteo.com/en/terms). Times use the selected place's timezone. Daily rain probability is the day's maximum; missing optional readings appear as `—`. Weather updates when you open or reload the forecast. Sunrise and sunset accents use the forecast's local time.

Maps and paths: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under ODbL. Parks: [Overpass](https://overpass-api.de/), with bounded [Nominatim](https://nominatim.org/) category search as a fallback. Routes: [FOSSGIS / OSRM](https://routing.openstreetmap.de/). Route requests are queued below one per second, and results are reused during the visit. [Leaflet 1.9.4](https://leafletjs.com/) is served locally with its [BSD license](assets/vendor/leaflet/LICENSE.txt). Tiles are loaded only for the open map; none are downloaded for offline use.

Type: **DM Sans** and **Instrument Serif**, served locally under the [SIL Open Font License](assets/fonts/). Application: [Apache 2.0](LICENSE).
