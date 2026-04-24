from __future__ import annotations

import math
from typing import Iterable

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


NUMERIC_FEATURES = [
    "delay_minutes",
    "weather_risk",
    "congestion_index",
    "route_distance",
    "carrier_performance",
    "weight_kg",
    "scheduled_eta_hours",
    "delay_ratio",
    "weather_congestion_pressure",
    "mode_distance_pressure",
]

CATEGORICAL_FEATURES = [
    "cargo_type",
    "transport_mode",
]


def _speed_for_mode(mode: str) -> float:
    return {
        "Air": 750.0,
        "Sea": 33.0,
        "Road": 62.0,
        "Rail": 85.0,
    }.get(str(mode), 55.0)


def _hazard_index(cargo_type: str) -> float:
    cargo = str(cargo_type).lower()
    if "pharma" in cargo or "chemical" in cargo:
        return 1.0
    if "food" in cargo or "perish" in cargo:
        return 0.75
    if "electronics" in cargo or "machinery" in cargo:
        return 0.45
    return 0.25


def build_feature_frame(records: Iterable[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(list(records)).copy()
    if frame.empty:
        frame = pd.DataFrame(columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES)

    for column in [
        "delay_minutes",
        "weather_risk",
        "congestion_index",
        "route_distance",
        "carrier_performance",
        "weight_kg",
        "scheduled_eta_hours",
    ]:
        if column not in frame:
            frame[column] = 0.0

    for column in ["cargo_type", "transport_mode"]:
        if column not in frame:
            frame[column] = "Unknown"

    frame["delay_minutes"] = pd.to_numeric(frame["delay_minutes"], errors="coerce").fillna(0.0)
    frame["weather_risk"] = pd.to_numeric(frame["weather_risk"], errors="coerce").fillna(0.0).clip(0, 1)
    frame["congestion_index"] = pd.to_numeric(frame["congestion_index"], errors="coerce").fillna(0.0).clip(0, 1)
    frame["route_distance"] = pd.to_numeric(frame["route_distance"], errors="coerce").fillna(1.0).clip(lower=1.0)
    frame["carrier_performance"] = pd.to_numeric(frame["carrier_performance"], errors="coerce").fillna(0.75).clip(0, 1)
    frame["weight_kg"] = pd.to_numeric(frame["weight_kg"], errors="coerce").fillna(1000.0).clip(lower=1.0)
    frame["scheduled_eta_hours"] = pd.to_numeric(frame["scheduled_eta_hours"], errors="coerce").fillna(
        frame["route_distance"] / frame["transport_mode"].map(_speed_for_mode).fillna(55.0)
    )
    frame["hazard_index"] = frame["cargo_type"].map(_hazard_index).fillna(0.25)
    frame["delay_ratio"] = frame["delay_minutes"] / frame["scheduled_eta_hours"].clip(lower=1.0)
    frame["weather_congestion_pressure"] = frame["weather_risk"] * frame["congestion_index"]
    frame["mode_distance_pressure"] = frame["route_distance"] / frame["transport_mode"].map(_speed_for_mode).fillna(55.0)
    frame["mode_distance_pressure"] = frame["mode_distance_pressure"].apply(lambda value: math.log1p(max(value, 0)))
    return frame


def build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    steps=[
                        ("scaler", StandardScaler()),
                    ]
                ),
                NUMERIC_FEATURES,
            ),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                CATEGORICAL_FEATURES,
            ),
        ],
        remainder="drop",
    )
