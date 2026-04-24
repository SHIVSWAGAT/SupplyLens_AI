"""Weather advisory generation with shipment-specific messaging."""

import datetime
from typing import List, Dict
from services.weather_service import get_city_weather, get_all_weather

# Alternate route templates keyed by transport mode
ALT_ROUTE_TEMPLATES = {
    "Sea": [
        "Reroute via Cape of Good Hope to avoid storm corridor",
        "Divert to Port Klang then trans-ship to alternate vessel",
        "Hold at anchorage and depart post-weather window (est. +18h)",
    ],
    "Air": [
        "Reroute via alternate waypoint hub, add fuel stop",
        "Delay departure by 6h — weather window clears at 14:00 UTC",
        "Switch to ground freight for final leg, air to nearest clear hub",
    ],
    "Road": [
        "Use northern motorway bypass, avoid flooded lowland route",
        "Reroute via inland highway — adds 80 km but avoids ice risk",
        "Stage cargo at regional depot; resume when road conditions clear",
    ],
    "Rail": [
        "Switch to parallel freight line, +4h transit time",
        "Reroute via alternate rail corridor, avoiding affected junction",
        "Hold at marshalling yard; weather window opens in ~12h",
    ],
}

SEVERITY_MAP = {
    "High": {"level": "Critical", "color": "red", "action": "Reroute immediately"},
    "Moderate": {"level": "High", "color": "orange", "action": "Review safer alternate route"},
    "Low": {"level": "Moderate", "color": "yellow", "action": "Monitor weather impact"},
}

# Advisory threshold: generate for any city with risk >= 3 (catches even light drizzle/overcast+wind)
ADVISORY_THRESHOLD = 3


def _nearest_city(lat: float, lng: float) -> str:
    """Return the name of the nearest monitored city."""
    weather = get_all_weather()
    best, best_d = None, float("inf")
    for city, w in weather.items():
        d = ((w["lat"] - lat) ** 2 + (w["lng"] - lng) ** 2) ** 0.5
        if d < best_d:
            best, best_d = city, d
    return best or ""


def generate_weather_advisories(shipments: list) -> List[dict]:
    """
    For every active shipment, check weather at origin, current location,
    and destination. Generate an advisory if risk >= 20.
    Returns list of advisory dicts ready to merge into the alerts feed.
    """

    advisories = []
    weather = get_all_weather()
    if not weather:
        return []

    seen_ids = set()

    for s in shipments:
        status = s.status.value if hasattr(s.status, "value") else str(s.status)
        if status in ("Delivered",):
            continue

        mode = s.mode.value if hasattr(s.mode, "value") else str(s.mode)
        progress = getattr(s, "progress_pct", 0)

        # Check weather at origin, current position, and destination
        checks = []
        ow = get_city_weather(s.origin)
        dw = get_city_weather(s.destination)
        cw_name = _nearest_city(s.current_coords.lat, s.current_coords.lng)
        cw = weather.get(cw_name)

        if ow and ow["risk_score"] >= ADVISORY_THRESHOLD:
            checks.append(("origin", s.origin, ow))
        if dw and dw["risk_score"] >= ADVISORY_THRESHOLD:
            checks.append(("destination", s.destination, dw))
        if cw and cw["risk_score"] >= ADVISORY_THRESHOLD and cw_name not in (s.origin, s.destination):
            checks.append(("en-route", cw_name, cw))

        for loc_type, city, w in checks:
            adv_id = f"wx_{s.tracking_number}_{city}".replace(" ", "_")
            if adv_id in seen_ids:
                continue
            seen_ids.add(adv_id)

            sev_info = SEVERITY_MAP["High"] if w["risk_score"] >= 50 else SEVERITY_MAP["Moderate"] if w["risk_score"] >= 20 else SEVERITY_MAP["Low"]
            templates = ALT_ROUTE_TEMPLATES.get(mode, ALT_ROUTE_TEMPLATES["Sea"])
            # Pick template deterministically per shipment so it's stable
            idx = abs(hash(s.tracking_number + city)) % len(templates)
            alt_route = templates[idx]

            advisories.append({
                "id": adv_id,
                "type": "weather_route",
                "tracking_number": s.tracking_number,
                "shipment_id": s.id,
                "origin": s.origin,
                "destination": s.destination,
                "mode": mode,
                "affected_city": city,
                "location_type": loc_type,
                "weather_icon": w["icon"],
                "weather_desc": w["description"],
                "weather_temp": w["temp"],
                "weather_wind": w["wind"],
                "weather_precip": w["precip"],
                "weather_risk": w["risk_score"],
                "risk_level": w["risk_level"],
                "severity": sev_info["level"],
                "color": sev_info["color"],
                "action": sev_info["action"],
                "alt_route": alt_route,
                "progress_pct": progress,
                "acknowledged": False,
                "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
                "route": f"{s.origin} -> {s.destination}",
                "reason": f"{w['description']} in {city}",
                "recommended_action": f"{sev_info['action']}. Suggested reroute via {alt_route}.",
                "title": f"Shipment {s.tracking_number} - {w['risk_level']} risk due to weather in {city}",
                "message": (
                    f"{s.tracking_number}: {w['risk_level']} delay risk at {city} ({loc_type}) due to {w['description']}. "
                    f"Wind {w['wind']} km/h, precip {w['precip']} mm. Suggested reroute via {alt_route}."
                ),
            })

    # Sort by risk score descending
    advisories.sort(key=lambda x: -x["weather_risk"])
    return advisories
