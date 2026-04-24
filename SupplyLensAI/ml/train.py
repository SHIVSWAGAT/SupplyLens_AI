from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import random
import sys

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import mean_absolute_error, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from services.data_generator import generate_shipments
from services.platform_store import load_shipments
from services.shipment_metrics import shipment_delay_minutes


ARTIFACT_PATH = Path(__file__).resolve().parent / "model.pkl"
FEATURE_NAMES = ["delay_minutes", "weather_risk", "congestion_index", "route_distance"]


def _route_distance(shipment) -> float:
    lat_distance = abs(shipment.origin_coords.lat - shipment.destination_coords.lat) * 111
    lng_distance = abs(shipment.origin_coords.lng - shipment.destination_coords.lng) * 85
    return max(lat_distance + lng_distance, 120.0)


def _weather_risk(shipment) -> float:
    text = " ".join(
        [
            str(shipment.disruption_reason or ""),
            str(shipment.status.value if hasattr(shipment.status, "value") else shipment.status),
        ]
    ).lower()
    score = float(shipment.risk_score or 0) * 0.55
    if any(token in text for token in ["storm", "rain", "flood", "weather", "wind", "snow", "fog"]):
        score += 0.3
    if any(token in text for token in ["critical", "delayed"]):
        score += 0.08
    return round(min(1.0, max(0.0, score)), 4)


def _congestion_index(shipment, weather_risk: float) -> float:
    text = str(shipment.disruption_reason or "").lower()
    score = (
        min(float(shipment.delay_minutes or 0) / 240.0, 1.0) * 0.55
        + min(float(shipment.progress_pct or 0) / 100.0, 1.0) * 0.1
        + weather_risk * 0.18
        + min(float(shipment.risk_score or 0), 1.0) * 0.17
    )
    if any(token in text for token in ["congestion", "traffic", "hub", "port", "terminal", "capacity"]):
        score += 0.18
    return round(min(1.0, max(0.0, score)), 4)


def _delay_target(shipment) -> int:
    return max(0, int(shipment_delay_minutes(shipment)))


def _delayed_label(shipment, delay_minutes: int) -> int:
    status = shipment.status.value if hasattr(shipment.status, "value") else str(shipment.status)
    if delay_minutes >= 30:
        return 1
    if status in {"Delayed", "Critical"}:
        return 1
    return 0


def _shipment_rows(shipments: list) -> tuple[list[dict], np.ndarray, np.ndarray]:
    rows: list[dict] = []
    y_delay_flag: list[int] = []
    y_delay_minutes: list[int] = []

    for shipment in shipments:
        weather_risk = _weather_risk(shipment)
        delay_minutes = _delay_target(shipment)
        row = {
            "delay_minutes": float(delay_minutes),
            "weather_risk": weather_risk,
            "congestion_index": _congestion_index(shipment, weather_risk),
            "route_distance": round(_route_distance(shipment), 2),
        }
        rows.append(row)
        y_delay_flag.append(_delayed_label(shipment, delay_minutes))
        y_delay_minutes.append(delay_minutes)

    return rows, np.asarray(y_delay_flag, dtype=int), np.asarray(y_delay_minutes, dtype=float)


def _load_training_shipments(limit: int = 1200) -> list:
    try:
        shipments = load_shipments()
    except Exception:
        shipments = []

    if len(shipments) < 200:
        shipments = generate_shipments(max(600, limit // 2))

    rng = random.Random(20260409)
    if len(shipments) > limit:
        shipments = rng.sample(shipments, limit)
    return shipments


def _predicted_delay_minutes_from_probability(features: np.ndarray, probabilities: np.ndarray) -> np.ndarray:
    delay_minutes = features[:, 0]
    weather_risk = features[:, 1]
    congestion_index = features[:, 2]
    route_distance = features[:, 3]

    return np.maximum(
        delay_minutes,
        (
            probabilities * 160.0
            + weather_risk * 55.0
            + congestion_index * 45.0
            + np.minimum(route_distance / 140.0, 70.0)
        ),
    )


def train_and_save(artifact_path: Path = ARTIFACT_PATH) -> dict:
    shipments = _load_training_shipments()
    rows, y_risk, y_delay_minutes = _shipment_rows(shipments)
    features = np.asarray([[row[name] for name in FEATURE_NAMES] for row in rows], dtype=float)

    x_train, x_test, y_train, y_test, delay_train, delay_test = train_test_split(
        features,
        y_risk,
        y_delay_minutes,
        test_size=0.2,
        random_state=42,
        stratify=y_risk if len(set(y_risk.tolist())) > 1 else None,
    )

    model = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(max_iter=1000, random_state=42)),
        ]
    )
    model.fit(x_train, y_train)

    probabilities = model.predict_proba(x_test)[:, 1]
    predicted_delays = _predicted_delay_minutes_from_probability(x_test, probabilities)
    risk_auc = roc_auc_score(y_test, probabilities) if len(set(y_test.tolist())) > 1 else 0.5
    eta_mae_hours = mean_absolute_error(delay_test / 60.0, predicted_delays / 60.0)

    bundle = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "model_type": "logistic_regression",
        "features": FEATURE_NAMES,
        "model": model,
        "metrics": {
            "risk_auc": round(float(risk_auc), 4),
            "eta_mae_hours": round(float(eta_mae_hours), 4),
        },
        "training_rows": int(len(rows)),
        "positive_rate": round(float(y_risk.mean()), 4),
    }
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, artifact_path)
    return bundle


if __name__ == "__main__":
    trained = train_and_save()
    print(f"Saved model to {ARTIFACT_PATH}")
    print(trained["metrics"])
