import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import jwt

from config import get_settings


@dataclass(frozen=True)
class UserRecord:
    user_id: str
    password: str
    role: str
    name: str
    carrier_scope: Optional[str] = None


PAGE_ACCESS: Dict[str, List[str]] = {
    "admin": [
        "dashboard",
        "live_map",
        "shipments",
        "alerts",
        "analytics",
        "new_consignment",
    ],
    "super_user": [
        "dashboard",
        "live_map",
        "shipments",
        "alerts",
        "analytics",
        "new_consignment",
    ],
    "carrier_manager": [
        "dashboard",
        "live_map",
        "shipments",
        "alerts",
        "analytics",
        "new_consignment",
    ],
    "field_supervisor": [
        "dashboard",
        "live_map",
        "shipments",
        "alerts",
        "new_consignment",
    ],
    "normal_user": [
        "dashboard",
        "live_map",
        "shipments",
        "alerts",
    ],
}

ACTION_ACCESS: Dict[str, List[str]] = {
    "admin": ["view", "track", "optimize_route", "create_consignment", "delete_shipment", "acknowledge_alerts", "refresh_weather"],
    "super_user": ["view", "track", "optimize_route", "create_consignment", "delete_shipment", "acknowledge_alerts", "refresh_weather"],
    "carrier_manager": ["view", "track", "optimize_route", "create_consignment", "delete_shipment", "acknowledge_alerts"],
    "field_supervisor": ["view", "track", "optimize_route", "create_consignment", "delete_shipment", "acknowledge_alerts"],
    "normal_user": ["view", "track", "optimize_route"],
}

ROLE_LABELS = {
    "admin": "Admin",
    "super_user": "Super User",
    "carrier_manager": "Carrier Manager",
    "field_supervisor": "Field Supervisor",
    "normal_user": "Normal User",
}

USERS: Dict[str, UserRecord] = {
    "admin": UserRecord("admin", "admin123", "admin", "Ava Admin"),
    "superuser": UserRecord("superuser", "super123", "super_user", "Sanjay Super User"),
    "carrier": UserRecord("carrier", "carrier123", "carrier_manager", "Mira Carrier Manager", carrier_scope="DHL"),
    "field": UserRecord("field", "field123", "field_supervisor", "Noah Field Supervisor"),
    "user": UserRecord("user", "user123", "normal_user", "Nina User"),
}

_REVOKED_TOKENS: set[str] = set()


def _build_permissions(role: str) -> dict:
    return {
        "pages": PAGE_ACCESS.get(role, []),
        "actions": ACTION_ACCESS.get(role, []),
    }


def sanitize_user(user: UserRecord) -> dict:
    return {
        "user_id": user.user_id,
        "name": user.name,
        "role": user.role,
        "role_label": ROLE_LABELS.get(user.role, user.role.title()),
        "carrier_scope": user.carrier_scope,
        "permissions": _build_permissions(user.role),
    }


def authenticate(user_id: str, password: str) -> Optional[dict]:
    user = USERS.get(user_id.strip().lower())
    if not user or user.password != password:
        return None

    settings = get_settings()
    token = jwt.encode(
        {
            "sub": user.user_id,
            "role": user.role,
            "jti": secrets.token_urlsafe(12),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_exp_minutes),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return {
        "token": token,
        "user": sanitize_user(user),
    }


def get_user_by_token(token: str) -> Optional[dict]:
    if not token:
        return None

    if token in _REVOKED_TOKENS:
        return None

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None

    user = USERS.get(str(payload.get("sub", "")).lower())
    if not user:
        return None

    return sanitize_user(user)


def revoke_token(token: str):
    if token:
        _REVOKED_TOKENS.add(token)


def list_demo_users() -> List[dict]:
    password_hints = {
        "admin": "admin123",
        "superuser": "super123",
        "carrier": "carrier123",
        "field": "field123",
        "user": "user123",
    }
    demo_users = []
    for user in USERS.values():
        data = sanitize_user(user)
        data["password_hint"] = password_hints.get(user.user_id, "")
        demo_users.append(data)
    return demo_users


def get_demo_users() -> List[dict]:
    return [sanitize_user(user) for user in USERS.values()]


def is_authorized(path: str, method: str, role: str) -> bool:
    consignment_roles = {"admin", "super_user", "carrier_manager", "field_supervisor"}
    alert_roles = {"admin", "super_user", "carrier_manager", "field_supervisor"}
    weather_refresh_roles = {"admin", "super_user"}

    if path == "/api/shipments/create" and method.upper() == "POST":
        return role in consignment_roles

    if path.startswith("/api/shipments/") and method.upper() == "DELETE":
        return role in consignment_roles

    if path.startswith("/api/alerts/") and method.upper() == "POST":
        return role in alert_roles

    if path == "/api/weather/refresh" and method.upper() == "POST":
        return role in weather_refresh_roles

    return role in PAGE_ACCESS
