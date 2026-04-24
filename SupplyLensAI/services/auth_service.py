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

DEMO_USER_PROFILES = {
    "admin": {"role": "admin", "name": "Ava Admin", "carrier_scope": None},
    "superuser": {"role": "super_user", "name": "Sanjay Super User", "carrier_scope": None},
    "carrier": {"role": "carrier_manager", "name": "Mira Carrier Manager", "carrier_scope": "DHL"},
    "field": {"role": "field_supervisor", "name": "Noah Field Supervisor", "carrier_scope": None},
    "user": {"role": "normal_user", "name": "Nina User", "carrier_scope": None},
}

DEMO_PASSWORD_ENV_VARS = {
    "admin": "DEMO_ADMIN_PASSWORD",
    "superuser": "DEMO_SUPERUSER_PASSWORD",
    "carrier": "DEMO_CARRIER_PASSWORD",
    "field": "DEMO_FIELD_PASSWORD",
    "user": "DEMO_USER_PASSWORD",
}

_REVOKED_TOKENS: set[str] = set()


def _demo_users() -> Dict[str, UserRecord]:
    settings = get_settings()
    configured_passwords = {
        "admin": settings.demo_admin_password,
        "superuser": settings.demo_superuser_password,
        "carrier": settings.demo_carrier_password,
        "field": settings.demo_field_password,
        "user": settings.demo_user_password,
    }

    return {
        user_id: UserRecord(
            user_id=user_id,
            password=configured_passwords.get(user_id, ""),
            role=profile["role"],
            name=profile["name"],
            carrier_scope=profile["carrier_scope"],
        )
        for user_id, profile in DEMO_USER_PROFILES.items()
    }


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
    user = _demo_users().get(user_id.strip().lower())
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

    user = _demo_users().get(str(payload.get("sub", "")).lower())
    if not user:
        return None

    return sanitize_user(user)


def revoke_token(token: str):
    if token:
        _REVOKED_TOKENS.add(token)


def list_demo_users() -> List[dict]:
    settings = get_settings()
    demo_users = []
    for user in _demo_users().values():
        data = sanitize_user(user)
        if settings.show_demo_password_hints and user.password:
            data["password_hint"] = user.password
        demo_users.append(data)
    return demo_users


def get_demo_users() -> List[dict]:
    return [sanitize_user(user) for user in _demo_users().values()]


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
