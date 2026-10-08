<div align="center">

# jweather.

Current conditions. The hours ahead. A five-day outlook.

[Open Jweather ↗](https://jayden-ff.github.io/Jweather/)

</div>

![Jweather home — a warm paper background, a sun on the horizon, and a place search](docs/screenshots/home.png)

A forecast for wherever you are. Search a city or use your location, then see the weather for today and the next five days.

The interface pairs warm neutrals with amber sunlight and a little orange at sunset. Light and dark appearances follow your system or your choice. Colours and small, quiet animations respond to the weather.

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

## The forecast

- Current temperature, feels-like temperature, humidity and wind
- Eight hours ahead, five days ahead, and a closer look at each day
- Sunrise, sunset, rain probability and precipitation
- Celsius or Fahrenheit, remembered places, and light or dark appearance
- Keyboard navigation, mobile layouts and reduced-motion support

Everything runs in the browser. No API key, framework or build step. Location access is requested only when you choose **Use my location**. Preferences and recent places stay in your browser.

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

Browser tests cover search, forecasts, units, themes, weather effects, mobile layouts, dialogs and connection failures. They also check that search results stay clickable above the illustration. Tests and screenshots use repeatable example data, so they work without access to Open-Meteo.

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
