"""Real-time weather service with resilient caching and fallback behavior."""

import asyncio
import random
import time
from typing import Dict, Optional

import httpx

from services.cache_service import get_cache
from services.reliability import CircuitBreaker, with_retry

# WMO Weather Code descriptions
WMO_CODES = {
    0: ("Clear sky", "☀️", "low"),
    1: ("Mainly clear", "🌤️", "low"),
    2: ("Partly cloudy", "⛅", "low"),
    3: ("Overcast", "☁️", "low"),
    45: ("Foggy", "🌫️", "moderate"),
    48: ("Icy fog", "🌫️", "high"),
    51: ("Light drizzle", "🌦️", "low"),
    53: ("Moderate drizzle", "🌦️", "moderate"),
    55: ("Dense drizzle", "🌧️", "moderate"),
    61: ("Slight rain", "🌧️", "low"),
    63: ("Moderate rain", "🌧️", "moderate"),
    65: ("Heavy rain", "🌧️", "high"),
    71: ("Slight snow", "🌨️", "moderate"),
    73: ("Moderate snow", "🌨️", "high"),
    75: ("Heavy snow", "❄️", "high"),
    77: ("Snow grains", "❄️", "moderate"),
    80: ("Slight showers", "🌦️", "low"),
    81: ("Moderate showers", "🌧️", "moderate"),
    82: ("Violent showers", "⛈️", "high"),
    85: ("Snow showers", "🌨️", "high"),
    86: ("Heavy snow showers", "❄️", "high"),
    95: ("Thunderstorm", "⛈️", "high"),
    96: ("Thunderstorm w/ hail", "⛈️", "high"),
    99: ("Thunderstorm w/ heavy hail", "⛈️", "high"),
}

CITIES = [
    {"name": "Shanghai", "lat": 31.2304, "lng": 121.4737},
    {"name": "Singapore", "lat": 1.3521, "lng": 103.8198},
    {"name": "Rotterdam", "lat": 51.9225, "lng": 4.4792},
    {"name": "Los Angeles", "lat": 34.0522, "lng": -118.2437},
    {"name": "Dubai", "lat": 25.2048, "lng": 55.2708},
    {"name": "Hamburg", "lat": 53.5753, "lng": 10.0153},
    {"name": "New York", "lat": 40.7128, "lng": -74.0060},
    {"name": "Tokyo", "lat": 35.6762, "lng": 139.6503},
    {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777},
    {"name": "Sydney", "lat": -33.8688, "lng": 151.2093},
    {"name": "São Paulo", "lat": -23.5505, "lng": -46.6333},
    {"name": "London", "lat": 51.5074, "lng": -0.1278},
    {"name": "Chicago", "lat": 41.8781, "lng": -87.6298},
    {"name": "Hong Kong", "lat": 22.3193, "lng": 114.1694},
    {"name": "Frankfurt", "lat": 50.1109, "lng": 8.6821},
    {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946},
    {"name": "Toronto", "lat": 43.6532, "lng": -79.3832},
    {"name": "Cape Town", "lat": -33.9249, "lng": 18.4241},
]

# In-memory cache: city_name -> weather dict
_cache: Dict[str, dict] = {}
_last_fetch: float = 0
CACHE_TTL = 600  # refresh every 10 minutes
WEATHER_CACHE_KEY = "weather:all"
_breaker = CircuitBreaker()


def _weather_risk_score(temp: float, wind: float, precip: float, wmo: int) -> int:
    """Return a 0-100 weather risk score."""
    score = 0
    # Wind risk
    if wind > 60: score += 40
    elif wind > 40: score += 25
    elif wind > 25: score += 10
    # Precipitation risk
    if precip > 10: score += 30
    elif precip > 3: score += 15
    elif precip > 0: score += 5
    # Temperature extremes
    if temp > 42 or temp < -15: score += 20
    elif temp > 38 or temp < -5: score += 10
    # WMO code severity
    _, _, severity = WMO_CODES.get(wmo, ("Unknown", "❓", "low"))
    if severity == "high": score += 25
    elif severity == "moderate": score += 10
    return min(score, 100)


def _fallback_city_weather(city: dict) -> dict:
    """Provide deterministic fallback weather when network fetches are unavailable."""
    seed = int((city["lat"] + 90) * 1000 + (city["lng"] + 180) * 1000)
    rng = random.Random(seed)
    fallback_codes = [0, 2, 3, 45, 61, 63, 80, 81, 95]
    wmo = rng.choice(fallback_codes)
    desc, icon, _ = WMO_CODES.get(wmo, ("Unknown", "❓", "low"))
    temp = round(rng.uniform(8, 34), 1)
    wind = round(rng.uniform(4, 48), 1)
    precip = round(rng.uniform(0, 9), 1)
    humidity = round(rng.uniform(35, 92), 0)
    risk = _weather_risk_score(temp, wind, precip, wmo)
    return {
        "city": city["name"],
        "lat": city["lat"],
        "lng": city["lng"],
        "temp": temp,
        "wind": wind,
        "precip": precip,
        "humidity": humidity,
        "wmo": wmo,
        "description": f"{desc} (fallback)",
        "icon": icon,
        "risk_score": risk,
        "risk_level": "High" if risk >= 50 else ("Moderate" if risk >= 20 else "Low"),
        "fetched_at": int(time.time()),
        "source": "fallback",
    }


async def _fetch_city(client: httpx.AsyncClient, city: dict) -> Optional[dict]:
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={city['lat']}&longitude={city['lng']}"
            f"&current=temperature_2m,weather_code,wind_speed_10m,precipitation,relative_humidity_2m"
            f"&timezone=auto&forecast_days=1"
        )
        r = await client.get(url, timeout=8.0)
        r.raise_for_status()
        data = r.json()
        c = data["current"]
        wmo = int(c.get("weather_code", 0))
        desc, icon, _ = WMO_CODES.get(wmo, ("Unknown", "❓", "low"))
        temp = round(c.get("temperature_2m", 20), 1)
        wind = round(c.get("wind_speed_10m", 0), 1)
        precip = round(c.get("precipitation", 0), 1)
        humidity = round(c.get("relative_humidity_2m", 50), 0)
        risk = _weather_risk_score(temp, wind, precip, wmo)
        return {
            "city": city["name"],
            "lat": city["lat"],
            "lng": city["lng"],
            "temp": temp,
            "wind": wind,
            "precip": precip,
            "humidity": humidity,
            "wmo": wmo,
            "description": desc,
            "icon": icon,
            "risk_score": risk,
            "risk_level": "High" if risk >= 50 else ("Moderate" if risk >= 20 else "Low"),
            "fetched_at": int(time.time()),
        }
    except Exception:
        return None


async def refresh_weather():
    """Fetch weather for all cities concurrently and update cache."""
    global _last_fetch

    cached = get_cache().get(WEATHER_CACHE_KEY)
    if cached and not is_stale():
        _cache.clear()
        _cache.update(cached)
        return

    async def operation():
        async with httpx.AsyncClient() as client:
            return await asyncio.gather(*[_fetch_city(client, c) for c in CITIES])

    try:
        results = await with_retry(operation, retries=2, timeout_seconds=12.0, breaker=_breaker)
    except Exception:
        results = [None for _ in CITIES]

    for city, result in zip(CITIES, results):
        _cache[city["name"]] = result or _fallback_city_weather(city)
    _last_fetch = time.time()
    get_cache().set(WEATHER_CACHE_KEY, dict(_cache), CACHE_TTL)


def get_all_weather() -> Dict[str, dict]:
    """Return cached weather data (may be up to 10 min old)."""
    return dict(_cache)


def get_city_weather(city_name: str) -> Optional[dict]:
    return _cache.get(city_name)


def is_stale() -> bool:
    return (time.time() - _last_fetch) > CACHE_TTL


def get_weather_summary_for_llm() -> str:
    """Build a compact weather context string for the Sidekick LLM."""
    if not _cache:
        return "Weather data not yet loaded."
    lines = []
    for city, w in sorted(_cache.items()):
        risk_tag = f" ⚠️ RISK {w['risk_score']}" if w["risk_score"] >= 20 else ""
        lines.append(
            f"{w['icon']} {city}: {w['temp']}°C, wind {w['wind']} km/h, "
            f"precip {w['precip']} mm — {w['description']}{risk_tag}"
        )
    high_risk = [c for c, w in _cache.items() if w["risk_score"] >= 50]
    summary = f"REAL-TIME WEATHER ({len(_cache)} cities):\n" + "\n".join(lines)
    if high_risk:
        summary += f"\n\n⚠️ HIGH WEATHER RISK CITIES: {', '.join(high_risk)}"
    return summary
