from fastapi import APIRouter
from services.weather_service import (
    get_all_weather,
    get_city_weather,
    refresh_weather,
    is_stale
)
from services.weather_route_engine import generate_weather_advisories
import asyncio

router = APIRouter(prefix="/api/weather", tags=["weather"])

_shipments = []


def set_data(shipments):
    global _shipments
    _shipments = shipments


def get_current_weather_snapshot():
    return get_all_weather()


@router.get("")
async def all_weather():
    if is_stale():
        await refresh_weather()
    return {"cities": list(get_all_weather().values())}


@router.get("/route-advisories")
async def route_advisories():
    if is_stale():
        await refresh_weather()

    advisories = generate_weather_advisories(_shipments)

    return {
        "advisories": advisories,
        "total": len(advisories),
        "critical": sum(1 for a in advisories if a["severity"] == "Critical"),
        "high": sum(1 for a in advisories if a["severity"] == "High"),
    }


@router.get("/{city}")
async def city_weather(city: str):
    if is_stale():
        await refresh_weather()

    data = get_city_weather(city)

    if not data:
        return {"error": f"No weather data for {city}"}

    return data


@router.post("/refresh")
async def force_refresh():
    await refresh_weather()
    return {
        "status": "refreshed",
        "cities": len(get_all_weather())
    }
