const params = new URLSearchParams(window.location.search);
const lat = params.get('lat');
const lon = params.get('lon');
const locationName = params.get('name');

document.getElementById('location').textContent = decodeURIComponent(locationName);

async function getWeatherData() {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&current_weather=true&timezone=auto`);
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
    const body = document.body;
    const container = document.querySelector('.container');

    if (weatherCode <= 3) {
        // Sunny
        body.style.backgroundColor = '#87CEEB';
        container.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    } else if (weatherCode >= 51 && weatherCode <= 67) {
        // Rainy
        body.style.backgroundColor = '#4682B4';
        container.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        addRaindrops();
    } else if (weatherCode >= 71 && weatherCode <= 77) {
        // Snowy
        body.style.backgroundColor = '#B0E0E6';
        container.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    } else {
        // Default
        body.style.backgroundColor = '#F0F8FF';
        container.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
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

        document.getElementById('temperature').textContent = `${currentWeather.temperature}°C`;
        document.getElementById('description').textContent = getWeatherDescription(currentWeather.weathercode);
        document.getElementById('icon').textContent = getWeatherIcon(currentWeather.weathercode);

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
            forecastContainer.appendChild(forecastItem);
        }
    } catch (error) {
        console.error('Error fetching weather data:', error);
        document.getElementById('current-weather').innerHTML = '<p>Error fetching weather data. Please try again later.</p>';
    }
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