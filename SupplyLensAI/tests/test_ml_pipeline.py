from ml.predict import load_model_bundle, predict_eta, predict_risk


def test_model_bundle_metrics_available():
    bundle = load_model_bundle()
    assert bundle["model_type"] == "logistic_regression"
    assert bundle["metrics"]["risk_auc"] > 0.6
    assert bundle["metrics"]["eta_mae_hours"] < 8


def test_prediction_outputs_are_well_formed():
    payload = {
        "delay_minutes": 15,
        "weather_risk": 0.2,
        "congestion_index": 0.25,
        "route_distance": 900,
        "cargo_type": "Electronics",
        "transport_mode": "Road",
        "carrier_performance": 0.9,
        "weight_kg": 1200,
        "scheduled_eta_hours": 14,
        "departure_time": "2026-04-08 09:00",
    }

    risk = predict_risk(payload)
    eta = predict_eta(payload)
    assert 0 <= risk["risk_score"] <= 1
    assert isinstance(risk["top_factors"], list)
    assert abs(sum(item["contribution"] for item in risk["contribution_scores"]) - 1.0) < 0.02
    assert eta["predicted_eta_hours"] > 0


def test_generated_dataset_has_balanced_low_risk_presence():
    from services.data_generator import generate_shipments
    from services.shipment_metrics import compute_monthly_trends

    shipments = generate_shipments(1000)
    low_risk = [shipment for shipment in shipments if shipment.risk_score < 0.25]
    on_time = [shipment for shipment in shipments if shipment.status.value == "On Time"]
    at_risk = [shipment for shipment in shipments if shipment.status.value == "At Risk"]
    delayed = [shipment for shipment in shipments if shipment.status.value == "Delayed"]
    critical = [shipment for shipment in shipments if shipment.status.value == "Critical"]

    assert len(low_risk) >= 30
    assert any(shipment.actual_arrival for shipment in shipments)
    assert 500 <= len(on_time) <= 600
    assert 150 <= len(at_risk) <= 220
    assert 150 <= len(delayed) <= 220
    assert 50 <= len(critical) <= 110

    trends = compute_monthly_trends(shipments)
    assert len(trends) == 6
    assert sum(1 for item in trends if item.on_time or item.delayed or item.critical) >= 4
