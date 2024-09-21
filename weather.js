const params = new URLSearchParams(window.location.search);
const lat = params.get('lat');
const lon = params.get('lon');
const locationName = params.get('name');

document.getElementById('location').textContent = decodeURIComponent(locationName);

async function getWeatherData() {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m&timezone=auto`);
    const data = await response.json();
    return data;
}

function getWeatherIcon(weatherCode) {
    const icons = {
        0: '☀️',
        1: '🌤️',
        2: '⛅',
        3: '☁️',
        45: '🌫️',
        48: '🌫️',
        51: '🌦️',
        53: '🌦️',
        55: '🌧️',
        56: '🌧️',
        57: '🌧️',
        61: '🌧️',
        63: '🌧️',
        65: '🌧️',
        66: '🌧️',
        67: '🌧️',
        71: '🌨️',
        73: '🌨️',
        75: '🌨️',
        77: '🌨️',
        80: '🌧️',
        81: '🌧️',
        82: '🌧️',
        85: '🌨️',
        86: '🌨️',
        95: '🌩️',
        96: '🌩️',
        99: '🌩️'
    };
    return icons[weatherCode] || '❓';
}

function setTheme(weatherCode) {
    const root = document.documentElement;

    if (weatherCode <= 3) {
        // Sunny
        root.style.setProperty('--bg-color', '#121212');
        root.style.setProperty('--container-bg', '#1e1e1e');
        root.style.setProperty('--highlight-color', '#2c2c2c');
        root.style.setProperty('--accent-color', '#ffd700');
    } else if (weatherCode >= 51 && weatherCode <= 67) {
        // Rainy
        root.style.setProperty('--bg-color', '#1a1a1a');
        root.style.setProperty('--container-bg', '#262626');
        root.style.setProperty('--highlight-color', '#333333');
        root.style.setProperty('--accent-color', '#4fc3f7');
        addRaindrops();
    } else if (weatherCode >= 71 && weatherCode <= 77) {
        // Snowy
        root.style.setProperty('--bg-color', '#121212');
        root.style.setProperty('--container-bg', '#1e1e1e');
        root.style.setProperty('--highlight-color', '#2c2c2c');
        root.style.setProperty('--accent-color', '#e0e0e0');
    } else {
        // Default
        root.style.setProperty('--bg-color', '#121212');
        root.style.setProperty('--container-bg', '#1e1e1e');
        root.style.setProperty('--highlight-color', '#2c2c2c');
        root.style.setProperty('--accent-color', '#bb86fc');
    }
}

function addRaindrops() {
    const rainContainer = document.createElement('div');
    rainContainer.className = 'rain-container';
    document.body.appendChild(rainContainer);

    for (let i = 0; i < 50; i++) {
        const raindrop = document.createElement('div');
        raindrop.className = 'raindrop';
        raindrop.style.left = `${Math.random() * 100}%`;
        raindrop.style.animationDuration = `${Math.random() * 1 + 0.5}s`;
        raindrop.style.animationDelay = `${Math.random() * 2}s`;
        rainContainer.appendChild(raindrop);
    }
}

async function displayWeather() {
    try {
        const data = await getWeatherData();
        const currentWeather = data.current_weather;
        const dailyForecast = data.daily;
        const hourlyForecast = data.hourly;

        document.getElementById('temperature').textContent = `${currentWeather.temperature}°C`;
        document.getElementById('description').textContent = getWeatherDescription(currentWeather.weathercode);
        document.getElementById('icon').textContent = getWeatherIcon(currentWeather.weathercode);

        // Display additional current weather details
        document.getElementById('feels-like').textContent = `${currentWeather.temperature}°C`;
        document.getElementById('humidity').textContent = `${hourlyForecast.relativehumidity_2m[0]}%`;
        document.getElementById('wind-speed').textContent = `${currentWeather.windspeed} km/h`;

        setTheme(currentWeather.weathercode);

        const forecastContainer = document.getElementById('forecast');
        forecastContainer.innerHTML = ''; // Clear previous forecast data

        for (let i = 1; i < 6; i++) {
            const date = new Date(dailyForecast.time[i]);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const icon = getWeatherIcon(dailyForecast.weathercode[i]);
            const maxTemp = dailyForecast.temperature_2m_max[i];
            const minTemp = dailyForecast.temperature_2m_min[i];

            const forecastItem = document.createElement('div');
            forecastItem.className = 'forecast-item';
            forecastItem.innerHTML = `
                <div class="date">${dayName}</div>
                <div class="icon">${icon}</div>
                <div class="temp">${maxTemp}°C / ${minTemp}°C</div>
            `;
            forecastItem.addEventListener('click', () => showDayDetails(i, dailyForecast, date));
            forecastContainer.appendChild(forecastItem);
        }
    } catch (error) {
        console.error('Error fetching weather data:', error);
        document.getElementById('current-weather').innerHTML = '<p>Error fetching weather data. Please try again later.</p>';
    }
}

function showDayDetails(index, forecast, date) {
    const modal = document.getElementById('day-details');
    const modalDate = document.getElementById('modal-date');
    const modalDetails = document.getElementById('modal-details');

    modalDate.textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const details = `
        <p><strong>Max Temperature:</strong> ${forecast.temperature_2m_max[index]}°C</p>
        <p><strong>Min Temperature:</strong> ${forecast.temperature_2m_min[index]}°C</p>
        <p><strong>Precipitation:</strong> ${forecast.precipitation_sum[index]} mm</p>
        <p><strong>Max Wind Speed:</strong> ${forecast.windspeed_10m_max[index]} km/h</p>
        <p><strong>Weather:</strong> ${getWeatherDescription(forecast.weathercode[index])}</p>
    `;

    modalDetails.innerHTML = details;
    modal.style.display = 'block';
}

function getWeatherDescription(weatherCode) {
    const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
    };
    return descriptions[weatherCode] || 'Unknown';
}

// Call displayWeather when the page loads
window.addEventListener('load', displayWeather);

// Close modal when clicking on the close button or outside the modal
window.addEventListener('click', (event) => {
    const modal = document.getElementById('day-details');
    if (event.target === modal || event.target.className === 'close') {
        modal.style.display = 'none';
    }
});