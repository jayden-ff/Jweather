# Dedicated Explore Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Ship the approved full-page Explore map with route weather and departure comparison.
**Architecture:** Keep the existing inline explorer as a compatible entry/preview. Add an independent Explore page using Leaflet and existing route/forecast/personal services. Isolate deterministic weather sampling and assessment in route-weather.js.
**Tech Stack:** Browser ES modules, Leaflet 1.9.4, Open-Meteo, OSRM, Node tests, Playwright.
**Spec:** docs/superpowers/specs/2026-10-26-explore-map-design.md

## Global Constraints
- Static app, no new framework, backend or account.
- At most five spatial weather samples per selected route; cache and reuse across departure choices.
- Show hourly resolution and estimated passage times, no false radar or reliability percentages.
- Whole route fits a saved activity window; retain existing save-plan schema.
- Keep English app copy, actual OSM geography and attribution, existing routes, GPX and directions.
- User said “Ja einfach umsetzen”: execute without further plan/worktree approval. Use current clean work branch.

## Review Focus
- Out-and-back repeated coordinates still require different passage times.
- Missing data, offline cached forecasts and partial route coverage disable recommendations and saving.
- Midnight, DST gaps and repeated hours must not create invented passage times.
- Rapid route/mode changes must not render stale weather or selection.
- Mobile panels and keyboard access must not trap map controls or hide actions.

### Task 1: Deterministic route weather
Files: create route-weather.js, tests/route-weather.test.mjs; modify activity-engine.js and forecast-api.js.
Interfaces: sampleRoute(route) returns <=5 {latitude,longitude,fraction}; assessRoute(route,samples,forecasts,start,activity) returns status, points, score, reason; departureOptions(data,route,day,now) returns absolute start values. Reuse existing comfort assessment via exported assessHour(data,index,activity).
- [x] Add tests for repeated-coordinate timing, full-hour coverage, missing readings, cached forecasts, weather deterioration, DST and forecast horizon; run to see failure.
- [x] Implement helpers and add hourly wind direction to API parameters.
- [x] Run node --test tests/route-weather.test.mjs and all existing node tests; commit.

### Task 2: Dedicated responsive map
Files: create explore.html, explore-page.js, explore-page.css, tests/explore-page.spec.mjs.
Interfaces: URL lat,lon,name,country,activity,at,minutes conveys existing selection; route-service.js supplies real routes; fetchForecast supplies per-sample data. New page initializes Leaflet directly, renders route choices and departure buttons, assessment markers and accessible mobile details panel.
- [x] Add tests for direct entry, selected activity/time, departure changes without extra weather requests, API failures and whole-route save gating; run to see failure.
- [x] Implement full-height desktop sidebar/map/time controls and mobile panel, start/destination selection, mode switching, route exports and assessment. Use textContent-safe labels.
- [x] Verify targeted Playwright tests at 320,390,768,1440 pixels with keyboard, dark mode and reduced motion; commit.

### Task 3: Integrate and validate
Files: modify explore.js, journey.js, weather.html, service-worker.js, README.md, docs/plans.md; add entry link helper if needed.
- [x] Add test proving existing Find a route and Explore entries link to the full page with context; run to see failure.
- [x] Preserve old tab behavior for compatibility while adding prominent full-map entry and navigate Find a route to new page. Update shell cache and query versions; document actual behavior.
- [x] Run full npm test with system Chromium; inspect desktop/mobile screenshots and new page accessibility/overflow; commit.
- [x] Request independent whole-branch review and fix important findings with regression coverage; final verification and report.
