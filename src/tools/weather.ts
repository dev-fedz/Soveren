import { Tool, ToolResult } from './registry.js';

const WEATHER_CODE_MAP: Record<number, string> = {
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
  99: 'Thunderstorm with heavy hail',
};

export class WeatherTool implements Tool {
  name = 'fetch_web_data_weather';
  description = 'Fetch real-time weather data for a specific location using Open-Meteo. Use this for accurate temperature, wind, and conditions.';
  inputSchema = {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'The location name or city (e.g., "Eastwood, Quezon City", "Manila", "Tokyo").' },
      query_param: { type: 'string', description: 'Alternative alias for location.' },
    },
    required: ['location']
  };

  async execute(input: any): Promise<ToolResult> {
    try {
      let rawLocation = '';
      if (typeof input === 'string') {
        rawLocation = input;
      } else if (input && typeof input === 'object') {
        rawLocation = input.location || input.city || input.query_param || input.query || input.q || input.place || input.address || input.name || Object.values(input)[0] || '';
      }

      if (!rawLocation || typeof rawLocation !== 'string' || !rawLocation.trim()) {
        return {
          success: false,
          content: '',
          error: 'No location provided. Please specify a location name or city.'
        };
      }

      const cleanQuery = rawLocation
        .replace(/^(what is the weather (today )?(in|at|here in|for)?|weather in|weather for|weather)\s+/i, '')
        .trim();

      const geoResult = await this.geocodeLocation(cleanQuery);

      if (!geoResult) {
        return {
          success: false,
          content: '',
          error: `Could not find coordinates for location: ${rawLocation}`
        };
      }

      const { lat, lon, resolvedName } = geoResult;

      // Fetch actual weather
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const weatherResponse = await fetch(weatherUrl);
      if (!weatherResponse.ok) throw new Error(`Weather API error: ${weatherResponse.statusText}`);

      const wData = await weatherResponse.json();
      const current = wData.current_weather;
      const condition = WEATHER_CODE_MAP[current.weathercode] || `Code ${current.weathercode}`;
      const fahrenheit = Math.round((current.temperature * 9) / 5 + 32);

      return {
        success: true,
        content: `Real-time Weather for ${resolvedName}:\n- Condition: ${condition}\n- Temperature: ${current.temperature}°C (${fahrenheit}°F)\n- Wind Speed: ${current.windspeed} km/h\n- Wind Direction: ${current.winddirection}°\n- Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`
      };
    } catch (error: any) {
      return {
        success: false,
        content: '',
        error: error.message || 'Unknown error fetching weather data'
      };
    }
  }

  private async geocodeLocation(query: string): Promise<{ lat: number; lon: number; resolvedName: string } | null> {
    // 1. Try Nominatim (OpenStreetMap) - handles districts, barangays, malls, compounds, cities
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
      const nomRes = await fetch(nomUrl, {
        headers: { 'User-Agent': 'PlannerAgent/1.0 (weather-tool)' }
      });
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (nomData && nomData.length > 0) {
          return {
            lat: parseFloat(nomData[0].lat),
            lon: parseFloat(nomData[0].lon),
            resolvedName: nomData[0].display_name
          };
        }
      }
    } catch (e) {
      // Ignore and fallback to Open-Meteo
    }

    // 2. Open-Meteo Geocoding candidates
    const candidates = [
      query,
      ...query.split(',').map(s => s.trim()),
      query.replace(/,\s*/g, ' ')
    ].filter(Boolean);

    for (const cand of candidates) {
      try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cand)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoUrl);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            const r = geoData.results[0];
            const nameParts = [r.name, r.admin1, r.country].filter(Boolean);
            return {
              lat: r.latitude,
              lon: r.longitude,
              resolvedName: nameParts.join(', ')
            };
          }
        }
      } catch (e) {
        // Ignore and try next candidate
      }
    }

    return null;
  }
}
