<div align="center">

# jweather.

Weather at a glance. A little time outside.

[Open Jweather ↗](https://jayden-ff.github.io/Jweather/)

</div>

![Jweather home — a warm paper background, a sun on the horizon, and a place search](docs/screenshots/home.png)

A forecast for wherever you are. Search a city or use your location, then find a good moment for a walk, a run, a ride or the last light of the day.

The interface pairs warm neutrals with amber sunlight and a little orange at sunset. Light and dark appearances follow your system or your choice. Colours and small, quiet animations respond to the weather.

![Time outside — activity choices, a recommended hour, and a forecast timeline](docs/screenshots/time-outside.png)

## A little time outside

Choose **Walk**, **Run**, **Cycle** or **Sunset**. Jweather compares hourly conditions and suggests up to three distinct moments over the next three days. Change the duration or time of day, or focus on today or tomorrow. Each suggestion shows its temperature, maximum rain chance and wind.

Suggestions use the whole activity window, daylight, rain, wind, gusts, temperature and UV. Cycling has a stricter wind limit; sunset also considers cloud cover. Uncomfortable conditions or missing readings produce an honest empty state. These are forecasts, so check conditions before heading out.

**Add to calendar** prepares the activity, place and times for Google Calendar, Outlook or Microsoft 365. An ICS file works with Apple Calendar and other calendar apps. Calendar links open an event draft; you save it in the destination app.

Optional Google and Microsoft connections can create the event directly after account consent. They need public OAuth application IDs in [calendar-config.js](calendar-config.js). [Calendar setup](docs/calendars.md) explains the registrations and exact callback URLs. No client secret or backend is needed. The default site works immediately with calendar links and ICS.

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

<details>
<summary>On a smaller screen</summary>
<br>
<img src="docs/screenshots/forecast-mobile.png" alt="The mobile forecast with scrollable hourly conditions and a five-day list" width="320">
</details>

*Screenshots show the actual interface with example forecast data.*

- Current temperature, feels-like temperature, humidity and wind
- Eight hours ahead, five days ahead, and a closer look at each day
- Sunrise, sunset, rain probability and precipitation
- Celsius or Fahrenheit, remembered places, and light or dark appearance
- Activity windows, personal preferences and calendar export
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

Tests cover forecast recommendations, daylight-saving time, calendar file escaping, search, units, themes, mobile layouts, dialogs and connection failures. Google consent/event creation and Microsoft's PKCE flow are exercised with simulated provider responses, including denial and invalid callback states. Real account access requires configured app registrations. Tests and the six screenshots use repeatable example data, so they work without access to Open-Meteo or a calendar account.

## GitHub Pages

In **Settings → Pages**, choose **Deploy from a branch**, select your branch and **/ (root)**, then save. No build is needed. Relative asset paths support both project sites and custom domains; `.nojekyll` keeps deployment static.

Forecasts can be linked directly:

```text
weather.html?lat=38.7223&lon=-9.1393&name=Lisbon&country=Portugal
```

Existing links with `lat`, `lon` and `name` continue to work.

## Data and credits

Weather and place search: [Open-Meteo](https://open-meteo.com/), subject to its [terms](https://open-meteo.com/en/terms). Times use the selected place's timezone. Daily rain probability is the day's maximum; missing optional readings appear as `—`. Weather updates when you open or reload the forecast. Sunrise and sunset accents use the forecast's local time.

Type: **DM Sans** and **Instrument Serif**, served locally under the [SIL Open Font License](assets/fonts/). Application: [Apache 2.0](LICENSE).
