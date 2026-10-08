'use strict';

(() => {
    const $ = (id) => document.getElementById(id);
    const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
    const storage = {
        get(key, fallback) {
            try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
            catch { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); }
            catch { /* Private browsing and disabled storage still allow the weather to work. */ }
        }
    };
    function syncThemeColor() {
        const color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta && color) meta.content = color;
    }
    function setupAppearance() {
        const picker = $('theme-picker');
        if (!picker) return;
        const summary = picker.querySelector('summary');
        const choices = picker.querySelectorAll('[data-theme-choice]');
        const labels = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
        const symbols = {
            auto: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4m-4 0h8"/>',
            light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
            dark: '<path d="M17 16A8 8 0 0 1 8 3a8 8 0 1 0 9 13Z"/>'
        };
        function sync() {
            const preference = window.JweatherTheme?.getPreference() || 'auto';
            choices.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preference)));
            summary.setAttribute('aria-label', `Darstellung ändern: ${labels[preference]}`);
            summary.title = `Darstellung: ${labels[preference]}`;
            picker.querySelector('.theme-symbol').innerHTML = symbols[preference];
            syncThemeColor();
        }
        choices.forEach((button) => button.addEventListener('click', () => {
            window.JweatherTheme?.setPreference(button.dataset.themeChoice);
            picker.open = false;
            summary.focus();
        }));
        document.addEventListener('pointerdown', (event) => { if (!picker.contains(event.target)) picker.open = false; });
        document.addEventListener('focusin', (event) => { if (!picker.contains(event.target)) picker.open = false; });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && picker.open) {
                event.preventDefault();
                picker.open = false;
                summary.focus();
            }
        });
        window.addEventListener('jweather:themechange', sync);
        sync();
    }
    const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
    const validPlace = (place) => place && isNumber(place.latitude) && Math.abs(place.latitude) <= 90
        && isNumber(place.longitude) && Math.abs(place.longitude) <= 180 && typeof place.name === 'string';
    const tidy = (value) => typeof value === 'string' ? value.trim().slice(0, 120) : '';
    const recentPlaces = () => {
        const saved = storage.get('jweather.places', []);
        return Array.isArray(saved) ? saved.filter(validPlace).slice(0, 3) : [];
    };
    const placeURL = (place) => {
        const url = new URL('weather.html', window.location.href);
        url.search = new URLSearchParams({
            lat: String(place.latitude), lon: String(place.longitude), name: tidy(place.name),
            country: tidy(place.country), region: tidy(place.admin1)
        }).toString();
        return url.href;
    };
    const rememberPlace = (place) => {
        const saved = recentPlaces().filter((item) =>
            Math.abs(item.latitude - place.latitude) > .01 || Math.abs(item.longitude - place.longitude) > .01);
        storage.set('jweather.places', [place, ...saved].slice(0, 3));
    };

    async function requestJSON(url, signal) {
        const controller = new AbortController();
        let timedOut = false;
        const abort = () => controller.abort();
        if (signal?.aborted) controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) throw new Error(response.status === 429
                ? 'Gerade sind es zu viele Anfragen. Bitte versuche es in einer Minute noch einmal.'
                : 'Der Wetterdienst ist gerade nicht erreichbar. Bitte versuche es später erneut.');
            const data = await response.json();
            if (data.error) throw new Error('Für diesen Ort ist gerade keine Vorhersage verfügbar.');
            return data;
        } catch (error) {
            if (timedOut) throw new Error('Die Anfrage dauert zu lange. Bitte versuche es erneut.');
            if (error instanceof TypeError) throw new Error('Keine Verbindung zum Wetterdienst. Prüfe bitte deine Internetverbindung.');
            if (error instanceof SyntaxError) throw new Error('Die Antwort des Wetterdienstes ist gerade unvollständig. Bitte versuche es erneut.');
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
        }
    }

    function setupSearch() {
        const area = document.querySelector('[data-search]');
        if (!area) return;
        const input = $('location-search');
        const list = $('search-results');
        const status = $('search-status');
        let results = [];
        let active = -1;
        let timer;
        let controller;
        let lastQuery = '';

        function positionResults() {
            if (list.hidden) return;
            const rect = area.querySelector('.search-control').getBoundingClientRect();
            const viewport = window.visualViewport;
            const top = viewport?.offsetTop || 0;
            const bottom = top + (viewport?.height || window.innerHeight);
            const below = Math.max(0, bottom - rect.bottom - 16);
            const above = Math.max(0, rect.top - top - 16);
            const openAbove = below < 180 && above > below;
            list.dataset.placement = openAbove ? 'above' : 'below';
            list.style.setProperty('--search-results-height', `${Math.max(48, openAbove ? above : below)}px`);
        }
        function hide() {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
            active = -1;
        }
        function cancel() {
            clearTimeout(timer);
            controller?.abort();
            input.removeAttribute('aria-busy');
            hide();
        }
        function highlight(index) {
            active = index;
            Array.from(list.children).forEach((item, i) => item.setAttribute('aria-selected', String(i === active)));
            input.setAttribute('aria-activedescendant', `place-${active}`);
            list.children[active]?.scrollIntoView({ block: 'nearest' });
        }
        function select(index) {
            if (results[index]) window.location.assign(placeURL(results[index]));
        }
        async function search() {
            clearTimeout(timer);
            controller?.abort();
            const query = input.value.trim();
            if (query.length < 2) {
                results = [];
                hide();
                status.textContent = query ? 'Gib mindestens zwei Zeichen ein.' : '';
                return;
            }
            controller = new AbortController();
            const current = controller;
            results = [];
            hide();
            input.setAttribute('aria-busy', 'true');
            status.textContent = 'Wir suchen deinen Ort …';
            try {
                const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
                url.search = new URLSearchParams({ name: query, count: '6', language: 'de', format: 'json' });
                const data = await requestJSON(url, current.signal);
                if (current.signal.aborted || input.value.trim() !== query) return;
                results = Array.isArray(data.results) ? data.results.filter(validPlace) : [];
                lastQuery = query;
                list.replaceChildren();
                results.forEach((place, index) => {
                    const item = document.createElement('li');
                    item.className = 'search-result';
                    item.id = `place-${index}`;
                    item.setAttribute('role', 'option');
                    item.setAttribute('aria-selected', 'false');
                    const text = document.createElement('span');
                    const name = document.createElement('span');
                    name.className = 'result-name';
                    name.textContent = place.name;
                    const region = document.createElement('span');
                    region.className = 'result-region';
                    region.textContent = [place.admin1, place.country].filter(Boolean).join(', ');
                    text.append(name, region);
                    const arrow = document.createElement('span');
                    arrow.className = 'result-arrow';
                    arrow.setAttribute('aria-hidden', 'true');
                    arrow.textContent = '↗';
                    item.append(text, arrow);
                    item.addEventListener('click', () => select(index));
                    list.append(item);
                });
                list.hidden = results.length === 0;
                positionResults();
                input.setAttribute('aria-expanded', String(results.length > 0));
                status.textContent = results.length ? `${results.length} Orte gefunden. Wähle deinen Ort.`
                    : 'Kein Ort gefunden. Versuche einen anderen Namen.';
            } catch (error) {
                if (error.name !== 'AbortError' && !current.signal.aborted) status.textContent = error.message;
            } finally {
                if (controller === current) input.removeAttribute('aria-busy');
            }
        }
        input.addEventListener('input', (event) => {
            cancel();
            results = [];
            status.textContent = '';
            if (event.isComposing) return;
            if (input.value.trim().length < 2) return;
            timer = setTimeout(search, 280);
        });
        input.addEventListener('compositionend', () => { clearTimeout(timer); timer = setTimeout(search, 280); });
        input.addEventListener('keydown', (event) => {
            if (event.isComposing) return;
            if (event.key === 'Escape') { cancel(); status.textContent = ''; }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (!results.length) return;
                event.preventDefault();
                list.hidden = false;
                positionResults();
                input.setAttribute('aria-expanded', 'true');
                highlight(event.key === 'ArrowDown' ? (active + 1) % results.length
                    : (active <= 0 ? results.length - 1 : active - 1));
            }
        });
        area.querySelector('form').addEventListener('submit', (event) => {
            event.preventDefault();
            if (!list.hidden && results.length && lastQuery === input.value.trim()) select(active >= 0 ? active : 0);
            else search();
        });
        document.addEventListener('pointerdown', (event) => { if (!area.contains(event.target)) cancel(); });
        document.addEventListener('focusin', (event) => { if (!area.contains(event.target)) cancel(); });
        window.addEventListener('resize', positionResults, { passive: true });
        window.addEventListener('scroll', positionResults, { passive: true });
        window.visualViewport?.addEventListener('resize', positionResults, { passive: true });
        window.visualViewport?.addEventListener('scroll', positionResults, { passive: true });
    }

    function setupHome() {
        const date = new Date();
        $('today-date').dateTime = date.toISOString().slice(0, 10);
        $('today-date').textContent = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
        setupSearch();
        const recent = recentPlaces();
        if (recent.length) {
            $('recent-places').hidden = false;
            recent.forEach((place) => {
                const link = document.createElement('a');
                link.href = placeURL(place);
                link.textContent = `${place.name} ↗`;
                $('recent-links').append(link);
            });
        }
        const button = $('use-location');
        const status = $('search-status');
        button.addEventListener('click', () => {
            if (!navigator.geolocation) { status.textContent = 'Dein Browser unterstützt die Standortabfrage nicht. Suche stattdessen einen Ort.'; return; }
            button.disabled = true;
            status.textContent = 'Dein Standort wird ermittelt …';
            navigator.geolocation.getCurrentPosition((position) => {
                window.location.assign(placeURL({ latitude: position.coords.latitude, longitude: position.coords.longitude, name: 'Dein Standort' }));
            }, (error) => {
                button.disabled = false;
                status.textContent = error.code === 1 ? 'Standortzugriff nicht erlaubt. Du kannst deinen Ort einfach oben suchen.'
                    : 'Dein Standort konnte nicht ermittelt werden. Suche deinen Ort oben.';
            }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
        });
    }

    const conditions = {
        0: ['Klarer Himmel', 'sun'], 1: ['Überwiegend klar', 'partly'], 2: ['Leicht bewölkt', 'partly'], 3: ['Bedeckt', 'cloud'],
        45: ['Nebel', 'fog'], 48: ['Gefrierender Nebel', 'fog'],
        51: ['Leichter Nieselregen', 'rain'], 53: ['Nieselregen', 'rain'], 55: ['Starker Nieselregen', 'rain'],
        56: ['Gefrierender Nieselregen', 'rain'], 57: ['Starker gefrierender Nieselregen', 'rain'],
        61: ['Leichter Regen', 'rain'], 63: ['Regen', 'rain'], 65: ['Starker Regen', 'rain'],
        66: ['Gefrierender Regen', 'rain'], 67: ['Starker gefrierender Regen', 'rain'],
        71: ['Leichter Schneefall', 'snow'], 73: ['Schneefall', 'snow'], 75: ['Starker Schneefall', 'snow'], 77: ['Schneegriesel', 'snow'],
        80: ['Leichte Regenschauer', 'rain'], 81: ['Regenschauer', 'rain'], 82: ['Starke Regenschauer', 'rain'],
        85: ['Leichte Schneeschauer', 'snow'], 86: ['Starke Schneeschauer', 'snow'],
        95: ['Gewitter', 'storm'], 96: ['Gewitter mit Hagel', 'storm'], 99: ['Starkes Gewitter mit Hagel', 'storm']
    };
    const condition = (code, isDay = true) => code === 0 && !isDay ? 'Klare Nacht' : (conditions[code]?.[0] ?? 'Wetterlage unbekannt');
    const sun = '<circle cx="32" cy="32" r="12"/><g class="sun-rays"><path d="M32 5v7m0 40v7M5 32h7m40 0h7M13 13l5 5m28 28 5 5M13 51l5-5m28-28 5-5"/></g>';
    const moon = '<path d="M44 43A20 20 0 0 1 23 12a20 20 0 1 0 21 31Z"/>';
    const cloud = '<g class="cloud-shape"><path d="M17 42h30a10 10 0 0 0 0-20 15 15 0 0 0-29-1A10.5 10.5 0 0 0 17 42Z"/></g>';
    function icon(code, isDay = true) {
        const kind = conditions[code]?.[1] ?? 'unknown';
        let content;
        if (kind === 'sun') content = isDay ? sun : moon;
        else if (kind === 'partly') content = '<g transform="translate(10,-7) scale(.7)">' + (isDay ? sun : moon) + '</g>' + cloud;
        else if (kind === 'cloud') content = cloud;
        else if (kind === 'rain') content = cloud + '<path d="m22 48-3 7m15-7-3 7m15-7-3 7"/>';
        else if (kind === 'snow') content = cloud + '<path d="M23 48v9m-4.5-6.7 9 4.4m-9 0 9-4.4M42 48v9m-4.5-6.7 9 4.4m-9 0 9-4.4"/>';
        else if (kind === 'storm') content = cloud + '<path d="m34 43-9 10h9l-6 9"/>';
        else if (kind === 'fog') content = '<path d="M9 23h46M15 32h34M7 41h50M18 50h28"/>';
        else content = '<circle cx="32" cy="32" r="18"/><path d="M26 26a6 6 0 1 1 9 5c-3 1-3 3-3 5M32 42v1"/>';
        return `<svg class="weather-symbol" viewBox="0 0 64 64" aria-hidden="true">${content}</svg>`;
    }
    const droplet = '<svg class="weather-symbol" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2c-1 2-4 5-4 8a4 4 0 0 0 8 0c0-3-3-6-4-8Z"/></svg>';
    const timePart = (value) => typeof value === 'string' && /T\d{2}:\d{2}/.test(value) ? value.split('T')[1].slice(0, 5) : '—';
    const dateLabel = (value, options) => new Intl.DateTimeFormat('de-DE', { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
    const measure = (value, suffix) => isNumber(value) ? `${number.format(value)}${suffix}` : '—';
    function applyWeatherAppearance(current) {
        const root = document.documentElement;
        root.dataset.weather = conditions[current.weather_code]?.[1] || 'unknown';
        root.dataset.daylight = current.is_day === 0 ? 'night' : 'day';
        const wind = isNumber(current.wind_speed_10m) ? current.wind_speed_10m : 0;
        root.style.setProperty('--weather-duration', `${Math.max(7, 16 - Math.max(0, wind) / 6)}s`);
        syncThemeColor();
    }
    let unit = storage.get('jweather.unit', 'celsius') === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    let weather;
    let place;
    let selectedDay;
    const temperature = (value) => isNumber(value) ? `${Math.round(unit === 'fahrenheit' ? value * 9 / 5 + 32 : value)}°` : '—';
    const temperatureWithUnit = (value) => isNumber(value) ? `${temperature(value)}${unit === 'fahrenheit' ? 'F' : 'C'}` : '—';

    function readPlace() {
        const params = new URLSearchParams(window.location.search);
        const lat = params.get('lat');
        const lon = params.get('lon');
        if (!lat?.trim() || !lon?.trim()) return null;
        const candidate = { latitude: Number(lat), longitude: Number(lon), name: tidy(params.get('name')) || 'Dein Ort',
            country: tidy(params.get('country')), admin1: tidy(params.get('region')) };
        return validPlace(candidate) ? candidate : null;
    }
    function validateWeather(data) {
        const current = data?.current;
        const daily = data?.daily;
        const hourly = data?.hourly;
        const dayKeys = ['weather_code', 'temperature_2m_max', 'temperature_2m_min'];
        if (!current || !isNumber(current.temperature_2m) || !isNumber(current.weather_code)
            || typeof current.time !== 'string' || !Array.isArray(daily?.time) || daily.time.length < 6
            || !daily.time.slice(0, 6).every((time) => /^\d{4}-\d{2}-\d{2}$/.test(time))
            || dayKeys.some((key) => !Array.isArray(daily[key]) || !daily[key].slice(0, 6).every(isNumber) || daily[key].length < 6)
            || !Array.isArray(hourly?.time) || !hourly.time.length || !Array.isArray(hourly.temperature_2m)
            || !Array.isArray(hourly.weather_code)) {
            throw new Error('Die Wetterdaten sind gerade unvollständig. Bitte lade sie erneut.');
        }
        return data;
    }
    function updateClock() {
        let zone = weather.timezone || 'UTC';
        try { new Intl.DateTimeFormat('de-DE', { timeZone: zone }); } catch { zone = 'UTC'; }
        const now = new Date();
        $('local-date').textContent = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(now);
        $('local-time').textContent = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(now) + ' Ortszeit';
    }
    function isDayAt(time) {
        const index = weather.daily.time.indexOf(time.slice(0, 10));
        const rise = weather.daily.sunrise?.[index];
        const set = weather.daily.sunset?.[index];
        return rise && set ? time >= rise && time < set : true;
    }
    function renderHourly() {
        const hourly = weather.hourly;
        const currentHour = weather.current.time.slice(0, 13) + ':00';
        const start = hourly.time.findIndex((time) => time >= currentHour);
        const list = $('hourly-list');
        const scroll = list.scrollLeft;
        list.replaceChildren();
        if (start < 0) {
            const note = document.createElement('p');
            note.textContent = 'Die stündliche Vorhersage ist gerade nicht verfügbar.';
            list.append(note);
            return;
        }
        for (let index = start; index < Math.min(start + 8, hourly.time.length); index++) {
            const item = document.createElement('div');
            item.className = 'hour-item';
            const time = document.createElement('span');
            time.className = 'hour-time';
            time.textContent = index === start && hourly.time[index] === currentHour ? 'Jetzt' : timePart(hourly.time[index]);
            const symbol = document.createElement('span');
            symbol.innerHTML = icon(hourly.weather_code[index], isDayAt(hourly.time[index]));
            const accessible = document.createElement('span');
            accessible.className = 'sr-only';
            accessible.textContent = condition(hourly.weather_code[index], isDayAt(hourly.time[index]));
            const temp = document.createElement('span');
            temp.className = 'hour-temp';
            temp.textContent = temperature(hourly.temperature_2m[index]);
            const rain = document.createElement('span');
            rain.className = 'hour-rain';
            rain.innerHTML = droplet;
            const chance = document.createElement('span');
            chance.textContent = measure(hourly.precipitation_probability?.[index], '%');
            rain.setAttribute('aria-label', 'Regenwahrscheinlichkeit ' + chance.textContent);
            rain.append(chance);
            item.append(time, symbol, accessible, temp, rain);
            list.append(item);
        }
        list.scrollLeft = scroll;
    }
    function renderForecast() {
        const daily = weather.daily;
        const list = $('forecast');
        list.replaceChildren();
        for (let index = 1; index < 6; index++) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'forecast-item';
            const day = document.createElement('span');
            day.className = 'forecast-day';
            day.textContent = index === 1 ? 'Morgen' : dateLabel(daily.time[index], { weekday: 'long' });
            const date = document.createElement('span');
            date.className = 'forecast-date';
            date.textContent = dateLabel(daily.time[index], { day: '2-digit', month: 'short' });
            const temps = document.createElement('span');
            temps.className = 'forecast-temp';
            const high = document.createElement('span');
            high.textContent = temperature(daily.temperature_2m_max[index]);
            const low = document.createElement('span');
            low.className = 'forecast-low';
            low.textContent = temperature(daily.temperature_2m_min[index]);
            temps.append(high, low);
            const bottom = document.createElement('span');
            bottom.className = 'forecast-bottom';
            const chance = document.createElement('span');
            chance.textContent = measure(daily.precipitation_probability_max?.[index], '%');
            chance.setAttribute('aria-label', 'Regenwahrscheinlichkeit ' + chance.textContent);
            const rainLabel = document.createElement('span');
            rainLabel.className = 'forecast-rain-label';
            rainLabel.textContent = ' Regen';
            chance.append(rainLabel);
            const arrow = document.createElement('span');
            arrow.textContent = '↗';
            arrow.setAttribute('aria-hidden', 'true');
            bottom.append(chance, arrow);
            item.append(day, date);
            item.insertAdjacentHTML('beforeend', icon(daily.weather_code[index]));
            item.append(temps, bottom);
            item.setAttribute('aria-label', `${dateLabel(daily.time[index], { weekday: 'long', day: 'numeric', month: 'long' })}: ${condition(daily.weather_code[index])}, maximal ${temperatureWithUnit(daily.temperature_2m_max[index])}, minimal ${temperatureWithUnit(daily.temperature_2m_min[index])}. Details öffnen.`);
            item.addEventListener('click', () => showDayDetails(index));
            list.append(item);
        }
    }
    function showDayDetails(index) {
        selectedDay = index;
        const daily = weather.daily;
        $('modal-date').textContent = dateLabel(daily.time[index], { weekday: 'long' }) + ', ' + dateLabel(daily.time[index], { day: 'numeric', month: 'long' });
        $('modal-description').textContent = condition(daily.weather_code[index]);
        $('modal-icon').innerHTML = icon(daily.weather_code[index]);
        $('modal-temperature').replaceChildren();
        $('modal-temperature').append(document.createTextNode(temperature(daily.temperature_2m_max[index])));
        const low = document.createElement('span');
        low.textContent = temperature(daily.temperature_2m_min[index]);
        $('modal-temperature').append(low);
        const details = [
            ['Regenwahrscheinlichkeit', measure(daily.precipitation_probability_max?.[index], ' %')],
            ['Niederschlag', measure(daily.precipitation_sum?.[index], ' mm')],
            ['Maximaler Wind', measure(daily.wind_speed_10m_max?.[index], ' km/h')],
            ['UV-Index', measure(daily.uv_index_max?.[index], '')],
            ['Sonnenaufgang', timePart(daily.sunrise?.[index])],
            ['Sonnenuntergang', timePart(daily.sunset?.[index])]
        ];
        $('modal-details').replaceChildren();
        details.forEach(([label, value]) => {
            const row = document.createElement('div');
            const term = document.createElement('dt');
            const definition = document.createElement('dd');
            term.textContent = label;
            definition.textContent = value;
            row.append(term, definition);
            $('modal-details').append(row);
        });
        if (!$('day-details').open) $('day-details').showModal();
    }
    function renderWeather() {
        const current = weather.current;
        const daily = weather.daily;
        applyWeatherAppearance(current);
        $('location-name').textContent = place.name;
        $('location-region').textContent = [...new Set([place.admin1, place.country].filter(Boolean))].join(' · ') || 'Dein Wetter vor Ort';
        document.title = `${place.name} — Jweather`;
        $('temperature').textContent = temperature(current.temperature_2m);
        $('temperature').setAttribute('aria-label', temperatureWithUnit(current.temperature_2m));
        $('description').textContent = condition(current.weather_code, current.is_day !== 0);
        $('current-icon').innerHTML = icon(current.weather_code, current.is_day !== 0);
        $('current-range').textContent = `↑ ${temperature(daily.temperature_2m_max[0])}  ↓ ${temperature(daily.temperature_2m_min[0])}`;
        $('current-range').setAttribute('aria-label', `Heute maximal ${temperatureWithUnit(daily.temperature_2m_max[0])}, minimal ${temperatureWithUnit(daily.temperature_2m_min[0])}`);
        $('feels-like').textContent = temperatureWithUnit(current.apparent_temperature);
        $('humidity').textContent = measure(current.relative_humidity_2m, ' %');
        $('wind-speed').textContent = measure(current.wind_speed_10m, ' km/h');
        const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
        $('wind-direction').textContent = isNumber(current.wind_direction_10m) ? directions[Math.round(current.wind_direction_10m / 45) % 8] : '';
        $('rain-chance').textContent = measure(daily.precipitation_probability_max?.[0], ' %');
        $('sunrise').textContent = timePart(daily.sunrise?.[0]);
        $('sunset').textContent = timePart(daily.sunset?.[0]);
        $('updated-at').textContent = `Stand ${timePart(current.time)} Uhr`;
        const kind = conditions[current.weather_code]?.[1];
        $('weather-summary').textContent = kind === 'sun' ? (current.is_day === 0 ? 'Ein ruhiger Himmel für die Nacht.' : 'Ein wenig Sonne für deinen Tag.')
            : kind === 'rain' ? 'Vielleicht kommt der Schirm heute mit.'
            : kind === 'snow' ? 'Ein Tag für die warme Jacke.'
            : kind === 'storm' ? 'Behalte den Himmel im Blick.'
            : 'Jeder Himmel hat seine schönen Seiten.';
        updateClock();
        renderHourly();
        renderForecast();
        if ($('day-details').open && selectedDay !== undefined) showDayDetails(selectedDay);
    }
    function syncUnits() {
        document.querySelectorAll('[data-unit]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.unit === unit)));
    }
    function setLoadState(state, message) {
        const failed = state === 'error';
        $('load-state').hidden = false;
        $('weather-content').hidden = true;
        $('main').setAttribute('aria-busy', String(!failed));
        $('loading-orbit').hidden = failed;
        $('load-label').textContent = failed ? 'Kurz bewölkt' : 'Ein Blick nach draußen';
        $('load-title').textContent = failed ? 'Gerade keine Aussicht.' : 'Das Wetter kommt.';
        $('load-message').textContent = message || 'Wir holen die aktuelle Vorhersage für deinen Ort.';
        $('load-actions').hidden = !failed;
        $('retry-weather').hidden = !place;
    }
    async function loadWeather() {
        if (!place) {
            setLoadState('error', 'Diesem Link fehlt ein gültiger Ort. Suche einfach einen Ort auf der Startseite.');
            return;
        }
        setLoadState('loading');
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.search = new URLSearchParams({
            latitude: String(place.latitude), longitude: String(place.longitude), timezone: 'auto', forecast_days: '6',
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m',
            hourly: 'temperature_2m,weather_code,precipitation_probability',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max',
            temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
        });
        try {
            weather = validateWeather(await requestJSON(url));
            renderWeather();
            rememberPlace(place);
            $('load-state').hidden = true;
            $('weather-content').hidden = false;
            $('main').setAttribute('aria-busy', 'false');
        } catch (error) { setLoadState('error', error.message); }
    }
    function setupWeather() {
        place = readPlace();
        syncUnits();
        document.querySelectorAll('[data-unit]').forEach((button) => button.addEventListener('click', () => {
            if (unit === button.dataset.unit) return;
            unit = button.dataset.unit;
            storage.set('jweather.unit', unit);
            syncUnits();
            if (weather) renderWeather();
        }));
        const dialog = $('day-details');
        dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (event) => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
        });
        $('retry-weather').addEventListener('click', loadWeather);
        setInterval(() => { if (weather && !document.hidden) updateClock(); }, 60000);
        document.addEventListener('visibilitychange', () => { if (weather && !document.hidden) updateClock(); });
        loadWeather();
    }
    setupAppearance();
    if (document.body.dataset.page === 'home') setupHome();
    if (document.body.dataset.page === 'weather') setupWeather();
})();
