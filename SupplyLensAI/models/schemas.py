from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    CRITICAL = "Critical"


class AlertSeverity(str, Enum):
    INFO = "Info"
    WARNING = "Warning"
    CRITICAL = "Critical"


class TransportMode(str, Enum):
    ROAD = "Road"
    AIR = "Air"
    SEA = "Sea"
    RAIL = "Rail"


class ShipmentStatus(str, Enum):
    ON_TIME = "On Time"
    DELAYED = "Delayed"
    AT_RISK = "At Risk"
    DELIVERED = "Delivered"
    CRITICAL = "Critical"


class Coordinates(BaseModel):
    lat: float
    lng: float


class Waypoint(BaseModel):
    name: str
    lat: float
    lng: float
    eta: Optional[str] = None
    status: Optional[str] = "pending"

class RouteOption(BaseModel):
    id: str
    label: str
    description: str
    distance_km: float
    estimated_hours: float
    cost_usd: float
    risk_score: float
    confidence: float
    waypoints: List[Waypoint]
    tags: List[str] = Field(default_factory=list)


class FactorContribution(BaseModel):
    factor: str
    contribution: float


class MLPrediction(BaseModel):
    model_config = {"protected_namespaces": ()}
    risk_score: float
    confidence: float
    predicted_delay_minutes: int = 0
    predicted_eta: Optional[str] = None
    anomaly_score: float = 0.0
    anomaly_detected: bool = False
    top_factors: List[str] = Field(default_factory=list)
    contribution_scores: List[FactorContribution] = Field(default_factory=list)
    model_version: str = "untrained"


class Shipment(BaseModel):
    id: str
    tracking_number: str
    origin: str
    destination: str
    origin_coords: Coordinates
    destination_coords: Coordinates
    current_coords: Coordinates
    carrier: str
    mode: TransportMode
    status: ShipmentStatus
    risk_level: RiskLevel
    risk_score: float
    baseline_risk_score: Optional[float] = None
    departure_time: str
    estimated_arrival: str
    actual_arrival: Optional[str] = None
    delay_minutes: int = 0
    cargo_type: str
    weight_kg: float
    customer: str
    disruption_reason: Optional[str] = None
    route_options: List[RouteOption] = Field(default_factory=list)
    progress_pct: float = 0.0
    ml_prediction: Optional[MLPrediction] = None


class Alert(BaseModel):
    id: str
    shipment_id: str
    tracking_number: str
    severity: AlertSeverity
    risk_level: RiskLevel = RiskLevel.MODERATE
    title: str
    message: str
    root_cause: str
    reason: str = ""
    route: str = ""
    affected_city: str = ""
    recommended_action: str = ""
    timestamp: str
    acknowledged: bool = False
    region: str
    carrier: str

class KPIMetrics(BaseModel):
    total_shipments: int
    on_time_pct: float
    delayed_shipments: int
    critical_shipments: int
    avg_delay_minutes: float
    cost_savings_usd: float
    eta_accuracy_pct: float
    disruptions_prevented: int
    active_alerts: int


class RegionDisruption(BaseModel):
    region: str
    count: int
    severity: str


class CarrierPerformance(BaseModel):
    carrier: str
    on_time_pct: float
    total_shipments: int
    on_time_shipments: int = 0
    delayed_shipments: int = 0
    avg_delay: float
    risk_score: float


class MonthlyTrend(BaseModel):
    month: str
    on_time: int
    delayed: int
    critical: int


class RouteOptimizeRequest(BaseModel):
    origin: str
    destination: str
    cargo_type: str = "General"
    weight_kg: float = 1000
    priority: str = "balanced"


class DisruptionAnalysis(BaseModel):
    shipment_id: str
    risk_score: float
    risk_level: RiskLevel
    factors: List[dict]
    recommendations: List[str]
    confidence: float


class PredictionRequest(BaseModel):
    delay_minutes: float = 0
    weather_risk: float = Field(default=0.0, ge=0.0, le=1.0)
    congestion_index: float = Field(default=0.0, ge=0.0, le=1.0)
    route_distance: float = Field(default=100.0, gt=0)
    cargo_type: str = "General"
    transport_mode: str = "Road"
    carrier_performance: float = Field(default=0.8, ge=0.0, le=1.0)
    weight_kg: float = Field(default=1000.0, gt=0)
    scheduled_eta_hours: Optional[float] = Field(default=None, gt=0)
    departure_time: Optional[str] = None


class PredictionResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    risk_score: float
    confidence: float
    top_factors: List[str] = Field(default_factory=list)
    contribution_scores: List[FactorContribution] = Field(default_factory=list)
    anomaly_score: Optional[float] = None
    anomaly_detected: Optional[bool] = None
    predicted_eta_hours: Optional[float] = None
    predicted_arrival: Optional[str] = None
    model_version: str


class ScenarioSimulationRequest(BaseModel):
    shipment_id: str
    weather_delta: float = Field(default=0.0, ge=-1.0, le=1.0)
    congestion_delta: float = Field(default=0.0, ge=-1.0, le=1.0)
    delay_delta_minutes: float = Field(default=0.0, ge=-720, le=720)
