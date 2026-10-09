# Your day, your browser

## My day

Save a forecast location with the star beside its name, or choose **Add a place** on the home page. Keep up to four favorites. **Your preferences** sets an activity, duration, free hours and weekdays. These hours apply in each destination's local timezone, and the whole activity must fit inside them. Sunset lasts 45 minutes. Overnight free-time intervals are not supported.

The home page suggests a suitable moment using those preferences. On phones, My day appears before the illustration once you have a favorite. Presets show the saved hours; editing a time switches to **Your own hours**. Choosing Sunset explains its fixed 45-minute duration.

On the forecast page, **Make it yours → Use my hours** applies the same hours; turn it off to explore other parts of the day. An empty state means the weather or available data does not offer a suitable window. Current conditions and the hourly and five-day forecasts appear before activity suggestions and plans/maps. The mobile navigation follows that same order. Dialogs fit the visible viewport, including when the on-screen keyboard opens.

## Saved and shared plans

**Save plan** keeps the place, activity and absolute start/end times locally. Up to 24 plans are kept, and plans that ended more than a day ago leave the visible list. **My plans** checks each activity against the refreshed forecast, including every overlapping hour. It distinguishes suitable, changed, incomplete, offline, ongoing and elapsed plans.

**Find a better time** prefers alternatives on the original day before looking farther ahead. The selected alternative is reviewed before it changes anything. Connected Google or Microsoft events can be updated after confirmation; failed updates leave the plan unchanged. [Calendar configuration and behaviour](calendars.md).

**Share** uses the native share sheet where available, then clipboard copy, then a selectable link. Links contain public coordinates, place name, activity, duration and a UTC start time. They never contain local plan IDs, calendar event IDs or tokens. Recipients check the current forecast before choosing to save the invitation. Shared links can outlive the forecast or the activity itself.

**Remove** offers **Undo** for ten seconds. The notification stays available while you hover it or focus its controls. Undo restores the original plan and calendar link; removing a local plan does not delete a calendar event. Saving controls on suggestions, routes and comparisons update immediately when a plan is saved, removed or restored.

Clearing this site's browser data removes its favorites, preferences, saved plans and offline files. If browser storage is blocked, the interface stays usable for the visit and explains that saving will not survive a reload.

## Compare places

Compare up to three locations for the same activity and duration. Tomorrow, the weekend and the next three days refer to the selected forecast location's calendar dates. Every destination is evaluated on those same dates in its own timezone; a date outside the available forecast produces an empty state rather than a substitute day.

**Best available fit** appears only when at least two fresh forecasts have suitable windows and one has a meaningfully higher suitability score. This is a comparison of temperature, rain, wind, gusts and UV, not a probability that the forecast will be correct. Offline or failed forecasts do not receive that label.

## Explore

The map loads when its tab opens. **Find a route** opens it directly with your selected walking, running or cycling activity, including when you return to an already opened map. It starts near the selected forecast location; a city search may point to the city centre. Use **Set start on map** to move the start, or **Choose destination** to pick a point. **Cancel selection** leaves the current route unchanged. Starts and destinations must stay within 20 km of the relevant location. Weather-window saving is offered only near the forecast location, for the same activity and a route short enough to fit its duration. Route cards explain when the selected time or activity does not fit.

On touch screens, one-finger gestures scroll the page by default. Pinch to zoom the map, or choose **Move map** to enable dragging. **Done moving** restores page scrolling. Zoom buttons remain available in either mode.

Nearby parks come from OpenStreetMap. Walking and running routes use FOSSGIS's foot profile; cycling uses its bike profile. Routes follow returned GeoJSON paths to the destination and back, and are labelled **Out and back**. Distance comes from the routing service. Walking and cycling moving time comes from the profile; running time assumes 9 km/h. Stops are excluded, and route access can change.

**Directions** opens a matching Google Maps request for the same start and destination. Its route may differ from the displayed OSRM path. **Download GPX** preserves the displayed track. **Save weather window** saves the activity time; download the GPX separately to keep the route. Public routing services may be unavailable, in which case the app offers another destination or retry rather than drawing a substitute line.

The site does not bulk-download map tiles. Tiles, park searches and routing need a connection. Leaflet is vendored, versioned and licensed in `assets/vendor/leaflet`; its archive integrity is recorded in `source.json`.

## Installation and offline use

Use **Get the app** for installation or platform-specific instructions. Safari on iPhone/iPad uses **Share → Add to Home Screen**. Other browsers may expose **Install app** or **Add to Home screen**. Installation availability depends on the browser.

After a successful online visit and service-worker installation, the app shell and up to twenty public forecast responses are cached. The first forecast is handed to the worker even if it loaded before the worker took control. Previously visited forecast links work offline; an unvisited place produces a connection error. A saved forecast shows its download time and **Saved conditions**, and disables fresh activity suggestions and comparison rankings. Returning online reloads an offline forecast.

Calendar callbacks, sign-in endpoints, authenticated requests, access tokens, map tiles and route responses are excluded from the offline cache. Tokens remain in memory and disappear on reload. New shell versions wait until the user chooses **Update Jweather**, and only old shell caches are removed; local plans and preferences remain.

## Verification

`npm test` runs computations and browser tests beneath `/Jweather/`. Browser checks use deterministic forecasts, park and route responses and simulated calendar providers. PWA tests allow the real service worker and take the browser offline. Mobile checks cover 320, 390, 768 and 1440 px in both themes, with reduced motion, plus landscape dialogs, long names, keyboard selection, undo and touch scrolling over the map.

Documentation screenshots use example weather. `tests/map-example.json` contains two actual Berlin routes fetched from FOSSGIS and park coordinates from Overpass on 9 October 2026. The optional map capture fetches only the visible OpenStreetMap tiles; attribution stays in the image.
