from __future__ import annotations

from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from ml.train import ARTIFACT_PATH, FEATURE_NAMES, train_and_save


def _feature_vector(payload: dict) -> np.ndarray:
    return np.asarray(
        [
            [
                float(payload.get("delay_minutes", 0.0) or 0.0),
                float(payload.get("weather_risk", 0.0) or 0.0),
                float(payload.get("congestion_index", 0.0) or 0.0),
                float(payload.get("route_distance", 120.0) or 120.0),
            ]
        ],
        dtype=float,
    )


@lru_cache(maxsize=1)
def load_model_bundle(path: str | Path = ARTIFACT_PATH):
    model_path = Path(path)
    if not model_path.exists():
        return train_and_save(model_path)
    bundle = joblib.load(model_path)
    if "model" not in bundle or "model_type" not in bundle:
        return train_and_save(model_path)
    return bundle


def _predict_delay_minutes(features: np.ndarray, risk_score: float) -> int:
    delay_minutes = float(features[0][0])
    weather_risk = float(features[0][1])
    congestion_index = float(features[0][2])
    route_distance = float(features[0][3])

    predicted = max(
        delay_minutes,
        (
            risk_score * 160.0
            + weather_risk * 55.0
            + congestion_index * 45.0
            + min(route_distance / 140.0, 70.0)
        ),
    )
    return max(0, int(round(predicted)))


def _confidence(risk_score: float) -> float:
    return round(min(0.98, 0.55 + abs(risk_score - 0.5) * 0.8), 4)


def _explain(bundle: dict, features: np.ndarray) -> tuple[list[str], list[dict]]:
    model = bundle["model"]
    scaler = model.named_steps["scaler"]
    classifier = model.named_steps["classifier"]

    scaled = scaler.transform(features)[0]
    coefficients = classifier.coef_[0]
    raw_scores = [
        {
            "factor": name.replace("_", " ").title(),
            "raw_contribution": float(abs(value * coefficient)),
            "direction": "increases risk" if (value * coefficient) >= 0 else "reduces risk",
        }
        for name, value, coefficient in zip(FEATURE_NAMES, scaled, coefficients)
    ]
    total_contribution = sum(item["raw_contribution"] for item in raw_scores)
    if total_contribution <= 0:
        normalized_scores = [
            {
                "factor": item["factor"],
                "contribution": round(1 / len(raw_scores), 4),
                "direction": item["direction"],
            }
            for item in raw_scores
        ]
    else:
        normalized_scores = [
            {
                "factor": item["factor"],
                "contribution": round(item["raw_contribution"] / total_contribution, 4),
                "direction": item["direction"],
            }
            for item in raw_scores
        ]

    ranked = sorted(normalized_scores, key=lambda item: item["contribution"], reverse=True)
    top_factors = [item["factor"] for item in ranked[:3]]
    contribution_scores = [
        {
            "factor": item["factor"],
            "contribution": item["contribution"],
        }
        for item in ranked
    ]
    return top_factors, contribution_scores


def predict_risk(payload: dict) -> dict:
    bundle = load_model_bundle()
    features = _feature_vector(payload)
    model = bundle["model"]
    risk_score = float(model.predict_proba(features)[0][1])
    top_factors, contribution_scores = _explain(bundle, features)
    predicted_delay_minutes = _predict_delay_minutes(features, risk_score)
    scheduled_eta_hours = float(payload.get("scheduled_eta_hours") or 4.0)

    escalation_flag = bool(
        risk_score >= 0.85
        or float(payload.get("delay_minutes", 0.0) or 0.0) >= 240
        or (
            float(payload.get("weather_risk", 0.0) or 0.0) >= 0.85
            and float(payload.get("congestion_index", 0.0) or 0.0) >= 0.75
        )
    )

    return {
        "risk_score": round(risk_score, 4),
        "confidence": _confidence(risk_score),
        "predicted_delay_minutes": predicted_delay_minutes,
        "predicted_eta_hours": round(scheduled_eta_hours + (predicted_delay_minutes / 60.0), 2),
        "anomaly_score": round(risk_score if escalation_flag else 0.0, 4),
        "anomaly_detected": escalation_flag,
        "top_factors": top_factors,
        "contribution_scores": contribution_scores,
        "metrics": bundle["metrics"],
        "model_version": bundle["trained_at"],
    }


def predict_eta(payload: dict) -> dict:
    prediction = predict_risk(payload)
    predicted_eta_hours = float(prediction["predicted_eta_hours"])
    departure_time = payload.get("departure_time")
    predicted_arrival = None
    if departure_time:
        try:
            departure = datetime.fromisoformat(str(departure_time).replace(" ", "T"))
            predicted_arrival = (departure + timedelta(hours=predicted_eta_hours)).strftime("%Y-%m-%d %H:%M")
        except ValueError:
            predicted_arrival = None

    return {
        "predicted_eta_hours": round(predicted_eta_hours, 2),
        "predicted_arrival": predicted_arrival,
        "confidence": prediction["confidence"],
        "top_factors": prediction["top_factors"],
        "contribution_scores": prediction["contribution_scores"],
        "model_version": prediction["model_version"],
    }
