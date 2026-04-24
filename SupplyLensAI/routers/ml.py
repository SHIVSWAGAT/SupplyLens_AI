from fastapi import APIRouter, HTTPException

from models.schemas import PredictionRequest, PredictionResponse, ScenarioSimulationRequest
from ml.predict import load_model_bundle, predict_eta, predict_risk
from routers.shipments import get_current_shipments
from services.ml_service import simulate_scenario

router = APIRouter(prefix="/ml", tags=["ml"])


def _prepare_payload(payload: PredictionRequest) -> dict:
    data = payload.model_dump(mode="json")
    if not data.get("scheduled_eta_hours"):
        speed = {
            "Air": 750,
            "Sea": 32,
            "Road": 58,
            "Rail": 82,
        }.get(data["transport_mode"], 55)
        data["scheduled_eta_hours"] = max(data["route_distance"] / speed, 4.0)
    return data


@router.post("/predict-risk", response_model=PredictionResponse)
def predict_risk_route(payload: PredictionRequest):
    load_model_bundle()
    prediction = predict_risk(_prepare_payload(payload))
    return PredictionResponse(
        risk_score=prediction["risk_score"],
        confidence=prediction["confidence"],
        top_factors=prediction["top_factors"],
        contribution_scores=prediction["contribution_scores"],
        anomaly_score=prediction["anomaly_score"],
        anomaly_detected=prediction["anomaly_detected"],
        predicted_eta_hours=prediction["predicted_eta_hours"],
        model_version=prediction["model_version"],
    )


@router.post("/predict-eta", response_model=PredictionResponse)
def predict_eta_route(payload: PredictionRequest):
    load_model_bundle()
    prediction = predict_eta(_prepare_payload(payload))
    return PredictionResponse(
        risk_score=0.0,
        confidence=prediction["confidence"],
        top_factors=prediction["top_factors"],
        contribution_scores=prediction["contribution_scores"],
        predicted_eta_hours=prediction["predicted_eta_hours"],
        predicted_arrival=prediction["predicted_arrival"],
        model_version=prediction["model_version"],
    )


@router.post("/anomaly-detect")
def detect_anomaly(payload: PredictionRequest):
    prediction = predict_risk(_prepare_payload(payload))
    return {
        "anomaly_detected": prediction["anomaly_detected"],
        "anomaly_score": prediction["anomaly_score"],
        "top_factors": prediction["top_factors"],
        "contribution_scores": prediction["contribution_scores"],
    }


@router.post("/simulate-scenario")
def simulate_route_scenario(payload: ScenarioSimulationRequest):
    shipment = next((item for item in get_current_shipments() if item.id == payload.shipment_id), None)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return simulate_scenario(shipment, payload.model_dump(mode="json"))
